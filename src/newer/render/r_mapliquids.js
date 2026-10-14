/**
 * @module newer/render/r_mapliquids
 *
 * A map's own see-through liquids, item 13 of the add-on effects for every game (card T-3faa98e3,
 * docs/small-touches-2026-10-14.md): Quakespasm reads worldspawn `wateralpha`, `slimealpha`, `lavaalpha` and
 * `telealpha` (a leading `_` allowed), and the re-release's own maps, Dimension of the Machine and Arcane Dimensions
 * set them (water .666, slime .75, lava .85, teleporters .666 in 60 of them). In Newer Game the existing treatments of
 * these liquids win, by the owner's rule: water and slime take the Newer liquids' looks, lava is drawn solid with its
 * glow and haze, and teleporters are camera portals. So a map's own value is used for a liquid only while its Newer
 * treatment is switched off (`r_newer_water 0` for water, slime and lava; `r_newer_portals 0` for teleporters). New
 * Game is the original: `r_wateralpha` for every liquid, as always.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `world` and `text` (the map and entity text last read), `keys` (its values,
 * by liquid) and `empty`.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { r_newer_water, r_newer_portals } from '../mode.js';

/** A map's own see-through liquids: 0 off, 1 on (saved; Options, Newer features). */
export const r_mapliquids = new cvar_t( 'r_mapliquids', '1', true );

let world = null, text = null, keys = {}, empty = true;

/** Which liquid a turbulent texture is, by Quake's names: 'lava', 'slime', 'tele' or 'water'. */
export function R_LiquidKindOf( name ) {

	const n = String( name ?? '' ).toLowerCase();
	return n.includes( 'lava' ) ? 'lava' : n.includes( 'slime' ) ? 'slime' : n.includes( 'tele' ) ? 'tele' : 'water';

}

// the map's values, read once per map from its worldspawn (quoted pairs of its first entity)
function read() {

	if ( world === cl.worldmodel && text === cl.worldmodel?.entities ) return;
	world = cl.worldmodel; text = world?.entities ?? null; keys = {};
	const all = text ?? '', end = all.indexOf( '}' ), ws = end > 0 ? all.slice( 0, end ) : '';
	for ( const m of ws.matchAll( /"_?(water|slime|lava|tele)alpha"\s+"([^"]*)"/gi ) ) {

		const v = Number.parseFloat( m[ 2 ] );
		if ( Number.isFinite( v ) ) keys[ m[ 1 ].toLowerCase() ] = Math.min( 1, Math.max( 0, v ) );

	}
	empty = Object.keys( keys ).length === 0;

}

/**
 * The map's own see-through value for a liquid, when it should be used now: in Newer Game, with `r_mapliquids` on,
 * the map setting one for that liquid, and that liquid's Newer treatment switched off. Otherwise null (the caller uses
 * `r_wateralpha`, as always).
 *
 * @param {string} name the liquid's texture name ('*lava1', '*teleport', '*04water1' ...)
 * @returns {?number} 0..1, or null
 */
export function R_MapLiquidAlpha( name ) {

	if ( ! ( r_mapliquids.value > 0 ) || ! cl.worldmodel ) return null;
	read();
	if ( empty ) return null; // (most maps: no keys, nothing to look up per surface)
	const kind = R_LiquidKindOf( name ), v = keys[ kind ];
	if ( v === undefined ) return null;
	if ( kind === 'tele' ? r_newer_portals.value !== 0 : r_newer_water.value !== 0 ) return null; // (the Newer treatment wins)
	return v;

}

/**
 * Whether any liquid of this map is drawn see-through by its own value now (so the translucent liquid pass runs).
 *
 * @returns {boolean}
 */
export function R_MapLiquidAlphaAny() {

	if ( ! ( r_mapliquids.value > 0 ) || ! cl.worldmodel ) return false;
	read();
	return [ 'water', 'slime', 'lava', 'tele' ].some( k => keys[ k ] !== undefined && keys[ k ] < 1 && R_MapLiquidAlpha( '*' + k ) !== null );

}
