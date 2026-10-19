// G1 native audio playback: a gamecode sound on the spawned Paladin is precached, handed to the existing mixer and
// actually scheduled on the Web Audio graph (a fake AudioContext records the source start). This closes the gap
// between the event bridge and audible output without a real device.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs, PR_SetTempString, pr_globals } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { Hexen2_DrainSoundEvents } from '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_PlayPendingSounds } from '../src/engine/client/hexen2_audio.js';
import { S_Init, S_Shutdown, S_PrecacheSound, S_StartSound, S_UnlockAudio } from '../src/engine/sound/snd_dma.js';
import { channels } from '../src/engine/sound/sound.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4 } from '../src/engine/progs/pr_comp.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const setF = ( o, v ) => pr_globals.setFloat( o, v ), setI = ( o, v ) => pr_globals.setInt32( o, v );

function fakeAudio() {

	const node = () => ( { gain: { value: 1 }, pan: { value: 0 }, connect() {}, disconnect() {},
		start() { this.started = true; }, stop() { this.stopped = true; } } );
	class Context {

		constructor() { this.destination = {}; this.sampleRate = 44100; this.state = 'running'; this.sources = []; }
		createGain() { return node(); }
		createStereoPanner() { return node(); }
		createBuffer( channels, length, rate ) { return { length, rate, getChannelData: () => new Float32Array( length ) }; }
		createBufferSource() { const s = node(); this.sources.push( s ); return s; }
		resume() { return Promise.resolve(); }
		close() { return Promise.resolve(); }

	}
	return new Context();

}

Deno.test( 'a gamecode sound plays through the real mixer on the Paladin', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	Mod_SetHexenHullLayout( true );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );
	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'playback', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	const sample = 'sound/misc/bellring.wav';
	Hexen2_DrainSoundEvents();
	sv.state = ss_loading;
	setI( OFS_PARM0, PR_SetTempString( sample ) );
	check( Hexen2_CallBuiltin( 19, { random: () => 0.5 } ) === true, 'precache_sound' );
	sv.state = ss_active;
	player.v.origin = [ 10, 20, 30 ];
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, PR_SetTempString( sample ) ); setF( OFS_PARM3, 1 ); setF( OFS_PARM4, 1 );
	check( Hexen2_CallBuiltin( 8, { random: () => 0.5 } ) === true, 'sound' );

	const context = fakeAudio();
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: class { constructor() { return context; } } } } );
	let played, skipped;
	try {

		S_Init();
		played = Hexen2_PlayPendingSounds( {
			drain: Hexen2_DrainSoundEvents,
			precache: name => S_PrecacheSound( name.replace( /^sound\//, '' ) ),
			startSound: ( entnum, channel, sfx, origin, volume, attenuation ) => S_StartSound( entnum, channel, sfx, origin, volume, attenuation )
		} );
		skipped = channels.filter( c => c.sfx && c.sfx.name === 'misc/bellring.wav' );
		check( played.played >= 1, 'the event reached the mixer: ' + JSON.stringify( played ) );
		check( skipped.length >= 1, 'a mixer channel holds the sample' );
		const channel = skipped[ 0 ];
		same( channel.entnum, 1, 'the mixer channel belongs to the player entity' );
		same( channel.entchannel, 0, 'the mixer channel number' );
		same( channel.master_vol, 255, 'full native volume' );
		check( context.sources.some( source => source.started ), 'the Web Audio graph started a source (audible scheduling)' );

	} finally {

		S_Shutdown();
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

} );

// Autoplay/gesture recovery: a browser context can start suspended. Playback is held (no source starts) until the next
// user gesture resumes the context through S_UnlockAudio; a subsequent sound then schedules normally.
Deno.test( 'a suspended audio context holds playback until the next gesture unlocks it', async () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	Mod_Init();
	const context = fakeAudio();
	context.state = 'suspended';
	context.resume = function () { this.resumeCalls = ( this.resumeCalls ?? 0 ) + 1; this.state = 'running'; return Promise.resolve(); };
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: class { constructor() { return context; } } } } );
	try {

		S_Init();
		same( context.state, 'suspended', 'the context starts suspended, as after an autoplay refusal' );
		const sample = S_PrecacheSound( 'misc/bellring.wav' );
		check( sample !== null, 'the supplied sample is known to the mixer' );
		S_StartSound( 1, 0, sample, [ 10, 20, 30 ], 1, 1 );
		check( ! context.sources.some( source => source.started ), 'no source starts while suspended' );
		check( channels.some( channel => channel.sfx === sample ), 'the mixer still holds the request' );
		S_UnlockAudio();
		same( context.resumeCalls, 1, 'the gesture resumed the context once' );
		same( context.state, 'running', 'the context is running after the gesture' );
		S_StartSound( 1, 0, sample, [ 10, 20, 30 ], 1, 1 );
		check( context.sources.some( source => source.started ), 'the retried sound schedules after the unlock' );

	} finally {

		S_Shutdown();
		if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window;

	}

} );
