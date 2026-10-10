// Choosing the game (src/engine/common/game_selection.js, card [34c]): with no choice the start is as before (the
// full Quake's pack is fetched when there, saves under their original keys); choosing the shareware keeps the choice,
// reloads the page, fetches no owned pack and keeps its own saves; a game the catalogue does not call playable, and
// one whose support is not built (a mission pack), is refused with the reason; a blocked store refuses honestly.
import { GameSelection_SetRunning, GameSelection_ConfigKey, GameSelection_MissionPack, GameSelection_Current, GameSelection_OwnedPacks, GameSelection_SavePrefix, GameSelection_Select, GameSelection_ReportStart } from '../src/engine/common/game_selection.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const store = new Map();
globalThis.localStorage = { getItem: k => store.has( k ) ? store.get( k ) : null, setItem: ( k, v ) => store.set( k, String( v ) ), removeItem: k => store.delete( k ) };
const catalogue = ( quakePlayable = true ) => async () => ( { games: [
	{ id: 'shareware', name: 'Quake (shareware)', playable: true, reason: 'the shareware episode and its QuakeC' },
	{ id: 'quake', name: 'Quake', playable: quakePlayable, reason: quakePlayable ? 'Episodes 1 to 4' : 'not installed' },
	{ id: 'hipnotic', name: 'Scourge of Armagon', playable: false, reason: 'its HUD, QuakeC and protocol support are not yet shown to work' },
	{ id: 'rogue', name: 'Dissolution of Eternity', playable: true, reason: 'a mission pack' },
	{ id: 'dopa', name: 'Dimension of the Past', playable: true, reason: 'an episode' },
	{ id: 'mg1', name: 'Dimension of the Machine', playable: true, reason: 'an episode' },
	{ id: 'ad', name: 'Arcane Dimensions', playable: false, reason: 'not yet' }
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
	check( ! mission.ok && /Scourge of Armagon is not playable: its HUD/.test( mission.reason ), 'a mission pack the catalogue does not call playable, with its reason' );
	const addon = await GameSelection_Select( 'ad', { refresh: catalogue(), reload } );
	check( ! addon.ok && /cannot be chosen yet/.test( addon.reason ), 'an add-on not yet supported (Arcane Dimensions)' );
	const unknown = await GameSelection_Select( 'doom', { refresh: catalogue(), reload } );
	check( ! unknown.ok && /no game called/.test( unknown.reason ), 'an unknown game' );
	check( reloads === 0 && GameSelection_Current() === null, 'nothing kept, no reload' );
	const saved = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error( 'blocked' ); } };
	const blocked = await GameSelection_Select( 'shareware', { refresh: catalogue(), reload } );
	globalThis.localStorage = saved;
	check( ! blocked.ok && /cannot be kept/.test( blocked.reason ) && reloads === 0, 'a blocked store: refused, no reload' );

} );

Deno.test( 'the shareware needs no catalogue; an unchecked Quake is allowed with a warning; a missing store refuses', async () => {

	store.clear(); let reloads = 0, refreshes = 0; const reload = () => reloads ++;
	const shareware = await GameSelection_Select( 'shareware', { refresh: async () => { refreshes ++; return { games: [] }; }, reload } );
	check( shareware.ok && refreshes === 0, 'the shareware is chosen without asking the catalogue (it ships with the page)' );
	const unchecked = await GameSelection_Select( 'quake', { refresh: async () => ( { games: [ { id: 'quake', name: 'Quake', present: true, validated: false, playable: false, reason: 'found, not validated: the server ignores byte ranges', packs: [ { name: 'pak0.pak', state: 'present' } ] } ] } ), reload } );
	check( unchecked.ok && /could not be checked here/.test( unchecked.reason ), 'a found but unchecked Quake: allowed, with the warning' );
	for ( const [ state, reason, says ] of [ [ 'invalid', 'invalid pack directory', /is broken \(invalid pack directory\)/ ], [ 'error', 'HTTP 500', /could not be read \(HTTP 500\)/ ] ] ) {

		const before = reloads, r = await GameSelection_Select( 'quake', { refresh: async () => ( { games: [ { id: 'quake', name: 'Quake', present: true, validated: false, playable: false, reason: 'found, not validated: ' + reason, packs: [ { name: 'pak0.pak', state, reason } ] } ] } ), reload } );
		check( ! r.ok && says.test( r.reason ) && reloads === before, `a pak0 found ${state}: refused, not called unchecked (${r.reason})` );

	}
	const saved = Object.getOwnPropertyDescriptor( globalThis, 'localStorage' );
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, get() { throw new Error( 'SecurityError' ); } } );
	const before = reloads, blocked = await GameSelection_Select( 'shareware', { refresh: catalogue(), reload } );
	Object.defineProperty( globalThis, 'localStorage', saved );
	check( ! blocked.ok && /no storage/.test( blocked.reason ) && reloads === before, 'storage that cannot be reached: refused, no reload' );

} );

Deno.test( 'a chosen game whose pack has gone is reported at start', () => {

	store.clear(); store.set( 'quaked.game.v1', 'quake' );
	check( GameSelection_ReportStart( false ) === false, 'the full Quake chosen, its pack missing: reported' );
	check( GameSelection_ReportStart( true ) === true, 'mounted: nothing to report' );
	store.set( 'quaked.game.v1', 'shareware' );
	check( GameSelection_ReportStart( false ) === true, 'the shareware needs no owned pack' );

} );

Deno.test( 'a mission pack is chosen with Quake under it, its own pack and switch, and saves of its own', async () => {

	store.clear(); let reloads = 0;
	const chosen = await GameSelection_Select( 'rogue', { refresh: catalogue(), reload: () => reloads ++ } );
	check( chosen.ok && /Dissolution of Eternity: starting/.test( chosen.reason ) && reloads === 1, 'chosen: ' + chosen.reason );
	check( GameSelection_OwnedPacks().join() === 'games/Quake/pak0.pak,resources/id1/pak0.pak', 'Quake is mounted under it' );
	const mission = GameSelection_MissionPack();
	check( mission && mission.switch === '-rogue' && mission.packs.join() === 'games/Dissolution of Eternity/pak0.pak,resources/rogue/pak0.pak', 'its own pack, then its switch' );
	check( GameSelection_SavePrefix() === 'quake_save_rogue_', 'its saves are its own (its maps share names with no one, but its start does)' );
	store.clear();
	check( GameSelection_MissionPack() === null, 'no mission pack otherwise' );

} );

Deno.test( 'saves and settings follow the game running, not only the one chosen; the default keeps the original keys', () => {

	store.clear(); GameSelection_SetRunning( null );
	check( GameSelection_SavePrefix() === 'quake_save_' && GameSelection_ConfigKey() === 'quake_config', 'the default: the original keys' );
	GameSelection_SetRunning( 'shareware' );
	check( GameSelection_SavePrefix() === 'quake_save_' && GameSelection_ConfigKey() === 'quake_config', 'the default stays on them whatever runs (a site with the shareware alone)' );
	store.set( 'quaked.game.v1', 'hipnotic' );
	GameSelection_SetRunning( 'hipnotic' );
	check( GameSelection_SavePrefix() === 'quake_save_hipnotic_' && GameSelection_ConfigKey() === 'quake_config_hipnotic', 'Scourge running: its own saves and its own key bindings (its 0 is Mjolnir)' );
	GameSelection_SetRunning( 'quake' );
	check( GameSelection_SavePrefix() === 'quake_save_' && GameSelection_ConfigKey() === 'quake_config', 'Scourge chosen but its pack missing, so Quake runs: Quake\'s saves and settings' );
	GameSelection_SetRunning( 'shareware' );
	check( GameSelection_SavePrefix() === 'quake_save_shareware_' && GameSelection_ConfigKey() === 'quake_config', 'and without Quake, the shareware\'s' );
	GameSelection_SetRunning( null ); store.clear();

} );

Deno.test( 'a mission pack that could not start says why: Quake missing, or its own pack missing', () => {

	store.set( 'quaked.game.v1', 'rogue' );
	try {
		check( GameSelection_ReportStart( false, false ) === false, 'Quake missing: reported' );
		check( GameSelection_ReportStart( true, false ) === false, 'its own pack missing: reported' );
		check( GameSelection_ReportStart( true, true ) === true, 'both there: nothing to say' );
	} finally { store.clear(); }

} );
