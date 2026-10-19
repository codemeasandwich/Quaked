/**
 * @module engine/common/hexen2_text_resources
 *
 * Hexen II's four text resources, parsed with the native rules: `strings.txt` (the shared, 1-based host string table
 * the indexed prints and plaques name), `puzzles.txt` (the short puzzle-piece name and its full name), `infolist.txt`
 * (the mission pack's objective lines) and `maplist.txt` (Portal's optional per-map program). Each parser accepts CR,
 * LF or CRLF lines and ignores malformed entries the way the native parsers do, rather than taking the level down.
 *
 * Types: plain values and functions; no exported classes.
 * State: module-level tables, replaced by each load.
 * Errors: loaders return `{ ok: false, reason }` for missing or unusable data; they never throw for file content.
 */

import { COM_LoadFileAsString } from './pak.js';

let hostStrings = [];
let puzzleEntries = [];
let infoStrings = [];
let mapEntries = [];

/** Splits text into lines for CR, LF and CRLF files, without the phantom line after a final newline. */
function splitLines( text ) {

	const lines = String( text ).replace( /\r\n?/g, '\n' ).split( '\n' );
	if ( lines.length > 0 && lines[ lines.length - 1 ] === '' ) lines.pop();
	return lines;

}

/**
 * Parses `strings.txt`. Native counts a line per newline and keeps blank lines, so indexes stay stable even for a
 * file with holes. Public indexes are 1-based (`host_string_count` is the last valid index).
 *
 * @param {string} text the file's text
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }} the number of lines
 */
export function Hexen2_ParseStrings( text ) {

	const lines = splitLines( text );
	hostStrings = lines.length === 0 ? [] : lines;
	if ( lines.length === 0 ) return { ok: false, reason: 'strings.txt has no string lines' };
	return { ok: true, count: hostStrings.length };

}

/**
 * Loads `strings.txt` from the mounted game data.
 *
 * @param {?string} [text] the file's text (a test or host that already read it), or null to read the search path
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_LoadStrings( text = null ) {

	const source = text ?? COM_LoadFileAsString( 'strings.txt' );
	if ( source === null || source === undefined ) { hostStrings = []; return { ok: false, reason: 'could not load strings.txt' }; }
	return Hexen2_ParseStrings( source );

}

/** The number of host strings; the highest valid 1-based index. */
export function Hexen2_HostStringCount() { return hostStrings.length; }

/**
 * A host string by its 1-based index, as the builtins use it.
 *
 * @param {number} index 1..`Hexen2_HostStringCount()`
 * @returns {?string} the line, or null outside the table
 */
export function Hexen2_GetHostString( index ) {

	return Number.isInteger( index ) && index >= 1 && index <= hostStrings.length ? hostStrings[ index - 1 ] : null;

}

/** A host string by its 0-based internal index, for the HUD and intermission. */
export function Hexen2_GetHostStringAt( index ) {

	return Number.isInteger( index ) && index >= 0 && index < hostStrings.length ? hostStrings[ index ] : null;

}

/**
 * Parses `puzzles.txt`: the first line is the intended entry count, then `<short name> <full name>` lines. A short
 * name is matched case-insensitively; malformed or surplus lines are skipped.
 *
 * @param {string} text the file's text
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }} the number of usable entries
 */
export function Hexen2_ParsePuzzleStrings( text ) {

	const lines = splitLines( text );
	const wanted = Math.min( 256, Math.max( 0, Number.parseInt( lines[ 0 ], 10 ) || 0 ) );
	puzzleEntries = [];
	for ( let i = 1; i < lines.length && puzzleEntries.length < wanted; i ++ ) {

		const match = /^\s*(\S+)\s+(.+?)\s*$/.exec( lines[ i ] );
		if ( match === null ) continue;
		puzzleEntries.push( Object.freeze( { shortName: match[ 1 ], name: match[ 2 ] } ) );

	}
	return { ok: true, count: puzzleEntries.length };

}

/**
 * Loads `puzzles.txt` from the mounted game data.
 *
 * @param {?string} [text] the file's text, or null to read the search path
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_LoadPuzzleStrings( text = null ) {

	const source = text ?? COM_LoadFileAsString( 'puzzles.txt' );
	if ( source === null || source === undefined ) { puzzleEntries = []; return { ok: false, reason: 'could not load puzzles.txt' }; }
	return Hexen2_ParsePuzzleStrings( source );

}

/** How many puzzle entries are loaded. */
export function Hexen2_PuzzleStringCount() { return puzzleEntries.length; }

/** A puzzle entry by 0-based index. */
export function Hexen2_GetPuzzleString( index ) { return puzzleEntries[ index ] ?? null; }

/**
 * The full name of a puzzle piece from its one-word native name (`CL_FindPuzzleString`), case-insensitive.
 *
 * @param {string} shortName the name in the map/gamecode
 * @returns {?string} the display name, or null when unknown
 */
export function Hexen2_FindPuzzleString( shortName ) {

	const wanted = String( shortName ).toLowerCase();
	return puzzleEntries.find( entry => entry.shortName.toLowerCase() === wanted )?.name ?? null;

}

/**
 * Parses `infolist.txt`: one objective line per newline, blank lines kept so the objective bit indexes stay aligned.
 *
 * @param {string} text the file's text
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_ParseInfoStrings( text ) {

	const lines = splitLines( text );
	infoStrings = lines.length === 0 ? [] : lines;
	if ( lines.length === 0 ) return { ok: false, reason: 'infolist.txt has no objectives' };
	return { ok: true, count: infoStrings.length };

}

/**
 * Loads `infolist.txt` from the mounted game data.
 *
 * @param {?string} [text] the file's text, or null to read the search path
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_LoadInfoStrings( text = null ) {

	const source = text ?? COM_LoadFileAsString( 'infolist.txt' );
	if ( source === null || source === undefined ) { infoStrings = []; return { ok: false, reason: 'could not load infolist.txt' }; }
	return Hexen2_ParseInfoStrings( source );

}

/** How many objective lines are loaded. */
export function Hexen2_InfoStringCount() { return infoStrings.length; }

/** An objective line by 0-based index. */
export function Hexen2_GetInfoString( index ) { return infoStrings[ index ] ?? null; }

/**
 * Parses `maplist.txt`: the first line is the entry count, then `<map name> <prog filename>` lines (`PR_GetProgFilename`
 * in the native engine). Tabs count as spaces; malformed lines are ignored.
 *
 * @param {string} text the file's text
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }} the number of usable entries
 */
export function Hexen2_ParseMapList( text ) {

	const lines = splitLines( text );
	const wanted = Math.min( 1024, Math.max( 0, Number.parseInt( lines[ 0 ], 10 ) || 0 ) );
	mapEntries = [];
	for ( let i = 1; i < lines.length && mapEntries.length < wanted; i ++ ) {

		const parts = lines[ i ].replace( /\t/g, ' ' ).trim().split( /\s+/ );
		if ( parts.length < 2 ) continue;
		mapEntries.push( Object.freeze( { map: parts[ 0 ], progs: parts[ 1 ] } ) );

	}
	return { ok: true, count: mapEntries.length };

}

/**
 * Loads `maplist.txt` from the mounted game data. Its absence is normal for the base game.
 *
 * @param {?string} [text] the file's text, or null to read the search path
 * @returns {{ ok: true, count: number } | { ok: false, reason: string }}
 */
export function Hexen2_LoadMapList( text = null ) {

	const source = text ?? COM_LoadFileAsString( 'maplist.txt' );
	if ( source === null || source === undefined ) { mapEntries = []; return { ok: false, reason: 'could not load maplist.txt' }; }
	return Hexen2_ParseMapList( source );

}

/** The loaded `maplist.txt` entries (`{ map, progs }`). */
export function Hexen2_MapListEntries() { return mapEntries.slice(); }

/** Normalises a map name for maplist lookup: no `maps/` prefix, no `.bsp`, lower case. */
function normalizeMapName( name ) {

	let value = String( name ?? '' ).toLowerCase();
	if ( value.startsWith( 'maps/' ) ) value = value.slice( 5 );
	if ( value.endsWith( '.bsp' ) ) value = value.slice( 0, - 4 );
	return value;

}

/**
 * The program `maplist.txt` names for a map (Portal's optional per-map progs). The caller decides when to load it.
 *
 * @param {string} mapName a map name with or without `maps/` and `.bsp`
 * @returns {?string} the progs filename, or null when this map has no entry
 */
export function Hexen2_ProgForMap( mapName ) {

	const wanted = normalizeMapName( mapName );
	return mapEntries.find( entry => normalizeMapName( entry.map ) === wanted )?.progs ?? null;

}
