/**
 * @module platform/touch
 *
 * Touch controls for phones and tablets: the stick, the buttons and the weapon menu.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `enabled`, `initialized`, `menuOverlay`, `menuTouchCallback`,
 * `fullscreenActivated`, `wakeLock`, `stickTouch`, `stickX`, `stickY`, `forwardHeld`, `lookTouch`, `lastLookPos` and
 * 29 more; 1 module-level collection (Map/Set).
 *
 * Errors: catches at 4 places.
 *
 * The menu callback is injected with `Touch_SetMenuCallback`.
 */
// Touch controls for mobile devices
//
// Landscape: an analog stick on the left and a cluster of buttons on the right. Portrait: the same in a
// panel along the bottom of the screen, with the status bar above it (see touch_layout.js for where
// everything goes).
//
//   stick   up and down aim, left and right turn (touch_strafe 1 makes them sidestep instead)
//   GO      the thumb-size button in the bottom right corner: move forward
//   FIRE    straight above it
//   STRAFE  at 45 degrees up and to the left: while it is held the stick sidesteps instead of turning
//   JUMP    on the left, straight above the stick
//   WEAPON  to its left: the game slows right down, the picture blurs and a menu offers the weapons
//
// Dragging anywhere else on the screen looks around, and so does tilting the device (gyroscope).

import { K_ESCAPE, K_ENTER, K_MOUSE1, Key_Event } from '../engine/client/keys.js';
import { R_BestiaryInputLocked } from '../engine/common/hooks.js'; // installed by newer/ui/r_bestiary.js
import { in_attack, in_jump } from '../engine/client/cl_input.js';
import { S_UnlockAudio } from '../engine/sound/snd_dma.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_Set, Cvar_VariableValue } from '../engine/common/cvar.js';
import { Cbuf_AddText } from '../engine/common/cmd.js';
import { cl } from '../engine/client/client.js';
import { STAT_SHELLS } from '../engine/common/quakedef.js';
import { Touch_Layout, Touch_WeaponChoices } from './touch_layout.js';

// left and right of the stick: 0 turns, 1 sidesteps
export const touch_strafe = new cvar_t( 'touch_strafe', '0' );
// how fast the stick turns and aims, as a multiple of the keyboard's turning speed (at full push)
export const touch_turn = new cvar_t( 'touch_turn', '1.6' );
export const touch_aim = new cvar_t( 'touch_aim', '1.2' );
// how slow the game runs while the weapon menu is open (1 = normal speed)
const SLOWMO = '0.12';

// Touch state
let enabled = false;
let initialized = false;
let menuOverlay = null;
let menuTouchCallback = null;
let fullscreenActivated = false;
let wakeLock = null;

// The stick
let stickTouch = null;
let stickX = 0; // -1 (left) to 1 (right)
let stickY = 0; // -1 (down) to 1 (up)
let forwardHeld = false;

// Look area (the whole screen, behind the controls)
let lookTouch = null;
let lastLookPos = { x: 0, y: 0 };

// Accumulated values for IN_Move
let lookDeltaX = 0;
let lookDeltaY = 0;
let jumpImpulse = false;

// Gyroscope state
let gyroEnabled = false;
let gyroPermissionRequested = false;
let prevBeta = null;
let prevGamma = null;
const GYRO_SENSITIVITY = 8.0;
const LOOK_SENSITIVITY = 3.0;

// UI elements
let overlay = null;
let panel = null;
let lookArea = null;
let stickBase = null;
let stickKnob = null;
let forwardButton = null;
let fireButton = null;
let jumpButton = null;
let strafeButton = null;
let strafeHeld = false;
let weaponButton = null;
let pauseButton = null;
let weaponMenu = null;
let weaponList = null;
let weaponMenuOpen = false;
const bestiaryTouches=new Map();
/**
 * Whether the touch weapon menu is open (the game is slowed and blurred under it). Read by Newer Game's bestiary
 * (r_bestiary.js `R_BestiaryAllowed`), which starts no encounter while it is.
 *
 * @returns {boolean} true from the WEAPON button's press until a weapon is chosen, the menu is tapped outside or the
 *   controls are disabled
 */
export function Touch_WeaponMenuActive(){return weaponMenuOpen;}
let probe = null; // measures the safe area insets
let layout = null;

/*
=================
Touch_IsMobile
=================
*/
/**
 * Detect if we're on a mobile device: a phone or tablet user agent, or more than two touch points (iPadOS reports a
 * desktop agent). Called by in_web.js's `IN_Init` to decide whether to set up the touch controls, and before asking
 * for pointer lock (never on mobile). Evaluated afresh on each call.
 *
 * @returns {boolean|number|undefined} truthy on a mobile device (the agent test's true, or
 *   `navigator.maxTouchPoints > 2`); otherwise falsy: false, or the browser's 0 or undefined `maxTouchPoints`
 */
export function Touch_IsMobile() {

	return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test( navigator.userAgent ) ||
		( navigator.maxTouchPoints && navigator.maxTouchPoints > 2 );

}

const BUTTON_CSS = `
	position: absolute;
	border-radius: 50%;
	background: rgba(24, 14, 8, 0.5);
	border: 2px solid rgba(255, 190, 110, 0.55);
	pointer-events: auto;
	touch-action: none;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	font-family: sans-serif;
	font-weight: bold;
	letter-spacing: 1px;
	color: rgba(255, 225, 180, 0.85);
	user-select: none;
	-webkit-user-select: none;
	-webkit-tap-highlight-color: transparent;
`;

function makeButton( label, glyph ) {

	const b = document.createElement( 'div' );
	b.style.cssText = BUTTON_CSS;
	if ( glyph ) {

		const g = document.createElement( 'div' );
		g.textContent = glyph;
		g.style.cssText = 'font-size: 1.6em; line-height: 1;';
		b.appendChild( g );

	}

	const t = document.createElement( 'div' );
	t.textContent = label;
	t.style.cssText = 'font-size: 0.62em; margin-top: 2px;';
	b.appendChild( t );
	return b;

}

function setCircle( el, c, extra ) {

	const r = c.r + ( extra || 0 );
	el.style.left = ( c.x - r ) + 'px';
	el.style.top = ( c.y - r ) + 'px';
	el.style.width = ( r * 2 ) + 'px';
	el.style.height = ( r * 2 ) + 'px';

}

/*
=================
Touch_ApplyLayout

Puts the controls where the window's shape says (landscape or portrait).
=================
*/
function Touch_ApplyLayout() {

	if ( ! initialized ) return;

	let safe = { top: 0, right: 0, bottom: 0, left: 0 };
	if ( probe !== null && typeof getComputedStyle === 'function' ) {

		const cs = getComputedStyle( probe );
		safe = {
			top: parseFloat( cs.paddingTop ) || 0, right: parseFloat( cs.paddingRight ) || 0,
			bottom: parseFloat( cs.paddingBottom ) || 0, left: parseFloat( cs.paddingLeft ) || 0
		};

	}

	layoutW = window.innerWidth;
	layoutH = window.innerHeight;
	layout = Touch_Layout( layoutW, layoutH, safe );
	const L = layout;

	setCircle( stickBase, L.stick );
	stickKnob.style.width = ( L.stick.r * 0.84 ) + 'px';
	stickKnob.style.height = ( L.stick.r * 0.84 ) + 'px';
	Touch_MoveKnob( stickX, stickY );
	// the touch area of the stick is a good deal bigger than what is drawn
	stickArea.style.left = ( L.stick.x - L.stick.r * 1.5 ) + 'px';
	stickArea.style.top = ( L.stick.y - L.stick.r * 1.5 ) + 'px';
	stickArea.style.width = ( L.stick.r * 3 ) + 'px';
	stickArea.style.height = ( L.stick.r * 3 ) + 'px';

	setCircle( forwardButton, L.forward );
	setCircle( fireButton, L.fire );
	setCircle( jumpButton, L.jump );
	setCircle( strafeButton, L.strafe );
	setCircle( weaponButton, L.weapon );
	setCircle( pauseButton, L.pause );

	forwardButton.style.fontSize = ( L.forward.r * 0.42 ) + 'px';
	fireButton.style.fontSize = ( L.fire.r * 0.42 ) + 'px';
	jumpButton.style.fontSize = ( L.jump.r * 0.45 ) + 'px';
	strafeButton.style.fontSize = ( L.strafe.r * 0.45 ) + 'px';
	weaponButton.style.fontSize = ( L.weapon.r * 0.45 ) + 'px';
	pauseButton.style.fontSize = ( L.pause.r * 0.8 ) + 'px';

	// the portrait layout has a panel to put them on
	panel.style.display = L.portrait ? 'block' : 'none';
	panel.style.height = L.panelHeight + 'px';

	// the weapon menu: two columns in portrait, four across in landscape
	weaponList.style.gridTemplateColumns = L.portrait ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)';

}

let stickArea = null;
let layoutW = 0; // the window the layout was made for
let layoutH = 0;

/*
=================
Touch_CreateUI

Create the touch control UI elements
=================
*/
function Touch_CreateUI( container ) {

	// Main overlay
	overlay = document.createElement( 'div' );
	overlay.id = 'touch-controls';
	overlay.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 200;
		display: none;
		touch-action: none;
	`;

	// measures the safe area (notches, the home bar)
	probe = document.createElement( 'div' );
	probe.style.cssText = 'position: fixed; visibility: hidden; pointer-events: none; padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);';

	// the whole screen looks around when it is dragged
	lookArea = document.createElement( 'div' );
	lookArea.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: auto; touch-action: none;';

	// portrait: the panel the controls sit on
	panel = document.createElement( 'div' );
	panel.style.cssText = 'position: absolute; left: 0; bottom: 0; width: 100%; display: none; pointer-events: none; background: linear-gradient(to bottom, rgba(0,0,0,0), rgba(8,4,2,0.78) 35%);';

	// the stick
	stickBase = document.createElement( 'div' );
	stickBase.style.cssText = 'position: absolute; border-radius: 50%; background: rgba(24, 14, 8, 0.4); border: 2px solid rgba(255, 190, 110, 0.45); pointer-events: none;';
	stickKnob = document.createElement( 'div' );
	stickKnob.style.cssText = 'position: absolute; border-radius: 50%; background: rgba(255, 210, 150, 0.45); border: 2px solid rgba(255, 225, 180, 0.8); pointer-events: none;';
	stickBase.appendChild( stickKnob );
	stickArea = document.createElement( 'div' );
	stickArea.style.cssText = 'position: absolute; border-radius: 50%; pointer-events: auto; touch-action: none;';

	forwardButton = makeButton( 'GO', '▲' );
	fireButton = makeButton( 'FIRE', '●' );
	jumpButton = makeButton( 'JUMP', '⬆' );
	strafeButton = makeButton( 'STRAFE', '⇆' );
	weaponButton = makeButton( 'WEAPON', '⚔' );

	// Pause button (top right corner)
	pauseButton = document.createElement( 'div' );
	pauseButton.style.cssText = BUTTON_CSS + 'border-radius: 8px; flex-direction: row;';
	pauseButton.textContent = '| |';

	// the weapon menu
	weaponMenu = document.createElement( 'div' );
	weaponMenu.id = 'touch-weapons';
	weaponMenu.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: none;
		z-index: 210;
		pointer-events: auto;
		touch-action: none;
		-webkit-backdrop-filter: blur(9px) brightness(0.6) saturate(0.85);
		backdrop-filter: blur(9px) brightness(0.6) saturate(0.85);
		align-items: center;
		justify-content: center;
		flex-direction: column;
		font-family: sans-serif;
		color: #f3dcb4;
	`;
	const title = document.createElement( 'div' );
	title.textContent = 'CHOOSE A WEAPON';
	title.style.cssText = 'font-weight: bold; letter-spacing: 3px; margin-bottom: 14px; font-size: 15px; opacity: 0.85;';
	weaponList = document.createElement( 'div' );
	weaponList.style.cssText = 'display: grid; gap: 10px; width: min(92%, 640px);';
	weaponMenu.appendChild( title );
	weaponMenu.appendChild( weaponList );

	// Assemble UI
	overlay.appendChild( lookArea );
	overlay.appendChild( panel );
	overlay.appendChild( stickBase );
	overlay.appendChild( stickArea );
	overlay.appendChild( forwardButton );
	overlay.appendChild( fireButton );
	overlay.appendChild( jumpButton );
	overlay.appendChild( strafeButton );
	overlay.appendChild( weaponButton );
	overlay.appendChild( pauseButton );

	container.appendChild( probe );
	container.appendChild( overlay );
	container.appendChild( weaponMenu );

	// Create menu navigation overlay
	Touch_CreateMenuUI( container );

}

/*
=================
Touch_CreateMenuUI

Create fullscreen touch area for menu tap-to-select
=================
*/
function Touch_CreateMenuUI( container ) {

	menuOverlay = document.createElement( 'div' );
	menuOverlay.id = 'touch-menu-controls';
	menuOverlay.style.cssText = `
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: none;
		z-index: 199;
		pointer-events: auto;
		touch-action: none;
	`;

	menuOverlay.addEventListener( 'touchstart', ( e ) => {

		e.preventDefault();

		// Unlock audio on first user gesture
		S_UnlockAudio();

		if ( e.touches.length > 0 ) {

			const touch = e.touches[ 0 ];
			const x = touch.clientX;
			const y = touch.clientY;

			// Call the menu touch handler if set
			if ( menuTouchCallback ) {

				menuTouchCallback( x, y, window.innerWidth, window.innerHeight );

			}

		}

	}, { passive: false } );

	container.appendChild( menuOverlay );

}

/*
=================
Touch_MoveKnob

Draws the stick's knob where the stick is pushed (x right, y up, each -1 to 1).
=================
*/
function Touch_MoveKnob( x, y ) {

	if ( stickKnob === null || layout === null ) return;

	const r = layout.stick.r * 0.58;
	stickKnob.style.left = `calc(50% + ${x * r}px)`;
	stickKnob.style.top = `calc(50% + ${- y * r}px)`;
	stickKnob.style.transform = 'translate(-50%, -50%)';

}

const STICK_DEADZONE = 0.12;

function Touch_SetStick( touch ) {

	const c = layout.stick;
	const dx = ( touch.clientX - c.x ) / c.r;
	const dy = ( touch.clientY - c.y ) / c.r;
	const len = Math.hypot( dx, dy );
	const ux = len > 0 ? dx / len : 0;
	const uy = len > 0 ? dy / len : 0;
	const m = Math.min( 1, len );

	Touch_MoveKnob( ux * m, - uy * m );

	// a dead zone in the middle, then the full range
	const out = m < STICK_DEADZONE ? 0 : ( m - STICK_DEADZONE ) / ( 1 - STICK_DEADZONE );
	stickX = ux * out;
	stickY = - uy * out;

}

function Touch_ReleaseStick() {

	stickTouch = null;
	stickX = 0;
	stickY = 0;
	Touch_MoveKnob( 0, 0 );

}

function Touch_Press( el, on ) {

	el.style.background = on ? 'rgba(255, 190, 110, 0.4)' : 'rgba(24, 14, 8, 0.5)';

}

function Touch_Buzz() {

	if ( typeof navigator.vibrate === 'function' ) navigator.vibrate( 40 );

}

/*
=================
Touch event handlers
=================
*/

function onTouchStart( e ) {

	e.preventDefault();
	if(R_BestiaryInputLocked()){
		S_UnlockAudio();for(const touch of e.changedTouches){const key=e.currentTarget===fireButton?K_MOUSE1:K_ENTER;bestiaryTouches.set(touch.identifier,key);Key_Event(key,true,'touch');}return;
	}

	// Unlock audio on first user gesture
	S_UnlockAudio();

	// Request gyroscope permission on first touch (needs user gesture)
	if ( ! gyroPermissionRequested ) {

		Gyro_RequestPermission();

	}

	for ( const touch of e.changedTouches ) {

		const target = e.currentTarget;

		if ( target === stickArea && stickTouch === null ) {

			stickTouch = touch.identifier;
			Touch_SetStick( touch );

		} else if ( target === lookArea && lookTouch === null ) {

			lookTouch = touch.identifier;
			lastLookPos.x = touch.clientX;
			lastLookPos.y = touch.clientY;

		} else if ( target === forwardButton ) {

			forwardHeld = true;
			Touch_Press( forwardButton, true );

		} else if ( target === fireButton ) {

			in_attack.state |= 1 + 2; // down + impulse down
			Touch_Press( fireButton, true );
			Touch_Buzz();

		} else if ( target === jumpButton ) {

			in_jump.state |= 1 + 2; // down + impulse down
			Touch_Press( jumpButton, true );
			Touch_Buzz();

		} else if ( target === strafeButton ) {

			strafeHeld = true;
			Touch_Press( strafeButton, true );
			Touch_Buzz();

		} else if ( target === weaponButton ) {

			Touch_Buzz();
			Touch_OpenWeaponMenu();

		} else if ( target === pauseButton ) {

			// Trigger escape key
			Key_Event( K_ESCAPE, true );
			Key_Event( K_ESCAPE, false );

		}

	}

}

function onTouchMove( e ) {

	e.preventDefault();

	for ( const touch of e.changedTouches ) {

		if ( touch.identifier === stickTouch ) {

			Touch_SetStick( touch );

		} else if ( touch.identifier === lookTouch ) {

			lookDeltaX += ( touch.clientX - lastLookPos.x ) * LOOK_SENSITIVITY;
			lookDeltaY += ( touch.clientY - lastLookPos.y ) * LOOK_SENSITIVITY;

			lastLookPos.x = touch.clientX;
			lastLookPos.y = touch.clientY;

		}

	}

}

function onTouchEnd( e ) {

	e.preventDefault();

	for ( const touch of e.changedTouches ) {
		if(bestiaryTouches.has(touch.identifier)){Key_Event(bestiaryTouches.get(touch.identifier),false,'touch');bestiaryTouches.delete(touch.identifier);continue;}

		const target = e.currentTarget;

		if ( touch.identifier === stickTouch ) {

			Touch_ReleaseStick();

		} else if ( touch.identifier === lookTouch ) {

			lookTouch = null;

		} else if ( target === forwardButton ) {

			forwardHeld = false;
			Touch_Press( forwardButton, false );

		} else if ( target === fireButton ) {

			in_attack.state &= ~1; // up
			in_attack.state |= 4; // impulse up
			Touch_Press( fireButton, false );

		} else if ( target === jumpButton ) {

			in_jump.state &= ~1; // up
			in_jump.state |= 4; // impulse up
			Touch_Press( jumpButton, false );

		} else if ( target === strafeButton ) {

			strafeHeld = false;
			Touch_Press( strafeButton, false );

		} else if ( target === weaponButton ) {

			// (the menu opened when it was pressed)

		}

	}

}

/*
=================
The weapon menu

Tapping the weapon button slows the game right down, blurs the picture and lists the weapons; a tap on one
chooses it (impulse 1-8) and the game speeds up again. A tap anywhere else closes the menu.
=================
*/

function Touch_OpenWeaponMenu() {

	if ( weaponMenuOpen ) return;
	weaponMenuOpen = true;

	// let go of everything that was held
	in_attack.state &= ~1;
	in_attack.state |= 4;
	in_jump.state &= ~1;
	in_jump.state |= 4;
	forwardHeld = false;
	Touch_Press( forwardButton, false );
	Touch_Press( fireButton, false );
	Touch_Press( jumpButton, false );
	strafeHeld = false;
	Touch_Press( strafeButton, false );
	Touch_ReleaseStick();

	const ammo = [ 0, 1, 2, 3 ].map( ( i ) => cl.stats[ STAT_SHELLS + i ] | 0 );
	const choices = Touch_WeaponChoices( cl.items | 0, ammo );

	weaponList.textContent = '';
	for ( const c of choices ) {

		if ( ! c.owned ) continue;

		const card = document.createElement( 'div' );
		card.style.cssText = `
			padding: 14px 8px;
			border-radius: 10px;
			text-align: center;
			font-weight: bold;
			font-size: 15px;
			background: rgba(24, 14, 8, 0.72);
			border: 2px solid rgba(255, 190, 110, ${c.usable ? 0.75 : 0.25});
			opacity: ${c.usable ? 1 : 0.4};
			user-select: none;
			-webkit-user-select: none;
		`;
		card.textContent = c.name;

		if ( c.ammo !== null ) {

			const a = document.createElement( 'div' );
			a.textContent = c.ammo + ' ammo';
			a.style.cssText = 'font-size: 12px; font-weight: normal; margin-top: 4px; opacity: 0.8;';
			card.appendChild( a );

		}

		if ( c.usable ) {

			card.addEventListener( 'touchstart', ( e ) => {

				e.preventDefault();
				e.stopPropagation();
				Cbuf_AddText( 'impulse ' + c.impulse + '\n' );
				Touch_CloseWeaponMenu();

			}, { passive: false } );

		}

		weaponList.appendChild( card );

	}

	weaponMenu.style.display = 'flex';
	Cvar_Set( 'host_timescale', SLOWMO );

}

function Touch_CloseWeaponMenu() {

	if ( ! weaponMenuOpen ) return;
	weaponMenuOpen = false;
	weaponMenu.style.display = 'none';
	Cvar_Set( 'host_timescale', '1' );

}

function onWeaponMenuTouch( e ) {

	e.preventDefault();
	if ( e.target === weaponMenu ) Touch_CloseWeaponMenu();

}

/*
=================
Gyroscope support

Uses deviceorientation with delta tracking. In fullscreen landscape:
- beta changes when tilting left/right = yaw
- gamma changes when tilting up/down = pitch
=================
*/

function onDeviceOrientation( e ) {

	if ( ! enabled ) return;

	const beta = e.beta;   // X-axis tilt: -180 to 180
	const gamma = e.gamma; // Y-axis tilt: -90 to 90

	if ( beta === null || gamma === null ) return;

	if ( prevBeta !== null && prevGamma !== null ) {

		let dBeta = beta - prevBeta;
		let dGamma = gamma - prevGamma;

		// Clamp deltas - ignore large jumps from gimbal lock or axis flips
		if ( dBeta > 10 || dBeta < - 10 ) dBeta = 0;
		if ( dGamma > 10 || dGamma < - 10 ) dGamma = 0;

		// deviceorientation reports values relative to the device's physical
		// axes, NOT the screen orientation. We must check the actual screen
		// angle and remap accordingly.
		const angle = ( screen.orientation && screen.orientation.angle !== undefined )
			? screen.orientation.angle
			: ( window.orientation || 0 );

		let dYaw, dPitch;

		if ( angle === 90 ) {

			// Landscape: top of phone is on the left
			dYaw = dBeta;
			dPitch = - dGamma;

		} else if ( angle === - 90 || angle === 270 ) {

			// Landscape: top of phone is on the right
			dYaw = - dBeta;
			dPitch = dGamma;

		} else {

			// Portrait (0) or upside-down (180)
			dYaw = dGamma;
			dPitch = dBeta;

		}

		lookDeltaX -= dYaw * GYRO_SENSITIVITY;
		lookDeltaY -= dPitch * GYRO_SENSITIVITY;

	}

	prevBeta = beta;
	prevGamma = gamma;

}

async function Gyro_RequestPermission() {

	if ( gyroPermissionRequested ) return;
	gyroPermissionRequested = true;

	// iOS 13+ requires explicit permission request from a user gesture
	if ( typeof DeviceOrientationEvent !== 'undefined' &&
		typeof DeviceOrientationEvent.requestPermission === 'function' ) {

		try {

			const permission = await DeviceOrientationEvent.requestPermission();
			if ( permission === 'granted' ) {

				Gyro_Enable();

			} else {

				console.log( 'Gyroscope permission denied' );

			}

		} catch ( err ) {

			console.log( 'Gyroscope permission error:', err.message );

		}

	} else {

		// Android and older iOS - no permission needed
		Gyro_Enable();

	}

}

function Gyro_Enable() {

	if ( gyroEnabled ) return;
	gyroEnabled = true;
	prevBeta = null;
	prevGamma = null;
	window.addEventListener( 'deviceorientation', onDeviceOrientation );

}

function Gyro_Disable() {

	if ( ! gyroEnabled ) return;
	gyroEnabled = false;
	prevBeta = null;
	prevGamma = null;
	window.removeEventListener( 'deviceorientation', onDeviceOrientation );

}

/*
=================
Wake Lock - prevents screen from dimming while playing
=================
*/

async function Touch_RequestWakeLock() {

	if ( wakeLock !== null ) return;

	if ( 'wakeLock' in navigator ) {

		try {

			wakeLock = await navigator.wakeLock.request( 'screen' );

			wakeLock.addEventListener( 'release', () => {

				wakeLock = null;

			} );

		} catch ( err ) {

			console.log( 'Wake Lock request failed:', err.message );

		}

	}

}

function Touch_ReleaseWakeLock() {

	if ( wakeLock !== null ) {

		wakeLock.release();
		wakeLock = null;

	}

}

/*
=================
Touch_RequestFullscreen
=================
*/
/**
 * Request fullscreen on mobile (the screen may be held either way up; the orientation is not locked): asks for the
 * whole document to go fullscreen, with the WebKit-prefixed call as a fallback. Called by in_web.js from a user
 * gesture on a mobile device (not in the Quest browser). Only the first success counts: later calls do nothing until
 * `Touch_ExitFullscreen` clears the flag. A refusal is logged to the browser console, not thrown.
 *
 * @returns {Promise<void>} settles once the request has been answered
 */
export async function Touch_RequestFullscreen() {

	if ( fullscreenActivated ) return;

	try {

		// Request fullscreen
		const container = document.documentElement;
		if ( container.requestFullscreen ) {

			await container.requestFullscreen();

		} else if ( container.webkitRequestFullscreen ) {

			await container.webkitRequestFullscreen();

		}

		fullscreenActivated = true;

	} catch ( e ) {

		console.log( 'Could not enter fullscreen:', e.message );

	}

}

/*
=================
Touch_ExitFullscreen
=================
*/
/**
 * Exit fullscreen mode, when the main menu's Quit entry is chosen (menu.js, through `M_SetExternals` wired by host.js).
 * Does nothing when the page is not fullscreen. Also unlocks the screen orientation and lets
 * `Touch_RequestFullscreen` ask again. A failure is logged to the browser console, not thrown.
 *
 * @returns {Promise<void>} settles once the exit has been answered
 */
export async function Touch_ExitFullscreen() {

	if ( ! document.fullscreenElement && ! document.webkitFullscreenElement ) return;

	try {

		if ( document.exitFullscreen ) {

			await document.exitFullscreen();

		} else if ( document.webkitExitFullscreen ) {

			await document.webkitExitFullscreen();

		}

		// Unlock orientation
		if ( screen.orientation && screen.orientation.unlock ) {

			screen.orientation.unlock();

		}

		fullscreenActivated = false;

	} catch ( e ) {

		console.log( 'Could not exit fullscreen:', e.message );

	}

}

/*
=================
Touch_Init
=================
*/
/**
 * Initialize touch controls, once, from in_web.js's `IN_Init` on a mobile device: registers the `touch_strafe`,
 * `touch_turn` and `touch_aim` cvars, builds the hidden controls, weapon menu and menu tap overlay, lays them out for
 * the window's shape and safe area, and re-lays them out on `resize` and `orientationchange`. The controls stay
 * hidden until `Touch_Enable`. Later calls do nothing.
 *
 * @param {HTMLElement} [container=document.body] the element the overlays are appended to (in_web.js passes
 *   `document.body`)
 */
export function Touch_Init( container ) {

	if ( initialized ) return;

	Cvar_RegisterVariable( touch_strafe );
	Cvar_RegisterVariable( touch_turn );
	Cvar_RegisterVariable( touch_aim );

	Touch_CreateUI( container || document.body );

	initialized = true;
	Touch_ApplyLayout();

	// turning the device round changes the layout
	window.addEventListener( 'resize', Touch_ApplyLayout );
	window.addEventListener( 'orientationchange', Touch_ApplyLayout );

}

const LISTENED = () => [
	[ stickArea, [ 'touchstart', 'touchmove', 'touchend', 'touchcancel' ] ],
	[ lookArea, [ 'touchstart', 'touchmove', 'touchend', 'touchcancel' ] ],
	[ forwardButton, [ 'touchstart', 'touchend', 'touchcancel' ] ],
	[ fireButton, [ 'touchstart', 'touchend', 'touchcancel' ] ],
	[ jumpButton, [ 'touchstart', 'touchend', 'touchcancel' ] ],
	[ strafeButton, [ 'touchstart', 'touchend', 'touchcancel' ] ],
	[ weaponButton, [ 'touchstart', 'touchend', 'touchcancel' ] ],
	[ pauseButton, [ 'touchstart' ] ]
];

const HANDLER = { touchstart: onTouchStart, touchmove: onTouchMove, touchend: onTouchEnd, touchcancel: onTouchEnd };

/*
=================
Touch_Enable
=================
*/
/**
 * Enable touch controls (show UI, add listeners): shows the stick and buttons, lays them out, listens for their
 * touches and the weapon menu's, turns the gyroscope look back on if its permission was already asked for, and asks
 * for a screen wake lock so the screen does not dim. Called by in_web.js when play starts (`IN_UpdateTouch` each frame
 * while in a connected, non-demo game, and on entering the game). Does nothing before `Touch_Init` or when already
 * enabled.
 */
export function Touch_Enable() {

	if ( ! initialized ) return;
	if ( enabled ) return;

	enabled = true;
	overlay.style.display = 'block';
	Touch_ApplyLayout();

	for ( const [ el, events ] of LISTENED() )
		for ( const ev of events ) el.addEventListener( ev, HANDLER[ ev ], { passive: false } );

	weaponMenu.addEventListener( 'touchstart', onWeaponMenuTouch, { passive: false } );

	// Enable gyroscope if permission was already granted
	if ( gyroPermissionRequested ) {

		Gyro_Enable();

	}

	// Keep screen on while playing
	Touch_RequestWakeLock();

}

/*
=================
Touch_Disable
=================
*/
/**
 * Disable touch controls (hide UI, remove listeners): closes the weapon menu (restoring `host_timescale` 1), hides the
 * controls, removes their listeners, turns the gyroscope off, releases the wake lock and resets the stick, forward
 * button and accumulated look. Called by in_web.js's `IN_UpdateTouch` when a menu, the console or a demo takes over.
 * Does nothing before `Touch_Init` or when not enabled. The fire and jump button states are not cleared here.
 */
export function Touch_Disable() {

	if ( ! initialized || ! enabled ) return;

	Touch_CloseWeaponMenu();

	enabled = false;
	overlay.style.display = 'none';

	for ( const [ el, events ] of LISTENED() )
		for ( const ev of events ) el.removeEventListener( ev, HANDLER[ ev ] );

	weaponMenu.removeEventListener( 'touchstart', onWeaponMenuTouch );

	// Disable gyroscope while controls are off
	Gyro_Disable();

	// Release wake lock when not playing
	Touch_ReleaseWakeLock();

	// Reset state
	lookTouch = null;
	Touch_ReleaseStick();
	forwardHeld = false;
	lookDeltaX = 0;
	lookDeltaY = 0;
	jumpImpulse = false;

}

/*
=================
Touch_IsEnabled
=================
*/
/**
 * Whether the touch game controls are showing and listening (between `Touch_Enable` and `Touch_Disable`). Checked by
 * in_web.js before it reads touch input in `IN_Move` and when it switches the controls each frame.
 *
 * @returns {boolean} true while enabled
 */
export function Touch_IsEnabled() {

	return enabled;

}

/*
=================
Touch_GetMoveInput
=================
*/
/**
 * Is the STRAFE button held (the stick sidesteps rather than turns)? Read by in_web.js's `IN_Move` each frame to
 * decide whether the stick's left and right turn the view.
 *
 * @returns {boolean} true while a finger is on the STRAFE button
 */
export function Touch_StrafeHeld() {

	return strafeHeld;

}

/**
 * The movement input for this frame, read by in_web.js's `IN_Move`, which scales it by `cl_forwardspeed` and
 * `cl_sidespeed`. A new object each call.
 *
 * @returns {{ forward: number, right: number }} `forward` 1 while the GO button is held, else 0; `right` the stick's
 *   sideways push (-1..1, right positive) when it is set to sidestep (`touch_strafe` not 0) or the STRAFE button is
 *   held, else 0
 */
export function Touch_GetMoveInput() {

	return { forward: forwardHeld ? 1 : 0, right: touch_strafe.value !== 0 || strafeHeld ? stickX : 0 };

}

/*
=================
Touch_GetStick
=================
*/
/**
 * The stick's current push, read by in_web.js's `IN_Move` each frame to aim and turn. A new object each call.
 *
 * @returns {{ x: number, y: number }} each -1 to 1 (right and up are positive), with a dead zone in the middle (the
 *   inner 12% of the radius reads 0, the rest is rescaled to the full range); 0, 0 when released
 */
export function Touch_GetStick() {

	return { x: stickX, y: stickY };

}

/*
=================
Touch_GetLookDelta
=================
*/
/**
 * Returns the accumulated look delta since the last call and clears it: screen drags (CSS pixels times 3) and
 * gyroscope turns (degrees times 8, with the sign the screen orientation needs). Read by in_web.js's `IN_Move` each
 * frame; Newer Game's bestiary calls it to throw pending look away.
 *
 * @returns {{ x: number, y: number }} `x` positive to the right (the caller turns yaw by minus it), `y` positive
 *   downwards (the caller adds it to pitch); a new object each call
 */
export function Touch_GetLookDelta() {

	const delta = { x: lookDeltaX, y: lookDeltaY };
	lookDeltaX = 0;
	lookDeltaY = 0;
	return delta;

}

/*
=================
Touch_CheckJump
=================
*/
/**
 * Returns true if jump was triggered since the last call, and clears it. In this version nothing sets the flag (the
 * JUMP button sets `in_jump` directly) and nothing calls this, so it always returns false.
 *
 * @returns {boolean} whether a jump was pending
 */
export function Touch_CheckJump() {

	if ( jumpImpulse ) {

		jumpImpulse = false;
		return true;

	}

	return false;

}

/*
=================
Touch_BottomInset
=================
*/
/**
 * How many CSS pixels of the bottom of the screen the controls take up (the portrait panel), so the status bar can
 * sit above them. Read by gl_screen.js (`SCR_TouchInset`, through `SCR_SetExternals` wired by host.js), which converts
 * it to screen pixels.
 *
 * @returns {number} the portrait panel's height in CSS pixels; 0 in landscape and when the controls are not up
 */
export function Touch_BottomInset() {

	return enabled && layout !== null ? layout.panelHeight : 0;

}

/*
=================
Touch_UpdateFov
=================
*/
let fovAuto = 0; // the value set here, or 0
let fovManaged = true;

/**
 * On a phone, Newer Game starts with a wider view: 100 held upright and 120 on its side (the field of view cvar is
 * left alone once the player has set their own). Called every frame by in_web.js's `IN_UpdateTouch`. Also lays the
 * controls out again when the window changed shape (the device was turned). Outside Newer Game it puts `fov` back to
 * 90 if it still holds the value set here. Once the player's `fov` differs from what this set (or from 90 before it
 * set anything), it stops managing the cvar for the rest of the page's life. Does nothing before `Touch_Init`.
 *
 * @param {boolean} newer whether Newer Game is on (`R_NewerGame()`)
 */
export function Touch_UpdateFov( newer ) {

	if ( ! initialized || layout === null ) return;

	// the window changed shape (the device was turned): lay the controls out again
	if ( window.innerWidth !== layoutW || window.innerHeight !== layoutH ) Touch_ApplyLayout();

	const cur = Cvar_VariableValue( 'fov' );

	if ( ! newer ) {

		// back in New Game: the original view again, if the player had not changed it
		if ( fovAuto !== 0 && cur === fovAuto ) Cvar_Set( 'fov', '90' );
		fovAuto = 0;
		return;

	}

	if ( ! fovManaged ) return;

	if ( ( fovAuto === 0 && cur !== 90 ) || ( fovAuto !== 0 && cur !== fovAuto ) ) {

		fovManaged = false; // the player has their own
		return;

	}

	if ( layout.fov !== fovAuto ) {

		Cvar_Set( 'fov', String( layout.fov ) );
		fovAuto = layout.fov;

	}

}

/*
=================
Touch_ShowMenu
=================
*/
/**
 * Show menu touch overlay: the full-screen layer whose taps go to the menu callback. Called by in_web.js's
 * `IN_UpdateTouch` while a menu is up or a demo plays (a tap then opens the menu). Does nothing before `Touch_Init`.
 */
export function Touch_ShowMenu() {

	if ( ! initialized || ! menuOverlay ) return;

	menuOverlay.style.display = 'block';

}

/*
=================
Touch_HideMenu
=================
*/
/**
 * Hide menu touch overlay, when in_web.js's `IN_UpdateTouch` finds the player in the game or at the console. Does
 * nothing before `Touch_Init`.
 */
export function Touch_HideMenu() {

	if ( ! initialized || ! menuOverlay ) return;

	menuOverlay.style.display = 'none';

}

/*
=================
Touch_SetMenuCallback
=================
*/
/**
 * Set the callback function for menu touch events, once from in_web.js's `IN_Init` (it passes menu.js's
 * `M_TouchInput`). Each touch start on the menu overlay first unlocks audio, then calls it with the first touch.
 * Kept until replaced.
 *
 * @param {?function( number, number, number, number ): *} callback receives (touchX, touchY, screenWidth,
 *   screenHeight): the touch's client position and the window's inner size, all CSS pixels; null stops the calls
 */
export function Touch_SetMenuCallback( callback ) {

	menuTouchCallback = callback;

}
