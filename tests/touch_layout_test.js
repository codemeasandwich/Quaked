import { Touch_Layout, Touch_WeaponChoices, FOV_PORTRAIT, FOV_LANDSCAPE } from '../src/touch_layout.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function near( a, b, eps, message ) {

	if ( Math.abs( a - b ) > eps ) throw new Error( `${message}: ${a} is not near ${b}` );

}

const screens = [ [ 390, 844 ], [ 844, 390 ], [ 360, 640 ], [ 932, 430 ], [ 768, 1024 ], [ 1180, 820 ] ];

Deno.test( 'every control is on the screen and none overlap', () => {

	for ( const [ w, h ] of screens ) {

		const L = Touch_Layout( w, h );
		const circles = { stick: L.stick, forward: L.forward, fire: L.fire, jump: L.jump, strafe: L.strafe, weapon: L.weapon, pause: L.pause };
		const names = Object.keys( circles );

		for ( const n of names ) {

			const c = circles[ n ];
			assertEqual( c.x - c.r >= 0 && c.x + c.r <= w && c.y - c.r >= 0 && c.y + c.r <= h, true, `${n} on a ${w}x${h} screen` );

		}

		for ( let i = 0; i < names.length; i ++ ) {

			for ( let j = i + 1; j < names.length; j ++ ) {

				const a = circles[ names[ i ] ], b = circles[ names[ j ] ];
				assertEqual( Math.hypot( a.x - b.x, a.y - b.y ) >= a.r + b.r, true, `${names[ i ]} and ${names[ j ]} on ${w}x${h}` );

			}

		}

	}

} );

Deno.test( 'the buttons are an arc around the forward button in the corner', () => {

	for ( const [ w, h ] of screens ) {

		const L = Touch_Layout( w, h );

		// forward is the biggest and the nearest to the bottom right corner
		assertEqual( L.forward.r > L.fire.r && L.fire.r > L.strafe.r, true, 'sizes' );
		for ( const other of [ L.fire, L.strafe, L.weapon ] )
			assertEqual( Math.hypot( w - L.forward.x, h - L.forward.y ) < Math.hypot( w - other.x, h - other.y ), true, 'forward is in the corner' );

		// fire straight above, weapon straight to the left, strafe at 45 degrees between them
		near( L.fire.x, L.forward.x, 0.01, 'fire above' );
		assertEqual( L.fire.y < L.forward.y, true, 'fire higher' );
		near( L.weapon.y, L.forward.y, 0.01, 'weapon beside' );
		assertEqual( L.weapon.x < L.forward.x, true, 'weapon to the left' );
		near( L.forward.x - L.strafe.x, L.forward.y - L.strafe.y, 0.01, 'strafe at 45 degrees' );
		assertEqual( L.strafe.x < L.forward.x && L.strafe.y < L.forward.y, true, 'strafe up and to the left' );

		// jump is on the left, straight above the stick
		near( L.jump.x, L.stick.x, 0.01, 'jump above the stick' );
		assertEqual( L.jump.y < L.stick.y - L.stick.r, true, 'jump higher than the stick' );

		// the stick is on the left
		assertEqual( L.stick.x < w / 2 && L.stick.x > 0, true, 'stick on the left' );

	}

} );

Deno.test( 'portrait has a panel the status bar sits above, landscape does not; the views differ', () => {

	const p = Touch_Layout( 390, 844 );
	assertEqual( p.portrait, true, 'portrait' );
	assertEqual( p.panelHeight > 150 && p.panelHeight < 844 / 2, true, 'a panel of a sensible height: ' + p.panelHeight );
	assertEqual( p.fov, FOV_PORTRAIT, 'portrait view' );
	assertEqual( FOV_PORTRAIT, 100, '100' );

	// all the controls are inside it
	const top = 844 - p.panelHeight;
	for ( const c of [ p.stick, p.forward, p.fire, p.jump, p.strafe, p.weapon ] )
		assertEqual( c.y - c.r >= top, true, 'inside the panel' );

	const l = Touch_Layout( 844, 390 );
	assertEqual( l.portrait, false, 'landscape' );
	assertEqual( l.panelHeight, 0, 'no panel' );
	assertEqual( l.fov, FOV_LANDSCAPE, 'landscape view' );
	assertEqual( FOV_LANDSCAPE, 120, '120' );

} );

Deno.test( 'the safe area keeps the controls off the notch and the home bar', () => {

	const safe = { top: 47, right: 0, bottom: 34, left: 0 };
	const a = Touch_Layout( 390, 844 );
	const b = Touch_Layout( 390, 844, safe );
	assertEqual( b.forward.y, a.forward.y - 34, 'forward is above the home bar' );
	assertEqual( b.pause.y, a.pause.y + 47, 'pause is below the notch' );

	const landscape = Touch_Layout( 844, 390, { top: 0, right: 47, bottom: 21, left: 47 } );
	assertEqual( landscape.stick.x - landscape.stick.r >= 47, true, 'stick clear of the notch' );
	assertEqual( landscape.forward.x + landscape.forward.r <= 844 - 47, true, 'buttons clear of the notch' );

} );

Deno.test( 'the weapon menu offers the weapons held that have ammo', () => {

	// the shotgun, nailgun and rocket launcher, with shells and nails but no rockets
	const items = 4096 | 1 | 4 | 32;
	const c = Touch_WeaponChoices( items, [ 25, 40, 0, 0 ] );
	assertEqual( c.length, 8, 'eight weapons' );

	const by = ( n ) => c.find( ( w ) => w.name === n );
	assertEqual( by( 'Axe' ).usable, true, 'the axe needs no ammo' );
	assertEqual( by( 'Shotgun' ).usable, true, 'shotgun with shells' );
	assertEqual( by( 'Shotgun' ).impulse, 2, 'impulse 2' );
	assertEqual( by( 'Nailgun' ).usable, true, 'nailgun with nails' );
	assertEqual( by( 'Rocket Launcher' ).owned, true, 'holds the rocket launcher' );
	assertEqual( by( 'Rocket Launcher' ).usable, false, 'but no rockets' );
	assertEqual( by( 'Super Shotgun' ).owned, false, 'no super shotgun' );
	assertEqual( by( 'Thunderbolt' ).impulse, 8, 'impulse 8' );
	assertEqual( by( 'Axe' ).ammo, null, 'no ammo count for the axe' );

} );
