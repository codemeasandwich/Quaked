/**
 * @module engine/progs/pr_comp
 *
 * QuakeC compiler definitions (WinQuake pr_comp.h): value types, opcodes and global offsets.
 *
 * Types: exported classes `dstatement_t`, `ddef_t`, `dfunction_t`, `dprograms_t`.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Ported from: WinQuake/pr_comp.h -- defs shared with qcc

// type definitions (C: typedef int func_t; typedef int string_t;)
// In JS these are just number values used as indices

// etype_t
export const ev_void = 0;
export const ev_string = 1;
export const ev_float = 2;
export const ev_vector = 3;
export const ev_entity = 4;
export const ev_field = 5;
export const ev_function = 6;
export const ev_pointer = 7;

// global offsets for parameter passing
export const OFS_NULL = 0;
export const OFS_RETURN = 1;
export const OFS_PARM0 = 4; // leave 3 ofs for each parm to hold vectors
export const OFS_PARM1 = 7;
export const OFS_PARM2 = 10;
export const OFS_PARM3 = 13;
export const OFS_PARM4 = 16;
export const OFS_PARM5 = 19;
export const OFS_PARM6 = 22;
export const OFS_PARM7 = 25;
export const RESERVED_OFS = 28;

// opcodes
export const OP_DONE = 0;
export const OP_MUL_F = 1;
export const OP_MUL_V = 2;
export const OP_MUL_FV = 3;
export const OP_MUL_VF = 4;
export const OP_DIV_F = 5;
export const OP_ADD_F = 6;
export const OP_ADD_V = 7;
export const OP_SUB_F = 8;
export const OP_SUB_V = 9;

export const OP_EQ_F = 10;
export const OP_EQ_V = 11;
export const OP_EQ_S = 12;
export const OP_EQ_E = 13;
export const OP_EQ_FNC = 14;

export const OP_NE_F = 15;
export const OP_NE_V = 16;
export const OP_NE_S = 17;
export const OP_NE_E = 18;
export const OP_NE_FNC = 19;

export const OP_LE = 20;
export const OP_GE = 21;
export const OP_LT = 22;
export const OP_GT = 23;

export const OP_LOAD_F = 24;
export const OP_LOAD_V = 25;
export const OP_LOAD_S = 26;
export const OP_LOAD_ENT = 27;
export const OP_LOAD_FLD = 28;
export const OP_LOAD_FNC = 29;

export const OP_ADDRESS = 30;

export const OP_STORE_F = 31;
export const OP_STORE_V = 32;
export const OP_STORE_S = 33;
export const OP_STORE_ENT = 34;
export const OP_STORE_FLD = 35;
export const OP_STORE_FNC = 36;

export const OP_STOREP_F = 37;
export const OP_STOREP_V = 38;
export const OP_STOREP_S = 39;
export const OP_STOREP_ENT = 40;
export const OP_STOREP_FLD = 41;
export const OP_STOREP_FNC = 42;

export const OP_RETURN = 43;
export const OP_NOT_F = 44;
export const OP_NOT_V = 45;
export const OP_NOT_S = 46;
export const OP_NOT_ENT = 47;
export const OP_NOT_FNC = 48;
export const OP_IF = 49;
export const OP_IFNOT = 50;
export const OP_CALL0 = 51;
export const OP_CALL1 = 52;
export const OP_CALL2 = 53;
export const OP_CALL3 = 54;
export const OP_CALL4 = 55;
export const OP_CALL5 = 56;
export const OP_CALL6 = 57;
export const OP_CALL7 = 58;
export const OP_CALL8 = 59;
export const OP_STATE = 60;
export const OP_GOTO = 61;
export const OP_AND = 62;
export const OP_OR = 63;

export const OP_BITAND = 64;
export const OP_BITOR = 65;

// Hexen II's extended opcodes continue the same numbering (common/pr_comp.h, Raven Software). Their operands are
// unsigned word offsets; only a branch displacement is signed (see pr_exec.js).
export const OP_MULSTORE_F = 66;
export const OP_MULSTORE_V = 67;
export const OP_MULSTOREP_F = 68;
export const OP_MULSTOREP_V = 69;
export const OP_DIVSTORE_F = 70;
export const OP_DIVSTOREP_F = 71;
export const OP_ADDSTORE_F = 72;
export const OP_ADDSTORE_V = 73;
export const OP_ADDSTOREP_F = 74;
export const OP_ADDSTOREP_V = 75;
export const OP_SUBSTORE_F = 76;
export const OP_SUBSTORE_V = 77;
export const OP_SUBSTOREP_F = 78;
export const OP_SUBSTOREP_V = 79;
export const OP_FETCH_GBL_F = 80;
export const OP_FETCH_GBL_V = 81;
export const OP_FETCH_GBL_S = 82;
export const OP_FETCH_GBL_E = 83;
export const OP_FETCH_GBL_FNC = 84;
export const OP_CSTATE = 85;
export const OP_CWSTATE = 86;
export const OP_THINKTIME = 87;
export const OP_BITSET = 88;
export const OP_BITSETP = 89;
export const OP_BITCLR = 90;
export const OP_BITCLRP = 91;
export const OP_RAND0 = 92;
export const OP_RAND1 = 93;
export const OP_RAND2 = 94;
export const OP_RANDV0 = 95;
export const OP_RANDV1 = 96;
export const OP_RANDV2 = 97;
export const OP_SWITCH_F = 98;
export const OP_SWITCH_V = 99;
export const OP_SWITCH_S = 100;
export const OP_SWITCH_E = 101;
export const OP_SWITCH_FNC = 102;
export const OP_CASE = 103;
export const OP_CASERANGE = 104;

// dstatement_t - bytecode statement
export class dstatement_t {

	/**
	 * Creates a zeroed bytecode statement (WinQuake pr_comp.h). `PR_LoadProgs` (pr_edict.js) fills one per 8-byte
	 * record of progs.dat: `op` is an `OP_*` opcode (uint16) and `a`, `b`, `c` are uint16 operands, normally offsets
	 * into the globals array (word units) or, for jumps, relative statement counts read as signed 16-bit values at the
	 * branch site (Hexen II's operands are unsigned except branches). The statements live until the next progs load.
	 */
	constructor() {

		this.op = 0; // unsigned short
		this.a = 0; // short
		this.b = 0; // short
		this.c = 0; // short

	}

}

// DEF_SAVEGLOBAL flag
export const DEF_SAVEGLOBAL = ( 1 << 15 );

// ddef_t - definition of a global or field
export class ddef_t {

	/**
	 * Creates a zeroed definition of a global or field (WinQuake pr_comp.h). `PR_LoadProgs` fills one per 8-byte record
	 * of the globaldefs and fielddefs tables: `type` is an `ev_*` etype (uint16; if the `DEF_SAVEGLOBAL` bit is set the
	 * global needs saving in savegames, and a field def with that bit is a fatal error), `ofs` is the offset in globals
	 * or entity fields (32-bit word units) and `s_name` is an offset into pr_strings.
	 */
	constructor() {

		this.type = 0; // unsigned short - if DEF_SAVEGLOBAL bit is set, needs saving
		this.ofs = 0; // unsigned short
		this.s_name = 0; // int - offset into pr_strings

	}

}

export const MAX_PARMS = 8;

// dfunction_t - QuakeC function definition
export class dfunction_t {

	/**
	 * Creates a zeroed QuakeC function definition (WinQuake pr_comp.h). `PR_LoadProgs` fills one per 36-byte record:
	 * `first_statement` (negative numbers are builtins), `parm_start` (first global word of its parms/locals), `locals`
	 * (total ints of parms + locals), `profile` (runtime profiling counter), `s_name`/`s_file` (offsets into pr_strings
	 * for its name and source file), `numparms`, and `parm_size`, one byte per parameter giving its size in words (3
	 * for a vector) for up to `MAX_PARMS` (8) parameters.
	 */
	constructor() {

		this.first_statement = 0; // int - negative numbers are builtins
		this.parm_start = 0; // int
		this.locals = 0; // int - total ints of parms + locals

		this.profile = 0; // int - runtime profiling

		this.s_name = 0; // int - offset into pr_strings
		this.s_file = 0; // int - source file defined in

		this.numparms = 0; // int
		this.parm_size = new Uint8Array( MAX_PARMS ); // byte[8]

	}

}

export const PROG_VERSION = 6;

// dprograms_t - progs.dat file header
export class dprograms_t {

	/**
	 * Creates a zeroed progs.dat file header (WinQuake pr_comp.h). `PR_LoadProgs` reads the 15 little-endian int32
	 * fields from byte 0 of progs.dat: `version` (must equal `PROG_VERSION`, 6), `crc` (check of header file, must
	 * match `PROGHEADER_CRC`), then a byte offset and count for each of statements (statement 0 is an error), global
	 * defs, field defs, functions (function 0 is an empty), strings (bytes; first string is a null string) and globals
	 * (32-bit words), and `entityfields`, the size of an entity's fields in words. Kept as the loaded program's header
	 * via `PR_SetProgs` until the next progs load.
	 */
	constructor() {

		this.version = 0;
		this.crc = 0; // check of header file

		this.ofs_statements = 0;
		this.numstatements = 0; // statement 0 is an error

		this.ofs_globaldefs = 0;
		this.numglobaldefs = 0;

		this.ofs_fielddefs = 0;
		this.numfielddefs = 0;

		this.ofs_functions = 0;
		this.numfunctions = 0; // function 0 is an empty

		this.ofs_strings = 0;
		this.numstrings = 0; // first string is a null string

		this.ofs_globals = 0;
		this.numglobals = 0;

		this.entityfields = 0;

	}

}
