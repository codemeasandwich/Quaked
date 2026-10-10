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
import {R_HeightFromRGBA,R_MultiScaleHeight,R_NormalsFromHeight,R_NormalsFromCraftedHeight} from '../render/gl_normals.js';
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
// Per-frame selector follows Three's pixel upload revision contract. In-place
// texel writes require needsUpdate, or an explicit R_NormalPrepare call. Recipe
// metadata is checked directly; actual preparation/publishing hashes all bytes.
export function R_NormalPreparationNeeded(diffuse){const work=jobs.get(diffuse),r=revision(diffuse);return !work||r.some((v,i)=>v!==work.revision[i]);}
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
export async function NormalInputKey(input){
 const digest=view=>view?DisplacementHash(new Uint8Array(view.buffer,view.byteOffset,view.byteLength)):null;
 return DisplacementKey([NORMAL_GENERATOR_VERSION,input.width,input.height,input.crafted,input.derive,input.strength,input.cap,
  await digest(input.rgba),await digest(input.fullbright),await digest(input.scalar),input.edge?[input.edge.width,input.edge.height,input.edge.offset,await digest(input.edge.data)]:null,await digest(input.authored)]);
}
export function NormalGenerate(input){
 const {width,height}=input,n=width*height;
 const scalar=input.scalar||R_MultiScaleHeight(R_HeightFromRGBA(input.rgba,width,height,input.fullbright),width,height);
 if(scalar.length!==n||!scalar.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid normal scalar input');
 const pixels=input.authored|| (input.crafted?R_NormalsFromCraftedHeight(scalar,width,height,input.strength,input.cap,input.edge):R_NormalsFromHeight(scalar,width,height));
 if(pixels.length!==n*4)throw Error('Invalid normal sample coverage');
 const reference=input.edge?R_NormalsFromCraftedHeight(input.edge.data,input.edge.width,input.edge.height,0):null;
 return {pixels,scalar,reference,referenceWidth:input.edge?.width||0,referenceHeight:input.edge?.height||0};
}
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
export function R_NormalPrepared(diffuse){return jobs.get(diffuse);}

export async function NormalInputWitness(input){
 const digest=view=>view?DisplacementHash(new Uint8Array(view.buffer,view.byteOffset,view.byteLength)):null;
 return {key:await NormalInputKey(input),width:input.width,height:input.height,crafted:input.crafted,derive:input.derive,strength:input.strength,cap:input.cap,rgba:await digest(input.rgba),fullbright:await digest(input.fullbright),scalar:await digest(input.scalar),edge:input.edge?[input.edge.width,input.edge.height,input.edge.offset,await digest(input.edge.data)]:null,authored:await digest(input.authored)};
}
