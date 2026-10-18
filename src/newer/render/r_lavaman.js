/**
 * @module newer/render/r_lavaman
 *
 * Lava Man's photographed skin flows over the exact native animated mesh.
 * An actor owns one alias-material clone and live uniforms; diffuse, normals,
 * height gradients and height rays share one chart-bounded UV domain. No pose,
 * normal, UV, index, bounds, collision or geometric shadow data is rewritten.
 * Flame/smoke retain their existing bounded source shaders and native roots.
 * See docs/lavaman-skin-flow-2026-10-18.md for the owner-corrected contract.
 */
import * as THREE from 'three';
import { R_IsNewer, R_ClassicPassActive, r_newer_enemies } from '../mode.js';
import { R_NewerAliasMaterial, R_CloneAliasMaterial } from './r_newerskins.js';
import { TORCH, TORCH_SHADERS, forEachSmoke } from './r_torchfire.js';
import { PUFF_VERTEX, PUFF_FRAGMENT, layer, material, R_FireballAssets } from './r_fireball.js';
import { R_RegisterGlow } from './r_post_gbuffer.js';
import { LAVA_BOOST } from './r_post_config.js';
import { cl, cl_entities } from '../../engine/client/client.js';
import { sv } from '../../engine/server/server.js';

export const LAVA_MAN = Object.freeze({model:'progs/lavaman.mdl',sha:'b81bb7f5cebb2889cfd2f431f743200f672d0195b05fe3faa98b50163fed7fb1',maxEntities:8,maxVertices:2048,maxDisplacement:0,hotRadianceTint:Object.freeze([.55,.25,.08])});
const WIDTH=300,HEIGHT=194,entries=new Map(),domains=new Map();
let lastError=null,overflow=0;
const emitterPixels=[[52,8],[202,8],[32,68],[116,68],[182,68],[266,68],[65,82],[215,82]];
// Only Lava Man's colour function changes. Torch erosion/noise/coverage, fog,
// instancing and all wall/projectile flame palettes remain owned by their source.
const LAVA_FLAME_FRAGMENT=TORCH_SHADERS.fragment.replace(/vec3 flameColor\(float h\)\{[^}]+\}/,
 'vec3 flameColor(float h){return mix(vec3(.78,.025,.001),vec3(1.,.18,.006),smoothstep(.0,1.,h));}');

export function R_LavaManWanted(e){
 const id=e?.model?.aliasSourceIdentity;
 return R_IsNewer()&&r_newer_enemies.value!==0&&!(e?._levelViewGhost&&e._levelViewActive===false)&&e?.model?.name===LAVA_MAN.model&&e.skinnum===0&&id?.state==='ready'&&id.sha256===LAVA_MAN.sha;
}
export function R_LavaManNeedsFrame(e){return entries.has(e)||R_LavaManWanted(e);}
function selected(e,mesh){
 if(!R_LavaManWanted(e))return null;
 const base=R_NewerAliasMaterial(e,e.model.name,!!mesh.material?.vertexColors,0),entry=entries.get(e);
 return base&&(mesh.material===base||(entry?.base===base&&mesh.material===entry.material))?base:null;
}
function topology(geometry){
 const uv=geometry.attributes.uv,index=geometry.index;
 if(!uv||!index||index.count%3)throw Error('Lava Man needs native indexed UVs');
 const anchors=emitterPixels.map(([s,t])=>{
  const u=(s+.5)/WIDTH,v=(t+.5)/HEIGHT;
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
 return{anchors,uv,index};
}
/** A domain belongs to native UV topology, never a decoded replacement image or
 * the loader's scratch stverts/triangles. Connected UV triangles share a label.
 * Ambiguous overlaps stay zero. Eight-neighbour distance is a conservative lower
 * bound on Euclidean clearance; the shader reserves an additional filter margin.
 */
function domainFor(key,geometry){
 let domain=domains.get(key);if(domain){domain.users++;return domain;}
 const uv=geometry.attributes.uv,index=geometry.index,count=index.count/3;
 const parents=Array.from({length:count},(_,i)=>i),points=new Map(),triangles=[];
 const find=i=>parents[i]===i?i:(parents[i]=find(parents[i]));
 for(let i=0;i<count;i++){
  const triangle=[0,1,2].map(k=>{const at=index.getX(i*3+k);return[Math.round(uv.getX(at)*WIDTH-.5),Math.round(uv.getY(at)*HEIGHT-.5)];});triangles.push(triangle);
  for(const p of triangle){const point=p.join(',');if(points.has(point))parents[find(i)]=find(points.get(point));else points.set(point,i);}
 }
 const labels=new Map(),owners=new Int16Array(WIDTH*HEIGHT);
 for(let t=0;t<count;t++){
  const root=find(t);if(!labels.has(root)){if(labels.size>=255)throw Error('Too many Lava Man UV charts');labels.set(root,labels.size+1);}
  const id=labels.get(root),[a,b,c]=triangles[t],den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
  for(let y=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])));y<=Math.min(HEIGHT-1,Math.floor(Math.max(a[1],b[1],c[1])));y++)for(let x=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])));x<=Math.min(WIDTH-1,Math.floor(Math.max(a[0],b[0],c[0])));x++){
   const w0=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,w1=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den;
   if(Math.min(w0,w1,1-w0-w1)<-1e-8)continue;
   const at=y*WIDTH+x;if(owners[at]===0)owners[at]=id;else if(owners[at]!==id)owners[at]=-1;
  }
 }
 const distance=new Int16Array(owners.length).fill(-1),queue=new Int32Array(owners.length);let first=0,last=0;
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
  const at=y*WIDTH+x,id=owners[at];if(id<=0){distance[at]=0;continue;}
  let edge=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=WIDTH||yy<0||yy>=HEIGHT||owners[yy*WIDTH+xx]!==id)edge=true;}
  if(edge){distance[at]=0;queue[last++]=at;}
 }
 while(first<last){const at=queue[first++],x=at%WIDTH,y=(at/WIDTH)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
  const xx=x+dx,yy=y+dy;if(xx<0||xx>=WIDTH||yy<0||yy>=HEIGHT)continue;const next=yy*WIDTH+xx;
  if(owners[next]===owners[at]&&distance[next]<0){distance[next]=distance[at]+1;queue[last++]=next;}
 }}
 const data=new Uint8Array(WIDTH*HEIGHT*4);for(let i=0;i<owners.length;i++){data[i*4]=owners[i]>0?Math.min(255,Math.max(0,distance[i])):0;data[i*4+1]=Math.max(0,owners[i]);data[i*4+3]=255;}
 const texture=new THREE.DataTexture(data,WIDTH,HEIGHT,THREE.RGBAFormat);texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
 domain={key,texture,users:1};domains.set(key,domain);return domain;
}
const FLOW_GLSL=`
uniform float uLavaTime,uLavaPhase,uLavaGlow;
uniform vec3 uLavaHotTint;
uniform sampler2D uLavaDomain;
uniform vec2 uLavaAtlasSize;
vec2 qrLavaUv;float qrLavaChart;
float qrLavaId(vec2 uv){
 if(any(lessThan(uv,vec2(0.)))||any(greaterThanEqual(uv,vec2(1.))))return 0.;
 vec2 centre=(floor(uv*uLavaAtlasSize)+.5)/uLavaAtlasSize;
 return floor(texture2D(uLavaDomain,centre).g*255.+.5);
}
float qrLavaClearance(vec2 uv){return texture2D(uLavaDomain,uv).r*255.;}
vec2 qrLavaFlow(vec2 uv){
 float id=qrLavaId(uv);if(id<.5)return uv;
 vec2 p=uv*uLavaAtlasSize;float t=uLavaTime+uLavaPhase;
 vec2 movement=vec2(sin(p.y*.085+t*1.3)+.45*sin(p.x*.14-t*.87),.7*sin(p.x*.065-t*1.1)+.35*cos(p.y*.1+t*.65));
 movement/=max(1.,length(movement));
 float room=max(0.,qrLavaClearance(uv)-2.);
 vec2 flowed=uv+movement*min(room*.5,4.5)/uLavaAtlasSize;
 return abs(qrLavaId(flowed)-id)<.5?flowed:uv;
}
bool qrLavaKnown(vec2 uv){return qrLavaChart>.5&&abs(qrLavaId(uv)-qrLavaChart)<.5&&qrLavaClearance(uv)>=1.5;}
`;
function animatedMaterial(e){
 const clone=R_CloneAliasMaterial(e.base),before=clone.onBeforeCompile,key=clone.customProgramCacheKey;
 e.uniforms={uLavaTime:{value:0},uLavaHotTint:{value:new THREE.Vector3(...LAVA_MAN.hotRadianceTint)},uLavaPhase:{value:e.phase},uLavaDomain:{value:e.domain.texture},uLavaAtlasSize:{value:new THREE.Vector2(WIDTH,HEIGHT)},uLavaGlow:{get value(){return Math.max(1,clone.color.r);}}};
 clone.onBeforeCompile=function(shader,renderer){
  before.call(this,shader,renderer);Object.assign(shader.uniforms,e.uniforms);
  // Expand only map sampling; retain the existing alias compiler's lighting,
  // Classic, material/normal and packed-height outputs. All existing UV uses in
  // main (including covariant derivatives) share one flowed coordinate.
  let fragment=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment+`
 vec3 qrLavaPigment=diffuseColor.rgb/max(uLavaGlow,1.);
 float qrLavaHot=smoothstep(.04,.24,qrLavaPigment.r-qrLavaPigment.b)*smoothstep(.08,.35,qrLavaPigment.r);
 vec3 qrLavaRadiance=mix(vec3(1.),uLavaHotTint*uLavaGlow,step(1.001,uLavaGlow));
 diffuseColor.rgb=qrLavaPigment*mix(vec3(1.),qrLavaRadiance,qrLavaHot);
`);
  fragment=fragment.replace(/\bvMapUv\b/g,'qrLavaUv').replace('#define qrLavaUv vActorUv','#define vMapUv vActorUv');
  fragment=fragment.replace('bool qrShadowKnown(vec2 uv,int layer){return all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));}',
   'bool qrShadowKnown(vec2 uv,int layer){return qrLavaKnown(uv);}');
  fragment=fragment.replace('hctx.microMaxUv=.03;', 'hctx.microMaxUv=min(.03,max(0.,qrLavaClearance(qrLavaUv)-1.5)/max(uLavaAtlasSize.x,uLavaAtlasSize.y));');
  fragment=fragment.replace('void main() {','void main() {\n qrLavaChart=qrLavaId(vMapUv);qrLavaUv=qrLavaFlow(vMapUv);');
  // R_RegisterGlow supplies the SAME live LAVA_BOOST/pulse as native lava.
  // Hot photograph pigment is calibrated against the literal native hub lava
  // in the same HDR/exposure trial. Charcoal retains its original pigment. Avoid
  // multiplying by the boost twice, and free hot wounds from baked vertex shade.
  fragment=fragment.replace('#include <opaque_fragment>', 'outgoingLight=mix(outgoingLight,qrAlbedo,qrLavaHot*step(1.001,uLavaGlow));\n#include <opaque_fragment>');
  shader.fragmentShader=FLOW_GLSL+fragment;
 };
 clone.customProgramCacheKey=function(){return key.call(this)+'-lava-skin-flow-v1';};
 R_RegisterGlow(clone,LAVA_BOOST);return clone;
}
function makeEntry(entity,mesh,p,n,base){
 const bind=topology(mesh.geometry),header=entity.model.cache?.data,domain=domainFor(header,mesh.geometry);
 const e={entity,model:entity.model,header,mesh,geometry:mesh.geometry,bind,base,domain,sourcePosition:p,sourceNormal:n,
  scene:null,seen:false,time:0,fire:null,smoke:null,assets:null,phase:((entity._entityIndex??0)>>>0)%997*.137,
  point:new Float64Array(3),direction:new Float64Array(3)};
 try{e.material=animatedMaterial(e);}catch(error){if(--domain.users===0){domain.texture.dispose();domains.delete(domain.key);}throw error;}
 entries.set(entity,e);return e;
}
/** The caller owns canonical pose/blend attributes. Texture time changes only
 * actor-local uniforms; native geometry, bounds and shadow poses stay untouched.
 */
export function R_LavaManApply(entity,mesh,p,n,time){
 let e=entries.get(entity);if(!mesh?.geometry||!p||!n)return null;
 if(R_ClassicPassActive()){if(e)hide(e);return null;}
 const base=selected(entity,mesh);
 if(e&&(e.mesh!==mesh||e.model!==entity.model||e.header!==entity.model.cache?.data||e.base!==base||e.sourcePosition.count!==p.count||e.bind.index.count!==mesh.geometry.index?.count)){
  R_LavaManRelease(entity);e=null;
 }
 if(!base||!Number.isFinite(time)||p.count!==n.count||p.count>LAVA_MAN.maxVertices){R_LavaManRelease(entity);return null;}
 try{
  if(!e){
   if(entries.size>=LAVA_MAN.maxEntities&&!entity._levelViewGhost)for(const [other,entry]of entries)if(entry.entity._levelViewGhost){R_LavaManRelease(other);break;}
   if(entries.size>=LAVA_MAN.maxEntities){overflow++;return null;}
   e=makeEntry(entity,mesh,p,n,base);
  }
  e.geometry=mesh.geometry;e.sourcePosition=p;e.sourceNormal=n;e.time=time;e.uniforms.uLavaTime.value=time;
  mesh.material=e.material;return mesh;
 }catch(error){lastError=String(error.message||error);R_LavaManRelease(entity);return null;}
}
function hide(entry){if(entry.fire){entry.fire.mesh.visible=false;entry.smoke.mesh.visible=false;}}
function destroyEffects(entry){
 for(const fx of [entry.fire,entry.smoke])if(fx){fx.mesh.removeFromParent();fx.geometry.dispose();fx.mesh.material.dispose();}
 entry.fire=null;entry.smoke=null;entry.assets=null;
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
 e.fire=layer('lavaman_fire',8,{aPosSize:4,aInfo:4},effectMaterial(TORCH_SHADERS.vertex,LAVA_FLAME_FRAGMENT,{uNoise:{value:assets.noise},uTime:{value:0},uParams:{value:new THREE.Vector4(1,1.6,1.8,0)} }),7);
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
 e.seen=true;e.seenTime=time;e.seenFrame=entity.frame;
 const assets=R_FireballAssets();
 if(!assets){destroyEffects(e);return null;}
 try{
  effects(e,assets);const p=e.sourcePosition,n=e.sourceNormal,t=time+e.phase,fire=e.fire.arrays,smoke=e.smoke.arrays;
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
export function R_LavaManPositions(){return null;} // Native geometry is always the shadow source.
export function R_LavaManBegin(scene){if(R_ClassicPassActive())return;for(const e of entries.values())if(e.scene===scene){e.seen=false;hide(e);}}
export function R_LavaManEnd(scene){if(R_ClassicPassActive())return;for(const [entity,e]of entries)if(e.scene===scene&&!e.seen)R_LavaManRelease(entity);}
export function R_LavaManRelease(entity){
 const e=entries.get(entity);if(!e)return;
 if(e.mesh.material===e.material)e.mesh.material=e.base;
 destroyEffects(e);e.material.dispose();
 if(--e.domain.users===0){e.domain.texture.dispose();domains.delete(e.domain.key);}
 entries.delete(entity);
}
export function R_LavaManClear(){for(const entity of entries.keys())R_LavaManRelease(entity);lastError=null;overflow=0;}
export function R_LavaManStatus(){return{entities:entries.size,maxEntities:LAVA_MAN.maxEntities,lastError,overflow};}

/** Current live main-scene actor heat receipts for the existing post heat pass.
 * Bounds come from canonical posed vertices; neither geometry bounds nor native
 * attributes are written. Copies prevent consumers from mutating retained state.
 */
export function R_LavaManHeatSources(){
 if(!R_IsNewer()||R_ClassicPassActive()||r_newer_enemies.value===0)return[];
 const sources=[];
 for(const e of entries.values()){
  const actor=e.entity,index=actor._entityIndex;
  if(!e.seen||e.seenTime!==cl.time||e.seenFrame!==actor.frame||actor._levelViewGhost||!e.scene?.isScene||
   !R_LavaManWanted(actor)||actor.model!==e.model||actor.model.cache?.data!==e.header||cl_entities[index]!==actor||
   actor._aliasMesh!==e.mesh||e.mesh.material!==e.material||e.mesh.geometry!==e.geometry||
   e.geometry.attributes.position!==e.sourcePosition||e.geometry.attributes.normal!==e.sourceNormal||
   (Number.isFinite(actor.health)&&actor.health<=0)||actor.dead===true||actor.deadflag>0)continue;
  const native=sv.active&&sv.worldmodel===cl.worldmodel?sv.edicts?.[index]:null;
  if(native&&(native.free||native.v.health<=0||native.v.deadflag>0))continue;
  let attached=false,visible=true;for(let node=e.mesh;node;node=node.parent){if(node.visible===false)visible=false;if(node===e.scene){attached=true;break;}}
  if(!attached||!visible)continue;
  e.heatBox??=new THREE.Box3();e.heatBox.setFromBufferAttribute(e.sourcePosition).applyMatrix4(e.mesh.matrixWorld);
  if(e.heatBox.isEmpty()||![...e.heatBox.min.toArray(),...e.heatBox.max.toArray()].every(Number.isFinite))continue;
  sources.push({min:e.heatBox.min.toArray(),max:e.heatBox.max.toArray()});
  if(sources.length===LAVA_MAN.maxEntities)break;
 }
 return sources;
}
