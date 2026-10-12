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
import {vid,VID_SetPalette} from '../src/engine/render/vid.js';
import {entity_t} from '../src/engine/render/render.js';
import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
const trialModels={armagon:{title:'Armagon',sha:'e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151',dimensions:[1512,1358],pack:'resources/hipnotic/pak0.pak',negative:'grem',keyframes:[17,22,35,44,60,64,84,86],parts:[{key:'armabody',sha:'e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151'},{key:'armalegs',sha:'b33a8f7e4cd3fca9b8c9427d8002a5470da44ce919648e1a0045f3f131f73deb'}]},grem:{title:'Gremlin',sha:'bdc4443c3a0d0bb30b4302bb7b1d9759344690c6148bea08a747436191325763',dimensions:[1848,1014],pack:'resources/hipnotic/pak0.pak',negative:'scor',keyframes:[135]},fish:{title:'Rotfish',sha:'e6a0396ac97d981cd49b39f7af8f1f32d9f910768f7a554f59bcb5926c2a3568',dimensions:[1560,1164],pack:'resources/id1/pak0.pak',negative:'dog'},dog:{title:'Dog',sha:'c84104192b336b5360033a4efcc7e033fce4589d1af6c3c895101a9c6d6932b6',dimensions:[1872,1014],pack:'resources/id1/pak0.pak',negative:'fish'},dragon:{title:'Dragon',sha:'1ba01029d4113cc832aa5ab551c7bf060b5f7a4eb1afde35607564413bfee2ec',dimensions:[1540,895]},s_wrath:{title:'Overlord',sha:'4c0653e3adba99be4d581c92a928fd6e8c27b0a2159a97f7ec5e885478249b8d',dimensions:[1540,930]},mummy:{title:'Mummy',sha:'3926d2dcf2451deaf32e67877016884cfb91a313968beefe514b9274fc30a1d1',dimensions:[1008,1164]}};
const modelKey=new URLSearchParams(location.search).get('model')||'dragon',trial=trialModels[modelKey];if(!trial)throw Error('Unknown skin trial');
document.querySelector('h1').textContent=trial.title+': native UV and prepared skin';
const W=640,H=640,button=document.querySelector('#run'),report=document.querySelector('#report'),views=document.querySelector('#views');
const transitions=[],errors=[],checks=[],owned=[],options=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_bounce,post.r_volumetric,post.r_newbright,post.r_newcontrast,post.r_pointshadows,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_enemies,mode.r_newer_shadows,anim.r_lerpmodels];
window.addEventListener('error',event=>errors.push({runtime:event.message}));window.addEventListener('unhandledrejection',event=>errors.push({rejection:String(event.reason)}));
const verify=(value,name,data={})=>checks.push({passed:!!value,name,...data});
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
// Raw stverts/triangles are loader scratch; stable display commands and pose data belong to each model.
const shape=header=>JSON.stringify({frames:header.frames,poseverts:header.poseverts,posedata:header.posedata,commands:Array.from(header.commands),order:Array.from(header.meshVertexOrder),scale:Array.from(header.scale),origin:Array.from(header.scale_origin)});
const partSpecs=trial.parts||[{key:modelKey,sha:trial.sha}];
let renderer,scene,camera,body,head,header,parts=[],draws=0;
const shades=new Float32Array(256).fill(1),lights=[{origin:[140,-100,150],radius:600,die:1e9,minlight:0},{origin:[-90,100,70],radius:300,die:1e9,minlight:0}];
function draw(label,{frame=0,yaw=0,bodyYaw=0,custom=true,detail=true,classic=false,picture=true}={}){
 vars.Cvar_SetValue('r_hdr',classic?0:1);vars.Cvar_SetValue('r_newer_enemies',custom?1:0);vars.Cvar_SetValue('r_newer_normals',detail?1:0);
 post.R_PostBegin(renderer,!classic,W,H);
 let customBound=true,nativeBound=true;
 for(const part of parts){
  // hiparma.qc's stable assembly: equal origins/frames; fixangle adds to body yaw only.
  part.entity.frame=frame;part.entity.angles[1]=yaw+(part.key==='armabody'?bodyYaw:0);
  const next=mesh.R_DrawAliasModel(part.entity,part.header,shades,.5);
  if(next!==part.current){part.current?.removeFromParent();part.current=next;scene.add(next);}
  next.visible=true;next._quakeOwner=part.entity;next.layers.enable(post.SUN_SHADOW_LAYER);
  const selected=skins.R_NewerAliasMaterial(part.entity,part.model.name,true,0);
  customBound&&=!!selected&&next.material.map===selected.map;
  nativeBound&&=next.material.map===part.header.gl_texturenum[0][0];
 }
 camera.updateMatrixWorld(true);
 post.R_PostLightsFrame(renderer,scene,camera,0,[],lights,10,false);
 if(!classic)post.R_PostBind(renderer);else renderer.setRenderTarget(null);
 renderer.clear();renderer.render(scene,camera);draws++;
 if(!classic)post.R_PostFinish(renderer,scene,camera,{lx:0,ly:0,lw:W,lh:H},0,[],lights,10,1,false);
 const pixels=new Uint8Array(W*H*4),gl=renderer.getContext();gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>8)visible++;
 if(picture){const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=renderer.domElement.toDataURL();caption.textContent=label;figure.append(image,caption);views.append(figure);}
 transitions.push({label,status:skins.R_NewerSkinsStatus(parts.map(part=>part.model)),parts:parts.map(part=>({key:part.key,status:skins.R_NewerSkinsStatus(part.model)}))});
 return {pixels,visible,glError:gl.getError(),customBound,nativeBound,frame,yaw,bodyYaw,parts:parts.length};
}
function difference(a,b){let changed=0,energy=0;for(let i=0;i<a.pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a.pixels[i+c]-b.pixels[i+c]);if(d>3)changed++;energy+=d;}return{changed,energy};}
async function run(){button.disabled=true;checks.length=0;views.replaceChildren();const started=performance.now(),poses=[];
 try{
  const front=draw('New skin: '+header.frames[0].name+' front'),back=draw('New skin: '+header.frames[0].name+' back',{yaw:180}),oblique=draw('New body: oblique seams',{yaw:45}),other=draw('New body: opposite oblique seams',{yaw:225});
  for(const [name,image]of [['front',front],['back',back],['oblique',oblique],['other oblique',other]])verify(image.customBound&&image.visible>1000&&image.glError===0,'actual fitted material visible: '+name,{visible:image.visible});
  for(let frame=0;frame<header.numframes;frame++){const image=draw('Native pose '+header.frames[frame].name,{frame,yaw:frame%2?45:0,picture:frame%16===0||frame===header.numframes-1||trial.keyframes?.includes(frame)});verify(image.customBound&&image.visible>500&&image.glError===0,'actual native pose '+frame+' uses fitted body',{visible:image.visible,name:header.frames[frame].name});poses.push({frame,name:header.frames[frame].name,visible:image.visible});}
  if(parts.length>1){
   const aligned=draw('Armagon standing, synchronized parts',{frame:64});
   for(const offset of [-25,25]){const turned=draw('Armagon upper-body yaw '+offset,{frame:64,bodyYaw:offset});verify(turned.customBound&&difference(aligned,turned).changed>100&&parts[1].entity.angles[1]===0,'body yaw adjusts independently: '+offset);}
   verify(parts.every(part=>Array.from(part.entity.origin).every(v=>v===0)),'both parts retain equal origins without a permanent 64-unit offset');
  }
  const flat=draw('Same pose: height relief off',{detail:false}),relief=draw('Same pose: stored height relief on');const height=difference(flat,relief);verify(height.changed>100,'stored height changes actual GPU pixels',height);
  const native=draw('Original native skin, same geometry',{custom:false}),replacement=draw('Fitted body, same geometry');const changed=difference(native,replacement);verify(native.nativeBound&&changed.changed>100,'custom toggle restores native and visibly changes actual body',changed);
  const classic=draw('Classic original Rogue enemy',{classic:true,custom:true}),classicNative=draw('Classic with custom switch off',{classic:true,custom:false});verify(classic.nativeBound&&classicNative.nativeBound&&difference(classic,classicNative).energy===0,'Classic pixels and original native material unchanged');
  vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('r_newer_enemies',1);vars.Cvar_SetValue('r_newer_normals',1);post.R_PostBegin(renderer,true,W,H);
  const status=skins.R_NewerSkinsStatus(parts.map(part=>part.model));verify(status.settled&&status.normals.pending===0&&status.normals.shipped>=parts.length*2&&status.normals.generated===0&&Object.keys(status.errors).length===0,'native and fitted normals are shipped and settled',{status});
  verify(!skins.R_NewerVariantMatchesModel({nativeModelSha256:trial.sha},head),'different native model cannot wear this replacement');verify(parts.every(part=>shape(part.header)===part.initialShape),'all native pose and display-command UV data unchanged');verify(errors.length===0,'actual material/compositor compile and runtime clean',{errors});
 }catch(error){checks.push({passed:false,name:String(error),stack:error.stack});}
 finally{renderer.setRenderTarget(null);button.disabled=false;}
 const result={transitions,model:modelKey,status:checks.every(c=>c.passed)?'PASS':'FAIL',modelSHA:body.aliasSourceIdentity.sha256,modelSHAs:parts.map(part=>({model:part.key,sha:part.model.aliasSourceIdentity.sha256})),frames:header.numframes,dimensions:trial.dimensions,draws,elapsedMs:performance.now()-started,poses,checks,scope:'Controlled actual owned MDL/production alias rendering; gameplay discovery/combat remains separate.'};window.rogueSkinResult=result;report.textContent=JSON.stringify(result,null,2); const receipt=document.querySelector('#receipt');receipt.href=URL.createObjectURL(new Blob([report.textContent],{type:'application/json'}));receipt.hidden=false; if(new URLSearchParams(location.search).has('saveEvidence')){const response=await fetch('/__qa__/rogue/'+modelKey,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({result,views:[...views.querySelectorAll('img')].map(image=>image.src)})});if(!response.ok)throw Error('Evidence save failed');}
}
try{
 for(const c of options)if(c&&!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
 for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_bounce:0,r_volumetric:0,r_newbright:1,r_newcontrast:1,r_pointshadows:1,r_newer_lighting:1,r_newer_normals:1,r_newer_enemies:1,r_newer_shadows:1,r_lerpmodels:0}))vars.Cvar_SetTemporary(name,String(value));
 for(const name of ['gfx/palette.lmp',...partSpecs.map(part=>'progs/'+part.key+'.mdl'),'progs/'+(trial.negative||'wrath')+'.mdl']){
  const path=name.startsWith('gfx/')?'games/shareware/pak0.pak':(trial.pack||'resources/rogue/pak0.pak');
  const range=async(start,length)=>{const r=await fetch(path,{headers:{Range:`bytes=${start}-${start+length-1}`}});if(r.status!==206)throw Error('Serve this trial with tools/serve.py (byte ranges required)');return r.arrayBuffer();};
  const h=new DataView(await range(0,12));if(h.getUint32(0,true)!==0x4b434150)throw Error('Invalid owned PAK');
  const directory=await range(h.getUint32(4,true),h.getUint32(8,true)),view=new DataView(directory),bytes=new Uint8Array(directory);let data;
  for(let i=0;i<bytes.length;i+=64){const entry=new TextDecoder().decode(bytes.subarray(i,i+56)).split('\0')[0];if(entry===name){data=await range(view.getUint32(i+56,true),view.getUint32(i+60,true));break;}}
  if(!data)throw Error('Missing owned member '+name);
  pak.COM_AddPack({filename:'owned-native-proof:'+name,files:[{name,filepos:0,filelen:data.byteLength}],data});
 }
 VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);vid.fullbright=224;models.Mod_Init();
 for(const spec of partSpecs){const model=models.Mod_ForName('progs/'+spec.key+'.mdl',true);await model.aliasSourceIdentity.promise;if(model.aliasSourceIdentity.sha256!==spec.sha)throw Error('Actual model identity mismatch: '+spec.key);const h=model.cache.data;parts.push({key:spec.key,model,header:h,initialShape:shape(h)});}
 body=parts[0].model;header=parts[0].header;head=models.Mod_ForName('progs/'+(trial.negative||'wrath')+'.mdl',true);await head.aliasSourceIdentity.promise;
 if(parts.some(part=>part.header.numframes!==header.numframes))throw Error('Paired model frame counts differ');
 const index=await(await fetch('newer/enemies/index.json')).json();skins.R_NewerSetIndex(index);
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,4,1500);camera.up.set(0,0,1);for(const part of parts){part.entity=new entity_t();part.entity.model=part.model;part.entity.skinnum=0;}
 const box=new THREE.Box3();for(const part of parts)for(let frame=0;frame<part.header.numframes;frame++){const native=mesh.GL_DrawAliasFrame(part.header,frame);box.union(new THREE.Box3().setFromBufferAttribute(native.posAttr));}const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(...size.toArray());camera.position.set(center.x+span*1.55,center.y,center.z+span*.65);camera.lookAt(center);
 post.R_PostBegin(renderer,true,W,H);await skins.R_NewerSkinsPrepare(parts.map(part=>part.model));const deadline=performance.now()+15000;while(!skins.R_NewerSkinsStatus(parts.map(part=>part.model)).settled){if(performance.now()>deadline)throw Error('Actual skin/normal readiness timeout');await new Promise(r=>setTimeout(r,20));}
 button.addEventListener('click',run);button.disabled=false;report.textContent='Ready: actual model, donor and shipped normal preparation settled.';
}catch(error){report.textContent=String(error.stack||error);window.rogueSkinResult={status:'FAIL',error:String(error)};}
window.addEventListener('pagehide',()=>{for(const c of options)if(c)vars.Cvar_RestoreTemporary(c.name);skins.R_NewerSkinsShutdown();renderer?.dispose();});
