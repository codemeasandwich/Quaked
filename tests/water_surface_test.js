// Public frame/material boundaries for both sides of the water interface.
// Optical Fresnel, Snell-window/TIR and calmer ripple pixels are checked in
// the real WebGL surface trial rather than by duplicating shader arithmetic.
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/gl_post.js' );
const surf = await import( '../src/gl_rsurf.js' ), main = await import( '../src/gl_rmain.js' );
const anim = await import( '../src/r_anim.js' ), vars = await import( '../src/engine/common/cvar.js' );
const view = await import( '../src/view.js' ), client = await import( '../src/client.js' );
const quake = await import( '../src/glquake.js' ), light = await import( '../src/gl_rlight.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

Deno.test( 'water underside keeps live reflection controls, material cues and independent visual boundaries', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_reflect,
		post.r_reflect_screen, post.r_caustics, post.r_water_look, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), priorLeaf = main.r_viewleaf;
	const priorLook = post.classicLook.value, priorClassic = anim.R_ClassicPassActive();
	const texture = new THREE.DataTexture( new Uint8Array( [ 64, 80, 48, 255 ] ), 1, 1 );
	const liquid = { name: '*water1', gl_texture: texture }, leaf = { contents: - 1, visframe: 0, compressed_vis: null };
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 1, numleafs: 1,
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ],
		surfaces: [ { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: liquid },
			polys: { numverts: 4, verts: [ [ - 128, - 128, 0, 0, 0 ], [ 128, - 128, 0, 1, 0 ],
				[ 128, 128, 0, 1, 1 ], [ - 128, 128, 0, 0, 1 ] ], next: null } } ] };
	let target = null, uniforms = null, draws = 0;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		getRenderTarget: () => target, setRenderTarget: next => { target = next; }, setViewport() {},
		render( scene ) { draws ++; uniforms = scene.children[ 0 ].material.uniforms; } };
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.up.set( 0, 0, 1 );
	function frame( below, time = 1 ) {

		main.set_r_viewleaf( { contents: below ? - 3 : - 1 } ); post.R_PostSetUnderwater( below );
		camera.position.set( 0, 0, below ? - 32 : 48 ); camera.lookAt( 0, 64, below ? 32 : - 32 ); camera.updateMatrixWorld();
		const active = post.R_PostBegin( renderer, true, 320, 200 );
		if ( active ) post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], time, 1, false );
		return surf.R_LiquidSurfaceMaterial( liquid, .75 );

	}
	try {

		post.classicLook.value = 0; anim.R_AnimSetClassicPass( false );
		for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_newer_lighting', 'r_water_look' ] ) vars.Cvar_SetValue( name, 0 );
		vars.Cvar_SetValue( 'r_reflect', .6 ); post.R_BuildWorldLights( model );
		const material = frame( false ), topOpacity = material.opacity;
		equal( uniforms.uUnderwater.value, 0, 'above-water contents classification reaches compositor' );
		equal( material.map, texture, 'original water texture' ); equal( material.depthWrite, false, 'floor depth remains available' );
		const currentRegions = post.R_GetLiquidRegions();
		for ( const strength of [ .2, .6, 1, 0 ] ) {

			vars.Cvar_SetValue( 'r_reflect', strength ); equal( frame( true ), material, 'underside reuses original cached material' );
			equal( uniforms.uReflect.value, strength, 'underwater view retains explicit reflection strength' );
			equal( uniforms.uWaterCount.value, 1, 'underside retains pool optics' );
			equal( uniforms.uWaterMin.value[ 0 ].w, 0, 'underside never changes physical water kind' );
			equal( uniforms.uUnderwater.value, 1, 'actual underwater contents enable underside optics' );
			equal( uniforms.uViewInv.value.elements[ 14 ], - 32, 'actual submerged camera reaches compositor' );
			equal( material.opacity > topOpacity * .4 && material.opacity < topOpacity, true, 'subtle underside cue is stronger than the old near-invisible layer' );

		}
		// A low camera alone must not classify a dry gap beneath a merged pool
		// box as water. The actual view-leaf classification remains authoritative.
		main.set_r_viewleaf( { contents: - 1 } ); post.R_PostSetUnderwater( false );
		post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false );
		equal( uniforms.uUnderwater.value, 0, 'dry view leaf can disable underside at the same low camera position' );
		vars.Cvar_SetValue( 'r_reflect', .6 );
		vars.Cvar_SetValue( 'r_reflect_screen', 0 ); frame( true ); equal( uniforms.uScreenReflect.value, 0, 'probe-only option retained below water' );
		for ( const choice of [ 1, 3, 2, 4, 1 ] ) {

			vars.Cvar_SetValue( 'r_water_look', choice );
			for ( const time of [ 1, 2.5 ] ) {

				equal( frame( true, time ), material, 'time/profile transition keeps material cache' );
				equal( uniforms.uWaterMax.value[ 0 ].w, choice - 1, 'selected calm profile survives underside/time transitions' );
				equal( uniforms.uTime.value, time, 'live simulation time reaches optical animation' );
				equal( material.map, texture, 'animation preserves authored texture identity' );
				equal( post.R_GetLiquidRegions(), currentRegions, 'animation leaves physical pool definitions unchanged' );

			}
		}
		vars.Cvar_SetValue( 'r_newer_normals', 0 ); frame( true );
		equal( post.R_WaterActive(), true, 'normal maps off retains analytic interface' ); equal( uniforms.uReflect.value, .6, 'normal switch leaves underside reflection' );
		vars.Cvar_SetValue( 'r_newer_lighting', 1 ); frame( true ); equal( uniforms.uLighting.value, 1, 'advanced lighting can coexist with underside optics' );
		vars.Cvar_SetValue( 'r_newer_lighting', 0 ); frame( true ); equal( uniforms.uLighting.value, 0, 'lighting off remains independent' );
		equal( uniforms.uReflect.value, .6, 'lighting off retains interface reflection' );
		const fullCaustic = uniforms.uCaustic.value; equal( fullCaustic > .6, true, 'received-light caustic strength increased over prior default' );
		vars.Cvar_SetValue( 'r_caustics', .5 ); frame( true ); equal( uniforms.uCaustic.value, fullCaustic * .5, 'caustics slider retains proportional response' );
		vars.Cvar_SetValue( 'r_caustics', 0 ); frame( true ); equal( uniforms.uCaustic.value, 0, 'caustics still disable independently' );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); vars.Cvar_SetValue( 'r_newer_normals', 1 ); const native = frame( true );
		equal( uniforms.uWaterCount.value, 0, 'liquids off suppresses underside interface' );
		equal( native.opacity, .75, 'native surface ignores underwater optical opacity' ); equal( native.vertexColors, false, 'native ignores enhanced brightness' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); frame( true );
		post.classicLook.value = 1; anim.R_AnimSetClassicPass( true );
		equal( post.R_WaterActive(), false, 'classic scope suppresses interface' );
		equal( surf.R_LiquidSurfaceMaterial( liquid, .75 ), native, 'classic scope selects native cached surface' );
		post.classicLook.value = 0; anim.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 0 );
		const before = draws; equal( frame( true ), native, 'New Game uses native material underwater' ); equal( draws, before, 'New Game bypasses optical composition' );

	} finally {

		main.set_r_viewleaf( priorLeaf ); post.classicLook.value = priorLook; anim.R_AnimSetClassicPass( priorClassic ); post.R_PostSetUnderwater( false );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); texture.dispose();

	}

} );

Deno.test( 'mapped water probes choose real air anchors instead of a solid merged centre and skip unsafe pools before budgeting', async () => {

	const modelApi = await import( '../src/gl_model.js' );
	// Isolate this public probe instance's private capture clock from other test
	// files, which independently simulate different performance.now timelines.
	const probes = await import( '../src/r_waterprobe.js?water-surface-anchor-fixture' );
	const descriptor = Object.getOwnPropertyDescriptor( performance, 'now' ); let now = 400000;
	Object.defineProperty( performance, 'now', { configurable: true, value: () => now } );
	const solid = { contents: - 2, compressed_vis: null }, lowerAir = { contents: - 1, compressed_vis: null };
	const upperAir = { contents: - 1, compressed_vis: null }, waterLeaf = { contents: - 3, compressed_vis: null };
	const bandTop = { contents: 0, plane: { normal: [ 0, 1, 0 ], dist: 144 }, children: [ upperAir, solid ] };
	const bandBottom = { contents: 0, plane: { normal: [ 0, 1, 0 ], dist: 112 }, children: [ bandTop, lowerAir ] };
	const root = { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ bandBottom, waterLeaf ] };
	function face( x0, x1, y0, y1 ) {

		return { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: '*water1' } },
			polys: { numverts: 4, verts: [ [ x0, y0, 0, 0, 0 ], [ x1, y0, 0, 1, 0 ],
				[ x1, y1, 0, 1, 1 ], [ x0, y1, 0, 0, 1 ] ], next: null } };

	}
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 4, numleafs: 3,
		nodes: [ root ], leafs: [ solid, lowerAir, upperAir, waterLeaf ],
		surfaces: [ face( - 64, 64, 0, 128 ), face( - 64, 64, 128, 256 ),
			face( 400, 528, 96, 160 ), face( 700, 828, 96, 160 ) ] };
	let target = null, draws = 0; const centres = [], visibility = [];
	const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false },
		getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
		setRenderTarget: next => { target = next; },
		render( scene, camera ) {

			draws ++; const centre = camera.getWorldPosition( new THREE.Vector3() ).toArray(); centres.push( centre );
			equal( modelApi.Mod_PointInLeaf( centre, model ).contents, - 1, 'every cube face is captured from verified air' );

		}
	};
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 100, 1.6, 4, 4096 );
	camera.up.set( 0, 0, 1 ); camera.position.set( 650, - 100, 160 ); camera.lookAt( 0, 128, 0 ); camera.updateMatrixWorld();
	try {

		post.R_BuildWorldLights( model ); const regions = post.R_GetLiquidRegions();
		equal( regions.length, 3, 'adjacent safe faces merge while separate unsafe pools retain their regions' );
		const safe = regions.find( r => r.min[ 0 ] === - 64 ), unsafe = regions.filter( r => r !== safe );
		equal( safe.min.join(), '-64,0', 'original merged pool minimum preserved' ); equal( safe.max.join(), '64,256', 'original merged pool maximum preserved' );
		equal( safe.kind, 0, 'probe placement leaves physical kind untouched' );
		equal( modelApi.Mod_PointInLeaf( [ 0, 128, probes.WATER_PROBE_LIFT ], model ).contents, - 2, 'merged bounding-box centre reproduces the solid-placement bug' );
		equal( safe.probePoints.length, 2, 'both actual face centres supply safe anchors' );
		for ( const anchor of safe.probePoints ) equal( modelApi.Mod_PointInLeaf( anchor, model ).contents, - 1, 'map builder validates each air anchor' );
		for ( const pool of unsafe ) equal( pool.probePoints.length, 0, 'mapped pool without air carries an explicit empty anchor list' );
		// The two closer, unsafe pools must not consume the nearest-two budget.
		const candidates = [ ...unsafe, safe ];
		probes.R_WaterProbeUpdate( renderer, scene, camera, candidates, all => visibility.push( all ), regions );
		equal( draws, 6, 'safe third candidate receives exactly one six-face capture' );
		const probe = probes.R_WaterProbeFor( safe ); equal( probe != null, true, 'safe mapped pool has a cached probe' );
		equal( safe.probePoints.some( p => p.join() === probe.center.join() ), true, 'capture centre retains an actual verified face anchor' );
		equal( probe.center[ 2 ], probes.WATER_PROBE_LIFT, 'verified anchor height retained' );
		equal( centres.every( p => p.join() === probe.center.join() ), true, 'all camera faces use the published capture centre' );
		for ( const pool of unsafe ) equal( probes.R_WaterProbeFor( pool ), null, 'unsafe mapped pool never captures a solid fallback' );
		equal( visibility.join(), 'true,false', 'capture restores world visibility' ); equal( target, null, 'capture restores renderer target' );
		now += 2000; probes.R_WaterProbeUpdate( renderer, scene, camera, candidates, () => {}, regions );
		equal( draws, 6, 'safe probe is cached rather than recaptured every frame' ); equal( probes.R_WaterProbes().length, 1, 'invalid pools do not churn the cache' );

	} finally {

		probes.R_WaterProbeClear(); post.R_BuildWorldLights( null );
		if ( descriptor ) Object.defineProperty( performance, 'now', descriptor ); else delete performance.now;

	}

} );

Deno.test( 'contents-free optical screen blend retains full damage, pickup and powerup flashes without mutating native state', () => {

	if ( ! vars.Cvar_FindVar( 'gl_cshiftpercent' ) ) view.V_Init();
	const percent = vars.Cvar_VariableString( 'gl_cshiftpercent' ), originalBlend = Array.from( view.v_blend );
	const originalLiquidBlend = Array.from( quake.v_liquid_blend );
	const originalShifts = client.cl.cshifts.map( shift => ( { percent: shift.percent, color: Array.from( shift.destcolor ) } ) );
	const snapshot = () => JSON.stringify( client.cl.cshifts.map( shift => ( { percent: shift.percent, color: Array.from( shift.destcolor ) } ) ) );
	const near = ( actual, expected, label ) => {

		if ( ! Number.isFinite( actual ) || Math.abs( actual - expected ) > 1e-6 ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

	};
	const flashes = [ [ client.CSHIFT_DAMAGE, [ 220, 50, 50 ], 96 ],
		[ client.CSHIFT_BONUS, [ 215, 186, 69 ], 50 ], [ client.CSHIFT_POWERUP, [ 0, 0, 255 ], 30 ] ];
	try {

		vars.Cvar_SetValue( 'gl_cshiftpercent', 100 );
		for ( const contents of [ - 3, - 4 ] ) for ( const active of [ [ 0 ], [ 1 ], [ 2 ], [ 0, 1, 2 ] ] ) {

			for ( const shift of client.cl.cshifts ) shift.percent = 0;
			view.V_SetContentsColor( contents );
			for ( const i of active ) {

				const [ index, color, amount ] = flashes[ i ]; client.cl.cshifts[ index ].destcolor.set( color ); client.cl.cshifts[ index ].percent = amount;

			}
			equal( view.V_CalcBlend(), view.v_blend, 'default caller keeps canonical native output' );
			const native = Array.from( view.v_blend ), shiftsBefore = snapshot(), filtered = new Float32Array( 4 );
			equal( view.V_CalcBlend( 0, filtered ), filtered, 'contents filtering returns caller-owned output' );
			equal( quake.v_liquid_blend.join(), filtered.join(), 'default calculation refreshes paired contents-free frame buffer' );
			equal( Array.from( view.v_blend ).join(), native.join(), 'filtered calculation leaves native blend intact' );
			equal( snapshot(), shiftsBefore, 'filtered calculation leaves all native shifts intact' );
			const contentsPercent = client.cl.cshifts[ client.CSHIFT_CONTENTS ].percent;
			client.cl.cshifts[ client.CSHIFT_CONTENTS ].percent = 0;
			const noContentsControl = view.V_CalcBlend( 1, new Float32Array( 4 ) );
			client.cl.cshifts[ client.CSHIFT_CONTENTS ].percent = contentsPercent;
			equal( filtered.join(), noContentsControl.join(), 'filtered result matches native flash composition with contents absent' );
			if ( active.length === 1 ) {

				const [ , color, amount ] = flashes[ active[ 0 ] ];
				for ( let c = 0; c < 3; c ++ ) near( filtered[ c ], color[ c ] / 255, 'authored flash colour retains full strength' );
				near( filtered[ 3 ], amount / 255, 'authored flash alpha is not scaled underwater' );

			} else near( filtered[ 3 ], 1 - ( 1 - 96 / 255 ) * ( 1 - 50 / 255 ) * ( 1 - 30 / 255 ), 'mixed flash alpha retains native composition' );
		}
		for ( const shift of client.cl.cshifts ) shift.percent = 0;
		view.V_SetContentsColor( - 3 ); view.V_CalcBlend(); const waterNative = Array.from( view.v_blend );
		equal( waterNative[ 3 ] > 0, true, 'native water contents tint still exists' );
		equal( view.V_CalcBlend( 0, new Float32Array( 4 ) ).join(), '0,0,0,0', 'contents-only wash can be excluded entirely' );
		view.V_SetContentsColor( - 5 ); view.V_CalcBlend(); const lavaNative = Array.from( view.v_blend );
		equal( lavaNative[ 3 ] > 0, true, 'default native lava contents tint remains active' );
		equal( view.V_CalcBlend( 1, new Float32Array( 4 ) ).join(), lavaNative.join(), 'explicit native blend reproduces default output' );
		vars.Cvar_SetValue( 'gl_cshiftpercent', 0 );
		equal( view.V_CalcBlend( 0, new Float32Array( 4 ) ).join(), '0,0,0,0', 'global colour-shift disable still applies' );
		equal( Array.from( view.v_blend ).join(), lavaNative.join(), 'scratch output does not overwrite canonical native blend' );

	} finally {

		vars.Cvar_Set( 'gl_cshiftpercent', percent ); view.v_blend.set( originalBlend ); quake.v_liquid_blend.set( originalLiquidBlend );
		client.cl.cshifts.forEach( ( shift, i ) => { shift.percent = originalShifts[ i ].percent; shift.destcolor.set( originalShifts[ i ].color ); } );

	}

} );

Deno.test( 'dynamic-light proximity flashes append to both native and contents-free frame blends and reset next frame', () => {

	if ( ! vars.Cvar_FindVar( 'gl_cshiftpercent' ) ) view.V_Init();
	const percent = vars.Cvar_VariableString( 'gl_cshiftpercent' ), originalBlend = Array.from( view.v_blend );
	const originalLiquidBlend = Array.from( quake.v_liquid_blend );
	const originalShifts = client.cl.cshifts.map( shift => ( { percent: shift.percent, color: Array.from( shift.destcolor ) } ) );
	const near = ( actual, expected, label ) => {

		if ( ! Number.isFinite( actual ) || Math.abs( actual - expected ) > 1e-6 ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

	};
	try {

		vars.Cvar_SetValue( 'gl_cshiftpercent', 100 );
		for ( const shift of client.cl.cshifts ) shift.percent = 0;
		view.V_SetContentsColor( - 3 ); view.V_CalcBlend();
		const nativeBase = Array.from( view.v_blend );
		equal( quake.v_liquid_blend.join(), '0,0,0,0', 'contents-only native tint leaves optical buffer empty' );
		light.AddLightBlend( 1, .5, 0, .03 ); // existing inside-dlight screen contribution
		const nativeAlpha = nativeBase[ 3 ] + .03 * ( 1 - nativeBase[ 3 ] ), fraction = .03 / nativeAlpha;
		for ( let c = 0; c < 3; c ++ ) {

			const colour = [ 1, .5, 0 ][ c ];
			near( view.v_blend[ c ], nativeBase[ c ] * ( 1 - fraction ) + colour * fraction, 'native contents and proximity colour composition retained' );
			near( quake.v_liquid_blend[ c ], colour, 'optical buffer retains authored proximity colour' );

		}
		near( view.v_blend[ 3 ], nativeAlpha, 'native alpha retains contents plus dynamic contribution' );
		near( quake.v_liquid_blend[ 3 ], .03, 'dynamic proximity flash survives without contents tint' );
		const nativeAfter = view.v_blend.join(), liquidAfter = quake.v_liquid_blend.join();
		view.V_CalcBlend( 0, new Float32Array( 4 ) );
		equal( view.v_blend.join(), nativeAfter, 'scratch query does not erase native frame additions' );
		equal( quake.v_liquid_blend.join(), liquidAfter, 'scratch query does not erase optical frame additions' );
		view.V_CalcBlend();
		equal( view.v_blend.join(), nativeBase.join(), 'new frame restores native contents baseline' );
		equal( quake.v_liquid_blend.join(), '0,0,0,0', 'new frame clears expired optical proximity contribution' );
		client.cl.cshifts[ client.CSHIFT_DAMAGE ].destcolor.set( [ 220, 50, 50 ] );
		client.cl.cshifts[ client.CSHIFT_DAMAGE ].percent = 96; view.V_CalcBlend();
		light.AddLightBlend( 1, .5, 0, .03 );
		near( quake.v_liquid_blend[ 3 ], 96 / 255 + .03 * ( 1 - 96 / 255 ), 'damage plus proximity retains full native flash alpha' );
		equal( client.cl.cshifts[ client.CSHIFT_DAMAGE ].percent, 96, 'dynamic composition does not alter gameplay colour-shift state' );

	} finally {

		vars.Cvar_Set( 'gl_cshiftpercent', percent ); view.v_blend.set( originalBlend ); quake.v_liquid_blend.set( originalLiquidBlend );
		client.cl.cshifts.forEach( ( shift, i ) => { shift.percent = originalShifts[ i ].percent; shift.destcolor.set( originalShifts[ i ].color ); } );

	}

} );
