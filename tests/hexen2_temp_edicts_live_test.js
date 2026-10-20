// The reserved Hexen II temporary-edict range is never handed to ordinary map entities: demo1 spawns above it,
// spawntemp only recycles inside it, and a hub round trip keeps the lowest-numbered map entity. The supplied data is
// used through the live server; the suite skips when it is absent.
import { pr_globals, pr_global_struct, PR_GetString, EDICT_NUM } from '../src/engine/progs/progs.js';
import { OFS_RETURN } from '../src/engine/progs/pr_comp.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { spawnHexen2Map, hexen2DataPresent } from './helpers/hexen2_live.mjs';
import { Host_Hexen2ChangeLevel2, Host_Hexen2HubReset } from '../src/engine/server/host_cmd.js';
import { Hexen2_TempEdictStart, Hexen2_TempEdictCount } from '../src/engine/progs/hexen2_temp_edicts.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );

function localStorageShim() {

	const values = new Map();
	globalThis.localStorage = {
		get length() { return values.size; },
		key: index => [ ...values.keys() ][ index ] ?? null,
		getItem: key => values.get( key ) ?? null,
		setItem: ( key, value ) => { values.set( String( key ), String( value ) ); },
		removeItem: key => { values.delete( key ); },
	};

}

function classnameOf( ent ) { return ent && !ent.free ? PR_GetString( ent.v.classname ) : ''; }

Deno.test( 'map entities skip the reserved temp range, spawntemp only touches it, and a hub round trip keeps them', () => {

	if ( !hexen2DataPresent() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	localStorageShim();
	Host_Hexen2HubReset();
	const session = spawnHexen2Map( 'demo1' );
	const server = session.sv;

	const start = Hexen2_TempEdictStart( server, session.svs );
	const count = Hexen2_TempEdictCount( server );
	const end = start + count;
	check( count > 0, 'the server reserved temporary slots' );

	// No map entity may be sitting in the reserved range.
	for ( let index = start; index < end; index ++ ) {

		const ent = EDICT_NUM( index );
		same( classnameOf( ent ), '', `reserved temp slot ${index} holds no map entity` );

	}

	// The first real map entity is above the range, and it survives spawntemp recycling.
	let first = null;
	for ( let index = 1; index < server.num_edicts; index ++ ) {

		const ent = EDICT_NUM( index );
		if ( classnameOf( ent ) !== '' && index > session.svs.maxclients ) { first = ent; break; }

	}

	check( first !== null, 'demo1 has a map entity' );
	check( first.index >= end, `the first map entity (${first.index}: ${classnameOf( first )}) starts after the temp range ${start}..${end}` );
	const firstIndex = first.index, firstName = classnameOf( first );

	const live = [];
	for ( let index = 1; index < server.num_edicts; index ++ ) {

		const ent = EDICT_NUM( index );
		if ( ent && !ent.free && classnameOf( ent ) !== '' ) live.push( { index, name: classnameOf( ent ) } );

	}

	for ( let i = 0; i < count + 5; i ++ ) {

		pr_global_struct.self = 0;
		check( callProfileBuiltin( 93 ), 'spawntemp (#93)' );
		const returned = EDICT_NUM( pr_globals.getInt32( OFS_RETURN ) );
		check( returned.index >= start && returned.index < end, `spawntemp returned temp slot ${returned.index}` );

	}
	for ( const entry of live ) {

		const ent = EDICT_NUM( entry.index );
		same( ent.free, false, `map entity ${entry.index} (${entry.name}) is still live after spawntemp` );
		same( classnameOf( ent ), entry.name, `map entity ${entry.index} keeps its classname` );

	}

	// A hub capture/restore keeps the lowest-numbered map entity.
	const there = Host_Hexen2ChangeLevel2( 'demo2' );
	check( there.ok, there.reason ?? 'reached demo2' );
	const back = Host_Hexen2ChangeLevel2( 'demo1' );
	check( back.ok, back.reason ?? 'returned to demo1' );
	const restored = EDICT_NUM( firstIndex );
	same( classnameOf( restored ), firstName, `the map entity at ${firstIndex} survives the hub round trip` );

} );
