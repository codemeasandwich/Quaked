/**
 * @module newer/render/r_lavaman
 *
 * Lava Man's living surface. Cosmetic deformation follows native interpolation
 * into private buffers; it never becomes a pose or an interrupted-blend lead.
 * Flame and smoke reuse the torch/fireball pixel shaders and borrowed textures,
 * with their own bounded instanced layers. No gameplay, lights or native assets
 * are changed. See docs/lavaman-eldritch-2026-10-13.md.
 */
import * as THREE from 'three';
import { R_IsNewer, R_ClassicPassActive, r_newer_enemies } from '../mode.js';
import { R_NewerAliasMaterial } from './r_newerskins.js';
import { TORCH, TORCH_SHADERS, forEachSmoke } from './r_torchfire.js';
import { PUFF_VERTEX, PUFF_FRAGMENT, layer, material, R_FireballAssets } from './r_fireball.js';

export const LAVA_MAN = Object.freeze({model:'progs/lavaman.mdl',sha:'b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1',maxEntities:8,maxVertices:2048,maxDisplacement:8});
const entries = new Map();
let lastError=null,overflow=0;
// Native texel centres, independently measured on upper head/shoulder/chest/back
// triangles. Resolve UV topology once, then sample the deformed triangle itself.
const emitterPixels=[[52,8],[202,8],[32,68],[116,68],[182,68],[266,68],[65,82],[215,82]];
export function R_LavaManWanted(e){
 const id=e?.model?.aliasSourceIdentity;
 return R_IsNewer()&&r_newer_enemies.value!==0&&!(e?._levelViewGhost&&e._levelViewActive===false)&&e?.model?.name===LAVA_MAN.model&&e.skinnum===0&&id?.state==='ready'&&id.sha256===LAVA_MAN.sha;
}
export function R_LavaManNeedsFrame(e){return entries.has(e)||R_LavaManWanted(e);}
function selected(e,mesh){
 if(!R_LavaManWanted(e))return false;
 const base=R_NewerAliasMaterial(e,e.model.name,!!mesh.material?.vertexColors,0);
 return !!base&&mesh.material===base;
}
function topology(geometry){
 const uv=geometry.attributes.uv,index=geometry.index,head=[];
 if(!uv||!index)throw Error('Lava Man needs native indexed UVs');
 for(let i=0;i<uv.count;i++){
  const s=uv.getX(i)*300-.5,t=uv.getY(i)*194-.5;
  if(t>=3-1e-3&&t<=59+1e-3&&((s>=28-1e-3&&s<=76+1e-3)||(s>=178-1e-3&&s<=226+1e-3)))head.push(i);
 }
 if(head.length<10)throw Error('Lava Man head UVs unavailable');
 const anchors=emitterPixels.map(([s,t])=>{
  const u=(s+.5)/300,v=(t+.5)/194;
  for(let j=0;j<index.count;j+=3){
   const ids=[index.getX(j),index.getX(j+1),index.getX(j+2)],a=ids.map(i=>[uv.getX(i),uv.getY(i)]);
   const den=(a[1][1]-a[2][1])*(a[0][0]-a[2][0])+(a[2][0]-a[1][0])*(a[0][1]-a[2][1]);
   if(Math.abs(den)<1e-12)continue;
   const x=((a[1][1]-a[2][1])*(u-a[2][0])+(a[2][0]-a[1][0])*(v-a[2][1]))/den;
   const y=((a[2][1]-a[0][1])*(u-a[2][0])+(a[0][0]-a[2][0])*(v-a[2][1]))/den,w=[x,y,1-x-y];
   if(w.every(n=>n>=-1e-6&&n<=1+1e-6))return{ids,w};
  }
  throw Error('Unmapped Lava Man emitter '+s+','+t);
 });
 return{head,anchors,uv,index};
}
function canonical(entry){
 const g=entry.geometry;
 // Another renderer adapter may have taken these attributes since our draw.
 // Restore only what this effect still owns, never overwrite its successor.
 if(g.attributes.position===entry.position){g.setAttribute('position',entry.sourcePosition);g.computeBoundingBox();g.computeBoundingSphere();}
 if(g.attributes.normal===entry.normal)g.setAttribute('normal',entry.sourceNormal);
}
function hide(entry){if(entry.fire){entry.fire.mesh.visible=false;entry.smoke.mesh.visible=false;}}
function destroyEffects(entry){
 for(const fx of [entry.fire,entry.smoke])if(fx){fx.mesh.removeFromParent();fx.geometry.dispose();fx.mesh.material.dispose();}
 entry.fire=null;entry.smoke=null;entry.assets=null;
}
function makeEntry(entity,mesh,p,n){
 const bind=topology(mesh.geometry),size=p.count*3;
 const entry={entity,model:entity.model,header:entity.model.cache?.data,mesh,geometry:mesh.geometry,bind,sourcePosition:p,sourceNormal:n,
  position:new THREE.BufferAttribute(new Float32Array(size),3).setUsage(THREE.DynamicDrawUsage),
  normal:new THREE.BufferAttribute(new Float32Array(size),3).setUsage(THREE.DynamicDrawUsage),
  scene:null,seen:false,time:0,fire:null,smoke:null,assets:null,frustumCulled:mesh.frustumCulled,
  phase:((entity._entityIndex??0)>>>0)%997*.137,point:new Float64Array(3),direction:new Float64Array(3)};
 entries.set(entity,entry);return entry;
}
/** Always supply canonical template/blend attributes, even on an unchanged pose.
 * Reading geometry.position here would recursively deform the previous output.
 */
export function R_LavaManApply(entity,mesh,p,n,time){
 let e=entries.get(entity);
 if(!mesh?.geometry||!p||!n)return null;
 // A temporary Classic pass may use another pose's UV/index objects. Handle it
 // before ownership/topology checks, keeping all retained Newer state intact.
 if(R_ClassicPassActive()){
  mesh.geometry.setAttribute('position',p);mesh.geometry.setAttribute('normal',n);
  if(e)hide(e);
  return null;
 }
 // Every native pose has the same expanded topology, but template attributes
 // are different objects. Do not discard private buffers at every pose change.
 if(e&&(e.mesh!==mesh||e.geometry!==mesh.geometry||e.model!==entity.model||e.header!==entity.model.cache?.data||e.position.count!==p.count||e.bind.index.count!==mesh.geometry.index?.count)){
  R_LavaManRelease(entity);e=null;
  mesh.geometry.setAttribute('position',p);mesh.geometry.setAttribute('normal',n);
 }
 if(e){e.sourcePosition=p;e.sourceNormal=n;}
 if(!selected(entity,mesh)||!Number.isFinite(time)||p.count!==n.count||p.count>LAVA_MAN.maxVertices){R_LavaManRelease(entity);return null;}
 try{
  if(!e){
   // Cached portal figures cannot reserve every slot ahead of a live actor.
   if(entries.size>=LAVA_MAN.maxEntities&&!entity._levelViewGhost){
    for(const [other,entry]of entries)if(entry.entity._levelViewGhost){R_LavaManRelease(other);break;}
   }
   if(entries.size>=LAVA_MAN.maxEntities){overflow++;return null;}
   e=makeEntry(entity,mesh,p,n);
  }
  let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
  for(const i of e.bind.head){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);x0=Math.min(x0,x);y0=Math.min(y0,y);z0=Math.min(z0,z);x1=Math.max(x1,x);y1=Math.max(y1,y);z1=Math.max(z1,z);}
  const hx=(x0+x1)/2,hy=(y0+y1)/2,hz=(z0+z1)/2,t=time+e.phase,out=e.position.array,norm=e.normal.array;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dx=x-hx,dy=y-hy,dz=z-hz;
   const w=Math.exp(-(dx*dx/625+dy*dy/484+dz*dz/625)),wx=-2*dx/625*w,wy=-2*dy/484*w,wz=-2*dz/625*w;
   const a=.035*z+1.4*t,b=.045*y-.9*t,c=.033*x-.8*t,d=.031*y+1.1*t,f=.029*x-1.4*t;
   const ha=.09*dz+2.1*t,hb=.09*dx-1.7*t,hc=.08*dy+1.6*t;
   const ax=1.8*Math.sin(ha),ay=1.6*Math.sin(hb),az=1.8*Math.sin(hc);
   out[i*3]=x+1.8*Math.sin(a)+.8*Math.sin(b)+w*ax;
   out[i*3+1]=y+1.4*Math.sin(c)+w*ay;
   out[i*3+2]=z+1.8*Math.sin(d)+.9*Math.sin(f)+w*az;
   // Analytic Jacobian, with the head centre fixed for this draw. The spatial
   // derivatives stay small; displacement is bounded by sqrt(4.4²+3²+4.5²)<7.
   const A=1+wx*ax,B=.036*Math.cos(b)+wy*ax,C=.063*Math.cos(a)+wz*ax+w*.162*Math.cos(ha);
   const D=.0462*Math.cos(c)+wx*ay,E=1+wy*ay,F=wz*ay;
   const G=.0261*Math.cos(f)+wx*az,H=.0558*Math.cos(d)+wy*az+w*.144*Math.cos(hc),I=1+wz*az;
   // y's head oscillation depends on x, too.
   const J=D+w*.144*Math.cos(hb),nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
   const qx=(E*I-F*H)*nx+(F*G-J*I)*ny+(J*H-E*G)*nz;
   const qy=(C*H-B*I)*nx+(A*I-C*G)*ny+(B*G-A*H)*nz;
   const qz=(B*F-C*E)*nx+(C*J-A*F)*ny+(A*E-B*J)*nz;
   const length=Math.hypot(qx,qy,qz)||1;
   norm[i*3]=qx/length;norm[i*3+1]=qy/length;norm[i*3+2]=qz/length;
  }
  e.position.needsUpdate=true;e.normal.needsUpdate=true;e.time=time;
  mesh.geometry.setAttribute('position',e.position);mesh.geometry.setAttribute('normal',e.normal);
  mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
  // Emitters can extend beyond the native body's sphere. Bounded to eight actors.
  mesh.frustumCulled=false;
  return mesh;
 }catch(error){lastError=String(error.message||error);R_LavaManRelease(entity);return null;}
}
// Three's built-in fog math, with the fog colour premultiplied like these shared
// transparent effects. Reuse shader bodies unchanged; clipping/MRT remain intact.
function effectMaterial(vertex,fragment,uniforms){
 const fog=THREE.ShaderChunk.fog_fragment.replace('fogColor, fogFactor','fogColor * gl_FragColor.a, fogFactor');
 vertex='#include <fog_pars_vertex>\n'+vertex.replace('gl_Position=','#include <fog_vertex>\n gl_Position=');
 fragment='#include <fog_pars_fragment>\n'+fragment.replace('gNormal=vec4(0.);',fog+'\n gNormal=vec4(0.);');
 const m=material(vertex,fragment,{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),...uniforms},THREE.NormalBlending);m.fog=true;return m;
}
function effects(e,assets){
 if(e.assets===assets)return;
 destroyEffects(e);e.assets=assets;
 e.fire=layer('lavaman_fire',8,{aPosSize:4,aInfo:4},effectMaterial(TORCH_SHADERS.vertex,TORCH_SHADERS.fragment,{uNoise:{value:assets.noise},uTime:{value:0},uParams:{value:new THREE.Vector4(1,1.6,1.8,0)} }),7);
 e.smoke=layer('lavaman_smoke',24,{aPosSize:4,aInfo:4,aTint:4},effectMaterial(PUFF_VERTEX,PUFF_FRAGMENT,{uAtlas:{value:assets.atlas},uNoise:{value:assets.noise},uTime:{value:0}}),6);
 for(const fx of [e.fire,e.smoke]){fx.mesh.castShadow=false;fx.mesh.receiveShadow=false;e.mesh.add(fx.mesh);}
}
/** Called after Apply and entity transform. Scene/Group is a lifecycle owner. */
export function R_LavaManSeen(entity,mesh,scene,time){
 const e=entries.get(entity);
 if(!e)return null;
 if(R_ClassicPassActive()){hide(e);return null;}
 if(!selected(entity,mesh)||e.mesh!==mesh||!Number.isFinite(time)){R_LavaManRelease(entity);return null;}
 if(e.scene!==scene){destroyEffects(e);e.scene=scene;}
 e.seen=true;
 const assets=R_FireballAssets();
 if(!assets){destroyEffects(e);return null;}
 try{
  effects(e,assets);const p=e.position,n=e.normal,t=time+e.phase,fire=e.fire.arrays,smoke=e.smoke.arrays;
  let puff=0;
  for(let a=0;a<e.bind.anchors.length;a++){
   const anchor=e.bind.anchors[a],point=e.point,direction=e.direction;point.fill(0);direction.fill(0);
   for(let j=0;j<3;j++){
    const id=anchor.ids[j],w=anchor.w[j];point[0]+=p.getX(id)*w;point[1]+=p.getY(id)*w;point[2]+=p.getZ(id)*w;
    direction[0]+=n.getX(id)*w;direction[1]+=n.getY(id)*w;direction[2]+=n.getZ(id)*w;
   }
   const length=Math.hypot(...direction)||1;
   for(let k=0;k<3;k++)point[k]+=direction[k]/length*1.2;
   const scale=a<2?8:10,phase=a*7.13;
   fire.aPosSize.set([point[0],point[1],point[2]+TORCH.cardCentre*scale,scale],a*4);fire.aInfo.set([phase,0,0,0],a*4);
   // Three evenly spaced ages per anchor, from the source's stateless smoke.
   // A rewind recomputes them; no accumulated particles or cross-effect clock.
   let index=0;
   forEachSmoke(((t+phase)%10000+10000)%10000,1,0,(x,y,z,size,angle,alpha,heat,tile,r,g,b,seed)=>{
    const at=index++;if(at!==0&&at!==5&&at!==10)return;
    smoke.aPosSize.set([point[0]+x*scale,point[1]+z*scale,point[2]+y*scale,size*scale*2.3],puff*4);
    smoke.aInfo.set([angle,alpha*3.2,heat,tile],puff*4);smoke.aTint.set([r,g,b,seed],puff*4);puff++;
   });
  }
  for(const fx of [e.fire,e.smoke]){fx.mesh.material.uniforms.uTime.value=t;for(const attr of Object.values(fx.geometry.attributes))if(attr.isInstancedBufferAttribute)attr.needsUpdate=true;fx.mesh.visible=true;}
  e.fire.geometry.instanceCount=8;e.smoke.geometry.instanceCount=puff;
  return e.fire.mesh;
 }catch(error){lastError=String(error.message||error);destroyEffects(e);return null;}
}
export function R_LavaManPositions(entity){const e=entries.get(entity);return e&&R_LavaManWanted(entity)&&e.mesh.geometry.attributes.position===e.position?e.position.array:null;}
export function R_LavaManBegin(scene){if(R_ClassicPassActive())return;for(const e of entries.values())if(e.scene===scene){e.seen=false;hide(e);}}
export function R_LavaManEnd(scene){if(R_ClassicPassActive())return;for(const [entity,e]of entries)if(e.scene===scene&&!e.seen)R_LavaManRelease(entity);}
export function R_LavaManRelease(entity){const e=entries.get(entity);if(!e)return;canonical(e);e.mesh.frustumCulled=e.frustumCulled;destroyEffects(e);entries.delete(entity);}
export function R_LavaManClear(){for(const entity of entries.keys())R_LavaManRelease(entity);lastError=null;overflow=0;}
export function R_LavaManStatus(){return{entities:entries.size,maxEntities:LAVA_MAN.maxEntities,lastError,overflow};}
