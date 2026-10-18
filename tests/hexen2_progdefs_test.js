// Hexen II program definitions (src/engine/progs/hexen2_progdefs.js) against the pinned independent layouts and the
// owner's supplied programs: CRC 38488 (base 1.11) and 26905 (Portal 1.12), their differing globals, the shared 166-slot
// entvars structure, the 392 entity fields, version 1.03 refused by name, and tampered definitions refused rather than
// loaded. plan section 4; T03 prerequisites.
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import { pakDirectory, readMember } from '../tools/pak_members.mjs';
import {
	HEXEN2_PROG_CRCS, HEXEN2_ENTITY_FIELDS, HEXEN2_ENTVARS, HEXEN2_GLOBALS_V111, HEXEN2_GLOBALS_V112,
	Hexen2_ValidateProgramDefinitions
} from '../src/engine/progs/hexen2_progdefs.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2';

// The named layout entries, keyed by name, for offset checks.
const byName = layout => new Map( layout.map( ( [ name, type, ofs ] ) => [ name, { type, ofs } ] ) );

// The supplied program's parsed header and definitions, with a string reader over its own string table.
function parsed( path ) {

	const bytes = readFileSync( path ), view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );
	const ints = []; for ( let i = 0; i < 15; i ++ ) ints.push( view.getInt32( i * 4, true ) );
	const [ , crc, ofsStatements, numStatements, ofsGlobalDefs, numGlobalDefs, ofsFieldDefs, numFieldDefs, ofsFunctions,
		numFunctions, ofsStrings, numStrings, ofsGlobals, numGlobals, entityFields ] = ints;
	const strings = new Uint8Array( bytes.buffer, bytes.byteOffset + ofsStrings, numStrings );
	const stringAt = ofs => {

		if ( ofs < 0 || ofs >= strings.length ) return null;
		let end = ofs; while ( end < strings.length && strings[ end ] !== 0 ) end ++;
		return String.fromCharCode( ...strings.subarray( ofs, end ) );

	};
	const readDefs = ( offset, count ) => Array.from( { length: count }, ( _, i ) => ( {
		type: view.getUint16( offset + i * 8, true ), ofs: view.getUint16( offset + i * 8 + 2, true ), s_name: view.getInt32( offset + i * 8 + 4, true )
	} ) );
	return {
		bytes, crc, entityFields, numStatements, numFunctions, numGlobalDefs, numFieldDefs,
		globalDefs: readDefs( ofsGlobalDefs, numGlobalDefs ), fieldDefs: readDefs( ofsFieldDefs, numFieldDefs ), stringAt
	};

}

Deno.test( 'the pinned layouts carry the source header CRCs and the real structure slots', () => {

	same( HEXEN2_PROG_CRCS.v103, 14046, 'v1.03 CRC' );
	same( HEXEN2_PROG_CRCS.v111, 38488, 'v1.11 CRC' );
	same( HEXEN2_PROG_CRCS.v112, 26905, 'v1.12 CRC' );
	same( HEXEN2_ENTITY_FIELDS, 392, 'the supplied entity field count' );
	same( HEXEN2_ENTVARS.length, 138, 'every named entvars field is listed' );
	const v111 = byName( HEXEN2_GLOBALS_V111 ), v112 = byName( HEXEN2_GLOBALS_V112 );
	same( v111.get( 'self' ).ofs, 28, 'the globals start after pad[28]' );
	same( v111.get( 'serverflags' ).ofs, 40, 'v1.11 serverflags' );
	same( v112.get( 'cl_playerclass' ).ofs, 40, 'v1.12 inserts cl_playerclass' );
	same( v112.get( 'serverflags' ).ofs, 41, 'v1.12 serverflags shifts' );
	check( ! v112.has( 'modelindex_assassin' ) && v111.has( 'modelindex_assassin' ), 'the class model globals are 1.11 only' );
	same( v111.get( 'ClassChangeWeapon' ).ofs, 104, 'v1.11 last global' );
	same( v112.get( 'ClassChangeWeapon' ).ofs, 101, 'v1.12 last global' );
	const fields = byName( HEXEN2_ENTVARS );
	same( fields.get( 'modelindex' ).ofs, 0, 'first entity field' );
	same( fields.get( 'origin' ).ofs, 10, 'origin offset' );
	same( fields.get( 'weaponmodel' ).ofs, 55, 'weaponmodel offset' );
	same( fields.get( 'string_index' ).ofs, 165, 'last entvars slot' );
	same( fields.get( 'string_index' ).type, 2, 'string_index is a float' );

} );

const SUPPLIED = existsSync( BASE + '/data1/progs.dat' ) && existsSync( BASE + '/portals/progs.dat' );

Deno.test( 'the supplied base and Portal programs validate against their own layouts', () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE ); return; }
	const base = parsed( BASE + '/data1/progs.dat' );
	const validatedBase = Hexen2_ValidateProgramDefinitions( base );
	check( validatedBase.ok, validatedBase.reason );
	same( validatedBase.profile.layout, 'hexen2-base', 'base layout' );
	same( validatedBase.profile.gameId, 'hexen2', 'base id' );
	const portals = parsed( BASE + '/portals/progs.dat' );
	const validatedPortals = Hexen2_ValidateProgramDefinitions( portals );
	check( validatedPortals.ok, validatedPortals.reason );
	same( validatedPortals.profile.layout, 'hexen2-portals', 'Portal layout' );
	same( validatedPortals.profile.gameId, 'hexen2-portals', 'Portal id' );
	same( base.entityFields, 392, 'the base entity field count' );

} );

Deno.test( 'a tampered definition is refused with the field and offsets named', () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE ); return; }
	const base = parsed( BASE + '/data1/progs.dat' );
	const view = new DataView( base.bytes.buffer, base.bytes.byteOffset, base.bytes.byteLength );
	const headerInts = []; for ( let i = 0; i < 15; i ++ ) headerInts.push( view.getInt32( i * 4, true ) );
	const ofsGlobalDefs = headerInts[ 4 ], numGlobalDefs = headerInts[ 5 ];
	// find serverflags and shift it by one slot, as a corrupted or foreign program would
	for ( let i = 0; i < numGlobalDefs; i ++ ) {

		const name = base.stringAt( view.getInt32( ofsGlobalDefs + i * 8 + 4, true ) );
		if ( name !== 'serverflags' ) continue;
		base.globalDefs[ i ].ofs += 1;
		const validated = Hexen2_ValidateProgramDefinitions( base );
		check( ! validated.ok, 'the shifted definition is refused' );
		check( /serverflags/.test( validated.reason ) && /offset 41/.test( validated.reason ), 'the reason names the field and the found offset: ' + validated.reason );
		return;

	}
	throw new Error( 'serverflags was not found in the supplied base program' );

} );

Deno.test( 'an unsupported layout is refused, with v1.03 named as obsolete data', () => {

	const foreign = { crc: 12345, entityFields: 392, globalDefs: [], fieldDefs: [], stringAt: () => '' };
	const refused = Hexen2_ValidateProgramDefinitions( foreign );
	check( ! refused.ok && /unsupported Hexen II layout CRC 12345/.test( refused.reason ), refused.reason );
	const old = { crc: HEXEN2_PROG_CRCS.v103, entityFields: 0, globalDefs: [], fieldDefs: [], stringAt: () => '' };
	const obsolete = Hexen2_ValidateProgramDefinitions( old );
	check( ! obsolete.ok && /v1\.03/.test( obsolete.reason ) && /outside/.test( obsolete.reason ), obsolete.reason );

} );

Deno.test( 'the one interpreter loads the supplied programs and execution has a bounded outcome', async () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE ); return; }
	const { PR_LoadProgs } = await import( '../src/engine/progs/pr_edict.js' );
	const progs = await import( '../src/engine/progs/progs.js' );
	const bytes = readFileSync( BASE + '/data1/progs.dat' );
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	same( progs.PR_ProgramProfile(), 'hexen2-base', 'the loaded base profile' );
	same( progs.progs.entityfields, 392, 'entity fields' );
	// the named globals sit at the proven offsets: serverflags is 40 in 1.11
	progs.pr_global_struct.serverflags = 7;
	same( progs.pr_globals.getFloat( 40 ), 7, 'serverflags is written at the validated offset' );
	progs.pr_global_struct.serverflags = 0;
	// Execution proceeds (the VM can run its opcodes), but the first unimplemented native builtin stops it with the
	// bounded host-error path; the program profile is unchanged. (This replaced the earlier blanket refusal assertion
	// when the interpreter gained the Hexen ABI; the builtin refusal itself is covered in tests/hexen2_vm_test.js.)
	const { PR_ExecuteProgram } = await import( '../src/engine/progs/pr_exec.js' );
	const codeFunction = progs.pr_functions.find( ( fn, index ) => index > 0 && fn.first_statement >= 0 );
	check( codeFunction !== undefined, 'the supplied program has a non-builtin function' );
	let threw = null;
	try { PR_ExecuteProgram( progs.pr_functions.indexOf( codeFunction ) ); } catch ( error ) { threw = error; }
	check( threw === null || /Program error/.test( String( threw.message ) ), 'the run either completes or stops through the bounded program-error path: ' + threw?.message );
	same( progs.PR_ProgramProfile(), 'hexen2-base', 'the layout profile survives the run' );
	// a Quake program still loads as before
	if ( existsSync( '/Users/bri/quaked/Quake/id1/progs.dat' ) ) {

		const quakeBytes = readFileSync( '/Users/bri/quaked/Quake/id1/progs.dat' );
		PR_LoadProgs( quakeBytes.buffer.slice( quakeBytes.byteOffset, quakeBytes.byteOffset + quakeBytes.byteLength ) );
		same( progs.PR_ProgramProfile(), 'quake', 'the Quake profile is restored by a Quake program' );

	}

} );

Deno.test( 'RED: a Hexen edict exposes the Hexen field offsets, not Quake\'s', async () => {

	if ( ! SUPPLIED ) { console.log( 'SKIP: the supplied Hexen II installation is not present at ' + BASE ); return; }
	const { PR_LoadProgs } = await import( '../src/engine/progs/pr_edict.js' );
	const { edict_t } = await import( '../src/engine/progs/progs.js' );
	const bytes = readFileSync( BASE + '/data1/progs.dat' );
	PR_LoadProgs( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	const ed = new edict_t( 0, 392 );
	ed.v.origin = [ 1, 2, 3 ];
	same( ed._fieldAccessor.getFloat( 10 ), 1, 'Hexen origin x at 10' );
	same( ed._fieldAccessor.getFloat( 12 ), 3, 'Hexen origin z at 12' );
	ed.v.health = 50;
	same( ed._fieldAccessor.getFloat( 57 ), 50, 'Hexen health at 57, not Quake\'s 48' );
	same( ed.v.health, 50, 'health reads back' );
	ed.v.playerclass = 2;
	same( ed._fieldAccessor.getFloat( 59 ), 2, 'Hexen playerclass at 59' );
	ed.v.classname = 7;
	same( ed._fieldAccessor.getInt32( 28 ), 7, 'classname is a string slot at 28' );
	same( ed.v.weaponframe, 0, 'weaponframe reads zero from the new edict' );

} );

Deno.test( 'a Quake program loaded after a Hexen one restores Quake\'s field layout', async () => {

	const quakePak = '/Users/bri/quaked/Quake/pak0.pak';
	if ( ! SUPPLIED || ! existsSync( quakePak ) ) { console.log( 'SKIP: the supplied Hexen II or Quake installation is not present' ); return; }
	const { PR_LoadProgs } = await import( '../src/engine/progs/pr_edict.js' );
	const { edict_t } = await import( '../src/engine/progs/progs.js' );
	const hexenBytes = readFileSync( BASE + '/data1/progs.dat' );
	PR_LoadProgs( hexenBytes.buffer.slice( hexenBytes.byteOffset, hexenBytes.byteOffset + hexenBytes.byteLength ) );
	const hexenEdict = new edict_t( 0, 392 );
	hexenEdict.v.health = 33;
	same( hexenEdict._fieldAccessor.getFloat( 57 ), 33, 'Hexen health at 57' );
	// the owner's Quake progs.dat, read from its pack read-only
	const entry = ( await pakDirectory( quakePak ) ).get( 'progs.dat' );
	check( entry !== undefined, 'the Quake pack carries progs.dat' );
	const quakeBytes = await readMember( entry );
	PR_LoadProgs( quakeBytes.buffer.slice( quakeBytes.byteOffset, quakeBytes.byteOffset + quakeBytes.byteLength ) );
	const quakeEdict = new edict_t( 0, 105 );
	quakeEdict.v.health = 44;
	same( quakeEdict._fieldAccessor.getFloat( 48 ), 44, 'Quake health is back at 48' );

} );
