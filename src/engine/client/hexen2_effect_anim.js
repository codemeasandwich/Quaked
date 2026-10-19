/**
 * @module engine/client/hexen2_effect_anim
 *
 * Which sprite image a Hexen II client effect shows at a given elapsed time: sprite frames play in order, a single
 * frame shows for 0.1 s, and a grouped frame selects one image by its own intervals. Looping effect sprites (smoke,
 * flames) wrap; one-shot sprites (explosions, sparks) hold the last image. This is presentation timing only; drawing
 * the chosen texture is the renderer's job.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a missing sprite yields null.
 */

import { SPR_GROUP } from '../render/gl_model_types.js';

const SINGLE_INTERVAL = 0.1;

function groupDuration( group ) { let total = 0; for ( const interval of group.intervals ) total += interval; return total; }

/**
 * The sprite image at an elapsed time.
 *
 * @param {?object} sprite an `msprite_t` (a sprite model's `cache.data`)
 * @param {number} elapsed seconds since the effect started
 * @param {{ loop?: boolean }} [options] wrap a looping sprite (default true); otherwise hold the last image
 * @returns {?{ frameIndex: number, imageIndex: number, image: object }} the outer frame, the image inside a group and
 *   the `mspriteframe_t`, or null for a missing sprite
 */
export function Hexen2_EffectFrame( sprite, elapsed, options = {} ) {

	if ( !sprite || !Array.isArray( sprite.frames ) || sprite.frames.length === 0 ) return null;
	const total = sprite.frames.reduce( ( sum, desc ) => sum + ( desc.type === SPR_GROUP ? groupDuration( desc.frameptr ) : SINGLE_INTERVAL ), 0 );
	let time = Math.max( 0, elapsed );
	if ( options.loop !== false && total > 0 ) time = time % total;
	for ( let frameIndex = 0; frameIndex < sprite.frames.length; frameIndex ++ ) {

		const desc = sprite.frames[ frameIndex ];
		if ( desc.type === SPR_GROUP ) {

			let inner = Math.max( 0, time ), imageIndex = 0;
			for ( ; imageIndex < desc.frameptr.intervals.length; imageIndex ++ ) {

				const interval = desc.frameptr.intervals[ imageIndex ];
				if ( inner < interval || imageIndex === desc.frameptr.intervals.length - 1 ) break;
				inner -= interval;

			}
			return { frameIndex, imageIndex, image: desc.frameptr.frames[ Math.min( imageIndex, desc.frameptr.frames.length - 1 ) ] };

		}
		if ( time < SINGLE_INTERVAL || frameIndex === sprite.frames.length - 1 )
			return { frameIndex, imageIndex: 0, image: desc.frameptr };
		time -= SINGLE_INTERVAL;

	}
	return null;

}
