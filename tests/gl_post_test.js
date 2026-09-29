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
	assertEqual( post.R_GlowBoostForTexture( '*lava1' ) > 1, true, 'lava is boosted' );
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
