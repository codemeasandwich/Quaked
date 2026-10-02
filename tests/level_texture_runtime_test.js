// Public texture upgrade with actual lossless WebPs and software canvas. No
// browser, game or GPU instance. Set QUAKED_CANVAS_MODULE to installed canvas.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import * as vars from '../src/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { r_newer_textures, R_AnimSetClassicPass } from '../src/r_anim.js';
import { R_NewerTextureUpgrade, R_NewerTextureSettled, R_ClassicTexture, R_NewerTexturesRevert } from '../src/r_newertextures.js';
import { R_NormalMapFor, R_NormalsFromCraftedHeight } from '../src/gl_normals.js';

if ( ! process.env.QUAKED_CANVAS_MODULE ) throw new Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const index = JSON.parse( read( 'newer/textures/index.json' ) );
const recipe = JSON.parse( read( 'tools/texture_sheets/sources/level-2026-10-02/manifest.json' ) );
const requests = [], nativeImages = new Map(), enhanced = new Map();
const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
function nativeTexture() {

	const bytes = new Uint8Array( 64 * 64 * 4 ).fill( 87 );
	const texture = new THREE.DataTexture( bytes, 64, 64 );
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.offset.set( .125, .25 );
	texture.repeat.set( 1, 1 ); texture.flipY = false; return texture;

}
async function fixture( fn ) {

	const saved = { Image: globalThis.Image, document: globalThis.document, fetch: globalThis.fetch, hdr: r_hdr.string, textures: r_newer_textures.value };
	if ( ! vars.Cvar_FindVar( r_hdr.name ) ) vars.Cvar_RegisterVariable( r_hdr );
	vars.Cvar_Set( r_hdr.name, '1' ); r_newer_textures.value = 1;
	globalThis.Image = class extends NativeImage {

		set src( path ) { requests.push( path ); super.src = read( String( path ).split( '?' )[ 0 ] ); }

	};
	globalThis.document = { createElement: name => { same( name, 'canvas', 'loader uses canvas' ); return createCanvas( 1, 1 ); } };
	globalThis.fetch = async path => { same( path, 'newer/textures/index.json', 'live public catalogue requested' ); return { ok: true, json: async () => index }; };
	try { await fn(); } finally {

		globalThis.Image = saved.Image; globalThis.document = saved.document; globalThis.fetch = saved.fetch;
		vars.Cvar_Set( r_hdr.name, saved.hdr ); r_newer_textures.value = saved.textures; R_AnimSetClassicPass( false );

	}

}
async function settled( name, texture ) {

	const deadline = Date.now() + 3000;
	while ( Date.now() < deadline && ! texture.userData.newerPicture ) await new Promise( resolve => setTimeout( resolve, 5 ) );
	check( R_NewerTextureSettled( name, texture ) && texture.userData.newerPicture, name + ' finishes public upgrade' );

}

Deno.test( 'all26 installed WebPs and registered heights reach the public texture object without changing the64unit UV period', () => fixture( async () => {

	for ( const name of Object.keys( recipe.tiles ) ) {

		const texture = nativeTexture(), image = texture.image;
		nativeImages.set( name, image ); enhanced.set( name, texture );
		R_NewerTextureUpgrade( name, texture ); await settled( name, texture );
		same( texture.image.width, 256, name + ' diffuse width' ); same( texture.image.height, 256, name + ' diffuse height' );
		same( texture.userData.classicImage, image, name + ' native pixel identity retained' );
		const height = texture.userData.newerHeight, entry = index.normals[ name ];
		same( height.file, entry.file, name + ' own registered height' ); same( height.strength, entry.strength, name + ' authored strength' );
		same( height.data.length, 256 * 256, name + ' registered height dimensions' );
		check( requests.includes( 'newer/textures/' + index.textures[ name ] + '?v=' + index.version ), name + ' versioned diffuse URL' );
		check( requests.includes( 'newer/textures/' + entry.file + '?v=' + index.version ), name + ' versioned height URL' );
		// BSP width stays64;64 world units still produce one repeat. Upgrade only
		// changes image pixels, so neither diffuse offset nor repeat may change.
		const classic = R_ClassicTexture( texture );
		same( classic.image.data, image.data, name + ' original classic texels' ); same( classic.image.width, 64, name + ' original period' );
		for ( const map of [ texture, classic ] ) {

			same( map.repeat.x, 1, name + ' U repeat' ); same( map.repeat.y, 1, name + ' V repeat' );
			same( map.offset.x, .125, name + ' U offset' ); same( map.offset.y, .25, name + ' V offset' );
			same( map.wrapS, THREE.RepeatWrapping, name + ' U tiles' ); same( map.wrapT, THREE.RepeatWrapping, name + ' V tiles' );

		}
		const normal = R_NormalMapFor( texture );
		same( normal.image.width, 256, name + ' normal resolution' ); same( normal.offset.x, .125, name + ' normal U registration' );
		same( normal.offset.y, .25, name + ' normal V registration' );
		const expected = R_NormalsFromCraftedHeight( height.data, 256, 256, entry.strength, entry.cap );
		check( Buffer.from( normal.image.data ).equals( Buffer.from( expected ) ), name + ' public material derives from authored height' );

	}
	const marble = R_NormalMapFor( enhanced.get( 'column1_2' ) ).image.data;
	for ( let i = 0; i < marble.length; i += 4 ) {

		same( marble[ i ], 128, 'marble flat U' ); same( marble[ i + 1 ], 128, 'marble flat V' );
		same( marble[ i + 2 ], 255, 'marble flat normal' ); same( marble[ i + 3 ], 255, 'marble neutral POM depth' );

	}

} ) );

Deno.test( 'crafted normals match an independent periodic sine derivative and preserve height at the wrap', () => {

	const width = 32, k = Math.PI * 2 / width, h = new Float32Array( width * width );
	for ( let y = 0; y < width; y ++ ) for ( let x = 0; x < width; x ++ ) h[ y * width + x ] = .5 + .2 * Math.sin( k * x );
	const pixels = R_NormalsFromCraftedHeight( h, width, width, 2, 1.1 );
	// Each1,4,6,4,1 filter has Fourier response cos(k/2)^4.
	// Two wrapped passes attenuate this sine by cos(k/2)^8.
	const amplitude = .2 * Math.cos( k / 2 ) ** 8;
	for ( const x of [ 0, 1, 8, 16, 24, 31 ] ) {

		const slope = -.5 * amplitude * Math.cos( k * x ) * Math.sin( k ) * 8;
		const nx = slope / Math.sqrt( 1 + ( slope / 1.1 ) ** 2 ), length = Math.sqrt( 1 + nx * nx );
		const expected = [ Math.round( ( nx / length * .5 + .5 ) * 255 ), 128, Math.round( ( 1 / length * .5 + .5 ) * 255 ), Math.round( ( .5 + amplitude * Math.sin( k * x ) ) * 255 ) ];
		for ( let c = 0; c < 4; c ++ ) check( Math.abs( pixels[ ( 10 * width + x ) * 4 + c ] - expected[ c ] ) <= 1, `analytic sine x${x} channel${c}` );

	}
	check( pixels[ 0 ] < 128 && pixels[ 16 * 4 ] > 128, 'normal points away from rising height and reverses on falling height' );

} );

Deno.test( 'classic pass and normal NewGame preserve native pixels; returning restores all upgraded textures', () => fixture( async () => {

	const untouched = nativeTexture(), image = untouched.image, count = requests.length;
	R_AnimSetClassicPass( true ); R_NewerTextureUpgrade( 'city5_6', untouched );
	R_AnimSetClassicPass( false ); vars.Cvar_Set( r_hdr.name, '0' ); R_NewerTextureUpgrade( 'city5_6', untouched );
	await new Promise( resolve => setImmediate( resolve ) );
	same( untouched.image, image, 'classic/NewGame pixels unchanged' ); same( requests.length, count, 'classic/NewGame does not request enhanced images' );
	R_NewerTexturesRevert();
	for ( const [ name, texture ] of enhanced ) {

		same( texture.image, nativeImages.get( name ), name + ' native image restored' ); same( texture.userData.newerPicture, false, name + ' enhanced flag cleared' );
		same( texture.userData.newerHeight, undefined, name + ' enhanced relief removed' );

	}

} ) );
