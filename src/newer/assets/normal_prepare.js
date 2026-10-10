/**
 * @module newer/assets/normal_prepare
 *
 * Preparing normal maps in the background: from the local store, the shipped bakes, or generated.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 8 places; catches at 1 place.
 */
import {DisplacementStore,DisplacementKey,DisplacementHash,ReadPreparedPayload} from './displacement_store.js';
import {NormalBakeEncode,NormalBakeDecode,NORMAL_GENERATOR_VERSION} from './normal_bake_format.js';
import {NORMAL_BAKES} from './normal_bakes.js';
import {R_HeightFromRGBA,R_MultiScaleHeight,R_NormalsFromHeight,R_NormalsFromCraftedHeight} from '../render/normal_math.js';
import {COM_NewerURL} from '../../engine/common/pak.js';
import {NormalTransport} from './normal_transport.js';
const store=new DisplacementStore(),jobs=new WeakMap();
const copy=view=>view?new view.constructor(view):null;
const same=(a,b)=>a===b||!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function inputStillCurrent(diffuse,input){
 const image=diffuse.image,field=diffuse.userData?.newerHeight,crafted=field?.width===image?.width&&field?.height===image?.height?field:null,edge=crafted?.edgeSource;
 return image?.width===input.width&&image?.height===input.height&&!!crafted===input.crafted&&!!crafted?.derive===input.derive&&crafted?.strength===input.strength&&crafted?.cap===input.cap&&same(image?.data,input.rgba)&&same(diffuse._fullbright?.image?.data||null,input.fullbright)&&same(crafted?.data||null,input.scalar)&&same(crafted?.authoredNormal?.data||null,input.authored)&&(!edge&&!input.edge||!!edge&&!!input.edge&&edge.width===input.edge.width&&edge.height===input.edge.height&&same(edge.offset,input.edge.offset)&&same(edge.data,input.edge.data));
}
function revision(diffuse){const f=diffuse.userData?.newerHeight,e=f?.edgeSource,a=f?.authoredNormal;return [diffuse.version-(diffuse.userData?.normalSamplerUpdates||0),diffuse.image?.data,diffuse.image?.width,diffuse.image?.height,diffuse._fullbright?diffuse._fullbright.version-(diffuse._fullbright.userData?.normalSamplerUpdates||0):undefined,diffuse._fullbright?.image?.data,f,f?.width,f?.height,f?.data,f?.strength,f?.cap,f?.derive,e,e?.data,e?.width,e?.height,e?.offset?.[0],e?.offset?.[1],a,a?.data,a?.width,a?.height];}
/**
 * Cheap per-frame test (gl_post.js, r_newertextures.js) of whether `diffuse` needs a new or refreshed
 * `R_NormalPrepare` job. Follows Three's pixel upload revision contract: compares `texture.version` (less the
 * sampler-only `userData.normalSamplerUpdates`), the image/fullbright buffers and dimensions, and the crafted
 * `userData.newerHeight` recipe (strength, cap, derive, edge source, authored normal) by identity against the
 * revision recorded with the last job. In-place texel writes are therefore only seen after `needsUpdate`, or an
 * explicit `R_NormalPrepare` call. Recipe metadata is checked directly; actual preparation/publishing hashes all bytes.
 *
 * @param {THREE.DataTexture} diffuse RGBA8 diffuse texture (optionally carrying `_fullbright` and `userData.newerHeight`)
 * @returns {boolean} true when no job exists for the texture or any revision field changed since the job started
 */
export function R_NormalPreparationNeeded(diffuse){const work=jobs.get(diffuse),r=revision(diffuse);return !work||r.some((v,i)=>v!==work.revision[i]);}
/**
 * Snapshots everything normal generation reads from `diffuse` into detached copies, so a background job (or
 * tools/bake_normals.mjs) is unaffected by later texel writes. `userData.newerHeight` is used as the crafted height
 * field only when its width and height match the image.
 *
 * @param {THREE.DataTexture} diffuse RGBA8 diffuse texture, 1..2048 texels on each side
 * @returns {{width: number, height: number, rgba: Uint8Array, fullbright: ?Uint8Array, crafted: boolean, derive: boolean,
 *  strength: (number|undefined), cap: (number|undefined), scalar: ?Float32Array, edge: ?{width: number, height: number,
 *  offset: Array<number>, data: Float32Array}, authored: ?Uint8Array}} copied inputs: `rgba`/`authored` are 4 bytes per
 *  texel, `scalar` one 0..1 height per texel (null when it is to be derived from `rgba`), `edge` a separate 0..1 height
 *  field with a two-number texel `offset`; null fields mean the source was absent
 * @throws {Error} 'Invalid normal source dimensions' when the size is not an integer 1..2048 or `data` is not width*height*4 long
 * @throws {Error} 'Invalid crafted normal settings' when a crafted field has non-finite strength/cap, or no `derive` and a scalar of the wrong length
 * @throws {Error} 'Invalid normal edge source' when the edge field has a bad size, offset or a value outside 0..1
 * @throws {Error} 'Invalid authored normal source' when the authored normal map's size differs from the diffuse
 */
export function NormalInputs(diffuse){
 const {width,height,data}=diffuse.image,field=diffuse.userData?.newerHeight,crafted=field?.width===width&&field?.height===height?field:null;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||data?.length!==width*height*4)throw Error('Invalid normal source dimensions');
 const edge=crafted?.edgeSource,donor=crafted?.authoredNormal;
 if(crafted&&(!Number.isFinite(crafted.strength)||!Number.isFinite(crafted.cap)||!crafted.derive&&crafted.data?.length!==width*height))throw Error('Invalid crafted normal settings');
 if(edge&&(!Number.isInteger(edge.width)||!Number.isInteger(edge.height)||edge.width<1||edge.height<1||edge.width>2048||edge.height>2048||edge.data?.length!==edge.width*edge.height||!Array.isArray(edge.offset)||edge.offset.length!==2||!edge.offset.every(Number.isFinite)||!edge.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid normal edge source');
 if(donor&&(donor.width!==width||donor.height!==height||donor.data?.length!==width*height*4))throw Error('Invalid authored normal source');
 return {width,height,rgba:copy(data),fullbright:copy(diffuse._fullbright?.image?.data),crafted:!!crafted,derive:!!crafted?.derive,
  strength:crafted?.strength,cap:crafted?.cap,scalar:copy(crafted?.data),edge:edge?{...edge,offset:[...edge.offset],data:copy(edge.data)}:null,authored:copy(donor?.data)};
}
/**
 * Content key for a set of normal inputs: SHA-256 (hex) of the JSON of `NORMAL_GENERATOR_VERSION`, the recipe
 * fields and SHA-256 digests of every input buffer. It names entries in `NORMAL_BAKES` (shipped bakes), the
 * on-disk `DisplacementStore` cache and the normals manifest, so any byte or generator-version change gives a new key.
 *
 * @param {ReturnType<typeof NormalInputs>} input snapshot from `NormalInputs`
 * @returns {Promise<string>} 64-character lowercase hex key
 */
export async function NormalInputKey(input){
 const digest=view=>view?DisplacementHash(new Uint8Array(view.buffer,view.byteOffset,view.byteLength)):null;
 return DisplacementKey([NORMAL_GENERATOR_VERSION,input.width,input.height,input.crafted,input.derive,input.strength,input.cap,
  await digest(input.rgba),await digest(input.fullbright),await digest(input.scalar),input.edge?[input.edge.width,input.edge.height,input.edge.offset,await digest(input.edge.data)]:null,await digest(input.authored)]);
}
/**
 * Generates normal data synchronously from a `NormalInputs` snapshot. This is the fallback when no shipped bake
 * exists (called inside `DisplacementStore.ensure`) and the generator used by tools/bake_normals.mjs. Uses the
 * authored normal map when present; otherwise derives a height field (multi-scale height from RGBA and fullbright
 * when no crafted scalar is given) and computes normals from it, crafted with strength/cap/edge when `input.crafted`.
 *
 * @param {ReturnType<typeof NormalInputs>} input snapshot from `NormalInputs`
 * @returns {{pixels: Uint8Array, scalar: Float32Array, reference: ?Uint8Array, referenceWidth: number, referenceHeight: number}}
 *  `pixels` RGBA8 tangent-space normals with height in alpha, `scalar` the 0..1 height per texel, and `reference` the
 *  strength-0 normals of the edge field with its size in texels (null and 0 without an edge source)
 * @throws {Error} 'Invalid normal scalar input' when the height field is the wrong length or has values outside 0..1
 * @throws {Error} 'Invalid normal sample coverage' when the normals are not width*height*4 long
 */
export function NormalGenerate(input){
 const {width,height}=input,n=width*height;
 const scalar=input.scalar||R_MultiScaleHeight(R_HeightFromRGBA(input.rgba,width,height,input.fullbright),width,height);
 if(scalar.length!==n||!scalar.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid normal scalar input');
 const pixels=input.authored|| (input.crafted?R_NormalsFromCraftedHeight(scalar,width,height,input.strength,input.cap,input.edge):R_NormalsFromHeight(scalar,width,height));
 if(pixels.length!==n*4)throw Error('Invalid normal sample coverage');
 const reference=input.edge?R_NormalsFromCraftedHeight(input.edge.data,input.edge.width,input.edge.height,0):null;
 return {pixels,scalar,reference,referenceWidth:input.edge?.width||0,referenceHeight:input.edge?.height||0};
}
/**
 * Starts (or reuses) the background job that prepares normal data for `diffuse`, preferring a shipped bake from
 * `NORMAL_BAKES` (fetched through `NormalTransport`), then the local disk cache, then generation that is stored to
 * disk. Called when `R_NormalPreparationNeeded` says so, and for skin companions in r_newerskins.js. An existing job
 * whose snapshot still matches the texture is kept (its revision refreshed); otherwise it is cancelled. The job is
 * kept in a module WeakMap keyed by the texture and cancelled when the texture fires `dispose`. If the texture's
 * bytes changed while preparing, the job is cancelled and a replacement started whose outcome is copied in. On
 * success the job becomes 'ready' and the texture dispatches `newertextureupdated`; failures are caught into
 * `status: 'error'` and `error` rather than rejecting `promise`.
 *
 * @param {THREE.DataTexture} diffuse RGBA8 diffuse texture to prepare normals for
 * @param {{disk?: DisplacementStore, loader?: Function, generate?: function(ReturnType<typeof NormalInputs>): ReturnType<typeof NormalGenerate>}} [options]
 *  `disk` the cache (default the module's shared `DisplacementStore` in the origin-private filesystem directory
 *  quaked-displacement-v1), `loader` passed to `NormalTransport` for fetching shipped bakes, `generate` the generator
 *  (default `NormalGenerate`)
 * @returns {{status: string, data: ?Object, error: ?string, input: Object, revision: Array<*>, promise: Promise<void>,
 *  cancel: function(): void, key?: string, source?: string, persistence?: string}} the live job record (mutated as it
 *  progresses): `status` 'loading' | 'ready' | 'error' | 'cancelled'; `data` the decoded normal payload once ready;
 *  `source` 'shipped', 'disk' or 'generated-and-stored'; `persistence` the storage persistence grant reported by the disk cache
 * @throws {Error} synchronously, from `NormalInputs`, when the texture's inputs are invalid
 */
export function R_NormalPrepare(diffuse,{disk=store,loader,generate=NormalGenerate}={}){
 const old=jobs.get(diffuse);if(old&&inputStillCurrent(diffuse,old.input)){old.revision=revision(diffuse);return old;}old?.cancel();
 const work={status:'loading',data:null,error:null,input:NormalInputs(diffuse),revision:revision(diffuse)},controller=new AbortController();jobs.set(diffuse,work);
 const dispose=()=>{controller.abort();work.release?.();work.status='cancelled';work.data=null;if(jobs.get(diffuse)===work)jobs.delete(diffuse);diffuse.removeEventListener('dispose',dispose);};work.cancel=dispose;diffuse.addEventListener('dispose',dispose);
 work.promise=(async()=>{
  const input=work.input,key=await NormalInputKey(input);work.key=key;const decode=bytes=>{const data=NormalBakeDecode(bytes,key,input.width,input.height);if(data.referenceWidth!==(input.edge?.width||0)||data.referenceHeight!==(input.edge?.height||0))throw Error('Prepared normal reference coverage mismatch');return data;},spec=NORMAL_BAKES[key];
  let result;
  if(spec){
   if(controller.signal.aborted)return;
   const transport=NormalTransport({...spec},key,input.width,input.height,loader);work.release=transport.release;
   const data=await transport.promise;if(data.referenceWidth!==(input.edge?.width||0)||data.referenceHeight!==(input.edge?.height||0))throw Error('Prepared normal reference coverage mismatch');result={data,source:'shipped'};
  }else result=await disk.ensure(key,{signal:controller.signal,decode,generate:()=>NormalBakeEncode(key,input.width,input.height,generate(input))});
  if(controller.signal.aborted)return;
  if(await NormalInputKey(NormalInputs(diffuse))!==key){dispose();const replacement=R_NormalPrepare(diffuse,{disk,loader,generate});await replacement.promise;Object.assign(work,{status:replacement.status,data:replacement.data,source:replacement.source,error:replacement.error});return;}
  work.data=result.data;work.source=result.source;work.persistence=result.persistence;work.status='ready';diffuse.dispatchEvent({type:'newertextureupdated'});
 })().catch(e=>{if(work.status!=='cancelled'){work.status='error';work.error=String(e.message||e);}});return work;
}
/**
 * Looks up the current `R_NormalPrepare` job for a texture without starting one (gl_normals.js waits for
 * `status === 'ready'`; r_newertextures.js counts progress).
 *
 * @param {THREE.DataTexture} diffuse diffuse texture
 * @returns {ReturnType<typeof R_NormalPrepare>|undefined} the job record, or undefined when none was started or it was cancelled
 */
export function R_NormalPrepared(diffuse){return jobs.get(diffuse);}

/**
 * Diagnostic record of a `NormalInputs` snapshot for tests and trials: the `NormalInputKey` plus each recipe field and
 * the SHA-256 digest of each input buffer, so a key mismatch against the normals manifest can be traced to one input.
 *
 * @param {ReturnType<typeof NormalInputs>} input snapshot from `NormalInputs`
 * @returns {Promise<{key: string, width: number, height: number, crafted: boolean, derive: boolean, strength: (number|undefined),
 *  cap: (number|undefined), rgba: ?string, fullbright: ?string, scalar: ?string, edge: ?Array<*>, authored: ?string}>}
 *  hex digests, null where the buffer is absent; `edge` is [width, height, offset, digest]
 */
export async function NormalInputWitness(input){
 const digest=view=>view?DisplacementHash(new Uint8Array(view.buffer,view.byteOffset,view.byteLength)):null;
 return {key:await NormalInputKey(input),width:input.width,height:input.height,crafted:input.crafted,derive:input.derive,strength:input.strength,cap:input.cap,rgba:await digest(input.rgba),fullbright:await digest(input.fullbright),scalar:await digest(input.scalar),edge:input.edge?[input.edge.width,input.edge.height,input.edge.offset,await digest(input.edge.data)]:null,authored:await digest(input.authored)};
}
