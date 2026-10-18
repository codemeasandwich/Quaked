/**
 * @module engine/progs/hexen2_cmds
 *
 * The first Hexen II builtins, implemented against this port's existing globals rather than a new execution path:
 * the vector/angle/maths builtins the supplied gamecode calls constantly. The numbers are the pinned
 * `hexen2_builtins.js` contract, and each implementation mirrors the native C body (uhexen2 pr_cmds.c) with the port's
 * typed global helpers. A builtin outside this table is refused by name, never silently skipped.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised here; a caller-provided random source is used for `random`.
 */

import { G_FLOAT, G_FLOAT_SET, G_INT, G_INT_SET, G_STRING, G_VECTOR, PR_SetTempString, pr_argc, pr_global_struct } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_RETURN } from './pr_comp.js';
import { Cvar_VariableValue, Cvar_Set } from '../common/cvar.js';
import { HEXEN2_BUILTIN_COUNT } from './hexen2_builtins.js';
import { Con_DPrintf } from '../common/console.js';

const DEG2RAD = Math.PI / 180;

function writeVector( x, y, z ) {

	G_FLOAT_SET( OFS_RETURN, x ); G_FLOAT_SET( OFS_RETURN + 1, y ); G_FLOAT_SET( OFS_RETURN + 2, z );

}

function vectorLength( x, y, z ) { return Math.hypot( x, y, z ); }

// #7 random(): rand() * (1 / RAND_MAX), the native body
function random( context ) { G_FLOAT_SET( OFS_RETURN, context.random() ); }

// #9 normalize(vector): zero-length vectors normalise to zero
function normalize() {

	const v = G_VECTOR( OFS_PARM0 ), length = vectorLength( v[ 0 ], v[ 1 ], v[ 2 ] );
	if ( length === 0 ) writeVector( 0, 0, 0 );
	else writeVector( v[ 0 ] / length, v[ 1 ] / length, v[ 2 ] / length );

}

// #12 vlen(vector)
function vlen() { const v = G_VECTOR( OFS_PARM0 ); G_FLOAT_SET( OFS_RETURN, vectorLength( v[ 0 ], v[ 1 ], v[ 2 ] ) ); }

// #50 vhlen(vector): the horizontal length (no z)
function vhlen() { const v = G_VECTOR( OFS_PARM0 ); G_FLOAT_SET( OFS_RETURN, Math.hypot( v[ 0 ], v[ 1 ] ) ); }

// #13 vectoyaw(vector)
function vectoyaw() {

	const v = G_VECTOR( OFS_PARM0 );
	let yaw = 0;
	if ( ! ( v[ 0 ] === 0 && v[ 1 ] === 0 ) ) {

		yaw = Math.trunc( Math.atan2( v[ 1 ], v[ 0 ] ) / DEG2RAD );
		if ( yaw < 0 ) yaw += 360;

	}
	G_FLOAT_SET( OFS_RETURN, yaw );

}

// #51 vectoangles(vector)
function vectoangles() {

	const v = G_VECTOR( OFS_PARM0 );
	let yaw, pitch;
	if ( v[ 0 ] === 0 && v[ 1 ] === 0 ) {

		yaw = 0;
		pitch = v[ 2 ] > 0 ? 90 : 270;

	} else {

		yaw = Math.trunc( Math.atan2( v[ 1 ], v[ 0 ] ) / DEG2RAD );
		if ( yaw < 0 ) yaw += 360;
		const forward = Math.hypot( v[ 0 ], v[ 1 ] );
		pitch = Math.trunc( Math.atan2( v[ 2 ], forward ) / DEG2RAD );
		if ( pitch < 0 ) pitch += 360;

	}
	writeVector( pitch, yaw, 0 );

}

// #36 rint(float), #37 floor(float), #38 ceil(float), #43 fabs(float), #84 sqrt(float)
function rint() { G_FLOAT_SET( OFS_RETURN, Math.round( G_FLOAT( OFS_PARM0 ) ) ); }
function floorValue() { G_FLOAT_SET( OFS_RETURN, Math.floor( G_FLOAT( OFS_PARM0 ) ) ); }
function ceilValue() { G_FLOAT_SET( OFS_RETURN, Math.ceil( G_FLOAT( OFS_PARM0 ) ) ); }
function fabs() { G_FLOAT_SET( OFS_RETURN, Math.abs( G_FLOAT( OFS_PARM0 ) ) ); }
function sqrtValue() { G_FLOAT_SET( OFS_RETURN, Math.sqrt( G_FLOAT( OFS_PARM0 ) ) ); }

// #61 cos(float), #62 sin(float): degrees, as the native PF_Cos/PF_Sin convert
function cosValue() { G_FLOAT_SET( OFS_RETURN, Math.cos( G_FLOAT( OFS_PARM0 ) * DEG2RAD ) ); }
function sinValue() { G_FLOAT_SET( OFS_RETURN, Math.sin( G_FLOAT( OFS_PARM0 ) * DEG2RAD ) ); }

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
	const factor = [ 0, 1, 2 ].map( i => ( max[ i ] - min[ i ] ) * context.random() + min[ i ] );
	const right = pr_global_struct.v_right, forward = pr_global_struct.v_forward, up = pr_global_struct.v_up;
	writeVector(
		right[ 0 ] * factor[ 0 ] + forward[ 0 ] * factor[ 1 ] + up[ 0 ] * factor[ 2 ],
		right[ 1 ] * factor[ 0 ] + forward[ 1 ] * factor[ 1 ] + up[ 1 ] * factor[ 2 ],
		right[ 2 ] * factor[ 0 ] + forward[ 2 ] * factor[ 1 ] + up[ 2 ] * factor[ 2 ] );

}

// The native variadic string: the string arguments from `first` to pr_argc-1, concatenated.
function varString( first ) {

	let out = '';
	for ( let i = first; i < pr_argc; i ++ ) out += G_STRING( OFS_PARM0 + i * 3 );
	return out;

}

// #26 ftos(float): the integer form when exact, else one decimal place (as the native PF_ftos prints)
function ftos() {

	const v = G_FLOAT( OFS_PARM0 );
	const text = v === ( v | 0 ) ? String( v | 0 ) : v.toFixed( 1 );
	G_INT_SET( OFS_RETURN, PR_SetTempString( text ) );

}

// #27 vtos(vector): the quoted, space-separated form the native PF_vtos prints
function vtos() {

	const v = G_VECTOR( OFS_PARM0 );
	const text = '\'' + v[ 0 ].toFixed( 1 ) + ' ' + v[ 1 ].toFixed( 1 ) + ' ' + v[ 2 ].toFixed( 1 ) + '\'';
	G_INT_SET( OFS_RETURN, PR_SetTempString( text ) );

}

// #25 dprint(text...): development print
function dprint() { Con_DPrintf( '%s', varString( 0 ) ); }

// #45 cvar(name): a cvar's value as a float
function cvarValue() { G_FLOAT_SET( OFS_RETURN, Cvar_VariableValue( G_STRING( OFS_PARM0 ) ) ); }

// #72 cvar_set(name, value)
function cvarSet() { Cvar_Set( G_STRING( OFS_PARM0 ), G_STRING( OFS_PARM1 ) ); }

// Implementations that need engine/server state are installed by their own module (hexen2_world_cmds.js) so this
// module keeps no dependency on the server; an installed builtin is resolved after the self-contained table.
const registeredBuiltins = new Map();

/**
 * Installs engine-backed Hexen II builtins (the world, model and movement layer). A number must be inside the pinned
 * 114-entry contract; an installed number overrides nothing in the self-contained table (those are checked first).
 *
 * @param {object} table builtin number -> implementation
 * @throws {RangeError} for a number outside the contract
 * @throws {TypeError} for a non-function implementation
 */
export function Hexen2_RegisterBuiltins( table ) {

	for ( const [ key, implementation ] of Object.entries( table ?? {} ) ) {

		const number = Number( key );
		if ( ! Number.isInteger( number ) || number < 0 || number >= HEXEN2_BUILTIN_COUNT )
			throw new RangeError( `Hexen II builtin number ${key} is outside the contract` );
		if ( typeof implementation !== 'function' ) throw new TypeError( `Hexen II builtin ${key} is not a function` );
		registeredBuiltins.set( number, implementation );

	}

}

/** The implemented builtins, by their pinned contract number. */
export const HEXEN2_IMPLEMENTED_BUILTINS = Object.freeze( {
	7: random, 9: normalize, 12: vlen, 13: vectoyaw, 25: dprint, 26: ftos, 27: vtos, 36: rint, 37: floorValue,
	38: ceilValue, 43: fabs, 45: cvarValue, 50: vhlen, 51: vectoangles, 61: cosValue, 62: sinValue, 72: cvarSet,
	84: sqrtValue, 91: concatv, 94: v_factor, 95: v_factorrange
} );

/**
 * Calls an implemented Hexen II builtin.
 *
 * @param {number} number the builtin number from the function's negative `first_statement`
 * @param {{ random: function(): number }} context the random source (as rand()/RAND_MAX)
 * @returns {boolean} whether the builtin is implemented and was called
 */
export function Hexen2_CallBuiltin( number, context ) {

	const implementation = HEXEN2_IMPLEMENTED_BUILTINS[ number ] ?? registeredBuiltins.get( number );
	if ( implementation === undefined ) return false;
	implementation( context );
	return true;

}
