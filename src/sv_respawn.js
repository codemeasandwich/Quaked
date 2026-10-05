// Native single-player death coordinator. QC retains damage/death callbacks;
// only its backpack/restart are replaced while this coordinator owns a death.
import {sv,svs,FL_MONSTER,FL_ONGROUND,MOVETYPE_NONE,MOVETYPE_WALK,MOVETYPE_TOSS,SOLID_NOT,SOLID_TRIGGER,SOLID_SLIDEBOX} from './server.js';
import {cls,ca_dedicated} from './client.js';
import {R_NewerGame} from './r_anim.js';
import {pr_crc,PR_GetString,pr_functions,pr_global_struct,pr_globals_int,EDICT_TO_PROG,PROG_TO_EDICT} from './progs.js';
import {ED_Alloc,ED_Free,ED_FindFunction,ED_NewString,GetEdictFieldValue} from './pr_edict.js';
import {PR_ExecuteProgram} from './pr_exec.js';
import {SV_Move,SV_LinkEdict,MOVE_NOMONSTERS} from './world.js';
import {Mod_ForName} from './gl_model.js';
import {COM_FindFile} from './pak.js';
import {sv_gravity} from './sv_phys.js';
import {Respawn_Sample,Respawn_NextFrame,RESPAWN_DELAY,RESPAWN_TURN} from './respawn_motion.js';
import {RESPAWN_WEAPONS,RESPAWN_AMMO,Respawn_DropAmmo} from './respawn_record.js';
import {IT_AXE,IT_KEY1,IT_KEY2,IT_INVISIBILITY,IT_INVULNERABILITY,IT_QUAD,IT_SUIT,STAT_AMMO,STAT_SHELLS,STAT_NAILS,STAT_ROCKETS,STAT_CELLS} from './quakedef.js';
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
export function SV_RespawnAllowed(){return localContext()&&R_NewerGame();}
function powersOff(p){p.v.items=(p.v.items|0)&~POWERS;for(const n of TIMER_FIELDS)field(p,n,0);p.v.effects&=~12;}
function initialize(p){const start=sv.edicts?.find(e=>e&&!e.free&&PR_GetString(e.v.classname)==='info_player_start');const location=p._respawnStart?.origin||Array.from(start?.v.origin||p.v.origin).map((v,i)=>v+(i===2?1:0));return p._respawn={version:1,start:location.slice(),startAngles:Array.from(p._respawnStart?.angles||start?.v.angles||p.v.v_angle),frame:[0,0,0,1],deaths:0,custody:false,sequence:null};}
function ground(p,point){const trace=SV_Move([point[0],point[1],point[2]+1],[0,0,0],[0,0,0],[point[0],point[1],point[2]-8192],MOVE_NOMONSTERS,p);return !trace.startsolid&&!trace.allsolid&&trace.fraction<1?trace.endpos[2]:point[2];}
function pivotFor(p,origin){const feet=origin[2]+p.v.mins[2];return [origin[0],origin[1],ground(p,[origin[0],origin[1],feet])+2];}
function driftFor(p,eye,radius,angles){const yaw=angles[1]*Math.PI/180,right=[Math.sin(yaw),-Math.cos(yaw),0],end=eye.map((v,i)=>v+right[i]*(radius+2));const tr=SV_Move(eye,[-1,-1,-1],[1,1,1],end,MOVE_NOMONSTERS,p);const need=Math.max(0,radius+2-(radius+2)*tr.fraction);return right.map(v=>-v*need);}
function callNative(p,functionIndex){const self=pr_global_struct.self,other=pr_global_struct.other,time=pr_global_struct.time;try{pr_global_struct.self=EDICT_TO_PROG(p);pr_global_struct.time=sv.time;PR_ExecuteProgram(functionIndex);}finally{pr_global_struct.self=self;pr_global_struct.other=other;pr_global_struct.time=time;}}
// Admit a bounded native resource set at local startup even for Classic.
// Gameplay admission remains Newer-only; this avoids unsafe active-server
// precache mutation when the owner enables the enhancement later.
export function SV_RespawnPrecache(){if(!localContext())return;for(const n of new Set([...RESPAWN_WEAPONS.map(w=>w.model),'progs/backpack.mdl'])){if(sv.model_precache.includes(n)||!COM_FindFile(n))continue;const i=sv.model_precache.findIndex((v,i)=>i>0&&!v);if(i<1||i>=256)throw Error('Respawn drop model budget exhausted');sv.model_precache[i]=n;sv.models[i]=Mod_ForName(n,true);}}
export function SV_RespawnDropInventory(p){
 const state=p._respawn||initialize(p),weapons=RESPAWN_WEAPONS.filter(w=>(p.v.items|0)&w.bit),payloads=[],orphan=[0,0,0,0];
 for(const ammo of RESPAWN_AMMO){const total=Math.max(0,Math.floor(p.v[ammo])),matching=weapons.filter(w=>w.ammo===ammo);
  if(matching.length){const each=Math.floor(total/matching.length),remainder=total%matching.length;matching.forEach((w,i)=>payloads.push({weapon:w.bit,ammo,amount:each+(i<remainder?1:0),model:w.model}));}
  else if(total)orphan[RESPAWN_AMMO.indexOf(ammo)]=total;
 }
 if(orphan.some(x=>x>0))payloads.push({weapon:0,pools:orphan,model:'progs/backpack.mdl'});
 // Allocate all payloads before relinquishing inventory. Partial allocation
 // failures cannot silently consume ammunition or leave a duplicated half-drop.
 const allocated=[];try{for(const data of payloads){const e=ED_Alloc();allocated.push(e);const i=payloads.indexOf(data),angle=(state.deaths*2.399963+i*2.399963),origin=Array.from(p.v.origin);
  e.v.classname=ED_NewString('dropped_weapon');e.v.model=ED_NewString(data.model);e.v.modelindex=sv.model_precache.indexOf(data.model);if(e.v.modelindex<1)throw Error('Respawn drop model unavailable: '+data.model);
  e.v.origin=origin;e.v.mins=[-8,-8,-4];e.v.maxs=[8,8,12];e.v.size=[16,16,16];e.v.movetype=MOVETYPE_TOSS;e.v.solid=SOLID_TRIGGER;e.v.touch=fnIndex('SUB_Null');e.v.velocity=[Math.cos(angle)*(80+i*5),Math.sin(angle)*(80+i*5),170+i*8];e.v.angles=[0,angle*180/Math.PI,0];
  e._respawnDrop={version:data.pools?2:1,id:sv.name+':'+(state.deaths+1)+':'+sv.time+':'+e.index,weapon:data.weapon,...(data.pools?{pools:data.pools.slice()}:{ammo:data.ammo,amount:data.amount}),born:sv.time};SV_LinkEdict(e,false);
 }}catch(error){for(const e of allocated)ED_Free(e);throw error;}
 for(const ammo of RESPAWN_AMMO)p.v[ammo]=0;p.v.currentammo=0;p.v.weapon=0;p.v.items=(p.v.items|0)&~WEAPON_BITS;powersOff(p);state.deaths++;state.custody=true;return allocated;
}
function begin(p){if(p._respawn?.sequence)return;const state=p._respawn||initialize(p),source=Array.from(p.v.origin),angles=Array.from(p.v.v_angle);angles[2]=0;
 const foot=source[2]+p.v.mins[2],floor=ground(p,[source[0],source[1],foot]),radius=Math.max(8,p.v.view_ofs[2]-p.v.mins[2]-2),descent=Math.max(0,foot-floor);
 // Match native V_CalcRefdef's node-line bias and exact standing eye.
 const bias=1/32,destination=[state.start[0]+bias,state.start[1]+bias,state.start[2]+22+bias-radius],sourcePivot=[source[0]+bias,source[1]+bias,foot+2+bias],turn=Math.max(RESPAWN_TURN,2*Math.sqrt(2*descent/Math.max(1,sv_gravity.value)));
 const sourceEye=[source[0]+bias,source[1]+bias,source[2]+p.v.view_ofs[2]+bias],destinationEye=[...destination];destinationEye[2]+=radius;
 const sequence={at:sv.time,sourcePivot,destinationPivot:destination,sourceDrift:driftFor(p,sourceEye,radius,angles),destinationDrift:driftFor(p,destinationEye,radius,[angles[0],angles[1]+180,0]),angles,frame:state.frame.slice(),radius,descent,turn,respawned:false,objectives:(p.v.items|0)&(IT_KEY1|IT_KEY2),damage:2};
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
export function SV_RespawnFunctionLeave(token){if(token?.death&&token.death._respawn?.sequence&&!token.death._respawn.sequence.respawned){retainDeath(token.death,token.before);token.death.v.health=Math.min(0,token.death.v.health);token.death.v.weapon=0;token.death.v.weaponmodel=0;token.death.v.weaponframe=0;token.death.v.takedamage=0;}if(token?.spawn){token.spawn._respawnStart={origin:Array.from(token.spawn.v.origin),angles:Array.from(token.spawn.v.v_angle)};if(SV_RespawnAllowed()&&!token.spawn._respawn)initialize(token.spawn);restoreTravel(token.spawn);}if(token?.overflow)RESPAWN_AMMO.forEach((a,i)=>{if(token.values[i])token.overflow.v[a]=Math.max(token.values[i],token.overflow.v[a]);});}
export function SV_RespawnAlert(p){const found=fnIndex('FoundTarget');let alerted=0;for(const e of sv.edicts||[]){if(!e||e.free||(!(e.v.flags&FL_MONSTER)&&!PR_GetString(e.v.classname).startsWith('monster_'))||e.v.health<=0||e.v.deadflag!==0)continue;e.v.enemy=EDICT_TO_PROG(p);field(e,'goalentity',EDICT_TO_PROG(p),true);field(e,'last_seen',sv.time);field(e,'show_hostile',sv.time+1);
 // Native running callbacks preserve swimming/flying/ground AI. Scripted or
 // pinned actors still receive the target without being given a NULL thinker.
 const run=field(e,'th_run',undefined,true);if(found&&run>0&&run<pr_functions.length&&e.v.movetype!==MOVETYPE_NONE)callNative(e,found);e._respawnAlert=sv.time;alerted++;
 }return alerted;}
function contact(p,state,s){
 s.respawned=true;state.frame=Respawn_NextFrame(s.frame,s.angles);
 callNative(p,pr_global_struct.PutClientInServer);p._respawn=state;p.v.origin=state.start;p.v.angles=s.angles;p.v.v_angle=s.angles;p.v.fixangle=1;
 p.v.health=100;p.v.items=IT_AXE|s.objectives;p.v.weapon=IT_AXE;p.v.armorvalue=0;p.v.armortype=0;p.v.deadflag=0;p.v.effects=0;p.v.velocity=[0,0,0];p.v.punchangle=[0,0,0];
 for(const a of RESPAWN_AMMO)p.v[a]=0;powersOff(p);callNative(p,fnIndex('W_SetCurrentAmmo'));p.v.movetype=MOVETYPE_NONE;p.v.takedamage=0;p.v.solid=SOLID_SLIDEBOX;p.v.button0=p.v.button1=p.v.button2=p.v.impulse=0;field(p,'attack_finished',sv.time+RESPAWN_TURN);SV_LinkEdict(p,false);s.alerted=SV_RespawnAlert(p);
}
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
 if(pose.complete){state.sequence=null;p.v.movetype=MOVETYPE_WALK;p.v.takedamage=2;p.v.view_ofs=[0,0,22];p.v.v_angle=s.angles;p.v.angles=s.angles;p.v.fixangle=1;field(p,'attack_finished',sv.time);SV_LinkEdict(p,false);return true;}SV_LinkEdict(p,false);return true;
}
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
export function SV_RespawnView(){const p=sv.edicts?.[1],s=p?._respawn?.sequence;if(!sv.active||!localContext()||!s)return null;const pose=Respawn_Sample(s,s.motionTime??sv.time);
 if(s.clearanceFallback){const base=pose.after?s.destinationPivot:s.sourcePivot,anchor=[base[0],base[1],base[2]+s.radius];const tr=SV_Move(anchor,[-1,-1,-1],[1,1,1],pose.eye,MOVE_NOMONSTERS,p);if(!tr.startsolid&&!tr.allsolid&&tr.fraction<1)pose.eye=Array.from(tr.endpos);}
 return pose;}

export function SV_RespawnCameraFrame(){return sv.active&&localContext()?sv.edicts?.[1]?._respawn?.frame||IDENTITY:IDENTITY;}
export function SV_RespawnInventoryStats(target){const p=svs.clients?.[0]?.edict,peer=cls.netcon?.driverdata;if(!localContext()||(!R_NewerGame()&&!p?._respawn?.custody&&!p?._respawn?.deaths)||!sv.active||!p?._respawn||cls.netcon?.driver!==0||cls.netcon.disconnected||!peer||peer.disconnected||peer!==svs.clients?.[0]?.netconnection)return;
 target.stats[STAT_AMMO]=p.v.currentammo;[STAT_SHELLS,STAT_NAILS,STAT_ROCKETS,STAT_CELLS].forEach((s,i)=>target.stats[s]=p.v[RESPAWN_AMMO[i]]);
}

// Called only after validating an owned save payload, before reconnect sends
// its model list. Classic loading of an Enhanced save retains those resources.
export function SV_RespawnRestoreDropModel(e){if(!e._respawnDrop||!localContext())return;SV_RespawnPrecache();const model=RESPAWN_WEAPONS.find(w=>w.bit===e._respawnDrop.weapon)?.model||'progs/backpack.mdl';e.v.model=ED_NewString(model);e.v.modelindex=sv.model_precache.indexOf(model);}

// Plan only at death, using bounded real BSP sweeps of the complete head arc.
// A sliding foot pivot preserves a rigid body radius in constrained corridors.
// Both contact points borrow their actual offset floor, not the standing floor.
export function SV_RespawnPlanMotion(p,s){
 const yaw=s.angles[1]*Math.PI/180,right=[Math.sin(yaw),-Math.cos(yaw),0];
 const floorAt=(xy,z)=>{const tr=SV_Move([xy[0],xy[1],z+1],[0,0,0],[0,0,0],[xy[0],xy[1],z-8192],MOVE_NOMONSTERS,p);return !tr.startsolid&&!tr.allsolid&&tr.fraction<1&&tr.plane.normal[2]>.5?tr.endpos[2]:null;};
 const collisionFree=(after)=>{const cut=RESPAWN_DELAY+s.turn/2;let previous=null;for(let i=0;i<=64;i++){const age=after?cut+1e-7+s.turn*i/128:RESPAWN_DELAY+s.turn*i/128-1e-7;const eye=Respawn_Sample(s,s.at+Math.max(0,age)).eye;const trace=SV_Move(previous||eye,[-1,-1,-1],[1,1,1],eye,MOVE_NOMONSTERS,p);if(trace.startsolid||trace.allsolid||trace.fraction<1)return false;previous=eye;}return true;};
 for(const after of [false,true]){
  const pivot=after?s.destinationPivot:s.sourcePivot,contactSign=after?-1:1,sourceZ=s.sourcePivot[2]+s.radius;
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
export function SV_RespawnWorldStart(){worldEpoch++;}
export function SV_RespawnClearTravel(){travelInventory=null;}
export function SV_RespawnCaptureTravel(p){travelInventory=null;if(!localContext()||!p?._respawn||(!p._respawn.custody&&!p._respawn.deaths)||p._respawn.sequence)return;travelInventory={epoch:worldEpoch,frame:p._respawn.frame.slice(),deaths:p._respawn.deaths,weapons:(p.v.items|0)&WEAPON_BITS,weapon:p.v.weapon,ammo:RESPAWN_AMMO.map(a=>p.v[a])};}
function restoreTravel(p){const data=travelInventory;if(!data||data.epoch===worldEpoch||!localContext()||p._respawn?.sequence)return;travelInventory=null;const state=p._respawn||initialize(p);state.frame=data.frame;state.deaths=data.deaths;state.custody=true;p.v.items=((p.v.items|0)&~WEAPON_BITS)|data.weapons;p.v.weapon=data.weapon;RESPAWN_AMMO.forEach((a,i)=>p.v[a]=data.ammo[i]);p._respawnAmmoPending=true;}
export function SV_RespawnFinishTravel(p){if(p._respawnAmmoPending&&localContext()){p._respawnAmmoPending=false;callNative(p,fnIndex('W_SetCurrentAmmo'));}}
