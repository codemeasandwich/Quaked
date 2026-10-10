/**
 * @module engine/common/common
 *
 * Shared engine basics (WinQuake common.c/.h): size buffers, message read/write, byte order, links, string parsing
 * (`COM_Parse`), registered-game detection.
 *
 * Types: exported classes `sizebuf_t`, `link_t`.
 *
 * State: mutable exports `msg_readcount`, `msg_badread`, `net_message`, `com_token`, `com_argc`, `com_argv`,
 * `standard_quake`, `rogue`, `hipnotic`; module-level variables `_realConPrintf`, `_realConDPrintf`.
 *
 * Errors: calls `Sys_Error` (fatal) at 2 places.
 */
// Ported from: WinQuake/common.c -- misc functions used in client and server
// + WinQuake/common.h -- general definitions

import { Sys_Error } from './sys.js';
import { cvar_t, Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from './cvar.js';
import { COM_FindFile } from './pak.js';

// Native WinQuake/common.c pop[] identity, checked as big-endian words.
// https://github.com/id-Software/Quake/blob/master/WinQuake/common.c
const REGISTERED_POP = [
	0,0,0,0,0,0,0,0,
	0,0,0x6600,0,0,0,0x6600,0,
	0,0x0066,0,0,0,0,0x0067,0,
	0,0x6665,0,0,0,0,0x0065,0x6600,
	0x0063,0x6561,0,0,0,0,0x0061,0x6563,
	0x0064,0x6561,0,0,0,0,0x0061,0x6564,
	0x0064,0x6564,0,0x6469,0x6969,0x6400,0x0064,0x6564,
	0x0063,0x6568,0x6200,0x0064,0x6864,0,0x6268,0x6563,
	0,0x6567,0x6963,0x0064,0x6764,0x0063,0x6967,0x6500,
	0,0x6266,0x6769,0x6a68,0x6768,0x6a69,0x6766,0x6200,
	0,0x0062,0x6566,0x6666,0x6666,0x6666,0x6562,0,
	0,0,0x0062,0x6364,0x6664,0x6362,0,0,
	0,0,0,0x0062,0x6662,0,0,0,
	0,0,0,0x0061,0x6661,0,0,0,
	0,0,0,0,0x6500,0,0,0,
	0,0,0,0,0x6400,0,0,0
];

/**
 * Decides whether the registered (full) game data is present and records the answer in the `registered` cvar. Runs
 * once during `Host_Init`, after the command system is up and the paks are mounted.
 *
 * It looks up `gfx/pop.lmp` through the pak search path and accepts it only when the file is exactly 256 bytes and its
 * 128 big-endian 16-bit words match WinQuake common.c's `pop[]` table. The `registered` cvar is registered here
 * (default '0', not archived) if nothing has registered it yet, then set to '1' or '0'.
 *
 * Reuses the native registered cvar rather than changing programs or hub gates. This is derived content state, never
 * an archived player preference. A missing or corrupt marker keeps shareware behaviour without making startup fatal.
 *
 * @returns {boolean} true when the registered marker lump is present and valid
 */
export function COM_CheckRegistered() {
	if ( ! Cvar_FindVar( 'registered' ) ) Cvar_RegisterVariable( new cvar_t( 'registered', '0', false ) );
	const marker = COM_FindFile( 'gfx/pop.lmp' );
	const valid = marker?.size === 256 && REGISTERED_POP.every( ( word, i ) =>
		( marker.data[ i * 2 ] << 8 | marker.data[ i * 2 + 1 ] ) === word );
	Cvar_Set( 'registered', valid ? '1' : '0' );
	return valid;
}

//============================================================================
// common.h types
//============================================================================

export class sizebuf_t {

	/**
	 * Creates an empty size buffer (WinQuake common.h `sizebuf_t`) with no storage: `data` stays null until `SZ_Alloc`
	 * gives it a `Uint8Array` of `maxsize` bytes. `cursize` is the number of bytes written so far. Used for network
	 * messages, the command buffer and server datagrams.
	 */
	constructor() {

		this.allowoverflow = false; // if false, do a Sys_Error
		this.overflowed = false; // set to true if the buffer size failed
		this.data = null; // Uint8Array
		this.maxsize = 0;
		this.cursize = 0;

	}

}

export class link_t {

	/**
	 * Creates a node of a circular doubly linked list (WinQuake common.h `link_t`), initially linked to itself so it can
	 * serve as an empty list head. Used for the world's area-node trigger and solid lists and each edict's `area` link.
	 */
	constructor() {

		this.prev = this;
		this.next = this;

	}

}

//============================================================================
// Linked list operations
//============================================================================

/**
 * Makes `l` an empty list by pointing both of its links at itself. ClearLink is used for new headnodes.
 *
 * @param {link_t} l list head to reset (mutated)
 */
export function ClearLink( l ) {

	l.prev = l.next = l;

}

/**
 * Unlinks `l` from the list it is in by joining its neighbours. `l`'s own `prev`/`next` are left pointing at the old
 * neighbours, so it must not be removed twice without being reinserted.
 *
 * @param {link_t} l node to remove (its neighbours are mutated)
 */
export function RemoveLink( l ) {

	l.next.prev = l.prev;
	l.prev.next = l.next;

}

/**
 * Inserts `l` immediately before `before`. Passing a list head appends `l` at the end of that list, which is how
 * `SV_LinkEdict` adds an edict to an area node's trigger or solid list.
 *
 * @param {link_t} l node to insert (mutated; must not currently be in a list)
 * @param {link_t} before node or list head that `l` goes in front of (mutated)
 */
export function InsertLinkBefore( l, before ) {

	l.next = before;
	l.prev = before.prev;
	l.prev.next = l;
	l.next.prev = l;

}

/**
 * Inserts `l` immediately after `after`. Passing a list head prepends `l` to that list.
 *
 * @param {link_t} l node to insert (mutated; must not currently be in a list)
 * @param {link_t} after node or list head that `l` follows (mutated)
 */
export function InsertLinkAfter( l, after ) {

	l.next = after.next;
	l.prev = after;
	l.prev.next = l;
	l.next.prev = l;

}

//============================================================================
// Q_ato* functions - parse numbers same way as Quake
//============================================================================

/**
 * Parses an integer the way Quake's `Q_atoi` does: an optional leading '-', then either `0x`/`0X` hex digits, a
 * quoted character (`'c` gives its character code), or decimal digits. Parsing stops at the first character that does
 * not fit, so trailing text is ignored. Leading whitespace and '+' are not accepted (they give 0). Used for console
 * command arguments and command-line parameters.
 *
 * @param {string} str text to parse
 * @returns {number} the parsed integer, 0 when no digits were found (hex values use 32-bit shifts, so they wrap past
 *   0x7fffffff)
 */
export function Q_atoi( str ) {

	let pos = 0;
	let sign = 1;
	let val = 0;

	if ( str.charAt( pos ) === '-' ) {

		sign = - 1;
		pos ++;

	}

	// check for hex
	if ( str.charAt( pos ) === '0' && ( str.charAt( pos + 1 ) === 'x' || str.charAt( pos + 1 ) === 'X' ) ) {

		pos += 2;
		while ( pos < str.length ) {

			const c = str.charAt( pos );
			pos ++;
			if ( c >= '0' && c <= '9' )
				val = ( val << 4 ) + c.charCodeAt( 0 ) - 48;
			else if ( c >= 'a' && c <= 'f' )
				val = ( val << 4 ) + c.charCodeAt( 0 ) - 87;
			else if ( c >= 'A' && c <= 'F' )
				val = ( val << 4 ) + c.charCodeAt( 0 ) - 55;
			else
				return val * sign;

		}

		return val * sign;

	}

	// check for character
	if ( str.charAt( pos ) === '\'' ) {

		return sign * str.charCodeAt( pos + 1 );

	}

	// assume decimal
	while ( pos < str.length ) {

		const c = str.charAt( pos );
		pos ++;
		if ( c < '0' || c > '9' )
			return val * sign;
		val = val * 10 + c.charCodeAt( 0 ) - 48;

	}

	return val * sign;

}

/**
 * Parses a number the way Quake's `Q_atof` does: an optional leading '-', then `0x`/`0X` hex digits, a quoted
 * character (`'c` gives its character code), or decimal digits with an optional '.' fraction. No exponent form;
 * parsing stops at the first character that does not fit. Leading whitespace and '+' give 0. Used for console command
 * arguments such as the movement variables in `cl_pred.js`.
 *
 * @param {string} str text to parse
 * @returns {number} the parsed value, 0 when no digits were found
 */
export function Q_atof( str ) {

	let pos = 0;
	let sign = 1;
	let val = 0;

	if ( str.charAt( pos ) === '-' ) {

		sign = - 1;
		pos ++;

	}

	// check for hex
	if ( str.charAt( pos ) === '0' && ( str.charAt( pos + 1 ) === 'x' || str.charAt( pos + 1 ) === 'X' ) ) {

		pos += 2;
		while ( pos < str.length ) {

			const c = str.charAt( pos );
			pos ++;
			if ( c >= '0' && c <= '9' )
				val = ( val * 16 ) + c.charCodeAt( 0 ) - 48;
			else if ( c >= 'a' && c <= 'f' )
				val = ( val * 16 ) + c.charCodeAt( 0 ) - 87;
			else if ( c >= 'A' && c <= 'F' )
				val = ( val * 16 ) + c.charCodeAt( 0 ) - 55;
			else
				return val * sign;

		}

		return val * sign;

	}

	// check for character
	if ( str.charAt( pos ) === '\'' ) {

		return sign * str.charCodeAt( pos + 1 );

	}

	// assume decimal
	let decimal = - 1;
	let total = 0;
	while ( pos < str.length ) {

		const c = str.charAt( pos );
		pos ++;
		if ( c === '.' ) {

			decimal = total;
			continue;

		}

		if ( c < '0' || c > '9' )
			break;
		val = val * 10 + c.charCodeAt( 0 ) - 48;
		total ++;

	}

	if ( decimal === - 1 )
		return val * sign;
	while ( total > decimal ) {

		val /= 10;
		total --;

	}

	return val * sign;

}

//============================================================================
// Byte order functions
// JavaScript is always little-endian for DataView, but we use typed arrays
// which are platform-endian (little-endian on all modern platforms)
//============================================================================

/**
 * Byte-order no-op kept for ported call sites: values are already decoded little-endian by the caller's DataView or
 * typed array, so the 16-bit value is returned unchanged.
 *
 * @param {number} l 16-bit integer already in host order
 * @returns {number} `l` unchanged
 */
export function LittleShort( l ) { return l; }
/**
 * Byte-order no-op kept for ported call sites (for example the demo reader in `cl_demo.js`): the 32-bit value is
 * returned unchanged.
 *
 * @param {number} l 32-bit integer already in host order
 * @returns {number} `l` unchanged
 */
export function LittleLong( l ) { return l; }
/**
 * Byte-order no-op kept for ported call sites (for example the demo reader in `cl_demo.js`): the float is returned
 * unchanged.
 *
 * @param {number} l float already in host order
 * @returns {number} `l` unchanged
 */
export function LittleFloat( l ) { return l; }

//============================================================================
// sizebuf operations
//============================================================================

/**
 * Gives `buf` fresh zeroed storage and empties it. Called once per buffer at init (the network message, the client's
 * outgoing message, the command buffer); any earlier `data` array is replaced, not reused.
 *
 * @param {sizebuf_t} buf buffer to set up (mutated: `data`, `maxsize`, `cursize`)
 * @param {number} startsize capacity in bytes; raised to 256 when smaller
 */
export function SZ_Alloc( buf, startsize ) {

	if ( startsize < 256 )
		startsize = 256;
	buf.data = new Uint8Array( startsize );
	buf.maxsize = startsize;
	buf.cursize = 0;

}

/**
 * Empties `buf`. Unlike WinQuake, which frees the hunk memory, this only resets `cursize`; the `data` array is kept
 * and released only when `buf` itself is dropped. No current caller uses it.
 *
 * @param {sizebuf_t} buf buffer to empty (mutated)
 */
export function SZ_Free( buf ) {

	buf.cursize = 0;

}

/**
 * Empties `buf` by resetting `cursize` to 0, keeping its storage and its `overflowed` flag. Called before each new
 * message is built and when an overflowing buffer is discarded.
 *
 * @param {sizebuf_t} buf buffer to empty (mutated)
 */
export function SZ_Clear( buf ) {

	buf.cursize = 0;

}

/**
 * Reserves `length` bytes at the end of `buf` and returns where they start; the caller writes into `buf.data` at that
 * offset. When the bytes do not fit and `buf.allowoverflow` is set, the buffer's current contents are thrown away
 * (`overflowed` set, "SZ_GetSpace: overflow" printed, buffer cleared) and the space is taken from offset 0.
 *
 * @param {sizebuf_t} buf buffer to grow (mutated: `cursize`, maybe `overflowed`)
 * @param {number} length bytes to reserve
 * @returns {number} byte offset into `buf.data` of the reserved space
 * @throws {Error} via `Sys_Error` when the bytes do not fit and `allowoverflow` is false, or when `length` exceeds
 *   `maxsize`
 */
export function SZ_GetSpace( buf, length ) {

	if ( buf.cursize + length > buf.maxsize ) {

		if ( ! buf.allowoverflow )
			Sys_Error( 'SZ_GetSpace: overflow without allowoverflow set' );

		if ( length > buf.maxsize )
			Sys_Error( 'SZ_GetSpace: ' + length + ' is > full buffer size' );

		buf.overflowed = true;
		Con_Printf( 'SZ_GetSpace: overflow' );
		SZ_Clear( buf );

	}

	const offset = buf.cursize;
	buf.cursize += length;

	return offset; // return offset into buf.data

}

/**
 * Appends the first `length` bytes of `data` to `buf`. A string is written one byte per character (the low 8 bits of
 * each character code); no terminator is added unless it is part of `data`.
 *
 * @param {sizebuf_t} buf buffer to append to (mutated)
 * @param {string|Uint8Array|ArrayLike<number>} data bytes or characters to copy
 * @param {number} length number of bytes to copy from the start of `data`
 * @throws {Error} via `SZ_GetSpace` when `buf` overflows without `allowoverflow`
 */
export function SZ_Write( buf, data, length ) {

	const offset = SZ_GetSpace( buf, length );
	if ( typeof data === 'string' ) {

		for ( let i = 0; i < length; i ++ )
			buf.data[ offset + i ] = data.charCodeAt( i );

	} else {

		for ( let i = 0; i < length; i ++ )
			buf.data[ offset + i ] = data[ i ];

	}

}

/**
 * Appends `data` as a NUL-terminated string, joining it to a string already in `buf`: when the last byte is a
 * trailing 0 it is overwritten, so repeated calls build one continuous string. `Cmd_ForwardToServer` uses it to
 * build a `clc_stringcmd` in the client's outgoing message.
 *
 * @param {sizebuf_t} buf buffer to append to (mutated)
 * @param {string} data text to append, one byte per character (low 8 bits)
 * @throws {Error} via `SZ_GetSpace` when `buf` overflows without `allowoverflow`
 */
export function SZ_Print( buf, data ) {

	const len = data.length + 1;

	if ( buf.cursize > 0 && buf.data[ buf.cursize - 1 ] !== 0 ) {

		// no trailing 0
		const offset = SZ_GetSpace( buf, len );
		for ( let i = 0; i < data.length; i ++ )
			buf.data[ offset + i ] = data.charCodeAt( i );
		buf.data[ offset + data.length ] = 0;

	} else {

		// write over trailing 0
		if ( buf.cursize > 0 ) buf.cursize --;
		const offset = SZ_GetSpace( buf, len );
		for ( let i = 0; i < data.length; i ++ )
			buf.data[ offset + i ] = data.charCodeAt( i );
		buf.data[ offset + data.length ] = 0;

	}

}

//===========================================================================
// MESSAGE IO FUNCTIONS
//
// Handles byte ordering and avoids alignment errors
//===========================================================================

// Cached buffers for float conversion to avoid per-call allocations (Golden Rule #4)
const _floatWriteBuf = new ArrayBuffer( 4 );
const _floatWriteView = new DataView( _floatWriteBuf );
const _floatReadBuf = new ArrayBuffer( 4 );
const _floatReadView = new DataView( _floatReadBuf );

// writing functions

/**
 * Appends one signed byte to a message.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} c value -128..127 (only the low 8 bits are kept)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteChar( sb, c ) {

	const offset = SZ_GetSpace( sb, 1 );
	sb.data[ offset ] = c & 0xff;

}

/**
 * Appends one unsigned byte to a message (svc/clc opcodes, flags, small counts).
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} c value 0..255 (only the low 8 bits are kept)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteByte( sb, c ) {

	const offset = SZ_GetSpace( sb, 1 );
	sb.data[ offset ] = c & 0xff;

}

/**
 * Appends a 16-bit integer to a message, little-endian.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} c value -32768..32767 or 0..65535 (only the low 16 bits are kept)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteShort( sb, c ) {

	const offset = SZ_GetSpace( sb, 2 );
	sb.data[ offset ] = c & 0xff;
	sb.data[ offset + 1 ] = ( c >> 8 ) & 0xff;

}

/**
 * Appends a 32-bit integer to a message, little-endian.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} c 32-bit integer (signed or unsigned; only the low 32 bits are kept)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteLong( sb, c ) {

	const offset = SZ_GetSpace( sb, 4 );
	sb.data[ offset ] = c & 0xff;
	sb.data[ offset + 1 ] = ( c >> 8 ) & 0xff;
	sb.data[ offset + 2 ] = ( c >> 16 ) & 0xff;
	sb.data[ offset + 3 ] = ( c >> 24 ) & 0xff;

}

/**
 * Appends a 32-bit IEEE float to a message, little-endian (rounded to single precision). Uses a module-level
 * DataView, so it allocates nothing per call.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} f value to send (for example server time in seconds)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteFloat( sb, f ) {

	_floatWriteView.setFloat32( 0, f, true ); // little-endian
	const offset = SZ_GetSpace( sb, 4 );
	sb.data[ offset ] = _floatWriteView.getUint8( 0 );
	sb.data[ offset + 1 ] = _floatWriteView.getUint8( 1 );
	sb.data[ offset + 2 ] = _floatWriteView.getUint8( 2 );
	sb.data[ offset + 3 ] = _floatWriteView.getUint8( 3 );

}

/**
 * Appends a NUL-terminated string to a message, one byte per character (low 8 bits). An empty, null or undefined
 * string writes just the terminator.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {?string} s text to send
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteString( sb, s ) {

	if ( ! s ) {

		SZ_Write( sb, '\0', 1 );

	} else {

		SZ_Write( sb, s + '\0', s.length + 1 );

	}

}

/**
 * Appends a world coordinate as a 16-bit fixed-point value in 1/8 Quake-unit steps (truncated toward zero).
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} f coordinate in Quake units; representable range -4096..4095.875, values outside wrap
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteCoord( sb, f ) {

	MSG_WriteShort( sb, ( f * 8 ) | 0 );

}

/**
 * Appends an angle as one byte: the angle is first truncated to whole degrees, then scaled so 256 steps make a full
 * turn (1.40625 degrees per step). Negative and over-360 angles wrap.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} f angle in degrees
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteAngle( sb, f ) {

	MSG_WriteByte( sb, ( ( f | 0 ) * 256 / 360 ) & 255 );

}

/**
 * QuakeWorld-style 16-bit angle (more precision). The angle is truncated to whole degrees, then scaled so 65536 steps
 * make a full turn. Used by `sv_main.js` for the angles of a usercmd.
 *
 * @param {sizebuf_t} sb message being built (mutated)
 * @param {number} f angle in degrees (wraps outside 0..360)
 * @throws {Error} via `SZ_GetSpace` when `sb` overflows without `allowoverflow`
 */
export function MSG_WriteAngle16( sb, f ) {

	MSG_WriteShort( sb, ( ( f | 0 ) * 65536 / 360 ) & 65535 );

}

// reading functions

export let msg_readcount = 0;
export let msg_badread = false;

// net_message: canonical instance lives in net.js; set via COM_SetNetMessage during init
export let net_message = null;
/**
 * Points the exported `net_message` binding (read by all `MSG_Read*` functions) at the canonical buffer. Called once by
 * `NET_Init` after it allocates that buffer.
 *
 * @param {sizebuf_t} msg the network module's received-message buffer; kept for the rest of the session
 */
export function COM_SetNetMessage( msg ) { net_message = msg; }

/**
 * Rewinds reading to the start of `net_message` and clears `msg_badread`. Called before parsing each received
 * message, by the client (`cl_parse.js`) for server messages and by the server (`sv_user.js`) for client messages.
 */
export function MSG_BeginReading() {

	msg_readcount = 0;
	msg_badread = false;

}

/**
 * Reads one signed byte from `net_message` at `msg_readcount` and advances past it. Returns -1 and sets
 * `msg_badread` if no more characters are available (a real -1 byte is indistinguishable without checking the flag).
 *
 * @returns {number} -128..127, or -1 past the end
 */
export function MSG_ReadChar() {

	if ( msg_readcount + 1 > net_message.cursize ) {

		msg_badread = true;
		return - 1;

	}

	// signed char
	let c = net_message.data[ msg_readcount ];
	if ( c > 127 ) c -= 256;
	msg_readcount ++;

	return c;

}

/**
 * Reads one unsigned byte from `net_message` at `msg_readcount` and advances past it.
 *
 * @returns {number} 0..255, or -1 (with `msg_badread` set) past the end
 */
export function MSG_ReadByte() {

	if ( msg_readcount + 1 > net_message.cursize ) {

		msg_badread = true;
		return - 1;

	}

	const c = net_message.data[ msg_readcount ];
	msg_readcount ++;

	return c;

}

/**
 * Reads a little-endian signed 16-bit integer from `net_message` and advances 2 bytes.
 *
 * @returns {number} -32768..32767, or -1 (with `msg_badread` set) when fewer than 2 bytes remain
 */
export function MSG_ReadShort() {

	if ( msg_readcount + 2 > net_message.cursize ) {

		msg_badread = true;
		return - 1;

	}

	let c = net_message.data[ msg_readcount ]
		+ ( net_message.data[ msg_readcount + 1 ] << 8 );

	// sign extend
	if ( c > 32767 ) c -= 65536;

	msg_readcount += 2;

	return c;

}

/**
 * Reads a little-endian 32-bit integer from `net_message` and advances 4 bytes.
 *
 * @returns {number} signed 32-bit value, or -1 (with `msg_badread` set) when fewer than 4 bytes remain
 */
export function MSG_ReadLong() {

	if ( msg_readcount + 4 > net_message.cursize ) {

		msg_badread = true;
		return - 1;

	}

	const c = net_message.data[ msg_readcount ]
		+ ( net_message.data[ msg_readcount + 1 ] << 8 )
		+ ( net_message.data[ msg_readcount + 2 ] << 16 )
		+ ( net_message.data[ msg_readcount + 3 ] << 24 );

	msg_readcount += 4;

	return c;

}

/**
 * Reads a little-endian 32-bit IEEE float from `net_message` and advances 4 bytes. Uses a module-level DataView, so
 * it allocates nothing per call.
 *
 * @returns {number} the float, or -1 (with `msg_badread` set) when fewer than 4 bytes remain
 */
export function MSG_ReadFloat() {

	if ( msg_readcount + 4 > net_message.cursize ) {

		msg_badread = true;
		return - 1;

	}

	_floatReadView.setUint8( 0, net_message.data[ msg_readcount ] );
	_floatReadView.setUint8( 1, net_message.data[ msg_readcount + 1 ] );
	_floatReadView.setUint8( 2, net_message.data[ msg_readcount + 2 ] );
	_floatReadView.setUint8( 3, net_message.data[ msg_readcount + 3 ] );
	msg_readcount += 4;

	return _floatReadView.getFloat32( 0, true ); // little-endian

}

/**
 * Reads a NUL-terminated string from `net_message`, at most 2047 characters, stopping at the terminator or the end of
 * the message. Characters are read with `MSG_ReadChar`, so as in WinQuake a 0xFF byte also ends the string and bytes
 * 0x80..0xFE come back as char codes 0xFF80..0xFFFE.
 *
 * @returns {string} the text without its terminator ('' when nothing was left)
 */
export function MSG_ReadString() {

	// Use array.join() instead of string concatenation to avoid O(n²) allocations
	const chars = [];

	while ( chars.length < 2047 ) {

		const c = MSG_ReadChar();
		if ( c === - 1 || c === 0 )
			break;
		chars.push( String.fromCharCode( c ) );

	}

	return chars.join( '' );

}

/**
 * Reads a world coordinate written by `MSG_WriteCoord` (16-bit, 1/8 Quake-unit steps).
 *
 * @returns {number} coordinate in Quake units, -4096..4095.875 (-0.125 with `msg_badread` set past the end)
 */
export function MSG_ReadCoord() {

	return MSG_ReadShort() * ( 1.0 / 8 );

}

/**
 * Reads a one-byte angle written by `MSG_WriteAngle`. The byte is read signed, so the result is -180..178.59375.
 *
 * @returns {number} angle in degrees (-1.40625 with `msg_badread` set past the end)
 */
export function MSG_ReadAngle() {

	return MSG_ReadChar() * ( 360.0 / 256 );

}

/**
 * QuakeWorld-style 16-bit angle (more precision), written by `MSG_WriteAngle16`. Used by `cl_parse.js` for usercmd
 * angles. The short is read signed, so the result is -180..about 179.995.
 *
 * @returns {number} angle in degrees (about -0.0055 with `msg_badread` set past the end)
 */
export function MSG_ReadAngle16() {

	return MSG_ReadShort() * ( 360.0 / 65536 );

}

//============================================================================
// Path/string utility functions
//============================================================================

/**
 * Strips the directory part of a path ('/' separators only; backslashes are not treated as separators).
 *
 * @param {string} pathname path such as 'maps/e1m1.bsp'
 * @returns {string} the text after the last '/', or `pathname` itself when it has none
 */
export function COM_SkipPath( pathname ) {

	let last = 0;
	for ( let i = 0; i < pathname.length; i ++ ) {

		if ( pathname.charAt( i ) === '/' )
			last = i + 1;

	}

	return pathname.substring( last );

}

/**
 * Removes the extension from a filename: everything from the last '.' on. Note the '.' is searched in the whole
 * string, so a dot in a directory name of an extensionless file is also cut.
 *
 * @param {string} _in filename or path
 * @returns {string} `_in` without its extension, or `_in` unchanged when it has no '.'
 */
export function COM_StripExtension( _in ) {

	const dot = _in.lastIndexOf( '.' );
	if ( dot === - 1 ) return _in;
	return _in.substring( 0, dot );

}

/**
 * Returns a filename's extension: the text after the last '.' in the string (case preserved, no dot).
 *
 * @param {string} _in filename or path
 * @returns {string} the extension, or '' when `_in` has no '.'
 */
export function COM_FileExtension( _in ) {

	const dot = _in.lastIndexOf( '.' );
	if ( dot === - 1 ) return '';
	return _in.substring( dot + 1 );

}

/**
 * Returns a path's bare file name, without directory or extension ('progs/player.mdl' gives 'player'). `Mod_LoadModel`
 * uses it to set the model's `loadname`.
 *
 * @param {string} _in path with '/' separators
 * @returns {string} the name between the last '/' and the last '.' after it
 */
export function COM_FileBase( _in ) {

	const slash = _in.lastIndexOf( '/' );
	const dot = _in.lastIndexOf( '.' );
	const start = slash >= 0 ? slash + 1 : 0;
	const end = dot > start ? dot : _in.length;
	return _in.substring( start, end );

}

/**
 * Appends `extension` when the last path component has no '.'; used for demo names ('.dem').
 *
 * @param {string} path filename or path
 * @param {string} extension extension to add, including the leading '.'
 * @returns {string} `path` unchanged if its file part already has an extension, else `path + extension`
 */
export function COM_DefaultExtension( path, extension ) {

	// if path doesn't have a .EXT, append extension
	// (extension should include the .)
	const slash = path.lastIndexOf( '/' );
	const dot = path.lastIndexOf( '.' );
	if ( dot > slash ) return path; // it has an extension
	return path + extension;

}

/*
==============
COM_Parse
==============
*/
export let com_token = '';

/**
 * Parse a token out of a string. Skips whitespace (any character code <= 32) and `//` line comments, then takes one
 * token: a double-quoted string (quotes removed, may contain spaces; an unterminated quote runs to the end), one of
 * the single-character tokens `{ } ( ) ' :`, or a run of other non-space characters. The token is stored in the
 * exported `com_token` (set to '' first, and replaced on every call). Used to walk entity text and savegames
 * (`pr_edict.js`, `host_cmd.js`) and to tokenize command text (`cmd.js`).
 *
 * @param {?string} data text still to parse
 * @returns {?string} the text after the token, to pass to the next call; null when `data` is null/undefined or holds
 *   no more tokens (`com_token` is then '')
 */
export function COM_Parse( data ) {

	let pos = 0;
	com_token = '';

	if ( data === null || data === undefined )
		return null;

	// skip whitespace
	while ( true ) {

		if ( pos >= data.length )
			return null; // end of file

		const c = data.charCodeAt( pos );
		if ( c > 32 ) break; // 32 = space
		pos ++;

	}

	let c = data.charAt( pos );

	// skip // comments
	if ( c === '/' && data.charAt( pos + 1 ) === '/' ) {

		while ( pos < data.length && data.charAt( pos ) !== '\n' )
			pos ++;
		return COM_Parse( data.substring( pos ) );

	}

	// handle quoted strings specially
	if ( c === '"' ) {

		pos ++;
		let token = '';
		while ( pos < data.length ) {

			c = data.charAt( pos );
			pos ++;
			if ( c === '"' || ! c ) {

				com_token = token;
				return data.substring( pos );

			}

			token += c;

		}

		com_token = token;
		return data.substring( pos );

	}

	// parse single characters
	if ( c === '{' || c === '}' || c === ')' || c === '(' || c === '\'' || c === ':' ) {

		com_token = c;
		return data.substring( pos + 1 );

	}

	// parse a regular word
	let token = '';
	while ( pos < data.length ) {

		c = data.charAt( pos );
		if ( c === '{' || c === '}' || c === ')' || c === '(' || c === '\'' || c === ':' )
			break;
		if ( c.charCodeAt( 0 ) <= 32 )
			break;
		token += c;
		pos ++;

	}

	com_token = token;
	return data.substring( pos );

}

//============================================================================
// Command line args
//============================================================================

export let com_argc = 0;
export let com_argv = [];

export let standard_quake = true;
export let rogue = false;
export let hipnotic = false;

/**
 * Stores the command-line arguments in `com_argc`/`com_argv`. Called once at startup from `main.js` (with an empty
 * array in the browser build); `com_argv[0]` is treated as the program name and skipped by `COM_CheckParm`.
 *
 * @param {Array<string>} argv argument list; kept by reference, not copied
 */
export function COM_InitArgv( argv ) {

	com_argc = argv.length;
	com_argv = argv;

}

/**
 * Looks for a command-line parameter (exact, case-sensitive match), skipping `com_argv[0]` and empty entries.
 *
 * @param {string} parm parameter to find, such as '-port'
 * @returns {number} its index in `com_argv` (the value, if any, is at index + 1), or 0 when absent
 */
export function COM_CheckParm( parm ) {

	for ( let i = 1; i < com_argc; i ++ ) {

		if ( ! com_argv[ i ] ) continue;
		if ( com_argv[ i ] === parm ) return i;

	}

	return 0;

}

//============================================================================
// Console print stub (routes to real console when initialized)
//============================================================================

let _realConPrintf = null;
let _realConDPrintf = null;

/**
 * Routes this module's `Con_Printf`/`Con_DPrintf` to the real console. Called once by `Host_Init` right after
 * `Con_Init`, with console.js's `Con_Printf` and `Con_DPrintf`; until then output goes to the browser console.
 * The functions are kept for the rest of the session.
 *
 * @param {(fmt: string, ...args: *) => void} conPrintf real console print
 * @param {(fmt: string, ...args: *) => void} conDPrintf real developer-only print
 */
export function Con_SetPrintFunctions( conPrintf, conDPrintf ) {

	_realConPrintf = conPrintf;
	_realConDPrintf = conDPrintf;

}

/**
 * Prints to the game console. Lets modules that cannot import console.js print; once `Con_SetPrintFunctions` has run,
 * arguments are passed to the real `Con_Printf` (printf-style formatting), before that to `console.log`.
 *
 * @param {string} fmt message or printf-style format string
 * @param {...*} args values for the format
 */
export function Con_Printf( fmt, ...args ) {

	if ( _realConPrintf !== null ) {

		_realConPrintf( fmt, ...args );

	} else {

		// Fallback before console is initialized
		console.log( fmt, ...args );

	}

}

/**
 * Developer-only console print. Once `Con_SetPrintFunctions` has run, the real `Con_DPrintf` prints only while the
 * `developer` cvar is set; before that every message goes to `console.debug`.
 *
 * @param {string} fmt message or printf-style format string
 * @param {...*} args values for the format
 */
export function Con_DPrintf( fmt, ...args ) {

	if ( _realConDPrintf !== null ) {

		_realConDPrintf( fmt, ...args );

	} else {

		// debug printf - only prints when developer cvar is set
		console.debug( fmt, ...args );

	}

}
