// Exercise the public cvar/menu/frame interfaces with real Three.js materials.
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const post = await import( '../src/gl_post.js' );
const anim = await import( '../src/r_anim.js' );
const cvar = await import( '../src/cvar.js' );
const cmd = await import( '../src/cmd.js' );
const menu = await import( '../src/menu.js' );
const keys = await import( '../src/keys.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

const options = [ post.r_hdr, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
function registerOptions() {

	for ( const v of options ) if ( cvar.Cvar_FindVar( v.name ) === null ) cvar.Cvar_RegisterVariable( v );

}

const renderer = {
	capabilities: { isWebGL2: true },
	extensions: { has: () => true }
};

Deno.test( 'lighting, normal maps and liquids switch independently on existing materials', () => {

	registerOptions();
	const saved = options.map( v => v.string );
	const diffuse = new THREE.DataTexture( new Uint8Array( 4 * 4 * 4 ).fill( 100 ), 4, 4 );
	const nextDiffuse = new THREE.DataTexture( new Uint8Array( 4 * 4 * 4 ).fill( 150 ), 4, 4 );
	const material = new THREE.MeshLambertMaterial( { map: diffuse } );
	post.R_RegisterDetail( material, diffuse );
	post.R_RegisterGlow( material, 3 );

	try {

		cvar.Cvar_SetValue( 'r_hdr', 1 );
		// Repeat the transitions to catch cached static-material state.
		for ( let pass = 0; pass < 2; pass ++ ) for ( let mask = 0; mask < 8; mask ++ ) {

			const light = ( mask & 1 ) !== 0, normal = ( mask & 2 ) !== 0, water = ( mask & 4 ) !== 0;
			cvar.Cvar_SetValue( 'r_newer_lighting', light ? 1 : 0 );
			cvar.Cvar_SetValue( 'r_newer_normals', normal ? 1 : 0 );
			cvar.Cvar_SetValue( 'r_newer_water', water ? 1 : 0 );
			equal( post.R_PostBegin( renderer, true, 320, 200 ), mask !== 0, `pipeline ${mask}` );
			equal( anim.R_NewerLightingActive(), light, `lighting ${mask}` );
			equal( post.R_WaterActive(), water, `liquids ${mask}` );
			equal( material.normalMap !== null, normal, `normal map ${mask}` );
			equal( material.emissiveIntensity, light ? 3 : 1, `glow ${mask}` );
			if ( normal ) equal( material.normalMap, diffuse._normalMap, 'cached normal identity' );

		}

		cvar.Cvar_SetValue( 'r_newer_lighting', 0 );
		post.R_PostBegin( renderer, true, 320, 200 );
		post.R_RefreshDetail( material, nextDiffuse );
		equal( material.normalMap, nextDiffuse._normalMap, 'animated texture keeps its own normal with lighting off' );
		post.classicLook.value = 1;
		equal( post.R_PostActive(), false, 'classic comparison pass' );
		equal( post.R_WaterActive(), false, 'classic comparison liquids' );
		post.classicLook.value = 0;

		const camera = new THREE.PerspectiveCamera( 90, 1.6, 4, 4096 );
		camera.updateMatrixWorld();
		const passes = [];
		const fakeRenderer = {
			setRenderTarget() {}, setViewport() {},
			render( scene ) { passes.push( scene.children[ 0 ].material.uniforms ); }
		};
		post.R_PostFinish( fakeRenderer, new THREE.Scene(), camera,
			{ lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 0, 1, true );
		equal( passes.length, 1, 'lighting off skips sun shadow, shafts and bloom passes' );
		const uniforms = passes[ 0 ];
		equal( uniforms.uHaze, undefined, 'global haze removed from all option modes' );
		for ( const name of [ 'uLighting', 'uSunOn', 'uCount', 'uBounce', 'uBloom', 'uVolume', 'uEdge' ] )
			equal( uniforms[ name ].value, 0, name );
		for ( const name of [ 'uExposure', 'uBright', 'uContrastGain' ] ) equal( uniforms[ name ].value, 1, name );
		equal( uniforms.uCaustic.value > 0, true, 'liquids retain caustics' );

		for ( const [ target, enabled, width ] of [ [ renderer, false, 320 ], [ {}, true, 320 ], [ renderer, true, 8 ] ] ) {

			equal( post.R_PostBegin( target, enabled, width, 200 ), false, 'disabled/unsupported/small fallback' );
			equal( material.normalMap, null, 'fallback removes normal map' );
			equal( post.R_WaterActive(), false, 'fallback removes liquids' );

		}

		cvar.Cvar_SetValue( 'r_hdr', 0 );
		equal( post.R_PostBegin( renderer, true, 320, 200 ), false, 'New Game stays original' );

	} finally {

		post.classicLook.value = 0;
		options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
		post.R_PostBegin( renderer, false, 0, 0 );
		material.dispose(); diffuse.dispose(); nextDiffuse.dispose();

	}

} );

Deno.test( 'Newer menu exposes independent lighting, normals and liquids controls', () => {

	registerOptions();
	const saved = options.map( v => v.string );
	try {

		cmd.Cbuf_Init(); cmd.Cmd_Init(); menu.M_Init();
		for ( const v of options ) cvar.Cvar_SetValue( v.name, 1 );
		cmd.Cmd_ExecuteString( 'menu_options' );
		// Newer Game features is now the first visible Options row.
		menu.M_Keydown( keys.K_ENTER );
		menu.M_Keydown( keys.K_ENTER );
		equal( cvar.Cvar_VariableValue( 'r_newer_lighting' ), 0, 'first row controls lighting' );
		equal( cvar.Cvar_VariableValue( 'r_newer_normals' ), 1, 'lighting leaves normals on' );
		equal( cvar.Cvar_VariableValue( 'r_newer_water' ), 1, 'lighting leaves liquids on' );
		menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_ENTER );
		equal( cvar.Cvar_VariableValue( 'r_newer_normals' ), 0, 'second row controls normals' );
		equal( cvar.Cvar_VariableValue( 'r_newer_water' ), 1, 'normals leave liquids on' );
		menu.M_Keydown( keys.K_DOWNARROW ); menu.M_Keydown( keys.K_RIGHTARROW );
		equal( cvar.Cvar_VariableValue( 'r_newer_water' ), 0, 'third row controls liquids' );
		equal( cvar.Cvar_VariableValue( 'r_hdr' ), 1, 'menu keeps Newer Game mode' );

	} finally {

		options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
		menu.M_Keydown( keys.K_UPARROW ); menu.M_Keydown( keys.K_UPARROW );
		menu.M_Keydown( keys.K_ESCAPE );

	}

} );
