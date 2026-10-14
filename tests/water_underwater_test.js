// Observe public post draws at the instant they execute. Referencing uniforms
// only after R_PostFinish would hide a one-frame-late volume update.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' );
const liquids = await import( '../src/newer/render/r_post_liquids.js' ), mode = await import( '../src/newer/mode.js' );
const cvar = await import( '../src/engine/common/cvar.js' ), { r_waterwarp } = await import( '../src/engine/render/glquake.js' );
function equal( actual, expected, label ) { if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` ); }
function fixture( run ) {
	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_pillars, post.r_caustics, post.r_reflect,
		mode.r_newer_water, mode.r_newer_lighting, r_waterwarp ];
	for ( const v of options ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), classic = post.classicLook.value, records = [];
	let target = null;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {},
		render( scene ) {
			const u = scene.children[ 0 ]?.material?.uniforms;
			if ( ! u || ( ! ( 'uScatter' in u ) && ! ( 'uLightFloor' in u ) ) ) return;
			records.push( { pass: 'uScatter' in u ? 'volume' : 'composite', count: u.uWaterCount?.value,
				underwater: u.uUnderwater?.value, waterView: u.uWaterView?.value, warp: u.uWaterWarp?.value,
				time: u.uTime?.value, caustic: u.uCaustic?.value, normal: u.tNormal?.value,
				top: u.uWaterMin?.value[ 0 ]?.z, bottom: u.uWaterMax?.value[ 0 ]?.z } );
		}
	};
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.position.set( 0, 0, - 16 ); camera.lookAt( 0, 64, - 32 ); camera.updateMatrixWorld();
	function region( z = 0 ) { liquids.R_PostSetLiquidRegions( [ { kind: 0, min: [ - 128, - 128 ], max: [ 128, 128 ], z, bottom: - 64 } ], [] ); }
	function frame( time ) {
		records.length = 0; const active = post.R_PostBegin( renderer, true, 320, 200 );
		if ( active ) post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], time, 1, false );
		return { volume: records.find( r => r.pass === 'volume' ), composite: records.find( r => r.pass === 'composite' ) };
	}
	try {
		post.classicLook.value = 0;
		for ( const v of options ) cvar.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_reflect' ] ) cvar.Cvar_SetValue( name, 0 );
		region(); run( { frame, region } );
	} finally {
		post.R_PostSetUnderwater( false ); liquids.R_PostSetLiquidRegions( [], [] ); post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown();
		post.classicLook.value = classic; options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
	}
}
Deno.test( 'water volume sees current entry, exit, region and animation state before its first draw', () => fixture( ( { frame, region } ) => {
	for ( const [ active, time ] of [ [ false, 1 ], [ true, 2 ], [ false, 3 ] ] ) {
		post.R_PostSetUnderwater( active, - 3 ); const drawn = frame( time );
		equal( !! drawn.volume, true, 'existing volume pass executes' );
		equal( drawn.volume.underwater, active ? 1 : 0, 'volume gets this frame native underwater state' );
		equal( drawn.volume.waterView, active ? 1 : 0, 'volume gets this frame water eligibility' );
		equal( drawn.volume.time, time, 'volume animation is not a frame behind' );
		equal( drawn.volume.count, 1, 'volume sees current pool on its first draw' );
		equal( drawn.volume.bottom, - 64, 'volume has real finite lower bound' );
		equal( drawn.volume.caustic > 0, true, 'caustic gain published before volume draw' );
		equal( drawn.volume.normal != null, true, 'existing normal attachment available for sentinel protection' );
		equal( drawn.composite.waterView, drawn.volume.waterView, 'passes agree on water eligibility' );
		equal( drawn.composite.time, drawn.volume.time, 'passes agree on animation phase' );
	}
	region( 64 ); post.R_PostSetUnderwater( true, - 3 ); cvar.Cvar_SetValue( 'r_caustics', 0 );
	const changed = frame( 4 ); equal( changed.volume.top, 64, 'changed region is visible before next volume pass' );
	equal( changed.volume.caustic, 0, 'caustics off reaches volume without a stale frame' );
} ) );
Deno.test( 'native water and slime allow water vision but lava and dry contents do not', () => fixture( ( { frame } ) => {
	for ( const [ active, contents, expected ] of [ [ true, - 3, 1 ], [ true, - 4, 1 ], [ true, - 5, 0 ], [ false, - 3, 0 ] ] ) {
		post.R_PostSetUnderwater( active, contents ); const drawn = frame( 1 );
		equal( drawn.volume.waterView, expected, 'contents-aware water eligibility' );
		equal( drawn.volume.underwater, active ? 1 : 0, 'native underwater state remains independent of water-only effect' );
	}
	post.R_PostSetUnderwater( true ); equal( frame( 2 ).volume.waterView, 1, 'legacy boolean public call retains water meaning' );
} ) );
Deno.test( 'water warp and volume retain independent native and disabled controls', () => fixture( ( { frame } ) => {
	post.R_PostSetUnderwater( true, - 3 );
	equal( frame( 1 ).composite.warp > 0, true, 'existing waterwarp control enables small view sway' );
	cvar.Cvar_SetValue( 'r_waterwarp', 0 ); equal( frame( 2 ).composite.warp, 0, 'waterwarp off reaches shader immediately' );
	cvar.Cvar_SetValue( 'r_waterwarp', 1 ); cvar.Cvar_SetValue( 'r_newer_water', 0 );
	const disabled = frame( 3 ); equal( disabled.volume.count, 0, 'disabled liquid feature has no volume to affect' ); equal( disabled.composite.count, 0, 'disabled liquid feature has no distortion volume' );
	cvar.Cvar_SetValue( 'r_newer_water', 1 ); cvar.Cvar_SetValue( 'r_newer_lighting', 0 );
	equal( frame( 4 ).volume, undefined, 'lighting off retains existing volume-pass bypass' );
	cvar.Cvar_SetValue( 'r_hdr', 0 ); const native = frame( 5 ); equal( native.volume, undefined, 'native rendering has no extra volume pass' ); equal( native.composite, undefined, 'native rendering has no enhanced distortion pass' );
} ) );
