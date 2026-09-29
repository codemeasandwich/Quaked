// Level links: which exits lead where, and how to carry the player across.
//
// A level's exit is a trigger_changelevel brush; the next level starts at its
// info_player_start.  For a seamless crossing the exit is treated as a doorway
// (or, for a pit, a hole) and the start as the place on the other side, and the
// player's position, velocity and view are carried across with one rigid
// transform, so nothing about the motion changes.  This module is pure maths
// and BSP reading; the server and renderer use it (sv_seamless.js, r_levelview.js).
//
// Exits come in three shapes:
//   plane  a thin vertical slab across a passage or arch: cross it walking
//   pit    a thin horizontal slab: cross it falling
//   pad    a fat box (a teleporter-like pad): not a doorway, left as a normal
//          level change

// bspfile.h
const LUMP_ENTITIES = 0;
const LUMP_MODELS = 14;
const HEADER_LUMPS = 15;
const SIZEOF_DMODEL = 64;

const THIN = 32; // a pit slab is at most this thick
const WIDE = 48; // and at least this wide in the other directions
const DOOR_THICK = 64; // a doorway or portal brush is at most this thick
const DOOR_WIDE = 40; // at least this wide
const DOOR_HIGH = 48; // and at least this tall

//============================================================================
// BSP metadata
//============================================================================

export function R_ParseEntityLump( text ) {

	const ents = [];
	const block = /\{([^}]*)\}/g;
	const pair = /"([^"]*)"\s+"([^"]*)"/g;
	let b;

	while ( ( b = block.exec( text ) ) !== null ) {

		const ent = {};
		let p;
		pair.lastIndex = 0;
		while ( ( p = pair.exec( b[ 1 ] ) ) !== null ) ent[ p[ 1 ] ] = p[ 2 ];
		ents.push( ent );

	}

	return ents;

}

/*
================
R_ParseBsp

The entity list and the bounds of the submodels (trigger brushes are submodels)
of a version 29 BSP, without loading the rest of it.
================
*/
export function R_ParseBsp( bytes ) {

	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	if ( view.getInt32( 0, true ) !== 29 ) return null;

	const lump = ( i ) => ( { ofs: view.getInt32( 4 + i * 8, true ), len: view.getInt32( 8 + i * 8, true ) } );

	const e = lump( LUMP_ENTITIES );
	let text = '';
	for ( let i = 0; i < e.len; i ++ ) {

		const c = bytes[ e.ofs + i ];
		if ( c === 0 ) break;
		text += String.fromCharCode( c );

	}

	const m = lump( LUMP_MODELS );
	const submodels = [];
	for ( let i = 0; i < m.len / SIZEOF_DMODEL; i ++ ) {

		const o = m.ofs + i * SIZEOF_DMODEL;
		submodels.push( {
			mins: [ view.getFloat32( o, true ), view.getFloat32( o + 4, true ), view.getFloat32( o + 8, true ) ],
			maxs: [ view.getFloat32( o + 12, true ), view.getFloat32( o + 16, true ), view.getFloat32( o + 20, true ) ]
		} );

	}

	return { entities: R_ParseEntityLump( text ), submodels, headerLumps: HEADER_LUMPS };

}

function parseVector( s ) {

	const v = [ 0, 0, 0 ];
	if ( s == null ) return v;
	const parts = String( s ).trim().split( /\s+/ );
	for ( let i = 0; i < 3 && i < parts.length; i ++ ) v[ i ] = parseFloat( parts[ i ] ) || 0;
	return v;

}

// the way an info_player_start faces (ED_ParseEdict turns "angle" into a yaw)
function startYaw( ent ) {

	if ( ent.angles != null ) return parseVector( ent.angles )[ 1 ];
	if ( ent.angle != null ) return parseFloat( ent.angle ) || 0;
	return 0;

}

/*
================
R_LevelLinks

{ start, exits } of a level.  start is where you appear when you arrive; each
exit has the map it leads to and its trigger's bounds.
================
*/
export function R_LevelLinks( meta ) {

	let start = null;
	const exits = [];

	for ( const ent of meta.entities ) {

		if ( ent.classname === 'info_player_start' && start === null )
			start = { origin: parseVector( ent.origin ), yaw: startYaw( ent ) };

		if ( ent.classname === 'trigger_changelevel' && ent.map != null && ent.model != null && ent.model.charAt( 0 ) === '*' ) {

			const sub = meta.submodels[ parseInt( ent.model.substring( 1 ), 10 ) ];
			if ( sub === undefined ) continue;

			exits.push( {
				map: ent.map,
				model: ent.model,
				mins: sub.mins.slice(),
				maxs: sub.maxs.slice(),
				kind: R_ClassifyExit( sub.mins, sub.maxs ).kind
			} );

		}

	}

	return { start, exits };

}

//============================================================================
// Exit shapes
//============================================================================

/*
================
R_ClassifyExit

kind 'plane' (axis 0 or 1: the direction it is thin in), 'pit', or 'pad'.
================
*/
export function R_ClassifyExit( mins, maxs ) {

	const dx = maxs[ 0 ] - mins[ 0 ], dy = maxs[ 1 ] - mins[ 1 ], dz = maxs[ 2 ] - mins[ 2 ];

	if ( dz <= THIN && dx >= WIDE && dy >= WIDE )
		return { kind: 'pit' };

	// a doorway, archway or walk-through portal: a tall box that is thin one way
	if ( dz >= DOOR_HIGH && Math.min( dx, dy ) <= DOOR_THICK && Math.max( dx, dy ) >= DOOR_WIDE ) {

		// nearly square (a portal frame you could enter from any side): the
		// approach is chosen from the level ( R_ChooseApproach )
		if ( Math.max( dx, dy ) < Math.min( dx, dy ) * 1.25 ) return { kind: 'plane', axis: dx <= dy ? 0 : 1, square: true };

		return { kind: 'plane', axis: dx < dy ? 0 : 1 };

	}

	return { kind: 'pad' };

}

//============================================================================
// The crossing transform
//============================================================================

const PLAYER_ORIGIN_HEIGHT = 24; // hull origin above the floor
const PIT_ARRIVAL_HEIGHT = 48; // how far above the start you appear when you fall in

function yawOf( x, y ) {

	return Math.atan2( y, x ) * 180 / Math.PI;

}

/*
================
R_CrossingTransform

exit    the trigger's bounds ( mins, maxs ) and shape
side    which way the player approaches: +1 or -1 along the exit's thin axis
        (ignored for a pit, which is entered from above)
start   { origin, yaw } of the level on the other side
floorZ  the floor level at the exit (a pit ignores it)

Returns null for a pad.  Otherwise everything needed to cross: a point at the
exit ( center ), the direction the player travels through it ( through ), where
they appear ( dest ), the rotation ( yaw ) and functions to carry positions and
directions across and to tell when a move has crossed.
================
*/
export function R_CrossingTransform( exit, side, start, floorZ, axis ) {

	const shape = R_ClassifyExit( exit.mins, exit.maxs );
	if ( shape.kind === 'plane' && axis !== undefined ) shape.axis = axis;
	if ( shape.kind === 'pad' ) return null;

	const cx = ( exit.mins[ 0 ] + exit.maxs[ 0 ] ) * 0.5;
	const cy = ( exit.mins[ 1 ] + exit.maxs[ 1 ] ) * 0.5;

	let center, through, yaw, dest, tangent, halfWidth, halfHeight;

	if ( shape.kind === 'pit' ) {

		center = [ cx, cy, ( exit.mins[ 2 ] + exit.maxs[ 2 ] ) * 0.5 ];
		through = [ 0, 0, - 1 ];
		yaw = 0; // keep the way you are facing
		dest = [ start.origin[ 0 ], start.origin[ 1 ], start.origin[ 2 ] + PIT_ARRIVAL_HEIGHT ];
		tangent = [ 1, 0, 0 ];
		halfWidth = ( exit.maxs[ 0 ] - exit.mins[ 0 ] ) * 0.5;
		halfHeight = ( exit.maxs[ 1 ] - exit.mins[ 1 ] ) * 0.5;

	} else {

		// through: the way you walk across it (against the approach side)
		through = shape.axis === 0 ? [ - side, 0, 0 ] : [ 0, - side, 0 ];
		tangent = shape.axis === 0 ? [ 0, 1, 0 ] : [ 1, 0, 0 ];
		center = [ cx, cy, floorZ + PLAYER_ORIGIN_HEIGHT ];

		// turn the walking direction into the way the start faces
		yaw = start.yaw - yawOf( through[ 0 ], through[ 1 ] );
		dest = start.origin.slice();

		halfWidth = shape.axis === 0 ? ( exit.maxs[ 1 ] - exit.mins[ 1 ] ) * 0.5 : ( exit.maxs[ 0 ] - exit.mins[ 0 ] ) * 0.5;
		halfHeight = ( exit.maxs[ 2 ] - exit.mins[ 2 ] ) * 0.5;

	}

	const rad = yaw * Math.PI / 180;
	const cos = Math.cos( rad ), sin = Math.sin( rad );

	const direction = ( v ) => [ cos * v[ 0 ] - sin * v[ 1 ], sin * v[ 0 ] + cos * v[ 1 ], v[ 2 ] ];

	// distance along the way through, from the exit plane (positive once across)
	const beyond = ( p ) =>
		( p[ 0 ] - center[ 0 ] ) * through[ 0 ] + ( p[ 1 ] - center[ 1 ] ) * through[ 1 ] + ( p[ 2 ] - center[ 2 ] ) * through[ 2 ];

	return {
		kind: shape.kind,
		center, through, dest, yaw, tangent, halfWidth, halfHeight,

		// where a point on this side ends up on the other
		position: ( p ) => {

			const r = direction( [ p[ 0 ] - center[ 0 ], p[ 1 ] - center[ 1 ], p[ 2 ] - center[ 2 ] ] );
			return [ dest[ 0 ] + r[ 0 ], dest[ 1 ] + r[ 1 ], dest[ 2 ] + r[ 2 ] ];

		},

		// a velocity or direction
		direction,

		// a view yaw
		angle: ( a ) => a + yaw,

		beyond,

		// did a move from prev to cur go across the exit, through the opening?
		crossed: ( prev, cur ) => {

			if ( beyond( prev ) > 0 || beyond( cur ) <= 0 ) return false;

			// where the move meets the plane
			const t = beyond( prev ) / ( beyond( prev ) - beyond( cur ) );
			const hit = [
				prev[ 0 ] + ( cur[ 0 ] - prev[ 0 ] ) * t,
				prev[ 1 ] + ( cur[ 1 ] - prev[ 1 ] ) * t,
				prev[ 2 ] + ( cur[ 2 ] - prev[ 2 ] ) * t
			];

			const across = ( hit[ 0 ] - center[ 0 ] ) * tangent[ 0 ] + ( hit[ 1 ] - center[ 1 ] ) * tangent[ 1 ];
			if ( Math.abs( across ) > halfWidth + 16 ) return false;

			if ( shape.kind === 'pit' )
				return Math.abs( hit[ 1 ] - center[ 1 ] ) <= halfHeight + 16;

			return hit[ 2 ] >= exit.mins[ 2 ] - 32 && hit[ 2 ] <= exit.maxs[ 2 ] + 32;

		}
	};

}

/*
================
R_InverseCrossing

The way back through a crossing, seen from the level on the far side: it
carries a point of the far level to where it came from in the near one.

t        the transform of R_CrossingTransform, near level -> far level
opening  { a0, a1, b0, b1 } the extent of the doorway along the tangent and up,
         from the crossing's centre

Same shape as R_CrossingTransform's result (a plane): center and dest swap
sides, so the exit's own opening can be reused.  Returns null for a pit.
================
*/
export function R_InverseCrossing( t, opening ) {

	if ( t.kind !== 'plane' ) return null;

	const rad = - t.yaw * Math.PI / 180;
	const cos = Math.cos( rad ), sin = Math.sin( rad );
	const direction = ( v ) => [ cos * v[ 0 ] - sin * v[ 1 ], sin * v[ 0 ] + cos * v[ 1 ], v[ 2 ] ];

	const center = t.dest.slice(); // in the far level
	const dest = t.center.slice(); // in the near level
	const forward = t.direction( t.through );
	const through = [ - forward[ 0 ], - forward[ 1 ], - forward[ 2 ] ];
	const tangent = t.direction( t.tangent );

	const beyond = ( p ) =>
		( p[ 0 ] - center[ 0 ] ) * through[ 0 ] + ( p[ 1 ] - center[ 1 ] ) * through[ 1 ] + ( p[ 2 ] - center[ 2 ] ) * through[ 2 ];

	return {
		kind: 'plane',
		back: true,
		center, through, dest, yaw: - t.yaw, tangent,
		halfWidth: ( opening.a1 - opening.a0 ) * 0.5,
		halfHeight: ( opening.b1 - opening.b0 ) * 0.5,

		position: ( p ) => {

			const r = direction( [ p[ 0 ] - center[ 0 ], p[ 1 ] - center[ 1 ], p[ 2 ] - center[ 2 ] ] );
			return [ dest[ 0 ] + r[ 0 ], dest[ 1 ] + r[ 1 ], dest[ 2 ] + r[ 2 ] ];

		},

		direction,
		angle: ( a ) => a - t.yaw,
		beyond,

		crossed: ( prev, cur ) => {

			if ( beyond( prev ) > 0 || beyond( cur ) <= 0 ) return false;

			const k = beyond( prev ) / ( beyond( prev ) - beyond( cur ) );
			const hit = [
				prev[ 0 ] + ( cur[ 0 ] - prev[ 0 ] ) * k,
				prev[ 1 ] + ( cur[ 1 ] - prev[ 1 ] ) * k,
				prev[ 2 ] + ( cur[ 2 ] - prev[ 2 ] ) * k
			];

			const across = ( hit[ 0 ] - center[ 0 ] ) * tangent[ 0 ] + ( hit[ 1 ] - center[ 1 ] ) * tangent[ 1 ];
			if ( across < opening.a0 - 8 || across > opening.a1 + 8 ) return false;

			const up = hit[ 2 ] - center[ 2 ];
			return up >= opening.b0 - 32 && up <= opening.b1 + 32;

		}
	};

}

/*
================
R_ChooseApproach

How the player walks up to a vertical exit: { axis, side } where axis is 0 or 1
(the direction they travel along) and side is +1 or -1 (which side they start
on).  Picks the side with the most open space in front of it; a nearly square
portal frame may be entered along either axis.
clearDistance( point, direction ) is how far you can go from point along
direction before hitting solid.
================
*/
export function R_ChooseApproach( exit, clearDistance ) {

	const shape = R_ClassifyExit( exit.mins, exit.maxs );
	if ( shape.kind !== 'plane' ) return { axis: 0, side: 1 };

	const c = [
		( exit.mins[ 0 ] + exit.maxs[ 0 ] ) * 0.5,
		( exit.mins[ 1 ] + exit.maxs[ 1 ] ) * 0.5,
		( exit.mins[ 2 ] + exit.maxs[ 2 ] ) * 0.5
	];

	// the ends of a slab are never the way in; a square has all four
	const axes = shape.square === true ? [ 0, 1 ] : [ shape.axis ];
	let best = null;

	for ( const axis of axes ) {

		const dir = axis === 0 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
		const plus = clearDistance( c, dir );
		const minus = clearDistance( c, [ - dir[ 0 ], - dir[ 1 ], - dir[ 2 ] ] );
		const side = plus >= minus ? 1 : - 1;
		const open = Math.max( plus, minus );

		// prefer the more open side, and the one whose far side is more closed
		const score = open - Math.min( plus, minus ) * 0.25;
		if ( best === null || score > best.score ) best = { axis, side, score };

	}

	return { axis: best.axis, side: best.side };

}

/*
================
R_ChooseApproachSide

Which side of a vertical exit the player walks up from: the side with more open
space in front of it.  clearDistance( point, direction ) is how far you can go
from point along direction before hitting solid.
================
*/
export function R_ChooseApproachSide( exit, clearDistance ) {

	const shape = R_ClassifyExit( exit.mins, exit.maxs );
	if ( shape.kind !== 'plane' ) return 1;

	const c = [
		( exit.mins[ 0 ] + exit.maxs[ 0 ] ) * 0.5,
		( exit.mins[ 1 ] + exit.maxs[ 1 ] ) * 0.5,
		( exit.mins[ 2 ] + exit.maxs[ 2 ] ) * 0.5
	];

	const dir = shape.axis === 0 ? [ 1, 0, 0 ] : [ 0, 1, 0 ];
	const plus = clearDistance( c, dir );
	const minus = clearDistance( c, [ - dir[ 0 ], - dir[ 1 ], - dir[ 2 ] ] );

	return plus >= minus ? 1 : - 1;

}
