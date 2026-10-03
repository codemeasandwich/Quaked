// Shading adaptation of RockField's fixed-plane preview. POM follows a separate
// world chart, then its offset is converted back into the original albedo UVs.
import { rockUniforms, ROCK_CELLS, ROCK_BORDER, ROCK_SIDE, ROCK_PROBES } from './r_rockfield.js';
// Compress view parallax at extreme depth to preserve readable native texture
// grain. The full height still drives normals, cavities and directional shadows.
export const ROCK_PROJECTION_CAP = .18;
export const ROCK_GLSL = `
varying vec2 vRockUv;
varying vec2 vRockInfo;
varying vec4 vRockBounds;
uniform sampler2DArray qrRockHeights;
uniform sampler2D qrRockPages;
uniform float qrRockOn;
uniform int qrRockProbes;
uniform vec3 qrRockSun;
int qrRockPage(vec2 tile, float field) {
 uint h = (uint(int(tile.x))*73856093u ^ uint(int(tile.y))*19349663u ^ uint(int(field))*83492791u) & 2047u;
 for(int j=0;j<${ROCK_PROBES};j++) {
  if(j>=qrRockProbes) break;
  uint index=(h+uint(j))&2047u;
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
 qrRockAmp=vRockInfo.y*qrRockOn*smoothstep(0.,.08,qrEdge)*(1.-smoothstep(900.,1600.,length(vViewPosition)));
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
 if(abs(det)>1e-12) {
  vec2 d=qrRockQ-vRockUv;
  qrRockUvShift=qrUdx*((d.x*qrRdy.y-d.y*qrRdy.x)/det)+qrUdy*((qrRdx.x*d.y-qrRdx.y*d.x)/det);
 }
}
`;
export const ROCK_NORMAL_GLSL = `
if(qrRockAmp>0.) {
 vec2 tile=floor(qrRockQ);int page=qrRockPage(tile,vRockInfo.x);
 if(page>=0) {
  float h=qrRockHeight(qrRockQ),e=1./${ROCK_CELLS}.0;
  float dx=(qrRockHint(qrRockQ+vec2(e,0),tile,page)-qrRockHint(qrRockQ-vec2(e,0),tile,page))/(2.*e);
  float dy=(qrRockHint(qrRockQ+vec2(0,e),tile,page)-qrRockHint(qrRockQ-vec2(0,e),tile,page))/(2.*e);
  normal=normalize(normal-qrRockTbn[0]*dx*qrRockAmp-qrRockTbn[1]*dy*qrRockAmp);
  vec3 L=mat3(viewMatrix)*qrRockSun;
  vec3 light=vec3(dot(L,qrRockTbn[0]),dot(L,qrRockTbn[1]),dot(L,qrRockTbn[2]));
  if(light.z>.05) {
   float z=(h-1.)*qrRockAmp,travel=min(1.5,(1.-h)*qrRockAmp/max(light.z,.1));
   for(int j=1;j<=12;j++) {
    float t=travel*float(j)/12.;vec2 p=qrRockQ+light.xy*t;
    // Unknown tiles never manufacture blockers.
    if(qrRockPage(floor(p),vRockInfo.x)<0) continue;
    float diff=(qrRockHeight(p)-1.)*qrRockAmp-(z+light.z*t);
    qrRockSunVisibility=min(qrRockSunVisibility,1.-smoothstep(.0007,.004,diff));
   }
  }
  float r=.03;
  float cavity=max(0.,(qrRockHint(qrRockQ+vec2(r,0),tile,page)+qrRockHint(qrRockQ-vec2(r,0),tile,page)+qrRockHint(qrRockQ+vec2(0,r),tile,page)+qrRockHint(qrRockQ-vec2(0,r),tile,page))*.25-h);
  qrRockAO=exp(-cavity*qrRockAmp*28.);
 }
}
`;
export function R_PatchRockShader( shader ) {
 Object.assign( shader.uniforms, rockUniforms );
 shader.vertexShader = 'attribute vec2 rockUv;\nattribute vec2 rockInfo;\nattribute vec4 rockBounds;\nvarying vec2 vRockUv;\nvarying vec2 vRockInfo;\nvarying vec4 vRockBounds;\n' + shader.vertexShader.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvRockUv=rockUv;vRockInfo=rockInfo;vRockBounds=rockBounds;' );
 shader.fragmentShader = ROCK_GLSL + shader.fragmentShader;
}
