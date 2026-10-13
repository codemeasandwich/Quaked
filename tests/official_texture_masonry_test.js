// Public verification of six ordinary masonry bindings against real bounded
// PAK/BSP reads, native renderer identities and actual lossless image decoding.
// No GPU/browser or historical acceptance claim is made by these tests.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { GL_LoadTexture } from '../src/engine/render/gl_model_common.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';
import { registrationsAtFourTimes, verifyRegisteredNormalChannels } from './official_texture_standard.js';
import { memberSearch, readMember, sha256 } from '../tools/pak_members.mjs';

const root = resolve( import.meta.dirname, '..' ), sourceRoot = process.env.QUAKED_GAME_ROOT ? resolve( process.env.QUAKED_GAME_ROOT ) : root;
const read = path => readFileSync( resolve( root, path ) );
const historicalReceipt = JSON.parse( read( 'tools/texture_sheets/sources/official-world-2026-10-12/masonry-registration.json' ) );
const receipt = { ...historicalReceipt, entries: registrationsAtFourTimes( historicalReceipt.entries ) };
const trial = JSON.parse( read( 'newer/textures/candidates-2026-10-12/trial.json' ) );
const indexBytes = read( 'newer/textures/index.json' ), index = JSON.parse( indexBytes );
const baseline = JSON.parse( execFileSync( 'git', [ 'show', 'a28d939647d93f7c1ea96160ebb79751388d2fcb:newer/textures/index.json' ], { cwd: root } ) );
const names = [ 'city6_8', 'city4_2', 'city4_8', 'metflor1_3', 'bricka2_4', 'brick2_4' ];
const candidateName = name => ( { metflor1_3: 'city4_8', brick2_4: 'bricka2_4' } )[ name ] || name;
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const equal = ( actual, expected, message ) => check( isDeepStrictEqual( actual, expected ), message );
const bytesEqual = ( actual, expected, message ) => check( Buffer.from( actual ).equals( Buffer.from( expected ) ), message );
const games = new Map(), maps = new Map();
function packPath( id ) {
	const game = GAME_CATALOGUE_GAMES.find( g => g.id === ( id === 'id1' ? 'quake' : id ) );
	check( game, 'known game ' + id );
	if ( process.env.QUAKED_GAME_ROOT ) return resolve( sourceRoot, game.folders.find( f => f.startsWith( 'games/' ) ).slice( 6 ), 'pak0.pak' );
	return resolve( root, id === 'shareware' ? 'games/shareware/pak0.pak' : 'resources/' + id + '/pak0.pak' );
}
async function gameFiles( game ) {
	if ( ! games.has( game ) ) games.set( game, ( async () => {
		const paths = [ packPath( 'id1' ), packPath( 'shareware' ) ]; if ( game !== 'id1' ) paths.push( packPath( game ) );
		const members = await memberSearch( paths ), paletteEntry = members.get( 'gfx/palette.lmp' );
		return { members, palette: await readMember( paletteEntry ), palettePack: paletteEntry.path };
	} )() );
	return games.get( game );
}
async function mapTextures( entry ) {
	const id = entry.path + '|' + entry.name;
	if ( ! maps.has( id ) ) maps.set( id, ( async () => {
		const bsp = await readMember( entry );
		check( bsp.length >= 124 && [ 29, 0x32505342, 0x42535032 ].includes( bsp.readInt32LE( 0 ) ), 'supported BSP texture directory' );
		const start = bsp.readInt32LE( 20 ), length = bsp.readInt32LE( 24 ); check( start >= 124 && length >= 4 && start + length <= bsp.length, 'bounded BSP texture lump' );
		const count = bsp.readInt32LE( start ), textures = [];
		check( count >= 0 && count <= 4096 && 4 + count * 4 <= length, 'bounded miptex count' );
		for ( let slot = 0; slot < count; slot ++ ) {
			const offset = bsp.readInt32LE( start + 4 + slot * 4 ); if ( offset === -1 ) continue;
			check( offset >= 4 + count * 4 && offset + 40 <= length, 'bounded miptex header' );
			const at = start + offset, name = bsp.subarray( at, at + 16 ).toString( 'latin1' ).split( '\0' )[ 0 ];
			const width = bsp.readUInt32LE( at + 16 ), height = bsp.readUInt32LE( at + 20 ), mip = bsp.readUInt32LE( at + 24 ); if ( ! mip ) continue;
			check( width && height && width * height <= 16777216 && mip >= 40 && offset + mip + width * height <= length, 'bounded miptex pixels' );
			textures.push( { name, slot, width, height, pixels: bsp.subarray( at + mip, at + mip + width * height ) } );
		}
		return { textures, mapSha256: sha256( bsp ) };
	} )() );
	return maps.get( id );
}
function nativeTexture( raw, palette ) {
	VID_SetPalette( palette ); vid.fullbright = 224;
	const texture = GL_LoadTexture( raw.name, raw.width, raw.height, raw.pixels, true, false, true );
	const rgba = texture.image.data.slice(), fb = texture._fullbright?.image.data;
	if ( fb ) for ( let p = 0; p < rgba.length; p += 4 ) if ( fb[ p + 3 ] ) rgba.set( fb.subarray( p, p + 3 ), p );
	const expected = new Uint8Array( rgba.length );
	for ( let p = 0; p < raw.pixels.length; p ++ ) expected.set( [ ...palette.subarray( raw.pixels[ p ] * 3, raw.pixels[ p ] * 3 + 3 ), 255 ], p * 4 );
	bytesEqual( rgba, expected, raw.name + ' actual GL palette/fullbright reconstruction' );
	return { texture, rgba, key: R_GlassTextureKey( texture ), width: raw.width, height: raw.height };
}
const dispose = t => { t._fullbright?.dispose(); t.dispose(); };
async function masonrySource( entry, use = entry.source.uses[ 0 ] ) {
	const game = await gameFiles( use.game ), map = game.members.get( use.map );
	check( map, 'actual masonry BSP exists in the intended inherited game search' );
	const directory = await mapTextures( map ), raw = directory.textures.find( t => t.slot === use.slot );
	check( raw, 'recorded native slot exists' ); same( raw.name, entry.name, 'actual native texture name' );
	return { ...nativeTexture( raw, game.palette ), source: { game: use.game, actualPack: map.path, map: use.map, slot: use.slot,
		mapSha256: directory.mapSha256, palettePack: game.palettePack, paletteSha256: sha256( game.palette ) } };
}
async function imagesFixture( run ) {
	if ( ! process.env.QUAKED_CANVAS_MODULE ) throw Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
	const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive() };
	const controls = [ r_hdr, mode.r_newer_textures ]; for ( const c of controls ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	const values = controls.map( c => c.string ), requests = [], fetches = [];
	globalThis.fetch = async url => { fetches.push( String( url ) ); same( String( url ), 'newer/textures/index.json', 'public index fetch' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage { set src( url ) { requests.push( String( url ) ); super.src = read( String( url ).split( '?' )[ 0 ] ); } } } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: name => { same( name, 'canvas', 'actual decoding canvas' ); return createCanvas( 1, 1 ); } } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	const decode = async file => {
		const image = new NativeImage(), loaded = new Promise( ( resolve, reject ) => { image.onload = resolve; image.onerror = reject; } );
		image.src = read( 'newer/textures/' + file ); await loaded; const canvas = createCanvas( image.width, image.height ), ctx = canvas.getContext( '2d' ); ctx.drawImage( image, 0, 0 );
		return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };
	};
	try { const api = await import( '../src/newer/render/r_newertextures.js?masonry-public-' + Math.random() ); await run( { api, requests, fetches, decode } ); }
	finally { globalThis.fetch = saved.fetch; for ( const key of [ 'Image', 'document' ] ) if ( saved[ key ] ) Object.defineProperty( globalThis, key, saved[ key ] ); else delete globalThis[ key ]; controls.forEach( ( c, i ) => vars.Cvar_Set( c.name, values[ i ] ) ); mode.R_AnimSetClassicPass( saved.classic ); }
}
async function terminal( api, name, texture ) {
	const end = Date.now() + 5000; while ( texture.userData.newerPending && Date.now() < end ) await new Promise( r => setTimeout( r, 5 ) );
	check( api.R_NewerTextureSettled( name, texture ) && ! texture.userData.newerPending, name + ' settles actual load' );
}
function diffuseMatches( texture, expected, label ) {
	const glow = texture._fullbright?.image.data;
	if ( ! glow ) bytesEqual( texture.image.data, expected, label );
	else for ( let i = 0; i < expected.length; i += 4 ) for ( let c = 0; c < 3; c ++ ) same( texture.image.data[ i + c ] + glow[ i + c ], expected[ i + c ], label + ' fullbright conservation' );
}

Deno.test( 'four reviewed masonry artworks bind six exact native names, including both alias pairs, without widening base sources', async () => {
	equal( receipt.entries.map( e => e.name ).sort(), [ ...names ].sort(), 'exact six masonry names' );
	same( new Set( receipt.entries.map( e => e.binding.file ) ).size, 4, 'four artwork files cover six names' );
	same( new Set( receipt.entries.map( e => e.binding.normal.file ) ).size, 4, 'four registered heights cover six names' );
	const sources = [], nativeByName = new Map();
	for ( const e of receipt.entries ) {
		const candidate = trial[ candidateName( e.name ) ], binding = index.ordinaryVariants?.[ e.name ]?.[ e.key ];
		equal( binding, e.binding, e.name + ' exact ordinary runtime binding' ); same( e.key, candidate.nativeKey, e.name + ' reviewed native key' );
		same( binding.normal.strength, .3, e.name + ' authored normal strength' ); same( binding.normal.cap, .5, e.name + ' authored normal cap' );
		for ( const field of [ 'textures', 'sources', 'normals' ] ) {
			same( baseline[ field ][ e.name ], undefined, e.name + ' absent from original base catalogue: ' + field );
			same( index[ field ][ e.name ], undefined, e.name + ' identity-only registration does not invent base binding: ' + field );
			same( e.beforeBase?.[ field ] ?? null, null, e.name + ' previous base binding was absent: ' + field );
		}
		check( ! index.glass?.[ e.name ], e.name + ' ordinary material not shadowed by glass selector' );
		same( sha256( read( 'newer/textures/' + binding.file ) ), e.diffuseSha256, e.name + ' runtime diffuse digest' );
		same( sha256( read( 'newer/textures/' + binding.normal.file ) ), e.heightSha256, e.name + ' runtime height digest' );
		same( sha256( read( 'newer/textures/' + candidate.file ) ), e.candidateSha256, e.name + ' reviewed candidate digest' );
		same( sha256( read( 'newer/textures/' + candidate.height ) ), e.heightSha256, e.name + ' exact reviewed height copied' );
		for ( const use of e.source.uses ) {
			const actual = await masonrySource( e, use );
			try {
				same( actual.key, e.key, e.name + ' actual public native identity' ); same( sha256( actual.rgba ), e.source.pixelSha256, e.name + ' actual original pixel hash' );
				if ( ! nativeByName.has( e.name ) ) nativeByName.set( e.name, actual.rgba );
				sources.push( { name: e.name, key: actual.key, nativePixelSha256: sha256( actual.rgba ), ...actual.source } );
			} finally { dispose( actual.texture ); }
		}
	}
	for ( const [ primary, alias ] of [ [ 'city4_8', 'metflor1_3' ], [ 'bricka2_4', 'brick2_4' ] ] ) {
		bytesEqual( nativeByName.get( primary ), nativeByName.get( alias ), primary + '/' + alias + ' actual native RGBA are exactly identical' );
		const p = receipt.entries.find( e => e.name === primary ), a = receipt.entries.find( e => e.name === alias );
		equal( p.binding, a.binding, primary + '/' + alias + ' safely share the complete artwork and height recipe' );
	}
	same( sources.length, 41, 'all 41 recorded masonry occurrences verified' );
	const result = { source_root: sourceRoot, indexSha256: sha256( indexBytes ), bindings: receipt.entries.length, artworks: 4, occurrences: sources.length, sources };
	if ( process.env.QUAKED_MASONRY_TEXTURE_RECEIPT ) writeFileSync( process.env.QUAKED_MASONRY_TEXTURE_RECEIPT, JSON.stringify( result, null, 2 ) + '\n' );
	console.log( 'MASONRY_NATIVE_SOURCES ' + JSON.stringify( { source_root: sourceRoot, indexSha256: result.indexSha256, bindings: result.bindings, artworks: 4, occurrences: sources.length, sourceContentSha256: sha256( Buffer.from( JSON.stringify( sources ) ) ) } ) );
} );

Deno.test( 'all six masonry identities install reviewed pixels and matching heights, reuse alias caches and restore native Classic images', () => imagesFixture( async f => {
	const installed = [], originals = new Map();
	try {
		await f.api.R_NewerTexturesPrefetch( [] );
		for ( const e of receipt.entries ) {
			const actual = await masonrySource( e ), texture = actual.texture, binding = e.binding, candidate = trial[ candidateName( e.name ) ];
			installed.push( texture ); originals.set( texture, texture.image ); texture.offset.set( .125, .25 ); texture.repeat.set( 2, 3 );
			same( f.api.R_NewerTextureSettled( e.name, texture ), false, e.name + ' variant-only material pending before installation' );
			f.api.R_NewerTextureUpgrade( e.name, texture ); same( texture.userData.newerPending, true, e.name + ' asynchronous actual request' ); await terminal( f.api, e.name, texture );
			same( texture.userData.newerPicture, true, e.name + ' actual masonry install succeeds' );
			const hd = await f.decode( binding.file ), reviewed = await f.decode( candidate.file ), height = await f.decode( binding.normal.file );
			same( hd.width, candidate.width, e.name + ' reviewed HD width' ); same( hd.height, candidate.heightPixels, e.name + ' reviewed HD height' );
			same( hd.width, actual.width * 4, e.name + ' artwork width is exactly 4x native' ); same( hd.height, actual.height * 4, e.name + ' artwork height is exactly 4x native' );
			bytesEqual( hd.data, reviewed.data, e.name + ' runtime WebP preserves exact reviewed candidate pixels' ); diffuseMatches( texture, hd.data, e.name + ' exact installed pixels' );
			same( height.width, hd.width, e.name + ' height registration width' ); same( height.height, hd.height, e.name + ' height registration height' );
			const bound = texture.userData.newerHeight; await verifyRegisteredNormalChannels( texture, binding.normal, f.decode ); same( bound.file, binding.normal.file, e.name + ' own authored height' ); same( bound.strength, .3, e.name + ' height strength' ); same( bound.cap, .5, e.name + ' height cap' );
			for ( let p = 0; p < bound.data.length; p ++ ) same( bound.data[ p ], Math.fround( height.data[ p * 4 ] / 255 ), e.name + ' exact installed height pixels' );
			for ( const file of [ binding.file, binding.normal.file ] ) check( f.requests.includes( 'newer/textures/' + file + '?v=' + index.version ), e.name + ' requests registered asset' );
			same( texture.repeat.x, 2, e.name + ' U period retained' ); same( texture.repeat.y, 3, e.name + ' V period retained' ); same( texture.offset.x, .125, e.name + ' U offset retained' ); same( texture.offset.y, .25, e.name + ' V offset retained' );
			same( texture.wrapS, THREE.RepeatWrapping, e.name + ' tiled U boundary retained' ); same( texture.wrapT, THREE.RepeatWrapping, e.name + ' tiled V boundary retained' );
			same( f.api.R_ClassicTexture( texture ).image.data, originals.get( texture ).data, e.name + ' Classic twin uses original image bytes' ); same( R_GlassTextureKey( texture ), e.key, e.name + ' original native identity retained' );
		}
		same( f.requests.length, 20, 'alias pairs share four cached diffuse/height/XYZ sets' );
		const model = { textures: installed.map( ( texture, i ) => ( { name: receipt.entries[ i ].name, gl_texture: texture } ) ) };
		same( f.api.R_NewerTexturesStatus( model ).ready, 6, 'all six real material installations ready' );
		f.api.R_NewerTexturesRevert();
		for ( const [ texture, image ] of originals ) { same( texture.image, image, 'Classic reversion restores exact original native image' ); same( texture.userData.newerHeight, undefined, 'Classic reversion clears authored masonry height' ); }
	} finally { for ( const texture of installed ) dispose( texture ); }
} ) );

Deno.test( 'six unknown masonry identities retain native art and Classic mode requests no masonry variants', () => imagesFixture( async f => {
	for ( const e of receipt.entries ) {
		const actual = await masonrySource( e ), pixels = actual.rgba.slice(); pixels[ 0 ] ^= 1;
		const unknown = new THREE.DataTexture( pixels, actual.width, actual.height ), original = unknown.image;
		try {
			const key = R_GlassTextureKey( unknown ); check( key !== e.key && ! index.ordinaryVariants[ e.name ][ key ], e.name + ' unrelated negative identity' );
			f.api.R_NewerTextureUpgrade( e.name, unknown ); await terminal( f.api, e.name, unknown ); same( unknown.userData.newerFallback, true, e.name + ' unknown native pixels fall back' ); same( unknown.image, original, e.name + ' original negative image retained' );
			same( f.requests.length, 0, e.name + ' unknown identity requests no artwork' );
			mode.R_AnimSetClassicPass( true ); f.api.R_NewerTextureUpgrade( e.name, actual.texture ); await Promise.resolve(); mode.R_AnimSetClassicPass( false );
			same( actual.texture.userData.newerPicture, undefined, e.name + ' Classic never installs variant' ); same( f.requests.length, 0, e.name + ' Classic makes no image request' );
		} finally { mode.R_AnimSetClassicPass( false ); dispose( unknown ); dispose( actual.texture ); }
	}
} ) );
