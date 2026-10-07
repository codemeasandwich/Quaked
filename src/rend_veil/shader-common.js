// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
const SAFE_MATH_GLSL=`
// GLSL pow(x, n) is undefined for x < 0, even when n is an integer.
// Signed distances are squared by multiplication; fractional-power bases are clamped.
float squareSafe(float x){return x*x;}
float divideW(float w){return abs(w)>.00001?w:(w<0.?-.00001:.00001);}
vec2 unitSafe(vec2 v){return v*inversesqrt(max(dot(v,v),1.e-12));}
vec3 unitSafe(vec3 v){return v*inversesqrt(max(dot(v,v),1.e-12));}
float angleSafe(vec2 v){return dot(v,v)<1.e-12?0.:atan(v.y,v.x);}
vec2 uvSafe(vec2 uv,vec2 fallback,vec2 resolution){
 if(any(isnan(uv))||any(isinf(uv)))uv=fallback;
 vec2 inset=.5/max(resolution,vec2(2.));return clamp(uv,inset,1.-inset);
}
float channelSafe(float x,float fallback){
 if(isnan(x))return fallback;
 if(isinf(x))return x>0.?60000.:0.;
 return clamp(x,0.,60000.);
}
vec3 colorSafe(vec3 c,vec3 fallback){return vec3(channelSafe(c.r,fallback.r),channelSafe(c.g,fallback.g),channelSafe(c.b,fallback.b));}
`;

const COMMON_GLSL=`
${SAFE_MATH_GLSL}
float h1(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
mat2 rot2(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float lineSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/max(dot(ba,ba),.00001),0.,1.));}
float glyph(vec2 q){vec2 id=floor(q);vec2 f=fract(q)-.5;float s=h3(vec3(id,1.));float d=lineSeg(f,vec2(-.27,-.32),vec2(-.27,.32));d=min(d,lineSeg(f,vec2(-.27,.25),vec2(.24,.05)));if(s>.3)d=min(d,lineSeg(f,vec2(-.26,-.08),vec2(.24,-.3)));if(s>.62)d=min(d,abs(length(f-vec2(.1,.17))-.14));else d=min(d,lineSeg(f,vec2(.26,-.28),vec2(.26,.3)));return 1.-smoothstep(.014,.03,d);}
`;

export { SAFE_MATH_GLSL,COMMON_GLSL };
