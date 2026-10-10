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
 * Errors: catches at 4 places.
 *
 * Only a game the catalogue (`game_catalogue.js`, card [34b]) calls playable can be chosen; mission packs, episodes
 * and add-ons are refused with the catalogue's reason until their support exists. Each game keeps its own saves: the
 * default and the full Quake keep the saves' original keys (`quake_save_<name>`), the shareware its own.
 */

import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from './cmd.js';
import { Con_Printf } from './console.js';
import { GameCatalogue_Refresh } from './game_catalogue.js';

const STORAGE_KEY = 'quaked.game.v1';
// what each choosable game mounts on top of the shareware, in order tried (card [34a]'s folder, then the owner's
// resources/ until card [34d] moves it there)
const OWNED_PACKS = Object.freeze( { quake: Object.freeze( [ 'games/Quake/pak0.pak', 'resources/id1/pak0.pak' ] ), shareware: Object.freeze( [] ) } );
export const GAME_SELECTION_CHOICES = Object.freeze( Object.keys( OWNED_PACKS ) );

const storage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/**
 * The game chosen and kept in the browser, or null when none was chosen (the start as before).
 *
 * @returns {?string} 'quake', 'shareware' or null
 */
export function GameSelection_Current() {

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
 * Chooses the game to run: checks with the catalogue that it is playable, keeps the choice and reloads the page so the
 * game starts clean.
 *
 * @param {string} id the game's catalogue id ('quake', 'shareware'; others are refused)
 * @param {{ refresh?: function(): Promise<object>, reload?: function(): void }} [options] the catalogue refresh and the
 *   page reload to use (tests pass their own)
 * @returns {Promise<{ ok: boolean, reason: string }>} whether it was chosen (the page then reloads), and why not
 */
export async function GameSelection_Select( id, options = {} ) {

	const refresh = options.refresh ?? GameCatalogue_Refresh, reload = options.reload ?? ( () => globalThis.location?.reload() );
	const catalogue = await refresh(), game = catalogue?.games?.find( g => g.id === id );
	if ( ! game ) return { ok: false, reason: `no game called '${id}'` };
	if ( ! GAME_SELECTION_CHOICES.includes( id ) ) return { ok: false, reason: `${game.name} cannot be chosen yet: ${game.reason || 'its support is not built'}` };
	if ( ! game.playable ) return { ok: false, reason: `${game.name} is not playable: ${game.reason}` };
	try { storage()?.setItem( STORAGE_KEY, id ); } catch { return { ok: false, reason: 'the choice cannot be kept in this browser' }; }
	reload();
	return { ok: true, reason: `${game.name}: starting` };

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
