/**
 * @module newer/sound/s_footsteps
 *
 * Surface-aware footsteps for human enemies: grunts, enforcers, ogres, knights
 * and death knights (owner, 19 October 2026). The player and other creatures do
 * not receive generated footsteps. Native game-owned sounds remain authoritative.
 * Walking pose, displacement, ground contact, floor material, spatial placement
 * and the four-step/free-channel budgets retain their existing behavior.
 * Off in Classic, demos and with s_footsteps 0.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `walkers` (each enemy's stride), `own`
 * (whose footsteps the game has played itself, this map), `turn`, `budget`, `lastTime`; each model remembers its tread
 * (`_stepWeight`) and which of its frames walk (`_stepPoses`).
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls, cl_entities } from '../../engine/client/client.js';
import { S_PrecacheSound, S_StartSoundIfFree, S_AddSoundStarted } from '../../engine/sound/snd_dma.js';
import { R_NewerGame } from '../mode.js';
import { FX_Contents, FX_IsLiquid, FX_Stop, FX_LAVA } from '../render/fx_world.js';
import { S_MaterialAt, S_FLOOR } from './s_material.js';
import './s_surfacesounds.js';

/** Footsteps: 0 off, 1 on (saved; Options, Newer features). */
export const s_footsteps = new cvar_t( 's_footsteps', '1', true );

/** How steps go: the slowest speed that steps, cadence (steps a second) at a stand and at full run, per frame's most. */
export const STEPS = Object.freeze( { slowest: 40, cadence: [ 1.8, 3.0 ], run: 320, perFrame: 4 } );

const walkers = new WeakMap();
const HUMAN_WALKER = /^progs\/(army|soldier|enforcer|ogre2?|knight|hknight)\.mdl$/i;
let turn = 0, budget = 0;

// Models whose own game supplies footsteps keep that timing and sound. A sound
// only precached, never played, does not suppress generated enemy steps.
const own = { models: new Set(), world: null };
const STEP_SOUND = /(^|\/)(steps?\/|[^/]*(step|foot)[^/]*\.wav$)/i;
function ownSteps() { if ( own.world !== cl.worldmodel ) { own.world = cl.worldmodel; own.models.clear(); } return own; }
S_AddSoundStarted( ( sfx, origin, volume, attenuation, entnum ) => {

	if ( ! STEP_SOUND.test( sfx?.name ?? '' ) || ( sfx.name ?? '' ).startsWith( 'quaked/' ) ) return;
	ownSteps();
	if ( entnum !== cl.viewentity && cl_entities[ entnum ]?.model ) own.models.add( cl_entities[ entnum ].model );

} );

// a walking or running pose (a creature's own frame names: walk, run, prowl): nothing else steps (gibs, heads,
// grenades, corpses sliding, a Scrag hovering, a fish swimming); remembered per model and frame
const WALKING = /walk|run|prowl|march|stride|charge|trot/i;
function walking( e ) {

	const frames = e.model.cache?.data?.frames;
	if ( ! frames ) return false;
	let poses = e.model._stepPoses;
	if ( ! poses ) poses = e.model._stepPoses = frames.map( f => WALKING.test( f?.name ?? '' ) );
	return poses[ e.frame ] === true;

}

// Tread weight follows the model's native bounds (small, medium or bulky);
// the human-enemy admission above is independent of this cached measurement.
function weightOf( model ) {

	if ( model._stepWeight !== undefined ) return model._stepWeight;
	const d = model.cache?.data, f = d?.frames?.[ 0 ];
	if ( ! d ) return 'medium'; // (not loaded yet: asked again next time)
	let w = 'medium';
	if ( d?.scale && f?.bboxmin?.v && f?.bboxmax?.v ) {

		let volume = 1;
		for ( let a = 0; a < 3; a ++ ) volume *= Math.max( 1, ( f.bboxmax.v[ a ] - f.bboxmin.v[ a ] ) * d.scale[ a ] );
		w = volume < 35000 ? 'light' : volume > 150000 ? 'heavy' : 'medium';

	}
	return ( model._stepWeight = w );

}

// the stride (units) at a speed (units a second)
const stride = speed => speed / ( STEPS.cadence[ 0 ] + ( STEPS.cadence[ 1 ] - STEPS.cadence[ 0 ] ) * Math.min( 1, speed / STEPS.run ) );

function step( heavy, material, at, volume ) {

	if ( budget <= 0 || ! material ) return null;
	budget --; turn = ( turn + 1 ) % 4;
	const name = `quaked/${heavy ? 'steph' : 'step'}_${material}${turn + 1}.wav`;
	return S_StartSoundIfFree( - 1, S_PrecacheSound( name ), at, volume, 1 ) ? name : null;

}

// the floor's material under feet at `feet`, water when wading
function underfoot( feet ) {

	const c = FX_Contents( cl.worldmodel, feet );
	if ( c === FX_LAVA ) return null;
	if ( FX_IsLiquid( c ) ) return 'water';
	return S_MaterialAt( cl.worldmodel, feet, 24, S_FLOOR );

}

let lastTime = null;

/**
 * Moves the footsteps on one frame. Called once a frame by the renderer (gl_rmain.js), after the entities are placed.
 *
 * @param {number} time the game's time (`cl.time`)
 * @returns {Array<string>} the step sounds started this frame, for tests
 */
export function S_FootstepsFrame( time ) {

	const started = [], frametime = lastTime === null ? 0 : time - lastTime;
	lastTime = time;
	if ( ! R_NewerGame() || ! ( s_footsteps.value > 0 ) || cls.demoplayback || ! cl.worldmodel || cl.paused || ! ( frametime > 0 ) || frametime > 0.5 ) return started;
	budget = STEPS.perFrame;
	const owned = ownSteps();
	const self = cl_entities[ cl.viewentity ];
	// Human enemies only; remote players and all other creatures stay native.
	for ( let i = 1; i < cl.num_entities; i ++ ) {

		const e = cl_entities[ i ];
		if ( i === cl.viewentity || ! HUMAN_WALKER.test( e?.model?.name ?? '' ) || e.model.type !== 2 /* alias */ || ! e.origin || owned.models.has( e.model ) ) continue;
		// (far off: not heard anyway)
		if ( self?.origin && Math.abs( e.origin[ 0 ] - self.origin[ 0 ] ) + Math.abs( e.origin[ 1 ] - self.origin[ 1 ] ) > 1500 ) continue;
		let w = walkers.get( e );
		const o = e.origin;
		if ( ! w || w.model !== e.model || w.world !== cl.worldmodel || time - w.t > 0.5 ) { walkers.set( e, { model: e.model, world: cl.worldmodel, x: o[ 0 ], y: o[ 1 ], z: o[ 2 ], t: time, left: 0, ground: undefined } ); continue; }
		const dx = o[ 0 ] - w.x, dy = o[ 1 ] - w.y, dz = o[ 2 ] - w.z, dt = time - w.t, moved = Math.hypot( dx, dy );
		w.x = o[ 0 ]; w.y = o[ 1 ]; w.z = o[ 2 ]; w.t = time;
		if ( dt <= 0 || moved < 0.05 || moved / dt > 900 ) continue; // (still, or a teleport)
		// on the ground: not rising or falling, with the floor close under its middle
		if ( Math.abs( dz ) / dt > 120 ) { w.ground = undefined; continue; }
		if ( ! walking( e ) ) continue;
		const weight = weightOf( e.model ), heavy = weight === 'heavy', light = weight === 'light';
		w.left -= moved;
		if ( w.left > 0 ) continue;
		w.left += stride( moved / dt ) * ( heavy ? 1.4 : light ? 0.7 : 1 );
		const floor = FX_Stop( cl.worldmodel, o, - 64 );
		if ( floor === null || o[ 2 ] - floor > 30 ) continue; // (a walker's middle is 24 over the floor; a little more for slopes)
		const feet = [ o[ 0 ], o[ 1 ], floor + 1 ];
		const name = step( heavy, underfoot( feet ), feet, heavy ? 0.7 : light ? 0.3 : 0.45 );
		if ( name ) started.push( name );

	}
	return started;

}
