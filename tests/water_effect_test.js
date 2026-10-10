await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' ), anim = await import( '../src/newer/render/r_anim.js' ), vars = await import( '../src/engine/common/cvar.js' );
const probes = await import( '../src/newer/render/r_waterprobe.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' ), light = await import( '../src/engine/render/gl_rlight.js' ), quake = await import( '../src/engine/render/glquake.js' );
const { cl } = await import( '../src/engine/client/client.js' );
function equal( a, b, label ) { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); }
function model() {

	const leaf = { contents: - 1, visframe: 0 };
	return { entities: '', firstmodelsurface: 0, nummodelsurfaces: 1, numleafs: 1, nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ],
		surfaces: [ { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: '*water1' } },
			polys: { numverts: 4, verts: [ [ - 128, - 128, 0, 0, 0 ], [ 128, - 128, 0, 1, 0 ], [ 128, 128, 0, 1, 1 ], [ - 128, 128, 0, 0, 1 ] ], next: null } } ] };

}
Deno.test( 'water presentation switches preserve independent optics, native opacity and other liquids', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_reflect, post.r_reflect_screen, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v ); const saved = options.map( v => v.string );
	let target = null, uniforms = null;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {},
		render: scene => { uniforms = scene.children[ 0 ].material.uniforms; } };
	try {

		post.R_BuildWorldLights( model() ); for ( const v of options ) vars.Cvar_SetValue( v.name, 0 );
		vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'r_newer_normals', 1 ); vars.Cvar_SetValue( 'r_newer_water', 1 );
		equal( post.R_LiquidOpacity( '*water1', 1 ), .05, 'moderate textured surface layer' ); equal( post.R_LiquidOpacity( '*slime0', 1 ), .22, 'toxic slime remains visibly translucent' ); equal( post.R_LiquidOpacity( '*lava1', 1 ), 1, 'lava unchanged' );
		post.R_PostBegin( renderer, true, 320, 200 );
		const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.up.set( 0, 0, 1 ); camera.position.set( 0, - 160, 48 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
		post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false );
		equal( uniforms.uLighting.value, 0, 'lighting off' ); equal( uniforms.uWaterCount.value, 1, 'liquid optics retained' ); equal( uniforms.uReflect.value, 0, 'reflections off independently' ); equal( uniforms.uScreenReflect.value, 0, 'SSR option respected' );
		vars.Cvar_SetValue( 'r_reflect', .6 ); post.R_PostSetUnderwater( true ); post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 2, 1, false );
		equal( uniforms.uReflect.value, .6, 'underwater keeps strength for per-interface reflection' ); post.R_PostSetUnderwater( false );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 3, 1, false );
		equal( uniforms.uWaterCount.value, 0, 'water-off bypasses optics' ); equal( post.R_LiquidOpacity( '*water1', .75 ), .75, 'native opacity restored' );
		anim.R_AnimSetClassicPass( true ); post.classicLook.value = 1; equal( post.R_WaterActive(), false, 'classic pass off' );

	} finally {

		anim.R_AnimSetClassicPass( false ); post.classicLook.value = 0; post.R_PostSetUnderwater( false ); post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );

	}

} );
Deno.test( 'cached water probes exclude first-person weapon, keep six draws and restore on capture failure', () => {

	const descriptor = Object.getOwnPropertyDescriptor( performance, 'now' ); let time = 200000; Object.defineProperty( performance, 'now', { configurable: true, value: () => time } );
	try {

		for ( const fail of [ false, true ] ) {

			probes.R_WaterProbeClear(); time += 2000;
			const scene = new THREE.Scene(), weapon = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), new THREE.MeshBasicMaterial() ); weapon.userData.quakeViewmodel = true; scene.add( weapon );
			const camera = new THREE.PerspectiveCamera( 90, 1, 4, 4096 ); camera.position.set( 0, - 150, 50 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
			const region = { min: [ - 64, - 64 ], max: [ 64, 64 ], z: 0, kind: 0 }, regions = [ region ], prior = {}; let target = prior, draws = 0; const visible = [];
			const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: true }, getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
				setRenderTarget: t => { target = t; }, render() { draws ++; equal( weapon.visible, false, 'weapon excluded while capturing' ); if ( fail ) throw new Error( 'capture failed' ); } };
			let error = false;
			try { probes.R_WaterProbeUpdate( renderer, scene, camera, regions, v => visible.push( v ), regions ); } catch ( e ) { error = true; equal( e.message, 'capture failed', 'failure preserved' ); }
			equal( error, fail, 'capture outcome' ); equal( weapon.visible, true, 'weapon visibility restored' ); equal( renderer.xr.enabled, true, 'XR renderer flag restored' ); equal( target, prior, 'target restored' ); equal( visible.join(), 'true,false', 'world visibility restored' );
			if ( ! fail ) {

				equal( draws, 6, 'one six-face capture' ); time += 2000; probes.R_WaterProbeUpdate( renderer, scene, camera, regions, () => {}, regions ); equal( draws, 6, 'no per-frame recapture' ); equal( probes.R_WaterProbes().length, 1, 'cached probe reused' );

			}
			weapon.geometry.dispose(); weapon.material.dispose();

		}

	} finally { probes.R_WaterProbeClear(); if ( descriptor ) Object.defineProperty( performance, 'now', descriptor ); else delete performance.now; }

} );

Deno.test( 'original water colour/pattern uses contextual cached brightness, live styles and the selected light curve', () => {

	const saved = { time: cl.time, frame: quake.r_framecount, style: quake.d_lightstylevalue[ 0 ], dark: post.r_newdark.value, lighting: anim.R_NewerLightingActive(), spot: Array.from( light.lightspot ), plane: light.lightplane };
	const plane = { normal: [ 0, 0, 1 ], dist: - 64, type: 2 };
	const floor = { flags: 0, texinfo: { vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, texturemins: [ - 16, - 16 ], extents: [ 32, 32 ], samples: new Uint8Array( 9 ).fill( 32 ), styles: new Uint8Array( [ 0, 255, 255, 255 ] ) };
	const world = { lightdata: floor.samples, surfaces: [ floor ], nodes: [ { contents: 0, plane, firstsurface: 0, numsurfaces: 1, children: [ { contents: - 1 }, { contents: - 2 } ] } ] };
	const geometry = new THREE.BufferGeometry(); geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 0, 8, 0, 0, 0, 8, 0 ] ), 3 ) );
	try {

		cl.time = 1; quake.set_r_framecount( 300 ); quake.d_lightstylevalue[ 0 ] = 256; post.r_newdark.value = 2; anim.R_AnimSetLighting( true );
		light.lightspot.set( [ 7, 8, 9 ] ); const originalPlane = light.lightplane;
		equal( light.R_LightPointValue( [ 0, 0, 0 ], { worldmodel: world } ), 32, 'actual BSP brightness' ); equal( light.lightspot.join(), '7,8,9', 'query spot preserved' ); equal( light.lightplane, originalPlane, 'query plane preserved' );
		surf.R_UpdateWaterTextureLight( geometry, world ); const colours = geometry.getAttribute( 'color' ), version = colours.version;
		equal( colours.getX( 0 ), .125, 'same bounded atlas curve convention' ); equal( colours.getY( 0 ), colours.getX( 0 ), 'brightness cannot overwrite texture hue' );
		surf.R_UpdateWaterTextureLight( geometry, world ); equal( geometry.getAttribute( 'color' ), colours, 'attribute reused' ); equal( colours.version, version, 'unchanged samples not reuploaded' );
		anim.R_AnimSetLighting( false ); surf.R_UpdateWaterTextureLight( geometry, world ); equal( colours.getX( 0 ), .5, 'lighting-off keeps native baked brightness' );
		anim.R_AnimSetLighting( true ); post.r_newdark.value = 1; surf.R_UpdateWaterTextureLight( geometry, world ); equal( colours.getX( 0 ), .5, 'curve slider updates cached colours' );
		quake.d_lightstylevalue[ 0 ] = 0; quake.set_r_framecount( 301 ); surf.R_UpdateWaterTextureLight( geometry, world ); equal( colours.getX( 0 ), 0, 'switched-off source produces no self-lit texture' );
		quake.d_lightstylevalue[ 0 ] = 256; floor.samples.fill( 128 ); cl.time += .2; quake.set_r_framecount( 302 ); surf.R_UpdateWaterTextureLight( geometry, world ); equal( colours.getX( 0 ), 2, 'bright environment restores original coloured surface' );
		anim.r_newer_water.value = 1; post.classicLook.value = 1; const native = surf.R_LiquidSurfaceMaterial( { name: '*water1', gl_texture: new THREE.DataTexture() }, 1 );
		equal( native.vertexColors, false, 'classic material ignores shared water lighting attribute' ); equal( native.isMeshBasicMaterial, true, 'original renderer material reused' ); native.map.dispose();

	} finally {

		geometry.dispose(); cl.time = saved.time; quake.set_r_framecount( saved.frame ); quake.d_lightstylevalue[ 0 ] = saved.style; post.r_newdark.value = saved.dark; anim.R_AnimSetLighting( saved.lighting ); post.classicLook.value = 0; light.lightspot.set( saved.spot );

	}

} );
