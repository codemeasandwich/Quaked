// Per-run welcome aids policy, separate from the shoulder beam and title demo.
// Explicit map/restart begins a run; serverinfo/seamless travel only updates its
// map identity. Native START entrance/skill triggers choose once per choice,
// rather than every touch, so it cannot undo a player's manual switch-off.
import { Cvar_FindVar, Cvar_SetValue, Cvar_VariableValue } from './engine/common/cvar.js';
import { Con_Printf } from './engine/common/common.js';

let active = false, map = '', selectedSkill = null, noticeShown = false;
let lastOn = false;
const mapName = value => String( value || '' ).toLowerCase().replace( /^maps\//, '' ).replace( /\.bsp$/, '' );
function automatic( on, crosshairOn ) {
	if ( Cvar_FindVar( 'r_flashlight' ) ) Cvar_SetValue( 'r_flashlight', on ? 1 : 0 );
	if ( Cvar_FindVar( 'crosshair' ) ) Cvar_SetValue( 'crosshair', crosshairOn ? 1 : 0 );
	lastOn = on;
}
export function R_FlashlightNewRun( name, skill, newer ) {
	active = newer === true; map = mapName( name ); selectedSkill = null; noticeShown = false;
	lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0;
	// Only a fresh welcome start resets the aids. Direct level starts/restarts
	// retain the current choices, just like load, travel and respawn.
	if ( active && map === 'start' ) automatic( false, false );
}
export function R_FlashlightRunMap( name, newer = false ) {
	// Loading an existing game establishes context without resetting its current
	// flashlight or a continuing run's already-shown message.
	if ( newer && ! active ) { active = true; lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
	if ( active ) map = mapName( name );
}
// Restoring a player already inside a corridor is not a new entry. Seed only
// the contact deduplicator; do not change either setting or the notice counter.
export function R_FlashlightRunLoaded( name, newer, occupiedSkill = null ) {
 R_FlashlightRunMap( name, newer );
 if ( newer && active && map === 'start' && Number.isInteger( occupiedSkill ) && occupiedSkill >= 0 && occupiedSkill <= 3 ) selectedSkill = occupiedSkill;
}
export function R_FlashlightRunEnd() { active = false; map = ''; selectedSkill = null; noticeShown = false; lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
export function R_FlashlightSkillSelected( name, value ) {
	const skill = Number( value );
	if ( ! active || Cvar_VariableValue( 'r_hdr' ) === 0 || map !== 'start' || mapName( name ) !== 'start' || ! Number.isInteger( skill ) || skill < 0 || skill > 3 || selectedSkill === skill ) return false;
	selectedSkill = skill; automatic( skill < 2, skill === 0 ); return true;
}
// Input commands/menu use their actual old value; the per-frame observer also
// catches a direct console cvar change. Defaults above synchronize this baseline
// themselves and never count as a user turning the flashlight off.
export function R_FlashlightRunManualChange( before, after, playing ) {
	lastOn = after === true;
	if ( active && playing && before === true && after === false && ! noticeShown ) {
		noticeShown = true; Con_Printf( 'No duct tape in Mars\n' ); return true;
	}
	return false;
}
export function R_FlashlightRunSync() { lastOn = Cvar_VariableValue( 'r_flashlight' ) !== 0; }
export function R_FlashlightRunObserve( on, playing ) { return R_FlashlightRunManualChange( lastOn, on, playing ); }
export function R_FlashlightRunStatus() { return { active, map, selectedSkill, noticeShown, on: lastOn, crosshair: Cvar_VariableValue( 'crosshair' ) !== 0 }; }
