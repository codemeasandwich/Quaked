/**
 * @module newer/render/r_flashlightrun
 *
 * When the flashlight and the welcome aids are on, per run of the game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `active`, `map`, `selectedSkill`, `noticeShown`, `lastOn`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Per-run welcome aids policy, separate from the shoulder beam and title demo.
// Explicit map/restart begins a run; serverinfo/seamless travel only updates its
// map identity. Native START entrance/skill triggers choose once per choice,
// rather than every touch, so it cannot undo a player's manual switch-off.
import { Cvar_FindVar, Cvar_SetValue, Cvar_VariableValue } from '../../engine/common/cvar.js';
import { Con_Printf } from '../../engine/common/common.js';

let active = false, map = '', selectedSkill = null, noticeShown = false;
let lastOn = false;
const mapName = value => String( value || '' ).toLowerCase().replace( /^maps\//, '' ).replace( /\.bsp$/, '' );
function automatic( on, crosshairOn ) {
	if ( Cvar_FindVar( 'r_flashlight' ) ) Cvar_SetValue( 'r_flashlight', on ? 1 : 0 );
	if ( Cvar_FindVar( 'crosshair' ) ) Cvar_SetValue( 'crosshair', crosshairOn ? 1 : 0 );
	lastOn = on;
}
/**
 * Begins a run: called by `Host_Map_f` (host_cmd.js) after an explicit `map` command has connected (changelevel and
 * seamless travel never enter this fresh-map path). Clears the chosen skill and the shown notice, and takes the
 * current flashlight as the baseline. Only a fresh welcome start (Newer Game on the 'start' map) resets the aids, turning
 * the flashlight and crosshair off until a skill hall chooses; direct level starts/restarts retain the current choices,
 * just like load, travel and respawn.
 *
 * @param {string} name the map being started ('start' or 'maps/start.bsp' style; case and path are ignored)
 * @param {number} skill the game's current skill (not used for the decision)
 * @param {boolean} newer true when connected with `r_hdr` on (Newer Game); only then is the run active
 */
export function R_FlashlightNewRun( name, skill, newer ) {
	active = newer === true; map = mapName( name ); selectedSkill = null; noticeShown = false;
	lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0;
	// Only a fresh welcome start resets the aids. Direct level starts/restarts
	// retain the current choices, just like load, travel and respawn.
	if ( active && map === 'start' ) automatic( false, false );
}
/**
 * Updates the run's map identity when the client receives server info (`CL_ParseServerInfo`, not during demo
 * playback), as travel preserves the run's setting and counter. Loading an existing game establishes context without
 * resetting its current flashlight or a continuing run's already-shown message.
 *
 * @param {string} name the world model's name (e.g. 'maps/e1m1.bsp')
 * @param {boolean} [newer=false] true in Newer Game: starts tracking if no run is active
 */
export function R_FlashlightRunMap( name, newer = false ) {
	// Loading an existing game establishes context without resetting its current
	// flashlight or a continuing run's already-shown message.
	if ( newer && ! active ) { active = true; lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
	if ( active ) map = mapName( name );
}
/**
 * Called by `Host_Loadgame_f` (host_cmd.js) after a saved game is loaded. Restoring a player already inside a skill
 * corridor is not a new entry: it seeds only the contact deduplicator (the skill already chosen), and changes neither
 * setting nor the notice counter.
 *
 * @param {string} name the loaded map's name
 * @param {boolean} newer true when `r_hdr` is on
 * @param {?number} [occupiedSkill=null] the skill (0..3) of the skill trigger the loaded player stands in, else null
 */
export function R_FlashlightRunLoaded( name, newer, occupiedSkill = null ) {
 R_FlashlightRunMap( name, newer );
 if ( newer && active && map === 'start' && Number.isInteger( occupiedSkill ) && occupiedSkill >= 0 && occupiedSkill <= 3 ) selectedSkill = occupiedSkill;
}
/**
 * Ends the run on an explicit exit (`CL_Disconnect_f`, cl_main.js), unlike a load or connect during a run; takes the
 * current flashlight as the baseline.
 */
export function R_FlashlightRunEnd() { active = false; map = ''; selectedSkill = null; noticeShown = false; lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
/**
 * Chooses the aids when the player picks a skill in the START map, once per choice rather than every touch, so it
 * cannot undo a player's manual switch-off. Called by `SV_RunTriggerTouch` (world.js) when the local player touches a
 * "This hall selects ... skill" trigger and by `PF_cvar_set` (pr_cmds.js) when a `trigger_setskill` sets `skill` for
 * edict 1. Easy gets flashlight and crosshair, Normal the flashlight only, Hard neither (sets `r_flashlight` and
 * `crosshair`).
 *
 * @param {string} name the server's map name (`sv.name`); must be 'start'
 * @param {number|string} value the skill, 0 (easy) to 3 (nightmare)
 * @returns {boolean} true when the aids were set; false outside an active Newer Game run in START, for an invalid
 *   skill, or when that skill was already chosen
 */
export function R_FlashlightSkillSelected( name, value ) {
	const skill = Number( value );
	if ( ! active || Cvar_VariableValue( 'r_hdr' ) === 0 || map !== 'start' || mapName( name ) !== 'start' || ! Number.isInteger( skill ) || skill < 0 || skill > 3 || selectedSkill === skill ) return false;
	selectedSkill = skill; automatic( skill < 2, skill === 0 ); return true;
}
/**
 * Records a flashlight switch the player made, called by `R_FlashlightToggle` (r_flashlight.js, the `flashlight`
 * command and the Options switch) with its actual old value, and by `R_FlashlightRunObserve`. The first switch-off
 * during a live run prints 'No duct tape in Mars' once per run. Defaults set by this module synchronise the baseline
 * themselves and never count as a user turning the flashlight off.
 *
 * @param {boolean} before whether the flashlight was on
 * @param {boolean} after whether it is on now (becomes the baseline)
 * @param {boolean} playing true in a live Newer Game (connected, not a demo)
 * @returns {boolean} true when the notice was printed
 */
export function R_FlashlightRunManualChange( before, after, playing ) {
	lastOn = after === true;
	if ( active && playing && before === true && after === false && ! noticeShown ) {
		noticeShown = true; Con_Printf( 'No duct tape in Mars\n' ); return true;
	}
	return false;
}
/**
 * Takes the current `r_flashlight` as the baseline without counting a change, called by the demo split
 * (r_demosplit.js) when a demo starts or its automatic restore runs: neither is a user switch-off.
 */
export function R_FlashlightRunSync() { lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
/**
 * The per-frame observer, called by `R_FlashlightUpdate` (r_flashlight.js): compares the flashlight with the baseline,
 * which also catches a direct console cvar change.
 *
 * @param {boolean} on whether `r_flashlight` is on now
 * @param {boolean} playing true in a live Newer Game (connected, not a demo)
 * @returns {boolean} true when this frame's change printed the notice
 */
export function R_FlashlightRunObserve( on, playing ) { return R_FlashlightRunManualChange( lastOn, on, playing ); }
/**
 * The run's state, for tests and diagnostics.
 *
 * @returns {{ active: boolean, map: string, selectedSkill: ?number, noticeShown: boolean, on: boolean,
 *   crosshair: boolean }} a new snapshot; `map` without path or extension
 */
export function R_FlashlightRunStatus() { return { active, map, selectedSkill, noticeShown, on: lastOn, crosshair: Cvar_VariableValue( 'crosshair' ) !== 0 }; }
