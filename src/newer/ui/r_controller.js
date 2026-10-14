/**
 * @module newer/ui/r_controller
 *
 * The controller as Quake's re-release has it, item 14 of the add-on effects for every game (card T-3faa98e3,
 * docs/controller-2026-10-14.md): a weapon wheel, button prompts in the menus, and rumble. It extends the existing
 * controller path (src/platform/in_web.js: one controller playing, its own keys released when it goes, menus, local
 * play, XR) and adds nothing that reads the controller apart from it.
 *
 * - **Weapon wheel** (`joy_wheel`): hold the left stick's button and the eight weapons spread round the middle of the
 *   screen, the ones you have bright, those out of ammunition dim, the rest faint; point the right stick at one and
 *   let go to take it (`impulse 1..8`). While it is open the right stick chooses instead of turning the view; the
 *   left stick still moves you, and the game does not pause. The list is the touch screen's (Touch_WeaponChoices).
 * - **Button prompts** (`joy_prompts`): in a menu, while the controller is what you last used, the screen's foot says
 *   what its buttons do there (A select, B back, D-pad move).
 * - **Rumble** (`joy_rumble`): the controller shakes when you are hurt (by how much), when an explosion's blast
 *   reaches you (with the screen shake) and on a hard landing. Never for firing: the shotgun and the lightning gun are
 *   left as they are, and so are the others.
 *
 * Newer Game only; in New Game the controller is exactly as before. Each has its switch (Options, Newer features).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `wheel` (open, the choice, which controller, when last looked after),
 * `rumble` (what is playing), `lastDamage`, `landed`, `lastTime` and `world` (all forgotten on a new map or when the
 * clock goes back), `pictures` (the weapon pictures, made once).
 *
 * Errors: none raised here; a controller without rumble simply does not shake.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls, cl_entities, CSHIFT_DAMAGE } from '../../engine/client/client.js';
import { Cbuf_AddText } from '../../engine/common/cmd.js';
import { key_dest, key_game, key_menu, key_lastsource } from '../../engine/client/keys.js';
import { STAT_SHELLS, STAT_NAILS, STAT_ROCKETS, STAT_CELLS } from '../../engine/common/quakedef.js';
import { Draw_Fill, Draw_String, Draw_TransPic, Draw_PicFromWad, Draw_WithAlpha, Draw_GetVirtualWidth, Draw_GetVirtualHeight } from '../../engine/render/gl_draw.js';
import { S_AddSoundStarted } from '../../engine/sound/snd_dma.js';
import { Touch_WeaponChoices } from '../../platform/touch_layout.js';
import { R_NewerGame } from '../mode.js';
import { V_BlastShake } from '../render/v_blastshake.js';

/** The weapon wheel, the menus' button prompts and rumble: 0 off, 1 on (saved; Options, Newer features). */
export const joy_wheel = new cvar_t( 'joy_wheel', '1', true );
export const joy_prompts = new cvar_t( 'joy_prompts', '1', true );
export const joy_rumble = new cvar_t( 'joy_rumble', '1', true );

/** The left stick's button (standard mapping), which holds the wheel open. */
export const WHEEL_BUTTON = 10;
// the status bar's weapon pictures, by impulse (the axe has none: its name is written)
const PICTURES = [ null, 'inv_shotgun', 'inv_sshotgun', 'inv_nailgun', 'inv_snailgun', 'inv_rlaunch', 'inv_srlaunch', 'inv_lightng' ];
const SHORT = [ 'AXE', 'SG', 'SSG', 'NG', 'SNG', 'GL', 'RL', 'LG' ];

const wheel = { open: false, choice: - 1, pad: null, polled: - Infinity };
const rumble = { until: 0, strong: 0, weak: 0, blast: 0 };
let lastDamage = 0, landed = - Infinity, lastTime = null, world = null;
const pictures = new Map(); // (each weapon picture made once, as the status bar keeps its own)
const picture = name => { if ( ! pictures.has( name ) ) pictures.set( name, Draw_PicFromWad( name ) ); return pictures.get( name ); };

/**
 * Closes the wheel without taking anything: the controller went away or another took over, WebXR began, or the wheel
 * was not looked after this frame (a lock on the controls). Called by the controller path (in_web.js).
 */
export function R_ControllerCancel() { wheel.open = false; wheel.choice = - 1; wheel.pad = null; }

// a new map, a loaded game or the clock going back: nothing from before counts (cl.time starts again from 0)
function fresh( time ) {

	if ( world !== cl.worldmodel || lastTime === null || time < lastTime - 0.5 ) {

		world = cl.worldmodel; rumble.until = 0; rumble.strong = 0; rumble.weak = 0; rumble.blast = 0; landed = - Infinity;
		lastDamage = cl.cshifts?.[ CSHIFT_DAMAGE ]?.percent ?? 0; R_ControllerCancel();

	}
	lastTime = time;

}

const on = cvar => R_NewerGame() && cvar.value > 0;

/**
 * The controller's turn each poll, from the existing controller path (IN_GamepadPoll, in_web.js): opens, steers and
 * closes the weapon wheel, and plays the rumble.
 *
 * @param {?Gamepad} gp the controller playing (null: none)
 * @param {number} rx the right stick's x after its dead zone, -1..1
 * @param {number} ry its y
 * @param {number} time the game's time (`cl.time`)
 * @returns {boolean} whether the right stick is the wheel's this frame (so the view does not turn)
 */
export function R_ControllerPoll( gp, rx, ry, time ) {

	fresh( time );
	if ( gp ) R_ControllerRumble( gp, time );
	// (a wheel not looked after for a while, or held on another controller, is closed and takes nothing)
	if ( wheel.open && ( time - wheel.polled > 0.25 || ! gp || wheel.pad !== gp.index + '|' + gp.id ) ) R_ControllerCancel();
	wheel.polled = time;
	const held = !! gp && gp.mapping === 'standard' && !! ( typeof gp.buttons?.[ WHEEL_BUTTON ] === 'object' ? gp.buttons[ WHEEL_BUTTON ].pressed : gp.buttons?.[ WHEEL_BUTTON ] );
	const can = on( joy_wheel ) && key_dest === key_game && ! cls.demoplayback && ! cl.intermission && cl.stats?.[ 0 ] > 0;
	if ( ! wheel.open ) {

		if ( held && can ) { wheel.open = true; wheel.choice = - 1; wheel.pad = gp.index + '|' + gp.id; }
		return wheel.open;

	}
	if ( ! held || ! can ) {

		// let go: take the weapon pointed at, if it can be used
		const choice = wheel.choice, choices = R_WeaponWheelChoices();
		R_ControllerCancel();
		if ( ! held && can && choice >= 0 && choices[ choice ]?.usable ) Cbuf_AddText( `impulse ${choices[ choice ].impulse}\n` );
		return false;

	}
	// pointed at: the slot round the circle in the stick's direction (the axe at the top, then clockwise)
	if ( Math.hypot( rx, ry ) > 0.5 ) wheel.choice = ( Math.round( ( Math.atan2( rx, - ry ) / ( Math.PI * 2 ) ) * 8 ) + 8 ) % 8;
	return true;

}

/**
 * The eight weapons as the wheel shows them, in impulse order.
 *
 * @returns {Array<{ name: string, impulse: number, owned: boolean, ammo: ?number, usable: boolean }>}
 */
export function R_WeaponWheelChoices() {

	const s = cl.stats ?? [];
	return Touch_WeaponChoices( cl.items ?? 0, [ s[ STAT_SHELLS ] ?? 0, s[ STAT_NAILS ] ?? 0, s[ STAT_ROCKETS ] ?? 0, s[ STAT_CELLS ] ?? 0 ] );

}

/** Whether the wheel is open, and what it points at (for tests and the screen). */
export function R_WeaponWheelState() { return { open: wheel.open, choice: wheel.choice }; }

/**
 * Draws the wheel when it is open: eight places round the middle of the screen, each with the weapon's picture (the
 * axe's name), bright when it can be used, dim without ammunition, faint when not had; the one pointed at framed.
 * Called by the screen (gl_screen.js) after the status bar.
 */
export function R_WeaponWheelDraw() {

	if ( ! wheel.open || ! on( joy_wheel ) || key_dest !== key_game ) return;
	const w = Draw_GetVirtualWidth(), h = Draw_GetVirtualHeight(), cx = w / 2, cy = h / 2 - 12, r = Math.min( 80, h * 0.3 );
	const choices = R_WeaponWheelChoices();
	Draw_Fill( cx - r - 36, cy - r - 20, ( r + 36 ) * 2, ( r + 20 ) * 2, 0, 0.55 );
	for ( let i = 0; i < 8; i ++ ) {

		const a = i / 8 * Math.PI * 2, x = Math.round( cx + Math.sin( a ) * r ), y = Math.round( cy - Math.cos( a ) * r ), c = choices[ i ];
		if ( i === wheel.choice ) Draw_Fill( x - 28, y - 12, 56, 24, c?.usable ? 192 : 72 );
		const alpha = c?.usable ? 1 : c?.owned ? 0.45 : 0.18, pic = PICTURES[ i ] ? picture( PICTURES[ i ] ) : null;
		Draw_WithAlpha( alpha, () => {

			if ( pic ) Draw_TransPic( x - ( pic.width >> 1 ), y - ( pic.height >> 1 ), pic );
			else Draw_String( x - SHORT[ i ].length * 4, y - 4, SHORT[ i ] );

		} );

	}
	const c = choices[ wheel.choice ];
	if ( c ) Draw_String( Math.round( cx - c.name.length * 4 ), Math.round( cy - 4 ), c.name );

}

/**
 * What the button prompts say now: in a menu, while the controller was last used, its buttons there; else null.
 *
 * @returns {?string}
 */
export function R_ControllerPromptText() {

	return on( joy_prompts ) && key_dest === key_menu && key_lastsource === 'pad' ? '(A) Select   (B) Back   (D-pad) Move' : null;

}

/**
 * Draws the button prompts at the foot of a menu while the controller is what was last used. Called by the screen
 * (gl_screen.js) after the menu.
 */
export function R_ControllerPromptsDraw() {

	const text = R_ControllerPromptText();
	if ( ! text ) return;
	const w = Draw_GetVirtualWidth(), h = Draw_GetVirtualHeight();
	Draw_Fill( 0, h - 14, w, 14, 0, 0.6 );
	Draw_String( Math.round( ( w - text.length * 8 ) / 2 ), h - 11, text );

}

/**
 * Notes a sound as it starts: the game's own hard landing (`player/land2.wav`) from the player. Called by the sound
 * system for each sound it plays (S_AddSoundStarted, snd_dma.js).
 *
 * @param {?object} sfx the sound
 * @param {?ArrayLike<number>} origin
 * @param {number} volume
 * @param {number} attenuation
 * @param {number} entnum the entity that made it
 */
export function R_ControllerSound( sfx, origin, volume, attenuation, entnum ) { if ( sfx?.name === 'player/land2.wav' && entnum === cl.viewentity ) landed = cl.time; }
S_AddSoundStarted( R_ControllerSound );

/**
 * Shakes the controller for this frame's events: hurt (the damage flash's rise), an explosion's blast reaching the
 * player (the screen shake's height), a hard landing. Sends the controller a short effect only when the shake rises
 * or is running out, never every frame.
 *
 * @param {Gamepad} gp
 * @param {number} time the game's time
 * @returns {{ strong: number, weak: number }} what it asked for this frame (0 0 when nothing), for tests
 */
export function R_ControllerRumble( gp, time ) {

	const none = { strong: 0, weak: 0 };
	const damage = cl.cshifts?.[ CSHIFT_DAMAGE ]?.percent ?? 0, rise = Math.max( 0, damage - lastDamage );
	lastDamage = damage;
	if ( ! on( joy_rumble ) || cls.demoplayback || key_lastsource !== 'pad' || ! gp?.vibrationActuator?.playEffect ) return none;
	const self = cl_entities[ cl.viewentity ];
	// the blast as the screen shake has it, held over its beats (the shake swings 13 times a second; the rumble follows
	// how strong it is, not each swing)
	const now = self?.origin ? Math.min( 1, Math.abs( V_BlastShake( self.origin )[ 0 ] ) / 2.4 ) : 0;
	// (falling by half every 70 ms, whatever the frame rate)
	rumble.blast = Math.max( now, rumble.blast * 0.5 ** ( Math.max( 0, time - ( rumble.at ?? time ) ) / 0.07 ) ); rumble.at = time;
	const blast = rumble.blast;
	const strong = Math.min( 1, Math.max( rise / 40, blast * 0.9, time - landed >= 0 && time - landed < 0.05 ? 0.5 : 0 ) ), weak = Math.min( 1, Math.max( rise / 25, blast ) );
	if ( strong < 0.05 && weak < 0.05 ) return none;
	if ( time < rumble.until - 0.05 && strong <= rumble.strong && weak <= rumble.weak ) return none; // (already shaking as hard)
	rumble.until = time + 0.12; rumble.strong = strong; rumble.weak = weak;
	try { gp.vibrationActuator.playEffect( 'dual-rumble', { startDelay: 0, duration: 120, strongMagnitude: strong, weakMagnitude: weak } )?.catch?.( () => {} ); } catch {}
	return { strong, weak };

}
