// U5 shared status bar: Sbar_Draw on a Hexen II profile reads cl.h2 and executes the native bar through the shared
// drawing hooks (no page host), including the lower character bar, the artifact row and the +showdm puzzle roster.
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import { cl } from '../src/engine/client/client.js';
import { Cmd_ExecuteString } from '../src/engine/common/cmd.js';
import { set_host_frametime } from '../src/engine/common/host_state.js';
import { Hexen2_InvLeft } from '../src/engine/client/hexen2_inventory_state.js';
import { Hexen2_ParsePuzzleStrings, Hexen2_ParseStrings, Hexen2_ParseInfoStrings } from '../src/engine/common/hexen2_text_resources.js';
import { SCR_Hexen2TextLines, SCR_Hexen2ObjectivesText, SCR_Hexen2PlaqueText, SCR_SetExternals } from '../src/engine/render/gl_screen.js';
import * as sbar from '../src/engine/client/sbar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const fakePic = { width: 8, height: 8, canvas: {} };
let drawn = [], strings = [], wadPics = [];

function setWindow() {

	Object.defineProperty( globalThis, 'window', { configurable: true, value: { innerWidth: 640, innerHeight: 400, devicePixelRatio: 1 } } );

}

function hexenState() {

	cl.h2 = {
		active: true, portals: false,
		stats: { health: 85, max_health: 100, bluemana: 42, greenmana: 7, max_mana: 100, armor_helmet: 3,
			cnt_torch: 2, cnt_glyph: 1, level: 2, experience: 1234, intelligence: 14, wisdom: 11, strength: 12,
			dexterity: 13, ring_flight: 50, rings_active: 1, artifact_active: 0,
			puzzle_inv1: 'key1', puzzle_inv2: '', puzzle_inv3: '', puzzle_inv4: '',
			puzzle_inv5: '', puzzle_inv6: '', puzzle_inv7: '', puzzle_inv8: '' },
		playerclass: [ 1 ], puzzles: [ 'key1', '', '', '', '', '', '', '' ],
		infoMask: 0, infoMask2: 0, infoUp: false, plaqueIndex: 0, viewTint: 0, statbar: 1
	};
	cl.time = 20;
	cl.intermission = 0;
	cl.gametype = 0;
	cl.maxclients = 1;
	cl.scores = [];
	cl.stats = new Array( 32 ).fill( 0 );
	return cl.h2;

}

function wire() {

	drawn = []; strings = []; wadPics = [];
	sbar.Sbar_SetExternals( {
		cl, vid: { width: 320, height: 200, numpages: 1 },
		Draw_CachePic: name => { drawn.push( name ); return fakePic; },
		Draw_Pic: ( x, y, pic ) => { if ( pic !== fakePic ) drawn.push( 'pic' ); },
		Draw_TransPic: ( x, y, pic ) => { if ( pic !== fakePic ) drawn.push( 'trans' ); },
		Draw_Character: () => {},
		Draw_String: ( x, y, text ) => strings.push( text ),
		Draw_SmallString: ( x, y, text ) => strings.push( text ),
		Draw_Fill: () => {},
		Draw_PicFromWad: name => { wadPics.push( name ); return fakePic; }
	} );

}

Deno.test( 'Sbar_Draw draws the native Hexen II bar from cl.h2', () => {

	setWindow();
	GameProfile_Set( 'hexen2' );
	hexenState();
	wire();
	sbar.Sbar_Init();
	sbar.Sbar_Draw();

	check( drawn.includes( 'gfx/topbar1.lmp' ), 'the top bar left half is drawn' );
	check( drawn.includes( 'gfx/topbar2.lmp' ), 'the top bar right half is drawn' );
	check( drawn.includes( 'gfx/bmana.lmp' ) && drawn.includes( 'gfx/gmana.lmp' ), 'both mana fills are drawn' );
	check( wadPics.includes( 'num_8' ) || wadPics.includes( 'num_5' ), 'the health uses the native number lumps' );
	check( strings.includes( 'Paladin' ) === false, 'the lower bar stays closed by default' );

} );

Deno.test( 'the lower character bar and the artifact inventory draw from the shared state', () => {

	setWindow();
	GameProfile_Set( 'hexen2' );
	hexenState();
	wire();
	set_host_frametime( 0.1 );
	sbar.Sbar_Hexen2ShowInfoDown();
	for ( let i = 0; i < 40; i ++ ) sbar.Sbar_Draw();
	check( drawn.includes( 'gfx/btmbar1.lmp' ), 'the lower bar is drawn after +showinfo' );
	check( drawn.includes( 'gfx/cport1.lmp' ), 'the Paladin portrait is drawn' );
	check( strings.includes( 'Paladin' ), 'the class name is drawn' );

	// carry two artifacts and open the row: the selected icon and the six-icon row are drawn
	Hexen2_InvLeft( cl );
	drawn = []; strings = [];
	sbar.Sbar_Draw();
	check( drawn.includes( 'gfx/arti00.lmp' ), 'the selected torch is on the bar' );
	check( drawn.includes( 'gfx/artisel.lmp' ), 'the inventory selection highlight is drawn' );
	check( drawn.includes( 'gfx/arti08.lmp' ), 'the glyph icon is in the row' );

} );

Deno.test( 'the +showdm puzzle roster names pieces from puzzles.txt', () => {

	setWindow();
	GameProfile_Set( 'hexen2' );
	hexenState();
	Hexen2_ParsePuzzleStrings( '2\nkey1 Skull Key\nkey2 Sun Key\n' );
	wire();
	sbar.Sbar_Init();
	Cmd_ExecuteString( '+showdm' );
	sbar.Sbar_Draw();
	check( drawn.includes( 'gfx/puzzle/key1.lmp' ), 'the carried piece picture is drawn' );
	check( strings.includes( 'Skull Key' ), 'the full puzzle name is drawn' );

} );

Deno.test( 'plaques wrap like the native text box and the objectives read the info mask', () => {

	same( SCR_Hexen2TextLines( 'one two three four five', 9 ).join( '|' ), 'one two|three|four five', 'the native 26/30-column wrapper' );
	same( SCR_Hexen2TextLines( 'first@@second', 26 ).join( '|' ), 'first|second', '@@ is the native line break' );
	Hexen2_ParseInfoStrings( 'Find the key\nOpen the gate\n' );
	check( SCR_Hexen2ObjectivesText( 1, 0 ).includes( 'Objectives:' ), 'the objectives title' );
	check( SCR_Hexen2ObjectivesText( 1, 0 ).includes( 'Find the key' ), 'the completed objective' );
	check( ! SCR_Hexen2ObjectivesText( 1, 0 ).includes( 'Open the gate' ), 'an incomplete objective stays hidden' );
	Hexen2_ParseInfoStrings( Array.from( { length: 33 }, ( _, i ) => 'Objective ' + ( i + 1 ) ).join( '\n' ) );
	check( SCR_Hexen2ObjectivesText( 0, 1 ).includes( 'Objective 33' ), 'the second mask covers bits 32 and up' );

	Hexen2_ParseStrings( 'hello\nworld\n' );
	GameProfile_Set( 'hexen2' );
	hexenState();
	cl.h2.plaqueIndex = 2;
	SCR_SetExternals( { cl } );
	same( SCR_Hexen2PlaqueText(), 'world', 'the plaque index selects a strings.txt line' );
	cl.h2.plaqueIndex = 0;
	same( SCR_Hexen2PlaqueText(), '', 'index 0 clears the plaque' );

} );
