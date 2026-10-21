/**
 * @module newer/render/r_slipgate
 *
 * Authored slipgate machines keep their panels and swirl instead of acquiring a destination picture.
 * Uses local material and frame geometry, never map names or an active-game toggle.
 */
const MACHINE_TEXTURE = /^(\+.)?slip/i;
const FRAME_REACH = 24;

function surfacePoints( model, surf ) {

	const points = [];
	if ( surf.polys ) {

		for ( let p = surf.polys; p; p = p.next ) for ( let i = 0; i < p.numverts; i ++ )
			points.push( p.verts instanceof Float32Array ? p.verts.subarray( i * 7, i * 7 + 3 ) : p.verts[ i ] );

	} else for ( let i = 0; i < surf.numedges; i ++ ) {

		const edge = model.surfedges[ surf.firstedge + i ], e = model.edges[ Math.abs( edge ) ];
		points.push( model.vertexes[ e.v[ edge > 0 ? 0 : 1 ] ].position );

	}
	return points;

}

/**
 * Faces whose material actually exists at its BSP position: world and unshifted static walls only. Moving brushes
 * and inhibited entities cannot supply a machine frame. Shared by camera construction and seamless setup.
 *
 * @param {Object} model brush model
 * @param {Array<Object>} entities parsed BSP entities
 * @param {function(Object): boolean} inhibited whether the game leaves an entity out
 * @returns {Array<Object>} eligible world/static-wall surfaces
 */
export function R_PortalSurfaces( model, entities, inhibited ) {

	const first = model.firstmodelsurface || 0;
	const faces = model.surfaces.slice( first, first + ( model.nummodelsurfaces || model.surfaces.length ) );
	for ( const ent of entities ) {

		if ( ( ent.classname !== 'func_wall' && ent.classname !== 'func_illusionary' ) || ent.model?.charAt( 0 ) !== '*' || ent.origin != null || inhibited( ent ) ) continue;
		const sub = model.submodels?.[ parseInt( ent.model.substring( 1 ), 10 ) ];
		if ( sub?.numfaces > 0 ) for ( let i = sub.firstface; i < sub.firstface + sub.numfaces; i ++ ) faces.push( model.surfaces[ i ] );

	}
	return faces.filter( Boolean );

}

function covered( intervals, low, high ) {

	intervals.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
	let total = 0, end = low;
	for ( const [ a, b ] of intervals ) {

		const start = Math.max( a, end, low ), stop = Math.min( b, high );
		if ( stop > start ) total += stop - start;
		end = Math.max( end, stop );

	}
	return total >= ( high - low ) * .5;

}

/**
 * Reads a face's world-space bounds before or after render polygons have been built. Seamless setup runs on the
 * server's BSP, whereas camera portals run on its rendered counterpart; both must recognise the same frame.
 *
 * @param {Object} model brush model
 * @param {Object} surf face in that model
 * @returns {{mins: Array<number>, maxs: Array<number>}} bounds in Quake units
 */
function surfaceBounds( model, surf ) {

	const mins = [ Infinity, Infinity, Infinity ], maxs = [ - Infinity, - Infinity, - Infinity ];
	for ( const v of surfacePoints( model, surf ) ) for ( let a = 0; a < 3; a ++ ) {

		mins[ a ] = Math.min( mins[ a ], v[ a ] ); maxs[ a ] = Math.max( maxs[ a ], v[ a ] );

	}
	return { mins, maxs };

}

/**
 * Is an upright aperture part of an authored slip machine? A solid slip-family panel is the machine itself.
 * A swirl aperture needs slip-family framing along BOTH opposing sides or top and bottom, within 24 units of its
 * plane and edges and covering at least half each edge. A nearby decorative panel alone is insufficient. Unknown
 * materials retain their existing portal behaviour; scale alone cannot distinguish a machine from a doorway.
 *
 * @param {Object} model brush model
 * @param {Array<Object>} surfaces the opening's coplanar faces
 * @param {Array<number>} mins opening minimum
 * @param {Array<number>} maxs opening maximum
 * @param {Array<number>} normal outward unit normal
 * @param {Array<Object>} frames eligible static frame surfaces from `R_PortalSurfaces`
 * @returns {boolean} true for a machine panel or a locally framed machine aperture
 */
export function R_IsSlipgateOpening( model, surfaces, mins, maxs, normal, frames ) {

	if ( surfaces.some( s => MACHINE_TEXTURE.test( s.texinfo?.texture?.name ?? '' ) ) ) return true;
	if ( Math.abs( normal[ 2 ] ) > .01 ) return false;
	const tangent = [ - normal[ 1 ], normal[ 0 ], 0 ];
	const project = ( points, axis ) => points.map( p => p.reduce( ( sum, v, a ) => sum + v * axis[ a ], 0 ) );
	const opening = surfaces.flatMap( s => surfacePoints( model, s ) );
	const horizontal = project( opening, tangent ), depth = project( opening, normal );
	const left = Math.min( ...horizontal ), right = Math.max( ...horizontal );
	if ( right - left < 40 || maxs[ 2 ] - mins[ 2 ] < 48 ) return false;
	const sides = [ [], [], [], [] ];
	for ( const surf of frames ) {

		if ( ! MACHINE_TEXTURE.test( surf.texinfo?.texture?.name ?? '' ) ) continue;
		const box = surfaceBounds( model, surf ), points = surfacePoints( model, surf );
		const ds = project( points, normal );
		if ( Math.min( ...ds ) > Math.max( ...depth ) + FRAME_REACH || Math.max( ...ds ) < Math.min( ...depth ) - FRAME_REACH ) continue;
		const ts = project( points, tangent ), lo = Math.min( ...ts ), hi = Math.max( ...ts );
		// Union the edge intervals: BSP cuts one frame into many faces, and repeated/back faces must not add coverage.
		if ( Math.abs( hi - left ) <= FRAME_REACH && lo < left ) sides[ 0 ].push( [ box.mins[ 2 ], box.maxs[ 2 ] ] );
		if ( Math.abs( lo - right ) <= FRAME_REACH && hi > right ) sides[ 1 ].push( [ box.mins[ 2 ], box.maxs[ 2 ] ] );
		if ( Math.abs( box.maxs[ 2 ] - mins[ 2 ] ) <= FRAME_REACH && box.mins[ 2 ] < mins[ 2 ] ) sides[ 2 ].push( [ lo, hi ] );
		if ( Math.abs( box.mins[ 2 ] - maxs[ 2 ] ) <= FRAME_REACH && box.maxs[ 2 ] > maxs[ 2 ] ) sides[ 3 ].push( [ lo, hi ] );

	}
	return ( covered( sides[ 0 ], mins[ 2 ], maxs[ 2 ] ) && covered( sides[ 1 ], mins[ 2 ], maxs[ 2 ] ) ) ||
		( covered( sides[ 2 ], left, right ) && covered( sides[ 3 ], left, right ) );

}
