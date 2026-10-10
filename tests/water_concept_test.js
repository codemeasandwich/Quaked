// Real entity parsing, source selection, view-space binding and cached water
// materials. The browser trial supplies reflected-radiance/ranking pixel proof;
// this test does not inspect or duplicate shader strings.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' );
const surf = await import( '../src/engine/render/gl_rsurf.js' ), mode = await import( '../src/newer/mode.js' );
const vars = await import( '../src/engine/common/cvar.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

Deno.test( 'ordinary torch sources reach the water compositor within the existing cap and respect independent feature switches', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_water_look,
		post.r_reflect, post.r_reflect_screen, mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), priorLook = post.classicLook.value, priorClassic = mode.R_ClassicPassActive();
	const texture = new THREE.DataTexture( new Uint8Array( [ 72, 96, 40, 255 ] ), 1, 1 ), liquid = { name: '*water1', gl_texture: texture };
	const leaf = { contents: - 1, visframe: 17, compressed_vis: null }, origins = [];
	const entities = [];
	for ( let i = 0; i < post.MAX_VOLUME_LIGHTS + 4; i ++ ) {

		const origin = [ i * 12 - 60, 160 + i * 3, 64 ]; origins.push( origin );
		entities.push( `{ "classname" "light_torch_small_walltorch" "origin" "${origin.join( ' ' )}" "light" "300" "style" "1" "_color" "1 0.5 0.2" }` );

	}
	const model = { entities: entities.join( '\n' ), firstmodelsurface: 0, nummodelsurfaces: 1, numleafs: 1,
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ],
		surfaces: [ { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: liquid },
			polys: { numverts: 4, verts: [ [ - 128, - 128, 0, 0, 0 ], [ 128, - 128, 0, 1, 0 ],
				[ 128, 128, 0, 1, 1 ], [ - 128, 128, 0, 0, 1 ] ], next: null } } ] };
	let target = null, uniforms = null, draws = 0;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		getRenderTarget: () => target, setRenderTarget: next => { target = next; }, setViewport() {},
		render( scene ) { draws ++; uniforms = scene.children[ 0 ].material.uniforms; } };
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.up.set( 0, 0, 1 );
	camera.position.set( 0, - 160, 48 ); camera.lookAt( 0, 64, 0 ); camera.updateMatrixWorld();
	const styles = new Array( 64 ).fill( 264 );
	function frame() {

		draws = 0; const active = post.R_PostBegin( renderer, true, 320, 200 );
		if ( active ) post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 17, styles, [], 1, 1, false );
		return surf.R_LiquidSurfaceMaterial( liquid, .75 );

	}
	try {

		post.classicLook.value = 0; mode.R_AnimSetClassicPass( false ); post.R_PostSetUnderwater( false );
		for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_water_look' ] ) vars.Cvar_SetValue( name, 0 );
		vars.Cvar_SetValue( 'r_reflect', .6 );
		equal( post.R_BuildWorldLights( model ).length, origins.length, 'actual entity lump builds ordinary torch sources' );
		const material = frame(); equal( draws, 1, 'existing fixed-resolution composite path retained' );
		equal( uniforms.uLighting.value, 1, 'ordinary deferred lighting active' );
		equal( uniforms.uCount.value, post.MAX_VOLUME_LIGHTS, 'compositor preserves existing selected-source cap' );
		equal( uniforms.uWaterCount.value, 1, 'real pool optics active alongside ordinary sources' );
		equal( uniforms.uReflect.value, .6, 'real default reflection preference retained' );
		equal( material.map, texture, 'original water map retained' );
		equal( material.opacity > 0 && material.opacity <= .06, true, 'original yellow painted coverage is now subdued for Clear' );
		for ( let i = 0; i < uniforms.uCount.value; i ++ ) {

			const p = uniforms.uLightPos.value[ i ], color = uniforms.uLightCol.value[ i ];
			const world = new THREE.Vector3( p.x, p.y, p.z ).applyMatrix4( camera.matrixWorld );
			equal( origins.some( o => world.distanceTo( new THREE.Vector3( ...o ) ) < 1e-5 ), true, 'selected position corresponds to an actual torch in view space' );
			equal( color.x > color.y && color.y > color.z && color.z > 0, true, 'authored warm source colour reaches compositor' );
			equal( color.w > 0, true, 'bounded source range supplied' );

		}
		styles[ 1 ] = 0; equal( frame(), material, 'source state change keeps water material cached' );
		equal( uniforms.uCount.value, 0, 'switched-off real torches supply no fabricated radiance' );
		equal( uniforms.uReflect.value, .6, 'source state does not disable environmental reflection' );
		styles[ 1 ] = 264; vars.Cvar_SetValue( 'r_newer_normals', 0 ); frame();
		equal( uniforms.uCount.value, post.MAX_VOLUME_LIGHTS, 'normal-map off preserves ordinary lighting sources' );
		equal( post.R_WaterActive(), true, 'normal-map off preserves analytic water optics' );
		vars.Cvar_SetValue( 'r_newer_lighting', 0 ); equal( frame(), material, 'lighting off retains authored water material' );
		equal( uniforms.uCount.value, 0, 'lighting off binds no ordinary relighting sources' ); equal( uniforms.uLighting.value, 0, 'lighting guard reaches shader' );
		equal( uniforms.uWaterCount.value, 1, 'independent liquids remain active' );
		vars.Cvar_SetValue( 'r_newer_lighting', 1 ); vars.Cvar_SetValue( 'r_water_look', 2 ); equal( frame(), material, 'Tinted reuses existing water material' );
		equal( material.opacity > .05 && material.opacity <= .08, true, 'Tinted retains subtle paint without returning the old dominant layer' );
		equal( uniforms.uCount.value, post.MAX_VOLUME_LIGHTS, 'lighting restoration rebinds ordinary sources' );
		vars.Cvar_SetValue( 'r_reflect_screen', 0 ); frame(); equal( uniforms.uScreenReflect.value, 0, 'SSR-off preference remains independent' );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); const native = frame();
		equal( uniforms.uWaterCount.value, 0, 'liquids-off removes reflected-receiver optics' ); equal( native.opacity, .75, 'native opacity preserved' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); frame(); post.classicLook.value = 1; mode.R_AnimSetClassicPass( true );
		equal( post.R_WaterActive(), false, 'classic scope excludes enhanced concept optics' );
		equal( surf.R_LiquidSurfaceMaterial( liquid, .75 ), native, 'classic scope preserves original cached surface' );
		post.classicLook.value = 0; mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 0 );
		equal( frame(), native, 'New Game preserves native water despite ordinary light entities' ); equal( draws, 0, 'New Game skips deferred composite' );

	} finally {

		post.classicLook.value = priorLook; mode.R_AnimSetClassicPass( priorClassic ); post.R_PostSetUnderwater( false );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); texture.dispose();

	}

} );

Deno.test( 'brown stock water uses a Muddy map default while explicit looks and native paths preserve map identity', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_water_look, post.r_mist,
		mode.r_newer_lighting, mode.r_newer_normals, mode.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), priorLook = post.classicLook.value, priorClassic = mode.R_ClassicPassActive();
	const names = [ '*water1', '*04water1', '*slime0', '*lava1' ];
	const textures = names.map( name => ( { name, gl_texture: new THREE.DataTexture( new Uint8Array( [ 80, 64, 32, 255 ] ), 1, 1 ) } ) );
	const xs = [ - 128, 0, 400, 700 ], leaf = { contents: - 1, visframe: 0, compressed_vis: null };
	const surfaces = textures.map( ( texture, i ) => ( { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture },
		polys: { numverts: 4, verts: [ [ xs[ i ], 0, 0, 0, 0 ], [ xs[ i ] + 128, 0, 0, 1, 0 ],
			[ xs[ i ] + 128, 128, 0, 1, 1 ], [ xs[ i ], 128, 0, 0, 1 ] ], next: null } } ) );
	const model = { entities: '', firstmodelsurface: 0, nummodelsurfaces: 4, numleafs: 1,
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], surfaces };
	let uniforms = null;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, setRenderTarget() {}, setViewport() {},
		render: scene => { uniforms = scene.children[ 0 ].material.uniforms; } };
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.up.set( 0, 0, 1 );
	camera.position.set( 0, - 160, 48 ); camera.lookAt( 0, 64, 0 ); camera.updateMatrixWorld();
	function frame() {

		if ( post.R_PostBegin( renderer, true, 320, 200 ) )
			post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false );

	}
	try {

		post.classicLook.value = 0; mode.R_AnimSetClassicPass( false ); post.R_PostSetUnderwater( false );
		for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
		for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_newer_lighting', 'r_water_look' ] ) vars.Cvar_SetValue( name, 0 );
		post.R_BuildWorldLights( model ); frame(); const regions = post.R_GetLiquidRegions();
		equal( regions.length, 3, 'adjacent Clear and Muddy map defaults are not incorrectly merged' );
		const clearRegion = regions.find( r => r.min[ 0 ] === - 128 ), brownRegion = regions.find( r => r.min[ 0 ] === 0 );
		equal( clearRegion.kind, 0, 'ordinary Clear pool remains physical water' ); equal( brownRegion.kind, 0, 'brown pool remains ordinary water, not damaging slime' );
		equal( clearRegion.mapLook, 0, 'ordinary map water defaults to Clear' ); equal( brownRegion.mapLook, 2, 'stock brown texture authors a Muddy map default' );
		equal( post.R_GetLavaRegions().length, 1, 'lava retains separate opaque handling' );
		const clear = surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ), brown = surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 );
		equal( clear.opacity, post.LIQUID_LOOKS[ 0 ].opacity, 'Map chooses Clear material coverage for normal water' );
		equal( brown.opacity, post.LIQUID_LOOKS[ 2 ].opacity, 'Map chooses Muddy material coverage for brown water' );
		equal( post.R_LiquidOpacity( '*04WATER1', .75 ), brown.opacity, 'stock name policy is case insensitive' );
		// Episode 3's murky water (*04mwat1/2) is water: Muddy coverage, and the surface takes the level's baked brightness (vertex colours)
		// as every Newer water does; a lava or teleporter surface does not. (Each needs its own texture: the material cache is keyed by it.)
		const fresh = name => ( { name, gl_texture: new THREE.DataTexture( new Uint8Array( [ 80, 64, 32, 255 ] ), 1, 1 ) } );
		for ( const name of [ '*04mwat1', '*04mwat2', '*water2', '*04awater1' ] ) equal( surf.R_LiquidSurfaceMaterial( fresh( name ), .75 ).vertexColors, true, name + ' surface uses baked brightness like other Newer water' );
		for ( const name of [ '*lava1', '*teleport', '*slime0' ] ) equal( surf.R_LiquidSurfaceMaterial( fresh( name ), .75 ).vertexColors, false, name + ' is not clear water' );
		equal( surf.R_LiquidSurfaceMaterial( fresh( '*04mwat2' ), .75 ).opacity, post.LIQUID_LOOKS[ 2 ].opacity, 'murky water has the Muddy coverage' );
		for ( const choice of [ 0, 1, 2, 4, 0 ] ) {

			vars.Cvar_SetValue( 'r_water_look', choice ); frame(); const ids = new Map();
			for ( let i = 0; i < uniforms.uWaterCount.value; i ++ ) ids.set( uniforms.uWaterMin.value[ i ].x, uniforms.uWaterMax.value[ i ].w );
			equal( ids.get( - 128 ), choice === 0 ? 0 : choice - 1, 'normal pool profile matches selected/default policy' );
			equal( ids.get( 0 ), choice === 0 ? 2 : choice - 1, 'brown pool profile matches selected/default policy' );
			equal( ids.get( 400 ), 3, 'native slime hazard appearance stays Toxic under overrides' );
			equal( post.R_GetLiquidRegions(), regions, 'appearance override does not rebuild or reclassify map regions' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ), brown, 'brown water material cache retained' );
			equal( brown.opacity, post.LIQUID_LOOKS[ choice === 0 ? 2 : choice - 1 ].opacity, 'brown material follows same policy as uploaded profile id' );
			equal( brown.map, textures[ 1 ].gl_texture, 'original brown texture is retained' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 0 ], .75 ), clear, 'normal water material cache retained' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 3 ], 1 ).opacity, 1, 'lava remains opaque under every water choice' );

		}
		for ( const amount of [ 0, .6, 1.5 ] ) {

			vars.Cvar_SetValue( 'r_mist', amount ); frame();
			equal( uniforms.uMist.value, amount, 'existing surface-mist control reaches the Muddy optical compositor' );
			equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ), brown, 'surface haze control keeps original brown material cached' );
			equal( brown.map, textures[ 1 ].gl_texture, 'surface haze does not replace authored brown water' );
			equal( post.R_GetLiquidRegions(), regions, 'surface haze leaves map regions and contents unchanged' );

		}
		vars.Cvar_SetValue( 'r_newer_water', 0 ); frame(); const native = surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 );
		equal( uniforms.uWaterCount.value, 0, 'liquids-off excludes map-default optics' ); equal( native.opacity, .75, 'native brown opacity preserved' );
		equal( native.vertexColors, false, 'native brown surface ignores enhanced brightness' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); frame(); post.classicLook.value = 1; mode.R_AnimSetClassicPass( true );
		equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ), native, 'classic scope selects native brown material' );
		post.classicLook.value = 0; mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 0 ); frame();
		equal( surf.R_LiquidSurfaceMaterial( textures[ 1 ], .75 ), native, 'New Game ignores enhanced map defaults' );

	} finally {

		post.classicLook.value = priorLook; mode.R_AnimSetClassicPass( priorClassic ); post.R_PostSetUnderwater( false );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) );
		for ( const texture of textures ) texture.gl_texture.dispose();

	}

} );
