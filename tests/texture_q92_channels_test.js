import {ResourceURL} from '../src/platform/resource_paths.js';
// Public channel-composition contracts. The fixture controls decoded image
// transport; real R_NewerTextureUpgrade, R_NormalMapFor and normal preparation
// snapshots/keys run unchanged. Actual Q92 codec errors are separate evidence.
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { R_NormalMapFor, R_GenerateNormalData, R_NormalsFromCraftedHeight } from '../src/newer/render/gl_normals.js';
import { NormalInputs, NormalInputKey, NormalGenerate } from '../src/newer/assets/normal_prepare.js';

const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const equal = ( actual, expected, message ) => check( Buffer.from( actual.buffer, actual.byteOffset, actual.byteLength ).equals( Buffer.from( expected.buffer, expected.byteOffset, expected.byteLength ) ), message );
const flush = async () => { for ( let i = 0; i < 80; i ++ ) await Promise.resolve(); };
const native = () => {
	const t = new THREE.DataTexture( new Uint8Array( [ 20, 30, 40, 255 ] ), 1, 1 );
	t.wrapS = t.wrapT = THREE.RepeatWrapping; t.offset.set( .125, .25 ); t.repeat.set( 2, 3 ); return t;
};
function picture( pixel, width = 4, height = 4 ) {
	const data = new Uint8ClampedArray( width * height * 4 );
	for ( let i = 0; i < width * height; i ++ ) data.set( pixel( i ), i * 4 );
	return { width, height, data };
}
async function fixture( run ) {
	const controls = [ r_hdr, mode.r_newer_textures ]; for ( const c of controls ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	const old = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive(), values: controls.map( c => c.string ) };
	const assets = {
		'diffuse.webp': picture( i => i === 2 ? [ 56, 4, 3, 255 ] : i === 3 ? [ 57, 4, 3, 255 ] : i === 7 ? [ 0, 0, 0, 255 ] : [ 100 + i * 3, 90, 60, 255 ] ),
		'height.webp': picture( i => [ i * 13, 7, 250, 255 ] ),
		'nx.webp': picture( i => [ 32 + i * 5, 4, 9, 255 ] ),
		'ny.webp': picture( i => [ 210 - i * 4, 3, 8, 255 ] ),
		'nz.webp': picture( i => [ 240 - i, 2, 7, 255 ] ),
		'rgb.png': picture( i => [ 50 + i * 3, 180 - i * 2, 235, 255 ] ),
		'sheen.webp': picture( i => { const v = [ 127, 200, 200, 21, 20, 21, 0, 200 ][ i ] ?? 127; return [ v, v, v, 255 ]; } ),
		'opening.webp': picture( i => { const v = [ 255, 127, 255, 128, 255, 127, 255, 255 ][ i ] ?? 255; return [ v, v, v, 255 ]; } ),
		'closed.webp': picture( () => [ 0, 0, 0, 255 ] ),
		'packed.png': picture( i => [ 80 + i, i % 2 ? 0 : 255, 13, 255 ] ),
		'wrong-size.webp': picture( () => [ 200, 200, 200, 255 ], 2, 4 )
	};
	const images = [], decoded = [], fetches = [], made = [], reference = native(), key = R_GlassTextureKey( reference ); reference.dispose();
	const channels = { x: 'nx.webp', y: 'ny.webp', z: 'nz.webp' };
	const manifest = { version: 'q92-channel-fixture', textures: {
		ordinary: 'diffuse.webp', legacy: 'diffuse.webp'
	}, normals: {
		ordinary: { file: 'height.webp', strength: 1.25, cap: .7, normalChannels: channels },
		legacy: { file: 'height.webp', strength: 1.25, cap: .7, normalFile: 'rgb.png', glossFile: 'packed.png' }
	}, glass: {} };
	const addGlass = ( name, overrides = {} ) => manifest.glass[ name ] = { [ key ]: { file: 'diffuse.webp', heightFile: 'height.webp', normalChannels: channels, glossFile: 'sheen.webp', glossOpeningFile: 'opening.webp', composeOutsideGlass: true, ...overrides } };
	addGlass( 'glass' );
	globalThis.fetch = async url => { fetches.push( ResourceURL(url,true) ); same( ResourceURL(url,true), 'newer/textures/index.json', 'only public index fetched' ); return { ok: true, json: async () => manifest }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {
		constructor() { images.push( this ); }
		set src( url ) { this.file = ResourceURL(url,true).replace( /^newer\/textures\//, '' ).split( '?' )[ 0 ]; }
		finish() {
			const source = assets[ this.file ]; if ( ! source ) { this.onerror?.( Error( 'fixture missing ' + this.file ) ); return; }
			this.width = source.width; this.height = source.height; this.pixels = source.data; this.onload?.();
		}
	} } );
	// This software transport also supports the fullbright split's canvas API.
	// Its sole scaling case in this suite is a uniform 1x1 fullbright mask, for
	// which nearest and interpolated canvas samples are exactly the same.
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: name => {
		same( name, 'canvas', 'only image/glow canvases requested' );
		const canvas = { width: 0, height: 0, pixels: null };
		canvas.getContext = () => ( {
			createImageData: ( w, h ) => ( { width: w, height: h, data: new Uint8ClampedArray( w * h * 4 ) } ),
			putImageData: image => { canvas.pixels = image.data.slice(); },
			drawImage: source => {
				const bytes = new Uint8ClampedArray( canvas.width * canvas.height * 4 );
				for ( let y = 0; y < canvas.height; y ++ ) for ( let x = 0; x < canvas.width; x ++ ) {
					const at = ( Math.floor( y * source.height / canvas.height ) * source.width + Math.floor( x * source.width / canvas.width ) ) * 4;
					bytes.set( source.pixels.subarray( at, at + 4 ), ( y * canvas.width + x ) * 4 );
				}
				canvas.pixels = bytes; canvas.sourceFile = source.file;
			},
			getImageData: () => {
				const data = canvas.pixels.slice();
				if ( canvas.sourceFile ) decoded.push( { file: canvas.sourceFile, data, before: data.slice() } );
				return { data };
			}
		} ); return canvas;
	} } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	try {
		const api = await import( '../src/newer/render/r_newertextures.js?q92-channels-' + Math.random() );
		await run( { api, assets, manifest, channels, key, images, decoded, fetches, addGlass,
			native: () => { const t = native(); made.push( t ); return t; },
			finish: async () => { await flush(); for ( const image of images ) if ( image.onload || image.onerror ) image.finish(); await flush(); }
		} );
		for ( const d of decoded ) equal( d.data, d.before, 'loader never mutates shared decoded picture buffer: ' + d.file );
	} finally {
		for ( const image of images ) if ( image.onload || image.onerror ) image.finish(); await flush();
		for ( const texture of made ) { texture._fullbright?.dispose(); texture.dispose(); }
		globalThis.fetch = old.fetch;
		for ( const field of [ 'Image', 'document' ] ) if ( old[ field ] ) Object.defineProperty( globalThis, field, old[ field ] ); else delete globalThis[ field ];
		controls.forEach( ( c, i ) => vars.Cvar_Set( c.name, old.values[ i ] ) ); mode.R_AnimSetClassicPass( old.classic );
	}
}
function expectedChannels( assets ) {
	const result = new Uint8Array( 64 );
	for ( let p = 0; p < 16; p ++ ) result.set( [ assets[ 'nx.webp' ].data[ p * 4 ], assets[ 'ny.webp' ].data[ p * 4 ], assets[ 'nz.webp' ].data[ p * 4 ], assets[ 'height.webp' ].data[ p * 4 ] ], p * 4 );
	return result;
}

Deno.test( 'ordinary grayscale XYZ uses channel red values and authored height through public foreground and preparation APIs', () => fixture( async f => {
	const t = f.native(), original = t.image; f.api.R_NewerTextureUpgrade( 'ordinary', t ); await f.finish();
	same( t.userData.newerPicture, true, 'ordinary diffuse installed' ); const expected = expectedChannels( f.assets ), normal = R_NormalMapFor( t );
	equal( normal.image.data, expected, 'XYZ red channels and height alpha reach real normal map' );
	same( normal.image.data[ 3 ], 0, 'zero authored height does not erase nonzero normal RGB' );
	const input = NormalInputs( t ), prepared = NormalGenerate( input );
	equal( input.authored, expected, 'normal snapshot captures reconstructed RGB and height' ); equal( prepared.pixels, expected, 'prepared path matches foreground' );
	for ( let p = 0; p < 16; p ++ ) same( input.scalar[ p ], Math.fround( expected[ p * 4 + 3 ] / 255 ), 'scalar uses decoded height red' );
	const stableKey = await NormalInputKey( input );
	t.userData.newerHeight.authoredNormal.data[ 0 ] ^= 1;
	same( await NormalInputKey( input ), stableKey, 'snapshot is detached from later texture changes' );
	check( await NormalInputKey( NormalInputs( t ) ) !== stableKey, 'actual authored byte change invalidates content key' );
	equal( f.api.R_ClassicTexture( t ).image.data, original.data, 'Classic twin retains native pigment' );
	same( normal.colorSpace, THREE.NoColorSpace, 'normal channels remain linear data' );
	same( normal.offset.x, .125, 'normal U registration retained' ); same( normal.offset.y, .25, 'normal V registration retained' );
} ) );

Deno.test( 'glass recomposes canonical normal AND height outside decoded panes before foreground and prepared keys', () => fixture( async f => {
	const t = f.native(), original = t.image; let updates = 0; t.addEventListener( 'newertextureupdated', () => updates ++ );
	f.api.R_NewerTextureUpgrade( 'glass', t ); same( t.userData.newerPending, true, 'real asynchronous request pending' ); await f.finish();
	const canonical = R_GenerateNormalData( f.assets[ 'diffuse.webp' ].data, 4, 4 ), expected = expectedChannels( f.assets ), panes = new Set( [ 0, 3, 8, 9, 10, 11, 12, 13, 14, 15 ] );
	for ( let p = 0; p < 16; p ++ ) if ( ! panes.has( p ) ) expected.set( canonical.subarray( p * 4, p * 4 + 4 ), p * 4 );
	const normal = R_NormalMapFor( t ), input = NormalInputs( t );
	equal( normal.image.data, expected, 'renderer sees exact XYZ inside and canonical RGBA outside' );
	equal( input.authored, expected, 'prepared snapshot sees same final composition' ); equal( NormalGenerate( input ).pixels, expected, 'prepared generation remains identical' );
	for ( let p = 0; p < 16; p ++ ) same( input.scalar[ p ], Math.fround( expected[ p * 4 + 3 ] / 255 ), 'canonical outside scalar matches final normal alpha' );
	const gloss = normal.userData.glassGloss.image.data;
	for ( let p = 0; p < 16; p ++ ) {
		same( gloss[ p * 4 ], panes.has( p ) ? f.assets[ 'sheen.webp' ].data[ p * 4 ] : 0, 'sheen excludes low value, closed and dark pixels' );
		same( gloss[ p * 4 + 1 ], [ 1, 5 ].includes( p ) ? 0 : 255, 'opening threshold is exactly 128' );
	}
	same( t.repeat.x, 2, 'diffuse U period unchanged' ); same( t.repeat.y, 3, 'diffuse V period unchanged' ); same( t.offset.x, .125, 'diffuse U offset unchanged' );
	same( normal.userData.glassGloss.offset.y, .25, 'gloss V registration unchanged' ); same( updates, 1, 'one actual material update' );
	check( f.api.R_NewerTextureSettled( 'glass', t ), 'actual composed material ready' );
	f.api.R_NewerTexturesRevert(); same( t.image, original, 'Classic reversion restores exact native image' ); same( t.userData.newerHeight, undefined, 'Classic reversion clears composed field' );
} ) );

Deno.test( 'different opening masks produce distinct final normal keys without corrupting shared decoded channel caches', () => fixture( async f => {
	f.addGlass( 'closed', { glossOpeningFile: 'closed.webp' } ); f.addGlass( 'alias' );
	const a = f.native(), b = f.native(), c = f.native();
	f.api.R_NewerTextureUpgrade( 'glass', a ); f.api.R_NewerTextureUpgrade( 'closed', b ); f.api.R_NewerTextureUpgrade( 'alias', c ); await f.finish();
	const ia = NormalInputs( a ), ib = NormalInputs( b ), ic = NormalInputs( c );
	check( await NormalInputKey( ia ) !== await NormalInputKey( ib ), 'mask composition changes prepared cache identity' );
	same( await NormalInputKey( ia ), await NormalInputKey( ic ), 'identical aliases share content identity' );
	equal( R_NormalMapFor( b ).image.data, R_GenerateNormalData( f.assets[ 'diffuse.webp' ].data, 4, 4 ), 'closed material is fully canonical' );
	check( ! R_NormalMapFor( b ).userData.glassGloss, 'closed material remains matte' );
	same( f.images.length, 8, 'seven shared good inputs plus one alternate opening decoded only once' );
} ) );

Deno.test( 'ordinary missing, incomplete or mismatched XYZ falls back to its crafted height without partial or legacy donor data', () => fixture( async f => {
	const broken = [ { ...f.channels, x: 'missing.webp' }, { x: 'nx.webp', y: 'ny.webp' }, { ...f.channels, z: 'wrong-size.webp' }, {} ];
	for ( let i = 0; i < broken.length; i ++ ) {
		const name = 'bad-ordinary-' + i; f.manifest.textures[ name ] = 'diffuse.webp';
		f.manifest.normals[ name ] = { file: 'height.webp', strength: 1.25, cap: .7, normalFile: 'rgb.png', normalChannels: broken[ i ] };
		const t = f.native(); f.api.R_NewerTextureUpgrade( name, t ); await f.finish();
		same( t.userData.newerPicture, true, name + ' diffuse still installs' ); same( t.userData.newerHeight.authoredNormal, undefined, name + ' no incomplete authored donor attached' );
		equal( R_NormalMapFor( t ).image.data, R_NormalsFromCraftedHeight( t.userData.newerHeight.data, 4, 4, 1.25, .7 ), name + ' uses its valid crafted height' );
		check( ! R_NormalMapFor( t ).userData.glassGloss, name + ' no invented glass' );
	}
} ) );

Deno.test( 'glass missing or wrong-sized XYZ, opening, sheen or height fails safely to canonical matte pigment', () => fixture( async f => {
	const cases = [
		{ normalChannels: { ...f.channels, x: 'missing.webp' } }, { normalChannels: { ...f.channels, y: 'wrong-size.webp' } },
		{ normalChannels: {} }, { glossOpeningFile: 'missing.webp' }, { glossOpeningFile: 'wrong-size.webp' },
		{ glossFile: 'missing.webp' }, { glossFile: 'wrong-size.webp' }, { heightFile: 'missing.webp' }, { heightFile: 'wrong-size.webp' }
	];
	for ( let i = 0; i < cases.length; i ++ ) {
		const name = 'bad-glass-' + i; f.addGlass( name, cases[ i ] ); const t = f.native(); f.api.R_NewerTextureUpgrade( name, t ); await f.finish();
		same( t.userData.newerPicture, true, name + ' valid diffuse remains installed' ); const normal = R_NormalMapFor( t );
		equal( normal.image.data, R_GenerateNormalData( f.assets[ 'diffuse.webp' ].data, 4, 4 ), name + ' complete canonical matte fallback' );
		check( ! normal.userData.glassGloss, name + ' cannot produce unreviewed glass' );
		const input = NormalInputs( t ); equal( NormalGenerate( input ).pixels, normal.image.data, name + ' prepared fallback agrees' );
	}
} ) );

Deno.test( 'explicit glass composition with an absent opening declaration cannot reinterpret grayscale sheen as a packed aperture', () => fixture( async f => {
	for ( const [ name, opening ] of [ [ 'absent-opening', undefined ], [ 'empty-opening', '' ] ] ) {
		f.addGlass( name, { glossOpeningFile: opening } ); const t = f.native(); f.api.R_NewerTextureUpgrade( name, t ); await f.finish();
		const normal = R_NormalMapFor( t ); check( ! normal.userData.glassGloss, name + ' fails closed to matte' );
		equal( normal.image.data, R_GenerateNormalData( f.assets[ 'diffuse.webp' ].data, 4, 4 ), name + ' keeps canonical ordinary material' );
	}
} ) );

Deno.test( 'legacy RGB normal and packed RG gloss behavior stays unchanged without new composition metadata', () => fixture( async f => {
	const t = f.native(); f.api.R_NewerTextureUpgrade( 'legacy', t ); await f.finish();
	const expected = new Uint8Array( f.assets[ 'rgb.png' ].data ); for ( let p = 0; p < 16; p ++ ) expected[ p * 4 + 3 ] = f.assets[ 'height.webp' ].data[ p * 4 ];
	const normal = R_NormalMapFor( t ); equal( normal.image.data, expected, 'old authored RGB remains exact with height alpha' );
	equal( normal.userData.glassGloss.image.data, new Uint8Array( f.assets[ 'packed.png' ].data ), 'old packed mask remains unchanged' );
	equal( NormalGenerate( NormalInputs( t ) ).pixels, expected, 'legacy prepared source remains exact' );
} ) );

Deno.test( 'composition uses unsplit pigment for fullbright panes and preserves native fullbright Classic images', () => fixture( async f => {
	const t = f.native(); t.image.data.set( [ 0, 0, 0, 255 ] ); t._fullbright = new THREE.DataTexture( new Uint8Array( [ 20, 30, 40, 255 ] ), 1, 1 );
	const original = t.image, originalGlow = t._fullbright.image; same( R_GlassTextureKey( t ), f.key, 'fullbright reconstruction retains native identity' );
	f.api.R_NewerTextureUpgrade( 'glass', t ); await f.finish(); same( t.userData.newerPicture, true, 'fullbright source selects correct material' );
	const normal = R_NormalMapFor( t ); same( normal.image.data[ 0 ], f.assets[ 'nx.webp' ].data[ 0 ], 'bright pane retains authored X even though lit pigment split to black' );
	same( normal.userData.glassGloss.image.data[ 0 ], 127, 'fullbright pane remains tagged' );
	const canonical = R_GenerateNormalData( t.image.data, 4, 4, t._fullbright.image.data );
	for ( const p of [ 1, 2, 4, 5, 6, 7 ] ) for ( let c = 0; c < 4; c ++ ) same( normal.image.data[ p * 4 + c ], canonical[ p * 4 + c ], 'outside pane baseline agrees with actual split pigment' );
	f.api.R_NewerTexturesRevert(); same( t.image, original, 'native lit image restored' ); same( t._fullbright.image, originalGlow, 'native glow image restored' );
} ) );

Deno.test( 'Classic pass and disabled texture option never request Q92 channel assets', () => fixture( async f => {
	for ( const setting of [ 'classic', 'mode-off', 'textures-off' ] ) {
		const t = f.native(), original = t.image;
		mode.R_AnimSetClassicPass( setting === 'classic' ); vars.Cvar_SetValue( r_hdr.name, setting === 'mode-off' ? 0 : 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, setting === 'textures-off' ? 0 : 1 );
		f.api.R_NewerTextureUpgrade( 'glass', t ); await flush(); same( t.image, original, setting + ' native image unchanged' );
		same( f.images.length, 0, setting + ' no channel image requests' ); same( f.fetches.length, 0, setting + ' no manifest request' );
	}
} ) );
