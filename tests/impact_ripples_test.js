// Impact ripples (card [W1]): what crosses a pool or hits a standing portal leaves a ring. The detector with a real BSP lookup is
// exercised in the browser run recorded in docs/impact-ripples-2026-10-09.md; here the rules: where the ring is, what is
// ignored, the caps, the lifetime and the packing the shaders read, Classic having none.
await import( '../src/engine/render/gl_rsurf.js' ); // (the renderer's module graph in its safe order)
import * as vars from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import * as r from '../src/newer/render/r_impactripples.js';
import { cvar_t } from '../src/engine/common/cvar.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` ), near = ( a, b, m, e = 1 ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), r.r_impactripples ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// a pool: water below z = 0, slime for x > 1000, lava for x > 2000
const contents = p => p[ 2 ] < 0 ? ( p[ 0 ] > 2000 ? - 5 : p[ 0 ] > 1000 ? - 4 : - 3 ) : - 1;
// a doorway: the plane x = 500, y in [-32, 32], z in [0, 96]
const door = { normal: [ 1, 0, 0 ], center: [ 500, 0, 48 ], min: [ 500, - 32, 0 ], max: [ 500, 32, 96 ] };
let planes = [ door ];
r.R_ImpactRipplesSetup( { contents, portals: () => planes } );
const fresh = () => { r.R_ImpactRippleReset(); r.R_ImpactRippleFrame.last = undefined; };

Deno.test( 'a segment that crosses the water surface leaves one ring, at the surface, where it crossed', () => {
	fresh();
	same( r.R_ImpactSegment( 100, 50, 40, 100, 50, - 30, 5, 1 ), 1, 'one ring going in' );
	const s = r.R_ImpactRippleFrame( 5 ); same( s.nWater, 1, 'one water ring' ); same( s.nMetal, 0, 'no metal ring' );
	near( r.waterRows[ 0 ], 100, 'x', .5 ); near( r.waterRows[ 1 ], 50, 'y', .5 ); near( r.waterRows[ 2 ], 0, 'on the surface', .5 ); near( r.waterRows[ 3 ], 0, 'age', 1e-6 ); same( r.waterAmp[ 0 ], 1, 'full strength' );
	// a slanted one crosses where the line does
	fresh(); r.R_ImpactSegment( 0, 0, 30, 60, 0, - 30, 5, 1 ); r.R_ImpactRippleFrame( 5 ); near( r.waterRows[ 0 ], 30, 'slanted x', .5 ); near( r.waterRows[ 2 ], 0, 'slanted z', .5 );
} );

Deno.test( 'leaving the water is a smaller ring; staying on one side leaves none; slime counts as liquid, lava does not (no optics to draw on)', () => {
	fresh();
	r.R_ImpactSegment( 100, 0, - 30, 100, 0, 30, 5, 1 ); r.R_ImpactRippleFrame( 5 ); same( r.state.nWater, 1, 'one ring coming out' ); near( r.waterAmp[ 0 ], .6, 'a smaller ring', 1e-6 );
	fresh(); same( r.R_ImpactSegment( 100, 0, 30, 140, 0, 10, 5, 1 ), 0, 'in the air the whole way' ); same( r.R_ImpactSegment( 100, 0, - 10, 140, 0, - 30, 5, 1 ), 0, 'under the water the whole way' );
	fresh(); same( r.R_ImpactSegment( 1100, 0, 20, 1100, 0, - 20, 5, 1 ), 1, 'into slime' ); same( r.R_ImpactSegment( 2100, 0, 20, 2100, 0, - 20, 5, 1 ), 0, 'into lava: nothing to draw it on' );
} );

Deno.test( 'a segment through a portal opening leaves a metal ring on it; one that misses the opening or stays on one side leaves none', () => {
	fresh();
	same( r.R_ImpactSegment( 400, 10, 50, 600, 10, 50, 5, .5 ), 1, 'through the opening' ); r.R_ImpactRippleFrame( 5 );
	same( r.state.nMetal, 1, 'one metal ring' ); near( r.metalRows[ 0 ], 500, 'on the plane', .01 ); near( r.metalRows[ 1 ], 10, 'y', .01 ); near( r.metalRows[ 2 ], 50, 'z', .01 ); same( r.metalAmp[ 0 ], .5, 'strength' );
	fresh(); same( r.R_ImpactSegment( 400, 200, 50, 600, 200, 50, 5, 1 ), 0, 'beside the opening' ); same( r.R_ImpactSegment( 400, 10, 150, 600, 10, 150, 5, 1 ), 0, 'above it' );
	same( r.R_ImpactSegment( 400, 10, 50, 480, 10, 50, 5, 1 ), 0, 'short of it' ); same( r.R_ImpactSegment( 600, 10, 50, 700, 10, 50, 5, 1 ), 0, 'beyond it' );
	same( r.R_ImpactSegment( 400, 35, 50, 600, 35, 50, 5, 1 ), 1, 'on its frame (a little larger than the opening)' );
	planes = []; fresh(); same( r.R_ImpactSegment( 400, 10, 50, 600, 10, 50, 5, 1 ), 0, 'no portals in the level' ); planes = [ door ];
} );

Deno.test( 'rockets, grenades and nails are missiles; other models and teleports are not', () => {
	fresh(); const wet = ( model ) => r.R_ImpactMissile( model, [ 100, 0, 20 ], [ 100, 0, - 20 ], 5 );
	same( wet( { flags: 1, name: 'progs/missile.mdl' } ), 1, 'a rocket' ); r.R_ImpactRippleFrame( 5 ); same( r.waterAmp[ 0 ], r.STRENGTH.rocket, 'rocket strength' );
	fresh(); same( wet( { flags: 2, name: 'progs/grenade.mdl' } ), 1, 'a grenade' );
	fresh(); same( wet( { flags: 0, name: 'progs/spike.mdl' } ), 1, 'a nail' ); same( wet( { flags: 0, name: 'progs/s_spike.mdl' } ), 1, 'a super nail' );
	fresh(); same( wet( { flags: 0, name: 'progs/zombie.mdl' } ), 0, 'a zombie' ); same( wet( { flags: 4, name: 'progs/gib1.mdl' } ), 0, 'a gib' ); same( wet( null ), 0, 'no model' ); same( wet( { flags: 1, name: 'progs/lavaball.mdl' } ), 0, 'the lava fountain ball carries the rocket flag but is not one' );
	fresh(); same( wet( { flags: 0, name: 'progs/laser.mdl' } ), 1, 'a laser bolt' ); same( r.R_ImpactMissile( { flags: 0x02, name: 'g' }, [ 100, 0, 20 ], [ 100, 0, - 20 ], 6 ), 1, 'a grenade' ); r.R_ImpactRippleFrame( 6 ); check( Math.abs( r.waterAmp[ 1 ] - r.STRENGTH.grenade ) < 1e-6 && r.STRENGTH.grenade < r.STRENGTH.rocket, 'a grenade is a smaller splash than a rocket' );
	same( r.R_ImpactMissile( { flags: 1, name: 'm' }, [ 0, 0, 20 ], [ 100, 0, - 20 ], 5 ), 1, 'a jump of 100 is a flight' ); same( r.R_ImpactMissile( { flags: 1, name: 'm' }, [ 0, 0, 20 ], [ 0, 129, - 20 ], 5 ), 0, '129 is a teleport' );
	same( r.R_ImpactMissile( { flags: 1, name: 'm' }, [ 0, 0, 20 ], [ 400, 0, - 20 ], 5 ), 0, 'a jump of more than 128 units is a teleport, not a flight' );
} );

Deno.test( 'rings are capped per kind (the oldest goes), expire, and a clock that jumps back clears them', () => {
	fresh();
	for ( let i = 0; i < 12; i ++ ) r.R_AddImpactRipple( 0, i, 0, 0, 1, 10 + i * .01 );
	let s = r.R_ImpactRippleFrame( 10.2 ); same( s.nWater, r.RIPPLE.maxWater, 'water capped' ); same( r.waterRows[ 0 ], 4, 'the oldest four went' );
	for ( let i = 0; i < 12; i ++ ) r.R_AddImpactRipple( 1, i, 0, 0, 1, 10.2 );
	s = r.R_ImpactRippleFrame( 10.3 ); same( s.nMetal, r.RIPPLE.maxMetal, 'metal capped' ); same( s.nWater, r.RIPPLE.maxWater, 'metal does not push water out' );
	s = r.R_ImpactRippleFrame( 10.2 + r.RIPPLE.metalLife + .1 ); same( s.nMetal, 0, 'metal rings expire first (they last a shorter time)' ); same( s.nWater, r.RIPPLE.maxWater, 'while the water rings are still there' );
	s = r.R_ImpactRippleFrame( 10.2 + r.RIPPLE.waterLife + .1 ); same( s.nWater, 0, 'water rings expire' );
	check( r.waterRows[ 3 ] < 0 && r.metalRows[ 3 ] < 0, 'unused rows are marked' );
	r.R_AddImpactRipple( 0, 0, 0, 0, 1, 100 ); r.R_ImpactRippleFrame( 100.1 ); s = r.R_ImpactRippleFrame( 3 ); same( s.nWater, 0, 'the clock went back: nothing carries over' ); s = r.R_ImpactRippleFrame( 100.2 ); same( s.nWater, 0, 'and it does not come back when the clock catches up' );
} );

Deno.test( 'Classic Quake, the cvar at 0 and an unset-up module make no rings', () => {
	fresh(); vars.Cvar_SetValue( 'r_hdr', 0 ); same( r.R_ImpactSegment( 100, 0, 40, 100, 0, - 30, 5, 1 ), 0, 'Classic (r_hdr 0)' ); vars.Cvar_SetValue( 'r_hdr', 1 );
	R_AnimSetClassicPass( true ); same( r.R_ImpactSegment( 100, 0, 40, 100, 0, - 30, 5, 1 ), 0, 'the classic half of a split demo' ); R_AnimSetClassicPass( false );
	vars.Cvar_SetValue( 'r_impactripples', 0 ); same( r.R_ImpactSegment( 100, 0, 40, 100, 0, - 30, 5, 1 ), 0, 'r_impactripples 0' ); vars.Cvar_SetValue( 'r_impactripples', 1 );
	same( r.R_ImpactSegment( 100, 0, 40, 100, 0, - 30, 5, 1 ), 1, 'and on again' );
} );

Deno.test( 'the exact rules: the crossing point, the margin, a slanted portal, a segment in the plane, two portals at once, a water crossing inside a portal, slime, missing data, nothing set up', () => {
	fresh();
	// the point is bisected, not guessed: a long steep segment, the ring within a unit of where it crossed
	r.R_ImpactSegment( 0, 0, 200, 0, 0, - 200, 5, 1 ); r.R_ImpactRippleFrame( 5 ); near( r.waterRows[ 2 ], 0, 'a long segment crosses at the surface', 1 );
	fresh(); r.R_ImpactSegment( 0, 0, 300, 600, 0, - 100, 5, 1 ); r.R_ImpactRippleFrame( 5 ); near( r.waterRows[ 0 ], 450, 'a long shallow segment crosses at x = 450', 1.2 );
	// the margin is 4 units: 3 inside it, 5 outside
	fresh(); same( r.R_ImpactSegment( 400, 35, 50, 600, 35, 50, 5, 1 ), 1, '3 units outside the opening counts' ); same( r.R_ImpactSegment( 400, 35.5, 50, 600, 35.5, 50, 5, 1 ), 1, '3.5 units outside counts (the margin is 4)' ); same( r.R_ImpactSegment( 400, 37, 50, 600, 37, 50, 5, 1 ), 0, '5 units outside does not' );
	fresh(); same( r.R_ImpactSegment( 480, 10, 20, 520, 10, - 20, 5, 1 ), 1, 'a shot into the water inside the portal: the portal\'s ring, and no water ring (the teleporter brush is water to the BSP)' ); r.R_ImpactRippleFrame( 5 ); same( r.state.nWater, 0, 'no water ring' ); same( r.state.nMetal, 1, 'one metal ring' );
	same( r.R_ImpactSegment( 280, 10, 20, 320, 10, - 20, 5, 1 ), 1, 'the same shot elsewhere in the pool is a water ring' );
	// a plane at 45 degrees
	const s = Math.SQRT1_2, slant = { normal: [ s, s, 0 ], center: [ 0, 0, 48 ], min: [ - 30, - 100, 0 ], max: [ 30, 100, 96 ] };
	planes = [ slant ]; fresh(); same( r.R_ImpactSegment( - 60, - 60, 50, 60, 60, 50, 5, 1 ), 1, 'through the middle of a slanted portal' ); r.R_ImpactRippleFrame( 5 ); near( r.metalRows[ 0 ], 0, 'at its middle', .01 ); near( r.metalRows[ 1 ], 0, 'at its middle', .01 );
	same( r.R_ImpactSegment( - 60, 20, 50, 60, 20, 50, 5, 1 ), 1, 'across it at y = 20, hitting where x = -20' ); r.R_ImpactRippleFrame( 5 ); near( r.metalRows[ 4 ], - 20, 'the plane, not the box, decides x', .01 );
	same( r.R_ImpactSegment( - 100, 60, 50, 100, 60, 50, 5, 1 ), 0, 'a line that crosses the plane where x = -60, outside the box in x only' );
	// a segment lying in the plane makes no ring (and no NaN)
	planes = [ door ]; fresh(); same( r.R_ImpactSegment( 500, - 10, 50, 500, 10, 50, 5, 1 ), 0, 'a segment in the plane' );
	// two windows hit by one segment: both count
	planes = [ door, { ...door, center: [ 520, 0, 48 ], min: [ 520, - 32, 0 ], max: [ 520, 32, 96 ] } ]; fresh(); same( r.R_ImpactSegment( 400, 0, 50, 600, 0, 50, 5, 1 ), 2, 'two portals in line' ); planes = [ door ];
	// slime, data that is missing, nothing set up
	fresh(); const none = { contents: () => undefined, portals: () => [] }; r.R_ImpactRipplesSetup( none ); same( r.R_ImpactSegment( 0, 0, 20, 0, 0, - 20, 5, 1 ), 0, 'no contents data: no guess' );
	r.R_ImpactRipplesSetup( { contents: p => p[ 2 ] > 0 ? undefined : - 3, portals: () => [] } ); same( r.R_ImpactSegment( 0, 0, 20, 0, 0, - 20, 5, 1 ), 0, 'unknown at one end: no ring' );
	r.R_ImpactRipplesSetup( null ); same( r.R_ImpactSegment( 0, 0, 20, 0, 0, - 20, 5, 1 ), 0, 'nothing set up' ); r.R_ImpactRipplesSetup( { contents, portals: () => planes } );
} );

Deno.test( 'rings in the future are not packed, one at exactly its lifetime is gone, and unused rows of both kinds are marked', () => {
	fresh(); r.R_AddImpactRipple( 0, 1, 2, 3, 1, 50 ); same( r.R_ImpactRippleFrame( 49 ).nWater, 0, 'a ring from the future is not drawn' );
	fresh(); r.R_AddImpactRipple( 0, 1, 2, 3, 1, 0 ); r.R_AddImpactRipple( 1, 1, 2, 3, 1, 0 ); const s = r.R_ImpactRippleFrame( r.RIPPLE.metalLife ); same( s.nMetal, 0, 'a metal ring is gone at exactly its lifetime' ); same( s.nWater, 1, 'a water ring is not' );
	for ( let i = 0; i < 8; i ++ ) check( r.metalRows[ i * 4 + 3 ] < 0, 'metal row ' + i + ' is marked unused' );
	check( r.waterRows[ 3 ] >= 0 && r.waterRows[ 7 ] < 0 && r.waterRows[ 31 ] < 0, 'water: one row used, the rest marked' );
	r.R_ImpactRippleFrame( r.RIPPLE.waterLife ); same( r.state.nWater, 0, 'a water ring is gone at exactly its lifetime' );
	fresh(); r.R_AddImpactRipple( 0, 1, 2, 3, 1, 60 ); r.R_ImpactRippleFrame( 60.1 ); vars.Cvar_SetValue( 'r_impactripples', 0 ); same( r.R_ImpactRippleFrame( 60.2 ).nWater, 0, 'switching it off takes the live rings away' ); vars.Cvar_SetValue( 'r_impactripples', 1 );
} );

// the teleporter windows of a real-shaped level: the visible surface, and a trigger that lies BESIDE it (as in e1m3, e1m5 and e1m6)
const portalLib = await import( '../src/newer/render/gl_portal.js' );
function surface( x, facing, y0 = - 32, y1 = 32 ) {
	return { flags: 0x10 | ( facing < 0 ? 2 : 0 ), plane: { normal: new Float32Array( [ 1, 0, 0 ] ), dist: x }, texinfo: { texture: { name: '*teleport' } },
		polys: { numverts: 4, verts: [ [ x, y0, 0, 0, 0 ], [ x, y1, 0, 1, 0 ], [ x, y1, 112, 1, 1 ], [ x, y0, 112, 0, 1 ] ], next: null } };
}
function level( surfaces, triggerBox ) {
	const leaf = { contents: - 1, visframe: 0, firstmarksurface: null, nummarksurfaces: 0, compressed_vis: null };
	return { entities: '{\n"classname" "worldspawn"\n}\n{\n"classname" "trigger_teleport"\n"target" "t1"\n"model" "*1"\n}\n{\n"classname" "info_teleport_destination"\n"targetname" "t1"\n"origin" "500 600 32"\n"angle" "90"\n}\n',
		surfaces, firstmodelsurface: 0, nummodelsurfaces: surfaces.length, submodels: [ { mins: [ - 4096, - 4096, - 4096 ], maxs: [ 4096, 4096, 4096 ] }, triggerBox ], nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], numleafs: 1 };
}

Deno.test( 'the hit box of a teleporter window is its visible surface, not its trigger, and its two faces and near planes are one window', () => {
	try {
		// the surface is at x = 100; the trigger box is at x = 78..92, 8 units short of it and well outside the margin
		portalLib.R_BuildPortals( level( [ surface( 100, 1 ), surface( 100, - 1 ), surface( 108, 1 ), surface( 108, - 1 ) ], { mins: [ 78, - 40, - 8 ], maxs: [ 92, 40, 120 ] } ) );
		const planes = portalLib.R_ImpactPortalPlanes();
		same( portalLib.R_GetPortals().length, 4, 'the faces make four portals' ); same( planes.length, 1, 'both faces of both planes are one window' );
		check( planes === portalLib.R_ImpactPortalPlanes(), 'the list is built once, not every call' );
		r.R_ImpactRipplesSetup( { contents, portals: portalLib.R_ImpactPortalPlanes } ); fresh();
		same( r.R_ImpactSegment( 0, 0, 50, 300, 0, 50, 5, 1 ), 1, 'a shot through the visible window makes one ring (not 2 to 4)' ); r.R_ImpactRippleFrame( 5 );
		near( r.metalRows[ 0 ], 100, 'on the surface', 9 ); same( r.state.nMetal, 1, 'one metal ring' );
		same( r.R_ImpactSegment( 0, 0, 50, 90, 0, 50, 5, 1 ), 0, 'a shot that stops at the trigger box, short of the window, makes none' );
		same( r.R_ImpactSegment( 0, 90, 50, 300, 90, 50, 5, 1 ), 0, 'one that passes beside the window makes none' );
		portalLib.R_PortalsBeginFrame( false ); same( portalLib.R_ImpactPortalPlanes().length, 0, 'portals switched off: nothing to hit' ); portalLib.R_PortalsBeginFrame( true );
	} finally { portalLib.R_ClearPortals(); r.R_ImpactRipplesSetup( { contents, portals: () => planes } ); }
} );
