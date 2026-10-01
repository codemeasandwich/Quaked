// The title demo, half and half: the left of the screen in Newer Game, the right in the classic look, the same
// picture of the same demo, drawn live, so the two can be compared.
//
// While a demo plays the Newer pipeline is switched on (r_hdr 1) so that its half is real; the setting the
// player had is put back when the demo stops, and starting a game sets it itself.  The right half is the same
// scene drawn again with the Newer lighting left out (the original light curve, no bounce or relief or
// post effects), with the original textures and skins, at the original's low resolution, and shown with hard
// pixels.  The scene is drawn a second time with everything Newer switched off (see R_ClassicHalf in gl_rmain.js).

import * as THREE from 'three';
import { cvar_t, Cvar_Set, Cvar_VariableString } from './cvar.js';
import { cls } from './client.js';
import { R_NewerTexturesRevert } from './r_newertextures.js';

export const r_demosplit = new cvar_t( 'r_demosplit', '1' );

let saved = null;

export function R_DemoSplitActive() {

	// (r_demosplit 2 draws the classic picture over the whole screen, in any game: for checking it against New Game)
	return r_demosplit.value === 2 || ( r_demosplit.value !== 0 && cls.demoplayback === true && saved !== null );

}

export function R_DemoSplitFull() {

	return r_demosplit.value === 2;

}

// a demo is about to play
export function R_DemoSplitStart() {

	if ( r_demosplit.value === 0 || saved !== null ) return;
	saved = Cvar_VariableString( 'r_hdr' );
	Cvar_Set( 'r_hdr', '1' );

}

// a game is about to start: what it sets for r_hdr stands (the demo's own switch is not undone behind it), and a classic
// game gets the original textures back
export function R_DemoSplitRelease( newer ) {

	saved = null;
	if ( ! newer ) R_NewerTexturesRevert();

}

// the demo has stopped
export function R_DemoSplitEnd() {

	if ( saved === null ) return;
	Cvar_Set( 'r_hdr', saved );
	saved = null;
	// the textures go back to the original game's, as a classic game that follows needs them
	if ( Cvar_VariableString( 'r_hdr' ) === '0' ) R_NewerTexturesRevert();

}

const ROWS = 240; // the picture is drawn this many pixels high

let rt = null;
let blitScene = null;
let blitCamera = null;
let blitMaterial = null;

function ensure( aspect ) {

	const w = Math.max( 64, Math.round( ROWS * aspect ) );
	if ( rt === null || rt.width !== w ) {

		if ( rt !== null ) rt.dispose();
		rt = new THREE.WebGLRenderTarget( w, ROWS, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false, colorSpace: THREE.SRGBColorSpace } );

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
export function R_DemoSplitClassic( renderer, scene, camera, viewport, classicOn, classicOff ) {

	ensure( viewport.lw / viewport.lh );

	const prev = renderer.getRenderTarget();
	renderer.setScissorTest( false );
	renderer.setRenderTarget( rt );
	renderer.setClearColor( 0x000000, 1 );
	renderer.clear( true, true, false );
	classicOn();
	renderer.render( scene, camera );
	classicOff();

	// shown with hard pixels over the right half
	renderer.setRenderTarget( prev );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	const full = r_demosplit.value === 2;
	renderer.setScissor( viewport.lx + ( full ? 0 : Math.floor( viewport.lw / 2 ) ), viewport.ly, full ? viewport.lw : Math.ceil( viewport.lw / 2 ), viewport.lh );
	renderer.setScissorTest( true );
	const autoClear = renderer.autoClear;
	renderer.autoClear = false;
	renderer.render( blitScene, blitCamera );
	renderer.autoClear = autoClear;
	renderer.setScissorTest( false );

}
