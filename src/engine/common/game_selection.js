/**
 * @module engine/common/game_selection
 *
 * Which game the page runs (card [34c], first increment): the shareware alone, or the full Quake (the owner's pack
 * under the shareware, as main.js has mounted it since the full-game card). The choice is kept in the browser and
 * applied when the page starts: switching reloads the page, which is the clean unmount the engine otherwise lacks
 * (its search path only grows, and its model, sound and picture caches are keyed by file name and kept for the page's
 * life). With no choice kept, the start is exactly as before: the full Quake when its pack is there, else the
 * shareware.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; browser storage.
 *
 * Errors: catches at 6 places.
 *
 * Only a game the catalogue (`game_catalogue.js`, card [34b]) calls playable can be chosen; mission packs, episodes
 * and add-ons are refused with the catalogue's reason until their support exists. Each game keeps its own saves: the
 * default and the full Quake keep the saves' original keys (`quake_save_<name>`), the shareware its own.
 */

import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './cmd.js';
import { Con_Printf } from './console.js';
import { Sys_Printf } from './sys.js';
import { GameCatalogue_Refresh } from './game_catalogue.js';

const STORAGE_KEY = 'quaked.game.v1';
// what each choosable game mounts on top of the shareware, in order tried (card [34a]'s folder, then the owner's
// resources/ until card [34d] moves it there)
const OWNED_PACKS = Object.freeze( { quake: Object.freeze( [ 'games/Quake/pak0.pak', 'resources/id1/pak0.pak' ] ), shareware: Object.freeze( [] ) } );
export const GAME_SELECTION_CHOICES = Object.freeze( Object.keys( OWNED_PACKS ) );

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * The game this page runs: the one its address names (`?game=<id>`), else the one chosen and kept in the browser,
 * else null (the start as before).
 *
 * @returns {?string} 'quake', 'shareware' or null
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
 * @returns {?string} 'quake', 'shareware' or null (no `game`, or one that cannot be chosen)
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
 * @returns {?string} 'quake', 'shareware' or null
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
 * The prefix of this game's save keys in localStorage: the original `quake_save_` for the default and the full Quake
 * (the saves made so far were made with it), `quake_save_shareware_` for the shareware.
 *
 * @returns {string} the key prefix; a save `s0` is kept under prefix + 's0'
 */
export function GameSelection_SavePrefix() {

	return GameSelection_Current() === 'shareware' ? 'quake_save_shareware_' : 'quake_save_';

}

/**
 * Chooses the game to run: checks with the catalogue that it is playable (the shareware, which ships with the page,
 * needs no check; a found pack the server would not let it check is allowed with a warning, since the start reads it
 * whole and refuses a broken one), keeps the choice (read back) and reloads the page so the game starts clean (a page
 * on a game's own URL goes to the chosen game's URL instead).
 *
 * @param {string} id the game's catalogue id ('quake', 'shareware'; others are refused)
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
	return { ok: true, reason: `${id === 'shareware' ? 'Quake (shareware)' : 'Quake'}: starting${warning}` };

}

/**
 * Says at start when the game chosen did not start: its owned pack was not found, so the shareware runs instead.
 * Called by main.js once the packs are mounted.
 *
 * @param {boolean} mounted whether an owned pack was mounted
 * @returns {boolean} false when the chosen game's pack was missing (the line was printed)
 */
export function GameSelection_ReportStart( mounted ) {

	const choice = GameSelection_Current();
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

			Con_Printf( `game: ${GameSelection_Current() ?? 'default (the full Quake when installed, else the shareware)'}; choose with 'game quake' or 'game shareware'\n` );
			return;

		}
		GameSelection_Select( Cmd_Argv( 1 ).toLowerCase() ).then( r => Con_Printf( ( r.ok ? '' : 'game: ' ) + r.reason + '\n' ) )
			.catch( error => Con_Printf( 'game: ' + ( error?.message ?? error ) + '\n' ) );

	} );

}
