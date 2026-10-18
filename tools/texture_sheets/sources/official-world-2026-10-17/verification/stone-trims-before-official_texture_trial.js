import * as THREE from 'three';
import '../src/newer/install.js';
import {createQuakeLightmapMaterial} from '../src/engine/render/gl_rsurf_materials.js';
import {R_NewerTextureUpgrade,R_GlassTextureKey} from '../src/newer/render/r_newertextures.js';
import {R_NormalMapFor} from '../src/newer/render/gl_normals.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
const candidate='newer/textures/candidates-2026-10-12/';
// Explicit review manifests can retain candidate paths after source integration.
// Only this diagnostic page receives these bindings; it never writes the index.
const batch=new URL(location.href).searchParams.get('batch');
// Keep new-material GPU review bounded; the separate public suite checks the full catalogue.
const manifest=({realism:'realism-trial.json',character:'character-trial.json',aged:'aged-trial.json',industrial:'../candidates-2026-10-17/industrial-trial.json',owner:'../candidates-2026-10-17/owner-q92-trial.json',legacytech:'../candidates-2026-10-17/legacy-tech-q92-trial.json',nexteight:'../candidates-2026-10-17/next-eight-trial.json',building:'../candidates-2026-10-17/building-trial.json',crosspack:'../candidates-2026-10-17/crosspack-trial.json'})[batch]||'trial.json';
const specs=await fetch(candidate+manifest).then(r=>r.json()),index=await fetch('newer/textures/index.json').then(r=>r.json());
document.querySelector('#asset-count').textContent=String(Object.keys(specs).length);
document.querySelector('#asset').replaceChildren(...Object.keys(specs).map(name=>{const option=document.createElement('option');option.value=option.textContent=name;return option;}));
const originals={},finished={},textures={},checks=[];
const check=(ok,label)=>{checks.push({passed:!!ok,label});if(!ok)throw Error(label);};
async function image(src,sha){const r=await fetch(src);check(r.ok,'Image available: '+src);const bytes=await r.arrayBuffer();const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');check(digest===sha,'Image SHA matches trial: '+src);const url=URL.createObjectURL(new Blob([bytes]));try{return await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Image unavailable: '+src));i.src=url;});}finally{URL.revokeObjectURL(url);}}
function pixels(image){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return new Uint8Array(ctx.getImageData(0,0,c.width,c.height).data);}
const receipt={qualification:'Candidate-only material/source trial. No gameplay catalogue edit or owner appearance acceptance.',manifest,checks,assets:{}};
const realFetch=globalThis.fetch.bind(globalThis);
// Only this page sees these candidate bindings, keyed by the actual native identity.
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.pathname.endsWith('/newer/textures/index.json'))return Promise.resolve(new Response(JSON.stringify(index),{headers:{'Content-Type':'application/json'}}));
 return realFetch(input,init);
};
for(const c of [post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,post.r_bounce,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_water,mode.r_newer_textures])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
vars.Cvar_SetValue('r_hdr',1);post.r_dynres.value=0;post.r_bloom.value=0;post.r_volumetric.value=0;post.r_bounce.value=0;
mode.r_newer_water.value=0;mode.r_newer_textures.value=1;mode.r_newer_normals.value=1;
try{
 for(const name of Object.keys(specs)){
  originals[name]=await image(specs[name].original,specs[name].originalSha256);finished[name]=await image('newer/textures/'+specs[name].file,specs[name].diffuseSha256);
  const heightImage=await image('newer/textures/'+specs[name].height,specs[name].heightSha256);
  check(heightImage.width===finished[name].width&&heightImage.height===finished[name].height,name+': height image dimensions');
  for(const [axis,path]of Object.entries(specs[name].normalChannels||{})){
   const normalImage=await image('newer/textures/'+path,specs[name].normalChannelSha256[axis]);
   check(normalImage.width===finished[name].width&&normalImage.height===finished[name].height,name+': '+axis+' normal component dimensions');
  }
  const original=originals[name],t=new THREE.DataTexture(pixels(original),original.width,original.height,THREE.RGBAFormat);
  check(finished[name].width===original.width*4&&finished[name].height===original.height*4,name+': four-times native dimensions');
  t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;
  const key=R_GlassTextureKey(t),actualName=specs[name].name||name;
  if(specs[name].nativeKey)check(key===specs[name].nativeKey,name+': actual native identity matches');
  index.ordinaryVariants??={};index.ordinaryVariants[actualName]??={};
  index.ordinaryVariants[actualName][key]={file:specs[name].file,normal:{file:specs[name].height,normalChannels:specs[name].normalChannels,strength:specs[name].strength,cap:specs[name].cap}};
  textures[name]=t;
 }
 index.version=String(index.version)+'-source-locked-trial';
 for(const[name,t]of Object.entries(textures)){
  const old=t.image;R_NewerTextureUpgrade(specs[name].name||name,t);const deadline=performance.now()+60000;
  while(t.userData.newerPending&&performance.now()<deadline)await new Promise(r=>setTimeout(r,30));
  check(t.userData.newerPicture===true,name+': public loader selected candidate');
  check(t.userData.classicImage===old,name+': original image preserved');
  check(t.image.width===finished[name].width&&t.image.height===finished[name].height,name+': full candidate resolution');
  let normal;while(!(normal=R_NormalMapFor(t))&&performance.now()<deadline)await new Promise(r=>setTimeout(r,30));
  check(normal?.image.width===t.image.width&&normal?.image.height===t.image.height,name+': prepared normal dimensions');
  receipt.assets[name]={native:[old.width,old.height],candidate:[t.image.width,t.image.height],normal:[normal.image.width,normal.image.height],sourceIdentity:R_GlassTextureKey(t),normalHeightSource:normal.userData.heightSource};
 }
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(480,480);renderer.setPixelRatio(1);document.querySelector('#gpu').append(renderer.domElement);
 receipt.shaderErrors=[];renderer.debug.onShaderError=(gl,p,v,f)=>receipt.shaderErrors.push(gl.getProgramInfoLog(p)+'\n'+gl.getShaderInfoLog(f));
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,0,3.1);camera.lookAt(0,0,0);
 scene.add(new THREE.AmbientLight(0xffffff,1));const light=new THREE.DirectionalLight(0xffffff,1.3);light.position.set(-2,3,4);scene.add(light);
 const lightmap=new THREE.DataTexture(new Uint8Array([180,180,180,255]),1,1);lightmap.colorSpace=THREE.SRGBColorSpace;lightmap.needsUpdate=true;
 const geo=new THREE.PlaneGeometry(2,2);geo.setAttribute('uv1',geo.attributes.uv.clone());let material;
 const mesh=new THREE.Mesh(geo);scene.add(mesh);
 function draw(){
  const name=document.querySelector('#asset').value,view=document.querySelector('#size').value,repeat=+document.querySelector('#repeat').value;
  const source=originals[name],factor=view==='half'?.5:view==='quarter'?.25:view==='eighth'?.125:view==='native'?1:512/Math.max(source.width,source.height);
  const width=Math.max(1,Math.round(source.width*factor)),height=Math.max(1,Math.round(source.height*factor));
  for(const[id,img]of [['native',originals[name]],['finished',finished[name]]]){
   const c=document.querySelector('#'+id);c.width=width*repeat;c.height=height*repeat;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
   for(let y=0;y<repeat;y++)for(let x=0;x<repeat;x++)ctx.drawImage(img,x*width,y*height,width,height);
  }
  mode.r_newer_normals.value=document.querySelector('#relief').checked?1:0;
  // Quake textures keep flipY=false. Match the top-down source comparison
  // rather than PlaneGeometry's conventional bottom-up image orientation.
  const uv=geo.attributes.uv;uv.setXY(0,0,0);uv.setXY(1,repeat,0);uv.setXY(2,0,repeat);uv.setXY(3,repeat,repeat);uv.needsUpdate=true;
  post.R_PostBegin(renderer,true,480,480);
  material?.dispose();material=createQuakeLightmapMaterial(textures[name],lightmap);
  mesh.material=material;mesh.scale.set(source.width/Math.max(source.width,source.height),source.height/Math.max(source.width,source.height),1);camera.updateMatrixWorld();post.R_PostBind(renderer);renderer.clear();renderer.render(scene,camera);
  post.R_PostFinish(renderer,scene,camera,{lx:0,ly:0,lw:480,lh:480},0,[],[],0,1,false);
  receipt.lastDraw={name,view,comparisonDimensions:[width,height],repeat,relief:!!material.normalMap,material:material.type,drawCalls:renderer.info.render.calls};
  document.querySelector('#receipt').textContent=JSON.stringify(receipt,null,2);window.officialTextureTrial=receipt;
 }
 // A GPU upload can trigger refreshed preparation. Redraw only for that
 // concrete completion event, rather than claiming relief before it binds.
 const updates=[];
 for(const[name,t]of Object.entries(textures)){
  const update=()=>{if(document.querySelector('#asset').value===name&&document.querySelector('#relief').checked&&!material?.normalMap)requestAnimationFrame(draw);};
  t.addEventListener('newertextureupdated',update);updates.push(()=>t.removeEventListener('newertextureupdated',update));
 }
 for(const id of ['asset','size','repeat','relief'])document.querySelector('#'+id).onchange=draw;
 document.querySelector('#render').onclick=draw;draw();
 window.addEventListener('pagehide',()=>{updates.forEach(f=>f());material?.dispose();geo.dispose();lightmap.dispose();Object.values(textures).forEach(t=>t.dispose());post.R_PostShutdown();renderer.dispose();globalThis.fetch=realFetch;},{once:true});
}catch(error){receipt.error=String(error.stack||error);document.querySelector('#receipt').textContent=JSON.stringify(receipt,null,2);window.officialTextureTrial=receipt;throw error;}
