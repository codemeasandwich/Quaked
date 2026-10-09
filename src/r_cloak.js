// Invisibility, seen (cards [6] and [27], owner requests; supplied source fieldlab-fx-3d-updated.html, "03 Cloak & Lensing":
// meshVert, refract, the cloak render step, configs.cloak). Newer Game only.
//
// With the Ring, Quake hides the held gun (and shows only floating eyes for the player). In Newer Game, when the Unseen World
// vision is not drawing the gun (vision off), the gun is instead a cloaked silhouette: the scene behind it shows through, bent
// by its surface, as the supplied effect bends its gallery through a glass figure. The same holds for the player's own body
// where it can be seen (the chase camera): a renderer-only copy of the player model, never the server's model (still eyes).
//
// How (the supplied effect's own structure, in this renderer): the supplied renderer draws the opaque scene to a separate colour
// target, then draws the figure with a shader that reads that colour at screen positions moved by the figure's view-space normal
// (more at its rim), a flowing shimmer and a small colour split. Here the opaque scene is the finished frame without the
// cloaked meshes (they are not drawn into the scene), and the figure's normals come from this module: each cloaked mesh is drawn
// into a small target as ( view normal xy, rim, coverage ). The present pass (gl_post.js) then takes the frame through it.
//
// R_CloakSubmit( mesh ) during the scene's set-up; R_CloakRender( renderer, camera, width, height ) in the post pass returns the
// target's texture (null when nothing is cloaked this frame); R_CloakPending() says whether anything was submitted.

import * as THREE from 'three';
import { cvar_t } from './cvar.js';

export const r_cloak = new cvar_t( 'r_cloak', '1', true );
// the supplied preset (configs.cloak): strength 1.6, shimmer 1, chroma 1
export const CLOAK = Object.freeze( { strength: 1.6, shimmer: 1, chroma: 1 } );

const submitted = [];
let target = null;
const material = new THREE.ShaderMaterial( {
	vertexShader: `
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
	vec4 view = modelViewMatrix * vec4( position, 1.0 );
	vViewPos = view.xyz;
	vNormalV = normalize( normalMatrix * normal );
	gl_Position = projectionMatrix * view;
}`,
	fragmentShader: `
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
	vec3 N = normalize( vNormalV ), V = normalize( - vViewPos );
	if ( ! gl_FrontFacing ) N = - N;
	float rim = pow( 1.0 - max( 0.0, dot( N, V ) ), 1.7 ); // (the supplied refract shader's rim)
	gl_FragColor = vec4( N.xy * 0.5 + 0.5, rim, 1.0 );
}`,
	side: THREE.DoubleSide
} );

export function R_CloakSubmit( mesh ) { if ( mesh && ! submitted.includes( mesh ) ) submitted.push( mesh ); }
export const R_CloakPending = () => submitted.length > 0 && r_cloak.value !== 0;
export const R_CloakSubmitted = () => submitted.slice();

export function R_CloakRender( renderer, camera, width, height ) {
	if ( ! R_CloakPending() ) { submitted.length = 0; return null; }
	if ( target === null || target.width !== width || target.height !== height ) {
		target?.dispose();
		target = new THREE.WebGLRenderTarget( Math.max( 1, width ), Math.max( 1, height ), { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } );
	}
	const previous = renderer.getRenderTarget(), clear = renderer.getClearColor( new THREE.Color() ), alpha = renderer.getClearAlpha(), autoClear = renderer.autoClear;
	renderer.setRenderTarget( target );
	renderer.setClearColor( 0x000000, 0 ); renderer.clear( true, true, false );
	renderer.autoClear = false;
	for ( const mesh of submitted ) {
		const was = { material: mesh.material, visible: mesh.visible, before: mesh.onBeforeRender, after: mesh.onAfterRender, layers: mesh.layers.mask };
		try {
			mesh.material = material; mesh.visible = true; mesh.onBeforeRender = mesh.onAfterRender = () => {}; mesh.layers.enableAll();
			renderer.render( mesh, camera );
		} finally { mesh.material = was.material; mesh.visible = was.visible; mesh.onBeforeRender = was.before; mesh.onAfterRender = was.after; mesh.layers.mask = was.layers; }
	}
	renderer.autoClear = autoClear; renderer.setClearColor( clear, alpha ); renderer.setRenderTarget( previous );
	submitted.length = 0;
	return target.texture;
}

export function R_CloakReset() { submitted.length = 0; target?.dispose(); target = null; }

// the present pass's part (GLSL, gl_post.js PRESENT_FRAGMENT): the supplied refract shader's offset and colour, reading the
// finished frame (tComposite) in place of its opaque-scene colour target. Its flow noise is procedural here (the supplied one is
// a noise texture), drifting over the screen.
export const CLOAK_GLSL = `
uniform sampler2D tCloak;
uniform float uCloak;
uniform float uCloakTime;
float cloakHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float cloakNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( cloakHash( i ), cloakHash( i + vec2( 1, 0 ) ), f.x ), mix( cloakHash( i + vec2( 0, 1 ) ), cloakHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }
vec2 cloakFlow( vec2 p ) { return vec2( cloakNoise( p ), cloakNoise( p + vec2( 17.3, 9.1 ) ) ) * 2.0 - 1.0; }
// the cloaked colour at this pixel, or a < 0.5 when nothing cloaked covers it
vec4 cloakAt( vec2 uv, vec2 resolution ) {
	vec4 k = texture2D( tCloak, uv );
	if ( uCloak < 0.5 || k.a < 0.5 ) return vec4( 0.0 );
	vec2 nv = k.xy * 2.0 - 1.0; float rim = k.z, t = uCloakTime;
	vec2 flow = cloakFlow( uv * 9.6 + vec2( t * .038, - t * .07 ) ), fine = cloakFlow( uv * 34.8 + flow * .15 + vec2( - t * .04, t * .08 ) );
	vec2 off = ( nv * ( .012 + .039 * rim ) + ( flow * .012 + fine * .009 ) * ${ CLOAK.shimmer.toFixed( 2 ) } * ( .22 + rim ) ) * ${ CLOAK.strength.toFixed( 2 ) };
	off.x *= resolution.y / resolution.x;
	vec2 p = clamp( uv + off, vec2( .002 ), vec2( .998 ) ), split = off * .24 * ${ CLOAK.chroma.toFixed( 2 ) };
	vec3 c = vec3( texture2D( tComposite, clamp( p + split, .002, .998 ) ).r, texture2D( tComposite, p ).g, texture2D( tComposite, clamp( p - split, .002, .998 ) ).b );
	c *= 1.0 - .08 * rim * min( ${ CLOAK.strength.toFixed( 2 ) }, 1.0 );
	c += vec3( .035, .085, .083 ) * rim * ${ CLOAK.shimmer.toFixed( 2 ) } * ${ CLOAK.strength.toFixed( 2 ) } * ( .5 + .5 * fine.x );
	return vec4( c, 1.0 );
}
`;
