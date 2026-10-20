/**
 * The string-returning builtins' temp area is sized per game (pr_edict.js PR_LoadProgs): Quake keeps WinQuake's single
 * 128-byte slot, Hexen II the native sixteen rotating 1024-byte buffers. A Quake program must never be handed an offset
 * beyond its slot, which would read back empty or overwrite the strings that follow (the map's own strings).
 */
import { PR_SetTempString, PR_SetStringTempOfs, PR_SetStringsData, PR_GetString, PR_SetStrings } from '../src/engine/progs/progs.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

function check( condition, message ) { if ( ! condition ) throw new Error( message ); }

function arena( numstrings, tempSize, following ) {

	const data = new Uint8Array( numstrings + tempSize + following.length + 1 );
	for ( let i = 0; i < following.length; i ++ ) data[ numstrings + tempSize + i ] = following.charCodeAt( i );
	PR_SetStringsData( data );
	PR_SetStrings( '' );
	PR_SetStringTempOfs( numstrings );
	return data;

}

Deno.test( 'Quake keeps one 128-byte temp slot and never writes past it', () => {

	GameProfile_Set( 'quake' );
	const data = arena( 100, 128, 'TARGETNAME' );
	const first = PR_SetTempString( 'first' ), second = PR_SetTempString( 'second' );
	check( first === 100 && second === 100, `Quake reuses its one slot: ${first} ${second}` );
	check( PR_GetString( second ) === 'second', 'the latest value reads back' );
	const long = PR_SetTempString( 'x'.repeat( 500 ) );
	check( PR_GetString( long ).length === 127, 'a long value is cut to 127 characters' );
	check( String.fromCharCode( ...data.subarray( 228, 238 ) ) === 'TARGETNAME', 'the following map string is untouched' );

} );

Deno.test( 'Hexen II rotates sixteen 1024-byte temp buffers', () => {

	GameProfile_Set( 'hexen2' );
	arena( 100, 16 * 1024, '' );
	const offsets = Array.from( { length: 17 }, ( _, i ) => PR_SetTempString( 'v' + i ) );
	check( offsets[ 1 ] === 100 + 1024 && offsets[ 16 ] === offsets[ 0 ], 'native rotation: ' + offsets.slice( 0, 2 ) );
	check( PR_GetString( offsets[ 15 ] ) === 'v15', 'a recent value is still readable' );
	GameProfile_Set( 'quake' );

} );
