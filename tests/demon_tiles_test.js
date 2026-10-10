// Real native cross-tile faces through the public mesh API. No game/browser.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { R_DemonGeometryField, R_DemonSurfaceData } from '../src/newer/render/r_demonrelief.js';
import { GL_BuildLightmaps } from '../src/engine/render/gl_rsurf.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { cl } from '../src/engine/client/client.js';

const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const near = ( a, b, label, epsilon = .003 ) => check( Math.abs( a - b ) <= epsilon, `${label}: ${a} != ${b}` );
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const raw = read( 'newer/textures/normals/demon-face.r16' );
const config = JSON.parse( read( 'newer/textures/index.json' ) ).normals.dem4_1;
const field = { width: 256, height: 512, data: Float32Array.from( { length: 256 * 512 }, ( _, i ) => raw.readUInt16LE( i * 2 ) / 65535 ), displacement: { ...config.displacement }, sampling: 'clamp' };
const pack = read( 'pak0.pak' ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const crossers = { e1m2: [ 2881, 3242, 3246, 3452, 4190 ], e1m4: [ 5820, 5821 ] };
function sampled( f, u, v, origin ) {

	const x = Math.max( 0, Math.min( f.width - 1, ( u - origin[ 0 ] ) * f.width - .5 ) ), y = Math.max( 0, Math.min( f.height - 1, ( v - origin[ 1 ] ) * f.height - .5 ) );
	const a = Math.floor( x ), b = Math.floor( y ), dx = x - a, dy = y - b, right = Math.min( a + 1, f.width - 1 ), bottom = Math.min( b + 1, f.height - 1 );
	return f.data[ b * f.width + a ] * ( 1 - dx ) * ( 1 - dy ) + f.data[ b * f.width + right ] * dx * ( 1 - dy ) + f.data[ bottom * f.width + a ] * ( 1 - dx ) * dy + f.data[ bottom * f.width + right ] * dx * dy;

}

Deno.test( 'all seven stock cross-tile plaques preserve donor registration, barycentric native UV/lightmaps, projected coverage and closed geometry', () => {

	const evidence = []; let checkedVertices = 0, checkedTriangles = 0;
	for ( const [ map, ids ] of Object.entries( crossers ) ) {

		const model = Mod_ForName( `maps/${map}.bsp`, true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
		const hulls = model.hulls.map( h => JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes, first: h.firstclipnode, last: h.lastclipnode } ) );
		for ( const id of ids ) {

			const s = model.surfaces[ id ], label = `${map}:${id}`;
			check( [ 'dem4_1', 'dem4_4', 'dem5_3' ].includes( s.texinfo.texture.name ), label + ' actual target texture' ); s.texinfo.texture.gl_texture.userData.newerHeight = field;
			const original = []; for ( let p = s.polys; p; p = p.next ) original.push( { p, bytes: Array.from( p.verts ).join() } ); check( original.length === 1, label + ' native convex polygon' );
			const p = original[ 0 ].p, points = Array.from( { length: p.numverts }, ( _, i ) => Array.from( p.verts.subarray( i * 7, i * 7 + 7 ) ) );
			const n = new THREE.Vector3( ...s.plane.normal ).multiplyScalar( s.flags & 2 ? -1 : 1 ), dist = s.plane.dist * ( s.flags & 2 ? -1 : 1 );
			const data = R_DemonSurfaceData( s ), f = R_DemonGeometryField( s ); check( data?.tileRegions?.length > 1, label + ' every crosser generates multiple valid tile regions' );
			const regions = data.tileRegions; check( regions[ 0 ].startVertex === 0 && regions.at( -1 ).endVertex === data.topVertexCount, label + ' regions cover all top vertices' );
			let area = 0, expectedArea = 0, backing = 0;
			for ( let i = 1; i < points.length - 1; i ++ ) expectedArea += new THREE.Triangle( ...[ points[ 0 ], points[ i ], points[ i + 1 ] ].map( v => new THREE.Vector3( ...v.slice( 0, 3 ) ) ) ).getArea();
			const axes = [ 0, 1, 2 ].filter( k => k !== n.toArray().map( Math.abs ).indexOf( Math.max( ...n.toArray().map( Math.abs ) ) ) );
			const [ a, b, c ] = points, x = axes[ 0 ], y = axes[ 1 ], det = ( b[ x ] - a[ x ] ) * ( c[ y ] - a[ y ] ) - ( c[ x ] - a[ x ] ) * ( b[ y ] - a[ y ] ); check( Math.abs( det ) > .01, label + ' independent native affine basis' );
			const sourceEdges = points.map( ( v, i ) => new THREE.Line3( new THREE.Vector3( ...v.slice( 0, 3 ) ), new THREE.Vector3( ...points[ ( i + 1 ) % points.length ].slice( 0, 3 ) ) ) );
			for ( let regionIndex = 0; regionIndex < regions.length; regionIndex ++ ) {

				const r = regions[ regionIndex ]; if ( regionIndex ) check( r.startVertex === regions[ regionIndex - 1 ].endVertex, label + ' contiguous tile ranges' ); check( r.startVertex % 3 === 0 && r.endVertex % 3 === 0 && r.endVertex > r.startVertex, label + ' complete triangles per tile' );
				const edges = new Map(), key = v => v.toArray().join( ',' );
				for ( let i = r.startVertex; i < r.endVertex; i += 3 ) {

					const tri = [], uv = [];
					for ( let j = 0; j < 3; j ++ ) {

						const k = i + j, u = data.uvs[ k * 2 ], v = data.uvs[ k * 2 + 1 ], point = new THREE.Vector3().fromArray( data.positions, k * 3 );
						check( u - r.origin[ 0 ] >= -.00003 && u - r.origin[ 0 ] <= 1.00003 && v - r.origin[ 1 ] >= -.00003 && v - r.origin[ 1 ] <= 1.00003, label + ' vertex samples its own complete donor tile rather than wrong bbox origin' );
						const offset = .05 + config.displacement.depth * sampled( f, u, v, r.origin ); near( point.dot( n ) - dist, offset, label + ' actual region-local height' );
						const base = point.clone().addScaledVector( n, -offset ), px = base.getComponent( x ) - a[ x ], py = base.getComponent( y ) - a[ y ];
						const w1 = ( px * ( c[ y ] - a[ y ] ) - py * ( c[ x ] - a[ x ] ) ) / det, w2 = ( ( b[ x ] - a[ x ] ) * py - ( b[ y ] - a[ y ] ) * px ) / det;
						for ( const [ attribute, value ] of [ [ 3, u ], [ 4, v ], [ 5, data.lmuvs[ k * 2 ] ], [ 6, data.lmuvs[ k * 2 + 1 ] ] ] ) near( value, a[ attribute ] * ( 1 - w1 - w2 ) + b[ attribute ] * w1 + c[ attribute ] * w2, label + ' native affine/barycentric UV and lightmap', .00003 );
						const normal = new THREE.Vector3().fromArray( data.normals, k * 3 ); near( normal.length(), 1, label + ' finite normalized normal', .00001 ); check( normal.dot( n ) > 0, label + ' outward smooth normal' );
						tri.push( point ); uv.push( [ u, v ] ); checkedVertices ++;

					}
					const signed = tri[ 1 ].clone().sub( tri[ 0 ] ).cross( tri[ 2 ].clone().sub( tri[ 0 ] ) ).dot( n ); check( signed > 1e-8, label + ' every fan triangle outward and nondegenerate' ); area += signed / 2; checkedTriangles ++;
					for ( let j = 0; j < 3; j ++ ) { const next = ( j + 1 ) % 3, id = [ key( tri[ j ] ), key( tri[ next ] ) ].sort().join( ':' ), old = edges.get( id ); if ( old ) old.count ++; else edges.set( id, { count: 1, a: tri[ j ], b: tri[ next ], auv: uv[ j ], buv: uv[ next ] } ); }

				}
				for ( const edge of edges.values() ) {

					check( edge.count <= 2, label + ' no overlapping/nonmanifold top edges' ); if ( edge.count === 2 ) continue;
					const base = point => point.clone().addScaledVector( n, -( point.dot( n ) - dist ) ), ea = base( edge.a ), eb = base( edge.b );
					const originalBoundary = sourceEdges.some( line => line.closestPointToPoint( ea, true, new THREE.Vector3() ).distanceTo( ea ) < .003 && line.closestPointToPoint( eb, true, new THREE.Vector3() ).distanceTo( eb ) < .003 );
					const tileBoundary = [ 0, 1 ].some( axis => [ r.origin[ axis ], r.origin[ axis ] + 1 ].some( bound => Math.abs( edge.auv[ axis ] - bound ) < .00003 && Math.abs( edge.buv[ axis ] - bound ) < .00003 ) );
					check( originalBoundary || tileBoundary, label + ' no unmatched internal fan edge or tear' );

				}

			}
			near( area, expectedArea, label + ' exact projected native coverage without holes/overlap', Math.max( .01, expectedArea * .000002 ) );
			for ( let i = data.topVertexCount; i < data.positions.length / 3; i ++ ) { const height = new THREE.Vector3().fromArray( data.positions, i * 3 ).dot( n ) - dist; if ( Math.abs( height ) < .001 ) backing ++; check( height >= -.001 && Number.isFinite( height ), label + ' valid closed skirt depth' ); }
			check( backing > 0 && data.skirtTriangles > 0, label + ' clipped perimeters reach backing' ); for ( const snapshot of original ) check( Array.from( snapshot.p.verts ).join() === snapshot.bytes, label + ' clipping preserves every native polygon byte' );
			evidence.push( { map, id, texture: s.texinfo.texture.name, tiles: regions.map( r => r.origin ), topTriangles: data.topVertexCount / 3, skirtTriangles: data.skirtTriangles, projectedArea: area } );

		}
		model.hulls.forEach( ( h, i ) => check( JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes, first: h.firstclipnode, last: h.lastclipnode } ) === hulls[ i ], map + ' native collision hulls unchanged' ) );

	}
	check( evidence.length === 7, 'all seven audited native crossers tested' ); console.log( 'DEMON_NATIVE_TILE_REGIONS ' + JSON.stringify( { checkedVertices, checkedTriangles, faces: evidence } ) );

} );
