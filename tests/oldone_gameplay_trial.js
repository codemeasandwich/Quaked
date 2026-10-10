import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Native game verification with an explicitly staged player viewpoint.
// Native hull/LOS queries validate the point; NPC model, AI, health, inventory
// and asset readiness remain unchanged. This is not traversal qualification.
const panel=document.querySelector('section'),report=document.querySelector('#report'),status=document.querySelector('#state'),errors=[];
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,25));
const [cmd,menu,keys,skins,loading,vars,anim,bestiary,progs]=await Promise.all(['engine/common/cmd','engine/client/menu','engine/client/keys','newer/render/r_newerskins','newer/ui/r_demoloading','engine/common/cvar','newer/mode','newer/ui/r_bestiary','engine/progs/progs'].map(n=>import('../src/'+n+'.js')));
const {sv}=await import('../src/engine/server/server.js'),{cl,cls}=await import('../src/engine/client/client.js'),renderApi=await import('../src/engine/render/gl_rmain.js');const {scene}=renderApi,renderer=window.renderer,world=await import('../src/engine/server/world.js');
let drawReceipt=null,draws=0,observer=new WeakSet(),movement=null,stopped=false,stage=null,captureArmed=false,captureReady=false;
const sourceHash='81966deede395272b220ae664ccdbf1c78fc5db79b56d19eb9b45dc2f807e407';
const commands=s=>cmd.Cbuf_AddText(s+'\n');
const nativeRender=renderer.render.bind(renderer);renderer.render=(s,c)=>{const result=nativeRender(s,c);if(captureReady&&renderer.getRenderTarget()===null){captureReady=false;saveCapture(false);}return result;};
const movementNames=['forward','back','moveleft','moveright','moveup','movedown','left','right','lookup','lookdown'];
function release(){for(const n of movementNames)commands('-'+n);}
function observe(o){const entity=o._quakeOwner;if(!entity?.model||entity.model.name!=='progs/oldone.mdl'||observer.has(o))return;observer.add(o);const previous=o.onAfterRender;
 o.onAfterRender=function(r,s,c,g,m,...rest){previous?.call(this,r,s,c,g,m,...rest);if(c!==renderApi.camera||!anim.R_NewerGame()||!skins.R_NewerSkinsMaterials([entity.model]).includes(m))return;
  const program=r.properties.get(m).currentProgram?.program,gl=r.getContext(),location=program&&gl.getUniformLocation(program,'qrNormal');if(gl.getParameter(gl.CURRENT_PROGRAM)!==program)return;let sampler=null;
  if(location){const unit=gl.getUniform(program,location),old=gl.getParameter(gl.ACTIVE_TEXTURE);gl.activeTexture(gl.TEXTURE0+unit);const bound=gl.getParameter(gl.TEXTURE_BINDING_2D);gl.activeTexture(old);const texture=skins.R_NewerSkinsTextures([entity.model]).find(t=>r.properties.get(t).__webglTexture===bound);if(texture)sampler={unit,width:texture.image?.width,height:texture.image?.height,heightSource:!!texture.userData?.heightSource,type:texture.image?.data?.constructor?.name||null};}
  drawReceipt={draw:++draws,renderFrame:renderApi.r_framecount,model:entity.model.name,modelSha256:entity.model.aliasSourceIdentity?.sha256,frame:entity.frame,diffuse:m.map?.image?.src||null,dimensions:[m.map?.image?.width,m.map?.image?.height],sampler,position:Array.from(entity.origin),boundToPreparedFamily:true};if(captureArmed&&sampler?.heightSource){captureArmed=false;captureReady=true;}
 };
}
function tick(){if(stopped)return;scene?.traverse(observe);const ready=sv.name==='end'&&cls.signon===4&&!loading.R_IntroLoadingHolding(),p=sv.edicts?.[1],boss=sv.edicts?.find(e=>!e.free&&progs.PR_GetString(e.v.classname)==='monster_oldone');
 document.querySelector('#inspect').disabled=!ready;status.textContent=ready?'Native end map ready':'Native engine / assets loading';
 const receipt={ready,map:cl.worldmodel?.name,signon:cls.signon,newer:anim.R_NewerGame(),stage,loading:loading.R_DemoLoadingStatus(),player:p&&{position:Array.from(p.v.origin),angles:Array.from(cl.viewangles),health:p.v.health},boss:boss&&{index:boss.index,health:boss.v.health,frame:boss.v.frame,position:Array.from(boss.v.origin)},draw:drawReceipt,skins:skins.R_NewerSkinsStatus(cl.model_precache.filter(Boolean)),folio:bestiary.R_BestiarySnapshot().phase,movement:movement&&{phase:movement.phase},errors};report.textContent=JSON.stringify(receipt,null,2);

}
document.querySelector('#start').onclick=()=>{cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_ENTER);commands('map end');};
document.querySelector('#inspect').onclick=()=>{const boss=sv.edicts.find(e=>!e.free&&progs.PR_GetString(e.v.classname)==='monster_oldone');if(!boss)return;const player=sv.edicts[1],target=[boss.v.origin[0],boss.v.origin[1],boss.v.origin[2]+310];let goal=null;
 for(const distance of [512,384,640,256])for(const angle of [270,225,315,180,0,90])for(const z of [220,128,320]){const a=angle*Math.PI/180,point=[boss.v.origin[0]+Math.cos(a)*distance,boss.v.origin[1]+Math.sin(a)*distance,boss.v.origin[2]+z],fit=world.SV_Move(point,player.v.mins,player.v.maxs,point,world.MOVE_NORMAL,player),sight=world.SV_Move(point,[0,0,0],[0,0,0],target,world.MOVE_NOMONSTERS,boss);if(!goal&&!fit.startsolid&&!fit.allsolid&&!sight.startsolid&&!sight.allsolid&&sight.fraction>=.999)goal=point;}
 if(!goal){status.textContent='No native hull-safe sight point found';return;}release();movement=null;const before={position:Array.from(player.v.origin),angles:Array.from(cl.viewangles),health:player.v.health},dx=target[0]-goal[0],dy=target[1]-goal[1],dz=target[2]-goal[2]-22,angles=[-Math.atan2(dz,Math.hypot(dx,dy))*180/Math.PI,Math.atan2(dy,dx)*180/Math.PI,0];player.v.origin=goal;player.v.velocity=[0,0,0];player.v.v_angle=angles;player.v.angles=angles;player.v.fixangle=1;cl.viewangles.set(angles);world.SV_LinkEdict(player,false);stage={method:'native hull/LOS validated player viewpoint; NPC untouched',before,point:goal,angles};captureArmed=new URLSearchParams(location.search).has('evidence');};
document.querySelector('#dismiss').onclick=()=>{keys.Key_Event(keys.K_MOUSE1,true);keys.Key_Event(keys.K_MOUSE1,false);};
async function saveCapture(show=true){release();movement=null;tick();const image=new Image();image.src=renderer.domElement.toDataURL();if(show){image.style.cssText='position:fixed;inset:0;z-index:300;max-width:100%;max-height:100%';image.onclick=()=>image.remove();document.body.append(image);}if(new URLSearchParams(location.search).has('evidence')){const response=await fetch('/__qa__/capture-gameplay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:image.src,receipt:JSON.parse(report.textContent)})});if(!response.ok)throw Error('Native evidence save failed');}}
document.querySelector('#capture').onclick=()=>saveCapture();
const timer=setInterval(tick,250);document.querySelector('#start').disabled=false;addEventListener('pagehide',()=>{stopped=true;clearInterval(timer);release();});
