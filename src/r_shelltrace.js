// Swept casing centre with six radius probes through the existing BSP hull.
// Reuses Quake's collision algorithm; cosmetics never participate in SV_Move.
import { trace_t, SV_RecursiveHullCheck } from './engine/server/world.js';
import * as THREE from 'three';

export function R_ShellTrace( model, start, end, radius = 0.55, entities = [] ) {

	const best = traceHull( model, start, end, radius );
	for ( const entity of entities ) {

		if ( ! entity?.model?.hulls || entity.model === model || ! entity.model.name?.startsWith( '*' ) ) continue;
		const matrix = R_ShellBrushMatrix( entity ), inverse = matrix.clone().invert();
		const a = new THREE.Vector3().fromArray( start ).applyMatrix4( inverse ).toArray();
		const b = new THREE.Vector3().fromArray( end ).applyMatrix4( inverse ).toArray();
		const hit = traceHull( entity.model, a, b, radius );
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

function traceHull( model, start, end, radius ) {

	const best = new trace_t(); best.endpos.set( end );
	const hull = model?.hulls?.[ 0 ];
	if ( ! hull ) { best.allsolid = false; return best; }
	const offsets = [ [ 0, 0, 0 ], [ radius, 0, 0 ], [ - radius, 0, 0 ], [ 0, radius, 0 ], [ 0, - radius, 0 ], [ 0, 0, radius ], [ 0, 0, - radius ] ];
	best.allsolid = false;
	for ( const offset of offsets ) {

		const a = start.map( ( v, i ) => v + offset[ i ] ), b = end.map( ( v, i ) => v + offset[ i ] );
		const hit = new trace_t(); hit.allsolid = true; hit.endpos.set( b );
		SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, a, b, hit );
		best.startsolid ||= hit.startsolid; best.allsolid ||= hit.allsolid;
		if ( hit.fraction < best.fraction ) {

			best.fraction = hit.fraction; best.plane = hit.plane;
			for ( let i = 0; i < 3; i ++ ) best.endpos[ i ] = hit.endpos[ i ] - offset[ i ];

		}

	}
	return best;

}
