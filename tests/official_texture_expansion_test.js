import {ResourceURL} from '../src/platform/resource_paths.js';
// Public verification of six ordinary expansion variants against real bounded
// PAK/BSP reads, native renderer identities and actual lossless image decoding.
// No GPU/browser or historical acceptance claim is made by these tests.
import { readFileSync, writeFileSync } from './helpers/resource_fs.mjs';
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
const historicalReceipt = JSON.parse( read( 'tools/texture_sheets/sources/official-world-2026-10-12/expansion-registration.json' ) );
const receipt = { ...historicalReceipt, entries: registrationsAtFourTimes( historicalReceipt.entries ) };
const trial = JSON.parse( read( 'tests/fixtures/official-textures.json' ) ).trials;
const indexBytes = read( 'newer/textures/index.json' ), index = JSON.parse( indexBytes );
const baseline = JSON.parse( execFileSync( 'git', [ 'show', 'a28d939647d93f7c1ea96160ebb79751388d2fcb:newer/textures/index.json' ], { cwd: root } ) );
const aliases = [ 'hipnotic-metal5_6', 'mg1-comp1_2', 'mg1-comp1_3', 'mg1-metal1_1', 'mg1-metal1_3', 'mg1-metal1_4' ];
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
async function expansionSource( entry, use = entry.source.uses[ 0 ] ) {
	const game = await gameFiles( use.game ), map = game.members.get( use.map );
	check( map, 'actual expansion BSP exists' ); same( map.path, packPath( use.game ), 'actual expansion pack owns the selected BSP' );
	const directory = await mapTextures( map ), raw = directory.textures.find( t => t.slot === use.slot );
	check( raw, 'recorded native slot exists' ); same( raw.name, entry.name, 'actual native texture name' );
	return { ...nativeTexture( raw, game.palette ), source: { game: use.game, actualPack: map.path, map: use.map, slot: use.slot,
		mapSha256: directory.mapSha256, palettePack: game.palettePack, paletteSha256: sha256( game.palette ) } };
}
async function baseSources() {
	const game = await gameFiles( 'id1' ), wanted = new Set( receipt.entries.map( e => e.name ) ), found = new Map();
	for ( const [ name, map ] of game.members ) {
		if ( ! name.endsWith( '.bsp' ) ) continue;
		for ( const raw of ( await mapTextures( map ) ).textures ) {
			if ( ! wanted.has( raw.name ) || found.has( raw.name ) ) continue;
			const actual = nativeTexture( raw, game.palette );
			if ( baseline.sources[ raw.name ].includes( actual.key ) ) found.set( raw.name, { ...actual, map: name, pack: map.path } );
			else dispose( actual.texture );
		}
		if ( found.size === wanted.size ) break;
	}
	same( found.size, 6, 'all six original base identities found in actual base BSPs' ); return found;
}

Deno.test( 'six expansion registrations match reviewed candidates and native BSP identities without changing any base mapping', async () => {
	equal( receipt.entries.map( e => e.alias ).sort(), [ ...aliases ].sort(), 'exact six reviewed expansion aliases' );
	const sources = [];
	for ( const e of receipt.entries ) {
		const candidate = trial[ e.alias ], binding = index.ordinaryVariants?.[ e.name ]?.[ e.key ];
		equal( binding, e.binding, e.alias + ' exact runtime variant binding' ); same( e.key, candidate.nativeKey, e.alias + ' reviewed native key' );
		same( binding.normal.strength, .35, e.alias + ' authored normal strength' ); same( binding.normal.cap, .5, e.alias + ' authored normal cap' );
		for ( const field of [ 'textures', 'sources', 'normals' ] ) {
			equal( index[ field ][ e.name ], baseline[ field ][ e.name ], e.alias + ' original Git base binding preserved: ' + field );
			equal( index[ field ][ e.name ], e.beforeBase[ field ], e.alias + ' immediate previous base binding preserved: ' + field );
		}
		check( ! index.sources[ e.name ].includes( e.key ), e.alias + ' expansion identity does not widen base sources' );
		check( ! index.glass?.[ e.name ], e.alias + ' ordinary selection not shadowed by glass' );
		same( sha256( read( 'newer/textures/' + binding.file ) ), e.diffuseSha256, e.alias + ' runtime diffuse digest' );
		same( sha256( read( 'newer/textures/' + binding.normal.file ) ), e.heightSha256, e.alias + ' runtime height digest' );
		same( sha256( read( 'newer/textures/' + candidate.file ) ), e.candidateSha256, e.alias + ' reviewed candidate digest' );
		same( sha256( read( 'newer/textures/' + candidate.height ) ), e.heightSha256, e.alias + ' exact candidate height copied' );
		for ( const use of e.source.uses ) {
			const actual = await expansionSource( e, use );
			try { same( actual.key, e.key, e.alias + ' actual public native identity' ); same( sha256( actual.rgba ), e.source.pixelSha256, e.alias + ' original pixel hash' );
				sources.push( { alias: e.alias, key: actual.key, nativePixelSha256: sha256( actual.rgba ), ...actual.source } ); }
			finally { dispose( actual.texture ); }
		}
	}
	const result = { source_root: sourceRoot, indexSha256: sha256( indexBytes ), bindings: receipt.entries.length, occurrences: sources.length, sources };
	if ( process.env.QUAKED_EXPANSION_TEXTURE_RECEIPT ) writeFileSync( process.env.QUAKED_EXPANSION_TEXTURE_RECEIPT, JSON.stringify( result, null, 2 ) + '\n' );
	console.log( 'EXPANSION_NATIVE_SOURCES ' + JSON.stringify( { source_root: sourceRoot, indexSha256: result.indexSha256, bindings: result.bindings, occurrences: sources.length, sourceContentSha256: sha256( Buffer.from( JSON.stringify( sources ) ) ) } ) );
} );

async function imagesFixture( run ) {
	if ( ! process.env.QUAKED_CANVAS_MODULE ) throw Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
	const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive() };
	const controls = [ r_hdr, mode.r_newer_textures ]; for ( const c of controls ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	const values = controls.map( c => c.string ), requests = [], fetches = [];
	globalThis.fetch = async url => { fetches.push( ResourceURL(url,true) ); same( ResourceURL(url,true), 'newer/textures/index.json', 'public index fetch' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage { set src( url ) { requests.push( ResourceURL(url,true) ); super.src = read( ResourceURL(url,true).split( '?' )[ 0 ] ); } } } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: name => { same( name, 'canvas', 'actual decoding canvas' ); return createCanvas( 1, 1 ); } } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	const decode = async file => {
		const image = new NativeImage(), loaded = new Promise( ( resolve, reject ) => { image.onload = resolve; image.onerror = reject; } );
		image.src = read( 'newer/textures/' + file ); await loaded; const canvas = createCanvas( image.width, image.height ), ctx = canvas.getContext( '2d' ); ctx.drawImage( image, 0, 0 );
		return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };
	};
	try { const api = await import( '../src/newer/render/r_newertextures.js?expansion-public-' + Math.random() ); await run( { api, requests, fetches, decode } ); }
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

Deno.test( 'six expansion identities install exact reviewed pixels and own relief while the six base identities still install base art', () => imagesFixture( async f => {
	const bases = await baseSources(), originals = new Map(), installed = [];
	try {
		for ( const e of receipt.entries ) {
			const actual = await expansionSource( e ), texture = actual.texture, binding = e.binding, candidate = trial[ e.alias ];
			installed.push( texture ); originals.set( texture, texture.image ); texture.offset.set( .125, .25 ); texture.repeat.set( 2, 3 );
			f.api.R_NewerTextureUpgrade( e.name, texture ); same( texture.userData.newerPending, true, e.alias + ' starts asynchronous request' ); await terminal( f.api, e.name, texture );
			same( texture.userData.newerPicture, true, e.alias + ' actual expansion install' );
			const hd = await f.decode( binding.file ), reviewed = await f.decode( candidate.file ), height = await f.decode( binding.normal.file );
			same( hd.width, candidate.width, e.alias + ' HD width' ); same( hd.height, candidate.heightPixels, e.alias + ' HD height' );
			same( hd.width, actual.width * 4, e.alias + ' artwork width is exactly 4x native' ); same( hd.height, actual.height * 4, e.alias + ' artwork height is exactly 4x native' );
			bytesEqual( hd.data, reviewed.data, e.alias + ' runtime WebP is exact reviewed candidate pixels' ); diffuseMatches( texture, hd.data, e.alias + ' exact installed pixels' );
			same( height.width, hd.width, e.alias + ' height registration width' ); same( height.height, hd.height, e.alias + ' height registration height' );
			const bound = texture.userData.newerHeight; await verifyRegisteredNormalChannels( texture, binding.normal, f.decode ); same( bound.file, binding.normal.file, e.alias + ' own relief file' ); same( bound.strength, .35, e.alias + ' own relief strength' ); same( bound.cap, .5, e.alias + ' own relief cap' );
			for ( let p = 0; p < bound.data.length; p ++ ) same( bound.data[ p ], Math.fround( height.data[ p * 4 ] / 255 ), e.alias + ' actual registered height pixels' );
			for ( const file of [ binding.file, binding.normal.file ] ) check( f.requests.includes( 'newer/textures/' + file + '?v=' + index.version ), e.alias + ' requests own actual file' );
			same( texture.repeat.x, 2, e.alias + ' U period retained' ); same( texture.repeat.y, 3, e.alias + ' V period retained' ); same( texture.offset.x, .125, e.alias + ' U offset retained' ); same( texture.offset.y, .25, e.alias + ' V offset retained' );
			same( f.api.R_ClassicTexture( texture ).image.data, originals.get( texture ).data, e.alias + ' Classic twin uses native bytes' );
			same( R_GlassTextureKey( texture ), e.key, e.alias + ' native identity retained after install' );
			const base = bases.get( e.name ).texture; originals.set( base, base.image );
			f.api.R_NewerTextureUpgrade( e.name, base ); await terminal( f.api, e.name, base ); same( base.userData.newerPicture, true, e.alias + ' actual base install still succeeds' );
			diffuseMatches( base, ( await f.decode( baseline.textures[ e.name ] ) ).data, e.alias + ' original base artwork still selected' );
			same( base.userData.newerHeight.file, baseline.normals[ e.name ].file, e.alias + ' original base relief retained' );
		}
		const model = { textures: [ ...installed, ...[ ...bases.values() ].map( b => b.texture ) ].map( ( texture, i ) => ( { name: receipt.entries[ i % 6 ].name, gl_texture: texture } ) ) };
		same( f.api.R_NewerTexturesStatus( model ).ready, 12, 'all six expansion and six base installs ready' );
		f.api.R_NewerTexturesRevert();
		for ( const [ texture, image ] of originals ) { same( texture.image, image, 'Classic reversion restores exact native image' ); same( texture.userData.newerHeight, undefined, 'Classic reversion removes variant/base authored height' ); }
	} finally { for ( const texture of installed ) dispose( texture ); for ( const base of bases.values() ) dispose( base.texture ); }
} ) );

Deno.test( 'all six unrelated expansion pixel identities fall back and Classic mode requests no variant assets', () => imagesFixture( async f => {
	for ( const e of receipt.entries ) {
		const actual = await expansionSource( e ), pixels = actual.rgba.slice(); pixels[ 0 ] ^= 1;
		const unknown = new THREE.DataTexture( pixels, actual.width, actual.height ), original = unknown.image;
		try {
			const key = R_GlassTextureKey( unknown ); check( key !== e.key && ! index.sources[ e.name ].includes( key ) && ! index.ordinaryVariants[ e.name ][ key ], e.alias + ' unrelated negative identity' );
			f.api.R_NewerTextureUpgrade( e.name, unknown ); await terminal( f.api, e.name, unknown ); same( unknown.userData.newerFallback, true, e.alias + ' unknown pixels fall back' ); same( unknown.image, original, e.alias + ' native negative pixels retained' );
			same( f.requests.length, 0, e.alias + ' unknown identity requests no base or variant images' );
			mode.R_AnimSetClassicPass( true ); f.api.R_NewerTextureUpgrade( e.name, actual.texture ); await Promise.resolve(); mode.R_AnimSetClassicPass( false );
			same( actual.texture.userData.newerPicture, undefined, e.alias + ' Classic never installs variant' ); same( f.requests.length, 0, e.alias + ' Classic makes no variant request' );
		} finally { mode.R_AnimSetClassicPass( false ); dispose( unknown ); dispose( actual.texture ); }
	}
} ) );
