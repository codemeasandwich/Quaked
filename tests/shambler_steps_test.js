// Shambler footfall shake through its public per-frame entry point and through
// the real V_CalcRefdef view path. Client, server, key and cvar state are the
// real module singletons; only the Shambler's alias model is reduced to its
// frame names, which are all the shake reads. Float32 view vectors are
// compared to 1e-5.
import { V_ShamblerStepShake, v_shamblersteps } from '../src/newer/render/v_shamblersteps.js';
import { V_CalcRefdef, V_Init } from '../src/engine/client/view.js';
import { r_refdef } from '../src/engine/render/render.js';
import { cl, cls, cl_entities, ca_connected, SIGNONS } from '../src/engine/client/client.js';
import { sv } from '../src/engine/server/server.js';
import { STAT_HEALTH } from '../src/engine/common/quakedef.js';
import { key_game, key_console, key_message, key_menu, set_key_dest } from '../src/engine/client/keys.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { r_lerpmodels } from '../src/newer/render/r_anim.js';
import { R_AnimSetNewer } from '../src/newer/mode.js';
import { Cvar_FindVar, Cvar_RegisterVariable, Cvar_Set } from '../src/engine/common/cvar.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const LIMITS = [ 1.2, 0.25, 0.15 ]; // vertical units, pitch and roll degrees
for ( const variable of [ r_hdr, r_lerpmodels ] ) if ( ! Cvar_FindVar( variable.name ) ) Cvar_RegisterVariable( variable );
V_Init(); // registers v_shamblersteps the way the game does

const names = [];
for ( let i = 1; i <= 17; i ++ ) names.push( 'stand' + i );
for ( let i = 1; i <= 12; i ++ ) names.push( 'walk' + i );
for ( let i = 1; i <= 6; i ++ ) names.push( 'run' + i );
for ( let i = 1; i <= 12; i ++ ) names.push( 'smash' + i );
const shambler = { name: 'progs/shambler.mdl', cache: { data: { frames: names.map( name => ( { name } ) ) } } };
const ogre = { ...shambler, name: 'progs/ogre.mdl' };
const player = [ 0, 0, 0 ];
let clock = 100;

// A connected, live, unpaused Newer Game with one Shambler `distance` units away.
function fixture( { distance = 100, newer = '1', setting = '1', model = shambler } = {} ) {

	Cvar_Set( 'r_hdr', newer ); Cvar_Set( 'v_shamblersteps', setting ); Cvar_Set( 'r_lerpmodels', '1' ); R_AnimSetNewer( false );
	cls.state = ca_connected; cls.signon = SIGNONS; cls.demoplayback = false; set_key_dest( key_game );
	cl.worldmodel = cl.worldmodel || { name: 'maps/test.bsp' }; cl.paused = false; cl.intermission = 0; cl.stats[ STAT_HEALTH ] = 100;
	sv.active = false; clock += 10; // past STALE, so earlier tests leave nothing behind
	cl.time = clock; V_ShamblerStepShake( player, true ); // a quiet frame resets on the long gap
	const entity = { model, frame: 0, origin: [ distance, 0, 0 ] };
	cl_entities[ 1 ] = entity; cl.num_entities = 2;
	return entity;

}

// Play `frames` at Quake's ten poses a second, rendering every 10 ms, and
// return the shake samples with the pose shown at each. `onGround` may be a
// function of ( pose index, tick ); `move` runs as each pose arrives.
function play( entity, frames, { onGround = true, move, sample = ground => V_ShamblerStepShake( player, ground ) } = {} ) {

	const samples = [];
	let ground = true;
	frames.forEach( ( frame, index ) => {

		entity.frame = names.indexOf( frame );
		if ( move ) move( entity, index );
		for ( let tick = 0; tick < 10; tick ++ ) {

			clock = Math.round( ( clock + 0.01 ) * 1000 ) / 1000; cl.time = clock;
			ground = typeof onGround === 'function' ? onGround( index, tick ) : onGround;
			samples.push( { frame, index, tick, offset: Array.from( sample( ground ) ) } );

		}

	} );
	return samples;

}
const peak = samples => Math.max( 0, ...samples.map( s => Math.abs( s.offset[ 0 ] ) ) );
const shaking = samples => [ ...new Set( samples.filter( s => s.offset.some( v => v !== 0 ) ).map( s => s.frame ) ) ];
const walk = [ 'walk11', 'walk12', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'walk6', 'walk7', 'walk8', 'walk9', 'walk10' ];
const near = ( a, b, message, epsilon = 1e-9 ) => check( Math.abs( a - b ) < epsilon, `${message}: ${a} != ${b}` );

Deno.test( 'each walking footfall shakes once, at the heel strike, and not between steps', () => {

	const samples = play( fixture(), walk );
	const felt = shaking( samples );
	check( felt.join() === 'walk1,walk2,walk3,walk7,walk8,walk9', 'shake starts on walk1/walk7 and decays within 0.22 s: ' + felt );
	const strike = samples.filter( s => s.frame === 'walk1' || s.frame === 'walk7' );
	check( strike.every( s => s.offset[ 0 ] !== 0 ), 'each strike pose shakes from the moment of contact' );
	check( strike.filter( s => s.tick === 0 ).every( s => s.offset[ 0 ] < 0 && s.offset[ 1 ] > 0 ), 'the impact drops and dips the eye' );
	// 0.22 s pulse: two poses later it shakes for its first 20 ms, then stills.
	const after = samples.filter( s => s.frame === 'walk3' );
	check( after.slice( 0, 2 ).every( s => s.offset[ 0 ] !== 0 ) && after.slice( 2 ).every( s => s.offset[ 0 ] === 0 ), 'pulse is short' );

	const roll = frame => samples.filter( s => s.frame === frame ).map( s => s.offset[ 2 ] / s.offset[ 1 ] ).find( r => r );
	check( roll( 'walk1' ) > 0 && roll( 'walk7' ) < 0, `right and left feet roll the view opposite ways: ${roll( 'walk1' )} ${roll( 'walk7' )}` );

} );

Deno.test( 'running footfalls land on run2 and run5', () => {

	const felt = shaking( play( fixture(), [ 'run6', 'run1', 'run2', 'run3', 'run4', 'run5', 'run6' ] ) );
	check( felt.join() === 'run2,run3,run4,run5,run6', 'run heel strikes: ' + felt );

} );

Deno.test( 'strength is (1 - distance / 600) squared: a quarter at 300 units, nothing from 600', () => {

	const at = distance => peak( play( fixture( { distance } ), walk ) );
	// The impact sample (contact age 0) carries the full pulse strength.
	for ( const distance of [ 0, 48, 150, 300, 450, 590 ] ) near( at( distance ), LIMITS[ 0 ] * ( 1 - distance / 600 ) ** 2, 'peak at ' + distance );
	near( at( 300 ) / at( 0 ), 0.25, 'a quarter as strong at 300 units' );
	check( at( 600 ) === 0 && at( 900 ) === 0, 'reach ends at 600 units' );

} );

Deno.test( 'several Shamblers stomping together stay within the small-quake limits', () => {

	const entity = fixture( { distance: 0 } );
	for ( let i = 2; i < 8; i ++ ) cl_entities[ i ] = { model: shambler, frame: 0, origin: [ 0, 0, 0 ] };
	cl.num_entities = 8;
	const samples = play( entity, walk, { move: e => { for ( let i = 2; i < 8; i ++ ) cl_entities[ i ].frame = e.frame; } } );
	check( samples.every( s => s.offset.every( ( v, i ) => Math.abs( v ) <= LIMITS[ i ] + 1e-12 ) ), 'clamped' );
	check( samples.some( s => s.offset.every( ( v, i ) => Math.abs( v ) === LIMITS[ i ] ) ), 'a pack is felt at the limit' );

} );

Deno.test( 'short packet gaps still land their steps; longer jumps never replay one', () => {

	check( shaking( play( fixture(), [ 'walk10', 'walk11', 'walk2' ] ) ).join() === 'walk2', 'a three-pose gap crossing walk1 still shakes' );
	check( peak( play( fixture(), [ 'walk10', 'walk11', 'walk3' ] ) ) === 0, 'a four-pose gap is not a played step' );
	check( peak( play( fixture(), [ 'walk1', 'walk7', 'walk1' ] ) ) === 0, 'a six-pose jump is not a played step' );
	check( peak( play( fixture(), [ 'walk3', 'walk2', 'walk1', 'walk12' ] ) ) === 0, 'reversed playback is not a step' );

} );

Deno.test( 'starting to walk or run straight onto a contact pose is the first step', () => {

	check( shaking( play( fixture(), [ 'stand17', 'walk1', 'walk2' ] ) ).length > 0, 'stand17 -> walk1 is felt' );
	check( peak( play( fixture(), [ 'stand17', 'walk2', 'walk3' ] ) ) === 0, 'stand17 -> walk2 is not a contact' );
	check( shaking( play( fixture(), [ 'walk5', 'run5' ] ) ).join() === 'run5', 'walk -> run5 is a running step' );
	check( peak( play( fixture(), [ 'walk5', 'run3', 'run4' ] ) ) === 0, 'walk -> run3 is not' );
	check( peak( play( fixture(), [ 'walk1', 'walk2' ] ) ) === 0, 'first sight of a Shambler mid-step is not a step' );

} );

Deno.test( 'held, non-walking, teleporting, vanished and other-model poses never shake', () => {

	check( peak( play( fixture(), [ 'walk12', 'walk1', 'walk1', 'walk1', 'walk1' ] ).slice( 40 ) ) === 0, 'a held contact pose does not retrigger' );
	check( peak( play( fixture(), [ 'stand1', 'smash1', 'smash2', 'smash3' ] ) ) === 0, 'standing and attacking poses are not footfalls' );
	check( peak( play( fixture(), walk, { move: ( e, i ) => { e.origin[ 0 ] = 100 + i * 200; } } ) ) === 0, 'teleporting restarts tracking' );
	check( peak( play( fixture( { model: ogre } ), walk ) ) === 0, 'other monsters with walk frames do not shake' );

	// Out of view for 0.4 s (no model), back on the next contact: not a step.
	const entity = fixture();
	play( entity, [ 'walk5', 'walk6' ] );
	const samples = play( entity, [ 'walk6', 'walk6', 'walk6', 'walk6', 'walk7', 'walk8' ], { move: ( e, i ) => { e.model = i < 4 ? null : shambler; } } );
	check( peak( samples ) === 0, 'a Shambler unseen for 0.4 s starts afresh' );

} );

Deno.test( 'a step ends early when the Shambler stops walking, changes model or the level changes', () => {

	const cut = ( change ) => {

		const entity = fixture();
		const samples = play( entity, [ 'walk12', 'walk1', 'walk1' ], { move: ( e, i ) => { if ( i === 2 ) change( e ); } } );
		check( samples.filter( s => s.index === 1 ).every( s => s.offset[ 0 ] !== 0 ), 'pulse running before the change' );
		return samples.filter( s => s.index === 2 );

	};
	check( peak( cut( e => { e.frame = names.indexOf( 'smash1' ); } ) ) === 0, 'an attack cuts the step' );
	check( peak( cut( e => { e.model = ogre; } ) ) === 0, 'a reused entity slot cuts the step' );
	check( peak( cut( () => { cl.worldmodel = { name: 'maps/next.bsp' }; } ) ) === 0, 'a new level forgets the step' );

} );

Deno.test( 'the player must be on the ground when the foot lands, and feels nothing in the air', () => {

	check( peak( play( fixture(), walk, { onGround: false } ) ) === 0, 'off the ground nothing is felt' );
	// Airborne at walk1's contact, landing 30 ms later inside the pulse window.
	const landed = play( fixture(), [ 'walk12', 'walk1', 'walk2' ], { onGround: ( i, tick ) => ! ( i === 1 && tick < 3 ) } );
	check( peak( landed ) === 0, 'a contact made while airborne is never felt' );
	// On the ground at contact, a jump mutes the rest of the pulse.
	const jumped = play( fixture(), [ 'walk12', 'walk1', 'walk2' ], { onGround: ( i, tick ) => ! ( i === 1 && tick >= 3 ) } );
	check( jumped.filter( s => s.index === 1 && s.tick < 3 ).every( s => s.offset[ 0 ] !== 0 ), 'felt while standing' );
	check( jumped.filter( s => s.index === 1 && s.tick >= 3 ).every( s => s.offset[ 0 ] === 0 ), 'muted in the air' );

} );

Deno.test( 'New Game, the setting, demos, pause, death, intermission and menus stop the shake', () => {

	check( peak( play( fixture( { newer: '0' } ), walk ) ) === 0, 'New Game keeps the original view' );
	check( peak( play( fixture( { setting: '0' } ), walk ) ) === 0, 'v_shamblersteps 0 disables it' );
	const full = peak( play( fixture(), walk ) ), half = peak( play( fixture( { setting: '0.5' } ), walk ) );
	near( half, full / 2, 'v_shamblersteps 0.5 halves it' );
	check( peak( play( fixture( { setting: '3' } ), walk ) ) === full, 'the setting can only reduce it' );

	const gates = {
		'recorded demos': () => { cls.demoplayback = true; },
		'a paused game': () => { cl.paused = true; },
		'a paused local server': () => { sv.active = true; sv.paused = true; },
		'a dead player': () => { cl.stats[ STAT_HEALTH ] = 0; },
		'intermission': () => { cl.intermission = 1; },
		'the console': () => set_key_dest( key_console ),
		'chat input': () => set_key_dest( key_message ),
		'a menu': () => set_key_dest( key_menu ),
		'a missing world': () => { cl.worldmodel = null; },
		'an incomplete signon': () => { cls.signon = SIGNONS - 1; },
	};
	for ( const [ name, gate ] of Object.entries( gates ) ) {

		const entity = fixture(), saved = cl.worldmodel;
		const samples = play( entity, [ 'walk12', 'walk1', 'walk2' ], { move: ( e, i ) => { if ( i === 1 ) gate(); } } );
		sv.paused = false; cl.worldmodel = saved;
		check( peak( samples ) === 0, 'no shake for ' + name );

	}

} );

Deno.test( 'small backwards steps in the predicted clock keep the step; a restart forgets it', () => {

	const entity = fixture();
	play( entity, [ 'walk12', 'walk1' ] );
	cl.time = clock - 0.15; // early in the pulse: 0.1 s in, now 5 ms back
	const held = V_ShamblerStepShake( player, true )[ 0 ];
	check( held !== 0, 'a 5 ms clock regression is held, not reset' );
	cl.time = clock - 5; check( V_ShamblerStepShake( player, true )[ 0 ] === 0, 'a large jump back (map restart) resets' );

} );

Deno.test( 'with smoothed monster animation the shake waits for the contact pose to be drawn', () => {

	const entity = fixture(); R_AnimSetNewer( true );
	try {

		const felt = shaking( play( entity, walk ) );
		check( felt.join() === 'walk2,walk3,walk4,walk8,walk9,walk10', 'shake follows the blended pose one step later: ' + felt );

	} finally { R_AnimSetNewer( false ); }

} );

Deno.test( 'V_CalcRefdef moves the eye and weapon together and tilts only the eye', () => {

	const entity = fixture( { distance: 0 } );
	const self = { origin: new Float32Array( [ 0, 0, 0 ] ), angles: new Float32Array( 3 ) };
	cl_entities[ 0 ] = self; cl.viewentity = 0; cl.viewheight = 22; cl.onground = true; sv.active = true; sv.paused = false;
	cl.velocity.fill( 0 ); cl.viewangles.fill( 0 ); cl.punchangle.fill( 0 );
	const frames = play( entity, [ 'walk12', 'walk1' ], { sample: () => {

		V_CalcRefdef();
		return [ r_refdef.vieworg[ 2 ], cl.viewent.origin[ 2 ], r_refdef.viewangles[ 0 ], r_refdef.viewangles[ 2 ], cl.viewent.angles[ 0 ] ];

	} } );
	const still = frames[ 9 ].offset, impact = frames[ 10 ].offset; // last walk12 frame, walk1 contact
	near( impact[ 0 ] - still[ 0 ], - LIMITS[ 0 ], 'eye drops the full impact beside the Shambler', 1e-5 );
	near( impact[ 1 ] - still[ 1 ], - LIMITS[ 0 ], 'weapon drops with the eye', 1e-5 );
	near( impact[ 2 ] - still[ 2 ], LIMITS[ 1 ], 'eye pitches down', 1e-5 );
	near( impact[ 3 ] - still[ 3 ], LIMITS[ 2 ], 'right foot rolls the eye', 1e-5 );
	near( impact[ 4 ], still[ 4 ], 'weapon angles are untouched', 1e-5 );

	Cvar_Set( 'r_hdr', '0' ); cl.time = clock + 0.01;
	V_CalcRefdef();
	near( r_refdef.vieworg[ 2 ], still[ 0 ], 'New Game view is the unshaken view', 1e-5 );

} );
