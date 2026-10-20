// U5 shared Hexen II menus: the main -> single player -> class -> difficulty flow records the native class and skill
// cvars and issues the edition's `map` command, the class list grows to five in Portal, and the shared Options page
// gains the enhanced-mode row that calls Newer_ApplyGameDefaults.
import { Cbuf_Init, Cbuf_Execute, Cmd_AddCommand, Cmd_Argv } from '../src/engine/common/cmd.js';
import { Cvar_SetValue, Cvar_VariableValue, Cvar_FindVar, Cvar_RegisterVariable, cvar_t } from '../src/engine/common/cvar.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { K_ENTER, K_UPARROW, K_DOWNARROW } from '../src/engine/client/keys.js';
import * as menu from '../src/engine/client/menu.js';
import * as common from '../src/engine/client/menu_common.js';
import { M_Hexen2_Reset, Hexen2_MenuClasses, Hexen2_DifficultyNames } from '../src/engine/client/menu_hexen2.js';
import { M_Menu_Options_f } from '../src/engine/client/menu_options.js';
import { M_Hexen2_Options_Key } from '../src/engine/client/menu_hexen2_options.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const commands = [];

function reset() {

	GameProfile_Set( 'hexen2' );
	M_Hexen2_Reset();
	Cbuf_Init();
	commands.length = 0;
	for ( const name of [ 'map', 'disconnect', 'maxplayers', 'coop', 'deathmatch' ] )
		if ( ! Cvar_FindVar( name ) ) Cmd_AddCommand( name, () => commands.push( name + ' ' + Cmd_Argv( 1 ) ) );
	if ( Cvar_FindVar( 'skill' ) === null ) Cvar_RegisterVariable( new cvar_t( 'skill', '1' ) );
	if ( Cvar_FindVar( '_cl_playerclass' ) === null ) Cvar_RegisterVariable( new cvar_t( '_cl_playerclass', '1', true ) );

}

Deno.test( 'the Hexen main menu reaches class and difficulty and starts demo1', () => {

	reset();
	menu.M_Menu_Main_f();
	same( common.m_state, common.m_hexen2_main, 'the native Hexen main menu opens' );
	menu.M_Keydown( K_ENTER ); // Single Player
	same( common.m_state, common.m_hexen2_single, 'the single player page opens' );
	menu.M_Keydown( K_ENTER ); // New Game
	same( common.m_state, common.m_hexen2_class, 'New Game asks for a class' );
	menu.M_Keydown( K_DOWNARROW ); // Crusader
	menu.M_Keydown( K_ENTER );
	same( Cvar_VariableValue( '_cl_playerclass' ), 2, 'the class choice is recorded' );
	same( common.m_state, common.m_hexen2_skill, 'the difficulty page follows' );
	Cbuf_Execute(); // the disconnect/maxplayers lines queued by New Game
	commands.length = 0;
	menu.M_Keydown( K_ENTER ); // Apprentice / SQUIRE for the Crusader's table
	same( Cvar_VariableValue( 'skill' ), 0, 'the skill is recorded' );
	Cbuf_Execute();
	check( commands.includes( 'map demo1' ), 'the edition start map is issued: ' + commands.join( ', ' ) );
	same( common.m_state, common.m_none, 'the menu closes' );

} );

Deno.test( 'classes and per-class skill names follow the edition', () => {

	GameProfile_Set( 'hexen2' );
	same( Hexen2_MenuClasses().length, 4, 'the base game offers four classes' );
	same( Hexen2_DifficultyNames( 2 )[ 0 ], 'GALLANT', 'the Crusader skill names' );
	GameProfile_Set( 'hexen2-portals' );
	const portal = Hexen2_MenuClasses();
	same( portal.length, 5, 'Portal offers the Demoness' );
	same( portal[ 4 ].name, 'Demoness', 'the fifth class' );
	same( Hexen2_DifficultyNames( 5 )[ 3 ], 'SHE BITCH', 'the Demoness skill names' );
	GameProfile_Set( 'hexen2' );

} );

Deno.test( 'the Hexen Options page exposes the enhanced mode row', () => {

	GameProfile_Set( 'hexen2' );
	if ( Cvar_FindVar( 'r_hdr' ) === null ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '0' ) );
	Cvar_SetValue( 'r_hdr', 0 );
	Cbuf_Init();
	M_Menu_Options_f();
	same( common.m_state, common.m_hexen2_options, 'Hexen opens its own native Options page' );
	// the two Quaked rows are last, so Up from the first row reaches Texture detail and then Enhanced mode
	M_Hexen2_Options_Key( K_UPARROW );
	M_Hexen2_Options_Key( K_UPARROW );
	M_Hexen2_Options_Key( K_ENTER );
	Cbuf_Execute();
	same( Cvar_VariableValue( 'r_hdr' ), 1, 'the enhanced mode is applied through Newer_ApplyGameDefaults' );

} );
