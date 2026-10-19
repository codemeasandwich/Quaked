// U5 native Hexen II input: the inventory commands queue the native clc_inv_select and impulses 23/44, +crouch and
// +infoplaque drive the shared client's buttons, and the game's own default.cfg (executed by hexen.rc) keeps its
// bindings rather than Quake's web-port WASD overrides.
import { existsSync, readFileSync } from 'node:fs';
import { Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { key_game, set_key_dest } from '../src/engine/client/keys.js';
import { cl, cls, ca_connected } from '../src/engine/client/client.js';
import { clc_inv_select } from '../src/engine/common/protocol.js';
import * as input from '../src/engine/client/cl_input.js';
import { Hexen2_InventoryState } from '../src/engine/client/hexen2_inventory_state.js';
import * as pak from '../src/engine/common/pak.js';
import { GameSelection_ConfigKey, GameSelection_SetRunning } from '../src/engine/common/game_selection.js';
import { Host_DefaultBinds } from '../src/engine/server/host.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';

function hexenClient() {

	cl.h2 = { active: true, stats: {}, playerclass: [], puzzles: [], infoMask: 0, infoMask2: 0 };
	cl.time = 10;
	cl.intermission = 0;
	cls.state = ca_connected;
	cls.demoplayback = false;
	cls.message = { data: new Uint8Array( 64 ), cursize: 0, maxsize: 64, allowoverflow: false, overflowed: false };
	return cl.h2;

}

Deno.test( 'the inventory commands send the native selection and impulses', () => {

	GameProfile_Set( 'hexen2' );
	input.CL_InitInput();
	const h2 = hexenClient();
	h2.stats.cnt_torch = 2;
	h2.stats.cnt_glyph = 1;

	// a weapon slot keeps going through the ordinary impulse command
	Cmd_ExecuteString( 'impulse 3' );
	same( input.CL_PendingImpulse(), 3, 'impulse 3 selects the third weapon' );

	// invleft opens the row, invright selects the glyph, invuse queues slot 9 (artifact 8 + 1) and impulse 23
	Cmd_ExecuteString( 'invleft' );
	check( Hexen2_InventoryState( cl ).open === true, 'invleft opens the inventory row' );
	Cmd_ExecuteString( 'invright' );
	const inventory = Hexen2_InventoryState( cl );
	same( inventory.selected, 1, 'invright moves to the second carried artifact' );
	cls.message.cursize = 0;
	Cmd_ExecuteString( 'invuse' );
	same( input.CL_PendingImpulse(), 23, 'invuse raises the native use impulse' );
	same( cls.message.data[ 0 ], clc_inv_select, 'invuse queues clc_inv_select' );
	same( cls.message.data[ 1 ], 9, 'the selection is the glyph slot + 1' );

	// invdrop sends the same selection and impulse 44
	cls.message.cursize = 0;
	Cmd_ExecuteString( 'invdrop' );
	same( input.CL_PendingImpulse(), 44, 'invdrop raises the native drop impulse' );
	same( cls.message.data[ 1 ], 9, 'invdrop sends the selected artifact' );

	// invoff closes the row without a message
	Hexen2_InventoryState( cl ).open = true;
	cls.message.cursize = 0;
	Cmd_ExecuteString( 'invoff' );
	same( Hexen2_InventoryState( cl ).open, false, 'invoff closes the row' );
	same( cls.message.cursize, 0, 'invoff sends nothing' );

} );

Deno.test( 'crouch and the objectives plaque drive the native buttons', () => {

	GameProfile_Set( 'hexen2' );
	input.CL_InitInput();
	const h2 = hexenClient();
	set_key_dest( key_game );

	Cmd_ExecuteString( '+crouch 1' );
	check( ( input.in_crouch.state & 1 ) !== 0, '+crouch is held' );
	Cmd_ExecuteString( '-crouch 1' );
	same( input.in_crouch.state & 1, 0, '-crouch releases it' );

	Cmd_ExecuteString( '+infoplaque 1' );
	check( ( input.in_infoplaque.state & 1 ) !== 0, '+infoplaque is held' );
	same( h2.infoUp, true, 'the objectives plaque is up' );
	Cmd_ExecuteString( '-infoplaque 1' );
	same( h2.infoUp, false, 'the objectives plaque is down' );

} );

Deno.test( 'the game default.cfg bindings survive for Hexen II', () => {

	if ( ! existsSync( HEXEN + '/pak0.pak' ) ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	const raw = readFileSync( HEXEN + '/pak0.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-defaults-pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
	if ( ! pak.COM_FindFile( 'default.cfg' ) && existsSync( HEXEN + '/pak1.pak' ) ) {

		const raw1 = readFileSync( HEXEN + '/pak1.pak' );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-defaults-pak1.pak', raw1.buffer.slice( raw1.byteOffset, raw1.byteOffset + raw1.length ) ) );

	}
	if ( ! pak.COM_FindFile( 'default.cfg' ) ) { console.log( 'SKIP: default.cfg is not in the supplied packs' ); return; }
	GameProfile_Set( 'hexen2' );
	const binds = Host_DefaultBinds();
	check( /bind\s+SPACE\s+\+crouch/i.test( binds ), 'Space crouches: ' + binds.slice( 0, 160 ) );
	check( /bind\s+\[\s+"?invleft"?/i.test( binds ), 'the [ inventory key is kept' );
	check( /bind\s+TAB\s+\+showinfo/i.test( binds ), 'Tab opens the character bar' );
	check( /bind\s+ENTER\s+"?invuse"?/i.test( binds ), 'Enter uses the selected artifact' );

} );

Deno.test( 'Hexen II keeps its own saved key configuration', () => {

	GameProfile_Set( 'hexen2' );
	GameSelection_SetRunning( 'hexen2' );
	same( GameSelection_ConfigKey(), 'quake_config_hexen2', 'Hexen II does not load or save Quake\'s key bindings' );
	GameSelection_SetRunning( null );

} );
