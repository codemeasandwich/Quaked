import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Actual game/HUD startup and QC pickups. Only the trial player's position is
// staged; native air, power-up durations, damage and facial state are not set.
await import('./powerups_gameplay_trial.js');
const {sv}=await import('../src/engine/server/server.js'),{cl}=await import('../src/engine/client/client.js');
const {PR_GetString}=await import('../src/engine/progs/progs.js');
const {SV_Move,SV_LinkEdict}=await import('../src/engine/server/world.js');
const {SV_CheckWater}=await import('../src/engine/server/sv_phys.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {R_PlayerFaceFrame}=await import('../src/newer/ui/r_facegame.js');
const {R_PlayerFaceCompose,R_PlayerFaceStatus}=await import('../src/newer/ui/r_playerface.js');
const panel=document.querySelector('section'),report=document.createElement('pre'),canvas=document.createElement('canvas');
canvas.width=canvas.height=96;canvas.style.cssText='position:relative;width:192px;height:192px;image-rendering:pixelated';
report.id='face-state';report.style.cssText='max-height:160px;overflow:auto;font-size:10px';panel.append(canvas,report);
let surface=null,last='',transitions=[];
function button(text,action){const b=document.createElement('button');b.textContent=text;b.onclick=action;panel.append(b);}
function place(point){const p=sv.edicts[1];p.v.origin=point;p.v.velocity=[0,0,0];p.v.movetype=3;SV_LinkEdict(p,false);}
button('Collect native biosuit',()=>{const item=sv.edicts.find(e=>e&&!e.free&&PR_GetString(e.v.classname)==='item_artifact_envirosuit');if(item)place(Array.from(item.v.origin));});
button('Submerge player',()=>{
 const p=sv.edicts[1];if(!p)return;surface=Array.from(p.v.origin);
 for(const leaf of sv.worldmodel.leafs){if(leaf.contents!==-3)continue;const b=leaf.minmaxs;
  for(const fx of[.5,.25,.75])for(const fy of[.5,.25,.75])for(let z=b[2]+25;z<b[5]-22;z+=8){
   const point=[b[0]+(b[3]-b[0])*fx,b[1]+(b[4]-b[1])*fy,z],fit=SV_Move(point,p.v.mins,p.v.maxs,point,0,p);
   if(fit.startsolid||fit.allsolid)continue;p.v.origin=point;SV_CheckWater(p);
   if(p.v.waterlevel===3){place(point);p.v.movetype=0;return;}
  }
 }
 if(surface)place(surface);
});
button('Return to surface',()=>{if(surface)place(surface);});
button('Native death',()=>Cbuf_AddText('kill\n'));
button('Native respawn',()=>{Cbuf_AddText('+attack\n');setTimeout(()=>Cbuf_AddText('-attack\n'),150);});
button('Pause / resume',()=>Cbuf_AddText('pause\n'));
const timer=setInterval(()=>{
 const face=R_PlayerFaceFrame(),status=R_PlayerFaceStatus(),result=R_PlayerFaceCompose(face);
 const ctx=canvas.getContext('2d');ctx.clearRect(0,0,96,96);ctx.imageSmoothingEnabled=false;if(result.canvas)ctx.drawImage(result.canvas,0,0);
 const identity=[face.eyeState,face.dead,face.strength,face.invulnerability,face.divingSuit,face.waterStage].join(':');
 if(identity!==last){last=identity;transitions.push({time:cl.time,...face});if(transitions.length>64)transitions.shift();}
 report.textContent=JSON.stringify({status,face,complete:result.complete,transitions},null,2);
},40);
addEventListener('pagehide',()=>clearInterval(timer));
