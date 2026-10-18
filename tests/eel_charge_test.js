// Independent public tests for pose-bound Eel electricity. The actual owned MDL is read only.
// Texture transport is controlled until the separate one-base asset migration is installed.
await import('../src/engine/render/gl_rsurf.js');
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {readFileSync} from './helpers/resource_fs.mjs';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import {GL_DrawAliasFrame,R_DrawAliasModel} from '../src/engine/render/gl_mesh.js';
import {entity_t} from '../src/engine/render/render.js';
import * as mode from '../src/newer/mode.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as skins from '../src/newer/render/r_newerskins.js'; // Canonical module: Eel uses this exact instance.
import * as E from '../src/newer/render/r_eelcharge.js';
import * as L from '../src/newer/render/r_lightning.js';
import * as vars from '../src/engine/common/cvar.js';
import {cvar_t} from '../src/engine/common/cvar.js';
import {R_SaveClassicScene} from '../src/newer/render/r_classicstate.js';
import '../src/newer/install.js';
const SHA='58b9c4a4af9953f8c024158ba8a7cebd33e19834440c09026fd5931cb6b831a7',NAME='progs/eel2.mdl';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),near=(a,b,m,e=1e-5)=>check(Math.abs(a-b)<=e,m+': '+a+' != '+b);
const hash=b=>createHash('sha256').update(b).digest('hex'),read=p=>readFileSync(new URL('../'+p,import.meta.url));
const originalIndex=JSON.parse(read('newer/enemies/index.json'));let nativePromise,serial=0;
async function native(){return nativePromise||=(async()=>{
 const directory=await pakDirectory(process.env.QUAKED_OWNED_PAK||'/Users/bri/quaked/Dissolution of Eternity/pak0.pak'),palette=await pakDirectory(process.env.QUAKED_ID1_PAK||'/Users/bri/quaked/Quake/pak0.pak');
 COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(palette.get('gfx/palette.lmp'))));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();const bytes=await readMember(directory.get(NAME));same(hash(bytes),SHA,'owned Eel identity');COM_AddPack(isolatedPack(NAME,bytes));const model=new model_t();model.name=NAME;model.needload=true;Mod_LoadModel(model,true);await model.aliasSourceIdentity.promise;same(model.aliasSourceIdentity.sha256,SHA,'actual public model identity');return{model,bytes,header:model.cache.data};
})();}
function index(){return{version:'eel-charge-public-'+ ++serial,models:{eel2:Array.from({length:6},(_,skin)=>({dir:'eel2/custom',skin,nativeModelSha256:SHA,maps:{diffuse:'diffuse.webp',height:'height.webp'},heightStrength:.65,heightCap:.55,flipGreen:false}))},nativeHeights:{}};}
async function fixture(run){
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),load:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),enemies:mode.r_newer_enemies.value,normals:mode.r_newer_normals.value,lerp:anim.r_lerpmodels.value};const requests=[];
 E.R_EelChargeClear();skins.R_NewerSkinsShutdown();Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;anim.r_lerpmodels.value=0;skins.R_NewerSetIndex(index());
 try{await run(await native(),requests);}finally{E.R_EelChargeClear();skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex(originalIndex);THREE.TextureLoader.prototype.load=old.load;for(const key of ['document','window']){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_enemies.value=old.enemies;mode.r_newer_normals.value=old.normals;anim.r_lerpmodels.value=old.lerp;}
}
function entity(model,id=11){const e=new entity_t();e.model=model;e._entityIndex=id;e.origin=[0,0,0];e.angles=[0,0,0];e.frame=0;e.skinnum=3;return e;}
const shades=new Float32Array(256).fill(1);
function draw(e,h){return R_DrawAliasModel(e,h,shades,.5);}
async function ready(model,requests){await skins.R_NewerSkinsPrepare([model]);same(requests.length,2,'six aliases load one actual diffuse/height pair');requests.forEach(r=>r.done(r.texture));check(skins.R_NewerSkinsStatus([model]).settled,'controlled image transport settled');}
function geo(h,pose){const t=GL_DrawAliasFrame(h,pose),g=new THREE.BufferGeometry();g.setAttribute('position',t.posAttr);g.setAttribute('normal',t.normalAttr);g.setAttribute('uv',t.uvAttr);g.setIndex(t.indices);return g;}
function array(fx){return fx.geometry.attributes.position.data.array.subarray(0,fx.geometry.drawRange.count*13);}
function geometryHash(fx){const a=array(fx);return hash(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
function immutable(h){return JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames});}
Deno.test('All thirty Eel electrode anchors match actual native UV triangles and all twenty-one owned poses',async()=>{
 const{header:h,bytes}=await native(),before=immutable(h);same(h.numskins,6,'six original native skins');same(h.numposes,21,'original poses');const frameStart=84+6*(4+136*194)+148*12+260*16;
 for(let pose=0;pose<21;pose++){
  const g=geo(h,pose),anchors=E.R_EelChargeAnchors(g),points=E.R_EelChargeSample(g,anchors);same(anchors.length,30,'two fifteen-node side chains');same(E.R_EelChargeAnchors(g),anchors,'topology binding cached');
  for(let i=0;i<30;i++){const a=anchors[i],node=i%15,side=Math.floor(i/15),x=(node<9?15:node<13?16:17)+side*68,y=42+node*5;same(a.node,node,'native node order');same(a.side,side,'native side order');near(a.uv[0],(x+.5)/136,'original electrode U',1e-9);near(a.uv[1],(y+.5)/194,'original electrode V',1e-9);check(a.weights.every(v=>v>=-1e-6&&v<=1+1e-6),'anchor is inside triangle');near(a.weights.reduce((n,v)=>n+v,0),1,'barycentric sum');
   for(let axis=0;axis<2;axis++){const u=a.vertices.reduce((sum,v,k)=>sum+a.weights[k]*(axis?g.attributes.uv.getY(v):g.attributes.uv.getX(v)),0);near(u,a.uv[axis],'anchor reconstructs its actual UV');}
   for(let axis=0;axis<3;axis++){const expected=a.vertices.reduce((sum,v,k)=>{const raw=h.meshVertexOrder[v],offset=frameStart+pose*(28+148*4)+28+raw*4;return sum+a.weights[k]*(bytes[offset+axis]*bytes.readFloatLE(8+axis*4)+bytes.readFloatLE(20+axis*4));},0);near(points[i].point[axis],expected,'sample uses actual native pose bytes',2e-5);}
   near(Math.hypot(...points[i].normal),1,'finite normalized surface direction');
  }
 }
 same(immutable(h),before,'sampling never mutates original commands or poses');same(hash(bytes),SHA,'owned bytes unchanged');
});
Deno.test('Anchor sampling follows interpolated and replaced position attributes without stale pose caching',async()=>{
 const{header:h}=await native(),g=geo(h,0),anchors=E.R_EelChargeAnchors(g),a=E.R_EelChargeSample(g),next=geo(h,5),b=E.R_EelChargeSample(next),t=.37,positions=Float32Array.from(g.attributes.position.array,(v,i)=>v*(1-t)+next.attributes.position.array[i]*t);g.setAttribute('position',new THREE.BufferAttribute(positions,3));same(E.R_EelChargeAnchors(g),anchors,'only topology is cached');
 const blended=E.R_EelChargeSample(g);for(let n=0;n<30;n++)for(let k=0;k<3;k++)near(blended[n].point[k],a[n].point[k]*(1-t)+b[n].point[k]*t,'actual interpolated attribute sampled',2e-5);
 for(let i=0;i<positions.length;i+=3)positions[i]+=3;const moved=E.R_EelChargeSample(g);for(let n=0;n<30;n++)near(moved[n].point[0],blended[n].point[0]+3,'in-place posed updates sampled');g.setAttribute('uv',g.attributes.uv.clone());check(E.R_EelChargeAnchors(g)!==anchors,'topology attribute replacement invalidates binding');
});
Deno.test('Canonical public skin preparation shares one base material across every native charge state',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const e=entity(model),scene=new THREE.Scene(),materials=new Set(),textures=new Set(),before=immutable(h);
 for(let state=0;state<6;state++){e.skinnum=state;const m=draw(e,h);scene.add(m);const selected=skins.R_NewerAliasMaterial(e,NAME,true,state);check(selected,'canonical selector ready for each state');same(m.material,selected,'actual alias draw selects shared base');materials.add(selected);textures.add(selected.map);const fx=E.R_EelChargeSeen(e,m,scene,10);same(!!fx,state!==0,'native charge state alone controls FX');same(e.skinnum,state,'FX never rewrites native state');}
 same(materials.size,1,'one material family for six states');same(textures.size,1,'one diffuse for six states');same(requests.length,2,'no hidden charge image/overlay requests');same(immutable(h),before,'actual alias state unchanged');
}));
Deno.test('Electricity is finite bounded deterministic and prepared before render callbacks',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const e=entity(model),m=draw(e,h),scene=new THREE.Scene();scene.add(m);let sameFx;
 for(let stage=1;stage<=5;stage++){
  e.skinnum=stage;const fx=E.R_EelChargeSeen(e,m,scene,20.125);check(fx,'charge created');if(sameFx)same(fx,sameFx,'same entity reuses geometry');sameFx=fx;check(fx.geometry.drawRange.count>0&&fx.geometry.drawRange.count<=E.EEL_CHARGE.maxVertices,'bounded active geometry');check(Array.from(array(fx)).every(Number.isFinite),'finite attributes');const before=geometryHash(fx),version=fx.geometry.attributes.position.data.version;
  E.R_EelChargeSeen(e,m,scene,20.125);same(geometryHash(fx),before,'same state/time/seed repeats exact geometry');fx.onBeforeRender(null,scene,new THREE.PerspectiveCamera());same(geometryHash(fx),before,'render callback never changes vertex data');same(fx.geometry.attributes.position.data.version,version+1,'only repeated Seen marked new upload');same(fx.material.uniforms.uTime.value,20.125,'render callback selects this entity clock');same(fx.material.uniforms.uEffectOn.value,1,'enabled current state');
  same(fx.material.depthTest,true,'depth tested');same(fx.material.depthWrite,false,'does not overwrite body depth');same(fx.material.blending,THREE.AdditiveBlending,'additive emission');same(fx.frustumCulled,false,'first draw cannot be culled by stale bounds');same(fx.castShadow,false,'no false electric shadow');same(fx.userData.newerOnly,true,'Classic-only hiding tag');
  const position=fx.geometry.attributes.position,data=fx.geometry.attributes.aData;for(let i=0;i<fx.geometry.drawRange.count;i+=6){for(let k=0;k<3;k++)near(position.array[(i*13)+k],position.array[((i+1)*13)+k],'paired vertices share centreline');same(data.getX(i),-1,'first ribbon side');same(data.getX(i+1),1,'opposite ribbon side');}
 }
 const old=geometryHash(sameFx);E.R_EelChargeSeen(e,m,scene,20.2);check(geometryHash(sameFx)!==old,'time animates connected arcs');e.skinnum=0;same(E.R_EelChargeSeen(e,m,scene,20.2),null,'state zero immediately stops charge');same(E.R_EelChargeStatus().entries,0,'no invented skin-five hold');same(sameFx.parent,null,'reset removes effect');
}));
Deno.test('Posed Eel child geometry follows native transforms and remains independent between entities',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const scene=new THREE.Scene(),portal=new THREE.Group();portal.position.set(100,200,50);scene.add(portal);const a=entity(model,17),b=entity(model,18);a.origin=[7,11,13];a.angles=[10,35,5];b.origin=[-20,3,9];b.frame=8;const ma=draw(a,h),mb=draw(b,h);portal.add(ma);scene.add(mb);const fa=E.R_EelChargeSeen(a,ma,portal,30),fb=E.R_EelChargeSeen(b,mb,scene,30);check(fa&&fb,'two charged Eels');check(fa.geometry!==fb.geometry,'per-entity geometry');same(fa.material,fb.material,'shared electricity material');check(geometryHash(fa)!==geometryHash(fb),'entity seed and pose do not bleed');same(fa.parent,ma,'effect is native mesh child');
 scene.updateMatrixWorld(true);const p=new THREE.Vector3().fromBufferAttribute(fa.geometry.attributes.position,0),world=p.clone().applyMatrix4(fa.matrixWorld),expected=p.clone().applyMatrix4(ma.matrixWorld);near(world.distanceTo(expected),0,'effect follows full native plus portal transform');const before=geometryHash(fb);a.frame=15;draw(a,h);E.R_EelChargeSeen(a,ma,portal,31);same(geometryHash(fb),before,'other Eel geometry untouched');fb.onBeforeRender();same(fb.material.uniforms.uTime.value,30,'other Eel clock retained');fa.onBeforeRender();same(fa.material.uniforms.uTime.value,31,'current Eel clock selected independently');
}));
Deno.test('Scene-token lifecycle releases only unseen owners and never disposes native assets or shared noise',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const scene=new THREE.Scene(),ghost=new THREE.Group(),a=entity(model,1),b=entity(model,2),ma=draw(a,h),mb=draw(b,h);scene.add(ma);ghost.add(mb);const fa=E.R_EelChargeSeen(a,ma,scene,1),fb=E.R_EelChargeSeen(b,mb,ghost,1);let disposedA=0,disposedB=0,nativeDisposed=0,noiseDisposed=0;fa.geometry.addEventListener('dispose',()=>disposedA++);fb.geometry.addEventListener('dispose',()=>disposedB++);ma.geometry.addEventListener('dispose',()=>nativeDisposed++);const noise=L.R_LightningNoise(),onNoise=()=>noiseDisposed++;noise.addEventListener('dispose',onNoise);
 try{E.R_EelChargeBegin(scene);E.R_EelChargeEnd(scene);same(disposedA,1,'unseen main entity released');same(disposedB,0,'ghost ownership isolated');same(fb.visible,true,'other scene still visible');same(E.R_EelChargeStatus().entries,1,'one independent ghost remains');E.R_EelChargeRelease(b);E.R_EelChargeRelease(b);same(disposedB,1,'release is idempotent');E.R_EelChargeClear();same(nativeDisposed,0,'model geometry not owned by charge effect');same(noiseDisposed,0,'shared gun noise never disposed');same(E.R_EelChargeStatus().entries,0,'all effect records cleared');}finally{noise.removeEventListener('dispose',onNoise);}
}));
Deno.test('Pending missing wrong identity and failed custom textures retain native state without electrical overlays',async()=>fixture(async({model,header:h},requests)=>{
 const e=entity(model),scene=new THREE.Scene();await skins.R_NewerSkinsPrepare([model]);same(requests.length,2,'one pending pair');let m=draw(e,h);scene.add(m);same(m.material.map,h.gl_texturenum[3][0],'pending custom uses original state3');same(E.R_EelChargeSeen(e,m,scene,1),null,'no FX on pending native fallback');requests.forEach(r=>r.fail());m=draw(e,h);same(E.R_EelChargeSeen(e,m,scene,1),null,'failed images retain native presentation');same(E.R_EelChargeStatus().entries,0,'no failed-asset effect allocation');
 for(const identity of [undefined,{state:'pending'},{state:'unavailable'},{state:'ready',sha256:'0'.repeat(64)}])same(E.R_EelChargeWanted({...e,model:{...model,aliasSourceIdentity:identity}}),false,'unapproved model identity rejected');for(const state of [-1,0,6,1.2,NaN,undefined])same(E.R_EelChargeWanted({...e,skinnum:state}),false,'invalid/native idle state rejected');same(E.R_EelChargeWanted({...e,model:{...model,name:'progs/fish.mdl'}}),false,'different model rejected');
}));
Deno.test('Classic pass restores native skins without advancing or destroying the enhanced charge',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const e=entity(model),scene=new THREE.Scene(),m=draw(e,h);scene.add(m);const fx=E.R_EelChargeSeen(e,m,scene,50),data=geometryHash(fx),restore=R_SaveClassicScene(scene,50);let disposed=0;fx.geometry.addEventListener('dispose',()=>disposed++);mode.R_AnimSetClassicPass(true);for(const child of [fx])child.visible=false;E.R_EelChargeBegin(scene);same(E.R_EelChargeSeen(e,m,scene,50),null,'Classic does not build enhanced FX');E.R_EelChargeEnd(scene);same(draw(e,h).material.map,h.gl_texturenum[3][0],'Classic actual alias uses original charge state');same(disposed,0,'Classic pass does not destroy retained enhancement');same(geometryHash(fx),data,'Classic does not advance ribbon data');mode.R_AnimSetClassicPass(false);restore();E.R_EelChargeSeen(e,draw(e,h),scene,50);same(geometryHash(fx),data,'same tick restores same enhanced geometry');same(E.R_EelChargeStatus().entries,1,'one retained effect');mode.r_newer_enemies.value=0;same(E.R_EelChargeSeen(e,m,scene,51),null,'custom switch off immediately releases overlay');same(E.R_EelChargeStatus().entries,0,'disabled presentation has no stale record');
}));
Deno.test('Material substitution mesh reuse and invalid geometry fail closed without damaging body bindings',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const e=entity(model),scene=new THREE.Scene(),m=draw(e,h);scene.add(m);const original=m.material,fx=E.R_EelChargeSeen(e,m,scene,1);let disposed=0;fx.geometry.addEventListener('dispose',()=>disposed++);m.material=original.clone();same(E.R_EelChargeSeen(e,m,scene,2),null,'unapproved wrapper material does not silently acquire charge');same(disposed,1,'stale effect released');m.material.dispose();m.material=original;
 const own=m.geometry.clone();own.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(own.attributes.uv.array.length),2));const nativeGeometry=m.geometry;m.geometry=own;same(E.R_EelChargeSeen(e,m,scene,3),null,'unmapped electrode geometry fails closed');same(m.material,original,'body binding survives optional effect failure');check(E.R_EelChargeStatus().errors.length>0,'cosmetic failure remains visible in diagnostics');m.geometry=nativeGeometry;own.dispose();E.R_EelChargeClear();same(E.R_EelChargeStatus().errors.length,0,'explicit clear retires prior diagnostics');const next=new THREE.Mesh(nativeGeometry,original);scene.add(next);check(E.R_EelChargeSeen(e,next,scene,4),'entity can bind a replacement native mesh');same(E.R_EelChargeStatus().entries,1,'mesh reuse retains only one record');
}));
Deno.test('Eel electricity reuses shader and noise without changing the lightning gun singleton',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);if(!vars.Cvar_FindVar('r_hdr'))vars.Cvar_RegisterVariable(new cvar_t('r_hdr','1'));const oldHdr=vars.Cvar_FindVar('r_hdr').value,oldLightning=L.r_newer_lightning.value;vars.Cvar_SetValue('r_hdr',1);L.r_newer_lightning.value=1;const gunScene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(90,1.6,1,4096);camera.up.set(0,0,1);camera.lookAt(1,0,0);camera.updateMatrixWorld();const gunMatrix=new THREE.Matrix4(),setup=()=>L.R_LightningSetup({scene:gunScene,camera:()=>camera,muzzle:()=>({point:[18,-4,-6],matrix:gunMatrix}),beam:()=>({end:[300,10,20]})});const gunHash=()=>{const mesh=gunScene.getObjectByName('quake_lightning'),a=mesh.geometry.attributes.position.data.array;return hash(Buffer.from(a.buffer,a.byteOffset,mesh.geometry.drawRange.count*9*4));};
 try{setup();L.R_LightningClear();L.R_LightningFrame(10);L.R_LightningFrame(10.1);const gun=gunScene.getObjectByName('quake_lightning'),before=gunHash(),time=gun.material.uniforms.uTime.value,e=entity(model,21),m=draw(e,h),scene=new THREE.Scene();scene.add(m);const fx=E.R_EelChargeSeen(e,m,scene,90);fx.onBeforeRender();check(fx.material!==gun.material,'separate material uniforms');same(fx.material.fragmentShader,gun.material.fragmentShader,'same existing filament shader');same(fx.material.uniforms.uNoise.value,gun.material.uniforms.uNoise.value,'same seeded noise texture');same(gun.material.uniforms.uTime.value,time,'Eel clock never replaces gun clock');same(gunHash(),before,'Eel never rewrites gun buffer');E.R_EelChargeClear();L.R_LightningFrame(10.2);const after=gunHash();L.R_LightningClear();for(const t of [10,10.1,10.2])L.R_LightningFrame(t);same(gunHash(),after,'gun temporal output unchanged by interleaved Eel work');}finally{L.R_LightningClear();vars.Cvar_SetValue('r_hdr',oldHdr);L.r_newer_lightning.value=oldLightning;}
}));

// Independent oracle reads owned MDL edges directly, not the effect's cached
// bindings. The first 32 vertices are separate mouth pieces, not the body.
function originalSection(bytes,pose,row){
 const vertexCount=148,triangleCount=260,stStart=84+6*(4+136*194),triStart=stStart+vertexCount*12,frameStart=triStart+triangleCount*16,points=[];
 for(let tri=0;tri<triangleCount;tri++){
  const at=triStart+tri*16,front=bytes.readInt32LE(at),ids=[0,1,2].map(k=>bytes.readInt32LE(at+4+k*4));
  if(ids.some(v=>v<32))continue;
  const uv=ids.map(v=>{const s=stStart+v*12;return[bytes.readInt32LE(s+4)+.5+(!front&&bytes.readInt32LE(s)?68:0),bytes.readInt32LE(s+8)+.5];});
  for(let edge=0;edge<3;edge++){
   const next=(edge+1)%3,a=uv[edge][1],b=uv[next][1],y=row+.5;
   if(a===b||y<Math.min(a,b)||y>Math.max(a,b))continue;
   const t=(y-a)/(b-a),point=[0,1,2].map(axis=>[edge,next].reduce((sum,k,j)=>{const raw=frameStart+pose*(28+vertexCount*4)+28+ids[k]*4;return sum+(j?t:1-t)*(bytes[raw+axis]*bytes.readFloatLE(8+axis*4)+bytes.readFloatLE(20+axis*4));},0));
   points.push(point);
  }
 }
 return points;
}
const separation=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const tuple=p=>new THREE.Vector3(...p);
Deno.test('Full-body sections agree with original body edges in every native pose and enclose the dorsal fin',async()=>{
 const{header:h,bytes}=await native(),before=immutable(h);
 for(let pose=0;pose<21;pose++){
  const sections=E.R_EelChargeSpine(geo(h,pose));check(sections.length>=20,'enough full-body sections');same(sections[0].row,3,'nose section retained');same(sections.at(-1).row,188,'tail-tip section retained');
  for(const section of sections){
   const expected=originalSection(bytes,pose,section.row);check(expected.length>0,'real native section exists');check(section.points.length>=2,'body section has witnesses');
   for(const point of section.points)check(expected.some(p=>separation(p,point)<1e-4),'sample belongs to an original body edge, pose '+pose+' row '+section.row);
   for(const point of expected){check(section.points.some(p=>separation(p,point)<1e-4),'all native body/fin intersections retained, pose '+pose+' row '+section.row+' point '+JSON.stringify(point)+' nearest '+Math.min(...section.points.map(p=>separation(p,point)))+' radius '+section.radius+' pointRadius '+separation(point,section.centre));check(separation(point,section.centre)<=section.radius+1e-4,'envelope includes native fin');}
   check(Number.isFinite(section.radius)&&section.radius>0,'finite positive section radius');
  }
  const length=sections.slice(1).reduce((sum,s,i)=>sum+separation(s.centre,sections[i].centre),0);check(length>35&&length<65,'full native bent-body length, not short electrode span');
  if(pose===0){check(sections[0].centre[0]>19,'nose reaches original head');check(sections.at(-1).centre[0]<-18,'tail reaches original tip');check(Math.max(...sections.map(s=>s.radius))>4,'fin is not mistaken for two-unit side half-width');}
 }
 same(immutable(h),before,'original poses/commands untouched');
});
Deno.test('Spine sampling follows interpolated attributes and excludes detached mouth geometry',async()=>{
 const{header:h}=await native(),g=geo(h,0),next=geo(h,5),a=E.R_EelChargeSpine(g),b=E.R_EelChargeSpine(next),blend=.37;
 g.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(g.attributes.position.array,(v,i)=>v*(1-blend)+next.attributes.position.array[i]*blend),3));
 const mixed=E.R_EelChargeSpine(g);
 for(let j=0;j<mixed.length;j++){same(mixed[j].points.length,a[j].points.length,'stable section binding');for(let p=0;p<mixed[j].points.length;p++)for(let k=0;k<3;k++)near(mixed[j].points[p][k],a[j].points[p][k]*(1-blend)+b[j].points[p][k]*blend,'current interpolated native edge',2e-5);}
 const before=JSON.stringify(mixed),spiral=JSON.stringify(E.R_EelChargeSpiralPaths(g,8,17,5)),positions=g.attributes.position;
 for(let v=0;v<positions.count;v++)if(h.meshVertexOrder[v]<32)positions.setXYZ(v,10000+v,-20000-v,30000+v);
 same(JSON.stringify(E.R_EelChargeSpine(g)),before,'moving only detached mouth pieces cannot distort spine');same(JSON.stringify(E.R_EelChargeSpiralPaths(g,8,17,5)),spiral,'mouth geometry cannot inflate whole-body electrical envelope');
 for(let v=0;v<positions.count;v++)positions.setXYZ(v,positions.getX(v)+7,positions.getY(v)-3,positions.getZ(v)+2);
 const shifted=E.R_EelChargeSpine(g);for(let j=0;j<shifted.length;j++)for(let k=0;k<3;k++)near(shifted[j].centre[k],mixed[j].centre[k]+[7,-3,2][k],'in-place current positions invalidate no pose cache',2e-5);
});
Deno.test('Helices surround the full curved body with bounded sampling and increasing charge clearance',async()=>{
 const{header:h}=await native();
 // Several deterministic clocks and entity seeds expose inward jitter, not just one attractive frame.
 for(const time of [0,4.25,7.25])for(const seed of [19,31])for(let pose=0;pose<21;pose++){
  const g=geo(h,pose),sections=E.R_EelChargeSpine(g),low=E.R_EelChargeSpiralPaths(g,time,seed,2),high=E.R_EelChargeSpiralPaths(g,time,seed,5);
  same(E.R_EelChargeSpiralPaths(g,time,seed,1).length,0,'initial electrode-only state');same(low.length,1,'charge two has one full coil');same(high.length,2,'peak charge has two coils');
  for(const path of [...low,...high]){same(path.length,97,'96 bounded segments');check(path.flat().every(Number.isFinite),'finite complete coil');}
  for(let j=0;j<sections.length;j++){
   const s=sections[j],sample=j/(sections.length-1)*96,lo=Math.min(95,Math.floor(sample)),t=sample-lo;
   const at=path=>path[lo].map((v,k)=>v*(1-t)+path[lo+1][k]*t),dLow=separation(at(low[0]),s.centre),dHigh=separation(at(high[0]),s.centre);
   // The ribbon writer scales primary/secondary half-widths by .34.
   check(dLow>s.radius+.55*.34,'low-stage ribbon clears body/fin envelope, time '+time+' seed '+seed+' pose '+pose+' row '+s.row+' radius '+s.radius+' coilDistance '+dLow);check(dHigh>dLow,'charge widens coil without replacing native centreline');
   check(separation(at(high[1]),s.centre)>s.radius+.32*.34,'secondary coil clears native section');
  }
 }
});
Deno.test('Spiral winding animation is deterministic and continuous across time and pose interpolation',async()=>{
 const{header:h}=await native(),g=geo(h,0),sections=E.R_EelChargeSpine(g),time=4.25,seed=19,path=E.R_EelChargeSpiralPaths(g,time,seed,5)[0];
 same(JSON.stringify(E.R_EelChargeSpiralPaths(g,time,seed,5)[0]),JSON.stringify(path),'same pose/time/seed gives identical path');check(JSON.stringify(E.R_EelChargeSpiralPaths(g,time,seed+1,5)[0])!==JSON.stringify(path),'entity phase remains independent');
 // Measure signed turns geometrically. Quaternion minimal rotations are an
 // independent winding oracle, not the production projection-based frame.
 const curve=new THREE.CatmullRomCurve3(sections.map(s=>tuple(s.centre)),false,'centripetal');let prior,priorTangent,total=0;
 for(let i=0;i<path.length;i++){
  const u=i/(path.length-1),tangent=curve.getTangent(u),offset=tuple(path[i]).sub(curve.getPoint(u)).normalize();
  if(prior){const transported=prior.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(priorTangent,tangent)),step=Math.atan2(tangent.dot(new THREE.Vector3().crossVectors(transported,offset)),transported.dot(offset));check(Math.abs(step)<Math.PI*.5,'jagged winding has no radial flip');total+=step;}
  prior=offset;priorTangent=tangent;
 }
 near(total/(2*Math.PI),2.75,'approximately two and three-quarter full-body turns',.05);
 const later=E.R_EelChargeSpiralPaths(g,time+.0001,seed,5)[0];check(later.some((p,i)=>separation(p,path[i])>1e-5),'clock animates coil');check(Math.max(...later.map((p,i)=>separation(p,path[i])))<.01,'small time increment cannot flip radial frame');
 const next=geo(h,1),original=Float32Array.from(g.attributes.position.array),blend=t=>g.setAttribute('position',new THREE.BufferAttribute(Float32Array.from(original,(v,i)=>v*(1-t)+next.attributes.position.array[i]*t),3));blend(.5);const middle=E.R_EelChargeSpiralPaths(g,time,seed,5)[0];blend(.5001);const adjacent=E.R_EelChargeSpiralPaths(g,time,seed,5)[0];check(Math.max(...adjacent.map((p,i)=>separation(p,middle[i])))<.01,'small pose interpolation change has no frame pop');
});
Deno.test('Actual alias draws keep full-body spirals within 1872 vertices through every pose and charge state',async()=>fixture(async({model,header:h},requests)=>{
 await ready(model,requests);const e=entity(model,31),scene=new THREE.Scene(),before=immutable(h);
 for(let pose=0;pose<21;pose++)for(let stage=1;stage<=5;stage++){
  e.frame=pose;e.skinnum=stage;const m=draw(e,h);scene.add(m);const fx=E.R_EelChargeSeen(e,m,scene,11.25);check(fx,'actual posed public draw binds electrical effect');same(fx.geometry.drawRange.count,stage===1?720:stage<4?1296:1872,'coronas plus bounded full-body coils');check(fx.geometry.drawRange.count<=E.EEL_CHARGE.maxVertices,'fixed allocation respected');check(Array.from(array(fx)).every(Number.isFinite),'actual vertex attributes finite');
 }
 same(immutable(h),before,'all native pose data remain unchanged');same(E.R_EelChargeStatus().errors.length,0,'no hidden geometry fallback');
}));
