/**
 * @module engine/server/hexen2_native_wire
 *
 * Translates the one native Hexen II service message the gamecode writes through builtin #52 into the unified
 * protocol: uhexen2's `svc_intermission` (30) carries a byte index, while Quake's id 30 means a Quake intermission. The
 * gamecode calls `WriteByte(MSG_ALL, SVC_INTERMISSION)` and then `WriteByte(MSG_ALL, index)`; the index is held until
 * the next byte and emitted as `svc_hexen2_intermission` (69) with the same body, so the shared client parser never
 * sees the native bodyless form. The guard on `intermission_running` keeps every other byte 30 untouched.
 *
 * Types: plain values and functions; no exported classes.
 * State: one pending-message marker per destination buffer.
 * Errors: none.
 */

import { GameProfile_IsHexen2 } from '../common/game_profile.js';
import { MSG_WriteByte } from '../common/common.js';
import { svc_hexen2_intermission } from '../common/protocol.js';
import { pr_global_struct, sv } from '../progs/progs.js';

// The native service id written by the gamecode and the byte that follows it.
const NATIVE_INTERMISSION = 30;
const pending = new WeakMap(); // sizebuf_t -> true while waiting for the native index byte

/**
 * Writes one byte from the gamecode's native message writers (#52/#53). For the native intermission opcode the write
 * is held until its index arrives and then rewritten as the unified message; every other byte is written as is.
 *
 * @param {sizebuf_t} msg the destination buffer
 * @param {number} value the byte
 * @returns {boolean} true when the module consumed the write
 */
export function Hexen2_WriteNativeServiceByte( msg, value ) {

	if ( !GameProfile_IsHexen2() || msg === null || msg === undefined ) return false;
	value = value | 0;
	if ( pending.has( msg ) ) {

		pending.delete( msg );
		if ( value >= 1 && value <= 12 ) {

			MSG_WriteByte( msg, svc_hexen2_intermission );
			MSG_WriteByte( msg, value );
			return true;

		}
		// Not an index after all: keep the native opcode and fall through to writing this byte normally.
		MSG_WriteByte( msg, NATIVE_INTERMISSION );

	}
	// MSG_BROADCAST (the datagram) is never used for the intermission in the gamecode; leaving it alone also keeps
	// temporary-entity bodies that happen to contain 30 safe.
	if ( value === NATIVE_INTERMISSION && msg !== sv.datagram && ( pr_global_struct?.intermission_running | 0 ) > 0 ) {

		pending.set( msg, true );
		return true;

	}
	return false;

}

/**
 * Writes any held native intermission opcode unchanged, for a buffer whose message ended before the index arrived.
 *
 * @param {sizebuf_t} msg the destination buffer
 */
export function Hexen2_FlushNativeService( msg ) {

	if ( pending.has( msg ) ) {

		pending.delete( msg );
		MSG_WriteByte( msg, NATIVE_INTERMISSION );

	}

}
