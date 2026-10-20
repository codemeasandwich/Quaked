// Native Hexen II hubs on the shared host: changelevel2 saves a level and restores it with ClientReEnter, a save slot
// holds the whole visited hub atomically through the existing Quake save key, and the intermission/music tables select
// the native pictures, strings and music name. Uses the supplied Hexen II data; skips cleanly when it is absent.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { Cbuf_Init, Cmd_Init, Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { skill } from '../src/engine/server/host.js';
import { sv_gravity } from '../src/engine/server/sv_phys.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { SZ_Alloc } from '../src/engine/common/common.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { pr_global_struct, EDICT_TO_PROG, PR_GetString, EDICT_NUM } from '../src/engine/progs/progs.js';
import { ED_NewString, GetEdictFieldValue } from '../src/engine/progs/pr_edict.js';
import { Hexen2_ED_Alloc_Temp } from '../src/engine/progs/hexen2_temp_edicts.js';
import { cls, ca_dedicated } from '../src/engine/client/client.js';
import { Host_InitCommands, Host_Hexen2ChangeLevel2, Host_Hexen2SaveGame, Host_Hexen2ReadSlot,
	Host_Hexen2LoadGame, Host_Hexen2SaveSummary, Host_Hexen2Hub, Host_Hexen2HubReset } from '../src/engine/server/host_cmd.js';
import { Hexen2Hub_LastClientRestore } from '../src/engine/server/hexen2_hub.js';
import { Hexen2_ApplyIntermission, Hexen2_IntermissionActive, Hexen2_IntermissionInfo, Hexen2_IntermissionText,
	Hexen2_IntermissionTextLines, INTERMISSION_PRINT_DELAY, INTERMISSION_NOT_CONNECTED } from '../src/engine/client/hexen2_intermission.js';
import { Hexen2_MusicCandidates, Hexen2_MusicFile, Hexen2_MusicStem, Hexen2_MusicURL, Hexen2_PlayMusicName,
	Hexen2_ResolveMusicURL, Hexen2_SetMusicSource } from '../src/engine/client/hexen2_music.js';
import { Hexen2_WriteNativeServiceByte } from '../src/engine/server/hexen2_native_wire.js';
import { svc_hexen2_intermission } from '../src/engine/common/protocol.js';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function localStorageShim() {

	const values = new Map();
	const storage = {
		get length() { return values.size; },
		key: index => [ ...values.keys() ][ index ] ?? null,
		getItem: key => values.get( key ) ?? null,
		setItem: ( key, value ) => { values.set( String( key ), String( value ) ); },
		removeItem: key => { values.delete( key ); },
	};
	globalThis.localStorage = storage;
	return storage;

}

function loadHexenData() {

	if ( !existsSync( HEXEN + '/pak1.pak' ) ) return false;
	GameProfile_Set( 'hexen2' );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( HEXEN + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'hub-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	// The base data1 keeps progs.dat and strings.txt loose beside the paks.
	const loose = [];
	for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc' ] )
		if ( existsSync( HEXEN + '/' + name ) ) loose.push( { name, data: new Uint8Array( readFileSync( HEXEN + '/' + name ) ) } );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'hub-loose', pak.COM_BuildPack( loose ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' );
	check( palette !== null, 'the Hexen II palette is present' );
	VID_SetPalette( palette.data.buffer.slice( palette.data.byteOffset, palette.data.byteOffset + palette.data.byteLength ) );
	Mod_Init();
	PR_InitBuiltins();
	Cbuf_Init();
	Cmd_Init();
	Host_InitCommands();
	for ( const value of [ r_hdr, skill, sv_gravity ] ) if ( !vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
	vars.Cvar_SetValue( 'r_hdr', 0 );
	vars.Cvar_SetValue( 'skill', 1 );
	vars.Cvar_SetValue( '_cl_playerclass', 1 );
	return true;

}

function spawn( map ) {

	svs.maxclients = svs.maxclientslimit = 1;
	svs.clients = [ new client_t() ];
	SZ_Alloc( svs.clients[ 0 ].message, 32768 );
	sv.active = false;
	cls.state = ca_dedicated;
	SV_SpawnServer( map );
	check( sv.active && sv.name === map, 'the real server starts ' + map );
	const client = svs.clients[ 0 ], player = client.edict;
	client.active = true;
	client.spawned = true;
	client.name = 'hub-traveller';
	client.colors = 3;
	client.playerclass = 1;
	pr_global_struct.self = EDICT_TO_PROG( player );
	PR_ExecuteProgram( pr_global_struct.ClientConnect );
	// PutClientInServer otherwise picks the native random class for an unset playerclass.
	player.v.playerclass = 1;
	const newclass = GetEdictFieldValue( player, 'newclass' );
	if ( newclass !== null ) newclass.accessor.setFloat( newclass.ofs, 1 );
	PR_ExecuteProgram( pr_global_struct.PutClientInServer );
	return { client, player };

}

function findEnt( classname ) {

	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const ent = EDICT_NUM( i );
		if ( ent && !ent.free && PR_GetString( ent.v.classname ) === classname ) return ent;

	}
	return null;

}

function field( ent, name ) {

	const found = GetEdictFieldValue( ent, name );
	check( found !== null, name + ' exists' );
	return found;

}

Deno.test( 'changelevel2 demo1 -> demo2 -> demo1 restores the level, clients and ClientReEnter', () => {

	if ( !loadHexenData() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	localStorageShim();

	const first = spawn( 'demo1' );
	check( sv.midi_name === 'casa1', 'the demo1 worldspawn MIDI key reaches sv.midi_name: ' + sv.midi_name );
	first.player.v.health = 42;
	const monster = [ ...Array( sv.num_edicts ).keys() ].map( i => EDICT_NUM( i ) )
		.find( ent => ent && !ent.free && ( ent.v.flags & 32 ) !== 0 && ent.v.health > 0 );
	check( monster !== undefined, 'demo1 has a live monster' );
	monster.v.health = 0;
	monster.v.deadflag = 2;
	const monsterNum = monster.index;
	const door = findEnt( 'door' );
	check( door !== null, 'demo1 has a door' );
	field( door, 'state' ).accessor.setFloat( field( door, 'state' ).ofs, 7 );
	door.v.health = 333;
	const doorNum = door.index;
	const ring = field( first.player, 'torchtime' );
	ring.accessor.setFloat( ring.ofs, sv.time + 10 );
	const savedRing = ring.accessor.getFloat( ring.ofs );

	// A reserved temporary edict is deliberately not archived.
	const temp = Hexen2_ED_Alloc_Temp();
	const tempNum = temp.index;
	temp.v.classname = ED_NewString( 'temp_marker' );
	temp.v.health = 123;

	Cbuf_AddText( 'changelevel2 demo2\n' );
	Cbuf_Execute();
	check( sv.name === 'demo2', 'the command reaches demo2' );
	sv.time += 5;

	Cbuf_AddText( 'changelevel2 demo1\n' );
	Cbuf_Execute();
	check( sv.name === 'demo1', 'the command returns to demo1' );
	const restore = Hexen2Hub_LastClientRestore();
	check( restore !== null && restore.restored === 1, 'RestoreClients re-entered one client' );

	same( first.client.edict.v.health, 42, 'the player health is restored' );
	same( EDICT_NUM( monsterNum ).v.health, 0, 'the killed monster stays dead' );
	same( field( EDICT_NUM( doorNum ), 'state' ).accessor.getFloat( field( EDICT_NUM( doorNum ), 'state' ).ofs ), 7, 'the opened door keeps its state' );
	const restoredRingField = field( first.client.edict, 'torchtime' );
	const restoredRing = restoredRingField.accessor.getFloat( restoredRingField.ofs );
	same( restoredRing, savedRing + restore.timeDiff, 'ClientReEnter shifted the level timer by timeDiff' );
	check( restoredRing !== savedRing, 'the timeDiff was non-zero' );
	const tempAfter = EDICT_NUM( tempNum );
	check( PR_GetString( tempAfter.v.classname ) !== 'temp_marker' && tempAfter.v.health !== 123, 'a reserved temporary edict is not archived' );

} );

Deno.test( 'one save slot holds every visited level and loads the whole hub atomically', () => {

	if ( !loadHexenData() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const storage = localStorageShim();
	const base = spawn( 'demo1' );
	base.player.v.health = 55;
	check( Host_Hexen2ChangeLevel2( 'demo2' ).ok, 'travel to demo2' );
	const demo2Player = svs.clients[ 0 ].edict;
	demo2Player.v.health = 66;
	const demon = findEnt( 'demon' ) ?? [ ...Array( sv.num_edicts ).keys() ].map( i => EDICT_NUM( i ) )
		.find( ent => ent && !ent.free && ( ent.v.flags & 32 ) !== 0 && ent.v.health > 0 );
	check( demon !== undefined, 'demo2 has a live monster' );
	demon.v.health = 12;
	const demonNum = demon.index;
	svs.clients[ 0 ].spawn_parms[ 3 ] = 0.25;

	const saved = Host_Hexen2SaveGame( 'hubroundtrip' );
	check( saved.ok, saved.reason );
	same( saved.levels, 2, 'both visited levels are in the slot' );
	const slot = Host_Hexen2ReadSlot( 'hubroundtrip' );
	check( slot !== null, 'the slot reads back' );
	check( slot.text.startsWith( 'HEXEN2HUB 1\n' ), 'the slot has the hub header' );
	check( Object.hasOwn( slot.hub.levels, 'demo1' ) && Object.hasOwn( slot.hub.levels, 'demo2' ), 'the visited-level table' );
	same( slot.hub.session.skill, 1, 'the slot records the skill' );
	same( slot.hub.session.playerclass, 1, 'the slot records the class' );
	same( slot.hub.clients.slots[ 0 ].spawn_parms[ 3 ], 0.25, 'the slot records the spawn parms' );
	check( storage.length > 0, 'the shared storage boundary is used' );
	const keys = [ ...Array( storage.length ).keys() ].map( i => storage.key( i ) );
	check( keys.every( key => key.startsWith( 'quake_save_' ) ), 'the hub uses the existing save keys: ' + keys.join( ', ' ) );
	const summary = Host_Hexen2SaveSummary( 'hubroundtrip' );
	check( summary !== null && summary.levels === 2 && summary.level === 'demo2', 'the menu summary names the hub' );

	// Mutate the live world, then load the saved hub back.
	demo2Player.v.health = 4;
	EDICT_NUM( demonNum ).v.health = 99;
	check( Host_Hexen2ChangeLevel2( 'demo1' ).ok, 'return to demo1' );
	cls.state = ca_dedicated; // no loopback connection in the test
	Host_Hexen2HubReset(); // the slot alone must restore the whole hub
	const loaded = Host_Hexen2LoadGame( 'hubroundtrip' );
	check( loaded.ok, loaded.reason );
	same( sv.name, 'demo2', 'the slot current level loads' );
	same( svs.clients[ 0 ].edict.v.health, 66, 'the saved player state loads' );
	same( EDICT_NUM( demonNum ).v.health, 12, 'the saved monster state loads' );
	same( loaded.levels, 2, 'the loaded hub keeps every visited level' );
	same( Host_Hexen2Hub().levels.demo1.level, 'demo1', 'the other visited level is restored too' );

	// The F6/F9 path: the console save/load commands use the same hub slot.
	Cbuf_AddText( 'save commandquick\n' );
	Cbuf_Execute();
	check( Host_Hexen2ReadSlot( 'commandquick' ) !== null, 'the save command writes a hub slot' );
	svs.clients[ 0 ].edict.v.health = 3;
	svs.clients[ 0 ].message.cursize = 0; // the frame loop would have sent this before another map
	Cbuf_AddText( 'load commandquick\n' );
	Cbuf_Execute();
	same( sv.name, 'demo2', 'the load command restores the saved hub' );
	same( svs.clients[ 0 ].edict.v.health, 66, 'the load command restores the saved player' );

} );

Deno.test( 'the native intermission table selects the picture, strings.txt line and finale sequence', () => {

	const one = Hexen2_IntermissionInfo( 1 );
	same( one.picture, 'gfx/meso.lmp', 'episode 1 picture' );
	same( one.messageIndex, 395, 'episode 1 strings index' );
	same( Hexen2_IntermissionInfo( 2 ).picture, 'gfx/egypt.lmp', 'episode 2 picture' );
	same( Hexen2_IntermissionInfo( 4 ).messageIndex, 398, 'episode 4 message' );
	same( Hexen2_IntermissionInfo( 5 ).messageIndex, 408, 'demo finale message' );
	same( Hexen2_IntermissionInfo( 6 ).picture, 'gfx/end-1.lmp', 'finale part 1' );
	check( ( Hexen2_IntermissionInfo( 6 ).flags & INTERMISSION_PRINT_DELAY ) !== 0, 'finale part 1 delays its print' );
	same( Hexen2_IntermissionInfo( 6 ).next, 7, 'finale advances 6 -> 7' );
	same( Hexen2_IntermissionInfo( 8 ).picture, 'gfx/end-3.lmp', 'finale part 3' );
	same( Hexen2_IntermissionInfo( 10 ).picture, 'gfx/mpend.lmp', 'Portal finale' );
	same( Hexen2_IntermissionInfo( 11 ).messageIndex, 545, 'Portal Tibet intermission' );
	const opening = Hexen2_IntermissionInfo( 12 );
	check( ( opening.flags & INTERMISSION_NOT_CONNECTED ) !== 0, 'the opening uses realtime' );
	same( Hexen2_IntermissionInfo( 1, { oem: true } ).intermission, 9, 'the OEM rule maps screen 1 to 9' );
	same( Hexen2_IntermissionInfo( 99 ), null, 'an unknown index is refused' );

	const text = Hexen2_IntermissionText( 1, { getString: index => index === 395 ? 'As the mystical energies released by the destruction of Famine swirl the air' : null } );
	check( text.startsWith( 'As the mystical' ), 'the intermission text is the 0-based strings.txt line' );
	const lines = Hexen2_IntermissionTextLines( 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen', 20 );
	check( lines.length > 1 && lines.every( line => line.length <= 20 ), 'text wraps at the native 38 (here 20) columns: ' + JSON.stringify( lines ) );

	const client = { time: 12.5, h2: {} };
	Hexen2_ApplyIntermission( client, 1, 12.5 );
	same( client.intermission, 1, 'the shared intermission flag' );
	same( client.h2.intermission, 1, 'the native index' );
	same( client.h2.intermissionPic, 'gfx/meso.lmp', 'the picture is latched' );
	check( Hexen2_IntermissionActive( client ), 'the overlay owns the screen' );
	Hexen2_ApplyIntermission( client, 6, 20 );
	same( client.h2.intermissionNext, 7, 'the finale chain is applied' );

} );

Deno.test( 'music selection prefers the OGG conversion and reports MIDI-only tracks', async () => {

	same( Hexen2_MusicStem( 'casa1' ), 'casa1', 'a bare worldspawn name' );
	same( Hexen2_MusicStem( 'midi/casa1.mid' ), 'casa1', 'a native MIDI path' );
	same( Hexen2_MusicStem( 'music/CASA1.OGG' ), 'casa1', 'an explicit conversion path' );
	same( Hexen2_MusicCandidates( 'casa1' )[ 0 ], 'music/casa1.ogg', 'the OGG conversion is preferred' );
	const present = new Map( [ [ 'music/casa1.ogg', { data: new Uint8Array( [ 79, 103, 103, 83 ] ), size: 4 } ] ] );
	const file = Hexen2_MusicFile( 'casa1', path => present.get( path ) ?? null );
	same( file.path, 'music/casa1.ogg', 'the conversion is selected' );
	const url = Hexen2_MusicURL( 'midi/casa1.mid', { find: path => present.get( path ) ?? null, makeURL: () => 'blob:hub-test' } );
	check( url.ok && url.path === 'music/casa1.ogg' && url.url === 'blob:hub-test', 'the OGG URL is used' );
	const midi = Hexen2_MusicFile( 'casa2', path => path === 'midi/casa2.mid' ? { data: new Uint8Array( 1 ), size: 1 } : null );
	same( midi.path, 'midi/casa2.mid', 'the native MIDI file is found' );
	const midiURL = Hexen2_MusicURL( 'casa2', { find: path => path === 'midi/casa2.mid' ? { data: new Uint8Array( 1 ) } : null } );
	check( !midiURL.ok && midiURL.reason === 'midi-no-synth', 'MIDI-only is reported, not silently muted' );
	const missing = Hexen2_MusicURL( 'casa3', { find: () => null } );
	check( !missing.ok && missing.reason === 'no file' && missing.candidates.includes( 'music/casa3.ogg' ), 'a missing track lists its candidates' );
	const calls = [];
	const played = Hexen2_PlayMusicName( 'casa1', { find: path => present.get( path ) ?? null, makeURL: () => 'blob:hub-test',
		play: ( track, looping ) => calls.push( [ track, looping ] ), provider: () => {} } );
	check( played.ok && played.track >= 1, 'the track is selected: ' + JSON.stringify( played ) );
	same( calls.length, 1, 'the shared music bus is asked to play' );
	same( calls[ 0 ][ 1 ], true, 'level music loops' );

	Hexen2_SetMusicSource( async path => path === 'music/casa2.ogg' ? 'blob:hub-stream' : null );
	try {

		const streamed = await Hexen2_ResolveMusicURL( 'casa2', { find: path => path === 'midi/casa2.mid' ? { data: new Uint8Array( 1 ) } : null } );
		check( streamed.ok && streamed.external === true && streamed.path === 'music/casa2.ogg' && streamed.url === 'blob:hub-stream',
			'a registered platform source supplies the OGG beside the MIDI-only pak' );
		const loose = await Hexen2_ResolveMusicURL( 'casa4', { find: () => null } );
		check( !loose.ok, 'a source with no such file leaves the missing-track report' );

	} finally {

		Hexen2_SetMusicSource( null );

	}

} );

Deno.test( 'the native svc_intermission write becomes the unified message', () => {

	if ( !loadHexenData() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	spawn( 'demo1' );
	pr_global_struct.intermission_running = 1;
	sv.reliable_datagram.cursize = 0;
	check( Hexen2_WriteNativeServiceByte( sv.reliable_datagram, 30 ), 'the native opcode is held for its index' );
	check( Hexen2_WriteNativeServiceByte( sv.reliable_datagram, 6 ), 'the index is rewritten as the unified message' );
	same( sv.reliable_datagram.data[ 0 ], svc_hexen2_intermission, 'the unified intermission id' );
	same( sv.reliable_datagram.data[ 1 ], 6, 'the native index body' );
	same( sv.reliable_datagram.cursize, 2, 'one message, not the native bodyless form' );
	pr_global_struct.intermission_running = 0;

} );
