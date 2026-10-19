// Hexen II's v6 interpreter semantics (plan section 4): unsigned word operands with signed branch displacements,
// CALL1/CALL2+ argument copies, the extended store/fetch/bit/random/switch opcodes, and a bounded refusal of the
// not-yet-implemented builtins. Fixtures are small programs with the pinned v1.11 globals and entvars definitions, so
// PR_LoadProgs accepts them through the same validation the supplied programs pass.
import { HEXEN2_GLOBALS_V111, HEXEN2_ENTVARS, HEXEN2_PROG_CRCS, HEXEN2_ENTITY_FIELDS } from '../src/engine/progs/hexen2_progdefs.js';
import { PR_LastRunError } from '../src/engine/progs/pr_exec.js';
import '../src/engine/progs/hexen2_server_cmds.js';
import { Hexen2_CallBuiltin } from '../src/engine/progs/hexen2_cmds.js';
import {
	OP_DONE, OP_ADD_F, OP_LT, OP_IF, OP_GOTO, OP_CALL0, OP_CALL1, OP_CALL2, OP_MULSTORE_F, OP_ADDSTORE_F, OP_SUBSTORE_F,
	OP_FETCH_GBL_F, OP_BITSET, OP_BITCLR, OP_RAND0, OP_RAND2, OP_SWITCH_F, OP_CASE, OP_CSTATE, OP_CWSTATE, OP_STATE, OP_THINKTIME,
	OFS_RETURN, OFS_PARM0, OFS_PARM1
} from '../src/engine/progs/pr_comp.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const MAX_PARMS = 8;

// Builds a valid v1.11 Hexen program: the pinned globals and entity fields, plus the supplied statements and functions.
// `functions[i] = { first, parmStart, locals, numparms, parmSize, builtin }`; index 0 is the empty function.
function buildProgram( plan ) {

	// The string table: each entry is its bytes plus a NUL, and a definition's s_name is its byte offset (0 is "").
	const chunks = [], stringAt = new Map();
	let stringLen = 0;
	const addString = text => {

		if ( ! stringAt.has( text ) ) { stringAt.set( text, stringLen ); chunks.push( text ); stringLen += text.length + 1; }
		return stringAt.get( text );

	};
	addString( '' );
	for ( const [ name ] of HEXEN2_GLOBALS_V111 ) addString( name );
	for ( const [ name ] of HEXEN2_ENTVARS ) addString( name );
	for ( const name of plan.strings ?? [] ) addString( name );
	const statements = plan.statements, functions = plan.functions, globals = plan.globals ?? 900;
	const stBytes = statements.length * 8, gdBytes = HEXEN2_GLOBALS_V111.length * 8, fdBytes = HEXEN2_ENTVARS.length * 8;
	const fnBytes = functions.length * 36, stringsLen = stringLen;
	const ofsSt = 60, ofsGd = ofsSt + stBytes, ofsFd = ofsGd + gdBytes, ofsFn = ofsFd + fdBytes;
	const ofsStr = ofsFn + fnBytes, ofsGl = ( ofsStr + stringsLen + 3 ) & ~ 3, total = ofsGl + globals * 4;
	const bytes = new Uint8Array( total ), view = new DataView( bytes.buffer );
	const header = [ 6, HEXEN2_PROG_CRCS.v111, ofsSt, statements.length, ofsGd, HEXEN2_GLOBALS_V111.length,
		ofsFd, HEXEN2_ENTVARS.length, ofsFn, functions.length, ofsStr, stringsLen, ofsGl, globals, HEXEN2_ENTITY_FIELDS ];
	header.forEach( ( value, i ) => view.setInt32( i * 4, value, true ) );
	statements.forEach( ( st, i ) => {

		const at = ofsSt + i * 8;
		view.setUint16( at, st.op, true );
		view.setUint16( at + 2, st.a & 0xffff, true );
		view.setUint16( at + 4, st.b & 0xffff, true );
		view.setUint16( at + 6, st.c & 0xffff, true );

	} );
	HEXEN2_GLOBALS_V111.forEach( ( [ name, type, ofs ], i ) => {

		const at = ofsGd + i * 8;
		view.setUint16( at, type, true ); view.setUint16( at + 2, ofs, true ); view.setInt32( at + 4, addString( name ), true );

	} );
	HEXEN2_ENTVARS.forEach( ( [ name, type, ofs ], i ) => {

		const at = ofsFd + i * 8;
		view.setUint16( at, type, true ); view.setUint16( at + 2, ofs, true ); view.setInt32( at + 4, addString( name ), true );

	} );
	functions.forEach( ( fn, i ) => {

		const at = ofsFn + i * 36;
		view.setInt32( at, fn.builtin !== undefined ? - fn.builtin : fn.first, true );
		view.setInt32( at + 4, fn.parmStart ?? 0, true );
		view.setInt32( at + 8, fn.locals ?? 0, true );
		view.setInt32( at + 12, 0, true );
		view.setInt32( at + 16, 0, true );
		view.setInt32( at + 20, 0, true );
		view.setInt32( at + 24, fn.numparms ?? 0, true );
		for ( let p = 0; p < MAX_PARMS; p ++ ) view.setUint8( at + 28 + p, fn.parmSize?.[ p ] ?? 0 );

	} );
	let at = ofsStr;
	for ( const text of chunks ) { for ( let i = 0; i < text.length; i ++ ) view.setUint8( at ++, text.charCodeAt( i ) ); view.setUint8( at ++, 0 ); }
	return { bytes, strings: stringAt };

}

// Loads a fixture and returns helpers over the freshly loaded program.
async function fixture( plan ) {

	const { PR_LoadProgs } = await import( '../src/engine/progs/pr_edict.js' );
	const progs = await import( '../src/engine/progs/progs.js' );
	const { PR_ExecuteProgram, PR_SetRandomSource } = await import( '../src/engine/progs/pr_exec.js' );
	const built = buildProgram( plan ), bytes = built.bytes;
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	same( progs.PR_ProgramProfile(), 'hexen2-base', 'the fixture loads as the supplied base layout' );
	return {
		progs,
		run( fn, returnValue = null ) {

			PR_ExecuteProgram( fn );
			return progs.pr_globals.getFloat( OFS_RETURN );

		},
		setF( slot, value ) { progs.pr_globals.setFloat( slot, value ); },
		getF( slot ) { return progs.pr_globals.getFloat( slot ); },
		setI( slot, value ) { progs.pr_globals.setInt32( slot, value ); },
		getI( slot ) { return progs.pr_globals.getInt32( slot ); },
		fail( fn ) {

			try { PR_ExecuteProgram( fn ); } catch ( error ) {

				error.programStatement = progs.pr_xstatement;
				error.programOp = progs.pr_statements[ progs.pr_xstatement ]?.op;
				return error;

			} return null;

		},
		setRandom( source ) { PR_SetRandomSource( source ); },
		string( name ) { return built.strings.get( name ) ?? null; }

	};

}

const empty = { first: 0, parmStart: 0, locals: 0, numparms: 0 };
const done = ( slot = 0 ) => ( { op: OP_DONE, a: slot, b: 0, c: 0 } );

Deno.test( 'unsigned operands above 32767 are global offsets, while a branch displacement is signed', async () => {

	// A loop counter counted by a backward IF: counter += 1 while counter < 3, then return 7.
	const program = await fixture( {
		functions: [ empty, { first: 0, parmStart: 0, locals: 0, numparms: 0 } ],
		statements: [
			{ op: OP_ADDSTORE_F, a: 601, b: 603, c: 0 },
			{ op: OP_LT, a: 603, b: 605, c: 606 },
			{ op: OP_IF, a: 606, b: - 2, c: 0 },
			done( 600 )
		]
	} );
	program.setF( 601, 1 ); program.setF( 603, 0 ); program.setF( 605, 3 ); program.setF( 600, 7 );
	const branchError = program.fail( 1 );
	check( branchError === null, branchError && `failed at statement ${branchError.programStatement} op ${branchError.programOp}` );
	same( program.progs.pr_globals.getFloat( 603 ), 3, 'the loop ran three times' );
	same( program.progs.pr_globals.getFloat( OFS_RETURN ), 7, 'the return value is 7' );
	// a high data offset (above 32767) is a valid word offset, not a negative one
	const high = await fixture( { functions: [ empty, { first: 0 } ], statements: [ { op: OP_ADD_F, a: 40000, b: 40001, c: 40002 }, done( 40002 ) ], globals: 40010 } );
	high.setF( 40000, 1.5 ); high.setF( 40001, 2.5 );
	same( high.run( 1 ), 4, 'a data offset above 32767 reads the right slots' );

} );

Deno.test( 'CALL1 copies its argument into OFS_PARM0 and CALL2+ also copies the second into OFS_PARM1', async () => {

	const one = { first: 0, parmStart: 310, locals: 1, numparms: 1, parmSize: [ 1 ] }; // return parm + 5
	const two = { first: 2, parmStart: 320, locals: 2, numparms: 2, parmSize: [ 1, 1 ] }; // return parm0 + parm1
	const program = await fixture( {
		functions: [ empty, { first: 4 }, one, { first: 6 }, two ],
		statements: [
			{ op: OP_ADD_F, a: 310, b: 400, c: 311 }, done( 311 ),
			{ op: OP_ADD_F, a: 320, b: 321, c: 322 }, done( 322 ),
			{ op: OP_CALL1, a: 420, b: 410, c: 0 }, done( 1 ),
			{ op: OP_CALL2, a: 421, b: 411, c: 412 }, done( 1 )
		]
	} );
	same( program.progs.pr_functions[ 2 ].parm_start, 310, 'the one-parameter callee' );
	program.setI( 420, 2 ); program.setF( 410, 10 ); program.setF( 400, 5 );
	same( program.run( 1 ), 15, 'CALL1 passed 10 into the first parameter' );
	program.setI( 421, 4 ); program.setF( 411, 10 ); program.setF( 412, 32 );
	same( program.run( 3 ), 42, 'CALL2 passed both parameters' );

} );

Deno.test( 'the extended store, fetch, bit and random opcodes behave as the pinned interpreter does', async () => {

	const program = await fixture( {
		functions: [ empty, { first: 0 }, { first: 6 }, { first: 8 }, { first: 10 } ],
		statements: [
			{ op: OP_MULSTORE_F, a: 720, b: 721, c: 0 }, // 721 *= 720
			{ op: OP_ADDSTORE_F, a: 722, b: 721, c: 0 }, // 721 += 722
			{ op: OP_SUBSTORE_F, a: 723, b: 721, c: 0 }, // 721 -= 723
			{ op: OP_BITSET, a: 724, b: 725, c: 0 },
			{ op: OP_BITCLR, a: 726, b: 725, c: 0 }, done( 721 ),
			{ op: OP_FETCH_GBL_F, a: 740, b: 744, c: 745 }, done( 745 ),
			{ op: OP_RAND2, a: 750, b: 751, c: 0 }, done( 1 ),
			{ op: OP_SWITCH_F, a: 760, b: 3, c: 0 },
			{ op: OP_ADD_F, a: 766, b: 767, c: 768 }, // 42
			done( 768 ),
			{ op: OP_CASE, a: 762, b: - 2, c: 0 }, done( 764 )
		]
	} );
	program.setF( 720, 3 ); program.setF( 721, 10 ); program.setF( 722, 4 ); program.setF( 723, 2 );
	program.setF( 724, 0b0100 ); program.setF( 726, 0b0100 ); program.setF( 725, 0b0011 );
	same( program.run( 1 ), 32, 'the store opcodes computed ((10*3)+4)-2' );
	same( program.getF( 725 ), 0b0011, 'the set bit was cleared again and no other bit changed' );
	program.setI( 739, 3 ); program.setF( 740, 10 ); program.setF( 741, 11 ); program.setF( 742, 12 ); program.setF( 744, 1 );
	same( program.run( 2 ), 11, 'the array fetch read index 1' );
	program.setF( 744, 5 );
	check( program.fail( 2 ) !== null, 'an out-of-bounds index fails' );
	program.setF( 750, 10 ); program.setF( 751, 20 ); program.setRandom( () => 0.5 );
	same( program.run( 3 ), 15, 'RAND2 used the installed deterministic source' );
	program.setF( 760, 5 ); program.setF( 762, 5 ); program.setF( 766, 40 ); program.setF( 767, 2 ); program.setF( 764, 7 );
	same( program.run( 4 ), 42, 'SWITCH/CASE took the matching case' );
	program.setF( 762, 6 );
	same( program.run( 4 ), 7, 'SWITCH/CASE fell through when no case matched' );

} );

Deno.test( 'an unimplemented Hexen builtin is refused by number, not run as a Quake builtin', async () => {

	const program = await fixture( {
		functions: [ empty, { first: 0 }, { builtin: 10 } ],
		statements: [ { op: OP_CALL0, a: 770, b: 0, c: 0 }, done( 0 ) ]
	} );
	// A spy in the Quake builtin table proves the Hexen program cannot reach it; the call fails instead.
	let quakeBuiltinRan = false;
	program.progs.PR_SetBuiltins( Array.from( { length: 11 }, ( _, i ) => i === 10 ? () => { quakeBuiltinRan = true; } : () => {} ), 11 );
	program.setI( 770, 2 );
	const error = program.fail( 1 );
	check( error !== null, 'the call throws' );
	check( ! quakeBuiltinRan, 'no Quake builtin ran for the Hexen program' );
	check( /Program error/.test( String( error.message ) ), String( error?.message ) );

} );

Deno.test( 'the entity opcodes schedule thinks at 20 fps and cycle frames and weapon frames natively', async () => {

	const program = await fixture( {
		functions: [ empty, { first: 0 }, { first: 2 }, { first: 4 }, { first: 6 } ],
		statements: [
			{ op: OP_CSTATE, a: 800, b: 801, c: 0 }, done( 0 ),
			{ op: OP_CWSTATE, a: 800, b: 801, c: 0 }, done( 0 ),
			{ op: OP_STATE, a: 802, b: 803, c: 0 }, done( 0 ),
			{ op: OP_THINKTIME, a: 804, b: 805, c: 0 }, done( 0 )
		]
	} );
	const server = await import( '../src/engine/progs/progs.js' );
	const { PR_AllocEdicts } = await import( '../src/engine/progs/pr_edict.js' );
	const state = { edicts: [], max_edicts: 4 };
	server.PR_SetSV( state ); state.edicts = PR_AllocEdicts( 4, 392 );
	const ed = server.sv.edicts[ 1 ];
	server.pr_global_struct.self = 1; server.pr_global_struct.time = 10;
	program.setF( 800, 2 ); program.setF( 801, 4 );
	program.run( 1 );
	same( ed.v.frame, 2, 'the first cycle starts at the start frame' );
	check( Math.abs( ed.v.nextthink - 10.05 ) < 1e-5, `a Hexen think is scheduled 0.05 s ahead: ${ed.v.nextthink}` );
	same( ed.v.think, 1, 'the current function is queued again' );
	same( server.pr_global_struct.cycle_wrapped, 0, 'no wrap yet' );
	program.run( 1 ); program.run( 1 );
	same( ed.v.frame, 4, 'the frame advanced to the end' );
	program.run( 1 );
	same( ed.v.frame, 2, 'the frame wrapped back to the start' );
	same( server.pr_global_struct.cycle_wrapped, 1, 'the wrap is reported' );
	// weapon frames cycle the same way
	ed.v.weaponframe = 3; program.run( 2 );
	same( ed.v.weaponframe, 4, 'the weapon frame advanced' );
	program.run( 2 );
	same( ed.v.weaponframe, 2, 'the weapon frame wrapped' );
	// STATE sets the frame and think, also at 20 fps
	program.setF( 802, 6 ); program.progs.pr_globals.setInt32( 803, 3 );
	program.run( 3 );
	same( ed.v.frame, 6, 'STATE set the frame' );
	same( ed.v.think, 3, 'STATE set the think function' );
	check( Math.abs( ed.v.nextthink - 10.05 ) < 1e-5, `STATE uses the Hexen frame time: ${ed.v.nextthink}` );
	// THINKTIME sets nextthink from its entity and delay operands
	program.progs.pr_globals.setInt32( 804, 1 ); program.setF( 805, 2.5 );
	program.run( 4 );
	check( Math.abs( ed.v.nextthink - 12.5 ) < 1e-5, `THINKTIME scheduled the delay: ${ed.v.nextthink}` );

} );

Deno.test( 'the implemented Hexen builtins compute their native results through the dispatch table', async () => {

	// One caller for scalar/vector builtins (CALL1 into PARM0) and one for two-vector builtins (CALL2).
	const builtin = number => ( { builtin: number } );
	const program = await fixture( {
		globals: 1000,
		functions: [ empty, { first: 0 }, { first: 2 },
			builtin( 7 ), builtin( 9 ), builtin( 12 ), builtin( 13 ), builtin( 36 ), builtin( 37 ), builtin( 38 ),
			builtin( 43 ), builtin( 50 ), builtin( 51 ), builtin( 61 ), builtin( 62 ), builtin( 84 ),
			builtin( 91 ), builtin( 94 ), builtin( 95 ) ],
		statements: [
			{ op: OP_CALL1, a: 900, b: 910, c: 0 }, done( 1 ),
			{ op: OP_CALL2, a: 901, b: 920, c: 923 }, done( 1 )
		]
	} );
	const fn = number => program.progs.pr_functions.indexOf( program.progs.pr_functions.find( f => f.first_statement === - number ) );
	const call = ( number, vector ) => {

		program.setI( 900, fn( number ) );
		vector.forEach( ( value, i ) => program.setF( 910 + i, value ) );
		try { program.run( 1 ); } catch ( error ) {

			const at = program.progs.pr_xstatement;
			error.message += ` [builtin ${number}, function ${fn( number )}, statement ${at} op ${program.progs.pr_statements[ at ]?.op}, run error: ${PR_LastRunError()}]`;
			throw error;

		}
		return [ 0, 1, 2 ].map( i => program.getF( OFS_RETURN + i ) );

	};
	const near = ( value, expected, label ) => check( Math.abs( value - expected ) < 1e-5, `${label}: ${value} != ${expected}` );
	let out = call( 9, [ 3, 4, 0 ] );
	near( out[ 0 ], 0.6, 'normalize x' ); near( out[ 1 ], 0.8, 'normalize y' ); near( out[ 2 ], 0, 'normalize z' );
	same( call( 12, [ 3, 4, 0 ] )[ 0 ], 5, 'vlen' );
	same( call( 50, [ 3, 4, 9 ] )[ 0 ], 5, 'vhlen' );
	same( call( 13, [ 0, 1, 0 ] )[ 0 ], 90, 'vectoyaw' );
	out = call( 51, [ 0, 0, 1 ] );
	same( out[ 0 ], 90, 'vectoangles pitch' ); same( out[ 1 ], 0, 'vectoangles yaw' ); same( out[ 2 ], 0, 'vectoangles roll' );
	same( call( 36, [ 2.6, 0, 0 ] )[ 0 ], 3, 'rint' );
	same( call( 37, [ - 1.2, 0, 0 ] )[ 0 ], - 2, 'floor' );
	same( call( 38, [ 1.2, 0, 0 ] )[ 0 ], 2, 'ceil' );
	same( call( 43, [ - 3, 0, 0 ] )[ 0 ], 3, 'fabs' );
	near( call( 61, [ 180, 0, 0 ] )[ 0 ], - 1, 'cos degrees' );
	near( call( 62, [ 90, 0, 0 ] )[ 0 ], 1, 'sin degrees' );
	same( call( 84, [ 9, 0, 0 ] )[ 0 ], 3, 'sqrt' );
	program.setRandom( () => 0.25 );
	same( call( 7, [ 0, 0, 0 ] )[ 0 ], 0.25, 'random from the installed source' );
	// #91 concatv: clamp a vector into a range
	program.setI( 901, fn( 91 ) );
	[ 5, - 6, 2 ].forEach( ( value, i ) => program.setF( 920 + i, value ) );
	[ 4, 5, 3 ].forEach( ( value, i ) => program.setF( 923 + i, value ) );
	program.run( 2 );
	same( [ program.getF( OFS_RETURN ), program.getF( OFS_RETURN + 1 ), program.getF( OFS_RETURN + 2 ) ].join( ',' ), '4,-5,2', 'concatv' );
	// #94 v_factor: the camera basis combination
	program.progs.pr_global_struct.v_right = [ 0, 1, 0 ];
	program.progs.pr_global_struct.v_forward = [ - 1, 0, 0 ];
	program.progs.pr_global_struct.v_up = [ 0, 0, 1 ];
	out = call( 94, [ 2, 3, 4 ] );
	same( out.join( ',' ), '-3,2,4', 'v_factor: right=' + program.progs.pr_global_struct.v_right + ' forward=' + program.progs.pr_global_struct.v_forward + ' up=' + program.progs.pr_global_struct.v_up );
	// #95 v_factorrange: with a zero random source the factor is the minimum vector
	program.setI( 901, fn( 95 ) ); program.setRandom( () => 0 );
	[ 1, 2, 3 ].forEach( ( value, i ) => program.setF( 920 + i, value ) );
	[ 4, 5, 6 ].forEach( ( value, i ) => program.setF( 923 + i, value ) );
	program.run( 2 );
	same( [ program.getF( OFS_RETURN ), program.getF( OFS_RETURN + 1 ), program.getF( OFS_RETURN + 2 ) ].join( ',' ), '-2,1,3', 'v_factorrange at its minimum' );

} );

Deno.test( 'the string and console builtins produce native text and read and write cvars', async () => {

	const builtin = number => ( { builtin: number } );
	const program = await fixture( {
		globals: 1000,
		functions: [ empty, { first: 0 }, { first: 2 },
			builtin( 25 ), builtin( 26 ), builtin( 27 ), builtin( 45 ), builtin( 72 ) ],
		strings: [ 'hexen2_vm_test', '2.5' ],
		statements: [
			{ op: OP_CALL1, a: 900, b: 910, c: 0 }, done( 1 ),
			{ op: OP_CALL2, a: 901, b: 920, c: 923 }, done( 1 )
		]
	} );
	const { PR_GetString } = program.progs;
	const fn = number => program.progs.pr_functions.indexOf( program.progs.pr_functions.find( f => f.first_statement === - number ) );
	const textResult = ( number, argument ) => {

		program.setI( 900, fn( number ) );
		if ( typeof argument === 'number' ) program.setF( 910, argument );
		else [ 0, 1, 2 ].forEach( ( i ) => program.setF( 910 + i, argument[ i ] ) );
		program.run( 1 );
		return PR_GetString( program.progs.pr_globals.getInt32( OFS_RETURN ) );

	};
	same( textResult( 26, 3 ), '3', 'ftos of an exact integer' );
	same( textResult( 26, 2.5 ), '2.5', 'ftos of a fractional value' );
	same( textResult( 27, [ 1, 2.5, - 3 ] ), "'1.0 2.5 -3.0'", 'vtos of a vector' );
	// cvar(name) and cvar_set(name, value) use the real cvar registry
	const { cvar_t, Cvar_RegisterVariable } = await import( '../src/engine/common/cvar.js' );
	Cvar_RegisterVariable( new cvar_t( 'hexen2_vm_test', '7' ) );
	program.setI( 900, fn( 45 ) );
	program.progs.pr_globals.setInt32( 910, program.string( 'hexen2_vm_test' ) );
	program.run( 1 );
	same( program.getF( OFS_RETURN ), 7, 'cvar read' );
	program.setI( 901, fn( 72 ) );
	program.progs.pr_globals.setInt32( 920, program.string( 'hexen2_vm_test' ) );
	program.progs.pr_globals.setInt32( 923, program.string( '2.5' ) );
	program.run( 2 );
	same( ( await import( '../src/engine/common/cvar.js' ) ).Cvar_VariableValue( 'hexen2_vm_test' ), 2.5, 'cvar_set wrote the value' );
	// dprint must not throw on a null/empty string argument
	program.setI( 900, fn( 25 ) );
	program.progs.pr_globals.setInt32( 910, 0 );
	program.run( 1 );

} );

Deno.test( 'makevectors writes the native camera basis into the globals', async () => {

	const program = await fixture( {
		globals: 1000,
		functions: [ empty, { first: 0 }, { builtin: 1 } ],
		statements: [ { op: OP_CALL1, a: 900, b: 910, c: 0 }, done( 0 ) ]
	} );
	program.setI( 900, 2 );
	[ 0, 0, 0 ].forEach( ( value, i ) => program.setF( 910 + i, value ) );
	program.run( 1 );
	same( Array.from( program.progs.pr_global_struct.v_forward ).join( ',' ), '1,0,0', 'forward at zero angles' );
	same( Array.from( program.progs.pr_global_struct.v_right ).join( ',' ), '0,-1,0', 'right at zero angles' );
	same( Array.from( program.progs.pr_global_struct.v_up ).join( ',' ), '0,0,1', 'up at zero angles' );

} );

Deno.test( 'changeyaw turns self toward ideal_yaw by at most 20 degrees and wraps', async () => {

	const program = await fixture( { globals: 1000, functions: [ empty, { first: 0 } ], statements: [ done( 0 ) ] } );
	const server = await import( '../src/engine/progs/progs.js' );
	const { PR_AllocEdicts } = await import( '../src/engine/progs/pr_edict.js' );
	const state = { edicts: [], max_edicts: 4 };
	server.PR_SetSV( state ); state.edicts = PR_AllocEdicts( 4, 392 );
	const ed = server.sv.edicts[ 1 ];
	server.pr_global_struct.self = 1;
	ed.v.angles = [ 0, 100, 0 ]; ed.v.ideal_yaw = 250;
	check( Hexen2_CallBuiltin( 49, { random: () => 0.5 } ) === true, 'changeyaw is implemented' );
	check( Math.abs( ed.v.angles[ 1 ] - 120 ) < 0.02, 'turned 20 degrees toward the ideal: ' + ed.v.angles[ 1 ] );
	ed.v.angles = [ 0, 10, 0 ]; ed.v.ideal_yaw = 350;
	Hexen2_CallBuiltin( 49, { random: () => 0.5 } );
	check( Math.abs( ed.v.angles[ 1 ] - 350 ) < 0.02, 'the short way around wraps through 0: ' + ed.v.angles[ 1 ] );

} );
