// Hexen II audio: the gamecode's sound and ambient calls become client sound events with the native values, the local
// bridge hands them to the existing mixer with the correct conversions, and the sample the level names is a real WAV
// in the supplied data. plan section 7; G1 presentation prerequisite.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs, PR_SetTempString } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { Hexen2_DrainSoundEvents } from '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_PlayPendingSounds, Hexen2_SoundGain } from '../src/engine/client/hexen2_audio.js';
import { GetWavinfo } from '../src/engine/sound/snd_mem.js';
import { pr_globals } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4 } from '../src/engine/progs/pr_comp.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
// the selected catalogue game is the session's profile before any progs or map load
GameProfile_Set( 'hexen2' );

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const setF = ( o, v ) => pr_globals.setFloat( o, v ), setI = ( o, v ) => pr_globals.setInt32( o, v );

Deno.test( 'gamecode sounds reach the mixer with the native conversions', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );

	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'audio', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	check( Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } ).ok, 'the Paladin spawned' );

	// precache a real supplied sample through the gamecode's own builtin, then play it on the player
	const sample = 'sound/misc/bellring.wav';
	sv.state = ss_loading; // precache is a spawn-time operation, as native
	setI( OFS_PARM0, PR_SetTempString( sample ) );
	check( Hexen2_CallBuiltin( 19, { random: () => 0.5 } ) === true, 'precache_sound' );
	sv.state = ss_active;
	Hexen2_DrainSoundEvents(); // discard anything from the level spawn
	player.v.origin = [ 10, 20, 30 ];
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, PR_SetTempString( sample ) );
	setF( OFS_PARM3, 0.5 ); setF( OFS_PARM4, 2 );
	check( Hexen2_CallBuiltin( 8, { random: () => 0.5 } ) === true, 'sound' );
	let events = Hexen2_DrainSoundEvents();
	same( events.length, 1, 'one sound event queued' );
	same( events[ 0 ].kind, 'sound', 'kind' );
	same( events[ 0 ].entity, 1, 'entity number' );
	same( events[ 0 ].channel, 0, 'channel' );
	same( events[ 0 ].sample, sample, 'sample' );
	same( events[ 0 ].volume, 0.5, 'the native 0..1 volume is kept' );
	same( events[ 0 ].attenuation, 2, 'attenuation' );
	same( events[ 0 ].origin.join( ',' ), '10,20,30', 'the entity origin at call time' );

	// ambient sound: an explicit position, queued as an ambient event
	setF( OFS_PARM0, 1 ); setF( OFS_PARM0 + 1, 2 ); setF( OFS_PARM0 + 2, 3 );
	setI( OFS_PARM1, PR_SetTempString( sample ) ); setF( OFS_PARM2, 0.25 ); setF( OFS_PARM3, 1 );
	check( Hexen2_CallBuiltin( 74, { random: () => 0.5 } ) === true, 'ambientsound' );
	events = Hexen2_DrainSoundEvents();
	same( events.length, 1, 'one ambient event queued' );
	same( events[ 0 ].kind, 'ambient', 'ambient kind' );
	same( events[ 0 ].origin.join( ',' ), '1,2,3', 'the ambient position' );

	// the bridge maps events to the existing mixer and skips an unprecached sample
	const calls = [];
	const played = Hexen2_PlayPendingSounds( {
		drain: Hexen2_DrainSoundEvents,
		precache: name => name === sample ? { name } : null,
		startSound: ( entity, channel, sfx, origin, volume, attenuation ) => calls.push( { entity, channel, sfx, origin, volume, attenuation } )
	} );
	same( played.played, 0, 'the drained events are gone after the direct drains' );
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, PR_SetTempString( sample ) ); setF( OFS_PARM3, 1 ); setF( OFS_PARM4, 1 );
	Hexen2_CallBuiltin( 8, { random: () => 0.5 } );
	const mixed = Hexen2_PlayPendingSounds( { drain: Hexen2_DrainSoundEvents, precache: name => name === sample ? { name } : null,
		startSound: ( entity, channel, sfx, origin, volume, attenuation ) => calls.push( { entity, channel, sfx, origin, volume, attenuation } ) } );
	same( mixed.played, 1, 'the event reached the mixer' );
	same( calls[ 0 ].entity, 1, 'the mixer entity number' );
	same( calls[ 0 ].sfx.name, sample, 'the sample name' );
	same( calls[ 0 ].volume, 1, 'full volume' );
	same( Hexen2_SoundGain( 2 ), 1, 'gain clamps above 1' );
	same( Hexen2_SoundGain( - 1 ), 0, 'gain clamps below 0' );
	same( Hexen2_PlayPendingSounds( { drain: () => [ { sample: 'sound/missing.wav' } ], precache: () => null, startSound: () => { throw Error( 'must not start' ); } } ).skipped, 1, 'an unprecached sample is skipped' );

	// the sample named by the level is a real WAV in the supplied data
	const wav = pak.COM_FindFile( 'sound/misc/bellring.wav' ).data;
	const info = GetWavinfo( 'bellring.wav', wav, wav.length );
	check( info !== null && info.rate > 0 && info.samples > 0, 'the supplied sample parses: ' + JSON.stringify( info ) );

} );
