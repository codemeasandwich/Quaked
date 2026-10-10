/**
 * @module newer/render/shadow_pose
 *
 * Shadow poses: knowing when a posed model's shadow geometry has really changed.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// The private depth shader reads positions, indices, transforms and instancing.
// Version counters alone cannot identify an unchanged posed alias: callers may
// upload the same bytes each frame, or change bytes without bumping a version.
function captureAttribute(attribute){
 if(!attribute)return null;
 const array=attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;
 if(!array||typeof array.slice!=='function'||!(ArrayBuffer.isView(array)||Array.isArray(array)))return false;
 return {attribute,array,values:array.slice(),itemSize:attribute.itemSize,normalized:attribute.normalized,count:attribute.count,
  stride:attribute.data?.stride,offset:attribute.offset,divisor:attribute.meshPerAttribute??attribute.data?.meshPerAttribute,gpuType:attribute.gpuType};
}
function sameAttribute(saved,attribute){
 if(!saved||!attribute)return saved===null&&!attribute;
 const array=attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;
 return saved.attribute===attribute&&saved.array===array&&saved.itemSize===attribute.itemSize&&saved.normalized===attribute.normalized&&saved.count===attribute.count&&
  saved.stride===attribute.data?.stride&&saved.offset===attribute.offset&&saved.divisor===(attribute.meshPerAttribute??attribute.data?.meshPerAttribute)&&saved.gpuType===attribute.gpuType&&
  saved.values.length===array.length&&saved.values.every((value,i)=>value===array[i]);
}
/**
 * Captures what the private depth shader reads from each mesh (position and index attribute bytes and layout, world
 * matrix, instancing and its matrices, draw range), so a later `ShadowPoseEqual` can tell whether the shadow geometry
 * really changed. Called by the point-shadow pass (r_pointshadows.js) when the frozen dynamic-mesh pose was not equal.
 * The captured values are copies (`slice()`), held until the next capture.
 *
 * @param {Array<THREE.Mesh>} meshes the borrowed dynamic shadow meshes, in draw order
 * @returns {?Array<object>} one captured pose per mesh, or null when any attribute has no readable CPU array
 *   (GPU-backed attributes: reuse is optional, so they keep their existing capture path rather than turning that into
 *   a loading error)
 */
export function ShadowPoseCapture(meshes){
 const captured=meshes.map(mesh=>({mesh,geometry:mesh.geometry,position:captureAttribute(mesh.geometry.getAttribute('position')),index:captureAttribute(mesh.geometry.index),
  matrix:mesh.matrixWorld.elements.slice(),instanced:mesh.isInstancedMesh===true,count:mesh.count,instances:mesh.isInstancedMesh?captureAttribute(mesh.instanceMatrix):null,
  start:mesh.geometry.drawRange.start,range:mesh.geometry.drawRange.count}));
 // GPU-backed attributes have no readable CPU array. Reuse is optional: keep
 // their existing capture path rather than turning that into a loading error.
 return captured.some(pose=>pose.position===false||pose.index===false||pose.instances===false)?null:captured;
}
/**
 * Whether the meshes are exactly as captured: the same mesh and geometry objects, the same attribute objects and
 * arrays with element-by-element equal values and layout, equal world matrices, instancing and draw ranges. Byte
 * comparison is needed because version counters alone cannot identify an unchanged posed alias: callers may upload the
 * same bytes each frame, or change bytes without bumping a version. Costs one pass over every captured array.
 *
 * @param {?Array<object>} saved a `ShadowPoseCapture` result, or null (gives false)
 * @param {Array<THREE.Mesh>} meshes the meshes now, in the same order
 * @returns {boolean} true when nothing the depth shader reads has changed
 */
export function ShadowPoseEqual(saved,meshes){
 return !!saved&&saved.length===meshes.length&&saved.every((pose,i)=>{
  const mesh=meshes[i];return pose.mesh===mesh&&pose.geometry===mesh.geometry&&sameAttribute(pose.position,mesh.geometry.getAttribute('position'))&&sameAttribute(pose.index,mesh.geometry.index)&&
   pose.matrix.every((value,k)=>value===mesh.matrixWorld.elements[k])&&pose.instanced===(mesh.isInstancedMesh===true)&&pose.count===mesh.count&&
   sameAttribute(pose.instances,mesh.isInstancedMesh?mesh.instanceMatrix:null)&&pose.start===mesh.geometry.drawRange.start&&pose.range===mesh.geometry.drawRange.count;
 });
}
