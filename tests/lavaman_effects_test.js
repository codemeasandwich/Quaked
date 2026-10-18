import {ResourcePath} from '../src/platform/resource_paths.js';
// Independent public behavior checks for Lava Man texture-only animation.
// Supersedes the earlier CPU mesh-deformation contract by owner instruction.
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

// Confirmed material-uniform contract in the recorded texture-only plan.
const WARP_TIME='uLavaTime',WARP_PHASE='uLavaPhase';
function compiled(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};material.onBeforeCompile(shader);return shader;}
function warp(material){const s=compiled(material);check(s.uniforms[WARP_TIME]&&Number.isFinite(s.uniforms[WARP_TIME].value),'actual basic material compiler exposes finite texture time');check(s.uniforms[WARP_PHASE]&&Number.isFinite(s.uniforms[WARP_PHASE].value),'actual basic material compiler exposes finite actor phase');return s.uniforms;}
function baseFor(e){const base=skins.R_NewerAliasMaterial(e,NAME,true,0);check(base,'actual ready canonical custom material');return base;}
function shapeState(d){const g=d.mesh.geometry;return {p:g.attributes.position,n:g.attributes.normal,uv:g.attributes.uv,index:g.index,position:hash(g.attributes.position.array),normal:hash(g.attributes.normal.array),uvBytes:hash(g.attributes.uv.array),indices:hash(g.index.array),box:g.boundingBox,sphere:g.boundingSphere,bounds:JSON.stringify({box:g.boundingBox,sphere:g.boundingSphere})};}
function sameShape(d,s,label){const now=shapeState(d);for(const key of ['p','n','uv','index','position','normal','uvBytes','indices','box','sphere','bounds'])same(now[key],s[key],label+' '+key);}

Deno.test('Texture animation preserves exact native geometry, normals, UVs, indices and bounds across90 poses and times',async()=>fixture(async ctx=>{
 await ctx.ready();same(ctx.header.numposes,90,'actual native pose count');const e=entity(ctx.model),before=geometryDigest(ctx.header);let snapshots=0;
 for(let frame=0;frame<90;frame++)for(const time of [0,1.375,9.125]){
  const d=draw(e,ctx.header,frame);canonical(d,'actual public alias draw stays canonical');d.mesh.geometry.computeBoundingBox();d.mesh.geometry.computeBoundingSphere();const state=shapeState(d);
  apply(e,d,time);canonical(d,'texture-only Apply stays canonical');sameShape(d,state,'texture animation changes no mesh data or bounds');same(lava.R_LavaManPositions(e),null,'floor-shadow source always uses native fallback');snapshots++;
 }
 same(snapshots,270,'all90 poses at three fixed times');same(geometryDigest(ctx.header),before,'native animation/header bytes unchanged');same(hash(ctx.bytes),SHA,'owned original bytes unchanged');
}));

Deno.test('Each Lava actor owns a material clone while borrowing unchanged base maps and compiler bindings',async()=>fixture(async ctx=>{
 await ctx.ready();const a=entity(ctx.model,41),b=entity(ctx.model,42),base=baseFor(a),before=hash(base.map.image.data),da=draw(a,ctx.header),db=draw(b,ctx.header);apply(a,da,2);apply(b,db,2);
 const ma=da.mesh.material,mb=db.mesh.material;check(ma!==base&&mb!==base&&ma!==mb,'independent owned material per actor');same(ma.map,base.map,'first actor borrows exact base diffuse');same(mb.map,base.map,'second actor borrows same base diffuse');same(ma._quakeNativeSkin,base._quakeNativeSkin,'native Classic binding preserved by alias clone');same(mb._quakeNativeSkin,base._quakeNativeSkin,'both clones preserve native binding');
 const canonicalShader=compiled(base),sa=compiled(ma),sb=compiled(mb);
 for(const[key,uniform]of Object.entries(canonicalShader.uniforms)){check(sa.uniforms[key]&&sb.uniforms[key],'base compiler contract retained '+key);same(sa.uniforms[key].value,uniform.value,'first clone retains base uniform value '+key);same(sb.uniforms[key].value,uniform.value,'second clone retains base uniform value '+key);}
 check(!canonicalShader.uniforms[WARP_TIME]&&!canonicalShader.uniforms[WARP_PHASE],'base material itself is never made animated');warp(ma);warp(mb);same(hash(base.map.image.data),before,'texture-only shader never rewrites source diffuse pixels');
}));

Deno.test('Texture uniforms remain isolated, deterministic and reusable through pause rewind and native pose changes',async()=>fixture(async ctx=>{
 await ctx.ready();const a=entity(ctx.model,51),b=entity(ctx.model,52),da=draw(a,ctx.header),db=draw(b,ctx.header);apply(a,da,7.25);apply(b,db,3.75);const ma=da.mesh.material,mb=db.mesh.material,ua=warp(ma),ub=warp(mb),timeA=ua[WARP_TIME].value,timeB=ub[WARP_TIME].value,phaseA=ua[WARP_PHASE].value,phaseB=ub[WARP_PHASE].value,key=ma.customProgramCacheKey(),version=ma.version;
 check(ua[WARP_TIME]!==ub[WARP_TIME]&&ua[WARP_PHASE]!==ub[WARP_PHASE],'uniform objects cannot bleed between actors');check(phaseA!==phaseB,'distinct actor phases');same(key,mb.customProgramCacheKey(),'same shader program can serve independent actors');
 for(let i=0;i<8;i++){apply(a,da,7.25);same(da.mesh.material,ma,'material reused on pause');same(warp(ma)[WARP_TIME],ua[WARP_TIME],'recompilation keeps live time uniform object');same(ua[WARP_TIME].value,timeA,'pause does not advance time');}
 apply(a,da,8.25);near(ua[WARP_TIME].value-timeA,1,'one-second time input advances shader by one second');same(ub[WARP_TIME].value,timeB,'other actor clock stays unchanged');same(ub[WARP_PHASE].value,phaseB,'other actor phase stays unchanged');apply(a,da,7.25);same(ua[WARP_TIME].value,timeA,'rewind restores exact shader clock');same(ua[WARP_PHASE].value,phaseA,'rewind preserves actor phase');
 const next=draw(a,ctx.header,57);apply(a,next,7.25);same(next.mesh.material,ma,'native pose change reuses material');canonical(next,'native pose still animates independently');same(ma.customProgramCacheKey(),key,'time and pose do not create new shader programs');same(ma.version,version,'uniform updates do not force material recompilation');
}));

Deno.test('Texture animation leaves native and interpolated shadow poses and interrupted-blend leads unchanged',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header,17),next=GL_DrawAliasFrame(ctx.header,18),mix=.37,p=new THREE.BufferAttribute(Float32Array.from(d.p.array,(v,i)=>v*(1-mix)+next.posAttr.array[i]*mix),3),n=new THREE.BufferAttribute(Float32Array.from(d.n.array,(v,i)=>v*(1-mix)+next.normalAttr.array[i]*mix),3),blend={mesh:d.mesh,p,n};
 e._aliasLeadPos=p.array.slice();e._aliasLeadNormal=n.array.slice();const leads=hash(e._aliasLeadPos)+hash(e._aliasLeadNormal),before=hash(p.array)+hash(n.array),state=JSON.stringify({origin:Array.from(e.origin),angles:Array.from(e.angles),frame:e.frame,skin:e.skinnum,effects:e.effects});
 d.mesh.geometry.setAttribute('position',p);d.mesh.geometry.setAttribute('normal',n);d.mesh.updateMatrixWorld(true);const captured=ShadowPoseCapture([d.mesh]);
 for(const time of [2,2.75,2]){apply(e,blend,time);canonical(blend,'canonical interpolated buffers preserved');check(ShadowPoseEqual(captured,[d.mesh]),'texture-only time does not invalidate geometric shadow pose');same(lava.R_LavaManPositions(e),null,'no cosmetic floor-shadow position override');}
 same(hash(p.array)+hash(n.array),before,'blend arrays unchanged');same(hash(e._aliasLeadPos)+hash(e._aliasLeadNormal),leads,'interrupted-blend leads unchanged');same(JSON.stringify({origin:Array.from(e.origin),angles:Array.from(e.angles),frame:e.frame,skin:e.skinnum,effects:e.effects}),state,'native/gameplay state unchanged');
 const animated=draw(e,ctx.header,57);apply(e,animated,2);check(!ShadowPoseEqual(captured,[animated.mesh]),'real native pose animation still changes shadow geometry');
}));

Deno.test('Actual ready fire and smoke roots follow native triangles without mesh deformation',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const e=entity(ctx.model,61),scene=new THREE.Scene(),uvStart=88+300*194,triStart=uvStart+325*12;
 const anchors=[[52,8],[202,8],[32,68],[116,68],[182,68],[266,68],[65,82],[215,82]].map(([s,t])=>{
  for(let triangle=0;triangle<555;triangle++){const o=triStart+triangle*16,front=ctx.bytes.readInt32LE(o),ids=[0,1,2].map(k=>ctx.bytes.readInt32LE(o+4+k*4)),q=ids.map(v=>{const at=uvStart+v*12;return[ctx.bytes.readInt32LE(at+4)+(!front&&ctx.bytes.readInt32LE(at)?150:0),ctx.bytes.readInt32LE(at+8)];}),[a,b,c]=q,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;const x=((b[1]-c[1])*(s-c[0])+(c[0]-b[0])*(t-c[1]))/den,y=((c[1]-a[1])*(s-c[0])+(a[0]-c[0])*(t-c[1]))/den,w=[x,y,1-x-y];if(w.every(v=>v>=-1e-8))return{ids,w};}throw Error('Independent native emitter UV is unmapped');
 });
 for(const frame of [16,17,57])for(const time of [1.125,2.031]){
  const d=draw(e,ctx.header,frame);scene.add(d.mesh);apply(e,d,time);lava.R_LavaManSeen(e,d.mesh,scene,time);canonical(d,'fire/smoke do not move native mesh');const flame=d.mesh.getObjectByName('lavaman_fire'),smoke=d.mesh.getObjectByName('lavaman_smoke');check(flame&&smoke,'actual existing shader layers created');same(flame.geometry.instanceCount,8,'eight native roots');same(smoke.geometry.instanceCount,24,'twenty-four bounded smoke puffs');const positions=flame.geometry.getAttribute('aPosSize');
  anchors.forEach((anchor,i)=>{const point=[0,0,0],normal=[0,0,0];for(let k=0;k<3;k++){const expanded=ctx.header.meshVertexOrder.indexOf(anchor.ids[k]);check(expanded>=0,'raw native vertex represented');for(let axis=0;axis<3;axis++){point[axis]+=vec(d.p,expanded)[axis]*anchor.w[k];normal[axis]+=vec(d.n,expanded)[axis]*anchor.w[k];}}const length=Math.hypot(...normal);for(let axis=0;axis<3;axis++)point[axis]+=normal[axis]/length*1.2;point[2]+=1.385*(i<2?8:10);for(let axis=0;axis<3;axis++)near(positions.array[i*4+axis],point[axis],'root follows canonical surface plus existing outward/card offset',3e-4);});
 }
}));

Deno.test('Pending failed wrong-identity and alternate-skin actors cannot acquire texture animation',async()=>fixture(async ctx=>{
 const e=entity(ctx.model);await skins.R_NewerSkinsPrepare([ctx.model]);let d=draw(e,ctx.header);apply(e,d,1);canonical(d,'pending custom fallback');same(lava.R_LavaManStatus().entities,0,'pending custom creates no actor material');ctx.requests.filter(r=>r.url.startsWith(ResourcePath('newer/enemies/lavaman/custom/'))).forEach(r=>r.fail());d=draw(e,ctx.header);apply(e,d,1);canonical(d,'failed custom fallback');same(lava.R_LavaManStatus().entities,0,'failed custom creates no actor material');
 for(const model of [ctx.boss.model,{...ctx.boss.model,name:NAME},{...ctx.model,aliasSourceIdentity:{state:'pending'}},{...ctx.model,aliasSourceIdentity:{state:'unavailable'}},{...ctx.model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}}]){const wrong=entity(model);same(lava.R_LavaManWanted(wrong),false,'actual Chthon or unsupported identity excluded');lava.R_LavaManApply(wrong,d.mesh,d.p,d.n,1);canonical(d,'identity fallback');same(lava.R_LavaManPositions(wrong),null,'negative identity has no shadow override');}
 for(const skin of [-1,1,3,NaN]){e.skinnum=skin;same(lava.R_LavaManWanted(e),false,'only native skin0');}same(lava.R_LavaManStatus().entities,0,'negative controls leave no owned entry');
}));

Deno.test('Foreign material ownership, model replacement and custom disable retire only Lava-owned materials',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model,71),base=baseFor(e),d=draw(e,ctx.header);apply(e,d,3);const owned=d.mesh.material;check(owned!==base,'positive owned shader material');let disposed=0,borrowed=0;owned.addEventListener('dispose',()=>disposed++);base.addEventListener('dispose',()=>borrowed++);base.map.addEventListener('dispose',()=>borrowed++);
 const foreign=base.clone();d.mesh.material=foreign;lava.R_LavaManRelease(e);same(d.mesh.material,foreign,'release preserves later material owner');same(disposed,1,'owned material disposed exactly once');same(borrowed,0,'base material and texture remain borrowed');lava.R_LavaManRelease(e);same(disposed,1,'release idempotent');foreign.dispose();
 const active=draw(e,ctx.header);apply(e,active,3);e.model=ctx.boss.model;const chthon=draw(e,ctx.boss.header,0);canonical(chthon,'actual model replacement stays canonical');same(lava.R_LavaManStatus().entities,0,'actual Chthon retires Lava material');
 e.model=ctx.model;const back=draw(e,ctx.header,57);apply(e,back,3);mode.r_newer_enemies.value=0;const off=draw(e,ctx.header,80);canonical(off,'custom-off native pose');same(off.mesh.material.map,ctx.header.gl_texturenum[0][0],'custom-off uses original texture');same(lava.R_LavaManStatus().entities,0,'custom-off releases animation state');
}));

Deno.test('Catalogue reload replaces owned texture material without disposing its new borrowed base',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model,81),d=draw(e,ctx.header);apply(e,d,4);const oldOwned=d.mesh.material,oldBase=baseFor(e);check(oldOwned!==oldBase,'owned clone before reload');let oldDisposed=0;oldOwned.addEventListener('dispose',()=>oldDisposed++);
 const firstRequest=ctx.requests.length;skins.R_NewerSetIndex({...originalIndex,version:'lava-reload-'+ ++serial});await skins.R_NewerSkinsPrepare([ctx.model]);ctx.requests.slice(firstRequest).forEach(r=>r.done(r.texture));const base=baseFor(e);check(base!==oldBase,'reload actually installs a new canonical base');let borrowedDisposed=0;base.addEventListener('dispose',()=>borrowedDisposed++);base.map.addEventListener('dispose',()=>borrowedDisposed++);
 const next=draw(e,ctx.header);apply(e,next,4);check(next.mesh.material!==oldOwned&&next.mesh.material!==base,'fresh owned material for reloaded base');same(next.mesh.material.map,base.map,'new clone borrows reloaded map');same(oldDisposed,1,'obsolete owned material retired');lava.R_LavaManClear();same(next.mesh.material,base,'clear restores current base');same(borrowedDisposed,0,'clear does not dispose reloaded base/map');
}));

Deno.test('Real Classic save/restore retains texture clock, native geometry and actual borrowed FX visibility',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const scene=new THREE.Scene(),e=entity(ctx.model,91),d=draw(e,ctx.header,17);scene.add(d.mesh);d.mesh._quakeOwner=e;apply(e,d,6.25);lava.R_LavaManSeen(e,d.mesh,scene,6.25);canonical(d,'Newer geometry is native');d.mesh.geometry.computeBoundingBox();d.mesh.geometry.computeBoundingSphere();const state=shapeState(d),material=d.mesh.material,uniforms=warp(material),time=uniforms[WARP_TIME].value,phase=uniforms[WARP_PHASE].value,effects=[];d.mesh.traverse(o=>{if(o!==d.mesh&&o.userData.newerOnly)effects.push({object:o,parent:o.parent,visible:o.visible});});check(effects.length>0,'actual effects exist before Classic');const count=lava.R_LavaManStatus().entities,restore=R_SaveClassicScene(scene,6.25);
 try{mode.R_AnimSetClassicPass(true);scene.traverse(o=>{if(o.userData.newerOnly)o.visible=false;});const classic=draw(e,ctx.header,57);apply(e,classic,91.5);lava.R_LavaManBegin(scene);lava.R_LavaManSeen(e,classic.mesh,scene,91.5);lava.R_LavaManEnd(scene);canonical(classic,'Classic follows its actual native pose');same(classic.mesh.material.map,ctx.header.gl_texturenum[0][0],'Classic original texture');same(uniforms[WARP_TIME].value,time,'Classic never advances retained Newer texture clock');same(uniforms[WARP_PHASE].value,phase,'Classic never changes actor phase');same(lava.R_LavaManStatus().entities,count,'temporary Classic retains owned material allocation');}
 finally{mode.R_AnimSetClassicPass(false);restore();e.frame=17;}
 same(d.mesh.material,material,'save/restore recovers owned animated material');const after=shapeState(d);for(const key of ['p','n','uv','index','position','normal','uvBytes','indices','bounds'])same(after[key],state[key],'save/restore native geometry '+key);for(const x of effects){same(x.object.parent,x.parent,'effect parent restored');same(x.object.visible,x.visible,'effect visibility restored');}same(warp(material)[WARP_TIME].value,time,'restored material keeps paused clock without a repairing Apply');
}));

Deno.test('Eight-actor texture pool is bounded and main actors retain priority over inactive portal ghosts',async()=>fixture(async ctx=>{
 await ctx.ready();const actors=[];for(let i=0;i<9;i++){const e=entity(ctx.model,100+i),base=baseFor(e),d=draw(e,ctx.header,17+i);apply(e,d,2);actors.push({e,d,base});canonical(d,'every pooled/overflow actor keeps native mesh');check(lava.R_LavaManStatus().entities<=8,'global cap8');if(i<8)check(d.mesh.material!==base,'first eight have owned animated material');else same(d.mesh.material,base,'ninth remains usable base material');}
 const first=actors[0],untouched=warp(actors[1].d.mesh.material)[WARP_TIME].value;apply(first.e,first.d,8);same(warp(actors[1].d.mesh.material)[WARP_TIME].value,untouched,'pool actors retain independent clocks');lava.R_LavaManRelease(first.e);same(first.d.mesh.material,first.base,'release restores borrowed base');apply(actors[8].e,actors[8].d,4);check(actors[8].d.mesh.material!==actors[8].base,'freed slot admits ninth actor');lava.R_LavaManClear();same(lava.R_LavaManStatus().entities,0,'clear retires pool');for(const row of actors)same(row.d.mesh.material,row.base,'clear returns borrowed material');
 const ghosts=[];for(let i=0;i<8;i++){const e=entity(ctx.model,200+i);e._levelViewGhost=true;e._levelViewActive=true;const base=baseFor(e),d=draw(e,ctx.header);apply(e,d,3);ghosts.push({e,d,base});}const e=entity(ctx.model,300),d=draw(e,ctx.header),base=baseFor(e);apply(e,d,3);check(d.mesh.material!==base,'main actor can reclaim ghost capacity');same(ghosts.filter(x=>x.d.mesh.material===x.base).length,1,'one ghost restored to its borrowed base');same(lava.R_LavaManStatus().entities,8,'reclamation preserves cap');
 lava.R_LavaManClear();e._levelViewGhost=true;e._levelViewActive=false;const inactive=draw(e,ctx.header);apply(e,inactive,3);same(inactive.mesh.material,base,'inactive portal figure has no material warp');same(lava.R_LavaManStatus().entities,0,'inactive ghost allocates nothing');
}));

Deno.test('Scene-token lifecycle restores base materials and never disposes native geometry or shared effects textures',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const assets=fire.R_FireballAssets(),scene=new THREE.Scene(),ghost=new THREE.Group(),a=entity(ctx.model,401),b=entity(ctx.model,402),da=draw(a,ctx.header),db=draw(b,ctx.header,57),base=baseFor(a);scene.add(da.mesh);ghost.add(db.mesh);let borrowed=0;for(const asset of [base,base.map,assets.atlas,assets.noise,da.mesh.geometry])asset.addEventListener('dispose',()=>borrowed++);
 apply(a,da,3);apply(b,db,4);lava.R_LavaManSeen(a,da.mesh,scene,3);lava.R_LavaManSeen(b,db.mesh,ghost,4);const mb=db.mesh.material,clock=warp(mb)[WARP_TIME].value;lava.R_LavaManBegin(scene);lava.R_LavaManEnd(scene);same(da.mesh.material,base,'unseen main actor restores base');same(db.mesh.material,mb,'other scene material unaffected');same(warp(mb)[WARP_TIME].value,clock,'other scene clock unaffected');same(lava.R_LavaManStatus().entities,1,'only unseen owner retired');lava.R_LavaManBegin(ghost);apply(b,db,4);lava.R_LavaManSeen(b,db.mesh,ghost,4);lava.R_LavaManEnd(ghost);same(lava.R_LavaManStatus().entities,1,'seen ghost remains');lava.R_LavaManRelease(b);same(db.mesh.material,base,'ghost release returns shared base');same(borrowed,0,'geometry, canonical material and shared textures remain borrowed');same(lava.R_LavaManStatus().entities,0,'no retained entries');
}));
