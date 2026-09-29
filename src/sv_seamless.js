// Seamless level changes: walk (or fall) out of the end of one level and carry on
// into the start of the next without an intermission, a teleport or a change of
// speed or heading.
//
// When a level starts, each of its exits that is a doorway or a pit (see
// r_levelgraph.js) is switched from the game's own trigger_changelevel to a
// crossing this module watches for.  When the player goes through, the next level
// is started the usual way (spawn parameters are kept: weapons, ammo, health...)
// and, as the player is put into it, their position, velocity and view are set
// from where they were, carried across by the crossing's transform.
//
// Single player only.  0 = off, 1 = Newer Game only (the default), 2 = always.

import { cvar_t } from './cvar.js';
import { sv, svs } from './server.js';
import { COM_FindFile } from './pak.js';
import { SV_LinkEdict, SV_PointContents, SV_TestEntityPosition } from './world.js';
import { PR_GetString } from './progs.js';
import { Cbuf_AddText } from './cmd.js';
import { Con_DPrintf } from './common.js';
import { Cvar_VariableValue } from './cvar.js';
import {
	R_ParseBsp, R_LevelLinks, R_CrossingTransform, R_ChooseApproach
} from './r_levelgraph.js';

export const sv_seamless = new cvar_t( 'sv_seamless', '1' );

const CONTENTS_SOLID = - 2;
const SOLID_NOT = 0;
const FL_ONGROUND = 512;

const metaCache = new Map();

let crossings = []; // this level's seamless exits
let pending = null; // a crossing in progress: { map, origin, velocity, angles, pit }
let lastOrigin = null;
let holding = null; // the arrival, while the player is held until the client is ready

export function SV_SeamlessEnabled() {

	const v = sv_seamless.value;
	// r_hdr is read directly: the level is spawned in the same command batch as
	// "r_hdr 1", before any frame has been drawn with it
	return v >= 2 || ( v >= 1 && Cvar_VariableValue( 'r_hdr' ) !== 0 );

}

// links of a map, read straight from its BSP (cached)
export function SV_LevelLinks( mapName ) {

	if ( metaCache.has( mapName ) ) return metaCache.get( mapName );

	let links = null;
	const file = COM_FindFile( 'maps/' + mapName + '.bsp' );

	if ( file != null ) {

		const bytes = file.data != null && file.size != null
			? new Uint8Array( file.data.buffer, file.data.byteOffset, file.size )
			: file.data;
		const meta = bytes != null ? R_ParseBsp( bytes ) : null;
		if ( meta !== null ) links = R_LevelLinks( meta );

	}

	metaCache.set( mapName, links );
	return links;

}

// how far you can go from p along dir (up to limit) before you hit something solid
function scan( p, dir, limit ) {

	for ( let d = 4; d <= limit; d += 4 )
		if ( solidAt( [ p[ 0 ] + dir[ 0 ] * d, p[ 1 ] + dir[ 1 ] * d, p[ 2 ] + dir[ 2 ] * d ] ) ) return d - 4;

	return limit;

}

// the size of the opening the crossing is in, as a rectangle on its plane:
// corners = centre + axisA * a + axisB * b for a in [ a0, a1 ], b in [ b0, b1 ]
function openingOf( t ) {

	const c = t.center;

	if ( t.kind === 'pit' ) {

		return {
			axisA: [ 1, 0, 0 ], axisB: [ 0, 1, 0 ],
			a0: - scan( c, [ - 1, 0, 0 ], 400 ), a1: scan( c, [ 1, 0, 0 ], 400 ),
			b0: - scan( c, [ 0, - 1, 0 ], 400 ), b1: scan( c, [ 0, 1, 0 ], 400 )
		};

	}

	const a = t.tangent;
	return {
		axisA: a, axisB: [ 0, 0, 1 ],
		a0: - scan( c, [ - a[ 0 ], - a[ 1 ], 0 ], 400 ), a1: scan( c, [ a[ 0 ], a[ 1 ], 0 ], 400 ),
		b0: - scan( c, [ 0, 0, - 1 ], 200 ), b1: scan( c, [ 0, 0, 1 ], 400 )
	};

}

function solidAt( p ) {

	return SV_PointContents( p ) === CONTENTS_SOLID;

}

// how far you can go from p along dir before you hit something solid
function clearDistance( p, dir ) {

	for ( let d = 8; d <= 640; d += 8 )
		if ( solidAt( [ p[ 0 ] + dir[ 0 ] * d, p[ 1 ] + dir[ 1 ] * d, p[ 2 ] + dir[ 2 ] * d ] ) ) return d;

	return 640;

}

// the floor under a point (the first solid below it)
function floorBelow( p ) {

	for ( let d = 0; d <= 480; d += 4 )
		if ( solidAt( [ p[ 0 ], p[ 1 ], p[ 2 ] - d ] ) ) return p[ 2 ] - d + 4;

	return p[ 2 ] - 480;

}

/*
================
SV_SeamlessSetup

Called once a level's entities are loaded.
================
*/
export function SV_SeamlessSetup() {

	crossings = [];
	lastOrigin = null;

	if ( ! SV_SeamlessEnabled() || svs.maxclients !== 1 || sv.worldmodel == null ) return;

	const here = SV_LevelLinks( sv.name );
	if ( here === null ) return;

	for ( const exit of here.exits ) {

		if ( exit.kind === 'pad' ) continue;

		const there = SV_LevelLinks( exit.map );
		if ( there === null || there.start === null ) continue; // not available: leave it to the game

		const centre = [
			( exit.mins[ 0 ] + exit.maxs[ 0 ] ) * 0.5,
			( exit.mins[ 1 ] + exit.maxs[ 1 ] ) * 0.5,
			( exit.mins[ 2 ] + exit.maxs[ 2 ] ) * 0.5
		];

		const approach = R_ChooseApproach( exit, clearDistance );
		const side = approach.side;
		const transform = R_CrossingTransform( exit, side, there.start, floorBelow( centre ), approach.axis );
		if ( transform === null ) continue;

		// stop the game's own exit from firing; this crossing takes over
		let taken = false;
		for ( let i = 0; i < sv.num_edicts; i ++ ) {

			const ed = sv.edicts[ i ];
			if ( ed.free ) continue;
			if ( PR_GetString( ed.v.classname ) !== 'trigger_changelevel' ) continue;

			// triggers clear their model name when they spawn, so find this one by its
			// box: the game makes it one unit bigger than the brush all round
			let same = true;
			for ( let a = 0; a < 3; a ++ )
				if ( Math.abs( ed.v.mins[ a ] - exit.mins[ a ] ) > 2 || Math.abs( ed.v.maxs[ a ] - exit.maxs[ a ] ) > 2 ) same = false;
			if ( same === false ) continue;

			ed.v.solid = SOLID_NOT;
			SV_LinkEdict( ed, false );
			taken = true;

		}

		if ( taken ) crossings.push( { exit, map: exit.map, transform, side, opening: openingOf( transform ) } );

	}

	if ( crossings.length > 0 )
		Con_DPrintf( 'seamless: %d exit(s) on %s\n', crossings.length, sv.name );

}

/*
================
SV_SeamlessFrame

After the physics each frame: has the player gone through an exit?
================
*/
export function SV_SeamlessFrame() {

	if ( crossings.length === 0 || pending !== null ) return;

	const client = svs.clients[ 0 ];
	if ( client == null || client.edict == null ) return;

	const ent = client.edict;
	const cur = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];

	if ( lastOrigin !== null ) {

		for ( const c of crossings ) {

			if ( c.transform.crossed( lastOrigin, cur ) === false ) continue;

			const t = c.transform;
			const va = ent.v.v_angle;

			pending = {
				map: c.map,
				pit: t.kind === 'pit',
				origin: t.position( cur ),
				velocity: t.direction( [ ent.v.velocity[ 0 ], ent.v.velocity[ 1 ], ent.v.velocity[ 2 ] ] ),
				angles: [ va[ 0 ], t.angle( va[ 1 ] ), 0 ]
			};

			Cbuf_AddText( 'changelevel ' + c.map + '\n' );
			return;

		}

	}

	lastOrigin = cur;

}

/*
================
SV_SeamlessPlacePlayer

Called right after the game has put the player in the new level.
================
*/
export function SV_SeamlessPlacePlayer( ent ) {

	const arrival = pending;
	pending = null;
	lastOrigin = null;

	if ( arrival === null || arrival.map !== sv.name ) return;

	const start = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];
	ent.v.origin = arrival.origin;

	// carried into a wall (a wide doorway into a narrow room): use the start
	if ( SV_TestEntityPosition( ent ) !== null )
		ent.v.origin = start;

	ent.v.oldorigin = [ ent.v.origin[ 0 ], ent.v.origin[ 1 ], ent.v.origin[ 2 ] ];
	ent.v.velocity = arrival.velocity;
	holding = arrival; // frozen here until the client has finished loading
	ent.v.angles = arrival.angles;
	ent.v.v_angle = arrival.angles;
	ent.v.fixangle = 1;

	if ( arrival.pit ) ent.v.flags = ( ent.v.flags | 0 ) & ~ FL_ONGROUND;

	SV_LinkEdict( ent, false );

}

/*
================
SV_SeamlessHolding

While the client is still loading the new level the player is held where they
arrived, so gravity and friction do not eat the speed they came in with.
================
*/
export function SV_SeamlessHolding( num ) {

	if ( holding === null ) return false;

	const client = svs.clients[ num - 1 ];
	if ( client != null && client.spawned === true ) {

		// the client is ready: let go, moving exactly as they were
		const ent = client.edict;
		ent.v.velocity = holding.velocity;
		holding = null;
		return false;

	}

	return true;

}

export function SV_SeamlessCrossingCount() {

	return crossings.length;

}

export function SV_SeamlessPending() {

	return pending;

}

export function SV_SeamlessReset() {

	crossings = [];
	pending = null;
	holding = null;
	lastOrigin = null;
	metaCache.clear();

}

export function SV_SeamlessCrossings() {

	return crossings;

}
