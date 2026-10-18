import {ResourceURL} from '../src/platform/resource_paths.js';
// Newer Game's wall textures go only on the pictures they were made from (card [34e]): newer/textures/index.json's
// "sources" holds, for each upgraded name, the native-RGBA identities (R_GlassTextureKey) of Quake's own pictures by
// that name (tools/build_texture_sources.mjs). Through the public R_NewerTextureUpgrade with the real index and real
// textures from the shareware pack: Quake's own metal5_6 asks for its upgrade; unrelated same-name pixels keep native
// art; a name with no recorded source (Newer Game's own crate variants) still goes by name. Scourge of Armagon's
// real metal5_6 now selects its own exact-identity variant, while an altered expansion source still falls back.
import { readFileSync, existsSync } from './helpers/resource_fs.mjs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName, Mod_ClearAll } from '../src/engine/render/gl_model.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { COM_FindFile } from '../src/engine/common/pak.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const flush = async () => { for ( let i = 0; i < 5; i ++ ) await new Promise( r => setTimeout( r, 0 ) ); }; // the index, then the requests
const root = fileURLToPath( new URL( '../', import.meta.url ) ), sourceRoot = process.env.QUAKED_GAME_ROOT ? resolve( process.env.QUAKED_GAME_ROOT ) : root;
const packPath = ( id, legacy ) => process.env.QUAKED_GAME_ROOT ? resolve( sourceRoot, GAME_CATALOGUE_GAMES.find( g => g.id === id ).folders.find( f => f.startsWith( 'games/' ) ).slice( 6 ), 'pak0.pak' ) : resolve( root, legacy );
const pack = path => { const raw = readFileSync( path ); COM_AddPack( COM_LoadPackFile( path, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); console.log( 'TEXTURE_SOURCE_PACK ' + JSON.stringify( { source_root: sourceRoot, path, sha256: createHash( 'sha256' ).update( raw ).digest( 'hex' ) } ) ); };
const INDEX = JSON.parse( readFileSync( new URL( '../newer/textures/index.json', import.meta.url ), 'utf8' ) );
pack( packPath( 'shareware', 'games/shareware/pak0.pak' ) );
vid.fullbright = 256 - 32; // VID_Init's value, so the glowing colours are split out as in the game
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
// a texture and its fullbright part as their own copies (the next Mod_ClearAll disposes the model's)
const copy = texture => { const t = new THREE.DataTexture( texture.image.data.slice(), texture.image.width, texture.image.height ); if ( texture._fullbright ) t._fullbright = new THREE.DataTexture( texture._fullbright.image.data.slice(), texture.image.width, texture.image.height ); return t; };
const textureIn = ( map, name ) => { Mod_ClearAll(); const t = Mod_ForName( map, true ).textures.find( x => x?.name === name ); check( t, name + ' in ' + map ); return copy( t.gl_texture ); };
// the real textures, read before Newer Game is switched on (so the engine's own loader asks for nothing meanwhile)
const HIPNOTIC = packPath( 'hipnotic', 'resources/hipnotic/pak0.pak' );
const QUAKE_METAL = textureIn( 'maps/e1m2.bsp', 'metal5_6' );
let SCOURGE_METAL = null;
if ( existsSync( HIPNOTIC ) ) { pack( HIPNOTIC ); SCOURGE_METAL = textureIn( 'maps/hip2m4.bsp', 'metal5_6' ); }

// the real index over fetch, and an Image that records what is asked for and never arrives (so a request stays pending)
async function upgrades( run ) {
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ) };
	for ( const v of [ post.r_hdr, mode.r_newer_textures ] ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const asked = [];
	globalThis.fetch = async url => { check( ResourceURL(url,true).includes( 'textures/index.json' ), 'only the index is fetched: ' + url ); return { ok: true, json: async () => INDEX }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class { set src( url ) { asked.push( ResourceURL(url,true) ); } } } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'r_newer_textures', 1 );
	try {
		const module = await import( '../src/newer/render/r_newertextures.js?sources-' + Math.random() );
		await run( { upgrade: async ( name, texture ) => { asked.length = 0; module.R_NewerTextureUpgrade( name, texture ); await flush(); return [ ...asked ]; } } );
	} finally {
		globalThis.fetch = saved.fetch;
		for ( const k of [ 'Image', 'document' ] ) { if ( saved[ k ] ) Object.defineProperty( globalThis, k, saved[ k ] ); else delete globalThis[ k ]; }
		vars.Cvar_SetValue( 'r_hdr', 0 );
	}
}

Deno.test( 'the index records the pictures each upgrade was made from, and Quake\'s own match them', () => {
	check( INDEX.sources && Object.keys( INDEX.sources ).length > 300, 'sources for the upgraded names' );
	for ( const [ name, keys ] of Object.entries( INDEX.sources ) ) {
		check( INDEX.textures[ name ] !== undefined, name + ' is an upgraded name' );
		check( keys.length > 0 && keys.every( k => /^\d+x\d+:[0-9a-f]{16}$/.test( k ) ), name + ': identities as R_GlassTextureKey writes them' );
	}
	// every upgraded texture of a whole shareware level is one the upgrades were made from
	Mod_ClearAll();
	const world = Mod_ForName( 'maps/e1m2.bsp', true ); let n = 0;
	for ( const t of world.textures ) if ( t && INDEX.sources[ t.name ] ) { n ++; check( INDEX.sources[ t.name ].includes( R_GlassTextureKey( t.gl_texture ) ), t.name + ' in e1m2 matches its source' ); }
	check( n > 20, 'e1m2 has upgraded textures (' + n + ')' );
} );

Deno.test( 'Quake\'s metal5_6 gets its upgrade; the same name over other pixels keeps its own; an unrecorded name goes by name', () => upgrades( async f => {
	const quake = copy( QUAKE_METAL );
	const asked = await f.upgrade( 'metal5_6', quake );
	check( asked.some( u => u.includes( INDEX.textures.metal5_6 ) ), 'Quake\'s own asks for ' + INDEX.textures.metal5_6 + ': ' + asked );
	same( quake.userData.newerPending, true, 'and waits for it' );

	// one texel differs (one the fullbright part leaves to the picture itself)
	const other = copy( QUAKE_METAL ), fb = other._fullbright?.image.data, texel = [ ...Array( 64 * 64 ).keys() ].find( i => ! fb?.[ i * 4 + 3 ] );
	other.image.data[ texel * 4 ] ^= 0x40;
	const before = other.image;
	await f.upgrade( 'metal5_6', other );
	same( other.userData.newerFallback, true, 'other pixels keep their own picture' );
	same( other.userData.newerPending, false, 'and wait for none' );
	same( other.image, before, 'unchanged' );

	check( INDEX.sources.crate_dharma === undefined && INDEX.textures.crate_dharma, 'crate_dharma is upgraded with no recorded source' );
	const crate = copy( quake );
	check( ( await f.upgrade( 'crate_dharma', crate ) ).some( u => u.includes( INDEX.textures.crate_dharma ) ), 'goes by name, as before' );
} ) );

Deno.test( 'Scourge of Armagon\'s own metal5_6 (hip2m4) selects its own artwork and rejects unrelated pixels' + ( SCOURGE_METAL ? '' : ' [skipped: no ' + HIPNOTIC + ']' ), () => SCOURGE_METAL ? upgrades( async f => {
	const scourge = copy( SCOURGE_METAL );
	const key = R_GlassTextureKey( scourge ), variant = INDEX.ordinaryVariants?.metal5_6?.[ key ];
	check( ! INDEX.sources.metal5_6.includes( key ), 'its pixels are not Quake\'s' );
	check( variant?.file && variant.normal?.file, 'the exact expansion identity has its own complete binding' );
	const asked = await f.upgrade( 'metal5_6', scourge );
	check( asked.some( url => url.includes( variant.file ) ), 'asks for the expansion artwork' );
	check( asked.some( url => url.includes( variant.normal.file ) ), 'asks for the expansion relief' );
	check( ! asked.some( url => url === 'newer/textures/' + INDEX.textures.metal5_6 + '?v=' + INDEX.version ), 'does not substitute base-game art' );
	same( scourge.userData.newerPending, true, 'waits for its own artwork' );
	const unrelated = copy( SCOURGE_METAL ), fb = unrelated._fullbright?.image.data;
	const texel = [ ...Array( unrelated.image.width * unrelated.image.height ).keys() ].find( i => ! fb?.[ i * 4 + 3 ] );
	check( texel !== undefined, 'negative expansion fixture has a non-glowing texel' );
	unrelated.image.data[ texel * 4 ] ^= 0x40;
	const nativeImage = unrelated.image;
	same( ( await f.upgrade( 'metal5_6', unrelated ) ).length, 0, 'unknown expansion identity requests no artwork' );
	same( unrelated.userData.newerFallback, true, 'unknown expansion identity falls back' );
	same( unrelated.image, nativeImage, 'unknown expansion image preserved' );
} ) : undefined );
