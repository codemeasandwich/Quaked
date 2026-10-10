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
/**
 * Applies the player's respawn presentation frame (`SV_RespawnCameraFrame`, a quaternion that turns the world half a
 * turn about the facing axis per completed respawn) to the camera, called by the renderer each rendered frame after the
 * camera is placed. The supplied demo's opposing presentation frames are a proper coordinate change, not mirrored
 * geometry: the Quake renderer and physics stay in native coordinates and only the actual camera is transported
 * through P, since (P*camera)^-1*(P*world) = camera^-1*world, including deferred lighting.
 *
 * @param {THREE.Camera} camera the view camera; its `matrixWorld` is read, not changed
 * @returns {{ frame: THREE.Matrix4, matrixWorld: THREE.Matrix4, quaternion: THREE.Quaternion,
 *   frameQuaternion: THREE.Quaternion }} the presentation state, allocated once and kept on
 *   `camera.userData.clockwisePresentation` (reused every frame: copy what you keep); `matrixWorld` = frame * camera
 */
export function R_RespawnCameraFrame(camera){
 const state=camera.userData.clockwisePresentation ||= {frame:new THREE.Matrix4(),matrixWorld:new THREE.Matrix4(),quaternion:new THREE.Quaternion(),frameQuaternion:new THREE.Quaternion()};
 state.frame.makeRotationFromQuaternion(state.frameQuaternion.fromArray(SV_RespawnCameraFrame()));
 state.matrixWorld.multiplyMatrices(state.frame,camera.matrixWorld);
 state.quaternion.setFromRotationMatrix(state.matrixWorld);
 return state;
}
