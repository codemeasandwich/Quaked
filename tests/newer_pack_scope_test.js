// Newer content is Quake-family content (docs/hexen2/unified-host.md §2 rule 7): newer.pak, its rebuilt maps and loose
// Newer game files never shadow a Hexen II file. Shader and generated-normal assets, keyed by behaviour or native pixel
// identity, remain visible to every family.
import * as pak from '../src/engine/common/pak.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

const same = ( actual, expected, message ) => { if ( actual !== expected ) throw new Error( `${message}: ${actual} != ${expected}` ); };
const text = file => file === null ? null : new TextDecoder().decode( file.data );

function makePak( files ) {

	const enc = new TextEncoder(), names = Object.keys( files ), bodies = names.map( name => enc.encode( files[ name ] ) );
	let body = 0;
	for ( const bytes of bodies ) body += bytes.length;
	const buffer = new ArrayBuffer( 12 + body + names.length * 64 ), bytes = new Uint8Array( buffer ), view = new DataView( buffer );
	bytes.set( enc.encode( 'PACK' ) );
	view.setInt32( 4, 12 + body, true );
	view.setInt32( 8, names.length * 64, true );
	let at = 12;
	names.forEach( ( name, index ) => {

		bytes.set( bodies[ index ], at );
		bytes.set( enc.encode( name ), 12 + body + index * 64 );
		view.setInt32( 12 + body + index * 64 + 56, at, true );
		view.setInt32( 12 + body + index * 64 + 60, bodies[ index ].length, true );
		at += bodies[ index ].length;

	} );
	return buffer;

}

Deno.test( 'a Hexen-named file comes from the Hexen pack even when Newer has the same path', () => {

	const newer = pak.COM_LoadPackFile( 'newer.pak', makePak( {
		'maps/scope_test.bsp': 'newer original',
		'newer/textures/index.json': '{"version":1,"textures":{}}'
	} ) );
	const rebuilt = pak.COM_LoadPackFile( 'newer/maps.pak', makePak( { 'maps/scope_test.bsp': 'newer rebuilt' } ) );
	const hexen = pak.COM_LoadPackFile( 'hexen-scope.pak', makePak( { 'maps/scope_test.bsp': 'hexen native' } ) );

	pak.COM_SetNewerPack( newer );
	pak.COM_SetNewerMapsPack( rebuilt );
	pak.COM_AddPack( hexen );

	try {

		GameProfile_Set( 'hexen2' );
		pak.COM_SetNewerActive( true );
		pak.COM_SetNewerMapsEnabled( true );
		same( text( pak.COM_FindFile( 'maps/scope_test.bsp' ) ), 'hexen native', 'Hexen keeps its own map and newer maps are not consulted' );
		same( text( pak.COM_FindFile( 'maps/SCOPE_TEST.BSP' ) ), 'hexen native', 'the rule is case-insensitive' );

		GameProfile_Set( 'quake' );
		same( text( pak.COM_FindFile( 'maps/scope_test.bsp' ) ), 'newer rebuilt', 'Quake still gets the rebuilt map' );

	} finally {

		pak.COM_SetNewerActive( false );
		pak.COM_SetNewerMapsEnabled( false );
		pak.COM_SetNewerPack( null );
		GameProfile_Set( 'quake' );

	}

} );

Deno.test( 'game-agnostic Newer assets stay visible to Hexen; other Newer paths do not', () => {

	const newer = pak.COM_LoadPackFile( 'newer.pak', makePak( {
		'newer/shaders/scope.glsl': 'shader bytes',
		'newer/normals/scope.nm.gz': 'normal bytes',
		'newer/ui/scope.png': 'Quake-only UI art'
	} ) );
	pak.COM_SetNewerPack( newer );

	try {

		GameProfile_Set( 'hexen2' );
		pak.COM_SetNewerActive( true );
		same( text( pak.COM_FindFile( 'newer/shaders/scope.glsl' ) ), 'shader bytes', 'shaders are game-agnostic' );
		same( text( pak.COM_FindFile( 'newer/normals/scope.nm.gz' ) ), 'normal bytes', 'generated normal bakes are keyed by pixel identity' );
		same( pak.COM_FindFile( 'newer/ui/scope.png' ), null, 'other Newer paths are not served to Hexen' );

		GameProfile_Set( 'quake' );
		same( text( pak.COM_FindFile( 'newer/ui/scope.png' ) ), 'Quake-only UI art', 'Quake still sees all of newer.pak' );

	} finally {

		pak.COM_SetNewerActive( false );
		pak.COM_SetNewerPack( null );
		GameProfile_Set( 'quake' );

	}

} );
