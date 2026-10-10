/**
 * @module engine/common/pak
 *
 * The game's file system: PAK archives (`pak0.pak`, Newer Game's `newer.pak` and its maps pack), loose files, and the
 * URLs of Newer Game's own assets (`COM_NewerURL`).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `com_searchpaths`, `newerPack`, `startupPack`, `startupIndex`,
 * `newerIndex`, `newerActive`, `newerMaps`, `newerMapsEnabled`, `looseFileBasePath`; 3 module-level collections
 * (Map/Set).
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place; throws at 8 places; catches at 6 places.
 */
// PAK file loader -- new module for browser-based asset loading
// Quake stores all game data in pak0.pak (and optionally pak1.pak)
// PAK format: 4-byte magic "PACK", 4-byte directory offset, 4-byte directory length
// Directory entries: 56-byte filename + 4-byte offset + 4-byte length

import { Sys_Printf, Sys_Error } from './sys.js';
import { Con_Printf } from './common.js';

const MAX_FILES_IN_PACK = 2048;

class packfile_t {

	constructor() {

		this.name = '';
		this.filepos = 0;
		this.filelen = 0;

	}

}

class pack_t {

	constructor() {

		this.filename = '';
		this.files = []; // array of packfile_t
		this.data = null; // ArrayBuffer of the entire pak

	}

}

// Search paths
let com_searchpaths = []; // array of { pack, path }

// Loaded packs
const loadedPacks = [];

// Virtual files (for loose files not in pak)
const virtualFiles = new Map();

// The Newer Game pack (newer.pak): art and data for Newer Game. It is not on the search path
// like pak0.pak: it is looked at first, and only while Newer Game is on, so New Game
// stays exactly the original. Its files keep the names they have as loose files ("newer/...").
let newerPack = null;
let startupPack=null,startupIndex=new Map();
let newerIndex = null; // name -> packfile_t
let newerActive = false;
const newerUrls = new Map(); // name -> blob URL
let newerMaps = new Map(); // separately built geometry; original packs remain intact
let newerMapsEnabled = false; // only a supported local game explicitly selects these maps
/**
 * Selects whether `COM_FindFile` serves Newer Game's rebuilt maps (from `COM_SetNewerMapsPack`) in place of the
 * originals; they are used only while Newer Game is also active (`COM_SetNewerActive`). Set at map spawn by
 * `SV_SpawnServer` and when the client parses the server info (only a local single-player game enables them).
 *
 * @param {boolean} enabled only `true` enables; any other value disables
 */
export function COM_SetNewerMapsEnabled( enabled ) { newerMapsEnabled = enabled === true; }

/**
 * Installs Newer Game's separately built map geometry (the `newer/maps.pak` pack, loaded at start-up by main.js),
 * replacing any earlier set. The original packs remain intact; the views share `pack.data` and last until the next
 * call.
 *
 * @param {?pack_t} pack a pack from `COM_LoadPackFile`; null or undefined clears the set
 * @throws {Error} when an entry is not named `maps/<lower-case name>.bsp` (`Newer map pack contains non-map entry`);
 * the previous set is then kept
 */
export function COM_SetNewerMapsPack( pack ) {
	const maps = new Map();
	for ( const f of pack?.files || [] ) {
		if ( ! /^maps\/[a-z0-9_]+\.bsp$/.test( f.name ) ) throw new Error( 'Newer map pack contains non-map entry: ' + f.name );
		maps.set( f.name, new Uint8Array( pack.data, f.filepos, f.filelen ) );
	}
	newerMaps = maps;
}

// Base path for on-demand loose file fetching
// Browser: '' (relative URLs like 'maps/foo.bsp')
// Deno: '/opt/three-quake/' (absolute filesystem path)
let looseFileBasePath = '';

/*
=================
COM_LoadPackFile
=================
*/

/**
 * Reads a pack's 12-byte header and checks its directory against the archive's size, by the rules
 * `COM_LoadPackFile` applies. Shared with the game catalogue (`game_catalogue.js`, card [34b]), which reads only the
 * header and the directory of a pack it has not downloaded.
 *
 * @param {DataView} view at least the first 12 bytes of the pack
 * @param {number} size the whole archive's length in bytes
 * @returns {{ ok: true, dirofs: number, dirlen: number, count: number }|{ ok: false, reason: string }} where the
 *   directory is (byte offset and length) and how many 64-byte entries it holds; or why it is not a usable pack
 *   ('not a packfile', 'invalid pack directory', 'too many files (n)')
 */
export function COM_PackHeader( view, size ) {

	if ( view.byteLength < 12 ) return { ok: false, reason: 'truncated pack header' };
	if ( view.getUint8( 0 ) !== 0x50 || view.getUint8( 1 ) !== 0x41 || view.getUint8( 2 ) !== 0x43 || view.getUint8( 3 ) !== 0x4B ) return { ok: false, reason: 'not a packfile' }; // 'PACK'
	const dirofs = view.getInt32( 4, true ), dirlen = view.getInt32( 8, true );
	if ( dirofs < 12 || dirlen < 0 || dirlen % 64 !== 0 || dirofs > size - dirlen ) return { ok: false, reason: 'invalid pack directory' };
	const count = Math.floor( dirlen / 64 ); // each dir entry is 64 bytes
	if ( count > MAX_FILES_IN_PACK ) return { ok: false, reason: 'too many files (' + count + ')' };
	return { ok: true, dirofs, dirlen, count };

}

/**
 * Reads a pack's directory entries, checking each payload lies inside the archive, by `COM_LoadPackFile`'s rules.
 *
 * @param {Uint8Array} directory the directory's bytes (`count` × 64)
 * @param {number} count how many entries
 * @param {number} size the whole archive's length in bytes
 * @returns {{ ok: true, files: Array<{ name: string, filepos: number, filelen: number }> }|{ ok: false, reason: string }}
 *   the entries (names lower-cased, as the engine looks them up); or the first entry whose payload is out of bounds
 */
export function COM_PackEntries( directory, count, size ) {

	const view = new DataView( directory.buffer, directory.byteOffset, directory.byteLength ), files = [];
	for ( let i = 0; i < count; i ++ ) {

		const entryOffset = i * 64;
		// Read filename (56 bytes, null terminated)
		let name = '';
		for ( let j = 0; j < 56; j ++ ) {

			const c = directory[ entryOffset + j ];
			if ( c === 0 ) break;
			name += String.fromCharCode( c );

		}
		name = name.toLowerCase();
		const filepos = view.getInt32( entryOffset + 56, true ), filelen = view.getInt32( entryOffset + 60, true );
		if ( filepos < 0 || filelen < 0 || filepos > size - filelen ) return { ok: false, reason: 'invalid payload: ' + name };
		files.push( { name, filepos, filelen } );

	}
	return { ok: true, files };

}

/**
 * Takes an ArrayBuffer of the .pak file contents and returns a pack_t (the original comment's "or null" cannot
 * happen: a bad magic number throws through `Sys_Error`). Reads the directory (64-byte entries: a 56-byte
 * NUL-terminated name, lower-cased here, then little-endian int32 offset and length), prints `Added packfile ...` and
 * records the pack in the module's list of loaded packs. It does not add the pack to the search path; call
 * `COM_AddPack` (or `COM_SetNewerPack` and friends) for that. Corruption is rejected here, while
 * `COM_FetchOptionalPak` can still decline the whole optional archive. The pack keeps `buffer` for the life of the
 * page, and files are later read as views into it.
 *
 * @param {string} filename the name used in messages and stored as `pack.filename`
 * @param {ArrayBuffer} buffer the whole .pak file; kept, not copied
 * @returns {pack_t} the parsed pack: `files` holds `{ name, filepos, filelen }` (bytes into `buffer`)
 * @throws {Error} via `Sys_Error` when the file does not start with `PACK` (`<filename> is not a packfile`); and
 * directly when it is under 12 bytes (truncated pack header), the directory offset or length is out of range or not a
 * multiple of 64 (invalid pack directory), it lists more than 2048 files (too many files) or an entry lies outside
 * the file (invalid payload)
 */
export function COM_LoadPackFile( filename, buffer ) {

	if ( buffer.byteLength < 12 ) throw new Error( filename + ' has a truncated pack header' );
	// Check header. Reject corruption here, while COM_FetchOptionalPak can still decline the entire optional archive.
	// Deferred payload views must never fail after a malformed pack has already entered the search path.
	const header = COM_PackHeader( new DataView( buffer ), buffer.byteLength );
	if ( ! header.ok && header.reason === 'not a packfile' ) {

		Sys_Error( filename + ' is not a packfile' );
		return null;

	}
	if ( ! header.ok ) throw new Error( filename + ( header.reason.startsWith( 'too many' ) ? ' has ' : ' has an ' ) + header.reason );
	const numpackfiles = header.count;

	const pack = new pack_t();
	pack.filename = filename;
	pack.data = buffer;

	const entries = COM_PackEntries( new Uint8Array( buffer, header.dirofs, header.dirlen ), numpackfiles, buffer.byteLength );
	if ( ! entries.ok ) throw new Error( filename + ' has an ' + entries.reason );
	for ( const entry of entries.files ) {

		const file = new packfile_t();
		file.name = entry.name;
		file.filepos = entry.filepos;
		file.filelen = entry.filelen;
		pack.files.push( file );

	}

	Con_Printf( 'Added packfile ' + filename + ' (' + numpackfiles + ' files)\\n' );

	loadedPacks.push( pack );

	return pack;

}

/*
=================
COM_AddGameDirectory
=================
*/
/**
 * Sets up the search path for a game directory (WinQuake common.c): appends a directory entry with no pack. The port
 * never reads directory entries (loose files come through `COM_EnsureFile` instead), so this has no effect on
 * lookups; no current caller.
 *
 * @param {string} dir the game directory, such as `id1`
 */
export function COM_AddGameDirectory( dir ) {

	com_searchpaths.push( { pack: null, path: dir } );

}

/*
=================
COM_AddPack
=================
*/
/**
 * Adds a loaded pack to the search path, at the front: the last pack added wins when two hold the same file. Called
 * at start-up by main.js (the full game's pak, then pak0.pak) and by the dedicated server (server/game_server.js).
 * The pack stays on the path for the life of the page.
 *
 * @param {pack_t} pack a pack from `COM_LoadPackFile` or `COM_FetchPak`
 */
export function COM_AddPack( pack ) {

	com_searchpaths.unshift( { pack: pack, path: null } );

}

/*
=================
COM_FindFile
=================
*/
/**
 * Searches through the path looking for a file. The order is: Newer Game's rebuilt maps (when Newer Game is active
 * and its maps are enabled), then newer.pak (only while Newer Game is active), then the packs on the search path
 * (last added first), then the loose files fetched by `COM_PreloadLooseFile`. Called whenever the engine loads a
 * model, map, sound or script.
 *
 * @param {string} filename the game path, such as `maps/e1m1.bsp` (matched case-insensitively)
 * @returns {?{ data: Uint8Array, size: number }} the file's bytes and length in bytes, or null when it is nowhere.
 * `data` is a view into the pack's buffer (or the stored loose-file array), not a copy: do not modify it; use
 * `COM_LoadFile` for a private copy
 */
export function COM_FindFile( filename ) {

	const search = filename.toLowerCase();
	const map = newerActive && newerMapsEnabled ? newerMaps.get( search ) : null;
	if ( map ) return { data: map, size: map.byteLength };

	// Newer Game's own files come first
	if ( newerActive && newerIndex !== null ) {

		const nf = newerIndex.get( search );
		if ( nf !== undefined ) return { data: new Uint8Array( newerPack.data, nf.filepos, nf.filelen ), size: nf.filelen };

	}

	// Search through loaded packs (reverse order - last added has priority)
	for ( let i = 0; i < com_searchpaths.length; i ++ ) {

		const sp = com_searchpaths[ i ];
		if ( ! sp.pack ) continue;

		const pack = sp.pack;
		for ( let j = 0; j < pack.files.length; j ++ ) {

			if ( pack.files[ j ].name === search ) {

				const file = pack.files[ j ];
				const data = new Uint8Array( pack.data, file.filepos, file.filelen );
				return { data: data, size: file.filelen };

			}

		}

	}

	// Check virtual files (preloaded loose files)
	if ( virtualFiles.has( search ) ) {

		const data = virtualFiles.get( search );
		return { data: data, size: data.length };

	}

	return null;

}

/**
 * The names of the files in the packs that start with prefix (lower case). Searches only the packs on the search
 * path, in search order (not newer.pak or loose files); a name in two packs is listed twice. No current caller.
 *
 * @param {string} prefix the start of the name, such as `maps/`; compared as given, so it should be lower case
 * @returns {Array<string>} the matching names, lower case (a new array)
 */
export function COM_ListFiles( prefix ) {

	const out = [];
	for ( const sp of com_searchpaths ) {

		if ( ! sp.pack ) continue;
		for ( const f of sp.pack.files ) if ( f.name.indexOf( prefix ) === 0 ) out.push( f.name );

	}

	return out;

}

/*
=================
COM_SetNewerPack
=================
*/
/**
 * Makes a loaded pack the Newer Game pack (or none, with null), called at start-up by main.js once newer.pak has
 * loaded. Revokes every blob URL made by `COM_NewerURL` and rebuilds the name index; the pack's files are only seen
 * by `COM_FindFile` while Newer Game is active.
 *
 * @param {?pack_t} pack the newer.pak pack, or null for none
 */
export function COM_SetNewerPack( pack ) {

	for ( const url of newerUrls.values() ) URL.revokeObjectURL( url );
	newerUrls.clear();
	newerPack = pack;
	newerIndex = null;

	if ( pack != null ) {

		newerIndex = new Map();
		for ( const f of pack.files ) newerIndex.set( f.name, f );

	}

}

/**
 * Installs the small startup transport bundle, called at start-up by main.js once the pack's SHA-256 matches. Its
 * `startup/index.json` (version 1) maps logical `newer/hud/...` names to `startup/<n>.(png|webp|json)` payloads.
 * Full Newer pack entries retain priority except the engine-pinned, complete player-face composition kit
 * (`newer/hud/playerface/...`). Logical paths remain unchanged, and loose files remain the optional fallback. Revokes
 * cached `COM_NewerURL` blob URLs for names the old index served and for player-face names the new one serves. On
 * error nothing is changed.
 *
 * @param {?pack_t} pack the startup pack, or null to remove it
 * @throws {Error} when the index is missing (`Missing startup alias index`), is not version 1 with a `files` object
 * (`Invalid startup alias index`), names a path outside `newer/hud/` or with `.`/`..` parts or an alias of the wrong
 * form (`Invalid startup alias path`), or names a payload not in the pack (`Missing startup alias payload`); and a
 * SyntaxError when the index is not valid JSON
 */
export function COM_SetNewerStartupPack(pack){
 const next=new Map();
 if(pack){
  const entry=pack.files.find(f=>f.name==='startup/index.json');if(!entry)throw Error('Missing startup alias index');
  const index=JSON.parse(new TextDecoder().decode(new Uint8Array(pack.data,entry.filepos,entry.filelen)));
  if(index.version!==1||!index.files||typeof index.files!=='object')throw Error('Invalid startup alias index');
  for(const [name,alias]of Object.entries(index.files)){
   if(!/^newer\/hud\/[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(part=>part==='.'||part==='..')||!/^startup\/\d+\.(png|webp|json)$/.test(alias))throw Error('Invalid startup alias path');
   const file=pack.files.find(f=>f.name===alias);if(!file)throw Error('Missing startup alias payload');next.set(name.toLowerCase(),file);
  }
 }
 for(const [name,url]of newerUrls)if(startupIndex.has(name.toLowerCase()) || name.toLowerCase().startsWith('newer/hud/playerface/')&&next.has(name.toLowerCase())){URL.revokeObjectURL(url);newerUrls.delete(name);}
 startupPack=pack;startupIndex=next;
}

/**
 * Whether a Newer Game pack has been installed with `COM_SetNewerPack`.
 *
 * @returns {boolean} true while newer.pak is loaded
 */
export function COM_NewerPackLoaded() {

	return newerPack !== null;

}

/**
 * Sets whether the pack's files are visible to COM_FindFile (Newer Game is on). Called by `R_SetNewerGame`
 * (newer/mode.js) and at map spawn by `SV_SpawnServer`, so New Game stays exactly the original.
 *
 * @param {boolean} on only `true` turns it on
 */
export function COM_SetNewerActive( on ) {

	newerActive = on === true;

}

/*
=================
COM_NewerFile
=================
*/
/**
 * A file of the Newer Game pack: { data, size } or null. Unlike `COM_FindFile` it does not depend on Newer Game being
 * active. The player-face kit (`newer/hud/playerface/...`) comes from the startup pack when that has it, since the
 * engine-pinned face kit is one versioned composition unit; otherwise newer.pak wins, then the startup pack.
 *
 * @param {string} name the logical path, such as `newer/hud/face.json` (matched case-insensitively)
 * @returns {?{ data: Uint8Array, size: number }} a view into the pack's buffer (do not modify) and its length in
 * bytes, or null when neither pack has the file
 */
export function COM_NewerFile( name ) {
 const key=name.toLowerCase();
 // The engine-pinned startup face kit is one versioned composition unit.
 // An older optional newer.pak must not replace its manifest or a subset of
 // its rasters. Other optional-pack asset precedence remains unchanged.
 const face=key.startsWith('newer/hud/playerface/')?startupIndex.get(key):null;
 if(face)return {data:new Uint8Array(startupPack.data,face.filepos,face.filelen),size:face.filelen};
 const file=newerIndex?.get(key);if(file)return {data:new Uint8Array(newerPack.data,file.filepos,file.filelen),size:file.filelen};
 const startup=startupIndex.get(key);return startup?{data:new Uint8Array(startupPack.data,startup.filepos,startup.filelen),size:startup.filelen}:null;

}

const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', json: 'application/json' };

/*
=================
COM_NewerURL
=================
*/
/**
 * A URL to load a Newer Game file from: out of the pack when it has the file, otherwise the loose file at fallback
 * (a checkout without newer.pak). A pack file becomes a blob URL typed from its extension (webp, png, jpg, json, else
 * octet-stream), made once per name and cached until `COM_SetNewerPack` (or `COM_SetNewerStartupPack` for its
 * names) revokes it. Without `URL.createObjectURL` and `Blob` (Deno) it always returns `fallback`.
 *
 * @param {string} name the logical path, as for `COM_NewerFile`
 * @param {string} fallback the loose file's URL
 * @returns {string} a `blob:` URL or `fallback`
 */
export function COM_NewerURL( name, fallback ) {

	const f = COM_NewerFile( name );
	if ( f === null || typeof URL === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function' ) return fallback;

	let url = newerUrls.get( name );
	if ( url === undefined ) {

		const ext = name.slice( name.lastIndexOf( '.' ) + 1 ).toLowerCase();
		url = URL.createObjectURL( new Blob( [ f.data ], { type: MIME[ ext ] || 'application/octet-stream' } ) );
		newerUrls.set( name, url );

	}

	return url;

}

/*
=================
COM_NewerJSON
=================
*/
/**
 * A Newer Game json file: parsed out of the pack, or fetched from fallback (never cached, `cache: 'no-cache'`), or {}
 * when there is neither. Never rejects: a parse error, network error or non-OK response also gives {}.
 *
 * @param {string} name the logical path, as for `COM_NewerFile`
 * @param {string} fallback the loose file's URL
 * @returns {Promise<*>} the parsed JSON, or `{}`
 */
export async function COM_NewerJSON( name, fallback ) {

	const f = COM_NewerFile( name );
	if ( f !== null ) {

		try { return JSON.parse( new TextDecoder().decode( f.data ) ); } catch ( e ) { return {}; }

	}

	if ( typeof fetch === 'undefined' ) return {};

	try {

		const r = await fetch( fallback, { cache: 'no-cache' } );
		return r.ok ? await r.json() : {};

	} catch ( e ) {

		return {};

	}

}

/*
=================
COM_SetLooseFileBasePath
=================
*/
/**
 * Sets the base path for on-demand loose file fetching by `COM_EnsureFile`. Browser: '' (default, uses relative
 * URLs). Deno: '/opt/three-quake/' (absolute filesystem path), set by the dedicated server at start-up.
 *
 * @param {string} basePath prefixed to the game path as is, so it needs its trailing slash
 */
export function COM_SetLooseFileBasePath( basePath ) {

	looseFileBasePath = basePath;

}

/*
=================
COM_EnsureFile
=================
*/
/**
 * Checks if a file is available in pak or virtualFiles (via `COM_FindFile`). If not, attempts to fetch it on demand
 * from the loose-file base path plus `filename` and cache it for the life of the page. Used before loading a map
 * (`map`/`changelevel`, the client's world model and the dedicated server's map list).
 *
 * @param {string} filename the game path, such as `maps/foo.bsp`
 * @returns {Promise<boolean>} true when the file is available afterwards; false when the fetch or read failed
 * (never rejects)
 */
export async function COM_EnsureFile( filename ) {

	// Already available in pak or virtualFiles?
	if ( COM_FindFile( filename ) !== null ) {

		return true;

	}

	// Construct URL from base path + filename
	const url = looseFileBasePath + filename;

	return await COM_PreloadLooseFile( filename, url );

}

/*
=================
COM_PreloadLooseFile
=================
*/
/**
 * Fetches a loose file from URL/path and adds it to virtualFiles, where `COM_FindFile` finds it after every pack.
 * Used for custom maps not included in pak files. In Deno, reads from filesystem. In browser, uses fetch(). The file
 * replaces any earlier one of the same name and stays for the life of the page.
 *
 * @param {string} filename the game path to store it under (lower-cased)
 * @param {string} url the URL (browser) or filesystem path (Deno) to read
 * @returns {Promise<boolean>} true when stored; false on any failure (missing file, non-OK response, network error);
 * never rejects
 */
export async function COM_PreloadLooseFile( filename, url ) {

	try {

		let data;

		// Check if running in Deno
		if ( typeof Deno !== 'undefined' ) {

			// Load from filesystem in Deno
			try {

				data = await Deno.readFile( url );

			} catch ( e ) {

				return false;

			}

		} else {

			// Browser: use fetch
			const response = await fetch( url );
			if ( ! response.ok ) {

				return false;

			}

			const buffer = await response.arrayBuffer();
			data = new Uint8Array( buffer );

		}

		virtualFiles.set( filename.toLowerCase(), data );
		return true;

	} catch ( e ) {

		return false;

	}

}

/*
=================
COM_PreloadMaps
=================
*/
/**
 * Preloads loose map files from the maps/ directory, one after another, each stored as `maps/<name>.bsp`, and prints
 * `Preloaded <n> custom maps` when any loaded. No current caller.
 *
 * @param {Array<string>} mapList map names without the `.bsp` extension
 * @param {string} [basePath='maps/'] optional - used by Deno server to specify absolute path; needs its trailing slash
 * @returns {Promise<number>} how many maps loaded (missing ones are skipped)
 */
export async function COM_PreloadMaps( mapList, basePath ) {

	let loaded = 0;

	// Default base path, or use provided one (for Deno server)
	const base = basePath || 'maps/';

	for ( const mapName of mapList ) {

		const filename = 'maps/' + mapName + '.bsp';
		const url = base + mapName + '.bsp';

		if ( await COM_PreloadLooseFile( filename, url ) ) {

			loaded ++;

		}

	}

	if ( loaded > 0 ) {

		Sys_Printf( 'Preloaded %d custom maps\\n', loaded );

	}

	return loaded;

}

/*
=================
COM_LoadFile
=================
*/
/**
 * Loads a file from the pack system (searched as `COM_FindFile` does). Used for models, maps, sounds and progs.
 *
 * @param {string} filename the game path
 * @returns {?ArrayBuffer} a new copy of the file contents, owned by the caller, or null if not found
 */
export function COM_LoadFile( filename ) {

	const result = COM_FindFile( filename );
	if ( ! result ) return null;

	// Return a copy of the data as an ArrayBuffer
	const buf = new ArrayBuffer( result.size );
	const dest = new Uint8Array( buf );
	dest.set( result.data );
	return buf;

}

/*
=================
COM_LoadFileAsString
=================
*/
/**
 * Convenience: load a file and return it as a string, one character per byte (Latin-1, not UTF-8). Used by `exec`
 * to read config scripts.
 *
 * @param {string} filename the game path, such as `quake.rc`
 * @returns {?string} the file's text, or null if not found
 */
export function COM_LoadFileAsString( filename ) {

	const result = COM_FindFile( filename );
	if ( ! result ) return null;

	let str = '';
	for ( let i = 0; i < result.size; i ++ ) {

		str += String.fromCharCode( result.data[ i ] );

	}

	return str;

}

/*
=================
COM_FetchPak
=================
*/
/**
 * Fetches a .pak file from a URL using fetch() and parses it with `COM_LoadPackFile`; in Deno, loads from filesystem.
 * Does not add it to the search path. Called at start-up for pak0.pak by main.js (which feeds `onProgress` to the loading
 * screen) and by the dedicated server. Prints `Fetching ...` and `Loaded ... (<n> bytes)`.
 *
 * @param {string} url the URL (browser) or filesystem path (Deno)
 * @param {string} [filename] the pack's name for messages; the browser path falls back to `url`
 * @param {function(number): void} [onProgress] called with the fraction loaded, 0..1: per chunk when the response
 * has a Content-Length, otherwise once with 1 at the end
 * @returns {Promise<?pack_t>} the pack, or null when the response is not OK (browser) or the file cannot be read or
 * parsed (Deno; the error is printed)
 * @throws {Error} (as a rejection, browser only) when the fetch fails or `COM_LoadPackFile` rejects the file
 */
export async function COM_FetchPak( url, filename, onProgress ) {

	Sys_Printf( 'Fetching ' + url + '...\\n' );

	// Check if running in Deno
	if ( typeof Deno !== 'undefined' ) {

		// Load from filesystem in Deno
		try {

			const data = await Deno.readFile( url );
			if ( onProgress ) onProgress( 1 );
			return COM_LoadPackFile( filename, data.buffer );

		} catch ( e ) {

			Con_Printf( 'Failed to load ' + url + ': ' + e.message + '\\n' );
			return null;

		}

	}

	// Browser: use fetch
	const response = await fetch( url );
	if ( ! response.ok ) {

		Con_Printf( 'Failed to fetch ' + url + ': ' + response.statusText + '\\n' );
		return null;

	}

	let buffer;
	const contentLength = response.headers.get( 'content-length' );

	if ( onProgress && contentLength && response.body ) {

		const total = parseInt( contentLength, 10 );
		const reader = response.body.getReader();
		const chunks = [];
		let received = 0;

		while ( true ) {

			const { done, value } = await reader.read();
			if ( done ) break;

			chunks.push( value );
			received += value.length;
			onProgress( Math.min( 1, received / total ) );

		}

		buffer = new ArrayBuffer( received );
		const dest = new Uint8Array( buffer );
		let offset = 0;
		for ( const chunk of chunks ) {

			dest.set( chunk, offset );
			offset += chunk.length;

		}

	} else {

		buffer = await response.arrayBuffer();
		if ( onProgress ) onProgress( 1 );

	}

	Sys_Printf( 'Loaded ' + url + ' (' + buffer.byteLength + ' bytes)\\n' );

	return COM_LoadPackFile( filename || url, buffer );

}

/*
=================
COM_FetchOptionalPak
=================
*/
/**
 * Like COM_FetchPak for a pak that may not be there (newer.pak, the startup pack, the owned full game's pak and
 * Newer Game's maps pack): null, quietly, when the file is missing or is not a pak (a server that answers every
 * unknown address with a web page). A malformed pack is also declined with null, since `COM_LoadPackFile` checks
 * the directory before the pack is used. Does not add it to the search path.
 *
 * @param {string} url the URL (browser) or filesystem path (Deno)
 * @param {string} filename the pack's name for messages
 * @returns {Promise<?pack_t>} the pack, or null (never rejects)
 */
export async function COM_FetchOptionalPak( url, filename ) {

	try {

		if ( typeof Deno !== 'undefined' ) {

			const data = await Deno.readFile( url );
			return isPack( data ) ? COM_LoadPackFile( filename, data.buffer.slice( data.byteOffset, data.byteOffset + data.byteLength ) ) : null;

		}

		const response = await fetch( url );
		if ( ! response.ok ) return null;

		const buffer = await response.arrayBuffer();
		return isPack( new Uint8Array( buffer ) ) ? COM_LoadPackFile( filename, buffer ) : null;

	} catch ( e ) {

		return null;

	}

}

function isPack( bytes ) {

	return bytes.length >= 12 && bytes[ 0 ] === 0x50 && bytes[ 1 ] === 0x41 && bytes[ 2 ] === 0x43 && bytes[ 3 ] === 0x4B;

}
