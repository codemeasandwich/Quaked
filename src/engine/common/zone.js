/**
 * @module engine/common/zone
 *
 * Memory management (WinQuake zone.c), kept as an API: JavaScript allocates, so the hunk, zone and cache calls only
 * track names and sizes.
 *
 * Types: exported classes `cache_user_t`.
 *
 * State: no mutable exports; module-level variables `hunk_low_mark`, `hunk_high_mark`, `hunk_temp_active`,
 * `hunk_temp_mark`, `zone_allocated`; 1 module-level collection (Map/Set).
 *
 * Errors: calls `Sys_Error` (fatal) at 3 places.
 */
// Ported from: WinQuake/zone.c + zone.h -- memory allocation
//
// In JavaScript we have garbage collection, so the complex hunk/zone/cache
// memory management from C is simplified. We keep the API surface for
// compatibility with the rest of the port but let JS handle actual allocation.

import { Sys_Error } from './sys.js';
import { Con_Printf, Con_DPrintf } from './common.js';

/*
Memory layout in original Quake (for reference):

------ Top of Memory -------
high hunk allocations
video buffer / z buffer / surface cache
cachable memory
client and server low hunk allocations
startup hunk allocations
Zone block
----- Bottom of Memory -----

In JS, we simplify:
- Zone = general small allocations (just use JS objects)
- Hunk = level-load allocations (just use JS objects, track for clearing)
- Cache = persistable data across levels (Map with LRU eviction)
- Temp = temporary allocations (just use JS objects)
*/

// cache_user_t equivalent
export class cache_user_t {

	/**
	 * The handle a caller keeps for a cache entry (WinQuake zone.h cache_user_t). `data` is null until `Cache_Alloc`
	 * fills it and is set back to null by `Cache_Free` or `Cache_Flush`, so a null `data` means "reload it". Models and
	 * sounds currently use plain `{ data }` objects or null in its place rather than this class.
	 */
	constructor() {

		this.data = null;

	}

}

// Track hunk marks for level transitions
let hunk_low_mark = 0;
let hunk_high_mark = 0;
let hunk_temp_active = false;
let hunk_temp_mark = 0;

// Zone allocations - in JS just track for debugging
let zone_allocated = 0;

// Cache system - simple Map-based LRU
const cache_entries = new Map(); // name -> { data, user, size }
const cache_lru = []; // ordered from most recent to least recent

/*
========================
Memory_Init
========================
*/
/**
 * Starts memory management at engine start-up (called first in `Host_Init`): empties the cache and prints
 * `Memory initialized (JavaScript GC mode)` to the console. Unlike WinQuake zone.c it takes no memory block, since
 * JavaScript allocates.
 */
export function Memory_Init() {

	Cache_Init();
	Con_Printf( 'Memory initialized (JavaScript GC mode)\n' );

}

/*
=============================================================================

						ZONE MEMORY ALLOCATION

Zone memory in JS is just regular allocations tracked for debugging.
=============================================================================
*/

/*
========================
Z_Malloc
========================
*/
/**
 * Returns zero-filled memory (WinQuake zone.c). In JS, returns an ArrayBuffer or object: here always a new
 * zero-filled `ArrayBuffer`, and adds `size` to the debugging total that `Z_FreeMemory` reads. No current caller.
 *
 * @param {number} size bytes (a non-negative integer; `new ArrayBuffer` throws a RangeError otherwise)
 * @returns {ArrayBuffer} a new zero-filled buffer of `size` bytes, owned by the caller
 */
export function Z_Malloc( size ) {

	zone_allocated += size;
	return new ArrayBuffer( size );

}

/*
========================
Z_Free
========================
*/
/**
 * Releases zone memory (WinQuake zone.c). A no-op: the garbage collector frees `ptr` once nothing references it, and
 * the debugging total is not reduced (we could track and subtract from `zone_allocated` but it is not critical). No
 * current caller.
 *
 * @param {*} ptr the block from `Z_Malloc`; ignored
 */
export function Z_Free( ptr ) {

	// In JS, just let GC handle it
	// We could track and subtract from zone_allocated but it's not critical

}

/*
========================
Z_FreeMemory
========================
*/
/**
 * Approximates the free zone memory, as if the zone were 1 MiB (0x100000 bytes) and nothing were ever freed. No
 * current caller.
 *
 * @returns {number} bytes: 1048576 minus all bytes ever requested through `Z_Malloc` (negative once they exceed 1 MiB)
 */
export function Z_FreeMemory() {

	return 0x100000 - zone_allocated; // approximate

}

/*
=============================================================================

						HUNK MEMORY ALLOCATION

In JS, hunk allocations are regular allocations. We track marks so
level transitions can conceptually "free" old data.
=============================================================================
*/

/*
===================
Hunk_AllocName
===================
*/
/**
 * Allocates level-load memory from the low hunk (WinQuake zone.c). In JS, just allocates a new zero-filled
 * `ArrayBuffer` and raises the low mark by `size`; the buffer lives as long as the caller references it (dropping
 * the mark with `Hunk_FreeToLowMark` does not free it). No current caller.
 *
 * @param {number} size bytes (a non-negative integer; `new ArrayBuffer` throws a RangeError otherwise)
 * @param {string} name a debugging label, unused
 * @returns {ArrayBuffer} a new zero-filled buffer of `size` bytes
 */
export function Hunk_AllocName( size, name ) {

	// In JS, just allocate. The name is for debugging.
	const buf = new ArrayBuffer( size );
	hunk_low_mark += size;
	return buf;

}

/*
===================
Hunk_Alloc
===================
*/
/**
 * `Hunk_AllocName` with the name `unknown` (WinQuake zone.c). No current caller.
 *
 * @param {number} size bytes (a non-negative integer)
 * @returns {ArrayBuffer} a new zero-filled buffer of `size` bytes
 */
export function Hunk_Alloc( size ) {

	return Hunk_AllocName( size, 'unknown' );

}

/**
 * Reads the low hunk mark, which a caller saves before a level loads so `Hunk_FreeToLowMark` can return to it
 * (WinQuake zone.c). No current caller.
 *
 * @returns {number} bytes allocated through `Hunk_AllocName` since start-up or the last `Hunk_FreeToLowMark`
 */
export function Hunk_LowMark() {

	return hunk_low_mark;

}

/**
 * Sets the low hunk mark back to `mark` (WinQuake zone.c). In JS this only moves the counter; the memory itself is
 * freed by the garbage collector when its references are dropped. No current caller.
 *
 * @param {number} mark a value from `Hunk_LowMark` (bytes)
 */
export function Hunk_FreeToLowMark( mark ) {

	hunk_low_mark = mark;
	// In JS, actual memory freed by GC when references dropped

}

/**
 * Reads the high hunk mark (WinQuake zone.c). If a `Hunk_TempAlloc` block is outstanding it is released first, so
 * the mark returned never includes temporary space. Called by `Hunk_TempAlloc`.
 *
 * @returns {number} bytes allocated through `Hunk_HighAllocName` (a counter, not an address)
 */
export function Hunk_HighMark() {

	if ( hunk_temp_active ) {

		hunk_temp_active = false;
		Hunk_FreeToHighMark( hunk_temp_mark );

	}

	return hunk_high_mark;

}

/**
 * Sets the high hunk mark back to `mark`, first releasing an outstanding `Hunk_TempAlloc` block (WinQuake zone.c).
 * Only the counter moves; the garbage collector frees the buffers. Called by the other hunk functions to drop a
 * temporary block.
 *
 * @param {number} mark a value from `Hunk_HighMark` (bytes)
 */
export function Hunk_FreeToHighMark( mark ) {

	if ( hunk_temp_active ) {

		hunk_temp_active = false;
		Hunk_FreeToHighMark( hunk_temp_mark );

	}

	hunk_high_mark = mark;

}

/*
===================
Hunk_HighAllocName
===================
*/
/**
 * Allocates from the high hunk (WinQuake zone.c): releases an outstanding `Hunk_TempAlloc` block, raises the high
 * mark by `size` and returns a new zero-filled `ArrayBuffer`. Called by `Hunk_TempAlloc`.
 *
 * @param {number} size bytes (a non-negative integer; `new ArrayBuffer` throws a RangeError otherwise)
 * @param {string} name a debugging label, unused
 * @returns {ArrayBuffer} a new zero-filled buffer of `size` bytes
 */
export function Hunk_HighAllocName( size, name ) {

	if ( hunk_temp_active ) {

		Hunk_FreeToHighMark( hunk_temp_mark );
		hunk_temp_active = false;

	}

	hunk_high_mark += size;
	return new ArrayBuffer( size );

}

/*
=================
Hunk_TempAlloc
=================
*/
/**
 * Return space from the top of the hunk (WinQuake zone.c): a temporary block that stays valid only until the next
 * hunk high-side call (`Hunk_TempAlloc`, `Hunk_HighMark`, `Hunk_FreeToHighMark`, `Hunk_HighAllocName`), which
 * winds the high mark back over it. In JS the buffer itself stays usable while referenced; only the mark is
 * reclaimed. No current caller.
 *
 * @param {number} size bytes (a non-negative integer)
 * @returns {ArrayBuffer} a new zero-filled buffer of `size` bytes
 */
export function Hunk_TempAlloc( size ) {

	if ( hunk_temp_active ) {

		Hunk_FreeToHighMark( hunk_temp_mark );
		hunk_temp_active = false;

	}

	hunk_temp_mark = Hunk_HighMark();
	const buf = Hunk_HighAllocName( size, 'temp' );
	hunk_temp_active = true;

	return buf;

}

/**
 * Checks the hunk for corruption in WinQuake zone.c. A no-op in JS (the only call site, in cl_parse.js, is commented
 * out).
 */
export function Hunk_Check() {

	// No-op in JS

}

/*
=============================================================================

						CACHE MEMORY

In JS we use a simple Map with LRU tracking.
=============================================================================
*/

/*
============
Cache_Init
============
*/
function Cache_Init() {

	cache_entries.clear();
	cache_lru.length = 0;

}

/*
============
Cache_Flush
============
*/
/**
 * Throw everything out, so new data will be demand cached (WinQuake zone.c): sets every entry's `user.data` to null
 * and empties the cache and its LRU list. No current caller.
 */
export function Cache_Flush() {

	for ( const [ name, entry ] of cache_entries ) {

		if ( entry.user ) {

			entry.user.data = null;

		}

	}

	cache_entries.clear();
	cache_lru.length = 0;

}

/*
==============
Cache_Free
==============
*/
/**
 * Frees the memory and removes it from the LRU list (WinQuake zone.c): drops the entry whose user is `c` and sets
 * `c.data` to null. No current caller.
 *
 * @param {cache_user_t} c the handle passed to `Cache_Alloc`; mutated
 * @throws {Error} via `Sys_Error` when `c.data` is not set (`Cache_Free: not allocated`)
 */
export function Cache_Free( c ) {

	if ( ! c.data )
		Sys_Error( 'Cache_Free: not allocated' );

	// Find and remove from cache
	for ( const [ name, entry ] of cache_entries ) {

		if ( entry.user === c ) {

			cache_entries.delete( name );
			const idx = cache_lru.indexOf( name );
			if ( idx !== - 1 ) cache_lru.splice( idx, 1 );
			break;

		}

	}

	c.data = null;

}

/*
==============
Cache_Check
==============
*/
/**
 * Returns the cached data, and moves to the head of the LRU list if present, otherwise returns null (WinQuake
 * zone.c). Nothing is ever evicted here, so `data` is lost only through `Cache_Free` or `Cache_Flush`. gl_model.js
 * keeps its own equivalent check instead of calling this.
 *
 * @param {cache_user_t} c the handle to look up
 * @returns {?ArrayBuffer} `c.data`, or null when it is not allocated (the caller must reload it)
 */
export function Cache_Check( c ) {

	if ( ! c.data )
		return null;

	// Move to front of LRU
	for ( const [ name, entry ] of cache_entries ) {

		if ( entry.user === c ) {

			const idx = cache_lru.indexOf( name );
			if ( idx !== - 1 ) {

				cache_lru.splice( idx, 1 );
				cache_lru.unshift( name );

			}

			break;

		}

	}

	return c.data;

}

/*
==============
Cache_Alloc
==============
*/
/**
 * Allocates a cache entry for `c` (WinQuake zone.c): stores a new zero-filled `ArrayBuffer` in `c.data`, records it
 * under `name` and puts it at the head of the LRU list. A second entry with the same `name` replaces the first in the
 * map. The entry lives until `Cache_Free` or `Cache_Flush`. No current caller.
 *
 * @param {cache_user_t} c the handle to fill; mutated
 * @param {number} size bytes, greater than 0
 * @param {string} name the cache key
 * @returns {ArrayBuffer} the new buffer (also in `c.data`)
 * @throws {Error} via `Sys_Error` when `c.data` is already set (`Cache_Alloc: already allocated`) or `size` is 0 or
 * less (`Cache_Alloc: size <size>`)
 */
export function Cache_Alloc( c, size, name ) {

	if ( c.data )
		Sys_Error( 'Cache_Alloc: already allocated' );

	if ( size <= 0 )
		Sys_Error( 'Cache_Alloc: size ' + size );

	const data = new ArrayBuffer( size );
	c.data = data;

	cache_entries.set( name, { data: data, user: c, size: size } );
	cache_lru.unshift( name );

	return data;

}

/*
============
Cache_Report
============
*/
/**
 * Prints the total size of the cache entries as `<n> megabyte data cache` (one decimal, MiB) with `Con_DPrintf`
 * (developer output) (WinQuake zone.c). Its call in cl_main.js is
 * commented out.
 */
export function Cache_Report() {

	let total = 0;
	for ( const [ name, entry ] of cache_entries ) {

		total += entry.size;

	}

	Con_DPrintf( ( total / ( 1024 * 1024 ) ).toFixed( 1 ) + ' megabyte data cache\n' );

}
