// The client's one ray-cast helper (src/engine/render/r_trace.js, card [44g], debt D6), against the real E1M1 BSP: a
// line down from an open point stops on the floor, facing up; a start inside a wall is reported; a reused trace is reset
// between calls; a line from inside solid strikes its first plane only when it starts with allsolid false (chase.c's
// zeroed trace), not with the server's allsolid true; the swept probe never reaches further than the centre's line, and with no radius equals it; a model
// with no hull gives null (point) or an unobstructed trace (swept).
import { readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import * as M from '../src/engine/render/gl_model.js';
import { R_TracePoint, R_TraceSwept } from '../src/engine/render/r_trace.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, near = ( a, b, e, m ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );
const data = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) );
pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', data.buffer.slice( data.byteOffset, data.byteOffset + data.length ) ) );
VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); M.Mod_Init();
const e1m1 = M.Mod_ForName( 'maps/e1m1.bsp', true ), contents = p => M.Mod_PointInLeaf( p, e1m1 ).contents;

// an open point with floor below it within 256 units, found in the map
function openAboveFloor() {

	for ( let x = e1m1.mins[ 0 ] + 32; x < e1m1.maxs[ 0 ]; x += 64 ) for ( let y = e1m1.mins[ 1 ] + 32; y < e1m1.maxs[ 1 ]; y += 64 ) for ( let z = e1m1.mins[ 2 ] + 48; z < e1m1.maxs[ 2 ]; z += 64 ) {

		const p = [ x, y, z ];
		if ( contents( p ) !== - 1 ) continue;
		const t = R_TracePoint( e1m1, p, [ x, y, z - 256 ] );
		if ( t.fraction < 1 && ! t.startsolid && t.plane.normal[ 2 ] > .99 ) return p;

	}
	return null;

}

Deno.test( 'a line down from an open point stops on the floor, the plane facing up; a start in a wall is reported; a reused trace is reset', () => {

	const p = openAboveFloor(); check( p, 'an open point above a flat floor in E1M1' );
	const end = [ p[ 0 ], p[ 1 ], p[ 2 ] - 256 ];
	const t = R_TracePoint( e1m1, p, end );
	check( t.fraction > 0 && t.fraction < 1 && ! t.startsolid && ! t.allsolid, 'stopped part of the way, starting in the open' );
	near( t.endpos[ 2 ], p[ 2 ] - 256 * t.fraction, 1e-3, 'end point along the line at the fraction' );
	check( contents( [ t.endpos[ 0 ], t.endpos[ 1 ], t.endpos[ 2 ] + .5 ] ) === - 1, 'just above the end point is open' );
	near( t.plane.normal[ 2 ], 1, 1e-6, 'the floor faces up' );
	// a solid point: below the floor, inside it
	const solid = [ p[ 0 ], p[ 1 ], t.endpos[ 2 ] - 4 ];
	check( contents( solid ) === - 2, '(a point inside the floor)' );
	const reused = R_TracePoint( e1m1, solid, [ solid[ 0 ], solid[ 1 ], solid[ 2 ] - 8 ] );
	check( reused.startsolid, 'a start inside a wall is reported' );
	const again = R_TracePoint( e1m1, p, [ p[ 0 ], p[ 1 ], p[ 2 ] + 1 ], reused );
	check( again === reused && ! again.startsolid && again.fraction === 1, 'a reused trace is reset: the short open line reaches its end' );
	// a line from inside solid (found by the [44g] step 5 review): chase.c's zeroed trace strikes, the server's does not
	const a = [ - 592, - 128, - 592 ], b = [ - 592, - 38, - 562 ];
	check( contents( a ) === - 2, '(the line starts in solid)' );
	const zeroed = R_TracePoint( e1m1, a, b, undefined, false ), server = R_TracePoint( e1m1, a, b );
	check( zeroed.fraction < .05 && server.fraction === 1 && server.endpos[ 1 ] === b[ 1 ], `allsolid false strikes near the start (${zeroed.fraction}), true reaches the end (${server.fraction})` );

} );

Deno.test( 'the swept probe never reaches further than the centre line, equals it with no radius; no hull: null or unobstructed', () => {

	const p = openAboveFloor(), end = [ p[ 0 ], p[ 1 ], p[ 2 ] - 256 ];
	const point = R_TracePoint( e1m1, p, end ), zero = R_TraceSwept( e1m1, p, end, 0 ), wide = R_TraceSwept( e1m1, p, end, 6 );
	near( zero.fraction, point.fraction, 0, 'no radius: the centre line' );
	check( wide.fraction <= point.fraction, 'a radius never reaches further' );
	near( wide.endpos[ 0 ], p[ 0 ], 1e-6, 'the hit is brought back to the centre (x)' );
	check( R_TracePoint( { name: 'no hulls' }, p, end ) === null, 'no hull 0: null' );
	const none = R_TraceSwept( { name: 'no hulls' }, p, end, 6 );
	check( none.fraction === 1 && ! none.allsolid && none.endpos[ 2 ] === end[ 2 ], 'no hull 0: unobstructed' );

} );
