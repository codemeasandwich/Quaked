/**
 * @module engine/client/hexen2_effects_bridge
 *
 * Maps Hexen II's `CE_*` client-effect slots onto Quaked's existing advanced effect renderers. This is an adapter, not
 * another effect system: a fire/explosion slot calls `render.js`'s `R_ParticleExplosion`/`R_BlobExplosion`, which are the
 * same Fireball/blob implementations used by Quake's temp-entity path, and an acid slot calls the blob variant.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; an effect without an origin is not bridged.
 */

import { CE } from '../common/hexen2_effectwire.js';

/** The `CE_*` fire/explosion slots the shared Quake Fireball can draw. */
export const HEXEN2_FIRE_EFFECTS = Object.freeze( new Set( [
	CE.SM_CIRCLE_EXP, CE.BG_CIRCLE_EXP, CE.SM_WHITE_FLASH, CE.YELLOWRED_FLASH, CE.SM_BLUE_FLASH,
	CE.SM_EXPLOSION, CE.LG_EXPLOSION, CE.FLOOR_EXPLOSION, CE.BLUE_EXPLOSION, CE.FLOOR_EXPLOSION2,
	CE.XBOW_EXPLOSION, CE.NEW_EXPLOSION, CE.MAGIC_MISSILE_EXPLOSION, CE.BONE_EXPLOSION, CE.BLDRN_EXPL,
	CE.LBALL_EXPL, CE.FBOOM, CE.BOMB, CE.FLOOR_EXPLOSION3
] ) );

/** The `CE_*` smoke slots that reuse Quaked's advanced smoke-trail renderer. */
export const HEXEN2_SMOKE_EFFECTS = Object.freeze( new Set( [ CE.WHITE_SMOKE, CE.GREEN_SMOKE, CE.GREY_SMOKE, CE.RED_SMOKE, CE.SLOW_WHITE_SMOKE, CE.TELESMK1, CE.TELESMK2, CE.GHOST, CE.REDCLOUD ] ) );

/** The `CE_*` flame slots that reuse Quaked's advanced Fireball renderer. */
export const HEXEN2_FLAME_EFFECTS = Object.freeze( new Set( [ CE.FLAMESTREAM, CE.FIREWALL_SMALL, CE.FIREWALL_MEDIUM, CE.FIREWALL_LARGE, CE.FLAMEWALL, CE.FLAMEWALL2, CE.ONFIRE ] ) );

/** The `CE_*` acid/toxic slots the shared Quake blob explosion can draw. */
export const HEXEN2_ACID_EFFECTS = Object.freeze( new Set( [ CE.ACID_EXPL, CE.ACID_SPLAT, CE.ACID_HIT ] ) );

/**
 * The shared renderer call an effect slot should make.
 *
 * @param {?{ type: number, params?: { origin?: ArrayLike<number> } }} effect a server/client effect slot
 * @returns {?{ kind: 'fire'|'acid', origin: number[] }} the adapter decision, or null when the slot is not bridged
 */
export function Hexen2_ExplosionEffect( effect ) {

	const origin = effect?.params?.origin;
	if ( !origin || origin.length < 3 ) return null;
	if ( HEXEN2_FIRE_EFFECTS.has( effect.type ) ) return { kind: 'fire', origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] };
	if ( HEXEN2_FLAME_EFFECTS.has( effect.type ) ) return { kind: 'flame', origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] };
	if ( HEXEN2_SMOKE_EFFECTS.has( effect.type ) ) {

		const velocity = effect.params?.velocity ?? [ 0, 0, 8 ], length = Number( effect.params?.framelength ) || 0.1;
		return { kind: 'smoke', origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ],
			end: [ origin[ 0 ] + ( velocity[ 0 ] ?? 0 ) * length, origin[ 1 ] + ( velocity[ 1 ] ?? 0 ) * length, origin[ 2 ] + ( velocity[ 2 ] ?? 0 ) * length ] };

	}
	if ( HEXEN2_ACID_EFFECTS.has( effect.type ) ) return { kind: 'acid', origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] };
	// Remaining origin-bearing slots use the same shared particle/Fireball renderers; no parallel effect system.
	return { kind: 'fire', origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] };

}

/**
 * Tracks which effect slots have already been bridged. A slot is identified by index and server time, so a reused
 * index with a new effect is bridged again.
 *
 * @returns {{ take: function(number, ?object): ?object, forget: function(number): void, size: function(): number }}
 *   the tracker
 */
export function Hexen2_EffectTracker() {

	const seen = new Map();
	return {
		take( index, effect ) {

			if ( !effect ) { seen.delete( index ); return null; }
			if ( seen.get( index ) === effect.time ) return null;
			seen.set( index, effect.time );
			return Hexen2_ExplosionEffect( effect );

		},
		forget( index ) { seen.delete( index ); },
		size() { return seen.size; }
	};

}
