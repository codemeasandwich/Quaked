/**
 * @module newer/gameplay/sv_firequench
 *
 * Fire goes out in water (owner request 11 Oct 2026, card [FB3]; Newer Game only): a flying fireball that enters
 * water or slime is put out at the surface with a small burst, and stops there.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Fire goes out in water (owner request, 11 Oct 2026, card [FB3]; Newer Game only, Classic keeps Quake's rules).
//
// Quake's fireballs are missiles drawn with progs/lavaball.mdl (misc_fireball's lava spurts, Chthon's balls) and the
// Death Knight's fan shots (progs/k_spike.mdl); in Newer Game both are drawn as the owner's fireballs.html fireball
// (r_lavaballs.js). In stock Quake they fly on through water as through air: a Death Knight's shot still reaches a
// player hiding underwater. The owner's rule, chosen as real gameplay over a picture-only change: fire cannot travel
// underwater. Here, each server frame SV_Physics_Toss moves a missile (sv_phys.js), it asks `SV_FireQuench`; a
// fireball whose new origin is in water or slime is removed (ED_Free, as QuakeC's own `remove`) after:
//
//  * a small burst at the surface: TE_KNIGHTSPIKE at the point where its path crossed into the liquid (found by
//    halving the step between the old and new origin). The client draws that event, in Newer Game, as the supplied
//    fireball's own impact (sparks, a ring and smoke, render.js R_KnightSpikeImpact -> r_lavaballs.js
//    R_LavaBallImpact, which lays the ring flat on a liquid surface), with the Death Knight's hit sizzle;
//  * the splash stock Quake plays when a missile enters water (misc/h2ohit1.wav, as SV_CheckWaterTransition does).
//
// No damage is dealt: the fire went out. A fireball born in liquid goes out at once. Lava is not water: misc_fireball's
// balls rise out of lava and fall back into it unchanged. Nothing else is touched: other missiles, monsters, the
// player and every rule outside Newer Game are the game's own.
import { sv } from '../../engine/server/server.js';
import { SV_PointContents } from '../../engine/server/world.js';
import { SV_StartSound } from '../../engine/server/sv_main.js';
import { ED_Free } from '../../engine/progs/pr_edict.js';
import { PR_GetString } from '../../engine/progs/progs.js';
import { MSG_WriteByte, MSG_WriteCoord } from '../../engine/common/common.js';
import { svc_temp_entity, TE_KNIGHTSPIKE } from '../../engine/common/protocol.js';
import { CONTENTS_WATER, CONTENTS_SLIME } from '../../engine/common/bspfile.js';
import { MAX_DATAGRAM } from '../../engine/common/quakedef.js';
import { R_NewerGame } from '../mode.js';

export const FIRE_QUENCH = Object.freeze( {
	models: Object.freeze( [ 'progs/lavaball.mdl', 'progs/k_spike.mdl' ] ), // the fireballs
	sound: 'misc/h2ohit1.wav', // stock Quake's missile-into-water splash (precached by world.qc)
	halvings: 8                // the surface found to 1/256 of the frame's step
} );

const wet = c => c === CONTENTS_WATER || c === CONTENTS_SLIME;
const _a = [ 0, 0, 0 ], _b = [ 0, 0, 0 ], _m = [ 0, 0, 0 ];

/**
 * Called by sv_phys.js SV_Physics_Toss right after it moves a missile: puts out a fireball that is now in water or
 * slime. Newer Game only.
 *
 * @param {Object} ent the edict just moved (`v.model`, `v.origin` read)
 * @param {ArrayLike<number>} from its origin before this frame's move
 * @returns {boolean} true when the fireball went out (the edict is freed: the caller stops); false (nothing done) for
 * Classic, an inactive server, a freed edict, any other model, or a fireball not in water or slime
 */
export function SV_FireQuench( ent, from ) {

	if ( ent == null || ent.free || sv.active !== true || ! R_NewerGame() ) return false;
	if ( ! FIRE_QUENCH.models.includes( PR_GetString( ent.v.model ) ) ) return false;
	const to = ent.v.origin;
	if ( ! wet( SV_PointContents( to ) ) ) return false;
	// the surface: the last dry point of the step (the new origin itself when the step started in liquid)
	_a[ 0 ] = from[ 0 ]; _a[ 1 ] = from[ 1 ]; _a[ 2 ] = from[ 2 ];
	_b[ 0 ] = to[ 0 ]; _b[ 1 ] = to[ 1 ]; _b[ 2 ] = to[ 2 ];
	if ( ! wet( SV_PointContents( _a ) ) ) {

		for ( let k = 0; k < FIRE_QUENCH.halvings; k ++ ) {

			for ( let i = 0; i < 3; i ++ ) _m[ i ] = ( _a[ i ] + _b[ i ] ) / 2;
			if ( wet( SV_PointContents( _m ) ) ) { _b[ 0 ] = _m[ 0 ]; _b[ 1 ] = _m[ 1 ]; _b[ 2 ] = _m[ 2 ]; } else { _a[ 0 ] = _m[ 0 ]; _a[ 1 ] = _m[ 1 ]; _a[ 2 ] = _m[ 2 ]; }

		}

	} else { _a[ 0 ] = to[ 0 ]; _a[ 1 ] = to[ 1 ]; _a[ 2 ] = to[ 2 ]; }
	if ( sv.datagram.cursize <= MAX_DATAGRAM - 16 ) {

		MSG_WriteByte( sv.datagram, svc_temp_entity );
		MSG_WriteByte( sv.datagram, TE_KNIGHTSPIKE );
		MSG_WriteCoord( sv.datagram, _a[ 0 ] ); MSG_WriteCoord( sv.datagram, _a[ 1 ] ); MSG_WriteCoord( sv.datagram, _a[ 2 ] );

	}
	ent.v.origin = [ _a[ 0 ], _a[ 1 ], _a[ 2 ] ]; // (the splash is heard where the fire went out)
	SV_StartSound( ent, 0, FIRE_QUENCH.sound, 255, 1 );
	ED_Free( ent );
	return true;

}
