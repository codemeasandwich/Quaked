// Required material coverage from native BSP data, plus real world-batch hooks.
// No browser, game loop or worker instance is started.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { R_RockBakePrefetch } from '../src/r_rockbakes.js';
import { seedFrom, createField } from '../src/rockfield.js';
import { R_RockSurfaceCharts, R_RockCoordinates, R_RockMaterialName, R_RockMaterialProfile, ROCK_AXIS_U, ROCK_AXIS_V } from '../src/r_rocksurfaces.js';
import { R_RockfieldBuild, R_RockfieldGeometry, R_RockfieldUpdate, R_RockfieldBrushSeen, R_RockfieldStatus, ROCK_SIDE, rockUniforms, r_rockfield } from '../src/r_rockfield.js';
import { DrawGLPoly, GL_BuildLightmaps, R_DrawBrushModel, R_WorldShowAll } from '../src/gl_rsurf.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/pak.js';
import { Mod_Init, Mod_ForName, Mod_ClearAll } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { cl } from '../src/client.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import * as cvar from '../src/cvar.js';
import * as main from '../src/gl_rmain.js';
import { entity_t, r_refdef } from '../src/render.js';

const required = [ 'bricka2_2', 'rock1_2', 'rock4_2', 'uwall1_2' ];
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label, tolerance = 1e-6 ) => check( Math.abs( a - b ) < tolerance, `${label}: ${a} != ${b}` );
const bytes = array => Buffer.from( array.buffer, array.byteOffset, array.byteLength ).toString( 'hex' );
const catalog = JSON.parse( /<script id="texture-catalog"[^>]*>([\s\S]*?)<\/script>/.exec( readFileSync( new URL( '../rockfield-v1.6.0.html', import.meta.url ), 'utf8' ) )[ 1 ] );
// Latest owner screenshot overrides only this material; original donor is preserved.
catalog.find( item => item.file === 'uwall1_2.webp' ).preset = { profile: 'wall', featureSize: 2.5, warp: .65, fracture: 0, detail: 1.5, cells: 64, amplitude: .8 };
// The shipped rock bakes (newer/rockfield/…) read from the checkout, as the browser fetches them beside the page; Node's
// fetch cannot take a relative URL, and a registered bake that fails to load is an error, not a fallback to the workers.
const nodeFetch = globalThis.fetch;
globalThis.fetch = async ( file, options ) => typeof file === 'string' && file.startsWith( 'newer/rockfield/' ) ? new Response( readFileSync( new URL( '../' + file.split( '?' )[ 0 ], import.meta.url ) ) ) : nodeFetch( file, options );
function expectedPreset( name, profile ) {

	const source = catalog.find( item => item.file === name + '.webp' );
	return source ? { ...source.preset, profile } : profile === 'wall'
		? { profile, featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1, cells: 64, amplitude: .8 }
		: { profile, featureSize: 2, cells: 64, amplitude: .009 };

}
function assertPreset( chart, label ) {

	const expected = expectedPreset( chart.name, chart.profile );
	same( JSON.stringify( Object.keys( chart.config ).sort() ), JSON.stringify( Object.keys( expected ).sort() ), label + ' exact owner preset keys' );
	for ( const [ key, value ] of Object.entries( expected ) ) same( chart.config[ key ], value, label + ' owner preset ' + key );
	same( chart.amplitude, expected.amplitude, label + ' exact owner amplitude' );

}
const pack = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
const digest = () => createHash( 'sha256' ).update( pack ).digest( 'hex' ), packBefore = digest();
const models = [], firstMap = new Map();
let nativeInstalled = false;
function installNative() { if ( nativeInstalled ) return; COM_AddPack( COM_LoadPackFile( 'pak0.pak', pack.buffer.slice( pack.byteOffset, pack.byteOffset + pack.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); nativeInstalled = true; }
for ( let directory = pack.readInt32LE( 4 ), end = directory + pack.readInt32LE( 8 ); directory < end; directory += 64 ) {

	const name = pack.subarray( directory, directory + 56 ).toString().split( '\0' )[ 0 ]; if ( ! /^maps\/.*\.bsp$/.test( name ) ) continue;
	const start = pack.readInt32LE( directory + 56 ), b = pack.subarray( start, start + pack.readInt32LE( directory + 60 ) ), lump = id => b.readInt32LE( 4 + id * 8 ); same( b.readInt32LE( 0 ), 29, 'native BSP version' );
	const textureBase = lump( 2 ), textures = Array.from( { length: b.readInt32LE( textureBase ) }, ( _, i ) => { const offset = b.readInt32LE( textureBase + 4 + i * 4 ), p = textureBase + offset; return offset < 0 ? null : { name: b.subarray( p, p + 16 ).toString().split( '\0' )[ 0 ], width: b.readInt32LE( p + 16 ), height: b.readInt32LE( p + 20 ) }; } );
	const first = b.readInt32LE( lump( 14 ) + 56 ), count = b.readInt32LE( lump( 14 ) + 60 ), surfaces = [];
	for ( let i = first; i < first + count; i ++ ) {

		const at = lump( 7 ) + i * 20, p = lump( 1 ) + b.readUInt16LE( at ) * 20, t = lump( 6 ) + b.readInt16LE( at + 10 ) * 40, texture = textures[ b.readInt32LE( t + 32 ) ];
		const vectors = [ 0, 16 ].map( off => [ 0, 4, 8, 12 ].map( k => b.readFloatLE( t + off + k ) ) ), normal = [ 0, 4, 8 ].map( k => b.readFloatLE( p + k ) ), firstEdge = b.readInt32LE( at + 4 ), numverts = b.readInt16LE( at + 8 ), points = [];
		for ( let edge = 0; edge < numverts; edge ++ ) { const signed = b.readInt32LE( lump( 13 ) + ( firstEdge + edge ) * 4 ), v = b.readUInt16LE( lump( 12 ) + Math.abs( signed ) * 4 + ( signed >= 0 ? 0 : 2 ) ), point = [ 0, 4, 8 ].map( k => b.readFloatLE( lump( 3 ) + v * 12 + k ) ); points.push( [ ...point, ...vectors.map( ( axis, k ) => ( axis.slice( 0, 3 ).reduce( ( sum, value, j ) => sum + value * point[ j ], axis[ 3 ] ) ) / ( k ? texture?.height : texture?.width ) ), 0, 0 ] ); }
		const flags = ( b.readInt16LE( at + 2 ) ? 2 : 0 ) | ( texture?.name.startsWith( 'sky' ) ? 4 : 0 ) | ( texture?.name.startsWith( '*' ) ? 16 : 0 );
		surfaces.push( { nativeIndex: i, flags, plane: { normal, dist: b.readFloatLE( p + 12 ) }, texinfo: { texture, vecs: vectors }, polys: { numverts, verts: new Float32Array( points.flat() ) } } );
		if ( required.includes( texture?.name ) && ! firstMap.has( texture.name ) ) firstMap.set( texture.name, name );

	}
	models.push( { name, surfaces } );

}

Deno.test( 'every native world piece of the four required materials retains exact owner presets and connected matching-edge continuity through real geometry hooks', () => {

	const totals = Object.fromEntries( required.map( name => [ name, 0 ] ) ), mapCounts = {}, orientations = { roof: 0, floor: 0, slope: 0 }, shared = { total: 0, changedTexture: 0, changedRole: 0, changedPlane: 0, ceiling: 0 };
	for ( const model of models ) {

		const charts = R_RockfieldBuild( model ), edges = new Map(), perMap = {};
		const generated = new Map( charts.charts.map( chart => [ chart, createField( { seed: chart.seed, ...chart.config } ) ] ) );
		for ( const surface of model.surfaces ) {

			const name = surface.texinfo.texture?.name, chart = charts.bySurface.get( surface ), isRequired = required.includes( name );
			if ( ! chart ) { check( ! isRequired || surface.flags & 20, model.name + ':' + name + ' no required native piece can be skipped' ); continue; }
			if ( isRequired ) {

				totals[ name ] ++; perMap[ name ] = ( perMap[ name ] || 0 ) + 1;
				same( chart.name, R_RockMaterialName( surface.texinfo.texture ), 'chart retains canonical material identity' ); same( chart.profile, R_RockMaterialProfile( surface.texinfo.texture, surface ), 'chart retains resolved role' ); assertPreset( chart, 'required material ' + name );
				same( chart.seed, seedFrom( model.name + ':' + chart.name + ':' + chart.profile ), 'seed belongs to exact connected material-role component' ); same( chart.tangent, ROCK_AXIS_U, 'wall world U basis' ); same( chart.bitangent, ROCK_AXIS_V, 'wall world V basis' );
				const z = surface.plane.normal[ 2 ] * ( surface.flags & 2 ? -1 : 1 ); if ( z < -.85 ) orientations.roof ++; else if ( z > .85 ) orientations.floor ++; else if ( Math.abs( z ) > .3 ) orientations.slope ++;
				const source = bytes( surface.polys.verts ), geometry = DrawGLPoly( surface.polys, surface.plane.normal ), original = Object.entries( geometry.attributes ).map( ( [ name, attr ] ) => ( { name, attr, bytes: bytes( attr.array ) } ) ); check( R_RockfieldGeometry( geometry, surface ), 'public world geometry annotation succeeds for ' + name );
				for ( const saved of original ) { same( geometry.getAttribute( saved.name ), saved.attr, 'original geometry attribute identity retained' ); same( bytes( saved.attr.array ), saved.bytes, 'original geometry/normal/UV/lightmap bytes retained' ); }
				for ( let i = 0; i < geometry.getAttribute( 'position' ).count; i ++ ) { const position = geometry.getAttribute( 'position' ), expected = R_RockCoordinates( chart, [ position.getX( i ), position.getY( i ), position.getZ( i ) ] ); near( geometry.getAttribute( 'rockUv' ).getX( i ), expected[ 0 ], 'world-field U', .00001 ); near( geometry.getAttribute( 'rockUv' ).getY( i ), expected[ 1 ], 'world-field V', .00001 ); same( geometry.getAttribute( 'rockInfo' ).getX( i ), chart.id, 'correct component field id' ); near( geometry.getAttribute( 'rockInfo' ).getY( i ), expectedPreset( chart.name, chart.profile ).amplitude, 'vertex carries exact saved preset amplitude' ); }
				same( bytes( surface.polys.verts ), source, 'original BSP XYZ/albedoUV source stays intact' ); geometry.dispose();

			}
			if ( chart.profile !== 'wall' ) continue;
			const points = Array.from( { length: surface.polys.numverts }, ( _, i ) => Array.from( surface.polys.verts.subarray( i * 7, i * 7 + 3 ) ) );
			for ( let i = 0; i < points.length; i ++ ) {

				const a = points[ i ], b = points[ ( i + 1 ) % points.length ], key = [ a.join(), b.join() ].sort().join( ':' ), previous = edges.get( key );
				if ( ! previous ) { edges.set( key, { surface, chart } ); continue; }
				if ( ! isRequired && ! required.includes( previous.surface.texinfo.texture.name ) ) continue;
				if ( chart.name !== previous.chart.name ) { shared.changedTexture ++; check( chart !== previous.chart, 'different material boundary remains independently preset' ); continue; }
				if ( chart.profile !== previous.chart.profile ) { shared.changedRole ++; check( chart !== previous.chart, 'different role boundary has its own component' ); continue; }
				same( chart, previous.chart, 'positive shared same-texture/same-role edge uses one component' );
				shared.total ++; if ( surface.plane.normal.reduce( ( sum, value, k ) => sum + value * previous.surface.plane.normal[ k ], 0 ) < .999 ) shared.changedPlane ++; if ( [ surface, previous.surface ].some( s => s.plane.normal[ 2 ] * ( s.flags & 2 ? -1 : 1 ) < -.85 ) ) shared.ceiling ++;
				const field = generated.get( chart );
				for ( const fraction of [ 0, .5, 1 ] ) { const point = a.map( ( value, k ) => value + ( b[ k ] - value ) * fraction ), left = R_RockCoordinates( chart, point ), right = R_RockCoordinates( previous.chart, point ); same( left.join(), right.join(), 'matching connected edge retains field coordinates despite plane changes' ); same( field.height( ...left ), field.height( ...right ), 'matching edge exact procedural height' ); for ( const axis of [ 0, 1 ] ) { const derivative = uv => { const lo = uv.slice(), hi = uv.slice(); lo[ axis ] -= 1 / 64; hi[ axis ] += 1 / 64; return ( field.height( ...hi ) - field.height( ...lo ) ) * 32; }; same( derivative( left ), derivative( right ), 'matching edge exact field slope' ); } }

			}

		}
		if ( Object.keys( perMap ).length ) mapCounts[ model.name ] = perMap;

	}
	same( models.length, 21, 'entire bundled BSP corpus included' );
	for ( const [ name, count ] of Object.entries( { bricka2_2: 80, rock1_2: 840, rock4_2: 267, uwall1_2: 307 } ) ) same( totals[ name ], count, 'exact native world coverage for ' + name ); check( orientations.roof && orientations.floor && orientations.slope && shared.total && shared.changedPlane && shared.ceiling, 'actual cave ceilings/floors/slopes and matching angled/ceiling shared edges are covered' ); same( digest(), packBefore, 'entire source PAK bytes unchanged' ); R_RockfieldBuild( null );
	console.log( 'REQUIRED_NATIVE_ROCK_COVERAGE ' + JSON.stringify( { maps: models.length, totals, mapCounts, orientations, shared } ) );

} );

Deno.test( 'the eight native E1M4 rock door faces render exact saved rest-space detail per component, schedule bounded tiles and retain native disabled modes', async () => {

	const variables = [ post.r_hdr, anim.r_newer_normals, r_rockfield ]; for ( const v of variables ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v ); const saved = variables.map( v => v.string );
	const oldWorker = Object.getOwnPropertyDescriptor( globalThis, 'Worker' ), oldFrame = main.r_framecount, oldEntity = main.currententity, oldEye = Array.from( r_refdef.vieworg ), oldFrustum = main.frustum.map( p => ( { normal: Array.from( p.normal ), dist: p.dist, type: p.type, signbits: p.signbits } ) ), workers = [];
	globalThis.Worker = class { constructor() { this.calls = []; this.terminated = false; workers.push( this ); } postMessage( message ) { this.calls.push( message ); } terminate() { this.terminated = true; } finish() { const job = this.calls.at( -1 ); this.onmessage( { data: { id: job.id, result: { width: ROCK_SIDE, tileX: job.x, tileY: job.y, data: new Float32Array( ROCK_SIDE ** 2 ).fill( .5 ) } } } ); } };
	try {

		// Reload inline models from this actual map; earlier map previews cannot
		// make a stale *64 from another map look like this door.
		installNative();
		Mod_ClearAll(); const model = Mod_ForName( 'maps/e1m4.bsp', true ), door = Mod_ForName( '*64', true ); same( door.surfaces, model.surfaces, 'real inline model owns E1M4 surfaces' ); same( door.firstmodelsurface, 5940, 'native door first face' ); same( door.nummodelsurfaces, 8, 'native door face count' );
		cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = door; cl.model_precache[ 3 ] = null; GL_BuildLightmaps();
		const faces = model.surfaces.slice( 5940, 5948 ), source = faces.map( s => bytes( s.polys.verts ) ), hulls = door.hulls.map( h => JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes, first: h.firstclipnode, last: h.lastclipnode } ) );
		const worldOnly = R_RockSurfaceCharts( model ), fields = R_RockfieldBuild( model );
		// The door's pages come from the shipped bake (E1M4 has one), so wait for it before asserting what is resident.
		await R_RockBakePrefetch(model.name)?.promise;
		for ( let i = 0; i < 500 && R_RockfieldStatus().preparedState === 'loading'; i ++ ) await new Promise( resolve => setTimeout( resolve, 10 ) );
		same( R_RockfieldStatus().preparedState, 'ready', 'the shipped E1M4 bake covers every chart, the door\'s included' );
		const entries = fields.charts.flatMap( chart => chart.surfaces ).filter( e => faces.includes( e.surface ) ), doorCharts = new Set( faces.map( surface => fields.bySurface.get( surface ) ) ); same( entries.length, 8, 'all door pieces included through extended public build' );
		same( fields.charts.flatMap( chart => chart.surfaces ).filter( e => e.surface.texinfo.texture.name === 'rock1_2' ).length, 848, '840 world plus8 door faces, not classifier-only coverage' );
		for ( const surface of faces ) { same( surface.texinfo.texture.name, 'rock1_2', 'native door material' ); check( ! worldOnly.bySurface.has( surface ), 'pure world-only API retains its original range' ); const chart = fields.bySurface.get( surface ); check( chart && chart.name === 'rock1_2' && chart.profile === 'wall', 'closed door has actual matching material-role component' ); assertPreset( chart, 'native door component' ); }
		for ( const e of entries ) check( e.brush && e.brushSeen === undefined, 'brush visibility requires actual drawing' );
		for ( const chart of doorCharts ) same( chart.seed, seedFrom( model.name + ':' + chart.name + ':' + chart.profile ), 'door seed belongs to map/rest-space component, not inline model name' );
		for ( const s of model.surfaces ) s.visframe = -1;
		variables.forEach( v => cvar.Cvar_Set( v.name, '1' ) ); anim.R_AnimSetClassicPass( false ); main.set_r_framecount( 901 );
		for ( const p of main.frustum ) { p.normal.fill( 0 ); p.dist = -1e9; p.type = 3; p.signbits = 0; }
		const entity = new entity_t(); entity.model = door; main.set_currententity( entity );
		// A distant eye isolates brush visibility from nearby-world prefetch;
		// the frustum above explicitly admits the real brush draw.
		const restEye = [ 0, 1, 2 ].map( k => Math.fround( ( door.mins[ k ] + door.maxs[ k ] ) / 2 + [ 10000, 10000, 10000 ][ k ] ) ); r_refdef.vieworg.set( restEye );
		R_RockfieldUpdate( restEye, 901, 1000 ); same( workers.length, 0, 'undrawn invisible brush starts no jobs' ); same( R_RockfieldStatus().resident, 0, 'undrawn invisible brush makes no page resident' );
		R_DrawBrushModel( entity ); const group = entity._brushGroup; check( group?.children.length, 'actual public brush draw creates native meshes' );
		let expectedVertices = 0; for ( const surface of faces ) for ( let p = surface.polys; p; p = p.next ) expectedVertices += ( p.numverts - 2 ) * 3;
		same( group.children.reduce( ( count, mesh ) => count + mesh.geometry.getAttribute( 'position' ).count, 0 ), expectedVertices, 'drawn merged geometry contains every native triangle of all8 door faces' );
		const geometrySnapshot = group.children.map( m => Object.fromEntries( Object.entries( m.geometry.attributes ).map( ( [ name, attr ] ) => [ name, bytes( attr.array ) ] ) ) );
		for ( const mesh of group.children ) {
			check( mesh.userData.rockField && mesh.material.userData.rockField, 'real drawn brush mesh/material carry rockField automatically' ); const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; mesh.material.onBeforeCompile( shader ); same( shader.uniforms.qrRockHeights, rockUniforms.qrRockHeights, 'brush shader uses live shared atlas' ); check( shader.vertexShader.includes( 'vRockUv=rockUv' ), 'brush compiled field coordinates' );
			const p = mesh.geometry.getAttribute( 'position' ), info = mesh.geometry.getAttribute( 'rockInfo' ), chart = fields.charts.find( chart => chart.id === info.getX( 0 ) ); check( doorCharts.has( chart ), 'merged brush batch resolves its actual component' );
			for ( let i = 0; i < p.count; i ++ ) { same( info.getX( i ), chart.id, 'merged brush batch never mixes component identities' ); const expected = R_RockCoordinates( chart, [ p.getX( i ), p.getY( i ), p.getZ( i ) ] ); near( mesh.geometry.getAttribute( 'rockUv' ).getX( i ), expected[ 0 ], 'closed brush matches rest-space U', .00001 ); near( mesh.geometry.getAttribute( 'rockUv' ).getY( i ), expected[ 1 ], 'closed brush matches rest-space V', .00001 ); near( info.getY( i ), expectedPreset( chart.name, chart.profile ).amplitude, 'every merged brush vertex carries exact owner amplitude' ); }
		}
		for ( const entry of entries ) { const chart = fields.bySurface.get( entry.surface ); same( entry.brushSeen, 901, 'actual R_DrawBrushModel marks all8 surfaces' ); same( entry.brushEye.join(), R_RockCoordinates( chart, restEye ).join(), 'closed eye matches component sampling space' ); }
		R_RockfieldUpdate( restEye, 902, 1101 ); const drawn = R_RockfieldStatus();
		check( drawn.desiredTiles > 0 && drawn.desiredTiles <= drawn.maxPages, 'previous-frame brush draw asks for the door\'s pages, within the atlas' );
		same( drawn.resident, drawn.desiredTiles, 'every page the drawn door asks for is resident' ); same( drawn.preparedTiles, drawn.resident, 'all of them from the shipped bake' ); same( drawn.missingVisibleTiles, 0, 'none missing' );
		same( workers.length, 0, 'the shipped bake serves the door: no worker transports' ); same( drawn.pending, 0, 'no pending jobs' );
		for ( const chart of doorCharts ) assertPreset( chart, 'door component ' + chart.name );
		R_RockfieldUpdate( restEye, 903, 1202 ); same( R_RockfieldStatus().desiredTiles, 0, 'stale unseen door asks for no pages' ); same( R_RockfieldStatus().preparedTiles, drawn.preparedTiles, 'stale unseen door installs nothing further' );
		// A90degree yaw with translation has an independent analytic inverse:
		// the eye is chosen from known rest coordinates, then put in world space.
		entity.origin.set( [ 120, -384, 48 ] ); entity.angles.set( [ 0, 90, 0 ] ); const movedEye = [ 120 - restEye[ 1 ], -384 + restEye[ 0 ], 48 + restEye[ 2 ] ]; r_refdef.vieworg.set( movedEye ); main.set_r_framecount( 904 ); R_DrawBrushModel( entity ); same( entity._brushGroup, group, 'moving door reuses its original material-rest geometry' );
		for ( const entry of entries ) { const expected = R_RockCoordinates( fields.bySurface.get( entry.surface ), restEye ); near( entry.brushEye[ 0 ], expected[ 0 ], 'rotated/translated brush inverse eye U' ); near( entry.brushEye[ 1 ], expected[ 1 ], 'rotated/translated brush inverse eye V' ); const center = entry.center, moved = [ 120 - center[ 1 ], -384 + center[ 0 ], 48 + center[ 2 ] ]; near( entry.brushDistance, Math.hypot( ...moved.map( ( v, k ) => v - movedEye[ k ] ) ), 'physical transformed distance uses world position' ); }
		group.children.forEach( ( mesh, i ) => { for ( const [ name, snapshot ] of Object.entries( geometrySnapshot[ i ] ) ) same( bytes( mesh.geometry.getAttribute( name ).array ), snapshot, 'moving brush preserves all native/field vertex bytes' ); } );
		R_WorldShowAll( true ); same( group.visible, true, 'reflection whole-world toggle retains drawn brush visibility' ); R_WorldShowAll( false ); same( group.visible, true, 'world PVS restore leaves native brush visibility alone' );
		for ( const disabled of [ 'normals', 'classic', 'native', 'rock' ] ) {

			R_RockfieldBuild( model ); variables.forEach( v => cvar.Cvar_Set( v.name, '1' ) ); anim.R_AnimSetClassicPass( disabled === 'classic' ); if ( disabled === 'normals' ) cvar.Cvar_Set( 'r_newer_normals', '0' ); if ( disabled === 'native' ) cvar.Cvar_Set( 'r_hdr', '0' ); if ( disabled === 'rock' ) cvar.Cvar_Set( 'r_rockfield', '0' );
			R_DrawBrushModel( entity ); same( R_RockfieldBrushSeen( door, group, movedEye, 905 ), 0, disabled + ' no procedural brush marks' ); R_RockfieldUpdate( movedEye, 905, 1400 ); same( rockUniforms.qrRockOn.value, 0, disabled + ' procedural shader disabled' ); same( R_RockfieldStatus().pending, 0, disabled + ' no tile jobs' ); same( workers.length, 0, disabled + ' no worker transports' ); check( entity._brushGroup.children.length && group.visible, disabled + ' original brush still drawn' );

		}
		faces.forEach( ( surface, i ) => same( bytes( surface.polys.verts ), source[ i ], 'all8 native door XYZ/UV/lightmap source bytes unchanged' ) ); door.hulls.forEach( ( h, i ) => same( JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes, first: h.firstclipnode, last: h.lastclipnode } ), hulls[ i ], 'native door collision unchanged' ) );
		console.log( 'REQUIRED_ROCK_BRUSH ' + JSON.stringify( { map: 'maps/e1m4.bsp', model: '*64', firstFace: 5940, faces: 8, rock1_2WorldAndBrush: 848, drawMeshes: group.children.length, workers: workers.length, preparedDoorPages: drawn.preparedTiles } ) );

	} finally { R_RockfieldBuild( null ); variables.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) ); anim.R_AnimSetClassicPass( false ); main.set_r_framecount( oldFrame ); main.set_currententity( oldEntity ); r_refdef.vieworg.set( oldEye ); main.frustum.forEach( ( p, i ) => { p.normal.set( oldFrustum[ i ].normal ); Object.assign( p, { dist: oldFrustum[ i ].dist, type: oldFrustum[ i ].type, signbits: oldFrustum[ i ].signbits } ); } ); if ( oldWorker ) Object.defineProperty( globalThis, 'Worker', oldWorker ); else delete globalThis.Worker; }

} );

Deno.test( 'actual world batches for every requested material bind the procedural shader and obey New Game, normal-off and Classic gates', () => {

	installNative();
	const variables = [ post.r_hdr, anim.r_newer_normals, r_rockfield ]; for ( const v of variables ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v ); const saved = variables.map( v => v.string );
	const descriptor = Object.getOwnPropertyDescriptor( THREE.Group.prototype, 'add' ), add = THREE.Group.prototype.add; let worldGroup; THREE.Group.prototype.add = function ( ...children ) { if ( this.name === 'quake_world' ) worldGroup = this; return add.apply( this, children ); };
	try {

		for ( const name of required ) {

			const model = Mod_ForName( firstMap.get( name ), true ), hulls = model.hulls.map( h => JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes } ) ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
			const texture = model.textures.find( t => t?.name === name ).gl_texture;
			const actualSurface = model.surfaces.slice( model.firstmodelsurface, model.firstmodelsurface + model.nummodelsurfaces ).find( s => s.texinfo.texture.name === name ), geometry = DrawGLPoly( actualSurface.polys, actualSurface.plane.normal ), before = Object.entries( geometry.attributes ).map( ( [ key, attribute ] ) => ( { key, attribute, bytes: bytes( attribute.array ) } ) );
			check( R_RockfieldGeometry( geometry, actualSurface ), name + ' actual native lightmapped geometry annotated' ); for ( const saved of before ) { same( geometry.getAttribute( saved.key ), saved.attribute, name + ' native runtime attribute identity' ); same( bytes( saved.attribute.array ), saved.bytes, name + ' native runtime positions/albedoUV/lightmapUV bytes' ); } geometry.dispose();
			const batches = worldGroup.children.filter( child => child.isBatchedMesh && child.material?.map === texture ); check( batches.length > 0, name + ' actual native world batches exist' );
			const components = R_RockSurfaceCharts( model, { includeBrushes: true } );
			for ( const batch of batches ) {
				const info = batch.geometry.getAttribute( 'rockInfo' ), position = batch.geometry.getAttribute( 'position' ), uv = batch.geometry.getAttribute( 'rockUv' );
				check( info && info.count % 3 === 0, name + ' native non-indexed batch consists of complete triangles' );
				// World geometries are annotated separately before BatchedMesh copies
				// them. Different components may share a draw call, but every triangle
				// must retain one field identity rather than interpolate page IDs.
				for ( let first = 0; first < info.count; first += 3 ) {
					const chart = components.charts.find( chart => chart.id === info.getX( first ) );
					check( chart && chart.name === name, name + ' world triangle resolves canonical material/component' ); assertPreset( chart, name + ' actual world triangle' );
					for ( let i = first; i < first + 3; i ++ ) { same( info.getX( i ), chart.id, name + ' world triangle never interpolates component identities' ); near( info.getY( i ), expectedPreset( name, chart.profile ).amplitude, name + ' actual world vertices carry exact saved amplitude' ); const expected = R_RockCoordinates( chart, [ position.getX( i ), position.getY( i ), position.getZ( i ) ] ); near( uv.getX( i ), expected[ 0 ], name + ' actual world triangle retains component U', .00001 ); near( uv.getY( i ), expected[ 1 ], name + ' actual world triangle retains component V', .00001 ); }
				}
			}
			for ( const batch of batches ) { same( batch.material.userData.rockField, true, name + ' original renderer automatically marks registered material' ); check( batch.geometry.getAttribute( 'rockUv' ) && batch.geometry.getAttribute( 'rockInfo' ), name + ' actual batched geometry carries field data' ); const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; batch.material.onBeforeCompile( shader ); same( shader.uniforms.qrRockHeights, rockUniforms.qrRockHeights, name + ' compiled shader uses live shared tile atlas' ); check( shader.vertexShader.includes( 'vRockUv=rockUv' ) && shader.fragmentShader.includes( 'qrHeightGradients(-vViewPosition,vRockUv,qrRockN' ), name + ' public compiled shader uses world field' ); check( shader.fragmentShader.includes( 'uClassic<.5' ), name + ' shader Classic guard present' ); }
			cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 'r_newer_normals', '1' ); cvar.Cvar_Set( 'r_rockfield', '1' ); anim.R_AnimSetClassicPass( false ); R_RockfieldUpdate( [ 0, 0, 0 ], -999, 0 ); same( rockUniforms.qrRockOn.value, 1, name + ' enhanced saved-preset field active' );
			cvar.Cvar_Set( 'r_newer_normals', '0' ); R_RockfieldUpdate( [ 0, 0, 0 ], -999, 0 ); same( rockUniforms.qrRockOn.value, 0, name + ' normal-off disables field' ); cvar.Cvar_Set( 'r_newer_normals', '1' ); anim.R_AnimSetClassicPass( true ); R_RockfieldUpdate( [ 0, 0, 0 ], -999, 0 ); same( rockUniforms.qrRockOn.value, 0, name + ' Classic disables field' ); anim.R_AnimSetClassicPass( false ); cvar.Cvar_Set( 'r_hdr', '0' ); R_RockfieldUpdate( [ 0, 0, 0 ], -999, 0 ); same( rockUniforms.qrRockOn.value, 0, name + ' New Game disables field' );
			model.hulls.forEach( ( h, i ) => same( JSON.stringify( { planes: h.planes, clipnodes: h.clipnodes } ), hulls[ i ], 'native collision hull unchanged' ) );

		}
		same( digest(), packBefore, 'original bundled map bytes unchanged' );

	} finally { variables.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) ); anim.R_AnimSetClassicPass( false ); R_RockfieldBuild( null ); if ( descriptor ) Object.defineProperty( THREE.Group.prototype, 'add', descriptor ); else delete THREE.Group.prototype.add; }

} );
