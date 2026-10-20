// Public host save/read/load APIs, with transaction timing and failures supplied at the platform boundary.
import { Host_Hexen2SaveGame, Host_Hexen2ReadSlot, Host_Hexen2LoadGame, Host_Hexen2HubReset } from '../src/engine/server/host_cmd.js';
import { Hexen2_SaveStore } from '../src/engine/common/hexen2_save.js';
import { Con_SetPrintFunctions } from '../src/engine/common/common.js';
import { Cbuf_AddText, Cbuf_Execute } from '../src/engine/common/cmd.js';
import { GameSelection_SetRunning, GameSelection_SavePrefix } from '../src/engine/common/game_selection.js';
import { createHexen2Session, hexen2DataPresent } from './helpers/hexen2_live.mjs';
import { fakeIndexedDB, saveLocalStorage } from './helpers/fake_indexeddb.mjs';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
function platform() { globalThis.localStorage = saveLocalStorage(); globalThis.indexedDB = fakeIndexedDB(); return globalThis.indexedDB; }
function legacy() {
	const level = { schema: 1, level: 'demo1', globals: '{}', lightstyles: new Array( 64 ).fill( 'm' ), time: 1, edicts: [], num_edicts: 2 };
	return 'HEXEN2HUB 1\nlegacy_comment\n' + JSON.stringify( { schema: 1, kind: 'hexen2-hub', currentLevel: 'demo1', levels: { demo1: level }, clients: null } ) + '\n';
}
Deno.test( 'legacy localStorage hub slots migrate only after the IndexedDB transaction commits', async () => {
	const idb = platform(), key = GameSelection_SavePrefix() + 'legacy', text = legacy();
	localStorage.setItem( key, text );
	idb.abortNext = true;
	same( ( await Host_Hexen2ReadSlot( 'legacy' ) )?.text, text, 'failed migration still reads the old slot' );
	same( localStorage.getItem( key ), text, 'aborted migration retains the source' );
	same( idb.records.size, 0, 'no committed new record' );
	same( ( await Host_Hexen2ReadSlot( 'legacy' ) )?.text, text, 'retry reads the legacy save' );
	same( localStorage.getItem( key ), null, 'source removed after successful migration' );
	check( idb.records.size === 1, 'the migrated save is in IndexedDB' );
	same( ( await Host_Hexen2ReadSlot( 'legacy' ) )?.text, text, 'read through the new backend' );
} );
Deno.test( 'a save request that succeeds then aborts must reject and preserve the old committed record', async () => {
	const idb = fakeIndexedDB(), store = Hexen2_SaveStore( { indexedDB: idb, localStorage: null } );
	await store.put( 'slot', { text: 'old' } );
	idb.abortNext = true;
	let refused = false;
	try { await store.put( 'slot', { text: 'new' } ); } catch { refused = true; }
	check( refused, 'transaction abort is a failed write' );
	same( ( await store.get( 'slot' ) ).text, 'old', 'previous committed value survives' );
} );
Deno.test( 'host saves round-trip through IndexedDB; quota failure keeps the old hub and Quake keys', async () => {
	if ( ! hexen2DataPresent() ) { console.log( 'SKIP: owned Hexen II data absent' ); return; }
	const idb = platform();
	Host_Hexen2HubReset();
	const session = createHexen2Session( 'demo1' );
	localStorage.setItem( 'quake_save_s0', '5\nQuake save' );
	session.players[ 0 ].v.health = 57;
	check( ( await Host_Hexen2SaveGame( 's0' ) ).ok, 'first hub saved' );
	check( idb.records.size === 1, 'public host writes IndexedDB' );
	const before = ( await Host_Hexen2ReadSlot( 's0' ) ).text;
	session.players[ 0 ].v.health = 3;
	idb.abortNext = true;
	const messages = [];
	Con_SetPrintFunctions( ( ...args ) => messages.push( args.join( ' ' ) ), () => {} );
	try { check( ! ( await Host_Hexen2SaveGame( 's0' ) ).ok, 'quota failure is reported' ); }
	finally { Con_SetPrintFunctions( null, null ); }
	check( messages.some( line => /ERROR:.*previous save retained/.test( line ) ), 'the console explains the failed write' );
	same( ( await Host_Hexen2ReadSlot( 's0' ) ).text, before, 'failed overwrite keeps the old slot' );
	const loading = Host_Hexen2LoadGame( 's0' );
	same( session.svs.clients[ 0 ].edict.v.health, 3, 'load waits for IndexedDB before touching the live player' );
	check( ( await loading ).ok, 'saved hub loads' );
	same( session.svs.clients[ 0 ].edict.v.health, 57, 'saved player state restored' );
	same( localStorage.getItem( 'quake_save_s0' ), '5\nQuake save', 'Quake version-5 key untouched' );
	// Completion is observed at the console boundary because Cbuf deliberately does not await commands.
	const command = text => new Promise( ( resolve, reject ) => {
		Con_SetPrintFunctions( ( fmt, ...args ) => {
			if ( fmt.startsWith( 'done.' ) ) resolve();
			if ( fmt.startsWith( 'ERROR:' ) ) reject( new Error( fmt + args.join( ' ' ) ) );
		}, () => {} );
		Cbuf_AddText( text + '\n' ); Cbuf_Execute();
	} );
	try {
		await command( 'save command-idb' );
		session.svs.clients[ 0 ].edict.v.health = 7;
		session.svs.clients[ 0 ].message.cursize = 0;
		await command( 'load command-idb' );
		same( session.svs.clients[ 0 ].edict.v.health, 57, 'console load waits and restores the IndexedDB slot' );
	} finally { Con_SetPrintFunctions( null, null ); }
} );
Deno.test( 'unavailable IndexedDB keeps the localStorage fallback, and unavailable storage keeps memory', async () => {
	const idb = fakeIndexedDB(), storage = saveLocalStorage();
	idb.failOpen = true;
	const local = Hexen2_SaveStore( { indexedDB: idb, localStorage: storage } );
	await local.put( 'fallback', 'old' );
	same( local.kind, 'localstorage', 'opening failure selects the existing fallback' );
	same( await local.get( 'fallback' ), 'old', 'fallback read' );
	storage.setItem = () => { throw new Error( 'localStorage quota exceeded' ); };
	let failed = false;
	try { await local.put( 'fallback', 'new' ); } catch { failed = true; }
	check( failed, 'a fallback quota error rejects' );
	same( await local.get( 'fallback' ), 'old', 'previous localStorage record survives' );
	const memory = Hexen2_SaveStore( { indexedDB: null, localStorage: null } );
	await memory.put( 'temporary', 'saved' );
	same( memory.kind, 'memory', 'memory last resort' );
	same( await memory.get( 'temporary' ), 'saved', 'memory read' );
} );
Deno.test( 'deleting a migrated hub slot cannot resurrect its legacy source', async () => {
	const idb = platform(), key = GameSelection_SavePrefix() + 's0';
	localStorage.setItem( key, legacy() );
	await Host_Hexen2ReadSlot( 's0' );
	const { Host_Hexen2DeleteSlot, Host_Hexen2SaveSummary, Host_Hexen2RefreshSaveIndex } = await import( '../src/engine/server/host_cmd.js' );
	same( ( await Host_Hexen2RefreshSaveIndex() )[ 0 ].comment, 'legacy_comment', 'menu index reads the migrated record' );
	check( Host_Hexen2SaveSummary( 's0' ) !== null, 'summary cached' );
	check( ( await Host_Hexen2DeleteSlot( 's0' ) ).ok, 'delete succeeds' );
	same( await Host_Hexen2ReadSlot( 's0' ), null, 'deleted slot absent' );
	same( Host_Hexen2SaveSummary( 's0' ), null, 'cached summary removed' );
	same( localStorage.getItem( key ), null, 'legacy source absent' );
	same( idb.records.size, 0, 'repository source absent' );
} );

Deno.test( 'the repository separates base, demo and Portal slot names, and never migrates Quake text', async () => {
	const idb = platform();
	const oldDistribution = globalThis.__QUAKED_DISTRIBUTION__;
	globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'desktop' };
	try {
		for ( const game of [ 'hexen2', 'hexen2-demo', 'hexen2-portals' ] ) {
			localStorage.setItem( 'quaked.game.v1', game );
			GameSelection_SetRunning( game );
			localStorage.setItem( GameSelection_SavePrefix() + 's0', legacy().replace( 'legacy_comment', game ) );
			await Host_Hexen2ReadSlot( 's0' );
		}
		same( idb.records.size, 3, 'each edition has a distinct repository key' );
		for ( const game of [ 'hexen2', 'hexen2-demo', 'hexen2-portals' ] ) {
			localStorage.setItem( 'quaked.game.v1', game );
			GameSelection_SetRunning( game );
			same( ( await Host_Hexen2ReadSlot( 's0' ) ).comment, game, game + ' reads its own slot' );
		}
		const key = GameSelection_SavePrefix() + 's1';
		localStorage.setItem( key, '5\nQuake save' );
		same( await Host_Hexen2ReadSlot( 's1' ), null, 'Quake text is not a hub' );
		same( localStorage.getItem( key ), '5\nQuake save', 'Quake text is retained' );
	} finally { GameSelection_SetRunning( null ); globalThis.__QUAKED_DISTRIBUTION__ = oldDistribution; }
} );

Deno.test( 'newer outage saves recover over old IndexedDB records and deletion clears both backends', async () => {
	if ( ! hexen2DataPresent() ) { console.log( 'SKIP: owned Hexen II data absent' ); return; }
	const records = new Map();
	globalThis.localStorage = saveLocalStorage();
	globalThis.indexedDB = fakeIndexedDB( records );
	Host_Hexen2HubReset();
	const session = createHexen2Session( 'demo1' );
	session.players[ 0 ].v.health = 21;
	check( ( await Host_Hexen2SaveGame( 'outage' ) ).ok, 'healthy save A commits' );
	const original = ( await Host_Hexen2ReadSlot( 'outage' ) ).text;
	globalThis.indexedDB = fakeIndexedDB( records );
	indexedDB.failOpen = true;
	session.players[ 0 ].v.health = 82;
	check( ( await Host_Hexen2SaveGame( 'outage' ) ).ok, 'outage save B commits in the fallback' );
	const newer = ( await Host_Hexen2ReadSlot( 'outage' ) ).text;
	check( original !== newer, 'B differs from A' );
	const fallbackKey = 'quaked.hexen2.save.' + GameSelection_SavePrefix() + 'outage';
	check( localStorage.getItem( fallbackKey ) !== null, 'the fallback holds B' );
	globalThis.indexedDB = fakeIndexedDB( records );
	indexedDB.abortNext = true;
	same( ( await Host_Hexen2ReadSlot( 'outage' ) ).text, newer, 'an aborted recovery still reads B' );
	check( localStorage.getItem( fallbackKey ) !== null, 'aborted recovery retains B' );
	same( ( await Host_Hexen2ReadSlot( 'outage' ) ).text, newer, 'B recovers over the older IDB record' );
	same( localStorage.getItem( fallbackKey ), null, 'fallback removed only after recovery commits' );
	const { Host_Hexen2DeleteSlot } = await import( '../src/engine/server/host_cmd.js' );
	check( ( await Host_Hexen2DeleteSlot( 'outage' ) ).ok, 'recovered save deleted' );
	globalThis.indexedDB = fakeIndexedDB( records );
	indexedDB.failOpen = true;
	same( await Host_Hexen2ReadSlot( 'outage' ), null, 'fallback outage cannot resurrect a deleted slot' );
} );
Deno.test( 'deletion during an IndexedDB outage refuses before removing either saved copy', async () => {
	if ( ! hexen2DataPresent() ) { console.log( 'SKIP: owned Hexen II data absent' ); return; }
	const records = new Map();
	globalThis.localStorage = saveLocalStorage();
	globalThis.indexedDB = fakeIndexedDB( records );
	Host_Hexen2HubReset();
	const session = createHexen2Session( 'demo1' );
	session.players[ 0 ].v.health = 31;
	await Host_Hexen2SaveGame( 'offline-delete' );
	globalThis.indexedDB = fakeIndexedDB( records );
	indexedDB.failOpen = true;
	session.players[ 0 ].v.health = 73;
	await Host_Hexen2SaveGame( 'offline-delete' );
	const newer = ( await Host_Hexen2ReadSlot( 'offline-delete' ) ).text;
	const { Host_Hexen2DeleteSlot } = await import( '../src/engine/server/host_cmd.js' );
	const result = await Host_Hexen2DeleteSlot( 'offline-delete' );
	check( ! result.ok && /IndexedDB/.test( result.reason ), 'deletion reports inaccessible IndexedDB' );
	same( ( await Host_Hexen2ReadSlot( 'offline-delete' ) ).text, newer, 'failed deletion retained the fallback' );
	globalThis.indexedDB = fakeIndexedDB( records );
	same( ( await Host_Hexen2ReadSlot( 'offline-delete' ) ).text, newer, 'recovery still returns the newer save' );
	check( ( await Host_Hexen2DeleteSlot( 'offline-delete' ) ).ok, 'delete can be retried when storage recovers' );
	same( await Host_Hexen2ReadSlot( 'offline-delete' ), null, 'retry deleted the slot' );
} );
