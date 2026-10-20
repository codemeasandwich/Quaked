/**
 * @module engine/server/sv_main
 *
 * The server's main program (WinQuake sv_main.c): spawning a level, sending entity updates and client data, sounds
 * and particles, and connecting and dropping clients.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: mutable exports `current_skill`; module-level variables `fatbytes`, `fatpvs`, `sv_playermodel`,
 * `carriedPowerups`.
 *
 * Errors: calls `Sys_Error` (fatal) at 9 places; calls `Host_Error` at 1 place.
 *
 * `SV_SpawnServer` gives seamless travel the engine's model functions (`SV_SeamlessUseModels`); until [44g] (debt
 * D10) that ran as the module loaded.
 */
import { SV_LargeProtocolNeeded } from './sv_large_protocol.js';

import { SV_RespawnPrecache, SV_SetRespawnLandedHook, SV_SetRespawnEntryHook, SV_RespawnReserveGuards, SV_RespawnWorldStart, SV_RespawnCaptureTravel, SV_RespawnClearTravel, sv_respawnguard } from '../common/hooks.js'; // installed by newer/gameplay/sv_respawn.js
// Ported from: WinQuake/sv_main.c -- server main program

import { Sys_Error } from '../common/sys.js';
import {
	Con_Printf, Con_DPrintf, SZ_Clear, SZ_Write, SZ_Alloc,
	MSG_WriteByte, MSG_WriteChar, MSG_WriteShort, MSG_WriteLong,
	MSG_WriteFloat, MSG_WriteString, MSG_WriteCoord, MSG_WriteAngle,
	MSG_WriteAngle16,
	standard_quake
} from '../common/common.js';
import { Cmd_AddCommand, Cmd_ExecuteString, Cbuf_InsertText } from '../common/cmd.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_Set, Cvar_SetValue, Cvar_VariableValue } from '../common/cvar.js';
import { sv_shotdelay } from '../common/hooks.js'; // installed by newer/gameplay/sv_shotdelay.js
import {
	MAX_MODELS, MAX_SOUNDS, MAX_DATAGRAM, MAX_DATAGRAM_LOCAL, MAX_EDICTS, MAX_EDICTS_STANDARD, MAX_MSGLEN,
	STAT_PING
} from '../common/quakedef.js';
import {
	PROTOCOL_VERSION, PROTOCOL_LARGE,
	GAME_COOP, GAME_DEATHMATCH,
	DEFAULT_SOUND_PACKET_VOLUME, DEFAULT_SOUND_PACKET_ATTENUATION,
	SND_VOLUME, SND_ATTENUATION,
	svc_print, svc_serverinfo, svc_cdtrack, svc_setview, svc_signonnum,
	svc_time, svc_particle, svc_sound, svc_clientdata, svc_updatestat, svc_updatefrags,
	svc_stufftext, svc_nop, svc_stopsound, svc_spawnbaseline, svc_spawnstatic, svc_spawnstaticsound, svc_disconnect,
	svc_updatename, svc_updatecolors,
	U_MOREBITS, U_ORIGIN1, U_ORIGIN2, U_ORIGIN3,
	U_ANGLE1, U_ANGLE2, U_ANGLE3,
	U_NOLERP, U_FRAME, U_SIGNAL, U_MODEL, U_COLORMAP, U_SKIN, U_EFFECTS, U_LONGENTITY,
	SU_VIEWHEIGHT, SU_IDEALPITCH, SU_PUNCH1, SU_VELOCITY1,
	SU_ITEMS, SU_ONGROUND, SU_INWATER, SU_WEAPONFRAME, SU_ARMOR, SU_WEAPON,
	DEFAULT_VIEWHEIGHT, svc_damage, svc_setangle,
	svc_playerinfo, PF_MSEC, PF_COMMAND, PF_VELOCITY1, PF_VELOCITY2, PF_VELOCITY3,
	PF_MODEL, PF_SKINNUM, PF_EFFECTS, PF_WEAPONFRAME, PF_DEAD, PF_GIB, PF_CLOAK_BODY,
	CM_ANGLE1, CM_ANGLE2, CM_ANGLE3, CM_FORWARD, CM_SIDE, CM_UP, CM_BUTTONS, CM_IMPULSE,
	svc_packetentities, svc_deltapacketentities, svc_serversequence,
	PE_ENT_BITS, PE_ENT_MASK, PE_ORIGIN1, PE_ORIGIN2, PE_ORIGIN3,
	PE_ANGLE2, PE_REMOVE, PE_MOREBITS, PE_MOREBITS2,
	PE_FRAME, PE_ANGLE1, PE_ANGLE3, PE_MODEL, PE_COLORMAP, PE_SKIN, PE_EFFECTS,
	PE2_SCALE, PE2_DRAWFLAGS, PE2_ABSLIGHT,
	BASELINE_SCALE_DEFAULT,
	svc_hexen2_features, svc_hexen2_start_effect, svc_hexen2_end_effect, svc_hexen2_update_inv,
	svc_hexen2_plaque, svc_hexen2_raineffect, svc_hexen2_particle2, svc_hexen2_particle3, svc_hexen2_particle4,
	svc_hexen2_particle_explosion, svc_hexen2_set_view_flags, svc_hexen2_clear_view_flags, svc_hexen2_set_view_tint,
	svc_hexen2_setangle_interpolate, svc_hexen2_midi_name, svc_hexen2_updateclass, svc_hexen2_toggle_statbar,
	svc_hexen2_sound_update_pos, svc_hexen2_intermission, svc_hexen2_temp_entity, svc_hexen2_info_mask,
	HEXEN2_FEATURE_ALL, HEXEN2_FEATURE_PORTALS, HEXEN2_NO_LEVEL_STRING,
	TE_STREAM_LIGHTNING_SMALL, TE_STREAM_COLORBEAM, TE_STREAM_FAMINE,
	MAX_PACKET_ENTITIES, MAX_PACKET_ENTITIES_LOCAL, PE_UPDATE_MASK
} from '../common/protocol.js';
import { GameProfile_Get, GameProfile_IsHexen2 } from '../common/game_profile.js';
import { Hexen2_EncodeUpdateInv, HEXEN2_STAT_FIELDS } from '../common/hexen2_clientdata.js';
import { Hexen2_WriteStartEffect, Hexen2_WriteEndEffect } from '../common/hexen2_effectwire.js';
import {
	sv, svs, ss_loading, ss_active,
	server_t, client_t, NUM_PING_TIMES,
	host_client, set_host_client,
	MOVETYPE_PUSH, MOVETYPE_STEP,
	SOLID_BSP, SOLID_NOT, SOLID_TRIGGER,
	FL_ITEM, FL_ONGROUND, FL_MONSTER,
	EF_MUZZLEFLASH,
	NUM_SPAWN_PARMS,
	deathmatch, coop, skill,
	fraglimit, timelimit, teamplay,
	SIGNON_SIZE, SIGNON_SIZE_STANDARD
} from './server.js';
import { hostname } from '../net/net_main.js';
import { SV_CloakBodyFrame, SV_CloakResetPlayer } from './sv_cloak.js';
import {
	NET_CheckNewConnections, NET_SendMessage, NET_SendUnreliableMessage,
	NET_CanSendMessage, NET_CanSendUnreliableMessage, NET_SendToAll, NET_Close, NET_GetMessage
} from '../net/net_main.js';
import { net_activeconnections, set_net_activeconnections } from '../net/net.js';
import { realtime, Host_ClearMemory, Host_Error, set_host_frametime } from './host.js';
import { COM_LoadFile } from '../common/pak.js';
import { VectorCopy, VectorAdd, DotProduct } from '../common/mathlib.js';
import { Mod_ForName, Mod_LeafPVS, Mod_LoadForPreview, Mod_PointInLeaf } from '../render/gl_model.js';
import { PR_LoadProgs, PR_AllocEdicts, ED_ClearEdict, ED_LoadFromFile, ED_NewString, GetEdictFieldValue, PR_SetCurrentSkill, PR_SetDeathmatch } from '../progs/pr_edict.js';
import { pr_global_struct, pr_strings, pr_edict_size, progs, pr_crc, EDICT_NUM, NUM_FOR_EDICT, PR_SetSV, PR_SetSVS, EDICT_TO_PROG, PROG_TO_EDICT, NEXT_EDICT, PR_GetString, PR_StockProgs } from '../progs/progs.js';
import { SV_SeamlessSetup, SV_SeamlessUseModels, SV_LiquidLinks, SV_SeamlessEnabled, SV_SeamlessCloseReturn, SV_SeamlessEntryYaw } from '../common/hooks.js'; // installed by newer/gameplay/sv_seamless.js
import { R_NewerGame } from '../common/hooks.js'; // installed by newer/mode.js
import { COM_SetNewerActive, COM_SetNewerMapsEnabled } from '../common/pak.js';
import { cls, ca_dedicated } from '../client/client.js';

import { SV_ClearWorld, SV_Move, SV_TestEntityPosition, SV_LinkEdict, SV_UnlinkEdict, SV_PointContents } from './world.js';
import { SV_Physics, SV_SetState, SV_SetCallbacks,
	sv_maxvelocity, sv_gravity, sv_nostep, sv_friction, sv_edgefriction,
	sv_stopspeed, sv_maxspeed, sv_accelerate, sv_idealpitchscale } from './sv_phys.js';
import { PR_ExecuteProgram, PR_SetHostError, PR_ResetStack } from '../progs/pr_exec.js';
import { SV_User_SetCallbacks, SV_SetIdealPitch } from './sv_user.js';
import { V_CalcRoll } from '../client/view.js';
import { key_dest } from '../common/key_dest.js';

//============================================================================
// Module-level state
//============================================================================

// The protocol a server speaks (card [34f]): 15, or this port's large-map protocol when sv_protocol asks for it, set
// at each SV_SpawnServer before anything is precached or written
export const sv_protocol = new cvar_t( 'sv_protocol', String( PROTOCOL_VERSION ) );

// Hexen II's per-level limits (uhexen2 quakedef.h): 512 models, 512 sounds, 600 edicts with 30 reserved temp slots.
export const HEXEN2_MODEL_LIMIT = 512;
export const HEXEN2_SOUND_LIMIT = 512;
export const max_temp_edicts = new cvar_t( 'max_temp_edicts', '30', true );

/**
 * The protocol a server speaks for an sv_protocol value: this port's large-map protocol for 1015, and also for the
 * larger protocols other engines name, FitzQuake's 666 and RMQ's 999, which add-ons ask for in their own quake.rc
 * (Arcane Dimensions sets `sv_protocol 999`) as a request for higher limits; protocol 15 for anything else.
 *
 * @param {number} value the sv_protocol value
 * @returns {number} PROTOCOL_LARGE or PROTOCOL_VERSION
 */
export function SV_ProtocolFor( value ) {

	return [ PROTOCOL_LARGE, 666, 999 ].includes( value | 0 ) ? PROTOCOL_LARGE : PROTOCOL_VERSION;

}

/**
 * The most models this server can name: 256 in protocol 15 (bytes on the wire), MAX_MODELS in the large-map protocol.
 *
 * @returns {number} the limit for `sv.model_precache`
 */
export function SV_ModelLimit() {

	if ( GameProfile_IsHexen2() ) return HEXEN2_MODEL_LIMIT; // uhexen2 MAX_MODELS, sent as a word
	return sv.protocol === PROTOCOL_LARGE ? MAX_MODELS : 256;

}

/**
 * The most sounds this server can name: 256 in protocol 15, MAX_SOUNDS in the large-map protocol.
 *
 * @returns {number} the limit for `sv.sound_precache`
 */
export function SV_SoundLimit() {

	if ( GameProfile_IsHexen2() ) return HEXEN2_SOUND_LIMIT; // uhexen2 MAX_SOUNDS (the mission pack's 512)
	return sv.protocol === PROTOCOL_LARGE ? MAX_SOUNDS : 256;

}

/**
 * Writes a model, frame or sound number: a byte in protocol 15, a short in the large-map protocol.
 *
 * @param {sizebuf_t} msg the message
 * @param {number} value the number
 */
export function SV_WriteIndex( msg, value ) {

	if ( sv.protocol === PROTOCOL_LARGE ) MSG_WriteShort( msg, value );
	else MSG_WriteByte( msg, value );

}

// Hexen II's entity fields are resolved by name, never by offset: the base (1.11) and Portal (1.12) layouts differ.
// One lookup per progs is cached; PR_LoadProgs replaces `progs`, which invalidates the cache.
let _hexenFieldsFor = null;
const _hexenFields = new Map();

function hexenFieldOfs( ent, name ) {

	if ( _hexenFieldsFor !== progs ) { _hexenFields.clear(); _hexenFieldsFor = progs; }
	if ( _hexenFields.has( name ) ) return _hexenFields.get( name );
	// Cache the slot, never the accessor: every edict has its own accessor over its own field buffer, so reusing the
	// first edict's accessor would read and write that entity instead of the one passed in.
	const found = GetEdictFieldValue( ent, name );
	const ofs = found === null ? null : found.ofs;
	_hexenFields.set( name, ofs );
	return ofs;

}

/**
 * Reads a Hexen II entity field by name, or `fallback` when the loaded progs has none.
 *
 * @param {edict_t} ent the edict
 * @param {string} name the QuakeC field name (`scale`, `drawflags`, `abslight`, `playerclass`, ...)
 * @param {number} [fallback=0] value for an absent field
 * @returns {number} the field value
 */
export function SV_Hexen2Field( ent, name, fallback = 0 ) {

	const ofs = hexenFieldOfs( ent, name );
	return ofs === null ? fallback : ent._fieldAccessor.getFloat( ofs );

}

/**
 * Writes a Hexen II entity field by name when the progs has it.
 *
 * @param {edict_t} ent the edict
 * @param {string} name the QuakeC field name
 * @param {number} value the value
 * @returns {boolean} true when the field exists and was written
 */
export function SV_SetHexen2Field( ent, name, value ) {

	const ofs = hexenFieldOfs( ent, name );
	if ( ofs === null ) return false;
	ent._fieldAccessor.setFloat( ofs, value );
	return true;

}

/**
 * The wire values of a Hexen II entity's optional render fields, in native units: scale*100, drawflags, abslight*255.
 * Quake entities never call this; defaults are 1.0/0/0.
 *
 * @param {edict_t} ent the edict
 * @returns {{ scale: number, drawflags: number, abslight: number }} the bytes to send
 */
export function SV_Hexen2EntityFields( ent ) {

	const scale = Math.trunc( SV_Hexen2Field( ent, 'scale', 1.0 ) * 100 ) & 255;
	const drawflags = SV_Hexen2Field( ent, 'drawflags', 0 ) & 255;
	const abslight = Math.trunc( SV_Hexen2Field( ent, 'abslight', 0 ) * 255 ) & 255;
	return { scale, drawflags, abslight };

}

// The SC1/SC2 fields come from the encoder's own 56-bit table (hexen2_clientdata.js HEXEN2_STAT_FIELDS), so the change
// mask built here is exactly the one Hexen2_EncodeUpdateInv writes against.

/**
 * Sends a Hexen II player's changed inventory/stats record (`svc_hexen2_update_inv`), the native SC1/SC2 delta of
 * uhexen2's SV_UpdateClientStats. On a fresh spawn every bit is sent. Writes to the client's reliable message, as the
 * native function does, so a dropped datagram cannot leave a stat stale.
 *
 * @param {client_t} client the receiving client; `h2Stats` holds the last values sent
 * @param {sizebuf_t} msg the reliable message (normally `client.message`)
 */
export function SV_UpdateClientStats( client, msg ) {

	const ent = client.edict;
	if ( ent == null || ent.v == null ) return;
	const previous = client.h2Stats ?? null;
	let mask = 0n;
	const next = {};
	for ( const [ bit, field, type ] of HEXEN2_STAT_FIELDS ) {

		const value = SV_Hexen2Field( ent, field, 0 );
		const key = type === 'string' ? ( value | 0 ) : Math.trunc( value );
		next[ field ] = key;
		if ( previous === null || previous[ field ] !== key ) mask |= BigInt( bit );

	}

	// Portal's objectives are globals, not entity fields; keep their last values on the client record.
	const infoMask = ( pr_global_struct?.info_mask ?? 0 ) >>> 0;
	const infoMask2 = ( pr_global_struct?.info_mask2 ?? 0 ) >>> 0;
	if ( client.h2InfoMask !== infoMask || client.h2InfoMask2 !== infoMask2 ) {

		MSG_WriteByte( msg, svc_hexen2_info_mask );
		MSG_WriteLong( msg, infoMask );
		MSG_WriteLong( msg, infoMask2 );
		client.h2InfoMask = infoMask;
		client.h2InfoMask2 = infoMask2;

	}

	if ( mask === 0n ) { client.h2Stats = next; return; }
	const body = Hexen2_EncodeUpdateInv( ent, mask, offset => PR_GetString( offset ) );
	MSG_WriteByte( msg, svc_hexen2_update_inv );
	SZ_Write( msg, body, body.length );
	client.h2Stats = next;

}

/**
 * Sends every Hexen II stat to a client (a spawn or a resumed hub), as native's `send_all_v` does.
 *
 * @param {client_t} client the receiving client
 * @param {sizebuf_t} msg the reliable message
 */
export function SV_SendAllClientStats( client, msg ) {

	client.h2Stats = null;
	SV_UpdateClientStats( client, msg );

}

const localmodels = new Array( MAX_MODELS );
for ( let i = 0; i < MAX_MODELS; i ++ )
	localmodels[ i ] = '*' + i;

// PVS culling state (from WinQuake/sv_main.c)
// The PVS must include a small area around the client to allow head bobbing
// or other small motion on the client side.
const CONTENTS_SOLID = - 2;
const MAX_MAP_LEAFS = 8192;
let fatbytes = 0;
let fatpvs = new Uint8Array( MAX_MAP_LEAFS / 8 );

// sv_aim is only used in sv_main.js (not a physics cvar shared with sv_phys/sv_user)
export const sv_aim = new cvar_t( 'sv_aim', '0.93' );

export let current_skill = 0;

/*
===============
SV_Init
===============
*/
/**
 * One-time server setup at start-up, called from Host_Init (WinQuake sv_main.c). Gives the progs interpreter
 * `Host_Error`, registers the physics, aim, shot-delay and respawn-guard cvars, gives pr_edict.js the `deathmatch`
 * cvar, fills the `*0`..`*N` submodel names, and gives sv_user.js its callbacks (roll, drop, net reads, command
 * execution, the current client and key destination).
 */
export function SV_Init() {

	PR_SetHostError( Host_Error );
	Cvar_RegisterVariable( sv_maxvelocity );
	Cvar_RegisterVariable( sv_protocol );
	Cvar_RegisterVariable( max_temp_edicts );
	Cvar_RegisterVariable( sv_gravity );
	Cvar_RegisterVariable( sv_shotdelay );
	Cvar_RegisterVariable( sv_respawnguard );
	Cvar_RegisterVariable( sv_friction );
	Cvar_RegisterVariable( sv_edgefriction );
	Cvar_RegisterVariable( sv_stopspeed );
	Cvar_RegisterVariable( sv_maxspeed );
	Cvar_RegisterVariable( sv_accelerate );
	Cvar_RegisterVariable( sv_idealpitchscale );
	Cvar_RegisterVariable( sv_aim );
	Cvar_RegisterVariable( sv_nostep );
	PR_SetDeathmatch( deathmatch );

	for ( let i = 0; i < MAX_MODELS; i ++ )
		localmodels[ i ] = '*' + i;

	// Wire up sv_user.js callbacks
	SV_User_SetCallbacks( {
		V_CalcRoll,
		SV_DropClient,
		NET_GetMessage,
		Cbuf_InsertText,
		Cmd_ExecuteString,
		set_host_client,
		get_key_dest: () => key_dest,
	} );

}

/*
=============================================================================

EVENT MESSAGES

=============================================================================
*/

/*
==================
SV_StartParticle
==================
*/
/**
 * Make sure the event gets sent to all clients (WinQuake sv_main.c): appends an svc_particle to this frame's
 * unreliable `sv.datagram`. Dropped silently when the datagram is within 16 bytes of MAX_DATAGRAM. Called by QC's
 * `particle` builtin and the Newer gore and melee spray.
 *
 * @param {Float32Array|Array<number>} org effect origin, world space (Quake units)
 * @param {Float32Array|Array<number>} dir particle velocity; sent ×16 as signed bytes (-128..127)
 * @param {number} color palette index of the first particle colour, 0..255
 * @param {number} count number of particles, 0..255; 255 means an explosion (the client draws 1024)
 */
export function SV_StartParticle( org, dir, color, count ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 16 )
		return;
	MSG_WriteByte( sv.datagram, svc_particle );
	MSG_WriteCoord( sv.datagram, org[ 0 ] );
	MSG_WriteCoord( sv.datagram, org[ 1 ] );
	MSG_WriteCoord( sv.datagram, org[ 2 ] );
	for ( let i = 0; i < 3; i ++ ) {

		let v = ( dir[ i ] * 16 ) | 0;
		if ( v > 127 )
			v = 127;
		else if ( v < - 128 )
			v = - 128;
		MSG_WriteChar( sv.datagram, v );

	}

	MSG_WriteByte( sv.datagram, count );
	MSG_WriteByte( sv.datagram, color );

}

/*
==================
SV_StartSound
==================
*/
/**
 * Each entity can have eight independant sound sources, like voice, weapon, feet, etc. Channel 0 is an
 * auto-allocate channel, the others override anything allready running on that entity/channel pair. An attenuation
 * of 0 will play full volume everywhere in the level. Larger attenuations will drop off. (max 4 attenuation)
 * (WinQuake sv_main.c)
 *
 * Appends an svc_sound to this frame's unreliable `sv.datagram`, positioned at the centre of the entity's box.
 * Called by QC's `sound` builtin and the physics (water splashes, a fiend's landing). Dropped when the datagram is
 * within 16 bytes of MAX_DATAGRAM; a sample that was not precached prints a message and is not sent.
 *
 * @param {edict_t} entity the entity making the sound
 * @param {number} channel 0..7
 * @param {string} sample sound path as precached, e.g. 'weapons/guncock.wav'
 * @param {number} volume 0..255 (255 is full volume and is not sent)
 * @param {number} attenuation 0..4 (1 is normal and is not sent)
 * @throws {Error} through `Sys_Error` when volume, attenuation or channel is out of range
 */
export function SV_StartSound( entity, channel, sample, volume, attenuation ) {

	if ( volume < 0 || volume > 255 )
		Sys_Error( 'SV_StartSound: volume = ' + volume );

	if ( attenuation < 0 || attenuation > 4 )
		Sys_Error( 'SV_StartSound: attenuation = ' + attenuation );

	if ( channel < 0 || channel > 7 )
		Sys_Error( 'SV_StartSound: channel = ' + channel );

	if ( sv.datagram.cursize > MAX_DATAGRAM - 16 )
		return;

	// find precache number for sound
	let sound_num;
	for ( sound_num = 1; sound_num < SV_SoundLimit() && sv.sound_precache[ sound_num ]; sound_num ++ ) {

		if ( sample === sv.sound_precache[ sound_num ] )
			break;

	}

	if ( sound_num === SV_SoundLimit() || sv.sound_precache[ sound_num ] == null ) {

		Con_Printf( 'SV_StartSound: ' + sample + ' not precacheed\n' );
		return;

	}

	// NUM_FOR_EDICT -- entity index in edicts array
	const ent = NUM_FOR_EDICT( entity );

	channel = ( ent << 3 ) | channel;

	let field_mask = 0;
	if ( volume !== 255 ) // DEFAULT_SOUND_PACKET_VOLUME
		field_mask |= 1; // SND_VOLUME
	if ( attenuation !== 1.0 ) // DEFAULT_SOUND_PACKET_ATTENUATION
		field_mask |= 2; // SND_ATTENUATION

	// directed messages go only to the entity they are targeted on
	MSG_WriteByte( sv.datagram, svc_sound );
	MSG_WriteByte( sv.datagram, field_mask );
	if ( field_mask & 1 ) // SND_VOLUME
		MSG_WriteByte( sv.datagram, volume );
	if ( field_mask & 2 ) // SND_ATTENUATION
		MSG_WriteByte( sv.datagram, ( attenuation * 64 ) | 0 );
	MSG_WriteShort( sv.datagram, channel );
	SV_WriteIndex( sv.datagram, sound_num );
	for ( let i = 0; i < 3; i ++ )
		MSG_WriteCoord( sv.datagram, entity.v.origin[ i ] + 0.5 * ( entity.v.mins[ i ] + entity.v.maxs[ i ] ) );

}

/*
==============================================================================

HEXEN II MESSAGE WRITERS

The unified protocol's Hexen-only services (protocol.js). They are reached by the Hexen builtins and gamecode paths
(U3/U8/U9); none of them is called for a Quake game.

==============================================================================
*/

function writeDatagramBytes( bytes ) {

	if ( sv.datagram.cursize + bytes.length > sv.datagram.maxsize ) return false;
	SZ_Write( sv.datagram, bytes, bytes.length );
	return true;

}

/**
 * Sends `svc_hexen2_start_effect` (a long-lived client effect) on the unreliable datagram. The body is the native
 * effect codec's, with the unified opcode in place of the native one.
 *
 * @param {{ index: number, type: number, params?: object }} effect the slot, CE_* type and its native parameters
 * @returns {boolean} false when the effect is unknown or the datagram is full
 */
export function SV_Hexen2StartEffect( effect ) {

	const written = Hexen2_WriteStartEffect( { ...effect, protocol: 19 } );
	if ( ! written.ok ) return false;
	const bytes = written.bytes.slice();
	bytes[ 0 ] = svc_hexen2_start_effect;
	return writeDatagramBytes( bytes );

}

/**
 * Sends `svc_hexen2_end_effect` (an effect slot's expiry) on the unreliable datagram.
 *
 * @param {number} index the effect slot
 * @returns {boolean} false when the index is invalid or the datagram is full
 */
export function SV_Hexen2EndEffect( index ) {

	const written = Hexen2_WriteEndEffect( index );
	if ( ! written.ok ) return false;
	const bytes = written.bytes.slice();
	bytes[ 0 ] = svc_hexen2_end_effect;
	return writeDatagramBytes( bytes );

}

/**
 * Sends `svc_hexen2_plaque`: a strings.txt index for the plaque overlay (native `plaque_draw`).
 *
 * @param {number} index the strings.txt entry (1-based); 0 clears it
 */
export function SV_Hexen2Plaque( index ) {

	MSG_WriteByte( sv.reliable_datagram, svc_hexen2_plaque );
	MSG_WriteShort( sv.reliable_datagram, index | 0 );

}

/**
 * Sends `svc_hexen2_raineffect` (native `rain_go`): an origin, box size, x/y direction and a colour/count.
 *
 * @param {ArrayLike<number>} origin the rain volume's origin
 * @param {ArrayLike<number>} size the volume's size
 * @param {number} xDir the x direction angle in degrees
 * @param {number} yDir the y direction angle in degrees
 * @param {number} colour the particle palette start
 * @param {number} count the particle count
 */
export function SV_Hexen2RainEffect( origin, size, xDir, yDir, colour, count ) {

	MSG_WriteByte( sv.datagram, svc_hexen2_raineffect );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, size[ i ] );
	MSG_WriteAngle( sv.datagram, xDir );
	MSG_WriteAngle( sv.datagram, yDir );
	MSG_WriteShort( sv.datagram, colour | 0 );
	MSG_WriteShort( sv.datagram, count | 0 );

}

/**
 * Sends `svc_hexen2_particle2`: the native cloud with a velocity range per axis.
 *
 * @param {ArrayLike<number>} origin the cloud origin
 * @param {ArrayLike<number>} dmin the minimum velocity per axis
 * @param {ArrayLike<number>} dmax the maximum velocity per axis
 * @param {number} colour the palette start
 * @param {number} effect the particle type
 * @param {number} count the particle count
 */
export function SV_Hexen2Particle2( origin, dmin, dmax, colour, effect, count ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 36 ) return;
	MSG_WriteByte( sv.datagram, svc_hexen2_particle2 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteFloat( sv.datagram, dmin[ i ] );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteFloat( sv.datagram, dmax[ i ] );
	MSG_WriteShort( sv.datagram, colour | 0 );
	MSG_WriteByte( sv.datagram, count | 0 );
	MSG_WriteByte( sv.datagram, effect | 0 );

}

/**
 * Sends `svc_hexen2_particle3`: the native box-cloud (a per-axis box in bytes).
 *
 * @param {ArrayLike<number>} origin the cloud origin
 * @param {ArrayLike<number>} box the per-axis box size in bytes
 * @param {number} colour the palette start
 * @param {number} effect the particle type
 * @param {number} count the particle count
 */
export function SV_Hexen2Particle3( origin, box, colour, effect, count ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 15 ) return;
	MSG_WriteByte( sv.datagram, svc_hexen2_particle3 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, origin[ i ] );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteByte( sv.datagram, box[ i ] | 0 );
	MSG_WriteShort( sv.datagram, colour | 0 );
	MSG_WriteByte( sv.datagram, count | 0 );
	MSG_WriteByte( sv.datagram, effect | 0 );

}

/**
 * Sends `svc_hexen2_particle4`: the native radius cloud.
 *
 * @param {ArrayLike<number>} origin the cloud origin
 * @param {number} radius the radius byte
 * @param {number} colour the palette start
 * @param {number} effect the particle type
 * @param {number} count the particle count
 */
export function SV_Hexen2Particle4( origin, radius, colour, effect, count ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 13 ) return;
	MSG_WriteByte( sv.datagram, svc_hexen2_particle4 );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, origin[ i ] );
	MSG_WriteByte( sv.datagram, radius | 0 );
	MSG_WriteShort( sv.datagram, colour | 0 );
	MSG_WriteByte( sv.datagram, count | 0 );
	MSG_WriteByte( sv.datagram, effect | 0 );

}

/**
 * Sends `svc_hexen2_particle_explosion`: the coloured explosion (native `particleexplosion`).
 *
 * @param {ArrayLike<number>} origin the explosion origin
 * @param {number} colour the palette colour
 * @param {number} radius the radius
 * @param {number} counter the counter
 */
export function SV_Hexen2ParticleExplosion( origin, colour, radius, counter ) {

	MSG_WriteByte( sv.datagram, svc_hexen2_particle_explosion );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, origin[ i ] );
	MSG_WriteShort( sv.datagram, colour | 0 );
	MSG_WriteShort( sv.datagram, radius | 0 );
	MSG_WriteShort( sv.datagram, counter | 0 );

}

function writeClientMessage( client, fn ) {

	if ( client == null || client.message == null ) return false;
	fn( client.message );
	return true;

}

/**
 * Sends per-client view-weapon draw flags to set or clear (`svc_hexen2_set_view_flags`/`clear_view_flags`).
 *
 * @param {client_t} client the receiving client
 * @param {number} flags the draw flags byte
 * @param {boolean} [clear=false] clear instead of set
 */
export function SV_Hexen2ViewFlags( client, flags, clear = false ) {

	return writeClientMessage( client, msg => {

		MSG_WriteByte( msg, clear ? svc_hexen2_clear_view_flags : svc_hexen2_set_view_flags );
		MSG_WriteByte( msg, flags & 0xff );

	} );

}

/**
 * Sends `svc_hexen2_set_view_tint` (the view weapon's colour shade).
 *
 * @param {client_t} client the receiving client
 * @param {number} tint the colourshade byte
 */
export function SV_Hexen2ViewTint( client, tint ) {

	return writeClientMessage( client, msg => {

		MSG_WriteByte( msg, svc_hexen2_set_view_tint );
		MSG_WriteByte( msg, tint & 0xff );

	} );

}

/**
 * Sends `svc_hexen2_setangle_interpolate`: the native eight-step view-angle target.
 *
 * @param {client_t} client the receiving client
 * @param {ArrayLike<number>} angles the target angles in degrees
 */
export function SV_Hexen2SetAngleInterpolate( client, angles ) {

	return writeClientMessage( client, msg => {

		MSG_WriteByte( msg, svc_hexen2_setangle_interpolate );
		for ( let i = 0; i < 3; i ++ ) MSG_WriteAngle( msg, angles[ i ] );

	} );

}

/**
 * Sends `svc_hexen2_midi_name` to one client (also part of the signon).
 *
 * @param {client_t} client the receiving client
 * @param {string} name the MIDI/music name
 */
export function SV_Hexen2MidiName( client, name ) {

	return writeClientMessage( client, msg => {

		MSG_WriteByte( msg, svc_hexen2_midi_name );
		MSG_WriteString( msg, String( name ?? '' ) );

	} );

}

/**
 * Sends `svc_hexen2_toggle_statbar`.
 *
 * @param {client_t} client the receiving client
 */
export function SV_Hexen2ToggleStatbar( client ) {

	return writeClientMessage( client, msg => MSG_WriteByte( msg, svc_hexen2_toggle_statbar ) );

}

/**
 * Sends `svc_hexen2_updateclass` for one player.
 *
 * @param {sizebuf_t} msg the message (a reliable one)
 * @param {number} slot the client slot (0-based)
 * @param {number} playerclass the native class (1..5)
 */
export function SV_Hexen2UpdateClass( msg, slot, playerclass ) {

	MSG_WriteByte( msg, svc_hexen2_updateclass );
	MSG_WriteByte( msg, slot & 0xff );
	MSG_WriteByte( msg, playerclass & 0xff );

}

/**
 * Sends `svc_hexen2_sound_update_pos`: an already playing entity sound's centre moved.
 *
 * @param {edict_t} entity the entity whose sound moved
 * @param {number} channel its sound channel (0..7)
 */
export function SV_Hexen2SoundUpdatePos( entity, channel ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 12 ) return;
	const ent = NUM_FOR_EDICT( entity );
	MSG_WriteByte( sv.datagram, svc_hexen2_sound_update_pos );
	MSG_WriteShort( sv.datagram, ( ent << 3 ) | ( channel & 7 ) );
	for ( let i = 0; i < 3; i ++ )
		MSG_WriteCoord( sv.datagram, entity.v.origin[ i ] + 0.5 * ( entity.v.mins[ i ] + entity.v.maxs[ i ] ) );

}

/**
 * Sends the native `svc_stopsound` for an entity/channel (`misc/null.wav` and `PF_stopSound`).
 *
 * @param {edict_t} entity the entity
 * @param {number} channel its sound channel (0..7)
 */
export function SV_Hexen2StopSound( entity, channel ) {

	if ( sv.datagram.cursize > MAX_DATAGRAM - 4 ) return;
	const ent = NUM_FOR_EDICT( entity );
	MSG_WriteByte( sv.datagram, svc_stopsound );
	MSG_WriteShort( sv.datagram, ( ent << 3 ) | ( channel & 7 ) );

}

/**
 * Sends `svc_hexen2_intermission` with Hexen II's picture index.
 *
 * @param {number} index the intermission picture index
 */
export function SV_Hexen2Intermission( index ) {

	MSG_WriteByte( sv.reliable_datagram, svc_hexen2_intermission );
	MSG_WriteByte( sv.reliable_datagram, index & 0xff );

}

/**
 * Sends a Hexen II temp-entity stream (`TE_STREAM_*`, 24..32) on the unreliable datagram.
 *
 * @param {number} type the TE_STREAM_* type
 * @param {number} entity the beam's owner entity number
 * @param {number} flags the native flags (low four bits are the tag)
 * @param {number} duration the duration in 0.05 s steps
 * @param {ArrayLike<number>} source the beam source
 * @param {ArrayLike<number>} dest the beam destination
 * @param {number} [skin=0] the colour beam's skin
 */
export function SV_Hexen2TempStream( type, entity, flags, duration, source, dest, skin = 0 ) {

	if ( type < TE_STREAM_LIGHTNING_SMALL || type > TE_STREAM_FAMINE ) return;
	if ( sv.datagram.cursize > MAX_DATAGRAM - 24 ) return;
	MSG_WriteByte( sv.datagram, svc_hexen2_temp_entity );
	MSG_WriteByte( sv.datagram, type );
	MSG_WriteShort( sv.datagram, entity | 0 );
	MSG_WriteByte( sv.datagram, flags & 0xff );
	MSG_WriteByte( sv.datagram, duration | 0 );
	if ( type === TE_STREAM_COLORBEAM ) MSG_WriteByte( sv.datagram, skin & 0xff );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, source[ i ] );
	for ( let i = 0; i < 3; i ++ ) MSG_WriteCoord( sv.datagram, dest[ i ] );

}

/*
==============================================================================

CLIENT SPAWNING

==============================================================================
*/

/*
================
SV_SendServerinfo
================
*/
/**
 * Sends the first message from the server to a connected client. This will be sent on the initial connection and
 * upon each server load (WinQuake sv_main.c). Writes to the client's reliable `message`: the version print with the
 * progs CRC, svc_serverinfo (protocol, max clients, game type, the level's title, model and sound precache lists),
 * the CD track, svc_setview, a `_movevars` stufftext for client-side prediction (matches QW sv_user.c:98-108) and
 * signon stage 1. Called by `SV_ConnectClient` and at the end of `SV_SpawnServer`.
 *
 * @param {client_t} client the client; `sendsignon` is set and `spawned` cleared (it needs prespawn, spawn, etc.)
 */
export function SV_SendServerinfo( client ) {
	client.cloakBodyCapability = false; // renegotiate on every map/signon
	const hexen2 = GameProfile_IsHexen2();

	MSG_WriteByte( client.message, svc_print );
	const message = '\x02\nVERSION 1.09 SERVER (' + pr_crc + ' CRC)';
	MSG_WriteString( client.message, message );

	MSG_WriteByte( client.message, svc_serverinfo );
	MSG_WriteLong( client.message, sv.protocol );
	MSG_WriteByte( client.message, svs.maxclients );

	if ( ! coop.value && deathmatch.value )
		MSG_WriteByte( client.message, GAME_DEATHMATCH );
	else
		MSG_WriteByte( client.message, GAME_COOP );

	// world message: a progs string in Quake, a strings.txt index carried beside the feature flags in Hexen II (the
	// map name stands in as the title until U3 loads strings.txt).
	const worldEdict = sv.edicts[ 0 ];
	if ( hexen2 ) MSG_WriteString( client.message, sv.name );
	else MSG_WriteString( client.message, worldEdict && worldEdict.v ? PR_GetString( worldEdict.v.message ) : '' );

	// model precache list
	for ( let i = 1; i < SV_ModelLimit() && sv.model_precache[ i ]; i ++ )
		MSG_WriteString( client.message, sv.model_precache[ i ] );
	MSG_WriteByte( client.message, 0 );

	// sound precache list
	for ( let i = 1; i < SV_SoundLimit() && sv.sound_precache[ i ]; i ++ )
		MSG_WriteString( client.message, sv.sound_precache[ i ] );
	MSG_WriteByte( client.message, 0 );

	// Hexen II's session feature flags: packet entity fields, the native signon baseline layout, the Portal rules and
	// the worldspawn message's strings.txt index. Sent only by a Hexen II server, so a Quake message is byte for byte
	// what it was.
	if ( hexen2 ) {

		MSG_WriteByte( client.message, svc_hexen2_features );
		MSG_WriteByte( client.message, HEXEN2_FEATURE_ALL | ( GameProfile_Get().portals ? HEXEN2_FEATURE_PORTALS : 0 ) );
		MSG_WriteShort( client.message, sv.levelStringIndex ?? HEXEN2_NO_LEVEL_STRING );

	}

	// send music
	MSG_WriteByte( client.message, svc_cdtrack );
	const cdTrack = hexen2 ? ( sv.cd_track | 0 ) : ( sv.edicts[ 0 ].v.sounds | 0 );
	MSG_WriteByte( client.message, cdTrack );
	MSG_WriteByte( client.message, cdTrack );

	if ( hexen2 ) {

		MSG_WriteByte( client.message, svc_hexen2_midi_name );
		MSG_WriteString( client.message, sv.midi_name ?? '' );

	}

	// set view
	MSG_WriteByte( client.message, svc_setview );
	const clientnum = svs.clients.indexOf( client );
	MSG_WriteShort( client.message, clientnum + 1 );

	// send movevars for client-side prediction (matches QW sv_user.c:98-108)
	MSG_WriteByte( client.message, svc_stufftext );
	MSG_WriteString( client.message, '_movevars'
		+ ' ' + sv_gravity.value
		+ ' ' + sv_stopspeed.value
		+ ' ' + sv_maxspeed.value
		+ ' ' + 500 // spectatormaxspeed (no cvar in NQ)
		+ ' ' + sv_accelerate.value
		+ ' ' + 0.7 // airaccelerate (no cvar in NQ)
		+ ' ' + 10 // wateraccelerate (no cvar in NQ)
		+ ' ' + sv_friction.value
		+ ' ' + 1 // waterfriction (no cvar in NQ)
		+ ' ' + 1.0 // entgravity
		+ '\n' );

	MSG_WriteByte( client.message, svc_signonnum );
	MSG_WriteByte( client.message, 1 );

	client.sendsignon = true;
	client.spawned = false; // need prespawn, spawn, etc

}

/*
================
SV_ConnectClient
================
*/
/**
 * Initializes a client_t for a new net connection. This will only be called once for a player each game, not once
 * for each level change (WinQuake sv_main.c). Resets the slot to a fresh `client_t` keeping its connection, binds it
 * to edict `clientnum + 1`, takes its spawn parms from QC's `SetNewParms` (or keeps the saved ones when loading a
 * game), then sends the server info. Called by `SV_CheckForNewClients`.
 *
 * @param {number} clientnum slot in `svs.clients`, 0..svs.maxclients-1; its `netconnection` must already be set
 */
export function SV_ConnectClient( clientnum ) {

	const client = svs.clients[ clientnum ];

	Con_DPrintf( 'Client ' + client.netconnection.address + ' connected\n' );

	const edictnum = clientnum + 1;

	// set up the client_t
	const netconnection = client.netconnection;

	// save spawn parms if loading a game
	const savedSpawnParms = new Float32Array( NUM_SPAWN_PARMS );
	if ( sv.loadgame ) {

		for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ )
			savedSpawnParms[ i ] = client.spawn_parms[ i ];

	}

	// clear the client
	const oldName = client.name;
	Object.assign( client, new client_t() );
	client.netconnection = netconnection;

	client.name = 'unconnected';
	client.active = true;
	client.spawned = false;
	// Hexen II's per-client state (native client_t): the chosen class and the last stat record sent.
	client.playerclass = 0;
	client.old_playerclass = - 1;
	client.h2Stats = null;
	client.h2InfoMask = - 1;
	client.h2InfoMask2 = - 1;
	client.edict = EDICT_NUM( edictnum );
	SV_CloakResetPlayer( client.edict );
	client.message.data = client.msgbuf;
	client.message.maxsize = MAX_MSGLEN;
	client.message.allowoverflow = true; // we can catch it

	client.privileged = false;

	if ( sv.loadgame ) {

		for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ )
			client.spawn_parms[ i ] = savedSpawnParms[ i ];

	} else if ( GameProfile_IsHexen2() ) {

		// Native Hexen II has no SetNewParms (uhexen2 sv_main.c SV_ConnectClient comments the call out): a new client's
		// spawn parms start empty and ClientConnect/PutClientInServer set the player up
		client.spawn_parms.fill( 0 );

	} else {

		// call the progs to get default spawn parms for the new client
		PR_ExecuteProgram( pr_global_struct.SetNewParms );
		for ( let i = 0; i < NUM_SPAWN_PARMS; i ++ )
			client.spawn_parms[ i ] = pr_global_struct[ 'parm' + ( i + 1 ) ];

	}

	SV_SendServerinfo( client );

}

/*
===================
SV_CheckForNewClients
===================
*/
/**
 * Accepts every pending network connection into a free client slot (WinQuake sv_main.c). Called once per server
 * frame from Host_ServerFrame, before client messages are read.
 *
 * @throws {Error} through `Sys_Error` when a connection arrives with no free client slot
 */
export function SV_CheckForNewClients() {

	while ( true ) {

		const ret = NET_CheckNewConnections();
		if ( ret == null )
			break;

		// init a new client structure
		let i;
		for ( i = 0; i < svs.maxclients; i ++ ) {

			if ( ! svs.clients[ i ].active )
				break;

		}

		if ( i === svs.maxclients )
			Sys_Error( 'Host_CheckForNewClients: no free clients' );

		svs.clients[ i ].netconnection = ret;
		SV_ConnectClient( i );

		set_net_activeconnections( net_activeconnections + 1 );

	}

}

/*
===============================================================================

FRAME UPDATES

===============================================================================
*/

/*
==================
SV_ClearDatagram
==================
*/
/**
 * Empties the unreliable broadcast datagram `sv.datagram` (sounds, particles) and clears its overflow flag (WinQuake
 * sv_main.c). Called at the start of every server frame from Host_ServerFrame.
 */
export function SV_ClearDatagram() {

	SZ_Clear( sv.datagram );
	sv.datagram.overflowed = false;

}

/*
=======================
SV_SendClientMessages
=======================
*/
/**
 * Sends this frame's messages to every active client (WinQuake sv_main.c). Called at the end of each server frame
 * from Host_ServerFrame. Broadcasts frag, name and colour changes on the reliable streams; sends each spawned client
 * its unreliable datagram; keeps clients still signing on alive with a nop every 5 seconds; sends each pending
 * reliable message when the connection can take it. Drops a client whose message overflowed or failed to send, or
 * that was marked `dropasap`. Finally clears EF_MUZZLEFLASH on all entities.
 */
export function SV_SendClientMessages() {

	// update frags, names, etc
	SV_UpdateToReliableMessages();

	// build individual updates
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		set_host_client( client );

		if ( ! client.active )
			continue;

		if ( client.spawned ) {

			if ( ! SV_SendClientDatagram( client ) )
				continue;

		} else {

			// the player isn't totally in the game yet
			// send small keepalive messages if too much time has passed
			// send a full message when the next signon stage has been requested
			if ( ! client.sendsignon ) {

				if ( realtime - client.last_message > 5 )
					SV_SendNop( client );
				continue;

			}

		}

		// check for an overflowed message
		if ( client.message.overflowed ) {

			SV_DropClient( true );
			client.message.overflowed = false;
			continue;

		}

		if ( client.message.cursize || client.dropasap ) {

			if ( ! NET_CanSendMessage( client.netconnection ) )
				continue;

			if ( client.dropasap ) {

				SV_DropClient( false ); // went to another level

			} else {

				if ( NET_SendMessage( client.netconnection, client.message ) === - 1 )
					SV_DropClient( true );
				SZ_Clear( client.message );
				client.last_message = realtime;
				client.sendsignon = false;

			}

		}

	}

	// clear muzzle flashes
	SV_CleanupEnts();

}

/*
=======================
SV_UpdateToReliableMessages
=======================
*/
function SV_UpdateToReliableMessages() {

	// check for changes to be sent over the reliable streams
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const hclient = svs.clients[ i ];

		if ( hclient.edict && hclient.old_frags !== hclient.edict.v.frags ) {

			for ( let j = 0; j < svs.maxclients; j ++ ) {

				const client = svs.clients[ j ];
				if ( ! client.active )
					continue;
				MSG_WriteByte( client.message, svc_updatefrags );
				MSG_WriteByte( client.message, i );
				MSG_WriteShort( client.message, hclient.edict.v.frags );

			}

			hclient.old_frags = hclient.edict.v.frags;

		}

	}

	// Hexen II tells every client each player's class (native svc_updateclass)
	if ( GameProfile_IsHexen2() ) {

		for ( let i = 0; i < svs.maxclients; i ++ ) {

			const hclient = svs.clients[ i ];
			if ( ! hclient.active || hclient.playerclass === 0 || hclient.old_playerclass === hclient.playerclass ) continue;
			hclient.old_playerclass = hclient.playerclass;
			for ( let j = 0; j < svs.maxclients; j ++ ) {

				const client = svs.clients[ j ];
				if ( ! client.active ) continue;
				MSG_WriteByte( client.message, svc_hexen2_updateclass );
				MSG_WriteByte( client.message, i );
				MSG_WriteByte( client.message, hclient.playerclass | 0 );

			}

		}

	}

	for ( let j = 0; j < svs.maxclients; j ++ ) {

		const client = svs.clients[ j ];
		if ( ! client.active )
			continue;
		SZ_Write( client.message, sv.reliable_datagram.data, sv.reliable_datagram.cursize );

	}

	SZ_Clear( sv.reliable_datagram );
	sv.reliable_datagram.overflowed = false;

}

/*
=============================================================================

The PVS must include a small area around the client to allow head bobbing
or other small motion on the client side. Otherwise, a bob might cause an
entity that should be visible to not show up, especially when the bob
crosses a waterline.

=============================================================================
*/

/*
=============
SV_AddToFatPVS

Recursively accumulates PVS bits from leafs within 8 units of the point.
=============
*/
function SV_AddToFatPVS( org, node ) {

	while ( true ) {

		// if this is a leaf, accumulate the pvs bits
		if ( node.contents < 0 ) {

			if ( node.contents !== CONTENTS_SOLID ) {

				const pvs = Mod_LeafPVS( node, sv.worldmodel );
				for ( let i = 0; i < fatbytes; i ++ )
					fatpvs[ i ] |= pvs[ i ];

			}

			return;

		}

		const plane = node.plane;
		const d = DotProduct( org, plane.normal ) - plane.dist;

		if ( d > 8 )
			node = node.children[ 0 ];
		else if ( d < - 8 )
			node = node.children[ 1 ];
		else {

			// go down both sides
			SV_AddToFatPVS( org, node.children[ 0 ] );
			node = node.children[ 1 ];

		}

	}

}

/*
=============
SV_SeeThroughLiquids

The level compiler treats water as solid when it works out what can see what, so
from outside a pool nothing in it is "visible", and from inside it nothing outside
is.  Newer Game draws through the surface, so what is beyond it must be sent too
(a secret wall under the water, a monster, an item): when one side of a liquid
surface is in the set, so is the other.
=============
*/
function SV_SeeThroughLiquids() {

	const links = SV_LiquidLinks();
	if ( links.length === 0 ) return;

	const leafs = sv.worldmodel.leafs;

	for ( const l of links ) {

		if ( l.aNum === undefined ) {

			l.aNum = leafs.indexOf( l.above );
			l.bNum = leafs.indexOf( l.below );

		}

		// PVS bit i is leaf i + 1
		const aSeen = l.aNum > 0 && ( fatpvs[ ( l.aNum - 1 ) >> 3 ] & ( 1 << ( ( l.aNum - 1 ) & 7 ) ) ) !== 0;
		const bSeen = l.bNum > 0 && ( fatpvs[ ( l.bNum - 1 ) >> 3 ] & ( 1 << ( ( l.bNum - 1 ) & 7 ) ) ) !== 0;

		if ( aSeen ) for ( let i = 0; i < l.belowVis.length && i < fatbytes; i ++ ) fatpvs[ i ] |= l.belowVis[ i ];
		if ( bSeen ) for ( let i = 0; i < l.aboveVis.length && i < fatbytes; i ++ ) fatpvs[ i ] |= l.aboveVis[ i ];

	}

}

/*
=============
SV_FatPVS

Calculates a PVS that is the inclusive or of all leafs within 8 pixels of the
given point.
=============
*/
function SV_FatPVS( org ) {

	fatbytes = ( sv.worldmodel.numleafs + 31 ) >> 3;
	if(fatbytes>fatpvs.length)fatpvs=new Uint8Array(fatbytes);
	fatpvs.fill( 0, 0, fatbytes );
	SV_AddToFatPVS( org, sv.worldmodel.nodes[ 0 ] );
	if ( R_NewerGame() ) SV_SeeThroughLiquids();
	return fatpvs;

}

/*
==================
SV_WriteDelta

Writes part of a packetentities message.
Can delta from either a baseline or a previous packet_entity.
Ported from: QW/server/sv_ents.c
==================
*/
function SV_WriteDelta( from, to, msg, force ) {

	// send an update
	let bits = 0;

	for ( let i = 0; i < 3; i ++ ) {

		const miss = to.origin[ i ] - from.origin[ i ];
		if ( miss < - 0.1 || miss > 0.1 )
			bits |= PE_ORIGIN1 << i;

	}

	if ( to.angles[ 0 ] !== from.angles[ 0 ] )
		bits |= PE_ANGLE1;

	if ( to.angles[ 1 ] !== from.angles[ 1 ] )
		bits |= PE_ANGLE2;

	if ( to.angles[ 2 ] !== from.angles[ 2 ] )
		bits |= PE_ANGLE3;

	if ( to.colormap !== from.colormap )
		bits |= PE_COLORMAP;

	if ( to.skin !== from.skin )
		bits |= PE_SKIN;

	if ( to.frame !== from.frame )
		bits |= PE_FRAME;

	if ( to.effects !== from.effects )
		bits |= PE_EFFECTS;

	if ( to.modelindex !== from.modelindex )
		bits |= PE_MODEL;

	// Hexen II's optional render fields: a second more-bits byte, present only when one of them differs from the delta
	// base. Quake packet states keep the defaults (scale 100, drawflags 0, abslight 0), so no bit is ever set for them.
	let bits2 = 0;
	if ( ( to.scale ?? BASELINE_SCALE_DEFAULT ) !== ( from.scale ?? BASELINE_SCALE_DEFAULT ) )
		bits2 |= PE2_SCALE;
	if ( ( to.drawflags ?? 0 ) !== ( from.drawflags ?? 0 ) )
		bits2 |= PE2_DRAWFLAGS;
	if ( ( to.abslight ?? 0 ) !== ( from.abslight ?? 0 ) )
		bits2 |= PE2_ABSLIGHT;
	if ( bits2 !== 0 )
		bits |= PE_MOREBITS2;

	// Check if morebits byte is needed (any of the lower-byte flags set)
	if ( bits & 0xFF )
		bits |= PE_MOREBITS;

	//
	// write the message
	//
	// the word's 10 bits name entities up to 1023; the large-map protocol adds a byte after the word with the bits
	// above them, for up to MAX_EDICTS (cl_parse.js CL_PacketEntityNumber; docs/add-ons-2026-10-13.md)
	const large = sv.protocol === PROTOCOL_LARGE;
	if ( to.number === 0 )
		Sys_Error( 'SV_WriteDelta: unset entity number' );
	if ( to.number >= ( large ? MAX_EDICTS : PE_ENT_MASK + 1 ) )
		Sys_Error( 'SV_WriteDelta: entity number ' + to.number + ' too large' );

	if ( bits === 0 && ! force )
		return; // nothing to send!

	// an entity numbered a multiple of 1024 with nothing changed would write 0, the list's end: say "more bits" (none)
	if ( ( to.number & PE_ENT_MASK ) === 0 && ( bits & ~PE_ENT_MASK ) === 0 )
		bits |= PE_MOREBITS;
	const i = ( to.number & PE_ENT_MASK ) | ( bits & ~PE_ENT_MASK );
	if ( i & PE_REMOVE )
		Sys_Error( 'SV_WriteDelta: PE_REMOVE' );
	MSG_WriteShort( msg, i );
	if ( large )
		MSG_WriteByte( msg, to.number >> PE_ENT_BITS );

	if ( bits & PE_MOREBITS ) {

		MSG_WriteByte( msg, bits & 0xFF );
		if ( bits & PE_MOREBITS2 ) MSG_WriteByte( msg, bits2 );

	}
	if ( bits & PE_MODEL )
		SV_WriteIndex( msg, to.modelindex );
	if ( bits & PE_FRAME )
		SV_WriteIndex( msg, to.frame );
	if ( bits & PE_COLORMAP )
		MSG_WriteByte( msg, to.colormap );
	if ( bits & PE_SKIN )
		MSG_WriteByte( msg, to.skin );
	if ( bits & PE_EFFECTS )
		MSG_WriteByte( msg, to.effects );
	if ( bits & PE_ORIGIN1 )
		MSG_WriteCoord( msg, to.origin[ 0 ] );
	if ( bits & PE_ANGLE1 )
		MSG_WriteAngle( msg, to.angles[ 0 ] );
	if ( bits & PE_ORIGIN2 )
		MSG_WriteCoord( msg, to.origin[ 1 ] );
	if ( bits & PE_ANGLE2 )
		MSG_WriteAngle( msg, to.angles[ 1 ] );
	if ( bits & PE_ORIGIN3 )
		MSG_WriteCoord( msg, to.origin[ 2 ] );
	if ( bits & PE_ANGLE3 )
		MSG_WriteAngle( msg, to.angles[ 2 ] );

	if ( bits2 & PE2_SCALE )
		MSG_WriteByte( msg, to.scale ?? BASELINE_SCALE_DEFAULT );
	if ( bits2 & PE2_DRAWFLAGS )
		MSG_WriteByte( msg, to.drawflags ?? 0 );
	if ( bits2 & PE2_ABSLIGHT )
		MSG_WriteByte( msg, to.abslight ?? 0 );

}

/*
=============
SV_EmitPacketEntities

Writes a delta update of a packet_entities_t to the message.
Ported from: QW/server/sv_ents.c
=============
*/
/**
 * Writes one client's packet entities (`to`, sorted by number) to `msg`: an svc_packetentities from the baselines, or
 * an svc_deltapacketentities against the frame the client last acknowledged (`client.delta_sequence`). Called by
 * SV_WriteEntitiesToClient each frame; exported for tests/sv_large_protocol_native_test.js, which reads it back with
 * the real client parser.
 *
 * @param {object} client the client (`client_t`: `delta_sequence`, `frames`)
 * @param {{ num_entities: number, entities: Array<object> }} to this frame's entity states
 * @param {object} msg the message (`sizebuf_t`)
 */
export function SV_EmitPacketEntities( client, to, msg ) {

	let from;
	let oldmax;

	// this is the frame that we are going to delta update from
	if ( client.delta_sequence !== - 1 ) {

		const fromframe = client.frames[ client.delta_sequence & PE_UPDATE_MASK ];
		from = fromframe.entities;
		oldmax = from.num_entities;

		MSG_WriteByte( msg, svc_deltapacketentities );
		MSG_WriteByte( msg, client.delta_sequence );

	} else {

		oldmax = 0; // no delta update
		from = null;

		MSG_WriteByte( msg, svc_packetentities );

	}

	let newindex = 0;
	let oldindex = 0;

	while ( newindex < to.num_entities || oldindex < oldmax ) {

		const newnum = newindex >= to.num_entities ? 9999 : to.entities[ newindex ].number;
		const oldnum = oldindex >= oldmax ? 9999 : from.entities[ oldindex ].number;

		if ( newnum === oldnum ) {

			// delta update from old position
			SV_WriteDelta( from.entities[ oldindex ], to.entities[ newindex ], msg, false );
			oldindex ++;
			newindex ++;
			continue;

		}

		if ( newnum < oldnum ) {

			// this is a new entity, send it from the baseline
			const ent = EDICT_NUM( newnum );
			SV_WriteDelta( ent.baseline, to.entities[ newindex ], msg, true );
			newindex ++;
			continue;

		}

		if ( newnum > oldnum ) {

			// the old entity isn't present in the new message
			MSG_WriteShort( msg, ( oldnum & PE_ENT_MASK ) | PE_REMOVE );
			if ( sv.protocol === PROTOCOL_LARGE )
				MSG_WriteByte( msg, oldnum >> PE_ENT_BITS );
			oldindex ++;
			continue;

		}

	}

	MSG_WriteShort( msg, 0 ); // end of packetentities

}

/*
=============
SV_WriteEntitiesToClient

Encodes the current state of the world as a svc_packetentities message.
Ported from: QW/server/sv_ents.c
=============
*/
function SV_WriteEntitiesToClient( client, clent, pvs, msg ) {

	// this is the frame we are creating
	const frame = client.frames[ client.outgoing_sequence & PE_UPDATE_MASK ];

	// put visible entities into the packet_entities snapshot
	const pack = frame.entities;
	pack.num_entities = 0;

	// skip player entities (handled by svc_playerinfo), start after maxclients
	for ( let e = svs.maxclients + 1; e < sv.num_edicts; e ++ ) {

		const ent = EDICT_NUM( e );

		// ignore ents without visible models
		if ( ent.v.modelindex === 0 || PR_GetString( ent.v.model ) === '' )
			continue;

		// PVS check - ignore if not touching a PV leaf
		let visible = false;
		for ( let i = 0; i < ent.num_leafs; i ++ ) {

			const leafnum = ent.leafnums[ i ];
			if ( pvs[ leafnum >> 3 ] & ( 1 << ( leafnum & 7 ) ) ) {

				visible = true;
				break;

			}

		}

		if ( ! visible )
			continue;

		// add to the packetentities
		if ( pack.num_entities >= ( localClient( client ) ? MAX_PACKET_ENTITIES_LOCAL : MAX_PACKET_ENTITIES ) )
			continue; // all full

		const state = pack.entities[ pack.num_entities ];
		pack.num_entities ++;

		state.number = e;
		state.flags = 0;
		state.origin[ 0 ] = ent.v.origin[ 0 ];
		state.origin[ 1 ] = ent.v.origin[ 1 ];
		state.origin[ 2 ] = ent.v.origin[ 2 ];
		state.angles[ 0 ] = ent.v.angles[ 0 ];
		state.angles[ 1 ] = ent.v.angles[ 1 ];
		state.angles[ 2 ] = ent.v.angles[ 2 ];
		state.modelindex = ent.v.modelindex;
		state.frame = ent.v.frame;
		state.colormap = ent.v.colormap;
		state.skin = ent.v.skin;
		state.effects = ent.v.effects;
		if ( GameProfile_IsHexen2() ) {

			const fields = SV_Hexen2EntityFields( ent );
			state.scale = fields.scale;
			state.drawflags = fields.drawflags;
			state.abslight = fields.abslight;

		} else {

			// a pooled packet state may be left over from a Hexen II session: keep a Quake packet free of the fields
			state.scale = BASELINE_SCALE_DEFAULT;
			state.drawflags = 0;
			state.abslight = 0;

		}

	}

	// encode the packet entities as a delta from the
	// last packetentities acknowledged by the client
	SV_EmitPacketEntities( client, pack, msg );

}

/*
==================
SV_WriteClientdataToMessage
==================
*/
/**
 * Writes a player's own status to a message (WinQuake sv_main.c): a pending svc_damage (then clears `dmg_take` and
 * `dmg_save`), an svc_setangle when `fixangle` is set (a fixangle might get lost in a dropped packet; then cleared),
 * and svc_clientdata with view height, ideal pitch, punch angles, velocity, items (with the sigil bits of
 * `serverflags` in bits 28+, or a mission pack's `items2` in bits 23+), on-ground and in-water flags, weapon frame,
 * armour, weapon model, health and ammunition. Also updates the ideal pitch first. Called for each spawned client
 * every frame by the client datagram, and once by the `spawn` command.
 *
 * @param {edict_t} ent the client's player edict; `dmg_take`, `dmg_save` and `fixangle` are cleared
 * @param {sizebuf_t} msg the message to append to
 * @throws {Error} through `Sys_Error` when the weapon model was not precached
 */
export function SV_WriteClientdataToMessage( ent, msg, client = host_client ) {

	//
	// send a damage message
	//
	if ( ent.v.dmg_take || ent.v.dmg_save ) {

		const other = PROG_TO_EDICT( ent.v.dmg_inflictor );
		MSG_WriteByte( msg, svc_damage );
		MSG_WriteByte( msg, ent.v.dmg_save );
		MSG_WriteByte( msg, ent.v.dmg_take );
		for ( let i = 0; i < 3; i ++ )
			MSG_WriteCoord( msg, other.v.origin[ i ] + 0.5 * ( other.v.mins[ i ] + other.v.maxs[ i ] ) );

		ent.v.dmg_take = 0;
		ent.v.dmg_save = 0;

	}

	//
	// send the current viewpos offset from the view entity
	//
	SV_SetIdealPitch();

	// a fixangle might get lost in a dropped packet. Oh well.
	if ( ent.v.fixangle !== 0 ) {

		MSG_WriteByte( msg, svc_setangle );
		for ( let i = 0; i < 3; i ++ )
			MSG_WriteAngle( msg, ent.v.angles[ i ] );
		ent.v.fixangle = 0;

	}

	let bits = 0;

	if ( ent.v.view_ofs[ 2 ] !== DEFAULT_VIEWHEIGHT )
		bits |= SU_VIEWHEIGHT;

	if ( ent.v.idealpitch !== 0 )
		bits |= SU_IDEALPITCH;

	// stuff the sigil bits into the high bits of items for sbar, or else
	// mix in the optional mission-pack items2 field
	const items2 = GetEdictFieldValue( ent, 'items2' );
	let items;
	if ( items2 !== null ) {

		const value = items2.accessor.getFloat( items2.ofs ) | 0;
		items = ( ent.v.items | 0 ) | ( value << 23 );

	} else {

		const serverflags =
			( pr_global_struct !== null ? pr_global_struct.serverflags : 0 ) | 0;
		items = ( ent.v.items | 0 ) | ( serverflags << 28 );

	}

	bits |= SU_ITEMS;

	if ( ( ent.v.flags | 0 ) & FL_ONGROUND )
		bits |= SU_ONGROUND;

	if ( ent.v.waterlevel >= 2 )
		bits |= SU_INWATER;

	for ( let i = 0; i < 3; i ++ ) {

		if ( ent.v.punchangle[ i ] )
			bits |= ( SU_PUNCH1 << i );
		if ( ent.v.velocity[ i ] )
			bits |= ( SU_VELOCITY1 << i );

	}

	if ( ent.v.weaponframe )
		bits |= SU_WEAPONFRAME;

	if ( ent.v.armorvalue )
		bits |= SU_ARMOR;

	// always send weapon
	bits |= SU_WEAPON;

	// send the data
	MSG_WriteByte( msg, svc_clientdata );
	MSG_WriteShort( msg, bits );

	if ( bits & SU_VIEWHEIGHT )
		MSG_WriteChar( msg, ent.v.view_ofs[ 2 ] );

	if ( bits & SU_IDEALPITCH )
		MSG_WriteChar( msg, ent.v.idealpitch );

	for ( let i = 0; i < 3; i ++ ) {

		if ( bits & ( SU_PUNCH1 << i ) )
			MSG_WriteChar( msg, ent.v.punchangle[ i ] );
		if ( bits & ( SU_VELOCITY1 << i ) )
			MSG_WriteChar( msg, ent.v.velocity[ i ] / 16 );

	}

	// [always sent] if (bits & SU_ITEMS)
	MSG_WriteLong( msg, items );

	if ( bits & SU_WEAPONFRAME )
		SV_WriteIndex( msg, ent.v.weaponframe );
	if ( bits & SU_ARMOR )
		MSG_WriteByte( msg, ent.v.armorvalue );
	if ( bits & SU_WEAPON )
		SV_WriteIndex( msg, SV_ModelIndex( PR_GetString( ent.v.weaponmodel ) ) );

	MSG_WriteShort( msg, ent.v.health );
	MSG_WriteByte( msg, ent.v.currentammo );
	MSG_WriteByte( msg, ent.v.ammo_shells );
	MSG_WriteByte( msg, ent.v.ammo_nails );
	MSG_WriteByte( msg, ent.v.ammo_rockets );
	MSG_WriteByte( msg, ent.v.ammo_cells );

	if ( standard_quake ) {

		MSG_WriteByte( msg, ent.v.weapon );

	} else {

		// Mission pack (Rogue/Hipnotic): send weapon as bit index. WinQuake writes nothing when no bit is set (a weapon of
		// 0), which leaves the client reading the next message's byte; 0 is written then instead (card [34c])
		const weapon = ent.v.weapon | 0;
		let bit = 0;
		while ( bit < 31 && ( weapon & ( 1 << bit ) ) === 0 ) bit ++;
		MSG_WriteByte( msg, weapon === 0 ? 0 : bit );

	}

	// Hexen II keeps its stat bar in the separate inventory record, on the reliable stream (native SV_UpdateClientStats)
	if ( GameProfile_IsHexen2() && client != null ) SV_UpdateClientStats( client, client.message );

}

/*
==================
MSG_WriteDeltaUsercmd

QuakeWorld-style delta compression for usercmd_t
==================
*/
function MSG_WriteDeltaUsercmd( buf, from, cmd ) {

	let bits = 0;

	if ( cmd.angles[ 0 ] !== from.angles[ 0 ] )
		bits |= CM_ANGLE1;
	if ( cmd.angles[ 1 ] !== from.angles[ 1 ] )
		bits |= CM_ANGLE2;
	if ( cmd.angles[ 2 ] !== from.angles[ 2 ] )
		bits |= CM_ANGLE3;
	if ( cmd.forwardmove !== from.forwardmove )
		bits |= CM_FORWARD;
	if ( cmd.sidemove !== from.sidemove )
		bits |= CM_SIDE;
	if ( cmd.upmove !== from.upmove )
		bits |= CM_UP;
	if ( cmd.buttons !== from.buttons )
		bits |= CM_BUTTONS;
	if ( cmd.impulse !== from.impulse )
		bits |= CM_IMPULSE;

	MSG_WriteByte( buf, bits );

	if ( bits & CM_ANGLE1 )
		MSG_WriteAngle16( buf, cmd.angles[ 0 ] );
	if ( bits & CM_ANGLE2 )
		MSG_WriteAngle16( buf, cmd.angles[ 1 ] );
	if ( bits & CM_ANGLE3 )
		MSG_WriteAngle16( buf, cmd.angles[ 2 ] );
	if ( bits & CM_FORWARD )
		MSG_WriteShort( buf, cmd.forwardmove );
	if ( bits & CM_SIDE )
		MSG_WriteShort( buf, cmd.sidemove );
	if ( bits & CM_UP )
		MSG_WriteShort( buf, cmd.upmove );
	if ( bits & CM_BUTTONS )
		MSG_WriteByte( buf, cmd.buttons );
	if ( bits & CM_IMPULSE )
		MSG_WriteByte( buf, cmd.impulse );

}

// null command for delta compression baseline
const nullcmd = {
	msec: 0,
	angles: new Float32Array( 3 ),
	forwardmove: 0,
	sidemove: 0,
	upmove: 0,
	buttons: 0,
	impulse: 0
};

// Cached player command for SV_WritePlayersToClient (avoid per-frame allocations)
const _playerCmd = {
	msec: 0,
	angles: new Float32Array( 3 ),
	forwardmove: 0,
	sidemove: 0,
	upmove: 0,
	buttons: 0,
	impulse: 0
};

// Player model index for checking if model changed
let sv_playermodel = 0;

/*
==================
SV_WritePlayersToClient

QuakeWorld-style player info for client-side prediction
==================
*/
function SV_WritePlayersToClient( client, clent, pvs, msg ) {

	// Find player model index if not cached. Hexen II's players use class models (models/paladin.mdl, ...), so each
	// update carries its own model index instead of assuming one.
	const hexen2 = GameProfile_IsHexen2();
	if ( ! hexen2 && sv_playermodel === 0 ) {

		sv_playermodel = SV_ModelIndex( 'progs/player.mdl' );

	}

	for ( let j = 0; j < svs.maxclients; j ++ ) {

		const cl = svs.clients[ j ];
		if ( cl.active === false || cl.spawned === false )
			continue;

		const ent = cl.edict;
		if ( ent == null || ent.v == null )
			continue;

		// Visibility check (skip for self and spectators)
		if ( ent !== clent ) {

			// Check PVS - skip if not visible
			let i;
			for ( i = 0; i < ent.num_leafs; i ++ ) {

				const leafnum = ent.leafnums[ i ];
				if ( pvs[ leafnum >> 3 ] & ( 1 << ( leafnum & 7 ) ) )
					break;

			}

			if ( i === ent.num_leafs )
				continue; // not visible

		}

		let pflags = PF_MSEC | PF_COMMAND;
		const cloakBodyFrame = client.cloakBodyCapability === true ? SV_CloakBodyFrame( ent ) : null;
		if ( cloakBodyFrame !== null ) pflags |= PF_CLOAK_BODY;

		if ( hexen2 || ent.v.modelindex !== sv_playermodel )
			pflags |= PF_MODEL;
		for ( let i = 0; i < 3; i ++ ) {

			if ( ent.v.velocity[ i ] !== 0 )
				pflags |= ( PF_VELOCITY1 << i );

		}

		if ( ent.v.effects !== 0 )
			pflags |= PF_EFFECTS;
		if ( ent.v.skin !== 0 )
			pflags |= PF_SKINNUM;
		if ( ent.v.health <= 0 )
			pflags |= PF_DEAD;
		if ( ! hexen2 && ent.v.mins[ 2 ] !== - 24 )
			pflags |= PF_GIB;

		// For self, don't send msec/command (already known), but send weaponframe
		if ( ent === clent ) {

			pflags &= ~( PF_MSEC | PF_COMMAND );
			if ( ent.v.weaponframe !== 0 )
				pflags |= PF_WEAPONFRAME;

		}

		MSG_WriteByte( msg, svc_playerinfo );
		MSG_WriteByte( msg, j );
		MSG_WriteShort( msg, pflags );

		for ( let i = 0; i < 3; i ++ )
			MSG_WriteCoord( msg, ent.v.origin[ i ] );

		SV_WriteIndex( msg, ent.v.frame );

		if ( pflags & PF_MSEC ) {

			let msec = ( 1000 * ( sv.time - ( cl.localtime || 0 ) ) ) | 0;
			if ( msec > 255 )
				msec = 255;
			if ( msec < 0 )
				msec = 0;
			MSG_WriteByte( msg, msec );

		}

		if ( pflags & PF_COMMAND ) {

			// Get the client's last command (reuse cached object)
			_playerCmd.msec = 0;
			_playerCmd.forwardmove = cl.lastcmd != null ? cl.lastcmd.forwardmove : 0;
			_playerCmd.sidemove = cl.lastcmd != null ? cl.lastcmd.sidemove : 0;
			_playerCmd.upmove = cl.lastcmd != null ? cl.lastcmd.upmove : 0;
			_playerCmd.buttons = 0;
			_playerCmd.impulse = 0;
			const cmd = _playerCmd;

			// Copy angles from edict if dead (don't show corpse looking around)
			if ( ent.v.health <= 0 ) {

				cmd.angles[ 0 ] = 0;
				cmd.angles[ 1 ] = ent.v.angles[ 1 ];
				cmd.angles[ 2 ] = 0;

			} else if ( cl.lastcmd ) {

				cmd.angles[ 0 ] = cl.lastcmd.angles ? cl.lastcmd.angles[ 0 ] : 0;
				cmd.angles[ 1 ] = cl.lastcmd.angles ? cl.lastcmd.angles[ 1 ] : 0;
				cmd.angles[ 2 ] = cl.lastcmd.angles ? cl.lastcmd.angles[ 2 ] : 0;

			}

			MSG_WriteDeltaUsercmd( msg, nullcmd, cmd );

		}

		for ( let i = 0; i < 3; i ++ ) {

			if ( pflags & ( PF_VELOCITY1 << i ) )
				MSG_WriteShort( msg, ent.v.velocity[ i ] );

		}

		if ( pflags & PF_MODEL )
			SV_WriteIndex( msg, ent.v.modelindex );

		if ( pflags & PF_SKINNUM )
			MSG_WriteByte( msg, ent.v.skin );

		if ( pflags & PF_EFFECTS )
			MSG_WriteByte( msg, ent.v.effects );

		if ( pflags & PF_WEAPONFRAME )
			SV_WriteIndex( msg, ent.v.weaponframe );
		if ( pflags & PF_CLOAK_BODY )
			SV_WriteIndex( msg, cloakBodyFrame );

	}

}

/*
=======================
SV_SendClientDatagram
=======================
*/
// Cached buffers for SV_SendClientDatagram (avoid per-frame allocations)
const _scdBuf = new Uint8Array( MAX_DATAGRAM_LOCAL );
const _scdMsg = { allowoverflow: false, overflowed: false, data: _scdBuf, maxsize: MAX_DATAGRAM, cursize: 0 };
// a client on the in-memory loopback link (driver 0) is the local game: no network packet limit applies to it
const localClient = client => client?.netconnection?.driver === 0;
const _scdOrg = new Float32Array( 3 );

// Cached buffers for SV_SendNop (avoid per-call allocations)
const _sendNopBuf = new Uint8Array( 4 );
const _sendNopMsg = { allowoverflow: false, overflowed: false, data: _sendNopBuf, maxsize: 4, cursize: 0 };

// Cached buffers for SV_SendReconnect (avoid per-call allocations)
const _sendReconnectBuf = new Uint8Array( 128 );
const _sendReconnectMsg = { allowoverflow: false, overflowed: false, data: _sendReconnectBuf, maxsize: 128, cursize: 0 };

function SV_SendClientDatagram( client ) {

	// QW-style send gating: if transport is choked/backed up, skip building
	// expensive per-frame datagrams and try again next frame.
	if ( ! NET_CanSendUnreliableMessage( client.netconnection ) )
		return true;

	_scdMsg.allowoverflow = false;
	_scdMsg.overflowed = false;
	_scdMsg.cursize = 0;
	_scdMsg.maxsize = localClient( client ) ? MAX_DATAGRAM_LOCAL : MAX_DATAGRAM;

	MSG_WriteByte( _scdMsg, svc_time );
	MSG_WriteFloat( _scdMsg, sv.time );

	// Write server sequence number for delta compression
	MSG_WriteByte( _scdMsg, svc_serversequence );
	MSG_WriteLong( _scdMsg, client.outgoing_sequence );

	SV_WriteClientdataToMessage( client.edict, _scdMsg, client );

	// Send ping stat (average of recent ping samples, in milliseconds)
	if ( client.num_pings > 0 ) {

		let totalPing = 0;
		const count = Math.min( client.num_pings, NUM_PING_TIMES );
		for ( let i = 0; i < count; i ++ ) {

			totalPing += client.ping_times[ i ];

		}

		const pingMs = Math.round( ( totalPing / count ) * 1000 );
		if ( pingMs !== client.old_ping ) {

			MSG_WriteByte( _scdMsg, svc_updatestat );
			MSG_WriteByte( _scdMsg, STAT_PING );
			MSG_WriteLong( _scdMsg, pingMs );
			client.old_ping = pingMs;

		}

	}

	// Send player info for other players (QuakeWorld-style prediction)
	VectorAdd( client.edict.v.origin, client.edict.v.view_ofs, _scdOrg );
	const pvs = SV_FatPVS( _scdOrg );
	SV_WritePlayersToClient( client, client.edict, pvs, _scdMsg );

	// QW-style delta-compressed entity updates
	SV_WriteEntitiesToClient( client, client.edict, pvs, _scdMsg );

	// copy the server datagram if there is space
	if ( _scdMsg.cursize + sv.datagram.cursize < _scdMsg.maxsize )
		SZ_Write( _scdMsg, sv.datagram.data, sv.datagram.cursize );

	// Record frame senttime and increment sequence
	client.frames[ client.outgoing_sequence & PE_UPDATE_MASK ].senttime = sv.time;
	client.outgoing_sequence ++;

	// send the datagram
	const sendResult = NET_SendUnreliableMessage( client.netconnection, _scdMsg );
	if ( sendResult === - 1 ) {

		Con_Printf( 'SV_SendClientDatagram: NET_SendUnreliableMessage returned -1, dropping client %s\n', client.name );
		SV_DropClient( true );
		return false;

	}

	return true;

}

/*
=======================
SV_SendNop

Send a nop message without trashing or sending the accumulated client
message buffer
=======================
*/
function SV_SendNop( client ) {

	// Use cached buffer instead of allocating per-call
	_sendNopMsg.cursize = 0;

	MSG_WriteChar( _sendNopMsg, svc_nop );

	if ( NET_SendUnreliableMessage( client.netconnection, _sendNopMsg ) === - 1 )
		SV_DropClient( true );
	client.last_message = realtime;

}

/*
=======================
SV_CleanupEnts
=======================
*/
function SV_CleanupEnts() {

	if ( ! sv.edicts || ! sv.edicts[ 0 ] )
		return;

	// clear muzzle flashes from all edicts
	let ent = NEXT_EDICT( sv.edicts[ 0 ] );
	for ( let e = 1; e < sv.num_edicts; e ++, ent = NEXT_EDICT( ent ) ) {

		ent.v.effects = ( ent.v.effects | 0 ) & ~EF_MUZZLEFLASH;

	}

}

/*
=====================
SV_DropClient
=====================
*/
/**
 * Called when the player is getting totally kicked off the host; if (crash = true), don't bother sending signoffs
 * (WinQuake sv_main.c). Acts on the current `host_client` (server.js): sends svc_disconnect unless crashing, always
 * runs QC's `ClientDisconnect` for a spawned client (original Quake skipped this on crash, but that leaves bodies
 * solid/killable), closes the connection, frees the slot (the body stays around) and tells the other clients to
 * clear its name, frags and colours. Does nothing when there is no current client. Called on overflow or send
 * failure, by `kick`, server shutdown and a misbehaving client.
 *
 * @param {boolean} crash true when the connection is already broken (no farewell message is sent)
 */
export function SV_DropClient( crash ) {

	const client = host_client;
	if ( client == null )
		return;

	// Get the client index for notifications
	const clientnum = svs.clients.indexOf( client );

	if ( ! crash ) {

		// send any final messages (only if connection didn't crash)
		if ( NET_CanSendMessage( client.netconnection ) ) {

			MSG_WriteByte( client.message, svc_disconnect );
			NET_SendMessage( client.netconnection, client.message );

		}

	}

	// Always call ClientDisconnect to clean up the entity
	// (original Quake skipped this on crash, but that leaves bodies solid/killable)
	if ( client.edict != null && client.spawned ) {

		// call the prog function for removing a client
		// this will set the body to a dead frame, among other things
		const saveSelf = pr_global_struct.self;
		pr_global_struct.self = EDICT_TO_PROG( client.edict );
		PR_ExecuteProgram( pr_global_struct.ClientDisconnect );
		pr_global_struct.self = saveSelf;

	}

	Con_Printf( 'Client ' + client.name + ' removed\n' );

	// break the net connection
	if ( client.netconnection != null ) {

		NET_Close( client.netconnection );
		client.netconnection = null;

	}

	// free the client (the body stays around)
	client.active = false;
	client.cloakBodyCapability = false;
	SV_CloakResetPlayer( client.edict );
	client.name = '';
	client.old_frags = - 999999;
	client.spawned = false;

	set_net_activeconnections( net_activeconnections - 1 );

	// send notification to all clients
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const other = svs.clients[ i ];
		if ( ! other.active )
			continue;

		MSG_WriteByte( other.message, svc_updatename );
		MSG_WriteByte( other.message, clientnum );
		MSG_WriteString( other.message, '' );

		MSG_WriteByte( other.message, svc_updatefrags );
		MSG_WriteByte( other.message, clientnum );
		MSG_WriteShort( other.message, 0 );

		MSG_WriteByte( other.message, svc_updatecolors );
		MSG_WriteByte( other.message, clientnum );
		MSG_WriteByte( other.message, 0 );

	}

}

/*
================
SV_ModelIndex
================
*/
/**
 * Looks up a model's slot in the server's precache list (WinQuake sv_main.c).
 *
 * @param {string} name the model path as precached, e.g. 'progs/player.mdl'
 * @returns {number} its index in `sv.model_precache`; 0 for an empty or missing name
 * @throws {Error} through `Sys_Error` when the model was not precached
 */
export function SV_ModelIndex( name ) {

	if ( ! name || name.length === 0 )
		return 0;

	for ( let i = 0; i < MAX_MODELS && sv.model_precache[ i ] != null; i ++ ) {

		if ( sv.model_precache[ i ] === name )
			return i;

	}

	Sys_Error( 'SV_ModelIndex: model ' + name + ' not precached' );
	return 0;

}

/*
================
SV_SendReconnect

Tell all the clients that the server is changing levels
================
*/
function SV_SendReconnect() {

	// Use cached buffer instead of allocating per-call
	_sendReconnectMsg.cursize = 0;

	MSG_WriteChar( _sendReconnectMsg, svc_stufftext );
	MSG_WriteString( _sendReconnectMsg, 'reconnect\n' );
	NET_SendToAll( _sendReconnectMsg, 5 );

	Cbuf_InsertText( 'reconnect\n' );

}

/*
================
SV_SaveSpawnparms
================
*/
// Newer Game: the power-ups (the pentagram, the quad, the biosuit, the ring) and the time they
// have left go with you to the next level.  Quake's own parms leave them behind.
const CARRY_ITEMS = 524288 | 1048576 | 2097152 | 4194304; // IT_INVISIBILITY, IT_INVULNERABILITY, IT_SUIT, IT_QUAD
const CARRY_TIMERS = [
	[ 524288, 'invisible_finished', 'invisible_time' ],
	[ 1048576, 'invincible_finished', 'invincible_time' ],
	[ 2097152, 'radsuit_finished', 'rad_time' ],
	[ 4194304, 'super_damage_finished', 'super_time' ]
];
let carriedPowerups = null;
/**
 * Forgets any power-ups waiting to be carried into the next level, and the respawn travel record
 * (`SV_RespawnClearTravel`). Called by the `map` command, so a fresh run cannot inherit a failed travel's timers.
 */
export function SV_ClearCarriedPowerups() { carriedPowerups = null; SV_RespawnClearTravel(); }

function SV_CapturePowerups( ent ) {

	carriedPowerups = null;
	if ( ! R_NewerGame() ) return;

	const now = sv.time;
	const timers = [];
	for ( const [ bit, finished ] of CARRY_TIMERS ) {

		const field = GetEdictFieldValue( ent, finished );
		const left = field ? field.accessor.getFloat( field.ofs ) - now : 0;
		if ( ( ent.v.items & bit ) !== 0 && left > 0 ) timers.push( [ bit, finished, left ] );

	}

	if ( timers.length ) carriedPowerups = timers;

}

/**
 * Gives the player back the power-ups `SV_SaveSpawnparms` captured on the last level change (Newer Game only), with
 * the seconds they had left, and sets each one's warning-time field to 1. Called once the player is in the new level,
 * by the `spawn` command after QC's `PutClientInServer`. The captured set is used once and then forgotten.
 *
 * @param {edict_t} ent the player's edict; `items` and the `*_finished` / `*_time` QC fields are written
 */
export function SV_RestorePowerups( ent ) {

	const timers = carriedPowerups;
	carriedPowerups = null;
	if ( ! timers || ! R_NewerGame() ) return;

	for ( const [ bit, finished, left ] of timers ) {

		const field = GetEdictFieldValue( ent, finished );
		if ( ! field ) continue;
		ent.v.items = ( ent.v.items | 0 ) | bit;
		field.accessor.setFloat( field.ofs, sv.time + left );
		const flag = CARRY_TIMERS.find( t => t[ 0 ] === bit )[ 2 ];
		const warning = GetEdictFieldValue( ent, flag );
		if ( warning ) warning.accessor.setFloat( warning.ofs, 1 );

	}

}

/**
 * Grabs the current state of each client for saving across the transition to another level (WinQuake sv_main.c).
 * Called by the `changelevel` command just before `SV_SpawnServer`. Keeps `serverflags` (the sigils) in
 * `svs.serverflags`, then for each active client runs QC's `SetChangeParms` and copies `parm1`..`parm16` into
 * `client.spawn_parms`. For the first client it also captures the Newer Game power-ups (restored by
 * `SV_RestorePowerups`) and the respawn travel state.
 */
export function SV_SaveSpawnparms() {

	svs.serverflags = pr_global_struct.serverflags;

	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const client = svs.clients[ i ];
		if ( ! client.active )
			continue;

		// Native Hexen II has no SetChangeParms (uhexen2 sv_main.c comments it out): the client edict carries the state
		// through `clients.gip`/`ClientReEnter`, and a fresh map uses the spawn parms ClientConnect set.
		if ( GameProfile_IsHexen2() ) {

			if ( i === 0 ) { SV_CapturePowerups( client.edict ); SV_RespawnCaptureTravel( client.edict ); }
			continue;

		}

		// call the progs to get default spawn parms for the new client
		pr_global_struct.self = EDICT_TO_PROG( client.edict );
		if ( i === 0 ) { SV_CapturePowerups( client.edict ); SV_RespawnCaptureTravel( client.edict ); }
		PR_ExecuteProgram( pr_global_struct.SetChangeParms );
		for ( let j = 0; j < NUM_SPAWN_PARMS; j ++ )
			client.spawn_parms[ j ] = pr_global_struct[ 'parm' + ( j + 1 ) ];

	}

}

// The end position of one signon message for a static-entity layout. `legacy` is the older Quaked Hexen writer's
// short frame with no scale/drawflags/abslight; `native` is uhexen2's fixed layout.
function hexenSignonLength( data, at, end, layout ) {

	const opcode = data[ at ++ ];
	if ( opcode === svc_spawnstatic ) {

		if ( at + 2 > end ) return - 1;
		at += 2; // model short
		const fixed = layout === 'legacy' ? 4 : 6;
		if ( at + fixed + 9 > end ) return - 1;
		return at + fixed + 9;

	}
	if ( opcode === svc_spawnstaticsound ) return at + 10 > end ? - 1 : at + 10; // coord3 + short sample + vol + atten
	return - 1;

}

function scanHexenSignon( layout ) {

	const data = sv.signon.data, end = sv.signon.cursize;
	let at = 0;
	while ( at < end ) {

		const next = hexenSignonLength( data, at, end, layout );
		if ( next < 0 ) return false;
		at = next;

	}
	return at === end;

}

/*
================
SV_NormalizeHexenStatics

U3 owns the Hexen makestatic builtin. Until it writes uhexen2's fixed layout, its signon statics are the older
short-frame form; convert those to the native layout here, once, so the client has one layout to parse and the
conversion disappears when the builtin is fixed. A signon with no statics is left untouched.
================
*/
function SV_NormalizeHexenStatics() {

	const data = sv.signon.data, end = sv.signon.cursize;
	if ( end === 0 ) return;
	if ( scanHexenSignon( 'native' ) ) return; // already native, or no statics to tell the layouts apart
	if ( ! scanHexenSignon( 'legacy' ) ) return; // an unknown message: leave the reported signon error to the client

	let statics = 0;
	for ( let at = 0; at < end; ) { const next = hexenSignonLength( data, at, end, 'legacy' ); if ( data[ at ] === svc_spawnstatic ) statics ++; at = next; }
	const out = new Uint8Array( Math.max( end + 2 * statics, sv.signon.maxsize ) );
	let at = 0, to = 0;
	while ( at < end ) {

		const opcode = data[ at ++ ];
		out[ to ++ ] = opcode;
		if ( opcode === svc_spawnstatic ) {

			const model = data[ at ] | ( data[ at + 1 ] << 8 );
			const frame = data[ at + 2 ] | ( data[ at + 3 ] << 8 );
			const colormap = data[ at + 4 ], skin = data[ at + 5 ];
			at += 6;
			out[ to ++ ] = model & 0xff; out[ to ++ ] = ( model >> 8 ) & 0xff;
			out[ to ++ ] = frame & 0xff;
			out[ to ++ ] = colormap;
			out[ to ++ ] = skin;
			out[ to ++ ] = BASELINE_SCALE_DEFAULT; // scale 1.0
			out[ to ++ ] = 0; // drawflags
			out[ to ++ ] = 0; // abslight
			out.set( data.subarray( at, at + 9 ), to );
			at += 9; to += 9;

		} else {

			out.set( data.subarray( at, at + 10 ), to );
			at += 10; to += 10;

		}

	}
	sv.signon.data = out;
	sv.signon.cursize = to;
	if ( sv.signon.maxsize < to ) sv.signon.maxsize = to;

}

/*
================
SV_CreateBaseline
================
*/
function SV_CreateBaseline() {

	for ( let entnum = 0; entnum < sv.num_edicts; entnum ++ ) {

		const svent = EDICT_NUM( entnum );
		if ( ! svent || svent.free )
			continue;
		if ( entnum > svs.maxclients && ( ! svent.v || ! svent.v.modelindex ) )
			continue;

		//
		// create entity baseline
		//
		if ( svent.v ) {

			VectorCopy( svent.v.origin, svent.baseline.origin );
			VectorCopy( svent.v.angles, svent.baseline.angles );
			svent.baseline.frame = svent.v.frame;
			svent.baseline.skin = svent.v.skin;
			if ( GameProfile_IsHexen2() ) {

				const fields = SV_Hexen2EntityFields( svent );
				svent.baseline.scale = fields.scale;
				svent.baseline.drawflags = fields.drawflags;
				svent.baseline.abslight = fields.abslight;

			} else {

				// same reason: a baseline left from a Hexen II map must not make a Quake delta send the extension bits
				svent.baseline.scale = BASELINE_SCALE_DEFAULT;
				svent.baseline.drawflags = 0;
				svent.baseline.abslight = 0;

			}

			if ( entnum > 0 && entnum <= svs.maxclients ) {

				svent.baseline.colormap = entnum;
				// Hexen II's player model is class-specific and arrives in the entity updates, as native leaves the
				// baseline at 0 (SV_CreateBaseline).
				svent.baseline.modelindex = GameProfile_IsHexen2() ? 0 : SV_ModelIndex( 'progs/player.mdl' );

			} else {

				svent.baseline.colormap = 0;
				svent.baseline.modelindex = SV_ModelIndex( PR_GetString( svent.v.model ) );

			}

		}

		//
		// add to the message
		//
		MSG_WriteByte( sv.signon, svc_spawnbaseline );
		MSG_WriteShort( sv.signon, entnum );

		if ( GameProfile_IsHexen2() ) {

			// uhexen2 CL_ParseBaseline: a short model, then byte frame/colormap/skin/scale/drawflags/abslight
			MSG_WriteShort( sv.signon, svent.baseline.modelindex );
			MSG_WriteByte( sv.signon, svent.baseline.frame & 0xff );
			MSG_WriteByte( sv.signon, svent.baseline.colormap );
			MSG_WriteByte( sv.signon, svent.baseline.skin );
			MSG_WriteByte( sv.signon, svent.baseline.scale ?? BASELINE_SCALE_DEFAULT );
			MSG_WriteByte( sv.signon, svent.baseline.drawflags ?? 0 );
			MSG_WriteByte( sv.signon, svent.baseline.abslight ?? 0 );

		} else {

			SV_WriteIndex( sv.signon, svent.baseline.modelindex );
			SV_WriteIndex( sv.signon, svent.baseline.frame );
			MSG_WriteByte( sv.signon, svent.baseline.colormap );
			MSG_WriteByte( sv.signon, svent.baseline.skin );

		}
		for ( let i = 0; i < 3; i ++ ) {

			MSG_WriteCoord( sv.signon, svent.baseline.origin[ i ] );
			MSG_WriteAngle( sv.signon, svent.baseline.angles[ i ] );

		}

	}

}

/**
 * Ends the game when the map's signon (its static entities, ambient sounds and baselines, which every client receives
 * as it prespawns) overflowed its 8192 bytes. The buffer allows overflow, so an overflow clears it and is noted rather
 * than taking the page down with a Sys_Error (card [34c]). Called by `SV_SpawnServer` once the map has spawned, and by
 * the prespawn command before a client is sent the signon (QuakeC can still add to it during play).
 *
 * @param {string} where who asks, for the message
 * @throws {Error} via `Host_Error` when the signon overflowed, naming the map
 */
export function SV_CheckSignon( where ) {

	if ( sv.signon.overflowed )
		Host_Error( where + ': ' + sv.name + ' has more static entities, ambient sounds and baselines than the ' + sv.signon.maxsize + '-byte signon holds' );

}

/*
================
SV_SpawnServer
================
*/
/**
 * This is called at the start of each level (WinQuake sv_main.c), by the `map`, `changelevel` and `load` commands.
 * Tells connected clients to reconnect, clamps `skill` to 0..3, clears memory and the server state, reloads
 * progs.dat, allocates the edicts, loads `maps/<server>.bsp` and its submodels, links the world, spawns the map's
 * entities, reserves the Newer Game respawn and carried power-up sounds, runs two 0.1 s physics frames to allow
 * everything to settle, builds the entity baselines and sends the server info to every client. Also sets whether the
 * Newer maps are used (single player, Newer Game, seamless travel on) and gives seamless travel the engine's model
 * functions.
 *
 * A map that passes a protocol-15 limit while it loads (models, sounds, entities, in its settle frames too, or the
 * signon) is loaded again with the large-map protocol, which then stays for the session (sv_large_protocol.js;
 * docs/add-ons-2026-10-13.md).
 *
 * @param {string} server the map name without 'maps/' or '.bsp', e.g. 'e1m1'
 * @throws {Error} through `Sys_Error` when progs.dat cannot be loaded or the power-up carry sounds overflow the sound
 *   precache; a map that cannot be loaded prints a message and leaves `sv.active` false instead
 */
export function SV_SpawnServer( server, startspot = '' ) {

	try {

		spawnServer( server, startspot );

	} catch ( error ) {

		if ( ! error?.largeProtocol ) throw error;
		Con_Printf( '%s %s: loading it with the large-map protocol\n', server, error.message );
		Cvar_Set( 'sv_protocol', String( PROTOCOL_LARGE ) );
		sv.active = false; // its clients were told to reconnect the first time
		sv.settling = false;
		spawnServer( server, startspot );

	}

}

function spawnServer( server, startspot ) {

	const profile = GameProfile_Get();
	const hexen2 = profile.family === 'hexen2';

	// the engine's model functions, for seamless travel's views of other levels and its crossings (given here, before a
	// level exists, not as this module loads: card [44g], debt D10)
	SV_SeamlessUseModels( { Mod_LoadForPreview, Mod_PointInLeaf, Mod_ForName } );

	// Map commands can follow r_hdr in the same command batch, before a render
	// frame has synchronized the asset mode. Choose geometry from this game mode.
	COM_SetNewerActive( R_NewerGame() );
	PR_ResetStack(); // no QuakeC runs between maps: nothing an earlier error abandoned stays counted
	const useNewerMaps = R_NewerGame() && cls.state !== ca_dedicated && svs.maxclients === 1 && SV_SeamlessEnabled();
	COM_SetNewerMapsEnabled( useNewerMaps );

	// let's not have any servers with no name
	if ( hostname.string.length === 0 )
		Cvar_Set( 'hostname', 'UNNAMED' );

	Con_DPrintf( 'SpawnServer: ' + server + '\n' );
	svs.changelevel_issued = false; // now safe to issue another

	// Reset cached player model index so it's re-looked-up for the new map
	sv_playermodel = 0;

	//
	// tell all connected clients that we are going to a new level
	//
	if ( sv.active ) {

		SV_SendReconnect();

	}

	//
	// make cvars consistant
	//
	if ( coop.value )
		Cvar_SetValue( 'deathmatch', 0 );
	current_skill = ( skill.value + 0.5 ) | 0;
	if ( current_skill < 0 )
		current_skill = 0;
	const maxSkill = hexen2 ? 4 : 3; // Hexen II has five difficulty levels (uhexen2 SV_SpawnServer)
	if ( current_skill > maxSkill )
		current_skill = maxSkill;

	Cvar_SetValue( 'skill', current_skill );
	PR_SetCurrentSkill( current_skill );

	//
	// set up the new server
	//
	Host_ClearMemory();

	// clear the server struct
	Object.assign( sv, new ( sv.constructor )() );
	sv._newerMapsEnabled = useNewerMaps;
	// the protocol for this map, before anything is precached or written (card [34f]); Hexen II always uses the one
	// extended protocol (docs/hexen2/unified-host.md §2 rule 3), never its native 18/19 stream
	sv.protocol = hexen2 ? PROTOCOL_LARGE : SV_ProtocolFor( sv_protocol.value );
	sv.startspot = hexen2 ? String( startspot ?? '' ) : '';
	sv.levelStringIndex = HEXEN2_NO_LEVEL_STRING;
	sv.midi_name = '';
	sv.cd_track = 0;

	// Ensure progs.js has references to the canonical server objects
	PR_SetSV( sv );
	PR_SetSVS( svs );
	sv.SV_UnlinkEdict = SV_UnlinkEdict; // ED_Free unlinks a freed edict from the world through it, as WinQuake's does (card [44m])

	sv.name = server;
	sv.modelname = 'maps/' + server + '.bsp';

	// load progs to get entity field count
	const progsData = COM_LoadFile( 'progs.dat' );
	PR_LoadProgs( progsData );
	// said once a map, so it can never again go unnoticed (docs/stock-progs-2026-10-14.md)
	if ( R_NewerGame() && ! PR_StockProgs() ) Con_Printf( 'Newer Game: this game\'s own QuakeC (CRC %d) is not stock Quake, so the gameplay additions (shotgun pellets, the face\'s reactions, respawn, ...) are off\n', pr_crc );
	SV_RespawnWorldStart();

	// Wire up sv_phys.js with server state and cross-module callbacks
	// (must be after PR_LoadProgs so pr_global_struct is valid)
	SV_SetState( sv, svs, pr_global_struct );
	SV_SetCallbacks( {
		SV_Move,
		SV_TestEntityPosition,
		SV_LinkEdict,
		SV_PointContents,
		SV_StartSound,
		SV_StartParticle,
		PR_ExecuteProgram,
		EDICT_TO_PROG,
		PROG_TO_EDICT,
		NEXT_EDICT,
		GetEdictFieldValue,
	} );

	// allocate server memory: Hexen II's own 600-edict ceiling, with its reserved temp slots (uhexen2 SV_SpawnServer,
	// ED_Alloc_Temp). The slots are left free for U3's ED_Alloc_Temp; ED_Alloc skips them.
	sv.max_edicts = hexen2 ? profile.maxEdicts : ( sv.protocol === PROTOCOL_LARGE ? MAX_EDICTS : MAX_EDICTS_STANDARD ); // (card [34f])
	sv.max_temp_edicts = hexen2 ? Math.max( 0, max_temp_edicts.value | 0 ) : 0;

	// Allocate edicts array using entityfields from loaded progs
	const entityfields = progs ? progs.entityfields : 105; // 105 is default for standard Quake
	sv.edicts = PR_AllocEdicts( Math.min( sv.max_edicts, 1024 ), entityfields ); // the rest as used (EDICT_NUM)

	// set up sizebuf data pointers
	sv.datagram.maxsize = MAX_DATAGRAM;
	sv.datagram.cursize = 0;
	sv.datagram.data = sv.datagram_buf;
	sv.datagram.allowoverflow = true; // unreliable messages can be dropped

	sv.reliable_datagram.maxsize = MAX_DATAGRAM;
	sv.reliable_datagram.cursize = 0;
	sv.reliable_datagram.data = sv.reliable_datagram_buf;
	sv.reliable_datagram.allowoverflow = true; // will be copied to client reliables

	sv.signon.maxsize = sv.protocol === PROTOCOL_LARGE ? SIGNON_SIZE : SIGNON_SIZE_STANDARD;
	sv.signon.cursize = 0;
	sv.signon.data = sv.signon_buf;
	// a map whose static entities, ambient sounds and baselines do not fit (8192 bytes holds some 550 static entities)
	// ends the game with a Host_Error below, rather than a Sys_Error that takes the page down (card [34c])
	sv.signon.allowoverflow = true;
	sv.signon.overflowed = false;

	// leave slots at start for clients only, then Hexen II's reserved temp slots
	sv.num_edicts = svs.maxclients + 1 + sv.max_temp_edicts;
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		const ent = EDICT_NUM( i + 1 );
		svs.clients[ i ].edict = ent;

	}
	if ( hexen2 ) {

		for ( let i = 0; i < sv.max_temp_edicts; i ++ ) {

			const temp = EDICT_NUM( svs.maxclients + 1 + i );
			ED_ClearEdict( temp );
			temp.free = true;
			temp.freetime = - 999;

		}

	}

	sv.state = ss_loading;
	sv.paused = false;
	sv.time = 1.0;

	sv.name = server;
	sv.modelname = 'maps/' + server + '.bsp';

	// Hexen II's eight-headnode submodel records are recognised by the brush loader from the BSP itself
	sv.worldmodel = Mod_ForName( sv.modelname, false );
	if ( ! sv.worldmodel ) {

		Con_Printf( 'Couldn\'t spawn server ' + sv.modelname + '\n' );
		sv.active = false;
		return;

	}

	sv.models[ 1 ] = sv.worldmodel;

	//
	// clear world interaction links
	//
	SV_ClearWorld();

	sv.sound_precache[ 0 ] = '';
	sv.model_precache[ 0 ] = '';
	sv.model_precache[ 1 ] = sv.modelname;

	for ( let i = 1; i < sv.worldmodel.numsubmodels; i ++ ) {

		sv.model_precache[ 1 + i ] = localmodels[ i ];
		sv.models[ i + 1 ] = Mod_ForName( localmodels[ i ], false );

	}

	//
	// load the rest of the entities
	//
	const ent = EDICT_NUM( 0 );
	ED_ClearEdict( ent );
	ent.free = false;

	if ( ent.v ) {

		ent.v.model = ED_NewString( sv.worldmodel.name );
		ent.v.modelindex = 1; // world model
		ent.v.solid = SOLID_BSP;
		ent.v.movetype = MOVETYPE_PUSH;

		if ( coop.value )
			pr_global_struct.coop = coop.value;
		else
			pr_global_struct.deathmatch = deathmatch.value;

		pr_global_struct.mapname = ED_NewString( sv.name );

	}

	// serverflags are for cross level information (sigils)
	if ( pr_global_struct )
		pr_global_struct.serverflags = svs.serverflags;

	if ( hexen2 ) {

		// Hexen II globals by name: the base and Portal layouts differ, so never assume an offset. `startspot` selects
		// the named player start and `cl_playerclass` (Portal only) is worldspawn's class gate.
		if ( 'startspot' in pr_global_struct )
			pr_global_struct.startspot = ED_NewString( sv.startspot );
		if ( 'cl_playerclass' in pr_global_struct ) {

			const chosen = Cvar_VariableValue( '_cl_playerclass' );
			pr_global_struct.cl_playerclass = chosen >= 1 && chosen <= 5 ? chosen : 1;

		}

	}

	if ( sv.worldmodel && sv.worldmodel.entities ) {

		ED_LoadFromFile( sv.worldmodel.entities );

		// doorway and pit exits become seamless crossings (single player, Newer Game)
		SV_SeamlessSetup();

	}

	if ( hexen2 ) {

		// worldspawn's `message` is a strings.txt index in Hexen II, not a progs string offset. Carry the number for U3
		// and normalise any static-entity baselines still written in the older short-frame layout.
		const world = EDICT_NUM( 0 );
		sv.levelStringIndex = world && world.v ? ( world.v.message | 0 ) : HEXEN2_NO_LEVEL_STRING;
		SV_NormalizeHexenStatics();

	}

	SV_RespawnPrecache();
	SV_SetRespawnLandedHook( SV_SeamlessCloseReturn ); // a landed respawn shuts the way back to the previous level (card [3]; set here, not at load: the modules import each other)
	SV_SetRespawnEntryHook( SV_SeamlessEntryYaw ); // a respawn rises facing away from the way back (card [35])
	SV_RespawnReserveGuards(); // (after the level's own spawn functions have precached, with the tables as they are)
	// Enhanced travel/save restoration can retain powers whose pickup entity
	// is absent in this map. Reserve their native warning/expiry sounds before
	// serverinfo is sent; changing the sound table after signon is too late.
	if (R_NewerGame() && svs.maxclients===1 && PR_StockProgs()) {
		for (const sound of ['items/inv2.wav','items/inv3.wav','items/protect2.wav','items/protect3.wav','items/damage2.wav','items/damage3.wav','items/suit2.wav']) {
			if (sv.sound_precache.includes(sound)) continue;
			let slot=1;while(slot<MAX_SOUNDS && sv.sound_precache[slot])slot++;
			if(slot>=SV_SoundLimit()){SV_LargeProtocolNeeded(sv,'more than '+SV_SoundLimit()+' sounds');Sys_Error('Power-up carry sound precache overflow');}
			sv.sound_precache[slot]=sound;
		}
	}
	sv.active = true;

	// all setup is completed, any further precache statements are errors
	sv.state = ss_active;

	// run two frames to allow everything to settle (still part of loading for the protocol choice: a mod whose spawn
	// functions create their entities on a first think passes 600 here, sv_large_protocol.js)
	set_host_frametime( 0.1 );
	sv.settling = true;
	SV_Physics();
	SV_Physics();
	sv.settling = false;

	// create a baseline for more efficient communications
	SV_CreateBaseline();
	if ( sv.signon.overflowed ) SV_LargeProtocolNeeded( { state: ss_loading, protocol: sv.protocol }, 'a signon over ' + sv.signon.maxsize + ' bytes' );
	SV_CheckSignon( 'SV_SpawnServer' );

	// send serverinfo to all connected clients
	for ( let i = 0; i < svs.maxclients; i ++ ) {

		set_host_client( svs.clients[ i ] );
		if ( host_client.active )
			SV_SendServerinfo( host_client );

	}

	Con_DPrintf( 'Server spawned.\n' );

}
