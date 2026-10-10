import * as THREE from 'three';
import { createHash } from 'node:crypto';
import * as power from '../src/newer/render/r_powerups.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import * as post from '../src/newer/render/gl_post.js';
import { entity_t } from '../src/engine/render/render.js';
const check=(x,s)=>{if(!x)throw Error(s)}, same=(a,b,s)=>check(a===b,`${s}: ${a} !== ${b}`), hash=s=>createHash('sha256').update(s).digest('hex');
for(const v of [post.r_hdr,power.r_powerups])if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);
const setup=()=>{power.R_PowerupClear();mode.R_AnimSetClassicPass(false);vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('r_powerups',1);};
function fixture(){const scene=new THREE.Scene(),entity=new entity_t();entity.model={name:'progs/quaddama.mdl'};entity.origin.set([3,4,-50]);const mesh=new THREE.Mesh(new THREE.BoxGeometry(16,16,24),new THREE.MeshBasicMaterial());mesh.position.set(3,4,-50);return {scene,entity,mesh};}
function frame(f,time=1,seen=true){power.R_PowerupBegin(f.scene);const result=seen?power.R_PowerupSeen(f.entity,f.mesh,f.scene,time):null;power.R_PowerupEnd();return result;}
function finish(f){mode.R_AnimSetClassicPass(false);power.R_PowerupClear();vars.Cvar_SetValue('r_powerups',1);vars.Cvar_SetValue('r_hdr',1);f.mesh.geometry.dispose();f.mesh.material.dispose();}
function retainedFlame(group){check(!group.children.some(c=>c.name==='powerup_quad_sparks'),'Quad has no spark emitter');return group.children.find(c=>c.name==='powerup_quad_flames');}
function arrays(s){return Object.fromEntries(Object.entries(s.geometry.attributes).map(([k,a])=>[k,Array.from(a.array)]));}
Deno.test('independent quad public frame preserves native model and exact white flame while installing blue donor light',()=>{
 setup();const f=fixture(),entityBefore=JSON.stringify(f.entity),native=Object.entries(f.mesh.geometry.attributes).map(([k,a])=>[k,a,Array.from(a.array)]),index=f.mesh.geometry.index,indices=Array.from(index.array);
 try{const group=frame(f),light=power.R_PowerupLights()[0];same(light.color.join(),[0,0,1.1].join(),'source donor blue');same(light.radius,80,'source donor radius');same(light.powerup,'quad','quad identity');same(light.cookie,0,'quad has no ring cookie');same(JSON.stringify(f.entity),entityBefore,'native gameplay entity unchanged');for(const[k,a,b]of native){same(f.mesh.geometry.attributes[k],a,'native attribute identity '+k);same(Array.from(a.array).join(),b.join(),'native attribute bytes '+k);}same(f.mesh.geometry.index,index,'native index identity');same(Array.from(index.array).join(),indices.join(),'native index bytes');
 const flame=group.children.find(c=>c.name==='powerup_quad_flames');check(flame?.userData.powerupVolume,'native volumetric white flame retained');same(flame.material.uniforms.uColor.value.toArray().join(),[1.5,1.5,1.5].join(),'exact white flame color');same(hash(flame.material.vertexShader),'0341af9e8b845fc75b1a03883ef1a45d4924355dd16e4ecc2324b4bf64ac489e','unchanged existing flame vertex shader');same(hash(flame.material.fragmentShader),'f47ad352388d3cbabc6dc38f3cd1d1957411a2aeb7e2ebbfa6917ee0671e60bb','unchanged existing flame fragment shader');retainedFlame(group);
 }finally{finish(f);}
});
Deno.test('spark-free Quad retains stable animated white flame under repeated simulation time',()=>{
 setup();const f=fixture();try{const group=frame(f,3.25),s=retainedFlame(group),before=JSON.stringify(arrays(s));check(s?.userData.powerupVolume,'white flame volume remains');frame(f,3.25);same(JSON.stringify(arrays(s)),before,'same time keeps geometry');frame(f,3.5);same(JSON.stringify(arrays(s)),before,'animated flame keeps native-seeded geometry');same(s.material.uniforms.uTime.value,3.5,'simulation time reaches retained flame');same(retainedFlame(group),s,'stable flame allocation');}finally{finish(f);}
});
Deno.test('independent Classic public redraw leaves quad registry and flame geometry untouched',()=>{
 setup();const f=fixture();try{const group=frame(f,1),s=retainedFlame(group),source=power.R_PowerupLights()[0],before=JSON.stringify(arrays(s)),light=JSON.stringify(source);mode.R_AnimSetClassicPass(true);power.R_PowerupBegin(new THREE.Scene());same(power.R_PowerupSeen(f.entity,f.mesh,f.scene,99),null,'Classic Seen bypass');power.R_PowerupEnd();same(group.parent,f.scene,'Classic keeps enhanced group ownership');same(JSON.stringify(arrays(s)),before,'Classic does not mutate flame geometry');same(JSON.stringify(source),light,'Classic does not mutate light');same(power.R_PowerupLights().length,0,'Classic hides enhanced lights');mode.R_AnimSetClassicPass(false);same(power.R_PowerupLights()[0],source,'same light returns after Classic');}finally{finish(f);}
});
Deno.test('independent collection and feature disable retire all owned quad resources once',()=>{
 setup();const f=fixture();try{for(const reason of ['collection','disable','clear']){const group=frame(f,1),owned=[];for(const c of group.children){owned.push(c.geometry,c.material);for(const u of Object.values(c.material.uniforms||{}))if(u.value?.isTexture&&!owned.includes(u.value))owned.push(u.value);}const counts=new Map(owned.map(v=>[v,0]));for(const resource of owned)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));if(reason==='disable'){vars.Cvar_SetValue('r_powerups',0);frame(f,2);}else if(reason==='clear')power.R_PowerupClear();else frame(f,2,false);same(group.parent,null,reason+' removes effect');same(power.R_PowerupLights().length,0,reason+' clears lights');same(power.R_PowerupStatus().pickups,0,reason+' clears registry');for(const count of counts.values())same(count,1,reason+' disposes owned resource once');vars.Cvar_SetValue('r_powerups',1);}}finally{finish(f);}
});
