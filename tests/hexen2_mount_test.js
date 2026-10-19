// G1 public selection/mounting: a playable catalogue entry plus a class becomes a session plan and mounts the level
// through the engine's own loaders by logical name (the host has mounted the paks), placing the Paladin with native
// stats. The shelf/UI click and WebGL frame remain outside this test.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { PR_GetString } from '../src/engine/progs/progs.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_PlanStart, Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBarOps } from '../src/engine/client/hexen2_statusbar.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'a playable entry and a Paladin mount the level through the engine loaders', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	Mod_Init();
	const entry = { id: 'hexen2', kind: 'hexen2', name: 'Hexen II', folder: 'games/Hexen 2/data1', present: true, validated: true, playable: true };
	const plan = Hexen2_PlanStart( entry, { classId: 'paladin' } );
	check( plan.ok, plan.reason );
	same( plan.session.gameId, 'hexen2', 'the session game id' );
	same( plan.session.gamecodeMode, 'installed', 'the Installed gamecode default' );
	same( plan.session.rules, 'classic', 'the Classic rules default' );
	same( plan.classNumber, 1, 'the Paladin number' );
	same( plan.startMap, 'maps/demo1.bsp', 'the G1 start map' );
	same( plan.labels.rules, 'Classic rules', 'the rules label' );
	same( plan.labels.gamecode, 'Installed gamecode', 'the gamecode label' );
	check( Hexen2_PlanStart( { ...entry, playable: false }, { classId: 'paladin' } ).ok === false, 'a non-playable entry is refused' );
	check( Hexen2_PlanStart( entry, { classId: 'succubus' } ).ok === false, 'the base edition refuses the Succubus' );
	check( Hexen2_PlanStart( { ...entry, id: 'quake' }, { classId: 'paladin' } ).ok === false, 'a Quake entry is not a Hexen session' );

	const client = { name: 'mount', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client, svs, sv,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks ),
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null
	} );
	check( mounted.ok, mounted.reason );
	same( PR_GetString( mounted.player.v.model ), 'models/paladin.mdl', 'the Paladin model' );
	check( mounted.player.v.health >= 70 && mounted.player.v.health <= 95, 'native starting health: ' + mounted.player.v.health );
	check( mounted.player.v.max_mana > 0, 'native maximum mana: ' + mounted.player.v.max_mana );
	const hud = Hexen2_ReadHud( mounted.player );
	same( hud.playerClass, 1, 'the HUD class' );
	check( Hexen2_StatusBarOps( hud ).length > 5, 'the native status bar is emitted for the mounted player' );

} );
