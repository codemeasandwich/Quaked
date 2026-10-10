/**
 * @module newer/render/r_shelltrace
 *
 * Collision for shells: a swept casing through the world's BSP hull, without affecting the game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Swept casing centre with six radius probes through the existing BSP hull.
// Reuses Quake's collision algorithm; cosmetics never participate in SV_Move.
import { R_TraceSwept } from '../../engine/render/r_trace.js';
import * as THREE from 'three';

export function R_ShellTrace( model, start, end, radius = 0.55, entities = [] ) {

	const best = R_TraceSwept( model, start, end, radius );
	for ( const entity of entities ) {

		if ( ! entity?.model?.hulls || entity.model === model || ! entity.model.name?.startsWith( '*' ) ) continue;
		const matrix = R_ShellBrushMatrix( entity ), inverse = matrix.clone().invert();
		const a = new THREE.Vector3().fromArray( start ).applyMatrix4( inverse ).toArray();
		const b = new THREE.Vector3().fromArray( end ).applyMatrix4( inverse ).toArray();
		const hit = R_TraceSwept( entity.model, a, b, radius );
		if ( hit.fraction < best.fraction || hit.allsolid ) {

			best.fraction = hit.fraction; best.startsolid = hit.startsolid; best.allsolid = hit.allsolid;
			best.endpos.set( new THREE.Vector3().fromArray( hit.endpos ).applyMatrix4( matrix ).toArray() );
			best.plane.normal.set( new THREE.Vector3().fromArray( hit.plane.normal ).transformDirection( matrix ).toArray() );
			best.ent = entity;

		}

	}
	return best;

}

export function R_ShellBrushMatrix( entity ) {

	const angles = entity.angles || [ 0, 0, 0 ], deg = Math.PI / 180;
	return new THREE.Matrix4().makeRotationZ( angles[ 1 ] * deg )
		.multiply( new THREE.Matrix4().makeRotationY( - angles[ 0 ] * deg ) )
		.multiply( new THREE.Matrix4().makeRotationX( angles[ 2 ] * deg ) )
		.setPosition( ...( entity.origin || [ 0, 0, 0 ] ) );

}

