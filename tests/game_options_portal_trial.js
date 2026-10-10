const controls=document.querySelector('section');for(const event of ['mousedown','mouseup','keydown','keyup','touchstart','touchend','pointerdown','pointerup'])controls.addEventListener(event,e=>e.stopPropagation());
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,20));
const cmd=await import('../src/engine/common/cmd.js'),menu=await import('../src/engine/client/menu.js'),keys=await import('../src/engine/client/keys.js'),portal=await import('../src/newer/render/gl_portal.js'),split=await import('../src/newer/render/r_demosplit.js'),server=await import('../src/engine/server/server.js'),progs=await import('../src/engine/progs/progs.js'),world=await import('../src/engine/server/world.js'),phys=await import('../src/engine/server/sv_phys.js'),math=await import('../src/engine/common/mathlib.js'),svmain=await import('../src/engine/server/sv_main.js'),common=await import('../src/engine/common/common.js'),protocol=await import('../src/engine/common/protocol.js'),cvar=await import('../src/engine/common/cvar.js');
const status=document.querySelector('#status'),report=document.querySelector('#report');status.textContent='Ready';
document.querySelector('#options').onclick=()=>{cmd.Cmd_ExecuteString('menu_options');status.textContent='Options opened';};
document.querySelector('#hub').onclick=()=>{split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);cvar.Cvar_SetValue('r_newer_portals',1);window.Cbuf_AddText('maxplayers 1\nr_hdr 1\nmap start\n');status.textContent='Loading Newer hub';};
let polling=setInterval(()=>{if(status.textContent==='Loading Newer hub'&&server.sv.active&&portal.R_PortalsActive()&&portal.R_GetPortals().some(p=>p.center[1]===1384))status.textContent='Hub ready; native camera portals active';},100);
function rotate(matrix,v){return [0,1,2].map(i=>matrix[i]*v[0]+matrix[4+i]*v[1]+matrix[8+i]*v[2]);}
function difference(a,b){return Math.max(...a.map((v,i)=>Math.abs(v-b[i])));}
document.querySelector('#portals').onclick=()=>{
 if(!server.sv.active||!portal.R_PortalsActive()){status.textContent='Start the hub and wait for active camera portals';return;}
 const player=server.sv.edicts[1],results=[];let checks=0,failures=0;
 const check=(ok,label)=>{checks++;if(!ok){failures++;results.push({failure:label});}};
 const ports=portal.R_GetPortals().filter(p=>Math.abs(p.center[1]-1384)<.1&&p.normal[1]<-.5);
 check(ports.length>=3,'actual difficulty portal surfaces found');
 for(const p of ports)for(const offset of [-4,4]){
  const trigger=server.sv.edicts.find(e=>e&&!e.free&&progs.PR_GetString(e.v.classname)==='trigger_teleport'&&progs.PR_GetString(e.v.target)===p.triggerTarget&&[0,1,2].every(i=>Math.abs(e.v.origin[i]+e.v.mins[i]-p.triggerMins[i])<=1&&Math.abs(e.v.origin[i]+e.v.maxs[i]-p.triggerMaxs[i])<=1));
  if(!trigger){report.textContent=JSON.stringify({status:'LOOKUP FAILED',map:server.sv.name,portal:p.triggerModel,precache:server.sv.model_precache.slice(0,25),entries:server.sv.edicts.filter(e=>e&&!e.free).map(e=>({id:e.index,className:progs.PR_GetString(e.v.classname),model:progs.PR_GetString(e.v.model),index:e.v.modelindex,target:progs.PR_GetString(e.v.target),origin:Array.from(e.v.origin)})).filter(e=>e.className.includes('trigger')||e.className==='player')},null,2);status.textContent='Runtime trigger lookup failed';return;}
  const receiver=server.sv.edicts.find(e=>e&&!e.free&&progs.PR_GetString(e.v.targetname)===progs.PR_GetString(trigger.v.target));
  const vx=offset>0?80:-80;
  const sweepStart=[p.center[0]+offset-vx*(48.5/220),p.center[1]-48,p.center[2]],sweepEnd=[p.center[0]+offset,p.center[1]+.5,p.center[2]];
  const sweep=world.SV_Move(sweepStart,player.v.mins,player.v.maxs,sweepEnd,world.MOVE_NOMONSTERS,player);check(!sweep.startsolid&&!sweep.allsolid&&sweep.fraction>.999,'physical player hull can reach visible threshold');
  const originalReceiver=Array.from(receiver.v.origin),velocity=[vx,220,17],angles=[13,offset>0?68:112,0];
  player.v.health=100;player.v.teleport_time=0;player.v.velocity=velocity;player.v.v_angle=angles;player.v.angles=[-angles[0]/3,angles[1],0];
  player.v.origin=[p.center[0]+offset-vx*(8.5/220),p.center[1]-8,p.center[2]];
  const before=Array.from(player.v.origin);check(world.SV_RunTriggerTouch(player,trigger)===false,'wait before rendered threshold');check(difference(Array.from(player.v.origin),before)<.001,'no early native teleport');
  player.v.origin=[p.center[0]+offset,p.center[1]+.5,p.center[2]];player.v.velocity=velocity;player.v.v_angle=angles;player.v.angles=[-angles[0]/3,angles[1],0];
  const source=Array.from(player.v.origin),expectedPosition=portal.R_TransformPortalPoint(p,source),expectedVelocity=rotate(p.matrix,velocity),forward=[],right=[],up=[];math.AngleVectors(angles,forward,right,up);const expectedForward=rotate(p.matrix,forward);
  const corrected=world.SV_RunTriggerTouch(player,trigger);const actual=Array.from(player.v.origin),actualVelocity=Array.from(player.v.velocity),actualAngles=Array.from(player.v.v_angle),actualForward=[];math.AngleVectors(actualAngles,actualForward,[],[]);
  check(corrected===true,'shipped QC teleport accepted and corrected');check(difference(actual,expectedPosition)<.01,'side and position match portal camera');check(difference(actualVelocity,expectedVelocity)<.01,'momentum rotated without forced launch');check(difference(actualForward,expectedForward)<.001,'approach view orientation retained');check(difference(Array.from(receiver.v.origin),originalReceiver)<.001,'native receiver restored');
  player.v.dmg_take=player.v.dmg_save=0;const packet={};common.SZ_Alloc(packet,1024);svmain.SV_WriteClientdataToMessage(player,packet);const packetBytes=Array.from(new Uint8Array(packet.data.buffer||packet.data,packet.data.byteOffset||0,packet.cursize));check(packetBytes[0]===protocol.svc_setangle,'actual view-angle packet emitted');const packetAngles=packetBytes.slice(1,4).map(b=>b*360/256);check(packetAngles.every((v,i)=>Math.abs(((v-actualAngles[i]+540)%360)-180)<1.5),'client receives full approach view pitch/yaw');player.v.fixangle=1;
  phys.SV_SoftenTeleportLaunch(player);check(difference(Array.from(player.v.velocity),expectedVelocity)<.01,'legacy launch softener does not halve momentum');world.SV_LinkEdict(player,false);
  results.push({portal:p.triggerModel,sourceCenter:p.center,offset,sweep:{fraction:sweep.fraction,startsolid:sweep.startsolid,end:Array.from(sweep.endpos),playerMins:Array.from(player.v.mins),playerMaxs:Array.from(player.v.maxs),hitClass:sweep.ent?progs.PR_GetString(sweep.ent.v.classname):null,hitModel:sweep.ent?progs.PR_GetString(sweep.ent.v.model):null,worldOrigin:Array.from(server.sv.edicts[0].v.origin),worldIndex:server.sv.edicts[0].v.modelindex,hulls:server.sv.worldmodel.hulls.map(h=>({first:h.firstclipnode,mins:Array.from(h.clip_mins)}))},corrected,source,expectedPosition,actual,expectedVelocity,actualVelocity,actualAngles,packetAngles});
 }
 // Exercise a backed window through the actual player-physics caller and QC.
 const backed=portal.R_GetPortals().find(p=>p.triggerModel==='*19'&&p.normal[1]>.5);
 if(backed){
  const p=backed,trigger=server.sv.edicts.find(e=>e&&!e.free&&progs.PR_GetString(e.v.classname)==='trigger_teleport'&&progs.PR_GetString(e.v.target)===p.triggerTarget&&[0,1,2].every(i=>Math.abs(e.v.origin[i]+e.v.mins[i]-p.triggerMins[i])<=1&&Math.abs(e.v.origin[i]+e.v.maxs[i]-p.triggerMaxs[i])<=1));
  player.v.health=100;player.v.teleport_time=0;player.v.origin=[544,1460,56];player.v.velocity=[20,-200,0];player.v.v_angle=[13,255,0];player.v.angles=[-13/3,255,0];world.SV_LinkEdict(player,false);
  const dt=phys.host_frametime;phys.SV_SetFrametime(.05);const incoming=[20,-200,0];phys.SV_Physics_Client(player,1);phys.SV_SetFrametime(dt);
  const expected=rotate(p.matrix,incoming),actual=Array.from(player.v.velocity);check(player.v.teleport_time>server.sv.time,'backing contact runs shipped QC teleport');check(difference(expected,actual)<.05,'actual physics restores pre-impact normal momentum');check(Math.abs(player.v.v_angle[0]-13)<.01,'backed window keeps camera pitch');check(Math.hypot(...Array.from(player.v.origin).map((v,i)=>v-p.dest[i]))<64,'player arrives in the receiver space');
  results.push({backedWindow:p.triggerModel,actualOrigin:Array.from(player.v.origin),expectedVelocity:expected,actualVelocity:actual,actualAngles:Array.from(player.v.v_angle)});
 }
 const evidence={status:failures?'FAIL':'PASS',checks,failures,shippedQC:true,map:server.sv.name,results};report.textContent=JSON.stringify(evidence,null,2);status.textContent=evidence.status+' — '+checks+' real QC portal checks, '+failures+' failures';
};
