// The game shelf (card [M1]; owner direction 10 Oct 2026): each installed game's box from its downloaded art, with
// placeholders (the box's text) for faces that have no image; a folder the player adds read for its front, side and
// back images; a game's own URL (?game=<id>) choosing the game for that page, over the choice kept in the browser,
// which the shelf starts on. The shelf on the page (3-D boxes, cycling, turning over, the folder picker) is the
// browser trial's (docs/game-shelf-2026-10-10.md).
import { existsSync } from './helpers/resource_fs.mjs';
import { GAME_BOXES, GameShelf_Box, GameShelf_ReadFolder, GameShelf_Url } from '../src/newer/ui/game_shelf.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';
import * as selection from '../src/engine/common/game_selection.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'every box image exists and belongs to a catalogue game or an explicitly approved discovered title', () => {
	for ( const [ id, faces ] of Object.entries( GAME_BOXES ) ) {
		check( GAME_CATALOGUE_GAMES.some( g => g.id === id ) || [ 'mod_alkaline', 'mod_hexen_2', 'mod_hexen_2_portal_of_praevus', 'mod_hexen_2_shareware', 'mod_quaked', 'mod_the_immortal_lock', 'mod_tremor' ].includes( id ), 'a known game or explicitly approved discovered title: ' + id );
		for ( const face of [ 'front', 'back', 'spine' ] ) if ( faces[ face ] ) check( existsSync( new URL( '../' + faces[ face ], import.meta.url ) ), `${id} ${face}: ${faces[ face ]}` );
	}
	check( existsSync( new URL( '../assets/boxes/SOURCES.md', import.meta.url ) ), 'the art\'s sources are recorded' );
} );

Deno.test( 'a game\'s box: its own art, placeholders where it has none, and whether it plays', () => {
	const quake = GameShelf_Box( { id: 'quake', name: 'Quake', kind: 'base', playable: true } );
	check( quake.front && quake.back && quake.spine && quake.playable, 'Quake: front, back, spine, playable' );
	same( GameShelf_Box( { id: 'shareware', name: 'Quake (shareware)', kind: 'shareware', playable: true } ).sticker, 'Shareware', 'the shareware wears a sticker on Quake\'s box' );
	const scourge = GameShelf_Box( { id: 'hipnotic', name: 'Scourge of Armagon', kind: 'mission', playable: false, reason: 'not yet' } );
	check( scourge.front && scourge.back, 'Scourge retains its front and back' ); same( scourge.spine, 'assets/boxes/hipnotic/spine.webp', 'Scourge now ships its imported spine' );
	same( scourge.playable, false, 'not playable yet' ); same( scourge.text, 'A Quake mission pack', 'its printed text' );
	const ad = GameShelf_Box( { id: 'ad', name: 'Arcane Dimensions', kind: 'addon' } );
	check( ad.front && ad.back && ad.spine, 'Arcane Dimensions: supplied owner artwork now provides all three faces' );
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
		same( selection.GameSelection_UrlChoice( '?game=doom' ), null, 'a name that is no game is ignored' );
		same( selection.GameSelection_UrlChoice( '?game=ad' ), 'ad', 'an add-on can be chosen (the catalogue says whether it plays)' );
		same( selection.GameSelection_UrlChoice( '?game=mod_my_mod' ), 'mod_my_mod', 'so can one found by its folder' );
		same( selection.GameSelection_UrlChoice( '?game=mg1' ), 'mg1', 'Dimension of the Machine can be' );
		same( selection.GameSelection_UrlChoice( '?game=dopa' ), 'dopa', 'an episode that runs can be' );
		same( selection.GameSelection_UrlChoice( '?game=hipnotic' ), 'hipnotic', 'a mission pack can be' );
		same( selection.GameSelection_Remember( 'shareware' ), true, 'the shelf keeps a choice' ); same( selection.GameSelection_Kept(), 'shareware', 'and starts on it' );
		same( selection.GameSelection_Remember( 'doom' ), false, 'not a name that is no game' );
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

Deno.test( 'native local artwork overlays only supplied faces and preserves bundled art and selection authority', () => {
 const images = Object.freeze( { front: 'asset://localhost/%2Fchosen%2FQuake%20shareware%2Fcover.png', spine: 'asset://localhost/%2Fchosen%2FQuake%20shareware%2Fside.png' } );
 const game = Object.freeze( { id: 'shareware', name: 'Quake (shareware)', kind: 'shareware', playable: false, reason: 'missing archive', images } );
 const box = GameShelf_Box( game );
 same( box.front, images.front, 'native local front is used without rewriting its asset URL' ); same( box.spine, images.spine, 'native side is exposed as the spine' );
 same( box.back, GAME_BOXES.shareware.back, 'a missing local back preserves the bundled back independently' ); same( box.sticker, 'Shareware', 'bundled shareware identity survives local art' );
 same( box.playable, false, 'artwork cannot authorize a missing or damaged game' ); same( box.reason, 'missing archive', 'validation reason survives' ); same( game.images, images, 'borrowed metadata is not mutated' );
 const explicit = GameShelf_Box( game, { back: 'blob:explicit-back' } );
 same( explicit.front, GAME_BOXES.shareware.front, 'the existing explicit image argument remains authoritative' ); same( explicit.back, 'blob:explicit-back', 'explicit local back supplied' );
 same( explicit.spine, GAME_BOXES.shareware.spine, 'explicit partial overrides still retain bundled faces' );
} );

Deno.test( 'front and spine canonical image names beat cover and side aliases while unboxed games retain printed missing faces', () => {
 const box = GameShelf_Box( { id: 'mod_local', name: 'Local add-on', kind: 'addon', playable: true, images: { front: 'local-front', cover: 'local-cover', spine: 'local-spine', side: 'local-side' } } );
 same( box.front, 'local-front', 'canonical front wins' ); same( box.spine, 'local-spine', 'canonical spine wins' ); same( box.back, null, 'an unboxed game still prints its missing back' );
 const aliases = GameShelf_Box( { id: 'quake', name: 'Quake', kind: 'base', playable: true, images: { cover: 'local-cover', side: 'local-side' } } );
 same( aliases.front, 'local-cover', 'cover is a local front before bundled art' ); same( aliases.spine, 'local-side', 'side is a local spine before bundled art' ); same( aliases.back, GAME_BOXES.quake.back, 'unprovided back is bundled' );
 const unrelated = GameShelf_Box( { id: 'quake', name: 'Quake', playable: true, images: { preview: 'ignored', front: null } } );
 same( unrelated.front, GAME_BOXES.quake.front, 'null local faces retain fallback' ); same( unrelated.back, GAME_BOXES.quake.back, 'unrecognized image keys cannot replace a face' );
} );

Deno.test( 'folder face selection is independent of enumeration order and never promotes nested or unsupported images', () => {
 const paths = [ 'Picked/cover.png', 'Picked/side.png', 'Picked/Front.WEBP', 'Picked/SPINE.AVIF', 'Picked/back.GIF', 'Picked/maps/front.jpg', 'Picked/nested/spine.png', 'Picked/front.svg', 'Picked/back.js', 'Picked/maps/pak1.pak', 'Picked/pak0.pak' ];
 const files = paths.map( path => ( { name: path.split( '/' ).pop(), webkitRelativePath: path } ) );
 const original = files.map( file => file.webkitRelativePath ).join();
 for ( const order of [ files, [ ...files ].reverse(), [ ...files.slice( 4 ), ...files.slice( 0, 4 ) ] ] ) {
  const read = GameShelf_ReadFolder( order );
  same( read.files.front.webkitRelativePath, 'Picked/Front.WEBP', 'canonical front wins even after cover' ); same( read.files.side.webkitRelativePath, 'Picked/SPINE.AVIF', 'canonical spine wins even after side' ); same( read.files.back.webkitRelativePath, 'Picked/back.GIF', 'supported top-level back' ); same( read.paks.join(), 'pak0.pak', 'nested packs are not collected' );
 }
 same( files.map( file => file.webkitRelativePath ).join(), original, 'input enumeration remains untouched' );
 const cover = GameShelf_ReadFolder( [ { name: 'Cover.JPEG' }, { name: 'side.webp' } ], 'Selected' );
 same( cover.files.front.name, 'Cover.JPEG', 'cover-only local libraries get a front' ); same( cover.files.side.name, 'side.webp', 'side-only libraries get a spine' ); check( ! cover.files.back, 'missing back stays absent for the normal fallback' );
} );

Deno.test( 'folder image type ties use native scan priority without allowing an alias to beat a canonical face', () => {
 const files = [ 'cover.png', 'front.avif', 'front.gif', 'front.webp', 'front.jpeg', 'front.jpg', 'Front.PNG', 'side.png', 'spine.avif', 'spine.jpg', 'Spine.PNG', 'back.avif', 'back.jpeg', 'back.png' ].map( name => ( { name } ) );
 for ( const order of [ files, [ ...files ].reverse() ] ) {
  const read = GameShelf_ReadFolder( order, 'Typed art' );
  same( read.files.front.name, 'Front.PNG', 'PNG is first among canonical front types' ); same( read.files.side.name, 'Spine.PNG', 'PNG is first among canonical spine types' ); same( read.files.back.name, 'back.png', 'back has the same extension order' );
 }
 const aliases = GameShelf_ReadFolder( [ { name: 'cover.png' }, { name: 'front.avif' }, { name: 'side.png' }, { name: 'spine.avif' } ] );
 same( aliases.files.front.name, 'front.avif', 'canonical front outranks preferred alias image type' ); same( aliases.files.side.name, 'spine.avif', 'canonical spine outranks preferred alias image type' );
} );


Deno.test( 'imported defaults work without local files and never authorize an unsupported title', () => {
 const ids = [ 'shareware', 'quake', 'hipnotic', 'rogue', 'mg1', 'malice', 'xmen', 'aopfm_v2', 'quoth', 'mod_quaked', 'mod_hexen_2', 'mod_hexen_2_portal_of_praevus', 'dopa', 'ad', 'dawn', 'mod_alkaline', 'mod_tremor', 'mod_hexen_2_shareware', 'mod_the_immortal_lock' ];
 const expected = Object.fromEntries( ids.map( id => [ id, Object.fromEntries( [ 'front', 'back', 'spine' ].map( face => [ face, id === 'mod_hexen_2' && face === 'back' ? null : `assets/boxes/${id}/${face}.webp` ] ) ) ] ) );
 expected.mod_q30a1024 = { front: null, back: null, spine: null };
 for ( const [ id, faces ] of Object.entries( expected ) ) {
  const box = GameShelf_Box( { id, name: id, playable: false, images: {}, reason: 'No supported game files found' } );
  for ( const [ face, path ] of Object.entries( faces ) ) same( box[ face ], path, id + ' shipped ' + face + ' without local artwork' );
  same( box.playable, false, id + ' artwork does not grant startability' );
 }
 const override = GameShelf_Box( { id: 'mod_hexen_2_portal_of_praevus', name: 'Portal of Praevus', playable: false, images: { back: 'asset://localhost/local-back.webp' } } );
 same( override.back, 'asset://localhost/local-back.webp', 'one local face overrides the shipped default' ); same( override.front, expected.mod_hexen_2_portal_of_praevus.front, 'front remains shipped' ); same( override.spine, expected.mod_hexen_2_portal_of_praevus.spine, 'spine remains shipped' ); same( override.playable, false, 'local overrides do not add Hexen II compatibility' );
} );

Deno.test( 'artwork-only discovered titles use a neutral game label without implying Quake compatibility', () => {
 for ( const id of [ 'mod_alkaline', 'mod_hexen_2', 'mod_hexen_2_portal_of_praevus', 'mod_hexen_2_shareware', 'mod_quaked', 'mod_the_immortal_lock', 'mod_tremor' ] ) {
  const box = GameShelf_Box( { id, name: id, kind: 'unavailable', playable: false, images: {}, reason: 'No supported game files found' } );
  same( box.text, 'Game', id + ' has a neutral display-only label' ); same( box.playable, false, id + ' cannot start through artwork' ); same( box.reason, 'No supported game files found', id + ' preserves its missing-files explanation' ); check( !! box.front, id + ' still displays shipped artwork' );
 }
} );


Deno.test( 'current Quoth and Machine faces are active defaults while the screenshot collage is never a box front', () => {
 const quoth = GameShelf_Box( { id: 'quoth', name: 'Quoth', playable: true, images: {} } );
 same( quoth.front, 'assets/boxes/quoth/front.webp', 'the real Quoth front is now shipped' );
 const machine = GameShelf_Box( { id: 'mg1', name: 'Dimension of the Machine', playable: true, images: {} } );
 for ( const face of [ 'front', 'back', 'spine' ] ) same( machine[ face ], 'assets/boxes/mg1/' + face + '.webp', 'the standardized Machine ' + face + ' is active' );
 const collage = GameShelf_Box( { id: 'mod_q30a1024', name: 'q30a1024', playable: true, images: {} } );
 for ( const face of [ 'front', 'back', 'spine' ] ) same( collage[ face ], null, 'the q30 collage has no runtime ' + face + ' role' );
 same( collage.playable, true, 'retiring artwork does not change the game validation result' );
} );
