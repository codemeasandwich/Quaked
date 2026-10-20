// Native Hexen II physics and traces over the shared Quake server: movetypes 11-14, SOLID_PHASE, MOVE_WATER/MOVE_PHASE,
// the hull rules and rotating brushes, player flight/water/friction/crouch, move chains, the monster move helpers, and
// a real owned map. Each check names the native reference it holds (`engine/hexen2/sv_phys.c`, `world.c`, `sv_move.c`,
// `sv_user.c`).
import { existsSync, readFileSync } from 'node:fs';
import {
	edict_t, PR_SetSV, PR_SetSVS, NEXT_EDICT, PROG_TO_EDICT, EDICT_TO_PROG,
	pr_global_struct as hexenGlobals, svs as hexenSvs
} from '../src/engine/progs/progs.js';
import {
	SV_SetState, SV_SetCallbacks, SV_SetFrametime, SV_SetPlayer, SV_Physics,
	SV_PushEntity, SV_Physics_Client, SV_Physics_Step, SV_FlyExtras, SV_Physics_Toss,
	MOVETYPE_NONE, MOVETYPE_NOCLIP, MOVETYPE_PUSH,
	MOVETYPE_PUSHPULL, MOVETYPE_SWIM, MOVETYPE_FLY, MOVETYPE_WALK, MOVETYPE_STEP, MOVETYPE_TOSS,
	MOVETYPE_BOUNCEMISSILE, SOLID_PHASE, SOLID_BBOX, SOLID_BSP, SOLID_NOT,
	FL_ONGROUND, FL_MONSTER, FL_FLY, FL_SWIM, FL_NOZ, FL_MOVECHAIN_ANGLE, FL2_CROUCHED,
	MOVE_NORMAL, MOVE_NOMONSTERS, MOVE_PHASE, MOVE_MISSILE, MOVE_WATER,
	sv_maxspeed, sv_friction, sv_edgefriction, sv_stopspeed, sv_gravity
} from '../src/engine/server/sv_phys.js';
import * as worldModule from '../src/engine/server/world.js';
import {
	SV_ClearWorld, SV_LinkEdict, SV_Move, SV_PointContents, SV_TestEntityPosition,
	SV_HullForEntity
} from '../src/engine/server/world.js';
import { SV_CheckBottom, SV_movestep, SV_NewChaseDir } from '../src/engine/server/sv_move.js';
import {
	SV_SetIdealPitch, SV_UserFriction, SV_WaterMove, SV_FlightMove, SV_ClientThink,
	SV_User_SetCallbacks, SV_ReadClientMove, host_client
} from '../src/engine/server/sv_user.js';
import {
	GameProfile_Set, GameProfile_Get, GAME_PROFILES
} from '../src/engine/common/game_profile.js';
import {
	CONTENTS_EMPTY, CONTENTS_SOLID, CONTENTS_WATER
} from '../src/engine/common/bspfile.js';
import {
	VectorCopy, vec3_origin
} from '../src/engine/common/mathlib.js';
import {
	SZ_Alloc, SZ_Clear, sizebuf_t, COM_SetNetMessage, MSG_BeginReading,
	MSG_WriteFloat, MSG_WriteAngle, MSG_WriteShort, MSG_WriteByte
} from '../src/engine/common/common.js';
import { sv as serverSv } from '../src/engine/server/server.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m, e = 1e-3 ) => check( Math.abs( a - b ) <= e, `${m}: ${a} != ${b}` );

// The test drives the client it installed; the server's real input path is SV_ReadClientMove.
function setCommand( move ) {

	host_client.cmd.forwardmove = move.forwardmove ?? 0;
	host_client.cmd.sidemove = move.sidemove ?? 0;
	host_client.cmd.upmove = move.upmove ?? 0;

}

const profileBefore = GameProfile_Get();

function globals() {

	return {
		time: 0, self: 0, other: 0, force_retouch: 0,
		StartFrame: 0, PlayerPreThink: 0, PlayerPostThink: 0,
		trace_allsolid: 0, trace_startsolid: 0, trace_fraction: 1, trace_inwater: 0, trace_inopen: 0,
		trace_endpos: [ 0, 0, 0 ], trace_plane_normal: [ 0, 0, 0 ], trace_plane_dist: 0, trace_ent: 0
	};

}

function state( count = 8 ) {

	// world.js reads the engine's single server_t, so the synthetic server must be that instance.
	const sv = serverSv;
	sv.time = 1;
	sv.edicts = [];
	sv.num_edicts = count;
	sv.max_edicts = count;
	sv.models = [];
	sv.worldmodel = null;
	for ( let i = 0; i < count; i ++ ) sv.edicts.push( new edict_t( i, 128 ) );
	PR_SetSV( sv );
	const svs = { maxclients: 0, clients: [], active: true };
	PR_SetSVS( svs );
	const g = globals();
	SV_SetState( sv, svs, g );
	SV_SetFrametime( 0.1 );
	return { sv, svs, g };

}

function hull( child0, child1, type = 2, dist = 0 ) {

	return {
		firstclipnode: 0, lastclipnode: 0,
		clip_mins: new Float32Array( 3 ), clip_maxs: new Float32Array( 3 ),
		clipnodes: [ { planenum: 0, children: [ child0, child1 ] } ],
		planes: [ { type, dist, normal: new Float32Array( [ type === 0 ? 1 : 0, type === 1 ? 1 : 0, type === 2 ? 1 : 0 ] ) } ]
	};

}

// A world whose point hull is empty, a floor at z = 0, or water on x >= 0.
function world( kind = 'empty' ) {

	const fx = state();
	let h;
	if ( kind === 'floor' ) h = hull( CONTENTS_EMPTY, CONTENTS_SOLID );
	else if ( kind === 'water' ) h = hull( CONTENTS_WATER, CONTENTS_EMPTY, 0 );
	else h = hull( CONTENTS_EMPTY, CONTENTS_EMPTY );
	const model = {
		type: 0, name: 'maps/synthetic.bsp', hullCount: 4,
		mins: [ - 2048, - 2048, - 2048 ], maxs: [ 2048, 2048, 2048 ],
		hulls: [ h, h, h, h ], nodes: null, entities: ''
	};
	fx.sv.worldmodel = model;
	fx.sv.models = [ model ];
	const w = fx.sv.edicts[ 0 ];
	w.v.solid = SOLID_BSP;
	w.v.movetype = MOVETYPE_PUSH;
	w.v.modelindex = 0;
	w.v.mins = [ 0, 0, 0 ];
	w.v.maxs = [ 0, 0, 0 ];
	w.v.origin = [ 0, 0, 0 ];
	w.v.spawnflags = 0;
	SV_ClearWorld();
	return fx;
}

function wire( extra = {} ) {

	installServerCallbacks( {
		SV_Move: worldModule.SV_Move,
		SV_TestEntityPosition: worldModule.SV_TestEntityPosition,
		SV_LinkEdict: worldModule.SV_LinkEdict,
		SV_PointContents: worldModule.SV_PointContents,
		PR_ExecuteProgram: extra.PR_ExecuteProgram ?? ( () => {} ),
		SV_StartSound: extra.SV_StartSound
	} );
	SV_SetCallbacks( {
		PR_ExecuteProgram: extra.PR_ExecuteProgram ?? ( () => {} ),
		GetEdictFieldValue: () => null
	} );

}

function point( index, origin = [ 0, 0, 0 ], mins = [ - 16, - 16, - 24 ], maxs = [ 16, 16, 32 ] ) {

	const ent = new edict_t( index, 128 );
	ent.v.origin = Array.from( origin );
	ent.v.mins = Array.from( mins );
	ent.v.maxs = Array.from( maxs );
	ent.v.size = [ maxs[ 0 ] - mins[ 0 ], maxs[ 1 ] - mins[ 1 ], maxs[ 2 ] - mins[ 2 ] ];
	ent.v.velocity = [ 0, 0, 0 ];
	ent.v.angles = [ 0, 0, 0 ];
	ent.v.v_angle = [ 0, 0, 0 ];
	ent.v.punchangle = [ 0, 0, 0 ];
	ent.v.view_ofs = [ 0, 0, 22 ];
	return ent;

}

function trace( fraction, normal = [ 0, 0, 0 ], endpos = [ 0, 0, 0 ], ent = null )
{

	return { allsolid: false, startsolid: false, inopen: false, inwater: false, fraction,
		endpos: Float32Array.from( endpos ), plane: { normal: Float32Array.from( normal ), dist: 0 }, ent };

}

Deno.test( 'Hexen movetypes are native 11-14 with SOLID_PHASE and the two extra trace modes', () => {

	same( MOVETYPE_BOUNCEMISSILE, 11, 'MOVETYPE_BOUNCEMISSILE' );
	same( MOVETYPE_PUSHPULL, 13, 'native MOVETYPE_PUSHPULL is 13' );
	same( MOVETYPE_SWIM, 14, 'native MOVETYPE_SWIM is 14' );
	same( SOLID_PHASE, 5, 'native SOLID_PHASE is 5' );
	same( MOVE_WATER, 3, 'native MOVE_WATER is 3' );
	same( MOVE_PHASE, 4, 'native MOVE_PHASE is 4' );

} );

Deno.test( 'Hexen defaults sv_maxspeed to 640 and restores the Quake 320 default', () => {

	const before = sv_maxspeed.value;
	GameProfile_Set( GAME_PROFILES.hexen2 );
	state();
	same( sv_maxspeed.value, 640, 'the Hexen II profile default' );
	GameProfile_Set( GAME_PROFILES.quake );
	state();
	same( sv_maxspeed.value, 320, 'Quake keeps its native default' );
	sv_maxspeed.value = before;
	GameProfile_Set( profileBefore );

} );

Deno.test( 'PUSHPULL falls with step physics while SWIM uses toss physics without gravity', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = world( 'empty' );
	wire();
	const push = point( 1, [ 0, 0, 100 ] );
	push.v.movetype = MOVETYPE_PUSHPULL;
	push.v.solid = SOLID_BBOX;
	const swim = point( 2, [ 80, 0, 100 ] );
	swim.v.movetype = MOVETYPE_SWIM;
	swim.v.solid = SOLID_BBOX;
	fx.sv.edicts[ 1 ] = push; fx.sv.edicts[ 2 ] = swim;
	try {

		SV_Physics();
		check( push.v.origin[ 2 ] < 100, 'a pushable under step physics falls: ' + push.v.origin[ 2 ] );
		same( swim.v.origin[ 2 ], 100, 'a swimmer does not add gravity in toss physics' );

	} finally {

		GameProfile_Set( profileBefore );

	}

} );

Deno.test( 'MOVE_WATER stops at the water surface and MOVE_PHASE ignores non-BSP entities', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const wet = world( 'water' );
	wire();
	const start = [ 10, 0, 0 ], end = [ - 10, 0, 0 ];
	const dry = SV_Move( start, vec3_origin, vec3_origin, end, MOVE_NORMAL, null );
	near( dry.endpos[ 0 ], - 10, 'a normal trace crosses the water/empty boundary' );
	const water = SV_Move( start, vec3_origin, vec3_origin, end, MOVE_WATER, null );
	same( water.fraction, 0, 'a water trace that would leave the water stops at its start' );
	near( water.endpos[ 0 ], 10, 'and keeps the start point' );

	const fx = world( 'empty' );
	wire();
	const monster = point( 1, [ 0, 0, 0 ], [ - 16, - 16, - 16 ], [ 16, 16, 16 ] );
	monster.v.solid = SOLID_BBOX;
	monster.v.movetype = MOVETYPE_STEP;
	monster.v.flags = FL_MONSTER;
	fx.sv.edicts[ 1 ] = monster;
	SV_LinkEdict( monster, false );
	const normal = SV_Move( [ - 100, 0, 0 ], vec3_origin, vec3_origin, [ 100, 0, 0 ], MOVE_NORMAL, null );
	check( normal.fraction < 1, 'a normal trace hits the monster body' );
	const phased = SV_Move( [ - 100, 0, 0 ], vec3_origin, vec3_origin, [ 100, 0, 0 ], MOVE_PHASE, null );
	same( phased.fraction, 1, 'a phase trace passes through the monster body (only BSP clips)' );
	const noMonsters = SV_Move( [ - 100, 0, 0 ], vec3_origin, vec3_origin, [ 100, 0, 0 ], MOVE_NOMONSTERS, null );
	same( noMonsters.fraction, 1, 'MOVE_NOMONSTERS matches it' );

	GameProfile_Set( profileBefore );

} );

Deno.test( 'the hull rules choose 0/4/3/1/5, honour ent.hull, and zero a monster X/Y offset', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = world( 'empty' );
	const hulls = [
		{ clip_mins: [ 0, 0, 0 ], clip_maxs: [ 0, 0, 0 ] },
		{ clip_mins: [ - 16, - 16, - 24 ], clip_maxs: [ 16, 16, 32 ] },
		{ clip_mins: [ - 24, - 24, - 20 ], clip_maxs: [ 24, 24, 20 ] },
		{ clip_mins: [ - 16, - 16, - 12 ], clip_maxs: [ 16, 16, 16 ] },
		{ clip_mins: [ - 40, - 40, - 42 ], clip_maxs: [ 40, 40, 42 ] },
		{ clip_mins: [ - 48, - 48, - 50 ], clip_maxs: [ 48, 48, 50 ] }
	];
	fx.sv.worldmodel.hulls = [ ...hulls, hulls[ 0 ], hulls[ 0 ], hulls[ 0 ] ];
	fx.sv.worldmodel.hullCount = 8;
	const w = fx.sv.edicts[ 0 ];
	w.v.spawnflags = 1;
	const offset = new Float32Array( 3 );
	const mover = point( 1, [ 100, 200, 300 ], [ - 16, - 16, - 24 ], [ 16, 16, 56 ] );
	const choose = ( size, named = 0, flags = 0 ) => {

		mover.v.hull = named;
		mover.v.flags = flags;
		const mins = [ - size[ 0 ] / 2, - size[ 1 ] / 2, 0 ], maxs = [ size[ 0 ] / 2, size[ 1 ] / 2, size[ 2 ] ];
		return SV_HullForEntity( w, mins, maxs, offset, mover );

	};
	same( choose( [ 0, 0, 0 ] ).clip_mins.join( ',' ), '0,0,0', 'a point uses hull 0' );
	same( choose( [ 8, 8, 8 ] ).clip_mins.join( ',' ), '-40,-40,-42', 'a pentacle uses hull 4 when worldspawn spawnflags&1' );
	same( choose( [ 32, 32, 24 ] ).clip_mins.join( ',' ), '-16,-16,-12', 'a half player uses hull 3' );
	same( choose( [ 32, 32, 56 ] ).clip_mins.join( ',' ), '-16,-16,-24', 'a full player uses hull 1' );
	same( choose( [ 64, 64, 64 ] ).clip_mins.join( ',' ), '-48,-48,-50', 'a golem uses hull 5' );
	same( choose( [ 0, 0, 0 ], 2 ).clip_mins.join( ',' ), '-16,-16,-24', 'an explicit ent.hull 2 selects model hull 2' );
	same( choose( [ 0, 0, 0 ], 6 ).clip_mins.join( ',' ), '-48,-48,-50', 'an explicit ent.hull 6 selects the golem hull' );

	w.v.origin = [ 100, 200, 300 ];
	mover.v.hull = 5;
	mover.v.flags = FL_MONSTER;
	choose( [ 0, 0, 0 ], 5, FL_MONSTER );
	near( offset[ 0 ], 100, 'a monster drops the hull X centring, leaving the entity origin' );
	near( offset[ 1 ], 200, 'a monster drops the hull Y centring too' );
	near( offset[ 2 ], 258, 'the monster Z offset is kept' );
	choose( [ 0, 0, 0 ], 5, 0 );
	near( offset[ 0 ], 60, 'a non-monster keeps the hull X offset' );

	GameProfile_Set( profileBefore );

} );

Deno.test( 'rotating BSP entities rotate trace start/end and the impact plane (world.c SV_ClipMoveToEntity)', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = world( 'empty' );
	wire();
	const wall = hull( CONTENTS_SOLID, CONTENTS_EMPTY, 0 );
	const brushModel = { type: 0, name: '*1', hullCount: 4, mins: [ - 128, - 128, - 128 ], maxs: [ 128, 128, 128 ],
		hulls: [ wall, wall, wall, wall ], nodes: null };
	fx.sv.models[ 1 ] = brushModel;
	const brush = point( 1, [ 0, 0, 0 ], [ - 100, - 100, - 100 ], [ 100, 100, 100 ] );
	brush.v.solid = SOLID_BSP;
	brush.v.movetype = MOVETYPE_PUSH;
	brush.v.modelindex = 1;
	brush.v.angles = [ 0, 90, 0 ];
	fx.sv.edicts[ 1 ] = brush;
	SV_LinkEdict( brush, false );
	// Local x is solid: with yaw 90 the world +Y axis maps onto it, so the wall lies across y = 0.
	const hit = SV_Move( [ 0, - 100, 0 ], vec3_origin, vec3_origin, [ 0, 100, 0 ], MOVE_NORMAL, null );
	check( hit.fraction < 1, 'the rotated wall is hit: ' + hit.fraction );
	near( hit.endpos[ 1 ], 0, 'the impact is on the rotated plane, not the unrotated x = 0 plane', 0.2 );
	brush.v.angles = [ 0, 0, 0 ];
	const straight = SV_Move( [ 0, - 100, 0 ], vec3_origin, vec3_origin, [ 0, 100, 0 ], MOVE_NORMAL, null );
	same( straight.fraction, 1, 'the same wall at yaw 0 does not block the Y axis' );
	GameProfile_Set( GAME_PROFILES.quake );
	brush.v.angles = [ 0, 90, 0 ];
	const quakeStraight = SV_Move( [ 0, - 100, 0 ], vec3_origin, vec3_origin, [ 0, 100, 0 ], MOVE_NORMAL, null );
	same( quakeStraight.fraction, 1, 'Quake never rotates a brush trace' );

	GameProfile_Set( profileBefore );

} );

Deno.test( 'SV_FlyExtras hovers around six units and applies vertical friction', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = state();
	const ent = point( 1 );
	SV_SetPlayer( ent );
	ent.v.hoverz = 0.4;
	SV_FlyExtras( ent, 0.1, null );
	check( ent.v.flags & FL_ONGROUND, 'flight resets FL_ONGROUND' );
	near( ent.v.velocity[ 2 ], 0.4, 'a hovering flyer rises by hoverz' );
	ent.v.velocity[ 2 ] = 10;
	ent.v.hoverz = 0;
	SV_FlyExtras( ent, 0.1, null );
	near( ent.v.velocity[ 2 ], 9, 'fast vertical progress loses a tenth of the player velocity' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'Hexen water speed scales by class and level, and ground friction multiplies ent.friction', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	SV_User_SetCallbacks( { host_client: { cmd: {} }, V_CalcRoll: () => 0 } );
	const fx = world( 'floor' );
	wire();
	const player = point( 1, [ 0, 0, 24 ] );
	player.v.health = 100;
	player.v.movetype = MOVETYPE_FLY;
	SV_SetPlayer( player );
	player.v.v_angle = [ 0, 0, 0 ];
	player.v.velocity = [ 0, 0, 0 ];

	player.v.waterlevel = 2;
	const speedFor = ( playerclass, level ) => {

		player.v.playerclass = playerclass;
		player.v.level = level;
		player.v.velocity = [ 0, 0, 0 ];
		setCommand( { forwardmove: 1000 } );
		SV_ClientThink();
		return player.v.velocity[ 0 ];

	};
	const oldMax = sv_maxspeed.value;
	sv_maxspeed.value = 640;
	sv_friction.value = 4;
	sv_edgefriction.value = 2;
	sv_stopspeed.value = 100;
	near( speedFor( 1, 1 ), 480, 'a level 1 Paladin moves at 75% of 640' );
	near( speedFor( 2, 1 ), 448, 'other classes move at 70%' );
	near( speedFor( 5, 3 ), 320, 'the Demon moves at 50%' );
	near( speedFor( 1, 5 ), 576, 'a level 5 Paladin moves at 90%' );

	player.v.waterlevel = 0;
	player.v.movetype = MOVETYPE_WALK;
	player.v.flags = FL_ONGROUND;
	player.v.friction = 2;
	player.v.velocity = [ 100, 0, 0 ];
	setCommand( { forwardmove: 0 } );
	SV_ClientThink();
	near( player.v.velocity[ 0 ], 20, 'ground friction is sv_friction * ent.friction' );
	player.v.friction = 0;
	player.v.velocity = [ 100, 0, 0 ];
	SV_ClientThink();
	near( player.v.velocity[ 0 ], 60, 'an uninitialised Hexen friction is treated as 1' );
	sv_maxspeed.value = oldMax;
	GameProfile_Set( profileBefore );

} );

Deno.test( 'a Hexen FLY player uses SV_FlightMove, and MOVETYPE_NONE aborts SV_ClientThink', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	SV_User_SetCallbacks( { V_CalcRoll: () => 0 } );
	const fx = state();
	const player = point( 1 );
	player.v.health = 100;
	player.v.movetype = MOVETYPE_FLY;
	player.v.waterlevel = 0;
	player.v.movetype = MOVETYPE_FLY;
	SV_SetPlayer( player );
	SV_User_SetCallbacks( { host_client: { cmd: {} }, V_CalcRoll: () => 0 } );
	setCommand( { forwardmove: 100, viewangles: [ - 45, 0, 0 ] } );
	player.v.v_angle = [ - 45, 0, 0 ];
	player.v.angles = [ - 45, 0, 0 ];
	SV_ClientThink();
	check( player.v.velocity[ 2 ] > 1, 'flight follows the view pitch: ' + player.v.velocity[ 2 ] );

	player.v.movetype = MOVETYPE_NONE;
	player.v.velocity = [ 1, 2, 3 ];
	const saved = Array.from( player.v.velocity );
	SV_ClientThink();
	same( player.v.velocity.join( ',' ), saved.join( ',' ), 'MOVETYPE_NONE does not run movement' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'the crouch button sets FL2_CROUCHED', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = state();
	const ed = point( 1 );
	fx.sv.time = 10;
	ed.v.flags2 = 0;
	const client = { edict: ed, ping_times: new Float32Array( 16 ), num_pings: 0, cmd: {} };
	SV_User_SetCallbacks( { host_client: client } );
	const send = bits => {

		const packet = new sizebuf_t();
		SZ_Alloc( packet, 64 );
		MSG_WriteFloat( packet, 0 );
		for ( let i = 0; i < 3; i ++ ) MSG_WriteAngle( packet, 0 );
		for ( let i = 0; i < 3; i ++ ) MSG_WriteShort( packet, 0 );
		MSG_WriteByte( packet, bits );
		MSG_WriteByte( packet, 0 );
		MSG_WriteByte( packet, 0 );
		COM_SetNetMessage( packet );
		MSG_BeginReading();
		SV_ReadClientMove( client.cmd );

	};
	send( 4 );
	check( ( ed.v.flags2 & FL2_CROUCHED ) !== 0, 'button bit 4 crouches' );
	send( 0 );
	same( ed.v.flags2 & FL2_CROUCHED, 0, 'releasing it stands up' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'checkbottom and ideal pitch trace the point hull while ent.hull is restored', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = world( 'empty' );
	const player = point( 1, [ 0, 0, 10 ] );
	player.v.hull = 6;
	player.v.flags = FL_ONGROUND;
	player.v.movetype = MOVETYPE_FLY;
	SV_SetPlayer( player );
	const seen = [];
	SV_SetCallbacks( {
		SV_Move: ( start, mins, maxs, end ) => {

			seen.push( player.v.hull );
			return trace( 1, [ 0, 0, 0 ], end );

		},
		SV_PointContents: () => CONTENTS_EMPTY
	} );
	same( SV_CheckBottom( player ), false, 'an empty floor is not a bottom' );
	check( seen.length > 0 && seen.every( h => h === 0 ), 'checkbottom traces hull 0: ' + seen.join( ',' ) );
	same( player.v.hull, 6, 'checkbottom restores the named hull' );

	seen.length = 0;
	player.v.movetype = MOVETYPE_FLY;
	SV_SetIdealPitch();
	same( seen.length, 0, 'a flying player does not set an ideal pitch (native sv_user.c)' );
	same( player.v.hull, 6, 'the fly early return leaves the named hull intact' );

	// a walking player does trace, still with the point hull
	const walking = point( 2, [ 0, 0, 10 ] );
	walking.v.hull = 6;
	walking.v.flags = FL_ONGROUND;
	walking.v.movetype = MOVETYPE_WALK;
	SV_SetPlayer( walking );
	const pitchSeen = [];
	SV_SetCallbacks( {
		SV_Move: ( start, mins, maxs, end ) => {

			pitchSeen.push( walking.v.hull );
			return trace( 0.5, [ 0, 0, 1 ], [ start[ 0 ], start[ 1 ], 0 ] );

		}
	} );
	SV_SetIdealPitch();
	check( pitchSeen.length > 0, 'a walking player traces the ground ahead' );
	check( pitchSeen.every( h => h === 0 ), 'ideal pitch traces hull 0: ' + pitchSeen.join( ',' ) );
	same( walking.v.hull, 6, 'ideal pitch leaves the named hull intact' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'move chains carry origin, angle and chainmoved to at most ten followers', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = state( 14 );
	const leader = point( 1 );
	leader.v.movetype = MOVETYPE_NOCLIP;
	leader.v.velocity = [ 10, 0, 0 ];
	leader.v.avelocity = [ 0, 90, 0 ];
	leader.v.movechain = 2;
	fx.sv.edicts[ 1 ] = leader;
	const followers = [];
	for ( let i = 2; i <= 13; i ++ ) {

		const f = point( i );
		f.v.movetype = MOVETYPE_NONE;
		f.v.flags = FL_MOVECHAIN_ANGLE;
		f.v.movechain = i < 13 ? i + 1 : 0;
		f.v.chainmoved = 555;
		fx.sv.edicts[ i ] = f;
		followers.push( f );

	}
	const calls = [];
	wire( { PR_ExecuteProgram: fn => { if ( fn === 555 ) calls.push( fx.g.self ); } } );
	SV_Physics();
	near( leader.v.origin[ 0 ], 1, 'the leader moved' );
	for ( let i = 0; i < 10; i ++ ) {

		near( followers[ i ].v.origin[ 0 ], 1, `follower ${i + 1} moved` );
		near( followers[ i ].v.angles[ 1 ], 9, `follower ${i + 1} turned` );

	}
	near( followers[ 10 ].v.origin[ 0 ], 0, 'the eleventh follower is beyond the native cap' );
	near( followers[ 11 ].v.origin[ 0 ], 0, 'the twelfth follower is beyond the native cap' );
	same( calls.length, 10, 'chainmoved ran for the ten carried followers' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'SV_movestep honours noenemy, set_trace and FL_NOZ; FL_MONSTER skips the landing sound', () => {

	GameProfile_Set( GAME_PROFILES.hexen2 );
	const fx = world( 'empty' );
	wire();
	const flyer = point( 1, [ 0, 0, 100 ] );
	flyer.v.flags = FL_FLY;
	flyer.v.movetype = MOVETYPE_STEP;
	flyer.v.enemy = 0;
	fx.sv.edicts[ 1 ] = flyer;
	check( SV_movestep( flyer, [ 10, 0, 0 ], false ), 'a flyer moves' );
	same( fx.g.trace_fraction, 1, 'without set_trace the trace globals are left alone' );
	check( SV_movestep( flyer, [ 10, 0, 0 ], false, false, true ), 'a flyer moves with set_trace' );
	same( fx.g.trace_fraction, 1, 'set_trace writes trace_fraction' );
	same( fx.g.trace_ent, 0, 'set_trace writes the world trace entity' );
	flyer.v.origin = [ 0, 0, 100 ];
	flyer.v.flags = FL_FLY | FL_NOZ;
	same( SV_movestep( flyer, [ 10, 0, 0 ], false ), false, 'FL_NOZ uses the stepping path even for a flyer' );

	// a fake floor makes the step land; a monster is silent, a non-monster plays the Hexen landing sound
	const landing = world( 'empty' );
	const sounds = [];
	wire( {
		SV_StartSound: ( ent, channel, sample ) => sounds.push( sample ),
		PR_ExecuteProgram: () => {}
	} );
	let landed = false;
	SV_SetCallbacks( {
		SV_Move: ( start, mins, maxs, end, type, passed ) => {

			if ( ! landed && passed && passed.v.movetype === MOVETYPE_STEP ) {

				landed = true;
				return trace( 0.5, [ 0, 0, 1 ], [ passed.v.origin[ 0 ], passed.v.origin[ 1 ], 0 ], landing.sv.edicts[ 0 ] );

			}
			return trace( 1 );

		},
		SV_LinkEdict: () => {},
		SV_PointContents: () => CONTENTS_EMPTY,
		PR_ExecuteProgram: () => {},
		SV_StartSound: ( ent, channel, sample ) => sounds.push( sample )
	} );
	const monster = point( 1, [ 0, 0, 200 ] );
	monster.v.flags = FL_MONSTER;
	monster.v.movetype = MOVETYPE_STEP;
	monster.v.velocity = [ 0, 0, - 1000 ];
	SV_Physics_Step( monster );
	same( sounds.length, 0, 'FL_MONSTER has no landing sound' );
	landed = false;
	const crate = point( 2, [ 0, 0, 200 ] );
	crate.v.movetype = MOVETYPE_STEP;
	crate.v.velocity = [ 0, 0, - 1000 ];
	SV_Physics_Step( crate );
	same( sounds[ 0 ], 'fx/thngland.wav', 'a non-monster uses the Hexen landing sound' );
	GameProfile_Set( profileBefore );

} );

Deno.test( 'a real Hexen map runs and its pushables move (owned data only)', async () => {

	const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
	if ( ! existsSync( HEXEN + '/pak1.pak' ) || ! existsSync( HEXEN + '/progs.dat' ) ) {

		console.log( 'SKIP: the supplied Hexen II installation is not present' );
		return;

	}
	GameProfile_Set( GAME_PROFILES.hexen2 );
	const pak = await import( '../src/engine/common/pak.js' );
	const { VID_SetPalette } = await import( '../src/engine/render/vid.js' );
	const { Mod_Init } = await import( '../src/engine/render/gl_model.js' );
	const { PR_InitBuiltins } = await import( '../src/engine/server/pr_cmds.js' );
	const { SV_SpawnServer } = await import( '../src/engine/server/sv_main.js' );
	const { Cbuf_Init, Cmd_Init } = await import( '../src/engine/common/cmd.js' );
	const { Host_InitCommands } = await import( '../src/engine/server/host_cmd.js' );
	const { sv, svs, client_t } = await import( '../src/engine/server/server.js' );
	const { cls, ca_dedicated } = await import( '../src/engine/client/client.js' );
	const { SZ_Alloc } = await import( '../src/engine/common/common.js' );
	const vars = await import( '../src/engine/common/cvar.js' );
	const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
	const { skill } = await import( '../src/engine/server/host.js' );
	for ( const name of [ 'pak0.pak', 'pak1.pak' ] ) {

		const raw = readFileSync( HEXEN + '/' + name );
		pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-' + name, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	// The base data1 keeps progs.dat, strings.txt and hexen.rc loose beside the paks.
	const loose = [];
	for ( const name of [ 'progs.dat', 'strings.txt', 'hexen.rc' ] )
		if ( existsSync( HEXEN + '/' + name ) ) loose.push( { name, data: new Uint8Array( readFileSync( HEXEN + '/' + name ) ) } );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-loose', pak.COM_BuildPack( loose ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	PR_InitBuiltins();
	Cbuf_Init();
	Cmd_Init();
	Host_InitCommands();
	for ( const value of [ r_hdr, skill, sv_gravity ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
	vars.Cvar_SetValue( 'r_hdr', 0 );
	vars.Cvar_SetValue( 'skill', 1 );
	vars.Cvar_SetValue( '_cl_playerclass', 1 );
	svs.maxclients = svs.maxclientslimit = 1;
	svs.clients = [ new client_t() ];
	SZ_Alloc( svs.clients[ 0 ].message, 32768 );
	sv.active = false;
	cls.state = ca_dedicated;
	SV_SpawnServer( 'village2' );
	check( sv.active && sv.name === 'village2', 'the real server starts village2' );
	SV_SetFrametime( 0.1 );

	const pushables = sv.edicts.filter( ent => ent && ! ent.free && ent.v.movetype === MOVETYPE_PUSHPULL );
	check( pushables.length > 0, 'village2 carries native brush_pushable entities' );
	let error = null;
	try {

		for ( let frame = 0; frame < 5; frame ++ ) {

			SV_Physics();
			hexenGlobals.time = sv.time;

		}
		const before = pushables.map( ent => [ ...ent.v.origin ] );
		for ( const ent of pushables ) {

			ent.v.flags = ( ent.v.flags | 0 ) & ~ FL_ONGROUND;
			ent.v.velocity = [ 40, 0, 40 ];

		}
		for ( let frame = 0; frame < 5; frame ++ ) {

			SV_Physics();
			hexenGlobals.time = sv.time;

		}
		let moved = 0;
		for ( let i = 0; i < pushables.length; i ++ ) {

			const ent = pushables[ i ];
			if ( ent.free ) continue;
			moved += Math.abs( ent.v.origin[ 0 ] - before[ i ][ 0 ] ) + Math.abs( ent.v.origin[ 2 ] - before[ i ][ 2 ] );

		}
		check( moved > 1, 'pushables moved under native step physics: ' + moved );

	} catch ( e ) {

		error = e;

	}
	GameProfile_Set( profileBefore );
	check( error === null, 'the real Hexen map ran without a gamecode error: ' + ( error?.message ?? '' ) );

} );
