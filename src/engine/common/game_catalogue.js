/**
 * @module engine/common/game_catalogue
 *
 * Which Quake games and add-ons are installed where the page can read them, found by probing their known folders
 * (card [34b]): never by listing directories (a browser cannot), never by downloading an archive to list its files.
 * For each pack (`pak0.pak` .. `pak4.pak`, in that order, stopping at the first one missing) it reads the 12-byte
 * header and then, when the server serves byte ranges, only the directory, both checked by `pak.js`'s own rules
 * (`COM_PackHeader`, `COM_PackEntries`). A game is then recorded as found, validated and playable separately:
 * playable needs evidence (the shipped shareware; a base Quake whose packs hold Episodes 2 to 4 and its QuakeC);
 * mission packs, episodes and add-ons are found and validated but not advertised as playable until the engine's
 * support for them is shown (their HUD, QuakeC and protocol), and Dawn of the Machine is a placeholder. The folders
 * are those of card [34a] (`games/<name>/`), then, until card [34d] moves them, the owner's `resources/<quake
 * folder>/`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `_catalogue`, `_pending`, `_counters`; 3 module-level collections
 * (Map/Set).
 *
 * Errors: throws at 1 place; catches at 4 places.
 *
 * Results are cached by URL with the size and validators the server gave; `GameCatalogue_Refresh` re-reads only the
 * headers, and a directory again only when a pack changed. Selecting and mounting a game is not done here ([34c],
 * [M1]); the shareware loading in `main.js` is untouched.
 */

import { COM_PackHeader, COM_PackEntries } from './pak.js';
import { Cmd_AddCommand } from './cmd.js';
import { Con_Printf } from './console.js';

// The known games, with card [34a]'s folders and Quake's own folder names; `legacy` is where the owner keeps a copy
// today (resources/, until [34d]). `base` names the game an expansion runs on.
export const GAME_CATALOGUE_GAMES = Object.freeze( [
	{ id: 'shareware', name: 'Quake (shareware)', kind: 'shareware', folders: [ 'games/shareware' ], quake: 'id1' },
	{ id: 'quake', name: 'Quake', kind: 'base', folders: [ 'games/Quake', 'resources/id1' ], quake: 'id1' },
	{ id: 'hipnotic', name: 'Scourge of Armagon', kind: 'mission', base: 'quake', folders: [ 'games/Scourge of Armagon', 'resources/hipnotic' ], quake: 'hipnotic' },
	{ id: 'rogue', name: 'Dissolution of Eternity', kind: 'mission', base: 'quake', folders: [ 'games/Dissolution of Eternity', 'resources/rogue' ], quake: 'rogue' },
	{ id: 'dopa', name: 'Dimension of the Past', kind: 'episode', base: 'quake', folders: [ 'games/Dimension of the Past', 'resources/dopa' ], quake: 'dopa' },
	{ id: 'mg1', name: 'Dimension of the Machine', kind: 'episode', base: 'quake', folders: [ 'games/Dimension of the Machine', 'resources/mg1' ], quake: 'mg1' },
	{ id: 'dawn', name: 'Dawn of the Machine', kind: 'episode', base: 'quake', folders: [], placeholder: true },
	{ id: 'ad', name: 'Arcane Dimensions', kind: 'addon', base: 'quake', folders: [ 'games/Arcane Dimensions', 'resources/ad' ], quake: 'ad' },
	{ id: 'quoth', name: 'Quoth', kind: 'addon', base: 'quake', folders: [ 'games/Quoth', 'resources/quoth' ], quake: 'quoth' },
	{ id: 'malice', name: 'Malice', kind: 'addon', base: 'quake', folders: [ 'games/Malice', 'resources/malice' ], quake: 'malice' },
	{ id: 'xmen', name: 'X-Men', kind: 'addon', base: 'quake', folders: [ 'games/X-Men', 'resources/xmen' ], quake: 'xmen' },
	{ id: 'aopfm_v2', name: 'Abyss of Pandemonium', kind: 'addon', base: 'quake', folders: [ 'games/Abyss of Pandemonium', 'resources/aopfm_v2' ], quake: 'aopfm_v2' }
] );

// Bounds: packs pak0..pak4 (Quake reads them in that numeric order and stops at a gap); a directory of at most
// 2048 entries (pak.js's limit), so at most 12 + 131072 bytes read per pack; and a time limit per request.
export const GAME_CATALOGUE_LIMITS = Object.freeze( { packs: 5, headerBytes: 12, directoryBytes: 2048 * 64, timeoutMs: 8000 } );

const cache = new Map(); // url -> { size, validator, result }
let _catalogue = null;
let _pending = null; // the refresh in progress, shared by concurrent callers
let _counters = { requests: 0, bytes: 0, largestRead: 0 };

/**
 * Reads at most `limit` bytes of a response body, then stops reading and drops the rest, so a server that ignores a
 * Range request (and sends the whole archive) costs only what was read.
 *
 * @param {Response} response the fetch response
 * @param {number} limit the most bytes to keep
 * @returns {Promise<Uint8Array>} the bytes read (at most `limit`)
 */
async function readBounded( response, limit ) {

	const out = new Uint8Array( limit );
	let got = 0;
	if ( response.body && response.body.getReader ) {

		const reader = response.body.getReader();
		try {

			while ( got < limit ) {

				const { value, done } = await reader.read();
				if ( done ) break;
				const take = Math.min( value.byteLength, limit - got );
				out.set( value.subarray( 0, take ), got ); got += take;

			}

		} finally { reader.cancel().catch( () => {} ); }

	} else {

		// no stream to stop early: reading it whole could buffer an archive, so refuse
		throw new Error( 'the response cannot be read in bounded pieces' );

	}
	_counters.bytes += got; _counters.largestRead = Math.max( _counters.largestRead, got );
	return out.subarray( 0, got );

}

/**
 * One ranged GET with a time limit.
 *
 * @param {function} fetchImpl the fetch to use
 * @param {string} url the pack's URL
 * @param {number} start first byte
 * @param {number} length how many bytes
 * @param {number} timeoutMs time limit
 * @returns {Promise<{ response?: Response, bytes?: Uint8Array, exact?: boolean, error?: string }>} the response, up to
 *   `length` bytes of its body and whether it is a 206 for exactly the range asked for; or why it failed ('timeout',
 *   the network error's message, or a body that cannot be read in bounded pieces)
 */
async function rangedGet( fetchImpl, url, start, length, timeoutMs ) {

	const abort = typeof AbortController === 'function' ? new AbortController() : null;
	const timer = setTimeout( () => abort?.abort(), timeoutMs );
	_counters.requests ++;
	try {

		const response = await fetchImpl( url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal: abort?.signal, cache: 'no-store' } );
		const bytes = response.ok ? await readBounded( response, length ) : new Uint8Array( 0 );
		if ( ! response.ok && response.body?.cancel ) response.body.cancel().catch( () => {} );
		// a 206 counts only when it is the range asked for (a server can answer another part of the file)
		// (its end may fall short of the request only where the file itself ends)
		const served = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)/.exec( response.headers.get( 'content-range' ) ?? '' );
		const end = served && Number( served[ 2 ] ), total = served && served[ 3 ] !== '*' ? Number( served[ 3 ] ) : Infinity;
		const exact = response.status === 206 && served !== null && Number( served[ 1 ] ) === start && end === Math.min( start + length - 1, total - 1 );
		return { response, bytes, exact };

	} catch ( error ) {

		return { error: abort?.signal?.aborted ? 'timeout' : String( error?.message ?? error ) };

	} finally { clearTimeout( timer ); }

}

// The archive's whole size from a ranged or full response (Content-Range's total, else Content-Length), or NaN.
function totalSize( response ) {

	const range = /\/(\d+)\s*$/.exec( response.headers.get( 'content-range' ) ?? '' );
	if ( range ) return Number( range[ 1 ] );
	if ( response.status === 200 ) { const length = Number( response.headers.get( 'content-length' ) ); if ( Number.isFinite( length ) && length > 0 ) return length; }
	return NaN;

}

/**
 * Probes one pack: is it there, is it a pack, and (when the server serves ranges) is its directory sound.
 *
 * @param {string} url the pack's URL (folder names URL-encoded)
 * @param {{ fetch?: function, timeoutMs?: number, headerOnly?: boolean }} [options] the fetch to use (default the
 *   global one), a time limit per request, and whether to stop after the header (only presence is wanted)
 * @returns {Promise<{ state: 'absent'|'error'|'invalid'|'present'|'valid', reason?: string, size?: number,
 *   files?: string[] }>} 'absent' (404, 410, or an HTML page standing in for one), 'error' (another failure or a
 *   timeout), 'invalid' (not a pack, or a broken directory), 'present' (a pack whose directory could not be read:
 *   the server ignores ranges, or its size is unknown) or 'valid' (the directory read and checked; `files` its names)
 */
export async function GameCatalogue_ProbePack( url, options = {} ) {

	const fetchImpl = options.fetch ?? globalThis.fetch, timeoutMs = options.timeoutMs ?? GAME_CATALOGUE_LIMITS.timeoutMs;
	const head = await rangedGet( fetchImpl, url, 0, GAME_CATALOGUE_LIMITS.headerBytes, timeoutMs );
	if ( head.error ) return { state: 'error', reason: head.error };
	const r = head.response;
	if ( r.status === 404 || r.status === 410 ) return { state: 'absent', reason: 'HTTP ' + r.status };
	if ( r.status === 416 ) return { state: 'invalid', reason: 'an empty file (no byte 0 to read)' };
	if ( ! r.ok ) return { state: 'error', reason: 'HTTP ' + r.status };
	// a 206 for another part of the file: the bytes are not the header, so they are not judged
	if ( r.status === 206 && ! head.exact ) return { state: 'present', reason: 'the server answered another part of the file, so it was not read' };
	const type = ( r.headers.get( 'content-type' ) ?? '' ).toLowerCase(), first = String.fromCharCode( ...head.bytes.subarray( 0, 4 ) );
	if ( type.includes( 'text/html' ) || /^\s*</.test( first ) ) return { state: 'absent', reason: 'an HTML page, not a pack (a soft 404)' };
	if ( head.bytes.byteLength < GAME_CATALOGUE_LIMITS.headerBytes ) return { state: 'invalid', reason: 'truncated pack header' };
	const size = totalSize( r ), view = new DataView( head.bytes.buffer, head.bytes.byteOffset, head.bytes.byteLength );
	if ( first !== 'PACK' ) return { state: 'invalid', reason: 'not a packfile' };
	if ( ! Number.isFinite( size ) ) return { state: 'present', reason: 'its size is unknown, so its directory was not read' };
	const header = COM_PackHeader( view, size );
	if ( ! header.ok ) return { state: 'invalid', reason: header.reason, size };
	if ( options.headerOnly ) return { state: 'present', size };
	if ( r.status !== 206 ) return { state: 'present', reason: 'the server ignores byte ranges, so its directory was not read', size };
	const cached = cache.get( url ), validator = r.headers.get( 'etag' ) ?? r.headers.get( 'last-modified' ) ?? '';
	// the same archive: same size, validator and directory place (without a validator, a rewrite of the same size that
	// moves or resizes the directory is still noticed)
	// (no validator from the server: nothing shows the archive is unchanged, so it is read again: at most 128 KB)
	if ( validator !== '' && cached && cached.size === size && cached.validator === validator && cached.dirofs === header.dirofs && cached.dirlen === header.dirlen ) return cached.result;
	let result;
	if ( header.count === 0 ) result = { state: 'valid', size, files: [] };
	else {

		const dir = await rangedGet( fetchImpl, url, header.dirofs, header.dirlen, timeoutMs );
		if ( dir.error ) result = { state: 'error', reason: 'directory: ' + dir.error, size };
		else if ( ! dir.exact || dir.bytes.byteLength !== header.dirlen ) result = { state: 'present', reason: 'its directory could not be read as a range', size };
		else {

			const entries = COM_PackEntries( dir.bytes, header.count, size );
			result = entries.ok ? { state: 'valid', size, files: entries.files.map( f => f.name ) } : { state: 'invalid', reason: entries.reason, size };

		}

	}
	// only a settled answer is kept: an error or an unread directory is tried again next time
	if ( result.state === 'valid' || result.state === 'invalid' ) cache.set( url, { size, validator, dirofs: header.dirofs, dirlen: header.dirlen, result } );
	else cache.delete( url );
	return result;

}

// the mission packs the engine runs: Scourge of Armagon (hipnotic) and Dissolution of Eternity (rogue)
const MISSION_PACKS = new Set( [ 'hipnotic', 'rogue' ] );
// the episodes the engine runs: Dimension of the Past
const EPISODES = new Set( [ 'dopa' ] );

// What a found game's files show it to be, and whether that is evidence enough to call it playable.
function assess( game, files, byId ) {

	const has = name => files.has( name );
	if ( game.kind === 'shareware' ) {

		const ok = has( 'progs.dat' ) && has( 'maps/start.bsp' ) && has( 'maps/e1m1.bsp' );
		return { playable: ok, reason: ok ? 'the shareware episode and its QuakeC' : 'its QuakeC or start map is missing' };

	}
	if ( game.kind === 'base' ) {

		const episodes = [ 'e2m1', 'e3m1', 'e4m1' ].every( m => has( `maps/${m}.bsp` ) );
		if ( ! has( 'progs.dat' ) ) return { playable: false, reason: 'no QuakeC (progs.dat) in its pak0.pak' };
		if ( ! episodes ) return { playable: false, reason: 'Episodes 2 to 4 are not in its pak0.pak (an original release keeps them in pak1.pak, which the game does not read yet)' };
		return { playable: true, reason: 'Episodes 1 to 4 and their QuakeC' };

	}
	const base = byId.get( game.base );
	if ( ! base?.playable ) return { playable: false, reason: `it needs ${base?.name ?? game.base}, which is not installed and playable` };
	// the two mission packs run on Quake (card [34c]): their QuakeC, their status bar pictures (in their gfx.wad) and
	// their start map are what the engine needs; the mission-pack status bar and give command follow -hipnotic/-rogue
	if ( game.kind === 'mission' && MISSION_PACKS.has( game.id ) ) {

		const missing = [ 'progs.dat', 'gfx.wad', 'maps/start.bsp' ].filter( name => ! has( name ) );
		if ( missing.length > 0 ) return { playable: false, reason: `its ${missing.join( ', ' )} ${missing.length === 1 ? 'is' : 'are'} missing` };
		return { playable: true, reason: 'a mission pack: its QuakeC, status bar and maps, played on Quake' };

	}
	// an episode runs on Quake as standard Quake (card [34c]): its QuakeC and start map are what it needs; Dimension of
	// the Machine is not yet, as some of its levels need more than the 256 models protocol 15 can name
	if ( game.kind === 'episode' && EPISODES.has( game.id ) ) {

		const missing = [ 'progs.dat', 'maps/start.bsp' ].filter( name => ! has( name ) );
		if ( missing.length > 0 ) return { playable: false, reason: `its ${missing.join( ', ' )} ${missing.length === 1 ? 'is' : 'are'} missing` };
		return { playable: true, reason: 'an episode: its QuakeC and BSP2 maps, played on Quake' };

	}
	if ( game.id === 'mg1' ) return { playable: false, reason: 'some of its levels need more than 256 models, which needs the FitzQuake protocol (not yet built)' };
	return { playable: false, reason: game.kind === 'addon' ? 'add-on support (its QuakeC, entities and limits) is not yet shown to work' : 'its HUD, QuakeC and protocol support are not yet shown to work' };

}

/**
 * Probes every known game's folders and builds the catalogue. Bounded: per pack at most a header and a directory;
 * packs pak0..pak4, stopping at the first missing; the first folder holding a `pak0.pak` is the game's. A call while a
 * refresh runs returns that refresh (one probe at a time).
 *
 * @param {{ fetch?: function, timeoutMs?: number, base?: string }} [options] the fetch to use, a time limit per request,
 *   and the URL the folders are relative to (default the page's)
 * @returns {Promise<{ games: Array<object>, counters: { requests: number, bytes: number, largestRead: number } }>}
 *   per game: `id`, `name`, `kind`, `folder` (where found, or null), `packs` (each `{ name, state, reason?, size? }`),
 *   `present`, `validated` and `playable` (each a boolean), `reason` (why it is or is not playable), `fileCount` and
 *   `beyondLimit` (more packs than the bound, never then playable);
 *   and what the probe cost
 */
export function GameCatalogue_Refresh( options = {} ) {

	// one refresh at a time: a second request while one runs (the startup probe and the `games` command) shares it
	if ( _pending === null ) _pending = refresh( options ).finally( () => { _pending = null; } );
	return _pending;

}

// one game's folders: the first holding a pak0.pak is the game's; its packs pak0.. in order, stopping at a gap
async function probeGame( game, base, options ) {

	const entry = { id: game.id, name: game.name, kind: game.kind, folder: null, packs: [], present: false, validated: false, playable: false, reason: '', fileCount: 0 };
	if ( game.placeholder ) entry.reason = 'a placeholder: no copy is installed';
	const files = new Set();
	for ( const folder of game.folders ) {

		const packs = [];
		for ( let n = 0; n < GAME_CATALOGUE_LIMITS.packs; n ++ ) {

			const url = new URL( folder.split( '/' ).map( encodeURIComponent ).join( '/' ) + `/pak${n}.pak`, base ).href;
			const probe = await GameCatalogue_ProbePack( url, options );
			if ( probe.state === 'absent' ) break;
			packs.push( { name: `pak${n}.pak`, ...probe } );
			if ( probe.state === 'error' ) break;

		}
		if ( packs.length === 0 ) continue;
		// at the bound: one more header says whether packs were left unread
		if ( packs.length === GAME_CATALOGUE_LIMITS.packs && packs[ packs.length - 1 ].state !== 'error' ) {

			const next = await GameCatalogue_ProbePack( new URL( folder.split( '/' ).map( encodeURIComponent ).join( '/' ) + `/pak${GAME_CATALOGUE_LIMITS.packs}.pak`, base ).href, { ...options, headerOnly: true } );
			entry.beyondLimit = next.state !== 'absent';

		}
		entry.folder = folder; entry.packs = packs; entry.present = true;
		entry.validated = packs.every( p => p.state === 'valid' );
		for ( const p of packs ) for ( const f of p.files ?? [] ) files.add( f );
		entry.fileCount = files.size;
		break;

	}
	return { entry, files };

}

async function refresh( options ) {

	_counters = { requests: 0, bytes: 0, largestRead: 0 };
	// relative to the document's base (a page with <base href> probes the site's folders, not its own)
	const base = options.base ?? ( typeof document !== 'undefined' && document.baseURI ? document.baseURI : typeof location !== 'undefined' ? location.href : 'http://localhost/' );
	// every game's folders are probed at once (the shelf waits on this before a game starts, card [M1]); each game's own
	// packs stay in order, and the games are judged in order afterwards (an expansion is judged against its base)
	const probed = await Promise.all( GAME_CATALOGUE_GAMES.map( game => probeGame( game, base, options ) ) );
	const games = [], byId = new Map();
	GAME_CATALOGUE_GAMES.forEach( ( game, i ) => {

		const { entry, files } = probed[ i ];
		if ( entry.present && ! entry.validated ) entry.reason = 'found, not validated: ' + ( entry.packs.find( p => p.state !== 'valid' )?.reason ?? '' );
		// the base game is judged on its pak0.pak alone: the pack the start mounts (an original release's pak1.pak,
		// with Episodes 2 to 4, is not read yet: card [34c])
		else if ( entry.validated ) Object.assign( entry, assess( game, game.kind === 'base' ? new Set( entry.packs[ 0 ]?.files ?? [] ) : files, byId ) );
		else if ( ! game.placeholder ) entry.reason = 'not installed';
		if ( entry.beyondLimit ) { entry.playable = false; entry.reason += ` (it has more than ${GAME_CATALOGUE_LIMITS.packs} packs; pak${GAME_CATALOGUE_LIMITS.packs}.pak and later were not read)`; }
		games.push( entry ); byId.set( game.id, entry );

	} );
	_catalogue = { games, counters: { ..._counters } };
	return _catalogue;

}

/**
 * The catalogue from the last refresh, or null before the first.
 *
 * @returns {?{ games: Array<object>, counters: object }} what `GameCatalogue_Refresh` returned last
 */
export function GameCatalogue_Get() {

	return _catalogue;

}

/**
 * Registers the `games` console command, which refreshes the catalogue and prints each game's state. Called by
 * Host_Init.
 */
export function GameCatalogue_Init() {

	Cmd_AddCommand( 'games', () => {

		GameCatalogue_Refresh().then( catalogue => {

			for ( const g of catalogue.games ) {

				const state = g.playable ? 'playable' : g.validated ? 'installed' : g.present ? 'found' : 'not installed';
				Con_Printf( `${g.name}: ${state}${g.folder ? ' (' + g.folder + ')' : ''}${g.reason ? ' - ' + g.reason : ''}\n` );

			}
			Con_Printf( `(${catalogue.counters.requests} requests, ${catalogue.counters.bytes} bytes read)\n` );

		} ).catch( error => Con_Printf( 'games: ' + ( error?.message ?? error ) + '\n' ) );

	} );

}
