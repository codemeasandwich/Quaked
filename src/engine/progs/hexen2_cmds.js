/**
 * @module engine/progs/hexen2_cmds
 *
 * The Hexen II builtins that are pure maths, string formatting or RNG: numbers whose native body differs from the
 * Quake one (`rint` rounds at ±0.1, `random` is the native `rand()/RAND_MAX`, `dprintf`/`dprintv` format one value)
 * and the numbers Hexen II added where Quake's table has a Fixme (`vhlen`, `cos`, `sin`, `sqrt`, `concatv`,
 * `v_factor`, `v_factorrange`). Every other Hexen reimplementation of a Quake builtin is gone: the one profile table in
 * `pr_builtin_table.js` resolves those from `server/pr_cmds.js`.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised here; developer prints never abort on bad gamecode format strings.
 */

import { G_FLOAT, G_FLOAT_SET, G_STRING, G_VECTOR, pr_global_struct } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from './pr_comp.js';
import { Con_DPrintf } from '../common/console.js';

const DEG2RAD = Math.PI / 180;

function writeVector( x, y, z ) {

	G_FLOAT_SET( OFS_RETURN, x ); G_FLOAT_SET( OFS_RETURN + 1, y ); G_FLOAT_SET( OFS_RETURN + 2, z );

}


// #7 random(): rand() * (1.0 / RAND_MAX). The injected source is already a value in [0, 1] from the native RNG stream;
// unlike Quake's Math.random() it may return 1.0, which the gamecode's comparisons can observe.
function random( context ) { G_FLOAT_SET( OFS_RETURN, context?.random ? context.random() : Math.random() ); }

// #50 vhlen(vector): the horizontal length (no z)
function vhlen() { const v = G_VECTOR( OFS_PARM0 ); G_FLOAT_SET( OFS_RETURN, Math.hypot( v[ 0 ], v[ 1 ] ) ); }

// #36 rint(float): Hexen II's own rounding, `(int)(f + 0.1)` / `(int)(f - 0.1)`, not Quake's ±0.5
function rint() {

	const f = G_FLOAT( OFS_PARM0 );
	G_FLOAT_SET( OFS_RETURN, f > 0 ? Math.trunc( f + 0.1 ) : Math.trunc( f - 0.1 ) );

}

// #61 cos(float), #62 sin(float): degrees, as the native PF_Cos/PF_Sin convert
function cosValue() { G_FLOAT_SET( OFS_RETURN, Math.cos( G_FLOAT( OFS_PARM0 ) * DEG2RAD ) ); }
function sinValue() { G_FLOAT_SET( OFS_RETURN, Math.sin( G_FLOAT( OFS_PARM0 ) * DEG2RAD ) ); }

// #84 sqrt(float)
function sqrtValue() { G_FLOAT_SET( OFS_RETURN, Math.sqrt( G_FLOAT( OFS_PARM0 ) ) ); }

// #91 concatv(vector, vector range): clamp each axis into [-range, range]
function concatv() {

	const v = G_VECTOR( OFS_PARM0 ), range = G_VECTOR( OFS_PARM1 );
	const out = [ 0, 1, 2 ].map( i => Math.max( - range[ i ], Math.min( range[ i ], v[ i ] ) ) );
	writeVector( out[ 0 ], out[ 1 ], out[ 2 ] );

}

// #94 v_factor(vector): v_right * x + v_forward * y + v_up * z
function v_factor() {

	const factor = G_VECTOR( OFS_PARM0 );
	const right = pr_global_struct.v_right, forward = pr_global_struct.v_forward, up = pr_global_struct.v_up;
	writeVector(
		right[ 0 ] * factor[ 0 ] + forward[ 0 ] * factor[ 1 ] + up[ 0 ] * factor[ 2 ],
		right[ 1 ] * factor[ 0 ] + forward[ 1 ] * factor[ 1 ] + up[ 1 ] * factor[ 2 ],
		right[ 2 ] * factor[ 0 ] + forward[ 2 ] * factor[ 1 ] + up[ 2 ] * factor[ 2 ] );

}

// #95 v_factorrange(vector min, vector max): a random factor vector, then v_factor
function v_factorrange( context ) {

	const min = G_VECTOR( OFS_PARM0 ), max = G_VECTOR( OFS_PARM1 );
	const source = context?.random ?? Math.random;
	const factor = [ 0, 1, 2 ].map( i => ( max[ i ] - min[ i ] ) * source() + min[ i ] );
	const right = pr_global_struct.v_right, forward = pr_global_struct.v_forward, up = pr_global_struct.v_up;
	writeVector(
		right[ 0 ] * factor[ 0 ] + forward[ 0 ] * factor[ 1 ] + up[ 0 ] * factor[ 2 ],
		right[ 1 ] * factor[ 0 ] + forward[ 1 ] * factor[ 1 ] + up[ 1 ] * factor[ 2 ],
		right[ 2 ] * factor[ 0 ] + forward[ 2 ] * factor[ 1 ] + up[ 2 ] * factor[ 2 ] );

}

// The native `%d` when exact, `%5.1f` otherwise
function nativeNumberText( value ) {

	return value === Math.trunc( value ) ? String( Math.trunc( value ) ) : value.toFixed( 1 ).padStart( 5, ' ' );

}

// #60 dprintf(format, float): a developer console print of one formatted number; gamecode format mistakes never abort
function dprintf() {

	const format = G_STRING( OFS_PARM0 );
	try {

		Con_DPrintf( format, nativeNumberText( G_FLOAT( OFS_PARM1 ) ) );

	} catch {

		// a malformed gamecode format is still a developer print, never a program error

	}

}

// #64 dprintv(format, vector): a developer console print of the native quoted vector
function dprintv() {

	const format = G_STRING( OFS_PARM0 ), v = G_VECTOR( OFS_PARM1 );
	try {

		Con_DPrintf( format, '\'' + nativeNumberText( v[ 0 ] ) + ' ' + nativeNumberText( v[ 1 ] ) + ' ' + nativeNumberText( v[ 2 ] ) + '\'' );

	} catch {

		// as dprintf

	}

}

/**
 * The self-contained layer: only numbers whose native Hexen II body is not the Quake body.
 */
export const HEXEN2_CORE_BUILTINS = Object.freeze( {
	7: random, 36: rint, 50: vhlen, 60: dprintf, 61: cosValue, 62: sinValue, 64: dprintv, 84: sqrtValue,
	91: concatv, 94: v_factor, 95: v_factorrange
} );

/** The implemented builtins, by their pinned contract number. */
export const HEXEN2_IMPLEMENTED_BUILTINS = HEXEN2_CORE_BUILTINS;
