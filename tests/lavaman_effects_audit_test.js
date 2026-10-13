// Independent lifecycle, attachment and bounded-performance audit of Lava Man.
// Fixture setup follows the existing public model/image transport conventions.
// Owned models are read-only. Image transport is controlled; GPU appearance and
// compositor behavior belong to the separate actual-browser trial.
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import {GL_DrawAliasFrame,R_DrawAliasModel} from '../src/engine/render/gl_mesh.js';
import {entity_t} from '../src/engine/render/render.js';
import * as mode from '../src/newer/mode.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import * as fire from '../src/newer/render/r_fireball.js';
import {ShadowPoseCapture,ShadowPoseEqual} from '../src/newer/render/shadow_pose.js';
import {R_SaveClassicScene} from '../src/newer/render/r_classicstate.js';
import * as lava from '../src/newer/render/r_lavaman.js';

const NAME='progs/lavaman.mdl',SHA='b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1';
const BOSS_SHA='4b802488480de2e36130e06ee03a31b2e96046a3ffe12f66e62d9bf4bd2f2eea';
const originalIndex=JSON.parse(readFileSync(new URL('../newer/enemies/index.json',import.meta.url)));
const check=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
const near=(a,b,m,epsilon=1e-5)=>check(Math.abs(a-b)<=epsilon,`${m}: ${a} != ${b}`);
const hash=a=>createHash('sha256').update(ArrayBuffer.isView(a)?Buffer.from(a.buffer,a.byteOffset,a.byteLength):a).digest('hex');
const vec=(a,i)=>[a.getX(i),a.getY(i),a.getZ(i)];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const unit=a=>{const n=Math.hypot(...a);return a.map(x=>x/n);};
const geometryDigest=h=>JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,scale:Array.from(h.scale),origin:Array.from(h.scale_origin)});
let nativePromise,serial=0;
async function native(){return nativePromise||=(async()=>{
 const rogue=await pakDirectory(process.env.QUAKED_OWNED_PAK||'/Users/bri/quaked/Dissolution of Eternity/pak0.pak');
 const id1=await pakDirectory(process.env.QUAKED_ID1_PAK||'/Users/bri/quaked/Quake/pak0.pak');
 COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(id1.get('gfx/palette.lmp'))));
 VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();
 const load=async(name,directory,expected)=>{const bytes=await readMember(directory.get(name));same(hash(bytes),expected,'owned model bytes '+name);COM_AddPack(isolatedPack(name,bytes));const model=new model_t();model.name=name;model.needload=true;Mod_LoadModel(model,true);await model.aliasSourceIdentity.promise;same(model.aliasSourceIdentity.sha256,expected,'public native identity '+name);return {model,bytes,header:model.cache.data};};
 return {...await load(NAME,rogue,SHA),boss:await load('progs/boss.mdl',id1,BOSS_SHA)};
})();}
async function fixture(run){
 const nativeData=await native();
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),enemies:mode.r_newer_enemies.value,normals:mode.r_newer_normals.value,lerp:anim.r_lerpmodels.value,fire:fire.R_FireballAssets()};
 const requests=[],owned=[];lava.R_LavaManClear();skins.R_NewerSkinsShutdown();
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;anim.r_lerpmodels.value=0;
 fire.R_FireballTextures(null,null);skins.R_NewerSetIndex({...originalIndex,version:'lava-effects-public-'+ ++serial});
 const ctx={...nativeData,requests,ready:async()=>{await skins.R_NewerSkinsPrepare([ctx.model]);const maps=requests.filter(r=>r.url.startsWith('newer/enemies/lavaman/custom/'));same(maps.length,2,'actual custom diffuse/height pair requested');maps.forEach(r=>r.done(r.texture));check(skins.R_NewerSkinsStatus([ctx.model]).settled,'custom material preparation settles');},fireReady:()=>{const atlas=new THREE.DataTexture(new Uint8Array(64).fill(255),4,4),noise=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);owned.push(atlas,noise);fire.R_FireballTextures(atlas,noise);}};
 try{await run(ctx);}finally{
  lava.R_LavaManClear();skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex(originalIndex);fire.R_FireballTextures(old.fire?.atlas??null,old.fire?.noise??null);owned.forEach(t=>t.dispose());THREE.TextureLoader.prototype.load=old.loader;
  for(const key of ['document','window']){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}
  mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_enemies.value=old.enemies;mode.r_newer_normals.value=old.normals;anim.r_lerpmodels.value=old.lerp;
 }
}
function entity(model,id=31){const e=new entity_t();e.model=model;e._entityIndex=id;e.skinnum=0;return e;}
function draw(e,h,frame=17){e.frame=frame;const mesh=R_DrawAliasModel(e,h,new Float32Array(256).fill(1),.5),template=GL_DrawAliasFrame(h,frame);check(mesh,'public native alias mesh');return {mesh,p:template.posAttr,n:template.normalAttr};}
function apply(e,d,time){lava.R_LavaManApply(e,d.mesh,d.p,d.n,time);return {p:d.mesh.geometry.getAttribute('position'),n:d.mesh.geometry.getAttribute('normal')};}
function geometryHash(d){return hash(d.mesh.geometry.getAttribute('position').array)+hash(d.mesh.geometry.getAttribute('normal').array);}
function canonical(d,label){same(d.mesh.geometry.getAttribute('position'),d.p,label+' position identity');same(d.mesh.geometry.getAttribute('normal'),d.n,label+' normal identity');}


Deno.test('Releasing Lava Man must preserve attributes installed by a later visual owner',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model,403),d=draw(e,ctx.header,17);apply(e,d,3);
 const foreignPosition=d.p.clone(),foreignNormal=d.n.clone();foreignPosition.setX(0,foreignPosition.getX(0)+2);
 d.mesh.geometry.setAttribute('position',foreignPosition);d.mesh.geometry.setAttribute('normal',foreignNormal);
 lava.R_LavaManRelease(e);
 same(d.mesh.geometry.getAttribute('position'),foreignPosition,'release cannot overwrite another owner position');
 same(d.mesh.geometry.getAttribute('normal'),foreignNormal,'release cannot overwrite another owner normal');
 same(lava.R_LavaManStatus().entities,0,'Lava entry still retires');
}));

Deno.test('All eight Lava emitters attach to independently resolved deformed native triangles',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const e=entity(ctx.model,405),scene=new THREE.Scene(),uvStart=88+300*194,triStart=uvStart+325*12;
 const anchors=[[52,8],[202,8],[32,68],[116,68],[182,68],[266,68],[65,82],[215,82]].map(([s,t])=>{
  for(let triangle=0;triangle<555;triangle++){
   const offset=triStart+triangle*16,front=ctx.bytes.readInt32LE(offset),ids=[0,1,2].map(k=>ctx.bytes.readInt32LE(offset+4+k*4)),q=ids.map(v=>{const p=uvStart+v*12;return[ctx.bytes.readInt32LE(p+4)+(!front&&ctx.bytes.readInt32LE(p)?150:0),ctx.bytes.readInt32LE(p+8)];});
   const[a,b,c]=q,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
   const x=((b[1]-c[1])*(s-c[0])+(c[0]-b[0])*(t-c[1]))/den,y=((c[1]-a[1])*(s-c[0])+(a[0]-c[0])*(t-c[1]))/den,w=[x,y,1-x-y];if(w.every(v=>v>=-1e-8))return{ids,w};
  }throw Error('Independent native anchor is unmapped');
 });
 for(const frame of [16,17,57])for(const time of [1.125,2.031,7.75]){
  const d=draw(e,ctx.header,frame);scene.add(d.mesh);apply(e,d,time);lava.R_LavaManSeen(e,d.mesh,scene,time);const fireMesh=d.mesh.getObjectByName('lavaman_fire'),smokeMesh=d.mesh.getObjectByName('lavaman_smoke');check(fireMesh&&smokeMesh,'actual shader layers present');same(fireMesh.geometry.instanceCount,8,'all eight measured roots');same(smokeMesh.geometry.instanceCount,24,'bounded source smoke rows');
  const p=d.mesh.geometry.attributes.position,n=d.mesh.geometry.attributes.normal,out=fireMesh.geometry.getAttribute('aPosSize');
  for(let at=0;at<8;at++){
   const anchor=anchors[at],expected=[0,0,0],normal=[0,0,0];for(let j=0;j<3;j++){const expanded=ctx.header.meshVertexOrder.indexOf(anchor.ids[j]);check(expanded>=0,'native vertex represented in actual draw');for(let k=0;k<3;k++){expected[k]+=vec(p,expanded)[k]*anchor.w[j];normal[k]+=vec(n,expanded)[k]*anchor.w[j];}}
   const length=Math.hypot(...normal),scale=at<2?8:10;for(let k=0;k<3;k++)expected[k]+=normal[k]/length*1.2;expected[2]+=1.385*scale;
   for(let k=0;k<3;k++)near(out.array[at*4+k],expected[k],'emitter root is weighted deformed triangle plus measured outward/card offset',3e-4);
  }
 }
}));

Deno.test('Lava shader assets may disappear and recover without disposing borrowed textures or native geometry',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const assets=fire.R_FireballAssets(),e=entity(ctx.model,406),scene=new THREE.Scene(),d=draw(e,ctx.header);scene.add(d.mesh);apply(e,d,2);lava.R_LavaManSeen(e,d.mesh,scene,2);
 let borrowedDisposals=0,ownedDisposals=0;for(const texture of [assets.atlas,assets.noise,d.mesh.material.map])texture.addEventListener('dispose',()=>borrowedDisposals++);
 for(const name of ['lavaman_fire','lavaman_smoke']){const fx=d.mesh.getObjectByName(name);fx.geometry.addEventListener('dispose',()=>ownedDisposals++);fx.material.addEventListener('dispose',()=>ownedDisposals++);}
 fire.R_FireballTextures(null,null);lava.R_LavaManSeen(e,d.mesh,scene,2.5);same(d.mesh.getObjectByName('lavaman_fire'),undefined,'unavailable shared assets leave no flame object');same(d.mesh.getObjectByName('lavaman_smoke'),undefined,'unavailable shared assets leave no smoke object');same(ownedDisposals,4,'both retired shader layers dispose only their own geometry/material');same(borrowedDisposals,0,'shared images stay borrowed');check(d.mesh.geometry.attributes.position!==d.p,'body remains usable and deforming without optional shader assets');
 fire.R_FireballTextures(assets.atlas,assets.noise);apply(e,d,3);lava.R_LavaManSeen(e,d.mesh,scene,3);check(d.mesh.getObjectByName('lavaman_fire'),'ready assets rebuild visible effect');lava.R_LavaManRelease(e);same(borrowedDisposals,0,'release never disposes shared atlas/noise/body image');
}));

Deno.test('Main Lava actors reclaim ghost capacity but ghosts cannot displace eight main actors',async()=>fixture(async ctx=>{
 await ctx.ready();const ghosts=[];
 for(let i=0;i<8;i++){const e=entity(ctx.model,500+i);e._levelViewGhost=true;e._levelViewActive=true;const d=draw(e,ctx.header);apply(e,d,2);ghosts.push({e,d});}
 const main=entity(ctx.model,600),d=draw(main,ctx.header);apply(main,d,2);check(d.mesh.geometry.attributes.position!==d.p,'visible main actor is admitted over cached ghost');same(lava.R_LavaManStatus().entities,8,'reclamation retains cap');same(ghosts.filter(g=>g.d.mesh.geometry.attributes.position===g.d.p).length,1,'exactly one ghost restored');
 lava.R_LavaManClear();const mains=[];for(let i=0;i<8;i++){const e=entity(ctx.model,700+i),d=draw(e,ctx.header);apply(e,d,3);mains.push({e,d});}
 const extra=entity(ctx.model,800);extra._levelViewGhost=true;extra._levelViewActive=true;const dropped=draw(extra,ctx.header);apply(extra,dropped,3);canonical(dropped,'ghost over full main pool');same(lava.R_LavaManStatus().entities,8,'main pool stays bounded');check(mains.every(m=>m.d.mesh.geometry.attributes.position!==m.d.p),'ghost never evicts a main actor');
 lava.R_LavaManClear();extra._levelViewActive=false;const inactive=draw(extra,ctx.header);apply(extra,inactive,3);canonical(inactive,'inactive cached ghost cannot allocate');same(lava.R_LavaManStatus().entities,0,'no hidden ghost allocation');
}));

Deno.test('Eight-actor Lava CPU cost and owned arrays stay bounded and reused over native poses',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const scene=new THREE.Scene(),actors=Array.from({length:8},(_,i)=>entity(ctx.model,900+i)),shades=new Float32Array(256).fill(1);
 const tick=(frame,time)=>{lava.R_LavaManBegin(scene);for(let i=0;i<actors.length;i++){const e=actors[i];e.frame=(frame+i*7)%90;const m=R_DrawAliasModel(e,ctx.header,shades,.5,time);if(m.parent!==scene)scene.add(m);lava.R_LavaManSeen(e,m,scene,time);}lava.R_LavaManEnd(scene);};
 for(let frame=0;frame<120;frame++)tick(frame,frame/60);
 const refs=actors.map(e=>{const m=e._aliasMesh;return[m.geometry.attributes.position,m.geometry.attributes.normal,m.getObjectByName('lavaman_fire'),m.getObjectByName('lavaman_smoke')];});
 const buffers=new Set();for(const[p,n,f,s]of refs){buffers.add(p.array);buffers.add(n.array);for(const fx of [f,s])for(const a of Object.values(fx.geometry.attributes))if(a.isInstancedBufferAttribute)buffers.add(a.array);}
 const ownedBytes=[...buffers].reduce((sum,a)=>sum+a.byteLength,0),samples=[],count=240;globalThis.gc?.();const memoryBefore=process.memoryUsage(),cpuBefore=process.cpuUsage(),started=performance.now();
 for(let frame=0;frame<count;frame++){const start=performance.now();tick(frame+120,(frame+120)/60);samples.push(performance.now()-start);}
 const wallMs=performance.now()-started,cpu=process.cpuUsage(cpuBefore);globalThis.gc?.();const memoryAfter=process.memoryUsage();
 for(let i=0;i<actors.length;i++){const m=actors[i]._aliasMesh,[p,n,f,s]=refs[i];same(m.geometry.attributes.position,p,'position buffer reused across all native poses');same(m.geometry.attributes.normal,n,'normal buffer reused across all native poses');same(m.getObjectByName('lavaman_fire'),f,'flame geometry/material reused');same(m.getObjectByName('lavaman_smoke'),s,'smoke geometry/material reused');same(f.geometry.instanceCount,8,'eight flame cards');same(s.geometry.instanceCount,24,'twenty-four puffs');}
 same(lava.R_LavaManStatus().entities,8,'bounded actor allocation');same(buffers.size,56,'two surface arrays and five instanced arrays per actor');check(ownedBytes<=8*(lava.LAVA_MAN.maxVertices*3*4*2+8*4*4*2+24*4*4*3),'owned arrays fit declared maximum, not frame count');
 const ordered=[...samples].sort((a,b)=>a-b),stats={environment:'Node CPU public draw+Seen; no WebGL timing or pixel qualification',node:process.version,actors:8,expandedVertices:refs[0][0].count,warmFrames:120,measuredFrames:count,wallMs,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,meanMs:wallMs/count,medianMs:ordered[Math.floor(count*.5)],p95Ms:ordered[Math.floor(count*.95)],maxMs:ordered.at(-1),ownedTypedArrayBytes:ownedBytes,ownedArrays:buffers.size,retainedHeapDelta:memoryAfter.heapUsed-memoryBefore.heapUsed,arrayBufferDelta:memoryAfter.arrayBuffers-memoryBefore.arrayBuffers,gcAvailable:!!globalThis.gc};
 console.log('LAVA_CPU_AUDIT '+JSON.stringify(stats));
 lava.R_LavaManClear();same(lava.R_LavaManStatus().entities,0,'all eight actors retire');for(const e of actors)check(!e._aliasMesh.getObjectByName('lavaman_fire')&&!e._aliasMesh.getObjectByName('lavaman_smoke'),'no retired layer remains parented');
}));

Deno.test('Actual floor-shadow projection consumes the same visual positions and Classic restores canonical input',async()=>fixture(async ctx=>{
 await ctx.ready();const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js'),{GL_DrawAliasLightShadow}=await import('../src/engine/render/gl_mesh.js'),{cl}=await import('../src/engine/client/client.js');
 const oldDocument=globalThis.document,oldTime=cl.time;Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas.createCanvas(64,64)}});
 try{
  const e=entity(ctx.model,410);e.origin=[7,11,90];e.angles=[0,32,0];
  for(const classic of [false,true]){
   mode.R_AnimSetClassicPass(classic);cl.time=classic?12:10;const d=draw(e,ctx.header,17);apply(e,d,cl.time);d.mesh.updateMatrixWorld(true);
   const projected=GL_DrawAliasLightShadow(e,ctx.header,17,0,[{pos:[200,200,300],opacity:.5}]);check(projected,'actual floor projector creates its mesh');const source=classic?d.p:d.mesh.geometry.attributes.position,point=new THREE.Vector3();
   for(let i=0;i<source.count;i++){point.fromBufferAttribute(source,i).applyMatrix4(d.mesh.matrixWorld);for(let k=0;k<3;k++)near(e._shadowWorld[i*3+k],point.getComponent(k),'floor-shadow source agrees with current rendered/canonical surface',3e-4);}
  }
 }finally{mode.R_AnimSetClassicPass(false);Object.defineProperty(globalThis,'document',{configurable:true,value:oldDocument});cl.time=oldTime;}
}));

Deno.test('Actual level-view API admits only nearby enabled Lava ghosts and retires inactive cached views',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const preview=await import('../src/newer/render/r_levelview.js'),{Mod_FindName,Mod_ForName}=await import('../src/engine/render/gl_model.js');
 const model=Mod_ForName(NAME,true);await model.aliasSourceIdentity.promise;await skins.R_NewerSkinsPrepare([model]);
 // Minimal already-loaded brush-model input: one visible empty leaf and no
 // world surfaces. The actor itself is the actual owned model, not a stub.
 const map='lava_audit_empty',world=Mod_FindName('maps/'+map+'.bsp'),leaf={contents:-1,compressed_vis:null,compressed_vis_offset:0,firstmarksurface:[],nummarksurfaces:0};
 Object.assign(world,{needload:false,type:0,surfaces:[],leafs:[{contents:-2},leaf],nodes:[leaf],numleafs:1,textures:[],submodels:[],entities:'{"classname" "worldspawn"}',lightdata:null});
 const scene=new THREE.Scene(),oldPortal=mode.r_newer_portals.value;
 const crossing={map,transform:{center:[0,0,0],dest:[0,0,0],yaw:0,through:[1,0,0],position:p=>p.slice(),direction:p=>p.slice()},opening:{axisA:[0,1,0],axisB:[0,0,1],a0:-16,a1:16,b0:0,b1:64}};
 try{
  mode.r_newer_portals.value=1;preview.R_LevelViewUseSnapshots(()=>[{classname:'monster_lavaman',model:NAME,origin:'0 0 0',angles:'0 0 0',frame:'17',skin:'0'}]);preview.R_SetupLevelViews(scene,[crossing]);
  const deadline=performance.now()+1500;while(preview.R_LevelViewCount()===0&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  same(preview.R_LevelViewCount(),1,'public setup built one registered view');same(preview.R_LevelViewGhosts()[0].length,1,'actual owned Lava ghost exists');same(lava.R_LavaManStatus().entities,0,'construction alone cannot consume live effect budget');
  preview.R_UpdateLevelViewEntities([0,0,32],2);same(lava.R_LavaManStatus().entities,1,'near enabled portal animates actual Lava ghost');
  preview.R_UpdateLevelViewEntities([5000,0,32],3);same(lava.R_LavaManStatus().entities,0,'distant cached view releases global effect capacity');
  preview.R_UpdateLevelViewEntities([0,0,32],4);same(lava.R_LavaManStatus().entities,1,'returning near admits ghost again');mode.r_newer_portals.value=0;
  preview.R_UpdateLevelViewEntities([0,0,32],5);same(lava.R_LavaManStatus().entities,0,'disabled portals release their effect capacity');
 }finally{preview.R_ClearLevelViews();preview.R_LevelViewUseSnapshots(null);mode.r_newer_portals.value=oldPortal;world.needload=true;}
}));
