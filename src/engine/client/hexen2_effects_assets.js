/**
 * @module engine/client/hexen2_effects_assets
 *
 * The native sprite a Hexen II client effect draws, by CE_* type, from effects.h's own comments. Base-game sprites
 * only; a type whose sprite is absent from the supplied data is reported as unmapped instead of borrowing Quake art.
 * Loading is the port's sprite loader (`Mod_ForName`); drawing the sprite is the renderer's job.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a missing sprite is reported in the result.
 */

/** CE type -> the supplied base-game sprite (effects.h comments). */
export const EFFECT_SPRITES = Object.freeze( {
	4: 'models/whtsmk1.spr', 5: 'models/bspark.spr', 6: 'models/spark.spr', 7: 'models/fcircle.spr',
	8: 'models/fcircle.spr', 9: 'models/sm_white.spr', 10: 'models/gryspt.spr', 11: 'models/yr_flsh.spr',
	12: 'models/bluflash.spr', 13: 'models/bluflash.spr', 14: 'models/redspt.spr', 15: 'models/sm_expld.spr',
	16: 'models/bg_expld.spr', 17: 'models/fl_expld.spr', 19: 'models/xpspblue.spr', 20: 'models/grnsmk1.spr',
	21: 'models/grysmk1.spr', 22: 'models/redsmk1.spr', 23: 'models/whtsmk1.spr', 24: 'models/rspark.spr',
	25: 'models/gspark.spr', 26: 'models/telesmk1.spr', 27: 'models/telesmk2.spr', 28: 'models/icehit.spr',
	29: 'models/medhit.spr', 30: 'models/mezzoref.spr', 32: 'models/xbowexpl.spr', 33: 'models/gen_expl.spr',
	34: 'models/mm_expld.spr', 35: 'models/ghost.spr', 36: 'models/bonexpld.spr', 37: 'models/rcloud.spr'
} );

/**
 * The sprite for an effect type.
 *
 * @param {number} type the CE_* type
 * @returns {?string} the sprite path, or null when the type has no supplied base-game sprite
 */
export function Hexen2_EffectSpriteName( type ) { return Object.hasOwn( EFFECT_SPRITES, type ) ? EFFECT_SPRITES[ type ] : null; }

/**
 * Loads every mapped effect sprite.
 *
 * @param {function(string, boolean): ?object} loadModel the port's `Mod_ForName`
 * @returns {{ loaded: ReadonlyArray<{ type: number, name: string, model: object }>, missing: ReadonlyArray<number> }}
 *   the loaded sprites and the types whose sprite would not load
 */
export function Hexen2_LoadEffectSprites( loadModel ) {

	const loaded = [], missing = [];
	for ( const [ typeText, name ] of Object.entries( EFFECT_SPRITES ) ) {

		const type = Number( typeText );
		const model = loadModel( name, true );
		if ( model && model.numframes > 0 ) loaded.push( Object.freeze( { type, name, model } ) );
		else missing.push( type );

	}
	return { loaded: Object.freeze( loaded ), missing: Object.freeze( missing ) };

}
