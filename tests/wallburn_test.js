// The burn the guns leave on the walls (card [30c]): the supplied WallDrawingSurface's permanent groove and burn and its
// cooling heat, on charts of the level's own planes, fed by the player's lightning beam (continuous strokes, broken on
// release, a miss, a monster, a new wall or anything in between) and by shotgun pellets (each its own dot). The world here
// is a small built level; the GPU passes go to a recording renderer (the browser check covers the pixels).
await import( '../src/engine/render/gl_rsurf.js' );
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import { cvar_t } from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/newer/render/r_anim.js';
import * as W from '../src/r_wallburn.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, e, m ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), W.r_newer_wallburn ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// a face: a rectangle on a plane, as the BSP gives it (texinfo, extents, texturemins and its glpoly's flat vertices)
function face( normal, dist, corners, back = false ) {
	const verts = new Float32Array( corners.length * 7 ); corners.forEach( ( c, i ) => verts.set( c, i * 7 ) );
	// texture axes in the plane (the decals' surface test reads them): the two axes the corners vary along
	const axes = [ 0, 1, 2 ].filter( k => corners.some( c => c[ k ] !== corners[ 0 ][ k ] ) );
	const mins = axes.map( k => Math.min( ...corners.map( c => c[ k ] ) ) ), maxs = axes.map( k => Math.max( ...corners.map( c => c[ k ] ) ) );
	const vec = k => [ 0, 1, 2 ].map( j => j === k ? 1 : 0 ).concat( 0 );
	return { flags: back ? 2 : 0, plane: { normal, dist }, texinfo: { vecs: [ vec( axes[ 0 ] ), vec( axes[ 1 ] ) ] }, texturemins: mins, extents: [ maxs[ 0 ] - mins[ 0 ], maxs[ 1 ] - mins[ 1 ] ], polys: { numverts: corners.length, verts: new Float32Array( [ ...verts, 9, 9, 9, 9, 9, 9, 9 ] ) } }; // (a longer array than its vertices, as the game's)
}
// a wall at x = 352 facing +x, split by the BSP at y = 64 into two faces on one plane; a second wall of the same
// texture far along the same plane (y 600..664); a side wall at y = 128 facing -y (a corner); the floor
const wallPlane = { normal: [ 1, 0, 0 ], dist: 352 };
const A = face( wallPlane.normal, 352, [ [ 352, 0, 0 ], [ 352, 64, 0 ], [ 352, 64, 128 ], [ 352, 0, 128 ] ] );
const B = face( wallPlane.normal, 352, [ [ 352, 64, 0 ], [ 352, 128, 0 ], [ 352, 128, 128 ], [ 352, 64, 128 ] ] );
const far = face( wallPlane.normal, 352, [ [ 352, 600, 0 ], [ 352, 664, 0 ], [ 352, 664, 128 ], [ 352, 600, 128 ] ] );
A.plane = B.plane = far.plane = wallPlane;
const side = face( [ 0, 1, 0 ], 128, [ [ 352, 128, 0 ], [ 600, 128, 0 ], [ 600, 128, 128 ], [ 352, 128, 128 ] ], true );
const floor = face( [ 0, 0, 1 ], 0, [ [ 352, 0, 0 ], [ 600, 0, 0 ], [ 600, 700, 0 ], [ 352, 700, 0 ] ] );
const sky = { ...face( [ 0, 0, - 1 ], 400, [ [ 352, 0, 400 ], [ 600, 0, 400 ], [ 600, 128, 400 ], [ 352, 128, 400 ] ] ), flags: 4 };
// a face of the next room on the side wall's plane (x 200..340), where a corner contact taken from the wrong plane lands
const nextRoom = face( [ 0, 1, 0 ], 128, [ [ 200, 128, 0 ], [ 340, 128, 0 ], [ 340, 128, 128 ], [ 200, 128, 128 ] ], true ); nextRoom.plane = side.plane;
const surfaces = [ A, B, far, side, floor, sky, nextRoom ];
const leaf = { contents: - 1, firstmarksurface: surfaces, nummarksurfaces: surfaces.length };
const world = { leafs: [ leaf ], surfaces, firstmodelsurface: 0, nummodelsurfaces: surfaces.length };

// a recording renderer: each pass's target, material (heat or marks), batch, cooling and scissor
const passes = [];
const renderer = {
	autoClear: true, target: null, getRenderTarget() { return this.target; }, setRenderTarget( t ) { this.target = t; },
	getClearColor: c => c, getClearAlpha: () => 1, setClearColor() {}, clear() { passes.push( { clear: true } ); },
	xr: { enabled: true },
	render( scene ) { const m = scene.children[ 0 ].material, u = m.uniforms; passes.push( { heat: 'uCooling' in u, cooling: u.uCooling?.value, count: u.uCount.value, scissor: this.target.scissor.toArray(), autoClear: this.autoClear,
		xr: this.xr.enabled, reads: u.uPreviousHeat?.value, writes: this.target.texture, blendEquation: m.blendEquation,
		strokes: Array.from( { length: u.uCount.value }, ( _, k ) => ( { seg: u.uSeg.value[ k ].toArray(), radius: u.uRadius.value[ k ], tile: u.uTile.value[ k ].toArray() } ) ) } ); },
	readRenderTargetPixels() {}
};
let beam = null, entities = [], blocker = null, self = null;
const scene = new THREE.Scene();
// the ray cast: the nearest of the main wall (x = 352, facing +x), the side wall (y = 128, facing -y) and the floor, with
// the plane it struck ( { point, normal, dist }, as R_WallBurnTrace ); blocker( s, q ) can put something in the way
const planes = [ { normal: [ 1, 0, 0 ], dist: 352 }, { normal: [ 0, - 1, 0 ], dist: - 128 }, { normal: [ 0, 0, 1 ], dist: 0 } ];
function cast( s, q ) {
	const blocked = blocker && blocker( s, q ); if ( blocked ) return { point: blocked, normal: [ - 1, 0, 0 ], dist: - 400 };
	const d = [ q[ 0 ] - s[ 0 ], q[ 1 ] - s[ 1 ], q[ 2 ] - s[ 2 ] ]; let best = null;
	for ( const p of planes ) { const dn = p.normal[ 0 ] * d[ 0 ] + p.normal[ 1 ] * d[ 1 ] + p.normal[ 2 ] * d[ 2 ]; if ( dn >= 0 ) continue; const t = ( p.dist - ( p.normal[ 0 ] * s[ 0 ] + p.normal[ 1 ] * s[ 1 ] + p.normal[ 2 ] * s[ 2 ] ) ) / dn; if ( t > 0 && ( best === null || t < best.t ) ) best = { t, p }; }
	return best && { point: s.map( ( x, k ) => x + d[ k ] * best.t ), normal: best.p.normal, dist: best.p.dist };
}
W.R_WallBurnSetup( { scene, renderer: () => renderer, cl: () => ( { worldmodel: world, viewentity: 1 } ), pointInLeaf: () => leaf, beam: () => beam, entities: () => entities, self: () => self, trace: cast } );
const start = [ 500, 60, 64 ];
const aim = ( y, z ) => { beam = { start, end: [ 352, y, z ] }; };
let clock = 100;
const frame = ( dt = 1 / 60 ) => { clock += dt; passes.length = 0; W.R_WallBurnFrame( clock ); return passes.slice(); };
const strokesOf = list => list.filter( p => ! p.heat && p.count ).flatMap( p => p.strokes );
const reset = () => { W.R_WallBurnClear(); beam = null; entities = []; blocker = null; self = null; frame(); };

Deno.test( 'charts: one plane is one chart (the BSP\'s split faces share it), cut into cells that each take an atlas slot when first marked; repeated textures elsewhere are their own cells', () => {
	reset();
	check( W.R_WallBurnShot( [ 356, 47.5, 64 ] ), 'a pellet on a cell boundary (y = 48) is taken' );
	const cells = W.R_WallBurnState().cells; same( cells.length, 2, 'it reaches across the boundary: both cells painted (their padding too)' );
	check( cells.every( c => c.basis === cells[ 0 ].basis ), 'one chart: the plane' );
	const second = cells.find( c => c.cu === 1 );
	same( second?.pieces.length, 2, 'the cell over the BSP\'s split (y = 64) holds a piece of each face, A and B' );
	for ( const c of cells ) for ( const piece of c.pieces ) for ( const v of piece ) {
		check( v.p.every( Number.isFinite ) && Math.abs( v.p[ 0 ] - 352 ) < 1e-6, 'pieces lie on the wall' );
		check( v.q[ 0 ] >= c.cu * 48 - 1e-6 && v.q[ 0 ] <= c.cu * 48 + 48 + 1e-6 && v.q[ 1 ] >= c.cv * 48 - 1e-6 && v.q[ 1 ] <= c.cv * 48 + 48 + 1e-6, 'and inside their cell' );
	}
	const slots = cells.map( c => c.alloc.join() ); same( new Set( slots ).size, 2, 'separate atlas slots' );
	for ( const c of cells ) check( c.rect[ 0 ] > c.alloc[ 0 ] && c.rect[ 0 ] + c.rect[ 2 ] < c.alloc[ 0 ] + c.alloc[ 2 ], 'the cell sits inside its padded slot' );
	check( W.R_WallBurnShot( [ 356, 630, 64 ] ), 'the same texture far along the plane' );
	same( W.R_WallBurnState().cells.length, 3, 'is a cell of its own (texture coordinates repeat; chart cells do not)' );
	same( W.R_WallBurnShot( [ 356, 300, 64 ] ), false, 'where no face of the level lies on the plane (between the walls): nothing taken' );
	same( W.R_WallBurnShot( [ 400, 60, 395 ] ), false, 'the sky: nothing' );
	same( W.R_WallBurnShot( [ 450, 60, 64 ] ), false, 'in the air: nothing' );
} );

Deno.test( 'the beam: one continuous stroke while it stays on the wall, crossing the BSP\'s split; lifted on release, a miss, a monster in the way, a new wall, or anything in between', () => {
	reset();
	aim( 40, 64 ); let s = strokesOf( frame() ); check( s.length >= 1, 'first contact: a dot' ); check( s.every( k => k.seg[ 0 ] === k.seg[ 2 ] && k.seg[ 1 ] === k.seg[ 3 ] ), 'a dot (from = to)' );
	near( s[ 0 ].radius, .14, 1e-9, 'the source\'s beam brush' );
	aim( 50, 64 ); s = strokesOf( frame() ); const capsule = s.find( k => k.seg[ 0 ] !== k.seg[ 2 ] || k.seg[ 1 ] !== k.seg[ 3 ] );
	check( capsule, 'next frame: a capsule from the last contact' ); near( Math.hypot( capsule.seg[ 2 ] - capsule.seg[ 0 ], capsule.seg[ 3 ] - capsule.seg[ 1 ] ) * 12, 10, 1e-3, 'ten units long (source units, K = 12)' );
	aim( 70, 64 ); s = strokesOf( frame() ); check( s.some( k => k.seg[ 0 ] !== k.seg[ 2 ] ), 'across the split between faces A and B: still joined' ); same( W.wallBurnStats.beamBreaks, 0, 'no break' );
	const isDot = list => list.every( k => k.seg[ 0 ] === k.seg[ 2 ] && k.seg[ 1 ] === k.seg[ 3 ] );
	beam = null; frame(); same( W.R_WallBurnState().beam, null, 'release: the pen lifts' ); aim( 80, 64 ); check( isDot( strokesOf( frame() ) ), 'pressed again: a new dot, not joined to before' );
	beam = { start, end: [ 352 + 300, 80, 64 ] }; frame(); same( W.R_WallBurnState().beam, null, 'a miss (nothing there): lifted' ); aim( 82, 64 ); check( isDot( strokesOf( frame() ) ), 'and not joined across it' );
	entities = [ { origin: [ 420, 81, 40 ], model: { name: 'progs/ogre.mdl', mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 32 ] } } ];
	aim( 84, 64 ); frame(); same( W.R_WallBurnState().beam, null, 'an Ogre in the beam: lifted (the game\'s beam passes through it; the wall behind is not painted)' );
	// its frame's own box: standing, it blocks; lying dead (a low box), the beam over it reaches the wall
	const frames = [ { bboxmin: { v: [ 0, 0, 0 ] }, bboxmax: { v: [ 255, 255, 255 ] } }, { bboxmin: { v: [ 0, 0, 0 ] }, bboxmax: { v: [ 255, 255, 30 ] } } ];
	const ogre = { frame: 0, origin: [ 420, 81, 40 ], model: { name: 'progs/ogre.mdl', cache: { data: { frames, scale: [ 32 / 255, 32 / 255, 56 / 255 ], scale_origin: [ - 16, - 16, - 24 ] } } } };
	entities = [ ogre ]; aim( 84, 64 ); frame(); same( W.R_WallBurnState().beam, null, 'standing (its frame\'s box): lifted' );
	ogre.frame = 1; aim( 84, 64 ); frame(); check( W.R_WallBurnState().beam !== null, 'lying dead (its frame\'s box below the beam): the wall is painted' );
	self = { origin: [ 420, 81, 40 ], model: { name: 'progs/player.mdl', mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 32 ] } }; entities = [ self ];
	aim( 84, 64 ); check( strokesOf( frame() ).length > 0, 'the player\'s own body (the chase view draws it) does not lift it' );
	entities = [ { origin: [ 500, 60, 50 ], model: { name: 'progs/player.mdl', mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 32 ] } } ];
	aim( 84, 64 ); check( strokesOf( frame() ).length > 0, 'nor any body the beam starts inside' ); entities = []; self = null;
	aim( 86, 64 ); frame(); beam = { start, end: [ 400, 128, 64 ] }; check( isDot( strokesOf( frame() ) ), 'onto the side wall (a new plane): a new dot' );
	const breaks = W.wallBurnStats.beamBreaks; check( breaks >= 1, 'counted as a break' );
	// a pillar between two contacts on the same wall: the sweep's check meets something else
	aim( 20, 64 ); frame(); blocker = ( s0, q ) => q[ 1 ] > 25 && q[ 1 ] < 35 ? [ 400, q[ 1 ], q[ 2 ] ] : null;
	aim( 40, 64 ); check( isDot( strokesOf( frame() ) ), 'something in between: not joined through it (breakBefore)' );
	blocker = null; aim( 45, 64 ); check( ! isDot( strokesOf( frame() ) ), 'and joined again after it' );
	// review of [30c]: half a unit from the corner, the side wall is the nearer surface; the contact is still the main wall
	// where the beam struck it (from its own ray), never the side wall's plane far behind (the next room's face)
	beam = null; frame(); beam = { start: [ 500, 126, 64 ], end: [ 352, 127.5, 64 ] }; frame();
	const pen = W.R_WallBurnState().beam; check( pen && pen.basis.n[ 0 ] === 1, 'on the main wall' );
	near( Math.hypot( pen.point[ 0 ] - 352, pen.point[ 1 ] - 127.5, pen.point[ 2 ] - 64 ), 0, 1e-6, 'at the point struck' );
	check( ! W.R_WallBurnState().cells.some( c => c.pieces.some( piece => piece.some( v => v.p[ 0 ] < 350 ) ) ), 'nothing taken in the next room' );
	// paused: the server's beam stays, but nothing is painted and the pen does not move
	aim( 60, 64 ); frame(); const held = W.R_WallBurnState().beam; aim( 70, 64 );
	same( frame( 0 ).length, 0, 'paused: no passes at all' ); same( W.R_WallBurnState().beam, held, 'the pen where it was' );
} );

Deno.test( 'pellets: each its own dot (breakBefore), the source\'s pellet brush, queued to the next frame; they never touch the beam\'s pen', () => {
	reset();
	aim( 40, 64 ); frame();
	for ( const y of [ 10, 12, 14 ] ) check( W.R_WallBurnShot( [ 356, y, 30 ] ), 'pellet taken' );
	const q = W.R_WallBurnState().queued.slice( - 3 );
	check( q.every( k => k.from[ 0 ] === k.to[ 0 ] && k.from[ 1 ] === k.to[ 1 ] ), 'each a dot: never joined into a scratch' );
	check( q.every( k => k.radius >= .0645 - 1e-9 && k.radius <= .0774 + 1e-9 ), 'the source\'s pellet radius, max( .042, ( .030 + .006 r ) * 2.15 )' );
	aim( 50, 64 ); const s = strokesOf( frame() );
	check( s.some( k => k.seg[ 0 ] !== k.seg[ 2 ] ), 'the beam still joins its own stroke across the pellets' );
	same( W.R_WallBurnState().queued.length, 0, 'painted and gone' );
} );

Deno.test( 'heat: the whole canvas cools by one global 16-bit step a pass (4.2 s from white to none), on the client\'s clock; the groove and burn are only ever painted (MAX), never cooled', () => {
	reset();
	aim( 40, 64 ); let p = frame( .1 ); const heat = p.filter( x => x.heat ), marks = p.filter( x => ! x.heat && ! x.clear );
	same( heat.length, 1, 'one heat pass' ); same( marks.length, 1, 'one marks pass' ); same( W.R_WallBurnState().heatRemaining, 4.2, 'fresh heat lasts the source\'s cooling time' );
	near( heat[ 0 ].cooling * 65535, Math.floor( .1 / 4.2 * 65535 ), 1, 'cooled by dt / 4.2 in 16-bit steps' );
	same( heat[ 0 ].autoClear, false, 'the passes never clear their target' );
	check( heat[ 0 ].reads && heat[ 0 ].reads !== heat[ 0 ].writes, 'the heat pass reads the last heat and writes the other target (ping-pong)' );
	same( marks[ 0 ].blendEquation, THREE.MaxEquation, 'the groove and burn are MAX-blended: painting can only darken' );
	check( p.every( x => x.clear || x.xr === false ) && renderer.xr.enabled === true, 'WebXR is off for the atlas passes and restored after' );
	const g = W.R_WallBurnState().gpu; same( g.heatShown, g.heatTargets[ W.R_WallBurnState().front ].texture, 'the wall shows the heat just written' );
	same( g.heatShown, heat[ 0 ].writes, '(the target this frame wrote)' ); same( g.marksShown, g.permanentTarget.texture, 'and the marks target' );
	check( marks[ 0 ].scissor[ 2 ] > 0 && marks[ 0 ].scissor[ 2 ] < 64, 'the marks pass is scissored to the pen\'s bounds: ' + marks[ 0 ].scissor );
	same( heat[ 0 ].scissor[ 3 ], 128, 'the heat pass covers only the atlas rows in use' );
	beam = null; let total = 0;
	for ( let i = 0; i < 50; i ++ ) { p = frame( .1 ); total += p.filter( x => x.heat ).reduce( ( a, x ) => a + x.cooling, 0 ); check( p.every( x => x.heat || x.clear ), 'cooling: no marks pass (the permanent layers are never touched)' ); }
	{ const g = W.R_WallBurnState().gpu; same( g.heatShown, g.heatTargets[ W.R_WallBurnState().front ].texture, 'after many swaps the wall still shows the latest heat' ); }
	near( W.R_WallBurnState().heatRemaining, 0, 1e-9, 'cold after 4.2 s' ); check( total * 65535 >= 65535 - 2, 'the heat stepped down a whole 16-bit range: ' + total * 65535 );
	same( frame( .1 ).length, 0, 'cold and nothing new: no passes at all' );
	aim( 40, 64 ); frame( .1 ); beam = null; const before = W.R_WallBurnState().heatRemaining; same( frame( 0 ).length, 0, 'paused (the clock stands): nothing cools' ); same( W.R_WallBurnState().heatRemaining, before, 'still hot' );
	check( W.R_WallBurnState().cells.length > 0, 'the marks stay' );
} );

Deno.test( 'batches: many contacts in one frame are painted in passes of up to sixteen capsules, the first carrying the cooling', () => {
	reset();
	for ( let i = 0; i < 20; i ++ ) W.R_WallBurnShot( [ 356, 4 + i * 2, 20 ] );
	const p = frame( .05 ), heat = p.filter( x => x.heat );
	same( heat.length, 2, 'two heat passes' ); check( heat[ 0 ].cooling > 0 && heat[ 1 ].cooling === 0, 'cooled once' );
	same( heat[ 0 ].count, 16, 'sixteen in the first' ); same( heat[ 1 ].count, 4, 'the other four in the second' );
	same( p.filter( x => ! x.heat && ! x.clear ).reduce( ( a, x ) => a + x.count, 0 ), 20, 'and the marks passes paint all twenty' );
} );

Deno.test( 'bounded: a 2048 atlas of 256 cells; when all are taken no new wall is marked and the pellets fall back to the bullet-hole decal; a new map clears everything', () => {
	reset();
	// the floor is 248 x 700 units: 6 x 15 cells; with the walls, not enough for 256, so the test fills the atlas through
	// many planes: floors at other heights
	const extra = [];
	for ( let h = 1; h <= 30; h ++ ) { const f = face( [ 0, 0, 1 ], h * 4, [ [ 0, 0, h * 4 ], [ 480, 0, h * 4 ], [ 480, 480, h * 4 ], [ 0, 480, h * 4 ] ] ); f.plane = { normal: [ 0, 0, 1 ], dist: h * 4 }; extra.push( f ); }
	surfaces.push( ...extra ); world.nummodelsurfaces = surfaces.length; leaf.nummarksurfaces = surfaces.length; W.R_WallBurnClear();
	let taken = 0, refused = 0;
	for ( const f of extra ) for ( let x = 24; x < 480; x += 48 ) for ( let y = 24; y < 480; y += 48 ) { if ( W.R_WallBurnShot( [ x, y, f.plane.dist + 2 ] ) ) taken ++; else refused ++; if ( W.R_WallBurnState().queued.length > 200 ) frame(); }
	same( W.R_WallBurnState().cells.length, 256, 'every slot taken, and no more' ); check( refused > 0 && W.wallBurnStats.full > 0, 'the rest refused (' + refused + '): the caller draws its own mark' );
	check( W.R_WallBurnShot( [ 24, 24, 6 ] ), 'a cell already held is still painted' );
	// the 256th cell is (5, 5) on the third floor (z = 12); (5, 6) was refused. A pellet on their edge is left to the decal
	// whole, not cut off at the held cell's edge
	frame(); const before = W.R_WallBurnState().queued.length;
	same( W.R_WallBurnShot( [ 264, 6 * 48 - .3, 14 ] ), false, 'a pellet reaching a refused cell: the decal' ); same( W.R_WallBurnState().queued.length, before, 'nothing queued' );
	W.R_WallBurnClear(); same( W.R_WallBurnState().cells.length, 0, 'a new map: the cells go' ); same( W.R_WallBurnState().heatRemaining, 0, 'and the heat' );
	frame(); const p = frame(); same( p.length, 0, 'nothing to paint' );
	W.R_WallBurnShot( [ 356, 30, 30 ] ); const q = frame(); check( q.some( x => x.clear ), 'the atlas is cleared on the next use' );
	surfaces.splice( 7 ); world.nummodelsurfaces = leaf.nummarksurfaces = surfaces.length;
} );

Deno.test( 'Newer Game only: Classic and the switch take nothing (the pellets keep their ordinary marks) and hide the burn', () => {
	reset(); W.R_WallBurnShot( [ 356, 30, 30 ] ); frame();
	const marks = scene.getObjectByName( 'quake_wallburn' ); same( marks?.visible, true, 'drawn' ); same( marks.userData.newerOnly, true, 'a Newer-only layer' );
	R_AnimSetClassicPass( true ); same( W.R_WallBurnShot( [ 356, 30, 30 ] ), false, 'Classic: the pellet is left to the decal' ); frame(); same( marks.visible, false, 'Classic: hidden' ); R_AnimSetClassicPass( false );
	vars.Cvar_SetValue( 'r_newer_wallburn', 0 ); same( W.R_WallBurnShot( [ 356, 30, 30 ] ), false, 'switched off' ); vars.Cvar_SetValue( 'r_newer_wallburn', 1 );
	frame(); same( marks.visible, true, 'back' );
	const geometry = marks.geometry, position = geometry.attributes.position.array, atlas = geometry.attributes.aAtlas.array;
	check( position.every( Number.isFinite ) && atlas.every( Number.isFinite ), 'finite geometry' );
	for ( let i = 0; i < position.length; i += 3 ) near( position[ i ], 352.1, 1e-4, 'lifted a tenth of a unit off the wall' );
	same( scene.getObjectByName( 'quake_wallburn_heat' ).visible, true, 'hot: the heat layer drawn' );
	W.R_WallBurnClear(); same( scene.getObjectByName( 'quake_wallburn' ), undefined, 'cleared with the level: out of the scene' );
} );

// review of [30c]: the real ray cast (the level's own hull 0, as the beam's plane and the sweep's occluder checks use)
Deno.test( 'the level\'s own hull: the beam\'s ray in E1M1 meets the wall the browser trial burned, with that wall\'s plane facing back along the ray; rays in the open meet nothing', async () => {
	const { readFileSync } = await import( 'node:fs' ), pak = await import( '../src/engine/common/pak.js' ), { VID_SetPalette } = await import( '../src/engine/render/vid.js' ), { Mod_Init, Mod_ForName } = await import( '../src/engine/render/gl_model.js' );
	const data = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', data.buffer.slice( data.byteOffset, data.byteOffset + data.length ) ) );
	VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	const e1m1 = Mod_ForName( 'maps/e1m1.bsp', true );
	W.R_WallBurnSetup( { scene, renderer: () => renderer, cl: () => ( { worldmodel: e1m1, viewentity: 1 } ), pointInLeaf: () => leaf, beam: () => null, entities: () => [] } );
	try {
		// (the wall the browser trial burned: the server's beam from [445.5,60.125,40] ended at [416,-10.875,56], on the wall
		// x = 416, eleven units from the corner with the wall y = 0, which the first version's nearest-surface lookup took)
		const hit = W.R_WallBurnTrace( [ 445.5, 60.125, 40 ], [ 416, - 10.875, 56 ] );
		check( hit !== null, 'it meets the wall' ); near( hit.point[ 0 ], 416, .1, 'on the wall x = 416 (' + hit.point + ')' );
		near( hit.normal[ 0 ], 1, 1e-6, 'its plane faces back along the ray' ); near( hit.dist, 416, 1e-6, 'the plane x = 416' );
		same( W.R_WallBurnTrace( [ 445.5, 60.125, 40 ], [ 445.5, 40, 40 ] ), null, 'twenty units of open room: nothing' );
		// (a 600-unit ray down the corridor the first trial fired into ends in the air: the server's beam's range, no wall)
		same( W.R_WallBurnTrace( [ 480, - 352, 88 ], [ 480, 248, 104 ] ), null, 'the beam\'s full range in the open: nothing' );
	} finally {
		W.R_WallBurnSetup( { scene, renderer: () => renderer, cl: () => ( { worldmodel: world, viewentity: 1 } ), pointInLeaf: () => leaf, beam: () => beam, entities: () => entities, self: () => self, trace: cast } );
	}
} );
