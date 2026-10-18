/**
 * @module engine/progs/hexen2_progdefs
 *
 * Hexen II's proven program layouts: the header CRCs and the global and entity-field structures of the supported
 * retail programs, transcribed from the pinned independent source `uhexen2` @ 475c048b1c8b0806b8585f5cd2715f3ad60bf393,
 * `engine/hexen2/progdefs.h` (Raven Software, GPL v2; copyright notices retained there). A program is accepted only
 * when its header CRC names a supported layout *and* every required definition is present with the pinned type and
 * offset (plan section 4): the CRC alone, or accepting any CRC, never establishes compatibility.
 *
 * The layouts: v1.11 base (`globalvars_v111_t`, CRC 38488) and Portal of Praevus v1.12 (`globalvars_v112_t`, CRC
 * 26905), which inserts `cl_playerclass` after `teamplay` and omits the four `modelindex_*` globals. Both share the
 * 166-slot `entvars_t` entity structure. v1.03 (CRC 14046) is obsolete data outside the support contract and is
 * recognised only to be refused with that reason.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised: validation returns `{ ok: false, reason }`.
 */

import { ev_string, ev_float, ev_vector, ev_entity, ev_function } from './pr_comp.js';

/** The header CRCs of the layouts this module knows, from the pinned progdefs.h. */
export const HEXEN2_PROG_CRCS = Object.freeze( { v103: 14046, v111: 38488, v112: 26905 } );

/** `dprograms_t.entityfields` of both supported programs: the entvars_t slots plus the game's own fields. */
export const HEXEN2_ENTITY_FIELDS = 392;

/** The first named global's offset (`pad[28]` precedes it in the native globalvars_t). */
export const HEXEN2_GLOBAL_BASE = 28;

const TYPE = Object.freeze( { f: ev_float, v: ev_vector, s: ev_string, e: ev_entity, F: ev_function } );

// One ordered field list -> [name, type, offset, slots], offsets running from `base` (the C struct's own order).
function layout( entries, base = 0 ) {

	let offset = base;
	return Object.freeze( entries.map( ( [ name, code ] ) => {

		const slots = code === 'v' ? 3 : 1, entry = Object.freeze( [ name, TYPE[ code ], offset, slots ] );
		offset += slots;
		return entry;

	} ) );

}

// The shared entvars_t order, exactly as the pinned header declares it (166 slots: string_index ends at 165).
export const HEXEN2_ENTVARS = layout( [
	[ 'modelindex', 'f' ], [ 'absmin', 'v' ], [ 'absmax', 'v' ], [ 'ltime', 'f' ], [ 'movetype', 'f' ], [ 'solid', 'f' ],
	[ 'origin', 'v' ], [ 'oldorigin', 'v' ], [ 'velocity', 'v' ], [ 'angles', 'v' ], [ 'avelocity', 'v' ], [ 'punchangle', 'v' ],
	[ 'classname', 's' ], [ 'model', 's' ], [ 'frame', 'f' ], [ 'skin', 'f' ], [ 'effects', 'f' ], [ 'scale', 'f' ],
	[ 'drawflags', 'f' ], [ 'abslight', 'f' ], [ 'mins', 'v' ], [ 'maxs', 'v' ], [ 'size', 'v' ], [ 'hull', 'f' ],
	[ 'touch', 'F' ], [ 'use', 'F' ], [ 'think', 'F' ], [ 'blocked', 'F' ], [ 'nextthink', 'f' ], [ 'groundentity', 'e' ],
	[ 'stats_restored', 'f' ], [ 'frags', 'f' ], [ 'weapon', 'f' ], [ 'weaponmodel', 's' ], [ 'weaponframe', 'f' ],
	[ 'health', 'f' ], [ 'max_health', 'f' ], [ 'playerclass', 'f' ], [ 'bluemana', 'f' ], [ 'greenmana', 'f' ], [ 'max_mana', 'f' ],
	[ 'armor_amulet', 'f' ], [ 'armor_bracer', 'f' ], [ 'armor_breastplate', 'f' ], [ 'armor_helmet', 'f' ], [ 'level', 'f' ],
	[ 'intelligence', 'f' ], [ 'wisdom', 'f' ], [ 'dexterity', 'f' ], [ 'strength', 'f' ], [ 'experience', 'f' ],
	[ 'ring_flight', 'f' ], [ 'ring_water', 'f' ], [ 'ring_turning', 'f' ], [ 'ring_regeneration', 'f' ],
	[ 'haste_time', 'f' ], [ 'tome_time', 'f' ],
	[ 'puzzle_inv1', 's' ], [ 'puzzle_inv2', 's' ], [ 'puzzle_inv3', 's' ], [ 'puzzle_inv4', 's' ],
	[ 'puzzle_inv5', 's' ], [ 'puzzle_inv6', 's' ], [ 'puzzle_inv7', 's' ], [ 'puzzle_inv8', 's' ],
	[ 'experience_value', 'f' ], [ 'items', 'f' ], [ 'takedamage', 'f' ], [ 'chain', 'e' ], [ 'deadflag', 'f' ],
	[ 'view_ofs', 'v' ], [ 'button0', 'f' ], [ 'button1', 'f' ], [ 'button2', 'f' ], [ 'impulse', 'f' ], [ 'fixangle', 'f' ],
	[ 'v_angle', 'v' ], [ 'idealpitch', 'f' ], [ 'idealroll', 'f' ], [ 'hoverz', 'f' ], [ 'netname', 's' ], [ 'enemy', 'e' ],
	[ 'flags', 'f' ], [ 'flags2', 'f' ], [ 'artifact_flags', 'f' ], [ 'colormap', 'f' ], [ 'team', 'f' ], [ 'light_level', 'f' ],
	[ 'teleport_time', 'f' ], [ 'armortype', 'f' ], [ 'armorvalue', 'f' ], [ 'waterlevel', 'f' ], [ 'watertype', 'f' ],
	[ 'friction', 'f' ], [ 'ideal_yaw', 'f' ], [ 'yaw_speed', 'f' ], [ 'goalentity', 'e' ], [ 'spawnflags', 'f' ],
	[ 'target', 's' ], [ 'targetname', 's' ], [ 'dmg_take', 'f' ], [ 'dmg_save', 'f' ], [ 'dmg_inflictor', 'e' ], [ 'owner', 'e' ],
	[ 'movedir', 'v' ], [ 'message', 'f' ], [ 'soundtype', 'f' ], [ 'noise', 's' ], [ 'noise1', 's' ], [ 'noise2', 's' ], [ 'noise3', 's' ],
	[ 'rings', 'f' ], [ 'rings_active', 'f' ], [ 'rings_low', 'f' ], [ 'artifacts', 'f' ], [ 'artifact_active', 'f' ], [ 'artifact_low', 'f' ],
	[ 'hasted', 'f' ], [ 'inventory', 'f' ], [ 'cnt_torch', 'f' ], [ 'cnt_h_boost', 'f' ], [ 'cnt_sh_boost', 'f' ],
	[ 'cnt_mana_boost', 'f' ], [ 'cnt_teleport', 'f' ], [ 'cnt_tome', 'f' ], [ 'cnt_summon', 'f' ], [ 'cnt_invisibility', 'f' ],
	[ 'cnt_glyph', 'f' ], [ 'cnt_haste', 'f' ], [ 'cnt_blast', 'f' ], [ 'cnt_polymorph', 'f' ], [ 'cnt_flight', 'f' ],
	[ 'cnt_cubeofforce', 'f' ], [ 'cnt_invincibility', 'f' ], [ 'cameramode', 'e' ], [ 'movechain', 'e' ],
	[ 'chainmoved', 'F' ], [ 'string_index', 'f' ]
] );

// The 1.11 base global order from globalvars_v111_t.
export const HEXEN2_GLOBALS_V111 = layout( [
	[ 'self', 'e' ], [ 'other', 'e' ], [ 'world', 'e' ], [ 'time', 'f' ], [ 'frametime', 'f' ], [ 'force_retouch', 'f' ],
	[ 'mapname', 's' ], [ 'startspot', 's' ], [ 'deathmatch', 'f' ], [ 'randomclass', 'f' ], [ 'coop', 'f' ], [ 'teamplay', 'f' ],
	[ 'serverflags', 'f' ], [ 'total_secrets', 'f' ], [ 'total_monsters', 'f' ], [ 'found_secrets', 'f' ], [ 'killed_monsters', 'f' ],
	[ 'chunk_cnt', 'f' ], [ 'done_precache', 'f' ],
	[ 'parm1', 'f' ], [ 'parm2', 'f' ], [ 'parm4', 'f' ], [ 'parm5', 'f' ], [ 'parm6', 'f' ], [ 'parm7', 'f' ], [ 'parm8', 'f' ],
	[ 'parm9', 'f' ], [ 'parm10', 'f' ], [ 'parm11', 'f' ], [ 'parm12', 'f' ], [ 'parm13', 'f' ], [ 'parm14', 'f' ],
	[ 'parm15', 'f' ], [ 'parm16', 'f' ], [ 'parm3', 's' ],
	[ 'v_forward', 'v' ], [ 'v_up', 'v' ], [ 'v_right', 'v' ],
	[ 'trace_allsolid', 'f' ], [ 'trace_startsolid', 'f' ], [ 'trace_fraction', 'f' ], [ 'trace_endpos', 'v' ],
	[ 'trace_plane_normal', 'v' ], [ 'trace_plane_dist', 'f' ], [ 'trace_ent', 'e' ], [ 'trace_inopen', 'f' ],
	[ 'trace_inwater', 'f' ], [ 'msg_entity', 'e' ], [ 'cycle_wrapped', 'f' ], [ 'crouch_cnt', 'f' ],
	[ 'modelindex_assassin', 'f' ], [ 'modelindex_crusader', 'f' ], [ 'modelindex_paladin', 'f' ], [ 'modelindex_necromancer', 'f' ],
	[ 'modelindex_sheep', 'f' ], [ 'num_players', 'f' ], [ 'exp_mult', 'f' ],
	[ 'main', 'F' ], [ 'StartFrame', 'F' ], [ 'PlayerPreThink', 'F' ], [ 'PlayerPostThink', 'F' ], [ 'ClientKill', 'F' ],
	[ 'ClientConnect', 'F' ], [ 'PutClientInServer', 'F' ], [ 'ClientReEnter', 'F' ], [ 'ClientDisconnect', 'F' ],
	[ 'ClassChangeWeapon', 'F' ]
], HEXEN2_GLOBAL_BASE );

// The 1.12 Portal global order: cl_playerclass after teamplay; the four class modelindex globals are absent.
export const HEXEN2_GLOBALS_V112 = layout( [
	[ 'self', 'e' ], [ 'other', 'e' ], [ 'world', 'e' ], [ 'time', 'f' ], [ 'frametime', 'f' ], [ 'force_retouch', 'f' ],
	[ 'mapname', 's' ], [ 'startspot', 's' ], [ 'deathmatch', 'f' ], [ 'randomclass', 'f' ], [ 'coop', 'f' ], [ 'teamplay', 'f' ],
	[ 'cl_playerclass', 'f' ], [ 'serverflags', 'f' ], [ 'total_secrets', 'f' ], [ 'total_monsters', 'f' ],
	[ 'found_secrets', 'f' ], [ 'killed_monsters', 'f' ], [ 'chunk_cnt', 'f' ], [ 'done_precache', 'f' ],
	[ 'parm1', 'f' ], [ 'parm2', 'f' ], [ 'parm4', 'f' ], [ 'parm5', 'f' ], [ 'parm6', 'f' ], [ 'parm7', 'f' ], [ 'parm8', 'f' ],
	[ 'parm9', 'f' ], [ 'parm10', 'f' ], [ 'parm11', 'f' ], [ 'parm12', 'f' ], [ 'parm13', 'f' ], [ 'parm14', 'f' ],
	[ 'parm15', 'f' ], [ 'parm16', 'f' ], [ 'parm3', 's' ],
	[ 'v_forward', 'v' ], [ 'v_up', 'v' ], [ 'v_right', 'v' ],
	[ 'trace_allsolid', 'f' ], [ 'trace_startsolid', 'f' ], [ 'trace_fraction', 'f' ], [ 'trace_endpos', 'v' ],
	[ 'trace_plane_normal', 'v' ], [ 'trace_plane_dist', 'f' ], [ 'trace_ent', 'e' ], [ 'trace_inopen', 'f' ],
	[ 'trace_inwater', 'f' ], [ 'msg_entity', 'e' ], [ 'cycle_wrapped', 'f' ], [ 'crouch_cnt', 'f' ],
	[ 'modelindex_sheep', 'f' ], [ 'num_players', 'f' ], [ 'exp_mult', 'f' ],
	[ 'main', 'F' ], [ 'StartFrame', 'F' ], [ 'PlayerPreThink', 'F' ], [ 'PlayerPostThink', 'F' ], [ 'ClientKill', 'F' ],
	[ 'ClientConnect', 'F' ], [ 'PutClientInServer', 'F' ], [ 'ClientReEnter', 'F' ], [ 'ClientDisconnect', 'F' ],
	[ 'ClassChangeWeapon', 'F' ]
], HEXEN2_GLOBAL_BASE );

/** The two supported layouts, keyed by their header CRC. */
export const HEXEN2_PROG_LAYOUTS = Object.freeze( {
	[ HEXEN2_PROG_CRCS.v111 ]: Object.freeze( { layout: 'hexen2-base', gameId: 'hexen2', globals: HEXEN2_GLOBALS_V111, entityFields: HEXEN2_ENTITY_FIELDS } ),
	[ HEXEN2_PROG_CRCS.v112 ]: Object.freeze( { layout: 'hexen2-portals', gameId: 'hexen2-portals', globals: HEXEN2_GLOBALS_V112, entityFields: HEXEN2_ENTITY_FIELDS } )
} );

// A name -> { type, ofs } map from a parsed program's definitions (the first definition of a name wins). The
// DEF_SAVEGLOBAL bit (0x8000) is a save-game marker, not part of the value type: the supplied Hexen programs set it
// on some global definitions, so it is masked before the type is compared (plan section 4: save-global records).
function definitionsByName( defs, stringAt ) {

	const byName = new Map();
	for ( const def of defs ) {

		const name = stringAt( def.s_name );
		if ( typeof name !== 'string' ) continue;
		if ( ! byName.has( name ) ) byName.set( name, { type: def.type & 0x7fff, ofs: def.ofs } );

	}
	return byName;

}

/**
 * Validates a program's parsed definitions against a supported layout: every required global and entity field must be
 * present with the pinned type and offset, and `entityfields` must equal the layout's slot count. A missing or shifted
 * definition is a compatibility failure, never a warning.
 *
 * @param {{ crc: number, entityFields: number, globalDefs: Array<object>, fieldDefs: Array<object>,
 *   stringAt: function(number): string }} program the parsed header and definitions
 * @returns {{ ok: true, profile: object } | { ok: false, reason: string }} the validated layout, or the first problem
 */
export function Hexen2_ValidateProgramDefinitions( program ) {

	const { crc, entityFields, globalDefs, fieldDefs, stringAt } = program;
	if ( crc === HEXEN2_PROG_CRCS.v103 ) return { ok: false, reason: 'a Hexen II v1.03 program is outside the supported 1.11/1.12 contract' };
	const layoutEntry = HEXEN2_PROG_LAYOUTS[ crc ];
	if ( ! layoutEntry ) return { ok: false, reason: `unsupported Hexen II layout CRC ${crc}` };
	if ( entityFields !== layoutEntry.entityFields )
		return { ok: false, reason: `entityfields ${entityFields} does not match the ${layoutEntry.layout} layout (${layoutEntry.entityFields})` };

	const globals = definitionsByName( globalDefs, stringAt );
	for ( const [ name, type, ofs ] of layoutEntry.globals ) {

		const found = globals.get( name );
		if ( ! found ) return { ok: false, reason: `required global ${name} is missing` };
		if ( found.type !== type || found.ofs !== ofs )
			return { ok: false, reason: `global ${name} is type ${found.type} offset ${found.ofs}, not type ${type} offset ${ofs}` };

	}

	const fields = definitionsByName( fieldDefs, stringAt );
	for ( const [ name, type, ofs ] of HEXEN2_ENTVARS ) {

		const found = fields.get( name );
		if ( ! found ) return { ok: false, reason: `required entity field ${name} is missing` };
		if ( found.type !== type || found.ofs !== ofs )
			return { ok: false, reason: `entity field ${name} is type ${found.type} offset ${found.ofs}, not type ${type} offset ${ofs}` };

	}

	return { ok: true, profile: layoutEntry };

}

/**
 * An `entvars_t` for a validated Hexen edict: the named fields engine code reads and writes, at the offsets the
 * program proved. Vector fields return the live 3-float view and setters copy, as Quake's entvars_t does; strings,
 * entities and functions read and write int32 slots.
 *
 * @param {{ getFloat: function, setFloat: function, getInt32: function, setInt32: function, getVector: function,
 *   setVector: function }} fields one edict's field accessor
 * @returns {object} the named entity-fields proxy
 */
export function Hexen2_EntvarsProxy( fields ) {

	const proxy = {};
	for ( const [ name, type, ofs ] of HEXEN2_ENTVARS ) {

		if ( type === ev_vector ) Object.defineProperty( proxy, name, {
			enumerable: true,
			get() { return fields.getVector( ofs ); },
			set( value ) { fields.setVector( ofs, value ); }
		} );
		else if ( type === ev_float ) Object.defineProperty( proxy, name, {
			enumerable: true,
			get() { return fields.getFloat( ofs ); },
			set( value ) { fields.setFloat( ofs, value ); }
		} );
		else Object.defineProperty( proxy, name, {
			enumerable: true,
			get() { return fields.getInt32( ofs ); },
			set( value ) { fields.setInt32( ofs, value ); }
		} );

	}
	return proxy;

}

/**
 * A globalvars_t over the loaded globals for a validated layout: the named simulation globals the engine reads and
 * writes, at the offsets the program proved. Floats read as float32, everything else as int32 (as `eval_t` does).
 *
 * @param {{ getFloat: function, setFloat: function, getInt32: function, setInt32: function }} accessor the loaded
 *   globals accessor
 * @param {ReadonlyArray<Array>} globals the validated layout's ordered globals
 * @returns {object} the named globals proxy
 */
export function Hexen2_GlobalsProxy( accessor, globals ) {

	const proxy = {};
	for ( const [ name, type, ofs ] of globals ) {

		Object.defineProperty( proxy, name, {
			enumerable: true,
			get() { return type === ev_float ? accessor.getFloat( ofs ) : accessor.getInt32( ofs ); },
			set( value ) { if ( type === ev_float ) accessor.setFloat( ofs, value ); else accessor.setInt32( ofs, value ); }
		} );

	}
	return proxy;

}
