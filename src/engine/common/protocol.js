/**
 * @module engine/common/protocol
 *
 * Network protocol constants (WinQuake protocol.h): update bits, server and client message numbers, sound and
 * temporary-entity codes.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/protocol.h -- communications protocols

export const PROTOCOL_VERSION = 15;
// This port's large-map protocol (card [34f]): protocol 15 with model, frame and sound numbers sent as shorts, for maps
// that precache more than 256 models or sounds (Dimension of the Machine). A number of its own: FitzQuake's 666
// would put its new messages where this port's svc_playerinfo and delta packets already are (42, 47 to 49). Only this
// port's own server and client speak it; a server uses it when sv_protocol asks.
export const PROTOCOL_LARGE = 1015;

// if the high bit of the servercmd is set, the low bits are fast update flags:
export const U_MOREBITS = ( 1 << 0 );
export const U_ORIGIN1 = ( 1 << 1 );
export const U_ORIGIN2 = ( 1 << 2 );
export const U_ORIGIN3 = ( 1 << 3 );
export const U_ANGLE2 = ( 1 << 4 );
export const U_NOLERP = ( 1 << 5 ); // don't interpolate movement
export const U_FRAME = ( 1 << 6 );
export const U_SIGNAL = ( 1 << 7 ); // just differentiates from other updates

// svc_update can pass all of the fast update bits, plus more
export const U_ANGLE1 = ( 1 << 8 );
export const U_ANGLE3 = ( 1 << 9 );
export const U_MODEL = ( 1 << 10 );
export const U_COLORMAP = ( 1 << 11 );
export const U_SKIN = ( 1 << 12 );
export const U_EFFECTS = ( 1 << 13 );
export const U_LONGENTITY = ( 1 << 14 );

export const SU_VIEWHEIGHT = ( 1 << 0 );
export const SU_IDEALPITCH = ( 1 << 1 );
export const SU_PUNCH1 = ( 1 << 2 );
export const SU_PUNCH2 = ( 1 << 3 );
export const SU_PUNCH3 = ( 1 << 4 );
export const SU_VELOCITY1 = ( 1 << 5 );
export const SU_VELOCITY2 = ( 1 << 6 );
export const SU_VELOCITY3 = ( 1 << 7 );
// SU_AIMENT (1<<8) AVAILABLE BIT
export const SU_ITEMS = ( 1 << 9 );
export const SU_ONGROUND = ( 1 << 10 ); // no data follows, the bit is it
export const SU_INWATER = ( 1 << 11 ); // no data follows, the bit is it
export const SU_WEAPONFRAME = ( 1 << 12 );
export const SU_ARMOR = ( 1 << 13 );
export const SU_WEAPON = ( 1 << 14 );

// a sound with no channel is a local only sound
export const SND_VOLUME = ( 1 << 0 ); // a byte
export const SND_ATTENUATION = ( 1 << 1 ); // a byte
export const SND_LOOPING = ( 1 << 2 ); // a long

// defaults for clientinfo messages
export const DEFAULT_VIEWHEIGHT = 22;

export const DEFAULT_SOUND_PACKET_VOLUME = 255;
export const DEFAULT_SOUND_PACKET_ATTENUATION = 1.0;

// game types sent by serverinfo
// these determine which intermission screen plays
export const GAME_COOP = 0;
export const GAME_DEATHMATCH = 1;

//==================
// note that there are some defs.qc that mirror to these numbers
// also related to svc_strings[] in cl_parse
//==================

//
// server to client
//
export const svc_bad = 0;
export const svc_nop = 1;
export const svc_disconnect = 2;
export const svc_updatestat = 3; // [byte] [long]
export const svc_version = 4; // [long] server version
export const svc_setview = 5; // [short] entity number
export const svc_sound = 6; // <see code>
export const svc_time = 7; // [float] server time
export const svc_print = 8; // [string] null terminated string
export const svc_stufftext = 9; // [string] stuffed into client's console buffer
export const svc_setangle = 10; // [angle3] set the view angle to this absolute value
export const svc_serverinfo = 11; // [long] version ... [string]..[0]model cache [string]...[0]sounds cache
export const svc_lightstyle = 12; // [byte] [string]
export const svc_updatename = 13; // [byte] [string]
export const svc_updatefrags = 14; // [byte] [short]
export const svc_clientdata = 15; // <shortbits + data>
export const svc_stopsound = 16; // <see code>
export const svc_updatecolors = 17; // [byte] [byte]
export const svc_particle = 18; // [vec3] <variable>
export const svc_damage = 19;
export const svc_spawnstatic = 20;
// svc_spawnbinary = 21
export const svc_spawnbaseline = 22;
export const svc_temp_entity = 23;
export const svc_setpause = 24; // [byte] on / off
export const svc_signonnum = 25; // [byte] used for the signon sequence
export const svc_centerprint = 26; // [string] to put in center of the screen
export const svc_killedmonster = 27;
export const svc_foundsecret = 28;
export const svc_spawnstaticsound = 29; // [coord3] [byte] samp [byte] vol [byte] aten
export const svc_intermission = 30; // [string] music
export const svc_finale = 31; // [string] music [string] text
export const svc_cdtrack = 32; // [byte] track [byte] looptrack
export const svc_sellscreen = 33;
export const svc_cutscene = 34;

//
// client to server
//
export const clc_bad = 0;
export const clc_nop = 1;
export const clc_disconnect = 2;
export const clc_move = 3; // [usercmd_t]
export const clc_stringcmd = 4; // [string] message

//
// temp entity events
//
export const TE_SPIKE = 0;
export const TE_SUPERSPIKE = 1;
export const TE_GUNSHOT = 2;
export const TE_EXPLOSION = 3;
export const TE_TAREXPLOSION = 4;
export const TE_LIGHTNING1 = 5;
export const TE_LIGHTNING2 = 6;
export const TE_WIZSPIKE = 7;
export const TE_KNIGHTSPIKE = 8;
export const TE_LIGHTNING3 = 9;
export const TE_LAVASPLASH = 10;
export const TE_TELEPORT = 11;
export const TE_EXPLOSION2 = 12;
export const TE_BEAM = 13;
export const TE_GORE = 40; // Newer Game: a monster has burst (origin, how big)

//
// QuakeWorld-style player info (svc_playerinfo)
// Used for client-side prediction of other players
//
export const svc_playerinfo = 42;

// playerinfo flags from server
// playerinfo always sends: playernum, flags, origin[] and frame
export const PF_MSEC = ( 1 << 0 );
export const PF_COMMAND = ( 1 << 1 );
export const PF_VELOCITY1 = ( 1 << 2 );
export const PF_VELOCITY2 = ( 1 << 3 );
export const PF_VELOCITY3 = ( 1 << 4 );
export const PF_MODEL = ( 1 << 5 );
export const PF_SKINNUM = ( 1 << 6 );
export const PF_EFFECTS = ( 1 << 7 );
export const PF_WEAPONFRAME = ( 1 << 8 ); // only sent for view player
export const PF_DEAD = ( 1 << 9 ); // don't block movement any more
export const PF_GIB = ( 1 << 10 ); // offset the view height differently
// Opt-in per receiving connection: `prespawn cloakbody1`. Only that capability
// permits this trailing body-frame index (a byte in protocol 15, a short in 1015; docs/cloak-body-protocol-2026-10-13.md). The ordinary
// model/frame remain native eyes/0. Absence clears previous cloak metadata.
export const PF_CLOAK_BODY = ( 1 << 11 );
export const CLOAK_BODY_CAPABILITY = 'cloakbody1';

// command move bits (for delta compression of usercmd_t)
export const CM_ANGLE1 = ( 1 << 0 );
export const CM_ANGLE3 = ( 1 << 1 );
export const CM_FORWARD = ( 1 << 2 );
export const CM_SIDE = ( 1 << 3 );
export const CM_UP = ( 1 << 4 );
export const CM_BUTTONS = ( 1 << 5 );
export const CM_IMPULSE = ( 1 << 6 );
export const CM_ANGLE2 = ( 1 << 7 );

//==============================================
// QW-style delta compression for packet entities
// Ported from: QW/client/protocol.h
//
// The first 16 bits of a packetentities update holds 10 bits
// of entity number (max 1024, to support MAX_EDICTS=600) and
// 6 bits of flags. In the large-map protocol (PROTOCOL_LARGE) a
// byte follows that word with the entity number's bits above the
// 10, for up to MAX_EDICTS (8192); protocol 15 is unchanged.
//==============================================

export const svc_packetentities = 47; // [...]
export const svc_deltapacketentities = 48; // [...]
export const svc_serversequence = 49; // [long] server frame sequence number

//==============================================
// Hexen II data on the one unified protocol
//
// A Hexen II session speaks PROTOCOL_LARGE and the Quake message flow above; the ids below carry the state Quake has
// no field for. They start after every Quake id so a Quake message can never be misread as one of them, and they are
// sent only by a Hexen II server (game_profile.js). Bodies follow the pinned uhexen2 engine/hexen2/protocol.h and the
// SV_Write* functions that write them; native Hexen message numbers (42, 47..53, ...) are deliberately not reused
// because those are Quake's playerinfo, packet entities and sequence messages here.
//==============================================

export const svc_hexen2_features = 50; // [byte] feature flags [short] worldspawn message's strings.txt index
export const svc_hexen2_start_effect = 51; // [byte] slot [byte] CE_* type and its native body (hexen2_effectwire.js)
export const svc_hexen2_end_effect = 52; // [byte] slot
export const svc_hexen2_update_inv = 53; // native svc_update_inv body (hexen2_clientdata.js)
export const svc_hexen2_plaque = 54; // [short] strings.txt index (native svc_plaque)
export const svc_hexen2_raineffect = 55; // [vec3] origin [vec3] size [angle] x [angle] y [short] colour [short] count
export const svc_hexen2_particle2 = 56; // [vec3] origin [vec3] dmin [vec3] dmax [short] colour [byte] count [byte] effect
export const svc_hexen2_particle3 = 57; // [vec3] origin [byte3] box [short] colour [byte] count [byte] effect
export const svc_hexen2_particle4 = 58; // [vec3] origin [byte] radius [short] colour [byte] count [byte] effect
export const svc_hexen2_particle_explosion = 59; // [vec3] origin [short] colour [short] radius [short] counter
export const svc_hexen2_set_view_flags = 60; // [byte] drawflags to set on the view weapon
export const svc_hexen2_clear_view_flags = 61; // [byte] drawflags to clear
export const svc_hexen2_set_view_tint = 62; // [byte] view colourshade
// 63 is the private 1019 envelope's opcode (hexen2_protocol.js) and is left free here.
export const svc_hexen2_setangle_interpolate = 64; // [angle3] the native 8-step view-angle interpolation target
export const svc_hexen2_midi_name = 65; // [string] the level's MIDI/music name
export const svc_hexen2_updateclass = 66; // [byte] client slot [byte] native player class (1..5)
export const svc_hexen2_toggle_statbar = 67; // no body: toggles the Hexen status bar
export const svc_hexen2_sound_update_pos = 68; // [short] ent<<3|channel [vec3] entity-centre origin
export const svc_hexen2_intermission = 69; // [byte] Hexen intermission picture index (native svc_intermission)
export const svc_hexen2_temp_entity = 70; // [byte] TE_ type 24..32 then the native stream body
export const svc_hexen2_info_mask = 71; // [long] objectives [long] objectives2 (Portal)
export const svc_hexen2_update_kingofhill = 72; // [short] native entity number; the client stores it minus one

// The feature flags svc_hexen2_features carries.
export const HEXEN2_FEATURE_ENTITY_FIELDS = ( 1 << 0 ); // packet entities may carry scale/drawflags/abslight
export const HEXEN2_FEATURE_NATIVE_BASELINES = ( 1 << 1 ); // baselines/statics use Hexen's fixed byte layout
export const HEXEN2_FEATURE_PORTALS = ( 1 << 2 ); // the Portal of Praevus rules (cl_playerclass exists)
export const HEXEN2_FEATURE_ALL = HEXEN2_FEATURE_ENTITY_FIELDS | HEXEN2_FEATURE_NATIVE_BASELINES;
// The worldspawn `message` field is a strings.txt index in Hexen II, not a progs string offset.
export const HEXEN2_NO_LEVEL_STRING = 0xffff;

// Hexen II temp-entity stream types carried by svc_hexen2_temp_entity (uhexen2 engine/hexen2/protocol.h).
export const TE_STREAM_LIGHTNING_SMALL = 24;
export const TE_STREAM_CHAIN = 25;
export const TE_STREAM_SUNSTAFF1 = 26;
export const TE_STREAM_SUNSTAFF2 = 27;
export const TE_STREAM_LIGHTNING = 28;
export const TE_STREAM_COLORBEAM = 29;
export const TE_STREAM_ICECHUNKS = 30;
export const TE_STREAM_GAZE = 31;
export const TE_STREAM_FAMINE = 32;

// Hexen II's move button bits: the native crouch bit is 4 (cl_input.c SV_ReadClientMove); Quake keeps 1 and 2.
export const BUTTON_ATTACK = 1;
export const BUTTON_JUMP = 2;
export const BUTTON_CROUCH = 4;

export const clc_delta = 5; // [byte] sequence number, requests delta compression
// Hexen II's clc_inv_select is native 5, which is clc_delta here; the unified protocol gives it the next free id.
export const clc_inv_select = 6; // [byte] inventory selection on the player's edict

// Entity number mask: 10 bits for entity number (0-1023)
export const PE_ENT_BITS = 10;
export const PE_ENT_MASK = ( 1 << PE_ENT_BITS ) - 1; // 0x3FF

// Packet entity U_* flags (upper 6 bits of the short, plus morebits byte)
// Bits 10-15 of the first short:
export const PE_ORIGIN1 = ( 1 << 10 );
export const PE_ORIGIN2 = ( 1 << 11 );
export const PE_ORIGIN3 = ( 1 << 12 );
export const PE_ANGLE2 = ( 1 << 13 );
export const PE_REMOVE = ( 1 << 14 ); // REMOVE this entity, don't add it
export const PE_MOREBITS = ( 1 << 15 );

// If PE_MOREBITS is set, these additional flags are read in the next byte:
export const PE_FRAME = ( 1 << 0 );
export const PE_ANGLE1 = ( 1 << 1 );
export const PE_ANGLE3 = ( 1 << 2 );
export const PE_MODEL = ( 1 << 3 );
export const PE_COLORMAP = ( 1 << 4 );
export const PE_SKIN = ( 1 << 5 );
export const PE_EFFECTS = ( 1 << 6 );
// QuakeWorld's PE_SOLID bit is never emitted by this port's server (its packet states carry flags 0), so the unified
// protocol uses the bit for a second more-bits byte: Hexen II's optional entity fields, absent for every default
// Quake entity, so a Quake packet is byte for byte unchanged.
export const PE_MOREBITS2 = ( 1 << 7 );
// QuakeWorld's name for this bit; kept so code that names the QW layout still compiles, but this port never emits it.
export const PE_SOLID = PE_MOREBITS2;

// If PE_MOREBITS2 is set, these flags are read in the byte after the first more-bits byte:
export const PE2_SCALE = ( 1 << 0 ); // [byte] uhexen2's scale*100 (100 is 1.0)
export const PE2_DRAWFLAGS = ( 1 << 1 ); // [byte] uhexen2's drawflags
export const PE2_ABSLIGHT = ( 1 << 2 ); // [byte] uhexen2's abslight*255

// Hexen II's fixed signon baseline layout (uhexen2 CL_ParseBaseline): after model (short), frame, colormap and skin
// bytes come scale, drawflags and abslight bytes, then origin/angle pairs. The feature message says the session uses
// it; a Quake session keeps the WinQuake layout above and never sees these bytes.
export const BASELINE_SCALE_DEFAULT = 100; // uhexen2 sends (int)(scale*100); 0 and 100 both draw at 1.0
export const BASELINE_DRAWFLAGS_DEFAULT = 0;
export const BASELINE_ABSLIGHT_DEFAULT = 0;

// Packet entities constants
export const MAX_PACKET_ENTITIES = 64; // max entities in a single packet sent over the network (QuakeWorld's limit)
// A local game (the in-memory loopback link) has no packet size limit to respect: its packets carry up to this many entities,
// so a full-game level with many things in view does not drop the highest-numbered ones (lifts, buttons and monsters that
// flickered in and out of the picture as the player moved while still working physically). The arrays are sized for it.
export const MAX_PACKET_ENTITIES_LOCAL = 512;
export const PE_UPDATE_BACKUP = 64; // must be power of 2
export const PE_UPDATE_MASK = PE_UPDATE_BACKUP - 1;
