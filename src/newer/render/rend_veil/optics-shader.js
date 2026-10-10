/**
 * @module newer/render/rend_veil/optics-shader
 *
 * Rend the Veil's optics shader: a world-anchored ellipsoid clipped by the first opaque surface.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
import { COMMON_GLSL } from './shader-common.js';
const OPTICS_FRAGMENT=`
uniform vec3 uMagic,uCameraEffect,uEffectCenter,uEffectRadii;
uniform mat4 uWorldToEffect;
uniform vec3 uSubjectMin,uSubjectMax;
uniform float uHasSubject,uHasBackgroundDepth;
uniform float uDarkness,uVeilDensity,uVeilTwist,uManifestation,uFocus,uInvocation,uShadowEnabled;
varying vec2 vUv;uniform sampler2D uScene,uDepth,uBackgroundDepth;
uniform vec2 uCenter,uResolution;uniform mat4 uInvVP;
uniform float uTime,uAspect,uRadius,uAmount,uLens,uPull,uRefraction,uChromatic,uShimmer,uTurbulence,uFrequency,uAsymmetry,uShape;
uniform float uEldritch,uFoldSlices,uFoldAngle,uMirror,uCompression,uCollapse,uFlash,uFlashRadius,uResidual;
uniform float uWaveRadius,uWaveWidth,uWaveDistortion,uWaveRefraction,uWaveChromatic,uWaveAmp,uWaveType,uBloomAmount,uExposure;
${COMMON_GLSL}
// A finite, world-anchored ellipsoid, clipped by the first opaque surface.
// Rays pointing away from the summon, or ending on an occluder in front of it,
// have exactly zero weight. No projected-radius approximation is used for coverage.
float volumeCoverage(vec3 ro,vec3 rd,float sceneDistance,vec3 radii){
 vec3 o=(ro-uEffectCenter)/radii,d=rd/radii;
 float aa=dot(d,d),bb=dot(o,d),cc=dot(o,o)-1.;
 float discriminant=bb*bb-aa*cc;
 if(discriminant<=0.||aa<.000001)return 0.;
 float root=sqrt(discriminant),enter=max(0.,(-bb-root)/aa),leave=min(sceneDistance,(-bb+root)/aa);
 if(leave<=enter)return 0.;
 float closest=length(o+d*clamp(-bb/aa,enter,leave));
 return (1.-smoothstep(.70,1.,closest))*smoothstep(0.,.22,leave-enter);
}

vec4 occultVolume(vec3 ro,vec3 rd,float maxDepth){
 vec3 invD=vec3(1./divideW(rd.x),1./divideW(rd.y),1./divideW(rd.z));
 vec3 t0=(uEffectCenter-vec3(2.25,2.32,2.25)-ro)*invD;
 vec3 t1=(uEffectCenter+vec3(2.25,2.1,2.25)-ro)*invD;
 vec3 lo=min(t0,t1),hi=max(t0,t1);
 float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(maxDepth,min(hi.x,min(hi.y,hi.z)));
 if(end<=start||uInvocation<.001||uShadowEnabled<.5)return vec4(0.,0.,0.,1.);
 float dt=(end-start)/24.,trans=1.;vec3 scatter=vec3(0.);float scale=max(.09,(1.-uCompression*.74)*uCollapse);
 float jitter=h3(vec3(gl_FragCoord.xy,47.));
 for(int i=0;i<24;i++){
  float dist=start+(float(i)+jitter)*dt;vec3 q=(ro+rd*dist-uEffectCenter)/scale;
  q.xz=rot2(q.y*.52+uTime*.21*uVeilTwist)*q.xz;
  q.xz+=vec2(sin(q.y*1.9+uTime*.62),cos(q.y*1.6-uTime*.41))*.29;
  float rad=length(q.xz),n=noise3(q*2.2+vec3(0.,-uTime*.43,uTime*.19));
  n=n*.66+noise3(q*5.1+vec3(uTime*.15,-uTime*.28,0.))*.34;
  float vertical=smoothstep(-2.32,-1.62,q.y)*(1.-smoothstep(.95,2.1,q.y));
  float ribs=.5+.5*sin(angleSafe(q.xz)*3.+q.y*3.2-uTime*.85+n*4.);
  float envelope=exp(-rad*rad*.92)*(1.-smoothstep(1.35,2.05,rad));
  float density=envelope*vertical*smoothstep(.23,.69,n)*(.52+ribs*.48)*uVeilDensity*uInvocation*(1.-uManifestation*.61);
  float absorb=exp(-density*dt*2.6);scatter+=trans*(1.-absorb)*uMagic*(.026+.045*n);trans*=absorb;
 }
 return vec4(scatter,trans);
}

// The host owns tone mapping, exposure, bloom, output encoding and HUD rendering.
// This pass preserves linear scene colour/alpha exactly outside its finite footprint.
vec4 displayColor(vec3 c){return vec4(c,texture2D(uScene,vUv).a);}

void main(){
 vec2 uv=vUv,asp=vec2(uAspect,1.);
 vec3 unwarped=texture2D(uScene,uv).rgb;
 vec3 base=unwarped;
 float depth=texture2D(uDepth,uv).r;
 vec4 wp=uInvVP*vec4(uv*2.-1.,depth*2.-1.,1.);
 vec3 world=(uWorldToEffect*vec4(wp.xyz/divideW(wp.w),1.)).xyz,ray=unitSafe(world-uCameraEffect);
 float sceneDistance=length(world-uCameraEffect);
 float volume=volumeCoverage(uCameraEffect,ray,sceneDistance,uEffectRadii);
 vec3 delta=world-uEffectCenter;vec3 waveDelta=delta;
 if(uWaveType>.5)waveDelta.y=0.;
 float d=length(waveDelta);
 // The shockwave cannot propagate across the entire level or screen.
 float surface=(1.-smoothstep(3.1,4.2,d))*(1.-smoothstep(2.8,3.5,abs(delta.y)));
 float w=(d-uWaveRadius)/max(.08,uWaveWidth);
 float band=exp(-w*w*2.4)*surface;
 float support=max(volume,band*step(.00001,uWaveAmp));
 // Protect the assembled body gradually over the complete matched unwind.
 // After focus, the residual release is still strictly behind the opaque creature.
 // Prefer an existing host background depth buffer; otherwise conservatively protect
 // opaque scene samples that lie inside the current subject bounds in effect-local space.
 float inBounds=step(uSubjectMin.x,world.x)*step(world.x,uSubjectMax.x)
   *step(uSubjectMin.y,world.y)*step(world.y,uSubjectMax.y)
   *step(uSubjectMin.z,world.z)*step(world.z,uSubjectMax.z);
 float subjectFront=uHasSubject*mix(inBounds,step(depth+.000015,texture2D(uBackgroundDepth,uv).r),uHasBackgroundDepth);
 float protect=1.-subjectFront*uFocus;
 support*=protect;volume*=protect;band*=protect;
 if(support<=.000001){gl_FragColor=displayColor(base);return;}

 float radius=max(.0005,uRadius*(1.-uCompression*.70)*max(.035,uCollapse));
 vec2 q=(uv-uCenter)*asp/radius,qs=q;
 if(uShape>.5&&uShape<1.5)qs*=vec2(.79,1.17);
 float r=length(qs),a=angleSafe(qs);
 if(uShape>1.5&&uShape<2.5)r=mix(r,abs(qs.x)+abs(qs.y),.65);
 if(uShape>2.5&&uShape<3.5)r*=1.+sin(a*6.+uTime*.2)*.14;
 if(uShape>3.5)r*=1.+sin(a*3.+uTime*.23)*.23+sin(a*7.-uTime*.18)*.08;
 r*=1.+uAsymmetry*.23*sin(a*3.+uTime*.35);
 float field=exp(-r*r*1.9)*(1.-smoothstep(1.15,1.7,r));
 float rim=exp(-squareSafe((r-.91)*6.))*(1.-smoothstep(1.2,1.7,r));
 float n=noise3(vec3(qs*uFrequency*.6,uTime*.35));
 vec2 radial=q*field,tangent=vec2(-q.y,q.x);
 float lens=uAmount*(uLens*.16+uPull*.09)*(1.+uCompression*.6);
 // Regression fix: the old tangential turbulence had no spatial falloff.
 // It therefore displaced every pixel, even with the summon off-screen.
 vec2 shift=(radial*lens+tangent*((n-.5)*.12+sin(r*5.-uTime*.5)*.033)*uAmount*uTurbulence*field)*radius/asp;
 shift+=unitSafe(q)*(n-.5)*uRefraction*.018*uAmount*field*radius/asp;
 shift+=vec2(sin(a*34.+uTime*7.),cos(a*27.-uTime*5.))*rim*uShimmer*uAmount*.0014;
 float foldNoise=noise3(vec3(qs*max(1.,uFoldSlices*.55),uTime*.18));
 float foldSeed=foldNoise*6.2831853+sin(qs.x*1.3+qs.y*.8);
 float window=field*uAmount*uEldritch;
 vec2 folded=rot2(sin(foldSeed+uTime*.55)*uFoldAngle*window*.5)*q;
 folded+=unitSafe(q)*sin(foldSeed*1.37-uTime*.41)*window*.055;
 shift+=(folded-q)*radius/asp;
 // Every distortion term uses the world-space boundary; no exceptions.
 shift*=volume;
 vec2 waveDir=unitSafe((uv-uCenter)*asp)/asp;
 float wave=band*(-w)*uWaveAmp;
 vec2 waveShift=waveDir*wave*(.025*uWaveDistortion+.009*uWaveRefraction);
 shift+=waveShift;
 shift+=vec2(sin(q.y*9.+uTime*2.),cos(q.x*7.+uTime))*field*uResidual*.0018*volume;
 vec2 sampleUV=uvSafe(uv+shift,uv,uResolution);
 vec2 split=unitSafe(q)/asp*(rim*.003+field*.0016)*uChromatic*uAmount*(1.+uCompression*3.)*volume;
 split+=waveDir*band*uWaveAmp*uWaveChromatic*.004;
 vec3 c;c.r=texture2D(uScene,uvSafe(sampleUV+split,uv,uResolution)).r;
 c.g=texture2D(uScene,sampleUV).g;c.b=texture2D(uScene,uvSafe(sampleUV-split,uv,uResolution)).b;
 c=colorSafe(c,unwarped);
 float veilNoise=noise3(vec3(q*vec2(1.2,.95)*max(1.,uFoldSlices*.45),uTime*.17));
 float veil=smoothstep(.35,.75,veilNoise);
 vec2 wrong=uCenter+rot2(.85+sin(foldSeed*.6)*.32)*vec2(-q.x,q.y)*radius/asp;
 vec3 other=colorSafe(texture2D(uScene,uvSafe(wrong+shift,uv,uResolution)).rgb,unwarped);
 c=mix(c,other,clamp(window*uMirror*veil*.42*volume,0.,.55));

 vec4 smoke=occultVolume(uCameraEffect,ray,sceneDistance);
 c=mix(c,c*smoke.a+smoke.rgb,volume);
 c*=1.-clamp(field*uAmount*(.035+uDarkness*.16)*volume,0.,.51);
 float flash=exp(-dot(q,q)/max(.04,uFlashRadius*uFlashRadius*1.7))*volume;
 // Owner: no emissive white flash. The black pool/ripple provides the release; runes remain luminous.
 gl_FragColor=displayColor(mix(base,colorSafe(c,unwarped),support));
}`;


export { OPTICS_FRAGMENT };
