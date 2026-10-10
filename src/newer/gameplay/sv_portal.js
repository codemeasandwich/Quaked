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
import { r_newer_portals } from '../render/r_anim.js';
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

// null = ordinary QC touch; false = overlapping hull, not yet across the
// visible threshold; object = preserve this incoming frame if QC teleports.
// `atObstruction` (optional) reports a hull held short of the threshold by a sill or frame that is not the surface's
// own backing wall; the player then crosses from the projected origin rather than waiting (card [14]).
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

export function SV_RestorePortalReceiver( incoming ) {

	if ( incoming?.receiverOrigin ) incoming.receiver.v.origin = incoming.receiverOrigin;

}

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
