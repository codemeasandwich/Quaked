// Public identity-bound reuse of the base Spawn art on Rogue's three-skin model.
// Native frame padding is intentionally not interpreted as geometry; all meaningful native records are checked.
import * as THREE from 'three';
import {readFileSync} from './helpers/resource_fs.mjs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {pakDirectory,readMember,isolatedPack} from '../tools/pak_members.mjs';
import {COM_AddPack,COM_FindFile,COM_SetNewerPack,COM_NewerFile,COM_NewerURL} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_LoadModel,model_t} from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
import {NormalInputs,NormalInputWitness,R_NormalPrepare} from '../src/newer/assets/normal_prepare.js';
import {NormalBakeDecode} from '../src/newer/assets/normal_bake_format.js';
const NAME='progs/tarbaby.mdl',BASE_SHA='9933ee9b251e4c32a22129e2a9cda8cebfd2f317aeb2961a0591a098e9e823ea',ROGUE_SHA='5dd6250329f64a9570021ced7a40d9c46020f46ad046366100cf0a7c6bd8612e';
const DIFFUSE_SHA='acd955d0badb9615bacd7c69291a83e68639e8c2869f0bb56e30f3a3ac82d8c9',HEIGHT_SHA='0b99cacc555e6ced965df2db4bacb575b70879d32e123fcd94f779016ae3698b';
const SOURCE_DIR='tools/texture_sheets/sources/generated-2026-10-12/';
const GENERATED=[null,{sha:'bafc3bcbf99987188f89a038f389b11e3ece23adec28fb925f79875720cad48f',width:1570,height:1001},{sha:'4ed67597d7cbd0bd3a90bdce25276c882c2d67c8d79a0c2566689ef39c6fe1d4',width:1570,height:1002}];
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),index=JSON.parse(read('newer/enemies/index.json'));
const rogueVariant=skin=>index.models.tarbaby.find(v=>v.nativeModelSha256===ROGUE_SHA&&v.skin===skin);
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
 const skins=bytes.readInt32LE(48),skinBytes=304*194,uvStart=84+skins*(4+skinBytes),frameStart=uvStart+130*12+256*16;let offset=frameStart;const frames=[];
 for(let f=0;f<61;f++){same(bytes.readInt32LE(offset),0,'ungrouped native frame');offset+=4;frames.push({min:bytes.subarray(offset,offset+3),max:bytes.subarray(offset+4,offset+7),name:bytes.toString('ascii',offset+8,offset+24).split('\0')[0],vertices:bytes.subarray(offset+24,offset+24+520)});offset+=544;}
 same(offset,bytes.length,'entire model frame stream consumed');return{skins,uvStart,frameStart,frames};
}
function geometry(model){const h=model.cache.data;return JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,scale:Array.from(h.scale),origin:Array.from(h.scale_origin)});}
async function ticks(){for(let i=0;i<25;i++)await Promise.resolve();}
async function fixture(run){
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),normals:mode.r_newer_normals.value,enemies:mode.r_newer_enemies.value};
 const requests=[];Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;
 const skins=await import('../src/newer/render/r_newerskins.js?rogue-tarbaby-'+ ++serial);skins.R_NewerSetIndex(index);
 try{await run(skins,requests);}finally{skins.R_NewerSkinsShutdown();THREE.TextureLoader.prototype.load=old.loader;for(const k of ['document','window']){if(old[k])Object.defineProperty(globalThis,k,old[k]);else delete globalThis[k];}mode.R_AnimSetClassicPass(old.classic);mode.R_AnimSetNewer(old.newer);mode.r_newer_normals.value=old.normals;mode.r_newer_enemies.value=old.enemies;}
}
Deno.test('Actual base and Rogue Spawns retain all original skins, UVs, triangles and all 61 poses',async()=>{
 const p=await pair();for(const [key,n,expected]of [['base',1,BASE_SHA],['rogue',3,ROGUE_SHA]]){
  const {model,bytes}=p[key],h=model.cache.data,raw=records(bytes);same(model.aliasSourceIdentity.sha256,expected,'loaded identity');for(const [field,value]of Object.entries({numskins:n,skinwidth:304,skinheight:194,numverts:130,numtris:256,numframes:61,numposes:61}))same(h[field],value,key+' '+field);
  for(let skin=0;skin<n;skin++)same(bytes.readInt32LE(84+skin*(4+304*194)),0,'ungrouped original skin');let offset=raw.uvStart,seams=0;
  for(let v=0;v<130;v++,offset+=12){const uv=h.stverts[v];same(uv.onseam,bytes.readInt32LE(offset),'UV seam');same(uv.s,bytes.readInt32LE(offset+4),'native U');same(uv.t,bytes.readInt32LE(offset+8),'native V');if(uv.onseam)seams++;}same(seams,46,'native seam count');
  for(let t=0;t<256;t++,offset+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(offset),'native face');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(offset+4+c*4),'native triangle corner');}
  for(let f=0;f<61;f++){same(h.frames[f].name,raw.frames[f].name,'decoded native frame name');for(let v=0;v<130;v++){for(let a=0;a<3;a++)same(h.poseverts[f][v].v[a],raw.frames[f].vertices[v*4+a],'native pose coordinate');same(h.poseverts[f][v].lightnormalindex,raw.frames[f].vertices[v*4+3],'native pose lighting normal');}}
  same(h.frames[60].name,'exp','native explosion pose retained');
 }
});
Deno.test('Rogue skin0 is exactly compatible with base artwork while green and noduled skins and full model identities remain distinct',async()=>{
 const p=await pair(),b=p.base.bytes,r=p.rogue.bytes,br=records(b),rr=records(r);
 check(b.subarray(0,48).equals(r.subarray(0,48))&&b.subarray(52,84).equals(r.subarray(52,84)),'all model header fields except skin count match');
 const skin0=b.subarray(88,88+304*194);same(sha(skin0),'8eba28bd9d361bce5698e770c10a00742162398e7bab797b8fcddabf5750e626','native shared skin0');check(skin0.equals(r.subarray(88,88+304*194)),'same native skin pixels');same(sha(r.subarray(92+304*194,92+2*304*194)),'4d0159b61a8413e0eeaa1e919e70c5806406c426a7c52388c6c759b3b5656743','distinct green and noduled skins');
 same(sha(r.subarray(96+2*304*194,96+3*304*194)),'8f93d47dcfe8cbfecb8c5c2a145a188f5feaedbd0069a35faebcd9ce0fae162e','distinct noduled skin2');
 check(b.subarray(br.uvStart,br.frameStart).equals(r.subarray(rr.uvStart,rr.frameStart)),'UV and triangle bytes identical');
 for(let f=0;f<61;f++){check(br.frames[f].vertices.equals(rr.frames[f].vertices),'every pose coordinate and normal record identical');check(br.frames[f].min.equals(rr.frames[f].min)&&br.frames[f].max.equals(rr.frames[f].max),'meaningful bounds identical');same(br.frames[f].name,rr.frames[f].name,'decoded names identical');}
 same(sha(p.base.model.cache.data.gl_texturenum[0][0].image.data),sha(p.rogue.model.cache.data.gl_texturenum[0][0].image.data),'loaded native skin0 RGBA also identical after floodfill');
});
Deno.test('Rogue variants append without changing any prior catalogue entry or base asset and accurately record copied/generated provenance',async()=>{
 same(index.models.tarbaby.length,4,'base0 plus all three Rogue skins');same(sha(JSON.stringify(index.models.tarbaby[0])),'47060982a4813017abfcb0379909298cbab7872b58de982430d84635a206fc47','original base variant exact');
 const prior=structuredClone(index);prior.models.ogre=prior.models.ogre.slice(0,1);prior.nativeHeights.ogre=prior.nativeHeights.ogre.slice(0,1);prior.models.knight=prior.models.knight.slice(0,1);prior.nativeHeights.knight=prior.nativeHeights.knight.slice(0,1);delete prior.version;const counts={"boss":1,"knight":1,"ogre":1,"soldier":1,"wizard":1,"backpack":1,"suit":1,"armor":3,"shambler":1,"zombie":1,"demon":1,"h_demon":1,"h_dog":1,"zom_gib":1,"h_shams":1,"shalrath":1,"oldone":1,"enforcer":1,"tarbaby":1,"hknight":3,"scor":1,"dragon":1,"s_wrath":1,"mummy":1,"dog":1,"fish":1,"grem":1,"armabody":1,"armalegs":1,"eel2":6,"sword":1,"wrath":1,"lavaman":1,"morph_az":3,"morph_eg":3,"morph_gr":3},heightKeys=["gib1","gib2","gib3","zom_gib","ogre","h_ogre","demon","h_demon","shambler","h_shams","knight","h_knight","soldier","h_guard","wizard","h_wizard","h_dog","dog","zombie","h_zombie","boss","armabody","eel2"];prior.models=Object.fromEntries(Object.entries(prior.models).filter(([k])=>k in counts).map(([k,v])=>[k,v.slice(0,counts[k])]));prior.nativeHeights=Object.fromEntries(Object.entries(prior.nativeHeights).filter(([k])=>heightKeys.includes(k)));
 same(sha(JSON.stringify(prior)),'e223b519795e0196f60b65812432622b936d2feda7ff1fad2939eff68d7c339b','entire pre-increment catalogue preserved');
 same(new Set(index.models.tarbaby.map(v=>v.dir)).size,4,'unique cache directories for all four bindings');
 for(const[file,digest]of [['diffuse.webp',DIFFUSE_SHA],['height.webp',HEIGHT_SHA]]){same(sha(read('newer/enemies/tarbaby/custom/'+file)),digest,'base asset is the current file (4x standard)');same(sha(read('newer/enemies/tarbaby/rogue0/'+file)),digest,'Rogue0 asset is exact copy');}
 const reused=JSON.parse(read('newer/enemies/tarbaby/rogue0/SOURCE.json'));same(reused.nativeModelSha256,ROGUE_SHA,'reuse targets Rogue identity');same(reused.skin,0,'reuse slot');same(reused.reuse.fromDirectory,'tarbaby/custom','existing art source');same(reused.reuse.fromModelSha256,BASE_SHA,'existing native provenance');same(sha(read(reused.reuse.sourceProvenance)),reused.reuse.sourceProvenanceSha256,'reuse chain refers to intact original provenance');
 for(let skin=0;skin<3;skin++){
  const v=rogueVariant(skin),dir='newer/enemies/'+v.dir+'/',report=JSON.parse(read(dir+'SOURCE.json'));
  same(v.dir,'tarbaby/rogue'+skin,'unique variant path');same(v.maps.diffuse,skin?'diffuse.png':'diffuse.webp','diffuse format');same(v.maps.height,'height.webp','height map');same(Object.keys(v.maps).length,2,'no new emission');same(v.nativeModelSha256,ROGUE_SHA,'exact variant identity');
  if(skin){const source=SOURCE_DIR+'tarbaby-rogue-skin'+skin+'.png',pin=GENERATED[skin],bytes=read(source);same(report.source,source,'generated source');same(report.sourceSha256,pin.sha,'pinned source provenance');same(sha(bytes),pin.sha,'actual source bytes');same(bytes.readUInt32BE(16),pin.width,'source width');same(bytes.readUInt32BE(20),pin.height,'source height');same(report.nativeModelSha256,ROGUE_SHA,'fit identity');same(report.skin,skin,'fit slot');}
  for(const file of Object.values(v.maps))same(sha(read(dir+file)),report.files[file],'actual output digest');const d=await decodedImage(dir+v.maps.diffuse),h=await decodedImage(dir+v.maps.height);same(d.width,1216,'decoded width');same(d.height,776,'decoded height');same(h.width,d.width,'height width');same(h.height,d.height,'height height');check(d.data.every((v,i)=>i%4!==3||v===255)&&h.data.every((v,i)=>i%4!==3||v===255),'opaque assets');check(h.data.every((v,i)=>i%4===3||v===h.data[i-i%4]),'grayscale authored height');
 }

});
Deno.test('Four same-name source/skin bindings coexist without material or prewarm cache collisions',async()=>fixture(async(skins,requests)=>{
 const p=await pair(),models=[p.base.model,p.rogue.model],before=models.map(geometry);await skins.R_NewerSkinsPrepare(models);same(requests.length,8,'four independent image pairs prepared');requests.forEach(r=>r.done(r.texture));
 const combinations=[[p.base.model,0,'tarbaby/custom','diffuse.webp'],[p.rogue.model,0,'tarbaby/rogue0','diffuse.webp'],[p.rogue.model,1,'tarbaby/rogue1','diffuse.png'],[p.rogue.model,2,'tarbaby/rogue2','diffuse.png']],chosen=[];
 for(const [model,skin,dir,file]of combinations){const m=skins.R_NewerAliasMaterial({model,_entityIndex:4},NAME,true,skin),r=requests.find(r=>r.url.startsWith('newer/enemies/'+dir+'/'+file+'?'));check(m&&r,'actual source/skin binding ready');same(m.map,r.texture,'correct path bound');check(skins.R_NewerSkinsMaterials([model]).includes(m),'actual matching prewarm exposes material');chosen.push(m.map);}
 same(new Set(chosen).size,4,'base and copied Rogue art have separate cached sets');check(!skins.R_NewerSkinsTextures([p.base.model]).includes(chosen[1])&&!skins.R_NewerSkinsTextures([p.rogue.model]).includes(chosen[0]),'prewarm source filters do not leak equal-art sets');same(skins.R_NewerAliasMaterial({model:p.base.model},NAME,true,1),null,'base model never acquires Rogue green slot');
 const changed=Buffer.from(p.rogue.bytes);changed.writeInt32LE(changed.readInt32LE(76)^1,76);const wrong=load(changed);await wrong.aliasSourceIdentity.promise;for(const skin of [0,1,2])same(skins.R_NewerAliasMaterial({model:wrong},NAME,true,skin),null,'unapproved source stays native');
 mode.R_AnimSetClassicPass(true);for(const [m,skin]of combinations)same(skins.R_NewerAliasMaterial({model:m},NAME,true,skin),null,'Classic remains original');mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;for(const [m,skin]of combinations)same(skins.R_NewerAliasMaterial({model:m},NAME,true,skin),null,'custom-off remains original');same(JSON.stringify(models.map(geometry)),JSON.stringify(before),'both native models remain unchanged');COM_AddPack(isolatedPack(NAME,p.rogue.bytes));
}));
Deno.test('Pending, failed and retired Rogue image preparation retains all three native skin fallbacks',async()=>fixture(async(skins,requests)=>{
 const p=await pair();let finish;const identity={state:'pending',promise:new Promise(r=>finish=r)},model={...p.rogue.model,aliasSourceIdentity:identity};const work=skins.R_NewerSkinsPrepare([model]);await ticks();same(requests.length,0,'pending source fetches nothing');identity.state='ready';identity.sha256=ROGUE_SHA;finish(ROGUE_SHA);await work;same(requests.length,6,'only three Rogue states requested');requests.forEach(r=>r.fail());const status=skins.R_NewerSkinsStatus([model]);same(status.pending,0,'failed downloads no longer pending');same(status.fallback,6,'all failures recorded');check(status.settled,'native fallback settles');for(const skin of [0,1,2])same(skins.R_NewerAliasMaterial({model},NAME,true,skin),null,'failed state remains native');let disposals=0;requests.forEach(r=>r.texture.addEventListener('dispose',()=>disposals++));skins.R_NewerSkinsShutdown();requests.forEach(r=>r.done(r.texture));same(disposals,6,'late decoded maps disposed');same(skins.R_NewerSkinsMaterials([model]).length,0,'shutdown rejects late publication');
}));
Deno.test('Every actual material path resolves directly from a Newer pack without parent-relative aliases',()=>{
 const paths=index.models.tarbaby.flatMap(v=>Object.values(v.maps).map(file=>'newer/enemies/'+v.dir+'/'+file)),chunks=paths.map(read),data=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;
 const files=paths.map((name,i)=>{check(!name.split('/').some(x=>x==='.'||x==='..'),'direct portable logical path');const file={name,filepos:offset,filelen:chunks[i].length};data.set(chunks[i],offset);offset+=chunks[i].length;return file;});
 COM_SetNewerPack({filename:'test-only-packed-tarbaby',data:data.buffer,files});try{
  for(let i=0;i<paths.length;i++){const f=COM_NewerFile(paths[i]);check(f,'packed member found');same(sha(f.data),sha(chunks[i]),'packed bytes match real asset');check(COM_NewerURL(paths[i],'missing-fallback').startsWith('blob:'),'public URL resolves to packed data');}
  check(COM_NewerURL('newer/enemies/tarbaby/custom/diffuse.webp','missing')!==COM_NewerURL('newer/enemies/tarbaby/rogue0/diffuse.webp','missing'),'identical bytes retain distinct logical URL keys');same(COM_NewerFile('newer/enemies/tarbaby/rogue0/../custom/diffuse.webp'),null,'pack lookup does not silently normalize unsafe reuse paths');
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
 return{execute(name,{skin=0,flags=0,skill=0,random=.5}={}){
  const f=functions.find(f=>f.name===name);check(f?.start>0,'owned QC function exists');const end=starts.find(n=>n>f.start),g=Array.from({length:int(52)},(_,i)=>float(i)),fieldsState=new Map(),pointers=new Map(),calls=[];
  const self=[...globals].find(([,v])=>v==='self')[0];g[self]=1;fieldsState.set('1:skin',skin);fieldsState.set('1:spawnflags',flags);const fieldKey=(entity,field)=>entity+':'+field;
  let pc=f.start,steps=0;
  while(pc<end){check(++steps<1000,'bounded native QC evaluation');const s=statement(pc),key=fieldKey(g[s.a],fields.get(integer(s.b)));let next=pc+1;
   if(s.op===0||s.op===43)break;
   if(s.op>=24&&s.op<=29)g[s.c]=fieldsState.get(key)||0;
   else if(s.op===30)pointers.set(s.c,key);
   else if(s.op>=31&&s.op<=36)g[s.b]=g[s.a];
   else if(s.op>=37&&s.op<=42)fieldsState.set(pointers.get(s.b),g[s.a]);
   else if(s.op===1)g[s.c]=g[s.a]*g[s.b];else if(s.op===6)g[s.c]=g[s.a]+g[s.b];else if(s.op===8)g[s.c]=g[s.a]-g[s.b];
   else if(s.op===10)g[s.c]=Number(g[s.a]===g[s.b]);else if(s.op===22)g[s.c]=Number(g[s.a]<g[s.b]);else if(s.op===23)g[s.c]=Number(g[s.a]>g[s.b]);else if(s.op===62)g[s.c]=Number(Boolean(g[s.a]&&g[s.b]));else if(s.op===64)g[s.c]=g[s.a]&g[s.b];
   else if(s.op===49&&g[s.a])next=pc+s.b;else if(s.op===50&&!g[s.a])next=pc+s.b;else if(s.op===61)next=pc+s.a;
   else if(s.op>=51&&s.op<=59){const name=functions[integer(s.a)].name;calls.push(name);if(name==='random')g[1]=random;else if(name==='cvar')g[1]=skill;else if(name==='spawn')g[1]=2;}
   pc=next;
  }
  return{fields:fieldsState,calls};
 },inspect(name){
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

for(let skin=0;skin<3;skin++)Deno.test('Rogue Spawn skin'+skin+' selects exact generated native and authored custom prepared normals',async()=>{
 const {rogue}=await pair(),v=rogueVariant(skin),dir='newer/enemies/'+v.dir+'/',diffuse=await decodedImage(dir+v.maps.diffuse),height=await decodedImage(dir+v.maps.height);
 await verifyBake(companion(rogue.model.cache.data.gl_texturenum[skin][0].image,null),'rogue:'+NAME,ROGUE_SHA);
 await verifyBake(companion(diffuse,height,v.heightStrength,v.heightCap),'custom:'+v.dir);
});
Deno.test('Rogue Spawn reuses all native and base custom inputs and adds only two authored payloads',()=>{
 const m=JSON.parse(read('newer/normals/manifest.json')),native=m.levels['rogue:'+NAME];same(native.modelSha256,ROGUE_SHA,'Rogue native identity');same(native.keys.length,3,'three native states');
 const old=new Set(['5f63e6e50570110544ca91831ead6addb0fad6a1f3ce7d02ea9feab9aba1ca80','5703fd712a94a88ef00c2d6daa43f295467ec8d487ab80a109eb68e5efd7de59','42a785cecd057e65d53042d84a29bb7a0c531a2eb70905d3c0dcee7149b95da9','d075cb439cb4ec06fb12662681f1ef2244099697d56bdbb5a05c1d2d972f44ab']);
 const copied=m.levels['custom:tarbaby/rogue0'].keys,original=m.levels['custom:tarbaby/custom'].keys;same(copied.join(),original.join(),'copied base artwork reuses exact normal');
 const current=new Set([...native.keys,...[0,1,2].flatMap(s=>m.levels['custom:tarbaby/rogue'+s].keys)]);same(current.size,6,'six Rogue normal references');same([...current].filter(k=>old.has(k)).length,4,'four old inputs');same([...current].filter(k=>!old.has(k)).length,2,'two new inputs');
});

Deno.test('Native Spawn UVs remain two body halves and nodules add pigment without extra geometry',async()=>{
 const {rogue}=await pair(),b=rogue.bytes,r=records(b),parent=new Map();
 const root=k=>{if(!parent.has(k))parent.set(k,k);let p=k;while(parent.get(p)!==p)p=parent.get(p);return p;};
 for(let t=0;t<256;t++){const o=r.uvStart+130*12+t*16,front=b.readInt32LE(o),keys=[];for(let c=0;c<3;c++){const v=b.readInt32LE(o+4+c*4),u=r.uvStart+v*12,seam=b.readInt32LE(u),s=b.readInt32LE(u+4)+(!front&&seam?152:0),tt=b.readInt32LE(u+8);keys.push(s+','+tt);}const base=root(keys[0]);for(const k of keys.slice(1))parent.set(root(k),base);}
 same(new Set([...parent.keys()].map(root)).size,2,'actual triangle connectivity has two UV pieces');
 const green=b.subarray(92+304*194,92+2*304*194),nodules=b.subarray(96+2*304*194,96+3*304*194);same([...green].filter((v,i)=>v!==nodules[i]).length,1289,'native added pigment count');
 for(let skin=0;skin<3;skin++){const pixels=b.subarray(88+skin*(4+304*194),88+skin*(4+304*194)+304*194);same(pixels[0],208,'native blue matte');check(pixels.every(v=>v<224),'no native fullbright pixels');}
 same(rogue.model.cache.data.numverts,130,'all variants use existing body vertices');same(rogue.model.cache.data.numtris,256,'no nodule geometry added');
});
Deno.test('Actual Rogue QC selects persistent Spawn variants by flags and skill/random and offspring inherits pigment',async()=>{
 const {rogueDirectory}=await pair(),q=roguePrograms(await readMember(rogueDirectory.get('progs.dat')));
 for(const [flags,expected,hp]of [[8,2,100],[4,1,60],[2,0,80],[14,2,100]]){const r=q.execute('monster_tarbaby',{flags});same(r.fields.get('1:skin'),expected,'native explicit spawnflag selection');same(r.fields.get('1:health'),hp,'native variant health');}
 for(const [skill,random,expected]of [[0,.1,0],[0,.6,1],[1,.9,1],[2,.5,2],[2,.2,1],[2,0,0]])same(q.execute('monster_tarbaby',{skill,random}).fields.get('1:skin'),expected,'native skill/random variant selection');
 for(const skin of [1,2]){const r=q.execute('tbaby_mitosis',{skin,random:.1});check(r.calls.includes('spawn'),'native successful division creates offspring');same(r.fields.get('2:skin'),skin,'offspring copies exact parent pigment');same(r.fields.get('2:health'),skin===1?60:100,'offspring retains variant health');check(!q.execute('tbaby_mitosis',{skin,random:.5}).calls.includes('spawn'),'failed division roll creates nothing');}
 for(const name of ['tbaby_jump1','tbaby_jump5','tbaby_die1','tbaby_die2','tbaby_checknew'])check(!q.inspect(name).writes.some(w=>w.field==='skin'),'movement/death/activation preserves pigment: '+name);
 same(q.inspect('tbaby_die1').states[0].frame,60,'death uses existing explosion pose');
});
