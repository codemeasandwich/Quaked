// Real Three.js points/attributes through the public mist-frame interface.
// Only the canvas backing the soft sprite is stubbed in the non-browser runner.
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' ), post = await import( '../src/newer/render/gl_post.js' );
const anim = await import( '../src/newer/render/r_anim.js' ), vars = await import( '../src/engine/common/cvar.js' );
const mist = await import( '../src/newer/render/r_mist.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: expected ${expected}, got ${actual}` );

}

function fixture( names ) {

	const leaf = { contents: - 1, visframe: 0, compressed_vis: null };
	return { entities: '', firstmodelsurface: 0, nummodelsurfaces: names.length, numleafs: 1,
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ],
		surfaces: names.map( ( name, i ) => {

			const x = i * 1400;
			return { flags: 0, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name } },
				polys: { numverts: 4, verts: [ [ x, 0, 0, 0, 0 ], [ x + 1024, 0, 0, 1, 0 ],
					[ x + 1024, 1024, 0, 1, 1 ], [ x, 1024, 0, 0, 1 ] ], next: null } };

		} ) };

}

function setup() {

	const options = [ post.r_hdr, post.r_dynres, post.r_mist, post.r_water_look,
		anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
	for ( const v of options ) if ( ! vars.Cvar_FindVar( v.name ) ) vars.Cvar_RegisterVariable( v );
	const saved = options.map( v => v.string ), priorLook = post.classicLook.value, priorClassic = anim.R_ClassicPassActive();
	const originalDocument = globalThis.document, random = Math.random; let seed = 19371;
	Math.random = () => { seed = ( Math.imul( seed, 1664525 ) + 1013904223 ) >>> 0; return seed / 4294967296; };
	if ( typeof document === 'undefined' ) globalThis.document = {
		createElement( tag ) {

			equal( tag, 'canvas', 'only sprite canvas is requested' );
			return { width: 0, height: 0, getContext: () => ( {
				createRadialGradient: () => ( { addColorStop() {} } ), fillRect() {}, fillStyle: ''
			} ) };

		}
	};
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true } };
	function begin() { post.R_PostBegin( renderer, true, 320, 200 ); }
	post.classicLook.value = 0; anim.R_AnimSetClassicPass( false ); mist.R_MistClear();
	for ( const v of options ) vars.Cvar_SetValue( v.name, 1 );
	for ( const name of [ 'r_dynres', 'r_newer_lighting', 'r_newer_normals', 'r_water_look' ] ) vars.Cvar_SetValue( name, 0 );
	vars.Cvar_SetValue( 'r_mist', .6 ); begin();
	return { begin, restore() {

		mist.R_MistClear(); post.classicLook.value = priorLook; anim.R_AnimSetClassicPass( priorClassic );
		post.R_PostBegin( renderer, false, 0, 0 ); post.R_PostShutdown(); post.R_BuildWorldLights( null );
		options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); Math.random = random;
		if ( originalDocument === undefined ) delete globalThis.document; else globalThis.document = originalDocument;

	} };

}

Deno.test( 'toxic vapour forms small slow anchored streams within the shared particle budget and reuses its geometry', () => {

	const run = setup(), scene = new THREE.Scene();
	try {

		post.R_BuildWorldLights( fixture( new Array( 8 ).fill( '*water1' ) ) );
		vars.Cvar_SetValue( 'r_water_look', 4 ); run.begin(); mist.R_MistFrame( scene, 0 );
		const clouds = scene.children.filter( o => o.userData.liquidToxicMist ); equal( clouds.length, 1, 'all pools share a single points object' );
		const cloud = clouds[ 0 ], geometry = cloud.geometry, material = cloud.material;
		equal( cloud.isPoints, true, 'real Three.js point renderer used' );
		equal( material.size > 0 && material.size <= 64, true, 'sprites remain small rather than the former broad cloud' );
		const position = geometry.getAttribute( 'position' ), colour = geometry.getAttribute( 'color' );
		equal( position.count > 0 && position.count <= 720, true, 'shared effects retain their global bounded budget' );
		const pools = post.R_GetLiquidRegions(), perPool = new Map();
		let verticalNeighbours = 0;
		for ( let i = 0; i < position.count; i ++ ) {

			const x = position.getX( i ), y = position.getY( i ), z = position.getZ( i );
			const pool = pools.find( r => x > r.min[ 0 ] && x < r.max[ 0 ] && y > r.min[ 1 ] && y < r.max[ 1 ] );
			equal( pool != null, true, 'stream anchors and gentle sway stay within their pool' );
			perPool.set( pool, ( perPool.get( pool ) || 0 ) + 1 );
			equal( z > pool.z && z < pool.z + 120, true, 'vapour stays close above the surface' );
			let neighbour = false;
			for ( let j = 0; j < position.count && ! neighbour; j ++ ) {

				if ( i === j ) continue;
				const horizontal = Math.hypot( x - position.getX( j ), y - position.getY( j ) ), vertical = Math.abs( z - position.getZ( j ) );
				neighbour = horizontal < 12 && vertical > 10 && vertical < 100;

			}
			if ( neighbour ) verticalNeighbours ++;

		}
		equal( [ ...perPool.values() ].every( n => n <= 128 ), true, 'one large pool cannot become an oversized dense cloud' );
		equal( verticalNeighbours > position.count * .9, true, 'wisps visibly arrange into narrow vertical columns' );
		const positions = position.array, colours = colour.array, before = positions.slice(), beforeColours = colours.slice();
		mist.R_MistFrame( scene, .25 );
		equal( cloud.geometry, geometry, 'moving streams reuse geometry' ); equal( cloud.material, material, 'moving streams reuse material' );
		equal( position.array, positions, 'position buffer reused' ); equal( colour.array, colours, 'colour buffer reused' );
		let rising = 0;
		for ( let i = 0; i < position.count; i ++ ) {

			const p = i * 3, dz = positions[ p + 2 ] - before[ p + 2 ];
			if ( dz >= 0 ) {

				rising ++; equal( dz > 0 && dz < 2, true, 'stream rises slowly rather than racing upward' );
				equal( Math.hypot( positions[ p ] - before[ p ], positions[ p + 1 ] - before[ p + 1 ] ) < 4, true, 'visible quarter-second lateral drift remains gentle' );

			}
			else equal( Math.max( ...beforeColours.slice( p, p + 3 ), ...colours.slice( p, p + 3 ) ) < .001, true, 'wrapping wisp fades before respawning' );

		}
		equal( rising > position.count * .8, true, 'visible flow predominantly rises' );
		equal( Math.max( ...colours ) < .035, true, 'default vapour contribution remains subtle' );
		const identical = positions.slice(); mist.R_MistFrame( scene, .25 ); equal( positions.join(), identical.join(), 'same time does not jitter stream anchors' );

	} finally { run.restore(); }

} );

Deno.test( 'vapour follows Toxic appearance and native slime while respecting slider, classic and liquids-off gates', () => {

	const run = setup(), scene = new THREE.Scene();
	try {

		post.R_BuildWorldLights( fixture( [ '*water1', '*04water1' ] ) ); mist.R_MistFrame( scene, 0 );
		equal( scene.children.length, 0, 'Map Clear and Muddy do not acquire Toxic wisps' );
		vars.Cvar_SetValue( 'r_water_look', 4 ); run.begin(); mist.R_MistFrame( scene, 0 );
		const cloud = scene.children[ 0 ], geometry = cloud.geometry; equal( cloud.visible, true, 'ordinary water can preview Toxic optical vapour' );
		vars.Cvar_SetValue( 'r_mist', 0 ); mist.R_MistFrame( scene, 1 ); equal( cloud.visible, false, 'zero slider hides the effect' );
		vars.Cvar_SetValue( 'r_mist', .6 ); mist.R_MistFrame( scene, 1 ); equal( scene.children[ 0 ], cloud, 'slider restoration keeps cached streams' );
		equal( cloud.geometry, geometry, 'slider restoration retains buffers' );
		vars.Cvar_SetValue( 'r_newer_water', 0 ); run.begin(); mist.R_MistFrame( scene, 2 ); equal( cloud.visible, false, 'liquids-off hides streams' );
		vars.Cvar_SetValue( 'r_newer_water', 1 ); run.begin(); mist.R_MistFrame( scene, 2 ); equal( cloud.visible, true, 'liquids restoration resumes streams' );
		post.classicLook.value = 1; anim.R_AnimSetClassicPass( true ); mist.R_MistFrame( scene, 3 ); equal( cloud.visible, false, 'classic scope hides enhanced vapour' );
		post.classicLook.value = 0; anim.R_AnimSetClassicPass( false ); mist.R_MistFrame( scene, 3 ); equal( cloud.visible, true, 'leaving classic resumes the same streams' );
		vars.Cvar_SetValue( 'r_hdr', 0 ); run.begin(); mist.R_MistFrame( scene, 4 ); equal( cloud.visible, false, 'New Game remains free of enhanced vapour' );
		vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'r_water_look', 3 ); run.begin(); mist.R_MistFrame( scene, 4 );
		equal( scene.children.length, 0, 'Muddy selection disposes Toxic particles instead of recolouring them as sediment' );
		post.R_BuildWorldLights( fixture( [ '*slime0', '*04water1' ] ) );
		vars.Cvar_SetValue( 'r_water_look', 1 ); run.begin(); mist.R_MistFrame( scene, 5 );
		equal( scene.children.length, 1, 'native slime remains optically Toxic despite Clear water override' );
		const nativeStreams = scene.children[ 0 ], p = nativeStreams.geometry.getAttribute( 'position' );
		for ( let i = 0; i < p.count; i ++ ) equal( p.getX( i ) > 0 && p.getX( i ) < 1024, true, 'only the native slime pool emits vapour' );
		equal( post.R_GetLiquidRegions().map( r => r.kind ).join(), '1,0', 'optical streams do not alter liquid physical kinds' );

	} finally { run.restore(); }

} );
