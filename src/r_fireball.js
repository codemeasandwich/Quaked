// "04 Fireball" from the owner-supplied FieldLab FX3D source, ported onto Quaked's
// renderer. Source file SHA-256 7e35fc80...c7d6 (kept local); extraction map and
// asset provenance are in newer/effects/fireball/provenance.json and
// docs/explosions-fireball-2026-10-08.md.
//
// Ownership: cl_tent.js still owns the temp entity, sound, native dynamic light,
// scorch decal and damage timing. This module only replaces the *particle
// picture* of an ordinary TE_EXPLOSION, in Newer Game, once its two textures have
// loaded. Everything else (Classic, assets not ready, no scene, tar and
// colour-mapped explosions) keeps the native particles.
//
// The effect is analytic in the burst's age, exactly as in the source: the cloud,
// spark, flash and ring functions below are the source's own, evaluated per frame
// and written into fixed-size instance buffers. Nothing is simulated or retained
// per particle, so a burst costs no allocation after the first frame.
import * as THREE from 'three';
import { COM_NewerURL } from './pak.js';
import { cvar_t } from './cvar.js';
import { R_NewerGame } from './r_anim.js';
import { R_DecalSurface } from './r_decals.js';

// 0 puts the native particles back for every explosion
export const r_fireball = new cvar_t( 'r_fireball', '1' );

// Source defaults for mode "explosion" at quality "medium".
export const FIREBALL = Object.freeze( {
	size: 1.6, flash: 1, smoke: .15, sparks: 1.8,
	duration: 4.8, clouds: 40, sparkCap: 300,
	// Quake world units per source unit. A source unit is about the height of its
	// stand-in character (1.8) against Quake's 56-unit player: ~24-32. 24 gives a
	// fireball ~160 units across at the flash, growing past 200 as the smoke rolls.
	unit: 24,
	maxBursts: 6
} );

const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );
const mix = ( a, b, t ) => a + ( b - a ) * t;
const smooth = ( a, b, v ) => { const t = clamp( ( v - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
export const hashJS = n => { const r = Math.sin( n * 127.1 + 31.7 ) * 43758.5453; return r - Math.floor( r ); };

// ---------------------------------------------------------------------------
// The source's functions, in source units, y up, relative to the detonation point.
// ---------------------------------------------------------------------------

// burstClouds() of the source (large-fireball branch). Calls emit() once per visible
// cloud with scalars, so the per-frame path allocates nothing:
// emit( x, y, z, size, angle, alpha, heat, tile, tintR, tintG, tintB, seed )
export function forEachCloud( age, id, p, emit ) {

	const size = p.size;
	for ( let i = 0; i < p.clouds; i ++ ) {

		const seed = hashJS( i * 13.1 + id * 5 ), ang = hashJS( i * 19.71 + 3 ) * Math.PI * 2;
		const vertical = hashJS( i * 43.1 + 7 ), delay = hashJS( i * 1.73 ) * .095;
		if ( age < delay ) continue;
		const t = Math.max( 0, age - delay ), spread = ( 1 - Math.exp( - t * 4 ) ) * size * 1.28;
		const heat = Math.max( 0, 1.12 * p.flash - t * 1.05 - vertical * .23 );
		const life = 4.3, fade = ( 1 - smooth( life * .43, life, t ) ) * smooth( 0, .04, t );
		const alpha = fade * mix( clamp( p.smoke, 0, 1.8 ) * .39, .83, smooth( .02, .4, heat ) );
		if ( alpha < .003 ) continue;
		const radial = spread * ( .26 + vertical * .83 );
		emit( Math.cos( ang ) * radial, ( .12 + vertical * .72 ) * spread + .29 * t, Math.sin( ang ) * radial,
			size * ( .20 + ( 1 - Math.exp( - t * 6 ) ) * .42 + t * .16 ) * ( .7 + seed * .75 ),
			seed * 6.28 + t * ( seed - .5 ) * .5, clamp( alpha, 0, .94 ), heat, Math.floor( seed * 16 ),
			.26 + seed * .12, .25 + seed * .10, .24 + seed * .10, seed * 14 );

	}

}

// Allocating view of the same function, for tests and tools.
export function fireballClouds( age, id, p = FIREBALL ) {

	const list = [];
	forEachCloud( age, id, p, ( x, y, z, size, angle, alpha, heat, tile, r, g, b, seed ) =>
		list.push( { pos: [ x, y, z ], size, angle, alpha, heat, tile, tint: [ r, g, b ], seed } ) );
	return list;

}

// sparkPosition() of the source. `h` is the detonation height above the floor in
// source units (the source's stage centre is 0.45 above its floor); the result is
// written to out[ o..o+2 ], relative to the detonation point.
function sparkAt( t, vx, vy, vz, h, out, o ) {

	const g = 5.3, hit = ( vy + Math.sqrt( vy * vy + 2 * g * Math.max( .001, h - .025 ) ) ) / g;
	if ( t < hit ) { out[ o ] = vx * t; out[ o + 1 ] = vy * t - .5 * g * t * t; out[ o + 2 ] = vz * t; return; }
	const rem = t - hit, bounce = Math.max( .1, ( g * hit - vy ) * .28 );
	out[ o ] = vx * hit + vx * rem * .43;
	out[ o + 1 ] = Math.max( .025, .025 + bounce * rem - .5 * g * rem * rem ) - h;
	out[ o + 2 ] = vz * hit + vz * rem * .43;

}

const _spark = new Float64Array( 6 );

// burstSparks() of the source (large-fireball branch):
// emit( startX, startY, startZ, endX, endY, endZ, width, alpha, colourR, colourG, colourB, brightness )
export function forEachSpark( age, id, p, h, emit ) {

	const n = Math.min( p.sparkCap, Math.round( 86 * p.sparks ) );
	for ( let i = 0; i < n; i ++ ) {

		const s = hashJS( i * 13.77 + id * 9.31 ), s2 = hashJS( i * 41.73 + 7 ), s3 = hashJS( i * 7.4 + 23 );
		const a = age - s3 * .08, life = .7 + s2 * 1.8;
		if ( a <= 0 || a > life ) continue;
		const ang = s * 6.283, speed = 1.1 + 2.7 * s2, vx = Math.cos( ang ) * speed, vy = .72 + s3 * 2.8, vz = Math.sin( ang ) * speed;
		sparkAt( a, vx, vy, vz, h, _spark, 3 );
		sparkAt( Math.max( 0, a - .032 * ( 1 + s3 ) ), vx, vy, vz, h, _spark, 0 );
		emit( _spark[ 0 ], _spark[ 1 ], _spark[ 2 ], _spark[ 3 ], _spark[ 4 ], _spark[ 5 ], .0065 * ( 1 + s3 * .8 ),
			( 1 - smooth( life * .4, life, a ) ) * smooth( 0, .025, a ), 1, .43 + s2 * .36, .09 + s2 * .13, 1 );

	}

}

export function fireballSparks( age, id, p = FIREBALL, h = .45 ) {

	const list = [];
	forEachSpark( age, id, p, h, ( sx, sy, sz, ex, ey, ez, width, alpha, r, g, b, brightness ) =>
		list.push( { start: [ sx, sy, sz ], end: [ ex, ey, ez ], width, alpha, color: [ r, g, b ], brightness } ) );
	return list;

}

export const fireballFlash = age => Math.exp( - age * 16 ) * 1.5;
export const fireballRingRadius = ( age, p = FIREBALL ) => ( .35 + age * 4.1 ) * p.size;
// light() of the source: its brightness over the burst; 3.15 is the peak at age 0 (flash 1)
export const fireballLight = ( age, p = FIREBALL ) => ( Math.exp( - age * 13 ) * 2.2 + Math.exp( - age * 3 ) * .95 ) * p.flash;
const LIGHT_PEAK = 3.15, LIGHT_RADIUS = 350, LIGHT_RADIUS_MIN = 200, LIGHT_CUTOFF = .02, LIGHT_KEY = 0x46490000;

// ---------------------------------------------------------------------------
// Shaders (the source's GLSL, adapted to three's ShaderMaterial and to Quaked's
// multiple-render-target pipeline: extra outputs are written as zero so emission
// never overwrites opaque receiver packets, as in r_quadparticles.js).
// ---------------------------------------------------------------------------

const MRT_OUT = `
layout(location=1) out highp vec4 gNormal;
layout(location=2) out highp vec4 gAlbedo;
layout(location=3) out highp vec4 gHeightMask;
`;
const MRT_ZERO = 'gNormal=vec4(0.);gAlbedo=vec4(0.);gHeightMask=vec4(0.);';

const PUFF_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPosSize,aInfo,aTint;
varying vec2 vUV;varying vec4 vInfo,vTint;
void main(){
 vec2 p=position.xy;
 vec2 r=mat2(cos(aInfo.x),sin(aInfo.x),-sin(aInfo.x),cos(aInfo.x))*p;
 float scale=length(modelMatrix[0].xyz);
 vec4 mv=modelViewMatrix*vec4(aPosSize.xyz,1.);
 mv.xy+=r*aPosSize.w*scale;
 vec4 mvPosition=mv;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mv;
 vUV=p*.5+.5;vInfo=aInfo;vTint=aTint;
}`;
const PUFF_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform sampler2D uAtlas,uNoise;uniform float uTime;
varying vec2 vUV;varying vec4 vInfo,vTint;
${MRT_OUT}
vec3 hotColor(float h){vec3 c=mix(vec3(.68,.037,.002),vec3(1.,.29,.008),smoothstep(0.,.42,h));c=mix(c,vec3(1.,.78,.19),smoothstep(.38,.82,h));return mix(c,vec3(1.,.96,.68),smoothstep(.81,1.2,h));}
void main(){
 #include <clipping_planes_fragment>
 vec2 flow=texture2D(uNoise,vUV*.78+vec2(vTint.w,uTime*.022)).rg-.5;
 vec2 q=vUV+flow*.055;
 if(any(lessThan(q,vec2(.006)))||any(greaterThan(q,vec2(.994))))discard;
 vec2 tile=vec2(mod(vInfo.w,4.),floor(vInfo.w/4.));
 vec4 puff=texture2D(uAtlas,(tile+q)/4.);
 float alpha=puff.a*vInfo.y;
 if(alpha<.001)discard;
 vec3 col=puff.rgb*vTint.rgb;
 if(vInfo.z>0.){
  float noise=texture2D(uNoise,vUV*1.1+flow*.13+vec2(vTint.w,-uTime*.12)).r;
  float h=max(0.,vInfo.z+(noise-.5)*.9);
  float shade=dot(puff.rgb,vec3(.333));
  float hot=smoothstep(.04,.43,h);
  vec3 flame=hotColor(h+shade*.22);
  col=mix(col,flame,hot);alpha*=mix(.80,1.,hot);
 }
 gl_FragColor=vec4(col*alpha,alpha);
 ${MRT_ZERO}
}`;

const GLOW_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPosSize,aColor;
varying vec2 vUV;varying vec4 vColor;
void main(){
 vec2 p=position.xy;
 float scale=length(modelMatrix[0].xyz);
 vec4 mv=modelViewMatrix*vec4(aPosSize.xyz,1.);
 mv.xy+=p*aPosSize.w*scale;
 vec4 mvPosition=mv;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mv;
 vUV=p*.5+.5;vColor=aColor;
}`;
const GLOW_FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUV;varying vec4 vColor;
${MRT_OUT}
void main(){
 #include <clipping_planes_fragment>
 vec2 p=(vUV-.5)*2.;float r=dot(p,p);
 float g=exp(-r*6.)*(1.-smoothstep(.6,1.,r));
 gl_FragColor=vec4(vColor.rgb*vColor.a*g,0.);
 ${MRT_ZERO}
}`;

const SPARK_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aStart,aEnd,aColor;
uniform vec2 uResolution;
varying vec2 vUV;varying vec4 vColor;
void main(){
 vec2 p=vec2(position.x*.5+.5,position.y);
 mat4 vp=projectionMatrix*modelViewMatrix;
 vec4 A=vp*vec4(aStart.xyz,1.),B=vp*vec4(aEnd.xyz,1.);
 vec2 d=(B.xy/max(.01,B.w)-A.xy/max(.01,A.w))*uResolution;
 d=length(d)>.001?normalize(d):vec2(0.,1.);
 vec2 n=vec2(-d.y,d.x);
 vec4 c=mix(A,B,p.x);
 float width=max(1.25,aStart.w*uResolution.y*1.32/max(.1,c.w));
 c.xy+=n*p.y*width/uResolution*2.*c.w;
 vec4 mvPosition=modelViewMatrix*vec4(mix(aStart.xyz,aEnd.xyz,p.x),1.);
 #include <clipping_planes_vertex>
 gl_Position=c;
 vUV=p;vColor=vec4(aColor.rgb*aColor.a,aEnd.w);
}`;
const SPARK_FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUV;varying vec4 vColor;
${MRT_OUT}
void main(){
 #include <clipping_planes_fragment>
 float edge=pow(max(0.,1.-abs(vUV.y)),2.2);
 float tail=smoothstep(0.,.23,vUV.x);
 float a=edge*tail*vColor.a;
 vec3 col=mix(vColor.rgb,vec3(1.,.88,.57),pow(vUV.x,5.)*.67);
 gl_FragColor=vec4(col*a,0.);
 ${MRT_ZERO}
}`;

const RING_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aCenterRadius,aAxisU,aAxisV;
varying vec2 vUV;varying float vAge;
void main(){
 vec2 p=position.xy;
 vec3 world=aCenterRadius.xyz+(aAxisU.xyz*p.x+aAxisV.xyz*p.y)*aCenterRadius.w;
 vec4 mvPosition=modelViewMatrix*vec4(world,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
 vUV=p*.5+.5;vAge=aAxisU.w;
}`;
const RING_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform sampler2D uNoise;
varying vec2 vUV;varying float vAge;
${MRT_OUT}
float sq(float x){return x*x;}
void main(){
 #include <clipping_planes_fragment>
 vec2 p=vUV*2.-1.;float r=length(p);
 float n=texture2D(uNoise,p*2.+vAge*.1).g;
 float band=exp(-sq((r-.76-(n-.5)*.035)/.038));
 float fade=(1.-smoothstep(.12,1.,vAge))*smoothstep(0.,.04,vAge);
 gl_FragColor=vec4(vec3(.74,.52,.24)*band*fade*.62,0.);
 ${MRT_ZERO}
}`;

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

// Transparent objects draw in renderOrder; the scorch decals (r_decals, 5) multiply what is
// under them, so every layer here must come after them, in the source's order
// (puffs, ring, glow, sparks).
const ORDER_PUFF = 6, ORDER_RING = 7, ORDER_GLOW = 8, ORDER_SPARK = 9;
const CONTENTS_SOLID = - 2;
const FLOOR_PROBE_STEP = 4, FLOOR_PROBE_MAX = 192;

let deps = null, group = null, ready = false, texturesRequested = false;
let atlas = null, noise = null;
const bursts = [];
let nextId = 1;
let puff = null, glow = null, spark = null, ring = null;

const quadGeometry = () => {

	const g = new THREE.InstancedBufferGeometry();
	g.setAttribute( 'position', new THREE.Float32BufferAttribute( [ - 1, - 1, 0, 1, - 1, 0, 1, 1, 0, - 1, 1, 0 ], 3 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	g.instanceCount = 0;
	return g;

};

function layer( name, capacity, attributes, material, order ) {

	const geometry = quadGeometry();
	const arrays = {};
	for ( const [ attribute, size ] of Object.entries( attributes ) ) {

		arrays[ attribute ] = new Float32Array( capacity * size );
		const buffer = new THREE.InstancedBufferAttribute( arrays[ attribute ], size );
		buffer.setUsage( THREE.DynamicDrawUsage );
		geometry.setAttribute( attribute, buffer );

	}
	const mesh = new THREE.Mesh( geometry, material );
	mesh.name = name; mesh.frustumCulled = false; mesh.renderOrder = order; mesh.userData.newerOnly = true;
	return { mesh, geometry, arrays, capacity, count: 0 };

}

function material( vertexShader, fragmentShader, uniforms, blending ) {

	return new THREE.ShaderMaterial( { uniforms, vertexShader, fragmentShader, transparent: true, depthTest: true, depthWrite: false,
		side: THREE.DoubleSide, toneMapped: false, clipping: true, blending,
		// The source blends premultiplied: (ONE, ONE_MINUS_SRC_ALPHA) for puffs and (ONE, ONE)
		// for light. three only selects those factors when premultipliedAlpha is set; without
		// it additive uses SRC_ALPHA and the alpha-0 light layers would vanish.
		premultipliedAlpha: true } );

}

function build() {

	const cap = FIREBALL.maxBursts, empty = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 );
	empty.needsUpdate = true;
	const common = () => ( { uAtlas: { value: atlas || empty }, uNoise: { value: noise || empty }, uTime: { value: 0 } } );
	puff = layer( 'fireball_clouds', cap * FIREBALL.clouds, { aPosSize: 4, aInfo: 4, aTint: 4 },
		material( PUFF_VERTEX, PUFF_FRAGMENT, common(), THREE.NormalBlending ), ORDER_PUFF );
	glow = layer( 'fireball_flash', cap, { aPosSize: 4, aColor: 4 },
		material( GLOW_VERTEX, GLOW_FRAGMENT, {}, THREE.AdditiveBlending ), ORDER_GLOW );
	spark = layer( 'fireball_sparks', cap * Math.min( FIREBALL.sparkCap, Math.round( 86 * FIREBALL.sparks ) ), { aStart: 4, aEnd: 4, aColor: 4 },
		material( SPARK_VERTEX, SPARK_FRAGMENT, { uResolution: { value: new THREE.Vector2( 1280, 720 ) } }, THREE.AdditiveBlending ), ORDER_SPARK );
	ring = layer( 'fireball_ring', cap, { aCenterRadius: 4, aAxisU: 4, aAxisV: 4 },
		material( RING_VERTEX, RING_FRAGMENT, { uNoise: { value: noise || empty } }, THREE.AdditiveBlending ), ORDER_RING );
	group = new THREE.Group(); group.name = 'quake_fireball'; group.userData.newerOnly = true;
	for ( const l of [ ring, puff, glow, spark ] ) group.add( l.mesh );

}

// The effect needs both textures; until they are present explosions stay native.
export function R_FireballTextures( atlasTexture, noiseTexture ) {

	atlas = atlasTexture; noise = noiseTexture;
	ready = !! ( atlas && noise );
	if ( ready && puff ) {

		puff.mesh.material.uniforms.uAtlas.value = atlas; puff.mesh.material.uniforms.uNoise.value = noise;
		ring.mesh.material.uniforms.uNoise.value = noise;

	}

}

function loadTextures() {

	if ( texturesRequested || typeof document === 'undefined' ) return;
	texturesRequested = true;
	let a = null, n = null;
	const load = ( file, repeat, assign ) => new THREE.TextureLoader().load(
		COM_NewerURL( 'newer/effects/fireball/' + file, new URL( '../newer/effects/fireball/' + file, import.meta.url ).href ),
		texture => {

			texture.colorSpace = THREE.NoColorSpace; texture.generateMipmaps = false;
			texture.minFilter = texture.magFilter = THREE.LinearFilter;
			if ( repeat ) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
			assign( texture );
			if ( a && n ) R_FireballTextures( a, n );

		}, undefined, () => console.warn( 'Fireball texture ' + file + ' unavailable; native explosion particles remain active.' ) );
	load( 'smoke-atlas.png', false, t => { a = t; } );
	load( 'noise.png', true, t => { n = t; } );

}

// The caller supplies the scene, the client and the leaf lookup, as R_DecalsSetup does.
export function R_FireballSetup( externals ) {

	deps = externals;
	loadTextures();

}

export function R_FireballClear() {

	bursts.length = 0;
	if ( group ) {

		group.visible = false;
		for ( const l of [ puff, glow, spark, ring ] ) l.geometry.instanceCount = 0;

	}

}

export function R_FireballActive() { return bursts.length; }

// Height of the detonation above the first solid below it, in source units.
function floorHeight( origin, worldmodel ) {

	if ( ! deps?.pointInLeaf || worldmodel == null ) return .425;
	const q = [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ];
	for ( let d = FLOOR_PROBE_STEP; d <= FLOOR_PROBE_MAX; d += FLOOR_PROBE_STEP ) {

		q[ 2 ] = origin[ 2 ] - d;
		const leaf = deps.pointInLeaf( q, worldmodel );
		if ( leaf != null && leaf.contents === CONTENTS_SOLID ) return Math.max( .05, ( d - FLOOR_PROBE_STEP * .5 ) / FIREBALL.unit );

	}
	return FLOOR_PROBE_MAX / FIREBALL.unit;

}

// The impact surface for the ground ring, as an orthonormal in-plane basis.
function ringPlane( origin, worldmodel ) {

	if ( ! deps?.pointInLeaf || worldmodel == null ) return null;
	const hit = R_DecalSurface( worldmodel, origin, 48, deps.pointInLeaf );
	if ( hit === null ) return null;
	const nx = hit.nx, ny = hit.ny, nz = hit.nz;
	let ax = 0, ay = 0, az = 1;
	if ( Math.abs( nz ) > .9 ) { ax = 1; az = 0; }
	let ux = ay * nz - az * ny, uy = az * nx - ax * nz, uz = ax * ny - ay * nx;
	const l = Math.hypot( ux, uy, uz ) || 1;
	ux /= l; uy /= l; uz /= l;
	return { center: [ hit.px + nx * 1.2, hit.py + ny * 1.2, hit.pz + nz * 1.2 ], u: [ ux, uy, uz ],
		v: [ ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux ] };

}

// Replace one explosion's particles. Returns false when the native particles must be
// used: Classic, textures not loaded, no scene, r_fireball 0, or a pool full of young
// bursts. (During the title demo's split view the caller also spawns Classic-only native
// particles for the Classic half, which hides everything Newer.) `light` drives the native dynamic light from the source's
// curve; pass false for an event that never had one.
export function R_FireballSpawn( origin, { light = true } = {} ) {

	if ( deps == null || ! deps.scene || r_fireball.value === 0 || ! R_NewerGame()) return false;
	loadTextures();
	if ( ! ready ) return false;
	const cl = deps.cl?.();
	if ( cl == null ) return false;
	// Bounded: a full pool lets its oldest burst go only once that burst's smoke is faint
	// (1.5 s); a chain of explosions beyond that falls back to the native particles.
	if ( bursts.length >= FIREBALL.maxBursts ) {

		if ( cl.time - ( bursts[ 0 ].start ?? bursts[ 0 ].spawned ) < POOL_YIELD_AGE ) return false;
		bursts.shift();

	}
	const model = cl.worldmodel ?? null;
	// `start` stays null until the first frame that draws the burst: the client's clock is
	// stepped back a little after a message is parsed (CL_RelinkEntities clamps it to the
	// server time; a remote server's latency estimate moves it), so a time taken here can
	// be ahead of every later frame's, and the burst would be thrown away unseen.
	bursts.push( { id: nextId ++, origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ], start: null, spawned: cl.time, light,
		height: floorHeight( origin, model ), plane: ringPlane( origin, model ) } );
	return true;

}

const POOL_YIELD_AGE = 1.5, REWIND_DROP = 1;

// The native dynamic light's strength is its remaining life (capped at 0.5 s) in a fixed
// warm colour, so setting `die` each frame makes it follow the source's light curve. The
// peak equals the native explosion light's.
function driveLight( b, age, time ) {

	if ( ! b.light || ! deps.allocDlight ) return;
	const k = Math.min( 1, fireballLight( age ) / LIGHT_PEAK );
	if ( k < LIGHT_CUTOFF ) return;
	const dl = deps.allocDlight( LIGHT_KEY + ( b.id & 0xffff ) );
	dl.origin[ 0 ] = b.origin[ 0 ]; dl.origin[ 1 ] = b.origin[ 1 ]; dl.origin[ 2 ] = b.origin[ 2 ] + .4 * FIREBALL.unit;
	// radius as well as strength fall with the curve (native: 350 -> 200 over its half second); consumers
	// that read the radius (screen tint, light slot ranking, model lighting, lightmaps) then fade with it
	dl.radius = LIGHT_RADIUS_MIN + ( LIGHT_RADIUS - LIGHT_RADIUS_MIN ) * k; dl.die = time + .5 * k; dl.decay = 0;

}

// Per-frame scratch: nothing below allocates.
const PUFF_STRIDE = 12;
const _puffRows = new Float32Array( FIREBALL.maxBursts * FIREBALL.clouds * PUFF_STRIDE );
const _puffDepth = new Float32Array( FIREBALL.maxBursts * FIREBALL.clouds );
const _puffOrder = new Uint16Array( FIREBALL.maxBursts * FIREBALL.clouds );

// The state the emit callbacks share for the frame being built (module level, so the
// callbacks are created once and never close over a single call's variables).
const _f = { puffs: 0, sparks: 0, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 0, fx: 0, fy: 0, fz: 0 };

// source (x, y-up, z) -> Quake (x, y, z-up): world = origin + ( x, z, y ) * unit
function emitCloud( x, y, z, size, angle, alpha, heat, tile, r, g, b, seed ) {

	if ( _f.puffs >= puff.capacity ) return;
	const K = FIREBALL.unit, o = _f.puffs * PUFF_STRIDE, wx = _f.ox + x * K, wy = _f.oy + z * K, wz = _f.oz + y * K;
	_puffRows[ o ] = wx; _puffRows[ o + 1 ] = wy; _puffRows[ o + 2 ] = wz; _puffRows[ o + 3 ] = size * K;
	_puffRows[ o + 4 ] = angle; _puffRows[ o + 5 ] = alpha; _puffRows[ o + 6 ] = heat; _puffRows[ o + 7 ] = tile;
	_puffRows[ o + 8 ] = r; _puffRows[ o + 9 ] = g; _puffRows[ o + 10 ] = b; _puffRows[ o + 11 ] = seed;
	_puffDepth[ _f.puffs ] = ( wx - _f.ex ) * _f.fx + ( wy - _f.ey ) * _f.fy + ( wz - _f.ez ) * _f.fz;
	_f.puffs ++;

}

function emitSpark( sx, sy, sz, tx, ty, tz, width, alpha, r, g, b, brightness ) {

	if ( _f.sparks >= spark.capacity ) return;
	const K = FIREBALL.unit, A = spark.arrays.aStart, B = spark.arrays.aEnd, C = spark.arrays.aColor, o = _f.sparks * 4;
	A[ o ] = _f.ox + sx * K; A[ o + 1 ] = _f.oy + sz * K; A[ o + 2 ] = _f.oz + sy * K; A[ o + 3 ] = width * K;
	B[ o ] = _f.ox + tx * K; B[ o + 1 ] = _f.oy + tz * K; B[ o + 2 ] = _f.oz + ty * K; B[ o + 3 ] = alpha;
	C[ o ] = r; C[ o + 1 ] = g; C[ o + 2 ] = b; C[ o + 3 ] = brightness;
	_f.sparks ++;

}

// Every frame, before the scene renders. `forward` must be the view's current forward
// vector (not last frame's) so the puffs sort correctly the frame the view turns.
export function R_FireballFrame( time, eye, forward, viewSize ) {

	const scene = deps?.scene;
	if ( ! scene ) return;
	if ( ! R_NewerGame() ) { bursts.length = 0; if ( group ) group.visible = false; return; }
	for ( const b of bursts ) if ( b.start === null ) b.start = time;
	// A burst ends after its duration, or when the clock has jumped back by more than a
	// moment (a demo loop or a new game). Small backward steps are normal and never end it.
	for ( let i = bursts.length - 1; i >= 0; i -- ) if ( time - bursts[ i ].start > FIREBALL.duration || bursts[ i ].start - time > REWIND_DROP ) bursts.splice( i, 1 );
	if ( bursts.length === 0 ) { if ( group ) group.visible = false; return; }
	if ( group === null ) build();
	if ( group.parent !== scene ) scene.add( group );
	group.visible = true;

	const K = FIREBALL.unit;
	_f.puffs = 0; _f.sparks = 0;
	_f.ex = eye[ 0 ]; _f.ey = eye[ 1 ]; _f.ez = eye[ 2 ]; _f.fx = forward[ 0 ]; _f.fy = forward[ 1 ]; _f.fz = forward[ 2 ];
	let glows = 0, rings = 0;
	for ( const b of bursts ) {

		const age = Math.max( 0, time - b.start );
		_f.ox = b.origin[ 0 ]; _f.oy = b.origin[ 1 ]; _f.oz = b.origin[ 2 ];
		forEachCloud( age, b.id, FIREBALL, emitCloud );
		const flash = fireballFlash( age );
		if ( flash > .003 && glows < glow.capacity ) {

			const o = glows * 4, G = glow.arrays;
			G.aPosSize[ o ] = _f.ox; G.aPosSize[ o + 1 ] = _f.oy; G.aPosSize[ o + 2 ] = _f.oz + .10 * K;
			G.aPosSize[ o + 3 ] = FIREBALL.size * 2.4 * K;
			G.aColor[ o ] = 1; G.aColor[ o + 1 ] = .64; G.aColor[ o + 2 ] = .24; G.aColor[ o + 3 ] = flash;
			glows ++;

		}
		forEachSpark( age, b.id, FIREBALL, b.height, emitSpark );
		// (the ring's own fade reaches zero at age 1)
		if ( b.plane && age < 1 && rings < ring.capacity ) {

			const o = rings * 4, c = b.plane.center, u = b.plane.u, v = b.plane.v, A = ring.arrays;
			A.aCenterRadius[ o ] = c[ 0 ]; A.aCenterRadius[ o + 1 ] = c[ 1 ]; A.aCenterRadius[ o + 2 ] = c[ 2 ];
			A.aCenterRadius[ o + 3 ] = fireballRingRadius( age ) * K;
			A.aAxisU[ o ] = u[ 0 ]; A.aAxisU[ o + 1 ] = u[ 1 ]; A.aAxisU[ o + 2 ] = u[ 2 ]; A.aAxisU[ o + 3 ] = age;
			A.aAxisV[ o ] = v[ 0 ]; A.aAxisV[ o + 1 ] = v[ 1 ]; A.aAxisV[ o + 2 ] = v[ 2 ]; A.aAxisV[ o + 3 ] = 0;
			rings ++;

		}
		driveLight( b, age, time );

	}
	const puffs = _f.puffs, sparks = _f.sparks, rows = _puffRows;

// puffs back to front, as the source sorts them
	for ( let i = 0; i < puffs; i ++ ) _puffOrder[ i ] = i;
	_puffOrder.subarray( 0, puffs ).sort( ( a, b ) => _puffDepth[ b ] - _puffDepth[ a ] );
	const P = puff.arrays;
	for ( let n = 0; n < puffs; n ++ ) {

		const r = _puffOrder[ n ] * PUFF_STRIDE, o = n * 4;
		P.aPosSize[ o ] = rows[ r ]; P.aPosSize[ o + 1 ] = rows[ r + 1 ]; P.aPosSize[ o + 2 ] = rows[ r + 2 ]; P.aPosSize[ o + 3 ] = rows[ r + 3 ];
		P.aInfo[ o ] = rows[ r + 4 ]; P.aInfo[ o + 1 ] = rows[ r + 5 ]; P.aInfo[ o + 2 ] = rows[ r + 6 ]; P.aInfo[ o + 3 ] = rows[ r + 7 ];
		P.aTint[ o ] = rows[ r + 8 ]; P.aTint[ o + 1 ] = rows[ r + 9 ]; P.aTint[ o + 2 ] = rows[ r + 10 ]; P.aTint[ o + 3 ] = rows[ r + 11 ];

	}
	puff.geometry.instanceCount = puffs; glow.geometry.instanceCount = glows;
	spark.geometry.instanceCount = sparks; ring.geometry.instanceCount = rings;
	for ( const l of [ puff, glow, spark, ring ] ) for ( const attribute of Object.values( l.geometry.attributes ) ) if ( attribute.isInstancedBufferAttribute ) attribute.needsUpdate = true;
	puff.mesh.material.uniforms.uTime.value = time;
	if ( viewSize ) spark.mesh.material.uniforms.uResolution.value.set( viewSize[ 0 ], viewSize[ 1 ] );

}

// Diagnostic read-only view for tests and the browser trial.
export function R_FireballSnapshot() {

	return { ready, bursts: bursts.length, group: group !== null,
		puffs: puff?.geometry.instanceCount ?? 0, sparks: spark?.geometry.instanceCount ?? 0,
		glows: glow?.geometry.instanceCount ?? 0, rings: ring?.geometry.instanceCount ?? 0,
		capacity: puff ? { puffs: puff.capacity, sparks: spark.capacity } : null };

}
