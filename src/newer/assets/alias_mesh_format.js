/**
 * @module newer/assets/alias_mesh_format
 *
 * The prepared alias mesh format: its version, signature and validation.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 5 places.
 */
export const ALIAS_MESH_VERSION='quake-original-strip-fan-1';
/**
 * Builds the identity key of an alias model's mesh: the format version plus every header field that `BuildTris`
 * (gl_mesh.js) reads to make its strip/fan command list. Two headers with the same signature mesh identically, so the
 * string keys both the shipped `ALIAS_MESH_BAKES` table and the in-memory cache in r_aliasmeshcache.js.
 *
 * @param {aliashdr_t} h loaded alias header; reads `numverts`, `numtris`, `skinwidth`, `skinheight`, the first
 *   `numtris` `triangles` (`facesfront`, `vertindex`) and the first `numverts` `stverts` (`onseam`, `s`, `t`, texels)
 * @returns {string} JSON array text beginning with `ALIAS_MESH_VERSION`
 */
export function AliasMeshSignature(h){return JSON.stringify([ALIAS_MESH_VERSION,h.numverts,h.numtris,h.skinwidth,h.skinheight,h.triangles.slice(0,h.numtris).map(t=>[t.facesfront,...t.vertindex]),h.stverts.slice(0,h.numverts).map(v=>[v.onseam,v.s,v.t])]);}
/**
 * Checks a prepared (shipped) mesh record against the header it is meant for before the renderer trusts it, when
 * r_aliasmeshcache.js first loads a record from `ALIAS_MESH_BAKES`. The command list must be Quake's GL command format:
 * a vertex count (positive for a triangle strip, negative for a fan, at least 3), then two int32 words per vertex holding
 * the float bits of the s and t texture coordinates (must be finite), ending with a single 0. The vertex and triangle
 * totals must match `order` and `h.numtris`.
 *
 * @param {{ commands: Array<number>, order: Array<number> }} record untrusted record: `commands` int32 values (at most
 *   8192), `order` vertex indices in `0..h.numverts-1` (at most 8192), one per emitted vertex
 * @param {aliashdr_t} h the alias header the record is for; reads `numverts` and `numtris`
 * @returns {{ commands: Int32Array, order: Int32Array }} newly allocated typed copies of the validated arrays
 * @throws {Error} 'Invalid alias mesh record' for a missing or out-of-range array; 'Invalid alias mesh primitive' for a
 *   count below 3 or one that runs past the end; 'Invalid alias mesh UV' for a non-finite coordinate; 'Invalid alias mesh
 *   terminator/order' when the 0 is not last or the totals disagree; 'Missing alias mesh terminator' when there is no 0
 */
export function AliasMeshValidate(record,h){
 if(!record||!Array.isArray(record.commands)||!Array.isArray(record.order)||record.commands.length>8192||record.order.length>8192||!record.commands.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)||!record.order.every(v=>Number.isInteger(v)&&v>=0&&v<h.numverts))throw Error('Invalid alias mesh record');
 const commands=new Int32Array(record.commands),order=new Int32Array(record.order),bits=new Int32Array(1),float=new Float32Array(bits.buffer);let at=0,vertices=0,triangles=0;
 while(at<commands.length){const count=commands[at++];if(!count){if(at!==commands.length||vertices!==order.length||triangles!==h.numtris)throw Error('Invalid alias mesh terminator/order');return {commands,order};}
  const size=Math.abs(count);if(size<3||at+size*2>=commands.length)throw Error('Invalid alias mesh primitive');
  for(let i=0;i<size*2;i++){bits[0]=commands[at++];if(!Number.isFinite(float[0]))throw Error('Invalid alias mesh UV');}vertices+=size;triangles+=size-2;
 }
 throw Error('Missing alias mesh terminator');
}
