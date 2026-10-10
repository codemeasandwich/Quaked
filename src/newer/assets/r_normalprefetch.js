/**
 * @module newer/assets/r_normalprefetch
 *
 * Fetching the startup normal maps ahead of the first map.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: throws at 2 places; catches at 1 place.
 */
import {STARTUP_NORMAL_BAKES} from './startup_normal_bakes.js';
import {NORMAL_BAKES} from './normal_bakes.js';
import {NormalTransport} from './normal_transport.js';
import {DisplacementHash} from './displacement_store.js';
const sources=new WeakMap();
/**
 * Warms the prepared normal-map transport for one startup BSP before it is loaded, so the first map does not wait on
 * normal decoding. Called from main.js for 'maps/e1m3.bsp' at startup and for 'maps/start.bsp' once the welcome hub is
 * current or the demo has finished. The BSP's SHA-256 selects the `STARTUP_NORMAL_BAKES[name]` spec, and every key in
 * it is leased from `NormalTransport` and released once all settle (the transport keeps the decoded data in its own
 * bounded cache).
 *
 * The promise is cached per underlying ArrayBuffer and `name:byteOffset:byteLength` for the lifetime of the buffer, so
 * repeated calls with the same bytes return the same promise.
 *
 * @param {string} name BSP path, the key into `STARTUP_NORMAL_BAKES`
 * @param {?Uint8Array} bytes the BSP file bytes (a view into the pak)
 * @param {function(object, string, number, number): {promise: Promise, release: function(): void}} [transport]
 *   leases one normal sample given (spec, key, width, height); default `NormalTransport`
 * @returns {Promise<{status: string, samples?: number, error?: string}>} never rejects: 'unused' when the map or these
 *   exact bytes have no startup bake, 'ready' with the number of samples loaded, or 'error' with the message (a
 *   missing `NORMAL_BAKES` spec or a failed transport)
 */
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
