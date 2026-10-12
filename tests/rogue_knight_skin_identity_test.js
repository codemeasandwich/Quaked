// Public identity-bound reuse of the base Knight art on Rogue's two-skin model.
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
const NAME='progs/knight.mdl',BASE_SHA='094c278cba9851a940e3e40e4f209f372b916ad7bac68ba13efd7c0d7d676ed1',ROGUE_SHA='749325dd12abbfae8fc89416f217fa07c6d06bd30fed7359e599a04d969eefcf';
const SOURCE_DIR='tools/texture_sheets/sources/generated-2026-10-12/';
const SOURCE_SHA='e1a73ef1c822d8a21fd15c062df589be6c402f4e831681b954c21d96f2bf257a';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),index=JSON.parse(read('newer/enemies/index.json'));
const rogueVariant=skin=>index.models.knight.find(v=>v.nativeModelSha256===ROGUE_SHA&&v.skin===skin);
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
 const skins=bytes.readInt32LE(48),skinBytes=268*194,uvStart=84+skins*(4+skinBytes),frameStart=uvStart+108*12+213*16;let offset=frameStart;const frames=[];
 for(let f=0;f<97;f++){same(bytes.readInt32LE(offset),0,'ungrouped native frame');offset+=4;frames.push({min:bytes.subarray(offset,offset+3),max:bytes.subarray(offset+4,offset+7),name:bytes.toString('ascii',offset+8,offset+24).split('\0')[0],vertices:bytes.subarray(offset+24,offset+24+432)});offset+=456;}
 same(offset,bytes.length,'entire model frame stream consumed');return{skins,uvStart,frameStart,frames};
}
function geometry(model){const h=model.cache.data;return JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,scale:Array.from(h.scale),origin:Array.from(h.scale_origin)});}
async function ticks(){for(let i=0;i<25;i++)await Promise.resolve();}
async function fixture(run){
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),normals:mode.r_newer_normals.value,enemies:mode.r_newer_enemies.value};
 const requests=[];Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;
 const skins=await import('../src/newer/render/r_newerskins.js?rogue-knight-'+ ++serial);skins.R_NewerSetIndex(index);
 try{await run(skins,requests);}finally{skins.R_NewerSkinsShutdown();THREE.TextureLoader.prototype.load=old.loader;for(const k of ['document','window']){if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_normals.value=old.normals;mode.r_newer_enemies.value=old.enemies;}
}
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


const BASELINE_COUNTS={"boss":1,"knight":1,"ogre":1,"soldier":1,"wizard":1,"backpack":1,"suit":1,"armor":3,"shambler":1,"zombie":1,"demon":1,"h_demon":1,"h_dog":1,"zom_gib":1,"h_shams":1,"shalrath":1,"oldone":1,"enforcer":1,"tarbaby":4,"hknight":3,"scor":1,"dragon":1,"s_wrath":1,"mummy":1,"dog":1,"fish":1,"grem":1,"armabody":1,"armalegs":1,"eel2":6,"sword":1,"wrath":1,"lavaman":1,"morph_az":3,"morph_eg":3,"morph_gr":3},BASELINE_HEIGHTS={"gib1":[1],"gib2":[1],"gib3":[1],"zom_gib":[1],"ogre":[1],"h_ogre":[1],"demon":[1],"h_demon":[1],"shambler":[1],"h_shams":[1],"knight":[1],"h_knight":[1],"soldier":[1],"h_guard":[1],"wizard":[1],"h_wizard":[1],"h_dog":[1],"dog":[1],"zombie":[1],"h_zombie":[1],"boss":[1],"armabody":[1],"eel2":[1,1,1,1,1,1]};
const BASE_FILES={"newer/enemies/knight/custom/diffuse.webp":"3cfdd9d3c2a5d4bd4bfbcb34b4e15f58b645d592f658342149519c8d6e5fce55","newer/enemies/knight/custom/height.webp":"b9bfd8a47f91541f23826f46ce9d37ee345f2f95319b86c3faa935499d3f1a6d","newer/enemies/faces/knight.png":"4f5bf0da795a7166791aca024499f37b3a2df8c79078cf4e0d55a6fdf30b3a68","newer/enemies/heights/knight/skin0_0.webp":"bb1a47d31b7ee8fd034a4cd40e7d12f2e6da98ad76662123f0095e2fcf83957e"};
function shader(material){const s={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};material.onBeforeCompile(s);return s;}
Deno.test('Actual base and Rogue Knights preserve every native UV triangle and all 97 original poses',async()=>{
 const p=await pair();for(const[key,n]of [['base',1],['rogue',2]]){
  const{model,bytes}=p[key],h=model.cache.data,r=records(bytes);for(const[field,value]of Object.entries({numskins:n,skinwidth:268,skinheight:194,numverts:108,numtris:213,numframes:97,numposes:97}))same(h[field],value,key+' '+field);
  for(let skin=0;skin<n;skin++)same(bytes.readInt32LE(84+skin*(4+268*194)),0,'ungrouped native skin');let o=r.uvStart;
  for(let v=0;v<108;v++,o+=12){same(h.stverts[v].onseam,bytes.readInt32LE(o),'native seam');same(h.stverts[v].s,bytes.readInt32LE(o+4),'native U');same(h.stverts[v].t,bytes.readInt32LE(o+8),'native V');}
  for(let t=0;t<213;t++,o+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(o),'native facing');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(o+4+c*4),'native triangle');}
  for(let f=0;f<97;f++){same(h.frames[f].name,r.frames[f].name,'own native frame name');for(let v=0;v<108;v++){for(let a=0;a<3;a++)same(h.poseverts[f][v].v[a],r.frames[f].vertices[v*4+a],'pose coordinate');same(h.poseverts[f][v].lightnormalindex,r.frames[f].vertices[v*4+3],'native lighting normal');}}
 }
});
Deno.test('Living Knight skin0 and geometry are compatible while four historical frame names remain distinct',async()=>{
 const p=await pair(),b=p.base.bytes,r=p.rogue.bytes,br=records(b),rr=records(r);check(b.subarray(0,48).equals(r.subarray(0,48))&&b.subarray(52,84).equals(r.subarray(52,84)),'headers equal except skin count');
 same(sha(b.subarray(88,88+268*194)),'de268f450d7fa7ce864ae573067141b5d837747ecf158f7aa148279f1b920cce','actual shared skin0');check(b.subarray(88,88+268*194).equals(r.subarray(88,88+268*194)),'exact original pigment reuse');same(sha(r.subarray(92+268*194,92+2*268*194)),'6e6eb60bd744f76e12913b08695ea0f70fccb6d021e59e5afeb7de2a93fc79f2','actual stone skin1');check(b.subarray(br.uvStart,br.frameStart).equals(r.subarray(rr.uvStart,rr.frameStart)),'identical UV and triangle records');
 const differences=[];for(let f=0;f<97;f++){check(br.frames[f].vertices.equals(rr.frames[f].vertices),'native geometry and vertex normals equivalent');check(br.frames[f].min.equals(rr.frames[f].min)&&br.frames[f].max.equals(rr.frames[f].max),'native bounds equivalent');if(br.frames[f].name!==rr.frames[f].name)differences.push(f);}
 same(differences.join(),'72,73,74,75','only four decoded names differ');for(let f=72;f<=75;f++){same(br.frames[f].name,'standing'+(f-70),'base name retained');same(rr.frames[f].name,'standing'+(f-71),'Rogue name retained');}
});
Deno.test('Statue appends without changing original living art face metadata or stored skin0 height',async()=>{
 const original=index.models.knight[0],stone=rogueVariant(1);same(index.models.knight.length,2,'one legacy plus one statue');same(sha(JSON.stringify(original)),'7becff512738660670d0b3359ccbc45af3b898b50250805574416ed6736f5f5a','complete original face-capable variant intact');same(original.nativeModelSha256,undefined,'legacy matching policy unchanged');check(original.faces,'living face metadata preserved');same(stone.faces,undefined,'stone has no living face overlay');same(stone.dir,'knight/rogue1','statue directory');same(stone.skin,1,'only statue skin');same(stone.nativeModelSha256,ROGUE_SHA,'exact Rogue identity');same(JSON.stringify(stone.maps),' {"diffuse":"diffuse.png","height":"height.webp"}'.trim(),'diffuse and height only');
 same(JSON.stringify(index.nativeHeights.knight[1]),'[]','empty skin1 group explicitly suppresses fallback');same(sha(JSON.stringify(index.nativeHeights.knight[0])),'b89f160c8b95712150bbdb3f0af5a39d5f3d6f46684bb5d33002f9980bd3d7b9','stored living height entry unchanged');
 const prior=structuredClone(index);prior.models.ogre=prior.models.ogre.slice(0,1);prior.nativeHeights.ogre=prior.nativeHeights.ogre.slice(0,1);delete prior.version;prior.models=Object.fromEntries(Object.entries(prior.models).filter(([k])=>k in BASELINE_COUNTS).map(([k,v])=>[k,v.slice(0,BASELINE_COUNTS[k])]));prior.nativeHeights=Object.fromEntries(Object.entries(prior.nativeHeights).filter(([k])=>k in BASELINE_HEIGHTS).map(([k,v])=>[k,v.slice(0,BASELINE_HEIGHTS[k].length).map((g,i)=>g.slice(0,BASELINE_HEIGHTS[k][i]))]));
 same(sha(JSON.stringify(prior)),'a260f4c6365a757657b65a48085689d5c39e69b02bf2252ea06674362f06c910','entire pre-increment catalogue intact');for(const[file,digest]of Object.entries(BASE_FILES))same(sha(read(file)),digest,'unchanged prior file '+file);
 const base='newer/enemies/knight/rogue1/',report=JSON.parse(read(base+'SOURCE.json')),source=SOURCE_DIR+'knight-rogue-skin1.png',bytes=read(source);same(report.source,source,'source path');same(report.sourceSha256,SOURCE_SHA,'provenance source');same(sha(bytes),SOURCE_SHA,'immutable generated reference');same(bytes.readUInt32BE(16),1475,'source width');same(bytes.readUInt32BE(20),1067,'source height');same(report.nativeModelSha256,ROGUE_SHA,'fit identity');same(report.skin,1,'fit skin');
 for(const file of Object.values(stone.maps)){same(sha(read(base+file)),report.files[file],'actual output hash');const image=await decodedImage(base+file);same(image.width,1608,'fitted width');same(image.height,1164,'fitted height');check(image.data.every((v,i)=>i%4!==3||v===255),'opaque fitted asset');}
 const height=await decodedImage(base+'height.webp');check(height.data.every((v,i)=>i%4===3||v===height.data[i-i%4]),'grayscale authored relief');
});
Deno.test('Living faces remain available on base and Rogue slot0 but stone slot1 never acquires them',async()=>fixture(async(skins,requests)=>{
 const p=await pair(),models=[p.base.model,p.rogue.model],before=models.map(geometry);await skins.R_NewerSkinsPrepare(models);same(requests.length,5,'one shared living body/height/face trio and stone map pair');requests.forEach(r=>r.done(r.texture));
 const living=requests.find(r=>r.url.includes('knight/custom/diffuse.webp')),stone=requests.find(r=>r.url.includes('knight/rogue1/diffuse.png'));check(living&&stone,'both body files loaded');
 for(const model of models){const material=skins.R_NewerAliasMaterial({model,_faceSeed:7},NAME,true,0);same(material.map,living.texture,'same approved living art');same(shader(material).uniforms.uHasFace.value,1,'living faces stay enabled');}
 const material=skins.R_NewerAliasMaterial({model:p.rogue.model,_faceSeed:7},NAME,true,1);same(material.map,stone.texture,'stone art selected');same(shader(material).uniforms.uHasFace,undefined,'stone material has no living face uniforms');same(skins.R_NewerAliasMaterial({model:p.base.model},NAME,true,1),null,'base cannot select Rogue stone');
 mode.R_AnimSetClassicPass(true);same(skins.R_NewerAliasMaterial({model:p.rogue.model},NAME,true,1),null,'Classic remains native');mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;same(skins.R_NewerAliasMaterial({model:p.rogue.model},NAME,true,1),null,'custom off remains native');same(JSON.stringify(models.map(geometry)),JSON.stringify(before),'native geometry unchanged');
}));
Deno.test('Missing mismatched and pending identities cannot borrow ready stone while legacy slot0 remains unchanged',async()=>fixture(async(skins,requests)=>{
 const{rogue}=await pair();await skins.R_NewerSkinsPrepare([rogue.model]);requests.forEach(r=>r.done(r.texture));const changed=Buffer.from(rogue.bytes);changed.writeInt32LE(changed.readInt32LE(76)^1,76);const wrong=load(changed);await wrong.aliasSourceIdentity.promise;
 for(const model of [wrong,{...rogue.model,aliasSourceIdentity:undefined},{...rogue.model,aliasSourceIdentity:{state:'pending'}},{...rogue.model,aliasSourceIdentity:{state:'unavailable'}}]){same(skins.R_NewerAliasMaterial({model},NAME,true,1),null,'unapproved stone stays native');check(skins.R_NewerAliasMaterial({model,_faceSeed:0},NAME,true,0),'existing legacy slot0 matching preserved');}
 same(requests.length,5,'negative paths introduce no extra download');COM_AddPack(isolatedPack(NAME,rogue.bytes));
}));
Deno.test('Failed statue images settle to native and shutdown rejects late decoded callbacks',async()=>fixture(async(skins,requests)=>{
 const{rogue}=await pair();await skins.R_NewerSkinsPrepare([rogue.model]);requests.forEach(r=>r.url.includes('/rogue1/')?r.fail():r.done(r.texture));same(skins.R_NewerAliasMaterial({model:rogue.model},NAME,true,1),null,'failed statue stays native');const status=skins.R_NewerSkinsStatus([rogue.model]);same(status.pending,0,'failure settled');same(status.fallback,2,'both statue maps record fallback');skins.R_NewerSkinsShutdown();requests.filter(r=>r.url.includes('/rogue1/')).forEach(r=>r.done(r.texture));same(skins.R_NewerSkinsMaterials([rogue.model]).length,0,'late statue not published');
}));
Deno.test('Native stone skin1 derives relief from actual pixels and never fetches living height',async()=>fixture(async(skins,requests)=>{
 delete globalThis.window;mode.r_newer_enemies.value=0;mode.r_newer_normals.value=1;const{rogue}=await pair(),texture=rogue.model.cache.data.gl_texturenum[1][0],material=skins.R_EnemyAliasMaterial(texture,NAME,true,1,0,rogue.model);same(requests.length,0,'empty slot1 triggers no stored map fetch');same(material.map,texture,'actual native stone diffuse retained');const normal=shader(material).uniforms.qrNormal.value;check(normal,'actual native derived normal available');
 const baked=await verifyBake(companion(texture.image,null),'rogue:'+NAME,ROGUE_SHA);same(sha(normal.image.data),sha(baked.pixels),'runtime generated normal equals exact shipped stone input');
 await skins.R_NewerSkinsPrepare([rogue.model]);same(requests.length,1,'only living skin0 stored height prewarms');check(requests[0].url.includes('heights/knight/skin0_0.webp'),'only correct skin0 path');same(shader(skins.R_EnemyAliasMaterial(texture,NAME,true,1,0,rogue.model)).uniforms.qrNormal.value,normal,'skin0 prewarm cannot contaminate stone relief');
}));
Deno.test('Living native generated and stored relief still match their exact shipped inputs',async()=>{
 const{rogue}=await pair(),pixels=rogue.model.cache.data.gl_texturenum[0][0].image,entry=index.nativeHeights.knight[0][0];await verifyBake(companion(pixels,null),'rogue:'+NAME,ROGUE_SHA);await verifyBake(companion(pixels,await decodedImage('newer/enemies/'+entry.file),entry.strength,entry.cap),'rogue:'+NAME,ROGUE_SHA);
});
Deno.test('Statue authored output selects exact shipped custom relief while native family omits wrong inherited input',async()=>{
 const v=rogueVariant(1),dir='newer/enemies/'+v.dir+'/';await verifyBake(companion(await decodedImage(dir+v.maps.diffuse),await decodedImage(dir+v.maps.height),v.heightStrength,v.heightCap),'custom:'+v.dir);
 const m=JSON.parse(read('newer/normals/manifest.json')),native=m.levels['rogue:'+NAME];same(native.keys.length,3,'generated/stored skin0 plus generated skin1');check(!native.keys.includes('ae93f6785a185de94b8a4e56cd64085146806098a1878dfa367f641a71815482'),'incorrect skin0-height-on-skin1 witness removed from family');same(m.levels['custom:knight/custom'].keys.join(),'8d71aa5daf3ce06e6ef748f850bddb70f4c7bc0c07ef23cd77599f2c29ba29c4','legacy living prepared input untouched');
});
Deno.test('Actual Rogue Knight statue keeps its stone skin on waking and defaults to original frame44',async()=>{
 const{rogueDirectory}=await pair(),q=roguePrograms(await readMember(rogueDirectory.get('progs.dat'))),spawn=q.inspect('monster_knight');const branch=spawn.branches.find(b=>b.expression.op==='&'&&b.expression.left.field==='spawnflags'&&b.expression.right.constant===2&&spawn.writes.some(w=>w.field==='skin'&&w.expression.constant===1&&w.pc>b.pc&&w.pc<b.target));check(branch,'actual statue spawnflag2 branch');check(spawn.writes.some(w=>w.field==='frame'&&w.expression.constant===44&&w.pc>branch.pc&&w.pc<branch.target),'default native frame44 inside statue branch');
 for(const name of ['knight_pause','knight_pause1'])check(!q.inspect(name).writes.some(w=>w.field==='skin'),'activation never replaces stone pigment');check(q.inspect('knight_pause').writes.some(w=>w.field==='takedamage'&&w.expression.constant===2),'waking restores damage independently');
});

Deno.test('Decoded statue pigment contains no blue-grey backdrop inside actual native UV triangles',async()=>{
 const{rogue}=await pair(),bytes=rogue.bytes,r=records(bytes),v=rogueVariant(1),image=await decodedImage('newer/enemies/'+v.dir+'/'+v.maps.diffuse),factor=6,mask=new Uint8Array(image.width*image.height);
 same(image.width,268*factor,'UV scale width');same(image.height,194*factor,'UV scale height');
 // Independent triangle rasterization at output pixel centers: test the consumer's UV surface,
 // not the fitter's silhouette, morphological coverage or donor bookkeeping.
 for(let triangle=0;triangle<213;triangle++){
  const o=r.uvStart+108*12+triangle*16,front=bytes.readInt32LE(o),points=[];
  for(let c=0;c<3;c++){const vertex=bytes.readInt32LE(o+4+c*4),uv=r.uvStart+vertex*12;points.push([(bytes.readInt32LE(uv+4)+.5+(!front&&bytes.readInt32LE(uv)?134:0))*factor,(bytes.readInt32LE(uv+8)+.5)*factor]);}
  const[[ax,ay],[bx,by],[cx,cy]]=points,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-9)continue;
  const x0=Math.max(0,Math.floor(Math.min(ax,bx,cx))),x1=Math.min(image.width-1,Math.ceil(Math.max(ax,bx,cx))),y0=Math.max(0,Math.floor(Math.min(ay,by,cy))),y1=Math.min(image.height-1,Math.ceil(Math.max(ay,by,cy)));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den,w=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den;if(u>=-1e-8&&w>=-1e-8&&u+w<=1+1e-8)mask[y*image.width+x]=1;}
 }
 let covered=0,backdrop=0;const examples=[];
 for(let i=0;i<mask.length;i++)if(mask[i]){covered++;const r=image.data[i*4],g=image.data[i*4+1],b=image.data[i*4+2];if(b-r>=6||b-g>=8){backdrop++;if(examples.length<8)examples.push({x:i%image.width,y:Math.floor(i/image.width),rgb:[r,g,b]});}}
 check(covered>390000,'actual nondegenerate surface substantially exercised');console.log('STONE_UV_COLOR_AUDIT '+JSON.stringify({covered,blueGreyBackdrop:backdrop,examples}));same(backdrop,0,'neutral stone surface must never sample generated blue-grey backdrop');
});
