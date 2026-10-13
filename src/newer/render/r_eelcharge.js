/**
 * @module newer/render/r_eelcharge
 *
 * Procedural electricity spiralling around the posed Eel and its electrodes. Native skin state
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
 energy: Object.freeze([0, .10, .20, .40, .65, .90]),
 spiral: Object.freeze({segments:96,turns:2.75,minClearance:.55,width:.55,secondaryWidth:.32})
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

// Native body strips exclude the detached mouth triangles at s45..65. Each
// section binds triangle-edge weights once, then reads current posed attributes.
const bodyRows = [3,9,16,24,34,44,54,64,74,84,94,104,114,124,134,144,154,164,174,184,188];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);

/** Full-body sections, including the fin, sampled from this draw's geometry.
 * UV intersections are cached; centres/radii always follow the current pose.
 */
export function R_EelChargeSpine(geometry){
 R_EelChargeAnchors(geometry);
 const binding=bindings.get(geometry),uv=geometry.attributes.uv,index=geometry.index;
 if(!binding.sections){
  binding.sections=bodyRows.map(row=>{
   const v=(row+.5)/EEL_CHARGE.height,anchors=[],seen=new Set();
   for(let i=0;i<index.count;i+=3){
    const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
    const s=ids.map(id=>uv.getX(id)*EEL_CHARGE.width);
    const body=s.every(x=>x<40)||s.every(x=>x>=68&&x<108);
    if(!body)continue;
    for(let k=0;k<3;k++){
     const a=ids[k],b=ids[(k+1)%3],ya=uv.getY(a),yb=uv.getY(b);
     if(Math.abs(yb-ya)<1e-9||v<Math.min(ya,yb)||v>Math.max(ya,yb))continue;
     const t=(v-ya)/(yb-ya),key=t<1e-6?'v'+a:t>1-1e-6?'v'+b:'e'+Math.min(a,b)+':'+Math.max(a,b);
     if(seen.has(key))continue;
     seen.add(key);anchors.push({vertices:[a,b,b],weights:[1-t,t,0]});
    }
   }
   if(anchors.length<2)throw Error('Unmapped Eel body section '+row);
   return {row,anchors};
  });
 }
 return binding.sections.map(({row,anchors})=>{
  const points=R_EelChargeSample(geometry,anchors).map(a=>a.point);
  const centre=[0,1,2].map(k=>(Math.min(...points.map(p=>p[k]))+Math.max(...points.map(p=>p[k])))*.5);
  const radius=Math.max(...points.map(p=>Math.hypot(...sub(p,centre))));
  return {row,centre,radius,points};
 });
}

/** Two animated helices around the curved body. Parallel transport prevents
 * arbitrary radial flips at bends; a sphere enclosing each section keeps the
 * authored dorsal fin inside the envelope. Only ribbon width/power taper.
 */
export function R_EelChargeSpiralPaths(geometry,time,seed,stage){
 if(stage<2)return [];
 const sections=R_EelChargeSpine(geometry),curve=new THREE.CatmullRomCurve3(sections.map(s=>new THREE.Vector3(...s.centre)),false,'centripetal');
 const steps=EEL_CHARGE.spiral.segments,frames=[];let radial;
 for(let i=0;i<=steps;i++){
  const u=i/steps,tangent=curve.getTangent(u).toArray(),centre=curve.getPoint(u).toArray();
  if(radial)radial=sub(radial,mul(tangent,dot(radial,tangent)));
  if(!radial||Math.hypot(...radial)<1e-5)radial=cross(tangent,Math.abs(tangent[2])<.9?[0,0,1]:[0,1,0]);
  radial=norm(radial);
  const at=u*(sections.length-1),lo=Math.min(sections.length-2,Math.floor(at)),f=at-lo;
  const radius=sections[lo].radius+(sections[lo+1].radius-sections[lo].radius)*f;
  frames.push({u,centre,radial:[...radial],across:norm(cross(tangent,radial)),radius});
 }
 const paths=[];
 for(let strand=0;strand<(stage>=4?2:1);strand++){
  const phase=(seed%997)/997*Math.PI*2+strand*Math.PI-time*2.8;
  const noise=R_LightningBoltPath(localView,1,[0,0,0],[0,0,1],time,seed+strand*91,1.25,steps,zero,false);
  paths.push(frames.map(({u,centre,radial,across,radius},i)=>{
   const angle=u*Math.PI*2*EEL_CHARGE.spiral.turns+phase+.08*Math.sin(u*71+time*13+seed);
   const clearance=.4+stage*.22+.10*Math.sin(u*59-time*17+strand);
   let x=Math.cos(angle)*(radius+clearance)+noise[i][0],y=Math.sin(angle)*(radius+clearance)+noise[i][1];
   // Noise may bend the arc sideways, but must not push it into the enclosing
   // body/fin radius. .55 covers the .187 primary half-width and chord margin.
   const outward=Math.max(1,(radius+EEL_CHARGE.spiral.minClearance)/Math.max(1e-8,Math.hypot(x,y)));
   x*=outward;y*=outward;
   return add(centre,add(mul(radial,x),mul(across,y)));
  }));
 }
 return paths;
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
 }
 const spirals=R_EelChargeSpiralPaths(entry.parent.geometry,time,entry.seed,stage);
 for(let i=0;i<spirals.length;i++){
  // The common gun writer scales kind-zero widths by .34: these values give
  // visible, soft filaments without turning the enclosing spiral into a cage.
  ribbon(spirals[i],i===0?EEL_CHARGE.spiral.width:EEL_CHARGE.spiral.secondaryWidth,energy*(i===0?1:.65),entry.seed+i*83);
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
