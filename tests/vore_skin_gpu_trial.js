import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import * as models from '../src/engine/render/gl_model.js';
import * as mesh from '../src/engine/render/gl_mesh.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as post from '../src/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import {vid,VID_SetPalette} from '../src/engine/render/vid.js';
import {entity_t} from '../src/engine/render/render.js';
const W=640,H=640,button=document.querySelector('#run'),report=document.querySelector('#report'),views=document.querySelector('#views');
const errors=[],checks=[],owned=[],options=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_bounce,post.r_volumetric,post.r_newbright,post.r_newcontrast,post.r_pointshadows,anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_enemies,anim.r_newer_shadows,anim.r_lerpmodels];
window.addEventListener('error',event=>errors.push({runtime:event.message}));window.addEventListener('unhandledrejection',event=>errors.push({rejection:String(event.reason)}));
const verify=(value,name,data={})=>checks.push({passed:!!value,name,...data});
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
const shape=header=>JSON.stringify({frames:header.frames,poseverts:header.poseverts,stverts:header.stverts,triangles:header.triangles});
let renderer,scene,camera,body,head,entity,header,current,initialShape,draws=0;
const shades=new Float32Array(256).fill(1),lights=[{origin:[140,-100,150],radius:600,die:1e9,minlight:0},{origin:[-90,100,70],radius:300,die:1e9,minlight:0}];
function draw(label,{frame=23,yaw=0,custom=true,detail=true,classic=false,picture=true}={}){
 vars.Cvar_SetValue('r_hdr',classic?0:1);vars.Cvar_SetValue('r_newer_enemies',custom?1:0);vars.Cvar_SetValue('r_newer_normals',detail?1:0);
 post.R_PostBegin(renderer,!classic,W,H);entity.frame=frame;entity.angles[1]=yaw;
 const next=mesh.R_DrawAliasModel(entity,header,shades,.5);if(next!==current){current?.removeFromParent();current=next;scene.add(next);}
 current.visible=true;current._quakeOwner=entity;current.layers.enable(post.SUN_SHADOW_LAYER);camera.updateMatrixWorld(true);
 const selected=skins.R_NewerAliasMaterial(entity,body.name,true,0);
 post.R_PostLightsFrame(renderer,scene,camera,0,[],lights,10,false);
 if(!classic)post.R_PostBind(renderer);else renderer.setRenderTarget(null);
 renderer.clear();renderer.render(scene,camera);draws++;
 if(!classic)post.R_PostFinish(renderer,scene,camera,{lx:0,ly:0,lw:W,lh:H},0,[],lights,10,1,false);
 const pixels=new Uint8Array(W*H*4),gl=renderer.getContext();gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>8)visible++;
 if(picture){const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=renderer.domElement.toDataURL();caption.textContent=label;figure.append(image,caption);views.append(figure);}
 return {pixels,visible,glError:gl.getError(),customBound:!!selected&&current.material.map===selected.map,nativeBound:current.material.map===header.gl_texturenum[0][0],frame,yaw};
}
function difference(a,b){let changed=0,energy=0;for(let i=0;i<a.pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a.pixels[i+c]-b.pixels[i+c]);if(d>3)changed++;energy+=d;}return{changed,energy};}
async function run(){button.disabled=true;checks.length=0;views.replaceChildren();const started=performance.now(),poses=[];
 try{
  const front=draw('New body: native walk1 front'),back=draw('New body: native walk1 back',{yaw:180}),oblique=draw('New body: oblique seams',{yaw:45}),other=draw('New body: opposite oblique seams',{yaw:225});
  for(const [name,image]of [['front',front],['back',back],['oblique',oblique],['other oblique',other]])verify(image.customBound&&image.visible>1000&&image.glError===0,'actual fitted material visible: '+name,{visible:image.visible});
  for(let frame=0;frame<header.numframes;frame++){const image=draw('Native pose '+header.frames[frame].name,{frame,yaw:frame%2?45:0,picture:true});verify(image.customBound&&image.visible>500&&image.glError===0,'actual native pose '+frame+' uses fitted body',{visible:image.visible,name:header.frames[frame].name});poses.push({frame,name:header.frames[frame].name,visible:image.visible});}
  const flat=draw('Same pose: height relief off',{detail:false}),relief=draw('Same pose: stored height relief on');const height=difference(flat,relief);verify(height.changed>100,'stored height changes actual GPU pixels',height);
  const native=draw('Original native skin, same geometry',{custom:false}),replacement=draw('Fitted body, same geometry');const changed=difference(native,replacement);verify(native.nativeBound&&changed.changed>100,'custom toggle restores native and visibly changes actual body',changed);
  const classic=draw('Classic original Vore',{classic:true,custom:true}),classicNative=draw('Classic with custom switch off',{classic:true,custom:false});verify(classic.nativeBound&&classicNative.nativeBound&&difference(classic,classicNative).energy===0,'Classic pixels and original native material unchanged');
  vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('r_newer_enemies',1);vars.Cvar_SetValue('r_newer_normals',1);post.R_PostBegin(renderer,true,W,H);
  const status=skins.R_NewerSkinsStatus([body]);verify(status.settled&&status.normals.pending===0&&status.normals.shipped>=2&&status.normals.generated===0&&Object.keys(status.errors).length===0,'native and fitted normals are shipped and settled',{status});
  verify(skins.R_NewerAliasMaterial({model:head},head.name,true,0)===null,'separate head has no body replacement');verify(shape(header)===initialShape,'all native pose, triangle and UV records unchanged');verify(errors.length===0,'actual material/compositor compile and runtime clean',{errors});
 }catch(error){checks.push({passed:false,name:String(error),stack:error.stack});}
 finally{renderer.setRenderTarget(null);button.disabled=false;}
 const result={status:checks.every(c=>c.passed)?'PASS':'FAIL',modelSHA:body.aliasSourceIdentity.sha256,frames:header.numframes,dimensions:[1060,975],draws,elapsedMs:performance.now()-started,poses,checks,scope:'Controlled actual owned MDL/production alias rendering; gameplay discovery/combat remains separate.'};window.voreSkinResult=result;report.textContent=JSON.stringify(result,null,2);
}
try{
 for(const c of options)if(c&&!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
 for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_bounce:0,r_volumetric:0,r_newbright:1,r_newcontrast:1,r_pointshadows:1,r_newer_lighting:1,r_newer_normals:1,r_newer_enemies:1,r_newer_shadows:1,r_lerpmodels:0}))vars.Cvar_SetTemporary(name,String(value));
 for(const name of ['gfx/palette.lmp','progs/shalrath.mdl','progs/h_shal.mdl']){const response=await fetch('/__qa__/native/'+name);if(!response.ok)throw Error('Missing actual owned member '+name);const data=await response.arrayBuffer();pak.COM_AddPack({filename:'owned-native-proof:'+name,files:[{name,filepos:0,filelen:data.byteLength}],data});}
 VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);vid.fullbright=224;models.Mod_Init();body=models.Mod_ForName('progs/shalrath.mdl',true);head=models.Mod_ForName('progs/h_shal.mdl',true);await body.aliasSourceIdentity.promise;
 if(body.aliasSourceIdentity.sha256!=='da3dddbf592c05ce0c0340cc2eea842f28b5dcb9c0c03946abfb225c0b0a54ee')throw Error('Actual Vore body identity mismatch');header=body.cache.data;initialShape=shape(header);
 const index=await(await fetch('newer/enemies/index.json')).json();skins.R_NewerSetIndex(index);
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(42,1,4,1500);camera.up.set(0,0,1);entity=new entity_t();entity.model=body;entity.skinnum=0;
 const box=new THREE.Box3();for(let frame=0;frame<header.numframes;frame++){const native=mesh.GL_DrawAliasFrame(header,frame);box.union(new THREE.Box3().setFromBufferAttribute(native.posAttr));}const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(...size.toArray());camera.position.set(center.x+span*2.2,center.y,center.z+span*.15);camera.lookAt(center);
 post.R_PostBegin(renderer,true,W,H);await skins.R_NewerSkinsPrepare([body]);const deadline=performance.now()+15000;while(!skins.R_NewerSkinsStatus([body]).settled){if(performance.now()>deadline)throw Error('Actual skin/normal readiness timeout');await new Promise(r=>setTimeout(r,20));}
 button.addEventListener('click',run);button.disabled=false;report.textContent='Ready: actual model, donor and shipped normal preparation settled.';
}catch(error){report.textContent=String(error.stack||error);window.voreSkinResult={status:'FAIL',error:String(error)};}
window.addEventListener('pagehide',()=>{for(const c of options)if(c)vars.Cvar_RestoreTemporary(c.name);skins.R_NewerSkinsShutdown();renderer?.dispose();});
