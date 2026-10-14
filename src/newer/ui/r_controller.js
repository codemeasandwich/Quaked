/**
 * @module newer/ui/r_controller
 *
 * The controller as Quake's re-release has it, item 14 of the add-on effects for every game (card T-3faa98e3,
 * docs/controller-2026-10-14.md): a weapon wheel, button prompts in the menus, and rumble. It extends the existing
 * controller path (src/platform/in_web.js: one controller playing, its own keys released when it goes, menus, local
 * play, XR) and adds nothing that reads the controller apart from it.
 *
 * - **Weapon wheel** (`joy_wheel`; the owner's design of 14 October 2026): hold the left stick's button and a ring of
 *   eight segments opens round the middle of the screen, each with its weapon drawn as grey line art from its own 3D
 *   model (r_wheelicons.js) and, under it, the ammunition it has over the most it can carry; the world behind is
 *   blurred (the status bar is not) and, in single player, slows to a tenth of its speed. Point the right stick at a
 *   segment (it turns blue) and let go to take that weapon (`impulse 1..8`). While it is open the right stick chooses
 *   instead of turning the view; the left stick still moves you. The list is the touch screen's (Touch_WeaponChoices).
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
 * State: no mutable exports; module-level `wheel` (open, the choice, whether the stick pointed, which controller, when
 * it opened and was last looked after), `filter` (the blur on the world's picture), `blurTarget` (tests), `rumble` (what is playing),
 * `lastDamage`, `landed`, `lastTime` and `world` (all forgotten on a new map or when the clock goes back).
 *
 * Errors: none raised here; a controller without rumble simply does not shake.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls, cl_entities, CSHIFT_DAMAGE } from '../../engine/client/client.js';
import { Cbuf_AddText } from '../../engine/common/cmd.js';
import { key_dest, key_game, key_menu, key_lastsource } from '../../engine/client/keys.js';
import { STAT_SHELLS, STAT_NAILS, STAT_ROCKETS, STAT_CELLS, STAT_ACTIVEWEAPON } from '../../engine/common/quakedef.js';
import { Draw_Fill, Draw_String, Draw_GetVirtualWidth, Draw_GetVirtualHeight, Draw_GetOverlayCanvas } from '../../engine/render/gl_draw.js';
import { canvas as worldCanvas } from '../../engine/render/vid.js';
import { realtime, host_framecount } from '../../engine/common/host_state.js';
import { S_AddSoundStarted } from '../../engine/sound/snd_dma.js';
import { Touch_WeaponChoices, TOUCH_WEAPONS } from '../../platform/touch_layout.js';
import { R_NewerGame } from '../mode.js';
import { V_BlastShake } from '../render/v_blastshake.js';
import { R_WheelIcon, R_WheelIconsFrame, R_WheelIconsRelease, ICON_WIDTH, ICON_HEIGHT } from './r_wheelicons.js';

/** The weapon wheel, the menus' button prompts and rumble: 0 off, 1 on (saved; Options, Newer features). */
export const joy_wheel = new cvar_t( 'joy_wheel', '1', true );
export const joy_prompts = new cvar_t( 'joy_prompts', '1', true );
export const joy_rumble = new cvar_t( 'joy_rumble', '1', true );

/** The left stick's button (standard mapping), which holds the wheel open. */
export const WHEEL_BUTTON = 10;
/** How fast the game runs while the wheel is open (single player), and how long it takes to get there (s, real time). */
export const WHEEL_SLOW = 0.1, WHEEL_EASE = 0.15;
/** The blur behind the wheel at its fullest, in CSS pixels for a picture 1080 pixels high. */
export const WHEEL_BLUR = 9;
// the most of each ammunition the player can carry (shells, nails, rockets, cells), as Quake's QuakeC bounds it
const AMMO_MAX = [ 100, 200, 100, 100 ];
const AMMO_NAMES = [ 'SHELLS', 'NAILS', 'ROCKETS', 'CELLS' ];
// "40 / 100"; just the count when an add-on lets the player carry more than Quake's most
const ammoText = ( count, type ) => ( count ?? 0 ) > AMMO_MAX[ type ] ? String( count ) : `${count ?? 0} / ${AMMO_MAX[ type ]}`;
const FONT = '"DIN Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif';
// a wheel no poll has looked after for this long (real time) and this many frames is closed: both, so one long frame
// (a hitch, a slow machine) never closes a wheel that is still held
const STALE = 0.25, STALE_FRAMES = 3;

// `choice`: the place pointed at (or, until the stick points, the weapon in hand); `pointed`: whether the stick has
// pointed since the wheel opened; `opened`, `polled`: real time; `polledFrame`: the host frame of the last poll
const wheel = { open: false, choice: - 1, pointed: false, pad: null, opened: - Infinity, polled: - Infinity, polledFrame: - Infinity };
let filter = '', blurTarget = null;
const stale = () => realtime - wheel.polled > STALE && host_framecount - wheel.polledFrame > STALE_FRAMES;
const rumble = { until: 0, strong: 0, weak: 0, blast: 0 };
let lastDamage = 0, landed = - Infinity, lastTime = null, world = null;

/**
 * Closes the wheel without taking anything: the controller went away or another took over, WebXR began, or the wheel
 * was not looked after this frame (a lock on the controls). The blur goes and the game's speed comes back at once.
 * Called by the controller path (in_web.js), and here.
 */
export function R_ControllerCancel() {

	const was = wheel.open;
	wheel.open = false; wheel.choice = - 1; wheel.pointed = false; wheel.pad = null;
	blur( 0 );
	if ( was ) R_WheelIconsRelease();

}

// how far the wheel has opened, 0..1, eased (real time, so the slowed game does not slow it)
const opening = () => { const t = Math.min( 1, Math.max( 0, ( realtime - wheel.opened ) / WHEEL_EASE ) ); return t * ( 2 - t ); };

// blurs the world's picture (the WebGL canvas: the status bar and the wheel are on the 2D overlay above it)
function blur( amount ) {

	const target = blurTarget ?? worldCanvas;
	const px = amount > 0 ? Math.round( amount * WHEEL_BLUR * ( target?.clientHeight || 1080 ) / 1080 * 10 ) / 10 : 0;
	const next = px > 0 ? `blur(${px}px)` : '';
	if ( next === filter ) return;
	filter = next;
	if ( target?.style ) target.style.filter = next;

}

/**
 * How much the wheel slows the game this frame: 1 while it is closed, easing to `WHEEL_SLOW` over `WHEEL_EASE`
 * seconds of real time once it opens. Called by the host each frame (`_Host_FilterTime`, host.js), which applies it
 * only in single player, as it does `host_timescale`: a network game cannot run at one player's speed. A wheel not
 * looked after for a quarter of a second and three frames is closed here, so the game never stays slow.
 *
 * @returns {number} 0.1..1
 */
export function R_WeaponWheelTimeScale() {

	if ( ! wheel.open ) return 1;
	if ( stale() || ! on( joy_wheel ) ) { R_ControllerCancel(); return 1; }
	return 1 - ( 1 - WHEEL_SLOW ) * opening();

}

/** The CSS filter the wheel puts on the world's picture now ('' none), for tests. */
export function R_WeaponWheelBlur() { return filter; }

/**
 * Tests only: blur this element instead of the game's WebGL canvas (null: the canvas again).
 *
 * @param {?{ style: object, clientHeight: number }} target
 */
export function R_WeaponWheelBlurTarget( target ) { blur( 0 ); blurTarget = target; }

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
	if ( wheel.open && ( stale() || ! gp || wheel.pad !== gp.index + '|' + gp.id ) ) R_ControllerCancel();
	wheel.polled = realtime; wheel.polledFrame = host_framecount;
	const held = !! gp && gp.mapping === 'standard' && !! ( typeof gp.buttons?.[ WHEEL_BUTTON ] === 'object' ? gp.buttons[ WHEEL_BUTTON ].pressed : gp.buttons?.[ WHEEL_BUTTON ] );
	const can = on( joy_wheel ) && key_dest === key_game && ! cls.demoplayback && ! cl.intermission && cl.stats?.[ 0 ] > 0;
	if ( ! wheel.open ) {

		if ( held && can ) {

			// it opens on the weapon in hand
			const active = cl.stats?.[ STAT_ACTIVEWEAPON ] ?? 0;
			Object.assign( wheel, { open: true, choice: TOUCH_WEAPONS.findIndex( w => w.item === active ), pointed: false, pad: gp.index + '|' + gp.id, opened: realtime } );

		}
		return wheel.open;

	}
	if ( ! held || ! can ) {

		// let go: take the weapon pointed at, if it can be used
		const choice = wheel.choice, pointed = wheel.pointed, choices = R_WeaponWheelChoices();
		R_ControllerCancel();
		if ( ! held && can && pointed && choice >= 0 && choices[ choice ]?.usable ) Cbuf_AddText( `impulse ${choices[ choice ].impulse}\n` );
		return false;

	}
	// pointed at: the slot round the circle in the stick's direction (the axe at the top, then clockwise)
	if ( Math.hypot( rx, ry ) > 0.5 ) { wheel.choice = ( Math.round( ( Math.atan2( rx, - ry ) / ( Math.PI * 2 ) ) * 8 ) + 8 ) % 8; wheel.pointed = true; }
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

/** Whether the wheel is open, what it shows chosen, and whether the stick has pointed (for tests and the screen). */
export function R_WeaponWheelState() { return { open: wheel.open, choice: wheel.choice, pointed: wheel.pointed }; }

/**
 * Draws the wheel when it is open, on the 2D overlay at the screen's own pixels (R_WeaponWheelPaint), with the world
 * behind it blurred; takes the blur away when it is not. Called by the screen (gl_screen.js) after the status bar,
 * every frame that is not a cutscene.
 */
export function R_WeaponWheelDraw() {

	if ( wheel.open && stale() ) R_ControllerCancel();
	if ( ! wheel.open || ! on( joy_wheel ) || key_dest !== key_game ) { blur( 0 ); return; }
	const amount = opening();
	blur( amount );
	const overlay = Draw_GetOverlayCanvas(), ctx = overlay?.getContext?.( '2d' );
	if ( ! ctx ) return;
	ctx.save();
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	ctx.globalAlpha = amount;
	R_WheelIconsFrame();
	R_WeaponWheelPaint( ctx, overlay.width, overlay.height, R_WheelIcon );
	ctx.restore();

}

/**
 * Paints the wheel: eight segments of a translucent grey ring round the middle, the axe at the top and on clockwise;
 * in each the weapon's picture (bright when it can be used, dim without ammunition, faint when not had; its name when
 * it has no picture) and under it the ammunition it has over the most that can be carried; the chosen segment blue
 * with a blue edge; in the middle the chosen weapon's name and its ammunition. Exported for tests.
 *
 * @param {CanvasRenderingContext2D} ctx drawn on in its own pixels (no transform)
 * @param {number} width the canvas's size in pixels
 * @param {number} height
 * @param {function(number): ?CanvasImageSource} [iconFor] the picture for a place on the wheel (R_WheelIcon)
 */
export function R_WeaponWheelPaint( ctx, width, height, iconFor = () => null ) {

	// (a little above the middle, so the status bar stays clear below it)
	const outer = Math.min( width, height ) * 0.34, inner = outer * 0.56, cx = width / 2, cy = height * 0.45;
	const step = Math.PI * 2 / 8, choices = R_WeaponWheelChoices();
	const font = ( size, weight = 'bold' ) => `${weight} ${Math.max( 8, Math.round( size ) )}px ${FONT}`;
	const shadow = on => { ctx.shadowColor = on ? 'rgba(0,0,0,0.65)' : 'transparent'; ctx.shadowBlur = on ? outer * 0.02 : 0; };
	for ( let i = 0; i < 8; i ++ ) {

		const mid = - Math.PI / 2 + i * step, a0 = mid - step / 2, a1 = mid + step / 2, chosen = i === wheel.choice;
		ctx.beginPath(); ctx.arc( cx, cy, outer, a0, a1 ); ctx.arc( cx, cy, inner, a1, a0, true ); ctx.closePath();
		if ( chosen ) {

			const glow = ctx.createRadialGradient( cx, cy, inner, cx, cy, outer );
			glow.addColorStop( 0, 'rgba(120,170,240,0.35)' ); glow.addColorStop( 1, 'rgba(70,130,225,0.7)' );
			ctx.fillStyle = glow;

		} else ctx.fillStyle = 'rgba(150,150,150,0.5)';
		ctx.fill();
		if ( chosen ) {

			const edge = outer * 0.035;
			ctx.beginPath(); ctx.arc( cx, cy, outer - edge / 2, a0 + 0.01, a1 - 0.01 );
			ctx.lineWidth = edge; ctx.strokeStyle = '#2f72e0'; ctx.stroke();

		}

	}
	// the ring's rim and the lines between its segments
	ctx.lineWidth = Math.max( 1, outer * 0.012 ); ctx.strokeStyle = 'rgba(40,40,40,0.75)';
	ctx.beginPath(); ctx.arc( cx, cy, outer, 0, Math.PI * 2 ); ctx.stroke();
	ctx.strokeStyle = 'rgba(235,235,235,0.7)';
	for ( let i = 0; i < 8; i ++ ) {

		const a = - Math.PI / 2 + ( i + 0.5 ) * step;
		ctx.beginPath(); ctx.moveTo( cx + Math.cos( a ) * inner, cy + Math.sin( a ) * inner ); ctx.lineTo( cx + Math.cos( a ) * outer, cy + Math.sin( a ) * outer ); ctx.stroke();

	}
	ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc( cx, cy, inner, 0, Math.PI * 2 ); ctx.stroke();
	// each weapon, with its ammunition under it
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	const middle = ( inner + outer ) / 2, boxW = outer * 0.58, boxH = outer * 0.29;
	for ( let i = 0; i < 8; i ++ ) {

		const c = choices[ i ], a = - Math.PI / 2 + i * step, x = cx + Math.cos( a ) * middle, y = cy + Math.sin( a ) * middle;
		const ammoType = TOUCH_WEAPONS[ i ]?.ammo ?? - 1, label = c?.owned && ammoType >= 0 ? ammoText( c.ammo, ammoType ) : null;
		const iconY = label ? y - outer * 0.05 : y, alpha = ctx.globalAlpha;
		ctx.globalAlpha = alpha * ( c?.usable ? 1 : c?.owned ? 0.5 : 0.2 );
		const icon = iconFor( i );
		if ( icon ) {

			const scale = Math.min( boxW / ( icon.width || ICON_WIDTH ), boxH / ( icon.height || ICON_HEIGHT ) );
			const w = ( icon.width || ICON_WIDTH ) * scale, h = ( icon.height || ICON_HEIGHT ) * scale;
			ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
			ctx.drawImage( icon, x - w / 2, iconY - h / 2, w, h );

		} else {

			shadow( true ); ctx.fillStyle = '#ffffff'; ctx.font = font( outer * 0.07 );
			ctx.fillText( ( c?.name ?? '' ).toUpperCase(), x, iconY ); shadow( false );

		}
		if ( label ) {

			shadow( true ); ctx.fillStyle = '#ffffff'; ctx.font = font( outer * 0.08 );
			ctx.fillText( label, x, y + outer * 0.13 ); shadow( false );

		}
		ctx.globalAlpha = alpha;

	}
	// the middle: the chosen weapon's name, and its ammunition
	const c = choices[ wheel.choice ];
	if ( c ) {

		const ammoType = TOUCH_WEAPONS[ wheel.choice ]?.ammo ?? - 1;
		shadow( true ); ctx.fillStyle = '#ffffff'; ctx.font = font( outer * 0.11 );
		// (above and below the crosshair, which stays in the middle)
		ctx.fillText( c.name, cx, cy - outer * 0.1 );
		ctx.font = font( outer * 0.065 ); ctx.fillStyle = 'rgba(255,255,255,0.8)';
		ctx.fillText( ! c.owned ? 'NOT CARRIED' : ammoType >= 0 ? `${AMMO_NAMES[ ammoType ]}  ${ammoText( c.ammo, ammoType )}` : '', cx, cy + outer * 0.1 );
		shadow( false );

	}

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
