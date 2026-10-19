// G1 HUD execution: the native status-bar operations run through the port's real 2D path (Draw_CachePic palette
// conversion and Draw_Pic overlay drawImage) with a canvas double, so the layout is not only a data list. A real
// browser canvas is still the packaged app's job.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition, SV_Move } from '../src/engine/server/world.js';
import { sv as serverSv, SIGNON_SIZE } from '../src/engine/server/server.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { Hexen2_MountLevel } from '../src/engine/progs/hexen2_mount.js';
import { Hexen2_ReadHud } from '../src/engine/client/hexen2_hud.js';
import { Hexen2_StatusBarOps } from '../src/engine/client/hexen2_statusbar.js';
import { Hexen2_DrawStatusBar } from '../src/engine/client/hexen2_sbar_draw.js';
import { Draw_Init, Draw_CachePic, Draw_Pic } from '../src/engine/render/gl_draw.js';
import { W_LoadWadFile } from '../src/engine/common/wad.js';
import { installFakeCanvas } from './helpers/fake_canvas.mjs';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import '../src/engine/progs/hexen2_world_cmds.js';
import '../src/engine/progs/hexen2_precache_cmds.js';
import '../src/engine/progs/hexen2_server_cmds.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

Deno.test( 'the native status bar draws through the real picture overlay path', () => {

	if ( ! existsSync( HEXEN + '/pak1.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	// the engine's 2D charset lives in Quake's gfx.wad; mount the shareware pack first so Hexen content wins later
	const shareware = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'shareware', shareware.buffer.slice( shareware.byteOffset, shareware.byteOffset + shareware.length ) ) );
	const sharewareWad = pak.COM_LoadFile( 'gfx.wad' ); // before Hexen's own gfx.wad shadow it
	check( sharewareWad !== null, 'the engine charset WAD is available' );
	W_LoadWadFile( sharewareWad );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) { const raw = readFileSync( HEXEN + '/' + name ); pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); }
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	const client = { name: 'canvas', active: true, spawned: true, spawn_parms: new Array( 16 ).fill( 0 ), cmd: { viewangles: [ 0, 0, 0 ] } };
	const sv = serverSv;
	sv.signon.data = sv.signon_buf; sv.signon.maxsize = SIGNON_SIZE;
	client.message = sv.signon;
	const svs = { maxclients: 1, clients: [ client ], active: true };
	const entry = { id: 'hexen2', kind: 'hexen2', folder: 'games/Hexen 2/data1', playable: true };
	const mounted = Hexen2_MountLevel( {
		entry, classId: 'paladin', client, sv, svs,
		readFile: name => existsSync( HEXEN + '/' + name ) ? new Uint8Array( readFileSync( HEXEN + '/' + name ) ) : null,
		loadMap: name => { const map = new model_t(); map.name = name; set_loadmodel( map ); const found = pak.COM_FindFile( name ); Mod_LoadBrushModel( map, found.data.buffer.slice( found.data.byteOffset, found.data.byteOffset + found.size ) ); return map; },
		installCallbacks: callbacks => installServerCallbacks( callbacks )
	} );
	check( mounted.ok, mounted.reason );

	const fake = installFakeCanvas();
	try {

		Draw_Init( fake.canvas );
		mounted.player.v.bluemana = 42;
		const hud = Hexen2_ReadHud( mounted.player );
		const ops = Hexen2_StatusBarOps( hud, { width: 320, height: 200 } );
		const small = [], nums = [];
		const result = Hexen2_DrawStatusBar( ops, {
			pic: ( name, x, y ) => { const pic = Draw_CachePic( name ); if ( ! pic ) return false; Draw_Pic( x, y, pic ); return true; },
			num: ( value, digits, x, y ) => nums.push( { value, digits, x, y } ),
			small: ( text, x, y ) => small.push( { text, x, y } )
		} );
		same( result.skipped, 0, 'every picture and text operation was drawn' );
		check( fake.calls.length > 0, 'the overlay received drawImage calls: ' + fake.calls.length );
		// the top-bar picture is the first draw, at the bar's native position
		same( fake.calls[ 0 ].x, 0, 'the upper-left bump x' );
		same( fake.calls[ 0 ].y, 200 - 46 - 23, 'the upper-left bump y' );
		const topbar = fake.calls.find( call => call.x === 0 && call.y === 200 - 46 );
		check( topbar !== undefined, 'the top bar is drawn at y=154' );
		const expectedManaY = 200 - 46 + 26 - Math.round( 42 * 18 / hud.maxMana );
		check( fake.calls.some( call => call.x === 190 && call.y === expectedManaY ), 'the blue mana fill sits at its native height' );
		check( small.some( text => /^\d{3}$/.test( text.text ) ), 'the three-digit mana text was drawn' );
		check( nums.some( n => n.digits === 3 && n.value === hud.health ), 'the HP number was drawn' );
		check( nums.some( n => n.digits === 2 ), 'the armour class number was drawn' );

	} finally { fake.restore(); }

} );
