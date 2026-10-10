/**
 * @module newer/assets/demon_bake_format
 *
 * The prepared plaque displacement format: exact GPU bytes, indexed on disk.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 11 places.
 */
// Prepared decorative displacement retains the exact non-indexed GPU bytes.
// On disk repeated final vertices are indexed; decoding restores their original
// triangle order, including closed skirts and native UV/lightmap coordinates.
export const DEMON_BAKE_VERSION=1;
const names=['positions','normals','uvs','lmuvs'],widths=[3,3,2,2];
/**
 * Builds the identity string of one demon-plaque BSP surface: the texture name and size, the plane-back flag
 * (`flags&2`), the plane normal, both texinfo vectors and every polygon vertex (seven floats each: xyz in Quake units,
 * texture s/t, lightmap s/t). The prepared bake file keys its records by this string; `r_demonbakes.js` recomputes it at
 * load to detect a changed surface, and `tools/bake_displacement.mjs` uses it when writing a bake.
 *
 * @param {msurface_t} surface a world surface with `texinfo.texture`, `plane` and a `polys` chain whose `verts` are
 *   either one `Float32Array` (7 floats per vertex) or an array of 7-element arrays
 * @returns {string} a JSON string; equal strings mean the same source geometry
 */
export function DemonSurfaceSignature(surface){
 const t=surface.texinfo.texture,polys=[];
 for(let p=surface.polys;p;p=p.next)polys.push(Array.from({length:p.numverts},(_,i)=>Array.from({length:7},(_,k)=>p.verts instanceof Float32Array?p.verts[i*7+k]:p.verts[i][k])));
 return JSON.stringify([t.name,t.width,t.height,surface.flags&2,Array.from(surface.plane.normal),surface.texinfo.vecs.map(v=>Array.from(v)),polys]);
}
/**
 * Builds the recipe string of a displacement height field: its size in samples, sampling mode (default `'repeat'`)
 * and the `displacement` depth, step and smoothing (default 0). Stored per record as `settings` so a decoded record is
 * only used when it was baked with the same authored recipe.
 *
 * @param {{ width: number, height: number, sampling?: string, displacement?: { depth?: number, step?: number,
 *   smoothing?: number } }} field the `userData.newerHeight` height field attached to the plaque texture
 * @returns {string} a JSON string of those settings
 */
export function DemonFieldSettings(field){return JSON.stringify([field.width,field.height,field.sampling||'repeat',field.displacement?.depth,field.displacement?.step,field.displacement?.smoothing??0]);}
/**
 * Tells whether a value is a valid "native only" outcome: the diagnostic `R_DemonSurfaceData` fills when it refuses a
 * surface, with `reason` `'triangle-budget'` (limit exactly 262144 triangles) or `'tile-budget'` (limit exactly 16
 * texture tiles) and a safe-integer `required` above that limit. Such a record ships no geometry and the surface keeps
 * its native polygons.
 *
 * @param {?{ reason: string, required: number, limit: number }} value the candidate outcome
 * @returns {boolean} true only for a well-formed outcome with the expected limit for its reason
 */
export function DemonNativeOutcome(value){return !!value&&(['triangle-budget','tile-budget'].includes(value.reason))&&Number.isSafeInteger(value.required)&&value.required>value.limit&&value.limit===(value.reason==='triangle-budget'?262144:16);}
/**
 * Encodes prepared displacement records into the on-disk bake format. Layout: little-endian magic `0x31424451`
 * ("QDB1"), a uint32 header length, the JSON header (`meta` plus `version` = `DEMON_BAKE_VERSION` and one entry per
 * record), padding to 4 bytes, then per geometry record its unique vertices (10 floats: position xyz, normal xyz, uv,
 * lightmap uv; 40 bytes each) followed by one uint32 index per original vertex. Vertices are deduplicated by their exact
 * float bits (so -0 and +0 stay distinct), so decoding restores the original non-indexed triangle order. Used by the
 * offline baker (`tools/bake_displacement.mjs`) and by `r_demonbakes.js` when it generates a custom map's bake in the
 * browser.
 *
 * @param {object} meta header fields kept as-is (e.g. `model`, `bspSha256`, `generatorVersion`); `version` and
 *   `records` are overwritten
 * @param {Array<{ signature: string, settings: string, fieldSha256: string, data: ?object,
 *   nativeOnly?: object }>} records one per surface; `data` is an `R_DemonSurfaceData` result (Float32Array
 *   `positions`/`normals`/`uvs`/`lmuvs`, `triangles`, `topVertexCount`, `skirtTriangles`, `tileRegions`), or null with a
 *   `nativeOnly` outcome
 * @returns {Uint8Array} the complete encoded file (not gzip-compressed)
 * @throws {Error} when a record has `nativeOnly` but also has `data`, or its outcome fails `DemonNativeOutcome`
 */
export function DemonBakeEncode(meta,records){
 const chunks=[],entries=[];let offset=0;
 for(const record of records){
  if(record.nativeOnly){if(record.data!=null||!DemonNativeOutcome(record.nativeOnly))throw Error('Invalid native-only displacement outcome');entries.push({...record,data:undefined,offset});continue;}
  const {data}=record,vertices=data.positions.length/3,unique=[],lookup=new Map(),indices=new Uint32Array(vertices);
  const bits=names.map(name=>new Uint32Array(data[name].buffer,data[name].byteOffset,data[name].length));
  for(let i=0;i<vertices;i++){
   const row=[];for(let a=0;a<4;a++)for(let k=0;k<widths[a];k++)row.push(bits[a][i*widths[a]+k]);
   const key=row.join(',');let index=lookup.get(key);if(index===undefined){index=unique.length/10;lookup.set(key,index);unique.push(...row);}indices[i]=index;
  }
  const packed=new Uint32Array(unique),size=packed.byteLength+indices.byteLength;
  chunks.push(new Uint8Array(packed.buffer),new Uint8Array(indices.buffer));
  entries.push({...record,data:undefined,offset,unique:packed.length/10,vertices,triangles:data.triangles,topVertexCount:data.topVertexCount,skirtTriangles:data.skirtTriangles,tileRegions:data.tileRegions});offset+=size;
 }
 const header=new TextEncoder().encode(JSON.stringify({...meta,version:DEMON_BAKE_VERSION,records:entries})),start=(8+header.length+3)&~3,out=new Uint8Array(start+offset),view=new DataView(out.buffer);
 view.setUint32(0,0x31424451,true);view.setUint32(4,header.length,true);out.set(header,8);let at=start;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}return out;
}
/**
 * Decodes and fully validates a bake file made by `DemonBakeEncode` for one exact map. Called by `r_demonbakes.js` when
 * a shipped or locally stored bake is loaded (always with `compact: true`), and by the baker to verify what it wrote.
 * With `compact` the returned record data keeps the indexed form (`interleaved` 10 floats per unique vertex,
 * `indices`, `payloadBytes`, `gpuBytes`) and exposes `positions`/`normals`/`uvs`/`lmuvs` as lazy getters that expand
 * on first access and count `materializedAttributes`; ordinary rendering binds the compact attributes and never pays
 * this expanded allocation. Without `compact` the four non-indexed Float32Arrays are built at once (total capped at
 * 512 MiB). The compact arrays are views over `buffer`, so the buffer lives as long as the records.
 *
 * @param {ArrayBuffer} buffer the decompressed file, 8 bytes to 512 MiB
 * @param {string} model the map name the bake must declare (e.g. `maps/e1m1.bsp`)
 * @param {string} bspSha256 hex SHA-256 of the exact BSP bytes the bake must declare
 * @param {{ compact?: boolean }} [options] `compact` keeps the indexed vertex form (default false)
 * @returns {{ meta: object, records: Map<string, { data: ?object, settings: string, fieldSha256: string,
 *   nativeOnly?: object }> }} the parsed header and the records keyed by `DemonSurfaceSignature`; `data` is null for a
 *   native-only record
 * @throws {Error} on a bad size, magic or header length; on a version/model/BSP mismatch or more than 4096 records; on
 *   any malformed, duplicated, misplaced or out-of-range record, non-finite sample, bad tile region or vertex index; on
 *   truncated, oversized (non-compact) or trailing data
 */
export function DemonBakeDecode(buffer,model,bspSha256,{compact=false}={}){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<8||buffer.byteLength>512*1024*1024)throw Error('Invalid displacement payload size');
 const view=new DataView(buffer),length=view.getUint32(4,true);if(view.getUint32(0,true)!==0x31424451||length>8*1024*1024||length>buffer.byteLength-8)throw Error('Invalid displacement header');
 const meta=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,length))),start=(8+length+3)&~3;
 if(meta.version!==DEMON_BAKE_VERSION||meta.model!==model||meta.bspSha256!==bspSha256||!Array.isArray(meta.records)||meta.records.length>4096)throw Error('Displacement source/version mismatch');
 const records=new Map();let end=0,total=0;
 for(const r of meta.records){
  if(r.nativeOnly){if(typeof r.signature!=='string'||typeof r.fieldSha256!=='string'||typeof r.settings!=='string'||records.has(r.signature)||r.offset!==end||!DemonNativeOutcome(r.nativeOnly)||['vertices','unique','data','triangles','topVertexCount','skirtTriangles','tileRegions'].some(k=>r[k]!==undefined))throw Error('Invalid native-only displacement record');records.set(r.signature,{data:null,nativeOnly:r.nativeOnly,settings:r.settings,fieldSha256:r.fieldSha256});continue;}
  if(typeof r.signature!=='string'||typeof r.fieldSha256!=='string'||typeof r.settings!=='string'||records.has(r.signature)||!Number.isInteger(r.offset)||r.offset!==end||!Number.isInteger(r.vertices)||r.vertices<0||r.vertices>262144*3||!Number.isInteger(r.unique)||r.unique<0||r.unique>r.vertices||!Number.isInteger(r.triangles)||r.triangles<0||r.vertices!==r.triangles*3||!Number.isInteger(r.topVertexCount)||r.topVertexCount<0||r.topVertexCount>r.vertices||r.topVertexCount%3||!Number.isInteger(r.skirtTriangles)||r.skirtTriangles<0||r.skirtTriangles!==(r.vertices-r.topVertexCount)/3||!Array.isArray(r.tileRegions)||r.tileRegions.length>262144)throw Error('Invalid displacement record');
  const size=r.unique*40+r.vertices*4;end+=size;total+=r.vertices*40;if(start+end>buffer.byteLength||!compact&&total>512*1024*1024)throw Error('Truncated/oversized displacement data');
  const values=new Float32Array(buffer,start+r.offset,r.unique*10),indices=new Uint32Array(buffer,start+r.offset+r.unique*40,r.vertices);
  let covered=0;
  if(!values.every(Number.isFinite)||!r.tileRegions.every(region=>{
   if(!region||!Number.isInteger(region.startVertex)||!Number.isInteger(region.endVertex)||region.startVertex!==covered||region.endVertex<region.startVertex||region.endVertex>r.topVertexCount||region.startVertex%3||region.endVertex%3||!(region.origin===null||Array.isArray(region.origin)&&region.origin.length===2&&region.origin.every(Number.isInteger)))return false;
   covered=region.endVertex;return true;
  })||covered!==r.topVertexCount)throw Error('Invalid displacement samples/regions');
  const data={triangles:r.triangles,topVertexCount:r.topVertexCount,skirtTriangles:r.skirtTriangles,tileRegions:r.tileRegions};
  if(compact){
   for(const index of indices)if(index>=r.unique)throw Error('Invalid displacement vertex index');
   data.interleaved=values;data.indices=indices;data.payloadBytes=buffer.byteLength;data.gpuBytes=values.byteLength+indices.byteLength;
   data.materializedAttributes=0;
   // Public diagnostics can request the original arrays. Ordinary rendering
   // binds the compact attributes and never pays this expanded allocation.
   for(let a=0;a<4;a++)Object.defineProperty(data,names[a],{enumerable:false,configurable:true,get(){
    const width=widths[a],offset=widths.slice(0,a).reduce((n,w)=>n+w,0),array=new Float32Array(r.vertices*width);
    for(let i=0;i<r.vertices;i++)for(let k=0;k<width;k++)array[i*width+k]=values[indices[i]*10+offset+k];
    data.materializedAttributes++;Object.defineProperty(data,names[a],{value:array,enumerable:true});return array;
   }});
  }else{
for(let a=0;a<4;a++)data[names[a]]=new Float32Array(r.vertices*widths[a]);
  const p=data.positions,n=data.normals,u=data.uvs,l=data.lmuvs;
  for(let i=0;i<r.vertices;i++){
   const index=indices[i];if(index>=r.unique)throw Error('Invalid displacement vertex index');
   const source=index*10,a=i*3,b=i*2;
   p[a]=values[source];p[a+1]=values[source+1];p[a+2]=values[source+2];
   n[a]=values[source+3];n[a+1]=values[source+4];n[a+2]=values[source+5];
   u[b]=values[source+6];u[b+1]=values[source+7];l[b]=values[source+8];l[b+1]=values[source+9];
  }
  }
  records.set(r.signature,{data,settings:r.settings,fieldSha256:r.fieldSha256});
 }
 if(start+end!==buffer.byteLength)throw Error('Trailing displacement data');return {meta,records};
}
