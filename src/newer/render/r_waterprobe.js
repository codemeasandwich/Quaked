/**
 * @module newer/render/r_waterprobe
 *
 * Reflection probes for water.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `probes`, `builtFor`, `lastCapture`.
 *
 * Errors: throws at 1 place; catches at 1 place.
 */
// Newer Game: reflection probes for water.
//
// The first time a pool comes into view, the level is drawn once in every direction from a point just above
// its surface (a cube map).  The water then uses that picture for everything the screen-space reflection (see
// the composite pass in gl_post.js) cannot find on the screen: what is behind you, above the edge of the
// view, the sky.  It does not depend on where the player is, so it does not go stale when they move, and it
// costs one extra draw per pool instead of one per frame.  The box the picture is treated as having been taken
// in corrects the parallax, so a wall at the edge of the pool is reflected where the wall is.

import * as THREE from 'three';

const SIZE = 256;
const MAX_PROBES = 2;
const SPREAD = 300; // how far beyond the pool the box reaches
const HEIGHT_ABOVE = 520;
// Stay above the cube's four-unit near plane but below low shoreline markers.
// A high capture sees their undersides and can omit them from reflected air rays.
export const WATER_PROBE_LIFT = 6;

let probes = []; // { region, rt, cam, center, min, max, used }
let builtFor = null;
let lastCapture = - 1e9;

function dispose( p ) {

	p.rt.dispose();

}

/**
 * Disposes every probe's cube render target and forgets which region list they were built for, so the next
 * `R_WaterProbeUpdate` starts over. `R_WaterProbeUpdate` calls it itself whenever it is given a different list of all
 * regions (a new map).
 */
export function R_WaterProbeClear() {

	for ( const p of probes ) dispose( p );
	probes = [];
	builtFor = null;
	lastCapture = -1e9;

}

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();

/**
 * The probe of a pool, or null if it has none yet.
 *
 * @param {object} region a liquid region object from `gl_post.js` (compared by identity)
 * @returns {?{ region: object, rt: THREE.WebGLCubeRenderTarget, center: Array<number>, min: Array<number>,
 *   max: Array<number> }} the probe, valid until it is evicted or cleared
 */
export function R_WaterProbeFor( region ) {

	for ( const p of probes ) if ( p.region === region ) return p;
	return null;

}

/**
 * The live probes, oldest first (at most two). The composite pass in `gl_post.js` binds the first two each frame:
 * `rt.texture` as the cube map, `center` as the capture point and `min`/`max` as the parallax box (Quake units, world
 * space; the pool's box widened by 300 units, from 40 below to 520 above the surface).
 *
 * @returns {Array<{ region: object, rt: THREE.WebGLCubeRenderTarget, center: Array<number>, min: Array<number>,
 *   max: Array<number> }>} the module's own array (replaced on clear; do not mutate)
 */
export function R_WaterProbes() {

	return probes;

}
/**
 * Counts, among the (at most two) nearest pools that can have a probe and are in the camera's view, those that already
 * have one and those still waiting. Used by `R_WaterStartupStatus` (`gl_post.js`) to hold the start-up picture until
 * reflections are captured.
 *
 * @param {THREE.Camera} camera the view camera (its projection and world-inverse matrices must be current)
 * @param {Array<{ min: Array<number>, max: Array<number>, z: number, probePoints?: ?Array<Array<number>> }>} regions see-through pools near the camera, nearest first; `min`/`max` are
 *   the pool's xy bounds and `z` its surface height (Quake units); a pool with an empty `probePoints` has no safe
 *   capture point and is skipped
 * @returns {{ pending: number, ready: number }} the two counts
 */
export function R_WaterProbeReadiness(camera,regions){
 _m.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);_frustum.setFromProjectionMatrix(_m);
 let pending=0,ready=0;
 for(const r of regions.filter(r=>r.probePoints==null||r.probePoints.length>0).slice(0,MAX_PROBES)){
  _box.min.set(r.min[0],r.min[1],r.z-4);_box.max.set(r.max[0],r.max[1],r.z+4);
  if(!_frustum.intersectsBox(_box))continue;
  if(R_WaterProbeFor(r))ready++;else pending++;
 }
 return {pending,ready};
}

/*
================
R_WaterProbeUpdate

Call before the frame is drawn.  regions: the see-through pools near the camera, nearest first (the water,
including reflective toxic liquid).  showAll( true ) makes the whole level drawable and showAll( false ) puts the view's own
visibility back, since the level normally only holds what the player can see.
================
*/
/**
 * Captures at most one new probe per call, and (unless `initializing`) at most one a second: the first of the two
 * nearest pools that is in view and has no probe gets a 256-texel half-float cube map drawn from just above its surface
 * (`WATER_PROBE_LIFT` units, or from the nearest of its verified air `probePoints`), with the first-person weapon
 * hidden. When two probes exist the oldest is disposed first. Called each frame by `R_WaterProbesFrame` (`gl_post.js`).
 * Probes persist until evicted or until `allRegions` changes.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer; its render target, cube face, mip level and XR flag are restored
 * @param {THREE.Scene} scene the scene to capture
 * @param {THREE.Camera} camera the view camera, for the in-view test
 * @param {Array<{ min: Array<number>, max: Array<number>, z: number, probePoints?: ?Array<Array<number>> }>} regions see-through pools near the camera, nearest first
 * @param {function(boolean): void} showAll `showAll( true )` makes the whole level drawable, `showAll( false )` puts the
 *   view's own visibility back
 * @param {Array<object>} allRegions every liquid region of the level; a different array clears all probes
 * @param {{ initializing?: boolean }} [options] `initializing` lifts the one-a-second limit (start-up capture)
 * @throws {*} whatever the cube camera's render throws (the new target is disposed and the renderer state restored)
 */
export function R_WaterProbeUpdate( renderer, scene, camera, regions, showAll, allRegions, { initializing = false } = {} ) {

	if ( allRegions !== builtFor ) {

		R_WaterProbeClear();
		builtFor = allRegions;

	}

	// only the nearest pools get probes (the most that are kept): with more candidates than probes, each frame would
	// throw one away and draw it again
	// Exclude mapped pools without safe air before selecting the nearest budget.
	regions = regions.filter( r => r.probePoints == null || r.probePoints.length > 0 ).slice( 0, MAX_PROBES );
	if ( regions.length === 0 ) return;

	// and never more than one capture a second
	const t = performance.now();
	if ( !initializing && t - lastCapture < 1000 ) return;

	_m.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
	_frustum.setFromProjectionMatrix( _m );

	for ( const r of regions ) {


		if ( R_WaterProbeFor( r ) !== null ) continue;

		// in view?
		_box.min.set( r.min[ 0 ], r.min[ 1 ], r.z - 4 );
		_box.max.set( r.max[ 0 ], r.max[ 1 ], r.z + 4 );
		if ( ! _frustum.intersectsBox( _box ) ) continue;

		// one pool at a time
		lastCapture = t;
		capture( renderer, scene, r, showAll );
		return;

	}

}

function capture( renderer, scene, r, showAll ) {

	if ( probes.length >= MAX_PROBES ) dispose( probes.shift() );

	const rt = new THREE.WebGLCubeRenderTarget( SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } );
	const cam = new THREE.CubeCamera( 4, 5000, rt );
	cam.up.set( 0, 0, 1 );

	let cx = ( r.min[ 0 ] + r.max[ 0 ] ) / 2, cy = ( r.min[ 1 ] + r.max[ 1 ] ) / 2, cz = r.z + WATER_PROBE_LIFT;
	// A merged L-shaped pool's box centre can be inside a wall. Map building
	// supplies actual water-polygon centres verified to be air at capture height.
	let nearest = null, distance = Infinity;
	for ( const point of r.probePoints || [] ) {
		const d = ( point[ 0 ] - cx ) ** 2 + ( point[ 1 ] - cy ) ** 2;
		if ( d < distance ) { nearest = point; distance = d; }
	}
	if ( nearest ) [ cx, cy, cz ] = nearest;
	cam.position.set( cx, cy, cz );
	cam.updateMatrixWorld( true );

	showAll( true );
	const hidden = [];
	const previousTarget = renderer.getRenderTarget();
	const previousFace = renderer.getActiveCubeFace();
	const previousMip = renderer.getActiveMipmapLevel();
	const previousXR = renderer.xr.enabled;
	// A cached environment capture must not retain the first-person weapon
	// with its special depth range as a floating object in every reflection.
	scene.traverse( o => {

		if ( o.userData.quakeViewmodel && o.visible ) { o.visible = false; hidden.push( o ); }

	} );
	try {

		cam.update( renderer, scene );

	} catch ( error ) {

		rt.dispose();
		throw error;

	} finally {

		for ( const o of hidden ) o.visible = true;
		renderer.setRenderTarget( previousTarget, previousFace, previousMip );
		renderer.xr.enabled = previousXR;

		showAll( false );

	}

	probes.push( {
		region: r, rt,
		center: [ cx, cy, cz ],
		min: [ r.min[ 0 ] - SPREAD, r.min[ 1 ] - SPREAD, r.z - 40 ],
		max: [ r.max[ 0 ] + SPREAD, r.max[ 1 ] + SPREAD, r.z + HEIGHT_ABOVE ]
	} );

}
