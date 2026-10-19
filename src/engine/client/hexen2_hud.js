/**
 * @module engine/client/hexen2_hud
 *
 * The Hexen II status-bar data: the player fields the native HUD reads, grouped for the view (health and mana, the
 * four armour pieces, level and experience, inventory and artifacts, puzzle keys, weapon frame and timed effects).
 * Pure reads of the player edict's Hexen field layout; the drawing layer is separate, so the HUD data can be tested
 * without a renderer.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a missing player yields null.
 */

/** The first inventory/puzzle slots the status bar shows, matching the native entvars fields. */
const ARMOUR = Object.freeze( [ 'armor_amulet', 'armor_bracer', 'armor_breastplate', 'armor_helmet' ] );
const TIMED = Object.freeze( [ 'cnt_torch', 'cnt_tome', 'cnt_haste', 'cnt_invisibility', 'cnt_invincibility', 'cnt_flight' ] );
const PUZZLE = Object.freeze( [ 'puzzle_inv1', 'puzzle_inv2', 'puzzle_inv3', 'puzzle_inv4', 'puzzle_inv5', 'puzzle_inv6', 'puzzle_inv7', 'puzzle_inv8' ] );

function number( value ) { return typeof value === 'number' && Number.isFinite( value ) ? value : 0; }

/**
 * The status-bar model for a player.
 *
 * @param {?object} player the client's player edict (its `v` uses the Hexen field layout)
 * @param {function(number): string} [stringAt] the program string reader, to read the puzzle-key names
 * @returns {?object} the HUD data, or null without a player
 */
export function Hexen2_ReadHud( player, stringAt ) {

	if ( ! player || ! player.v ) return null;
	const v = player.v;
	const armour = {};
	for ( const field of ARMOUR ) armour[ field ] = number( v[ field ] );
	const timed = {};
	for ( const field of TIMED ) timed[ field ] = number( v[ field ] );
	const puzzleSlots = [];
	for ( const field of PUZZLE ) {

		const offset = v[ field ] | 0;
		puzzleSlots.push( offset !== 0 && typeof stringAt === 'function' ? stringAt( offset ) : '' );

	}
	return Object.freeze( {
		playerClass: ( v.playerclass | 0 ),
		health: number( v.health ),
		maxHealth: number( v.max_health ),
		manaBlue: number( v.bluemana ),
		manaGreen: number( v.greenmana ),
		maxMana: number( v.max_mana ),
		armour: Object.freeze( armour ),
		level: number( v.level ),
		experience: number( v.experience ),
		intelligence: number( v.intelligence ),
		wisdom: number( v.wisdom ),
		dexterity: number( v.dexterity ),
		strength: number( v.strength ),
		rings: Object.freeze( { ring_flight: number( v.ring_flight ), ring_water: number( v.ring_water ),
			ring_turning: number( v.ring_turning ), ring_regeneration: number( v.ring_regeneration ) } ),
		items: number( v.items ),
		artifactFlags: number( v.artifacts ),
		artifactActive: number( v.artifact_active ),
		inventory: number( v.inventory ),
		puzzle: Object.freeze( puzzleSlots ),
		timed: Object.freeze( timed ),
		weaponModel: typeof v.weaponmodel === 'number' ? v.weaponmodel : 0,
		weaponFrame: number( v.weaponframe ),
		dead: number( v.health ) <= 0,
		onGround: ( ( v.flags | 0 ) & 8 ) !== 0
	} );

}

/**
 * The armour total (native: amulet + bracer + breastplate + helmet).
 *
 * @param {object} hud a HUD from `Hexen2_ReadHud`
 * @returns {number} the sum of the four armour pieces
 */
export function Hexen2_ArmourTotal( hud ) {

	return ARMOUR.reduce( ( total, field ) => total + ( hud.armour[ field ] ?? 0 ), 0 );

}
