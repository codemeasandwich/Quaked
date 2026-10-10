/**
 * @module newer/gameplay/sv_quadmovement
 *
 * Quad Damage's movement bonus (owner request), worked out from the native state on every move.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Quad's owner-requested movement bonus is derived from native QC state on
// every move. No saved multiplier, cvar mutation or client-side timer exists.
import { IT_QUAD } from '../../engine/common/quakedef.js';
import { sv, MOVETYPE_WALK, FL_ONGROUND, FL_JUMPRELEASED } from '../../engine/server/server.js';
import { SV_FaceLocalActive } from './sv_faceevents.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { sv_gravity, host_frametime } from '../../engine/server/sv_phys.js';

/**
 * Finds the upward launch speed that makes a jump 1.5 times as high as one launched at `impulse`, under the engine's
 * discrete physics (a full gravity step is subtracted before each move), by 32 bisection steps on the stepped apex
 * height. With a non-positive input it falls back to the continuous answer, `impulse * sqrt(1.5)`.
 *
 * @param {number} impulse the native jump's upward velocity, Quake units per second
 * @param {number} gravity effective gravity, Quake units per second squared (`sv_gravity` times the entity's gravity
 *   scale)
 * @param {number} dt physics frame time in seconds (`host_frametime`)
 * @returns {number} the amplified upward velocity, Quake units per second
 */
export function QuadJumpVelocity(impulse,gravity,dt) {
	if (!(impulse>0 && gravity>0 && dt>0)) return impulse*Math.sqrt(1.5);
	// Native physics subtracts a full gravity step before moving. Match its
	// discrete apex, rather than the continuous v²/(2g) approximation.
	const step=gravity*dt;
	const height=v=>{const n=Math.floor(v/step);return dt*(n*v-step*n*(n+1)/2);};
	const wanted=height(impulse)*1.5;
	let lo=impulse,hi=impulse*1.5+step;
	for(let i=0;i<32;i++){const mid=(lo+hi)/2;if(height(mid)<wanted)lo=mid;else hi=mid;}
	return (lo+hi)/2;
}

/**
 * Returns the Quad Damage movement multiplier for a player, read fresh from native state on every move: 1.5 when the
 * local single-player Newer Game session is active (`SV_FaceLocalActive`), `player` is the first client edict, alive,
 * walking (`MOVETYPE_WALK`), carries `IT_QUAD` and its QuakeC `super_damage_finished` is later than `sv.time`; 1
 * otherwise. `SV_AirMove` and `SV_WaterMove` scale `sv_maxspeed` by it; the jump hooks use it as their gate.
 *
 * @param {edict_t} player the moving player edict
 * @returns {number} 1.5 or 1
 */
export function SV_QuadMovementScale(player) {
	if (!SV_FaceLocalActive() || player!==sv.edicts?.[1] || player.free || player.v.health<=0 ||
		!(player.v.items & IT_QUAD) || player.v.movetype!==MOVETYPE_WALK) return 1;
	const timer=GetEdictFieldValue(player,'super_damage_finished');
	return timer && timer.accessor.getFloat(timer.ofs)>sv.time ? 1.5 : 1;
}

/**
 * Records the player's vertical velocity before `PlayerPreThink` runs, when a Quad jump could start this frame: the
 * Quad bonus is active, the player is not swimming (`waterlevel` < 2), holds jump (`button2`), is on the ground and has
 * released jump since the last one. Called once per player physics frame by `SV_Physics_Client` (`sv_phys.js`) just
 * before `PlayerPreThink`, paired with `SV_QuadJumpEnd` just after it.
 *
 * @param {edict_t} player the player edict about to think
 * @returns {?{ velocity: number }} the pre-think vertical velocity (Quake units per second), or null when no Quad jump
 *   is possible
 */
export function SV_QuadJumpBegin(player) {
	const v=player.v;
	return SV_QuadMovementScale(player)>1 && v.waterlevel<2 && v.button2 &&
		(v.flags & FL_ONGROUND) && (v.flags & FL_JUMPRELEASED) ? {velocity:v.velocity[2]} : null;
}

/**
 * Amplifies the jump QuakeC just made in `PlayerPreThink`: if the player left the ground with jump now latched and
 * gained upward velocity, the gained part is replaced by `QuadJumpVelocity` of it (using `sv_gravity` times the
 * entity's `gravity` field, default 1, and `host_frametime`), retaining unrelated inherited velocity. Mutates
 * `player.v.velocity[2]`.
 *
 * @param {edict_t} player the player edict that just ran `PlayerPreThink`
 * @param {?{ velocity: number }} before the value `SV_QuadJumpBegin` returned this frame; null does nothing
 */
export function SV_QuadJumpEnd(player,before) {
	if (!before || SV_QuadMovementScale(player)===1) return;
	const v=player.v, impulse=v.velocity[2]-before.velocity;
	if (v.waterlevel>=2 || (v.flags & (FL_ONGROUND|FL_JUMPRELEASED)) || impulse<=0 || v.velocity[2]<=0) return;
	const field=GetEdictFieldValue(player,'gravity'),scale=field?.accessor.getFloat(field.ofs)||1;
	// Amplify one accepted QC jump, retaining unrelated inherited velocity.
	v.velocity[2]+=QuadJumpVelocity(impulse,sv_gravity.value*scale,host_frametime)-impulse;
}
