/**
 * @module newer/gameplay/sv_quadmovement
 *
 * Quad Damage's movement bonus (owner request), worked out from the native state on every move.
 *
 * Owns: no state (no saved multiplier or timer).
 *
 * Errors: none.
 */
// Quad's owner-requested movement bonus is derived from native QC state on
// every move. No saved multiplier, cvar mutation or client-side timer exists.
import { IT_QUAD } from '../../engine/common/quakedef.js';
import { sv, MOVETYPE_WALK, FL_ONGROUND, FL_JUMPRELEASED } from '../../engine/server/server.js';
import { SV_FaceLocalActive } from './sv_faceevents.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { sv_gravity, host_frametime } from '../../engine/server/sv_phys.js';

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

export function SV_QuadMovementScale(player) {
	if (!SV_FaceLocalActive() || player!==sv.edicts?.[1] || player.free || player.v.health<=0 ||
		!(player.v.items & IT_QUAD) || player.v.movetype!==MOVETYPE_WALK) return 1;
	const timer=GetEdictFieldValue(player,'super_damage_finished');
	return timer && timer.accessor.getFloat(timer.ofs)>sv.time ? 1.5 : 1;
}

export function SV_QuadJumpBegin(player) {
	const v=player.v;
	return SV_QuadMovementScale(player)>1 && v.waterlevel<2 && v.button2 &&
		(v.flags & FL_ONGROUND) && (v.flags & FL_JUMPRELEASED) ? {velocity:v.velocity[2]} : null;
}

export function SV_QuadJumpEnd(player,before) {
	if (!before || SV_QuadMovementScale(player)===1) return;
	const v=player.v, impulse=v.velocity[2]-before.velocity;
	if (v.waterlevel>=2 || (v.flags & (FL_ONGROUND|FL_JUMPRELEASED)) || impulse<=0 || v.velocity[2]<=0) return;
	const field=GetEdictFieldValue(player,'gravity'),scale=field?.accessor.getFloat(field.ofs)||1;
	// Amplify one accepted QC jump, retaining unrelated inherited velocity.
	v.velocity[2]+=QuadJumpVelocity(impulse,sv_gravity.value*scale,host_frametime)-impulse;
}
