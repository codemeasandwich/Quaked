/**
 * @module engine/progs/hexen2_server_cmds
 *
 * The Hexen II server builtins whose native body is not Quake's: the effect/particle messages (plaque, rain,
 * particle2/3/4, particle explosions), the native effects system (`starteffect`/`endeffect` with their expiry), the
 * temporary-edict spawn, the spawn-parm copy, Portal's white flash and sound-position update, the animation-frame
 * helpers, `setclass`/`lightstylestatic`/`lightstylevalue`, `matchAngleToSlope`, the objective bitmask and the sound
 * event bridge for a listen server.
 *
 * Builtins with the same body as Quake (spawn, remove, prints, light styles, writes, find, particle, changeyaw,
 * centerprint, localcmd, the debug dumps, precaches) are absent: the one profile table uses Quake's `PF_*`.
 * `changelevel` stays because Hexen's native form carries a start spot and chooses `changelevel2` for a hub transition.
 *
 * Types: plain values and functions; no exported classes.
 * State: the pending-sound queue and `sv.hexenEffects`; the queue is bounded.
 * Errors: the native program errors for a bad effect type/index, a bad sound channel, a non-client or a broken
 * temporary-edict reservation.
 */

import { ED_Free, ED_Print, ED_NewString } from './pr_edict.js';
import {
	sv, svs, G_STRING, G_INT, G_INT_SET, G_FLOAT, G_FLOAT_SET, G_EDICT, G_EDICTNUM, NUM_FOR_EDICT,
	G_VECTOR, PROG_TO_EDICT, pr_global_struct, pr_argc, pr_xfunction, PR_GetString, RETURN_EDICT,
} from './progs.js';
import { OFS_PARM0, OFS_PARM1, OFS_PARM2, OFS_PARM3, OFS_PARM4, OFS_PARM5, OFS_RETURN } from './pr_comp.js';
import { PR_RunError, PR_HostError } from './pr_exec.js';
import { Con_Printf } from '../common/console.js';
import { MSG_WriteByte, MSG_WriteString, MSG_WriteShort, MSG_WriteLong, MSG_WriteCoord, MSG_WriteAngle } from '../common/common.js';
import { Cbuf_AddText } from '../common/cmd.js';
import { MAX_LIGHTSTYLES } from '../common/quakedef.js';
import { svc_stufftext, svc_lightstyle } from '../common/protocol.js';
import { anglemod, AngleVectors, vec3_origin } from '../common/mathlib.js';
import { CE, Hexen2_EffectParams } from '../common/hexen2_effectwire.js';
import { SV_Move } from '../server/world.js';
import { SV_StartSound, SV_StopSound } from '../server/sv_phys.js';
import { sv_aim, SV_SoundLimit, SV_WriteIndex } from '../server/sv_main.js';
import { DAMAGE_YES, FL_ONGROUND, FL_FLY, FL_SWIM, NUM_SPAWN_PARMS, teamplay, ss_active } from '../server/server.js';
import {
	Hexen2_WriteNativeServiceByte, Hexen2_WriteNativeServiceShort, Hexen2_WriteNativeServiceEntity,
	Hexen2_WriteNativeServiceLong, Hexen2_WriteNativeServiceCoord, Hexen2_WriteNativeServiceAngle,
	Hexen2_WriteNativeServiceString,
} from '../server/hexen2_native_wire.js';
import {
	Hexen2_AppendMessage, Hexen2_WritePlaque, Hexen2_WriteRainEffect, Hexen2_WriteParticleExplosion,
	Hexen2_WriteSoundUpdatePos, Hexen2_WriteStaticEntity, Hexen2_WriteWhiteFlash, Hexen2_WriteParticle2Message,
	Hexen2_WriteParticle3Message, Hexen2_WriteParticle4Message, Hexen2_WriteStartEffectMessage, Hexen2_WriteEndEffectMessage,
} from './hexen2_builtin_wire.js';
import { Hexen2_ED_Alloc_Temp } from './hexen2_temp_edicts.js';
import { Hexen2_HostStringCount, Hexen2_GetHostString } from '../common/hexen2_text_resources.js';
import { Hexen2_NormalizeMapName } from '../common/hexen2_save.js';

const MAX_EFFECTS = 256;

function varString( first ) {

	let out = '';
	for ( let i = first; i < pr_argc; i ++ ) out += PR_GetString( G_INT( OFS_PARM0 + i * 3 ) );
	return out;

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

// #69 makestatic(entity): the native signon static spawn, with the scale/drawflags/abslight bytes, then the edict is
// thrown away as native does.
function makestatic() {

	const ent = G_EDICT( OFS_PARM0 );
	Hexen2_AppendMessage( sv.signon, Hexen2_WriteStaticEntity( ent ) );
	ED_Free( ent );

}

// #74 ambientsound(position, sample, volume, attenuation): the native signon static sound, indexed with the protocol's
// sound width (a word in the unified large protocol, as protocol 19 does natively).
function ambientsound() {

	const position = G_VECTOR( OFS_PARM0 ), sample = G_STRING( OFS_PARM1 );
	const volume = G_FLOAT( OFS_PARM2 ), attenuation = G_FLOAT( OFS_PARM3 );
	let index = - 1;
	const limit = SV_SoundLimit();
	for ( let i = 0; i < limit; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { index = i; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( index < 0 ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	recordSound( 'ambient', 0, 0, sample, volume, attenuation, position );
	MSG_WriteByte( sv.signon, 29 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.signon, position[ i ] );
	SV_WriteIndex( sv.signon, index ); // a byte in protocol 15, a word in the unified large protocol
	MSG_WriteByte( sv.signon, ( volume * 255 ) | 0 );
	MSG_WriteByte( sv.signon, ( attenuation * 64 ) | 0 );

}

// #35 lightstyle(style, value) is Quake's; #5 lightstylestatic is Portal's fixed letter style.
function lightstylestatic() {

	const style = G_FLOAT( OFS_PARM0 ) | 0;
	let value = G_FLOAT( OFS_PARM1 ) | 0;
	if ( style < 0 || style >= MAX_LIGHTSTYLES ) PR_RunError( 'lightstylestatic: bad style %i', style );
	value = Math.max( 0, Math.min( 25, value ) );
	const styleString = String.fromCharCode( 97 + value );
	sv.lightstyles[ style ] = styleString;
	if ( sv.state !== ss_active ) return;
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		if ( ! client || ! ( client.active || client.spawned ) || ! client.message ) continue;
		MSG_WriteByte( client.message, svc_lightstyle );
		MSG_WriteByte( client.message, style );
		MSG_WriteString( client.message, styleString );

	}

}

// Sound events for the local client bridge (a listen server plays its own game's sounds without a network round
// trip). Bounded: if no client drains them, the oldest are dropped rather than growing without limit.
const pendingSounds = [];
const PENDING_SOUND_LIMIT = 64;

/**
 * Drains the sound events the gamecode produced, oldest first. A listen server observes them for its local mixer; a
 * networked client still receives the same sounds through SV_StartSound.
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

// #8 sound(entity, channel, sample, volume, attenuation): the existing SV_StartSound path, with Hexen's word-wide
// sound indexes through the protocol helper and the local event queue a listen server can observe.
function sound() {

	const ent = G_EDICT( OFS_PARM0 ), channel = G_FLOAT( OFS_PARM1 ) | 0, sample = G_STRING( OFS_PARM2 );
	const volume = G_FLOAT( OFS_PARM3 ), attenuation = G_FLOAT( OFS_PARM4 );
	if ( channel < 0 || channel > 7 ) PR_RunError( 'sound: channel %i', channel );
	let precached = false;
	const limit = SV_SoundLimit();
	for ( let i = 1; i < limit; i ++ ) {

		if ( sv.sound_precache[ i ] === sample ) { precached = true; break; }
		if ( sv.sound_precache[ i ] == null ) break;

	}
	if ( ! precached ) { Con_Printf( 'no precache: %s\n', sample ); return; }
	recordSound( 'sound', ent.index, channel, sample, volume, attenuation, ent.v.origin );
	SV_StartSound( ent, channel, sample, ( volume * 255 ) | 0, attenuation );

}

// #42 particle2(origin, dmin, dmax, color, effect, count)
function particle2() {

	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteParticle2Message( {
		origin: G_VECTOR( OFS_PARM0 ), directionMin: G_VECTOR( OFS_PARM1 ), directionMax: G_VECTOR( OFS_PARM2 ),
		color: G_FLOAT( OFS_PARM3 ), effect: G_FLOAT( OFS_PARM4 ), count: G_FLOAT( OFS_PARM5 ),
	} ) );

}

// #85 particle3(origin, box, color, effect, count)
function particle3() {

	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteParticle3Message( {
		origin: G_VECTOR( OFS_PARM0 ), box: G_VECTOR( OFS_PARM1 ),
		color: G_FLOAT( OFS_PARM2 ), effect: G_FLOAT( OFS_PARM3 ), count: G_FLOAT( OFS_PARM4 ),
	} ) );

}

// #86 particle4(origin, radius, color, effect, count): the radius and effect type are part of the native message
function particle4() {

	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteParticle4Message( {
		origin: G_VECTOR( OFS_PARM0 ), radius: G_FLOAT( OFS_PARM1 ), color: G_FLOAT( OFS_PARM2 ),
		effect: G_FLOAT( OFS_PARM3 ), count: G_FLOAT( OFS_PARM4 ),
	} ) );

}

// #81 particleexplosion(origin, color, radius, counter)
function particleexplosion() {

	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteParticleExplosion( {
		origin: G_VECTOR( OFS_PARM0 ), color: G_FLOAT( OFS_PARM1 ), radius: G_FLOAT( OFS_PARM2 ), counter: G_FLOAT( OFS_PARM3 ),
	} ) );

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

		const pointer = pr_global_struct.msg_entity | 0;
		const ent = pointer ? PROG_TO_EDICT( pointer ) : null;
		const index = ent ? NUM_FOR_EDICT( ent ) : 0;
		if ( index < 1 || index > svs.maxclients ) PR_RunError( 'write: not a client (msg_entity %i, index %i)', pointer, index );
		return svs.clients[ index - 1 ]?.message ?? null;

	}
	PR_RunError( 'write: bad destination %i', destination );

}

// Every writer feeds the stateful translator first: a native service id and its body are rewritten as one unified
// message, while an ordinary value outside a native frame is written exactly as before.
const writeByte = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ) | 0; if ( d && !Hexen2_WriteNativeServiceByte( d, value ) ) MSG_WriteByte( d, value ); };
const writeChar = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ) | 0; if ( d && !Hexen2_WriteNativeServiceByte( d, value ) ) MSG_WriteByte( d, value ); };
const writeShort = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ) | 0; if ( d && !Hexen2_WriteNativeServiceShort( d, value ) ) MSG_WriteShort( d, value ); };
const writeLong = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ) | 0; if ( d && !Hexen2_WriteNativeServiceLong( d, value ) ) MSG_WriteLong( d, value ); };
const writeAngle = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ); if ( d && !Hexen2_WriteNativeServiceAngle( d, value ) ) MSG_WriteAngle( d, value ); };
const writeCoord = () => { const d = writeDestination(), value = G_FLOAT( OFS_PARM1 ); if ( d && !Hexen2_WriteNativeServiceCoord( d, value ) ) MSG_WriteCoord( d, value ); };
const writeString = () => { const d = writeDestination(), value = G_STRING( OFS_PARM1 ); if ( d && !Hexen2_WriteNativeServiceString( d, value ) ) MSG_WriteString( d, value ); };
const writeEntity = () => { const d = writeDestination(), value = G_EDICTNUM( OFS_PARM1 ); if ( d && !Hexen2_WriteNativeServiceEntity( d, value ) ) MSG_WriteShort( d, value ); };

// #79 plaque_draw(destination, index): a strings.txt line index (0 clears), written where the gamecode asks
function plaqueDraw() {

	const index = G_FLOAT( OFS_PARM1 ) | 0;
	if ( index < 0 || index > Hexen2_HostStringCount() )
		PR_RunError( 'PF_plaque_draw: unexpected index %i (host_string_count: %i)', index, Hexen2_HostStringCount() );
	const destination = writeDestination();
	if ( destination ) Hexen2_AppendMessage( destination, Hexen2_WritePlaque( index ) );

}

// #80 rain_go(min_org, max_org, e_size, dir, color, count)
function rainGo() {

	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteRainEffect( {
		min: G_VECTOR( OFS_PARM0 ), max: G_VECTOR( OFS_PARM1 ), size: G_VECTOR( OFS_PARM2 ), dir: G_VECTOR( OFS_PARM3 ),
		color: G_FLOAT( OFS_PARM4 ), count: G_FLOAT( OFS_PARM5 ),
	} ) );

}

// #92 getstring(index): a strings.txt line as an engine string, 1-based as every native caller passes it
function getString() {

	const index = G_FLOAT( OFS_PARM0 ) | 0;
	if ( index < 1 || index > Hexen2_HostStringCount() )
		PR_RunError( 'PF_GetString: unexpected index %i (host_string_count: %i)', index, Hexen2_HostStringCount() );
	G_INT_SET( OFS_RETURN, ED_NewString( Hexen2_GetHostString( index ) ) );

}

// #44 aim(entity, shot_origin, speed): Hexen II's shot origin, DAMAGE_YES targets and point-hull traces
function aim() {

	const ent = G_EDICT( OFS_PARM0 ), shot = G_VECTOR( OFS_PARM1 );
	const forward = pr_global_struct.v_forward;
	const start = [ shot[ 0 ], shot[ 1 ], shot[ 2 ] + 20 ];
	const dir = [ forward[ 0 ], forward[ 1 ], forward[ 2 ] ];
	const end = [ start[ 0 ] + 2048 * forward[ 0 ], start[ 1 ] + 2048 * forward[ 1 ], start[ 2 ] + 2048 * forward[ 2 ] ];

	const traceWithPointHull = ( from, to ) => {

		const savedHull = ent.v.hull;
		ent.v.hull = 0;
		try {

			return SV_Move( from, vec3_origin, vec3_origin, to, false, ent );

		} finally {

			ent.v.hull = savedHull;

		}

	};

	const trace = traceWithPointHull( start, end );
	if ( trace.ent && trace.ent.v.takedamage === DAMAGE_YES
		&& ( teamplay.value === 0 || ent.v.team <= 0 || ent.v.team !== trace.ent.v.team ) ) {

		G_FLOAT_SET( OFS_RETURN, forward[ 0 ] );
		G_FLOAT_SET( OFS_RETURN + 1, forward[ 1 ] );
		G_FLOAT_SET( OFS_RETURN + 2, forward[ 2 ] );
		return;

	}

	let bestdist = sv_aim.value, bestent = null;
	for ( let i = 1; i < sv.num_edicts; i ++ ) {

		const check = sv.edicts[ i ];
		if ( check.v.takedamage !== DAMAGE_YES ) continue;
		if ( check === ent ) continue;
		if ( teamplay.value !== 0 && ent.v.team > 0 && ent.v.team === check.v.team ) continue;

		end[ 0 ] = check.v.origin[ 0 ];
		end[ 1 ] = check.v.origin[ 1 ];
		end[ 2 ] = check.v.origin[ 2 ] + 0.5 * check.v.maxs[ 2 ];
		dir[ 0 ] = end[ 0 ] - start[ 0 ]; dir[ 1 ] = end[ 1 ] - start[ 1 ]; dir[ 2 ] = end[ 2 ] - start[ 2 ];
		const length = Math.hypot( dir[ 0 ], dir[ 1 ], dir[ 2 ] ) || 1;
		dir[ 0 ] /= length; dir[ 1 ] /= length; dir[ 2 ] /= length;
		const dist = dir[ 0 ] * forward[ 0 ] + dir[ 1 ] * forward[ 1 ] + dir[ 2 ] * forward[ 2 ];
		if ( dist < bestdist ) continue;

		const hit = traceWithPointHull( start, end );
		if ( hit.ent === check ) { bestdist = dist; bestent = check; }

	}

	if ( bestent !== null ) {

		const hold = [ bestent.v.origin[ 0 ], bestent.v.origin[ 1 ], bestent.v.origin[ 2 ] + 0.5 * bestent.v.maxs[ 2 ] ];
		dir[ 0 ] = hold[ 0 ] - shot[ 0 ]; dir[ 1 ] = hold[ 1 ] - shot[ 1 ]; dir[ 2 ] = hold[ 2 ] - shot[ 2 ];
		const dist = dir[ 0 ] * forward[ 0 ] + dir[ 1 ] * forward[ 1 ] + dir[ 2 ] * forward[ 2 ];
		end[ 0 ] = forward[ 0 ] * dist; end[ 1 ] = forward[ 1 ] * dist; end[ 2 ] = dir[ 2 ];
		const length = Math.hypot( end[ 0 ], end[ 1 ], end[ 2 ] ) || 1;
		G_FLOAT_SET( OFS_RETURN, end[ 0 ] / length );
		G_FLOAT_SET( OFS_RETURN + 1, end[ 1 ] / length );
		G_FLOAT_SET( OFS_RETURN + 2, end[ 2 ] / length );

	} else {

		G_FLOAT_SET( OFS_RETURN, forward[ 0 ] );
		G_FLOAT_SET( OFS_RETURN + 1, forward[ 1 ] );
		G_FLOAT_SET( OFS_RETURN + 2, forward[ 2 ] );

	}

}

// #78 setspawnparms(entity): copy all NUM_SPAWN_PARMS (16) from the client's saved spawn parms
function setspawnparms() {

	const ent = G_EDICT( OFS_PARM0 );
	const i = NUM_FOR_EDICT( ent );
	if ( i < 1 || i > svs.maxclients ) PR_RunError( 'Entity is not a client' );
	const client = svs.clients[ i - 1 ];
	for ( let j = 0; j < NUM_SPAWN_PARMS; j ++ )
		pr_global_struct[ 'parm' + ( j + 1 ) ] = client.spawn_parms[ j ];

}

// #104 doWhiteFlash(): Portal's native reliable `wf` client command
function doWhiteFlash() { Hexen2_AppendMessage( sv.reliable_datagram, Hexen2_WriteWhiteFlash() ); }

// #105 updatesoundpos(entity, channel): move a playing sound with its entity
function updateSoundPos() {

	const entity = G_EDICT( OFS_PARM0 ), channel = G_FLOAT( OFS_PARM1 ) | 0;
	if ( channel < 0 || channel > 7 ) PR_HostError( 'PF_UpdateSoundPos: channel = ' + channel );
	Hexen2_AppendMessage( sv.datagram, Hexen2_WriteSoundUpdatePos( entity, channel ) );

}

// The native expiry of an effect type (sv_effect.c SV_ParseEffect): persistent effects return 0, the smoke/flash
// families live one second, a chunk three and bone shards ten.
const PERSISTENT_EFFECTS = new Set( [ CE.RAIN, CE.SNOW, CE.FOUNTAIN, CE.QUAKE, CE.RIDER_DEATH, CE.GRAVITYWELL ] );
const TEN_SECOND_EFFECTS = new Set( [ CE.BONESHARD, CE.BONESHRAPNEL ] );

/**
 * The native expiry time of an effect created at `now`.
 *
 * @param {number} type the CE_* type
 * @param {number} now server time
 * @returns {number} `now + 1`, `now + 3`, `now + 10`, or 0 for a persistent effect
 */
export function Hexen2_EffectExpireTime( type, now ) {

	if ( PERSISTENT_EFFECTS.has( type ) ) return 0;
	if ( TEN_SECOND_EFFECTS.has( type ) ) return now + 10;
	if ( type === CE.CHUNK ) return now + 3;
	return now + 1;

}

function effectSlots() {

	if ( ! Array.isArray( sv.hexenEffects ) ) sv.hexenEffects = new Array( MAX_EFFECTS ).fill( null );
	if ( sv.hexenEffects.length < MAX_EFFECTS ) sv.hexenEffects.length = MAX_EFFECTS;
	return sv.hexenEffects;

}

// #88 starteffect(type, ...): allocate the first free or expired slot, record the native expiry and send the native
// start-effect message. The slot number is returned to the gamecode.
function starteffect() {

	const type = G_FLOAT( OFS_PARM0 ) | 0;
	if ( type <= 0 ) PR_RunError( 'starteffect: bad type %i', type );
	const params = Hexen2_EffectParams( type, { vector: n => G_VECTOR( OFS_PARM0 + n * 3 ), float: n => G_FLOAT( OFS_PARM0 + n * 3 ) } );
	if ( params === null ) PR_RunError( 'starteffect: unsupported type %i', type );

	const slots = effectSlots();
	let index = - 1;
	for ( let i = 0; i < MAX_EFFECTS; i ++ ) {

		const effect = slots[ i ];
		if ( effect === null || effect.type === 0 || ( effect.expire_time > 0 && effect.expire_time <= sv.time ) ) {

			index = i;
			break;

		}

	}
	if ( index < 0 ) PR_RunError( 'MAX_EFFECTS reached' );

	const expire_time = Hexen2_EffectExpireTime( type, sv.time );
	slots[ index ] = { type, time: sv.time, expire_time, params };
	Hexen2_AppendMessage( sv.reliable_datagram, Hexen2_WriteStartEffectMessage( { index, type, params } ) );
	G_FLOAT_SET( OFS_RETURN, index );

}

// #89 endeffect(unused, index): drop the slot the gamecode names and tell clients (native reads the second argument)
function endeffect() {

	const index = G_FLOAT( OFS_PARM1 ) | 0;
	if ( index < 0 || index >= MAX_EFFECTS ) PR_RunError( 'endeffect: bad index %i', index );
	const slots = effectSlots(), effect = slots[ index ];
	if ( ! effect || ! effect.type ) return;
	slots[ index ] = null;
	Hexen2_AppendMessage( sv.reliable_datagram, Hexen2_WriteEndEffectMessage( index ) );

}

/**
 * The active effects, in the native `SV_SaveEffects` data shape (`index`, `type`, `expire_time`, `params`).
 * Package U9 stores this with a hub snapshot; `Hexen2_LoadEffects` restores it after the map loads.
 *
 * @returns {{ count: number, effects: Array<{ index: number, type: number, expire_time: number, params: object }> }}
 */
export function Hexen2_SaveEffects() {

	const slots = effectSlots(), effects = [];
	for ( let index = 0; index < MAX_EFFECTS; index ++ ) {

		const effect = slots[ index ];
		if ( ! effect || ! effect.type ) continue;
		effects.push( { index, type: effect.type, expire_time: effect.expire_time ?? 0, params: cloneParams( effect.params ) } );

	}
	return { count: effects.length, effects };

}

/**
 * Restores a `Hexen2_SaveEffects` snapshot, clearing any effects a freshly loaded map left behind.
 *
 * @param {{ count?: number, effects?: Array<object> } | Array<object>} saved the snapshot or its effect array
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_LoadEffects( saved ) {

	const effects = Array.isArray( saved ) ? saved : saved?.effects;
	if ( ! Array.isArray( effects ) ) return { ok: false, reason: 'no effects in the save record' };
	const slots = new Array( MAX_EFFECTS ).fill( null );
	for ( const effect of effects ) {

		const index = effect?.index;
		if ( ! Number.isInteger( index ) || index < 0 || index >= MAX_EFFECTS )
			return { ok: false, reason: `bad effect index ${String( index )}` };
		if ( ! Number.isInteger( effect.type ) || effect.type <= 0 )
			return { ok: false, reason: `bad effect type ${String( effect.type )}` };
		slots[ index ] = {
			type: effect.type,
			time: sv.time,
			expire_time: Number.isFinite( effect.expire_time ) ? effect.expire_time : 0,
			params: cloneParams( effect.params ),
		};

	}
	sv.hexenEffects = slots;
	return { ok: true, count: effects.length };

}

function cloneParams( params ) {

	if ( params === null || typeof params !== 'object' ) return {};
	const copy = {};
	for ( const [ key, value ] of Object.entries( params ) ) copy[ key ] = Array.isArray( value ) ? value.slice() : value;
	return copy;

}

// #93 spawntemp(): a temporary edict from the reserved pool
function spawntemp() {

	try {

		RETURN_EDICT( Hexen2_ED_Alloc_Temp() );

	} catch ( error ) {

		PR_RunError( 'spawntemp: %s', error.message );

	}

}

// #99 matchAngleToSlope(slope, actor): Portal's wall-walking monsters pitch/roll onto a plane.
function matchAngleToSlope() {

	const slope = G_VECTOR( OFS_PARM0 ), actor = G_EDICT( OFS_PARM1 );
	const oldForward = new Float32Array( 3 ), oldRight = new Float32Array( 3 ), up = new Float32Array( 3 );
	AngleVectors( actor.v.angles, oldForward, oldRight, up );
	let yaw = 0, pitch = 0;
	if ( ! ( slope[ 0 ] === 0 && slope[ 1 ] === 0 ) ) {

		yaw = Math.trunc( Math.atan2( slope[ 1 ], slope[ 0 ] ) / ( Math.PI / 180 ) );
		if ( yaw < 0 ) yaw += 360;

	}
	pitch = - Math.trunc( Math.asin( Math.max( - 1, Math.min( 1, slope[ 2 ] / Math.hypot( slope[ 0 ], slope[ 1 ], slope[ 2 ] ) ) ) ) / ( Math.PI / 180 ) ) - 90;
	const forward = new Float32Array( 3 ), right = new Float32Array( 3 ), up2 = new Float32Array( 3 );
	AngleVectors( new Float32Array( [ 0, yaw, 0 ] ), forward, right, up2 );
	const mod = forward[ 0 ] * oldRight[ 0 ] + forward[ 1 ] * oldRight[ 1 ] + forward[ 2 ] * oldRight[ 2 ] < 0 ? 1 : - 1;
	const dot = forward[ 0 ] * oldForward[ 0 ] + forward[ 1 ] * oldForward[ 1 ] + forward[ 2 ] * oldForward[ 2 ];
	actor.v.angles[ 0 ] = dot * pitch;
	actor.v.angles[ 2 ] = ( 1 - Math.abs( dot ) ) * pitch * mod;

}

// #100 updateinfoplaque(index, mode): the Portal objective bitmask toggle, 0..63
function updateInfoPlaque() {

	let index = G_FLOAT( OFS_PARM0 ) | 0;
	const mode = G_FLOAT( OFS_PARM1 ) | 0;
	if ( index < 0 || index >= 64 ) PR_RunError( 'updateinfoplaque: bad objective index %i', index );
	const second = index >= 32;
	if ( second ) index -= 32;
	const bit = 1 << index;
	sv.info_mask = sv.info_mask | 0; sv.info_mask2 = sv.info_mask2 | 0;
	const use = second ? sv.info_mask2 : sv.info_mask;
	if ( ( ( mode & 1 ) && ( use & bit ) ) || ( ( mode & 2 ) && ! ( use & bit ) ) ) return;
	if ( second ) sv.info_mask2 = use ^ bit; else sv.info_mask = use ^ bit;

}

// #70 changelevel(level, spot): the native Hexen II form writes `changelevel <level> <spot>` when the server flags
// start a new unit or episode, and `changelevel2` (the hub transition) otherwise. The command buffer owns the reload.
function changelevel() {

	if ( svs.changelevel_issued ) return;
	svs.changelevel_issued = true;
	const level = G_STRING( OFS_PARM0 ), spot = G_STRING( OFS_PARM1 );
	const flags = pr_global_struct.serverflags | 0;
	Cbuf_AddText( ( ( flags & ( 16 | 32 ) ) ? 'changelevel ' : 'changelevel2 ' ) + level + ' ' + spot + '\n' );
	// the local host reads the next map from here when the command runs; a net server ignores it, as native does
	sv.nextmap = { level: Hexen2_NormalizeMapName( level ), spot: String( spot ?? '' ) };

}

// #71 lightstylevalue(style): the currently animated letter, as native PF_lightstylevalue returns
// d_lightstylevalue[style] / 22 (uhexen2 h2shared/pr_cmds.c:2253). The animation is r_light.c's R_AnimateLight rule
// (uhexen2 h2shared/r_light.c:33-64): a default 10 Hz locus over the style string, or a leading '1'/'2'/'3' selecting
// 10/20/30 Hz with the characters after it as the cycle. The renderer applies the same rule on the client; the server
// needs its own copy because gamecode reads the value in physics think functions.
function lightstylevalue() {

	const style = G_FLOAT( OFS_PARM0 ) | 0;
	if ( style < 0 || style >= MAX_LIGHTSTYLES ) {

		G_FLOAT_SET( OFS_RETURN, 0 ); // native PF_lightstylevalue: no error for a malformed map/mod style
		return;

	}
	const text = sv.lightstyles?.[ style ];
	let index;
	if ( !text || text.length === 0 ) {

		index = 11; // R_AnimateLight's no-style value 256, divided by PF_lightstylevalue's 22

	} else {

		const first = text.charCodeAt( 0 );
		if ( first >= 49 && first <= 51 ) { // '1', '2', '3'

			if ( text.length === 1 ) index = 11; // a bad style definition: native leaves it at normal light
			else {

				const rate = [ 10, 20, 30 ][ first - 49 ];
				const at = ( ( sv.time * rate ) | 0 ) % ( text.length - 1 );
				index = text.charCodeAt( at + 1 ) - 97;

			}

		} else {

			const at = ( ( sv.time * 10 ) | 0 ) % text.length;
			index = text.charCodeAt( at ) - 97;

		}

	}

	G_FLOAT_SET( OFS_RETURN, index );

}

// #106 stopsound(entity, channel): drop a local entity channel; the mixer implements it.
function stopSound() {

	const entity = G_EDICT( OFS_PARM0 ), channel = G_FLOAT( OFS_PARM1 ) | 0;
	if ( channel < 0 || channel > 7 ) PR_HostError( 'stopsound: channel = ' + channel );
	if ( typeof SV_StopSound === 'function' ) SV_StopSound( entity, channel );

}

// #6 break(): the debug break is a deliberate program error in this port, never a silent no-op
function breakBuiltin() { PR_RunError( 'break statement' ); }

// #10 error(text...) and #11 objerror(text...): the native terminal object errors (self is dumped)
function errorBuiltin() {

	const message = varString( 0 );
	Con_Printf( '======SERVER ERROR in %s:\n%s\n', pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?', message );
	PR_HostError( 'Program error' );

}

function objerror() {

	const message = varString( 0 ), ent = PROG_TO_EDICT( pr_global_struct.self );
	Con_Printf( '======OBJECT ERROR in %s:\n%s\n', pr_xfunction ? PR_GetString( pr_xfunction.s_name ) : '?', message );
	ED_Print( ent );
	ED_Free( ent );
	PR_HostError( 'Program error' );

}

/** The server builtins this module installs into the Hexen II dispatcher. */
export const HEXEN2_SERVER_BUILTINS = Object.freeze( {
	5: lightstylestatic, 6: breakBuiltin, 8: sound, 10: errorBuiltin, 11: objerror, 42: particle2, 44: aim,
	49: changeyaw, 52: writeByte, 53: writeChar, 54: writeShort, 55: writeLong, 56: writeCoord, 57: writeAngle,
	58: writeString, 59: writeEntity, 63: advanceframe, 65: rewindframe, 66: setclass, 69: makestatic,
	70: changelevel, 71: lightstylevalue, 74: ambientsound, 78: setspawnparms, 79: plaqueDraw, 80: rainGo, 81: particleexplosion,
	83: advanceweaponframe, 85: particle3, 86: particle4, 88: starteffect, 89: endeffect, 92: getString,
	93: spawntemp, 99: matchAngleToSlope, 100: updateInfoPlaque, 104: doWhiteFlash, 105: updateSoundPos, 106: stopSound
} );
