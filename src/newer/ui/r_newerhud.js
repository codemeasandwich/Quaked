/**
 * @module newer/ui/r_newerhud
 *
 * Newer Game's status bar graphics: higher-resolution versions of the original sprites.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `index`, `indexPromise`, `version`, `indexState`, `preloadState`,
 * `preloadPromise`; 3 module-level collections (Map/Set).
 *
 * Errors: throws at 1 place; catches at 3 places.
 */
// Newer Game's status bar graphics: our own higher resolution versions of the
// original sprites (see newer/hud/CREDITS.txt).
//
// newer/hud/index.json lists them by the game's own names (face1, num_0 ...).  A
// sprite is drawn the ordinary way until its higher resolution picture has arrived;
// the picture is still laid out at the sprite's original size, so nothing moves.

import { R_NewerGame, r_newer_hud } from '../render/r_anim.js';
import { COM_NewerJSON, COM_NewerURL } from '../../engine/common/pak.js';
import { R_PlayerFacePreload, R_PlayerFaceStatus } from './r_playerface.js';

const BASE = 'newer/hud/';

let index = null; // name -> file
let indexPromise = null;
let version = '0';
const canvases = new Map(); // file -> canvas or null (not there)
const resolvedCanvases = new Map(); // terminal canvas/null, available synchronously after preload
export const NEWER_HUD_TIMEOUT_MS = 30000;
let indexState = 'idle', preloadState = 'idle', preloadPromise = null;
const canvasStates = new Map(), errors = new Map();

function loadIndex() {

	if ( indexPromise === null ) {

		indexState = 'loading'; let timer;
		indexPromise = Promise.race( [ COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' ), new Promise( ( _, reject ) => {
			timer = setTimeout( () => reject( new Error( 'HUD index timed out' ) ), NEWER_HUD_TIMEOUT_MS );
		} ) ] ).then( ( j ) => { if ( ! j.sprites ) throw new Error( 'Missing HUD manifest' ); index = j.sprites; version = String( j.version ); indexState = 'ready'; return index; } )
			.catch( error => { errors.set( 'index', String( error.message || error ) ); indexState = 'fallback'; index = {}; return index; } )
			.finally( () => clearTimeout( timer ) );

	}

	return indexPromise;

}

function loadCanvas( file ) {

	if ( canvases.has( file ) ) return canvases.get( file );
	canvasStates.set( file, 'loading' );
	const request = new Promise( ( resolve ) => {

		if ( typeof Image === 'undefined' || typeof document === 'undefined' ) { canvasStates.set( file, 'fallback' ); resolvedCanvases.set( file, null ); errors.set( file, 'HUD image transport unavailable' ); return resolve( null ); }

		const img = new Image();
		let terminal = false;
		const finish = ( canvas, error ) => { if ( terminal ) return; terminal = true; clearTimeout( timer ); img.onload = img.onerror = null;
			canvasStates.set( file, canvas ? 'ready' : 'fallback' ); resolvedCanvases.set( file, canvas ); if ( error ) errors.set( file, String( error.message || error ) ); resolve( canvas ); };
		const timer = setTimeout( () => { finish( null, new Error( file + ' timed out' ) ); img.src = ''; }, NEWER_HUD_TIMEOUT_MS );
		img.onload = () => {

			if ( terminal ) return;
			try {
			const c = document.createElement( 'canvas' );
			c.width = img.width;
			c.height = img.height;
			c.getContext( '2d' ).drawImage( img, 0, 0 );
			finish( c );
			} catch ( error ) { finish( null, error ); }

		};
		img.onerror = () => finish( null, new Error( 'HUD image unavailable: ' + file ) );
		try { img.src = COM_NewerURL( BASE + file, BASE + file + '?v=' + version ); } catch ( error ) { finish( null, error ); }

	} );
	canvases.set( file, request ); return request;

}

// The full console intentionally skips Sbar draws. Start these same cached
// catalog requests before drawing, so startup cannot reveal a second wave.
export function R_NewerHudPreload() {
	if ( ! preloadPromise ) {
		preloadState = 'loading';
		preloadPromise = Promise.all( [
			loadIndex().then( entries => Promise.all( [ ...new Set( Object.values( entries ) ) ].map( loadCanvas ) ) ),
			R_PlayerFacePreload()
		] ).then( ( [ values ] ) => { preloadState = errors.size || R_PlayerFaceStatus().errors.length ? 'fallback' : 'ready'; return values; } );
	}
	return preloadPromise;
}

export function R_NewerHudStatus() {
	const face = R_PlayerFaceStatus();
	let pending = 0, ready = 0, fallback = 0;
	for ( const value of canvasStates.values() ) { if ( value === 'loading' ) pending ++; else if ( value === 'ready' ) ready ++; else fallback ++; }
	if ( indexState === 'loading' ) pending ++;
	return { preload: preloadState, index: indexState, pending: pending + face.pending, ready, fallback, face,
		settled: indexState !== 'loading' && preloadState !== 'loading' && pending === 0 && face.settled, errors: Object.fromEntries( errors ) };
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
	// Preload can complete behind a console without this picture ever being
	// drawn. Return its already-decoded canvas on the very first visible lookup.
	if ( index !== null ) {
		const file = index[ pic._name ];
		if ( file === undefined ) { pic._hi = null; return null; }
		if ( resolvedCanvases.has( file ) ) { pic._hi = resolvedCanvases.get( file ); return pic._hi; }
	}
	if ( pic._asked === true ) return null;
	pic._asked = true;

	loadIndex().then( ( idx ) => {

		const file = idx[ pic._name ];
		if ( file === undefined ) { pic._hi = null; return; }

		return loadCanvas( file ).then( ( c ) => { pic._hi = c; } );

	} );

	return null;

}
