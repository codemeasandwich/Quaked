// A Hexen II level spawn resends the whole stat and objective record, as native SV_SpawnServer's send_all_v does.
// changelevel2 there and back must leave cl.h2.stats complete on a freshly reset client, including the Portal
// objective masks. The live server supplies the gamecode; the suite skips when the owned data is absent.
import { pr_global_struct, pr_globals } from '../src/engine/progs/progs.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/engine/progs/pr_comp.js';
import { PROTOCOL_LARGE } from '../src/engine/common/protocol.js';
import { COM_SetNetMessage, sizebuf_t, SZ_Alloc } from '../src/engine/common/common.js';
import { cl } from '../src/engine/client/client.js';
import { CL_ClearState } from '../src/engine/client/cl_main.js';
import { CL_Hexen2Reset } from '../src/engine/client/cl_hexen2.js';
import { CL_ParseServerMessage } from '../src/engine/client/cl_parse.js';
import { SV_WriteClientdataToMessage, SV_SetHexen2Field } from '../src/engine/server/sv_main.js';
import { HEXEN2_STAT_FIELDS } from '../src/engine/common/hexen2_clientdata.js';
import { callProfileBuiltin } from './helpers/builtin_table.mjs';
import { spawnHexen2Map, hexen2DataPresent } from './helpers/hexen2_live.mjs';
import { Host_Hexen2ChangeLevel2, Host_Hexen2HubReset } from '../src/engine/server/host_cmd.js';

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

function resetParsing() {

	CL_ClearState();
	CL_Hexen2Reset();
	cl.protocol = PROTOCOL_LARGE;
	cl.maxclients = 1;
	cl.scores = [ { name: '', frags: 0, colors: 0, translations: new Uint8Array( 256 ) } ];

}

Deno.test( 'a hub level spawn resends every stat and objective, so a reset client sees the complete record', () => {

	if ( !hexen2DataPresent() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	localStorageShim();
	Host_Hexen2HubReset();
	const session = spawnHexen2Map( 'demo1' );
	const client = session.clients[ 0 ];

	// Record the initial baseline, then an unchanged objective value, so a later delta would omit both before the fix.
	let scratch = new sizebuf_t();
	SZ_Alloc( scratch, 32768 );
	SV_WriteClientdataToMessage( client.edict, scratch );
	scratch.cursize = 0;
	session.sv.info_mask = 5;
	session.sv.info_mask2 = 0;
	SV_WriteClientdataToMessage( client.edict, scratch );

	// Change several fields of different widths so a stale delta is visibly incomplete after the transition.
	SV_SetHexen2Field( client.edict, 'health', 77 );
	SV_SetHexen2Field( client.edict, 'level', 7 );
	SV_SetHexen2Field( client.edict, 'bluemana', 33 );
	SV_SetHexen2Field( client.edict, 'armor_amulet', 4 );

	const there = Host_Hexen2ChangeLevel2( 'demo2' );
	check( there.ok, there.reason ?? 'reached demo2' );
	const back = Host_Hexen2ChangeLevel2( 'demo1' );
	check( back.ok, back.reason ?? 'returned to demo1' );

	// The restored level's objectives are the same value; the new client had reset them, so they must be resent.
	session.sv.info_mask = 5;
	session.sv.info_mask2 = 0;
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( client.edict, client.message );
	const data = client.message.data.subarray( 0, client.message.cursize );

	resetParsing();
	const msg = new sizebuf_t();
	SZ_Alloc( msg, 32768 );
	msg.data.set( data, 0 );
	msg.cursize = data.length;
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();

	same( Object.keys( cl.h2.stats ).length, HEXEN2_STAT_FIELDS.length, 'the full stat record was resent' );
	same( cl.h2.stats.health, 77, 'health' );
	same( cl.h2.stats.level, 7, 'level' );
	same( cl.h2.stats.bluemana, 33, 'blue mana' );
	same( cl.h2.stats.armor_amulet, 4, 'SC2 armour' );
	check( Object.hasOwn( cl.h2.stats, 'weapon' ), 'the weapon stat is present even when unchanged' );
	same( cl.h2.infoMask, 5, 'the objective mask was resent' );
	same( cl.h2.infoMask2, 0, 'the second objective mask was resent' );

} );

Deno.test( 'updateinfoplaque stores engine-side objectives that SV_UpdateClientStats sends', () => {

	if ( !hexen2DataPresent() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	localStorageShim();
	Host_Hexen2HubReset();
	const session = spawnHexen2Map( 'demo1' );
	const client = session.clients[ 0 ];

	// #100 toggles objective 0 in SC1 and objective 35 (bit 3) in SC2.
	const before = session.sv.info_mask | 0, before2 = session.sv.info_mask2 | 0;
	pr_globals.setFloat( OFS_PARM0, 0 );
	pr_globals.setFloat( OFS_PARM1, 0 );
	check( callProfileBuiltin( 100 ), 'updateinfoplaque (#100)' );
	pr_globals.setFloat( OFS_PARM0, 35 );
	pr_globals.setFloat( OFS_PARM1, 0 );
	check( callProfileBuiltin( 100 ), 'updateinfoplaque (#100, second mask)' );
	const expected = ( before ^ 1 ) >>> 0, expected2 = ( before2 ^ 8 ) >>> 0;
	same( session.sv.info_mask >>> 0, expected, 'the first objective mask' );
	same( session.sv.info_mask2 >>> 0, expected2, 'the second objective mask' );

	client.h2InfoMask = - 1;
	client.h2InfoMask2 = - 1;
	client.message.cursize = 0;
	SV_WriteClientdataToMessage( client.edict, client.message );
	const data = client.message.data.subarray( 0, client.message.cursize );

	resetParsing();
	const msg = new sizebuf_t();
	SZ_Alloc( msg, 32768 );
	msg.data.set( data, 0 );
	msg.cursize = data.length;
	COM_SetNetMessage( msg );
	CL_ParseServerMessage();

	same( cl.h2.infoMask, expected, 'the client received objectives' );
	same( cl.h2.infoMask2, expected2, 'the client received the second objectives' );

} );
