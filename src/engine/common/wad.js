/**
 * @module engine/common/wad
 *
 * WAD2 lump files (WinQuake wad.c), used for `gfx.wad`'s 2D pictures.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `wad_numlumps`, `wad_lumps`, `wad_base`.
 *
 * Errors: calls `Sys_Error` (fatal) at 3 places.
 */
// Ported from: WinQuake/wad.c + wad.h -- WAD file loading

import { Sys_Error } from './sys.js';

//===============
//   TYPES
//===============

export const CMP_NONE = 0;
export const CMP_LZSS = 1;

export const TYP_NONE = 0;
export const TYP_LABEL = 1;

export const TYP_LUMPY = 64; // 64 + grab command number
export const TYP_PALETTE = 64;
export const TYP_QTEX = 65;
export const TYP_QPIC = 66;
export const TYP_SOUND = 67;
export const TYP_MIPTEX = 68;

export let wad_numlumps = 0;
export let wad_lumps = null;
export let wad_base = null;

/*
==================
W_CleanupName
==================
*/
/**
 * Normalizes a lump name for comparison: ASCII letters lowercased, cut at the first NUL or after 16 characters (the
 * length of `lumpinfo_t->name`). Applied to every lump name at load and to every looked-up name.
 *
 * WinQuake's version "lowercases name and pads with spaces and a terminating 0 to the length of lumpinfo_t->name,
 * used so lumpname lookups can proceed rapidly by comparing 4 chars at a time; space padding is so names can be
 * printed nicely in tables; can safely be performed in place". This port compares whole strings, so it does not pad
 * and returns a new string instead of working in place.
 *
 * @param {string} inStr lump name as stored or requested
 * @returns {string} lowercased name of at most 16 characters
 */
export function W_CleanupName( inStr ) {

	let out = '';
	for ( let i = 0; i < 16; i ++ ) {

		if ( i >= inStr.length ) break;
		let c = inStr.charCodeAt( i );
		if ( c === 0 ) break;

		if ( c >= 65 && c <= 90 ) // 'A' to 'Z'
			c += 32; // to lowercase
		out += String.fromCharCode( c );

	}

	return out;

}

/*
====================
W_LoadWadFile
====================
*/
/**
 * Loads a WAD2 file (in practice `gfx.wad`, once from `Host_Init`) and builds its lump directory. The exported
 * `wad_base` keeps a byte view over `data` and `wad_lumps` the directory (`filepos`, `disksize`, `size` in bytes,
 * `type`, `compression`, cleaned `name`) until the next load; lump data is not copied. qpic headers need no swapping
 * here because they are read little-endian when used.
 *
 * @param {ArrayBuffer} data the whole file, as returned by `COM_LoadFile` (kept, so do not modify it afterwards)
 * @throws {Error} via `Sys_Error` when the file does not start with 'WAD2'
 */
export function W_LoadWadFile( data ) {

	// data is an ArrayBuffer
	wad_base = new Uint8Array( data );
	const view = new DataView( data );

	// check identification
	const id0 = wad_base[ 0 ];
	const id1 = wad_base[ 1 ];
	const id2 = wad_base[ 2 ];
	const id3 = wad_base[ 3 ];

	if ( id0 !== 0x57 || id1 !== 0x41 || id2 !== 0x44 || id3 !== 0x32 ) // 'WAD2'
		Sys_Error( 'W_LoadWadFile: not a WAD2 file' );

	wad_numlumps = view.getInt32( 4, true );
	const infotableofs = view.getInt32( 8, true );

	// parse lump info table
	wad_lumps = [];
	for ( let i = 0; i < wad_numlumps; i ++ ) {

		const offset = infotableofs + i * 32; // sizeof(lumpinfo_t) = 32
		const lump = {
			filepos: view.getInt32( offset, true ),
			disksize: view.getInt32( offset + 4, true ),
			size: view.getInt32( offset + 8, true ),
			type: wad_base[ offset + 12 ],
			compression: wad_base[ offset + 13 ],
			name: ''
		};

		// read name (16 bytes at offset + 16)
		let name = '';
		for ( let j = 0; j < 16; j ++ ) {

			const c = wad_base[ offset + 16 + j ];
			if ( c === 0 ) break;
			name += String.fromCharCode( c );

		}

		lump.name = W_CleanupName( name );

		// swap qpic if needed
		if ( lump.type === TYP_QPIC ) {

			// SwapPic - width and height are already little-endian on browser
			// (DataView handles byte order)

		}

		wad_lumps.push( lump );

	}

}

/*
=============
W_GetLumpinfo
=============
*/
/**
 * Finds a lump's directory entry by name (case-insensitive, via `W_CleanupName`) in the loaded wad.
 *
 * @param {string} name lump name such as 'conchars'
 * @returns {{ filepos: number, disksize: number, size: number, type: number, compression: number, name: string }}
 *   the entry from `wad_lumps` (shared; do not modify). Offsets and sizes are bytes into `wad_base`
 * @throws {Error} via `Sys_Error` when no lump has that name
 */
export function W_GetLumpinfo( name ) {

	const clean = W_CleanupName( name );

	for ( let i = 0; i < wad_numlumps; i ++ ) {

		if ( wad_lumps[ i ].name === clean )
			return wad_lumps[ i ];

	}

	Sys_Error( 'W_GetLumpinfo: ' + name + ' not found' );
	return null;

}

/*
=============
W_GetLumpName
=============
*/
/**
 * Locates a lump's data by name for the 2D drawing code (`Draw_Init`'s conchars, `Draw_PicFromWad`, which catches
 * the error for missing pictures). Rather than a DataView, it returns the whole wad byte array plus the lump's
 * position; nothing is copied.
 *
 * @param {string} name lump name (case-insensitive)
 * @returns {{ data: Uint8Array, offset: number, size: number }} `data` is `wad_base` (shared); the lump is
 *   `size` bytes starting at byte `offset`
 * @throws {Error} via `Sys_Error` when no lump has that name
 */
export function W_GetLumpName( name ) {

	const lump = W_GetLumpinfo( name );
	return {
		data: wad_base,
		offset: lump.filepos,
		size: lump.size
	};

}

/*
=============
W_GetLumpNum
=============
*/
/**
 * Locates a lump's data by its index in the wad directory. No current caller uses it.
 *
 * @param {number} num lump index, 0..`wad_numlumps` - 1
 * @returns {{ data: Uint8Array, offset: number, size: number }} `data` is `wad_base` (shared); the lump is
 *   `size` bytes starting at byte `offset`
 * @throws {Error} via `Sys_Error` when `num` is out of range
 */
export function W_GetLumpNum( num ) {

	if ( num < 0 || num >= wad_numlumps )
		Sys_Error( 'W_GetLumpNum: bad number: ' + num );

	const lump = wad_lumps[ num ];
	return {
		data: wad_base,
		offset: lump.filepos,
		size: lump.size
	};

}

/*
=============
SwapPic
=============
*/
/**
 * Reads a qpic header (width and height as little-endian 32-bit integers) at `offset`. In the original C this
 * byte-swaps the header in place; here it is kept for API compatibility and returns the decoded values instead.
 * No current caller uses it.
 *
 * @param {Uint8Array} data bytes holding the picture (for example `wad_base`)
 * @param {number} offset byte offset of the qpic header within `data`. The DataView is made relative to
 *   `data.buffer`, so this is only correct when `data` starts at byte 0 of its buffer
 * @returns {{ width: number, height: number, data: Uint8Array }} size in pixels and a view (not a copy) of the
 *   palette-index pixels that follow the 8-byte header
 */
export function SwapPic( data, offset ) {

	// In the original C, this byte-swaps width/height from little-endian.
	// JavaScript DataView handles this, so this is a no-op on little-endian systems.
	// We keep it for API compatibility.
	const view = new DataView( data.buffer, offset );
	return {
		width: view.getInt32( 0, true ),
		height: view.getInt32( 4, true ),
		data: data.subarray( offset + 8 )
	};

}
