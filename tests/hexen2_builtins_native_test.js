// The Hexen II builtin layer against uhexen2: the shrunken layer tables, the 56/57 coord/angle fix, the native
// builtin bodies the port was missing (centerprint, tracearea, developer prints, particles, plaque, rain, getstring,
// localcmd, setspawnparms, Portal's white flash/sound position, debug toggles), effect expiry and save/load, the native
// temporary-edict pool, makestatic's scale/drawflags/abslight, protocol-wide sound indexes, aim/traceline/walkmove/
// movetogoal/rint semantics, and the strings/puzzles/infolist/maplist loaders. plan sections 4/5, §7.
import { existsSync, readFileSync } from 'node:fs';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { model_t } from '../src/engine/render/gl_model_types.js';
import { set_loadmodel } from '../src/engine/render/gl_model_common.js';
import { Mod_LoadBrushModel } from '../src/engine/render/gl_model_bsp.js';
import { SV_ClearWorld, SV_LinkEdict, SV_Move, SV_PointContents, SV_TestEntityPosition } from '../src/engine/server/world.js';
import { PR_LoadProgs, PR_AllocEdicts } from '../src/engine/progs/pr_edict.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import {
	pr_global_struct, pr_globals, PR_SetSV, PR_SetSVS, PR_SetTempString, G_STRING,
	sv as progsSv, svs as progsSvs,
} from '../src/engine/progs/progs.js';
import { sv as serverSv, svs as serverSvs, ss_loading, ss_active, SOLID_BSP, SOLID_BBOX, MOVETYPE_PUSH, MOVETYPE_NONE, FL_ONGROUND } from '../src/engine/server/server.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_PARM5, OFS_PARM6, OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import { PROTOCOL_LARGE, PROTOCOL_VERSION, svc_centerprint, svc_spawnstatic, svc_stufftext } from '../src/engine/common/protocol.js';
import { HEXEN2_SERVER_MESSAGES } from '../src/engine/common/hexen2_protocol.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { HEXEN2_CORE_BUILTINS } from '../src/engine/progs/hexen2_cmds.js';
import { HEXEN2_WORLD_BUILTINS } from '../src/engine/progs/hexen2_world_cmds.js';
import { HEXEN2_PRECACHE_BUILTINS } from '../src/engine/progs/hexen2_precache_cmds.js';
import {
	HEXEN2_SERVER_BUILTINS, Hexen2_DrainSoundEvents, Hexen2_SaveEffects, Hexen2_LoadEffects,
	Hexen2_EffectExpireTime,
} from '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_ReserveTempEdicts, Hexen2_ED_Alloc_Temp, Hexen2_TempEdictStart, Hexen2_IsTempEdict } from '../src/engine/progs/hexen2_temp_edicts.js';
import { Hexen2_WriteParticle2, Hexen2_WriteParticle3, Hexen2_WriteParticle4, Hexen2_ReadParticle } from '../src/engine/common/hexen2_effects.js';
import { Hexen2_ReadStartEffect, Hexen2_ReadEndEffect, CE } from '../src/engine/common/hexen2_effectwire.js';
import {
	Hexen2_LoadStrings, Hexen2_GetHostString, Hexen2_HostStringCount,
	Hexen2_LoadPuzzleStrings, Hexen2_FindPuzzleString, Hexen2_PuzzleStringCount, Hexen2_GetPuzzleString,
	Hexen2_LoadInfoStrings, Hexen2_GetInfoString, Hexen2_InfoStringCount,
	Hexen2_LoadMapList, Hexen2_ProgForMap,
} from '../src/engine/common/hexen2_text_resources.js';
import { Cbuf_Init, Cmd_AddCommand, Cbuf_Execute } from '../src/engine/common/cmd.js';
import { installServerCallbacks } from './helpers/hexen2_server_setup.mjs';
import { SV_SetState } from '../src/engine/server/sv_phys.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import { pr_trace, PR_SetTrace } from '../src/engine/progs/progs.js';
import { sv_aim } from '../src/engine/server/sv_main.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const near = ( a, b, m ) => check( Math.abs( a - b ) < 0.001, `${m}: ${a} != ${b}` );
const HEXEN = '/Users/bri/quaked/Hexen 2/data1';
const setF = ( o, v ) => pr_globals.setFloat( o, v ), setI = ( o, v ) => pr_globals.setInt32( o, v );
const getF = o => pr_globals.getFloat( o ), getI = o => pr_globals.getInt32( o );
const call = ( number, context = { random: () => 0.5 } ) => callProfileBuiltin( number, context );
const string = text => PR_SetTempString( text );

function initBuffer( buffer, size ) {

	buffer.data = new Uint8Array( size );
	buffer.maxsize = size;
	buffer.cursize = 0;
	buffer.allowoverflow = true;
	buffer.overflowed = false;

}

function bytes( buffer ) { return buffer.data.subarray( 0, buffer.cursize ); }
function reset( buffer ) { buffer.cursize = 0; buffer.overflowed = false; }

function setup() {

	if ( ! existsSync( HEXEN + '/pak0.pak' ) ) return null;
	const raw = readFileSync( HEXEN + '/pak0.pak' );
	pak.COM_AddPack( pak.COM_LoadPackFile( 'h2-native-test-pak0.pak', raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	GameProfile_Set( 'hexen2' );
	const progsBytes = readFileSync( HEXEN + '/progs.dat' );
	PR_LoadProgs( progsBytes.buffer.slice( progsBytes.byteOffset, progsBytes.byteOffset + progsBytes.byteLength ) );

	const map = new model_t(); map.name = 'maps/demo1.bsp'; set_loadmodel( map );
	const bsp = pak.COM_FindFile( 'maps/demo1.bsp' ).data;
	Mod_LoadBrushModel( map, bsp.buffer.slice( bsp.byteOffset, bsp.byteOffset + bsp.byteLength ) );

	const sv = serverSv, svs = serverSvs;
	PR_SetSV( sv ); PR_SetSVS( svs );
	sv.name = 'demo1'; sv.worldmodel = map; sv.protocol = PROTOCOL_LARGE; sv.time = 1; sv.state = ss_loading;
	sv.max_edicts = 600;
	sv.models = new Array( 512 ).fill( null ); sv.models[ 0 ] = map;
	sv.model_precache = new Array( 512 ).fill( null ); sv.model_precache[ 0 ] = 'maps/demo1.bsp';
	sv.sound_precache = new Array( 512 ).fill( null ); sv.sound_precache[ 0 ] = '';
	sv.edicts = PR_AllocEdicts( 600, 392 );
	sv.max_temp_edicts = 4;
	svs.maxclients = 2;

	const makeClient = ( index, name ) => {

		const client = {
			name, active: true, spawned: true, state: 1, message: {}, spawn_parms: new Array( 16 ).fill( 0 ),
			edict: sv.edicts[ index + 1 ], cmd: { viewangles: [ 0, 0, 0 ] },
		};
		initBuffer( client.message, 1024 );
		return client;

	};
	svs.clients = [ makeClient( 0, 'anyx' ), makeClient( 1, 'other' ) ];

	sv.num_edicts = svs.maxclients + 1;
	const world = sv.edicts[ 0 ];
	world.v.solid = SOLID_BSP; world.v.movetype = MOVETYPE_PUSH; world.v.modelindex = 0;
	SV_ClearWorld();
	Hexen2_ReserveTempEdicts();

	initBuffer( sv.datagram, 1024 );
	initBuffer( sv.reliable_datagram, 1024 );
	initBuffer( sv.signon, 8192 );

	SV_SetState( sv, svs, pr_global_struct );
	installServerCallbacks( { SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_PointContents, PR_ExecuteProgram } );

	const spawn = ( () => {

		for ( const block of map.entities.split( '}' ) ) {

			if ( ! block.includes( 'info_player_start' ) ) continue;
			const match = /"origin"\s+"([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)"/.exec( block );
			if ( match ) return [ Number( match[ 1 ] ), Number( match[ 2 ] ), Number( match[ 3 ] ) ];

		}
		return [ 0, 0, 0 ];

	} )();
	return { sv, svs, map, spawn, world, clients: svs.clients };

}

const fixture = setup();

function inRange( index, start, count ) { return index >= start && index < start + count; }

Deno.test( 'the Hexen layers keep only numbers whose native body differs from Quake', () => {

	// same-meaning Quake builtins must come from the one table after U0, not from a Hexen copy
	for ( const number of [ 1, 2, 3, 4, 9, 12, 13, 14, 15, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 34,
		35, 37, 38, 40, 41, 43, 45, 46, 47, 48, 51, 68, 72, 73, 77 ] )
		check( ! ( number in HEXEN2_CORE_BUILTINS ) && ! ( number in HEXEN2_WORLD_BUILTINS )
			&& ! ( number in HEXEN2_PRECACHE_BUILTINS ) && ! ( number in HEXEN2_SERVER_BUILTINS ), 'builtin ' + number + ' is a duplicate of Quake' );

	// 60-66 and 79-114 are Hexen-only or native-different, plus the shared numbers the native bodies change
	for ( const number of [ 16, 19, 20, 32, 36, 44, 50, 60, 61, 62, 64, 67, 69, 74, 75, 76, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87,
		88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106 ] )
		check( number in HEXEN2_CORE_BUILTINS || number in HEXEN2_WORLD_BUILTINS
			|| number in HEXEN2_PRECACHE_BUILTINS || number in HEXEN2_SERVER_BUILTINS, 'builtin ' + number + ' has its native implementation' );

} );

Deno.test( '56 writes a coord and 57 an angle (the native order)', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture;
	reset( sv.datagram );
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 90 );
	check( call( 56 ), 'writecoord' );
	same( sv.datagram.cursize, 2, 'a coord is a short' );
	same( sv.datagram.data[ 0 ], 720 & 0xff, 'coord low byte' );
	same( sv.datagram.data[ 1 ], ( 720 >> 8 ) & 0xff, 'coord high byte' );
	reset( sv.datagram );
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 90 );
	check( call( 57 ), 'writeangle' );
	same( sv.datagram.cursize, 1, 'an angle is a byte' );
	same( sv.datagram.data[ 0 ], 64, '90 degrees at 256/360' );

} );

Deno.test( 'makestatic carries scale, drawflags and abslight and frees the edict', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture, ent = sv.edicts[ 2 ];
	ent.free = false; ent.v.modelindex = 300; ent.v.frame = 7; ent.v.colormap = 1; ent.v.skin = 2;
	ent.v.scale = 0.5; ent.v.drawflags = 3; ent.v.abslight = 0.25;
	ent.v.origin = [ 1.5, - 2, 3 ]; ent.v.angles = [ 10, 20, 30 ];
	reset( sv.signon );
	setI( OFS_PARM0, 2 );
	check( call( 69 ), 'makestatic' );
	// the unified static-entity body: opcode, word model, byte frame/colormap/skin, scale/drawflags/abslight bytes
	const data = bytes( sv.signon );
	same( data[ 0 ], 20, 'svc_spawnstatic' );
	same( data[ 1 ] | ( data[ 2 ] << 8 ), 300, 'the word model index' );
	same( data[ 3 ], 7, 'the byte frame, not a short' );
	same( data[ 4 ], 1, 'colormap' );
	same( data[ 5 ], 2, 'skin' );
	same( data[ 6 ], 50, 'scale * 100' );
	same( data[ 7 ], 3, 'drawflags' );
	same( data[ 8 ], 63, 'abslight * 255' );
	same( ent.free, true, 'the static edict is thrown away' );

} );

Deno.test( 'ambientsound and sound use the protocol-wide word sound index', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture, sample = 'sound/misc/tomb.wav';
	for ( let i = 1; i < 300; i ++ ) sv.sound_precache[ i ] = 'sound/misc/filler' + i + '.wav';
	sv.sound_precache[ 300 ] = sample;
	reset( sv.signon ); reset( sv.datagram );
	setF( OFS_PARM0, 1 ); setF( OFS_PARM0 + 1, 2 ); setF( OFS_PARM0 + 2, 3 );
	setI( OFS_PARM1, string( sample ) ); setF( OFS_PARM2, 0.5 ); setF( OFS_PARM3, 1 );
	check( call( 74 ), 'ambientsound' );
	same( bytes( sv.signon )[ 0 ], 29, 'svc_spawnstaticsound' );
	same( bytes( sv.signon )[ 7 ] | ( bytes( sv.signon )[ 8 ] << 8 ), 300, 'the 16-bit ambient index' );
	same( sv.signon.cursize, 11, 'opcode + three coords + word index + volume + attenuation' );
	Hexen2_DrainSoundEvents();

	sv.sound_precache[ 300 ] = sample;
	setI( OFS_PARM0, 1 ); setF( OFS_PARM1, 0 ); setI( OFS_PARM2, string( sample ) ); setF( OFS_PARM3, 1 ); setF( OFS_PARM4, 1 );
	check( call( 8 ), 'sound' );
	const data = bytes( sv.datagram );
	same( data[ 0 ], 6, 'svc_sound' );
	// volume 1.0 (255) and attenuation 1.0 are the defaults and are not sent: opcode, mask, channel, word index
	same( data[ 1 ], 0, 'no optional sound fields' );
	same( data[ 4 ] | ( data[ 5 ] << 8 ), 300, 'the 16-bit sound index' );
	Hexen2_DrainSoundEvents();
	sv.sound_precache.fill( null, 1, 301 );

} );

Deno.test( 'centerprint, localcmd, developer prints and the debug toggles are implemented', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv, clients } = fixture;
	reset( clients[ 0 ].message );
	setI( OFS_PARM0, 1 ); setI( OFS_PARM1, string( 'the door is open' ) );
	check( call( 73 ), 'centerprint' );
	same( bytes( clients[ 0 ].message )[ 0 ], svc_centerprint, 'svc_centerprint' );
	check( G_STRING( OFS_PARM1 ) === 'the door is open', 'the centerprint string survives' );

	Cbuf_Init();
	let ran = false;
	Cmd_AddCommand( 'hexen2_localcmd_test', () => { ran = true; } );
	setI( OFS_PARM0, string( 'hexen2_localcmd_test\n' ) );
	check( call( 46 ), 'localcmd' );
	Cbuf_Execute();
	same( ran, true, 'localcmd reached the command buffer' );

	// dprintf/dprintv take a game format string and one value; a malformed format is still only a developer print
	reset( sv.datagram );
	setI( OFS_PARM0, string( '%s %' ) ); setF( OFS_PARM1, 2.65 );
	check( call( 60 ), 'dprintf' );
	setI( OFS_PARM0, string( '%s %n' ) ); [ 1, 2, 3 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	check( call( 64 ), 'dprintv' );

	PR_SetTrace( false );
	check( call( 29 ), 'traceon' ); same( pr_trace, true, 'traceon sets pr_trace' );
	check( call( 30 ), 'traceoff' ); same( pr_trace, false, 'traceoff clears pr_trace' );
	const savedNumEdicts = sv.num_edicts; sv.num_edicts = 1;
	check( call( 28 ), 'coredump' );
	sv.num_edicts = savedNumEdicts;

} );

Deno.test( 'tracearea boxes the trace, traceline forces hull 0, and walkmove reads set_trace', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv, spawn } = fixture, ent = sv.edicts[ 2 ];
	ent.free = false; ent.v.origin = spawn; ent.v.mins = [ - 16, - 16, - 24 ]; ent.v.maxs = [ 16, 16, 32 ];
	SV_LinkEdict( ent, false );
	ent.v.hull = 5;

	// a line at the point hull reaches the same floor as a direct point move, and the entity's hull is restored
	const start = [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] + 200 ], end = [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] - 200 ];
	start.forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	end.forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	setF( OFS_PARM2, 0 ); setI( OFS_PARM3, 2 );
	check( call( 16 ), 'traceline' );
	const savedHull = ent.v.hull; ent.v.hull = 0;
	const point = SV_Move( start, [ 0, 0, 0 ], [ 0, 0, 0 ], end, 0, ent );
	ent.v.hull = savedHull;
	near( pr_global_struct.trace_fraction, point.fraction, 'the point-hull trace' );
	same( ent.v.hull, 5, 'the named hull is restored' );

	// tracearea with a real box sets the trace globals
	reset( sv.datagram );
	[ - 8, - 8, - 8 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	[ 8, 8, 8 ].forEach( ( v, i ) => setF( OFS_PARM3 + i, v ) );
	start.forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	end.forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	setF( OFS_PARM4, 0 ); setI( OFS_PARM5, 2 );
	check( call( 33 ), 'tracearea' );
	check( pr_global_struct.trace_fraction >= 0 && pr_global_struct.trace_fraction <= 1, 'tracearea fraction' );
	same( ent.v.hull, 5, 'tracearea restores the hull' );

	// walkmove's third argument writes the native trace globals; without it the old values stay
	pr_global_struct.self = 2; ent.v.flags = FL_ONGROUND; ent.v.origin = spawn;
	pr_global_struct.trace_fraction = 123;
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 0 ); setF( OFS_PARM2, 0 );
	check( call( 32 ), 'walkmove' );
	same( pr_global_struct.trace_fraction, 123, 'no set_trace keeps the globals' );
	pr_global_struct.trace_fraction = 123;
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 0 ); setF( OFS_PARM2, 1 );
	check( call( 32 ), 'walkmove with set_trace' );
	check( pr_global_struct.trace_fraction !== 123, 'set_trace writes the trace globals' );

} );

Deno.test( 'aim uses the shot origin and DAMAGE_YES, not Quake\'s DAMAGE_AIM', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv, spawn } = fixture, shooter = sv.edicts[ 2 ], target = sv.edicts[ 3 ];
	shooter.free = false; shooter.v.origin = [ spawn[ 0 ] + 10000, spawn[ 1 ], spawn[ 2 ] ]; shooter.v.hull = 5;
	target.free = false; target.v.origin = [ spawn[ 0 ] + 200, spawn[ 1 ] + 60, spawn[ 2 ] + 20 ];
	target.v.mins = [ - 20, - 20, - 20 ]; target.v.maxs = [ 20, 20, 20 ];
	target.v.solid = SOLID_BBOX; target.v.movetype = MOVETYPE_NONE;
	SV_LinkEdict( target, false );
	sv_aim.value = 0;
	pr_global_struct.v_forward = [ 1, 0, 0 ];

	// choose an open direction from the spawn so the first straight trace can miss the target cleanly
	const start = [ spawn[ 0 ], spawn[ 1 ], spawn[ 2 ] + 20 ];
	const directions = [ [ 1, 0, 0 ], [ 0, 1, 0 ], [ - 1, 0, 0 ], [ 0, - 1, 0 ] ];
	const forward = directions.find( dir => SV_Move( start, [ 0, 0, 0 ], [ 0, 0, 0 ],
		[ start[ 0 ] + 2048 * dir[ 0 ], start[ 1 ] + 2048 * dir[ 1 ], start[ 2 ] ], 0, shooter ).fraction === 1 )
		?? [ 1, 0, 0 ];
	const side = [ - forward[ 1 ], forward[ 0 ], 0 ];
	target.v.origin = [ start[ 0 ] + forward[ 0 ] * 120 + side[ 0 ] * 60, start[ 1 ] + forward[ 1 ] * 120 + side[ 1 ] * 60, start[ 2 ] ];
	SV_LinkEdict( target, true );
	pr_global_struct.v_forward = forward;

	const aimAt = takedamage => {

		target.v.takedamage = takedamage;
		setI( OFS_PARM0, 2 ); spawn.forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) ); setF( OFS_PARM2, 1000 );
		check( call( 44 ), 'aim' );
		return [ getF( OFS_RETURN ), getF( OFS_RETURN + 1 ), getF( OFS_RETURN + 2 ) ];

	};
	const atYes = aimAt( 1 );
	same( atYes.join( ',' ) !== forward.join( ',' ), true, 'DAMAGE_YES is aimable' );
	check( atYes[ 0 ] * forward[ 0 ] + atYes[ 1 ] * forward[ 1 ] < 1, 'the shot bends toward the target from the shot origin' );
	const atNoGrenade = aimAt( 2 );
	same( atNoGrenade.join( ',' ), forward.join( ',' ), 'Hexen DAMAGE_NO_GRENADE (2) is not an aim target' );

} );

Deno.test( 'particle2/3/4, particle explosions, plaques and rain write their native bodies', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture;
	reset( sv.datagram );
	[ 10, 20, 30 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	[ - 1, - 2, - 3 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 1, 2, 3 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	setF( OFS_PARM3, 300 ); setF( OFS_PARM4, 4 ); setF( OFS_PARM5, 5 );
	check( call( 42 ), 'particle2' );
	let decoded = Hexen2_ReadParticle( bytes( sv.datagram ) );
	check( decoded.ok, decoded.reason );
	same( decoded.kind, 'particle2', 'particle2 opcode' );
	same( decoded.effect.color, 300, 'the 16-bit colour' );
	same( decoded.effect.effect, 4, 'the effect' );

	reset( sv.datagram );
	[ 10, 20, 30 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	[ 8, 16, 24 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	setF( OFS_PARM2, 12 ); setF( OFS_PARM3, 2 ); setF( OFS_PARM4, 3 );
	check( call( 85 ), 'particle3' );
	decoded = Hexen2_ReadParticle( bytes( sv.datagram ) );
	check( decoded.ok, decoded.reason );
	same( decoded.kind, 'particle3', 'particle3 opcode' );
	same( decoded.effect.box.join( ',' ), '8,16,24', 'the box bytes' );

	reset( sv.datagram );
	[ 10, 20, 30 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	setF( OFS_PARM1, 32 ); setF( OFS_PARM2, 14 ); setF( OFS_PARM3, 6 ); setF( OFS_PARM4, 20 );
	check( call( 86 ), 'particle4' );
	decoded = Hexen2_ReadParticle( bytes( sv.datagram ) );
	check( decoded.ok, decoded.reason );
	same( decoded.kind, 'particle4', 'particle4 opcode' );
	same( decoded.effect.radius, 32, 'the radius is kept' );
	same( decoded.effect.effect, 6, 'the effect type is kept' );

	reset( sv.datagram );
	[ 10, 20, 30 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	setF( OFS_PARM1, 7 ); setF( OFS_PARM2, 9 ); setF( OFS_PARM3, 11 );
	check( call( 81 ), 'particleexplosion' );
	const explosion = bytes( sv.datagram );
	same( explosion[ 0 ], HEXEN2_SERVER_MESSAGES.particle_explosion, 'particle explosion opcode' );
	same( explosion[ 7 ] | ( explosion[ 8 ] << 8 ), 7, 'colour' );
	same( explosion[ 9 ] | ( explosion[ 10 ] << 8 ), 9, 'radius' );
	same( explosion[ 11 ] | ( explosion[ 12 ] << 8 ), 11, 'counter' );

	Hexen2_LoadStrings( 'zero\nfirst\nsecond\n' );
	reset( sv.datagram );
	setF( OFS_PARM0, 0 ); setF( OFS_PARM1, 2 );
	check( call( 79 ), 'plaque_draw' );
	same( bytes( sv.datagram )[ 0 ], HEXEN2_SERVER_MESSAGES.plaque, 'plaque opcode' );
	same( bytes( sv.datagram )[ 1 ] | ( bytes( sv.datagram )[ 2 ] << 8 ), 2, 'the plaque index' );

	reset( sv.datagram );
	[ 1, 2, 3 ].forEach( ( v, i ) => setF( OFS_PARM0 + i, v ) );
	[ 4, 5, 6 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 8, 16, 24 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	setF( OFS_PARM3, 1 ); setF( OFS_PARM3 + 1, 2 ); setF( OFS_PARM3 + 2, 3 );
	setF( OFS_PARM4, 13 ); setF( OFS_PARM5, 14 );
	check( call( 80 ), 'rain_go' );
	const rain = bytes( sv.datagram );
	same( rain[ 0 ], HEXEN2_SERVER_MESSAGES.raineffect, 'rain opcode' );
	same( rain.length, 19, 'the native rain body length' );

} );

Deno.test( 'getstring and setspawnparms read the host table and all 16 spawn parms', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv, clients } = fixture;
	Hexen2_LoadStrings( 'first\nsecond line\n' );
	same( Hexen2_HostStringCount(), 2, 'two host strings' );
	same( Hexen2_GetHostString( 1 ), 'first', '1-based host string' );
	setF( OFS_PARM0, 2 );
	check( call( 92 ), 'getstring' );
	same( G_STRING( OFS_RETURN ), 'second line', 'the engine string' );
	let threw = null;
	try { setF( OFS_PARM0, 0 ); call( 92 ); } catch ( error ) { threw = error; }
	check( threw !== null, 'index 0 is a native program error' );

	for ( let i = 0; i < 16; i ++ ) clients[ 0 ].spawn_parms[ i ] = i + 1;
	setI( OFS_PARM0, 1 );
	check( call( 78 ), 'setspawnparms' );
	same( pr_global_struct.parm1, 1, 'parm1' );
	same( pr_global_struct.parm16, 16, 'parm16' );

} );

Deno.test( 'Portal white flash, sound position and the sound channel helpers write the native messages', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture, ent = sv.edicts[ 2 ];
	ent.free = false; ent.v.origin = [ 10, 20, 30 ]; ent.v.mins = [ - 10, - 10, - 10 ]; ent.v.maxs = [ 10, 10, 10 ];
	SV_LinkEdict( ent, false );
	reset( sv.reliable_datagram );
	check( call( 104 ), 'doWhiteFlash' );
	const flash = bytes( sv.reliable_datagram );
	same( flash[ 0 ], svc_stufftext, 'svc_stufftext' );
	same( String.fromCharCode( ...flash.subarray( 1, flash.length - 1 ) ), 'wf\n', 'the wf command' );

	reset( sv.datagram );
	setI( OFS_PARM0, 2 ); setF( OFS_PARM1, 3 );
	check( call( 105 ), 'updatesoundpos' );
	const pos = bytes( sv.datagram );
	same( pos[ 0 ], HEXEN2_SERVER_MESSAGES.sound_update_pos, 'sound position opcode' );
	same( pos[ 1 ] | ( pos[ 2 ] << 8 ), ( 2 << 3 ) | 3, 'entity and channel word' );
	same( pos[ 3 ] | ( pos[ 4 ] << 8 ), 10 * 8, 'box centre x' );

	Hexen2_DrainSoundEvents();

} );

Deno.test( 'starteffect expires by native type, reuses slots, ends effects and saves/loads its data shape', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv } = fixture;
	sv.time = 1; sv.hexenEffects = null;
	reset( sv.reliable_datagram );
	setF( OFS_PARM0, CE.WHITE_SMOKE ); // 4: one second
	[ 1, 2, 3 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 0, 0, 1 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	setF( OFS_PARM3, 0.1 );
	check( call( 88 ), 'starteffect' );
	same( getF( OFS_RETURN ), 0, 'the first slot' );
	same( sv.hexenEffects[ 0 ].expire_time, 2, 'white smoke expires after one second' );
	const startMessage = Hexen2_ReadStartEffect( bytes( sv.reliable_datagram ) );
	check( startMessage.ok, startMessage.reason );
	same( startMessage.type, CE.WHITE_SMOKE, 'the native start effect message' );

	sv.time = 2;
	reset( sv.reliable_datagram );
	setF( OFS_PARM0, CE.GREEN_SMOKE );
	[ 4, 5, 6 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 0, 0, 1 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	setF( OFS_PARM3, 0.1 );
	check( call( 88 ), 'starteffect after expiry' );
	same( getF( OFS_RETURN ), 0, 'the expired slot is reused' );
	same( sv.hexenEffects[ 0 ].type, CE.GREEN_SMOKE, 'the reused slot holds the new type' );
	same( sv.hexenEffects[ 0 ].expire_time, 3, 'and its new one-second expiry' );

	// persistent effects never expire; bone shards live ten seconds and chunks three
	same( Hexen2_EffectExpireTime( CE.RAIN, 10 ), 0, 'rain is persistent' );
	same( Hexen2_EffectExpireTime( CE.FOUNTAIN, 10 ), 0, 'a fountain is persistent' );
	same( Hexen2_EffectExpireTime( CE.BONESHARD, 10 ), 20, 'bone shards live ten seconds' );
	same( Hexen2_EffectExpireTime( CE.CHUNK, 10 ), 13, 'chunks live three seconds' );

	reset( sv.reliable_datagram );
	setF( OFS_PARM1, 0 );
	check( call( 89 ), 'endeffect' );
	same( sv.hexenEffects[ 0 ], null, 'the slot is cleared' );
	const endMessage = Hexen2_ReadEndEffect( bytes( sv.reliable_datagram ) );
	check( endMessage.ok, endMessage.reason );
	same( endMessage.index, 0, 'the native end effect message' );

	// a rain slot and a bone-shard slot survive a save/load round trip with their expiry
	sv.time = 4;
	setF( OFS_PARM0, CE.RAIN );
	[ 0, 0, 0 ].forEach( ( v, i ) => setF( OFS_PARM1 + i, v ) );
	[ 100, 100, 100 ].forEach( ( v, i ) => setF( OFS_PARM2 + i, v ) );
	[ 10, 10, 10 ].forEach( ( v, i ) => setF( OFS_PARM3 + i, v ) );
	setF( OFS_PARM4, 7 ); setF( OFS_PARM5, 8 ); setF( OFS_PARM6, 0.5 );
	check( call( 88 ), 'persistent rain' );
	const saved = Hexen2_SaveEffects(), savedRain = saved.effects.find( effect => effect.type === CE.RAIN );
	check( savedRain !== undefined, 'a saved rain effect' );
	sv.hexenEffects = null;
	const loaded = Hexen2_LoadEffects( saved );
	check( loaded.ok, loaded.reason );
	same( sv.hexenEffects[ savedRain.index ].type, CE.RAIN, 'the rain type is restored' );
	same( sv.hexenEffects[ savedRain.index ].expire_time, 0, 'a persistent effect keeps no expiry' );

} );

Deno.test( 'spawntemp reuses the reserved pool and recycles the oldest slot', () => {

	check( fixture !== null, 'the supplied Hexen II pack' );
	const { sv, svs } = fixture;
	sv.max_temp_edicts = 3;
	sv.num_edicts = svs.maxclients + 1;
	const range = Hexen2_ReserveTempEdicts();
	same( range.start, Hexen2_TempEdictStart(), 'the pool starts after the clients' );
	same( range.count, 3, 'three temporary slots' );
	same( sv.num_edicts, range.start + 3, 'the slots are reserved' );
	same( Hexen2_IsTempEdict( range.start ), true, 'the first reserved slot' );
	same( Hexen2_IsTempEdict( range.start + 3 ), false, 'one past the pool' );

	sv.time = 1;
	const first = Hexen2_ED_Alloc_Temp();
	const second = Hexen2_ED_Alloc_Temp();
	const third = Hexen2_ED_Alloc_Temp();
	for ( const ed of [ first, second, third ] ) check( inRange( ed.index, range.start, 3 ), 'an edict inside the pool' );
	same( new Set( [ first.index, second.index, third.index ] ).size, 3, 'three distinct slots' );
	sv.time = 2;
	const recycled = Hexen2_ED_Alloc_Temp();
	same( recycled.index, first.index, 'the oldest slot is recycled' );

	pr_global_struct.self = 0;
	check( call( 93 ), 'spawntemp' );
	const returned = getI( OFS_RETURN );
	check( inRange( returned, range.start, 3 ), 'spawntemp returns a reserved slot' );

} );

Deno.test( 'strings, puzzles, infolist and maplist parse CR/LF content and expose lookup', () => {

	// the real data1 strings.txt, if present, loads through the same parser
	const stringsPath = HEXEN + '/strings.txt';
	if ( existsSync( stringsPath ) ) {

		const real = Hexen2_LoadStrings( readFileSync( stringsPath, 'utf8' ) );
		check( real.ok, real.reason );
		check( Hexen2_HostStringCount() > 0, 'the real host strings' );
		check( Hexen2_GetHostString( 1 ).length > 0, 'the first real host string' );

	}

	const mixed = Hexen2_LoadStrings( 'alpha\r\nbeta\r\ngamma\n' );
	check( mixed.ok, mixed.reason );
	same( mixed.count, 3, 'CRLF lines' );
	same( Hexen2_GetHostString( 2 ), 'beta', 'the second CRLF line' );
	same( Hexen2_GetHostString( 4 ), null, 'one past the 1-based table' );

	const puzzles = Hexen2_LoadPuzzleStrings( '2\nkey1 The first key\nsword The sword\nignored\n' );
	check( puzzles.ok, puzzles.reason );
	same( Hexen2_PuzzleStringCount(), 2, 'the declared puzzle count' );
	same( Hexen2_FindPuzzleString( 'KEY1' ), 'The first key', 'case-insensitive puzzle lookup' );
	same( Hexen2_FindPuzzleString( 'missing' ), null, 'an unknown puzzle piece' );

	const realPuzzles = '/Users/bri/quaked/Hexen 2/portals/puzzles.txt';
	if ( existsSync( realPuzzles ) ) {

		check( Hexen2_LoadPuzzleStrings( readFileSync( realPuzzles, 'utf8' ) ).ok, 'the real Portal puzzles.txt' );
		same( Hexen2_PuzzleStringCount() > 0, true, 'real puzzle entries' );
		check( Hexen2_GetPuzzleString( 0 ).shortName.length > 0, 'a real short name' );

	}

	const info = Hexen2_LoadInfoStrings( 'objective one\r\nobjective two\r\n' );
	check( info.ok, info.reason );
	same( Hexen2_InfoStringCount(), 2, 'two objective lines' );
	same( Hexen2_GetInfoString( 1 ), 'objective two', 'a 0-based objective line' );

	const maps = Hexen2_LoadMapList( '2\nruins ruiner.dat\nvillage1 hexen2.dat\n' );
	check( maps.ok, maps.reason );
	same( Hexen2_ProgForMap( 'maps/ruins.bsp' ), 'ruiner.dat', 'a map lookup with path and extension' );
	same( Hexen2_ProgForMap( 'VILLAGE1' ), 'hexen2.dat', 'a case-insensitive lookup' );
	same( Hexen2_ProgForMap( 'demo1' ), null, 'a map without an entry' );

	const realMapList = '/Users/bri/quaked/Hexen 2/portals/maplist.txt';
	if ( existsSync( realMapList ) ) {

		check( Hexen2_LoadMapList( readFileSync( realMapList, 'utf8' ) ).ok, 'the real Portal maplist.txt' );
		const entries = Hexen2_ProgForMap( 'demo1' );
		check( entries === null || typeof entries === 'string', 'the real maplist lookup answers a name or null' );

	}

} );
