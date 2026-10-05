import {COM_NewerURL} from './pak.js';
import {DisplacementHash,ReadPreparedPayload} from './displacement_store.js';
// Large prepared bundles are split into ordinary Git-sized gzip byte chunks.
// Concatenation is streamed into the same gzip decoder; geometry is unchanged.
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
