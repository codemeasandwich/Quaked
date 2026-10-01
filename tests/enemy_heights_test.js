await import('../src/gl_rsurf.js');
const THREE = await import('three');
const skins = await import('../src/r_newerskins.js');
const anim = await import('../src/r_anim.js');

function equal(a,b,label) { if(a!==b) throw new Error(`${label}: ${a} != ${b}`); }
function pixels(seed=1,w=16,h=16) {
 const data=new Uint8Array(w*h*4);
 for(let i=0;i<w*h;i++) { const v=(i*37+seed*29)%255;data.set([v,v*.8,v*.6,255],i*4); }
 return new THREE.DataTexture(data,w,h);
}
function shaderFor(material) {
 const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>'};
 material.onBeforeCompile(shader);return shader;
}
function withState(fn) {
 const old=[anim.r_newer_normals.value,anim.r_newer_enemies.value];
 try { anim.R_AnimSetNewer(true);anim.R_AnimSetLighting(true);anim.r_newer_normals.value=1;anim.r_newer_enemies.value=1;skins.R_NewerSetIndex({models:{},nativeHeights:{},version:1});return fn(); }
 finally {skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex(null);anim.R_AnimSetNewer(false);anim.R_AnimSetLighting(false);[anim.r_newer_normals.value,anim.r_newer_enemies.value]=old;}
}

Deno.test('every stock enemy, head and gore model has height-driven native relief without replacement art',()=>withState(()=>{
 for(const key of skins.ENEMY_SKIN_MODELS) {
  const texture=pixels();const material=skins.R_EnemyAliasMaterial(texture,'progs/'+key+'.mdl',true,2,3);
  equal(material.map,texture,key+' keeps selected original skin/frame');
  const shader=shaderFor(material),normal=shader.uniforms.qrNormal.value;
  equal(shader.uniforms.uHasNormal.value,1,key+' has generated height normals');
  equal(normal.image.width,16,key+' matching normal width');
  equal(normal.image.height,16,key+' matching normal height');
  equal(shader.uniforms.uFlipGreen.value,0,key+' engine normal convention');
  equal(skins.R_EnemyAliasMaterial(texture,'progs/'+key+'.mdl',true,2,3),material,key+' material cached');
  texture.dispose();
 }
 equal(skins.R_EnemyAliasMaterial(pixels(),'progs/backpack.mdl',true),null,'pickups excluded');
}));

Deno.test('native relief respects independent normals, original enemy toggle, lighting and classic pass',()=>withState(()=>{
 const texture=pixels();const material=skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true);const shader=shaderFor(material);
 anim.r_newer_enemies.value=0;
 equal(skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true),material,'enemy replacement toggle keeps original relief');
 anim.R_AnimSetLighting(false);
 const unlit=skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true),unlitShader=shaderFor(unlit);
 equal(unlit.map,texture,'lighting off keeps native diffuse');equal(unlitShader.uniforms.uSkinRelit.value,0,'advanced light/gloss off');equal(unlitShader.uniforms.uSkinDetail.value,1,'normals remain enabled');
 anim.r_newer_normals.value=0;
 equal(shader.uniforms.uSkinDetail.value,0,'existing material updates when normals off');equal(skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true),null,'normals off returns original path');
 anim.r_newer_normals.value=1;anim.R_AnimSetNewer(false);
 equal(shader.uniforms.uSkinDetail.value,0,'classic comparison suppresses cached material relief');equal(skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true),null,'New Game stays original');
 texture.dispose();
}));

Deno.test('distinct skins and animation-frame textures keep distinct height maps and model-owned diffuse lifetimes',()=>withState(()=>{
 const a=pixels(1),b=pixels(2);let diffuseDisposals=0;a.addEventListener('dispose',()=>diffuseDisposals++);
 const ma=skins.R_EnemyAliasMaterial(a,'progs/enforcer.mdl',true,0,0),mb=skins.R_EnemyAliasMaterial(b,'progs/enforcer.mdl',true,1,2);
 const na=shaderFor(ma).uniforms.qrNormal.value,nb=shaderFor(mb).uniforms.qrNormal.value;
 equal(na===nb,false,'frames have independent normals');equal(ma.map,a,'skin0 diffuse');equal(mb.map,b,'skin1 diffuse');
 let normalDisposals=0;na.addEventListener('dispose',()=>normalDisposals++);
 skins.R_NewerSkinsShutdown();equal(diffuseDisposals,0,'cache does not own native diffuse');equal(normalDisposals,1,'native normal disposed once');
 a.dispose();b.dispose();equal(normalDisposals,1,'removed listener avoids second normal disposal');
}));

Deno.test('stored custom enemy height loads in either order, preserves UV and suppresses captions-independent material changes',()=>withState(()=>{
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load;
 const pending=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,onLoad,progress,onError) {pending.push({url,onLoad,onError});return new THREE.Texture();};
 try {
  for(const order of ['height-first','diffuse-first']) {
   skins.R_NewerSkinsShutdown();
   skins.R_NewerSetIndex({version:11,models:{shambler:[{dir:'shambler/'+order,maps:{diffuse:'diffuse.webp',height:'height.webp'},heightStrength:.65,heightCap:.55}]}});
   const entity={_entityIndex:1};equal(skins.R_NewerAliasMaterial(entity,'progs/shambler.mdl',true),null,'pending diffuse fallback');
   const requests=pending.splice(0);equal(requests.length,2,'two maps requested');equal(requests.every(p=>p.url.includes('?v=11')),true,'revision invalidates maps together');
   const diffuse=pixels(3),height=pixels(6);diffuse.offset.set(.2,.3);
   const d=requests.find(p=>p.url.includes('diffuse.webp')),h=requests.find(p=>p.url.includes('height.webp'));
   if(order==='height-first'){h.onLoad(height);d.onLoad(diffuse);}else{d.onLoad(diffuse);h.onLoad(height);}
   const material=skins.R_NewerAliasMaterial(entity,'progs/shambler.mdl',true);equal(material.map,diffuse,'custom diffuse loaded');
   const shader=shaderFor(material),normal=shader.uniforms.qrNormal.value;
   equal(shader.uniforms.uHasNormal.value,1,'stored height actively creates normals');equal(normal.offset.x,.2,'normal U offset matches diffuse');equal(normal.offset.y,.3,'normal V offset matches diffuse');
   equal(shader.fragmentShader.includes('uSkinDetail > 0.5'),true,'normal toggle gates actual shader');
   anim.r_newer_normals.value=0;equal(shader.uniforms.uSkinDetail.value,0,'cached custom material toggle');anim.r_newer_normals.value=1;
  }
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete globalThis.document;}
}));

Deno.test('failed or mismatched height downloads keep a safe native fallback',()=>withState(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,pending=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,onLoad,progress,onError){pending.push({onLoad,onError});return new THREE.Texture();};
 try {
  skins.R_NewerSetIndex({version:12,models:{},nativeHeights:{dog:[[{file:'heights/dog/skin0_0.webp',strength:.65,cap:.55}]]}});
  const texture=pixels(),material=skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true),shader=shaderFor(material),initial=shader.uniforms.qrNormal.value;
  equal(pending.length,1,'stored map requested');pending[0].onLoad(pixels(1,8,8));equal(shader.uniforms.qrNormal.value,initial,'wrong height dimensions do not attach');
  equal(shader.uniforms.uHasNormal.value,1,'generated relief retained');texture.dispose();
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}));

Deno.test('native two/three/five-frame groups use exactly the model loader animation slots',()=>withState(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,urls=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url){urls.push(url);return new THREE.Texture();};
 try {
  for(const count of [2,3,5]) {
   skins.R_NewerSkinsShutdown();const list=Array.from({length:count},(_,i)=>({file:`frame${i}.webp`,strength:.65,cap:.55}));
   skins.R_NewerSetIndex({version:13,models:{},nativeHeights:{dog:[list]}});
   for(let slot=0;slot<4;slot++) {
    const texture=pixels(slot);skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true,0,slot);
    const expected=count<=4 ? slot%count : Array.from({length:count},(_,i)=>i).filter(i=>(i&3)===slot).at(-1);
    equal(urls.at(-1).includes(`frame${expected}.webp`),true,`${count} frames slot ${slot}`);texture.dispose();
   }
  }
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}));

Deno.test('late custom/native downloads are disposed after shutdown and same-texture reuse',()=>withState(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,pending=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,onLoad){pending.push(onLoad);return new THREE.Texture();};
 try {
  skins.R_NewerSetIndex({version:14,models:{shambler:[{dir:'shambler/late',maps:{diffuse:'d.webp',height:'h.webp'}}]},nativeHeights:{dog:[[{file:'native.webp',strength:.65,cap:.55}]]}});
  skins.R_NewerAliasMaterial({_entityIndex:1},'progs/shambler.mdl',true);
  const native=pixels();skins.R_EnemyAliasMaterial(native,'progs/dog.mdl',true);const oldPending=pending.splice(0);skins.R_NewerSkinsShutdown();
  const current=skins.R_EnemyAliasMaterial(native,'progs/dog.mdl',true),before=shaderFor(current).uniforms.qrNormal.value;
  let lateDisposals=0;
  for(const callback of oldPending){const incoming=pixels();incoming.addEventListener('dispose',()=>lateDisposals++);callback(incoming);}
  equal(lateDisposals,3,'all stale incoming textures released');equal(shaderFor(current).uniforms.qrNormal.value,before,'old native callback cannot mutate new set');native.dispose();
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}));

Deno.test('failed and wrong-size custom heights actively fall back to the matching diffuse',()=>withState(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,pending=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,onLoad,p,onError){pending.push({url,onLoad,onError});return new THREE.Texture();};
 try {
  for(const kind of ['missing','wrong-size']) {
   skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex({version:15,models:{shambler:[{dir:'shambler/'+kind,maps:{diffuse:'diffuse.webp',height:'height.webp'}}]}});
   const entity={_entityIndex:1};skins.R_NewerAliasMaterial(entity,'progs/shambler.mdl',true);const requests=pending.splice(0);
   requests.find(r=>r.url.includes('diffuse')).onLoad(pixels());const h=requests.find(r=>r.url.includes('height'));
   if(kind==='missing')h.onError();else h.onLoad(pixels(1,8,8));
   const shader=shaderFor(skins.R_NewerAliasMaterial(entity,'progs/shambler.mdl',true));equal(shader.uniforms.uHasNormal.value,1,kind+' produces fallback relief');equal(shader.uniforms.qrNormal.value.image.width,16,kind+' matches diffuse');
  }
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}));

Deno.test('native height revision changes reject older responses and refresh the same diffuse texture',()=>withState(()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLoad=THREE.TextureLoader.prototype.load,pending=[];
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,onLoad){pending.push({url,onLoad});return new THREE.Texture();};
 try {
  const manifest=version=>({version,models:{},nativeHeights:{dog:[[{file:'native.webp',strength:.65,cap:.55}]]}});
  skins.R_NewerSetIndex(manifest(20));const texture=pixels();skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true);
  skins.R_NewerSetIndex(manifest(21));const material=skins.R_EnemyAliasMaterial(texture,'progs/dog.mdl',true);equal(pending.length,2,'new version requests same path again');
  const oldHeight=pixels(4);let disposed=0;oldHeight.addEventListener('dispose',()=>disposed++);pending[0].onLoad(oldHeight);equal(disposed,1,'old version rejected');
  const generated=shaderFor(material).uniforms.qrNormal.value;let normalDisposals=0;generated.addEventListener('dispose',()=>normalDisposals++);
  pending[1].onLoad(pixels(7));equal(shaderFor(material).uniforms.uHasNormal.value,1,'new response remains active');equal(normalDisposals,1,'generated normal released on stored refresh');texture.dispose();equal(normalDisposals,1,'refresh leaves no stale normal dispose listener');
 } finally {THREE.TextureLoader.prototype.load=oldLoad;if(descriptor)Object.defineProperty(globalThis,'document',descriptor);else delete globalThis.document;}
}));
