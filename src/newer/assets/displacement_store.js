/**
 * @module newer/assets/displacement_store
 *
 * The browser's local store for prepared data (the origin private file system): content-addressed, one writer per
 * key.
 *
 * Types: exported classes `DisplacementStore`.
 *
 * State: no mutable exports; browser storage.
 *
 * Errors: throws at 17 places; catches at 8 places.
 *
 * Its browser storage is the origin private file system, guarded by Web Locks.
 */
// Origin-private local files survive browser sessions. One manifest per input
// identity, content-addressed payloads, and a per-key Web Lock prevent duplicate
// first-use generation and partially committed cache hits across tabs.
export const DISPLACEMENT_STORE_SCHEMA=1;
const MAX_RAW=512*1024*1024,MAX_COMPRESSED=128*1024*1024,HEX=/^[a-f0-9]{64}$/;
/**
 * Hashes bytes with SHA-256 through Web Crypto (`crypto.subtle`). Used for content addresses, manifest checksums and
 * BSP identities across the prepared-data loaders.
 *
 * @param {BufferSource} bytes the data to hash
 * @returns {Promise<string>} 64 lowercase hex characters
 */
export async function DisplacementHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
/**
 * Derives a store key from an input identity: the SHA-256 of `JSON.stringify(value)`. Callers pass an array of every
 * input that changes the output (generator version, format version, map name, BSP hash, per-surface signatures...), so
 * any change selects a different manifest.
 *
 * @param {*} value a JSON-serialisable identity
 * @returns {Promise<string>} 64 lowercase hex characters, valid as a `DisplacementStore` key
 */
export async function DisplacementKey(value){return DisplacementHash(new TextEncoder().encode(JSON.stringify(value)));}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Displacement preparation cancelled','AbortError');}
async function readBounded(stream,limit,signal){
 checkAbort(signal);const reader=stream.getReader(),chunks=[];let size=0;
 const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{for(;;){checkAbort(signal);const{done,value}=await reader.read();checkAbort(signal);if(done)break;size+=value.byteLength;if(size>limit)throw Error('Displacement cache payload exceeds limit');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
/**
 * Reads a whole byte stream into one buffer, refusing to grow past `limit` and stopping when `signal` aborts (the
 * reader is cancelled and its lock released either way). Used by `prepared_transport.js` for downloaded parts and the
 * gunzipped result, and inside this store for compression.
 *
 * @param {ReadableStream<Uint8Array>} stream the source; it is locked and consumed
 * @param {number} limit maximum total size in bytes
 * @param {AbortSignal} [signal] cancels the read
 * @returns {Promise<Uint8Array>} the concatenated bytes
 * @throws {DOMException} `AbortError` ("Displacement preparation cancelled") when `signal` is or becomes aborted
 * @throws {Error} when the stream yields more than `limit` bytes, or the stream itself errors
 */
export function ReadPreparedPayload(stream,limit,signal){return readBounded(stream,limit,signal);}
async function fileBytes(handle,limit){const file=await handle.getFile();if(file.size>limit)throw Error('Displacement cache file exceeds limit');return new Uint8Array(await file.arrayBuffer());}
async function absent(fn){try{return await fn();}catch(error){if(error.name==='NotFoundError')return null;throw error;}}
async function writeClosed(directory,name,bytes){const handle=await directory.getFileHandle(name,{create:true}),writer=await handle.createWritable();try{await writer.write(bytes);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}return handle;}
export class DisplacementStore{
 /**
  * Creates a store over a storage manager and lock manager. Nothing is opened until the first `open`, `read` or
  * `ensure`. Modules keep one store each (`r_demonbakes.js`, `r_rockbakes.js`, `normal_prepare.js`); tests inject a
  * filesystem-backed storage and recording locks.
  *
  * @param {StorageManager} [storage] provides `getDirectory()` (origin private file system) and optionally
  *   `persisted()`/`persist()`; defaults to `navigator.storage`
  * @param {LockManager} [locks] provides `request()` (Web Locks); defaults to `navigator.locks`
  */
 constructor(storage=globalThis.navigator?.storage,locks=globalThis.navigator?.locks){this.storage=storage;this.locks=locks;this.directory=null;this.persistence='unchecked';}
 /**
  * Opens (once) the store's directory `quaked-displacement-v1` in the origin private file system, creating it if
  * needed, and records whether the browser grants persistent storage in `this.persistence` (`'unchecked'` until then,
  * then `'granted'` or `'denied'`; asking may call `storage.persist()`). The opening promise is cached for the life of
  * the store and cleared again if it fails, so a later call retries.
  *
  * @returns {Promise<FileSystemDirectoryHandle>} the store directory
  * @throws {Error} when the storage has no `getDirectory` or the lock manager no `request`
  */
 async open(){
  if(!this.storage?.getDirectory||!this.locks?.request)throw Error('Durable displacement filesystem/locking unavailable');
  if(!this.directory){
   const opening=(async()=>{
    const root=await this.storage.getDirectory();
    try{this.persistence=await this.storage.persisted?.()||await this.storage.persist?.()?'granted':'denied';}catch{this.persistence='denied';}
    return root.getDirectoryHandle('quaked-displacement-v1',{create:true});
   })();
   this.directory=opening;
   opening.catch(()=>{if(this.directory===opening)this.directory=null;});
  }
  return this.directory;
 }
 /**
  * Reads a committed entry: the manifest `<key>.json` (at most 64 KiB) and the gzip payload `<payloadSha256>.gz` it
  * names (at most 128 MiB compressed, 512 MiB raw), checking sizes and both SHA-256 checksums before handing the raw
  * bytes to `decode`. Does not take the key's lock; `ensure` calls it under the lock.
  *
  * @param {string} key 64 lowercase hex characters (see `DisplacementKey`)
  * @param {function(ArrayBuffer): *} decode parses and validates the raw payload (may be async); its error propagates
  * @param {AbortSignal} [signal] cancels the read
  * @returns {Promise<?{ data: *, source: 'disk', manifest: object, persistence: string }>} null when no manifest exists
  *   for the key; otherwise `decode`'s result with the manifest and the persistence state
  * @throws {DOMException} `AbortError` when `signal` aborts
  * @throws {Error} on an invalid key, an invalid or oversized manifest, a checksum or length mismatch, or when
  *   `DecompressionStream` is unavailable; a manifest whose payload file is missing rejects with the filesystem's
  *   `NotFoundError`
  */
 async read(key,decode,signal){
  checkAbort(signal);
  if(!HEX.test(key))throw Error('Invalid displacement cache key');const directory=await this.open();
  const manifestHandle=await absent(()=>directory.getFileHandle(key+'.json'));if(!manifestHandle)return null;
  const manifest=JSON.parse(new TextDecoder().decode(await fileBytes(manifestHandle,65536)));
  if(manifest.schema!==DISPLACEMENT_STORE_SCHEMA||manifest.key!==key||!HEX.test(manifest.payloadSha256)||!HEX.test(manifest.rawSha256)||!Number.isInteger(manifest.rawBytes)||manifest.rawBytes<0||manifest.rawBytes>MAX_RAW||!Number.isInteger(manifest.compressedBytes)||manifest.compressedBytes<0||manifest.compressedBytes>MAX_COMPRESSED)throw Error('Invalid displacement cache manifest');
  const handle=await directory.getFileHandle(manifest.payloadSha256+'.gz'),compressed=await fileBytes(handle,MAX_COMPRESSED);
  if(compressed.byteLength!==manifest.compressedBytes||await DisplacementHash(compressed)!==manifest.payloadSha256)throw Error('Displacement cache compressed checksum mismatch');
  if(typeof DecompressionStream==='undefined')throw Error('Displacement cache decompression unavailable');
  const raw=await readBounded(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),manifest.rawBytes,signal);
  if(raw.byteLength!==manifest.rawBytes||await DisplacementHash(raw)!==manifest.rawSha256)throw Error('Displacement cache raw checksum mismatch');
  const data=await decode(raw.buffer);checkAbort(signal);return {data,source:'disk',manifest,persistence:this.persistence};
 }
 /**
  * Returns the stored entry for `key`, generating and storing it first when absent. Runs under an exclusive Web Lock
  * `quaked-displacement:<key>`, so across tabs only one caller generates a key and nobody sees a half-written entry.
  * On a miss: `generate`, verify with `decode`, gzip, write the payload and read it back, then write the manifest last
  * (the commit point), then read the whole entry back. Entries persist across browser sessions (subject to the
  * browser's storage eviction; see `persistence`).
  *
  * @param {string} key 64 lowercase hex characters (see `DisplacementKey`)
  * @param {{ generate: function(AbortSignal=): (Uint8Array|Promise<Uint8Array>), decode: function(ArrayBuffer): *,
  *   signal?: AbortSignal, onPhase?: function(string): void }} options `generate` produces the raw payload (at most
  *   512 MiB); `decode` validates and parses raw bytes; `signal` cancels the lock wait and work; `onPhase` is told
  *   `'filesystem'`, `'lock'`, `'read'`, `'generate'`, `'write'`, `'readback'` and `'ready'` as work proceeds
  * @returns {Promise<{ data: *, source: ('disk'|'generated-and-stored'), manifest: object, persistence: string }>} the
  *   decoded entry and where it came from
  * @throws {DOMException} `AbortError` when `signal` aborts
  * @throws {Error} when the filesystem or locks are unavailable, the key is invalid, the generated payload is not a
  *   Uint8Array within 512 MiB, `decode` rejects it, `CompressionStream` is unavailable, or a readback does not match
  */
 async ensure(key,{generate,decode,signal,onPhase=()=>{}}){
  checkAbort(signal);onPhase('filesystem');
  await this.open();if(!HEX.test(key))throw Error('Invalid displacement cache key');
  onPhase('lock');return this.locks.request('quaked-displacement:'+key,{mode:'exclusive',...(signal?{signal}:{})},async()=>{
   onPhase('read');const cached=await this.read(key,decode,signal);checkAbort(signal);if(cached){onPhase('ready');return cached;}
   onPhase('generate');checkAbort(signal);
   const raw=await generate(signal);checkAbort(signal);
   if(!(raw instanceof Uint8Array)||raw.byteLength>MAX_RAW)throw Error('Invalid generated displacement payload');
   await decode(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
   if(typeof CompressionStream==='undefined')throw Error('Displacement cache compression unavailable');
   const compressed=await readBounded(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')),MAX_COMPRESSED,signal);
   const manifest={schema:DISPLACEMENT_STORE_SCHEMA,key,rawBytes:raw.byteLength,compressedBytes:compressed.byteLength,rawSha256:await DisplacementHash(raw),payloadSha256:await DisplacementHash(compressed)};
   checkAbort(signal);
   onPhase('write');const directory=await this.open(),payload=await writeClosed(directory,manifest.payloadSha256+'.gz',compressed);
   if(await DisplacementHash(await fileBytes(payload,MAX_COMPRESSED))!==manifest.payloadSha256)throw Error('Displacement cache payload readback mismatch');
   checkAbort(signal);
   await writeClosed(directory,key+'.json',new TextEncoder().encode(JSON.stringify(manifest)));
   onPhase('readback');const committed=await this.read(key,decode,signal);checkAbort(signal);if(!committed)throw Error('Displacement cache manifest readback missing');
   onPhase('ready');return {...committed,source:'generated-and-stored'};
  });
 }
}
