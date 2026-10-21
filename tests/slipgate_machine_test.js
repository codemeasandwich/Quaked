// Owner, 21 October 2026: machine panels keep their art; portals and doorways keep their views.
await import( '../src/engine/render/gl_rsurf.js' );
const { R_BuildPortals, R_ClearPortals, R_ParseEntityLump } = await import( '../src/newer/render/gl_portal.js' );
const { SV_PadWindows, SV_SeamlessReset } = await import( '../src/newer/gameplay/sv_seamless.js' );
const { sv } = await import( '../src/engine/server/server.js' );
const { R_LevelLinks, R_ParseBsp } = await import( '../src/newer/render/r_levelgraph.js' );
const { mountSlipgatePack, loadSlipgateMap } = await import( './helpers/slipgate_maps.mjs' );
const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };

Deno.test( 'real shareware skill doorways keep their views, episode machines have none; ring exit keeps both views', () => {

	if ( ! mountSlipgatePack( new URL( '../games/shareware/pak0.pak', import.meta.url ) ) ) {

		console.log( 'SKIP: shareware pak absent' ); return;

	}
	const previous = sv.worldmodel;
	try {

		const start = loadSlipgateMap( 'start' );
		const cameras = R_BuildPortals( start );
		for ( const trigger of [ '*1', '*2', '*3' ] )
			// the skill choices are doorways in metal arches, not machines (owner, 21 October 2026)
			check( cameras.some( p => p.triggerModel === trigger ), trigger + ': skill doorway keeps its destination view' );
		check( cameras.some( p => p.triggerModel === '*19' ), 'ordinary return doorway retains its camera' );
		sv.worldmodel = start;
		const links = R_LevelLinks( R_ParseBsp( start.bspSourceBytes ) );
		for ( const exit of links.exits ) check( SV_PadWindows( exit ).length === 0, 'episode machine has no window' );
		const e1m1 = loadSlipgateMap( 'e1m1' ); sv.worldmodel = e1m1;
		for ( const exit of R_LevelLinks( R_ParseBsp( e1m1.bspSourceBytes ) ).exits )
			check( SV_PadWindows( exit ).length === 0, 'E1M1 machine has no window' );
		const ring = loadSlipgateMap( 'e1m4' ); sv.worldmodel = ring;
		const exit = R_LevelLinks( R_ParseBsp( ring.bspSourceBytes ) ).exits.find( e => e.map === 'e1m8' );
		check( SV_PadWindows( exit ).length === 2, 'E1M4 ring keeps both destination views' );

	} finally { sv.worldmodel = previous; R_ClearPortals(); SV_SeamlessReset(); }

} );

function surface( name, x, y0 = - 32, y1 = 32, z0 = 0, z1 = 112 ) {

	return { flags: name.startsWith( '*' ) ? 0x10 : 0, plane: { normal: [ 1, 0, 0 ], dist: x },
		texinfo: { texture: { name } }, polys: { numverts: 4, verts: [ [ x, y0, z0 ], [ x, y1, z0 ], [ x, y1, z1 ], [ x, y0, z1 ] ] } };

}

function synthetic( frame = [], skill = false ) {

	const leaf = { contents: - 1, compressed_vis: null, firstmarksurface: null, nummarksurfaces: 0 };
	return { entities: '{ "classname" "trigger_teleport" "model" "*1" "target" "exit" }' +
		'{ "classname" "info_teleport_destination" "targetname" "exit" "origin" "500 0 0" }' +
		( skill ? '{ "classname" "trigger_setskill" "model" "*2" }' : '' ),
		surfaces: [ surface( '*teleport', 100 ), ...frame ], submodels: [ {}, { mins: [ 90, - 32, 0 ], maxs: [ 110, 32, 112 ] },
			{ mins: [ 65, - 32, 0 ], maxs: [ 80, 32, 112 ] } ], nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], numleafs: 1 };

}

Deno.test( 'synthetic apertures use opposing machine framing, never controls, size or map names', () => {

	const cases = [
		[ 'ordinary doorway', synthetic(), 1 ],
		[ 'doorway beside a skill control', synthetic( [], true ), 1 ],
		[ 'machine swirl', synthetic( [ surface( 'slipside', 100, - 48, - 32 ), surface( '+0slip', 100, 32, 48 ) ] ), 0 ],
		[ 'decorative panel on one side', synthetic( [ surface( 'slip1', 100, - 48, - 32 ) ] ), 1 ],
		[ 'remote machine', synthetic( [ surface( 'slipside', 200, - 48, - 32 ), surface( 'slipside', 200, 32, 48 ) ] ), 1 ],
		[ 'top and bottom machine trim', synthetic( [ surface( 'sliptop', 100, - 32, 32, 112, 128 ), surface( 'slipbot', 100, - 32, 32, - 16, 0 ) ] ), 0 ]
	];
	try {

		for ( const [ name, model, count ] of cases ) check( R_BuildPortals( model ).length === count, name );
		const split = synthetic( [ - 48, 32 ].flatMap( y => [ 0, 1, 2, 3 ].map( z => surface( 'slipside', 100, y, y + 16, z * 28, ( z + 1 ) * 28 ) ) ) );
		check( R_BuildPortals( split ).length === 0, 'BSP subdivision does not change machine classification' );
		for ( const [ name, flags, origin, count ] of [ [ 'func_door', '', '', 1 ], [ 'func_wall', '1792', '', 1 ],
			[ 'func_wall', '', '1 0 0', 1 ], [ 'func_wall', '', '', 0 ] ] ) {

			const brush = synthetic( [ surface( 'slipside', 100, - 48, - 32 ), surface( 'slipside', 100, 32, 48 ) ] );
			brush.nummodelsurfaces = 1; brush.submodels[ 2 ] = { firstface: 1, numfaces: 2 };
			brush.entities += `{ "classname" "${name}" "model" "*2" "spawnflags" "${flags}" ${origin ? '"origin" "' + origin + '"' : ''} }`;
			check( R_BuildPortals( brush ).length === count, 'only eligible static brushes count as framing: ' + name + flags + origin );

		}
		for ( const distance of [ 0, 55 ] ) {

			const diagonal = synthetic( [ surface( 'slipside', 100 + distance, - 48, - 32 ), surface( 'slipside', 100 + distance, 32, 48 ) ] );
			const c = Math.SQRT1_2;
			for ( const surf of diagonal.surfaces ) {

				for ( const v of surf.polys.verts ) { const x = v[ 0 ], y = v[ 1 ]; v[ 0 ] = ( x - y ) * c; v[ 1 ] = ( x + y ) * c; }
				surf.plane = { normal: [ c, c, 0 ], dist: 100 };

			}
			diagonal.submodels[ 1 ] = { mins: [ 40, 40, 0 ], maxs: [ 100, 100, 112 ] };
			check( R_BuildPortals( diagonal ).length === ( distance === 0 ? 0 : 1 ), 'rotated frame uses real plane depth: ' + distance );

		}
		const remote = synthetic( [], true ); remote.submodels[ 2 ].mins[ 0 ] -= 100; remote.submodels[ 2 ].maxs[ 0 ] -= 100;
		check( R_BuildPortals( remote ).length === 1, 'a remote skill control is unrelated' );
		const inactive = synthetic( [], true ); inactive.entities = inactive.entities.replace( '"classname" "trigger_setskill"', '"spawnflags" "1792" "classname" "trigger_setskill"' );
		check( R_BuildPortals( inactive ).length === 1, 'an inhibited control cannot suppress the doorway' );

	} finally { R_ClearPortals(); }

} );

Deno.test( 'the portal renderer creates no destination view for a slipgate machine', async () => {

	const { R_RenderPortals, R_ClearLevelPortals, R_PortalsBeginFrame } = await import( '../src/newer/render/gl_portal.js' );
	const { R_AnimSetClassicPass, r_newer_portals } = await import( '../src/newer/mode.js' );
	const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
	const previous = [ r_hdr.value, r_newer_portals.value ];
	try {

		r_hdr.value = r_newer_portals.value = 1; R_AnimSetClassicPass( false ); R_PortalsBeginFrame( true );
		const model = synthetic( [ surface( 'slipside', 100, - 48, - 32 ), surface( 'slipside', 100, 32, 48 ) ] );
		check( R_BuildPortals( model ).length === 0, 'no camera or render target candidate' );
		check( model.surfaces.every( s => ! s._portal ), 'original swirl and frame materials stay in use' );
		let draws = 0;
		R_ClearLevelPortals();
		check( R_RenderPortals( { render: () => draws ++ }, null, null, 640, 480, 0, [] ) === 0 && draws === 0, 'no destination scene render' );

	} finally { [ r_hdr.value, r_newer_portals.value ] = previous; R_ClearPortals(); }

} );

Deno.test( 'installed Quake and mission-pack map decisions are derived from their own entities and surfaces', () => {

	const previous = sv.worldmodel, failures = [];
	const verify = ( value, message ) => { if ( ! value ) failures.push( message ); };
	try {

		for ( const [ pack, maps ] of [
			[ '/Users/bri/quaked/Quake/pak0.pak', [ 'start', 'e1m1', 'e1m2', 'e1m3', 'e1m4', 'e1m5', 'e1m6', 'e1m7' ] ],
			[ '/Users/bri/quaked/Scourge of Armagon/pak0.pak', [ 'hip1m1' ] ]
		] ) {

			if ( ! mountSlipgatePack( pack ) ) { console.log( 'SKIP: absent owned pack ' + pack ); continue; }
			for ( const map of maps ) {

				SV_SeamlessReset();
				const model = loadSlipgateMap( map ); sv.worldmodel = model;
				const cameras = R_BuildPortals( model ), ents = R_ParseEntityLump( model.entities );
				const counts = new Map();
				for ( const p of cameras ) counts.set( p.triggerModel, ( counts.get( p.triggerModel ) ?? 0 ) + 1 );
				const row = { map, teleports: ents.filter( e => e.classname === 'trigger_teleport' ).map( e => [ e.model, e.target, counts.get( e.model ) ?? 0 ] ),
					exits: R_LevelLinks( R_ParseBsp( model.bspSourceBytes ) ).exits.map( e => [ e.map, SV_PadWindows( e ).length ] ) };
				console.log( 'SG_MAP ' + JSON.stringify( row ) );
				if ( map === 'start' ) verify( row.teleports.filter( r => [ '*1', '*2', '*3' ].includes( r[ 0 ] ) ).every( r => r[ 2 ] > 0 ), 'installed skill doorways keep their views' );
				if ( map === 'e1m1' ) verify( row.exits.every( r => r[ 1 ] === 0 ), 'installed exit machine is plain' );
				if ( map === 'e1m3' ) verify( [ '*55', '*76' ].every( id => counts.get( id ) > 0 ), 'installed doorways retain their views' );
				if ( map === 'hip1m1' ) verify( row.exits.every( r => r[ 1 ] === 0 ), 'mission-pack machine exit is plain' );
				if ( map === 'e1m4' ) verify( row.exits.some( r => r[ 0 ] === 'e1m8' && r[ 1 ] === 2 ), 'installed ring retains its views' );

			}

		}

		check( failures.length === 0, failures.join( '; ' ) );

	} finally { sv.worldmodel = previous; R_ClearPortals(); SV_SeamlessReset(); }

} );
