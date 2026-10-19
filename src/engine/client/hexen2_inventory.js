/**
 * @module engine/client/hexen2_inventory
 *
 * Hexen II's artifact inventory drawing, ported from the pinned Raven sbar.c (DrawBarArtifactIcon,
 * DrawArtifactInventory, DrawBarArtifactNumber): the selected artifact on the bar with its count, and the six-icon
 * inventory row with the selection highlight. Operations are renderer-agnostic and use the native coordinates
 * relative to the bar top. Canvas execution belongs to the drawing layer.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised.
 */

/** The native entvars fields holding the artifact counts, in artifact-number order (cnt_torch first). */
export const HEXEN2_ARTIFACT_FIELDS = Object.freeze( [
	'cnt_torch', 'cnt_h_boost', 'cnt_sh_boost', 'cnt_mana_boost', 'cnt_teleport', 'cnt_tome', 'cnt_summon',
	'cnt_invisibility', 'cnt_glyph', 'cnt_haste', 'cnt_blast', 'cnt_polymorph', 'cnt_flight', 'cnt_cubeofforce',
	'cnt_invincibility'
] );

/**
 * Reads a player's artifact counts.
 *
 * @param {object} player the player edict
 * @returns {ReadonlyArray<number>} 15 counts, artifact number order
 */
export function Hexen2_ArtifactCounts( player ) {

	const v = player?.v ?? {};
	return Object.freeze( HEXEN2_ARTIFACT_FIELDS.map( field => {

		const value = v[ field ];
		return typeof value === 'number' && Number.isFinite( value ) ? value : 0;

	} ) );

}

const artiName = number => `gfx/arti${String( number ).padStart( 2, '0' )}.lmp`;
const digitName = digit => `gfx/artinum${digit}.lmp`;

function numberOps( ops, x, y, count, offX, baseY ) {

	const push = ( name, nx, ny ) => ops.push( Object.freeze( { kind: 'transpic', name, x: nx + offX, y: ny + baseY } ) );
	if ( count >= 10 ) push( digitName( Math.floor( count / 10 ) % 10 ), x - 4, y );
	push( digitName( count % 10 ), x, y );

}

/**
 * The inventory drawing operations.
 *
 * @param {{ order: ReadonlyArray<number>, count: number, selected: number, startpos: number,
 *   artifacts: ReadonlyArray<number> }} inventory the client's inventory order/list and artifact counts
 * @param {{ width?: number, height?: number, barHeight?: number, open?: boolean }} [view] the screen and whether the
 *   inventory row is open (native `inv_flg`)
 * @returns {ReadonlyArray<object>} operations in native paint order
 */
export function Hexen2_InventoryOps( inventory, view = {} ) {

	const width = view.width ?? 320, height = view.height ?? 200, barHeight = view.barHeight ?? 46;
	const offX = ( width - 320 ) >> 1, baseY = height - barHeight;
	const ops = [];
	const countOf = artifact => inventory.artifacts[ artifact ] ?? 0;
	const icon = ( x, y, artifact ) => {

		ops.push( Object.freeze( { kind: 'transpic', name: artiName( artifact ), x: x + offX, y: y + baseY } ) );
		const count = countOf( artifact );
		if ( count > 0 ) numberOps( ops, x + 20, y + 21, count, offX, baseY );

	};

	if ( inventory.selected >= 0 ) icon( 144, 3, inventory.order[ inventory.selected ] );
	if ( view.open !== true || inventory.count <= 0 ) return Object.freeze( ops );

	// the six-icon row sits above the bar; the selected icon gets the native highlight behind it
	const y = barHeight >= 0 ? - 37 : barHeight - 34;
	for ( let i = 0; i < 6 && i < inventory.count; i ++ ) {

		const x = 64 + i * 33, artifact = inventory.order[ ( inventory.startpos + i ) % inventory.count ];
		if ( ( inventory.startpos + i ) % inventory.count === inventory.selected )
			ops.push( Object.freeze( { kind: 'transpic', name: 'gfx/artisel.lmp', x: x + 9 + offX, y: y - 12 + baseY } ) );
		icon( x, y, artifact );

	}
	return Object.freeze( ops );

}
