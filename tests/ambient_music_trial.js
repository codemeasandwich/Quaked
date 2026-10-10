await import( '../main.js' );
const { Cbuf_AddText } = await import( '../src/engine/common/cmd.js' );
const { Cvar_SetValue } = await import( '../src/engine/common/cvar.js' );
const { R_DemoSplitRelease } = await import( '../src/newer/render/r_demosplit.js' );
const { S_UnlockAudio, S_GetAudioContext, S_GetMasterGain } = await import( '../src/engine/sound/snd_dma.js' );
const { S_GetAmbientMusicStatus } = await import( '../src/newer/sound/s_ambientgame.js' );
const music = await import( '../src/newer/sound/s_ambientmusic.js' );
const keys = await import( '../src/engine/client/keys.js' );
const { sv, FL_MONSTER } = await import( '../src/engine/server/server.js' );
const { cl, cls } = await import( '../src/engine/client/client.js' );
const { ED_Alloc, ED_Free } = await import( '../src/engine/progs/pr_edict.js' );
while ( ! window.renderer ) await new Promise( r => setTimeout( r, 10 ) );
const evidence = { checks: 0, failures: [], modes: {}, defaultSlotSeconds: music.AMBIENT_SLOT_SECONDS,
	observations: { demoSilent: 0, classicSilent: 0, safeMoving: 0, enemySuppressed: 0, combatSuppressed: 0, creditsSilent: 0, actualPlayback: 0, swells: 0, transitions: 0, peakRms: 0 }, starts: [], duration: null, state: null };
let mode = 'demo', enemy = null, analyser = null, analysedPlayer = null;
// Test controls are not in-game mouse attacks.
for ( const event of [ 'mousedown', 'mouseup' ] ) document.querySelector( '#ambient-panel' ).addEventListener( event, e => e.stopPropagation() );
const samples = new Float32Array( 256 );
function check( condition, message ) { if ( ! condition && ! evidence.failures.includes( message ) ) evidence.failures.push( message ); }
const stopWalking = () => Cbuf_AddText( '-forward\n-back\n-moveleft\n-moveright\n' );
document.querySelector( '#newer' ).onclick = () => {

	S_UnlockAudio(); mode = 'newer'; stopWalking(); keys.set_key_dest( keys.key_game );
	R_DemoSplitRelease( true ); // same handoff as the actual Newer Game menu
	Cbuf_AddText( 'r_hdr 1\nr_flashlight 0\nmap start\n' );

};
document.querySelector( '#walk' ).onclick = () => {

	S_UnlockAudio(); mode = 'walking'; keys.set_key_dest( keys.key_game ); stopWalking();
	Array.from( { length: 40 }, ( _, i ) => [ 'forward', 'moveright', 'back', 'moveleft' ][ i % 4 ] ).forEach( ( direction, i ) => setTimeout( () => { stopWalking(); Cbuf_AddText( '+' + direction + '\n' ); }, i * 500 ) );
	setTimeout( stopWalking, 20000 );

};
document.querySelector( '#shot' ).onclick = () => { S_UnlockAudio(); mode = 'combat'; Cbuf_AddText( '+attack\n' ); setTimeout( () => Cbuf_AddText( '-attack\n' ), 700 ); };
document.querySelector( '#enemy' ).onclick = () => {

	mode = 'near-enemy'; if ( ! sv.active ) return;
	if ( ! enemy ) enemy = ED_Alloc(); enemy.v.health = 100; enemy.v.flags = FL_MONSTER;
	enemy.v.origin.set( sv.edicts[ cl.viewentity ].v.origin ); enemy.v.origin[ 0 ] += 100;

};
document.querySelector( '#clear' ).onclick = () => { mode = 'newer'; if ( enemy ) { ED_Free( enemy ); enemy = null; } };
document.querySelector( '#short' ).onclick = () => {

	S_UnlockAudio(); mode = 'short-slots'; stopWalking(); keys.set_key_dest( keys.key_game );
	music.S_AmbientMusicShutdown(); if ( analyser ) analyser.disconnect(); analyser = analysedPlayer = null;
	// The same production controller and host policy; shorten only this trial's
	// slot to exercise real MP3 seeks and fades without a forty-minute wait.
	music.S_AmbientMusicInit( S_GetAudioContext(), S_GetMasterGain(), { slotSeconds: 8, fadeSeconds: 2 } );

};
document.querySelector( '#classic' ).onclick = () => { mode = 'classic'; stopWalking(); Cvar_SetValue( 'r_hdr', 0 ); };
document.querySelector( '#resume' ).onclick = () => { S_UnlockAudio(); mode = 'newer'; Cvar_SetValue( 'r_hdr', 1 ); keys.set_key_dest( keys.key_game ); };
document.querySelector( '#credits' ).onclick = () => { mode = 'credits'; stopWalking(); Cbuf_AddText( 'menu_credits\n' ); };
document.querySelector( '#hide' ).onclick = () => { document.querySelector( '#ambient-panel' ).style.display = 'none'; };
setInterval( () => {

	const state = S_GetAmbientMusicStatus(), player = music.S_GetAmbientMusicPlayer(); evidence.state = state;
	evidence.checks ++; evidence.modes[ mode ] = ( evidence.modes[ mode ] || 0 ) + 1;
	if ( player && player !== analysedPlayer ) {

		analyser = S_GetAudioContext().createAnalyser(); analyser.fftSize = 256; player.bus.connect( analyser ); analysedPlayer = player;

	}
	if ( analyser ) { analyser.getFloatTimeDomainData( samples ); const rms = Math.sqrt( samples.reduce( ( sum, v ) => sum + v * v, 0 ) / samples.length ); evidence.observations.peakRms = Math.max( evidence.observations.peakRms, rms ); }
	if ( cls.demoplayback ) { check( ! player?.allowed, 'music active in demo' ); evidence.observations.demoSilent ++; }
	if ( mode === 'classic' ) { check( ! player?.allowed && ( ! player || player.decks.every( d => d.media.paused ) ), 'music active in classic' ); evidence.observations.classicSilent ++; }
	if ( mode === 'credits' ) { check( ! player?.allowed, 'music active in credits/menu' ); evidence.observations.creditsSilent ++; }
	if ( state.safe && state.moving ) evidence.observations.safeMoving ++;
	if ( state.enemiesNearby ) { check( ! state.safe, 'enemy did not suppress swells' ); evidence.observations.enemySuppressed ++; }
	if ( state.combat ) { check( ! state.safe, 'combat did not suppress swells' ); evidence.observations.combatSuppressed ++; }
	if ( player ) {

		evidence.observations.swells = Math.max( evidence.observations.swells, state.playback.swells );
		evidence.observations.transitions = Math.max( evidence.observations.transitions, state.playback.transitions );
		for ( const deck of player.decks ) {

			if ( deck.playing && deck.media.currentTime > deck.start + .1 && ! deck.media.paused ) evidence.observations.actualPlayback ++;
			if ( Number.isFinite( deck.media.duration ) ) evidence.duration = deck.media.duration;
			if ( deck.start !== null && ! evidence.starts.includes( deck.start ) ) evidence.starts.push( deck.start );
			if ( deck.start !== null ) check( deck.start >= 0 && deck.start + deck.slot <= deck.media.duration, 'section outside recording' );

		}
		check( state.playback.volume <= .1, 'music above quiet ceiling' );
		if ( mode !== 'short-slots' && evidence.observations.transitions === 0 ) check( player.slotSeconds === 1200, 'production slot is not twenty minutes' );

	}
	document.querySelector( '#status' ).textContent = `${evidence.failures.length ? 'FAIL' : 'PASS'} — ${evidence.checks} live checks; ${evidence.observations.actualPlayback} decoded playback observations; ${evidence.observations.transitions} transitions`;
	document.querySelector( '#report' ).textContent = JSON.stringify( evidence, null, 2 );

}, 500 );
