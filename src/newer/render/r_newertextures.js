/**
 * @module newer/render/r_newertextures
 *
 * Newer Game's wall textures: higher-resolution versions of the original pictures, with glass and other materials.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `index`, `glass`, `sources`, `normals`, `version`,
 * `indexPromise`, `indexState`, `indexError`, `appliedFor`, `appliedOn`; 4 module-level collections (Map/Set).
 *
 * Errors: throws at 2 places; catches at 4 places.
 */
// Newer Game's wall textures: our own higher resolution versions of the original
// pictures (see newer/textures/CREDITS.txt).
//
// newer/textures/index.json lists them by the game's texture names, with the pixels
// each was made from ("sources", card [34e]): an add-on's own picture by the same
// name keeps its look.  A texture is
// loaded the ordinary way first, so the level is never held up; when its
// higher resolution picture has arrived, that replaces the pixels of the very same
// texture object, which every material, lightmap batch and other-level view
// already uses.  The normal map made from the old pixels is dropped so that the
// next frame makes one from the new ones.
//
// Textures with glowing (fullbright) texels keep their glow: the glow is a separate
// map (the picture's glowing part, drawn at full brightness whatever the light), so
// the original glowing area, enlarged, picks the glowing part out of the new picture.

import {R_NormalPrepared,R_NormalPrepare,R_NormalPreparationNeeded} from '../assets/normal_prepare.js';
import { R_NewerGame, r_newer_textures } from '../mode.js';
import { COM_NewerJSON, COM_NewerURL } from '../../engine/common/pak.js';
import * as THREE from 'three';
import { gl_texturemode } from '../../engine/render/glquake.js';

// the textures that have been given their Newer picture, so they can be put back (r_demosplit.js)
const upgraded = new Set();

const BASE = 'newer/textures/';

let index = null; // name -> file
let glass = {}; // native-RGBA identity -> per-window authored/generated material
let sources = {}; // name -> native-RGBA identities (R_GlassTextureKey) of Quake's own pictures the upgrade was made from
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
			.then( ( j ) => { if ( ! j.textures ) throw new Error( 'Missing texture manifest' ); index = j.textures; normals = j.normals || {}; glass = j.glass || {}; sources = j.sources || {}; version = String( j.version ); indexState = 'ready'; return index; } )
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

/**
 * Starts only named initial-world art before renderer/model construction (main.js, for the demo map and the hub, with
 * names from `R_BspTextureNames`). These are the same decoded-picture/scalar caches used by actual upgrades below, kept
 * for the page's lifetime; prefetch does not create textures, change native pixels or settle a gate. Loads the texture
 * index first; for each listed name loads its picture and, when crafted, its height, edge source and 16-bit scalar.
 *
 * @param {Iterable<string>} names texture names as in the BSP (duplicates ignored; unlisted names skipped)
 * @returns {Promise<Array<?object>>} settles when every requested file has loaded or failed; never rejects (failures
 *   are recorded for `R_NewerTexturesStatus().errors` and resolve as null)
 */
export function R_NewerTexturesPrefetch(names){
 return loadIndex().then(idx=>Promise.all([...new Set(names)].flatMap(name=>{
  const file=idx[name],crafted=normals[name];
  return file===undefined?[]:[loadPicture(file),crafted?loadPicture(crafted.file):null,
   crafted?.edgeSource?loadPicture(crafted.edgeSource.file):null,loadScalar(crafted?.dataFile)];
 })));
}

/**
 * Reads only BSP29's texture directory (lump 2), without loading models or a palette, for `R_NewerTexturesPrefetch` at
 * startup. Invalid/absent data is an empty optional prefetch; the real loader remains responsible for map validation
 * and every actual texture readiness decision. Accepts version 29 and the BSP2 / 2PSB magic numbers.
 *
 * @param {Uint8Array} bytes the whole BSP file
 * @returns {Array<string>} distinct texture names in directory order, without turbulent ('*') and sky textures; empty
 *   when the bytes are not a readable BSP or the directory is malformed (more than 4096 entries, out of bounds)
 */
export function R_BspTextureNames(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<124)return [];
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(![29,0x32505342,0x42535032].includes(view.getInt32(0,true)))return [];
 const offset=view.getInt32(20,true),length=view.getInt32(24,true);
 if(offset<124||length<4||offset+length>bytes.byteLength)return [];
 const count=view.getInt32(offset,true);
 if(count<0||count>4096||4+count*4>length)return [];
 const names=[];
 for(let i=0;i<count;i++){
  const at=view.getInt32(offset+4+i*4,true);
  if(at===-1)continue;
  if(at<4+count*4||at+40>length)return [];
  let name='';for(let j=0;j<16;j++){const c=bytes[offset+at+j];if(!c)break;name+=String.fromCharCode(c);}
  if(name&&name[0]!=='*'&&!name.startsWith('sky'))names.push(name);
 }
 return [...new Set(names)];
}

/**
 * The native-RGBA identity that picks a texture's glass variant from `index.json`'s `glass[name]`. Matches original
 * palette colour and dimensions, including split fullbright texels (their colour is taken from the fullbright image
 * where its alpha is set). Expansion packs reuse names for different windows; names alone are unsafe. Reads the
 * original pixels (`userData.classicImage`) when the texture was already upgraded.
 *
 * @param {?THREE.DataTexture} texture the world texture, optional `_fullbright`
 * @returns {string} `'<width>x<height>:<16 hex digits>'` (two FNV-1a style 32-bit hashes over every RGBA byte), or ''
 *   when the texture has no readable RGBA image
 */
export function R_GlassTextureKey( texture ) {
 const image=texture?.userData?.classicImage||texture?.image,fb=texture?._fullbright?.userData?.classicImage||texture?._fullbright?.image;
 if(!image?.data||image.data.length!==image.width*image.height*4)return '';
 let a=2166136261,b=3339675911;
 for(let i=0;i<image.data.length;i++){
  const at=i-i%4,byte=i%4!==3&&fb?.data?.[at+3]?fb.data[i]:image.data[i];
  a=Math.imul(a^byte,16777619)>>>0;b=Math.imul(b^byte,2246822519)>>>0;
 }
 return image.width+'x'+image.height+':'+a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
}

/**
 * Asks for a texture's Newer picture; called by the model loader for every world texture as it is made
 * (Mod_LoadTextures in gl_model.js, also for the face-shifted copies) and again by `R_NewerTexturesForModel`. Returns
 * at once; the level is never held up. When the picture (and, if listed, its crafted height, scalar, edge source,
 * authored normal and gloss) arrives, the very same texture object gets the new pixels, so every material, lightmap
 * batch and other-level view already uses it:
 * - `userData.newerHeight` gets the crafted height field (`data` Float32Array 0..1; 16-bit scalar when its size
 *   matches), plus `displacement` (depth 0..24, step .5..4, smoothing 0..2), `relief`, `edgeSource`,
 *   `authoredNormal` / `authoredGloss`, and `sampling`, each only when valid;
 * - a fullbright map is re-split from the new picture (enlarged original glow area, or `GLOW_FROM_PICTURE` for
 *   redrawn textures, which may create a transparent fullbright texture);
 * - the original pixels are kept in `userData.classicImage` (the classic half of the title demo draws with them, and
 *   a classic game after a Newer one has them back) and the texture is remembered for `R_NewerTexturesRevert`;
 * - the cached normal map is dropped so the next frame makes one from the new pixels, and a 'newertextureupdated'
 *   event is dispatched on the texture.
 * Sets `userData.newerPending` while loading, then `newerPicture`, or `newerFallback` (with `newerError` on an error)
 * when there is no picture, no matching glass variant, pixels other than those the picture was made from (the
 * index's `sources`, card [34e]), or loading failed. Does nothing in Classic, with `r_newer_textures 0`, or when the
 * texture is already upgraded, pending or fallen back.
 *
 * @param {string} name the game's texture name, the key into `index.json`
 * @param {?THREE.DataTexture} texture the texture's `gl_texture`; mutated asynchronously
 */
export function R_NewerTextureUpgrade( name, texture ) {

	if ( texture == null ) return;
	if ( ! R_NewerGame() || r_newer_textures.value === 0 ) return;
	if ( texture.userData == null || texture.userData.newerPicture === true || texture.userData.newerPending === true || texture.userData.newerFallback === true ) return;
	texture.userData.newerPending = true;

	loadIndex().then( ( idx ) => {

		const variant = glass[ name ]?.[ R_GlassTextureKey( texture ) ];
		if ( glass[ name ] && !variant ) return null;
		// the same name over other pixels (an add-on's own picture, such as Scourge of Armagon's metal5_6) keeps its own
		if ( ! variant && sources[ name ] && ! sources[ name ].includes( R_GlassTextureKey( texture ) ) ) return null;
		const file = variant?.file || idx[ name ];
		if ( file === undefined ) return null;

		// the picture and, when there is one, its crafted height map
		const crafted = variant ? { file: variant.heightFile, normalFile: variant.normalFile, glossFile: variant.glossFile, strength: 1, cap: 1.1 } : normals[ name ];
		return Promise.all( [ loadPicture( file ), crafted !== undefined ? loadPicture( crafted.file ) : null,
			crafted?.edgeSource ? loadPicture( crafted.edgeSource.file ) : null, loadScalar( crafted?.dataFile ), crafted?.normalFile ? loadPicture( crafted.normalFile ) : null, crafted?.glossFile ? loadPicture( crafted.glossFile ) : null ] )
			.then( ( [ pic, heightPic, edgePic, scalar, normalPic, glossPic ] ) => ( pic == null ? null : { pic, heightPic, edgePic, scalar, normalPic, glossPic, crafted } ) );

	} ).then( ( loaded ) => {

		texture.userData.newerPending = false;
		if ( loaded == null ) { texture.userData.newerFallback = true; return; }
		const pic = loaded.pic;

		if ( loaded.heightPic != null && loaded.heightPic.width === pic.width && loaded.heightPic.height === pic.height ) {

			// Grey authored heights use red; supplied tangent normals keep their authored alpha height.
			const h = new Float32Array( pic.width * pic.height );
			for ( let i = 0; i < h.length; i ++ ) h[ i ] = loaded.heightPic.data[ i * 4 + ( loaded.crafted.normalFile === loaded.crafted.file ? 3 : 0 ) ] / 255;
			const scalarReady = loaded.scalar?.byteLength === h.length * 2;
			if ( scalarReady ) {

				const view = new DataView( loaded.scalar );
				for ( let i = 0; i < h.length; i ++ ) h[ i ] = view.getUint16( i * 2, true ) / 65535;

			}
			texture.userData.newerHeight = { file: loaded.crafted.file, strength: loaded.crafted.strength, cap: loaded.crafted.cap || 1.1, data: h, width: pic.width, height: pic.height };
			texture.userData.newerHeight.dataFile = scalarReady ? loaded.crafted.dataFile : undefined;
   // Optional authored normals are accepted only as a complete registered image.
   // A missing gloss keeps relief and falls back to matte, never a shiny placeholder.
   const donor = loaded.normalPic, glossPic = loaded.glossPic;
   if(donor && donor.width===pic.width && donor.height===pic.height) {
    const bytes=new Uint8Array(donor.data);
    for(let i=0;i<h.length;i++)bytes[i*4+3]=Math.round(h[i]*255);
    texture.userData.newerHeight.authoredNormal={file:loaded.crafted.normalFile,...donor,data:bytes};
    if(glossPic && glossPic.width===pic.width && glossPic.height===pic.height)
     texture.userData.newerHeight.authoredGloss={file:loaded.crafted.glossFile,...glossPic};
   }

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
/**
 * Every frame from `R_RenderView` (gl_rmain.js). Cheap when nothing changed: it only acts when the world model or the
 * on/off state (Newer Game and `r_newer_textures`) differs from the last call.
 *
 * @param {?object} worldmodel the level being played (`cl.worldmodel`), or null with no client
 */
export function R_NewerTexturesFrame( worldmodel ) {

	const on = R_NewerGame() && r_newer_textures.value !== 0;
	if ( worldmodel === appliedFor && on === appliedOn ) return;

	appliedFor = worldmodel;
	appliedOn = on;
	if ( on ) R_NewerTexturesForModel( worldmodel );

}

/**
 * Upgrades every texture of a level (or of a level seen from another): called by `R_NewerTexturesFrame`, by the
 * other-level views (r_levelview.js) and by the prewarm queue (r_prewarm.js). Skips turbulent ('*') and sky textures.
 * Does nothing in Classic or with `r_newer_textures 0`.
 *
 * @param {?object} model a brush model_t with `textures` (texture_t with `name` and `gl_texture`)
 */
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

/**
 * Splits a redrawn picture into its lit and glowing parts, for pictures whose lit parts are not where the original's
 * were. Plain boxes take strong red (r >= 140 and over 2.2 times green and blue) inside the column range `x0..x1`,
 * so the hazard stripes beside the lights do not glow, and black it out of the lit part. 'warm-face' takes the warm
 * bright pixels inside `regions` (eyes and open mouth), ramped in from red 150 to 210, and subtracts them from the lit
 * part.
 *
 * @param {{data: Uint8Array, width: number, height: number}} pic the decoded RGBA picture (not modified)
 * @param {{x0: number, x1: number}|{type: 'warm-face', boost?: number, regions: Array<Array<number>>}} box fractions
 *   0..1 of the picture's width (and, for regions `[x0, x1, y0, y1]`, its height)
 * @returns {{diffuse: Uint8Array, glow: Uint8Array}} new RGBA arrays the size of `pic`; glow alpha is 255 where it glows
 */
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

/**
 * Has this texture got the picture it is going to have? (Not while the list of pictures or its picture is still on
 * the way.) Used by the prewarm queue (r_prewarm.js) to pick textures whose normal maps can be made now.
 *
 * @param {string} name the game's texture name
 * @param {?THREE.DataTexture} texture its `gl_texture`
 * @returns {boolean} true in Classic, with `r_newer_textures 0`, for a null texture, for an unlisted name, or once the
 *   texture has its Newer picture or has fallen back; false while the index or the picture is pending
 */
export function R_NewerTextureSettled( name, texture ) {

	if ( ! R_NewerGame() || r_newer_textures.value === 0 || texture == null ) return true;
	if ( index === null ) return false;
	if ( index[ name ] === undefined && !glass[ name ] ) return true;
	return texture.userData != null && ( texture.userData.newerPicture === true || texture.userData.newerFallback === true );

}

/**
 * Read-only readiness of the current/preview model's actual material requests, for the intro readiness gate
 * (`R_UpdateIntroReadiness`, gl_rmain.js) and the demon bakes (r_demonbakes.js). Unknown names and explicit failures
 * settle to native art instead of retrying. Turbulent and sky textures are not counted.
 *
 * @param {?object} model a brush model_t with `textures`
 * @returns {{index: string, pending: number, ready: number, fallback: number, total: number, settled: boolean,
 *   errors: Object<string, string>}} `index` is 'idle', 'loading', 'ready' or 'fallback' (the manifest failed);
 *   every texture counts as fallback in Classic or with `r_newer_textures 0`; `errors` maps 'index' and each failed
 *   file to its message (accumulated for the page's lifetime)
 */
export function R_NewerTexturesStatus( model ) {
	const textures = ( model?.textures || [] ).filter( t => t?.gl_texture && t.name.charAt( 0 ) !== '*' && ! t.name.startsWith( 'sky' ) );
	const on = R_NewerGame() && r_newer_textures.value !== 0; let pending = 0, ready = 0, fallback = 0;
	for ( const t of textures ) {
		if ( ! on ) { fallback ++; continue; }
		if ( t.gl_texture.userData.newerPicture ) ready ++;
		else if ( t.gl_texture.userData.newerFallback || index !== null && index[ t.name ] === undefined && !glass[ t.name ] ) fallback ++;
		else pending ++;
	}
	return { index: indexState, pending, ready, fallback, total: textures.length, settled: pending === 0,
		errors: { ...( indexError ? { index: indexError } : {} ), ...Object.fromEntries( assetErrors ) } };
}


/**
 * The Classic twin of a texture: a separate texture with the original pixels (`userData.classicImage`, else the
 * current image), used for Classic materials (`R_ClassicMaterial` in gl_rmain.js) such as the classic half of the
 * title demo. A separate native texture also avoids inheriting Newer Game's forced linear filtering on artwork that
 * was never replaced; the user's native filter (`gl_texturemode`) is honoured on every call. A face-shifted copy
 * (`userData.classicBase`) resolves to its base's twin. The twin is made once, cached on `userData.classicTwin`,
 * follows the source's image while it was never upgraded, copies its offset and repeat every call, and is disposed
 * with it.
 *
 * @param {?THREE.Texture} texture the game texture
 * @returns {?THREE.Texture} the twin (the same object on every call), or the input when it is null/undefined
 */
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

/**
 * Puts every upgraded texture back to its original pixels (the Newer picture is fetched again if Newer Game is
 * played): restores `classicImage`, clears `newerPicture` and `newerHeight`, drops the normal map, removes or restores
 * the fullbright map, and dispatches 'newertextureupdated'. Called by r_demosplit.js when a classic game starts from
 * the menus (`R_DemoSplitRelease`) and when the title demo stops with `r_hdr` 0 (`R_DemoSplitEnd`). Empties the
 * upgraded set.
 */
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

/**
 * Readiness of the current model's background normal-map preparation, for the intro readiness gate
 * (`R_UpdateIntroReadiness`, gl_rmain.js, when the enhanced renderer and `r_newer_normals` are on). Normal readiness is
 * independent of whether authored high-resolution colour replacement is enabled. Only current model textures own this
 * gate (both `model.textures` and every `texinfo` texture, without '*' and sky); a texture whose Newer picture is still
 * pending counts as pending.
 *
 * @param {?object} model a brush model_t
 * @returns {{pending: number, ready: number, shipped: number, generated: number, settled: boolean,
 *   errors: Object<string, string>}} `shipped` / `generated` split the ready ones by source ('shipped' /
 *   'generated-and-stored'); `errors` maps texture name to its preparation error
 */
export function R_NewerNormalsStatus(model){
 let pending=0,ready=0,shipped=0,generated=0;const errors={};
 for(const t of new Set([...(model?.textures||[]),...(model?.texinfo||[]).map(info=>info?.texture)])){if(!t?.gl_texture||t.name.startsWith('*')||t.name.startsWith('sky'))continue;if(t.gl_texture.userData.newerPending){pending++;continue;}const work=R_NormalPrepared(t.gl_texture);
  if(work?.status==='ready'){ready++;if(work.source==='shipped')shipped++;else if(work.source==='generated-and-stored')generated++;}
  else{pending++;if(work?.error)errors[t.name]=work.error;}
 }
 return {pending,ready,shipped,generated,settled:pending===0,errors};
}

/**
 * Starts background normal-map preparation (`R_NormalPrepare`) for each of the model's textures that needs it and
 * whose Newer picture is not still pending; called just before `R_NewerNormalsStatus` by the intro readiness gate.
 * Repeated calls start nothing new for a texture whose prepared job still matches its current revision
 * (`R_NormalPreparationNeeded`).
 *
 * @param {?object} model a brush model_t (`textures` and `texinfo`)
 */
export function R_NewerNormalsPrepare(model){
 for(const t of new Set([...(model?.textures||[]),...(model?.texinfo||[]).map(info=>info?.texture)]))if(t?.gl_texture&&!t.name.startsWith('*')&&!t.name.startsWith('sky')&&!t.gl_texture.userData.newerPending&&R_NormalPreparationNeeded(t.gl_texture))R_NormalPrepare(t.gl_texture);
}
