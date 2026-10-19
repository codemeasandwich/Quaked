// End-to-end acceptance trace for the Hexen II work delivered so far: edition detection from the supplied install,
// an Installed-rules Paladin session, the eight-hull level, its entities and player, live physics, the client view,
// the renderer's world frame, the audio bridge and the HUD/status values — each with an executed assertion. This is
// an acceptance *trace*, not a claim that the G1 playable slice is complete: drawing and client networking are not
// exercised. Run it with: node tools/run_tests.mjs tests/hexen2_acceptance_test.js
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel, Mod_FindName } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel, Mod_SetHexenHullLayout } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetState, SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { PR_SetSV, PR_SetSVS, PR_GetString, pr_global_struct, svs, PR_SetTempString } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_CreateSession, Hexen2_SelectClass } from '../src/engine/common/hexen2_profile.js';
import { Hexen2_ReadProgHeader, Hexen2_DetectEdition } from '../src/engine/common/hexen2_filesystem.js';
import { Hexen2_SeedPrecache, Hexen2_SpawnEntities, Hexen2_SpawnPlayer } from '../src/engine/progs/hexen2_boot.js';
import { Hexen2_ApplyPlayerView } from '../src/engine/client/hexen2_client.js';
import { V_CalcRefdef } from '../src/engine/client/view.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { GL_BuildLightmaps, R_DrawWorld } from '../src/engine/render/gl_rsurf.js';
import { R_MarkLeaves } from '../src/engine/render/gl_rsurf_batches.js';
import { r_visframecount, set_r_viewleaf, set_r_oldviewleaf, set_r_worldentity } from '../src/engine/render/gl_rmain.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBindings, Hexen2_LoadStatusAssets, HEXEN2_STATUS_ASSETS } from '../src/engine/client/hexen2_status.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import { Hexen2_DrainSoundEvents } from '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_PlayPendingSounds } from '../src/engine/client/hexen2_audio.js';
import { GetWavinfo } from '../src/engine/sound/snd_mem.js';
import { pr_globals } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4 } from '../src/engine/progs/pr_comp.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2', PORTALS = '/Users/bri/quaked/Hexen 2/portals';
const setF = ( o, v ) => pr_globals.setFloat( o, v ), setI = ( o, v ) => pr_globals.setInt32( o, v );

Deno.test( 'Hexen II acceptance trace: install → session → level → player → world → client → render → audio → HUD', () => {

	if ( ! existsSync( BASE + '/pak1.pak' ) || ! existsSync( PORTALS + '/progs.dat' ) ) {

		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;

	}
	const trace = {};

	// 1. edition detection from the supplied installation (base and Portal)
	const baseFiles = [ 'progs.dat', 'strings.txt', 'hexen.rc' ];
	const baseHeader = Hexen2_ReadProgHeader( readFileSync( BASE + '/progs.dat' ) );
	const portalHeader = Hexen2_ReadProgHeader( readFileSync( PORTALS + '/progs.dat' ) );
	const base = Hexen2_DetectEdition( { base: { files: baseFiles, progsHeader: baseHeader } } );
	check( base.ok, base.reason );
	same( base.edition, 'base', 'edition detection' );
	const portals = Hexen2_DetectEdition( { base: { files: baseFiles, progsHeader: baseHeader },
		expansion: { files: [ 'progs.dat', 'puzzles.txt' ], progsHeader: portalHeader } } );
	check( portals.ok, portals.reason );
	same( portals.edition, 'portals', 'Portal detection' );
	trace.editions = [ base.edition, portals.edition ];

	// 2. an Installed-rules Paladin session, with the edition's class restrictions
	const created = Hexen2_CreateSession( { gameId: 'hexen2', contentRoot: 'owned-hexen2-base', gamecodeMode: 'installed', rules: 'classic' } );
	check( created.ok, created.reason );
	const klass = Hexen2_SelectClass( 'hexen2', 'paladin' );
	check( klass.ok, klass.reason );
	check( Hexen2_SelectClass( 'hexen2', 'succubus' ).ok === false, 'the base edition refuses the Succubus' );
	trace.session = created.session;
	trace.classNumber = klass.number;

	// 3. the eight-hull level and the supplied gamecode
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const progsBytes = readFileSync( BASE + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );
	Mod_SetHexenHullLayout( true );
	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );
	Mod_SetHexenHullLayout( false );
	same( map.numsubmodels, 100, 'the level has 100 eight-hull submodels' );
	trace.submodels = map.numsubmodels;

	// 4. boot: native precache layout, the level's entities and the client's Paladin
	const sv = serverSv;
	PR_SetSV( sv ); PR_SetSVS( { maxclients: 1, clients: [ { active: false } ], active: true } );
	sv.time = 0.1; sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE; sv.worldmodel = map;
	Hexen2_SeedPrecache( sv, map, name => Mod_FindName( name ) );
	sv.state = ss_loading;
	SV_SetState( sv, svs, pr_global_struct );
	SV_ClearWorld();
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );
	Hexen2_SpawnEntities( sv, map, 392, PR_AllocEdicts );
	check( sv.num_edicts > 300, 'the level spawned its entities: ' + sv.num_edicts );
	trace.edicts = sv.num_edicts;
	const start = sv.edicts.find( ent => ent && ! ent.free && PR_GetString( ent.v.classname ) === 'info_player_start' );
	const player = sv.edicts[ 1 ];
	const client = { name: 'acceptance', active: true, spawned: true, edict: player, spawn_parms: new Array( 16 ).fill( 0 ), message: sv.signon, cmd: { viewangles: [ 0, 0, 0 ] } };
	svs.clients[ 0 ] = client;
	const placed = Hexen2_SpawnPlayer( { sv, client, player, gameId: 'hexen2', classId: 'paladin', origin: start.v.origin } );
	check( placed.ok, placed.reason );
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	same( player.v.health, 100, 'starting health' );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'the feet are on the floor' );
	trace.player = { class: player.v.playerclass, model: PR_GetString( player.v.model ), health: player.v.health };

	// 5. live world physics with moving monsters
	sv.active = true; sv.state = ss_active;
	SV_SetFrametime( 0.1 );
	const before = sv.edicts.map( ent => ent && ! ent.free ? ent.v.origin?.[ 0 ] ?? 0 : 0 );
	let error = null;
	try { for ( let frame = 0; frame < 5; frame ++ ) { SV_Physics(); pr_global_struct.time = sv.time; } } catch ( e ) { error = e; }
	check( error === null, 'five physics frames ran: ' + ( error ? error.message : '' ) );
	let moved = 0;
	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const ent = sv.edicts[ i ];
		if ( ent && ! ent.free && Math.abs( ( ent.v.origin?.[ 0 ] ?? 0 ) - before[ i ] ) > 0.1 ) moved ++;

	}
	check( moved > 0, 'world entities moved during the frames: ' + moved );
	trace.physics = { frames: 5, movedEntities: moved };

	// 6. the client view: the gamecode eye height and look direction through V_CalcRefdef
	cl.worldmodel = map; cl.model_precache = [ map, map ];
	cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ]; cl.paused = false; cl.intermission = false;
	const view = Hexen2_ApplyPlayerView( { cl, clEntities: cl_entities, viewangles: [ 0, 90, 0 ] }, player );
	check( view.ok, view.reason );
	V_CalcRefdef();
	check( Math.abs( r_refdef.vieworg[ 2 ] - ( player.v.origin[ 2 ] + player.v.view_ofs[ 2 ] ) ) < 2, 'the client eye height' );
	same( Math.round( r_refdef.viewangles[ 1 ] ), 90, 'the client yaw' );
	trace.view = { eyeHeight: Math.round( player.v.view_ofs[ 2 ] ), yaw: Math.round( r_refdef.viewangles[ 1 ] ) };

	// 7. the renderer's world frame from that client view
	set_r_worldentity( new entity_t() );
	GL_BuildLightmaps();
	const leaf = Mod_PointInLeaf( new Float32Array( r_refdef.vieworg ), map );
	set_r_viewleaf( leaf ); set_r_oldviewleaf( null );
	R_MarkLeaves();
	error = null;
	try { R_DrawWorld(); } catch ( e ) { error = e; }
	check( error === null, 'the world frame prepared: ' + ( error ? error.message : '' ) );
	let marked = 0;
	for ( const surface of map.surfaces ) if ( surface.visframe === r_visframecount ) marked ++;
	check( marked > 0, 'the frame marks visible surfaces: ' + marked );
	trace.render = { surfaces: map.surfaces.length, visibleSurfaces: marked };

	// 8. audio: a supplied sample through the gamecode and the mixer bridge
	const sample = 'sound/misc/bellring.wav';
	Hexen2_DrainSoundEvents();
	sv.state = ss_loading;
	setI( OFS_PARM0, PR_SetTempString( sample ) );
	Hexen2_CallBuiltin( 19, { random: () => 0.5 } );
	sv.state = ss_active;
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, PR_SetTempString( sample ) ); setF( OFS_PARM3, 1 ); setF( OFS_PARM4, 1 );
	check( Hexen2_CallBuiltin( 8, { random: () => 0.5 } ) === true, 'the gamecode sound call' );
	const mixed = [];
	const audio = Hexen2_PlayPendingSounds( { drain: Hexen2_DrainSoundEvents,
		precache: name => name === sample ? { name } : null,
		startSound: ( ...args ) => mixed.push( args ) } );
	same( audio.played, 1, 'the sound reached the mixer' );
	same( mixed[ 0 ][ 2 ].name, sample, 'the mixer sample' );
	const wav = pak.COM_FindFile( sample ).data;
	const wavInfo = GetWavinfo( 'bellring.wav', wav, wav.length );
	check( wavInfo !== null && wavInfo.rate > 0, 'the supplied sample is a real WAV' );
	trace.audio = { played: audio.played, sample, rate: wavInfo.rate };

	// 9. HUD and status bar: the gamecode state and the supplied bar art
	const hud = Hexen2_ReadHud( player );
	const bindings = Hexen2_StatusBindings( hud );
	same( bindings.health, 100, 'HUD health' );
	const assets = Hexen2_LoadStatusAssets( name => {

		const found = pak.COM_FindFile( name );
		if ( ! found ) return null;
		const data = new DataView( found.data.buffer, found.data.byteOffset, found.size );
		return { width: data.getInt32( 0, true ), height: data.getInt32( 4, true ) };

	} );
	same( assets.missing.length, 0, 'the status-bar art loads' );
	same( assets.loaded.length, HEXEN2_STATUS_ASSETS.length, 'every status-bar picture' );
	trace.hud = { health: bindings.health, statusAssets: assets.loaded.length };

	console.log( 'ACCEPTANCE TRACE ' + JSON.stringify( trace ) );

} );
