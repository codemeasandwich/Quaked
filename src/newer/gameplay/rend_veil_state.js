/**
 * @module newer/gameplay/rend_veil_state
 *
 * The clock of Rend the Veil, the monster-closet arrival rite: its schedule and what it shows at a given time.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Server/client clock contract; the owner-supplied profile is the authority.
import { PROFILE } from '../render/rend_veil/config.js';
import { sampleRendVeil } from '../render/rend_veil/timeline.js';
export { VISUALS as REND_PARAMS } from '../render/rend_veil/config.js';
export function Rend_Schedule(){return {focusAt:PROFILE.focusSeconds,totalDuration:PROFILE.completeSeconds};}
export const Rend_Evaluate=sampleRendVeil;
