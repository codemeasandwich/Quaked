import {Distribution_Profile} from '../../platform/distribution.js';
/**
 * @module engine/common/game_selection
 *
 * Which game the page runs (card [34c]): the shareware alone, the full Quake (the owner's pack under the shareware,
 * as main.js has mounted it since the full-game card), or a mission pack, Scourge of Armagon or Dissolution of
 * Eternity (its own pack over both, started with -hipnotic or -rogue). The choice is kept in the browser and applied
 * when the page starts: switching reloads the page, which is the clean unmount the engine otherwise lacks (its search
 * path only grows, and its model, sound and picture caches are keyed by file name and kept for the page's life). With
 * no choice kept, the start is exactly as before: the full Quake when its pack is there, else the shareware.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `running`; browser storage.
 *
 * Errors: catches at 6 places.
 *
 * Only a game the catalogue (`game_catalogue.js`, card [34b]) calls playable can be chosen; the episodes and add-ons
 * are refused with the catalogue's reason until their support exists. Each game keeps its own saves: the default and
 * the full Quake keep the saves' original keys (`quake_save_<name>`), the shareware and each mission pack their own.
 */

import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './cmd.js';
import { Con_Printf } from './console.js';
import { Sys_Printf } from './sys.js';
import { GameCatalogue_Refresh, GameCatalogue_Get, GAME_CATALOGUE_LOOSE_FILES, GAME_CATALOGUE_GAMES, GameCatalogue_AllGames } from './game_catalogue.js';
import { COM_FindFile } from './pak.js';
import { PROTOCOL_LARGE } from './protocol.js';

const STORAGE_KEY = 'quaked.game.v1';
// what each choosable game mounts on top of the shareware, in order tried (card [34a]'s folder, then the owner's
// resources/ until card [34d] moves it there)
const QUAKE_PACKS = Object.freeze( [ 'games/Quake/pak0.pak', 'resources/id1/pak0.pak' ] );
const OWNED_PACKS = Object.freeze( { quake: QUAKE_PACKS, shareware: Object.freeze( [] ), hipnotic: QUAKE_PACKS, rogue: QUAKE_PACKS, dopa: QUAKE_PACKS, mg1: QUAKE_PACKS } );
// a mission pack, episode or add-on mounts its own packs over Quake (and the shareware); a mission pack also starts
// with its switch (card [34c]); an episode or add-on has none of its own (null): its gfx.wad decides (GameSelection_StartSwitch)
const MISSION_PACKS = Object.freeze( {
	hipnotic: Object.freeze( { name: 'Scourge of Armagon', switch: '-hipnotic', packs: Object.freeze( [ 'games/Scourge of Armagon/pak0.pak', 'resources/hipnotic/pak0.pak' ] ) } ),
	rogue: Object.freeze( { name: 'Dissolution of Eternity', switch: '-rogue', packs: Object.freeze( [ 'games/Dissolution of Eternity/pak0.pak', 'resources/rogue/pak0.pak' ] ) } ),
	dopa: Object.freeze( { name: 'Dimension of the Past', switch: null, packs: Object.freeze( [ 'games/Dimension of the Past/pak0.pak', 'resources/dopa/pak0.pak' ] ) } ),
	// its larger levels need more than 256 models and an 8 KB signon: the large-map protocol (card [34f])
	mg1: Object.freeze( { name: 'Dimension of the Machine', switch: null, protocol: 1015, packs: Object.freeze( [ 'games/Dimension of the Machine/pak0.pak', 'resources/mg1/pak0.pak' ] ) } )
	// an add-on needs no entry (addonEntry): its switch, if any, follows its own status-bar pictures
	// (GameSelection_SwitchFromWad), so Quoth, whose status bar is Scourge of Armagon's, runs with -hipnotic
} );
const NAMES = Object.freeze( { shareware: 'Quake (shareware)', quake: 'Quake', hipnotic: 'Scourge of Armagon', rogue: 'Dissolution of Eternity', dopa: 'Dimension of the Past', mg1: 'Dimension of the Machine', quoth: 'Quoth' } );
// Any add-on, known or found by its folder (`mod_<folder>`, game_catalogue.js), is chosen and run the same way, with no
// entry of its own (docs/add-ons-2026-10-13.md): over Quake, every pack of its folder and its loose game files.
const KNOWN_ADDONS = Object.freeze( GAME_CATALOGUE_GAMES.filter( g => g.kind === 'addon' ).map( g => g.id ) );
const isAddon = id => typeof id === 'string' && ( KNOWN_ADDONS.includes( id ) || /^mod_[a-z0-9_]+$/.test( id ) );
const addonDefinition = id => GameCatalogue_AllGames().find( g => g.id === id && g.kind === 'addon' ) ?? null;
// an add-on's mission entry: its name and its folders as the source build reaches them (the Mac app reads its library)
function addonEntry( id ) {

	const def = addonDefinition( id );
	if ( ! def ) return null;
	// the large-map protocol from the start (as Dimension of the Machine): a map can pass protocol 15's 600 entities in
	// play, after loading has checked it (Arcane Dimensions' ad_e1m1 loads with 393 and spawns past 1400), and the
	// game would end; the large-map protocol is the port's own, so nothing else needs protocol 15 here
	return { name: def.name, switch: null, protocol: PROTOCOL_LARGE, folders: def.folders.filter( f => /^(games|resources)\//.test( f ) ) };

}
const missionEntry = id => MISSION_PACKS[ id ] ?? ( isAddon( id ) ? addonEntry( id ) : null );
const ownedPacks = id => OWNED_PACKS[ id ] ?? ( isAddon( id ) ? QUAKE_PACKS : null );
const gameName = id => NAMES[ id ] ?? addonDefinition( id )?.name ?? id;
const choosable = id => Object.hasOwn( OWNED_PACKS, id ) || isAddon( id ) || ( hexenOffered() && HEXEN_CHOICES.has( id ) );
// Hexen II runs from the player's own installation: the native desktop app, or a local source checkout serving their
// library (`tools/serve.py --game-root`); the published web product keeps its Quake shareware product
const hexenOffered = () => Distribution_Profile() !== 'web';

/** The Hexen II catalogue ids. */
const HEXEN_CHOICES = new Set( [ 'hexen2', 'hexen2-portals', 'hexen2-demo' ] );
/** The games that can be chosen by name: the official ones and every known add-on (a found add-on, `mod_...`, too). */
export const GAME_SELECTION_CHOICES = Object.freeze( [ ...Object.keys( OWNED_PACKS ), ...KNOWN_ADDONS.filter( id => ! Object.hasOwn( OWNED_PACKS, id ) ) ] );

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * The game this page runs: the one its address names (`?game=<id>`), else the one chosen and kept in the browser,
 * else null (the start as before).
 *
 * @returns {?string} 'quake', 'shareware', 'hipnotic', 'rogue' or null
 */
export function GameSelection_Current() {
	if(Distribution_Profile()==='web')return 'shareware';

	// a game's own URL (`?game=<id>`, the game shelf's links, card [M1]) wins over the choice kept in the browser
	const fromUrl = GameSelection_UrlChoice( globalThis.location?.search ?? '' );
	if ( fromUrl !== null ) return fromUrl;
	let value = null;
	try { value = storage()?.getItem( STORAGE_KEY ) ?? null; } catch { value = null; }
	return choosable( value ) ? value : null;

}

/**
 * The game a page's address names (`?game=<id>`, card [M1]), when it is one that can be chosen.
 *
 * @param {string} search a `location.search`
 * @returns {?string} 'quake', 'shareware', 'hipnotic', 'rogue' or null (no `game`, or one that cannot be chosen)
 */
export function GameSelection_UrlChoice( search ) {

	const id = new URLSearchParams( search || '' ).get( 'game' );
	return choosable( id ) ? id : null;

}

/**
 * Keeps a choice in the browser without reloading (the game shelf then opens the game's own URL), so the shelf starts
 * on it next time.
 *
 * @param {string} id the game's catalogue id
 * @returns {boolean} whether it was kept (only a choosable game, and only where storage works)
 */
export function GameSelection_Remember( id ) {

	if ( ! choosable( id ) ) return false;
	try { storage()?.setItem( STORAGE_KEY, id ); return storage()?.getItem( STORAGE_KEY ) === id; } catch { return false; }

}

/**
 * The game chosen and kept in the browser, ignoring the page's address: where the shelf starts.
 *
 * @returns {?string} 'quake', 'shareware', 'hipnotic', 'rogue' or null
 */
export function GameSelection_Kept() {

	let value = null;
	try { value = storage()?.getItem( STORAGE_KEY ) ?? null; } catch { value = null; }
	return choosable( value ) ? value : null;

}

/**
 * The owned packs to fetch at start for the current choice, in the order to try them; empty for the shareware, so
 * its start downloads nothing more. With no choice, the full Quake's (as before).
 *
 * @returns {ReadonlyArray<string>} pack URLs relative to the page
 */
export function GameSelection_OwnedPacks() {

	return ownedPacks( GameSelection_Current() ?? 'quake' );

}

/**
 * The mission pack, episode or add-on the current choice runs, if any: its name, its switch for COM_InitArgv (null for
 * an episode or add-on, whose gfx.wad then decides: GameSelection_StartSwitch) and where its packs are, mounted over Quake and the shareware: a
 * mission pack or episode names its pack (`packs`, the first found; `protocol` when it needs the large-map one), an
 * add-on its folders (`folders`; see GameSelection_FetchMission).
 *
 * @returns {?{ name: string, switch: ?string, packs?: ReadonlyArray<string>, folders?: ReadonlyArray<string>,
 *   protocol?: number }} the entry, or null for the shareware, Quake or no choice
 */
export function GameSelection_MissionPack() {

	return missionEntry( GameSelection_Current() );

}

/**
 * Fetches the packs of a mission entry (GameSelection_MissionPack) for the source and web builds; the Mac app reads
 * its library instead (src/platform/desktop.js). A mission pack or episode: its first pack found. An add-on: every
 * pack of the first of its folders that has a pak0, from pak0 up to the first missing one (at most pak9), in order, so
 * a later pack's files win (COM_AddPack), as Quake reads a game folder; and, first, a pack of the loose game files in
 * that folder (GAME_CATALOGUE_LOOSE_FILES, such as X-Men's progs.dat), which Quake searches after the folder's packs.
 * A folder with no pack but a loose progs.dat is the add-on by itself (its QuakeC on Quake's maps). Paths are
 * percent-encoded per segment, as the catalogue probes them, so a folder named "Mod #2" is fetched whole.
 *
 * @param {?object} mission the entry
 * @param {function(string): Promise<?object>} fetchPak fetches one pack by URL, null when it is not there
 * @param {?function(string): Promise<?Uint8Array>} [fetchFile] fetches one loose file by URL, null when it is not there
 * @param {?function(string, Array<{ name: string, data: Uint8Array }>): object} [loosePack] makes a pack of loose files
 * @returns {Promise<?(object|Array<object>)>} the pack, the add-on's packs, or null when none was found
 */
export async function GameSelection_FetchMission( mission, fetchPak, fetchFile = null, loosePack = null ) {

	if ( ! mission ) return null;
	if ( mission.folders ) {

		for ( const folder of mission.folders ) {

			const found = [], at = folder.split( '/' ).map( encodeURIComponent ).join( '/' ); // as the catalogue probes it
			for ( let n = 0; n < 10; n ++ ) { const pack = await fetchPak( `${at}/pak${n}.pak` ); if ( ! pack ) break; found.push( pack ); }
			const loose = [];
			if ( fetchFile && loosePack ) for ( const name of GAME_CATALOGUE_LOOSE_FILES ) { const data = await fetchFile( `${at}/${encodeURIComponent( name )}` ); if ( data ) loose.push( { name, data } ); }
			// a folder of loose files alone is an add-on when its QuakeC is among them (the catalogue's rule)
			if ( found.length === 0 && ! loose.some( f => f.name === 'progs.dat' ) ) continue;
			if ( loose.length > 0 ) found.unshift( loosePack( `${folder}/loose`, loose ) );
			return found;

		}
		return null;

	}
	for ( const url of mission.packs ) { const pack = await fetchPak( url ); if ( pack ) return pack; }
	return null;

}

/**
 * The switch a mission entry starts with: its own (`-hipnotic`, `-rogue`), or, for one with none (an episode or an
 * add-on), the one its `gfx.wad` asks for (GameSelection_SwitchFromWad). Called by main.js once the game's packs are
 * mounted and before Host_Init, so `find` reaches the `gfx.wad` the engine will draw from: the last mounted pack's.
 *
 * @param {?{ switch?: ?string }} mission the entry (GameSelection_MissionPack), or null
 * @param {function(string): ?{ data: Uint8Array }} [find] the file lookup (COM_FindFile)
 * @returns {?string} '-hipnotic', '-rogue' or null
 */
export function GameSelection_StartSwitch( mission, find = COM_FindFile ) {

	if ( ! mission ) return null;
	return mission.switch ?? GameSelection_SwitchFromWad( find( 'gfx.wad' )?.data ?? null );

}

// Pictures only a mission pack's status bar has: Scourge of Armagon's weapons and suit, Dissolution of Eternity's ammo
const HIPNOTIC_LUMPS = Object.freeze( [ 'inv_laser', 'inv_mjolnir', 'sb_wsuit' ] );
const ROGUE_LUMPS = Object.freeze( [ 'r_lava', 'r_multirock' ] );
/**
 * The mission-pack switch a game's own status bar asks for, from the picture names in its `gfx.wad`: Scourge of
 * Armagon's (`inv_laser`, `inv_mjolnir`, `sb_wsuit`) mean `-hipnotic`, Dissolution of Eternity's (`r_lava`,
 * `r_multirock`) mean `-rogue` (the switch Quakespasm also gives Quoth, through its -quoth); anything else, a damaged
 * file or none runs as standard Quake. One such picture is enough: an add-on with standard QuakeC that ships Scourge's
 * whole gfx.wad would run with Scourge's status bar (none of the add-ons here does; docs/add-ons-2026-10-13.md). Called by main.js for a game with no switch of its own, once its packs are mounted, with the
 * `gfx.wad` the game then reads (docs/add-ons-2026-10-13.md).
 *
 * @param {?(Uint8Array|ArrayBuffer)} wad the `gfx.wad` bytes (WAD2), or null
 * @returns {?string} '-hipnotic', '-rogue' or null
 */
export function GameSelection_SwitchFromWad( wad ) {

	if ( ! wad ) return null;
	const bytes = wad instanceof Uint8Array ? wad : new Uint8Array( wad );
	if ( bytes.length < 12 || String.fromCharCode( ...bytes.subarray( 0, 4 ) ) !== 'WAD2' ) return null;
	const view = new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength ), count = view.getInt32( 4, true ), table = view.getInt32( 8, true );
	if ( count < 0 || table < 12 || table + count * 32 > bytes.length ) return null;
	const names = new Set();
	for ( let i = 0; i < count; i ++ ) {

		const raw = bytes.subarray( table + i * 32 + 16, table + i * 32 + 32 ), end = raw.indexOf( 0 );
		names.add( String.fromCharCode( ...raw.subarray( 0, end < 0 ? 16 : end ) ).toLowerCase() );

	}
	if ( HIPNOTIC_LUMPS.some( n => names.has( n ) ) ) return '-hipnotic';
	if ( ROGUE_LUMPS.some( n => names.has( n ) ) ) return '-rogue';
	return null;

}

/** At most this many bytes for a loose game file (src-tauri/src/library.rs LOOSE_LIMIT). */
export const GAME_SELECTION_LOOSE_LIMIT = 64 * 1024 * 1024;
/**
 * Fetches one loose game file for the source build (GameSelection_FetchMission's `fetchFile`): its bytes, or null when
 * it is not there or is refused, with the reason printed. Refused: a page instead of the file (an HTML content type, or
 * a body starting with `<`, as a server that answers a missing path with its index page sends), and anything over
 * GAME_SELECTION_LOOSE_LIMIT, counted as it streams (a missing Content-Length is no way round it).
 *
 * @param {string} url the file's URL
 * @param {function(string): Promise<Response>} [fetchImpl] the fetch to use
 * @returns {Promise<?Uint8Array>} the bytes, or null
 */
export async function GameSelection_FetchLoose( url, fetchImpl = globalThis.fetch ) {

	let response;
	try { response = await fetchImpl( url ); } catch ( error ) { Sys_Printf( 'Loose file %s could not be read: %s\n', url, error?.message ?? error ); return null; }
	if ( ! response.ok ) { response.body?.cancel?.().catch?.( () => {} ); return null; }
	const refuse = reason => { response.body?.cancel?.().catch?.( () => {} ); Sys_Printf( 'Loose file %s refused: %s\n', url, reason ); return null; };
	if ( /text\/html/i.test( response.headers.get( 'content-type' ) ?? '' ) ) return refuse( 'a page, not the file' );
	if ( Number( response.headers.get( 'content-length' ) ) > GAME_SELECTION_LOOSE_LIMIT ) return refuse( 'larger than 64 MB' );
	const chunks = [], reader = response.body?.getReader?.();
	let size = 0;
	try {

		if ( ! reader ) { const bytes = new Uint8Array( await response.arrayBuffer() ); chunks.push( bytes ); size = bytes.length; }
		else for ( ;; ) {

			const { done, value } = await reader.read();
			if ( done ) break;
			size += value.length;
			if ( size > GAME_SELECTION_LOOSE_LIMIT ) { reader.cancel().catch( () => {} ); Sys_Printf( 'Loose file %s refused: larger than 64 MB\n', url ); return null; }
			chunks.push( value );

		}

	} catch ( error ) {

		// a download that breaks off leaves the file out; the game still starts
		Sys_Printf( 'Loose file %s could not be read: %s\n', url, error?.message ?? error ); return null;

	}
	const bytes = new Uint8Array( size );
	let at = 0; for ( const c of chunks ) { bytes.set( c, at ); at += c.length; }
	if ( bytes[ 0 ] === 60 ) { Sys_Printf( 'Loose file %s refused: a page, not the file\n', url ); return null; } // '<'
	return bytes;

}

/**
 * Fetches a Hexen II edition from the player's library for a local source checkout, in the order the desktop app mounts
 * it (`GameSelection_LibraryOrder`): for Portal of Praevus the base game's loose files and packs, then Portal's loose
 * files as one pack and its packs; for the base game or the demo its loose files (progs.dat, strings.txt, hexen.rc…) then its packs. The
 * folders, packs and loose files are the ones the game catalogue found; music stays loose (Hexen2_MusicStem streams it).
 *
 * @param {string} id 'hexen2', 'hexen2-portals' or 'hexen2-demo'
 * @param {function(string, string): Promise<?object>} fetchPak fetches and loads one pack from its URL under a name
 *   (`COM_FetchOptionalPak`); the name is `<game id>/<pak>`, as the desktop app's tokens, so Level Select finds an
 *   edition's own maps
 * @param {function(string): Promise<?Uint8Array>} fetchFile fetches one loose file (`GameSelection_FetchLoose`)
 * @param {function(string, Array<{ name: string, data: Uint8Array }>): ?object} loosePack builds a pack from loose files
 * @param {?{ games: Array<object> }} [catalogue] the catalogue (default: the current one, refreshed when there is none)
 * @returns {Promise<Array<object>>} the packs, in mount order
 * @throws {Error} when the edition or its base is not installed, or a found pack cannot be read
 */
export async function GameSelection_FetchLibraryGame( id, fetchPak, fetchFile, loosePack, catalogue = null ) {

	const games = ( catalogue ?? GameCatalogue_Get() ?? await GameCatalogue_Refresh() )?.games ?? [];
	const definition = GameCatalogue_AllGames().find( g => g.id === id );
	if ( ! definition ) throw Error( `no game called '${id}'` );
	const ids = definition.base ? [ definition.base, id ] : [ id ], entries = [];
	for ( const game of ids ) {

		const found = games.find( g => g.id === game );
		if ( ! found?.present || ! found.folder ) throw Error( `${found?.name ?? GameCatalogue_AllGames().find( g => g.id === game )?.name ?? game} is not installed` );
		const at = found.folder.split( '/' ).map( encodeURIComponent ).join( '/' ); // as the catalogue probes it
		for ( const name of found.loose ?? [] ) if ( ! name.startsWith( 'music/' ) ) entries.push( { game, loose: true, name, url: `${at}/${encodeURIComponent( name )}` } );
		for ( const pack of found.packs ?? [] ) entries.push( { game, name: pack.name, url: `${at}/${pack.name}` } );

	}
	const packs = [];
	for ( const step of GameSelection_LibraryOrder( entries, ids, ids ) ) {

		if ( step.loose ) {

			const files = [];
			for ( const entry of step.loose ) { const data = await fetchFile( entry.url ); if ( data ) files.push( { name: entry.name, data } ); }
			if ( files.length > 0 ) packs.push( loosePack( `${step.loose[ 0 ].game}/loose`, files ) );
			continue;

		}
		const pack = await fetchPak( step.pack.url, `${step.pack.game}/${step.pack.name}` );
		if ( ! pack ) throw Error( `${step.pack.url} could not be read` );
		packs.push( pack );

	}
	return packs;

}

/**
 * The Hexen II music source for a local source checkout (`Hexen2_SetMusicSource`): a game path `music/<track>.<ogg|
 * mp3|wav>` becomes the URL of that loose file in the edition's library folder, as the desktop app reads it
 * (src/platform/desktop.js musicEditionOrder): Portal of Praevus's own `tulku*`/`track*` names from its folder first,
 * every other track from the base game's first. The served file is streamed by the music bus; nothing is mounted.
 *
 * @param {string} id 'hexen2', 'hexen2-portals' or 'hexen2-demo'
 * @param {{ catalogue?: ?{ games: Array<object> }, fetch?: function(string, object): Promise<Response> }} [options]
 *   the catalogue (default: the current one) and the fetch to probe with
 * @returns {function(string): Promise<?string>} game path -> URL, or null when no edition folder has the file
 */
export function GameSelection_LibraryMusicSource( id, options = {} ) {

	const fetchImpl = options.fetch ?? globalThis.fetch;
	const definition = GameCatalogue_AllGames().find( g => g.id === id );
	return async path => {

		const match = /^music\/([a-z0-9_.-]+\.(?:ogg|mp3|wav))$/i.exec( String( path ?? '' ) );
		if ( ! match || typeof fetchImpl !== 'function' ) return null;
		const name = match[ 1 ].toLowerCase(), games = ( options.catalogue ?? GameCatalogue_Get() )?.games ?? [];
		const editions = definition?.base ? ( /^(?:tulku|track)/.test( name ) ? [ id, definition.base ] : [ definition.base, id ] ) : [ id ];
		for ( const edition of editions ) {

			const folder = games.find( g => g.id === edition && g.present )?.folder;
			if ( ! folder ) continue;
			const url = folder.split( '/' ).map( encodeURIComponent ).join( '/' ) + '/music/' + encodeURIComponent( name );
			try {

				const response = await fetchImpl( url, { method: 'HEAD' } );
				if ( response.ok && ! /text\/html/i.test( response.headers?.get?.( 'content-type' ) ?? '' ) ) return url;

			} catch { /* not served: try the next edition */ }

		}
		return null;

	};

}

/**
 * The order the Mac app mounts a game's library entries in (src/platform/desktop.js): for each game, base first, its
 * loose game files as one pack and then its packs, so the last mounted wins as Quake searches (a game's packs, then its
 * folder, then its base). Only the add-on being run gets its loose files; a player's own autoexec.cfg beside Quake is
 * not part of any game. Hexen II mounts the loose files of every edition it runs (Portal of Praevus also reads the
 * base game's folder natively, where the native demos are).
 *
 * @param {Array<{ game: string, loose?: boolean }>} entries the library's entries
 * @param {Array<string>} ids the games to mount, base first
 * @param {?(string|Array<string>)} addon the game, or games, whose loose files are mounted
 * @returns {Array<{ loose: Array<object> }|{ pack: object }>} what to mount, in order
 */
export function GameSelection_LibraryOrder( entries, ids, addon ) {

	const out = [], looseGames = new Set( [].concat( addon ?? [] ) );
	for ( const game of ids ) {

		const loose = looseGames.has( game ) ? entries.filter( e => e.game === game && e.loose ) : [];
		if ( loose.length > 0 ) out.push( { loose } );
		for ( const pack of entries.filter( e => e.game === game && ! e.loose ) ) out.push( { pack } );

	}
	return out;

}

// the game the page actually started (main.js, once its packs are mounted): it can differ from the choice when a
// chosen game's pack is missing; null until then
let running = null;

/**
 * Records the game the page actually started, once its packs are mounted (main.js, before Host_Init reads the
 * configuration): the chosen one, or what ran instead when its pack was missing (Quake for a mission pack without its
 * pack, the shareware without Quake's). The save prefix and the configuration key follow it.
 *
 * @param {?string} id 'shareware', 'quake', 'hipnotic', 'rogue', or null to forget it
 */
export function GameSelection_SetRunning( id ) {

	running = id;

}

/**
 * The game this page runs: the one started (`GameSelection_SetRunning`), else the one chosen; null for the default
 * before the start. Read by Level Select for the running game's own maps (a mission pack, episode or add-on).
 *
 * @returns {?string} the game's id, or null
 */
export function GameSelection_Running() {

	return running ?? GameSelection_Current();

}

// the game whose saves and settings apply: null for the default (no choice made), else the one running
function savedGame() {

	if ( GameSelection_Current() === null ) return null; // the default keeps the original keys, whatever runs
	return running ?? GameSelection_Current();

}

/**
 * The prefix of this game's save keys in localStorage: the original `quake_save_` for the default and the full Quake
 * (the saves made so far were made with it), `quake_save_<id>_` for the shareware, each mission pack and each Hexen II
 * edition (their maps share Quake's names, so their saves must not). It follows the game running: a mission pack
 * chosen without its pack runs Quake, with Quake's saves.
 *
 * @returns {string} the key prefix; a save `s0` is kept under prefix + 's0'
 */
export function GameSelection_SavePrefix() {

	const game = savedGame();
	// Hexen II editions keep their own keys too: their hub slots must never be listed as Quake saves.
	return game === 'shareware' || MISSION_PACKS[ game ] || isAddon( game ) || HEXEN_CHOICES.has( game ) ? `quake_save_${game}_` : 'quake_save_';

}

/**
 * The localStorage key of this game's configuration (key bindings and archived cvars, Host_WriteConfiguration): the
 * original `quake_config` for Quake and the shareware (they bind the same keys), `quake_config_<id>` for a mission
 * pack running, whose own default.cfg binds keys differently (Scourge's 9 and 0 select the Laser Cannon and Mjolnir)
 * and which must not overwrite Quake's, as WinQuake keeps a config.cfg per game folder.
 *
 * @returns {string} the key
 */
export function GameSelection_ConfigKey() {

	// Hexen II has its own default.cfg and bindings; sharing Quake's saved keys would overwrite them on the first run.
	// It is also a desktop start without a saved Quake choice, so the running id is checked as well as the kept one.
	const runningGame = GameSelection_Running();
	if ( HEXEN_CHOICES.has( runningGame ) ) return `quake_config_${runningGame}`;
	const game = savedGame();
	return MISSION_PACKS[ game ] || isAddon( game ) || HEXEN_CHOICES.has( game ) ? `quake_config_${game}` : 'quake_config';

}

/**
 * Whether a catalogue entry can be started, by the rule `GameSelection_Select` and the game shelf (main.js) share. The
 * shareware ships with the page and always can. Another game must be one the engine runs (`GAME_SELECTION_CHOICES`),
 * with no pack broken or unreadable; then either the catalogue found it playable, or it was found but could not be
 * checked because the server ignores byte ranges (every pack's header read, its directory not): such a game can start,
 * since the start reads its packs whole and refuses a broken one.
 *
 * @param {{ id: string, name: string, present?: boolean, validated?: boolean, playable?: boolean, reason?: string,
 *   packs?: Array<{ name?: string, state: string, reason?: string }> }} game a catalogue entry (game_catalogue.js)
 * @returns {{ ok: boolean, unchecked: boolean, refusal: string, why: string }} whether it can start, whether only
 *   unchecked, how a refusal begins ('is not playable' or 'cannot be chosen yet') and why (the catalogue's reason, or
 *   the broken pack)
 */
export function GameSelection_Startable( game, options = {} ) {
	if(options.strict && !(game.present && game.validated && game.playable))return {ok:false,unchecked:false,refusal:"is not playable",why:game.reason || "required game files are unavailable"};

	if ( HEXEN_CHOICES.has( game.id ) ) {

		// Hexen II is offered by the desktop app and a local source checkout; the catalogue has already proved the
		// installation
		if ( ! hexenOffered() )
			return { ok: false, unchecked: false, refusal: 'needs the native desktop app', why: 'Hexen II is not part of the web product' };
		return { ok: true, unchecked: false, refusal: '', why: game.reason ?? '' };

	}
	if ( game.id === 'shareware' ) return { ok: true, unchecked: false, refusal: '', why: game.reason ?? '' };
	if ( ! choosable( game.id ) ) return { ok: false, unchecked: false, refusal: 'cannot be chosen yet', why: game.reason || 'its support is not built' };
	// found but not checked (a server that ignores byte ranges): allowed, as the start reads the whole pack and refuses
	// a broken one; anything else must be playable
	const packs = game.packs ?? [], broken = packs.find( p => p.state === 'invalid' || p.state === 'error' );
	if ( broken ) return { ok: false, unchecked: false, refusal: 'is not playable', why: `its ${broken.name ?? 'pack'} ${broken.state === 'invalid' ? 'is broken' : 'could not be read'} (${broken.reason})` };
	if ( game.present && ! game.validated && packs.length > 0 && packs.every( p => p.state === 'valid' || p.state === 'present' ) ) return { ok: true, unchecked: true, refusal: '', why: game.reason ?? '' };
	if ( ! game.playable ) return { ok: false, unchecked: false, refusal: 'is not playable', why: game.reason ?? '' };
	return { ok: true, unchecked: false, refusal: '', why: game.reason ?? '' };

}

/**
 * Chooses the game to run: checks with the catalogue that it is playable (the shareware, which ships with the page,
 * needs no check; a found pack the server would not let it check is allowed with a warning, since the start reads it
 * whole and refuses a broken one), keeps the choice (read back) and reloads the page so the game starts clean (a page
 * on a game's own URL goes to the chosen game's URL instead).
 *
 * @param {string} id the game's catalogue id ('quake', 'shareware', 'hipnotic', 'rogue'; others are refused)
 * @param {{ refresh?: function(): Promise<object>, reload?: function(): void }} [options] the catalogue refresh and the
 *   page reload to use (tests pass their own)
 * @returns {Promise<{ ok: boolean, reason: string }>} whether it was chosen (the page then reloads), and why not
 */
export async function GameSelection_Select( id, options = {} ) {

	const refresh = options.refresh ?? GameCatalogue_Refresh, reload = options.reload ?? ( () => {

		// a page opened on a game's own URL (?game=<id>, the shelf's) goes to the new game's URL; a reload would keep
		// the old one
		const here = globalThis.location;
		if ( here && GameSelection_UrlChoice( here.search ) !== null ) { const url = new URL( here.href ); url.searchParams.set( 'game', id ); here.assign( url.href ); }
		else here?.reload();

	} );
	let warning = '';
	if ( id !== 'shareware' || Distribution_Profile()==='desktop' ) { // the shareware ships with the page: no evidence needed

		const catalogue = await refresh(), game = catalogue?.games?.find( g => g.id === id );
		if ( ! game ) return { ok: false, reason: `no game called '${id}'` };
		const startable = GameSelection_Startable( game, {strict:Distribution_Profile()==='desktop'} );
		if ( ! startable.ok ) return { ok: false, reason: `${game.name} ${startable.refusal}: ${startable.why}` };
		if ( startable.unchecked ) warning = ` (it could not be checked here: ${game.reason}; the start checks it)`;

	}
	const store = storage();
	if ( store === null ) return { ok: false, reason: 'the choice cannot be kept in this browser (no storage)' };
	try { store.setItem( STORAGE_KEY, id ); } catch { return { ok: false, reason: 'the choice cannot be kept in this browser' }; }
	if ( GameSelection_Kept() !== id ) return { ok: false, reason: 'the choice cannot be kept in this browser (it did not stay)' }; // the kept one: a ?game URL would mask it
	reload();
	return { ok: true, reason: `${gameName( id )}: starting${warning}` };

}

/**
 * Says at start when the game chosen did not start: its owned pack was not found, so the shareware runs instead, or a
 * mission pack's own pack was not, so Quake runs. Called by main.js once the packs are mounted.
 *
 * @param {boolean} mounted whether an owned pack (Quake's) was mounted
 * @param {boolean} [missionMounted] whether the chosen mission pack's own pack was mounted (true when none was chosen)
 * @returns {boolean} false when the chosen game's pack was missing (the line was printed)
 */
export function GameSelection_ReportStart( mounted, missionMounted = true ) {

	const choice = GameSelection_Current();
	const mission = missionEntry( choice );
	if ( mission && ! mounted ) {

		const line = `game: ${mission.name} was chosen, but it needs Quake, whose pack was not found (${ownedPacks( choice ).join( ' or ' )}); the shareware is running\n`;
		Con_Printf( line ); Sys_Printf( line );
		return false;

	}
	if ( mission && ! missionMounted ) {

		const line = mission.folders ? `game: ${mission.name} was chosen, but its packs were not found (no pak0.pak in ${mission.folders.join( ' or ' )}); Quake is running\n` : `game: ${mission.name} was chosen, but its pack was not found (${mission.packs.join( ' or ' )}); Quake is running\n`;
		Con_Printf( line ); Sys_Printf( line );
		return false;

	}
	if ( ! mission && isAddon( choice ) ) {

		// a found add-on's folder that is gone (renamed or removed since it was chosen), or an address naming none
		const line = `game: ${choice} was chosen, but no game folder of that name was found; ${mounted ? 'Quake' : 'the shareware'} is running\n`;
		Con_Printf( line ); Sys_Printf( line );
		return false;

	}
	if ( choice !== null && ownedPacks( choice )?.length > 0 && ! mounted ) {

		const line = `game: ${choice} was chosen, but its pack was not found (${ownedPacks( choice ).join( ' or ' )}); the shareware is running\n`;
		Con_Printf( line ); Sys_Printf( line ); // the game's console and the browser's (as main.js reports its packs)
		return false;

	}
	return true;

}

/**
 * Registers the `game` console command: with no argument it prints the game running and the choices; with one it
 * chooses that game (and the page reloads). Called by Host_Init.
 */
export function GameSelection_Init() {

	Cmd_AddCommand( 'game', () => {

		if ( Cmd_Argc() < 2 ) {

			Con_Printf( `game: ${GameSelection_Current() ?? 'default (the full Quake when installed, else the shareware)'}; choose with 'game quake', 'game shareware', 'game hipnotic' or 'game rogue'\n` );
			return;

		}
		GameSelection_Select( Cmd_Argv( 1 ).toLowerCase() ).then( r => Con_Printf( ( r.ok ? '' : 'game: ' ) + r.reason + '\n' ) )
			.catch( error => Con_Printf( 'game: ' + ( error?.message ?? error ) + '\n' ) );

	} );

}

/**
 * Whether the chosen game is an add-on found by its folder that this page has not yet found (a `mod_...` choice at
 * start, before the catalogue has listed the game library): main.js then refreshes the catalogue before mounting.
 *
 * @returns {boolean}
 */
export function GameSelection_NeedsDiscovery() {

	const id = GameSelection_Current();
	return isAddon( id ) && addonDefinition( id ) === null;

}
