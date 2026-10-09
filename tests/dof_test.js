// Depth of field (card [38]): the autofocus where the view looks (the median of five rays against the level), smoothed in
// log distance over a quarter second on the client's clock, held while paused, snapped on a new level, a teleport or the
// clock going back; off in Classic, at strength 0 and in WebXR; the circle of confusion scaled to the picture's height.
import * as vars from '../src/cvar.js';
import { cvar_t } from '../src/cvar.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import * as D from '../src/r_dof.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, near = ( a, b, e, m ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), D.r_dof ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// a world whose "trace" puts a wall at a given distance ahead (x), with a thin post on the middle ray only
let wall = 400, post = null, xr = false;
const world = { name: 'test' }, other = { name: 'next' };
D.R_DofSetup( { xr: () => xr, trace: ( a, b ) => {
	const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ), dx = ( b[ 0 ] - a[ 0 ] ) / len;
	const middle = Math.abs( b[ 1 ] - a[ 1 ] ) < 1 && Math.abs( b[ 2 ] - a[ 2 ] ) < 1;
	const d = post !== null && middle ? Math.min( post, wall ) : wall;
	return Math.min( 1, d / dx / len );
} } );
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
	vars.Cvar_SetValue( 'r_dof', 0 ); check( D.R_DofFocus() === 0, 'strength 0: off' ); D.R_DofFrame( 40.1, world, eye, fwd, right, up ); vars.Cvar_SetValue( 'r_dof', 0.3 );
	xr = true; check( D.R_DofFocus() === 0, 'WebXR: off' ); xr = false;
	D.R_DofFrame( 40.2, world, eye, fwd, right, up ); check( D.R_DofFocus() === 400, 'back on, at once (no stale focus)' );
	const [ px, max ] = D.R_DofCircle( 1080 ); near( px, D.DOF.blurPx * .3, 1e-9, '1080 lines: strength x 14 px' ); near( max, px * D.DOF.maxPx, 1e-9, 'the largest' );
	near( D.R_DofCircle( 540 )[ 0 ], px / 2, 1e-9, 'half the lines (dynamic resolution): half the pixels, the same on screen' );
} );
