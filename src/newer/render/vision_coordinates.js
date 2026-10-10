/**
 * @module newer/render/vision_coordinates
 *
 * The compositor's primary optical ray, shared by its colour taps.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The compositor records its primary optical ray. Secondary chromatic/blur
// colour taps share that ray's receiver, as existing deferred lighting does.
export const VISION_UV_PACK_GLSL=`
vec4 visionEncodeUV(vec2 uv){vec2 q=floor(clamp(uv,0.,1.)*65535.+.5);return vec4(floor(q.x/256.),mod(q.x,256.),floor(q.y/256.),mod(q.y,256.))/255.;}
vec2 visionDecodeUV(vec4 p){vec4 b=floor(p*255.+.5);return vec2(b.x*256.+b.y,b.z*256.+b.w)/65535.;}
`;
export const VISION_COORDINATES_GLSL=`
${VISION_UV_PACK_GLSL}
uniform sampler2D tVisionCoordinates;
uniform float uVisionCoordinates;
vec2 visionRawUV(vec2 uv){if(uVisionCoordinates<.5)return uv;vec4 p=texture(tVisionCoordinates,uv);return uVisionCoordinates>1.5?visionDecodeUV(p):p.xy;}
`;

export const VISION_PREVIOUS_COORDINATES_GLSL=`
uniform sampler2D tPreviousCoordinates;
uniform float uPreviousCoordinates;
vec2 visionPreviousRaw(vec2 uv){vec4 p=texture(tPreviousCoordinates,uv);return uPreviousCoordinates>1.5?visionDecodeUV(p):p.xy;}
vec3 visionPreviousUV(vec2 raw){
 if(uPreviousCoordinates<.5)return vec3(raw,1.);
 vec2 uv=raw,px=1./uResolution;
 float valid=1.;
 for(int i=0;i<4;i++){
  vec2 value=visionPreviousRaw(clamp(uv,px*.5,1.-px*.5));
  vec2 dx=(visionPreviousRaw(clamp(uv+vec2(px.x,0),px*.5,1.-px*.5))-visionPreviousRaw(clamp(uv-vec2(px.x,0),px*.5,1.-px*.5)))/(2.*px.x);
  vec2 dy=(visionPreviousRaw(clamp(uv+vec2(0,px.y),px*.5,1.-px*.5))-visionPreviousRaw(clamp(uv-vec2(0,px.y),px*.5,1.-px*.5)))/(2.*px.y);
  float determinant=dx.x*dy.y-dy.x*dx.y;
  if(determinant<.05||determinant>20.){valid=0.;break;}
  vec2 error=value-raw;
  uv-=clamp(vec2(dy.y*error.x-dy.x*error.y,-dx.y*error.x+dx.x*error.y)/determinant,vec2(-.08),vec2(.08));
 }
 vec2 residual=abs(visionPreviousRaw(clamp(uv,px*.5,1.-px*.5))-raw);
 valid*=float(all(greaterThan(uv,vec2(0)))&&all(lessThan(uv,vec2(1)))&&all(lessThan(residual,px*1.5)));
 return vec3(uv,valid);
}
`;
