// The native desktop shelf and a local source checkout (tools/serve.py --game-root) can choose a Hexen II catalogue
// entry the catalogue proved playable; the published web product refuses it with a clear reason. A source checkout
// fetches the edition's packs and loose files in the desktop app's mount order. Quake's own choices keep their
// behaviour.
import { GameSelection_Startable, GameSelection_UrlChoice, GameSelection_FetchLibraryGame, GameSelection_LibraryMusicSource } from '../src/engine/common/game_selection.js';
import { Hexen2_AttractDemos } from '../src/engine/common/hexen2_profile.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'Hexen II is startable in the desktop app and a source checkout, never the web product', () => {

	const game = { id: 'hexen2', kind: 'hexen2', present: true, validated: true, playable: true };
	const previous = globalThis.__QUAKED_DISTRIBUTION__;
	try {

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'desktop' };
		const desktop = GameSelection_Startable( game, { strict: true } );
		check( desktop.ok, 'desktop accepted the playable Hexen entry: ' + desktop.refusal );
		const missing = GameSelection_Startable( { ...game, validated: false }, { strict: true } );
		check( missing.ok === false, 'a not-validated Hexen entry is refused' );

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'web' };
		const web = GameSelection_Startable( game, { strict: true } );
		same( web.ok, false, 'the web product refuses Hexen' );
		same( web.refusal, 'needs the native desktop app', 'the refusal names the native app' );
		const shareware = GameSelection_Startable( { id: 'shareware', present: true }, {} );
		same( shareware.ok, true, 'the shareware still starts in the web product' );

		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'source' };
		check( GameSelection_Startable( game, {} ).ok, 'a source checkout starts the playable Hexen entry' );
		same( GameSelection_UrlChoice( '?game=hexen2-portals' ), 'hexen2-portals', 'a source checkout accepts ?game=hexen2-portals' );
		globalThis.__QUAKED_DISTRIBUTION__ = { profile: 'web' };
		same( GameSelection_UrlChoice( '?game=hexen2' ), null, 'the web product ignores ?game=hexen2' );

	} finally { globalThis.__QUAKED_DISTRIBUTION__ = previous; }

} );

Deno.test( 'a source checkout fetches a Hexen II edition in the desktop mount order', async () => {

	const catalogue = { games: [
		{ id: 'hexen2', name: 'Hexen II', present: true, folder: 'games/Hexen 2/data1', packs: [ { name: 'pak0.pak' }, { name: 'pak1.pak' } ], loose: [ 'progs.dat', 'strings.txt', 'music/casa1.ogg' ] },
		{ id: 'hexen2-portals', name: 'Hexen II: Portal of Praevus', present: true, folder: 'games/Hexen 2/portals', packs: [ { name: 'pak3.pak' } ], loose: [ 'progs.dat', 'puzzles.txt' ] }
	] };
	const fetched = [], loose = [];
	const fetchPak = async ( url, name ) => { fetched.push( url ); return { filename: name }; };
	const fetchFile = async url => { loose.push( url ); return new Uint8Array( 1 ); };
	const loosePack = ( name, files ) => ( { filename: name, files: files.map( f => f.name ) } );

	const portal = await GameSelection_FetchLibraryGame( 'hexen2-portals', fetchPak, fetchFile, loosePack, catalogue );
	same( portal.map( p => p.filename ).join(), 'hexen2/loose,hexen2/pak0.pak,hexen2/pak1.pak,hexen2-portals/loose,hexen2-portals/pak3.pak', 'Portal mounts the base game\'s loose files and packs, then its own' );
	same( portal[ 3 ].files.join(), 'progs.dat,puzzles.txt', 'Portal\'s own loose files form its loose pack, above the base game\'s' );
	same( fetched[ 0 ], 'games/Hexen%202/data1/pak0.pak', 'folders are URL-encoded as the catalogue probes them' );

	loose.length = 0;
	const base = await GameSelection_FetchLibraryGame( 'hexen2', fetchPak, fetchFile, loosePack, catalogue );
	same( base.map( p => p.filename ).join(), 'hexen2/loose,hexen2/pak0.pak,hexen2/pak1.pak', 'the base game mounts its loose files under its packs' );
	check( ! loose.some( url => url.includes( 'music' ) ), 'music is not mounted (it is streamed): ' + loose.join() );

	let refused = '';
	try { await GameSelection_FetchLibraryGame( 'hexen2-portals', fetchPak, fetchFile, loosePack, { games: [ catalogue.games[ 1 ] ] } ); } catch ( error ) { refused = error.message; }
	check( /Hexen II is not installed/.test( refused ), 'Portal without its base game is refused: ' + refused );

} );

Deno.test( 'a source checkout streams the library\'s loose music in the desktop edition order', async () => {

	const catalogue = { games: [
		{ id: 'hexen2', present: true, folder: 'games/Hexen 2/data1' },
		{ id: 'hexen2-portals', present: true, folder: 'games/Hexen 2/portals' }
	] };
	const served = new Set( [ 'games/Hexen%202/data1/music/casa1.ogg', 'games/Hexen%202/portals/music/casa1.ogg', 'games/Hexen%202/portals/music/tulku1.ogg', 'games/Hexen%202/data1/music/tulku1.ogg' ] );
	const asked = [];
	const fetch = async ( url, init ) => { asked.push( init?.method + ' ' + url ); return { ok: served.has( url ), headers: { get: () => 'audio/ogg' } }; };
	const portal = GameSelection_LibraryMusicSource( 'hexen2-portals', { catalogue, fetch } );
	same( await portal( 'music/tulku1.ogg' ), 'games/Hexen%202/portals/music/tulku1.ogg', 'Portal\'s own tracks come from its folder first' );
	same( await portal( 'music/casa1.ogg' ), 'games/Hexen%202/data1/music/casa1.ogg', 'other tracks come from the base game first' );
	same( await portal( 'music/egyp3.ogg' ), null, 'a track no folder has is null' );
	same( await portal( 'midi/casa1.mid' ), null, 'only music/ conversions are offered' );
	check( asked.every( line => line.startsWith( 'HEAD ' ) ), 'files are probed, not downloaded' );
	const base = GameSelection_LibraryMusicSource( 'hexen2', { catalogue, fetch } );
	same( await base( 'music/casa1.ogg' ), 'games/Hexen%202/data1/music/casa1.ogg', 'the base game streams its own conversion' );

} );

Deno.test( 'Hexen II\'s title demos are the native demos the installation has, in order', () => {

	const have = names => path => names.includes( path ) ? {} : null;
	same( Hexen2_AttractDemos( have( [ 'demo3.dem', 'demo1.dem', 'demo2.dem' ] ) ).join(), 'demo1,demo2,demo3', 'all three, in play order' );
	same( Hexen2_AttractDemos( have( [ 'demo2.dem' ] ) ).join(), 'demo2', 'only those present' );
	same( Hexen2_AttractDemos( have( [] ) ).length, 0, 'none for the shareware demo, which keeps its menu' );

} );
