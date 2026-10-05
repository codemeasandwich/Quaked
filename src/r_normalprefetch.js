import {STARTUP_NORMAL_BAKES} from './startup_normal_bakes.js';
import {NORMAL_BAKES} from './normal_bakes.js';
import {NormalTransport} from './normal_transport.js';
import {DisplacementHash} from './displacement_store.js';
const sources=new WeakMap();
export function R_StartupNormalsPrefetch(name,bytes,transport=NormalTransport){
 if(!STARTUP_NORMAL_BAKES[name]||!bytes)return Promise.resolve({status:'unused'});
 let ranges=sources.get(bytes.buffer);if(!ranges){ranges=new Map();sources.set(bytes.buffer,ranges);}const range=name+':'+bytes.byteOffset+':'+bytes.byteLength;
 if(ranges.has(range))return ranges.get(range);
 const promise=(async()=>{
  const sha=await DisplacementHash(bytes),spec=STARTUP_NORMAL_BAKES[name].find(s=>s.bspSha256===sha);if(!spec)return {status:'unused'};
  const leases=[];
  try{
   for(const key of spec.keys){const sample=NORMAL_BAKES[key];if(!sample)throw Error('Missing startup normal transport spec');leases.push(transport(sample,key,sample.width,sample.height));}
   const results=await Promise.allSettled(leases.map(lease=>lease.promise)),failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;return {status:'ready',samples:leases.length};
  }finally{for(const lease of leases)lease.release();}

 })().catch(error=>({status:'error',error:String(error.message||error)}));ranges.set(range,promise);return promise;
}
