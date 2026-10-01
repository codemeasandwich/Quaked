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
// Textures with glowing (fullbright) texels keep their glow: the glow is a separate
// map (the picture's glowing part, drawn at full brightness whatever the light), so
// the original glowing area, enlarged, picks the glowing part out of the new picture.

import { R_NewerGame, r_newer_textures } from './r_anim.js';
import { COM_NewerJSON, COM_NewerURL } from './pak.js';
import * as THREE from 'three';
import { gl_texturemode } from './glquake.js';

// the textures that have been given their Newer picture, so they can be put back (r_demosplit.js)
const upgraded = new Set();

const BASE = 'newer/textures/';

let index = null; // name -> file
let normals = {}; // name -> { file, strength }: the height map crafted for the texture (tools/craft_normals.py)
let version = '0'; // changes whenever a picture does, so the browser fetches the new one
let indexPromise = null;
const pictures = new Map(); // file -> Promise of { data, width, height }

function loadIndex() {

	if ( indexPromise === null ) {

		indexPromise = COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' )
			.then( ( j ) => { index = j.textures != null ? j.textures : {}; normals = j.normals != null ? j.normals : {}; version = String( j.version ); return index; } )
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
		img.src = COM_NewerURL( BASE + file, BASE + file + '?v=' + version );

	} );

	pictures.set( file, p );
	return p;

}

export function R_NewerTextureUpgrade( name, texture ) {

	if ( texture == null ) return;
	if ( ! R_NewerGame() || r_newer_textures.value === 0 ) return;
	if ( texture.userData == null || texture.userData.newerPicture === true || texture.userData.newerPending === true ) return;
	texture.userData.newerPending = true;

	loadIndex().then( ( idx ) => {

		const file = idx[ name ];
		if ( file === undefined ) return null;

		// the picture and, when there is one, its crafted height map
		const crafted = normals[ name ];
		return Promise.all( [ loadPicture( file ), crafted !== undefined ? loadPicture( crafted.file ) : null ] )
			.then( ( [ pic, heightPic ] ) => ( pic == null ? null : { pic, heightPic, crafted } ) );

	} ).then( ( loaded ) => {

		texture.userData.newerPending = false;
		if ( loaded == null ) return;
		const pic = loaded.pic;

		if ( loaded.heightPic != null && loaded.heightPic.width === pic.width && loaded.heightPic.height === pic.height ) {

			// the red of the grey picture is the height
			const h = new Float32Array( pic.width * pic.height );
			for ( let i = 0; i < h.length; i ++ ) h[ i ] = loaded.heightPic.data[ i * 4 ] / 255;
			texture.userData.newerHeight = { file: loaded.crafted.file, strength: loaded.crafted.strength, cap: loaded.crafted.cap || 1.1, data: h, width: pic.width, height: pic.height };

		}

		let data = pic.data;

		// the glowing part: where the original glowed, enlarged smoothly
		const fb = texture._fullbright;
		if ( fb != null && fb.image != null && fb.image.data != null && typeof document !== 'undefined' ) {

			if ( fb.userData.classicImage === undefined ) fb.userData.classicImage = fb.image;
			const own = GLOW_FROM_PICTURE[ name ];
			const split = own !== undefined ? R_GlowFromPicture( pic, own ) : splitGlow( fb.image, pic );
			data = split.diffuse;
			fb.dispose();
			fb.image = { data: split.glow, width: pic.width, height: pic.height };
			fb.needsUpdate = true;

		}

		// the original pixels are kept: the classic half of the title demo draws with them, and a classic game
		// after a Newer one has them back
		if ( texture.userData.classicImage === undefined ) texture.userData.classicImage = texture.image;
		if ( fb != null && fb.userData.classicImage === undefined ) fb.userData.classicImage = fb.image;
		upgraded.add( texture );

		// the very same texture, with more pixels
		texture.dispose();
		texture.image = { data, width: pic.width, height: pic.height };
		texture.userData.newerPicture = true;
		texture.needsUpdate = true;

		if ( texture._normalMap != null ) {

			texture._normalMap.dispose();
			texture._normalMap = undefined;

		}

	} );

}

let appliedFor = null;
let appliedOn = false;

/*
================
R_NewerTexturesFrame

Called every frame with the level being played: whenever the level, Newer Game or
the option changes, every texture of the level gets its higher resolution picture
(if it has one and has not already), whichever way the level came to be loaded.
================
*/
export function R_NewerTexturesFrame( worldmodel ) {

	const on = R_NewerGame() && r_newer_textures.value !== 0;
	if ( worldmodel === appliedFor && on === appliedOn ) return;

	appliedFor = worldmodel;
	appliedOn = on;
	if ( on ) R_NewerTexturesForModel( worldmodel );

}

// every texture of a level (or of a level seen from another)
export function R_NewerTexturesForModel( model ) {

	if ( model == null || model.textures == null || ! R_NewerGame() || r_newer_textures.value === 0 ) return;

	for ( const t of model.textures ) {

		if ( t == null || t.gl_texture == null || t.name.charAt( 0 ) === '*' || t.name.slice( 0, 3 ) === 'sky' ) continue;
		R_NewerTextureUpgrade( t.name, t.gl_texture );

	}

}

// the new picture, as [ the lit part, the glowing part ] the way the loader splits a
// texture with fullbright texels: the glowing pixels are black in the lit part
function splitGlow( fbImage, pic ) {

	const w = fbImage.width, h = fbImage.height;
	const small = document.createElement( 'canvas' );
	small.width = w;
	small.height = h;
	const sctx = small.getContext( '2d' );
	const mask = sctx.createImageData( w, h );
	for ( let i = 0; i < w * h; i ++ ) {

		const on = fbImage.data[ i * 4 + 3 ] > 0 ? 255 : 0;
		mask.data[ i * 4 ] = mask.data[ i * 4 + 1 ] = mask.data[ i * 4 + 2 ] = on;
		mask.data[ i * 4 + 3 ] = 255;

	}

	sctx.putImageData( mask, 0, 0 );

	const big = document.createElement( 'canvas' );
	big.width = pic.width;
	big.height = pic.height;
	const bctx = big.getContext( '2d', { willReadFrequently: true } );
	bctx.imageSmoothingEnabled = true;
	bctx.imageSmoothingQuality = 'high';
	bctx.drawImage( small, 0, 0, pic.width, pic.height );
	const grown = bctx.getImageData( 0, 0, pic.width, pic.height ).data;

	const diffuse = new Uint8Array( pic.data );
	const glow = new Uint8Array( pic.data.length );

	for ( let i = 0; i < pic.width * pic.height; i ++ ) {

		if ( grown[ i * 4 ] < 128 ) continue;

		glow[ i * 4 ] = pic.data[ i * 4 ];
		glow[ i * 4 + 1 ] = pic.data[ i * 4 + 1 ];
		glow[ i * 4 + 2 ] = pic.data[ i * 4 + 2 ];
		glow[ i * 4 + 3 ] = 255;
		diffuse[ i * 4 ] = diffuse[ i * 4 + 1 ] = diffuse[ i * 4 + 2 ] = 0;

	}

	return { diffuse, glow };

}

// Pictures whose lit parts are not where the original's were (a redrawn texture): the glow is
// taken from the new picture itself, its strong red, inside a box given as fractions of the picture
// (so the hazard stripes beside the lights do not glow).
const GLOW_FROM_PICTURE = {
	'+0_box_side': { x0: 0.3, x1: 0.7 },
	'+1_box_side': { x0: 0.3, x1: 0.7 }
};

export function R_GlowFromPicture( pic, box ) {

	const diffuse = new Uint8Array( pic.data );
	const glow = new Uint8Array( pic.data.length );
	const { width: w, height: h } = pic;

	for ( let y = 0; y < h; y ++ ) {

		for ( let x = 0; x < w; x ++ ) {

			if ( x < box.x0 * w || x >= box.x1 * w ) continue;

			const i = ( y * w + x ) * 4;
			const r = pic.data[ i ], g = pic.data[ i + 1 ], b = pic.data[ i + 2 ];
			if ( r < 140 || r < g * 2.2 || r < b * 2.2 ) continue;

			glow[ i ] = r; glow[ i + 1 ] = g; glow[ i + 2 ] = b; glow[ i + 3 ] = 255;
			diffuse[ i ] = diffuse[ i + 1 ] = diffuse[ i + 2 ] = 0;

		}

	}

	return { diffuse, glow };

}

// Has this texture got the picture it is going to have?  (Not while the list of pictures
// or its picture is still on the way.)
export function R_NewerTextureSettled( name, texture ) {

	if ( ! R_NewerGame() || r_newer_textures.value === 0 || texture == null ) return true;
	if ( index === null ) return false;
	if ( index[ name ] === undefined ) return true;
	return texture.userData != null && texture.userData.newerPicture === true;

}


// A separate native texture also avoids inheriting Newer Game's forced linear
// filtering on artwork that was never replaced. Honour the user's native filter.
export function R_ClassicTexture( texture ) {

	if ( texture == null ) return texture;
	if ( texture.userData.classicBase ) return R_ClassicTexture( texture.userData.classicBase );

	let twin = texture.userData.classicTwin;
	if ( twin === undefined ) {

		const img = texture.userData.classicImage || texture.image;
		twin = texture.isDataTexture ? new THREE.DataTexture( img.data, img.width, img.height, texture.format, texture.type ) : new THREE.Texture( img );
		twin.wrapS = texture.wrapS;
		twin.wrapT = texture.wrapT;
		twin.flipY = texture.flipY;
		twin.colorSpace = texture.colorSpace;
		twin.magFilter = THREE.NearestFilter;
		twin.minFilter = THREE.NearestMipmapLinearFilter;
		twin.generateMipmaps = texture.generateMipmaps;
		twin.offset.copy( texture.offset );
		twin.repeat.copy( texture.repeat );
		twin.needsUpdate = true;
		texture.userData.classicTwin = twin;
		twin.userData.classicSourceVersion = texture.version;
		texture.addEventListener( 'dispose', () => { twin.dispose(); delete texture.userData.classicTwin; } );

	}

	const linear = gl_texturemode.value !== 0;
	if ( ! texture.userData.classicImage && twin.userData.classicSourceVersion !== texture.version ) {

		twin.image = texture.image; twin.needsUpdate = true;
		twin.userData.classicSourceVersion = texture.version;

	}
	const mag = linear ? THREE.LinearFilter : THREE.NearestFilter;
	const min = twin.generateMipmaps ? ( linear ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapLinearFilter ) : mag;
	if ( twin.magFilter !== mag || twin.minFilter !== min ) {

		twin.magFilter = mag; twin.minFilter = min; twin.anisotropy = 1;
		twin.needsUpdate = true;

	}
	twin.offset.copy( texture.offset ); twin.repeat.copy( texture.repeat );
	return twin;

}

// every texture back to its original pixels (the Newer picture is fetched again if Newer Game is played)
export function R_NewerTexturesRevert() {

	for ( const t of upgraded ) {

		if ( t.userData.classicImage === undefined ) continue;
		t.dispose();
		t.image = t.userData.classicImage;
		t.userData.newerPicture = false;
		t.userData.newerHeight = undefined;
		t.needsUpdate = true;
		if ( t._normalMap != null ) { t._normalMap.dispose(); t._normalMap = undefined; }

		const fb = t._fullbright;
		if ( fb != null && fb.userData.classicImage !== undefined ) {

			fb.dispose();
			fb.image = fb.userData.classicImage;
			fb.needsUpdate = true;

		}

	}

	upgraded.clear();

}
