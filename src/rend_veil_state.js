// Server/client clock contract; the owner-supplied profile is the authority.
import { PROFILE } from './rend_veil/config.js';
import { sampleRendVeil } from './rend_veil/timeline.js';
export { VISUALS as REND_PARAMS } from './rend_veil/config.js';
export function Rend_Schedule(){return {focusAt:PROFILE.focusSeconds,totalDuration:PROFILE.completeSeconds};}
export const Rend_Evaluate=sampleRendVeil;
