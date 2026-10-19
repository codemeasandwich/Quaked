/**
 * @module engine/progs/hexen2_server_cmds
 *
 * Hexen II server builtins that act on the world's entities and messages: light styles, sounds, broadcast print,
 * spawn, remove, entity print and the debug break. They reuse the port's edict allocator, console and injected sound
 * entry point, and register into the Hexen dispatcher when the server loads the module.
 *
 * Types: plain values and functions; no exported classes.
 * State: none here; the server holds light styles, edicts and clients.
 * Errors: the native program errors for a bad light style, an un-precached sound, removing the world, or break().
 */

import { ED_Alloc, ED_Free, ED_Print } from './pr_edict.js';
import { sv, G_STRING, G_INT, G_INT_SET, G_FLOAT, G_FLOAT_SET, G_EDICT, G_EDICTNUM, G_VECTOR, PROG_TO_EDICT, pr_global_struct, pr_argc, pr_xfunction, svs, PR_GetString, RETURN_EDICT } from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_RETURN } from './pr_comp.js';
import { PR_RunError, PR_HostError } from './pr_exec.js';
import { Con_Printf } from '../common/console.js';
import { MSG_WriteByte, MSG_WriteString, MSG_WriteShort, MSG_WriteCoord, MSG_WriteAngle, MSG_WriteLong, MSG_WriteChar } from '../common/common.js';
import { MAX_LIGHTSTYLES } from '../common/quakedef.js';
import { svc_print, svc_stufftext } from '../common/protocol.js';
import { anglemod } from '../common/mathlib.js';
import { SV_MoveToGoal } from '../server/sv_move.js';
import { PF_checkclient, PF_aim, PF_findradius } from '../server/pr_cmds.js';
import { SV_StartSound, SV_StartParticle } from '../server/sv_phys.js';
import { Hexen2_RegisterBuiltins } from './hexen2_cmds.js';

function varString( first ) {

	let out = '';
	for ( let i = first; i < pr_argc; i ++ ) out += PR_GetString( pr_global_int( OFS_PARM0 + i * 3 ) );
	return out;

}

// G_INT without importing the helper name that is already used below
function pr_global_int( o ) { return G_INT( o ); }

// #18 find(entity start, .field, string match): the next edict after start whose field string matches; the native
// loop runs forward from NEXT_EDICT(start) and stops at the world, so it never wraps back past the start.
function find() {

	const start = G_EDICTNUM( OFS_PARM0 ), fieldOfs = G_INT( OFS_PARM1 ), match = G_STRING( OFS_PARM2 );
	if ( fieldOfs < 0 || fieldOfs >= sv.edicts[ 0 ]._entityfields ) PR_RunError( 'find: bad field offset %i', fieldOfs );
	for ( let index = start + 1; index < sv.num_edicts; index ++ ) {

		const ent = sv.edicts[ index ];
		if ( ! ent || ent.free ) continue;
		if ( PR_GetString( ent._fieldAccessor.getInt32( fieldOfs ) ) === match ) { RETURN_EDICT( ent ); return; }

	}
	RETURN_EDICT( sv.edicts[ 0 ] );

}

// #49 changeyaw(): turn self.angles[YAW] toward ideal_yaw at up to 20 degrees a frame, the native body
function changeyaw() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const current = anglemod( ent.v.angles[ 1 ] ), ideal = ent.v.ideal_yaw;
	if ( current === ideal ) return;
	let move = ideal - current;
	if ( ideal > current ) { if ( move >= 180 ) move -= 360; }
	else if ( move <= - 180 ) move += 360;
	if ( move > 20 ) move = 20;
	else if ( move < - 20 ) move = - 20;
	ent.v.angles = [ ent.v.angles[ 0 ], anglemod( current + move ), ent.v.angles[ 2 ] ];

}

// #66 setclass(entity, class): native PF_setclass. Sends the client the `playerclass` command and records the class
// on the edict and the client record at once, so the gamecode's class-stat pass sees the chosen class.
function setclass() {

	const index = G_EDICTNUM( OFS_PARM0 ), ent = G_EDICT( OFS_PARM0 ), newclass = G_FLOAT( OFS_PARM1 ) | 0;
	if ( index < 1 || index > svs.maxclients ) { Con_Printf( 'tried to change class of a non-client\n' ); return; }
	const client = svs.clients[ index - 1 ];
	if ( client && client.message ) {

		MSG_WriteByte( client.message, svc_stufftext );
		MSG_WriteString( client.message, 'playerclass ' + newclass + '\n' );

	}
	ent.v.playerclass = newclass;
	if ( client ) client.playerclass = newclass;

}

// #63 advanceframe(start, end): the native self.frame advance with its 0/1/2 result
function advanceframe() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const start = G_FLOAT( OFS_PARM0 ), end = G_FLOAT( OFS_PARM1 );
	let result;
	if ( ent.v.frame < start || ent.v.frame > end ) { ent.v.frame = start; result = 0; }
	else if ( ent.v.frame === end ) { ent.v.frame = start; result = 1; }
	else { ent.v.frame ++; result = ent.v.frame === end ? 2 : 0; }
	G_FLOAT_SET( OFS_RETURN, result );

}

// #65 rewindframe(start, end): the native reverse advance
function rewindframe() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const start = G_FLOAT( OFS_PARM0 ), end = G_FLOAT( OFS_PARM1 );
	let result;
	if ( ent.v.frame > start || ent.v.frame < end ) { ent.v.frame = start; result = 0; }
	else if ( ent.v.frame === end ) { ent.v.frame = start; result = 1; }
	else { ent.v.frame --; result = ent.v.frame === end ? 2 : 0; }
	G_FLOAT_SET( OFS_RETURN, result );

}

// #83 advanceweaponframe(start, end): the native weapon-frame cycle with its four states
function advanceweaponframe() {

	const ent = PROG_TO_EDICT( pr_global_struct.self );
	const start = G_FLOAT( OFS_PARM0 ), end = G_FLOAT( OFS_PARM1 );
	let state;
	if ( ( end > start && ( ent.v.weaponframe > end || ent.v.weaponframe < start ) )
		|| ( end < start && ( ent.v.weaponframe < end || ent.v.weaponframe > start ) ) ) {

		ent.v.weaponframe = start; state = 1;

	} else if ( ent.v.weaponframe === end ) { ent.v.weaponframe = start; state = 2; }
	else {

		if ( start > end ) ent.v.weaponframe = ent.v.weaponframe - 1;
		else if ( start < end ) ent.v.weaponframe = ent.v.weaponframe + 1;
		state = ent.v.weaponframe === end ? 3 : 0;

	}
	G_FLOAT_SET( OFS_RETURN, state );

}

// #69 makestatic(entity): the native signon static spawn (svc_spawnstatic is 20 in the Hexen II protocol)
function makestatic() {

	const ent = G_EDICT( OFS_PARM0 );
	MSG_WriteByte( sv.signon, 20 );
	MSG_WriteShort( sv.signon, ent.v.modelindex | 0 );
	MSG_WriteShort( sv.signon, ent.v.frame | 0 );
	MSG_WriteByte( sv.signon, ent.v.colormap | 0 );
	MSG_WriteByte( sv.signon, ent.v.skin | 0 );
	for ( let i = 0; i < 3; i ++ ) {

		MSG_WriteCoord( sv.signon, ent.v.origin[ i ] );
		MSG_WriteAngle( sv.signon, ent.v.angles[ i ] );

	}
	ED_Free( ent );

}

// #74 ambientsound(position, sample, volume, attenuation): the native signon static sound (svc_spawnstaticsound 29)
function ambientsound() {

	const position = G_VECTOR( OFS_PARM0 ), sample = G_STRING( OFS_PARM1 );
	const volume = G_FLOAT( OFS_PARM2 ), attenuation = G_FLOAT( OFS_PARM3 );
	let index = - 1;
	for ( let i = 0; i < sv.sound_precache.length; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { index = i; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( index < 0 ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	recordSound( 'ambient', 0, 0, sample, volume, attenuation, position );
	MSG_WriteByte( sv.signon, 29 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.signon, position[ i ] );
	MSG_WriteShort( sv.signon, index ); // the mission-pack/private session ambient index is a word
	MSG_WriteByte( sv.signon, ( volume * 255 ) | 0 );
	MSG_WriteByte( sv.signon, ( attenuation * 64 ) | 0 );

}

// #35 lightstyle(style, value): the server-side style table (clients are told by the normal update path)
function lightstyle() {

	const style = G_FLOAT( OFS_PARM0 ) | 0, value = G_STRING( OFS_PARM1 );
	if ( style < 0 || style >= MAX_LIGHTSTYLES ) PR_RunError( 'lightstyle: bad style %i', style );
	sv.lightstyles[ style ] = value;

}

// Sound events for the local client bridge (a listen server plays its own game's sounds without a network round
// trip). Bounded: if no client drains them, the oldest are dropped rather than growing without limit.
const pendingSounds = [];
const PENDING_SOUND_LIMIT = 64;

/**
 * Drains the sound events the gamecode produced, oldest first. The audio bridge (engine/client/hexen2_audio.js)
 * consumes them for a local session; a networked client still receives the same sounds through SV_StartSound.
 *
 * @returns {Array<{ kind: string, entity: number, channel: number, sample: string, volume: number,
 *   attenuation: number, origin: ReadonlyArray<number> }>} the events, then empties the queue
 */
export function Hexen2_DrainSoundEvents() {

	const events = pendingSounds.slice();
	pendingSounds.length = 0;
	return events;

}

function recordSound( kind, entity, channel, sample, volume, attenuation, origin ) {

	if ( pendingSounds.length >= PENDING_SOUND_LIMIT ) pendingSounds.shift();
	pendingSounds.push( Object.freeze( { kind, entity, channel, sample, volume, attenuation, origin: Object.freeze( [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ] ) } ) );

}

// #48 particle(origin, direction, color, count): the existing standard particle effect
function particle() {

	if ( typeof SV_StartParticle === 'function' )
		SV_StartParticle( G_VECTOR( OFS_PARM0 ), G_VECTOR( OFS_PARM1 ), G_FLOAT( OFS_PARM2 ), G_FLOAT( OFS_PARM3 ) );

}

// #86 particle4(origin, radius, color, effect, count): Hexen's radius cloud. The port has only the standard particle
// temp entity, so the burst is emitted at the origin with no spread; the radius/effect fields are recorded as a
// pending presentation divergence (no gameplay reads them). This keeps the attack path running without inventing a
// payload the client cannot decode.
function particle4() {

	if ( typeof SV_StartParticle === 'function' )
		SV_StartParticle( G_VECTOR( OFS_PARM0 ), G_VECTOR( new Float32Array( 3 ) ), G_FLOAT( OFS_PARM2 ), G_FLOAT( OFS_PARM4 ) );

}

// #52-59 writebyte/char/short/long/angle/coord/string/entity(destination, value): the native message writers.
// Destinations are MSG_BROADCAST (datagram), MSG_ONE (that client's message), MSG_ALL (reliable datagram) and
// MSG_INIT (signon); an invalid destination is a script error.
const MSG_BROADCAST = 0, MSG_ONE = 1, MSG_ALL = 2, MSG_INIT = 3;
function writeDestination() {

	const destination = G_FLOAT( OFS_PARM0 ) | 0;
	if ( destination === MSG_BROADCAST ) return sv.datagram;
	if ( destination === MSG_ALL ) return sv.reliable_datagram;
	if ( destination === MSG_INIT ) return sv.signon;
	if ( destination === MSG_ONE ) {

		const ent = PROG_TO_EDICT( pr_global_struct.msg_entity ), index = G_EDICTNUM( pr_global_struct.msg_entity );
		if ( index < 1 || index > svs.maxclients ) PR_RunError( 'write: not a client\n' );
		const client = svs.clients[ index - 1 ];
		return client?.message ?? null;

	}
	PR_RunError( 'write: bad destination %i', destination );

}

const writeByte = () => { const d = writeDestination(); if ( d ) MSG_WriteByte( d, G_FLOAT( OFS_PARM1 ) | 0 ); };
const writeChar = () => { const d = writeDestination(); if ( d ) MSG_WriteChar( d, G_FLOAT( OFS_PARM1 ) | 0 ); };
const writeShort = () => { const d = writeDestination(); if ( d ) MSG_WriteShort( d, G_FLOAT( OFS_PARM1 ) | 0 ); };
const writeLong = () => { const d = writeDestination(); if ( d ) MSG_WriteLong( d, G_FLOAT( OFS_PARM1 ) | 0 ); };
const writeAngle = () => { const d = writeDestination(); if ( d ) MSG_WriteAngle( d, G_FLOAT( OFS_PARM1 ) ); };
const writeCoord = () => { const d = writeDestination(); if ( d ) MSG_WriteCoord( d, G_FLOAT( OFS_PARM1 ) ); };
const writeString = () => { const d = writeDestination(); if ( d ) MSG_WriteString( d, G_STRING( OFS_PARM1 ) ); };
const writeEntity = () => { const d = writeDestination(); if ( d ) MSG_WriteShort( d, G_EDICTNUM( OFS_PARM1 ) ); };

// #88 starteffect(type, ...): allocate a bounded server effect slot and return its index. The port has no effect
// transmission/render codec yet (recorded divergence: the gamecode's effect lifetime works, clients see nothing), so
// the slot records the native type and time for a later SV_SendEffect-style message.
function starteffect() {

	const type = G_FLOAT( OFS_PARM0 ) | 0;
	if ( type <= 0 ) PR_RunError( 'starteffect: bad type %i', type );
	sv.hexenEffects = sv.hexenEffects ?? new Array( 256 ).fill( null );
	let index = - 1;
	for ( let i = 0; i < sv.hexenEffects.length; i ++ ) {

		const effect = sv.hexenEffects[ i ];
		if ( effect === null || ( effect.expire > 0 && effect.expire <= sv.time ) ) { index = i; break; }

	}
	if ( index < 0 ) PR_RunError( 'MAX_EFFECTS reached' );
	sv.hexenEffects[ index ] = { type, time: sv.time, expire: 0 };
	G_FLOAT_SET( OFS_RETURN, index );

}

// #89 endeffect(type, index): drop the effect slot the gamecode names
function endeffect() {

	const index = G_FLOAT( OFS_PARM1 ) | 0;
	if ( index < 0 || index >= 256 ) PR_RunError( 'endeffect: bad index %i', index );
	if ( sv.hexenEffects && sv.hexenEffects[ index ] ) sv.hexenEffects[ index ] = null;

}

// #93 spawntemp(): a temporary edict for effects. The port has no per-frame temp pool yet, so this allocates a normal
// edict (recorded divergence: cleanup is left to the gamecode's own remove/think rather than a frame-end sweep).
function spawntemp() {

	const ed = ED_Alloc();
	if ( !ed ) return;
	RETURN_EDICT( ed );

}

// #8 sound(entity, channel, sample, volume, attenuation): the existing SV_StartSound path
function sound() {

	const ent = G_EDICT( OFS_PARM0 ), channel = G_FLOAT( OFS_PARM1 ) | 0, sample = G_STRING( OFS_PARM2 );
	const volume = G_FLOAT( OFS_PARM3 ), attenuation = G_FLOAT( OFS_PARM4 );
	if ( channel < 0 || channel > 7 ) PR_RunError( 'sound: channel %i', channel );
	let precached = false;
	for ( let i = 0; i < sv.sound_precache.length; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { precached = true; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( ! precached ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	recordSound( 'sound', ent.index, channel, sample, volume, attenuation, ent.v.origin );
	if ( typeof SV_StartSound === 'function' )
		SV_StartSound( ent, channel, sample, ( volume * 255 ) | 0, attenuation );

}

// #23 bprint(text...): broadcast print; with no clients it reaches the server console (the native broadcast too)
// #21 stuffcmd(entity, text...): a client command (native PF_stuffcmd writes svc_stufftext to that client)
function stuffcmd() {

	const index = G_EDICTNUM( OFS_PARM0 );
	if ( index < 1 || index > svs.maxclients ) { Con_Printf( 'stuffcmd: not a client\n' ); return; }
	const client = svs.clients[ index - 1 ];
	if ( ! client || ! client.message ) return;
	MSG_WriteByte( client.message, svc_stufftext );
	MSG_WriteString( client.message, varString( 1 ) );

}

// #24 sprint(entity, text...): a message to one client's console, as the native PF_sprint writes it
function sprint() {

	const index = G_EDICTNUM( OFS_PARM0 );
	if ( index < 1 || index > svs.maxclients ) { Con_Printf( 'tried to sprint to a non-client\n' ); return; }
	const client = svs.clients[ index - 1 ];
	if ( ! client || ! client.message ) return;
	MSG_WriteByte( client.message, svc_print );
	MSG_WriteString( client.message, varString( 1 ) );

}

function bprint() {

	Con_Printf( '%s', varString( 0 ) );

}

// #10 error(text...) and #11 objerror(text...): the native terminal object errors (self is dumped)
function errorBuiltin() {

	const message = varString( 0 );
	Con_Printf( '======SERVER ERROR in %s:\n%s\n', pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?', message );
	PR_HostError( 'Program error: ' + message + ' (in ' + ( pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?' ) + ')' );

}

function objerror() {

	const message = varString( 0 ), ent = PROG_TO_EDICT( pr_global_struct.self );
	Con_Printf( '======OBJECT ERROR in %s:\n%s\n', pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?', message );
	ED_Print( ent );
	ED_Free( ent );
	PR_HostError( 'Program error: ' + message + ' (in ' + ( pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?' ) + ')' );

}

// #14 spawn(): allocate an edict and return it
function spawn() { RETURN_EDICT( ED_Alloc() ); }

// #15 remove(entity)
function remove() {

	const ent = G_EDICT( OFS_PARM0 );
	if ( ent === sv.edicts[ 0 ] ) PR_RunError( 'Tried to remove world' );
	ED_Free( ent );

}

// #31 eprint(entity): the entity dump
function eprint() { ED_Print( G_EDICT( OFS_PARM0 ) ); }

// #6 break(): the debug break is a deliberate program error in this port, never a silent no-op
function breakBuiltin() { PR_RunError( 'break statement' ); }

/** The server builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_SERVER_BUILTINS = Object.freeze( {
	6: breakBuiltin, 8: sound, 10: errorBuiltin, 11: objerror, 14: spawn, 15: remove, 17: PF_checkclient, 18: find, 21: stuffcmd, 52: writeByte, 53: writeChar, 54: writeShort, 55: writeLong, 56: writeAngle, 57: writeCoord, 58: writeString, 59: writeEntity, 88: starteffect, 89: endeffect, 93: spawntemp, 22: PF_findradius, 23: bprint, 24: sprint, 31: eprint, 35: lightstyle, 44: PF_aim, 48: particle, 49: changeyaw, 63: advanceframe, 65: rewindframe, 66: setclass, 67: SV_MoveToGoal, 69: makestatic, 74: ambientsound, 83: advanceweaponframe, 86: particle4
} );

Hexen2_RegisterBuiltins( HEXEN2_SERVER_BUILTINS );
