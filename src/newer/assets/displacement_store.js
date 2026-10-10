/**
 * @module newer/assets/displacement_store
 *
 * The browser's local store for prepared data (the origin private file system): content-addressed, one writer per
 * key.
 *
 * Types: exported classes `DisplacementStore`.
 *
 * State: no mutable exports.
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
export async function DisplacementHash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
export async function DisplacementKey(value){return DisplacementHash(new TextEncoder().encode(JSON.stringify(value)));}
function checkAbort(signal){if(signal?.aborted)throw new DOMException('Displacement preparation cancelled','AbortError');}
async function readBounded(stream,limit,signal){
 checkAbort(signal);const reader=stream.getReader(),chunks=[];let size=0;
 const abort=()=>{reader.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{for(;;){checkAbort(signal);const{done,value}=await reader.read();checkAbort(signal);if(done)break;size+=value.byteLength;if(size>limit)throw Error('Displacement cache payload exceeds limit');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',abort);reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export function ReadPreparedPayload(stream,limit,signal){return readBounded(stream,limit,signal);}
async function fileBytes(handle,limit){const file=await handle.getFile();if(file.size>limit)throw Error('Displacement cache file exceeds limit');return new Uint8Array(await file.arrayBuffer());}
async function absent(fn){try{return await fn();}catch(error){if(error.name==='NotFoundError')return null;throw error;}}
async function writeClosed(directory,name,bytes){const handle=await directory.getFileHandle(name,{create:true}),writer=await handle.createWritable();try{await writer.write(bytes);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}return handle;}
export class DisplacementStore{
 constructor(storage=globalThis.navigator?.storage,locks=globalThis.navigator?.locks){this.storage=storage;this.locks=locks;this.directory=null;this.persistence='unchecked';}
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
