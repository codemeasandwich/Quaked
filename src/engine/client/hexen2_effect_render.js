/**
 * @module engine/client/hexen2_effect_render
 *
 * Draws Hexen II client effects as Three.js sprites: one Sprite per live effect slot, its material using the frame
 * image the native sprite timing selects, positioned at the effect's origin and scaled by the frame's pixel extents
 * (a bounded approximation of the native billboard: the sprite is centred on its origin). Sprites are removed when
 * their slot ends. Scene construction only; the WebGL draw stays with the renderer.
 *
 * Types: plain values and functions; no exported classes.
 * State: a layer object (`scene`, `sprites` Map) supplied by the caller.
 * Errors: none raised; a missing sprite or model leaves the slot without a Sprite.
 */

import * as THREE from 'three';
import { Hexen2_EffectSpriteName } from './hexen2_effects_assets.js';
import { Hexen2_EffectFrame } from './hexen2_effect_anim.js';

/**
 * Creates an effect layer for a scene.
 *
 * @param {object} scene a THREE.Scene (the renderer's scene or a test's)
 * @returns {{ scene: object, sprites: Map<number, object> }} the layer
 */
export function Hexen2_EffectLayer( scene ) { return { scene, sprites: new Map() }; }

/**
 * Updates the layer from the client's live effects.
 *
 * @param {{ scene: object, sprites: Map }} layer the layer
 * @param {Map<number, { type: number, params: object, startedAt?: number }>} effects the client effect slots
 * @param {{ loadModel: function(string, boolean): ?object, time: number }} options the sprite loader and the current
 *   presentation time
 * @returns {{ active: number, added: number, removed: number }} the number of sprites after the update
 */
export function Hexen2_UpdateEffectLayer( layer, effects, options ) {

	let added = 0, removed = 0;
	for ( const [ index, sprite ] of layer.sprites ) {

		if ( !effects.has( index ) ) { layer.scene.remove( sprite ); layer.sprites.delete( index ); removed ++; }

	}
	for ( const [ index, effect ] of effects ) {

		if ( layer.sprites.has( index ) ) continue;
		const name = Hexen2_EffectSpriteName( effect.type );
		if ( name === null ) continue;
		const model = options.loadModel( name, true );
		if ( !model ) continue;
		const elapsed = effect.startedAt === undefined ? 0 : Math.max( 0, options.time - effect.startedAt );
		const frame = Hexen2_EffectFrame( model.cache.data, elapsed, { loop: true } );
		if ( frame === null || !frame.image ) continue;
		const material = new THREE.SpriteMaterial( { map: frame.image.gl_texturenum ?? null, transparent: true } );
		const sprite = new THREE.Sprite( material );
		const params = effect.params ?? {};
		const origin = params.origin ?? params.pos;
		if ( origin ) sprite.position.set( origin[ 0 ], origin[ 1 ], origin[ 2 ] );
		const width = Math.max( 1, ( frame.image.left ?? 0 ) + ( frame.image.right ?? 0 ) );
		const height = Math.max( 1, ( frame.image.up ?? 0 ) + ( frame.image.down ?? 0 ) );
		sprite.scale.set( width, height, 1 );
		sprite.center.set( 0.5, 0.5 );
		sprite.userData.effectIndex = index;
		layer.scene.add( sprite );
		layer.sprites.set( index, sprite );
		added ++;

	}
	return { active: layer.sprites.size, added, removed };

}
