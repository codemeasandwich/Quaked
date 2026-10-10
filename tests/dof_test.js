// Depth of field (card [38]): the autofocus where the view looks (the median of five rays against the level), smoothed in
// log distance over a quarter second on the client's clock, held while paused, snapped on a new level, a teleport or the
// clock going back; off in Classic, at strength 0 and in WebXR; the circle of confusion scaled to the picture's height.
import * as vars from '../src/engine/common/cvar.js';
import { cvar_t } from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import * as D from '../src/r_dof.js';
const DEFAULT_STRENGTH = D.r_dof.string; // (as the module declares it, before any test sets it)

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, near = ( a, b, e, m ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), D.r_dof ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// a world whose "trace" puts a wall at a given distance ahead (x), with a thin post on the middle ray only
let wall = 400, post = null, xr = false, inside = false, contents = null;
const world = { name: 'test' }, other = { name: 'next' };
const setup = () => D.R_DofSetup( { xr: () => xr, contents: p => contents ? contents( p ) : - 1, trace: ( a, b ) => {
	if ( inside ) return { fraction: 0, startsolid: true };
	const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ), dx = ( b[ 0 ] - a[ 0 ] ) / len;
	const middle = Math.abs( b[ 1 ] - a[ 1 ] ) < 1 && Math.abs( b[ 2 ] - a[ 2 ] ) < 1;
	const d = post !== null && middle ? Math.min( post, wall ) : wall;
	return { fraction: Math.min( 1, d / dx / len ), startsolid: false };
} } );
setup();
const eye = [ 0, 0, 0 ], fwd = [ 1, 0, 0 ], right = [ 0, - 1, 0 ], up = [ 0, 0, 1 ];

Deno.test( 'the focus is where the view looks: the median of five rays, so one thin thing on the crosshair does not snatch it', () => {
	D.R_DofClear(); wall = 400; post = null;
	near( D.R_DofTarget( world, eye, fwd, right, up ), 400, 1e-6, 'the wall ahead' );
	post = 60; near( D.R_DofTarget( world, eye, fwd, right, up ), 400, 1e-6, 'a post on the middle ray only: still the wall' ); post = null;
	wall = 1e9; near( D.R_DofTarget( world, eye, fwd, right, up ), D.DOF.far, 1e-6, 'nothing ahead: the far focus' );
	wall = 2; near( D.R_DofTarget( world, eye, fwd, right, up ), D.DOF.near, 1e-6, 'a wall at the nose: the near focus' ); wall = 400;
} );

Deno.test( 'the focus settles smoothly on the client\'s clock, holds while paused, and snaps on a new level, a teleport or time going back', () => {
	D.R_DofClear(); wall = 400; vars.Cvar_SetValue( 'r_dof', 0.3 );
	near( D.R_DofFrame( 10, world, eye, fwd, right, up ), 400, 1e-6, 'first frame: at once' );
	wall = 100; const a = D.R_DofFrame( 10.05, world, eye, fwd, right, up );
	check( a < 400 && a > 100, 'moving towards the new distance, not there at once (' + a + ')' );
	near( Math.log( 400 / a ) / Math.log( 4 ), 1 - Math.exp( - .05 / D.DOF.settle ), 1e-9, 'in log distance, by 1 - exp( -dt / 0.25 )' );
	near( D.R_DofFrame( 10.05, world, eye, fwd, right, up ), a, 1e-12, 'paused (the clock stands): held' );
	let f = a; for ( let t = 10.1; t <= 11.5; t += 1 / 60 ) f = D.R_DofFrame( t, world, eye, fwd, right, up );
	near( f, 100, .5, 'settled within a second and a half' );
	// the same change at 30 and at 144 frames a second ends in the same place
	const run = hz => { D.R_DofClear(); wall = 400; D.R_DofFrame( 20, world, eye, fwd, right, up ); wall = 100; let g = 0; for ( let i = 1; i <= Math.round( .2 * hz ); i ++ ) g = D.R_DofFrame( 20 + i / hz, world, eye, fwd, right, up ); return g; };
	near( run( 30 ), run( 150 ), 1e-6, 'frame-rate independent (30 and 150 frames a second)' );
	wall = 400; D.R_DofFrame( 30, world, eye, fwd, right, up ); wall = 50;
	near( D.R_DofFrame( 30.02, other, eye, fwd, right, up ), 50, 1e-6, 'a new level: snapped' );
	wall = 400; near( D.R_DofFrame( 30.04, other, [ 200, 0, 0 ], fwd, right, up ), 400, 1e-6, 'a teleport (the eye jumped): snapped' );
	wall = 80; near( D.R_DofFrame( 29, other, [ 200, 0, 0 ], fwd, right, up ), 80, 1e-6, 'time went back (a loaded game): snapped' );
} );

Deno.test( 'off in Classic, at strength 0 and in WebXR; the circle of confusion scales with the picture\'s height and strength', () => {
	D.R_DofClear(); wall = 400; vars.Cvar_SetValue( 'r_dof', 0.3 );
	D.R_DofFrame( 40, world, eye, fwd, right, up ); check( D.R_DofFocus() > 0, 'on' );
	R_AnimSetClassicPass( true ); check( D.R_DofFocus() === 0, 'Classic: off' ); R_AnimSetClassicPass( false );
	vars.Cvar_SetValue( 'r_dof', 0 ); check( D.R_DofFocus() === 0, 'strength 0: off' ); vars.Cvar_SetValue( 'r_dof', 0.3 );
	D.R_DofFrame( 40.1, world, eye, fwd, right, up ); check( D.R_DofFocus() > 0, 'on again' );
	xr = true; D.R_DofFrame( 40.15, world, eye, fwd, right, up ); check( D.R_DofFocus() === 0, 'WebXR: off, even with a frame run' ); xr = false;
	wall = 120; D.R_DofFrame( 40.2, world, eye, fwd, right, up ); near( D.R_DofFocus(), 120, 1e-6, 'back on at the new distance at once (no stale focus)' ); wall = 400;
	vars.Cvar_SetValue( 'r_dof', 5 ); near( D.R_DofCircle( 1080 )[ 0 ], D.DOF.blurPx, 1e-9, 'strength above 1 is held at 1' ); vars.Cvar_SetValue( 'r_dof', 0.3 );
	const [ px, max ] = D.R_DofCircle( 1080 ); near( px, D.DOF.blurPx * .3, 1e-9, '1080 lines: strength x 14 px' ); near( max, px * D.DOF.maxPx, 1e-9, 'the largest' );
	near( D.R_DofCircle( 540 )[ 0 ], px / 2, 1e-9, 'half the lines (dynamic resolution): half the pixels, the same on screen' );
} );

// review of [38]: the eye inside a wall holds the focus; the sky focuses far, lava stops the ray; a new level clears it
Deno.test( 'inside a wall the focus holds; along the ray the sky focuses far and lava stops it, water does not; clearing forgets', () => {
	D.R_DofClear(); setup(); vars.Cvar_SetValue( 'r_dof', 0.3 ); wall = 300;
	D.R_DofFrame( 50, world, eye, fwd, right, up ); inside = true; near( D.R_DofFrame( 50.1, world, eye, fwd, right, up ), 300, 1e-6, 'the eye in a wall (noclip, the chase camera): held' ); inside = false;
	contents = p => p[ 0 ] > 100 ? - 6 : - 1; near( D.R_DofTarget( world, eye, fwd, right, up ), D.DOF.far, 1e-6, 'the sky 100 units ahead (the hull passes it): far' );
	contents = p => p[ 0 ] > 100 ? - 5 : - 1; check( Math.abs( D.R_DofTarget( world, eye, fwd, right, up ) - 104 ) <= 8, 'lava 100 units ahead: focus on it' );
	contents = p => p[ 0 ] > 100 ? - 3 : - 1; near( D.R_DofTarget( world, eye, fwd, right, up ), 300, 1e-6, 'water: seen through, the wall beyond' );
	contents = null; near( D.R_DofFar(), D.DOF.far, 0, 'the sky counts as the far focus in the blur' );
	D.R_DofFrame( 51, world, eye, fwd, right, up ); D.R_DofClear(); wall = 90; near( D.R_DofFrame( 51.02, world, eye, fwd, right, up ), 90, 1e-6, 'cleared: the next frame snaps' );
} );

Deno.test( 'the real E1M1 hull: a ray at the sky stops on its face, and knowing the sky faces makes it focus far', async () => {
	const { readFileSync } = await import( 'node:fs' ), pak = await import( '../src/engine/common/pak.js' ), { VID_SetPalette } = await import( '../src/vid.js' ), M = await import( '../src/gl_model.js' );
	const data = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', data.buffer.slice( data.byteOffset, data.byteOffset + data.length ) ) );
	VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); M.Mod_Init();
	const e1m1 = M.Mod_ForName( 'maps/e1m1.bsp', true ), at = p => M.Mod_PointInLeaf( p, e1m1 ).contents;
	// an open point whose ray straight up stops on a sky face (E1M1 draws its sky on solid brushes), found in the map
	const upv = [ 0, 0, 1 ], r = [ 1, 0, 0 ], u = [ 0, 1, 0 ];
	D.R_DofSetup( { xr: () => false, pointInLeaf: M.Mod_PointInLeaf } );
	let sky = null;
	for ( let x = e1m1.mins[ 0 ] + 32; x < e1m1.maxs[ 0 ] && ! sky; x += 64 ) for ( let y = e1m1.mins[ 1 ] + 32; y < e1m1.maxs[ 1 ] && ! sky; y += 64 ) for ( let z = e1m1.mins[ 2 ] + 16; z < e1m1.maxs[ 2 ] && ! sky; z += 64 )
		if ( at( [ x, y, z ] ) === - 1 && D.R_DofTarget( e1m1, [ x, y, z ], upv, r, u ) === D.DOF.far ) sky = [ x, y, z ];
	check( sky !== null, 'E1M1 has an open place under its sky' );
	D.R_DofSetup( { xr: () => false } ); const hullOnly = D.R_DofTarget( e1m1, sky, upv, r, u );
	check( hullOnly !== null && hullOnly < D.DOF.far, 'the hull alone stops at the sky face (' + hullOnly + ' units above ' + sky + ')' );
	D.R_DofSetup( { xr: () => false, pointInLeaf: M.Mod_PointInLeaf, contents: at } );
	near( D.R_DofTarget( e1m1, sky, upv, r, u ), D.DOF.far, 1e-6, 'knowing the sky faces: far' );
	near( D.R_DofTarget( e1m1, sky, [ 1, 0, 0 ], [ 0, 1, 0 ], upv ) , D.R_DofTarget( e1m1, sky, [ 1, 0, 0 ], [ 0, 1, 0 ], upv ), 0, '(sideways rays are unaffected)' );
	setup();
} );

Deno.test( 'on by default at three slider steps (0.15); a configuration saved before keeps its 0 only if the player chose it', () => {

	check( DEFAULT_STRENGTH === '0.15' && D.r_dof.archive, 'on by default at 0.15 (three steps of .05), saved' );
	const store = () => { const m = new Map(); return { getItem: k => m.has( k ) ? m.get( k ) : null, setItem: ( k, v ) => m.set( k, String( v ) ), m }; };
	const saved = 'bind MOUSE1 "+attack"\nr_dof "0"\nr_dofx "1"\nvolume "0.7"\n';
	// never chosen: the old default's line is dropped once, so the new default applies
	let s = store(); let out = vars.Cvar_DropChangedDefaults( saved, s );
	check( ! /^r_dof "/m.test( out ) && /r_dofx "1"/.test( out ) && /volume "0.7"/.test( out ), 'stale default dropped, other lines kept' );
	check( vars.Cvar_DropChangedDefaults( saved, s ) === saved, 'only once: later configurations (written with the new value) are kept' );
	// chosen in play (saved on its own key): kept
	s = store(); s.setItem( 'quake_cvar_r_dof', '0' ); out = vars.Cvar_DropChangedDefaults( saved, s );
	check( out === saved, 'a player who moved the slider keeps their value' );
	// no storage: unchanged
	check( vars.Cvar_DropChangedDefaults( saved, null ) === saved, 'no storage: unchanged' );

} );
