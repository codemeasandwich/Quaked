/**
 * Which palette entries glow (stay unlit) comes from each game's own gfx/colormap.lmp: Quake's last 32 colours do,
 * Hexen II has none. Treating Hexen II's indices 224+ as fullbright lit its golds and browns as bright yellow dots on
 * every lit wall (owner report, 20 October 2026).
 */
import { existsSync, readFileSync } from 'node:fs';
import { VID_FullbrightFromColormap } from '../src/engine/render/vid.js';

function check( condition, message ) { if ( ! condition ) throw new Error( message ); }

function colormapFromPak( path ) {

	if ( ! existsSync( path ) ) return null;
	const pak = readFileSync( path ), dirofs = pak.readInt32LE( 4 ), dirlen = pak.readInt32LE( 8 );
	for ( let at = dirofs; at < dirofs + dirlen; at += 64 ) {

		const name = pak.toString( 'latin1', at, at + 56 ).replace( /\0.*$/s, '' );
		if ( name === 'gfx/colormap.lmp' ) { const ofs = pak.readInt32LE( at + 56 ), len = pak.readInt32LE( at + 60 ); return new Uint8Array( pak.subarray( ofs, ofs + len ) ); }

	}
	return null;

}

Deno.test( 'the first fullbright index follows the colormap', () => {

	const quakeLike = new Uint8Array( 64 * 256 + 1 ), none = new Uint8Array( 64 * 256 + 1 );
	for ( let row = 0; row < 64; row ++ ) for ( let i = 0; i < 256; i ++ ) {

		quakeLike[ row * 256 + i ] = i >= 224 ? i : ( i + row ) & 0xff;
		none[ row * 256 + i ] = i === 0 || i === 255 ? i : ( i + row + 1 ) & 0xff;

	}
	check( VID_FullbrightFromColormap( quakeLike ) === 224, 'Quake-shaped colormap: 224' );
	check( VID_FullbrightFromColormap( none ) === 256, 'no fullbright entries: 256' );
	check( VID_FullbrightFromColormap( null ) === 224, 'no colormap keeps the Quake default' );

} );

Deno.test( 'the owned games: Quake 224, Hexen II none', () => {

	const quake = colormapFromPak( '/Users/bri/quaked/Quake/pak0.pak' ), hexen = colormapFromPak( '/Users/bri/quaked/Hexen 2/data1/pak0.pak' );
	if ( quake ) check( VID_FullbrightFromColormap( quake ) === 224, 'Quake\'s colormap glows from 224' );
	if ( hexen ) check( VID_FullbrightFromColormap( hexen ) === 256, 'Hexen II\'s colormap has no fullbright colours' );
	if ( ! quake && ! hexen ) console.log( 'SKIP: no owned colormaps' );

} );
