import { Hexen2_ResolveMusicURL, Hexen2_PlayMusicName, Hexen2_ResetMusic } from '../src/engine/client/hexen2_music.js';
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); };
const midi = new Uint8Array( [ 77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,12,0,144,60,100,96,128,60,0,0,255,47,0 ] );
Deno.test( 'MIDI-only music resolves to a cached playable WAV and feeds the shared bus', async () => {
	Hexen2_ResetMusic(); let blobs = 0;
	const options = { find: path => path === 'midi/trial.mid' ? { data: midi } : null,
		makeURL: bytes => { check( new DataView( bytes ).getUint32( 0 ) === 0x52494646, 'WAV bytes reach URL maker' ); return 'blob:wav' + ++ blobs; } };
	const a = await Hexen2_ResolveMusicURL( 'trial', options );
	check( a.ok && a.format === 'wav' && a.url === 'blob:wav1', 'MIDI synthesised' );
	const b = await Hexen2_ResolveMusicURL( 'midi/trial.mid', options );
	check( b.url === a.url && blobs === 1, 'stem cached' );
	let played = false;
	await Hexen2_PlayMusicName( 'trial', { ...options, provider: fn => check( fn( 1 ) === a.url, 'shared provider' ), play: ( n, loop ) => { played = n === 1 && loop; } } );
	check( played, 'shared bus plays looping WAV' ); Hexen2_ResetMusic();
} );
Deno.test( 'mounted and platform OGG stay preferred over MIDI; render errors remain unplayable', async () => {
	Hexen2_ResetMusic();
	const find = path => path.endsWith( '.mid' ) || path === 'music/trial.ogg' ? { data: midi } : null;
	const ogg = await Hexen2_ResolveMusicURL( 'trial', { find, makeURL: () => 'blob:ogg' } );
	check( ogg.ok && ogg.format === 'ogg', 'mounted OGG preferred' );
	const loose = await Hexen2_ResolveMusicURL( 'trial', { find: p => p.endsWith( '.mid' ) ? { data: midi } : null, source: p => p.endsWith( '.ogg' ) ? 'blob:loose' : null } );
	check( loose.format === 'ogg' && loose.external, 'platform OGG preferred' );
	const bad = await Hexen2_ResolveMusicURL( 'bad', { find: p => p.endsWith( '.mid' ) ? { data: new Uint8Array( 1 ) } : null } );
	check( !bad.ok && bad.reason === 'midi-no-synth', 'render failure falls back' ); Hexen2_ResetMusic();
} );
Deno.test( 'reset supersedes pending MIDI/source selections without repopulating the session cache', async () => {
	Hexen2_ResetMusic();
	let release, made = 0, played = 0;
	const source = () => new Promise( resolve => { release = resolve; } );
	const pending = Hexen2_PlayMusicName( 'trial', { find: p => p.endsWith( '.mid' ) ? { data: midi } : null,
		source, makeURL: () => { made ++; return 'blob:stale'; }, play: () => { played ++; } } );
	Hexen2_ResetMusic(); release( null );
	const result = await pending;
	check( !result.ok && result.reason === 'superseded' && made === 0 && played === 0, 'old source/render never caches or plays' );
	const options = { find: p => p.endsWith( '.mid' ) ? { data: midi } : null, makeURL: () => 'blob:new' + ++made };
	const rendering = Hexen2_ResolveMusicURL( 'trial', options );
	Hexen2_ResetMusic();
	check( !( await rendering ).ok && made === 0, 'queued render cancelled by reset' );
	check( ( await Hexen2_ResolveMusicURL( 'trial', options ) ).url === 'blob:new1', 'new session renders fresh' );
	Hexen2_ResetMusic();
} );
Deno.test( 'MIDI creates an audio WAV object URL and reset revokes it', async () => {
	Hexen2_ResetMusic();
	const result = await Hexen2_ResolveMusicURL( 'owned-url', { find: p => p === 'midi/owned-url.mid' ? { data: midi } : null } );
	check( result.ok && result.format === 'wav' && result.url.startsWith( 'blob:' ), 'real playable object URL' );
	const response = await fetch( result.url );
	check( response.headers.get( 'content-type' ) === 'audio/wav' && new DataView( await response.arrayBuffer() ).getUint32( 0 ) === 0x52494646, 'object URL contains WAV data' );
	Hexen2_ResetMusic();
	let revoked = false; try { await fetch( result.url ); } catch { revoked = true; }
	check( revoked, 'reset releases WAV Blob storage' );
} );
