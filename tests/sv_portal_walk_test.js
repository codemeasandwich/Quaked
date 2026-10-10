// Card [14]: walking into camera portals with real gravity, a standing player and held forward input, through the
// real SV_Physics_Client and the shipped collision of pak0 maps. Outcomes: 'camera' (the seamless crossing ran),
// 'native' (stock QC teleport) or no teleport at all (a stall). Walking probe by an independent reviewer, trimmed.
//  * hub arches (start.bsp skill arches: a sill higher than a step, a 48-unit opening for a 32-unit hull) used to
//    stall indefinitely, centred or not; they now teleport a frame or two after the hull meets the sill;
//  * E1M2 portals whose entry has a step or a slide-through frame keep the camera crossing, exactly as before.
await import('../src/engine/render/gl_rsurf.js');
const {sv,SOLID_BSP,MOVETYPE_PUSH,svs,FL_CLIENT,MOVETYPE_WALK}=await import('../src/engine/server/server.js');
const progs=await import('../src/engine/progs/progs.js');const {edict_t}=progs;
const {R_BuildPortals,R_PortalsBeginFrame,r_portals,R_TransformPortalPoint}=await import('../src/newer/render/gl_portal.js');
const worldModule=await import('../src/engine/server/world.js');const {SV_ClearWorld,SV_Move,MOVE_NOMONSTERS}=worldModule;
const physics=await import('../src/engine/server/sv_phys.js');
const {Cvar_FindVar,Cvar_RegisterVariable,cvar_t}=await import('../src/engine/common/cvar.js');
const { r_newer_portals } = await import('../src/newer/mode.js');
const FL_ONGROUND=512;
const decode=(data)=>new TextDecoder().decode(data).split('\0')[0];
function loadPak(path){return Deno.readFile(new URL(path,import.meta.url));}
function findBsp(pak,name){const pv=new DataView(pak.buffer,pak.byteOffset,pak.byteLength);for(let i=pv.getInt32(4,true),end=i+pv.getInt32(8,true);i<end;i+=64){if(decode(pak.subarray(i,i+56))===name){const pos=pv.getInt32(i+56,true);return pak.subarray(pos,pos+pv.getInt32(i+60,true));}}}
function build(bsp){
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
return {portals,collisionModel};
}
Deno.test('camera portals: hub arches no longer stall; step and slide-through entries keep the camera crossing',async()=>{
if(!Cvar_FindVar('r_hdr'))Cvar_RegisterVariable(new cvar_t('r_hdr','1'));
const hdr=Cvar_FindVar('r_hdr');hdr.string='1';hdr.value=r_portals.value=r_newer_portals.value=1;
const out=[];
// [portal, lateral offset, yaw]: entries with a step or a frame the walk move slides past (they keep the camera crossing)
const E1M5=[[5,-12,0]]; // held 20 units short by a frame, clear exit: the player crosses from the origin projected onto the threshold
const E1M2=[[1,-12,0],[1,0,0],[1,12,0],[3,-12,0],[3,0,0],[3,12,0],[5,-8,0],[7,-14,0],[7,-12,-15],[10,-10,35]];
const pak0=await loadPak('../pak0.pak');
const maps=[['start',pak0,'maps/start.bsp'],['e1m2',pak0,'maps/e1m2.bsp'],['e1m5',pak0,'maps/e1m5.bsp']];
for(const [label,pak,name] of maps){
 const {portals,collisionModel}=build(findBsp(pak,name));
 for(let pi=0;pi<portals.length;pi++){
  const p=portals[pi];
  const table='\0player\0trigger_teleport\0'+p.triggerTarget+'\0info_teleport_destination\0';
  progs.PR_SetStringsData(new TextEncoder().encode(table));progs.PR_SetProgs({numfielddefs:0});
  const world=new edict_t(0,128),player=new edict_t(1,128),trigger=new edict_t(2,128),receiver=new edict_t(3,128);
  world.v.solid=SOLID_BSP;world.v.movetype=MOVETYPE_PUSH;world.v.modelindex=1;
  player.v.mins=[-16,-16,-24];player.v.maxs=[16,16,32];
  player.v.classname=table.indexOf('player');player.v.movetype=MOVETYPE_WALK;player.v.health=100;
  trigger.v.classname=table.indexOf('trigger_teleport');trigger.v.model=trigger.v.modelindex=0;
  trigger.v.mins=p.triggerMins;trigger.v.maxs=p.triggerMaxs;trigger.v.target=table.indexOf(p.triggerTarget);trigger.v.touch=42;
  receiver.v.classname=table.indexOf('info_teleport_destination');receiver.v.targetname=trigger.v.target;receiver.v.origin=Array.from(p.dest);
  sv.models=[null,collisionModel];sv.worldmodel=collisionModel;sv.edicts=[world,player,trigger,receiver];sv.num_edicts=sv.max_edicts=4;
  sv.model_precache=['',name,p.triggerModel];sv.time=10;svs.maxclients=1;SV_ClearWorld();R_PortalsBeginFrame(true);
  const globals={self:0,other:0,time:10,PlayerPreThink:0,PlayerPostThink:0};progs.PR_SetGlobalStruct(globals);
  physics.SV_SetState(sv,{clients:[{active:true}]},globals);physics.SV_SetPlayer(player);physics.SV_SetFrametime(.05);physics.sv_gravity.value=800;
  const inside=ent=>[0,1,2].every(i=>ent.v.origin[i]+ent.v.maxs[i]>=trigger.v.mins[i]&&ent.v.origin[i]+ent.v.mins[i]<=trigger.v.maxs[i]);
  let qcCalls=0,res=null;
  const qc=()=>{qcCalls++;player.v.origin=Array.from(receiver.v.origin);player.v.velocity=[0,0,0];player.v.teleport_time=sv.time+.7;};
  const clear=origin=>{const t=SV_Move(origin,player.v.mins,player.v.maxs,origin,MOVE_NOMONSTERS,player);return!t.startsolid&&!t.allsolid;};
  physics.SV_SetCallbacks({SV_Move,SV_TestEntityPosition:worldModule.SV_TestEntityPosition,SV_PointContents:()=>-1,PR_ExecuteProgram:()=>{},EDICT_TO_PROG:progs.EDICT_TO_PROG,
   SV_LinkEdict:(ent,touch)=>{if(touch&&inside(ent)){const pre=Array.from(ent.v.origin);const dist=pre.reduce((s,v,i)=>s+(v-p.center[i])*p.normal[i],0);const r=worldModule.SV_RunTriggerTouch(ent,trigger,qc,clear);if(qcCalls&&res===null){res={kind:r?'camera':'native',dist:+dist.toFixed(2),at:pre.map(v=>+v.toFixed(1)),after:Array.from(ent.v.origin),speed:Math.hypot(...Array.from(ent.v.velocity)),projected:R_TransformPortalPoint(p,pre.map((v,i)=>v-p.normal[i]*Math.max(0,dist))),plain:R_TransformPortalPoint(p,pre)};}}}});
  const n=p.normal;const wall=Math.abs(n[2])<0.7;
  if(label==='start'&&['*1','*2','*3'].includes(p.triggerModel)&&n[1]===-1&&wall){ // the sill: obstructed at contact, not while approaching
   const s0=p.center.map((v,i)=>v+n[i]*72);s0[2]+=4;const dr=SV_Move(s0,player.v.mins,player.v.maxs,[s0[0],s0[1],s0[2]-80],MOVE_NOMONSTERS,player);player.v.origin=Array.from(dr.endpos);
   const hit=SV_Move(player.v.origin,player.v.mins,player.v.maxs,player.v.origin.map((v,i)=>v-n[i]*120),MOVE_NOMONSTERS,player);player.v.origin=Array.from(hit.endpos);
   const dist=player.v.origin.reduce((s,v,i)=>s+(v-p.center[i])*n[i],0);
   if(typeof worldModule.SV_PortalObstructed==='function'&&!worldModule.SV_PortalObstructed(player,p,dist))throw new Error('hub sill at contact is not obstructed (distance '+dist+')');
   const back=player.v.origin.map((v,i)=>v+n[i]*8);player.v.origin=back;
   if(typeof worldModule.SV_PortalObstructed==='function'&&worldModule.SV_PortalObstructed(player,p,dist+8))throw new Error('8 units short of the sill counted as obstructed');}
  const tl=wall?(()=>{const t=[n[1],-n[0],0];const l=Math.hypot(...t);return t.map(v=>v/l);})():[1,0,0];
  const offsets=label!=='start'?[-14,-12,-10,-8,0,12]:[-16,-12,0,12];
  const yaws=label!=='start'?[0,-15,35]:[0];
  for(const off of offsets)for(const yaw of yaws)for(const speed of (wall?[200]:[0])){
   if(label!=='start'&&!(label==='e1m2'?E1M2:E1M5).some(([a,b,c])=>a===pi&&b===off&&c===yaw))continue;
   res=null;qcCalls=0;sv.time=10;globals.time=10;player.v.teleport_time=0;player._lastTeleportTime=undefined;player.v.flags=FL_CLIENT;
   let start;
   if(wall){start=p.center.map((v,i)=>v+n[i]*72+tl[i]*off);start[2]+=4;
     const drop=SV_Move(start,player.v.mins,player.v.maxs,[start[0],start[1],start[2]-80],MOVE_NOMONSTERS,player);
     if(drop.startsolid||drop.allsolid){out.push({map:label,pi,off,yaw,speed,skip:'startsolid'});continue;}
     start=Array.from(drop.endpos);if(drop.fraction<1)player.v.flags|=FL_ONGROUND;}
   else{start=p.center.map((v,i)=>v+n[i]*80+tl[i]*off);
     const t=SV_Move(start,player.v.mins,player.v.maxs,start,MOVE_NOMONSTERS,player);if(t.startsolid){out.push({map:label,pi,off,skip:'startsolid'});continue;}}
   player.v.origin=start;player.v.velocity=[0,0,0];player.v.v_angle=[0,0,0];player.v.angles=[0,0,0];
   const a=yaw*Math.PI/180;const dir=wall?[-n[0]*Math.cos(a)-tl[0]*Math.sin(a),-n[1]*Math.cos(a)-tl[1]*Math.sin(a),0]:[0,0,0];
   // yaw deflection steers toward centre when off>0? use sign so that +yaw steers toward -tl
   let frames=0,lastMove=0,stuck=0;
   for(;frames<80&&res===null;frames++){sv.time+=.05;globals.time=sv.time;
    if(wall){player.v.velocity[0]=dir[0]*speed;player.v.velocity[1]=dir[1]*speed;}
    const b=Array.from(player.v.origin);physics.SV_Physics_Client(player,1);
    lastMove=Math.hypot(...player.v.origin.map((v,i)=>v-b[i]));if(lastMove<0.5)stuck++;else stuck=0;}
   if(res){for(let extra=0;extra<4;extra++){sv.time+=.05;globals.time=sv.time;physics.SV_Physics_Client(player,1);}res.calls=qcCalls;}
   out.push({map:label,pi,trig:p.triggerModel,n:n.map(v=>+v.toFixed(3)),off,yaw,speed,frames,res,stuck,final:player.v.origin.map(v=>+v.toFixed(1))});
  }
 }
}

const fail=m=>{throw new Error(m);};
const sel=(map,pred)=>out.filter(r=>r.map===map&&!r.skip&&pred(r));
const hub=sel('start',r=>['*1','*2','*3'].includes(r.trig)&&r.n[1]===-1&&Math.abs(r.off)<=12);
if(hub.length<9)fail('hub arch scenarios missing: '+hub.length);
for(const r of out)if(r.res&&r.res.calls!==1)fail('QuakeC teleport ran '+r.res.calls+' times at '+r.map+' portal '+r.pi+' offset '+r.off);
for(const r of hub){if(!r.res)fail('hub arch '+r.trig+' offset '+r.off+' stalled for '+r.frames+' frames');if(r.stuck>3&&r.res.kind!=='native'&&r.res.kind!=='camera')fail('odd');}
const e1m2=sel('e1m2',()=>true);
if(e1m2.length!==E1M2.length)fail('E1M2 step scenarios missing');
for(const r of e1m2)if(!r.res||r.res.kind!=='camera')fail('E1M2 portal '+r.pi+' offset '+r.off+' lost its camera crossing: '+JSON.stringify(r.res));
const e1m5=sel('e1m5',()=>true);
if(e1m5.length!==E1M5.length)fail('E1M5 scenario missing');
for(const r of e1m5){
 if(!r.res||r.res.kind!=='camera')fail('E1M5 obstructed entry did not cross by camera: '+JSON.stringify(r.res));
 const d=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 if(!(r.res.dist>1))fail('E1M5 scenario was not held short of the surface: '+r.res.dist);
 if(d(r.res.after,r.res.projected)>0.6)fail('exit is not the transform of the origin projected onto the threshold: '+JSON.stringify(r.res));
 if(d(r.res.after,r.res.plain)<5)fail('exit equals the unprojected transform');
 if(Math.abs(r.res.speed-200)>2)fail('incoming speed was not carried through the crossing: '+r.res.speed);
}
console.log('PORTAL_WALK '+JSON.stringify({hub:hub.map(r=>[r.trig,r.off,r.res.kind,r.frames]),e1m2:e1m2.map(r=>[r.pi,r.off,r.res.kind,r.frames])}));
});
