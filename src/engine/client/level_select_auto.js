/**
 * @module engine/client/level_select_auto
 *
 * Level Select for a game with no table of its own (an add-on, known or found by its folder), built from the game's own
 * maps (docs/add-ons-2026-10-13.md, step 3): the engine reads each map's entities, as it reads anything else an add-on
 * brings, instead of a hand-written list per add-on. A map is offered when it has a player start (props with none, such
 * as Malice's item models, are left out); it is named by its worldspawn message (tidied: one line, single spaces, no
 * trailing full stop, title case when all in one case, without a "Name - " prefix several maps share; a blank message
 * gives the file name); and it is grouped by its name: `start` and intro maps first, numbered episodes (`x1m1`,
 * `aop2m3`, `soe1m4`, and `x1end`: the digit before `m` or `end`), then the other levels, final levels (`*end`, `*exit`) and deathmatch (maps with only deathmatch starts, or named `dm`, `arena` or `ctf`). No group holds
 * more than LEVEL_SELECT_AUTO_PAGE levels, the most an episode's page shows; a longer one is split into parts.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: module-level `gamePacks` (set by main.js) and `cached` (the table built from them, rebuilt when they change).
 *
 * Errors: none raised; an unreadable map is left out.
 */

/** The most levels one episode's page shows (menu_levelselect.js). */
export const LEVEL_SELECT_AUTO_PAGE = 14;

const LATIN1 = new TextDecoder( 'latin1' );
const START = /"classname"\s*"info_player_(?:start2?|coop)"/i, DEATHMATCH = /"classname"\s*"info_player_deathmatch"/i;

/**
 * Reads what Level Select needs from one map: its message and its kinds of player start.
 *
 * @param {Uint8Array} bsp the map file (BSP29, BSP2 or 2PSB: the entities are lump 0 in each)
 * @returns {?{ message: string, start: boolean, deathmatch: boolean, exits: Array<string> }} null when the file cannot
 *   be read as a map; `exits` are the maps its `trigger_changelevel`s lead to
 */
export function LevelSelect_ReadMap( bsp ) {

	if ( ! bsp || bsp.length < 12 ) return null;
	const view = new DataView( bsp.buffer, bsp.byteOffset, bsp.byteLength ), version = view.getInt32( 0, true );
	const magic = String.fromCharCode( bsp[ 0 ], bsp[ 1 ], bsp[ 2 ], bsp[ 3 ] );
	if ( version !== 29 && magic !== 'BSP2' && magic !== '2PSB' ) return null;
	const ofs = view.getInt32( 4, true ), len = view.getInt32( 8, true );
	if ( ofs < 0 || len < 0 || ofs + len > bsp.length ) return null;
	const lump = bsp.subarray( ofs, ofs + len ), nul = lump.indexOf( 0 );
	const text = LATIN1.decode( nul < 0 ? lump : lump.subarray( 0, nul ) ); // (one call: Arcane Dimensions' lumps are MBs)
	const world = /\{([^}]*)\}/.exec( text )?.[ 1 ] ?? '';
	const message = /"message"\s*"([^"]*)"/i.exec( world )?.[ 1 ] ?? '';
	// the maps its level exits lead to, in order: Level Select follows them from `start` to order a campaign
	const exits = [];
	for ( const block of text.matchAll( /\{([^}]*)\}/g ) ) {

		if ( ! /"classname"\s*"trigger_changelevel"/i.test( block[ 1 ] ) ) continue;
		const map = /"map"\s*"([^"]*)"/i.exec( block[ 1 ] )?.[ 1 ]?.toLowerCase();
		if ( map && ! exits.includes( map ) ) exits.push( map );

	}
	return { message, start: START.test( text ), deathmatch: DEATHMATCH.test( text ), exits };

}

// a message as a label: one line, single spaces, no trailing full stop; a message all in one case in title case
// ("SECRET MISSIONS", "the blackness beneath"); blank: the map's file name
const SMALL = new Set( [ 'a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to' ] );
// a capitalised word that stays as written: initials ("B.O.S.S."), Roman numerals ("III"), short words with no vowel ("HQ")
const KEEP = word => word.includes( '.' ) || /^[IVXLC]+$/.test( word ) || ( word.length <= 3 && ! /[AEIOUY]/.test( word ) );
const capital = w => w.split( '-' ).map( p => p.charAt( 0 ).toUpperCase() + p.slice( 1 ) ).join( '-' ); // "X-Men"
function label( message, map ) {

	const text = message.replace( /\\n|\s+/g, ' ' ).trim().replace( /\.+$/, '' );
	if ( ! text ) return map.replace( /_+$/, '' );
	if ( text !== text.toUpperCase() && text !== text.toLowerCase() ) return text;
	return text.split( ' ' ).map( ( word, i ) => {

		const w = word.toLowerCase();
		if ( i > 0 && SMALL.has( w ) ) return w;
		if ( word === word.toUpperCase() && KEEP( word ) ) return word;
		return capital( w );

	} ).join( ' ' );

}
// natural order (e1m2 before e1m10), an episode's end or exit map last
const isEnd = l => /(?:end|exit)$/i.test( l.map );
const byName = ( a, b ) => isEnd( a ) - isEnd( b ) || a.map.localeCompare( b.map, undefined, { numeric: true } );

/**
 * Builds a Level Select table from a game's maps. Groups are numbered from 1 after the Introduction (0), so the menu
 * opens on the first campaign group as it opens on Quake's Episode 1. Unnumbered levels follow the campaign: in the
 * order the level exits lead from `start` (and the intro maps), and those no exit reaches (test maps, extras) in a
 * later "Other Levels" group; without any exits to follow, in name order.
 *
 * @param {Array<{ map: string, info: ?{ message: string, start: boolean, deathmatch: boolean, exits?: Array<string> } }>}
 *   maps the game's own maps (names without `maps/` and `.bsp`) and what LevelSelect_ReadMap found in each
 * @returns {?{ episodes: Array<{ episode: number, name: string }>, levels: Array<{ episode: number, map: string,
 *   name: string }> }} the table, or null when no map has a player start
 */
export function LevelSelect_AutoTable( maps ) {

	// a "Name - " prefix that several maps' messages share is the game's own name ("Soul of Evil - Introduction"): the
	// labels keep the part that tells the maps apart
	const prefixes = new Map();
	for ( const { info } of maps ) { const m = /^(.+?) - ./.exec( info?.message ?? '' ); if ( m ) prefixes.set( m[ 1 ].toLowerCase(), ( prefixes.get( m[ 1 ].toLowerCase() ) ?? 0 ) + 1 ); }
	const unprefixed = message => { const m = /^(.+?) - (.+)$/.exec( message ); return m && prefixes.get( m[ 1 ].toLowerCase() ) >= 2 ? m[ 2 ] : message; };
	// the campaign order: each map first reached by following the level exits from the introduction
	const exits = new Map( maps.map( ( { map, info } ) => [ map.toLowerCase(), info?.exits ?? [] ] ) ), reach = new Map();
	const walk = from => { for ( const to of exits.get( from ) ?? [] ) if ( exits.has( to ) && ! reach.has( to ) ) { reach.set( to, reach.size ); walk( to ); } };
	for ( const m of [ ...exits.keys() ].filter( m => m === 'start' || /intro|start$/.test( m ) ).sort( ( a, b ) => ( b === 'start' ) - ( a === 'start' ) ) ) { if ( ! reach.has( m ) ) reach.set( m, reach.size ); walk( m ); }
	const groups = new Map(); // group key -> { name, order, levels }
	const add = ( key, name, order, level ) => { if ( ! groups.has( key ) ) groups.set( key, { key, name, order, levels: [] } ); groups.get( key ).levels.push( level ); };
	const series = new Map(); // episode number -> its series prefixes, to name them apart when two share a number
	for ( const { map } of maps ) { const e = /^(.*?)(\d+)(?:m\d+|end)$/.exec( map.toLowerCase() ); if ( e ) { const n = Number( e[ 2 ] ); series.set( n, new Set( [ ...( series.get( n ) ?? [] ), e[ 1 ] ] ) ); } }
	const sortedPrefixes = [ ...new Set( [ ...series.values() ].flatMap( p => [ ...p ] ) ) ].sort();
	for ( const { map, info } of maps ) {

		if ( ! info || ( ! info.start && ! info.deathmatch ) ) continue; // a prop or model, not a level
		const level = { map, name: label( unprefixed( info.message ), map ) }, lower = map.toLowerCase();
		const episode = /^(.*?)(\d+)(?:m\d+|end)$/.exec( lower ); // x1m2, and x1end: episode 1's last level
		if ( ( ! info.start && info.deathmatch ) || /dm\d*$|dm\d+|arena|ctf/.test( lower ) ) add( 'dm', 'Deathmatch', 4000, level );
		else if ( lower === 'start' || /intro|start$/.test( lower ) ) add( 'intro', 'Introduction', 0, level );
		else if ( episode ) {

			const n = Number( episode[ 2 ] ), shared = series.get( n ).size > 1;
			add( 'e' + episode[ 1 ] + n, shared ? `${episode[ 1 ].replace( /_+$/, '' ).toUpperCase()}${n}` : 'Episode ' + n, 1000 + Math.min( n, 99 ) * 10 + Math.min( sortedPrefixes.indexOf( episode[ 1 ] ), 9 ), level );

		} else if ( /end$|exit$|final/.test( lower ) ) add( 'end', 'Final Levels', 3000, level );
		else add( 'levels', 'Levels', 2000, level );

	}
	// unnumbered levels: the campaign in the order its exits reach them; the levels no exit reaches go after it
	const levelsGroup = groups.get( 'levels' );
	if ( levelsGroup && levelsGroup.levels.some( l => reach.has( l.map.toLowerCase() ) ) ) {

		const other = levelsGroup.levels.filter( l => ! reach.has( l.map.toLowerCase() ) );
		levelsGroup.levels = levelsGroup.levels.filter( l => reach.has( l.map.toLowerCase() ) );
		levelsGroup.byReach = true;
		if ( other.length ) groups.set( 'other', { key: 'other', name: 'Other Levels', order: 2500, levels: other } );

	}
	if ( groups.size === 0 ) return null;
	const episodes = [], levels = [];
	let number = 1;
	for ( const group of [ ...groups.values() ].sort( ( a, b ) => a.order - b.order ) ) {

		if ( group.byReach ) group.levels.sort( ( a, b ) => reach.get( a.map.toLowerCase() ) - reach.get( b.map.toLowerCase() ) );
		else group.levels.sort( byName );
		if ( group.key === 'intro' ) group.levels.sort( ( a, b ) => ( b.map.toLowerCase() === 'start' ) - ( a.map.toLowerCase() === 'start' ) ); // start first
		const parts = Math.ceil( group.levels.length / LEVEL_SELECT_AUTO_PAGE );
		for ( let p = 0; p < parts; p ++ ) {

			const n = group.key === 'intro' && p === 0 ? 0 : number ++;
			episodes.push( { episode: n, name: p > 0 ? `${group.name} (${p + 1})` : group.name } );
			for ( const l of group.levels.slice( p * LEVEL_SELECT_AUTO_PAGE, ( p + 1 ) * LEVEL_SELECT_AUTO_PAGE ) ) levels.push( { episode: n, ...l } );

		}

	}
	return { episodes, levels };

}

/**
 * The packs of a game that are its own (an add-on's over Quake's): in the Mac app the library names each pack
 * `<game id>/<file>` (src-tauri/src/library.rs), so the game's are those under its id, its loose files' pack included.
 *
 * @param {Array<{ filename: string }>} packs every pack the app mounted
 * @param {string} id the game's id
 * @returns {Array<object>} its own packs
 */
export function LevelSelect_OwnPacks( packs, id ) {

	return packs.filter( p => typeof p?.filename === 'string' && p.filename.startsWith( id + '/' ) );

}

let gamePacks = [], cached = null;

/**
 * Names the running game's own packs (an add-on's, mounted over Quake), whose maps Level Select offers when the game
 * has no table of its own. Called by main.js once the packs are mounted; an empty list for any other game.
 *
 * @param {Array<{ files: Array<{ name: string, filepos: number, filelen: number }>, data: ArrayBuffer }>} packs the packs
 */
export function LevelSelect_SetGamePacks( packs ) {

	gamePacks = Array.isArray( packs ) ? packs.filter( p => p?.files && p.data ) : [];
	cached = null;

}

/**
 * The table built from the game's own packs (LevelSelect_SetGamePacks), made once and kept. A later pack's copy of a
 * map wins, as the engine loads it.
 *
 * @returns {?{ episodes: Array<object>, levels: Array<object> }} the table, or null (no packs, or no map with a start)
 */
export function LevelSelect_GameTable() {

	if ( cached !== null ) return cached.table;
	const files = new Map();
	for ( const pack of gamePacks ) for ( const f of pack.files ) {

		const m = /^maps\/([a-z0-9_\-+]+)\.bsp$/i.exec( f.name ); // a name the `map` command takes whole (no spaces or ';')
		if ( m ) files.set( m[ 1 ].toLowerCase(), { pack, f, map: m[ 1 ] } );

	}
	const maps = [];
	for ( const { pack, f, map } of files.values() ) {

		let info = null;
		try { info = LevelSelect_ReadMap( new Uint8Array( pack.data, f.filepos, f.filelen ) ); } catch { info = null; }
		maps.push( { map, info } );

	}
	cached = { table: LevelSelect_AutoTable( maps ) };
	return cached.table;

}
