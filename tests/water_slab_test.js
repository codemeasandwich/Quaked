// Finite liquid bounds through the public map builder and composite frame.
// Synthetic BSP leaves describe real AIR/liquid/AIR interfaces; source faces
// and visibility links remain available even when only one optical volume is made.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const post = await import( '../src/newer/render/gl_post.js' );
const mode = await import( '../src/newer/mode.js' );
const cvar = await import( '../src/engine/common/cvar.js' );
const { Mod_PointInLeaf } = await import( '../src/engine/render/gl_model.js' );
function equal( actual, expected, label ) {
	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );
}
const air = () => ( { contents: - 1, visframe: 0, compressed_vis: null } );
function face( x0, x1, z, name ) {
	return { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: z }, texinfo: { texture: { name } },
		polys: { numverts: 4, verts: [ [ x0, - 64, z, 0, 0 ], [ x1, - 64, z, 1, 0 ], [ x1, 64, z, 1, 1 ], [ x0, 64, z, 0, 1 ] ], next: null } };
}
function column( kind, bottom ) {
	const above = air(), below = air(), wet = { contents: kind ? - 4 : - 3, visframe: 0, compressed_vis: null };
	const lower = bottom === null ? wet : { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: bottom }, children: [ wet, below ] };
	return { above, below, wet, root: { contents: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, children: [ above, lower ] } };
}
function modelFor( kind, bottom, splitBottom = null ) {
	const a = column( kind, bottom ), name = kind ? '*slime0' : '*water1';
	let nodes = [ a.root ], leaves = [ a.above, a.wet, a.below ], surfaces = [ face( - 128, 128, 0, name ) ];
	if ( bottom !== null ) surfaces.push( face( - 128, 128, bottom, name ) );
	if ( splitBottom !== null ) {
		const b = column( kind, splitBottom );
		nodes = [ { contents: 0, plane: { normal: [ 1, 0, 0 ], dist: 0 }, children: [ b.root, a.root ] } ];
		leaves = leaves.concat( [ b.above, b.wet, b.below ] );
		surfaces = [ face( - 128, - 1, 0, name ), face( - 128, - 1, bottom, name ), face( 1, 128, 0, name ), face( 1, 128, splitBottom, name ) ];
	}
	return { entities: '', firstmodelsurface: 0, nummodelsurfaces: surfaces.length, surfaces, nodes,
		leafs: [ { contents: - 2 }, ...leaves ], numleafs: leaves.length };
}
function withFrame( run ) {
	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, post.r_reflect, post.r_water_look, mode.r_newer_water, mode.r_newer_lighting ];
	for ( const v of options ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), classic = post.classicLook.value;
	let target = null, uniforms = null;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true },
		getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {},
		render( scene ) { uniforms = scene.children[ 0 ].material.uniforms; } };
	const camera = new THREE.PerspectiveCamera( 80, 1.6, 4, 4096 ); camera.position.set( 0, 0, 80 ); camera.lookAt( 0, 0, - 64 ); camera.updateMatrixWorld();
	try {
		post.classicLook.value = 0;
		for ( const v of options ) cvar.Cvar_SetValue( v.name, 0 );
		cvar.Cvar_SetValue( 'r_hdr', 1 ); cvar.Cvar_SetValue( 'r_newer_water', 1 );
		post.R_PostBegin( renderer, true, 320, 200 );
		run( () => { post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 1, 1, false ); return uniforms; } );
	} finally {
		post.R_BuildWorldLights( null ); post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown();
		post.classicLook.value = classic; options.forEach( ( v, i ) => cvar.Cvar_Set( v.name, saved[ i ] ) );
	}
}
for ( const kind of [ 0, 1 ] ) {
	const name = kind ? 'slime' : 'water';
	Deno.test( `${name}: suspended slab has one optical volume and both original visibility links`, () => withFrame( frame => {
		const model = modelFor( kind, - 32 ), source = JSON.stringify( model.surfaces );
		equal( Mod_PointInLeaf( [ 0, 0, - 16 ], model ).contents, kind ? - 4 : - 3, 'fixture interior is liquid' );
		equal( Mod_PointInLeaf( [ 0, 0, - 48 ], model ).contents, - 1, 'fixture below slab is dry air' );
		post.R_BuildWorldLights( model ); const regions = post.R_GetLiquidRegions(), links = post.R_GetLiquidLinks();
		equal( regions.length, 1, 'underside is a boundary, not a second downward optical column' );
		equal( regions[ 0 ].z, 0, 'top retained' ); equal( regions[ 0 ].bottom, - 32, 'real underside bounds absorption' );
		equal( regions[ 0 ].kind, kind, 'physical contents kind retained' );
		equal( links.length, 2, 'top and underside retain visibility links' );
		equal( links.some( l => l.above.contents === - 1 && l.below.contents === ( kind ? - 4 : - 3 ) ), true, 'top air-to-liquid link retained' );
		equal( links.some( l => l.below.contents === - 1 && l.above.contents === ( kind ? - 4 : - 3 ) ), true, 'underside liquid-to-air link retained' );
		const originalLinks = links.slice();
		for ( const choice of [ 0, 1, 2, 3, 4 ] ) {
			cvar.Cvar_SetValue( 'r_water_look', choice ); const uniforms = frame();
			equal( uniforms.uWaterCount.value, 1, 'one finite region reaches shader' );
			equal( uniforms.uWaterMax.value[ 0 ].z, - 32, 'physical bottom reaches existing uniform slot' );
			equal( uniforms.uWaterMin.value[ 0 ].w, kind, 'appearance never changes water/slime contents' );
			equal( post.R_GetLiquidLinks(), links, 'rendering does not replace visibility links' );
			originalLinks.forEach( ( link, i ) => equal( links[ i ], link, 'original link object retained' ) );
		}
		equal( JSON.stringify( model.surfaces ), source, 'source geometry and texture identities unchanged' );
	} ) );
	Deno.test( `${name}: ordinary pool retains established lower-bound fallback`, () => withFrame( frame => {
		post.R_BuildWorldLights( modelFor( kind, null ) );
		const regions = post.R_GetLiquidRegions(); equal( regions.length, 1, 'ordinary pool retained' );
		equal( frame().uWaterMax.value[ 0 ].z, - 900, 'no invented air boundary in ordinary deep pool' );
	} ) );
	Deno.test( `${name}: adjacent suspended slabs with different bottoms remain distinct`, () => withFrame( frame => {
		post.R_BuildWorldLights( modelFor( kind, - 32, - 64 ) ); const regions = post.R_GetLiquidRegions();
		equal( regions.length, 2, 'nearby top faces with unequal bottoms do not merge' );
		equal( regions.map( r => r.bottom ).sort( ( a, b ) => a - b ).join( ',' ), '-64,-32', 'both physical lower bounds retained' );
		equal( frame().uWaterCount.value, 2, 'both separate slabs reach compositor' );
	} ) );
}

// (owner, 13 Oct 2026: the Muddy look is no longer anyone's default; the same water elsewhere is Clear)
Deno.test( 'E1M2 appearance follows map context without leaking into swamp water or physical slime', () => withFrame( frame => {
	for ( const [ map, expected ] of [ [ 'maps/e1m2.bsp', 1 ], [ 'maps/e1m3.bsp', 0 ], [ 'maps/e1m2.bsp', 1 ], [ 'maps/e3m3.bsp', 0 ], [ '', 0 ] ] ) {
		const model = modelFor( 0, null ); model.name = map; model.surfaces[ 0 ].texinfo.texture.name = '*04water1';
		cvar.Cvar_SetValue( 'r_water_look', 0 ); post.R_BuildWorldLights( model );
		equal( post.R_GetLiquidRegions()[ 0 ].mapLook, expected, map + ' retains contextual authored look' );
		equal( frame().uWaterMax.value[ 0 ].w, expected, map + ' region look reaches shader' );
		equal( post.R_LiquidOpacity( '*04water1', .75 ), post.LIQUID_LOOKS[ expected ].opacity, map + ' original surface opacity agrees with shader profile' );
		for ( const choice of [ 1, 2, 3, 4 ] ) {
			cvar.Cvar_SetValue( 'r_water_look', choice );
			equal( frame().uWaterMax.value[ 0 ].w, choice - 1, 'explicit appearance overrides map context' );
			equal( post.R_LiquidOpacity( '*04water1', .75 ), post.LIQUID_LOOKS[ choice - 1 ].opacity, 'explicit appearance controls original surface too' );
			equal( post.R_GetLiquidRegions()[ 0 ].kind, 0, 'water never becomes damaging slime through presentation' );
		}
	}
	for ( const map of [ 'maps/e1m2.bsp', 'maps/e1m3.bsp' ] ) {
		const slime = modelFor( 1, null ); slime.name = map; cvar.Cvar_SetValue( 'r_water_look', 0 ); post.R_BuildWorldLights( slime );
		equal( post.R_GetLiquidRegions()[ 0 ].kind, 1, 'slime retains physical kind after each map load' );
		equal( frame().uWaterMax.value[ 0 ].w, 3, 'map choice retains Toxic appearance on actual slime' );
		equal( post.R_LiquidOpacity( '*slime0', .75 ), post.LIQUID_LOOKS[ 3 ].opacity, 'actual slime surface remains Toxic' );
	}
} ) );
