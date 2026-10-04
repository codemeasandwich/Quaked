// Local virtual-height self-shadowing shared by world and alias materials.
// Callers own height samplers and the frozen pre-HDR light ordering. This module
// neither imports the renderer pipeline nor changes geometry/albedo/emission.
import * as THREE from 'three';
import { cvar_t } from './cvar.js';

export const r_heightshadows = new cvar_t( 'r_heightshadows', '1', true );
export const HEIGHT_SHADOW_POINTS = 8;
export const HEIGHT_SHADOW_SOURCES = 10;
export const HEIGHT_SHADOW_STEPS = 48; // bounded maximum; short rays retain twelve samples
export const HEIGHT_SHADOW_MARKER = 0x40000000;
export const HEIGHT_SHADOW_ROCK_MARKER = 0x80000000;
export const HEIGHT_SHADOW_INVALID = 0xffffffff;
const RANGE_LIMIT = 4096;
const clamp = ( value, lo, hi ) => Math.max( lo, Math.min( hi, value ) );

export const heightShadowUniforms = {

	uHeightShadowOn: { value: 0 }, uHeightCount: { value: 0 },
	uHeightPointWorld: { value: Array.from( { length: HEIGHT_SHADOW_POINTS }, () => new THREE.Vector4() ) },
	uHeightPointColor: { value: Array.from( { length: HEIGHT_SHADOW_POINTS }, () => new THREE.Vector3() ) },
	uHeightSunDirWorld: { value: new THREE.Vector3() }, uHeightSunOn: { value: 0 }, uHeightSunColor: { value: new THREE.Vector3() },
	uHeightSpotPosWorld: { value: new THREE.Vector4() }, uHeightSpotDirWorld: { value: new THREE.Vector3() },
	uHeightSpotCone: { value: new THREE.Vector2( 1, 1 ) }, uHeightSpotOn: { value: 0 }, uHeightSpotColor: { value: new THREE.Vector3() }

};
let scoped = false;
function vector( input ) {

	const values = input?.isVector3 || input?.isVector4 ? [ input.x, input.y, input.z ] : input;
	return values?.length >= 3 && [ values[ 0 ], values[ 1 ], values[ 2 ] ].every( Number.isFinite ) ? [ values[ 0 ], values[ 1 ], values[ 2 ] ] : null;

}
function color( input ) {

	const values = vector( input?.isColor ? [ input.r, input.g, input.b ] : input );
	return values ? values.map( value => clamp( value, 0, 65536 ) ) : [ 0, 0, 0 ];

}
function direction( input ) {

	const values = vector( input ), length = values && Math.hypot( ...values );
	return length > 1e-8 ? values.map( value => value / length ) : null;

}
const range = input => Number.isFinite( input ) && input > 0 ? Math.min( RANGE_LIMIT, input ) : 0;

// Snapshot schema: points[{position,range,color}], sun{direction,on,color},
// spot{position,range,direction,cone:[innerCos,outerCos],on,color}. Colors are
// linear and positions/directions are world-space. Copy values, never reorder
// points or retain mutable snapshot objects between HDR and composition.
export function R_HeightShadowFrame( snapshot = {} ) {

	snapshot ||= {};
	const points = Array.isArray( snapshot.points ) ? snapshot.points : [], count = Math.min( HEIGHT_SHADOW_POINTS, points.length );
	heightShadowUniforms.uHeightCount.value = count;
	for ( let i = 0; i < HEIGHT_SHADOW_POINTS; i ++ ) {

		const item = i < count ? points[ i ] : null, position = vector( item?.position ), far = range( item?.range );
		heightShadowUniforms.uHeightPointWorld.value[ i ].set( ...( position || [ 0, 0, 0 ] ), position ? far : 0 );
		heightShadowUniforms.uHeightPointColor.value[ i ].fromArray( position && far ? color( item?.color ) : [ 0, 0, 0 ] );

	}
	const sun = snapshot.sun, sunDirection = direction( sun?.direction );
	heightShadowUniforms.uHeightSunDirWorld.value.fromArray( sunDirection || [ 0, 0, 0 ] );
	heightShadowUniforms.uHeightSunColor.value.fromArray( sunDirection ? color( sun?.color ) : [ 0, 0, 0 ] );
	heightShadowUniforms.uHeightSunOn.value = sunDirection && sun?.on ? 1 : 0;
	const spot = snapshot.spot, spotPosition = vector( spot?.position ), spotDirection = direction( spot?.direction ), spotRange = range( spot?.range );
	heightShadowUniforms.uHeightSpotPosWorld.value.set( ...( spotPosition || [ 0, 0, 0 ] ), spotPosition ? spotRange : 0 );
	heightShadowUniforms.uHeightSpotDirWorld.value.fromArray( spotDirection || [ 0, 0, 0 ] );
	heightShadowUniforms.uHeightSpotColor.value.fromArray( spotPosition && spotDirection && spotRange ? color( spot?.color ) : [ 0, 0, 0 ] );
	const cone = spot?.cone, a = Number.isFinite( cone?.[ 0 ] ) ? clamp( cone[ 0 ], -1, 1 ) : 1, b = Number.isFinite( cone?.[ 1 ] ) ? clamp( cone[ 1 ], -1, 1 ) : 1;
	heightShadowUniforms.uHeightSpotCone.value.set( Math.max( a, b ), Math.min( a, b ) );
	heightShadowUniforms.uHeightSpotOn.value = spotPosition && spotDirection && spotRange && spot?.on ? 1 : 0;
	R_HeightShadowScope( scoped ); return heightShadowUniforms;

}

export function R_HeightShadowScope( on ) {

	scoped = on === true; heightShadowUniforms.uHeightShadowOn.value = scoped && r_heightshadows.value > 0 ? 1 : 0;
	return heightShadowUniforms.uHeightShadowOn.value;

}

// Little-endian RGBA byte storage: payload bits 0..29 are ten 3-bit visibilities;
// bits 31..30 are 01 (generic) or 10 (displaced rock wall). Both all-zero and all-FF clears are invalid/lit.
export function R_HeightShadowPack( visibilities = [], rockWall = false ) {

	let word = rockWall ? HEIGHT_SHADOW_ROCK_MARKER : HEIGHT_SHADOW_MARKER;
	for ( let i = 0; i < HEIGHT_SHADOW_SOURCES; i ++ ) {

		const value = Number.isFinite( visibilities[ i ] ) ? clamp( visibilities[ i ], 0, 1 ) : 1;
		word = ( word | ( Math.round( value * 7 ) << ( 3 * i ) ) ) >>> 0;

	}
	return new Uint8Array( [ word & 255, ( word >>> 8 ) & 255, ( word >>> 16 ) & 255, word >>> 24 ] );

}

export function R_HeightShadowDecode( mask, index ) {

	if ( index !== undefined && ( ! Number.isInteger( index ) || index < 0 || index >= HEIGHT_SHADOW_SOURCES ) ) throw new RangeError( 'Height shadow index must be 0..9' );
	let word = HEIGHT_SHADOW_INVALID;
	if ( Number.isInteger( mask ) && mask >= 0 && mask <= 0xffffffff ) word = mask >>> 0;
	else if ( mask?.length === 4 && Array.from( mask ).every( value => Number.isInteger( value ) && value >= 0 && value <= 255 ) )
		word = ( mask[ 0 ] | ( mask[ 1 ] << 8 ) | ( mask[ 2 ] << 16 ) | ( mask[ 3 ] << 24 ) ) >>> 0;
	const valid = ( word >>> 30 ) === 1 || ( word >>> 30 ) === 2;
	const at = i => valid ? ( ( word >>> ( i * 3 ) ) & 7 ) / 7 : 1;
	return index === undefined ? Array.from( { length: HEIGHT_SHADOW_SOURCES }, ( _, i ) => at( i ) ) : at( index );

}

// Fragment-only GLSL. Providers define qrShadowHeight/Known after their sampler
// declarations. Context gradients and normal are VIEW-space; amplitudes/caps
// are UV-height units, while unit converts one UV-height unit to world units.
export const HEIGHT_SHADOW_GLSL = `
uniform float uHeightShadowOn;
uniform int uHeightCount;
uniform vec4 uHeightPointWorld[${HEIGHT_SHADOW_POINTS}];
uniform vec3 uHeightPointColor[${HEIGHT_SHADOW_POINTS}];
uniform vec3 uHeightSunDirWorld;
uniform float uHeightSunOn;
uniform vec3 uHeightSunColor;
uniform vec4 uHeightSpotPosWorld;
uniform vec3 uHeightSpotDirWorld;
uniform vec2 uHeightSpotCone;
uniform float uHeightSpotOn;
uniform vec3 uHeightSpotColor;
struct HeightShadowContext {
 vec2 microUv;vec2 macroUv;
 vec3 microGradU;vec3 microGradV;vec3 macroGradU;vec3 macroGradV;vec3 normal;
 float microUnit;float macroUnit;float microAmp;float macroAmp;
 float microMaxUv;float macroMaxUv;float microValid;float macroValid;float macroSun;
};
float qrShadowHeight(vec2 uv,int layer);
bool qrShadowKnown(vec2 uv,int layer);
// Call unconditionally before divergent source/height branches. These are true
// covariant world/view-displacement -> UV gradients, not normalized TBN axes.
void qrHeightGradients(vec3 P,vec2 uv,vec3 N,out vec3 gradU,out vec3 gradV,out float worldUnit) {
 vec3 dx=dFdx(P),dy=dFdy(P);vec2 ux=dFdx(uv),uy=dFdy(uv);
 vec3 n=N*inversesqrt(max(dot(N,N),1e-20)),a=cross(dy,n),b=cross(n,dx);float determinant=dot(dx,a);
 gradU=vec3(0.);gradV=vec3(0.);worldUnit=0.;
 if(abs(determinant)>1e-12){
  gradU=(a*ux.x+b*uy.x)/determinant;gradV=(a*ux.y+b*uy.y)/determinant;
  float magnitude=max(dot(gradU,gradU),dot(gradV,gradV));
  if(magnitude>1e-20)worldUnit=inversesqrt(magnitude);
 }
}
float qrHeightRay(vec3 P,vec3 N,vec3 light, bool finiteLight,vec2 uv,vec3 gradU,vec3 gradV,float worldUnit,float amplitude,float maxUv,int layer) {
 if(worldUnit<=0.||amplitude<=0.||maxUv<=0.||!qrShadowKnown(uv,layer))return 1.;
 float h=clamp(qrShadowHeight(uv,layer),0.,1.);
 float originHeight=(h-1.)*amplitude;
 vec3 surface=P+N*(originHeight*worldUnit);
 // Finite lights are aimed from the actual virtual-height origin. Using only
 // the undisplaced plane direction would over-darken grazing shallow details.
 vec3 delta=finiteLight?light-surface:light;float lightDistance=length(delta);
 if(lightDistance<1e-6)return 1.;vec3 L=delta/lightDistance;float above=dot(L,N);
 if(above<=1e-5)return 1.;
 vec2 velocity=vec2(dot(L,gradU),dot(L,gradV));float uvSpeed=length(velocity);
 if(uvSpeed<1e-8||h>=.999999)return 1.;
 float travel=(1.-h)*amplitude*worldUnit/above;
 if(finiteLight)travel=min(travel,lightDistance);
 travel=min(travel,maxUv/uvSpeed);float visibility=1.;
 // Long grazing rays need enough intervals to cover narrow height ridges.
 float steps=clamp(ceil(travel*uvSpeed*(layer==0?192.:96.)),12.,${HEIGHT_SHADOW_STEPS}.);
 for(int sampleIndex=1;sampleIndex<=${HEIGHT_SHADOW_STEPS};sampleIndex++){
  if(float(sampleIndex)>steps)break;
  float t=travel*float(sampleIndex)/steps;vec2 sampleUv=uv+velocity*t;
  if(!qrShadowKnown(sampleUv,layer))continue;
  float blocker=(clamp(qrShadowHeight(sampleUv,layer),0.,1.)-1.)*amplitude;
  float ray=originHeight+above*t/worldUnit;
  float difference=blocker-ray-.0003;
  visibility=min(visibility,1.-smoothstep(.0002,.001,difference));
 }
 return visibility;
}
float qrHeightLayers(vec3 P,HeightShadowContext context,vec3 light,bool finiteLight,bool sun) {
 vec3 N=normalize(context.normal);float visibility=1.;
 if(context.microValid>.5&&context.microAmp>0.&&context.microUnit>0.)visibility*=qrHeightRay(P,N,light,finiteLight,context.microUv,context.microGradU,context.microGradV,context.microUnit,context.microAmp,context.microMaxUv,0);
 if(context.macroValid>.5&&context.macroAmp>0.&&context.macroUnit>0.){
  if(sun)visibility*=clamp(context.macroSun,0.,1.);
  else visibility*=qrHeightRay(P,N,light,finiteLight,context.macroUv,context.macroGradU,context.macroGradV,context.macroUnit,context.macroAmp,context.macroMaxUv,1);
 }
 return visibility;
}
float qrHeightWeight(vec3 color){return dot(max(color,vec3(0.)),vec3(.2126,.7152,.0722));}
float qrHeightCone(float cosine){
 return uHeightSpotCone.x>uHeightSpotCone.y+.00001?smoothstep(uHeightSpotCone.y,uHeightSpotCone.x,cosine):step(uHeightSpotCone.y,cosine);
}
uint qrHeightQuantize(float visibility){return uint(floor(clamp(visibility,0.,1.)*7.+.5));}
vec4 qrHeightBytes(uint mask){return vec4(float(mask&255u),float((mask>>8u)&255u),float((mask>>16u)&255u),float((mask>>24u)&255u))/255.;}
vec4 qrHeightBuildMask(vec3 P,HeightShadowContext context,out float diffuseVisibility){
 diffuseVisibility=1.;
 bool micro=context.microValid>.5&&context.microAmp>0.&&context.microUnit>0.;
 bool macro=context.macroValid>.5&&context.macroAmp>0.&&context.macroUnit>0.;
 if(uHeightShadowOn<.5||(!micro&&!macro)||dot(context.normal,context.normal)<1e-12)return vec4(1.);
 vec3 N=normalize(context.normal);uint mask=0x40000000u;float weightSum=0.,visibleSum=0.;
 for(int index=0;index<${HEIGHT_SHADOW_POINTS};index++){
  float visibility=1.;float weight=0.;
  if(index<uHeightCount){
   vec4 point=uHeightPointWorld[index];float intensity=qrHeightWeight(uHeightPointColor[index]);
   if(point.w>0.&&intensity>0.){
    vec3 light=(viewMatrix*vec4(point.xyz,1.)).xyz;vec3 delta=light-P;float distanceToLight=length(delta);
    if(distanceToLight>1e-6&&distanceToLight<point.w){
     float facing=dot(delta/distanceToLight,N);
     if(facing>0.){weight=intensity*facing*pow(max(0.,1.-distanceToLight/point.w),2.);visibility=qrHeightLayers(P,context,light,true,false);}
    }
   }
  }
  mask|=qrHeightQuantize(visibility)<<uint(index*3);weightSum+=weight;visibleSum+=weight*visibility;
 }
 float sunVisibility=1.,sunWeight=qrHeightWeight(uHeightSunColor);
 if(uHeightSunOn>.5&&sunWeight>0.){
  vec3 light=mat3(viewMatrix)*uHeightSunDirWorld;float lengthLight=length(light);
  float facing=lengthLight>1e-6?dot(light/lengthLight,N):0.;
  if(facing>0.){sunWeight*=facing;sunVisibility=qrHeightLayers(P,context,light,false,true);}else sunWeight=0.;
 }else sunWeight=0.;
 mask|=qrHeightQuantize(sunVisibility)<<24u;weightSum+=sunWeight;visibleSum+=sunWeight*sunVisibility;
 float spotVisibility=1.,spotWeight=qrHeightWeight(uHeightSpotColor);
 if(uHeightSpotOn>.5&&spotWeight>0.&&uHeightSpotPosWorld.w>0.){
  vec3 light=(viewMatrix*vec4(uHeightSpotPosWorld.xyz,1.)).xyz;vec3 delta=light-P;float distanceToLight=length(delta);
  if(distanceToLight>1e-6&&distanceToLight<uHeightSpotPosWorld.w){
   vec3 L=delta/distanceToLight,direction=mat3(viewMatrix)*uHeightSpotDirWorld;
   float facing=dot(L,N),cone=qrHeightCone(dot(-L,normalize(direction)));
   if(facing>0.&&cone>0.){spotWeight*=facing*cone*pow(max(0.,1.-distanceToLight/uHeightSpotPosWorld.w),2.);spotVisibility=qrHeightLayers(P,context,light,true,false);}else spotWeight=0.;
  }else spotWeight=0.;
 }else spotWeight=0.;
 mask|=qrHeightQuantize(spotVisibility)<<27u;weightSum+=spotWeight;visibleSum+=spotWeight*spotVisibility;
 if(weightSum>1e-8)diffuseVisibility=mix(1.,visibleSum/weightSum,.75);
 return qrHeightBytes(mask);
}
`;

// Nearest, NoColorSpace RGBA8 input. No Gamma/color correction or interpolation
// may be applied to these packed bytes. Exact marker validation rejects clears.
export const HEIGHT_MASK_DECODE_GLSL = `
uniform sampler2D tHeightShadow;
uniform float uHeightMasks;
bool heightMaskValid(vec2 uv){
 if(uHeightMasks<.5)return false;
 uvec4 bytes=uvec4(floor(clamp(texture2D(tHeightShadow,uv),0.,1.)*255.+.5));
 uint kind=bytes.a&192u;return kind==64u||kind==128u;
}
float heightRockContrast(vec2 uv,float shadowedWeight,float visibleWeight){
 if(uHeightMasks<.5||visibleWeight<=1e-8)return 1.;
 uint tag=uint(floor(clamp(texture2D(tHeightShadow,uv).a,0.,1.)*255.+.5))&192u;
 if(tag!=128u)return 1.;
 // Preserve normal daylight brightness. Only a dim, actually reached source
 // earns extra exposed-face definition; a source-free wall receives no lift.
 float exposure=clamp(shadowedWeight/visibleWeight,0.,1.);
 float dimSource=1.-smoothstep(.10,.45,visibleWeight);
 return mix(.5,1.+dimSource,exposure);
}
float heightMaskVisibility(vec2 uv,int index){
 if(uHeightMasks<.5||index<0||index>=${HEIGHT_SHADOW_SOURCES})return 1.;
 uvec4 bytes=uvec4(floor(clamp(texture2D(tHeightShadow,uv),0.,1.)*255.+.5));
 uint mask=bytes.r|(bytes.g<<8u)|(bytes.b<<16u)|(bytes.a<<24u);
 uint kind=mask&0xc0000000u;if(kind!=0x40000000u&&kind!=0x80000000u)return 1.;
 return float((mask>>uint(index*3))&7u)/7.;
}
`;
