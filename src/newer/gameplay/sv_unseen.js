/**
 * @module newer/gameplay/sv_unseen
 *
 * The Ring of Shadows made to mean it (owner request 9 Oct 2026; Newer Game only): hunting monsters lose the player.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `program`, `world`, `fnDamage`, `fnAttack`, `lastShot`; 1
 * module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The Ring of Shadows, made to mean it (owner request, 9 Oct 2026; Newer Game only, Classic keeps Quake's rules).
//
// In stock Quake the Ring only stops monsters *noticing* the player (FindTarget refuses an invisible client). A monster
// already hunting the player keeps hunting, and one the player shoots knows exactly where the player is from then on (it
// takes the attacker as its enemy and reads the enemy's live origin every frame). Here:
//
//  * Unseen: while the player has the Ring, no monster keeps the player as its enemy. A monster that was hunting the player
//    when the Ring was picked up (or switched on) loses track at once and goes back to its stand or its patrol, as a monster
//    does in stock Quake when its enemy dies (ai_run: enemy = world, then th_walk with a movetarget, else th_stand).
//  * Heard, not seen: a monster the player hurts while unseen turns on the place the player was when they fired (their
//    origin at their last W_Attack), not on the player. It hunts and attacks that spot: an invisible marker entity (its
//    `enemy`) that cannot be damaged and is not solid. After SPOT_LIFE seconds without a new hit, or once the player is seen
//    again (the Ring ends), the marker goes and the monster gives up as above; a later hit gives it a new spot.
//
// Everything is the game's own AI working on a different enemy: no monster code is replaced. Local single player with the
// stock progs (the field and function names are the game's), Newer Game only. Markers in a saved game are picked up again.

import { sv, svs, FL_MONSTER } from '../../engine/server/server.js';
import { R_NewerGame } from '../mode.js';
import { pr_crc, pr_functions, pr_global_struct, pr_globals_int, PR_GetString, PROG_TO_EDICT, EDICT_TO_PROG } from '../../engine/progs/progs.js';
import { OFS_PARM0 } from '../../engine/progs/pr_comp.js';
import { GetEdictFieldValue, ED_FindFunction, ED_Alloc, ED_Free, ED_NewString } from '../../engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../../engine/progs/pr_exec.js';
import { IT_INVISIBILITY } from '../../engine/common/quakedef.js';

export const SPOT_LIFE = 5;          // seconds a monster keeps attacking where the player fired from
export const MARKER = 'unseen_spot'; // the marker's classname
const OFS_PARM2 = OFS_PARM0 + 6;

let program = null, world = null, fnDamage = null, fnAttack = null;
let lastShot = null; // { origin, time }: where the player was at their last W_Attack
const markers = new Map(); // marker edict -> expiry time

function functions() {
	if ( program !== pr_functions ) { program = pr_functions; fnDamage = ED_FindFunction( 'T_Damage' ); fnAttack = ED_FindFunction( 'W_Attack' ); }
	if ( program !== pr_functions || world !== sv.edicts ) { world = sv.edicts; markers.clear(); lastShot = null; } // (a new map or a loaded game: a new entity list)
}
const player = () => sv.edicts?.[ 1 ] ?? null;
/**
 * True when the Ring's Newer Game rules apply: an active local single-player server on the stock progs (CRC 24778)
 * in Newer Game. Checked each `SV_UnseenFrame`; outside it every marker is removed.
 *
 * @returns {boolean} true when unseen rules are in force
 */
export function SV_UnseenActive() {
	return sv.active === true && svs.maxclients === 1 && pr_crc === 24778 && R_NewerGame();
}
const unseen = p => !! p && ! p.free && p.v.health > 0 && ( ( p.v.items | 0 ) & IT_INVISIBILITY ) !== 0;
function field( e, name, value ) {
	const f = GetEdictFieldValue( e, name ); if ( ! f ) return 0;
	if ( value !== undefined ) f.accessor.setInt32( f.ofs, value );
	return f.accessor.getInt32( f.ofs );
}
function run( e, fn ) {
	if ( ! fn ) return;
	const self = pr_global_struct.self, time = pr_global_struct.time;
	try { pr_global_struct.self = EDICT_TO_PROG( e ); pr_global_struct.time = sv.time; PR_ExecuteProgram( fn ); } finally { pr_global_struct.self = self; pr_global_struct.time = time; }
}

// The monster gives up its enemy, as stock ai_run does when the enemy is dead: its patrol if it has one, else it stands.
function giveUp( m ) {
	m.v.enemy = 0;
	const old = PROG_TO_EDICT( field( m, 'oldenemy' ) );
	if ( old && ( old === player() || PR_GetString( old.v.classname ) === MARKER ) ) field( m, 'oldenemy', 0 );
	const movetarget = field( m, 'movetarget' );
	m.v.goalentity = movetarget;
	const walk = field( m, 'th_walk' ), stand = field( m, 'th_stand' );
	run( m, movetarget ? walk : stand );
}

function monsters() { return ( sv.edicts || [] ).filter( e => e && ! e.free && ( e.v.flags & FL_MONSTER ) && e.v.health > 0 ); }

function makeMarker( origin ) {
	const e = ED_Alloc();
	e.v.classname = ED_NewString( MARKER );
	e.v.origin = origin.slice(); e.v.view_ofs = [ 0, 0, 22 ]; e.v.mins = [ 0, 0, 0 ]; e.v.maxs = [ 0, 0, 0 ];
	e.v.solid = 0; e.v.movetype = 0; e.v.takedamage = 0; e.v.health = 100; e.v.modelindex = 0;
	markers.set( e, sv.time + SPOT_LIFE );
	return e;
}
function freeMarker( e ) {
	for ( const m of monsters() ) if ( PROG_TO_EDICT( m.v.enemy ) === e ) giveUp( m );
	markers.delete( e ); if ( ! e.free ) ED_Free( e );
}

/**
 * QuakeC function hooks (pr_exec.js): the player's W_Attack (where they fired from) and T_Damage (a monster they
 * hurt). Called by PR_EnterFunction for every QuakeC function, so it does cheap checks first and no progs lookups
 * outside a local stock single-player game. Entering W_Attack as the player records `lastShot` (origin and time);
 * entering T_Damage with the player as attacker and a monster as target returns a token for
 * `SV_UnseenFunctionLeave`.
 *
 * @param {dfunction_t} fn the function being entered
 * @returns {?{ target: edict_t, p: edict_t }} the hurt monster and the player, or null when the call is not of interest
 */
export function SV_UnseenFunctionEnter( fn ) {
	// (called for every QuakeC function: cheap checks first, and no progs lookups outside a local stock game)
	if ( sv.active !== true || svs.maxclients !== 1 || pr_crc !== 24778 ) return null;
	if ( program !== pr_functions || world !== sv.edicts ) functions();
	if ( fn !== fnDamage && fn !== fnAttack ) return null;
	if ( ! R_NewerGame() ) return null;
	const p = player();
	if ( fn === fnAttack ) { if ( PROG_TO_EDICT( pr_global_struct.self ) === p ) lastShot = { origin: Array.from( p.v.origin ), time: sv.time }; return null; }
	const target = PROG_TO_EDICT( pr_globals_int[ OFS_PARM0 ] ), attacker = PROG_TO_EDICT( pr_globals_int[ OFS_PARM2 ] );
	if ( attacker !== p || ! target || target === p || ! ( target.v.flags & FL_MONSTER ) ) return null;
	return { target, p };
}
/**
 * Called by PR_LeaveFunction once T_Damage has run: when the hurt monster survived and turned on the unseen player
 * (wearing the Ring), points its enemy and goalentity at an invisible `unseen_spot` marker where the player fired
 * (their origin at a W_Attack under 3 s ago, else where they stand now) and clears an oldenemy that was the player.
 * One marker per firing position (within 1 unit): a blast that hurts several monsters sends them all to the same
 * spot, and a new hit there extends its life to SPOT_LIFE (5) seconds from now. Markers are ordinary edicts and are
 * saved with the game.
 *
 * @param {?{ target: edict_t, p: edict_t }} token the value `SV_UnseenFunctionEnter` returned (null does nothing)
 * @throws {Error} Host_Error 'ED_Alloc: no free edicts' when a new marker cannot be allocated
 */
export function SV_UnseenFunctionLeave( token ) {
	if ( ! token ) return;
	const { target, p } = token;
	if ( target.free || target.v.health <= 0 || ! unseen( p ) || PROG_TO_EDICT( target.v.enemy ) !== p ) return;
	// one marker per firing position: a blast that hurts several monsters sends them all to the same spot
	const where = lastShot && sv.time - lastShot.time < 3 ? lastShot.origin : Array.from( p.v.origin );
	let spot = [ ...markers.keys() ].find( e => ! e.free && [ 0, 1, 2 ].every( i => Math.abs( e.v.origin[ i ] - where[ i ] ) < 1 ) );
	if ( spot ) markers.set( spot, sv.time + SPOT_LIFE ); else spot = makeMarker( where );
	target.v.enemy = EDICT_TO_PROG( spot ); target.v.goalentity = EDICT_TO_PROG( spot );
	if ( PROG_TO_EDICT( field( target, 'oldenemy' ) ) === p ) field( target, 'oldenemy', 0 );
}

/**
 * Every server frame (Host_ServerFrame, after physics; also while a menu holds the game). Outside `SV_UnseenActive`
 * removes all markers. Otherwise adopts markers from a loaded game, makes every monster hunting the unseen player
 * give up (back to its patrol via th_walk if it has a movetarget, else th_stand, as stock ai_run does when the enemy
 * dies), and removes markers that are freed, expired, or no longer needed because the player is seen again; their
 * monsters give up too. Forgets all module state when the progs or the entity list changes (a new map or loaded game).
 */
export function SV_UnseenFrame() {
	functions();
	if ( ! SV_UnseenActive() ) { for ( const e of [ ...markers.keys() ] ) freeMarker( e ); return; }
	// markers from a loaded game
	for ( const e of sv.edicts || [] ) if ( e && ! e.free && ! markers.has( e ) && PR_GetString( e.v.classname ) === MARKER ) markers.set( e, sv.time + SPOT_LIFE );
	const p = player(), hidden = unseen( p );
	if ( hidden ) for ( const m of monsters() ) if ( PROG_TO_EDICT( m.v.enemy ) === p ) giveUp( m );
	for ( const [ e, until ] of [ ...markers ] ) if ( e.free || ! hidden || sv.time >= until ) freeMarker( e );
}

/**
 * Forgets the tracked markers, the last shot and the cached progs functions, without freeing any marker edict (the
 * next `SV_UnseenFrame` picks surviving markers up again). Used by the tests to start fresh.
 */
export function SV_UnseenReset() { markers.clear(); lastShot = null; program = null; }
/**
 * The marker edicts currently tracked (tests read it).
 *
 * @returns {Array<edict_t>} a fresh array
 */
export const SV_UnseenMarkers = () => [ ...markers.keys() ];
