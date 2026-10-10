// Real decoded pak0 glyph pixels, public menu-art builder and gl_draw cache.
// Uses the supported Canvas2D runtime, without launching the browser or game.
import { readFileSync } from 'node:fs';
import { BuildMenuTextArt } from '../src/menu_art.js';
import * as draw from '../src/gl_draw.js';
import * as pak from '../src/engine/common/pak.js';
import * as wad from '../src/engine/common/wad.js';
import * as vid from '../src/vid.js';
const canvasAPI = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
const check = ( value, message ) => { if ( !value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const labels = { previous: '< PREVIOUS', open: 'OPEN >', next: 'NEXT >', exit: 'ESC - MAIN MENU' };
Deno.test( 'book navigation cache recovers after cold source, copies exact native pixels and reuses four pictures per decoded atlas', () => {
 const descriptors = Object.fromEntries( [ 'document', 'window' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
 const created = [];
 Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => { const canvas = canvasAPI.createCanvas( 1, 1 ); created.push( canvas ); return canvas; } } } );
 Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1 } } );
 try {
  same( draw.Draw_CacheBookNavigation(), null, 'no decoded source before Draw_Init' ); same( draw.Draw_CacheBookNavigation(), null, 'cold retry remains safe' ); same( created.length, 0, 'cold access allocates nothing' );
  const bytes = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
  pak.COM_AddPack( pak.COM_LoadPackFile( 'book-navigation-native-source', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) );
  const gfx = pak.COM_FindFile( 'gfx.wad' ).data; wad.W_LoadWadFile( gfx.buffer.slice( gfx.byteOffset, gfx.byteOffset + gfx.length ) );
  const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data; vid.VID_SetPalette( palette );
  const lump = wad.W_GetLumpName( 'conchars' ), native = lump.data.subarray( lump.offset, lump.offset + lump.size );
  draw.Draw_Init( canvasAPI.createCanvas( 640, 480 ) );
  const atlas = created.find( canvas => canvas.width === 128 && canvas.height === 128 ); check( atlas, 'real Draw_Init decoded native atlas' );
  const original = atlas.getContext( '2d' ).getImageData( 0, 0, 128, 128 ).data.slice();
  const count = created.length, pics = draw.Draw_CacheBookNavigation(); same( created.length - count, 4, 'first ready call creates exactly four images' ); same( Object.keys( pics ).sort().join(), Object.keys( labels ).sort().join(), 'fixed supported labels only' );
  for ( const [ key, text ] of Object.entries( labels ) ) {
   const pic = pics[ key ]; same( pic.width, text.length * 8, key + ' native cell width' ); same( pic.height, 8, key + ' native height' );
   const pixels = pic.canvas.getContext( '2d' ).getImageData( 0, 0, pic.width, pic.height ).data; let ink = 0, transparent = 0;
   for ( let y = 0; y < 8; y ++ ) for ( let x = 0; x < pic.width; x ++ ) {
    const code = text.charCodeAt( Math.floor( x / 8 ) ), index = native[ ( ( code >> 4 ) * 8 + y ) * 128 + ( code & 15 ) * 8 + x % 8 ], offset = ( y * pic.width + x ) * 4;
    for ( let channel = 0; channel < 3; channel ++ ) same( pixels[ offset + channel ], index ? palette[ index * 3 + channel ] : 0, `${key} native pixel ${x},${y} channel ${channel}` );
    same( pixels[ offset + 3 ], index ? 255 : 0, key + ' native transparency' ); if ( index ) ink ++; else transparent ++;
   }
   check( ink > 0 && transparent > 0, key + ' has native ink on a transparent background' );
  }
  for ( let frame = 0; frame < 20; frame ++ ) same( draw.Draw_CacheBookNavigation(), pics, 'warm calls return same collection' ); same( created.length, count + 4, 'warm calls allocate no additional pictures' );
  const after = atlas.getContext( '2d' ).getImageData( 0, 0, 128, 128 ).data; check( after.every( ( value, index ) => value === original[ index ] ), 'building labels leaves original glyph atlas unchanged' );
  draw.Draw_Init( canvasAPI.createCanvas( 640, 480 ) ); const replacementCount = created.length, replacement = draw.Draw_CacheBookNavigation(); check( replacement !== pics, 'newly decoded atlas invalidates old label collection' ); same( created.length, replacementCount + 4, 'replacement atlas builds exactly four images' );
  for ( const key of Object.keys( labels ) ) check( replacement[ key ].canvas !== pics[ key ].canvas, key + ' follows replacement atlas identity' ); same( draw.Draw_CacheBookNavigation(), replacement, 'replacement cache stays stable' );
 } finally { for ( const [ key, descriptor ] of Object.entries( descriptors ) ) { if ( descriptor ) Object.defineProperty( globalThis, key, descriptor ); else delete globalThis[ key ]; } }
} );
Deno.test( 'native menu text builder rejects unsupported strings and leaves absent or invalid atlas recoverable', () => {
 let allocations = 0; const make = () => { allocations ++; return canvasAPI.createCanvas( 1, 1 ); };
 for ( const source of [ null, { width: 64, height: 128 }, { width: 128, height: 64 } ] ) same( BuildMenuTextArt( source, 'NEXT >', make ), null, 'unavailable native atlas is optional' ); same( allocations, 0, 'missing sources allocate nothing' );
 const atlas = canvasAPI.createCanvas( 128, 128 );
 for ( const text of [ '', 'x'.repeat( 65 ), 'NEXT →', '\n', 'é', null ] ) { let caught; try { BuildMenuTextArt( atlas, text, make ); } catch ( error ) { caught = error; } check( caught instanceof RangeError, 'unsupported native label rejected' ); }
 same( allocations, 0, 'invalid text allocates nothing' ); check( BuildMenuTextArt( atlas, 'NEXT >', make ), 'later valid source/text still builds' ); same( allocations, 1, 'successful recovery creates one canvas' );
} );
