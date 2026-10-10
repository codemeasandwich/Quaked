/**
 * @module engine/common/mathlib
 *
 * Vector and angle maths (WinQuake mathlib.c): dot and cross products, normalising, angle vectors, `BoxOnPlaneSide`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place.
 */
// Ported from: WinQuake/mathlib.c -- math primitives

import { PITCH, YAW, ROLL } from './quakedef.js';

export const M_PI = 3.14159265358979323846;

export const vec3_origin = new Float32Array( [ 0, 0, 0 ] );

/*-----------------------------------------------------------------*/

const DEG2RAD = ( a ) => ( a * M_PI ) / 180.0;

/**
 * Dot product of two 3-vectors (WinQuake mathlib.h macro, here a function).
 *
 * @param {ArrayLike<number>} x first vector (only elements 0..2 are read)
 * @param {ArrayLike<number>} y second vector
 * @returns {number} x · y
 */
export function DotProduct( x, y ) {

	return x[ 0 ] * y[ 0 ] + x[ 1 ] * y[ 1 ] + x[ 2 ] * y[ 2 ];

}

/**
 * c = a - b, per component (WinQuake mathlib.h macro). `c` may be the same array as `a` or `b`.
 *
 * @param {ArrayLike<number>} a minuend
 * @param {ArrayLike<number>} b subtrahend
 * @param {Float32Array|Array<number>} c written: the difference
 */
export function VectorSubtract( a, b, c ) {

	c[ 0 ] = a[ 0 ] - b[ 0 ];
	c[ 1 ] = a[ 1 ] - b[ 1 ];
	c[ 2 ] = a[ 2 ] - b[ 2 ];

}

/**
 * c = a + b, per component (WinQuake mathlib.h macro). `c` may be the same array as `a` or `b`.
 *
 * @param {ArrayLike<number>} a first addend
 * @param {ArrayLike<number>} b second addend
 * @param {Float32Array|Array<number>} c written: the sum
 */
export function VectorAdd( a, b, c ) {

	c[ 0 ] = a[ 0 ] + b[ 0 ];
	c[ 1 ] = a[ 1 ] + b[ 1 ];
	c[ 2 ] = a[ 2 ] + b[ 2 ];

}

/**
 * Copies the three components of `a` into `b` (WinQuake mathlib.h macro). Note the C argument order: source first.
 *
 * @param {ArrayLike<number>} a source
 * @param {Float32Array|Array<number>} b written: destination
 */
export function VectorCopy( a, b ) {

	b[ 0 ] = a[ 0 ];
	b[ 1 ] = a[ 1 ];
	b[ 2 ] = a[ 2 ];

}

/**
 * vecc = veca + scale * vecb (WinQuake mathlib.c, "multiply-add"); used to step a point along a direction.
 * `vecc` may be the same array as `veca`.
 *
 * @param {ArrayLike<number>} veca start point or vector
 * @param {number} scale distance or factor applied to `vecb` (Quake units when `vecb` is a unit direction)
 * @param {ArrayLike<number>} vecb direction
 * @param {Float32Array|Array<number>} vecc written: the result
 */
export function VectorMA( veca, scale, vecb, vecc ) {

	vecc[ 0 ] = veca[ 0 ] + scale * vecb[ 0 ];
	vecc[ 1 ] = veca[ 1 ] + scale * vecb[ 1 ];
	vecc[ 2 ] = veca[ 2 ] + scale * vecb[ 2 ];

}

/**
 * Exact equality of two 3-vectors (WinQuake mathlib.c); no tolerance.
 *
 * @param {ArrayLike<number>} v1 first vector
 * @param {ArrayLike<number>} v2 second vector
 * @returns {number} 1 when all three components are strictly equal, otherwise 0 (C int, not boolean)
 */
export function VectorCompare( v1, v2 ) {

	for ( let i = 0; i < 3; i ++ ) {

		if ( v1[ i ] !== v2[ i ] ) return 0;

	}

	return 1;

}

/**
 * Euclidean length of a 3-vector (WinQuake mathlib.c).
 *
 * @param {ArrayLike<number>} v vector
 * @returns {number} |v|, in the vector's units (Quake units for a position delta)
 */
export function Length( v ) {

	let length = 0;
	for ( let i = 0; i < 3; i ++ )
		length += v[ i ] * v[ i ];
	length = Math.sqrt( length );

	return length;

}

/**
 * Scales `v` in place to unit length (WinQuake mathlib.c). A zero vector is left unchanged.
 *
 * @param {Float32Array|Array<number>} v mutated: normalised in place
 * @returns {number} the length before normalising (0 for a zero vector)
 */
export function VectorNormalize( v ) {

	let length = v[ 0 ] * v[ 0 ] + v[ 1 ] * v[ 1 ] + v[ 2 ] * v[ 2 ];
	length = Math.sqrt( length );

	if ( length ) {

		const ilength = 1 / length;
		v[ 0 ] *= ilength;
		v[ 1 ] *= ilength;
		v[ 2 ] *= ilength;

	}

	return length;

}

/**
 * Negates `v` in place (WinQuake mathlib.c).
 *
 * @param {Float32Array|Array<number>} v mutated: each component negated
 */
export function VectorInverse( v ) {

	v[ 0 ] = - v[ 0 ];
	v[ 1 ] = - v[ 1 ];
	v[ 2 ] = - v[ 2 ];

}

/**
 * out = in * scale, per component (WinQuake mathlib.c). `out` may be the same array as `_in`.
 *
 * @param {ArrayLike<number>} _in vector to scale
 * @param {number} scale factor
 * @param {Float32Array|Array<number>} out written: the scaled vector
 */
export function VectorScale( _in, scale, out ) {

	out[ 0 ] = _in[ 0 ] * scale;
	out[ 1 ] = _in[ 1 ] * scale;
	out[ 2 ] = _in[ 2 ] * scale;

}

/**
 * cross = v1 × v2 (WinQuake mathlib.c), right-handed. `cross` must not be the same array as `v1` or `v2`, because the
 * inputs are read after components are written.
 *
 * @param {ArrayLike<number>} v1 first vector
 * @param {ArrayLike<number>} v2 second vector
 * @param {Float32Array|Array<number>} cross written: the cross product
 */
export function CrossProduct( v1, v2, cross ) {

	cross[ 0 ] = v1[ 1 ] * v2[ 2 ] - v1[ 2 ] * v2[ 1 ];
	cross[ 1 ] = v1[ 2 ] * v2[ 0 ] - v1[ 0 ] * v2[ 2 ];
	cross[ 2 ] = v1[ 0 ] * v2[ 1 ] - v1[ 1 ] * v2[ 0 ];

}

/**
 * Integer base-2 logarithm (WinQuake mathlib.c): the index of the highest set bit.
 *
 * @param {number} val positive integer (treated as 32-bit); a negative value never shifts to 0 and loops forever
 * @returns {number} floor(log2(val)) for val >= 1, 0 for 0 or 1
 */
export function Q_log2( val ) {

	let answer = 0;
	while ( ( val >>= 1 ) )
		answer ++;
	return answer;

}

/**
 * Wraps an angle into 0..360 degrees, quantised to 360/65536-degree steps as in WinQuake mathlib.c. Used to keep
 * yaw in range after turning (`CL_AdjustAngles`), by the view code and by the QuakeC angle builtins (pr_cmds.js).
 *
 * @param {number} a angle in degrees, any range
 * @returns {number} the same direction in [0, 360) degrees
 */
export function anglemod( a ) {

	return ( 360.0 / 65536 ) * ( ( ( a * ( 65536 / 360.0 ) ) | 0 ) & 65535 );

}

/*
==================
BoxOnPlaneSide
==================
*/
/**
 * Which side of a plane an axis-aligned box lies on (WinQuake mathlib.c). Used for frustum culling (`R_CullBox`) and
 * for linking edicts into the world's area nodes (world.js). Axial planes (`type` 0..2) use a fast compare; the rest
 * pick the two nearest/farthest corners from `signbits`.
 *
 * @param {ArrayLike<number>} emins box minimum corner (Quake units, same space as the plane)
 * @param {ArrayLike<number>} emaxs box maximum corner
 * @param {mplane_t} p plane with `normal`, `dist`, `type` (0..2 axial, otherwise general) and `signbits` (0..7)
 * @returns {number} Returns 1, 2, or 1 + 2: 1 when the box is (at least partly) in front, 2 when (partly) behind, 3
 *   when it crosses the plane
 * @throws {ReferenceError} for `signbits` outside 0..7: the code calls `Sys_Error`, which this file does not import
 */
export function BoxOnPlaneSide( emins, emaxs, p ) {

	let dist1, dist2;
	let sides;

	// fast axial cases
	if ( p.type < 3 ) {

		if ( p.dist <= emins[ p.type ] )
			return 1;
		if ( p.dist >= emaxs[ p.type ] )
			return 2;
		return 3;

	}

	// general case
	switch ( p.signbits ) {

		case 0:
			dist1 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			dist2 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			break;
		case 1:
			dist1 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			dist2 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			break;
		case 2:
			dist1 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			dist2 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			break;
		case 3:
			dist1 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			dist2 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			break;
		case 4:
			dist1 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			dist2 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			break;
		case 5:
			dist1 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			dist2 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			break;
		case 6:
			dist1 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			dist2 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			break;
		case 7:
			dist1 = p.normal[ 0 ] * emins[ 0 ] + p.normal[ 1 ] * emins[ 1 ] + p.normal[ 2 ] * emins[ 2 ];
			dist2 = p.normal[ 0 ] * emaxs[ 0 ] + p.normal[ 1 ] * emaxs[ 1 ] + p.normal[ 2 ] * emaxs[ 2 ];
			break;
		default:
			dist1 = dist2 = 0; // shut up compiler
			Sys_Error( 'BoxOnPlaneSide: Bad signbits' );
			break;

	}

	sides = 0;
	if ( dist1 >= p.dist )
		sides = 1;
	if ( dist2 < p.dist )
		sides |= 2;

	return sides;

}

/**
 * Turns Euler angles into forward, right and up unit vectors (WinQuake mathlib.c). Used wherever a view or entity
 * direction is needed (view setup, chase camera, movement physics, aiming builtins). Quake convention: positive pitch
 * looks down, so `forward[2] = -sin(pitch)`.
 *
 * @param {ArrayLike<number>} angles [pitch, yaw, roll] in degrees
 * @param {Float32Array|Array<number>} forward written: unit forward vector
 * @param {Float32Array|Array<number>} right written: unit right vector
 * @param {Float32Array|Array<number>} up written: unit up vector
 */
export function AngleVectors( angles, forward, right, up ) {

	let angle;
	let sr, sp, sy, cr, cp, cy;

	angle = angles[ YAW ] * ( M_PI * 2 / 360 );
	sy = Math.sin( angle );
	cy = Math.cos( angle );
	angle = angles[ PITCH ] * ( M_PI * 2 / 360 );
	sp = Math.sin( angle );
	cp = Math.cos( angle );
	angle = angles[ ROLL ] * ( M_PI * 2 / 360 );
	sr = Math.sin( angle );
	cr = Math.cos( angle );

	forward[ 0 ] = cp * cy;
	forward[ 1 ] = cp * sy;
	forward[ 2 ] = - sp;
	right[ 0 ] = ( - 1 * sr * sp * cy + - 1 * cr * - sy );
	right[ 1 ] = ( - 1 * sr * sp * sy + - 1 * cr * cy );
	right[ 2 ] = - 1 * sr * cp;
	up[ 0 ] = ( cr * sp * cy + - sr * - sy );
	up[ 1 ] = ( cr * sp * sy + - sr * cy );
	up[ 2 ] = cr * cp;

}

/*
================
R_ConcatRotations
================
*/
/**
 * Multiplies two 3x3 rotation matrices, out = in1 * in2 (WinQuake mathlib.c). Used by `RotatePointAroundVector`.
 * `out` must not be either input.
 *
 * @param {ArrayLike<ArrayLike<number>>} in1 left matrix, rows of 3
 * @param {ArrayLike<ArrayLike<number>>} in2 right matrix, rows of 3
 * @param {Array<Float32Array|Array<number>>} out written: product, rows of 3
 */
export function R_ConcatRotations( in1, in2, out ) {

	out[ 0 ][ 0 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 0 ][ 1 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 0 ][ 2 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 2 ];
	out[ 1 ][ 0 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 1 ][ 1 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 1 ][ 2 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 2 ];
	out[ 2 ][ 0 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 2 ][ 1 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 2 ][ 2 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 2 ];

}

/*
================
R_ConcatTransforms
================
*/
/**
 * Multiplies two 3x4 affine transforms (3x3 rotation plus a translation column), out = in1 * in2 (WinQuake
 * mathlib.c). No caller in the engine at present. `out` must not be either input.
 *
 * @param {ArrayLike<ArrayLike<number>>} in1 left transform, 3 rows of 4
 * @param {ArrayLike<ArrayLike<number>>} in2 right transform, 3 rows of 4
 * @param {Array<Float32Array|Array<number>>} out written: product, 3 rows of 4
 */
export function R_ConcatTransforms( in1, in2, out ) {

	out[ 0 ][ 0 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 0 ][ 1 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 0 ][ 2 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 2 ];
	out[ 0 ][ 3 ] = in1[ 0 ][ 0 ] * in2[ 0 ][ 3 ] + in1[ 0 ][ 1 ] * in2[ 1 ][ 3 ] +
				in1[ 0 ][ 2 ] * in2[ 2 ][ 3 ] + in1[ 0 ][ 3 ];
	out[ 1 ][ 0 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 1 ][ 1 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 1 ][ 2 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 2 ];
	out[ 1 ][ 3 ] = in1[ 1 ][ 0 ] * in2[ 0 ][ 3 ] + in1[ 1 ][ 1 ] * in2[ 1 ][ 3 ] +
				in1[ 1 ][ 2 ] * in2[ 2 ][ 3 ] + in1[ 1 ][ 3 ];
	out[ 2 ][ 0 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 0 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 0 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 0 ];
	out[ 2 ][ 1 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 1 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 1 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 1 ];
	out[ 2 ][ 2 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 2 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 2 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 2 ];
	out[ 2 ][ 3 ] = in1[ 2 ][ 0 ] * in2[ 0 ][ 3 ] + in1[ 2 ][ 1 ] * in2[ 1 ][ 3 ] +
				in1[ 2 ][ 2 ] * in2[ 2 ][ 3 ] + in1[ 2 ][ 3 ];

}

/**
 * Projects a point onto the plane through the origin with the given normal (WinQuake mathlib.c). Used by
 * `PerpendicularVector`. Allocates a temporary vector on every call.
 *
 * @param {Float32Array|Array<number>} dst written: the projected point
 * @param {ArrayLike<number>} p point to project
 * @param {ArrayLike<number>} normal plane normal; need not be unit length, must not be zero
 */
export function ProjectPointOnPlane( dst, p, normal ) {

	const inv_denom = 1.0 / DotProduct( normal, normal );
	const d = DotProduct( normal, p ) * inv_denom;
	const n = new Float32Array( 3 );

	n[ 0 ] = normal[ 0 ] * inv_denom;
	n[ 1 ] = normal[ 1 ] * inv_denom;
	n[ 2 ] = normal[ 2 ] * inv_denom;

	dst[ 0 ] = p[ 0 ] - d * n[ 0 ];
	dst[ 1 ] = p[ 1 ] - d * n[ 1 ];
	dst[ 2 ] = p[ 2 ] - d * n[ 2 ];

}

/**
 * Finds a unit vector perpendicular to `src` (WinQuake mathlib.c): projects the axis on which `src` is smallest onto
 * the plane defined by `src` and normalises it. Assumes "src" is normalized. Used by `RotatePointAroundVector`.
 * Allocates a temporary vector on every call.
 *
 * @param {Float32Array|Array<number>} dst written: unit vector perpendicular to `src`
 * @param {ArrayLike<number>} src unit vector
 */
export function PerpendicularVector( dst, src ) {

	let pos = 0;
	let minelem = 1.0;
	const tempvec = new Float32Array( 3 );

	// find the smallest magnitude axially aligned vector
	for ( let i = 0; i < 3; i ++ ) {

		if ( Math.abs( src[ i ] ) < minelem ) {

			pos = i;
			minelem = Math.abs( src[ i ] );

		}

	}

	tempvec[ 0 ] = tempvec[ 1 ] = tempvec[ 2 ] = 0.0;
	tempvec[ pos ] = 1.0;

	// project the point onto the plane defined by src
	ProjectPointOnPlane( dst, tempvec, src );

	// normalize the result
	VectorNormalize( dst );

}

/**
 * Rotates `point` about the axis `dir` (through the origin) by `degrees`, right-hand rule (WinQuake mathlib.c). Used
 * by `R_SetFrustum` to turn the view direction into the four frustum plane normals each frame. Allocates temporary
 * matrices and vectors on every call.
 *
 * @param {Float32Array|Array<number>} dst written: the rotated point; must not be `point` or `dir`
 * @param {ArrayLike<number>} dir rotation axis, unit length
 * @param {ArrayLike<number>} point point or vector to rotate
 * @param {number} degrees rotation angle in degrees
 */
export function RotatePointAroundVector( dst, dir, point, degrees ) {

	const m = [ new Float32Array( 3 ), new Float32Array( 3 ), new Float32Array( 3 ) ];
	const im = [ new Float32Array( 3 ), new Float32Array( 3 ), new Float32Array( 3 ) ];
	const zrot = [ new Float32Array( 3 ), new Float32Array( 3 ), new Float32Array( 3 ) ];
	const tmpmat = [ new Float32Array( 3 ), new Float32Array( 3 ), new Float32Array( 3 ) ];
	const rot = [ new Float32Array( 3 ), new Float32Array( 3 ), new Float32Array( 3 ) ];
	const vr = new Float32Array( 3 );
	const vup = new Float32Array( 3 );
	const vf = new Float32Array( 3 );

	vf[ 0 ] = dir[ 0 ];
	vf[ 1 ] = dir[ 1 ];
	vf[ 2 ] = dir[ 2 ];

	PerpendicularVector( vr, dir );
	CrossProduct( vr, vf, vup );

	m[ 0 ][ 0 ] = vr[ 0 ];
	m[ 1 ][ 0 ] = vr[ 1 ];
	m[ 2 ][ 0 ] = vr[ 2 ];

	m[ 0 ][ 1 ] = vup[ 0 ];
	m[ 1 ][ 1 ] = vup[ 1 ];
	m[ 2 ][ 1 ] = vup[ 2 ];

	m[ 0 ][ 2 ] = vf[ 0 ];
	m[ 1 ][ 2 ] = vf[ 1 ];
	m[ 2 ][ 2 ] = vf[ 2 ];

	// copy m to im then transpose
	for ( let i = 0; i < 3; i ++ )
		for ( let j = 0; j < 3; j ++ )
			im[ i ][ j ] = m[ i ][ j ];

	im[ 0 ][ 1 ] = m[ 1 ][ 0 ];
	im[ 0 ][ 2 ] = m[ 2 ][ 0 ];
	im[ 1 ][ 0 ] = m[ 0 ][ 1 ];
	im[ 1 ][ 2 ] = m[ 2 ][ 1 ];
	im[ 2 ][ 0 ] = m[ 0 ][ 2 ];
	im[ 2 ][ 1 ] = m[ 1 ][ 2 ];

	zrot[ 0 ][ 0 ] = zrot[ 1 ][ 1 ] = zrot[ 2 ][ 2 ] = 1.0;

	zrot[ 0 ][ 0 ] = Math.cos( DEG2RAD( degrees ) );
	zrot[ 0 ][ 1 ] = Math.sin( DEG2RAD( degrees ) );
	zrot[ 1 ][ 0 ] = - Math.sin( DEG2RAD( degrees ) );
	zrot[ 1 ][ 1 ] = Math.cos( DEG2RAD( degrees ) );

	R_ConcatRotations( m, zrot, tmpmat );
	R_ConcatRotations( tmpmat, im, rot );

	for ( let i = 0; i < 3; i ++ ) {

		dst[ i ] = rot[ i ][ 0 ] * point[ 0 ] + rot[ i ][ 1 ] * point[ 1 ] + rot[ i ][ 2 ] * point[ 2 ];

	}

}

/*
===================
FloorDivMod
====================
*/
/**
 * Returns mathematically correct (floor-based) quotient and remainder for numer and denom, both of which should
 * contain no fractional part (WinQuake mathlib.c). The quotient must fit in 32 bits. No caller in the engine at
 * present. Assumes a positive `denom`; nothing checks it.
 *
 * @param {number} numer whole-number dividend, any sign
 * @param {number} denom whole-number divisor, positive
 * @returns {{ quotient: number, remainder: number }} quotient = floor(numer / denom) and remainder in 0..denom-1,
 *   both 32-bit integers
 */
export function FloorDivMod( numer, denom ) {

	let q, r;

	if ( numer >= 0.0 ) {

		const x = Math.floor( numer / denom );
		q = x | 0;
		r = Math.floor( numer - ( x * denom ) ) | 0;

	} else {

		const x = Math.floor( - numer / denom );
		q = - ( x | 0 );
		r = Math.floor( - numer - ( x * denom ) ) | 0;
		if ( r !== 0 ) {

			q --;
			r = ( denom | 0 ) - r;

		}

	}

	return { quotient: q, remainder: r };

}

/**
 * Greatest common divisor by Euclid's algorithm (WinQuake mathlib.c), recursive. No caller in the engine at present.
 *
 * @param {number} i1 non-negative integer
 * @param {number} i2 non-negative integer
 * @returns {number} gcd(i1, i2); the other value when one is 0, and 0 when both are
 */
export function GreatestCommonDivisor( i1, i2 ) {

	if ( i1 > i2 ) {

		if ( i2 === 0 ) return i1;
		return GreatestCommonDivisor( i2, i1 % i2 );

	} else {

		if ( i1 === 0 ) return i2;
		return GreatestCommonDivisor( i1, i2 % i1 );

	}

}
