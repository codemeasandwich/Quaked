/**
 * @module tests/desktop_prepare
 *
 * The packaged shelf's ordinary ?game= start must reach the real Desktop_Prepare return, without trial settings
 * initialising its locals first (8426b4b9). Only Tauri and browser boundaries are replaced; catalogue validation,
 * pack parsing, mount ordering and LAN initialisation run normally. All game bytes below are synthetic.
 */
import { register } from 'node:module';
import * as hooks from '../src/engine/common/hooks.js';
import { GameCatalogue_Get, GameCatalogue_SetProvider, GameCatalogue_SetDiscovered } from '../src/engine/common/game_catalogue.js';
import { Hexen2_ReadProgHeaderSummary } from '../src/engine/common/hexen2_filesystem.js';

register( new URL( './helpers/desktop_tauri_loader.mjs', import.meta.url ) );
const { Desktop_Prepare } = await import( '../src/platform/desktop.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// Independent PAK writer: a real PACK header, tiny payloads and 64-byte directory records, not a catalogue mock.
function pak( files ) {

	const body = Object.values( files ).reduce( ( n, data ) => n + data.length, 0 );
	const bytes = new Uint8Array( 12 + body + Object.keys( files ).length * 64 ), view = new DataView( bytes.buffer );
	bytes.set( new TextEncoder().encode( 'PACK' ) );
	view.setInt32( 4, 12 + body, true );
	view.setInt32( 8, Object.keys( files ).length * 64, true );
	let offset = 12, directory = 12 + body;
	for ( const [ name, data ] of Object.entries( files ) ) {

		bytes.set( data, offset );
		bytes.set( new TextEncoder().encode( name ), directory );
		view.setInt32( directory + 56, offset, true );
		view.setInt32( directory + 60, data.length, true );
		offset += data.length; directory += 64;

	}
	return bytes;

}

function libraryFixture( id, trial ) {

	const files = new Map(), packs = [];
	const add = ( name, bytes, loose = false ) => {

		const token = `${id}/${name}`, path = `/synthetic/${id === 'hexen2' ? 'Hexen 2/data1' : 'shareware'}/${name}`;
		files.set( token, bytes );
		packs.push( { game: id, name, token, path, bytes: bytes.length, modified: `Tue, 20 Oct 2026 00:00:0${trial ? 1 : 0} GMT`, loose } );

	};
	if ( id === 'shareware' ) {

		add( 'pak0.pak', pak( { 'progs.dat': new Uint8Array( [ 1 ] ), 'maps/start.bsp': new Uint8Array( [ 2 ] ), 'maps/e1m1.bsp': new Uint8Array( [ 3 ] ) } ) );

	} else {

		add( 'pak0.pak', pak( { 'gfx/palette.lmp': new Uint8Array( [ 4 ] ) } ) );
		add( 'pak1.pak', pak( { 'maps/demo1.bsp': new Uint8Array( [ 5 ] ) } ) );
		// Version 6, base-layout CRC 38488, positive counts and in-bounds dummy sections. This is an identity fixture,
		// not executable gamecode; the base catalogue requires its presence, while the demo probe reads its header.
		const progs = new Uint8Array( 133 ), words = [ 6, 38488, 60, 1, 68, 1, 76, 1, 84, 1, 120, 1, 121, 1, 1 ];
		words.forEach( ( word, i ) => new DataView( progs.buffer ).setInt32( i * 4, word, true ) );
		same( Hexen2_ReadProgHeaderSummary( progs ).layout, 'hexen2-base', 'synthetic program identity' );
		add( 'progs.dat', progs, true );

	}
	return { files, library: { root: '/synthetic', packs, discovered: [] } };

}

async function prepare( id, trial = null ) {

	const { files, library } = libraryFixture( id, trial ), calls = [], shelf = [], replaced = [], fetched = [], unexpected = [];
	const native = {
		async invoke( command, args ) {

			calls.push( { command, args } );
			switch ( command ) {

				case 'hexen_log': return null;
				case 'trial_game': return trial;
				case 'trial_autoplay': return true;
				case 'trial_class': return 'necromancer';
				case 'trial_save': return true;
				case 'library_scan': return library;
				case 'library_read': {

					const bytes = files.get( args.token );
					check( bytes, 'only scanned tokens may be read: ' + args.token );
					check( Number.isInteger( args.offset ) && args.offset >= 0 && args.length > 0 && args.length <= 131072, 'bounded library read' );
					return bytes.slice( args.offset, args.offset + args.length );

				}
				default: unexpected.push( command ); throw new Error( 'Unexpected native command: ' + command );

			}

		},
		convertFileSrc: path => 'https://asset.invalid/' + encodeURIComponent( path ),
		async listen( event ) {

			check( [ 'select-game-location', 'lan-menu', 'controller-gyro' ].includes( event ), 'only startup listeners: ' + event );
			return () => {};

		}
	};
	const values = {
		__QUAKED_DESKTOP_TEST__: native,
		__QUAKED_DISTRIBUTION__: { profile: 'desktop', engineHash: 'synthetic-engine', packsForPriority: () => ( { required: [], background: [] } ) },
		// A trial must also override a previously selected shelf game.
		location: { search: '?game=' + ( trial ? 'shareware' : id ), pathname: '/index.html', href: 'https://quaked.invalid/index.html?game=' + ( trial ? 'shareware' : id ) },
		history: { replaceState: ( ...args ) => replaced.push( args ) },
		document: { getElementById: () => null, body: { append() {} }, createElement: () => ( {} ) },
		addEventListener: event => same( event, 'pagehide', 'real LAN initialisation' ),
		fetch: async url => {

			fetched.push( url );
			const entry = library.packs.find( p => native.convertFileSrc( p.path ) === url );
			check( entry, 'fetch only converted, scanned file URLs: ' + url );
			return new Response( files.get( entry.token ) );

		}
	};
	// Desktop_Prepare installs two native menu callbacks as well as consuming these browser globals.
	const previous = Object.fromEntries( [ ...Object.keys( values ), '__QUAKED_SELECT_LOCATION__', '__QUAKED_LAN_MENU__' ]
		.map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) );
	const table = Object.fromEntries( Object.keys( hooks ).filter( name => ! name.startsWith( 'Hooks_' ) ).map( name => [ name, hooks[ name ] ] ) );
	try {

		check( ! Object.hasOwn( globalThis, 'saveTrial' ), 'no earlier trial may seed an implicit saveTrial global' );
		for ( const [ name, value ] of Object.entries( values ) ) Object.defineProperty( globalThis, name, { value, writable: true, configurable: true } );
		hooks.Hooks_Install( { ...table, GameShelf_Show: async ( ...args ) => { shelf.push( args ); } } );
		const result = await Desktop_Prepare();
		const fallback = calls.find( c => c.command === 'hexen_log' && c.args.text.startsWith( 'show shelf ' ) );
		same( shelf.length, 0, 'a valid start must never fall back to GameShelf_Show: ' + ( fallback?.args.text ?? '' ) );
		same( replaced.length, 0, 'a valid start must retain its shelf URL' );
		same( unexpected.length, 0, 'no unexpected native calls: ' + unexpected.join() );
		check( result !== null && typeof result === 'object', 'Desktop_Prepare returns the prepared game' );
		same( result.id, id, 'selected game' );
		same( result.autoStart, trial === id, 'only a trial auto-starts' );
		same( result.saveTrial, trial === id, 'ordinary starts initialise saveTrial to false' );
		same( result.autoPlay, trial === id, 'ordinary starts do not autoplay' );
		same( result.autoClass, trial ? 'necromancer' : 'paladin', 'trial class/default class' );
		same( result.packs.map( p => p.filename ).join(), id === 'shareware' ? 'shareware/pak0.pak' : 'hexen2/loose,hexen2/pak0.pak,hexen2/pak1.pak', 'real packs in mount order' );
		const selected = GameCatalogue_Get().games.find( g => g.id === id );
		check( selected.present && selected.validated && selected.playable, 'real catalogue proved the synthetic game playable' );
		same( fetched.length, library.packs.length, 'each archive/loose file was fully fetched' );
		for ( const pack of result.packs ) {

			check( pack.files.length > 0 && pack.data instanceof ArrayBuffer, 'mounted pack was really parsed' );
			if ( pack.filename.endsWith( '/loose' ) ) same( pack.files.map( f => f.name ).join(), 'progs.dat', 'loose program mounted' );
			else {

				same( new Uint8Array( pack.data ).join(), files.get( pack.filename ).join(), 'mounted archive bytes' );
				const directory = new DataView( pack.data ).getInt32( 4, true );
				check( calls.some( c => c.command === 'library_read' && c.args.token === pack.filename && c.args.offset === directory ), 'catalogue read the real PAK directory' );

			}

		}
		same( calls.filter( c => [ 'trial_autoplay', 'trial_class', 'trial_save' ].includes( c.command ) ).length, trial ? 3 : 0, 'ordinary starts never read trial options' );

	} finally {

		hooks.Hooks_Install( table );
		GameCatalogue_SetProvider( null ); GameCatalogue_SetDiscovered( [] );
		for ( const [ name, descriptor ] of Object.entries( previous ) ) {

			if ( descriptor ) Object.defineProperty( globalThis, name, descriptor );
			else delete globalThis[ name ];

		}

	}

}

Deno.test( 'Desktop_Prepare: ordinary shareware shelf start returns packs and saveTrial false', () => prepare( 'shareware' ) );
Deno.test( 'Desktop_Prepare: ordinary Hexen II shelf start returns loose gamecode and ordered data1 packs', () => prepare( 'hexen2' ) );
Deno.test( 'Desktop_Prepare: a trial start still returns its autoplay, class and save settings', () => prepare( 'hexen2', 'hexen2' ) );
