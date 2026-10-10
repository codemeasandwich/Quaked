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
import { GameCatalogue_Refresh } from './game_catalogue.js';

const STORAGE_KEY = 'quaked.game.v1';
// what each choosable game mounts on top of the shareware, in order tried (card [34a]'s folder, then the owner's
// resources/ until card [34d] moves it there)
const QUAKE_PACKS = Object.freeze( [ 'games/Quake/pak0.pak', 'resources/id1/pak0.pak' ] );
const OWNED_PACKS = Object.freeze( { quake: QUAKE_PACKS, shareware: Object.freeze( [] ), hipnotic: QUAKE_PACKS, rogue: QUAKE_PACKS } );
// a mission pack mounts its own pack over Quake (and the shareware) and starts with its switch (card [34c])
const MISSION_PACKS = Object.freeze( {
	hipnotic: Object.freeze( { name: 'Scourge of Armagon', switch: '-hipnotic', packs: Object.freeze( [ 'games/Scourge of Armagon/pak0.pak', 'resources/hipnotic/pak0.pak' ] ) } ),
	rogue: Object.freeze( { name: 'Dissolution of Eternity', switch: '-rogue', packs: Object.freeze( [ 'games/Dissolution of Eternity/pak0.pak', 'resources/rogue/pak0.pak' ] ) } )
} );
const NAMES = Object.freeze( { shareware: 'Quake (shareware)', quake: 'Quake', hipnotic: 'Scourge of Armagon', rogue: 'Dissolution of Eternity' } );
export const GAME_SELECTION_CHOICES = Object.freeze( Object.keys( OWNED_PACKS ) );

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * The game this page runs: the one its address names (`?game=<id>`), else the one chosen and kept in the browser,
 * else null (the start as before).
 *
 * @returns {?string} 'quake', 'shareware', 'hipnotic', 'rogue' or null
 */
export function GameSelection_Current() {

	// a game's own URL (`?game=<id>`, the game shelf's links, card [M1]) wins over the choice kept in the browser
	const fromUrl = GameSelection_UrlChoice( globalThis.location?.search ?? '' );
	if ( fromUrl !== null ) return fromUrl;
	let value = null;
	try { value = storage()?.getItem( STORAGE_KEY ) ?? null; } catch { value = null; }
	return GAME_SELECTION_CHOICES.includes( value ) ? value : null;

}

/**
 * The game a page's address names (`?game=<id>`, card [M1]), when it is one that can be chosen.
 *
 * @param {string} search a `location.search`
 * @returns {?string} 'quake', 'shareware', 'hipnotic', 'rogue' or null (no `game`, or one that cannot be chosen)
 */
export function GameSelection_UrlChoice( search ) {

	const id = new URLSearchParams( search || '' ).get( 'game' );
	return GAME_SELECTION_CHOICES.includes( id ) ? id : null;

}

/**
 * Keeps a choice in the browser without reloading (the game shelf then opens the game's own URL), so the shelf starts
 * on it next time.
 *
 * @param {string} id the game's catalogue id
 * @returns {boolean} whether it was kept (only a choosable game, and only where storage works)
 */
export function GameSelection_Remember( id ) {

	if ( ! GAME_SELECTION_CHOICES.includes( id ) ) return false;
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
	return GAME_SELECTION_CHOICES.includes( value ) ? value : null;

}

/**
 * The owned packs to fetch at start for the current choice, in the order to try them; empty for the shareware, so
 * its start downloads nothing more. With no choice, the full Quake's (as before).
 *
 * @returns {ReadonlyArray<string>} pack URLs relative to the page
 */
export function GameSelection_OwnedPacks() {

	return OWNED_PACKS[ GameSelection_Current() ?? 'quake' ];

}

/**
 * The mission pack the current choice runs, if any: its name, its switch for COM_InitArgv and the packs to try for it
 * (the first found), mounted over Quake and the shareware.
 *
 * @returns {?{ name: string, switch: string, packs: ReadonlyArray<string> }} the mission pack, or null for the
 *   shareware, Quake or no choice
 */
export function GameSelection_MissionPack() {

	return MISSION_PACKS[ GameSelection_Current() ] ?? null;

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

// the game whose saves and settings apply: null for the default (no choice made), else the one running
function savedGame() {

	if ( GameSelection_Current() === null ) return null; // the default keeps the original keys, whatever runs
	return running ?? GameSelection_Current();

}

/**
 * The prefix of this game's save keys in localStorage: the original `quake_save_` for the default and the full Quake
 * (the saves made so far were made with it), `quake_save_<id>_` for the shareware and each mission pack (their maps
 * share Quake's names, so their saves must not). It follows the game running: a mission pack chosen without its pack
 * runs Quake, with Quake's saves.
 *
 * @returns {string} the key prefix; a save `s0` is kept under prefix + 's0'
 */
export function GameSelection_SavePrefix() {

	const game = savedGame();
	return game === 'shareware' || MISSION_PACKS[ game ] ? `quake_save_${game}_` : 'quake_save_';

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

	const game = savedGame();
	return MISSION_PACKS[ game ] ? `quake_config_${game}` : 'quake_config';

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
	if ( id !== 'shareware' ) { // the shareware ships with the page: no evidence needed

		const catalogue = await refresh(), game = catalogue?.games?.find( g => g.id === id );
		if ( ! game ) return { ok: false, reason: `no game called '${id}'` };
		if ( ! GAME_SELECTION_CHOICES.includes( id ) ) return { ok: false, reason: `${game.name} cannot be chosen yet: ${game.reason || 'its support is not built'}` };
		// found but not checked (a server that ignores byte ranges): allowed, as the start reads the whole pack and
		// refuses a broken one; anything else must be playable
		const packs = game.packs ?? [], broken = packs.find( p => p.state === 'invalid' || p.state === 'error' );
		if ( broken ) return { ok: false, reason: `${game.name} is not playable: its ${broken.name ?? 'pack'} ${broken.state === 'invalid' ? 'is broken' : 'could not be read'} (${broken.reason})` };
		if ( game.present && ! game.validated && packs.every( p => p.state === 'valid' || p.state === 'present' ) ) warning = ` (it could not be checked here: ${game.reason}; the start checks it)`;
		else if ( ! game.playable ) return { ok: false, reason: `${game.name} is not playable: ${game.reason}` };

	}
	const store = storage();
	if ( store === null ) return { ok: false, reason: 'the choice cannot be kept in this browser (no storage)' };
	try { store.setItem( STORAGE_KEY, id ); } catch { return { ok: false, reason: 'the choice cannot be kept in this browser' }; }
	if ( GameSelection_Kept() !== id ) return { ok: false, reason: 'the choice cannot be kept in this browser (it did not stay)' }; // the kept one: a ?game URL would mask it
	reload();
	return { ok: true, reason: `${NAMES[ id ]}: starting${warning}` };

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
	const mission = MISSION_PACKS[ choice ];
	if ( mission && ! mounted ) {

		const line = `game: ${mission.name} was chosen, but it needs Quake, whose pack was not found (${OWNED_PACKS[ choice ].join( ' or ' )}); the shareware is running\n`;
		Con_Printf( line ); Sys_Printf( line );
		return false;

	}
	if ( mission && ! missionMounted ) {

		const line = `game: ${mission.name} was chosen, but its pack was not found (${mission.packs.join( ' or ' )}); Quake is running\n`;
		Con_Printf( line ); Sys_Printf( line );
		return false;

	}
	if ( choice !== null && OWNED_PACKS[ choice ].length > 0 && ! mounted ) {

		const line = `game: ${choice} was chosen, but its pack was not found (${OWNED_PACKS[ choice ].join( ' or ' )}); the shareware is running\n`;
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
