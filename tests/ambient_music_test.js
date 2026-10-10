const { AmbientMusicPlayer, AMBIENT_SLOT_SECONDS, AMBIENT_BASE_GAIN } = await import( '../src/newer/sound/s_ambientmusic.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
function near( a, b, label ) { if ( Math.abs( a - b ) > 1e-6 ) throw new Error( `${label}: ${a} != ${b}` ); }
export class MediaDouble {

	constructor() { this.duration = 3700; this.currentTime = 0; this.readyState = 4; this.seeking = false; this.paused = true; this.events = new Map(); this.plays = 0; this.rejection = null; }
	addEventListener( name, fn ) { this.events.set( name, fn ); }
	removeEventListener( name ) { this.events.delete( name ); }
	play() { this.plays ++; if ( this.rejection ) return Promise.reject( this.rejection ); this.paused = false; return Promise.resolve(); }
	pause() { this.paused = true; }
	removeAttribute() { this.src = ''; }
	load() { this.loaded = true; }
	tick( dt ) { if ( ! this.paused && this.readyState >= 3 ) this.currentTime += dt; }

}
export class ContextDouble {

	constructor() { this.currentTime = 0; this.state = 'running'; this.sampleRate = 44100; this.destination = {}; this.nodes = []; }
	createGain() { const node = { gain: { value: 0, cancelScheduledValues() {}, setTargetAtTime( v ) { this.value = v; } }, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
	createMediaElementSource( media ) { const node = { media, connect( target ) { this.target = target; }, disconnect() { this.disconnected = true; } }; this.nodes.push( node ); return node; }
	resume() { this.state = 'running'; return Promise.resolve(); }
	close() { this.state = 'closed'; return Promise.resolve(); }

}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function trial( options = {} ) {

	const context = new ContextDouble(), output = {}, media = [];
	const player = new AmbientMusicPlayer( context, output, { random: () => 0, createMedia: () => { const m = new MediaDouble(); media.push( m ); return m; }, ...options } );
	return { context, output, media, player, async step( seconds, policy = {} ) {

		context.currentTime += seconds; media.forEach( m => m.tick( seconds ) );
		player.update( { active: true, moving: false, safe: false, ...policy } ); await flush();

	} };

}

Deno.test( 'two streamed decks use one master path, bounded random offsets and the real twenty-minute default', async () => {

	const t = trial(); await t.step( 0 ); await t.step( 0 ); const state = t.player.getStatus();
	equal( AMBIENT_SLOT_SECONDS, 1200, 'twenty minutes' ); equal( t.media.length, 2, 'bounded media ownership' );
	equal( t.player.bus.target, t.output, 'existing master route' ); equal( state.decks[ 0 ].slot, 1200, 'full segment' );
	near( state.volume, AMBIENT_BASE_GAIN, 'quiet baseline even near combat' ); equal( t.media[ 0 ].volume, 1, 'music volume applied once through gain' );
	for ( const media of t.media ) { equal( media.preload, 'metadata', 'streaming metadata'); equal( media.loop, false, 'no full-track loop' ); }
	t.player.dispose();

} );

Deno.test( 'actual media progress crossfades separated sections and caps each source at twenty minutes', async () => {

	const t = trial(); await t.step( 0 ); await t.step( 1188 ); await t.step( 0 );
	const first = t.player.getStatus().decks[ 0 ].start, next = t.player.getStatus().decks[ 1 ].start;
	equal( Math.abs( first - next ) >= 1200, true, 'separated section selected' ); equal( next + 1200 <= 3700, true, 'section stays within track' );
	await t.step( 6 ); near( t.player.getStatus().decks[ 0 ].gain, .5, 'outgoing half gain' ); near( t.player.getStatus().decks[ 1 ].gain, .5, 'incoming half gain' );
	await t.step( 6 ); equal( t.player.getStatus().transitions, 1, 'one completed fade' ); equal( t.media[ 0 ].paused, true, 'old deck stopped' );
	near( t.player.getStatus().decks[ 0 ].elapsed, 1200, 'old segment exact elapsed' ); await t.step( 50 ); near( t.player.getStatus().decks[ 0 ].elapsed, 1200, 'old segment does not continue' );
	t.player.dispose();

} );

Deno.test( 'pause, mute and a late play promise cannot leak or advance a partial crossfade', async () => {

	const t = trial(); await t.step( 0 ); await t.step( 1188 ); await t.step( 0 ); await t.step( 3 );
	const before = t.player.getStatus().decks.map( d => d.elapsed );
	await t.step( 0, { active: false } ); equal( t.player.bus.gain.value, 0, 'inactive output silent' ); equal( t.media.every( m => m.paused ), true, 'both decks paused' );
	await t.step( 1000, { active: false } ); t.player.getStatus().decks.forEach( ( d, i ) => near( d.elapsed, before[ i ], 'no elapsed pause time' ) );
	await t.step( 0 ); await t.step( 0 ); near( t.player.getStatus().decks[ 1 ].gain, .25, 'partial fade preserved' );
	await t.step( 0, { musicVolume: 0 } ); equal( t.media.every( m => m.paused ), true, 'mute pauses music' ); equal( t.player.bus.gain.value, 0, 'mute gain' );
	t.player.dispose();
	const late = trial(); let resolve; late.media[ 0 ].play = function () { this.paused = false; return new Promise( r => { resolve = r; } ); };
	late.player.update( { active: true } ); late.player.stop(); resolve(); await flush();
	equal( late.player.getStatus().decks[ 0 ].playing, false, 'late promise does not restore stopped playback' ); equal( late.media[ 0 ].paused, true, 'late source remains stopped' ); late.player.dispose();

} );

Deno.test( 'safe walking produces gentle random swells, then returns to background when unsafe or stationary', async () => {

	const t = trial(); await t.step( 0 );
	for ( let i = 0; i < 42; i ++ ) await t.step( .25, { moving: true, safe: true } );
	equal( t.player.getStatus().swells, 1, 'first randomized walking swell' );
	for ( let i = 0; i < 16; i ++ ) await t.step( .25, { moving: true, safe: true } );
	const peak = t.player.getStatus().volume; equal( peak > .095 && peak <= .1, true, 'slight bounded peak' );
	await t.step( .25, { moving: true, safe: false } ); near( t.player.getStatus().volume, AMBIENT_BASE_GAIN, 'combat/near enemy leaves quiet baseline' );
	const swells = t.player.getStatus().swells;
	for ( let i = 0; i < 400; i ++ ) await t.step( .25, { moving: false, safe: true } );
	equal( t.player.getStatus().swells, swells, 'stationary player does not trigger swells' );
	await t.step( 0, { musicVolume: .5 } ); near( t.player.getStatus().volume, AMBIENT_BASE_GAIN / 2, 'music volume applied once' ); t.player.dispose();

} );

Deno.test( 'stalled incoming media cannot complete a fade; expired old section recovers to another bounded section', async () => {

	const t = trial(); await t.step( 0 ); await t.step( 1188 ); await t.step( 0 );
	t.media[ 1 ].readyState = 2; await t.step( 14 );
	equal( t.player.getStatus().transitions, 0, 'stalled fade never promoted' ); equal( t.player.getStatus().recoveries, 1, 'working stream recovered' );
	equal( t.media[ 1 ].paused, true, 'stalled deck stopped' ); equal( t.player.getStatus().decks[ 0 ].elapsed, 0, 'fresh source section' );
	equal( t.player.getStatus().decks[ 0 ].start > 0, true, 'recovery jumps away from old start' ); t.player.dispose();

} );

Deno.test( 'incoming playback failure recovers without repeating a failing play on every frame', async () => {

	const t = trial(); await t.step( 0 ); t.media[ 1 ].rejection = { name: 'NotSupportedError' };
	await t.step( 1188 ); await t.step( 0 ); await t.step( 12 ); await t.step( 0 );
	equal( t.media[ 1 ].plays, 1, 'one failing attempt' ); equal( t.player.getStatus().recoveries, 1, 'recover using live deck' );
	equal( t.player.getStatus().decks[ 0 ].playing, true, 'working stream resumed' ); t.player.dispose();

} );

Deno.test( 'autoplay rejection waits for a real unlock and shutdown releases every owned node and listener', async () => {

	const t = trial(); t.media[ 0 ].rejection = { name: 'NotAllowedError' }; await t.step( 0 );
	for ( let i = 0; i < 100; i ++ ) await t.step( .02 ); equal( t.media[ 0 ].plays, 1, 'no per-frame autoplay retries' );
	equal( t.player.getStatus().phase, 'blocked', 'honest blocked state' ); t.media[ 0 ].rejection = null; t.player.unlock(); await flush();
	equal( t.media[ 0 ].plays, 2, 'gesture retries exactly once' ); t.player.dispose();
	equal( t.media.every( m => m.paused && m.events.size === 0 && m.loaded ), true, 'media released' );
	equal( t.context.nodes.every( n => n.disconnected ), true, 'owned graph disconnected' );

} );

Deno.test( 'short recordings remain bounded and use a proportional overlap', async () => {

	const t = trial( { createMedia: () => { const m = new MediaDouble(); m.duration = 10; return m; } } );
	await t.step( 0 ); equal( t.player.getStatus().decks[ 0 ].slot, 10, 'short-track fallback' );
	// This factory is not tracked by the helper's media clock; advance the real
	// transport doubles through its public media elements for the boundary.
	t.player.decks[ 0 ].media.currentTime = 7.5; await t.step( 0 ); await t.step( 0 );
	t.player.decks[ 1 ].media.currentTime = 2.5; t.player.decks[ 0 ].media.currentTime = 10; await t.step( 0 );
	equal( t.player.getStatus().transitions, 1, 'short-track fade completes' ); equal( t.player.getStatus().decks[ 1 ].start, 0, 'no out-of-bounds seek' ); t.player.dispose();

} );
