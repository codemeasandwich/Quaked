// Newer Game's wall textures: our own higher resolution versions of the original
// pictures (see newer/textures/CREDITS.txt).
//
// newer/textures/index.json lists them by the game's texture names.  A texture is
// loaded the ordinary way first, so the level is never held up; when its
// higher resolution picture has arrived, that replaces the pixels of the very same
// texture object, which every material, lightmap batch and other-level view
// already uses.  The normal map made from the old pixels is dropped so that the
// next frame makes one from the new ones.
//
// Textures that have glowing (fullbright) texels are left alone: their glow is a
// separate map that the new picture would double.

import { R_NewerGame, r_newer_textures } from './r_anim.js';

const BASE = 'newer/textures/';

let index = null; // name -> file
let indexPromise = null;
const pictures = new Map(); // file -> Promise of { data, width, height }

function loadIndex() {

	if ( indexPromise === null ) {

		indexPromise = typeof fetch === 'undefined' ? Promise.resolve( {} ) : fetch( BASE + 'index.json' )
			.then( ( r ) => r.ok ? r.json() : {} )
			.then( ( j ) => { index = j.textures != null ? j.textures : {}; return index; } )
			.catch( () => { index = {}; return index; } );

	}

	return indexPromise;

}

function loadPicture( file ) {

	let p = pictures.get( file );
	if ( p !== undefined ) return p;

	p = new Promise( ( resolve ) => {

		if ( typeof Image === 'undefined' || typeof document === 'undefined' ) return resolve( null );

		const img = new Image();
		img.onload = () => {

			const canvas = document.createElement( 'canvas' );
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
			ctx.drawImage( img, 0, 0 );
			const data = ctx.getImageData( 0, 0, img.width, img.height ).data;
			resolve( { data: new Uint8Array( data.buffer, data.byteOffset, data.byteLength ), width: img.width, height: img.height } );

		};
		img.onerror = () => resolve( null );
		img.src = BASE + file;

	} );

	pictures.set( file, p );
	return p;

}

export function R_NewerTextureUpgrade( name, texture ) {

	if ( texture == null || texture._fullbright != null ) return;
	if ( ! R_NewerGame() || r_newer_textures.value === 0 ) return;

	loadIndex().then( ( idx ) => {

		const file = idx[ name ];
		if ( file === undefined ) return null;
		return loadPicture( file );

	} ).then( ( pic ) => {

		if ( pic == null || texture.userData == null ) return;
		if ( texture.userData.newerPicture === true ) return;

		// the very same texture, with more pixels
		texture.dispose();
		texture.image = { data: pic.data, width: pic.width, height: pic.height };
		texture.userData.newerPicture = true;
		texture.needsUpdate = true;

		if ( texture._normalMap != null ) {

			texture._normalMap.dispose();
			texture._normalMap = undefined;

		}

	} );

}
