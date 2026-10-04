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
const scalarFiles = new Map(); // optional saved16-bit linear heights
export const NEWER_TEXTURE_TIMEOUT_MS = 30000;
let indexState = 'idle', indexError = null;
const assetErrors = new Map();
function bounded( promise, label, cancel = () => {} ) {
	let timer;
	return Promise.race( [ promise, new Promise( ( _, reject ) => { timer = setTimeout( () => { cancel(); reject( new Error( label + ' timed out' ) ); }, NEWER_TEXTURE_TIMEOUT_MS ); } ) ] ).finally( () => clearTimeout( timer ) );
}

function loadScalar( file ) {

	if ( ! file ) return Promise.resolve( null );
	let request = scalarFiles.get( file );
	if ( ! request ) {

		const controller = new AbortController();
		request = bounded( fetch( COM_NewerURL( BASE + file, BASE + file + '?v=' + version ), { signal: controller.signal } )
			.then( response => { if ( ! response.ok ) throw new Error( 'Height scalar unavailable: ' + file ); return response.arrayBuffer(); } ), file, () => controller.abort() )
			.catch( error => { assetErrors.set( file, String( error.message || error ) ); return null; } );
		scalarFiles.set( file, request );

	}
	return request;

}

function loadIndex() {

	if ( indexPromise === null ) {

		indexState = 'loading';
		indexPromise = bounded( COM_NewerJSON( BASE + 'index.json', BASE + 'index.json' ), 'Texture index' )
			.then( ( j ) => { if ( ! j.textures ) throw new Error( 'Missing texture manifest' ); index = j.textures; normals = j.normals || {}; version = String( j.version ); indexState = 'ready'; return index; } )
			.catch( error => { indexError = String( error.message || error ); indexState = 'fallback'; index = {}; return index; } );

	}

	return indexPromise;

}

function loadPicture( file ) {

	let p = pictures.get( file );
	if ( p !== undefined ) return p;

	p = new Promise( ( resolve ) => {

		if ( typeof Image === 'undefined' || typeof document === 'undefined' ) return resolve( null );

		const img = new Image();
		let terminal = false;
		const finish = ( value, error ) => { if ( terminal ) return; terminal = true; clearTimeout( timer ); img.onload = img.onerror = null; if ( error ) assetErrors.set( file, String( error.message || error ) ); resolve( value ); };
		const timer = setTimeout( () => { finish( null, new Error( file + ' timed out' ) ); img.src = ''; }, NEWER_TEXTURE_TIMEOUT_MS );
		img.onload = () => {

			if ( terminal ) return;
			try {
			const canvas = document.createElement( 'canvas' );
			canvas.width = img.width;
			canvas.height = img.height;
			const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
			ctx.drawImage( img, 0, 0 );
			const data = ctx.getImageData( 0, 0, img.width, img.height ).data;
			finish( { data: new Uint8Array( data.buffer, data.byteOffset, data.byteLength ), width: img.width, height: img.height } );
			} catch ( error ) { finish( null, error ); }

		};
		img.onerror = () => finish( null, new Error( 'Texture unavailable: ' + file ) );
		img.src = COM_NewerURL( BASE + file, BASE + file + '?v=' + version );

	} );

	pictures.set( file, p );
	return p;

}

export function R_NewerTextureUpgrade( name, texture ) {

	if ( texture == null ) return;
	if ( ! R_NewerGame() || r_newer_textures.value === 0 ) return;
	if ( texture.userData == null || texture.userData.newerPicture === true || texture.userData.newerPending === true || texture.userData.newerFallback === true ) return;
	texture.userData.newerPending = true;

	loadIndex().then( ( idx ) => {

		const file = idx[ name ];
		if ( file === undefined ) return null;

		// the picture and, when there is one, its crafted height map
		const crafted = normals[ name ];
		return Promise.all( [ loadPicture( file ), crafted !== undefined ? loadPicture( crafted.file ) : null,
			crafted?.edgeSource ? loadPicture( crafted.edgeSource.file ) : null, loadScalar( crafted?.dataFile ) ] )
			.then( ( [ pic, heightPic, edgePic, scalar ] ) => ( pic == null ? null : { pic, heightPic, edgePic, scalar, crafted } ) );

	} ).then( ( loaded ) => {

		texture.userData.newerPending = false;
		if ( loaded == null ) { texture.userData.newerFallback = true; return; }
		const pic = loaded.pic;

		if ( loaded.heightPic != null && loaded.heightPic.width === pic.width && loaded.heightPic.height === pic.height ) {

			// the red of the grey picture is the height
			const h = new Float32Array( pic.width * pic.height );
			for ( let i = 0; i < h.length; i ++ ) h[ i ] = loaded.heightPic.data[ i * 4 ] / 255;
			const scalarReady = loaded.scalar?.byteLength === h.length * 2;
			if ( scalarReady ) {

				const view = new DataView( loaded.scalar );
				for ( let i = 0; i < h.length; i ++ ) h[ i ] = view.getUint16( i * 2, true ) / 65535;

			}
			texture.userData.newerHeight = { file: loaded.crafted.file, strength: loaded.crafted.strength, cap: loaded.crafted.cap || 1.1, data: h, width: pic.width, height: pic.height };
			texture.userData.newerHeight.dataFile = scalarReady ? loaded.crafted.dataFile : undefined;
			texture.userData.newerHeight.sampling = loaded.crafted.sampling === 'clamp' ? 'clamp' : 'repeat';
			const displacement = loaded.crafted.displacement;
			if ( displacement && ( ! loaded.crafted.dataFile || scalarReady ) && Number.isFinite( displacement.depth ) && displacement.depth > 0 && displacement.depth <= 24 &&
				Number.isFinite( displacement.step ) && displacement.step >= .5 && displacement.step <= 4 &&
				( displacement.smoothing === undefined || Number.isFinite( displacement.smoothing ) && displacement.smoothing >= 0 && displacement.smoothing <= 2 ) )
				texture.userData.newerHeight.displacement = { depth: displacement.depth, step: displacement.step, smoothing: displacement.smoothing || 0 };
			const relief = loaded.crafted.relief;
			if ( relief && Number.isFinite( relief.depth ) && relief.depth >= .02 && relief.depth <= .12 &&
				Number.isInteger( relief.layers ) && relief.layers >= 10 && relief.layers <= 48 &&
				Number.isFinite( relief.cavityFloor ) && relief.cavityFloor >= 0 && relief.cavityFloor <= 1 &&
				Number.isFinite( relief.cavityScale ) && relief.cavityScale >= 0 && relief.cavityScale <= 8 &&
				Number.isFinite( relief.cavityMin ) && relief.cavityMin >= .08 && relief.cavityMin <= 1 ) {

				texture.userData.newerHeight.relief = { depth: relief.depth, layers: relief.layers, cavityFloor: relief.cavityFloor, cavityScale: relief.cavityScale, cavityMin: relief.cavityMin };

			}
			if ( loaded.edgePic ) {

				const e = loaded.edgePic, data = new Float32Array( e.width * e.height );
				for ( let i = 0; i < data.length; i ++ ) data[ i ] = e.data[ i * 4 ] / 255;
				texture.userData.newerHeight.edgeSource = { ...loaded.crafted.edgeSource, data, width: e.width, height: e.height };

			}

		}

		let data = pic.data;

		// the glowing part: where the original glowed, enlarged smoothly
		const own = GLOW_FROM_PICTURE[ name ];
		let fb = texture._fullbright;
		if ( own && fb == null ) {

			// These native demon textures have no fullbright palette pixels.
			// Keep a transparent native image for the isolated Classic twin.
			fb = new THREE.DataTexture( new Uint8Array( texture.image.width * texture.image.height * 4 ), texture.image.width, texture.image.height, THREE.RGBAFormat );
			fb.wrapS = texture.wrapS; fb.wrapT = texture.wrapT;
			fb.offset.copy( texture.offset ); fb.repeat.copy( texture.repeat );
			fb.flipY = texture.flipY; fb.colorSpace = THREE.SRGBColorSpace;
			fb.magFilter = THREE.LinearFilter; fb.minFilter = THREE.LinearMipmapLinearFilter;
			fb.generateMipmaps = true; fb.userData.newerCreated = true;
			texture._fullbright = fb;
			texture.addEventListener( 'dispose', () => fb.dispose() );

		}
		if ( fb != null && fb.image != null && fb.image.data != null && typeof document !== 'undefined' ) {

			if ( fb.userData.classicImage === undefined ) fb.userData.classicImage = fb.image;
			const split = own !== undefined ? R_GlowFromPicture( pic, own ) : splitGlow( fb.image, pic );
			data = split.diffuse;
			fb.dispose();
			fb.image = { data: split.glow, width: pic.width, height: pic.height };
			fb.needsUpdate = true;
			texture.userData.newerGlowBoost = own?.boost;

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

		// Three's texture event avoids importing the renderer back into this
		// loader (which would introduce a startup cycle through render.js).
		texture.dispatchEvent( { type: 'newertextureupdated' } );

	} ).catch( error => { texture.userData.newerPending = false; texture.userData.newerFallback = true; texture.userData.newerError = String( error.message || error ); } );

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
	'+1_box_side': { x0: 0.3, x1: 0.7 },
	// Crop/select the warm bright pixels of the actual eyes and open mouth.
	// The face and horns are never redrawn and the bone remains ordinary metal.
	dem5_3: { type: 'warm-face', boost: 4.5, regions: [
		[ .17, .43, .41, .49 ], [ .57, .83, .41, .49 ], [ .31, .69, .56, .72 ]
	] }
};

export function R_GlowFromPicture( pic, box ) {

	const diffuse = new Uint8Array( pic.data );
	const glow = new Uint8Array( pic.data.length );
	const { width: w, height: h } = pic;

	for ( let y = 0; y < h; y ++ ) {

		for ( let x = 0; x < w; x ++ ) {

			if ( box.type === 'warm-face' ) {

				if ( ! box.regions.some( ( [ x0, x1, y0, y1 ] ) => x >= x0 * w && x < x1 * w && y >= y0 * h && y < y1 * h ) ) continue;

			} else if ( x < box.x0 * w || x >= box.x1 * w ) continue;

			const i = ( y * w + x ) * 4;
			const r = pic.data[ i ], g = pic.data[ i + 1 ], b = pic.data[ i + 2 ];
			if ( box.type === 'warm-face' ) {

				if ( r < 150 || g < 45 || r < g * .8 || g < b * 1.4 || r < b * 1.8 ) continue;
				const amount = Math.min( 1, Math.max( 0, ( r - 150 ) / 60 ) );
				glow[ i ] = Math.round( r * amount ); glow[ i + 1 ] = Math.round( g * amount ); glow[ i + 2 ] = Math.round( b * amount ); glow[ i + 3 ] = 255;
				for ( let c = 0; c < 3; c ++ ) diffuse[ i + c ] -= glow[ i + c ];
				continue;

			}
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
	return texture.userData != null && ( texture.userData.newerPicture === true || texture.userData.newerFallback === true );

}

// Read-only readiness of the current/preview model's actual material requests.
// Unknown names and explicit failures settle to native art instead of retrying.
export function R_NewerTexturesStatus( model ) {
	const textures = ( model?.textures || [] ).filter( t => t?.gl_texture && t.name.charAt( 0 ) !== '*' && ! t.name.startsWith( 'sky' ) );
	const on = R_NewerGame() && r_newer_textures.value !== 0; let pending = 0, ready = 0, fallback = 0;
	for ( const t of textures ) {
		if ( ! on ) { fallback ++; continue; }
		if ( t.gl_texture.userData.newerPicture ) ready ++;
		else if ( t.gl_texture.userData.newerFallback || index !== null && index[ t.name ] === undefined ) fallback ++;
		else pending ++;
	}
	return { index: indexState, pending, ready, fallback, total: textures.length, settled: pending === 0,
		errors: { ...( indexError ? { index: indexError } : {} ), ...Object.fromEntries( assetErrors ) } };
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
		if ( fb?.userData.newerCreated ) {

			fb.dispose(); t._fullbright = null;
			t.userData.newerGlowBoost = undefined;

		} else if ( fb != null && fb.userData.classicImage !== undefined ) {

			fb.dispose();
			fb.image = fb.userData.classicImage;
			fb.needsUpdate = true;

		}
		t.dispatchEvent( { type: 'newertextureupdated' } );

	}

	upgraded.clear();

}
