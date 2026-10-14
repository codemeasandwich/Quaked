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

//============================================================================
// The sun's shadow map, cached
//
// The level in the sun's map (the occluder) never moves, but the map follows the view, so it was drawn again from the
// whole level every frame: over a million triangles a frame in the demos. Now the occluder's depth is drawn into a
// larger cache, SUN_CACHE_MARGIN texels wider each side on the same texel grid, and drawn again only when the view
// has moved beyond that margin (across or along the sun), the occluder is rebuilt or the sun turns. Each frame the
// map's window is copied out of the cache (the same texels; their depths moved from the cache camera's range to the
// map camera's) and what moves is drawn over it. Only an occluder face less than one unit in front of the map
// camera's near plane, 3400 units sunward of the view, could come out differently: as shadow.
//============================================================================

export const SUN_CACHE_MARGIN = 512;
let shadowCache = true, sunShadowCache = true;
/**
 * Tests and trials only: turns the shadow caching off (every light's cube and the whole sun map drawn again every
 * frame, as before 14 October 2026) or back on, so the same frame can be compared both ways.
 *
 * @param {boolean} on
 * @param {'both'|'point'|'sun'} [which='both'] the point lights' cubes, the sun's map, or both
 */
export function R_ShadowCacheEnable( on, which = 'both' ) { if ( which !== 'sun' ) shadowCache = on !== false; if ( which !== 'point' ) sunShadowCache = on !== false; sunCache.valid = false; }
const SUN_CACHE_SIZE = SUN_SHADOW_SIZE + 2 * SUN_CACHE_MARGIN;
const sunCache = { target: null, camera: null, scene: null, centre: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(),
	dir: new THREE.Vector3(), occluder: null, valid: false, renders: 0, copies: 0, fallbacks: 0 };
let sunCopy = null;

/**
 * Where this frame's sun map lies in the cache and whether the cache must be drawn again. Pure (exported for tests).
 * The map's texel ( i, j ) is the cache's ( i + margin + across, j + margin + upward ), both on one texel grid; a depth
 * moves from the cache camera's range to the map camera's: z = uA + zCache * uB, from
 * z = ( cacheNear + zCache * ( cacheFar - cacheNear ) + along - near ) / ( far - near ).
 *
 * @param {{ valid: boolean, sameOccluder: boolean, sameSun: boolean, delta: Array<number>, right: Array<number>,
 *   up: Array<number>, dir: Array<number>, texel: number, pad: number, near: number, far: number, cacheNear: number,
 *   cacheFar: number }} s `delta` the map's centre minus the cache's (world units); `right`, `up`, `dir` the cache's
 *   axes; `pad` how far along the sun the view may move (units)
 * @returns {{ stale: boolean, offset: Array<number>, uA: number, uB: number }} (`stale` also for a NaN centre)
 */
export function R_SunCachePlan( s ) {

	const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
	const across = Math.round( dot( s.delta, s.right ) / s.texel ), upward = Math.round( dot( s.delta, s.up ) / s.texel ), along = dot( s.delta, s.dir );
	const stale = ! s.valid || ! s.sameOccluder || ! s.sameSun || ! ( Math.abs( across ) <= SUN_CACHE_MARGIN ) ||
		! ( Math.abs( upward ) <= SUN_CACHE_MARGIN ) || ! ( Math.abs( along ) <= s.pad );
	const range = s.far - s.near;
	return { stale, offset: [ SUN_CACHE_MARGIN + across, SUN_CACHE_MARGIN + upward ], uA: ( s.cacheNear + along - s.near ) / range, uB: ( s.cacheFar - s.cacheNear ) / range };

}

// whether every occluder corner stays at least `pad` beyond the map camera's near plane, so no view within the cache's
// reach ever clips any of it (the copy cannot show what a clipped face hides): false for very tall maps, which keep
// the whole redraw each frame
function sunCacheSafe( cam, pad ) {

	const geometry = occluder.geometry;
	if ( geometry.boundingBox === null ) geometry.computeBoundingBox();
	const box = geometry.boundingBox, corner = new THREE.Vector3();
	for ( let i = 0; i < 8; i ++ ) {

		corner.set( i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z );
		if ( ! ( new THREE.Vector3().subVectors( cam.position, corner ).dot( _sunDir ) >= cam.near + pad ) ) return false;

	}
	return true;

}

function sunCacheReady( renderer, p, cam, texel ) {

	const pad = SUN_CACHE_MARGIN * texel;
	if ( ! sunCacheSafe( cam, pad ) ) { sunCache.fallbacks ++; return false; }
	if ( sunCache.target === null ) {

		sunCache.target = new THREE.WebGLRenderTarget( SUN_CACHE_SIZE, SUN_CACHE_SIZE, { format: THREE.RedFormat, depthBuffer: true,
			depthTexture: new THREE.DepthTexture( SUN_CACHE_SIZE, SUN_CACHE_SIZE ), generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		sunCache.target.texture.name = 'quake_sun_shadow_cache';
		sunCache.camera = new THREE.OrthographicCamera();
		sunCache.scene = new THREE.Scene();
		sunCopy = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ), material: new THREE.ShaderMaterial( {
			glslVersion: THREE.GLSL3, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, colorWrite: false, // (with the test off nothing would be written)
			uniforms: { tCache: { value: null }, uOffset: { value: new THREE.Vector2() }, uA: { value: 0 }, uB: { value: 1 } },
			vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
			// (beyond the map camera's far plane, or nothing there: the clear value; nothing can be in front of its near plane)
			fragmentShader: 'precision highp float; precision highp sampler2D; uniform sampler2D tCache; uniform vec2 uOffset; uniform float uA; uniform float uB;\n' +
				'void main() { float z = texelFetch( tCache, ivec2( gl_FragCoord.xy ) + ivec2( uOffset ), 0 ).r; float moved = uA + z * uB; gl_FragDepth = z >= 1.0 || moved >= 1.0 ? 1.0 : max( moved, 0.0 ); }'
		} ) };
		// (a private one-attachment depth pass: the engine's G-buffer patch of ordinary materials must not touch it)
		sunCopy.material.onBeforeCompile = () => {};
		sunCopy.material.customProgramCacheKey = () => 'quake-sun-shadow-cache-copy-v2';
		const triangle = new THREE.BufferGeometry();
		triangle.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
		const quad = new THREE.Mesh( triangle, sunCopy.material ); quad.frustumCulled = false; sunCopy.scene.add( quad );

	}
	const c = sunCache.camera;
	const plan = () => R_SunCachePlan( { valid: sunCache.valid, sameOccluder: sunCache.occluder === occluder, sameSun: sunCache.dir.equals( _sunDir ),
		delta: new THREE.Vector3().subVectors( _sunCenter, sunCache.centre ).toArray(), right: sunCache.right.toArray(), up: sunCache.up.toArray(),
		dir: sunCache.dir.toArray(), texel, pad, near: cam.near, far: cam.far, cacheNear: c.near, cacheFar: c.far } );
	let where = plan();
	if ( where.stale ) {

		// draw the occluder alone into the cache, centred where the map is now, with room the view may move into
		const extent = SUN_SHADOW_EXTENT * SUN_CACHE_SIZE / SUN_SHADOW_SIZE;
		Object.assign( c, { left: - extent, right: extent, top: extent, bottom: - extent, near: cam.near - pad, far: cam.far + pad } );
		c.up.copy( cam.up ); c.position.copy( cam.position ); c.quaternion.copy( cam.quaternion ); c.updateProjectionMatrix(); c.updateMatrixWorld( true );
		c.layers.set( SUN_SHADOW_LAYER );
		sunCache.scene.overrideMaterial = p.sunOverride;
		sunCache.valid = false; // (until the draw has finished)
		const parent = occluder.parent, autoClear = renderer.autoClear;
		sunCache.scene.add( occluder );
		try {

			renderer.setRenderTarget( sunCache.target );
			renderer.clear( true, true, false );
			renderer.autoClear = false;
			renderer.render( sunCache.scene, c );

		} finally { renderer.autoClear = autoClear; if ( parent ) parent.add( occluder ); }
		sunCache.centre.copy( _sunCenter ); sunCache.right.copy( _sunRight ); sunCache.up.copy( _sunUp ); sunCache.dir.copy( _sunDir );
		sunCache.occluder = occluder; sunCache.valid = true; sunCache.renders ++;
		where = plan();

	}
	const u = sunCopy.material.uniforms;
	u.uOffset.value.fromArray( where.offset ); u.uA.value = where.uA; u.uB.value = where.uB;
	return true;

}

/**
 * Lets the sun shadow cache's GPU resources go and resets the caching (on; nothing cached). Called by `R_PostShutdown`
 * (gl_post.js).
 */
export function R_SunShadowCacheDispose() {

	sunCache.target?.dispose(); sunCache.target?.depthTexture?.dispose(); sunCache.target = null; sunCache.valid = false; sunCache.occluder = null;
	if ( sunCopy ) { sunCopy.material.dispose(); sunCopy.scene.children[ 0 ]?.geometry.dispose(); sunCopy = null; }
	shadowCache = true; sunShadowCache = true;

}

/**
 * The sun shadow cache's counts, for tests and the profiler: how often the level was drawn into it and copied out.
 *
 * @returns {{ renders: number, copies: number, fallbacks: number, valid: boolean }} (`fallbacks`: frames drawn whole because the
 *   map is too tall for the cache)
 */
export function R_SunShadowCacheStatus() { return { renders: sunCache.renders, copies: sunCache.copies, fallbacks: sunCache.fallbacks, valid: sunCache.valid }; }

/** Tests and trials only: the cache's depth texture (null before the first cached frame). */
export function R_SunShadowCacheTexture() { return sunCache.target?.depthTexture ?? null; }

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
	renderer.setClearColor( 0xffffff, 1 );
	try {

		if ( sunShadowCache && occluder !== null && sunCacheReady( renderer, p, cam, texel ) ) {

			// the level from the cache (copied onto the same texel grid, its depths moved to this view's range), then only
			// what moves (monsters, items, the axe's cut halves) drawn over it, depth tested as one draw of both would be
			renderer.setRenderTarget( p.sunTarget );
			sunCopy.material.uniforms.tCache.value = sunCache.target.depthTexture;
			// (the copied depth must survive the second draw: no automatic clear, and no background, which three.js clears
			// the target for whatever autoClear says)
			const autoClear = renderer.autoClear, background = scene.background;
			renderer.autoClear = false; scene.background = null;
			occluder.visible = false;
			try { renderer.render( sunCopy.scene, sunCopy.camera ); renderer.render( scene, cam ); }
			finally { occluder.visible = true; renderer.autoClear = autoClear; scene.background = background; }
			sunCache.copies ++;

		} else {

			renderer.setRenderTarget( p.sunTarget );
			renderer.clear( true, true, false );
			renderer.render( scene, cam );

		}

	} finally {

		scene.overrideMaterial = override;
		renderer.setClearColor( _clearColor, clearAlpha );

	}

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
  postState.gpu.pointShadows.update(renderer,shadowSources,spotCasters,{frozenPose:R_IntroLoadingHolding(),cache:shadowCache});
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
  // (a map's own sun colour tints it as it tints the surfaces' sunlight; without one, as before)
  sun: { direction: skyState.sunDirection, on: postState.glowActive && hasSkyView, color: skyState.sunColor ? SUN_SURFACE_COLOR.map( ( c, i ) => c * ( 0.6 + 0.4 * skyState.sunColor[ i ] ) ) : SUN_SURFACE_COLOR },
  spot: { position: beam.pos, range: 1500, direction: beam.dir, cone: [ FLASHLIGHT_INNER, FLASHLIGHT_OUTER ], on: postState.glowActive && beam.on,
   color: [ SPOT_POWER, SPOT_POWER * .985, SPOT_POWER * .96 ] }
 } );
 R_HeightShadowScope( masks );
}
