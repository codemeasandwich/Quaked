/**
 * @module newer/gameplay/sv_portal
 *
 * Same-level camera portals: the player keeps the rigid transform the portal's picture used, on a teleport QuakeC
 * confirmed.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Same-level camera portals must use the same rigid transform for the player
// that gl_portal uses for its preview. QuakeC still decides whether a touch
// teleports: disabled triggers, events, telefragging and mod redirects stay its
// responsibility. These hooks only correct a confirmed stock destination.
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { r_newer_portals } from '../mode.js';
import { r_portals, R_GetPortals, R_PortalsActive, R_TransformPortalPoint } from '../render/gl_portal.js';
import { PR_GetString } from '../../engine/progs/progs.js';
import { FL_CLIENT, sv, svs } from '../../engine/server/server.js';
import { AngleVectors, DotProduct } from '../../engine/common/mathlib.js';
import { SV_PortalMoveRead } from './sv_portalmotion.js';

const approaches = new WeakMap();

function vector( portal, v ) {

	const e = portal.matrix;
	return [
		e[ 0 ] * v[ 0 ] + e[ 4 ] * v[ 1 ] + e[ 8 ] * v[ 2 ],
		e[ 1 ] * v[ 0 ] + e[ 5 ] * v[ 1 ] + e[ 9 ] * v[ 2 ],
		e[ 2 ] * v[ 0 ] + e[ 6 ] * v[ 1 ] + e[ 10 ] * v[ 2 ]
	];

}

function angles( portal, a ) {

	const f = [], r = [], u = [];
	AngleVectors( a, f, r, u );
	const forward = vector( portal, f ), right = vector( portal, r ), up = vector( portal, u );
	const horizontal = Math.hypot( forward[ 0 ], forward[ 1 ] );
	const yaw = horizontal > 1e-6 ? Math.atan2( forward[ 1 ], forward[ 0 ] ) : Math.atan2( right[ 0 ], - right[ 1 ] );
	return [
		- Math.atan2( forward[ 2 ], horizontal ) * 180 / Math.PI,
		( yaw * 180 / Math.PI + 360 ) % 360,
		horizontal > 1e-6 ? Math.atan2( - right[ 2 ], up[ 2 ] ) * 180 / Math.PI : 0
	];

}

/**
 * First step of a trigger touch (`SV_RunTriggerTouch` in world.js, before QuakeC's touch function runs): decides
 * whether the single-player client touching a stock `trigger_teleport` is crossing a rendered camera portal whose
 * trigger bounds (within 1 unit), target and `info_teleport_destination` (within 1 unit of the portal's `dest`)
 * match. Only active with r_hdr, r_newer_portals and r_portals on and portals present. Chooses the face the player is
 * moving into, and remembers the approach per entity (module WeakMap `approaches`) until the origin crosses the
 * visible plane, the player backs out, or the touch stops qualifying.
 *
 * @param {edict_t} ent the touching entity; only an FL_CLIENT entity can cross
 * @param {edict_t} trigger the touched trigger brush
 * @param {?function(edict_t, Object, number): boolean} [atBackingContact=null] world.js `SV_PortalBackingContact`:
 * true when the hull already touches the portal surface's own backing wall at `distance` Quake units in front of it
 * @param {?function(edict_t, Object, number): boolean} [atObstruction=null] world.js `SV_PortalObstructed`: reports a
 * hull held short of the threshold by a sill or frame that is not the surface's own backing wall; the player then
 * crosses from the projected origin rather than waiting (card [14])
 * @returns {null|false|{ portal: Object, receiver: edict_t, origin: Array<number>, velocity: Array<number>, viewAngles: Array<number>, teleportTime: number }}
 * null = ordinary QC touch; false = overlapping hull, not yet across the visible threshold (the caller skips the
 * touch); object = preserve this incoming frame if QC teleports: the matched portal, its destination edict, and copies
 * of the entry origin (projected onto the threshold when obstructed), velocity (with into-surface speed lost on impact
 * restored at a backing or obstruction contact), view angles (degrees) and `teleport_time`
 */
export function SV_BeginPortalTouch( ent, trigger, atBackingContact = null, atObstruction = null ) {

	if ( svs.maxclients > 1 || Cvar_VariableValue( 'r_hdr' ) === 0 || r_newer_portals.value === 0 || r_portals.value === 0 || ! R_PortalsActive() ||
		( ent.v.flags & FL_CLIENT ) === 0 || PR_GetString( trigger.v.classname ) !== 'trigger_teleport' ) {

		approaches.delete( ent );
		return null;

	}

	// Stock InitTrigger clears both model and modelindex after setmodel. Its
	// retained hull bounds and target still identify the hidden trigger.
	// Named brushes from other progs must also match those physical bounds.
	const model = sv.model_precache?.[ trigger.v.modelindex | 0 ] || PR_GetString( trigger.v.model );
	const target = PR_GetString( trigger.v.target );
	const receiver = sv.edicts?.find( e => e && ! e.free && PR_GetString( e.v.targetname ) === target );
	if ( ! target || ! receiver || PR_GetString( receiver.v.classname ) !== 'info_teleport_destination' ) {

		approaches.delete( ent );
		return null;

	}
	const matching = R_GetPortals().filter( p => ( ! model || p.triggerModel === model ) && p.triggerTarget === target &&
		p.triggerMins.every( ( v, i ) => Math.abs( v - entOffset( trigger, 'mins', i ) ) <= 1 ) &&
		p.triggerMaxs.every( ( v, i ) => Math.abs( v - entOffset( trigger, 'maxs', i ) ) <= 1 ) &&
		Math.hypot( receiver.v.origin[ 0 ] - p.dest[ 0 ], receiver.v.origin[ 1 ] - p.dest[ 1 ],
			receiver.v.origin[ 2 ] - p.dest[ 2 ] ) <= 1 );
	if ( matching.length === 0 ) { approaches.delete( ent ); return null; }
	const beforeImpact = SV_PortalMoveRead( ent, sv.time )?.velocity;

	let approach = approaches.get( ent );
	let portal = approach?.trigger === trigger && matching.includes( approach.portal ) ? approach.portal : null;
	if ( portal && DotProduct( ent.v.velocity, portal.normal ) > 1e-6 ) {

		// Backing out cancels the incoming side; re-entering the opposite face
		// must not inherit an old approach to the same trigger.
		approaches.delete( ent );
		portal = null;

	}
	if ( portal === null ) {

		// Opposite faces can belong to the same trigger. Choose the face the
		// player is actually entering, rather than the first rendered surface.
		let closest = Infinity;
		for ( const p of matching ) {

			const currentSpeed = DotProduct( ent.v.velocity, p.normal );
			if ( currentSpeed >= - 1e-6 && ! ( beforeImpact && Math.abs( currentSpeed ) <= 1e-6 &&
				DotProduct( beforeImpact, p.normal ) < - 1e-6 ) ) continue;
			const distance = Math.abs( DotProduct( ent.v.origin, p.normal ) - DotProduct( p.center, p.normal ) );
			if ( distance < closest ) { closest = distance; portal = p; }

		}

	}
	if ( portal === null ) return null;
	const distance = DotProduct( ent.v.origin, portal.normal ) - DotProduct( portal.center, portal.normal );
	const backing = distance > 0 && atBackingContact && atBackingContact( ent, portal, distance );
	// Held short of the surface by a sill or frame that faces it and cannot be stepped over: no waiting for an origin
	// that can never arrive. The player crosses by camera from the point of their origin projected onto the
	// threshold (a short forward pop, but the view and velocity stay continuous), gated by the receiver clearance as
	// ever; if that is blocked the touch falls to stock QC.
	const obstructed = distance > 0 && ! backing && atObstruction !== null && atObstruction( ent, portal, distance );
	if ( distance > 0 && ! backing && ! obstructed ) {

		approaches.set( ent, { trigger, portal } );
		return false;

	}
	approaches.delete( ent );
	const velocity = Array.from( ent.v.velocity );
	if ( ( backing || obstructed ) && beforeImpact ) {

		const before = DotProduct( beforeImpact, portal.normal );
		const current = DotProduct( velocity, portal.normal );
		if ( before < - 1e-6 && Math.abs( current ) <= 1e-6 ) {

			for ( let i = 0; i < 3; i ++ ) velocity[ i ] += portal.normal[ i ] * ( before - current );

		}

	}
	return {
		portal,
		receiver,
		origin: obstructed ? ent.v.origin.map( ( v, i ) => v - portal.normal[ i ] * distance ) : Array.from( ent.v.origin ),
		velocity,
		viewAngles: Array.from( ent.v.v_angle ),
		teleportTime: ent.v.teleport_time
	};

}

function entOffset( ent, bound, axis ) {

	return ent.v.origin[ axis ] + ent.v[ bound ][ axis ];

}

/**
 * Second step of a trigger touch, still before QuakeC runs: maps the entry origin through the portal to its exit and,
 * when the player's hull fits there, moves the receiver (`info_teleport_destination`) to that exit for the duration of
 * the touch so QC's placement, fog and telefrag happen at the actual lateral exit. The receiver must be put back with
 * `SV_RestorePortalReceiver` (world.js does so in a `finally`).
 *
 * @param {null|false|Object} incoming the result of `SV_BeginPortalTouch`
 * @param {function(Array<number>): boolean} clearAt true when the player's hull is clear at that world-space origin
 * (world.js traces MOVE_NOMONSTERS: stock QC owns telefrags)
 * @returns {?Object} `incoming`, mutated with `exitOrigin` (world space, Quake units) and `receiverOrigin` (the
 * receiver's saved origin); null for an ordinary touch, a hull still short of the threshold, or a blocked exit
 */
export function SV_PreparePortalTouch( incoming, clearAt ) {

	if ( incoming == null || incoming === false ) return null;
	incoming.exitOrigin = R_TransformPortalPoint( incoming.portal, incoming.origin );
	if ( clearAt( incoming.exitOrigin ) !== true ) return null;
	// QC reads the receiver for placement, fog and telefragging. A scoped
	// receiver offset keeps all those effects at the actual lateral exit,
	// rather than telefragging at the old centre before moving the player.
	incoming.receiverOrigin = Array.from( incoming.receiver.v.origin );
	// info_teleport_destination's spawn function has already raised the
	// runtime edict by 27 units; the raw BSP origin used by gl_portal has not.
	incoming.receiver.v.origin = incoming.exitOrigin;
	return incoming;

}

/**
 * Puts the teleport destination back where `SV_PreparePortalTouch` found it, after QuakeC's touch function has run
 * (world.js calls it in a `finally`, whatever the outcome). Does nothing when the receiver was not moved.
 *
 * @param {null|false|Object} incoming the value `SV_PreparePortalTouch` returned
 */
export function SV_RestorePortalReceiver( incoming ) {

	if ( incoming?.receiverOrigin ) incoming.receiver.v.origin = incoming.receiverOrigin;

}

/**
 * Last step of a trigger touch, after QuakeC's touch function: when QC really teleported the player to the prepared
 * exit (a new `teleport_time` later than now and an origin within 1 unit of `exitOrigin`), replaces QC's stock result
 * with the portal's rigid transform: exit origin, velocity and view angles rotated by the portal matrix, `fixangle`
 * set, and `ent._lastTeleportTime` recorded so the legacy launch softener does not halve the kept speed.
 *
 * @param {edict_t} ent the player that touched the trigger; mutated when the crossing is confirmed
 * @param {null|false|Object} incoming the value `SV_PreparePortalTouch` returned
 * @returns {boolean} true when the camera-portal transform was applied; false when there was no prepared crossing,
 * the entity was freed, or QC did not teleport (or sent the player elsewhere)
 */
export function SV_FinishPortalTouch( ent, incoming ) {

	if ( incoming == null || incoming === false || ent.free ) return false;
	const p = incoming.portal;
	// A disabled teleport has no time change; a mod may send the player
	// elsewhere. Neither is an authority to override its outcome.
	if ( ent.v.teleport_time === incoming.teleportTime || ent.v.teleport_time <= sv.time ||
		Math.hypot( ...ent.v.origin.map( ( v, i ) => v - incoming.exitOrigin[ i ] ) ) > 1 ) return false;
	ent.v.origin = incoming.exitOrigin;
	ent.v.velocity = vector( p, incoming.velocity );
	ent.v.v_angle = angles( p, incoming.viewAngles );
	// svc_setangle serializes ent.angles, not v_angle. While fixangle is
	// pending these must carry the full view pitch, not the model's -pitch/3
	// tilt. SV_ClientThink restores the normal body pose after the packet.
	ent.v.angles = Array.from( ent.v.v_angle );
	ent.v.fixangle = 1;
	// Camera portals retain incoming speed. The legacy launch softener must
	// not halve it on the next physics tick. Keep QC's re-entry cooldown.
	ent._lastTeleportTime = ent.v.teleport_time;
	return true;

}
