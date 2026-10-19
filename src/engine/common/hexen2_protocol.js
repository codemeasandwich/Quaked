/**
 * @module engine/common/hexen2_protocol
 *
 * Hexen II's protocol families, message identifiers and the private Quaked-Hexen session envelope (plan section 5).
 * Transcribed from the pinned uhexen2 `engine/hexen2/protocol.h` @ 475c048b1c8b0806b8585f5cd2715f3ad60bf393
 * (Raven Software, GPL v2; notices retained there) and from this port's own Quake ids (protocol.js).
 *
 * The point of the module is that a message number alone cannot be decoded: Hexen's service ids 42, 47, 48 and 49 are
 * Quake's `svc_playerinfo`, `svc_packetentities`, `svc_deltapacketentities` and `svc_serversequence` here, and Hexen's
 * client command 5 (`clc_inv_select`) is this port's `clc_delta`. The protocol family is therefore selected first, and
 * the private live session (1019, `quaked-hexen2-v1`) carries a separately length-bounded extension envelope at
 * service opcode 63. Native demos 18 (1.11) and 19 (1.12) stay replay-only; Raven 15/17, UQE 20 and any other number
 * are refused with their own reason rather than decoded as the wrong family.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: returns `{ ok: false, reason }` for an unsupported protocol or envelope; never throws for wire input.
 */

/** Raven's published protocol numbers and UQE's unofficial 20. */
export const HEXEN2_PROTOCOLS = Object.freeze( {
	raven103: 15, // cd 1.03, outside the supported contract
	raven109: 17, // official 1.09, outside the supported contract
	raven111: 18, // official 1.11 (base)
	raven112: 19, // 1.12 (Portal of Praevus)
	uqe113: 20 // Korax UQE 1.13, never interoperable
} );

/** The native demo protocols this port replays; live play uses the private number below. */
export const HEXEN2_DEMO_PROTOCOLS = Object.freeze( [ HEXEN2_PROTOCOLS.raven111, HEXEN2_PROTOCOLS.raven112 ] );

/** The private Quaked-Hexen live session, versioned so it can never be mistaken for a Raven protocol. */
export const HEXEN2_LIVE_PROTOCOL = 1019;
export const HEXEN2_LIVE_VERSION = 'quaked-hexen2-v1';

/** The Quaked extension envelope inside a private Hexen stream: service opcode 63 and its own byte bound. */
export const HEXEN2_EXTENSION_OPCODE = 63;
export const HEXEN2_EXTENSION_MAX_BYTES = 4096;

/** The pinned network and content limits (uhexen2 engine/hexen2/quakedef.h and protocol.h). */
export const HEXEN2_NET_LIMITS = Object.freeze( {
	maxMessageBytes: 20000, // MAX_MSGLEN ("for mission pack tibet2")
	maxDatagramBytes: 1024, // MAX_DATAGRAM
	maxClients: 16, // MAX_CLIENTS
	maxEdicts: 600, // MAX_EDICTS
	maxModels: 512, // MAX_MODELS, sent as a word
	soundsByProtocol: Object.freeze( { 18: 256, 19: 512 } ), // MAX_SOUNDS_OLD byte-wide; MP word-wide for ambients
	maxClientStats: 32, // MAX_CL_STATS
	maxPrintMessage: 4096 // MAX_PRINTMSG
} );

/**
 * The sound index width a native demo protocol carries.
 *
 * @param {number} protocol 18 or 19
 * @returns {?number} 256 for 1.11, 512 for 1.12, or null
 */
export function Hexen2_SoundIndexLimit( protocol ) { return Object.hasOwn( HEXEN2_NET_LIMITS.soundsByProtocol, protocol ) ? HEXEN2_NET_LIMITS.soundsByProtocol[ protocol ] : null; }

/**
 * The client stat/update bit masks (`SC1_*` / `SC2_*` in the pinned protocol.h). Every stat-bar field is included; the
 * masks are the native wire contract, not a UI preference.
 */
export const HEXEN2_STAT_BITS = Object.freeze( {
	sc1_health: 1 << 0, sc1_level: 1 << 1, sc1_intelligence: 1 << 2, sc1_wisdom: 1 << 3, sc1_strength: 1 << 4,
	sc1_dexterity: 1 << 5, sc1_weapon: 1 << 6, sc1_bluemana: 1 << 7, sc1_greenmana: 1 << 8, sc1_experience: 1 << 9,
	sc1_cnt_torch: 1 << 10, sc1_cnt_h_boost: 1 << 11, sc1_cnt_sh_boost: 1 << 12, sc1_cnt_mana_boost: 1 << 13,
	sc1_cnt_teleport: 1 << 14, sc1_cnt_tome: 1 << 15, sc1_cnt_summon: 1 << 16, sc1_cnt_invisibility: 1 << 17,
	sc1_cnt_glyph: 1 << 18, sc1_cnt_haste: 1 << 19, sc1_cnt_blast: 1 << 20, sc1_cnt_polymorph: 1 << 21,
	sc1_cnt_flight: 1 << 22, sc1_cnt_cubeofforce: 1 << 23, sc1_cnt_invincibility: 1 << 24,
	sc1_artifact_active: 1 << 25, sc1_artifact_low: 1 << 26, sc1_movetype: 1 << 27, sc1_cameramode: 1 << 28,
	sc1_hasted: 1 << 29, sc1_inventory: 1 << 30, sc1_rings_active: 1 << 31,
	sc2_rings_low: 1 << 0, sc2_amulet: 1 << 1, sc2_bracer: 1 << 2, sc2_breastplate: 1 << 3, sc2_helmet: 1 << 4,
	sc2_flight_t: 1 << 5, sc2_water_t: 1 << 6, sc2_turning_t: 1 << 7, sc2_regen_t: 1 << 8, sc2_haste_t: 1 << 9,
	sc2_tome_t: 1 << 10, sc2_puzzle1: 1 << 11, sc2_puzzle2: 1 << 12, sc2_puzzle3: 1 << 13, sc2_puzzle4: 1 << 14,
	sc2_puzzle5: 1 << 15, sc2_puzzle6: 1 << 16, sc2_puzzle7: 1 << 17, sc2_puzzle8: 1 << 18,
	sc2_maxhealth: 1 << 19, sc2_maxmana: 1 << 20, sc2_flags: 1 << 21, sc2_obj: 1 << 22, sc2_obj2: 1 << 23
} );

/** The pinned masks that select the stat-bar and inventory fields. */
export const HEXEN2_STAT_MASKS = Object.freeze( { sc1StatBar: 0x01ffffff, sc2StatBar: 0x0000001e, sc1Inventory: 0x01fffc00, sc2Inventory: 0 } );

/** Entity-update and sound-packet flags (protocol.h): the high bit of a server command is a fast update. */
export const HEXEN2_WIRE_FLAGS = Object.freeze( {
	u_morebits: 1 << 0, u_origin1: 1 << 1, u_origin2: 1 << 2, u_origin3: 1 << 3, u_angle2: 1 << 4, u_nolerp: 1 << 5,
	u_frame: 1 << 6, u_signal: 1 << 7, u_angle1: 1 << 8, u_angle3: 1 << 9, u_model: 1 << 10, u_clear_ent: 1 << 11,
	u_ent_off: 1 << 13, u_longentity: 1 << 14, u_morebits2: 1 << 15, u_skin: 1 << 16, u_effects: 1 << 17,
	u_scale: 1 << 18, u_colormap: 1 << 19,
	snd_volume: 1 << 0, snd_attenuation: 1 << 1, snd_overflow: 1 << 2, snd_overflow2: 1 << 3
} );

/** Hexen II server-to-client service ids (`svc_*`), as the pinned header numbers them. */
export const HEXEN2_SERVER_MESSAGES = Object.freeze( {
	bad: 0, nop: 1, disconnect: 2, updatestat: 3, version: 4, setview: 5, sound: 6, time: 7, print: 8, stufftext: 9,
	setangle: 10, serverinfo: 11, lightstyle: 12, updatename: 13, updatefrags: 14, clientdata: 15, stopsound: 16,
	updatecolors: 17, particle: 18, damage: 19, spawnstatic: 20, raineffect: 21, spawnbaseline: 22, temp_entity: 23,
	setpause: 24, signonnum: 25, centerprint: 26, killedmonster: 27, foundsecret: 28, spawnstaticsound: 29,
	intermission: 30, finale: 31, cdtrack: 32, sellscreen: 33, particle2: 34, cutscene: 35, midi_name: 36,
	updateclass: 37, particle3: 38, particle4: 39, set_view_flags: 40, clear_view_flags: 41, start_effect: 42,
	end_effect: 43, plaque: 44, particle_explosion: 45, set_view_tint: 46, reference: 47, clear_edicts: 48,
	update_inv: 49, setangle_interpolate: 50, update_kingofhill: 51, toggle_statbar: 52, sound_update_pos: 53,
	mod_name: 54, skybox: 55
} );

/** Hexen II client-to-server commands (`clc_*`). */
export const HEXEN2_CLIENT_COMMANDS = Object.freeze( {
	bad: 0, nop: 1, disconnect: 2, move: 3, stringcmd: 4, inv_select: 5, frame: 6
} );

// This port's Quake ids that a Hexen stream would collide with (protocol.js owns the authoritative Quake tables).
const QUAKE_SERVER_COLLISIONS = Object.freeze( { 42: 'svc_playerinfo', 47: 'svc_packetentities', 48: 'svc_deltapacketentities', 49: 'svc_serversequence' } );
const QUAKE_CLIENT_COLLISIONS = Object.freeze( { 5: 'clc_delta' } );

const SERVER_BY_ID = new Map( Object.entries( HEXEN2_SERVER_MESSAGES ).map( ( [ name, id ] ) => [ id, name ] ) );
const CLIENT_BY_ID = new Map( Object.entries( HEXEN2_CLIENT_COMMANDS ).map( ( [ name, id ] ) => [ id, name ] ) );

/**
 * A Hexen server message's id.
 *
 * @param {string} name the `svc_*` name without its prefix
 * @returns {?number} the id, or null
 */
export function Hexen2_ServerMessageId( name ) { return Object.hasOwn( HEXEN2_SERVER_MESSAGES, name ) ? HEXEN2_SERVER_MESSAGES[ name ] : null; }

/**
 * A Hexen server message's name from its id.
 *
 * @param {number} id the service id
 * @returns {?string} the name, or null
 */
export function Hexen2_ServerMessageName( id ) { return SERVER_BY_ID.get( id ) ?? null; }

/**
 * A Hexen client command's id.
 *
 * @param {string} name the `clc_*` name without its prefix
 * @returns {?number} the id, or null
 */
export function Hexen2_ClientCommandId( name ) { return Object.hasOwn( HEXEN2_CLIENT_COMMANDS, name ) ? HEXEN2_CLIENT_COMMANDS[ name ] : null; }

/**
 * What one message number means in each family, for the collision-sensitive ids.
 *
 * @param {'server'|'client'} kind server-to-client or client-to-server
 * @param {number} id the message number
 * @returns {{ quake: ?string, hexen2: ?string, collides: boolean }} both meanings and whether they differ
 */
export function Hexen2_MessageMeaning( kind, id ) {

	const quake = ( kind === 'client' ? QUAKE_CLIENT_COLLISIONS : QUAKE_SERVER_COLLISIONS )[ id ] ?? null;
	const hexen2 = ( kind === 'client' ? CLIENT_BY_ID : SERVER_BY_ID ).get( id ) ?? null;
	return { quake, hexen2, collides: quake !== null && hexen2 !== null };

}

/**
 * Selects the codec family before any body is decoded. A Hexen family accepts only the replay-only natives 18/19 and
 * the private 1019; Quake keeps its own 15/1015. Numbers outside the family are refused with a reason naming them.
 *
 * @param {{ gameFamily: string, protocol: number }} session the selected game family and protocol number
 * @returns {{ ok: true, codec: string, demo: boolean, private: boolean } | { ok: false, reason: string }} the codec
 */
export function Hexen2_SelectCodec( session ) {

	const family = session?.gameFamily, protocol = session?.protocol;
	if ( family === 'quake' ) {

		if ( protocol === 15 ) return { ok: true, codec: 'quake-native', demo: false, private: false };
		if ( protocol === 1015 ) return { ok: true, codec: 'quake-large', demo: false, private: false };
		return { ok: false, reason: `protocol ${String( protocol )} is not a supported Quake family protocol` };

	}
	if ( family !== 'hexen2' ) return { ok: false, reason: `unknown game family: ${String( family )}` };
	if ( protocol === HEXEN2_PROTOCOLS.raven111 || protocol === HEXEN2_PROTOCOLS.raven112 )
		return { ok: true, codec: 'hexen2-native', demo: true, private: false };
	if ( protocol === HEXEN2_LIVE_PROTOCOL ) return { ok: true, codec: HEXEN2_LIVE_VERSION, demo: false, private: true };
	if ( protocol === HEXEN2_PROTOCOLS.raven103 ) return { ok: false, reason: 'Raven protocol 15 (Hexen II 1.03) is outside the supported 1.11/1.12 contract' };
	if ( protocol === HEXEN2_PROTOCOLS.raven109 ) return { ok: false, reason: 'Raven protocol 17 (Hexen II 1.09) is outside the supported 1.11/1.12 contract' };
	if ( protocol === HEXEN2_PROTOCOLS.uqe113 ) return { ok: false, reason: 'UQE protocol 20 is not interoperable and is refused' };
	return { ok: false, reason: `unknown Hexen II protocol ${String( protocol )}` };

}

/**
 * Validates the private extension envelope: service opcode 63 carrying a bounded body.
 *
 * @param {{ opcode: number, bytes: number }} envelope the service opcode and body length
 * @returns {{ ok: true } | { ok: false, reason: string }} whether the envelope may be decoded
 */
export function Hexen2_ValidateExtension( envelope ) {

	if ( envelope?.opcode !== HEXEN2_EXTENSION_OPCODE ) return { ok: false, reason: `the Quaked extension uses service opcode ${HEXEN2_EXTENSION_OPCODE}, not ${String( envelope?.opcode )}` };
	if ( ! Number.isInteger( envelope.bytes ) || envelope.bytes < 0 || envelope.bytes > HEXEN2_EXTENSION_MAX_BYTES )
		return { ok: false, reason: `the extension body must be 0 to ${HEXEN2_EXTENSION_MAX_BYTES} bytes, not ${String( envelope.bytes )}` };
	return { ok: true };

}
