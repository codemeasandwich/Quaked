// Newer Game's wall textures go only on the pictures they were made from (card [34e]): newer/textures/index.json's
// "sources" holds, for each upgraded name, the native-RGBA identities (R_GlassTextureKey) of Quake's own pictures by
// that name (tools/build_texture_sources.mjs). Through the public R_NewerTextureUpgrade with the real index and real
// textures from the shareware pack: Quake's own metal5_6 asks for its upgrade; the same name over other pixels (as
// Scourge of Armagon's) keeps its own picture and asks for nothing; a name with no recorded source (Newer Game's own
// crate variants) still goes by name. With the owner's Scourge of Armagon pack, its real metal5_6 is checked too.
import { readFileSync, existsSync } from 'node:fs';
import * as THREE from 'three';
import { COM_LoadPackFile, COM_AddPack } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName, Mod_ClearAll } from '../src/engine/render/gl_model.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { COM_FindFile } from '../src/engine/common/pak.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const flush = async () => { for ( let i = 0; i < 5; i ++ ) await new Promise( r => setTimeout( r, 0 ) ); }; // the index, then the requests
const pack = path => { const raw = readFileSync( new URL( '../' + path, import.meta.url ) ); COM_AddPack( COM_LoadPackFile( path, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) ); };
const INDEX = JSON.parse( readFileSync( new URL( '../newer/textures/index.json', import.meta.url ), 'utf8' ) );
pack( 'games/shareware/pak0.pak' );
vid.fullbright = 256 - 32; // VID_Init's value, so the glowing colours are split out as in the game
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
// a texture and its fullbright part as their own copies (the next Mod_ClearAll disposes the model's)
const copy = texture => { const t = new THREE.DataTexture( texture.image.data.slice(), texture.image.width, texture.image.height ); if ( texture._fullbright ) t._fullbright = new THREE.DataTexture( texture._fullbright.image.data.slice(), texture.image.width, texture.image.height ); return t; };
const textureIn = ( map, name ) => { Mod_ClearAll(); const t = Mod_ForName( map, true ).textures.find( x => x?.name === name ); check( t, name + ' in ' + map ); return copy( t.gl_texture ); };
// the real textures, read before Newer Game is switched on (so the engine's own loader asks for nothing meanwhile)
const HIPNOTIC = new URL( '../resources/hipnotic/pak0.pak', import.meta.url );
const QUAKE_METAL = textureIn( 'maps/e1m2.bsp', 'metal5_6' );
let SCOURGE_METAL = null;
if ( existsSync( HIPNOTIC ) ) { pack( 'resources/hipnotic/pak0.pak' ); SCOURGE_METAL = textureIn( 'maps/hip2m4.bsp', 'metal5_6' ); }

// the real index over fetch, and an Image that records what is asked for and never arrives (so a request stays pending)
async function upgrades( run ) {
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ) };
	for ( const v of [ post.r_hdr, mode.r_newer_textures ] ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const asked = [];
	globalThis.fetch = async url => { check( String( url ).includes( 'textures/index.json' ), 'only the index is fetched: ' + url ); return { ok: true, json: async () => INDEX }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class { set src( url ) { asked.push( String( url ) ); } } } );
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

Deno.test( 'Scourge of Armagon\'s own metal5_6 (hip2m4) keeps its look' + ( SCOURGE_METAL ? '' : ' [skipped: no resources/hipnotic/pak0.pak]' ), () => SCOURGE_METAL ? upgrades( async f => {
	const scourge = copy( SCOURGE_METAL );
	check( ! INDEX.sources.metal5_6.includes( R_GlassTextureKey( scourge ) ), 'its pixels are not Quake\'s' );
	same( ( await f.upgrade( 'metal5_6', scourge ) ).length, 0, 'asks for no upgrade' );
	same( scourge.userData.newerFallback, true, 'its own picture stays' );
} ) : undefined );
