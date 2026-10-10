// Public graph/worker/geometry contracts against the unmodified donor core.
// Real Three objects; no browser/game or real worker is started.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import * as rock from '../src/newer/assets/rockfield.js';
import { ROCK_PRESETS, R_RockPreset } from '../src/newer/assets/rockfield_presets.js';
import { R_RockSurfaceCharts, R_RockCoordinates, R_RockMaterialProfile } from '../src/newer/render/r_rocksurfaces.js';
import { R_RockfieldBuild, R_RockfieldGeometry, RockTileCache, rockUniforms } from '../src/newer/render/r_rockfield.js';
import { DrawGLPoly, GL_BuildLightmaps, R_DrawBrushModel } from '../src/engine/render/gl_rsurf.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { cl } from '../src/engine/client/client.js';
import * as main from '../src/engine/render/gl_rmain.js';
import { entity_t } from '../src/engine/render/render.js';

const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const bytes = a => Buffer.from( a.buffer, a.byteOffset, a.byteLength );
const html = readFileSync( new URL( '../rockfield-v1.6.0.html', import.meta.url ), 'utf8' ), sandbox = {};
runInNewContext( /<script id="rock-core">([\s\S]*?)<\/script>/.exec( html )[ 1 ], sandbox );
const donor = sandbox.RockField, catalog = JSON.parse( /<script id="texture-catalog" type="application\/json">([\s\S]*?)<\/script>/.exec( html )[ 1 ] );
// Latest owner screenshot overrides only this material; original donor is preserved.
catalog.find( item => item.file === 'uwall1_2.webp' ).preset = { profile: 'wall', featureSize: 2.5, warp: .65, fracture: 0, detail: 1.5, cells: 64, amplitude: .8 };
const canonical = name => name.toLowerCase().replace( /^\+[0-9a-j]/, '' ).replace( /\.webp$/, '' );
const json = value => JSON.stringify( Object.fromEntries( Object.entries( value ).sort( ( a, b ) => a[ 0 ].localeCompare( b[ 0 ] ) ) ) );
function face( name, points, normal = [ 0, -1, 0 ], flags = 0, phase = 0 ) { return { flags, plane: { normal, dist: points[ 0 ].reduce( ( sum, v, i ) => sum + v * normal[ i ], 0 ) }, texinfo: { texture: { name, width: 64, height: 64 } }, polys: { numverts: points.length, verts: new Float32Array( points.flatMap( p => [ ...p, p[ 0 ] / 64 + phase, p[ 2 ] / 64 - phase, .1 + phase, .2 ] ) ) } }; }
const wall = ( name, x0, x1, z0, z1, y = 0, phase = 0 ) => face( name, [ [ x0, y, z0 ], [ x1, y, z0 ], [ x1, y, z1 ], [ x0, y, z1 ] ], [ 0, -1, 0 ], 0, phase );
function scene() {

	const a = wall( 'rock1_2', 0, 128, 0, 128 ), b = wall( 'ROCK1_2.webp', 128, 192, 64, 128, 0, .37 ), c = wall( '+0rock1_2', 128, 192, .1734375, 64, 0, -.7 );
	const fold = face( '+AROCK1_2', [ [ 0, 0, 0 ], [ 0, 64, 0 ], [ 0, 64, 128 ], [ 0, 0, 128 ] ], [ -1, 0, 0 ] );
	const corner = wall( 'rock1_2', 192, 256, 128, 192 ), disconnected = wall( 'rock1_2', 512, 576, 0, 64 ), nearParallel = wall( 'rock1_2', 0, 128, 0, 128, .02 ), different = wall( 'bricka2_2', -64, 0, 0, 128 );
	return { a, b, c, fold, corner, disconnected, nearParallel, different, model: { name: 'maps/connected-proof.bsp', surfaces: [ a, b, c, fold, corner, disconnected, nearParallel, different ] } };

}

Deno.test( 'same canonical texture and role joins real positive-length T junctions/folds but never corners, gaps or different textures', () => {

	const f = scene(), snapshots = f.model.surfaces.map( s => bytes( s.polys.verts ).toString( 'hex' ) ), fields = R_RockSurfaceCharts( f.model ), component = fields.bySurface.get( f.a );
	for ( const surface of [ f.b, f.c, f.fold ] ) same( fields.bySurface.get( surface ), component, 'partial edge, fractional T junction and folded canonical material stay continuous' );
	for ( const surface of [ f.corner, f.disconnected, f.nearParallel, f.different ] ) check( fields.bySurface.get( surface ) !== component, 'corner-only/disconnected/near-parallel/different-material component stays separate' );
	same( fields.charts.length, 5, 'exact graph component count' ); same( component.name, 'rock1_2', 'canonical animated/case/extension aliases' ); same( component.amplitude, .35, 'new donor amplitude, not legacy maximum' );
	const reversed = R_RockSurfaceCharts( { ...f.model, surfaces: f.model.surfaces.slice().reverse() } );
	for ( const surface of f.model.surfaces ) { const a = fields.bySurface.get( surface ), b = reversed.bySurface.get( surface ); same( a.key, b.key, 'component identity independent of traversal' ); same( a.id, b.id, 'page identifier stable under input permutation' ); same( a.seed, b.seed, 'noise field not reseeded by discovery order' ); same( json( a.config ), json( b.config ), 'exact preset stable under input order' ); }
	// Native roundoff on a short segment against a long edge must not make
	// adjacency asymmetric or depend on the BSP discovery order.
	const long = face( 'rock1_2', [ [ 0, 0, 0 ], [ 100, 0, 0 ], [ 100, -10, 0 ], [ 0, -10, 0 ] ], [ 0, 0, 1 ] ), short = face( 'rock1_2', [ [ 0, 0, 0 ], [ 10, .0005, 0 ], [ 10, 10, 0 ], [ 0, 10, 0 ] ], [ 0, 0, 1 ] );
	const forward = R_RockSurfaceCharts( { name: 'maps/near-t-junction.bsp', surfaces: [ long, short ] } ), backward = R_RockSurfaceCharts( { name: 'maps/near-t-junction.bsp', surfaces: [ short, long ] } ); same( forward.charts.length, 1, 'near-collinear positive overlap joins long→short' ); same( backward.charts.length, 1, 'near-collinear positive overlap joins short→long' ); same( forward.charts[ 0 ].key, backward.charts[ 0 ].key, 'near-collinear component signature order independence' ); same( forward.charts[ 0 ].seed, backward.charts[ 0 ].seed, 'near-collinear component seed order independence' );
	const field = rock.createField( { ...component.config, seed: component.seed } ); for ( const point of [ [ 128, 0, .1734375 ], [ 128, 0, 32 ], [ 128, 0, 96 ], [ 0, 0, 64 ] ] ) { const left = R_RockCoordinates( component, point ), right = R_RockCoordinates( fields.bySurface.get( f.fold ), point ); same( left.join(), right.join(), 'whole folded component uses one continuous coordinate field' ); same( field.height( ...left ), field.height( ...right ), 'joined scalar height continuity' ); }
	R_RockfieldBuild( f.model ); const geometry = DrawGLPoly( f.b.polys, f.b.plane.normal ), original = Object.entries( geometry.attributes ).map( ( [ name, attr ] ) => ( { name, attr, data: bytes( attr.array ).toString( 'hex' ) } ) ); check( R_RockfieldGeometry( geometry, f.b ), 'new component geometry annotated' );
	for ( const saved of original ) { same( geometry.getAttribute( saved.name ), saved.attr, 'source geometry attribute identity' ); same( bytes( saved.attr.array ).toString( 'hex' ), saved.data, 'positions/native UV/lightmap bytes preserved' ); }
	f.model.surfaces.forEach( ( s, i ) => same( bytes( s.polys.verts ).toString( 'hex' ), snapshots[ i ], 'original source polygon bytes untouched' ) ); geometry.dispose(); R_RockfieldBuild( null );

} );

Deno.test( 'actual brush draw keeps disconnected native faces with the same texture/lightmap in separate field geometries and compiled shader paths', () => {

	const pak = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	const model = Mod_ForName( 'maps/e1m4.bsp', true ), nativeDoor = Mod_ForName( '*64', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = nativeDoor; cl.model_precache[ 3 ] = null; GL_BuildLightmaps();
	const originalFields = R_RockSurfaceCharts( model, { includeBrushes: true } ), candidates = model.surfaces.filter( s => s.texinfo.texture.name === 'rock1_2' ); let pair;
	for ( const a of candidates ) { const b = candidates.find( b => a !== b && a.lightmaptexturenum === b.lightmaptexturenum && originalFields.bySurface.get( a ) !== originalFields.bySurface.get( b ) ); if ( b ) { pair = [ a, b ]; break; } }
	check( pair, 'real BSP contains disconnected same-texture/lightmap faces' );
	const dummy = face( 'city4_7', [ [ 8000, 0, 0 ], [ 8064, 0, 0 ], [ 8064, 0, 64 ], [ 8000, 0, 64 ] ] ), surfaces = [ dummy, ...pair ], fixture = { name: 'maps/disconnected-brush-proof.bsp', firstmodelsurface: 0, nummodelsurfaces: 1, surfaces }, fields = R_RockfieldBuild( fixture );
	check( fields.bySurface.get( pair[ 0 ] ) !== fields.bySurface.get( pair[ 1 ] ), 'fixture retains native disconnected membership' );
	const source = pair.map( s => bytes( s.polys.verts ).toString( 'hex' ) ), beforeHulls = nativeDoor.hulls.map( h => JSON.stringify( h ) ), oldEntity = main.currententity, frustum = main.frustum.map( p => ( { normal: Array.from( p.normal ), dist: p.dist, type: p.type, signbits: p.signbits } ) );
	try {

		for ( const p of main.frustum ) { p.normal.fill( 0 ); p.dist = -1e9; p.type = 3; p.signbits = 0; }
		const entity = new entity_t(); entity.model = { ...nativeDoor, surfaces, firstmodelsurface: 1, nummodelsurfaces: 2 }; main.set_currententity( entity ); R_DrawBrushModel( entity );
		const group = entity._brushGroup; same( group.children.length, 2, 'actual brush grouping cannot merge distinct chart IDs' );
		for ( let j = 0; j < 2; j ++ ) {

			const mesh = group.children[ j ], s = pair[ j ], expected = DrawGLPoly( s.polys, Array.from( s.plane.normal, n => n * ( s.flags & 2 ? -1 : 1 ) ) ), chart = fields.bySurface.get( s );
			for ( const name of [ 'position', 'normal', 'uv', 'uv1' ] ) check( bytes( mesh.geometry.getAttribute( name ).array ).equals( bytes( expected.getAttribute( name ).array ) ), 'native merged brush ' + name + ' remains exact' ); expected.dispose();
			check( mesh.userData.rockField && mesh.material.userData.rockField, 'actual brush registry preserves rock shader route' );
			const info = mesh.geometry.getAttribute( 'rockInfo' ); for ( let i = 0; i < info.count; i ++ ) { same( info.getX( i ), chart.id, 'each disconnected mesh carries its own component ID' ); check( Math.abs( info.getY( i ) - .35 ) < 1e-7, 'each brush uses new donor amplitude' ); }
			const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; mesh.material.onBeforeCompile( shader ); same( shader.uniforms.qrRockHeights, rockUniforms.qrRockHeights, 'compiled brush binds actual shared streamed atlas' ); check( shader.vertexShader.includes( 'vRockUv=rockUv' ) && shader.fragmentShader.includes( 'qrRockHeight' ), 'actual public brush shader samples its component field' );

		}
		pair.forEach( ( s, i ) => same( bytes( s.polys.verts ).toString( 'hex' ), source[ i ], 'original native brush fixture source bytes unchanged' ) ); nativeDoor.hulls.forEach( ( h, i ) => same( JSON.stringify( h ), beforeHulls[ i ], 'native BSP collision hulls remain unchanged' ) );
		console.log( 'CONNECTED_BRUSH_FIELDS ' + JSON.stringify( { actualDrawMeshes: group.children.length, componentIds: pair.map( s => fields.bySurface.get( s ).id ), amplitude: .35 } ) );

	} finally { main.set_currententity( oldEntity ); main.frustum.forEach( ( p, i ) => { p.normal.set( frustum[ i ].normal ); Object.assign( p, { dist: frustum[ i ].dist, type: frustum[ i ].type, signbits: frustum[ i ].signbits } ); } ); R_RockfieldBuild( null ); }

} );

Deno.test( 'all bundled native world and brush faces use their exact material/role preset and connected-field metadata without changing source coordinates', () => {

	const pack = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ), hash = () => createHash( 'sha256' ).update( pack ).digest( 'hex' ), beforePack = hash(), summary = { maps: 0, selected: {}, components: {}, excludedGroundSides: 0, sharedEdges: 0, brushFaces: 0 };
	const names = new Set( [ ...catalog.map( i => canonical( i.file ) ), 'rock4_2' ] );
	for ( let directory = pack.readInt32LE( 4 ), end = directory + pack.readInt32LE( 8 ); directory < end; directory += 64 ) {

		const name = pack.subarray( directory, directory + 56 ).toString().split( '\0' )[ 0 ]; if ( ! /^maps\/.*\.bsp$/.test( name ) ) continue;
		const start = pack.readInt32LE( directory + 56 ), b = pack.subarray( start, start + pack.readInt32LE( directory + 60 ) ), lump = id => b.readInt32LE( 4 + id * 8 ), textureBase = lump( 2 );
		const textures = Array.from( { length: b.readInt32LE( textureBase ) }, ( _, i ) => { const offset = b.readInt32LE( textureBase + 4 + i * 4 ), p = textureBase + offset; return offset < 0 ? null : { name: b.subarray( p, p + 16 ).toString().split( '\0' )[ 0 ], width: b.readInt32LE( p + 16 ), height: b.readInt32LE( p + 20 ) }; } );
		const firstmodelsurface = b.readInt32LE( lump( 14 ) + 56 ), nummodelsurfaces = b.readInt32LE( lump( 14 ) + 60 ), surfaces = [];
		for ( let i = 0; i < b.readInt32LE( 8 + 7 * 8 ) / 20; i ++ ) {

			const at = lump( 7 ) + i * 20, p = lump( 1 ) + b.readUInt16LE( at ) * 20, t = lump( 6 ) + b.readInt16LE( at + 10 ) * 40, texture = textures[ b.readInt32LE( t + 32 ) ], vectors = [ 0, 16 ].map( off => [ 0, 4, 8, 12 ].map( k => b.readFloatLE( t + off + k ) ) );
			const firstEdge = b.readInt32LE( at + 4 ), numverts = b.readInt16LE( at + 8 ), points = [];
			for ( let edge = 0; edge < numverts; edge ++ ) { const signed = b.readInt32LE( lump( 13 ) + ( firstEdge + edge ) * 4 ), vertex = b.readUInt16LE( lump( 12 ) + Math.abs( signed ) * 4 + ( signed >= 0 ? 0 : 2 ) ), point = [ 0, 4, 8 ].map( k => b.readFloatLE( lump( 3 ) + vertex * 12 + k ) ); points.push( [ ...point, ...vectors.map( ( v, k ) => ( point.reduce( ( sum, x, j ) => sum + x * v[ j ], v[ 3 ] ) / ( k ? texture?.height : texture?.width ) ) ), 0, 0 ] ); }
			const flags = ( b.readInt16LE( at + 2 ) ? 2 : 0 ) | ( texture?.name.startsWith( 'sky' ) ? 4 : 0 ) | ( texture?.name.startsWith( '*' ) ? 16 : 0 );
			surfaces.push( { flags, nativeIndex: i, plane: { normal: [ 0, 4, 8 ].map( k => b.readFloatLE( p + k ) ), dist: b.readFloatLE( p + 12 ) }, texinfo: { texture, vecs: vectors }, polys: { numverts, verts: new Float32Array( points.flat() ) } } );

		}
		const model = { name, firstmodelsurface, nummodelsurfaces, surfaces }, fields = R_RockSurfaceCharts( model, { includeBrushes: true } ), edges = new Map(); summary.maps ++;
		for ( const chart of fields.charts ) if ( names.has( chart.name ) ) { const key = chart.name + ':' + chart.profile; summary.components[ key ] = ( summary.components[ key ] || 0 ) + 1; check( chart.surfaces.every( f => canonical( f.surface.texinfo.texture.name ) === chart.name ), 'native component never mixes texture identities' ); }
		for ( const surface of surfaces ) {

			const texture = canonical( surface.texinfo.texture?.name || '' ); if ( ! names.has( texture ) ) continue;
			const z = surface.plane.normal[ 2 ] * ( surface.flags & 2 ? -1 : 1 ), expected = surface.flags & 20 ? null : texture.startsWith( 'wgrnd' ) ? z > .65 ? 'ground' : null : texture === 'rock4_1' && z > .65 ? 'ground' : 'wall', chart = fields.bySurface.get( surface );
			if ( ! expected ) { check( ! chart, 'native ground-only side/roof excluded' ); summary.excludedGroundSides ++; continue; }
			check( chart, name + ':' + surface.nativeIndex + ' every native required surface has a field' ); same( chart.profile, expected, 'independent signed native role' );
			const preset = catalog.find( i => canonical( i.file ) === texture )?.preset, wanted = preset ? { ...preset, profile: expected } : { profile: 'wall', featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1, cells: 64, amplitude: .8 }; same( json( chart.config ), json( wanted ), 'native exact numeric preset/explicit role override' ); same( chart.amplitude, wanted.amplitude, 'native saved physical amplitude' );
			const key = texture + ':' + expected; summary.selected[ key ] = ( summary.selected[ key ] || 0 ) + 1; if ( surface.nativeIndex < firstmodelsurface || surface.nativeIndex >= firstmodelsurface + nummodelsurfaces ) summary.brushFaces ++;
			const snapshot = bytes( surface.polys.verts ).toString( 'hex' ), points = Array.from( { length: surface.polys.numverts }, ( _, i ) => Array.from( surface.polys.verts.subarray( i * 7, i * 7 + 3 ) ) );
			for ( let i = 0; i < points.length; i ++ ) { const a = points[ i ], b = points[ ( i + 1 ) % points.length ], id = key + ':' + [ a.join(), b.join() ].sort().join( ':' ), other = edges.get( id ); if ( other ) { same( chart, fields.bySurface.get( other ), 'every exact native same-texture/role shared edge joins the same field' ); summary.sharedEdges ++; } else edges.set( id, surface ); }
			same( bytes( surface.polys.verts ).toString( 'hex' ), snapshot, 'native XYZ/UV source immutable' );

		}

	}
	same( summary.maps, 21, 'all native bundled BSPs included' ); same( summary.selected[ 'rock1_2:wall' ], 848, 'native840world+8brush rock1_2 coverage preserved' ); check( summary.selected[ 'rock4_1:wall' ] && summary.selected[ 'rock4_1:ground' ] && summary.selected[ 'wgrnd1_5:ground' ] && summary.selected[ 'wgrnd1_6:ground' ] && summary.excludedGroundSides && summary.sharedEdges && summary.brushFaces, 'actual six-material native role/edge/brush contexts exercised' ); same( hash(), beforePack, 'source BSP and collision lump bytes untouched' );
	console.log( 'CONNECTED_NATIVE_ROCK ' + JSON.stringify( summary ) );

} );

Deno.test( 'signed rock4_1 role threshold separates floor from wall while the other donor roles and legacy rock4_2 are explicit', () => {

	const floor = face( 'rock4_1', [ [ 0, 0, 0 ], [ 64, 0, 0 ], [ 64, 64, 0 ], [ 0, 64, 0 ] ], [ 0, 0, 1 ] ), side = wall( 'rock4_1', 0, 64, 0, 64 );
	const fields = R_RockSurfaceCharts( { name: 'maps/roles.bsp', surfaces: [ floor, side ] } ); same( fields.bySurface.get( floor ).profile, 'ground', 'upward material resolves ground' ); same( fields.bySurface.get( side ).profile, 'wall', 'vertical material resolves wall' ); check( fields.bySurface.get( floor ) !== fields.bySurface.get( side ), 'different role must split even when actual edge connects' );
	for ( const [ z, flags, expected ] of [ [ .65, 0, 'wall' ], [ .65001, 0, 'ground' ], [ -.9, 0, 'wall' ], [ -.9, 2, 'ground' ] ] ) same( R_RockMaterialProfile( { name: '+AROCK4_1' }, { flags, plane: { normal: [ Math.sqrt( 1 - z * z ), 0, z ] } } ), expected, 'signed upward threshold/underside interpretation' );
	for ( const name of [ 'rock1_2', 'uwall1_2', 'bricka2_2' ] ) same( R_RockMaterialProfile( { name }, floor ), 'wall', 'fixed wall role ignores floor orientation' );
	for ( const name of [ 'wgrnd1_5', 'wgrnd1_6' ] ) { same( R_RockMaterialProfile( { name } ), 'ground', 'catalog ground role retained' ); same( R_RockMaterialProfile( { name }, floor ), 'ground', 'explicit donor ground floor role' ); same( R_RockMaterialProfile( { name }, side ), null, 'ground-only donor cannot collapse vertical wall projection' ); same( R_RockMaterialProfile( { name }, { ...floor, flags: 2 } ), null, 'ground-only inverted side/ceiling excluded' ); same( R_RockMaterialProfile( { name }, { ...floor, flags: 2, plane: { normal: [ 0, 0, -1 ] } } ), 'ground', 'signed upward reverse plane accepted' ); }
	for ( const role of [ 'wall', 'ground' ] ) { const expected = { ...catalog.find( item => item.file === 'rock4_1.webp' ).preset, profile: role }; same( json( R_RockPreset( 'rock4_1', role ) ), json( expected ), 'rock4_1 uses exact saved numeric preset with explicit role override' ); }
	const legacy = R_RockPreset( 'rock4_2', 'wall' ); same( legacy.amplitude, .8, 'legacy requestedrock4_2 maximum retained' ); same( legacy.blockiness, 1, 'legacy blockiness stays opt-in on its own preset' );

} );

Deno.test( 'all six current owner presets dispatch exact64-cell source fields with negative/order/gutter/both-slope seam parity', () => {

	same( rock.VERSION, donor.VERSION, 'faithful1.2 core version' ); same( json( rock.DEFAULTS ), json( donor.DEFAULTS ), 'faithful donor defaults' ); same( Object.keys( ROCK_PRESETS ).length, 6, 'six authored numeric presets' );
	for ( const item of catalog ) {

		const name = canonical( item.file ); same( json( ROCK_PRESETS[ name ] ), json( item.preset ), name + ' exact owner-requested values' );
		const s = item.surface === 'ground' ? face( name, [ [ -128, 0, 0 ], [ 0, 0, 0 ], [ 0, 128, 0 ], [ -128, 128, 0 ] ], [ 0, 0, 1 ] ) : wall( name, -128, 0, 0, 128 ), chart = R_RockSurfaceCharts( { name: 'maps/preset-proof.bsp', surfaces: [ s ] } ).bySurface.get( s );
		const workers = [], cache = new RockTileCache( () => { const worker = { calls: [], postMessage( message ) { this.calls.push( message ); }, terminate() {} }; workers.push( worker ); return worker; } ); let cfg;
		try { cache.request( chart, -1, -1 ); cfg = workers.flatMap( w => w.calls )[ 0 ].config; for ( const [ key, value ] of Object.entries( item.preset ) ) same( cfg[ key ], value, 'actual public worker request preserves ' + name + ':' + key ); same( cfg.cells, 64, 'authored64 resolution' ); same( cfg.border, 2, 'runtime real gutters' ); same( cfg.blockiness, undefined, 'new donor preset does not inherit prior blocky override' ); } finally { cache.dispose(); }
		const reference = donor.createField( cfg ), actual = rock.createField( cfg ), windows = new Map();
		for ( const [ x, y ] of [ [ -1, -1 ], [ 0, -1 ], [ -1, 0 ] ] ) { const tile = rock.generateTile( actual, x, y ), expected = donor.generateTile( reference, x, y ); check( bytes( tile.data ).equals( bytes( expected.data ) ), name + ' every source height Float32 byte faithful' ); same( tile.width, 69, '64intervals plusendpoint andfour gutter samples' ); windows.set( x + ',' + y, tile ); }
		for ( const [ x, y ] of [ [ -1, 0 ], [ 0, -1 ], [ -1, -1 ] ] ) check( bytes( rock.generateTile( cfg, x, y ).data ).equals( bytes( windows.get( x + ',' + y ).data ) ), 'reverse request order preserves field bytes' );
		for ( const neighbor of [ windows.get( '0,-1' ), windows.get( '-1,0' ) ] ) { const report = rock.edgeReport( windows.get( '-1,-1' ), neighbor ); same( report.maxHeight, 0, 'source cell64 sharedheight' ); same( report.maxSlope, 0, 'source cell64 both derivatives shared' ); same( report.samples, 65, 'all shared edge samples including corners' ); }
		const tile = windows.get( '-1,-1' ); for ( let y = -2; y <= 66; y ++ ) for ( let x = -2; x <= 66; x ++ ) same( tile.data[ ( y + 2 ) * 69 + x + 2 ], Math.fround( reference.height( -1 + x / 64, -1 + y / 64 ) ), 'every64-cell gutter world sample' );
		const half = t => Uint16Array.from( t.data, v => THREE.DataUtils.toHalfFloat( v ) ), a = half( tile ), b = half( windows.get( '0,-1' ) ); for ( let y = 0; y <= 64; y ++ ) for ( let dx = -1; dx <= 1; dx ++ ) same( a[ ( y + 2 ) * 69 + 66 + dx ], b[ ( y + 2 ) * 69 + 2 + dx ], 'actual GPUhalfprecision boundary+derivativegutter equality' );

	}

} );
