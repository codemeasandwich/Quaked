// Shading adaptation of RockField's fixed-plane preview. POM follows a separate
// world chart, then its offset is converted back into the original albedo UVs.
import { rockUniforms, ROCK_CELLS, ROCK_BORDER, ROCK_SIDE, ROCK_TABLE_SIZE } from './r_rockfield.js';
// Compress view parallax at extreme depth to preserve readable native texture
// grain. The full height still drives normals, cavities and directional shadows.
export const ROCK_PROJECTION_CAP = .18;
export const ROCK_GLSL = `
varying float vRockWall;
varying vec2 vRockUv;
varying vec2 vRockInfo;
varying vec4 vRockBounds;
varying vec3 vRockClip0;
varying vec3 vRockClip1;
varying vec3 vRockClip2;
varying vec3 vRockClip3;
varying vec3 vRockClip4;
varying vec3 vRockClip5;
uniform sampler2DArray qrRockHeights;
uniform sampler2D qrRockPages;
uniform float qrRockOn;
uniform int qrRockProbes;
uniform vec3 qrRockSun;
int qrRockPage(vec2 tile, float field) {
 uint h = (uint(int(tile.x))*73856093u ^ uint(int(tile.y))*19349663u ^ uint(int(field))*83492791u) & ${ROCK_TABLE_SIZE-1}u;
 // The table records its actual collision depth. A static large iteration
 // shader bound encouraged excessive unrolling after the residency increase.
 for(int j=0;j<qrRockProbes;j++) {
  uint index=(h+uint(j))&${ROCK_TABLE_SIZE-1}u;
  vec4 entry=texelFetch(qrRockPages,ivec2(int(index&63u),int(index>>6u)),0);
  if(entry.w==0.) return -1;
  if(all(equal(entry.xy,tile)) && entry.z==field) return int(entry.w)-1;
 }
 return -1;
}
float qrRockLayer(vec2 p, vec2 tile, int page) {
 vec2 uv=(vec2(${ROCK_BORDER}.5)+(p-tile)*${ROCK_CELLS}.0)/${ROCK_SIDE}.0;
 return textureLod(qrRockHeights,vec3(uv,float(page)),0.).r;
}
float qrRockHeight(vec2 p) {
 vec2 tile=floor(p); int page=qrRockPage(tile,vRockInfo.x);
 return page<0?.5:qrRockLayer(p,tile,page);
}
float qrRockHint(vec2 p, vec2 tile, int page) {
 vec2 d=p-tile;
 if(all(greaterThanEqual(d,vec2(-${ROCK_BORDER}.0/${ROCK_CELLS}.0))) && all(lessThanEqual(d,vec2(1.+${ROCK_BORDER}.0/${ROCK_CELLS}.0)))) return qrRockLayer(p,tile,page);
 return qrRockHeight(p);
}
mat3 qrRockFrame(vec3 N, vec3 eyePosition) {
 vec3 q0=dFdx(-eyePosition),q1=dFdy(-eyePosition);
 vec2 st0=dFdx(vRockUv),st1=dFdy(vRockUv);
 vec3 T=cross(q1,N)*st0.x+cross(N,q0)*st1.x;
 vec3 B=cross(q1,N)*st0.y+cross(N,q0)*st1.y;
 float scale=inversesqrt(max(max(dot(T,T),dot(B,B)),1e-20));
 return mat3(T*scale,B*scale,N);
}
float qrRockClipEdge(vec2 origin,vec2 delta,vec3 edge){
 float distance=dot(edge.xy,origin)+edge.z,travel=dot(edge.xy,delta);
 if(distance<-.00001)return 0.;
 // Taper before reaching an edge. Hard-clamping the hit to the edge would
 // pin many pixels to one texel and stretch it into a mirrored-looking band.
 return travel<-.000001?max(0.,distance)/(max(0.,distance)-travel):1.;
}
vec2 qrRockClipUv(vec2 origin,vec2 proposed){
 vec2 delta=proposed-origin;
 float limit=min(min(qrRockClipEdge(origin,delta,vRockClip0),qrRockClipEdge(origin,delta,vRockClip1)),min(qrRockClipEdge(origin,delta,vRockClip2),qrRockClipEdge(origin,delta,vRockClip3)));
 limit=min(limit,min(qrRockClipEdge(origin,delta,vRockClip4),qrRockClipEdge(origin,delta,vRockClip5)));
 return origin+delta*limit;
}
`;
export const ROCK_PARALLAX_GLSL = `
vec2 qrRockQ=vRockUv,qrRockUvShift=vec2(0.);
float qrRockAmp=0.,qrRockAO=1.,qrRockSunVisibility=1.;
// Derivatives are evaluated outside divergent tile/march control flow.
mat3 qrRockTbn=qrRockFrame(normalize(vNormal),vViewPosition);
vec2 qrRdx=dFdx(vRockUv),qrRdy=dFdy(vRockUv),qrUdx=dFdx(vMapUv),qrUdy=dFdy(vMapUv);
vec2 qrTile=floor(vRockUv); int qrPage=-1;
if(qrRockOn>0. && uClassic<.5) qrPage=qrRockPage(qrTile,vRockInfo.x);
float qrEdge=min(min(vRockUv.x-vRockBounds.x,vRockUv.y-vRockBounds.y),min(vRockBounds.z-vRockUv.x,vRockBounds.w-vRockUv.y));
if(qrPage>=0 && qrRockOn>0. && uClassic<.5) {
 qrRockAmp=vRockInfo.y*qrRockOn;
 vec3 view=normalize(vViewPosition),V=vec3(dot(view,qrRockTbn[0]),dot(view,qrRockTbn[1]),dot(view,qrRockTbn[2]));
 float qrProjectionAmp=min(qrRockAmp,${ROCK_PROJECTION_CAP});
 vec2 stepUV=-V.xy/max(abs(V.z),.25)*qrProjectionAmp;
 float t0=0.,t1=0.; bool found=false;
 for(int j=0;j<=40;j++) {
  float t=float(j)/40.;vec2 test=vRockUv+stepUV*t;
  if(qrRockPage(floor(test),vRockInfo.x)<0) break;
  if(t>=1.-qrRockHeight(test)){t1=t;found=true;break;} t0=t;
 }
 if(found) {
  for(int j=0;j<3;j++){float t=(t0+t1)*.5;vec2 test=vRockUv+stepUV*t;if(t>=1.-qrRockHeight(test))t1=t;else t0=t;}
  qrRockQ=vRockUv+stepUV*((t0+t1)*.5);
 }
 float det=qrRdx.x*qrRdy.y-qrRdx.y*qrRdy.x;
 float conditioning=abs(det)/max(length(qrRdx)*length(qrRdy),1e-12);
 if(conditioning>.03) {
  vec2 d=qrRockQ-vRockUv;
  qrRockUvShift=qrUdx*((d.x*qrRdy.y-d.y*qrRdy.x)/det)+qrUdy*((qrRdx.x*d.y-qrRdx.y*d.x)/det);
  float requestedShift=length(qrRockUvShift);
  // A near-singular projection must never magnify into repeated texture
  // images. Bound only view projection; full depth still shades and shadows.
  float magnitude=length(qrRockUvShift);
  qrRockUvShift*=min(1.,.75/max(magnitude,1e-6))*smoothstep(.03,.10,conditioning);
  qrRockUvShift=qrRockClipUv(vMapUv,vMapUv+qrRockUvShift)-vMapUv;
  // The normal, cavity and self-shadow field must follow the same accepted
  // hit as the pigment, rather than a second unconstrained displaced image.
  qrRockQ=mix(vRockUv,qrRockQ,clamp(length(qrRockUvShift)/max(requestedShift,1e-6),0.,1.));
 }else qrRockQ=vRockUv;
}
`;
export const ROCK_NORMAL_GLSL = `
if(qrRockAmp>0.) {
 vec2 tile=floor(qrRockQ);int page=qrRockPage(tile,vRockInfo.x);
 if(page>=0) {
  float h=qrRockHeight(qrRockQ),e=max(1./${ROCK_CELLS}.0,max(length(qrRdx),length(qrRdy)));
  float dx=(qrRockHint(qrRockQ+vec2(e,0),tile,page)-qrRockHint(qrRockQ-vec2(e,0),tile,page))/(2.*e);
  float dy=(qrRockHint(qrRockQ+vec2(0,e),tile,page)-qrRockHint(qrRockQ-vec2(0,e),tile,page))/(2.*e);
  vec3 qrFaceNormal=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
  vec3 qrMacroNormal=normalize(qrFaceNormal-qrRockTbn[0]*dx*qrRockAmp-qrRockTbn[1]*dy*qrRockAmp);
  // Let the continuous formation own the large-scale lighting response. A
  // small amount of authored micro-normal remains, without dominating it as
  // granular sparkles when the direct-light normal contribution is increased.
  normal=vRockWall>.5?normalize(qrMacroNormal+.2*(normal-qrFaceNormal)):normalize(normal-qrRockTbn[0]*dx*qrRockAmp-qrRockTbn[1]*dy*qrRockAmp);
  vec3 L=mat3(viewMatrix)*qrRockSun;
  vec3 light=vec3(dot(L,qrRockTbn[0]),dot(L,qrRockTbn[1]),dot(L,qrRockTbn[2]));
  if(light.z>.05) {
   float z=(h-1.)*qrRockAmp,travel=min(1.5,(1.-h)*qrRockAmp/max(light.z,.1));
   float shadowSteps=clamp(ceil(travel*length(light.xy)*96.),12.,48.);
   for(int j=1;j<=48;j++) {
    if(float(j)>shadowSteps)break;
    float t=travel*float(j)/shadowSteps;vec2 p=qrRockQ+light.xy*t;
    // Unknown tiles never manufacture blockers.
    if(qrRockPage(floor(p),vRockInfo.x)<0) continue;
    float diff=(qrRockHeight(p)-1.)*qrRockAmp-(z+light.z*t);
    qrRockSunVisibility=min(qrRockSunVisibility,1.-smoothstep(.0007,.004,diff));
   }
  }
  // Macro cavity lighting must span a rock formation, not just the tiny
  // texture-grain neighbourhood. Peaks stay unattenuated; recesses retain
  // their broad depth cue in daylight without bleaching the exposed side.
  float r=.30;
  float cavity=max(0.,(qrRockHint(qrRockQ+vec2(r,0),tile,page)+qrRockHint(qrRockQ-vec2(r,0),tile,page)+qrRockHint(qrRockQ+vec2(0,r),tile,page)+qrRockHint(qrRockQ-vec2(0,r),tile,page))*.25-h);
  qrRockAO=max(.18,exp(-cavity*qrRockAmp*12.));
 }
}
`;
export function R_PatchRockShader( shader ) {
 Object.assign( shader.uniforms, rockUniforms );
 shader.vertexShader = 'attribute float rockWall;\nvarying float vRockWall;\nattribute vec2 rockUv;\nattribute vec2 rockInfo;\nattribute vec4 rockBounds;\nvarying vec2 vRockUv;\nvarying vec2 vRockInfo;\nvarying vec4 vRockBounds;\n' + shader.vertexShader.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvRockWall=rockWall;vRockUv=rockUv;vRockInfo=rockInfo;vRockBounds=rockBounds;' );
 shader.fragmentShader = ROCK_GLSL + shader.fragmentShader;
 for(let i=0;i<6;i++)shader.vertexShader='attribute vec3 rockClip'+i+';\nvarying vec3 vRockClip'+i+';\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRockClip'+i+'=rockClip'+i+';');
}
