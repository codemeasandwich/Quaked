// Public menu -> queued playback/cvar commands -> real demo disconnect APIs.
// Header-only demo and availability-only BSP fixtures create no world/browser.
// The map command endpoint observes the real CL_Disconnect ownership boundary;
// it does not claim server spawning, GPU readiness or browser qualification.
import * as vars from '../src/cvar.js';
import * as cmd from '../src/cmd.js';
import * as client from '../src/cl_main.js';
import * as demo from '../src/cl_demo.js';
import * as split from '../src/r_demosplit.js';
import * as menu from '../src/menu.js';
import * as keys from '../src/keys.js';
import * as draw from '../src/gl_draw.js';
import * as post from '../src/gl_post.js';
import { cls, ca_disconnected } from '../src/client.js';
import { COM_AddPack } from '../src/pak.js';
import { NEWER_ENABLED_FEATURES } from '../src/newer_defaults.js';
import { Host_InitCommands } from '../src/host_cmd.js';
import { NET_Init, NET_Shutdown } from '../src/net_main.js';
import { svs } from '../src/server.js';

const check = ( value, label ) => { if ( ! value ) throw Error( label ); };
const same = ( actual, expected, label ) => check( actual === expected, `${label}: expected ${expected}, got ${actual}` );
const execute = text => cmd.Cmd_ExecuteString( text, cmd.src_command );
const hdr = () => vars.Cvar_VariableString( 'r_hdr' );
const bytes = new TextEncoder().encode( '-1\n' );
COM_AddPack( { filename: 'hdr-ownership-public-memory', data: bytes.buffer,
	files: [ 'hdr_ownership.dem', 'maps/start.bsp', 'maps/e2m1.bsp' ].map( name => ( { name, filepos: 0, filelen: bytes.length } ) ) } );
for ( const variable of [ post.r_hdr, split.r_demosplit ] ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
for ( const name of [ ...NEWER_ENABLED_FEATURES, 'gamma', 'cl_showfps', 'maxplayers' ] )
	if ( ! vars.Cvar_FindVar( name ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( name, '0' ) );
cmd.Cbuf_Init(); cmd.Cmd_Init(); client.CL_Init(); menu.M_Init();
let trace = [], modeNewer = true, dest = keys.key_game;
menu.M_SetExternals( { key_dest_set: value => { dest = value; }, key_dest_get: () => dest,
	cls, sv: { active: false }, svs: { maxclients: 1 }, S_LocalSound: () => {}, IN_RequestPointerLock: () => {} } );
const snap = stage => trace.push( { stage, hdr: hdr(), demoplayback: cls.demoplayback, split: split.R_DemoSplitActive() } );
cmd.Cmd_AddCommand( 'map', () => {
	snap( 'selected-cvar-before-map-disconnect' );
	client.CL_Disconnect();
	snap( 'after-real-map-disconnect-boundary' );
} );
function touch( x, y ) {
	const w = draw.Draw_GetVirtualWidth(), h = draw.Draw_GetVirtualHeight();
	menu.M_TouchInput( x + ( w - 320 ) / 2, y + ( h - 200 ) / 2, w, h );
}
function select( newer ) {
	execute( 'menu_singleplayer' ); touch( 100, 32 + 4 * 20 + 4 );
	same( menu.m_state, menu.m_levelselect, 'public Level Select opened' );
	if ( modeNewer !== newer ) { touch( 190, 52 ); modeNewer = newer; }
	// choose Episode 2 (the episode row, one step on from the default Episode 1), then its first level, E2M1
	touch( 190, 68 );
	touch( 120, 84 + 2 );
	same( dest, keys.key_game, 'real menu selection returns game input' );
	snap( 'public-selection-queued' );
}
async function fixture( initial, fn ) {
	const oldWindow = Object.getOwnPropertyDescriptor( globalThis, 'window' );
	Object.defineProperty( globalThis, 'window', { configurable: true, value: { devicePixelRatio: 1, innerWidth: 640, innerHeight: 400, location: { search: '', pathname: '/' } } } );
	const original = hdr(), archived = post.r_hdr.archive;
	try {
		client.CL_Disconnect(); cmd.Cbuf_Init(); cls.state = ca_disconnected; cls.demonum = -1;
		cls.demoplayback = cls.timedemo = false; vars.Cvar_Set( 'r_hdr', initial ); vars.Cvar_Set( 'r_demosplit', '1' ); trace = [];
		await fn();
	} finally {
		cls.timedemo = false; client.CL_Disconnect(); split.R_DemoSplitEnd(); cmd.Cbuf_Init();
		vars.Cvar_Set( 'r_hdr', original ); post.r_hdr.archive = archived;
		if ( oldWindow ) Object.defineProperty( globalThis, 'window', oldWindow ); else delete globalThis.window;
	}
}

for ( const newer of [ true, false ] ) Deno.test( `selection before pending attract preserves explicit ${newer ? 'Newer' : 'Classic'} HDR through real disconnect`, () => fixture( newer ? '0' : '1', () => {
	cmd.Cbuf_AddText( 'playattractdemo hdr_ownership\nwait\n' );
	select( newer ); cmd.Cbuf_Execute(); snap( 'pending-attract-started-before-choice' );
	same( cls.demoplayback, true, 'queued attract actually started' );
	cmd.Cbuf_Execute();
	console.log( 'HDR_OWNERSHIP_CAUSAL ' + JSON.stringify( { newer, trace, expectedFinal: newer ? 1 : 0, actualFinal: vars.Cvar_VariableValue( 'r_hdr' ) } ) );
	same( vars.Cvar_VariableValue( 'r_hdr' ), newer ? 1 : 0, 'late attract End cannot overwrite explicit public mode' );
} ) );

Deno.test( 'selection during active attract and a later ordinary same-value choice keep explicit owner mode', () => fixture( '0', () => {
	for ( const newer of [ true, false ] ) {
		execute( 'playattractdemo hdr_ownership' ); same( cls.demoplayback, true, 'active attract exists before public selection' );
		select( newer ); cmd.Cbuf_Execute();
		same( vars.Cvar_VariableValue( 'r_hdr' ), newer ? 1 : 0, 'active-attract explicit selection survives Release/End' );
	}
	vars.Cvar_Set( 'r_hdr', '0' ); execute( 'playattractdemo hdr_ownership' );
	execute( 'r_hdr 1' ); demo.CL_StopPlayback();
	same( hdr(), '1', 'same-value explicit console choice owns HDR after demo end' );
} ) );

Deno.test( 'actual public connect local boundary preserves an explicit HDR choice and restores an untouched demo borrow', () => fixture( '0', async () => {
	// Existing host commands retain their actual connect implementation; the
	// already-registered map observation endpoint is intentionally unchanged.
	const clients = { maxclients: svs.maxclients, maxclientslimit: svs.maxclientslimit };
	svs.maxclients = svs.maxclientslimit = 1;
	Host_InitCommands(); NET_Init();
	try {
		for ( const explicit of [ false, true ] ) {
			vars.Cvar_Set( 'r_hdr', '0' ); execute( 'playattractdemo hdr_ownership' );
			same( cls.demoplayback, true, 'actual attract before network boundary' );
			if ( explicit ) execute( 'r_hdr 1' );
			execute( 'connect local' );
			for ( let i = 0; i < 10; i ++ ) await Promise.resolve();
			check( cls.netcon && ! cls.netcon.disconnected, 'actual in-memory loopback connected without browser or server process' );
			same( cls.demoplayback, false, 'real host connect stopped attract playback' );
			same( split.R_DemoSplitActive(), false, 'connection is not an attract presentation' );
			same( vars.Cvar_VariableValue( 'r_hdr' ), explicit ? 1 : 0, 'network boundary honors HDR ownership' );
			client.CL_Disconnect();
		}
	} finally { client.CL_Disconnect(); NET_Shutdown(); Object.assign( svs, clients ); }
} ) );

Deno.test( 'demo-only end restores exact prior HDR and repeated Start/End do not replace the original borrow', () => fixture( '0.000000', () => {
	execute( 'playattractdemo hdr_ownership' ); split.R_DemoSplitStart();
	same( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'attract enables comparison' );
	demo.CL_StopPlayback(); split.R_DemoSplitEnd();
	same( hdr(), '0.000000', 'exact original mode string restored' );
} ) );

Deno.test( 'temporary HDR presentation preserves archived config/storage, and same-value ordinary ownership persists its choice', () => fixture( '0', () => {
	const oldStorage = Object.getOwnPropertyDescriptor( globalThis, 'localStorage' ), writes = [];
	Object.defineProperty( globalThis, 'localStorage', { configurable: true, value: { setItem: ( key, value ) => writes.push( [ key, value ] ) } } );
	post.r_hdr.archive = true; // exercise the existing generic archived-cvar contract
	try {
		execute( 'playattractdemo hdr_ownership' );
		same( writes.length, 0, 'demo transport cannot save temporary HDR' );
		check( vars.Cvar_WriteVariables().includes( 'r_hdr "0"\n' ), 'config serialization preserves underlying mode' );
		execute( 'r_hdr 1' );
		same( writes.at( -1 )?.join( ':' ), 'quake_cvar_r_hdr:1', 'explicit same-value choice saves owner value' );
		demo.CL_StopPlayback(); same( hdr(), '1', 'demo end preserves saved explicit choice' );
		check( vars.Cvar_WriteVariables().includes( 'r_hdr "1"\n' ), 'config now contains explicit owner choice' );
	} finally { post.r_hdr.archive = false; if ( oldStorage ) Object.defineProperty( globalThis, 'localStorage', oldStorage ); else delete globalThis.localStorage; }
} ) );

Deno.test( 'ordinary disconnect and manual/file/timed demos restore or preserve current owner HDR without attract leakage', () => fixture( '0', () => {
	execute( 'playattractdemo hdr_ownership' ); client.CL_Disconnect(); same( hdr(), '0', 'ordinary disconnect restores untouched borrow' );
	for ( const command of [ 'playdemo hdr_ownership', 'timedemo hdr_ownership' ] ) {
		vars.Cvar_Set( 'r_hdr', '1' ); execute( command );
		same( hdr(), '1', 'manual/timed demo retains owner mode' ); same( split.R_DemoSplitActive(), false, 'manual/timed never becomes attract' );
		cls.timedemo = false; client.CL_Disconnect(); same( hdr(), '1', 'following disconnect preserves owner mode' );
	}
	demo.CL_PlayDemoFromData( bytes.buffer ); same( hdr(), '1', 'manual file playback preserves owner mode' );
	client.CL_Disconnect(); same( hdr(), '1', 'file end preserves owner mode' );
} ) );
