// Public native credits and scoped UI metrics; no game/browser is launched.
await import( '../src/gl_rsurf.js' );
const menu = await import( '../src/menu.js' ), cmd = await import( '../src/cmd.js' ), keys = await import( '../src/keys.js' );
const draw = await import( '../src/gl_draw.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
function check( value, label ) { if ( ! value ) throw new Error( label ); }
cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
const footer = 'github.com/codemeasandwich/Quaked', footerX = ( 320 - footer.length * 8 ) / 2;
function fixture( run ) {
 const rows = new Map(), pictures = [], opened = [], descriptor = Object.getOwnPropertyDescriptor( globalThis, 'window' ), previousHeight = draw.SCR_GetConHeight();
 Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800, open: url => opened.push( url ) } } );
 try {
  let dest = keys.key_game, dimensions;
  draw.Draw_SetExternals( { vid: { width: 1280, height: 800 } } ); draw.SCR_SetConHeight( 200 );
  const capture = () => { dimensions = [ draw.Draw_GetVirtualWidth(), draw.Draw_GetVirtualHeight() ]; };
  menu.M_SetExternals( { key_dest_set: value => { dest = value; }, key_dest_get: () => dest, cls: { demonum: - 1 }, weaponModelsCredit: null,
   Draw_CachePic: path => ( { width: 8, height: 8, path } ), Draw_TransPic() {}, Draw_FadeScreen() {}, S_LocalSound() {},
   Draw_Pic: ( x, y, pic ) => { capture(); pictures.push( { x, y, pic } ); },
   Draw_Character: ( x, y, num ) => { capture(); if ( ( num & 127 ) === 10 ) return; check( num >= 0 && num <= 255, 'Japanese uses native picture; glyphs remain ASCII' ); if ( ! rows.has( y ) ) rows.set( y, [] ); rows.get( y ).push( { x, raw: num, char: String.fromCharCode( num & 127 ) } ); } } );
  const api = { rows, pictures, opened,
   draw( pic = null ) { rows.clear(); pictures.length = 0; menu.M_SetExternals( { weaponModelsCredit: pic } ); cmd.Cmd_ExecuteString( 'menu_credits' ); menu.M_Draw(); },
   text( localY ) { const dy = ( dimensions[ 1 ] - 200 ) >> 1; return rows.get( localY + dy )?.sort( ( a, b ) => a.x - b.x ).map( c => c.char ).join( '' ); },
   dimensions: () => dimensions,
   touch( x, y ) {
    const point = draw.Draw_WithVirtualSize( 320, 272, () => [ ( x + ( draw.Draw_GetVirtualWidth() - 320 ) / 2 ) / draw.Draw_GetVirtualWidth() * 1280, ( y + ( draw.Draw_GetVirtualHeight() - 200 ) / 2 ) / draw.Draw_GetVirtualHeight() * 800 ] );
    // Scope has ended: public touch must establish matching viewport itself.
    menu.M_TouchInput( point[ 0 ], point[ 1 ], 1280, 800 );
   }
  }; run( api );
 } finally {
  menu.M_SetExternals( { weaponModelsCredit: null } ); draw.Draw_SetExternals( { vid: { width: 640, height: 480 } } ); draw.SCR_SetConHeight( previousHeight );
  if ( descriptor ) Object.defineProperty( globalThis, 'window', descriptor ); else delete globalThis.window;
 }
}
Deno.test( 'public credits retain contributors, native-size Japanese picture/fallback and centered white footer inside enlarged box', () => fixture( api => {
 api.draw(); equal( api.text( 190 ), ' Dannaki (dannaki)', 'ASCII fallback' );
 const pic = { width: 58, height: 8, canvas: {}, source: 'assets/credits/dannaki-name.png' }; api.draw( pic );
 const [ width, height ] = api.dimensions(), dx = ( width - 320 ) >> 1, dy = ( height - 200 ) >> 1;
 check( width >= 320 && height >= 272, 'credits viewport fits enlarged box' );
 equal( api.text( -12 ), 'Programming        Art ', 'programming section retained' );
 equal( api.text( 36 ), 'Design             Biz', 'blank row before design' );
 equal( api.text( 84 ), 'Support            Id Mom', 'blank row before support' );
 equal( api.text( 108 ), 'JavaScript port', 'blank row before JavaScript port' );
 equal( api.text( 132 ), 'Enhancements', 'blank row before enhancements' );
 equal( api.text( -24 ), 'Quake by id Software', 'version-free title' ); equal( api.rows.get( -24 + dy )[ 0 ].x - dx, ( 320 - 'Quake by id Software'.length * 8 ) / 2, 'centered Quake title' );
 equal( api.text( 180 ), 'Weapon Models', 'heading' ); equal( api.text( 190 ), '(dannaki)', 'handle' );
 const image = api.pictures.find( item => item.pic === pic ); check( image, 'name uses native Draw_Pic' );
 equal( image.x - dx, 24, 'name position X' ); equal( image.y - dy, 190, 'two-pixel gap below heading' ); equal( image.pic.height, 8, 'ordinary glyph height' );
 equal( api.rows.get( 190 + dy )[ 0 ].x - dx, 88, 'six-pixel handle gap' );
 equal( api.text( 156 ), 'Ambient music', 'music heading retained' ); equal( api.text( 164 ), ' Iron Cthulhu Apocalypse', 'musician retained' );
 equal( api.text( 140 ), ' Brian Shannon + Claude + Codex', 'owner enhancement wording' );
 equal( api.text( 212 ), footer, 'bottom link without Source code heading' );
 const link = api.rows.get( 212 + dy ); equal( link[ 0 ].x - dx, footerX, 'centered footer' ); check( link.every( c => c.raw === c.char.charCodeAt( 0 ) ), 'native white footer' );
 const all = Array.from( api.rows.values() ).flat().map( c => c.char ).join( '' );
 for ( const name of [ 'John Carmack', 'Adrian Carmack', 'Michael Abrash', 'Kevin Cloud', 'John Cash', 'Paul Steed', "Dave 'Zoid' Kirsch", 'John Romero', 'Jay Wilbur', 'Sandy Petersen', 'Mike Wilson', 'American McGee', 'Donna Jackson', 'Tim Willits', 'Todd Hollenshead', 'Barrett Alexander', 'Shawn Green', 'mrdoob + claude + codex', 'Brian Shannon', 'Iron Cthulhu Apocalypse' ] ) check( all.includes( name ), 'contributor retained: ' + name );
 check( ! all.includes( 'Source code' ) && ! all.includes( '1.09' ) && ! all.toLowerCase().includes( 'rudolfs' ), 'removed heading/credit absent' );
 for ( const [ y, chars ] of api.rows ) for ( const { x } of chars ) check( x - dx >= 0 && x - dx + 8 <= 320 && y - dy >= -36 && y - dy + 8 <= 236, 'glyph within 320x272 box' );
 equal( draw.SCR_GetConHeight(), 200, 'UI preference preserved' ); equal( draw.Draw_GetUIScale(), 4, 'normal scale restored' );
} ) );
Deno.test( 'public credits click maps enlarged viewport only to centered footer; Enter and Escape retain navigation', () => fixture( api => {
 api.draw(); api.touch( footerX + 1, 213 ); equal( api.opened.length, 1, 'footer top clicked' );
 api.touch( footerX + footer.length * 8 - 1, 219.9 ); equal( api.opened.length, 2, 'footer past old 200px bound clicked' );
 equal( api.opened[ 0 ], 'https://github.com/codemeasandwich/Quaked', 'source URL retained' );
 for ( const [ x, y ] of [ [ footerX - .1, 216 ], [ footerX + footer.length * 8 + .1, 216 ], [ footerX + 1, 211.9 ], [ footerX + 1, 220.1 ], [ 32, 188 ] ] ) {
  cmd.Cmd_ExecuteString( 'menu_credits' ); api.touch( x, y ); equal( api.opened.length, 2, 'outside footer does not open source' ); equal( menu.m_state, menu.m_main, 'outside returns to main' );
 }
 cmd.Cmd_ExecuteString( 'menu_credits' ); menu.M_Keydown( keys.K_ENTER ); equal( api.opened.length, 3, 'Enter opens source' ); menu.M_Keydown( keys.K_ESCAPE ); equal( menu.m_state, menu.m_main, 'Escape returns to main' );
 equal( draw.Draw_GetUIScale(), 4, 'touch restores normal scale' ); equal( draw.SCR_GetConHeight(), 200, 'touch preserves preference' );
} ) );
Deno.test( 'temporary credits sizing restores normal metrics and preference after nested scopes and callback failure', () => fixture( () => {
 const error = new Error( 'credits-scope-failure' ); let caught;
 try { draw.Draw_WithVirtualSize( 320, 272, () => {
  equal( draw.Draw_GetUIScale(), 2, 'temporary credits integer scale' );
  draw.Draw_WithVirtualSize( 320, 600, () => equal( draw.Draw_GetUIScale(), 1, 'nested larger scale' ) ); equal( draw.Draw_GetUIScale(), 2, 'outer metrics restored' ); throw error;
 } ); } catch ( e ) { caught = e; }
 equal( caught, error, 'original error propagated' ); equal( draw.Draw_GetUIScale(), 4, 'normal scale restored after failure' ); equal( draw.Draw_GetVirtualHeight(), 200, 'normal virtual height retained' ); equal( draw.SCR_GetConHeight(), 200, 'preference never changed' );
} ) );
