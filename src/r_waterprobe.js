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
const LIFT = 36; // the probe sits this far above the surface

let probes = []; // { region, rt, cam, center, min, max, used }
let builtFor = null;

function dispose( p ) {

	p.rt.dispose();

}

export function R_WaterProbeClear() {

	for ( const p of probes ) dispose( p );
	probes = [];
	builtFor = null;

}

const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();

// the probe of a pool, or null if it has none yet
export function R_WaterProbeFor( region ) {

	for ( const p of probes ) if ( p.region === region ) return p;
	return null;

}

export function R_WaterProbes() {

	return probes;

}

/*
================
R_WaterProbeUpdate

Call before the frame is drawn.  regions: the see-through pools near the camera, nearest first (the water,
not the slime).  showAll( true ) makes the whole level drawable and showAll( false ) puts the view's own
visibility back, since the level normally only holds what the player can see.
================
*/
export function R_WaterProbeUpdate( renderer, scene, camera, regions, showAll, allRegions ) {

	if ( allRegions !== builtFor ) {

		R_WaterProbeClear();
		builtFor = allRegions;

	}

	if ( regions.length === 0 ) return;

	_m.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
	_frustum.setFromProjectionMatrix( _m );

	for ( const r of regions ) {

		if ( R_WaterProbeFor( r ) !== null ) continue;

		// in view?
		_box.min.set( r.min[ 0 ], r.min[ 1 ], r.z - 4 );
		_box.max.set( r.max[ 0 ], r.max[ 1 ], r.z + 4 );
		if ( ! _frustum.intersectsBox( _box ) ) continue;

		// one pool at a time
		capture( renderer, scene, r, showAll );
		return;

	}

}

function capture( renderer, scene, r, showAll ) {

	if ( probes.length >= MAX_PROBES ) dispose( probes.shift() );

	const rt = new THREE.WebGLCubeRenderTarget( SIZE, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } );
	const cam = new THREE.CubeCamera( 4, 5000, rt );
	cam.up.set( 0, 0, 1 );

	const cx = ( r.min[ 0 ] + r.max[ 0 ] ) / 2, cy = ( r.min[ 1 ] + r.max[ 1 ] ) / 2;
	cam.position.set( cx, cy, r.z + LIFT );
	cam.updateMatrixWorld( true );

	showAll( true );
	try {

		cam.update( renderer, scene );

	} finally {

		showAll( false );

	}

	probes.push( {
		region: r, rt,
		center: [ cx, cy, r.z + LIFT ],
		min: [ r.min[ 0 ] - SPREAD, r.min[ 1 ] - SPREAD, r.z - 40 ],
		max: [ r.max[ 0 ] + SPREAD, r.max[ 1 ] + SPREAD, r.z + HEIGHT_ABOVE ]
	} );

}
