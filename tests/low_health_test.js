// Actual public health/water state and the real per-frame host adapter; only the
// Audio/AudioContext objects are doubled. The policy is never stubbed to pass.
import { edict_t } from '../src/engine/progs/progs.js';
import { cl, cls, SIGNONS, ca_connected } from '../src/engine/client/client.js';
import { sv, MOVETYPE_NOCLIP } from '../src/engine/server/server.js';
import * as cvar from '../src/engine/common/cvar.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import { STAT_HEALTH, STAT_ARMOR } from '../src/engine/common/quakedef.js';
import { LOW_HEALTH_THRESHOLD, LOWHEALTH_TRACK_URL, S_UpdateLowHealth, S_LowHealthPolicy, S_GetLowHealthStatus } from '../src/newer/sound/s_lowhealth.js';
import { MediaDouble, ContextDouble } from './ambient_music_test.js';

function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
const near = ( a, b, label ) => { if ( Math.abs( a - b ) > 1e-6 ) throw new Error( `${label}: ${a} != ${b}` ); };

let decks = () => [];
let armed = null; // an error the next constructed deck refuses to play with, so the first play is the refused one
const plays = () => decks().reduce( ( n, d ) => n + d.plays, 0 );

/**
 * Installs the audio doubles and starts the real sound system, then drives the
 * real per-frame adapter. The gain node is paired to its deck by adjacency: the
 * module builds the element, then the source, then the gain, so the first gain
 * created after a deck appears belongs to it. Gains made by world sounds in
 * between are not attributed to any deck.
 */
async function withGame( run ) {

	const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) ), media = [];
	decks = () => media;
	class JingleContext extends ContextDouble {
		createGain() { const node = super.createGain(); if ( media.length > this.attributed ) { media[ media.length - 1 ].bus = node; this.attributed = media.length; } return node; }
	}
	const saved = { cl: {}, cls: {}, sv: {}, music: sound.bgmvolume.value, dest: keys.key_dest, health: cl.stats[ STAT_HEALTH ], armour: cl.stats[ STAT_ARMOR ] };
	const player = new edict_t( 1, 128 );
	for ( const k of [ 'viewentity', 'worldmodel' ] ) saved.cl[ k ] = cl[ k ];
	for ( const k of [ 'paused', 'intermission' ] ) saved.cl[ k ] = cl[ k ];
	for ( const k of [ 'state', 'signon', 'demoplayback' ] ) saved.cls[ k ] = cls[ k ];
	for ( const k of [ 'active', 'paused', 'edicts', 'num_edicts', 'worldmodel' ] ) saved.sv[ k ] = sv[ k ];
	try {

		Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: JingleContext } } );
		Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
		Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends MediaDouble { constructor() { super(); this.rejection = armed; media.push( this ); } } } );
		if ( ! cvar.Cvar_FindVar( 'r_hdr' ) ) cvar.Cvar_RegisterVariable( post.r_hdr );
		cvar.Cvar_SetValue( 'r_hdr', 1 ); cvar.Cvar_SetValue( 'nosound', 0 ); keys.set_key_dest( keys.key_game ); mode.R_AnimSetClassicPass( false );
		dma.S_Init(); dma.S_GetAudioContext().attributed = 0;
		cl.viewentity = 1; cl.worldmodel = {}; cl.stats[ STAT_HEALTH ] = 100; cl.stats[ STAT_ARMOR ] = 0;
		cl.paused = false; cl.intermission = 0;
		cls.state = ca_connected; cls.signon = SIGNONS; cls.demoplayback = false;
		player.v.health = 100; player.v.waterlevel = 0; player.v.movetype = 3;
		sv.active = true; sv.paused = false; sv.edicts = [ null, player ]; sv.num_edicts = 2; sv.worldmodel = cl.worldmodel;
		sound.bgmvolume.value = 1;
		return await run( { player, step: S_UpdateLowHealth } );

	} finally {

		dma.S_Shutdown(); decks = () => []; armed = null;
		sound.bgmvolume.value = saved.music; keys.set_key_dest( saved.dest ); cvar.Cvar_SetValue( 'nosound', 0 );
		Object.assign( cl, saved.cl ); Object.assign( cls, saved.cls ); Object.assign( sv, saved.sv );
		cl.stats[ STAT_HEALTH ] = saved.health; cl.stats[ STAT_ARMOR ] = saved.armour;
		for ( const [ name, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; }

	}

}

Deno.test( 'the strain plays only inside the 1..11 health band and loops', () => withGame( async ( { step } ) => {

	equal( LOW_HEALTH_THRESHOLD, 12, 'documented threshold' );
	cl.stats[ STAT_HEALTH ] = 12; step(); equal( plays(), 0, 'exactly 12 health is not below the threshold' );
	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); await Promise.resolve();
	equal( plays(), 1, '11 health starts the strain' );
	equal( decks()[ 0 ].paused, false, 'the deck is playing' );
	equal( decks()[ 0 ].loop, true, 'the strain loops rather than repeating by hand' );
	equal( decks()[ 0 ].src, LOWHEALTH_TRACK_URL, 'the element loaded the packaged low-health track' );
	step(); step(); equal( plays(), 1, 'holding inside the band does not restart the deck each frame' );
	equal( S_GetLowHealthStatus().playing, true, 'status reports the loop is running' );
	near( decks()[ 0 ].bus.gain.value, 1, 'Music Volume gain applied' );
	equal( decks()[ 0 ].bus.target, dma.S_GetAudioContext().destination, 'routes to output, independent of the effects gain' );

	cl.stats[ STAT_HEALTH ] = 40; step(); equal( decks()[ 0 ].paused, true, 'leaving the band pauses the strain' );
	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); equal( plays(), 2, 're-entering the band starts it again' );

} ) );

Deno.test( 'death, intermission, pause, menus, mute and Classic are all refused, each with its own reason', () => withGame( async ( { step } ) => {

	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); equal( plays(), 1, 'baseline strain started' );
	const cases = [
		[ () => { cl.stats[ STAT_HEALTH ] = 0; }, () => { cl.stats[ STAT_HEALTH ] = 11; }, 'dead' ],
		[ () => { cl.stats[ STAT_HEALTH ] = -5; }, () => { cl.stats[ STAT_HEALTH ] = 11; }, 'dead', 'negative health' ],
		[ () => { cl.intermission = 1; }, () => { cl.intermission = 0; }, 'intermission' ],
		[ () => { cl.paused = true; }, () => { cl.paused = false; }, 'paused', 'client pause' ],
		[ () => { sv.paused = true; }, () => { sv.paused = false; }, 'paused', 'server pause' ],
		[ () => keys.set_key_dest( keys.key_menu ), () => keys.set_key_dest( keys.key_game ), 'menu or console', 'menu' ],
		[ () => keys.set_key_dest( keys.key_console ), () => keys.set_key_dest( keys.key_game ), 'menu or console', 'console' ],
		[ () => { cls.demoplayback = true; }, () => { cls.demoplayback = false; }, 'demo' ],
		[ () => { sound.bgmvolume.value = 0; }, () => { sound.bgmvolume.value = 1; }, 'muted', 'music mute' ],
		[ () => { cvar.Cvar_SetValue( 'nosound', 1 ); }, () => { cvar.Cvar_SetValue( 'nosound', 0 ); }, 'muted', 'nosound' ],
		[ () => { cvar.Cvar_SetValue( 'r_hdr', 0 ); }, () => { cvar.Cvar_SetValue( 'r_hdr', 1 ); }, 'classic game' ],
		[ () => { cl.worldmodel = null; }, () => { cl.worldmodel = {}; sv.worldmodel = cl.worldmodel; }, 'no game' ]
	];
	for ( const [ set, restore, reason, name = reason ] of cases ) {
		set(); equal( S_LowHealthPolicy( false ).active, false, name + ' is refused' );
		equal( S_LowHealthPolicy( false ).reason, reason, name + ' reports reason ' + reason );
		step(); equal( decks().every( d => d.paused ), true, name + ' pauses the strain' );
		restore();

	}
	equal( S_LowHealthPolicy( false ).active, true, 'restored state plays again' );
	equal( S_LowHealthPolicy( true ).active, false, 'hidden tab' );
	equal( S_LowHealthPolicy( true ).reason, 'hidden', 'hidden reports its own reason' );
	sound.volume.value = 0; equal( S_LowHealthPolicy( false ).active, true, 'Sound Volume does not silence the strain' ); sound.volume.value = 1;

} ) );

Deno.test( 'an eye under water, slime or lava suppresses the strain; wading does not', () => withGame( async ( { player, step } ) => {

	cl.stats[ STAT_HEALTH ] = 11;
	player.v.waterlevel = 0; step(); await Promise.resolve(); equal( plays(), 1, 'dry land plays' );
	player.v.waterlevel = 1; step(); equal( decks()[ 0 ].paused, false, 'feet in water is not submerged' );
	player.v.waterlevel = 2; step(); equal( decks()[ 0 ].paused, false, 'waist deep is not submerged' );
	equal( S_LowHealthPolicy( false ).submerged, false, 'waist deep reports not submerged' );
	player.v.waterlevel = 3; step(); equal( decks()[ 0 ].paused, true, 'eyes under is submerged' );
	equal( S_LowHealthPolicy( false ).reason, 'submerged', 'submersion is its own reason' );
	player.v.waterlevel = 0; step(); await Promise.resolve(); equal( plays(), 2, 'surfacing resumes the strain' );

	// Noclip never runs SV_CheckWater, so its waterlevel is stale and must not suppress.
	player.v.waterlevel = 3; player.v.movetype = MOVETYPE_NOCLIP; step();
	equal( S_LowHealthPolicy( false ).active, true, 'noclip is exempt from the stale waterlevel' );

	// A remote server sends no waterlevel; without a matching local world the strain still plays.
	sv.worldmodel = {}; step();
	equal( S_LowHealthPolicy( false ).active, true, 'a remote server is not treated as submerged' );

} ) );

Deno.test( 'an autoplay refusal stays silent, is not retried every frame, and re-arms after leaving the band', () => withGame( async ( { step } ) => {

	armed = { name: 'NotAllowedError' };
	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); await Promise.resolve();
	equal( decks()[ 0 ].plays, 1, 'the element was asked to play once' );
	equal( S_GetLowHealthStatus().playing, false, 'a refused play is not reported as playing' );
	equal( S_GetLowHealthStatus().blocked, true, 'the refusal is recorded' );
	equal( decks()[ 0 ].paused, true, 'a refused play leaves the deck paused' );
	step(); step(); equal( decks()[ 0 ].plays, 1, 'a blocked deck is not asked to play again every frame' );

	armed = null; decks()[ 0 ].rejection = null;
	cl.stats[ STAT_HEALTH ] = 40; step(); step();
	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); await Promise.resolve();
	equal( decks()[ 0 ].plays, 2, 'leaving the band re-arms the deck' );
	equal( S_GetLowHealthStatus().playing, true, 'the retried play succeeds' );

} ) );

Deno.test( 'shutdown releases the deck, so a later session builds a fresh one on a live context', () => withGame( async ( { step } ) => {

	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve();
	equal( decks().length, 1, 'one deck was built for this session' );
	equal( decks()[ 0 ].loop, true, 'the built deck loops' );

	// S_Shutdown closes the AudioContext, which would leave a cached
	// MediaElementAudioSourceNode bound to a dead context and permanently silent.
	// The looping element must also be stopped and unloaded, or it keeps looping
	// on its own with no live output.
	const first = decks()[ 0 ], context = dma.S_GetAudioContext();
	const source = context.nodes.find( node => node.media === first );
	dma.S_Shutdown();
	equal( S_GetLowHealthStatus().gain, 0, 'shutdown released the gain node' );
	equal( first.paused, true, 'shutdown stopped the looping deck' );
	equal( first.src, '', 'shutdown unloaded the track' );
	equal( first.loaded, true, 'shutdown released the media resource' );
	equal( first.bus.disconnected, true, 'shutdown disconnected the gain' );
	equal( source.disconnected, true, 'shutdown disconnected the media source' );
	dma.S_Init(); dma.S_GetAudioContext().attributed = decks().length;
	cl.stats[ STAT_HEALTH ] = 40; step();
	cl.stats[ STAT_HEALTH ] = 11; step(); await Promise.resolve(); await Promise.resolve();
	equal( decks().length, 2, 'the next session built its own deck rather than reusing the dead one' );
	equal( decks()[ 1 ].paused, false, 'the fresh deck is playing on the live context' );
	equal( decks()[ 1 ].bus.gain.value, 1, 'the fresh deck has its own live gain' );

} ) );
