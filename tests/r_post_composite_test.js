// The post pipeline's composite stage on its own (card [44h]): with shafts and bloom off there is no volume or bloom pass
// and the composite draws straight to the screen; the split fills only the left half. (The offscreen path, through
// depth of field, vision and the present pass, is drawn by the frame trial, tests/post_split_frames_trial.) Through the public interface of r_post_composite.js, after gl_post.js's R_PostBegin makes the pipeline, with
// a renderer that records each pass.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const post = await import( '../src/newer/render/gl_post.js' );
const composite = await import( '../src/newer/render/r_post_composite.js' );
const { postState } = await import( '../src/newer/render/r_post_state.js' );
const mode = await import( '../src/newer/mode.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const { r_dof } = await import( '../src/newer/render/r_dof.js' );
const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, draws: [], scissors: [], target: null, getRenderTarget() { return this.target; }, setRenderTarget( t ) { this.target = t; }, setViewport( ...v ) { this.viewport = v; }, setScissor( ...v ) { this.scissors.push( v ); }, setScissorTest( on ) { this.scissor = on; }, render( scene ) { const m = scene.children[ 0 ].material; this.draws.push( { target: this.target, material: m, scissor: this.scissor } ); } };
const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, mode.r_newer_lighting, mode.r_newer_water, r_dof ];

Deno.test( 'no shafts or bloom, straight to the screen, and the split\'s left half', () => {
	for ( const v of options ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string );
	try {
		for ( const [ n, v ] of [ [ 'r_hdr', 1 ], [ 'r_dynres', 0 ], [ 'r_bloom', 0 ], [ 'r_volumetric', 0 ], [ 'r_newer_lighting', 1 ], [ 'r_newer_water', 0 ], [ 'r_dof', 0 ] ] ) cvar.Cvar_SetValue( n, v );
		post.R_PostBegin( renderer, true, 640, 400 );
		const p = postState.gpu, camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
		check( p && p.hdr, 'the pipeline and its targets' );
		const view = { lx: 0, ly: 0, lw: 640, lh: 400 }, run = () => { renderer.draws = []; renderer.scissors = []; composite.R_PostComposite( renderer, new THREE.Scene(), camera, view, p, null, 10, 1, false, true, 0, 0 ); return renderer.draws; };
		let draws = run();
		same( draws.length, 1, 'one pass' ); same( draws[ 0 ].target, null, 'to the screen' ); same( draws[ 0 ].material, p.compositeMaterial, 'the composite itself' );
		const vb = composite.R_PostVolumeBloom( renderer, p, null, 1, false, true );
		same( vb.volume, 0, 'no shafts with r_volumetric 0' ); same( vb.bloom, 0, 'no bloom with r_bloom 0' );
		composite.R_PostSetSplit( true ); draws = run(); composite.R_PostSetSplit( false );
		same( renderer.scissors.at( - 1 )?.join( ',' ), '0,0,320,400', 'the split draws the left half' ); same( draws.at( - 1 ).scissor, true, 'scissored' );
	} finally { options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( renderer, false, 0, 0 ); }
} );
