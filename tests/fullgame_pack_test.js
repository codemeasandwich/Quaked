// Public pack and menu controls. Owned game bytes are read from the local
// installation only; they are never copied into a fixture or redistributed.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as pak from '../src/pak.js';
import * as cmd from '../src/cmd.js';
import * as keys from '../src/keys.js';
import * as menu from '../src/menu.js';
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const hash = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const buffer = bytes => bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength );
const entry = ( pack, name ) => {
	const file = pack.files.find( file => file.name === name );
	return file ? new Uint8Array( pack.data, file.filepos, file.filelen ) : null;
};

Deno.test( 'missing or malformed owned optional archives leave bundled-only availability intact', async () => {
	check( pak.COM_FindFile( 'maps/e2m1.bsp' ) === null, 'E2M1 absent before owned mount' );
	const old = globalThis.Deno;
	const oldDocument = Object.getOwnPropertyDescriptor( globalThis, 'document' );
	const body = { innerHTML: 'native game remains intact' };
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { body } } );
	try {
		for ( const mode of [ 'missing', 'html', 'directory', 'alignment', 'payload', 'count' ] ) {
			const bytes = new Uint8Array( mode === 'count' ? 12 + 2049 * 64 : 76 );
			bytes.set( new TextEncoder().encode( mode === 'html' ? '<html' : 'PACK' ) );
			const view = new DataView( bytes.buffer );
			view.setInt32( 4, mode === 'directory' ? 1000 : 12, true );
			view.setInt32( 8, mode === 'count' ? 2049 * 64 : mode === 'alignment' ? 63 : 64, true );
			bytes.set( new TextEncoder().encode( 'maps/e2m1.bsp' ), 12 );
			view.setInt32( 68, 1000, true );
			view.setInt32( 72, 5, true );
			globalThis.Deno = { ...old, readFile: async () => {
				if ( mode === 'missing' ) throw Error( 'controlled missing file' );
				return bytes;
			} };
			check( await pak.COM_FetchOptionalPak( 'resources/id1/pak0.pak', 'owned-control' ) === null, mode + ' declines optional pack' );
			check( pak.COM_FindFile( 'maps/e2m1.bsp' ) === null, mode + ' installs no partial content' );
			check( body.innerHTML === 'native game remains intact', mode + ' rejection cannot mutate the game DOM' );
		}
	} finally {
		globalThis.Deno = old;
		if ( oldDocument ) Object.defineProperty( globalThis, 'document', oldDocument ); else delete globalThis.document;
	}
} );

Deno.test( 'owned pack supplies exact E2M1 while all bundled overlapping files retain precedence in both modes', () => {
	const ownedPath = process.env.QUAKED_OWNED_PAK;
	check( ownedPath, 'Set QUAKED_OWNED_PAK to the read-only owned archive' );
	const owned = pak.COM_LoadPackFile( 'owned-local', buffer( readFileSync( ownedPath ) ) );
	const bundled = pak.COM_LoadPackFile( 'pak0.pak', buffer( readFileSync( new URL( '../pak0.pak', import.meta.url ) ) ) );
	check( entry( owned, 'maps/e2m1.bsp' ) && ! entry( bundled, 'maps/e2m1.bsp' ), 'actual native corpus gap' );
	pak.COM_AddPack( owned );
	pak.COM_AddPack( bundled );
	for ( const newer of [ false, true ] ) {
		pak.COM_SetNewerActive( newer );
		check( hash( pak.COM_FindFile( 'maps/E2M1.bsp' ).data ) === hash( entry( owned, 'maps/e2m1.bsp' ) ), 'exact owned world in both modes' );
		for ( const file of bundled.files ) check( hash( pak.COM_FindFile( file.name ).data ) === hash( entry( bundled, file.name ) ), 'bundled identity retained: ' + file.name );
	}
	pak.COM_SetNewerActive( false );
	console.log( 'FULLGAME_PACK_PROOF ' + JSON.stringify( { bundledFiles: bundled.files.length, ownedFiles: owned.files.length, e2m1Sha256: hash( entry( owned, 'maps/e2m1.bsp' ) ), bundledProgsSha256: hash( entry( bundled, 'progs.dat' ) ) } ) );
} );

Deno.test( 'existing Level Select keyboard controls launch supplied E2M1 in Newer and Classic modes', () => {
	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400 } } );
	try {
		let dest = keys.key_game;
		const commands = [];
		cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
		for ( const name of [ 'r_hdr', 'map', 'maxplayers' ] ) cmd.Cmd_AddCommand( name, () => commands.push( [ name, cmd.Cmd_Argv( 1 ) ] ) );
		menu.M_SetExternals( { key_dest_set: value => { dest = value; }, key_dest_get: () => dest, cls: { demonum: -1 }, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {}, IN_RequestPointerLock: () => {} } );
		cmd.Cmd_ExecuteString( 'menu_singleplayer' );
		for ( let i = 0; i < 4; i ++ ) menu.M_Keydown( keys.K_DOWNARROW );
		menu.M_Keydown( keys.K_ENTER );
		check( menu.m_state === menu.m_levelselect, 'existing public menu opens' );
		// The menu opens on the first level of its default episode (Episode 1). Go up to the Episode row, step to Episode 2
		// (the next one), come back down to its first level, E2M1, and start it.
		menu.M_Keydown( keys.K_UPARROW ); menu.M_Keydown( keys.K_RIGHTARROW ); menu.M_Keydown( keys.K_DOWNARROW );
		menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute();
		check( commands.some( ( [ name, value ] ) => name === 'map' && value === 'e2m1' ), 'Newer queues real E2M1' );
		check( commands.some( ( [ name, value ] ) => name === 'r_hdr' && value === '1' ), 'Newer mode preserved' );
		commands.length = 0;
		// The cursor is on E2M1 and the episode is remembered. Go up to the mode row, switch to Classic, and come back down.
		for ( let i = 0; i < 3; i ++ ) menu.M_Keydown( keys.K_UPARROW );
		menu.M_Keydown( keys.K_ENTER );
		for ( let i = 0; i < 3; i ++ ) menu.M_Keydown( keys.K_DOWNARROW );
		menu.M_Keydown( keys.K_ENTER ); cmd.Cbuf_Execute();
		check( commands.some( ( [ name, value ] ) => name === 'map' && value === 'e2m1' ), 'Classic queues same real E2M1' );
		check( commands.some( ( [ name, value ] ) => name === 'r_hdr' && value === '0' ), 'Classic mode preserved' );
	} finally {
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow );
		else delete globalThis.window;
	}
} );
