// Public identity-bound reuse of the base Death Knight art on Rogue's two-skin model.
// Native frame padding is intentionally not interpreted as geometry; all meaningful native records are checked.
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile,COM_SetNewerPack,COM_NewerFile,COM_NewerURL} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
import {NormalInputs,NormalInputWitness,R_NormalPrepare} from '../src/newer/assets/normal_prepare.js';
import {NormalBakeDecode} from '../src/newer/assets/normal_bake_format.js';
const NAME='progs/hknight.mdl',BASE_SHA='78d0273de6850f92d059fa90969f66ee57435330b3c4954c836a7204bc7a9d5a',ROGUE_SHA='ff5e8e7e0339d70fa0edca83a0d082cfc934ae6f60bbbd8f310f32c438646485';
const DIFFUSE_SHA='6d2d99bb144d0af07aad7e0b544220def239e979b56311bb0498f7ac5f7fc863',HEIGHT_SHA='2cbebd4657b618977a0c502afb8ecde290597017e4f9f69d5dd46dff48d65592';
const STONE_SOURCE='tools/texture_sheets/sources/generated-2026-10-12/hknight-rogue-skin1.png',STONE_SHA='b0dda8fc735580c5c32573cfcd175fefad336290278ac974c21f697829884ba0';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),index=JSON.parse(read('newer/enemies/index.json'));
const rogueVariant=skin=>index.models.hknight.find(v=>v.nativeModelSha256===ROGUE_SHA&&v.skin===skin);
let pairPromise,serial=0;
function load(bytes){COM_AddPack(isolatedPack(NAME,bytes));const m=new model_t();m.name=NAME;m.needload=true;return Mod_LoadModel(m,true);}
async function pair(){
 if(!pairPromise)pairPromise=(async()=>{
  check(process.env.QUAKED_OWNED_PAK&&process.env.QUAKED_ID1_PAK,'provide owned Rogue and id1 archives');const rogueDirectory=await pakDirectory(process.env.QUAKED_OWNED_PAK),baseDirectory=await pakDirectory(process.env.QUAKED_ID1_PAK);
  COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(baseDirectory.get('gfx/palette.lmp'))));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();
  const b=await readMember(baseDirectory.get(NAME)),r=await readMember(rogueDirectory.get(NAME));same(sha(b),BASE_SHA,'actual base model');same(sha(r),ROGUE_SHA,'actual Rogue model');const base=load(b),rogue=load(r);await Promise.all([base.aliasSourceIdentity.promise,rogue.aliasSourceIdentity.promise]);return{base:{model:base,bytes:b},rogue:{model:rogue,bytes:r},rogueDirectory};
 })();return pairPromise;
}
function records(bytes){
 const skins=bytes.readInt32LE(48),skinBytes=308*154,uvStart=84+skins*(4+skinBytes),frameStart=uvStart+250*12+452*16;let offset=frameStart;const frames=[];
 for(let f=0;f<166;f++){same(bytes.readInt32LE(offset),0,'ungrouped native frame');offset+=4;frames.push({min:bytes.subarray(offset,offset+3),max:bytes.subarray(offset+4,offset+7),name:bytes.toString('ascii',offset+8,offset+24).split('\0')[0],vertices:bytes.subarray(offset+24,offset+24+1000)});offset+=1024;}
 same(offset,bytes.length,'entire model frame stream consumed');return{skins,uvStart,frameStart,frames};
}
function geometry(model){const h=model.cache.data;return JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,scale:Array.from(h.scale),origin:Array.from(h.scale_origin)});}
async function ticks(){for(let i=0;i<25;i++)await Promise.resolve();}
async function fixture(run){
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),normals:mode.r_newer_normals.value,enemies:mode.r_newer_enemies.value};
 const requests=[];Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;
 const skins=await import('../src/newer/render/r_newerskins.js?rogue-hknight-'+ ++serial);skins.R_NewerSetIndex(index);
 try{await run(skins,requests);}finally{skins.R_NewerSkinsShutdown();THREE.TextureLoader.prototype.load=old.loader;for(const k of ['document','window']){if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_normals.value=old.normals;mode.r_newer_enemies.value=old.enemies;}
}
Deno.test('Actual base and Rogue Death Knights retain all original skins, UVs, triangles and166poses',async()=>{
 const p=await pair();for(const [key,n,expected]of [['base',1,BASE_SHA],['rogue',2,ROGUE_SHA]]){
  const {model,bytes}=p[key],h=model.cache.data,raw=records(bytes);same(model.aliasSourceIdentity.sha256,expected,'loaded identity');for(const [field,value]of Object.entries({numskins:n,skinwidth:308,skinheight:154,numverts:250,numtris:452,numframes:166,numposes:166}))same(h[field],value,key+' '+field);
  for(let skin=0;skin<n;skin++)same(bytes.readInt32LE(84+skin*(4+308*154)),0,'ungrouped original skin');let offset=raw.uvStart,seams=0;
  for(let v=0;v<250;v++,offset+=12){const uv=h.stverts[v];same(uv.onseam,bytes.readInt32LE(offset),'UV seam');same(uv.s,bytes.readInt32LE(offset+4),'native U');same(uv.t,bytes.readInt32LE(offset+8),'native V');if(uv.onseam)seams++;}same(seams,141,'native seam count');
  for(let t=0;t<452;t++,offset+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(offset),'native face');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(offset+4+c*4),'native triangle corner');}
  for(let f=0;f<166;f++){same(h.frames[f].name,raw.frames[f].name,'decoded native frame name');for(let v=0;v<250;v++){for(let a=0;a<3;a++)same(h.poseverts[f][v].v[a],raw.frames[f].vertices[v*4+a],'native pose coordinate');same(h.poseverts[f][v].lightnormalindex,raw.frames[f].vertices[v*4+3],'native pose lighting normal');}}
  same(h.frames[73].name,'char_a11','actual default statue pose');
 }
});
Deno.test('Rogue skin0 is exactly compatible with base artwork while stone skin1 and full model identities remain distinct',async()=>{
 const p=await pair(),b=p.base.bytes,r=p.rogue.bytes,br=records(b),rr=records(r);
 check(b.subarray(0,48).equals(r.subarray(0,48))&&b.subarray(52,84).equals(r.subarray(52,84)),'all model header fields except skin count match');
 const skin0=b.subarray(88,88+308*154);same(sha(skin0),'784bdd23234c131234af86addf1a4111e93525ad2029687c7f524c804f9d18db','native shared skin0');check(skin0.equals(r.subarray(88,88+308*154)),'same native skin pixels');same(sha(r.subarray(92+308*154,92+2*308*154)),'666f6ba8c2782ea59f1af6ebe6b2161560e5338af2e871b095d924200d2496b7','distinct stone skin1');
 check(b.subarray(br.uvStart,br.frameStart).equals(r.subarray(rr.uvStart,rr.frameStart)),'UV and triangle bytes identical');
 for(let f=0;f<166;f++){check(br.frames[f].vertices.equals(rr.frames[f].vertices),'every pose coordinate and normal record identical');check(br.frames[f].min.equals(rr.frames[f].min)&&br.frames[f].max.equals(rr.frames[f].max),'meaningful bounds identical');same(br.frames[f].name,rr.frames[f].name,'decoded names identical');}
 check(!b.subarray(br.frameStart).equals(r.subarray(rr.frameStart)),'known ignored bbox-normal/name-padding differences are not relabelled identical');same(sha(p.base.model.cache.data.gl_texturenum[0][0].image.data),sha(p.rogue.model.cache.data.gl_texturenum[0][0].image.data),'loaded native skin0 RGBA also identical after floodfill');
});
Deno.test('Rogue variants append without changing any prior catalogue entry or base asset and accurately record copied/generated provenance',async()=>{
 same(index.models.hknight.length,3,'base0 plus Rogue0 and Rogue1');same(sha(JSON.stringify(index.models.hknight[0])),'c5d9a133223ed6ab6ca53ba3730000d360e5eae5017480c78807796e73b17fef','original base variant exact');
 const prior=structuredClone(index);prior.models.ogre=prior.models.ogre.slice(0,1);prior.nativeHeights.ogre=prior.nativeHeights.ogre.slice(0,1);prior.models.knight=prior.models.knight.slice(0,1);prior.nativeHeights.knight=prior.nativeHeights.knight.slice(0,1);delete prior.version;prior.models.hknight=prior.models.hknight.slice(0,1);prior.models.tarbaby=prior.models.tarbaby.slice(0,1);
 same(sha(JSON.stringify(prior)),'cfec724325b5606d93c70c9392274b3ebd9fce5f28a832f13129971714a570ea','entire pre-increment catalogue preserved');
 same(new Set(index.models.hknight.map(v=>v.dir)).size,3,'unique cache directories for all three bindings');
 for(const[file,digest]of [['diffuse.webp',DIFFUSE_SHA],['height.webp',HEIGHT_SHA]]){same(sha(read('newer/enemies/hknight/custom/'+file)),digest,'base asset unchanged');same(sha(read('newer/enemies/hknight/rogue0/'+file)),digest,'Rogue0 asset is exact copy');}
 const reused=JSON.parse(read('newer/enemies/hknight/rogue0/SOURCE.json'));same(reused.nativeModelSha256,ROGUE_SHA,'reuse targets Rogue identity');same(reused.skin,0,'reuse slot');same(reused.reuse.fromDirectory,'hknight/custom','existing art source');same(reused.reuse.fromModelSha256,BASE_SHA,'existing native provenance');same(sha(read(reused.reuse.sourceProvenance)),reused.reuse.sourceProvenanceSha256,'reuse chain refers to intact original provenance');
 const stone=JSON.parse(read('newer/enemies/hknight/rogue1/SOURCE.json'));same(stone.nativeModelSha256,ROGUE_SHA,'stone target identity');same(stone.source,STONE_SOURCE,'generated stone source');same(stone.sourceSha256,STONE_SHA,'stone source pin');same(sha(read(STONE_SOURCE)),STONE_SHA,'actual generated stone');same(stone.skin,1,'stone slot');same(JSON.stringify(stone.dimensions),'[1848,924]','stone fitted dimensions');
 const source=read(STONE_SOURCE);same(source.readUInt32BE(16),1774,'source width');same(source.readUInt32BE(20),887,'source height');
 for(let skin=0;skin<2;skin++){
  const v=rogueVariant(skin),dir='newer/enemies/'+v.dir+'/',report=skin?stone:reused;same(v.dir,'hknight/rogue'+skin,'unique variant path');same(v.maps.diffuse,skin?'diffuse.png':'diffuse.webp','diffuse format');same(v.maps.height,'height.webp','height map');same(Object.keys(v.maps).length,2,'no new emission');
  for(const file of Object.values(v.maps))same(sha(read(dir+file)),report.files[file],'actual output digest');const d=await decodedImage(dir+v.maps.diffuse),h=await decodedImage(dir+v.maps.height);same(d.width,skin?1848:1540,'decoded width');same(d.height,skin?924:770,'decoded height');same(h.width,d.width,'height width');same(h.height,d.height,'height height');check(d.data.every((v,i)=>i%4!==3||v===255)&&h.data.every((v,i)=>i%4!==3||v===255),'opaque assets');check(h.data.every((v,i)=>i%4===3||v===h.data[i-i%4]),'grayscale authored height');
 }
});
Deno.test('Three same-name source/skin bindings coexist without material or prewarm cache collisions',async()=>fixture(async(skins,requests)=>{
 const p=await pair(),models=[p.base.model,p.rogue.model],before=models.map(geometry);await skins.R_NewerSkinsPrepare(models);same(requests.length,6,'three independent image pairs prepared');requests.forEach(r=>r.done(r.texture));
 const combinations=[[p.base.model,0,'hknight/custom','diffuse.webp'],[p.rogue.model,0,'hknight/rogue0','diffuse.webp'],[p.rogue.model,1,'hknight/rogue1','diffuse.png']],chosen=[];
 for(const [model,skin,dir,file]of combinations){const m=skins.R_NewerAliasMaterial({model,_entityIndex:4},NAME,true,skin),r=requests.find(r=>r.url.startsWith('newer/enemies/'+dir+'/'+file+'?'));check(m&&r,'actual source/skin binding ready');same(m.map,r.texture,'correct path bound');check(skins.R_NewerSkinsMaterials([model]).includes(m),'actual matching prewarm exposes material');chosen.push(m.map);}
 same(new Set(chosen).size,3,'base and copied Rogue art have separate cached sets');check(!skins.R_NewerSkinsTextures([p.base.model]).includes(chosen[1])&&!skins.R_NewerSkinsTextures([p.rogue.model]).includes(chosen[0]),'prewarm source filters do not leak equal-art sets');same(skins.R_NewerAliasMaterial({model:p.base.model},NAME,true,1),null,'base model never acquires Rogue statue slot');
 const changed=Buffer.from(p.rogue.bytes);changed.writeInt32LE(changed.readInt32LE(76)^1,76);const wrong=load(changed);await wrong.aliasSourceIdentity.promise;for(const skin of [0,1])same(skins.R_NewerAliasMaterial({model:wrong},NAME,true,skin),null,'unapproved source stays native');
 mode.R_AnimSetClassicPass(true);for(const [m,skin]of combinations)same(skins.R_NewerAliasMaterial({model:m},NAME,true,skin),null,'Classic remains original');mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;for(const [m,skin]of combinations)same(skins.R_NewerAliasMaterial({model:m},NAME,true,skin),null,'custom-off remains original');same(JSON.stringify(models.map(geometry)),JSON.stringify(before),'both native models remain unchanged');COM_AddPack(isolatedPack(NAME,p.rogue.bytes));
}));
Deno.test('Pending, failed and retired Rogue image preparation retains both native skin fallbacks',async()=>fixture(async(skins,requests)=>{
 const p=await pair();let finish;const identity={state:'pending',promise:new Promise(r=>finish=r)},model={...p.rogue.model,aliasSourceIdentity:identity};const work=skins.R_NewerSkinsPrepare([model]);await ticks();same(requests.length,0,'pending source fetches nothing');identity.state='ready';identity.sha256=ROGUE_SHA;finish(ROGUE_SHA);await work;same(requests.length,4,'only two Rogue states requested');requests.forEach(r=>r.fail());const status=skins.R_NewerSkinsStatus([model]);same(status.pending,0,'failed downloads no longer pending');same(status.fallback,4,'all failures recorded');check(status.settled,'native fallback settles');for(const skin of [0,1])same(skins.R_NewerAliasMaterial({model},NAME,true,skin),null,'failed state remains native');let disposals=0;requests.forEach(r=>r.texture.addEventListener('dispose',()=>disposals++));skins.R_NewerSkinsShutdown();requests.forEach(r=>r.done(r.texture));same(disposals,4,'late decoded maps disposed');same(skins.R_NewerSkinsMaterials([model]).length,0,'shutdown rejects late publication');
}));
Deno.test('Every actual material path resolves directly from a Newer pack without parent-relative aliases',()=>{
 const paths=index.models.hknight.flatMap(v=>Object.values(v.maps).map(file=>'newer/enemies/'+v.dir+'/'+file)),chunks=paths.map(read),data=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;
 const files=paths.map((name,i)=>{check(!name.split('/').some(x=>x==='.'||x==='..'),'direct portable logical path');const file={name,filepos:offset,filelen:chunks[i].length};data.set(chunks[i],offset);offset+=chunks[i].length;return file;});
 COM_SetNewerPack({filename:'test-only-packed-hknight',data:data.buffer,files});try{
  for(let i=0;i<paths.length;i++){const f=COM_NewerFile(paths[i]);check(f,'packed member found');same(sha(f.data),sha(chunks[i]),'packed bytes match real asset');check(COM_NewerURL(paths[i],'missing-fallback').startsWith('blob:'),'public URL resolves to packed data');}
  check(COM_NewerURL('newer/enemies/hknight/custom/diffuse.webp','missing')!==COM_NewerURL('newer/enemies/hknight/rogue0/diffuse.webp','missing'),'identical bytes retain distinct logical URL keys');same(COM_NewerFile('newer/enemies/hknight/rogue0/../custom/diffuse.webp'),null,'pack lookup does not silently normalize unsafe reuse paths');
 }finally{COM_SetNewerPack(null);}
});

const decodedImages = new Map();
async function decodedImage(path) {
 if (!decodedImages.has(path)) decodedImages.set(path,(async()=>{
  const canvas = await import(process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
  const image = await canvas.loadImage(read(path)), surface = canvas.createCanvas(image.width,image.height), context = surface.getContext('2d');
  context.drawImage(image,0,0); return context.getImageData(0,0,image.width,image.height);
 })());
 return decodedImages.get(path);
}
function companion(pixels,height,strength=.65,cap=.55) {
 const texture = new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);
 texture.userData.newerHeight={width:pixels.width,height:pixels.height,derive:!height,data:height?Float32Array.from({length:height.width*height.height},(_,i)=>height.data[i*4]/255):undefined,strength,cap};
 return texture;
}
const verifiedNormalKeys = new Set();
async function verifyBake(texture,family,expectedModelSha=null) {
 const input=NormalInputs(texture),witness=await NormalInputWitness(input),manifest=JSON.parse(read('newer/normals/manifest.json')),spec=manifest.samples[witness.key],level=manifest.levels[family];
 check(spec,'exact decoded input has a shipped sample: '+family);check(level?.keys.includes(witness.key),'native/custom family references exact input: '+family);
 if(expectedModelSha)same(level.modelSha256,expectedModelSha,'native normal model identity');
 const {key,...details}=witness;same(JSON.stringify(spec.input),JSON.stringify(details),'every normal input witness field matches');
 const compressed=read(spec.file),raw=gunzipSync(compressed);same(sha(compressed),spec.sha256,'compressed normal bytes');same(sha(raw),spec.rawSha256,'decoded normal bytes');
 const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),decoded=NormalBakeDecode(buffer,key,input.width,input.height);
 if(input.scalar)check(decoded.scalar.every((value,i)=>value===input.scalar[i]),'stored scalar agrees with exact authored height');
 let loads=0;const work=R_NormalPrepare(texture,{loader:async requested=>{loads++;same(requested.rawSha256,spec.rawSha256,'public runtime selects same prepared bytes');return buffer;},disk:{ensure(){throw Error('Shipped normal must not use disk generation');}},generate(){throw Error('Shipped normal must not regenerate');}});
 await work.promise;same(work.status,'ready','normal preparation ready');same(work.source,'shipped','actual public path uses shipped normals');check(loads===1 || (loads===0 && verifiedNormalKeys.has(key)), 'one prepared load, or reuse of an already independently verified shipped key');verifiedNormalKeys.add(key);same(R_NormalPrepare(texture),work,'prepared work reused');texture.dispose();same(work.status,'cancelled','normal preparation retires with texture');
 return decoded;
}

function roguePrograms(bytes){
 const int=o=>bytes.readInt32LE(o),h=Array.from({length:15},(_,i)=>int(i*4)),[so,sn,go,gn,fo,fn,fun,nfun,stro,strn,glo]=h.slice(2),string=o=>bytes.toString('latin1',stro+o,bytes.indexOf(0,stro+o));
 const functions=Array.from({length:nfun},(_,i)=>({start:int(fun+i*36),name:string(int(fun+i*36+16))})),starts=[...new Set(functions.filter(f=>f.start>0).map(f=>f.start))].sort((a,b)=>a-b);starts.push(sn);
 const fields=new Map(Array.from({length:fn},(_,i)=>{const o=fo+i*8;return[bytes.readUInt16LE(o+2),string(int(o+4))];}));
 const globals=new Map(Array.from({length:gn},(_,i)=>{const o=go+i*8;return[bytes.readUInt16LE(o+2),string(int(o+4))];}));
 const integer=i=>int(glo+i*4),float=i=>bytes.readFloatLE(glo+i*4),statement=pc=>{const o=so+pc*8;return{op:bytes.readUInt16LE(o),a:bytes.readInt16LE(o+2),b:bytes.readInt16LE(o+4),c:bytes.readInt16LE(o+6)};};
 return{inspect(name){
  const f=functions.find(f=>f.name===name);check(f&&f.start>0,'actual Rogue Guardian function '+name);const end=starts.find(n=>n>f.start),values=new Map(),pointers=new Map(),writes=[],states=[],branches=[];
  const value=(i,type='float')=>values.get(i)||(type==='string'?{string:string(integer(i))}:{constant:float(i)});
  for(let pc=f.start;pc<end;pc++){
   const s=statement(pc);
   if(s.op>=24&&s.op<=29)values.set(s.c,{field:fields.get(integer(s.b)),entity:globals.get(s.a)||String(s.a)});
   else if(s.op===30)pointers.set(s.c,{field:fields.get(integer(s.b)),entity:globals.get(s.a)||String(s.a)});
   else if([31,32,33,34,35,36].includes(s.op))values.set(s.b,value(s.a,s.op===33?'string':'float'));
   else if(s.op===6||s.op===8||s.op===64)values.set(s.c,{op:s.op===6?'+':s.op===8?'-':'&',left:value(s.a),right:value(s.b)});
   else if(s.op>=37&&s.op<=42&&pointers.has(s.b))writes.push({pc,...pointers.get(s.b),expression:value(s.a,s.op===39?'string':'float')});
   else if(s.op===49||s.op===50)branches.push({pc,expression:value(s.a),target:pc+s.b});
   else if(s.op===60)states.push({pc,frame:float(s.a),next:functions[integer(s.b)]?.name});
  }
  return{writes,states,branches};
 }};
}

for(let skin=0;skin<2;skin++)Deno.test('Rogue Death Knight skin'+skin+' selects exact generated native and authored custom prepared normals',async()=>{
 const {rogue}=await pair(),v=rogueVariant(skin),dir='newer/enemies/'+v.dir+'/',diffuse=await decodedImage(dir+v.maps.diffuse),height=await decodedImage(dir+v.maps.height);
 await verifyBake(companion(rogue.model.cache.data.gl_texturenum[skin][0].image,null),'rogue:'+NAME,ROGUE_SHA);
 await verifyBake(companion(diffuse,height,v.heightStrength,v.heightCap),'custom:'+v.dir);
});
Deno.test('Rogue reuse retains all three existing normal inputs and adds only the statue custom payload',()=>{
 const m=JSON.parse(read('newer/normals/manifest.json')),native=m.levels['rogue:'+NAME];same(native.modelSha256,ROGUE_SHA,'Rogue native family identity');same(native.keys.length,2,'both native states prepared');
 const copied=m.levels['custom:hknight/rogue0'].keys,original=m.levels['custom:hknight/custom'].keys;same(copied.join(),original.join(),'copied art reuses existing base custom input');same(copied[0],'5be895ba3bcea0ec90b24caa3acc03863ea1feaa5e631b824ada0e705e430a26','original prepared input remains exact');
 const old=new Set(['c50abb2d14b086b8ce5474885e040dbcd4de38ebf82ce684ee5e593d341aa3c0','215feaed328d1a044cf9dd438a227ab7848c7c782c0978cf5873982f679f56bf','5be895ba3bcea0ec90b24caa3acc03863ea1feaa5e631b824ada0e705e430a26']);
 const current=new Set([...native.keys,...copied,...m.levels['custom:hknight/rogue1'].keys]);same(current.size,4,'four Rogue material input references');same([...current].filter(k=>old.has(k)).length,3,'three existing inputs retained');same([...current].filter(k=>!old.has(k)).length,1,'only one newly generated normal payload');
});
Deno.test('Actual Rogue QuakeC keeps statue skin1 after activation and defaults its initial pose tochar_a11',async()=>{
 const {rogueDirectory}=await pair(),q=roguePrograms(await readMember(rogueDirectory.get('progs.dat'))),spawn=q.inspect('monster_hell_knight');
 const branch=spawn.branches.find(b=>b.expression.op==='&'&&b.expression.left.field==='spawnflags'&&b.expression.right.constant===2&&spawn.writes.some(w=>w.field==='skin'&&w.expression.constant===1&&w.pc>b.pc&&w.pc<b.target));
 check(branch,'actual spawnflag2 admits stone skin');check(spawn.writes.some(w=>w.field==='frame'&&w.expression.constant===73&&w.pc>branch.pc&&w.pc<branch.target),'default statue frame73 is assigned inside statue branch');
 for(const name of ['hknight_pause','hknight_pause1'])check(!q.inspect(name).writes.some(w=>w.field==='skin'),'activation/pause does not turn statue into living skin: '+name);
 check(q.inspect('hknight_pause').writes.some(w=>w.field==='takedamage'&&w.expression.constant===2),'activation restores damage independently of pigment');
});
