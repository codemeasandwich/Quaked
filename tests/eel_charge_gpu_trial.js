import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import * as models from '../src/engine/render/gl_model.js';
import * as mesh from '../src/engine/render/gl_mesh.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import * as eel from '../src/newer/render/r_eelcharge.js';
import {vid,VID_SetPalette} from '../src/engine/render/vid.js';
import {entity_t} from '../src/engine/render/render.js';
import '../src/newer/install.js';
// Real owned model, production alias draw and public effect lifecycle. No fake
// native identity, texture binding, geometry, shader or replacement manifest.
const W=640,H=640,query=new URLSearchParams(location.search),button=document.querySelector('#run'),report=document.querySelector('#report'),views=document.querySelector('#views');
const checks=[],errors=[],shots=[],shades=new Float32Array(256).fill(1),options=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_bounce,post.r_volumetric,post.r_newbright,post.r_newcontrast,post.r_pointshadows,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_enemies,mode.r_newer_shadows,anim.r_lerpmodels];
const lights=[{origin:[140,-100,150],radius:600,die:1e9,minlight:0},{origin:[-90,100,70],radius:300,die:1e9,minlight:0}];
let renderer,scene,camera,model,header,span,center,parts=[],draws=0;
const verify=(passed,name,data={})=>checks.push({passed:!!passed,name,...data});
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function difference(a,b,region){let changed=0,energy=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(region&&!region(x,y))continue;const i=(y*W+x)*4;let d=0;for(let c=0;c<3;c++)d+=Math.abs(a.pixels[i+c]-b.pixels[i+c]);energy+=d;if(d>3)changed++;}return {changed,energy};}
function capture(label){const src=renderer.domElement.toDataURL('image/png'),figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=src;caption.textContent=label;figure.append(img,caption);views.append(figure);shots.push({label,src});}
function newPart(index){const entity=new entity_t();entity.model=model;entity._entityIndex=index;return {entity,current:null};}
function configure({classic=false,custom=true}={}){vars.Cvar_SetValue('r_hdr',classic?0:1);vars.Cvar_SetValue('r_newer_enemies',custom?1:0);post.R_PostBegin(renderer,!classic,W,H);}
function pose(part,{frame=0,stage=5,yaw=90,time=10,origin=[0,0,0],effect=true,owner=scene}={}){
 part.entity.frame=frame;part.entity.skinnum=stage;part.entity.angles[1]=yaw;for(let i=0;i<3;i++)part.entity.origin[i]=origin[i];
 const next=mesh.R_DrawAliasModel(part.entity,header,shades,.5);if(next!==part.current){part.current?.removeFromParent();part.current=next;}if(next.parent!==owner)owner.add(next);next.visible=true;next._quakeOwner=part.entity;next.layers.enable(post.SUN_SHADOW_LAYER);
 // Update native pose THEN build electricity, BEFORE Three uploads attributes.
 if(effect)eel.R_EelChargeSeen(part.entity,next,owner,time);else eel.R_EelChargeRelease(part.entity);return next;
}
function readPackets(){
 const gl=renderer.getContext(),target=renderer.getRenderTarget();if(!target||target.textures.length<4)throw Error('Actual four-attachment MRT required');const packets=[];
 for(let attachment=1;attachment<4;attachment++){gl.readBuffer(gl.COLOR_ATTACHMENT0+attachment);const type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE),format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);if(format!==gl.RGBA)throw Error('Unexpected MRT read format');const data=type===gl.FLOAT?new Float32Array(W*H*4):type===gl.HALF_FLOAT?new Uint16Array(W*H*4):type===gl.UNSIGNED_BYTE?new Uint8Array(W*H*4):null;if(!data)throw Error('Unsupported MRT read type '+type);gl.readPixels(0,0,W,H,format,type,data);packets.push(data);}gl.readBuffer(gl.COLOR_ATTACHMENT0);return packets;
}
function render({classic=false,eye=camera,label,packets=false}={}){
 eye.updateMatrixWorld(true);post.R_PostLightsFrame(renderer,scene,eye,0,[],lights,10,false);if(classic)renderer.setRenderTarget(null);else post.R_PostBind(renderer);renderer.clear();renderer.render(scene,eye);draws++;const packetData=packets?readPackets():null;
 if(!classic)post.R_PostFinish(renderer,scene,eye,{lx:0,ly:0,lw:W,lh:H},0,[],lights,10,1,false);
 const gl=renderer.getContext(),pixels=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>8)visible++;if(label)capture(label);return {pixels,visible,glError:gl.getError(),packets:packetData};
}
function sample(part,settings={},renderSettings={}){configure(settings);pose(part,settings);return render({...renderSettings,classic:!!settings.classic});}
function paired(part,settings={},label){const off=sample(part,{...settings,effect:false}),on=sample(part,{...settings,effect:true},{label});return {off,on,delta:difference(off,on)};}
const healthy=a=>a.glError===0&&a.visible>100;
function hideOthers(keep){for(const p of parts)if(p!==keep){eel.R_EelChargeRelease(p.entity);p.current?.removeFromParent();}}
async function run(){
 button.disabled=true;checks.length=0;shots.length=0;views.replaceChildren();draws=0;eel.R_EelChargeClear();const started=performance.now(),part=parts[0];hideOthers(part);
 try{
  verify(header.numframes===21&&header.numskins===6,'actual Eel has 21 poses and six native states',{frames:header.numframes,skins:header.numskins});const initialShape=JSON.stringify(header.posedata);
  for(let stage=0;stage<6;stage++)for(let frame=0;frame<21;frame++){const p=paired(part,{stage,frame,time:10.25,yaw:90},frame===0?'Stage '+stage+' · pose 0':undefined);verify(healthy(p.off)&&healthy(p.on)&&(stage===0?p.delta.energy===0:p.delta.changed>2),'effect-off pixel comparison stage '+stage+' pose '+frame,{...p.delta,offVisible:p.off.visible,onVisible:p.on.visible});}
  // A second draw must not repair buffers missing from the first changed pose.
  const oldCamera=camera.position.clone(),oldRotation=camera.quaternion.clone();sample(part,{stage:5,frame:0});camera.position.y+=span*.18;camera.lookAt(center);
  const first=sample(part,{stage:5,frame:16,time:12.125},{label:'First draw after pose and camera change'}),repeat=render();verify(healthy(first)&&difference(first,repeat).energy===0,'first changed pose/camera draw equals stable repeat',difference(first,repeat));const firstOff=sample(part,{stage:5,frame:16,time:12.125,effect:false});verify(difference(first,firstOff).changed>2,'first changed pose/camera draw already contains electricity',difference(first,firstOff));camera.position.copy(oldCamera);camera.quaternion.copy(oldRotation);
  configure();pose(part,{stage:5,effect:false});const mrtOff=render({packets:true});pose(part,{stage:5});const mrtOn=render({packets:true,label:'Maximum charge · actual MRT compositor'});verify(mrtOff.glError===0&&mrtOn.glError===0,'MRT attachment reads succeed without GL errors',{off:mrtOff.glError,on:mrtOn.glError});for(let i=0;i<3;i++){verify(mrtOff.packets[i].some(v=>v!==0),'MRT attachment '+(i+1)+' has a nonempty opaque baseline');verify(mrtOff.packets[i].every((v,j)=>v===mrtOn.packets[i][j]),'preserves opaque MRT attachment '+(i+1));}verify(difference(mrtOff,mrtOn).changed>2,'MRT control has visible electricity',difference(mrtOff,mrtOn));
  // Opaque depth-only wall: same body and camera, effect-off/on must be identical.
  const wall=new THREE.Mesh(new THREE.PlaneGeometry(span*3,span*3),new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide}));wall.position.copy(center).lerp(camera.position,.45);wall.quaternion.copy(camera.quaternion);wall.renderOrder=-100;scene.add(wall);const wallPair=paired(part,{stage:5},'Opaque wall depth occlusion');verify(wallPair.delta.energy===0,'opaque wall fully occludes electricity',wallPair.delta);wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();
  // Effect color only with real body depth. Removing BODY depth exposes far-side
  // electrodes, so the test includes a positive control for self-occlusion.
  configure();const body=pose(part,{stage:5}),material=body.material,oldColor=material.colorWrite,oldDepth=material.depthWrite;
  try{material.colorWrite=false;material.depthWrite=true;const self=render({label:'Electricity only · real body self-depth'});material.depthWrite=false;const through=render({label:'Depth-disabled positive control · far side exposed'});verify(healthy(self)&&healthy(through)&&difference(self,through).changed>2,'real Eel surface hides far-side electricity',difference(self,through));}finally{material.colorWrite=oldColor;material.depthWrite=oldDepth;}
  // Same prepared buffers are drawn by two cameras with no Seen between them.
  configure();pose(part,{stage:5,frame:20,time:14});const eyes=[-1,1].map(side=>{const eye=camera.clone();eye.position.y+=side*span*.04;eye.lookAt(center);return eye;}),eyeImages=eyes.map((eye,i)=>render({eye,label:'Separate camera '+i+' · shared prepared effect'}));eel.R_EelChargeRelease(part.entity);const eyeOff=eyes.map(eye=>render({eye}));for(let i=0;i<2;i++)verify(healthy(eyeImages[i])&&difference(eyeImages[i],eyeOff[i]).changed>2,'camera '+i+' shows current electricity',difference(eyeImages[i],eyeOff[i]));verify(difference(eyeImages[0],eyeImages[1]).changed>20,'separate cameras produce distinct pixels');
  // Full-body spirals extend beyond the silhouette; space both pixel-control regions apart.
  const second=parts[1],positions=[[0,-span*.8,0],[0,span*.8,0]];camera.position.copy(center).add(new THREE.Vector3(span*4,0,span*.5));camera.lookAt(center);
  const both=(enabled,label)=>{configure();pose(part,{stage:2,frame:0,time:3.125,origin:positions[0],effect:enabled[0]});pose(second,{stage:5,frame:16,time:8.75,origin:positions[1],effect:enabled[1]});return render({label});};
  const neither=both([false,false]),onlyA=both([true,false]),onlyB=both([false,true]),together=both([true,true],'Two Eels · independent stages 2 / 5 and clocks'),right=x=>x>W/2,left=x=>x<W/2;verify(difference(neither,onlyA).changed>2&&difference(neither,onlyB).changed>2,'both entities have measurable independent electricity');const regionA=difference(neither,onlyA,right).energy>difference(neither,onlyA,left).energy?right:left,regionB=regionA===right?left:right;verify(difference(onlyA,together,regionA).energy===0&&difference(onlyB,together,regionB).energy===0,'shared shader preserves entity stages and clocks without cross-talk');verify(eel.R_EelChargeStatus().entries===2,'two live entity allocations');hideOthers(part);camera.position.copy(oldCamera);camera.quaternion.copy(oldRotation);
  const group=new THREE.Group();group.position.set(3,-4,2);group.rotation.z=.43;group.scale.setScalar(1.2);scene.add(group);const ghost=paired(part,{stage:5,frame:16,owner:group},'Transformed preview Group');verify(healthy(ghost.on)&&ghost.delta.changed>2&&part.current.parent===group,'transformed Group inherits local effect',ghost.delta);eel.R_EelChargeBegin(group);eel.R_EelChargeEnd(group);verify(eel.R_EelChargeStatus().entries===0&&!part.current.getObjectByName('eel_charge'),'unseen Group releases effect');group.removeFromParent();
  for(const settings of [{stage:0},{stage:5,custom:false},{stage:5,classic:true}]){sample(part,{stage:5});const p=paired(part,settings,'Effect absent: '+JSON.stringify(settings));verify(p.delta.energy===0,'reset/mode guard '+JSON.stringify(settings),p.delta);}
  // Toggle after Seen, before render: stale attached geometry must be gated
  // immediately, including an already prepared split-Classic or skin-zero draw.
  for(const guard of ['skin-zero','custom-off','classic']){
   configure();pose(part,{stage:5});
   if(guard==='skin-zero')part.entity.skinnum=0;
   if(guard==='custom-off')vars.Cvar_SetValue('r_newer_enemies',0);
   if(guard==='classic')mode.R_AnimSetClassicPass(true);
   try{const stale=render();eel.R_EelChargeRelease(part.entity);const absent=render();verify(difference(stale,absent).energy===0,'immediate prepared-mesh guard '+guard,difference(stale,absent));}
   finally{mode.R_AnimSetClassicPass(false);}
  }
  configure();pose(part,{stage:5});const fx=part.current.getObjectByName('eel_charge');let disposed=0;fx.geometry.addEventListener('dispose',()=>disposed++);eel.R_EelChargeClear();const clear=render({label:'Map reset · effect released'});pose(part,{stage:5,effect:false});const clearOff=render();verify(disposed===1&&eel.R_EelChargeStatus().entries===0&&difference(clear,clearOff).energy===0,'map reset disposes once and leaves no effect pixels');verify(JSON.stringify(header.posedata)===initialShape,'native pose data unchanged');const status=skins.R_NewerSkinsStatus(model);verify(status.settled&&status.normals.pending===0&&status.normals.generated===0&&Object.keys(status.errors).length===0,'actual prepared normals shipped without fallback',{status});verify(errors.length===0&&eel.R_EelChargeStatus().errors.length===0,'actual shader compile/runtime clean',{errors,eel:eel.R_EelChargeStatus()});
 }catch(error){verify(false,String(error),{stack:error.stack});}finally{eel.R_EelChargeClear();renderer.setRenderTarget(null);button.disabled=false;}
 const result={status:checks.every(c=>c.passed)?'PASS':'FAIL',modelSHA:model.aliasSourceIdentity.sha256,frames:header.numframes,states:6,draws,elapsedMs:performance.now()-started,checks,images:shots.map((s,i)=>({index:i,label:s.label})),scope:'Finite actual owned model, alias and four-attachment MRT compositor. Separate cameras are not XR headset qualification; live gameplay remains separate.'};window.eelChargeResult=result;window.eelChargeViews=shots;report.textContent=JSON.stringify(result,null,2);
 if(query.has('saveEvidence')){const response=await fetch('/__qa__/eel-charge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result,views:shots.map(s=>s.src)})});if(!response.ok)throw Error('Evidence save failed '+response.status);}
}
async function loadMember(path,name){const range=async(start,length)=>{const r=await fetch(path,{headers:{Range:`bytes=${start}-${start+length-1}`}});if(r.status!==206)throw Error('Byte-range server required: tools/serve.py');return r.arrayBuffer();};const h=new DataView(await range(0,12));if(h.getUint32(0,true)!==0x4b434150)throw Error('Invalid owned PAK');const directory=await range(h.getUint32(4,true),h.getUint32(8,true)),view=new DataView(directory),bytes=new Uint8Array(directory);for(let i=0;i<bytes.length;i+=64)if(new TextDecoder().decode(bytes.subarray(i,i+56)).split('\0')[0]===name){const data=await range(view.getUint32(i+56,true),view.getUint32(i+60,true));pak.COM_AddPack({filename:'owned-eel-gpu:'+name,files:[{name,filepos:0,filelen:data.byteLength}],data});return;}throw Error('Missing owned member '+name);}
try{
 for(const c of options)if(c&&!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_bounce:0,r_volumetric:0,r_newbright:1,r_newcontrast:1,r_pointshadows:1,r_newer_lighting:1,r_newer_normals:1,r_newer_enemies:1,r_newer_shadows:1,r_lerpmodels:0}))vars.Cvar_SetTemporary(name,String(value));
 await loadMember('games/shareware/pak0.pak','gfx/palette.lmp');await loadMember(query.get('externalGames')==='1'?'games/Dissolution of Eternity/pak0.pak':'resources/rogue/pak0.pak','progs/eel2.mdl');VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);vid.fullbright=224;models.Mod_Init();model=models.Mod_ForName('progs/eel2.mdl',true);await model.aliasSourceIdentity.promise;if(model.aliasSourceIdentity.sha256!==eel.EEL_CHARGE.sha)throw Error('Actual Eel model SHA mismatch');header=model.cache.data;skins.R_NewerSetIndex(await(await fetch('assets/game/enemies/index.json')).json());
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,1,1500);camera.up.set(0,0,1);parts=[newPart(101),newPart(202)];const box=new THREE.Box3();for(let frame=0;frame<header.numframes;frame++)box.union(new THREE.Box3().setFromBufferAttribute(mesh.GL_DrawAliasFrame(header,frame).posAttr));center=box.getCenter(new THREE.Vector3());span=Math.max(...box.getSize(new THREE.Vector3()).toArray());camera.position.copy(center).add(new THREE.Vector3(span*1.6,0,span*.35));camera.lookAt(center);
 configure();await skins.R_NewerSkinsPrepare([model]);const deadline=performance.now()+15000;while(!skins.R_NewerSkinsStatus(model).settled){if(performance.now()>deadline)throw Error('Actual material/normal preparation timeout');await new Promise(r=>setTimeout(r,20));}button.addEventListener('click',run);button.disabled=false;report.textContent='Ready: exact owned model and actual material/normal preparation settled.';
}catch(error){window.eelChargeResult={status:'FAIL',error:String(error),stack:error.stack};report.textContent=JSON.stringify(window.eelChargeResult,null,2);}
window.addEventListener('pagehide',()=>{eel.R_EelChargeClear();for(const c of options)if(c)vars.Cvar_RestoreTemporary(c.name);skins.R_NewerSkinsShutdown();renderer?.dispose();});
