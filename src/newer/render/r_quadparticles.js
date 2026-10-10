/**
 * @module newer/render/r_quadparticles
 *
 * Quad Damage's particles, from the retained effect excerpt.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Nothing in the game imports it (baseline debt D9, for [44g]).
 */
// Quad-only adapter of the retained SMC effectinfo excerpt. The native pickup
// and white fire remain owned by r_powerups/r_powerupfire. No gameplay hooks.
import * as THREE from 'three';
import { COM_NewerURL } from '../../engine/common/pak.js';

export const QUAD_LAYERS = Object.freeze( [
 { count:20, type:'spark', tex:[61,61], size:[.1,.3], growth:-.05, alpha:[100,200,190], stretch:4, offset:[0,0,35], jitter:[15,15,15], velocity:[-20,-20,-20], friction:-.5 },
 { count:15, type:'spark', tex:[61,61], size:[.1,.3], growth:-.05, alpha:[100,200,210], stretch:4, offset:[0,0,35], jitter:[1,1,1], velocity:[20,20,0], friction:-.5 },
 { count:10, type:'spark', tex:[61,61], size:[.0005,.0001], growth:-5, alpha:[100,200,210], stretch:-4, offset:[0,0,35], jitter:[1,1,1], velocity:[20,20,-20], friction:.5 },
 { count:30, type:'static', tex:[0,7], size:[.1,.3], growth:-.05, alpha:[100,150,210], stretch:4, offset:[0,0,15], jitter:[1,1,14], velocity:[15,15,0], friction:20, rotate:[0,10,-20,20] }
] );
// Donor countabsolute is per trail invocation. Use a fixed 60 Hz reference,
// independent of render FPS, with enough cyclic slots for maximum alpha life.
const BATCHES=64, HZ=60, PERIOD=BATCHES/HZ;
const VERTEX=`
#include <clipping_planes_pars_vertex>
attribute vec3 aOrigin,aVelocity,aTint;
attribute vec4 aLife,aMotion;
attribute vec2 aPhase;
attribute float aTile;
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
void main(){
 float age=mod(uTime-aPhase.x+${PERIOD.toFixed(9)},${PERIOD.toFixed(9)});
 float f=1.-aMotion.x/${HZ.toFixed(1)};
 float ticks=floor(age*${HZ.toFixed(1)}),fraction=fract(age*${HZ.toFixed(1)});
 float decay=pow(f,ticks);
 float travel=abs(aMotion.x)<.00001?age:f*(1.-decay)/aMotion.x+fraction*decay*f/${HZ.toFixed(1)};
 vec3 velocity=aVelocity*decay;
 vec4 p=modelViewMatrix*vec4(aOrigin+aVelocity*travel,1.);
 float scale=length(modelMatrix[0].xyz);
 float size=max(0.,aLife.x+aLife.y*age)*scale;
 float angle=radians(aMotion.z+aMotion.w*age);
 vec2 corner=position.xy;
 if(aPhase.y>.5){
  vec3 direction=length(velocity)>.00001?normalize(velocity):vec3(0.,0.,1.);
  float extent=max(aMotion.y*.04*length(velocity),size*.5/max(scale,.00001));
  vec3 viewDirection=(modelViewMatrix*vec4(direction,0.)).xyz;
  vec2 side=vec2(-viewDirection.y,viewDirection.x);
  side=length(side)>.00001?normalize(side):vec2(1.,0.);
  p.xyz+=viewDirection*corner.y*extent;
  p.xy+=side*corner.x*size;
 }else{
  vec2 q=vec2(corner.x*aMotion.y,corner.y);
  p.xy+=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*q*size;
 }
 vec4 mvPosition=p;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*p;
 // One-pixel inset preserves the donor sampler's tile-edge convention.
 vUv=vec2((aTile*128.+1.+uv.x*126.)/1152.,(1.+uv.y*126.)/128.);
 vTint=aTint;
 vAlpha=size>0.?max(0.,aLife.z-aLife.w*age)/256.:0.;
}`;
const FRAGMENT=`
#include <clipping_planes_pars_fragment>
uniform sampler2D uAtlas;
uniform float uReady;
varying vec2 vUv;
varying vec3 vTint;
varying float vAlpha;
layout(location=1) out highp vec4 gNormal;
layout(location=2) out highp vec4 gAlbedo;
layout(location=3) out highp vec4 gHeightMask;
void main(){
 #include <clipping_planes_fragment>
 vec4 texel=texture2D(uAtlas,vUv);
 float alpha=texel.a*vAlpha*uReady;
 if(alpha<.0001)discard;
 gl_FragColor=vec4(texel.rgb*vTint,alpha);
 // Emission cannot overwrite opaque receiver packets in the HDR MRT.
 gNormal=vec4(0.);gAlbedo=vec4(0.);gHeightMask=vec4(0.);
}`;
function randomGenerator(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function sphere(random){let x,y,z;do{x=random()*2-1;y=random()*2-1;z=random()*2-1;}while(x*x+y*y+z*z>1);return [x,y,z];}
export function R_CreateQuadParticles( localCenter, seed=1 ) {
 const geometry=new THREE.InstancedBufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));geometry.setIndex([0,1,2,0,2,3]);
 const data={aOrigin:[],aVelocity:[],aTint:[],aLife:[],aMotion:[],aPhase:[],aTile:[]},random=randomGenerator(seed),lerp=(a,b)=>a+(b-a)*random();
 for(let batch=0;batch<BATCHES;batch++)for(const l of QUAD_LAYERS)for(let i=0;i<l.count;i++){
  const origin=sphere(random),velocity=sphere(random),mix=random();
  data.aOrigin.push(...origin.map((v,k)=>v*l.jitter[k]+l.offset[k]-localCenter.getComponent(k)));
  data.aVelocity.push(...velocity.map((v,k)=>v*l.velocity[k]));
  data.aTint.push((98*(1-mix))/255,(157*(1-mix)+24*mix)/255,1);
  data.aLife.push(lerp(...l.size),l.growth,lerp(l.alpha[0],l.alpha[1]),l.alpha[2]);
  data.aMotion.push(l.friction,l.stretch,l.rotate?lerp(l.rotate[0],l.rotate[1]):0,l.rotate?lerp(l.rotate[2],l.rotate[3]):0);
  data.aPhase.push(batch/HZ,l.type==='spark'?1:0);
  data.aTile.push(l.tex[0]===61?8:Math.floor(random()*7));
 }
 for(const [name,size]of Object.entries({aOrigin:3,aVelocity:3,aTint:3,aLife:4,aMotion:4,aPhase:2,aTile:1}))geometry.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(data[name]),size));
 geometry.instanceCount=data.aTile.length;
 const empty=new THREE.DataTexture(new Uint8Array(4),1,1);empty.needsUpdate=true;
 const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uMode:{value:0},uPulse:{value:1},uAtlas:{value:empty},uReady:{value:0}},vertexShader:VERTEX,fragmentShader:FRAGMENT,
  transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false,clipping:true});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='powerup_quad_sparks';mesh.userData.newerOnly=true;mesh.frustumCulled=false;mesh.renderOrder=2;
 let disposed=false,atlas=null;
 // Texture is per-record owned. A delayed load cannot resurrect a retired item.
 if(typeof document!=='undefined'){
  atlas=new THREE.TextureLoader().load(COM_NewerURL('newer/effects/quad/quad-particles.png',new URL('../../../newer/effects/quad/quad-particles.png',import.meta.url).href),texture=>{
   if(disposed)return;
   texture.colorSpace=THREE.NoColorSpace;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.LinearFilter;
   material.uniforms.uAtlas.value=texture;material.uniforms.uReady.value=1;
  },undefined,()=>{if(!disposed)console.warn('Quad particle atlas unavailable; white flame and blue light remain active.');});
 }
 material.addEventListener('dispose',()=>{disposed=true;empty.dispose();atlas?.dispose();});
 return mesh;
}
