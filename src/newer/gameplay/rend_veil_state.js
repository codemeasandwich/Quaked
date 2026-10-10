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
/**
 * The fixed timing of the Rend the Veil arrival, read from the owner-supplied `PROFILE` (rend_veil/config.js), which
 * is the authority for the server/client clock contract. sv_rendveil.js reads it on every query: `SV_RendVeilHolding`
 * holds a monster until `focusAt`, and a record is cleared once `totalDuration` has passed since its `start`.
 *
 * @returns {{ focusAt: number, totalDuration: number }} seconds after the rite starts at which the arrival is in focus
 *   (2.5 in the current profile) and at which the rite is over (2.8); a new object each call
 */
export function Rend_Schedule(){return {focusAt:PROFILE.focusSeconds,totalDuration:PROFILE.completeSeconds};}
export const Rend_Evaluate=sampleRendVeil;
