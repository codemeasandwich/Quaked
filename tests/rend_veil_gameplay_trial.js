// Inspection fixture ONLY. Stock QC owns the real closet transfer, production
// physics owns the hold. The phase buttons pause/seek this local test clock.
const panel=document.querySelector('#veil-controls'),status=document.querySelector('#veil-status'),errors=[],loadedAt=new Date().toISOString();
const reportError=console.error.bind(console);console.error=(...args)=>{errors.push(args.map(String).join(' '));reportError(...args);};
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
await import('../main.js');
const until=performance.now()+120000;
while(!window.Cbuf_AddText){if(performance.now()>until)throw Error('Engine startup timeout');await new Promise(r=>setTimeout(r,50));}
const {sv}=await import('../src/engine/server/server.js'),{cl,cls,cl_entities}=await import('../src/engine/client/client.js');
const progs=await import('../src/engine/progs/progs.js'),{PR_ExecuteProgram}=await import('../src/engine/progs/pr_exec.js');
const {SV_Move,SV_LinkEdict,SV_RunTriggerTouch}=await import('../src/engine/server/world.js'),{Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {renderer}=await import('../src/engine/render/vid.js'),loading=await import('../src/r_demoloading.js'),veil=await import('../src/newer/render/r_rendveil.js');
const {camera,scene}=await import('../src/engine/render/gl_rmain.js');
const THREE=await import('three');
const bestiary=await import('../src/r_bestiary.js'),keys=await import('../src/engine/client/keys.js'),split=await import('../src/newer/render/r_demosplit.js');
const text=progs.PR_GetString;
let ready=false,monster=null,trigger=null,destination=null,saved=null,capture=false,start=0,revealOnly=false;
function invoke(e,fn){progs.pr_global_struct.self=progs.EDICT_TO_PROG(e);progs.pr_global_struct.time=sv.time;PR_ExecuteProgram(fn);}
function positionCamera(){
 const p=sv.edicts[1],q=Array.from(monster.v.origin),yaw=monster.v.angles[1]*Math.PI/180;
 for(const offset of [0,.3,-.3,.6,-.6,1.2,-1.2,Math.PI]){
  const a=yaw+offset,pos=[q[0]+Math.cos(a)*85,q[1]+Math.sin(a)*85,q[2]+8];
  const fit=SV_Move(pos,p.v.mins,p.v.maxs,pos,0,p);if(fit.startsolid||fit.allsolid)continue;
  const sight=SV_Move([pos[0],pos[1],pos[2]+22],[0,0,0],[0,0,0],[q[0],q[1],q[2]-4],0,p);if(sight.fraction<.92&&sight.ent!==monster)continue;
  // Hull-safe is insufficient beside stairs or an illusionary wall: prove
  // the actual opaque scene has a clear line to the creature's body centre.
  scene.updateMatrixWorld(true);
  const eye=new THREE.Vector3(pos[0],pos[1],pos[2]+22),aim=new THREE.Vector3(q[0],q[1],q[2]-4),direction=aim.clone().sub(eye),range=direction.length();
  const ray=new THREE.Raycaster(eye,direction.normalize(),0,range*.92);
  if(ray.intersectObjects(scene.children,true).some(hit=>{
   if(hit.object===cl_entities[monster.index]?._aliasMesh)return false;
   for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
   const material=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex||0]:hit.object.material;
   return material?.depthWrite!==false&&material?.transparent!==true;
  }))continue;
  p.v.flags|=64|128;p.v.movetype=0;p.v.origin=pos;p.v.velocity=[0,0,0];
  const bounds=cl_entities[monster.index]?._aliasMesh?.geometry?.boundingBox;
  const aimZ=q[2]+(bounds?(bounds.min.z+bounds.max.z)/2:-4);
  const ang=[Math.atan2(pos[2]+22-aimZ,85)*180/Math.PI,(a+Math.PI)*180/Math.PI,0];p.v.angles=ang;p.v.v_angle=ang;p.v.fixangle=1;cl.viewangles.set(ang);SV_LinkEdict(p,false);return;
 }
 throw Error('No safe inspection camera near native destination');
}
function replay(){
 if(!ready)return;
 bestiary.R_BestiaryCancel();veil.R_RendVeilClear();
 monster._rendVeil=null;monster.v.health=saved.health;monster.v.movetype=saved.movetype;monster.v.nextthink=sv.time+.1;monster.v.think=saved.think;monster.v.frame=saved.frame;
 const centre=Array.from(trigger.v.absmin,(v,i)=>(v+trigger.v.absmax[i])/2);monster.v.origin=centre;monster.v.velocity=[0,0,0];SV_LinkEdict(monster,false);
 progs.pr_global_struct.other=progs.EDICT_TO_PROG(sv.edicts[1]);invoke(trigger,trigger.v.use);SV_RunTriggerTouch(monster,trigger);
 if(!monster._rendVeil)throw Error('Native named closet touch failed to create its individual arrival');
 start=monster._rendVeil.start;positionCamera();sv.paused=false;status.textContent='Stock QC arrival running: Focus activates the native monster at 2.500 s.';
}
function stage(age){if(!ready)return;sv.paused=true;sv.time=start+age;status.textContent=`Paused native test clock at ${age.toFixed(3)} s.`;}
document.querySelector('#replay-veil').onclick=replay;
for(const button of document.querySelectorAll('[data-age]'))button.onclick=()=>{const age=Number(button.dataset.age);if(!monster?._rendVeil||sv.time-start>=2.8||age<sv.time-start)replay();stage(age);};
document.querySelector('#play-veil').onclick=()=>{sv.paused=false;keys.set_key_dest(keys.key_game);};
document.querySelector('#capture-veil').onclick=()=>capture=true;
document.querySelector('#reveal-only').onclick=()=>{revealOnly=!revealOnly;document.querySelector('#reveal-only').textContent=revealOnly?'Full effect':'Model reveal only';};
function receipt(){return {loadedAt,revealOnly,test:'actual E1M2 stock QC named closet, inspection original walls',ready,map:sv.name,serverTime:sv.time,age:sv.time-start,paused:sv.paused,signon:cls.signon,demo:cls.demoplayback,
 playerOrigin:Array.from(sv.edicts?.[1]?.v.origin||[]),clientPlayerOrigin:cl_entities[1]?.origin,camera:camera?.position?.toArray(),cameraDirection:camera?.getWorldDirection(new (camera.position.constructor)()).toArray(),meshPosition:cl_entities[monster?.index]?._aliasMesh?.position?.toArray(),meshVisible:cl_entities[monster?.index]?._aliasMesh?.visible,meshBox:cl_entities[monster?.index]?._aliasMesh?.geometry?.boundingBox,meshScale:cl_entities[monster?.index]?._aliasMesh?.scale?.toArray(),viewangles:Array.from(cl.viewangles),
 monster:monster?{index:monster.index,model:text(monster.v.model),origin:Array.from(monster.v.origin),frame:monster.v.frame,nextthink:monster.v.nextthink,health:monster.v.health,record:monster._rendVeil,clientRecord:cl_entities[monster.index]?._rendVeil,clientClock:cl_entities[monster.index]?._rendVeilTime,drawn:!!cl_entities[monster.index]?._aliasMesh}:null,
 renderer:veil.R_RendVeilDiagnostics(),loading:loading.R_DemoLoadingStatus(),errors:errors.slice()};}
const frameHidden=new Map();
const render=renderer.render.bind(renderer);
renderer.render=(...args)=>{
 if(revealOnly&&args[0]===scene&&renderer.getRenderTarget()?.textures?.length>1){
  for(const object of scene.children)if(object.name==='Rend the Veil / destination'||object.userData.rendVeilVisualOnly){
   if(!frameHidden.has(object))frameHidden.set(object,object.visible);object.visible=false;
  }
 }
 const value=render(...args);
 if(renderer.getRenderTarget()===null){for(const [object,visible] of frameHidden)object.visible=visible;frameHidden.clear();}
if(capture&&renderer.getRenderTarget()===null){capture=false;queueMicrotask(()=>{const r=receipt(),a=document.createElement('a');a.download='rend-veil-native-'+r.age.toFixed(2)+'.png';a.href=renderer.domElement.toDataURL('image/png');a.click();const b=document.createElement('a');b.download='rend-veil-native-'+r.age.toFixed(2)+'.json';b.href='data:application/json,'+encodeURIComponent(JSON.stringify(r,null,2));b.click();});}return value;};
setInterval(()=>document.querySelector('#veil-report').textContent=JSON.stringify(receipt(),null,2),400);
split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
const previous=sv.edicts?.[1];Cbuf_AddText('disconnect\nmaxplayers 1\nr_hdr 1\nr_newdark 1\nr_newbright 1.5\nr_demosplit 0\nr_newer_enemies 1\nr_newer_textures 0\nr_drawviewmodel 0\nskill 2\nbgmvolume 0\nmap e1m2\n');
const end=performance.now()+120000;
const timer=setInterval(()=>{
 if(performance.now()>end){clearInterval(timer);status.textContent='Native map readiness timeout';return;}
 if(sv.edicts?.[1]===previous||cls.demoplayback||cls.signon!==4||!sv.active||loading.R_IntroLoadingHolding())return;
 clearInterval(timer);
 try{
  trigger=sv.edicts.find(e=>e&&!e.free&&text(e.v.classname)==='trigger_teleport'&&text(e.v.targetname)==='t143'&&text(e.v.target)==='t142');
  destination=sv.edicts.find(e=>e&&!e.free&&text(e.v.targetname)==='t142');
  if(!trigger||!destination)throw Error('Native E1M2 closet missing');
  const centre=Array.from(trigger.v.absmin,(v,i)=>(v+trigger.v.absmax[i])/2);
  const enemies=sv.edicts.filter(e=>e&&!e.free&&e.v.health>0&&text(e.v.classname).startsWith('monster_'));
  enemies.sort((a,b)=>Math.hypot(...Array.from(a.v.origin,(v,i)=>v-centre[i]))-Math.hypot(...Array.from(b.v.origin,(v,i)=>v-centre[i])));monster=enemies[0];
  saved={health:monster.v.health,movetype:monster.v.movetype,think:monster.v.think,frame:monster.v.frame};
  for(const e of enemies)if(e!==monster)e.v.nextthink=-1;
  ready=true;replay();setTimeout(()=>stage(1.1),800);
 }catch(e){errors.push(String(e.stack||e));status.textContent=String(e);}
},100);
