/**
 * @module newer/render/r_shaderwarm
 *
 * Compiling shaders ahead of need, keeping their materials alive while they compile, keeping compiled programs for the
 * session, and the effects' warm-up registry (docs/demo-performance-2026-10-14.md).
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `shaderFunctionSerial`, `keptCount`; 6 module-level collections (Map/WeakMap/WeakSet/Array).
 *
 * Errors: throws at 2 places; catches at 4 places (an effect provider that throws is reported and skipped).
 */
import { Mesh as THREE_Mesh, Points as THREE_Points } from 'three';
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

// Programs kept for the session (R_KeepPrograms). three destroys a program as soon as no material uses it, so a level's
// models, a pickup's glow drawn again after it went out of view, or the next demo's map, built from new materials with
// the very same shaders, compiled them all over again: each a stall of 20-700 ms on Apple's GPUs, which cannot compile
// in the background (docs/demo-performance-2026-10-14.md).
const kept = new WeakSet();
let keptCount = 0;
/** The most programs kept; past it, programs are freed by three as before (a guard against a shader made per object). */
export const KEEP_PROGRAMS_MAX = 512;
/**
 * Keeps every program the renderer has compiled so far for the rest of the session, up to `KEEP_PROGRAMS_MAX`: each is
 * counted as used once more (three's `WebGLProgram.usedTimes`), so the release when its last material is disposed
 * leaves it compiled for the next material with the same shader. Cheap to call every frame (a set lookup per program).
 * Programs of a ShaderMaterial are found again only while its shader text keeps its
 * three shader-cache number, that is while some material with that text is alive (see r_powerups.js, which keeps its
 * materials for reuse).
 *
 * @param {THREE.WebGLRenderer} renderer the game's renderer (`info.programs` is read)
 * @returns {number} how many programs are kept
 */
export function R_KeepPrograms( renderer ) {
 const programs = renderer?.info?.programs;
 if ( ! programs ) return keptCount;
 for ( const program of programs ) {
  if ( keptCount >= KEEP_PROGRAMS_MAX ) break;
  if ( kept.has( program ) || typeof program.usedTimes !== 'number' ) continue;
  kept.add( program ); program.usedTimes ++; keptCount ++;
 }
 return keptCount;
}

// One material kept per ShaderMaterial shader text (R_DisposeKeepingShader): three numbers each shader text in its shader
// cache only while a material using it is alive, and that number is part of the program's key, so a later material with
// the same text after the last one was disposed would get a new number and so a new key: a fresh compile even though
// R_KeepPrograms kept the old program.
const shaderAnchors = new Map();
/**
 * Disposes a material, except the first ShaderMaterial of each shader text (vertex and fragment), which is kept,
 * undrawn, for the session: its shaders keep their three shader-cache numbers, so the next material made from the same
 * text finds its program (kept by `R_KeepPrograms`) instead of compiling it again. For materials made and dropped as
 * things come and go (r_powerups.js: a pickup's glow and fire, rebuilt each time it comes back into view). Holds one
 * material (and the JavaScript objects its uniforms name) per distinct shader text.
 *
 * @param {?THREE.Material} material the material to let go
 * @returns {boolean} true when it was kept as its shader text's anchor (not disposed)
 */
export function R_DisposeKeepingShader( material ) {
 if ( material == null ) return false;
 if ( material.isShaderMaterial !== true || typeof material.vertexShader !== 'string' ) { material.dispose(); return false; }
 const key = material.vertexShader + '\u0000' + material.fragmentShader;
 const anchor = shaderAnchors.get( key );
 if ( anchor === undefined ) { shaderAnchors.set( key, material ); return true; }
 if ( anchor !== material ) material.dispose();
 return anchor === material;
}

// Effects built on first use (r_fireball.js, r_venom.js, r_decals.js, r_motes.js, r_wallburn.js): each registers how
// to build its meshes, so a level's warm-up (gl_rmain.js R_LevelShaderWarm) compiles their programs before the first
// explosion, spit or burn instead of in the frame it appears.
const warmProviders = [], warmScenes = [];
/**
 * Registers an effect's meshes for the shader warm-up. Called once by the effect module when it loads.
 *
 * @param {string} name the effect, for the console when its provider throws
 * @param {() => (THREE.Object3D|Array<THREE.Object3D>|null)} provide builds the effect's meshes if it has not yet (as
 *   its first draw would) and returns them, or null when the effect is off or cannot build yet
 */
export function R_ShaderWarmRegister( name, provide ) { warmProviders.push( { name, provide } ); }
/**
 * Registers passes an effect draws in a scene of its own (no lights, its own camera: r_wallburn.js's paint passes
 * into its burn targets), whose programs differ from the same materials' in the level's scene. Called once by the
 * effect module when it loads.
 *
 * @param {string} name the effect, for the console when its provider throws
 * @param {() => (Array<{ scene: THREE.Scene, camera: THREE.Camera }>|null)} provide builds the passes if they are not
 *   yet and returns their scenes and cameras, or null when the effect is off or cannot build yet
 */
export function R_ShaderWarmRegisterScene( name, provide ) { warmScenes.push( { name, provide } ); }
/**
 * The scenes registered with `R_ShaderWarmRegisterScene`, built now if they were not, for the warm-up to compile
 * (gl_rmain.js `R_WarmShaders`, with `renderer.compile`).
 *
 * @returns {Array<{ scene: THREE.Scene, camera: THREE.Camera }>} the scenes
 */
export function R_ShaderWarmScenes() {
 const out = [];
 for ( const { name, provide } of warmScenes ) {
  try { out.push( ...( provide() || [] ) ); } catch ( error ) { console.warn( 'shader warm-up: ' + name + ' could not be built', error ); }
 }
 return out;
}
/**
 * Stand-ins for every registered effect's drawable meshes, to compile with the scene: one object of the same kind (a
 * Mesh or Points) with the same geometry and material for each Mesh or Points the effects have, visible, never
 * frustum-culled and parentless, so the effects' own meshes keep their place, parents and visibility. Allocates the
 * stand-ins (the warm-up drops them after compiling).
 *
 * @returns {Array<THREE.Object3D>} the stand-ins
 */
export function R_ShaderWarmObjects() {
 const out = [];
 for ( const { name, provide } of warmProviders ) {
  let objects;
  try { objects = provide(); } catch ( error ) { console.warn( 'shader warm-up: ' + name + ' could not be built', error ); continue; }
  for ( const root of [].concat( objects || [] ) ) root?.traverse?.( object => {
   if ( ! ( object.isMesh || object.isPoints ) || object.material == null || object.geometry == null ) return;
   const proxy = object.isPoints ? new THREE_Points( object.geometry, object.material ) : new THREE_Mesh( object.geometry, object.material );
   proxy.frustumCulled = false; proxy.name = 'warm:' + ( object.name || name );
   out.push( proxy );
  } );
 }
 return out;
}
