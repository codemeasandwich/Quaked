/**
 * @module newer/gameplay/respawn_record
 *
 * Save records for Newer Game's respawn (the dropped backpack, the remains, the player's carried state) and the
 * dropped ammunition.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: catches at 1 place.
 */
// Private save metadata contains values only; no executable callbacks/models
// may be supplied by it. Native QC and the loaded server own execution.
// The basic shotgun has never had a pickup model in Quake: its drop is skin 1 of the super shotgun's pickup MDL, which Newer Game
// draws as the basic shotgun's own art (r_weapons.js, role g_shot1; the native MDL has one skin, so Classic shows it as before).
export const RESPAWN_WEAPONS=Object.freeze([
 {bit:1,name:'Shotgun',ammo:'ammo_shells',model:'progs/g_shot.mdl',skin:1},
 {bit:2,name:'Double-barrelled shotgun',ammo:'ammo_shells',model:'progs/g_shot.mdl'},
 {bit:4,name:'Nailgun',ammo:'ammo_nails',model:'progs/g_nail.mdl'},
 {bit:8,name:'Super nailgun',ammo:'ammo_nails',model:'progs/g_nail2.mdl'},
 {bit:16,name:'Grenade launcher',ammo:'ammo_rockets',model:'progs/g_rock.mdl'},
 {bit:32,name:'Rocket launcher',ammo:'ammo_rockets',model:'progs/g_rock2.mdl'},
 {bit:64,name:'Thunderbolt',ammo:'ammo_cells',model:'progs/g_light.mdl'}
]);
export const RESPAWN_AMMO=Object.freeze(['ammo_shells','ammo_nails','ammo_rockets','ammo_cells']);
const vec=(v,n=3)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e8);
const number=x=>Number.isFinite(x)&&x>=0&&x<=16777216;
const quat=v=>vec(v,4)&&Math.abs(Math.hypot(...v)-1)<1e-4;
const parse=text=>{try{return JSON.parse(decodeURIComponent(text));}catch{return null;}};
/**
 * Converts a dropped backpack record into the ammunition it gives back, called by `SV_RespawnDropTouch`
 * (sv_respawn.js) when the player picks the drop up.
 *
 * @param {?object} d a drop record from `Respawn_ParseDrop` or `SV_RespawnDropInventory`: version 2 carries `pools`,
 *   version 1 a single `ammo` field name and `amount`
 * @returns {Array<number>} four counts in `RESPAWN_AMMO` order (shells, nails, rockets, cells); a new array
 */
export function Respawn_DropAmmo(d){
 if(d?.version===2)return d.pools.slice();
 return RESPAWN_AMMO.map(a=>d?.ammo===a?d.amount:0);
}
/**
 * Validates the `_clockwise_drop` key of a saved game, called by `ED_ParseEntity` (pr_edict.js) while loading a save;
 * the result becomes `ent._respawnDrop`. Version 2 is an ammo-only drop (`weapon` 0, four non-negative integer
 * `pools`, at least one non-zero); version 1 has a `weapon` bit from `RESPAWN_WEAPONS` (or 0) whose ammo matches
 * `ammo`, and an integer `amount`. Every drop needs a string `id` under 200 characters and a `born` time (`sv.time`,
 * seconds, 0..16777216).
 *
 * @param {string} text the URI-encoded JSON value written by `ED_Write`
 * @returns {?object} the parsed record, or null when it cannot be decoded or fails any check (never throws)
 */
export function Respawn_ParseDrop(text){const d=parse(text);
 if(!d||typeof d.id!=='string'||d.id.length>=200||!number(d.born))return null;
 if(d.version===2)return d.weapon===0&&Array.isArray(d.pools)&&d.pools.length===4&&d.pools.every(x=>number(x)&&Number.isInteger(x))&&d.pools.some(x=>x>0)?d:null;
 return d.version===1&&Number.isInteger(d.weapon)&&(!d.weapon||RESPAWN_WEAPONS.some(w=>w.bit===d.weapon&&w.ammo===d.ammo))&&RESPAWN_AMMO.includes(d.ammo)&&number(d.amount)&&Number.isInteger(d.amount)?d:null;
}
/**
 * Validates the `_clockwise_remains` key of a saved game (a dead player's left-behind remains), called by
 * `ED_ParseEntity` (pr_edict.js); the result becomes `ent._respawnRemains`.
 *
 * @param {string} text the URI-encoded JSON value written by `ED_Write`
 * @returns {?{ version: 1, kind: string, id: string, born: number }} the record when `kind` is 'body', 'head' or 'gib',
 *   `id` is a string under 200 characters and `born` (`sv.time`, seconds) is in 0..16777216; otherwise null
 */
export function Respawn_ParseRemains(text){const r=parse(text);return r?.version===1&&['body','head','gib'].includes(r.kind)&&typeof r.id==='string'&&r.id.length<200&&number(r.born)?r:null;}
/**
 * Validates the `_clockwise_player` key of a saved game (the player's respawn state), called by `ED_ParseEntity`
 * (pr_edict.js); the result becomes `ent._respawn`. Checks the start point and angles, the unit-quaternion `frame`, a
 * non-negative integer `deaths`, an optional `respawnHealth` of 60..100, an optional `visited` list (at most 512 names
 * of 1..160 characters) and, unless `sequence` is null, the in-progress respawn sequence (pivots, drifts, radius of at
 * least 1, turn of 0.1..60, rise pitch within 90 degrees and zero roll, and so on). Private save metadata contains values
 * only; no executable callbacks or models may be supplied by it. Native QC and the loaded server own execution.
 *
 * @param {string} text the URI-encoded JSON value written by `ED_Write`
 * @returns {?object} the parsed record, or null when it cannot be decoded or fails any check (never throws)
 */
export function Respawn_ParsePlayer(text){const r=parse(text);if(r?.version!==1||!vec(r.start)||!vec(r.startAngles)||!quat(r.frame)||!Number.isInteger(r.deaths)||r.deaths<0)return null;
 if(r.respawnHealth!==undefined&&!(Number.isInteger(r.respawnHealth)&&r.respawnHealth>=60&&r.respawnHealth<=100))return null;
 if(r.visited!==undefined&&!(Array.isArray(r.visited)&&r.visited.length<=512&&r.visited.every(v=>typeof v==='string'&&v.length>0&&v.length<=160)))return null;
 const s=r.sequence;if(s!==null&&(!s||!number(s.at)||!vec(s.sourcePivot)||!vec(s.destinationPivot)||!vec(s.angles)||(s.riseAngles!==undefined&&(!vec(s.riseAngles)||Math.abs(s.riseAngles[0])>90||s.riseAngles[2]!==0))||!quat(s.frame)||!number(s.radius)||s.radius<1||!number(s.turn)||s.turn<.1||s.turn>60||!Number.isFinite(s.descent)||Math.abs(s.descent)>1e7||!vec(s.sourceDrift)||!vec(s.destinationDrift)||(s.motionTime!==undefined&&!number(s.motionTime))||(s.destinationDrop!==undefined&&(!Number.isFinite(s.destinationDrop)||Math.abs(s.destinationDrop)>1e7))||(s.remainsRetained!==undefined&&typeof s.remainsRetained!=='boolean')||typeof s.respawned!=='boolean'||!Number.isInteger(s.objectives)))return null;return r;}
