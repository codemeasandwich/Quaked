import {createHash} from 'node:crypto';
import {NormalBakeEncode} from '../src/normal_bake_format.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),sha=b=>createHash('sha256').update(b).digest('hex'),ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
let serial=0;const fresh=()=>import('../src/normal_transport.js?public-transport='+ ++serial);
async function rejects(p,label){let e;try{await p;}catch(error){e=error;}check(e instanceof Error,label+' rejected');return e;}
function payload(key,width=1,height=1){return NormalBakeEncode(key,width,height,{pixels:new Uint8Array(width*height*4),scalar:new Float32Array(width*height)});}

Deno.test('normal transport reuses one validated request, retries actual failures, and evicts beyond256 unpinned entries',async()=>{
 const {NormalTransport}=await fresh();let calls=0;const leases=[];try{for(let i=0;i<257;i++){const key='bounded-normal-'+i,raw=payload(key),lease=NormalTransport({file:key,rawSha256:sha(raw)},key,1,1,async()=>{calls++;return ab(raw);});await lease.promise;lease.release();lease.release();leases.push(lease);}same(calls,257,'one load per actual key');
  const newest='bounded-normal-256',last=payload(newest),hit=NormalTransport({file:newest,rawSha256:sha(last)},newest,1,1,()=>{throw Error('Newest must stay cached');});await hit.promise;hit.release();
  const first='bounded-normal-0',raw=payload(first),evicted=NormalTransport({file:first,rawSha256:sha(raw)},first,1,1,async()=>{calls++;return ab(raw);});await evicted.promise;evicted.release();same(calls,258,'oldest actually reloads after bounded cache eviction');
  const failraw=payload('retry'),spec={rawSha256:sha(failraw)};const bad=NormalTransport(spec,'retry',1,1,async()=>{throw Error('controlled request failure');});await rejects(bad.promise,'failed request');bad.release();const retry=NormalTransport(spec,'retry',1,1,async()=>ab(failraw));await retry.promise;retry.release();
 }finally{for(const lease of leases)lease.release();}
});

Deno.test('normal transport128MiB budget uses actual decoded payload bytes and keeps leased data alive during eviction',async()=>{
 const {NormalTransport}=await fresh(),width=2048,height=2048,source={pixels:new Uint8Array(width*height*4),scalar:new Float32Array(width*height)},specs=[],calls=new Map();let pinned;
 try{for(let i=0;i<4;i++){const key='byte-budget-'+i,raw=NormalBakeEncode(key,width,height,source),spec={rawSha256:sha(raw)},loader=async()=>{calls.set(key,(calls.get(key)||0)+1);return ab(NormalBakeEncode(key,width,height,source));};specs.push({key,spec,loader});const lease=NormalTransport(spec,key,width,height,loader);const data=await lease.promise;check(data.bytes>32*1024*1024,'real payload includes header beyond32MiB');if(i===0)pinned=lease;else lease.release();}
  const first=specs[0],again=NormalTransport(first.spec,first.key,width,height,()=>{throw Error('Pinned payload must not be evicted');});await again.promise;again.release();same(calls.get(first.key),1,'pinned source remains resident');const second=specs[1],reload=NormalTransport(second.spec,second.key,width,height,second.loader);await reload.promise;reload.release();same(calls.get(second.key),2,'oldest unpinned payload evicted when real byte sum exceeds128MiB');
 }finally{pinned?.release();}
});

Deno.test('normal transport has a real10s request deadline and late loader completion cannot publish timed-out data',async()=>{
 const {NormalTransport}=await fresh(),raw=payload('deadline'),old=globalThis.setTimeout;let expire,timer,resolve,signal;
 globalThis.setTimeout=(fn,ms,...args)=>{if(ms===10000){expire=fn;timer=old(()=>{},60000);return timer;}return old(fn,ms,...args);};
 try{const lease=NormalTransport({rawSha256:sha(raw)},'deadline',1,1,(_spec,s)=>{signal=s;return new Promise(r=>resolve=r);});const failure=rejects(lease.promise,'deadline');check(expire&&resolve,'actual10s timer and request started');expire();check((await failure).message.includes('timed out'),'timeout diagnosed');same(signal.aborted,true,'actual loader signal aborted');resolve(ab(raw));await Promise.resolve();lease.release();const retry=NormalTransport({rawSha256:sha(raw)},'deadline',1,1,async()=>ab(raw));await retry.promise;retry.release();}finally{globalThis.setTimeout=old;clearTimeout(timer);}
});

Deno.test('default normal transport enforces its decompressed64MiB stream bound before any oversized normal decode',async()=>{
 const {NormalTransport}=await fresh(),oldFetch=globalThis.fetch,oldDecompression=globalThis.DecompressionStream;let observed=0;
 // The response is a controlled decompressed stream; the production bounded
 // reader and actual decoder remain intact. No giant fixture is retained.
 globalThis.DecompressionStream=class{constructor(){return new TransformStream();}};
 globalThis.fetch=async()=>({ok:true,body:new ReadableStream({pull(controller){observed++;controller.enqueue(new Uint8Array(1024*1024));if(observed===66)controller.close();}})});
 try{const lease=NormalTransport({file:'bounded-test.gz',sha256:'s',rawSha256:'not-reached'},'bound',1,1);const error=await rejects(lease.promise,'oversized stream');check(error.message.includes('exceeds limit'),'bounded reader rejects before checksum/decode');check(observed>=65&&observed<=66,'stream stops near first excess chunk');lease.release();}finally{globalThis.fetch=oldFetch;globalThis.DecompressionStream=oldDecompression;}
});
