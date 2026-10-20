// Packaged-app Hexen II music: the desktop source reads a loose music token through the existing scoped library reader
// (library.rs, library_read), builds a Blob URL and revokes the previous one; Portal's tuklu*/track* tracks prefer the
// portals token. The registered source is the seam hexen2_music.js exposes to desktop.js.
import { Desktop_Hexen2MusicSource } from '../src/platform/desktop.js';
import { Hexen2_MusicURL, Hexen2_PlayMusicName, Hexen2_ResetMusic, Hexen2_ResolveMusicURL,
	Hexen2_SetMusicSource } from '../src/engine/client/hexen2_music.js';

const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const bytesOf = async blob => new Uint8Array( await blob.arrayBuffer() );

function fixture( entries ) {

	const bytes = new Map( entries.map( ( [ token, data ] ) => [ token, new Uint8Array( data ) ] ) );
	const reads = [], blobs = [], revoked = [], urls = [];
	const read = async ( token, offset, length ) => {

		reads.push( { token, offset, length } );
		const data = bytes.get( token );
		if ( ! data ) throw new Error( 'unknown token ' + token );
		return data.slice( offset, offset + length );

	};
	const options = {
		read,
		createObjectURL: blob => { blobs.push( blob ); const url = 'blob:' + blobs.length; urls.push( url ); return url; },
		revokeObjectURL: url => revoked.push( url ),
	};
	return { bytes, reads, blobs, revoked, urls, options };

}

Deno.test( 'the packaged music source reads a token in bounded chunks into a Blob URL and revokes the old URL', async () => {

	Hexen2_ResetMusic();
	const data = Array.from( { length: 10 }, ( _, i ) => i + 1 );
	const f = fixture( [ [ 'hexen2/music/casa1.ogg', data ] ] );
	const source = Desktop_Hexen2MusicSource( { packs: [
		{ token: 'hexen2/music/casa1.ogg', game: 'hexen2', name: 'music/casa1.ogg', bytes: data.length },
	] }, { game: 'hexen2', chunk: 4, ...f.options } );
	const url = await source( 'music/casa1.ogg' );
	same( url, 'blob:1', 'the provider returns the object URL' );
	same( f.reads.length, 3, 'the file is read in bounded chunks' );
	check( f.reads.every( read => read.token === 'hexen2/music/casa1.ogg' && read.length <= 4 ), 'every read names the token and respects the bound' );
	same( f.reads.map( read => read.offset ).join( ',' ), '0,4,8', 'the chunks continue at the file offset' );
	same( f.blobs[ 0 ].type, 'audio/ogg', 'the Blob carries the OGG type' );
	const assembled = await bytesOf( f.blobs[ 0 ] );
	same( assembled.length, data.length, 'every byte is assembled' );
	check( assembled.every( ( byte, i ) => byte === data[ i ] ), 'the Blob is the file, not a truncated read' );
	same( await source( 'music/casa1.ogg' ), 'blob:1', 'repeating the playing track reuses its URL' );
	same( f.blobs.length, 1, 'a repeat does not read or build another Blob' );
	same( f.revoked.length, 0, 'the URL the music element still points at is not revoked' );

	// a second track (the next level) revokes the URL the bus may still be pointing at, then returns its own
	const f2 = fixture( [ [ 'hexen2/music/casa1.ogg', data ], [ 'hexen2/music/casa2.ogg', [ 9, 8 ] ] ] );
	const two = Desktop_Hexen2MusicSource( { packs: [
		{ token: 'hexen2/music/casa1.ogg', game: 'hexen2', name: 'music/casa1.ogg', bytes: data.length },
		{ token: 'hexen2/music/casa2.ogg', game: 'hexen2', name: 'music/casa2.ogg', bytes: 2 },
	] }, { game: 'hexen2', ...f2.options } );
	same( await two( 'music/casa1.ogg' ), 'blob:1' );
	same( await two( 'music/casa2.ogg' ), 'blob:2' );
	same( f2.revoked.join( ',' ), 'blob:1', 'the previous object URL is revoked when the new track starts' );

} );

Deno.test( 'the packaged source prefers the portals token for Portal tuklu and track tracks and the base for the rest', async () => {

	Hexen2_ResetMusic();
	const library = { packs: [
		{ token: 'hexen2/music/casa1.ogg', game: 'hexen2', name: 'music/casa1.ogg', bytes: 4 },
		{ token: 'hexen2-portals/music/casa1.ogg', game: 'hexen2-portals', name: 'music/casa1.ogg', bytes: 6 },
		{ token: 'hexen2/music/tulku1.ogg', game: 'hexen2', name: 'music/tulku1.ogg', bytes: 5 },
		{ token: 'hexen2-portals/music/tulku1.ogg', game: 'hexen2-portals', name: 'music/tulku1.ogg', bytes: 7 },
		{ token: 'hexen2/music/track02.mp3', game: 'hexen2', name: 'music/track02.mp3', bytes: 5 },
		{ token: 'hexen2-portals/music/track02.mp3', game: 'hexen2-portals', name: 'music/track02.mp3', bytes: 9 },
	] };
	const f = fixture( [
		[ 'hexen2/music/casa1.ogg', [ 1, 1, 1, 1 ] ],
		[ 'hexen2-portals/music/casa1.ogg', [ 2, 2, 2, 2, 2, 2 ] ],
		[ 'hexen2/music/tulku1.ogg', [ 3, 3, 3, 3, 3 ] ],
		[ 'hexen2-portals/music/tulku1.ogg', [ 4, 4, 4, 4, 4, 4, 4 ] ],
		[ 'hexen2/music/track02.mp3', [ 5, 5, 5, 5, 5 ] ],
		[ 'hexen2-portals/music/track02.mp3', [ 6, 6, 6, 6, 6, 6, 6, 6, 6 ] ],
	] );
	const source = Desktop_Hexen2MusicSource( library, { game: 'hexen2-portals', base: 'hexen2', ...f.options } );
	await source( 'music/tulku1.ogg' );
	same( f.reads[ 0 ].token, 'hexen2-portals/music/tulku1.ogg', 'a Portal tuklu track prefers portals/music' );
	same( ( await bytesOf( f.blobs[ 0 ] ) )[ 0 ], 4, 'the portals bytes are used' );
	await source( 'music/track02.mp3' );
	same( f.reads[ f.reads.length - 1 ].token, 'hexen2-portals/music/track02.mp3', 'a Portal track* track prefers portals/music' );
	same( f.blobs[ 1 ].type, 'audio/mpeg', 'an MP3 keeps its type' );
	await source( 'music/casa1.ogg' );
	same( f.reads[ f.reads.length - 1 ].token, 'hexen2/music/casa1.ogg', 'a base track prefers the base edition' );
	same( ( await bytesOf( f.blobs[ 2 ] ) )[ 0 ], 1, 'the base bytes are used' );

} );

Deno.test( 'the packaged source refuses missing, unsafe and oversized music tokens', async () => {

	Hexen2_ResetMusic();
	const f = fixture( [] );
	const source = Desktop_Hexen2MusicSource( { packs: [
		{ token: 'hexen2/music/big.wav', game: 'hexen2', name: 'music/big.wav', bytes: ( 64 << 20 ) + 1 },
	] }, { game: 'hexen2', ...f.options } );
	same( await source( 'music/missing.ogg' ), null, 'a track the library did not list is refused' );
	same( await source( '../music/escape.ogg' ), null, 'a path with a separator never becomes a token' );
	same( await source( 'music/notes.txt' ), null, 'a non-music extension is refused' );
	same( await source( 'music/big.wav' ), null, 'a file over the bound is refused before a read' );
	same( f.reads.length, 0, 'nothing was read for a refused path' );
	same( f.blobs.length, 0, 'no Blob or object URL is built' );

} );

Deno.test( 'the registered source is the only platform fallback and the pack/source path stays synchronous', async () => {

	Hexen2_ResetMusic();
	const source = path => Promise.resolve( path === 'music/casa1.ogg' ? 'blob:registered' : null );
	Hexen2_SetMusicSource( source );
	const resolved = await Hexen2_ResolveMusicURL( 'casa1', { find: () => null } );
	check( resolved.ok && resolved.external === true && resolved.url === 'blob:registered', 'the registered source resolves the loose track' );
	const calls = [];
	const played = await Hexen2_PlayMusicName( 'casa1', { find: () => null, play: ( track, looping ) => calls.push( [ track, looping ] ), provider: () => {} } );
	check( played.ok && played.track >= 1, 'the platform track is selected: ' + JSON.stringify( played ) );
	same( calls.length, 1, 'the shared music bus is asked to play' );
	same( calls[ 0 ][ 1 ], true, 'level music loops' );
	// A pack with only the native MIDI still gets its loose OGG conversion from the platform source.
	Hexen2_SetMusicSource( path => Promise.resolve( path === 'music/casa2.ogg' ? 'blob:loose-ogg' : null ) );
	const midi = await Hexen2_PlayMusicName( 'casa2', { find: path => path === 'midi/casa2.mid' ? { data: new Uint8Array( 1 ) } : null,
		play: () => {}, provider: () => {} } );
	check( midi.ok && midi.external === true && midi.path === 'music/casa2.ogg' && midi.url === 'blob:loose-ogg',
		'the source supplies the OGG beside a MIDI-only pack' );
	Hexen2_ResetMusic();

	// No registered source: the source build's pack lookup returns immediately, exactly as before.
	const absent = Hexen2_PlayMusicName( 'casa2', { find: () => null } );
	check( !absent.ok && absent.reason === 'no file', 'a missing pack track is reported' );
	same( typeof absent.then, 'undefined', 'the source build path returns a plain result, not a Promise' );
	const packURL = Hexen2_MusicURL( 'casa1', { find: path => path === 'music/casa1.ogg' ? { data: new Uint8Array( 1 ) } : null, makeURL: () => 'blob:pack' } );
	check( packURL.ok && packURL.url === 'blob:pack', 'the pack conversion is still preferred and synchronous' );

} );
