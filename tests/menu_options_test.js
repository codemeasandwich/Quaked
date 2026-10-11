// The options family on its own (card [44j]): the options open, the sound slider moves by a tenth and stops at its
// ends, Enter on the first row opens Newer's options, and ESC returns. Through the public interface of menu_options.js.
import * as cmd from '../src/engine/common/cmd.js';
import * as cvar from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as common from '../src/engine/client/menu_common.js';
import * as options from '../src/engine/client/menu_options.js';
import { volume } from '../src/engine/sound/sound.js';
import '../src/engine/client/menu.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
let dest = keys.key_game;
cmd.Cbuf_Init(); cmd.Cmd_Init();
if ( ! cvar.Cvar_FindVar( 'volume' ) ) cvar.Cvar_RegisterVariable( volume );
common.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {} } );

Deno.test( 'options: the sound slider steps by 0.1 within 0..1; the first row opens Newer\'s options; ESC returns', () => {
	options.M_Menu_Options_f(); check( common.m_state === common.m_options && dest === keys.key_menu, 'open' );
	cvar.Cvar_SetValue( 'volume', 0.5 );
	for ( let i = 0; i < 10; i ++ ) options.M_Options_Key( keys.K_DOWNARROW ); // the sound volume row (OPTIONS_ORDER's 7)
	options.M_Options_Key( keys.K_RIGHTARROW ); check( Math.abs( volume.value - 0.6 ) < 1e-6, 'right: 0.6 (' + volume.value + ')' );
	for ( let i = 0; i < 9; i ++ ) options.M_Options_Key( keys.K_LEFTARROW ); check( volume.value === 0, 'left stops at 0 (' + volume.value + ')' );
	for ( let i = 0; i < 10; i ++ ) options.M_Options_Key( keys.K_UPARROW );
	options.M_Options_Key( keys.K_ENTER ); check( common.m_state === common.m_newer, 'the first row: Newer\'s options' );
	options.M_Newer_Key( keys.K_ESCAPE ); check( common.m_state === common.m_options, 'ESC: back to the options' );
	options.M_Options_Key( keys.K_ESCAPE ); check( common.m_state === common.m_main, 'ESC: back to the main menu' );
} );
