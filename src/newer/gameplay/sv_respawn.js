/**
 * @module newer/gameplay/sv_respawn
 *
 * Newer Game's single-player death and respawn: the backpack, the remains, the guard monster, health on return and
 * the level's return arch.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `guardReady`, `guardSkill`, `respawnLanded`, `respawnEntryYaw`,
 * `travelInventory`, `worldEpoch`; 5 module-level collections (Map/Set).
 *
 * Errors: throws at 7 places; catches at 4 places.
 *
 * Outside a local Newer Game (`SV_RespawnAllowed`) a death is Quake's own.
 */
// Native single-player death coordinator. QC retains damage/death callbacks;
// only its backpack/restart are replaced while this coordinator owns a death.
import {sv,svs,FL_MONSTER,FL_ONGROUND,MOVETYPE_NONE,MOVETYPE_WALK,MOVETYPE_TOSS,SOLID_NOT,SOLID_TRIGGER,SOLID_SLIDEBOX,ss_loading} from '../../engine/server/server.js';
import {cls,ca_dedicated} from '../../engine/client/client.js';
import { R_NewerGame } from '../mode.js';
import {pr_crc,PR_GetString,pr_functions,pr_global_struct,pr_globals_int,EDICT_TO_PROG,PROG_TO_EDICT} from '../../engine/progs/progs.js';
import {ED_Alloc,ED_Free,ED_FindFunction,ED_NewString,GetEdictFieldValue} from '../../engine/progs/pr_edict.js';
import {PR_ExecuteProgram} from '../../engine/progs/pr_exec.js';
import {SV_Move,SV_LinkEdict,SV_PointContents,MOVE_NOMONSTERS,MOVE_NORMAL} from '../../engine/server/world.js';
import {svc_updatestat} from '../../engine/common/protocol.js';
import {MSG_WriteByte,MSG_WriteLong} from '../../engine/common/common.js';
import {Cvar_VariableValue,cvar_t} from '../../engine/common/cvar.js';
import {Respawn_NoticeSet,Respawn_NoticeClear,RESPAWN_MINUS,RESPAWN_PLUS} from '../ui/respawn_notice.js';
import {Mod_ForName} from '../../engine/render/gl_model.js';
import {COM_FindFile} from '../../engine/common/pak.js';
import {sv_gravity,SV_CheckWater} from '../../engine/server/sv_phys.js';
import {SV_ModelLimit,SV_SoundLimit} from '../../engine/server/sv_main.js';
import {Respawn_Sample,Respawn_NextFrame,RESPAWN_DELAY,RESPAWN_TURN} from '../ui/respawn_motion.js';
import {RESPAWN_WEAPONS,RESPAWN_AMMO,Respawn_DropAmmo} from './respawn_record.js';
import {IT_AXE,IT_KEY1,IT_KEY2,IT_INVISIBILITY,IT_INVULNERABILITY,IT_QUAD,IT_SUIT,STAT_AMMO,STAT_SHELLS,STAT_NAILS,STAT_ROCKETS,STAT_CELLS,STAT_TOTALMONSTERS} from '../../engine/common/quakedef.js';
const WEAPON_BITS=127|IT_AXE,POWERS=IT_INVISIBILITY|IT_INVULNERABILITY|IT_QUAD|IT_SUIT;
const TIMER_FIELDS=['invisible_finished','invincible_finished','super_damage_finished','radsuit_finished','invisible_time','invincible_time','super_time','rad_time'];
const names=new WeakMap();
// Reserve the one independent body/head before inventory custody changes.
// The edict pointer is transient runtime ownership, never part of save data.
const deathBodies=new WeakMap();
const name=f=>{if(!f)return '';let n=names.get(f);if(n===undefined){n=PR_GetString(f.s_name);names.set(f,n);}return n;};
const IDENTITY=Object.freeze([0,0,0,1]);
const HOOKS=new Set(['PlayerDie','ClientKill','DropBackpack','respawn','PutClientInServer','bound_other_ammo']);
const fnIndex=n=>{const f=ED_FindFunction(n);return f?pr_functions.indexOf(f):0;};
const slot=(e,n)=>GetEdictFieldValue(e,n);
function field(e,n,value,integer=false){const f=slot(e,n);if(f){if(value!==undefined){if(integer)f.accessor.setInt32(f.ofs,value);else f.accessor.setFloat(f.ofs,value);}return integer?f.accessor.getInt32(f.ofs):f.accessor.getFloat(f.ofs);}return 0;}
const localContext=()=>svs.maxclients===1&&cls.state!==ca_dedicated&&!cls.demoplayback&&pr_crc===24778;
/**
 * True when this module's death and respawn replace Quake's own: a local single-player game (not dedicated, not
 * playing a demo) on the stock progs (CRC 24778) in Newer Game. Checked by other modules before relying on respawn
 * state (travel, powerups, the respawn notice).
 *
 * @returns {boolean} true when a death now would be coordinated here
 */
export function SV_RespawnAllowed(){return localContext()&&R_NewerGame();}
function powersOff(p){p.v.items=(p.v.items|0)&~POWERS;for(const n of TIMER_FIELDS)field(p,n,0);p.v.effects&=~12;}
// Normal difficulty respawn health (card [4]): the entitlement starts at 100, each completed respawn takes 10 off down
// to 60, and arriving by changelevel in a level not seen before in this run gives 10 back up to 100. It is its own
// number (state.respawnHealth), apart from current health and pickups. Other difficulties keep 100 and never touch it.
export const RESPAWN_HEALTH_MAX=100,RESPAWN_HEALTH_MIN=60,RESPAWN_HEALTH_STEP=10,NORMAL_SKILL=1,MAX_VISITED=512;
const normal=()=>Math.round(Cvar_VariableValue('skill'))===NORMAL_SKILL;
// A level's identity: the progs CRC and the map's path. This engine has one map namespace (no game directories), and this
// system only runs on the stock progs, so today that is the bare map name; the CRC and the path keep it from being confused
// if a different progs or a map location ever appears (a content hash of the map would be needed for two same-named maps).
/**
 * The current level's identity for the respawn-health "levels seen" list: `<progs CRC>:<map path>`.
 *
 * @returns {string} e.g. '24778:maps/e1m1.bsp'
 */
export const levelKey=()=>pr_crc+':'+String(sv.modelname||'maps/'+sv.name+'.bsp');
function entitlement(state){return Number.isInteger(state.respawnHealth)?state.respawnHealth:RESPAWN_HEALTH_MAX;}
// the health a respawn completing now gives, updating the entitlement and announcing a decrease
function respawnHealth(state){
 if(!normal())return 100;
 const before=entitlement(state),after=Math.max(RESPAWN_HEALTH_MIN,before-RESPAWN_HEALTH_STEP);
 state.respawnHealth=after;if(after<before)Respawn_NoticeSet(RESPAWN_MINUS,sv.time);
 return after;
}
function initialize(p){const start=sv.edicts?.find(e=>e&&!e.free&&PR_GetString(e.v.classname)==='info_player_start');const location=p._respawnStart?.origin||Array.from(start?.v.origin||p.v.origin).map((v,i)=>v+(i===2?1:0));return p._respawn={version:1,start:location.slice(),startAngles:Array.from(p._respawnStart?.angles||start?.v.angles||p.v.v_angle),frame:[0,0,0,1],deaths:0,custody:false,sequence:null,respawnHealth:RESPAWN_HEALTH_MAX,visited:[levelKey()]};}
function ground(p,point){const trace=SV_Move([point[0],point[1],point[2]+1],[0,0,0],[0,0,0],[point[0],point[1],point[2]-8192],MOVE_NOMONSTERS,p);return !trace.startsolid&&!trace.allsolid&&trace.fraction<1?trace.endpos[2]:point[2];}
function pivotFor(p,origin){const feet=origin[2]+p.v.mins[2];return [origin[0],origin[1],ground(p,[origin[0],origin[1],feet])+2];}
function driftFor(p,eye,radius,angles){const yaw=angles[1]*Math.PI/180,right=[Math.sin(yaw),-Math.cos(yaw),0],end=eye.map((v,i)=>v+right[i]*(radius+2));const tr=SV_Move(eye,[-1,-1,-1],[1,1,1],end,MOVE_NOMONSTERS,p);const need=Math.max(0,radius+2-(radius+2)*tr.fraction);return right.map(v=>-v*need);}
function callNative(p,functionIndex){const self=pr_global_struct.self,other=pr_global_struct.other,time=pr_global_struct.time;try{pr_global_struct.self=EDICT_TO_PROG(p);pr_global_struct.time=sv.time;PR_ExecuteProgram(functionIndex);}finally{pr_global_struct.self=self;pr_global_struct.other=other;pr_global_struct.time=time;}}
/**
 * Admit a bounded native resource set at local startup even for Classic. Gameplay admission remains Newer-only; this
 * avoids unsafe active-server precache mutation when the owner enables the enhancement later. Adds every droppable
 * weapon model (RESPAWN_WEAPONS) and progs/backpack.mdl that exists in the pak files and is not already precached to
 * `sv.model_precache`/`sv.models`. Called by SV_SpawnServer after the level's spawn functions, and again from
 * `SV_RespawnRestoreDropModel` when a save brings back a drop. Lasts for the level.
 *
 * @throws {Error} 'Respawn drop model budget exhausted' when no free model slot below 256 remains
 */
export function SV_RespawnPrecache(){if(!localContext())return;for(const n of new Set([...RESPAWN_WEAPONS.map(w=>w.model),'progs/backpack.mdl'])){if(sv.model_precache.includes(n)||!COM_FindFile(n))continue;const i=sv.model_precache.findIndex((v,i)=>i>0&&!v);if(i<1||i>=256)throw Error('Respawn drop model budget exhausted');sv.model_precache[i]=n;sv.models[i]=Mod_ForName(n,true);}}
/**
 * At a coordinated death (from the death hook, before QC's PlayerDie body runs), throws the player's weapons and
 * ammunition into the level as `dropped_weapon` entities that `SV_RespawnDropTouch` gives back: one per held weapon,
 * carrying an equal share of that weapon's ammo type (any remainder to the first), and one backpack for ammo no held
 * weapon uses. Drops scatter at golden-angle headings that also turn with the death count. All entities are allocated
 * before the inventory is taken, so a failure frees them and leaves the player untouched. Then clears the player's
 * weapons, ammo and powers, increments `p._respawn.deaths` and sets `custody`. Each drop's `_respawnDrop` record is
 * saved with the game.
 *
 * @param {edict_t} p the player (edict 1); mutated, and given a `_respawn` state when it has none
 * @returns {Array<edict_t>} the drop entities allocated, in payload order
 * @throws {Error} 'Respawn drop model unavailable: <model>' when a drop's model is not precached; Host_Error
 * 'ED_Alloc: no free edicts' when the edict table is full
 */
export function SV_RespawnDropInventory(p){
 const state=p._respawn||initialize(p),weapons=RESPAWN_WEAPONS.filter(w=>(p.v.items|0)&w.bit),payloads=[],orphan=[0,0,0,0];
 for(const ammo of RESPAWN_AMMO){const total=Math.max(0,Math.floor(p.v[ammo])),matching=weapons.filter(w=>w.ammo===ammo);
  if(matching.length){const each=Math.floor(total/matching.length),remainder=total%matching.length;matching.forEach((w,i)=>payloads.push({weapon:w.bit,ammo,amount:each+(i<remainder?1:0),model:w.model,skin:w.skin||0}));}
  else if(total)orphan[RESPAWN_AMMO.indexOf(ammo)]=total;
 }
 if(orphan.some(x=>x>0))payloads.push({weapon:0,pools:orphan,model:'progs/backpack.mdl'});
 // Allocate all payloads before relinquishing inventory. Partial allocation
 // failures cannot silently consume ammunition or leave a duplicated half-drop.
 const allocated=[];try{for(const data of payloads){const e=ED_Alloc();allocated.push(e);const i=payloads.indexOf(data),angle=(state.deaths*2.399963+i*2.399963),origin=Array.from(p.v.origin);
  e.v.classname=ED_NewString('dropped_weapon');e.v.model=ED_NewString(data.model);e.v.modelindex=sv.model_precache.indexOf(data.model);if(e.v.modelindex<1)throw Error('Respawn drop model unavailable: '+data.model);e.v.skin=data.skin||0;
  e.v.origin=origin;e.v.mins=[-8,-8,-4];e.v.maxs=[8,8,12];e.v.size=[16,16,16];e.v.movetype=MOVETYPE_TOSS;e.v.solid=SOLID_TRIGGER;e.v.touch=fnIndex('SUB_Null');e.v.velocity=[Math.cos(angle)*(80+i*5),Math.sin(angle)*(80+i*5),170+i*8];e.v.angles=[0,angle*180/Math.PI,0];
  e._respawnDrop={version:data.pools?2:1,id:sv.name+':'+(state.deaths+1)+':'+sv.time+':'+e.index,weapon:data.weapon,...(data.pools?{pools:data.pools.slice()}:{ammo:data.ammo,amount:data.amount}),born:sv.time};SV_LinkEdict(e,false);
 }}catch(error){for(const e of allocated)ED_Free(e);throw error;}
 for(const ammo of RESPAWN_AMMO)p.v[ammo]=0;p.v.currentammo=0;p.v.weapon=0;p.v.items=(p.v.items|0)&~WEAPON_BITS;powersOff(p);state.deaths++;state.custody=true;return allocated;
}
function begin(p){if(p._respawn?.sequence)return;const state=p._respawn||initialize(p),source=Array.from(p.v.origin),angles=Array.from(p.v.v_angle);angles[2]=0;
 // the fall follows the facing at death; during the rise, after the cut to the start, the view turns smoothly to face into the level
 const rise=entryAngles(state);
 const foot=source[2]+p.v.mins[2],floor=ground(p,[source[0],source[1],foot]),radius=Math.max(8,p.v.view_ofs[2]-p.v.mins[2]-2),descent=Math.max(0,foot-floor);
 // Match native V_CalcRefdef's node-line bias and exact standing eye.
 const bias=1/32,destination=[state.start[0]+bias,state.start[1]+bias,state.start[2]+22+bias-radius],sourcePivot=[source[0]+bias,source[1]+bias,foot+2+bias],turn=Math.max(RESPAWN_TURN,2*Math.sqrt(2*descent/Math.max(1,sv_gravity.value)));
 const sourceEye=[source[0]+bias,source[1]+bias,source[2]+p.v.view_ofs[2]+bias],destinationEye=[...destination];destinationEye[2]+=radius;
 const sequence={at:sv.time,sourcePivot,destinationPivot:destination,sourceDrift:driftFor(p,sourceEye,radius,angles),destinationDrift:driftFor(p,destinationEye,radius,[angles[0],angles[1]+180,0]),angles,riseAngles:rise,frame:state.frame.slice(),radius,descent,turn,respawned:false,objectives:(p.v.items|0)&(IT_KEY1|IT_KEY2),damage:2};
 SV_RespawnPlanMotion(p,sequence);
 const body=ED_Alloc();
 try{SV_RespawnDropInventory(p);}catch(error){ED_Free(body);throw error;}
 deathBodies.set(p,body);state.sequence=sequence;
}
function retainDeath(p,before){
 const s=p._respawn?.sequence;if(!s||s.respawned||s.remainsRetained)return;
 const model=PR_GetString(p.v.model),kind=model==='progs/h_player.mdl'?'head':'body';
 if(!['progs/player.mdl','progs/h_player.mdl'].includes(model)){
  const reserved=deathBodies.get(p);if(reserved&&!reserved.free)ED_Free(reserved);deathBodies.delete(p);
  return; // Unsupported external model data must not leak the reserved slot.
 }
 // An ordinary nonclient entity can finish native death animation/physics;
 // the camera-owned player cannot, because the respawn pass owns its movement.
 const body=deathBodies.get(p);if(!body||body.free)throw Error('Respawn death body reservation unavailable');
 new Uint8Array(body._fieldBuffer).set(new Uint8Array(p._fieldBuffer));
 body.v.classname=ED_NewString(kind==='head'?'player_death_head':'player_corpse');
 body.v.solid=SOLID_NOT;body.v.takedamage=0;body.v.weaponmodel=0;body.v.weaponframe=0;body.v.items=0;body.v.weapon=0;body.v.currentammo=0;body.v.owner=0;body.v.enemy=0;
 body.v.button0=body.v.button1=body.v.button2=body.v.impulse=0;for(const a of RESPAWN_AMMO)body.v[a]=0;
 if(kind==='body')body.v.movetype=MOVETYPE_TOSS;
 body._respawnRemains={version:1,id:sv.name+':'+p._respawn.deaths+':'+sv.time+':'+body.index,kind,born:sv.time};
 if(kind==='head'){body.v.think=0;body.v.nextthink=-1;}
 // Only newly-live pieces from this synchronous native callback belong to
 // this player death. Free-slot reuse is absent from the entry identity set.
 const pieces=sv.edicts.filter(e=>e&&!e.free&&e!==p&&!before?.has(e)&&/^progs\/gib[123]\.mdl$/.test(PR_GetString(e.v.model)));
 for(const e of pieces)if(!e.free){e.v.think=0;e.v.nextthink=-1;e._respawnRemains={version:1,id:sv.name+':'+p._respawn.deaths+':'+sv.time+':'+e.index,kind:'gib',born:sv.time};SV_LinkEdict(e,false);}
 SV_LinkEdict(body,false);s.remainsRetained=true;deathBodies.delete(p);
 // Only this dead render alias is hidden. Native spawn restores the live body.
 p.v.model=0;p.v.modelindex=0;
}
/**
 * Called by PR_EnterFunction for every QuakeC function call, to take over the stock death and restart while this
 * coordinator owns a death. Only PlayerDie, ClientKill, DropBackpack, respawn, PutClientInServer and bound_other_ammo
 * are of interest, and only in a local stock-progs game. A death (PlayerDie at health <= 0, or a live ClientKill)
 * starts the respawn sequence: plans the camera motion, reserves an edict for the remains, and drops the inventory.
 *
 * @param {dfunction_t} f the function being entered
 * @param {?dfunction_t} caller the function that called it (`pr_xfunction`), to tell a death's DropBackpack apart
 * @returns {null|{ skip: number }|{ death: edict_t, before: Set<edict_t> }|{ spawn: edict_t }|{ overflow: edict_t, values: Array<number> }}
 * the token PR_LeaveFunction hands to `SV_RespawnFunctionLeave`: null for no involvement; `skip` makes PR_EnterFunction
 * run SUB_Null instead (DropBackpack from a death, respawn, or ClientKill during a sequence); `death` with the live
 * edicts before the call, so the native gibs it makes can be recognised; `spawn` for PutClientInServer; `overflow`
 * with the player's ammo above the stock caps (100 shells, 200 nails, 100 rockets, 100 cells; 0 where under) for a
 * pickup's bound_other_ammo to keep
 * @throws {Error} what `SV_RespawnDropInventory` throws when the death's drops cannot be made
 */
export function SV_RespawnFunctionEnter(f,caller){
 const n=name(f);if(!HOOKS.has(n)||!localContext())return null;
 if(n==='bound_other_ammo'){const other=PROG_TO_EDICT(pr_global_struct.other);if(other?.index===1&&other._respawn&&(R_NewerGame()||other._respawn.custody||other._respawn.deaths>0)){const caps=[100,200,100,100];return {overflow:other,values:RESPAWN_AMMO.map((a,i)=>other.v[a]>caps[i]?other.v[a]:0)};}return null;}
 const p=PROG_TO_EDICT(pr_global_struct.self);if(!p||p.index!==1)return null;
 if(n==='PutClientInServer')return {spawn:p};
 if(n==='ClientKill'&&p._respawn?.sequence){const noop=ED_FindFunction('SUB_Null');return {skip:noop.first_statement-1};}
 if(!R_NewerGame()&&!p._respawn?.sequence)return null;
 if((n==='PlayerDie'&&p.v.health<=0)||(n==='ClientKill'&&p.v.health>0&&p.v.deadflag===0)){
  // The preallocated tail has free=false too, but has never been admitted as
  // a live edict. Exclude it so newly allocated native gibs are recognizable.
  const before=new Set(sv.edicts.slice(0,sv.num_edicts).filter(e=>e&&!e.free)),weapon=p.v.weapon;
  begin(p);p.v.weapon=weapon; // Native death pose chooses the actual held weapon.
  return {death:p,before};
 }
 if((n==='DropBackpack'&&['PlayerDie','ClientKill'].includes(name(caller))||n==='respawn')&&p._respawn?.sequence){const noop=ED_FindFunction('SUB_Null');return {skip:noop.first_statement-1};}
 return null;
}
/**
 * Called by PR_LeaveFunction with the token `SV_RespawnFunctionEnter` returned for the same call. After a death:
 * copies the player into the reserved body (or head) entity as remains, marks this death's new gibs as remains
 * (`_respawnRemains`, kept and saved), hides the player's own model, and keeps it dead (health <= 0, no weapon, no
 * damage). After PutClientInServer: records the spawn spot (`_respawnStart`; angles from the spot, not v_angle),
 * creates the respawn state when allowed, and applies inventory and respawn health carried from the previous level.
 * After bound_other_ammo: puts back ammo the stock caps would have cut.
 *
 * @param {?Object} token the value `SV_RespawnFunctionEnter` returned (null does nothing)
 * @throws {Error} 'Respawn death body reservation unavailable' when the edict reserved at death has been freed
 */
export function SV_RespawnFunctionLeave(token){if(token?.death&&token.death._respawn?.sequence&&!token.death._respawn.sequence.respawned){retainDeath(token.death,token.before);token.death.v.health=Math.min(0,token.death.v.health);token.death.v.weapon=0;token.death.v.weaponmodel=0;token.death.v.weaponframe=0;token.death.v.takedamage=0;}if(token?.spawn){token.spawn._respawnStart={origin:Array.from(token.spawn.v.origin),angles:Array.from(token.spawn.v.angles)}; /* (PutClientInServer sets angles from the spawn spot, not v_angle) */if(SV_RespawnAllowed()&&!token.spawn._respawn)initialize(token.spawn);restoreTravel(token.spawn);}if(token?.overflow)RESPAWN_AMMO.forEach((a,i)=>{if(token.values[i])token.overflow.v[a]=Math.max(token.values[i],token.overflow.v[a]);});}
/**
 * Wakes every live monster in the level against the player, at the moment of a respawn's contact (half way through
 * the rise): sets enemy, goalentity, last_seen and show_hostile (now + 1 s), and runs FoundTarget for monsters with a
 * th_run and a movetype, so their native running AI (swimming, flying or ground) takes over. Scripted or pinned
 * actors still receive the target without being given a NULL thinker. Marks each with `_respawnAlert` = `sv.time`.
 *
 * @param {edict_t} p the player the monsters now hunt
 * @returns {number} how many monsters were alerted
 */
export function SV_RespawnAlert(p){const found=fnIndex('FoundTarget');let alerted=0;for(const e of sv.edicts||[]){if(!e||e.free||(!(e.v.flags&FL_MONSTER)&&!PR_GetString(e.v.classname).startsWith('monster_'))||e.v.health<=0||e.v.deadflag!==0)continue;e.v.enemy=EDICT_TO_PROG(p);field(e,'goalentity',EDICT_TO_PROG(p),true);field(e,'last_seen',sv.time);field(e,'show_hostile',sv.time+1);
 // Native running callbacks preserve swimming/flying/ground AI. Scripted or
 // pinned actors still receive the target without being given a NULL thinker.
 const run=field(e,'th_run',undefined,true);if(found&&run>0&&run<pr_functions.length&&e.v.movetype!==MOVETYPE_NONE)callNative(e,found);e._respawnAlert=sv.time;alerted++;
 }return alerted;}
// A guard left where the player fell (card [2]): after a completed respawn one native Fiend (Normal) or Shambler (Hard and
// Nightmare) is spawned at the death location, waiting in its ordinary idle; Easy gets none. The game's own spawn function
// makes it (so it is a real monster: counted in the total and the kills, saved, with its normal behaviour), after the alert pass
// of the same moment so it is not alerted with the rest. A monster's models and sounds can only be precached while a level
// loads, so at load (SV_RespawnReserveGuards, from SV_SpawnServer) the spawn function is run once on a throwaway entity to
// reserve them, when both tables have room or the model is already there; with no room, or with the stock monster missing,
// there is simply no guard of that kind in that level. The difficulty is the one the level loaded with.
// The spot must be real: empty air, room for the hull with the world, the monsters and the player all counted, ground below, a
// clear path from the death point, and not near where the player respawns (nobody is put beside a fresh respawn).
// 0 leaves no guard (the stock respawn only)
export const sv_respawnguard=new cvar_t('sv_respawnguard','1');
const GUARD_ROOM={models:8,sounds:24},GUARD_HULL=[[-32,-32,-24],[32,32,64]],GUARD_KEEP_AWAY=128;
const GUARDS=new Map([['monster_demon1','progs/demon.mdl'],['monster_shambler','progs/shambler.mdl']]);
let guardReady=new Set(),guardSkill=1;
const guardClass=()=>{if(!(sv_respawnguard.value>0))return null;return guardSkill===1?'monster_demon1':guardSkill>=2?'monster_shambler':null;};
// free precache slots within the server's own limit (256 each in protocol 15, card [34f]), not the whole array
const freeSlots=(a,limit)=>a.slice(0,limit).reduce((n,v)=>n+(v?0:1),0);
// the game's spawn function on entity e, allowed to precache what was reserved at load; keepTotal puts total_monsters back (the
// throwaway at load), otherwise the new monster stays counted
function runSpawn(e,f,keepTotal){
 const self=pr_global_struct.self,total=pr_global_struct.total_monsters,state=sv.state;
 try{pr_global_struct.self=EDICT_TO_PROG(e);sv.state=ss_loading;PR_ExecuteProgram(pr_functions.indexOf(f));}
 finally{pr_global_struct.self=self;sv.state=state;if(keepTotal&&Number.isFinite(total))pr_global_struct.total_monsters=total;}
}
let respawnLanded=null;
/**
 * Registers what to run when a respawn lands: sv_main sets SV_SeamlessCloseReturn, which shuts the way back to the
 * previous level for good (card [3]). Kept until replaced.
 *
 * @param {?function(): void} fn the hook, or null for none
 */
export const SV_SetRespawnLandedHook=fn=>{respawnLanded=fn;};
// The direction a respawn ends up facing (card [35]): forward into the level, the way a player entering it would. Where the level
// was entered through a way back (a doorway from the previous level near the start, open or already shut), it is away from that
// doorway; otherwise it is the level's own start orientation (info_player_start's yaw). Pitch and roll are level. sv_main sets
// the hook that knows the ways back (this module does not import the seamless/renderer chain).
let respawnEntryYaw=null;
/**
 * Registers the function that knows the level's ways back: sv_main sets SV_SeamlessEntryYaw. Kept until replaced.
 *
 * @param {?function(Array<number>): ?number} fn given the respawn point (world space), returns the yaw in degrees
 * facing away from the way back, or a non-finite value when there is none
 */
export const SV_SetRespawnEntryHook=fn=>{respawnEntryYaw=fn;};
function entryAngles(state){
 const way=respawnEntryYaw?.(state.start);
 // otherwise the spawn spot the respawn point came from (QuakeC may choose info_player_start2 or testplayerstart), found by
 // position; failing that the recorded start angles (a game saved before these were read from the spot has zeros there)
 const spot=sv.edicts?.find(e=>e&&!e.free&&/^(info_player_start2?|testplayerstart)$/.test(PR_GetString(e.v.classname))&&[0,1,2].every(i=>Math.abs(e.v.origin[i]+(i===2?1:0)-state.start[i])<.5));
 const yaw=Number.isFinite(way)?way:Number(spot?.v.angles[1]??state.startAngles?.[1])||0;
 return [0,wireYaw(yaw),0];
}
// The client is told its final view angle in a byte (MSG_WriteAngle: whole degrees, then 360/256 steps, toward zero). The rise
// therefore eases to the nearest yaw the client can be given exactly, and the final server angle is a value that encodes to it,
// so the hand-off has no snap (SV_RespawnWireAngle).
const STEP=360/256;
function wireYaw(yaw){let k=Math.round((((yaw%360)+540)%360-180)/STEP);if(k>=128)k-=256;return k*STEP;}
/**
 * The server yaw to set at the end of a rise so that MSG_WriteAngle (whole degrees, then 360/256 steps, toward zero)
 * sends exactly the step the rise eased to, and the hand-off has no snap.
 *
 * @param {number} yaw degrees, already on (or near) a 360/256 step
 * @returns {number} whole degrees, rounded away from zero, that encodes to that step
 */
export function SV_RespawnWireAngle(yaw){const k=Math.round(yaw/STEP);return k>=0?Math.ceil(k*STEP):Math.floor(k*STEP);}
/**
 * At level load (SV_SpawnServer, after the level's own spawn functions have precached), works out which guards this
 * level can have: for monster_demon1 and monster_shambler, runs the game's spawn function once on a throwaway entity
 * so its models and sounds are precached, when the model is already there or both tables have room (8 models, 24
 * sounds). A failure just means no guard of that kind here. The throwaway is freed and wiped and `total_monsters`
 * restored. Also records the skill the level loaded with. The result lasts until the next load.
 */
export function SV_RespawnReserveGuards(){
 guardReady=new Set();if(!localContext())return;guardSkill=Math.round(Cvar_VariableValue('skill'));
 for(const [name,model] of GUARDS){
  // (a monster the level already has is already reserved, and costs nothing)
  const f=ED_FindFunction(name);if(!f||(!sv.model_precache.includes(model)&&(freeSlots(sv.model_precache,SV_ModelLimit())<GUARD_ROOM.models||freeSlots(sv.sound_precache,SV_SoundLimit())<GUARD_ROOM.sounds)))continue;
  let e=null;const count=sv.num_edicts;
  try{e=ED_Alloc();e.v.classname=ED_NewString(name);runSpawn(e,f,true);guardReady.add(name);}catch(error){if(/^Host_Error/.test(error?.message))throw error;/* not reserved: no guard of this kind here; a Host_Error (no free edicts) has already ended the game, so it goes on up */}
  // wipe the throwaway completely (its fields are the spawn function's) and take a slot past the end of the list back out of it
  finally{if(e){if(!e.free)ED_Free(e);new Uint8Array(e._fieldBuffer).fill(0);if(e.index>=count)sv.num_edicts=count;}}
 }
}
/**
 * The guard classes the current level reserved at load.
 *
 * @returns {Array<string>} a copy, e.g. ['monster_demon1','monster_shambler']
 */
export const SV_RespawnGuardsReady=()=>Array.from(guardReady);
/**
 * The placement rules for a guard, exposed for tests: the nearest valid standing spot to the death place (empty air,
 * room for a 64x64x88 hull with world, monsters and player, a clear path from the death point, ground within 256 units
 * below, and at least 128 units from the player).
 *
 * @param {edict_t} p the player (its origin is the respawn point to keep away from)
 * @param {Array<number>} point the death place, world space, Quake units
 * @returns {?Array<number>} the chosen origin, or null when none of the 35 candidates is valid
 */
export const SV_RespawnGuardSpot=(p,point)=>guardSpot(p,point); // (the placement rules, for tests)
// the nearest valid standing spot to the death place
function guardSpot(p,[x,y,z]){
 const [mins,maxs]=GUARD_HULL,world=sv.edicts[0],offsets=[[0,0,0],[0,0,16],[0,0,32]];
 for(const r of[48,96])for(let k=0;k<8;k++){const a=k*Math.PI/4;offsets.push([Math.cos(a)*r,Math.sin(a)*r,0],[Math.cos(a)*r,Math.sin(a)*r,24]);}
 for(const [dx,dy,dz] of offsets){
  const at=[x+dx,y+dy,z+dz];if(SV_PointContents(at)!==-1)continue;
  if(Math.hypot(at[0]-p.v.origin[0],at[1]-p.v.origin[1],at[2]-p.v.origin[2])<GUARD_KEEP_AWAY)continue;
  // room for the hull with the world, every monster and the player (the player is not the entity passed, so it counts)
  const here=SV_Move(at,mins,maxs,at,MOVE_NORMAL,world);if(here.startsolid||here.allsolid)continue;
  // a ring offset must not be across a thin wall from the death point
  const path=SV_Move([x,y,z],[-1,-1,-1],[1,1,1],at,MOVE_NOMONSTERS,world);if(path.fraction<1)continue;
  const down=SV_Move(at,mins,maxs,[at[0],at[1],at[2]-256],MOVE_NOMONSTERS,world);if(down.startsolid||down.fraction>=1||SV_PointContents(down.endpos)!==-1)continue;
  return at;
 }
 return null;
}
function spawnGuard(p,s){
 if(s.guarded)return null;s.guarded=true;
 const name=guardClass(),f=name&&guardReady.has(name)?ED_FindFunction(name):null;if(!f)return null;
 const bias=1/32,spot=guardSpot(p,[s.sourcePivot[0]-bias,s.sourcePivot[1]-bias,s.sourcePivot[2]-2-bias-p.v.mins[2]]);if(!spot)return null;
 let e=null;
 try{
  e=ED_Alloc();e.v.classname=ED_NewString(name);e.v.origin=spot;e.v.angles=[0,Math.atan2(s.destinationPivot[1]-spot[1],s.destinationPivot[0]-spot[0])*180/Math.PI,0];runSpawn(e,f,false);
  // the client learns the new total (it only hears it at signon otherwise)
  MSG_WriteByte(sv.reliable_datagram,svc_updatestat);MSG_WriteByte(sv.reliable_datagram,STAT_TOTALMONSTERS);MSG_WriteLong(sv.reliable_datagram,pr_global_struct.total_monsters);
  return e;
 }catch(error){if(/^Host_Error/.test(error?.message))throw error;if(e&&!e.free)ED_Free(e);return null;} // a Host_Error has ended the game: on up
}

function contact(p,state,s){
 s.respawned=true;state.frame=Respawn_NextFrame(s.frame,s.angles);
 callNative(p,pr_global_struct.PutClientInServer);p._respawn=state;p.v.origin=state.start;p.v.angles=s.angles;p.v.v_angle=s.angles;p.v.fixangle=1;
 p.v.health=respawnHealth(state);p.v.items=IT_AXE|s.objectives;p.v.weapon=IT_AXE;p.v.armorvalue=0;p.v.armortype=0;p.v.deadflag=0;p.v.effects=0;p.v.velocity=[0,0,0];p.v.punchangle=[0,0,0];
 for(const a of RESPAWN_AMMO)p.v[a]=0;powersOff(p);callNative(p,fnIndex('W_SetCurrentAmmo'));p.v.movetype=MOVETYPE_NONE;p.v.takedamage=0;p.v.solid=SOLID_SLIDEBOX;p.v.button0=p.v.button1=p.v.button2=p.v.impulse=0;field(p,'attack_finished',sv.time+RESPAWN_TURN);SV_LinkEdict(p,false);
 // The player is now somewhere else, but nothing recomputes waterlevel/watertype until the first full physics pass after the sequence,
 // and that pass runs the player's QuakeC (WaterMove) before SV_CheckWater: a death in slime or lava left the old liquid on the new dry
 // ground, so the first tick hurt (12 in slime, 30 in lava), and meanwhile (SV_RespawnFrame returns early for the whole rise) the face
 // and the clientdata water flag showed a submerged player. Refresh them for the destination now; a destination that really is wet is
 // seen as wet and obeys the native rules. (The old damage timer has always expired by then; clearing it is hygiene.)
 field(p,'dmgtime',0);SV_CheckWater(p);
 respawnLanded?.(); // the way back to the level the player came from is shut for good (card [3]; registered by sv_main, so this module does not import the seamless/renderer chain)
 s.alerted=SV_RespawnAlert(p);
 spawnGuard(p,s); // after the alert pass: the guard waits in its ordinary idle
}
/**
 * Runs the respawn sequence for the player each server physics frame (SV_Physics_Client, before normal player
 * physics). First finishes any pending travel ammo refresh. While a sequence is active it holds the player still and
 * untouchable, sets view_ofs to the sampled camera eye, and at contact (half way through) respawns the player at the
 * start with respawn health, the axe and kept keys, alerts the monsters and places a guard; on completion it gives
 * movement and damage back and sets the final view angles. Admission is Newer-only. Once admitted, finish ownership
 * even if the rendering option changes, so a player cannot remain frozen/invulnerable. Server time advances after the
 * physics pass. Render the pose actually processed by this pass, so camera/teleport/health/frame cross together.
 *
 * @param {edict_t} p the player edict; mutated
 * @returns {boolean} true when the sequence owned the player this frame (the caller skips its normal physics)
 */
export function SV_RespawnFrame(p){SV_RespawnFinishTravel(p);const state=p._respawn,s=state?.sequence;if(!s)return false;
 // Admission is Newer-only. Once admitted, finish ownership even if the
 // rendering option changes, so a player cannot remain frozen/invulnerable.
 if(!localContext()){state.sequence=null;p.v.movetype=MOVETYPE_WALK;p.v.takedamage=2;p.v.view_ofs=[0,0,22];return false;}
 // Server time advances after the physics pass. Render the pose actually
 // processed by this pass, so camera/teleport/health/frame cross together.
 s.motionTime=sv.time;const pose=Respawn_Sample(s,sv.time);
 if(pose.after&&!s.respawned)contact(p,state,s);
 if(!s.respawned){p.v.health=Math.min(0,p.v.health);p.v.weaponmodel=0;p.v.weaponframe=0;p.v.takedamage=0;}
 p.v.movetype=MOVETYPE_NONE;p.v.velocity=[0,0,0];p.v.button0=p.v.button1=p.v.button2=p.v.impulse=0;p.v.view_ofs=pose.eye.map((v,i)=>v-p.v.origin[i]);
 if(pose.complete){state.sequence=null;p.v.movetype=MOVETYPE_WALK;p.v.takedamage=2;p.v.view_ofs=[0,0,22];SV_CheckWater(p); /* (idempotent: also covers a game saved during the rise by a build without the refresh at contact) */{const r=s.riseAngles;const end=r?[Math.max(-90,Math.min(90,r[0])),SV_RespawnWireAngle(r[1]),0]:s.angles;p.v.v_angle=end;p.v.angles=end;}p.v.fixangle=1;field(p,'attack_finished',sv.time); /* (the rise ends facing into the level; a death saved before card [35] ends as it fell) */SV_LinkEdict(p,false);return true;}SV_LinkEdict(p,false);return true;
}
/**
 * Before QC's touch runs (SV_RunTriggerTouch in world.js): lets the player pick up a drop made by
 * `SV_RespawnDropInventory`, adding its weapon and ammo and selecting the recovered gun (stock single-player pickup
 * selects the recovered gun; ammo-only recovery keeps the existing weapon. W_SetCurrentAmmo owns its model/ammo
 * display). The drop entity is then freed.
 *
 * @param {edict_t} p the touching entity
 * @param {?edict_t} e the touched entity
 * @returns {?boolean} null when `e` is not a respawn drop (ordinary touch); false when it cannot be taken now (not the
 * live player 1, during a sequence, not local, the drop not yet on the ground or under 0.25 s old, the boxes not
 * overlapping, or an ammo total that would pass 16777216); true when it was collected
 */
export function SV_RespawnDropTouch(p,e){const d=e?._respawnDrop;if(!d)return null;if(e.free||p.index!==1||p.v.health<=0||p._respawn?.sequence||!localContext()||!(e.v.flags&FL_ONGROUND)||sv.time<d.born+.25)return false;
 for(let i=0;i<3;i++)if(p.v.absmin[i]>e.v.absmax[i]||p.v.absmax[i]<e.v.absmin[i])return false;
 const amounts=Respawn_DropAmmo(d),sums=RESPAWN_AMMO.map((a,i)=>p.v[a]+amounts[i]);if(sums.some(sum=>!Number.isInteger(sum)||sum>16777216))return false;
 (p._respawn||initialize(p)).custody=true;
 p.v.items=(p.v.items|0)|d.weapon;RESPAWN_AMMO.forEach((a,i)=>p.v[a]=sums[i]);
 // Stock single-player pickup selects the recovered gun; ammo-only recovery
 // keeps the existing weapon. W_SetCurrentAmmo owns its model/ammo display.
 if(d.weapon)p.v.weapon=d.weapon;else if(!p.v.weapon)p.v.weapon=IT_AXE;
 callNative(p,fnIndex('W_SetCurrentAmmo'));e._respawnDrop=null;ED_Free(e);return true;
}
/**
 * The respawn camera for this rendered frame, read by V_CalcRefdef after the native death roll, punch, bob and chase,
 * so the view follows the rigid head arc instead of the corpse. When the planned arc had no collision-free path
 * (`clearanceFallback`), the eye is pulled back along a trace from the body's pivot.
 *
 * @returns {?{ eye: Array<number>, angles: Array<number>, after: boolean, complete: boolean }} the `Respawn_Sample`
 * pose (eye in world space, Quake units; angles in degrees; plus its other fields) at the time the last physics pass
 * processed, or null when no local sequence is active
 */
export function SV_RespawnView(){const p=sv.edicts?.[1],s=p?._respawn?.sequence;if(!sv.active||!localContext()||!s)return null;const pose=Respawn_Sample(s,s.motionTime??sv.time);
 if(s.clearanceFallback){const base=pose.after?s.destinationPivot:s.sourcePivot,anchor=[base[0],base[1],base[2]+s.radius];const tr=SV_Move(anchor,[-1,-1,-1],[1,1,1],pose.eye,MOVE_NOMONSTERS,p);if(!tr.startsolid&&!tr.allsolid&&tr.fraction<1)pose.eye=Array.from(tr.endpos);}
 return pose;}

/**
 * The player's accumulated presentation frame (each completed respawn turns the world half a turn about the facing
 * axis), applied to the camera by R_RespawnCameraFrame (r_respawn.js) each rendered frame. Saved with the game as
 * part of the respawn state.
 *
 * @returns {Array<number>} quaternion [x, y, z, w]; the live state array or a frozen identity (do not mutate)
 */
export function SV_RespawnCameraFrame(){return sv.active&&localContext()?sv.edicts?.[1]?._respawn?.frame||IDENTITY:IDENTITY;}
/**
 * After CL_ParseClientdata, overwrites the client's ammo stats with the local server player's real ammo counts, which
 * the byte-sized clientdata fields cannot carry above 255 (respawn recovery can raise them). Only for the paired local
 * connection, in Newer Game or once the respawn system has taken custody or seen a death.
 *
 * @param {{ stats: Array<number> }} target the client state (`cl`); STAT_AMMO and the four ammo stats are written
 */
export function SV_RespawnInventoryStats(target){const p=svs.clients?.[0]?.edict,peer=cls.netcon?.driverdata;if(!localContext()||(!R_NewerGame()&&!p?._respawn?.custody&&!p?._respawn?.deaths)||!sv.active||!p?._respawn||cls.netcon?.driver!==0||cls.netcon.disconnected||!peer||peer.disconnected||peer!==svs.clients?.[0]?.netconnection)return;
 target.stats[STAT_AMMO]=p.v.currentammo;[STAT_SHELLS,STAT_NAILS,STAT_ROCKETS,STAT_CELLS].forEach((s,i)=>target.stats[s]=p.v[RESPAWN_AMMO[i]]);
}

/**
 * Called only after validating an owned save payload, before reconnect sends its model list (Host_Loadgame_f, for
 * each parsed edict). Classic loading of an Enhanced save retains those resources. A saved Fiend or Shambler (a guard
 * among them) keeps its model by name: its table position can differ between the saving and the loading game. A saved
 * respawn drop gets its precache (`SV_RespawnPrecache`), model, model index and skin back.
 *
 * @param {edict_t} e the entity just parsed from the save; mutated
 * @throws {Error} what `SV_RespawnPrecache` throws when no model slot is free
 */
export function SV_RespawnRestoreDropModel(e){
 // a saved Fiend or Shambler (a guard among them) keeps its model by name: its table position can differ between the saving and the loading game
 if(localContext()&&GUARDS.has(PR_GetString(e.v.classname))&&e.v.model){const at=sv.model_precache.indexOf(PR_GetString(e.v.model));if(at>0)e.v.modelindex=at;}
 if(!e._respawnDrop||!localContext())return;SV_RespawnPrecache();const kind=RESPAWN_WEAPONS.find(w=>w.bit===e._respawnDrop.weapon),model=kind?.model||'progs/backpack.mdl';e.v.model=ED_NewString(model);e.v.modelindex=sv.model_precache.indexOf(model);e.v.skin=kind?.skin||0;}

/**
 * Plan only at death, using bounded real BSP sweeps of the complete head arc. A sliding foot pivot preserves a rigid
 * body radius in constrained corridors. Both contact points borrow their actual offset floor, not the standing floor.
 * For the fall and the rise in turn, tries the original drift and then up to 24 sideways shifts until 65 sampled eye
 * positions sweep clear; with none clear, keeps the declared motion and sets `clearanceFallback` so the render-time
 * camera trace guards it.
 *
 * @param {edict_t} p the dying player (ignored by the traces)
 * @param {Object} s the respawn sequence being built; mutated: `sourceDrift`, `descent`, `turn` (seconds),
 * `destinationDrift`, `destinationDrop` (Quake units) and possibly `clearanceFallback`
 * @returns {Object} `s`
 */
export function SV_RespawnPlanMotion(p,s){
 const rightOf=angles=>{const yaw=angles[1]*Math.PI/180;return [Math.sin(yaw),-Math.cos(yaw),0];};
 const floorAt=(xy,z)=>{const tr=SV_Move([xy[0],xy[1],z+1],[0,0,0],[0,0,0],[xy[0],xy[1],z-8192],MOVE_NOMONSTERS,p);return !tr.startsolid&&!tr.allsolid&&tr.fraction<1&&tr.plane.normal[2]>.5?tr.endpos[2]:null;};
 const collisionFree=(after)=>{const cut=RESPAWN_DELAY+s.turn/2;let previous=null;for(let i=0;i<=64;i++){const age=after?cut+1e-7+s.turn*i/128:RESPAWN_DELAY+s.turn*i/128-1e-7;const eye=Respawn_Sample(s,s.at+Math.max(0,age)).eye;const trace=SV_Move(previous||eye,[-1,-1,-1],[1,1,1],eye,MOVE_NOMONSTERS,p);if(trace.startsolid||trace.allsolid||trace.fraction<1)return false;previous=eye;}return true;};
 for(const after of [false,true]){
  const pivot=after?s.destinationPivot:s.sourcePivot,contactSign=after?-1:1,sourceZ=s.sourcePivot[2]+s.radius,right=rightOf(s.angles);
  const initialDrift=after?s.destinationDrift:s.sourceDrift;let found=false;
  // Preserve an unobstructed original arc. Only constrained paths get a
  // progressively shifted pivot; all samples still share one rigid radius.
  for(let attempt=0;attempt<=24;attempt++){
   const amount=attempt===0?Math.hypot(...initialDrift):(s.radius+4)*attempt/24;
   const drift=right.map(v=>-contactSign*v*amount),xy=pivot.map((v,i)=>v+drift[i]+right[i]*contactSign*s.radius);
   const z=floorAt(xy,after?pivot[2]+s.radius:sourceZ);if(z===null)continue;
   if(after){s.destinationDrift=drift;s.destinationDrop=pivot[2]-(z+2);}else{s.sourceDrift=drift;s.descent=pivot[2]-(z+2);s.turn=Math.max(RESPAWN_TURN,2*Math.sqrt(2*Math.max(0,s.descent)/Math.max(1,sv_gravity.value)));}
   if(collisionFree(after)){found=true;break;}
  }
  if(!found){
   // A pathological squish/void has no collision-free rigid arc. Keep the
   // declared motion, and the render-time camera sweep is a last-resort guard.
   if(after){s.destinationDrift=initialDrift;s.destinationDrop=0;}else{s.sourceDrift=initialDrift;s.descent=Math.max(0,s.sourcePivot[2]-2-ground(p,[...s.sourcePivot]));}
   s.clearanceFallback=true;
  }
 }
 return s;
}

// Carry only admitted inventory custody. Stock SetChangeParms grants minimum
// shells; a recovered/axe-only inventory must not acquire that hidden refill.
let travelInventory=null,worldEpoch=0;
/**
 * Marks a new server world (SV_SpawnServer, right after the progs load): bumps the module's world epoch, so carried
 * travel is applied once in the next world, and clears the respawn-health notice.
 */
export function SV_RespawnWorldStart(){worldEpoch++;Respawn_NoticeClear();}
/**
 * Forgets the carried respawn travel and clears the notice: on loading a saved game (Host_Loadgame_f) and with
 * SV_ClearCarriedPowerups (a fresh run).
 */
export function SV_RespawnClearTravel(){travelInventory=null;Respawn_NoticeClear();}
/**
 * On a level change (SV_SaveSpawnparms, before QC's SetChangeParms), records what the player's respawn state carries
 * to the next level in module memory: always the respawn-health entitlement and the newest 512 levels seen; weapons and
 * ammunition only after a completed death (never from the middle of one), since stock SetChangeParms would otherwise
 * grant a hidden shells refill. Applied once by the next PutClientInServer in a new world.
 *
 * @param {?edict_t} p the client 0 player edict
 */
export function SV_RespawnCaptureTravel(p){travelInventory=null;if(!localContext()||!p?._respawn)return;const s=p._respawn;
 // Weapons and ammunition travel only after a death and never from the middle of one (the old rule). Progress (the respawn-health
 // entitlement and the levels seen) always travels: an unfinished death is not a completed respawn, so a level change in the middle of
 // one neither takes health nor gives it back, and cannot make a later return visit pay.
 const inventory=!s.sequence&&(s.custody||s.deaths)?{frame:s.frame.slice(),deaths:s.deaths,weapons:(p.v.items|0)&WEAPON_BITS,weapon:p.v.weapon,ammo:RESPAWN_AMMO.map(a=>p.v[a])}:null;
 const seen=[...new Set([...(Array.isArray(s.visited)?s.visited:[]),levelKey()])].slice(-MAX_VISITED); // the newest 512, matching what a save accepts
 travelInventory={epoch:worldEpoch,inventory,respawnHealth:entitlement(s),visited:seen};}
function restoreTravel(p){const data=travelInventory;if(!data||data.epoch===worldEpoch||!localContext()||p._respawn?.sequence)return;
 // Classic Quake (Newer off) neither keeps nor rewards the run: the data waits for the next arrival in Newer Game.
 if(!data.inventory&&!SV_RespawnAllowed())return;
 travelInventory=null;const state=p._respawn||initialize(p);
 if(data.inventory){state.frame=data.inventory.frame;state.deaths=data.inventory.deaths;state.custody=true;p.v.items=((p.v.items|0)&~WEAPON_BITS)|data.inventory.weapons;p.v.weapon=data.inventory.weapon;RESPAWN_AMMO.forEach((a,i)=>p.v[a]=data.inventory.ammo[i]);p._respawnAmmoPending=true;}
 // the first arrival in a level not seen before in this run gives 10 respawn health back (Normal only; a return visit, a reload and Level Select never do)
 state.respawnHealth=data.respawnHealth;state.visited=data.visited.slice();
 const here=levelKey();
 if(!state.visited.includes(here)){state.visited.push(here);if(state.visited.length>MAX_VISITED)state.visited.shift();if(normal()&&SV_RespawnAllowed()){const before=entitlement(state),after=Math.min(RESPAWN_HEALTH_MAX,before+RESPAWN_HEALTH_STEP);state.respawnHealth=after;if(after>before)Respawn_NoticeSet(RESPAWN_PLUS,sv.time);}}}
/**
 * After PutClientInServer (Host_Spawn_f) and at the start of each `SV_RespawnFrame`: when travel restored an
 * inventory, runs QC's W_SetCurrentAmmo once so the held weapon's model and ammo display match it.
 *
 * @param {edict_t} p the player; its `_respawnAmmoPending` flag is cleared
 */
export function SV_RespawnFinishTravel(p){if(p._respawnAmmoPending&&localContext()){p._respawnAmmoPending=false;callNative(p,fnIndex('W_SetCurrentAmmo'));}}
