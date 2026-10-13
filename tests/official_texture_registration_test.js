// Current-state verification of 45 official-level texture bindings: actual
// PAK/BSP pixels -> GL_LoadTexture -> public identity and upgrade APIs, with
// real local WebP decoding. Inputs are a NEW source snapshot plus a fixed Git
// baseline; deleted historical receipts/inventory are neither required nor
// recreated. This verifies current assets, not past delivery or GPU appearance.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { GL_LoadTexture } from '../src/engine/render/gl_model_common.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { memberSearch, readMember, sha256 } from '../tools/pak_members.mjs';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';
import { registrationsAtFourTimes, verifyFourTimesTrialDimensions, verifyRegisteredNormalChannels } from './official_texture_standard.js';

const root = resolve( import.meta.dirname, '..' );
// QUAKED_GAME_ROOT is the external /games/ mount itself (its direct children
// are Quake, shareware, Scourge of Armagon, etc.), as in tools/serve.py.
const sourceRoot = process.env.QUAKED_GAME_ROOT ? resolve( process.env.QUAKED_GAME_ROOT ) : root;
function sourcePack( logical ) {
	if ( ! process.env.QUAKED_GAME_ROOT ) return resolve( root, logical );
	const game = GAME_CATALOGUE_GAMES.find( g => g.folders.some( folder => logical.startsWith( folder + '/' ) ) );
	if ( ! game ) throw Error( 'Unknown catalogue pack location: ' + logical );
	return resolve( sourceRoot, game.folders.find( folder => folder.startsWith( 'games/' ) ).slice( 6 ), basename( logical ) );
}
const read = path => readFileSync( resolve( root, path ) );
const inputPath = 'tools/texture_sheets/sources/official-world-2026-10-12/current-registration-inputs.json';
const inputBytes = read( inputPath ), historicalReceipt = JSON.parse( inputBytes );
const receipt = { ...historicalReceipt, entries: registrationsAtFourTimes( historicalReceipt.entries ) };
const beforeBytes = execFileSync( 'git', [ 'show', receipt.baseline.commit + ':' + receipt.baseline.path ], { cwd: root } ), before = JSON.parse( beforeBytes );
const indexBytes = read( 'newer/textures/index.json' ), index = JSON.parse( indexBytes );
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const equal = ( actual, expected, message ) => check( isDeepStrictEqual( actual, expected ), message );
const bytesEqual = ( actual, expected, message ) => check( Buffer.from( actual ).equals( Buffer.from( expected ) ), message );
const flush = async () => { for ( let i = 0; i < 50; i ++ ) await Promise.resolve(); };
const selected = new Set( receipt.entries.map( e => e.name ) );
const games = new Map(), maps = new Map();

async function gameFiles( game ) {

	if ( ! games.has( game ) ) games.set( game, ( async () => {
		const paths = [ sourcePack( 'resources/id1/pak0.pak' ), sourcePack( 'games/shareware/pak0.pak' ) ];
		if ( game !== 'id1' ) paths.push( sourcePack( 'resources/' + game + '/pak0.pak' ) );
		const members = await memberSearch( paths );
		return { members, palette: await readMember( members.get( 'gfx/palette.lmp' ) ) };
	} )() );
	return games.get( game );

}
async function source( use, expectedName ) {

	const { members, palette } = await gameFiles( use.game ), entry = members.get( use.map );
	check( entry, 'map exists in actual inherited PAK search: ' + use.map );
	same( entry.path, sourcePack( use.pack ), 'receipt logical pack resolves to the actual winning map pack' );
	const mapID = entry.path + '|' + entry.name;
	if ( ! maps.has( mapID ) ) maps.set( mapID, readMember( entry ) );
	const bsp = await maps.get( mapID );
	same( sha256( bsp ), use.mapSha256, 'actual map matches the NEW current-state input' );
	same( sha256( palette ), use.paletteSha256, 'actual inherited palette matches the NEW current-state input' );
	check( bsp.length >= 124 && [ 29, 0x32505342, 0x42535032 ].includes( bsp.readInt32LE( 0 ) ), 'supported texture-directory layout' );
	const start = bsp.readInt32LE( 20 ), length = bsp.readInt32LE( 24 );
	check( start >= 124 && length >= 4 && start + length <= bsp.length, 'bounded texture lump' );
	const count = bsp.readInt32LE( start );
	check( count > 0 && count <= 4096 && 4 + count * 4 <= length && use.slot >= 0 && use.slot < count, 'bounded receipt texture slot' );
	const offset = bsp.readInt32LE( start + 4 + use.slot * 4 );
	check( offset >= 4 + count * 4 && offset + 40 <= length, 'bounded miptex header' );
	const at = start + offset, name = bsp.subarray( at, at + 16 ).toString( 'latin1' ).split( '\0' )[ 0 ];
	same( name, expectedName, 'actual BSP slot texture name' );
	const width = bsp.readUInt32LE( at + 16 ), height = bsp.readUInt32LE( at + 20 ), mip = bsp.readUInt32LE( at + 24 );
	check( width > 0 && height > 0 && width * height <= 16777216 && mip >= 40 && offset + mip + width * height <= length, 'bounded native pixel payload' );
	const pixels = bsp.subarray( at + mip, at + mip + width * height );
	VID_SetPalette( palette ); vid.fullbright = 224;
	const texture = GL_LoadTexture( name, width, height, pixels, true, false, true );
	const rgba = texture.image.data.slice(), fb = texture._fullbright?.image.data;
	if ( fb ) for ( let i = 0; i < rgba.length; i += 4 ) if ( fb[ i + 3 ] ) rgba.set( fb.subarray( i, i + 3 ), i );
	// Independent palette reconstruction checks the renderer endpoint, not just
	// the inventory's own digest or its saved extracted RGBA file.
	const rawRGBA = new Uint8Array( width * height * 4 );
	for ( let i = 0; i < pixels.length; i ++ ) rawRGBA.set( [ ...palette.subarray( pixels[ i ] * 3, pixels[ i ] * 3 + 3 ), 255 ], i * 4 );
	bytesEqual( rgba, rawRGBA, 'GL_LoadTexture preserves raw palette/fullbright source colours' );
	same( sha256( rgba ), use.pixelSha256, 'actual native pixels match the NEW current-state input' );
	return { texture, rgba, palette, pixels, width, height, key: R_GlassTextureKey( texture ), source: {
		game: use.game, logicalPack: use.pack, actualPack: entry.path, map: use.map,
		mapSha256: sha256( bsp ), paletteSha256: sha256( palette ), nativePixelSha256: sha256( rgba )
	} };

}
const dispose = texture => { texture._fullbright?.dispose(); texture.dispose(); };
const eligible = e => e.sourceUses.find( u => [ 'brush-asset', 'campaign-or-multiplayer' ].includes( u.scope ) );

// This ordinary-texture integration deliberately excludes the root checkout's
// experimental glass migration. Verify the entire committed Dev glass catalogue
// and its tracked material/metadata bytes stay exact; do not skip glass checks.
const integrationBase = 'eb523c80dafc5433898e98c26ca6eb481dc8658b';
function unchangedIntegrationGlass() {
	const baseline = JSON.parse( execFileSync( 'git', [ 'show', integrationBase + ':newer/textures/index.json' ], { cwd: root } ) );
	equal( index.glass, baseline.glass, 'every Dev glass binding preserved exactly, with no root-only migration' );
	const tree = execFileSync( 'git', [ 'ls-tree', '-r', integrationBase, '--', 'newer/textures' ], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 } );
	const tracked = new Map( tree.trim().split( '\n' ).map( line => { const [ meta, path ] = line.split( '\t' ); return [ path, meta.split( ' ' )[ 2 ] ]; } ) );
	const required = new Set( [ ...tracked.keys() ].filter( path => path.startsWith( 'newer/textures/glass/' ) ) );
	for ( const variants of Object.values( baseline.glass ) ) for ( const material of Object.values( variants ) ) {
		for ( const field of [ 'file', 'normalFile', 'heightFile', 'glossFile', 'nativeFile', 'glossOpeningFile' ] ) if ( material[ field ] ) required.add( 'newer/textures/' + material[ field ] );
		for ( const file of Object.values( material.normalChannels || {} ) ) required.add( 'newer/textures/' + file );
	}
	const paths = [ ...required ].sort(); check( paths.length > 0, 'Dev glass assets exist' );
	for ( const path of paths ) check( tracked.has( path ), 'Dev glass reference is tracked: ' + path );
	const hashes = execFileSync( 'git', [ 'hash-object', '--stdin-paths' ], { cwd: root, input: paths.join( '\n' ) + '\n', encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 } ).trim().split( '\n' );
	same( hashes.length, paths.length, 'every glass asset hashed' );
	paths.forEach( ( path, i ) => same( hashes[ i ], tracked.get( path ), 'unchanged Dev glass bytes: ' + path ) );
	console.log( 'UNCHANGED_DEV_GLASS ' + JSON.stringify( { baseline: integrationBase, names: Object.keys( baseline.glass ).length, materials: Object.values( baseline.glass ).reduce( ( count, variants ) => count + Object.keys( variants ).length, 0 ), files: paths.length } ) );
	return baseline.glass;
}

Deno.test( 'current catalogue contains the 45 source-bound additions and preserves every entry of the fixed Git baseline', () => {
	check( receipt.qualification.startsWith( 'NEW current-state verification inputs' ), 'input is explicitly new verification, not recovered historical evidence' );
	same( execFileSync( 'git', [ 'rev-parse', receipt.baseline.commit + ':' + receipt.baseline.path ], { cwd: root, encoding: 'utf8' } ).trim(), receipt.baseline.blob, 'fixed Git baseline blob identity' );
	same( sha256( beforeBytes ), receipt.beforeSha256, 'Git baseline byte digest is exact' );
	same( receipt.entries.length, 45, 'bounded first batch' ); same( selected.size, 45, 'distinct registered names' );
	same( receipt.entries.filter( e => e.kind === 'generated-photographic' ).length, 2, 'two generated artworks' );
	same( receipt.entries.filter( e => e.kind === 'exact-original-reuse' ).length, 43, '43 existing HD artwork reuses' );
	const expectedGlass = unchangedIntegrationGlass();
	for ( const [ field, value ] of Object.entries( before ) ) {
		if ( field === 'version' ) continue;
		for ( const [ name, entry ] of Object.entries( value ) ) equal( index[ field ]?.[ name ], field === 'glass' ? expectedGlass[ name ] : entry, 'existing ' + field + '.' + name + ' preserved against historical ordinary and current Dev glass baselines' );
	}
	for ( const e of receipt.entries ) {
		check( ! before.textures[ e.name ], e.name + ' was not already installed' );
		same( index.textures[ e.name ], e.file, e.name + ' current diffuse binding' );
		equal( index.sources[ e.name ], [ e.key ], e.name + ' exact native source guard' ); equal( index.normals[ e.name ], e.normal, e.name + ' own normal recipe' );
		check( ! index.glass?.[ e.name ], e.name + ' ordinary binding is not hidden by a glass selector' );
		same( sha256( read( 'newer/textures/' + e.file ) ), e.diffuseSha256, e.name + ' diffuse file digest' );
		same( sha256( read( 'newer/textures/' + e.normal.file ) ), e.heightSha256, e.name + ' height file digest' );
		if ( e.donor ) {
			same( before.textures[ e.donor ], e.file, e.name + ' uses actual previous donor art' );
			equal( before.normals[ e.donor ], e.normal, e.name + ' uses complete previous donor height recipe' );
			check( before.sources[ e.donor ].includes( e.key ), e.name + ' donor also binds this exact native identity' );
		}
	}
	// Keep this maintained test valid for later additive campaign batches. The
	// new input snapshot's byte digest is required while its version is current.
	if ( index.version === receipt.version ) {
		same( sha256( indexBytes ), receipt.afterSha256, 'registered manifest byte digest' );
		equal( Object.keys( index.textures ).filter( name => ! before.textures[ name ] ).sort(), [ ...selected ].sort(), 'no unrecorded first-batch additions' );
	}
} );

Deno.test( 'all 162 current source occurrences and 43 donor bindings match actual BSP palette pixels', async () => {
	let occurrences = 0, donors = 0, fullbright = 0; const sources = [];
	for ( const e of receipt.entries ) {
		check( eligible( e ), e.name + ' has a campaign/brush source' );
		for ( const use of e.sourceUses ) {
			const actual = await source( use, e.name );
			try {
				same( actual.key, e.key, e.name + ' public native identity in ' + use.game + '/' + use.map );
				same( sha256( actual.rgba ), e.pixelSha256, e.name + ' actual source digest in ' + use.game + '/' + use.map );
				sources.push( { name: e.name, key: actual.key, ...actual.source } );
				occurrences ++; if ( actual.texture._fullbright ) fullbright ++;
			} finally { dispose( actual.texture ); }
		}
		if ( e.donor ) {
			check( e.donorUse, e.name + ' has an independently readable current donor source' );
			const actual = await source( e.donorUse, e.donor );
			try { same( sha256( actual.rgba ), e.pixelSha256, e.name + ' donor original pixels are exactly identical' ); donors ++; }
			finally { dispose( actual.texture ); }
		}
	}
	same( occurrences, 162, 'all 162 retained source occurrences freshly checked' ); same( donors, 43, 'all 43 donor bindings freshly checked' );
	const result = { qualification: 'NEW current-state source verification; not recovered historical evidence',
		inputPath, inputSha256: sha256( inputBytes ), baselineCommit: receipt.baseline.commit,
		source_root: sourceRoot, externalGameRoot: !! process.env.QUAKED_GAME_ROOT,
		indexSha256: sha256( indexBytes ), entries: receipt.entries.length, occurrences, donors, fullbright,
		actualPacks: [ ...new Set( sources.map( s => s.actualPack ) ) ].sort(),
		sourceContentSha256: sha256( Buffer.from( JSON.stringify( sources ) ) ) };
	if ( process.env.QUAKED_TEXTURE_REGISTRATION_RECEIPT ) writeFileSync( process.env.QUAKED_TEXTURE_REGISTRATION_RECEIPT, JSON.stringify( { ...result, sources }, null, 2 ) + '\n' );
	console.log( 'OFFICIAL_NATIVE_SOURCES ' + JSON.stringify( result ) );
} );

async function imagesFixture( run ) {
	if ( ! process.env.QUAKED_CANVAS_MODULE ) throw Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
	const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive() };
	const options = [ r_hdr, mode.r_newer_textures ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const values = options.map( v => v.string ), requests = [];
	globalThis.fetch = async url => { same( String( url ), 'newer/textures/index.json', 'actual public manifest endpoint' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage {
		set src( url ) { requests.push( String( url ) ); super.src = read( String( url ).split( '?' )[ 0 ] ); }
	} } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: tag => { same( tag, 'canvas', 'actual decoding/glow canvases' ); return createCanvas( 1, 1 ); } } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	const decode = async file => {
		const image = new NativeImage(), done = new Promise( ( resolve, reject ) => { image.onload = resolve; image.onerror = reject; } );
		image.src = read( 'newer/textures/' + file ); await done;
		const canvas = createCanvas( image.width, image.height ), ctx = canvas.getContext( '2d' ); ctx.drawImage( image, 0, 0 );
		return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };
	};
	try { const api = await import( '../src/newer/render/r_newertextures.js?official-registration-' + Math.random() ); await run( { api, requests, decode } ); }
	finally {
		globalThis.fetch = saved.fetch;
		for ( const key of [ 'Image', 'document' ] ) if ( saved[ key ] ) Object.defineProperty( globalThis, key, saved[ key ] ); else delete globalThis[ key ];
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, values[ i ] ) ); mode.R_AnimSetClassicPass( saved.classic );
	}
}
async function terminal( api, name, texture ) {
	const end = Date.now() + 5000;
	while ( texture.userData.newerPending && Date.now() < end ) await new Promise( r => setTimeout( r, 5 ) );
	check( api.R_NewerTextureSettled( name, texture ) && ! texture.userData.newerPending, name + ' public upgrade reaches terminal state' );
}

Deno.test( 'all 45 actual native textures load their registered real images and height maps through the public interface', () => imagesFixture( async f => {
	await verifyFourTimesTrialDimensions();
	for ( const e of receipt.entries ) {
		const actual = await source( eligible( e ), e.name ), texture = actual.texture, nativeImage = texture.image;
		texture.offset.set( .125, .25 ); texture.repeat.set( 2, 3 );
		try {
			f.api.R_NewerTextureUpgrade( e.name, texture ); await terminal( f.api, e.name, texture );
			same( texture.userData.newerPicture, true, e.name + ' actual upgrade succeeds' ); same( texture.userData.classicImage, nativeImage, e.name + ' native image retained' );
			const diffuse = await f.decode( e.file ), height = await f.decode( e.normal.file );
			same( diffuse.width, actual.width * 4, e.name + ' artwork width is exactly 4x native' ); same( diffuse.height, actual.height * 4, e.name + ' artwork height is exactly 4x native' );
			same( texture.image.width, diffuse.width, e.name + ' decoded diffuse width' ); same( texture.image.height, diffuse.height, e.name + ' decoded diffuse height' );
			same( height.width, diffuse.width, e.name + ' registered height width' ); same( height.height, diffuse.height, e.name + ' registered height height' );
			if ( ! texture._fullbright ) bytesEqual( texture.image.data, diffuse.data, e.name + ' installed exact decoded artwork' );
			else {
				// Fullbright splitting redistributes each source pixel, never changes its
				// colour: diffuse + glow reconstructs the exact supplied HD picture.
				const glow = texture._fullbright.image.data;
				for ( let i = 0; i < diffuse.data.length; i += 4 ) for ( let c = 0; c < 3; c ++ ) same( texture.image.data[ i + c ] + glow[ i + c ], diffuse.data[ i + c ], e.name + ' diffuse/glow reconstruction' );
			}
			const bound = texture.userData.newerHeight;
			await verifyRegisteredNormalChannels( texture, e.normal, f.decode );
			same( bound.file, e.normal.file, e.name + ' registered relief file' ); same( bound.strength, e.normal.strength, e.name + ' registered relief strength' );
			same( bound.cap, e.normal.cap || 1.1, e.name + ' registered relief cap' );
			for ( let p = 0; p < bound.data.length; p ++ ) same( bound.data[ p ], Math.fround( height.data[ p * 4 ] / 255 ), e.name + ' installed height pixels' );
			for ( const file of [ e.file, e.normal.file ] ) check( f.requests.includes( 'newer/textures/' + file + '?v=' + index.version ), e.name + ' actual versioned image request ' + file );
			same( texture.offset.x, .125, e.name + ' U offset retained' ); same( texture.offset.y, .25, e.name + ' V offset retained' );
			same( texture.repeat.x, 2, e.name + ' U period retained' ); same( texture.repeat.y, 3, e.name + ' V period retained' );
			same( texture.wrapS, THREE.RepeatWrapping, e.name + ' native wrapping retained' );
			same( f.api.R_ClassicTexture( texture ).image.data, nativeImage.data, e.name + ' Classic twin uses native bytes' );
			same( f.api.R_NewerTexturesStatus( { textures: [ { name: e.name, gl_texture: texture } ] } ).ready, 1, e.name + ' actual material ready' );
		} finally { dispose( texture ); }
	}
} ) );

Deno.test( 'all 45 new source guards reject unrelated same-name original pixels without requesting HD artwork', () => imagesFixture( async f => {
	for ( const e of receipt.entries ) {
		const actual = await source( eligible( e ), e.name );
		// Reconstruct a native picture and alter one real RGB byte. Removing the
		// split glow carrier keeps this mutation visible to the fullbright-aware key.
		const changed = actual.rgba.slice(); changed[ 0 ] ^= 1;
		const texture = new THREE.DataTexture( changed, actual.width, actual.height ), original = texture.image;
		try {
			check( R_GlassTextureKey( texture ) !== e.key, e.name + ' negative source is different' );
			f.api.R_NewerTextureUpgrade( e.name, texture ); await terminal( f.api, e.name, texture );
			same( texture.userData.newerFallback, true, e.name + ' unknown identity falls back' ); same( texture.image, original, e.name + ' unknown original preserved' );
			same( f.requests.length, 0, e.name + ' no incorrect HD request' );
		} finally { dispose( texture ); dispose( actual.texture ); }
	}
	await flush();
} ) );
