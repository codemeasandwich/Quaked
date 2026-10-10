// Exercise the actual world trigger dispatcher, using its production portal
// construction and edict fields. QC's callback is the only simulated part.
await import( '../src/engine/render/gl_rsurf.js' );
const { R_BuildPortals, R_ClearPortals, R_PortalsBeginFrame, r_portals } = await import( '../src/gl_portal.js' );
const { SV_RunTriggerTouch } = await import( '../src/engine/server/world.js' );
const progs = await import( '../src/engine/progs/progs.js' );
const { sv, svs, FL_CLIENT } = await import( '../src/engine/server/server.js' );
const { r_newer_portals } = await import( '../src/newer/render/r_anim.js' );
const { Cvar_FindVar, Cvar_RegisterVariable, cvar_t } = await import( '../src/engine/common/cvar.js' );
const { SV_SoftenTeleportLaunch, SV_SetState } = await import( '../src/engine/server/sv_phys.js' );
const physics = await import( '../src/engine/server/sv_phys.js' );
const { SV_WriteClientdataToMessage } = await import( '../src/engine/server/sv_main.js' );
const { sizebuf_t, SZ_Alloc } = await import( '../src/engine/common/common.js' );
const { svc_setangle } = await import( '../src/engine/common/protocol.js' );

function equal( actual, expected, label ) {

	if ( actual !== expected ) throw new Error( `${label}: ${actual} != ${expected}` );

}

function near( actual, expected, label ) {

	if ( ! Number.isFinite( actual ) || Math.abs( actual - expected ) > 0.001 )
		throw new Error( `${label}: ${actual} != ${expected}` );

}

function vec( actual, expected, label ) {

	expected.forEach( ( v, i ) => near( actual[ i ], v, `${label}[${i}]` ) );

}

function fixture( run, { back = false, floor = false } = {} ) {

	if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
	const hdr = Cvar_FindVar( 'r_hdr' );
	const old = { hdr: hdr.value, hdrString: hdr.string, portals: r_portals.value, newer: r_newer_portals.value,
		strings: progs.pr_strings_data, globals: progs.pr_global_struct,
		edicts: sv.edicts, modelPrecache: sv.model_precache, time: sv.time, maxclients: svs.maxclients };
	const table = '\0player\0trigger_teleport\0*1\0receiver\0info_teleport_destination\0other\0';
	progs.PR_SetStringsData( new TextEncoder().encode( table ) );
	const string = s => table.indexOf( s );
	const ent = new progs.edict_t( 1, 128 );
	ent.v.classname = string( 'player' );
	ent.v.flags = FL_CLIENT;
	ent.v.origin = [ 99, 13, 24 ];
	ent.v.velocity = [ - 200, 50, 30 ];
	ent.v.v_angle = [ 17, 165, 0 ];
	ent.v.angles = [ 0, 165, 0 ];
	ent.v.teleport_time = 0;
	ent.v.mins = [ - 16, - 16, - 24 ];
	ent.v.maxs = [ 16, 16, 32 ];
	const trigger = new progs.edict_t( 2, 128 );
	trigger.v.classname = string( 'trigger_teleport' );
	trigger.v.model = 0; // Stock InitTrigger hides the model string after setmodel.
	trigger.v.modelindex = 0;
	trigger.v.mins = [ 60, - 40, - 8 ];
	trigger.v.maxs = [ 140, 40, 120 ];
	trigger.v.target = string( 'receiver' );
	trigger.v.touch = 42;
	const receiver = new progs.edict_t( 3, 128 );
	receiver.v.classname = string( 'info_teleport_destination' );
	receiver.v.targetname = string( 'receiver' );
	receiver.v.origin = [ 500, 600, 59 ]; // QC spawn already added 27 to BSP origin.
	receiver.v.angles = [ 0, 90, 0 ];
	const normal = floor ? [ 0, 0, 1 ] : [ 1, 0, 0 ];
	const verts = floor ? [ [ 68, - 32, 0 ], [ 132, - 32, 0 ], [ 132, 32, 0 ], [ 68, 32, 0 ] ] :
		[ [ 100, - 32, 0 ], [ 100, 32, 0 ], [ 100, 32, 112 ], [ 100, - 32, 112 ] ];
	const surface = flags => ( { flags, plane: { normal, dist: floor ? 0 : 100 },
		texinfo: { texture: { name: '*teleport' } }, polys: { numverts: 4, verts, next: null } } );
	const surfaces = [ surface( 0x10 ) ];
	if ( back ) surfaces.push( surface( 0x12 ) );
	const leaf = { contents: - 1, firstmarksurface: null, nummarksurfaces: 0, compressed_vis: null };
	R_BuildPortals( { entities: `{"classname" "trigger_teleport" "target" "receiver" "model" "*1"}
{"classname" "info_teleport_destination" "targetname" "receiver" "origin" "500 600 32" "angle" "90"}`,
		surfaces, firstmodelsurface: 0, nummodelsurfaces: surfaces.length,
		submodels: [ {}, { mins: [ 60, - 40, - 8 ], maxs: [ 140, 40, 120 ] } ],
		nodes: [ leaf ], leafs: [ { contents: - 2 }, leaf ], numleafs: 1 } );
	hdr.value = r_portals.value = r_newer_portals.value = 1;
	hdr.string = '1';
	R_PortalsBeginFrame( true );
	svs.maxclients = 1;
	sv.time = 10;
	sv.edicts = [ new progs.edict_t( 0, 128 ), ent, trigger, receiver ];
	sv.model_precache = [ '', 'maps/test.bsp', '*1' ];
	const globals = { self: 8, other: 9, time: 0 };
	progs.PR_SetGlobalStruct( globals );
	let calls = 0;
	const effects = [];
	function qc( fnum ) {

		equal( fnum, 42, 'actual touch function' );
		equal( globals.self, trigger.index, 'QC self' );
		equal( globals.other, ent.index, 'QC other' );
		calls ++;
		const destination = Array.from( receiver.v.origin );
		effects.push( destination ); // QC telefrag/fog is placed here.
		ent.v.origin = destination;
		ent.v.v_angle = [ 0, 90, 0 ];
		ent.v.angles = [ 0, 90, 0 ];
		ent.v.velocity = [ 0, 300, 0 ];
		ent.v.teleport_time = 10.7;
		ent.v.fixangle = 1;

	}
	try {

		run( { ent, trigger, receiver, qc, globals, effects, hdr, calls: () => calls } );
		equal( globals.self, 8, 'restored self' );
		equal( globals.other, 9, 'restored other' );
		vec( receiver.v.origin, [ 500, 600, 59 ], 'restored receiver' );

	} finally {

		R_ClearPortals();
		hdr.value = old.hdr; hdr.string = old.hdrString; r_portals.value = old.portals; r_newer_portals.value = old.newer;
		R_PortalsBeginFrame( true );
		progs.PR_SetStringsData( old.strings ); progs.PR_SetGlobalStruct( old.globals );
		sv.edicts = old.edicts; sv.model_precache = old.modelPrecache; sv.time = old.time; svs.maxclients = old.maxclients;

	}

}

Deno.test( 'camera portal dispatch retains oblique view, lateral crossing, vertical velocity and speed', () => {

	fixture( ( { ent, trigger, qc, effects } ) => {

		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), true, 'camera portal applied' );
		vec( ent.v.origin, [ 513, 601, 59 ], 'actual offset exit' );
		vec( effects[ 0 ], [ 513, 601, 59 ], 'telefrag/fog uses same exit' );
		vec( ent.v.velocity, [ 50, 200, 30 ], 'momentum' );
		vec( ent.v.v_angle, [ 17, 75, 0 ], 'camera pitch and relative yaw' );
		near( Math.hypot( ...ent.v.velocity ), Math.hypot( 200, 50, 30 ), 'speed unchanged' );
		SV_SetState( sv, null, null );
		try { SV_SoftenTeleportLaunch( ent ); vec( ent.v.velocity, [ 50, 200, 30 ], 'next tick retains speed' ); }
		finally { SV_SetState( null, null, null ); }

	} );

} );

Deno.test( 'camera portal defers hull overlap until origin reaches visible threshold', () => {

	fixture( ( { ent, trigger, qc, calls } ) => {

		ent.v.origin = [ 116, 13, 24 ];
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), false, 'not across yet' );
		equal( calls(), 0, 'QC not prematurely dispatched' );
		ent.v.origin = [ 100, 13, 24 ];
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), true, 'exact threshold crossed' );
		vec( ent.v.origin, [ 513, 600, 59 ], 'threshold reaches receiver plane' );
		equal( calls(), 1, 'QC runs once' );

	} );

} );

Deno.test( 'portal view angles survive the actual svc_setangle writer despite model pitch compression', () => {

	fixture( ( { ent, trigger, qc } ) => {

		ent.v.v_angle = [ 13, 165, 0 ];
		ent.v.angles = [ - 13 / 3, 168, 0 ]; // Normal model tilt differs from camera.
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), true, 'camera transform applied' );
		vec( ent.v.v_angle, [ 13, 75, 0 ], 'transformed camera' );
		const oldPlayer = physics.sv_player;
		const oldProgs = progs.progs;
		const msg = new sizebuf_t();
		SZ_Alloc( msg, 256 );
		try {

			physics.SV_SetPlayer( ent ); // Ideal-pitch writer returns: player airborne.
			progs.PR_SetProgs( { numfielddefs: 0 } ); // No mission-pack items2 field.
			SV_WriteClientdataToMessage( ent, msg );
			equal( msg.data[ 0 ], svc_setangle, 'actual protocol message' );
			[ 13, 75, 0 ].forEach( ( angle, i ) =>
				equal( msg.data[ i + 1 ], ( ( angle | 0 ) * 256 / 360 ) & 255, `serialized view angle ${i}` ) );
			equal( ent.v.fixangle, 0, 'writer consumed pending view correction' );

		} finally {

			physics.SV_SetPlayer( oldPlayer );
			progs.PR_SetProgs( oldProgs );

		}

	} );

} );

Deno.test( 'opposite entry face uses its own camera transform after backing out', () => {

	fixture( ( { ent, trigger, qc, calls } ) => {

		ent.v.origin = [ 116, 13, 24 ];
		SV_RunTriggerTouch( ent, trigger, qc, () => true );
		ent.v.origin = [ 99, 13, 24 ]; ent.v.velocity = [ 200, 50, 30 ];
		SV_RunTriggerTouch( ent, trigger, qc, () => true );
		equal( calls(), 0, 'back approach still outside threshold' );
		ent.v.origin = [ 101, 13, 24 ];
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), true, 'cross opposite face' );
		vec( ent.v.origin, [ 487, 601, 59 ], 'other side offset' );
		vec( ent.v.velocity, [ - 50, 200, 30 ], 'opposite face momentum' );

	}, { back: true } );

} );

Deno.test( 'floor portal rotates falling momentum and camera forward into receiver frame', () => {

	fixture( ( { ent, trigger, qc } ) => {

		ent.v.origin = [ 100, 13, - 1 ]; ent.v.velocity = [ 30, 50, - 200 ];
		ent.v.v_angle = [ 90, 0, 0 ];
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), true, 'floor portal applied' );
		vec( ent.v.origin, [ 487, 601, 59 ], 'floor offset' );
		vec( ent.v.velocity, [ - 50, 200, 30 ], 'fall becomes exit momentum' );
		near( ent.v.v_angle[ 0 ], 0, 'looking down now looks out' );
		near( ent.v.v_angle[ 1 ], 90, 'receiver direction' );

	}, { floor: true } );

} );

Deno.test( 'classic, disabled camera portals, multiplayer and non-player touches keep QC unchanged', () => {

	for ( const disable of [ f => { f.hdr.value = 0; f.hdr.string = '0'; }, () => { r_newer_portals.value = 0; },
		() => { r_portals.value = 0; }, () => { R_PortalsBeginFrame( false ); },
		() => { svs.maxclients = 2; }, f => { f.ent.v.flags = 0; } ] ) {

		fixture( f => {

			disable( f );
			f.ent.v.origin = [ 116, 13, 24 ];
			equal( SV_RunTriggerTouch( f.ent, f.trigger, f.qc, () => { throw new Error( 'unexpected offset trace' ); } ), false, 'native dispatch' );
			equal( f.calls(), 1, 'native QC touch retained' );
			vec( f.ent.v.origin, [ 500, 600, 59 ], 'native destination' );
			vec( f.ent.v.velocity, [ 0, 300, 0 ], 'native launch' );

		} );

	}

} );

Deno.test( 'disabling visible portals cancels a saved approach before native touch', () => {

	fixture( ( { ent, trigger, qc, calls } ) => {

		ent.v.origin = [ 116, 13, 24 ];
		SV_RunTriggerTouch( ent, trigger, qc, () => true );
		equal( calls(), 0, 'approach held outside threshold' );
		R_PortalsBeginFrame( false );
		equal( SV_RunTriggerTouch( ent, trigger, qc, () => true ), false, 'disabled renderer keeps native touch' );
		equal( calls(), 1, 'native touch dispatched after disabling' );
		vec( ent.v.origin, [ 500, 600, 59 ], 'native destination' );

	} );

} );

Deno.test( 'blocked receiver offset falls back to original QC destination and side effects', () => {

	fixture( ( { ent, trigger, qc, effects } ) => {

		equal( SV_RunTriggerTouch( ent, trigger, qc, () => false ), false, 'blocked fallback' );
		vec( ent.v.origin, [ 500, 600, 59 ], 'safe native destination' );
		vec( effects[ 0 ], [ 500, 600, 59 ], 'native effects' );
		vec( ent.v.velocity, [ 0, 300, 0 ], 'native launch retained' );

	} );

} );

Deno.test( 'unmapped hidden trigger and a moved receiver keep native QC dispatch', () => {

	for ( const change of [ f => { f.trigger.v.origin[ 0 ] = 2; }, f => { f.receiver.v.origin[ 0 ] = 501.5; } ] ) {

		fixture( f => {

			change( f );
			f.ent.v.origin = [ 116, 13, 24 ]; // Failed mapping must not delay QC to the camera plane.
			const expected = Array.from( f.receiver.v.origin );
			equal( SV_RunTriggerTouch( f.ent, f.trigger, f.qc, () => { throw new Error( 'unexpected matrix clearance' ); } ), false, 'unmapped native touch' );
			equal( f.calls(), 1, 'QC touch kept' );
			vec( f.ent.v.origin, expected, 'actual native receiver' );
			// Restore the fixture's receiver invariant after the explicit move.
			f.receiver.v.origin = [ 500, 600, 59 ];

		} );

	}

} );

Deno.test( 'QC refusal and mod redirect remain authoritative; receiver restores on exceptions', () => {

	fixture( ( { ent, trigger, qc, receiver } ) => {

		equal( SV_RunTriggerTouch( ent, trigger, () => {}, () => true ), false, 'QC refusal' );
		vec( ent.v.origin, [ 99, 13, 24 ], 'refused position unchanged' );
		equal( SV_RunTriggerTouch( ent, trigger, () => { qc( 42 ); ent.v.origin = [ 800, 900, 100 ]; }, () => true ), false, 'redirect retained' );
		vec( ent.v.origin, [ 800, 900, 100 ], 'redirect position' );
		ent.v.origin = [ 99, 13, 24 ]; ent.v.velocity = [ - 200, 0, 0 ];
		let threw = false;
		try { SV_RunTriggerTouch( ent, trigger, () => { throw new Error( 'QC error' ); }, () => true ); }
		catch ( error ) { threw = error.message === 'QC error'; }
		equal( threw, true, 'error propagated' );
		vec( receiver.v.origin, [ 500, 600, 59 ], 'receiver restored after error' );

	} );

} );
