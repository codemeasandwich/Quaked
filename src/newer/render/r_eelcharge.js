/**
 * @module newer/render/r_eelcharge
 *
 * Procedural electricity on the original Eel's electrodes. Native skin state
 * owns the charge; this module never changes gameplay, skin, pose or lights.
 * One HD body is shared by every charge state. Ribbons reuse the gun's shader,
 * noise and path primitives, but not its material, cursor, clock or beam state.
 */
import * as THREE from 'three';
import { R_IsNewer, r_newer_enemies } from '../mode.js';
import { R_NewerAliasMaterial } from './r_newerskins.js';
import { R_LightningRibbonMaterial, R_LightningWriteRibbon, R_LightningBoltPath } from './r_lightning.js';

export const EEL_CHARGE = Object.freeze({
 model: 'progs/eel2.mdl',
 sha: '58b9c4a4af9953f8c024158ba8a7cebd33e19834440c09026fd5931cb6b831a7',
 width: 136, height: 194, maxVertices: 2048,
 energy: Object.freeze([0, .10, .20, .40, .65, .90])
});
const electrodePixels = Array.from({length:15},(_,i)=>[i<9?15:i<13?16:17,42+i*5]);
const entries = new Map();
let bindings = new WeakMap(), electricity = null, lastError = null;
const localView = {eye:[0,0,1],right:[1,0,0],up:[0,0,1],forward:[0,1,0]};
const zero = [0,0,0];
const add=(a,b)=>a.map((v,i)=>v+b[i]), mul=(a,s)=>a.map(v=>v*s);
const norm=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** Resolve the thirty native electrode pixel centres against actual expanded
 * alias UV triangles. Cache topology only; posed positions are never cached.
 */
export function R_EelChargeAnchors(geometry){
 const uv=geometry?.attributes?.uv,index=geometry?.index;
 if(!uv||!index)throw Error('Eel charge needs indexed native UV geometry');
 const cached=bindings.get(geometry);
 if(cached?.uv===uv&&cached.index===index)return cached.anchors;
 const anchors=[];
 for(let side=0;side<2;side++)for(let node=0;node<15;node++){
  const pixel=electrodePixels[node],u=(pixel[0]+side*68+.5)/136,v=(pixel[1]+.5)/194;
  let found=null;
  for(let t=0;t<index.count;t+=3){
   const ids=[index.getX(t),index.getX(t+1),index.getX(t+2)];
   const a=ids.map(i=>[uv.getX(i),uv.getY(i)]);
   const den=(a[1][1]-a[2][1])*(a[0][0]-a[2][0])+(a[2][0]-a[1][0])*(a[0][1]-a[2][1]);
   if(Math.abs(den)<1e-12)continue;
   const x=((a[1][1]-a[2][1])*(u-a[2][0])+(a[2][0]-a[1][0])*(v-a[2][1]))/den;
   const y=((a[2][1]-a[0][1])*(u-a[2][0])+(a[0][0]-a[2][0])*(v-a[2][1]))/den;
   const w=[x,y,1-x-y];
   if(w.every(n=>n>=-1e-6&&n<=1+1e-6)){found={side,node,uv:[u,v],vertices:ids,weights:w};break;}
  }
  if(!found)throw Error('Unmapped Eel electrode '+side+':'+node);
  anchors.push(found);
 }
 bindings.set(geometry,{uv,index,anchors});return anchors;
}

/** Read this draw's posed/interpolated attributes without changing them. */
export function R_EelChargeSample(geometry,anchors=R_EelChargeAnchors(geometry)){
 const p=geometry.attributes.position,n=geometry.attributes.normal;
 if(!p||!n)throw Error('Eel charge needs posed positions and normals');
 return anchors.map(a=>{
  const point=[0,0,0],normal=[0,0,0];
  for(let k=0;k<3;k++){
   const i=a.vertices[k],w=a.weights[k];
   if(i>=p.count||i>=n.count)throw Error('Eel charge topology changed');
   point[0]+=p.getX(i)*w;point[1]+=p.getY(i)*w;point[2]+=p.getZ(i)*w;
   normal[0]+=n.getX(i)*w;normal[1]+=n.getY(i)*w;normal[2]+=n.getZ(i)*w;
  }
  if(![...point,...normal].every(Number.isFinite))throw Error('Invalid Eel charge pose');
  return {point,normal:norm(normal)};
 });
}

/** Native charge states, including immediate skin-zero/pain/death reset. */
export function R_EelChargeWanted(entity){
 const id=entity?.model?.aliasSourceIdentity,s=entity?.skinnum;
 return R_IsNewer()&&r_newer_enemies.value!==0&&entity?.model?.name===EEL_CHARGE.model&&
  id?.state==='ready'&&id.sha256===EEL_CHARGE.sha&&Number.isInteger(s)&&s>=1&&s<=5;
}

function makeEntry(entity,parent,scene,base){
 if(!electricity)electricity=R_LightningRibbonMaterial({centerline:true});
 const array=new Float32Array(EEL_CHARGE.maxVertices*13),buffer=new THREE.InterleavedBuffer(array,13);
 buffer.setUsage(THREE.DynamicDrawUsage);
 const geometry=new THREE.BufferGeometry();
 for(const[name,size,offset]of [['position',3,0],['aData',4,3],['aExtra',2,7],['aTangent',3,9],['aWidth',1,12]])
  geometry.setAttribute(name,new THREE.InterleavedBufferAttribute(buffer,size,offset));
 geometry.setDrawRange(0,0);
 const fx=new THREE.Mesh(geometry,electricity);
 fx.name='eel_charge';fx.frustumCulled=false;fx.renderOrder=11;
 fx.castShadow=false;fx.receiveShadow=false;fx.userData.newerOnly=true;
 parent.add(fx);
 const seed=Number.isInteger(entity._entityIndex)?entity._entityIndex:
  (entity.origin||zero).reduce((h,x)=>Math.imul(h^Math.round(x*16),16777619),2166136261)>>>0;
 const entry={entity,parent,scene,base,fx,geometry,array,buffer,seed,stage:0,time:0,cursor:0,seen:true};
 // Uniforms may change here. Vertex data is built in Seen, BEFORE Three uploads
 // attributes; camera-facing width is expanded in the vertex shader per eye.
 fx.onBeforeRender=()=>{
  electricity.uniforms.uTime.value=entry.time;
  electricity.uniforms.uEffectOn.value=R_EelChargeWanted(entity)&&entity.skinnum===entry.stage&&parent.material===entry.base?1:0;
  electricity.uniformsNeedUpdate=true;
 };
 entries.set(entity,entry);return entry;
}

function buildEntry(entry,time,stage){
 const nodes=R_EelChargeSample(entry.parent.geometry),energy=EEL_CHARGE.energy[stage];
 entry.cursor=0;
 const write=(p,side,along,power,kind,seed,local,tangent,width)=>{
  if(entry.cursor+13>entry.array.length)throw Error('Eel electricity vertex budget exceeded');
  const a=entry.array,o=entry.cursor; a[o]=p[0];a[o+1]=p[1];a[o+2]=p[2];a[o+3]=side;a[o+4]=along;a[o+5]=power;a[o+6]=kind;a[o+7]=seed;a[o+8]=local;a[o+9]=tangent[0];a[o+10]=tangent[1];a[o+11]=tangent[2];a[o+12]=width;entry.cursor+=13;
 };
 const ribbon=(path,width,power,seed,taper=true)=>R_LightningWriteRibbon(write,localView.eye,1,path,width,power,0,seed,0,1,taper,true);
 for(let side=0;side<2;side++){
  for(let i=0;i<15;i++){
   const at=nodes[side*15+i],next=nodes[side*15+Math.min(i+1,14)],prior=nodes[side*15+Math.max(i-1,0)];
   const tangent=norm(next.point.map((v,k)=>v-prior.point[k])),across=norm(cross(at.normal,tangent));
   const centre=add(at.point,mul(at.normal,.10)),ring=[];
   for(let k=0;k<=4;k++){const angle=k*Math.PI*.5;ring.push(add(centre,add(mul(tangent,Math.cos(angle)*.14),mul(across,Math.sin(angle)*.14))));}
   ribbon(ring,.19,energy*.42,entry.seed+side*71+i,false);
  }
  if(stage<3)continue;
  for(let i=0;i<14;i++){
   const a=nodes[side*15+i],b=nodes[side*15+i+1],normal=norm(add(a.normal,b.normal));
   const start=add(a.point,mul(a.normal,.12)),end=add(b.point,mul(b.normal,.12));
   const seed=(entry.seed%10007)+side*191+i*13;
   const path=R_LightningBoltPath(localView,1,start,end,time,seed,.055+(stage-3)*.025,6,mul(normal,.22),false);
   ribbon(path,.23,energy,seed);
   if(stage>=4&&i%4===1){
    const tip=add(path[3],add(mul(normal,.30),mul(norm(end.map((v,k)=>v-start[k])),.30)));
    ribbon(R_LightningBoltPath(localView,1,path[3],tip,time,seed+59,.06,4,zero,false),.13,energy*.42,seed+59);
   }
  }
 }
 entry.buffer.clearUpdateRanges();entry.buffer.addUpdateRange(0,entry.cursor);entry.buffer.needsUpdate=true;
 entry.geometry.setDrawRange(0,entry.cursor/13);entry.fx.visible=entry.cursor>0;
 entry.stage=stage;entry.time=time;entry.seen=true;
}

/** Called after the actual native alias mesh is posed, for main and level-view
 * entities. Scene is an ownership token and may be a Group. Cosmetic failures
 * leave the already usable body material intact.
 */
export function R_EelChargeSeen(entity,mesh,scene,time){
 const prior=entries.get(entity);
 if(!R_IsNewer()){if(prior)prior.fx.visible=false;return null;}
 if(!R_EelChargeWanted(entity)||!mesh?.geometry||!Number.isFinite(time)){R_EelChargeRelease(entity);return null;}
 // Same-dir native-skin aliases must actually bind the one shared skin-zero
 // material. Native fallback and older six-picture manifests cannot double up.
 const base=R_NewerAliasMaterial(entity,entity.model.name,!!mesh.material?.vertexColors,0);
 if(!base||base!==mesh.material){R_EelChargeRelease(entity);return null;}
 let entry=prior;
 if(entry&&(entry.parent!==mesh||entry.scene!==scene||entry.base!==base)){R_EelChargeRelease(entity);entry=null;}
 try{
  R_EelChargeAnchors(mesh.geometry);
  entry ||= makeEntry(entity,mesh,scene,base);
  buildEntry(entry,time,entity.skinnum);
  return entry.fx;
 }catch(error){lastError=String(error.message||error);R_EelChargeRelease(entity);return null;}
}

export function R_EelChargeBegin(scene){
 for(const e of entries.values())if(e.scene===scene){e.seen=false;e.fx.visible=false;}
}
export function R_EelChargeEnd(scene){
 if(!R_IsNewer())return;
 for(const [entity,e]of entries)if(e.scene===scene&&!e.seen)R_EelChargeRelease(entity);
}
export function R_EelChargeRelease(entity){
 const e=entries.get(entity);if(!e)return;
 e.fx.removeFromParent();e.fx.onBeforeRender=()=>{};e.geometry.dispose();entries.delete(entity);
}
export function R_EelChargeClear(){
 for(const entity of [...entries.keys()])R_EelChargeRelease(entity);
 electricity?.dispose();electricity=null;bindings=new WeakMap();lastError=null;
}
export function R_EelChargeStatus(){
 return {entries:entries.size,visible:[...entries.values()].filter(e=>e.fx.visible).length,
  vertices:[...entries.values()].reduce((n,e)=>n+e.geometry.drawRange.count,0),errors:lastError?[lastError]:[]};
}
