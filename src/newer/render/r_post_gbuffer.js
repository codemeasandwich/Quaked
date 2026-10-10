/**
 * @module newer/render/r_post_gbuffer
 *
 * The post pipeline's G-buffer stage (card [44h], split from gl_post.js): the emissive glow of fullbright and lava
 * materials, and surface detail (generated normal maps, parallax) with the patch that has every material drawn into
 * the HDR target write its normal, distance and unlit colour.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 4 module-level collections (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its patch on `THREE.Material.prototype.onBeforeCompile` is installed by `R_PostInstallGBufferPatch`, from `R_Init`
 * and `R_PostBegin` (it ran as the module loaded until [44g], debt D10).
 */
import * as THREE from 'three';
import { postState, lightCurve, lightingLook, classicLook } from './r_post_state.js';
import { EMISSIVE_BOOST, LAVA_BOOST, LAVA_PULSE } from './r_post_config.js';
import { heightShadowUniforms, HEIGHT_SHADOW_GLSL } from './r_heightshadows.js';
import { R_PatchRockShader, ROCK_PARALLAX_GLSL, ROCK_NORMAL_GLSL } from './r_rockshader.js';
import { R_NormalPrepare, R_NormalPreparationNeeded } from '../assets/normal_prepare.js';
import { R_NormalMapFor } from './gl_normals.js';

//============================================================================
// Emissive materials
//============================================================================

const glowMaterials = new Set();
function applyGlow( material, boost ) {

	if ( material.emissive !== undefined ) {

		material.emissiveIntensity = postState.glowActive ? boost : 1;

	} else if ( material.color !== undefined ) {

		material.color.setScalar( postState.glowActive ? boost : 1 );

	}

}

/**
 * Marks a material as light emitting: it is boosted above white while the HDR pipeline is running (its
 * `emissiveIntensity`, or its colour when it has no emissive). Called as world, sky and level-view materials are
 * made (gl_rsurf.js, r_levelview.js). Lava materials (boost `LAVA_BOOST`) also pulse slowly. The native tint is
 * kept in `userData.classicGlowColor` for the isolated classic demo material. The material stays registered until
 * it is disposed.
 *
 * @param {THREE.Material} material the material; mutated (`userData.glowBoost`, `baseGlowBoost`, colour/emissive)
 * @param {number} [boost=EMISSIVE_BOOST] HDR multiplier while lit (4.5 for fullbright texels; see
 *   `R_GlowBoostForTexture`)
 */
export function R_RegisterGlow( material, boost = EMISSIVE_BOOST ) {

	material.userData.glowBoost = boost;
	material.userData.baseGlowBoost = boost;
	// Keep the native tint for the isolated classic demo material.
	if ( material.color && material.userData.classicGlowColor === undefined )
		material.userData.classicGlowColor = material.color.toArray();
	applyGlow( material, boost );
	glowMaterials.add( material );
	if ( boost === LAVA_BOOST ) lavaMaterials.add( material );
	material.addEventListener( 'dispose', () => {

		glowMaterials.delete( material );
		lavaMaterials.delete( material );

	} );

}

// lava materials, whose glow slowly swells and fades
const lavaMaterials = new Set();

/**
 * Swells and fades the lava materials' glow, once a frame from `R_PostFinish`.
 *
 * @param {number} seconds the page clock, in seconds
 */
export function pulseLava( seconds ) {

	const pulse = 1 + LAVA_PULSE * Math.sin( seconds * 1.6 ) + LAVA_PULSE * 0.5 * Math.sin( seconds * 4.3 + 1.3 );
	for ( const m of lavaMaterials ) {

		m.userData.glowBoost = LAVA_BOOST * pulse;
		applyGlow( m, m.userData.glowBoost );

	}

}

/**
 * The glow boost a liquid surface's material registers with (gl_rsurf.js, as the material is made).
 *
 * @param {string} name texture name, e.g. '*lava1' (case-insensitive)
 * @returns {number} 6 (`LAVA_BOOST`) for '*lava…', 1.5 for '*slime…', otherwise 1 (no glow)
 */
export function R_GlowBoostForTexture( name ) {

	const n = name.toLowerCase();
	if ( n.indexOf( '*lava' ) === 0 ) return LAVA_BOOST;
	if ( n.indexOf( '*slime' ) === 0 ) return 1.5;
	return 1;

}

/**
 * Turns the emissive boost of every registered glowing material on or off (`postState.glowActive`), from
 * `R_PostBegin` as advanced lighting comes and goes.
 *
 * @param {boolean} active whether advanced lighting is on this frame
 */
export function setGlowActive( active ) {

	if ( active === postState.glowActive ) return;
	postState.glowActive = active;
	for ( const m of glowMaterials )
		applyGlow( m, m.userData.glowBoost );

}

/**
 * Turns surface relief on or off for every registered material (`postState.detailActive`), from `R_PostBegin`.
 *
 * @param {boolean} active whether relief is drawn this frame
 */
export function setDetailActive( active ) {

	if ( active === postState.detailActive ) return;
	postState.detailActive = active;
	for ( const m of detailMaterials ) applyDetail( m );

}

//============================================================================
// Surface detail: generated normal maps, parallax and the normal G-buffer
//============================================================================

const detailMaterials = new Set();

const PARALLAX_DEPTH = 0.02; // in texture tiles
const PARALLAX_LAYERS = 10;

// Parallax: shift the texture lookups along the view ray by the height stored in
// the normal map's alpha, so bricks stand proud of the mortar and shift as you
// move.  Runs only when the independently switched normal map is attached.
const PARALLAX_GLSL = `
#ifdef USE_NORMALMAP
vec2 pUv = vMapUv;
{
	vec3 pq0 = dFdx( - vViewPosition );
	vec3 pq1 = dFdy( - vViewPosition );
	vec2 pst0 = dFdx( vMapUv );
	vec2 pst1 = dFdy( vMapUv );
	vec3 pN = normalize( cross( pq0, pq1 ) );
	vec3 pq1p = cross( pq1, pN );
	vec3 pq0p = cross( pN, pq0 );
	vec3 pT = pq1p * pst0.x + pq0p * pst1.x;
	vec3 pB = pq1p * pst0.y + pq0p * pst1.y;
	float pdet = max( dot( pT, pT ), dot( pB, pB ) );
	float pscale = pdet == 0.0 ? 0.0 : inversesqrt( pdet );
	vec3 pV = normalize( vViewPosition );
	vec3 pVt = vec3( dot( pV, pT * pscale ), dot( pV, pB * pscale ), dot( pV, pN ) );

	float pAmt = ( 1.0 - uClassic ) * ${PARALLAX_DEPTH} * ( 1.0 - smoothstep( 260.0, 820.0, length( vViewPosition ) ) ) * mix( 0.3, 1.0, smoothstep( 30.0, 150.0, length( vViewPosition ) ) );
	if ( pAmt > 0.0005 ) {
		const float LAYERS = ${PARALLAX_LAYERS}.0;
		vec2 P = pVt.xy / max( abs( pVt.z ), 0.35 ) * pAmt;
		vec2 dUv = P / LAYERS;
		vec2 gx = dFdx( vMapUv );
		vec2 gy = dFdy( vMapUv );
		float layer = 1.0 / LAYERS;
		float cur = 0.0;
		vec2 uv = vMapUv;
		float depthHere = 1.0 - textureGrad( normalMap, uv, gx, gy ).a;
		for ( int i = 0; i < ${PARALLAX_LAYERS}; i ++ ) {
			if ( cur >= depthHere ) break;
			uv -= dUv;
			depthHere = 1.0 - textureGrad( normalMap, uv, gx, gy ).a;
			cur += layer;
		}
		vec2 prev = uv + dUv;
		float after = depthHere - cur;
		float before = ( 1.0 - textureGrad( normalMap, prev, gx, gy ).a ) - cur + layer;
		float w = after / ( after - before + 1e-5 );
		pUv = mix( uv, prev, clamp( w, 0.0, 1.0 ) );
	}
}
#endif
`;

// Retain the surface normal/distance and unlit diffuse colour in the scene's
// normal and albedo attachments. The compositor lights the original material.
function patchDetailShader( shader ) {

	const thisMaterial = this;
	let f = shader.fragmentShader;

	f = 'layout(location = 1) out highp vec4 gNormal;\nlayout(location = 2) out highp vec4 gAlbedo;\nlayout(location = 3) out highp vec4 gHeightMask;\nuniform float uLmGamma;\nuniform float uLighting;\nuniform float uClassic;\n' + f;
	shader.uniforms.uLmGamma = lightCurve;
	shader.uniforms.uLighting = lightingLook;
	shader.uniforms.uClassic = classicLook;
	// Average one-texel pigment grain while retaining authored two-texel features.
	// Four texels forced mip 2 even close up, hiding most of a 4x replacement's
	// added detail. Keep the source, native UVs, normal/height sampling and Classic
	// untouched; larger screen footprints still select their natural mip levels.
	shader.uniforms.uPigmentMinFootprint = { get value() { return thisMaterial.userData.detailDiffuse?.userData.newerPicture ? 2 : 0; } };
	Object.assign( shader.uniforms, heightShadowUniforms );
	shader.uniforms.uHasHeightShadow = { get value() { return thisMaterial.normalMap?.userData.heightSource ? 1 : 0; } };

	// the baked light, curved: only what a source really lights stays bright
	f = f.replace( '#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace(
		'lightMapTexel.rgb * lightMapIntensity', 'pow( max( lightMapTexel.rgb, vec3( 0.0 ) ), vec3( mix( uLmGamma, 1.0, uClassic ) ) ) * lightMapIntensity' ) );

	// texture lookups follow the parallax-shifted coordinates
	const rock = this.userData.rockField === true;
	const reference = this.normalMap?.userData.referenceHeight;
	const relief = this.normalMap?.userData.surfaceRelief;
 const glass = this.normalMap?.userData.glassGloss;
	if ( reference ) {

		shader.uniforms.uCarveReference = this.userData.carveUniforms.uCarveReference;
		shader.uniforms.uCarveReferenceUV = this.userData.carveUniforms.uCarveReferenceUV;
		f = 'uniform sampler2D uCarveReference;\nuniform vec4 uCarveReferenceUV;\n' + f;

	}
	let parallax = rock ? ROCK_PARALLAX_GLSL + PARALLAX_GLSL.replace( /vMapUv/g, 'qrRockBaseUv' )
  .replace( 'vec2 pUv = qrRockBaseUv;', 'vec2 pUv = vMapUv + qrRockUvShift + qrRockBandOffset(qrRockQ);' )
  .replace( 'vec2 uv = qrRockBaseUv;', 'vec2 uv = pUv;' ) : PARALLAX_GLSL;
	if ( this.userData.realDisplacement ) parallax = '#ifdef USE_NORMALMAP\nvec2 pUv = vMapUv;\n#endif\n';
	if ( relief && ! reference ) {

		parallax = parallax.replace( `* ${PARALLAX_DEPTH} *`, `* ${relief.depth} *` )
			.replace( `const float LAYERS = ${PARALLAX_LAYERS}.0;`, `const float LAYERS = ${relief.layers}.0;` )
			.replace( `i < ${PARALLAX_LAYERS}`, `i < ${relief.layers}` );

	}
	if ( reference ) {

		// March the original wall depth plus a deeper virtual cut. Multiplying
		// the entire parallax amount would also displace the surrounding grain.
		const depth = uv => `( 1.0 - textureGrad( uCarveReference, fract( ${uv} ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw, gx * uCarveReferenceUV.xy, gy * uCarveReferenceUV.xy ).a + 8.0 * max( 0.0, textureGrad( uCarveReference, fract( ${uv} ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw, gx * uCarveReferenceUV.xy, gy * uCarveReferenceUV.xy ).a - textureGrad( normalMap, ${uv}, gx, gy ).a ) )`;
		parallax = parallax.replace( `const float LAYERS = ${PARALLAX_LAYERS}.0;`, 'const float LAYERS = 60.0;' )
			.replace( 'vec2 dUv = P / LAYERS;', 'vec2 dUv = P * 6.0 / LAYERS;' )
			.replace( 'float layer = 1.0 / LAYERS;', 'float layer = 6.0 / LAYERS;' )
			.replace( `i < ${PARALLAX_LAYERS}`, 'i < 60' )
			.replaceAll( '1.0 - textureGrad( normalMap, uv, gx, gy ).a', depth( 'uv' ) )
			.replaceAll( '1.0 - textureGrad( normalMap, prev, gx, gy ).a', depth( 'prev' ) );

	}
	let pigment = `
 #ifdef USE_MAP
 vec2 qrPigmentDx=dFdx(vMapUv),qrPigmentDy=dFdy(vMapUv);
 vec2 qrPigmentSize=vec2(textureSize(map,0));
 // Enforce both footprint axes: widening only the larger derivative leaves
 // black grain resolved along the minor axis on angled walls.
 vec2 qrPigmentFootprint=vec2(length(qrPigmentDx*qrPigmentSize),length(qrPigmentDy*qrPigmentSize));
 vec2 qrPigmentFilter=max(vec2(1.),uPigmentMinFootprint*(1.-uClassic)/max(qrPigmentFootprint,vec2(1e-6)));
 #endif
 `;
 if(glass) pigment=pigment.replace('uPigmentMinFootprint*(1.-uClassic)', 'mix(uPigmentMinFootprint,1.,step(.5,texture2D(uGlassGloss,pUv).g))*(1.-uClassic)');
 f = 'uniform float uPigmentMinFootprint;\n' + f;
 f = f.replace( '#include <map_fragment>', ( rock ? parallax + pigment.replace( /vMapUv/g, 'qrRockBaseUv' ) : glass ? parallax + pigment : pigment + parallax ) + THREE.ShaderChunk.map_fragment.replace( 'texture2D( map, vMapUv )', 'textureGrad( map, _pUv, qrPigmentDx*qrPigmentFilter.x, qrPigmentDy*qrPigmentFilter.y )' ) + '\nvec3 gDiffuse = diffuseColor.rgb;' );
	// the relief is softer the nearer it is: close up, a wall should be smooth but for small flaws; the full
	// depth is for looking at it from a little way off
	f = f.replace( '#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace( /vNormalMapUv/g, '_pUv' )
		.replace( 'mapN.xy *= normalScale;', this.userData.realDisplacement ? 'mapN.xy *= 0.0;' : glass ? 'mapN.xy *= normalScale * mix(mix(0.4,1.0,smoothstep(24.0,150.0,length(vViewPosition))),1.0,step(.08,texture2D(uGlassGloss,pUv).r)*step(.5,texture2D(uGlassGloss,pUv).g)) * (1.0-uClassic);' : 'mapN.xy *= normalScale * mix( 0.4, 1.0, smoothstep( 24.0, 150.0, length( vViewPosition ) ) ) * ( 1.0 - uClassic );' ) );
	if ( rock ) f = f.replace( '#include <emissivemap_fragment>', ROCK_NORMAL_GLSL + '\n#include <emissivemap_fragment>' );
	f = f.replace( '#include <emissivemap_fragment>', THREE.ShaderChunk.emissivemap_fragment.replace( /vEmissiveMapUv/g, '_pUv' ) );
	f = f.replace( '#include <opaque_fragment>', '#include <opaque_fragment>\n	gNormal = vec4( normalize( normal ) * 0.5 + 0.5, vViewPosition.z );\n\tgAlbedo = vec4( gDiffuse, 1.0 );' );

	// Glass tag occupies the byte-safe gap between carving and rock masks.
 // RGBA8 cannot carry tags above one. Only the supplied glossy pane mask is tagged.
 if(glass){
  shader.uniforms.uGlassGloss=this.userData.glassUniforms.uGlassGloss;
  f='uniform sampler2D uGlassGloss;\n'+f;
  f=f.replace('#include <opaque_fragment>', `
  // Keep dark leading out of the clear coat. Fullbright panes retain their
  // original pigment even when their base map was split to black.
  vec3 qrGlassPigment=textureGrad(map,_pUv,dFdx(vMapUv),dFdy(vMapUv)).rgb;
  #ifdef USE_EMISSIVEMAP
  qrGlassPigment+=textureGrad(emissiveMap,_pUv,dFdx(vMapUv),dFdy(vMapUv)).rgb;
  #endif
  float qrGlassPane=step(0.08,texture2D(uGlassGloss,_pUv).r)*step(0.5,texture2D(uGlassGloss,_pUv).g)*step(0.035,max(qrGlassPigment.r,max(qrGlassPigment.g,qrGlassPigment.b)))*(1.0-uClassic);
  #include <opaque_fragment>`);
  f=f.replace('vec4( gDiffuse, 1.0 )','vec4( gDiffuse, mix(1.0,0.5,qrGlassPane) )');
 }
 // without a normal map there is no parallax; keep the names valid
	f = f.replace( /_pUv/g, 'DETAIL_UV' );
	f = '#ifdef USE_NORMALMAP\n#define DETAIL_UV pUv\n#else\n#define DETAIL_UV vMapUv\n#endif\n' + f;

	if ( rock ) {
		f = f.replace( '#include <opaque_fragment>', 'outgoingLight = (outgoingLight - totalEmissiveRadiance) * qrRockAO + totalEmissiveRadiance;\n#include <opaque_fragment>' );
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.51 + 0.49 * qrRockSunVisibility )' );
	}
	if ( reference ) {

		// Height-derived local occlusion inside the cut. The original pigment
		// and emissive texels are unchanged, and uncarved material stays at 1.
		f = f.replace( '#include <opaque_fragment>', `
		float carveBase = texture2D( uCarveReference, fract( DETAIL_UV ) * uCarveReferenceUV.xy + uCarveReferenceUV.zw ).a;
		float carveDepth = max( 0.0, carveBase - texture2D( normalMap, DETAIL_UV ).a );
		float carveAO = mix( 1.0, clamp( 1.0 - carveDepth * 3.0, 0.08, 1.0 ), 1.0 - uClassic );
		outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * carveAO + totalEmissiveRadiance;
		#include <opaque_fragment>` );
		// A separate byte-safe alpha band carries recess occlusion to deferred
		// lights. RGB is still the original pigment; rock's .51..1 band is intact.
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.1 + 0.39 * carveAO )' );

	}
	if ( relief && ! reference ) {

		// Sculpted plaques stand above their shallow background. Only cavities
		// below that plane receive occlusion; raised bone and glowing eyes retain
		// their authored colour and emissive light.
		const glFloat = value => Number.isInteger( value ) ? value.toFixed( 1 ) : String( value );
		f = f.replace( '#include <opaque_fragment>', `
		float sculptDepth = max( 0.0, ${glFloat( relief.cavityFloor )} - texture2D( normalMap, DETAIL_UV ).a );
		float sculptAO = mix( 1.0, clamp( 1.0 - sculptDepth * ${glFloat( relief.cavityScale )}, ${glFloat( relief.cavityMin )}, 1.0 ), 1.0 - uClassic );
		outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * sculptAO + totalEmissiveRadiance;
		#include <opaque_fragment>` );
		f = f.replace( 'vec4( gDiffuse, 1.0 )', 'vec4( gDiffuse, 0.1 + 0.39 * sculptAO )' );

	}
 // Compute per-source visibility from the same scalar fields used by POM and
 // normals. Original albedo and baked/indirect lighting remain untouched.
 const microDepth = reference ? PARALLAX_DEPTH * 6 : relief?.depth ?? PARALLAX_DEPTH;
 const provider = `
 uniform float uHasHeightShadow;
 vec2 qrShadowDx,qrShadowDy;
 float qrShadowHeight(vec2 uv,int layer) {
  ${rock ? 'if(layer==1)return qrRockHeight(uv);' : ''}
  #ifdef USE_NORMALMAP
  float h=textureGrad(normalMap,uv,qrShadowDx,qrShadowDy).a;
  ${reference ? 'float b=textureGrad(uCarveReference,fract(uv)*uCarveReferenceUV.xy+uCarveReferenceUV.zw,qrShadowDx*uCarveReferenceUV.xy,qrShadowDy*uCarveReferenceUV.xy).a; return clamp(1.-(1.-b+8.*max(0.,b-h))/6.,0.,1.);' : 'return h;'}
  #else
  return 1.;
  #endif
 }
 bool qrShadowKnown(vec2 uv,int layer) {
  ${rock ? 'if(layer==1)return qrRockPage(floor(uv),vRockInfo.x)>=0;' : ''}
  return true;
 }
 `;
 f = HEIGHT_SHADOW_GLSL + f.replace( 'void main() {', provider + '\nvoid main() {\n#ifdef USE_MAP\nqrShadowDx=dFdx(vMapUv);qrShadowDy=dFdy(vMapUv);\n#else\nqrShadowDx=vec2(0.);qrShadowDy=vec2(0.);\n#endif' );
 const ctx = `
 vec4 qrHeightMask=vec4(1.);
 #ifdef USE_NORMALMAP
 HeightShadowContext hctx;
 hctx.microUv=DETAIL_UV;hctx.macroUv=vec2(0.);
 hctx.normal=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
 qrHeightGradients(-vViewPosition,vMapUv,hctx.normal,hctx.microGradU,hctx.microGradV,hctx.microUnit);
 hctx.macroGradU=vec3(0.);hctx.macroGradV=vec3(0.);hctx.macroUnit=0.;
 hctx.microAmp=${Number(microDepth).toFixed(8)};hctx.macroAmp=0.;
 hctx.microMaxUv=${reference ? '1.5' : '.35'};hctx.macroMaxUv=1.5;
 hctx.microValid=uHasHeightShadow*(1.-uClassic);hctx.macroValid=0.;hctx.macroSun=1.;
 ${this.userData.realDisplacement ? 'hctx.microValid=0.;' : ''}
 ${rock ? 'hctx.macroUv=qrRockQ;qrHeightGradients(-vViewPosition,vRockUv,hctx.normal,hctx.macroGradU,hctx.macroGradV,hctx.macroUnit);hctx.macroUnit=256.;hctx.macroAmp=qrRockAmp;hctx.macroValid=qrRockAmp>0.?1.:0.;hctx.macroSun=qrRockSunVisibility;' : ''}
 float unusedDiffuseVisibility;
 qrHeightMask=qrHeightBuildMask(-vViewPosition,hctx,unusedDiffuseVisibility);
 ${rock ? 'if(vRockWall>.5&&hctx.macroValid>.5&&uHeightShadowOn>.5&&uClassic<.5){uint alpha=uint(floor(qrHeightMask.a*255.+.5));if((alpha&192u)==64u)qrHeightMask.a=float((alpha&63u)|128u)/255.;}' : ''}
 #endif
 ${this.depthWrite === false ? 'qrHeightMask=vec4(0.);' : this.transparent ? 'qrHeightMask=vec4(1.);' : ''}
 `;
 f = f.replace( '#include <opaque_fragment>', ctx + '\n#include <opaque_fragment>' );
 // Packed normal alpha is view distance, not blend coverage. Transparent
 // effects preserve the solid normal packet instead of blending depth as alpha.
 f = f.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n gHeightMask=qrHeightMask;' + ( this.transparent || this.depthWrite === false ? '\n gNormal=vec4(0.);' : '' ) );

	shader.fragmentShader = f;
	if ( rock ) {
  // Warped rest coordinates own the micro sampler metric, while macro POM
  // still converts its physical view ray through the native map gradients.
  shader.fragmentShader = shader.fragmentShader.replace( 'qrShadowDx=dFdx(vMapUv);qrShadowDy=dFdy(vMapUv);', 'vec2 qrRockBaseUv=vMapUv+qrRockBandOffset(vRockUv);\nqrShadowDx=dFdx(qrRockBaseUv);qrShadowDy=dFdy(qrRockBaseUv);' )
   .replace( 'qrHeightGradients(-vViewPosition,vMapUv,hctx.normal', 'qrHeightGradients(-vViewPosition,qrRockBaseUv,hctx.normal' );
  R_PatchRockShader( shader );
 }

}

// Every material drawn into the HDR target has to write all attachments. Those
// that know nothing about the normal G-buffer (entities, sky, water, sprites,
// portals...) write "no normal here", which also replaces a stale normal from
// whatever they were drawn over. Alpha 0 selects a depth normal or marks an
// unavailable albedo. Transparent effects do not masquerade as opaque surfaces.
function patchGBufferShader( shader ) {

	let f = shader.fragmentShader;
	if ( f.indexOf( 'gNormal' ) !== - 1 || f.indexOf( '#include <colorspace_fragment>' ) === - 1 ) return;
	const surface = f.includes( '#include <map_fragment>' ) && this.depthWrite !== false && this.transparent !== true;
	// Alias vertex colours contain baked illumination. Capture the texture/material
	// before color_fragment multiplies that lighting in; zero cannot be divided out.
	if ( surface ) f = f.replace( '#include <map_fragment>', '#include <map_fragment>\nvec3 gDiffuse = diffuseColor.rgb;' );
	shader.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\nlayout(location = 2) out highp vec4 gAlbedo;\nlayout(location = 3) out highp vec4 gHeightMask;\n' +
		f.replace( '#include <colorspace_fragment>', '#include <colorspace_fragment>\n\tgNormal = vec4( 0.0 );\n\tgAlbedo = ' + ( surface ? 'vec4( gDiffuse, 1.0 )' : 'vec4( 0.0 )' ) + ';\n gHeightMask = ' + ( this.depthWrite !== false ? 'vec4( 1.0 )' : 'vec4( 0.0 )' ) + ';' );

}

/**
 * Installs the G-buffer patch as `THREE.Material.prototype.onBeforeCompile`, so every material drawn into the HDR
 * target writes all attachments (materials with their own `onBeforeCompile` keep theirs). Installed by the
 * renderer's start-up (R_Init) and again by every R_PostBegin, before anything is drawn into the HDR target;
 * idempotent. (It ran as this module loaded until card [44g]: debt D10.) Lasts for the page; it is never removed.
 */
export function R_PostInstallGBufferPatch() {

	THREE.Material.prototype.onBeforeCompile = patchGBufferShader;

}

function applyDetail( material ) {

	const diffuse = material.userData.detailDiffuse;
	if ( material.emissive !== undefined ) {

		const emission = diffuse?._fullbright || null;
		if ( material.emissiveMap !== emission ) {

			const changedKind = !! material.emissiveMap !== !! emission;
			material.emissiveMap = emission;
			material.emissive.setRGB( emission ? 1 : 0, emission ? 1 : 0, emission ? 1 : 0 );
			if ( changedKind ) material.needsUpdate = true;

		}
		if ( glowMaterials.has( material ) && ! lavaMaterials.has( material ) ) {

			material.userData.glowBoost = diffuse?.userData.newerGlowBoost ?? material.userData.baseGlowBoost;
			applyGlow( material, material.userData.glowBoost );

		}

	}
	const waiting=postState.detailActive&&diffuse?.userData.newerPending;
	if(postState.detailActive&&!waiting&&diffuse?.image?.data&&typeof window!=='undefined'&&R_NormalPreparationNeeded(diffuse))R_NormalPrepare(diffuse);
	const wanted = postState.detailActive && !waiting && diffuse != null ? R_NormalMapFor( diffuse ) : null;

	if ( material.normalMap === wanted ) return;

	const changedKind = ( material.normalMap != null ) !== ( wanted != null );
	const changedCarving = !! material.normalMap?.userData.referenceHeight !== !! wanted?.userData.referenceHeight;
	const changedRelief = JSON.stringify( material.normalMap?.userData.surfaceRelief ) !== JSON.stringify( wanted?.userData.surfaceRelief );
	const changedGlass=!!material.normalMap?.userData.glassGloss !== !!wanted?.userData.glassGloss;
 material.normalMap = wanted;
 const glassUniforms=material.userData.glassUniforms ||= {uGlassGloss:{value:null}};
 glassUniforms.uGlassGloss.value=wanted?.userData.glassGloss||null;
	if ( wanted?.userData.referenceHeight ) {

		// Cached shader variants share these holders across mode/texture changes.
		const uniforms = material.userData.carveUniforms ||= { uCarveReference: { value: null }, uCarveReferenceUV: { value: null } };
		uniforms.uCarveReference.value = wanted.userData.referenceHeight;
		uniforms.uCarveReferenceUV.value = wanted.userData.referenceUV;

	}
	if ( material.normalScale !== undefined ) material.normalScale.set( 1, 1 );
	if ( changedKind || changedCarving || changedRelief || changedGlass ) material.needsUpdate = true;

}

/**
 * Registers a world material for surface detail: generated normal maps, parallax and the normal G-buffer. World
 * materials keep normal maps and parallax independently of lighting, and always write the normal G-buffer.
 * Called by gl_rsurf.js as each world material is made. Installs its own `onBeforeCompile` and program cache key,
 * applies the current detail state, and follows `newertextureupdated` events on `diffuse` (asynchronous art and
 * height can arrive after the material compiles). Registered until the material is disposed.
 *
 * @param {THREE.Material} material world surface material; mutated (shader hooks, normal map, emissive map, userData)
 * @param {?THREE.Texture} diffuse its diffuse texture, the source of its normal map and fullbright emission
 */
export function R_RegisterDetail( material, diffuse ) {

	bindDetailTexture( material, diffuse );
	material.onBeforeCompile = patchDetailShader;
	material.customProgramCacheKey = function () {

		return ( this.userData.rockField ? 'quake-detail-rock-v2-bandwarp' : 'quake-detail' ) + ( this.normalMap?.userData.referenceHeight ? '-carved' : '' ) + ( this.normalMap?.userData.surfaceRelief ? '-sculpted:' + JSON.stringify( this.normalMap.userData.surfaceRelief ) : '' ) + ( this.userData.realDisplacement ? '-displaced' : '' ) + ( this.normalMap?.userData.glassGloss ? '-glass-v2-regions' : '' ) + '-height-shadow-filtered-v2';

	};

	applyDetail( material );
	detailMaterials.add( material );
	material.addEventListener( 'dispose', () => {

		detailMaterials.delete( material );
		detailTextureListeners.get( material )?.();
		detailTextureListeners.delete( material );

	} );

}

/**
 * The material's diffuse texture changed (texture animation; gl_rsurf.js `R_UpdateAnimatedMaterial`): rebinds its
 * texture listener and re-applies its normal and emissive maps. Does nothing for a material not registered with
 * `R_RegisterDetail`.
 *
 * @param {THREE.Material} material a registered world material
 * @param {?THREE.Texture} diffuse the new diffuse texture
 */
export function R_RefreshDetail( material, diffuse ) {

	if ( ! detailMaterials.has( material ) ) return;
	bindDetailTexture( material, diffuse );
	applyDetail( material );

}

// Async art/height can arrive after world materials compile. Listen on the
// existing Three texture without a reverse import into the renderer graph.
// Animation changes and material disposal detach the previous texture listener.
const detailTextureListeners = new WeakMap();
function bindDetailTexture( material, diffuse ) {

	detailTextureListeners.get( material )?.();
	material.userData.detailDiffuse = diffuse;
	const refresh = () => applyDetail( material );
	diffuse?.addEventListener( 'newertextureupdated', refresh );
	detailTextureListeners.set( material, () => diffuse?.removeEventListener( 'newertextureupdated', refresh ) );

}
