/**
 * @module newer/assets/normal_transport
 *
 * Fetching prepared normal maps.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: throws at 2 places; catches at 1 place.
 */
import {DisplacementHash,ReadPreparedPayload} from './displacement_store.js';
import {NormalBakeDecode} from './normal_bake_format.js';
import {COM_NewerURL} from '../../engine/common/pak.js';
const entries=new Map(),MAX_BYTES=128*1024*1024,MAX_ENTRIES=256;
function trim(){
 let bytes=[...entries.values()].reduce((n,e)=>n+(e.data?.bytes||0),0);
 for(const[key,e]of entries){if(entries.size<=MAX_ENTRIES&&bytes<=MAX_BYTES)break;if(e.pins)continue;entries.delete(key);bytes-=e.data?.bytes||0;e.controller.abort();}
}
/**
 * Starts (or joins) the load of one shipped prepared normal map and pins it until the caller releases it. Called by
 * `R_NormalPrepare` (normal_prepare.js) when `NORMAL_BAKES` has an entry for the texture's input key. Loads are shared
 * per `key:rawSha256` in a module-level LRU cache: an existing entry is moved to the most-recent end and joined.
 * Unpinned entries are evicted (and their fetch aborted) once the cache holds more than 256 entries or more than 128 MiB
 * of decoded data; a failed load is dropped from the cache so the next call retries.
 *
 * Without a `loader`, the file is fetched from newer.pak's URL (`COM_NewerURL(spec.file, spec.file + '?v=' +
 * spec.sha256)`), gunzipped and read with a 64 MiB cap. The whole load is abandoned after 10 seconds.
 *
 * @param {{ file: string, sha256: string, rawSha256: string }} spec the `NORMAL_BAKES` entry: the file name, the hash
 *   of the gzipped file (cache-busting query only) and the SHA-256 of the decompressed bytes, which is checked
 * @param {string} key the normal input key (`NormalInputKey`); must match the key in the baked header
 * @param {number} width texture width in texels (1..2048), checked against the baked header
 * @param {number} height texture height in texels (1..2048), checked against the baked header
 * @param {(spec: object, signal: AbortSignal) => Promise<ArrayBuffer>} [loader] replaces the fetch (tests); must
 *   resolve to the decompressed bytes and should honour `signal`
 * @returns {{ promise: Promise<object>, release: () => void }} `promise` resolves to the `NormalBakeDecode` result
 *   (`{ pixels, scalar, reference, referenceWidth, referenceHeight, bytes }`, views into the shared buffer: do not
 *   mutate) and rejects with an Error on timeout ("Prepared normal load timed out"), HTTP failure, checksum mismatch or
 *   an invalid bake; `release()` drops this caller's pin (idempotent) so the entry may be evicted
 */
export function NormalTransport(spec,key,width,height,loader){
 const identity=key+':'+spec.rawSha256;let entry=entries.get(identity);
 if(entry){entries.delete(identity);entries.set(identity,entry);}else{
  entry={pins:0,data:null,controller:new AbortController()};entries.set(identity,entry);
  entry.promise=(async()=>{
   let timer;try{
    const signal=entry.controller.signal;
    const deadline=new Promise((_,reject)=>timer=setTimeout(()=>{entry.controller.abort();reject(Error('Prepared normal load timed out'));},10000));
    const bytes=await Promise.race([deadline,loader?loader(spec,signal):(async()=>{
     const r=await fetch(COM_NewerURL(spec.file,spec.file+'?v='+spec.sha256),{signal});if(!r.ok||!r.body)throw Error('Prepared normal HTTP '+r.status);return (await ReadPreparedPayload(r.body.pipeThrough(new DecompressionStream('gzip')),64*1024*1024,signal)).buffer;
    })()]);
    if(await DisplacementHash(bytes)!==spec.rawSha256)throw Error('Prepared normal checksum mismatch');
    entry.data=NormalBakeDecode(bytes,key,width,height);return entry.data;
   }finally{clearTimeout(timer);trim();}
  })();entry.promise.catch(()=>{if(entries.get(identity)===entry)entries.delete(identity);});
 }
 entry.pins++;let released=false;
 return {promise:entry.promise,release(){if(released)return;released=true;entry.pins--;trim();}};
}
