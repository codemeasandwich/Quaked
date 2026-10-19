/**
 * @module engine/client/hexen2_statusbar
 *
 * Hexen II's native status-bar top row as a list of drawing operations, ported from the pinned Raven sbar.c
 * (Sbar_Draw, SetChainPosition, CalcAC): the 320-wide bar is centred on wider screens and bottom-anchored at
 * `height - 46`. The list is renderer-agnostic so the existing 2D drawing layer (or a test) can execute it; the
 * expanded lower bar (`+showinfo`) and the inventory rows are not emitted yet.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports; the chain position is the immediate (settled) native target.
 * Errors: none raised.
 */

/** Native armour AC by class: Paladin, Crusader, Necromancer, Assassin, Succubus (sbar.c). */
const AMULET_AC = Object.freeze( [ 8, 4, 2, 6, 6 ] );
const BRACER_AC = Object.freeze( [ 6, 8, 4, 2, 2 ] );
const BREASTPLATE_AC = Object.freeze( [ 2, 6, 8, 4, 4 ] );
const HELMET_AC = Object.freeze( [ 4, 2, 6, 8, 8 ] );

const BAR_TOP_HEIGHT = 46;

/**
 * The native armour class for a player, from sbar.c's CalcAC: each worn piece adds its class AC plus one per 5 points.
 *
 * @param {object} hud a HUD from `Hexen2_ReadHud`
 * @param {number} [classNumber] the class (1..5), defaults to the HUD's class
 * @returns {number} the armour class
 */
export function Hexen2_CalcAC( hud, classNumber = hud.playerClass ) {

	let index = ( classNumber | 0 ) - 1;
	if ( index < 0 || index >= AMULET_AC.length ) index = 0;
	let ac = 0;
	for ( const [ field, table ] of [ [ 'armor_amulet', AMULET_AC ], [ 'armor_bracer', BRACER_AC ],
		[ 'armor_breastplate', BREASTPLATE_AC ], [ 'armor_helmet', HELMET_AC ] ] ) {

		const value = hud.armour[ field ] ?? 0;
		if ( value > 0 ) ac += table[ index ] + Math.floor( value / 5 );

	}
	return ac;

}

/**
 * Builds the native top-row status bar.
 *
 * @param {object} hud a HUD from `Hexen2_ReadHud`
 * @param {{ width?: number, height?: number, barHeight?: number }} [view] the screen; the bar is 320 wide and
 *   bottom-anchored (default 320x200 with the native 46-pixel top row)
 * @returns {ReadonlyArray<{ kind: 'pic'|'transpic'|'small', name?: string, text?: string, x: number, y: number }>}
 *   drawing operations in native paint order, absolute screen coordinates
 */
export function Hexen2_StatusBarOps( hud, view = {} ) {

	const width = view.width ?? 320, height = view.height ?? 200, barHeight = view.barHeight ?? BAR_TOP_HEIGHT;
	const offX = ( width - 320 ) >> 1, baseY = height - barHeight;
	const ops = [];
	const pic = ( name, x, y ) => ops.push( Object.freeze( { kind: 'pic', name, x: x + offX, y: y + baseY } ) );
	const transpic = ( name, x, y ) => ops.push( Object.freeze( { kind: 'transpic', name, x: x + offX, y: y + baseY } ) );
	const small = ( text, x, y ) => ops.push( Object.freeze( { kind: 'small', text, x: x + offX, y: y + baseY } ) );

	pic( 'gfx/topbar1.lmp', 0, 0 );
	pic( 'gfx/topbar2.lmp', 160, 0 );

	const maxMana = Math.max( 0, hud.maxMana | 0 );
	for ( const [ mana, labelX, fillX, fillPic, coverPic ] of [
		[ hud.manaBlue, 201, 190, 'gfx/bmana.lmp', 'gfx/bmanacov.lmp' ],
		[ hud.manaGreen, 243, 232, 'gfx/gmana.lmp', 'gfx/gmanacov.lmp' ] ] ) {

		const value = Math.max( 0, Math.min( maxMana, mana | 0 ) );
		small( String( value ).padStart( 3, '0' ), labelX, 22 );
		if ( value > 0 ) {

			if ( maxMana > 0 ) pic( fillPic, fillX, 26 - Math.round( value * 18 / maxMana ) );
			pic( coverPic, fillX, 27 );

		}

	}

	// HP number, then the native health chain: 195 pixels across, the gem at the (settled) chain position
	const health = Math.max( - 99, hud.health | 0 );
	ops.push( Object.freeze( { kind: 'num', value: health, digits: 3, x: 58 + offX, y: 14 + baseY } ) );
	const chain = hud.maxHealth > 0 ? Math.max( 0, Math.min( hud.maxHealth, hud.health ) ) * 195 / hud.maxHealth : 0;
	transpic( 'gfx/hpchain.lmp', 45 + ( Math.floor( chain ) & 7 ), 38 );
	transpic( 'gfx/hpgem.lmp', 45 + Math.floor( chain ), 36 );
	pic( 'gfx/chnlcov.lmp', 43, 36 );
	pic( 'gfx/chnrcov.lmp', 267, 36 );

	// armour class
	ops.push( Object.freeze( { kind: 'num', value: Hexen2_CalcAC( hud ), digits: 2, x: 105 + offX, y: 14 + baseY } ) );

	return Object.freeze( ops );

}
