// Real surface charts, geometry, Three textures and public shader hooks. Worker
// transport and WebGL rendering are observed at their endpoints, not started.
import * as THREE from 'three';
import { R_RockSurfaceCharts, R_RockCoordinates, R_RockMaterialProfile, ROCK_AXIS_U, ROCK_AXIS_V } from '../src/r_rocksurfaces.js';
import { RockTileCache, R_RockPageHash, ROCK_TABLE_SIZE, ROCK_PROBES, ROCK_PAGES, ROCK_SIDE, ROCK_CELLS, ROCK_BORDER, R_RockfieldBuild, R_RockfieldGeometry, R_RockfieldUpdate, R_RockfieldStatus, rockUniforms, r_rockfield } from '../src/r_rockfield.js';
import { generateTile } from '../src/rockfield.js';
import { DrawGLPoly, createQuakeLightmapMaterial } from '../src/gl_rsurf.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import * as cvar from '../src/cvar.js';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { GL_BuildLightmaps } from '../src/gl_rsurf.js';
import { cl } from '../src/client.js';
import { createField, seedFrom } from '../src/rockfield.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const near = ( a, b, message, tolerance = 1e-8 ) => check( Math.abs( a - b ) <= tolerance, `${message}: ${a} != ${b}` );
const bytes = array => Buffer.from( array.buffer, array.byteOffset, array.byteLength );
function face( name, points, normal = [ 0, 0, 1 ], flags = 0, phase = 0 ) {

	return { flags, plane: { normal, dist: points[ 0 ].reduce( ( sum, value, i ) => sum + value * normal[ i ], 0 ) }, visframe: 7,
		texinfo: { texture: { name, width: 64, height: 64, anim_total: 0 } },
		polys: { numverts: points.length, verts: new Float32Array( points.flatMap( p => [ ...p, p[ 0 ] / 64 + phase, p[ 1 ] / 64 - phase, .1 + phase, .2 ] ) ) } };

}
function scene() {

	const groundA = face( 'ground1_2', [ [ -512, -256, 0 ], [ 0, -256, 0 ], [ 0, 256, 0 ], [ -512, 256, 0 ] ] );
	const groundB = face( 'ground1_6', [ [ 0, -256, 0 ], [ 512, -256, 0 ], [ 512, 256, 0 ], [ 0, 256, 0 ] ], [ 0, 0, 1 ], 0, .375 );
	const indoors = face( 'ground1_2', [ [ -1000, -256, 0 ], [ -600, -256, 0 ], [ -600, 256, 0 ], [ -1000, 256, 0 ] ] );
	const roof = face( 'stone1_3', [ [ -1100, -300, 64 ], [ -550, -300, 64 ], [ -550, 300, 64 ], [ -1100, 300, 64 ] ], [ 0, 0, -1 ] );
	const cliff = face( 'rock4_1', [ [ -256, 512, 0 ], [ 256, 512, 0 ], [ 256, 512, 300 ], [ -256, 512, 300 ] ], [ 0, -1, 0 ] );
	const otherPlane = face( 'rock4_1', [ [ 512, -256, 0 ], [ 512, 256, 0 ], [ 512, 256, 300 ], [ 512, -256, 300 ] ], [ -1, 0, 0 ] );
	const sky = face( 'sky1', [ [ -2048, -2048, 512 ], [ 2048, -2048, 512 ], [ 2048, 2048, 512 ], [ -2048, 2048, 512 ] ], [ 0, 0, -1 ], 4 );
	return { groundA, groundB, indoors, cliff, otherPlane, model: { name: 'maps/rock-test.bsp', surfaces: [ groundA, groundB, indoors, roof, cliff, otherPlane, sky ] } };

}
class WorkerDouble {

	constructor() { this.calls = []; this.terminated = false; }
	postMessage( message ) { this.calls.push( message ); }
	terminate() { this.terminated = true; }
	finish( result, id = this.calls.at( -1 ).id ) { this.onmessage( { data: { id, result } } ); }

}
function trial() { const workers = [], cache = new RockTileCache( () => { const worker = new WorkerDouble(); workers.push( worker ); return worker; } ); return { cache, workers }; }
const chart = { id: 1, seed: 73421, profile: 'ground' };
function flatTile( x, y ) { return { tileX: x, tileY: y, width: ROCK_SIDE, data: new Float32Array( ROCK_SIDE ** 2 ).fill( .5 ) }; }
function finishPending( cache ) {

	const slot = cache.workers.find( entry => entry.job ); check( slot, 'job exists' );
	slot.worker.finish( flatTile( slot.job.x, slot.job.y ) );

}
function lookup( cache, id, x, y ) {

	for ( let probe = 0; probe < Math.min( ROCK_PROBES, cache.probes.value ); probe ++ ) {

		const offset = ( ( R_RockPageHash( id, x, y ) + probe ) & ( ROCK_TABLE_SIZE - 1 ) ) * 4;
		if ( ! cache.table[ offset + 3 ] ) return -1;
		if ( cache.table[ offset ] === x && cache.table[ offset + 1 ] === y && cache.table[ offset + 2 ] === id ) return cache.table[ offset + 3 ] - 1;

	}
	return -1;

}

Deno.test( 'natural materials share continuous fields indoors and outdoors across ceilings/floors/slopes, while construction stays native', () => {

	const s = scene(), before = bytes( s.groundA.polys.verts ).toString( 'hex' ), result = R_RockSurfaceCharts( s.model );
	same( result.charts.length, 2, 'one whole-world ground field and one whole-world cliff field' );
	same( result.bySurface.get( s.groundA ), result.bySurface.get( s.groundB ), 'coplanar texture and UV changes do not split the field' );
	same( result.bySurface.get( s.indoors ), result.bySurface.get( s.groundA ), 'organic soil keeps the same field under a solid roof' );
	same( result.bySurface.get( s.cliff ), result.bySurface.get( s.otherPlane ), 'perpendicular and angled cliff faces never reseed the field' );
	const ground = result.bySurface.get( s.groundA );
	same( ground.amplitude, .009, 'ground keeps subtle original amplitude' ); same( result.bySurface.get( s.cliff ).amplitude, .8, 'wall uses donor maximum amplitude' );
	same( JSON.stringify( R_RockCoordinates( ground, [ 0, 128, 0 ] ) ), '[0,0.5]', 'world coordinate scale256 and nativeUV-independent boundary' );
	const ineligible = [ face( 'stone1_3', [ [ 0, 0, 0 ], [ 50, 0, 0 ], [ 50, 50, 0 ], [ 0, 50, 0 ] ] ), { ...s.groundA, flags: 16 }, { ...s.cliff, flags: 4 } ];
	const extra = R_RockSurfaceCharts( { ...s.model, surfaces: [ ...s.model.surfaces, ...ineligible ] } );
	for ( const f of ineligible ) check( ! extra.bySurface.has( f ), 'manufactured/liquid/sky surfaces excluded' );
	const floor = face( 'rock4_1', [ [ -1000, -256, 0 ], [ -600, -256, 0 ], [ -600, 256, 0 ], [ -1000, 256, 0 ] ] );
	const ceiling = face( '+AROCK4_1', [ [ -1000, -256, 64 ], [ -600, -256, 64 ], [ -600, 256, 64 ], [ -1000, 256, 64 ] ], [ 0, 0, -1 ], 0, .37 ); ceiling.texinfo.texture.anim_total = 20;
	const tunnel = face( 'uwall1_2', [ [ -1000, -256, 0 ], [ -600, -256, 0 ], [ -600, -256, 64 ], [ -1000, -256, 64 ] ], [ 0, 1, 0 ] );
	const slope = face( 'rock1_1', [ [ -600, -256, 0 ], [ -600, 256, 0 ], [ -700, 256, 100 ], [ -700, -256, 100 ] ], [ Math.SQRT1_2, 0, Math.SQRT1_2 ] );
	const bedrock = [ floor, ceiling, tunnel, slope ];
	const interiorModel = { ...s.model, surfaces: [ ...s.model.surfaces.filter( f => f.flags !== 4 ), ...bedrock ] };
	const inside = R_RockSurfaceCharts( interiorModel ), rock = inside.bySurface.get( s.cliff );
	for ( const surface of bedrock ) { same( inside.bySurface.get( surface ), rock, 'floor/roof/tunnel/slope/animated rock keep one field without sky' ); same( inside.bySurface.get( surface ).amplitude, .8, 'rock never changes to dirt strength by orientation' ); }
	const c0 = R_RockCoordinates( rock, [ -1000, -256, 64 ] ), cx = R_RockCoordinates( rock, [ -999, -256, 64 ] ), cy = R_RockCoordinates( rock, [ -1000, -255, 64 ] );
	check( Math.abs( ( cx[ 0 ] - c0[ 0 ] ) * ( cy[ 1 ] - c0[ 1 ] ) - ( cx[ 1 ] - c0[ 1 ] ) * ( cy[ 0 ] - c0[ 0 ] ) ) > 1e-6, 'horizontal ceiling has genuine2D sampling area' );
	for ( const name of [ 'rock1_1', 'ROCK4_2', 'uwall1_2', 'bricka2_2', '+0rock1_1', '+Auwall1_2' ] ) same( R_RockMaterialProfile( { name } ), 'wall', 'natural bedrock classification ' + name );
	for ( const name of [ 'ground1_2', 'ground1_6', 'wswamp1_2', 'wizmet1_7', 'wall16_7' ] ) same( R_RockMaterialProfile( { name } ), 'ground', 'explicit roots/soil/aggregate classification ' + name );
	for ( const name of [ 'wgrnd1_5', 'wgrnd1_6', 'wswamp1_4', 'wswamp2_1', 'ground1_1', 'groundmadeup', 'brick1_1', 'bricka2_1', 'bricka9_9', 'stone1_3', 'wizmet1_3', 'wall9_8' ] ) same( R_RockMaterialProfile( { name } ), null, 'paving/masonry/metal/unknown ground construction excluded ' + name );
	R_RockfieldBuild( s.model );
	const geometry = DrawGLPoly( s.groundA.polys, s.groundA.plane.normal ), attributes = new Map( Object.entries( geometry.attributes ).map( ( [ name, attribute ] ) => [ name, { attribute, bytes: bytes( attribute.array ).toString( 'hex' ) } ] ) );
	check( R_RockfieldGeometry( geometry, s.groundA ), 'public geometry gets separate chart attributes' );
	for ( const [ name, original ] of attributes ) { same( geometry.getAttribute( name ), original.attribute, name + ' attribute identity preserved' ); same( bytes( original.attribute.array ).toString( 'hex' ), original.bytes, name + ' original bytes preserved' ); }
	same( bytes( s.groundA.polys.verts ).toString( 'hex' ), before, 'source BSP geometry andUV bytes unchanged' );
	for ( let i = 0; i < geometry.getAttribute( 'position' ).count; i ++ ) {

		const position = geometry.getAttribute( 'position' ), uv = R_RockCoordinates( ground, [ position.getX( i ), position.getY( i ), position.getZ( i ) ] );
		near( geometry.getAttribute( 'rockUv' ).getX( i ), uv[ 0 ], 'generated chartU' ); near( geometry.getAttribute( 'rockUv' ).getY( i ), uv[ 1 ], 'generated chartV' );

	}
	R_RockfieldBuild( null ); geometry.dispose();

} );

Deno.test( 'actual E1M1 cave roofs/floors/slopes and angled rock edges share exact height and derivatives without orientation or texture seeds', () => {

	const savedWorld = cl.worldmodel, savedModels = [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ];
	try {

		const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
		COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) );
		VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
		const model = Mod_ForName( 'maps/e1m1.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
		const fields = R_RockSurfaceCharts( model ), walls = fields.charts.filter( field => field.profile === 'wall' );
		same( walls.length, 1, 'all actual cliff facets use one field' );
		const wall = walls[ 0 ]; same( wall.seed, seedFrom( 'maps/e1m1.bsp:wall' ), 'seed belongs only to map and profile' );
		check( wall.surfaces.some( f => f.surface.texinfo.texture.name === 'uwall1_2' ), 'actual main cliff texture included' );
		const orientationCounts = { roof: 0, floor: 0, slope: 0 };
		const originalVertices = new Map(), edges = new Map(), pairs = [];
		for ( const { surface } of wall.surfaces ) {

			const sign = surface.flags & 2 ? -1 : 1, normal = surface.plane.normal.map( value => value * sign );
			if ( normal[ 2 ] < -.85 ) orientationCounts.roof ++;
			else if ( normal[ 2 ] > .85 ) orientationCounts.floor ++;
			else if ( Math.abs( normal[ 2 ] ) > .3 ) orientationCounts.slope ++;
			same( fields.bySurface.get( surface ).amplitude, .8, 'actual natural rock orientation retains maximum strength' );
			for ( let p = surface.polys; p; p = p.next ) {

				originalVertices.set( p, bytes( p.verts ).toString( 'hex' ) );
				const points = Array.from( { length: p.numverts }, ( _, i ) => Array.from( p.verts.subarray( i * 7, i * 7 + 3 ) ) );
				for ( let i = 0; i < points.length; i ++ ) {

					const a = points[ i ], b = points[ ( i + 1 ) % points.length ], key = [ a.join( ',' ), b.join( ',' ) ].sort().join( ':' );
					const previous = edges.get( key );
					if ( previous && previous.normal.reduce( ( sum, value, k ) => sum + value * normal[ k ], 0 ) < .999 ) pairs.push( { a, b, first: previous.surface, second: surface } );
					else edges.set( key, { surface, normal } );

				}

			}

		}
		check( pairs.length > 0, 'native map has actual differently angled shared cliff edges' );
		check( orientationCounts.roof && orientationCounts.floor && orientationCounts.slope, 'actual map includes eligible natural roofs, floors and slopes' );
		const field = createField( { seed: wall.seed, profile: 'wall', featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1, cells: ROCK_CELLS, border: ROCK_BORDER } ), e = 1 / ROCK_CELLS;
		for ( const { a, b, first, second } of pairs ) for ( const t of [ 0, .25, .5, .75, 1 ] ) {

			const point = a.map( ( value, i ) => value + ( b[ i ] - value ) * t );
			const left = R_RockCoordinates( fields.bySurface.get( first ), point ), right = R_RockCoordinates( fields.bySurface.get( second ), point );
			same( left[ 0 ], ( ROCK_AXIS_U[ 0 ] * point[ 0 ] + ROCK_AXIS_U[ 1 ] * point[ 1 ] + ROCK_AXIS_U[ 2 ] * point[ 2 ] ) / 256, 'explicit shared obliqueU projection' ); same( left[ 1 ], ( ROCK_AXIS_V[ 0 ] * point[ 0 ] + ROCK_AXIS_V[ 1 ] * point[ 1 ] + ROCK_AXIS_V[ 2 ] * point[ 2 ] ) / 256, 'explicit shared obliqueV projection' );
			same( field.height( ...left ), field.height( ...right ), 'native angled shared edge exact height' );
			for ( const axis of [ 0, 1 ] ) {

				const derivative = uv => { const plus = uv.slice(), minus = uv.slice(); plus[ axis ] += e; minus[ axis ] -= e; return ( field.height( ...plus ) - field.height( ...minus ) ) / ( 2 * e ); };
				same( derivative( left ), derivative( right ), 'native angled edge exact field derivative ' + axis );

			}

		}
		R_RockSurfaceCharts( model );
		for ( const [ p, original ] of originalVertices ) same( bytes( p.verts ).toString( 'hex' ), original, 'actual BSP positions/albedoUV/lightmapUV remain untouched' );
		console.log( 'ACTUAL_ANGLED_ROCK_EDGES ' + pairs.length + ' ORIENTATIONS ' + JSON.stringify( orientationCounts ) );

	} finally { R_RockfieldBuild( null ); cl.worldmodel = savedWorld; [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ] = savedModels; }

} );

Deno.test( 'all bundled BSP world rock faces are classified independent of sky/orientation and retain nondegenerate shared projection', () => {

	// Decode native BSP face, edge, vertex, plane and miptexture records directly
	// rather than loading/rendering every map. The real public chart builder then
	// sees original world geometry and its material names.
	const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
	const cross = [ ROCK_AXIS_U[ 1 ] * ROCK_AXIS_V[ 2 ] - ROCK_AXIS_U[ 2 ] * ROCK_AXIS_V[ 1 ], ROCK_AXIS_U[ 2 ] * ROCK_AXIS_V[ 0 ] - ROCK_AXIS_U[ 0 ] * ROCK_AXIS_V[ 2 ], ROCK_AXIS_U[ 0 ] * ROCK_AXIS_V[ 1 ] - ROCK_AXIS_U[ 1 ] * ROCK_AXIS_V[ 0 ] ];
	const summary = { maps: 0, rock: 0, soil: 0, roof: 0, floor: 0, slope: 0, minRockArea: Infinity };
	for ( let directory = pak.readInt32LE( 4 ), end = directory + pak.readInt32LE( 8 ); directory < end; directory += 64 ) {

		const name = pak.subarray( directory, directory + 56 ).toString().split( '\0' )[ 0 ]; if ( ! /^maps\/.*\.bsp$/.test( name ) ) continue;
		const start = pak.readInt32LE( directory + 56 ), b = pak.subarray( start, start + pak.readInt32LE( directory + 60 ) );
		same( b.readInt32LE( 0 ), 29, 'native BSP version' );
		const lump = id => b.readInt32LE( 4 + id * 8 ), textureBase = lump( 2 );
		const textures = Array.from( { length: b.readInt32LE( textureBase ) }, ( _, i ) => { const offset = b.readInt32LE( textureBase + 4 + i * 4 ); return offset < 0 ? null : { name: b.subarray( textureBase + offset, textureBase + offset + 16 ).toString().split( '\0' )[ 0 ] }; } );
		const first = b.readInt32LE( lump( 14 ) + 56 ), count = b.readInt32LE( lump( 14 ) + 60 ), surfaces = [];
		for ( let i = first; i < first + count; i ++ ) {

			const faceOffset = lump( 7 ) + i * 20, planeOffset = lump( 1 ) + b.readUInt16LE( faceOffset ) * 20;
			const normal = [ 0, 4, 8 ].map( offset => b.readFloatLE( planeOffset + offset ) ), texture = textures[ b.readInt32LE( lump( 6 ) + b.readInt16LE( faceOffset + 10 ) * 40 + 32 ) ];
			const firstEdge = b.readInt32LE( faceOffset + 4 ), numverts = b.readInt16LE( faceOffset + 8 ), points = [];
			for ( let edge = 0; edge < numverts; edge ++ ) {

				const signed = b.readInt32LE( lump( 13 ) + ( firstEdge + edge ) * 4 ), vertex = b.readUInt16LE( lump( 12 ) + Math.abs( signed ) * 4 + ( signed >= 0 ? 0 : 2 ) );
				points.push( [ 0, 4, 8 ].map( offset => b.readFloatLE( lump( 3 ) + vertex * 12 + offset ) ) );

			}
			const flags = ( b.readInt16LE( faceOffset + 2 ) ? 2 : 0 ) | ( texture?.name.startsWith( 'sky' ) ? 4 : 0 ) | ( texture?.name.startsWith( '*' ) ? 16 : 0 );
			surfaces.push( { flags, plane: { normal, dist: b.readFloatLE( planeOffset + 12 ) }, texinfo: { texture }, polys: { numverts, verts: new Float32Array( points.flatMap( p => [ ...p, 0, 0, 0, 0 ] ) ) } } );

		}
		const fields = R_RockSurfaceCharts( { name, surfaces } ); summary.maps ++;
		for ( const surface of surfaces ) {

			const expected = surface.flags & 20 ? null : R_RockMaterialProfile( surface.texinfo.texture ), field = fields.bySurface.get( surface );
			if ( ! expected ) { check( ! field, 'unclassified native construction stays untouched: ' + surface.texinfo.texture?.name ); continue; }
			check( field && field.profile === expected, 'every classified native world face gets its field' ); same( field.seed, seedFrom( name + ':' + expected ), 'no plane/orientation/material-local seed' );
			if ( expected === 'ground' ) { summary.soil ++; same( field.amplitude, .009, 'native aggregate/soil stays subtle' ); continue; }
			summary.rock ++; same( field.amplitude, .8, 'all native rock orientations retain maximum' );
			const area = Math.abs( cross.reduce( ( sum, value, i ) => sum + value * surface.plane.normal[ i ], 0 ) ); summary.minRockArea = Math.min( summary.minRockArea, area );
			check( area > .03, 'shared rock projection preserves area on native plane ' + JSON.stringify( surface.plane.normal ) );
			const z = surface.plane.normal[ 2 ] * ( surface.flags & 2 ? -1 : 1 ); if ( z < -.85 ) summary.roof ++; else if ( z > .85 ) summary.floor ++; else if ( Math.abs( z ) > .3 ) summary.slope ++;

		}

	}
	check( summary.maps > 1 && summary.rock > 1000 && summary.soil > 0 && summary.roof && summary.floor && summary.slope, 'all bundled maps contain actual rock roofs/floors/slopes and soil coverage' );
	console.log( 'BUNDLED_ROCK_AUDIT ' + JSON.stringify( summary ) );

} );

Deno.test( 'actual START hub rock4_1 and confirmed Hard bricka2_2 faces share maximum relief while metal and construction remain native', () => {

	const savedWorld = cl.worldmodel, savedModels = [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ];
	try {

		const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) );
		VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
		const model = Mod_ForName( 'maps/start.bsp', true ); cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
		const first = model.firstmodelsurface || 0, last = first + model.nummodelsurfaces, world = model.surfaces.slice( first, last );
		const rock4Faces = world.filter( surface => surface.texinfo.texture.name === 'rock4_1' ), hardFaces = world.filter( surface => surface.texinfo.texture.name === 'bricka2_2' );
		const rockFaces = rock4Faces.concat( hardFaces ), originals = new Map();
		same( rock4Faces.length, 308, 'all original START rock4_1 world faces present' ); same( hardFaces.length, 80, 'all confirmed START bricka2_2 world faces present' );
		for ( const surface of rockFaces ) for ( let p = surface.polys; p; p = p.next ) originals.set( p, bytes( p.verts ).toString( 'hex' ) );
		const fields = R_RockSurfaceCharts( model ), chart = fields.bySurface.get( rockFaces[ 0 ] );
		same( chart.profile, 'wall', 'hub rock is bedrock' ); same( chart.amplitude, .8, 'hub rock maximum shading depth' ); same( chart.seed, seedFrom( 'maps/start.bsp:wall' ), 'one map/profile seed' );
		same( chart.tangent, ROCK_AXIS_U, 'hub uses shared world projectionU' ); same( chart.bitangent, ROCK_AXIS_V, 'hub uses shared world projectionV' );
		const edges = new Map(), pairs = [];
		for ( const surface of rockFaces ) {

			same( fields.bySurface.get( surface ), chart, 'every hub rock orientation shares same field' );
			for ( let p = surface.polys; p; p = p.next ) {

				const points = Array.from( { length: p.numverts }, ( _, i ) => Array.from( p.verts.subarray( i * 7, i * 7 + 3 ) ) );
				for ( let i = 0; i < points.length; i ++ ) {

					const a = points[ i ], b = points[ ( i + 1 ) % points.length ], key = [ a.join( ',' ), b.join( ',' ) ].sort().join( ':' );
					if ( edges.has( key ) ) pairs.push( { a, b, left: edges.get( key ), right: surface } ); else edges.set( key, surface );

				}

			}

		}
		check( pairs.length > 0, 'native hub contains shared rock edges' );
		const field = createField( { seed: chart.seed, profile: 'wall', featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1, cells: ROCK_CELLS, border: ROCK_BORDER } );
		for ( const pair of pairs ) for ( const t of [ 0, .5, 1 ] ) {

			const point = pair.a.map( ( value, i ) => value + ( pair.b[ i ] - value ) * t ), left = R_RockCoordinates( fields.bySurface.get( pair.left ), point ), right = R_RockCoordinates( fields.bySurface.get( pair.right ), point );
			same( field.height( ...left ), field.height( ...right ), 'actual hub shared-edge height' );
			for ( const axis of [ 0, 1 ] ) {

				const derivative = uv => { const plus = uv.slice(), minus = uv.slice(); plus[ axis ] += 1 / ROCK_CELLS; minus[ axis ] -= 1 / ROCK_CELLS; return ( field.height( ...plus ) - field.height( ...minus ) ) * ROCK_CELLS / 2; };
				same( derivative( left ), derivative( right ), 'actual hub shared-edge field derivative ' + axis );

			}

		}
		for ( const [ polygon, original ] of originals ) same( bytes( polygon.verts ).toString( 'hex' ), original, 'hub originalXYZ/textureUV/lightmapUV bytes unchanged' );
		function contains( surface, point ) {

			const n = surface.plane.normal;
			if ( Math.abs( point.reduce( ( sum, value, i ) => sum + value * n[ i ], 0 ) - surface.plane.dist ) > .001 ) return false;
			for ( let p = surface.polys; p; p = p.next ) {

				const points = Array.from( { length: p.numverts }, ( _, i ) => Array.from( p.verts.subarray( i * 7, i * 7 + 3 ) ) ); let sign = 0, inside = true;
				for ( let i = 0; i < points.length; i ++ ) {

					const a = points[ i ], b = points[ ( i + 1 ) % points.length ], e = b.map( ( value, k ) => value - a[ k ] ), q = point.map( ( value, k ) => value - a[ k ] );
					const cross = [ e[ 1 ] * q[ 2 ] - e[ 2 ] * q[ 1 ], e[ 2 ] * q[ 0 ] - e[ 0 ] * q[ 2 ], e[ 0 ] * q[ 1 ] - e[ 1 ] * q[ 0 ] ], direction = cross.reduce( ( sum, value, k ) => sum + value * n[ k ], 0 );
					if ( Math.abs( direction ) < .01 ) continue;
					if ( sign && Math.sign( direction ) !== sign ) { inside = false; break; } sign = Math.sign( direction );

				}
				if ( inside ) return true;

			}
			return false;

		}
		// Saved coordinates come from the live THREE material probe, not guesses
		// based on a texture's filename. Resolve them against native BSP polygons.
		for ( const [ label, point, texture ] of [
			[ 'LEFT', [ 704, 1192.4629022095696, 93.67266668233083 ], 'bricka2_2' ],
			[ 'RIGHT', [ 1008, 1152.271168322493, 82.47965004989224 ], 'bricka2_2' ],
			[ 'AHEAD', [ 864.03125, 1408, 58.12874833408547 ], 'bricka2_2' ],
			[ 'ABOVE', [ 864.03125, 1238.7290865586424, 253.31511416260605 ], 'wizmet1_2' ],
			[ 'BELOW', [ 864.03125, 1104, -92.88362419425815 ], 'wizmet1_2' ]
		] ) {

			const hits = world.filter( surface => contains( surface, point ) ); check( hits.length > 0, 'live Hard probe resolves to actual native polygon ' + label );
			check( hits.every( surface => surface.texinfo.texture.name === texture ), 'live Hard probe material identity ' + label );
			for ( const surface of hits ) if ( texture === 'bricka2_2' ) same( fields.bySurface.get( surface ), chart, 'actual selected Hard wall gets same maximum rock field ' + label ); else check( ! fields.bySurface.has( surface ), 'actual selected metal remains untouched ' + label );

		}
		const index = JSON.parse( readFileSync( new URL( '../newer/textures/index.json', import.meta.url ) ) );
		for ( const file of [ index.textures.bricka2_2, index.normals.bricka2_2.file ] ) {

			const path = 'newer/textures/' + file, current = readFileSync( new URL( '../' + path, import.meta.url ) ), committed = execFileSync( 'git', [ 'show', 'HEAD:' + path ], { cwd: new URL( '../', import.meta.url ) } );
			check( current.equals( committed ), 'Hard supplied texture/height artwork bytes unchanged: ' + file );

		}
		for ( const name of [ 'wizmet1_2', 'city4_7' ] ) {

			const neighbors = world.filter( surface => surface.texinfo.texture.name === name ); check( neighbors.length > 0, 'actual manufactured hub neighbor exists: ' + name );
			for ( const neighbor of neighbors ) check( ! fields.bySurface.has( neighbor ), 'native manufactured neighbor remains excluded: ' + name );

		}
		same( R_RockMaterialProfile( { name: 'bricka2_1' } ), null, 'exception does not broaden other brick surfaces' );
		console.log( 'HUB_ROCK4_FACES ' + rock4Faces.length + ' HARD_BRICKA2_2_FACES ' + hardFaces.length + ' SHARED_EDGES ' + pairs.length );

	} finally { R_RockfieldBuild( null ); cl.worldmodel = savedWorld; [ cl.model_precache[ 1 ], cl.model_precache[ 2 ] ] = savedModels; }

} );

Deno.test( 'tile cache limits jobs to2, deduplicates, ignores cancelled epochs and retains at most96 LRU pages', () => {

	const { cache, workers } = trial();
	try {

		cache.request( chart, 0, 0 ); cache.request( chart, 0, 0 ); cache.request( chart, 1, 0 ); cache.request( chart, 2, 0 );
		same( workers.length, 2, 'two lazy workers' ); same( cache.pending.size, 2, 'bounded outstanding requests' ); same( workers.reduce( ( sum, w ) => sum + w.calls.length, 0 ), 2, 'no duplicate or queued jobs' );
		const staleWorker = workers[ 0 ], staleId = staleWorker.calls[ 0 ].id; cache.cancelWorkers();
		check( workers.every( worker => worker.terminated ), 'cancel terminates owned workers' ); same( cache.pending.size, 0, 'cancel clears pending state' );
		staleWorker.finish( flatTile( 0, 0 ), staleId ); same( cache.tiles.size, 0, 'old-epoch result cannot install a page' );
		cache.request( chart, -20, 0 );
		const invalid = cache.workers.find( entry => entry.job ); invalid.worker.finish( { ...flatTile( -20, 0 ), width: ROCK_SIDE - 1 } );
		same( cache.tiles.size, 0, 'malformed reply never uploads a page' ); check( cache.failed.has( '1:-20,0' ), 'malformed tile is remembered instead of retrying each frame' );
		for ( let x = 0; x < ROCK_PAGES; x ++ ) { cache.request( chart, x, 0 ); finishPending( cache ); }
		same( cache.tiles.size, ROCK_PAGES, 'resident bound reached' ); cache.request( chart, 0, 0 );
		cache.request( chart, ROCK_PAGES, 0 ); finishPending( cache );
		same( cache.tiles.size, ROCK_PAGES, 'resident limit maintained' ); check( cache.tiles.has( '1:0,0' ) && ! cache.tiles.has( '1:1,0' ), 'recent page survives and oldest page is evicted' );
		for ( const tile of cache.tiles.values() ) same( lookup( cache, chart.id, tile.x, tile.y ), tile.page, 'every resident is GPU-addressable' );
		same( cache.heightTexture.image.depth, 96, 'bounded GPU layers' ); same( cache.heightTexture.generateMipmaps, false, 'no inconsistent per-page mip generation' );

	} finally { cache.dispose(); }

} );

Deno.test( 'GPU half-float pages retain exact shared heights and both slopes with genuine neighboring gutters', () => {

	for ( const profile of [ 'wall', 'ground' ] ) {

		const { cache } = trial(), c = { ...chart, profile };
		try {

			for ( const [ x, y ] of [ [ -1, -1 ], [ 0, -1 ], [ -1, 0 ] ] ) {

				cache.request( c, x, y ); const slot = cache.workers.find( entry => entry.job ), options = slot.worker.calls.at( -1 ).config;
				same( options.cells, ROCK_CELLS, 'worker resolution' ); same( options.border, ROCK_BORDER, 'worker gutters' ); same( options.seed, c.seed, 'shared field seed' );
				if ( profile === 'wall' ) {

					same( options.blockiness, 1, 'wall worker selects maximum block profile' ); same( options.warp, .18, 'wall preset warp' ); same( options.fracture, 1.1, 'wall preset deep fracture' ); same( options.detail, .1, 'wall preset low ripple detail' ); same( options.featureSize, 3, 'wall uses large feature scale' );

				} else {

					same( options.blockiness, undefined, 'ground is not changed to block preset' ); same( options.warp, undefined, 'ground keeps donor default warp' ); same( options.fracture, undefined, 'ground keeps donor default fracture' ); same( options.detail, undefined, 'ground keeps donor default detail' );

				}
				slot.worker.finish( generateTile( options, x, y ) );

			}
			const data = cache.heightTexture.image.data;
			const sample = ( tile, x, y ) => THREE.DataUtils.fromHalfFloat( data[ tile.page * ROCK_SIDE ** 2 + ( y + ROCK_BORDER ) * ROCK_SIDE + x + ROCK_BORDER ] );
			const a = cache.tiles.get( '1:-1,-1' );
			for ( const [ dx, dy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) {

				const b = cache.tiles.get( `1:${-1 + dx},${-1 + dy}` );
				for ( let q = 0; q <= ROCK_CELLS; q ++ ) {

					const ax = dx ? ROCK_CELLS : q, ay = dy ? ROCK_CELLS : q, bx = dx ? 0 : q, by = dy ? 0 : q;
					same( sample( a, ax, ay ), sample( b, bx, by ), 'uploaded boundary height' );
					for ( const [ sx, sy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) same( sample( a, ax + sx, ay + sy ) - sample( a, ax - sx, ay - sy ), sample( b, bx + sx, by + sy ) - sample( b, bx - sx, by - sy ), 'uploaded two-axis slopes' );

				}

			}

		} finally { cache.dispose(); }

	}

} );

Deno.test( 'page lookup preserves every resident even under a full96-page hash collision cluster', () => {

	const groups = new Map(); let collisions;
	for ( let x = -512; x <= 512 && ! collisions; x ++ ) for ( let y = -512; y <= 512 && ! collisions; y ++ ) {

		const hash = R_RockPageHash( 1, x, y ); let entries = groups.get( hash ); if ( ! entries ) groups.set( hash, entries = [] );
		entries.push( [ x, y ] ); if ( entries.length === ROCK_PAGES ) collisions = entries;

	}
	check( collisions, 'valid deterministic collision fixture exists' );
	const { cache } = trial();
	try {

		for ( const [ x, y ] of collisions ) { cache.request( chart, x, y ); finishPending( cache ); }
		same( cache.tiles.size, 96, 'all collision pages are resident' );
		same( cache.probes.value, 96, 'shader receives actual maximum collision depth' );
		for ( const tile of cache.tiles.values() ) same( lookup( cache, chart.id, tile.x, tile.y ), tile.page, 'collision page is reachable, not permanent flat fallback' );

	} finally { cache.dispose(); }

} );

Deno.test( 'public world update only requests visible eligible charts in Newer normals mode and replaces maps without stale jobs', () => {

	const previousWorker = Object.getOwnPropertyDescriptor( globalThis, 'Worker' ), workers = [];
	const variables = [ post.r_hdr, anim.r_newer_normals, r_rockfield ], saved = variables.map( v => v.string );
	for ( const variable of variables ) if ( ! cvar.Cvar_FindVar( variable.name ) ) cvar.Cvar_RegisterVariable( variable );
	Object.defineProperty( globalThis, 'Worker', { configurable: true, value: class extends WorkerDouble { constructor() { super(); workers.push( this ); } } } );
	try {

		variables.forEach( v => cvar.Cvar_Set( v.name, '1' ) ); const s = scene(); R_RockfieldBuild( s.model );
		R_RockfieldUpdate( [ 0, 0, 40 ], 8, 0 ); same( workers.length, 0, 'invisible faces do not generate' );
		cvar.Cvar_Set( 'r_hdr', '0' ); R_RockfieldUpdate( [ 0, 0, 40 ], 7, 101 ); same( workers.length, 0, 'NewGame does not generate' );
		cvar.Cvar_Set( 'r_hdr', '1' ); cvar.Cvar_Set( 'r_newer_normals', '0' ); R_RockfieldUpdate( [ 0, 0, 40 ], 7, 202 ); same( workers.length, 0, 'normal toggle disables relief' );
		cvar.Cvar_Set( 'r_newer_normals', '1' ); R_RockfieldUpdate( [ 0, 0, 40 ], 7, 303 ); same( workers.length, 2, 'eligible visible charts create two workers' ); same( R_RockfieldStatus().pending, 2, 'visible stream remains bounded' );
		anim.R_AnimSetClassicPass( true ); R_RockfieldUpdate( [ 0, 0, 40 ], 7, 404 ); same( rockUniforms.qrRockOn.value, 0, 'classic comparison suppresses procedural shader' ); anim.R_AnimSetClassicPass( false );
		const stale = workers[ 0 ], message = stale.calls[ 0 ]; R_RockfieldBuild( null );
		check( workers.every( worker => worker.terminated ), 'map replacement cancels workers' ); stale.finish( flatTile( message.x, message.y ), message.id ); same( R_RockfieldStatus().resident, 0, 'stale map result cannot restore pages' );

	} finally {

		R_RockfieldBuild( null ); anim.R_AnimSetClassicPass( false ); variables.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
		if ( previousWorker ) Object.defineProperty( globalThis, 'Worker', previousWorker ); else delete globalThis.Worker;

	}

} );

Deno.test( 'public material/compositor shader preserves UV conversion and ordinary alpha1 with byte-compatible sun visibility', () => {

	const variables = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, anim.r_newer_lighting, anim.r_newer_normals ];
	for ( const variable of variables ) if ( ! cvar.Cvar_FindVar( variable.name ) ) cvar.Cvar_RegisterVariable( variable );
	const saved = variables.map( v => v.string ), materials = []; let target, composite;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {}, render( scene ) { composite = scene.children[ 0 ].material; } };
	try {

		variables.forEach( v => cvar.Cvar_Set( v.name, '1' ) ); for ( const key of [ 'r_dynres', 'r_bloom', 'r_volumetric' ] ) cvar.Cvar_Set( key, '0' );
		const texture = new THREE.DataTexture( new Uint8Array( 64 * 64 * 4 ).fill( 128 ), 64, 64 ), lightmap = new THREE.Texture();
		for ( const rock of [ false, true ] ) {

			const material = createQuakeLightmapMaterial( texture, lightmap ); material.userData.rockField = rock; materials.push( material );
			const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; material.onBeforeCompile( shader );
			if ( ! rock ) { check( shader.fragmentShader.includes( 'gAlbedo = vec4( gDiffuse, 1.0 )' ), 'ordinary surface alpha remains1' ); continue; }
			check( shader.vertexShader.includes( 'vRockUv=rockUv' ) && shader.uniforms.qrRockHeights === rockUniforms.qrRockHeights, 'real material receives world-chart attributes and texture uniforms' );
			const frameBody = /mat3 qrRockFrame\([^)]*\) \{([^}]+)\}/.exec( shader.fragmentShader )[ 1 ];
			check( ! frameBody.includes( 'vViewPosition' ) && frameBody.includes( 'eyePosition' ), 'frame helper uses its argument before later Three varying declarations' );
			check( shader.fragmentShader.includes( 'qrRockFrame(normalize(vNormal),vViewPosition)' ), 'public shader passes actual view position to frame helper' );
			check( shader.fragmentShader.includes( 'uClassic<.5' ) && shader.fragmentShader.includes( 'qrPage>=0' ), 'classic and missing-page fallback guard POM' );
			check( shader.fragmentShader.includes( 'j<=40' ) && shader.fragmentShader.includes( 'float(j)/40.' ), 'maximum depth uses the intended40 bounded march steps' );
			const projectionExpression = /float qrProjectionAmp=([^;]+);/.exec( shader.fragmentShader )[ 1 ];
			const projection = new Function( 'qrRockAmp', 'min', 'return ' + projectionExpression );
			near( projection( .8, Math.min ), .18, 'maximum field only compresses the view projection' );
			near( projection( .009, Math.min ), .009, 'ground projection stays unchanged' );
			const stepExpression = /vec2 stepUV=([^;]+);/.exec( shader.fragmentShader )[ 1 ];
			for ( const [ amplitude, maximum ] of [ [ .8, .72 ], [ .009, .036 ] ] ) for ( const direction of [ -1, 1 ] ) {

				const step = new Function( 'V', 'qrProjectionAmp', 'max', 'abs', 'return ' + stepExpression.replaceAll( 'V.xy', 'V.x' ) );
				near( Math.abs( step( { x: direction, z: 0 }, projection( amplitude, Math.min ), Math.max, Math.abs ) ), maximum, 'actual grazing view ray displacement bound' );

			}
			near( .8 / .25, 3.2, 'full maximum ray would otherwise travel3.2 pages' );
			const hitExpression = /qrRockQ=(vRockUv\+stepUV[^;]+);/.exec( shader.fragmentShader )[ 1 ];
			const hit = new Function( 'vRockUv', 'stepUV', 't0', 't1', 'return ' + hitExpression.replaceAll( 'vRockUv', 'vRockUv.x' ).replaceAll( 'stepUV', 'stepUV.x' ) );
			near( hit( { x: .2 }, { x: -.72 }, .52, .52 ), .2 - .72 * .52, 'stored hit is the capped-ray intersection, not an after-march clamp or lerp' );
			const normalBody = shader.fragmentShader.slice( shader.fragmentShader.indexOf( 'if(qrRockAmp>0.)' ) );
			check( ! normalBody.includes( 'qrProjectionAmp' ), 'normal/AO/sun shading does not use compressed projection amplitude' );
			check( normalBody.includes( 'float h=qrRockHeight(qrRockQ)' ) && normalBody.includes( 'tile=floor(qrRockQ)' ), 'shading samples the same capped-ray hit' );
			check( normalBody.includes( 'qrRockAO=exp(-cavity*qrRockAmp*28.)' ) && normalBody.includes( '(qrRockHeight(p)-1.)*qrRockAmp' ), 'cavity and sun blocker depths retain full maximum amplitude' );
			check( shader.fragmentShader.includes( 'qrRockUvShift=qrUdx*' ) && shader.fragmentShader.includes( 'vec2 pUv = vMapUv + qrRockUvShift;' ), 'world displacement converts back through native UV derivatives' );
			const uvExpression = /qrRockUvShift=(qrUdx[^;]+);/.exec( shader.fragmentShader )[ 1 ];
			const qrRdx = { x: 2, y: -1 }, qrRdy = { x: .5, y: 1.5 }, qrUdx = { x: 8, y: 2 }, qrUdy = { x: -1, y: 4 }, det = 3.5;
			for ( const [ d, expected ] of [ [ { x: .2, y: -.1 }, [ .8, .2 ] ], [ { x: 0, y: -.35 }, [ .6, -.7 ] ] ] ) for ( const [ component, index ] of [ [ 'x', 0 ], [ 'y', 1 ] ] ) {

				const expression = uvExpression.replaceAll( 'qrUdx', 'qrUdx.' + component ).replaceAll( 'qrUdy', 'qrUdy.' + component );
				const convert = new Function( 'd', 'qrRdx', 'qrRdy', 'qrUdx', 'qrUdy', 'det', 'return ' + expression );
				near( convert( d, qrRdx, qrRdy, qrUdx, qrUdy, det ), expected[ index ], 'actual shader converts rotated/scaled chart displacement to original UV' );

			}
			check( shader.fragmentShader.includes( 'normal=normalize(normal-qrRockTbn[0]*dx*qrRockAmp-qrRockTbn[1]*dy*qrRockAmp)' ), 'height derivatives perturb actual normal' );
			check( shader.fragmentShader.includes( '(z+light.z*t)' ) && shader.fragmentShader.includes( 'qrRockSunVisibility=min' ), 'sun visibility tests actual height-ray blockers' );
			const encoded = /gAlbedo = vec4\( gDiffuse, ([^;]+) \);/.exec( shader.fragmentShader )[ 1 ];
			const encode = new Function( 'qrRockSunVisibility', 'return ' + encoded );
			post.R_PostBegin( renderer, true, 320, 200 ); post.R_PostBind( renderer ); same( target.textures[ 2 ].type, THREE.UnsignedByteType, 'existing byte-bandwidth authored-colour attachment' );
			const camera = new THREE.PerspectiveCamera( 90, 1.6, 4, 4096 ); camera.updateMatrixWorld();
			post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 0, 1, false );
			const expression = /float rockSunVisibility = ([^;]+);/.exec( composite.fragmentShader )[ 1 ];
			const clamp = ( value, lo, hi ) => Math.max( lo, Math.min( hi, value ) );
			const decode = new Function( 'alpha', 'clamp', 'return ' + expression.replaceAll( 'base.a', 'alpha' ) );
			near( decode( 1, clamp ), 1, 'ordinary alpha1 retains full sun' );
			near( decode( 0, clamp ), 1, 'unavailable legacy albedo retains full sun instead of artificial occlusion' );
			for ( const visibility of [ 0, .1, .5, .9, 1 ] ) {

				const alpha = Math.round( clamp( encode( visibility ), 0, 1 ) * 255 ) / 255;
				check( alpha > .5, 'rock pixel remains valid authored albedo' ); near( decode( alpha, clamp ), visibility, 'sun shadow survives actual UNORM quantization', .0041 );

			}

		}

	} finally { materials.forEach( material => material.dispose() ); variables.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( renderer, false, 0, 0 ); }

} );
