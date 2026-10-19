/**
 * @module engine/client/hexen2_status
 *
 * The Hexen II status bar's data side: the native picture names the bar is composed from, a loader that proves each
 * one is present and readable in the supplied data through the port's existing picture cache, and the bindings from
 * the HUD model to the values the bar shows. The pixel layout/drawing is a separate concern and is not claimed here.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised; a picture that will not load is reported in the `missing` list.
 */

/** The supplied status-bar pictures (named exactly as in the Hexen II paks). */
export const HEXEN2_STATUS_ASSETS = Object.freeze( [
	'gfx/hpchain.lmp', 'gfx/hpgem.lmp', 'gfx/bmana.lmp', 'gfx/gmana.lmp', 'gfx/bmanacov.lmp', 'gfx/gmanacov.lmp',
	'gfx/chnlcov.lmp', 'gfx/chnrcov.lmp', 'gfx/topbar1.lmp', 'gfx/topbar2.lmp', 'gfx/btmbar1.lmp', 'gfx/btmbar2.lmp',
	'gfx/armor1.lmp', 'gfx/armor2.lmp', 'gfx/armor3.lmp', 'gfx/armor4.lmp',
	'gfx/ring_f.lmp', 'gfx/ring_w.lmp', 'gfx/ring_t.lmp', 'gfx/ring_r.lmp',
	'gfx/cport1.lmp', 'gfx/cport4.lmp', 'gfx/castle.lmp', 'gfx/arti00.lmp', 'gfx/arti01.lmp', 'gfx/arti02.lmp',
	'gfx/arti03.lmp', 'gfx/arti04.lmp', 'gfx/arti05.lmp', 'gfx/arti06.lmp', 'gfx/arti07.lmp', 'gfx/arti08.lmp',
	'gfx/arti09.lmp', 'gfx/arti10.lmp', 'gfx/arti11.lmp', 'gfx/arti12.lmp', 'gfx/arti13.lmp', 'gfx/arti14.lmp'
] );

/**
 * Loads every status-bar picture through the existing picture cache.
 *
 * @param {function(string): ?object} loadPic the port's Draw_CachePic
 * @returns {{ loaded: ReadonlyArray<{ name: string, width: number, height: number }>,
 *   missing: ReadonlyArray<string> }} the readable pictures and the names that would not load
 */
export function Hexen2_LoadStatusAssets( loadPic ) {

	const loaded = [], missing = [];
	for ( const name of HEXEN2_STATUS_ASSETS ) {

		let pic = null;
		try { pic = loadPic( name ); } catch ( error ) { pic = null; }
		if ( pic && pic.width > 0 && pic.height > 0 )
			loaded.push( Object.freeze( { name, width: pic.width, height: pic.height } ) );
		else missing.push( name );

	}
	return { loaded: Object.freeze( loaded ), missing: Object.freeze( missing ) };

}

/**
 * The status bar's value bindings from the HUD model.
 *
 * @param {object} hud a HUD from `Hexen2_ReadHud`
 * @returns {object} the values the bar shows: health/max, mana, armour pieces, the set artifact icon indices, puzzle
 *   slots, weapon frame, level/experience and class
 */
export function Hexen2_StatusBindings( hud ) {

	const artifactBits = [];
	for ( let bit = 0; bit < 15; bit ++ ) if ( ( ( hud.artifactFlags | 0 ) >> bit ) & 1 ) artifactBits.push( bit );
	return Object.freeze( {
		classNumber: hud.playerClass,
		health: hud.health,
		maxHealth: hud.maxHealth,
		manaBlue: hud.manaBlue,
		manaGreen: hud.manaGreen,
		maxMana: hud.maxMana,
		armour: hud.armour,
		artifactIcons: Object.freeze( artifactBits ),
		puzzle: hud.puzzle,
		weaponFrame: hud.weaponFrame,
		level: hud.level,
		experience: hud.experience,
		dead: hud.dead
	} );

}
