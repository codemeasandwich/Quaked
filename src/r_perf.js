// The frame counter and the performance profiler.
//
// FPS counter: cl_showfps 1 draws the frame rate, frame time and the resolution scale
// in the corner (Options > FPS counter).
//
// Profiler ("perfprofile", or Options > Performance profiler): plays the game's three
// demos back to back as fast as the machine will run them (no waiting for the screen's
// refresh) and watches every frame.  The frame is cut into stages (the game's server and
// client, building the scene, the world draw, each lighting pass, the 2D screen, ...);
// after each stage the graphics card is waited for, so the time of a stage includes the
// card's work for it.  That serialises things a little, so the profile shows where the
// time goes rather than the exact frame rate of normal play.
//
// At the end there is a report: frame rate and worst frames per demo, time and share
// per stage, draw calls and triangles, and the bottlenecks with what to do about them.
// It goes to the console, the screen, and a JSON file that is downloaded.

import { cvar_t } from './cvar.js';

export const cl_showfps = new cvar_t( 'cl_showfps', '0' );

// --- the frame counter ---
const fps = { last: 0, frames: 0, since: 0, fps: 0, ms: 0 };

let resScale = 1;

export function R_PerfSetScale( v ) {

	resScale = v;

}

export function R_PerfFpsText() {

	const scale = resScale;
	return Math.round( fps.fps ) + ' fps  ' + fps.ms.toFixed( 1 ) + ' ms' + ( scale < 0.995 ? '  ' + Math.round( scale * 100 ) + '%' : '' );

}

// --- the stage timer ---
let gl = null;
let profiling = false;
let stageLast = 0;
let cur = null; // the frame being timed: { stages: {}, total }
let rendererRef = null;

export function R_PerfInit( renderer ) {

	rendererRef = renderer;
	gl = renderer != null ? renderer.getContext() : null;

}

export function R_PerfProfiling() {

	return profiling;

}

// the frame is starting
export function R_PerfFrameBegin( now ) {

	if ( fps.last > 0 ) {

		const dt = now - fps.last;
		fps.frames ++;
		fps.since += dt;
		if ( fps.since >= 0.5 ) {

			fps.fps = fps.frames / fps.since;
			fps.ms = fps.since / fps.frames * 1000;
			fps.frames = 0;
			fps.since = 0;

		}

	}

	fps.last = now;

	if ( profiling ) {

		cur = { stages: {}, start: performance.now() };
		stageLast = cur.start;
		if ( rendererRef != null ) {

			rendererRef.info.autoReset = false;
			rendererRef.info.reset();

		}

	}

}

// a stage of the frame is over: everything since the last mark is its time
export function R_PerfStage( name ) {

	if ( ! profiling || cur === null ) return;
	if ( gl !== null ) gl.finish();
	const t = performance.now();
	cur.stages[ name ] = ( cur.stages[ name ] || 0 ) + ( t - stageLast );
	stageLast = t;

}

export function R_PerfFrameEnd() {

	if ( ! profiling || cur === null ) return;
	R_PerfStage( 'audio and the rest' );
	cur.total = performance.now() - cur.start;
	if ( rendererRef != null ) {

		cur.calls = rendererRef.info.render.calls;
		cur.triangles = rendererRef.info.render.triangles;

	}

	if ( run !== null && run.recording ) run.frames.push( cur );
	cur = null;

}

// --- the run ---
let run = null;
let saved = null;
let host = null; // { Cbuf_AddText, cls, log, scale, draw }
const DEMOS = [ 'demo1', 'demo2', 'demo3' ];
let lastReport = null;
let frameLimit = 0;

export function R_PerfSetHost( h ) {

	host = h;

}

export function R_PerfStart( limit ) {

	if ( profiling || host === null ) return;
	frameLimit = limit > 0 ? limit : 0; // (0: each demo to its end)

	saved = { dynres: host.getCvar( 'r_dynres' ), showfps: host.getCvar( 'cl_showfps' ) };
	host.setCvar( 'r_dynres', 0 ); // full resolution: the machine's own speed
	host.setCvar( 'cl_showfps', 1 );

	profiling = true;
	run = { demoIndex: - 1, results: [], frames: [], recording: false, wait: 0, started: performance.now(), status: 'starting' };
	host.log( 'Performance profiler: playing ' + DEMOS.join( ', ' ) + ' as fast as possible (Esc stops)\n' );
	nextDemo();

}

export function R_PerfStop( reason ) {

	if ( ! profiling ) return;
	profiling = false;
	cur = null;

	if ( rendererRef != null ) rendererRef.info.autoReset = true;
	if ( saved !== null ) {

		host.setCvar( 'r_dynres', saved.dynres );
		host.setCvar( 'cl_showfps', saved.showfps );
		saved = null;

	}

	host.Cbuf_AddText( 'disconnect\n' );

	if ( reason !== 'finished' ) {

		host.log( 'Performance profiler stopped.\n' );
		run = null;
		return;

	}

	lastReport = buildReport( run );
	printReport( lastReport );
	saveReport( lastReport );
	run = null;

}

function nextDemo() {

	if ( run.recording ) closeDemo();

	run.demoIndex ++;
	if ( run.demoIndex >= DEMOS.length ) {

		R_PerfStop( 'finished' );
		return;

	}

	run.frames = [];
	run.recording = false;
	run.status = 'loading ' + DEMOS[ run.demoIndex ];
	run.wait = 0;
	run.seen = false;
	host.Cbuf_AddText( 'timedemo ' + DEMOS[ run.demoIndex ] + '\n' );

}

function closeDemo() {

	run.recording = false;
	run.results.push( { demo: DEMOS[ run.demoIndex ], frames: run.frames } );
	run.frames = [];

}

// called once per frame by the frame loop: follows the demo through
function tick() {

	if ( run === null ) return;

	// a menu (Esc) stops the profile
	if ( host.menuOpen() && run.seen ) { R_PerfStop( 'stopped' ); return; }

	const playing = host.cls.demoplayback === true;

	if ( playing && host.cls.signon >= 4 ) {

		// the demo is running: the first frames (loading the level) do not count
		run.seen = true;
		run.wait ++;

		if ( frameLimit > 0 && run.frames.length >= frameLimit ) {

			host.Cbuf_AddText( 'disconnect\n' );
			closeDemo();
			nextDemo();
			return;

		}

		if ( run.wait > 3 ) {

			run.recording = true;
			run.status = 'timing ' + DEMOS[ run.demoIndex ] + ' (' + run.frames.length + ' frames)';

		}

	} else if ( run.seen ) {

		// it has ended
		closeDemo();
		nextDemo();

	} else if ( ++ run.wait > 3000 ) {

		// it never started
		host.log( 'Performance profiler: ' + DEMOS[ run.demoIndex ] + ' did not start\n' );
		R_PerfStop( 'stopped' );

	}

}

// The frame loop while profiling: frames run back to back, for as long as the screen
// would wait for one (so the page stays alive), each timed with the card waited for.
export function R_PerfPump( frame ) {

	const t0 = performance.now();
	let last = t0;

	do {

		const now = performance.now();
		const dt = Math.min( 0.1, ( now - last ) / 1000 );
		last = now;
		frame( Math.max( dt, 0.001 ) );
		tick();

	} while ( profiling && performance.now() - t0 < 30 );

}

export function R_PerfStatus() {

	return profiling && run !== null ? 'PROFILING: ' + run.status : null;

}

// --- the report ---
function pct( sorted, p ) {

	if ( sorted.length === 0 ) return 0;
	return sorted[ Math.min( sorted.length - 1, Math.floor( sorted.length * p ) ) ];

}

const ADVICE = {
	'server': 'game logic (monsters, physics) is the cost: many entities in view, or the seamless-level checks',
	'client and messages': 'reading the game state is the cost',
	'scene build': 'building the scene each frame (CPU): surfaces, entities, lights. Fewer visible meshes or cheaper per-entity work would help',
	'portal views': 'the windows onto other levels are drawn as extra scenes: lower r_newer_portals, or fewer windows in view',
	'world draw': 'drawing the world into the picture: triangles, materials or resolution. Lower the resolution (r_dynres) or reduce draw calls',
	'sun shadow': 'the sun\'s shadow map: make it smaller (SUN_SHADOW_SIZE) or draw fewer things into it',
	'light shafts': 'the light-shaft pass: fewer steps (SUN_STEPS), or r_volumetric 0',
	'bloom': 'the glow passes: r_bloom 0, or fewer levels',
	'final lighting pass': 'the per-pixel lighting and effects pass: fewer lights ray-marched (RELIGHT_STEPS, MAX_VOLUME_LIGHTS), or a lower resolution',
	'overlays and water': 'screen blends and water surfaces',
	'2D screen and menus': 'the status bar, text and menus',
	'audio and the rest': 'sound and everything else'
};

function buildReport( r ) {

	const report = { when: new Date().toISOString(), newerGame: host.getCvar( 'r_hdr' ) !== 0, resolution: host.size(), demos: [], summary: {} };
	const all = [];
	const stageTotals = {};
	let calls = 0, tris = 0, frames = 0, maxCalls = 0, maxTris = 0;

	for ( const d of r.results ) {

		const totals = d.frames.map( f => f.total ).sort( ( a, b ) => a - b );
		if ( totals.length === 0 ) { report.demos.push( { demo: d.demo, frames: 0 } ); continue; }

		const sum = totals.reduce( ( a, b ) => a + b, 0 );
		const stageAvg = {};
		for ( const f of d.frames ) for ( const k in f.stages ) stageAvg[ k ] = ( stageAvg[ k ] || 0 ) + f.stages[ k ];
		for ( const k in stageAvg ) { stageTotals[ k ] = ( stageTotals[ k ] || 0 ) + stageAvg[ k ]; stageAvg[ k ] = stageAvg[ k ] / d.frames.length; }

		const worst = d.frames.map( ( f, i ) => ( { i, f } ) ).sort( ( a, b ) => b.f.total - a.f.total ).slice( 0, 5 ).map( ( { i, f } ) => {

			const top = Object.entries( f.stages ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ];
			return { frame: i, ms: +f.total.toFixed( 1 ), mainStage: top ? top[ 0 ] : '', stageMs: top ? +top[ 1 ].toFixed( 1 ) : 0 };

		} );

		for ( const f of d.frames ) { calls += f.calls || 0; tris += f.triangles || 0; maxCalls = Math.max( maxCalls, f.calls || 0 ); maxTris = Math.max( maxTris, f.triangles || 0 ); frames ++; }
		all.push( ...totals );

		report.demos.push( {
			demo: d.demo, frames: totals.length, seconds: +( sum / 1000 ).toFixed( 2 ),
			avgFps: +( 1000 * totals.length / sum ).toFixed( 1 ),
			onePercentLowFps: +( 1000 / pct( totals, 0.99 ) ).toFixed( 1 ),
			ms: { avg: +( sum / totals.length ).toFixed( 2 ), p50: +pct( totals, 0.5 ).toFixed( 2 ), p95: +pct( totals, 0.95 ).toFixed( 2 ), p99: +pct( totals, 0.99 ).toFixed( 2 ), max: +totals[ totals.length - 1 ].toFixed( 1 ) },
			over16_7: totals.filter( t => t > 16.7 ).length, over33: totals.filter( t => t > 33.4 ).length,
			stagesAvgMs: Object.fromEntries( Object.entries( stageAvg ).map( ( [ k, v ] ) => [ k, +v.toFixed( 2 ) ] ) ),
			worstFrames: worst
		} );

	}

	all.sort( ( a, b ) => a - b );
	const total = all.reduce( ( a, b ) => a + b, 0 );
	const stages = Object.entries( stageTotals ).map( ( [ k, v ] ) => ( { stage: k, avgMs: +( v / Math.max( 1, frames ) ).toFixed( 2 ), share: +( 100 * v / Math.max( 1, total ) ).toFixed( 1 ) } ) ).sort( ( a, b ) => b.avgMs - a.avgMs );

	report.summary = {
		frames, avgFps: +( 1000 * frames / Math.max( 1, total ) ).toFixed( 1 ),
		onePercentLowFps: +( 1000 / Math.max( 1, pct( all, 0.99 ) ) ).toFixed( 1 ),
		framesUnder60: all.filter( t => t > 16.7 ).length, share60: +( 100 * all.filter( t => t <= 16.7 ).length / Math.max( 1, all.length ) ).toFixed( 1 ),
		avgDrawCalls: Math.round( calls / Math.max( 1, frames ) ), maxDrawCalls: maxCalls,
		avgTriangles: Math.round( tris / Math.max( 1, frames ) ), maxTriangles: maxTris,
		stages,
		bottlenecks: stages.filter( s => s.share >= 12 ).map( s => ( { stage: s.stage, share: s.share, note: ADVICE[ s.stage ] || '' } ) )
	};

	return report;

}

function printReport( rep ) {

	const s = rep.summary;
	const L = [];
	L.push( '---- Performance profile (' + ( rep.newerGame ? 'Newer Game' : 'New Game' ) + ', ' + rep.resolution + ') ----' );
	for ( const d of rep.demos ) L.push( d.demo + ': ' + d.frames + ' frames, ' + d.avgFps + ' fps average, ' + d.onePercentLowFps + ' fps 1% low, worst ' + ( d.ms ? d.ms.max : 0 ) + ' ms' );
	L.push( 'Overall: ' + s.avgFps + ' fps average, ' + s.onePercentLowFps + ' fps 1% low; ' + s.share60 + '% of frames within 16.7 ms (60 fps)' );
	L.push( 'Draw calls avg ' + s.avgDrawCalls + ' (max ' + s.maxDrawCalls + '), triangles avg ' + s.avgTriangles + ' (max ' + s.maxTriangles + ')' );
	L.push( 'Where the time goes (ms per frame, share):' );
	for ( const st of s.stages ) L.push( '  ' + st.stage.padEnd( 22 ) + String( st.avgMs ).padStart( 7 ) + ' ms  ' + String( st.share ).padStart( 5 ) + '%' );
	if ( s.bottlenecks.length === 0 ) L.push( 'No single stage takes more than an eighth of the frame.' );
	for ( const b of s.bottlenecks ) L.push( 'Bottleneck: ' + b.stage + ' (' + b.share + '%): ' + b.note );
	L.push( s.avgFps >= 60 && s.onePercentLowFps >= 55 ? 'This machine holds 60 fps on the demos.' : 'This machine does not hold 60 fps on the demos at this resolution.' );
	L.push( '(each stage waits for the graphics card, so this shows where time goes, not the exact frame rate of normal play)' );

	rep.text = L.join( '\n' );
	host.log( rep.text + '\n' );
	console.log( rep.text );

}

function saveReport( rep ) {

	try {

		const blob = new Blob( [ JSON.stringify( rep, null, 1 ) ], { type: 'application/json' } );
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = 'quaked-perf-' + rep.when.replace( /[:.]/g, '-' ) + '.json';
		document.body.appendChild( a );
		a.click();
		a.remove();

	} catch ( e ) { /* no download here: the console has it */ }

}

export function R_PerfLastReport() {

	return lastReport;

}

// what is drawn over the screen while profiling and after: lines of text
export function R_PerfScreenLines() {

	if ( profiling && run !== null ) return [ 'PROFILING: ' + run.status, 'Esc stops' ];
	return null;

}
