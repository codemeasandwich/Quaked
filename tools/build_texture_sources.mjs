// Records which original pictures Newer Game's wall textures were made from (card [34e]): for every name in
// newer/textures/index.json's "textures", the native-RGBA identity (R_GlassTextureKey) of each picture Quake's own
// maps give that name, written to the index's "sources". An add-on that reuses a name for different pixels (Scourge
// of Armagon's metal5_6) then keeps its own picture rather than getting Quake's upgrade (r_newertextures.js).
//
//   QUAKED_THREE_MODULE=<three.module.js> node tools/build_texture_sources.mjs --pack games/shareware/pak0.pak --pack resources/id1/pak0.pak
//
// --pack is repeated in search-path order, Quake's own packs only. Reads the packs, never writes them; rewrites
// "sources" in the index and leaves its other entries as they are. Existing
// source allowlists are authored bindings: preserve them, including official
// expansion aliases not present in these base packs. Infer only unrecorded names;
// an explicit artwork/identity change requires reviewing that existing binding.
import { register } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { memberSearch, readMember, isolatedPack } from './pak_members.mjs';
const args = process.argv.slice( 2 ), packs = [];
for ( let i = 0; i < args.length; i ++ ) { if ( args[ i ] === '--pack' ) packs.push( args[ ++ i ] ); else throw Error( 'Unknown argument ' + args[ i ] ); }
if ( ! packs.length || ! process.env.QUAKED_THREE_MODULE ) throw Error( 'Provide --pack and QUAKED_THREE_MODULE' );
const three = pathToFileURL( resolve( process.env.QUAKED_THREE_MODULE ) ).href;
register( 'data:text/javascript,' + encodeURIComponent( "let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}" ), { data: { three } } );
const pak = await import( '../src/engine/common/pak.js' ), model = await import( '../src/engine/render/gl_model.js' ), vid = await import( '../src/engine/render/vid.js' );
await import( '../src/newer/install.js' ); // the hooks the model loader calls (no picture is fetched here: nothing awaits them)
const { R_GlassTextureKey } = await import( '../src/newer/render/r_newertextures.js' );

const members = await memberSearch( packs );
pak.COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( members.get( 'gfx/palette.lmp' ) ) ) );
vid.vid.fullbright = 256 - 32; // VID_Init's value (it needs a page): the palette's last 32 colours glow, split out as the game does
vid.VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); model.Mod_Init(); model.R_InitTextures();

const indexPath = 'newer/textures/index.json', index = JSON.parse( await readFile( indexPath, 'utf8' ) );
const keys = new Map(), maps = [ ...members.keys() ].filter( n => /^maps\/[^/]+\.bsp$/.test( n ) ).sort();
for ( const name of maps ) {

	model.Mod_ClearAll();
	pak.COM_AddPack( isolatedPack( name, await readMember( members.get( name ) ) ) );
	const world = model.Mod_ForName( name, true );
	for ( const t of world.textures ) {

		if ( ! t || index.textures[ t.name ] === undefined ) continue;
		const key = R_GlassTextureKey( t.gl_texture );
		if ( key ) { if ( ! keys.has( t.name ) ) keys.set( t.name, new Set() ); keys.get( t.name ).add( key ); }

	}

}
const preserved = index.sources || {}, combined = { ...preserved };
for ( const [ name, identities ] of keys ) if ( ! Object.hasOwn( combined, name ) ) combined[ name ] = [ ...identities ].sort();
const sources = Object.fromEntries( Object.entries( combined ).sort( ( a, b ) => a[ 0 ] < b[ 0 ] ? - 1 : 1 ) );
// Preserve historical sources-last formatting. A manifest may now put ordinary
// variants or metadata after sources: use semantic JSON serialization there,
// rather than slicing away those later siblings. Refuse concurrent index edits.
const text = await readFile( indexPath, 'utf8' ), current = JSON.parse( text );
if ( JSON.stringify(current) !== JSON.stringify(index) ) throw Error('Texture index changed during source scan; not overwritten');
const at = text.indexOf( ',\n "sources": ' ), sourceLast = Object.keys(current).at(-1) === 'sources';
const block = Object.entries( sources ).map( ( [ n, s ] ) => '  ' + JSON.stringify( n ) + ': [' + s.map( k => JSON.stringify( k ) ).join( ', ' ) + ']' ).join( ',\n' );
if ( at >= 0 && sourceLast || !Object.hasOwn(current,'sources') ) {
 const body = at >= 0 ? text.slice(0,at) : text.trimEnd().replace(/\n}$/,'');
 await writeFile(indexPath,body+',\n "sources": {\n'+block+'\n }\n}\n');
} else {
 current.sources=sources;await writeFile(indexPath,JSON.stringify(current,null,1)+'\n');
}
JSON.parse( await readFile( indexPath, 'utf8' ) ); // still JSON
const missing = Object.keys( index.textures ).filter( n => ! keys.has( n ) );
console.log( `${maps.length} maps; ${keys.size} catalogued names observed; ${Object.keys(sources).length} source bindings (${Object.keys(preserved).length} preserved); ${[ ...keys.values() ].filter( s => s.size > 1 ).length} observed with more than one picture; not in these maps: ${missing.join( ' ' ) || 'none'}` );
