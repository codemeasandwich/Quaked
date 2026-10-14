/**
 * Native Ring presentation metadata for the opt-in cloakbody1 protocol extension.
 * The stock game deliberately overwrites its body frame with eyes frame 0 in
 * CheckPowerups. Observe completed player animation functions before that reset;
 * never restore or change a QuakeC field. Animation keeps its native 0.1 s clock.
 * Unsupported progs, missing body assets and unknown poses keep native eyes.
 */
import { pr_functions, pr_statements, pr_global_struct, PR_GetString, PROG_TO_EDICT, PR_StockProgs } from '../progs/progs.js';
import { OP_STATE } from '../progs/pr_comp.js';
import { sv, svs } from './server.js';
import { IT_INVISIBILITY } from '../common/quakedef.js';
import { GetEdictFieldValue } from '../progs/pr_edict.js';

let program = null;
const animations = new Set();
// Weak ownership: old maps/edict lifetimes are not retained. Function-table and
// edict-list identities also prevent a reused record crossing a progs/map load.
let poses = new WeakMap();
let world = null;
function refresh() {
  if (world !== sv.edicts || program !== pr_functions) { poses = new WeakMap(); world = sv.edicts; }
  if (program === pr_functions) return;
  program = pr_functions; animations.clear();
  // stock QuakeC only (1.06, whose progs.dat SHA256 is f2619787f9aa0f057246eea1665b622b4691b5c5a800b1a46133d1fe8b771580,
  // or the 2021 re-release): the engine's whole-file CRC, not the progdefs header CRC
  if (! PR_StockProgs()) return;
  for (const fn of pr_functions) {
    if (fn.first_statement >= 0 && pr_statements[fn.first_statement]?.op === OP_STATE && /^player_/.test(PR_GetString(fn.s_name))) animations.add(fn);
  }
}

/** PR_EnterFunction token: the actual live player, or null. No per-call allocation. */
export function SV_CloakAnimationEnter(fn) {
  if (! PR_StockProgs()) return null;
  refresh();
  if (!animations.has(fn)) return null;
  const p = PROG_TO_EDICT(pr_global_struct.self), slot = p?.index;
  return slot >= 1 && slot <= svs.maxclients && svs.clients?.[slot - 1]?.edict === p && !p.free && p.v.health > 0 ? p : null;
}

/** Preserve the final frame of a native animation, including genuine axe frame 0. */
export function SV_CloakAnimationLeave(p) {
  if (!p || p.free || p.v.health <= 0 || world !== sv.edicts || program !== pr_functions) return;
  const frame = p.v.frame;
  if (Number.isInteger(frame) && frame >= 0) poses.set(p, frame);
}

/** Clear only presentation metadata when a client slot is assigned or dropped. */
export function SV_CloakResetPlayer(p) { if (p) poses.delete(p); }

/** Authoritative Ring identity + retained native body pose; null is legacy fallback. */
export function SV_CloakBodyFrame(p) {
  refresh();
  const slot = p?.index, client = svs.clients?.[slot - 1];
  if (! PR_StockProgs() || !p || p.free || slot < 1 || slot > svs.maxclients || client?.edict !== p || !client.active || !client.spawned ||
      p.v.health <= 0 || p.v.deadflag !== 0 || !(p.v.items & IT_INVISIBILITY) || sv.model_precache[p.v.modelindex] !== 'progs/eyes.mdl') return null;
  const timer = GetEdictFieldValue(p, 'invisible_finished');
  const until = timer ? timer.accessor.getFloat(timer.ofs) : 0;
  // Match native CheckPowerups exactly: expiry is strictly before time.
  if (!(until > 0) || until < sv.time) return null;
  const frame = poses.get(p), index = sv.model_precache.indexOf('progs/player.mdl');
  const header = index > 0 ? sv.models[index]?.cache?.data : null;
  return Number.isInteger(frame) && frame >= 0 && frame < (header?.numframes || 0) ? frame : null;
}
