/**
 * @module newer/gameplay/sv_pronezombie
 *
 * A knocked-down zombie can be finished off (card [40]; Newer Game only).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `program`, `lying`, `standing`, `waking`, `nothing`, `zombieFns`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// A knocked-down zombie can be finished off (card [40], owner request). Newer Game only; Classic keeps Quake's.
//
// In the stock progs a zombie hit for 25 or more at once falls (zombie_paine1..12). At paine10 it goes SOLID_NOT and lies there:
// paine11 waits 5 seconds and paine12 tries to stand (SOLID_SLIDEBOX and a test move; if something is in the way it goes
// SOLID_NOT again and waits once more). While it is SOLID_NOT nothing can touch it: hitscan traces pass through, missiles fly
// over it, and T_RadiusDamage's findradius skips it. So it always gets up again.
//
// Here, while it lies there, it is a low solid box instead (SOLID_BBOX, from its feet to 12 units up, the size it stood in
// across): shots, nails and missiles hit it, a blast reaches it, and a player still steps over it (a step is 18 units). What a hit
// does is the game's own rule, unchanged: zombie_pain resets its health to 60 on every hit, so only 60 or more at once kills it
// (a rocket or a grenade, a quad blast), and then the game's own zombie_die throws its head and gibs, once, and counts the kill.
// A smaller hit does nothing, as before, and it gets up on time. When it tries to stand, it is given back its standing box and
// SOLID_NOT first, so the game's own stand-up test runs exactly as written; if that fails it lies down again, still hittable.
//
// Being hittable while down opens a path the stock zombie never took: T_Damage turns a monster on a new attacker (FoundTarget,
// which starts it running). A lying zombie does not get up for that: its enemy changes (T_Damage set it), FoundTarget is not run,
// and it stands on its own time and then goes for whoever hit it. And should any other zombie behaviour run while it is still in
// its lying box, it is given its standing box first. A lying box is only made where it fits: never around a player or anything
// else (then it stays SOLID_NOT, as in Quake). Lying solid, it also stops projectiles, touches triggers if moved, and blocks a
// closing door (whose damage then does nothing to it, as above).
//
// Everything is the game's own state: solid, mins and maxs are entity fields, saved and loaded with the game. The standing box is
// given back at its stand-up in any mode, so a Newer save loaded in Classic never leaves a short zombie. Local single player with
// the stock progs (the frame function names are the game's).

import { sv, svs } from '../../engine/server/server.js';
import { R_NewerGame } from '../mode.js';
import { pr_crc, pr_functions, pr_global_struct, PR_GetString, PROG_TO_EDICT } from '../../engine/progs/progs.js';
import { ED_FindFunction } from '../../engine/progs/pr_edict.js';
import { SV_LinkEdict, SV_Move, MOVE_NORMAL } from '../../engine/server/world.js';

export const SOLID_NOT = 0, SOLID_BBOX = 2, SOLID_SLIDEBOX = 3;
export const STAND = Object.freeze( { mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, 40 ] } ); // the zombie's own setsize
export const PRONE = Object.freeze( { mins: [ - 16, - 16, - 24 ], maxs: [ 16, 16, - 12 ] } );

let program = null, lying = null, standing = null, waking = null, nothing = null, zombieFns = null;
function functions() {
	if ( program === pr_functions ) return;
	program = pr_functions;
	lying = new Set( [ 'zombie_paine10', 'zombie_paine11', 'zombie_paine12' ].map( n => ED_FindFunction( n ) ).filter( Boolean ) );
	standing = ED_FindFunction( 'zombie_paine12' );
	waking = ED_FindFunction( 'FoundTarget' ); nothing = ED_FindFunction( 'SUB_Null' );
	// (its behaviours as a standing monster: walking, running, standing, attacking, the lesser pain animations; not zombie_pain,
	// which every hit runs and which returns at once while it lies, nor its fall and rise)
	zombieFns = new Set( pr_functions.filter( f => f && /^zombie_(stand|walk|run|att|pain[a-d])/.test( PR_GetString( f.s_name ) ) ) );
}
/**
 * Whether the prone-zombie rule applies now: an active local single-player server running the stock progs
 * (`pr_crc` 24778) in the Newer Game.
 *
 * @returns {boolean} true when lying zombies are made hittable
 */
export const SV_ProneZombieActive = () => sv.active === true && svs.maxclients === 1 && pr_crc === 24778 && R_NewerGame();
const zombie = e => !! e && ! e.free && e.v.health > 0 && PR_GetString( e.v.classname ) === 'monster_zombie' && PR_GetString( e.v.model ) === 'progs/zombie.mdl';
function box( e, b, solid ) { e.v.mins = b.mins.slice(); e.v.maxs = b.maxs.slice(); for ( let a = 0; a < 3; a ++ ) e.v.size[ a ] = b.maxs[ a ] - b.mins[ a ]; e.v.solid = solid; SV_LinkEdict( e, false ); }
/**
 * Whether `e` is a live stock zombie currently lying in its low hittable box (SOLID_BBOX with the PRONE maxs). Used by
 * the autoaim scan in pr_cmds.js (via the hooks table) to aim at the middle of the lying box instead of its origin.
 *
 * @param {?edict_t} e the entity to test (null or free gives false)
 * @returns {boolean} true while the zombie lies in its PRONE box
 */
export const SV_ZombieProne = e => zombie( e ) && e.v.solid === SOLID_BBOX && e.v.maxs[ 2 ] === PRONE.maxs[ 2 ];
// does the lying box fit where it lies (nothing solid in it but the zombie itself)?
function fits( e ) { const t = SV_Move( e.v.origin, PRONE.mins, PRONE.maxs, e.v.origin, MOVE_NORMAL, e ); return ! t.startsolid && ! t.allsolid; }

/**
 * QuakeC function hook (pr_exec.js): called from `PR_EnterFunction` for every QC function entered, before its first
 * statement. Only acts for a live stock zombie as `self`, in local single player with the stock progs:
 * - entering `FoundTarget` while it lies: skips the function (jumps to `SUB_Null`), so a hit does not make it get up;
 *   its enemy is already set by T_Damage, so it goes for that attacker when it stands on its own time;
 * - entering `zombie_paine12` (the stand-up) while prone, in any mode: restores the STAND box with SOLID_NOT so the
 *   game's own stand-up test runs exactly as written;
 * - entering any other standing behaviour while prone: restores the STAND box with SOLID_SLIDEBOX first.
 * Mutates `self`'s mins, maxs, size and solid and relinks it.
 *
 * @param {object} f the dfunction_t being entered
 * @returns {?{skip: number}|?{self: edict_t}} `{skip}`: the statement index (minus one) `PR_EnterFunction` jumps to;
 *   `{self}`: a token kept on the QC stack frame for `SV_ProneZombieLeave`, given when entering zombie_paine10..12 in
 *   the Newer Game; null when nothing is to be done
 */
export function SV_ProneZombieEnter( f ) {
	if ( sv.active !== true || svs.maxclients !== 1 || pr_crc !== 24778 ) return null;
	functions();
	if ( f !== waking && ! zombieFns.has( f ) && ! lying.has( f ) ) return null;
	const self = PROG_TO_EDICT( pr_global_struct.self );
	if ( ! zombie( self ) ) return null;
	const prone = SV_ZombieProne( self );
	// turned on a new attacker while lying: the enemy is already set, it does not get up for it (stock: it could not be hit)
	if ( f === waking ) return prone && nothing ? { skip: nothing.first_statement - 1 } : null;
	// standing up (any mode): the game's own test, from the state it expects (non-solid, its standing box)
	if ( prone && f === standing ) box( self, STAND, SOLID_NOT );
	// any other zombie behaviour while still in the lying box: its standing box first
	else if ( prone && ! lying.has( f ) ) box( self, STAND, SOLID_SLIDEBOX );
	return lying.has( f ) && R_NewerGame() ? { self } : null;
}
/**
 * QuakeC function hook (pr_exec.js): called from `PR_LeaveFunction` with the token `SV_ProneZombieEnter` returned for
 * the same frame. After zombie_paine10..12 leaves the zombie SOLID_NOT (still down, or its stand-up test failed), gives
 * it the low PRONE box as SOLID_BBOX so shots, missiles and blasts reach it, but only where that box fits (nothing
 * solid in it but the zombie itself); otherwise it stays SOLID_NOT, as in Quake. The box lives in the entity's own
 * saved fields.
 *
 * @param {?{self: edict_t}} token the enter token, or null (does nothing)
 */
export function SV_ProneZombieLeave( token ) {
	if ( ! token ) return;
	const self = token.self;
	// still down (or it could not stand): lying there, hittable, where the box fits
	if ( zombie( self ) && self.v.solid === SOLID_NOT && fits( self ) ) box( self, PRONE, SOLID_BBOX );
}
