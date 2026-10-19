/**
 * @module engine/common/hexen2_inputwire
 *
 * A client's movement command over the private session: the Quaked extension envelope (service opcode 63, versioned
 * payload) carrying view angles, forward/side/up movement and the attack/use/jump buttons. It is private to this port
 * (not an interoperable Raven `clc_move`); the server applies it through the same `SV_User_SetCommand` fields a local
 * client fills. Values are angle16 (1/256 turn) and signed 16-bit movement, so the payload stays small and bounded.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; malformed input is `{ ok: false, reason }`.
 */

import { HEXEN2_EXTENSION_OPCODE, HEXEN2_EXTENSION_MAX_BYTES } from './hexen2_protocol.js';

/** The private extension sub-opcode for an input command. */
export const HEXEN2_INPUT_SUBOPCODE = 1;

/** The input button bits (native button0..button2 order). */
export const INPUT_BUTTONS = Object.freeze( { ATTACK: 1, USE: 2, JUMP: 4 } );

const clampShort = v => Math.max( - 32768, Math.min( 32767, Math.round( v ) ) );
const angle16 = v => Math.round( v * 256 / 360 ) & 0xffff;

/**
 * Writes an input command.
 *
 * @param {{ viewangles: ArrayLike<number>, forwardmove?: number, sidemove?: number, upmove?: number, buttons?: number }} input
 * @returns {{ ok: true, bytes: Uint8Array } | { ok: false, reason: string }} the extension message
 */
export function Hexen2_WriteInput( input ) {

	if ( !input?.viewangles || input.viewangles.length < 3 ) return { ok: false, reason: 'no view angles' };
	const buttons = input.buttons ?? 0;
	if ( !Number.isInteger( buttons ) || buttons < 0 || buttons > 255 ) return { ok: false, reason: 'invalid buttons' };
	const bytes = new Uint8Array( 2 + 6 + 6 + 1 );
	let at = 0;
	bytes[ at ++ ] = HEXEN2_EXTENSION_OPCODE;
	bytes[ at ++ ] = HEXEN2_INPUT_SUBOPCODE;
	for ( let i = 0; i < 3; i ++ ) { const a = angle16( input.viewangles[ i ] ); bytes[ at ++ ] = a & 0xff; bytes[ at ++ ] = ( a >> 8 ) & 0xff; }
	for ( const value of [ input.forwardmove ?? 0, input.sidemove ?? 0, input.upmove ?? 0 ] ) { const v = clampShort( value ); bytes[ at ++ ] = v & 0xff; bytes[ at ++ ] = ( v >> 8 ) & 0xff; }
	bytes[ at ++ ] = buttons;
	if ( at > HEXEN2_EXTENSION_MAX_BYTES ) return { ok: false, reason: 'the input exceeds the extension envelope' };
	return { ok: true, bytes };

}

/**
 * Reads an input command.
 *
 * @param {ArrayLike<number>} bytes the message
 * @returns {{ ok: true, input: object, consumed: number } | { ok: false, reason: string }} the parsed command
 */
export function Hexen2_ReadInput( bytes ) {

	if ( !bytes || bytes.length < 15 ) return { ok: false, reason: 'truncated input' };
	if ( bytes[ 0 ] !== HEXEN2_EXTENSION_OPCODE ) return { ok: false, reason: 'not a private extension message' };
	if ( bytes[ 1 ] !== HEXEN2_INPUT_SUBOPCODE ) return { ok: false, reason: 'unknown extension sub-opcode' };
	let at = 2;
	const viewangles = [];
	for ( let i = 0; i < 3; i ++ ) { const a = bytes[ at ] | ( bytes[ at + 1 ] << 8 ); at += 2; viewangles.push( a * 360 / 256 ); }
	const signed = () => { const v = bytes[ at ] | ( bytes[ at + 1 ] << 8 ); at += 2; return v > 32767 ? v - 65536 : v; };
	const forwardmove = signed(), sidemove = signed(), upmove = signed();
	const buttons = bytes[ at ++ ];
	if ( at !== bytes.length ) return { ok: false, reason: 'trailing input bytes' };
	return { ok: true, input: { viewangles, forwardmove, sidemove, upmove, buttons }, consumed: at };

}
