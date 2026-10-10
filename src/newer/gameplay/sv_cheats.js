/**
 * @module newer/gameplay/sv_cheats
 *
 * Options > Cheats (card [L1]): the Ring, Quad and Pentagram as switches that stay on, and the all-weapons give.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Cheats are offered only in a local single-player game (`SV_CheatsAvailable`).
 */
// Cheat power-ups (Options > Cheats): the Ring of Shadows, Quad Damage and the Pentagram of Protection as switches that stay
// on until switched off, and the all-weapons give, all applied at once so the game under the menu shows them straight away.
//
// A single-player game stops its physics while a menu is open, so the game's own routes (`impulse 255`, `impulse 9`) would
// only act when the menu closed. These commands change the player's state directly instead, the way the game's own pickups
// and CheatCommand do; the next client update (sent every frame, also while paused) carries it to the picture: the power-up
// vision, the screen tint and the status bar.
//
//   cheat_power ring|quad|pentagram   switch one on or off
//   cheat_weapons                     all weapons and ammunition (the game's own CheatCommand)
//
// A power that is switched on is a real power-up of the game: its item bit and its timer, so the game's own rules apply (the
// Ring hides the player from monsters and shows the eyes, the Quad multiplies damage, the Pentagram stops it). Its timer is
// kept 30 seconds ahead every frame, so it never runs out and never plays its running-out warning. Switching it off clears
// the bit, the timer and the glow at once. The switches are kept with the player in a saved game; a death clears the
// power-ups as usual and the switch puts them back once the respawn has finished. Local single player only.

import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../../engine/common/cmd.js';
import { Con_Printf } from '../../engine/common/console.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { sv, svs } from '../../engine/server/server.js';
import { IT_INVISIBILITY, IT_QUAD, IT_INVULNERABILITY } from '../../engine/common/quakedef.js';
import { pr_global_struct, pr_functions, EDICT_TO_PROG } from '../../engine/progs/progs.js';
import { ED_FindFunction, GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { PR_ExecuteProgram } from '../../engine/progs/pr_exec.js';

export const CHEAT_POWERS = Object.freeze( {
	ring: { bit: IT_INVISIBILITY, timer: 'invisible_finished', extra: [ 'invisible_time', 'invisible_sound' ], glow: 0 },
	quad: { bit: IT_QUAD, timer: 'super_damage_finished', extra: [ 'super_time', 'super_sound' ], glow: 8 },        // EF_DIMLIGHT
	pentagram: { bit: IT_INVULNERABILITY, timer: 'invincible_finished', extra: [ 'invincible_time', 'invincible_sound' ], glow: 8 }
} );
const AHEAD = 30, REFRESH = 20; // seconds the timer is kept ahead, and below which it is topped up

/**
 * Whether cheats may act now: a running local single-player game (one client, `deathmatch` and `coop` both 0).
 * Checked by every cheat command, every frame by `SV_CheatsFrame`, and before each switch.
 *
 * @returns {boolean} true when the server is active with `svs.maxclients` 1 and neither deathmatch nor coop is set
 */
export function SV_CheatsAvailable() {

	return sv.active === true && svs.maxclients === 1 && Cvar_VariableValue( 'deathmatch' ) === 0 && Cvar_VariableValue( 'coop' ) === 0;

}

const player = () => sv.edicts?.[ 1 ] ?? null;
function field( e, name, value ) {

	const f = GetEdictFieldValue( e, name );
	if ( ! f ) return undefined;
	if ( value !== undefined ) f.accessor.setFloat( f.ofs, value );
	return f.accessor.getFloat( f.ofs );

}
const alive = p => p.v.health > 0 && ! p._respawn?.sequence;

// is the power switched on (the switch, not whether the player has it this instant)
export const SV_CheatPowerOn = ( name, p = player() ) => !! p && ( ( p._cheatPowers | 0 ) & ( 1 << Object.keys( CHEAT_POWERS ).indexOf( name ) ) ) !== 0;

function grant( p, power ) {

	p.v.items = ( p.v.items | 0 ) | power.bit;
	if ( ( field( p, power.timer ) ?? 0 ) < sv.time + REFRESH ) field( p, power.timer, sv.time + AHEAD );

}

function revoke( p, power ) {

	p.v.items = ( p.v.items | 0 ) & ~ power.bit;
	field( p, power.timer, 0 );
	for ( const name of power.extra ) field( p, name, 0 );
	// the glow is the Quad's or the Pentagram's: it goes when neither is left
	const lit = Object.values( CHEAT_POWERS ).some( other => other.glow && ( p.v.items & other.bit ) );
	if ( power.glow && ! lit ) p.v.effects = ( p.v.effects | 0 ) & ~ power.glow;
	if ( power.bit === IT_INVISIBILITY && sv.models ) { const i = sv.model_precache.indexOf( 'progs/player.mdl' ); if ( i > 0 && p.v.health > 0 ) p.v.modelindex = i; }

}

/**
 * Flips one cheat power-up switch for the player (edict 1), run by the `cheat_power` console command that the
 * Options > Cheats menu entries send. Switching on sets the power's item bit and keeps its timer 30 seconds ahead (and
 * lights the Quad's or Pentagram's glow, `EF_DIMLIGHT`) while the player is alive and not mid-respawn; switching off
 * clears the bit, the timer, its `*_time`/`*_sound` fields and the glow (when no other glowing power is left), and
 * restores the player model after the Ring. Mutates the player's `_cheatPowers` bit mask (ring 1, quad 2, pentagram
 * 4), which `ED_Write` keeps in a saved game as `_cheat_powers`.
 *
 * @param {string} name 'ring', 'quad' or 'pentagram' (a key of `CHEAT_POWERS`)
 * @returns {boolean} true when the switch is now on; false when it is now off, or when the name is unknown, there is
 *   no player or cheats are unavailable (nothing changed)
 */
export function SV_CheatPower( name ) {

	const power = CHEAT_POWERS[ name ], p = player();
	if ( ! power || ! p || ! SV_CheatsAvailable() ) return false;
	const bit = 1 << Object.keys( CHEAT_POWERS ).indexOf( name );
	p._cheatPowers = ( p._cheatPowers | 0 ) ^ bit;
	if ( p._cheatPowers & bit ) { if ( alive( p ) ) grant( p, power ); } else revoke( p, power );
	if ( power.glow && ( p._cheatPowers & bit ) && alive( p ) ) p.v.effects = ( p.v.effects | 0 ) | power.glow;
	return ( p._cheatPowers & bit ) !== 0;

}

/**
 * Keeps the switched-on powers on, called every server frame by `Host_ServerFrame`, also while a menu holds the game
 * (so the picture under it shows them at once), and so puts them back after a death once the respawn has finished.
 * Tops a power's timer back up to 30 seconds ahead whenever it falls below 20 seconds, so it never runs out and never
 * plays its running-out warning. Does nothing without a live player, a switch on, or cheats available.
 */
export function SV_CheatsFrame() {

	const p = player();
	if ( ! p || ! p._cheatPowers || ! SV_CheatsAvailable() || ! alive( p ) ) return;
	Object.entries( CHEAT_POWERS ).forEach( ( [ name, power ] ) => { if ( SV_CheatPowerOn( name, p ) ) grant( p, power ); } );

}

/**
 * Gives every weapon and full ammunition, run by the `cheat_weapons` console command (Options > Cheats). Runs the
 * game's own QuakeC `CheatCommand` (what `impulse 9` does) at once with `self` set to the player and `time` to
 * `sv.time`, then restores both globals, so it acts even while a menu stops the game's physics.
 *
 * @returns {boolean} true when `CheatCommand` ran; false when there is no live player, the progs have no
 *   `CheatCommand`, or cheats are unavailable
 * @throws {Error} from `PR_ExecuteProgram` when the QuakeC hits a runtime error (`PR_RunError` ends the game with
 *   `Host_Error`)
 */
export function SV_CheatWeapons() {

	const p = player(), f = ED_FindFunction( 'CheatCommand' );
	if ( ! p || ! f || ! SV_CheatsAvailable() || ! alive( p ) ) return false;
	const self = pr_global_struct.self, time = pr_global_struct.time;
	try { pr_global_struct.self = EDICT_TO_PROG( p ); pr_global_struct.time = sv.time; PR_ExecuteProgram( pr_functions.indexOf( f ) ); } finally { pr_global_struct.self = self; pr_global_struct.time = time; }
	return true;

}

/**
 * Registers the `cheat_power ring|quad|pentagram` and `cheat_weapons` console commands, once at start-up from
 * `Host_InitLocal` (host.js). The commands print the usage, 'Cheats need a single player game.', or the power's new
 * state ('ring ON'/'ring OFF') to the console.
 */
export function SV_CheatsInit() {

	Cmd_AddCommand( 'cheat_power', () => {

		const name = Cmd_Argc() > 1 ? Cmd_Argv( 1 ) : '';
		if ( ! CHEAT_POWERS[ name ] ) { Con_Printf( 'usage: cheat_power ring|quad|pentagram\n' ); return; }
		if ( ! SV_CheatsAvailable() ) { Con_Printf( 'Cheats need a single player game.\n' ); return; }
		Con_Printf( '%s %s\n', name, SV_CheatPower( name ) ? 'ON' : 'OFF' );

	} );
	Cmd_AddCommand( 'cheat_weapons', () => { if ( ! SV_CheatWeapons() ) Con_Printf( 'Cheats need a single player game.\n' ); } );

}
