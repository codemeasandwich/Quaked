// Decode shipped BSP collision planes and clipnodes, then run the actual
// SV_Move player hull sweep. This proves physical threshold reachability.
await import('../src/engine/render/gl_rsurf.js');
const {sv,SOLID_BSP,MOVETYPE_PUSH}=await import('../src/engine/server/server.js');
const {edict_t}=await import('../src/engine/progs/progs.js');
const {R_BuildPortals,R_ClearPortals}=await import('../src/newer/render/gl_portal.js');
const {SV_ClearWorld,SV_Move,SV_PortalBackingContact,MOVE_NOMONSTERS}=await import('../src/engine/server/world.js');
const worldModule=await import('../src/engine/server/world.js');
const physics=await import('../src/engine/server/sv_phys.js');
const progs=await import('../src/engine/progs/progs.js');
const {svs,FL_CLIENT,MOVETYPE_WALK}=await import('../src/engine/server/server.js');
const {Cvar_FindVar,Cvar_RegisterVariable,cvar_t}=await import('../src/engine/common/cvar.js');
const {R_PortalsBeginFrame,r_portals}=await import('../src/newer/render/gl_portal.js');
const { r_newer_portals } = await import('../src/newer/mode.js');
Deno.test('shipped start hub portal thresholds are physically reachable or use confirmed backing contact', async () => {
const previous={models:sv.models,worldmodel:sv.worldmodel,edicts:sv.edicts,num_edicts:sv.num_edicts,max_edicts:sv.max_edicts};
try {
const pak=await Deno.readFile(new URL('../pak0.pak',import.meta.url));
const pv=new DataView(pak.buffer,pak.byteOffset,pak.byteLength);
const decode=(data)=>new TextDecoder().decode(data).split('\0')[0];
let bsp;
for(let i=pv.getInt32(4,true),end=i+pv.getInt32(8,true);i<end;i+=64){if(decode(pak.subarray(i,i+56))==='maps/start.bsp'){const pos=pv.getInt32(i+56,true);bsp=pak.subarray(pos,pos+pv.getInt32(i+60,true));break;}}
const d=new DataView(bsp.buffer,bsp.byteOffset,bsp.byteLength);
const lumps=Array.from({length:15},(_,i)=>({o:d.getInt32(4+i*8,true),n:d.getInt32(8+i*8,true)}));
const vector=o=>[d.getFloat32(o,true),d.getFloat32(o+4,true),d.getFloat32(o+8,true)];
const planes=Array.from({length:lumps[1].n/20},(_,i)=>{const o=lumps[1].o+i*20;return {normal:vector(o),dist:d.getFloat32(o+12,true),type:d.getInt32(o+16,true)};});
const clipnodes=Array.from({length:lumps[9].n/8},(_,i)=>{const o=lumps[9].o+i*8;return{planenum:d.getInt32(o,true),children:[d.getInt16(o+4,true),d.getInt16(o+6,true)]};});
const models=Array.from({length:lumps[14].n/64},(_,i)=>{const o=lumps[14].o+i*64;return{mins:vector(o),maxs:vector(o+12),headnodes:Array.from({length:4},(_,j)=>d.getInt32(o+36+j*4,true))};});
const tex=lumps[2].o;
const textures=Array.from({length:d.getInt32(tex,true)},(_,i)=>{const o=d.getInt32(tex+4+i*4,true);return o<0?'':decode(bsp.subarray(tex+o,tex+o+16));});
const surfaces=Array.from({length:lumps[7].n/20},(_,i)=>{
 const o=lumps[7].o+i*20,pn=d.getUint16(o,true),side=d.getInt16(o+2,true),fe=d.getInt32(o+4,true),ne=d.getUint16(o+8,true),ti=d.getUint16(o+10,true);
 const name=textures[d.getInt32(lumps[6].o+ti*40+32,true)];
 const verts=Array.from({length:ne},(_,j)=>{const e=d.getInt32(lumps[13].o+(fe+j)*4,true),v=d.getUint16(lumps[12].o+Math.abs(e)*4+(e<0?2:0),true);return vector(lumps[3].o+v*12);});
 return{flags:(side?2:0)+(name.startsWith('*')?0x10:0),plane:planes[pn],texinfo:{texture:{name}},polys:{numverts:ne,verts,next:null}};
});
const leaf={contents:-1,firstmarksurface:null,nummarksurfaces:0,compressed_vis:null};
const renderModel={entities:decode(bsp.subarray(lumps[0].o,lumps[0].o+lumps[0].n)),surfaces,submodels:models,nodes:[leaf],leafs:[{contents:-2},leaf],numleafs:1};
const portals=R_BuildPortals(renderModel);
const hull=(i,mins,maxs)=>({planes,clipnodes,firstclipnode:models[0].headnodes[i],lastclipnode:clipnodes.length-1,clip_mins:mins,clip_maxs:maxs});
const collisionModel={type:0,mins:models[0].mins,maxs:models[0].maxs,hulls:[hull(1,[-16,-16,-24],[16,16,32]),hull(1,[-16,-16,-24],[16,16,32]),hull(2,[-32,-32,-24],[32,32,64])]};
const world=new edict_t(0,128),player=new edict_t(1,128);
world.v.solid=SOLID_BSP;world.v.movetype=MOVETYPE_PUSH;world.v.modelindex=1;
player.v.mins=[-16,-16,-24];player.v.maxs=[16,16,32];
sv.models=[null,collisionModel];sv.worldmodel=collisionModel;sv.edicts=[world,player];sv.num_edicts=2;sv.max_edicts=2;
SV_ClearWorld();
const result=portals.map(p=>{const start=p.center.map((v,i)=>v+p.normal[i]*48),end=p.center.map((v,i)=>v-p.normal[i]*.5);const t=SV_Move(start,player.v.mins,player.v.maxs,end,MOVE_NOMONSTERS,player);player.v.origin=start;const from48=SV_PortalBackingContact(player,p,48);player.v.origin=t.endpos;const distance=t.endpos.reduce((sum,v,i)=>sum+(v-p.center[i])*p.normal[i],0);const atContact=SV_PortalBackingContact(player,p,distance);return{trigger:p.triggerModel,center:p.center,normal:p.normal,startsolid:t.startsolid,allsolid:t.allsolid,fraction:t.fraction,endpos:Array.from(t.endpos),from48,atContact,distance};});
const difficulty=result.filter(p=>['*1','*2','*3'].includes(p.trigger)&&p.center[1]===1384&&p.normal[1]===-1);
if(difficulty.length!==3||difficulty.some(p=>p.startsolid||p.allsolid||p.fraction!==1||p.distance>=0))throw new Error('difficulty front hull cannot cross the visible plane');
// A 48-unit aperture only has ~8 units of lateral clearance for the 32-unit
// player hull. Valid offsets cross; a frame obstruction must not grant a
// camera teleport or widen the permitted backing-contact radius.
for(const p of portals.filter(p=>['*1','*2','*3'].includes(p.triggerModel)&&p.center[1]===1384&&p.normal[1]===-1)){
 for(const side of [-12,-4,4,12]){
  const start=p.center.map((v,i)=>v+p.normal[i]*48),end=p.center.map((v,i)=>v-p.normal[i]*.5);
  start[0]+=side;end[0]+=side;
  const trace=SV_Move(start,player.v.mins,player.v.maxs,end,MOVE_NOMONSTERS,player);
  if(Math.abs(side)===4){
   if(trace.startsolid||trace.allsolid||trace.fraction!==1)throw new Error('valid lateral hull offset cannot cross');
  }else{
   player.v.origin=trace.endpos;
   const distance=trace.endpos.reduce((sum,v,i)=>sum+(v-p.center[i])*p.normal[i],0);
   if(trace.fraction>=1||Math.abs(distance-24.03125)>.001||SV_PortalBackingContact(player,p,distance))throw new Error('arch frame must obstruct an offset that does not fit');
  }
 }
}
const nightmare=result.find(p=>p.trigger==='*19'&&p.normal[1]===1);
if(!nightmare||nightmare.startsolid||nightmare.fraction>=1||Math.abs(nightmare.distance-8.03125)>1e-6||!nightmare.atContact)throw new Error('nightmare backing must permit QC at actual hull contact');
const reachable=result.filter(p=>!p.startsolid&&!p.allsolid);
if(reachable.some(p=>p.from48||(p.fraction<1&&!p.atContact)))throw new Error('reachable source either teleports early or stalls at a backing wall');
if(reachable.length!==13)throw new Error('unexpected shipped start hub source coverage');

// Now exercise the actual player physics caller: the wall clips the normal
// component before its final trigger link. QC is the only simulated action.
const portal=portals.find(p=>p.triggerModel==='*19'&&p.normal[1]===1);
if(!Cvar_FindVar('r_hdr'))Cvar_RegisterVariable(new cvar_t('r_hdr','1'));
const hdr=Cvar_FindVar('r_hdr');
const old={header:progs.progs,strings:progs.pr_strings_data,globals:progs.pr_global_struct,
 staticClients:svs.maxclients,precache:sv.model_precache,time:sv.time,
 hdrString:hdr.string,hdrValue:hdr.value,portals:r_portals.value,newer:r_newer_portals.value,
 physicsSV:physics.sv,physicsSVS:physics.svs,physicsGlobals:physics.pr_global_struct,
 dt:physics.host_frametime,gravity:physics.sv_gravity.value,player:physics.sv_player};
const callbackNames=['SV_Move','SV_TestEntityPosition','SV_LinkEdict','SV_PointContents','PR_ExecuteProgram','EDICT_TO_PROG'];
const oldCallbacks=Object.fromEntries(callbackNames.map(name=>[name,physics[name]]));
try {
 const table='\0player\0trigger_teleport\0'+portal.triggerTarget+'\0info_teleport_destination\0';
 progs.PR_SetStringsData(new TextEncoder().encode(table));
 progs.PR_SetProgs({numfielddefs:0});
 const trigger=new edict_t(2,128),receiver=new edict_t(3,128);
 player.v.classname=table.indexOf('player');player.v.flags=FL_CLIENT;
 player.v.movetype=MOVETYPE_WALK;player.v.health=100;
 player.v.origin=[544,1460,56];player.v.velocity=[20,-200,0];
 player.v.v_angle=[13,255,0];player.v.angles=[-13/3,255,0];
 trigger.v.classname=table.indexOf('trigger_teleport');trigger.v.model=trigger.v.modelindex=0;
 trigger.v.mins=portal.triggerMins;trigger.v.maxs=portal.triggerMaxs;
 trigger.v.target=table.indexOf(portal.triggerTarget);trigger.v.touch=42;
 receiver.v.classname=table.indexOf('info_teleport_destination');receiver.v.targetname=trigger.v.target;
 receiver.v.origin=portal.dest;
 sv.edicts=[world,player,trigger,receiver];sv.num_edicts=sv.max_edicts=4;
 sv.model_precache=['','maps/start.bsp',portal.triggerModel];sv.time=10;svs.maxclients=1;
 hdr.string='1';hdr.value=r_portals.value=r_newer_portals.value=1;R_PortalsBeginFrame(true);
 const globals={self:0,other:0,time:10,PlayerPreThink:0,PlayerPostThink:0};
 progs.PR_SetGlobalStruct(globals);
 physics.SV_SetState(sv,{clients:[{active:true}]},globals);
 physics.SV_SetPlayer(player);physics.SV_SetFrametime(.05);physics.sv_gravity.value=0;
 let applied=false,normalWasClipped=false,calls=0;
 const qc=()=>{calls++;player.v.origin=Array.from(receiver.v.origin);player.v.velocity=[0,300,0];
  player.v.angles=player.v.v_angle=[0,portal.yaw,0];player.v.teleport_time=10.7;};
 physics.SV_SetCallbacks({SV_Move,SV_TestEntityPosition:worldModule.SV_TestEntityPosition,
  SV_PointContents:()=>-1,PR_ExecuteProgram:()=>{},EDICT_TO_PROG:progs.EDICT_TO_PROG,
  SV_LinkEdict:(ent,touch)=>{if(touch){normalWasClipped=ent.v.velocity[1]===0;
   applied=worldModule.SV_RunTriggerTouch(ent,trigger,qc,origin=>{const t=SV_Move(origin,ent.v.mins,ent.v.maxs,origin,MOVE_NOMONSTERS,ent);return!t.startsolid&&!t.allsolid;});}}});
 physics.SV_Physics_Client(player,1);
 if(!normalWasClipped||!applied||calls!==1)throw new Error('actual physics must retain portal momentum after wall clipping');
 const yaw=portal.yaw*Math.PI/180,expected=[200*Math.cos(yaw)-20*Math.sin(yaw),200*Math.sin(yaw)+20*Math.cos(yaw),0];
 if(expected.some((v,i)=>Math.abs(v-player.v.velocity[i])>.001))throw new Error('only this frame normal momentum should be recovered');
 if(Math.abs(player.v.v_angle[0]-13)>.001||Math.abs(player.v.v_angle[1]-(portal.yaw+345)%360)>.001)throw new Error('actual physics lost incoming camera angles');
 // At the same sv.time, after returning from physics, its motion snapshot is
 // no longer eligible. A separate forced touch must not reuse the old speed.
 player.v.origin=[544,1456.03125,56];player.v.velocity=[0,0,0];player.v.teleport_time=0;
 if(worldModule.SV_RunTriggerTouch(player,trigger,qc,()=>true)!==false)throw new Error('stale same-frame momentum survived physics scope');
 if(calls!==2)throw new Error('forced touch should remain native QC');
} finally {
 progs.PR_SetProgs(old.header);progs.PR_SetStringsData(old.strings);progs.PR_SetGlobalStruct(old.globals);
 sv.model_precache=old.precache;sv.time=old.time;svs.maxclients=old.staticClients;
 hdr.string=old.hdrString;hdr.value=old.hdrValue;r_portals.value=old.portals;r_newer_portals.value=old.newer;
 R_PortalsBeginFrame(true);
 physics.SV_SetState(old.physicsSV,old.physicsSVS,old.physicsGlobals);
 physics.SV_SetPlayer(old.player);physics.SV_SetFrametime(old.dt);physics.sv_gravity.value=old.gravity;
 physics.SV_SetCallbacks(oldCallbacks);
}
} finally {
Object.assign(sv,previous);
R_ClearPortals();
SV_ClearWorld();
}
});
