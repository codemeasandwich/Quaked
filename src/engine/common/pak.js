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
 * Errors: calls `Sys_Error` (fatal) at 1 place; throws at 9 places; catches at 6 places.
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
export function COM_SetNewerMapsEnabled( enabled ) { newerMapsEnabled = enabled === true; }

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

Takes an ArrayBuffer of the .pak file contents
Returns a pack_t or null
=================
*/
export function COM_LoadPackFile( filename, buffer ) {

	if ( buffer.byteLength < 12 ) throw new Error( filename + ' has a truncated pack header' );
	const view = new DataView( buffer );

	// Check header
	const id0 = view.getUint8( 0 );
	const id1 = view.getUint8( 1 );
	const id2 = view.getUint8( 2 );
	const id3 = view.getUint8( 3 );

	if ( id0 !== 0x50 || id1 !== 0x41 || id2 !== 0x43 || id3 !== 0x4B ) { // 'PACK'

		Sys_Error( filename + ' is not a packfile' );
		return null;

	}

	const dirofs = view.getInt32( 4, true );
	const dirlen = view.getInt32( 8, true );
	// Reject corruption here, while COM_FetchOptionalPak can still decline
	// the entire optional archive. Deferred payload views must never fail
	// after a malformed pack has already entered the search path.
	if ( dirofs < 12 || dirlen < 0 || dirlen % 64 !== 0 || dirofs > buffer.byteLength - dirlen )
		throw new Error( filename + ' has an invalid pack directory' );

	const numpackfiles = Math.floor( dirlen / 64 ); // each dir entry is 64 bytes

	if ( numpackfiles > MAX_FILES_IN_PACK )
		throw new Error( filename + ' has too many files (' + numpackfiles + ')' );

	const pack = new pack_t();
	pack.filename = filename;
	pack.data = buffer;

	const bytes = new Uint8Array( buffer );

	for ( let i = 0; i < numpackfiles; i ++ ) {

		const entryOffset = dirofs + i * 64;
		const file = new packfile_t();

		// Read filename (56 bytes, null terminated)
		let name = '';
		for ( let j = 0; j < 56; j ++ ) {

			const c = bytes[ entryOffset + j ];
			if ( c === 0 ) break;
			name += String.fromCharCode( c );

		}

		file.name = name.toLowerCase();
		file.filepos = view.getInt32( entryOffset + 56, true );
		file.filelen = view.getInt32( entryOffset + 60, true );
		if ( file.filepos < 0 || file.filelen < 0 || file.filepos > buffer.byteLength - file.filelen )
			throw new Error( filename + ' has an invalid payload: ' + file.name );

		pack.files.push( file );

	}

	Con_Printf( 'Added packfile ' + filename + ' (' + numpackfiles + ' files)\\n' );

	loadedPacks.push( pack );

	return pack;

}

/*
=================
COM_AddGameDirectory

Sets up the search path for a game directory
=================
*/
export function COM_AddGameDirectory( dir ) {

	com_searchpaths.push( { pack: null, path: dir } );

}

/*
=================
COM_AddPack

Adds a loaded pack to the search path
=================
*/
export function COM_AddPack( pack ) {

	com_searchpaths.unshift( { pack: pack, path: null } );

}

/*
=================
COM_FindFile

Searches through the path looking for a file.
Returns { data: Uint8Array, size: number } or null
=================
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

// the names of the files in the packs that start with prefix (lower case)
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

Makes a loaded pack the Newer Game pack (or none, with null).
=================
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

// Small startup transport bundle; full Newer pack entries retain priority
// except the engine-pinned, complete player-face composition kit.
// Logical paths remain unchanged, and loose files remain the optional fallback.
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

export function COM_NewerPackLoaded() {

	return newerPack !== null;

}

// whether the pack's files are visible to COM_FindFile (Newer Game is on)
export function COM_SetNewerActive( on ) {

	newerActive = on === true;

}

/*
=================
COM_NewerFile

A file of the Newer Game pack: { data, size } or null.
=================
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

A URL to load a Newer Game file from: out of the pack when it has the file, otherwise
the loose file at fallback (a checkout without newer.pak).
=================
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

A Newer Game json file: parsed out of the pack, or fetched from fallback (never cached),
or {} when there is neither.
=================
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

Sets the base path for on-demand loose file fetching.
Browser: '' (default, uses relative URLs)
Deno: '/opt/three-quake/' (absolute filesystem path)
=================
*/
export function COM_SetLooseFileBasePath( basePath ) {

	looseFileBasePath = basePath;

}

/*
=================
COM_EnsureFile

Checks if a file is available in pak or virtualFiles.
If not, attempts to fetch it on demand and cache it.
Returns a Promise<boolean>.
=================
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

Fetches a loose file from URL/path and adds it to virtualFiles.
Used for custom maps not included in pak files.
In Deno, reads from filesystem. In browser, uses fetch().
=================
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

Preloads loose map files from the maps/ directory.
basePath is optional - used by Deno server to specify absolute path.
=================
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

Loads a file from the pack system.
Returns an ArrayBuffer of the file contents, or null if not found.
=================
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

Convenience: load a file and return it as a string
=================
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

Fetches a .pak file from a URL using fetch(), returns a Promise<pack_t>
In Deno, loads from filesystem. In browser, uses fetch().
=================
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

Like COM_FetchPak for a pak that may not be there (newer.pak): null, quietly, when the file is
missing or is not a pak (a server that answers every unknown address with a web page).
=================
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
