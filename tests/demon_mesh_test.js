// Actual native START surfaces plus the retained supplied height map. These
// checks call geometry/world/PVS/shadow APIs; no renderer or game is started.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { R_DemonHeight, R_DemonSurfaceData, R_DemonGeometryField } from '../src/newer/render/r_demonrelief.js';
import { R_DemonBakePrefetch, R_DemonBakePrepare, R_DemonBakeSurface } from '../src/newer/assets/r_demonbakes.js';
import * as surf from '../src/engine/render/gl_rsurf.js';
import * as post from '../src/newer/render/gl_post.js';
import * as main from '../src/engine/render/gl_rmain.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { cl } from '../src/engine/client/client.js';
import { entity_t, r_refdef } from '../src/engine/render/render.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label, epsilon = .005 ) => check( Math.abs( a - b ) <= epsilon, `${label}: ${a} != ${b}` );
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const scalar = read( 'newer/textures/normals/demon-face.r16' );
const field = { width: 256, height: 512, data: Float32Array.from( { length: 256 * 512 }, ( _, i ) => scalar.readUInt16LE( i * 2 ) / 65535 ), displacement: { depth: .05 * 64 * 3, step: .5, smoothing: .6 }, file: 'normals/demon-face.webp', dataFile: 'normals/demon-face.r16', sampling: 'clamp', strength: 2, cap: 1.8 };
const pack = read( 'pak0.pak' ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const model = Mod_ForName( 'maps/start.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null;
let worldGroup; const add = THREE.Group.prototype.add;
THREE.Group.prototype.add = function ( ...objects ) { if ( this.name === 'quake_world' ) worldGroup = this; return add.apply( this, objects ); };
try { surf.GL_BuildLightmaps(); } finally { delete THREE.Group.prototype.add; }
const faces = model.surfaces.slice( model.firstmodelsurface, model.firstmodelsurface + model.nummodelsurfaces ).filter( s => s.texinfo.texture.name === 'dem4_1' );
check( faces.length > 0 && worldGroup, 'real native plaque surfaces and world group exist' );
// The shipped source now enters through prepared geometry. Decode its actual
// artifact rather than bypassing the new asynchronous admission contract.
globalThis.fetch = async url => new Response( read( String( url ).split( '?' )[ 0 ] ), { status: 200 } );
const preparedEntry = R_DemonBakePrefetch( model.name, model.bspSourceBytes );
await preparedEntry.promise; check( preparedEntry.status === 'ready', 'actual installed native displacement artifact validates' );
async function prepareFaces() {
 R_DemonBakePrepare( model, faces );
 for ( let i = 0; i < 300 && faces.some( s => R_DemonBakeSurface( s ).status === 'loading' ); i ++ ) await new Promise( r => setTimeout( r, 0 ) );
 check( faces.every( s => R_DemonBakeSurface( s ).status === 'ready' ), 'actual prepared source/recipe/height hashes settle' );
}

const textures = new Set( faces.map( s => s.texinfo.texture.gl_texture ) );
const sourceSnapshot = faces.map( s => { const p = []; for ( let poly = s.polys; poly; poly = poly.next ) p.push( [ poly, Array.from( poly.verts ).join() ] ); return p; } ).flat();
const hullSnapshot = model.hulls.map( hull => JSON.stringify( { planes: hull.planes, clipnodes: hull.clipnodes, first: hull.firstclipnode, last: hull.lastclipnode } ) );
const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, mode.r_newer_normals, mode.r_newer_textures, mode.r_newer_lighting, mode.r_newer_water ];
for ( const variable of controls ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
function on() { for ( const v of controls ) vars.Cvar_Set( v.name, '1' ); vars.Cvar_Set( 'r_dynres', '0' ); vars.Cvar_Set( 'r_bloom', '0' ); vars.Cvar_Set( 'r_volumetric', '0' ); vars.Cvar_Set( 'r_newer_water', '0' ); mode.R_AnimSetClassicPass( false ); }
function triangles( surface ) {

	const result = [];
	for ( let p = surface.polys; p; p = p.next ) {

		const vertex = i => Array.from( p.verts.subarray( i * 7, i * 7 + 7 ) );
		for ( let i = 1; i < p.numverts - 1; i ++ ) result.push( [ vertex( 0 ), vertex( i ), vertex( i + 1 ) ] );

	}
	return result;

}

Deno.test( 'real native plaque tessellation changes vertex depth/silhouette and normals while barycentric UV/lightmap and collision sources remain intact', () => {

	for ( const t of textures ) t.userData.newerHeight = field;
	const surface = faces.find( s => triangles( s ).length === 2 ) || faces[ 0 ], data = R_DemonSurfaceData( surface ), geometricField = R_DemonGeometryField( surface ); check( data && data.skirtTriangles > 0, 'real raised surface with closed perimeter' );
	const n = new THREE.Vector3( ...surface.plane.normal ).multiplyScalar( surface.flags & 2 ? -1 : 1 ), signedDist = surface.plane.dist * ( surface.flags & 2 ? -1 : 1 ), originals = triangles( surface );
	let min = Infinity, max = -Infinity, changedNormals = 0;
	for ( let i = 0; i < data.topVertexCount; i ++ ) {

		const p = new THREE.Vector3().fromArray( data.positions, i * 3 ), u = data.uvs[ i * 2 ], v = data.uvs[ i * 2 + 1 ], offset = .05 + field.displacement.depth * R_DemonHeight( geometricField, u, v );
		const actual = p.dot( n ) - signedDist; near( actual, offset, 'each raised vertex follows the supplied height' ); min = Math.min( min, actual ); max = Math.max( max, actual );
		const base = p.clone().addScaledVector( n, -offset ); let expected;
		for ( const tri of originals ) {

			const triangle = new THREE.Triangle( ...tri.map( vertex => new THREE.Vector3( ...vertex.slice( 0, 3 ) ) ) ), bary = triangle.getBarycoord( base, new THREE.Vector3() );
			if ( bary && bary.x >= -.0001 && bary.y >= -.0001 && bary.z >= -.0001 ) { expected = [ 3, 4, 5, 6 ].map( k => tri[ 0 ][ k ] * bary.x + tri[ 1 ][ k ] * bary.y + tri[ 2 ][ k ] * bary.z ); break; }

		}
		check( expected, 'every raised vertex maps inside original native triangle' );
		for ( const [ actualUV, originalUV ] of [ [ u, expected[ 0 ] ], [ v, expected[ 1 ] ], [ data.lmuvs[ i * 2 ], expected[ 2 ] ], [ data.lmuvs[ i * 2 + 1 ], expected[ 3 ] ] ] ) near( actualUV, originalUV, 'native barycentric UV/lightmap coordinates', .0001 );
		const normal = new THREE.Vector3().fromArray( data.normals, i * 3 ); near( normal.length(), 1, 'finite unit geometric normal', .00001 ); check( normal.dot( n ) > 0, 'geometric normals face outward' ); if ( normal.dot( n ) < .95 ) changedNormals ++;

	}
	check( min > 0 && max - min > 6 && max > 7.5 && max <= .05 + .05 * surface.texinfo.texture.width * 3 && changedNormals > 100, 'actual owner triple .05×nativewidth relief with source shape preserved' );
	check( data.positions.length / 9 === data.triangles && data.triangles > 1000, 'real triangle data generated' );
	check( Array.from( data.positions.subarray( data.topVertexCount * 3 ) ).every( Number.isFinite ), 'perimeter skirt positions finite' );
	let backing = 0; for ( let i = data.topVertexCount; i < data.positions.length / 3; i ++ ) if ( Math.abs( new THREE.Vector3().fromArray( data.positions, i * 3 ).dot( n ) - signedDist ) < .001 ) backing ++;
	check( backing > 0, 'skirts physically reach native wall backing' );
	for ( const [ p, snapshot ] of sourceSnapshot ) same( Array.from( p.verts ).join(), snapshot, 'original nativeXYZ/UV/lightmap polygon source unchanged' );
	for ( let i = 0; i < model.hulls.length; i ++ ) same( JSON.stringify( { planes: model.hulls[ i ].planes, clipnodes: model.hulls[ i ].clipnodes, first: model.hulls[ i ].firstclipnode, last: model.hulls[ i ].lastclipnode } ), hullSnapshot[ i ], 'collision hull unchanged' );
	console.log( 'ACTUAL_DEMON_MESH ' + JSON.stringify( { topVertices: data.topVertexCount, triangles: data.triangles, skirtTriangles: data.skirtTriangles, minDepth: min, maxDepth: max, changedNormals } ) );

} );

Deno.test( 'every real top triangle has outward winding, exact projected coverage and no unmatched internal fan edges', () => {

	for ( const t of textures ) t.userData.newerHeight = field;
	let triangleCount = 0, polygons = 0; const interpolationErrors = [], facetAngles = [], foreheadErrors = [], foreheadAngles = [];
	for ( const surface of faces ) {

		const data = R_DemonSurfaceData( surface ), geometricField = R_DemonGeometryField( surface ), n = new THREE.Vector3( ...surface.plane.normal ).multiplyScalar( surface.flags & 2 ? -1 : 1 ), dist = surface.plane.dist * ( surface.flags & 2 ? -1 : 1 );
		const original = triangles( surface ), edges = new Map(), boundary = [];
		let expectedArea = 0, actualArea = 0;
		for ( const tri of original ) expectedArea += new THREE.Triangle( ...tri.map( vertex => new THREE.Vector3( ...vertex.slice( 0, 3 ) ) ) ).getArea();
		for ( let p = surface.polys; p; p = p.next ) {

			polygons ++;
			for ( let i = 0; i < p.numverts; i ++ ) boundary.push( new THREE.Line3( new THREE.Vector3().fromArray( p.verts, i * 7 ), new THREE.Vector3().fromArray( p.verts, ( ( i + 1 ) % p.numverts ) * 7 ) ) );

		}
		const key = p => p.toArray().join( ',' );
		for ( let i = 0; i < data.topVertexCount; i += 3 ) {

			const points = [ 0, 1, 2 ].map( j => new THREE.Vector3().fromArray( data.positions, ( i + j ) * 3 ) );
			const signed = points[ 1 ].clone().sub( points[ 0 ] ).cross( points[ 2 ].clone().sub( points[ 0 ] ) ).dot( n );
			check( signed > 1e-8, 'every top triangle faces outward and is nondegenerate' ); actualArea += signed / 2; triangleCount ++;
			const u = ( data.uvs[ i * 2 ] + data.uvs[ ( i + 1 ) * 2 ] + data.uvs[ ( i + 2 ) * 2 ] ) / 3, v = ( data.uvs[ i * 2 + 1 ] + data.uvs[ ( i + 1 ) * 2 + 1 ] + data.uvs[ ( i + 2 ) * 2 + 1 ] ) / 3;
			const centroid = points[ 0 ].clone().add( points[ 1 ] ).add( points[ 2 ] ).multiplyScalar( 1 / 3 ), error = Math.abs( centroid.dot( n ) - dist - ( .05 + field.displacement.depth * R_DemonHeight( geometricField, u, v ) ) );
			const facet = points[ 1 ].clone().sub( points[ 0 ] ).cross( points[ 2 ].clone().sub( points[ 0 ] ) ).normalize(), smooth = new THREE.Vector3();
			for ( let j = 0; j < 3; j ++ ) smooth.add( new THREE.Vector3().fromArray( data.normals, ( i + j ) * 3 ) ); smooth.normalize();
			const angle = Math.acos( Math.max( -1, Math.min( 1, facet.dot( smooth ) ) ) ) * 180 / Math.PI;
			interpolationErrors.push( error ); facetAngles.push( angle );
			if ( ( u % 1 + 1 ) % 1 > .4 && ( u % 1 + 1 ) % 1 < .6 && ( v % 1 + 1 ) % 1 > .27 && ( v % 1 + 1 ) % 1 < .4 ) { foreheadErrors.push( error ); foreheadAngles.push( angle ); }
			for ( let edge = 0; edge < 3; edge ++ ) {

				const a = points[ edge ], b = points[ ( edge + 1 ) % 3 ], id = [ key( a ), key( b ) ].sort().join( ':' );
				const record = edges.get( id ); if ( record ) record.count ++; else edges.set( id, { count: 1, a, b } );

			}

		}
		near( actualArea, expectedArea, 'all tessellated projected area covers exactly the original plaque', Math.max( .001, expectedArea * 1e-6 ) );
		for ( const edge of edges.values() ) {

			check( edge.count <= 2, 'no overlapped/nonmanifold top edge' ); if ( edge.count === 2 ) continue;
			const base = p => p.clone().addScaledVector( n, -( p.dot( n ) - dist ) ), a = base( edge.a ), b = base( edge.b );
			check( boundary.some( line => line.closestPointToPoint( a, true, new THREE.Vector3() ).distanceTo( a ) < .001 && line.closestPointToPoint( b, true, new THREE.Vector3() ).distanceTo( b ) < .001 ), 'unpaired top edges lie only on the actual polygon perimeter, never internal tears' );

		}

	}
	const metrics = values => { values.sort( ( a, b ) => a - b ); return { samples: values.length, mean: values.reduce( ( sum, value ) => sum + value, 0 ) / values.length, p95: values[ Math.floor( values.length * .95 ) ], max: values.at( -1 ) }; };
	const quality = { polygons, checkedTopTriangles: triangleCount, interpolationWorldUnits: metrics( interpolationErrors ), facetVsSmoothDegrees: metrics( facetAngles ), foreheadError: metrics( foreheadErrors ), foreheadAngle: metrics( foreheadAngles ) };
	console.log( 'DEMON_TOPOLOGY ' + JSON.stringify( quality ) );
	// Protect the specific previous oblique-view failure: the old12unit field
	// missed forehead height by .965world p95 and leaned normals66.7degrees p95.
	check( quality.interpolationWorldUnits.p95 < .1 && quality.foreheadError.max < .1, 'native source is sampled finely enough to avoid prior forehead sawtooth height error' );
	check( quality.facetVsSmoothDegrees.p95 < 15 && quality.foreheadAngle.max < 15, 'triple-depth geometric facets stay within unchanged strict p95 and forehead-tail normal agreement' );

} );

Deno.test( 'geometry cache, package-clamped tile endpoints and invalid/missing/other-material input preserve safe native fallback', () => {

	const surface = faces[ 0 ], t = surface.texinfo.texture.gl_texture; t.userData.newerHeight = field;
	same( R_DemonSurfaceData( surface ), R_DemonSurfaceData( surface ), 'unchanged field reuses actual buffers' );
	const asymmetric = { width: 2, height: 2, data: [ .1, .8, .2, .9 ], sampling: 'clamp' };
	near( R_DemonHeight( asymmetric, 0, 0 ), .1, 'left/topendpoint never averages oppositeboundary' ); near( R_DemonHeight( asymmetric, 1, 1 ), .9, 'right/bottomendpoint never mapsbacktoleft/top' );
	near( R_DemonHeight( asymmetric, -2, 5 ), .2, 'outofrange localcoords clamp' );
	near( R_DemonHeight( { ...asymmetric, tileOrigin: [ -7, 3 ] }, -6, 4 ), .9, 'negative native tile origin preserves actual right/bottom endpoints' );
	const repeated = { ...field, sampling: 'repeat' }; for ( const [ u, v ] of [ [ .37, .65 ], [ -.1, -.7 ], [ 2.6, -4.2 ] ] ) near( R_DemonHeight( repeated, u, v ), R_DemonHeight( repeated, u + 3, v - 2 ), 'legacy explicit repeat remainscompatible', .000001 );
	const geometricField = R_DemonGeometryField( surface ); same( geometricField.sampling, 'clamp', 'actual native plaque uses donorboundary contract' );
	const shifted = { ...surface, polys: { ...surface.polys, next: null, verts: surface.polys.verts.slice() } }; for ( let i = 0; i < shifted.polys.numverts; i ++ ) { shifted.polys.verts[ i * 7 + 3 ] -= 7; shifted.polys.verts[ i * 7 + 4 ] += 3; }
	const moved = R_DemonGeometryField( shifted ); for ( const [ u, v ] of [ [ .1, .2 ], [ 0, 0 ], [ 1, 1 ], [ .7, .9 ] ] ) near( R_DemonHeight( geometricField, geometricField.tileOrigin[ 0 ] + u, geometricField.tileOrigin[ 1 ] + v ), R_DemonHeight( moved, geometricField.tileOrigin[ 0 ] - 7 + u, geometricField.tileOrigin[ 1 ] + 3 + v ), 'native UV integer tile shifts keep donorfeaturephase', .000001 );
	const fake = { ...surface, texinfo: { ...surface.texinfo, texture: { ...surface.texinfo.texture, name: 'altarb_2' } } }; same( R_DemonSurfaceData( fake ), null, 'other ornament family stays native' );
	for ( const bad of [ undefined, { ...field, width: 0, height: 0, data: [] }, { ...field, width: NaN }, { ...field, displacement: { depth: 0, step: .5 } }, { ...field, displacement: { depth: 9.6, step: .25 } }, { ...field, displacement: { ...field.displacement, smoothing: NaN } }, { ...field, data: new Float32Array( field.data.length ).fill( NaN ) } ] ) { t.userData.newerHeight = bad; same( R_DemonSurfaceData( surface ), null, 'invalid or missing height does not generate corrupt geometry' ); }
	t.userData.newerHeight = field; const old = R_DemonSurfaceData( surface ); field.displacement.depth = 3.2; check( R_DemonSurfaceData( surface ) !== old, 'depth change invalidates cached geometry' ); field.displacement.depth = .05 * 64 * 3;

} );

Deno.test( 'sun occluder follows exactly the visible Newer texture/normal gates and includes actual raised triangles', async () => {

	on(); for ( const t of textures ) t.userData.newerHeight = field; await prepareFaces();
	vars.Cvar_Set( 'r_newer_normals', '0' ); const nativeCount = post.R_BuildSunOccluder( model );
	vars.Cvar_Set( 'r_newer_normals', '1' ); const enhanced = post.R_BuildSunOccluder( model ), extra = faces.reduce( ( sum, face ) => sum + R_DemonSurfaceData( face ).triangles, 0 ); same( enhanced, nativeCount + extra, 'sun caster contains every actual raised triangle and retained backing' );
	vars.Cvar_Set( 'r_newer_textures', '0' ); same( post.R_BuildSunOccluder( model ), nativeCount, 'textureoff removes raised shadows' ); vars.Cvar_Set( 'r_newer_textures', '1' );
	mode.R_AnimSetClassicPass( true ); same( post.R_BuildSunOccluder( model ), nativeCount, 'classic comparison has no raised shadows' ); mode.R_AnimSetClassicPass( false ); vars.Cvar_Set( 'r_hdr', '0' ); same( post.R_BuildSunOccluder( model ), nativeCount, 'New Game keeps native sun caster' );

} );

Deno.test( 'public world draw updates real overlay/PVS, restores native modes, and removes stale geometry when height becomes unavailable', async () => {

	on(); for ( const t of textures ) delete t.userData.newerHeight;
	main.set_r_worldentity( new entity_t() ); main.set_r_viewleaf( null ); r_refdef.vieworg.set( [ 512, 224, 64 ] ); main.d_lightstylevalue.fill( 264 );
	surf.R_MarkLeaves(); surf.R_DrawWorld(); same( surf.R_DemonReliefStatus().ready, 0, 'before async height native backing remains' );
	for ( const t of textures ) t.userData.newerHeight = { ...field, displacement: { ...field.displacement } }; await prepareFaces();
	surf.R_DrawWorld(); check( surf.R_DemonReliefStatus().ready > 0, 'new height produces actual overlay through existing world path' );
	const overlays = worldGroup.children.filter( child => child.userData.realDisplacement || child.material?.userData.realDisplacement ); check( overlays.length > 0 && overlays.some( child => child.visible ), 'actual separate meshes render with native PVS' );
	for ( const mesh of overlays ) { check( mesh.userData.newerOnly && mesh.castShadow, 'overlay correctly marked for native comparison and shadows' ); const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; mesh.material.onBeforeCompile( shader ); check( ! shader.fragmentShader.includes( 'vec2 dUv' ) && shader.fragmentShader.includes( 'mapN.xy *= 0.0' ), 'actual mesh does not double macroPOM or macro normal' ); }
	for ( const leaf of model.leafs ) leaf.visframe = -1; surf.R_WorldShowAll( false ); check( overlays.every( child => ! child.visible ), 'hidden PVS also hides raised overlay' );
	surf.R_WorldShowAll( true ); check( overlays.some( child => child.visible ), 'reflection whole-world adapter sees actual raised geometry' );
	vars.Cvar_Set( 'r_newer_textures', '0' ); surf.R_DrawWorld(); check( overlays.every( child => ! child.visible ), 'textureoff shows only backing' );
	vars.Cvar_Set( 'r_newer_textures', '1' ); mode.R_AnimSetClassicPass( true ); surf.R_DrawWorld(); check( overlays.every( child => ! child.visible ), 'Classic hides raised overlays' ); mode.R_AnimSetClassicPass( false );
	for ( const t of textures ) delete t.userData.newerHeight; surf.R_DrawWorld(); same( surf.R_DemonReliefStatus().ready, 0, 'missing height disposes stale raised mesh and returns to native backing' );
	vars.Cvar_Set( 'r_hdr', '0' );

} );
