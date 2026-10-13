/**
 * Remote Ring presentation. Reuses the parked cloak submission/shared-target
 * architecture; faithfully draws the supplied mesh shader with animated MDL UVs.
 * No gameplay or network entity mutation. Secondary views retain native eyes.
 */
import * as THREE from 'three';
import { cvar_t, Cvar_FindVar, Cvar_RegisterVariable } from '../../engine/common/cvar.js';
import { R_DrawAliasModel } from '../../engine/render/gl_mesh.js';
import { PowerVisionMode } from '../gameplay/powervision_state.js';
import { cl, cl_entities } from '../../engine/client/client.js';
import { IT_QUAD, STAT_HEALTH } from '../../engine/common/quakedef.js';
import { CLOAK_REFERENCE_FRAGMENT } from './cloak_reference.js';
export const r_cloak = new cvar_t('r_cloak','1',true);
if(!Cvar_FindVar(r_cloak.name))Cvar_RegisterVariable(r_cloak);
// Reference operative height ~2.7 units; native upright player ~64 units.
export const CLOAK = Object.freeze({strength:1.6,shimmer:1,chroma:1,worldScale:1/24});
export const CLOAK_VERTEX = `
out vec3 vWorld,vNormal,vColor;out vec2 vUV;flat out int vMaterial;
void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;
vNormal=normalize(mat3(modelMatrix)*normal);vUV=uv;vColor=vec3(1.);vMaterial=0;
gl_Position=projectionMatrix*viewMatrix*p;}`;
// Optical coefficients/UV noise/time/Fresnel/chroma stay verbatim. Extra guards
// enforce the engine's world/held depth and bounded foreground-safe sampling.
const GUARDS = `
uniform sampler2D tWorldDepth,tNormal;uniform float uWorldScale;
vec3 cloakLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec2 cloakSample(vec2 p,vec2 screen){
 p=clamp(p,vec2(.002),vec2(.998));
 if(texture(tWorldDepth,p).r+0.000001<gl_FragCoord.z || texture(tNormal,p).a<-.5)return screen;
 return p;
}
`;
export const CLOAK_FRAGMENT = GUARDS + CLOAK_REFERENCE_FRAGMENT
 .replace('void main(){','void main(){vec2 raw=gl_FragCoord.xy/uResolution;if(texture(tWorldDepth,raw).r+0.000001<gl_FragCoord.z||texture(tNormal,raw).a<-.5)discard;')
 .replace('7./length(uEye-vWorld)','7./(length(uEye-vWorld)*uWorldScale)')
 .replace('vec2 uv=clamp(screen+off,vec2(.002),vec2(.998)),split=off*.24*uParams.z;',`float border=min(min(screen.x,1.-screen.x),min(screen.y,1.-screen.y));off*=smoothstep(.002,.025,border);vec2 uv=cloakSample(screen+off,screen),split=off*.24*uParams.z;`)
 .replace('clamp(uv+split,.002,.998)','cloakSample(uv+split,screen)')
 .replace('clamp(uv-split,.002,.998)','cloakSample(uv-split,screen)')
 .replace('c+=vec3(.035,.085,.083)','c+=cloakLinear(vec3(.035,.085,.083))');

let noise=null,pending=null,failed=false,generation=0,target=null,material=null,copy=null;
const submissions=[],subjects=[],hidden=[],proxies=new Map();
let revealTarget=null,revealMaterial=null;
const clearColour=new THREE.Color(),savedViewport=new THREE.Vector4(),savedScissor=new THREE.Vector4();
const copyScene=new THREE.Scene(),copyCamera=new THREE.Camera();
let copyMesh=null,world=null;
/** Start one bounded load; late completion after reset is disposed, never installed. */
export function R_CloakReady(){
 if(noise)return true;
 if(!pending&&!failed&&typeof document!=='undefined'){
  const epoch=generation;
  pending=new THREE.TextureLoader().load(new URL('./assets/operative-cloak-noise.png',import.meta.url).href,t=>{
   if(epoch!==generation){t.dispose();return;}
   t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=t.magFilter=THREE.LinearFilter;
   t.generateMipmaps=false;t.flipY=true;t.colorSpace=THREE.NoColorSpace;noise=t;pending=null;
  },undefined,()=>{if(epoch===generation){pending?.dispose();pending=null;failed=true;}});
 }
 return false;
}
export function R_CloakStatus(){return {ready:!!noise,loading:!!pending,failed,generation,proxies:proxies.size,submitted:submissions.length,subjects:subjects.length,reveal:!!revealTarget,target:target?{width:target.width,height:target.height}:null};}
export function R_CloakSubmit(mesh){if(mesh&&submissions.length<32&&!submissions.includes(mesh))submissions.push(mesh);}
/** Current received remote player silhouettes, borrowed by existing power vision. */
export function R_CloakSubjects(){return subjects;}
/** Ask before HDR admission; an unused cloak option must not force a full post frame. */
export function R_CloakWanted(){
 if(r_cloak.value===0)return false;
 for(let slot=1;slot<=cl.maxclients;slot++){
  const e=cl_entities[slot];
  if(slot!==cl.viewentity&&e?.model?.name==='progs/eyes.mdl'&&Number.isInteger(e.cloakBodyFrame)&&e.cloakBodyFrame>=0)return true;
 }
 return false;
}
export function R_CloakPending(){return r_cloak.value!==0&&!!noise&&submissions.length>0;}
export function R_CloakRestore(){for(let i=0;i<hidden.length;i+=2)hidden[i].visible=hidden[i+1];hidden.length=0;}
function release(entry){entry.proxy._aliasGeo?.dispose();entry.proxy._playerMaterial?.dispose();}
// Alias templates share GPU attributes with ordinary players. A disposable
// cloak geometry must own its buffers, including during unblended poses.
const ownedNames=['position','normal','uv'];
function ownAttributes(entry,geometry){
 for(const name of ownedNames){
  const source=geometry.getAttribute(name);if(!source)continue;
  let owned=entry.attributes[name];
  if(!owned||owned.array.length!==source.array.length){owned=new THREE.BufferAttribute(new source.array.constructor(source.array),source.itemSize,source.normalized);entry.attributes[name]=owned;}
  else if(source!==owned){owned.array.set(source.array);owned.needsUpdate=true;}
  geometry.setAttribute(name,owned);
 }
}

/** Current visible remote player slots only. Native model/frame/colour are read-only. */
export function R_CloakFrame(renderer,client,entities,count,enabled){
 R_CloakRestore();submissions.length=0;subjects.length=0;
 const unseen=!!client.stats&&PowerVisionMode(client,enabled)===1, quad=enabled&&client.stats?.[STAT_HEALTH]>0&&!client.intermission&&!!(client.items&IT_QUAD);
 if(!enabled||!renderer?.capabilities?.isWebGL2||(r_cloak.value===0&&!unseen&&!quad)){R_CloakReset();return;}
 if(world!==client.worldmodel){R_CloakReset();world=client.worldmodel;}
 for(const entry of proxies.values())entry.seen=false;
 const body=client.model_precache?.find(m=>m?.name==='progs/player.mdl');
 for(let i=0;i<count;i++){
  const e=entities[i],slot=e?._entityIndex;
  if(!Number.isInteger(slot)||slot<1||slot>client.maxclients||slot===client.viewentity||
   e.model?.name!=='progs/eyes.mdl'||!Number.isInteger(e.cloakBodyFrame)||e.cloakBodyFrame<0||
   !body?.cache?.data?.posedata||e.cloakBodyFrame>=body.cache.data.numframes)continue;
  const optical=r_cloak.value!==0&&R_CloakReady();
  if(!optical&&!unseen&&!quad)continue;
  let entry=proxies.get(slot);
  if(entry&&(entry.entity!==e||entry.proxy.model!==body)){release(entry);proxies.delete(slot);entry=null;}
  if(!entry){entry={entity:e,seen:true,attributes:{},proxy:{model:body,frame:0,skinnum:0,syncbase:0,origin:new Float32Array(3),angles:new Float32Array(3)}};proxies.set(slot,entry);}
  entry.seen=true;const proxy=entry.proxy;proxy.frame=e.cloakBodyFrame;proxy.skinnum=e.skinnum;proxy.syncbase=e.syncbase||0;proxy.origin.set(e.origin);proxy.angles.set(e.angles);
  const mesh=R_DrawAliasModel(proxy,body.cache.data,null);if(!mesh)continue;
  ownAttributes(entry,mesh.geometry);
  mesh.frustumCulled=false;mesh.updateMatrixWorld(true);subjects.push(mesh);
  if(optical&&!unseen)R_CloakSubmit(mesh);
  if((optical||unseen)&&e._aliasMesh){hidden.push(e._aliasMesh,e._aliasMesh.visible);e._aliasMesh.visible=false;}
 }
 for(const [slot,entry] of proxies)if(!entry.seen){release(entry);proxies.delete(slot);}
}
function resources(width,height){
 if(!material)material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:CLOAK_VERTEX,fragmentShader:CLOAK_FRAGMENT,
  uniforms:{uScene:{value:null},uNoise:{value:noise},uEye:{value:new THREE.Vector3()},uView:{value:new THREE.Matrix4()},uResolution:{value:new THREE.Vector2()},uParams:{value:new THREE.Vector4(CLOAK.strength,CLOAK.shimmer,CLOAK.chroma,1)},uTime:{value:0},uWorldScale:{value:CLOAK.worldScale},tWorldDepth:{value:null},tNormal:{value:null}},side:THREE.FrontSide,depthTest:true,depthWrite:true,blending:THREE.NoBlending,toneMapped:false});
 if(!copy){copy=new THREE.ShaderMaterial({uniforms:{tScene:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}',fragmentShader:'uniform sampler2D tScene;varying vec2 vUv;void main(){gl_FragColor=texture2D(tScene,vUv);}',depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});copyMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),copy);copyMesh.frustumCulled=false;copyScene.add(copyMesh);}
 if(!target||target.width!==width||target.height!==height){target?.dispose();target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:true,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});}
}
/** Input colour is completed and immutable. Nearest cloak wins; no recursive refraction. */
export function R_CloakRender(renderer,input,depth,normal,camera,time,width,height){
 if(!R_CloakPending()||!depth||!normal){submissions.length=0;return input;}
 width=width||input.image?.width;height=height||input.image?.height;
 if(!width||!height){submissions.length=0;return input;}
 resources(width,height);
 const u=material.uniforms;u.uScene.value=input;u.uNoise.value=noise;u.tWorldDepth.value=depth;u.tNormal.value=normal;u.uResolution.value.set(width,height);u.uEye.value.setFromMatrixPosition(camera.matrixWorld);u.uView.value.copy(camera.matrixWorldInverse);u.uTime.value=time;
 const previous=renderer.getRenderTarget(),auto=renderer.autoClear,alpha=renderer.getClearAlpha(),scissor=renderer.getScissorTest();
 renderer.getClearColor(clearColour);renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
 try{
  renderer.setRenderTarget(target);renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear(true,true,false);renderer.autoClear=false;
  copy.uniforms.tScene.value=input;renderer.render(copyScene,copyCamera);
  for(const mesh of submissions){const old=mesh.material,visible=mesh.visible;try{mesh.material=material;mesh.visible=true;renderer.render(mesh,camera);}finally{mesh.material=old;mesh.visible=visible;}}
  return target.texture;
 }finally{
  submissions.length=0;renderer.autoClear=auto;renderer.setClearColor(clearColour,alpha);renderer.setRenderTarget(previous);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(scissor);
 }
}
/** Called on disconnect, map/context reset, mode disable and renderer shutdown. */
export function R_CloakReset(){
 R_CloakRestore();submissions.length=0;subjects.length=0;
 for(const entry of proxies.values())release(entry);proxies.clear();world=null;
 R_CloakRevealReset();
 if(noise||pending||target||material||copy||failed){generation++;noise?.dispose();pending?.dispose();noise=pending=null;target?.dispose();target=null;material?.dispose();material=null;copy?.dispose();copy=null;copyMesh?.geometry.dispose();if(copyMesh)copyScene.remove(copyMesh);copyMesh=null;}
 failed=false;
}

/** Depth-tested Unseen subject data, reusing the same animated body silhouettes.
 * RGB is encoded view normal; A is positive view depth. Never enters a world,
 * shadow or probe scene. No completed colour is copied or re-lit in this pass.
 */
export function R_CloakRevealReset(){revealTarget?.dispose();revealTarget=null;revealMaterial?.dispose();revealMaterial=null;}
export function R_CloakReveal(renderer,hdr,camera){
 if(!subjects.length){R_CloakRevealReset();return null;}
 if(!revealTarget||revealTarget.width!==hdr.width||revealTarget.height!==hdr.height){revealTarget?.dispose();revealTarget=new THREE.WebGLRenderTarget(hdr.width,hdr.height,{type:THREE.HalfFloatType,depthBuffer:true,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});}
 if(!revealMaterial)revealMaterial=new THREE.ShaderMaterial({
  uniforms:{tDepth:{value:null},tNormal:{value:null},uSize:{value:new THREE.Vector2()}},
  vertexShader:'varying vec3 normalV;varying float depthV;void main(){vec4 p=modelViewMatrix*vec4(position,1.);normalV=normalize(normalMatrix*normal);depthV=-p.z;gl_Position=projectionMatrix*p;}',
  fragmentShader:'uniform sampler2D tDepth,tNormal;uniform vec2 uSize;varying vec3 normalV;varying float depthV;void main(){vec2 uv=gl_FragCoord.xy/uSize;if(gl_FragCoord.z>texture2D(tDepth,uv).r+.000001||texture2D(tNormal,uv).a<-.5)discard;gl_FragColor=vec4(normalize(normalV)*.5+.5,depthV);}',
  side:THREE.FrontSide,depthTest:true,depthWrite:true,blending:THREE.NoBlending,toneMapped:false});
 revealMaterial.uniforms.tDepth.value=hdr.depthTexture;revealMaterial.uniforms.tNormal.value=hdr.textures[1];revealMaterial.uniforms.uSize.value.set(hdr.width,hdr.height);
 const previous=renderer.getRenderTarget(),auto=renderer.autoClear,alpha=renderer.getClearAlpha(),scissor=renderer.getScissorTest();
 renderer.getClearColor(clearColour);renderer.getViewport(savedViewport);renderer.getScissor(savedScissor);
 try{
  renderer.setRenderTarget(revealTarget);renderer.setViewport(0,0,hdr.width,hdr.height);renderer.setScissorTest(false);renderer.setClearColor(0,0);renderer.clear(true,true,false);renderer.autoClear=false;
  for(const mesh of subjects){const old=mesh.material,visible=mesh.visible;try{mesh.material=revealMaterial;mesh.visible=true;renderer.render(mesh,camera);}finally{mesh.material=old;mesh.visible=visible;}}
  return revealTarget.texture;
 }finally{renderer.autoClear=auto;renderer.setClearColor(clearColour,alpha);renderer.setRenderTarget(previous);renderer.setViewport(savedViewport);renderer.setScissor(savedScissor);renderer.setScissorTest(scissor);}
}
