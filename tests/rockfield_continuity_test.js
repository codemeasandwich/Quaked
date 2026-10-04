// Independent public-interface regressions: coverage/discovery is metadata;
// the already visible scalar field must never change as coverage grows.
import * as THREE from 'three';
import { createField, generateTile } from '../src/rockfield.js';
import { R_RockSurfaceCharts, R_RockCoordinates } from '../src/r_rocksurfaces.js';
import { R_RockfieldBuild, R_RockfieldGeometry } from '../src/r_rockfield.js';
import { DrawGLPoly } from '../src/gl_rsurf.js';

const assert = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => assert( a === b, `${label}: ${a} !== ${b}` );
function face( profile, x0, x1, y0, y1 ) {

	const ground = profile === 'ground', normal = ground ? [ 0, 0, 1 ] : [ 0, -1, 0 ];
	const points = [ [ x0, y0 ], [ x0, y1 ], [ x1, y1 ], [ x1, y0 ] ].map( ( [ x, y ] ) => ground ? [ x, y, 0 ] : [ x, 0, y ] );
	return { flags: 0, plane: { normal, dist: 0 }, texinfo: { texture: { name: ground ? 'wgrnd1_5' : 'uwall1_2', width: 64, height: 64 } }, polys: { numverts: 4, verts: new Float32Array( points.flatMap( p => [ ...p, p[ 0 ] / 64, ( ground ? p[ 1 ] : p[ 2 ] ) / 64, .13, .27 ] ) ) } };

}
const build = surfaces => R_RockSurfaceCharts( { name: 'maps/continuous-discovery.bsp', surfaces } );
const samples = chart => {

	const field = createField( { ...chart.config, seed: chart.seed } );
	return [ [ -409.5, -381.25, -117.5 ], [ -128, 0, 0 ], [ 0, 0, 0 ], [ 67.5, 112.5, 90.25 ], [ 256, 0, 256 ] ].map( p => field.height( ...R_RockCoordinates( chart, p ) ) );

};
function equalField( before, after, label ) {

	same( after.seed, before.seed, `${label}: stable seed` );
	same( JSON.stringify( samples( after ) ), JSON.stringify( samples( before ) ), `${label}: original world samples` );
	for ( const [ x, y ] of [ [ -2, -2 ], [ -1, 0 ], [ 0, -1 ], [ 0, 0 ], [ 1, 1 ] ] ) {

		const a = generateTile( { ...before.config, seed: before.seed, cells: 16 }, x, y );
		const b = generateTile( { ...after.config, seed: after.seed, cells: 16 }, x, y );
		assert( a.data.every( ( h, i ) => h === b.data[ i ] ), `${label}: immutable generated region ${x},${y}` );

	}

}

Deno.test( 'public charts preserve every original field sample during expansion in all four directions, including negative regions', () => {

	for ( const profile of [ 'wall', 'ground' ] ) {

		const initial = face( profile, -128, 128, -128, 128 ), original = build( [ initial ] ).bySurface.get( initial );
		const additions = [ face( profile, -384, -128, -128, 128 ), face( profile, 128, 384, -128, 128 ), face( profile, -128, 128, -384, -128 ), face( profile, -128, 128, 128, 384 ) ];
		for ( const order of [ additions, additions.slice().reverse() ] ) {

			const discovered = [ initial ];
			for ( const adjacent of order ) {

				discovered.push( adjacent ); const result = build( discovered );
				same( result.charts.length, 1, 'adjacent coverage is connected' );
				equalField( original, result.bySurface.get( initial ), `${profile} ${discovered.length} faces` );

			}

		}

	}

} );

Deno.test( 'connecting previously disconnected regions preserves both existing fields and exact shared-edge samples', () => {

	for ( const profile of [ 'wall', 'ground' ] ) {

		const left = face( profile, -384, -128, -128, 128 ), right = face( profile, 128, 384, -128, 128 ), bridge = face( profile, -128, 128, -128, 128 );
		const before = build( [ left, right ] ), after = build( [ right, bridge, left ] );
		same( before.charts.length, 2, 'two disconnected components before bridge' ); same( after.charts.length, 1, 'one discovered connected component' );
		for ( const side of [ left, right ] ) equalField( before.bySurface.get( side ), after.bySurface.get( side ), `${profile} bridge` );
		const chart = after.bySurface.get( bridge ), field = createField( { ...chart.config, seed: chart.seed } );
		for ( const x of [ -128, 128 ] ) for ( let y = -128; y <= 128; y += 8 ) {

			const point = profile === 'ground' ? [ x, y, 0 ] : [ x, 0, y ];
			for ( const side of [ left, right ] ) {

				const prior = before.bySurface.get( side ), priorField = createField( { ...prior.config, seed: prior.seed } );
				same( priorField.height( ...R_RockCoordinates( prior, point ) ), field.height( ...R_RockCoordinates( chart, point ) ), 'discovery cannot introduce seam in either former component' );

			}

		}

	}

} );

Deno.test( 'subdivision and T-junction annotations retain native position, normals, texture and lightmap coordinates exactly', () => {

	for ( const profile of [ 'wall', 'ground' ] ) {

		const faces = [ face( profile, -256, 0, -256, 256 ), face( profile, 0, 256, -256, 0 ), face( profile, 0, 256, 0, 256 ) ];
		const originals = faces.map( f => f.polys.verts.slice() );
		try {

			const fields = R_RockfieldBuild( { name: 'maps/continuity-attributes.bsp', surfaces: faces } ); same( fields.charts.length, 1, 'T junction connected' );
			for ( const f of faces ) {

				const geometry = DrawGLPoly( f.polys, f.plane.normal ); assert( geometry instanceof THREE.BufferGeometry, 'actual renderer public geometry' );
				const saved = Object.entries( geometry.attributes ).map( ( [ name, attr ] ) => ( { name, attr, bytes: attr.array.slice() } ) );
				const index = geometry.index, indexBytes = index?.array.slice(); assert( R_RockfieldGeometry( geometry, f ), 'field annotation accepted' );
				for ( const { name, attr, bytes } of saved ) { same( geometry.getAttribute( name ), attr, `native ${name} identity` ); assert( bytes.every( ( v, i ) => v === attr.array[ i ] ), `native ${name} bytes` ); }
				same( geometry.index, index, 'triangle index identity' ); assert( ! indexBytes || indexBytes.every( ( v, i ) => v === index.array[ i ] ), 'triangle topology bytes' ); geometry.dispose();

			}
			faces.forEach( ( f, i ) => assert( originals[ i ].every( ( v, j ) => v === f.polys.verts[ j ] ), 'native BSP xyz/UV/lightmap bytes' ) );

		} finally { R_RockfieldBuild( null ); }

	}

} );
