/**
 * SV_PushEntity for a MOVETYPE_BOUNCE entity whose trace starts in solid (a Quake grenade thrown into a wall): Quake
 * keeps WinQuake's unconditional move, link and impact; only Hexen II takes the native early return (uhexen2
 * sv_phys.c SV_PushEntity), so the shared physics cannot change Quake's grenades.
 */
import { edict_t } from '../src/engine/progs/progs.js';
import { SV_SetCallbacks, SV_SetState, SV_PushEntity } from '../src/engine/server/sv_phys.js';
import { MOVETYPE_BOUNCE, SOLID_BBOX } from '../src/engine/server/server.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';

function check( condition, message ) { if ( ! condition ) throw new Error( message ); }

function run( profile ) {

	GameProfile_Set( profile );
	const grenade = new edict_t( 1, 200 ), wall = new edict_t( 2, 200 );
	grenade.v.movetype = MOVETYPE_BOUNCE; grenade.v.solid = SOLID_BBOX; grenade.v.touch = 7; wall.v.solid = SOLID_BBOX;
	grenade.v.origin[ 0 ] = 10;
	const globals = { self: 0, other: 0, time: 0 }, touched = [], linked = [];
	SV_SetState( { time: 1, edicts: [ null, grenade, wall ] }, {}, globals );
	SV_SetCallbacks( {
		SV_Move: () => ( { allsolid: false, startsolid: true, fraction: 0.5, endpos: [ 20, 0, 0 ], ent: wall, plane: { normal: [ 0, 0, 1 ], dist: 0 } } ),
		SV_LinkEdict: ent => linked.push( ent ),
		PR_ExecuteProgram: fn => touched.push( fn ),
		EDICT_TO_PROG: ent => ent === grenade ? 1 : 2
	} );
	const trace = SV_PushEntity( grenade, [ 10, 0, 0 ] );
	return { grenade, trace, touched, linked };

}

Deno.test( 'a Quake grenade that starts in solid still moves, links and touches, as in WinQuake', () => {

	const { grenade, trace, touched, linked } = run( 'quake' );
	check( grenade.v.origin[ 0 ] === 20, 'moved to the trace end: ' + grenade.v.origin[ 0 ] );
	check( linked.length === 1, 'relinked' );
	check( touched.includes( 7 ), 'its touch function ran' );
	check( trace.fraction === 0.5, 'the trace is returned unchanged' );

} );

Deno.test( 'a Hexen II bounce entity that starts in solid stays put (native early return)', () => {

	const { grenade, trace, linked } = run( 'hexen2' );
	check( grenade.v.origin[ 0 ] === 10, 'did not move: ' + grenade.v.origin[ 0 ] );
	check( linked.length === 0 && trace.fraction === 0, 'native: no relink, fraction 0' );
	GameProfile_Set( 'quake' );

} );
