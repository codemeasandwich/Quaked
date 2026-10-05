import {DisplacementHash,ReadPreparedPayload} from './displacement_store.js';
import {NormalBakeDecode} from './normal_bake_format.js';
import {COM_NewerURL} from './pak.js';
const entries=new Map(),MAX_BYTES=128*1024*1024,MAX_ENTRIES=256;
function trim(){
 let bytes=[...entries.values()].reduce((n,e)=>n+(e.data?.bytes||0),0);
 for(const[key,e]of entries){if(entries.size<=MAX_ENTRIES&&bytes<=MAX_BYTES)break;if(e.pins)continue;entries.delete(key);bytes-=e.data?.bytes||0;e.controller.abort();}
}
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
