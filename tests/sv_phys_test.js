import { edict_t } from '../src/engine/progs/progs.js';
import {
	SV_AddGravity,
	SV_SetCallbacks,
	SV_SetFrametime,
	SV_SetState,
	SV_SoftenTeleportLaunch,
	SV_WallFriction,
	host_frametime,
	sv_gravity
} from '../src/engine/server/sv_phys.js';

function assertNear( actual, expected, epsilon, message ) {

	if ( Number.isFinite( actual ) !== true || Math.abs( actual - expected ) > epsilon )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

Deno.test( 'SV_AddGravity reads a custom gravity field', () => {

	const gravityFieldOffset = 105;
	const entity = new edict_t( 1, gravityFieldOffset + 1 );
	const oldFrametime = host_frametime;
	const oldGravityValue = sv_gravity.value;
	let fieldExists = true;
	let requestedField = null;

	SV_SetCallbacks( {
		GetEdictFieldValue: ( ent, field ) => {

			requestedField = field;
			if ( fieldExists !== true )
				return null;
			return { accessor: ent._fieldAccessor, ofs: gravityFieldOffset };

		}
	} );

	try {

		sv_gravity.value = 800;
		SV_SetFrametime( 0.01 );

		entity._fieldAccessor.setFloat( gravityFieldOffset, 0.5 );
		entity.v.velocity[ 2 ] = 0;
		SV_AddGravity( entity );
		assertNear( entity.v.velocity[ 2 ], - 4, 0.00001, 'half gravity velocity' );

		entity._fieldAccessor.setFloat( gravityFieldOffset, 0 );
		entity.v.velocity[ 2 ] = 0;
		SV_AddGravity( entity );
		assertNear( entity.v.velocity[ 2 ], - 8, 0.00001, 'zero field default velocity' );

		fieldExists = false;
		entity.v.velocity[ 2 ] = 0;
		SV_AddGravity( entity );
		assertNear( entity.v.velocity[ 2 ], - 8, 0.00001, 'missing field default velocity' );

		if ( requestedField !== 'gravity' )
			throw new Error( `expected gravity lookup, got ${requestedField}` );

	} finally {

		SV_SetFrametime( oldFrametime );
		sv_gravity.value = oldGravityValue;

	}

} );

Deno.test( 'SV_SoftenTeleportLaunch halves the teleporter push once', () => {

	const entity = new edict_t( 1, 128 );
	const fakeSv = { time: 10 };
	SV_SetState( fakeSv, null, null );

	try {


		entity.v.velocity = [ 300, 0, 0 ];
		entity.v.teleport_time = 10.6;

		SV_SoftenTeleportLaunch( entity );
		assertNear( entity.v.velocity[ 0 ], 150, 0.001, 'launch speed' );

		SV_SoftenTeleportLaunch( entity );
		assertNear( entity.v.velocity[ 0 ], 150, 0.001, 'only applied once per teleport' );

		entity.v.velocity = [ 200, 0, 0 ];
		entity.v.teleport_time = 12; // water jump
		SV_SoftenTeleportLaunch( entity );
		assertNear( entity.v.velocity[ 0 ], 200, 0.001, 'water jump untouched' );

	} finally {

		SV_SetState( null, null, null );

	}

} );

Deno.test( 'SV_WallFriction copes with a wall hit that recorded no plane', () => {

	const ent = new edict_t( 1, 128 );
	ent.v.v_angle = [ 0, 0, 0 ];
	ent.v.velocity = [ 300, 0, 0 ];

	// walking into a wall head on: friction slows the sideways part
	SV_WallFriction( ent, { plane: { normal: new Float32Array( [ - 1, 0, 0 ] ) } } );

	// no plane (what SV_TryUnstick leaves behind), an empty trace and no trace at all
	ent.v.velocity = [ 300, 20, 0 ];
	SV_WallFriction( ent, {} );
	SV_WallFriction( ent, null );
	SV_WallFriction( ent, { plane: { normal: new Float32Array( 3 ) } } );

	assertNear( ent.v.velocity[ 0 ], 300, 0.001, 'an unrecorded wall leaves the velocity alone' );
	assertNear( ent.v.velocity[ 1 ], 20, 0.001, 'in both directions' );

} );
