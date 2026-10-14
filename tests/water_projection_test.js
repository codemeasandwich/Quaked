// Probe scheduling through public frame/startup interfaces, with real Three
// cameras/frusta/cube cameras and a renderer recorder. This proves selection
// and cache behavior; it is not a pixel or gameplay-performance test.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const post = await import( '../src/newer/render/gl_post.js' );
const liquids = await import( '../src/newer/render/r_post_liquids.js' );
const probes = await import( '../src/newer/render/r_waterprobe.js' );
const mode = await import( '../src/newer/mode.js' );
const vars = await import( '../src/engine/common/cvar.js' );
function equal( actual, expected, label ) {
	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );
}
function fixture( kind, choice, run ) {
	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_reflect, post.r_water_look, mode.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), classic = post.classicLook.value;
	let target = null, draws = 0;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false },
		getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {},
		getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, render() { draws ++; } };
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 90, 1, 4, 4096 );
	camera.up.set( 0, 1, 0 ); camera.position.set( 0, 0, 100 ); camera.lookAt( 0, 0, - 700 ); camera.updateMatrixWorld();
	try {
		post.classicLook.value = 0;
		for ( const [ name, value ] of [ [ 'r_hdr', 1 ], [ 'r_dynres', 0 ], [ 'r_bloom', 0 ], [ 'r_reflect', .6 ], [ 'r_water_look', choice ], [ 'r_newer_water', 1 ] ] ) vars.Cvar_SetValue( name, value );
		post.R_PostBegin( renderer, true, 320, 200 );
		// Authored order deliberately places the most distant surface first.
		// All three are in view, but only two fit in the existing probe cache.
		liquids.R_PostSetLiquidRegions( [ - 700, - 500, 0 ].map( z => ( {
			kind, min: [ - 64, - 64 ], max: [ 64, 64 ], z,
			probePoint: [ 0, 0, z + probes.WATER_PROBE_LIFT ]
		} ) ), [] );
		const regions = post.R_GetLiquidRegions(); probes.R_WaterProbeClear();
		equal( regions.length, 3, 'separate elevations retain separate liquid regions' );
		run( { renderer, scene, camera, regions, draws: () => draws } );
	} finally {
		probes.R_WaterProbeClear(); liquids.R_PostSetLiquidRegions( [], [] );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown();
		post.classicLook.value = classic; options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );
	}
}
for ( const kind of [ 0, 1 ] ) for ( const choice of [ 0, 1, 2, 3, 4 ] ) {
	const label = `${kind === 0 ? 'water' : 'slime'}, appearance ${choice}`;
	Deno.test( `probe frame selects the nearest lower surfaces (${label})`, () => fixture( kind, choice, f => {
		for ( let i = 0; i < 2; i ++ ) post.R_WaterProbesFrame( f.renderer, f.scene, f.camera, () => {}, { initializing: true } );
		const heights = probes.R_WaterProbes().map( p => p.region.z ).join( ',' );
		equal( heights, '0,-500', 'probe budget follows 100/600/800-unit distances below the camera' );
		equal( f.draws(), 12, 'exactly two six-face captures' );
		const status = post.R_WaterStartupStatus( f.camera );
		equal( status.ready, 2, 'startup sees both required probes' ); equal( status.pending, 0, 'startup has no pending required probe' );
	} ) );
	Deno.test( `startup accepts independently prepared nearest probes (${label})`, () => fixture( kind, choice, f => {
		const nearest = [ f.regions[ 2 ], f.regions[ 1 ] ];
		for ( let i = 0; i < 2; i ++ ) probes.R_WaterProbeUpdate( f.renderer, f.scene, f.camera, nearest, () => {}, f.regions, { initializing: true } );
		equal( probes.R_WaterProbes().map( p => p.region.z ).join( ',' ), '0,-500', 'fixture prepared the two actual nearest surfaces' );
		const status = post.R_WaterStartupStatus( f.camera );
		equal( status.ready, 2, 'startup counts the same nearest surfaces as composition' );
		equal( status.pending, 0, 'a distant uncaptured surface cannot hold startup' );
	} ) );
}
