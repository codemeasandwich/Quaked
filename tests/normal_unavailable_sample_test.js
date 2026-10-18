import {ResourceURL} from '../src/platform/resource_paths.js';
// A shipped normal sample whose file this copy does not have (its game pack is not installed,
// docs/per-game-packs-design-2026-10-13.md) is generated instead of failing, so a level's
// readiness gate never waits on it; a sample the copy has is still the one used.
import * as THREE from 'three';
import {NormalInputs,NormalInputKey,NormalGenerate,R_NormalPrepare} from '../src/newer/assets/normal_prepare.js';
import {NormalBakeEncode} from '../src/newer/assets/normal_bake_format.js';
import {NORMAL_BAKES} from '../src/newer/assets/normal_bakes.js';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
Deno.test('a listed normal sample the package does not have is generated; one it has is shipped',async()=>{
 const texture=seed=>new THREE.DataTexture(Uint8Array.from({length:256},(_,i)=>(i*29+seed)%256),8,8);
 const absent=texture(5),present=texture(91),keys=[],oldFetch=globalThis.fetch,oldDistribution=globalThis.__QUAKED_DISTRIBUTION__;let requests=0;
 try{
  const files=new Map();
  for(const [t,name] of [[absent,'newer/normals/unshipped-sample.nm.gz'],[present,'newer/normals/shipped-sample.nm.gz']]){
   const input=NormalInputs(t),key=await NormalInputKey(input),raw=NormalBakeEncode(key,8,8,NormalGenerate(input)),bytes=gzipSync(raw);
   keys.push([key,NORMAL_BAKES[key]]);NORMAL_BAKES[key]={file:name,sha256:'fixture',rawSha256:createHash('sha256').update(raw).digest('hex')};files.set(name,bytes);
  }
  globalThis.__QUAKED_DISTRIBUTION__={profile:'desktop',has:path=>path!=='newer/normals/unshipped-sample.nm.gz',url:path=>path};
  globalThis.fetch=async url=>{requests++;const bytes=files.get(ResourceURL(url,true).split('?')[0]);check(bytes&&!ResourceURL(url,true).includes('unshipped'),'only the sample this copy has is fetched: '+url);return new Response(bytes);};
  const missing=R_NormalPrepare(absent);await missing.promise;
  same(missing.status,'ready','unavailable sample still prepares');check(missing.source!=='shipped','unavailable sample is generated, not shipped: '+missing.source);
  same(requests,0,'no request for a file the copy does not have');
  const shipped=R_NormalPrepare(present);await shipped.promise;
  same(shipped.status,'ready','available sample prepares');same(shipped.source,'shipped','available sample comes from its file');same(requests,1,'one request');
 }finally{
  globalThis.fetch=oldFetch;if(oldDistribution===undefined)delete globalThis.__QUAKED_DISTRIBUTION__;else globalThis.__QUAKED_DISTRIBUTION__=oldDistribution;
  for(const [key,prior] of keys){if(prior)NORMAL_BAKES[key]=prior;else delete NORMAL_BAKES[key];}absent.dispose();present.dispose();
 }
});
