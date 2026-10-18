import {ResourcePath} from '../src/platform/resource_paths.js';
// Independent CPU proof through the real owned Rogue model, alias draw,
// Lava Man lifecycle producer and composite uniform consumer. Only image
// transport is doubled. These checks do not claim GPU distortion or HDR pixels.
import assert from 'node:assert/strict';
import {readFileSync} from './helpers/resource_fs.mjs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import {GL_DrawAliasFrame,R_DrawAliasModel} from '../src/engine/render/gl_mesh.js';
import {entity_t} from '../src/engine/render/render.js';
import {cl,cl_entities} from '../src/engine/client/client.js';
import * as mode from '../src/newer/mode.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import * as fire from '../src/newer/render/r_fireball.js';
import * as lava from '../src/newer/render/r_lavaman.js';
import * as liquids from '../src/newer/render/r_post_liquids.js';
import {createPipeline} from '../src/newer/render/r_post_targets.js';
import {r_heathaze,r_reflect,r_hdr} from '../src/newer/render/r_post_config.js';
import * as vars from '../src/engine/common/cvar.js';
import {postState} from '../src/newer/render/r_post_state.js';
import {R_LiquidSurfaceMaterial} from '../src/engine/render/gl_rsurf.js';
import {setGlowActive,pulseLava} from '../src/newer/render/r_post_gbuffer.js';

const NAME='progs/lavaman.mdl',SHA='b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1';
const index=JSON.parse(readFileSync(new URL('../newer/enemies/index.json',import.meta.url)));
const digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
let nativePromise,serial=0;
async function native(){return nativePromise||=(async()=>{
 const rogue=await pakDirectory(process.env.QUAKED_OWNED_PAK||'/Users/bri/quaked/Dissolution of Eternity/pak0.pak');
 const id1=await pakDirectory(process.env.QUAKED_ID1_PAK||'/Users/bri/quaked/Quake/pak0.pak');
 COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(id1.get('gfx/palette.lmp'))));
 VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();
 const bytes=await readMember(rogue.get(NAME));assert.equal(digest(bytes),SHA);
 COM_AddPack(isolatedPack(NAME,bytes));const model=new model_t();model.name=NAME;model.needload=true;Mod_LoadModel(model,true);await model.aliasSourceIdentity.promise;
 assert.equal(model.aliasSourceIdentity.sha256,SHA);return{model,header:model.cache.data};
})();}
function disposePipeline(gpu){
 gpu.mesh.geometry.dispose();
 for(const value of Object.values(gpu))if(value?.isMaterial||value?.isWebGLRenderTarget)value.dispose();
 gpu.pointShadows?.dispose?.();
}
async function fixture(run){
 if(!vars.Cvar_FindVar(r_hdr.name))vars.Cvar_RegisterVariable(r_hdr);
 const data=await native(),old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),enemies:mode.r_newer_enemies.value,normals:mode.r_newer_normals.value,water:mode.r_newer_water.value,hdr:r_hdr.string,lerp:anim.r_lerpmodels.value,heat:r_heathaze.value,reflect:r_reflect.value,underwater:postState.underwater,waterView:postState.waterView,time:cl.time,entities:cl_entities.slice(),fire:fire.R_FireballAssets()};
 const requests=[];let gpu;
 lava.R_LavaManClear();skins.R_NewerSkinsShutdown();liquids.R_PostLiquidsReset();
 Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);vars.Cvar_SetValue(r_hdr.name,1);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;mode.r_newer_water.value=1;anim.r_lerpmodels.value=0;r_heathaze.value=.6;r_reflect.value=0;postState.underwater=false;postState.waterView=false;cl.time=3;cl_entities.length=0;
 fire.R_FireballTextures(null,null);skins.R_NewerSetIndex({...index,version:'independent-lava-heat-'+ ++serial});
 try{
  await skins.R_NewerSkinsPrepare([data.model]);const maps=requests.filter(r=>r.url.startsWith(ResourcePath('newer/enemies/lavaman/custom/')));assert.equal(maps.length,2);maps.forEach(r=>r.done(r.texture));assert.ok(skins.R_NewerSkinsStatus([data.model]).settled);
  gpu=createPipeline();const cm=gpu.compositeMaterial.uniforms,camera=new THREE.PerspectiveCamera(75,1.6,4,8192);camera.updateMatrixWorld();
  const scene=new THREE.Scene(),ctx={...data,scene,cm,camera,gpu,requests,update(){camera.updateMatrixWorld(true);liquids.R_PostLiquidUniforms(cm,camera,cl.time);return cm;},actor(id=31,position=[0,0,0],frame=17,owner=scene){
   const entity=new entity_t();entity.model=data.model;entity.skinnum=0;entity._entityIndex=id;entity.frame=frame;cl_entities[id]=entity;
   const mesh=R_DrawAliasModel(entity,data.header,new Float32Array(256).fill(1),.5,cl.time),pose=GL_DrawAliasFrame(data.header,frame);assert.ok(mesh);
   owner.add(mesh);mesh.position.set(...position);mesh.updateMatrixWorld(true);lava.R_LavaManApply(entity,mesh,pose.posAttr,pose.normalAttr,cl.time);
   return{entity,mesh,pose,seen(){lava.R_LavaManSeen(entity,mesh,owner,cl.time);}};
  }};
  await run(ctx);
 }finally{
  lava.R_LavaManClear();skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex(index);liquids.R_PostLiquidsReset();if(gpu)disposePipeline(gpu);
  fire.R_FireballTextures(old.fire?.atlas??null,old.fire?.noise??null);THREE.TextureLoader.prototype.load=old.loader;
  for(const key of ['document','window']){if(old[key])Object.defineProperty(globalThis,key,old[key]);else delete globalThis[key];}
  mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);vars.Cvar_Set(r_hdr.name,old.hdr);mode.r_newer_enemies.value=old.enemies;mode.r_newer_normals.value=old.normals;mode.r_newer_water.value=old.water;anim.r_lerpmodels.value=old.lerp;r_heathaze.value=old.heat;r_reflect.value=old.reflect;postState.underwater=old.underwater;postState.waterView=old.waterView;cl.time=old.time;cl_entities.splice(0,cl_entities.length,...old.entities);
 }
}
function worldBounds(mesh){
 // Independently enumerate the eight corners of the actual native local-pose
 // envelope. Rotated AABBs are conservative, rather than a tighter mesh hull.
 const p=mesh.geometry.attributes.position,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<p.count;i++)for(let axis=0;axis<3;axis++){const v=p.array[i*p.itemSize+axis];lo[axis]=Math.min(lo[axis],v);hi[axis]=Math.max(hi[axis],v);}
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],point=new THREE.Vector3();
 for(let corner=0;corner<8;corner++){point.set(...lo.map((v,axis)=>(corner&(1<<axis))?hi[axis]:v)).applyMatrix4(mesh.matrixWorld);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point.getComponent(axis));max[axis]=Math.max(max[axis],point.getComponent(axis));}}
 return{min,max};
}

Deno.test('Main native Lava Man heat uses actual transformed current-pose bounds without mutating geometry or requiring optional fire assets',async()=>fixture(async ctx=>{
 assert.equal(typeof lava.R_LavaManHeatSources,'function','production lifecycle producer exists');
 const a=ctx.actor(31,[132,-51,23]);a.mesh.rotation.z=.71;a.mesh.scale.set(1.2,.8,1.1);a.mesh.updateMatrixWorld(true);
 const geometry=a.mesh.geometry,p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,index=geometry.index;
 const before={position:digest(p.array),normal:digest(n.array),uv:digest(uv.array),index:digest(index.array),box:geometry.boundingBox,sphere:geometry.boundingSphere};
 assert.equal(lava.R_LavaManHeatSources().length,0,'Apply without Seen does not invent a visible heat source');a.seen();
 const sources=lava.R_LavaManHeatSources();assert.equal(sources.length,1,'actual seen native actor produces heat even with optional fire assets unavailable');const expected=worldBounds(a.mesh);
 for(const key of ['min','max'])for(let axis=0;axis<3;axis++)near(sources[0][key][axis],expected[key][axis],`canonical native ${key}/${axis}`);
 ctx.update();assert.equal(ctx.cm.uLavaActorCount.value,1);for(let axis=0;axis<3;axis++){near(ctx.cm.uLavaActorMin.value[0].getComponent(axis),expected.min[axis]-(axis<2?12:0),'min padding');near(ctx.cm.uLavaActorMax.value[0].getComponent(axis),expected.max[axis]+(axis<2?12:80),'max rising heat extent');}
 sources[0].min.fill(-100000);sources[0].max.fill(100000);assert.notDeepEqual(lava.R_LavaManHeatSources()[0],sources[0],'returned bounds are copies, never mutable renderer state');
 assert.equal(geometry.attributes.position,p);assert.equal(geometry.attributes.normal,n);assert.equal(geometry.attributes.uv,uv);assert.equal(geometry.index,index);for(const [key,attribute]of [['position',p],['normal',n],['uv',uv],['index',index]])assert.equal(digest(attribute.array),before[key]);assert.equal(geometry.boundingBox,before.box);assert.equal(geometry.boundingSphere,before.sphere);
}));

Deno.test('Actor heat and existing four pool slots remain independent and bounded while nearest-source order and water-off behavior stay correct',async()=>fixture(async ctx=>{
 const xs=[800,0,600,200,400,100,300,500],actors=xs.map((x,i)=>ctx.actor(80+i,[x,0,0]));actors.forEach(a=>a.seen());
 const pool=x=>({kind:2,min:[x,-90],max:[x+96,90],z:0,probePoint:[x,0,8]});liquids.R_PostSetLiquidRegions([],Array.from({length:6},(_,i)=>pool(i*250)));
 const cm=ctx.update();assert.equal(cm.uLavaActorCount.value,8);assert.equal(cm.uLavaActorMin.value.length,8);assert.equal(cm.uLavaActorMax.value.length,8);assert.equal(cm.uLavaCount.value,4);assert.equal(cm.uLavaMin.value.length,4);assert.equal(cm.uLavaMax.value.length,4);
 const poolsBefore=cm.uLavaMin.value.map(v=>v.toArray()),expected=actors.map(a=>worldBounds(a.mesh)).sort((a,b)=>a.min[0]-b.min[0]);
 for(let i=0;i<8;i++)near(cm.uLavaActorMin.value[i].x,expected[i].min[0]-12,'nearest actor order');
 actors.forEach(a=>lava.R_LavaManRelease(a.entity));ctx.update();assert.equal(cm.uLavaActorCount.value,0);assert.equal(cm.uLavaCount.value,4);assert.deepEqual(cm.uLavaMin.value.map(v=>v.toArray()),poolsBefore,'actor removal never evicts/reorders the existing four selected pools');
 const a=ctx.actor(95,[100,0,0]);a.seen();mode.r_newer_water.value=0;ctx.update();assert.equal(cm.uLavaCount.value,0,'existing water switch still controls pool heat');assert.equal(cm.uLavaActorCount.value,1,'hot creature is independent of the water rendering switch');assert.ok(cm.uHeat.value>0);
}));

Deno.test('Actor heat resets on heat-off underwater Classic and custom-off and resumes only for an eligible current actor',async()=>fixture(async ctx=>{
 const a=ctx.actor();a.seen();assert.equal(ctx.update().uLavaActorCount.value,1);
 r_heathaze.value=0;ctx.update();assert.equal(ctx.cm.uLavaActorCount.value,0);assert.equal(ctx.cm.uHeat.value,0);r_heathaze.value=.6;
 postState.underwater=true;ctx.update();assert.equal(ctx.cm.uLavaActorCount.value,0);assert.equal(ctx.cm.uHeat.value,0);postState.underwater=false;
 mode.R_AnimSetClassicPass(true);assert.equal(lava.R_LavaManHeatSources().length,0);assert.equal(ctx.update().uLavaActorCount.value,0);mode.R_AnimSetClassicPass(false);assert.equal(ctx.update().uLavaActorCount.value,1);
 mode.r_newer_enemies.value=0;assert.equal(ctx.update().uLavaActorCount.value,0);mode.r_newer_enemies.value=1;
 mode.R_AnimSetNewer(false);assert.equal(ctx.update().uLavaActorCount.value,0);mode.R_AnimSetNewer(true);assert.equal(ctx.update().uLavaActorCount.value,1);
 lava.R_LavaManClear();assert.equal(ctx.update().uLavaActorCount.value,0,'cleanup clears count despite populated previous-frame vectors');
}));

Deno.test('Unseen stale detached hidden ghost dead and reused render actors do not leave creature heat behind',async()=>fixture(async ctx=>{
 let a=ctx.actor();a.seen();assert.equal(lava.R_LavaManHeatSources().length,1);
 lava.R_LavaManBegin(ctx.scene);assert.equal(lava.R_LavaManHeatSources().length,0,'begin invalidates previous seen token');a.seen();assert.equal(lava.R_LavaManHeatSources().length,1);
 cl.time+=.1;assert.equal(lava.R_LavaManHeatSources().length,0,'old visual frame cannot heat a later native frame');a.seen();assert.equal(lava.R_LavaManHeatSources().length,1);
 a.mesh.visible=false;assert.equal(lava.R_LavaManHeatSources().length,0);a.mesh.visible=true;
 const group=new THREE.Group();ctx.scene.add(group);group.add(a.mesh);group.visible=false;assert.equal(lava.R_LavaManHeatSources().length,0,'hidden ancestor prevents source');group.visible=true;assert.equal(lava.R_LavaManHeatSources().length,1);
 a.mesh.removeFromParent();assert.equal(lava.R_LavaManHeatSources().length,0,'detached mesh has no current main scene contribution');ctx.scene.add(a.mesh);
 a.entity._levelViewGhost=true;a.entity._levelViewActive=true;assert.equal(lava.R_LavaManHeatSources().length,0,'visible neighboring ghost does not emit main view heat');delete a.entity._levelViewGhost;delete a.entity._levelViewActive;
 a.entity.health=0;assert.equal(lava.R_LavaManHeatSources().length,0,'explicit death metadata excludes source');delete a.entity.health;
 cl_entities[a.entity._entityIndex]=new entity_t();assert.equal(lava.R_LavaManHeatSources().length,0,'old rendered actor cannot follow a reused native client slot');cl_entities[a.entity._entityIndex]=a.entity;
 a.entity.model={...ctx.model};assert.equal(lava.R_LavaManHeatSources().length,0,'replacement model object invalidates old seen actor');
 lava.R_LavaManClear();a=ctx.actor(32);a.seen();lava.R_LavaManBegin(ctx.scene);lava.R_LavaManEnd(ctx.scene);assert.equal(lava.R_LavaManHeatSources().length,0,'main scene retirement leaves no stale source');assert.equal(ctx.update().uLavaActorCount.value,0);
}));

Deno.test('Actual composite actor boxes update with native movement and reject distant sources without changing native pose or pool selection',async()=>fixture(async ctx=>{
 const a=ctx.actor();a.seen();ctx.update();const first=ctx.cm.uLavaActorMin.value[0].clone(),p=a.mesh.geometry.attributes.position,bytes=digest(p.array);
 a.mesh.position.x+=215;a.mesh.updateMatrixWorld(true);a.seen();ctx.update();near(ctx.cm.uLavaActorMin.value[0].x-first.x,215,'heat follows actual actor transform');assert.equal(digest(p.array),bytes,'heat movement does not edit native pose');
 a.mesh.position.set(10000,0,0);a.mesh.updateMatrixWorld(true);a.seen();assert.equal(lava.R_LavaManHeatSources().length,1,'visible source producer reports actual world location');assert.equal(ctx.update().uLavaActorCount.value,0,'post consumer excludes source beyond 2400 units');
 ctx.camera.position.set(10000,0,0);assert.equal(ctx.update().uLavaActorCount.value,1,'moving listener near actual source admits it again');
 const shader=ctx.gpu.compositeMaterial.fragmentShader;assert.match(shader,/uniform\s+vec4\s+uLavaActorMin\[\s*8\s*\]/);assert.match(shader,/heldReceiver\(texture2D\(tNormal,uvd\)\)/,'existing held receiver gate retained');assert.match(shader,/actorWob\s*\+=\s*lavaHeatColumn/,'actor contribution reuses pool heat function');assert.match(shader,/clamp\(actorWob/,'overlapping actor contribution is bounded');
}));

Deno.test('Owned Lava Man material shares the actual native lava HDR pulse and unregisters on release without changing borrowed base material',async()=>fixture(async ctx=>{
 const glowBefore=postState.glowActive,a=ctx.actor(),owned=a.mesh.material,base=skins.R_NewerAliasMaterial(a.entity,NAME,true,0),baseColor=base.color.toArray(),texture=new THREE.DataTexture(new Uint8Array([255,150,32,255]),1,1);
 const natural=R_LiquidSurfaceMaterial({name:'*lava1',gl_texture:texture},1);
 try{
  assert.notEqual(owned,base);setGlowActive(true);
  for(const seconds of [0,.75,2.5,7.125]){pulseLava(seconds);near(owned.color.r,natural.color.r,'actor/native lava share one actual live pulse');assert.ok(owned.color.r>4.7&&owned.color.r<7.3,'natural lava HDR range');assert.equal(owned.userData.baseGlowBoost,natural.userData.baseGlowBoost);assert.deepEqual(base.color.toArray(),baseColor,'borrowed canonical alias material retains native color');}
  setGlowActive(false);near(owned.color.r,1,'HDR-off native intensity');near(natural.color.r,1,'natural lava has same HDR-off contract');
  setGlowActive(true);pulseLava(.75);lava.R_LavaManRelease(a.entity);const retired=owned.color.r;pulseLava(2.5);near(owned.color.r,retired,'disposed clone is removed from pulse registry');assert.equal(a.mesh.material,base);
 }finally{natural.dispose();texture.dispose();setGlowActive(glowBefore);}
}));

Deno.test('Pending failed and unsupported native-skin admissions cannot become heat sources',async()=>fixture(async ctx=>{
 const first=ctx.requests.length;skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex({...index,version:'independent-pending-heat-'+ ++serial});await skins.R_NewerSkinsPrepare([ctx.model]);
 const a=ctx.actor();a.seen();assert.equal(lava.R_LavaManHeatSources().length,0,'pending custom material creates no heat');assert.equal(ctx.update().uLavaActorCount.value,0);
 ctx.requests.slice(first).forEach(request=>request.fail(new Error('independent optional material transport failure')));a.seen();assert.equal(lava.R_LavaManHeatSources().length,0,'failed custom material creates no heat');
 skins.R_NewerSkinsShutdown();skins.R_NewerSetIndex({...index,version:'independent-recovered-heat-'+ ++serial});const restart=ctx.requests.length;await skins.R_NewerSkinsPrepare([ctx.model]);ctx.requests.slice(restart).forEach(request=>request.done(request.texture));
 const good=ctx.actor(40);good.seen();assert.equal(lava.R_LavaManHeatSources().length,1,'recovery positive control');good.entity.skinnum=1;assert.equal(lava.R_LavaManHeatSources().length,0,'alternate native skin excludes heat');good.entity.skinnum=0;
 good.entity.model={...ctx.model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}};assert.equal(lava.R_LavaManHeatSources().length,0,'a same-name model with unsupported identity never heats');
}));
