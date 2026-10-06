// Independent public contract: exact loaded native MDL identity admits optional
// body art. Uses bounded read-only owned PAK members; does not redistribute art.
// Run with QUAKED_OWNED_PAK and the maintained real-Three Node runner.
import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile} from '../src/pak.js';
import {VID_SetPalette} from '../src/vid.js';
import {Mod_Init,Mod_ForName,Mod_LoadModel,model_t} from '../src/gl_model.js';
import * as anim from '../src/r_anim.js';
const EXPECTED='da3dddbf592c05ce0c0340cc2eea842f28b5dcb9c0c03946abfb225c0b0a54ee';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
const sha=b=>createHash('sha256').update(b).digest('hex');
const ticks=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
let nativePromise,serial=0;
async function native(){
 if(!nativePromise)nativePromise=(async()=>{
  check(process.env.QUAKED_OWNED_PAK,'QUAKED_OWNED_PAK must identify the read-only owned archive');
  const directory=await pakDirectory(process.env.QUAKED_OWNED_PAK),files={};
  for(const name of ['progs/shalrath.mdl','progs/h_shal.mdl','gfx/palette.lmp']){
   check(directory.has(name),'owned archive includes '+name);files[name]=await readMember(directory.get(name));COM_AddPack(isolatedPack(name,files[name]));
  }
  same(sha(files['progs/shalrath.mdl']),EXPECTED,'independent exact owned Vore source oracle');
  VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();
  const body=Mod_ForName('progs/shalrath.mdl',true),head=Mod_ForName('progs/h_shal.mdl',true);
  await Promise.all([body.aliasSourceIdentity?.promise,head.aliasSourceIdentity?.promise]);
  return {body,head,files};
 })();return nativePromise;
}
function reload(name,bytes){COM_AddPack(isolatedPack(name,bytes));const model=new model_t();model.name=name;model.needload=true;return Mod_LoadModel(model,true);}
function geometry(model){const h=model.cache.data;return JSON.stringify({scale:Array.from(h.scale),origin:Array.from(h.scale_origin),commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,numskins:h.numskins,skinwidth:h.skinwidth,skinheight:h.skinheight});}
function variant(dir,extra={}){return {dir,maps:{diffuse:'diffuse.png'},...extra};}
function bsp(){const raw=new TextEncoder().encode('{"classname" "worldspawn"}\n{"classname" "monster_shalrath"}\0'),data=new Uint8Array(124+raw.length),v=new DataView(data.buffer);v.setInt32(0,29,true);v.setInt32(4,124,true);v.setInt32(8,raw.length,true);data.set(raw,124);return data;}
async function fixture(fn){
 const old={doc:Object.getOwnPropertyDescriptor(globalThis,'document'),loader:THREE.TextureLoader.prototype.load,newer:anim.R_IsNewer(),classic:anim.R_ClassicPassActive(),normals:anim.r_newer_normals.value,enemies:anim.r_newer_enemies.value};
 const requests=[];Object.defineProperty(globalThis,'document',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_progress,fail){const texture=new THREE.DataTexture(new Uint8Array(4*4*4).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 anim.R_AnimSetClassicPass(false);anim.R_AnimSetNewer(true);anim.r_newer_enemies.value=1;anim.r_newer_normals.value=0;
 const skins=await import('../src/r_newerskins.js?vore-identity-'+(++serial));
 try{await fn(skins,requests);}finally{skins.R_NewerSkinsShutdown();THREE.TextureLoader.prototype.load=old.loader;if(old.doc)Object.defineProperty(globalThis,'document',old.doc);else delete globalThis.document;anim.R_AnimSetClassicPass(old.classic);anim.R_AnimSetNewer(old.newer);anim.r_newer_normals.value=old.normals;anim.r_newer_enemies.value=old.enemies;}
}
Deno.test('actual owned Vore loaded through COM/Mod hashes once and preserves all native pose/skin/head bytes',async()=>{
 const {body,head,files}=await native(),identity=body.aliasSourceIdentity,h=body.cache.data;
 same(identity.state,'ready','real asynchronous digest ready');same(identity.sha256,EXPECTED,'loaded MDL hash');same(await identity.promise,EXPECTED,'public promise resolves exact digest');
 const before=geometry(body),headBefore=geometry(head),texture=h.gl_texturenum[0][0],pixels=sha(texture.image.data);
 same(Mod_ForName(body.name,true),body,'repeated native load returns original model');same(body.aliasSourceIdentity,identity,'same loaded model retains identity object');
 const changed=Buffer.from(files[body.name]);changed.writeInt32LE(changed.readInt32LE(76)^1,76); // valid native synctype, not filename identity
 const other=reload(body.name,changed);await other.aliasSourceIdentity.promise;
 same(other.name,body.name,'alternate MDL uses identical filename');same(other.aliasSourceIdentity.sha256,sha(changed),'different actual loaded MDL digest');check(other.aliasSourceIdentity.sha256!==EXPECTED,'filename cannot admit changed source');
 same(geometry(body),before,'original geometry and pose references unchanged');same(geometry(head),headBefore,'head unchanged');same(sha(texture.image.data),pixels,'native skin pixels unchanged');same(sha(files[body.name]),EXPECTED,'owned member buffer unchanged');
 COM_AddPack(isolatedPack(body.name,files[body.name]));
});
Deno.test('loaded identity snapshots bytes before digest and safely settles unavailable crypto',async()=>{
 const {files}=await native(),descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),original=globalThis.crypto;let release;
 try{
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:(algorithm,bytes)=>new Promise(resolve=>{release=()=>original.subtle.digest(algorithm,bytes).then(resolve);})}}});
  const pending=reload('progs/identity-vore-copy.mdl',files['progs/shalrath.mdl']);same(pending.aliasSourceIdentity.state,'pending','native decode is synchronous while digest waits');await ticks();check(release,'actual digest requested');
  COM_FindFile(pending.name).data[76]^=1; // mutate mounted test copy after load, never owned file
  await release();await pending.aliasSourceIdentity.promise;same(pending.aliasSourceIdentity.sha256,EXPECTED,'identity belongs to loaded snapshot, not later pack lookup');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:undefined});
  const absent=reload('progs/identity-vore-unavailable.mdl',files['progs/shalrath.mdl']);same(await absent.aliasSourceIdentity.promise,null,'unavailable digest resolves safe fallback');same(absent.aliasSourceIdentity.state,'unavailable','terminal unavailable state');check(absent.cache.data.posedata.length>0,'native geometry still usable without digest');
 }finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;}
});
Deno.test('constrained public matching rejects absent pending invalid and same-name wrong identities while legacy metadata stays compatible',async()=>fixture(async(skins)=>{
 const {body}=await native(),v=variant('native-vore',{nativeModelSha256:EXPECTED});check(skins.R_NewerVariantMatchesModel(v,body),'actual native positive');
 for(const model of [null,{name:body.name},{name:body.name,aliasSourceIdentity:{state:'pending',sha256:EXPECTED}},{name:body.name,aliasSourceIdentity:{state:'unavailable',sha256:EXPECTED}},{name:body.name,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}}])same(skins.R_NewerVariantMatchesModel(v,model),false,'source must be settled and exact');
 for(const hash of [null,42,'','da3ddd',EXPECTED.toUpperCase(),'z'.repeat(64)])same(skins.R_NewerVariantMatchesModel({...v,nativeModelSha256:hash},body),false,'invalid manifest digest rejected');
 check(skins.R_NewerVariantMatchesModel(variant('legacy'),null),'legacy variant does not require new model metadata');
}));
Deno.test('actual preparation and later body draw share only matched skin0 materials/textures; Classic and head retain native selection',async()=>fixture(async(skins,requests)=>{
 const {body,head,files}=await native(),before=geometry(body),headBefore=geometry(head),nativeTexture=body.cache.data.gl_texturenum[0][0],nativePixelSHA=sha(nativeTexture.image.data);
 const modified=Buffer.from(files[body.name]);modified.writeInt32LE(modified.readInt32LE(76)^1,76);const wrong=reload(body.name,modified);await wrong.aliasSourceIdentity.promise;
 skins.R_NewerSetIndex({version:'identity-body',models:{shalrath:[variant('vore/approved',{nativeModelSha256:EXPECTED})]}});
 const preparing=skins.R_NewerSkinsPrepare([body]);same(skins.R_NewerSkinsPrepare([body,body]),preparing,'actual model preparation is idempotent');await preparing;same(requests.length,1,'only matched body art begins');same(skins.R_NewerSkinsStatus([body]).pending,1,'prepare promise is not decoded readiness');same(skins.R_NewerAliasMaterial({model:body},body.name,true,0),null,'pending image retains native');
 requests[0].done(requests[0].texture);const material=skins.R_NewerAliasMaterial({model:body,_entityIndex:8},body.name,true,0);check(material,'approved body becomes available after real callback');same(material.map,requests[0].texture,'actual replacement material uses decoded texture');
 same(skins.R_NewerAliasMaterial({model:body},body.name,true,1),null,'unmatched skin1 native');same(skins.R_NewerAliasMaterial({model:head},head.name,true,0),null,'Vore head not replaced by body variant');same(skins.R_NewerAliasMaterial({model:wrong},wrong.name,true,0),null,'same-name modified MDL stays native after positive cache fill');
 check(skins.R_NewerSkinsMaterials([body]).includes(material),'prepared family returns actual rendered material');check(skins.R_NewerSkinsTextures([body]).includes(material.map),'prepared texture binding exact');same(skins.R_NewerSkinsMaterials([wrong]).length,0,'wrong-source material family excluded');same(skins.R_NewerSkinsTextures([wrong]).length,0,'wrong-source texture family excluded');same(skins.R_NewerSkinsStatus([wrong]).ready,0,'wrong-source status excludes decoded approved art');same(skins.R_NewerSkinsMaterials([body.name]).length,0,'bare name is insufficient for constrained prewarm');same(skins.R_NewerSkinsMaterials([head]).length,0,'head family empty');
 anim.R_AnimSetClassicPass(true);same(skins.R_NewerAliasMaterial({model:body},body.name,true,0),null,'Classic ignores approved optional art');anim.R_AnimSetClassicPass(false);anim.r_newer_enemies.value=0;same(skins.R_NewerAliasMaterial({model:body},body.name,true,0),null,'enemies-off remains native');
 same(geometry(body),before,'body geometry unchanged by art preparation');same(geometry(head),headBefore,'head geometry unchanged');same(sha(nativeTexture.image.data),nativePixelSHA,'native diffuse pixels not edited');same(requests.length,1,'all read-only family/status and negative draw paths start no extra loads');COM_AddPack(isolatedPack(body.name,files[body.name]));
}));
Deno.test('BSP prefetch skips source-constrained variants but preserves legacy body/head requests and skin selection',async()=>fixture(async(skins,requests)=>{
 const {body,head}=await native();skins.R_NewerSetIndex({version:'prefetch-identity',models:{shalrath:[variant('vore/approved',{nativeModelSha256:EXPECTED}),variant('vore/legacy0'),variant('vore/legacy1',{skin:1})],h_shal:[variant('head/legacy')]}});
 const bytes=bsp(),before=sha(bytes);await skins.R_NewerSkinsPrefetchBsp(bytes);same(requests.length,3,'legacy body0/body1/head only');check(!requests.some(r=>r.url.includes('/approved/')),'BSP name cannot admit source-bound body art');same(sha(bytes),before,'entity BSP bytes unmodified');
 await skins.R_NewerSkinsPrepare([body,head]);same(requests.length,4,'actual matching native model adds constrained art once');for(const request of requests)request.done(request.texture);
 const legacy=skins.R_NewerAliasMaterial({_entityIndex:8},body.name,true,1);check(legacy,'legacy skin1 works without model identity');same(legacy.map,requests.find(r=>r.url.includes('/legacy1/')).texture,'legacy skin index exact');const legacy0=skins.R_NewerAliasMaterial({_entityIndex:8},body.name,true,0);same(legacy0.map,requests.find(r=>r.url.includes('/legacy0/')).texture,'missing source metadata keeps eligible legacy skin0 only');check(skins.R_NewerAliasMaterial({model:head},head.name,true,0),'existing head variant remains independently usable');same(requests.length,4,'actual later draws reuse prepared sets');
}));
Deno.test('pending identity participates in actual preparation; shutdown cancels late identity and image publication',async()=>fixture(async(skins,requests)=>{
 const {body}=await native();let resolve;const identity={state:'pending',sha256:null,promise:new Promise(r=>resolve=r)},pending={...body,aliasSourceIdentity:identity};
 skins.R_NewerSetIndex({version:'pending-identity',models:{shalrath:[variant('vore/pending',{nativeModelSha256:EXPECTED})]}});
 same(skins.R_NewerAliasMaterial({model:pending},body.name,true,0),null,'pending draw cannot cache an approved material');const prepare=skins.R_NewerSkinsPrepare([pending]);await ticks();same(requests.length,0,'no art request before identity');same(skins.R_NewerSkinsStatus([pending]).preparePending,1,'identity work keeps real readiness pending');
 identity.state='ready';identity.sha256=EXPECTED;resolve(EXPECTED);await prepare;same(requests.length,1,'settled exact hash starts art');same(skins.R_NewerSkinsStatus([pending]).pending,1,'image still required');
 let disposed=0;requests[0].texture.addEventListener('dispose',()=>disposed++);skins.R_NewerSkinsShutdown();requests[0].done(requests[0].texture);check(disposed>0,'late decoded texture disposed');same(skins.R_NewerSkinsMaterials([pending]).length,0,'retired material never published');same(skins.R_NewerSkinsTextures([pending]).length,0,'retired texture never published');
 let finish;const second={...body,aliasSourceIdentity:{state:'pending',promise:new Promise(r=>finish=r)}};const cancelled=skins.R_NewerSkinsPrepare([second]);await ticks();skins.R_NewerSkinsShutdown();second.aliasSourceIdentity.state='ready';second.aliasSourceIdentity.sha256=EXPECTED;finish(EXPECTED);check((await cancelled).cancelled,'epoch rejects retired identity completion');same(requests.length,1,'late identity starts no request after shutdown');
}));
Deno.test('actual Classic and unsupported source preparations settle without requesting constrained images',async()=>fixture(async(skins,requests)=>{
 const {body}=await native();skins.R_NewerSetIndex({version:'unsupported-identity',models:{shalrath:[variant('vore/good',{nativeModelSha256:EXPECTED}),variant('vore/bad-null',{nativeModelSha256:null}),variant('vore/bad-text',{nativeModelSha256:'wrong'})]}});
 anim.R_AnimSetClassicPass(true);await skins.R_NewerSkinsPrepare([body]);same(requests.length,0,'Classic preparation does not load Newer optional body art');anim.R_AnimSetClassicPass(false);
 for(const identity of [undefined,{state:'unavailable',sha256:null,promise:Promise.resolve(null)},{state:'ready',sha256:'0'.repeat(64),promise:Promise.resolve('0'.repeat(64))}]){
  const model={...body,aliasSourceIdentity:identity};await skins.R_NewerSkinsPrepare([model]);same(requests.length,0,'missing/unavailable/wrong source and invalid metadata cannot start requests');same(skins.R_NewerSkinsMaterials([model]).length,0,'unsupported identity exposes no material');same(skins.R_NewerSkinsTextures([model]).length,0,'unsupported identity exposes no texture');check(skins.R_NewerSkinsStatus([model]).settled,'unsupported optional art settles native fallback, not an endless identity hold');
 }
 await skins.R_NewerSkinsPrepare([body]);same(requests.length,1,'only exact approved metadata initiates a load');requests[0].done(requests[0].texture);same(skins.R_NewerSkinsStatus([body]).ready,1,'invalid manifest variants never count as ready');
}));
Deno.test('same native model object reload rejects obsolete pending identity and tracks only current source readiness',async()=>fixture(async(skins,requests)=>{
 const {body,files}=await native(),original=files[body.name],modified=Buffer.from(original);modified.writeInt32LE(modified.readInt32LE(76)^1,76);const alternateSHA=sha(modified);
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto'),crypto=globalThis.crypto,jobs=[];
 // Hold real digest completions independently. The loader still receives and
 // decodes actual native MDL bytes through COM; neither result hash is faked.
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{subtle:{digest:(algorithm,bytes)=>new Promise(resolve=>jobs.push({complete:async()=>resolve(await crypto.subtle.digest(algorithm,bytes))}))}}});
 try{
  skins.R_NewerSetIndex({version:'reload-same-object',models:{shalrath:[variant('vore/source-a',{nativeModelSha256:EXPECTED}),variant('vore/source-b',{nativeModelSha256:alternateSHA})]}});
  const model=reload(body.name,original),identityA=model.aliasSourceIdentity,workA=skins.R_NewerSkinsPrepare([model]);await ticks();same(jobs.length,1,'first actual native source digest waiting');same(requests.length,0,'first source has no premature image request');
  COM_AddPack(isolatedPack(body.name,modified));model.needload=true;same(Mod_LoadModel(model,true),model,'native reload preserves model object identity');const identityB=model.aliasSourceIdentity;check(identityB!==identityA,'reload installs new source identity object');
  const workB=skins.R_NewerSkinsPrepare([model]);check(workB!==workA,'same-model source replacement requires distinct preparation');await ticks();same(jobs.length,2,'second actual digest admitted independently');
  await jobs[1].complete();await identityB.promise;await workB;same(identityB.sha256,alternateSHA,'new identity hashes current native bytes');same(identityA.state,'pending','old digest remains deliberately unresolved');same(requests.length,1,'only current source requests its art');check(requests[0].url.includes('/source-b/'),'current digest admits source B, not obsolete source A');
  same(skins.R_NewerAliasMaterial({model},model.name,true),null,'current image must still decode');requests[0].done(requests[0].texture);const materialB=skins.R_NewerAliasMaterial({model},model.name,true);same(materialB.map,requests[0].texture,'current-byte material uses B image');
  const currentStatus=skins.R_NewerSkinsStatus([model]);same(currentStatus.preparePending,0,'obsolete digest cannot keep current readiness pending');check(currentStatus.settled,'current source is ready even while retired digest remains pending');same(currentStatus.ready,1,'only current image counted');check(skins.R_NewerSkinsMaterials([model]).includes(materialB),'current family contains actual B draw material');
  await jobs[0].complete();await identityA.promise;check((await workA).cancelled,'late old identity resolves cancelled');same(requests.length,1,'old digest callback starts no A image');same(skins.R_NewerAliasMaterial({model},model.name,true),materialB,'old callback cannot replace current material');same(skins.R_NewerSkinsStatus([model]).preparePending,0,'late cancellation leaves no stale readiness');
  // A later legitimate reload of source A must not reuse its cancelled work.
  COM_AddPack(isolatedPack(body.name,original));model.needload=true;Mod_LoadModel(model,true);const workA2=skins.R_NewerSkinsPrepare([model]);check(workA2!==workA&&workA2!==workB,'new loaded source generation creates fresh preparation');await ticks();same(jobs.length,3,'real A reload gets its own digest');await jobs[2].complete();await workA2;same(requests.length,2,'reloaded A begins exactly its matching image');check(requests[1].url.includes('/source-a/'),'reloaded source A selected');same(skins.R_NewerAliasMaterial({model},model.name,true),null,'old B cannot leak while current A loads');same(skins.R_NewerSkinsTextures([model]).length,0,'old B family excluded during A loading');requests[1].done(requests[1].texture);
  const materialA=skins.R_NewerAliasMaterial({model},model.name,true);same(materialA.map,requests[1].texture,'actual draw returns current A');check(!skins.R_NewerSkinsMaterials([model]).includes(materialB),'B material excluded after A reload');check(!skins.R_NewerSkinsTextures([model]).includes(requests[0].texture),'B texture excluded after A reload');same(skins.R_NewerSkinsStatus([model]).ready,1,'ready status includes only current source family');same(sha(original),EXPECTED,'original read-only member remains unchanged');
 }finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor);else delete globalThis.crypto;COM_AddPack(isolatedPack(body.name,original));}
}));
