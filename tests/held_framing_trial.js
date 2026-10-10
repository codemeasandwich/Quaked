// Reuse the native weapon trial. Baseline is a page-local metadata override;
// geometry, game files and the production manifest are never changed here.
await import('./weapon_gameplay_trial.js');
const {R_WeaponAsset}=await import('../src/r_weapons.js');
const {Cvar_SetValue}=await import('../src/engine/common/cvar.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {cl}=await import('../src/engine/client/client.js');
const {camera}=await import('../src/gl_rmain.js');
const panel=document.querySelector('section'),report=document.createElement('pre');
let baseline=false;
function button(text,action){const b=document.createElement('button');b.textContent=text;b.onclick=action;panel.append(b);}
function apply(){for(const [key,value] of [['v_rock2',.5],['v_nail2',1]]){const a=R_WeaponAsset('progs/'+key+'.mdl');if(a)a.cameraPullback=baseline?0:value;}}
button('Baseline framing',()=>{baseline=true;apply();});
button('Updated framing',()=>{baseline=false;apply();});
for(const fov of [75,90,110])button('FOV '+fov,()=>Cvar_SetValue('fov',fov));
button('Walk for one second',()=>{Cbuf_AddText('+forward\n');setTimeout(()=>Cbuf_AddText('-forward\n'),1000);});
panel.append(report);
const timer=setInterval(()=>{apply();const e=cl.viewent,m=e?._aliasMesh;
 report.textContent=JSON.stringify({baseline,model:e?.model?.name,frame:e?.frame,cameraPullback:R_WeaponAsset(e?.model?.name)?.cameraPullback,near:camera?.near,fov:camera?.fov,mesh:m?.position.toArray(),nativeOrigin:e?.origin?Array.from(e.origin):null});
},250);
addEventListener('pagehide',()=>{clearInterval(timer);Cbuf_AddText('-forward\n-attack\n');});
