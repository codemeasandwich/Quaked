/**
 * @module engine/client/hexen2_clienthud
 *
 * The HUD model as the network client knows it: the SC1/SC2 stats from `svc_update_inv` (health, mana, armour, level,
 * experience, artefact/ring timers, max values, flags), the class from `svc_updateclass`, the view/weapon fields from
 * `svc_clientdata` and the puzzle-key strings. It matches `Hexen2_ReadHud`'s shape so the same status-bar layout works
 * from a synced client instead of the server edict.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised.
 */

const number = value => typeof value === 'number' && Number.isFinite( value ) ? value : 0;
const PUZZLE = Object.freeze( [ 'puzzle_inv1', 'puzzle_inv2', 'puzzle_inv3', 'puzzle_inv4',
	'puzzle_inv5', 'puzzle_inv6', 'puzzle_inv7', 'puzzle_inv8' ] );

/**
 * Builds a HUD model from a synced client state.
 *
 * @param {object} state a state from `Hexen2_ClientState` after signon and updates
 * @returns {object} the HUD fields, in `Hexen2_ReadHud`'s shape
 */
export function Hexen2_HudFromClientState( state ) {

	const s = state.stats ?? {}, cd = state.clientdata ?? {};
	return Object.freeze( {
		playerClass: state.playerClass | 0,
		health: number( s.health ),
		maxHealth: number( s.max_health ),
		manaBlue: number( s.bluemana ),
		manaGreen: number( s.greenmana ),
		maxMana: number( s.max_mana ),
		armour: Object.freeze( { armor_amulet: number( s.armor_amulet ), armor_bracer: number( s.armor_bracer ),
			armor_breastplate: number( s.armor_breastplate ), armor_helmet: number( s.armor_helmet ) } ),
		level: number( s.level ),
		experience: number( s.experience ),
		intelligence: number( s.intelligence ),
		wisdom: number( s.wisdom ),
		dexterity: number( s.dexterity ),
		strength: number( s.strength ),
		rings: Object.freeze( { ring_flight: number( s.ring_flight ), ring_water: number( s.ring_water ),
			ring_turning: number( s.ring_turning ), ring_regeneration: number( s.ring_regeneration ) } ),
		items: number( s.items ),
		artifactFlags: number( s.artifacts ),
		artifactActive: number( s.artifact_active ),
		inventory: number( s.inventory ),
		cntTorch: number( s.cnt_torch ),
		puzzle: Object.freeze( PUZZLE.map( field => typeof s[ field ] === 'string' ? s[ field ] : '' ) ),
		weaponModel: number( cd.weaponModelIndex ),
		weaponFrame: number( cd.weaponframe ),
		viewHeight: number( cd.viewheight ),
		dead: number( s.health ) <= 0,
		onGround: cd.onGround === true
	} );

}
