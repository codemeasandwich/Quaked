/**
 * @module newer/gameplay/rend_veil_state
 *
 * The clock of Rend the Veil, the monster-closet arrival rite: its schedule and what it shows at a given time.
 *
 * Owns: no state (pure functions).
 *
 * Errors: none.
 */
// Server/client clock contract; the owner-supplied profile is the authority.
import { PROFILE } from '../../rend_veil/config.js';
import { sampleRendVeil } from '../../rend_veil/timeline.js';
export { VISUALS as REND_PARAMS } from '../../rend_veil/config.js';
export function Rend_Schedule(){return {focusAt:PROFILE.focusSeconds,totalDuration:PROFILE.completeSeconds};}
export const Rend_Evaluate=sampleRendVeil;
