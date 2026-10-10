/**
 * @module newer/assets/prepared_transport
 *
 * Fetching large prepared bundles in Git-sized gzip chunks.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 6 places; catches at 1 place.
 */
import {COM_NewerURL} from '../../engine/common/pak.js';
import {DisplacementHash,ReadPreparedPayload} from './displacement_store.js';
// Large prepared bundles are split into ordinary Git-sized gzip byte chunks.
// Concatenation is streamed into the same gzip decoder; geometry is unchanged.
/**
 * Fetches a prepared gzip bundle and returns its decompressed bytes. A single file name is fetched as one response;
 * a part list (up to 32 parts of 1 byte to 48 MiB each) is fetched one part at a time, each part checked against its
 * length and SHA-256 before it is fed into the same gzip decoder, so only one compressed part is held at once. URLs
 * resolve through `COM_NewerURL`; parts are cache-busted with `?v=<sha256>`. Used by `r_demonbakes.js` and
 * `r_rockbakes.js` (with a 256 MiB limit) when a map's prepared geometry is loaded.
 *
 * @param {string|Array<{ file: string, sha256: string, bytes: number }>} file a URL path (any `?query` is kept for the
 *   fetch) or the ordered part list of a split bundle
 * @param {{ signal?: AbortSignal, limit?: number }} [options] `signal` cancels fetching and decoding; `limit` caps the
 *   decompressed size in bytes (default 512 MiB)
 * @returns {Promise<ArrayBuffer>} the decompressed bundle
 * @throws {Error} on invalid part metadata (before any fetch), an HTTP failure, a part checksum/length mismatch, a
 *   decompressed size above `limit`, or when `DecompressionStream` is unavailable
 * @throws {DOMException} `AbortError` when `signal` aborts
 */
export async function PreparedLoad(file,{signal,limit=512*1024*1024}={}){
 let stream;
 if(Array.isArray(file)){
  if(!file.length||file.length>32||file.some(p=>typeof p.file!=='string'||! /^[a-f0-9]{64}$/.test(p.sha256)||!Number.isInteger(p.bytes)||p.bytes<1||p.bytes>48*1024*1024))throw Error('Invalid prepared bundle parts');
  let next=0;
  stream=new ReadableStream({async pull(controller){
   try{if(signal?.aborted)throw new DOMException('Prepared load cancelled','AbortError');if(next===file.length){controller.close();return;}const part=file[next++],response=await fetch(COM_NewerURL(part.file,part.file+'?v='+part.sha256),{signal});if(!response.ok||!response.body)throw Error('Prepared part HTTP '+response.status);
    const bytes=await ReadPreparedPayload(response.body,part.bytes,signal);if(bytes.length!==part.bytes||await DisplacementHash(bytes)!==part.sha256)throw Error('Prepared part checksum/length mismatch');controller.enqueue(bytes);
   }catch(error){controller.error(error);}
  }});
 }else{
  const response=await fetch(COM_NewerURL(file.split('?')[0],file),{signal});if(!response.ok||!response.body)throw Error('Prepared data HTTP '+response.status);stream=response.body;
 }
 if(typeof DecompressionStream==='undefined')throw Error('Prepared decompression unavailable');
 return (await ReadPreparedPayload(stream.pipeThrough(new DecompressionStream('gzip')),limit,signal)).buffer;
}
