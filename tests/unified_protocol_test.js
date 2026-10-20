// One protocol for every game (docs/hexen2/unified-host.md §2 rule 3): a Quake session's signon and client data are
// byte for byte what they were, and a Hexen II session uses the same writer/parser with the optional entity fields and
// the Hexen-only service ids. The Quake hashes below were captured from the commit before this package with a seeded
// Math.random (QuakeC's random() is the only non-determinism in a fresh e1m1 signon).
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, coop, deathmatch, teamplay, skill, set_host_client } from '../src/engine/server/server.js';
import {
	SV_Init, SV_SpawnServer, SV_WriteClientdataToMessage, SV_EmitPacketEntities,
	SV_UpdateClientStats, SV_SendAllClientStats, SV_SetHexen2Field, SV_Hexen2EntityFields, SV_Hexen2Field,
	SV_Hexen2StartEffect, SV_Hexen2EndEffect, SV_Hexen2Plaque, SV_Hexen2RainEffect,
	SV_Hexen2Particle2, SV_Hexen2Particle3, SV_Hexen2Particle4, SV_Hexen2ParticleExplosion,
	SV_Hexen2ViewFlags, SV_Hexen2ViewTint, SV_Hexen2SetAngleInterpolate, SV_Hexen2MidiName,
	SV_Hexen2UpdateClass, SV_Hexen2ToggleStatbar, SV_Hexen2SoundUpdatePos, SV_Hexen2StopSound,
	SV_Hexen2Intermission, SV_Hexen2TempStream, sv_protocol
} from '../src/engine/server/sv_main.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { cvar_t } from '../src/engine/common/cvar.js';
import { Cbuf_Init, Cmd_Init, Cmd_ExecuteString, src_client } from '../src/engine/common/cmd.js';
import {
	PROTOCOL_VERSION, PROTOCOL_LARGE, svc_serversequence, svc_spawnbaseline, svc_spawnstatic, svc_stopsound,
	svc_hexen2_features, svc_hexen2_update_inv, svc_hexen2_updateclass, svc_hexen2_setangle_interpolate,
	svc_hexen2_temp_entity, HEXEN2_FEATURE_ALL, TE_STREAM_COLORBEAM
} from '../src/engine/common/protocol.js';
import { GameProfile_Set, GameProfile_Get } from '../src/engine/common/game_profile.js';
import { sizebuf_t, SZ_Alloc, SZ_Clear, SZ_Write, MSG_WriteByte, MSG_WriteShort, MSG_WriteLong,
	MSG_WriteCoord, MSG_WriteAngle, COM_SetNetMessage } from '../src/engine/common/common.js';
import { EDICT_NUM, PR_GetString } from '../src/engine/progs/progs.js';
import { ED_NewString } from '../src/engine/progs/pr_edict.js';
import { SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import { MAX_MSGLEN } from '../src/engine/common/quakedef.js';
import { cl, cls, cl_entities, ca_dedicated } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { CL_GetEntityFrame } from '../src/engine/client/cl_pred.js';
import { CL_Hexen2Scale } from '../src/engine/client/cl_hexen2.js';
import { S_PrecacheSound } from '../src/engine/sound/snd_dma.js';
import { MAX_EDICTS_STANDARD } from '../src/engine/common/quakedef.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` ), near = ( a, b, m, tol = 0.01 ) => check( Math.abs( a - b ) <= tol, `${m}: ${a} != ${b}` );

const SHAREWARE = new URL( '../games/shareware/pak0.pak', import.meta.url );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const HEXEN_PRESENT = existsSync( HEXEN + '/pak0.pak' ) && existsSync( HEXEN + '/pak1.pak' ) && existsSync( HEXEN + '/progs.dat' );

// FNV-1a 32: a small, stable byte identity for the captured messages.
function fnv( bytes ) { let h = 0x811c9dc5; for ( const b of bytes ) { h ^= b; h = Math.imul( h, 0x01000193 ) >>> 0; } return h.toString( 16 ).padStart( 8, '0' ); }

// A seeded Math.random so QuakeC's random() cannot move origins between two captures.
function seedRandom() {

	let state = 0x12345678;
	Math.random = () => { state = ( Math.imul( state, 1664525 ) + 1013904223 ) >>> 0; return state / 4294967296; };

}

function addPack( name, path ) {

	const raw = readFileSync( path );
	pak.COM_AddPack( pak.COM_LoadPackFile( name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

}

// A PACK archive holding one loose file (Hexen II's progs.dat is not inside its paks).
function packOf( name, data ) {

	const out = new Uint8Array( 12 + data.length + 64 ), v = new DataView( out.buffer );
	out.set( [ 80, 65, 67, 75 ] ); v.setInt32( 4, 12 + data.length, true ); v.setInt32( 8, 64, true );
	out.set( data, 12 ); out.set( new TextEncoder().encode( name ), 12 + data.length );
	v.setInt32( 12 + data.length + 56, 12, true ); v.setInt32( 12 + data.length + 60, data.length, true );
	return out;

}

let initialised = false;
function initEngine() {

	if ( initialised ) return;
	initialised = true;
	Cbuf_Init(); Cmd_Init(); Mod_Init(); PR_InitBuiltins(); Host_InitCommands(); SV_Init();
	for ( const c of [ deathmatch, coop, teamplay, skill, sv_protocol ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	svs.maxclientslimit = 4; svs.clients = Array.from( { length: 4 }, () => new client_t() ); svs.maxclients = 1;
	cls.state = ca_dedicated;

}

function resetClientForParsing() {

	CL_ClearState();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];

}

function sendFeature( msg ) {

	MSG_WriteByte( msg, svc_hexen2_features );
	MSG_WriteByte( msg, HEXEN2_FEATURE_ALL | ( GameProfile_Get().portals ? 4 : 0 ) );
	MSG_WriteShort( msg, sv.levelStringIndex ?? 0xffff );

}

function parse( msg ) { COM_SetNetMessage( msg ); CL_ParseServerMessage(); }

// The native Hexen II baseline/static body (uhexen2 CL_ParseBaseline).
function writeNativeBaseline( msg, { modelindex = 1, frame = 0, colormap = 0, skin = 0, scale = 100, drawflags = 0,
	abslight = 0, origin = [ 0, 0, 0 ], angles = [ 0, 0, 0 ] } ) {

	MSG_WriteShort( msg, modelindex );
	MSG_WriteByte( msg, frame );
	MSG_WriteByte( msg, colormap );
	MSG_WriteByte( msg, skin );
	MSG_WriteByte( msg, scale );
	MSG_WriteByte( msg, drawflags );
	MSG_WriteByte( msg, abslight );
	for ( let i = 0; i < 3; i ++ ) { MSG_WriteCoord( msg, origin[ i ] ); MSG_WriteAngle( msg, angles[ i ] ); }

}

let hexenSpawned = false;
function spawnHexenDemo() {

	if ( hexenSpawned ) return;
	hexenSpawned = true;
	GameProfile_Set( 'hexen2' );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) addPack( 'h2-' + name, HEXEN + '/' + name );
	const progs = readFileSync( HEXEN + '/progs.dat' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-progs.pak', packOf( 'progs.dat', new Uint8Array( progs ) ).buffer ) );
	SV_SpawnServer( 'demo1' );

}

Deno.test( 'a Quake signon and client data are byte for byte unchanged', () => {

	initEngine();
	seedRandom();
	addPack( 'pak0.pak', SHAREWARE );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) );
	SV_SpawnServer( 'e1m1' );
	check( sv.active, 'e1m1 spawned' );
	same( sv.protocol, PROTOCOL_VERSION, 'protocol 15' );
	const signon15 = sv.signon.data.subarray( 0, sv.signon.cursize );
	same( signon15.length, 1420, 'the captured signon length' );
	same( fnv( signon15 ), '1d922630', 'the captured signon bytes' );

	const msg = new sizebuf_t(); SZ_Alloc( msg, 8192 ); SZ_Clear( msg );
	SV_SetPlayer( EDICT_NUM( 1 ) );
	SV_WriteClientdataToMessage( EDICT_NUM( 1 ), msg, null );
	same( msg.cursize, 17, 'the captured clientdata length' );
	same( fnv( msg.data.subarray( 0, msg.cursize ) ), '91060eb5', 'the captured clientdata bytes' );

	// the same map on the large-map protocol: still exactly what it was before the Hexen fields existed
	seedRandom();
	vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_LARGE ) );
	SV_SpawnServer( 'e1m1' );
	same( sv.protocol, PROTOCOL_LARGE, 'protocol 1015' );
	same( sv.signon.cursize, 1594, 'the large signon length' );
	// the large protocol has no Hexen feature service either: only the WinQuake messages are in it
	const indexWidth = sv.protocol === PROTOCOL_LARGE ? 2 : 1;
	for ( let at = 0; at < sv.signon.cursize; ) {

		const opcode = sv.signon.data[ at ++ ];
		if ( opcode === svc_spawnstatic ) at += indexWidth + indexWidth + 1 + 1 + 9;
		else if ( opcode === svc_spawnbaseline ) at += 2 + indexWidth + indexWidth + 1 + 1 + 9;
		else if ( opcode === 29 ) at += 6 + indexWidth + 1 + 1; // coord3 + sound index + volume + attenuation
		else throw new Error( 'unexpected Quake signon opcode ' + opcode );

	}
	same( sv.signon.cursize, 1594, 'the large signon still has the same messages' );
	const msg2 = new sizebuf_t(); SZ_Alloc( msg2, 8192 ); SZ_Clear( msg2 );
	SV_WriteClientdataToMessage( EDICT_NUM( 1 ), msg2, null );
	same( fnv( msg2.data.subarray( 0, msg2.cursize ) ), '018926ef', 'the large clientdata bytes' );
	vars.Cvar_Set( 'sv_protocol', String( PROTOCOL_VERSION ) );

} );

Deno.test( 'Hexen II optional entity fields round-trip in packet entities and stay out of a default packet', () => {

	initEngine();
	GameProfile_Set( 'hexen2' );
	sv.protocol = PROTOCOL_LARGE;
	const serverClient = new client_t();
	serverClient.delta_sequence = - 1;
	const to = serverClient.frames[ 0 ].entities;
	to.num_entities = 1;
	const state = to.entities[ 0 ];
	state.number = 7; state.flags = 0; state.modelindex = 1; state.frame = 0; state.colormap = 0; state.skin = 0;
	state.effects = 0; state.origin[ 0 ] = 16; state.origin[ 1 ] = 8; state.origin[ 2 ] = 0; state.angles.fill( 0 );
	state.scale = 240; state.drawflags = 9; state.abslight = 200;

	resetClientForParsing();
	// the delta base for entity 7 is its baseline; start it at the same state so only the fields differ
	const base = EDICT_NUM( 7 ).baseline;
	base.number = 7; base.flags = 0; base.modelindex = 1; base.frame = 0; base.colormap = 0; base.skin = 0; base.effects = 0;
	base.origin[ 0 ] = state.origin[ 0 ]; base.origin[ 1 ] = state.origin[ 1 ]; base.origin[ 2 ] = state.origin[ 2 ];
	base.angles.fill( 0 ); base.scale = 100; base.drawflags = 0; base.abslight = 0;

	const msg = new sizebuf_t(); SZ_Alloc( msg, 8192 ); SZ_Clear( msg );
	MSG_WriteByte( msg, svc_serversequence ); MSG_WriteLong( msg, 1 );
	SV_EmitPacketEntities( serverClient, to, msg );
	parse( msg );
	const frame = CL_GetEntityFrame( 1 ).packet_entities;
	same( frame.num_entities, 1, 'one packet entity' );
	const got = frame.entities[ 0 ];
	same( got.scale, 240, 'the native scale byte' );
	same( got.drawflags, 9, 'the draw flags byte' );
	same( got.abslight, 200, 'the abslight byte' );
	near( CL_Hexen2Scale( got.scale ), 2.4, 'the decoded entity scale' );

	// a default entity sends no second bits byte at all: a Quake packet's size
	state.scale = 100; state.drawflags = 0; state.abslight = 0;
	const plain = new sizebuf_t(); SZ_Alloc( plain, 8192 ); SZ_Clear( plain );
	MSG_WriteByte( plain, svc_serversequence ); MSG_WriteLong( plain, 2 );
	SV_EmitPacketEntities( serverClient, to, plain );
	parse( plain );
	const plainState = CL_GetEntityFrame( 2 ).packet_entities.entities[ 0 ];
	same( plainState.scale, 100, 'a default entity stays at scale 1.0 on the wire' );
	same( plainState.drawflags, 0, 'and at drawflags 0' );
	same( plainState.abslight, 0, 'and at abslight 0' );

} );

Deno.test( 'Hexen II baselines, statics, player class and the stat record round-trip', () => {

	if ( ! HEXEN_PRESENT ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + HEXEN ); return; }
	initEngine();
	spawnHexenDemo();
	check( sv.active, 'demo1 spawned' );
	same( sv.protocol, PROTOCOL_LARGE, 'the one extended protocol' );
	same( sv.max_edicts, 600, 'Hexen II\'s edict ceiling' );
	same( sv.max_temp_edicts, 30, 'the reserved temp edicts' );
	same( sv.num_edicts >= svs.maxclients + 1 + 30, true, 'the temp slots are reserved at spawn' );

	// walk the signon structurally: statics and baselines use the native fixed layout, and every message ends where the
	// next opcode starts.
	const data = sv.signon.data, end = sv.signon.cursize;
	let at = 0, statics = 0, baselines = 0;
	while ( at < end ) {

		const opcode = data[ at ++ ];
		if ( opcode === svc_spawnstatic ) {

			statics ++;
			at += 2; // model
			at += 6; // frame, colormap, skin, scale, drawflags, abslight
			at += 9; // three coord/angle pairs

		} else if ( opcode === 29 ) { // svc_spawnstaticsound: coord3 + short sample + volume + attenuation

			at += 10;

		} else if ( opcode === svc_spawnbaseline ) {

			baselines ++;
			at += 2; // entity
			at += 2; // model
			at += 6 + 9;

		} else throw new Error( 'unexpected signon opcode ' + opcode + ' at ' + ( at - 1 ) );

		check( at <= end, 'a signon message ran past the buffer' );

	}
	same( at, end, 'the signon walk ends exactly at its length' );
	check( statics > 0, 'the map has static entities' );
	check( baselines > 0, 'the map has baselines' );

	// The real client parser reads the feature, every static and every baseline.
	resetClientForParsing();
	cl.worldmodel = sv.worldmodel;
	cl.model_precache[ 1 ] = sv.worldmodel;
	for ( let i = 1; i < sv.model_precache.length; i ++ )
		if ( sv.model_precache[ i ] && cl.model_precache[ i ] === null ) cl.model_precache[ i ] = Mod_ForName( sv.model_precache[ i ], false );
	for ( let i = 1; i < sv.sound_precache.length; i ++ )
		if ( sv.sound_precache[ i ] && cl.sound_precache[ i ] === null ) cl.sound_precache[ i ] = S_PrecacheSound( sv.sound_precache[ i ] );
	const msg = new sizebuf_t(); SZ_Alloc( msg, 65536 ); SZ_Clear( msg );
	sendFeature( msg );
	SZ_Write( msg, sv.signon.data, sv.signon.cursize );
	parse( msg );
	check( cl.h2.active, 'the feature marked the session Hexen II' );
	check( cl.h2.nativeBaselines, 'the native baseline layout was selected' );
	same( cl.h2.levelStringIndex, sv.levelStringIndex, 'the worldspawn strings.txt index is carried' );
	check( cl.num_entities > 0, 'the baselines made client entities: ' + cl.num_entities );
	same( cl.num_statics, statics, 'every static entity was read' );
	check( cl_entities[ 0 ].baseline.modelindex === 1, 'the world baseline' );
	same( cl_entities[ 0 ].baseline.scale, EDICT_NUM( 0 ).baseline.scale, 'the world baseline scale byte came through' );
	same( cl_entities[ 0 ].baseline.drawflags, EDICT_NUM( 0 ).baseline.drawflags, 'the world baseline drawflags byte came through' );
	same( cl_entities[ 0 ].baseline.abslight, EDICT_NUM( 0 ).baseline.abslight, 'the world baseline abslight byte came through' );

	// The field lookup is by name but the cached slot must be read through each edict's own accessor.
	SV_SetHexen2Field( EDICT_NUM( 1 ), 'scale', 2.0 );
	SV_SetHexen2Field( EDICT_NUM( 2 ), 'scale', 0.5 );
	same( SV_Hexen2EntityFields( EDICT_NUM( 1 ) ).scale, 200, 'the first edict scale' );
	same( SV_Hexen2EntityFields( EDICT_NUM( 2 ) ).scale, 50, 'the second edict scale' );

	// playerclass and the inventory/stats record through the same writer and parser
	const client = new client_t(); client.edict = EDICT_NUM( 1 ); client.message = new sizebuf_t(); SZ_Alloc( client.message, 8192 ); SZ_Clear( client.message );
	SV_SetHexen2Field( client.edict, 'health', 87 );
	SV_SetHexen2Field( client.edict, 'level', 2 );
	SV_SetHexen2Field( client.edict, 'inventory', 3 );
	client.edict.v.puzzle_inv1 = ED_NewString( 'tomb' );
	SV_SendAllClientStats( client, client.message );
	SV_Hexen2UpdateClass( client.message, 0, 3 );
	COM_SetNetMessage( client.message );
	CL_ParseServerMessage();
	same( cl.h2.stats.health, 87, 'the health stat' );
	same( cl.h2.stats.level, 2, 'the level stat' );
	same( cl.h2.stats.inventory, 3, 'the inventory stat' );
	same( cl.h2.puzzles[ 0 ], 'tomb', 'the puzzle string stat' );
	same( cl.h2.playerclass[ 0 ], 3, 'the player class' );
	check( cl.h2.stats.health !== undefined, 'the record was applied' );
	check( PR_GetString( client.edict.v.puzzle_inv1 ) === 'tomb', 'the native puzzle string' );

	// A delta carries only what changed, in the right half of the 56-bit SC1/SC2 space: an SC2-only change (armour) must
	// arrive as that field, and SC1's top bit (rings_active) must not spill into SC2.
	SV_UpdateClientStats( client, client.message ); // records the baseline the deltas compare against
	SZ_Clear( client.message );
	SV_SetHexen2Field( client.edict, 'armor_amulet', 5 );
	SV_UpdateClientStats( client, client.message );
	COM_SetNetMessage( client.message );
	CL_ParseServerMessage();
	same( cl.h2.stats.armor_amulet, 5, 'an SC2-only delta updates the amulet armour' );
	same( cl.h2.stats.level, 2, 'the SC2 delta left the SC1 level alone' );
	SZ_Clear( client.message );
	SV_SetHexen2Field( client.edict, 'rings_active', 4 );
	SV_UpdateClientStats( client, client.message );
	COM_SetNetMessage( client.message );
	CL_ParseServerMessage();
	same( cl.h2.stats.rings_active, 4, 'SC1\'s top bit (rings_active) arrives' );
	same( cl.h2.stats.armor_amulet, 5, 'and does not rewrite the SC2 fields' );
	SZ_Clear( client.message );

	// The real Host_Spawn_f branch: choice from `_cl_playerclass`, ClientConnect then PutClientInServer, and the class
	// and stat record on the client's signon message.
	if ( vars.Cvar_FindVar( '_cl_playerclass' ) === null ) vars.Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '2', true ) );
	vars.Cvar_Set( '_cl_playerclass', '2' );
	const spawned = svs.clients[ 0 ];
	spawned.active = true; spawned.spawned = false; spawned.name = 'tester'; spawned.edict = EDICT_NUM( 1 );
	spawned.netconnection = { address: 'local', connecttime: 0 };
	spawned.message.data = spawned.msgbuf; spawned.message.maxsize = MAX_MSGLEN; spawned.message.allowoverflow = true; spawned.message.cursize = 0;
	set_host_client( spawned );
	SV_SetPlayer( spawned.edict );
	Cmd_ExecuteString( 'spawn', src_client );
	same( spawned.playerclass, 2, 'the class chosen by _cl_playerclass' );
	same( SV_Hexen2Field( spawned.edict, 'playerclass' ), 2, 'the class on the player edict' );
	let classMessage = false, invMessage = false;
	for ( let i = 0; i + 2 < spawned.message.cursize; i ++ ) {

		if ( spawned.message.data[ i ] === svc_hexen2_updateclass && spawned.message.data[ i + 1 ] === 0 && spawned.message.data[ i + 2 ] === 2 ) classMessage = true;
		if ( spawned.message.data[ i ] === svc_hexen2_update_inv ) invMessage = true;

	}
	check( classMessage, 'the spawn message carries svc_updateclass for slot 0' );
	check( invMessage, 'the spawn message carries the inventory/stats record' );
	GameProfile_Set( 'quake' );

} );

Deno.test( 'every Hexen II service id round-trips through the server writers and the real client parser', () => {

	if ( ! HEXEN_PRESENT ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + HEXEN ); return; }
	initEngine();
	spawnHexenDemo();
	resetClientForParsing();
	const feature = new sizebuf_t(); SZ_Alloc( feature, 64 ); SZ_Clear( feature );
	sendFeature( feature );
	parse( feature );

	const run = ( build ) => {

		const msg = new sizebuf_t(); SZ_Alloc( msg, 8192 ); SZ_Clear( msg );
		build( msg );
		parse( msg );

	};
	const runClient = ( build ) => {

		const client = new client_t(); client.message = new sizebuf_t(); SZ_Alloc( client.message, 8192 ); SZ_Clear( client.message );
		build( client.message );
		parse( client.message );

	};

	SZ_Clear( sv.datagram );
	check( SV_Hexen2StartEffect( { index: 4, type: 5, params: { origin: [ 1, 2, 3 ] } } ), 'a native origin-only effect' );
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	same( cl.h2.effects[ 4 ].type, 5, 'the start_effect type' );
	near( cl.h2.effects[ 4 ].params.origin[ 0 ], 1, 'the start_effect origin' );

	SZ_Clear( sv.datagram );
	check( SV_Hexen2EndEffect( 4 ), 'end_effect' );
	MSG_WriteByte( sv.datagram, 1 ); // a following message must not be eaten by the end_effect body
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	check( cl.h2.effects[ 4 ] === undefined, 'the effect slot ended' );

	SZ_Clear( sv.reliable_datagram );
	SV_Hexen2Plaque( 12 );
	run( msg => SZ_Write( msg, sv.reliable_datagram.data, sv.reliable_datagram.cursize ) );
	same( cl.h2.plaqueIndex, 12, 'the plaque index' );

	SZ_Clear( sv.datagram );
	SV_Hexen2RainEffect( [ 1, 2, 3 ], [ 4, 5, 6 ], 30, 40, 7, 8 );
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	same( cl.h2.rain.at( - 1 ).colour, 7, 'the rain colour' );
	same( cl.h2.rain.at( - 1 ).count, 8, 'the rain count' );

	SZ_Clear( sv.datagram );
	SV_Hexen2Particle2( [ 1, 2, 3 ], [ - 1, - 2, - 3 ], [ 4, 5, 6 ], 9, 2, 11 );
	SV_Hexen2Particle3( [ 1, 2, 3 ], [ 4, 5, 6 ], 10, 3, 12 );
	SV_Hexen2Particle4( [ 1, 2, 3 ], 8, 11, 4, 13 );
	SV_Hexen2ParticleExplosion( [ 1, 2, 3 ], 12, 30, 40 );
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	const kinds = cl.h2.particles.slice( - 4 ).map( p => p.kind ).join( ',' );
	same( kinds, 'particle2,particle3,particle4,particle_explosion', 'the four particle records' );
	same( cl.h2.particles.at( - 1 ).radius, 30, 'the explosion radius' );

	runClient( msg => SV_Hexen2ViewFlags( { message: msg }, 4 ) );
	same( cl.h2.viewDrawflags, 4, 'the view draw flags set' );
	runClient( msg => SV_Hexen2ViewFlags( { message: msg }, 4, true ) );
	same( cl.h2.viewDrawflags, 0, 'the view draw flags cleared' );
	runClient( msg => SV_Hexen2ViewTint( { message: msg }, 9 ) );
	same( cl.h2.viewTint, 9, 'the view tint' );

	cl.viewangles.fill( 0 );
	runClient( msg => SV_Hexen2SetAngleInterpolate( { message: msg }, [ 90, 90, 0 ] ) );
	near( cl.viewangles[ 0 ], 11.25, 'one eighth of the way to the angle target' );

	runClient( msg => SV_Hexen2MidiName( { message: msg }, 'music/demo1.mid' ) );
	same( cl.h2.midiName, 'music/demo1.mid', 'the MIDI name' );
	runClient( msg => SV_Hexen2ToggleStatbar( { message: msg } ) );
	same( cl.h2.statbar, 0, 'the status bar toggle' );
	runClient( msg => SV_Hexen2ToggleStatbar( { message: msg } ) );
	same( cl.h2.statbar, 1, 'the status bar toggled back' );

	SZ_Clear( sv.reliable_datagram );
	SV_Hexen2Intermission( 6 );
	run( msg => SZ_Write( msg, sv.reliable_datagram.data, sv.reliable_datagram.cursize ) );
	same( cl.h2.intermission, 6, 'the intermission index' );
	same( cl.intermission, 1, 'the Quake intermission state' );

	SZ_Clear( sv.datagram );
	SV_Hexen2TempStream( TE_STREAM_COLORBEAM, 3, 5, 10, [ 1, 2, 3 ], [ 4, 5, 6 ], 7 );
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	const stream = cl.h2.streams.at( - 1 );
	same( stream.type, TE_STREAM_COLORBEAM, 'the stream type' );
	same( stream.tag, 5, 'the stream tag' );
	same( stream.skin, 7, 'the colour-beam skin' );

	SZ_Clear( sv.datagram );
	SV_Hexen2SoundUpdatePos( EDICT_NUM( 3 ), 2 );
	SV_Hexen2StopSound( EDICT_NUM( 3 ), 2 );
	run( msg => SZ_Write( msg, sv.datagram.data, sv.datagram.cursize ) );
	same( cl.h2.lastSoundPosition.entity, 3, 'the moved sound entity' );
	same( cl.h2.lastSoundPosition.channel, 2, 'the moved sound channel' );

	// the update_inv / info-mask service ids are covered by the spawn test above; here the feature id changed the state
	same( cl.h2.active, true, 'the feature state' );
	check( svc_hexen2_updateclass === 66 && svc_hexen2_setangle_interpolate === 64 && svc_hexen2_temp_entity === 70, 'the documented ids' );
	check( svc_hexen2_features === 50 && svc_hexen2_update_inv === 53, 'the documented ids' );

} );
