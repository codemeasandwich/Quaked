/**
 * @module engine/client/cl_tent
 *
 * Temporary entities (WinQuake cl_tent.c): beams, explosions, spikes hitting walls and the teleport flash, with Newer
 * Game's effects hooked in.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `num_temp_entities`, `cl_sfx_wizhit`, `cl_sfx_knighthit`,
 * `cl_sfx_tink1`, `cl_sfx_ric1`, `cl_sfx_ric2`, `cl_sfx_ric3`, `cl_sfx_r_exp3`.
 *
 * Errors: calls `Sys_Error` (fatal) at 1 place.
 */
// Ported from: WinQuake/cl_tent.c -- client side temporary entities

import { Con_Printf } from '../common/common.js';
import { Sys_Error } from '../common/sys.js';
import {
	MSG_ReadByte, MSG_ReadShort, MSG_ReadCoord
} from '../common/common.js';
import {
	TE_SPIKE, TE_SUPERSPIKE, TE_GUNSHOT, TE_EXPLOSION,
	TE_TAREXPLOSION, TE_LIGHTNING1, TE_LIGHTNING2, TE_LIGHTNING3,
	TE_LAVASPLASH, TE_TELEPORT, TE_GORE, TE_EXPLOSION2, TE_WIZSPIKE,
	TE_KNIGHTSPIKE, TE_BEAM
} from '../common/protocol.js';
import {
	MAX_TEMP_ENTITIES, MAX_BEAMS, MAX_VISEDICTS,
	cl, cls, cl_entities, cl_temp_entities, cl_beams,
	cl_numvisedicts, cl_visedicts, set_cl_numvisedicts,
	entity_t, beam_t
} from './client.js';
import { CL_AllocDlight } from './cl_main.js';
import { R_WallBurnShot } from '../common/hooks.js'; // installed by newer/render/r_wallburn.js

// where monsters have just been teleported in (for their arrival effect)
export const CL_TeleportSpots = [];
import { VectorCopy, VectorSubtract, VectorNormalize, vec3_origin, M_PI } from '../common/mathlib.js';
import { S_PrecacheSound, S_StartSound } from '../sound/snd_dma.js';
import { R_RunParticleEffect, R_ParticleExplosion, R_BlobExplosion,
	R_ParticleExplosion2, R_LavaSplash } from '../render/render.js';
import { Mod_ForName } from '../render/gl_model.js';
import { R_DecalShot, R_DecalScorch, R_DecalBloodPool } from '../common/hooks.js'; // installed by newer/render/r_decals.js

let num_temp_entities = 0;
// the player's beam lookup lives with the beams in client.js, so the renderer need not import this module ([44g], D1a)
export { CL_PlayerLightning } from './client.js';

let cl_sfx_wizhit = null;
let cl_sfx_knighthit = null;
let cl_sfx_tink1 = null;
let cl_sfx_ric1 = null;
let cl_sfx_ric2 = null;
let cl_sfx_ric3 = null;
let cl_sfx_r_exp3 = null;

/*
=================
CL_InitTEnts
=================
*/
/**
 * Precaches the temporary entities' sounds (wizard and hell knight spike hits, the spike tink and three ricochets,
 * the rocket explosion). Called once by `CL_Init` at engine start; the handles are kept in module variables for the
 * life of the page.
 */
export function CL_InitTEnts() {

	cl_sfx_wizhit = S_PrecacheSound( 'wizard/hit.wav' );
	cl_sfx_knighthit = S_PrecacheSound( 'hknight/hit.wav' );
	cl_sfx_tink1 = S_PrecacheSound( 'weapons/tink1.wav' );
	cl_sfx_ric1 = S_PrecacheSound( 'weapons/ric1.wav' );
	cl_sfx_ric2 = S_PrecacheSound( 'weapons/ric2.wav' );
	cl_sfx_ric3 = S_PrecacheSound( 'weapons/ric3.wav' );
	cl_sfx_r_exp3 = S_PrecacheSound( 'weapons/r_exp3.wav' );

}

/*
=================
CL_ParseBeam
=================
*/
function CL_ParseBeam( m ) {

	const start = new Float32Array( 3 );
	const end = new Float32Array( 3 );

	const ent = MSG_ReadShort();

	start[ 0 ] = MSG_ReadCoord();
	start[ 1 ] = MSG_ReadCoord();
	start[ 2 ] = MSG_ReadCoord();

	end[ 0 ] = MSG_ReadCoord();
	end[ 1 ] = MSG_ReadCoord();
	end[ 2 ] = MSG_ReadCoord();

	// Use server time (cl.mtime[0]) for beam timing to avoid mismatch with
	// client-side prediction which modifies cl.time
	const serverTime = cl.mtime[ 0 ];

	// override any beam with the same entity
	for ( let i = 0; i < MAX_BEAMS; i ++ ) {

		const b = cl_beams[ i ];
		if ( b.entity === ent ) {

			b.entity = ent;
			b.model = m;
			b.endtime = serverTime + 0.2;
			VectorCopy( start, b.start );
			VectorCopy( end, b.end );
			return;

		}

	}

	// find a free beam (fix Golden Rule #2: use explicit null check)
	for ( let i = 0; i < MAX_BEAMS; i ++ ) {

		const b = cl_beams[ i ];
		if ( b.model == null || b.endtime < serverTime ) {

			b.entity = ent;
			b.model = m;
			b.endtime = serverTime + 0.2;
			VectorCopy( start, b.start );
			VectorCopy( end, b.end );
			return;

		}

	}

	Con_Printf( 'beam list overflow!\n' );

}

/*
=================
CL_ParseTEnt
=================
*/
/**
 * Reads one `svc_temp_entity` message body (a type byte, then that type's coordinates and extra bytes) from
 * `net_message` and spawns its effect: particles, decals, dynamic lights and sounds for impacts and explosions, a beam
 * record (`cl_beams`) for lightning and the grappling beam, Newer Game's gore pool (also sets `cl.grintime` to
 * `cl.time + 2`), or a spot in `CL_TeleportSpots` (last 8 kept) for a teleport. Called by `CL_ParseServerMessage`
 * while a server message is parsed.
 *
 * A one-shot native dynamic light (radius 350, 0.5 s, decay 300/s) is allocated for `TE_EXPLOSION` and
 * `TE_EXPLOSION2` only when the Newer Fireball did not take the event. Beams use server time (`cl.mtime[0]`) and last
 * 0.2 s; a beam for an entity that already has one replaces it.
 *
 * @throws {Error} via `Sys_Error` ('CL_ParseTEnt: bad type') for a type byte it does not know
 */
export function CL_ParseTEnt() {

	const pos = new Float32Array( 3 );

	const type = MSG_ReadByte();
	switch ( type ) {

		case TE_WIZSPIKE: // spike hitting wall
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_RunParticleEffect( pos, vec3_origin, 20, 30 );
			S_StartSound( - 1, 0, cl_sfx_wizhit, pos, 1, 1 );
			break;

		case TE_KNIGHTSPIKE: // spike hitting wall
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_RunParticleEffect( pos, vec3_origin, 226, 20 );
			S_StartSound( - 1, 0, cl_sfx_knighthit, pos, 1, 1 );
			break;

		case TE_SPIKE: // spike hitting wall
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_RunParticleEffect( pos, vec3_origin, 0, 10 );
			R_DecalShot( pos );
			if ( Math.random() * 5 | 0 )
				S_StartSound( - 1, 0, cl_sfx_tink1, pos, 1, 1 );
			else {

				const rnd = Math.random() * 3 | 0;
				if ( rnd === 1 )
					S_StartSound( - 1, 0, cl_sfx_ric1, pos, 1, 1 );
				else if ( rnd === 2 )
					S_StartSound( - 1, 0, cl_sfx_ric2, pos, 1, 1 );
				else
					S_StartSound( - 1, 0, cl_sfx_ric3, pos, 1, 1 );

			}

			break;

		case TE_SUPERSPIKE: // super spike hitting wall
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_RunParticleEffect( pos, vec3_origin, 0, 20 );
			R_DecalShot( pos );
			if ( Math.random() * 5 | 0 )
				S_StartSound( - 1, 0, cl_sfx_tink1, pos, 1, 1 );
			else {

				const rnd = Math.random() * 3 | 0;
				if ( rnd === 1 )
					S_StartSound( - 1, 0, cl_sfx_ric1, pos, 1, 1 );
				else if ( rnd === 2 )
					S_StartSound( - 1, 0, cl_sfx_ric2, pos, 1, 1 );
				else
					S_StartSound( - 1, 0, cl_sfx_ric3, pos, 1, 1 );

			}

			break;

		case TE_GUNSHOT: // bullet hitting wall
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_RunParticleEffect( pos, vec3_origin, 0, 20 );
			if ( ! R_WallBurnShot( pos ) ) R_DecalShot( pos ); // (Newer Game: the pellet's burn on the wall, card [30c])
			break;

		case TE_EXPLOSION: { // rocket explosion

			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			// (the Fireball drives its own dynamic light from the supplied curve; the native
			// one-shot light would only double it)
			const fireball = R_ParticleExplosion( pos );
			R_DecalScorch( pos );
			if ( ! fireball ) {

				const dl = CL_AllocDlight( 0 );
				VectorCopy( pos, dl.origin );
				dl.radius = 350;
				dl.die = cl.time + 0.5;
				dl.decay = 300;

			}
			S_StartSound( - 1, 0, cl_sfx_r_exp3, pos, 1, 1 );
			break;

		}

		case TE_TAREXPLOSION: // tarbaby explosion
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_BlobExplosion( pos );
			S_StartSound( - 1, 0, cl_sfx_r_exp3, pos, 1, 1 );
			break;

		case TE_LIGHTNING1: // lightning bolts
			CL_ParseBeam( Mod_ForName( 'progs/bolt.mdl', true ) );
			break;

		case TE_LIGHTNING2: // lightning bolts
			CL_ParseBeam( Mod_ForName( 'progs/bolt2.mdl', true ) );
			break;

		case TE_LIGHTNING3: // lightning bolts
			CL_ParseBeam( Mod_ForName( 'progs/bolt3.mdl', true ) );
			break;

		// PGM 01/21/97
		case TE_BEAM: // grappling hook beam
			CL_ParseBeam( Mod_ForName( 'progs/beam.mdl', true ) );
			break;
		// PGM 01/21/97

		case TE_LAVASPLASH:
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			R_LavaSplash( pos );
			break;

		case TE_GORE: { // Newer Game: a monster burst; the bigger it was, the bigger the pool

			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			const size = MSG_ReadByte();
			cl.grintime = cl.time + 2;
			if ( size > 1 ) R_DecalBloodPool( pos, size );
			break;

		}

		case TE_TELEPORT:
			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			// The server owns teleport sound. Named local monster arrivals use an
			// authoritative individual Rend the Veil record; this spot list is legacy visual data.
			CL_TeleportSpots.push( { pos: [ pos[ 0 ], pos[ 1 ], pos[ 2 ] ], time: cl.time } );
			if ( CL_TeleportSpots.length > 8 ) CL_TeleportSpots.shift();
			break;

		case TE_EXPLOSION2: { // color mapped explosion

			pos[ 0 ] = MSG_ReadCoord();
			pos[ 1 ] = MSG_ReadCoord();
			pos[ 2 ] = MSG_ReadCoord();
			const colorStart = MSG_ReadByte();
			const colorLength = MSG_ReadByte();
			if ( ! R_ParticleExplosion2( pos, colorStart, colorLength ) ) {

				const dl2 = CL_AllocDlight( 0 );
				VectorCopy( pos, dl2.origin );
				dl2.radius = 350;
				dl2.die = cl.time + 0.5;
				dl2.decay = 300;

			}
			S_StartSound( - 1, 0, cl_sfx_r_exp3, pos, 1, 1 );
			break;

		}

		default:
			Sys_Error( 'CL_ParseTEnt: bad type' );

	}

}

/*
=================
CL_NewTempEntity
=================
*/
function CL_NewTempEntity() {

	if ( cl_numvisedicts === MAX_VISEDICTS )
		return null;
	if ( num_temp_entities === MAX_TEMP_ENTITIES )
		return null;

	const ent = cl_temp_entities[ num_temp_entities ];

	// clear entity
	ent.forcelink = false;
	ent._playerLightning = false;
	ent.model = null;
	ent.frame = 0;
	ent.colormap = null;
	ent.skinnum = 0;
	ent.effects = 0;
	ent.origin.fill( 0 );
	ent.angles.fill( 0 );

	num_temp_entities ++;
	cl_visedicts[ cl_numvisedicts ] = ent;
	set_cl_numvisedicts( cl_numvisedicts + 1 );

	ent.colormap = null; // vid.colormap
	return ent;

}


/*
=================
CL_UpdateTEnts
=================
*/
/**
 * Rebuilds the per-frame temporary entities: resets the temp entity pool, then for each live beam (model set and
 * `endtime` not past the server time `cl.mtime[0]`) lays bolt model segments every 30 Quake units from start to end
 * with the beam's pitch and yaw and a random roll, adding each to `cl_visedicts`. A beam from the view entity starts
 * at the player's current origin; the player's own lightning gun beam (`progs/bolt2.mdl`) is marked
 * `_playerLightning` so the Newer pass can leave it out and draw its own (r_lightning.js). Stops early when the
 * visedict list or the temp entity pool (`MAX_TEMP_ENTITIES`) is full. Called once a frame by `CL_ReadFromServer`
 * after the entities are relinked.
 */
export function CL_UpdateTEnts() {

	num_temp_entities = 0;

	// Use server time (cl.mtime[0]) for beam expiration to match CL_ParseBeam
	// which also uses server time. This avoids mismatch with client-side prediction.
	const serverTime = cl.mtime[ 0 ];

	// update lightning
	for ( let i = 0; i < MAX_BEAMS; i ++ ) {

		const b = cl_beams[ i ];
		// Fix Golden Rule #2: use explicit null check instead of falsy check
		if ( b.model == null || b.endtime < serverTime )
			continue;

		// if coming from the player, update the start position
		if ( b.entity === cl.viewentity ) {

			VectorCopy( cl_entities[ cl.viewentity ].origin, b.start );

		}
		// the player's own lightning gun beam: the Newer Game draws it itself (r_lightning.js), so its bolt models are
		// marked and left out when the entities are drawn, in the Newer pass only (the Classic pass, or half of the
		// title demo's split, still draws them)
		const playerLightning = b.entity === cl.viewentity && b.model.name === 'progs/bolt2.mdl';

		// calculate pitch and yaw
		const dist = new Float32Array( 3 );
		VectorSubtract( b.end, b.start, dist );

		let yaw, pitch;
		if ( dist[ 1 ] === 0 && dist[ 0 ] === 0 ) {

			yaw = 0;
			if ( dist[ 2 ] > 0 )
				pitch = 90;
			else
				pitch = 270;

		} else {

			yaw = ( Math.atan2( dist[ 1 ], dist[ 0 ] ) * 180 / M_PI ) | 0;
			if ( yaw < 0 )
				yaw += 360;

			const forward = Math.sqrt( dist[ 0 ] * dist[ 0 ] + dist[ 1 ] * dist[ 1 ] );
			pitch = ( Math.atan2( dist[ 2 ], forward ) * 180 / M_PI ) | 0;
			if ( pitch < 0 )
				pitch += 360;

		}

		// add new entities for the lightning
		const org = new Float32Array( 3 );
		VectorCopy( b.start, org );
		let d = VectorNormalize( dist );
		while ( d > 0 ) {

			const ent = CL_NewTempEntity();
			if ( ! ent )
				return;
			VectorCopy( org, ent.origin );
			ent.model = b.model;
			ent._playerLightning = playerLightning;
			ent.angles[ 0 ] = pitch;
			ent.angles[ 1 ] = yaw;
			ent.angles[ 2 ] = ( Math.random() * 360 ) | 0;

			for ( let j = 0; j < 3; j ++ )
				org[ j ] += dist[ j ] * 30;
			d -= 30;

		}

	}

}
