// Choosing the game (src/engine/common/game_selection.js, card [34c]): with no choice the start is as before (the
// full Quake's pack is fetched when there, saves under their original keys); choosing the shareware keeps the choice,
// reloads the page, fetches no owned pack and keeps its own saves; a game the catalogue does not call playable, and
// one whose support is not built (a mission pack), is refused with the reason; a blocked store refuses honestly.
import { GameSelection_Current, GameSelection_OwnedPacks, GameSelection_SavePrefix, GameSelection_Select } from '../src/engine/common/game_selection.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const store = new Map();
globalThis.localStorage = { getItem: k => store.has( k ) ? store.get( k ) : null, setItem: ( k, v ) => store.set( k, String( v ) ), removeItem: k => store.delete( k ) };
const catalogue = ( quakePlayable = true ) => async () => ( { games: [
	{ id: 'shareware', name: 'Quake (shareware)', playable: true, reason: 'the shareware episode and its QuakeC' },
	{ id: 'quake', name: 'Quake', playable: quakePlayable, reason: quakePlayable ? 'Episodes 1 to 4' : 'not installed' },
	{ id: 'hipnotic', name: 'Scourge of Armagon', playable: false, reason: 'its HUD, QuakeC and protocol support are not yet shown to work' }
] } );

Deno.test( 'with no choice, the start is as before', () => {

	store.clear();
	check( GameSelection_Current() === null, 'nothing chosen' );
	check( GameSelection_OwnedPacks().join() === 'games/Quake/pak0.pak,resources/id1/pak0.pak', 'the full Quake fetched when there (its new folder, then resources/)' );
	check( GameSelection_SavePrefix() === 'quake_save_', 'saves keep their original keys' );

} );

Deno.test( 'choosing the shareware keeps it, reloads, fetches no owned pack and keeps its own saves', async () => {

	store.clear(); let reloads = 0;
	const r = await GameSelection_Select( 'shareware', { refresh: catalogue(), reload: () => reloads ++ } );
	check( r.ok && reloads === 1, 'chosen, and the page reloads to start it clean' );
	check( GameSelection_Current() === 'shareware' && GameSelection_OwnedPacks().length === 0, 'no owned pack downloaded for the shareware' );
	check( GameSelection_SavePrefix() === 'quake_save_shareware_', 'its own saves' );
	await GameSelection_Select( 'quake', { refresh: catalogue(), reload: () => reloads ++ } );
	check( GameSelection_SavePrefix() === 'quake_save_' && reloads === 2, 'back to the full Quake: its saves are the original ones' );

} );

Deno.test( 'unplayable, unsupported and unknown games are refused with the reason; a blocked store refuses', async () => {

	store.clear(); let reloads = 0; const reload = () => reloads ++;
	const missing = await GameSelection_Select( 'quake', { refresh: catalogue( false ), reload } );
	check( ! missing.ok && /not playable: not installed/.test( missing.reason ), 'the full Quake, not installed' );
	const mission = await GameSelection_Select( 'hipnotic', { refresh: catalogue(), reload } );
	check( ! mission.ok && /cannot be chosen yet: its HUD/.test( mission.reason ), 'a mission pack, with its reason' );
	const unknown = await GameSelection_Select( 'doom', { refresh: catalogue(), reload } );
	check( ! unknown.ok && /no game called/.test( unknown.reason ), 'an unknown game' );
	check( reloads === 0 && GameSelection_Current() === null, 'nothing kept, no reload' );
	const saved = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error( 'blocked' ); } };
	const blocked = await GameSelection_Select( 'shareware', { refresh: catalogue(), reload } );
	globalThis.localStorage = saved;
	check( ! blocked.ok && /cannot be kept/.test( blocked.reason ) && reloads === 0, 'a blocked store: refused, no reload' );

} );
