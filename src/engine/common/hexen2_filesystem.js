/**
 * @module engine/common/hexen2_filesystem
 *
 * Hexen II's native file layout (docs/hexen2-support-plan.md section 3): the search order, effective-file manifest and
 * edition detection for a supplied installation. Pure directory-name logic: the caller supplies each tier's file names
 * (from loose directories and PAK directories), so nothing here reads the disk, fetches, hashes or walks a tree.
 *
 * Order, highest first, as the pinned Hexen filesystem resolves it: the selected corrected gamecode overlay (approved
 * program outputs only), the expansion's loose files, the expansion PAKs in descending number, the base's loose files,
 * the base PAKs in descending number. PAK numbers are probed independently through pak0..pak9, so a gap never hides a
 * later pack. Pack names win case-insensitively, and a later entry in the same pack overrides an earlier one, as native
 * sequential loading does.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws TypeError for a malformed layer description (a caller bug); a rejected archive or program header is
 * reported as an Error with its reason, and detection returns `{ ok: false, reason }`.
 */

import { HEXEN2_LAYOUT_CRCS, HEXEN2_PROFILES, Hexen2_Digest } from './hexen2_profile.js';

/** pak0 .. pak9 are probed independently; nothing above pak9 is part of the supported layout. */
export const HEXEN2_PAK_LIMIT = 10;

export const HEXEN2_SEARCH_TIERS = Object.freeze( [
	'corrected-overlay',
	'expansion-loose',
	'expansion-pak',
	'base-loose',
	'base-pak'
] );

/** The corrected overlay may carry the pinned program outputs only; it never shadows native maps, strings or puzzles. */
export const HEXEN2_OVERLAY_FILES = Object.freeze( [ 'progs.dat', 'progs2.dat' ] );

/** Files a base retail installation must provide before its edition is trusted (the supplied data1 layout). */
export const HEXEN2_REQUIRED_BASE_FILES = Object.freeze( [ 'progs.dat', 'strings.txt', 'hexen.rc' ] );

/** dprograms_t is fifteen little-endian int32 fields. */
export const HEXEN2_PROG_HEADER_BYTES = 60;

/**
 * The pinned Nov 1997 demo archive (`pak0.pak`): uhexen2 `engine/h2shared/quakefs.c` pins the same entry count,
 * CCITT directory CRC and size. The demo program itself uses the base layout CRC 38488.
 */
export const HEXEN2_DEMO_SIGNATURE = Object.freeze( { entries: 797, directoryCrc: 22780, bytes: 27750257 } );

// CRC-16/CCITT, polynomial 0x1021, init 0xffff, non-reflected: uhexen2 common/crc.c, used for a PAK directory.
let _ccittTable = null;
function ccittTable() {

	if ( _ccittTable !== null ) return _ccittTable;
	const table = new Array( 256 );
	for ( let i = 0; i < 256; i ++ ) {

		let value = i << 8;
		for ( let bit = 0; bit < 8; bit ++ ) value = ( value & 0x8000 ? ( value << 1 ) ^ 0x1021 : value << 1 ) & 0xffff;
		table[ i ] = value;

	}
	return _ccittTable = table;

}

/**
 * Computes the native PAK directory signature from the directory bytes.
 *
 * @param {ArrayBuffer|Uint8Array|DataView} directory the PAK directory bytes (entries × 64)
 * @param {number} entries the directory entry count
 * @param {number} bytes the whole archive size
 * @returns {{ entries: number, directoryCrc: number, bytes: number }} the signature
 * @throws {TypeError|Error} for non-bytes, a non-integer count/size, or a directory length that is not entries × 64
 */
export function Hexen2_PakDirectorySignature( directory, entries, bytes ) {

	let data;
	if ( directory instanceof ArrayBuffer ) data = new Uint8Array( directory );
	else if ( ArrayBuffer.isView( directory ) ) data = new Uint8Array( directory.buffer, directory.byteOffset, directory.byteLength );
	else throw new TypeError( 'Hexen2_PakDirectorySignature: directory bytes are required' );
	if ( ! Number.isSafeInteger( entries ) || entries < 0 ) throw new TypeError( 'Hexen2_PakDirectorySignature: a non-negative entry count is required' );
	if ( ! Number.isSafeInteger( bytes ) || bytes < 0 ) throw new TypeError( 'Hexen2_PakDirectorySignature: a non-negative archive size is required' );
	if ( data.byteLength !== entries * 64 ) throw new Error( `Hexen2_PakDirectorySignature: ${data.byteLength} bytes is not ${entries} entries` );
	const table = ccittTable();
	let crc = 0xffff;
	for ( const byte of data ) crc = ( ( crc << 8 ) & 0xffff ) ^ table[ ( ( crc >> 8 ) ^ byte ) & 0xff ];
	return Object.freeze( { entries, directoryCrc: crc, bytes } );

}

/**
 * Names the parts of a signature that do not match the pinned demo archive.
 *
 * @param {?{ entries?: number, directoryCrc?: number, bytes?: number }} signature the observed signature
 * @returns {ReadonlyArray<string>} the mismatched fields, empty when it matches
 */
export function Hexen2_DemoSignatureProblems( signature ) {

	const problems = [];
	if ( signature === null || signature === undefined ) return Object.freeze( [ 'no archive signature' ] );
	if ( signature.entries !== HEXEN2_DEMO_SIGNATURE.entries ) problems.push( 'entry count' );
	if ( signature.directoryCrc !== HEXEN2_DEMO_SIGNATURE.directoryCrc ) problems.push( 'directory CRC' );
	if ( signature.bytes !== HEXEN2_DEMO_SIGNATURE.bytes ) problems.push( 'size' );
	return Object.freeze( problems );

}


/**
 * The present PAK numbers in the engine's search order: descending, duplicates dropped, gaps kept.
 *
 * @param {Array<number>} numbers the present pack numbers, in any order
 * @returns {ReadonlyArray<number>} the numbers from highest to lowest
 * @throws {TypeError} for a number that is not an integer in 0..9
 */
export function Hexen2_OrderedPakNumbers( numbers ) {

	if ( ! Array.isArray( numbers ) ) throw new TypeError( 'Hexen2_OrderedPakNumbers: an array of pack numbers is required' );
	const seen = new Set();
	for ( const number of numbers ) {

		if ( ! Number.isInteger( number ) || number < 0 || number >= HEXEN2_PAK_LIMIT )
			throw new TypeError( `Hexen2_OrderedPakNumbers: ${String( number )} is not a pak number from 0 to ${HEXEN2_PAK_LIMIT - 1}` );
		seen.add( number );

	}
	return Object.freeze( [ ...seen ].sort( ( a, b ) => b - a ) );

}

// One tier's files as a name-keyed map (lower case), keeping native "later entry wins" within the tier.
function tierFiles( files, context ) {

	if ( ! Array.isArray( files ) ) throw new TypeError( `${context}: an array of file names is required` );
	const out = new Map();
	for ( const entry of files ) {

		const name = typeof entry === 'string' ? entry : entry?.name;
		if ( typeof name !== 'string' || name.trim() === '' ) throw new TypeError( `${context}: every file needs a non-empty name` );
		out.set( name.trim().toLowerCase(), name.trim() );

	}
	return out;

}

function tier( name, source, files, context ) {

	return Object.freeze( { tier: name, source, files: tierFiles( files, context ) } );

}

function paks( list, context ) {

	if ( list === undefined ) return [];
	if ( ! Array.isArray( list ) ) throw new TypeError( `${context}: paks must be an array of { number, files }` );
	for ( const pak of list ) {

		if ( ! Number.isInteger( pak?.number ) ) throw new TypeError( `${context}: every pak needs an integer number` );
		if ( ! Array.isArray( pak.files ) ) throw new TypeError( `${context}: pak${pak.number} needs a files array` );

	}
	return list;

}

/**
 * Builds the search layers in native precedence order. Base and expansion are supplied separately so a later caller
 * can never silently merge two installations with different loose programs.
 *
 * @param {{ overlay?: Array<string|object>, base?: { loose?: Array<string|object>, paks?: Array<{number:number,
 *   files:Array<string|object>}> }, expansion?: ?{ loose?: Array<string|object>, paks?: Array<{number:number,
 *   files:Array<string|object>}> } }} [input] the supplied tiers
 * @returns {ReadonlyArray<object>} layers, highest precedence first, each `{ tier, source, files: Map }`
 * @throws {TypeError} for a malformed layer or a corrected overlay carrying anything but its program outputs
 */
export function Hexen2_BuildLayers( input = {} ) {

	if ( input === null || typeof input !== 'object' ) throw new TypeError( 'Hexen2_BuildLayers: an object is required' );
	const overlay = input.overlay ?? [], base = input.base ?? {}, expansion = input.expansion ?? null;
	if ( ! Array.isArray( overlay ) ) throw new TypeError( 'Hexen2_BuildLayers: overlay must be an array' );

	for ( const entry of overlay ) {

		const name = ( typeof entry === 'string' ? entry : entry?.name ) ?? '';
		if ( ! HEXEN2_OVERLAY_FILES.includes( String( name ).trim().toLowerCase() ) )
			throw new TypeError( `Hexen2_BuildLayers: the corrected overlay may carry only ${HEXEN2_OVERLAY_FILES.join( ' and ' )}, not ${String( name )}` );

	}

	const layers = [];
	if ( overlay.length > 0 ) layers.push( tier( 'corrected-overlay', 'corrected gamecode overlay', overlay, 'overlay' ) );

	if ( expansion !== null && expansion !== undefined ) {

		layers.push( tier( 'expansion-loose', 'expansion loose files', expansion.loose ?? [], 'expansion loose' ) );
		const expansionPaks = paks( expansion.paks, 'expansion' );
		for ( const number of Hexen2_OrderedPakNumbers( expansionPaks.map( pak => pak.number ) ) ) {

			const pak = expansionPaks.find( candidate => candidate.number === number );
			layers.push( tier( 'expansion-pak', `expansion pak${number}.pak`, pak.files, `expansion pak${number}` ) );

		}

	}

	layers.push( tier( 'base-loose', 'base loose files', base.loose ?? [], 'base loose' ) );
	const basePaks = paks( base.paks, 'base' );
	for ( const number of Hexen2_OrderedPakNumbers( basePaks.map( pak => pak.number ) ) ) {

		const pak = basePaks.find( candidate => candidate.number === number );
		layers.push( tier( 'base-pak', `base pak${number}.pak`, pak.files, `base pak${number}` ) );

	}

	return Object.freeze( layers );

}

/**
 * Resolves one logical file name through the layers, exactly as the native search path does.
 *
 * @param {ReadonlyArray<object>} layers layers from `Hexen2_BuildLayers`, highest precedence first
 * @param {string} name the logical file name (matched case-insensitively)
 * @returns {?{ name: string, tier: string, source: string }} the winning file with its provenance, or null
 * @throws {TypeError} for a missing name
 */
export function Hexen2_ResolveFile( layers, name ) {

	if ( typeof name !== 'string' || name.trim() === '' ) throw new TypeError( 'Hexen2_ResolveFile: a file name is required' );
	const key = name.trim().toLowerCase();
	for ( const layer of layers ) {

		if ( layer.files.has( key ) ) return Object.freeze( { name: layer.files.get( key ), tier: layer.tier, source: layer.source } );

	}
	return null;

}

/**
 * The effective file set: each logical name once, with the tier that wins it, sorted by name for a stable identity.
 * The digest covers names and provenance only; callers add program and asset content digests before LAN admission.
 *
 * @param {ReadonlyArray<object>} layers layers from `Hexen2_BuildLayers`
 * @returns {{ files: ReadonlyArray<{ name: string, tier: string, source: string }>, count: number, digest: string }}
 *   the winning files, their count and a stable digest
 */
export function Hexen2_Manifest( layers ) {

	const winners = new Map();
	for ( const layer of layers ) {

		for ( const [ key, name ] of layer.files ) {

			if ( ! winners.has( key ) ) winners.set( key, { name, tier: layer.tier, source: layer.source } );

		}

	}
	const files = [ ...winners.entries() ]
		.sort( ( [ a ], [ b ] ) => ( a < b ? -1 : a > b ? 1 : 0 ) )
		.map( ( [ , file ] ) => Object.freeze( file ) );
	return Object.freeze( {
		files: Object.freeze( files ),
		count: files.length,
		digest: Hexen2_Digest( files.map( file => `${file.name.toLowerCase()}\t${file.tier}\t${file.source}` ).join( '\n' ) )
	} );

}

// The fifteen little-endian header words, with the version/count checks every caller needs.
function progHeaderFields( data, caller ) {

	let view;
	if ( data instanceof ArrayBuffer ) view = new DataView( data );
	else if ( ArrayBuffer.isView( data ) ) view = new DataView( data.buffer, data.byteOffset, data.byteLength );
	else throw new TypeError( `${caller}: bytes are required` );

	if ( view.byteLength < HEXEN2_PROG_HEADER_BYTES ) throw new Error( 'progs.dat is shorter than its 60-byte header' );
	const ints = [];
	for ( let i = 0; i < 15; i ++ ) ints.push( view.getInt32( i * 4, true ) );
	const [ version, crc, , numStatements, , numGlobalDefs, , numFieldDefs, , numFunctions, , numStrings, , numGlobals,
		entityFields ] = ints;
	if ( version !== 6 ) throw new Error( `progs.dat has version ${version}, not 6` );
	if ( numStatements < 1 || numGlobalDefs < 1 || numFieldDefs < 1 || numFunctions < 1 || numGlobals < 1 || entityFields < 1 )
		throw new Error( 'progs.dat header has a non-positive count' );
	const layout = crc === HEXEN2_LAYOUT_CRCS.base ? 'hexen2-base'
		: crc === HEXEN2_LAYOUT_CRCS.portals ? 'hexen2-portals' : 'unknown';
	return { view, ints, version, crc, layout, entityFields };

}

/**
 * Checks a Hexen II program's 60-byte header without requiring its sections to be present. This is the identity check
 * used where only the edition matters (the demo catalogue probe); `Hexen2_ReadProgHeader` additionally proves every
 * section lies inside the supplied file.
 *
 * @param {ArrayBuffer|Uint8Array|DataView} data the first 60 bytes of progs.dat (or the whole file)
 * @returns {{ version: number, crc: number, layout: string, entityFields: number }} the checked identity; `layout` is
 *   `hexen2-base`, `hexen2-portals` or `unknown`
 * @throws {TypeError|Error} as `Hexen2_ReadProgHeader` does for truncation, version and counts
 */
export function Hexen2_ReadProgHeaderSummary( data ) {

	const fields = progHeaderFields( data, 'Hexen2_ReadProgHeaderSummary' );
	return Object.freeze( { version: fields.version, crc: fields.crc, layout: fields.layout, entityFields: fields.entityFields } );

}

/**
 * Reads and validates a Hexen II `dprograms_t` header (the one interpreter's layout check, plan section 4): version 6,
 * positive counts, every section inside the file, and the header CRC recognised as one of the supplied layouts.
 *
 * @param {ArrayBuffer|Uint8Array|DataView} data the whole progs.dat, or at least its header
 * @returns {{ version: number, crc: number, layout: string, counts: object, entityFields: number }} the checked header;
 *   `layout` is `hexen2-base`, `hexen2-portals` or `unknown`
 * @throws {TypeError} when `data` is not bytes
 * @throws {Error} when the header is truncated, the version is not 6, a count is not positive or a section runs past
 *   the file
 */
export function Hexen2_ReadProgHeader( data ) {

	const fields = progHeaderFields( data, 'Hexen2_ReadProgHeader' );
	const { view, ints, version, crc, layout, entityFields } = fields;
	const [ , , ofsStatements, numStatements, ofsGlobalDefs, numGlobalDefs, ofsFieldDefs, numFieldDefs,
		ofsFunctions, numFunctions, ofsStrings, numStrings, ofsGlobals, numGlobals ] = ints;

	// statement 0 is the error sentinel; each record is op/a/b/c (8 bytes)
	const sections = [
		[ 'statements', ofsStatements, numStatements, 8 ],
		[ 'globaldefs', ofsGlobalDefs, numGlobalDefs, 8 ],
		[ 'fielddefs', ofsFieldDefs, numFieldDefs, 8 ],
		[ 'functions', ofsFunctions, numFunctions, 4 * 7 + 8 ],
		[ 'strings', ofsStrings, numStrings, 1 ],
		[ 'globals', ofsGlobals, numGlobals, 4 ]
	];
	for ( const [ label, offset, count, width ] of sections ) {

		if ( ! Number.isSafeInteger( offset ) || ! Number.isSafeInteger( count ) )
			throw new Error( `progs.dat ${label} header fields are not safe integers` );
		if ( offset < HEXEN2_PROG_HEADER_BYTES ) throw new Error( `progs.dat ${label} start inside the header` );
		if ( count > 0 && offset + count * width > view.byteLength ) throw new Error( `progs.dat ${label} run past the file` );

	}

	return Object.freeze( {
		version,
		crc,
		layout,
		counts: Object.freeze( { statements: numStatements, globaldefs: numGlobalDefs, fielddefs: numFieldDefs,
			functions: numFunctions, strings: numStrings, globals: numGlobals } ),
		entityFields
	} );

}

// The required base files still missing from an effective file-name set.
function missingBaseFiles( files ) {

	const present = new Set( [ ...files ].map( name => String( name ).trim().toLowerCase() ) );
	return HEXEN2_REQUIRED_BASE_FILES.filter( name => ! present.has( name ) );

}

/**
 * Detects the supported edition from the supplied content. Base must prove its program layout; an expansion must be
 * the Portal layout over a base install; a demo must match the pinned archive signature and carry a version-6 program.
 * Mixed layouts are refused, never guessed.
 *
 * The demo signature is the plan's pinned one (797 entries, directory CRC 22780, 27,750,257 bytes); the full archive
 * hash and licence still have to be verified from its acquired source before any RED test depends on it.
 *
 * @param {{ base?: ?{ files: Array<string>, progsHeader?: object }, expansion?: ?{ files: Array<string>,
 *   progsHeader?: object }, demo?: ?{ entries: number, directoryCrc: number, bytes: number, progsHeader?: object } }}
 *   [content] the supplied installations (headers from `Hexen2_ReadProgHeader`)
 * @returns {{ ok: true, edition: string, gameId: string, layout: string, classes: ReadonlyArray<string> } |
 *   { ok: false, reason: string }} the detected edition, or why it is not supported
 */
export function Hexen2_DetectEdition( content = {} ) {

	const base = content.base ?? null, expansion = content.expansion ?? null, demo = content.demo ?? null;

	if ( demo !== null && demo !== undefined ) {

		const mismatches = Hexen2_DemoSignatureProblems( demo );
		if ( mismatches.length > 0 ) return { ok: false, reason: `demo archive signature mismatch: ${mismatches.join( ', ' )}` };
		if ( ! demo.progsHeader ) return { ok: false, reason: 'the demo archive has no validated gamecode header' };
		if ( demo.progsHeader.version !== 6 ) return { ok: false, reason: 'the demo gamecode is not version 6' };
		if ( demo.progsHeader.layout !== 'hexen2-base' ) return { ok: false, reason: `unsupported demo layout CRC ${demo.progsHeader.crc}` };
		return { ok: true, edition: 'demo', gameId: 'hexen2-demo', layout: 'hexen2-base', classes: HEXEN2_PROFILES[ 'hexen2-demo' ].classes };

	}

	if ( base === null || base === undefined ) return { ok: false, reason: 'no base installation files were supplied' };
	const missing = missingBaseFiles( base.files ?? [] );
	if ( missing.length > 0 ) return { ok: false, reason: `the base installation is missing ${missing.join( ', ' )}` };
	if ( ! base.progsHeader ) return { ok: false, reason: 'the base installation has no validated progs.dat header' };

	if ( base.progsHeader.layout === 'hexen2-portals' ) return { ok: false, reason: 'mixed editions: an expansion program is installed as the base game' };
	if ( base.progsHeader.layout !== 'hexen2-base' ) return { ok: false, reason: `unsupported base layout CRC ${base.progsHeader.crc}` };

	if ( expansion !== null && expansion !== undefined ) {

		if ( ( expansion.files ?? [] ).length === 0 ) return { ok: false, reason: 'the expansion installation is empty' };
		if ( ! expansion.progsHeader ) return { ok: false, reason: 'the expansion installation has no validated progs.dat header' };
		if ( expansion.progsHeader.layout === 'hexen2-base' ) return { ok: false, reason: 'mixed editions: a base program is installed as the expansion' };
		if ( expansion.progsHeader.layout !== 'hexen2-portals' ) return { ok: false, reason: `unsupported expansion layout CRC ${expansion.progsHeader.crc}` };
		return { ok: true, edition: 'portals', gameId: 'hexen2-portals', layout: 'hexen2-portals', classes: HEXEN2_PROFILES[ 'hexen2-portals' ].classes };

	}

	return { ok: true, edition: 'base', gameId: 'hexen2', layout: 'hexen2-base', classes: HEXEN2_PROFILES.hexen2.classes };

}
