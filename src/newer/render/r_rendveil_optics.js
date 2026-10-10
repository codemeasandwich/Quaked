/**
 * @module newer/render/r_rendveil_optics
 *
 * Rend the Veil's optical field, from the supplied version 1.0.0.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `gpu`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Optical field copied from the supplied Quaked Rend the Veil 1.0.0. Quaked
// already owns lighting, bloom, exposure, its shoulder and display conversion:
// this pass consumes/returns that linear composite and never repeats them.
// Native hardware depth stays borrowed. Only two linear colour targets, one
// fullscreen mesh and one material are owned here, regardless of field count.
import * as THREE from 'three';
import { OPTICS_FRAGMENT } from './rend_veil/optics-shader.js';
import { VISUALS as p } from './rend_veil/config.js';

// The tailored source already preserves linear colour/alpha, host display
// ownership, finite fields and body protection. Its GLSL needs no redesign.
export const REND_VEIL_OPTICS_FRAGMENT = OPTICS_FRAGMENT;
const FULLSCREEN_VERTEX = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

let gpu = null;
const cameraPosition = new THREE.Vector3(), projectedCenter = new THREE.Vector3();
const inverseVP = new THREE.Matrix4();
const sourceCenter = new THREE.Vector3( 0, 2.35, 0 );

function createGPU( renderer, width, height ) {
	const uniforms = {
		uScene: { value: null }, uDepth: { value: null }, uBackgroundDepth: { value: null },
		uWorldToEffect: { value: new THREE.Matrix4() },
		uSubjectMin: { value: new THREE.Vector3() }, uSubjectMax: { value: new THREE.Vector3() },
		uHasSubject: { value: 0 }, uHasBackgroundDepth: { value: 0 },
		uMagic: { value: new THREE.Vector3( .54, .29, .74 ) },
		uEffectCenter: { value: sourceCenter.clone() },
		uEffectRadii: { value: new THREE.Vector3( Math.min( 3.5, p.distortionRadius * 1.22 ), 2.8, Math.min( 3.5, p.distortionRadius * 1.22 ) ) },
		uCameraEffect: { value: new THREE.Vector3() }, uCenter: { value: new THREE.Vector2() },
		uResolution: { value: new THREE.Vector2( width, height ) }, uInvVP: { value: new THREE.Matrix4() }
	};
	for ( const name of [ 'Time', 'Aspect', 'Radius', 'Amount', 'Lens', 'Pull', 'Refraction', 'Chromatic', 'Shimmer', 'Turbulence', 'Frequency', 'Asymmetry', 'Shape',
		'Eldritch', 'FoldSlices', 'FoldAngle', 'Mirror', 'Compression', 'Collapse', 'Flash', 'FlashRadius', 'Residual',
		'WaveRadius', 'WaveWidth', 'WaveDistortion', 'WaveRefraction', 'WaveChromatic', 'WaveAmp', 'WaveType',
		'Darkness', 'VeilDensity', 'VeilTwist', 'Manifestation', 'Focus', 'Invocation', 'ShadowEnabled' ] ) uniforms[ 'u' + name ] = { value: 0 };
	const material = new THREE.ShaderMaterial( {
		uniforms, vertexShader: FULLSCREEN_VERTEX, fragmentShader: REND_VEIL_OPTICS_FRAGMENT,
		depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false
	} );
	const geometry = new THREE.PlaneGeometry( 2, 2 );
	const mesh = new THREE.Mesh( geometry, material ); mesh.frustumCulled = false;
	const scene = new THREE.Scene(); scene.add( mesh );
	const targets = Array.from( { length: 2 }, ( _, i ) => {
		const target = new THREE.WebGLRenderTarget( width, height, {
			type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
			generateMipmaps: false, depthBuffer: false, stencilBuffer: false
		} );
		target.texture.name = 'quake_rendveil_linear_' + i;
		return target;
	} );
	return { renderer, width, height, uniforms, material, geometry, scene, camera: new THREE.Camera(), targets,
		viewport: new THREE.Vector4(), scissor: new THREE.Vector4() };
}

function bindField( uniforms, camera, field, width, height ) {
	const s = field.state, scale = field.scale;
	// An invocation can supply its full native-world -> reference transform to
	// retain its actor-facing basis. Otherwise use the proper Z-up -> Y-up frame
	// centered on the reference's (0,2.35,0), with no mirror or mixed-unit march.
	if ( field.toReference?.isMatrix4 ) uniforms.uWorldToEffect.value.copy( field.toReference );
	else {
		const unit = 1 / scale, center = field.center;
		uniforms.uWorldToEffect.value.set( unit, 0, 0, - center.x * unit,
			0, 0, unit, 2.35 - center.z * unit,
			0, - unit, 0, center.y * unit, 0, 0, 0, 1 );
	}
	uniforms.uCameraEffect.value.copy( cameraPosition ).applyMatrix4( uniforms.uWorldToEffect.value );
	const bounds = field.subjectBounds;
	const hasSubject = bounds && ! bounds.isEmpty();
	uniforms.uHasSubject.value = hasSubject ? 1 : 0;
	if ( hasSubject ) { uniforms.uSubjectMin.value.copy( bounds.min ); uniforms.uSubjectMax.value.copy( bounds.max ); }
	projectedCenter.copy( field.center ).project( camera );
	uniforms.uCenter.value.set( Number.isFinite( projectedCenter.x ) ? projectedCenter.x * .5 + .5 : .5,
		Number.isFinite( projectedCenter.y ) ? projectedCenter.y * .5 + .5 : .5 );
	const distance = Math.max( 1e-6, cameraPosition.distanceTo( field.center ) );
	const values = {
		Time: s.t, Aspect: width / height,
		Radius: p.distortionRadius * scale * camera.projectionMatrix.elements[ 5 ] / ( 2 * ( camera.isOrthographicCamera ? 1 : distance ) ),
		Amount: p.spatial ? s.build * s.active * p.distortionStrength : 0, Lens: p.lensing ? p.lensStrength : 0,
		Pull: p.inwardPull, Refraction: p.refraction, Chromatic: p.chromaticEnabled ? p.chromatic : 0,
		Shimmer: p.shimmer, Turbulence: p.turbulence, Frequency: p.frequency, Asymmetry: p.asymmetry, Shape: p.shape,
		Eldritch: p.impossible ? p.eldritch : 0, FoldSlices: p.foldSlices, FoldAngle: p.foldAngle, Mirror: p.mirrorAmount,
		Compression: s.compress * p.compressionAmount,
		Collapse: s.t < s.snapAt ? 1 : Math.max( .025, Math.pow( s.collapse, .6 + 1.4 * p.snapIntensity ) ),
		Flash: p.snap && ! s.complete && s.snapAge >= 0 && s.snapAge < Math.min( p.snapDuration, s.residualDuration )
			? p.snapIntensity * p.flashBrightness * Math.exp( - s.snapAge / p.snapDuration * 6 ) * 5 : 0,
		FlashRadius: p.flashRadius, Residual: p.spatial ? s.residual : 0,
		WaveRadius: s.radius, WaveWidth: p.rippleThickness, WaveDistortion: p.rippleDistortion,
		WaveRefraction: p.rippleRefraction, WaveChromatic: p.chromaticEnabled ? p.rippleChromatic : 0,
		WaveAmp: s.waveEnvelope * p.rippleStrength, WaveType: p.rippleType,
		Darkness: ( p.shadowVeil ? p.shadowStrength : 0 ) + p.lightDimming * .45,
		VeilDensity: p.veilDensity, VeilTwist: p.veilTwist, Manifestation: s.progress, Focus: s.unwind,
		Invocation: s.build * s.active + s.residual, ShadowEnabled: p.shadowVeil ? 1 : 0
	};
	for ( const [ name, value ] of Object.entries( values ) ) uniforms[ 'u' + name ].value = value;
}

// Current native invocation clocks, effect-local subject bounds and an optional
// background depth are borrowed. Hardware scene depth is mandatory: the supplied
// shader uses bounds for conservative body protection when background is absent.
export function R_RendVeilOptics( renderer, inputTexture, depthTexture, backgroundDepth, camera, fields ) {
	if ( ! renderer || ! inputTexture || ! depthTexture || ! camera || ! fields?.length ) return inputTexture;
	const active = fields.filter( field => field?.center?.isVector3 && Number.isFinite( field.scale ) && field.scale > 0
		&& field.state && ! field.state.pending && ! field.state.complete );
	if ( active.length === 0 ) return inputTexture;
	const width = inputTexture.image?.width, height = inputTexture.image?.height;
	if ( ! Number.isFinite( width ) || ! Number.isFinite( height ) || width < 1 || height < 1 ) return inputTexture;
	if ( gpu && gpu.renderer !== renderer ) R_RendVeilOpticsShutdown();
	if ( gpu === null ) gpu = createGPU( renderer, width, height );
	else if ( gpu.width !== width || gpu.height !== height ) {
		for ( const target of gpu.targets ) target.setSize( width, height );
		gpu.width = width; gpu.height = height; gpu.uniforms.uResolution.value.set( width, height );
	}
	const state = gpu, uniforms = state.uniforms;
	uniforms.uDepth.value = depthTexture; uniforms.uBackgroundDepth.value = backgroundDepth || depthTexture;
	uniforms.uHasBackgroundDepth.value = backgroundDepth ? 1 : 0;
	inverseVP.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ).invert(); uniforms.uInvVP.value.copy( inverseVP );
	cameraPosition.setFromMatrixPosition( camera.matrixWorld );
	const previousTarget = renderer.getRenderTarget(), previousFace = renderer.getActiveCubeFace?.() || 0, previousMip = renderer.getActiveMipmapLevel?.() || 0;
	const previousClear = renderer.autoClear, previousScissorTest = renderer.getScissorTest(), previousXR = renderer.xr?.enabled;
	renderer.getViewport( state.viewport ); renderer.getScissor( state.scissor );
	let result = inputTexture, next = result === state.targets[ 0 ].texture ? 1 : 0;
	try {
		renderer.autoClear = true; if ( renderer.xr ) renderer.xr.enabled = false;
		renderer.setScissorTest( false );
		for ( const field of active ) {
			bindField( uniforms, camera, field, width, height ); uniforms.uScene.value = result;
			const target = state.targets[ next ];
			// Target viewport/scissor are physical texels. Renderer setters multiply
			// logical dimensions by DPR, so rebinding owns the full pass rectangle.
			renderer.setRenderTarget( target );
			renderer.render( state.scene, state.camera ); result = target.texture; next ^= 1;
		}
	} finally {
		renderer.setViewport( state.viewport ); renderer.setScissor( state.scissor ); renderer.setScissorTest( previousScissorTest );
		renderer.setRenderTarget( previousTarget, previousFace, previousMip );
		renderer.autoClear = previousClear; if ( renderer.xr ) renderer.xr.enabled = previousXR;
	}
	return result;
}

export function R_RendVeilOpticsShutdown() {
	if ( gpu === null ) return;
	for ( const target of gpu.targets ) target.dispose();
	gpu.material.dispose(); gpu.geometry.dispose(); gpu = null;
}
