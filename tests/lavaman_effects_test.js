// Independent public behavior checks for Lava Man's visual deformation/effects.
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

Deno.test('Lava Man visual deformation preserves all canonical, blend-lead, native and gameplay state',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header),nativeBefore=geometryDigest(ctx.header),pHash=hash(d.p.array),nHash=hash(d.n.array),index=d.mesh.geometry.index,uv=d.mesh.geometry.attributes.uv;
 e._aliasLeadPos=d.p.array.slice();e._aliasLeadNormal=d.n.array.slice();const leadP=hash(e._aliasLeadPos),leadN=hash(e._aliasLeadNormal);e.health=123;e.effects=0;
 const state=JSON.stringify({origin:Array.from(e.origin),angles:Array.from(e.angles),frame:e.frame,skin:e.skinnum,health:e.health,effects:e.effects});
 const visual=apply(e,d,2.25);check(visual.p!==d.p&&visual.n!==d.n,'separate position and normal BufferAttributes');check(visual.p.array!==d.p.array&&visual.n.array!==d.n.array,'separate underlying visual arrays');
 check(hash(visual.p.array)!==pHash,'positive control: actual body deforms');same(d.mesh.geometry.index,index,'triangle topology is borrowed unchanged');same(d.mesh.geometry.attributes.uv,uv,'UV attributes unchanged');
 same(hash(d.p.array),pHash,'canonical positions untouched');same(hash(d.n.array),nHash,'canonical normals untouched');same(hash(e._aliasLeadPos),leadP,'interpolation lead positions untouched');same(hash(e._aliasLeadNormal),leadN,'interpolation lead normals untouched');same(geometryDigest(ctx.header),nativeBefore,'native pose/command/header arrays untouched');same(hash(ctx.bytes),SHA,'owned source bytes unchanged');same(JSON.stringify({origin:Array.from(e.origin),angles:Array.from(e.angles),frame:e.frame,skin:e.skinnum,health:e.health,effects:e.effects}),state,'no gameplay/model-state mutation');
 same(lava.R_LavaManStatus().entities,1,'one visual entry');same(lava.R_LavaManStatus().maxEntities,8,'explicit global entity cap');
}));

Deno.test('Lava Man field is bounded, seam-coherent and preserves triangle orientation through all90 native poses',async()=>fixture(async ctx=>{
 await ctx.ready();same(ctx.header.numposes,90,'actual native poses');const e=entity(ctx.model);let duplicateChecks=0,triangles=0;
 for(let frame=0;frame<90;frame++)for(const time of [0,1.375,9.125]){
  const d=draw(e,ctx.header,frame),before=hash(d.p.array)+hash(d.n.array),v=apply(e,d,time),seen=new Map();let moved=0;
  for(let i=0;i<d.p.count;i++){
   const p=vec(d.p,i),q=vec(v.p,i),n=vec(v.n,i),distance=Math.hypot(...sub(q,p));check([...q,...n].every(Number.isFinite),'finite visual vertex '+frame+':'+i);check(distance<=8.0001,'eight-unit displacement bound '+frame+':'+i+' got '+distance);if(distance>.001)moved++;near(Math.hypot(...n),1,'unit visual normal',2e-5);
   const key=p.join(','),prior=seen.get(key);if(prior){for(let k=0;k<3;k++)same(q[k],prior[k],'coincident canonical vertices cannot split at UV seams');duplicateChecks++;}else seen.set(key,q);
  }
  check(moved>0,'every native pose exercises actual deformation');
  const ids=d.mesh.geometry.index;
  for(let i=0;i<ids.count;i+=3){const a=ids.getX(i),b=ids.getX(i+1),c=ids.getX(i+2),old=cross(sub(vec(d.p,b),vec(d.p,a)),sub(vec(d.p,c),vec(d.p,a)));if(Math.hypot(...old)<1e-6)continue;const now=cross(sub(vec(v.p,b),vec(v.p,a)),sub(vec(v.p,c),vec(v.p,a)));check(dot(old,now)>0,'native nondegenerate triangle keeps orientation '+frame+':'+i);triangles++;}
  same(hash(d.p.array)+hash(d.n.array),before,'no canonical writes across pose sweep');
 }
 check(duplicateChecks>1000,'actual expanded seam duplicates exercised');check(triangles>90000,'native triangle orientation sweep exercised');
}));

Deno.test('Lava Man motion spans upper body and trunk rather than a rigid offset or isolated vertex',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header,17),first=apply(e,d,2).p.array.slice();apply(e,d,2.75);const current=d.mesh.geometry.attributes.position;
 const z=Array.from({length:d.p.count},(_,i)=>d.p.getZ(i)),low=Math.min(...z),high=Math.max(...z),bands=Array.from({length:3},()=>({count:0,moving:0})),displacements=[];
 for(let i=0;i<d.p.count;i++){
  const band=bands[Math.min(2,Math.floor((z[i]-low)/Math.max(1e-6,high-low)*3))],at=i*3,now=vec(current,i),prior=Array.from(first.subarray(at,at+3));band.count++;if(Math.hypot(...sub(now,prior))>.005)band.moving++;
  displacements.push(sub(now,vec(d.p,i)));
 }
 for(const[band,row]of bands.entries())check(row.count>0&&row.moving>row.count*.25,'temporal motion reaches native height band '+band+' (upper band includes the head)');
 const mean=[0,1,2].map(k=>displacements.reduce((n,p)=>n+p[k],0)/displacements.length),variance=displacements.reduce((n,p)=>n+dot(sub(p,mean),sub(p,mean)),0)/displacements.length;
 check(variance>.001,'body field is visibly nonrigid, not a translated model');
}));

Deno.test('Lava Man deformation reuses buffers and is deterministic under pause, rewind and pose changes',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header,17),first=apply(e,d,7.25),expected=geometryHash(d),position=first.p,normal=first.n;
 for(let i=0;i<10;i++){apply(e,d,7.25);same(geometryHash(d),expected,'pause has no accumulation');same(d.mesh.geometry.attributes.position,position,'visual position reused');same(d.mesh.geometry.attributes.normal,normal,'visual normal reused');}
 apply(e,d,7.75);check(geometryHash(d)!==expected,'time actually animates field');apply(e,d,7.25);same(geometryHash(d),expected,'rewind reconstructs exact field');
 const later=draw(e,ctx.header,57);apply(e,later,7.25);check(geometryHash(later)!==expected,'latest native pose used');const back=draw(e,ctx.header,17);apply(e,back,7.25);same(geometryHash(back),expected,'returning to pose does not reuse stale deformation');
 lava.R_LavaManRelease(e);canonical(back,'release restores latest supplied canonical objects');
}));

Deno.test('Lava Man transformed normals agree with independent finite-difference surface tangents',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),nativeDraw=draw(e,ctx.header,17),d={mesh:nativeDraw.mesh,p:nativeDraw.p.clone(),n:nativeDraw.n.clone()},time=3.125,epsilon=.025;
 // The field center is a parameter resolved from current native-head bounds,
 // not part of its local spatial derivative. Probe body and interior head points
 // without moving any bound-defining extrema; assert those bounds stay fixed.
 const head=Array.from({length:d.p.count},(_,i)=>i).filter(i=>ctx.header.meshVertexOrder[i]>=134&&ctx.header.meshVertexOrder[i]<=170),headSet=new Set(head);
 check(head.length>0,'actual native head vertices are represented');
 const headBounds=()=>[0,1,2].map(k=>{const values=head.map(i=>vec(d.p,i)[k]);return [Math.min(...values),Math.max(...values)];});
 const fixedBounds=headBounds(),boundsKey=JSON.stringify(fixedBounds);
 const interiorHead=head.filter(i=>vec(d.p,i).every((x,k)=>x>fixedBounds[k][0]+epsilon*2&&x<fixedBounds[k][1]-epsilon*2));
 check(interiorHead.length>0,'head has non-extremal points for an independent local derivative');
 const body=Array.from({length:d.p.count},(_,i)=>i).filter(i=>!headSet.has(i)),probes=[...body.filter((_,i)=>i%Math.max(1,Math.floor(body.length/23))===0),...interiorHead.filter((_,i)=>i%Math.max(1,Math.floor(interiorHead.length/6))===0)];
 const baseline=apply(e,d,time),normals=baseline.n.array.slice(),points=baseline.p.array.slice();let checked=0;
 for(const i of probes){
  const original=vec(d.p,i),n=unit(vec(d.n,i)),u=unit(cross(n,Math.abs(n[2])<.8?[0,0,1]:[0,1,0])),v=cross(n,u),deformedNormal=Array.from(normals.subarray(i*3,i*3+3));
  for(const tangent of [u,v]){
   const samples=[];for(const sign of [-1,1]){d.p.setXYZ(i,...original.map((x,k)=>x+sign*epsilon*tangent[k]));same(JSON.stringify(headBounds()),boundsKey,'differential probe holds head-center bounds fixed');const out=apply(e,d,time);samples.push(vec(out.p,i));}
   const transformed=unit(sub(samples[1],samples[0]));check(Math.abs(dot(deformedNormal,transformed))<.003,'inverse-transpose normal remains perpendicular to mapped tangent at '+i);
  }
  d.p.setXYZ(i,...original);checked++;
 }
 apply(e,d,time);same(hash(d.mesh.geometry.attributes.position.array),hash(points),'probing field leaves no deformation history');check(checked>=20,'independent tangent probes cover whole mesh');
 // Position field must not depend on normal direction (split normal seams).
 d.n.array.forEach((_,i)=>{d.n.array[i]=-d.n.array[i];});apply(e,d,time);same(hash(d.mesh.geometry.attributes.position.array),hash(points),'opposite normals at same positions cannot open a seam');
}));

Deno.test('Lava Man uses current interpolated canonical buffers and exposes deformation to shadow_pose',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header,17),next=GL_DrawAliasFrame(ctx.header,18),mix=.37;
 const p=new THREE.BufferAttribute(Float32Array.from(d.p.array,(x,i)=>x*(1-mix)+next.posAttr.array[i]*mix),3),n=new THREE.BufferAttribute(Float32Array.from(d.n.array,(x,i)=>x*(1-mix)+next.normalAttr.array[i]*mix),3);
 const blended={mesh:d.mesh,p,n},before=hash(p.array)+hash(n.array);apply(e,blended,4);d.mesh.updateMatrixWorld(true);const frozen=ShadowPoseCapture([d.mesh]);check(ShadowPoseEqual(frozen,[d.mesh]),'shadow sees current visual geometry');
 apply(e,blended,4);check(ShadowPoseEqual(frozen,[d.mesh]),'paused visual field permits same shadow');apply(e,blended,4.3);check(!ShadowPoseEqual(frozen,[d.mesh]),'animated visual positions invalidate shadow reuse');same(hash(p.array)+hash(n.array),before,'interpolation source arrays unchanged');
 const live=p.array;for(let i=0;i<live.length;i+=3)live[i]+=.125;const snapshot=hash(live);apply(e,blended,4);same(hash(live),snapshot,'latest in-place canonical updates are read without mutation');lava.R_LavaManRelease(e);canonical(blended,'release uses latest blended canonical attributes');
}));

Deno.test('Lava Man exact identity, skin, mode and ready custom material gates reject native fallbacks',async()=>fixture(async ctx=>{
 const e=entity(ctx.model);await skins.R_NewerSkinsPrepare([ctx.model]);let d=draw(e,ctx.header);apply(e,d,1);canonical(d,'pending texture');same(lava.R_LavaManStatus().entities,0,'no pending-custom allocation');
 ctx.requests.filter(r=>r.url.startsWith('newer/enemies/lavaman/custom/')).forEach(r=>r.fail());d=draw(e,ctx.header);apply(e,d,1);canonical(d,'failed texture');same(lava.R_LavaManStatus().entities,0,'no failed-custom allocation');
 for(const model of [ctx.boss.model,{...ctx.boss.model,name:NAME},{...ctx.model,aliasSourceIdentity:{state:'pending'}},{...ctx.model,aliasSourceIdentity:{state:'unavailable'}},{...ctx.model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}}]){const wrong=entity(model);same(lava.R_LavaManWanted(wrong),false,'wrong/pending native identity not wanted');lava.R_LavaManApply(wrong,d.mesh,d.p,d.n,1);canonical(d,'negative model fallback');}
 for(const skin of [-1,1,3,NaN]){e.skinnum=skin;same(lava.R_LavaManWanted(e),false,'only skin0');}e.skinnum=0;
}));

Deno.test('Actual alias model replacement cannot retain old Lava Man canonical geometry',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model,321),original=draw(e,ctx.header,17);apply(e,original,3);check(original.mesh.geometry.attributes.position!==original.p,'positive Lava deformation before replacement');
 e.model=ctx.boss.model;const chthon=draw(e,ctx.boss.header,0);
 same(lava.R_LavaManWanted(e),false,'actual Chthon is excluded after live entity reuse');canonical(chthon,'public alias draw keeps the new Chthon canonical buffers');same(lava.R_LavaManStatus().entities,0,'replaced model releases Lava allocation');
 e.model=ctx.model;const resumed=draw(e,ctx.header,57);apply(e,resumed,3);check(resumed.mesh.geometry.attributes.position!==resumed.p,'Lava entry can be created after model replacement');
 mode.r_newer_enemies.value=0;const nativeNext=draw(e,ctx.header,80);canonical(nativeNext,'mode-off plus native pose change keeps latest canonical buffers');same(lava.R_LavaManStatus().entities,0,'mode change retires visual entry');
}));

Deno.test('Lava Man custom-off and forged material restore canonical, while temporary Classic retains allocation',async()=>fixture(async ctx=>{
 await ctx.ready();const e=entity(ctx.model),d=draw(e,ctx.header);apply(e,d,5);const saved=geometryHash(d),position=d.mesh.geometry.attributes.position;
 mode.R_AnimSetClassicPass(true);apply(e,d,8);canonical(d,'temporary Classic');same(lava.R_LavaManStatus().entities,1,'Classic retains allocation');mode.R_AnimSetClassicPass(false);apply(e,d,5);same(d.mesh.geometry.attributes.position,position,'Newer resumes same allocation');same(geometryHash(d),saved,'Classic did not advance retained visual state');
 const original=d.mesh.material,forged=original.clone();d.mesh.material=forged;apply(e,d,5);canonical(d,'lookalike material rejected');same(lava.R_LavaManStatus().entities,0,'forged material releases');d.mesh.material=original;forged.dispose();
 apply(e,d,5);mode.r_newer_enemies.value=0;apply(e,d,5);canonical(d,'custom option off');same(lava.R_LavaManStatus().entities,0,'disabled custom releases');mode.r_newer_enemies.value=1;apply(e,d,5);mode.R_AnimSetNewer(false);apply(e,d,5);canonical(d,'actual non-Newer fallback');
}));

Deno.test('Real Classic scene save/restore preserves Lava Man visual buffers and borrowed FX visibility',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const scene=new THREE.Scene(),e=entity(ctx.model,77),d=draw(e,ctx.header,17);scene.add(d.mesh);d.mesh._quakeOwner=e;
 apply(e,d,6.25);lava.R_LavaManSeen(e,d.mesh,scene,6.25);d.mesh.geometry.computeBoundingBox();d.mesh.geometry.computeBoundingSphere();
 const p=d.mesh.geometry.attributes.position,n=d.mesh.geometry.attributes.normal,pHash=hash(p.array),nHash=hash(n.array),material=d.mesh.material,uv=d.mesh.geometry.attributes.uv,index=d.mesh.geometry.index;
 const bounds=JSON.stringify({box:d.mesh.geometry.boundingBox,sphere:d.mesh.geometry.boundingSphere}),effects=[];
 d.mesh.traverse(o=>{if(o!==d.mesh&&o.userData.newerOnly)effects.push({object:o,visible:o.visible,parent:o.parent});});
 check(effects.length>0&&effects.some(x=>x.visible),'real ready fire/smoke objects exist before Classic');
 const count=lava.R_LavaManStatus().entities,restore=R_SaveClassicScene(scene,6.25);
 try{
  mode.R_AnimSetClassicPass(true);scene.traverse(o=>{if(o.userData.newerOnly)o.visible=false;});
  const classic=draw(e,ctx.header,57);apply(e,classic,91.5);lava.R_LavaManBegin(scene);lava.R_LavaManSeen(e,classic.mesh,scene,91.5);lava.R_LavaManEnd(scene);
  canonical(classic,'actual Classic alias draw uses its different native pose');same(classic.mesh.material.map,ctx.header.gl_texturenum[0][0],'actual Classic native texture');same(hash(p.array),pHash,'Classic never writes retained Newer position array');same(hash(n.array),nHash,'Classic never writes retained Newer normal array');same(lava.R_LavaManStatus().entities,count,'Classic keeps visual allocation');
 }finally{mode.R_AnimSetClassicPass(false);restore();e.frame=17;}
 // No Newer Apply is allowed before these assertions: restore itself must work.
 same(d.mesh.geometry.attributes.position,p,'real restore recovers visual position reference');same(d.mesh.geometry.attributes.normal,n,'real restore recovers visual normal reference');same(hash(p.array),pHash,'real restore retains exact visual positions');same(hash(n.array),nHash,'real restore retains exact visual normals');same(d.mesh.material,material,'enhanced material restored');same(d.mesh.geometry.attributes.uv,uv,'UV binding restored');same(d.mesh.geometry.index,index,'triangle binding restored');same(JSON.stringify({box:d.mesh.geometry.boundingBox,sphere:d.mesh.geometry.boundingSphere}),bounds,'visual bounds restored');
 for(const {object,visible,parent}of effects){same(object.parent,parent,'borrowed effect parent restored');same(object.visible,visible,'borrowed effect visibility restored');}
 apply(e,d,6.25);same(hash(p.array),pHash,'return to same Newer tick is deterministic after Classic');same(hash(n.array),nHash,'normal field resumes without Classic accumulation');
}));

Deno.test('Lava Man pool is globally bounded at8 and entries remain independent and reusable',async()=>fixture(async ctx=>{
 await ctx.ready();const entries=[];
 for(let i=0;i<9;i++){const e=entity(ctx.model,100+i),d=draw(e,ctx.header,17+i);apply(e,d,2+i*.1);entries.push({e,d});check(lava.R_LavaManStatus().entities<=8,'global pool bound');if(i<8)check(d.mesh.geometry.attributes.position!==d.p,'first eight receive separate visual storage');else canonical(d,'ninth over-cap entity');}
 same(lava.R_LavaManStatus().entities,8,'eight live allocations');const untouched=geometryHash(entries[1].d);apply(entries[0].e,entries[0].d,9);same(geometryHash(entries[1].d),untouched,'updating one entity leaves another buffer untouched');check(entries[0].d.mesh.geometry.attributes.position!==entries[1].d.mesh.geometry.attributes.position,'per-entity buffers do not alias');
 lava.R_LavaManRelease(entries[0].e);canonical(entries[0].d,'released pool entry');apply(entries[8].e,entries[8].d,4);check(entries[8].d.mesh.geometry.attributes.position!==entries[8].d.p,'freed capacity admits ninth entity');same(lava.R_LavaManStatus().entities,8,'capacity remains bounded after reuse');
 lava.R_LavaManClear();same(lava.R_LavaManStatus().entities,0,'clear retires entire pool');for(const {d}of entries)canonical(d,'clear restores canonical');
}));

Deno.test('Lava Man scene lifecycle restores unseen meshes, isolates ghost Groups and preserves native assets',async()=>fixture(async ctx=>{
 await ctx.ready();ctx.fireReady();const scene=new THREE.Scene(),ghost=new THREE.Group(),a=entity(ctx.model,201),b=entity(ctx.model,202),da=draw(a,ctx.header),db=draw(b,ctx.header,57);scene.add(da.mesh);ghost.add(db.mesh);
 let nativeDisposed=0,textureDisposed=0;da.mesh.geometry.addEventListener('dispose',()=>nativeDisposed++);ctx.header.gl_texturenum[0][0].addEventListener('dispose',()=>textureDisposed++);
 apply(a,da,3);apply(b,db,3);lava.R_LavaManSeen(a,da.mesh,scene,3);lava.R_LavaManSeen(b,db.mesh,ghost,3);same(lava.R_LavaManStatus().entities,2,'two scene ownership tokens');
 const ghostHash=geometryHash(db);lava.R_LavaManBegin(scene);lava.R_LavaManEnd(scene);canonical(da,'unseen main entity restored');same(lava.R_LavaManStatus().entities,1,'only unseen main entity retired');same(geometryHash(db),ghostHash,'ghost visual buffer unaffected');
 lava.R_LavaManBegin(ghost);apply(b,db,3);lava.R_LavaManSeen(b,db.mesh,ghost,3);lava.R_LavaManEnd(ghost);same(lava.R_LavaManStatus().entities,1,'seen ghost retained');lava.R_LavaManRelease(b);lava.R_LavaManRelease(b);canonical(db,'idempotent ghost release');same(lava.R_LavaManStatus().entities,0,'all ownership released');same(nativeDisposed,0,'borrowed native geometry not disposed');same(textureDisposed,0,'native texture not disposed');
}));
