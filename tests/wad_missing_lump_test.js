// A picture the WAD lacks is reported and skipped without ending the page (card [44m], item 17). Draw_PicFromWad
// caught W_GetLumpName's error, but that came from Sys_Error, which in a browser had already replaced the page with
// its message. Through the public W_LoadWadFile, W_FindLumpinfo and Draw_PicFromWad on the shareware pack's gfx.wad,
// with a page stand-in whose body would show the Sys_Error.
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { W_LoadWadFile, W_FindLumpinfo, W_GetLumpinfo } from '../src/engine/common/wad.js';
import { Draw_PicFromWad } from '../src/engine/render/gl_draw.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

Deno.test( 'Draw_PicFromWad on a lump the WAD lacks is null, and the page is left alone', () => {
	const wad = pak.COM_FindFile( 'gfx.wad' );
	W_LoadWadFile( wad.data.buffer.slice( wad.data.byteOffset, wad.data.byteOffset + wad.data.length ) );
	check( W_FindLumpinfo( 'num_0' ) !== null, 'a lump the WAD has is found' );
	same( W_FindLumpinfo( 'no_such_pic' ), null, 'one it lacks is null' );
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	const page = { body: { innerHTML: 'the game' } };
	Object.defineProperty( globalThis, 'document', { configurable: true, value: page } );
	try {
		same( Draw_PicFromWad( 'no_such_pic' ), null, 'no picture' );
		same( page.body.innerHTML, 'the game', 'no Sys_Error replaced the page' );
		let fatal = null; try { W_GetLumpinfo( 'no_such_pic' ); } catch ( e ) { fatal = e.message; }
		same( fatal, 'W_GetLumpinfo: no_such_pic not found', 'W_GetLumpinfo itself is still fatal, as WinQuake\'s' );
	} finally { if ( saved ) Object.defineProperty( globalThis, 'document', saved ); else delete globalThis.document; }
} );
