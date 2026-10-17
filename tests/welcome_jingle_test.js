// Actual public menu/map/changelevel commands and a loopback connection drive the
// start; only the Audio/AudioContext objects are doubled. No helper applies the
// jingle policy directly to make an assertion pass.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { sv, svs, client_t, set_host_client, skill } from '../src/engine/server/server.js';
import { SV_CheckForNewClients } from '../src/engine/server/sv_main.js';
import { SV_SetPlayer } from '../src/engine/server/sv_phys.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as vars from '../src/engine/common/cvar.js';
import { Host_InitCommands } from '../src/engine/server/host_cmd.js';
import { CL_Init } from '../src/engine/client/cl_main.js';
import { cls, cl, ca_disconnected } from '../src/engine/client/client.js';
import { NET_Init, NET_SendMessage, NET_GetMessage, NET_CanSendMessage } from '../src/engine/net/net_main.js';
import { SZ_Clear, COM_InitArgv } from '../src/engine/common/common.js';
import { R_Init } from '../src/engine/render/gl_rmain.js';
import { V_Init } from '../src/engine/client/view.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import * as menu from '../src/engine/client/menu.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as keys from '../src/engine/client/keys.js';
import * as sound from '../src/engine/sound/sound.js';
import * as dma from '../src/engine/sound/snd_dma.js';
import { WELCOME_TRACK_URL } from '../src/newer/sound/s_welcomejingle.js';
import { LEVEL_SELECT_LEVELS } from '../src/engine/client/menu_levelselect.js';
import { MediaDouble, ContextDouble } from './ambient_music_test.js';
import { assetPath } from '../tools/distribution/manifest.mjs';

const ROOT = fileURLToPath( new URL( '../', import.meta.url ) );
const check = ( x, m ) => { if ( ! x ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

// The real shareware pak plus the Newer hub the engine substitutes for id1's
// intro level, mounted exactly as startup mounts them. The shareware pak is a
// build input that lives in the distribution cache, so read it the way the build
// does rather than assuming a checked-in games/ tree.
for ( const path of [ 'games/shareware/pak0.pak', 'newer/maps.pak' ] ) {
	const b = readFileSync( path === 'games/shareware/pak0.pak' ? assetPath( ROOT, path ) : new URL( '../' + path, import.meta.url ) ), p = pak.COM_LoadPackFile( path, b.buffer.slice( b.byteOffset, b.byteOffset + b.length ) );
	if ( path === 'games/shareware/pak0.pak' ) pak.COM_AddPack( p ); else pak.COM_SetNewerMapsPack( p );

}

VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); cmd.Cbuf_Init(); cmd.Cmd_Init(); CL_Init(); R_Init(); V_Init(); Host_InitCommands(); menu.M_Init();
for ( const c of [ r_hdr, skill, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
svs.maxclients = svs.maxclientslimit = 1; svs.clients = [ new client_t() ]; NET_Init(); cls.state = ca_disconnected; cls.demoplayback = false;

let destination = keys.key_game;
menu.M_SetExternals( { key_dest_get: () => destination, key_dest_set: v => destination = v, cls, sv, svs, cl, Draw_CachePic: () => ( { width: 16, height: 16 } ), Draw_Pic() {}, Draw_TransPic() {}, Draw_Character() {}, Draw_FadeScreen() {}, S_LocalSound() {}, IN_RequestPointerLock() {} } );

function acknowledge() { const c = svs.clients[ 0 ]; if ( c?.active && c.netconnection && cls.netcon && ! cls.netcon.disconnected && c.message.cursize && NET_CanSendMessage( c.netconnection ) ) { NET_SendMessage( c.netconnection, c.message ); NET_GetMessage( cls.netcon ); SZ_Clear( c.message ); } }
function finishConnect() { SV_CheckForNewClients(); const c = svs.clients[ 0 ]; check( c.active && c.netconnection && cls.netcon?.driverdata === c.netconnection, 'actual local loopback is paired' ); set_host_client( c ); SV_SetPlayer( c.edict ); cmd.Cmd_ExecuteString( 'spawn', cmd.src_client ); cmd.Cmd_ExecuteString( 'begin', cmd.src_client ); cls.signon = 4; cl.intermission = 0; acknowledge(); return c.edict; }
async function command( value ) { acknowledge(); cmd.Cmd_ExecuteString( value, cmd.src_command ); await Promise.resolve(); await Promise.resolve(); return finishConnect(); }
function touchMenu( x, y ) { const w = draw.Draw_GetVirtualWidth(), h = draw.Draw_GetVirtualHeight(); menu.M_TouchInput( x + ( w - 320 ) / 2, y + ( h - 200 ) / 2, w, h ); }

/**
 * Begins a real game the way the player does: `menuRow` touches that Single Player
 * row instead of typing `map`, so the menu's own `r_hdr` + `map start` command batch
 * is what runs. Without it the start is an explicit `map` command, as Level Select
 * and the console issue.
 */
async function start( map = 'start', newer = true, menuRow = null ) {
	vars.Cvar_SetValue( 'r_hdr', newer ? 1 : 0 );
	if ( menuRow === null ) return command( 'map ' + map );
	acknowledge(); cmd.Cmd_ExecuteString( 'menu_singleplayer', cmd.src_command ); touchMenu( 160, menuRow ); cmd.Cbuf_Execute(); await Promise.resolve(); return finishConnect();

}

/** Play count across a step, so "must not play" needs no live deck to exist yet. */
function played( step ) { const count = () => decks().reduce( ( n, d ) => n + d.plays, 0 ); const before = count(); return step().then( () => count() - before ); }

let decks = () => [];

/**
 * Installs the audio doubles and starts the real sound system. The gain node is
 * paired to its deck by adjacency: the module builds the element, then the source,
 * then the gain, so the first gain created after a deck appears belongs to it. Gains
 * made by world sounds in between are not attributed to any deck.
 */
async function withAudio( run ) {

	const descriptors = new Map( [ 'window', 'document', 'Audio' ].map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) ), media = [];
	decks = () => media;
	class JingleContext extends ContextDouble {
		createGain() { const node = super.createGain(); if ( media.length > this.attributed ) { media[ media.length - 1 ].bus = node; this.attributed = media.length; } return node; }
	}
	try {

		Object.defineProperty( globalThis, 'window', { configurable: true, value: { AudioContext: JingleContext, devicePixelRatio: 1, innerWidth: 640, innerHeight: 400, location: { search: '', pathname: '/' } } } );
		Object.defineProperty( globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener() {}, removeEventListener() {} } } );
		Object.defineProperty( globalThis, 'Audio', { configurable: true, value: class extends MediaDouble { constructor() { super(); media.push( this ); } } } );
		dma.S_Init(); sound.bgmvolume.value = 1; vars.Cvar_SetValue( 'nosound', 0 );
		const context = dma.S_GetAudioContext();
		context.attributed = 0;
		return await run();

	} finally {

		dma.S_Shutdown(); sound.bgmvolume.value = 1; vars.Cvar_SetValue( 'nosound', 0 ); COM_InitArgv( [ 'quaked' ] ); decks = () => [];
		for ( const [ name, descriptor ] of descriptors ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; }

	}

}

Deno.test( 'the real Newer Game menu row starts the intro jingle once, at the Music Volume gain', () => withAudio( async () => {

	same( await played( () => start( 'start', true, 42 ) ), 1, 'actual Newer Game menu -> Host map starts the jingle exactly once' );
	const deck = decks()[ 0 ];
	check( deck.src.endsWith( 'assets/sounds/quake1newereGame_firstLevelEasyMidHard.mp3' ), 'the element loaded the packaged jingle' );
	same( deck.src, WELCOME_TRACK_URL, 'the element source is the module URL the bundler rewrites' );
	same( deck.paused, false, 'the element is producing audio' );
	same( deck.bus.gain.value, sound.bgmvolume.value, 'Music Volume gain applied' );
	same( deck.bus.target, dma.S_GetAudioContext().destination, 'jingle routes to output, independent of the effects gain' );

} ) );

Deno.test( 'New Game, a directly chosen level and level travel never start the jingle', () => withAudio( async () => {

	same( await played( () => start( 'start', false, 62 ) ), 0, 'actual New Game menu row stays silent' );
	same( await played( () => start( 'e1m1', true ) ), 0, 'a directly chosen Newer level is not a first level' );
	same( await played( () => command( 'changelevel e1m2' ) ), 0, 'level travel is not a fresh start' );
	same( await played( () => command( 'map e1m3' ) ), 0, 'an explicit later level is not a first level' );
	same( decks().length, 0, 'no jingle element was ever created for those starts' );

} ) );

Deno.test( 're-entering the intro map replays the jingle from the top', () => withAudio( async () => {

	await start( 'start', true, 42 );
	decks()[ 0 ].currentTime = 12;
	same( await played( () => start( 'start', true ) ), 1, 'a second intro start plays again' );
	same( decks().length, 1, 'the session reuses one element rather than making more' );
	same( decks()[ 0 ].currentTime, 0, 'the replay rewound instead of resuming' );

} ) );

Deno.test( 'a muted Music Volume and nosound silence the jingle instead of playing inaudibly', () => withAudio( async () => {

	sound.bgmvolume.value = 0; same( await played( () => start( 'start', true, 42 ) ), 0, 'Music Volume 0 stays silent' );
	sound.bgmvolume.value = 1; vars.Cvar_SetValue( 'nosound', 1 );
	same( await played( () => start( 'start', true, 42 ) ), 0, 'nosound stays silent' );
	vars.Cvar_SetValue( 'nosound', 0 );
	same( await played( () => start( 'start', true, 42 ) ), 1, 'unmuting restores the jingle' );
	same( decks()[ 0 ].bus.gain.value, 1, 'the muted starts left no live gain behind' );

} ) );

Deno.test( 'the Scourge of Armagon and Dissolution of Eternity identities start the same jingle on their own intro map', () => withAudio( async () => {

	same( LEVEL_SELECT_LEVELS[ 0 ].map, 'start', 'Quake own intro level is the gate name' );
	for ( const [ flag, title ] of [ [ '-hipnotic', 'Scourge of Armagon' ], [ '-rogue', 'Dissolution of Eternity' ] ] ) {

		COM_InitArgv( [ 'quaked', flag ] );
		check( pak.COM_FindFile( 'maps/start.bsp' ) !== null, title + ' intro level is mounted for the start' );
		same( await played( () => start( 'start', true, 42 ) ), 1, title + ' intro start plays the jingle' );

	}

} ) );

Deno.test( 'an autoplay refusal leaves silence rather than an unhandled rejection', () => withAudio( async () => {

	await start( 'start', true, 42 );
	const deck = decks()[ 0 ];
	deck.rejection = { name: 'NotAllowedError' };
	same( await played( () => start( 'start', true ) ), 1, 'the refusal was reported to the element' );
	await Promise.resolve(); await Promise.resolve();
	same( deck.bus.gain.value, 0, 'a refused play stays silent' );

} ) );