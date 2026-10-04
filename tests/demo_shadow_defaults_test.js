// Demo intent/preferences through public playback commands and actual beam API.
// A header-only in-memory demo drives no map, server, renderer or game loop.
import * as THREE from 'three';
import * as vars from '../src/cvar.js';
import * as cmd from '../src/cmd.js';
import * as client from '../src/cl_main.js';
import * as demo from '../src/cl_demo.js';
import { cls, ca_disconnected } from '../src/client.js';
import { COM_AddPack } from '../src/pak.js';
import * as split from '../src/r_demosplit.js';
import * as perf from '../src/r_perf.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import { r_flashlight, R_FlashlightUpdate, R_FlashlightBeam } from '../src/r_flashlight.js';

const check = ( x, label ) => { if ( ! x ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const features = [ r_flashlight, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_shadows, post.r_pointshadows ];
const controls = [ post.r_hdr, split.r_demosplit, post.r_dynres, perf.cl_showfps, ...features ]; for ( const v of controls ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
cmd.Cbuf_Init(); if ( ! cmd.Cmd_Exists( 'playattractdemo' ) ) client.CL_Init();
const data = new TextEncoder().encode( '-1\n' ); COM_AddPack( { filename: 'demo-shadow-public-test-memory', data: data.buffer, files: [ 'demo_shadow_test.dem', 'demo1.dem', 'demo2.dem', 'demo3.dem' ].map( name => ( { name, filepos: 0, filelen: data.length } ) ) } );
function beam() { R_FlashlightUpdate( [ 0, 0, 22 ], [ 1, 0, 0 ], [ 0, -1, 0 ], [ 0, 0, 1 ] ); return R_FlashlightBeam().on; }
function fixture( fn ) {

	const saved = controls.map( v => v.string ), fields = [ 'state', 'demoplayback', 'timedemo', 'demonum', 'demodata', 'demopos', 'demofile', 'forcetrack', 'signon', 'td_startframe', 'td_lastframe', 'td_starttime' ], state = Object.fromEntries( fields.map( name => [ name, cls[ name ] ] ) ), oldNewer = anim.R_IsNewer(), oldLighting = anim.R_NewerLightingActive();
	try { split.R_DemoSplitEnd(); cmd.Cbuf_Init(); cls.state = ca_disconnected; cls.demoplayback = cls.timedemo = false; cls.signon = 0; vars.Cvar_Set( 'r_hdr', '0' ); features.forEach( v => vars.Cvar_Set( v.name, '0' ) ); vars.Cvar_Set( 'r_demosplit', '1' ); fn(); }
	finally { if ( perf.R_PerfProfiling() ) perf.R_PerfStop( 'stopped' ); cls.timedemo = false; client.CL_Disconnect(); split.R_DemoSplitEnd(); cmd.Cbuf_Init(); controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); fields.forEach( name => { cls[ name ] = state[ name ]; } ); perf.R_PerfSetHost( null ); anim.R_AnimSetClassicPass( false ); anim.R_AnimSetNewer( oldNewer ); anim.R_AnimSetLighting( oldLighting ); beam(); }

}
function renderer() { let target = null, viewport = new THREE.Vector4( 0, 0, 320, 200 ), scissor = viewport.clone(), test = false, clear = new THREE.Color(), alpha = 1; const draws = []; return { draws, capabilities: { isWebGL2: true }, extensions: { has: () => true }, autoClear: true, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, getViewport: v => v.copy( viewport ), setViewport: ( ...args ) => { args[ 0 ]?.isVector4 ? viewport.copy( args[ 0 ] ) : viewport.set( ...args ); }, getScissor: v => v.copy( scissor ), setScissor: ( ...args ) => { args[ 0 ]?.isVector4 ? scissor.copy( args[ 0 ] ) : scissor.set( ...args ); }, getScissorTest: () => test, setScissorTest: v => { test = v; }, getClearColor: c => c.copy( clear ), getClearAlpha: () => alpha, setClearColor: ( c, a ) => { clear.set( c ); alpha = a; }, clear() {}, render: scene => draws.push( { scene, beam: R_FlashlightBeam().on } ) }; }

Deno.test( 'first public attract playback enables real enhanced flashlight and Classic half suppresses it, then stopping restores manual preferences', () => fixture( () => {

	cmd.Cmd_ExecuteString( 'playattractdemo demo_shadow_test', cmd.src_command ); same( cls.demoplayback, true, 'header-only attract playback intent active' ); same( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'attract temporarily enables enhanced view' ); same( r_flashlight.value, 1, 'first attract enables flashlight even when saved preference was off' ); same( split.R_DemoSplitActive(), true, 'attract split active' );
	for ( const v of features ) same( v.value, 1, v.name + ' temporary demonstration default enabled' );
	const r = renderer(); vars.Cvar_Set( 'r_dynres', '0' ); post.R_PostBegin( r, true, 320, 200 ); same( beam(), true, 'actual enhanced beam is on in first title demo' );
	try { split.R_DemoSplitClassic( r, new THREE.Scene(), new THREE.PerspectiveCamera(), { lx: 0, ly: 0, lw: 320, lh: 200 }, () => { anim.R_AnimSetClassicPass( true ); same( beam(), false, 'Classic pass has no flashlight despite active demo preference' ); }, () => { anim.R_AnimSetClassicPass( false ); beam(); } ); same( r.draws[ 0 ].beam, false, 'actual Classic scene endpoint observes no beam' ); same( beam(), true, 'enhanced beam returns after classic pass' ); }
	finally { post.R_PostBegin( r, false, 0, 0 ); }
	demo.CL_StopPlayback(); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'stop restores original HDR preference' ); same( r_flashlight.value, 0, 'stop restores original manual flashlight preference' ); same( split.R_DemoSplitActive(), false, 'stop ends temporary attract scope' );
	for ( const v of features ) same( v.value, 0, v.name + ' original disabled preference restored after demo' );

} ) );

Deno.test( 'attract preference scope is idempotent and Release preserves game defaults while Classic release restores pre-demo flashlight', () => fixture( () => {

	cls.demoplayback = true; split.R_DemoSplitStart(); split.R_DemoSplitStart(); split.R_DemoSplitEnd(); same( r_flashlight.value, 0, 'repeated Start cannot replace saved manualoff with temporaryon' ); vars.Cvar_Set( 'r_flashlight', '1' ); split.R_DemoSplitEnd(); same( r_flashlight.value, 1, 'repeated End cannot overwrite later manual changes' );
	vars.Cvar_Set( 'r_flashlight', '0' ); split.R_DemoSplitStart();
	// Match the actual menu: commands are queued before Release, then executed
	// afterward. Release returns temporary aux preferences to their owner.
	cmd.Cbuf_AddText( 'r_hdr 1\nr_flashlight 1\nr_newer_lighting 1\nr_newer_normals 1\nr_newer_shadows 1\nr_pointshadows 1\n' ); split.R_DemoSplitRelease( true ); same( r_flashlight.value, 0, 'Release first restores temporary aux preference' ); cmd.Cbuf_Execute(); split.R_DemoSplitEnd(); same( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'enhanced game retains its own mode' ); for ( const v of features ) same( v.value, 1, v.name + ' queued game default survives release' ); same( split.R_DemoSplitActive(), false, 'released attract is no longer compared' );
	vars.Cvar_Set( 'r_hdr', '0' ); vars.Cvar_Set( 'r_flashlight', '0' ); split.R_DemoSplitStart(); vars.Cvar_Set( 'r_hdr', '0' ); split.R_DemoSplitRelease( false ); split.R_DemoSplitEnd(); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'Classic game mode is never overwritten by saved HDR' ); same( r_flashlight.value, 0, 'Classic game does not retain demo-only flashlight override' );
	vars.Cvar_Set( 'r_hdr', '1' ); vars.Cvar_Set( 'r_flashlight', '1' ); split.R_DemoSplitStart(); split.R_DemoSplitEnd(); same( r_flashlight.value, 1, 'saved manualon is also restored exactly' );

} ) );

Deno.test( 'manual, timed and explicitly disabled demo playback never install attract flashlight preferences', () => fixture( () => {

	for ( const command of [ 'playdemo demo_shadow_test', 'timedemo demo_shadow_test' ] ) { cmd.Cmd_ExecuteString( command, cmd.src_command ); same( cls.demoplayback, true, 'public manual/timed playback loaded header' ); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'manual/timed owner mode unchanged' ); same( r_flashlight.value, 0, 'manual/timed owner flashlight unchanged' ); same( split.R_DemoSplitActive(), false, 'no manual/timed attract comparison' ); cls.timedemo = false; client.CL_Disconnect(); }
	vars.Cvar_Set( 'r_demosplit', '0' ); cmd.Cmd_ExecuteString( 'playattractdemo demo_shadow_test', cmd.src_command ); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'disabled comparison does not force mode' ); same( r_flashlight.value, 0, 'disabled comparison preserves manual flashlight' ); demo.CL_StopPlayback(); same( r_flashlight.value, 0, 'disabled stop leaves preference unchanged' );

} ) );

Deno.test( 'profiler cancellation never borrows attract flashlight defaults and restores the owner mode before another attract starts', () => fixture( () => {

	const queued = []; perf.R_PerfSetHost( { cls, getCvar: vars.Cvar_VariableValue, setCvar: vars.Cvar_SetValue, menuOpen: () => false, log: () => {}, size: () => '320x200', Cbuf_AddText: text => queued.push( text ) } );
	perf.R_PerfStart( 1 ); check( perf.R_PerfProfiling(), 'actual public profiler starts bounded measurement intent' ); same( r_flashlight.value, 0, 'profiler leaves manual beam preference' ); split.R_DemoSplitStart(); same( r_flashlight.value, 0, 'profiling blocks attract override even under direct public Start' ); same( split.R_DemoSplitActive(), false, 'profiler remains single view' ); check( queued.some( text => text.startsWith( 'timedemo ' ) ), 'profiler uses timed intent without executing a game' ); perf.R_PerfStop( 'stopped' ); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'profiling restores owner mode' ); same( r_flashlight.value, 0, 'profiling restores owner flashlight' );
	cls.demoplayback = true; split.R_DemoSplitStart(); same( r_flashlight.value, 1, 'ordinary attract default works after profiler scope ends' ); split.R_DemoSplitEnd(); same( r_flashlight.value, 0, 'following attract scope still restores owner preference' );

} ) );
