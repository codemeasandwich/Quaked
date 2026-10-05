// Persistent file-backed OPFS adapter, actual compression/hash/decoder, fresh
// Node process. Browser-origin Web Lock/OPFS behavior gets a separate live trial.
import * as fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {DisplacementStore,DisplacementKey,DisplacementHash} from '../src/displacement_store.js';
import {DemonBakeEncode,DemonBakeDecode} from '../src/demon_bake_format.js';
import {nativeStorage,recordingLocks} from './helpers/opfs_native_fixture.mjs';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),turn=()=>new Promise(r=>setTimeout(r,0)),deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function failure(fn,label){let error;try{await fn();}catch(e){error=e;}check(error instanceof Error,label+' rejects rather than claiming durable readiness');return error;}
async function until(fn,label){for(let i=0;i<300&&!fn();i++)await turn();check(fn(),label);}
const model='maps/store-public.bsp',bsp='a'.repeat(64),field='b'.repeat(64),settings='[2,2,"clamp",4,1,0]';
function payload(){const data={positions:new Float32Array([-0,0,0,1,0,0,0,1,0]),normals:new Float32Array([0,0,1,0,0,1,0,0,1]),uvs:new Float32Array([0,0,1,0,0,1]),lmuvs:new Float32Array([.1,.2,.2,.2,.1,.3]),triangles:1,topVertexCount:3,skirtTriangles:0,tileRegions:[{origin:[-1,2],startVertex:0,endVertex:3}]};return DemonBakeEncode({model,bspSha256:bsp},[{signature:'surface-public',settings,fieldSha256:field,data}]);}
const decode=raw=>DemonBakeDecode(raw,model,bsp);
async function fixture(run){const root=await fs.mkdtemp(join(tmpdir(),'quaked-opfs-public-')),storage=nativeStorage(root),locks=recordingLocks(),store=new DisplacementStore(storage,locks),key=await DisplacementKey([1,bsp,field,settings]),raw=payload(),directory=join(root,'quaked-displacement-v1');try{return await run({root,storage,locks,store,key,raw,directory,manifest:()=>join(directory,key+'.json')});}finally{await fs.rm(root,{recursive:true,force:true});}}
async function commit(f){return f.store.ensure(f.key,{generate:async()=>f.raw,decode});}
async function readManifest(f){return JSON.parse(await fs.readFile(f.manifest(),'utf8'));}
async function writeManifest(f,m){await fs.writeFile(f.manifest(),JSON.stringify(m));}
Deno.test('durable completion follows real writer close, payload readback and final decode; new store and fresh process reuse files without generation',()=>fixture(async f=>{
 const phases=[];let generated=0,decoded=0;const result=await f.store.ensure(f.key,{generate:async()=>{generated++;return f.raw;},decode:raw=>{decoded++;return decode(raw);},onPhase:p=>phases.push(p)});same(result.source,'generated-and-stored','first preparation commits disk output');same(generated,1,'one actual generation');same(decoded,2,'generated validation plus final committed readback decode');same(phases.join(),'filesystem,lock,read,generate,write,readback,ready','ready occurs after complete public commit protocol');same(result.persistence,'granted','persistence outcome retained');
 const events=f.storage.events,payloadClose=events.findIndex(e=>e.op==='close'&&e.name.endsWith('.gz')),manifestWrite=events.findIndex(e=>e.op==='write'&&e.name===f.key+'.json');check(payloadClose>=0&&manifestWrite>payloadClose,'manifest is never published ahead of closed payload');check(events.slice(payloadClose+1,manifestWrite).some(e=>e.op==='read'&&e.name.endsWith('.gz')),'closed payload readback before manifest write');check(events.slice(manifestWrite+1).some(e=>e.op==='read'&&e.name===f.key+'.json'),'closed manifest is actually reread');
 const second=new DisplacementStore(nativeStorage(f.root),recordingLocks()),again=await second.ensure(f.key,{generate:()=>{throw Error('new store regenerated');},decode});same(again.source,'disk','new independent store reads durable cache');same(again.manifest.rawSha256,await DisplacementHash(f.raw),'durable exact raw bytes');
 const child=spawn(process.execPath,[new URL('./helpers/displacement_store_child.mjs',import.meta.url).pathname,f.root,f.key,model,bsp],{stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>errors+=x);const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});same(code,0,'fresh process exact disk reuse '+errors);const proof=JSON.parse(output);check(Number.isInteger(proof.pid)&&proof.pid!==process.pid,'readback occurs in a genuinely different native process');same(proof.source,'disk','fresh process never generated');same(proof.records,1,'fresh process decoded real prepared geometry');check(proof.positionBits[0]===0x80000000,'negative-zero Float32 bit survives filesystem/gzip/restart');same(proof.manifest.rawSha256,result.manifest.rawSha256,'fresh process validates same committed source bytes');console.log('DISPLACEMENT_STORE_RESTART '+JSON.stringify({adapter:'native temporary files',parentPID:process.pid,childPID:proof.pid,source:proof.source,rawSHA256:proof.manifest.rawSha256,key:f.key,records:proof.records,phases,commitOperations:events.filter(e=>['write','close','read'].includes(e.op))}));
}));
Deno.test('failed decode, writer close and payload or manifest readback cannot produce a ready result or hide persistence errors',async()=>{
 for(const kind of ['decode','payload-close','manifest-close','payload-readback','manifest-readback'])await fixture(async f=>{
  const phases=[];let writes=0;f.storage.hooks.beforeWrite=()=>writes++;
  if(kind.endsWith('close'))f.storage.hooks.beforeClose=name=>{if(name.endsWith(kind==='payload-close'?'.gz':'.json'))throw Error('controlled '+kind);};
  if(kind==='payload-readback')f.storage.hooks.writeTransform=(name,value)=>{if(name.endsWith('.gz')){const bad=Buffer.from(value);bad[0]^=1;return bad;}return value;};
  if(kind==='manifest-readback')f.storage.hooks.afterClose=async(name,path)=>{if(name.endsWith('.json'))await fs.writeFile(path,'{broken');};
  await failure(()=>f.store.ensure(f.key,{generate:async()=>f.raw,decode:kind==='decode'?()=>{throw Error('controlled invalid generated geometry');}:decode,onPhase:p=>phases.push(p)}),kind);check(!phases.includes('ready'),kind+' never emits ready');if(kind==='decode')same(writes,0,'bad generated payload never reaches filesystem writer');if(kind.endsWith('close'))check(f.storage.events.some(e=>e.op==='abort'),kind+' aborts failed writable');
 });
});
Deno.test('corrupt manifests/payloads and wrong decoder source are errors, never cache misses that silently regenerate',async()=>{
 for(const kind of ['schema','key','payload-hash','raw-hash','missing-payload','truncated-payload','wrong-decoder'])await fixture(async f=>{
  const result=await commit(f),m=await readManifest(f),path=join(f.directory,m.payloadSha256+'.gz');
  if(kind==='schema'){m.schema=99;await writeManifest(f,m);}if(kind==='key'){m.key='c'.repeat(64);await writeManifest(f,m);}if(kind==='payload-hash'){const bytes=await fs.readFile(path);bytes[5]^=1;await fs.writeFile(path,bytes);}if(kind==='raw-hash'){m.rawSha256='c'.repeat(64);await writeManifest(f,m);}if(kind==='missing-payload')await fs.rm(path);if(kind==='truncated-payload'){const bytes=await fs.readFile(path);await fs.writeFile(path,bytes.subarray(0,-1));}
  let generated=0;await failure(()=>new DisplacementStore(nativeStorage(f.root),recordingLocks()).ensure(f.key,{generate:async()=>{generated++;return f.raw;},decode:kind==='wrong-decoder'?raw=>DemonBakeDecode(raw,'maps/another.bsp',bsp):decode}),kind);same(generated,0,kind+' cannot be relabeled as an ordinary missing cache');check(result.manifest.rawSha256,'original commit was actually successful');
 });
});
Deno.test('compressed file and decompressed stream bounds reject before decoder or oversized reads without allocating huge fixtures',async()=>{
 for(const kind of ['manifest-raw-limit','manifest-compressed-limit','actual-file-limit','decompressed-limit'])await fixture(async f=>{
  await commit(f);const m=await readManifest(f);let decoded=0;
  if(kind==='manifest-raw-limit')m.rawBytes=512*1024*1024+1;if(kind==='manifest-compressed-limit')m.compressedBytes=128*1024*1024+1;if(kind==='decompressed-limit')m.rawBytes=1;await writeManifest(f,m);
  const events=[],storage=nativeStorage(f.root,{events,hooks:kind==='actual-file-limit'?{fileSize:(name,size)=>name.endsWith('.gz')?128*1024*1024+1:size}:{}});
  await failure(()=>new DisplacementStore(storage,recordingLocks()).read(f.key,raw=>{decoded++;return decode(raw);}),kind);same(decoded,0,kind+' rejects before geometry decoder');if(kind!=='decompressed-limit')check(!events.some(e=>e.op==='read'&&e.name.endsWith('.gz')),kind+' avoids reading oversized payload bytes');
 });
});
Deno.test('same-key exclusive locks prevent duplicate first generation while another key proceeds independently and queued cancellation cannot generate',()=>fixture(async f=>{
 const entered=deferred(),release=deferred(),phasesA=[],phasesB=[];let generations=0;
 const first=f.store.ensure(f.key,{generate:async()=>{generations++;entered.resolve();await release.promise;return f.raw;},decode,onPhase:p=>phasesA.push(p)});await entered.promise;
 const second=new DisplacementStore(nativeStorage(f.root),f.locks).ensure(f.key,{generate:async()=>{generations++;return f.raw;},decode,onPhase:p=>phasesB.push(p)});await until(()=>phasesB.includes('lock'),'second request waits for same-key lock');same(generations,1,'second same-key generation has not started');
 const otherKey=await DisplacementKey([1,bsp,field,'another recipe']),other=await new DisplacementStore(nativeStorage(f.root),f.locks).ensure(otherKey,{generate:async()=>f.raw,decode});same(other.source,'generated-and-stored','unrelated identity not blocked by global lock');
 const abort=new AbortController();let queuedGenerated=0;const queued=new DisplacementStore(nativeStorage(f.root),f.locks).ensure(f.key,{signal:abort.signal,generate:async()=>{queuedGenerated++;return f.raw;},decode});const queuedResult=queued.catch(e=>e);abort.abort();release.resolve();const [a,b]=await Promise.all([first,second]);same(a.source,'generated-and-stored','first request commits');same(b.source,'disk','waiting second request rereads committed result');same(generations,1,'exactly one same-key generator');same((await queuedResult).name,'AbortError','queued cancellation remains cancellation');same(queuedGenerated,0,'cancelled waiter never generates');check(f.locks.events.every(e=>e.mode==='exclusive'&&e.name.startsWith('quaked-displacement:')),'actual supplied Web Lock names and exclusive mode used');
}));
Deno.test('cancellation during cached decode or final committed readback prevents ready, while a completed valid file remains reusable next session',async()=>{
 for(const stage of ['cached','final-readback'])await fixture(async f=>{
  if(stage==='cached')await commit(f);const controller=new AbortController(),phases=[],entered=deferred(),release=deferred();let calls=0;
  const running=f.store.ensure(f.key,{signal:controller.signal,generate:async()=>f.raw,decode:async raw=>{calls++;const result=decode(raw);if(stage==='cached'||calls===2){entered.resolve();await release.promise;}return result;},onPhase:p=>phases.push(p)}),outcome=running.catch(e=>e);await entered.promise;controller.abort();release.resolve();same((await outcome).name,'AbortError',stage+' reports actual cancellation');check(!phases.includes('ready'),stage+' cannot emit readiness after cancellation');
  const fresh=await new DisplacementStore(nativeStorage(f.root),recordingLocks()).ensure(f.key,{generate:()=>{throw Error('completed valid commit should be reusable');},decode});same(fresh.source,'disk',stage+' retains usable valid durable files without resurrecting cancelled request');
 });
});
Deno.test('unavailable storage is explicit and failed open retries safely; persistence denial is reported without fabricating a grant',()=>fixture(async f=>{
 let generated=0;await failure(()=>new DisplacementStore({},{}).ensure(f.key,{generate:async()=>{generated++;return f.raw;},decode}),'unsupported filesystem/locks');same(generated,0,'unsupported backend never substitutes memory-only generation');
 f.storage.hooks.beforeOpen=attempt=>{if(attempt===1)throw Error('controlled transient directory failure');};await failure(()=>commit(f),'first open failure');const result=await commit(f);same(f.storage.attempts,2,'rejected open promise is not permanently cached');same(result.source,'generated-and-stored','later real filesystem open succeeds');
 const denied=nativeStorage(f.root,{hooks:{persist:()=>false,persisted:()=>false}}),disk=await new DisplacementStore(denied,recordingLocks()).read(f.key,decode);same(disk.persistence,'denied','actual persistence permission outcome retained');
}));
Deno.test('source/recipe/schema keys are deterministic and distinct, and invalid external keys cannot create filesystem paths',()=>fixture(async f=>{
 const sameKey=await DisplacementKey([1,bsp,field,settings]);same(sameKey,f.key,'stable identity produces stable key');const changed=await Promise.all([[2,bsp,field,settings],[1,'c'.repeat(64),field,settings],[1,bsp,'d'.repeat(64),settings],[1,bsp,field,'changed recipe']].map(DisplacementKey));same(new Set([f.key,...changed]).size,5,'schema/BSP/field/recipe changes separate durable identities');
 for(const key of ['../outside','A'.repeat(64),'0'.repeat(63),'0'.repeat(65)])await failure(()=>f.store.read(key,decode),'invalid key '+key);same(f.storage.attempts,0,'invalid reads never open filesystem');same(await f.store.read(f.key,decode),null,'only actually absent manifest is a cache miss');
}));
Deno.test('cancellation while actual cached payload file read is pending stops before decompression decode and cannot emit ready',()=>fixture(async f=>{
 await commit(f);const entered=deferred(),release=deferred(),controller=new AbortController(),phases=[];let decodes=0;
 const storage=nativeStorage(f.root,{hooks:{beforeRead:async name=>{if(name.endsWith('.gz')){entered.resolve();await release.promise;}}}}),store=new DisplacementStore(storage,recordingLocks());
 const running=store.ensure(f.key,{signal:controller.signal,generate:()=>{throw Error('cached file must never generate');},decode:raw=>{decodes++;return decode(raw);},onPhase:p=>phases.push(p)}),outcome=running.catch(e=>e);await entered.promise;controller.abort();release.resolve();same((await outcome).name,'AbortError','actual pending file read preserves cancellation');same(decodes,0,'cancelled cached read never reaches geometry decoding');check(!phases.includes('ready'),'cancelled file read never emits ready');
}));
