// "02 Wall torch" from the owner-supplied FieldLab FX3D source (SHA-256 7e35fc80...c7d6, kept
// local): the supplied flame for Quake's torches and fire pits, in Newer Game, laid over the native
// flame model (r_torchfire 1) or in place of its flame (r_torchfire 2). Source lines:
// cardVert 112, fire 115-119, card 147, torchEmbers 197, torchSmoke 198, light 202, render 213,
// configs.fire 229, DEFAULTS.fire 50. Extraction map and provenance:
// newer/effects/fireball/provenance.json and docs/torch-fire-2026-10-08.md.
//
// What it draws on. Every torch and fire pit in Quake is a static entity drawn with one of two
// alias models, progs/flame.mdl (the wall torch) and progs/flame2.mdl (small yellow/white flames
// in frame 0, the large yellow flame in frame 1). flame2.mdl is the flame alone (the brazier is a
// brush of the map) and is replaced whole. flame.mdl is the flame on its wooden handle: the handle
// is the torch's hardware and stays the native model; only the flame triangles are replaced (they
// are told apart by the skin columns the handle occupies, and the replacement is declined unless
// the model has exactly the handle it is known to have). Anything else (other model names, other
// levels' views through portals, Classic, r_torchfire 0, textures still loading, more torches in
// view than the pool holds) keeps the native model, exactly as before. (By default nothing native is hidden:
// the flame is added over the model, whose own glow stays and gives it a body; the split into flame and
// handle is for r_torchfire 2.)
//
// What is not touched. The light is not replaced and none is added: the torches' light comes from
// the map's own light entities (gl_post.js worldLights, with R_FireFlicker), whatever model the
// entity draws, so there is exactly one light owner and the "style"/flicker behaviour is kept.
//
// How it is built. The flame is the source's own: an upright, camera-facing card whose
// fragment shader erodes a seamless noise texture into a flame (no simulation), plus 22 rising
// embers and 16 faint smoke puffs, each a function of time alone (no per-particle state). The
// scale of each flame comes from the entity's own model: the source's flame is 1.847 source units
// from root to tip, and the flame triangles' average height over the poses of the entity's own frame
// group (small and large flames differ), times `fit` (an eye-chosen calibration), is mapped onto that, so a wall torch, a small
// flame and a large flame are each as tall as the flame they replace. Position: the flame's root is
// the lowest point of the flame triangles.
//
// This file is the pure part (specification, placement, the source's ember and smoke functions)
// and the renderer layers. The two share the shaders, textures and layer helpers of r_fireball.js
// because the source does.
import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { smooth, hashJS } from './fx_math.js';
import { R_NewerGame } from './r_anim.js';
import { GL_DrawAliasFrame } from './gl_mesh.js';
import { MRT_OUT, MRT_ZERO, PUFF_VERTEX, PUFF_FRAGMENT, SPARK_VERTEX, SPARK_FRAGMENT, layer, material, R_FireballAssets } from './r_fireball.js';

// 0 puts the native flame models back
export const r_torchfire = new cvar_t( 'r_torchfire', '1' );

export const TORCH = Object.freeze( {
	// DEFAULTS.fire of the source
	size: 1, turbulence: 1.6, glow: 1.8, wind: 0,
	// render 213: the card is 2.8 x 3.25 source units, its centre 1.385 above the flame's root
	cardWidth: 2.8, cardHeight: 3.25, cardCentre: 1.385,
	// the flame's visible height (root to tip) in source units: the shader maps the card's height to
	// 1.76 flame heights (p.y = v * 1.76 - .13) and the flame ends at p.y = 1
	flameHeight: 3.25 / 1.76,
	// The model's extents are set by thin tips; the body that reads as flame is about this fraction of
	// them. Measured on photographs of the stock models (a wall torch's body, 78 px against 127 px of
	// extent) and the supplied flame set to the same body height.
	fit: .8,
	embers: 22, smoke: 16,
	max: 128,         // torches replaced in one frame (a level has at most 128 static entities); any more draw as the native model
	models: Object.freeze( [ 'progs/flame.mdl', 'progs/flame2.mdl' ] )
} );

// ---------------------------------------------------------------------------
// Placement from the native fixture
// ---------------------------------------------------------------------------

// flame.mdl's wooden handle: the skin columns it occupies (s / skin width) in the front and the back
// half of the skin, and how many triangles it has. Read off the stock model and its skin.
const HANDLE = Object.freeze( { model: 'progs/flame.mdl', columns: [ [ .10, .22 ], [ .60, .72 ] ], triangles: 36, top: 2.5 } );
// the stock models' triangle counts: a model with another count is not the one this module knows
const STOCK_TRIANGLES = Object.freeze( { 'progs/flame.mdl': 122, 'progs/flame2.mdl': 86 } );

const partsOf = new WeakMap();

// Splits a model into the flame (replaced) and the hardware (kept). `ok` is false when the model is
// not the one this module knows, and the native model is then left alone.
// partsOf: alias header -> { ok, handle: Uint8Array per triangle, handleTriangles, select }
export function torchParts( name, header ) {

	let parts = partsOf.get( header );
	if ( parts !== undefined ) return parts;
	const t = GL_DrawAliasFrame( header, 0 );
	const triangles = t.indices.length / 3, handle = new Uint8Array( triangles ), keep = [];
	let count = 0, ok = triangles === STOCK_TRIANGLES[ name ];
	if ( name === HANDLE.model ) {

		const uv = t.uvAttr.array, pos = t.posAttr.array;
		for ( let k = 0; k < triangles; k ++ ) {

			const a = t.indices[ k * 3 ], b = t.indices[ k * 3 + 1 ], c = t.indices[ k * 3 + 2 ];
			const lo = Math.min( uv[ a * 2 ], uv[ b * 2 ], uv[ c * 2 ] ), hi = Math.max( uv[ a * 2 ], uv[ b * 2 ], uv[ c * 2 ] );
			if ( HANDLE.columns.some( ( [ from, to ] ) => lo >= from && hi <= to ) ) {

				handle[ k ] = 1; count ++; keep.push( a, b, c );
				if ( Math.max( pos[ a * 3 + 2 ], pos[ b * 3 + 2 ], pos[ c * 3 + 2 ] ) > HANDLE.top ) ok = false; // the handle ends below the flame

			}

		}
		if ( count !== HANDLE.triangles ) ok = false;

	}
	// the handle's triangles as one shared index buffer (the triangle order is the same in every pose); `select`
	// is what gl_mesh.js calls (entity._aliasPart) to draw the handle only
	const handleIndex = new THREE.BufferAttribute( new Uint16Array( keep ), 1 );
	parts = Object.freeze( { ok, handle, handleTriangles: count, select: () => handleIndex } );
	partsOf.set( header, parts );
	return parts;

}

const extents = new WeakMap(); // alias header -> per frame group { base, top, height, radius }

// The flame's own extents over the poses of one frame group, in Quake units relative to the entity
// origin: the triangles of the flame only (the handle, where there is one, is left out).
export function flameExtent( name, header, frame ) {

	let list = extents.get( header );
	if ( list === undefined ) { list = []; extents.set( header, list ); }
	const index = header.frames && header.frames[ frame ] !== undefined ? frame : 0;
	if ( list[ index ] !== undefined ) return list[ index ];
	const group = header.frames[ index ], first = group.firstpose ?? 0, poses = Math.max( 1, group.numposes ?? 1 );
	const parts = torchParts( name, header );
	let base = 0, top = 0, radius = 0;
	for ( let k = 0; k < poses; k ++ ) {

		const t = GL_DrawAliasFrame( header, first + k ), P = t.posAttr.array;
		let lo = Infinity, hi = - Infinity;
		for ( let tri = 0; tri < t.indices.length / 3; tri ++ ) {

			if ( parts.handle[ tri ] === 1 ) continue;
			for ( let c = 0; c < 3; c ++ ) {

				const v = t.indices[ tri * 3 + c ] * 3, z = P[ v + 2 ];
				if ( z < lo ) lo = z;
				if ( z > hi ) hi = z;
				radius = Math.max( radius, Math.hypot( P[ v ], P[ v + 1 ] ) );

			}

		}
		base += lo; top += hi;

	}
	base /= poses; top /= poses;
	return list[ index ] = Object.freeze( { base, top, height: top - base, radius } );

}

// Quake units per source unit for a flame of this height
export const torchUnit = height => height * TORCH.fit / TORCH.flameHeight;

// A phase for each torch, so a row of torches does not burn in step (the source has one flame).
export const torchPhase = ( x, y, z ) => hashJS( x * .071 + y * .113 + z * .057 ) * 97;

// ---------------------------------------------------------------------------
// The source's ember and smoke functions, in source units (y up) relative to the flame's root.
// ---------------------------------------------------------------------------

// torchEmbers(): emit( startX, startY, startZ, endX, endY, endZ, width, alpha, r, g, b )
export function forEachEmber( time, wind, emit ) {

	for ( let i = 0; i < TORCH.embers; i ++ ) {

		const seed = hashJS( i * 13.6 ), age = ( time * .28 + seed * 5 ) % 1;
		const x = Math.sin( age * 6 + seed * 50 ) * .14 * age + wind * age * .35, y = age * 1.8, z = Math.cos( age * 7 + seed * 16 ) * .15 * age;
		emit( x - .007, y - .025, z, x, y, z, .0045, ( 1 - age ) * smooth( 0, .15, age ) * .8, 1, .44, .08 );

	}

}

// torchSmoke(): emit( x, y, z, size, angle, alpha, heat, tile, tintR, tintG, tintB, seed )
export function forEachSmoke( time, size, wind, emit ) {

	for ( let i = 0; i < TORCH.smoke; i ++ ) {

		const s = hashJS( i * 31 ), a = ( time * .19 + i / 16 ) % 1;
		emit( Math.sin( a * 4 + s * 9 ) * .19 * a + wind * a * .2, 1.30 * size + a * 1.40, Math.cos( a * 6 + s * 11 ) * .12 * a,
			.13 + a * .23, s * 6.3 + a, Math.sin( a * Math.PI ) * .05, - 1, i, .43, .44, .43, s * 9 );

	}

}

// ---------------------------------------------------------------------------
// Frame registry: the torches the entity list asked for this frame
// ---------------------------------------------------------------------------

const STRIDE = 6; // x, y, z of the flame's root, source unit in Quake units, phase, unused
const rows = new Float32Array( TORCH.max * STRIDE );
let count = 0, deps = null;

export function R_TorchFireSetup( externals ) { deps = externals; }
export function R_TorchFireBegin() { count = 0; }
export function R_TorchFireCount() { return count; }

// Is this entity one of the torches the supplied flame replaces, and is the replacement on?
export function torchSupported( e ) {

	const model = e?.model;
	return model != null && TORCH.models.includes( model.name ) && model.cache?.data?.posedata != null && model.cache.data.frames != null;

}

// Called while the entity list is drawn (R_DrawAliasModel). Returns 0 when the native model is drawn
// as before: Classic (and the classic half of the title demo), r_torchfire 0, an unsupported entity,
// the textures not (yet) available, or a full pool. Returns TORCH_WHOLE when the supplied flame takes
// the entity and the whole model is not drawn, and TORCH_HANDLE when the model is drawn without its
// flame (only the handle).
export const TORCH_WHOLE = 1, TORCH_HANDLE = 2, TORCH_OVERLAY = 3;
export function R_TorchFire( e ) {

	if ( deps == null || ! deps.scene || r_torchfire.value === 0 || ! R_NewerGame() || ! torchSupported( e ) ) return 0;
	if ( count >= TORCH.max || ! e.origin ) return 0;
	if ( R_FireballAssets() === null ) return 0;
	const header = e.model.cache.data, parts = torchParts( e.model.name, header );
	if ( ! parts.ok ) return 0;
	const extent = flameExtent( e.model.name, header, e.frame | 0 );
	if ( ! ( extent.height > 1 ) ) return 0;
	const o = count ++ * STRIDE;
	rows[ o ] = e.origin[ 0 ]; rows[ o + 1 ] = e.origin[ 1 ]; rows[ o + 2 ] = e.origin[ 2 ] + extent.base;
	rows[ o + 3 ] = torchUnit( extent.height ); rows[ o + 4 ] = torchPhase( e.origin[ 0 ], e.origin[ 1 ], e.origin[ 2 ] );
	// r_torchfire 1: the supplied flame is laid over the native model (whose own glow stays); 2: it replaces the native flame
	return r_torchfire.value === 2 ? ( parts.handleTriangles > 0 ? TORCH_HANDLE : TORCH_WHOLE ) : TORCH_OVERLAY;

}

// ---------------------------------------------------------------------------
// Renderer layers
// ---------------------------------------------------------------------------

// The source's `cardVert` and `fire` shaders. The card is upright (world up) and turns about the
// vertical axis to face the camera, as the source's does. The source also bends the picture behind
// the flame (heat haze) by sampling the opaque scene colour; Quaked does not expose that to effects,
// so that term is left out and the rest is the source's: where the source's shader would blend its
// own sample of the background it blends the background itself, which gives out = (flame * alpha +
// glow) * coverage with alpha * coverage as the blend factor.
const CARD_VERTEX = `
#include <clipping_planes_pars_vertex>
attribute vec4 aPosSize,aInfo;
varying vec2 vUV;varying float vPhase;
void main(){
 vec2 u=position.xy*.5+.5;
 float scale=length(modelMatrix[0].xyz);
 vec4 c=modelViewMatrix*vec4(aPosSize.xyz,1.);
 vec3 up=normalize(mat3(modelViewMatrix)*vec3(0.,0.,1.));
 vec3 right=vec3(1.,0.,0.)-up*up.x;
 right=length(right)>.001?normalize(right):vec3(1.,0.,0.);
 float K=aPosSize.w*scale;
 vec4 mvPosition=vec4(c.xyz+right*(u.x-.5)*${TORCH.cardWidth.toFixed( 3 )}*K+up*(u.y-.5)*${TORCH.cardHeight.toFixed( 3 )}*K,1.);
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*mvPosition;
 vUV=u;vPhase=aInfo.x;
}`;
const CARD_FRAGMENT = `
#include <clipping_planes_pars_fragment>
uniform sampler2D uNoise;uniform float uTime;uniform vec4 uParams;
varying vec2 vUV;varying float vPhase;
${MRT_OUT}
float sq(float x){return x*x;}
vec3 flameColor(float h){vec3 c=mix(vec3(.85,.055,.003),vec3(1.,.28,.012),smoothstep(.0,.36,h));c=mix(c,vec3(1.,.77,.16),smoothstep(.25,.73,h));return mix(c,vec3(1.,.98,.72),smoothstep(.68,1.,h));}
void main(){
 #include <clipping_planes_fragment>
 float size=uParams.x,turb=uParams.y,glow=uParams.z,wind=uParams.w;
 vec2 p=vec2((vUV.x-.5)*2.5,vUV.y*1.76-.13);
 float t=uTime+vPhase;
 vec2 adv=vec2(p.x*.56,p.y*.82-t*.33);
 vec2 flow=texture2D(uNoise,adv).rg*2.-1.;
 vec2 fine=texture2D(uNoise,adv*2.2+vec2(.37,-t*.12)).rg*2.-1.;
 float y=p.y;
 float bend=wind*y*y*.60+sin(y*8.-t*4.3)*.045*y*turb;
 float x=p.x-bend+(flow.x*.21+fine.y*.075)*turb*(.3+max(y,0.));
 float width=.35*pow(max(0.,1.-y),.85)+.065*sin(clamp(y,0.,1.)*3.14159);
 float field=width-abs(x)+(flow.y*.12+fine.x*.055)*turb*clamp(y+.12,0.,1.);
 float aa=.012+min(.026,length(fwidth(p))*.4);
 float root=y+.034*(1.-smoothstep(.04,.38,abs(x)));
 float body=smoothstep(-.042-aa,.018+aa,field)*smoothstep(-.026,.030,root)*(1.-smoothstep(.84,1.13,y));
 float raw=max(0.,field*2.9+(.7-y)*.52+fine.y*.12);
 float heat=clamp(raw/(.40+raw)*1.23,0.,1.);
 float alpha=body*(.68+.30*smoothstep(.06,.45,heat));
 float g=exp(-sq(p.x/.55)-sq((y-.18)/.58));
 float haze=exp(-sq(p.x/.30))*smoothstep(.08,.45,y)*(1.-smoothstep(.93,1.5,y));
 float coverage=max(alpha,max(haze*.75,g*.32));
 if(coverage<.004)discard;
 vec3 lit=flameColor(heat)*alpha+vec3(.05,.013,.001)*g*glow;
 gl_FragColor=vec4(lit*coverage,alpha*coverage);
 ${MRT_ZERO}
}`;

// (exported for tests: the source's statements are compared against these)
export const TORCH_SHADERS = Object.freeze( { vertex: CARD_VERTEX, fragment: CARD_FRAGMENT } );

export const TORCH_ORDER = Object.freeze( { smoke: 6, card: 7, ember: 9 } );
const ORDER_SMOKE = TORCH_ORDER.smoke, ORDER_CARD = TORCH_ORDER.card, ORDER_EMBER = TORCH_ORDER.ember;
const PUFF_STRIDE = 12, PUFF_MAX = TORCH.max * TORCH.smoke;
const puffRows = new Float32Array( PUFF_MAX * PUFF_STRIDE ), puffDepth = new Float32Array( PUFF_MAX ), puffOrder = new Uint16Array( PUFF_MAX );
const byDepth = ( a, b ) => puffDepth[ b ] - puffDepth[ a ];
const cardDepth = new Float32Array( TORCH.max ), cardOrder = new Uint8Array( TORCH.max );
const byCardDepth = ( a, b ) => cardDepth[ b ] - cardDepth[ a ];

let group = null, smokeLayer = null, cardLayer = null, emberLayer = null, boundAssets = null;
const instanced = [];

function build() {

	const empty = new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 );
	empty.needsUpdate = true;
	smokeLayer = layer( 'torch_smoke', PUFF_MAX, { aPosSize: 4, aInfo: 4, aTint: 4 },
		material( PUFF_VERTEX, PUFF_FRAGMENT, { uAtlas: { value: empty }, uNoise: { value: empty }, uTime: { value: 0 } }, THREE.NormalBlending ), ORDER_SMOKE );
	cardLayer = layer( 'torch_flame', TORCH.max, { aPosSize: 4, aInfo: 4 },
		material( CARD_VERTEX, CARD_FRAGMENT, { uNoise: { value: empty }, uTime: { value: 0 },
			uParams: { value: new THREE.Vector4( TORCH.size, TORCH.turbulence, TORCH.glow, TORCH.wind ) } }, THREE.NormalBlending ), ORDER_CARD );
	emberLayer = layer( 'torch_embers', TORCH.max * TORCH.embers, { aStart: 4, aEnd: 4, aColor: 4 },
		material( SPARK_VERTEX, SPARK_FRAGMENT, { uResolution: { value: new THREE.Vector2( 1280, 720 ) } }, THREE.AdditiveBlending ), ORDER_EMBER );
	for ( const l of [ smokeLayer, cardLayer, emberLayer ] ) for ( const a of Object.values( l.geometry.attributes ) ) if ( a.isInstancedBufferAttribute ) instanced.push( a );
	group = new THREE.Group(); group.name = 'quake_torch_fire'; group.userData.newerOnly = true;
	for ( const l of [ smokeLayer, cardLayer, emberLayer ] ) group.add( l.mesh );

}

// State the emit callbacks share for the frame being built.
const f = { puffs: 0, embers: 0, ox: 0, oy: 0, oz: 0, K: 1, ex: 0, ey: 0, ez: 0, fx: 0, fy: 0, fz: 0 };

// source (x, y-up, z) -> Quake (x, y, z-up): world = root + ( x, z, y ) * K
function emitPuff( x, y, z, size, angle, alpha, heat, tile, r, g, b, seed ) {

	const K = f.K, o = f.puffs * PUFF_STRIDE, wx = f.ox + x * K, wy = f.oy + z * K, wz = f.oz + y * K;
	puffRows[ o ] = wx; puffRows[ o + 1 ] = wy; puffRows[ o + 2 ] = wz; puffRows[ o + 3 ] = size * K;
	puffRows[ o + 4 ] = angle; puffRows[ o + 5 ] = alpha; puffRows[ o + 6 ] = heat; puffRows[ o + 7 ] = tile;
	puffRows[ o + 8 ] = r; puffRows[ o + 9 ] = g; puffRows[ o + 10 ] = b; puffRows[ o + 11 ] = seed;
	puffDepth[ f.puffs ] = ( wx - f.ex ) * f.fx + ( wy - f.ey ) * f.fy + ( wz - f.ez ) * f.fz;
	f.puffs ++;

}

function emitEmber( sx, sy, sz, tx, ty, tz, width, alpha, r, g, b ) {

	const K = f.K, A = emberLayer.arrays.aStart, B = emberLayer.arrays.aEnd, C = emberLayer.arrays.aColor, o = f.embers * 4;
	A[ o ] = f.ox + sx * K; A[ o + 1 ] = f.oy + sz * K; A[ o + 2 ] = f.oz + sy * K; A[ o + 3 ] = width * K;
	B[ o ] = f.ox + tx * K; B[ o + 1 ] = f.oy + tz * K; B[ o + 2 ] = f.oz + ty * K; B[ o + 3 ] = alpha;
	C[ o ] = r; C[ o + 1 ] = g; C[ o + 2 ] = b; C[ o + 3 ] = 1;
	f.embers ++;

}

// Every frame, after the entity list has been drawn (so the registry is this frame's): write the
// flames, embers and smoke of the torches registered. `forward` is the view's forward vector.
export function R_TorchFireFlush( time, eye, forward, viewSize ) {

	const scene = deps?.scene;
	if ( ! scene ) return;
	if ( count === 0 ) { hide(); return; }
	const assets = R_FireballAssets();
	if ( assets === null ) { count = 0; hide(); return; }
	if ( group === null ) build();
	if ( group.parent !== scene ) scene.add( group );
	if ( boundAssets !== assets ) {

		boundAssets = assets;
		smokeLayer.mesh.material.uniforms.uAtlas.value = assets.atlas; smokeLayer.mesh.material.uniforms.uNoise.value = assets.noise;
		cardLayer.mesh.material.uniforms.uNoise.value = assets.noise;

	}
	group.visible = true;
	f.puffs = 0; f.embers = 0;
	f.ex = eye[ 0 ]; f.ey = eye[ 1 ]; f.ez = eye[ 2 ]; f.fx = forward[ 0 ]; f.fy = forward[ 1 ]; f.fz = forward[ 2 ];
	const C = cardLayer.arrays;
	for ( let n = 0; n < count; n ++ ) {

		const o = n * STRIDE, K = rows[ o + 3 ], t = time + rows[ o + 4 ];
		f.ox = rows[ o ]; f.oy = rows[ o + 1 ]; f.oz = rows[ o + 2 ]; f.K = K;
		cardDepth[ n ] = ( f.ox - f.ex ) * f.fx + ( f.oy - f.ey ) * f.fy + ( f.oz - f.ez ) * f.fz;
		forEachSmoke( t, TORCH.size, TORCH.wind, emitPuff );
		forEachEmber( t, TORCH.wind, emitEmber );

	}
	// the flames back to front (they blend over one another and write no depth; the source has one flame)
	for ( let n = 0; n < count; n ++ ) cardOrder[ n ] = n;
	cardOrder.subarray( 0, count ).sort( byCardDepth );
	for ( let n = 0; n < count; n ++ ) {

		const o = cardOrder[ n ] * STRIDE, c = n * 4;
		// the card's centre is 1.385 flame-sizes above the root (render 213)
		C.aPosSize[ c ] = rows[ o ]; C.aPosSize[ c + 1 ] = rows[ o + 1 ]; C.aPosSize[ c + 2 ] = rows[ o + 2 ] + TORCH.cardCentre * TORCH.size * rows[ o + 3 ]; C.aPosSize[ c + 3 ] = rows[ o + 3 ] * TORCH.size;
		C.aInfo[ c ] = rows[ o + 4 ]; C.aInfo[ c + 1 ] = 0; C.aInfo[ c + 2 ] = 0; C.aInfo[ c + 3 ] = 0;

	}
	const puffs = f.puffs;
	for ( let i = 0; i < puffs; i ++ ) puffOrder[ i ] = i;
	puffOrder.subarray( 0, puffs ).sort( byDepth ); // back to front, as the source sorts
	const P = smokeLayer.arrays;
	for ( let n = 0; n < puffs; n ++ ) {

		const r = puffOrder[ n ] * PUFF_STRIDE, o = n * 4;
		P.aPosSize[ o ] = puffRows[ r ]; P.aPosSize[ o + 1 ] = puffRows[ r + 1 ]; P.aPosSize[ o + 2 ] = puffRows[ r + 2 ]; P.aPosSize[ o + 3 ] = puffRows[ r + 3 ];
		P.aInfo[ o ] = puffRows[ r + 4 ]; P.aInfo[ o + 1 ] = puffRows[ r + 5 ]; P.aInfo[ o + 2 ] = puffRows[ r + 6 ]; P.aInfo[ o + 3 ] = puffRows[ r + 7 ];
		P.aTint[ o ] = puffRows[ r + 8 ]; P.aTint[ o + 1 ] = puffRows[ r + 9 ]; P.aTint[ o + 2 ] = puffRows[ r + 10 ]; P.aTint[ o + 3 ] = puffRows[ r + 11 ];

	}
	smokeLayer.geometry.instanceCount = puffs; cardLayer.geometry.instanceCount = count; emberLayer.geometry.instanceCount = f.embers;
	for ( const a of instanced ) a.needsUpdate = true;
	smokeLayer.mesh.material.uniforms.uTime.value = time; cardLayer.mesh.material.uniforms.uTime.value = time;
	if ( viewSize ) emberLayer.mesh.material.uniforms.uResolution.value.set( viewSize[ 0 ], viewSize[ 1 ] );

}

// Nothing drawn: hide the layers and empty them.
function hide() {

	if ( group === null ) return;
	group.visible = false;
	for ( const l of [ smokeLayer, cardLayer, emberLayer ] ) l.geometry.instanceCount = 0;

}

// A new level: nothing is kept per torch, so this only empties the layers.
export function R_TorchFireClear() {

	count = 0;
	hide();

}

// Diagnostic read-only view for tests and the browser trial.
export function R_TorchFireSnapshot() {

	return { registered: count, group: group !== null, visible: group?.visible ?? false,
		flames: cardLayer?.geometry.instanceCount ?? 0, puffs: smokeLayer?.geometry.instanceCount ?? 0, embers: emberLayer?.geometry.instanceCount ?? 0 };

}
