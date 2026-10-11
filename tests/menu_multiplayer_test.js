// The multiplayer family on its own (card [44j]): the choice opens and returns, and a failed connection goes back to
// the menu it came from, or to multiplayer, with its reason. Through the public interface of menu_multiplayer.js.
import * as keys from '../src/engine/client/keys.js';
import * as common from '../src/engine/client/menu_common.js';
import * as mp from '../src/engine/client/menu_multiplayer.js';
import '../src/engine/client/menu.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
let dest = keys.key_game;
common.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {} } );

Deno.test( 'the multiplayer choice opens and ESC returns to the main menu', () => {
	mp.M_Menu_MultiplayerChoice_f(); check( common.m_state === common.m_mpchoice && dest === keys.key_menu, 'open' );
	mp.M_MultiplayerChoice_Key( keys.K_ESCAPE ); check( common.m_state === common.m_main, 'back to main' );
} );

Deno.test( 'a failed connection returns to the menu that joined, once; otherwise to multiplayer', () => {
	common.set_m_return_state( common.m_lanconfig ); common.set_m_return_onerror( true );
	check( mp.M_ShouldReturnOnError(), 'a menu join is in progress' );
	mp.M_ConnectionError( 'Room full' );
	check( common.m_state === common.m_lanconfig && common.m_return_reason === 'Room full' && ! mp.M_ShouldReturnOnError(), 'back where it joined, with the reason, flag used' );
	mp.M_ConnectionError();
	check( common.m_state === common.m_multiplayer && common.m_return_reason === 'Connection failed', 'a join from elsewhere: multiplayer, a default reason' );
} );
