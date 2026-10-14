// The sun shadow map's cache (src/newer/render/r_post_shadows.js, docs/demo-performance-2026-10-14.md): when the cached
// level depth must be drawn again, where this frame's map lies in it, and how its depths move to the map camera's range.
// The pure plan, R_SunCachePlan; the GPU copy itself is compared with the full draw by tests/shadow_cache_trial.mjs.
import * as THREE from 'three';
const { R_SunCachePlan, SUN_CACHE_MARGIN } = await import( '../src/newer/render/r_post_shadows.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} !== ${b}` ), near = ( a, b, m ) => check( Math.abs( a - b ) < 1e-9, `${m}: ${a} != ${b}` );
const texel = 3400 / 2048, pad = SUN_CACHE_MARGIN * texel, right = [ 1, 0, 0 ], up = [ 0, 1, 0 ], dir = [ 0, 0, 1 ];
const plan = ( delta, more = {} ) => R_SunCachePlan( { valid: true, sameOccluder: true, sameSun: true, delta, right, up, dir, texel, pad, near: 1, far: 6800, cacheNear: 1 - pad, cacheFar: 6800 + pad, ...more } );

Deno.test( 'the cache is drawn again only beyond its margin, for a new occluder or sun, when invalid, or for a NaN centre', () => {
 same( plan( [ 0, 0, 0 ] ).stale, false, 'centred' );
 same( plan( [ 512 * texel, 0, 0 ] ).stale, false, '512 texels across: inside' );
 same( plan( [ 513 * texel, 0, 0 ] ).stale, true, '513 across: beyond' );
 same( plan( [ 0, - 512 * texel, 0 ] ).stale, false, '512 down: inside' );
 same( plan( [ 0, - 513 * texel, 0 ] ).stale, true, '513 down: beyond' );
 same( plan( [ 0, 0, pad ] ).stale, false, 'along the sun by the pad: inside' );
 same( plan( [ 0, 0, pad + 1 ] ).stale, true, 'beyond the pad' );
 for ( const key of [ 'valid', 'sameOccluder', 'sameSun' ] ) same( plan( [ 0, 0, 0 ], { [ key ]: false } ).stale, true, key + ' false' );
 same( plan( [ NaN, 0, 0 ] ).stale, true, 'a NaN centre is never trusted' );
} );

Deno.test( 'the map\'s texels sit at margin + offset in the cache, in the direction the view moved', () => {
 const p = plan( [ 3 * texel, - 7 * texel, 0 ] );
 same( p.offset.join(), `${SUN_CACHE_MARGIN + 3},${SUN_CACHE_MARGIN - 7}`, 'three texels right, seven down' );
} );

Deno.test( 'a depth in the cache becomes the depth the map camera would have drawn (both real orthographic cameras)', () => {
 const dirV = new THREE.Vector3( - .28, - .18, .94 ).normalize(), centre = new THREE.Vector3( 100, 200, 50 ), depth = 3400;
 const camera = ( c, nearZ, farZ ) => { const cam = new THREE.OrthographicCamera( - 1700, 1700, 1700, - 1700, nearZ, farZ ); cam.up.set( 0, 0, 1 ); cam.position.copy( c ).addScaledVector( dirV, depth ); cam.lookAt( c ); cam.updateMatrixWorld( true ); cam.updateProjectionMatrix(); return cam; };
 const cacheCentre = centre.clone().add( new THREE.Vector3( 40, - 30, 25 ) ), cache = camera( cacheCentre, 1 - pad, 6800 + pad ), map = camera( centre, 1, 6800 );
 const m = cache.matrixWorld.elements, basis = [ [ m[ 0 ], m[ 1 ], m[ 2 ] ], [ m[ 4 ], m[ 5 ], m[ 6 ] ] ];
 const p = R_SunCachePlan( { valid: true, sameOccluder: true, sameSun: true, delta: centre.clone().sub( cacheCentre ).toArray(), right: basis[ 0 ], up: basis[ 1 ], dir: dirV.toArray(), texel, pad, near: 1, far: 6800, cacheNear: cache.near, cacheFar: cache.far } );
 for ( const point of [ [ 0, 0, 0 ], [ 300, - 200, 40 ], [ - 900, 700, - 300 ] ] ) {
  const X = new THREE.Vector3( ...point ).add( centre ), zCache = ( X.clone().project( cache ).z + 1 ) / 2, zMap = ( X.clone().project( map ).z + 1 ) / 2;
  near( p.uA + zCache * p.uB, zMap, 'point ' + point );
 }
} );
