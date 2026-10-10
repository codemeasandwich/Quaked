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
	[ '/resources/malice/pak0.pak', Buffer.from( 'PACKshort' ) ], // a truncated header
	[ '/resources/quoth/pak0.pak', ( () => { const b = pack( [ 'progs.dat' ] ); b.writeInt32LE( 1e9, 4 ); return b; } )() ] // directory past the end
] );
const ignoresRange = new Set( [ '/resources/rogue/pak0.pak' ] ), served = { bytes: 0 };
files.set( '/resources/rogue/pak0.pak', Buffer.concat( [ pack( [ 'progs.dat' ] ), Buffer.alloc( 4 * 1024 * 1024 ) ] ) );

const server = createServer( ( req, res ) => {

	const path = decodeURIComponent( new URL( req.url, 'http://x' ).pathname );
	res.on( 'error', () => {} );
	if ( req.method === 'HEAD' ) { res.writeHead( 405 ); return res.end(); } // HEAD refused: the probe never needs it
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

Deno.test( 'each folder is classified honestly, with every read bounded', async () => {

	const catalogue = await GameCatalogue_Refresh( options ), g = id => catalogue.games.find( x => x.id === id );
	check( g( 'shareware' ).playable && g( 'shareware' ).validated, 'the shareware: playable' );
	check( g( 'quake' ).playable && g( 'quake' ).packs.length === 1, 'Quake: playable, and pak2 after the missing pak1 is not read' );
	check( g( 'hipnotic' ).validated && ! g( 'hipnotic' ).playable && /not yet shown/.test( g( 'hipnotic' ).reason ), 'a mission pack: validated, not advertised as playable' );
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
	files.set( '/games/Quake/pak0.pak', pack( [ 'progs.dat', 'maps/e1m1.bsp' ] ) );
	const changed = await GameCatalogue_Refresh( options );
	check( ! changed.games.find( x => x.id === 'quake' ).playable && /Episodes 2 to 4/.test( changed.games.find( x => x.id === 'quake' ).reason ), 'a changed pack is read again: only Episode 1 now, so not the full game' );

} );

Deno.test( 'two refreshes asked for together are one probe', async () => {

	const [ a, b ] = await Promise.all( [ GameCatalogue_Refresh( options ), GameCatalogue_Refresh( options ) ] );
	check( a === b, 'the second caller gets the running refresh' );

} );

Deno.test( 'the probe reads only a header from a server that ignores Range, and refuses HTML for a pack', async () => {

	const p = await GameCatalogue_ProbePack( base + 'resources/rogue/pak0.pak', options );
	check( p.state === 'present' && p.size > 4e6, 'the archive is there, its directory unread' );
	check( ( await GameCatalogue_ProbePack( base + 'resources/ad/pak0.pak', options ) ).state === 'absent', 'a soft 404' );
	check( ( await GameCatalogue_ProbePack( base + 'nothing/pak0.pak', options ) ).state === 'absent', 'a 404' );
	server.close();

} );
