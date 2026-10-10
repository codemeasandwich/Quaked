/**
 * @module newer/render/r_rendveil
 *
 * Rend the Veil's picture: the arrival rite drawn on the native monster mesh.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `pool`, `background`, `capturing`, `frames`; 1 module-level
 * collection (Map/Set).
 *
 * Errors: throws at 1 place; catches at 1 place.
 */
// Rend the Veil binds the EXISTING native alias mesh. The server owns the hold;
// no render callback activates, relocates, damages or creates a game entity.
import * as THREE from 'three';
import { R_IsNewer } from './r_anim.js';
import { PROFILE } from './rend_veil/config.js';
import { sampleRendVeil } from './rend_veil/timeline.js';
import { createLocalEffectPool } from './rend_veil/local-effects.js';
import { bindThreeSubject, RV_REVEAL_DECL, RV_REVEAL_VERTEX, RV_SURFACE_DECL, RV_VERTEX_BIND, RV_FRAGMENT_MASK } from './rend_veil/material-binding.js';
import { makeEffectFrame } from './rend_veil/frame.js';

const entries=new Map();
let pool=null,background=null,capturing=false,frames=new WeakMap();
const size=new THREE.Vector2();

// Rune layers preserve receiver packets. Ink also darkens receiver albedo RGB,
// while separate alpha blending preserves depth, visibility and class metadata.
// Three's GLSL3 adapter supplies location zero.
function nativeMRT(material){
 if(material.userData.rendVeilMRT)return;
 material.userData.rendVeilMRT=true;
 const rune=material.fragmentShader.includes('varying float vAlpha');
 if(!rune){
  // Ink must darken deferred albedo too. Preserve alpha metadata (receiver
  // classes and signed depth) separately while blending colour normally.
  material.blending=THREE.CustomBlending;material.blendEquation=THREE.AddEquation;
  material.blendSrc=THREE.SrcAlphaFactor;material.blendDst=THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha=THREE.AddEquation;material.blendSrcAlpha=THREE.ZeroFactor;material.blendDstAlpha=THREE.OneFactor;
  const last=material.fragmentShader.lastIndexOf('}');
  const coverage=material.fragmentShader.includes('uniform sampler2D uSeal')?'gl_FragColor.a*(1.-marks.g)':'gl_FragColor.a';
  material.fragmentShader=material.fragmentShader.slice(0,last)+'rvAlbedo.a=clamp('+coverage+',0.,1.);'+material.fragmentShader.slice(last);
 }

 material.fragmentShader='layout(location=1) out vec4 rvReceiver;\nlayout(location=2) out vec4 rvAlbedo;\nlayout(location=3) out vec4 rvReceiverExtra;\n'+material.fragmentShader.replace(/void main\(\)\s*\{/,'void main(){rvReceiver=vec4(0.);rvAlbedo=vec4(0.);rvReceiverExtra=vec4(0.);');
 material.needsUpdate=true;
}

export function R_RendVeilRelease(entity){
 const e=entries.get(entity);if(!e)return;
 e.binding.dispose();pool.release(e.local);entries.delete(entity);
}
export function R_RendVeilClear(){
 for(const entity of [...entries.keys()])R_RendVeilRelease(entity);
 pool?.dispose();pool=null;background?.dispose();background=null;frames=new WeakMap();
}
export function R_RendVeilBegin(scene){
 for(const e of entries.values()){
  if(e.scene===scene){e.seen=false;e.local.group.visible=false;e.binding.hideGhosts();}
 }
 if(!R_IsNewer())R_RendVeilClear();
}
export function R_RendVeilEnd(scene){
 for(const [entity,e] of entries){
  if(e.scene===scene&&!e.seen)R_RendVeilRelease(entity);
 }
}

export function R_RendVeilSeen(entity,mesh,scene){
 const record=entity?._rendVeil,time=entity?._rendVeilTime;
 if(!R_IsNewer()||!record||record.model!==entity.model?.name||!Number.isFinite(time)){
  R_RendVeilRelease(entity);return;
 }
 const state=sampleRendVeil(time-record.start);
 if(state.complete||state.pending){R_RendVeilRelease(entity);return;}
 let entry=entries.get(entity);
 if(entry&&(entry.record!==record||entry.start!==record.start||entry.mesh!==mesh||entry.scene!==scene||!entry.binding.acceptsMaterial(mesh.material))){
  R_RendVeilRelease(entity);entry=null;
 }
 if(!entry){
  mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;
  const height=Math.max(1,b.max.z-b.min.z),foot=new THREE.Vector3((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,b.min.z);
  mesh.updateWorldMatrix(true,false);foot.applyMatrix4(mesh.matrixWorld);
  const arrival=new THREE.Vector3(...record.origin);
  if(mesh.parent)arrival.applyMatrix4(mesh.parent.matrixWorld);
  foot.add(arrival.sub(mesh.getWorldPosition(new THREE.Vector3())));
  const up=new THREE.Vector3(0,0,1).applyQuaternion(mesh.quaternion),forward=new THREE.Vector3(1,0,0).applyQuaternion(mesh.quaternion);
  const cached=frames.get(entity);
  const bodyFrame=cached?.record===record?cached.frame:makeEffectFrame(THREE,{origin:foot.toArray(),up:up.toArray(),forward:forward.toArray(),height});
  frames.set(entity,{record,frame:bodyFrame});
  // Owner: the rite is twice the incoming model's size. The actual body,
  // reconstruction and matching shadows retain their original model frame.
  const frame=bodyFrame.clone().scale(new THREE.Vector3(2,2,2));
  if(Number.isFinite(record.floorZ)){
   // Model triangles can extend below their collision hull. Anchor the ground
   // seal to actual support instead of burying it at the mesh's lowest vertex.
   const ground=new THREE.Vector3(record.origin[0],record.origin[1],record.floorZ);
   if(mesh.parent)ground.applyMatrix4(mesh.parent.matrixWorld);
   frame.elements[14]=ground.z;
  }
  const unit=new THREE.Vector3().setFromMatrixColumn(frame,0).length();
  pool ||= createLocalEffectPool(THREE);
  const local=pool.acquire(4817);local.light.distance=4.2*unit;local.group.matrix.copy(frame);local.group.matrixWorldNeedsUpdate=true;
  local.energy.uniforms.uUnitScale.value=unit;
  local.group.traverse(o=>{if(o.material)nativeMRT(o.material);o.frustumCulled=false;});scene.add(local.group);
  // Fit the native model's entire posed surface to the authored radial
  // reveal domain. Height-only normalization leaves long monsters outside
  // radius 2.55 and makes those sections pop when progress finally reaches 1.
  const revealFromBody=new THREE.Matrix4();
  let binding;
  try{binding=bindThreeSubject({THREE,subject:mesh,scene,effectFrame:bodyFrame,revealFromBody});}
  catch(error){pool.release(local);throw error;}
  entry={entity,record,mesh,scene,start:record.start,frame,bodyFrame,revealFromBody,bodyToReference:bodyFrame.clone().invert(),toReference:frame.clone().invert(),scale:unit,local,binding,state,seen:true};
  entries.set(entity,entry);
 }
 entry.seen=true;entry.state=state;
 const positions=mesh.geometry.getAttribute('position');
 if(entry.fitPositions!==positions||entry.fitVersion!==positions.version){
  mesh.updateWorldMatrix(true,false);
  const centre=new THREE.Vector3(0,2.3,0),bodyFromModel=new THREE.Matrix4().multiplyMatrices(entry.bodyToReference,mesh.matrixWorld),point=new THREE.Vector3();let radius=0;
  for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(bodyFromModel);radius=Math.max(radius,point.distanceTo(centre));}
  const fit=Math.min(1,2.55/Math.max(.001,radius));
  entry.revealFromBody.makeTranslation(0,2.3,0).multiply(new THREE.Matrix4().makeScale(fit,fit,fit)).multiply(new THREE.Matrix4().makeTranslation(0,-2.3,0));
  entry.binding.setRevealFit(entry.revealFromBody);entry.fitPositions=positions;entry.fitVersion=positions.version;
 }
 entry.binding.setState(state);entry.local.update(state,Math.max(1,size.x),Math.max(1,size.y));
 entry.local.light.intensity*=.12; // Non-rune radiance is subdued; rune materials are independent.
}

export function R_RendVeilFields(){
 return [...entries.values()].filter(e=>e.seen&&e.local.group.visible&&!e.entity._rendVeilSnapshot).map(e=>({
  center:new THREE.Vector3(0,2.35,0).applyMatrix4(e.frame),scale:e.scale,state:e.state,
  toReference:e.toReference,subjectBounds:e.binding.getEffectBounds().applyMatrix4(new THREE.Matrix4().multiplyMatrices(e.toReference,e.bodyFrame))
 }));
}
// The host uses deferred alias receivers, so the reference's ordinary
// Three light enters the existing native selection/shadow path. Stable source
// identity belongs to this invocation; it never consumes a cl_dlights slot.
export function R_RendVeilLights(){
 const lights=[];
 for(const e of entries.values()){
  if(!e.seen||e.entity._rendVeilSnapshot||!e.local.group.visible||e.local.light.intensity<=.001)continue;
  const light=e.nativeLight ||= {origin:[0,0,0],color:[.54,.29,.74],power:0,radius:1,range:1,rendVeil:true};
  e.local.light.getWorldPosition(new THREE.Vector3()).toArray(light.origin);
  light.power=e.local.light.intensity/5; // native LIGHT_GAIN=5; source radiance once
  light.range=e.local.light.distance;lights.push(light);
 }
 return lights;
}
export function R_RendVeilBackgroundDepth(){return background?.depthTexture||null;}

// Capture the same native environment with arriving subjects/VFX hidden. This
// gives the bounded optical pass a receiver depth without sampling its own body.
export function R_RendVeilCapture(renderer,scene,camera){
 const active=[...entries.values()].filter(e=>e.seen&&e.scene===scene&&e.local.group.visible);
 if(capturing||!active.length)return;
 const target=renderer.getRenderTarget();if(!target?.depthTexture)return;
 size.set(target.width,target.height);
 if(!background||background.width!==target.width||background.height!==target.height){
  background?.dispose();background=new THREE.WebGLRenderTarget(target.width,target.height,{count:target.textures.length,type:THREE.HalfFloatType,depthBuffer:true});
  background.depthTexture=new THREE.DepthTexture(target.width,target.height,THREE.UnsignedIntType);
  target.textures.forEach((t,i)=>{background.textures[i].type=t.type;background.textures[i].format=t.format;background.textures[i].internalFormat=t.internalFormat;background.textures[i].minFilter=t.minFilter;background.textures[i].magFilter=t.magFilter;});
 }
 const saved={auto:renderer.autoClear,viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),test:renderer.getScissorTest(),face:renderer.getActiveCubeFace(),mip:renderer.getActiveMipmapLevel()};
 const hidden=[];const hide=o=>{if(!o)return;hidden.push([o,o.visible]);o.visible=false;};
 capturing=true;
 try{
  for(const e of active){hide(e.mesh);hide(e.local.group);e.binding.forEachGhost(hide);}
  renderer.setRenderTarget(background);renderer.setScissorTest(false);renderer.autoClear=true;renderer.render(scene,camera);
 }finally{
  for(const [o,visible] of hidden)o.visible=visible;
  // Restore logical default-framebuffer state before rebinding the physical
  // HDR target. Reversing this order crops the main draw at DPR/dynamic scale.
  renderer.setViewport(saved.viewport);renderer.setScissor(saved.scissor);renderer.setScissorTest(saved.test);renderer.setRenderTarget(target,saved.face,saved.mip);renderer.autoClear=saved.auto;capturing=false;
 }
}

// Existing atlas shaders call these hooks; their radial/packed-depth outputs
// remain unchanged. The same canonical reveal and surface displacement cast.
export function R_RendVeilShadowShader(shader){
 const uniforms={uRVTime:{value:0},uRVProgress:{value:1},uRVSurfaceEffect:{value:0},uRVFormation:{value:0},uRVConverge:{value:1},uRVGhost:{value:-1},uRVMagic:{value:new THREE.Color(.54,.29,.74)},uRVEffectFromModel:{value:new THREE.Matrix4()},uRVModelFromEffect:{value:new THREE.Matrix4()},uRVRevealFromBody:{value:new THREE.Matrix4()}};
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader=RV_SURFACE_DECL+RV_REVEAL_DECL+'\n'+shader.vertexShader;
 if(shader.vertexShader.includes('#include <project_vertex>'))shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',RV_VERTEX_BIND+RV_REVEAL_VERTEX+'\n#include <project_vertex>');
 else if(shader.vertexShader.includes('vec4 local=vec4(position,1.);'))shader.vertexShader=shader.vertexShader.replace('vec4 local=vec4(position,1.);','vec3 transformed=position;\n'+RV_VERTEX_BIND+RV_REVEAL_VERTEX+'\nvec4 local=vec4(transformed,1.);');
 else shader.vertexShader=shader.vertexShader.replace('vec4 world = modelMatrix * vec4( position, 1.0 );','vec3 transformed=position;\n'+RV_VERTEX_BIND+RV_REVEAL_VERTEX+'\nvec4 world = modelMatrix * vec4( transformed, 1.0 );');
 shader.fragmentShader=RV_SURFACE_DECL+'\n'+shader.fragmentShader.replace(/void main\(\)\s*\{/,'void main(){\n'+RV_FRAGMENT_MASK);
 return uniforms;
}
export function R_RendVeilShadowObject(mesh,uniforms){
 if(!uniforms)return;
 const entry=entries.get(mesh?._quakeOwner||mesh?.userData?.rendVeilSource?._quakeOwner);
 uniforms.uRVProgress.value=entry?.seen?entry.state.progress:1;
 uniforms.uRVSurfaceEffect.value=entry?.seen?entry.state.surfaceEffect:0;
 uniforms.uRVTime.value=entry?.state.t||0;
 if(!entry){uniforms.uRVEffectFromModel.value.identity();uniforms.uRVModelFromEffect.value.identity();uniforms.uRVRevealFromBody.value.identity();}
 if(entry){uniforms.uRVRevealFromBody.value.copy(entry.revealFromBody);uniforms.uRVEffectFromModel.value.multiplyMatrices(entry.bodyToReference,mesh.matrixWorld);uniforms.uRVModelFromEffect.value.copy(uniforms.uRVEffectFromModel.value).invert();}
}
export function R_RendVeilShadowVersion(mesh){const e=entries.get(mesh?._quakeOwner);return e?.seen&&e.state.t<2.5?e.state.t:0;}
export function R_RendVeilDiagnostics(){return {active:entries.size,pooled:pool?.allocated||0,states:[...entries.values()].map(e=>({model:e.entity.model?.name,start:e.start,phase:e.state.phase,age:e.state.t,progress:e.state.progress,focused:e.state.focused,scale:e.scale,center:new THREE.Vector3(0,2.35,0).applyMatrix4(e.frame).toArray(),restored:e.binding.restored}))};}
