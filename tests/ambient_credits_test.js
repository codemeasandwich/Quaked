// Public native credits and scoped UI metrics; no game/browser is launched.
// Real menu/gl_draw functions and pak0 glyph/border assets feed a recording
// Canvas2D boundary. Assertions measure transformed destination rectangles;
// these are geometry/interaction checks, not raster or browser visual acceptance.
import { readFileSync } from 'node:fs';
await import( '../src/gl_rsurf.js' );
const menu = await import( '../src/menu.js' ), cmd = await import( '../src/cmd.js' ), keys = await import( '../src/keys.js' );
const draw = await import( '../src/gl_draw.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
function check( value, label ) { if ( ! value ) throw new Error( label ); }
function near( a, b, label, tolerance = 1e-8 ) { check( Math.abs( a - b ) <= tolerance, `${label}: ${a} != ${b}` ); }
function bounds( rectangles ) {
 const left = Math.min( ...rectangles.map( r => r.x ) ), top = Math.min( ...rectangles.map( r => r.y ) );
 const right = Math.max( ...rectangles.map( r => r.x + r.width ) ), bottom = Math.max( ...rectangles.map( r => r.y + r.height ) );
 return { left, top, right, bottom, width: right - left, height: bottom - top };
}
cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
const pak = await import( '../src/pak.js' ), wad = await import( '../src/wad.js' );
const raw = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'credits-test-pak0', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
const gfx = pak.COM_FindFile( 'gfx.wad' ).data;
wad.W_LoadWadFile( gfx.buffer.slice( gfx.byteOffset, gfx.byteOffset + gfx.length ) );
const footer = 'github.com/codemeasandwich/Quaked', footerX = ( 320 - footer.length * 8 ) / 2;
function fixture( run ) {
 const rows = new Map(), pictures = [], border = [], rendered = [], opened = [], descriptor = Object.getOwnPropertyDescriptor( globalThis, 'window' ), documentDescriptor = Object.getOwnPropertyDescriptor( globalThis, 'document' ), previousHeight = draw.SCR_GetConHeight();
 Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800, open: url => opened.push( url ) } } );
 try {
  let dest = keys.key_game, dimensions, viewport = { width: 1280, height: 800, dpr: 1 }, transform = [ 1, 0, 0, 1, 0, 0 ];
  const stack = [], context = {
   save() { stack.push( transform.slice() ); }, restore() { transform = stack.pop(); },
   setTransform( ...values ) { transform = values; }, clearRect() {},
   createImageData: ( width, height ) => ( { width, height, data: new Uint8ClampedArray( width * height * 4 ) } ), putImageData() {},
   drawImage( image, ...args ) {
    const [ x, y, width = image.width, height = image.height ] = args.length === 8 ? args.slice( 4 ) : args;
    const char = args.length === 8 ? String.fromCharCode( ( args[ 1 ] / 8 * 16 + args[ 0 ] / 8 ) & 127 ) : undefined;
    rendered.push( { image, char, x: x * transform[ 0 ] + transform[ 4 ], y: y * transform[ 3 ] + transform[ 5 ], width: width * transform[ 0 ], height: height * transform[ 3 ] } );
   },
   fillText( char, x, y ) { rendered.push( { char, x: x * transform[ 0 ], y: y * transform[ 3 ], width: 8 * transform[ 0 ], height: 8 * transform[ 3 ] } ); }
  };
  const canvas = { width: 1280, height: 800, getContext: () => context };
  Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => ( { width: 0, height: 0, getContext: () => context } ) } } );
  draw.Draw_Init( canvas );
  draw.Draw_SetExternals( { vid: { width: 1280, height: 800 } } ); draw.SCR_SetConHeight( 200 );
  const capture = () => { dimensions = [ draw.Draw_GetVirtualWidth(), draw.Draw_GetVirtualHeight() ]; };
  menu.M_SetExternals( { vid: { width: 1280, height: 800 }, key_dest_set: value => { dest = value; }, key_dest_get: () => dest, cls: { demonum: - 1 }, weaponModelsCredit: null,
   Draw_CachePic: path => { const pic = draw.Draw_CachePic( path ); pic.canvas.path = path; return pic; },
   Draw_TransPic: ( x, y, pic ) => { capture(); border.push( { x, y, pic } ); draw.Draw_TransPic( x, y, pic ); }, Draw_FadeScreen() {}, S_LocalSound() {},
   Draw_Pic: ( x, y, pic ) => { capture(); pictures.push( { x, y, pic } ); draw.Draw_Pic( x, y, pic ); },
   Draw_Character: ( x, y, num ) => { capture(); if ( ( num & 127 ) === 10 ) return; check( num >= 0 && num <= 255, 'Japanese uses native picture; glyphs remain ASCII' ); if ( ! rows.has( y ) ) rows.set( y, [] ); rows.get( y ).push( { x, raw: num, char: String.fromCharCode( num & 127 ) } ); draw.Draw_Character( x, y, num ); } } );
  const api = { rows, pictures, opened, rendered, border, context,
   transform: () => transform.slice(),
   resize( width, height, dpr = 1 ) {
    viewport = { width, height, dpr }; Object.assign( window, { innerWidth: width, innerHeight: height, devicePixelRatio: dpr } );
    canvas.width = Math.floor( width * dpr ); canvas.height = Math.floor( height * dpr );
    draw.Draw_SetExternals( { vid: { width, height } } ); menu.M_SetExternals( { vid: { width, height } } );
   },
   renderedBorder: () => bounds( rendered.filter( r => r.image?.path?.startsWith( 'gfx/box_' ) ) ),
   renderedFooter() {
    // White footer is the last native text row submitted by M_Draw.
    return bounds( rendered.filter( r => r.char ).slice( -footer.length ) );
   },
   baselineBorder() {
    const before = rendered.length;
    draw.Draw_WithVirtualSize( 320, 272, () => { for ( const tile of border ) draw.Draw_TransPic( tile.x, tile.y, tile.pic ); } );
    const result = bounds( rendered.slice( before ) ); rendered.length = before; return result;
   },
   draw( pic = null ) { rows.clear(); pictures.length = border.length = rendered.length = 0; draw.Draw_BeginFrame(); menu.M_SetExternals( { weaponModelsCredit: pic } ); cmd.Cmd_ExecuteString( 'menu_credits' ); menu.M_Draw(); },
   text( localY ) { const dy = ( dimensions[ 1 ] - 200 ) >> 1; return rows.get( localY + dy )?.sort( ( a, b ) => a.x - b.x ).map( c => c.char ).join( '' ); },
   dimensions: () => dimensions,
   touchPixel( x, y ) { menu.M_TouchInput( x / viewport.dpr, y / viewport.dpr, viewport.width, viewport.height ); },
   touch( x, y ) {
    const link = api.renderedFooter(), unit = link.width / ( footer.length * 8 );
    api.touchPixel( link.left + ( x - footerX ) * unit, link.top + ( y - 212 ) * unit );
   }
  }; run( api );
 } finally {
  menu.M_SetExternals( { weaponModelsCredit: null, vid: { width: 640, height: 480 } } ); draw.Draw_SetExternals( { vid: { width: 640, height: 480 } } ); draw.SCR_SetConHeight( previousHeight );
  if ( documentDescriptor ) Object.defineProperty( globalThis, 'document', documentDescriptor ); else delete globalThis.document;
  if ( descriptor ) Object.defineProperty( globalThis, 'window', descriptor ); else delete globalThis.window;
 }
}
Deno.test( 'public credits retain contributors, native-size Japanese picture/fallback and centered white footer inside reduced box', () => fixture( api => {
 api.draw(); equal( api.text( 190 ), ' Dannaki (dannaki)', 'ASCII fallback' );
 const pic = { width: 58, height: 8, canvas: { width: 58, height: 8 }, source: 'assets/credits/dannaki-name.png' }; api.draw( pic );
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
Deno.test( 'public credits click maps reduced viewport only to centered footer; Enter and Escape retain navigation', () => fixture( api => {
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
  equal( draw.Draw_GetUIScale(), 1.5, 'temporary credits scale is 75 percent of baseline fit' );
  draw.Draw_WithVirtualSize( 320, 600, () => equal( draw.Draw_GetUIScale(), .375, 'nested scale composes with outer scope' ), .5 ); equal( draw.Draw_GetUIScale(), 1.5, 'outer metrics restored' ); throw error;
 }, .75 ); } catch ( e ) { caught = e; }
 equal( caught, error, 'original error propagated' ); equal( draw.Draw_GetUIScale(), 4, 'normal scale restored after failure' ); equal( draw.Draw_GetVirtualHeight(), 200, 'normal virtual height retained' ); equal( draw.SCR_GetConHeight(), 200, 'preference never changed' );
} ) );

Deno.test( 'public credits render at 75 percent baseline width and height and keep footer touch aligned after DPI and viewport changes', () => fixture( api => {
 for ( const [ width, height, dpr, preference = 200 ] of [ [ 1280, 800, 1 ], [ 853, 601, 1 ], [ 853, 601, 2 ], [ 393, 851, 3 ], [ 601, 853, 2 ], [ 320, 240, 1 ], [ 1279, 799, 3 ], [ 1280, 800, 1, 240 ], [ 853, 601, 2, 480 ], [ 1280, 800, 1 ] ] ) {
  const label = `${width}x${height} DPR ${dpr} conheight ${preference}`; api.resize( width, height, dpr ); draw.SCR_SetConHeight( preference );
  const normalScale = draw.Draw_GetUIScale(), normalWidth = draw.Draw_GetVirtualWidth(), normalHeight = draw.Draw_GetVirtualHeight();
  api.draw( { width: 58, height: 8, canvas: { width: 58, height: 8 } } );
  const box = api.renderedBorder(), baseline = api.baselineBorder(), footer = api.renderedFooter(), unit = box.width / 320;
  const name = api.rendered.find( r => r.image === api.pictures[ 0 ].pic.canvas );
  near( name.width, 58 * unit, `${label} Japanese picture width preserved` ); near( name.height, 8 * unit, `${label} Japanese picture matches glyph height` );
  near( box.width / box.height, 320 / 272, `${label} border aspect preserved` );
  near( box.width / baseline.width, .75, `${label} rendered border width ratio` ); near( box.height / baseline.height, .75, `${label} rendered border height ratio` );
  near( ( box.left + box.right ) / 2, width * dpr / 2, `${label} centered horizontally`, unit );
  near( ( box.top + box.bottom ) / 2, height * dpr / 2, `${label} centered vertically`, unit );
  check( box.left >= 0 && box.top >= 0 && box.right <= width * dpr && box.bottom <= height * dpr, `${label} entire border visible` );
  check( footer.left > box.left && footer.right < box.right && footer.top > box.top && footer.bottom < box.bottom, `${label} footer inside border` );
  for ( const [ x, y ] of [ [ footer.left + .01, footer.top + .01 ], [ footer.right - .01, footer.bottom - .01 ] ] ) {
   cmd.Cmd_ExecuteString( 'menu_credits' ); const count = api.opened.length; api.touchPixel( x, y ); equal( api.opened.length, count + 1, `${label} rendered footer interior opens source` );
  }
  for ( const [ x, y ] of [ [ footer.left - .01, ( footer.top + footer.bottom ) / 2 ], [ footer.right + .01, ( footer.top + footer.bottom ) / 2 ], [ ( footer.left + footer.right ) / 2, footer.top - .01 ], [ ( footer.left + footer.right ) / 2, footer.bottom + .01 ] ] ) {
   cmd.Cmd_ExecuteString( 'menu_credits' ); const count = api.opened.length; api.touchPixel( x, y ); equal( api.opened.length, count, `${label} rendered footer exterior does not open source` ); equal( menu.m_state, menu.m_main, `${label} exterior returns to main` );
  }
  equal( draw.Draw_GetUIScale(), normalScale, `${label} normal scale restored` ); equal( draw.Draw_GetVirtualWidth(), normalWidth, `${label} normal width restored` ); equal( draw.Draw_GetVirtualHeight(), normalHeight, `${label} normal height restored` ); equal( draw.SCR_GetConHeight(), preference, `${label} preference preserved` );
 }
} ) );
Deno.test( 'scoped relative UI sizing restores canvas transform and metrics through nested errors and rejects invalid scales', () => fixture( api => {
 api.context.setTransform( 2, 0, 0, 3, 7, 11 ); const original = api.transform(), error = new Error( 'nested renderer failure' );
 draw.Draw_WithVirtualSize( 320, 272, () => {
  const outer = api.transform(); near( outer[ 0 ], 1.5, 'canvas applies credits scale' );
  let caught; try { draw.Draw_WithVirtualSize( 320, 600, () => { near( api.transform()[ 0 ], .375, 'canvas applies composed nested scale' ); throw error; }, .5 ); } catch ( value ) { caught = value; }
  equal( caught, error, 'nested callback error propagated' ); equal( JSON.stringify( api.transform() ), JSON.stringify( outer ), 'nested error restores outer canvas transform' ); near( draw.Draw_GetUIScale(), 1.5, 'nested error restores outer metrics' );
 }, .75 );
 equal( JSON.stringify( api.transform() ), JSON.stringify( original ), 'outer scope restores caller canvas transform' ); equal( draw.Draw_GetUIScale(), 4, 'outer scope restores normal metrics' );
 for ( const scale of [ 0, -.5, 1.01, NaN, Infinity ] ) { let caught, invoked = false; try { draw.Draw_WithVirtualSize( 9999, 9999, () => { invoked = true; }, scale ); } catch ( error ) { caught = error; } check( caught instanceof RangeError && !invoked, 'invalid scale rejected before callback' ); equal( draw.Draw_GetUIScale(), 4, 'invalid scale leaves metrics unchanged' ); equal( JSON.stringify( api.transform() ), JSON.stringify( original ), 'invalid scale leaves transform unchanged' ); }
} ) );
