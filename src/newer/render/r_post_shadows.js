/**
 * @module newer/render/r_post_shadows
 *
 * The post pipeline's shadows (card [44h], split from gl_post.js): the sun occluder made from the map's world, the
 * sun's shadow map, and each frame's point-light, near-sun, spot and height-mask shadows.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `occluder`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * The shadow targets live in the pipeline (`postState.gpu`); this module draws into them and sets their uniforms.
 */
import * as THREE from 'three';
import { postState } from './r_post_state.js';
import { skyState } from './r_post_sky.js';
import { SURF_DRAWSKY, SURF_DRAWTURB, SUN_SHADOW_LAYER, SUN_SHADOW_DEPTH, SUN_SHADOW_EXTENT, SUN_SHADOW_SIZE, EMITTER_LIGHT_GAIN, MAX_VOLUME_LIGHTS, SUN_SURFACE_COLOR, SPOT_POWER, r_pointshadows } from './r_post_config.js';
import { R_NewerGame, r_newer_normals, r_newer_textures, r_newer_shadows } from '../mode.js';
import { R_DemonBakePrepare, R_DemonBakeSurface } from '../assets/r_demonbakes.js';
import { R_DemonSurfaceData } from './r_demonrelief.js';
import { R_ArchSurfaceHidden } from './r_archframe.js';
import { R_IntroLoadingHolding } from '../ui/r_demoloading.js';
import { FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { r_heightshadows, R_HeightShadowFrame, R_HeightShadowScope } from './r_heightshadows.js';
//============================================================================
// Sun occluder
//
// The sun's shadow map must contain the whole map, not just what happens to be
// visible or loaded this frame: a ceiling that is not being drawn would let the
// sun through into a closed room.  So the shadow casters are their own static
// mesh, built once per map from every solid world surface (no sky, no liquids),
// and only ever seen by the shadow camera.
//============================================================================

let occluder = null;

/**
 * The sun occluder, the map's whole world geometry on the sun shadow layer, or null before `R_BuildSunOccluder`.
 *
 * @returns {?THREE.Mesh} the live mesh (owned here; do not dispose)
 */
export function R_PostOccluder() {

	return occluder;

}

function disposeOccluder() {

	if ( occluder === null ) return;
	if ( occluder.parent != null ) occluder.parent.remove( occluder );
	postState.gpu?.pointShadows?.setGeometry( null );
	occluder.geometry.dispose();
	occluder = null;

}

/**
 * Builds the sun occluder for a map: one static mesh, on `SUN_SHADOW_LAYER` only, of every solid world surface
 * (no sky, no liquids, no hidden arch surfaces in Newer), with the retained wall relief in Newer Game when
 * normals and textures are on. Disposes the previous occluder first and gives the geometry to the point-shadow
 * atlas. Called by gl_rsurf.js `R_BuildWorldOccluder` and when demon relief bakes arrive (r_demonbakes.js).
 * Kept until the next build.
 *
 * @param {?object} model the world brush model
 * @returns {number} the number of triangles in the occluder; 0 when there is no model or nothing to cast
 */
export function R_BuildSunOccluder( model ) {
	const bake=model&&R_NewerGame()&&r_newer_normals.value!==0&&r_newer_textures.value!==0?R_DemonBakePrepare(model,model.surfaces||[]):null;

	disposeOccluder();
	if ( model == null || model.surfaces == null ) return 0;

	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );
	let positions = [];const chunks=[];

	for ( let i = first; i < last; i ++ ) {

		const surf = model.surfaces[ i ];
		if ( surf == null || surf.polys == null ) continue;
		if ( R_NewerGame() && R_ArchSurfaceHidden( surf ) ) continue;
		if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;

		for ( let p = surf.polys; p; p = p.next ) {

			const v = p.verts;
			const at = ( n, k ) => v instanceof Float32Array ? v[ n * 7 + k ] : v[ n ][ k ];

			for ( let n = 2; n < p.numverts; n ++ ) {

				for ( const idx of [ 0, n - 1, n ] )
					positions.push( at( idx, 0 ), at( idx, 1 ), at( idx, 2 ) );

			}

		}
		// The retained wall backing plus its actual raised relief forms the
		// same occluder seen by the enhanced scene. Classic keeps native geometry.
		if ( R_NewerGame() && r_newer_normals.value !== 0 && r_newer_textures.value !== 0 ) {

			const prepared=R_DemonBakeSurface(surf);
			const relief = bake?.status==='loading'||bake?.status==='error'?null:prepared.status==='ready'?prepared.data:prepared.status==='unprepared'?R_DemonSurfaceData(surf):null;
			if(relief){if(positions.length){chunks.push({positions:new Float32Array(positions)});positions=[];}chunks.push(relief.interleaved?{interleaved:relief.interleaved,indices:relief.indices}:{positions:relief.positions});}

		}

	}

	if(positions.length)chunks.push({positions:new Float32Array(positions)});
 const indexed=chunks.some(c=>c.interleaved);
 const vertices=chunks.reduce((sum,c)=>sum+(c.interleaved?c.interleaved.length/10:c.positions.length/3),0);
 const corners=chunks.reduce((sum,c)=>sum+(c.indices?c.indices.length:c.positions.length/3),0);if(!corners)return 0;
 const combined=new Float32Array(vertices*3),order=indexed?new Uint32Array(corners):null;let base=0,corner=0;
 for(const c of chunks){
  const count=c.interleaved?c.interleaved.length/10:c.positions.length/3;
  if(c.interleaved){for(let i=0;i<count;i++){combined[(base+i)*3]=c.interleaved[i*10];combined[(base+i)*3+1]=c.interleaved[i*10+1];combined[(base+i)*3+2]=c.interleaved[i*10+2];}}
  else combined.set(c.positions,base*3);
  if(order){if(c.indices)for(const index of c.indices)order[corner++]=base+index;else for(let i=0;i<count;i++)order[corner++]=base+i;}
  base+=count;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(combined,3));
 if(order)geometry.setIndex(new THREE.BufferAttribute(order,1));geometry.computeBoundingSphere();

	occluder = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
	occluder.name = 'quake_sun_occluder';
	if ( occluder.layers !== undefined ) occluder.layers.set( SUN_SHADOW_LAYER ); // invisible to every ordinary camera
	occluder.matrixAutoUpdate = false;
	postState.gpu?.pointShadows?.setGeometry( geometry );

	return corners / 3;
}

/**
 * Direct access to the point-shadow atlas, for GPU trials (not used by the engine).
 *
 * @returns {?PointShadowAtlas} the pipeline's live atlas, or null before the pipeline exists
 */
export function R_PointShadowAtlas() { return postState.gpu?.pointShadows || null; }
/**
 * Point-shadow residency for the start-up status (gl_rmain.js).
 *
 * @returns {object} the atlas's `status()` (counts of ready, pending and resident slots, chunks, captures...), or
 *   `{ ready: 0, pending: 0, resident: 0, chunks: 0 }` before the pipeline exists
 */
export function R_PointShadowStatus() { return postState.gpu?.pointShadows?.status() || { ready: 0, pending: 0, resident: 0, chunks: 0 }; }
/**
 * Makes the point-shadow atlas drop its borrowed clone of a dynamic caster (r_axecorpses.js, as a mesh is disposed),
 * so no reference to its geometry is kept. Does nothing before the pipeline exists.
 *
 * @param {THREE.Mesh} mesh the mesh previously drawn as a dynamic caster
 */
export function R_ReleaseShadowCaster( mesh ) { postState.gpu?.pointShadows?.forgetDynamic( mesh ); }

const _sunRight = new THREE.Vector3();
const _sunUp = new THREE.Vector3();
const _sunCenter = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _clearColor = new THREE.Color();

// Depth of the world as the sun sees it.  Sky is not on the shadow layer, so
// skylights and windows let the light through.
/**
 * Renders the world's depth as the sun sees it (the occluder on the sun shadow layer; sky is not on it, so skylights
 * and windows let the light through) into the pipeline's sun target, and gives the composite its view-projection.
 * Called by `R_PostFinish` while the sun shines into the view.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene
 * @param {THREE.Camera} camera the view camera (the shadowed area follows it)
 */
export function R_PostRenderSunShadow( renderer, scene, camera ) {

	const p = postState.gpu;
	const cam = p.sunCamera;

	_sunDir.set( skyState.sunDirection[ 0 ], skyState.sunDirection[ 1 ], skyState.sunDirection[ 2 ] ).normalize();

	const e = camera.matrixWorld.elements;
	_sunCenter.set( e[ 12 ], e[ 13 ], e[ 14 ] );

	cam.up.set( 0, 0, 1 );
	if ( Math.abs( _sunDir.z ) > 0.95 ) cam.up.set( 1, 0, 0 );

	// snap the centre to whole shadow texels so the shadows don't crawl
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	const m = cam.matrixWorld.elements;
	_sunRight.set( m[ 0 ], m[ 1 ], m[ 2 ] );
	_sunUp.set( m[ 4 ], m[ 5 ], m[ 6 ] );
	const texel = ( SUN_SHADOW_EXTENT * 2 ) / SUN_SHADOW_SIZE;
	const cr = _sunCenter.dot( _sunRight ), cu = _sunCenter.dot( _sunUp );
	_sunCenter.addScaledVector( _sunRight, - ( cr - Math.round( cr / texel ) * texel ) );
	_sunCenter.addScaledVector( _sunUp, - ( cu - Math.round( cu / texel ) * texel ) );
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	cam.matrixWorldInverse.copy( cam.matrixWorld ).invert();

	cam.layers.set( SUN_SHADOW_LAYER );
	if ( occluder !== null && occluder.parent !== scene ) scene.add( occluder );

	renderer.getClearColor( _clearColor );
	const clearAlpha = renderer.getClearAlpha();
	const override = scene.overrideMaterial;

	scene.overrideMaterial = p.sunOverride;
	renderer.setRenderTarget( p.sunTarget );
	renderer.setClearColor( 0xffffff, 1 );
	renderer.clear( true, true, false );
	renderer.render( scene, cam );

	scene.overrideMaterial = override;
	renderer.setClearColor( _clearColor, clearAlpha );

	p.shared.uSunVP.value.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );
	p.shared.tSunShadow.value = p.sunTarget.depthTexture;

}

/**
 * This frame's shadows, once its lights are chosen (from `R_PostLightsFrame`): the point-light cube shadows of the
 * chosen lights' sources and the frame's casters, the near sun shadow, the flashlight's spot shadow, the height-mask
 * shadows, and the composite's shadow uniforms for each.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene (traversed for the casters)
 * @param {THREE.Camera} camera the view camera
 * @param {Array<object>} lights the frame's chosen lights (copies, as the frame snapshot holds them)
 * @param {object} beam the flashlight's beam this frame (a copy)
 * @param {boolean} hasSkyView whether the view can see sky (the sun shines only then)
 */
export function R_PostShadowsFrame( renderer, scene, camera, lights, beam, hasSkyView ) {
 const sh = postState.gpu.shared, shadowSources = [];
 for ( const light of lights ) if ( light.source ) shadowSources.push( { source: light.source, position: light.worldPos,
  far: light.source.pos?130+170*Math.sqrt(light.source.power*(light.source.emitter===1?EMITTER_LIGHT_GAIN:1)*2.25):light.range*1.5, live: !light.source.pos||light.source.bestiary===true } );
 shadowSources.sort((a,b)=>Number(b.live)-Number(a.live));
 const spotCasters=[];
 if(postState.glowActive&&r_pointshadows.value!==0){
  scene.updateMatrixWorld(true);
  scene.traverse(object=>{
   if(!object.isMesh||!object.visible)return;
   const aliasOwner=object._quakeOwner,brushOwner=object.parent?._quakeOwner;
   const physicalAlias=aliasOwner?._aliasMesh===object&&!/flame|bolt|eyes/.test(aliasOwner.model?.name||'');
   const physicalBrush=brushOwner?._brushGroup===object.parent&&!object.userData.quakeLiquid; // (a brush entity's liquid or window face casts no shadow, as the world's do not)
   object.userData.quakePhysicalAlias=physicalAlias;
   if((physicalAlias||object.userData.quakeAxePart===true)&&r_newer_shadows.value!==0||physicalBrush)spotCasters.push(object);
  });
  postState.gpu.pointShadows.update(renderer,shadowSources,spotCasters,{frozenPose:R_IntroLoadingHolding()});
 }
 postState.gpu.pointShadows.updateSun(renderer,{on:postState.glowActive&&hasSkyView&&r_pointshadows.value!==0,direction:skyState.sunDirection,focus:camera.position.toArray()},spotCasters);
 sh.tNearSunShadow.value=postState.gpu.pointShadows.sunTexture;sh.uNearSunShadowVP.value.copy(postState.gpu.pointShadows.sunVP);sh.uNearSunShadowOn.value=postState.gpu.pointShadows.sunReady?1:0;
 sh.tPointShadow.value = postState.gpu.pointShadows.target.texture;
 for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {
  const source = lights[ i ]?.source;
  const shadow = postState.glowActive && r_pointshadows.value !== 0 && source ? postState.gpu.pointShadows.lookup( source ) : null;
  sh.uPointShadowInfo.value[ i ].set( shadow?.ready ? shadow.slot : -1, shadow?.far || 0 );
 }
 if(postState.glowActive && beam.on && r_pointshadows.value!==0) {
  postState.gpu.pointShadows.updateSpot(renderer,{...beam,range:1500,outerCos:FLASHLIGHT_OUTER},spotCasters);
 } else postState.gpu.pointShadows.clearSpot();
 sh.tSpotShadow.value=postState.gpu.pointShadows.spotTexture;
 sh.uSpotShadowVP.value.copy(postState.gpu.pointShadows.spotVP);
 sh.uSpotShadowLightWorld.value.set(...beam.pos,1500);
 sh.uSpotWorldShadowOn.value=postState.glowActive && beam.on && r_pointshadows.value!==0 && postState.gpu.pointShadows.spotReady?1:0;
 const masks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0 && postState.gpu.hdr?.textures.length === 4;
 sh.tHeightShadow.value = masks ? postState.gpu.hdr.textures[ 3 ] : null; sh.uHeightMasks.value = masks ? 1 : 0;
 R_HeightShadowFrame( {
  points: lights.map( light => ( { position: light.worldPos, range: light.range, color: light.color, direction:light.direction, cone:light.cone } ) ),
  sun: { direction: skyState.sunDirection, on: postState.glowActive && hasSkyView, color: SUN_SURFACE_COLOR },
  spot: { position: beam.pos, range: 1500, direction: beam.dir, cone: [ FLASHLIGHT_INNER, FLASHLIGHT_OUTER ], on: postState.glowActive && beam.on,
   color: [ SPOT_POWER, SPOT_POWER * .985, SPOT_POWER * .96 ] }
 } );
 R_HeightShadowScope( masks );
}
