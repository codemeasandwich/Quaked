// Source-bound collector integration, not a GPU timing test. Execute unchanged
// collector/warm bodies with real Three resources and public startup/lease APIs.
// The recording compiler reproduces Three's synchronous prepareMaterial pass
// and defers its async completion, so the version+2 cannot be hidden by mocks.
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import * as THREE from 'three';
import {R_ShaderAssetStamp,R_CompileSceneAsync} from '../src/r_shaderwarm.js';
import * as boot from '../src/r_demoloading.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function collectorFixture(oldStamp=false){
 const source=readFileSync(new URL('../src/gl_rmain.js',import.meta.url),'utf8'),begin=source.indexOf('let _needCompile = false;'),end=source.indexOf('export function R_NewMap()',begin);check(begin>=0&&end>begin,'actual collector/warm source boundaries exist');let body=source.slice(begin,end);
 const texture=new THREE.DataTexture(new Uint8Array([170,120,90,255]),1,1),materials=[new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide})],uploaded=[texture],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),originalTarget={},compileTargets=[],completions=[],frames=[];
 let normalPreparations=0;
 const status={normals:{pending:0,ready:3,shipped:3,generated:0,settled:true,errors:{}},textures:{ready:3,fallback:0,settled:true},skins:{ready:2,fallback:0,settled:true},weapons:{ready:['v_shot'],settled:true},hud:{ready:2,fallback:0,settled:true},rock:{active:true,preparedState:'ready',preparedTiles:12,resident:12,missingVisibleTiles:0},demon:{enabled:true,ready:1,triangles:100,pending:0},shadows:{pending:0},water:{pending:0}},boundTarget={};
 const renderer={target:originalTarget,info:{programs:[{}]},uploads:[],getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},initTexture(t){this.uploads.push(t);},compileAsync(s,c){same(s,scene,'actual warm scene reaches compiler');same(c,camera,'actual camera reaches compiler');compileTargets.push(this.target);s.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){if(m.transparent===true&&m.side===THREE.DoubleSide&&m.forceSinglePass===false){m.side=THREE.BackSide;m.needsUpdate=true;m.side=THREE.FrontSide;m.needsUpdate=true;m.side=THREE.DoubleSide;}}});let resolve;const promise=new Promise(r=>resolve=r);completions.push(resolve);return promise;}};
 const context={THREE,renderer,scene,camera,cl:{worldmodel:{name:'maps/collector-fixture.bsp'},model_precache:[]},cls:{signon:4},R_WeaponsPreload(){},R_NewerHudPreload(){},R_NewerSkinsPrepare(){},R_NewerNormalsPrepare(){normalPreparations++;},R_NewerNormalsStatus:()=>status.normals,R_NewerTexturesStatus:()=>status.textures,R_NewerSkinsStatus:()=>status.skins,R_WeaponStatus:()=>status.weapons,R_NewerHudStatus:()=>status.hud,R_RockfieldStatus:()=>status.rock,R_DemonReliefStatus:()=>status.demon,R_PointShadowStatus:()=>status.shadows,R_WaterStartupStatus:()=>status.water,R_PostActive:()=>true,R_WeaponsEnabled:()=>true,R_IntroReadinessChecks:boot.R_IntroReadinessChecks,R_FlashlightBeam:()=>({on:false}),R_NewerSkinsMaterials:()=>[],R_NewerSkinsTextures:()=>[],R_WeaponMaterials:()=>materials,R_WeaponTextures:()=>uploaded,R_ShaderAssetStamp:oldStamp?((revision,materials,textures)=>JSON.stringify([revision,materials.map(m=>[m.uuid,m.version]),textures.map(t=>[t.uuid,t.version])])):R_ShaderAssetStamp,R_CompileSceneAsync,R_PostBind:r=>r.setRenderTarget(boundTarget),R_DemoLoadingFrame:s=>{frames.push(s);boot.R_DemoLoadingFrame(s);},Con_Printf(){},createQuakeLightmapMaterial:(map,lightMap)=>new THREE.MeshBasicMaterial({map,lightMap}),console};
 for(const name of ['r_newer_enemies','r_newer_normals','r_newer_textures','r_newer_hud','r_newer_lighting','r_pointshadows'])context[name]={value:1};
 const api=new Script(body+'\n({frame:R_UpdateIntroReadiness,get warm(){return _warmGroup;},get waterReady(){return _introWaterReady;}})',{filename:'actual-intro-collector.js'}).runInNewContext(context);boot.R_DemoLoadingBoot();boot.R_DemoLoadingWelcome();
 return{api,context,get normalPreparations(){return normalPreparations;},materials,texture,uploaded,status,renderer,originalTarget,boundTarget,compileTargets,completions,frames,async settle(){for(const resolve of completions)resolve();await flush();},async dispose(){for(const resolve of completions)resolve();await flush();const geometries=new Set(),allMaterials=new Set(materials),textures=new Set(uploaded);api.warm?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)allMaterials.add(o.material);});for(const m of allMaterials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}for(const g of geometries)g.dispose();for(const t of textures)t.dispose();boot.R_DemoLoadingCancel();}};
}
Deno.test('actual intro collector retains compile-induced material revisions while awaiting the real async lease and recompiles later genuine asset changes',async()=>{
 const f=collectorFixture();try{
  const version=f.materials[0].version;f.api.frame();same(f.materials[0].version,version+2,'real Three material receives both synchronous compile revisions');same(f.materials[0].side,THREE.DoubleSide,'compiler restores authored two-sided style');same(f.completions.length,1,'one initial compile');check(f.frames.at(-1).pending.includes('GPU asset upload'),'initial upload is still actual pending work');same(f.api.waterReady,false,'water cannot capture during upload');same(f.renderer.target,f.originalTarget,'collector restores caller render target');same(f.compileTargets[0],f.boundTarget,'compiler uses actual post-bound target');
  f.api.frame();same(f.completions.length,1,'synchronous version+2 does not requeue warmup next frame');check(f.frames.at(-1).pending.includes('GPU shaders'),'async compiler still blocks reveal');same(f.api.waterReady,false,'pending compiler still blocks final-art water capture');
  await f.settle();f.api.frame();same(f.api.waterReady,true,'only resolved compiler permits water');for(let i=0;i<3;i++)f.api.frame();same(boot.R_DemoLoadingStatus().phase,'done','real public coordinator reaches stable complete state');same(f.completions.length,1,'settled frames do not warm repeatedly');
  boot.R_DemoLoadingWelcome();f.materials[0].alphaTest=.3;f.materials[0].needsUpdate=true;f.api.frame();same(f.completions.length,2,'later genuine alpha-test shader change compiles exactly once');await f.settle();f.api.frame();same(f.completions.length,2,'new completed material revision also converges');
  f.texture.needsUpdate=true;f.api.frame();same(f.completions.length,3,'later texture upload revision remains detectable');await f.settle();f.api.frame();same(f.completions.length,3,'texture update converges without feedback');
  const old=f.materials[0];f.materials[0]=old.clone();old.dispose();f.api.frame();same(f.completions.length,4,'replacement UUID still invalidates');await f.settle();f.api.frame();
  f.status.rock.resident++;f.status.demon.triangles+=20;f.api.frame();same(f.completions.length,4,'streamed geometry counts never spuriously recompile unchanged bindings');
  same(f.renderer.target,f.originalTarget,'all compiler transitions preserve caller target');
 }finally{await f.dispose();}
});
Deno.test('prior version-based stamp mutation recreates actual ordinary-render feedback rather than passing the semantic collector oracle',async()=>{
 const f=collectorFixture(true);try{for(let i=0;i<4;i++){const m=f.materials[0];m.side=THREE.BackSide;m.needsUpdate=true;m.side=THREE.FrontSide;m.needsUpdate=true;m.side=THREE.DoubleSide;f.api.frame();await f.settle();}same(f.completions.length,4,'old captured revision schedules a new compile on every unchanged frame');check(f.frames.every(s=>s.pending.includes('GPU asset upload')),'old loop never supplies a terminal upload frame');same(boot.R_DemoLoadingStatus().phase,'warming','public startup remains blocked with old stamp');same(f.api.waterReady,false,'old feedback also prevents final-art water capture');}finally{await f.dispose();}
});
Deno.test('normal transparent DoubleSide drawing cannot feed unchanged shader versions back into intro warmup',async()=>{
 const f=collectorFixture();try{
  f.api.frame();await f.settle();
  for(let frame=0;frame<4;frame++){
   // Same retained native material transition as WebGLRenderer.renderObject:
   // both physical sides draw, then the author's DoubleSide state is restored.
   const material=f.materials[0];material.side=THREE.BackSide;material.needsUpdate=true;material.side=THREE.FrontSide;material.needsUpdate=true;material.side=THREE.DoubleSide;
   f.api.frame();await f.settle();
  }
  same(f.completions.length,1,'unchanged actual two-sided draws cannot restart shader compilation');same(boot.R_DemoLoadingStatus().phase,'done','normal rendered frames eventually release startup');
 }finally{await f.dispose();}
});

Deno.test('actual intro collector requires normal samples independently of pigment replacements and ignores only explicitly disabled roles',async()=>{
 const f=collectorFixture();try{
  f.context.r_newer_textures.value=0;f.status.textures={pending:1,ready:0,fallback:0,settled:false,errors:{old:'unused pigment'}};f.status.normals={pending:1,ready:0,settled:false,errors:{}};f.api.frame();check(f.frames.at(-1).pending.includes('surface normal samples'),'textures-off still holds for enabled normal samples');check(!f.frames.at(-1).pending.includes('textures'),'disabled pigment is not required');same(f.normalPreparations,1,'enabled normals actually start preparation');same(f.completions.length,0,'no compile before actual normal role settles');
  f.context.r_newer_normals.value=0;f.context.r_newer_textures.value=1;f.status.normals.errors={native:'ignored only because disabled'};f.api.frame();check(!f.frames.at(-1).pending.includes('surface normal samples'),'normals-off removes that role');check(f.frames.at(-1).pending.includes('textures'),'independently enabled pigment still holds');same(f.normalPreparations,1,'normals-off never starts additional normal work');
  f.context.r_newer_textures.value=0;f.context.r_newer_enemies.value=0;f.status.skins={pending:1,settled:false,ready:0,fallback:0};f.api.frame();check(!f.frames.at(-1).pending.includes('enemy and item art'),'both enemy art and native normals off removes actor role');await f.settle();
  f.context.r_newer_normals.value=1;f.status.normals={pending:0,ready:3,settled:true,errors:{}};f.api.frame();check(f.frames.at(-1).pending.includes('enemy and item art'),'native actor normal role remains required when enemy replacement is off');same(f.normalPreparations,2,'normal preparation resumes under its own toggle');
 }finally{await f.dispose();}
});
