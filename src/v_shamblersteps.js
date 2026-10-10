// Native Shambler foot plants, sampled from client entities before rendering.
// This changes only the displayed eye; physics, aim and server data stay intact.
import { cl, cls, cl_entities, ca_connected, SIGNONS } from './engine/client/client.js';
import { sv } from './engine/server/server.js';
import { STAT_HEALTH } from './engine/common/quakedef.js';
import { key_dest, key_game } from './engine/client/keys.js';
import { R_NewerGame, R_AnimEnabled, ANIM_STEP } from './r_anim.js';
import { cvar_t } from './engine/common/cvar.js';

export const v_shamblersteps = new cvar_t( 'v_shamblersteps', '1', true );
const REACH = 600, DURATION = 0.22, STALE = 0.3, TELEPORT = 96;
const LIMITS = [ 1.2, 0.25, 0.15 ]; // a whole pack of Shamblers is still a small quake
// Heel strikes measured from progs/shambler.mdl: the frame where a swinging
// foot is on the floor at its furthest forward point (the right foot first
// touches at walk12, but carries forward to walk1). Right foot first, then left
// (walk1/walk7, run2/run5); Newer Game reskins keep these original poses.
// docs/evidence/shambler-footfall-frames-2026-10-02.txt has the measurements.
const contacts = { walk: [ 1, 7 ], run: [ 2, 5 ] };
const counts = { walk: 12, run: 6 };
let world = null, lastTime = - Infinity, states = new WeakMap(), tracking = false;
const pulses = [];
const poseCache = new WeakMap(); // alias model -> per-frame { cycle, frame } or null
const offset = new Float64Array( 3 ); // vertical units, pitch degrees, roll degrees

function reset() {

	// Called every frame while the tremor is off, so only allocate when there
	// is something to forget.
	if ( tracking ) { states = new WeakMap(); pulses.length = 0; tracking = false; }
	lastTime = cl.time; world = cl.worldmodel;

}

function poseOf( e ) {

	const frames = e.model?.cache?.data?.frames;
	if ( ! frames ) return null;
	let poses = poseCache.get( e.model );
	if ( ! poses ) {

		poses = frames.map( f => {

			const m = /^(walk|run)(\d+)$/.exec( f?.name || '' );
			return m && Number( m[ 2 ] ) >= 1 && Number( m[ 2 ] ) <= counts[ m[ 1 ] ] ? { cycle: m[ 1 ], frame: Number( m[ 2 ] ) } : null;

		} );
		poseCache.set( e.model, poses );

	}
	return poses[ e.frame ] || null;

}

export function V_ShamblerStepShake( playerorg, onGround ) {

	offset.fill( 0 );
	if ( ! R_NewerGame() || cls.state !== ca_connected || cls.signon !== SIGNONS || cls.demoplayback ||
		! cl.worldmodel || cl.paused || ( sv.active && sv.paused ) || cl.intermission ||
		cl.stats[ STAT_HEALTH ] <= 0 || key_dest !== key_game || v_shamblersteps.value <= 0 ) {

		reset(); return offset;

	}
	// With prediction cl.time is realtime minus a smoothed latency, so it can
	// step back a few milliseconds; hold it rather than forget the steps. A
	// large jump back (map restart) or a long gap starts again.
	if ( world !== cl.worldmodel || cl.time < lastTime - STALE || cl.time - lastTime > STALE ) reset();
	const now = Math.max( cl.time, lastTime );
	lastTime = now;
	for ( let i = 1; i < cl.num_entities; i ++ ) {

		const e = cl_entities[ i ];
		if ( e?.model?.name !== 'progs/shambler.mdl' ) continue;
		const pose = poseOf( e ), cycle = pose?.cycle, frame = pose?.frame;
		let s = states.get( e );
		const o = e.origin;
		if ( ! s || s.model !== e.model || now - s.time > STALE ||
			Math.hypot( o[ 0 ] - s.x, o[ 1 ] - s.y, o[ 2 ] - s.z ) > TELEPORT ) {

			// First sight is never a step: the foot may have landed long ago.
			s = { model: e.model }; states.set( e, s ); tracking = true;

		} else if ( cycle ) {

			// A held pose never retriggers. Recover a missed contact in a short
			// packet gap; larger jumps/reversed playback never replay old steps.
			// Entering a cycle (from standing, or walk to run) directly on a
			// contact pose is that cycle's first step.
			const count = counts[ cycle ];
			const advance = cycle === s.cycle ? ( frame - s.frame + count ) % count : 1;
			const from = cycle === s.cycle ? s.frame : frame - 1;
			if ( advance > 0 && advance <= 3 && onGround ) {

				const distance = Math.hypot( o[ 0 ] - playerorg[ 0 ], o[ 1 ] - playerorg[ 1 ], o[ 2 ] - playerorg[ 2 ] );
				for ( let step = 1; step <= advance && distance < REACH; step ++ ) {

					const crossed = ( from - 1 + step + count ) % count + 1;
					if ( ! contacts[ cycle ].includes( crossed ) ) continue;
					// The displayed alias pose arrives one animation interval after
					// its network frame when smoothing is enabled (also if unseen).
					pulses.push( { entity: e, model: e.model, start: now + ( R_AnimEnabled() ? ANIM_STEP : 0 ),
						strength: ( 1 - distance / REACH ) ** 2, side: crossed === contacts[ cycle ][ 0 ] ? 1 : - 1 } );
					tracking = true;

				}

			}

		}
		s.cycle = cycle; s.frame = frame; s.time = now; s.x = o[ 0 ]; s.y = o[ 1 ]; s.z = o[ 2 ];

	}
	for ( let i = pulses.length - 1; i >= 0; i -- ) {

		const p = pulses[ i ], age = now - p.start;
		if ( age >= DURATION || p.entity.model !== p.model || ! poseOf( p.entity ) ) {

			pulses.splice( i, 1 ); continue;

		}
		// Muted, not paused, while the player is in the air.
		if ( age < 0 || ! onGround ) continue;
		// The impact is at full strength the moment the foot lands (a cosine,
		// so no steady frame rate can sample only its zeros): the eye drops
		// and dips, rolling away from the foot, then shudders out at 18 Hz.
		const wave = Math.cos( age * Math.PI * 2 * 18 ) * ( 1 - age / DURATION ) ** 2 * p.strength;
		offset[ 0 ] -= wave * LIMITS[ 0 ]; offset[ 1 ] += wave * LIMITS[ 1 ]; offset[ 2 ] += wave * LIMITS[ 2 ] * p.side;

	}
	// Several nearby Shamblers still produce a small earthquake, not a large
	// displacement. The archived setting can reduce or disable it entirely.
	const scale = Math.min( 1, v_shamblersteps.value );
	for ( let i = 0; i < 3; i ++ ) offset[ i ] = Math.max( - LIMITS[ i ], Math.min( LIMITS[ i ], offset[ i ] ) ) * scale;
	return offset;

}
