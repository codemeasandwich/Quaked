/**
 * @module newer/ui/r_facegame
 *
 * What the game tells the status-bar face: events choose its expression and where it looks.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `liveWorld`, `demoWorld`, `lastFrame`, `lastWeaponFrame`,
 * `liveEdicts`, `demoFile`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Gameplay adapter: events choose expression/attention; movement never does.
import { FaceState, FaceWaterState, faceWaterStage } from './face_state.js';
import { cl, cls } from '../../engine/client/client.js';
import { r_refdef } from '../../engine/render/render.js';
import { in_attack } from '../../engine/client/cl_input.js';
import { sv, MOVETYPE_NOCLIP } from '../../engine/server/server.js';
import { GetEdictFieldValue } from '../../engine/progs/pr_edict.js';
import { SV_FaceDrain, SV_FaceLocalActive, SV_FaceReset } from '../gameplay/sv_faceevents.js';
import { IT_AXE, IT_QUAD, IT_INVULNERABILITY, IT_INVISIBILITY, IT_SUIT, STAT_HEALTH, STAT_WEAPONFRAME } from '../../engine/common/quakedef.js';
const live = new FaceState(), demo = new FaceState();
const waterVisual=new FaceWaterState();
let liveWorld, demoWorld, lastFrame = -1, lastWeaponFrame = 0;
let liveEdicts, demoFile;
/**
 * Forgets every face state (the live game's, the demo's and the water overlay) and the remembered worlds, so the next
 * use starts fresh. Called by `CL_ClearState` (cl_main.js) whenever the client state is cleared.
 */
export function R_FaceGameReset(){live.reset();demo.reset();waterVisual.reset();liveWorld=demoWorld=liveEdicts=demoFile=undefined;lastFrame=-1;lastWeaponFrame=0;}
function controller( client = cl ) {
	const playback = cls.demoplayback, state = playback ? demo : live;
	if ( playback ? demoWorld !== client.worldmodel || demoFile!==cls.demofile : liveWorld !== client.worldmodel || liveEdicts!==sv.edicts ) {
		state.reset( client.time ); if ( playback ) demoWorld = client.worldmodel; else liveWorld = client.worldmodel;
		if(playback)demoFile=cls.demofile;else liveEdicts=sv.edicts;
		lastFrame = -1; lastWeaponFrame = 0;
	}
	return state;
}
/**
 * The direction of a point from the player, as the face sees it: degrees from where the player looks, positive to the
 * right of the HUD. Quake yaw grows counterclockwise: negate for positive HUD-right angles. Not wrapped (the face wraps
 * it to -180..180).
 *
 * @param {ArrayLike<number>} from the source of the hit or sound, Quake units (world space)
 * @param {ArrayLike<number>} origin the player's position, Quake units
 * @param {ArrayLike<number>} angles the player's view angles in degrees (`[1]` is the yaw)
 * @returns {?number} the angle in degrees, or null when the source is within 1 unit horizontally (no direction)
 */
export function faceImpactAngle( from, origin, angles ) {
	const x = from[ 0 ] - origin[ 0 ], y = from[ 1 ] - origin[ 1 ];
	if ( Math.hypot( x, y ) < 1 ) return null;
	// Quake yaw grows counterclockwise: negate for positive HUD-right angles.
	return - ( Math.atan2( y, x ) * 180 / Math.PI - angles[ 1 ] );
}
/**
 * A damage message reached the client (`V_ParseDamage`, view.js): the face reacts to the hit. In local single player
 * with the native face events, the queued native damage events are used instead (each with its own time, loss and
 * direction, re-timed onto the client clock); otherwise, and always in a demo, the message's own figures are used.
 *
 * @param {number} armor armour lost (0..255, from the message)
 * @param {number} blood health lost (0..255)
 * @param {ArrayLike<number>} from where the damage came from, Quake units (world space)
 * @param {ArrayLike<number>} origin the player's position (`cl_simorg`)
 * @param {ArrayLike<number>} angles the player's view angles in degrees (`cl_simangles`)
 */
export function R_FaceDamage( armor, blood, from, origin, angles ) {
	const state = controller(), events = cls.demoplayback ? [] : SV_FaceDrain( 'damage' );
	if ( events.length ) {
		for ( const event of events ) state.damage( { time: cl.time - Math.max( 0, sv.time - event.time ), receivedTime: cl.time, impactTime: event.time, healthLoss: event.loss, amount: event.amount ?? event.loss,
			angle: event.angle === null ? null : faceImpactAngle( event.source, event.origin, event.viewAngles ) } );
	} else if ( cls.demoplayback || ! SV_FaceLocalActive() ) state.damage( { time: cl.time, healthLoss: blood, amount: armor + blood, angle: faceImpactAngle( from, origin, angles ) } );
}
// An enemy within half the horizontal field of view (plus a margin) of where the player was looking is on screen, and seeing
// it is enough; only one the player cannot see makes the face turn toward its sound. The live horizontal field of view is used
// (it widens on wide screens and for the Newer phone settings); FACE_ALERT_ONSCREEN is the fallback when it is not known.
export const FACE_ALERT_ONSCREEN = 55, FACE_ALERT_MARGIN = 5;
export const faceAlertOnScreenLimit = () => Number.isFinite( r_refdef.fov_x ) && r_refdef.fov_x > 20 && r_refdef.fov_x < 180 ? r_refdef.fov_x / 2 + FACE_ALERT_MARGIN : FACE_ALERT_ONSCREEN;
/**
 * Turns the queued native sight events (an enemy has just noticed the player) into glances, once per HUD frame from
 * `R_PlayerFaceFrame`. Events whose source is on screen (within `faceAlertOnScreenLimit()` degrees of the view) are
 * dropped; the rest are re-timed onto the client clock. Does nothing in a demo. Drains the 'alert' queue.
 *
 * @param {FaceState} state the face to alert
 * @param {{ time: number }} [client=cl] the client state whose `time` (seconds) is the display clock
 */
export function R_FaceAlerts( state, client = cl ) {
	if ( cls.demoplayback ) return;
	const limit = faceAlertOnScreenLimit();
	for ( const event of SV_FaceDrain( 'alert' ) ) {
		if ( ! event.source || ! event.origin || ! event.viewAngles ) continue;
		const angle = faceImpactAngle( event.source, event.origin, event.viewAngles );
		if ( angle === null || Math.abs( ( ( angle + 180 ) % 360 + 360 ) % 360 - 180 ) <= limit ) continue;
		state.alert( { time: client.time - Math.max( 0, sv.time - event.time ), receivedTime: client.time, angle } );
	}
}
/**
 * The player's items changed (`CL_ParseClientdata`, cl_parse.js): a newly gained weapon (or the axe), or a power-up
 * when the native reward events are not running, makes the face grin. Initial spawn inventory is a baseline, not a
 * reward; signon guards that (only once fully signed on, signon 4).
 *
 * @param {number} before the previous `cl.items` bits
 * @param {number} after the new item bits
 */
export function R_FaceInventory( before, after ) {
	// Initial spawn inventory is a baseline, not a reward; signon guards that.
	const powers = SV_FaceLocalActive() ? 0 : IT_QUAD | IT_INVULNERABILITY | IT_INVISIBILITY;
	if ( cls.signon === 4 && ( after & ~before & ( 127 | IT_AXE | powers ) ) ) controller().reward( cl.time );
}
/**
 * A secret was found (svc_foundsecret, cl_parse.js): the face grins, once fully signed on.
 */
export function R_FaceSecret() { if ( cls.signon === 4 ) controller().reward( cl.time ); }
/**
 * The player's health changed (`CL_ParseClientdata`, cl_parse.js). Health transitions must reach the controller even
 * with HUD/console hidden. Dying or respawning clears the water overlay; respawning in a live game also resets the
 * native face events (`SV_FaceReset`).
 *
 * @param {number} health the new health
 */
export function R_FaceHealthChanged( health ) {
	const state = controller(), respawning = state.dead && health > 0;
	if(health<=0 || respawning)waterVisual.reset();
	state.life( health, cl.time );
	if ( respawning && ! cls.demoplayback ) SV_FaceReset();
}
/**
 * The player fired, by the client clock (used by tests; the game feeds shots through the native events and weapon
 * frames in `R_PlayerFaceFrame`).
 *
 * @param {number} [cadence=0.6] seconds between the weapon's shots
 */
export function R_FaceShot( cadence = .6 ) { controller().shot( { time: cl.time, cadence } ); }

/**
 * The drowning overlay for the face, once per HUD frame from `R_PlayerFaceFrame`. Stock native WaterMove refreshes
 * air_finished=time+12 below waterlevel3; CheckPowerups refreshes it while the suit timer is active. Read that clock,
 * never start a second breathing timer or infer head submersion from SU_INWATER. Known only in local single player
 * (not a demo) with the native face events, the player alive and not noclipping.
 *
 * @param {client_state_t} [client=cl] the client state
 * @returns {{ waterPercent: number, waterSubmerged: boolean, waterStage: number, waterVisualStage: number,
 *   waterOpacity: number, waterKnown: boolean }} a new object: how much of the 12 s of air is used (0..100), whether
 *   the head is under water, the overlay stage to draw 0..10 (both stage fields; it drains back after surfacing), the
 *   overlay opacity (always 50), and whether the air clock could be read
 */
export function R_FaceWater(client=cl) {
	const known=client===cl && !cls.demoplayback && SV_FaceLocalActive() && client.worldmodel===sv.worldmodel;
	const p=known?sv.edicts[1]:null,field=p&&GetEdictFieldValue(p,'air_finished');
	let waterPercent=0;
	const waterSubmerged=!!(field && p.v.waterlevel===3 && p.v.health>0 && p.v.movetype!==MOVETYPE_NOCLIP);
	if(waterSubmerged) {
		const air=field.accessor.getFloat(field.ofs);
		if(Number.isFinite(air))waterPercent=Math.max(0,Math.min(100,(12-(air-sv.time))/12*100));
	}
	const stage=waterVisual.frame({time:client.time,epoch:sv.edicts,submerged:waterSubmerged,stage:faceWaterStage(waterPercent,waterSubmerged),enabled:!!(known&&field&&p.v.health>0&&p.v.movetype!==MOVETYPE_NOCLIP)});
	return {waterPercent,waterSubmerged,waterStage:stage,waterVisualStage:stage,waterOpacity:50,waterKnown:!!(known&&field)};
}
/**
 * Everything the status-bar face shows this frame, from `Sbar_Draw`/`Sbar_DrawFace` (sbar.js). Events choose
 * expression/attention; movement never does. Drains the queued native shot, reward and alert events (live games only)
 * into the face state for the current world (a demo has its own state; a new world or demo file resets it). Remote/demo
 * protocols have no native firing hook. A changing nonzero weapon cycle is evidence of activity; merely holding an
 * empty weapon is not.
 *
 * @param {client_state_t} [client=cl] the client state (time, stats, items)
 * @returns {{ look: string, target: string, expression: string, eyeState: string, health: number,
 *   healthPercent: number, strength: boolean, invulnerability: boolean, invisibility: boolean, dead: boolean,
 *   divingSuit: boolean, waterPercent: number, waterSubmerged: boolean, waterStage: number, waterVisualStage: number,
 *   waterOpacity: number, waterKnown: boolean }} a fresh object: `FaceState.frame`'s result, whether the Biosuit is
 *   held, and `R_FaceWater`'s fields
 */
export function R_PlayerFaceFrame( client = cl ) {
	const state = controller( client ), native = ! cls.demoplayback && SV_FaceLocalActive();
	const shots = cls.demoplayback ? [] : SV_FaceDrain( 'shot' );
	for ( const shot of shots ) state.shot( { time: client.time - Math.max( 0, sv.time - shot.time ), receivedTime: client.time, cadence: shot.cadence } );
	if ( ! cls.demoplayback ) for ( const reward of SV_FaceDrain( 'reward' ) ) {
		if ( cls.signon === 4 ) state.reward( client.time - Math.max( 0, sv.time - reward.time ), client.time );
	}
	// Remote/demo protocols have no native firing hook. A changing nonzero weapon
	// cycle is evidence of activity; merely holding an empty weapon is not.
	const weaponFrame = client.stats[ STAT_WEAPONFRAME ];
	if ( ! native && client.time !== lastFrame && weaponFrame > 0 && weaponFrame !== lastWeaponFrame && ! shots.length ) state.shot( { time: client.time, cadence: .6 } );
	lastFrame = client.time; lastWeaponFrame = weaponFrame;
	R_FaceAlerts( state, client );
	return {...state.frame( { time: client.time, health: client.stats[ STAT_HEALTH ],
		attacking: native ? Boolean( in_attack.state & 1 ) : cls.demoplayback ? weaponFrame > 0 : Boolean( in_attack.state & 1 ) || weaponFrame > 0,
		strength: Boolean( client.items & IT_QUAD ), invulnerability: Boolean( client.items & IT_INVULNERABILITY ), invisibility: Boolean( client.items & IT_INVISIBILITY ) } ),divingSuit:Boolean(client.items&IT_SUIT),...R_FaceWater(client)};
}
