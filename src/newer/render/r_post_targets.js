/**
 * @module newer/render/r_post_targets
 *
 * The post pipeline's targets (card [44h], split from gl_post.js): dynamic resolution, the render targets and the
 * pass materials, made once and resized as the frame's size changes.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * The pipeline it makes is kept in `postState.gpu` (by `R_PostBegin`, gl_post.js); `R_PostShutdown` frees it.
 */
import * as THREE from 'three';
import { postState, lightingLook } from './r_post_state.js';
import { r_dynres, r_fps_target, MAX_VOLUME_LIGHTS, SPOT_POWER, SUN_COLOR, SUN_SHADOW_SIZE, SUN_SHADOW_EXTENT, SUN_SHADOW_DEPTH, MAX_RAY, SUN_SCATTER, SCATTER, SUN_SURFACE, SUN_SURFACE_COLOR, LIGHT_SURFACE, LIGHT_FLOOR, BUMP_LIGHT, SATURATION, VIBRANCE, CONTRAST, CAUSTIC, BLOOM_LEVELS } from './r_post_config.js';
import { QUAD_VERTEX, VOLUME_FRAGMENT, BLOOM_PREFILTER_FRAGMENT, BLOOM_DOWN_FRAGMENT, BLOOM_UP_FRAGMENT, COMPOSITE_FRAGMENT, PRESENT_FRAGMENT, DOF_FRAGMENT } from './r_post_shaders.js';
import { cookieMean, cookieNorm, cookieDepth } from './r_post_sky.js';
import { MAX_LIQUID_REGIONS } from './r_post_liquids.js';
import { R_PostOccluder } from './r_post_shadows.js';
import { PointShadowAtlas, R_CreateShadowCaptureMaterial } from './r_pointshadows.js';
import { r_heightshadows } from './r_heightshadows.js';
import { FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { waterWave, R_WaveTexture } from './r_waves.js';
import { R_PerfSetScale } from './r_perf.js';
import { PowerVisionMode } from '../gameplay/powervision_state.js';
import { cl } from '../../engine/client/client.js';
import { R_NewerGame } from '../mode.js';
const DYNRES_MIN = 0.5;
/** The dynamic-resolution state: `scale` is this frame's fraction of the full size; the rest is the running average
 * `R_PostDynResUpdate` keeps. */
export const dyn = { scale: 1, last: 0, sum: 0, frames: 0, cool: 0, probing: false, probeEvery: 240, since: 0 };

/**
 * The current dynamic-resolution scale: the fraction of the full width and height the HDR targets are drawn at
 * (r_dynres), updated once a frame in `R_PostBegin` from the average frame time against r_fps_target. gl_rmain.js
 * multiplies the view size by it for screen-space effects.
 *
 * @returns {number} 0.5..1 (rounded to hundredths); 1 when r_dynres is 0
 */
export function R_DynResScale() {

	return dyn.scale;

}

// once a frame while the pipeline draws: the average frame time of the last stretch
// decides the resolution of the next
/**
 * Updates the dynamic-resolution scale once a frame from `R_PostBegin`: the average frame time of the last stretch,
 * against r_fps_target, decides the resolution of the next (r_dynres 0 keeps full size).
 *
 * @param {number} now the page clock, in seconds
 */
export function dynResUpdate( now ) {

	if ( r_dynres.value === 0 ) {

		dyn.scale = 1;
		R_PerfSetScale( 1 );
		dyn.last = now;
		return;

	}

	let dt = now - dyn.last;
	dyn.last = now;
	if ( dt <= 0 || dt > 2 ) { dyn.sum = 0; dyn.frames = 0; return; } // a level load or a pause, not a slow picture
	dt = Math.min( dt, 0.25 ); // (one long frame does not count for more than that)

	dyn.sum += dt;
	dyn.frames ++;
	dyn.since ++;
	if ( dyn.frames < 24 && dyn.sum < 1.2 ) return;

	const avg = dyn.sum / dyn.frames;
	dyn.sum = 0;
	dyn.frames = 0;

	const budget = 1 / Math.max( 20, r_fps_target.value );
	const before = dyn.scale;

	if ( avg > budget * 1.12 ) {

		// too slow: smaller, in proportion to how slow (frame cost follows the pixel count)
		if ( dyn.probing ) { dyn.probeEvery = Math.min( 1800, dyn.probeEvery * 2 ); dyn.probing = false; }
		dyn.scale = Math.max( DYNRES_MIN, dyn.scale * Math.max( 0.8, Math.min( 0.95, Math.sqrt( budget / avg ) ) ) );
		dyn.since = 0;

	} else if ( dyn.scale < 1 && dyn.since >= dyn.probeEvery ) {

		// it fits: see whether one step bigger fits too
		dyn.scale = Math.min( 1, dyn.scale * 1.08 );
		dyn.probing = true;
		dyn.since = 0;

	} else if ( dyn.probing ) {

		dyn.probing = false; // the bigger picture held: keep it

	}

	dyn.scale = Math.round( dyn.scale * 100 ) / 100;
	R_PerfSetScale( dyn.scale );
	if ( dyn.scale !== before ) dyn.frames = 0;

}

//============================================================================
// Pipeline
//============================================================================


/**
 * A render target of the pipeline's kind: linear filtering, no depth unless asked, half-float by default.
 *
 * @param {number} width texels
 * @param {number} height texels
 * @param {object} [options] THREE.WebGLRenderTarget options overriding the defaults
 * @returns {THREE.WebGLRenderTarget} a new target (the caller disposes it)
 */
export function makeRT( width, height, options ) {

	return new THREE.WebGLRenderTarget( Math.max( 1, width ), Math.max( 1, height ), Object.assign( {
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: false,
		depthBuffer: false
	}, options ) );

}

function makeMaterial( fragment, uniforms ) {

	const material = new THREE.ShaderMaterial( {
		uniforms,
		vertexShader: QUAD_VERTEX,
		fragmentShader: fragment,
		depthTest: false,
		depthWrite: false
	} );
	// Fullscreen passes own their outputs. The world-material prototype hook
	// must not attach a second G-buffer declaration to the optical UV output.
	material.onBeforeCompile=()=>{};
	return material;

}

/**
 * Makes the pipeline: its shared uniforms, the shadow atlas and sun target, and every pass's material. Called once,
 * by the first `R_PostBegin` that draws; the result is kept in `postState.gpu`.
 *
 * @returns {object} the pipeline (its targets are made by `ensureTargets`)
 */
export function createPipeline() {

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ] ), 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 2, 0, 0, 2 ] ), 2 ) );

	const mesh = new THREE.Mesh( geometry );
	mesh.frustumCulled = false;
	const scene = new THREE.Scene();
	scene.add( mesh );

	const lightPos = [], lightCol = [];
	for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {

		lightPos.push( new THREE.Vector4() );
		lightCol.push( new THREE.Vector4() );

	}

	// uniforms shared by the volumetric and composite passes
	const shared = {
		tDepth: { value: null },
		tNormal: { value: null },
		uTime: { value: 0 }, uCaustic: { value: CAUSTIC },
		uUnderwater: { value: 0 }, uWaterView: { value: 0 }, uWaterWarp: { value: 1 },
		uWaterCount: { value: 0 },
		uWaterMin: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) },
		uWaterMax: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) },
		tSunShadow: { value: null },
		uProj: { value: new THREE.Matrix4() },
		uProjInv: { value: new THREE.Matrix4() },
		uViewInv: { value: new THREE.Matrix4() },
		uSunVP: { value: new THREE.Matrix4() },
		uNear: { value: 4 }, uFar: { value: 4096 },
		uCount: { value: 0 },
		uSpotOn: { value: 0 },
		uBounce: { value: 1 },
		uSpotPos: { value: new THREE.Vector3() },
		uSpotDir: { value: new THREE.Vector3( 0, 0, - 1 ) },
		uSpotCol: { value: new THREE.Vector3( 1, 0.985, 0.96 ).multiplyScalar( SPOT_POWER ) },
		uSpotCone: { value: new THREE.Vector2( FLASHLIGHT_OUTER, FLASHLIGHT_INNER ) },
		tHeightShadow: { value: null },
		uHeightMasks: { value: 0 },
		tNearSunShadow: { value: null }, uNearSunShadowVP: { value: new THREE.Matrix4() }, uNearSunShadowOn: { value: 0 },
  tSpotShadow: { value: null },
		uSpotShadowVP: { value: new THREE.Matrix4() },
		uSpotShadowLightWorld: { value: new THREE.Vector4() },
		uSpotWorldShadowOn: { value: 0 },
		tPointShadow: { value: null },
		uPointShadowInfo: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector2( -1, 0 ) ) },
		uLightPos: { value: lightPos },
		uLightCol: { value: lightCol },
		uLightCookie: { value: new Float32Array( MAX_VOLUME_LIGHTS ) },
		uLightDirection: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector3()) },
  uLightCone: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector2(1,1)) },
		uLightRotation: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4( 0, 0, 0, 1 ) ) },
		uPowerupTime: { value: 0 },
		uSunDirV: { value: new THREE.Vector3() },
		uSunDirW: { value: new THREE.Vector3() },
		tCookie: { value: null },
		tCookieCloud: { value: null },
		uCookieCloud: { value: 0 },
		uCookieMean: { value: cookieMean },
		uCookieNorm: { value: cookieNorm },
		uCookieDepth: cookieDepth,
		uCookie: { value: 0 },
		uCookieTime: { value: 0 },
		uSunCol: { value: new THREE.Vector3( ...SUN_COLOR ) },
		uSunOn: { value: 0 },
		uShadowTexel: { value: 0.5 / SUN_SHADOW_SIZE },
		uMaxRay: { value: MAX_RAY }
	};

	const sunCamera = new THREE.OrthographicCamera( - SUN_SHADOW_EXTENT, SUN_SHADOW_EXTENT,
		SUN_SHADOW_EXTENT, - SUN_SHADOW_EXTENT, 1, SUN_SHADOW_DEPTH * 2 );

	return {
		width: 0, height: 0,
		pointShadows: new PointShadowAtlas( R_PostOccluder()?.geometry ),
		scene, mesh, shared,
		camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ),
		hdr: null, volume: null, composite: null, down: [], up: [],
		sunCamera,
		sunTarget: new THREE.WebGLRenderTarget( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE, {
			depthBuffer: true,
			depthTexture: new THREE.DepthTexture( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE ),
			generateMipmaps: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter
		} ),
		sunOverride: R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}', {}, { colorWrite: false } ),
		volumeMaterial: makeMaterial( VOLUME_FRAGMENT, Object.assign( {
			uSunScatter: { value: SUN_SCATTER },
			uOpenFog: { value: 0 },
			uShaftFog: { value: 1.3 },
			uShadowSpread: { value: 100 / ( SUN_SHADOW_EXTENT * 2 ) },
			uScatter: { value: SCATTER }
		}, shared ) ),
		prefilterMaterial: makeMaterial( BLOOM_PREFILTER_FRAGMENT, {
			tScene: { value: null }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 }, uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uThreshold: { value: 1 }
		} ),
		downMaterial: makeMaterial( BLOOM_DOWN_FRAGMENT, {
			tSource: { value: null }, uTexel: { value: new THREE.Vector2() }
		} ),
		upMaterial: makeMaterial( BLOOM_UP_FRAGMENT, {
			tLow: { value: null }, tHigh: { value: null },
			uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 }
		} ),
		compositeMaterial: makeMaterial( COMPOSITE_FRAGMENT, Object.assign( {
			tPowerupShrouds: { value: null }, uPowerupShroudCount: { value: 0 }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 },
			tScene: { value: null }, tAlbedo: { value: null }, tVolume: { value: null }, tBloom: { value: null },
			uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uBloom: { value: 0.6 }, uVolume: { value: 1 },
			uSunSurface: { value: SUN_SURFACE },
			uSunSurfaceCol: { value: new THREE.Vector3( ...SUN_SURFACE_COLOR ) },
			uLightSurface: { value: LIGHT_SURFACE },
			uLightFloor: { value: LIGHT_FLOOR },
			uLightAdd: { value: new Array( MAX_VOLUME_LIGHTS ).fill( 0 ) },
			uLightSpecular: { value: new Array( MAX_VOLUME_LIGHTS ).fill( 0 ) },
			uEdge: { value: 1 },
			uDropDensity: { value: 0 },
			uDropBlood: { value: 0 },
			uActorWet: { value: 0 }, uBumpLight: { value: BUMP_LIGHT },
			uLighting: lightingLook,
			uOffscreen: { value: 0 },
			uTeleStretch: { value: 0 },
			uTeleChroma: { value: 0 },
			uDropAge: { value: 0 },
			uSaturation: { value: SATURATION },
			uVibrance: { value: VIBRANCE },
			uContrast: { value: CONTRAST },
			uBright: { value: 0.6 },
			uContrastGain: { value: 1.4 },
			uContrastPivot: { value: 0.12 },
			tProbeA: { value: null },
			tProbeB: { value: null },
			uProbeCenter: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMin: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMax: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeOf: { value: new Array( MAX_LIQUID_REGIONS ).fill( - 1 ) },
			uScreenReflect: { value: 1 },
			uLavaCount: { value: 0 },
			uLavaMin: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uLavaMax: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uHeat: { value: 0.6 },
			uReflect: { value: 0.6 },
			uMist: { value: 0 }
		}, shared ) ),
		presentMaterial: makeMaterial( PRESENT_FRAGMENT, {
			tComposite: { value: null }, uBright: { value: 1 },
			uWaves: { value: 0 }, tDepth: shared.tDepth, tNormal: { value: null }, uProj: shared.uProj, uProjInv: shared.uProjInv, uViewInv: shared.uViewInv,
			uWaterWave: { value: waterWave }, tWaves: { value: R_WaveTexture() },
			uContrastGain: { value: 1 }, uContrastPivot: { value: 0.2 }
		} ),
		dofMaterial: makeMaterial( DOF_FRAGMENT, {
			tComposite: { value: null }, tDepth: shared.tDepth, tNormal: { value: null }, uProjInv: shared.uProjInv,
			uDof: { value: new THREE.Vector3() }, uDofTexel: { value: new THREE.Vector2() }, uDofFar: { value: 4096 }
		} ),
		dof: null
	};

}

/**
 * Frees the pipeline's size-dependent targets (the HDR, volume, bloom, composite and DoF targets), for a resize or
 * shutdown; does nothing when there are none.
 */
export function disposeTargets() {

	if ( postState.gpu.hdr === null ) return;
	postState.gpu.hdr.dispose();
	postState.gpu.hdr.depthTexture.dispose();
	postState.gpu.volume.dispose();
	if ( postState.gpu.composite !== null ) postState.gpu.composite.dispose();
	postState.gpu.composite = null;
	if ( postState.gpu.dof !== null ) postState.gpu.dof.dispose();
	postState.gpu.dof = null;
	for ( const rt of postState.gpu.down ) rt.dispose();
	for ( const rt of postState.gpu.up ) rt.dispose();
	postState.gpu.hdr = null;
	postState.gpu.down = [];
	postState.gpu.up = [];

}

// Multisampling is a large part of the cost of a picture: it is given up in steps as the
// picture gets smaller (the smaller picture is scaled up smoothly anyway)
function samplesFor( scale ) {

	return scale >= 0.85 ? 4 : scale >= 0.65 ? 2 : 0;

}

/**
 * Makes the pipeline's size-dependent targets for this frame's size, replacing them when the size or the number of
 * G-buffer attachments (4 with advanced lighting or power vision, else 2; height masks need lighting and relief)
 * changed. Multisampling stays off: packed visibility and depth are data.
 *
 * @param {number} width the scene's drawing width, pixels
 * @param {number} height its height, pixels
 */
export function ensureTargets( width, height ) {

	const heightMasks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0;
	// Packed visibility is data: MSAA averaging would mix unrelated source bits.
	// Receiver classes and true view depth are data even with micro relief off.
 // Multisample resolution would average a model packet with background.
 const samples = 0;
	const count = postState.glowActive || PowerVisionMode(cl, R_NewerGame()) ? 4 : 2; // vision also consumes unlit pigment
	if ( postState.gpu.hdr !== null && postState.gpu.width === width && postState.gpu.height === height && postState.gpu.samples === samples && postState.gpu.hdr.textures.length === count ) return;

	disposeTargets();
	postState.gpu.width = width;
	postState.gpu.height = height;
	postState.gpu.samples = samples;

	const depth = new THREE.DepthTexture( width, height );
	postState.gpu.hdr = makeRT( width, height, { depthBuffer: true, depthTexture: depth, samples, count } );
 // A normal packet's alpha is view distance. Linear interpolation across
 // different receivers creates a second, invalid apparent lighting surface.
 postState.gpu.hdr.textures[1].minFilter=postState.gpu.hdr.textures[1].magFilter=THREE.NearestFilter;
	// SRGB8 storage preserves dark authored texels at half the bandwidth of HDR.
	// The attachment encodes linear shader output and texture reads decode it;
	// alpha marks valid surfaces. No extra geometry pass or baked-light floor.
	if ( count >= 3 ) {

		postState.gpu.hdr.textures[ 2 ].type = THREE.UnsignedByteType;
		postState.gpu.hdr.textures[ 2 ].colorSpace = THREE.SRGBColorSpace;
		postState.gpu.hdr.textures[ 2 ].minFilter = THREE.NearestFilter;
		postState.gpu.hdr.textures[ 2 ].magFilter = THREE.NearestFilter;

	}
 if ( heightMasks ) {
  const mask = postState.gpu.hdr.textures[ 3 ];
  mask.type = THREE.UnsignedByteType; mask.format = THREE.RGBAFormat;
  mask.colorSpace = THREE.NoColorSpace; mask.internalFormat = 'RGBA8';
  mask.minFilter = mask.magFilter = THREE.NearestFilter; mask.generateMipmaps = false;
  mask.name = 'quake_height_light_visibility';
 }
	postState.gpu.volume = makeRT( Math.ceil( width * 0.75 ), Math.ceil( height * 0.75 ) );

	let w = Math.ceil( width / 2 ), h = Math.ceil( height / 2 );
	for ( let i = 0; i < BLOOM_LEVELS; i ++ ) {

		postState.gpu.down.push( makeRT( w, h ) );
		if ( i < BLOOM_LEVELS - 1 ) postState.gpu.up.push( makeRT( w, h ) );
		w = Math.max( 1, Math.ceil( w / 2 ) );
		h = Math.max( 1, Math.ceil( h / 2 ) );

	}

}

/**
 * Draws one full-screen pass of `material` into `target` (null: the screen).
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.ShaderMaterial} material the pass
 * @param {?THREE.WebGLRenderTarget} target where it draws
 */
export function runPass( renderer, material, target ) {

	postState.gpu.mesh.material = material;
	renderer.setRenderTarget( target );
	renderer.render( postState.gpu.scene, postState.gpu.camera );

}

/**
 * True when the HDR pipeline can run on this renderer: WebGL2 with float or half-float colour buffers. Checked by
 * `R_PostBegin` every frame.
 *
 * @param {?THREE.WebGLRenderer} renderer the renderer
 * @returns {boolean} whether HDR render targets can be used
 */
export function R_PostSupported( renderer ) {

	if ( renderer == null || renderer.capabilities == null || renderer.capabilities.isWebGL2 === false ) return false;
	return renderer.extensions.has( 'EXT_color_buffer_float' ) || renderer.extensions.has( 'EXT_color_buffer_half_float' );

}
