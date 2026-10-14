// Independent packed-data, geometric-ray and public compiler/frame contracts.
// No browser, game or WebGL instance is started.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import * as height from '../src/newer/render/r_heightshadows.js';
import * as post from '../src/newer/render/gl_post.js';
import * as newerMode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import { R_NormalMapFor } from '../src/newer/render/gl_normals.js';
import { createQuakeLightmapMaterial } from '../src/engine/render/gl_rsurf.js';
import * as skins from '../src/newer/render/r_newerskins.js';

const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label, e = 1e-8 ) => check( Math.abs( a - b ) < e, `${label}: ${a} != ${b}` );
const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pointshadows, newerMode.r_newer_lighting, newerMode.r_newer_normals, newerMode.r_newer_enemies, newerMode.r_newer_water, height.r_heightshadows ]; for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
async function fixture( fn ) { const saved = controls.map( v => v.string ); try { controls.forEach( v => vars.Cvar_Set( v.name, '1' ) ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_pointshadows', 'r_newer_water' ] ) vars.Cvar_Set( name, '0' ); newerMode.R_AnimSetClassicPass( false ); post.R_PostBegin( renderer(), true, 320, 200 ); await fn(); } finally { post.R_PostBegin( renderer(), false, 320, 200 ); height.R_HeightShadowScope( false ); skins.R_NewerSkinsShutdown(); skins.R_NewerSetIndex( null ); controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); newerMode.R_AnimSetClassicPass( false ); newerMode.R_AnimSetNewer( false ); newerMode.R_AnimSetLighting( false ); } }
function pixels( w = 16, h = 16 ) { const a = new Uint8Array( w * h * 4 ); for ( let i = 0; i < w * h; i ++ ) a.set( [ ( i * 31 ) % 255, ( i * 17 ) % 255, ( i * 53 ) % 255, 255 ], i * 4 ); return new THREE.DataTexture( a, w, h ); }
function compile( m, lib = 'lambert' ) { const s = { uniforms: {}, vertexShader: THREE.ShaderLib[ lib ].vertexShader, fragmentShader: THREE.ShaderLib[ lib ].fragmentShader }; m.onBeforeCompile( s ); return s; }
function renderer() { let target = null, vp = new THREE.Vector4( 0, 0, 320, 200 ), sc = vp.clone(), color = new THREE.Color(), st = false, alpha = 1; const r = { draws: [], autoClear: true, xr: { enabled: false }, capabilities: { isWebGL2: true }, extensions: { has: () => true }, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, getViewport: a => a.copy( vp ), setViewport: ( ...a ) => a[ 0 ]?.isVector4 ? vp.copy( a[ 0 ] ) : vp.set( ...a ), getScissor: a => a.copy( sc ), setScissor: ( ...a ) => a[ 0 ]?.isVector4 ? sc.copy( a[ 0 ] ) : sc.set( ...a ), getScissorTest: () => st, setScissorTest: x => { st = x; }, getClearColor: a => a.copy( color ), getClearAlpha: () => alpha, setClearColor: ( c, a ) => { color.set( c ); alpha = a; }, clear() {}, render: scene => r.draws.push( { scene, target, material: scene.children[ 0 ]?.material, scoped: height.heightShadowUniforms.uHeightShadowOn.value } ) }; return r; }

Deno.test( 'ten independent visibility slots roundtrip exact3bit values and distinguish generic/rock-wall tags and reject invalid clear/sentinel without gamma interpretation', () => {

	for ( const rockWall of [ false, true ] ) for ( let index = 0; index < 10; index ++ ) for ( let quant = 0; quant <= 7; quant ++ ) { const values = new Array( 10 ).fill( 1 ); values[ index ] = quant / 7; const packed = height.R_HeightShadowPack( values, rockWall ); const word = BigInt( packed[ 0 ] ) + ( BigInt( packed[ 1 ] ) << 8n ) + ( BigInt( packed[ 2 ] ) << 16n ) + ( BigInt( packed[ 3 ] ) << 24n ); same( Number( word >> 30n ), rockWall ? 2 : 1, 'marker bits distinguish wall and generic'  ); for ( let source = 0; source < 10; source ++ ) { const expected = source === index ? quant / 7 : 1; near( height.R_HeightShadowDecode( packed, source ), expected, 'independent per-source bytes' ); near( Number( ( word >> BigInt( source * 3 ) ) & 7n ) / 7, expected, 'independent BigInt data decoder' ); } }
	for ( const invalid of [ [ 0, 0, 0, 0 ], [ 255, 255, 255, 255 ], [ 0, 0, 0, 192 ], [], [ .5, 0, 0, 64 ], 0, 0xffffffff ] ) check( height.R_HeightShadowDecode( invalid ).every( v => v === 1 ), 'invalid mask is lit fallback, never manufactured shadow' );
	const values = [ 0, .11, .25, .36, .51, .63, .76, .87, .99, 1 ]; height.R_HeightShadowDecode( height.R_HeightShadowPack( values ) ).forEach( ( v, i ) => check( Math.abs( v - values[ i ] ) <= 1 / 14, 'bounded3bit visibility quantization' ) );

} );

Deno.test( 'actual rock highlights preserve daylight and lift only dim reached light while ordinary and source-free fields stay neutral', async () => {
	const text = height.HEIGHT_MASK_DECODE_GLSL, start = text.indexOf( 'float heightRockContrast(' ), at = text.indexOf( '{', start ), end = text.indexOf( '\n}', at );
	const code = text.slice( at + 1, end ).replace( /\b(?:uint|float)\s+/g, 'let ' ).replace( /\buint\(/g, 'Math.trunc(' ).replace( /\bfloor\(/g, 'Math.floor(' ).replace( /(\d+)u\b/g, '$1' ).replace( 'texture2D(tHeightShadow,uv).a', 'alpha' );
	const actual = new Function( 'uHeightMasks', 'shadowedWeight', 'visibleWeight', 'alpha', 'clamp', 'mix', 'smoothstep', code ), clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) ), mix = ( a, b, t ) => a + ( b - a ) * t, smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
	for ( const tag of [ 0, 1, 2, 3 ] ) for ( const ratio of [ 0, .5, 1 ] ) { const expected = tag===2?.5+.5*ratio:1; near( actual( 1, ratio * 3, 3, ( tag * 64 + 31 ) / 255, clamp, mix, smooth ), expected, 'actual class-tagged light gain' ); }
	near( actual( 0, 3, 3, 128 / 255, clamp, mix, smooth ), 1, 'Classic/off masks are neutral' ); near( actual( 1, 0, 0, 128 / 255, clamp, mix, smooth ), 1, 'no active source cannot create contrast illumination' );
	near(actual(1,.05,.05,128/255,clamp,mix,smooth),2,'dim reached highlight');near(actual(1,0,.05,128/255,clamp,mix,smooth),.5,'relief shadow remains strongly defined');near(actual(1,1,1,128/255,clamp,mix,smooth),1,'daylight normal');
	const rock = await import( '../src/newer/render/r_rockfield.js' );
	const surface = ( name, n, p ) => ( { flags: 0, plane: { normal: n, dist: 0 }, texinfo: { texture: { name } }, polys: { numverts: 4, verts: p.map( ( v, i ) => [ ...v, i & 1, i >> 1, .1 * i, .2 * i ] ) } } );
	const wall = surface( 'rock1_2', [ 1, 0, 0 ], [ [ 0, 0, 0 ], [ 0, 16, 0 ], [ 0, 16, 16 ], [ 0, 0, 16 ] ] ), ground = surface( 'wgrnd1_5', [ 0, 0, 1 ], [ [ 32, 0, 0 ], [ 48, 0, 0 ], [ 48, 16, 0 ], [ 32, 16, 0 ] ] ), model = { name: 'maps/height_class_test.bsp', surfaces: [ wall, ground ] }, native = JSON.stringify( model );
	try {
		rock.R_RockfieldBuild( model );
		for ( const [ face, expected ] of [ [ wall, 1 ], [ ground, 0 ] ] ) { const geometry = new THREE.BufferGeometry(); geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( face.polys.verts.flatMap( v => v.slice( 0, 3 ) ), 3 ) ); geometry.setAttribute( 'uv', new THREE.Float32BufferAttribute( face.polys.verts.flatMap( v => v.slice( 3, 5 ) ), 2 ) ); geometry.setIndex( [ 0, 1, 2, 0, 2, 3 ] ); const pos = geometry.attributes.position.array.slice(), uv = geometry.attributes.uv.array.slice(); check( rock.R_RockfieldGeometry( geometry, face ), 'actual public rock geometry accepted' ); check( Array.from( geometry.attributes.rockWall.array ).every( value => value === expected ), 'per-vertex role isolates wall from ground' ); same( geometry.attributes.rockInfo.itemSize, 2, 'existing chart/amplitude layout preserved' ); check( pos.every( ( v, i ) => v === geometry.attributes.position.array[ i ] ) && uv.every( ( v, i ) => v === geometry.attributes.uv.array[ i ] ), 'role metadata does not alter position/UV' ); geometry.dispose(); }
		same( JSON.stringify( model ), native, 'BSP surface data unchanged' );
	} finally { rock.R_RockfieldBuild( null ); }

} );

Deno.test( 'public height frame preserves light slot ordering, copies mutable input and respects scope/default controls', () => fixture( () => {

	const snapshot = { points: [ { position: [ 1, 2, 3 ], range: 100, color: [ 2, 1, .5 ] }, { position: [ NaN, 0, 0 ], range: 80, color: [ 9, 9, 9 ] }, { position: [ -4, 5, 6 ], range: 200, color: [ .2, .3, .4 ] } ], sun: { direction: [ 0, 0, 2 ], on: true, color: [ 1, 1, 1 ] }, spot: { position: [ 0, 0, 8 ], direction: [ 0, 1, 0 ], range: 1500, cone: [ .92, .955 ], on: true, color: [ 4, 4, 4 ] } };
	height.R_HeightShadowScope( true ); const u = height.R_HeightShadowFrame( snapshot ); same( u.uHeightCount.value, 3, 'invalid source does not compact/remap slots' ); same( u.uHeightPointWorld.value[ 1 ].w, 0, 'invalid source stays disabled at its exact index' ); same( u.uHeightPointWorld.value[ 2 ].x, -4, 'following source stays in original slot2' ); near( u.uHeightSunDirWorld.value.z, 1, 'direction normalized' ); near( u.uHeightSpotCone.value.x, .955, 'cone inner/out sorted' ); snapshot.points[ 0 ].position[ 0 ] = 999; snapshot.points[ 0 ].color[ 0 ] = 999; same( u.uHeightPointWorld.value[ 0 ].x, 1, 'world point copied' ); same( u.uHeightPointColor.value[ 0 ].x, 2, 'radiance copied' ); same( u.uHeightShadowOn.value, 1, 'default scoped height effects enabled' ); height.R_HeightShadowScope( false ); same( u.uHeightShadowOn.value, 0, 'offscreen/classic scope cannot leak previous height state' ); vars.Cvar_Set( 'r_heightshadows', '0' ); same( height.R_HeightShadowScope( true ), 0, 'manualoff supported' );

} ) );

// Execute the actual GLSL ray's scalar arithmetic and explicit vector operations
// in JS, then compare it with an independent geometric box intersection oracle.
function actualRay() {

	const start = height.HEIGHT_SHADOW_GLSL.indexOf( 'float qrHeightRay(' ), at = height.HEIGHT_SHADOW_GLSL.indexOf( '{', start ); let depth = 1, end = at + 1; while ( depth && end < height.HEIGHT_SHADOW_GLSL.length ) { if ( height.HEIGHT_SHADOW_GLSL[ end ] === '{' ) depth ++; if ( height.HEIGHT_SHADOW_GLSL[ end ] === '}' ) depth --; end ++; }
	let code = height.HEIGHT_SHADOW_GLSL.slice( at + 1, end - 1 ).replace( /\b(float|vec[23]|int|bool)\s+/g, 'let ' );
	code = code.replace( /\bceil\(/g, 'Math.ceil(' ).replace( /\bfloat\(/g, 'Number(' ).replace( 'P+N*(originHeight*worldUnit)', 'add(P,mul(N,originHeight*worldUnit))' ).replace( 'finiteLight?light-surface:light', 'finiteLight?sub(light,surface):light' ).replace( 'delta/lightDistance', 'mul(delta,1/lightDistance)' ).replace( 'vec2(dot(L,gradU),dot(L,gradV))', '[dot(L,gradU),dot(L,gradV)]' ).replace( 'uv+velocity*t', 'add(uv,mul(velocity,t))' );
	return new Function( 'P', 'N', 'light', 'finiteLight', 'uv', 'gradU', 'gradV', 'worldUnit', 'amplitude', 'maxUv', 'layer', 'qrShadowHeight', 'qrShadowKnown', 'add', 'sub', 'mul', 'dot', 'length', 'clamp', 'min', 'smoothstep', code );

}
Deno.test( 'actual height ray agrees with geometric ridge blockers for point/sun rays and keeps flat/unknown/overhead cases lit', () => {

	const fn = actualRay(), P = [ 12.8, 32, 0 ], N = [ 0, 0, 1 ], uv = [ .2, .5 ], amp = .02, unit = 64, origin = new THREE.Vector3( ...P ).addScaledVector( new THREE.Vector3( ...N ), ( .2 - 1 ) * amp * unit );
	const ridge = new THREE.Box3( new THREE.Vector3( .235 * 64, 0, ( .2 - 1 ) * amp * unit ), new THREE.Vector3( .275 * 64, 64, ( .9 - 1 ) * amp * unit ) ), sampler = p => p[ 0 ] >= .235 && p[ 0 ] <= .275 ? .9 : .2;
	const add = ( a, b ) => a.map( ( v, i ) => v + b[ i ] ), sub = ( a, b ) => a.map( ( v, i ) => v - b[ i ] ), mul = ( a, s ) => a.map( v => v * s ), dot = ( a, b ) => a.reduce( ( v, n, i ) => v + n * b[ i ], 0 ), clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) ), smooth = ( a, b, v ) => { const t = clamp( ( v - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
	for ( const [ light, finite, expectedBlocked ] of [ [ [ 4, 0, 1 ], false, true ], [ [ -4, 0, 1 ], false, false ], [ [ 0, 0, 1 ], false, false ], [ [ 25, 32, 1 ], true, true ], [ [ 12.8, 32, 8 ], true, false ], [ [ 13.5, 32, -.7 ], true, false ] ] ) {

		const delta = finite ? new THREE.Vector3( ...light ).sub( origin ) : new THREE.Vector3( ...light ), ray = new THREE.Ray( origin, delta.clone().normalize() ), hit = ray.intersectBox( ridge, new THREE.Vector3() ), blocked = !! hit && ( ! finite || hit.distanceTo( origin ) < delta.length() ); same( blocked, expectedBlocked, 'independent real geometry oracle establishes test ray' );
		const visibility = fn( P, N, light, finite, uv, [ 1 / 64, 0, 0 ], [ 0, 1 / 64, 0 ], unit, amp, .35, 0, sampler, () => true, add, sub, mul, dot, a => Math.hypot( ...a ), clamp, Math.min, smooth ); check( blocked ? visibility < .05 : visibility > .95, 'actual scalar height march matches independent geometric blocker' );

	}
	// A one-hundredth-tile ridge lies between the old twelve-step locations.
	// The actual adaptive march must use its bounded48samples to cover it.
	const longAmp = .8, narrowLo = .217, narrowHi = .227;
	const tallRidge = new THREE.Box3( new THREE.Vector3( narrowLo * unit, 0, ( .2 - 1 ) * longAmp * unit ), new THREE.Vector3( narrowHi * unit, unit, ( .9 - 1 ) * longAmp * unit ) );
	const longOrigin = new THREE.Vector3( ...P ).addScaledVector( new THREE.Vector3( ...N ), ( .2 - 1 ) * longAmp * unit );
	for ( const angle of [ .049, .05, .051 ] ) {
		const direction = [ 1, 0, angle ], ray = new THREE.Ray( longOrigin, new THREE.Vector3( ...direction ).normalize() );
		check( ray.intersectBox( tallRidge, new THREE.Vector3() ) !== null, 'thin ridge independent geometric intersection' );
		let samples = 0; const visibility = fn( P, N, direction, false, uv, [ 1 / unit, 0, 0 ], [ 0, 1 / unit, 0 ], unit, longAmp, .35, 0, p => { samples ++; return p[ 0 ] >= narrowLo && p[ 0 ] <= narrowHi ? .9 : .2; }, () => true, add, sub, mul, dot, a => Math.hypot( ...a ), clamp, Math.min, smooth );
		same( samples, 49, 'one origin sample plus maximum48 bounded ray samples' ); check( visibility < .05, 'nearby grazing directions continuously shadow thin ridge' );
	}
	let shortSamples = 0; const flatVisibility = fn( P, N, [ 1, 0, .05 ], false, uv, [ 1 / unit, 0, 0 ], [ 0, 1 / unit, 0 ], unit, .015, .03, 0, () => { shortSamples ++; return .2; }, () => true, add, sub, mul, dot, a => Math.hypot( ...a ), clamp, Math.min, smooth );
	same( flatVisibility, 1, 'flat field has no artificial blockers' ); same( shortSamples, 13, 'alias short UV rays retain minimum12 samples' ); same( height.HEIGHT_SHADOW_STEPS, 48, 'public bound matches executed ray budget' );
	const skipped = fn( P, N, [ 4, 0, 1 ], false, uv, [ 1 / 64, 0, 0 ], [ 0, 1 / 64, 0 ], unit, amp, .35, 0, sampler, () => false, add, sub, mul, dot, a => Math.hypot( ...a ), clamp, Math.min, smooth ); same( skipped, 1, 'missing field data cannot manufacture blockers' );

} );

Deno.test( 'real public world/alias compiler hooks attach only declared scalar heights, preserve colour and distinguish rocks/carving/real geometry/classic', () => fixture( () => {

	newerMode.R_AnimSetNewer( true ); newerMode.R_AnimSetLighting( true ); skins.R_NewerSetIndex( { models: {}, nativeHeights: {} } ); const diffuse = pixels(), before = Buffer.from( diffuse.image.data ), normal = R_NormalMapFor( diffuse ); same( normal.userData.heightSource, true, 'generated alpha explicitly declares scalar height' );
	const material = createQuakeLightmapMaterial( diffuse, new THREE.Texture() ), world = compile( material ); same( world.uniforms.uHasHeightShadow.value, 1, 'world generated height active marker' ); check( world.fragmentShader.includes( 'gHeightMask=qrHeightMask' ) && world.fragmentShader.includes( 'hctx.microUv=DETAIL_UV' ), 'world mask samples actual POMhitUV' ); check( ! world.fragmentShader.includes( 'outgoingLight *= unusedDiffuseVisibility' ), 'shadow does not globally dim baked diffuse/emission' );
	material.userData.rockField = true; const rock = compile( material ); check( rock.fragmentShader.includes( 'hctx.macroUv=qrRockQ' ) && rock.fragmentShader.includes( 'hctx.macroSun=qrRockSunVisibility' ), 'rock exact macro hit and cached directional rays included' ); check( rock.vertexShader.includes( 'vRockWall=rockWall' ) && rock.fragmentShader.includes( 'vRockWall>.5&&hctx.macroValid>.5&&uHeightShadowOn>.5&&uClassic<.5' ), 'actual shader tags only enabled, loaded wall fields; body/ground/classic excluded' );
	material.userData.realDisplacement = true; const physical = compile( material ); check( physical.fragmentShader.includes( 'hctx.microValid=0.;' ), 'actual raised geometry does not double its macro selfshadow' );
	const ordinaryNormal = new THREE.Texture(), authored = skins.R_AssetAliasMaterial( { diffuse, normal: ordinaryNormal }, 'normal-only-public-height-test' ), a = compile( authored, 'basic' ); same( a.uniforms.uHasSkinHeightShadow.value, 0, 'authored RGBnormal alpha not misrepresented as displacement' );
	normal.userData.referenceHeight = R_NormalMapFor( pixels() ); normal.userData.referenceUV = new THREE.Vector4( 1, 1, 0, 0 ); material.userData.realDisplacement = false; material.userData.rockField = false; const carvedMaterial = createQuakeLightmapMaterial( diffuse, new THREE.Texture() ), carved = compile( carvedMaterial ); check( carved.fragmentShader.includes( '8.*max(0.,b-h)' ) && carved.fragmentShader.includes( 'hctx.microAmp=0.12' ), 'deep carving uses same normalized hit height and physical depth' ); carvedMaterial.transparent = true; check( compile( carvedMaterial ).fragmentShader.includes( 'qrHeightMask=vec4(1.)' ), 'depth-writing transparent material overwrites stale packed bits with invalid FF' ); check( compile( carvedMaterial ).fragmentShader.includes( 'gNormal=vec4(0.)' ), 'transparent world cannot blend distance as colour-buffer alpha' ); carvedMaterial.depthWrite = false; check( compile( carvedMaterial ).fragmentShader.includes( 'qrHeightMask=vec4(0.)' ), 'non-depth-writing effect preserves underlying receiver packet' ); check( compile( carvedMaterial ).fragmentShader.includes( 'gNormal=vec4(0.)' ), 'non-depth world leaves solid normal packet intact' ); carvedMaterial.dispose();
	let nativeCount = 0; for ( const key of skins.ENEMY_SKIN_MODELS ) { const t = pixels(), m = skins.R_EnemyAliasMaterial( t, 'progs/' + key + '.mdl', true ), s = compile( m, 'basic' ); same( s.uniforms.uHasSkinHeightShadow.value, 1, 'every registered native enemy/head/gore scalar path marked ' + key ); check( s.fragmentShader.includes( 'gHeightMask=skinHeightMask' ) && s.fragmentShader.includes( 'hctx.microUv=vMapUv' ), 'alias height preserves exact skin UV rather than redrawing geometry' ); nativeCount ++; t.dispose(); }
	authored.transparent = true; check( compile( authored, 'basic' ).fragmentShader.includes( 'skinHeightMask=vec4(1.)' ), 'transparent alias depth writer clears background rock tag' ); check( compile( authored, 'basic' ).fragmentShader.includes( 'gNormal = vec4(0.)' ), 'transparent alias cannot corrupt normal packet through distance alpha' ); authored.depthWrite = false; check( compile( authored, 'basic' ).fragmentShader.includes( 'skinHeightMask=vec4(0.)' ), 'non-depth alias preserves underlying packet' ); check( compile( authored, 'basic' ).fragmentShader.includes( 'gNormal = vec4(0.)' ), 'non-depth alias leaves solid normal packet intact' );
	newerMode.R_AnimSetClassicPass( true ); same( a.uniforms.uSkinRelit.value, 0, 'classic skin shader disables height lighting' ); check( Buffer.from( diffuse.image.data ).equals( before ), 'all shadows preserve original albedo bytes' ); authored.dispose(); ordinaryNormal.dispose(); material.dispose(); diffuse.dispose(); console.log( 'HEIGHT_SHADER_NATIVE_MODELS ' + nativeCount );

} ) );

Deno.test( 'public pre-HDR frame freezes exact source slots and4MRT packed masks, composition never recaptures/reselects, old callers and off modes remain compatible', () => fixture( () => {

	const leaf = { contents: -1, visframe: 5 }, entities = Array.from( { length: 8 }, ( _, i ) => `{ "classname" "light_flame_small_yellow" "origin" "${i * 30} 0 100" }` ).join( '\n' ); post.R_BuildWorldLights( { nodes: [ leaf ], entities, surfaces: [] } ); vars.Cvar_Set( 'r_pointshadows', '1' ); post.R_BuildSunOccluder( { surfaces: [ { flags: 0, polys: { numverts: 4, verts: [ [ -128, -128, -16, 0, 0, 0, 0 ], [ 128, -128, -16, 0, 0, 0, 0 ], [ 128, 128, -16, 0, 0, 0, 0 ], [ -128, 128, -16, 0, 0, 0, 0 ] ] } } ] } ); const r = renderer(), c = new THREE.PerspectiveCamera( 75, 1.6, 4, 4096 ); c.updateMatrixWorld();
	post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); const hdr = r.getRenderTarget(); same( hdr.textures.length, 4, 'realheight pathfour attachments' ); same( hdr.samples, 0, 'packed mask disables destructive multisample averaging' ); same( hdr.textures[ 3 ].colorSpace, THREE.NoColorSpace, 'mask no gamma' ); same( hdr.textures[ 3 ].type, THREE.UnsignedByteType, 'mask fixed byte format' ); same( hdr.textures[ 3 ].minFilter, THREE.NearestFilter, 'mask nearest samples' );
	const captureBefore = post.R_PointShadowStatus().captures; const snapshot = post.R_PostLightsFrame( r, new THREE.Scene(), c, 5, new Array( 64 ).fill( 264 ), [], 1, true ), points = snapshot.lights.map( l => ( { position: l.worldPos.slice(), color: l.color.slice(), pos: l.pos.slice() } ) ); same( post.R_PointShadowStatus().captures - captureBefore, 1, 'one actual cube captured before scene draw' ); same( post.R_PointShadowStatus().faceRenders % 6, 0, 'cube uses six bounded face renders' ); same( height.heightShadowUniforms.uHeightShadowOn.value, 1, 'only pre-HDR scope activates writer' );
	const source = post.R_GetWorldLights()[ 0 ]; source.pos[ 0 ] = 9000; source.power = 1000; r.render( new THREE.Scene(), c ); height.R_HeightShadowScope( false ); const captures = post.R_PointShadowStatus().captures; post.R_PostFinish( r, new THREE.Scene(), c, { lx: 0, ly: 0, lw: 320, lh: 200 }, 5, new Array( 64 ).fill( 264 ), [], 1, 1, true );
	const composite = r.draws.at( -1 ).material; same( composite.uniforms.uHeightMasks.value, 1, 'frozen scene enables exact-slot decoder' ); same( post.R_PointShadowStatus().captures, captures, 'finish never casts another cube' ); for ( let i = 0; i < points.length; i ++ ) { same( height.heightShadowUniforms.uHeightPointWorld.value[ i ].toArray().slice( 0, 3 ).join(), points[ i ].position.join(), 'height slots frozen before draw' ); same( composite.uniforms.uLightCol.value[ i ].toArray().slice( 0, 3 ).join(), points[ i ].color.join(), 'compositionuses same frozen radiance' ); same( composite.uniforms.uLightPos.value[ i ].toArray().slice( 0, 3 ).join(), points[ i ].pos.join(), 'compositionuses same frozen source order' ); }
	check(composite.fragmentShader.includes('float turn = 0.0;')&&!composite.fragmentShader.includes('float turn = jit *'),'actual bounce directions have no pixel-random rotation');check(composite.fragmentShader.includes('const int BOUNCE_SAMPLES = 16;'),'fixed integration uses sixteen directions');post.R_PostBind(r);same(r.getRenderTarget().textures[1].minFilter,THREE.NearestFilter,'normal and depth packet does not interpolate unrelated receivers');
	check( composite.fragmentShader.includes( 'pointSurfaceVisibility(P,normal,index,actorReceiver(texture2D(tAlbedo,uv).a)?.1:1.)*receiverHeightVisibility(P,uv,index)' ) && composite.fragmentShader.includes( 'receiverHeightVisibility(P,uvd,8)' ) && /receiverHeightVisibility\(\s*P,\s*uvd,\s*9\s*\)/.test( composite.fragmentShader ), 'actual point/sun/spot direct lighting consumes its own source visibility' ); check( composite.fragmentShader.includes( 'c*=receiverRockContrast(P,uvd,shadowedReliefWeight,visibleReliefWeight)' ) && composite.fragmentShader.includes( 'visibleReliefWeight+=weight;shadowedReliefWeight+=weight*localShadow' ), 'actual compositor applies class-gated final contrast with world-reached source weighting' );
	// Execute the actual compiled compositor wrapper, independently of the
	// mask helper: a foreground depth-writing transparent gun must not inherit
	// the background rock packet. Matching receiver depths still get wall gain.
	const wrapperAt = composite.fragmentShader.indexOf( 'float receiverRockContrast(' ), bodyAt = composite.fragmentShader.indexOf( '{', wrapperAt ); check( wrapperAt >= 0, 'actual compositor declares coherent rock contrast wrapper' ); let braces = 1, bodyEnd = bodyAt + 1;
	while ( braces && bodyEnd < composite.fragmentShader.length ) { if ( composite.fragmentShader[ bodyEnd ] === '{' ) braces ++; if ( composite.fragmentShader[ bodyEnd ] === '}' ) braces --; bodyEnd ++; }
	const heldBody=/bool heldReceiver\(vec4 packet\)\{([^}]+)\}/.exec(composite.fragmentShader)?.[1],distanceBody=/float receiverDistance\(vec4 packet\)\{([^}]+)\}/.exec(composite.fragmentShader)?.[1];check(heldBody&&distanceBody,'actual physical receiver packet decoders are present');const heldDecoder=new Function('packet',heldBody),distanceDecoder=new Function('packet','heldReceiver',distanceBody),decodeReceiver=packet=>distanceDecoder(packet,heldDecoder);
	const wrapperCode = composite.fragmentShader.slice( bodyAt + 1, bodyEnd - 1 ).replace( /\b(?:vec4|float)\s+/g, 'let ' ).replace('vec3(.2126,.7152,.0722)','[.2126,.7152,.0722]'), execute = new Function( 'P', 'uv', 'shadowedWeight', 'visibleWeight', 'texture2D', 'tNormal', 'heightRockContrast', 'abs', 'tScene','dot','mix','smoothstep','receiverDistance',wrapperCode );
	const coherent = ( receiverDepth, packetDepth ) => execute( { z: -receiverDepth }, [ .5, .5 ], 3, 3, ()=>({a:packetDepth,rgb:[0,0,0]}),null,()=>2,Math.abs,null,(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),(a,b,t)=>a+(b-a)*t,(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);},decodeReceiver );
	const daylight=execute({z:-100},[.5,.5],3,3,()=>({a:100,rgb:[.4,.4,.4]}),null,()=>2,Math.abs,null,(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),(a,b,t)=>a+(b-a)*t,(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);},decodeReceiver);same(daylight,1,'a brightly lit base never receives a bleaching highlight boost');
	same( coherent( 8, 100 ), 1, 'foreground weapon depth cannot use background rock contrast' ); same( coherent( 100, 100 ), 2, 'matching receiver routes to the supplied gain helper' ); same( coherent( 100, 103 ), 2, 'same existing normal-depth tolerance retained' ); same( coherent( 100, 104 ), 1, 'outside coherence tolerance neutral' ); same( coherent( 100, 0 ), 1, 'missing normal packet neutral' ); same( coherent( 100, -.5 ), 1, 'portal/unavailable packet neutral' ); same(coherent(100,-1),1,'actual portal marker remains unavailable');same(coherent(100,-102),2,'held true-depth decoder accepts a physically matching receiver');same(coherent(8,-102),1,'compressed display depth cannot impersonate true held receiver depth');
	check( composite.fragmentShader.includes( 'colour*receiverRockContrast(P,uv,shadowedWeight,visibleWeight)' ), 'reflected receivers also use actual depth coherence' );
	post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); post.R_PostFinish( r, new THREE.Scene(), c, { lx: 0, ly: 0, lw: 320, lh: 200 }, 5, [], [], 2, 1, false ); same( r.draws.at( -1 ).material.uniforms.uHeightMasks.value, 0, 'legacy finishwithoutpredrawcannot decode mismatched source bits' );
	vars.Cvar_Set( 'r_heightshadows', '0' ); post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); same( r.getRenderTarget().textures.length, 4, 'height-off retains physical alias receiver repair attachments' ); same( r.getRenderTarget().samples, 0, 'physical normal distance and actor class tags cannot be coverage averaged even without height masks' );same(height.heightShadowUniforms.uHeightShadowOn.value,0,'height-off still disables the packed shadow writer'); vars.Cvar_Set( 'r_newer_lighting', '0' ); post.R_PostBegin( r, true, 320, 200 ); post.R_PostBind( r ); same( r.getRenderTarget().textures.length, 2, 'lighting-off oldtwoattachment detail mode' ); vars.Cvar_Set( 'r_hdr', '0' ); same( post.R_PostBegin( r, true, 320, 200 ), false, 'Classic hasno enhanced mask pass' ); same( height.heightShadowUniforms.uHeightShadowOn.value, 0, 'Classic scope writer disabled' );

} ) );

Deno.test( 'all installed official-game native and replacement height bindings reach public material hooks with independent filtered alpha and unchanged diffuse', () => fixture( async () => {

 const sharp = ( await import( process.env.QUAKED_SHARP_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs' ) ).default;
 const index = JSON.parse( readFileSync( new URL( '../newer/enemies/index.json', import.meta.url ) ) );
 const digest = bytes => createHash('sha256').update(bytes).digest('hex');
 // Match the existing official-body audit's three explicit owned inputs. Do not
 // let Mod_ForName's basename cache substitute id1 for a Rogue override.
 const directories = {};
 for(const game of ['id1','hipnotic','rogue'])directories[game]=await pakDirectory(process.env['QUAKED_BODY_'+game.toUpperCase()+'_PAK']||new URL('../resources/'+game+'/pak0.pak',import.meta.url).pathname);
 const palette=await readMember(directories.id1.get('gfx/palette.lmp'));
 COM_AddPack(isolatedPack('gfx/palette.lmp',palette));VID_SetPalette(palette);Mod_Init();
 const sources=new Map(),models=new Map(),keys=new Set([...Object.keys(index.nativeHeights),...Object.keys(index.models)]);
 for(const key of keys){
  const name='progs/'+key+'.mdl',byIdentity=new Map();
  for(const[game,directory]of Object.entries(directories))if(directory.has(name)){
   const bytes=await readMember(directory.get(name)),sha=digest(bytes);
   if(byIdentity.has(sha)){byIdentity.get(sha).games.push(game);continue;}
   byIdentity.set(sha,{key,name,sha,bytes,skins:bytes.readInt32LE(48),games:[game]});
  }
  sources.set(key,[...byIdentity.values()]);
 }
 async function modelFor(source){
  const id=source.key+':'+source.sha;
  if(!models.has(id)){
   COM_AddPack(isolatedPack(source.name,source.bytes));const model=new model_t();model.name=source.name;model.needload=true;Mod_LoadModel(model,true);await model.aliasSourceIdentity.promise;
   same(model.aliasSourceIdentity.sha256,source.sha,'loaded identity matches the selected owned bytes '+id);same(model.cache.data.numskins,source.skins,'actual native skin inventory '+id);models.set(id,model);
  }
  return models.get(id);
 }
 const expectedNative=new Map(),expectedCustom=new Map(),nativeDescriptorIds=new Set(),customVariantIds=new Set();
 let nativeDescriptors=0,heightKeys=0,heightVariants=0;
 for(const[key,groups]of Object.entries(index.nativeHeights)){
  check(sources.get(key).length>0,'native height family has an actual owned model '+key);
  for(let skin=0;skin<groups.length;skin++)for(let n=0;n<groups[skin].length;n++){nativeDescriptors++;nativeDescriptorIds.add(key+':'+skin+':'+n);}
  for(const source of sources.get(key))for(let skin=0;skin<source.skins;skin++)for(let frame=0;frame<4;frame++){
   const list=groups[skin]||groups[0],candidate=list?.length?(list.length<=4?list[frame%list.length]:list.filter((_,i)=>(i&3)===frame).at(-1)):null;
   const stored=candidate&&(candidate.nativeModelSha256===undefined||candidate.nativeModelSha256===source.sha)?candidate:null;
   const id=[key,source.sha,skin,frame].join(':');check(!expectedNative.has(id),'unique native key/identity/skin/frame binding');expectedNative.set(id,{source,skin,frame,stored});
  }
 }
 for(const[key,variants]of Object.entries(index.models)){
  if(variants.some(v=>v.maps.height))heightKeys++;
  for(const[variantIndex,variant]of variants.entries())if(variant.maps.height){
   heightVariants++;customVariantIds.add(key+':'+variantIndex);check(skins.ENEMY_SKIN_MODELS.has(key),'every height-bearing replacement uses the enemy scalar path '+key);
   const skin=variant.skin??0,matches=sources.get(key).filter(source=>skin<source.skins&&(variant.nativeModelSha256===undefined||variant.nativeModelSha256===source.sha));
   check(matches.length>0,'every height-bearing variant matches actual owned identity/skin '+key+':'+variantIndex);
   for(const source of matches){const id=[key,source.sha,skin,variant.dir].join(':');check(!expectedCustom.has(id),'unique custom key/identity/skin/directory binding');expectedCustom.set(id,{source,skin,variant,variantIndex});}
  }
 }
 // Catalogue keys, stored descriptors, variant rows and concrete bindings are
 // different inventories. Eel's six skin rows share one directory; unbound
 // legacy entries also match some distinct Rogue models under the same name.
 same(Object.keys(index.nativeHeights).length,23,'native-height catalogue key count');same(nativeDescriptors,28,'explicit stored native descriptors');
 same(Object.keys(index.models).length,36,'whole replacement catalogue key count');same(heightKeys,33,'height-bearing replacement keys');same(heightVariants,51,'height-bearing replacement rows');
 same(expectedNative.size,148,'all native identity/skin/four-frame bindings');same([...expectedNative.values()].filter(x=>x.stored).length,140,'stored native bindings');same([...expectedNative.values()].filter(x=>!x.stored).length,8,'explicit generated native opt-out bindings');
 same(expectedCustom.size,54,'all eligible custom identity/skin bindings');same(new Set([...expectedCustom.values()].map(x=>x.variant.dir)).size,46,'distinct custom directories');
 const doc=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,jobs=[],decoded=new Map(),coverageNative=new Set(),coverageCustom=new Set(),seenDescriptors=new Set(),seenVariants=new Set();
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,progress,error){
  const path=url.split('?')[0];check(path.startsWith('newer/enemies/'),'actual public load path');
  jobs.push((async()=>{let image=decoded.get(path);if(!image){image=await sharp(new URL('../'+path,import.meta.url).pathname).ensureAlpha().raw().toBuffer({resolveWithObject:true});decoded.set(path,image);}const texture=new THREE.DataTexture(new Uint8Array(image.data),image.info.width,image.info.height);done(texture);})().catch(e=>{error?.(e);throw e;}));return new THREE.Texture();
 };
 async function drain(){while(jobs.length)await Promise.all(jobs.splice(0));}
 function verify(material,path,label,descriptor,modelKey,modelSha){
  check(material,label+' actual public material ready');const shader=compile(material,'basic'),normal=shader.uniforms.qrNormal.value,expected=decoded.get(path);check(expected,label+' installed height decoded');
  same(normal.userData.heightSource,true,label+' explicit scalar marker');same(shader.uniforms.uHasSkinHeightShadow.value,1,label+' height-mask compiler activates');same(normal.image.width,expected.info.width,label+' scalar width matches original UV extent');same(normal.image.height,expected.info.height,label+' scalar height matches original UV extent');
  const kernel=[1,8,28,56,70,56,28,8,1],w=expected.info.width,h=expected.info.height,flat=descriptor.heightFlat,mask=new Uint8Array(w*h),probes=[];
  if(flat){
   same(modelKey,'armabody','only Armagon body has semantic flash heights');same(modelSha,'e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151','actual native identity authorizes flash semantics');same(descriptor.nativeModelSha256,modelSha,'flat policy descriptor is identity-bound');same(flat.modelSha256,modelSha,'flat policy model pin');same(flat.policy,'armagon-flash-v1','known flat policy');same(flat.width,w,'flat width');same(flat.height,h,'flat height');check(flat.spans.length>0,'nonempty exact semantic region');
   let previous=-1;for(const[y,start,end]of flat.spans){check([y,start,end].every(Number.isSafeInteger)&&y>=0&&y<h&&start>=0&&end<=w&&start<end&&y*w+start>=previous,'sorted nonoverlapping bounded flat spans');previous=y*w+end;mask.fill(1,y*w+start,y*w+end);probes.push([start,y],[Math.floor((start+end-1)/2),y],[end-1,y]);}
  }
  for(let probe=0;probe<161;probe++)probes.push([probe*47%w,probe*79%h]);
  // Independent oracle: two separable5tap passes equal this9tap convolution.
  // Explicit semantic spans are height1; every other value is decoded red/255.
  // Do not call EnemyHeightScalars here: its contract is checked independently.
  for(const[x,y]of probes){let alpha=0;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const at=((y+dy+h)%h*w+(x+dx+w)%w);alpha+=kernel[dx+4]*kernel[dy+4]*(mask[at]?255:expected.data[at*4])/65536;}check(Math.abs(normal.image.data[(y*w+x)*4+3]-Math.round(alpha))<=1,label+' alpha comes from actual scalar and bounded9tap filter at '+x+','+y);}
 }
 try{
  newerMode.R_AnimSetNewer(true);newerMode.R_AnimSetLighting(true);skins.R_NewerSetIndex(index);
  for(const[id,{source,skin,frame,stored}]of expectedNative){
   const model=await modelFor(source),texture=model.cache.data.gl_texturenum[skin][frame],original=Buffer.from(texture.image.data),material=skins.R_EnemyAliasMaterial(texture,source.name,true,skin,frame,model);await drain();
   if(stored){verify(material,'newer/enemies/'+stored.file,id,stored,source.key,source.sha);const groups=index.nativeHeights[source.key],groupIndex=groups[skin]?skin:0;seenDescriptors.add(source.key+':'+groupIndex+':'+groups[groupIndex].indexOf(stored));}
   else{check(material,id+' generated fallback material');const shader=compile(material,'basic');same(shader.uniforms.uHasSkinHeightShadow.value,1,id+' generated fallback height mask remains active');same(shader.uniforms.qrNormal.value.userData.heightSource,true,id+' generated fallback scalar marker');}
   check(Buffer.from(texture.image.data).equals(original),id+' native diffuse untouched');coverageNative.add(id);console.log('HEIGHT_NATIVE_BINDING '+JSON.stringify({key:source.key,sha:source.sha,games:source.games,skin,frame,stored:stored?.file??null}));
  }
  for(const[id,{source,skin,variant,variantIndex}]of expectedCustom){
   const model=await modelFor(source),entity={_entityIndex:coverageCustom.size+1,model,skinnum:skin};skins.R_NewerAliasMaterial(entity,source.name,true,skin);await drain();const material=skins.R_NewerAliasMaterial(entity,source.name,true,skin);
   verify(material,'newer/enemies/'+variant.dir+'/'+variant.maps.height,id,variant,source.key,source.sha);const diffuse=decoded.get('newer/enemies/'+variant.dir+'/'+variant.maps.diffuse);check(diffuse&&Buffer.from(material.map.image.data).equals(diffuse.data),id+' selected custom diffuse untouched');coverageCustom.add(id);seenVariants.add(source.key+':'+variantIndex);console.log('HEIGHT_CUSTOM_BINDING '+JSON.stringify({key:source.key,sha:source.sha,games:source.games,skin,dir:variant.dir}));
  }
  same(JSON.stringify([...coverageNative].sort()),JSON.stringify([...expectedNative.keys()].sort()),'each native key/skin/frame/identity covered');same(JSON.stringify([...coverageCustom].sort()),JSON.stringify([...expectedCustom.keys()].sort()),'each custom key/skin/identity/directory covered');
  same(JSON.stringify([...seenDescriptors].sort()),JSON.stringify([...nativeDescriptorIds].sort()),'every explicit native descriptor exercised');same(JSON.stringify([...seenVariants].sort()),JSON.stringify([...customVariantIds].sort()),'every custom height variant exercised');
  console.log('HEIGHT_INSTALLED_ASSETS '+JSON.stringify({nativeKeys:23,nativeDescriptors:28,nativeBindings:coverageNative.size,nativeStoredBindings:140,nativeGeneratedBindings:8,catalogueKeys:36,heightKeys:33,heightVariants:51,customBindings:coverageCustom.size,customDirectories:46}));
 }finally{await drain();THREE.TextureLoader.prototype.load=oldLoad;if(doc)Object.defineProperty(globalThis,'document',doc);else delete globalThis.document;}

} ) );

Deno.test( 'actual public decal, portal and level-view sky materials write all four HDR attachments; multiplicative decals preserve normal distances and every packed slot', () => fixture( async () => {

	const decals = await import( '../src/newer/render/r_decals.js' ), portals = await import( '../src/newer/render/gl_portal.js' ), levels = await import( '../src/newer/render/r_levelview.js' ), canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
	const savedDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' ), scene = new THREE.Scene(), diffuse = pixels(); let decal = null, view = null, portalMaterial = null;
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: tag => { same( tag, 'canvas', 'decal public atlas uses canvas' ); return canvas.createCanvas( 1, 1 ); } } } );
	const floor = { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, texturemins: [ -16, -16 ], extents: [ 32, 32 ] }, leaf = { contents: -1, compressed_vis: null, firstmarksurface: [ floor ], nummarksurfaces: 1 }, model = { leafs: [ { contents: -2 }, leaf ], nodes: [ leaf ], numleafs: 1 };
	function allAttachments( fragment, label ) { for ( const [ location, name ] of [ [ 1, 'gNormal' ], [ 2, 'gAlbedo' ], [ 3, 'gHeightMask' ] ] ) { check( new RegExp( 'layout\\(location\\s*=\\s*' + location + '\\)\\s+out\\s+highp\\s+vec4\\s+' + name ).test( fragment ), label + ' declares attachment ' + location ); check( new RegExp( name + '\\s*=' ).test( fragment ), label + ' actually writes attachment ' + location ); } }
	try {

		decals.R_DecalsSetup( { scene, cl: () => ( { worldmodel: model } ), pointInLeaf: () => leaf } ); check( decals.R_DecalPlace( 'hole', [ 0, 0, 1 ], 3, 4 ), 'actual public shot mark creates drawable mesh' ); decal = scene.getObjectByName( 'quake_decals' ); check( decal && decal.geometry.drawRange.count === 12, 'actual decal quad is in scene (a slot is its mark and its blood run, the run fully transparent unless a large wall splash grows one: docs/blood-runs-2026-10-14.md)' ); const ds = compile( decal.material, 'basic' ); allAttachments( ds.fragmentShader, 'decal compiler' ); check( /gNormal\s*=\s*vec4\(\s*1\.0\s*\)/.test( ds.fragmentShader ) && /gHeightMask\s*=\s*vec4\(1\.\)/.test( ds.fragmentShader ), 'actual decal data outputs multiplicative ones' ); same( decal.material.blending, THREE.CustomBlending, 'actual decal custom blend' ); same( decal.material.blendSrc, THREE.DstColorFactor, 'actual source multiplies destination' ); same( decal.material.blendDst, THREE.ZeroFactor, 'no second contribution to packed data' ); same( decal.material.blendEquation, THREE.AddEquation, 'multiplication combined by add equation' );
		// Actual blend equation: source*destination + destination*0. Execute it
		// on every3bit quantization/source position in both valid packet classes.
		for ( const wall of [ false, true ] ) for ( let slot = 0; slot < 10; slot ++ ) for ( let q = 0; q <= 7; q ++ ) { const values = new Array( 10 ).fill( 1 ); values[ slot ] = q / 7; const packet = height.R_HeightShadowPack( values, wall ), blended = Uint8Array.from( packet, destination => Math.round( 1 * destination + 0 * destination ) ); check( Buffer.from( blended ).equals( Buffer.from( packet ) ), 'neutral decal preserves byte-exact packed source/tag bits' ); same( height.R_HeightShadowDecode( blended, slot ), q / 7, 'local visibility survives decal draw' ); }
		for ( const distance of [ 8, 56, 64, 100, 4096 ] ) same( 1 * distance + 0 * distance, distance, 'multiplicative-one normal alpha keeps physical distance' );
		portalMaterial = portals.R_PortalMaterial( { material: null, level: true }, diffuse ); allAttachments( portalMaterial.fragmentShader, 'actual portal material' ); check( /gHeightMask\s*=\s*vec4\(1\.0\)/.test( portalMaterial.fragmentShader ), 'portal writes invalidFF not stale underlying rock tag' ); check( /gNormal\s*=\s*vec4\(\s*0\.5,\s*0\.5,\s*1\.0,\s*-\s*1\.0\s*\)/.test( portalMaterial.fragmentShader ), 'portal retains existing no-main-level-lighting sentinel' );
		const sky = { flags: 4, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: 'sky1', width: 64, height: 64, gl_texture: diffuse }, vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, numedges: 4, firstedge: 0 }; leaf.firstmarksurface = [ sky ]; const preview = { ...model, surfaces: [ sky ], firstmodelsurface: 0, nummodelsurfaces: 1, surfedges: [ 1, 2, 3, 4 ], edges: [ {}, { v: [ 0, 1 ] }, { v: [ 1, 2 ] }, { v: [ 2, 3 ] }, { v: [ 3, 0 ] } ], vertexes: [ [ -16, -16, 0 ], [ 16, -16, 0 ], [ 16, 16, 0 ], [ -16, 16, 0 ] ].map( position => ( { position } ) ), _skySolid: diffuse, _skyAlpha: null };
		view = levels.R_BuildLevelView( preview, [ 0, 0, 8 ] ); check( view && view.group.children.length === 1, 'actual public level preview constructs sky mesh' ); const skyMaterial = view.group.children[ 0 ].material; allAttachments( skyMaterial.fragmentShader, 'actual level-view sky' ); check( /gHeightMask\s*=\s*vec4\(1\.0\)/.test( skyMaterial.fragmentShader ) && /gNormal\s*=\s*vec4\(\s*0\.0\s*\)/.test( skyMaterial.fragmentShader ), 'level sky writes invalidFF and unavailable normal' );

	} finally { decals.R_DecalsClear(); decals.R_DecalsSetup( null ); if ( decal ) { decal.material.map.dispose(); decal.material.dispose(); decal.geometry.dispose(); } view?.dispose(); portalMaterial?.dispose(); diffuse.dispose(); if ( savedDocument ) Object.defineProperty( globalThis, 'document', savedDocument ); else delete globalThis.document; }

} ) );
