// The world renderer's materials stage on its own (card [44i]): the lit material, a polygon's triangles and polygons
// merged by material. Through the public interface of gl_rsurf_materials.js.
import * as THREE from 'three';
import { createQuakeLightmapMaterial, DrawGLPoly, _mergeGLPolys } from '../src/engine/render/gl_rsurf_materials.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
// a polygon of n vertices around the origin, x y z, s t, lightmap s t
const poly = n => ( { numverts: n, verts: Float32Array.from( { length: n * 7 }, ( _, i ) => [ Math.cos( ( i / 7 | 0 ) * 2 * Math.PI / n ) * 64, Math.sin( ( i / 7 | 0 ) * 2 * Math.PI / n ) * 64, 8, ( i / 7 | 0 ), 2, ( i / 7 | 0 ) / n, 0.5 ][ i % 7 ] ) } );

Deno.test( 'a surface\'s material is lit, with its texture and its lightmap', () => {
	const diffuse = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ), lightmap = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 );
	const m = createQuakeLightmapMaterial( diffuse, lightmap );
	check( m.isMeshLambertMaterial, 'a Lambert material' );
	check( m.map === diffuse && m.lightMap === lightmap && m.lightMapIntensity === 2, 'the texture, and the lightmap at intensity 2' );
} );

Deno.test( 'a polygon becomes a fan of triangles; polygons sharing a material, one geometry', () => {
	const g = DrawGLPoly( poly( 5 ), new Float32Array( [ 0, 0, 1 ] ) );
	check( g.attributes.position.count === 9 && g.attributes.uv1.count === 9, 'five vertices, three triangles' );
	check( Array.from( g.attributes.normal.array ).every( ( v, i ) => v === ( i % 3 === 2 ? 1 : 0 ) ), 'every vertex takes the plane\'s normal' );
	check( DrawGLPoly( poly( 2 ), null ) === undefined && DrawGLPoly( null, null ) === undefined, 'nothing for a degenerate polygon' );
	const merged = _mergeGLPolys( [ poly( 4 ), null, poly( 2 ), poly( 6 ) ], [ new Float32Array( [ 1, 0, 0 ] ), null, null, null ] );
	check( merged.attributes.position.count === ( 2 + 4 ) * 3, 'the triangles of the 4- and 6-sided polygons; the rest skipped' );
	check( merged.attributes.normal.array[ 0 ] === 1 && merged.attributes.normal.array[ 6 * 3 + 2 ] === 1, 'each polygon its own normal (missing: 0, 0, 1)' );
	const lone = DrawGLPoly( poly( 4 ), new Float32Array( [ 1, 0, 0 ] ) );
	check( Array.from( lone.attributes.uv1.array ).join() === Array.from( merged.attributes.uv1.array.slice( 0, 12 ) ).join(), 'merged triangles match the polygon drawn alone' );
	check( _mergeGLPolys( [ poly( 2 ), null ], [] ) === null, 'null when no polygon has a triangle' );
} );
