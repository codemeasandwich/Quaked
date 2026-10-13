// Choosing the game (src/engine/common/game_selection.js, card [34c]): with no choice the start is as before (the
// full Quake's pack is fetched when there, saves under their original keys); choosing the shareware keeps the choice,
// reloads the page, fetches no owned pack and keeps its own saves; a game the catalogue does not call playable, and
// one whose support is not built (a mission pack), is refused with the reason; a blocked store refuses honestly.
import { GameSelection_SetRunning, GameSelection_ConfigKey, GameSelection_MissionPack, GameSelection_FetchMission, GameSelection_LibraryOrder, GameSelection_FetchLoose, GameSelection_Current, GameSelection_OwnedPacks, GameSelection_SavePrefix, GameSelection_Select, GameSelection_ReportStart, GameSelection_Startable, GameSelection_SwitchFromWad } from '../src/engine/common/game_selection.js';

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
	check( ! addon.ok && /Arcane Dimensions is not playable: not yet/.test( addon.reason ), 'an add-on is chosen like any game: refused only when the catalogue says it cannot play, with its reason' );
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
	store.set( 'quaked.game.v1', 'mod_gone_since' ); // a found add-on whose folder was removed after it was chosen
	check( GameSelection_ReportStart( true, true ) === false, 'a found add-on no folder names any more: reported, not run as Quake silently' );
	store.clear();

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

Deno.test( 'one rule for the shelf and the console: what can start, including a game a range-less server could not check', () => {

	const unread = { name: 'pak0.pak', state: 'present', reason: 'the server ignores byte ranges, so its directory was not read' };
	const s = GameSelection_Startable( { id: 'shareware', name: 'Quake (shareware)', present: true, validated: false, playable: false, reason: 'found, not validated', packs: [ unread ] } );
	check( s.ok && ! s.unchecked, 'the shareware always starts (it ships with the page)' );
	const q = GameSelection_Startable( { id: 'quake', name: 'Quake', present: true, validated: false, playable: false, reason: 'found, not validated: ' + unread.reason, packs: [ unread ] } );
	check( q.ok && q.unchecked && /byte ranges/.test( q.why ), 'Quake found on a range-less server: starts, unchecked' );
	const m = GameSelection_Startable( { id: 'hipnotic', name: 'Scourge of Armagon', present: true, validated: true, playable: true, reason: 'a mission pack', packs: [ { name: 'pak0.pak', state: 'valid' } ] } );
	check( m.ok && ! m.unchecked, 'a checked, playable mission pack starts' );
	const b = GameSelection_Startable( { id: 'quake', name: 'Quake', present: true, validated: false, playable: false, reason: 'x', packs: [ { name: 'pak0.pak', state: 'invalid', reason: 'not a packfile' } ] } );
	check( ! b.ok && b.refusal === 'is not playable' && /is broken \(not a packfile\)/.test( b.why ), 'a broken pack is refused' );
	const a = GameSelection_Startable( { id: 'ad', name: 'Arcane Dimensions', present: true, validated: false, playable: false, reason: 'found, not validated', packs: [ unread ] } );
	check( a.ok && a.unchecked, 'an add-on found but not checkable follows the same rule as any game: allowed, with a warning' );
	const e = GameSelection_Startable( { id: 'mod_empty', name: 'Empty', present: true, validated: true, playable: false, reason: 'it has neither maps nor QuakeC of its own', packs: [ { name: 'pak0.pak', state: 'valid' } ] } );
	check( ! e.ok && /neither maps nor QuakeC/.test( e.why ), 'an add-on with nothing to play is refused with the reason' );
	const x = GameSelection_Startable( { id: 'doom', name: 'Doom', present: true, validated: true, playable: true, packs: [] } );
	check( ! x.ok && x.refusal === 'cannot be chosen yet', 'a name that is no game of this engine is refused' );
	const n = GameSelection_Startable( { id: 'rogue', name: 'Dissolution of Eternity', present: true, validated: true, playable: false, reason: 'its gfx.wad is missing', packs: [ { name: 'pak0.pak', state: 'valid' } ] } );
	check( ! n.ok && /gfx\.wad/.test( n.why ), 'a checked mission pack that is not whole is refused' );

} );

Deno.test( 'an add-on fetches every pack of its folder in order, up to the first gap; a mission pack its first found', async () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	const fetcher = present => { const asked = []; return { asked, fetch: async url => { asked.push( url ); return present.includes( url ) ? { url } : null; } }; };
	const quoth = { name: 'Quoth', folders: [ 'games/Quoth', 'resources/quoth' ] };
	let f = fetcher( [ 'games/Quoth/pak0.pak', 'games/Quoth/pak1.pak', 'games/Quoth/pak2.pak', 'games/Quoth/pak4.pak' ] );
	let packs = await GameSelection_FetchMission( quoth, f.fetch );
	same( packs.map( p => p.url ).join(), 'games/Quoth/pak0.pak,games/Quoth/pak1.pak,games/Quoth/pak2.pak', 'pak0 to pak2 in order (the last mounted wins); pak4 after the gap is not read' );
	f = fetcher( [ 'resources/quoth/pak0.pak', 'resources/quoth/pak1.pak' ] );
	packs = await GameSelection_FetchMission( quoth, f.fetch );
	same( packs.map( p => p.url ).join(), 'resources/quoth/pak0.pak,resources/quoth/pak1.pak', 'the next folder when the first has no pak0' );
	same( await GameSelection_FetchMission( quoth, fetcher( [ 'games/Quoth/pak1.pak' ] ).fetch ), null, 'no pak0 anywhere: nothing' );
	f = fetcher( [ 'resources/rogue/pak0.pak' ] );
	same( ( await GameSelection_FetchMission( { packs: [ 'games/Dissolution of Eternity/pak0.pak', 'resources/rogue/pak0.pak' ] }, f.fetch ) ).url, 'resources/rogue/pak0.pak', 'a mission pack: its first pack found' );
	same( await GameSelection_FetchMission( null, f.fetch ), null, 'no mission: nothing' );
	same( GameSelection_MissionPack(), null, 'with no choice there is no mission entry' );

} );

Deno.test( 'an add-on\'s loose game files become one pack mounted under its own packs', async () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	const present = [ 'games/X-Men/pak0.pak', 'games/X-Men/pak1.pak' ], loose = { 'games/X-Men/progs.dat': 'qc', 'games/X-Men/autoexec.cfg': 'bind i prevtoy' };
	const made = [];
	const packs = await GameSelection_FetchMission( { name: 'X-Men', folders: [ 'games/X-Men' ] }, async url => present.includes( url ) ? { url } : null,
		async url => loose[ url ] ? new TextEncoder().encode( loose[ url ] ) : null, ( name, files ) => { made.push( files.map( f => f.name ).join() ); return { url: name }; } );
	same( packs.map( p => p.url ).join(), 'games/X-Men/loose,games/X-Men/pak0.pak,games/X-Men/pak1.pak', 'the loose pack first (mounted first, so the packs win), then the packs' );
	same( made.join( '|' ), 'progs.dat,autoexec.cfg', 'progs.dat and autoexec.cfg, not config.cfg' );
	const none = await GameSelection_FetchMission( { name: 'Quoth', folders: [ 'games/Quoth' ] }, async url => url === 'games/Quoth/pak0.pak' ? { url } : null, async () => null, () => { throw Error( 'no loose files: no pack' ); } );
	same( none.map( p => p.url ).join(), 'games/Quoth/pak0.pak', 'no loose files: only the packs' );

} );

Deno.test( 'a folder of loose files with its own QuakeC starts alone; folder names are fetched percent-encoded', async () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	const loose = { 'games/Mod%20%232/progs.dat': 'qc' }, asked = [];
	const packs = await GameSelection_FetchMission( { name: 'Mod #2', folders: [ 'games/Mod #2' ] }, async url => { asked.push( url ); return null; },
		async url => { asked.push( url ); return loose[ url ] ? new TextEncoder().encode( loose[ url ] ) : null; }, name => ( { url: name } ) );
	same( packs?.map( p => p.url ).join(), 'games/Mod #2/loose', 'no pack, but a progs.dat: the loose pack is the add-on (the catalogue calls it playable)' );
	check( asked.includes( 'games/Mod%20%232/pak0.pak' ) && ! asked.some( u => u.includes( '#' ) ), 'every URL is percent-encoded: ' + asked.join() );
	const cfgOnly = await GameSelection_FetchMission( { name: 'Cfg', folders: [ 'games/Cfg' ] }, async () => null,
		async url => url === 'games/Cfg/autoexec.cfg' ? new Uint8Array( [ 98 ] ) : null, () => { throw Error( 'no add-on here' ); } );
	same( cfgOnly, null, 'loose files without QuakeC or packs are not an add-on' );

} );

Deno.test( 'the Mac app mounts base packs, then the add-on\'s loose files, then its packs; a base game\'s loose files never', () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	const e = ( game, name, loose = false ) => ( { game, name, loose } );
	const entries = [ e( 'quake', 'pak0.pak' ), e( 'quake', 'autoexec.cfg', true ), e( 'xmen', 'pak0.pak' ), e( 'xmen', 'pak1.pak' ), e( 'xmen', 'progs.dat', true ), e( 'xmen', 'autoexec.cfg', true ) ];
	const show = steps => steps.map( s => s.loose ? 'loose(' + s.loose.map( x => x.name ).join( '+' ) + ')' : s.pack.game + '/' + s.pack.name ).join( ' ' );
	same( show( GameSelection_LibraryOrder( entries, [ 'quake', 'xmen' ], 'xmen' ) ), 'quake/pak0.pak loose(progs.dat+autoexec.cfg) xmen/pak0.pak xmen/pak1.pak', 'an add-on over Quake' );
	same( show( GameSelection_LibraryOrder( entries, [ 'quake' ], null ) ), 'quake/pak0.pak', 'Quake alone: the player\'s autoexec.cfg is not mounted' );

} );

Deno.test( 'a loose file is fetched whole; a page or an oversized file is refused', async () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	const reply = ( body, headers = {} ) => async () => new Response( body, { status: 200, headers } );
	same( new TextDecoder().decode( await GameSelection_FetchLoose( 'x', reply( 'bind i prevtoy' ) ) ), 'bind i prevtoy', 'a file' );
	same( await GameSelection_FetchLoose( 'x', reply( 'quake.rc', { 'Content-Type': 'text/html' } ) ), null, 'an HTML content type' );
	same( await GameSelection_FetchLoose( 'x', reply( '<!doctype html><p>index' ) ), null, 'a body that is a page' );
	same( await GameSelection_FetchLoose( 'x', async () => new Response( null, { status: 404 } ) ), null, 'not there' );
	// no Content-Length: counted as it streams
	const big = new ReadableStream( { start( c ) { for ( let i = 0; i < 65; i ++ ) c.enqueue( new Uint8Array( 1024 * 1024 ) ); c.close(); } } );
	same( await GameSelection_FetchLoose( 'x', async () => new Response( big ) ), null, 'over 64 MB with no Content-Length' );
	// a declared length over the limit is refused before reading (a hand-made response: Response would correct the header)
	let read = false;
	const declared = { ok: true, headers: new Headers( { 'Content-Length': String( 64 * 1024 * 1024 + 1 ) } ), body: { cancel: async () => {}, getReader: () => { read = true; return null; } }, arrayBuffer: async () => { read = true; return new ArrayBuffer( 0 ); } };
	same( await GameSelection_FetchLoose( 'x', async () => declared ), null, 'a Content-Length over 64 MB' ); same( read, false, 'refused without reading' );
	// a download that breaks off is left out, not an error that stops the start
	const broken = new ReadableStream( { start( c ) { c.enqueue( new Uint8Array( 2 ) ); c.error( new Error( 'connection reset' ) ); } } );
	same( await GameSelection_FetchLoose( 'x', async () => new Response( broken ) ), null, 'a broken download' );

} );

Deno.test( 'the app library gives loose files to exactly the catalogue\'s add-ons', async () => {

	const { GAME_CATALOGUE_GAMES } = await import( '../src/engine/common/game_catalogue.js' );
	const rust = await Deno.readTextFile( new URL( '../src-tauri/src/library.rs', import.meta.url ) );
	const listed = /pub const ADDONS: &\[&str\] = &\[([^\]]*)\]/.exec( rust )[ 1 ].match( /"([^"]+)"/g ).map( s => s.slice( 1, -1 ) ).sort().join();
	check( listed === GAME_CATALOGUE_GAMES.filter( g => g.kind === 'addon' ).map( g => g.id ).sort().join(), 'library.rs ADDONS: ' + listed );
	const games = [ ...rust.matchAll( /\("([a-z0-9_]+)", &\[/g ) ].map( m => m[ 1 ] ).sort().join();
	check( games === GAME_CATALOGUE_GAMES.filter( g => ! g.placeholder ).map( g => g.id ).sort().join(), 'library.rs GAMES: ' + games );

} );

Deno.test( 'an add-on runs with the switch its own status-bar pictures ask for, as Quakespasm runs it', () => {

	const same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
	// a WAD2 of the named lumps (no data), as gfx.wad is laid out
	const wad = names => { const b = new Uint8Array( 12 + names.length * 32 ), v = new DataView( b.buffer ); b.set( [ 87, 65, 68, 50 ] ); v.setInt32( 4, names.length, true ); v.setInt32( 8, 12, true ); names.forEach( ( n, i ) => b.set( new TextEncoder().encode( n ), 12 + i * 32 + 16 ) ); return b; };
	const quake = [ 'conchars', 'sb_sigil1', 'inv_shotgun', 'face1' ];
	same( GameSelection_SwitchFromWad( wad( [ ...quake, 'INV_LASER', 'inv_mjolnir', 'sb_wsuit' ] ) ), '-hipnotic', 'Scourge of Armagon\'s pictures (Quoth\'s status bar), any case' );
	same( GameSelection_SwitchFromWad( wad( [ ...quake, 'r_lava', 'r_multirock' ] ) ), '-rogue', 'Dissolution of Eternity\'s' );
	same( GameSelection_SwitchFromWad( wad( quake ) ), null, 'Quake\'s own pictures: standard Quake (Malice, X-Men, Arcane Dimensions)' );
	same( GameSelection_SwitchFromWad( null ), null, 'no gfx.wad' );
	same( GameSelection_SwitchFromWad( new TextEncoder().encode( 'PACK0000000000' ) ), null, 'not a WAD2' );
	// a directory that claims one entry more than the file holds: refused whole, though inv_laser is readable in it
	const over = wad( [ 'inv_laser', ...quake ] ); new DataView( over.buffer ).setInt32( 4, quake.length + 2, true );
	same( GameSelection_SwitchFromWad( over ), null, 'a directory past the end of the file: refused, not read' );
	const negative = wad( [ 'inv_laser' ] ); new DataView( negative.buffer ).setInt32( 4, - 1, true );
	same( GameSelection_SwitchFromWad( negative ), null, 'a negative count: refused' );
	// as COM_FindFile gives it: a view into its pack, at an offset
	const inner = wad( [ ...quake, 'inv_mjolnir' ] ), big = new Uint8Array( inner.length + 100 ); big.set( inner, 37 );
	same( GameSelection_SwitchFromWad( new Uint8Array( big.buffer, 37, inner.length ) ), '-hipnotic', 'a gfx.wad inside a larger buffer' );

} );
