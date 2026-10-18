import {ResourcePath} from '../src/platform/resource_paths.js';
// Independent texture-only material, native attachment and bounded-performance audit.
// Earlier CPU mesh deformation is deliberately excluded by the revised owner contract.
// Fixture setup follows the existing public model/image transport conventions.
// Owned models are read-only. Image transport is controlled; GPU appearance and
// compositor behavior belong to the separate actual-browser trial.
import * as THREE from 'three';
import {readFileSync} from './helpers/resource_fs.mjs';
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
import * as lava from '../src/newer/render/r_lavaman.js';

const NAME='progs/lavaman.mdl',SHA='b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1';
const BOSS_SHA='4b802488480de2e36130e06ee03a31b2e96046a3ffe12f66e62d9bf4bd2f2eea';
const originalIndex=JSON.parse(readFileSync(new URL('../newer/enemies/index.json',import.meta.url)));
const check=(v,m)=>{if(!v)throw Error(m);};
const same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
const near=(a,b,m,epsilon=1e-5)=>check(Math.abs(a-b)<=epsilon,`${m}: ${a} != ${b}`);
const hash=a=>createHash('sha256').update(ArrayBuffer.isView(a)?Buffer.from(a.buffer,a.byteOffset,a.byteLength):a).digest('hex');
const vec=(a,i)=>[a.getX(i),a.getY(i),a.getZ(i)];
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
 const ctx={...nativeData,requests,ready:async()=>{await skins.R_NewerSkinsPrepare([ctx.model]);const maps=requests.filter(r=>r.url.startsWith(ResourcePath('newer/enemies/lavaman/custom/')));same(maps.length,2,'actual custom diffuse/height pair requested');maps.forEach(r=>r.done(r.texture));check(skins.R_NewerSkinsStatus([ctx.model]).settled,'custom material preparation settles');},fireReady:()=>{const atlas=new THREE.DataTexture(new Uint8Array(64).fill(255),4,4),noise=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);owned.push(atlas,noise);fire.R_FireballTextures(atlas,noise);}};
 try{await run(ctx);}finally{
  lava.R_LavaManClear();skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex(originalIndex);fire.R_FireballTextures(old.fire?.atlas??null,old.fire?.noise??null);owned.forEach(t=>t.dispose());THREE.TextureLoader.prototype.load=old.loader;
  for(const key of ['document','window']){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}
  mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_enemies.value=old.enemies;mode.r_newer_normals.value=old.normals;anim.r_lerpmodels.value=old.lerp;
 }
}
function entity(model,id=31){const e=new entity_t();e.model=model;e._entityIndex=id;e.skinnum=0;return e;}
function draw(e,h,frame=17){e.frame=frame;const mesh=R_DrawAliasModel(e,h,new Float32Array(256).fill(1),.5),template=GL_DrawAliasFrame(h,frame);check(mesh,'public native alias mesh');return {mesh,p:template.posAttr,n:template.normalAttr};}
function apply(e,d,time){lava.R_LavaManApply(e,d.mesh,d.p,d.n,time);return {p:d.mesh.geometry.getAttribute('position'),n:d.mesh.geometry.getAttribute('normal')};}
function canonical(d,label){same(d.mesh.geometry.getAttribute('position'),d.p,label+' position identity');same(d.mesh.geometry.getAttribute('normal'),d.n,label+' normal identity');}


function baseFor(e){const material=skins.R_NewerAliasMaterial(e,NAME,true,0);check(material,'actual ready canonical custom material');return material;}
function compiled(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};material.onBeforeCompile(shader);return shader;}
function warpUniforms(material){const uniforms=compiled(material).uniforms;check(uniforms.uLavaTime&&uniforms.uLavaPhase,'actual compiler has texture-animation uniform inputs');check(Number.isFinite(uniforms.uLavaTime.value)&&Number.isFinite(uniforms.uLavaPhase.value),'finite time and phase');return uniforms;}

Deno.test('Releasing Lava Man must preserve attributes installed by a later visual owner',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model,403),d=draw(e,ctx.header,17);apply(e,d,3);
 const owned=d.mesh.material,foreignMaterial=baseFor(e).clone();check(owned!==baseFor(e),'positive owned texture material');let retired=0;owned.addEventListener('dispose',()=>retired++);d.mesh.material=foreignMaterial;
 const foreignPosition=d.p.clone(),foreignNormal=d.n.clone();foreignPosition.setX(0,foreignPosition.getX(0)+2);
 d.mesh.geometry.setAttribute('position',foreignPosition);d.mesh.geometry.setAttribute('normal',foreignNormal);
 lava.R_LavaManRelease(e);
 same(d.mesh.geometry.getAttribute('position'),foreignPosition,'release cannot overwrite another owner position');
 same(d.mesh.geometry.getAttribute('normal'),foreignNormal,'release cannot overwrite another owner normal');
 same(d.mesh.material,foreignMaterial,'release cannot overwrite another material owner');same(retired,1,'only owned texture material retired');foreignMaterial.dispose();same(lava.R_LavaManStatus().entities,0,'Lava entry still retires');
}));

Deno.test('All eight Lava emitters attach to independently resolved canonical native triangles',async()=>fixture(async ctx=>{
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
  canonical(d,'texture animation keeps exact native geometry for emitters');const p=d.p,n=d.n,out=fireMesh.geometry.getAttribute('aPosSize');
  for(let at=0;at<8;at++){
   const anchor=anchors[at],expected=[0,0,0],normal=[0,0,0];for(let j=0;j<3;j++){const expanded=ctx.header.meshVertexOrder.indexOf(anchor.ids[j]);check(expanded>=0,'native vertex represented in actual draw');for(let k=0;k<3;k++){expected[k]+=vec(p,expanded)[k]*anchor.w[j];normal[k]+=vec(n,expanded)[k]*anchor.w[j];}}
   const length=Math.hypot(...normal),scale=at<2?8:10;for(let k=0;k<3;k++)expected[k]+=normal[k]/length*1.2;expected[2]+=1.385*scale;
   for(let k=0;k<3;k++)near(out.array[at*4+k],expected[k],'emitter root is weighted native triangle plus measured outward/card offset',3e-4);
  }
 }
}));

Deno.test('Lava shader assets may disappear and recover without disposing borrowed textures or native geometry',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const assets=fire.R_FireballAssets(),e=entity(ctx.model,406),scene=new THREE.Scene(),d=draw(e,ctx.header);scene.add(d.mesh);apply(e,d,2);lava.R_LavaManSeen(e,d.mesh,scene,2);
 let borrowedDisposals=0,ownedDisposals=0;for(const texture of [assets.atlas,assets.noise,d.mesh.material.map])texture.addEventListener('dispose',()=>borrowedDisposals++);
 for(const name of ['lavaman_fire','lavaman_smoke']){const fx=d.mesh.getObjectByName(name);fx.geometry.addEventListener('dispose',()=>ownedDisposals++);fx.material.addEventListener('dispose',()=>ownedDisposals++);}
 fire.R_FireballTextures(null,null);lava.R_LavaManSeen(e,d.mesh,scene,2.5);same(d.mesh.getObjectByName('lavaman_fire'),undefined,'unavailable shared assets leave no flame object');same(d.mesh.getObjectByName('lavaman_smoke'),undefined,'unavailable shared assets leave no smoke object');same(ownedDisposals,4,'both retired shader layers dispose only their own geometry/material');same(borrowedDisposals,0,'shared images stay borrowed');canonical(d,'body remains native without optional shader assets');check(d.mesh.material!==baseFor(e),'texture animation remains available without fire assets');warpUniforms(d.mesh.material);
 fire.R_FireballTextures(assets.atlas,assets.noise);apply(e,d,3);lava.R_LavaManSeen(e,d.mesh,scene,3);check(d.mesh.getObjectByName('lavaman_fire'),'ready assets rebuild visible effect');lava.R_LavaManRelease(e);same(borrowedDisposals,0,'release never disposes shared atlas/noise/body image');
}));

Deno.test('Main Lava actors reclaim ghost capacity but ghosts cannot displace eight main actors',async()=>fixture(async ctx=>{
 await ctx.ready();const ghosts=[];
 for(let i=0;i<8;i++){const e=entity(ctx.model,500+i);e._levelViewGhost=true;e._levelViewActive=true;const d=draw(e,ctx.header);apply(e,d,2);ghosts.push({e,d});}
 const main=entity(ctx.model,600),d=draw(main,ctx.header);apply(main,d,2);canonical(d,'main mesh stays native');check(d.mesh.material!==baseFor(main),'visible main actor receives owned texture material over cached ghost');same(lava.R_LavaManStatus().entities,8,'reclamation retains cap');same(ghosts.filter(g=>g.d.mesh.material===baseFor(g.e)).length,1,'exactly one ghost restored');
 lava.R_LavaManClear();const mains=[];for(let i=0;i<8;i++){const e=entity(ctx.model,700+i),d=draw(e,ctx.header);apply(e,d,3);mains.push({e,d});}
 const extra=entity(ctx.model,800);extra._levelViewGhost=true;extra._levelViewActive=true;const dropped=draw(extra,ctx.header);apply(extra,dropped,3);canonical(dropped,'ghost over full main pool');same(lava.R_LavaManStatus().entities,8,'main pool stays bounded');check(mains.every(m=>m.d.mesh.material!==baseFor(m.e)),'ghost never evicts a main actor material');same(dropped.mesh.material,baseFor(extra),'overflow ghost keeps base material');
 lava.R_LavaManClear();extra._levelViewActive=false;const inactive=draw(extra,ctx.header);apply(extra,inactive,3);canonical(inactive,'inactive cached ghost cannot change mesh');same(inactive.mesh.material,baseFor(extra),'inactive ghost keeps base material');same(lava.R_LavaManStatus().entities,0,'no hidden ghost allocation');
}));

Deno.test('Eight-actor texture animation reuses owned materials uniforms and bounded effect arrays over native poses',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const scene=new THREE.Scene(),actors=Array.from({length:8},(_,i)=>entity(ctx.model,900+i)),shades=new Float32Array(256).fill(1);
 const tick=(frame,time)=>{lava.R_LavaManBegin(scene);for(let i=0;i<actors.length;i++){const e=actors[i];e.frame=(frame+i*7)%90;const m=R_DrawAliasModel(e,ctx.header,shades,.5,time);if(m.parent!==scene)scene.add(m);lava.R_LavaManSeen(e,m,scene,time);const native=GL_DrawAliasFrame(ctx.header,e.frame);same(m.geometry.attributes.position,native.posAttr,'native position attribute follows real animation');same(m.geometry.attributes.normal,native.normalAttr,'native normal attribute follows real animation');same(lava.R_LavaManPositions(e),null,'texture phase has no floor-shadow override');}lava.R_LavaManEnd(scene);};
 for(let frame=0;frame<120;frame++)tick(frame,frame/60);
 const refs=actors.map(e=>{const m=e._aliasMesh,material=m.material,uniforms=warpUniforms(material),fire=m.getObjectByName('lavaman_fire'),smoke=m.getObjectByName('lavaman_smoke'),buffers=[];for(const fx of [fire,smoke])for(const[name,a]of Object.entries(fx.geometry.attributes))if(a.isInstancedBufferAttribute)buffers.push({fx,name,array:a.array});return {material,uniforms,fire,smoke,buffers};});
 const buffers=new Set(refs.flatMap(r=>r.buffers.map(b=>b.array))),ownedBytes=[...buffers].reduce((sum,a)=>sum+a.byteLength,0),samples=[],count=240;globalThis.gc?.();const memoryBefore=process.memoryUsage(),cpuBefore=process.cpuUsage(),started=performance.now();
 for(let frame=0;frame<count;frame++){const start=performance.now();tick(frame+120,(frame+120)/60);samples.push(performance.now()-start);}
 const wallMs=performance.now()-started,cpu=process.cpuUsage(cpuBefore);globalThis.gc?.();const memoryAfter=process.memoryUsage();
 for(let i=0;i<actors.length;i++){const m=actors[i]._aliasMesh,r=refs[i],u=warpUniforms(m.material);same(m.material,r.material,'owned material reused across native poses');same(u.uLavaTime,r.uniforms.uLavaTime,'time uniform object reused');same(u.uLavaPhase,r.uniforms.uLavaPhase,'phase uniform object reused');same(m.getObjectByName('lavaman_fire'),r.fire,'flame mesh reused');same(m.getObjectByName('lavaman_smoke'),r.smoke,'smoke mesh reused');for(const b of r.buffers)same(b.fx.geometry.attributes[b.name].array,b.array,'each instanced array retains identity');same(r.fire.geometry.instanceCount,8,'eight flame cards');same(r.smoke.geometry.instanceCount,24,'twenty-four puffs');}
 same(lava.R_LavaManStatus().entities,8,'bounded actor allocation');same(buffers.size,40,'five effect arrays per actor, no private deformed position/normal arrays');same(ownedBytes,8*(8*4*4*2+24*4*4*3),'typed effect storage fixed by emitter budgets');
 const ordered=[...samples].sort((a,b)=>a-b),stats={environment:'Node CPU public native draw+Seen+invariant checks; no WebGL timing or pixel qualification',node:process.version,actors:8,expandedVertices:actors[0]._aliasMesh.geometry.attributes.position.count,warmFrames:120,measuredFrames:count,wallMs,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,meanMs:wallMs/count,medianMs:ordered[Math.floor(count*.5)],p95Ms:ordered[Math.floor(count*.95)],maxMs:ordered.at(-1),ownedEffectTypedArrayBytes:ownedBytes,ownedEffectArrays:buffers.size,ownedMaterials:refs.length,retainedHeapDelta:memoryAfter.heapUsed-memoryBefore.heapUsed,arrayBufferDelta:memoryAfter.arrayBuffers-memoryBefore.arrayBuffers,gcAvailable:!!globalThis.gc};console.log('LAVA_TEXTURE_CPU_AUDIT '+JSON.stringify(stats));
 lava.R_LavaManClear();same(lava.R_LavaManStatus().entities,0,'all eight actors retire');for(const e of actors){check(!e._aliasMesh.getObjectByName('lavaman_fire')&&!e._aliasMesh.getObjectByName('lavaman_smoke'),'no retired layers remain parented');same(e._aliasMesh.material,baseFor(e),'retirement restores canonical borrowed material');}
}));

Deno.test('Actual floor-shadow projection remains canonical in Newer and Classic while texture phase changes',async()=>fixture(async ctx=>{
 await ctx.ready();const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js'),{GL_DrawAliasLightShadow}=await import('../src/engine/render/gl_mesh.js'),{cl}=await import('../src/engine/client/client.js');
 const oldDocument=globalThis.document,oldTime=cl.time;Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas.createCanvas(64,64)}});
 try{
  const e=entity(ctx.model,410);e.origin=[7,11,90];e.angles=[0,32,0];
  for(const classic of [false,true]){
   mode.R_AnimSetClassicPass(classic);cl.time=classic?12:10;const d=draw(e,ctx.header,17);apply(e,d,cl.time);d.mesh.updateMatrixWorld(true);
   const projected=GL_DrawAliasLightShadow(e,ctx.header,17,0,[{pos:[200,200,300],opacity:.5}]);check(projected,'actual floor projector creates its mesh');canonical(d,'floor-shadow source mesh remains native');same(lava.R_LavaManPositions(e),null,'controller supplies no alternate shadow positions');const source=d.p,point=new THREE.Vector3();
   for(let i=0;i<source.count;i++){point.fromBufferAttribute(source,i).applyMatrix4(d.mesh.matrixWorld);for(let k=0;k<3;k++)near(e._shadowWorld[i*3+k],point.getComponent(k),'floor-shadow source agrees with exact canonical surface',3e-4);}
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

Deno.test('Actual compiled UV domain conservatively covers native charts and has shared controller ownership',async()=>fixture(async ctx=>{
 await ctx.ready();const a=entity(ctx.model,421),b=entity(ctx.model,422),da=draw(a,ctx.header),db=draw(b,ctx.header);apply(a,da,2);apply(b,db,3);
 const ua=compiled(da.mesh.material).uniforms,ub=compiled(db.mesh.material).uniforms;
 check(ua.uLavaDomain?.value?.isDataTexture&&ub.uLavaDomain?.value?.isDataTexture,'actual basic compiler exposes procedural domain texture');
 const domain=ua.uLavaDomain.value; same(domain,ub.uLavaDomain.value,'actors share one topology domain');same(domain.colorSpace,THREE.NoColorSpace,'chart IDs and distances are linear data');same(domain.generateMipmaps,false,'chart IDs cannot be averaged through mipmaps');
 for(const u of [ua,ub]){check(u.uLavaAtlasSize?.value,'actual compiler exposes native atlas dimensions');same(u.uLavaAtlasSize.value.x,300,'native atlas width');same(u.uLavaAtlasSize.value.y,194,'native atlas height');}
 const {width,height,data}=domain.image;same(width,300,'domain uses native atlas width independent of4x art');same(height,194,'domain uses native atlas height');check(data instanceof Uint8Array,'RGBA unsigned-byte domain');same(data.length,width*height*4,'complete four-channel domain');
 // Build an independent coverage oracle directly from owned MDL bytes. Merge
 // triangles sharing native UV vertices (including point-touching regions),
 // permitting the implementation to split charts more conservatively. Label
 // numeric ordering is irrelevant, but disconnected native charts cannot share.
 const uvStart=88+300*194,triStart=uvStart+325*12,triangles=[],parents=Array.from({length:555},(_,i)=>i),uvOwner=new Map();
 const find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
 for(let t=0;t<555;t++){
  const at=triStart+t*16,front=ctx.bytes.readInt32LE(at),uv=[0,1,2].map(k=>{const v=ctx.bytes.readInt32LE(at+4+k*4),o=uvStart+v*12;return[ctx.bytes.readInt32LE(o+4)+(!front&&ctx.bytes.readInt32LE(o)?150:0),ctx.bytes.readInt32LE(o+8)];});triangles.push(uv);
  for(const point of uv){const key=point.join(',');if(uvOwner.has(key))parents[find(t)]=find(uvOwner.get(key));else uvOwner.set(key,t);}
 }
 const owners=new Int32Array(width*height).fill(-1),interior=new Uint8Array(width*height);
 triangles.forEach(([a,b,c],t)=>{const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)return;const chart=find(t);
  for(let y=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])));y<=Math.min(height-1,Math.floor(Math.max(a[1],b[1],c[1])));y++)for(let x=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])));x<=Math.min(width-1,Math.floor(Math.max(a[0],b[0],c[0])));x++){
   const w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w2=1-w0-w1;if(Math.min(w0,w1,w2)<-1e-8)continue;const i=y*width+x;if(owners[i]===-1)owners[i]=chart;else if(owners[i]!==chart)owners[i]=-2;if(Math.min(w0,w1,w2)>1e-5)interior[i]=1;
  }
 });
 const labels=new Map();let interiorCount=0,positiveClearance=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,offset=i*4,clearance=data[offset],id=data[offset+1];same(data[offset+2],0,'unused domain channel stays zero');same(data[offset+3],255,'opaque data channel');
  if(owners[i]<0){same(id,0,'outside or ambiguous native coverage has no chart ID');same(clearance,0,'outside or ambiguous texel cannot permit flow');continue;}
  if(interior[i]){check(id>0,'unambiguous native interior has a positive chart ID');interiorCount++;}
  if(!id){same(clearance,0,'unlabelled boundary has zero flow allowance');continue;}
  if(labels.has(id))same(labels.get(id),owners[i],'one label cannot alias disconnected native UV charts');else labels.set(id,owners[i]);
  if(clearance>0)positiveClearance++;
  // A one-texel inset avoids prescribing a distance-transform rounding method.
  // Every center in the remaining open disk must still be in the same chart.
  const radius=Math.max(0,clearance-1),reach=Math.ceil(radius);
  for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++)if(dx*dx+dy*dy<radius*radius){const xx=x+dx,yy=y+dy;check(xx>=0&&xx<width&&yy>=0&&yy<height,'clearance cannot run out of the atlas');same(data[(yy*width+xx)*4+1],id,'clearance cannot reach another chart or background');}
 }
 check(interiorCount>1000&&labels.size>1&&positiveClearance>100,'real interior charts provide bounded nonzero texture-flow room');const unchanged=hash(data);apply(a,da,9);apply(b,db,12);same(hash(data),unchanged,'time/phase never rewrites shared topology data');
 let disposed=0;domain.addEventListener('dispose',()=>disposed++);lava.R_LavaManRelease(a);same(disposed,0,'one remaining actor keeps the shared generated domain alive');same(compiled(db.mesh.material).uniforms.uLavaDomain.value,domain,'remaining actor retains same domain');lava.R_LavaManRelease(b);lava.R_LavaManClear();same(disposed,1,'last-consumer/clear disposes owned domain exactly once');
}));
