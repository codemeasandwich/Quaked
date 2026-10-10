/**
 * @module newer/render/r_powerupfire
 *
 * The fire around power-up pickups, as a volume clipped by the world.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `emissionTarget`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Geometry-seeded volumetric fire. The box is only a ray-march bound, never a
// painted flame surface. Native glyphs and opaque world depth clip the volume.
import * as THREE from 'three';

export const POWERUP_FIRE_LAYER = 5;
export const POWERUP_FIRE_STEPS = 40;
const FIELD_SIZE = 96;
const VERTEX = `
varying vec3 vLocal;
varying vec3 vRayOrigin;
uniform mat4 uViewToLocal;
uniform float uOrthographic;
void main(){
 vLocal=position;
 vec4 p=modelViewMatrix*vec4(position,1.);
 vRayOrigin=uOrthographic>.5?(uViewToLocal*vec4(p.xy,0.,1.)).xyz:(uViewToLocal*vec4(0.,0.,0.,1.)).xyz;
 gl_Position=projectionMatrix*p;
}`;
const FRAGMENT = `
varying vec3 vLocal;
varying vec3 vRayOrigin;
uniform sampler2D uOpaqueDepth;
uniform sampler2D uEmitterDistance;
uniform sampler2D uGlyphPlanes;
uniform int uGlyphPlaneCount;
uniform vec4 uFieldBounds;
uniform vec2 uNativeX;
uniform vec3 uBoxMin;
uniform vec3 uBoxMax;
uniform vec3 uColor;
uniform vec2 uResolution;
uniform mat4 uProjectionInverse;
uniform mat4 uViewToLocal;
uniform float uTime;
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float flowNoise(vec3 p){return .68*noise3(p)+.32*noise3(p*2.03+vec3(9.1,-3.7,7.3));}
vec2 glyphInterval(vec3 origin,vec3 ray){
 float enter=0.,leave=1e20;
 for(int i=0;i<uGlyphPlaneCount;i++){
  vec4 plane=texelFetch(uGlyphPlanes,ivec2(i,0),0);
  float d=dot(plane.xyz,origin)+plane.w,s=dot(plane.xyz,ray);
  if(abs(s)<.000001){if(d<0.)return vec2(1.,-1.);}
  else{float t=-d/s;if(s>0.)enter=max(enter,t);else leave=min(leave,t);}
 }
 return vec2(enter,leave);
}
float emitterDistance(vec3 p){
 vec2 uv=(p.yz-uFieldBounds.xy)/uFieldBounds.zw;
 vec2 outside=max(max(-uv,uv-1.),vec2(0.))*uFieldBounds.zw;
 float d=textureLod(uEmitterDistance,clamp(uv,0.,1.),0.).r+length(outside);
 float x=max(max(uNativeX.x-p.x,p.x-uNativeX.y),0.);
 return length(vec2(d,x));
}
float densityAt(vec3 p){
 vec3 flow=p*.13-vec3(0.,0.,uTime*1.35);
 vec3 q=p;
 q.xy+=vec2(flowNoise(flow+vec3(3.,0.,9.)),flowNoise(flow+vec3(-7.,4.,1.)))-.5;
 q.xy+=(vec2(sin(p.z*.19-uTime*2.1),cos(p.z*.16-uTime*1.7)))*2.2;
 // Upward transport of the actual native glyph's fuel, progressively thinner
 // and cooler with height. No circle, sprite atlas or painted fire image.
 float d=emitterDistance(q);
 d=min(d,emitterDistance(q-vec3(0.,0.,7.))+.5);
 d=min(d,emitterDistance(q-vec3(0.,0.,16.))+1.);
 d=min(d,emitterDistance(q-vec3(0.,0.,28.))+1.8);
 d=min(d,emitterDistance(q-vec3(0.,0.,40.))+2.8);
 float fuel=exp(-d*.22),turbulence=flowNoise(flow*1.8+vec3(1.7,4.1,0.));
 return max(0.,fuel-.28-turbulence*.58);
}
void main(){
 vec3 ray=normalize(vLocal-vRayOrigin);
 // The protected volume is never drawn: it only keeps fire out of the
 // readable native design and its negative spaces, including front flames.
 vec2 guard=glyphInterval(vRayOrigin,ray);
 float guardGap=guard.y-guard.x;
 float guardSoftness=max(fwidth(guardGap)*1.5,.00001);
 vec3 safe=vec3(abs(ray.x)<.000001?.000001:ray.x,abs(ray.y)<.000001?.000001:ray.y,abs(ray.z)<.000001?.000001:ray.z);
 vec3 a=(uBoxMin-vRayOrigin)/safe,b=(uBoxMax-vRayOrigin)/safe;
 vec3 lo=min(a,b),hi=max(a,b);
 float begin=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
 vec2 uv=gl_FragCoord.xy/uResolution;
 vec4 nearV=uProjectionInverse*vec4(uv*2.-1.,-1.,1.);
 vec3 nearLocal=(uViewToLocal*vec4(nearV.xyz/nearV.w,1.)).xyz;
 begin=max(begin,dot(nearLocal-vRayOrigin,ray));
 float depth=texture2D(uOpaqueDepth,uv).r;
 if(depth<1.){
  vec4 opaqueV=uProjectionInverse*vec4(uv*2.-1.,depth*2.-1.,1.);
  vec3 opaqueLocal=(uViewToLocal*vec4(opaqueV.xyz/opaqueV.w,1.)).xyz;
  end=min(end,dot(opaqueLocal-vRayOrigin,ray));
 }
 if(end<=begin)discard;
 float protect=guard.y>=begin&&guard.x<=end?smoothstep(-guardSoftness,0.,guardGap):0.;
 if(protect>=1.){
  // Alpha is a design-protection signal, not a painted fire image. RGB stays
  // empty here; the compositor also excludes bloom from the readable glyph.
  gl_FragColor=vec4(0.,0.,0.,1.);return;
 }
 float stepLength=(end-begin)/${POWERUP_FIRE_STEPS}.;
 vec3 emission=vec3(0.);float opacity=0.;
 for(int i=0;i<${POWERUP_FIRE_STEPS};i++){
  vec3 p=vRayOrigin+ray*(begin+(float(i)+.5)*stepLength);
  float density=densityAt(p),alpha=1.-exp(-density*stepLength*.32);
  float heat=clamp(density*2.6,0.,1.);
  emission+=(1.-opacity)*alpha*uColor*(.35+heat*1.8);
  opacity+=(1.-opacity)*alpha;
  if(opacity>.97)break;
 }
 if(opacity<.002&&protect<.002)discard;
 gl_FragColor=vec4(emission,protect);
}`;

function segmentDistanceSq( y, z, a, b ) {
 const dy=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((y-a[0])*dy+(z-a[1])*dz)/(dy*dy+dz*dz||1)));
 return (y-a[0]-t*dy)**2+(z-a[1]-t*dz)**2;
}
// Scalar geometric distance, not colour/opacity artwork. Thin native artifact
// geometry spans YZ; its original X thickness supplies the third dimension.
function distanceField( geometry, center ) {
 const box=geometry.boundingBox,pad=4,minY=box.min.y-center.y-pad,minZ=box.min.z-center.z-pad;
 const spanY=box.max.y-box.min.y+pad*2,spanZ=box.max.z-box.min.z+pad*2;
 const p=geometry.attributes.position,index=geometry.index,triangles=[];
 for(let i=0;i<(index?index.count:p.count);i+=3){
  const t=[];for(let k=0;k<3;k++){const n=index?index.getX(i+k):i+k;t.push([p.getY(n)-center.y,p.getZ(n)-center.z]);}
  triangles.push(t);
 }
 const data=new Uint16Array(FIELD_SIZE**2),cross=(a,b,y,z)=>(b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(y-a[0]);
 for(let z=0;z<FIELD_SIZE;z++)for(let y=0;y<FIELD_SIZE;y++){
  const py=minY+(y+.5)/FIELD_SIZE*spanY,pz=minZ+(z+.5)/FIELD_SIZE*spanZ;let nearest=Infinity;
  for(const [a,b,c] of triangles){
   const area=cross(a,b,c[0],c[1]),ab=cross(a,b,py,pz),bc=cross(b,c,py,pz),ca=cross(c,a,py,pz);
   if(Math.abs(area)>1e-8&&(ab>=0&&bc>=0&&ca>=0||ab<=0&&bc<=0&&ca<=0)){nearest=0;break;}
   nearest=Math.min(nearest,segmentDistanceSq(py,pz,a,b),segmentDistanceSq(py,pz,b,c),segmentDistanceSq(py,pz,c,a));
  }
  data[z*FIELD_SIZE+y]=THREE.DataUtils.toHalfFloat(Math.sqrt(nearest));
 }
 const texture=new THREE.DataTexture(data,FIELD_SIZE,FIELD_SIZE,THREE.RedFormat,THREE.HalfFloatType);
 texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return {texture,bounds:new THREE.Vector4(minY,minZ,spanY,spanZ)};
}

export function R_CreatePowerupFire( nativeGeometry, center, color, glyphPlanes, glyphPlaneCount ) {
 const field=distanceField(nativeGeometry,center),native=nativeGeometry.boundingBox;
 const lo=native.min.clone().sub(center).add(new THREE.Vector3(-9,-10,-3));
 const hi=native.max.clone().sub(center).add(new THREE.Vector3(9,10,48));
 const size=hi.clone().sub(lo),geometry=new THREE.BoxGeometry(size.x,size.y,size.z);
 geometry.translate(...lo.clone().add(hi).multiplyScalar(.5).toArray());
 const material=new THREE.ShaderMaterial({uniforms:{uOpaqueDepth:{value:null},uEmitterDistance:{value:field.texture},uFieldBounds:{value:field.bounds},
  uNativeX:{value:new THREE.Vector2(native.min.x-center.x,native.max.x-center.x)},uGlyphPlanes:{value:glyphPlanes},uGlyphPlaneCount:{value:glyphPlaneCount},
  uBoxMin:{value:lo},uBoxMax:{value:hi},uColor:{value:new THREE.Color(...color)},uResolution:{value:new THREE.Vector2()},
  uProjectionInverse:{value:new THREE.Matrix4()},uViewToLocal:{value:new THREE.Matrix4()},uOrthographic:{value:0},uTime:{value:0}},
  vertexShader:VERTEX,fragmentShader:FRAGMENT,side:THREE.BackSide,transparent:true,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneFactor,blendEquationAlpha:THREE.AddEquation,depthTest:false,depthWrite:false,toneMapped:false});
 const mesh=new THREE.Mesh(geometry,material);mesh.layers.set(POWERUP_FIRE_LAYER);mesh.frustumCulled=false;mesh.userData.newerOnly=true;
 mesh.userData.powerupVolume=true;
 const proxy=new THREE.Mesh(geometry,material);proxy.matrixAutoUpdate=false;proxy.frustumCulled=false;
 proxy.onBeforeRender=function(renderer,scene,camera){
  material.uniforms.uViewToLocal.value.copy(this.matrixWorld).premultiply(camera.matrixWorldInverse).invert();
  material.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
  material.uniforms.uOrthographic.value=camera.isOrthographicCamera?1:0;
 };
 return {mesh,proxy,field:field.texture};
}

let emissionTarget=null;
const volumeScene=new THREE.Scene(),savedClear=new THREE.Color();
export function R_ClearPowerupFireTarget(){emissionTarget?.dispose();emissionTarget=null;volumeScene.clear();}
export function R_RenderPowerupFire( renderer, camera, target, fires ) {
 if(!fires.length||!renderer.isWebGLRenderer||!target?.depthTexture)return null;
 if(!emissionTarget||emissionTarget.width!==target.width||emissionTarget.height!==target.height){
  emissionTarget?.dispose();
  emissionTarget=new THREE.WebGLRenderTarget(target.width,target.height,{type:THREE.HalfFloatType,depthBuffer:false,generateMipmaps:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
 }
 const previous=renderer.getRenderTarget(),auto=renderer.autoClear,scissor=renderer.getScissorTest(),alpha=renderer.getClearAlpha();
 renderer.getClearColor(savedClear);
 try{
  renderer.setScissorTest(false);renderer.setRenderTarget(emissionTarget);renderer.setClearColor(0,0);renderer.clear(true,false,false);
  volumeScene.clear();
  for(const fire of fires){
   fire.mesh.updateWorldMatrix(true,false);fire.proxy.matrix.copy(fire.mesh.matrixWorld);
   const u=fire.mesh.material.uniforms;u.uOpaqueDepth.value=target.depthTexture;u.uResolution.value.set(target.width,target.height);
   volumeScene.add(fire.proxy);
  }
  // Source depth belongs to HDR, while this pass writes a different target.
  // No depth feedback, no opaque redraw, and no mutation of receiver MRTs.
  renderer.autoClear=false;renderer.render(volumeScene,camera);
  return {texture:emissionTarget.texture,count:fires.length};
 }finally{volumeScene.clear();renderer.autoClear=auto;renderer.setRenderTarget(previous);renderer.setScissorTest(scissor);renderer.setClearColor(savedClear,alpha);}
}
