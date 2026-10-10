/**
 * @module newer/gameplay/sv_pinnedzombies
 *
 * Crucified zombies can be killed in Newer Game: their native spawn is opted into the normal damage path.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Pinned zombies use their original QuakeC spawn, health, bounds and crucifixion
// animation. The stock spawn skips walkmonster_start, leaving DAMAGE_NO set.
// Fresh maps and restored saves in Newer Game opt them into the existing
// weapon -> T_Damage -> zombie_die path. Already mortal/dead records stay intact.
import { R_NewerGame } from '../mode.js';
import { DAMAGE_NO, DAMAGE_AIM, MOVETYPE_NONE } from '../../engine/server/server.js';
import { PR_GetString, pr_functions } from '../../engine/progs/progs.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';

const CRUCIFIED = 1;
const functionName = index => pr_functions?.[ index ] ? PR_GetString( pr_functions[ index ].s_name ) : '';

export function SV_PinnedZombieSpawned( entity ) {

	const v = entity?.v;
	if ( ! R_NewerGame() || ! v || entity.free || PR_GetString( v.classname ) !== 'monster_zombie' ||
		( ( v.spawnflags | 0 ) & CRUCIFIED ) === 0 || v.movetype !== MOVETYPE_NONE ||
		! ( v.health > 0 ) || v.takedamage !== DAMAGE_NO ||
		! /^zombie_cruc[1-6]$/.test( functionName( v.think ) ) ) return false;

	// Monster callbacks are QC extension fields, not properties of entvars_t.
	// Resolve the loaded program's offsets through the existing field interface.
	const die = GetEdictFieldValue( entity, 'th_die' ), pain = GetEdictFieldValue( entity, 'th_pain' );
	if ( ! die || ! pain || functionName( die.accessor.getInt32( die.ofs ) ) !== 'zombie_die' ||
		functionName( pain.accessor.getInt32( pain.ofs ) ) !== 'zombie_pain' ) return false;

	// Native zombie_pain restores 60 health and starts standing pain animations.
	// Leave pain null (T_Damage already checks it) so actual damage accumulates
	// while the zombie stays pinned. Native zombie_die owns the head/gibs, sound,
	// removal and cleanup. MOVETYPE_NONE retains the native no-kill-count path.
	v.takedamage = DAMAGE_AIM;
	pain.accessor.setInt32( pain.ofs, 0 );
	return true;

}
