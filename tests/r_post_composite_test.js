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

Deno.test( 'profile launch grading reaches the material and composite, with saved and later choices still effective', async () => {

	const { Newer_ApplyGameDefaults, NEWER_ENABLED_FEATURES } = await import( '../src/newer/ui/newer_defaults.js' );
	const { GameProfile_For, GameProfile_Set } = await import( '../src/engine/common/game_profile.js' );
	const cmd = await import( '../src/engine/common/cmd.js' );
	const controls = [ ...options, post.r_newbright, post.r_newcontrast, post.r_newdark ];
	for ( const v of controls ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
	for ( const name of [ ...NEWER_ENABLED_FEATURES, 'gamma', 'cl_showfps' ] ) if ( ! cvar.Cvar_FindVar( name ) ) cvar.Cvar_RegisterVariable( new cvar.cvar_t( name, '1' ) );
	const saved = controls.map( v => v.string );
	const texture = new THREE.DataTexture( new Uint8Array( 16 ).fill( 100 ), 2, 2 );
	const material = new THREE.MeshLambertMaterial( { map: texture } );
	post.R_RegisterDetail( material, texture );
	const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
	material.onBeforeCompile( shader );
	const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
	const view = { lx: 0, ly: 96, lw: 640, lh: 384 };
	const grade = () => {

		check( post.R_PostBegin( renderer, true, 640, 384 ), 'Enhanced remains active' );
		composite.R_PostComposite( renderer, new THREE.Scene(), camera, view, postState.gpu, null, 10, 1, false, true, 0, 0 );
		return [ postState.gpu.compositeMaterial.uniforms.uBright.value, postState.gpu.compositeMaterial.uniforms.uContrastGain.value, shader.uniforms.uLmGamma.value ];

	};
	try {

		cmd.Cbuf_Init(); cmd.Cmd_Init();
		for ( const id of [ 'quake', 'hexen2', 'hexen2-demo', 'hexen2-portals' ] ) {

			GameProfile_Set( id );
			// Host_Init replays saved commands before an explicit Enhanced launch (as Quake's menu already does).
			cmd.Cbuf_AddText( 'r_newbright 0.7\nr_newcontrast 1.3\nr_newdark 1.8\n' ); cmd.Cbuf_Execute();
			cmd.Cbuf_AddText( Newer_ApplyGameDefaults( GameProfile_For( id ) ) ); cmd.Cbuf_Execute();
			for ( const [ name, value ] of [ [ 'r_dynres', 0 ], [ 'r_bloom', 0 ], [ 'r_volumetric', 0 ], [ 'r_dof', 0 ] ] ) cvar.Cvar_SetValue( name, value );
			same( JSON.stringify( grade() ), JSON.stringify( id === 'quake' ? [ 0.7, 1.3, 1.8 ] : [ 1, 1, 1 ] ), id + ' launch grade' );
			cmd.Cbuf_AddText( 'r_newbright 0.8\nr_newcontrast 1.2\nr_newdark 1.6\n' ); cmd.Cbuf_Execute();
			same( JSON.stringify( grade() ), '[0.8,1.2,1.6]', id + ' later player/config commands remain effective across frames' );

		}

	} finally {

		GameProfile_Set( 'quake' ); cmd.Cbuf_Init();
		controls.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
		post.R_PostBegin( renderer, false, 0, 0 ); material.dispose(); texture.dispose();

	}

} );

Deno.test( 'shorter HUD-sized targets resize DOF and present above the bar, including dynamic resolution', async () => {

	const dof = await import( '../src/newer/render/r_dof.js' );
	const { dynResUpdate, R_DynResScale } = await import( '../src/newer/render/r_post_targets.js' );
	for ( const v of options ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string );
	const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
	try {

		for ( const [ name, value ] of [ [ 'r_hdr', 1 ], [ 'r_newer_lighting', 1 ], [ 'r_newer_water', 0 ], [ 'r_bloom', 0 ], [ 'r_volumetric', 0 ], [ 'r_dynres', 0 ], [ 'r_dof', 0.05 ] ] ) cvar.Cvar_SetValue( name, value );
		dof.R_DofSetup( { xr: () => false, contents: () => - 1, trace: () => ( { fraction: 0.1 } ) } );
		dof.R_DofClear(); dof.R_DofFrame( 10, {}, [ 0, 0, 0 ], [ 1, 0, 0 ], [ 0, - 1, 0 ], [ 0, 0, 1 ] );
		const frame = height => {

			check( post.R_PostBegin( renderer, true, 640, height ), 'post active' );
			const p = postState.gpu;
			composite.R_PostComposite( renderer, new THREE.Scene(), camera, { lx: 0, ly: 480 - height, lw: 640, lh: height }, p, null, 10, 1, false, true, 0, 0 );
			same( p.hdr.height, Math.round( height * R_DynResScale() / 2 ) * 2, 'HDR follows scaled rectangle' );
			same( p.dof.height, p.hdr.height, 'DOF follows HDR height' );
			same( p.dof.width, p.hdr.width, 'DOF follows HDR width' );
			same( p.dofMaterial.uniforms.uDofTexel.value.y, 1 / p.hdr.height, 'DOF sampling follows height' );
			same( renderer.viewport.join( ',' ), `0,${480 - height},640,${height}`, 'present stays above HUD in logical pixels' );

		};
		frame( 480 ); frame( 384 );
		cvar.Cvar_SetValue( 'r_dynres', 1 );
		const now = performance.now() / 1000;
		for ( let i = 1; i <= 80; i ++ ) dynResUpdate( now + i * 0.05 );
		check( R_DynResScale() < 1, 'slow frames lower dynamic resolution' );
		frame( 384 );
		cvar.Cvar_SetValue( 'r_dynres', 0 ); frame( 480 );

	} finally {

		options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
		dof.R_DofClear(); dof.R_DofSetup( null ); post.R_PostBegin( renderer, false, 0, 0 );

	}

} );
