// The intermission overlays draw only with the drawing functions they have, as the rest of the status bar does (card
// [44m], item 18): the ranking and "complete" pictures called Draw_Pic without checking it was given. Through the
// public Sbar_SetExternals and Sbar_IntermissionOverlay, before a Draw_Pic is installed, in single player and
// deathmatch.
import * as sbar from '../src/engine/client/sbar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const pic = { width: 64, height: 32 };

Deno.test( 'the intermission overlay without a Draw_Pic draws what it can and does not throw', () => {
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { innerWidth: 640, innerHeight: 400, devicePixelRatio: 1 } } );
	try { overlays(); } finally { if ( saved ) Object.defineProperty( globalThis, 'window', saved ); else delete globalThis.window; }
} );

function overlays() {
	const drawn = [];
	const cl = { gametype: 0, stats: new Array( 32 ).fill( 0 ), completed_time: 75, time: 80, intermission: 1, maxclients: 1, scores: [] };
	sbar.Sbar_SetExternals( { cl, vid: { width: 320, height: 200, numpages: 1 }, Draw_CachePic: () => pic, Draw_TransPic: () => drawn.push( 'trans' ),
		Draw_Character: () => {}, Draw_Fill: () => {} } );
	sbar.Sbar_IntermissionOverlay(); // single player: complete.lmp, then the times
	check( drawn.length > 0, 'the transparent pictures are drawn' );
	cl.gametype = 1; // deathmatch: the ranking
	sbar.Sbar_IntermissionOverlay();
}
