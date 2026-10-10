/**
 * @module newer/render/r_shaderwarm
 *
 * Compiling shaders ahead of need, and keeping their materials alive while they compile.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `shaderFunctionSerial`; 2 module-level collections (Map/Set).
 *
 * Errors: throws at 2 places; catches at 2 places.
 */
// Three's compileAsync polls currentProgram on the original Material objects.
// Collection/map changes can detach their meshes immediately, but destroying a
// polled material removes those properties and strands the compile promise.
// A lease delays only GPU material disposal, not scene or gameplay lifetime.
const leases = new WeakMap();
// Only prepared bindings define upload/warm work. Streaming geometry counts
// still belong to the separate stable-rendered-frame readiness revision.
const shaderFunctions = new WeakMap();
let shaderFunctionSerial = 0;
function shaderFunctionId(fn){
 if(typeof fn!=='function')return null;
 if(!shaderFunctions.has(fn))shaderFunctions.set(fn,++shaderFunctionSerial);
 return shaderFunctions.get(fn);
}
function shaderMaterialStamp(material){
 // Three's render and compile paths increment version twice per transparent
 // DoubleSide draw. That internal side dance does not change the resulting
 // shader. For these materials observe the actual program inputs instead.
 if(!material.transparent||material.side!==2)return [material.uuid,material.version];
 const properties=Object.keys(material).sort().filter(key=>!['id','uuid','version','name'].includes(key)).flatMap(key=>{
  const value=material[key];
  if(value?.isTexture)return [[key,value.uuid,value.version]];
  if(value===null||['string','number','boolean'].includes(typeof value))return [[key,value]];
  return [];
 });
 const uniforms=Object.entries(material.uniforms||{}).filter(([,uniform])=>uniform?.value?.isTexture).map(([key,uniform])=>[key,uniform.value.uuid,uniform.value.version]);
 return [material.uuid,properties,material.defines,material.extensions,uniforms,shaderFunctionId(material.onBeforeCompile),shaderFunctionId(material.customProgramCacheKey),material.customProgramCacheKey?.()];
}
/**
 * A fingerprint of the prepared shader and texture bindings, compared by `R_UpdateIntroReadiness` (gl_rmain.js) to
 * rewarm shaders only when the actual bindings changed. Only prepared bindings define upload/warm work. Streaming
 * geometry counts still belong to the separate stable-rendered-frame readiness revision. Each material contributes its
 * uuid and version, except transparent DoubleSide materials: Three's render and compile paths increment version twice
 * per transparent DoubleSide draw, which does not change the resulting shader, so for these materials the actual
 * program inputs are observed instead (scalar properties, textures, defines, extensions, texture uniforms and the
 * identity of `onBeforeCompile`/`customProgramCacheKey`).
 *
 * @param {Array<*>} revision caller values that also invalidate the stamp (map name, readiness counts); JSON-safe
 * @param {Array<THREE.Material>} materials the prepared materials (from `R_NewerSkinsMaterials`, `R_WeaponMaterials`)
 * @param {Array<THREE.Texture>} textures the prepared textures (uuid and version are used)
 * @returns {string} a JSON string; equal strings mean nothing needs rewarming
 */
export function R_ShaderAssetStamp(revision,materials,textures){
 return JSON.stringify([revision,materials.map(shaderMaterialStamp),textures.map(t=>[t.uuid,t.version])]);
}

/**
 * Compiles every material in a scene ahead of need, from `R_WarmShaders` (gl_rmain.js) while a level's start is held
 * back. Three's compileAsync polls currentProgram on the original Material objects. Collection/map changes can detach
 * their meshes immediately, but destroying a polled material removes those properties and strands the compile
 * promise. A lease delays only GPU material disposal, not scene or gameplay lifetime: while the compile runs, each
 * material's `dispose` is replaced by a stub that only records the request; when the last overlapping compile
 * settles the original `dispose` is restored and, if it was requested, called.
 *
 * @param {THREE.WebGLRenderer} renderer the game's renderer
 * @param {THREE.Scene} scene the scene to compile (every mesh material and `overrideMaterial`)
 * @param {THREE.Camera} camera the camera to compile for
 * @returns {Promise<*>|*} the compile promise (settles after the leases are released), or, when the renderer has no
 *   `compileAsync`, the result of the synchronous `renderer.compile`
 * @throws {*} what `renderer.compileAsync` throws synchronously (the leases are released first); a deferred
 *   `dispose` that throws on release rejects the promise with that error
 */
export function R_CompileSceneAsync( renderer, scene, camera ) {
 if ( typeof renderer.compileAsync !== 'function' ) return renderer.compile( scene, camera );
 const materials = new Set();
 scene.traverse( object => {
  for ( const material of Array.isArray( object.material ) ? object.material : object.material ? [ object.material ] : [] ) materials.add( material );
 } );
 if ( scene.overrideMaterial ) materials.add( scene.overrideMaterial );
 const held = [];
 function release() {
  let failure;
  for ( const [ material, lease ] of held.splice( 0 ) ) {
   if ( --lease.count !== 0 ) continue;
   leases.delete( material );
   try {
    if ( material.dispose === lease.wrapper ) {
     if ( lease.descriptor ) Object.defineProperty( material, 'dispose', lease.descriptor );
     else delete material.dispose;
    }
    if ( lease.pending ) lease.original.call( material );
   } catch ( error ) { failure ||= error; }
  }
  if ( failure ) throw failure;
 }
 try {
  for ( const material of materials ) {
   let lease = leases.get( material );
   if ( !lease ) {
    lease = { count: 0, pending: false, original: material.dispose, descriptor: Object.getOwnPropertyDescriptor( material, 'dispose' ) };
    lease.wrapper = () => { lease.pending = true; };
    Object.defineProperty( material, 'dispose', { configurable: true, writable: true, value: lease.wrapper } );
    leases.set( material, lease );
   }
   lease.count ++; held.push( [ material, lease ] );
  }
  return Promise.resolve( renderer.compileAsync( scene, camera ) ).finally( release );
 } catch ( error ) { release(); throw error; }
}
