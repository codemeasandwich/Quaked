// Muzzle flash for Newer Game: when a weapon fires there is a burst of light at
// the barrel.  The game already spawns a short dynamic light for it; here that
// light is made much stronger (gl_post.js) and, for the player's own gun, a
// glare is drawn at the muzzle that the bloom turns into a real flash.

import * as THREE from 'three';
import { R_NewerLightingActive } from './r_anim.js';

const DURATION = 0.13; // seconds

// where the barrel is, from the eye: forward, right, up
const MUZZLE_FORWARD = 30;
const MUZZLE_RIGHT = 3;
const MUZZLE_UP = - 7;

let firedAt = - 1;
let fired = 0;
let sprite = null;

const now = () => ( typeof performance !== 'undefined' ? performance.now() : Date.now() ) / 1000;

// the player's weapon fired (called as the game flags the muzzle flash)
export function R_MuzzleFlashFired() {

	firedAt = now();
	fired ++;

}

// how many flashes there have been (for tests)
export function R_MuzzleFlashCount() {

	return fired;

}

// 1 as it fires, falling to 0
export function R_MuzzleFlashLevel() {

	if ( firedAt < 0 ) return 0;
	const t = ( now() - firedAt ) / DURATION;
	return t >= 1 ? 0 : ( 1 - t ) * ( 1 - t );

}

function glareTexture() {

	const size = 128;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const g = canvas.getContext( '2d' );

	const glow = g.createRadialGradient( size / 2, size / 2, 0, size / 2, size / 2, size / 2 );
	glow.addColorStop( 0, 'rgba(255,255,240,1)' );
	glow.addColorStop( 0.18, 'rgba(255,215,140,0.85)' );
	glow.addColorStop( 0.5, 'rgba(255,140,50,0.28)' );
	glow.addColorStop( 1, 'rgba(255,90,20,0)' );
	g.fillStyle = glow;
	g.fillRect( 0, 0, size, size );

	// a few spikes, the way a flash blooms
	g.globalCompositeOperation = 'lighter';
	for ( let i = 0; i < 4; i ++ ) {

		g.save();
		g.translate( size / 2, size / 2 );
		g.rotate( i * Math.PI / 4 + 0.2 );
		const spike = g.createLinearGradient( - size / 2, 0, size / 2, 0 );
		spike.addColorStop( 0, 'rgba(255,170,80,0)' );
		spike.addColorStop( 0.5, 'rgba(255,240,200,0.55)' );
		spike.addColorStop( 1, 'rgba(255,170,80,0)' );
		g.fillStyle = spike;
		g.fillRect( - size / 2, - 2, size, 4 );
		g.restore();

	}

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

/*
================
R_MuzzleFlashUpdate

Once per frame, from the view: places the glare at the muzzle while a flash is
on.  registerGlow makes the sprite brighter than white in the HDR pipeline.
================
*/
export function R_MuzzleFlashUpdate( scene, registerGlow, origin, forward, right, up ) {

	if ( scene == null || typeof document === 'undefined' ) return;

	const level = R_NewerLightingActive() ? R_MuzzleFlashLevel() : 0;

	if ( sprite === null ) {

		if ( level === 0 ) return;

		const material = new THREE.SpriteMaterial( {
			map: glareTexture(),
			blending: THREE.AdditiveBlending,
			transparent: true,
			depthTest: false,
			depthWrite: false
		} );
		registerGlow( material, 2.5 );
		sprite = new THREE.Sprite( material );
		sprite.renderOrder = 1000;
		sprite.frustumCulled = false;
		sprite.name = 'quake_muzzle_flash';
		scene.add( sprite );

	}

	if ( sprite.parent !== scene ) scene.add( sprite ); // a new level cleared the scene

	sprite.visible = level > 0;
	if ( level === 0 ) return;

	sprite.position.set(
		origin[ 0 ] + forward[ 0 ] * MUZZLE_FORWARD + right[ 0 ] * MUZZLE_RIGHT + up[ 0 ] * MUZZLE_UP,
		origin[ 1 ] + forward[ 1 ] * MUZZLE_FORWARD + right[ 1 ] * MUZZLE_RIGHT + up[ 1 ] * MUZZLE_UP,
		origin[ 2 ] + forward[ 2 ] * MUZZLE_FORWARD + right[ 2 ] * MUZZLE_RIGHT + up[ 2 ] * MUZZLE_UP );

	const size = 5 + 8 * level;
	sprite.scale.set( size, size, 1 );
	sprite.material.opacity = Math.min( 1, level * 1.2 );
	sprite.material.rotation = level * 1.3;

}
