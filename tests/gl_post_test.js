// Bootstrap the renderer's existing circular module graph in its safe order.
await import( '../src/gl_rsurf.js' );

const post = await import( '../src/gl_post.js' );

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function makeModel( entities, surfaces = [] ) {

	const leaf = { contents: - 1, visframe: 0 };

	return {
		entities,
		surfaces,
		firstmodelsurface: 0,
		nummodelsurfaces: surfaces.length,
		nodes: [ leaf ],
		leafs: [ { contents: - 2 }, leaf ],
		numleafs: 1
	};

}

function makeSurface( name, x, fullbrightTexture ) {

	const verts = [
		[ x, - 64, 0, 0, 0 ], [ x, 64, 0, 1, 0 ],
		[ x, 64, 128, 1, 1 ], [ x, - 64, 128, 0, 1 ]
	];

	return {
		flags: 0,
		plane: { normal: new Float32Array( [ 1, 0, 0 ] ), dist: x },
		texinfo: { texture: { name, gl_texture: fullbrightTexture } },
		polys: { numverts: 4, verts, next: null }
	};

}

Deno.test( 'the classic lighting is the default', () => {

	assertEqual( post.r_hdr.value, 0, 'r_hdr default' );
	assertEqual( post.R_PostActive(), false, 'glow inactive by default' );

} );

Deno.test( 'light entities become volumetric lights', () => {

	const lights = post.R_BuildWorldLights( makeModel( `
{
"classname" "worldspawn"
}
{
"classname" "light"
"origin" "100 200 300"
"light" "600"
}
{
"classname" "light_torch_small_walltorch"
"origin" "0 0 64"
}
{
"classname" "info_player_start"
"origin" "1 2 3"
}
` ) );

	assertEqual( lights.length, 2, 'only light entities count' );
	assertEqual( lights[ 0 ].power, 2, 'light 600 is twice the default' );
	assertEqual( lights[ 1 ].power, 1, 'default light is 300' );
	assertEqual( lights[ 1 ].color[ 2 ] < 0.3, true, 'torches are warm orange' );

} );

Deno.test( 'emissive textures and lava emit light', () => {

	const glowing = { _fullbright: { image: { data: new Uint8Array( [ 255, 128, 0, 255, 0, 0, 0, 0 ] ) } } };

	const lights = post.R_BuildWorldLights( makeModel( '', [
		makeSurface( 'light1_3', 100, glowing ),
		makeSurface( '*lava1', 500, {} ),
		makeSurface( '*water1', 900, {} ),
		makeSurface( 'brick', 1300, {} )
	] ) );

	assertEqual( lights.length, 2, 'panel and lava only' );
	assertEqual( lights.every( l => l.power > 0 ), true, 'positive power' );

} );

Deno.test( 'glow materials are boosted only while the pipeline is on', () => {

	const listeners = [];
	const material = {
		userData: {},
		emissive: {},
		emissiveIntensity: 1,
		addEventListener: ( type, fn ) => listeners.push( [ type, fn ] )
	};

	post.R_RegisterGlow( material, 3 );
	assertEqual( material.emissiveIntensity, 1, 'classic look keeps intensity 1' );
	assertEqual( post.R_GlowBoostForTexture( '*lava1' ) !== 1, true, 'lava is adjusted' );
	assertEqual( post.R_GlowBoostForTexture( '*water1' ), 1, 'water is not' );

} );

function makeWaterFace( name, x0, y0, z, size ) {

	const verts = [
		[ x0, y0, z, 0, 0 ], [ x0 + size, y0, z, 1, 0 ],
		[ x0 + size, y0 + size, z, 1, 1 ], [ x0, y0 + size, z, 0, 1 ]
	];

	return {
		flags: 0x10,
		plane: { normal: new Float32Array( [ 0, 0, 1 ] ), dist: z },
		texinfo: { texture: { name, gl_texture: {} } },
		polys: { numverts: 4, verts, next: null }
	};

}

Deno.test( 'adjacent water faces merge into one pool; lava and teleporters are not liquids', () => {

	post.R_BuildWorldLights( makeModel( '', [
		makeWaterFace( '*04water1', 0, 0, 100, 128 ),
		makeWaterFace( '*04water1', 128, 0, 100, 128 ),
		makeWaterFace( '*04water1', 256, 0, 100, 128 ),
		makeWaterFace( '*slime0', 1000, 0, 100, 128 ),
		makeWaterFace( '*lava1', 2000, 0, 100, 128 ),
		makeWaterFace( '*teleport', 3000, 0, 100, 128 )
	] ) );

	const regions = post.R_GetLiquidRegions();
	assertEqual( regions.length, 2, 'one water pool and one slime pool' );
	const water = regions.find( r => r.kind === 0 );
	assertEqual( water.min[ 0 ], 0, 'pool min x' );
	assertEqual( water.max[ 0 ], 384, 'pool spans all three faces' );
	assertEqual( water.z, 100, 'pool surface height' );
	assertEqual( regions.find( r => r.kind === 1 ) !== undefined, true, 'slime is a liquid' );

} );

Deno.test( 'liquids are translucent only in the HDR pipeline', () => {

	assertEqual( post.R_LiquidOpacity( '*04water1', 1 ) < 1, true, 'water is see-through' );
	assertEqual( post.R_LiquidOpacity( '*slime0', 1 ) < 1, true, 'slime is see-through' );
	assertEqual( post.R_LiquidOpacity( '*lava1', 1 ), 1, 'lava stays opaque' );
	assertEqual( post.R_LiquidOpacity( 'brick', 0.7 ), 0.7, 'other textures keep the given opacity' );

} );

Deno.test( 'sun shadow casters cover every solid surface, whatever is visible', () => {

	const solid = makeWaterFace( 'brick', 0, 0, 200, 128 ); // a ceiling slab
	const wall = makeWaterFace( 'brick', 300, 0, 200, 128 );
	solid.flags = 0;
	wall.flags = 0;
	const sky = makeWaterFace( 'sky1', 600, 0, 200, 128 );
	sky.flags = 4; // SURF_DRAWSKY
	const water = makeWaterFace( '*04water1', 900, 0, 100, 128 );

	const tris = post.R_BuildSunOccluder( makeModel( '', [ solid, wall, sky, water ] ) );

	// two quads = four triangles; sky must not block the sun, and neither does liquid
	assertEqual( tris, 4, 'only solid surfaces cast shadows' );
	assertEqual( post.R_BuildSunOccluder( makeModel( '', [ sky, water ] ) ), 0, 'nothing solid, nothing cast' );
	assertEqual( post.R_BuildSunOccluder( null ), 0, 'no map' );

} );

Deno.test( 'liquid links let you see down into a pool and out of it', () => {

	const airLeaf = { contents: - 1, visframe: 0, compressed_vis: null };
	const waterLeaf = { contents: - 3, visframe: 0, compressed_vis: null };
	const model = makeModel( '', [ makeWaterFace( '*04water1', 0, 0, 100, 128 ) ] );
	model.nodes = [ {
		contents: 0, plane: { normal: new Float32Array( [ 0, 0, 1 ] ), dist: 100 },
		children: [ airLeaf, waterLeaf ]
	} ];
	model.leafs = [ { contents: - 2 }, airLeaf, waterLeaf ];
	model.numleafs = 2;

	post.R_BuildWorldLights( model );
	const links = post.R_GetLiquidLinks();
	assertEqual( links.length, 1, 'one link for the one surface' );
	assertEqual( links[ 0 ].above, airLeaf, 'air above the surface' );
	assertEqual( links[ 0 ].below, waterLeaf, 'liquid below it' );
	assertEqual( links[ 0 ].aboveVis instanceof Uint8Array, true, 'what the air sees' );
	assertEqual( links[ 0 ].belowVis instanceof Uint8Array, true, 'what the liquid sees' );

} );

function skyLayer( size, rgb, alpha = 255 ) {

	const data = new Uint8Array( size * size * 4 );
	for ( let i = 0; i < size * size; i ++ ) data.set( [ rgb[ 0 ], rgb[ 1 ], rgb[ 2 ], alpha ], i * 4 );
	return data;

}

Deno.test( 'the sky decides how bright, what colour and how patterned the light is', () => {

	const bright = post.R_AnalyseSky( skyLayer( 8, [ 120, 120, 200 ] ), null, 8 );
	const dark = post.R_AnalyseSky( skyLayer( 8, [ 44, 24, 26 ] ), null, 8 );

	assertEqual( bright.luma > dark.luma, true, 'a bright sky measures brighter' );
	assertEqual( post.R_SkyBrightness( bright.luma ) > post.R_SkyBrightness( dark.luma ), true, 'and drives stronger light' );
	assertEqual( post.R_SkyBrightness( 0 ), 0, 'black sky is the floor' );
	assertEqual( post.R_SkyBrightness( 1 ), 1, 'white sky is the ceiling' );
	assertEqual( dark.color[ 0 ] > dark.color[ 2 ], true, 'a reddish sky tints the light red' );
	assertEqual( bright.color[ 2 ] >= bright.color[ 0 ], true, 'a blue sky tints it blue' );
	assertEqual( bright.contrast, 0, 'a uniform sky has no pattern' );

	// clouds: half the texels bright, half dark => a clear pattern with mean 1
	const patterned = skyLayer( 8, [ 40, 40, 60 ] );
	for ( let i = 0; i < 32; i ++ ) patterned.set( [ 200, 200, 220, 255 ], i * 4 );
	const cloudy = post.R_AnalyseSky( patterned, null, 8 );
	assertEqual( cloudy.contrast > 0.3, true, 'clouds give the sky a pattern' );
	let sum = 0;
	for ( let i = 0; i < 64; i ++ ) sum += cloudy.cookie[ i ];
	assertEqual( Math.abs( sum / 64 - 1 ) < 0.01, true, 'the pattern keeps the average light unchanged' );

	assertEqual( post.R_AnalyseSky( null, null, 8 ), null, 'no sky texture, no analysis' );

} );
