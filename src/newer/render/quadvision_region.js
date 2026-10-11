/**
 * @module newer/render/quadvision_region
 *
 * Which monsters Quad's through-wall vision may reveal: those in the part of the level the player can reach, not
 * those waiting in monster closets (owner request 11 Oct 2026, card [QV1]).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `edicts`, `flood`; 1 module-level collection (Map/Set).
 *
 * Errors: catches at 1 place.
 */
// Quake levels keep monsters for ambushes in "monster closets": rooms the player cannot walk into, from which the
// monsters are sent in by a teleporter (switched on by the level's trigger, or always on and reached when a door in
// the closet opens) or let out through a door. Quad's vision draws every living monster through walls
// (r_quadvision.js), so it showed those too and gave the ambushes away. The owner's rule: only monsters actually in
// the level, active or not, are revealed.
//
// "In the level" is where the player can get to: a flood of the open space of the world's player-sized collision hull
// (hull 1), on a STEP-unit grid, from the player, each step taken only along a clear trace. Doors, platforms, bars and
// every other brush entity are passable (the world hull does not hold them: a door the level opens is a way in).
// Liquids are passable. Every teleporter the flood reaches joins its destination (whatever starts it: a teleporter
// switched on by a button the player can reach is a way there). A closet's own teleporter is inside the closet, so
// the flood never gets in. A monster is revealed while a reached grid point near it has a clear trace to it; it is
// judged by where it is now, so one pacing inside its closet stays hidden and one sent into the level shows at once.
//
// The flood is built once per edict list (each server spawn makes a new one), a few milliseconds a frame from the start
// of each level (r_quadvision.js R_QuadVisionPrepare, 2 ms a frame; a whole level takes 130 to 290 ms) and faster
// while Quad is held (4 ms), and extended from the player
// whenever the player stands somewhere not yet reached. Until it reaches a monster that monster is not revealed, so a
// closet is never given away while the flood is under way; the monsters in the level appear as it reaches them. Each monster's answer is kept while it stays
// in the same grid cell. When there is no world hull, no player or no edict list, every monster counts, as before.
import { SV_HullPointContents, SV_RecursiveHullCheck, trace_t } from '../../engine/server/world.js';
import { PR_GetString } from '../../engine/progs/progs.js';

const STEP = 16;                    // Quake units between grid points (32 missed e1m3's narrow passages; 8 gave the same answers as 16 at four times the cost)
const CONTENTS_SOLID = - 2;
const MONSTER_DROP = Object.freeze( [ 0, - 8, - 16, - 24, - 32, 8, 16 ] ); // heights tried from a monster's origin

let edicts = null, flood = null;    // the edict list the flood belongs to; the flood
const answers = new WeakMap();      // edict -> { cell, inLevel }

const text = n => { try { return n ? PR_GetString( n ) : ''; } catch { return ''; } };

function makeFlood( world ) {

	const hull = world.hulls?.[ 1 ], mn = world.mins, mx = world.maxs;
	if ( hull == null || mn == null || mx == null ) return null;
	const nx = Math.ceil( ( mx[ 0 ] - mn[ 0 ] ) / STEP ) + 1, ny = Math.ceil( ( mx[ 1 ] - mn[ 1 ] ) / STEP ) + 1, nz = Math.ceil( ( mx[ 2 ] - mn[ 2 ] ) / STEP ) + 1;
	const f = { world, hull, point: world.hulls[ 0 ], mn, nx, ny, nz, seen: new Uint8Array( nx * ny * nz ), queue: [], teleporters: [], joined: new Set(),
		a: new Float32Array( 3 ), b: new Float32Array( 3 ), trace: new trace_t(), generation: 0 };
	return f;

}

function pos( f, i, out ) { const x = i % f.nx, y = ( ( i / f.nx ) | 0 ) % f.ny, z = ( i / ( f.nx * f.ny ) ) | 0; out[ 0 ] = f.mn[ 0 ] + x * STEP; out[ 1 ] = f.mn[ 1 ] + y * STEP; out[ 2 ] = f.mn[ 2 ] + z * STEP; return out; }
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

// the grid points round `p` with a clear trace to it join the flood
function seed( f, p ) {

	const c = f.b;
	for ( let dx = - 1; dx <= 1; dx ++ ) for ( let dy = - 1; dy <= 1; dy ++ ) for ( let dz = - 1; dz <= 1; dz ++ ) {

		c[ 0 ] = p[ 0 ] + dx * STEP; c[ 1 ] = p[ 1 ] + dy * STEP; c[ 2 ] = p[ 2 ] + dz * STEP;
		const i = index( f, c );
		if ( i < 0 || f.seen[ i ] ) continue;
		pos( f, i, c );
		if ( ! open( f, c ) || ! clear( f, Float32Array.from( p ), c ) ) continue;
		f.seen[ i ] = 1; f.queue.push( i );

	}

}

const DIRS = Object.freeze( [ [ 1, 0, 0 ], [ - 1, 0, 0 ], [ 0, 1, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ], [ 0, 0, - 1 ] ] );
// Floods for at most `budget` milliseconds (the rest next time): a whole level takes 130 to 290 ms, too long for one
// frame when Quad is picked up
function run( f, budget ) {

	if ( f.queue.length === 0 ) return;
	f.generation ++; // (answers given before the flood grew are asked again)
	const a = f.a, b = f.b, until = performance.now() + budget;
	let n = 0;
	while ( f.queue.length ) {

		if ( ( ++ n & 255 ) === 0 && performance.now() > until ) return;

		const i = f.queue.pop();
		pos( f, i, a );
		for ( const d of DIRS ) {

			b[ 0 ] = a[ 0 ] + d[ 0 ] * STEP; b[ 1 ] = a[ 1 ] + d[ 1 ] * STEP; b[ 2 ] = a[ 2 ] + d[ 2 ] * STEP;
			const j = index( f, b );
			if ( j < 0 || f.seen[ j ] || ! open( f, b ) || ! clear( f, a, b ) ) continue;
			f.seen[ j ] = 1; f.queue.push( j );

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
		flood.teleporters.push( { lo: Array.from( e.v.absmin, v => v - 16 ), hi: Array.from( e.v.absmax, v => v + 16 ), to: byName.get( text( e.v.target ) ) || null } );

	}

}

// is a reached grid point within NEAR units of `o` joined to it by a clear trace (a flying monster hovers in the open;
// the nearest grid points can be solid for the player's hull at its height)
const NEAR = Math.round( 64 / STEP );
function reached( f, o ) {

	const c = new Float32Array( 3 ), p = Float32Array.from( o );
	for ( let dx = - NEAR; dx <= NEAR; dx ++ ) for ( let dy = - NEAR; dy <= NEAR; dy ++ ) for ( let dz = - NEAR; dz <= NEAR; dz ++ ) {

		c[ 0 ] = o[ 0 ] + dx * STEP; c[ 1 ] = o[ 1 ] + dy * STEP; c[ 2 ] = o[ 2 ] + dz * STEP;
		const i = index( f, c );
		if ( i < 0 || ! f.seen[ i ] ) continue;
		pos( f, i, c );
		if ( clear( f, c, p ) ) return true;

	}
	return false;

}
// A monster's origin need not fit the player's hull (a scrag hovering under a low ceiling): heights near it that do
// are tried, each joined to the origin by a clear line (the point hull, hull 0)
function monsterReached( f, origin ) {

	const p = [ 0, 0, 0 ];
	for ( const dz of MONSTER_DROP ) {

		p[ 0 ] = origin[ 0 ]; p[ 1 ] = origin[ 1 ]; p[ 2 ] = origin[ 2 ] + dz;
		if ( ! open( f, p ) ) continue;
		if ( dz !== 0 && ! clear( f, Float32Array.from( origin ), Float32Array.from( p ), f.point ) ) continue;
		if ( reached( f, p ) ) return true;

	}
	return false;

}

/**
 * A test for "this monster is in the part of the level the player can reach" for this frame. Floods on for up to
 * `budget` ms first (starting the flood on the first question for an edict list, and extending it from the player when
 * the player stands somewhere not yet reached).
 *
 * @param {{ edicts: Array<Object>, worldmodel: ?Object }} server the server state (`sv`): its edicts (the player is
 *   edict 1) and its world model (`hulls[1]`, `mins`, `maxs`)
 * @param {number} [budget=4] milliseconds of flooding allowed now (Infinity: finish it)
 * @returns {function(Object): boolean} given an edict (`v.origin`), true when it is where the player can reach; always
 *   true when there is no edict list, world hull or player
 */
export function QuadVisionRegion( server, budget = 4 ) {

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
		if ( kept && kept.cell === cell && kept.flood === f && kept.generation === f.generation ) return kept.inLevel;
		const inLevel = cell < 0 ? true : monsterReached( f, o );
		answers.set( e, { cell, flood: f, generation: f.generation, inLevel } );
		return inLevel;

	};
	if ( ! ask( player ) ) seed( f, Array.from( player.v.origin ) );
	run( f, budget );
	return ask;

}

/**
 * Forgets the flood: the next `QuadVisionRegion` builds it again.
 */
export function QuadVisionRegionReset() { edicts = null; flood = null; }
