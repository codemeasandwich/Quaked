import {ROCK_BAKES} from './rockfield_bakes.js';
import {RockBakeDecode,RockBakeSignature} from './rockfield_bake_format.js';
import { COM_NewerURL } from './pak.js';
// Three decoded levels, including pending fetches; warm upcoming portal levels
// without creating GPU pages, workers, or additional game instances.
const cache=new Map(),MAX_LEVELS=3;
export const ROCK_BAKE_TIMEOUT_MS=5000;
export function R_RockBakePrefetch(model,loader=load,timeoutMs=ROCK_BAKE_TIMEOUT_MS){
 if(!ROCK_BAKES[model])return null;
 const previous=cache.get(model);if(previous){cache.delete(model);cache.set(model,previous);return previous;}
 const entry={status:'loading',data:null,error:null,pins:0};cache.set(model,entry);
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{entry.cancel=()=>{controller.abort();reject(new Error('Rock bake prefetch evicted'));};timer=setTimeout(()=>{controller.abort();reject(new Error('Rock bake load timed out'));},timeoutMs);});
 const spec=ROCK_BAKES[model];
 const prepared=Promise.resolve().then(()=>loader(spec.file+'?v='+spec.sha256,{signal:controller.signal})).then(async buffer=>{
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),hex=Array.from(hash,n=>n.toString(16).padStart(2,'0')).join('');
  if(hex!==spec.rawSha256)throw new Error('Rock bake checksum mismatch');return RockBakeDecode(buffer,model);
 });
 entry.promise=Promise.race([prepared,deadline]).then(data=>{entry.data=data;entry.status='ready';}).catch(error=>{entry.data=null;entry.error=String(error.message||error);entry.status='fallback';}).finally(()=>clearTimeout(timer));
 while(cache.size>MAX_LEVELS){const victim=[...cache].find(([,value])=>!value.pins);if(!victim)break;cache.delete(victim[0]);if(victim[1].status==='loading')victim[1].cancel();}
 return entry;
}
async function load(file,options){
 const response=await fetch(COM_NewerURL(file.split('?')[0],file),options);if(!response.ok)throw new Error('Rock bake HTTP '+response.status);
 if(!response.body||typeof DecompressionStream==='undefined')throw new Error('Rock bake decompression unavailable');
 return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export class RockBakeSource{
 constructor(model,charts,loader){this.entry=R_RockBakePrefetch(model,loader);if(this.entry)this.entry.pins++;this.signatures=new Map(charts.map(chart=>[chart,RockBakeSignature(chart)]));this.hits=0;this.misses=0;}
 dispose(){if(this.entry){this.entry.pins--;this.entry=null;}}
 get status(){return this.entry?.status||'fallback';}
 tile(chart,x,y){const tile=this.entry?.data?.charts.get(this.signatures.get(chart))?.get(x+','+y);if(tile)this.hits++;else this.misses++;return tile||null;}
}
