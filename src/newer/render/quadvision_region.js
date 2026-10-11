/**
 * @module newer/render/quadvision_region
 *
 * Which monsters Quad's through-wall vision may reveal: those in the part of the level the player is in, not those
 * waiting in boxes detached from it (owner request and ruling, 11 Oct 2026, card [QV1]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `edicts`, `flood`; 1 module-level collection (Map/Set).
 *
 * Errors: catches at 1 place.
 */
// Quake levels keep monsters for ambushes in "monster closets": boxes detached from the playable level, from which a
// teleporter sends them in. Quad's vision draws every living monster through walls (r_quadvision.js), so it showed
// those too, far off in places the player can never reach. The owner's rule: reveal the monsters in the game space the
// player occupies and everything physically joined to it, where the monster is now; not those in detached boxes and
// platforms, which are normally teleported in later.
//
// "Joined to the player" is a flood of the open space of the world's player-sized collision hull (hull 1) from the
// player. Doors, platforms, bars and every other brush entity are passable (the world hull does not hold them: a door
// is part of the level and opens), so are liquids, and every teleporter the flood reaches joins its destination. A
// closet's own teleporter is inside the closet, so the flood never gets in.
//
// The flood runs over a STEP-unit grid, but a grid point is only where to look: each cell's node is the nearest point
// above or below it that is open for the player's hull (SNAP: by up to half a step), so the flood follows a ramp under
// a low ceiling (e3m5's way on from its start) and a duct the hull barely fits (e2m7's scrag ducts). A step joins two nodes only along a clear hull-1 trace. A monster is revealed while a node of its own
// cell or the cells round it was reached and has a clear trace to an open point by the monster (its origin, or nudged
// down, up or sideways by up to its half-width: a monster touching a wall, or hovering under a low ceiling, need not
// fit the player's hull exactly where its origin is), that point joined to its origin by a clear line.
//
// The flood is built once per edict list (each server spawn makes a new one), a bounded number of cells at a time, from
// the start of each level (r_quadvision.js R_QuadVisionPrepare) and on each question while Quad is held, and extended
// from the player whenever the player stands somewhere not yet reached. A monster it has not reached is not revealed, so
// a closet is never given away while the flood is under way. Each monster's answer is kept while it stays in the same
// grid cell: revealed for good (the flood only grows), hidden until the flood has taken in REASK more cells or finished. When there is no world hull, no player or no edict list, every monster counts.
import { SV_HullPointContents, SV_RecursiveHullCheck, trace_t } from '../../engine/server/world.js';
import { PR_GetString } from '../../engine/progs/progs.js';

const STEP = 16;                    // Quake units between grid points
const CONTENTS_SOLID = - 2;
const HALF = STEP / 2;
// where a cell's node is looked for when its grid point is solid for the player's hull, nearest first: up or down by up
// to half a step, so the flood follows the height of the floor, a ramp under a low ceiling or a duct the hull barely fits
const SNAP = Object.freeze( [ 2, - 2, 4, - 4, 6, - 6, 8, - 8 ].map( dz => Object.freeze( [ 0, 0, dz ] ) ) );
// where an open point is looked for by a monster, nearest first: its origin, then up to its half-width (16) sideways and
// from 32 down to 16 up, at once (a scrag at the dead end of a duct whose open band for the player's hull is 8 high)
const NUDGE = ( () => {
	const out = [];
	for ( const dx of [ - 16, - 8, 0, 8, 16 ] ) for ( const dy of [ - 16, - 8, 0, 8, 16 ] ) for ( const dz of [ - 32, - 24, - 16, - 8, 0, 8, 16 ] ) out.push( Object.freeze( [ dx, dy, dz ] ) );
	return Object.freeze( out.sort( ( a, b ) => ( a[ 0 ] ** 2 + a[ 1 ] ** 2 + a[ 2 ] ** 2 ) - ( b[ 0 ] ** 2 + b[ 1 ] ** 2 + b[ 2 ] ** 2 ) ) );
} )();
const REASK = 4000; // cells the flood takes in before a hidden monster is asked again
const DIRS = Object.freeze( [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ] );
export const QUAD_REGION = Object.freeze( { step: STEP, cellsPerFrame: 150, cellsPerQuestion: 400 } );

let edicts = null, flood = null;    // the edict list the flood belongs to; the flood
const answers = new WeakMap();      // edict -> { cell, flood, reached, done, inLevel }

const text = n => { try { return n ? PR_GetString( n ) : ''; } catch { return ''; } };

function makeFlood( world ) {

	const hull = world.hulls?.[ 1 ], point = world.hulls?.[ 0 ], mn = world.mins, mx = world.maxs;
	if ( hull == null || point == null || mn == null || mx == null ) return null;
	const nx = Math.ceil( ( mx[ 0 ] - mn[ 0 ] ) / STEP ) + 1, ny = Math.ceil( ( mx[ 1 ] - mn[ 1 ] ) / STEP ) + 1, nz = Math.ceil( ( mx[ 2 ] - mn[ 2 ] ) / STEP ) + 1;
	return { hull, point, mn, nx, ny, nz, seen: new Uint8Array( Math.ceil( nx * ny * nz / 8 ) ), blocked: new Uint8Array( Math.ceil( nx * ny * nz / 8 ) ), snapped: new Map(), reached: 0, queue: makeQueue(), teleporters: [], joined: new Set(),
		a: new Float32Array( 3 ), b: new Float32Array( 3 ), c: new Float32Array( 3 ), d: new Float32Array( 3 ), trace: new trace_t() };

}

// The flood's queue: fixed-size chunks taken from the front and added at the back (no array is ever shifted or copied)
const CHUNK = 8192;
function makeQueue() { return { chunks: [ new Int32Array( CHUNK ) ], head: 0, tail: 0 }; }
function push( q, v ) {

	if ( q.tail === CHUNK ) { q.chunks.push( new Int32Array( CHUNK ) ); q.tail = 0; }
	q.chunks[ q.chunks.length - 1 ][ q.tail ++ ] = v;

}
const pending = q => q.chunks.length > 1 || q.head < q.tail;
function take( q ) {

	const v = q.chunks[ 0 ][ q.head ++ ];
	if ( q.head === CHUNK ) { q.chunks.shift(); q.head = 0; if ( q.chunks.length === 0 ) { q.chunks.push( new Int32Array( CHUNK ) ); q.tail = 0; } }
	return v;

}

const isSeen = ( f, i ) => ( f.seen[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) !== 0;
const mark = ( f, i ) => { f.seen[ i >> 3 ] |= 1 << ( i & 7 ); };
function index( f, p ) {

	const x = Math.round( ( p[ 0 ] - f.mn[ 0 ] ) / STEP ), y = Math.round( ( p[ 1 ] - f.mn[ 1 ] ) / STEP ), z = Math.round( ( p[ 2 ] - f.mn[ 2 ] ) / STEP );
	return x < 0 || y < 0 || z < 0 || x >= f.nx || y >= f.ny || z >= f.nz ? - 1 : x + f.nx * ( y + f.ny * z );

}
const open = ( f, p ) => SV_HullPointContents( f.hull, f.hull.firstclipnode, p ) !== CONTENTS_SOLID;
function clear( f, p, q, hull = f.hull ) {

	const t = f.trace;
	t.fraction = 1; t.allsolid = true; t.startsolid = false; t.inopen = false; t.inwater = false;
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, p, q, t );
	return t.fraction === 1 && ! t.startsolid && ! t.allsolid;

}

// cell i's node into `out`: its grid point, or the nearest open point to it within half a step; false when none (and
// then remembered, so a cell in a wall is searched once)
function node( f, i, out ) {

	if ( ( f.blocked[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) !== 0 ) return false;
	const x = i % f.nx, y = ( ( i / f.nx ) | 0 ) % f.ny, z = ( i / ( f.nx * f.ny ) ) | 0;
	const gx = f.mn[ 0 ] + x * STEP, gy = f.mn[ 1 ] + y * STEP, gz = f.mn[ 2 ] + z * STEP;
	const known = f.snapped.get( i ); // (a cell whose grid point is solid keeps the offset found for it)
	if ( known !== undefined ) { const s = SNAP[ known ]; out[ 0 ] = gx + s[ 0 ]; out[ 1 ] = gy + s[ 1 ]; out[ 2 ] = gz + s[ 2 ]; return true; }
	out[ 0 ] = gx; out[ 1 ] = gy; out[ 2 ] = gz;
	if ( open( f, out ) ) return true;
	for ( let k = 0; k < SNAP.length; k ++ ) {

		const s = SNAP[ k ];
		out[ 0 ] = gx + s[ 0 ]; out[ 1 ] = gy + s[ 1 ]; out[ 2 ] = gz + s[ 2 ];
		if ( open( f, out ) ) { f.snapped.set( i, k ); return true; }

	}
	f.blocked[ i >> 3 ] |= 1 << ( i & 7 );
	return false;

}

// the cells round `p` whose nodes have a clear trace from it join the flood
function seed( f, p ) {

	const from = Float32Array.from( p ), c = f.c;
	for ( let dx = - 1; dx <= 1; dx ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dz = - 1; dz <= 1; dz ++ ) {

		c[ 0 ] = p[ 0 ] + dx * STEP; c[ 1 ] = p[ 1 ] + dy * STEP; c[ 2 ] = p[ 2 ] + dz * STEP;
		const i = index( f, c );
		if ( i < 0 || isSeen( f, i ) || ! node( f, i, c ) || ! clear( f, from, c ) ) continue;
		mark( f, i ); push( f.queue, i ); f.reached ++;

	}

}

// Floods on through at most `cells` cells (the rest next time): a bounded amount of work, the same on any machine
function run( f, cells ) {

	if ( ! pending( f.queue ) ) return;
	const a = f.a, b = f.b;
	// breadth first, outward from the player: the monsters nearest the player are reached first
	for ( let n = 0; n < cells && pending( f.queue ); n ++ ) {

		const i = take( f.queue );
		node( f, i, a );
		const x = i % f.nx, y = ( ( i / f.nx ) | 0 ) % f.ny, z = ( i / ( f.nx * f.ny ) ) | 0;
		for ( const d of DIRS ) {

			const X = x + d[ 0 ], Y = y + d[ 1 ], Z = z + d[ 2 ];
			if ( X < 0 || Y < 0 || Z < 0 || X >= f.nx || Y >= f.ny || Z >= f.nz ) continue;
			const j = X + f.nx * ( Y + f.ny * Z );
			if ( isSeen( f, j ) || ! node( f, j, b ) || ! clear( f, a, b ) ) continue;
			mark( f, j ); push( f.queue, j ); f.reached ++;

		}
		for ( const t of f.teleporters ) {

			if ( f.joined.has( t ) ) continue;
			if ( a[ 0 ] < t.lo[ 0 ] || a[ 0 ] > t.hi[ 0 ] || a[ 1 ] < t.lo[ 1 ] || a[ 1 ] > t.hi[ 1 ] || a[ 2 ] < t.lo[ 2 ] || a[ 2 ] > t.hi[ 2 ] ) continue;
			f.joined.add( t );
			if ( t.to ) seed( f, Array.from( t.to.v.origin ) );

		}

	}

}

function prepare( server ) {

	edicts = server.edicts;
	flood = makeFlood( server.worldmodel );
	if ( flood === null ) return;
	const byName = new Map();
	for ( const e of edicts ) if ( e && ! e.free ) { const n = text( e.v.targetname ); if ( n && ! byName.has( n ) ) byName.set( n, e ); }
	for ( const e of edicts ) {

		if ( e == null || e.free || e.v.absmin == null || text( e.v.classname ) !== 'trigger_teleport' ) continue;
		flood.teleporters.push( { lo: Array.from( e.v.absmin, v => v - HALF ), hi: Array.from( e.v.absmax, v => v + HALF ), to: byName.get( text( e.v.target ) ) || null } );

	}

}

// Is `origin` joined to the flood: an open point by it (NUDGE, joined to the origin by a clear line) with a clear trace
// to a reached node of its cell or the cells round it
function reachedAt( f, origin ) {

	const o = f.d, p = f.c, n = f.b;
	o[ 0 ] = origin[ 0 ]; o[ 1 ] = origin[ 1 ]; o[ 2 ] = origin[ 2 ];
	for ( const s of NUDGE ) {

		p[ 0 ] = o[ 0 ] + s[ 0 ]; p[ 1 ] = o[ 1 ] + s[ 1 ]; p[ 2 ] = o[ 2 ] + s[ 2 ];
		if ( ! open( f, p ) ) continue;
		let near = false;
		const cx = Math.round( ( p[ 0 ] - f.mn[ 0 ] ) / STEP ), cy = Math.round( ( p[ 1 ] - f.mn[ 1 ] ) / STEP ), cz = Math.round( ( p[ 2 ] - f.mn[ 2 ] ) / STEP );
		for ( let dx = - 1; dx <= 1 && ! near; dx ++ ) for ( let dy = - 1; dy <= 1 && ! near; dy ++ ) for ( let dz = - 1; dz <= 1 && ! near; dz ++ ) {

			const X = cx + dx, Y = cy + dy, Z = cz + dz;
			if ( X < 0 || Y < 0 || Z < 0 || X >= f.nx || Y >= f.ny || Z >= f.nz ) continue;
			if ( isSeen( f, X + f.nx * ( Y + f.ny * Z ) ) ) near = true;

		}
		if ( ! near ) continue; // (nothing reached round here: no traces needed)
		if ( ( s[ 0 ] || s[ 1 ] || s[ 2 ] ) && ! clear( f, o, p, f.point ) ) continue;
		for ( let dx = - 1; dx <= 1; dx ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dz = - 1; dz <= 1; dz ++ ) {

			const X = cx + dx, Y = cy + dy, Z = cz + dz;
			if ( X < 0 || Y < 0 || Z < 0 || X >= f.nx || Y >= f.ny || Z >= f.nz ) continue;
			const j = X + f.nx * ( Y + f.ny * Z );
			if ( isSeen( f, j ) && node( f, j, n ) && clear( f, n, p ) ) return true;

		}

	}
	return false;

}

/**
 * A test for "this monster is in the game space the player occupies, or joined to it" for this frame. Floods on through
 * up to `cells` cells first (starting the flood for a new edict list, and extending it from the player when the player
 * stands somewhere not yet reached).
 *
 * @param {{ edicts: Array<Object>, worldmodel: ?Object }} server the server state (`sv`): its edicts (the player is
 *   edict 1) and its world model (`hulls`, `mins`, `maxs`)
 * @param {number} [cells=QUAD_REGION.cellsPerQuestion] how many cells the flood may take in now (Infinity: finish it)
 * @returns {function(Object): boolean} given an edict (`v.origin`), true when it is joined to the player's space;
 *   always true when there is no edict list, world hull or player
 */
export function QuadVisionRegion( server, cells = QUAD_REGION.cellsPerQuestion ) {

	const list = server?.edicts, player = list?.[ 1 ];
	if ( ! Array.isArray( list ) || server.worldmodel == null || player == null || player.free || player.v?.origin == null ) return () => true;
	if ( list !== edicts ) prepare( server );
	const f = flood;
	if ( f === null ) return () => true;
	const ask = e => {

		const o = e.v.origin;
		if ( o == null ) return true;
		const cell = index( f, o );
		const kept = answers.get( e );
		// (a revealed monster stays revealed in its cell: the flood only grows; a hidden one is asked again once the flood
		// has taken in REASK more cells, or has finished)
		if ( kept && kept.cell === cell && kept.flood === f && ( kept.inLevel || ( f.reached - kept.reached < REASK && ( pending( f.queue ) || kept.done ) ) ) ) return kept.inLevel;
		const inLevel = cell < 0 ? true : reachedAt( f, o );
		answers.set( e, { cell, flood: f, reached: f.reached, done: ! pending( f.queue ), inLevel } );
		return inLevel;

	};
	if ( ! ask( player ) ) seed( f, Array.from( player.v.origin ) );
	run( f, cells );
	return ask;

}

/**
 * Forgets the flood: the next `QuadVisionRegion` builds it again.
 */
export function QuadVisionRegionReset() { edicts = null; flood = null; }
