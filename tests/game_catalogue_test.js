// The game catalogue (src/engine/common/game_catalogue.js, card [34b]) against a real HTTP server whose folders each
// behave one way: valid packs, a gap in the pack numbers, a server that ignores Range (and sends a whole archive), a
// 760 MB pack served from nothing, an HTML page standing in for a 404, a corrupt directory, a truncated header, a
// server error and a request that never answers. Every read stays bounded; found, validated and playable are told
// apart; a pack dropped in between refreshes is found by the next one; an unchanged pack's directory is not re-read.
import { createServer } from 'node:http';
import { GameCatalogue_Refresh, GameCatalogue_ProbePack, GAME_CATALOGUE_LIMITS } from '../src/engine/common/game_catalogue.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };

// a PACK archive of the named files (each a few bytes)
function pack( names ) {

	const body = Buffer.alloc( names.length * 4, 7 ), dir = Buffer.alloc( names.length * 64 );
	names.forEach( ( n, i ) => { dir.write( n, i * 64, 'latin1' ); dir.writeInt32LE( 12 + i * 4, i * 64 + 56 ); dir.writeInt32LE( 4, i * 64 + 60 ); } );
	const header = Buffer.alloc( 12 ); header.write( 'PACK', 0, 'latin1' ); header.writeInt32LE( 12 + body.length, 4 ); header.writeInt32LE( dir.length, 8 );
	return Buffer.concat( [ header, body, dir ] );

}

// A 760 MB pack that exists only as its header and directory: any range is computed, never allocated in full.
const BIG = 760 * 1024 * 1024, bigDir = Buffer.alloc( 64 );
bigDir.write( 'maps/mg1_big.bsp', 0, 'latin1' ); bigDir.writeInt32LE( 12, 56 ); bigDir.writeInt32LE( 100, 60 );
function bigBytes( start, end ) {

	const out = Buffer.alloc( end - start + 1 ), dirofs = BIG - 64;
	const head = Buffer.alloc( 12 ); head.write( 'PACK', 0, 'latin1' ); head.writeInt32LE( dirofs, 4 ); head.writeInt32LE( 64, 8 );
	for ( let i = start; i <= end; i ++ ) out[ i - start ] = i < 12 ? head[ i ] : i >= dirofs ? bigDir[ i - dirofs ] : 0;
	return out;

}

const files = new Map( [
	[ '/games/shareware/pak0.pak', pack( [ 'progs.dat', 'maps/start.bsp', 'maps/e1m1.bsp', 'gfx.wad' ] ) ],
	[ '/games/Quake/pak0.pak', pack( [ 'progs.dat', 'maps/e1m1.bsp', 'maps/e2m1.bsp', 'maps/e3m1.bsp', 'maps/e4m1.bsp', 'gfx/pop.lmp' ] ) ],
	[ '/games/Quake/pak2.pak', pack( [ 'never/read.txt' ] ) ], // after a gap (no pak1): Quake stops before it
	[ '/games/Scourge of Armagon/pak0.pak', pack( [ 'progs.dat', 'maps/hip1m1.bsp' ] ) ],
	// an original release: Episode 1 in pak0, Episodes 2 to 4 in pak1 (the game mounts pak0 only, so not the full game yet)
	[ '/resources/id1/pak0.pak', pack( [ 'progs.dat', 'maps/start.bsp', 'maps/e1m1.bsp' ] ) ],
	[ '/resources/id1/pak1.pak', pack( [ 'maps/e2m1.bsp', 'maps/e3m1.bsp', 'maps/e4m1.bsp' ] ) ],
	[ '/resources/malice/pak0.pak', Buffer.from( 'PACKshort' ) ], // a truncated header
	[ '/resources/quoth/pak0.pak', ( () => { const b = pack( [ 'progs.dat' ] ); b.writeInt32LE( 1e9, 4 ); return b; } )() ], // directory past the end
	// a second site (/complete/): Quake and both mission packs whole, as the engine needs them (card [34c])
	[ '/complete/games/Quake/pak0.pak', pack( [ 'progs.dat', 'maps/e1m1.bsp', 'maps/e2m1.bsp', 'maps/e3m1.bsp', 'maps/e4m1.bsp' ] ) ],
	[ '/complete/games/Scourge of Armagon/pak0.pak', pack( [ 'progs.dat', 'gfx.wad', 'maps/start.bsp', 'maps/hip1m1.bsp' ] ) ],
	[ '/complete/games/Dissolution of Eternity/pak0.pak', pack( [ 'progs.dat', 'gfx.wad', 'maps/start.bsp', 'maps/r1m1.bsp' ] ) ],
	[ '/complete/games/Dimension of the Past/pak0.pak', pack( [ 'progs.dat', 'maps/start.bsp', 'maps/e5m1.bsp' ] ) ],
	[ '/complete/games/Dimension of the Machine/pak0.pak', pack( [ 'progs.dat', 'maps/start.bsp', 'maps/mge1m1.bsp' ] ) ],
	// a third (/noquake/): both mission packs whole, but no Quake
	[ '/noquake/games/Scourge of Armagon/pak0.pak', pack( [ 'progs.dat', 'gfx.wad', 'maps/start.bsp' ] ) ],
	[ '/noquake/games/Dissolution of Eternity/pak0.pak', pack( [ 'progs.dat', 'gfx.wad', 'maps/start.bsp' ] ) ]
] );
const ignoresRange = new Set( [ '/resources/rogue/pak0.pak' ] ), served = { bytes: 0 };
// Single-pack quirks, probed directly: each answers one way a server can go wrong
const sendRange = ( res, data, start, end, headers = {} ) => { const body = data.subarray( start, end + 1 ); res.writeHead( 206, { 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': body.length, ...headers } ); res.end( body ); };
const plain = pack( [ 'progs.dat', 'maps/start.bsp' ] ), state = { flaky: 0, version: 0 };
const special = new Map( [
	// the directory request answered with the file's start instead
	[ '/x/wrongrange/pak0.pak', ( req, res, r ) => Number( r[ 1 ] ) === 0 ? sendRange( res, plain, 0, 11 ) : sendRange( res, plain, 0, Number( r[ 2 ] ) - Number( r[ 1 ] ) ) ],
	// the first directory request never answers; later ones do
	[ '/x/flaky/pak0.pak', ( req, res, r ) => { if ( Number( r[ 1 ] ) === 0 ) return sendRange( res, plain, 0, 11, { ETag: '"f"' } ); if ( state.flaky ++ === 0 ) return; sendRange( res, plain, Number( r[ 1 ] ), Number( r[ 2 ] ), { ETag: '"f"' } ); } ],
	// no ETag or Last-Modified: a replacement of the same size must still be noticed
	[ '/x/novalidator/pak0.pak', ( req, res, r ) => { const data = pack( [ state.version ? 'quake.rc' : 'progs.dat', 'maps/start.bsp' ] ); sendRange( res, data, Number( r[ 1 ] ), Math.min( Number( r[ 2 ] ), data.length - 1 ) ); } ],
	// an empty file: a range-serving server has no byte 0 to give
	// the header request answered with bytes 20-31: not the header
	[ '/x/wronghead/pak0.pak', ( req, res ) => sendRange( res, plain, 20, 31 ) ],
	[ '/x/empty/pak0.pak', ( req, res ) => { res.writeHead( 416, { 'Content-Range': 'bytes */0' } ); res.end(); } ]
] );
files.set( '/resources/rogue/pak0.pak', Buffer.concat( [ pack( [ 'progs.dat' ] ), Buffer.alloc( 4 * 1024 * 1024 ) ] ) );

const server = createServer( ( req, res ) => {

	const path = decodeURIComponent( new URL( req.url, 'http://x' ).pathname );
	res.on( 'error', () => {} );
	if ( req.method === 'HEAD' ) { res.writeHead( 405 ); return res.end(); } // HEAD refused: the probe never needs it
	const r0 = /^bytes=(\d+)-(\d+)$/.exec( req.headers.range ?? '' ), quirk = special.get( decodeURIComponent( new URL( req.url, 'http://x' ).pathname ) );
	if ( quirk ) return quirk( req, res, r0 );
	if ( path === '/resources/xmen/pak0.pak' ) return; // never answers: the probe's time limit ends it
	if ( path === '/resources/aopfm_v2/pak0.pak' ) { res.writeHead( 500 ); return res.end( 'boom' ); }
	if ( path === '/resources/ad/pak0.pak' ) { res.writeHead( 200, { 'Content-Type': 'text/html' } ); return res.end( '<!doctype html><title>Not found</title>' ); }
	const range = /^bytes=(\d+)-(\d+)$/.exec( req.headers.range ?? '' );
	if ( path === '/resources/mg1/pak0.pak' ) {

		const start = Number( range[ 1 ] ), end = Math.min( Number( range[ 2 ] ), BIG - 1 ), body = bigBytes( start, end );
		served.bytes += body.length;
		res.writeHead( 206, { 'Content-Range': `bytes ${start}-${end}/${BIG}`, 'Content-Length': body.length } ); return res.end( body );

	}
	const data = files.get( path );
	if ( ! data ) { res.writeHead( 404 ); return res.end(); }
	if ( ! range || ignoresRange.has( path ) ) { res.writeHead( 200, { 'Content-Length': data.length } ); return res.end( data ); }
	const start = Number( range[ 1 ] ), end = Math.min( Number( range[ 2 ] ), data.length - 1 ), body = data.subarray( start, end + 1 );
	served.bytes += body.length;
	res.writeHead( 206, { 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': body.length, ETag: `"${data.length}"` } ); res.end( body );

} );
await new Promise( r => server.listen( 0, '127.0.0.1', r ) );
const base = `http://127.0.0.1:${server.address().port}/`, options = { base, timeoutMs: 400 };

Deno.test( 'the two mission packs and Dimension of the Past are playable on Quake when whole; never without Quake', async () => {

	const catalogue = await GameCatalogue_Refresh( { ...options, base: base + 'complete/' } ), g = id => catalogue.games.find( x => x.id === id );
	for ( const id of [ 'hipnotic', 'rogue' ] ) check( g( id ).playable && /a mission pack/.test( g( id ).reason ), id + ' is playable: ' + g( id ).reason );
	check( g( 'dopa' ).playable && /an episode/.test( g( 'dopa' ).reason ), 'Dimension of the Past is playable: ' + g( 'dopa' ).reason );
	check( g( 'mg1' ).validated && ! g( 'mg1' ).playable && /256 models/.test( g( 'mg1' ).reason ), 'Dimension of the Machine is not yet, and says why: ' + g( 'mg1' ).reason );
	const bare = await GameCatalogue_Refresh( { ...options, base: base + 'noquake/' } ), h = id => bare.games.find( x => x.id === id );
	for ( const id of [ 'hipnotic', 'rogue' ] ) check( h( id ).present && h( id ).validated && ! h( id ).playable && /needs Quake/.test( h( id ).reason ), id + ' whole but without Quake: found, not playable (' + h( id ).reason + ')' );

} );

Deno.test( 'each folder is classified honestly, with every read bounded', async () => {

	const catalogue = await GameCatalogue_Refresh( options ), g = id => catalogue.games.find( x => x.id === id );
	check( g( 'shareware' ).playable && g( 'shareware' ).validated, 'the shareware: playable' );
	check( g( 'quake' ).playable && g( 'quake' ).packs.length === 1, 'Quake: playable, and pak2 after the missing pak1 is not read' );
	check( g( 'hipnotic' ).validated && ! g( 'hipnotic' ).playable && /its gfx\.wad, maps\/start\.bsp are missing/.test( g( 'hipnotic' ).reason ), 'a mission pack without its status bar pictures or start map: validated, not playable (' + g( 'hipnotic' ).reason + ')' );
	check( g( 'rogue' ).present && ! g( 'rogue' ).validated && /ignores byte ranges/.test( g( 'rogue' ).reason ), 'Range ignored: found, not validated' );
	check( g( 'mg1' ).validated && g( 'mg1' ).packs[ 0 ].size === BIG && ! g( 'mg1' ).playable, 'the 760 MB pack: validated from its header and directory' );
	check( ! g( 'ad' ).present && g( 'ad' ).reason === 'not installed', 'an HTML page is not a pack' );
	check( g( 'quoth' ).packs[ 0 ].state === 'invalid' && /directory/.test( g( 'quoth' ).packs[ 0 ].reason ), 'a corrupt directory: invalid' );
	check( g( 'malice' ).packs[ 0 ].state === 'invalid' && /truncated/.test( g( 'malice' ).packs[ 0 ].reason ), 'a truncated header: invalid' );
	check( g( 'xmen' ).packs[ 0 ].state === 'error' && g( 'xmen' ).packs[ 0 ].reason === 'timeout', 'no answer: a timeout, not a hang' );
	check( g( 'aopfm_v2' ).packs[ 0 ].state === 'error' && /500/.test( g( 'aopfm_v2' ).packs[ 0 ].reason ), 'a server error' );
	check( ! g( 'dawn' ).present && /placeholder/.test( g( 'dawn' ).reason ), 'Dawn of the Machine: a placeholder, never found' );
	const c = catalogue.counters, bound = GAME_CATALOGUE_LIMITS.headerBytes + GAME_CATALOGUE_LIMITS.directoryBytes;
	check( c.largestRead <= bound, `no read over ${bound} bytes (largest ${c.largestRead})` );
	check( c.bytes < 64 * 1024, `the whole catalogue read ${c.bytes} bytes, not an archive` );

} );

Deno.test( 'a pack dropped in between refreshes is found; an unchanged one is not re-read; a changed one is', async () => {

	const before = await GameCatalogue_Refresh( options );
	check( ! before.games.find( x => x.id === 'dopa' ).present, 'Dimension of the Past: not installed yet' );
	files.set( '/games/Dimension of the Past/pak0.pak', pack( [ 'progs.dat', 'maps/dopa1.bsp' ] ) );
	const sent = served.bytes, after = await GameCatalogue_Refresh( options );
	check( after.games.find( x => x.id === 'dopa' ).validated, 'found and validated by the next refresh, from its folder with spaces' );
	const quakeDirectoryRead = served.bytes - sent;
	const again = served.bytes; await GameCatalogue_Refresh( options );
	check( served.bytes - again < quakeDirectoryRead, 'an unchanged pack is not read again beyond its header' );
	const original = await GameCatalogue_ProbePack( base + 'resources/id1/pak1.pak', options );
	check( original.state === 'valid', '(the original release fixture)' );
	files.set( '/games/Quake/pak0.pak', pack( [ 'progs.dat', 'maps/e1m1.bsp' ] ) );
	const changed = await GameCatalogue_Refresh( options );
	check( ! changed.games.find( x => x.id === 'quake' ).playable && /Episodes 2 to 4/.test( changed.games.find( x => x.id === 'quake' ).reason ), 'a changed pack is read again: only Episode 1 now, so not the full game' );
	// without games/Quake, the original release in resources/id1: Episodes 2 to 4 only in pak1, which the game does not
	// mount, so it is not called the playable full game
	const quakePak = files.get( '/games/Quake/pak0.pak' ); files.delete( '/games/Quake/pak0.pak' );
	const legacy = ( await GameCatalogue_Refresh( options ) ).games.find( x => x.id === 'quake' );
	files.set( '/games/Quake/pak0.pak', quakePak );
	check( legacy.folder === 'resources/id1' && legacy.packs.length === 2 && legacy.validated, 'both packs found and checked' );
	check( ! legacy.playable && /pak1\.pak/.test( legacy.reason ), `judged on pak0 alone, with the reason (${legacy.reason})` );

} );

Deno.test( 'two refreshes asked for together are one probe', async () => {

	const [ a, b ] = await Promise.all( [ GameCatalogue_Refresh( options ), GameCatalogue_Refresh( options ) ] );
	check( a === b, 'the second caller gets the running refresh' );

} );

Deno.test( 'a wrong range is not a directory; a failed read is retried; no validator means read again; empty is invalid', async () => {

	const wrong = await GameCatalogue_ProbePack( base + 'x/wrongrange/pak0.pak', options );
	check( wrong.state === 'present' && /as a range/.test( wrong.reason ), `another part of the file is not taken for the directory (${wrong.state})` );
	const head = await GameCatalogue_ProbePack( base + 'x/wronghead/pak0.pak', options );
	check( head.state === 'present' && /another part/.test( head.reason ), `a wrong header range is not judged a broken pack (${head.state})` );
	const first = await GameCatalogue_ProbePack( base + 'x/flaky/pak0.pak', options );
	check( first.state === 'error' && /timeout/.test( first.reason ), 'the directory read timed out once' );
	const second = await GameCatalogue_ProbePack( base + 'x/flaky/pak0.pak', options );
	check( second.state === 'valid', 'the next probe tries again (an error is not cached) and validates it' );
	const before = await GameCatalogue_ProbePack( base + 'x/novalidator/pak0.pak', options );
	state.version = 1;
	const after = await GameCatalogue_ProbePack( base + 'x/novalidator/pak0.pak', options );
	check( before.files.includes( 'progs.dat' ) && after.files.includes( 'quake.rc' ), 'without a validator a same-size replacement is noticed' );
	const empty = await GameCatalogue_ProbePack( base + 'x/empty/pak0.pak', options );
	check( empty.state === 'invalid' && /empty/.test( empty.reason ), 'an empty file is invalid, not an error' );

} );

Deno.test( 'the probe reads only a header from a server that ignores Range, and refuses HTML for a pack', async () => {

	const p = await GameCatalogue_ProbePack( base + 'resources/rogue/pak0.pak', options );
	check( p.state === 'present' && p.size > 4e6, 'the archive is there, its directory unread' );
	check( ( await GameCatalogue_ProbePack( base + 'resources/ad/pak0.pak', options ) ).state === 'absent', 'a soft 404' );
	check( ( await GameCatalogue_ProbePack( base + 'nothing/pak0.pak', options ) ).state === 'absent', 'a 404' );
	server.close();

} );
