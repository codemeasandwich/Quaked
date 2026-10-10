import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {PreparedLoad} from '../src/newer/assets/prepared_transport.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),sha=b=>createHash('sha256').update(b).digest('hex'),raw=Uint8Array.from({length:65536},(_,i)=>(i*31+(i>>>4)*17)%251),compressed=gzipSync(raw);
function parts(){const cuts=[0,1,7,Math.floor(compressed.length/2),compressed.length];return cuts.slice(0,-1).map((at,i)=>{const bytes=compressed.subarray(at,cuts[i+1]);return{file:'newer/public-part-'+i,sha256:sha(bytes),bytes:bytes.length,data:bytes};});}
async function rejects(p,label){let error;try{await p;}catch(e){error=e;}check(error instanceof Error,label+' rejected');return error;}
Deno.test('prepared gzip chunks are verified and fetched sequentially while restoring exactly the same decoded bytes as one file',async()=>{
 const old=globalThis.fetch,p=parts(),calls=[];let active=0,peak=0;
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),signal:options?.signal});if(String(url).startsWith('single'))return new Response(compressed);const index=p.findIndex(v=>String(url).startsWith(v.file+'?v='+v.sha256));check(index>=0,'real chunk URL includes its immutable hash');active++;peak=Math.max(peak,active);return{ok:true,body:new ReadableStream({async start(controller){await new Promise(r=>setTimeout(r,1));controller.enqueue(p[index].data);active--;controller.close();}})};};
 try{const signal=new AbortController().signal,split=await PreparedLoad(p.map(({data,...spec})=>spec),{signal,limit:raw.length});same(Buffer.compare(Buffer.from(split),Buffer.from(raw)),0,'exact expanded bytes across cuts inside gzip header/body');same(peak,1,'no parallel compressed-part retention');same(calls.length,p.length,'each declared part fetched once');check(calls.every(c=>c.signal===signal),'actual cancellation signal forwarded to every request');same(Buffer.compare(Buffer.from(await PreparedLoad('single.gz?v=known',{limit:raw.length})),Buffer.from(raw)),0,'ordinary single-file path unchanged');}
 finally{globalThis.fetch=old;}
});
Deno.test('prepared chunk metadata, per-part checksum/length and decompressed bounds reject before publishing geometry',async()=>{
 const old=globalThis.fetch,p=parts().map(({data,...spec})=>spec);let calls=0;
 try{globalThis.fetch=async()=>{calls++;throw Error('Malformed metadata must not fetch');};for(const list of [[],Array.from({length:33},()=>p[0]),[{...p[0],file:7}],[{...p[0],sha256:'bad'}],[{...p[0],bytes:0}],[{...p[0],bytes:.5}],[{...p[0],bytes:48*1024*1024+1}]])await rejects(PreparedLoad(list),'metadata');same(calls,0,'invalid part metadata never reaches network');
  for(const kind of ['checksum','short','long','http']){calls=0;const single={file:'part',sha256:sha(compressed),bytes:compressed.length};globalThis.fetch=async()=>{calls++;if(kind==='http')return{ok:false,status:404};let bytes=compressed;if(kind==='checksum'){bytes=Buffer.from(compressed);bytes[10]^=1;}else if(kind==='short')bytes=compressed.subarray(0,-1);else if(kind==='long')bytes=Buffer.concat([compressed,Buffer.from([0])]);return new Response(bytes);};const error=await rejects(PreparedLoad([single]),kind);check(kind==='http'?error.message.includes('HTTP'):error.message.includes('checksum/length')||error.message.includes('exceeds limit'),kind+' explicit transport failure: '+error.message);same(calls,1,'no additional request after failed first part');}
  globalThis.fetch=async()=>new Response(compressed);check((await rejects(PreparedLoad('bounded.gz',{limit:raw.length-1}),'decoded bound')).message.includes('exceeds limit'),'actual gzip cannot evade output-size ceiling');
 }finally{globalThis.fetch=old;}
});
Deno.test('prepared chunk cancellation stops pending body consumption and cannot fetch a later part or return partial data',async()=>{
 const old=globalThis.fetch,p=parts().map(({data,...spec})=>spec);let calls=0,cancelled=0,entered;const active=new Promise(r=>entered=r);
 try{globalThis.fetch=async()=>{calls++;return{ok:true,body:new ReadableStream({pull(){entered();return new Promise(()=>{});},cancel(){cancelled++;}},{highWaterMark:0})};};const pre=new AbortController();pre.abort();await rejects(PreparedLoad(p,{signal:pre.signal}),'pre-cancel');same(calls,0,'pre-cancelled sequence fetches no part');const controller=new AbortController(),pending=PreparedLoad(p,{signal:controller.signal});await active;controller.abort();await rejects(pending,'mid-body cancel');same(calls,1,'later parts never fetched');check(cancelled>0,'actual body reader cancelled');}
 finally{globalThis.fetch=old;}
});
