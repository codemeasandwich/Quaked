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

// w, h: the window; safe: { top, right, bottom, left } insets of the screen (notches, home bar)
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

// which weapons are on offer for the items and ammo the player has: owned, and with ammo (the axe needs none)
export function Touch_WeaponChoices( items, ammo ) {

	return TOUCH_WEAPONS.map( ( w ) => ( {
		name: w.name,
		impulse: w.impulse,
		owned: ( items & w.item ) !== 0,
		ammo: w.ammo >= 0 ? ammo[ w.ammo ] : null,
		usable: ( items & w.item ) !== 0 && ( w.ammo < 0 || ammo[ w.ammo ] > 0 )
	} ) );

}
