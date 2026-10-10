// Exercise the actual console/menu, material cache and frame uniforms. GPU
// appearance, scattering and mist pixels belong to the controlled browser trial.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' ), anim = await import( '../src/newer/render/r_anim.js' );
const vars = await import( '../src/engine/common/cvar.js' ), cmd = await import( '../src/engine/common/cmd.js' );
const menu = await import( '../src/engine/client/menu.js' ), keys = await import( '../src/engine/client/keys.js' ), draw = await import( '../src/engine/render/gl_draw.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

const options = [ post.r_water_look, post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric,
	post.r_reflect, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
function registerOptions() {

	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );

}

Deno.test( 'water appearance menu cycles all choices, bounds invalid settings and archives the selection', () => {

	registerOptions(); const saved = options.map( v => v.string );
	const previousWindow = globalThis.window;
	if ( typeof window === 'undefined' ) globalThis.window = { devicePixelRatio: 1 };
	try {

		cmd.Cbuf_Init();
		if ( ! cmd.Cmd_Exists( 'exec' ) ) cmd.Cmd_Init();
		if ( ! cmd.Cmd_Exists( 'menu_options' ) ) menu.M_Init();
		vars.Cvar_SetValue( 'r_water_look', 0 ); vars.Cvar_SetValue( 'r_newer_lighting', 1 );
		vars.Cvar_SetValue( 'r_newer_normals', 1 ); vars.Cvar_SetValue( 'r_newer_water', 1 );
		const width = draw.Draw_GetVirtualWidth(), height = draw.Draw_GetVirtualHeight();
		const touch = y => menu.M_TouchInput( ( width - 320 ) / 2 + 32, ( height - 200 ) / 2 + y, width, height );
		cmd.Cmd_ExecuteString( 'menu_options' ); touch( 35 ); // first Options row opens Newer features
		touch( 44 + 15 * 8 + 3 ); // appended appearance row
		equal( vars.Cvar_VariableValue( 'r_water_look' ), 1, 'touch selects Clear' );
		for ( const value of [ 2, 3, 4, 0 ] ) {

			menu.M_Keydown( keys.K_RIGHTARROW ); equal( vars.Cvar_VariableValue( 'r_water_look' ), value, 'right cycles named appearances' );

		}
		menu.M_Keydown( keys.K_LEFTARROW ); equal( vars.Cvar_VariableValue( 'r_water_look' ), 4, 'left wraps Map to Toxic' );
		menu.M_Keydown( keys.K_ENTER ); equal( vars.Cvar_VariableValue( 'r_water_look' ), 0, 'Enter wraps Toxic to Map' );
		for ( const [ input, key, expected ] of [ [ - 999, keys.K_RIGHTARROW, 1 ], [ 999, keys.K_LEFTARROW, 3 ], [ 2.6, keys.K_ENTER, 4 ] ] ) {

			vars.Cvar_SetValue( 'r_water_look', input ); menu.M_Keydown( key );
			equal( vars.Cvar_VariableValue( 'r_water_look' ), expected, 'console value is bounded before menu cycling' );

		}
		vars.Cvar_SetValue( 'r_water_look', 3 );
		equal( vars.Cvar_WriteVariables().includes( `r_water_look "${vars.Cvar_VariableString( 'r_water_look' )}"\n` ), true, 'chosen appearance included in saved config' );
		for ( const name of [ 'r_newer_lighting', 'r_newer_normals', 'r_newer_water' ] )
			equal( vars.Cvar_VariableValue( name ), 1, 'appearance leaves independent feature unchanged' );
		menu.M_Keydown( keys.K_DOWNARROW ); // last feature wraps to first, preserving later menu tests
		menu.M_Keydown( keys.K_ESCAPE );

	} finally {

		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );
		if ( previousWindow === undefined ) delete globalThis.window; else globalThis.window = previousWindow;

	}

} );

Deno.test( 'live water looks reuse original materials and preserve physical slime, lava and native boundaries', () => {

	registerOptions(); const saved = options.map( v => v.string );
	const priorLook = post.classicLook.value, priorClassic = anim.R_ClassicPassActive();
	const textures = [ '*water1', '*slime0', '*lava1' ].map( name => ( { name,
		gl_texture: new THREE.DataTexture( new Uint8Array( [ 80, 96, 48, 255 ] ), 1, 1 ) } ) );
	const leaf = { contents: - 1, visframe: 0, compressed_vis: null };
	const faces = textures.map( ( texture, i ) => {

		const x = i * 300;
		return { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture },
			polys: { numverts: 4, verts: [ [ x, 0, 0, 0, 0 ], [ x + 128, 0, 0, 1, 0 ],
				[ x + 128, 128, 0, 1, 1 ], [ x, 128, 0, 0, 1 ] ], next: null } };

	} );
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 3, numleafs: 1,
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], surfaces: faces };
	let target = null, uniforms = null;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		getRenderTarget: () => target, setRenderTarget: next => { target = next; }, setViewport() {},
		render: scene => { uniforms = scene.children[ 0 ].material.uniforms; } };
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.up.set( 0, 0, 1 );
	camera.position.set( 128, - 160, 48 ); camera.lookAt( 128, 64, 0 ); camera.updateMatrixWorld();
	function frame() {

		post.R_PostBegin( renderer, true, 320, 200 );
		post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false );

	}
	try {

		post.classicLook.value = 0; anim.R_AnimSetClassicPass( false ); post.R_PostSetUnderwater( false );
		for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_newer_lighting', 'r_water_look' ] ) vars.Cvar_SetValue( name, 0 );
		post.R_BuildWorldLights( model ); const regions = post.R_GetLiquidRegions();
		equal( regions.length, 2, 'water and slime only are transmissive pools' );
		equal( regions.map( r => r.kind ).join(), '0,1', 'physical water/slime identity retained' );
		equal( post.R_GetLavaRegions().length, 1, 'lava retains separate opaque region' );
		frame(); const water = surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ), slime = surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 );
		const actualOpacities = [];
		for ( const choice of [ 0, 1, 2, 3, 4, 2, 1 ] ) {

			vars.Cvar_SetValue( 'r_water_look', choice ); frame();
			const expected = choice === 0 ? 0 : choice - 1;
			equal( post.R_GetLiquidRegions(), regions, 'profile change does not rebuild physical pools' );
			equal( regions.map( r => r.kind ).join(), '0,1', 'profile never changes physical kind' );
			equal( uniforms.uWaterCount.value, 2, 'both pools remain in compositor' );
			const ids = new Map();
			for ( let i = 0; i < uniforms.uWaterCount.value; i ++ ) ids.set( uniforms.uWaterMin.value[ i ].w, uniforms.uWaterMax.value[ i ].w );
			equal( ids.get( 0 ), expected, 'water profile reaches current frame' ); equal( ids.get( 1 ), 3, 'actual slime always looks toxic' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ), water, 'cached water material reused' );
			equal( water.opacity, post.LIQUID_LOOKS[ expected ].opacity, 'material policy follows selected profile' );
			equal( water.map, textures[ 0 ].gl_texture, 'original water texture retained' ); equal( water.depthWrite, false, 'transmission keeps floor depth' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ), slime, 'cached slime material reused' );
			equal( slime.opacity, post.LIQUID_LOOKS[ 3 ].opacity, 'water override cannot clear slime hazard appearance' );
			equal( slime.map, textures[ 1 ].gl_texture, 'original slime texture retained' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 2 ], 1 ).opacity, 1, 'lava remains opaque' );
			if ( choice >= 1 && choice <= 4 && actualOpacities.length < 4 ) actualOpacities.push( water.opacity );

		}
		equal( new Set( actualOpacities ).size, 4, 'four distinguishable surface transmission policies' );
		vars.Cvar_SetValue( 'r_water_look', - 999 ); equal( post.R_LiquidLookIndex( 0 ), 0, 'negative render choice bounded' );
		vars.Cvar_SetValue( 'r_water_look', 999 ); equal( post.R_LiquidLookIndex( 0 ), 3, 'large render choice bounded' );
		vars.Cvar_SetValue( 'r_water_look', 4 ); vars.Cvar_SetValue( 'r_newer_lighting', 1 ); frame();
		equal( uniforms.uWaterMax.value[ 0 ].w, 3, 'lighting-on retains selected optical profile' );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); frame();
		equal( uniforms.uWaterCount.value, 0, 'liquids-off removes profile composition' );
		const native = surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 );
		equal( native.opacity, .75, 'liquids-off restores native opacity' ); equal( native.vertexColors, false, 'native ignores enhanced brightness' );
		equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ).opacity, .75, 'native slime opacity preserved' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); frame();
		post.classicLook.value = 1; anim.R_AnimSetClassicPass( true );
		equal( post.R_WaterActive(), false, 'classic scope removes enhanced profiles' );
		equal( surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ), native, 'classic reuses native water material' );
		equal( native.map, textures[ 0 ].gl_texture, 'classic source texture identity preserved' );
		post.classicLook.value = 0; anim.R_AnimSetClassicPass( false );
		vars.Cvar_SetValue( 'r_hdr', 0 ); equal( post.R_PostBegin( renderer, true, 320, 200 ), false, 'New Game has no enhanced profile compositor' );
		equal( surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ).opacity, .75, 'New Game remains native despite persisted choice' );

	} finally {

		post.classicLook.value = priorLook; anim.R_AnimSetClassicPass( priorClassic ); post.R_PostSetUnderwater( false );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );
		for ( const texture of textures ) texture.gl_texture.dispose();

	}

} );
