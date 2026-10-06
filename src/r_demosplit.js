import { NEWER_ENABLED_FEATURES } from './newer_defaults.js';
import { R_FlashlightRunSync } from './r_flashlightrun.js';
import { R_DemoLoadingCancel } from './r_demoloading.js';
// The title demo, half and half: the left of the screen in Newer Game, the right in the classic look, the same
// picture of the same demo, drawn live, so the two can be compared.
//
// While an attract-loop demo plays the Newer pipeline is switched on (r_hdr 1) so that its half is real; the setting the
// player had is put back when the demo stops, and starting a game sets it itself.  The right half is the same
// scene drawn again with the Newer lighting left out (the original light curve, no bounce or relief or
// post effects), with the original textures and skins, at the same scene-render resolution as the enhanced
// half. The scene is drawn again with Newer switched off (see R_ClassicOn in gl_rmain.js).

import * as THREE from 'three';
import { cvar_t, Cvar_SetTemporary, Cvar_RestoreTemporary, Cvar_VariableString } from './cvar.js';
import { cls } from './client.js';
import { R_PerfProfiling } from './r_perf.js';
import { R_NewerTexturesRevert } from './r_newertextures.js';

export const r_demosplit = new cvar_t( 'r_demosplit', '1' );

let saved = null;
// HDR shares the existing temporary cvar ownership contract with the feature
// defaults: ordinary menu/console sets (including the same value) end the
// borrow. A queued attract may start after menu Release, so a private HDR
// snapshot would otherwise undo the explicit launch on the later disconnect.
const DEMO_FEATURES = [ 'r_hdr', 'r_flashlight', ...NEWER_ENABLED_FEATURES ];
function restoreFeatures() {
 if ( saved ) {
  for ( const name of Object.keys( saved.features ) ) Cvar_RestoreTemporary( name );
  R_FlashlightRunSync(); // an automatic demo restore is never a user switch-off
 }
}


export function R_DemoSplitActive() {

	if ( R_PerfProfiling() || cls.timedemo ) return false;

	// (r_demosplit 2 draws the classic picture over the whole screen, in any game: for checking it against New Game)
	return r_demosplit.value === 2 || ( r_demosplit.value !== 0 && cls.demoplayback === true && saved !== null );

}

export function R_DemoSplitFull() {

	return r_demosplit.value === 2;

}

// An attract-loop demo is about to play; manual/timed demos do not call this.
export function R_DemoSplitStart() {

	if ( R_PerfProfiling() || r_demosplit.value === 0 || saved !== null ) return;
	saved = { features: {} };
	for ( const name of DEMO_FEATURES ) {
		const previous = Cvar_VariableString( name );
		if ( previous === '' ) continue; // feature not registered by this renderer
		saved.features[ name ] = previous; Cvar_SetTemporary( name, '1' );
	}
	R_FlashlightRunSync(); // demo-on does not own the game's once-run message

}

// a game is about to start: what it sets for r_hdr stands (the demo's own switch is not undone behind it), and a classic
// game gets the original textures back
export function R_DemoSplitRelease( newer ) {
	R_DemoLoadingCancel();

	restoreFeatures();
	saved = null;
	if ( ! newer ) R_NewerTexturesRevert();

}

// the demo has stopped
export function R_DemoSplitEnd() {

	if ( saved === null ) return;
	restoreFeatures();
	saved = null;
	// the textures go back to the original game's, as a classic game that follows needs them
	if ( Cvar_VariableString( 'r_hdr' ) === '0' ) R_NewerTexturesRevert();

}

let rt = null;
let blitScene = null;
let blitCamera = null;
let blitMaterial = null;

function ensure( width, height ) {

	if ( rt === null || rt.width !== width || rt.height !== height ) {

		if ( rt !== null ) rt.dispose();
		// Preserve the native scene's brightness until the ordinary output gamma
		// is applied by the blit. A byte target clips flames/fullbrights too early
		// when the player's exposure is below one. No enhanced post pass runs here.
		rt = new THREE.WebGLRenderTarget( width, height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace } );

	}

	if ( blitScene === null ) {

		blitScene = new THREE.Scene();
		blitCamera = new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 );
		blitMaterial = new THREE.MeshBasicMaterial( { depthTest: false, depthWrite: false } );
		const quad = new THREE.Mesh( new THREE.PlaneGeometry( 2, 2 ), blitMaterial );
		quad.frustumCulled = false;
		blitScene.add( quad );

	}

	blitMaterial.map = rt.texture;
	blitMaterial.needsUpdate = false;

}

/*
================
R_DemoSplitClassic

Draw the right half: the scene again, in the classic look.  viewport is the 3D area in logical pixels
(lx, ly, lw, lh, from the bottom left); classic is the shared switch the world's materials read.
================
*/
export function R_DemoSplitClassic( renderer, scene, camera, viewport, classicOn, classicOff, sceneTarget = null ) {

	// Use the enhanced target itself: its dimensions include dynamic scaling,
	// device pixels and the pipeline's even-size rounding. Do not estimate them
	// from the output rectangle or force the classic pass to a separate 240 rows.
	const pixelRatio = typeof renderer.getPixelRatio === 'function' ? renderer.getPixelRatio() : 1;
	const width = sceneTarget != null ? sceneTarget.width : ( viewport.width || Math.round( viewport.lw * pixelRatio ) );
	const height = sceneTarget != null ? sceneTarget.height : ( viewport.height || Math.round( viewport.lh * pixelRatio ) );
	ensure( Math.max( 1, width ), Math.max( 1, height ) );

	const prev = renderer.getRenderTarget();
	const autoClear = renderer.autoClear;
	const oldViewport = renderer.getViewport && renderer.getViewport( new THREE.Vector4() );
	const oldScissor = renderer.getScissor && renderer.getScissor( new THREE.Vector4() );
	const oldScissorTest = renderer.getScissorTest ? renderer.getScissorTest() : false;
	const oldClear = renderer.getClearColor && renderer.getClearColor( new THREE.Color() );
	const oldAlpha = renderer.getClearAlpha && renderer.getClearAlpha();
	try {

		renderer.setScissorTest( false );
		renderer.setRenderTarget( rt );
		renderer.setClearColor( 0x000000, 1 );
		renderer.clear( true, true, false );
		try {

			classicOn();
			renderer.render( scene, camera );

		} finally {

			classicOff();

		}

		// Present at the same output viewport, clipping to the classic half.
		renderer.setRenderTarget( prev );
		renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
		const full = r_demosplit.value === 2;
		renderer.setScissor( viewport.lx + ( full ? 0 : Math.floor( viewport.lw / 2 ) ), viewport.ly, full ? viewport.lw : Math.ceil( viewport.lw / 2 ), viewport.lh );
		renderer.setScissorTest( true );
		renderer.autoClear = false;
		renderer.render( blitScene, blitCamera );

	} finally {

		renderer.autoClear = autoClear;
		renderer.setRenderTarget( prev );
		if ( oldViewport ) renderer.setViewport( oldViewport );
		if ( oldScissor ) renderer.setScissor( oldScissor );
		renderer.setScissorTest( oldScissorTest );
		if ( oldClear ) renderer.setClearColor( oldClear, oldAlpha );

	}

}
