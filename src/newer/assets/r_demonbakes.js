/**
 * @module newer/assets/r_demonbakes
 *
 * Loading prepared plaque displacement for the current map.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `active`, `surfaces`; 1 module-level collection (Map/Set).
 *
 * Errors: throws at 10 places; catches at 2 places.
 */
import {R_NewerTexturesStatus} from '../render/r_newertextures.js';
import {DisplacementStore,DisplacementKey} from './displacement_store.js';
import {R_DemonSurfaceData,DEMON_TEXTURES,DEMON_GENERATOR_VERSION} from '../render/r_demonrelief.js';
import {PreparedLoad} from './prepared_transport.js';
import {PREPARED_CORPUS} from '../../prepared_corpus.js';
import {DEMON_BAKES} from './demon_bakes.js';
import {DemonBakeDecode,DemonBakeEncode,DEMON_BAKE_VERSION,DemonSurfaceSignature,DemonFieldSettings} from './demon_bake_format.js';
import {COM_FindFile,COM_NewerURL} from '../../engine/common/pak.js';
const sourceKeys=new WeakMap(),entries=new Map(),content=new Map(),fields=new WeakMap();
const unprepared={status:'unprepared',data:null};
let active=null,surfaces=new Map();
const store=new DisplacementStore();
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export const DEMON_BAKE_TIMEOUT_MS=10000;
function decodedBytes(data){
 const compact=[...data.records.values()].find(r=>r.data?.interleaved);
 return compact?compact.data.payloadBytes:[...data.records.values()].filter(r=>r.data).reduce((n,r)=>n+r.data.positions.byteLength+r.data.normals.byteLength+r.data.uvs.byteLength+r.data.lmuvs.byteLength,0);
}
function forget(key,entry){
 entries.delete(key);
 if(content.get(entry.identity)===entry){const replacement=[...entries.values()].find(e=>e.identity===entry.identity&&e.data);if(replacement)content.set(entry.identity,replacement);else content.delete(entry.identity);}
 if(entry.status==='loading')entry.cancel('Displacement prefetch evicted');
}
function trim(){
 const bytes=()=>{const seen=new Set();let total=0;for(const e of entries.values())if(e.data&&!seen.has(e.data)){seen.add(e.data);total+=e.decodedBytes||0;}return total;};
 while(entries.size>3||bytes()>256*1024*1024){const victim=[...entries].find(([,e])=>!e.pins);if(!victim)break;forget(...victim);}
}
async function load(file,{signal}){return PreparedLoad(file,{signal});}

export function R_DemonBakePrefetch(name,bytes=typeof name==='string'?COM_FindFile(name)?.data:null,loader=load,timeoutMs=DEMON_BAKE_TIMEOUT_MS){
 if((!DEMON_BAKES[name]?.length&&!PREPARED_CORPUS[name])||!bytes)return {...unprepared,promise:Promise.resolve()};
 let keys=sourceKeys.get(bytes.buffer);if(!keys){keys=new Map();sourceKeys.set(bytes.buffer,keys);}
 const range=name+':'+bytes.byteOffset+':'+bytes.byteLength;let key=keys.get(range);if(!key){key={};keys.set(range,key);}
 const previous=entries.get(key);if(previous){entries.delete(key);entries.set(key,previous);return previous;}
 const entry={status:'loading',data:null,error:null,pins:0,decodedBytes:0};entries.set(key,entry);
 const controller=new AbortController();let timer,rejectDeadline,cancelled=false;
 const deadline=new Promise((_,reject)=>{rejectDeadline=reject;timer=setTimeout(()=>entry.cancel('Displacement load timed out'),timeoutMs);});
 entry.cancel=message=>{cancelled=true;controller.abort();rejectDeadline(Error(message));};
 const prepared=sha(bytes).then(async bspSha256=>{
  if(cancelled)throw Error('Displacement request cancelled');
  const spec=DEMON_BAKES[name]?.find(s=>s.bspSha256===bspSha256);if(!spec){if(PREPARED_CORPUS[name]?.includes(bspSha256))throw Error('Bundled sculpt data missing for exact BSP identity');return {status:'unprepared',data:null};}
  entry.identity=name+':'+bspSha256;
  const shared=content.get(entry.identity);
  if(shared&&shared!==entry){entry.canonical=shared;shared.pins+=entry.pins;await shared.promise;if(cancelled)throw Error('Displacement request cancelled');return {status:shared.status,data:shared.data,error:shared.error};}
  content.set(entry.identity,entry);
  const buffer=await loader(spec.parts||spec.file+'?v='+spec.sha256,{signal:controller.signal});
  if(cancelled)throw Error('Displacement request cancelled');
  if(await sha(buffer)!==spec.rawSha256)throw Error('Displacement checksum mismatch');
  if(cancelled)throw Error('Displacement request cancelled');
  const data=DemonBakeDecode(buffer,name,bspSha256,{compact:true});if(spec.generatorVersion&&(spec.generatorVersion!==DEMON_GENERATOR_VERSION||data.meta.generatorVersion!==spec.generatorVersion))throw Error('Shipped sculpt generator version mismatch');entry.decodedBytes=decodedBytes(data);
  return {status:'ready',data};
 });
 entry.promise=Promise.race([prepared,deadline]).then(result=>{entry.data=result.data;entry.status=result.status;entry.error=result.error||null;
  if(entry.data){entry.decodedBytes=decodedBytes(entry.data);if(!content.has(entry.identity)&&entries.has(key))content.set(entry.identity,entry);}}).catch(error=>{entry.status='error';entry.data=null;entry.error=String(error.message||error);}).finally(()=>{clearTimeout(timer);trim();});trim();return entry;
}
function fieldIdentity(field){
 if(!ArrayBuffer.isView(field.data))return {promise:Promise.reject(Error('Invalid displacement height source'))};
 const bytes=new Uint8Array(field.data.buffer,field.data.byteOffset,field.data.byteLength),old=fields.get(field);
 if(old?.data===field.data&&old.bytes.length===bytes.length){let same=true;for(let i=0;i<bytes.length;i++)if(old.bytes[i]!==bytes[i]){same=false;break;}if(same)return old;}
 const snapshot=bytes.slice(),identity={data:field.data,bytes:snapshot,promise:sha(snapshot)};fields.set(field,identity);return identity;
}
function clonePolys(p){
 if(!p)return null;return {...p,verts:p.verts instanceof Float32Array?p.verts.slice():p.verts.map(v=>Array.from(v)),next:clonePolys(p.next)};
}
function customInputsChanged(owner,model,list=[]){
 const current=(model.surfaces||list).filter(s=>DEMON_TEXTURES.has(s?.texinfo?.texture?.name)&&s.texinfo.texture.gl_texture?.userData.newerHeight?.displacement);
 return current.length!==owner.inputs.length||owner.inputs.some((input,i)=>{const field=current[i]?.texinfo?.texture?.gl_texture?.userData.newerHeight;return current[i]!==input.surface||field!==input.field||DemonFieldSettings(field)!==input.settings||DemonSurfaceSignature(input.surface)!==input.signature||fieldIdentity(field)!==input.identity;});
}
function beginCustom(owner,model,list){
 if(owner.custom)return;
 let work=owner.entry;const name=model.name;
 // Authoritative field membership is known only after actual current map art
 // reaches a terminal result. A future/offscreen map never publishes this job.
 if(!R_NewerTexturesStatus(model).settled){owner.waiting=true;return;}
 owner.waiting=false;
 owner.custom=new AbortController();owner.transport=owner.entry;owner.entry=work={status:'loading',phase:'inputs',data:null,error:null};
 const source=(model.surfaces||list).filter(s=>DEMON_TEXTURES.has(s?.texinfo?.texture?.name)&&s.texinfo.texture.gl_texture?.userData.newerHeight?.displacement);
 const captured=new Map();
 owner.inputs=source.map(surface=>({surface,field:surface.texinfo.texture.gl_texture.userData.newerHeight,settings:DemonFieldSettings(surface.texinfo.texture.gl_texture.userData.newerHeight),signature:DemonSurfaceSignature(surface),identity:fieldIdentity(surface.texinfo.texture.gl_texture.userData.newerHeight)}));
 const snapshots=source.map(surface=>{
  const field=surface.texinfo.texture.gl_texture.userData.newerHeight;
  let copied=captured.get(field);if(!copied){copied={...field,displacement:{...field.displacement},data:field.data.slice()};captured.set(field,copied);}
  return {...surface,plane:{...surface.plane,normal:Array.from(surface.plane.normal)},polys:clonePolys(surface.polys),texinfo:{...surface.texinfo,vecs:surface.texinfo.vecs.map(v=>Array.from(v)),texture:{...surface.texinfo.texture,gl_texture:{userData:{newerHeight:copied}}}}};
 });
 work.promise=(async()=>{
  const bspSha256=await sha(owner.bytes),hashes=new Map();for(const field of captured.values())hashes.set(field,await sha(field.data));
  const expected=snapshots.map(surface=>({signature:DemonSurfaceSignature(surface),settings:DemonFieldSettings(surface.texinfo.texture.gl_texture.userData.newerHeight),fieldSha256:hashes.get(surface.texinfo.texture.gl_texture.userData.newerHeight)}));
  const key=await DisplacementKey([DEMON_GENERATOR_VERSION,DEMON_BAKE_VERSION,name,bspSha256,expected]);
  const decode=buffer=>{
   const data=DemonBakeDecode(buffer,name,bspSha256,{compact:true});
   if(data.meta.generatorVersion!==DEMON_GENERATOR_VERSION||data.meta.cacheKey!==key||data.records.size!==expected.length)throw Error('Cached displacement identity/coverage mismatch');
   for(const input of expected){const record=data.records.get(input.signature);if(!record||record.settings!==input.settings||record.fieldSha256!==input.fieldSha256)throw Error('Cached displacement input mismatch');}
   return data;
  };
  const result=await store.ensure(key,{signal:owner.custom.signal,onPhase:phase=>work.phase=phase,decode,generate:()=>{
   const records=snapshots.map((surface,i)=>{const diagnostic={},data=R_DemonSurfaceData(surface,diagnostic);if(!data&&!diagnostic.reason)throw Error('Invalid custom displacement input');return {...expected[i],data,...(!data?{nativeOnly:diagnostic}:{})};});
   return DemonBakeEncode({model:name,bspSha256,cacheKey:key,generatorVersion:DEMON_GENERATOR_VERSION},records);
  }});
  if(active!==owner||owner.custom.signal.aborted)return;
  if(customInputsChanged(owner,model,list)){owner.custom=null;owner.entry=owner.transport;surfaces.clear();return;}
  work.data=result.data;work.status='ready';work.source=result.source;work.persistence=result.persistence;
 })().catch(error=>{if(active!==owner)return;work.status='error';work.error=String(error.message||error);});
}
export function R_DemonBakeStatus(){const work=active?.entry;return {pending:active?.waiting||work?.status==='loading'||work?.status==='error'?1:0,error:work?.error||null,phase:work?.phase||work?.status||'idle',source:work?.source||'shipped',persistence:work?.persistence||null};}
export function R_DemonBakeRelease(){
 if(active){active.custom?.abort();const transport=active.transport||active.entry;transport.pins--;if(transport.canonical)transport.canonical.pins--;if(active.custom)active.entry.data=null;}
 active=null;surfaces.clear();trim();
}
export function R_DemonBakePrepare(model,list){
 const bytes=model?.bspSourceBytes||(typeof model?.name==='string'?COM_FindFile(model.name)?.data:null);
 if(!active||active.model!==model||active.name!==model.name||active.bytes?.buffer!==bytes?.buffer||active.bytes?.byteOffset!==bytes?.byteOffset||active.bytes?.byteLength!==bytes?.byteLength){
  R_DemonBakeRelease();const entry=R_DemonBakePrefetch(model.name,bytes);entry.pins=(entry.pins||0)+1;if(entry.canonical)entry.canonical.pins++;active={model,name:model.name,bytes,entry};
 }
 if(active.custom&&active.entry.status!=='loading'){
  const changed=customInputsChanged(active,model,list);
  if(changed){active.custom.abort();active.custom=null;active.entry=active.transport;surfaces.clear();}
 }
 const work=active.entry;if(work.status==='unprepared'){if(!bytes||typeof model.name!=='string')return work;beginCustom(active,model,list);return active.waiting?{...active.entry,status:'loading'}:active.entry;}if(work.status==='loading')return work;
 const identities=new Map();
 for(const surface of list){
  const field=surface?.texinfo?.texture?.gl_texture?.userData.newerHeight;if(!field?.displacement)continue;
  const settings=DemonFieldSettings(field),signature=DemonSurfaceSignature(surface);
  let identity=identities.get(field);if(!identity){identity=work.status==='ready'?fieldIdentity(field):null;identities.set(field,identity);}
  const previous=surfaces.get(surface);if(previous?.field===field&&previous.settings===settings&&previous.signature===signature&&previous.identity===identity)continue;
  const state={field,settings,signature,identity,status:work.status==='error'?'error':'unprepared',data:null,error:work.error};surfaces.set(surface,state);
  if(work.status!=='ready')continue;
  const record=work.data.records.get(signature);
  if(!record||record.settings!==settings){state.status='error';state.error='Prepared displacement geometry/settings mismatch';continue;}
  state.status='loading';
  identity.promise.then(hash=>{if(surfaces.get(surface)!==state)return;if(hash===record.fieldSha256){state.data=record.data;state.diagnostic=record.nativeOnly||null;state.status=record.nativeOnly?'native':'ready';}else{state.status='error';state.error='Prepared displacement height source mismatch';}},error=>{if(surfaces.get(surface)!==state)return;state.status='error';state.error=String(error.message||error);});
 }
 return work;
}
export function R_DemonBakeSurface(surface){
 const field=surface?.texinfo?.texture?.gl_texture?.userData.newerHeight,state=surfaces.get(surface);
 return state&&state.field===field?state:unprepared;
}
