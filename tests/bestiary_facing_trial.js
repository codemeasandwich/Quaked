// A page-local journal prevents this verification from changing owner progress.
// Native entities/player are explicitly staged with model smoothing disabled
// while the server is paused; this is not spontaneous AI/turn interpolation proof.
import {BESTIARY_ENTRIES,Bestiary_FacesPlayer} from '../src/bestiary_state.js';
const storage=new Map([['quaked.bestiary.v1',JSON.stringify({version:1,unlocked:BESTIARY_ENTRIES.filter(e=>e.id!=='grunt').map(e=>e.id)})]]);
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear(),key:i=>[...storage.keys()][i]??null,get length(){return storage.size;}}});
const panel=document.querySelector('section'),status=document.querySelector('#status'),report=document.querySelector('#report');
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,25));
const {cl,cls,cl_entities}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {PR_GetString}=await import('../src/engine/progs/progs.js'),world=await import('../src/engine/server/world.js');
const cmd=await import('../src/engine/common/cmd.js'),vars=await import('../src/engine/common/cvar.js'),keys=await import('../src/engine/client/keys.js');
const bestiary=await import('../src/r_bestiary.js'),render=await import('../src/engine/render/gl_rmain.js'),host=await import('../src/engine/server/host.js');
const split=await import('../src/newer/render/r_demosplit.js');
let enemy=null,ready=false,pending=null,results=[];
split.R_DemoSplitRelease(true);cmd.Cbuf_AddText('r_hdr 0\nr_lerpmodels 0\nr_demosplit 0\nbgmvolume 0\nmap e1m1\n');
function prepare(){
 const p=sv.edicts[1];
 for(const e of sv.edicts){if(!e||e.free||e.v.health<=0||PR_GetString(e.v.classname)!=='monster_army')continue;
  const aim=Array.from(e.v.origin,(v,i)=>v+(e.v.mins[i]+e.v.maxs[i])/2);
  for(const distance of[192,128,96])for(const direction of[[1,0],[-1,0],[0,1],[0,-1]]){
   const point=[e.v.origin[0]+distance*direction[0],e.v.origin[1]+distance*direction[1],e.v.origin[2]];
   const fit=world.SV_Move(point,p.v.mins,p.v.maxs,point,0,p),eye=[point[0],point[1],point[2]+22];
   const sight=world.SV_Move(eye,[0,0,0],[0,0,0],aim,1,p);if(fit.startsolid||fit.allsolid||sight.startsolid||sight.fraction<.999)continue;
   sv.paused=true;p.v.flags|=64|128;p.v.velocity=[0,0,0];p.v.origin=point;world.SV_LinkEdict(p,false);
   const dx=aim[0]-eye[0],dy=aim[1]-eye[1],dz=aim[2]-eye[2],angles=[-Math.atan2(dz,Math.hypot(dx,dy))*180/Math.PI,Math.atan2(dy,dx)*180/Math.PI,0];
   p.v.angles=angles;p.v.v_angle=angles;p.v.fixangle=1;cl.viewangles.set(angles);enemy=e;
   vars.Cvar_SetValue('r_hdr',1);keys.set_key_dest(keys.key_game);bestiary.R_BestiaryCancel();return true;
  }
 }
 return false;
}
const tick=setInterval(()=>{
 if(!ready&&cls.signon===4&&!cls.demoplayback&&sv.name==='e1m1'){ready=prepare();if(ready)status.textContent='Ready. Check Back, then Side, then Front; only Front should discover.';}
 const snapshot=bestiary.R_BestiarySnapshot();report.textContent=JSON.stringify({ready,phase:snapshot.phase,entry:snapshot.entry?.id,gruntUnlocked:snapshot.unlocked.includes('grunt'),results},null,2);
},100);
for(const button of document.querySelectorAll('[data-angle]'))button.onclick=()=>{
 if(!ready)return;clearTimeout(pending);sv.paused=true;bestiary.R_BestiaryCancel();
 const p=sv.edicts[1],angle=Number(button.dataset.angle),yaw=Math.atan2(p.v.origin[1]-enemy.v.origin[1],p.v.origin[0]-enemy.v.origin[0])*180/Math.PI;
 enemy.v.angles=[0,yaw+angle,0];status.textContent='Settling native view for '+angle+'°…';
 pending=setTimeout(()=>{
  const entity=cl_entities[enemy.index];sv.paused=false;bestiary.R_BestiaryFrame(host.realtime);
  const allowed=bestiary.R_BestiaryAllowed(),before=bestiary.R_BestiarySnapshot(),accepted=bestiary.R_BestiaryObserve(render.scene,render.camera,[entity]),after=bestiary.R_BestiarySnapshot();
  if(!accepted)sv.paused=true;
  results.push({angle,allowed,facing:Bestiary_FacesPlayer(enemy.v.angles,enemy.v.origin,p.v.origin),accepted,before:before.phase,after:after.phase,unlocked:after.unlocked.includes('grunt')});
  status.textContent=angle+'°: '+(accepted?'discovered':'rejected');
 },650);
};
document.querySelector('#dismiss').onclick=()=>{bestiary.R_BestiaryKey(200,true);bestiary.R_BestiaryKey(200,false);};
addEventListener('pagehide',()=>{clearInterval(tick);clearTimeout(pending);});
