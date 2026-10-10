/**
 * @module newer/render/r_respawn
 *
 * The respawn's presentation: the supplied demo's frames, as a change of coordinates.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The supplied demo's opposing presentation frames are a proper coordinate
// change, not mirrored geometry. Keep the entire Quake renderer/physics in
// native coordinates; transport its ACTUAL camera through P for presentation.
// (P*camera)^-1*(P*world) = camera^-1*world, including deferred lighting.
import * as THREE from 'three';
import {SV_RespawnCameraFrame} from '../gameplay/sv_respawn.js';
export function R_RespawnCameraFrame(camera){
 const state=camera.userData.clockwisePresentation ||= {frame:new THREE.Matrix4(),matrixWorld:new THREE.Matrix4(),quaternion:new THREE.Quaternion(),frameQuaternion:new THREE.Quaternion()};
 state.frame.makeRotationFromQuaternion(state.frameQuaternion.fromArray(SV_RespawnCameraFrame()));
 state.matrixWorld.multiplyMatrices(state.frame,camera.matrixWorld);
 state.quaternion.setFromRotationMatrix(state.matrixWorld);
 return state;
}
