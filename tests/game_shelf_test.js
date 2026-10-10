// The game shelf (card [M1]; owner direction 10 Oct 2026): each installed game's box from its downloaded art, with
// placeholders (the box's text) for faces that have no image; a folder the player adds read for its front, side and
// back images; a game's own URL (?game=<id>) choosing the game for that page, over the choice kept in the browser,
// which the shelf starts on. The shelf on the page (3-D boxes, cycling, turning over, the folder picker) is the
// browser trial's (docs/game-shelf-2026-10-10.md).
import { existsSync } from 'node:fs';
import { GAME_BOXES, GameShelf_Box, GameShelf_ReadFolder, GameShelf_Url } from '../src/newer/ui/game_shelf.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';
import * as selection from '../src/engine/common/game_selection.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'every box image named is in the repository, and each names a known game', () => {
	for ( const [ id, faces ] of Object.entries( GAME_BOXES ) ) {
		check( GAME_CATALOGUE_GAMES.some( g => g.id === id ), 'a known game: ' + id );
		for ( const face of [ 'front', 'back', 'spine' ] ) if ( faces[ face ] ) check( existsSync( new URL( '../' + faces[ face ], import.meta.url ) ), `${id} ${face}: ${faces[ face ]}` );
	}
	check( existsSync( new URL( '../assets/boxes/SOURCES.md', import.meta.url ) ), 'the art\'s sources are recorded' );
} );

Deno.test( 'a game\'s box: its own art, placeholders where it has none, and whether it plays', () => {
	const quake = GameShelf_Box( { id: 'quake', name: 'Quake', kind: 'base', playable: true } );
	check( quake.front && quake.back && quake.spine && quake.playable, 'Quake: front, back, spine, playable' );
	same( GameShelf_Box( { id: 'shareware', name: 'Quake (shareware)', kind: 'shareware', playable: true } ).sticker, 'Shareware', 'the shareware wears a sticker on Quake\'s box' );
	const scourge = GameShelf_Box( { id: 'hipnotic', name: 'Scourge of Armagon', kind: 'mission', playable: false, reason: 'not yet' } );
	check( scourge.front && scourge.back && scourge.spine === null, 'Scourge: front and back, a printed spine' );
	same( scourge.playable, false, 'not playable yet' ); same( scourge.text, 'A Quake mission pack', 'its printed text' );
	const ad = GameShelf_Box( { id: 'ad', name: 'Arcane Dimensions', kind: 'addon' } );
	check( ad.front === null && ad.back === null && ad.spine === null, 'Arcane Dimensions: every face a placeholder (it was never boxed)' );
	same( ad.text, 'A Quake add-on', 'with its text' );
} );

Deno.test( 'a picked folder: its name and its front, side (or spine) and back images, whatever their type', () => {
	const files = [ 'My Mod/Front.PNG', 'My Mod/spine.webp', 'My Mod/back.jpeg', 'My Mod/pak0.pak', 'My Mod/readme.txt', 'My Mod/maps/front.png', 'My Mod/side.png' ].map( p => ( { name: p.split( '/' ).pop(), webkitRelativePath: p } ) );
	const read = GameShelf_ReadFolder( files );
	same( read.name, 'My Mod', 'the folder\'s name' );
	same( read.files.front.webkitRelativePath, 'My Mod/Front.PNG', 'its front (any case and image type)' );
	same( read.files.side.webkitRelativePath, 'My Mod/spine.webp', 'its side: spine counts, the first found' );
	same( read.files.back.webkitRelativePath, 'My Mod/back.jpeg', 'its back' );
	same( read.paks.join(), 'pak0.pak', 'its packs' );
	const bare = GameShelf_ReadFolder( [ { name: 'back.png' } ], 'Picked' );
	same( bare.name, 'Picked', 'a directory handle\'s name' ); check( ! bare.files.front && bare.files.back, 'only a back: the front will be a placeholder' );
	same( GameShelf_ReadFolder( [] ).name, 'Your game', 'an empty folder still makes a box' );
	same( GameShelf_Url( 'quake', 'https://example.org/index.html' ), 'https://example.org/index.html?game=quake', 'a game\'s URL' );
} );

Deno.test( 'a game\'s URL chooses that page\'s game over the kept choice; the shelf starts on the kept one', () => {
	const store = new Map();
	const saved = { storage: Object.getOwnPropertyDescriptor( globalThis, 'localStorage' ), location: Object.getOwnPropertyDescriptor( globalThis, 'location' ) };
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: { getItem: k => store.get( k ) ?? null, setItem: ( k, v ) => store.set( k, String( v ) ) } } );
	try {
		same( selection.GameSelection_UrlChoice( '?game=quake' ), 'quake', 'the URL names Quake' );
		same( selection.GameSelection_UrlChoice( '?game=ad' ), null, 'a game that cannot be chosen is ignored' );
		same( selection.GameSelection_UrlChoice( '?game=mg1' ), 'mg1', 'Dimension of the Machine can be' );
		same( selection.GameSelection_UrlChoice( '?game=dopa' ), 'dopa', 'an episode that runs can be' );
		same( selection.GameSelection_UrlChoice( '?game=hipnotic' ), 'hipnotic', 'a mission pack can be' );
		same( selection.GameSelection_Remember( 'shareware' ), true, 'the shelf keeps a choice' ); same( selection.GameSelection_Kept(), 'shareware', 'and starts on it' );
		same( selection.GameSelection_Remember( 'ad' ), false, 'not one that cannot be played' );
		Object.defineProperty( globalThis, 'location', { configurable: true, value: { search: '?game=quake' } } );
		same( selection.GameSelection_Current(), 'quake', 'on ?game=quake, Quake runs, whatever is kept' );
		same( selection.GameSelection_SavePrefix(), 'quake_save_', 'with Quake\'s saves' );
		same( selection.GameSelection_Kept(), 'shareware', 'the kept choice is unchanged' );
		Object.defineProperty( globalThis, 'location', { configurable: true, value: { search: '' } } );
		same( selection.GameSelection_Current(), 'shareware', 'with no URL choice, the kept one' );
	} finally {
		for ( const [ name, d ] of Object.entries( { localStorage: saved.storage, location: saved.location } ) ) if ( d ) Object.defineProperty( globalThis, name, d ); else delete globalThis[ name ];
	}
} );

Deno.test( 'on a game\'s own URL the game command switches by going to the new game\'s URL', async () => {
	const store = new Map(), went = [];
	const saved = { storage: Object.getOwnPropertyDescriptor( globalThis, 'localStorage' ), location: Object.getOwnPropertyDescriptor( globalThis, 'location' ) };
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: { getItem: k => store.get( k ) ?? null, setItem: ( k, v ) => store.set( k, String( v ) ) } } );
	Object.defineProperty( globalThis, 'location', { configurable: true, value: { search: '?game=quake', href: 'http://host/index.html?game=quake', assign: url => went.push( url ), reload: () => went.push( 'reload' ) } } );
	try {
		const result = await selection.GameSelection_Select( 'shareware' );
		same( result.ok, true, 'the switch is kept: ' + result.reason );
		same( selection.GameSelection_Kept(), 'shareware', 'kept' );
		same( went.join(), 'http://host/index.html?game=shareware', 'and the page goes to the shareware\'s URL (a reload would keep ?game=quake)' );
	} finally {
		for ( const [ name, d ] of Object.entries( { localStorage: saved.storage, location: saved.location } ) ) if ( d ) Object.defineProperty( globalThis, name, d ); else delete globalThis[ name ];
	}
} );

Deno.test( 'a local-play player window opens on its host\'s game', async () => {
	const { LocalPlay_PlayerUrl } = await import( '../src/engine/client/local_play.js' );
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'location' );
	try {
		Object.defineProperty( globalThis, 'location', { configurable: true, value: { search: '?game=shareware' } } );
		same( LocalPlay_PlayerUrl( 2, 'abc', 'http://host/index.html' ), 'http://host/index.html?window=abc&player=2&game=shareware', 'the host\'s game goes with the window' );
		Object.defineProperty( globalThis, 'location', { configurable: true, value: { search: '' } } );
		same( LocalPlay_PlayerUrl( 3, 'abc', 'http://host/index.html' ), 'http://host/index.html?window=abc&player=3', 'none chosen: as before' );
	} finally {
		if ( saved ) Object.defineProperty( globalThis, 'location', saved ); else delete globalThis.location;
	}
} );
