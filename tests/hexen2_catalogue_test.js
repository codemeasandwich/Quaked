// Hexen II in the public game catalogue (plan section 3): the selected data1 directory and its portals sibling are
// probed through the existing catalogue, loose gamecode/strings/config are recognised, pak0..pak9 are probed across
// gaps, and the shelf's found/validated/playable states are honest. The genuine demo is advertised only when its
// archive signature and version-6 base-layout program match the pinned identities.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from './helpers/resource_fs.mjs';
import { GameCatalogue_Refresh, GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

function pack( names ) {

	const body = Buffer.alloc( names.length * 4, 7 ), dir = Buffer.alloc( names.length * 64 );
	names.forEach( ( n, i ) => { dir.write( n, i * 64, 'latin1' ); dir.writeInt32LE( 12 + i * 4, i * 64 + 56 ); dir.writeInt32LE( 4, i * 64 + 60 ); } );
	const header = Buffer.alloc( 12 ); header.write( 'PACK', 0, 'latin1' ); header.writeInt32LE( 12 + body.length, 4 ); header.writeInt32LE( dir.length, 8 );
	return Buffer.concat( [ header, body, dir ] );

}

const files = new Map( [
	[ '/games/Hexen 2/data1/pak0.pak', pack( [ 'gfx/palette.lmp', 'maps/demo1.bsp', 'gfx/hpchain.lmp' ] ) ],
	[ '/games/Hexen 2/data1/progs.dat', Buffer.from( 'hexen gamecode' ) ],
	[ '/games/Hexen 2/data1/strings.txt', Buffer.from( 'strings' ) ],
	[ '/games/Hexen 2/data1/hexen.rc', Buffer.from( 'exec autoexec.cfg' ) ],
	[ '/games/Hexen 2/portals/pak0.pak', pack( [ 'maps/keep1.bsp', 'maps/keep2.bsp', 'gfx/palette.lmp' ] ) ],
	[ '/games/Hexen 2/portals/progs.dat', Buffer.from( 'portal gamecode' ) ],
	[ '/games/Hexen 2/portals/strings.txt', Buffer.from( 'portal strings' ) ],
	[ '/games/Hexen 2 Demo/pak0.pak', pack( [ 'maps/demo1.bsp', 'gfx/palette.lmp' ] ) ],
	[ '/games/Hexen 2 Demo/progs.dat', Buffer.from( 'demo gamecode' ) ],
	[ '/games/Hexen 2 Demo/strings.txt', Buffer.from( 'demo strings' ) ],
	[ '/bad/games/Hexen 2/data1/pak0.pak', pack( [ 'maps/demo1.bsp' ] ) ],
	[ '/bad/games/Hexen 2/data1/progs.dat', Buffer.from( 'hexen gamecode' ) ]
] );
// ten packs, with the required map in the last one and a gap-free run: Hexen probes pak0..pak9, not Quake's five
for ( let n = 0; n < 10; n ++ ) files.set( `/ten/resources/hexen2/data1/pak${n}.pak`, pack( n === 9 ? [ 'gfx/palette.lmp', 'maps/demo1.bsp' ] : [ 'gfx/palette.lmp' ] ) );
files.set( '/portal3/games/Hexen 2/data1/pak0.pak', pack( [ 'gfx/palette.lmp', 'maps/demo1.bsp' ] ) );
files.set( '/portal3/games/Hexen 2/data1/progs.dat', Buffer.from( 'hexen gamecode' ) );
files.set( '/portal3/games/Hexen 2/portals/pak3.pak', pack( [ 'maps/keep1.bsp', 'maps/keep2.bsp' ] ) );
files.set( '/portal3/games/Hexen 2/portals/progs.dat', Buffer.from( 'portal gamecode' ) );
files.set( '/ten/resources/hexen2/data1/progs.dat', Buffer.from( 'hexen gamecode' ) );

// The owner's genuine demo, when present: the real PAK and program are served through ranged reads so the catalogue's
// signature path is exercised against the actual archive, not a synthetic lookalike.
const DEMO = '/Users/bri/quaked/Hexen 2 Shareware/hexen2-demo/data1';
const demoFixture = existsSync( DEMO + '/pak0.pak' ) && existsSync( DEMO + '/progs.dat' )
	? { pak: readFileSync( DEMO + '/pak0.pak' ), progs: readFileSync( DEMO + '/progs.dat' ) } : null;
if ( demoFixture ) {

	files.set( '/demo/games/Hexen 2 Demo/pak0.pak', demoFixture.pak );
	files.set( '/demo/games/Hexen 2 Demo/progs.dat', demoFixture.progs );
	files.set( '/demo/games/Hexen 2 Demo/strings.txt', Buffer.from( 'demo strings' ) );
	files.set( '/demo/games/Hexen 2 Demo/hexen.rc', Buffer.from( 'exec autoexec.cfg' ) );
	// a valid archive with an unreadable/short program (the header check must refuse it)
	files.set( '/demo-bad/games/Hexen 2 Demo/pak0.pak', demoFixture.pak );
	files.set( '/demo-bad/games/Hexen 2 Demo/progs.dat', demoFixture.progs.subarray( 0, 40 ) );
	// a valid archive without its loose program
	files.set( '/demo-noprog/games/Hexen 2 Demo/pak0.pak', demoFixture.pak );

}

const server = createServer( ( req, res ) => {

	const path = decodeURIComponent( new URL( req.url, 'http://x' ).pathname ), data = files.get( path );
	if ( ! data ) { res.writeHead( 404, { 'Content-Type': 'text/html' } ); res.end( '<html>not found</html>' ); return; }
	const range = /bytes=(\d+)-(\d*)/.exec( req.headers.range ?? '' );
	if ( ! range ) { res.writeHead( 200, { 'Content-Length': data.length } ); res.end( data ); return; }
	const start = Number( range[ 1 ] ), end = range[ 2 ] === '' ? data.length - 1 : Math.min( Number( range[ 2 ] ), data.length - 1 );
	const body = data.subarray( start, end + 1 );
	res.writeHead( 206, { 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': body.length } );
	res.end( body );

} );
await new Promise( r => server.listen( 0, '127.0.0.1', r ) );
const base = `http://127.0.0.1:${server.address().port}/`, options = { base, timeoutMs: 3000 };
const hexenGames = GAME_CATALOGUE_GAMES.filter( g => g.id.startsWith( 'hexen2' ) );

Deno.test( 'the shelf finds Hexen II, its Portal expansion and refuses a demo without the pinned signature', async () => {

	const catalogue = await GameCatalogue_Refresh( options ), g = id => catalogue.games.find( x => x.id === id );
	const hexen = g( 'hexen2' );
	check( hexen.present && hexen.validated, 'Hexen II is found and validated' );
	check( hexen.playable && /its Installed gamecode, palette and demo1/.test( hexen.reason ), 'Hexen II is playable: ' + hexen.reason );
	same( hexen.folder, 'games/Hexen 2/data1', 'the selected data1 folder' );
	check( hexen.loose.includes( 'progs.dat' ) && hexen.loose.includes( 'strings.txt' ) && hexen.loose.includes( 'hexen.rc' ), 'the loose gamecode, strings and config are found: ' + hexen.loose );
	const portals = g( 'hexen2-portals' );
	check( portals.playable && /its gamecode and Keep, on Hexen II/.test( portals.reason ), 'Portal is playable on Hexen II: ' + portals.reason );
	const demo = g( 'hexen2-demo' );
	check( demo.present && demo.validated && ! demo.playable, 'the synthetic demo is found but not advertised' );
	check( /archive signature mismatch/.test( demo.reason ), 'the demo reason names the signature mismatch: ' + demo.reason );
	for ( const id of [ 'shareware', 'quake' ] ) check( ! g( id ).present, id + ' is not in the Hexen fixture' );

} );


Deno.test( 'Portal is found when its only pack is pak3 and pak0/1 belong to the base game', async () => {

	const found = await GameCatalogue_Refresh( { ...options, base: base + 'portal3/', games: hexenGames } );
	const portal = found.games.find( x => x.id === 'hexen2-portals' );
	check( portal.present && portal.validated, 'the pak3-only Portal is found/validated: ' + portal.reason );
	check( portal.playable, 'the pak3-only Portal is playable: ' + portal.reason );
	same( portal.packs.length, 1, 'only pak3 is probed' );
	same( portal.packs[ 0 ].name, 'pak3.pak', 'the found pack is pak3' );
	check( portal.packs[ 0 ].files.includes( 'maps/keep1.bsp' ), 'keep1 is read from pak3' );

} );

Deno.test( 'Hexen probes ten packs and reports missing required files honestly', async () => {

	const ten = await GameCatalogue_Refresh( { ...options, base: base + 'ten/', games: hexenGames.filter( g => g.id === 'hexen2' ) } );
	const hexen = ten.games.find( x => x.id === 'hexen2' );
	same( hexen.packs.length, 10, 'all ten packs were probed' );
	check( hexen.playable, 'the ten-pack installation is playable: ' + hexen.reason );
	check( ! hexen.beyondLimit, 'no pak10 beyond the bound' );
	const bad = await GameCatalogue_Refresh( { ...options, base: base + 'bad/', games: hexenGames.filter( g => g.id === 'hexen2' ) } );
	const broken = bad.games.find( x => x.id === 'hexen2' );
	check( broken.validated && ! broken.playable, 'a validated but incomplete installation is not playable' );
	check( /gfx\/palette\.lmp/.test( broken.reason ), 'the missing palette is named: ' + broken.reason );

} );

Deno.test( 'the genuine demo is advertised only with the pinned archive and a version-6 base program', async () => {

	if ( demoFixture === null ) { console.log( 'SKIP: the verified demo fixture is not present at ' + DEMO ); server.close(); return; }
	const demos = GAME_CATALOGUE_GAMES.filter( g => g.id === 'hexen2-demo' );
	const real = await GameCatalogue_Refresh( { ...options, base: base + 'demo/', games: demos } );
	const demo = real.games.find( x => x.id === 'hexen2-demo' );
	check( demo.present && demo.validated, 'the supplied demo is found and validated: ' + demo.reason );
	check( demo.playable && /genuine Nov 1997 demo archive/.test( demo.reason ), 'the supplied demo is playable: ' + demo.reason );
	same( demo.folder, 'games/Hexen 2 Demo', 'the demo folder' );
	same( demo.packs[ 0 ].signature.entries, 797, 'the catalogue read the real entry count' );
	same( demo.packs[ 0 ].signature.directoryCrc, 22780, 'the catalogue computed the native directory CRC' );
	same( demo.packs[ 0 ].signature.bytes, 27750257, 'the catalogue read the real archive size' );
	same( demo.progsHeader.layout, 'hexen2-base', 'the demo program layout' );
	same( demo.progsHeader.version, 6, 'the demo program version' );

	const bad = await GameCatalogue_Refresh( { ...options, base: base + 'demo-bad/', games: demos } );
	const shortProgram = bad.games.find( x => x.id === 'hexen2-demo' );
	check( shortProgram.present && shortProgram.validated && ! shortProgram.playable, 'a valid archive with a short program is refused' );
	check( /no readable version-6 gamecode header/.test( shortProgram.reason ), 'the short program is named: ' + shortProgram.reason );

	const noProgram = await GameCatalogue_Refresh( { ...options, base: base + 'demo-noprog/', games: demos } );
	const missing = noProgram.games.find( x => x.id === 'hexen2-demo' );
	check( missing.present && missing.validated && ! missing.playable, 'a valid archive without the loose program is refused' );
	check( /gamecode or demo map is missing/.test( missing.reason ), 'the missing program is named: ' + missing.reason );
	server.close();

} );
