// Private save metadata contains values only; no executable callbacks/models
// may be supplied by it. Native QC and the loaded server own execution.
export const RESPAWN_WEAPONS=Object.freeze([
 {bit:1,name:'Shotgun',ammo:'ammo_shells',model:'progs/g_shot.mdl'},
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
export function Respawn_DropAmmo(d){
 if(d?.version===2)return d.pools.slice();
 return RESPAWN_AMMO.map(a=>d?.ammo===a?d.amount:0);
}
export function Respawn_ParseDrop(text){const d=parse(text);
 if(!d||typeof d.id!=='string'||d.id.length>=200||!number(d.born))return null;
 if(d.version===2)return d.weapon===0&&Array.isArray(d.pools)&&d.pools.length===4&&d.pools.every(x=>number(x)&&Number.isInteger(x))&&d.pools.some(x=>x>0)?d:null;
 return d.version===1&&Number.isInteger(d.weapon)&&(!d.weapon||RESPAWN_WEAPONS.some(w=>w.bit===d.weapon&&w.ammo===d.ammo))&&RESPAWN_AMMO.includes(d.ammo)&&number(d.amount)&&Number.isInteger(d.amount)?d:null;
}
export function Respawn_ParseRemains(text){const r=parse(text);return r?.version===1&&['body','head','gib'].includes(r.kind)&&typeof r.id==='string'&&r.id.length<200&&number(r.born)?r:null;}
export function Respawn_ParsePlayer(text){const r=parse(text);if(r?.version!==1||!vec(r.start)||!vec(r.startAngles)||!quat(r.frame)||!Number.isInteger(r.deaths)||r.deaths<0)return null;
 if(r.respawnHealth!==undefined&&!(Number.isInteger(r.respawnHealth)&&r.respawnHealth>=60&&r.respawnHealth<=100))return null;
 if(r.visited!==undefined&&!(Array.isArray(r.visited)&&r.visited.length<=512&&r.visited.every(v=>typeof v==='string'&&v.length>0&&v.length<=160)))return null;
 const s=r.sequence;if(s!==null&&(!s||!number(s.at)||!vec(s.sourcePivot)||!vec(s.destinationPivot)||!vec(s.angles)||(s.riseAngles!==undefined&&(!vec(s.riseAngles)||Math.abs(s.riseAngles[0])>90||s.riseAngles[2]!==0))||!quat(s.frame)||!number(s.radius)||s.radius<1||!number(s.turn)||s.turn<.1||s.turn>60||!Number.isFinite(s.descent)||Math.abs(s.descent)>1e7||!vec(s.sourceDrift)||!vec(s.destinationDrift)||(s.motionTime!==undefined&&!number(s.motionTime))||(s.destinationDrop!==undefined&&(!Number.isFinite(s.destinationDrop)||Math.abs(s.destinationDrop)>1e7))||(s.remainsRetained!==undefined&&typeof s.remainsRetained!=='boolean')||typeof s.respawned!=='boolean'||!Number.isInteger(s.objectives)))return null;return r;}
