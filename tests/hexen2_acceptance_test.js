// End-to-end acceptance trace through the product entry points: edition detection from the supplied installation, a
// playable catalogue entry planned into an Installed-rules Paladin session, the level mounted through the engine's own
// loaders, then live physics, the client view, the renderer's world frame, the mixer and the native HUD/status data —
// each stage asserted. This is an acceptance *trace*, not a claim that G1 is complete: the shelf click/packaged smoke,
// native entity message bodies/peer and canvas drawing are not exercised.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_PointInLeaf } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { SV_SetFrametime, SV_Physics } from '../src/engine/server/sv_phys.js';
import { PR_GetString, PR_SetTempString, pr_global_struct, svs } from '../src/engine/progs/progs.js';
import { sv as serverSv, ss_loading, ss_active, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_ReadProgHeader, Hexen2_DetectEdition } from '../src/engine/common/hexen2_filesystem.js';
import { Hexen2_PlanStart, Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_ApplyPlayerView } from '../src/engine/client/hexen2_client.js';
import { V_CalcRefdef } from '../src/engine/client/view.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { GL_BuildLightmaps, R_DrawWorld } from '../src/engine/render/gl_rsurf.js';
import { R_MarkLeaves } from '../src/engine/render/gl_rsurf_batches.js';
import { r_visframecount, set_r_viewleaf, set_r_oldviewleaf, set_r_worldentity } from '../src/engine/render/gl_rmain.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBindings, Hexen2_LoadStatusAssets, HEXEN2_STATUS_ASSETS } from '../src/engine/client/hexen2_status.js';
import { Hexen2_StatusBarOps } from '../src/engine/client/hexen2_statusbar.js';
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

Deno.test( 'acceptance trace: install → selection → mount → world → client → render → audio → HUD', () => {

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

	// 2. the public selection: a playable catalogue entry plus a Paladin becomes the session plan
	const entry = { id: 'hexen2', kind: 'hexen2', name: 'Hexen II', folder: 'games/Hexen 2/data1', present: true, validated: true, playable: true };
	const plan = Hexen2_PlanStart( entry, { classId: 'paladin' } );
	check( plan.ok, plan.reason );
	same( plan.session.gameId, 'hexen2', 'the session game id' );
	same( plan.session.gamecodeMode, 'installed', 'Installed gamecode' );
	same( plan.session.rules, 'classic', 'Classic rules' );
	same( plan.classNumber, 1, 'the Paladin number' );
	same( plan.startMap, 'maps/demo1.bsp', 'the start map' );
	trace.session = plan.session;

	// 3. mount: paks are host-mounted; the engine loaders take gamecode, palette, demo1 and the entities, then place
	// the player through the supplied gamecode.
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( BASE + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	Mod_Init();
	const client = { name: 'acceptance', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const state = { maxclients: 1, clients: [ client ], active: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client, sv, svs: state,
		readFile: name => existsSync( BASE + '/' + name ) ? new Uint8Array( readFileSync( BASE + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );
	const player = mounted.player, map = mounted.map;
	same( PR_GetString( player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	check( player.v.health >= 70 && player.v.health <= 95, 'native starting health: ' + player.v.health );
	check( player.v.max_mana > 0, 'native maximum mana: ' + player.v.max_mana );
	check( Math.abs( player.v.origin[ 2 ] ) < 1, 'the feet are on the floor' );
	trace.player = { class: player.v.playerclass, model: PR_GetString( player.v.model ), health: player.v.health, maxMana: player.v.max_mana };

	// 4. live world physics with moving entities
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

	// 5. the client view: the gamecode eye height and look direction through V_CalcRefdef
	cl.worldmodel = map; cl.model_precache = [ map, map ];
	cl.state = 2; cl.time = 0; cl.velocity = [ 0, 0, 0 ]; cl.paused = false; cl.intermission = false;
	const view = Hexen2_ApplyPlayerView( { cl, clEntities: cl_entities, viewangles: [ 0, 90, 0 ] }, player );
	check( view.ok, view.reason );
	V_CalcRefdef();
	check( Math.abs( r_refdef.vieworg[ 2 ] - ( player.v.origin[ 2 ] + player.v.view_ofs[ 2 ] ) ) < 2, 'the client eye height' );
	same( Math.round( r_refdef.viewangles[ 1 ] ), 90, 'the client yaw' );
	trace.view = { eyeHeight: Math.round( player.v.view_ofs[ 2 ] ), yaw: Math.round( r_refdef.viewangles[ 1 ] ) };

	// 6. the renderer's world frame from that client view
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

	// 7. audio: a supplied sample through the gamecode and the mixer bridge
	const sample = 'sound/misc/bellring.wav';
	Hexen2_DrainSoundEvents();
	sv.state = ss_loading;
	setI( OFS_PARM0, PR_SetTempString( sample ) );
	check( Hexen2_CallBuiltin( 19, { random: () => 0.5 } ) === true, 'the gamecode precaches the sample' );
	sv.state = ss_active;
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, PR_SetTempString( sample ) ); setF( OFS_PARM3, 1 ); setF( OFS_PARM4, 1 );
	check( Hexen2_CallBuiltin( 8, { random: () => 0.5 } ) === true, 'the gamecode plays the sample' );
	const mixed = [];
	const audio = Hexen2_PlayPendingSounds( { drain: Hexen2_DrainSoundEvents,
		precache: name => name === sample ? { name } : null,
		startSound: ( ...args ) => mixed.push( args ) } );
	same( audio.played, 1, 'the sound reached the mixer bridge' );
	same( mixed[ 0 ][ 2 ].name, sample, 'the mixer sample' );
	const wav = pak.COM_FindFile( sample ).data;
	const wavInfo = GetWavinfo( 'bellring.wav', wav, wav.length );
	check( wavInfo !== null && wavInfo.rate > 0, 'the supplied sample is a real WAV' );
	trace.audio = { sample, played: audio.played, rate: wavInfo.rate };

	// 8. HUD and status bar: the gamecode state and the native layout
	const hud = Hexen2_ReadHud( player );
	const bindings = Hexen2_StatusBindings( hud );
	same( bindings.health, player.v.health, 'HUD health' );
	const ops = Hexen2_StatusBarOps( hud );
	check( ops.length > 5, 'the native status bar is emitted' );
	const assets = Hexen2_LoadStatusAssets( name => {

		const found = pak.COM_FindFile( name );
		if ( ! found ) return null;
		const data = new DataView( found.data.buffer, found.data.byteOffset, found.size );
		return { width: data.getInt32( 0, true ), height: data.getInt32( 4, true ) };

	} );
	same( assets.missing.length, 0, 'the status-bar art loads' );
	same( assets.loaded.length, HEXEN2_STATUS_ASSETS.length, 'every status-bar picture' );
	trace.hud = { health: bindings.health, statusAssets: assets.loaded.length, ops: ops.length };

	console.log( 'ACCEPTANCE TRACE ' + JSON.stringify( trace ) );

} );
