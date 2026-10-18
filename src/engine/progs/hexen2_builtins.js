/**
 * @module engine/progs/hexen2_builtins
 *
 * Hexen II's builtin function contract: the number, order and native name of every `builtin_t` the supplied gamecode
 * may call, transcribed from the pinned uhexen2 `engine/h2shared/pr_cmds.c` @
 * 475c048b1c8b0806b8585f5cd2715f3ad60bf393 (`pr_builtin[]`, the Hexen II non-HexenWorld table; GPL v2, notices
 * retained there). The table is the reference the interpreter's builtin dispatcher is built against: a number's
 * meaning is fixed by this order, and an unimplemented one is reported by name rather than as a bare number.
 *
 * `fixme` marks a slot the native table itself leaves unimplemented (entry 0 and the tail reserved for the QUAKE2
 * build); the port keeps those unimplemented and refuses them.
 *
 * Types: plain values and functions; no exported classes.
 * State: no mutable exports.
 * Errors: none raised here.
 */

const NAMES = [
	'fixme', // 0: PF_Fixme
	'makevectors', // 1
	'setorigin', // 2
	'setmodel', // 3
	'setsize', // 4
	'lightstylestatic', // 5
	'break', // 6
	'random', // 7
	'sound', // 8
	'normalize', // 9
	'error', // 10
	'objerror', // 11
	'vlen', // 12
	'vectoyaw', // 13
	'spawn', // 14
	'remove', // 15
	'traceline', // 16
	'checkclient', // 17
	'find', // 18
	'precache_sound', // 19
	'precache_model', // 20
	'stuffcmd', // 21
	'findradius', // 22
	'bprint', // 23
	'sprint', // 24
	'dprint', // 25
	'ftos', // 26
	'vtos', // 27
	'coredump', // 28
	'traceon', // 29
	'traceoff', // 30
	'eprint', // 31
	'walkmove', // 32
	'tracearea', // 33
	'droptofloor', // 34
	'lightstyle', // 35
	'rint', // 36
	'floor', // 37
	'ceil', // 38
	'fixme', // 39: PF_Fixme
	'checkbottom', // 40
	'pointcontents', // 41
	'particle2', // 42
	'fabs', // 43
	'aim', // 44
	'cvar', // 45
	'localcmd', // 46
	'nextent', // 47
	'particle', // 48
	'changeyaw', // 49
	'vhlen', // 50
	'vectoangles', // 51
	'writebyte', // 52
	'writechar', // 53
	'writeshort', // 54
	'writelong', // 55
	'writecoord', // 56
	'writeangle', // 57
	'writestring', // 58
	'writeentity', // 59
	'dprintf', // 60
	'cos', // 61
	'sin', // 62
	'advanceframe', // 63
	'dprintv', // 64
	'rewindframe', // 65
	'setclass', // 66
	'movetogoal', // 67
	'precache_file', // 68
	'makestatic', // 69
	'changelevel', // 70
	'lightstylevalue', // 71
	'cvar_set', // 72
	'centerprint', // 73
	'ambientsound', // 74
	'precache_model2', // 75
	'precache_sound2', // 76
	'precache_file', // 77
	'setspawnparms', // 78
	'plaque_draw', // 79
	'rain_go', // 80
	'particleexplosion', // 81
	'movestep', // 82
	'advanceweaponframe', // 83
	'sqrt', // 84
	'particle3', // 85
	'particle4', // 86
	'setpuzzlemodel', // 87
	'starteffect', // 88
	'endeffect', // 89
	'precache_puzzle_model', // 90
	'concatv', // 91
	'getstring', // 92
	'spawntemp', // 93
	'v_factor', // 94
	'v_factorrange', // 95
	'precache_sound3', // 96
	'precache_model3', // 97
	'precache_file', // 98
	'matchangletoslope', // 99
	'updateinfoplaque', // 100
	'precache_sound4', // 101
	'precache_model4', // 102
	'precache_file', // 103
	'dowhiteflash', // 104
	'updatesoundpos', // 105
	'stopsound', // 106
	'fixme', // 107
	'fixme', // 108
	'fixme', // 109
	'fixme', // 110
	'fixme', // 111
	'fixme', // 112
	'fixme' // 113
];

/** The native builtin table, index = builtin number. */
export const HEXEN2_BUILTINS = Object.freeze( NAMES );

/** How many builtins the supplied gamecode may call (`pr_numbuiltins`). */
export const HEXEN2_BUILTIN_COUNT = HEXEN2_BUILTINS.length;

/**
 * A builtin's native name.
 *
 * @param {number} number the builtin number from a negative `first_statement`
 * @returns {?string} the name, or null outside the table
 */
export function Hexen2_BuiltinName( number ) {

	return Number.isInteger( number ) && number >= 0 && number < HEXEN2_BUILTINS.length ? HEXEN2_BUILTINS[ number ] : null;

}
