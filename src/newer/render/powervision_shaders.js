// SPDX-License-Identifier: MIT
/**
 * @module newer/render/powervision_shaders
 *
 * The owner-supplied power-up vision shaders (demon-vision.html), kept exact; adapted to the renderer in
 * `r_powervision.js`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Exact shader bodies from owner-supplied demon-vision.html.
// SHA256 0b86255fab89060c5c1be49171fda82123d7cb7c602c5532c947c5791e546e23
// Runtime ABI adaptation lives in r_powervision.js; donor demo scene/UI are excluded.

export const FULLSCREEN_VERTEX = `
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const UNSEEN_FRAGMENT = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tScene, tDepth, tNormal, tMask;
uniform vec2 uResolution;
uniform float uTime, uAmount, uFlow, uGlow, uMist, uVignette;
uniform float uNear, uFar, uWorldScale, uProtectViewmodel;
uniform vec3 uWorldUp;
uniform mat4 uInvProjection, uCameraWorld;
uniform int uDebug;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
             mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
float field(vec2 p) {
  return .57*noise2(p) + .28*noise2(p*2.03+4.1) + .15*noise2(p*4.13-2.7);
}
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  vec2 a=i.xy+vec2(37.0,17.0)*i.z;
  float z0=mix(mix(hash21(a),hash21(a+vec2(1,0)),f.x),
               mix(hash21(a+vec2(0,1)),hash21(a+vec2(1,1)),f.x),f.y);
  a+=vec2(37.0,17.0);
  float z1=mix(mix(hash21(a),hash21(a+vec2(1,0)),f.x),
               mix(hash21(a+vec2(0,1)),hash21(a+vec2(1,1)),f.x),f.y);
  return mix(z0,z1,f.z);
}
float linearDepth(float d) { return uNear*uFar/max(uFar-d*(uFar-uNear),.00001); }
vec2 safeUV(vec2 p) { return clamp(p, .5/uResolution, 1.0-.5/uResolution); }
float depthAt(vec2 p) { return linearDepth(texture(tDepth,safeUV(p)).r)*uWorldScale; }
vec3 viewAt(vec2 uv, float depth) {
  vec4 p=uInvProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);
  return p.xyz/p.w;
}
vec2 wind(vec2 uv) {
  vec2 p=uv*vec2(uResolution.x/uResolution.y,1.0)*3.0;
  p += vec2(-uTime*.075,uTime*.11);
  const float e=.09;
  vec2 curl=vec2(field(p+vec2(0,e))-field(p-vec2(0,e)),
                field(p-vec2(e,0))-field(p+vec2(e,0)))/e;
  vec2 radial=(uv-vec2(.5,.54))*vec2(1.4,.85);
  return vec2(.36,.68)+curl*.95+radial*.8;
}
vec3 normalAt(vec2 uv) {
  vec3 n=texture(tNormal,safeUV(uv)).rgb*2.0-1.0;
  return length(n)>.15 ? normalize(n) : vec3(0,0,1);
}
void main() {
  vec2 uv=vUv, px=1.0/uResolution;
  vec3 original=texture(tScene,uv).rgb;
  float rawDepth=texture(tDepth,uv).r;
  float z=linearDepth(rawDepth)*uWorldScale;
  float mask=texture(tMask,uv).r;
  vec3 n=normalAt(uv);
  vec2 velocity=wind(uv);
  if(uDebug==1) { fragColor=vec4(vec3(mask),1); return; }
  if(uDebug==2) { fragColor=vec4(vec3(1.0-exp(-z*.06)),1); return; }
  if(uDebug==3) { fragColor=vec4(n*.5+.5,1); return; }
  if(uDebug==4) { fragColor=vec4(vec3(velocity*.25+.5,.5),1); return; }
  if(uProtectViewmodel>.5 && texture(tNormal,uv).a < -1.5) { fragColor=vec4(original,rawDepth); return; }
  if(uAmount<.0001) { fragColor=vec4(original,rawDepth); return; }

  // Protect the subject's silhouette; most optical distortion belongs to the world.
  float centerProtect=1.0-smoothstep(.08,.37,length((uv-vec2(.5,.53))*vec2(1.25,1)));
  float amplitude=.0045*uFlow*(1.0-.80*mask)*(1.0-.48*centerProtect);
  vec2 warped=safeUV(uv+velocity*amplitude);
  // A depth discontinuity is not permission to pull an unrelated surface across an edge.
  float zw=depthAt(warped);
  warped=mix(uv,warped,1.0-smoothstep(.25,max(.7,z*.09),abs(zw-z)));
  vec3 base=texture(tScene,warped).rgb;
  vec3 streak=vec3(0); float weights=0.0, ghostLight=0.0;
  float lengthUV=.065*uFlow*(.45+.55*(1.0-centerProtect));
  for(int i=0;i<13;i++) {
    float t=float(i)/12.0;
    vec2 offset=velocity*t*lengthUV;
    offset.x+=sin(t*4.0+uTime*.55+uv.y*8.0)*t*t*.012*uFlow;
    vec2 q=safeUV(warped-offset);
    float zs=depthAt(q);
    float w=exp(-t*2.7);
    float bilateral=exp(-abs(zs-z)/max(.28,z*.07));
    streak+=texture(tScene,q).rgb*w*bilateral;
    weights+=w*bilateral;
    // Permit a visible subject to shed light into empty air, not through a foreground wall.
    float visible=1.0-smoothstep(max(.22,z*.012),max(.7,z*.06),zs-z);
    ghostLight+=texture(tMask,q).r*w*visible;
  }
  streak/=max(weights,.001);
  ghostLight/=4.7;
  base=mix(base,streak,clamp(uFlow*.43,0.0,.76)*(1.0-mask*.75));
  float luma=dot(max(base,vec3(0)),vec3(.2126,.7152,.0722));
  float tone=pow(max(luma,0.0),.92);
  vec3 spectral=vec3(.72,.82,.86)*tone*.61;

  // A deliberately authored reveal, not brightness-based object detection.
  float rim=pow(1.0-abs(n.z),2.0);
  float grainField=field(uv*vec2(25,11)+vec2(uTime*.16,-uTime*.2));
  float apparition=.055+pow(max(luma,0.0),.68)*1.12+rim*.24;
  apparition*=.81+.28*grainField;
  spectral=mix(spectral,vec3(.82,.93,.97)*apparition,mask*.94);

  // Two-axis halo: broad soft radiance, distinct from the long wind streaks.
  float halo=0.0;
  const float TAU=6.28318530718;
  for(int j=0;j<12;j++) {
    float a=float(j)*TAU/12.0;
    vec2 q=safeUV(uv+vec2(cos(a),sin(a))*vec2(uResolution.y/uResolution.x,1)*.018);
    float zs=depthAt(q);
    float visible=1.0-smoothstep(max(.3,z*.012),max(1.0,z*.055),zs-z);
    halo+=texture(tMask,q).r*visible/12.0;
  }
  spectral+=vec3(.71,.84,.9)*(ghostLight*.32+halo*.26)*uGlow*(1.0-mask*.94);

  // Six-sample, world-anchored heterogeneous fog. The ray stops at scene depth.
  vec3 vp=viewAt(uv,rawDepth);
  vec3 eye=uCameraWorld[3].xyz*uWorldScale;
  vec3 hit=(uCameraWorld*vec4(vp,1)).xyz*uWorldScale;
  vec3 delta=hit-eye;
  float rayLength=min(length(delta),55.0);
  vec3 ray=normalize(delta+vec3(.00001));
  float optical=0.0;
  for(int k=0;k<6;k++) {
    float s=(float(k)+.5)/6.0;
    vec3 p=eye+ray*(rayLength*s);
    vec3 advect=vec3(uTime*.12,0,-uTime*.08);
    float cloud=noise3(p*.24+advect)*.7+noise3(p*.63-advect*.7)*.3;
    float density=smoothstep(.28,.79,cloud);
    float heightFalloff=exp(-max(dot(p,uWorldUp)-.5,0.0)*.19);
    optical+=density*heightFalloff;
  }
  float fog=1.0-exp(-optical/6.0*rayLength*.052*uMist);
  spectral=mix(spectral,vec3(.085,.115,.132),fog*(1.0-mask*.70));
  // Thin strands riding the same field make the world feel pulled rather than defocused.
  vec2 threadUV=uv*vec2(13.0,2.0)+velocity*.18;
  float strand=field(threadUV+vec2(field(threadUV*1.7),-uTime*.07));
  float threads=pow(max(0.0,1.0-abs(strand-.52)*23.0),3.0);
  float broken=smoothstep(.44,.68,field(uv*vec2(6,8)+vec2(uTime*.035,0)));
  spectral+=vec3(.012,.019,.022)*threads*broken*uMist*(1.0-mask)*smoothstep(3.0,28.0,z);
  float vignette=1.0-uVignette*smoothstep(.20,.76,length((uv-.5)*vec2(1.0,.86)));
  spectral*=vignette;
  float film=(hash21(floor(uv*uResolution)+floor(uTime*24.0))-.5)*.009;
  spectral+=film;
  fragColor=vec4(mix(original,max(spectral,vec3(0)),clamp(uAmount,0.0,1.0)),rawDepth);
}`;

export const HISTORY_FRAGMENT = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tCurrent,tHistory,tDepth,tMask,tNormal;
uniform mat4 uInvViewProjection,uPreviousViewProjection;
uniform float uNear,uFar,uDelta,uTime,uTrails,uAmount,uValid,uWorldScale,uProtectViewmodel;
uniform vec2 uResolution;
float linearDepth(float d) { return uNear*uFar/max(uFar-d*(uFar-uNear),.00001); }
void main() {
  vec3 current=texture(tCurrent,vUv).rgb;
  float d=texture(tDepth,vUv).r;
  float z=linearDepth(d);
  if(uProtectViewmodel>.5 && texture(tNormal,vUv).a < -1.5) { fragColor=vec4(current,z/uFar); return; }
  vec4 world=uInvViewProjection*vec4(vUv*2.0-1.0,d*2.0-1.0,1.0); world/=world.w;
  vec4 previous=uPreviousViewProjection*world;
  vec2 prevUV=previous.xy/max(previous.w,.00001)*.5+.5;
  float phase=vUv.y*14.0+uTime*.45;
  vec2 drift=vec2(.30+sin(phase)*.4,.75+cos(phase*.7)*.23);
  prevUV-=drift*uDelta*.018*uTrails;
  vec4 history=texture(tHistory,clamp(prevUV,.5/uResolution,1.0-.5/uResolution));
  float error=abs(history.a*uFar-previous.w)*uWorldScale;
  float tolerance=max(.42,previous.w*uWorldScale*.035);
  float accept=1.0-smoothstep(tolerance,tolerance*3.0,error);
  accept*=float(all(greaterThan(prevUV,vec2(0)))&&all(lessThan(prevUV,vec2(1)))&&previous.w>0.0);
  float mask=texture(tMask,vUv).r;
  float decay=exp(-uDelta*3.8);
  // Bound feedback: moving subjects leave a short luminous echo, never an unbounded burn-in.
  vec3 echo=min(history.rgb*decay,current+vec3(.32));
  float feedback=min(.94,exp(-uDelta*6.0))*uTrails*uAmount*uValid*accept;
  feedback*=1.0-mask*.50;
  vec3 result=mix(current,max(current,echo),feedback);
  fragColor=vec4(result,z/uFar);
}`;

export const DEMON_FRAGMENT = `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tScene,tDepth,tNormal,tMask,tAlbedo;
uniform vec2 uResolution;
uniform mat4 uInvProjection;
uniform float uNear,uFar,uWorldScale,uAmount,uInk,uThreshold,uRelief,uEdges,uGlow,uWhites,uWorldFloor;
uniform float uAccentMode,uProtectViewmodel,uHasAlbedo;
uniform int uDebug;
float sat(float v){return clamp(v,0.0,1.0);}
vec2 safe(vec2 uv){return clamp(uv,.5/uResolution,1.0-.5/uResolution);}
float lum(vec3 v){return dot(v,vec3(.2126,.7152,.0722));}
float zAt(vec2 uv){float d=texture(tDepth,safe(uv)).r;return uNear*uFar/max(uFar-d*(uFar-uNear),.000001);}
vec3 positionAt(vec2 uv){
  uv=safe(uv);float d=texture(tDepth,uv).r;
  vec4 p=uInvProjection*vec4(uv*2.0-1.0,d*2.0-1.0,1.0);return p.xyz/p.w;
}
vec3 storedNormal(vec2 uv,vec3 fallback){
  vec4 packet=texture(tNormal,safe(uv));vec3 n=packet.rgb*2.0-1.0;
  return abs(packet.a)>.001&&dot(n,n)>.01?normalize(n):fallback;
}
vec3 pigmentAt(vec2 uv){
  vec4 a=texture(tAlbedo,safe(uv));
  return uHasAlbedo>.5&&a.a>.001?a.rgb:texture(tScene,safe(uv)).rgb;
}
// A fallback heuristic, deliberately not described as semantic feature recognition.
// An explicit mask overrides this, including an explicitly WHITE/fill region (G=0).
float inkAt(vec2 uv){
  vec4 m=texture(tMask,safe(uv));
  if(m.r<.001)return 0.0;
  if(m.b>.5&&uAccentMode<.5)return m.g;
  float l=lum(pigmentAt(uv));
  vec2 p=vec2(3.0)/uResolution;
  float mean=l,weight=1.0;
  for(int k=0;k<4;k++){
    float a=float(k)*1.5707963;
    vec2 q=safe(uv+vec2(cos(a),sin(a))*p);
    float w=texture(tMask,q).r*exp(-abs(zAt(q)-zAt(uv))*uWorldScale*4.0);
    mean+=lum(pigmentAt(q))*w;weight+=w;
  }
  mean/=weight;
  float absolute=1.0-smoothstep(uThreshold*.40,uThreshold*1.25,l);
  float local=smoothstep(.18,.55,(mean-l)/max(mean,.025));
  return max(absolute,local*.9);
}
void main(){
  vec2 uv=vUv,px=1.0/uResolution;
  vec3 original=texture(tScene,uv).rgb;
  float rawDepth=texture(tDepth,uv).r;
  vec4 mask=texture(tMask,uv);
  float selected=sat(mask.r),z=zAt(uv);
  vec3 p=positionAt(uv);
  // Use the nearer-consistent derivative on each axis; do not bridge a silhouette.
  vec3 pr=positionAt(uv+vec2(px.x,0)),pl=positionAt(uv-vec2(px.x,0));
  vec3 pu=positionAt(uv+vec2(0,px.y)),pd=positionAt(uv-vec2(0,px.y));
  vec3 dx=abs(pr.z-p.z)<abs(p.z-pl.z)?pr-p:p-pl;
  vec3 dy=abs(pu.z-p.z)<abs(p.z-pd.z)?pu-p:p-pd;
  vec3 g=cross(dx,dy);g=dot(g,g)>.0000000001?normalize(g):vec3(0,0,1);
  if(dot(g,-p)<0.0)g=-g;
  vec3 n=storedNormal(uv,g),view=normalize(-p+vec3(.000001));
  float ink=inkAt(uv)*sat(uInk);
  if(uDebug==1){fragColor=vec4(vec3(selected),1);return;}
  if(uDebug==2){fragColor=vec4(vec3(ink*selected),1);return;}
  if(uDebug==3){fragColor=vec4(n*.5+.5,1);return;}
  if(uDebug==5){fragColor=vec4(pigmentAt(uv),1);return;}
  if(uDebug==6){fragColor=vec4(vec3(1.0-exp(-z*uWorldScale*.07)),1);return;}
  if(uProtectViewmodel>.5 && texture(tNormal,uv).a < -1.5){fragColor=vec4(original,1);return;}
  if(uAmount<=.00001&&uDebug==0){fragColor=vec4(original,1);return;}

  // Surface relief comes from the normal field AFTER bump/POM shading. Depth only
  // supplies a coarse geometric normal and silhouette rejection, never fake height.
  vec3 average=n;float count=1.0,normalEdge=0.0,depthEdge=0.0,inkEdge=0.0;
  for(int k=0;k<4;k++){
    float a=float(k)*1.5707963;
    vec2 offset=vec2(cos(a),sin(a))*px;
    vec2 q=safe(uv+offset);
    float dz=abs(zAt(q)-z)*uWorldScale;
    float same=1.0-smoothstep(.025,max(.07,z*uWorldScale*.02),dz);
    vec3 qn=storedNormal(q,n);
    normalEdge=max(normalEdge,length(n-qn)*same);
    depthEdge=max(depthEdge,smoothstep(max(.07,z*uWorldScale*.018),max(.18,z*uWorldScale*.06),dz));
    vec2 broad=safe(uv+offset*3.0);
    float broadW=exp(-abs(zAt(broad)-z)*uWorldScale/max(.05,z*uWorldScale*.015));
    average+=storedNormal(broad,n)*broadW;count+=broadW;
    inkEdge=max(inkEdge,abs(texture(tMask,q).g-mask.g)*texture(tMask,q).r);
  }
  average=normalize(average/count);
  vec3 key=normalize(vec3(-.55,.72,.43));
  float raised=max(0.0,dot(n-g,key));
  float fine=length(n-average);
  float edge=smoothstep(.42,1.20,normalEdge)*.24;
  float relief=max(pow(sat((raised-.14)*1.55),3.2)*.64,pow(sat(fine*2.35),4.8)*.54);
  relief=max(relief,edge*.52);
  float silver=sat((relief*uRelief+depthEdge*.25*uEdges));
  float glancing=pow(sat(dot(n,normalize(key+view))),88.0)*.025*uRelief;
  vec3 world=vec3(uWorldFloor+silver+glancing);
  // The sky remains charcoal, not a white depth-gradient field.
  if(rawDepth>.99999)world=vec3(min(.014,lum(original)*.06));
  if(uDebug==4){fragColor=vec4(vec3(silver),1);return;}

  float light=sat(.31+.53*max(dot(n,key),0.0)+.16*pow(1.0-abs(dot(n,view)),2.0));
  float pigment=sat(lum(pigmentAt(uv))*1.35);
  float hot=sat(smoothstep(.49,.88,light)*uWhites+pigment*.035);
  vec3 yellow=vec3(1.0,.84,0.0);
  vec3 flesh=mix(yellow,vec3(1.0,1.0,.96),hot)*(.86+.14*light);
  // Thin gold borders define metal/horns, but sockets and the centres of accents
  // remain genuinely black. No bloom/halo is added on top of these subject pixels.
  float accentRim=pow(1.0-abs(dot(n,view)),5.0)*.19 + inkEdge*.16;
  vec3 black=vec3(.00012)+yellow*accentRim*uEdges;
  vec3 subject=mix(flesh,black,sat(ink));

  // Two soft radii plus a narrow aureole. Only visible selected pixels can emit.
  // A nearer unselected surface rejects a deeper source, so this is NOT wallhack vision.
  float halo=0.0;
  for(int ring=0;ring<3;ring++){
    float radius=ring==0?.004:(ring==1?.013:.032);
    float ringWeight=ring==0?.52:(ring==1?.32:.16);
    for(int k=0;k<8;k++){
      float a=(float(k)+float(ring)*.37)*.785398163;
      vec2 q=safe(uv+vec2(cos(a)*uResolution.y/uResolution.x,sin(a))*radius);
      float qz=zAt(q);
      float visible=1.0-smoothstep(max(.045,z*uWorldScale*.005),max(.14,z*uWorldScale*.025),(qz-z)*uWorldScale);
      vec4 qm=texture(tMask,q);
      float emitter=qm.r*(1.0-qm.g*qm.b*.92);
      halo+=emitter*visible*ringWeight*.125;
    }
  }
  world+=vec3(1.0,.69,.002)*halo*uGlow*.46;
  vec3 result=mix(world,subject,selected);
  // Deliberately no Unseen wind blur or history: Demon Vision is sharp and readable.
  fragColor=vec4(mix(original,max(result,vec3(0)),sat(uAmount)),1);
}`;
