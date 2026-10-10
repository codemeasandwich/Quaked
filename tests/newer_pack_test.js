import * as pak from '../src/engine/common/pak.js';
import { Lit_Parse, Ent_Parse, LIT_MAGIC } from '../src/engine/render/lit.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

// a pak of the given { name: text } files, the way tools/build_newer_pak.py writes one
function makePak( files ) {

	const enc = new TextEncoder();
	const names = Object.keys( files );
	const bodies = names.map( ( n ) => enc.encode( files[ n ] ) );
	let size = 12;
	for ( const b of bodies ) size += b.length;
	const buf = new ArrayBuffer( size + names.length * 64 );
	const bytes = new Uint8Array( buf );
	const view = new DataView( buf );
	bytes.set( enc.encode( 'PACK' ) );
	view.setInt32( 4, size, true );
	view.setInt32( 8, names.length * 64, true );

	let pos = 12;
	names.forEach( ( n, i ) => {

		bytes.set( bodies[ i ], pos );
		bytes.set( enc.encode( n ), size + i * 64 );
		view.setInt32( size + i * 64 + 56, pos, true );
		view.setInt32( size + i * 64 + 60, bodies[ i ].length, true );
		pos += bodies[ i ].length;

	} );

	return buf;

}

Deno.test( 'the Newer Game pack is only visible while Newer Game is on', () => {

	const p = pak.COM_LoadPackFile( 'newer.pak', makePak( { 'maps/e1m1.ent': '{ "classname" "worldspawn" }', 'newer/textures/index.json': '{"version":7,"textures":{"a":"a.webp"}}' } ) );
	pak.COM_SetNewerPack( p );

	try {

		assertEqual( pak.COM_NewerPackLoaded(), true, 'loaded' );

		pak.COM_SetNewerActive( false );
		assertEqual( pak.COM_FindFile( 'maps/e1m1.ent' ), null, 'not in New Game' );

		pak.COM_SetNewerActive( true );
		const f = pak.COM_FindFile( 'maps/E1M1.ent' );
		assertEqual( f !== null, true, 'in Newer Game (any case)' );
		assertEqual( new TextDecoder().decode( f.data ).indexOf( 'worldspawn' ) > 0, true, 'the file' );

		// its own files can be read either way
		pak.COM_SetNewerActive( false );
		assertEqual( pak.COM_NewerFile( 'newer/textures/index.json' ) !== null, true, 'NewerFile works when off (the loaders only run in Newer Game)' );
		assertEqual( pak.COM_NewerFile( 'newer/nothing.webp' ), null, 'missing file' );

	} finally {

		pak.COM_SetNewerActive( false );
		pak.COM_SetNewerPack( null );

	}

	assertEqual( pak.COM_NewerPackLoaded(), false, 'unloaded' );

} );

Deno.test( 'json comes out of the pack, and from the loose file without one', async () => {

	const p = pak.COM_LoadPackFile( 'newer.pak', makePak( { 'newer/textures/index.json': '{"version":7}' } ) );
	pak.COM_SetNewerPack( p );

	try {

		const j = await pak.COM_NewerJSON( 'newer/textures/index.json', 'nowhere.json' );
		assertEqual( j.version, 7, 'from the pack' );

		// a path with no file anywhere gives {}
		const none = await pak.COM_NewerJSON( 'newer/none.json', 'http://127.0.0.1:1/none.json' );
		assertEqual( Object.keys( none ).length, 0, 'nothing' );

		// no blob URLs here: the fallback is used
		assertEqual( typeof pak.COM_NewerURL( 'newer/textures/index.json', 'x' ), 'string', 'a URL' );
		assertEqual( pak.COM_NewerURL( 'newer/missing.webp', 'fallback.webp' ), 'fallback.webp', 'fallback for a missing file' );

	} finally {

		pak.COM_SetNewerPack( null );

	}

} );

Deno.test( 'LIT files: only the right size and version are taken', () => {

	const mono = 5;
	const file = new Uint8Array( 8 + mono * 3 );
	new DataView( file.buffer ).setUint32( 0, LIT_MAGIC, true );
	new DataView( file.buffer ).setInt32( 4, 1, true );
	for ( let i = 0; i < mono * 3; i ++ ) file[ 8 + i ] = i + 1;

	const lit = Lit_Parse( file, mono );
	assertEqual( lit.length, 15, 'three bytes for each' );
	assertEqual( lit[ 0 ], 1, 'first' );
	assertEqual( lit[ 14 ], 15, 'last' );

	assertEqual( Lit_Parse( file, mono + 1 ), null, 'too short for that map' );
	assertEqual( Lit_Parse( file, mono - 1 ), null, 'too long: another map layout' );
	assertEqual( Lit_Parse( file.slice( 0, 6 ), mono ), null, 'no data' );

	const wrong = file.slice();
	wrong[ 4 ] = 2;
	assertEqual( Lit_Parse( wrong, mono ), null, 'another version' );
	wrong[ 4 ] = 1; wrong[ 0 ] = 0;
	assertEqual( Lit_Parse( wrong, mono ), null, 'not a LIT file' );
	assertEqual( Lit_Parse( null, mono ), null, 'null' );

} );

Deno.test( 'an entity list file must hold entities', () => {

	const enc = new TextEncoder();
	assertEqual( Ent_Parse( enc.encode( '{\n"classname" "worldspawn"\n}\n' ) ) !== null, true, 'entities' );
	assertEqual( Ent_Parse( enc.encode( 'nothing here' ) ), null, 'no braces' );
	assertEqual( Ent_Parse( new Uint8Array( 0 ) ), null, 'empty' );

} );
