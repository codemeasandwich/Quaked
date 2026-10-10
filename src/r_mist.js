// Newer Game: small, slow vapour streams rising from toxic pools.
//
// Staggered green wisps rise slowly in narrow anchored columns and fade at their ends.
// Bigger pools have more small streams. They share one points draw, so geometry in front of
// them hides them as usual; Toxic pool locations come from the same list the post pass uses
// for tinting what is seen through it.

import * as THREE from 'three';
import { R_GetLiquidRegions, R_WaterActive, R_LiquidLookIndex, r_mist } from './gl_post.js';
import { R_NewerGame } from './newer/render/r_anim.js';

const MAX_WISPS = 720;
const TINT = [ 0.34, 0.95, 0.30 ];

let points = null;
let builtFor = null;
let builtLook = null;
let wisps = [];
let positions = null;
let colors = null;
let texture = null;

function softTexture() {

	if ( texture !== null ) return texture;

	const c = document.createElement( 'canvas' );
	c.width = c.height = 64;
	const g = c.getContext( '2d' );
	const gr = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	// a gaussian-ish falloff, no visible edge
	gr.addColorStop( 0, 'rgba(255,255,255,0.55)' );
	gr.addColorStop( 0.2, 'rgba(255,255,255,0.36)' );
	gr.addColorStop( 0.45, 'rgba(255,255,255,0.12)' );
	gr.addColorStop( 0.75, 'rgba(255,255,255,0.025)' );
	gr.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = gr;
	g.fillRect( 0, 0, 64, 64 );
	texture = new THREE.CanvasTexture( c );
	return texture;

}

function clear( scene ) {

	if ( points !== null ) {

		if ( points.parent != null ) points.parent.remove( points );
		points.geometry.dispose();
		points.material.dispose();
		points = null;

	}

	wisps = [];
	builtFor = null; builtLook = null;

}

function build( scene, regions ) {

	clear( scene );
	builtFor = regions; builtLook = R_LiquidLookIndex( 0 );

	const pools = regions.filter( ( r ) => R_LiquidLookIndex( r.kind, r.mapLook ) === 3 );
	if ( pools.length === 0 ) return;

	let total = 0;
	for ( const r of pools ) {

		const area = ( r.max[ 0 ] - r.min[ 0 ] ) * ( r.max[ 1 ] - r.min[ 1 ] );
		const n = Math.max( 8, Math.min( 120, Math.round( area / ( 80 * 80 ) ) ) );
		let stream = null;
		for ( let i = 0; i < n && total < MAX_WISPS; i ++, total ++ ) {

			// Four staggered soft sprites share a narrow rising column. The
			// anchored stream drifts gently, rather than expanding into a cloud.
			if ( i % 4 === 0 ) stream = {
				x: r.min[ 0 ] + 12 + Math.random() * Math.max( 1, r.max[ 0 ] - r.min[ 0 ] - 24 ),
				y: r.min[ 1 ] + 12 + Math.random() * Math.max( 1, r.max[ 1 ] - r.min[ 1 ] - 24 ),
				phase: Math.random(), rise: 60 + Math.random() * 40,
				speed: 0.03 + Math.random() * 0.02, sway: Math.random() * 6.28
			};
			wisps.push( {
				x: stream.x, y: stream.y,
				z: r.z,
				phase: stream.phase + ( i % 4 ) * 0.25,
				rise: stream.rise, speed: stream.speed, sway: stream.sway,
				strength: 0.4 + Math.random() * 0.4
			} );

		}

	}

	positions = new Float32Array( wisps.length * 3 );
	colors = new Float32Array( wisps.length * 3 );

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
	geometry.setAttribute( 'color', new THREE.BufferAttribute( colors, 3 ) );

	const material = new THREE.PointsMaterial( {
		map: softTexture(),
		size: 48,
		sizeAttenuation: true,
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	} );

	points = new THREE.Points( geometry, material );
	points.userData.newerOnly = true;
	points.userData.liquidToxicMist = true;
	points.frustumCulled = false;
	points.renderOrder = 3;
	scene.add( points );

}

// every frame, with the scene and the time
export function R_MistFrame( scene, time ) {

	if ( scene == null ) return;

	const on = R_NewerGame() && R_WaterActive() && r_mist.value > 0;
	if ( ! on ) {

		if ( points !== null ) points.visible = false;
		return;

	}

	const regions = R_GetLiquidRegions();
	if ( regions !== builtFor || builtLook !== R_LiquidLookIndex( 0 ) ) build( scene, regions );
	if ( points === null ) return;

	points.visible = true;
	const amount = Math.max( 0, Math.min( 1.5, r_mist.value ) );

	for ( let i = 0; i < wisps.length; i ++ ) {

		const w = wisps[ i ];
		const age = ( time * w.speed + w.phase ) % 1;
		// in, hang a while, and out
		const fade = Math.sin( Math.PI * age );
		const a = fade * fade * w.strength * amount * 0.038;

		positions[ i * 3 ] = w.x + Math.sin( time * 0.3 + w.sway ) * ( 3 + age * 8 );
		positions[ i * 3 + 1 ] = w.y + Math.cos( time * 0.27 + w.sway ) * ( 3 + age * 8 );
		positions[ i * 3 + 2 ] = w.z + 8 + age * w.rise;

		colors[ i * 3 ] = TINT[ 0 ] * a;
		colors[ i * 3 + 1 ] = TINT[ 1 ] * a;
		colors[ i * 3 + 2 ] = TINT[ 2 ] * a;

	}

	points.geometry.attributes.position.needsUpdate = true;
	points.geometry.attributes.color.needsUpdate = true;

}

export function R_MistClear() {

	clear( null );

}
