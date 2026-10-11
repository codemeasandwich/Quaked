// Level select on its own (card [44j]): it opens from single player's entry, offers what the pack has (here no maps at
// all, so no episodes), and ESC returns to single player. Through the public interface of menu_levelselect.js; the
// full behaviour with real paks is level_select_test.
import * as keys from '../src/engine/client/keys.js';
import * as common from '../src/engine/client/menu_common.js';
import * as ls from '../src/engine/client/menu_levelselect.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
let dest = keys.key_game;
common.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {} } );

Deno.test( 'level select opens, offers only the maps the game has, and ESC goes back to single player', () => {
	ls.M_Menu_LevelSelect_f();
	check( common.m_state === common.m_levelselect && dest === keys.key_menu, 'open' );
	const offer = ls.M_LevelSelectOffer();
	check( Array.isArray( offer.episodes ) && offer.episodes.length === 0 && offer.levels.length === 0, 'no pak, nothing offered: ' + JSON.stringify( offer ) );
	check( ls.LEVEL_SELECT_EPISODES.length > 0 && ls.LEVEL_SELECT_LEVELS.length > 0, 'the stock tables' );
	ls.M_LevelSelect_Key( keys.K_ESCAPE ); check( common.m_state === common.m_singleplayer, 'ESC: single player' );
} );
