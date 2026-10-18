/**
 * @module newer/render/r_post_shaders
 *
 * The post pipeline's shaders (card [44h], split from gl_post.js): the full-screen quad, the volume, bloom,
 * composite, depth-of-field and present passes, as GLSL text.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * The text is gl_post.js's, byte for byte; tests read it from the materials gl_post.js makes with it.
 */
import { POINT_SHADOW_GLSL, SPOT_WORLD_SHADOW_GLSL, NEAR_SUN_SHADOW_GLSL } from './r_pointshadows.js';
import { HEIGHT_MASK_DECODE_GLSL } from './r_heightshadows.js';
import { MAX_VOLUME_LIGHTS } from './r_post_config.js';
import { POINT_CONE_GLSL } from './r_fixturelights.js';
import { POWERUP_COOKIE_GLSL, POWERUP_SHROUD_COMPOSITE_GLSL } from './r_powerups.js';
import { VISION_UV_PACK_GLSL } from './vision_coordinates.js';
import { MAX_LIQUID_REGIONS, MAX_LAVA_ACTOR_HEAT, liquidLookGLSL } from './r_post_liquids.js';
import { WATER as WAVE_WATER, SIZE as WAVE_SIZE, WAVE_GLSL } from './r_waves.js';

export const QUAD_VERTEX = `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;

// shared by the volumetric and composite passes
const COMMON_FRAGMENT = `
precision highp float;
#include <packing>
${POINT_SHADOW_GLSL}
${SPOT_WORLD_SHADOW_GLSL}
${NEAR_SUN_SHADOW_GLSL}
uniform sampler2D tDepth;
${HEIGHT_MASK_DECODE_GLSL}
uniform sampler2D tSunShadow;
uniform mat4 uProj;
uniform float uBounce;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform mat4 uSunVP;
uniform float uNear;
uniform float uFar;
uniform int uCount;
uniform float uSpotOn;
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec3 uSpotCol;
uniform vec2 uSpotCone;
uniform vec4 uLightPos[ ${MAX_VOLUME_LIGHTS} ];
uniform vec4 uLightCol[ ${MAX_VOLUME_LIGHTS} ];
uniform float uLightCookie[ ${MAX_VOLUME_LIGHTS} ];
uniform vec4 uLightRotation[ ${MAX_VOLUME_LIGHTS} ];
uniform vec3 uLightDirection[ ${MAX_VOLUME_LIGHTS} ];
uniform vec2 uLightCone[ ${MAX_VOLUME_LIGHTS} ];
${POINT_CONE_GLSL}
uniform float uPowerupTime;
${POWERUP_COOKIE_GLSL}
uniform vec3 uSunDirV;
uniform vec3 uSunDirW;
uniform vec3 uSunCol;
uniform float uSunOn;
uniform float uShadowTexel;
uniform float uMaxRay;
uniform sampler2D tCookie;
uniform float uCookie; // 0 = no pattern, 1 = the sky's own pattern
uniform float uCookieTime;
uniform sampler2D tCookieCloud;
uniform float uCookieCloud;
uniform vec3 uCookieMean;
uniform vec3 uCookieNorm;
uniform float uCookieDepth;
const float COOKIE_SCALE = 700.0; // world units to one repeat of the sky picture
uniform sampler2D tNormal;
uniform float uTime;
uniform float uCaustic;
uniform int uWaterCount;
uniform vec4 uWaterMin[ ${MAX_LIQUID_REGIONS} ]; // xy = min corner, z = surface height, w = kind
uniform vec4 uWaterMax[ ${MAX_LIQUID_REGIONS} ]; // xy = max corner, z = physical bottom, w = optical look
${liquidLookGLSL}
uniform float uWaterView;

// tiling water caustics: the bright network light makes when it is bent by ripples
float caustic( vec2 uv, float t ) {
	vec2 p = mod( uv * 6.28318, 6.28318 ) - 250.0;
	vec2 i = p;
	float c = 1.0;
	float inten = 0.005;
	for ( int n = 0; n < 4; n ++ ) {
		float tt = t * ( 1.0 - ( 3.5 / float( n + 1 ) ) );
		i = p + vec2( cos( tt - i.x ) + sin( tt + i.y ), sin( tt - i.y ) + cos( tt + i.x ) );
		c += 1.0 / length( vec2( p.x / ( sin( i.x + tt ) / inten ), p.y / ( cos( i.y + tt ) / inten ) ) );
	}
	c /= 4.0;
	c = 1.17 - pow( c, 1.4 );
	return pow( abs( c ), 8.0 );
}

// BSP contents gates entry; the same finite optical volume clips both passes.
bool insideWater( vec3 p, int i ) {
 return all( greaterThanEqual( p, vec3( uWaterMin[i].xy, uWaterMax[i].z ) ) ) &&
  all( lessThanEqual( p, vec3( uWaterMax[i].xy, uWaterMin[i].z ) ) );
}
int cameraWater() {
 if ( uWaterView < 0.5 ) return -1;
 for ( int i = 0; i < ${MAX_LIQUID_REGIONS}; i++ ) {
  if ( i >= uWaterCount ) break;
  if ( insideWater( uViewInv[3].xyz, i ) ) return i;
 }
 return -1;
}
float waterShaftPattern( vec3 p, int i ) {
 // Identical phase and world coordinates to the horizontal receiver caustics.
 return min( caustic( p.xy * 0.0045, uTime * 0.6 ), 2.0 ) * uCaustic * liquidCaustic( uWaterMax[i].w );
}

varying vec2 vUv;

float sceneDist( vec2 uv ) {
	float d = texture2D( tDepth, uv ).x;
	if ( d >= 0.99999 ) return 1e6;
	return - perspectiveDepthToViewZ( d, uNear, uFar );
}

float noise( vec2 p ) {
	return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

float henyeyGreenstein( float c, float g ) {
	return ( 1.0 - g * g ) / pow( 1.0 + g * g - 2.0 * g * c, 1.5 );
}

// how much of the sky's pattern reaches a point: the sky texture projected along
// the sun's direction and scrolled the way the sky drifts, so shafts and sunlit
// patches break up the way the clouds do
vec3 skyCookieRGB( vec3 worldPos ) {
	vec3 sd = normalize( uSunDirW );
	vec2 uv = ( worldPos.xy - sd.xy / max( sd.z, 0.2 ) * ( worldPos.z - 1000.0 ) ) / COOKIE_SCALE;
	// the sky's own scrolling (see EmitSkyPolysQuake: 8 and 16 units a second of a 128 unit picture)
	vec3 pix = texture2D( tCookie, uv + vec2( 1.0 ) * uCookieTime * ( 8.0 / 128.0 ) ).rgb;
	if ( uCookieCloud > 0.5 ) {
		vec4 cl = texture2D( tCookieCloud, uv + vec2( 1.0 ) * uCookieTime * ( 16.0 / 128.0 ) );
		pix = mix( pix, cl.rgb, cl.a );
	}
	float L = dot( pix, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( dot( uCookieMean, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
	float bright = pow( max( L, 0.0 ), 1.0 + 0.9 * uCookieDepth );
	vec3 hue = min( pow( max( pix / uCookieMean / max( L, 1e-3 ), vec3( 0.0 ) ), vec3( 0.6 ) ), vec3( 2.5 ) );
	vec3 v = min( bright * hue / uCookieNorm, vec3( 6.0 ) );
	return mix( vec3( 1.0 ), v, uCookie );
}

float skyCookie( vec3 worldPos ) {
	return dot( skyCookieRGB( worldPos ), vec3( 0.2126, 0.7152, 0.0722 ) );
}

// 1 where the sun reaches a world-space point, 0 in shadow
float sunLit( vec3 worldPos ) {
	vec3 u = ( uSunVP * vec4( worldPos, 1.0 ) ).xyz * 0.5 + 0.5;
	// beyond the shadow map nothing is known: assume shadow, never light
	if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) return 0.0;
	return step( u.z - 0.0012, texture2D( tSunShadow, u.xy ).x );
}

float sunLitSoft( vec3 worldPos ) {
	vec3 u = ( uSunVP * vec4( worldPos, 1.0 ) ).xyz * 0.5 + 0.5;
	if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) return 0.0;
	float ref = u.z - 0.0012;
	float t = uShadowTexel;
	float lit = step( ref, texture2D( tSunShadow, u.xy + vec2( -t, -t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( t, -t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( -t, t ) ).x )
		+ step( ref, texture2D( tSunShadow, u.xy + vec2( t, t ) ).x );
	return lit * 0.25;
}
`;

export const VOLUME_FRAGMENT = COMMON_FRAGMENT + `
uniform float uSunScatter;
uniform float uScatter;
uniform float uOpenFog;
uniform float uShaftFog;
uniform float uShadowSpread;

const int SHADOW_STEPS = 12;
const int SUN_STEPS = 56;

void main() {
	vec4 r = uProjInv * vec4( vUv * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );

	float zd = sceneDist( vUv );
	float D = zd > 1e5 ? min( uMaxRay, 1800.0 ) : min( zd / max( - dirV.z, 0.05 ), uMaxRay );
	float jit = noise( gl_FragCoord.xy );

	vec3 result = vec3( 0.0 );
 int waterRegion = texture2D( tNormal, vUv ).a < -0.5 ? -1 : cameraWater();
 float waterD = 0.0;
 if ( waterRegion >= 0 ) {
  vec3 cam = uViewInv[3].xyz, dw = mat3( uViewInv ) * dirV;
  vec3 a = ( vec3( uWaterMin[waterRegion].xy, uWaterMax[waterRegion].z ) - cam ) / ( dw + vec3(1e-6) );
  vec3 b = ( vec3( uWaterMax[waterRegion].xy, uWaterMin[waterRegion].z ) - cam ) / ( dw + vec3(1e-6) );
  vec3 farT = max(a,b);
  waterD = max( 0.0, min( D, min( farT.x, min( farT.y, farT.z ) ) ) );
 }


	// sun: march the view ray through the sun's shadow map
	if ( uSunOn > 0.5 ) {
		float dMax = min( D, zd > 1e5 ? 500.0 : 2600.0 );
		float ds = dMax / float( SUN_STEPS );
		vec3 lit = vec3( 0.0 );
		for ( int k = 0; k < SUN_STEPS; k ++ ) {
			float t = ( float( k ) + jit ) * ds;
			vec3 pw = ( uViewInv * vec4( dirV * t, 1.0 ) ).xyz;
			vec3 u = ( uSunVP * vec4( pw, 1.0 ) ).xyz * 0.5 + 0.5;
			if ( u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0 || u.z > 1.0 ) continue;
			float ref = u.z - 0.0012;
			float here = step( ref, texture2D( tSunShadow, u.xy ).x );
			if ( here < 0.5 ) continue;
			// Light only shows up in air where it is contrasted with shade: the
			// more of the surroundings are in shadow, the denser the shaft.  Wide
			// open lit air is faint, so daylight outdoors stays clear.
			float around = step( ref, texture2D( tSunShadow, u.xy + vec2( uShadowSpread, 0.0 ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy - vec2( uShadowSpread, 0.0 ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy + vec2( 0.0, uShadowSpread ) ).x )
				+ step( ref, texture2D( tSunShadow, u.xy - vec2( 0.0, uShadowSpread ) ).x );
			// (squared: the edge of a pillar is where it goes from the full density to none, not a soft ramp)
			float edge = 1.0 - around * 0.25;
			float density = uOpenFog + edge * edge * uShaftFog;
   if ( waterRegion >= 0 && t < waterD ) density += 0.06 * waterShaftPattern( pw, waterRegion );
			lit += density * skyCookieRGB( pw ) * exp( - t * 0.0007 );
		}
		lit *= ds;
		float phase = henyeyGreenstein( dot( dirV, uSunDirV ), 0.3 );
		result += uSunCol * lit * uSunScatter * phase * ( zd > 1e5 ? 0.1 : 1.0 );
	}

	// point lights: analytic scattering with the same whole-world static occlusion as receivers
	vec3 acc = vec3( 0.0 ), waterAcc = vec3( 0.0 );
	if ( uScatter > 0.0 || ( waterRegion >= 0 && uCaustic > 0.0 ) ) for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;

		vec3 L = uLightPos[ i ].xyz;
		float R = uLightPos[ i ].w;
  if ( uScatter <= 0.0 && ( uViewInv * vec4( L, 1.0 ) ).z <= uWaterMin[waterRegion].z ) continue;

		float pointD = uScatter > 0.0 ? D : waterD;
  if ( pointD <= 0.0 ) continue;
  float t0 = dot( L, dirV );
		float h = sqrt( max( dot( L, L ) - t0 * t0, 0.0 ) + R * R );
		float integral = ( atan( ( pointD - t0 ) / h ) + atan( t0 / h ) ) / h;
		float range = uLightCol[ i ].w;
		integral *= 1.0 - smoothstep( 0.25 * range, range, h );
		// An out-of-range light contributes exactly zero. Avoid its twelve depth
		// marches rather than calculating a visibility that will be multiplied away.
		if ( integral <= 0.0 ) continue;

		vec3 Q = dirV * clamp( t0, 0.0, pointD );
  bool directional=dot(uLightDirection[i],uLightDirection[i])>.5;
  if(directional){
   float begin=max(0.,t0-range),end=min(pointD,t0+range),stepLength=max(0.,end-begin)/12.;
   integral=0.;float peak=0.;
   for(int k=0;k<12;k++){
    vec3 sampleV=dirV*(begin+(float(k)+.5)*stepLength);vec3 delta=sampleV-L;
    float distance=length(delta),weight=pointCone(sampleV,i)*(1.-smoothstep(.25*range,range,distance))*stepLength/(dot(delta,delta)+R*R);
    if(weight<=0.)continue;
    if(uPointShadowInfo[i].x>=0.)weight*=pointWorldVisibility((uViewInv*vec4(sampleV,1.)).xyz,(uViewInv*vec4(L,1.)).xyz,i);
    integral+=weight;if(weight>peak){peak=weight;Q=sampleV;}
   }
   if(integral<=0.)continue;
  }
		float worldVisibility = 1.0;
  if ( !directional && uPointShadowInfo[ i ].x >= 0.0 ) {
   vec3 receiver = ( uViewInv * vec4( Q, 1.0 ) ).xyz;
   vec3 source = ( uViewInv * vec4( L, 1.0 ) ).xyz;
   worldVisibility = pointWorldVisibility( receiver, source, i );
   if ( worldVisibility <= 0.0 ) continue;
  }
		float lit = 0.0;
		for ( int k = 0; k < SHADOW_STEPS; k ++ ) {
			float s = ( float( k ) + 0.5 ) / float( SHADOW_STEPS ); // (no per-pixel jitter: it showed as speckle round lights)
			vec3 P = mix( Q, L, s * 0.97 );
			if ( P.z > - uNear ) { lit += 1.0; continue; }
			vec4 c = uProj * vec4( P, 1.0 );
			vec2 uv = c.xy / c.w * 0.5 + 0.5;
			if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { lit += 1.0; continue; }
			float bias = 6.0 + 0.015 * ( - P.z );
			lit += sceneDist( uv ) < ( - P.z ) - bias ? 0.0 : 1.0;
		}
		lit /= float( SHADOW_STEPS );


		float phase = henyeyGreenstein( dot( normalize( Q - L ), - dirV ), 0.3 );
		vec3 incident = uLightCol[ i ].rgb * integral * worldVisibility * lit * lit * phase;
  acc += incident;
  if ( waterRegion >= 0 ) {
   vec3 sourceW = ( uViewInv * vec4( L, 1.0 ) ).xyz;
   vec3 sampleW = ( uViewInv * vec4( Q, 1.0 ) ).xyz;
   if ( sourceW.z > uWaterMin[waterRegion].z && insideWater( sampleW, waterRegion ) )
    waterAcc += incident * waterShaftPattern( sampleW, waterRegion ) * 0.045;
  }
	}

	// the flashlight's beam: the air in the cone lights up, thickest where you look along it
	if ( uSpotOn > 0.5 ) {
		float dMax = min( D, 900.0 );
		float ds = dMax / 20.0;
		vec3 beam = vec3( 0.0 );
		for ( int k = 0; k < 20; k ++ ) {
			float t = ( float( k ) + jit ) * ds;
			vec3 P = dirV * t;
			vec3 toP = P - uSpotPos;
			float dist = length( toP );
			float cone = smoothstep( uSpotCone.x, uSpotCone.y, dot( toP / max( dist, 1.0 ), uSpotDir ) );
			if ( cone <= 0.0 ) continue;
			// thickest near the lamp, thinning out with distance: a faint shaft, not a veil
			float beamVisibility=spotWorldVisibility((uViewInv*vec4(P,1.)).xyz);
			float waterPattern = 1.0;
   if ( waterRegion >= 0 && t < waterD ) waterPattern += 0.12 * waterShaftPattern( (uViewInv * vec4(P,1.0)).xyz, waterRegion );
   beam += uSpotCol * cone * cone * beamVisibility * waterPattern / ( 1.0 + dist * dist / ( 200.0 * 200.0 ) );
		}
		float phase = henyeyGreenstein( dot( dirV, uSpotDir ), 0.5 );
		result += beam * ds * 0.0000011 * phase;
	}

	gl_FragColor = vec4( result + acc * uScatter + waterAcc, 1.0 );
}`;

export const BLOOM_PREFILTER_FRAGMENT = `
uniform sampler2D tPowerupFire;
uniform float uPowerupFireOn;
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
varying vec2 vUv;
// threshold first, then weight by brightness so single hot pixels can't flicker
vec4 fetch( vec2 o ) {
	vec2 uv=vUv+o*uTexel;
 vec4 fire=uPowerupFireOn>.5?texture2D(tPowerupFire,uv):vec4(0.);
 vec3 c=(texture2D(tScene,uv).rgb+fire.rgb*(1.-clamp(fire.a,0.,1.)))*uExposure;
	float l = max( c.r, max( c.g, c.b ) );
	float soft = clamp( l - uThreshold + 0.5, 0.0, 1.0 );
	soft = soft * soft * 0.5;
	c *= max( soft, l - uThreshold ) / max( l, 1e-4 );
	float w = 1.0 / ( 1.0 + dot( c, vec3( 0.333 ) ) );
	return vec4( c * w, w );
}
void main() {
	vec4 a = fetch( vec2( -1.0, -1.0 ) ) + fetch( vec2( 1.0, -1.0 ) ) + fetch( vec2( -1.0, 1.0 ) ) + fetch( vec2( 1.0, 1.0 ) );
	gl_FragColor = vec4( a.rgb / max( a.w, 1e-4 ), 1.0 );
}`;

export const BLOOM_DOWN_FRAGMENT = `
uniform sampler2D tSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tSource, vUv ).rgb * 4.0;
	c += texture2D( tSource, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb;
	c += texture2D( tSource, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( c / 8.0, 1.0 );
}`;

export const BLOOM_UP_FRAGMENT = `
uniform sampler2D tLow;
uniform sampler2D tHigh;
uniform vec2 uTexel;
uniform float uWeight;
varying vec2 vUv;
void main() {
	vec3 c = texture2D( tLow, vUv + uTexel * vec2( -1.0, 0.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, 0.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 0.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 0.0, 1.0 ) ).rgb
		+ texture2D( tLow, vUv ).rgb * 4.0
		+ texture2D( tLow, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb
		+ texture2D( tLow, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
	gl_FragColor = vec4( texture2D( tHigh, vUv ).rgb + c / 12.0 * uWeight, 1.0 );
}`;

export const COMPOSITE_FRAGMENT = COMMON_FRAGMENT + `
layout(location = 1) out highp vec4 visionCoordinates;
${VISION_UV_PACK_GLSL}
#include <common>
uniform sampler2D tPowerupFire;
uniform float uPowerupFireOn;
vec4 powerupFireAt(vec2 uv){return uPowerupFireOn>.5?texture2D(tPowerupFire,uv):vec4(0.);}
vec3 powerupEmissionAt(vec2 uv){vec4 fire=powerupFireAt(uv);return fire.rgb*(1.-clamp(fire.a,0.,1.));}
uniform sampler2D tScene;
uniform sampler2D tAlbedo;
uniform sampler2D tVolume;
uniform sampler2D tBloom;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uVolume;
uniform float uSunSurface;
uniform vec3 uSunSurfaceCol;
uniform float uLightSurface;
uniform float uLightFloor;
uniform float uLightAdd[ ${MAX_VOLUME_LIGHTS} ];
uniform float uLightSpecular[ ${MAX_VOLUME_LIGHTS} ];
uniform float uEdge;
uniform float uDropDensity;
uniform float uDropBlood;
uniform float uBumpLight;
uniform float uActorWet;
uniform float uLighting;
uniform float uOffscreen;
uniform float uTeleStretch;
uniform float uTeleChroma;
uniform float uDropAge;
uniform float uSaturation;
uniform float uVibrance;
uniform float uContrast;
uniform float uBright;
uniform float uContrastGain;
uniform float uContrastPivot;
uniform float uUnderwater;
uniform float uWaterWarp;
uniform samplerCube tProbeA;
uniform samplerCube tProbeB;
uniform vec3 uProbeCenter[ 2 ];
uniform vec3 uProbeMin[ 2 ];
uniform vec3 uProbeMax[ 2 ];
uniform int uProbeOf[ ${MAX_LIQUID_REGIONS} ]; // which probe a pool uses (-1 none)
uniform float uScreenReflect;
uniform int uLavaCount;
uniform vec4 uLavaMin[ 4 ]; // xy = min corner, z = the lava's height
uniform vec4 uLavaMax[ 4 ];
uniform int uLavaActorCount;
uniform vec4 uLavaActorMin[ ${MAX_LAVA_ACTOR_HEAT} ];
uniform vec4 uLavaActorMax[ ${MAX_LAVA_ACTOR_HEAT} ];
uniform float uHeat;
uniform float uReflect;
uniform float uMist;

const int RELIGHT_STEPS = 8;


bool heldReceiver(vec4 packet){return packet.a < -2.;}
float receiverDistance(vec4 packet){return heldReceiver(packet)?-packet.a-2.:packet.a;}
bool actorReceiver(float tag){return tag>.05&&tag<.095;}
bool glassReceiver(float tag){return tag>.495&&tag<.505;}
// the rock materials' surfaces (r_post_gbuffer.js: .51 + .48 x their sun visibility; an ordinary surface is 1)
bool rockReceiver(float tag){return tag>.505&&tag<.995;}
vec3 viewPosAt( vec2 uv ) {
 vec4 packet=texture2D(tNormal,uv);
 if(heldReceiver(packet)){
  vec4 ray=uProjInv*vec4(uv*2.-1.,1.,1.);vec3 r=ray.xyz/ray.w;
  return r*(receiverDistance(packet)/max(-r.z,1e-6));
 }
 float d=texture2D(tDepth,uv).x;
 vec4 p=uProjInv*vec4(uv*2.-1.,d*2.-1.,1.);
 return p.xyz/p.w;
}

${POWERUP_SHROUD_COMPOSITE_GLSL}

// Share ordinary point/torch receiver lighting with confirmed water SSR
// hits. Cheap incident estimates rank candidates before any shadow sampling.
vec3 pointSourceIncident( vec3 P, vec3 normal, int index ) {
	vec3 L = uLightPos[ index ].xyz - P;
	float distance = length( L ), range = uLightCol[ index ].w;
	if ( distance >= range ) return vec3( 0.0 );
	float facing = max( dot( normal, L / max( distance, 0.001 ) ), 0.0 );
	if ( facing <= 0.0 ) return vec3( 0.0 );
	// Ordinary map lamps (radius28) and dynamic lights (radius40) retain their
	// sixty-unit falloff. Existing broad surface emitters reach their own edges.
	float extent = max( 60.0, uLightPos[ index ].w );
	float fall = 1.0 / ( 1.0 + distance * distance / ( extent * extent ) );
	fall *= 1.0 - smoothstep( 0.55 * range, range, distance );
	float cookie=1.;
	if(uLightCookie[index]>.5){
	 vec3 direction=(uViewInv*vec4(P-uLightPos[index].xyz,0.)).xyz;
	 cookie=powerupFlameCookie(powerupLocalDirection(direction,uLightRotation[index]),uPowerupTime);
	}
	return uLightCol[ index ].rgb * facing * fall * cookie * pointCone(P,index);
}

// Baked surfaces use a restrained diffuse supplement. Specular reflection
// and focused caustic light use the source irradiance before that art weight.
vec3 pointSurfaceIncident( vec3 P, vec3 normal, int index ) {
	return pointSourceIncident( P, normal, index ) * uLightSurface;
}

float pointSurfaceVisibility( vec3 P, vec3 normal, int index, float bias ) {
 // Hidden static columns/walls cannot leak light. Keep the existing screen
 // test as well, so current actors and moving brush doors retain occlusion.
 float worldVisibility = 1.0;
 if ( uPointShadowInfo[ index ].x >= 0.0 ) {
  vec3 receiver = ( uViewInv * vec4( P + normal * bias, 1.0 ) ).xyz;
  vec3 source = ( uViewInv * vec4( uLightPos[ index ].xyz, 1.0 ) ).xyz;
  worldVisibility = pointWorldVisibility( receiver, source, index );
  return worldVisibility;
 }
 float visibility = 0.0;
	for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
		float fraction = ( float( k ) + 0.5 ) / float( RELIGHT_STEPS );
		vec3 Q = mix( P + normal * 2.0, uLightPos[ index ].xyz, fraction * 0.95 );
		if ( Q.z > - uNear ) { visibility += 1.0; continue; }
		vec4 clip = uProj * vec4( Q, 1.0 );
		vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
		if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { visibility += 1.0; continue; }
		visibility += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
	}
	visibility /= float( RELIGHT_STEPS );
	return worldVisibility * visibility * visibility;
}

float pointSurfaceVisibility(vec3 P,vec3 normal,int index){return pointSurfaceVisibility(P,normal,index,1.);}

float receiverHeightVisibility(vec3 P,vec2 uv,int index) {
 vec4 packet=texture2D(tNormal,uv);
 if(receiverDistance(packet)<=0. || abs(receiverDistance(packet)+P.z)>.025*(-P.z)+1.)return 1.;
 return heightMaskVisibility(uv,index);
}
float receiverRockContrast(vec3 P,vec2 uv,float shadowedWeight,float visibleWeight) {
 // A transparent foreground depth writer can leave the background's packed
 // mask intact. Only the matching solid receiver owns the rock-wall tag.
 vec4 packet=texture2D(tNormal,uv);
 if(receiverDistance(packet)<=0. || abs(receiverDistance(packet)+P.z)>.025*(-P.z)+1.)return 1.;
 float gain=heightRockContrast(uv,shadowedWeight,visibleWeight);
 if(gain>1.){
  float existingLight=dot(texture2D(tScene,uv).rgb,vec3(.2126,.7152,.0722));
  gain=mix(gain,1.,smoothstep(.08,.30,existingLight));
 }
 return gain;
}
float receiverReliefNormalMix(vec2 uv,float baseMix){
 if(uHeightMasks<.5)return baseMix;
 uint tag=uint(floor(clamp(texture2D(tHeightShadow,uv).a,0.,1.)*255.+.5))&192u;
 return tag==128u?.8:baseMix;
}
float pointHeightSurfaceVisibility(vec3 P,vec3 normal,int index,vec2 uv) {
 return pointSurfaceVisibility(P,normal,index,actorReceiver(texture2D(tAlbedo,uv).a)?.1:1.)*receiverHeightVisibility(P,uv,index);
}

// Reuse the solid receiver's cone, falloff and shadow test for reflected
// receivers and water. Incident light here excludes the receiver's N dot L.
float flashlightIrradiance( vec3 P, vec3 offsetNormal ) {
	if ( uSpotOn < 0.5 ) return 0.0;
	vec3 L = uSpotPos - P;
	float distance = length( L );
	if ( distance >= 1500.0 ) return 0.0;
	float cosS = dot( - L / max( distance, 1.0 ), uSpotDir );
	float cone = smoothstep( uSpotCone.x, uSpotCone.y, cosS ) * mix( 0.62, 1.0, smoothstep( uSpotCone.y, 0.995, cosS ) );
	if ( cone <= 0.0 ) return 0.0;
	float fall = 1.0 / ( 1.0 + distance * distance / ( 280.0 * 280.0 ) );
	fall *= 1.0 - smoothstep( 800.0, 1500.0, distance );
 if(uSpotWorldShadowOn>.5){vec3 receiver=(uViewInv*vec4(P+offsetNormal*.1,1.)).xyz;return fall*cone*spotWorldVisibility(receiver);}
	float visibility = 0.0;
	for ( int k = 0; k < RELIGHT_STEPS; k ++ ) {
		float fraction = ( float( k ) + 0.5 ) / float( RELIGHT_STEPS );
		vec3 Q = mix( P + offsetNormal * 2.0, uSpotPos, fraction * 0.95 );
		if ( Q.z > - uNear ) { visibility += 1.0; continue; }
		vec4 clip = uProj * vec4( Q, 1.0 );
		vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
		if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) { visibility += 1.0; continue; }
		visibility += sceneDist( uv ) < ( - Q.z ) - ( 5.0 + 0.012 * ( - Q.z ) ) ? 0.0 : 1.0;
	}
	visibility /= float( RELIGHT_STEPS );
 vec3 receiverWorld=(uViewInv*vec4(P+offsetNormal,1.)).xyz;
 return fall*cone*visibility*visibility*spotWorldVisibility(receiverWorld);
}

vec3 depthSurfaceNormal( vec2 uv, vec3 P ) {
	vec3 Pl = viewPosAt( uv - vec2( uTexel.x, 0.0 ) );
	vec3 Pr = viewPosAt( uv + vec2( uTexel.x, 0.0 ) );
	vec3 Pd = viewPosAt( uv - vec2( 0.0, uTexel.y ) );
	vec3 Pu = viewPosAt( uv + vec2( 0.0, uTexel.y ) );
	vec3 dx = abs( Pr.z - P.z ) < abs( P.z - Pl.z ) ? Pr - P : P - Pl;
	vec3 dy = abs( Pu.z - P.z ) < abs( P.z - Pd.z ) ? Pu - P : P - Pd;
	vec3 N = normalize( cross( dx, dy ) );
	return dot( N, P ) > 0.0 ? - N : N;
}

float surfaceCarveAO( float tag ) {
	return tag >= 0.1 && tag < 0.5 ? clamp( ( tag - 0.1 ) / 0.39, 0.08, 1.0 ) : 1.0;
}

// SSR reads the pre-deferred scene. Shade valid opaque reflected receivers
// with the same material/lighting policy, once AFTER a successful ray hit.
// Rank up to eight incident candidates, shadow only the strongest three.
vec3 litReflectionAt( vec2 uv ) {
	vec3 scene = texture2D( tScene, uv ).rgb;
	if ( uLighting < 0.5 || ( uCount == 0 && uSpotOn < 0.5 ) || texture2D( tDepth, uv ).x >= 0.99999 ) return scene+powerupEmissionAt(uv);
	vec4 g = texture2D( tNormal, uv ), base = texture2D( tAlbedo, uv );
	if ( g.a < - 0.5 || base.a < 0.05 ) return scene+powerupEmissionAt(uv);
	float carveAO = surfaceCarveAO( base.a );
	vec3 P = viewPosAt( uv );
	if ( - P.z < 8.0 ) return scene+powerupEmissionAt(uv);
	// A flashlight-only miss needs no receiver reconstruction.
	if ( uCount == 0 && dot( normalize( P - uSpotPos ), uSpotDir ) <= uSpotCone.x ) return scene+powerupEmissionAt(uv);
	vec3 Ng = depthSurfaceNormal( uv, P );
	// Transparent overlays may leave a blended normal from another depth.
	vec3 N = abs( g.a + P.z ) < 0.025 * ( - P.z ) + 1.0 ? normalize( g.rgb * 2.0 - 1.0 ) : Ng;
	if ( dot( N, P ) > 0.0 ) N = - N;
	vec3 Nl = normalize( mix( Ng, N, receiverReliefNormalMix(uv,uBumpLight) ) );
	int first = - 1, second = - 1, third = - 1;
	float scoreA = 0.0, scoreB = 0.0, scoreC = 0.0;
	for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
		if ( i >= uCount ) break;
		float score = dot( pointSurfaceIncident( P, Nl, i ), vec3( 0.2126, 0.7152, 0.0722 ) );
		if ( score > scoreA ) { third = second; scoreC = scoreB; second = first; scoreB = scoreA; first = i; scoreA = score; }
		else if ( score > scoreB ) { third = second; scoreC = scoreB; second = i; scoreB = score; }
		else if ( score > scoreC ) { third = i; scoreC = score; }
	}
	vec3 relit = vec3( 0.0 ), flash = vec3( 0.0 );
 float visibleWeight=0.,shadowedWeight=0.;
	for ( int k = 0; k < 3; k ++ ) {
		int index = k == 0 ? first : ( k == 1 ? second : third );
		if ( index < 0 ) continue;
		vec3 reached=pointSurfaceIncident(P,Nl,index)*pointSurfaceVisibility(P,Ng,index);
  float localShadow=receiverHeightVisibility(P,uv,index),weight=dot(reached,vec3(.2126,.7152,.0722));
  visibleWeight+=weight;shadowedWeight+=weight*localShadow;
  vec3 light=reached*localShadow;
		relit += light; flash += light * uLightAdd[ index ];
	}
	vec3 colour = scene * ( 1.0 + relit * carveAO ) + ( relit * uLightFloor * base.rgb + flash * ( base.rgb * 0.3 + scene * 0.6 ) ) * carveAO;
	if ( uSpotOn > 0.5 ) {
		float facing = max( dot( Nl, normalize( uSpotPos - P ) ), 0.0 );
		if(facing>0.){
   float worldBeam=flashlightIrradiance(P,Ng),localShadow=receiverHeightVisibility(P,uv,9);
   float weight=dot(uSpotCol,vec3(.2126,.7152,.0722))*facing*worldBeam;
   visibleWeight+=weight;shadowedWeight+=weight*localShadow;
   colour+=base.rgb*uSpotCol*1.15*facing*worldBeam*localShadow*carveAO;
  }
	}
	return colour*receiverRockContrast(P,uv,shadowedWeight,visibleWeight)+powerupEmissionAt(uv);
}

// Shared dielectric GGX glint for the shoulder light and map lights. The
// result includes N dot L; incident radiance must not multiply facing again.
float waterLightSpecular( vec3 P, vec3 N, vec3 V, vec3 lightPos, float alpha ) {
	vec3 L = normalize( lightPos - P );
	float nl = max( dot( N, L ), 0.0 ), nv = max( dot( N, V ), 0.0 );
	if ( nl <= 0.0 || nv <= 0.0 ) return 0.0;
	vec3 H = normalize( L + V );
	float nh = max( dot( N, H ), 0.0 ), vh = max( dot( V, H ), 0.0 );
	float denominator = nh * nh * ( alpha * alpha - 1.0 ) + 1.0;
	float distribution = alpha * alpha / ( 3.141593 * denominator * denominator );
	float masking = nl / ( nl * ( 1.0 - alpha * 0.5 ) + alpha * 0.5 )
		* nv / ( nv * ( 1.0 - alpha * 0.5 ) + alpha * 0.5 );
	float fresnel = 0.02 + 0.98 * pow( 1.0 - vh, 5.0 );
	return distribution * masking * fresnel / max( 4.0 * nv, 0.001 );
}

float waterFlashlightSpecular( vec3 P, vec3 N, vec3 V ) {
	return min( waterLightSpecular( P, N, V, uSpotPos, 0.08 ), 8.0 );
}

// Crossing capillary ripples share world coordinates across every face of a
// pool. The derivative of wave height bends reflections and refraction alike.
// Fade wavelengths smaller than a few scene pixels to avoid distant sparkle.
vec3 waterRippleNormal( vec3 p3, float distance, float look ) {
	vec2 p = p3.xy;
	float time = uTime * liquidSpeed( look );
	float footprint = distance * 2.0 * uTexel.y / max( uProj[ 1 ][ 1 ], 0.2 );
	vec2 slope = vec2( 0.0 );
	vec2 a = vec2( 0.8, 0.6 );
	vec2 b = vec2( - 0.45, 0.893 );
	vec2 c = vec2( 0.933, - 0.36 );
	// Restore the original crossing spectrum for Clear (effective slopes
	// .0455/.0455/.0444 after its profile), while preserving profile variation
	// and the independent tight refraction-offset limit below.
	slope += a * 0.100 * cos( dot( p, a ) * 0.07 + time * 0.8 ) * ( 1.0 - smoothstep( 9.0, 36.0, footprint ) );
	slope += b * 0.100 * cos( dot( p, b ) * 0.145 - time * 1.2 ) * ( 1.0 - smoothstep( 4.0, 17.0, footprint ) );
	slope += c * 0.150 * ( look > 1.5 && look < 2.5 ? 0.35 : 0.65 ) * cos( dot( p, c ) * 0.29 + time * 1.8 ) * ( 1.0 - smoothstep( 2.0, 8.0, footprint ) );
	// Keep moving reflection definition without a faceted/prismatic surface. (The ripples from impacts, card [W1], bend the
	// finished picture of the water in the present pass: PRESENT_FRAGMENT.)
	return normalize( vec3( - slope * liquidRipple( look ) * 0.65, 1.0 ) );
}

// A restrained underwater-only sway shares the surface ripple phases. Keep
// held objects, portals, dry banks and depth discontinuities on their own pixels.
vec2 underwaterViewUv( vec2 uv ) {
 if ( uWaterWarp < 0.5 || texture2D( tNormal, uv ).a < -0.5 ) return uv;
 int region = cameraWater();
 if ( region < 0 ) return uv;
 vec3 p = viewPosAt( uv ), world = ( uViewInv * vec4( p, 1.0 ) ).xyz;
 if ( ! insideWater( world, region ) ) return uv;
 vec3 ripple = waterRippleNormal( world, length(p), uWaterMax[region].w );
 vec3 sway = transpose( mat3(uViewInv) ) * vec3( ripple.xy, 0.0 );
 vec2 offset = clamp( sway.xy * 0.018, vec2(-0.0015), vec2(0.0015) );
 offset.x *= uProj[0][0] / uProj[1][1];
 offset *= smoothstep( 0.0, 8.0, uWaterMin[region].z - uViewInv[3].z );
 vec2 candidate = uv + offset;
 if ( any(lessThan(candidate,vec2(0.0))) || any(greaterThan(candidate,vec2(1.0))) || texture2D(tNormal,candidate).a < -0.5 ) return uv;
 vec3 nextP = viewPosAt(candidate), nextW = (uViewInv * vec4(nextP,1.0)).xyz;
 if ( !insideWater(nextW,region) || abs(nextP.z-p.z) > max(4.0,abs(p.z)*0.02) ) return uv;
 return candidate;
}

// Select the real interface along the view ray. A finite suspended pool can
// be entered/exited through its underside; the legacy 900-unit depth cap is
// not a physical underside and must never acquire a reflective surface.
bool liquidInterface( vec3 cam, vec3 ray, vec4 lo, vec4 hi, out bool inside, out float height, out float side ) {
	inside = uUnderwater > 0.5 && cam.z < lo.z && cam.z > hi.z && cam.x > lo.x && cam.x < hi.x && cam.y > lo.y && cam.y < hi.y;
	bool finiteBottom = hi.z > lo.z - 899.5;
	if ( abs( ray.z ) < 0.001 ) return false;
	if ( inside ) {
		if ( ray.z < 0.0 && ! finiteBottom ) return false;
		height = ray.z > 0.0 ? lo.z : hi.z; side = ray.z > 0.0 ? - 1.0 : 1.0;
		return true;
	}
	if ( cam.z > lo.z && ray.z < 0.0 ) { height = lo.z; side = 1.0; return true; }
	if ( finiteBottom && cam.z < hi.z && ray.z > 0.0 ) { height = hi.z; side = - 1.0; return true; }
	return false;
}

// Bend the submerged scene before its albedo, normals and deferred lighting
// are sampled. A depth/region guide rejects the weapon, dry banks and portals,
// so their colours cannot bleed into the pool at its edge. No extra draw pass.
vec2 waterRefractionUv( vec2 uv ) {
	if ( uWaterCount == 0 || texture2D( tNormal, uv ).a < - 0.5 ) return uv;
	float rawDepth = texture2D( tDepth, uv ).x;
	bool sky = rawDepth >= 0.99999;
	vec3 P = viewPosAt( uv );
	vec3 cam = uViewInv[ 3 ].xyz;
	vec3 hit = ( uViewInv * vec4( P, 1.0 ) ).xyz;
	vec3 ray = normalize( hit - cam );
	if ( abs( ray.z ) < 0.001 ) return uv;
	for ( int i = 0; i < ${MAX_LIQUID_REGIONS}; i ++ ) {
		if ( i >= uWaterCount ) break;
		vec4 lo = uWaterMin[ i ];
		vec4 hi = uWaterMax[ i ];
		bool below; float interfaceZ, interfaceSide;
		if ( ! liquidInterface( cam, ray, lo, hi, below, interfaceZ, interfaceSide ) ) continue;
		if ( ( ! below && sky ) || ( ! sky && interfaceSide * ( hit.z - interfaceZ ) >= - 0.5 ) ) continue;
		float tp = ( interfaceZ - cam.z ) / ray.z;
		vec3 hp = cam + ray * tp;
		float shore = min( min( hp.x - lo.x, hi.x - hp.x ), min( hp.y - lo.y, hi.y - hp.y ) );
		if ( tp <= 0.0 || shore <= 0.0 || tp >= length( hit - cam ) ) continue;
		vec3 n = waterRippleNormal( hp, tp, hi.w ) * interfaceSide;
		vec3 bent = refract( ray, n, below ? 1.333 : 1.0 / 1.333 );
		// Outside the underwater Snell window there is no transmitted ray.
		if ( dot( bent, bent ) < 0.0001 ) return uv;
		float depth = min( abs( interfaceZ - hit.z ), 192.0 );
		if ( ! below ) depth = min( depth, lo.z - hi.z );
		vec3 target = hp + bent * ( depth / max( abs( bent.z ), 0.1 ) );
		vec3 straight = hp + ray * ( depth / max( abs( ray.z ), 0.1 ) );
		mat3 toView = transpose( mat3( uViewInv ) );
		vec4 qb = uProj * vec4( toView * ( target - cam ), 1.0 );
		vec4 qs = uProj * vec4( toView * ( straight - cam ), 1.0 );
		vec2 offset = ( qb.xy / qb.w - qs.xy / qs.w ) * 0.5;
		// Refraction is a restrained visual offset, while physical IOR still owns
		// the underwater Snell window and total internal reflection.
		vec2 limit = vec2( 0.004 * uProj[ 0 ][ 0 ] / uProj[ 1 ][ 1 ], 0.004 );
		vec2 candidate = uv + clamp( offset * 0.35, - limit, limit ) * smoothstep( 0.0, 6.0, shore ) * liquidRefraction( hi.w );
		if ( any( lessThan( candidate, vec2( 0.0 ) ) ) || any( greaterThan( candidate, vec2( 1.0 ) ) ) ) return uv;
		if ( texture2D( tNormal, candidate ).a < - 0.5 ) return uv;
		bool candidateSky = texture2D( tDepth, candidate ).x >= 0.99999;
		if ( candidateSky && ( ! below || ! sky ) ) return uv;
		vec3 checkHit = ( uViewInv * vec4( viewPosAt( candidate ), 1.0 ) ).xyz;
		if ( below ) {
			if ( interfaceSide * ( checkHit.z - interfaceZ ) >= - 0.5 ) return uv;
			vec3 candidateRay = normalize( checkHit - cam );
			if ( candidateRay.z * ray.z <= 0.0 ) return uv;
			float candidateDistance = ( interfaceZ - cam.z ) / candidateRay.z;
			vec3 candidateSurface = cam + candidateRay * candidateDistance;
			if ( candidateDistance <= 0.0 || candidateDistance >= length( checkHit - cam )
				|| candidateSurface.x <= lo.x || candidateSurface.x >= hi.x || candidateSurface.y <= lo.y || candidateSurface.y >= hi.y ) return uv;
			if ( sky && ! candidateSky ) return uv;
		} else if ( interfaceSide * ( checkHit.z - interfaceZ ) >= - 0.5 || checkHit.x < lo.x || checkHit.x > hi.x || checkHit.y < lo.y || checkHit.y > hi.y ) return uv;
		return candidate;
	}
	return uv;
}

// Keep normal-incidence clarity, but broaden the above-water grazing response
// for the reference's visible surface. From below use water-to-air dielectric
// Fresnel, including total internal reflection outside the ~49-degree window.
float waterInterfaceReflectance( float cosine, bool below ) {
	float c = clamp( cosine, 0.0, 1.0 );
	if ( ! below ) return 0.02 + 0.98 * pow( 1.0 - c, 2.5 );
	const float eta = 1.333;
	float transmittedSin2 = eta * eta * ( 1.0 - c * c );
	if ( transmittedSin2 >= 1.0 ) return 1.0;
	float ct = sqrt( max( 0.0, 1.0 - transmittedSin2 ) );
	float rs = ( eta * c - ct ) / max( eta * c + ct, 0.0001 );
	float rp = ( eta * ct - c ) / max( eta * ct + c, 0.0001 );
	return ( rs * rs + rp * rp ) * 0.5;
}

// keeps values under the knee untouched; rolls highlights off toward white
vec3 shoulder( vec3 c ) {
	float knee = 0.8;
	float m = max( c.r, max( c.g, c.b ) );
	if ( m <= knee ) return c;
	float range = 1.0 - knee;
	float mapped = knee + range * ( 1.0 - exp( - ( m - knee ) / range ) );
	vec3 scaled = c * ( mapped / m );
	float hot = smoothstep( 1.0, 4.0, m );
	return mix( scaled, vec3( mapped ), hot * 0.45 );
}

// Ambient accent at real creases.  The surface's plane comes from the depth
// buffer (not the normal map, whose bumps are not corners); each neighbour within
// a few units is above the plane (the other wall of an inside corner: darken) or
// below it (past an outer edge: lighten).  Neighbours on the plane, which is what
// a flat wall made of several pieces looks like, count for nothing.
float creaseAccent( vec3 P, vec3 Ng ) {
	float dist = - P.z;
	if ( dist < 24.0 ) return 1.0; // the weapon, right at the eye
	const float R = 7.0;
	vec2 px = clamp( vec2( uProj[ 0 ][ 0 ], uProj[ 1 ][ 1 ] ) * 0.5 * ( R / dist ), uTexel * 1.5, uTexel * 16.0 );
	float occ = 0.0;
	float edge = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		float a = float( i ) * 0.785398;
		vec2 dir = vec2( cos( a ), sin( a ) );
		for ( int k = 1; k <= 2; k ++ ) {
			vec3 Pn = viewPosAt( vUv + dir * px * ( float( k ) * 0.5 ) );
			vec3 v = Pn - P;
			float vd = length( v );
			if ( vd < 0.5 ) continue;
			float h = dot( v, Ng ) / vd;
			float w = 1.0 - smoothstep( R * 1.3, R * 3.5, vd ); // far things are another surface, not a corner
			if ( h > 0.18 ) occ += ( h - 0.18 ) * w;
			else if ( h < - 0.18 ) edge += ( - h - 0.18 ) * w;
		}
	}
	occ /= 16.0;
	edge /= 16.0;
	return ( 1.0 - clamp( occ * 6.0, 0.0, 0.8 ) * uEdge ) * ( 1.0 + clamp( edge * 4.0, 0.0, 0.45 ) * uEdge );
}

float dropHash( vec2 p ) {
	p = fract( p * vec2( 123.34, 345.45 ) );
	p += dot( p, p + 34.345 );
	return fract( p.x * p.y );
}

// Drops on the lens.  Cells of a grid each hold at most one drop; how many cells
// are wet is the density, so as the view dries the drops go one by one.  Some
// columns of the grid slide downwards over time, carrying their drops with them
// and leaving a thin wet line behind.  Returns ( bend x, bend y, drop, glint ).
vec4 lensDrops( vec2 uv, float grid, float seed ) {
	vec2 g = uv * vec2( grid * 1.7, grid );
	float col = floor( g.x );
	float runs = step( 0.55, dropHash( vec2( col + seed, 3.0 ) ) );
	float speed = runs * ( 0.35 + 1.1 * dropHash( vec2( col, 9.0 + seed ) ) );
	g.y += uDropAge * speed * 0.7 * min( 1.0, uDropAge * 0.6 );
	vec2 id = floor( g );
	vec2 f = fract( g ) - 0.5;
	float r1 = dropHash( id + seed );
	float r2 = dropHash( id * 1.7 + 11.3 + seed );
	float r3 = dropHash( id * 2.3 + 5.1 + seed );
	if ( r1 > uDropDensity * 0.5 ) return vec4( 0.0 );
	vec2 p = ( vec2( r2, r3 ) - 0.5 ) * 0.5;
	float size = 0.1 + 0.2 * r2 * r3 + 0.05 * r3;
	vec2 d = ( f - p ) * vec2( 1.0, 1.15 );
	float dist = length( d );
	float drop = smoothstep( size, size * 0.55, dist );
	// the wet line above a running drop
	float line = 0.0;
	if ( runs > 0.5 && uDropAge > 0.4 ) {
		float above = f.y - p.y;
		line = smoothstep( 0.03, 0.0, abs( f.x - p.x ) ) * step( 0.0, above ) * smoothstep( 0.5, 0.0, above ) * 0.55;
	}
	float mask = max( drop, line * 0.6 );
	// the drop is a lens: it shows the picture upside-down and bent
	vec2 bend = - ( f - p ) * drop * 1.5 / grid;
	float glint = smoothstep( 0.55, 1.0, dot( normalize( vec2( - 0.6, 0.8 ) ), d / max( size, 1e-3 ) ) ) * drop;
	return vec4( bend, mask, glint );
}

// what a pool's probe (a cube map taken from above the pool) shows in the direction a ray goes, the picture treated as
// having been taken in a box round the pool (so a wall at its edge is where the wall is)
vec3 probeColor( int which, vec3 hp, vec3 rW ) {
	vec3 rd = rW + vec3( 1e-5 );
	vec3 first = ( uProbeMax[ which ] - hp ) / rd;
	vec3 second = ( uProbeMin[ which ] - hp ) / rd;
	vec3 farT = max( first, second );
	float dist = min( min( farT.x, farT.y ), farT.z );
	vec3 dir = normalize( hp + rW * max( dist, 0.0 ) - uProbeCenter[ which ] );
	return which == 0 ? textureCube( tProbeA, dir ).rgb : textureCube( tProbeB, dir ).rgb;
}

// Ineligible depth is empty space for an SSR crossing, including the floor
// beneath an above-water ray. Each query uses one existing depth sample.
float reflectionDistanceAt( vec2 uv, bool below, vec4 lo, vec4 hi, float interfaceZ, float interfaceSide ) {
	if ( any( lessThan( uv, vec2( 0.0 ) ) ) || any( greaterThan( uv, vec2( 1.0 ) ) ) ) return 1e6;
	float depth = texture2D( tDepth, uv ).x;
 if(heldReceiver(texture2D(tNormal,uv)))return 1e6;
	if ( depth >= 0.99999 ) return 1e6;
	vec4 decoded = uProjInv * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
	vec3 P = decoded.xyz / decoded.w;
	if ( - P.z < 8.0 ) return 1e6;
	vec3 world = ( uViewInv * vec4( P, 1.0 ) ).xyz;
	if ( below ) {
		if ( world.z >= lo.z || world.z <= hi.z || world.x < lo.x || world.x > hi.x || world.y < lo.y || world.y > hi.y ) return 1e6;
	} else if ( interfaceSide * ( world.z - interfaceZ ) < - 0.5 ) return 1e6;
	return - P.z;
}

// Shared by static lava pools and independent creature-heat volumes. Scene
// depth caps the ray, so a heat source behind an opaque wall contributes zero.
vec2 lavaHeatColumn(vec3 bmin, vec3 bmax, vec3 cam0, vec3 dw0, vec3 inv0, float D0) {
 vec3 t1=(bmin-cam0)*inv0, t2=(bmax-cam0)*inv0;
 vec3 tn=min(t1,t2), tf=max(t1,t2);
 float tIn=max(max(tn.x,tn.y),max(tn.z,0.0));
 float tOut=min(min(tf.x,tf.y),min(tf.z,D0));
 if(tOut<=tIn) return vec2(0.0);
 float len=clamp((tOut-tIn)/170.0,0.0,1.0);
 vec3 mid=cam0+dw0*(0.5*(tIn+tOut));
 float up=mid.z*0.11-uTime*3.4;
 float fade=1.0-smoothstep(bmin.z+min(30.0,(bmax.z-bmin.z)*0.2),bmax.z,mid.z);
 return vec2(sin(up+mid.x*0.06)+0.5*sin(up*1.7+mid.y*0.09),cos(up*0.8+mid.y*0.05))*len*0.5*fade;
}
void main() {
	vec2 uvd = vUv;
	float jit0 = noise( gl_FragCoord.xy );
	// teleporting: the picture is pulled upwards (the middle rows fill the screen)
	if ( uTeleStretch > 0.0 ) {
		float S = 1.0 + uTeleStretch * uTeleStretch * 9.0;
		uvd.y = 0.5 + ( vUv.y - 0.5 ) / S;
		uvd.x = 0.5 + ( vUv.x - 0.5 ) * ( 1.0 + uTeleStretch * 0.35 );
	}
	float dropMask = 0.0;
	float dropGlint = 0.0;
	if ( uDropDensity > 0.001 ) {
		vec4 a = lensDrops( vUv, 9.0, 0.0 );
		vec4 b = lensDrops( vUv, 21.0, 17.0 );
		uvd += a.xy + b.xy * 0.7;
		dropMask = clamp( a.z + b.z * 0.8, 0.0, 1.0 );
		dropGlint = clamp( a.w + b.w * 0.6, 0.0, 1.0 );
	}
	// Heat haze: over a pool of lava the air shimmers, and whatever is seen through that column of air wobbles.  Each
	// pool is a box from its surface up; the longer the sight line runs through it, the more the picture is bent.
	if ( (uLavaCount > 0 || uLavaActorCount > 0) && uHeat > 0.0 && !heldReceiver(texture2D(tNormal,uvd)) ) {
		float d0 = texture2D( tDepth, uvd ).x;
		vec4 r0 = uProjInv * vec4( uvd * 2.0 - 1.0, 1.0, 1.0 );
		vec3 dv0 = normalize( r0.xyz / r0.w );
		float D0 = d0 >= 0.99999 ? uMaxRay : min( - perspectiveDepthToViewZ( d0, uNear, uFar ) / max( - dv0.z, 0.05 ), uMaxRay );
		vec3 cam0 = uViewInv[ 3 ].xyz;
		vec3 dw0 = mat3( uViewInv ) * dv0;
		vec3 inv0 = 1.0 / ( dw0 + vec3( 1e-6 ) );
		vec2 wob = vec2( 0.0 );
		for ( int i = 0; i < 4; i ++ ) {
			if ( i >= uLavaCount ) break;
			vec4 lo = uLavaMin[ i ];
			vec4 hi = uLavaMax[ i ];
			vec3 bmin = vec3( lo.xy - 48.0, lo.z );
			vec3 bmax = vec3( hi.xy + 48.0, lo.z + 150.0 );
			wob += lavaHeatColumn(bmin,bmax,cam0,dw0,inv0,D0);
		}
  vec2 actorWob=vec2(0.0);
  for(int i=0;i<${MAX_LAVA_ACTOR_HEAT};i++) {
   if(i>=uLavaActorCount) break;
   actorWob+=lavaHeatColumn(uLavaActorMin[i].xyz,uLavaActorMax[i].xyz,cam0,dw0,inv0,D0);
  }
  // Overlapping creatures cannot amplify this separate addition without bound.
  wob+=clamp(actorWob,vec2(-1.0),vec2(1.0));
		uvd += wob * vec2( 1.0, 0.7 ) * 0.0055 * uHeat;
	}
	uvd = underwaterViewUv( uvd );
	vec2 surfaceUv = uvd;
	uvd = waterRefractionUv( uvd );
	vec3 scene = texture2D( tScene, uvd ).rgb;
	if ( uTeleChroma > 0.0 ) {
		// red, green and blue come apart, along the stretch
		vec2 sp = vec2( uTeleChroma * 0.006 * ( 1.0 + 3.0 * uTeleStretch ), uTeleChroma * 0.05 );
		scene = vec3( texture2D( tScene, uvd + sp ).r, scene.g, texture2D( tScene, uvd - sp ).b );
		scene *= 1.0 + uTeleChroma * 0.35;
	}
	if ( dropMask > 0.0 ) {
		// what is seen through a drop is slightly out of focus
		vec2 bl = uTexel * 3.5;
		vec3 soft = ( scene
			+ texture2D( tScene, uvd + vec2( bl.x, 0.0 ) ).rgb + texture2D( tScene, uvd - vec2( bl.x, 0.0 ) ).rgb
			+ texture2D( tScene, uvd + vec2( 0.0, bl.y ) ).rgb + texture2D( tScene, uvd - vec2( 0.0, bl.y ) ).rgb
			+ texture2D( tScene, uvd + bl ).rgb + texture2D( tScene, uvd - bl ).rgb
			+ texture2D( tScene, uvd + vec2( bl.x, - bl.y ) ).rgb + texture2D( tScene, uvd - vec2( bl.x, - bl.y ) ).rgb ) / 9.0;
		scene = mix( scene, soft, clamp( dropMask * 1.2, 0.0, 1.0 ) );
	}
	float d = texture2D( tDepth, uvd ).x;

	vec4 r = uProjInv * vec4( uvd * 2.0 - 1.0, 1.0, 1.0 );
	vec3 dirV = normalize( r.xyz / r.w );
	float D = d >= 0.99999 ? uMaxRay : min( - perspectiveDepthToViewZ( d, uNear, uFar ) / max( - dirV.z, 0.05 ), uMaxRay );
 if(heldReceiver(texture2D(tNormal,uvd)))D=receiverDistance(texture2D(tNormal,uvd))/max(-dirV.z,.05);

	vec3 c = scene;
	vec3 Nw = vec3( 0.0, 0.0, 1.0 );
	vec3 receiverPlaneW = Nw;
	vec3 causticIncident = vec3( 0.0 );
	float spotMask = 0.0;
	float creaseK = 1.0; // the corner accent, applied after the liquids (which switch it off below their surface)

	// Direct light from the sun and the nearby lights, applied to what the
	// classic lightmaps already put on the surface.
	// alpha < 0 in the normal buffer marks a window onto another level: leave it as drawn
	if ( d < 0.99999 && ( texture2D( tNormal, uvd ).a > - 0.5 || heldReceiver(texture2D(tNormal,uvd)) ) ) {
		vec3 P = viewPosAt( uvd );
		vec3 N;
		vec4 g = texture2D( tNormal, uvd );
		float here = - P.z;
		if ( (heldReceiver(g)||actorReceiver(texture2D(tAlbedo,uvd).a)||here>8.0) && abs( receiverDistance(g) - here ) < 0.025 * here + 1.0 ) {
			// the surface's own (normal-mapped) normal, written while it was drawn
			N = normalize( g.rgb * 2.0 - 1.0 );
			if ( dot( N, P ) > 0.0 ) N = - N;
		} else {
			// other geometry: the normal of the depth surface
			N = depthSurfaceNormal( uvd, P );
		}
		Nw = normalize( mat3( uViewInv ) * N );

		// the plane of the surface from the depth buffer, for the corner accent
		vec3 dxG = viewPosAt( uvd + vec2( uTexel.x, 0.0 ) ) - P;
		vec3 dxL = P - viewPosAt( uvd - vec2( uTexel.x, 0.0 ) );
		vec3 dyG = viewPosAt( uvd + vec2( 0.0, uTexel.y ) ) - P;
		vec3 dyL = P - viewPosAt( uvd - vec2( 0.0, uTexel.y ) );
		dxG = abs( dxG.z ) < abs( dxL.z ) ? dxG : dxL;
		dyG = abs( dyG.z ) < abs( dyL.z ) ? dyG : dyL;

		// The relief is lit by a softened normal: the surface's own plane with only a
		// part of the bumps.  Lit by the full normal, one side of every bump is hit
		// full on (a white speckle) and the other side not at all (harsh contrast).
		vec3 Ng = normalize( cross( dxG, dyG ) );
		if ( dot( Ng, P ) > 0.0 ) Ng = - Ng;
		// Project liquid light onto the actual receiver plane. A carved stone's
		// shading normal must not switch projection axes or turn its floor into
		// a wall; keep Nw unchanged for the existing detailed lighting paths.
		receiverPlaneW = normalize( mat3( uViewInv ) * Ng );
		bool actor=actorReceiver(texture2D(tAlbedo,uvd).a);
  bool glass=glassReceiver(texture2D(tAlbedo,uvd).a);
  if(actor)Ng=N;
  vec3 Nl = actor||glass?N:normalize( mix( Ng, N, receiverReliefNormalMix(uvd,uBumpLight) ) );

		if ( uLighting > 0.5 ) {
			vec4 base = texture2D( tAlbedo, uvd );
			// 0 is unavailable, .1 to .49 carries carving AO, .51 to .99 carries
			// rock sun visibility. Ordinary opaque pixels remain at 1.
			float rockSunVisibility = heightMaskValid(uvd) ? receiverHeightVisibility(P,uvd,8) : ( glass ? 1.0 : ( rockReceiver( base.a ) ? clamp( ( base.a - 0.51 ) / 0.48, 0.0, 1.0 ) : 1.0 ) );
			float carveAO = surfaceCarveAO( base.a );
			vec3 relit = vec3( 0.0 );
   float visibleReliefWeight=0.,shadowedReliefWeight=0.;
			vec3 surfaceSpecular=vec3(0.);
   float film=glass?1.:(actor&&base.a>.07?uActorWet*uActorWet:0.);
   vec3 V=normalize(-P);
   vec3 flashAdd = vec3( 0.0 ); // light from a muzzle flash, which shows even on a dark surface

			if ( uSunOn > 0.5 ) {
				float ndl = max( dot( Nl, uSunDirV ), 0.0 );
				if ( ndl > 0.0 ) {
					vec3 pw = ( uViewInv * vec4( P + Ng * 1.5, 1.0 ) ).xyz;
					float sunVisibility=actor?min(sunLitSoft(pw),nearSunVisibility((uViewInv*vec4(P,1.)).xyz+Nw*.08)):sunLitSoft(pw);
     vec3 incidentSun=uSunSurfaceCol*uSunSurface*ndl*sunVisibility*skyCookieRGB(pw);
     float sunWeight=dot(incidentSun,vec3(.2126,.7152,.0722));
     visibleReliefWeight+=sunWeight;shadowedReliefWeight+=sunWeight*rockSunVisibility;
     relit+=incidentSun*rockSunVisibility;
     if(film>0.)surfaceSpecular+=uSunSurfaceCol*pow(max(dot(Nl,normalize(uSunDirV+V)),0.),glass?24.:48.)*sunVisibility*skyCookieRGB(pw)*rockSunVisibility;
				}
			}

			vec3 causticSources = relit; // retain the existing received sun contribution
			float jit = noise( gl_FragCoord.xy );
			for ( int i = 0; i < ${MAX_VOLUME_LIGHTS}; i ++ ) {
				if ( i >= uCount ) break;
				vec3 incident = pointSourceIncident( P, Nl, i );
				if ( dot( incident, vec3( 1.0 ) ) <= 0.0 ) continue;
				vec3 sourceReached=incident*pointSurfaceVisibility(P,Ng,i,actor?.1:1.);
				vec3 reached=sourceReached*uLightSurface;
    float localShadow=receiverHeightVisibility(P,uvd,i),weight=dot(reached,vec3(.2126,.7152,.0722));
    visibleReliefWeight+=weight;shadowedReliefWeight+=weight*localShadow;
    vec3 lightHere=reached*localShadow;
				relit += lightHere;
				causticSources += sourceReached * localShadow;
    if(film>0.)surfaceSpecular+=uLightCol[i].rgb*pointCone(P,i)*pow(max(dot(Nl,normalize(normalize(uLightPos[i].xyz-P)+V)),0.),glass?24.:48.)*pointSurfaceVisibility(P,Ng,i,actor?.1:1.)*localShadow*pow(max(0.,1.-length(uLightPos[i].xyz-P)/uLightCol[i].a),2.);
				flashAdd += lightHere * uLightAdd[ i ];
			}

			// A real source can light a surface even when its baked light is zero.
			vec3 spot = vec3( 0.0 );
			if ( uSpotOn > 0.5 ) {
				vec3 Ls = uSpotPos - P;
				float sndl = max( dot( Nl, normalize( Ls ) ), 0.0 );
				if ( sndl > 0.0 ) {
					float worldBeam=flashlightIrradiance(P,Ng),localShadow=receiverHeightVisibility(P,uvd,9);
     float beam=worldBeam*localShadow,weight=dot(uSpotCol,vec3(.2126,.7152,.0722))*sndl*worldBeam;
     visibleReliefWeight+=weight;shadowedReliefWeight+=weight*localShadow;
					spot = uSpotCol * sndl * beam;
     if(film>0.)surfaceSpecular+=uSpotCol*pow(max(dot(Nl,normalize(normalize(Ls)+V)),0.),glass?24.:48.)*beam;
					spotMask = clamp( sndl * beam * 1.6, 0.0, 1.0 );
				}
			}

			// Read the actual unlit material colour. The lit scene has lost it where
			// the baked lighting is zero; a neutral grey lift cannot reconstruct it.
			vec3 albedo = base.a > 0.05 ? base.rgb : scene;
			// Bounce light.  What a surface sees of its neighbours on the screen lights it a little: each of a handful of
			// points round it (out to about 150 units) gives the light it is sending this way, if the two face each
			// other, less with distance; and the receiver's own colour tints it (a red wall casts red on the floor, and
			// a lit patch of floor lights the wall above it).  This is what stops the places no lamp reaches from being
			// flat black, and why a room round a bright light glows with its colour.
			vec3 bounce = vec3( 0.0 );
			if ( uBounce > 0.0 ) {
				const int BOUNCE_SAMPLES = 16;
				float rad = clamp( 150.0 * uProj[ 0 ][ 0 ] * 0.5 / max( here, 8.0 ), 0.01, 0.22 );
				float aspect = uTexel.y / uTexel.x;
    // Fixed sampling avoids pixel-random low-light speckle and camera crawl.
				float turn = 0.0;
				for ( int i = 0; i < BOUNCE_SAMPLES; i ++ ) {
					float fi = float( i ) + 0.5;
					float a = fi * 2.39996 + turn;
					float rr = sqrt( fi / float( BOUNCE_SAMPLES ) );
					vec2 uvs = uvd + vec2( cos( a ), sin( a ) * aspect ) * rr * rad;
					if ( uvs.x < 0.0 || uvs.x > 1.0 || uvs.y < 0.0 || uvs.y > 1.0 ) continue;
					if ( texture2D( tDepth, uvs ).x >= 0.99999 ) continue;
					vec4 gs = texture2D( tNormal, uvs );
					if ( gs.a < - 0.5 ) continue;
					vec3 Ps = viewPosAt( uvs );
					vec3 v = Ps - P;
					float dist = length( v );
					if ( dist < 3.0 || dist > 260.0 ) continue;
					vec3 dir = v / dist;
					float cosR = max( dot( Ng, dir ), 0.0 );
					vec3 Ns = gs.a > 0.0 ? normalize( gs.rgb * 2.0 - 1.0 ) : - dir;
					if ( dot( Ns, Ps ) > 0.0 ) Ns = - Ns;
					float cosS = max( dot( Ns, - dir ), 0.0 );
					float w = cosR * cosS / ( 1.0 + dist * dist / ( 80.0 * 80.0 ) );
					// Coplanar/back-facing neighbours transfer no light. Their three
					// HDR colour reads and beam estimate cannot change the result.
					if ( w <= 0.0 ) continue;
					// what that point is sending: its lit colour, and the flashlight's light on it (the beam is added after
					// this picture, so estimate it with its physical source shadow)
					float beamS = 0.0;
					if ( uSpotOn > 0.5 ) {
						vec3 sn = normalize( uSpotPos - Ps );
      beamS = max(dot(Ns,sn),0.) * flashlightIrradiance(Ps,Ns);
					}
					// a lamp or flame is far brighter than the wall round it, and one lucky sample on it showed as a speckle of dots
					// on the wall: what a point sends is squashed (so a flame is a few times a wall, not a hundred), and
					// averaged over a few neighbouring texels
					vec2 ob = uTexel * 3.0;
					vec3 src = ( texture2D( tScene, uvs ).rgb * 2.0 + texture2D( tScene, uvs + ob ).rgb + texture2D( tScene, uvs - ob ).rgb ) * 0.25;
					if ( beamS > 0.0 ) {
						vec4 sourceBase = texture2D( tAlbedo, uvs );
						if ( sourceBase.a > 0.05 ) src += sourceBase.rgb * uSpotCol * 1.15 * beamS * surfaceCarveAO( sourceBase.a ) * receiverHeightVisibility(Ps,uvs,9);
					}
					bounce += src / ( 1.0 + 0.9 * max( src.r, max( src.g, src.b ) ) ) * w;
				}
				bounce *= uBounce * 22.0 / float( BOUNCE_SAMPLES );
			}
			vec3 receiver = albedo * 0.55;
			// Focusing bends the incident light already reaching this material.
			// Do not focus only the intentionally dim lightmap-floor fallback:
			// that erased caustics on dark stone even under a visible source.
			causticIncident = albedo * ( causticSources + spot ) * carveAO;
			c = actor ? scene + albedo*(relit*.55+spot*1.15+flashAdd*.3+bounce*.55)+surfaceSpecular*film*.16 : scene * ( 1.0 + relit * carveAO ) + ( bounce * receiver + relit * uLightFloor * albedo + spot * albedo * 1.15 + flashAdd * ( 0.3 * albedo + scene * 0.6 ) ) * carveAO;

   if(glass)c+=surfaceSpecular*.12;
   c*=receiverRockContrast(P,uvd,shadowedReliefWeight,visibleReliefWeight);

			// what the beam hits is not just brighter, it is richer: colour and contrast rise with it
			if ( spotMask > 0.0 ) {
				float ls = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
				c = mix( vec3( ls ), c, 1.0 + 0.2 * spotMask );
				c *= 1.0 + 0.08 * spotMask;
			}

		} // advanced lighting

		// corners and edges: an accent for built things (a beam's edge, a doorway's corner). Not on the rock materials: their
		// folds are natural ground, and the accent drew them as black contours (owner, 14 October 2026)
		if ( uEdge > 0.0 && !actorReceiver(texture2D(tAlbedo,uvd).a) && !rockReceiver(texture2D(tAlbedo,uvd).a) ) creaseK = creaseAccent( P, normalize( cross( dxG, dyG ) ) * ( dot( normalize( cross( dxG, dyG ) ), P ) > 0.0 ? - 1.0 : 1.0 ) );
	}

	// Liquids: water and slime take light out of any ray that travels through
	// them (so shallows stay clear and depths go dark and blue-green), and the
	// surfaces beneath them get caustics.
	if ( uWaterCount > 0 ) {
		vec3 camW = uViewInv[ 3 ].xyz;
		vec3 dirW = mat3( uViewInv ) * dirV;
		vec3 inv = 1.0 / ( dirW + vec3( 1e-6 ) );
		vec3 hitW = camW + dirW * D;
		// Reflection belongs to the visible interface, not the refracted
		// receiver texel. Moving a dry floor below a suspended pool must not
		// move its reflected torch or change interface coverage.
		vec3 surfaceP = viewPosAt( surfaceUv );
		vec3 surfaceDirW = normalize( mat3( uViewInv ) * surfaceP );
		float surfaceD = min( length( surfaceP ), uMaxRay );

		for ( int i = 0; i < ${MAX_LIQUID_REGIONS}; i ++ ) {
			if ( i >= uWaterCount ) break;

			vec4 lo = uWaterMin[ i ];
			vec4 hi = uWaterMax[ i ];
			float top = lo.z;
			float look = hi.w;
			bool toxic = look > 2.5;
			vec3 bmin = vec3( lo.xy, hi.z );
			vec3 bmax = vec3( hi.xy, top );

			vec3 t1 = ( bmin - camW ) * inv;
			vec3 t2 = ( bmax - camW ) * inv;
			vec3 tn = min( t1, t2 );
			vec3 tf = max( t1, t2 );
			float tEnter = max( max( tn.x, tn.y ), max( tn.z, 0.0 ) );
			float tExit = min( min( tf.x, tf.y ), min( tf.z, D ) );
			bool muddy = look > 1.5 && look < 2.5;
			// A bounded, low sediment layer borrows real incident light. It is
			// optical scattering, not Toxic's additive particles or emission.
			float sedimentLight = 0.0, sedimentPath = 0.0;
			if ( muddy && camW.z > top && texture2D( tNormal, uvd ).a > - 0.5 ) {
				vec3 fogMin = vec3( lo.xy, top ), fogMax = vec3( hi.xy, top + 18.0 );
				vec3 f1 = ( fogMin - camW ) * inv, f2 = ( fogMax - camW ) * inv;
				vec3 fn = min( f1, f2 ), ff = max( f1, f2 );
				float enter = max( max( fn.x, fn.y ), max( fn.z, 0.0 ) );
				float exit = min( min( ff.x, ff.y ), min( ff.z, D ) );
				if ( exit > enter ) {
					vec3 sampleW = camW + dirW * ( enter + exit ) * 0.5;
					vec3 sampleV = transpose( mat3( uViewInv ) ) * ( sampleW - camW );
					vec3 up = transpose( mat3( uViewInv ) ) * vec3( 0.0, 0.0, 1.0 );
					float strongest = 0.0; int source = - 1;
					if ( uLighting > 0.5 ) for ( int j = 0; j < ${MAX_VOLUME_LIGHTS}; j ++ ) {
						if ( j >= uCount ) break;
						float value = dot( pointSurfaceIncident( sampleV, up, j ), vec3( 0.2126, 0.7152, 0.0722 ) );
						if ( value > strongest ) { strongest = value; source = j; }
					}
					if ( source >= 0 ) sedimentLight = strongest * pointSurfaceVisibility( sampleV, up, source );
					float margin = min( min( sampleW.x - lo.x, hi.x - sampleW.x ), min( sampleW.y - lo.y, hi.y - sampleW.y ) );
					sedimentPath = min( exit - enter, 240.0 ) * smoothstep( 0.0, 12.0, margin );
				}
			}

			// Measure the original lit receiver before absorption, sediment/emission
			// and this pattern; otherwise the adaptation feeds back into itself.
			float receiverLuminance = max( dot( c, vec3(0.2126, 0.7152, 0.0722) ) * uExposure, 0.0 );
			vec3 receiverBase = c;
			vec3 transmittedReceiver = max( c, causticIncident );
			if ( tExit > tEnter ) {
				vec3 sigma = liquidAbsorption( look );
				float received = max( dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 );
				if ( look > 1.5 && look < 2.5 ) {
					// Sediment scatters a low-frequency light field, not the floor's
					// texture. Bounded taps remain below this pool and reject banks,
					// sky and live portals; reflection is composed afterward.
					float softLight = dot( scene, vec3( 0.2126, 0.7152, 0.0722 ) ), weight = 1.0;
					for ( int tap = 0; tap < 4; tap ++ ) {
						float angle = float( tap ) * 1.570796;
						vec2 uv = clamp( uvd + vec2( cos( angle ), sin( angle ) ) * uTexel * 14.0, uTexel, vec2( 1.0 ) - uTexel );
						// Pair radiance with the exact depth texel being classified.
						// Linear colour filtering must not leak a dry marker into fog.
						uv = ( floor( uv / uTexel ) + 0.5 ) * uTexel;
						if ( texture2D( tDepth, uv ).x >= 0.99999 || texture2D( tNormal, uv ).a < - 0.5 ) continue;
						vec3 point = ( uViewInv * vec4( viewPosAt( uv ), 1.0 ) ).xyz;
						if ( point.z >= top - 0.5 || point.x < lo.x || point.x > hi.x || point.y < lo.y || point.y > hi.y ) continue;
						softLight += dot( texture2D( tScene, uv ).rgb, vec3( 0.2126, 0.7152, 0.0722 ) ); weight += 1.0;
					}
					float direct = max( received - dot( scene, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.0 );
					received = max( softLight / weight + direct, sedimentLight * 0.45 );
				}
				vec3 T = exp( - sigma * ( tExit - tEnter ) );
				transmittedReceiver *= T;
			receiverBase *= T;
				// Ordinary water scatters received light. Toxic liquid alone emits.
				c = c * T + ( liquidScatter( look ) * received + liquidEmission( look ) ) * ( 1.0 - T );
			}

			// Caustics modulate transmitted receivers, never reflected walls.
			// Light also projects onto dry stone below a suspended sheet: this
			// receiver reach is distinct from its finite absorption thickness.
			if ( d < 0.99999
				&& hitW.x > bmin.x && hitW.x < bmax.x && hitW.y > bmin.y && hitW.y < bmax.y
				&& hitW.z > top - 900.0 && hitW.z < top + 2.0 ) {
				float depth = top - hitW.z;
				vec2 plane = abs( receiverPlaneW.z ) > 0.5 ? hitW.xy : ( abs( receiverPlaneW.x ) > abs( receiverPlaneW.y ) ? hitW.yz : hitW.xz );
				float cs = caustic( plane * 0.0045, uTime * 0.6 );
				// Slab-lit walls are real receivers too (the START reference is
				// largely a vertical wall). Retain a floor bias without erasing
				// their already source-facing, shadowed incident contribution.
				float facing = 0.35 + 0.65 * smoothstep( 0.3, 0.9, receiverPlaneW.z );
				// The owner wants full caustic strength on deep receivers too.
				// Retain only the near-interface onset, not a depth falloff.
				float fade = smoothstep( 6.0, 40.0, depth );
				vec3 glow = toxic ? vec3( 0.35, 1.0, 0.16 ) : vec3( 1.0 );
				// Dark stone reads through focused highlights; light stone through
				// restrained redistribution. Scalar weights retain the pigment hue.
				// Only receiver radiance participates, never sediment or emission.
				float brightReceiver = smoothstep( 0.08, 0.55, receiverLuminance );
				float strength = uCaustic * facing * fade * liquidCaustic( look );
				float focus = min( cs, 2.0 ) * strength;
				float highlight = mix( 1.8, 0.25, brightReceiver ) * focus / ( 1.0 + brightReceiver * focus );
				float between = 1.0 - smoothstep( 0.04, 0.30, cs );
				float shade = 0.12 * brightReceiver * between * min( strength, 1.0 );
				c -= min( c, receiverBase ) * shade;
				// Bright surfaces already carry visible radiance: bound their
				// added highlight to that base, not the stronger raw-source reserve.
				vec3 highlightReceiver = mix( transmittedReceiver, receiverBase, brightReceiver );
				c += highlightReceiver * glow * highlight;
			}

			// Reflection: water gives back the picture of what is above it, more at a low angle than looking straight down.
			// The reflected ray is marched across the screen against what is already drawn.
			bool belowSurface; float interfaceZ, interfaceSide;
			bool towardSurface = liquidInterface( camW, surfaceDirW, lo, hi, belowSurface, interfaceZ, interfaceSide );
			if ( ( uReflect > 0.0 || uSpotOn > 0.5 ) && towardSurface && texture2D( tNormal, surfaceUv ).a > - 0.5 ) {
				float tp = ( interfaceZ - camW.z ) / surfaceDirW.z;
				vec3 hp = camW + surfaceDirW * tp;
				if ( tp > 0.0 && tp < ( belowSurface ? surfaceD - 0.25 : surfaceD + 2.0 ) && hp.x > lo.x && hp.x < hi.x && hp.y > lo.y && hp.y < hi.y ) {
					vec3 nW = waterRippleNormal( hp, tp, hi.w ) * interfaceSide;
					float edge = smoothstep( 0.0, 6.0, min( min( hp.x - lo.x, hi.x - hp.x ), min( hp.y - lo.y, hi.y - hp.y ) ) );
					mat3 toView = transpose( mat3( uViewInv ) );
					vec3 hv = toView * ( hp - camW );
					vec3 surfaceLight = vec3( 0.0 );
					if ( uSpotOn > 0.5 ) {
						vec3 Nv = toView * nW;
						float specular = waterFlashlightSpecular( hv, Nv, normalize( - hv ) );
						if ( specular > 0.0 ) surfaceLight = uSpotCol * specular * flashlightIrradiance( hv, Nv ) * edge;
					}
					// Map torches already light solid receivers and SSR hits. Let
					// the same source reach the existing water GGX lobe too; a
					// reflected flame image alone cannot form its surface glint.
					// Rank before shadows: at most two existing visibility queries.
					if ( uLighting > 0.5 && uReflect > 0.0 ) {
						vec3 Nv = toView * nW, V = normalize( - hv );
						int firstLight = - 1, secondLight = - 1;
						vec3 firstGlint = vec3( 0.0 ), secondGlint = vec3( 0.0 );
						float firstScore = 0.0, secondScore = 0.0;
						for ( int j = 0; j < ${MAX_VOLUME_LIGHTS}; j ++ ) {
							if ( j >= uCount ) break;
							if ( uLightSpecular[ j ] < 0.5 ) continue;
							vec3 sourceW = ( uViewInv * vec4( uLightPos[ j ].xyz, 1.0 ) ).xyz;
							if ( interfaceSide * ( sourceW.z - interfaceZ ) <= 0.0 ) continue;
							if ( belowSurface && ( sourceW.z <= hi.z || sourceW.z >= top ) ) continue;
							vec3 L = normalize( uLightPos[ j ].xyz - hv );
							vec3 incident = pointSourceIncident( hv, L, j );
							if ( dot( incident, vec3( 1.0 ) ) <= 0.0 ) continue;
							// A compact map flame has a tighter highlight than the
							// broad shoulder beam. Keep both lobes explicitly bounded.
							vec3 glint = incident * min( waterLightSpecular( hv, Nv, V, uLightPos[ j ].xyz, 0.025 ), 32.0 );
							float score = dot( glint, vec3( 0.2126, 0.7152, 0.0722 ) );
							if ( score > firstScore ) { secondLight = firstLight; secondScore = firstScore; secondGlint = firstGlint; firstLight = j; firstScore = score; firstGlint = glint; }
							else if ( score > secondScore ) { secondLight = j; secondScore = score; secondGlint = glint; }
						}
						if ( firstLight >= 0 ) surfaceLight += firstGlint * pointSurfaceVisibility( hv, Nv, firstLight ) * edge * uReflect;
						if ( secondLight >= 0 ) surfaceLight += secondGlint * pointSurfaceVisibility( hv, Nv, secondLight ) * edge * uReflect;
					}
					if ( uReflect > 0.0 ) {
						vec3 rW = reflect( surfaceDirW, nW );
						vec3 rv = toView * rW;
						// nothing found on the screen: what the pool's probe shows (or a dark sky if it has none yet)
						int pr = uProbeOf[ i ];
						vec3 fallback = vec3( 0.0 );
						// Existing probes are captured above the pool. An internal fallback
						// may only look DOWN at captured submerged radiance, never up at sky.
						if ( pr >= 0 && interfaceZ == top && ( ! belowSurface || rW.z < - 0.001 ) ) {
							fallback = probeColor( pr, hp, rW );
							if ( look > 1.5 && look < 2.5 ) {
								vec3 spread = vec3( 0.035, 0.0, 0.0 );
								fallback = fallback * 0.6 + ( probeColor( pr, hp, normalize( rW + spread ) ) + probeColor( pr, hp, normalize( rW - spread ) ) ) * 0.2;
							}
						}
						vec3 refl = fallback;
						float found = 0.0;
						bool refinedCrossing = false;
						float stepLen = 10.0;
						vec3 pv = hv + rv * 6.0 * ( 0.6 + 0.8 * jit0 );
						float previousGap = - 1e6;
						if ( uScreenReflect > 0.0 && pv.z <= - uNear ) {
							vec4 initial = uProj * vec4( pv, 1.0 );
							previousGap = - pv.z - reflectionDistanceAt( initial.xy / initial.w * 0.5 + 0.5, belowSurface, lo, hi, interfaceZ, interfaceSide );
						}
						if ( uScreenReflect > 0.0 ) for ( int k = 0; k < 28; k ++ ) {
							vec3 previous = pv;
							float gapBefore = previousGap;
							pv += rv * stepLen;
							stepLen *= 1.16;
							if ( pv.z > - uNear ) break;
							vec4 cq = uProj * vec4( pv, 1.0 );
							vec2 uvq = cq.xy / cq.w * 0.5 + 0.5;
							if ( uvq.x < 0.0 || uvq.x > 1.0 || uvq.y < 0.0 || uvq.y > 1.0 ) break;
							float dq = texture2D( tDepth, uvq ).x;
							if ( dq >= 0.99999 ) {
								// Internal reflection stays in water: an above-sky hit is invalid.
								if ( belowSurface ) break;
								refl = mix( fallback, texture2D( tScene, uvq ).rgb, uScreenReflect );
								found = 1.0;
								break;
							}
							vec3 qView = viewPosAt( uvq );
							if ( - qView.z < 8.0 ) break; // viewmodel's special depth range is not reflected geometry
							float gap = - pv.z + qView.z;
							vec3 coarseWorld = ( uViewInv * vec4( qView, 1.0 ) ).xyz;
							bool eligible = belowSurface ? coarseWorld.z < top && coarseWorld.z > hi.z && coarseWorld.x >= lo.x && coarseWorld.x <= hi.x && coarseWorld.y >= lo.y && coarseWorld.y <= hi.y : interfaceSide * ( coarseWorld.z - interfaceZ ) >= - 0.5;
							previousGap = eligible ? gap : - 1e6;
							if ( ! eligible ) { if ( belowSurface ) break; else continue; }
							if ( gap > 0.0 && gap < 60.0 + stepLen ) {
								if ( gapBefore > 0.0 ) continue; // no front-to-back crossing
								// Resolve the crossing before reading colour: the coarse
								// step can jump past a narrow lamp onto the wall behind it.
								// At most five extra depth taps for this entire reflected ray.
								if ( ! refinedCrossing ) {
									refinedCrossing = true;
									vec3 before = previous, after = pv;
									for ( int refine = 0; refine < 5; refine ++ ) {
										vec3 middle = ( before + after ) * 0.5;
										vec4 clip = uProj * vec4( middle, 1.0 );
										vec2 sampleUv = clip.xy / clip.w * 0.5 + 0.5;
										if ( middle.z > - uNear || any( lessThan( sampleUv, vec2( 0.0 ) ) ) || any( greaterThan( sampleUv, vec2( 1.0 ) ) ) ) { before = middle; continue; }
										float distance = reflectionDistanceAt( sampleUv, belowSurface, lo, hi, interfaceZ, interfaceSide );
										if ( - middle.z > distance ) after = middle; else before = middle;
								}
								vec4 refined = uProj * vec4( after, 1.0 );
								uvq = refined.xy / refined.w * 0.5 + 0.5;
									qView = viewPosAt( uvq );
								if ( - qView.z < 8.0 ) break;
								}
								if ( belowSurface ) {
									vec3 qWorld = ( uViewInv * vec4( qView, 1.0 ) ).xyz;
									if ( qWorld.z >= top || qWorld.z <= hi.z || qWorld.x < lo.x || qWorld.x > hi.x || qWorld.y < lo.y || qWorld.y > hi.y ) break;
								} else if ( interfaceSide * ( ( uViewInv * vec4( qView, 1.0 ) ).z - interfaceZ ) < - 0.5 ) {
									// A wide depth tolerance can encounter the submerged floor
									// before the actual wall/marker. Keep seeking an air-side hit.
									continue;
								}
								refl = mix( fallback, litReflectionAt( uvq ), uScreenReflect * smoothstep( 0.0, 0.08, min( min( uvq.x, 1.0 - uvq.x ), min( uvq.y, 1.0 - uvq.y ) ) ) );
								found = 1.0;
								break;
							}
						}
						float cosT = clamp( dot( - surfaceDirW, nW ), 0.0, 1.0 );
						float fres = waterInterfaceReflectance( cosT, belowSurface );
						float k = clamp( fres * 1.65 * uReflect * edge, 0.0, 0.98 );
						// TIR has no air transmission. Reflection-off remains an explicit
						// optics opt-out, but a lower enabled strength cannot open the window.
						if ( belowSurface && fres >= 1.0 ) k = 1.0;
						if ( belowSurface ) refl *= exp( - liquidAbsorption( look ) * tp );
						c = mix( c, min( refl, vec3( 8.0 ) ), k );
					}
					c += surfaceLight;
				}
			}
			if ( muddy && sedimentPath > 0.0 ) {
				float haze = 1.0 - exp( - sedimentPath * 0.0012 * clamp( uMist, 0.0, 1.5 ) );
				c = mix( c, liquidScatter( look ) * sedimentLight, haze );
			}

			// below the surface of a pool: no outlines (the pool's walls stand on its edge, so a margin)
			if ( d < 0.99999
				&& hitW.x > bmin.x - 24.0 && hitW.x < bmax.x + 24.0 && hitW.y > bmin.y - 24.0 && hitW.y < bmax.y + 24.0
				&& hitW.z > bmin.z && hitW.z < top + 2.0 ) creaseK = 1.0;

		}
	}

	c *= creaseK;

	// No screen-wide atmospheric haze. Directional shafts and the flashlight
	// retain their source-shaped volume; point lamps illuminate receivers.
	c += texture2D( tVolume, uvd ).rgb * uVolume;
	vec4 fire=powerupFireAt(uvd);
	c += texture2D( tBloom, uvd ).rgb * uBloom * (1.-clamp(fire.a,0.,1.));
	// tScene contains the black shroud and original glyph. Prevent deferred
	// light, shafts and bloom from filling the void; add the independently
	// integrated fire emission afterward, without relighting or recolouring it.
	c = mix( c, scene, powerupShroudMask( uvd ) );
	c += fire.rgb*(1.-clamp(fire.a,0.,1.));

	c = max( c * uExposure, 0.0 );

	if ( uLighting > 0.5 ) {
		// grade: punchier mid-tones and highlights (darks are left alone), richer colour
		float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c *= 1.0 + uContrast * smoothstep( 0.04, 0.5, l );
		l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c = mix( vec3( l ), c, uSaturation );

		// atmosphere: deep blacks (the darks are pressed down), colour that is richer where it is
		// weak (a vibrance on top of the saturation), cold shadows and warm lights
		l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
		c *= mix( 0.85, 1.0, smoothstep( 0.0, 0.2, l ) );
		float mx = max( c.r, max( c.g, c.b ) ), mn = min( c.r, min( c.g, c.b ) );
		float chroma = ( mx - mn ) / max( mx, 1e-4 );
		c = mix( vec3( l ), c, 1.0 + uVibrance * ( 1.0 - chroma ) );
		c *= mix( vec3( 0.94, 0.97, 1.05 ), vec3( 1.03, 1.0, 0.95 ), smoothstep( 0.02, 0.40, l ) );

		c = shoulder( c );
	}

	// the drops: a little darker at the edge where they bend the light, a bright
	// glint, and blood-red where it is blood
	if ( dropMask > 0.0 ) {
		// water is clear: only a small neutral glint on the edge, no tint, no darkening
		c += vec3( 1.0 ) * dropGlint * 0.35 * ( 1.0 - uDropBlood );
		vec3 red = c * vec3( 0.75, 0.06, 0.05 ) + vec3( 0.05, 0.0, 0.0 ) * dropMask;
		c = mix( c, red, uDropBlood * clamp( dropMask * 1.4, 0.0, 1.0 ) );
	}

	gl_FragColor = vec4( c, 1.0 );
	if ( uOffscreen < 0.5 ) {
		#include <colorspace_fragment>
		// brightness, then contrast about a mid tone, on the displayed values
		vec3 shown = gl_FragColor.rgb * uBright;
		shown = max( uContrastPivot + ( shown - uContrastPivot ) * uContrastGain, 0.0 );
		gl_FragColor = vec4( shown, 1.0 );
	}
	visionCoordinates=visionEncodeUV(clamp(uvd,uTexel*.5,1.-uTexel*.5));
}`;

// The composite target stores linear colour. Convert and grade exactly once,
// after upscaling, so brightness/contrast keep their display-space meaning.
// Depth of field (card [38], r_dof.js): its own pass at the composite's resolution (dynamic resolution reduces it), after
// the vision modes and before the present pass. uDof.x = focus distance, y = strength in composite pixels, z = the largest
// circle; uDofFar = the depth the sky counts as (the far focus: a far focus leaves the sky sharp); uDofTexel = a pixel.
// The held gun (G-buffer packet a < -2) is never blurred nor blurred into. The 16 taps turn per pixel (interleaved
// gradient noise), so a small bright light behind a blur spreads as a disc rather than sixteen copies.
export const DOF_FRAGMENT = `
uniform sampler2D tComposite;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 uProjInv;
uniform vec3 uDof;
uniform vec2 uDofTexel;
uniform float uDofFar;
varying vec2 vUv;
float dofDepth( vec2 uv ) {
	float d = texture2D( tDepth, uv ).x;
	if ( d >= 0.99999 ) return uDofFar; // the sky: the far focus
	vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
	return max( - v.z / v.w, 1.0 );
}
bool dofHeld( vec2 uv ) { return texture2D( tNormal, uv ).a < - 2.0; }
float dofCircle( float z ) { return min( uDof.z, uDof.y * abs( 1.0 - uDof.x / z ) ); }
void main() {
	vec3 base = texture2D( tComposite, vUv ).rgb;
	gl_FragColor = vec4( base, 1.0 );
	if ( dofHeld( vUv ) ) return;
	float z = dofDepth( vUv ), c = dofCircle( z );
	if ( c < 0.5 ) return;
	float turn = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
	vec3 sum = base; float total = 1.0;
	for ( int i = 0; i < 16; i ++ ) {
		float r = sqrt( ( float( i ) + 0.5 ) / 16.0 ), a = float( i ) * 2.39996 + turn;
		vec2 at = vUv + vec2( cos( a ), sin( a ) ) * r * c * uDofTexel;
		if ( dofHeld( at ) ) continue;
		float sz = dofDepth( at );
		// a nearer sample counts only as far as its own circle reaches here (a sharp thing in front keeps its edge)
		float w = sz < z ? clamp( dofCircle( sz ) / max( r * c, 1e-3 ), 0.0, 1.0 ) : 1.0;
		sum += texture2D( tComposite, at ).rgb * w; total += w;
	}
	gl_FragColor = vec4( sum / total, 1.0 );
}`;

export const PRESENT_FRAGMENT = `
uniform sampler2D tComposite;
uniform float uBright;
uniform float uContrastGain;
uniform float uContrastPivot;
varying vec2 vUv;
// Ripples on water (card [W1]): while r_waves.js has a field live, the finished picture of the water is bent by the water's real
// slope there, the reflection and what is seen below the surface alike, and the light glints off the crests. (Done here, not in
// the composite: that pass already uses all sixteen of its texture units.)
uniform float uWaves;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
uniform vec4 uWaterWave[ ${WAVE_WATER.fields} ]; // xy = the field's corner, z = the surface height, w = cell size (0: unused)
${WAVE_GLSL}
// the rippling water a pixel shows: its ray meets a live field's surface in front of what the pixel shows. xy = the slope there,
// z = the height, w = 1 (0: no rippling water); hit = the point on the surface. Fields that overlap (a second hit near the edge
// of the first's square) add up: the waves are linear and each hit went into one field.
vec4 rippleAt( vec2 uv, out vec3 hit ) {
	hit = vec3( 0.0 );
	if ( texture2D( tNormal, uv ).a < - 0.5 ) return vec4( 0.0 ); // a window or the gun
	vec4 v = uProjInv * vec4( uv * 2.0 - 1.0, texture2D( tDepth, uv ).x * 2.0 - 1.0, 1.0 );
	vec3 cam = uViewInv[ 3 ].xyz, ray = ( uViewInv * vec4( v.xyz / v.w, 1.0 ) ).xyz - cam;
	if ( abs( ray.z ) < 1e-4 ) return vec4( 0.0 );
	vec4 sum = vec4( 0.0 );
	for ( int i = 0; i < ${WAVE_WATER.fields}; i ++ ) {
		vec4 w = uWaterWave[ i ];
		if ( w.w <= 0.0 ) continue;
		float t = ( w.z - cam.z ) / ray.z;
		if ( t <= 0.0 || t >= 1.0 ) continue;
		if ( sum.w > 0.0 && abs( cam.z + ray.z * t - hit.z ) > 2.0 ) continue; // (another level of water)
		vec3 at = cam + ray * t;
		vec2 st = ( at.xy - w.xy ) / w.w;
		if ( st.x < 1.0 || st.y < 1.0 || st.x > ${ ( WAVE_SIZE - 1 ).toFixed( 1 ) } || st.y > ${ ( WAVE_SIZE - 1 ).toFixed( 1 ) } ) continue;
		vec3 s = waveSample( float( i ), st, w.w );
		sum += vec4( s.yz, s.x, 1.0 );
		hit = at;
	}
	return vec4( sum.xyz, min( sum.w, 1.0 ) );
}
vec2 screenOf( vec3 p ) {
	vec4 q = uProj * vec4( transpose( mat3( uViewInv ) ) * ( p - uViewInv[ 3 ].xyz ), 1.0 );
	return q.xy / q.w * 0.5 + 0.5;
}
void main() {
	vec2 uv = vUv;
	float glint = 0.0, facing = 0.0;
	if ( uWaves > 0.5 ) {
		vec3 hit, other;
		vec4 r = rippleAt( vUv, hit );
		if ( r.w > 0.0 ) {
			// what the surface shows moves across it with the slope (60 units for a slope of 1), in perspective
			vec2 offset = screenOf( hit - vec3( r.xy * 60.0, 0.0 ) ) - screenOf( hit );
			offset = clamp( offset, vec2( - 0.06 ), vec2( 0.06 ) );
			// only ever from more of the water (never the bank, the gun, or a wall standing in the pool)
			if ( rippleAt( vUv + offset, other ).w > 0.0 ) uv = vUv + offset;
			else if ( rippleAt( vUv + offset * 0.5, other ).w > 0.0 ) uv = vUv + offset * 0.5;
			// a sharp highlight on the crests, the light from above caught by the tilted water
			vec3 n = normalize( vec3( - r.xy, 1.0 ) ), dir = normalize( hit - uViewInv[ 3 ].xyz );
			glint = pow( max( dot( reflect( dir, n ), normalize( vec3( 0.25, 0.15, 1.0 ) ) ), 0.0 ), 90.0 ) * smoothstep( 0.03, 0.2, length( r.xy ) );
			// a slope turned toward the eye mirrors more of the light overhead, one turned away more of the dark: the crests and
			// troughs read as light and shade, as on real water
			facing = clamp( dot( r.xy, normalize( dir.xy + vec2( 1e-5 ) ) ) * 2.2, - 0.45, 0.6 );
		}
	}
	gl_FragColor = texture2D( tComposite, uv );
	gl_FragColor.rgb = gl_FragColor.rgb * ( 1.0 + facing ) + glint * ( 0.3 + 0.9 * dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
	#include <colorspace_fragment>
	vec3 shown = gl_FragColor.rgb * uBright;
	shown = max( uContrastPivot + ( shown - uContrastPivot ) * uContrastGain, 0.0 );
	gl_FragColor = vec4( shown, 1.0 );
}`;
