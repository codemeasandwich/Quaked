// Observe the real menu command and renderer. Auxiliary shadow/probe/portal
// views are counted separately from the one main camera scene presentation.
const controls = document.querySelector( 'section' );
for ( const name of [ 'pointerdown', 'mousedown', 'mouseup', 'keydown', 'keyup' ] ) controls.addEventListener( name, e => e.stopPropagation() );
await import( '../main.js' );
while ( ! window.renderer || ! window.Cbuf_AddText ) await new Promise( resolve => setTimeout( resolve, 20 ) );
const perf = await import( '../src/r_perf.js' ), anim = await import( '../src/r_anim.js' ), split = await import( '../src/r_demosplit.js' );
const cvar = await import( '../src/engine/common/cvar.js' ), menu = await import( '../src/engine/client/menu.js' ), draw = await import( '../src/gl_draw.js' ), keys = await import( '../src/engine/client/keys.js' );
const { Cbuf_AddText, Cmd_ExecuteString, Cmd_AddCommand } = await import( '../src/engine/common/cmd.js' );
// Read the mutable frame counter through its live module namespace.
const hostRuntime = await import( '../src/engine/server/host.js' );
const { Host_Error } = hostRuntime;
const { cls } = await import( '../src/engine/client/client.js' );
const renderer = window.renderer, originalRender = renderer.render;
const evidence = { idleEnhanced: 0, idleClassic: 0, runs: [], failures: [] };
let current = null, active = false, seenFrames = new Map(), pendingStop = false;
function settings() { return Object.fromEntries( [ 'r_hdr', 'r_demosplit', 'r_dynres', 'cl_showfps' ].map( n => [ n, cvar.Cvar_VariableValue( n ) ] ).concat( [ [ 'demonum', cls.demonum ] ] ) ); }
function begin( mode, bounded ) { current = { mode, before: settings(), enhanced: 0, classic: 0, auxiliary: 0, splitActive: 0, maximumMainDrawsPerFrame: 0, firstProfileSettings: null, after: null, report: null }; evidence.runs.push( current ); seenFrames = new Map(); pendingStop = false; current.bounded = bounded; }
function finish() { if ( ! current || current.after ) return; current.after = settings(); const report = perf.R_PerfLastReport(); current.report = report ? { newerGame: report.newerGame, demos: report.demos.map( d => ( { demo: d.demo, frames: d.frames } ) ) } : null; }
renderer.render = function ( scene, camera ) {
	const profiling = perf.R_PerfProfiling(), mainCamera = scene === window.scene && camera === window.camera, target = this.getRenderTarget();
	if ( profiling && current ) {
		current.firstProfileSettings ||= settings();
		if ( mainCamera ) {
			if ( anim.R_ClassicPassActive() ) current.classic ++;
			else if ( target?.depthTexture && target.textures?.length >= 2 ) {
				current.enhanced ++;
				const count = ( seenFrames.get( hostRuntime.host_framecount ) || 0 ) + 1; seenFrames.set( hostRuntime.host_framecount, count ); current.maximumMainDrawsPerFrame = Math.max( current.maximumMainDrawsPerFrame, count );
			}
			if ( split.R_DemoSplitActive() ) current.splitActive ++;
		} else current.auxiliary ++;
		if ( current.bounded && current.enhanced >= 180 && ! pendingStop ) { pendingStop = true; Cbuf_AddText( 'perfstop\n' ); }
	} else if ( mainCamera && cls.demoplayback && split.R_DemoSplitActive() ) {
		if ( anim.R_ClassicPassActive() ) evidence.idleClassic ++;
		else if ( target?.depthTexture && target.textures?.length >= 2 ) evidence.idleEnhanced ++;
	}
	const result = originalRender.call( this, scene, camera );
	return result;
};
document.querySelector( '#options' ).onclick = () => {
	begin( 'actual Options menu', true );
	Cmd_ExecuteString( 'menu_options' );
	const width = draw.Draw_GetVirtualWidth(), height = draw.Draw_GetVirtualHeight();
	menu.M_TouchInput( ( width - 320 ) / 2 + 100, ( height - 200 ) / 2 + 51, width, height );
};
document.querySelector( '#full' ).onclick = () => { begin( 'all three bounded timedemos', false ); keys.set_key_dest( keys.key_game ); Cbuf_AddText( 'perfprofile 20\n' ); };
document.querySelector( '#classic-game' ).onclick = () => { split.R_DemoSplitRelease( false ); Cbuf_AddText( 'r_hdr 0\nmap start\n' ); keys.set_key_dest( keys.key_game ); };
document.querySelector( '#idle' ).onclick = () => { keys.set_key_dest( keys.key_game ); Cbuf_AddText( 'demos\n' ); };
document.querySelector( '#stop' ).onclick = () => Cbuf_AddText( 'perfstop\n' );
Cmd_AddCommand( 'profiler_trial_error', () => { if ( current ) current.firstProfileSettings ||= settings(); Host_Error( 'profiler trial recovery' ); } );
document.querySelector( '#error' ).onclick = () => { begin( 'Host_Error recovery', false ); keys.set_key_dest( keys.key_game ); Cbuf_AddText( 'perfprofile\nprofiler_trial_error\n' ); };
document.querySelector( '#hide' ).onclick = () => { controls.style.display = 'none'; };
setInterval( () => {
	const profiling = perf.R_PerfProfiling();
	if ( ( active || current?.firstProfileSettings ) && ! profiling ) finish();
	active = profiling;
	for ( const run of evidence.runs ) if ( run.classic || run.splitActive || run.maximumMainDrawsPerFrame > 1 ) {
		const reason = run.mode + ': comparison or duplicate main scene rendered'; if ( ! evidence.failures.includes( reason ) ) evidence.failures.push( reason );
	}
	document.querySelector( '#status' ).textContent = perf.R_PerfStatus() || `${evidence.failures.length ? 'FAIL' : 'Ready'}; title ${evidence.idleEnhanced}/${evidence.idleClassic} enhanced/classic draws`;
	document.querySelector( '#report' ).textContent = JSON.stringify( evidence, null, 2 );
}, 100 );
