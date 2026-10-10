// Independent public-interface coverage. Actual stock QuakeC monster spawn
// functions execute the native setmodel builtin; no Face_Assign call is used.
// Rendering/masks are checked separately: these tests prove lifetime identity.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/progs/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_FindFunction, ED_NewString, ED_Alloc, ED_Free, ED_Write, ED_ParseEdict } from '../src/engine/progs/pr_edict.js';
import { sv, svs, ss_loading, SOLID_BSP, MOVETYPE_PUSH } from '../src/engine/server/server.js';
import { SV_ClearWorld } from '../src/engine/server/world.js';
import { SV_SetState, SV_SetCallbacks } from '../src/engine/server/sv_phys.js';
import { R_ParseEntityLump } from '../src/r_levelgraph.js';
import { R_LevelEntities } from '../src/r_levelents.js';
import { R_AddLevelRunner, R_MoveLevelRunner, R_ClearLevelRunners, R_ClearLevelViews, R_SetupLevelViews, R_LevelViewUseSnapshots, R_UpdateLevelViewEntities } from '../src/r_levelview.js';
import { Axe_ParseRecord } from '../src/newer/gameplay/axe_record.js';
import { Face_Index } from '../src/enemy_face.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { CL_ParseUpdate, CL_EntityNum } from '../src/cl_parse.js';
import { cl, cls, cl_visedicts, cl_numvisedicts } from '../src/client.js';
import { CL_RelinkEntities } from '../src/cl_main.js';
import { CL_ResetPrediction, CL_GetEntityFrame, CL_SetServerSequence, CL_SetValidSequence } from '../src/cl_pred.js';
import { entity_state_t } from '../src/engine/common/quakedef.js';
import { COM_SetNetMessage, MSG_BeginReading, MSG_WriteByte, SZ_Alloc, sizebuf_t } from '../src/engine/common/common.js';

const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} !== ${expected}` );
const text = i => progs.PR_GetString( i );
const types = [ [ 'monster_army', 'soldier' ], [ 'monster_ogre', 'ogre' ], [ 'monster_knight', 'knight' ] ];
const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'enemy-face-native-pak0', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );

function setup( enhanced = true ) {

	Cvar_SetValue( 'r_hdr', enhanced ? 1 : 0 );
	const binary = COM_FindFile( 'progs.dat' ).data;
	PR_LoadProgs( binary.buffer.slice( binary.byteOffset, binary.byteOffset + binary.length ) );
	progs.PR_SetSV( sv ); progs.PR_SetSVS( svs ); PR_InitBuiltins();
	SV_SetState( sv, svs, progs.pr_global_struct );
	SV_SetCallbacks( { PROG_TO_EDICT: progs.PROG_TO_EDICT, EDICT_TO_PROG: progs.EDICT_TO_PROG } );
	svs.maxclients = 1; sv.edicts = PR_AllocEdicts( 128, progs.progs.entityfields );
	sv.max_edicts = 128; sv.num_edicts = 2; sv.time = 1; sv.state = ss_loading; sv.active = true; sv.name = 'start';
	sv.worldmodel = Mod_ForName( 'maps/start.bsp', true ); sv.models = [ null, sv.worldmodel ]; sv.model_precache = [ '', 'maps/start.bsp' ];
	sv.sound_precache = [ '' ];
	for ( const key of [ 'datagram', 'reliable_datagram', 'signon' ] ) {
		sv[ key ].data = new Uint8Array( 8192 ); sv[ key ].maxsize = 8192; sv[ key ].cursize = 0; sv[ key ].allowoverflow = false;
	}
	sv.edicts[ 0 ].v.solid = SOLID_BSP; sv.edicts[ 0 ].v.movetype = MOVETYPE_PUSH; sv.edicts[ 0 ].v.modelindex = 1; SV_ClearWorld();
	progs.pr_global_struct.time = sv.time;

}

function native( entity, name ) {

	const fn = ED_FindFunction( name ); check( fn, 'shipped QuakeC function exists: ' + name );
	progs.pr_global_struct.self = progs.EDICT_TO_PROG( entity ); progs.pr_global_struct.time = sv.time;
	PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) );

}

function spawn( classname, seed, entity = ED_Alloc() ) {

	entity.v.classname = ED_NewString( classname ); entity.v.origin.set( [ 1004, 928, 72 ] );
	// Bounded exact cosmetic entropy covers each overlay choice without
	// changing QuakeC gameplay randomness or replacing native spawn behavior.
	withEntropy( seed, () => native( entity, classname ) );
	check( ! entity.free && entity.v.health > 0, 'actual native monster is alive: ' + classname );
	return entity;

}

function withEntropy( seed, action ) {

	const descriptor = Object.getOwnPropertyDescriptor( globalThis, 'crypto' );
	Object.defineProperty( globalThis, 'crypto', { configurable: true, value: { getRandomValues: buffer => { buffer.fill( seed ); return buffer; } } } );
	try { return action(); }
	finally { if ( descriptor ) Object.defineProperty( globalThis, 'crypto', descriptor ); else delete globalThis.crypto; }

}

function encoded( entity ) { const lines = []; ED_Write( lines, entity ); return lines.join( '\n' ); }
function restore( entity, value ) { ED_ParseEdict( value.slice( value.indexOf( '{' ) + 1 ), entity ); }

Deno.test( 'native spawn independently chooses all twelve faces for every target class in one level', () => {

	setup(); const identities = [];
	for ( const [ classname, model ] of types ) {
		const chosen = new Set();
		for ( let i = 0; i < 12; i ++ ) {
			const entity = spawn( classname, i );
			same( text( entity.v.model ), 'progs/' + model + '.mdl', 'native spawn retains correct model' );
			same( entity._faceSeed, i, 'each individual receives its own random seed' );
			same( Face_Index( entity, text( entity.v.model ), 12 ), i, 'actual persisted identity selects expected overlay' );
			chosen.add( Face_Index( entity, text( entity.v.model ), 12 ) ); identities.push( { classname, index: entity.index, seed: entity._faceSeed } );
		}
		same( chosen.size, 12, 'all twelve choices reachable simultaneously for ' + classname );
	}
	same( new Set( identities.map( e => e.index ) ).size, 36, 'thirty-six separate native enemies' );
	console.log( 'ENEMY_FACE_NATIVE_INDIVIDUALS ' + JSON.stringify( identities ) );

} );

Deno.test( 'native model/animation refresh, level name and clocks cannot reroll an existing individual', () => {

	setup();
	for ( const [ classname, model ] of types ) {
		const entity = spawn( classname, 0xffffffff );
		native( entity, ( model === 'soldier' ? 'army' : model ) + '_stand1' );
		same( entity._faceSeed, 0xffffffff, 'actual native stand animation retains chosen face' );
		sv.name = 'another-level'; sv.time += 1234;
		spawn( classname, 17, entity );
		same( entity._faceSeed, 0xffffffff, 'same individual survives repeated actual setmodel under different random/level/time' );
		for ( const enabled of [ false, true, false, true ] ) {
			same( Face_Index( entity, 'progs/' + model + '.mdl', 12, enabled ), enabled ? 3 : 0, 'variety toggles use same stored identity' );
			same( entity._faceSeed, 0xffffffff, 'variety toggle preserves lifetime seed' );
		}
	}

} );

Deno.test( 'ED_Free and ED_Alloc recycle an actual native slot with a fresh individual face', () => {

	setup(); const prior = spawn( 'monster_army', 29 ), slot = prior.index;
	ED_Free( prior ); sv.time += 1;
	const next = ED_Alloc(); same( next.index, slot, 'fixture recycles exactly the same native edict slot' );
	same( next._faceSeed, null, 'allocation clears prior individual identity before spawn' );
	spawn( 'monster_army', 42, next ); same( next._faceSeed, 42, 'new individual in same slot receives fresh random choice' );
	same( Face_Index( next, text( next.v.model ), 12 ), 6, 'new face differs from retired individual face five' );
	console.log( 'ENEMY_FACE_NATIVE_RECYCLED ' + JSON.stringify( { slot, priorSeed: 29, nextSeed: next._faceSeed } ) );

} );

Deno.test( 'native ED_Write and ED_ParseEdict preserve zero and maximum seeds and reject malformed save metadata', () => {

	setup();
	for ( const seed of [ 0, 1, 12, 0xffffffff ] ) {
		const source = spawn( 'monster_knight', seed ), saved = encoded( source ), copy = ED_Alloc();
		check( saved.includes( '"_newer_face_seed" "' + seed + '"' ), 'actual serializer writes seed including zero' );
		restore( copy, saved ); same( copy._faceSeed, seed, 'actual native parse round-trips unsigned seed' );
		same( text( copy.v.model ), text( source.v.model ), 'native model survives save' ); same( copy.v.health, source.v.health, 'native gameplay field survives save' );
		same( Face_Index( copy, text( copy.v.model ), 12 ), seed % 12, 'restored individual retains exact face choice' );
	}
	const destination = ED_Alloc();
	for ( const value of [ '-1', '4294967296', '1.5', 'NaN', 'Infinity', '1e3', ' 2', '2 ', '', '%malformed' ] ) {
		destination._faceSeed = 8;
		restore( destination, '{ "classname" "monster_knight" "_newer_face_seed" "' + value + '" }' );
		same( destination._faceSeed, null, 'native save parser rejects invalid seed ' + JSON.stringify( value ) );
		check( ! encoded( destination ).includes( '_newer_face_seed' ), 'rejected metadata cannot be resaved as a valid identity' );
	}
	for ( const value of [ -1, 0x100000000, 1.5, NaN, Infinity, '0' ] ) {
		destination._faceSeed = value; check( ! encoded( destination ).includes( '_newer_face_seed' ), 'serializer excludes invalid in-memory seed' );
	}

} );

Deno.test( 'actual serialized native entities retain individual seed in public portal snapshot descriptors', () => {

	setup(); const originals = types.map( ( [ classname ], i ) => spawn( classname, i === 0 ? 0 : i * 19 ) );
	const snapshot = R_ParseEntityLump( originals.map( encoded ).join( '\n' ) );
	const descriptors = R_LevelEntities( sv.worldmodel.entities, snapshot, sv.worldmodel.submodels, 1 );
	same( descriptors.length, 3, 'each saved native enemy produces one snapshot model' );
	for ( const [ i, descriptor ] of descriptors.entries() ) {
		same( descriptor.faceSeed, originals[ i ]._faceSeed, 'portal snapshot retains each individual seed including zero' );
		same( descriptor.model, text( originals[ i ].v.model ), 'portal snapshot retains native target model' );
		check( descriptor.fromSnapshot, 'descriptor is an actual saved-state projection' );
	}
	const malformed = R_LevelEntities( '', [ { classname: 'monster_army', model: 'progs/soldier.mdl', _newer_face_seed: '-1' } ], [], 1 );
	same( malformed[ 0 ].faceSeed, null, 'public snapshot parser rejects invalid seed' );
	console.log( 'ENEMY_FACE_NATIVE_SNAPSHOT ' + JSON.stringify( descriptors.map( d => ( { model: d.model, faceSeed: d.faceSeed } ) ) ) );

} );

Deno.test( 'public axe corpse parser preserves individual face metadata while rejecting invalid bounds and retaining legacy records', () => {

	const record = { version: 1, kind: 'slice', model: 'progs/knight.mdl', entityIndex: 23, frame: 1, skin: 0, at: 1, origin: [ 1, 2, 3 ], angles: [ 0, 90, 0 ], normal: [ 0, 0, 1 ] };
	const parse = value => Axe_ParseRecord( encodeURIComponent( JSON.stringify( value ) ) );
	check( parse( record ), 'legacy corpse remains valid without new metadata' );
	check( ! ( 'faceSeed' in parse( record ) ), 'legacy record does not fabricate identity' );
	for ( const seed of [ 0, 1, 0xffffffff ] ) same( parse( { ...record, faceSeed: seed } ).faceSeed, seed, 'cut corpse retains exact individual identity including zero' );
	for ( const seed of [ -1, 0x100000000, 1.5, '0', null ] ) same( parse( { ...record, faceSeed: seed } ), null, 'cut corpse rejects malformed face identity' );
	same( Axe_ParseRecord( '%malformed' ), null, 'malformed URI is rejected' );

} );

Deno.test( 'unsupported native model spawns do not receive a face and Classic keeps original native gameplay fields', () => {

	setup(); const dog = spawn( 'monster_dog', 123 );
	same( dog._faceSeed, null, 'unsupported monster does not acquire a new face seed' );
	same( Face_Index( dog, text( dog.v.model ), 12 ), 0, 'unsupported renderer model keeps native variant' );
	const enhanced = types.map( ( [ classname ] ) => { const e = spawn( classname, 0 ); return { classname: text( e.v.classname ), model: text( e.v.model ), health: e.v.health, skin: e.v.skin, solid: e.v.solid, movetype: e.v.movetype, frame: e.v.frame }; } );
	setup( false );
	const classic = types.map( ( [ classname ] ) => { const e = spawn( classname, 0 ); return { classname: text( e.v.classname ), model: text( e.v.model ), health: e.v.health, skin: e.v.skin, solid: e.v.solid, movetype: e.v.movetype, frame: e.v.frame }; } );
	same( JSON.stringify( classic ), JSON.stringify( enhanced ), 'cosmetic identity never changes stock native spawn gameplay across Classic/Newer' );

} );

Deno.test( 'native per-individual face entropy never consumes the stock QuakeC Math.random stream', () => {

	for ( const [ classname ] of types ) {
		setup();
		const originalRandom = Math.random; let calls = 0;
		try {
			Math.random = () => { calls ++; return .25; };
			const fresh = spawn( classname, 59 );
			same( fresh._faceSeed, 59, 'native spawn receives exact separate cosmetic entropy' );
			const freshCalls = calls;
			const existing = ED_Alloc(); existing._faceSeed = 3; calls = 0;
			spawn( classname, 85, existing );
			same( existing._faceSeed, 3, 'existing seed bypasses extra entropy assignment' );
			same( calls, freshCalls, 'adding identity consumes no extra QuakeC Math.random calls: ' + classname );
			calls = 0;
			withEntropy( 123, () => {
				for ( let i = 0; i < 20; i ++ ) Face_Index( {}, 'progs/soldier.mdl', 12 );
			} );
			same( calls, 0, 'extra cosmetic identities do not advance gameplay stream' );
			console.log( 'ENEMY_FACE_NATIVE_RNG ' + JSON.stringify( { classname, freshCalls, existingCalls: freshCalls, extraCosmeticCalls: calls } ) );
		} finally { Math.random = originalRandom; }
	}

} );

Deno.test( 'public delayed follower runner retains zero and unsigned identity through real native ghost attachment, relocation and rebuild', async () => {

	setup( false ); R_ClearLevelViews(); R_ClearLevelRunners();
	const origin = [ 1004, 928, 72 ], scene = new THREE.Scene();
	const crossing = { map: 'start', transform: { dest: origin, center: origin, yaw: 0, through: [ 1, 0, 0 ], position: p => p.slice(), direction: d => d.slice() }, opening: { axisA: [ 0, 1, 0 ], axisB: [ 0, 0, 1 ], a0: -32, a1: 32, b0: -32, b1: 32 } };
	const runners = types.map( ( [ classname, model ], i ) => R_AddLevelRunner( 'start', 'progs/' + model + '.mdl', 0, classname, origin, 90, [ 0, 17, 0xffffffff ][ i ] ) );
	R_LevelViewUseSnapshots( () => [] );
	const attach = async () => {
		R_SetupLevelViews( scene, [ crossing ] );
		for ( let i = 0; i < 40 && runners.some( r => ! r.g ); i ++ ) await new Promise( resolve => setTimeout( resolve, 10 ) );
		check( runners.every( r => r.g?.mesh?.geometry ), 'actual public preview builds native animated alias ghosts for delayed runners' );
	};
	try {
		await attach();
		for ( const [ i, runner ] of runners.entries() ) {
			const seed = [ 0, 17, 0xffffffff ][ i ];
			same( runner.faceSeed, seed, 'public runner retains serialized individual identity' );
			same( runner.g.e._faceSeed, seed, 'native alias ghost receives same identity including zero' );
			R_MoveLevelRunner( runner, [ 1010 + i, 930, 72 ], 180 );
			same( runner.g.e.origin.join(), [ 1010 + i, 930, 72 ].join(), 'public runner relocation moves actual ghost' );
			same( runner.g.e._faceSeed, seed, 'relocation keeps lifetime face identity' );
		}
		R_UpdateLevelViewEntities( origin, 4 );
		runners.forEach( ( runner, i ) => same( runner.g.e._faceSeed, [ 0, 17, 0xffffffff ][ i ], 'native animated ghost refresh cannot reroll face' ) );
		await attach();
		runners.forEach( ( runner, i ) => same( runner.g.e._faceSeed, [ 0, 17, 0xffffffff ][ i ], 'public view rebuild reattaches same individual face' ) );
		console.log( 'ENEMY_FACE_PUBLIC_FOLLOWER_GHOSTS ' + JSON.stringify( runners.map( r => ( { model: r.model, faceSeed: r.faceSeed, ghostFaceSeed: r.g.e._faceSeed } ) ) ) );
	} finally { R_ClearLevelRunners(); R_ClearLevelViews(); R_LevelViewUseSnapshots( null ); }

} );

Deno.test( 'legacy and malformed native saves get one persistent server identity through repeated real client entity updates', () => {

	setup(); cls.signon = 4; cls.demoplayback = false; cl.maxclients = 1;
	for ( const [ classname ] of types ) {
		const original = spawn( classname, 14 ), valid = encoded( original );
		for ( const metadata of [ null, '-1', '0', '4294967295' ] ) {
			const saved = valid.replace( /"_newer_face_seed" "[^"]*"/, metadata === null ? '' : '"_newer_face_seed" "' + metadata + '"' );
			const restored = ED_Alloc();
			withEntropy( 77, () => restore( restored, saved ) );
			const expected = metadata === '0' ? 0 : metadata === '4294967295' ? 0xffffffff : 77;
			same( restored._faceSeed, expected, 'actual native save parser assigns missing/invalid metadata once while preserving valid values' );
			const stableSaved = encoded( restored );
			check( stableSaved.includes( '"_newer_face_seed" "' + expected + '"' ), 'new or retained identity is immediately serializable' );
			cl.model_precache = sv.models.slice();
			const client = CL_EntityNum( restored.index ); client.baseline.modelindex = restored.v.modelindex;
			for ( let update = 0; update < 12; update ++ ) {
				const packet = new sizebuf_t(); SZ_Alloc( packet, 256 ); MSG_WriteByte( packet, restored.index );
				COM_SetNetMessage( packet ); MSG_BeginReading(); cl.mtime[ 1 ] = cl.mtime[ 0 ]; cl.mtime[ 0 ] += .1;
				CL_ParseUpdate( 0 );
				same( client._faceSeed, expected, 'actual native packet parse transports same seed every update' );
				same( withEntropy( 99 + update, () => Face_Index( client, text( restored.v.model ), 12 ) ), expected % 12, 'client face selection stays stable under changing entropy after old save' );
				same( encoded( restored ), stableSaved, 'repeated client updates cannot change saved native identity or gameplay fields' );
			}
			console.log( 'ENEMY_FACE_LEGACY_CLIENT_UPDATES ' + JSON.stringify( { classname, metadata, seed: expected, updates: 12 } ) );
		}
	}

} );

Deno.test( 'public QW CL_RelinkEntities copies native individual identity across same-model slot recycling and packet visibility gaps', () => {

	setup(); CL_ResetPrediction(); cls.signon = 4; cls.demoplayback = false; cl.maxclients = 1;
	const source = spawn( 'monster_army', 57 ), slot = source.index, client = CL_EntityNum( slot );
	cl.model_precache = sv.models.slice(); cl.num_entities = sv.num_edicts; cl.viewentity = 1;
	client._faceSeed = 123456; client._lastPESeq = 0;
	const state = entity => {
		const s = new entity_state_t(); s.number = entity.index; s.modelindex = entity.v.modelindex;
		s.origin.set( entity.v.origin ); s.angles.set( entity.v.angles ); s.frame = entity.v.frame; s.skin = entity.v.skin;
		return s;
	};
	const link = ( seq, states ) => {
		// Public frame storage is the normal parser/renderer handoff. Populate
		// actual packet state objects from native edicts; do not call private
		// CL_LinkPacketEntities or copy any identity into the client fixture.
		const frame = CL_GetEntityFrame( seq ); frame.invalid = false; frame.server_sequence = seq;
		frame.packet_entities.num_entities = states.length;
		states.forEach( ( s, i ) => frame.packet_entities.entities[ i ].copyFrom( s ) );
		CL_SetServerSequence( seq ); CL_SetValidSequence( seq );
		cl.mtime[ 1 ] = cl.mtime[ 0 ]; cl.mtime[ 0 ] += .1; cl.time = cl.mtime[ 0 ];
		CL_RelinkEntities();
		return cl_visedicts.slice( 0, cl_numvisedicts );
	};
	try {
		check( link( 1, [ state( source ) ] ).includes( client ), 'public QW relink puts actual native monster in visible entity list' );
		same( client._faceSeed, 57, 'QW path replaces stale client face with actual native lifetime seed' );
		const originalModel = client.model;
		for ( let seq = 2; seq < 6; seq ++ ) {
			check( link( seq, [ state( source ) ] ).includes( client ), 'ordinary QW updates continue exposing same individual' );
			same( client._faceSeed, 57, 'repeated QW relink does not reroll individual' );
		}
		check( ! link( 6, [] ).includes( client ), 'actual empty packet frame removes enemy from public visibility' );
		same( source._faceSeed, 57, 'PVS absence never mutates native lifetime seed' );
		check( link( 80, [ state( source ) ] ).includes( client ), 'enemy reappears after gap exceeding QW interpolation history' );
		same( client._faceSeed, 57, 'QW reappearance preserves existing enemy face after long visibility gap' );
		ED_Free( source ); sv.time += 1; const replacement = ED_Alloc();
		same( replacement.index, slot, 'actual native edict allocator reuses same visible model slot' );
		spawn( 'monster_army', 0, replacement );
		check( link( 81, [ state( replacement ) ] ).includes( client ), 'recycled same-model individual reaches actual QW visible list' );
		same( client.model, originalModel, 'model object identity stays identical across native slot recycling' );
		same( client._faceSeed, 0, 'QW replaces retired seed with valid zero of new individual in same slot' );
		same( withEntropy( 987, () => Face_Index( client, text( replacement.v.model ), 12 ) ), 0, 'rendered choice retains copied zero rather than drawing fresh entropy' );
		const invisible = state( replacement ); invisible.modelindex = 0;
		check( ! link( 82, [ invisible ] ).includes( client ), 'explicit invisible packet state is absent from public visible list' );
		check( link( 83, [ state( replacement ) ] ).includes( client ), 'same individual becomes visible again' );
		same( client._faceSeed, 0, 'explicit visibility transition retains lifetime zero identity' );
		console.log( 'ENEMY_FACE_QW_PUBLIC_RELINK ' + JSON.stringify( { slot, originalSeed: 57, replacementSeed: client._faceSeed, sameModelObject: client.model === originalModel, absentSequence: 6, returnedSequence: 80, invisibleSequence: 82, visibleSequence: 83 } ) );
	} finally { CL_ResetPrediction(); }

} );
