/**
 * @module engine/client/hexen2_music
 *
 * Hexen II's per-level music (uhexen2 engine/hexen2/cl_parse.c `svc_midi_name`, h2shared bgmusic.c). A worldspawn
 * `MIDI` key names a track without a path (`casa1`, or `midi/casa1.mid` in older maps). The owned data ships OGG
 * conversions under `music/`; this module prefers them and feeds the existing Quake music bus (`CDAudio_Play`) through
 * a URL provider, so the mixer, gain and pause rules stay the shared ones. No MIDI synthesiser exists in the repository:
 * a track with only `.mid` is reported as unplayable, never muted silently.
 *
 * Types: plain values and functions; no exported classes.
 * State: the URL provider's track table and the last selection; installed once by `Hexen2_InstallMusicHook`.
 * Errors: no throws; a missing or MIDI-only track is reported on the console and as `{ ok: false, reason }`.
 */

import { Con_Printf } from '../common/console.js';
import { COM_FindFile } from '../common/pak.js';
import { CDAudio_Play, CDAudio_SetTrackURLProvider, CDAudio_Stop } from '../sound/cd_audio.js';
import { Hexen2_SetClientHooks } from './cl_hexen2.js';

const PLAYABLE = Object.freeze( [ 'ogg', 'mp3', 'wav' ] );
const MIDI = Object.freeze( [ 'mid', 'midi' ] );

let providerInstalled = false;
let nextTrack = 1;
const trackURLs = new Map(), nameTracks = new Map();
let lastSelection = null;

/**
 * The track stem in a worldspawn `MIDI` value: `casa1`, `midi/casa1` and `midi/casa1.mid` all become `casa1`.
 *
 * @param {string} name the worldspawn value
 * @returns {string} the lower-case stem, or '' for an empty value or one that is not a plain track name (a map's
 *   value never reaches a file path with separators or `..`)
 */
export function Hexen2_MusicStem( name ) {

	let text = String( name ?? '' ).trim().replace( /\\/g, '/' ).toLowerCase();
	if ( text === '' ) return '';
	text = text.replace( /^(?:music|midi)\//, '' );
	text = text.replace( /\.(?:mid|midi|ogg|mp3|wav)$/, '' );
	return /^[a-z0-9_-]+$/.test( text ) ? text : '';

}

/**
 * The game paths to try for one worldspawn value, preferred first: the OGG conversion, then MP3/WAV, then the native
 * `midi/<name>.mid` (unplayable here, but reported precisely).
 *
 * @param {string} name the worldspawn value
 * @returns {Array<string>} candidate game paths
 */
export function Hexen2_MusicCandidates( name ) {

	const stem = Hexen2_MusicStem( name );
	if ( stem === '' ) return [];
	const out = [];
	for ( const extension of PLAYABLE ) out.push( `music/${stem}.${extension}` );
	for ( const extension of MIDI ) out.push( `midi/${stem}.${extension}` );
	return out;

}

/**
 * Finds the best available file for a worldspawn value.
 *
 * @param {string} name the worldspawn value
 * @param {function(string): ?object} [find=COM_FindFile] the game-data lookup; truthy when the path exists
 * @returns {?{ path: string, format: string, data: ?object }} the chosen file, or null
 */
export function Hexen2_MusicFile( name, find = COM_FindFile ) {

	for ( const path of Hexen2_MusicCandidates( name ) ) {

		let found = null;
		try { found = find( path ); } catch { found = null; }
		if ( found ) return { path, format: path.slice( path.lastIndexOf( '.' ) + 1 ).toLowerCase(), data: found };

	}
	return null;

}

function makeObjectURL( data, format = 'ogg' ) {

	try {

		const bytes = data?.data ?? data;
		if ( typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function' ) return null;
		const type = format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : 'audio/ogg';
		const blob = new Blob( [ bytes ], { type } );
		return URL.createObjectURL( blob );

	} catch {

		return null;

	}

}

/**
 * Resolves a worldspawn value to a playable URL, preferring the game data's OGG/MP3 conversion.
 *
 * @param {string} name the worldspawn value
 * @param {{ find?: function(string): ?object, makeURL?: function(object): ?string }} [options] lookup/URL overrides
 * @returns {{ ok: true, path: string, url: string, format: string } |
 *   { ok: false, reason: string, path?: string, candidates?: Array<string> }} the result
 */
export function Hexen2_MusicURL( name, options = {} ) {

	const file = Hexen2_MusicFile( name, options.find ?? COM_FindFile );
	const candidates = Hexen2_MusicCandidates( name );
	if ( file !== null && !MIDI.includes( file.format ) ) {

		const url = options.makeURL ? options.makeURL( file.data ) : makeObjectURL( file.data, file.format );
		if ( url ) return { ok: true, path: file.path, url, format: file.format };

	}
	// A platform mount (the desktop app's game folder) can stream the loose data1/music or portals/music file without
	// reading it into a pack. It is asked only when the mounted paks have no conversion.
	const external = globalThis.__QUAKED_HEXEN2_MUSIC_URL__;
	if ( typeof external === 'function' ) {

		for ( const path of candidates ) {

			const format = path.slice( path.lastIndexOf( '.' ) + 1 ).toLowerCase();
			if ( MIDI.includes( format ) ) continue;
			let url = null;
			try { url = external( path ); } catch { url = null; }
			if ( url ) return { ok: true, path, url, format, external: true };

		}

	}
	if ( file !== null && MIDI.includes( file.format ) ) return { ok: false, reason: 'midi-no-synth', path: file.path };
	return { ok: false, reason: file === null ? 'no file' : 'no URL', path: file?.path, candidates };

}

function installProvider() {

	if ( providerInstalled ) return;
	providerInstalled = true;
	CDAudio_SetTrackURLProvider( track => trackURLs.get( track ) ?? null );

}

function trackFor( name ) {

	if ( nameTracks.has( name ) ) return nameTracks.get( name );
	const track = nextTrack;
	nextTrack = nextTrack >= 98 ? 1 : nextTrack + 1;
	nameTracks.set( name, track );
	return track;

}

/**
 * Plays the music named by a worldspawn `MIDI` key (or the empty string, which stops the previous level's music).
 *
 * @param {string} name the worldspawn value, as the server sent it
 * @param {{ find?: function(string): ?object, makeURL?: function(object): ?string,
 *   play?: function(number, boolean): void, stop?: function(): void, provider?: function(?function(number): ?string): void }} [options]
 *   test seams; production uses the shared CD audio bus
 * @returns {{ ok: boolean, reason?: string, path?: string, url?: string, track?: number, stopped?: boolean }} the result
 */
export function Hexen2_PlayMusicName( name, options = {} ) {

	const text = String( name ?? '' ).trim();
	if ( text === '' ) {

		( options.stop ?? CDAudio_Stop )();
		lastSelection = { name: '', stopped: true };
		return { ok: true, stopped: true };

	}
	const resolved = Hexen2_MusicURL( text, options );
	if ( !resolved.ok ) {

		if ( resolved.reason === 'midi-no-synth' )
			Con_Printf( 'Hexen II music: %s is a MIDI file and this build has no MIDI synthesiser; supply music/%s.ogg or .mp3\n', resolved.path, Hexen2_MusicStem( text ) );
		else
			Con_Printf( 'Hexen II music: no playable file for %s (looked for %s)\n', text, Hexen2_MusicCandidates( text ).join( ', ' ) );
		lastSelection = { name: text, ...resolved };
		return resolved;

	}
	const track = trackFor( text );
	trackURLs.set( track, resolved.url );
	if ( options.play || options.provider ) {

		( options.provider ?? ( providerInstalled ? null : CDAudio_SetTrackURLProvider ) )?.( track => trackURLs.get( track ) ?? null );
		providerInstalled = true;

	}
	if ( options.play ) options.play( track, true );
	else if ( options.play === undefined ) {

		installProvider();
		CDAudio_Play( track, true );

	}
	lastSelection = { name: text, ...resolved, track };
	return { ...resolved, track };

}

/** The last music selection, for diagnostics and the menu. */
export function Hexen2_LastMusic() { return lastSelection; }

/** Installs the `svc_hexen2_midi_name` client hook. Called once by `Host_Init`. */
export function Hexen2_InstallMusicHook() {

	Hexen2_SetClientHooks( { midiName: name => Hexen2_PlayMusicName( name ) } );

}

/** Clears the track table and removes the URL provider (tests and a game switch). */
export function Hexen2_ResetMusic() {

	trackURLs.clear();
	nameTracks.clear();
	nextTrack = 1;
	lastSelection = null;
	if ( providerInstalled ) CDAudio_SetTrackURLProvider( null );
	providerInstalled = false;

}
