/** Shared drawn-alias visibility test used by Bestiary discovery and first-sight
 * audio. It observes the current pose and existing world/brush collision only.
 */
import * as THREE from 'three';
import { cl, cl_entities } from '../../engine/client/client.js';
import { R_ShellTrace } from './r_shelltrace.js';

/** Returns this pose's world bounds only when its drawn mesh, centre and clear
 * eye-to-centre sightline are inside the current camera, otherwise null.
 * The optional scratch bounds/frustum preserve the Bestiary's per-frame reuse.
 */
export function R_VisibleAliasBounds( scene, camera, entity, bounds = new THREE.Box3(), frustum = null ) {
	if ( ! camera ) return null;
	const mesh = entity?._aliasMesh;
	if ( ! mesh || mesh.parent !== scene || ! mesh.visible ) return null;
	for ( let p = mesh.parent; p; p = p.parent ) if ( ! p.visible ) return null;
	mesh.traverse( o => { if ( o.geometry ) { o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere(); } } );
	mesh.updateWorldMatrix( true, true ); bounds.setFromObject( mesh );
	frustum ??= new THREE.Frustum().setFromProjectionMatrix( new THREE.Matrix4().multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse ) );
	if ( bounds.isEmpty() || ! frustum.intersectsBox( bounds ) ) return null;
	const centre = bounds.getCenter( new THREE.Vector3() ), ndc = centre.clone().project( camera );
	if ( ndc.z < -1 || ndc.z > 1 || Math.abs( ndc.x ) > 1 || Math.abs( ndc.y ) > 1 ) return null;
	const distance = centre.distanceTo( camera.position );
	if ( distance < camera.near || distance > camera.far ) return null;
	const trace = R_ShellTrace( cl.worldmodel, camera.position.toArray(), centre.toArray(), 0, cl_entities );
	return trace.startsolid || trace.allsolid || trace.fraction < .999 ? null : bounds;
}
