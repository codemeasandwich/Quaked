// Public playback commands and profiler lifecycle share the real cvar registry.
// A tiny header-only in-memory demo supplies playback; no map or renderer mock
// decides whether comparison is enabled. Actual rendering is a browser trial.
await import( '../src/gl_rsurf.js' );
const vars = await import( '../src/engine/common/cvar.js' );
const cmd = await import( '../src/engine/common/cmd.js' );
const demo = await import( '../src/cl_demo.js' );
const client = await import( '../src/cl_main.js' );
const { cls, ca_disconnected } = await import( '../src/client.js' );
const pak = await import( '../src/engine/common/pak.js' );
const post = await import( '../src/gl_post.js' );
const split = await import( '../src/r_demosplit.js' );
const perf = await import( '../src/r_perf.js' );
const host = await import( '../src/engine/server/host.js' );

const preferences = [ post.r_hdr, split.r_demosplit, post.r_dynres, perf.cl_showfps ];
for ( const variable of preferences ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
cmd.Cbuf_Init();
if ( ! cmd.Cmd_Exists( 'playattractdemo' ) ) client.CL_Init();
const bytes = new TextEncoder().encode( '-1\n' );
pak.COM_AddPack( { filename: 'profiler-mode-regression-memory', data: bytes.buffer,
 files: [ 'profiler_mode_test.dem', 'demo1.dem', 'demo2.dem', 'demo3.dem' ].map( name => ( { name, filepos: 0, filelen: bytes.length } ) ) } );

function equal( actual, expected, label ) {
 if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );
}

function withState( check, { hdr = 0, comparison = 1, demonum = 2, missing = false } = {} ) {
 const originalPreferences = preferences.map( variable => variable.string );
 const fields = [ 'state', 'demoplayback', 'timedemo', 'demonum', 'demodata', 'demopos', 'demofile', 'forcetrack', 'signon', 'td_startframe', 'td_lastframe', 'td_starttime' ];
 const originalClient = Object.fromEntries( fields.map( field => [ field, cls[ field ] ] ) );
 const originalDemos = cls.demos.slice();
 const descriptor = Object.getOwnPropertyDescriptor( performance, 'now' );
 let clock = 100000, menu = false;
 const commands = [], logs = [];
 Object.defineProperty( performance, 'now', { configurable: true, value: () => ( clock += 40 ) } );
 cmd.Cbuf_Init(); split.R_DemoSplitEnd();
 cls.state = ca_disconnected; cls.demoplayback = cls.timedemo = false; cls.signon = 0; cls.demonum = demonum;
 vars.Cvar_SetValue( 'r_hdr', hdr ); vars.Cvar_SetValue( 'r_demosplit', comparison );
 vars.Cvar_SetValue( 'r_dynres', 1 ); vars.Cvar_SetValue( 'cl_showfps', 0 );
 perf.R_PerfSetHost( {
  cls, getCvar: vars.Cvar_VariableValue, setCvar: vars.Cvar_SetValue,
  menuOpen: () => menu, log: text => logs.push( text ), size: () => '800x600',
  Cbuf_AddText( text ) {
   commands.push( text );
   cmd.Cbuf_AddText( missing && text.startsWith( 'timedemo ' ) ? 'timedemo profiler_mode_missing\n' : text );
  }
 } );
 const fixture = {
  commands, logs, menu( value ) { menu = value; },
  frame() {
   cmd.Cbuf_Execute();
   if ( cls.demoplayback ) cls.signon = 4;
   if ( perf.R_PerfProfiling() ) {
    equal( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'profile renders enhanced mode' );
    equal( split.R_DemoSplitActive(), false, 'profile never compares a second scene' );
   }
   perf.R_PerfFrameBegin( performance.now() / 1000 ); perf.R_PerfStage( 'world draw' ); perf.R_PerfFrameEnd();
  },
  restored() {
   equal( perf.R_PerfProfiling(), false, 'profiling stopped' );
   equal( vars.Cvar_VariableValue( 'r_hdr' ), hdr, 'underlying owner HDR restored' );
   equal( vars.Cvar_VariableValue( 'r_demosplit' ), comparison, 'comparison preference restored' );
   equal( vars.Cvar_VariableValue( 'r_dynres' ), 1, 'dynamic resolution restored' );
   equal( vars.Cvar_VariableValue( 'cl_showfps' ), 0, 'FPS preference restored' );
   equal( cls.demonum, demonum, 'attract loop position restored' );
  }
 };
 try { check( fixture ); }
 finally {
  if ( perf.R_PerfProfiling() ) perf.R_PerfStop( 'stopped' );
  client.CL_Disconnect(); split.R_DemoSplitEnd(); cmd.Cbuf_Init();
  preferences.forEach( ( variable, i ) => vars.Cvar_Set( variable.name, originalPreferences[ i ] ) );
  fields.forEach( field => { cls[ field ] = originalClient[ field ]; } );
  originalDemos.forEach( ( value, i ) => { cls.demos[ i ] = value; } );
  perf.R_PerfSetHost( null );
  if ( descriptor ) Object.defineProperty( performance, 'now', descriptor ); else delete performance.now;
 }
}

Deno.test( 'attract playback compares in menus while manual and file demos remain single-view', () => withState( () => {
 equal( cmd.Cmd_Exists( 'playattractdemo' ), true, 'explicit attract command registered' );
 cls.demonum = 0; cls.demos[ 0 ] = 'profiler_mode_test';
 client.CL_NextDemo(); cmd.Cbuf_Execute();
 equal( split.R_DemoSplitActive(), true, 'idle attract comparison' );
 equal( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'attract temporary enhanced mode' );
 cls.demonum = -1; // Opening the menu pauses the loop without changing playback intent.
 equal( split.R_DemoSplitActive(), true, 'current attract still compares behind menu' );
 cmd.Cmd_ExecuteString( 'playdemo profiler_mode_test', cmd.src_command );
 equal( cls.demoplayback, true, 'manual playback running' );
 equal( split.R_DemoSplitActive(), false, 'manual playback single-view' );
 equal( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'manual mode is owner preference' );
 demo.CL_PlayDemoFromData( bytes.buffer, true );
 equal( split.R_DemoSplitActive(), true, 'explicit attract starts comparison' );
 demo.CL_PlayDemoFromData( bytes.buffer );
 equal( split.R_DemoSplitActive(), false, 'file playback default is single-view' );
 equal( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'file mode preserves owner preference' );
} ) );

Deno.test( 'timedemo suppresses forced full-classic and failed loading never sets timedemo', () => withState( () => {
 cmd.Cmd_ExecuteString( 'timedemo profiler_mode_test', cmd.src_command );
 equal( cls.timedemo, true, 'timed playback started' ); equal( split.R_DemoSplitActive(), false, 'forced comparison suppressed' );
 client.CL_Disconnect();
 cmd.Cmd_ExecuteString( 'timedemo profiler_mode_missing', cmd.src_command );
 equal( cls.demoplayback, false, 'missing demo did not start' ); equal( cls.timedemo, false, 'missing demo is not timed' );
 equal( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'timedemo did not force HDR' );
}, { comparison: 2 } ) );

Deno.test( 'title profiling is enhanced-only and restores the underlying owner mode on cancellation', () => withState( fixture => {
 demo.CL_PlayDemoFromData( bytes.buffer, true ); equal( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'title temporary mode active' );
 perf.R_PerfStart( 1 );
 equal( cls.demonum, -1, 'profiler solely advances demos' ); equal( split.R_DemoSplitActive(), false, 'title comparison suspended' );
 equal( vars.Cvar_VariableValue( 'r_demosplit' ), 0, 'forced classic disabled for measured frames' );
 equal( vars.Cvar_VariableValue( 'r_dynres' ), 0, 'full resolution measured' );
 perf.R_PerfPump( fixture.frame ); perf.R_PerfStop( 'stopped' ); fixture.restored();
 cmd.Cbuf_Execute(); demo.CL_PlayDemoFromData( bytes.buffer, true );
 equal( split.R_DemoSplitActive(), true, 'ordinary attract comparison works after profile' );
 client.CL_Disconnect(); equal( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'subsequent attract scope has correct owner mode' );
}, { comparison: 2 } ) );

Deno.test( 'completed profiles report measured enhanced mode after classic owner preferences are restored', () => withState( fixture => {
 perf.R_PerfStart( 1 );
 let pumps = 0;
 while ( perf.R_PerfProfiling() && pumps++ < 50 ) perf.R_PerfPump( fixture.frame );
 equal( pumps < 50, true, 'bounded three-demo completion' ); fixture.restored();
 const report = perf.R_PerfLastReport();
 equal( report.newerGame, true, 'report identifies measured enhanced renderer' ); equal( report.partial, false, 'all three demos completed' );
 equal( report.demos.map( entry => entry.demo ).join( ',' ), 'demo1,demo2,demo3', 'profiler controls demo order' );
 equal( report.demos.every( entry => entry.frames >= 1 ), true, 'each demo measured' );
 equal( report.text.includes( 'Newer Game' ), true, 'console report uses measured mode' );
 equal( fixture.commands.filter( text => text.startsWith( 'timedemo ' ) ).length, 3, 'one playback command per profile demo' );
} ) );

Deno.test( 'menu cancellation from an active enhanced game restores preferences and reports partial measurements', () => withState( fixture => {
 perf.R_PerfStart( 0 );
 for ( let i = 0; i < 6; i++ ) perf.R_PerfPump( fixture.frame );
 fixture.menu( true ); perf.R_PerfPump( fixture.frame ); fixture.restored();
 equal( perf.R_PerfLastReport().partial, true, 'Esc retains useful partial report' );
 equal( perf.R_PerfLastReport().newerGame, true, 'partial report remains enhanced' );
}, { hdr: 1, comparison: 1, demonum: -1 } ) );

Deno.test( 'failed profiler demo loading stops within its bound and restores all preferences', () => withState( fixture => {
 perf.R_PerfStart( 0 );
 let pumps = 0;
 while ( perf.R_PerfProfiling() && pumps++ < 3010 ) perf.R_PerfPump( fixture.frame );
 equal( pumps <= 3001, true, 'failed start obeys 3000-frame wait bound' ); fixture.restored();
 equal( cls.timedemo, false, 'failed playback leaves no timedemo state' );
 equal( fixture.logs.some( text => text.includes( 'did not start' ) ), true, 'failed load is reported' );
}, { missing: true, comparison: 2 } ) );

Deno.test( 'uncaught frame errors restore profiler settings before propagating the original error', () => withState( fixture => {
 perf.R_PerfStart( 0 ); const expected = new Error( 'profiling-frame-regression' ); let caught = null;
 try { perf.R_PerfPump( () => { throw expected; } ); } catch ( error ) { caught = error; }
 equal( caught, expected, 'original error propagated' ); fixture.restored();
} ) );

Deno.test( 'recovered Host_Error stops profiling through the actual Host_Frame command interface', () => withState( fixture => {
 const command = 'profiler_mode_host_error';
 if ( ! cmd.Cmd_Exists( command ) ) cmd.Cmd_AddCommand( command, () => host.Host_Error( 'profiler regression' ) );
 perf.R_PerfStart( 0 ); cmd.Cbuf_InsertText( command + '\n' );
 host.Host_Frame( .1 ); fixture.restored();
} ) );
