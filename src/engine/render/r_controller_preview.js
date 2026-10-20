/**
 * @module engine/render/r_controller_preview
 *
 * Page-owned, small WebGL context, composited onto the engine's 2D overlay. The procedural reference uses ordinary
 * Three r183 geometry; it neither imports Newer nor touches the game's renderer. A failed context leaves labels usable.
 */
import * as THREE from 'three';
import { buildController } from './r_controller_model.js';

let preview = null, failed = false;

/** Releases every page-owned geometry/material and the GPU context on every exit, including external transitions. */
export function R_ControllerPreviewRelease() {

	if ( preview ) {

		const geometries = new Set(), materials = new Set( preview.model.materials );
		preview.model.group.traverse( node => {

			if ( node.geometry ) geometries.add( node.geometry );
			for ( const material of Array.isArray( node.material ) ? node.material : node.material ? [ node.material ] : [] ) materials.add( material );

		} );
		for ( const geometry of geometries ) geometry.dispose();
		for ( const material of materials ) material.dispose();
		preview.renderer.dispose(); preview.renderer.forceContextLoss(); preview = null;

	}
	failed = false;

}

/** Creates the isolated context only on entry; returns false when WebGL is unavailable. */
export function R_ControllerPreviewOpen() {

	if ( preview ) return true;
	if ( failed || typeof document === 'undefined' ) return false;
	let renderer;
	try {

		renderer = new THREE.WebGLRenderer( { canvas: document.createElement( 'canvas' ), alpha: true, antialias: true } );
		const model = buildController( THREE ), scene = new THREE.Scene();
		scene.add( model.group, new THREE.HemisphereLight( 0xffffff, 0x454555, 2.4 ) );
		const light = new THREE.DirectionalLight( 0xffffff, 3 ); light.position.set( - 3, 8, - 4 ); scene.add( light );
		const camera = new THREE.OrthographicCamera( - 4, 4, 3, - 3, .1, 100 );
		camera.position.set( 0, 12, 0 ); camera.up.set( 0, 0, - 1 ); camera.lookAt( 0, 0, .25 );
		preview = { renderer, model, scene, camera }; return true;

	} catch ( error ) {

		if ( renderer ) { renderer.dispose(); renderer.forceContextLoss(); }
		failed = true; return false;

	}

}

const value = ( pad, index ) => Math.max( 0, Math.min( 1, pad?.buttons?.[ index ]?.value ?? 0 ) );
const controlButtons = { 'button-a': 0, 'button-b': 1, 'button-x': 2, 'button-y': 3, 'left-bumper': 4, 'right-bumper': 5,
	'left-trigger': 6, 'right-trigger': 7, back: 8, start: 9, 'left-stick': 10, 'right-stick': 11,
	'pad-up': 12, 'pad-down': 13, 'pad-left': 14, 'pad-right': 15, guide: 16 };

/** Animates from retained rest transforms, so repeated frames never accumulate button depression or trigger rotation. */
export function R_ControllerPose( model, pad, selected = null ) {

	for ( const [ id, control ] of Object.entries( model.controls ) ) {

		const amount = value( pad, controlButtons[ id ] );
		control.group.position.copy( control.restPosition ); control.group.rotation.copy( control.restRotation );
		if ( control.type === 'trigger' ) control.group.rotation.x -= amount * .5;
		else control.group.position.y -= amount * .09;
		if ( control.type === 'stick' ) {

			const axis = id === 'left-stick' ? 0 : 2;
			control.group.rotation.z = - ( pad?.axes?.[ axis ] || 0 ) * .35;
			control.group.rotation.x = ( pad?.axes?.[ axis + 1 ] || 0 ) * .35;

		}
		for ( const mesh of control.meshes ) if ( mesh.material.emissive ) {

			mesh.material.emissive.setHex( selected === id ? 0xb08a30 : 0x40b8ac );
			mesh.material.emissiveIntensity = selected === id ? .55 : amount * .7;

		}

	}

}

/** Renders at physical resolution and returns projected leader endpoints in page units, or null for list fallback. */
export function R_ControllerPreviewDraw( ctx, rect, scale, pad, selected, orientation ) {

	if ( ! preview && ! R_ControllerPreviewOpen() ) return null;
	const { renderer, model, scene, camera } = preview;
	const width = Math.max( 1, Math.round( rect.width * scale ) ), height = Math.max( 1, Math.round( rect.height * scale ) );
	if ( renderer.domElement.width !== width || renderer.domElement.height !== height ) renderer.setSize( width, height, false );
	const aspect = width / height, halfWidth = Math.max( 4.2, 3.8 * aspect ), halfHeight = halfWidth / aspect;
	camera.left = - halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = - halfHeight; camera.updateProjectionMatrix();
	R_ControllerPose( model, pad, selected );
	model.group.rotation.set( orientation[ 0 ], orientation[ 1 ], orientation[ 2 ] );
	renderer.render( scene, camera );
	ctx.drawImage( renderer.domElement, rect.x * scale, rect.y * scale, width, height );
	model.group.updateMatrixWorld( true );
	return Object.fromEntries( Object.entries( model.anchors ).map( ( [ id, anchor ] ) => {

		const point = anchor.clone().applyMatrix4( model.group.matrixWorld ).project( camera );
		return [ id, { x: rect.x + ( point.x + 1 ) * rect.width / 2, y: rect.y + ( 1 - point.y ) * rect.height / 2 } ];

	} ) );

}
