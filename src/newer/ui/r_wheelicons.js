/**
 * @module newer/ui/r_wheelicons
 *
 * The weapon wheel's pictures (card T-3faa98e3 item 14; the owner's design of 14 October 2026,
 * docs/controller-2026-10-14.md): each weapon's own 3D model, as the game draws it in the player's hands, rendered side
 * on (muzzle to the right) and turned into flat grey line art: a black outline round it, black lines where its surfaces
 * meet at an edge or step in depth, and three or four greys of light falling from above. Newer Game's imported weapon
 * art (r_weapons.js) is used where it is ready, else the game's own `v_*.mdl`, so an add-on's own weapons are drawn
 * as they are.
 *
 * The pictures are made in a small WebGL context of their own, never the game's (so nothing the game draws or has
 * bound is touched), when the wheel first shows them; the context is let go when the wheel closes
 * (`R_WheelIconsRelease`). Each picture is kept for as long as the model's pose data it came from.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `icons` (picture by pose data), `tried` (poses that failed this opening),
 * `gl` (the context while the wheel is open), `failed` (no WebGL this opening: the wheel writes names instead),
 * `frameStart` and `spent` (this frame's allowance for making pictures).
 *
 * Errors: none raised; a failure to make a context or picture leaves that weapon without one (its name is written)
 * until the next opening tries again.
 */
import * as THREE from 'three';
import { cl } from '../../engine/client/client.js';
import { mod_alias } from '../../engine/render/gl_model_types.js';
import { Mod_Extradata } from '../../engine/render/gl_model.js';
import { GL_DrawAliasFrame } from '../../engine/render/gl_mesh.js';
import { R_WeaponAsset } from '../render/r_weapons.js';

/** The held models, by wheel place (impulse order): the axe, shotgun ... thunderbolt. */
export const WHEEL_MODELS = Object.freeze( [ 'v_axe', 'v_shot', 'v_shot2', 'v_nail', 'v_nail2', 'v_rock', 'v_rock2', 'v_light' ] );
/** The pictures' size, in pixels (drawn smaller on the wheel, so their lines stay smooth). */
export const ICON_WIDTH = 512, ICON_HEIGHT = 256;

// the light (camera space: right, up, towards the viewer), from above and a little to the left
const LIGHT = ( () => { const l = [ - 0.35, 0.6, 0.72 ], n = Math.hypot( ...l ); return l.map( v => v / n ); } )();
const TONES = [ [ 0.8, 218 ], [ 0.55, 190 ], [ 0.28, 156 ], [ - 2, 118 ] ]; // [ at least this much light, grey ]
const INK = 16; // the lines' grey
const OUTLINE = 7; // the outline's width round the weapon, in picture pixels (about two on the wheel)
const CREASE = Math.cos( 32 * Math.PI / 180 ); // surfaces meeting more sharply than this get a line
const STEP = 0.035; // a step in depth (of the model's depth) that gets a line

const BUDGET = 8; // milliseconds a frame for making pictures (one picture takes a few)

const icons = new WeakMap();
let tried = new WeakSet(), gl = null, failed = false, frameStart = - Infinity, spent = 0;

/**
 * Turns a side-on render of a weapon's normals and depth into grey line art.
 *
 * @param {Uint8Array|Uint8ClampedArray} pixels `width * height * 4` bytes, top row first: red and green the surface's
 *   camera-space normal x and y (`n * 0.5 + 0.5`), blue its depth (0 nearest .. 1 furthest), alpha 255 on the model
 *   and 0 off it
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} `width * height * 4` RGBA: grey on the model, black lines, transparent elsewhere
 */
export function R_WheelIconStylise( pixels, width, height ) {

	const count = width * height, out = new Uint8ClampedArray( count * 4 );
	// the model's mask, and its normals decoded once
	const inside = new Uint8Array( count ), nx = new Float32Array( count ), ny = new Float32Array( count ), nz = new Float32Array( count );
	for ( let i = 0; i < count; i ++ ) {

		if ( pixels[ i * 4 + 3 ] <= 127 ) continue;
		inside[ i ] = 1;
		const x = pixels[ i * 4 ] / 127.5 - 1, y = pixels[ i * 4 + 1 ] / 127.5 - 1;
		nx[ i ] = x; ny[ i ] = y; nz[ i ] = Math.sqrt( Math.max( 0, 1 - x * x - y * y ) );

	}
	// the outline: the mask grown by OUTLINE pixels (a running count along each row, then each column)
	const rows = new Uint8Array( count ), grown = new Uint8Array( count );
	for ( let y = 0; y < height; y ++ ) {

		let n = 0;
		for ( let x = - OUTLINE; x < width; x ++ ) {

			if ( x + OUTLINE < width ) n += inside[ y * width + x + OUTLINE ];
			if ( x - OUTLINE - 1 >= 0 ) n -= inside[ y * width + x - OUTLINE - 1 ];
			if ( x >= 0 ) rows[ y * width + x ] = n > 0 ? 1 : 0;

		}

	}
	for ( let x = 0; x < width; x ++ ) {

		let n = 0;
		for ( let y = - OUTLINE; y < height; y ++ ) {

			if ( y + OUTLINE < height ) n += rows[ ( y + OUTLINE ) * width + x ];
			if ( y - OUTLINE - 1 >= 0 ) n -= rows[ ( y - OUTLINE - 1 ) * width + x ];
			if ( y >= 0 ) grown[ y * width + x ] = n > 0 ? 1 : 0;

		}

	}
	const NEAR = [ [ 1, 0 ], [ 0, 1 ], [ - 1, 0 ], [ 0, - 1 ], [ 2, 0 ], [ 0, 2 ], [ - 2, 0 ], [ 0, - 2 ] ];
	for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {

		const i = y * width + x, o = i * 4;
		if ( ! inside[ i ] ) {

			if ( grown[ i ] ) { out[ o ] = out[ o + 1 ] = out[ o + 2 ] = INK; out[ o + 3 ] = 255; }
			continue;

		}
		const light = nx[ i ] * LIGHT[ 0 ] + ny[ i ] * LIGHT[ 1 ] + nz[ i ] * LIGHT[ 2 ];
		let grey = TONES[ TONES.length - 1 ][ 1 ];
		for ( const [ at, tone ] of TONES ) if ( light >= at ) { grey = tone; break; }
		// a crease or a step against a pixel up to two away (both sides of it, so the line is about four pixels wide: one
		// or more on the wheel)
		let line = false;
		for ( const [ dx, dy ] of NEAR ) {

			const px = x + dx, py = y + dy;
			if ( px < 0 || py < 0 || px >= width || py >= height ) continue;
			const j = py * width + px;
			if ( ! inside[ j ] ) continue;
			if ( nx[ i ] * nx[ j ] + ny[ i ] * ny[ j ] + nz[ i ] * nz[ j ] < CREASE || Math.abs( pixels[ o + 2 ] - pixels[ j * 4 + 2 ] ) / 255 > STEP ) { line = true; break; }

		}
		out[ o ] = out[ o + 1 ] = out[ o + 2 ] = line ? INK : grey; out[ o + 3 ] = 255;

	}
	return out;

}

// the weapon's model as the game draws it in the player's hands: Newer's imported art when it is ready, else the MDL
function poseData( slot ) {

	const name = `progs/${WHEEL_MODELS[ slot ]}.mdl`;
	// (asking for the art starts its download if it has not begun; Newer Game's startup already preloads every role in
	// the weapon manifest, R_WeaponsPreload, so normally it is ready and nothing new is fetched)
	const art = R_WeaponAsset( name );
	if ( art?.templates?.[ 0 ] ) return art.templates[ 0 ];
	const model = cl.model_precache?.find( m => m?.name === name && m.type === mod_alias );
	if ( ! model ) return null;
	try { return GL_DrawAliasFrame( Mod_Extradata( model ), 0 ); } catch { return null; }

}

function context() {

	if ( gl || failed ) return gl;
	try {

		const canvas = document.createElement( 'canvas' );
		canvas.width = ICON_WIDTH; canvas.height = ICON_HEIGHT;
		const renderer = new THREE.WebGLRenderer( { canvas, alpha: true, antialias: false, depth: true, stencil: false, preserveDrawingBuffer: false } );
		renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
		renderer.setClearColor( 0x000000, 0 );
		const material = new THREE.ShaderMaterial( {
			side: THREE.DoubleSide,
			uniforms: { near: { value: 0 }, far: { value: 1 } },
			vertexShader: 'varying vec3 vN; varying float vDepth;\nvoid main() { vN = normalMatrix * normal; vec4 p = modelViewMatrix * vec4( position, 1.0 ); vDepth = - p.z; gl_Position = projectionMatrix * p; }',
			fragmentShader: 'uniform float near; uniform float far; varying vec3 vN; varying float vDepth;\nvoid main() { vec3 n = normalize( vN ); if ( ! gl_FrontFacing ) n = - n; if ( n.z < 0.0 ) n = - n; gl_FragColor = vec4( n.xy * 0.5 + 0.5, clamp( ( vDepth - near ) / max( far - near, 0.001 ), 0.0, 1.0 ), 1.0 ); }'
		} );
		gl = { renderer, material, scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(), pixels: new Uint8Array( ICON_WIDTH * ICON_HEIGHT * 4 ) };

	} catch ( error ) { failed = true; console.warn( 'Weapon wheel pictures unavailable:', error ); }
	return gl;

}

// renders one pose side on, fitted to the picture, and returns the line art on a canvas (null when it cannot)
function render( pose ) {

	const g = context();
	if ( ! g ) return null;
	const geometry = new THREE.BufferGeometry();
	let mesh = null;
	try {

		geometry.setAttribute( 'position', pose.posAttr );
		geometry.setAttribute( 'normal', pose.normalAttr );
		geometry.setIndex( Array.from( pose.indices ) );
		geometry.computeBoundingBox();
		const box = geometry.boundingBox, centre = box.getCenter( new THREE.Vector3() ), size = box.getSize( new THREE.Vector3() );
		if ( ! ( size.x > 0 && size.z > 0 ) ) return null;
		// side on from the weapon's right (Quake's -y), looking a little down on it; Quake's +x (the muzzle) is to the right
		const camera = g.camera, reach = size.length() * 2 + 16;
		camera.up.set( 0, 0, 1 );
		camera.position.set( centre.x, centre.y - reach, centre.z + reach * 0.16 );
		camera.lookAt( centre );
		camera.updateMatrixWorld();
		// fit the box's corners, as the camera sees them, into the picture with a margin for the outline
		const view = camera.matrixWorldInverse, corner = new THREE.Vector3();
		let left = Infinity, right = - Infinity, bottom = Infinity, top = - Infinity, near = Infinity, far = - Infinity;
		for ( let i = 0; i < 8; i ++ ) {

			corner.set( i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z ).applyMatrix4( view );
			left = Math.min( left, corner.x ); right = Math.max( right, corner.x ); bottom = Math.min( bottom, corner.y ); top = Math.max( top, corner.y );
			near = Math.min( near, - corner.z ); far = Math.max( far, - corner.z );

		}
		const aspect = ICON_WIDTH / ICON_HEIGHT, margin = 1.06;
		let w = ( right - left ) * margin, h = ( top - bottom ) * margin;
		if ( w / h > aspect ) h = w / aspect; else w = h * aspect;
		const cx = ( left + right ) / 2, cy = ( bottom + top ) / 2;
		Object.assign( camera, { left: cx - w / 2, right: cx + w / 2, bottom: cy - h / 2, top: cy + h / 2, near: Math.max( 0.1, near - 1 ), far: far + 1 } );
		camera.updateProjectionMatrix();
		g.material.uniforms.near.value = near; g.material.uniforms.far.value = far;
		mesh = new THREE.Mesh( geometry, g.material );
		g.scene.add( mesh );
		g.renderer.setRenderTarget( null );
		g.renderer.clear();
		g.renderer.render( g.scene, camera );
		const context = g.renderer.getContext();
		context.readPixels( 0, 0, ICON_WIDTH, ICON_HEIGHT, context.RGBA, context.UNSIGNED_BYTE, g.pixels );
		// WebGL's rows come bottom first
		const rows = new Uint8Array( g.pixels.length ), stride = ICON_WIDTH * 4;
		for ( let y = 0; y < ICON_HEIGHT; y ++ ) rows.set( g.pixels.subarray( ( ICON_HEIGHT - 1 - y ) * stride, ( ICON_HEIGHT - y ) * stride ), y * stride );
		// nothing drawn (the context was lost meanwhile): no picture, and it is tried again on the next opening
		let drawn = false;
		for ( let i = 3; i < rows.length && ! drawn; i += 4 ) drawn = rows[ i ] > 127;
		if ( ! drawn ) return null;
		const art = document.createElement( 'canvas' );
		art.width = ICON_WIDTH; art.height = ICON_HEIGHT;
		art.getContext( '2d' ).putImageData( new ImageData( R_WheelIconStylise( rows, ICON_WIDTH, ICON_HEIGHT ), ICON_WIDTH, ICON_HEIGHT ), 0, 0 );
		return art;

	} catch ( error ) {

		console.warn( 'Weapon wheel picture failed:', error );
		return null;

	} finally {

		if ( mesh ) g.scene.remove( mesh );
		geometry.dispose(); // (the attributes are the model's own: only this context's copies of them go)

	}

}

/**
 * The picture for a place on the wheel, made the first time it is asked for (and again when the model changes, for
 * example when Newer's weapon art arrives). Called by the wheel's drawing (r_controller.js) while it is open.
 *
 * @param {number} slot 0 the axe .. 7 the thunderbolt
 * @returns {?HTMLCanvasElement} `ICON_WIDTH` x `ICON_HEIGHT` line art on a transparent ground, or null when the
 *   model is not loaded or there is no WebGL (the wheel writes the weapon's name instead)
 */
export function R_WheelIcon( slot ) {

	const pose = poseData( slot );
	if ( ! pose?.posAttr || ! pose.normalAttr || ! pose.indices?.length ) return null;
	if ( icons.has( pose ) ) return icons.get( pose );
	if ( tried.has( pose ) ) return null;
	// a few milliseconds of making pictures a frame at most: the others show their names until their turn
	const now = performance.now();
	if ( now - frameStart > 50 ) { frameStart = now; spent = 0; }
	if ( spent > BUDGET ) return null;
	const art = render( pose );
	spent += performance.now() - now;
	if ( art ) icons.set( pose, art ); else tried.add( pose );
	return art;

}

/**
 * Starts a new frame's allowance for making pictures. Called by the wheel's drawing once a frame before it asks for
 * them.
 */
export function R_WheelIconsFrame() { frameStart = performance.now(); spent = 0; }

/**
 * Lets the pictures' WebGL context go (the pictures made are kept; those that failed are tried again on the next
 * opening, as is making a context). Called when the wheel closes.
 */
export function R_WheelIconsRelease() {

	tried = new WeakSet(); failed = false;
	if ( ! gl ) return;
	try { gl.material.dispose(); gl.renderer.dispose(); gl.renderer.forceContextLoss(); } catch {}
	gl = null;

}
