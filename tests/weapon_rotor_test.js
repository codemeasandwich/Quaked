// The held super nailgun's barrel rotor (card [45]): a continuous angle and speed, with a smooth coast after firing.
// Synthetic rotor asset (the weapon archives are not needed): four rotating barrel vertices around an axis and two
// static ones, driven through the public R_WeaponRotorFrame as gl_mesh.js drives it (a persistent pose-blend record per
// entity, the game's frame as the pose, the game's time).
import * as THREE from 'three';
import { R_WeaponRotorFrame, R_WeaponRotorState, ROTOR } from '../src/newer/render/r_weapons.js';
import { R_AnimSetClassicPass } from '../src/newer/render/r_anim.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

const STEP = - Math.PI / 4; // the stored poses' rotation per game frame
function asset() {

	const positions = new Float32Array( [ 0, 1, 0, 0, 0, 1, 0, - 1, 0, 0, 0, - 1, 5, 0, 0, 6, 1, 1 ] ), normals = new Float32Array( [ 0, 1, 0, 0, 0, 1, 0, - 1, 0, 0, 0, - 1, 1, 0, 0, 1, 0, 0 ] );
	return { rotor: { axis: [ 1, 0, 0 ], pivot: [ 0, 0, 0 ], vertices: [ 0, 1, 2, 3 ], angles: Array.from( { length: 9 }, ( _, i ) => i * STEP ) },
		templates: [ { posAttr: new THREE.BufferAttribute( positions, 3 ), normalAttr: new THREE.BufferAttribute( normals, 3 ), lightnormalindices: new Uint8Array( 6 ) } ] };

}
const FIRE = STEP / ROTOR.step; // rad/s
// the angle of barrel vertex 0 (rest on +y), unwrapped by the caller
const angleOf = template => Math.atan2( template.posAttr.array[ 2 ], template.posAttr.array[ 1 ] );
function run( a, e, plan, fps, t = 0 ) {

	// plan: [ [ seconds, pose ], ... ]; returns the samples. The first call of a fresh entity (at game time t) only
	// establishes its state; every later frame integrates the game time since the one before.
	const dt = 1 / fps, out = [];
	const blend = e.blend ??= { from: 0, to: 0, blend: 1 }; // (a persistent record, like entity._aliasLerp)
	if ( ! R_WeaponRotorState( e ) ) R_WeaponRotorFrame( a, e, plan[ 0 ][ 1 ], blend, t );
	for ( const [ seconds, pose ] of plan ) for ( let i = 0, n = Math.round( seconds * fps ); i < n; i ++ ) { t += dt; R_WeaponRotorFrame( a, e, pose, blend, t ); out.push( { t, ...R_WeaponRotorState( e ) } ); }
	return out;

}

Deno.test( 'firing spins the barrels at the stored poses\' rate, in their direction', () => {

	R_AnimSetClassicPass( false );
	const a = asset(), e = { origin: [ 0, 0, 0 ] };
	const samples = run( a, e, [ [ 1, 3 ] ], 60 );
	near( samples.at( - 1 ).omega, FIRE, Math.abs( FIRE ) * .005, 'the firing speed: a quarter turn per .1 s weapon frame' ); check( FIRE < 0, 'in the stored direction' );
	check( samples.every( ( s, i ) => i === 0 || s.angle < samples[ i - 1 ].angle ), 'the angle only ever advances in that direction' );

} );

Deno.test( 'after firing the barrels coast on in the same direction, slowing smoothly to a stop', () => {

	const a = asset(), e = { origin: [ 0, 0, 0 ] };
	const fired = run( a, e, [ [ 1, 3 ] ], 60 ), before = fired.at( - 1 );
	const coast = run( a, e, [ [ 4, 0 ] ], 60, before.t );
	check( coast[ 0 ].angle < before.angle, 'they keep turning the moment fire stops (no immediate halt)' );
	check( coast.every( ( s, i ) => i === 0 || ( s.angle <= coast[ i - 1 ].angle && Math.abs( s.omega ) <= Math.abs( coast[ i - 1 ].omega ) + 1e-12 ) ), 'never reversing, speed only falling' );
	const travelled = before.angle - coast.at( - 1 ).angle;
	near( - travelled, FIRE * ROTOR.spinDown, Math.abs( FIRE * ROTOR.spinDown ) * .02, 'the coast is the firing speed times the decay time (about 2 rad, a third of a turn)' ); check( travelled > .2 * Math.PI && travelled < 2 * Math.PI, 'a coast of a fraction of a turn, not a spin: ' + travelled.toFixed( 2 ) + ' rad' );
	same( coast.at( - 1 ).omega, 0, 'it settles with exactly zero speed' ); const settled = coast.at( - 1 ).angle;
	run( a, e, [ [ 1, 0 ] ], 60, coast.at( - 1 ).t ); same( R_WeaponRotorState( e ).angle, settled, 'and stays put at that angle' );
	// smooth: the speed has no jump larger than the decay allows between frames
	const bound = Math.abs( FIRE ) * ( 1 - Math.exp( - 1 / ( 60 * ROTOR.spinDown ) ) ) * 1.01; // the most one 60 Hz frame of the decay can take off
	check( coast.every( ( s, i ) => i === 0 || Math.abs( s.omega - coast[ i - 1 ].omega ) <= bound ), 'no step in the speed from frame to frame beyond the exponential\'s own (at most ' + bound.toFixed( 2 ) + ' rad/s a frame)' );

} );

Deno.test( 'firing again continues from the current angle and speed without a snap', () => {

	const a = asset(), e = { origin: [ 0, 0, 0 ] };
	const fps = 120, samples = run( a, e, [ [ .7, 5 ], [ .3, 0 ], [ .7, 6 ] ], fps );
	const maxStep = Math.abs( FIRE ) / fps * 1.001;
	check( samples.every( ( s, i ) => i === 0 || ( samples[ i - 1 ].angle - s.angle ) >= - 1e-12 && ( samples[ i - 1 ].angle - s.angle ) <= maxStep ), 'the angle never jumps or reverses, and never turns faster than the firing speed' );
	check( samples.every( ( s, i ) => i === 0 || Math.abs( s.omega - samples[ i - 1 ].omega ) < Math.abs( FIRE ) * .12 ), 'the speed ramps, it does not jump' );
	const resumed = samples[ Math.round( .3 * fps + .7 * fps ) ]; check( Math.abs( resumed.omega ) < Math.abs( FIRE ) && Math.abs( resumed.omega ) > 0, 'it was still turning, between idle and full speed, when fire resumed' );
	near( samples.at( - 1 ).omega, FIRE, Math.abs( FIRE ) * .01, 'and reaches the firing speed again' );

} );

Deno.test( 'the result does not depend on the frame rate, a repeated game time, or the render pass', () => {

	const plan = [ [ .5, 4 ], [ 1.2, 0 ], [ .5, 7 ], [ 1, 0 ] ], results = [];
	for ( const fps of [ 20, 60, 144, 240 ] ) { const a = asset(), e = { origin: [ 0, 0, 0 ] }; results.push( run( a, e, plan, fps ).at( - 1 ).angle ); }
	for ( const r of results ) near( r, results[ 0 ], .002, 'the same angle at 20, 60, 144 and 240 frames a second (to 0.1 degree: the only frame-dependent part is the instant the nearly stopped rotor is set to rest, a few thousandths of a radian)' );
	// the same game time again (a pause, a second render pass): nothing advances, the same geometry comes back
	const a = asset(), e = { origin: [ 0, 0, 0 ] }; run( a, e, [ [ .5, 2 ], [ .2, 0 ] ], 60 );
	const t = R_WeaponRotorState( e ).time, one = R_WeaponRotorFrame( a, e, 0, null, t ), copy = Array.from( one.posAttr.array ), state = R_WeaponRotorState( e );
	for ( let i = 0; i < 5; i ++ ) R_WeaponRotorFrame( a, e, 0, null, t );
	same( Array.from( R_WeaponRotorFrame( a, e, 0, null, t ).posAttr.array ).join(), copy.join(), 'the same geometry' ); same( R_WeaponRotorState( e ).angle, state.angle, 'no angle integrated' ); same( R_WeaponRotorState( e ).omega, state.omega, 'no speed integrated' );
	// the Classic pass (no imported asset) does not advance or erase the enhanced state
	R_AnimSetClassicPass( true ); same( R_WeaponRotorFrame( null, e, 0, null, t + 1 ), null, 'Classic has no rotor' ); R_AnimSetClassicPass( false );
	same( R_WeaponRotorState( e ).angle, state.angle, 'its state is as it was' );

} );

Deno.test( 'only the barrel vertices move, rigidly; each entity has its own state; unequipping releases it', () => {

	const a = asset(), e = { origin: [ 0, 0, 0 ] }, other = { origin: [ 0, 0, 0 ] }, rest = Array.from( a.templates[ 0 ].posAttr.array );
	run( a, e, [ [ .6, 3 ], [ .3, 0 ] ], 60 ); const t = R_WeaponRotorFrame( a, e, 0, e.blend, R_WeaponRotorState( e ).time + .01 ), p = t.posAttr.array;
	for ( let v = 0; v < 4; v ++ ) { near( Math.hypot( p[ v * 3 + 1 ], p[ v * 3 + 2 ] ), 1, 1e-5, 'barrel ' + v + ' keeps its radius' ); near( p[ v * 3 ], 0, 1e-6, 'and its place along the axis' ); }
	for ( let i = 12; i < 18; i ++ ) same( p[ i ], rest[ i ], 'the body vertices do not move' );
	same( Array.from( a.templates[ 0 ].posAttr.array ).join(), rest.join(), 'the shared rest geometry is untouched' );
	for ( let v = 0; v < 4; v ++ ) { const n = t.normalAttr.array; near( Math.hypot( n[ v * 3 ], n[ v * 3 + 1 ], n[ v * 3 + 2 ] ), 1, 1e-5, 'normals stay unit' ); }
	same( R_WeaponRotorState( other ), null, 'another entity has no state' ); R_WeaponRotorFrame( a, other, 0, null, 100 ); same( R_WeaponRotorState( other ).omega, 0, 'a fresh idle entity is at rest' );
	R_WeaponRotorFrame( null, e, 0, null, 201 ); same( R_WeaponRotorState( e ), null, 'unequipping (no rotor asset) releases the state' );
	// a new asset restarts it
	const first = asset(), second = asset(), f = { origin: [ 0, 0, 0 ] }; run( first, f, [ [ .5, 3 ] ], 60 ); R_WeaponRotorFrame( second, f, 0, null, 10 ); same( R_WeaponRotorState( f ).omega, 0, 'a different asset starts afresh' );

} );

Deno.test( 'a teleport, a new pose-blend record, a clock that goes back or a long gap never kill the coast or snap the angle', () => {

	const a = asset(), e = { origin: [ 0, 0, 0 ] };
	const fired = run( a, e, [ [ .6, 3 ], [ .15, 0 ] ], 60 ), before = fired.at( - 1 );
	check( Math.abs( before.omega ) > 1, 'coasting at ' + before.omega.toFixed( 2 ) + ' rad/s' );
	// teleport: the origin jumps far, and the game replaces the pose-blend record
	e.origin = [ 5000, 0, 0 ]; e.blend = { from: 0, to: 0, blend: 1 }; R_WeaponRotorFrame( a, e, 0, e.blend, before.t + 1 / 60 );
	const after = R_WeaponRotorState( e ); check( after.angle < before.angle && Math.abs( after.omega ) > 0 && Math.abs( after.omega ) < Math.abs( before.omega ), 'a teleport mid-coast: still turning, still slowing' ); check( before.angle - after.angle < Math.abs( FIRE ) / 60 * 1.01, 'and the angle moved one frame\'s worth, no snap' );
	// a clock that goes back: re-anchored, nothing lost, nothing integrated
	R_WeaponRotorFrame( a, e, 0, e.blend, .1 ); same( R_WeaponRotorState( e ).angle, after.angle, 'a clock that jumps back keeps the angle' ); same( R_WeaponRotorState( e ).omega, after.omega, 'and the speed' ); same( R_WeaponRotorState( e ).time, .1, 'and re-anchors the time' );
	// a long gap while fire is held: integrated exactly, forward, not restarted
	const g = { origin: [ 0, 0, 0 ] }; run( a, g, [ [ .5, 3 ] ], 60 ); const b4 = R_WeaponRotorState( g ); R_WeaponRotorFrame( a, g, 3, g.blend, b4.time + .5 );
	near( R_WeaponRotorState( g ).angle, b4.angle + FIRE * .5, Math.abs( FIRE ) * .002, 'a half second gap at full speed advances half a second of rotation' );
	// invalid times are ignored
	const keep = R_WeaponRotorState( g ).angle; R_WeaponRotorFrame( a, g, 3, g.blend, NaN ); same( R_WeaponRotorState( g ).angle, keep, 'a NaN time changes nothing' ); check( Number.isFinite( R_WeaponRotorState( g ).time ), 'and does not poison the state\'s clock' ); R_WeaponRotorFrame( a, g, 3, g.blend, R_WeaponRotorState( g ).time + .1 ); check( R_WeaponRotorState( g ).angle < keep, 'the next real time carries on' );

} );
