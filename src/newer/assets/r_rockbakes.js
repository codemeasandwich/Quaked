/**
 * @module newer/assets/r_rockbakes
 *
 * Loading prepared rock relief for the current and next levels.
 *
 * Types: exported classes `RockBakeSource`.
 *
 * State: no mutable exports; 2 module-level collections (Map/Set).
 *
 * Errors: throws at 7 places; catches at 4 places.
 */
import {PreparedLoad} from './prepared_transport.js';
import {PREPARED_CORPUS} from './prepared_corpus.js';
import {ROCK_BAKES} from './rockfield_bakes.js';
import {RockBakeDecode,RockBakeSignature,RockBakeConfig,RockBakeEncode,RockBakeTileCoordinates,ROCK_BAKE_VERSION} from './rockfield_bake_format.js';
import {DisplacementStore,DisplacementKey,DisplacementHash} from './displacement_store.js';
import {RockPrepareTiles} from './rockfield_prepare.js';
import { COM_NewerURL,COM_FindFile } from '../../engine/common/pak.js';
// Three decoded levels, including pending fetches; warm upcoming portal levels
// without creating GPU pages, workers, or additional game instances.
const cache=new Map(),MAX_LEVELS=3,sourceKeys=new WeakMap(),store=new DisplacementStore();
const fieldIndexes=new WeakMap();
// Coverage components may join/split in a revised BSP, but absolute tile
// samples remain identical for the same validated model, seed/config and axes.
export function RockBakeFieldSignature(chart){return JSON.stringify([chart.seed,RockBakeConfig(chart),chart.tangent,chart.bitangent]);}
export function RockBakeFieldIndex(data){
 let fields=fieldIndexes.get(data);if(fields)return fields;
 fields=new Map();
 for(const[signature,tiles]of data.charts){
  let key;try{const value=JSON.parse(signature);if(!Array.isArray(value)||value.length!==5)continue;key=JSON.stringify(value.slice(1));}catch{continue;}
  let shared=fields.get(key);if(!shared){shared=new Map();fields.set(key,shared);}
  for(const[coordinate,tile]of tiles){
   if(!shared.has(coordinate)){shared.set(coordinate,tile);continue;}
   const previous=shared.get(coordinate);
   // A conflicting duplicate poisons shared reuse permanently. Exact chart
   // lookup still works; an ambiguous shared sample uses the real generator.
   if(previous&&previous.some((height,i)=>height!==tile[i]))shared.set(coordinate,null);
  }
 }
 fieldIndexes.set(data,fields);return fields;
}
export const ROCK_BAKE_TIMEOUT_MS=5000;
export function R_RockBakePrefetch(model,loader=load,timeoutMs=ROCK_BAKE_TIMEOUT_MS,bytes=typeof model==='string'?COM_FindFile(model)?.data:null){
 if(typeof model!=='string')return null;
 const registered=ROCK_BAKES[model];if(!registered&&!PREPARED_CORPUS[model])return null;
 let key=model;
 if(bytes){let ranges=sourceKeys.get(bytes.buffer);if(!ranges){ranges=new Map();sourceKeys.set(bytes.buffer,ranges);}const range=model+':'+bytes.byteOffset+':'+bytes.byteLength;key=ranges.get(range);if(!key){key={};ranges.set(range,key);}}
 // Failed transports own no valid data. Other owners may still hold failed
 // pins while transferring to this one shared replacement request.
 const previous=cache.get(key);if(previous?.status==='error'&&previous.retryable)cache.delete(key);else if(previous){cache.delete(key);cache.set(key,previous);return previous;}
 const entry={status:'loading',data:null,error:null,pins:0,retryable:false};cache.set(key,entry);
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{entry.cancel=()=>{controller.abort();reject(new Error('Rock bake prefetch evicted'));};timer=setTimeout(()=>{entry.retryable=true;controller.abort();reject(new Error('Rock bake load timed out'));},timeoutMs);});
 const prepared=(async()=>{
  const bspSha256=bytes?await DisplacementHash(bytes):undefined,spec=(Array.isArray(registered)?registered:registered?[registered]:[]).find(s=>!bytes||s.bspSha256===bspSha256);
  if(!spec){if(PREPARED_CORPUS[model]?.includes(bspSha256))throw Error('Bundled rock data missing for exact BSP identity');return null;}
  // Only transport/deadline failures authorize a retry. Decoder diagnostics
  // may quote corrupt input containing words such as "network".
  let buffer;try{buffer=await loader(spec.file+'?v='+spec.sha256,{signal:controller.signal});}
  catch(error){entry.retryable=entry.retryable||error?.name==='AbortError'||/timed out|AbortError|network/i.test(String(error?.message||error));throw error;}
  if(await DisplacementHash(buffer)!==spec.rawSha256)throw new Error('Rock bake checksum mismatch');
  // Legacy fixtures have no named BSP. Real engine loads require an embedded
  // source identity as well as the independently checked manifest identity.
  return RockBakeDecode(buffer,model,bytes?bspSha256:undefined);
 })();
 entry.promise=Promise.race([prepared,deadline]).then(data=>{entry.data=data;entry.status=data?'ready':'unprepared';}).catch(error=>{entry.data=null;entry.error=String(error.message||error);entry.status=bytes?'error':'fallback';}).finally(()=>clearTimeout(timer));
 while(cache.size>MAX_LEVELS){const victim=[...cache].find(([,value])=>!value.pins);if(!victim)break;cache.delete(victim[0]);if(victim[1].status==='loading')victim[1].cancel();}
 return entry;
}
async function load(file,options){return PreparedLoad(file,{...options,limit:256*1024*1024});}

export function RockBakeCoverage(data,charts){
 if(data.charts.size!==charts.length)throw Error('Prepared rock chart coverage mismatch');
 for(const chart of charts){const tiles=data.charts.get(RockBakeSignature(chart)),coordinates=RockBakeTileCoordinates(chart);if(!tiles||tiles.size!==coordinates.length||coordinates.some(([x,y])=>!tiles.has(x+','+y)))throw Error('Prepared rock coordinate coverage mismatch');}
 return data;
}
export class RockBakeSource{
 constructor(model,charts,loader,{bytes=typeof model==='object'?model?.bspSourceBytes:typeof model==='string'?COM_FindFile(model)?.data:null,store:disk=store,workerFactory}={}){
  const name=typeof model==='object'?model?.name:model;this.alive=true;this.controller=new AbortController();
  this.signatures=new Map(charts.map(chart=>[chart,RockBakeSignature(chart)]));this.fields=new Map(charts.map(chart=>[chart,RockBakeFieldSignature(chart)]));this.hits=0;this.misses=0;this.fieldHits=0;
  this.transport=R_RockBakePrefetch(name,loader,ROCK_BAKE_TIMEOUT_MS,bytes);if(this.transport)this.transport.pins++;
  if(!bytes||typeof name!=='string'){this.entry=this.transport;return;}
  // Snapshot all offscreen/brush chart inputs; shader page residency is not
  // authority for whether a local generated payload is complete.
  const captured=charts.map(c=>({...c,config:{...c.config},tangent:[...c.tangent],bitangent:[...c.bitangent],surfaces:c.surfaces.map(f=>({bounds:[...f.bounds]}))}));
  const entry=this.entry={status:'loading',data:null,error:null,phase:'source'};
  entry.promise=(async()=>{
   const bspSha256=await DisplacementHash(bytes);if(!this.alive)return;let transport=this.transport;
   if(transport){await transport.promise;if(!this.alive)return;
   if(transport.status==='error'&&transport.retryable){transport.pins--;transport=R_RockBakePrefetch(name,loader,10000,bytes);this.transport=transport;transport.pins++;await transport.promise;if(!this.alive)return;}
   if(transport.status==='error')throw Error(transport.error);if(transport.data){entry.data=RockBakeCoverage(transport.data,captured);entry.source='shipped';entry.status='ready';return;}}
   const signatures=captured.map(c=>[RockBakeSignature(c),RockBakeTileCoordinates(c)]),key=await DisplacementKey(['rock',ROCK_BAKE_VERSION,name,bspSha256,signatures]);
   const decode=buffer=>{const data=RockBakeDecode(buffer,name,bspSha256);if(data.meta.cacheKey!==key)throw Error('Cached rock settings/version mismatch');return RockBakeCoverage(data,captured);};
   const result=await disk.ensure(key,{signal:this.controller.signal,onPhase:phase=>entry.phase=phase,decode,generate:async signal=>RockBakeEncode(name,captured,await RockPrepareTiles(captured,{signal,workerFactory}),{bspSha256,cacheKey:key})});
   if(!this.alive||this.controller.signal.aborted)return;entry.data=result.data;entry.source=result.source;entry.persistence=result.persistence;entry.status='ready';
  })().catch(error=>{if(this.alive){entry.status='error';entry.error=String(error.message||error);}});
 }
 dispose(){if(!this.alive)return;this.alive=false;this.controller.abort();if(this.transport)this.transport.pins--;if(this.entry!==this.transport&&this.entry)this.entry.data=null;this.entry=null;this.transport=null;}
 get status(){return this.entry?.status||'fallback';}
 tile(chart,x,y){
  const key=x+','+y,data=this.entry?.data;let tile=data?.charts.get(this.signatures.get(chart))?.get(key);
  if(!tile&&data){tile=RockBakeFieldIndex(data).get(this.fields.get(chart))?.get(key);if(tile)this.fieldHits++;}
  if(tile)this.hits++;else this.misses++;return tile||null;
 }
}
