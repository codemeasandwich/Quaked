/**
 * @module newer/render/r_rockshader
 *
 * The rock relief's shading, adapted from its preview to the world's charts.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Shading adaptation of RockField's fixed-plane preview. POM follows a separate
// world chart, then its offset is converted back into the original albedo UVs.
import { rockUniforms, ROCK_CELLS, ROCK_BORDER, ROCK_SIDE, ROCK_TABLE_SIZE } from './r_rockfield.js';
// Compress view parallax at extreme depth to preserve readable native texture
// grain. The full height still drives normals, cavities and directional shadows.
export const ROCK_PROJECTION_CAP = .18;
// A painted mid-tile fissure must not become a straight repeated course.
// Distort sampling only, with a continuous seeded rest-space function. No
// image edits, tile-local randomness, streamed-page dependency or time drift.
export const rockBandWarpOn = { value: 1 };
export const ROCK_BAND_WARP_GLSL = `
varying vec2 vRockWarp;
uniform float qrRockBandWarpOn;
uniform float uClassic;
float qrRockBandHash(ivec2 p,uint seed) {
 uint h=uint(p.x)*73856093u ^ uint(p.y)*19349663u ^ seed;
 h^=h>>16u;h*=2246822519u;h^=h>>13u;h*=3266489917u;h^=h>>16u;
 return float(h&65535u)/65535.;
}
float qrRockBandNoise(vec2 p,uint seed) {
 ivec2 i=ivec2(floor(p));vec2 f=fract(p);
 f=f*f*f*(f*(f*6.-15.)+10.);
 return mix(mix(qrRockBandHash(i,seed),qrRockBandHash(i+ivec2(1,0),seed),f.x),
            mix(qrRockBandHash(i+ivec2(0,1),seed),qrRockBandHash(i+ivec2(1,1),seed),f.x),f.y);
}
vec2 qrRockBandOffset(vec2 p) {
 if(vRockWarp.y<=0. || qrRockBandWarpOn<=0. || qrRockOn<=0. || uClassic>=.5)return vec2(0.);
 uint seed=uint(floor(vRockWarp.x+.5));
 vec2 a=vec2(qrRockBandNoise(p*2.,seed),qrRockBandNoise(p*2.,seed^1013u));
 vec2 b=vec2(qrRockBandNoise(p*5.,seed^7919u),qrRockBandNoise(p*5.,seed^104729u));
 return ((a-.5)*1.7+(b-.5)*.3)*vRockWarp.y*qrRockBandWarpOn*qrRockOn*(1.-uClassic);
}
`;
export const ROCK_GLSL = `
varying float vRockWall;
varying vec2 vRockUv;
varying vec2 vRockInfo;
varying vec4 vRockBounds;
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
`;
export const ROCK_PARALLAX_GLSL = `
vec2 qrRockQ=vRockUv,qrRockUvShift=vec2(0.);
float qrRockAmp=0.,qrRockAO=1.,qrRockSunVisibility=1.;
// Derivatives are evaluated outside divergent tile/march control flow.
vec3 qrRockN=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
vec3 qrRockGradU,qrRockGradV;float qrRockUnit;
qrHeightGradients(-vViewPosition,vRockUv,qrRockN,qrRockGradU,qrRockGradV,qrRockUnit);
// Height amplitudes are fractions of 256 world units, not normalized UV axes.
qrRockGradU*=256.;qrRockGradV*=256.;
vec3 qrMapGradU,qrMapGradV;float qrMapUnit;
qrHeightGradients(-vViewPosition,vMapUv,qrRockN,qrMapGradU,qrMapGradV,qrMapUnit);
vec2 qrRdx=dFdx(vRockUv),qrRdy=dFdy(vRockUv);
vec2 qrTile=floor(vRockUv); int qrPage=-1;
if(qrRockOn>0. && uClassic<.5) qrPage=qrRockPage(qrTile,vRockInfo.x);
if(qrPage>=0 && qrRockOn>0. && uClassic<.5) {
 qrRockAmp=vRockInfo.y*qrRockOn;
 vec3 view=normalize(vViewPosition),V=vec3(dot(view,qrRockGradU),dot(view,qrRockGradV),dot(view,qrRockN));
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
 // Convert the SAME accepted world ray to native pigment coordinates. Do
 // not invert projected field UVs: that fails on near-parallel projections
 // and makes relief depend on camera roll. Both coordinates use one limiter.
 if(found) {
  float hit=(t0+t1)*.5;
  vec2 mapStep=-vec2(dot(view,qrMapGradU),dot(view,qrMapGradV))*256./max(abs(V.z),.25)*qrProjectionAmp;
  qrRockUvShift=mapStep*hit;
  float magnitude=length(qrRockUvShift),limit=min(1.,.75/max(magnitude,1e-6));
  qrRockUvShift*=limit;
  qrRockQ=vRockUv+stepUV*hit*limit;
 }
 // Repeat-wrapped pigment is defined beyond a polygon. Rasterization owns
 // coverage; clamping here would create seams at every internal BSP edge.
}
`;
export const ROCK_NORMAL_GLSL = `
if(qrRockAmp>0.) {
 vec2 tile=floor(qrRockQ);int page=qrRockPage(tile,vRockInfo.x);
 if(page>=0) {
  float h=qrRockHeight(qrRockQ),e=max(1./${ROCK_CELLS}.0,max(length(qrRdx),length(qrRdy)));
  float dx=(qrRockHint(qrRockQ+vec2(e,0),tile,page)-qrRockHint(qrRockQ-vec2(e,0),tile,page))/(2.*e);
  float dy=(qrRockHint(qrRockQ+vec2(0,e),tile,page)-qrRockHint(qrRockQ-vec2(0,e),tile,page))/(2.*e);
  vec3 qrFaceNormal=qrRockN;
  vec3 qrMacroNormal=normalize(qrFaceNormal-qrRockGradU*dx*qrRockAmp-qrRockGradV*dy*qrRockAmp);
  // Let the continuous formation own the large-scale lighting response. A
  // small amount of authored micro-normal remains, without dominating it as
  // granular sparkles when the direct-light normal contribution is increased.
  normal=vRockWall>.5?normalize(qrMacroNormal+.2*(normal-qrFaceNormal)):normalize(normal-qrRockGradU*dx*qrRockAmp-qrRockGradV*dy*qrRockAmp);
  vec3 L=mat3(viewMatrix)*qrRockSun;
  vec3 light=vec3(dot(L,qrRockGradU),dot(L,qrRockGradV),dot(L,qrRockN));
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
/**
 * Adds the rock relief to a world surface material's shader, from gl_post.js's world-shader patch (onBeforeCompile)
 * for a material flagged as rock, after that patch has rewired the shadow-gradient UVs. Shares r_rockfield.js's
 * uniforms and `rockBandWarpOn` by reference (so changing them affects every rock material at once), declares the
 * per-vertex rock attributes (rockWarp, rockWall, rockUv, rockInfo, rockBounds) and passes them to varyings, and
 * prepends ROCK_GLSL and ROCK_BAND_WARP_GLSL to the fragment shader (whose own `uniform float uClassic;` it removes,
 * since the band-warp GLSL declares it).
 *
 * @param {{ uniforms: Object, vertexShader: string, fragmentShader: string }} shader three's onBeforeCompile shader
 * object; mutated in place
 */
export function R_PatchRockShader( shader ) {
 Object.assign( shader.uniforms, rockUniforms );
 shader.uniforms.qrRockBandWarpOn = rockBandWarpOn;
 shader.vertexShader = 'attribute vec2 rockWarp;\nvarying vec2 vRockWarp;\nattribute float rockWall;\nvarying float vRockWall;\nattribute vec2 rockUv;\nattribute vec2 rockInfo;\nattribute vec4 rockBounds;\nvarying vec2 vRockUv;\nvarying vec2 vRockInfo;\nvarying vec4 vRockBounds;\n' + shader.vertexShader.replace( '#include <begin_vertex>', '#include <begin_vertex>\nvRockWarp=rockWarp;vRockWall=rockWall;vRockUv=rockUv;vRockInfo=rockInfo;vRockBounds=rockBounds;' );
 shader.fragmentShader = ROCK_GLSL + ROCK_BAND_WARP_GLSL + shader.fragmentShader.replace( 'uniform float uClassic;', '' );
}
