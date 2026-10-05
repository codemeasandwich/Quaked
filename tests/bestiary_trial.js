const panel=document.querySelector('section'),status=document.querySelector('#status'),errors=[];
for(const type of['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,50));
const cmd=await import('../src/cmd.js'),menu=await import('../src/menu.js'),draw=await import('../src/gl_draw.js'),keys=await import('../src/keys.js'),bestiary=await import('../src/r_bestiary.js');
const {sv,FL_GODMODE,FL_NOTARGET}=await import('../src/server.js'),{cl,cls}=await import('../src/client.js'),progs=await import('../src/progs.js');
const {SV_Move,SV_LinkEdict,MOVE_NORMAL,MOVE_NOMONSTERS}=await import('../src/world.js'),{R_ShellTrace}=await import('../src/r_shelltrace.js'),loading=await import('../src/r_demoloading.js'),render=await import('../src/gl_rmain.js');
const vars=await import('../src/cvar.js');
let ready=false,generation=0,stage=null,pauseCheck=null;
const touch=(x,y)=>{const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(x+(w-320)/2,y+(h-200)/2,w,h);};
function start(map='e1m2'){const old=sv.edicts?.[1],token=++generation;ready=false;bestiary.R_BestiaryCancel();cmd.Cmd_ExecuteString('menu_singleplayer');touch(100,122);touch(100,map==='e1m2'?96:104);status.textContent='Loading actual Newer Level Select '+map+'…';const until=performance.now()+180000,timer=setInterval(()=>{if(token!==generation||performance.now()>until){clearInterval(timer);return;}if(sv.edicts?.[1]===old||cls.signon!==4||cls.demoplayback||loading.R_IntroLoadingHolding()||sv.name!==map)return;clearInterval(timer);ready=true;sv.edicts[1].v.flags|=FL_GODMODE|FL_NOTARGET;status.textContent='Ready. Face a new illustrated beast, then press a key/shoot. Menu book retains discoveries.';},100);}
document.querySelector('#start').onclick=()=>start('e1m2');document.querySelector('#start3').onclick=()=>start('e1m3');
document.querySelector('#face').onclick=()=>{
 if(!ready)return;if(bestiary.R_BestiarySnapshot().phase!=='idle'){status.textContent='Close the current folio with shoot/key before staging another beast.';return;}bestiary.R_BestiaryCancel();if(keys.key_dest!==keys.key_game){keys.set_key_dest(keys.key_game);}
 const p=sv.edicts[1],seen=new Set(bestiary.R_BestiarySnapshot().unlocked),entries=bestiary.R_BestiaryEntries();
 for(const e of sv.edicts.slice(2,sv.num_edicts)){if(e.free||e.v.health<=0||e.v.deadflag!==0)continue;const entry=entries.find(a=>a.classes.includes(progs.PR_GetString(e.v.classname)));if(!entry?.image||seen.has(entry.id))continue;
  const target=[0,1,2].map(i=>e.v.origin[i]+.5*(e.v.mins[i]+e.v.maxs[i]));
  for(const distance of[256,192,128,96,64])for(const direction of[[1,0],[-1,0],[0,1],[0,-1]]){
   const point=[e.v.origin[0]+distance*direction[0],e.v.origin[1]+distance*direction[1],e.v.origin[2]],fit=SV_Move(point,p.v.mins,p.v.maxs,point,MOVE_NORMAL,p);if(fit.startsolid||fit.allsolid)continue;
   const eye=point.map((v,i)=>v+(i===2?22:0)),trace=SV_Move(eye,[0,0,0],[0,0,0],target,MOVE_NOMONSTERS,p);if(trace.startsolid||trace.allsolid||trace.fraction<.999)continue;
   const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2],angles=[-Math.atan2(dz,Math.hypot(dx,dy))*180/Math.PI,Math.atan2(dy,dx)*180/Math.PI,0];
   p.v.origin=point;p.v.velocity=[0,0,0];p.v.movetype=0;p.v.v_angle=angles;p.v.angles=angles;p.v.fixangle=1;p.v.flags|=FL_GODMODE|FL_NOTARGET;cl.viewangles.set(angles);SV_LinkEdict(p,false);stage={enemy:e.index,id:entry.id,point,angles};status.textContent='Placed at a real hull-safe viewpoint of '+entry.title+'. Actual sight detection owns the unlock.';return;
  }
 }
 status.textContent='No unseen illustrated beast has a safe viewpoint in this map. Your existing discoveries are preserved; browse the book or encounter another type normally.';
};
document.querySelector('#continue').onclick=()=>{keys.Key_Event(keys.K_MOUSE1,true);keys.Key_Event(keys.K_MOUSE1,false);};
document.querySelector('#pause-check').onclick=async()=>{if(bestiary.R_BestiarySnapshot().phase!=='hold'){status.textContent='Wait until the first-sighting page is held, then run the pause check.';return;}const old=vars.Cvar_VariableValue('host_timescale'),before={server:sv.time,client:cl.time};vars.Cvar_SetValue('host_timescale',.4);try{await new Promise(r=>setTimeout(r,1200));const after={server:sv.time,client:cl.time},scale=vars.Cvar_VariableValue('host_timescale');pauseCheck={before,after,requestedScale:.4,actualScale:scale,passed:before.server===after.server&&before.client===after.client&&scale===.4};status.textContent=pauseCheck.passed?'Actual server/client clocks stay frozen; the existing 0.4 timescale is preserved.':'Pause check failed; inspect diagnostics.';}finally{vars.Cvar_SetValue('host_timescale',old);}};
document.querySelector('#book').onclick=()=>cmd.Cmd_ExecuteString('menu_bestiary');
document.querySelector('#previous').onclick=()=>menu.M_Keydown(keys.K_LEFTARROW);document.querySelector('#next').onclick=()=>menu.M_Keydown(keys.K_RIGHTARROW);document.querySelector('#escape').onclick=()=>{keys.Key_Event(keys.K_ESCAPE,true);keys.Key_Event(keys.K_ESCAPE,false);};
document.querySelector('#hide').onclick=()=>panel.hidden=true;document.addEventListener('keydown',e=>{if(e.key==='F2'){panel.hidden=!panel.hidden;e.preventDefault();e.stopImmediatePropagation();}},true);
document.addEventListener('keyup',e=>{if(e.key==='F2'){e.preventDefault();e.stopImmediatePropagation();}},true);
setInterval(()=>{const p=sv.edicts?.[1],camera=render.camera;if(!p)return;const snapshot=bestiary.R_BestiarySnapshot();document.querySelector('#report').textContent=JSON.stringify({ready,map:sv.name,signon:cls.signon,stage,...snapshot,serverTime:sv.time,clientTime:cl.time,player:Array.from(p.v.origin),angles:Array.from(p.v.v_angle),viewangles:Array.from(cl.viewangles),camera:camera?.position.toArray(),cameraQuaternion:camera?.quaternion.toArray(),fov:camera?.fov,menu:menu.m_state,pauseCheck,glError:window.renderer?.getContext().getError(),errors},null,2);},150);
await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);start();
