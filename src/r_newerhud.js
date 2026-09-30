// Newer Game's status bar graphics: our own higher resolution versions of the
// original sprites (see newer/hud/CREDITS.txt).
//
// newer/hud/index.json lists them by the game's own names (face1, num_0 ...).  A
// sprite is drawn the ordinary way until its higher resolution picture has arrived;
// the picture is still laid out at the sprite's original size, so nothing moves.

import { R_NewerGame, r_newer_hud } from './r_anim.js';

const BASE = 'newer/hud/';

let index = null; // name -> file
let indexPromise = null;
let version = '0';
const canvases = new Map(); // file -> canvas or null (not there)

function loadIndex() {

	if ( indexPromise === null ) {

		indexPromise = typeof fetch === 'undefined' ? Promise.resolve( {} ) : fetch( BASE + 'index.json', { cache: 'no-cache' } )
			.then( ( r ) => r.ok ? r.json() : {} )
			.then( ( j ) => { index = j.sprites != null ? j.sprites : {}; version = String( j.version ); return index; } )
			.catch( () => { index = {}; return index; } );

	}

	return indexPromise;

}

function loadCanvas( file ) {

	return new Promise( ( resolve ) => {

		if ( typeof Image === 'undefined' || typeof document === 'undefined' ) return resolve( null );

		const img = new Image();
		img.onload = () => {

			const c = document.createElement( 'canvas' );
			c.width = img.width;
			c.height = img.height;
			c.getContext( '2d' ).drawImage( img, 0, 0 );
			resolve( c );

		};
		img.onerror = () => resolve( null );
		img.src = BASE + file + '?v=' + version;

	} );

}

/*
================
R_NewerHudCanvas

The higher resolution picture of a sprite that came from the game's wad (pic._name),
or null: not in Newer Game, switched off, no such picture or not arrived yet.
Asks for it the first time.
================
*/
export function R_NewerHudCanvas( pic ) {

	if ( pic._name === undefined || ! R_NewerGame() || r_newer_hud.value === 0 ) return null;
	if ( pic._hi !== undefined ) return pic._hi;
	if ( pic._asked === true ) return null;
	pic._asked = true;

	loadIndex().then( ( idx ) => {

		const file = idx[ pic._name ];
		if ( file === undefined ) { pic._hi = null; return; }

		if ( ! canvases.has( file ) ) canvases.set( file, loadCanvas( file ) );
		return canvases.get( file ).then( ( c ) => { pic._hi = c; } );

	} );

	return null;

}
