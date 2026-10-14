/**
 * @module newer/gameplay/sv_firequench
 *
 * Fire goes out in water (owner request 11 Oct 2026, card [FB3]; Newer Game only): a flying fireball that enters
 * water or slime is put out at the surface with a small burst, and stops there.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_pending`, `_crossed`, `_edicts`; 1 module-level collection
 * (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Fire goes out in water (owner request, 11 Oct 2026, card [FB3]; Newer Game only, Classic keeps Quake's rules).
//
// Quake's fireballs are missiles drawn with progs/lavaball.mdl (misc_fireball's lava spurts, Chthon's balls) and the
// Death Knight's fan shots (progs/k_spike.mdl); in Newer Game the shots are drawn as the owner's fireballs.html fireball
// (r_lavaballs.js) and the lava balls keep their own model. Both go out in water with the fireball's small burst. In stock Quake they fly on through water as through air: a Death Knight's shot still reaches a
// player hiding underwater. The owner's rule, chosen as real gameplay over a picture-only change: fire cannot travel
// underwater. sv_phys.js SV_Physics_Toss asks this module twice per missile move:
//
//  * before the move, `SV_FireQuenchStep`: a fireball in the air whose step would pass into water or slime has the
//    step cut at the surface (the last dry point: the step sampled every 2 units, then halved 8 times between the last
//    dry and first wet sample; the step may end in the pool's floor), so the move, and any touch it makes,
//    stays above the water: a shot cannot reach anyone under the surface, even in one long frame;
//  * after the move, `SV_FireQuench`: a fireball that reached that surface point goes out (one already in water or
//    slime, e.g. born there, is not moved at all and goes out where it is): it is removed (ED_Free, as QuakeC's own `remove`) after a small burst,
//    TE_KNIGHTSPIKE at the point (drawn in Newer Game as the supplied fireball's own impact, sparks, a ring laid flat on
//    the water and smoke: render.js R_KnightSpikeImpact -> r_lavaballs.js R_LavaBallImpact, with the Death Knight's
//    hit sizzle), and, when it crossed the surface, the splash stock Quake plays for a missile entering water
//    (misc/h2ohit1.wav).
//
// No damage is dealt: the fire went out. Lava is not water: misc_fireball's balls rise out of lava and fall back into
// it unchanged. As the other Newer gameplay rules, it applies to a local single-player game (not dedicated, not a
// demo) on the stock progs (`PR_StockProgs`: 1.06 or the 2021 re-release): a mod's QuakeC that still holds such a missile is never surprised by the
// engine removing it, and a multiplayer host does not change the rules for its clients. The burst is at the surface,
// so the defence is being fully under it: a player whose eyes are just under the water still has up to 10 units of
// body above it (maxs z 32, view height 22).
import { sv, svs } from '../../engine/server/server.js';
import { cls, ca_dedicated } from '../../engine/client/client.js';
import { SV_PointContents } from '../../engine/server/world.js';
import { SV_StartSound } from '../../engine/server/sv_main.js';
import { ED_Free } from '../../engine/progs/pr_edict.js';
import { PR_GetString, PR_StockProgs } from '../../engine/progs/progs.js';
import { MSG_WriteByte, MSG_WriteCoord } from '../../engine/common/common.js';
import { svc_temp_entity, TE_KNIGHTSPIKE } from '../../engine/common/protocol.js';
import { CONTENTS_WATER, CONTENTS_SLIME } from '../../engine/common/bspfile.js';
import { MAX_DATAGRAM } from '../../engine/common/quakedef.js';
import { R_NewerGame } from '../mode.js';

export const FIRE_QUENCH = Object.freeze( {
	models: Object.freeze( [ 'progs/lavaball.mdl', 'progs/k_spike.mdl' ] ), // the fireballs
	sound: 'misc/h2ohit1.wav', // stock Quake's missile-into-water splash (precached by world.qc)
	sample: 2,                 // Quake units between the points sampled along a step for the water
	halvings: 8                // then the surface found to 1/256 of that
} );

const wet = c => c === CONTENTS_WATER || c === CONTENTS_SLIME;
const _a = [ 0, 0, 0 ], _b = [ 0, 0, 0 ], _m = [ 0, 0, 0 ], _surface = [ 0, 0, 0 ];
let _pending = null, _crossed = false; // the edict whose step was cut at `_surface` this move; did it cross the surface
// Is this edict a fireball: its model string, looked up once per string (the server's per-frame path allocates
// nothing). Each server spawn (a new map, the same map again, a loaded game) reloads the progs and their runtime
// strings, so an offset can name another string: the answers are dropped with the edict list SV_SpawnServer builds.
const _fire = new Map();
let _edicts = null;
function fireball( ent ) {

	if ( _edicts !== sv.edicts ) { _edicts = sv.edicts; _fire.clear(); }
	const key = ent.v.model | 0;
	let yes = _fire.get( key );
	if ( yes === undefined ) { yes = FIRE_QUENCH.models.includes( PR_GetString( key ) ); _fire.set( key, yes ); }
	return yes;

}

/**
 * True when fire goes out in water here: an active local single-player server (not dedicated, not a demo) on the
 * stock progs, in Newer Game.
 *
 * @returns {boolean} true when the rule applies
 */
export function SV_FireQuenchActive() {

	return sv.active === true && svs.maxclients === 1 && cls.state !== ca_dedicated && ! cls.demoplayback && PR_StockProgs() && R_NewerGame();

}

/**
 * Called by sv_phys.js SV_Physics_Toss before it moves a missile by `move`: a fireball in the air whose step would pass into
 * water or slime has `move` cut to the surface (the last dry point), so it touches nothing under the water; the
 * `SV_FireQuench` that follows the move puts it out there. Allocates nothing.
 *
 * @param {Object} ent the edict about to move (`v.model`, `v.origin` read)
 * @param {Float32Array} move this frame's move, Quake units (shortened in place when cut)
 */
export function SV_FireQuenchStep( ent, move ) {

	_pending = null;
	if ( ent == null || ent.free || ! SV_FireQuenchActive() || ! fireball( ent ) ) return;
	const o = ent.v.origin;
	_a[ 0 ] = o[ 0 ]; _a[ 1 ] = o[ 1 ]; _a[ 2 ] = o[ 2 ];
	if ( wet( SV_PointContents( _a ) ) ) {

		// already in liquid (born there): it does not move at all, and goes out where it is
		move[ 0 ] = move[ 1 ] = move[ 2 ] = 0;
		_surface[ 0 ] = o[ 0 ]; _surface[ 1 ] = o[ 1 ]; _surface[ 2 ] = o[ 2 ]; _pending = ent; _crossed = false;
		return;

	}
	// the first wet point along the step, sampled every `sample` units (the step may end beyond the water, in the floor
	// under it), then the surface between it and the last dry sample, halved `halvings` times
	const len = Math.hypot( move[ 0 ], move[ 1 ], move[ 2 ] ), n = Math.max( 1, Math.ceil( len / FIRE_QUENCH.sample ) );
	let found = false;
	for ( let k = 1; k <= n && ! found; k ++ ) {

		const f = k / n;
		_b[ 0 ] = o[ 0 ] + move[ 0 ] * f; _b[ 1 ] = o[ 1 ] + move[ 1 ] * f; _b[ 2 ] = o[ 2 ] + move[ 2 ] * f;
		if ( wet( SV_PointContents( _b ) ) ) found = true;
		else { _a[ 0 ] = _b[ 0 ]; _a[ 1 ] = _b[ 1 ]; _a[ 2 ] = _b[ 2 ]; }

	}
	if ( ! found ) return;
	for ( let k = 0; k < FIRE_QUENCH.halvings; k ++ ) {

		for ( let i = 0; i < 3; i ++ ) _m[ i ] = ( _a[ i ] + _b[ i ] ) / 2;
		if ( wet( SV_PointContents( _m ) ) ) { _b[ 0 ] = _m[ 0 ]; _b[ 1 ] = _m[ 1 ]; _b[ 2 ] = _m[ 2 ]; } else { _a[ 0 ] = _m[ 0 ]; _a[ 1 ] = _m[ 1 ]; _a[ 2 ] = _m[ 2 ]; }

	}
	for ( let i = 0; i < 3; i ++ ) { _surface[ i ] = _a[ i ]; move[ i ] = _a[ i ] - o[ i ]; }
	_pending = ent; _crossed = true;

}

/**
 * Called by sv_phys.js SV_Physics_Toss right after it moves a missile: puts out a fireball that reached the surface
 * its step was cut at, or that is in water or slime already. Newer Game only (`SV_FireQuenchActive`).
 *
 * @param {Object} ent the edict just moved (`v.model`, `v.origin` read)
 * @returns {boolean} true when the fireball went out (the edict is freed: the caller stops); false (nothing done) for
 * the rule not applying, a freed edict, any other model, a fireball stopped short of the surface (it struck something
 * above the water first), or one in the air
 */
export function SV_FireQuench( ent ) {

	const cut = _pending === ent; _pending = null;
	if ( ent == null || ent.free || ! SV_FireQuenchActive() || ! fireball( ent ) ) return false;
	const at = ent.v.origin;
	let crossed = false;
	if ( cut ) {

		// it went out only if the cut step took it all the way to the surface
		if ( Math.hypot( at[ 0 ] - _surface[ 0 ], at[ 1 ] - _surface[ 1 ], at[ 2 ] - _surface[ 2 ] ) > .125 ) return false;
		crossed = _crossed;

	} else if ( ! wet( SV_PointContents( at ) ) ) return false; // (moved into liquid some other way: out where it is)
	if ( sv.datagram.cursize <= MAX_DATAGRAM - 16 ) {

		MSG_WriteByte( sv.datagram, svc_temp_entity );
		MSG_WriteByte( sv.datagram, TE_KNIGHTSPIKE );
		MSG_WriteCoord( sv.datagram, at[ 0 ] ); MSG_WriteCoord( sv.datagram, at[ 1 ] ); MSG_WriteCoord( sv.datagram, at[ 2 ] );

	}
	if ( crossed ) SV_StartSound( ent, 0, FIRE_QUENCH.sound, 255, 1 ); // (born in liquid: no surface was crossed)
	ED_Free( ent );
	return true;

}
