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

/**
 * Sweeps a small sphere-like probe (the centre plus six radius offsets, `R_TraceSwept`) from `start` to `end` through
 * the world's BSP hull and through each inline brush entity's hull, transformed into that brush's frame. Reuses
 * Quake's collision algorithm; cosmetics never participate in `SV_Move`, so the game is unaffected. Used by the
 * ejected shells' physics (`r_shells.js`, via the trace `R_NewMap` installs), the depth-of-field focus ray and the
 * lens-blood visibility test (`gl_rmain.js`), and the Bestiary's view check.
 *
 * @param {?model_t} model the world model; with no hull 0 nothing is hit
 * @param {Array<number>} start the start point (Quake units, world space)
 * @param {Array<number>} end the end point (Quake units, world space)
 * @param {number} [radius=0.55] probe radius in Quake units (0 traces a point)
 * @param {Array<entity_t>} [entities=[]] client entities to test as well; only those with a `*` brush model other than
 *   `model` are traced
 * @returns {trace_t} the nearest hit: `fraction` 0..1 along the move, `endpos` and `plane.normal` in world space,
 *   `startsolid`/`allsolid`, and `ent` set to the brush entity when one was nearest (a fresh trace from
 *   `R_TraceSwept`)
 */
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

/**
 * Builds a brush entity's model-to-world matrix from its Quake angles and origin (yaw about Z, then pitch, negated,
 * about Y, then roll about X), the same placement the renderer gives brush models. `R_ShellTrace` inverts it to trace
 * in the brush's frame; `r_shells.js` uses it to carry a shell resting on a moving door, lift or train.
 *
 * @param {entity_t} entity a client entity; reads `angles` (degrees: pitch, yaw, roll; default zeros) and `origin`
 *   (Quake units, default zeros)
 * @returns {THREE.Matrix4} a new matrix
 */
export function R_ShellBrushMatrix( entity ) {

	const angles = entity.angles || [ 0, 0, 0 ], deg = Math.PI / 180;
	return new THREE.Matrix4().makeRotationZ( angles[ 1 ] * deg )
		.multiply( new THREE.Matrix4().makeRotationY( - angles[ 0 ] * deg ) )
		.multiply( new THREE.Matrix4().makeRotationX( angles[ 2 ] * deg ) )
		.setPosition( ...( entity.origin || [ 0, 0, 0 ] ) );

}

