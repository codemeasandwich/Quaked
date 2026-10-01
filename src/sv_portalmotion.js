// Renderer-independent scope for one client physics call. Physics must not
// import the portal renderer to retain a pre-impact velocity: doing so changes
// the browser startup's circular module evaluation order.
const motions = new WeakMap();

export function SV_PortalMoveStart( ent, time ) {

	const motion = { time, velocity: Array.from( ent.v.velocity ) };
	motions.set( ent, motion );
	return motion;

}

export function SV_PortalMoveEnd( ent, motion ) {

	if ( motions.get( ent ) === motion ) motions.delete( ent );

}

export function SV_PortalMoveRead( ent, time ) {

	const motion = motions.get( ent );
	return motion?.time === time ? motion : null;

}
