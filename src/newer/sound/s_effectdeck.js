/** Streamed SFX deck shared by water and player event cues. The caller owns
 * cue policy, envelopes and bus choice; no second AudioContext or mixer lives here.
 */
export function createEffectDeck( context, url, loop, output ) {
	const media = new Audio(), gain = context.createGain();
	const deck = { media, gain, source: null, playing: false, blocked: false, level: 0, generation: 0 };
	media.preload = 'auto'; media.loop = loop; media.volume = 1; media.src = url;
	gain.gain.value = 0;
	try {
		deck.source = context.createMediaElementSource( media );
		deck.source.connect( gain ); gain.connect( output );
	} catch ( error ) { deck.blocked = true; deck.error = String( error?.message ?? error ); }
	media.onended = () => { deck.playing = false; };
	media.onerror = () => { deck.playing = false; deck.blocked = true; deck.error = 'Media load failed'; };
	return deck;
}

/** Pause immediately and invalidate any pending play result. */
export function stopEffect( deck ) {
	deck.generation ++; deck.media.pause(); deck.playing = false; deck.level = 0; deck.gain.gain.value = 0; deck.blocked = false;
}

/** Start at most one outstanding play; rejected requests remain observable and
 * never retry every frame. A new genuine cue/activation can re-arm with stopEffect.
 */
export function startEffect( deck, restart = false ) {
	if ( deck.playing || deck.blocked || ! deck.source ) return;
	if ( restart ) deck.media.currentTime = 0;
	const generation = ++ deck.generation;
	deck.playing = true;
	let promise;
	try { promise = deck.media.play(); } catch ( error ) {
		deck.playing = false; deck.blocked = true; deck.error = String( error?.message ?? error ); return;
	}
	Promise.resolve( promise ).then( () => {
		if ( generation !== deck.generation && ! deck.playing ) deck.media.pause();
	}, error => {
		if ( generation !== deck.generation ) return;
		deck.playing = false; deck.blocked = true; deck.error = String( error?.message ?? error );
	} );
}

/** Unload and disconnect before the owning context closes. */
export function releaseEffect( deck ) {
	stopEffect( deck ); deck.media.onended = deck.media.onerror = null;
	deck.media.removeAttribute( 'src' ); deck.media.load();
	deck.source?.disconnect(); deck.gain.disconnect();
}
