// The post pipeline's G-buffer stage on its own (card [44h]): emissive materials glow above white only while
// advanced lighting is on, lava breathes, a disposed material is forgotten, and the G-buffer patch is installed on
// every material's compile. Through the public interface of r_post_gbuffer.js, with real Three.js materials.
import * as THREE from 'three';
import * as gbuffer from '../src/newer/render/r_post_gbuffer.js';
import { postState } from '../src/newer/render/r_post_state.js';
import { EMISSIVE_BOOST, LAVA_BOOST } from '../src/newer/render/r_post_config.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'glow follows advanced lighting; lava pulses; a disposed material is let go', () => {
	gbuffer.setGlowActive( false );
	const lit = new THREE.MeshStandardMaterial( { emissive: 0xffffff } ), lava = new THREE.MeshBasicMaterial();
	gbuffer.R_RegisterGlow( lit ); gbuffer.R_RegisterGlow( lava, gbuffer.R_GlowBoostForTexture( '*LAVA1' ) );
	same( lit.emissiveIntensity, 1, 'unlit: no boost' ); same( lava.color.r, 1, 'unlit lava at its own colour' );
	gbuffer.setGlowActive( true ); same( postState.glowActive, true, 'the shared flag' );
	same( lit.emissiveIntensity, EMISSIVE_BOOST, 'lit: fullbright boost' ); same( lava.color.r, LAVA_BOOST, 'lava boost' );
	gbuffer.pulseLava( 1 ); check( lava.color.r !== LAVA_BOOST && Math.abs( lava.color.r / LAVA_BOOST - 1 ) < 0.25, 'lava breathes around its boost' );
	same( lit.emissiveIntensity, EMISSIVE_BOOST, 'only lava pulses' );
	same( gbuffer.R_GlowBoostForTexture( '*slime0' ), 1.5, 'slime glows a little' ); same( gbuffer.R_GlowBoostForTexture( 'metal1_1' ), 1, 'walls do not' );
	const kept = lava.color.r; lava.dispose(); gbuffer.setGlowActive( false ); same( lava.color.r, kept, 'a disposed material is no longer switched' );
	same( lit.emissiveIntensity, 1, 'off again' );
} );

Deno.test( 'the G-buffer patch is installed on every material\'s compile', () => {
	const before = THREE.Material.prototype.onBeforeCompile;
	try {
		gbuffer.R_PostInstallGBufferPatch();
		check( THREE.Material.prototype.onBeforeCompile !== before || before.name === 'patchGBufferShader', 'installed' );
		same( new THREE.MeshBasicMaterial().onBeforeCompile, THREE.Material.prototype.onBeforeCompile, 'a new material carries it' );
	} finally { THREE.Material.prototype.onBeforeCompile = before; }
} );
