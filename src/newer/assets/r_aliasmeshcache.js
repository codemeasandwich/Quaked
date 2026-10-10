/**
 * @module newer/assets/r_aliasmeshcache
 *
 * The cache of prepared alias meshes.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
import {ALIAS_MESH_BAKES} from './alias_mesh_bakes.js';
import {AliasMeshSignature,AliasMeshValidate} from './alias_mesh_format.js';
const cache=new Map();let bytes=0;
function put(key,value){
 if(cache.has(key))bytes-=cache.get(key).bytes;
 const entry={commands:value.commands.slice(),order:value.order.slice()};entry.bytes=key.length*2+entry.commands.byteLength+entry.order.byteLength;
 cache.delete(key);cache.set(key,entry);bytes+=entry.bytes;
 while(cache.size>64||bytes>8*1024*1024){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}
 return entry;
}
/**
 * Finds the prepared strip/fan command list for an alias model, called by `GL_MakeAliasModelDisplayLists`
 * (gl_mesh.js, through the hooks table) each time a model is meshed, so `BuildTris` can be skipped. Looks first in the
 * in-memory cache, then in the shipped `ALIAS_MESH_BAKES` table (validating and caching the record on first use).
 * The cache is least-recently-used, holds at most 64 meshes or 8 MiB, and lasts for the page session.
 *
 * @param {aliashdr_t} header the alias header being meshed; keyed by `AliasMeshSignature`
 * @returns {?{ commands: Int32Array, order: Int32Array }} fresh copies the caller may keep or mutate (GL command words
 *   and vertex order), or null when neither the cache nor the shipped table has this mesh
 * @throws {Error} from `AliasMeshValidate` when the shipped record for this signature is malformed
 */
export function R_AliasMeshLookup(header){
 const key=AliasMeshSignature(header),existing=cache.get(key);if(existing){cache.delete(key);cache.set(key,existing);return {commands:existing.commands.slice(),order:existing.order.slice()};}
 const record=ALIAS_MESH_BAKES[key];if(!record)return null;
 const entry=put(key,AliasMeshValidate(record,header));return {commands:entry.commands.slice(),order:entry.order.slice()};
}
/**
 * Stores a mesh that `BuildTris` has just generated, so the next load of an identical header (for example the same
 * model on another level) reuses it; called by `GL_MakeAliasModelDisplayLists` when `R_AliasMeshLookup` returned null.
 * The arrays are copied, so the caller's reusable buffers may be overwritten afterwards. Moves the entry to the newest
 * place and evicts the oldest entries beyond 64 meshes or 8 MiB.
 *
 * @param {aliashdr_t} header the alias header that was meshed; keyed by `AliasMeshSignature`
 * @param {Int32Array} commands the generated GL command list (counts, s/t float bits, 0 terminator)
 * @param {Int32Array} order the generated vertex order, one vertex index per emitted vertex
 */
export function R_AliasMeshRemember(header,commands,order){put(AliasMeshSignature(header),{commands,order});}
/**
 * Reports the cache's size, for tests and diagnostics.
 *
 * @returns {{ entries: number, bytes: number }} cached meshes and their approximate bytes (key characters at 2 bytes
 *   each plus both typed arrays)
 */
export function R_AliasMeshCacheStatus(){return {entries:cache.size,bytes};}
