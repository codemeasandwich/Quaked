// Options, Newer features (src/engine/client/menu_options.js) as a list longer than its page: the first 17 rows are
// where they always were, the page follows the cursor to the rows past it, the note says how many more there are, a
// touch on the note turns the page, and the first of the add-on effects' rows (card T-3faa98e3) changes its setting.
import * as cmd from '../src/engine/common/cmd.js';
import * as cvar from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as common from '../src/engine/client/menu_common.js';
import * as options from '../src/engine/client/menu_options.js';
import * as menu from '../src/engine/client/menu.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
let dest = keys.key_game, drawn = [];
globalThis.window ??= { devicePixelRatio: 1 }; // the menu's size is worked out from the window's
const ox = () => ( common._vid.width - 320 ) >> 1, oy = () => ( common._vid.height - 200 ) >> 1;
cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
for ( const name of [ 'v_blastshake', 'r_newer_lighting', 'r_newer_normals', 'r_newer_water', 'r_dof' ] ) if ( ! cvar.Cvar_FindVar( name ) ) cvar.Cvar_RegisterVariable( new cvar.cvar_t( name, '1' ) );
common.M_SetExternals( { key_dest_set: v => { dest = v; }, key_dest_get: () => dest, cls: { state: 0, demonum: - 1 }, sv: { active: false }, svs: { maxclients: 1 },
	S_LocalSound: () => {}, vid: { width: 320, height: 200 }, realtime_get: () => 0, Draw_Fill: () => {},
	Draw_CachePic: () => ( { width: 128, height: 24 } ), Draw_TransPic: () => {}, Draw_Pic: () => {},
	Draw_Character: ( x, y, num ) => drawn.push( { x: x - ox(), y: y - oy(), c: String.fromCharCode( num & 127 ), cursor: num === 12 || num === 13 } ) } );

// the page as drawn: each row's label text by its y, and where the cursor is
function page() {

	drawn = []; options.M_Newer_Draw();
	const rows = new Map();
	for ( const d of drawn ) if ( ! d.cursor && ( d.x < 200 || d.y >= 44 + 17 * 8 ) ) rows.set( d.y, ( rows.get( d.y ) ?? '' ) + d.c );
	const labels = [ ...rows.entries() ].sort( ( a, b ) => a[ 0 ] - b[ 0 ] ).map( ( [ y, text ] ) => ( { y, text: text.trim() } ) );
	return { labels: labels.filter( r => r.y < 44 + 17 * 8 ), note: labels.find( r => r.y >= 44 + 17 * 8 )?.text ?? '', cursorY: drawn.find( d => d.cursor )?.y };

}
// Exercise the actual screen-to-menu touch routing at a non-native screen size.
const touch = ( x, y ) => menu.M_TouchInput( ( x + ox() ) / common._vid.width * 960, ( y + oy() ) / common._vid.height * 600, 960, 600 );
const open = () => { cmd.Cmd_ExecuteString( 'menu_options' ); same( common.m_state, common.m_options, 'public command opens Options' ); menu.M_Keydown( keys.K_ENTER ); same( common.m_state, common.m_newer, 'the features page is open' ); };

Deno.test( 'the first page is as it was: 17 rows from y 44, lighting first, depth of field last, the cursor on the first', () => {

	open();
	const p = page();
	same( p.labels.length, 17, 'rows on the page' );
	same( p.labels[ 0 ].y, 44, 'the first row\'s place' ); same( p.labels[ 0 ].text, 'Newer lighting', 'the first row' );
	same( p.labels[ 16 ].y, 44 + 16 * 8, 'the last row\'s place' ); same( p.labels[ 16 ].text, 'Depth of field', 'the 17th row' );
	same( p.cursorY, 44, 'the cursor' );
	check( /Newer Game only\. +\d+ more below/.test( p.note ), 'the note says the list goes on: ' + p.note );
	check( ! p.labels.some( r => r.text === 'Explosion shake' ), 'the rows past the page are not drawn on it' );

} );

Deno.test( 'the page follows the cursor down to the rows past it and back up; Up from the top goes to the last row', () => {

	open();
	for ( let i = 0; i < 16; i ++ ) menu.M_Keydown( keys.K_DOWNARROW );
	same( page().labels[ 0 ].text, 'Newer lighting', 'still the first page on its last row' );
	menu.M_Keydown( keys.K_DOWNARROW );
	let p = page();
	check( p.labels.some( r => r.text === 'Explosion shake' ), 'the next row is brought onto the page' );
	same( p.labels.length, 17, 'still 17 rows' ); same( p.labels[ 0 ].y, 44, 'from the same place' );
	check( p.labels[ 0 ].text !== 'Newer lighting', 'the top row has moved off' );
	same( p.cursorY, p.labels.find( r => r.text === 'Explosion shake' ).y, 'the cursor is on the row it moved to' );
	for ( let i = 0; i < 40; i ++ ) { menu.M_Keydown( keys.K_DOWNARROW ); const q = page(); check( q.cursorY >= 44 && q.cursorY < 44 + 17 * 8, 'the cursor never leaves the page' ); }
	while ( page().labels[ 0 ].text !== 'Newer lighting' || page().cursorY !== 44 ) menu.M_Keydown( keys.K_UPARROW );
	menu.M_Keydown( keys.K_UPARROW );
	p = page();
	check( /more above/.test( p.note ) && p.cursorY === 44 + 16 * 8, 'Up from the top: the last row, at the foot of the last page: ' + p.note );
	menu.M_Keydown( keys.K_DOWNARROW ); p = page();
	same( p.cursorY, 44, 'Down from the last row: the first again' ); same( p.labels[ 0 ].text, 'Newer lighting', 'on the first page' );

} );

Deno.test( 'the explosion shake slider and note paging use the actual visible rows', () => {
 open(); cvar.Cvar_SetValue( 'v_blastshake', 1 );
 let steps = 0;
 while ( ! ( page().labels.find( r => r.text === 'Explosion shake' )?.y === page().cursorY ) && steps ++ < 64 ) menu.M_Keydown( keys.K_DOWNARROW );
 check( steps < 64, 'public navigation reaches Explosion shake' );
 menu.M_Keydown( keys.K_LEFTARROW ); same( cvar.Cvar_VariableValue( 'v_blastshake' ), 0.95, 'Left steps down' );
 menu.M_Keydown( keys.K_RIGHTARROW ); same( cvar.Cvar_VariableValue( 'v_blastshake' ), 1, 'Right steps up' );
 menu.M_Keydown( keys.K_ENTER ); same( cvar.Cvar_VariableValue( 'v_blastshake' ), 0, 'Enter wraps to off' );
 const lighting = cvar.Cvar_VariableValue( 'r_newer_lighting' );
 touch( 220, page().cursorY + 2 ); same( cvar.Cvar_VariableValue( 'v_blastshake' ), 0.05, 'public touch changes the displayed row' );
 same( page().labels[ 0 ].text, 'Normal maps', 'first scroll keeps the established second row at the top' );
 const normal = cvar.Cvar_VariableValue( 'r_newer_normals' );
 touch( 220, 46 ); same( cvar.Cvar_VariableValue( 'r_newer_normals' ), normal ? 0 : 1, 'touch mutates the real visible first row' );
 same( cvar.Cvar_VariableValue( 'r_newer_lighting' ), lighting, 'original first-page row untouched' );
 let pages = 0;
 while ( /more below/.test( page().note ) && pages ++ < 10 ) touch( 100, 44 + 17 * 8 + 8 );
 check( pages < 10 && /more above/.test( page().note ), 'note paging reaches the last page' );
 touch( 100, 44 + 17 * 8 + 8 );
 same( page().labels[ 0 ].text, 'Newer lighting', 'note on last page returns to first' );
 same( page().cursorY, 44, 'cursor at first row' );
 touch( 100, 44 + 17 * 8 + 8 );
 check( page().labels[ 0 ].text !== 'Newer lighting' && page().cursorY === 44, 'note advances to another page with cursor visible' );
 menu.M_Keydown( keys.K_ESCAPE ); same( common.m_state, common.m_options, 'ESC returns to Options' );
} );
