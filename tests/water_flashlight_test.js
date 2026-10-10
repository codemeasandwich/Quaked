// Public cvar, beam, frame, material and probe interfaces. This checks state
// boundaries; the controlled WebGL trial supplies the optical pixel proof.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const post = await import( '../src/newer/render/gl_post.js' ), mode = await import( '../src/newer/mode.js' );
const vars = await import( '../src/engine/common/cvar.js' ), flashlight = await import( '../src/newer/render/r_flashlight.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' ), probes = await import( '../src/newer/render/r_waterprobe.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

Deno.test( 'flashlight toggles preserve water material and cached reflections while respecting lighting and classic scopes', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_reflect, post.r_reflect_screen,
		mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water, flashlight.r_flashlight ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), priorLook = post.classicLook.value, priorClassic = mode.R_ClassicPassActive();
	const descriptor = Object.getOwnPropertyDescriptor( performance, 'now' ); let now = 800000;
	Object.defineProperty( performance, 'now', { configurable: true, value: () => now } );
	const beam = flashlight.R_FlashlightBeam(), priorBeam = { on: beam.on, pos: beam.pos.slice(), dir: beam.dir.slice() };
	const texture = new THREE.DataTexture( new Uint8Array( [ 40, 64, 30, 255 ] ), 1, 1 );
	const liquid = { name: '*water1', gl_texture: texture };
	const leaf = { contents: - 1, visframe: 0, compressed_vis: null };
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 1, numleafs: 1, nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ],
		surfaces: [ { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: liquid },
			polys: { numverts: 4, verts: [ [ - 128, - 128, 0, 0, 0 ], [ 128, - 128, 0, 1, 0 ],
				[ 128, 128, 0, 1, 1 ], [ - 128, 128, 0, 0, 1 ] ], next: null } } ] };
	let target = null, uniforms = null, cubeDraws = 0;
	const renderer = {
		capabilities: { isWebGL2: true }, extensions: { has: () => true }, coordinateSystem: THREE.WebGLCoordinateSystem,
		xr: { enabled: false }, getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
		setRenderTarget: next => { target = next; }, setViewport() {},
		render( scene ) {

			if ( target?.isWebGLCubeRenderTarget ) cubeDraws ++;
			else uniforms = scene.children[ 0 ].material.uniforms;

		}
	};
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 );
	camera.up.set( 0, 0, 1 ); camera.position.set( 0, - 160, 48 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
	const forward = camera.getWorldDirection( new THREE.Vector3() ).toArray();
	function frame() {

		now += 2000;
		post.R_PostBegin( renderer, true, 320, 200 );
		flashlight.R_FlashlightUpdate( camera.position.toArray(), forward, [ 1, 0, 0 ], [ 0, 0, 1 ] );
		post.R_WaterProbesFrame( renderer, scene, camera, () => {} );
		post.R_PostFinish( renderer, scene, camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false );
		return surf.R_LiquidSurfaceMaterial( liquid, .75 );

	}
	try {

		post.classicLook.value = 0; mode.R_AnimSetClassicPass( false ); post.R_PostSetUnderwater( false );
		for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_flashlight' ] ) vars.Cvar_SetValue( name, 0 );
		vars.Cvar_SetValue( 'r_reflect', .6 ); post.R_BuildWorldLights( model ); probes.R_WaterProbeClear();
		const material = frame(), probe = probes.R_WaterProbes()[ 0 ];
		equal( cubeDraws, 6, 'initial six-face probe capture' ); equal( probe != null, true, 'actual pool probe created' );
		equal( uniforms.uSpotOn.value, 0, 'flashlight initially off' );
		for ( const enabled of [ 1, 0, 1 ] ) {

			vars.Cvar_SetValue( 'r_flashlight', enabled ); equal( frame(), material, 'same cached water material' );
			equal( uniforms.uSpotOn.value, enabled, 'beam option reaches compositor' );
			equal( uniforms.uReflect.value, .6, 'beam leaves environment reflection strength intact' );
			equal( uniforms.uScreenReflect.value, 1, 'beam leaves SSR option intact' );
			equal( uniforms.uWaterCount.value, 1, 'beam leaves pool optics active' );
			equal( material.map, texture, 'authored water map retained' ); equal( material.opacity, .05, 'water transparency retained' );
			equal( probes.R_WaterProbes()[ 0 ], probe, 'same cached probe' ); equal( cubeDraws, 6, 'beam does not recapture cube' );

		}
		vars.Cvar_SetValue( 'r_reflect_screen', 0 ); frame();
		equal( uniforms.uScreenReflect.value, 0, 'probe-only option respected with beam on' ); equal( uniforms.uSpotOn.value, 1, 'direct beam stays available' );
		vars.Cvar_SetValue( 'r_reflect', 0 ); frame();
		equal( uniforms.uReflect.value, 0, 'reflection-off option respected' ); equal( uniforms.uSpotOn.value, 1, 'reflection-off retains live beam' );
		equal( uniforms.uWaterCount.value, 1, 'reflection-off retains transmission optics' );
		vars.Cvar_SetValue( 'r_reflect', .6 ); vars.Cvar_SetValue( 'r_newer_lighting', 0 ); equal( frame(), material, 'lighting-off keeps cached water material' );
		equal( uniforms.uSpotOn.value, 0, 'lighting-off suppresses flashlight' ); equal( uniforms.uReflect.value, .6, 'lighting-off preserves reflection' );
		equal( uniforms.uWaterCount.value, 1, 'lighting-off preserves liquids' ); equal( vars.Cvar_VariableValue( 'r_flashlight' ), 1, 'beam preference preserved' );
		vars.Cvar_SetValue( 'r_newer_lighting', 1 ); frame(); equal( uniforms.uSpotOn.value, 1, 'lighting restoration restores beam' );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); const native = frame();
		equal( uniforms.uWaterCount.value, 0, 'liquids-off excludes surface optics' ); equal( native.opacity, .75, 'native opacity restored' ); equal( native.vertexColors, false, 'native ignores enhanced vertex light' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); frame();
		post.classicLook.value = 1; mode.R_AnimSetClassicPass( true );
		flashlight.R_FlashlightUpdate( camera.position.toArray(), forward, [ 1, 0, 0 ], [ 0, 0, 1 ] );
		post.R_WaterProbesFrame( renderer, scene, camera, () => {} );
		equal( beam.on, false, 'classic scope suppresses beam' ); equal( post.R_WaterActive(), false, 'classic scope suppresses water optics' );
		equal( surf.R_LiquidSurfaceMaterial( liquid, .75 ).vertexColors, false, 'classic scope uses native surface' ); equal( cubeDraws, 6, 'classic never captures enhanced probe' );

	} finally {

		post.classicLook.value = priorLook; mode.R_AnimSetClassicPass( priorClassic ); post.R_PostSetUnderwater( false );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null ); probes.R_WaterProbeClear();
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );
		beam.on = priorBeam.on; beam.pos.splice( 0, 3, ...priorBeam.pos ); beam.dir.splice( 0, 3, ...priorBeam.dir ); texture.dispose();
		if ( descriptor ) Object.defineProperty( performance, 'now', descriptor ); else delete performance.now;

	}

} );
