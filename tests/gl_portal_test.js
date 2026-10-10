// Bootstrap the renderer's existing circular module graph in its safe order.
await import( '../src/engine/render/gl_rsurf.js' );

const portal = await import( '../src/newer/render/gl_portal.js' );

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertNear( actual, expected, message ) {

	if ( Math.abs( actual - expected ) > 1e-3 )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

function assertVecNear( actual, expected, message ) {

	for ( let i = 0; i < 3; i ++ )
		assertNear( actual[ i ], expected[ i ], `${message}[${i}]` );

}

// A doorway in the plane x = 100 facing +X, spanning y -32..32 and z 0..112
function makeSurface( name, x, facing ) {

	const verts = [
		[ x, - 32, 0, 0, 0 ], [ x, 32, 0, 1, 0 ],
		[ x, 32, 112, 1, 1 ], [ x, - 32, 112, 0, 1 ]
	];

	return {
		flags: 0x10 | ( facing < 0 ? 2 : 0 ),
		plane: { normal: new Float32Array( [ 1, 0, 0 ] ), dist: x },
		texinfo: { texture: { name } },
		polys: { numverts: 4, verts, next: null }
	};

}

function makeModel( surfaces, entities ) {

	const leaf = { contents: - 1, visframe: 0, firstmarksurface: null, nummarksurfaces: 0, compressed_vis: null };

	return {
		entities,
		surfaces,
		firstmodelsurface: 0,
		nummodelsurfaces: surfaces.length,
		submodels: [
			{ mins: [ - 4096, - 4096, - 4096 ], maxs: [ 4096, 4096, 4096 ] },
			{ mins: [ 90, - 40, - 8 ], maxs: [ 110, 40, 120 ] }
		],
		nodes: [ leaf ],
		leafs: [ { contents: - 2 }, leaf ],
		numleafs: 1
	};

}

const ENTITIES = `
{
"classname" "worldspawn"
}
{
"classname" "trigger_teleport"
"target" "t1"
"model" "*1"
}
{
"classname" "info_teleport_destination"
"targetname" "t1"
"origin" "500 600 32"
"angle" "90"
}
`;

Deno.test( 'entity lump parser reads key/value pairs', () => {

	const ents = portal.R_ParseEntityLump( ENTITIES );
	assertEqual( ents.length, 3, 'entity count' );
	assertEqual( ents[ 1 ].target, 't1', 'trigger target' );
	assertEqual( ents[ 2 ].origin, '500 600 32', 'destination origin' );

} );

Deno.test( 'teleporter surface becomes a portal onto its receiver', () => {

	const surf = makeSurface( '*teleport', 100, 1 );
	const portals = portal.R_BuildPortals( makeModel( [ surf ], ENTITIES ) );

	try {

		assertEqual( portals.length, 1, 'portal count' );
		const p = portals[ 0 ];
		assertEqual( surf._portal, p, 'surface links to portal' );
		assertVecNear( p.dest, [ 500, 600, 59 ], 'receiver position' );
		assertEqual( p.yaw, 90, 'receiver yaw' );

		// standing in the doorway maps onto the receiver
		assertVecNear( portal.R_TransformPortalPoint( p, p.center ), p.dest, 'centre maps to receiver' );

		// a viewer in front of the surface ends up the same distance behind the
		// receiver, and the view direction (-n) becomes the receiver's facing
		const eye = [ p.center[ 0 ] + 100, p.center[ 1 ], p.center[ 2 ] + 22 ];
		assertVecNear( portal.R_TransformPortalPoint( p, eye ),
			[ 500, 600 - 100, 59 + 22 ], 'eye maps behind the receiver' );

		const ahead = [ eye[ 0 ] - 1, eye[ 1 ], eye[ 2 ] ];
		const moved = portal.R_TransformPortalPoint( p, ahead );
		const start = portal.R_TransformPortalPoint( p, eye );
		assertVecNear( [ moved[ 0 ] - start[ 0 ], moved[ 1 ] - start[ 1 ], moved[ 2 ] - start[ 2 ] ],
			[ 0, 1, 0 ], 'looking into the surface looks along the receiver facing' );

	} finally {

		portal.R_ClearPortals();

	}

	assertEqual( surf._portal, null, 'clearing unlinks the surface' );

} );

Deno.test( 'back face of a teleporter portals the other way', () => {

	const surf = makeSurface( '*teleport', 100, - 1 );
	const portals = portal.R_BuildPortals( makeModel( [ surf ], ENTITIES ) );

	try {

		assertEqual( portals.length, 1, 'portal count' );
		assertVecNear( portals[ 0 ].normal, [ - 1, 0, 0 ], 'normal follows the visible side' );

	} finally {

		portal.R_ClearPortals();

	}

} );

Deno.test( 'teleport texture without a trigger stays a plain surface', () => {

	const surf = makeSurface( '*teleport', 100, 1 );
	const model = makeModel( [ surf ], ENTITIES );
	model.submodels[ 1 ] = { mins: [ 1000, 1000, 0 ], maxs: [ 1010, 1010, 10 ] };

	assertEqual( portal.R_BuildPortals( model ).length, 0, 'no portals' );
	assertEqual( surf._portal === undefined || surf._portal === null, true, 'surface untouched' );

} );

Deno.test( 'other turbulent textures are not portals', () => {

	const surf = makeSurface( '*lava1', 100, 1 );
	assertEqual( portal.R_BuildPortals( makeModel( [ surf ], ENTITIES ) ).length, 0, 'no portals' );

} );

// E1M4's secret exit (card [B2]): a slipgate with both a trigger_teleport and a trigger_changelevel at it is a level exit; it
// shows the next level (r_levelview.js), never a camera view into this level
Deno.test( 'a teleporter surface at a level exit is left to the next level\'s window', () => {

	const exit = ENTITIES + '{\n"classname" "trigger_changelevel"\n"map" "e1m8"\n"model" "*2"\n}\n';
	const at = makeSurface( '*teleport', 100, 1 ), model = makeModel( [ at ], exit );
	model.submodels[ 2 ] = { mins: [ 92, - 36, - 4 ], maxs: [ 108, 36, 116 ] };
	try { assertEqual( portal.R_BuildPortals( model ).length, 0, 'the exit gate is not a camera portal' ); } finally { portal.R_ClearPortals(); }

	// a level exit elsewhere in the map leaves the teleporter its portal
	const away = makeSurface( '*teleport', 100, 1 ), elsewhere = makeModel( [ away ], exit );
	elsewhere.submodels[ 2 ] = { mins: [ 900, 900, 0 ], maxs: [ 960, 960, 100 ] };
	try { assertEqual( portal.R_BuildPortals( elsewhere ).length, 1, 'an ordinary teleporter keeps its portal' ); } finally { portal.R_ClearPortals(); }

	// an exit 10 units off, its own teleporter trigger nearer (at it): still a teleporter
	const near = makeSurface( '*teleport', 100, 1 ), beside = makeModel( [ near ], exit );
	beside.submodels[ 2 ] = { mins: [ 70, - 36, - 4 ], maxs: [ 80, 36, 116 ] };
	beside.submodels[ 1 ] = { mins: [ 100, - 40, - 8 ], maxs: [ 110, 40, 120 ] };
	try { assertEqual( portal.R_BuildPortals( beside ).length, 1, 'a teleporter whose own trigger is nearer than an exit keeps its portal' ); } finally { portal.R_ClearPortals(); }

	// E3M6's gate: two planes 4 units apart, the exit's trigger in front of one and a teleport trigger behind the other; the whole
	// gate is the exit's
	const front = makeSurface( '*teleport', 100, 1 ), back = makeSurface( '*teleport', 96, - 1 ), gate = makeModel( [ front, back ], exit );
	gate.submodels[ 1 ] = { mins: [ 80, - 40, - 8 ], maxs: [ 86, 40, 120 ] }; // the teleport trigger, behind (10 from the back plane, 14 from the front)
	gate.submodels[ 2 ] = { mins: [ 110, - 36, - 4 ], maxs: [ 116, 36, 116 ] }; // the exit, in front (10 from the front plane)
	try { assertEqual( portal.R_BuildPortals( gate ).length, 0, 'no face of the gate is a camera portal' ); } finally { portal.R_ClearPortals(); }

} );
