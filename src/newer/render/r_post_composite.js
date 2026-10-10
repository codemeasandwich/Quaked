/**
 * @module newer/render/r_post_composite
 *
 * The post pipeline's composite (card [44h], split from gl_post.js): the light shafts and bloom passes, the composite
 * of lighting, liquids and screen effects, and the present pass with depth of field, power and quad vision, Rend the
 * Veil and the title demo's split.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `splitLeft`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `R_PostFinish` (gl_post.js) runs `R_PostVolumeBloom` then `R_PostComposite`, after the light and sun uniforms.
 */
import * as THREE from 'three';
import { postState, R_WaterActive } from './r_post_state.js';
import { r_volumetric, r_pillars, r_bloom, r_reflect_screen, r_newedges, r_caustics, r_newbright, r_newcontrast, SHAFT_GAIN, PILLAR_DEFAULT, OUTDOOR_BLOOM_THRESHOLD, BLOOM_LEVELS, CAUSTIC, HDR_EXPOSURE, OUTDOOR_EXPOSURE, OUTDOOR_BLOOM } from './r_post_config.js';
import { runPass, makeRT, dyn } from './r_post_targets.js';
import { R_PostLiquidUniforms } from './r_post_liquids.js';
import { R_PerfStage } from './r_perf.js';
import { R_PowerupShroudFrame } from './r_powerups.js';
import { R_ScreenDropsUpdate } from './r_screendrops.js';
import { R_TeleportFx } from './r_teleportfx.js';
import { R_ActiveWeaponSurface } from './r_weapon_surface.js';
import { r_newer_water, R_NewerGame } from '../mode.js';
import { PowerVisionMode } from '../gameplay/powervision_state.js';
import { cl } from '../../engine/client/client.js';
import { R_QuadVisionActive, R_QuadVisionRender, R_QuadVisionReset } from './r_quadvision.js';
import { R_PowerVisionRender, R_PowerVisionReset } from './r_powervision.js';
import { R_WaterWavesLive } from './r_waves.js';
import { R_RendVeilFields, R_RendVeilBackgroundDepth } from './r_rendveil.js';
import { R_RendVeilOptics } from './r_rendveil_optics.js';
import { R_DofFocus, R_DofCircle, R_DofFar } from './r_dof.js';

/**
 * The light shafts and bloom passes (from `R_PostFinish`): the volume pass while shafts are on, then the bloom's
 * threshold and mip chain.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {object} p the pipeline (`postState.gpu`)
 * @param {?{ texture: THREE.Texture, count: number }} fireFrame this frame's power-up fire
 * @param {number} exposure the frame's exposure
 * @param {boolean} hasSkyView whether the view can see sky (a higher bloom threshold outdoors)
 * @param {boolean} lighting whether advanced lighting is on
 * @returns {{ volume: number, bloom: number }} the shafts' and the bloom's strength this frame (0 off)
 */
export function R_PostVolumeBloom( renderer, p, fireFrame, exposure, hasSkyView, lighting ) {

	const hdr = p.hdr;
	// volumetric pass
	const volume = lighting ? Math.max( 0, r_volumetric.value ) * SHAFT_GAIN * Math.max( 0, r_pillars.value ) / PILLAR_DEFAULT : 0;
	if ( volume > 0 ) runPass( renderer, p.volumeMaterial, p.volume );
	R_PerfStage( 'light shafts' );

	// bloom
	const bloom = lighting ? Math.max( 0, r_bloom.value ) : 0;
	if ( bloom > 0 ) {

		const pm = p.prefilterMaterial.uniforms;
		pm.tScene.value = hdr.texture;
		pm.tPowerupFire.value=fireFrame?.texture||null;pm.uPowerupFireOn.value=fireFrame?.count?1:0;
		pm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
		pm.uExposure.value = exposure;
		pm.uThreshold.value = hasSkyView === true ? OUTDOOR_BLOOM_THRESHOLD : 1.1;
		runPass( renderer, p.prefilterMaterial, p.down[ 0 ] );

		const dm = p.downMaterial.uniforms;
		for ( let i = 1; i < BLOOM_LEVELS; i ++ ) {

			dm.tSource.value = p.down[ i - 1 ].texture;
			dm.uTexel.value.set( 1 / p.down[ i - 1 ].width, 1 / p.down[ i - 1 ].height );
			runPass( renderer, p.downMaterial, p.down[ i ] );

		}

		const um = p.upMaterial.uniforms;
		let low = p.down[ BLOOM_LEVELS - 1 ];
		for ( let i = BLOOM_LEVELS - 2; i >= 0; i -- ) {

			um.tLow.value = low.texture;
			um.tHigh.value = p.down[ i ].texture;
			um.uTexel.value.set( 1 / low.width, 1 / low.height );
			um.uWeight.value = 0.55;
			runPass( renderer, p.upMaterial, p.up[ i ] );
			low = p.up[ i ];

		}

		p.bloomResult = low;

	}
	return { volume, bloom };

}

/**
 * The composite and the frame shown (from `R_PostFinish`): the composite's uniforms (power-up fire and shrouds, the
 * liquids, edges, lens drops, teleport, caustics, grade), then either the composite straight to the screen or into a
 * target first, through Rend the Veil, power and quad vision and depth of field, and the present pass; into the left
 * half only while `R_PostSetSplit` is on.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene
 * @param {THREE.Camera} camera the view camera
 * @param {{ lx: number, ly: number, lw: number, lh: number }} viewport the on-screen rectangle, logical pixels
 * @param {object} p the pipeline (`postState.gpu`)
 * @param {?{ texture: THREE.Texture, count: number }} fireFrame this frame's power-up fire
 * @param {number} time client time, seconds
 * @param {number} exposure the frame's exposure
 * @param {boolean} hasSkyView whether the view can see sky
 * @param {boolean} lighting whether advanced lighting is on
 * @param {number} volume the light shafts' strength this frame (`R_PostVolumeBloom`)
 * @param {number} bloom the bloom's strength this frame
 */
export function R_PostComposite( renderer, scene, camera, viewport, p, fireFrame, time, exposure, hasSkyView, lighting, volume, bloom ) {

	const hdr = p.hdr;
	// composite to the screen
	const cm = p.compositeMaterial.uniforms;
	cm.tPowerupFire.value=fireFrame?.texture||null;cm.uPowerupFireOn.value=fireFrame?.count?1:0;
	const shrouds = R_PowerupShroudFrame( scene, camera );
	cm.tPowerupShrouds.value = shrouds.texture; cm.uPowerupShroudCount.value = shrouds.count;


	R_PostLiquidUniforms( cm, camera );

	cm.uScreenReflect.value = r_reflect_screen.value !== 0 ? 1 : 0;

	cm.uEdge.value = postState.underwater || ! lighting ? 0 : Math.max( 0, r_newedges.value );
	const drops = R_ScreenDropsUpdate();
	cm.uDropDensity.value = postState.underwater ? 0 : drops.density;
	cm.uDropBlood.value = drops.blood;
	const tele = R_TeleportFx( performance.now() / 1000 );
	cm.uTeleStretch.value = tele.stretch;
	cm.uTeleChroma.value = tele.chroma;
	cm.uDropAge.value = drops.age;
	cm.uTime.value = time;
 cm.uActorWet.value=R_ActiveWeaponSurface().wet;
	cm.uCaustic.value = r_newer_water.value !== 0 ? CAUSTIC * Math.max( 0, r_caustics.value ) : 0;
	cm.tScene.value = hdr.textures[ 0 ];
	cm.tNormal.value = hdr.textures[ 1 ];
	cm.tAlbedo.value = hdr.textures[ 2 ] || null;
	cm.tVolume.value = volume > 0 ? p.volume.texture : null;
	cm.tBloom.value = bloom > 0 ? p.bloomResult.texture : null;
	cm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
	// brightness and contrast are applied to the picture as displayed (below), so
	// 0.6 is 40% darker and 1.4 is 40% more contrast as seen
	const newBright = lighting ? Math.max( 0, r_newbright.value ) : 1;
	cm.uExposure.value = lighting ? exposure * HDR_EXPOSURE * ( hasSkyView === true ? OUTDOOR_EXPOSURE : 1 ) : exposure;
	cm.uBright.value = newBright;
	cm.uContrastGain.value = lighting ? Math.max( 0, r_newcontrast.value ) : 1;
	cm.uContrastPivot.value = newBright * 0.2; // deviations are taken from a typical scene brightness
	cm.uBloom.value = bloom * ( hasSkyView === true ? OUTDOOR_BLOOM : 1 );
	cm.uVolume.value = volume;

	R_PerfStage( 'bloom' );

	// Previously the expensive ray marches/bounce still ran at full device-pixel
	// resolution when the scene shrank. At half scale that did four times the
	// scene's work, preventing dynamic resolution from meeting its frame budget.
	const vision = PowerVisionMode(cl, R_NewerGame());
	const visionOn=vision!==0 || R_QuadVisionActive();
	const waves = R_WaterActive() && R_WaterWavesLive() > 0; // (ripples on the water bend the finished picture: the present pass, card [W1])
	const upscale = (lighting && dyn.scale < 1) || visionOn || waves;
	// Rend the Veil consumes the existing linear composite, even when Newer
	// lighting is disabled. Its local optics never repeat bloom/display grading.
	const rendFields = R_NewerGame() ? R_RendVeilFields() : [];
	const dofFocus = R_DofFocus(); // (depth of field is drawn by the present pass, card [38])
	const offscreen = upscale || rendFields.length > 0 || dofFocus > 0;
	cm.uOffscreen.value = offscreen ? 1 : 0;
	if ( offscreen ) {

		const count=visionOn?2:1;
		if (p.composite===null || p.composite.textures.length!==count) {
			p.composite?.dispose();p.composite=makeRT(hdr.width,hdr.height,{count});
			if(visionOn){const t=p.composite.textures[1];t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.NearestFilter;t.userData.visionEncoded=true;}
		}
		runPass( renderer, p.compositeMaterial, p.composite );
		R_PerfStage( 'final lighting pass' );
		const shown = p.presentMaterial.uniforms;
		const coordinates=visionOn?p.composite.textures[1]:null;
		const veiled = rendFields.length > 0
			? R_RendVeilOptics( renderer, p.composite.texture, hdr.depthTexture, R_RendVeilBackgroundDepth(), camera, rendFields )
			: p.composite.texture;
		const visionSource=R_PowerVisionRender(renderer,veiled,hdr,camera,vision,cl,coordinates);
		shown.tComposite.value = R_QuadVisionRender(renderer,visionSource,hdr,camera,scene,coordinates);
		shown.uBright.value = cm.uBright.value;
		shown.uContrastGain.value = cm.uContrastGain.value;
		shown.uContrastPivot.value = cm.uContrastPivot.value;
		shown.uWaves.value = waves ? 1 : 0;
		shown.tNormal.value = cm.tNormal.value;
		if ( dofFocus > 0 ) {

			if ( p.dof === null || p.dof.width !== hdr.width || p.dof.height !== hdr.height ) { p.dof?.dispose(); p.dof = makeRT( hdr.width, hdr.height ); }
			const d = p.dofMaterial.uniforms, [ dofPx, dofMax ] = R_DofCircle( hdr.height );
			d.tComposite.value = shown.tComposite.value; d.tNormal.value = cm.tNormal.value;
			d.uDof.value.set( dofFocus, dofPx, dofMax ); d.uDofTexel.value.set( 1 / hdr.width, 1 / hdr.height ); d.uDofFar.value = R_DofFar();
			runPass( renderer, p.dofMaterial, p.dof );
			shown.tComposite.value = p.dof.texture;
			R_PerfStage( 'depth of field' );

		}

	} else { R_PowerVisionReset(); R_QuadVisionReset(); }

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	postState.gpu.mesh.material = offscreen ? p.presentMaterial : p.compositeMaterial;
	if ( splitLeft ) {

		renderer.setScissor( viewport.lx, viewport.ly, Math.floor( viewport.lw / 2 ), viewport.lh );
		renderer.setScissorTest( true );

	}

	renderer.render( p.scene, p.camera );
	if ( splitLeft ) renderer.setScissorTest( false );
	R_PerfStage( upscale ? 'lighting upscale' : 'final lighting pass' );

}

// the title demo's half-and-half comparison: the final pass fills the left half only
let splitLeft = false;

/**
 * The title demo's half-and-half comparison: while on, the final pass fills the left half only. Set each frame by
 * gl_rmain.js before `R_PostFinish`.
 *
 * @param {boolean} on true to draw only the left half (anything but `true` counts as false)
 */
export function R_PostSetSplit( on ) {

	splitLeft = on === true;

}
