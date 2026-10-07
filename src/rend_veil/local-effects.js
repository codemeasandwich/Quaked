// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
import { VISUALS as p } from './config.js';
import { clamp, smooth } from './timeline.js';
import { SAFE_MATH_GLSL, COMMON_GLSL } from './shader-common.js';
import { GLYPH_DATA } from './glyph-data.js';

/** Local scene objects only. No renderer/camera/world ownership. Instances are pooled. */
function createLocalEffectPool(T) {
const TAU=Math.PI*2,lerp=(a,b,t)=>a+(b-a)*t;
function random(seed=73191){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const magic=new T.Color(.54,.29,.74);
const ritualColor=()=>magic;
function glyphGeometry(){
 const g=new T.BufferGeometry();
 for(const [name,values] of Object.entries(GLYPH_DATA))g.setAttribute(name,new T.Float32BufferAttribute(values,name==='position'?3:1));
 g.computeBoundingSphere();return g;
}
function ritualInscriptionTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=1536;const ctx=canvas.getContext('2d'),rng=random(96124),C=768;
 ctx.clearRect(0,0,1536,1536);ctx.strokeStyle='red';ctx.lineCap='round';ctx.lineJoin='round';
 function stroke(points,w=2){ctx.lineWidth=w;ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(C+q[0],C+q[1]):ctx.moveTo(C+q[0],C+q[1]));ctx.stroke();}
 function arc(radius,start=0,end=TAU,w=2){let pts=[];for(let i=0;i<=380;i++){const a=start+(end-start)*i/380,rr=radius+Math.sin(a*31.7)*.85+Math.sin(a*89.)*.45;pts.push([Math.cos(a)*rr,Math.sin(a)*rr]);}stroke(pts,w);}
 for(const rad of [694,677,584,570,419,408])arc(rad,rng()*.14,TAU-rng()*.19,rad===694?3:1.9);
 function rune(x,y,angle,size,variant){ctx.save();ctx.strokeStyle='lime';ctx.translate(C+x,C+y);ctx.rotate(angle);ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(-size*.19,-size*.43);ctx.lineTo(-size*.19,size*.44);ctx.moveTo(-size*.19,-size*.32);ctx.lineTo(size*.26,-size*.12);ctx.lineTo(-size*.17,size*.02);if(variant%2){ctx.moveTo(-size*.32,size*.18);ctx.lineTo(size*.33,size*.18);ctx.lineTo(size*.08,size*.43);}else{ctx.moveTo(-size*.2,size*.12);ctx.lineTo(size*.27,size*.37);ctx.moveTo(size*.26,-size*.35);ctx.lineTo(size*.26,size*.13);}if(variant%3===0){ctx.moveTo(-size*.43,-size*.4);ctx.lineTo(-size*.13,-size*.53);ctx.lineTo(size*.08,-size*.44);}ctx.stroke();if(variant%4===0){ctx.beginPath();ctx.arc(size*.28,-size*.28,size*.1,0,TAU);ctx.stroke();}ctx.restore();}
 for(let i=0;i<41;i++){const a=i*TAU/41+.032; rune(Math.sin(a)*629,Math.cos(a)*629,-a,52+10*rng(),i);}
 for(let i=0;i<25;i++){const a=i*TAU/25; rune(Math.sin(a)*473,Math.cos(a)*473,-a,47+7*rng(),i+4);}
 // Off-axis binding paths, crescents and knotted strokes. No compass ticks / tech UI.
 for(let i=0;i<7;i++){const a=i*TAU/7+.07;const pts=[];for(let j=0;j<=40;j++){const t=j/40,rr=lerp(392,109,t),aa=a+Math.sin(t*Math.PI)*.21;pts.push([Math.sin(aa)*rr,Math.cos(aa)*rr]);}stroke(pts,2.3);const x=Math.sin(a)*316,y=Math.cos(a)*316;rune(x,y,-a,72,i+2);}
 for(let i=0;i<3;i++){const a=i*TAU/3;let pts=[];for(let j=0;j<=150;j++){const t=j/150*TAU,rr=115+31*Math.sin(t*2+a);pts.push([Math.cos(t+a)*rr,Math.sin(t+a)*rr]);}stroke(pts,2.5);}
 // Chipped chalk; erasure preserves transparent surroundings and the exact rune contour.
 ctx.globalCompositeOperation='destination-out';for(let i=0;i<7300;i++){ctx.globalAlpha=.2+rng()*.73;ctx.fillRect(rng()*1536,rng()*1536,.4+rng()*2.4,.4+rng()*3.1);}ctx.globalAlpha=1;
 const texture=new T.CanvasTexture(canvas);texture.anisotropy=4;texture.generateMipmaps=true;return texture;
}
const RITUAL_VERTEX=`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const SEAL_FRAGMENT=`${COMMON_GLSL}
uniform sampler2D uSeal;uniform vec3 uMagic;uniform float uTime,uAwake,uBrightness,uShadow,uResidual,uCompression;varying vec2 vUv;varying vec3 vWorld;
void main(){vec2 q=(vUv-.5)*2.;float r=length(q);float a=angleSafe(q);vec4 marks=texture2D(uSeal,vUv);float ink=marks.a;
float lit=smoothstep(.015,.85,uAwake)*(.78+.22*sin(a*7.-uTime*2.));float alive=(.72+.28*noise3(vec3(q*13.,uTime*.55)));float engraving=ink*.24*uAwake;
vec3 color=vec3(.14,.12,.085)*engraving;float alpha=ink*.24*uAwake;
float rune=ink*lit*alive*uBrightness*(1.+uCompression*1.1);color+=mix(uMagic,vec3(.6,.48,.29),.23)*rune*2.1;
alpha=max(alpha,ink*lit*.92);color=mix(vec3(.0001,0.,.0003)+uMagic*.018*alive,color,marks.g);if(alpha<.008)discard;gl_FragColor=vec4(color,alpha);}`;
const POOL_FRAGMENT=`${COMMON_GLSL}
uniform float uTime,uAwake,uShadow;varying vec2 vUv;varying vec3 vWorld;
void main(){vec2 q=(vUv-.5)*2.;float r=length(q),a=angleSafe(q);float n=noise3(vec3(q*8.,uTime*.35));float edge=.78+.08*sin(a*9.+uTime*.55)+.11*n;
float body=(1.-smoothstep(.14,edge,r))*(.35+.4*n);float finger=pow(clamp(.5+.5*sin(a*17.+r*5.+uTime*.65),0.,1.),12.)*(1.-smoothstep(.47,.97,r))*.4;
float alpha=clamp((body+finger)*uAwake*uShadow,0.,.79);if(alpha<.004)discard;gl_FragColor=vec4(vec3(.017,.012,.024),alpha);}`;
const VEIL_VERTEX=`${COMMON_GLSL}
attribute float aStrand;uniform float uTime,uAwake,uTwist,uCompression,uCollapse,uProgress,uIntro,uUnwind;varying vec2 vUv;varying float vId;varying vec3 vWorld;varying float vLift;
void main(){vUv=uv;vId=aStrand;float t=uv.x,side=uv.y*2.-1.;

float baseAngle=aStrand*2.39996+sin(aStrand*1.7)*.35-uTime*(.18+uTwist*.08);

float pull=smoothstep(.0,.68,t);
float rise=smoothstep(.58,1.,t);
float outer=(3.15+.35*sin(aStrand*2.7));
float radius=mix(outer,.2,pull);
 radius*=mix(1.,.78+uCompression*.12,rise);
 float swirl=baseAngle+t*(2.2+uTwist*1.1)+rise*(2.5+uTwist*1.3)+sin(t*7.-uTime*.8)*.16;
 float w=(.08+.22*sin(t*3.14159))*(.8+.25*sin(aStrand*3.4));
 float groundLift=.035+.03*sin(aStrand*4.1+t*8.-uTime*1.2);
 float y=mix(groundLift,.12,rise)+pow(rise,1.55)*(3.35+.5*sin(aStrand*3.4))+.05*sin(swirl*2.+uTime);
 vec3 q=vec3(cos(swirl)*(radius+side*w),y+side*w*.22,sin(swirl)*(radius+side*w));
 q.xz+=unitSafe(q.xz)*(sin(t*11.+aStrand*2.-uTime)*.09*(1.-rise));
 q.x+=.11*sin(t*6.+uTime*1.1+aStrand);q.z+=.11*cos(t*5.-uTime*.9+aStrand*1.3);
 q.z-=uUnwind*.72*smoothstep(.32,.92,t);q.y+=uUnwind*.16*rise;
 q*=max(.02,uCollapse);
 vLift=rise;
 vWorld=q;gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}`;
const VEIL_FRAGMENT=`${COMMON_GLSL}
uniform float uTime,uAwake,uDensity,uProgress,uIntro;uniform vec3 uMagic;varying vec2 vUv;varying float vId;varying vec3 vWorld;varying float vLift;
void main(){float side=abs(vUv.y*2.-1.);float n=noise3(vec3(vUv*vec2(13.,4.),uTime*.6+vId*2.));n=.63*n+.37*noise3(vec3(vUv*vec2(29.,9.),uTime*.9+vId));float ends=smoothstep(0.,.05,vUv.x)*(1.-smoothstep(.9,1.,vUv.x));
float shape=(1.-smoothstep(.08,.92,side+.26*(n-.5)))*ends;float ground=1.-smoothstep(.58,1.,vLift);float a=shape*smoothstep(.13,.83,n)*uDensity*uAwake*.88*(1.-uProgress*.4);
float head=smoothstep(.02,.92,uIntro);a*=mix(1.25,1.,vLift)*(1.-smoothstep(head-.07,head+.04,vUv.x));
if(a<.006)discard;vec3 purple=mix(vec3(.004,.001,.008),uMagic*.15,.5); /* Owner palette: ink-black through purple; glyphs untouched. */vec3 c=mix(vec3(.012,.009,.019),purple,.35+.45*ground);c+=purple*pow(clamp(n,0.,1.),3.)*(.25+.55*ground);c+=uMagic*pow(clamp(side,0.,1.),6.)*.03;gl_FragColor=vec4(c,min(.82,a));}`;

class SummoningSystem{
 constructor(scene){
  this.group=new T.Group();scene.add(this.group);this.u={uTime:{value:0},uAwake:{value:0},uMagic:{value:new T.Color()},uBrightness:{value:1},uShadow:{value:1},uResidual:{value:0},uCompression:{value:0},uCollapse:{value:1},uTwist:{value:1},uDensity:{value:1},uProgress:{value:0},uIntro:{value:0},uUnwind:{value:0},uSeal:{value:sealTexture}};
  this.pool=new T.Mesh(new T.PlaneGeometry(8.4,8.4),new T.ShaderMaterial({uniforms:this.u,vertexShader:RITUAL_VERTEX,fragmentShader:POOL_FRAGMENT,transparent:true,depthWrite:false}));this.pool.rotation.x=-Math.PI/2;this.pool.position.y=.035;this.pool.renderOrder=0;this.group.add(this.pool);
  this.seal=new T.Mesh(new T.PlaneGeometry(6.5,6.5),new T.ShaderMaterial({uniforms:this.u,vertexShader:RITUAL_VERTEX,fragmentShader:SEAL_FRAGMENT,transparent:true,depthWrite:false}));this.seal.rotation.x=-Math.PI/2;this.seal.position.y=.048;this.seal.renderOrder=1;this.group.add(this.seal);
  const pos=[],uv=[],ids=[],idx=[];const strands=18,segments=64;
  for(let j=0;j<strands;j++){const first=pos.length/3;for(let i=0;i<=segments;i++)for(let side=0;side<2;side++){pos.push(0,0,0);uv.push(i/segments,side);ids.push(j);}for(let i=0;i<segments;i++){const a=first+i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('aStrand',new T.Float32BufferAttribute(ids,1));geo.setIndex(idx);
  this.veil=new T.Mesh(geo,new T.ShaderMaterial({uniforms:this.u,vertexShader:VEIL_VERTEX,fragmentShader:VEIL_FRAGMENT,transparent:true,depthWrite:false,side:T.DoubleSide}));this.veil.frustumCulled=false;this.veil.renderOrder=2;this.group.add(this.veil);
 }
 update(s){
  const active=smooth(.1,s.m[3],s.t)*s.active,tail=s.residual*1.2,awake=active+tail;
  this.u.uIntro.value=clamp(s.t/Math.max(.001,s.m[3]));this.u.uTime.value=s.t;this.u.uAwake.value=awake;this.u.uMagic.value.copy(ritualColor());this.u.uBrightness.value=p.floorRunes?p.floorRuneBrightness:0;this.u.uShadow.value=p.shadowPool?p.shadowStrength:0;this.u.uDensity.value=p.veilDensity;this.u.uTwist.value=p.veilTwist;this.u.uCompression.value=s.compress*p.compressionAmount;this.u.uCollapse.value=1;this.u.uProgress.value=s.progress;this.u.uUnwind.value=s.unwind;
  this.pool.visible=p.shadowPool&&awake>.001;this.seal.visible=p.floorRunes;this.veil.visible=p.shadowVeil&&awake>.001;
 }
}

const GLYPH_VERTEX=`
attribute float aLayer,aKind,aOrder,aDetail;
uniform float uTime,uAmplitude,uResidual,uDensity,uComplexity,uScale,uRotation,uSpeed,uOrbit,uInstability,uDepth,uLayers,uConvergence,uCompression,uStructure,uRings,uImpossible,uFlicker,uBrightness,uEldritch,uRippleRadius,uRippleAmp,uCollapse;
uniform vec3 uMagic;uniform float uLayerSpeeds[8];varying float vAlpha;varying vec3 vColor;
${COMMON_GLSL}
void main(){
 float visible=step(aLayer+.5,uLayers)*step(aOrder,uDensity)*step(aDetail,uComplexity);

 if(aKind>.5&&aKind<1.5)visible*=uRings;if(aKind>1.5)visible*=uImpossible;
 if(visible<.5){vAlpha=0.;vColor=vec3(0.);gl_Position=vec4(2.,2.,2.,1.);return;}
 float ls=1.;for(int i=0;i<8;i++)if(abs(aLayer-float(i))<.1)ls=uLayerSpeeds[i];
 float accel=1.+uCompression*4.;float a=uRotation+uTime*uSpeed*ls+aLayer*.69+uCompression*ls*2.6;
 vec3 q=position*uScale;
 q.xy=rot2(a)*q.xy;
 // Most inscriptions cling to the ground or stand as broken seals behind the creature.
 if(aLayer<.5){q=vec3(q.x,q.z+.17,q.y);q.xz*=1.25;}
 else if(aLayer<1.5){q.yz=rot2(.18+sin(uTime*.17)*.13)*q.yz;q+=vec3(0.,2.5,-.78);}
 else{q.xz=rot2(aLayer*.77+sin(uTime*uOrbit+aLayer)*uInstability*.35)*q.xz;q.yz=rot2(aLayer*.21+sin(uTime*.18)*uInstability*.31)*q.yz;q+=vec3(0.,2.25,-.2);}
 q.x+=sin(q.y*4.+uTime*.8+aLayer)*uInstability*.06;
 q.z+=sin(q.y*2.+uTime*.5+aLayer)*uDepth*.18;
 q=vec3(0.,2.35,0.)+(q-vec3(0.,2.35,0.))*(1.-uCompression*min(.85,uConvergence*.66))*mix(1.,max(.0001,uCollapse),step(.0001,uAmplitude));
 float d=length(q-vec3(0,2.35,0));q+=unitSafe(q-vec3(0,2.35,0))*exp(-squareSafe((d-uRippleRadius)/.7))*uRippleAmp*.22;
 float fade=uAmplitude+uResidual*step(aOrder,.085)*(.6+.4*sin(aLayer*2.2));
 float flick=1.-uFlicker*.55*(.5+.5*sin(floor(uTime*16.)*2.71+aLayer*5.+aOrder*67.));
 vAlpha=visible*fade*flick*uBrightness;
 vColor=mix(uMagic,vec3(.62,.48,.26),step(.5,fract(aLayer*.618))*.75);
 vec4 mv=modelViewMatrix*vec4(q,1.);gl_Position=projectionMatrix*mv;
 if(visible<.5)gl_Position=vec4(2.,2.,2.,1.);
}`;
const GLYPH_FRAGMENT=`varying float vAlpha;varying vec3 vColor;void main(){if(vAlpha<.001)discard;gl_FragColor=vec4(vColor*vAlpha,1.);}`;
class GlyphSystem{
 constructor(scene){const names=['Time','Amplitude','Residual','Density','Complexity','Scale','Rotation','Speed','Orbit','Instability','Depth','Layers','Convergence','Compression','Structure','Rings','Impossible','Flicker','Brightness','Eldritch','RippleRadius','RippleAmp','Collapse'];this.u={};for(const k of names)this.u['u'+k]={value:0};this.u.uMagic={value:new T.Color()};this.u.uLayerSpeeds={value:[1,-.7,1.3,-1.6,.45,-.35,1.8,-1.1]};this.geometry=glyphGeometry();this.material=new T.ShaderMaterial({uniforms:this.u,vertexShader:GLYPH_VERTEX,fragmentShader:GLYPH_FRAGMENT,transparent:true,blending:T.AdditiveBlending,depthWrite:false});this.mesh=new T.LineSegments(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;scene.add(this.mesh);}
 update(s){this.u.uMagic.value.copy(ritualColor());const u=this.u,vals={Time:s.t,Amplitude:p.geometry?smooth(s.m[1],s.m[3],s.t)*s.active:0,Residual:p.geometry?s.residual:0,Density:p.glyphDensity,Complexity:p.glyphComplexity,Scale:p.glyphScale,Rotation:p.glyphRotation*Math.PI/180,Speed:p.rotationSpeed,Orbit:p.orbitalSpeed,Instability:p.geoInstability,Depth:p.depthOffset,Layers:p.layers,Convergence:p.glyphConvergence,Compression:s.compress*p.compressionAmount,Structure:p.structure,Rings:p.rings?1:0,Impossible:p.impossible?1:0,Flicker:p.flicker,Brightness:p.glyphBrightness,Eldritch:p.impossible?p.eldritch:0,RippleRadius:s.radius,RippleAmp:s.waveEnvelope*p.rippleStrength,Collapse:s.t<s.snapAt?1:Math.pow(s.collapse,3)};for(const[k,v]of Object.entries(vals))u['u'+k].value=v;u.uLayerSpeeds.value=Array.from({length:8},(_,i)=>p['layer'+i]);this.mesh.visible=p.geometry&&(vals.Amplitude>0||vals.Residual>0);}
}


const PARTICLE_PATH=`
uniform float uTime,uSpeed,uRadius,uSpiral,uAttraction,uCurvature,uConvergence,uCompression,uProgress,uStyle,uSnapAge,uSnapEnabled,uRippleRadius,uRippleAmp,uCollapse;
attribute vec4 aSeed;
${COMMON_GLSL}
vec3 trajectory(float t){
 float life=fract(t*uSpeed*(.14+aSeed.y*.11)+aSeed.x);
 float r=pow(clamp(1.-life,0.,1.),.4+uConvergence*.65)*uRadius;
 float orbit=life*(uSpiral*6.+uAttraction*4.)/(.8+life);
 float theta=aSeed.z*6.2831853+orbit+t*.16*uAttraction;
 float phi=acos(clamp(aSeed.w*1.76-.88,-1.,1.));
 vec3 dir=vec3(sin(phi)*cos(theta),cos(phi),sin(phi)*sin(theta));
 vec3 q=dir*r; q.y=q.y*.56-(1.-life)*1.4; q.y+=sin(theta*1.4+life*5.)*uCurvature*.4;
 q*=pow(max(.015,1.-uCompression),1.4+uConvergence*.3);
 vec3 center=vec3(0.,2.35,0.);q+=center;q.y=max(.055,q.y);

 if(uSnapAge>=0.){vec3 burst=unitSafe(q-center);q=center+burst*(.28+uSnapAge*(2.+aSeed.z*4.)*uSnapEnabled);}
 float d=length(q-center);q+=unitSafe(q-center)*exp(-squareSafe((d-uRippleRadius)/.7))*uRippleAmp*.3;
 return q;
}`;
const PARTICLE_VERTEX=`
${PARTICLE_PATH}
uniform vec3 uMagic;uniform vec2 uResolution;uniform float uSize,uStreakLength,uIsStreak,uUnitScale;varying vec2 vUV;varying float vStrength;varying vec3 vColor;
void main(){vec3 cur=trajectory(uTime),prev=trajectory(uTime-uStreakLength*.045);vec4 c=projectionMatrix*modelViewMatrix*vec4(cur,1.);vec4 b=projectionMatrix*modelViewMatrix*vec4(prev,1.);
 vUV=uv;vec2 pixel=2./max(uResolution,vec2(2.));
 vStrength=(.35+.65*aSeed.y);vColor=mix(vec3(.0001,0.,.0003),uMagic*.12,aSeed.z);
 // Reject a whole billboard before perspective division if its path crosses the eye plane.
 // All six vertices of an instance take the same branch: no inverted or screen-spanning quads.
 if(c.w<=.02||(uIsStreak>.5&&b.w<=.02)){vStrength=0.;gl_Position=vec4(2.,2.,2.,1.);return;}
 if(uIsStreak>.5){vec2 delta=c.xy/divideW(c.w)-b.xy/divideW(b.w);float ll=length(delta);vec2 n=vec2(-delta.y,delta.x)/max(ll,.00001);gl_Position=mix(b,c,uv.x);gl_Position.xy+=n*(uv.y-.5)*uSize*pixel*gl_Position.w;if(ll>.18)gl_Position=vec4(2.,2.,2.,1.);}
 else{gl_Position=c;float size=uSize*(.7+aSeed.y*.8)*clamp(12./max(2.,c.w/max(.0001,uUnitScale)),.6,2.2);gl_Position.xy+=position.xy*pixel*size*c.w;}
 vStrength=(.35+.65*aSeed.y);vColor=mix(vec3(.0001,0.,.0003),uMagic*.12,aSeed.z);
}`;
const PARTICLE_FRAGMENT=`
uniform float uAmplitude,uBrightness,uIsStreak;varying vec2 vUV;varying float vStrength;varying vec3 vColor;
void main(){float f;if(uIsStreak>.5)f=pow(clamp(1.-abs(vUV.y*2.-1.),0.,1.),1.6)*smoothstep(0.,.6,vUV.x);else{float r=length(vUV*2.-1.);if(r>1.)discard;f=exp(-r*r*5.)*(1.-smoothstep(.6,1.,r));}gl_FragColor=vec4(vColor*uBrightness,f*uAmplitude*vStrength);}`;
class EnergySystem{
 constructor(scene){this.max=850;this.scene=scene;this.seed=[];const rng=random(9553);for(let i=0;i<this.max;i++)this.seed.push(rng(),rng(),rng(),rng());this.uniforms={};for(const k of ['Time','Speed','Radius','Spiral','Attraction','Curvature','Convergence','Compression','Progress','Style','SnapAge','SnapEnabled','RippleRadius','RippleAmp','Size','StreakLength','IsStreak','Amplitude','Brightness'])this.uniforms['u'+k]={value:0};this.uniforms.uResolution={value:new T.Vector2()};this.uniforms.uUnitScale={value:1};this.uniforms.uMagic={value:new T.Color()};this.objects=[];this.rebuildTargets();}
 rebuildTargets(){
  for(const o of this.objects){this.scene.remove(o);o.geometry.dispose();o.material.dispose();}this.objects=[];
  for(let streak=0;streak<2;streak++){const g=new T.InstancedBufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,-1,0,1,1,0,-1,1,0],3));g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));g.setAttribute('aSeed',new T.InstancedBufferAttribute(new Float32Array(this.seed),4));g.instanceCount=this.max;const u={...this.uniforms,uIsStreak:{value:streak},uBrightness:{value:1}};const mat=new T.ShaderMaterial({uniforms:u,vertexShader:PARTICLE_VERTEX,fragmentShader:PARTICLE_FRAGMENT,depthWrite:false,transparent:true,blending:T.NormalBlending});const mesh=new T.Mesh(g,mat);mesh.frustumCulled=false;mesh.renderOrder=4;this.scene.add(mesh);this.objects.push(mesh);}
 }
 update(s,w,h){this.uniforms.uMagic.value.copy(ritualColor());const u=this.uniforms;let fade=s.energy;
  // s.energy already includes the matched unwind and finite tail. Do not restart
  // a bright burst (or use the shorter, pre-unwind duration) when focus completes.
  const vals={Time:s.t,Speed:p.particleSpeed,Radius:p.convergenceRadius,Spiral:p.spiral,Attraction:p.orbitalAttraction,Curvature:p.curvature,Convergence:p.convergence,Compression:s.compress*p.compressionAmount,Progress:s.progress,Style:p.style,SnapAge:s.snapAge,SnapEnabled:p.snap?Math.max(.15,p.snapIntensity):0,RippleRadius:s.radius,RippleAmp:s.waveEnvelope*p.rippleStrength,Size:p.pointSize,StreakLength:p.streakLength,Amplitude:p.energy?fade:0};
  for(const[k,v]of Object.entries(vals))u['u'+k].value=v;u.uResolution.value.set(w,h);
  for(let i=0;i<2;i++){const o=this.objects[i];o.geometry.instanceCount=Math.min(this.max,Math.round(p.particleDensity));o.material.uniforms.uBrightness.value=p.energyBrightness*(i?p.streakBrightness:1.7);o.visible=p.energy&&(i?p.streaks:p.particles)&&fade>.00001;}
 }
}

const sealTexture=ritualInscriptionTexture();
const all=new Set(),free=[];
function make() {
 const group=new T.Group();group.name='Rend the Veil / destination';group.matrixAutoUpdate=false;
 const summon=new SummoningSystem(group),glyphs=new GlyphSystem(group),energy=new EnergySystem(group);
 const light=new T.PointLight(magic,0,4.2,2);light.position.set(0,1.2,0);group.add(light);
 const item={group,summon,glyphs,energy,light,
  reset(seed=4817){
   // Instance variation is deterministic and lives only in particle paths.
   const rng=random(seed===4817?9553:seed);
   const seeds=new Float32Array(850*4);for(let i=0;i<seeds.length;i++)seeds[i]=rng();
   for(const o of energy.objects){o.geometry.attributes.aSeed.array.set(seeds);o.geometry.attributes.aSeed.needsUpdate=true;}
  },
  update(s,width,height){
   group.visible=!s.pending&&!s.complete;
   summon.update(s);glyphs.update(s);energy.update(s,width,height);
   light.intensity=s.build*s.active*p.floorRuneBrightness*1.7+s.energy*p.energyBrightness*.34;
  }
 };
 group.traverse(o=>{if(o.material){o.material.toneMapped=false;o.material.name='Rend the Veil / local VFX';}});
 all.add(item);return item;
}
return {
 acquire(seed){const item=free.pop()||make();item.reset(seed);return item;},
 release(item){if(!all.has(item)||free.includes(item))return;item.group.removeFromParent();item.group.visible=false;free.push(item);},
 dispose(){for(const item of all){item.group.removeFromParent();item.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}sealTexture.dispose();all.clear();free.length=0;},
 get allocated(){return all.size;},get available(){return free.length;}
};
}

export { createLocalEffectPool };
