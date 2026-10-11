// Card [44k]: what the model loader makes, as one digest, so the split of gl_model.js can be shown to load maps and
// models identically. Every model in the shareware pak (its maps with their inline models, the alias models and the
// sprites) is loaded through Mod_ForName and serialised whole: every own property, nested objects in the order first
// met (each object once; later meetings name it by number, so the BSP tree's shared and parent links count), every
// typed array's bytes and every texture's pixels. A map and its inline models are digested as soon as it loads (the
// next map writes over the shared *1, *2 ... entries); the alias models and sprites once everything is loaded. Random ids (three.js `uuid`) and three.js `version` counters are left
// out. The digest of all is printed (and each model's with MODEL_DIGEST_LIST=1); the test checks the set loads. Run it
// on the commit before the split and after each step: the printed digests must be equal (two runs on one commit are).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import * as model from '../src/engine/render/gl_model.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const raw = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
const archive = pak.COM_LoadPackFile( 'pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) );
pak.COM_AddPack( archive ); VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data );
const SKIP = new Set( [ 'uuid', 'version', 'id' ] );

// a model's digest: a depth-first walk, objects numbered as first met
function digest( root ) {
	const h = createHash( 'sha256' ), seen = new Map(), stack = [ [ '', root ] ];
	while ( stack.length ) {
		const [ key, v ] = stack.pop();
		h.update( key + '=' );
		if ( v === null || v === undefined || typeof v !== 'object' && typeof v !== 'function' ) { h.update( typeof v + ':' + String( v ) + ';' ); continue; }
		if ( typeof v === 'function' ) { h.update( 'fn;' ); continue; }
		if ( seen.has( v ) ) { h.update( '#' + seen.get( v ) + ';' ); continue; }
		seen.set( v, seen.size );
		if ( ArrayBuffer.isView( v ) ) { h.update( v.constructor.name + '[' + v.length + ']' ); h.update( new Uint8Array( v.buffer, v.byteOffset, v.byteLength ) ); h.update( ';' ); continue; }
		if ( v instanceof ArrayBuffer ) { h.update( 'ArrayBuffer[' + v.byteLength + ']' ); h.update( new Uint8Array( v ) ); h.update( ';' ); continue; }
		const keys = Array.isArray( v ) ? [ ...v.keys() ].map( String ) : Object.keys( v ).filter( k => ! SKIP.has( k ) );
		h.update( ( v.constructor?.name || 'Object' ) + '{' + keys.length + '}' );
		for ( let i = keys.length - 1; i >= 0; i -- ) stack.push( [ keys[ i ], v[ keys[ i ] ] ] );
	}
	return h.digest( 'hex' );
}

function loadAll() {
	model.Mod_Init();
	const names = [ ...archive.files.map( f => f.name ) ].filter( n => /^(maps\/[^/]+\.bsp|progs\/[^/]+\.(mdl|spr|bsp))$/.test( n ) ).sort();
	const out = [], later = [];
	for ( const name of names ) {
		const m = model.Mod_ForName( name, true );
		if ( name.startsWith( 'maps/' ) ) {
			// a map and its inline models are digested at once: the next map's load writes over the shared *1, *2 ... entries
			out.push( [ name, digest( m ) ] );
			for ( let i = 1; i < ( m.numsubmodels || 0 ); i ++ ) out.push( [ name + ' *' + i, digest( model.Mod_ForName( '*' + i, true ) ) ] );
		} else later.push( [ name, m ] );
	}
	// the alias models and sprites once everything is loaded: a cached one is the same object every later load sees
	return [ ...out, ...later.map( ( [ n, m ] ) => [ n, digest( m ) ] ) ];
}

Deno.test( 'every shareware model loads; the digest of all of them is printed for the split', () => {
	const all = loadAll();
	check( all.length > 100, 'the maps, their inline models, the alias models and sprites (' + all.length + ')' );
	check( all.filter( ( [ n ] ) => / \*\d+$/.test( n ) ).length > 20, 'with the maps\' inline models' );
	const digestAll = createHash( 'sha256' ).update( all.map( ( [ n, d ] ) => n + ' ' + d ).join( '\n' ) ).digest( 'hex' );
	console.log( 'MODEL DIGEST ' + digestAll + ' (' + all.length + ' models)' );
	if ( process.env.MODEL_DIGEST_LIST ) for ( const [ n, d ] of all ) console.log( 'MODEL ' + d.slice( 0, 16 ) + ' ' + n );
} );
