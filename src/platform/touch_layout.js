/**
 * @module platform/touch_layout
 *
 * Where the touch controls go on the screen: pure geometry, tested on its own.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Where the touch controls go. Pure geometry (CSS pixels from the top left), so it can be tested.
//
// Landscape: the stick on the left, the buttons on the right.
// Portrait: the same two groups in a panel along the bottom, with the status bar on top of it.
//
// The buttons are an arc around the forward button, a thumb-size circle in the bottom right corner
// where the thumb rests: fire is straight above it, strafe at 45 degrees up and to the left, and
// change weapon to its left.  Jump is on the left, straight above the stick.

export const FOV_PORTRAIT = 100;
export const FOV_LANDSCAPE = 120;

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

/**
 * Lays out the touch controls for a window size (pure geometry, CSS pixels from the top left). Called by touch.js
 * `Touch_ApplyLayout` when the touch controls start and whenever the window is resized or rotated, and by the tests.
 *
 * Portrait when the window is taller than wide. Sizes scale with the shorter side (`min(w, h) / 400`, clamped to
 * 0.85..1.3) and keep a 24-pixel (scaled) margin inside the safe area. Forward sits in the bottom right corner with
 * fire straight above it, strafe at 45 degrees up and to the left and change weapon to its left; the stick is in the
 * bottom left with jump straight above it; pause is in the top right corner.
 *
 * @param {number} w window width, CSS pixels
 * @param {number} h window height, CSS pixels
 * @param {{ top: number, right: number, bottom: number, left: number }} [safe] insets of the screen (notches, home
 *   bar), CSS pixels; all 0 when omitted
 * @returns {{ portrait: boolean, scale: number, panelHeight: number, fov: number, stick: { x: number, y: number,
 *   r: number }, forward: { x: number, y: number, r: number }, fire: { x: number, y: number, r: number }, jump: { x:
 *   number, y: number, r: number }, strafe: { x: number, y: number, r: number }, weapon: { x: number, y: number, r:
 *   number }, pause: { x: number, y: number, r: number } }} each control as a circle (centre `x`, `y` and radius `r`,
 *   CSS pixels); `panelHeight` is the height of the portrait panel, from the top of the highest button (plus 14
 *   scaled pixels) to the bottom of the screen, or 0 in landscape; `fov` is `FOV_PORTRAIT` (100) or `FOV_LANDSCAPE`
 *   (120) degrees; `scale` is the size factor used
 */
export function Touch_Layout( w, h, safe ) {

	const inset = safe || { top: 0, right: 0, bottom: 0, left: 0 };
	const portrait = w < h;
	const s = clamp( Math.min( w, h ) / 400, 0.85, 1.3 );

	const m = 24 * s; // margin to the screen edge
	const gap = 10 * s;
	const rStick = 64 * s;
	const rForward = 46 * s;
	const rFire = 38 * s;
	const rJump = 32 * s;
	const rWeapon = 32 * s;

	const fx = w - inset.right - m - rForward;
	const fy = h - inset.bottom - m - rForward;
	const side = ( rForward + rJump + gap + 6 * s ) * Math.SQRT1_2;

	const forward = { x: fx, y: fy, r: rForward };
	const fire = { x: fx, y: fy - ( rForward + rFire + gap ), r: rFire };
	const strafe = { x: fx - side, y: fy - side, r: rJump };
	const weapon = { x: fx - ( rForward + rWeapon + gap ), y: fy, r: rWeapon };
	const stick = { x: inset.left + m + rStick, y: h - inset.bottom - m - rStick, r: rStick };
	const jump = { x: stick.x, y: stick.y - ( stick.r + rJump + gap ), r: rJump };
	const pause = { x: w - inset.right - m - 20 * s, y: inset.top + m + 20 * s, r: 20 * s };

	// the panel of the portrait layout: from the top of the highest button to the bottom of the screen
	let panelHeight = 0;
	if ( portrait ) {

		const top = Math.min( fire.y - fire.r, strafe.y - strafe.r, jump.y - jump.r, stick.y - stick.r );
		panelHeight = Math.round( h - top + 14 * s );

	}

	return {
		portrait, scale: s, panelHeight,
		fov: portrait ? FOV_PORTRAIT : FOV_LANDSCAPE,
		stick, forward, fire, jump, strafe, weapon, pause
	};

}

// the 8 weapons in the order of their impulses: name, the items bit, the impulse and which ammo they use
// (0 shells, 1 nails, 2 rockets, 3 cells; -1 none)
export const TOUCH_WEAPONS = [
	{ name: 'Axe', item: 4096, impulse: 1, ammo: - 1 },
	{ name: 'Shotgun', item: 1, impulse: 2, ammo: 0 },
	{ name: 'Super Shotgun', item: 2, impulse: 3, ammo: 0 },
	{ name: 'Nailgun', item: 4, impulse: 4, ammo: 1 },
	{ name: 'Super Nailgun', item: 8, impulse: 5, ammo: 1 },
	{ name: 'Grenade Launcher', item: 16, impulse: 6, ammo: 2 },
	{ name: 'Rocket Launcher', item: 32, impulse: 7, ammo: 2 },
	{ name: 'Thunderbolt', item: 64, impulse: 8, ammo: 3 }
];

/**
 * Which weapons are on offer for the items and ammo the player has: owned, and with ammo (the axe needs none). Called
 * by touch.js `Touch_OpenWeaponMenu` when the change-weapon menu opens, with `cl.items` and the four ammo stats.
 *
 * @param {number} items the player's item bits (`cl.items`; the `IT_*` weapon bits as in `TOUCH_WEAPONS`)
 * @param {ArrayLike<number>} ammo counts by ammo type: 0 shells, 1 nails, 2 rockets, 3 cells
 * @returns {Array<{ name: string, impulse: number, owned: boolean, ammo: ?number, usable: boolean }>} one entry per
 *   weapon in impulse order (1..8): `ammo` is its ammo count (null for the axe), `usable` is owned with ammo
 */
export function Touch_WeaponChoices( items, ammo ) {

	return TOUCH_WEAPONS.map( ( w ) => ( {
		name: w.name,
		impulse: w.impulse,
		owned: ( items & w.item ) !== 0,
		ammo: w.ammo >= 0 ? ammo[ w.ammo ] : null,
		usable: ( items & w.item ) !== 0 && ( w.ammo < 0 || ammo[ w.ammo ] > 0 )
	} ) );

}
