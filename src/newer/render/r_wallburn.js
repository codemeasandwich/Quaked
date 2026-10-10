/**
 * @module newer/render/r_wallburn
 *
 * Burn marks the guns leave on walls (card [30c]), from the supplied wall canvas.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `deps`, `bases`, `basisCount`, `cells`, `cellList`, `faces`,
 * `facesModel`, `beam`, `queue`, `heatRemaining`, `heatClock`, `lastTime` and 8 more; 1 module-level collection
 * (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Burn marks the guns leave on the level's walls in Newer Game (card [30c]): the supplied wall canvas
// (arc-weapons-wall-canvas-shotgun.html, sha256 8b1569225ae5..., its WallDrawingSurface and brush GLSL), on Quake's
// world faces.  The original page stays intact and is not copied into the game.
//
// What the source keeps, kept here: three layers in one atlas of whole-wall charts.  The groove (the cut) and the burn
// (the charred rim) are permanent: each stroke is MAX-blended into them and nothing ever fades them.  The heat is
// separate: a 16-bit value (two bytes) ping-ponged every step, a white core at the stroke that the whole surface cools
// by the same amount each pass (4.2 seconds from white to nothing), with no per-mark ages.  A stroke is a capsule
// (from the previous contact to this one, on the same chart); the lightning gun's beam draws continuous strokes and
// every shotgun pellet is its own dot (breakBefore: never joined into a scratch).
//
// Fitted to Quake:
// * Charts.  The source's walls are a handful of known rectangles.  Here a chart is a world plane (one side of it),
//   with fixed in-plane axes, so the faces the BSP split from one wall share one continuous chart and a stroke crosses
//   their seams; repeated texture coordinates are never used.  A plane is cut into CELL x CELL unit cells and a cell
//   takes a slot in the atlas only when something first marks it (a bounded number: when they are all taken, no new
//   wall is marked and the pellets fall back to the ordinary bullet-hole decal).  The brush paints a cell's padding
//   too, so neighbouring cells meet without a seam.
// * Drawn.  Each marked cell's own piece of every face on that plane (the face clipped to the cell) is drawn over the
//   wall twice: the groove and burn as a multiplier of the wall's colour (the decals' material, so the wall's own
//   lighting lights it), and, while anything is hot, the heat as additive light (the Fireball's material) for the
//   bloom to take.  The source's groove relief (a normal from the mask's slope) is not reproduced: the world here is
//   lit from lightmaps, and a multiplier cannot bend the normal.
// * Contacts.  The beam: the end of the player's own TE_LIGHTNING2 (where the server's trace met a wall; it ignores
//   monsters, so the pen is lifted when a monster stands in the beam, rather than painting the wall behind it), lifted
//   on release, a miss, a new plane, or a wall in between (checked along the sweep from the beam's start).  Pellets:
//   every TE_GUNSHOT (the player's shotguns and the Grunts'), as the source's shotgun.
// * Lifetime.  The marks last for the level: a new map (or a loaded game) clears them; they are not saved.  The GPU
//   memory (2048 x 2048: one RG8 for the marks and two RG8 for the heat, 25 MB) is allocated on the first mark and
//   kept for the session.  A lost WebGL context loses the marks.

import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame } from '../mode.js';
import { R_DecalSurface } from './r_decals.js';
import { MRT_OUT, MRT_ZERO, material } from './r_fireball.js';
import { trace_t, SV_RecursiveHullCheck } from '../../engine/server/world.js';
import { VERTEXSIZE } from '../../engine/render/glquake.js';

export const r_newer_wallburn = new cvar_t( 'r_newer_wallburn', '1' );

export const WALLBURN = {
	K: 12,              // Quake units to one source unit (as the beam, card [30a])
	radius: .14,        // the beam's brush, source units (WallDrawingSurface's default radius)
	cooling: 4.2,       // seconds (its coolingSeconds)
	size: 2048,         // the atlas, texels square (its default 2048 x 2048)
	padding: 4,         // texels round each cell (its padding)
	cell: 48,           // Quake units on a side of a chart cell
	slot: 128,          // texels a cell takes: 48 units at 2.5 texels a unit (the source's density: 1024 texels over its
	                    // 34-unit front wall, 30 a source unit) and the padding each side
	maxStrokes: 16,     // capsules one GPU pass paints
	maxQueue: 256,      // pellet contacts waiting for the next frame (the source's wallPaintQueue)
	pelletDist: 10,     // a TE_GUNSHOT is 4 units in front of the wall it struck
	beamDist: 3,        // the beam ends on the wall (looked up a unit back from its end)
	lift: .1,           // Quake units the drawn cells sit off the wall (with a polygon offset)
	sweepStep: 2,       // Quake units between the checks along a beam's sweep (at most sweepSteps of them)
	sweepSteps: 32
};

const SURF_PLANEBACK = 2, SURF_DRAWSKY = 4, SURF_DRAWTURB = 0x10;
const SLOTS = WALLBURN.size / WALLBURN.slot; // cells in a row of the atlas
const NOISE_WRAP = 25; // cells before the erosion noise's wall coordinate wraps (25 x 48 units = 100 source units)
// the monsters (and other players) a beam can stand on; the server's beam passes through them
const MONSTER = /^progs\/(soldier|dog|ogre|knight|hknight|demon|shambler|zombie|wizard|enforcer|fish|shalrath|tarbaby|boss|oldone|player)\.mdl$/;

let deps = null;
// the charts: per plane side a basis; the marked cells; the faces of each plane side
let bases = new WeakMap(), basisCount = 0, cells = new Map(), cellList = [], faces = null, facesModel = null;
let beam = null;   // the beam's pen: { basis, uv: [u,v], point: [x,y,z] } or null when lifted
let queue = [];    // capsules to paint this frame: { cell, from, to, radius }
let heatRemaining = 0, heatClock = 0, lastTime = null, front = 0, needsClear = false;
let gpu = null, geometryDirty = false;
let marks = null, heat = null, geometry = null;

export const wallBurnStats = { cells: 0, full: 0, strokes: 0, passes: 0, beamBreaks: 0, pellets: 0, vertices: 0 };

// externals: scene; renderer() (THREE.WebGLRenderer); cl() (the client state: worldmodel, viewentity);
// pointInLeaf( p, model ); beam() -> { start, end } | null (the player's own TE_LIGHTNING2);
// entities() -> the client entities drawn this frame; self() -> the player's own client entity; trace( s, q )
// (optional: R_WallBurnTrace's { point, normal, dist }, else the world's own hull)
export function R_WallBurnSetup( externals ) { deps = externals; }
export const R_WallBurnEnabled = () => deps !== null && R_NewerGame() && r_newer_wallburn.value !== 0;

//============================================================================
// Charts
//============================================================================

const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
const cross = ( a, b ) => [ a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ], a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ], a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ] ];
const unit = a => { const l = Math.hypot( a[ 0 ], a[ 1 ], a[ 2 ] ) || 1; return [ a[ 0 ] / l, a[ 1 ] / l, a[ 2 ] / l ]; };

// one side of a world plane: its outward normal, distance and fixed in-plane axes (the decals' axes, unturned)
function basisOf( plane, back ) {

	let pair = bases.get( plane );
	if ( pair === undefined ) { pair = [ null, null ]; bases.set( plane, pair ); }
	const side = back ? 1 : 0;
	if ( pair[ side ] === null ) {

		const s = back ? - 1 : 1, n = [ plane.normal[ 0 ] * s, plane.normal[ 1 ] * s, plane.normal[ 2 ] * s ];
		const a = Math.abs( n[ 2 ] ) > 0.9 ? [ 1, 0, 0 ] : [ 0, 0, 1 ];
		const U = unit( cross( a, n ) ), V = cross( n, U );
		pair[ side ] = { id: basisCount ++, plane, back, n, d: plane.dist * s, U, V };

	}
	return pair[ side ];

}

// the level's own faces (not the doors' and lifts'), by plane side, each as its polygon in the chart's coordinates
function facesOf( basis ) {

	const model = deps.cl()?.worldmodel;
	if ( faces === null || facesModel !== model ) {

		faces = new Map(); facesModel = model;
		const first = model?.firstmodelsurface || 0, count = model?.nummodelsurfaces || 0;
		for ( let i = first; i < first + count; i ++ ) {

			const s = model.surfaces[ i ];
			if ( s == null || s.plane == null || s.polys == null || ( s.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) ) continue;
			const b = basisOf( s.plane, ( s.flags & SURF_PLANEBACK ) !== 0 );
			if ( ! faces.has( b ) ) faces.set( b, [] );
			faces.get( b ).push( s );

		}

	}
	const list = faces.get( basis );
	if ( list === undefined ) return [];
	return list.map( s => {

		if ( s._wallburn?.basis === basis ) return s._wallburn;
		const p = s.polys, verts = [];
		for ( let i = 0; i < p.numverts; i ++ ) verts.push( [ p.verts[ i * VERTEXSIZE ], p.verts[ i * VERTEXSIZE + 1 ], p.verts[ i * VERTEXSIZE + 2 ] ] ); // (flat: xyz s t ls lt)
		const uv = verts.map( v => [ dot( v, basis.U ), dot( v, basis.V ) ] );
		const min = [ Math.min( ...uv.map( q => q[ 0 ] ) ), Math.min( ...uv.map( q => q[ 1 ] ) ) ], max = [ Math.max( ...uv.map( q => q[ 0 ] ) ), Math.max( ...uv.map( q => q[ 1 ] ) ) ];
		s._wallburn = { basis, verts, uv, min, max };
		return s._wallburn;

	} );

}

// a face polygon clipped to a cell's square (Sutherland-Hodgman on the chart's coordinates)
export function R_WallBurnClip( verts, uv, u0, v0, u1, v1 ) {

	let poly = verts.map( ( v, i ) => ( { p: v, q: uv[ i ] } ) );
	const edges = [ [ 0, u0, 1 ], [ 0, u1, - 1 ], [ 1, v0, 1 ], [ 1, v1, - 1 ] ];
	for ( const [ axis, at, sign ] of edges ) {

		const out = [];
		for ( let i = 0; i < poly.length; i ++ ) {

			const a = poly[ i ], b = poly[ ( i + 1 ) % poly.length ];
			const da = ( a.q[ axis ] - at ) * sign, db = ( b.q[ axis ] - at ) * sign;
			if ( da >= 0 ) out.push( a );
			if ( ( da >= 0 ) !== ( db >= 0 ) ) {

				const t = da / ( da - db );
				out.push( { p: a.p.map( ( x, k ) => x + ( b.p[ k ] - x ) * t ), q: a.q.map( ( x, k ) => x + ( b.q[ k ] - x ) * t ) } );

			}

		}
		poly = out;
		if ( poly.length < 3 ) return [];

	}
	return poly;

}

// the cell of a plane side at ( cu, cv ), taking an atlas slot the first time; null where no face of the level lies
// in it, or when every slot is taken
function cellAt( basis, cu, cv ) {

	const key = basis.id + ':' + cu + ':' + cv;
	const known = cells.get( key );
	if ( known !== undefined ) return known;

	const C = WALLBURN.cell, u0 = cu * C, v0 = cv * C, u1 = u0 + C, v1 = v0 + C;
	const pieces = [];
	for ( const f of facesOf( basis ) ) {

		if ( f.max[ 0 ] <= u0 || f.min[ 0 ] >= u1 || f.max[ 1 ] <= v0 || f.min[ 1 ] >= v1 ) continue;
		const piece = R_WallBurnClip( f.verts, f.uv, u0, v0, u1, v1 );
		if ( piece.length >= 3 ) pieces.push( piece );

	}
	if ( pieces.length === 0 ) return null;
	if ( cellList.length >= SLOTS * SLOTS ) { wallBurnStats.full ++; return null; }

	const slot = cellList.length, S = WALLBURN.size, P = WALLBURN.padding, x = ( slot % SLOTS ) * WALLBURN.slot, y = Math.floor( slot / SLOTS ) * WALLBURN.slot;
	const cell = {
		key, basis, cu, cv, slot, pieces,
		alloc: [ x / S, y / S, WALLBURN.slot / S, WALLBURN.slot / S ],                           // the slot, with its padding
		rect: [ ( x + P ) / S, ( y + P ) / S, ( WALLBURN.slot - 2 * P ) / S, ( WALLBURN.slot - 2 * P ) / S ], // the cell itself
		noise: [ ( ( cu % NOISE_WRAP ) + NOISE_WRAP ) % NOISE_WRAP * C / WALLBURN.K, ( ( cv % NOISE_WRAP ) + NOISE_WRAP ) % NOISE_WRAP * C / WALLBURN.K ]
	};
	cells.set( key, cell ); cellList.push( cell ); wallBurnStats.cells = cellList.length; geometryDirty = true;
	return cell;

}

// a capsule from a to b (chart coordinates, Quake units) of the given brush radius (source units) on a plane side:
// queued for each cell it reaches (taking cells as needed).  Returns how many cells took it.
function stroke( basis, a, b, radius ) {

	const C = WALLBURN.cell, K = WALLBURN.K, reach = radius * 1.7 * K; // the source's conservative pen bounds
	const minU = Math.min( a[ 0 ], b[ 0 ] ) - reach, maxU = Math.max( a[ 0 ], b[ 0 ] ) + reach;
	const minV = Math.min( a[ 1 ], b[ 1 ] ) - reach, maxV = Math.max( a[ 1 ], b[ 1 ] ) + reach;
	let taken = 0;
	for ( let cu = Math.floor( minU / C ); cu <= Math.floor( maxU / C ); cu ++ ) for ( let cv = Math.floor( minV / C ); cv <= Math.floor( maxV / C ); cv ++ ) {

		// only the cells the capsule itself reaches (not every cell of a long diagonal's box)
		if ( segmentBoxDistance( a, b, cu * C, cv * C, cu * C + C, cv * C + C ) > reach ) continue;
		const cell = cellAt( basis, cu, cv );
		if ( cell === null ) continue;
		const o = [ cu * C, cv * C ];
		queue.push( { cell, from: [ ( a[ 0 ] - o[ 0 ] ) / K, ( a[ 1 ] - o[ 1 ] ) / K ], to: [ ( b[ 0 ] - o[ 0 ] ) / K, ( b[ 1 ] - o[ 1 ] ) / K ], radius } );
		taken ++;

	}
	if ( taken > 0 ) wallBurnStats.strokes ++;
	return taken;

}

function segmentBoxDistance( a, b, x0, y0, x1, y1 ) {

	// sampled closely enough for a bound: the distance from the box to the nearest of 9 points along the segment
	let best = Infinity;
	for ( let i = 0; i <= 8; i ++ ) {

		const t = i / 8, x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, y = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t;
		const dx = Math.max( x0 - x, 0, x - x1 ), dy = Math.max( y0 - y, 0, y - y1 );
		best = Math.min( best, Math.hypot( dx, dy ) );

	}
	const step = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ) / 16;
	return Math.max( 0, best - step );

}

// the wall a point lies on: its plane side and the point in that chart, or null (sky, water, air, a door); plane, if
// given ( { normal, dist } ), admits only a surface on that plane
function wallAt( p, maxDist, plane = null ) {

	const cl = deps.cl();
	if ( cl == null || cl.worldmodel == null ) return null;
	const accept = plane === null ? null : ( s, sign ) => {
		const n = s.plane.normal;
		return n[ 0 ] * sign * plane.normal[ 0 ] + n[ 1 ] * sign * plane.normal[ 1 ] + n[ 2 ] * sign * plane.normal[ 2 ] > .999 && Math.abs( s.plane.dist * sign - plane.dist ) < 1;
	};
	const hit = R_DecalSurface( cl.worldmodel, p, maxDist, deps.pointInLeaf, accept );
	if ( hit === null ) return null;
	const basis = basisOf( hit.surf.plane, ( hit.surf.flags & SURF_PLANEBACK ) !== 0 ), q = [ hit.px, hit.py, hit.pz ];
	return { basis, uv: [ dot( q, basis.U ), dot( q, basis.V ) ], point: q };

}

//============================================================================
// Contacts
//============================================================================

/*
================
R_WallBurnShot

A shotgun pellet struck the world at p (TE_GUNSHOT: 4 units in front of the wall).  Its own dot, never joined to
anything (the source's breakBefore and breakStroke round each pellet); true if it was taken, false for the caller's
ordinary mark (Classic, switched off, no wall, or no atlas room).
================
*/
export function R_WallBurnShot( p ) {

	if ( R_WallBurnEnabled() === false ) return false;
	if ( queue.length >= WALLBURN.maxQueue ) return false;
	const wall = wallAt( p, WALLBURN.pelletDist );
	if ( wall === null ) return false;
	const radius = Math.max( .042, ( .030 + Math.random() * .006 ) * 2.15 ); // the source's pellet: max( .042, radius * 2.15 )
	// all or nothing: a pellet reaching a cell the atlas has no room for is left wholly to the caller's decal (never a dot
	// cut off at the cell's edge)
	const queued = queue.length, full = wallBurnStats.full;
	if ( stroke( wall.basis, wall.uv, wall.uv, radius ) === 0 || wallBurnStats.full !== full ) { queue.length = queued; return false; }
	wallBurnStats.pellets ++;
	return true;

}

// a model's box this frame, about its origin: its current frame's own bounds (a corpse lies low), turned any way (the
// widest of them about its origin), else the whole model's (also the depth of field's focus ray, card [38])
export function R_AliasFrameBox( e ) { return boxOf( e ); }
function boxOf( e ) {

	const m = e.model, h = m.cache?.data, f = h?.frames?.[ e.frame ];
	if ( f?.bboxmin?.v && h.scale && h.scale_origin ) {

		const lo = [ 0, 1, 2 ].map( i => f.bboxmin.v[ i ] * h.scale[ i ] + h.scale_origin[ i ] ), hi = [ 0, 1, 2 ].map( i => f.bboxmax.v[ i ] * h.scale[ i ] + h.scale_origin[ i ] );
		const r = Math.max( Math.hypot( lo[ 0 ], lo[ 1 ] ), Math.hypot( hi[ 0 ], hi[ 1 ] ), Math.hypot( lo[ 0 ], hi[ 1 ] ), Math.hypot( hi[ 0 ], lo[ 1 ] ) );
		return [ [ - r, - r, lo[ 2 ] ], [ r, r, hi[ 2 ] ] ];

	}
	return m.mins == null ? null : [ m.mins, m.maxs ];

}

// the monsters' boxes this frame, as [ lo, hi ] in the world: not the player's own body (drawn in the chase view) nor
// any box the beam starts inside
let monsters = [];
function monsterBoxes( start ) {

	const self = deps.self?.(), out = [];
	for ( const e of deps.entities() ) {

		const m = e?.model;
		if ( m == null || e === self || ! MONSTER.test( m.name || '' ) ) continue;
		const box = boxOf( e );
		if ( box === null ) continue;
		const lo = [ e.origin[ 0 ] + box[ 0 ][ 0 ], e.origin[ 1 ] + box[ 0 ][ 1 ], e.origin[ 2 ] + box[ 0 ][ 2 ] ];
		const hi = [ e.origin[ 0 ] + box[ 1 ][ 0 ], e.origin[ 1 ] + box[ 1 ][ 1 ], e.origin[ 2 ] + box[ 1 ][ 2 ] ];
		if ( start[ 0 ] >= lo[ 0 ] && start[ 0 ] <= hi[ 0 ] && start[ 1 ] >= lo[ 1 ] && start[ 1 ] <= hi[ 1 ] && start[ 2 ] >= lo[ 2 ] && start[ 2 ] <= hi[ 2 ] ) continue;
		out.push( lo, hi );

	}
	return out;

}

// whether the beam from s to q passes through one of this frame's monster boxes
function monsterBetween( s, q ) {

	for ( let k = 0; k < monsters.length; k += 2 ) {

		const lo = monsters[ k ], hi = monsters[ k + 1 ];
		let t0 = 0, t1 = 1, hit = true;
		for ( let i = 0; i < 3 && hit; i ++ ) {

			const d = q[ i ] - s[ i ];
			if ( Math.abs( d ) < 1e-9 ) { if ( s[ i ] < lo[ i ] || s[ i ] > hi[ i ] ) hit = false; continue; }
			let a = ( lo[ i ] - s[ i ] ) / d, b = ( hi[ i ] - s[ i ] ) / d;
			if ( a > b ) [ a, b ] = [ b, a ];
			t0 = Math.max( t0, a ); t1 = Math.min( t1, b );
			if ( t0 > t1 ) hit = false;

		}
		if ( hit ) return true;

	}
	return false;

}

// where a ray from s through q (and 4 units on) first meets the level: { point, normal, dist } (the plane it struck,
// facing the ray), or null
export function R_WallBurnTrace( s, q ) {

	const hull = deps?.cl()?.worldmodel?.hulls?.[ 0 ];
	if ( ! hull ) return null;
	const d = unit( [ q[ 0 ] - s[ 0 ], q[ 1 ] - s[ 1 ], q[ 2 ] - s[ 2 ] ] ), e = [ q[ 0 ] + d[ 0 ] * 4, q[ 1 ] + d[ 1 ] * 4, q[ 2 ] + d[ 2 ] * 4 ];
	const t = new trace_t(); t.allsolid = true; t.endpos.set( e );
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, s, e, t );
	if ( ! ( t.fraction < 1 ) || t.startsolid ) return null;
	return { point: Array.from( t.endpos ), normal: Array.from( t.plane.normal ), dist: t.plane.dist };

}

// the beam's contact this frame, as the source's wallContactForFrame: a wall point, with breakBefore when the sweep
// from the last contact crosses anything that is not this same wall
function beamContact() {

	const b = deps.beam?.();
	if ( b == null || b.start == null ) return null;
	monsters = monsterBoxes( b.start );
	if ( monsterBetween( b.start, b.end ) ) return null;
	// the plane the beam struck, from its own ray (the nearest surface to its end could be the floor or the side wall
	// at a corner, whose plane the beam meets far away)
	const trace = deps.trace ?? R_WallBurnTrace, struck = trace( b.start, b.end );
	if ( struck === null ) return null;
	// (the end arrives rounded to an eighth of a unit, so it can lie just inside the wall: looked up a unit back along the beam)
	const back = unit( [ b.start[ 0 ] - b.end[ 0 ], b.start[ 1 ] - b.end[ 1 ], b.start[ 2 ] - b.end[ 2 ] ] );
	const wall = wallAt( [ struck.point[ 0 ] + back[ 0 ], struck.point[ 1 ] + back[ 1 ], struck.point[ 2 ] + back[ 2 ] ], WALLBURN.beamDist, struck );
	if ( wall === null ) return null;
	// the contact is where the beam's line meets that wall's plane (not the nearest point to where it was looked up)
	const n = wall.basis.n, along = dot( n, back );
	if ( ! ( along > 1e-3 ) ) return null;
	const t = ( wall.basis.d - dot( n, struck.point ) ) / along;
	if ( Math.abs( t ) > WALLBURN.beamDist + 1 ) return null; // (never far from where the beam struck)
	const q = [ struck.point[ 0 ] + back[ 0 ] * t, struck.point[ 1 ] + back[ 1 ] * t, struck.point[ 2 ] + back[ 2 ] * t ];
	wall.point = q; wall.uv = [ dot( q, wall.basis.U ), dot( q, wall.basis.V ) ];
	wall.breakBefore = false;
	if ( beam !== null && beam.basis === wall.basis ) {

		const from = beam.point, to = wall.point, length = Math.hypot( to[ 0 ] - from[ 0 ], to[ 1 ] - from[ 1 ], to[ 2 ] - from[ 2 ] );
		const steps = Math.min( WALLBURN.sweepSteps, Math.ceil( length / WALLBURN.sweepStep ) );
		for ( let i = 1; i < steps; i ++ ) {

			const t = i / steps, q = from.map( ( x, k ) => x + ( to[ k ] - x ) * t );
			const hit = trace( b.start, q )?.point;
			if ( hit == null || Math.abs( dot( hit, wall.basis.n ) - wall.basis.d ) > 1 || Math.hypot( hit[ 0 ] - q[ 0 ], hit[ 1 ] - q[ 1 ], hit[ 2 ] - q[ 2 ] ) > 4 || monsterBetween( b.start, q ) ) { wall.breakBefore = true; break; }

		}

	}
	return wall;

}

//============================================================================
// The GPU passes (the source's WallDrawingSurface.step, batched)
//============================================================================

const PAINT_VERTEX = `
varying vec2 vUV;
void main(){ vUV=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }`;

// WALL_BRUSH_GLSL, unchanged but for: a batch of capsules (their maximum); each cell's padding is painted too (the
// source leaves it empty: its walls never meet); the erosion noise is fixed in the plane's coordinates
const BRUSH = `
#define MAX_STROKES ${ WALLBURN.maxStrokes }
uniform int uCount;
uniform vec4 uTile[MAX_STROKES];    // atlas origin.xy, extent.zw of the cell (inside its padding)
uniform vec4 uAlloc[MAX_STROKES];   // the cell's whole slot, padding included
uniform vec4 uSeg[MAX_STROKES];     // from.xy, to.zw: cell coordinates, source units
uniform vec4 uBounds[MAX_STROKES];  // conservative pen bounds in atlas UV coordinates
uniform vec2 uNoise[MAX_STROKES];   // the cell's place on its plane, source units
uniform float uRadius[MAX_STROKES];
uniform vec2 uWorldSize;            // a cell's size, source units
float wallHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float wallNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wallHash(i),wallHash(i+vec2(1,0)),f.x),mix(wallHash(i+vec2(0,1)),wallHash(i+1.),f.x),f.y);}
vec3 brushOne(int k,vec2 uv){
 if(any(lessThan(uv,uBounds[k].xy)) || any(greaterThan(uv,uBounds[k].zw)))return vec3(0.);
 if(any(lessThan(uv,uAlloc[k].xy)) || any(greaterThan(uv,uAlloc[k].xy+uAlloc[k].zw)))return vec3(0.);
 vec2 local=(uv-uTile[k].xy)/uTile[k].zw;
 vec2 p=local*uWorldSize,from=uSeg[k].xy,ab=uSeg[k].zw-from;
 float t=clamp(dot(p-from,ab)/max(dot(ab,ab),1e-10),0.,1.);
 float d=length(p-from-ab*t);
 float r=uRadius[k]*(.94+.10*wallNoise((p+uNoise[k])*27.));
 float groove=1.-smoothstep(r*.42,r*1.04,d);
 float burn=1.-smoothstep(r*.65,r*1.55,d);
 float heat=1.-smoothstep(r*.55,r*1.04,d); // white core = max temperature
 return vec3(groove,burn,heat);
}
vec3 brush(vec2 uv){vec3 m=vec3(0.);for(int k=0;k<MAX_STROKES;k++){if(k>=uCount)break;m=max(m,brushOne(k,uv));}return m;}
`;

// WALL_PERMANENT_FRAGMENT_SHADER: groove and burn as the red and green of one RG8 target (MAX blending keeps each)
const PERMANENT_FRAGMENT = `${ BRUSH }
varying vec2 vUV;
void main(){ vec3 p=brush(vUV); gl_FragColor=vec4(p.x,p.y,0.,1.); }`;

// WALL_HEAT_FRAGMENT_SHADER
const HEAT_FRAGMENT = `${ BRUSH }
varying vec2 vUV;
uniform sampler2D uPreviousHeat;
uniform float uCooling;
float readHeat(vec2 rg){return dot(rg,vec2(65280.,255.))/65535.;}
vec2 storeHeat(float h){float v=floor(clamp(h,0.,1.)*65535.+.5);return vec2(floor(v/256.),mod(v,256.))/255.;}
void main(){
 float old=readHeat(texelFetch(uPreviousHeat,ivec2(gl_FragCoord.xy),0).rg);
 float heat=max(max(0.,old-uCooling),brush(vUV).z);
 gl_FragColor=vec4(storeHeat(heat),0.,1.);
}`;

function target() {

	return new THREE.WebGLRenderTarget( WALLBURN.size, WALLBURN.size, { format: THREE.RGFormat, type: THREE.UnsignedByteType,
		minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
		colorSpace: THREE.NoColorSpace } );

}

function paintUniforms() {

	const n = WALLBURN.maxStrokes, v4 = () => Array.from( { length: n }, () => new THREE.Vector4() ), v2 = () => Array.from( { length: n }, () => new THREE.Vector2() );
	return { uCount: { value: 0 }, uTile: { value: v4() }, uAlloc: { value: v4() }, uSeg: { value: v4() }, uBounds: { value: v4() },
		uNoise: { value: v2() }, uRadius: { value: new Array( n ).fill( 0 ) }, uWorldSize: { value: new THREE.Vector2( WALLBURN.cell / WALLBURN.K, WALLBURN.cell / WALLBURN.K ) } };

}

function ensureGPU() {

	if ( gpu !== null ) return true;
	const renderer = deps?.renderer?.();
	if ( renderer == null ) return false;
	const permanent = new THREE.ShaderMaterial( { vertexShader: PAINT_VERTEX, fragmentShader: PERMANENT_FRAGMENT, uniforms: paintUniforms(),
		depthTest: false, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor } );
	const heatPass = new THREE.ShaderMaterial( { vertexShader: PAINT_VERTEX, fragmentShader: HEAT_FRAGMENT,
		uniforms: Object.assign( paintUniforms(), { uPreviousHeat: { value: null }, uCooling: { value: 0 } } ), depthTest: false, depthWrite: false, blending: THREE.NoBlending } );
	const triangle = new THREE.BufferGeometry();
	triangle.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ], 3 ) );
	const quad = new THREE.Mesh( triangle, permanent ); quad.frustumCulled = false;
	const scene = new THREE.Scene(); scene.add( quad );
	gpu = { renderer, permanentTarget: target(), heatTargets: [ target(), target() ], permanent, heatPass, quad, scene, camera: new THREE.OrthographicCamera() };
	needsClear = true;
	return true;

}

// run one of the passes into a render target, scissored to [ x, y, w, h ] texels, leaving the renderer as it was
function pass( materialFor, into, box ) {

	const { renderer, quad, scene, camera } = gpu, previous = renderer.getRenderTarget(), autoClear = renderer.autoClear, xr = renderer.xr?.enabled;
	quad.material = materialFor;
	into.scissor.set( box[ 0 ], box[ 1 ], box[ 2 ], box[ 3 ] ); into.scissorTest = true;
	try {

		// (an atlas pass, not a view: in WebXR three would draw it once per eye with the headset's cameras)
		if ( renderer.xr ) renderer.xr.enabled = false;
		renderer.autoClear = false;
		renderer.setRenderTarget( into );
		renderer.render( scene, camera );
		wallBurnStats.passes ++;

	} finally {

		renderer.autoClear = autoClear;
		renderer.setRenderTarget( previous );
		if ( renderer.xr ) renderer.xr.enabled = xr;

	}

}

function clearGPU() {

	const { renderer } = gpu, previous = renderer.getRenderTarget(), color = renderer.getClearColor( new THREE.Color() ), alpha = renderer.getClearAlpha(), xr = renderer.xr?.enabled;
	try {

		if ( renderer.xr ) renderer.xr.enabled = false;
		renderer.setClearColor( 0x000000, 0 );
		for ( const t of [ gpu.permanentTarget, ...gpu.heatTargets ] ) { t.scissorTest = false; renderer.setRenderTarget( t ); renderer.clear( true, false, false ); }

	} finally {

		renderer.setClearColor( color, alpha );
		renderer.setRenderTarget( previous );
		if ( renderer.xr ) renderer.xr.enabled = xr;

	}
	needsClear = false;

}

function load( uniforms, batch ) {

	const u = uniforms, S = WALLBURN.size;
	let x0 = S, y0 = S, x1 = 0, y1 = 0;
	u.uCount.value = batch.length;
	batch.forEach( ( s, k ) => {

		const { cell, from, to, radius } = s, rect = cell.rect, size = WALLBURN.cell / WALLBURN.K, r = radius * 1.7;
		u.uTile.value[ k ].fromArray( rect ); u.uAlloc.value[ k ].fromArray( cell.alloc ); u.uSeg.value[ k ].set( from[ 0 ], from[ 1 ], to[ 0 ], to[ 1 ] );
		u.uNoise.value[ k ].fromArray( cell.noise ); u.uRadius.value[ k ] = radius;
		// the source's bounds, kept inside the cell's slot
		const b = [ Math.max( cell.alloc[ 0 ], rect[ 0 ] + ( Math.min( from[ 0 ], to[ 0 ] ) - r ) / size * rect[ 2 ] ), Math.max( cell.alloc[ 1 ], rect[ 1 ] + ( Math.min( from[ 1 ], to[ 1 ] ) - r ) / size * rect[ 3 ] ),
			Math.min( cell.alloc[ 0 ] + cell.alloc[ 2 ], rect[ 0 ] + ( Math.max( from[ 0 ], to[ 0 ] ) + r ) / size * rect[ 2 ] ), Math.min( cell.alloc[ 1 ] + cell.alloc[ 3 ], rect[ 1 ] + ( Math.max( from[ 1 ], to[ 1 ] ) + r ) / size * rect[ 3 ] ) ];
		u.uBounds.value[ k ].fromArray( b );
		x0 = Math.min( x0, Math.floor( b[ 0 ] * S ) ); y0 = Math.min( y0, Math.floor( b[ 1 ] * S ) ); x1 = Math.max( x1, Math.ceil( b[ 2 ] * S ) ); y1 = Math.max( y1, Math.ceil( b[ 3 ] * S ) );

	} );
	return [ Math.max( 0, x0 ), Math.max( 0, y0 ), Math.max( 0, x1 - x0 ), Math.max( 0, y1 - y0 ) ];

}

// one step of the whole canvas: cool it by dt, paint the batch
function step( dt, batch ) {

	// fixed-point 16-bit cooling with one global fractional carry (the source's _heatClock)
	heatClock += Math.min( dt, WALLBURN.cooling ) / WALLBURN.cooling * 65535;
	const coolingUnits = Math.floor( heatClock + 1e-8 ); heatClock -= coolingUnits;

	// the heat of the whole used part of the atlas (rows no cell has reached stay zero in both)
	const rows = Math.ceil( cellList.length / SLOTS ) * WALLBURN.slot, next = 1 - front;
	load( gpu.heatPass.uniforms, batch );
	gpu.heatPass.uniforms.uPreviousHeat.value = gpu.heatTargets[ front ].texture;
	gpu.heatPass.uniforms.uCooling.value = coolingUnits / 65535;
	pass( gpu.heatPass, gpu.heatTargets[ next ], [ 0, 0, WALLBURN.size, rows ] );
	front = next;
	if ( batch.length > 0 ) pass( gpu.permanent, gpu.permanentTarget, load( gpu.permanent.uniforms, batch ) );

}

//============================================================================
// Drawn on the walls
//============================================================================

const MARK_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec2 aAtlas;
varying vec2 vAtlas;
void main(){ vAtlas=aAtlas; vec4 mvPosition=modelViewMatrix*vec4(position,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition; }`;

// the source's wall, as a multiplier of the wall's own colour: base=mix(base,charcoal,clamp(burn*.97+groove*.10,0.,.995))
// (the charcoal itself, about .002, is taken as black) and later color*=1.-groove*.35
const MARK_FRAGMENT = `${ MRT_OUT }
#include <clipping_planes_pars_fragment>
uniform sampler2D uMarks;
varying vec2 vAtlas;
void main(){
 #include <clipping_planes_fragment>
 vec2 m=texture2D(uMarks,vAtlas).rg;float groove=m.r,burn=m.g;
 float k=(1.-clamp(burn*.97+groove*.10,0.,.995))*(1.-groove*.35);
 gl_FragColor=vec4(vec3(k),1.);
 gNormal=vec4(1.);gAlbedo=gl_FragColor;gHeightMask=vec4(1.); // multiplied by one: the wall's own data kept
}`;

// the source's thermal light: white at the fresh core, reddening and fading to nothing as it cools
const HEAT_FRAGMENT_WALL = `${ MRT_OUT }
#include <clipping_planes_pars_fragment>
uniform sampler2D uHeat;
varying vec2 vAtlas;
float wallHeat(vec2 p){return dot(texture2D(uHeat,p).rg,vec2(65280.,255.))/65535.;}
void main(){
 #include <clipping_planes_fragment>
 float h=clamp(wallHeat(vAtlas),0.,1.);
 vec3 thermal=mix(vec3(1.,.006,.0005),vec3(1.,.16,.006),smoothstep(.12,.70,h));
 thermal=mix(thermal,vec3(1.,.80,.51),smoothstep(.78,1.,h));
 float radiance=h*h*(.25+13.*h*h*h);
 gl_FragColor=vec4(thermal*radiance,0.);
 ${ MRT_ZERO }
}`;

function ensureMeshes() {

	if ( marks !== null ) return;
	geometry = new THREE.BufferGeometry();
	geometry.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e6 );
	const offset = { polygonOffset: true, polygonOffsetFactor: - 4, polygonOffsetUnits: - 4 };
	const markMaterial = new THREE.ShaderMaterial( Object.assign( { vertexShader: MARK_VERTEX, fragmentShader: MARK_FRAGMENT,
		uniforms: { uMarks: { value: gpu.permanentTarget.texture } }, transparent: true, depthWrite: false, toneMapped: false, clipping: true,
		side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor }, offset ) );
	const heatMaterial = material( MARK_VERTEX, HEAT_FRAGMENT_WALL, { uHeat: { value: gpu.heatTargets[ front ].texture } }, THREE.AdditiveBlending );
	Object.assign( heatMaterial, offset );
	marks = new THREE.Mesh( geometry, markMaterial ); marks.name = 'quake_wallburn'; marks.renderOrder = 5;
	heat = new THREE.Mesh( geometry, heatMaterial ); heat.name = 'quake_wallburn_heat'; heat.renderOrder = 6;
	for ( const m of [ marks, heat ] ) { m.frustumCulled = false; m.matrixAutoUpdate = false; m.userData.newerOnly = true; }

}

// every marked cell's pieces of the level's faces, lifted off the wall, with their atlas coordinates
function rebuildGeometry() {

	const positions = [], atlas = [], index = [];
	for ( const cell of cellList ) {

		const { basis, rect } = cell, C = WALLBURN.cell, u0 = cell.cu * C, v0 = cell.cv * C, n = basis.n, l = WALLBURN.lift;
		for ( const piece of cell.pieces ) {

			const first = positions.length / 3;
			for ( const { p, q } of piece ) {

				positions.push( p[ 0 ] + n[ 0 ] * l, p[ 1 ] + n[ 1 ] * l, p[ 2 ] + n[ 2 ] * l );
				atlas.push( rect[ 0 ] + ( q[ 0 ] - u0 ) / C * rect[ 2 ], rect[ 1 ] + ( q[ 1 ] - v0 ) / C * rect[ 3 ] );

			}
			for ( let i = 1; i + 1 < piece.length; i ++ ) index.push( first, first + i, first + i + 1 );

		}

	}
	geometry.dispose(); // (the last buffers go now, not when the collector finds them)
	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'aAtlas', new THREE.Float32BufferAttribute( atlas, 2 ) );
	geometry.setIndex( index );
	wallBurnStats.vertices = positions.length / 3;
	geometryDirty = false;

}

//============================================================================
// Per frame
//============================================================================

/*
================
R_WallBurnFrame

The beam's contact for this frame, the pellets since the last, one step of the canvas (cooling by the client's own
clock: paused, nothing cools), and the walls' drawn pieces brought up to date.
================
*/
export function R_WallBurnFrame( time ) {

	// (paused: the client's clock stands, the server's beam stays; nothing is painted and nothing cools)
	const paused = lastTime !== null && time === lastTime;
	const dt = lastTime === null ? 0 : Math.max( 0, time - lastTime );
	lastTime = time;
	if ( R_WallBurnEnabled() === false ) {

		beam = null; queue.length = 0;
		if ( marks !== null ) marks.visible = heat.visible = false;
		return;

	}

	// the beam: one continuous stroke while it stays on one wall; the pen lifted on release, a miss, a monster in
	// the way, a new wall or anything else in between
	const contact = paused ? undefined : beamContact();
	if ( contact === undefined ) { /* paused: the pen stays as it was */ }
	else if ( contact === null ) beam = null;
	else {

		const joined = beam !== null && beam.basis === contact.basis && contact.breakBefore === false;
		if ( beam !== null && ! joined ) wallBurnStats.beamBreaks ++;
		stroke( contact.basis, joined ? beam.uv : contact.uv, contact.uv, WALLBURN.radius );
		beam = { basis: contact.basis, uv: contact.uv, point: contact.point };

	}

	if ( queue.length === 0 && ( heatRemaining === 0 || dt === 0 ) ) return finish();
	if ( ensureGPU() === false ) { queue.length = 0; return; }
	if ( needsClear ) clearGPU();

	const batches = [];
	for ( let i = 0; i < queue.length; i += WALLBURN.maxStrokes ) batches.push( queue.slice( i, i + WALLBURN.maxStrokes ) );
	if ( batches.length === 0 ) batches.push( [] );
	batches.forEach( ( batch, i ) => step( i === 0 ? dt : 0, batch ) );
	heatRemaining = queue.length > 0 ? WALLBURN.cooling : Math.max( 0, heatRemaining - dt );
	queue.length = 0;
	finish();

}

function finish() {

	if ( gpu === null ) return;
	ensureMeshes();
	if ( geometryDirty ) rebuildGeometry();
	heat.material.uniforms.uHeat.value = gpu.heatTargets[ front ].texture;
	marks.visible = cellList.length > 0;
	heat.visible = cellList.length > 0 && heatRemaining > 0;
	for ( const m of [ marks, heat ] ) if ( m.parent !== deps.scene ) deps.scene.add( m );

}

// a new level (or a loaded game): every mark goes, the chart cells and the pen with them; the atlas is kept for reuse
export function R_WallBurnClear() {

	cells = new Map(); cellList = []; faces = null; facesModel = null; bases = new WeakMap();
	beam = null; queue.length = 0; heatRemaining = 0; heatClock = 0; lastTime = null;
	wallBurnStats.cells = 0;
	if ( gpu !== null ) needsClear = true;
	if ( marks !== null ) { marks.visible = heat.visible = false; marks.parent?.remove( marks ); heat.parent?.remove( heat ); geometryDirty = true; }

}

// for checks: the cells, the beam's pen, the heat left, what is queued
export const R_WallBurnState = () => ( { cells: cellList.slice(), beam, heatRemaining, queued: queue.slice(), front,
	gpu: gpu && { permanent: gpu.permanent, heatPass: gpu.heatPass, heatTargets: gpu.heatTargets, permanentTarget: gpu.permanentTarget, heatShown: heat?.material.uniforms.uHeat.value, marksShown: marks?.material.uniforms.uMarks.value } } );

/*
================
R_WallBurnRead

Diagnostics only (the source's readPixel, a blocking readback never used by the live loop): the groove, burn and
heat where a world point lies on its wall, or null where nothing marks it.  from, if given, is where a ray to the
point starts (the beam's start): the wall is then the plane that ray strikes, as the beam's contact takes it.
================
*/
export function R_WallBurnRead( p, from = null ) {

	if ( gpu === null || deps === null ) return null;
	const struck = from === null ? null : ( deps.trace ?? R_WallBurnTrace )( from, p );
	const wall = struck === null ? wallAt( p, WALLBURN.pelletDist ) : wallAt( struck.point.map( ( x, k ) => x + struck.normal[ k ] ), WALLBURN.beamDist, struck );
	if ( wall === null ) return null;
	const C = WALLBURN.cell, cell = cells.get( wall.basis.id + ':' + Math.floor( wall.uv[ 0 ] / C ) + ':' + Math.floor( wall.uv[ 1 ] / C ) );
	if ( cell === undefined ) return null;
	const S = WALLBURN.size, x = Math.min( S - 1, Math.floor( ( cell.rect[ 0 ] + ( wall.uv[ 0 ] - cell.cu * C ) / C * cell.rect[ 2 ] ) * S ) );
	const y = Math.min( S - 1, Math.floor( ( cell.rect[ 1 ] + ( wall.uv[ 1 ] - cell.cv * C ) / C * cell.rect[ 3 ] ) * S ) );
	const a = new Uint8Array( 4 ), b = new Uint8Array( 4 );
	gpu.renderer.readRenderTargetPixels( gpu.permanentTarget, x, y, 1, 1, a );
	gpu.renderer.readRenderTargetPixels( gpu.heatTargets[ front ], x, y, 1, 1, b );
	return { groove: a[ 0 ] / 255, burn: a[ 1 ] / 255, heat: ( b[ 0 ] * 256 + b[ 1 ] ) / 65535, cell: cell.key };

}
