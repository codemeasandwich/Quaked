// Public identity-bound reuse of the base Ogre art on Rogue's two-skin model.
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
const NAME='progs/ogre.mdl',BASE_SHA='d7e65c136645747dacb3901e61a4117bc9cdd062669d0f64fa562872d2bd0d4e',ROGUE_SHA='2bd7b6633d2c95627cca8b216ad2c84057e800778a94e0fa97f3a14f86420732';
const SOURCE_DIR='tools/texture_sheets/sources/fidelity-2026-10-12/';
const SOURCES=[{file:'ogre-owner-base.png',sha:'dd36fe10a6494e040a14c18966cc3dd8819ecc63c373c107fd084a8f867d9912',size:[1448,1086],modelSha:BASE_SHA},{file:'ogre-multi-no-abs.png',sha:'402d263b4c3994d95bea6ef85110720de0e46abfddd88e3e6fcfdb105de1ad50',size:[1462,1076],modelSha:ROGUE_SHA}];
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>readFileSync(new URL('../'+p,import.meta.url)),index=JSON.parse(read('newer/enemies/index.json'));
const rogueVariant=skin=>index.models.ogre.find(v=>v.nativeModelSha256===ROGUE_SHA&&v.skin===skin);
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
 const skins=bytes.readInt32LE(48),skinBytes=264*194,uvStart=84+skins*(4+skinBytes),frameStart=uvStart+169*12+326*16;let offset=frameStart;const frames=[];
 for(let f=0;f<147;f++){same(bytes.readInt32LE(offset),0,'ungrouped native frame');offset+=4;frames.push({min:bytes.subarray(offset,offset+3),max:bytes.subarray(offset+4,offset+7),name:bytes.toString('ascii',offset+8,offset+24).split('\0')[0],vertices:bytes.subarray(offset+24,offset+24+676)});offset+=700;}
 same(offset,bytes.length,'entire model frame stream consumed');return{skins,uvStart,frameStart,frames};
}
function geometry(model){const h=model.cache.data;return JSON.stringify({commands:Array.from(h.commands),order:Array.from(h.meshVertexOrder),poses:h.posedata,frames:h.frames,scale:Array.from(h.scale),origin:Array.from(h.scale_origin)});}
async function ticks(){for(let i=0;i<25;i++)await Promise.resolve();}
async function fixture(run){
 const old={document:Object.getOwnPropertyDescriptor(globalThis,'document'),window:Object.getOwnPropertyDescriptor(globalThis,'window'),loader:THREE.TextureLoader.prototype.load,newer:mode.R_IsNewer(),classic:mode.R_ClassicPassActive(),normals:mode.r_newer_normals.value,enemies:mode.r_newer_enemies.value};
 const requests=[];Object.defineProperty(globalThis,'document',{configurable:true,value:{}});Object.defineProperty(globalThis,'window',{configurable:true,value:{}});
 THREE.TextureLoader.prototype.load=function(url,done,_,fail){const texture=new THREE.DataTexture(new Uint8Array(64).fill(127),4,4);requests.push({url:String(url),done,fail,texture});return texture;};
 mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_enemies.value=1;mode.r_newer_normals.value=0;
 const skins=await import('../src/newer/render/r_newerskins.js?rogue-ogre-'+ ++serial);skins.R_NewerSetIndex(index);
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
   else if(s.op===20)g[s.c]=Number(g[s.a]<=g[s.b]);else if(s.op===10)g[s.c]=Number(g[s.a]===g[s.b]);else if(s.op===22)g[s.c]=Number(g[s.a]<g[s.b]);else if(s.op===23)g[s.c]=Number(g[s.a]>g[s.b]);else if(s.op===62)g[s.c]=Number(Boolean(g[s.a]&&g[s.b]));else if(s.op===64)g[s.c]=g[s.a]&g[s.b];else if(s.op===65)g[s.c]=g[s.a]|g[s.b];
   else if(s.op===49&&g[s.a])next=pc+s.b;else if(s.op===50&&!g[s.a])next=pc+s.b;else if(s.op===61)next=pc+s.a;
   else if(s.op>=51&&s.op<=59){const name=functions[integer(s.a)].name;calls.push(name);if(name==='random')g[1]=random;else if(name==='cvar')g[1]=skill;else if(name==='spawn')g[1]=2;}
   pc=next;
  }
  return{fields:fieldsState,calls};
 },inspect(name){
  const f=functions.find(f=>f.name===name);check(f&&f.start>0,'actual Rogue Guardian function '+name);const end=starts.find(n=>n>f.start),values=new Map(),pointers=new Map(),writes=[],states=[],branches=[],calls=[];
  const value=(i,type='float')=>values.get(i)||(type==='function'?{function:functions[integer(i)]?.name}:type==='string'?{string:string(integer(i))}:{constant:float(i),string:integer(i)>0&&integer(i)<strn?string(integer(i)):undefined});
  for(let pc=f.start;pc<end;pc++){
   const s=statement(pc);
   if(s.op>=24&&s.op<=29)values.set(s.c,{field:fields.get(integer(s.b)),entity:globals.get(s.a)||String(s.a)});
   else if(s.op===30)pointers.set(s.c,{field:fields.get(integer(s.b)),entity:globals.get(s.a)||String(s.a)});
   else if([31,32,33,34,35,36].includes(s.op))values.set(s.b,value(s.a,s.op===33?'string':'float'));
   else if(s.op===6||s.op===8||s.op===64)values.set(s.c,{op:s.op===6?'+':s.op===8?'-':'&',left:value(s.a),right:value(s.b)});
   else if(s.op>=37&&s.op<=42&&pointers.has(s.b))writes.push({pc,...pointers.get(s.b),expression:value(s.a,s.op===39?'string':s.op===42?'function':'float')});
   else if(s.op===49||s.op===50)branches.push({pc,expression:value(s.a),target:pc+s.b});
   else if(s.op>=51&&s.op<=59)calls.push({pc,name:functions[integer(s.a)]?.name,args:Array.from({length:8},(_,i)=>value(4+i*3))});
   else if(s.op===60)states.push({pc,frame:float(s.a),next:functions[integer(s.b)]?.name});
  }
  return{writes,states,branches,calls};
 }};
}


const BASELINE_COUNTS={"boss":1,"knight":2,"ogre":1,"soldier":1,"wizard":1,"backpack":1,"suit":1,"armor":3,"shambler":1,"zombie":1,"demon":1,"h_demon":1,"h_dog":1,"zom_gib":1,"h_shams":1,"shalrath":1,"oldone":1,"enforcer":1,"tarbaby":4,"hknight":3,"scor":1,"dragon":1,"s_wrath":1,"mummy":1,"dog":1,"fish":1,"grem":1,"armabody":1,"armalegs":1,"eel2":6,"sword":1,"wrath":1,"lavaman":1,"morph_az":3,"morph_eg":3,"morph_gr":3},BASELINE_HEIGHTS={"gib1":[1],"gib2":[1],"gib3":[1],"zom_gib":[1],"ogre":[1],"h_ogre":[1],"demon":[1],"h_demon":[1],"shambler":[1],"h_shams":[1],"knight":[1,0],"h_knight":[1],"soldier":[1],"h_guard":[1],"wizard":[1],"h_wizard":[1],"h_dog":[1],"dog":[1],"zombie":[1],"h_zombie":[1],"boss":[1],"armabody":[1],"eel2":[1,1,1,1,1,1]};
const BASE_FILES={"newer/enemies/faces/ogre.png":"355d82fdd351f67796719588d0936274d0e77b0a33ac09a2652360dbcbe45279","newer/enemies/heights/ogre/skin0_0.webp":"b7add55773ffb47bce592a7c0a242c5a97e37936805a8c23ddc7ad4e77061b01"};
const DOG_FILES={"newer/enemies/dog/custom/diffuse.png":"90655e109fb0083ad53311a71f53af08bf34d654cf979697cf57e8b6dc261b9a","newer/enemies/dog/custom/height.webp":"e22e9a0e0b5e0b625b202b8edfa815a2c3de169b3d15ca708cb7f3684251e311","newer/enemies/dog/custom/SOURCE.json":"026d062b0e71d0ab8cfa2b82025aa4f5a022442bdd5c1a379bf727490515f82a","tools/texture_sheets/sources/generated-2026-10-12/dog.png":"c5381c353225ec755b80fc65e7b3a2b0c5006e6c3d8a35059b15a37b64ef5a2c","tools/texture_sheets/sources/generated-2026-10-12/dog.json":"3c5cab260ec02d747ab645e16728a8efe49772333a868f03ce166b91300ffb73"};
const DOG_VARIANT_SHA="c793d0b79e72f0a0c6aa7376f116bd0d90f5eebe7f24663d28091f7f9bb1cc83";
function shader(material){const s={uniforms:{},vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader};material.onBeforeCompile(s);return s;}
Deno.test('Actual base and Rogue Ogres preserve every native UV triangle and all 147 original poses',async()=>{
 const p=await pair();for(const[key,n]of [['base',1],['rogue',2]]){
  const{model,bytes}=p[key],h=model.cache.data,r=records(bytes);for(const[field,value]of Object.entries({numskins:n,skinwidth:264,skinheight:194,numverts:169,numtris:326,numframes:147,numposes:147}))same(h[field],value,key+' '+field);
  for(let skin=0;skin<n;skin++)same(bytes.readInt32LE(84+skin*(4+264*194)),0,'ungrouped native skin');let o=r.uvStart;
  for(let v=0;v<169;v++,o+=12){same(h.stverts[v].onseam,bytes.readInt32LE(o),'native seam');same(h.stverts[v].s,bytes.readInt32LE(o+4),'native U');same(h.stverts[v].t,bytes.readInt32LE(o+8),'native V');}
  for(let t=0;t<326;t++,o+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(o),'native facing');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(o+4+c*4),'native triangle');}
  for(let f=0;f<147;f++){same(h.frames[f].name,r.frames[f].name,'own native frame name');for(let v=0;v<169;v++){for(let a=0;a<3;a++)same(h.poseverts[f][v].v[a],r.frames[f].vertices[v*4+a],'pose coordinate');same(h.poseverts[f][v].lightnormalindex,r.frames[f].vertices[v*4+3],'native lighting normal');}}
 }
});
Deno.test('Living Ogre skin0 and geometry are compatible with all 147 native poses and names identical',async()=>{
 const p=await pair(),b=p.base.bytes,r=p.rogue.bytes,br=records(b),rr=records(r);check(b.subarray(0,48).equals(r.subarray(0,48))&&b.subarray(52,84).equals(r.subarray(52,84)),'headers equal except skin count');
 same(sha(b.subarray(88,88+264*194)),'cb2e91828469b32d804ac8330a8455697a475c4bb1fda809ab3029217a5c3074','actual shared skin0');check(b.subarray(88,88+264*194).equals(r.subarray(88,88+264*194)),'exact original pigment reuse');same(sha(r.subarray(92+264*194,92+2*264*194)),'285d5995645d893ac8e04d60ae5add81955d01c971f6cc6f7f847ebf329bd97a','actual alternate skin1');check(b.subarray(br.uvStart,br.frameStart).equals(r.subarray(rr.uvStart,rr.frameStart)),'identical UV and triangle records');
 for(let f=0;f<147;f++){check(br.frames[f].vertices.equals(rr.frames[f].vertices),'native geometry and vertex normals equivalent');check(br.frames[f].min.equals(rr.frames[f].min)&&br.frames[f].max.equals(rr.frames[f].max),'native bounds equivalent');same(br.frames[f].name,rr.frames[f].name,'every meaningful native name equivalent');}
});
Deno.test('Owner-selected dark and green Ogres retain original face metadata native heights and catalogue boundaries',async()=>{
 const original=index.models.ogre[0],alternate=rogueVariant(1);same(index.models.ogre.length,2,'one legacy plus one multigrenade');same(sha(JSON.stringify(original)),'4771863f2dfa892f62e4fa55f895d720f40245237d15a87f3d455a98db65c52a','complete original face-capable variant intact');same(original.nativeModelSha256,undefined,'legacy matching policy unchanged');check(original.faces,'living face metadata preserved');same(JSON.stringify(alternate.faces),JSON.stringify(original.faces),'both selected Ogres retain identical original randomized-face metadata');same(alternate.dir,'ogre/rogue1','multigrenade directory');same(alternate.skin,1,'only multigrenade skin');same(alternate.nativeModelSha256,ROGUE_SHA,'exact Rogue identity');same(JSON.stringify(alternate.maps),' {"diffuse":"diffuse.png","height":"height.webp"}'.trim(),'diffuse and height only');
 same(JSON.stringify(index.nativeHeights.ogre[1]),'[]','empty skin1 group explicitly suppresses fallback');same(sha(JSON.stringify(index.nativeHeights.ogre[0])),'d8c7949f259b6b1c92067ed351d2ddfd9646ab3a5c5e8ed7acea8aca8940e9a9','stored living height entry unchanged');
 const prior=structuredClone(index);delete prior.version;prior.models=Object.fromEntries(Object.entries(prior.models).filter(([k])=>k in BASELINE_COUNTS).map(([k,v])=>[k,v.slice(0,BASELINE_COUNTS[k])]));prior.nativeHeights=Object.fromEntries(Object.entries(prior.nativeHeights).filter(([k])=>k in BASELINE_HEIGHTS).map(([k,v])=>[k,v.slice(0,BASELINE_HEIGHTS[k].length).map((g,i)=>g.slice(0,BASELINE_HEIGHTS[k][i]))]));
 same(sha(JSON.stringify(prior)),'99326bb815558e81f9ff55714b79616d7ca4ff2679b9a714ffaa34dc06f5f1ed','entire pre-increment catalogue intact');for(const[file,digest]of Object.entries(BASE_FILES))same(sha(read(file)),digest,'unchanged prior file '+file);
 for(let skin=0;skin<2;skin++){
  const v=skin?alternate:original,base='newer/enemies/'+v.dir+'/',report=JSON.parse(read(base+'SOURCE.json')),pin=SOURCES[skin],source=SOURCE_DIR+pin.file,bytes=read(source);same(report.source,source,'selected source path');same(report.sourceSha256,pin.sha,'selected provenance');same(sha(bytes),pin.sha,'actual owner-selected source');same(bytes.readUInt32BE(16),pin.size[0],'selected source width');same(bytes.readUInt32BE(20),pin.size[1],'selected source height');same(report.nativeModelSha256,pin.modelSha,'actual fit identity');same(report.skin,skin,'fit skin');
  same(v.maps.diffuse,skin?'diffuse.png':'diffuse.webp','existing base file format retained');for(const file of Object.values(v.maps)){same(sha(read(base+file)),report.files[file],'actual output hash');const image=await decodedImage(base+file);same(image.width,1056,'both use original HD atlas width');same(image.height,776,'both use original HD atlas height');check(image.data.every((v,i)=>i%4!==3||v===255),'opaque selected asset');}
  const height=await decodedImage(base+'height.webp');check(height.data.every((v,i)=>i%4===3||v===height.data[i-i%4]),'grayscale authored relief');
 }

});
Deno.test('Both selected Ogre skins retain all twelve randomized faces with stable matching identity',async()=>fixture(async(skins,requests)=>{
 const p=await pair(),models=[p.base.model,p.rogue.model],before=models.map(geometry),oldVariety=skins.r_newer_variety.value;skins.r_newer_variety.value=1;
 try{
  await skins.R_NewerSkinsPrepare(models);same(requests.length,6,'two body/height/face trios');requests.forEach(r=>r.done(r.texture));const living=requests.find(r=>r.url.includes('ogre/custom/diffuse.webp')),alternate=requests.find(r=>r.url.includes('ogre/rogue1/diffuse.png'));check(living&&alternate,'both selected atlas files loaded');
  const families=[{model:p.base.model,skin:0,texture:living.texture},{model:p.rogue.model,skin:0,texture:living.texture},{model:p.rogue.model,skin:1,texture:alternate.texture}],crops=[];
  for(const family of families){const choices=[],faces=[];for(let seed=0;seed<12;seed++){
   const entity={model:family.model,_faceSeed:seed},material=skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),uniforms=shader(material).uniforms;choices.push(material);same(material.map,family.texture,'correct body atlas retained');same(uniforms.uHasFace.value,1,'randomized face visible on both skins');same(entity._faceSeed,seed,'face identity not rerolled');same(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),material,'same individual retains cached face');faces.push(uniforms.uFaceSource.value.toArray().join());
   const base=shader(skins.R_NewerAliasMaterial({model:p.base.model,_faceSeed:seed},NAME,true,0)).uniforms;for(const name of ['uFaceSource','uFaceAlignment','uFaceTargetPivot','uFaceColorBalance'])same(uniforms[name].value.toArray().join(),base[name].value.toArray().join(),'both skins retain exact face crop/alignment '+name);same(JSON.stringify(uniforms.uFaceDest.value.map(v=>v.toArray())),JSON.stringify(base.uFaceDest.value.map(v=>v.toArray())),'face mask placement unchanged');
  }same(new Set(choices).size,12,'twelve distinct randomized material choices');same(new Set(faces).size,12,'all twelve original source portraits available');crops.push(faces.join('|'));}
  same(new Set(crops).size,1,'same seeds select same faces across base and both Rogue skins');same(skins.R_NewerAliasMaterial({model:p.base.model},NAME,true,1),null,'base model cannot acquire Rogue-only slot1');
  for(const family of families){const entity={model:family.model,_faceSeed:11},chosen=skins.R_NewerAliasMaterial(entity,NAME,true,family.skin);mode.R_AnimSetClassicPass(true);same(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),null,'Classic preserves native');mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;same(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),null,'custom off preserves native');mode.r_newer_enemies.value=1;same(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),chosen,'same face returns after switches');skins.r_newer_variety.value=0;check(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin)!==chosen,'variety off selects first face');skins.r_newer_variety.value=1;same(skins.R_NewerAliasMaterial(entity,NAME,true,family.skin),chosen,'variety resumes assigned face');same(entity._faceSeed,11,'toggles never change identity');}
  same(requests.length,6,'all individual faces reuse bounded atlas/sheet downloads');same(JSON.stringify(models.map(geometry)),JSON.stringify(before),'all native geometry unchanged');
 }finally{skins.r_newer_variety.value=oldVariety;}
}));
Deno.test('Missing mismatched and pending identities cannot borrow ready alternate while legacy slot0 remains unchanged',async()=>fixture(async(skins,requests)=>{
 const{rogue}=await pair();await skins.R_NewerSkinsPrepare([rogue.model]);requests.forEach(r=>r.done(r.texture));const changed=Buffer.from(rogue.bytes);changed.writeInt32LE(changed.readInt32LE(76)^1,76);const wrong=load(changed);await wrong.aliasSourceIdentity.promise;
 for(const model of [wrong,{...rogue.model,aliasSourceIdentity:undefined},{...rogue.model,aliasSourceIdentity:{state:'pending'}},{...rogue.model,aliasSourceIdentity:{state:'unavailable'}}]){same(skins.R_NewerAliasMaterial({model},NAME,true,1),null,'unapproved alternate stays native');check(skins.R_NewerAliasMaterial({model,_faceSeed:0},NAME,true,0),'existing legacy slot0 matching preserved');}
 same(requests.length,6,'negative paths introduce no extra download');COM_AddPack(isolatedPack(NAME,rogue.bytes));
}));
Deno.test('Failed multigrenade images settle to native and shutdown rejects late decoded callbacks',async()=>fixture(async(skins,requests)=>{
 const{rogue}=await pair();await skins.R_NewerSkinsPrepare([rogue.model]);requests.forEach(r=>r.url.includes('/rogue1/')?r.fail():r.done(r.texture));same(skins.R_NewerAliasMaterial({model:rogue.model},NAME,true,1),null,'failed multigrenade stays native');const status=skins.R_NewerSkinsStatus([rogue.model]);same(status.pending,0,'failure settled');same(status.fallback,2,'both multigrenade maps record fallback');skins.R_NewerSkinsShutdown();requests.filter(r=>r.url.includes('/rogue1/')).forEach(r=>r.done(r.texture));same(skins.R_NewerSkinsMaterials([rogue.model]).length,0,'late multigrenade not published');
}));
Deno.test('Native alternate skin1 derives relief from actual pixels and never fetches living height',async()=>fixture(async(skins,requests)=>{
 delete globalThis.window;mode.r_newer_enemies.value=0;mode.r_newer_normals.value=1;const{rogue}=await pair(),texture=rogue.model.cache.data.gl_texturenum[1][0],material=skins.R_EnemyAliasMaterial(texture,NAME,true,1,0,rogue.model);same(requests.length,0,'empty slot1 triggers no stored map fetch');same(material.map,texture,'actual native alternate diffuse retained');const normal=shader(material).uniforms.qrNormal.value;check(normal,'actual native derived normal available');
 const baked=await verifyBake(companion(texture.image,null),'rogue:'+NAME,ROGUE_SHA);same(sha(normal.image.data),sha(baked.pixels),'runtime generated normal equals exact shipped alternate input');
 await skins.R_NewerSkinsPrepare([rogue.model]);same(requests.length,1,'only living skin0 stored height prewarms');check(requests[0].url.includes('heights/ogre/skin0_0.webp'),'only correct skin0 path');same(shader(skins.R_EnemyAliasMaterial(texture,NAME,true,1,0,rogue.model)).uniforms.qrNormal.value,normal,'skin0 prewarm cannot contaminate alternate relief');
}));
Deno.test('Living native generated and stored relief still match their exact shipped inputs',async()=>{
 const{rogue}=await pair(),pixels=rogue.model.cache.data.gl_texturenum[0][0].image,entry=index.nativeHeights.ogre[0][0];await verifyBake(companion(pixels,null),'rogue:'+NAME,ROGUE_SHA);await verifyBake(companion(pixels,await decodedImage('newer/enemies/'+entry.file),entry.strength,entry.cap),'rogue:'+NAME,ROGUE_SHA);
});
Deno.test('Multigrenade authored output selects exact shipped custom relief while native family omits wrong inherited input',async()=>{
 for(const v of index.models.ogre){const dir='newer/enemies/'+v.dir+'/';await verifyBake(companion(await decodedImage(dir+v.maps.diffuse),await decodedImage(dir+v.maps.height),v.heightStrength,v.heightCap),'custom:'+v.dir);}
 const m=JSON.parse(read('newer/normals/manifest.json')),native=m.levels['rogue:'+NAME];same(native.keys.length,3,'generated/stored skin0 plus generated skin1');check(!native.keys.includes('c8505d702d53057d902d0c38a653ea01f9b046cf5778b6c450da85f6ab996cfc'),'incorrect skin0-height-on-skin1 witness removed from family');same(m.levels['custom:ogre/custom'].keys.length,1,'one exact selected dark-armour normal input');same(m.levels['custom:ogre/rogue1'].keys.length,1,'one exact selected green-armour normal input');check(m.levels['custom:ogre/custom'].keys[0]!==m.levels['custom:ogre/rogue1'].keys[0],'distinct selected bodies have distinct normal inputs');
});
Deno.test('Alternate Ogre retains exactly six native UV pieces without adding weapon geometry',async()=>{
 const{rogue}=await pair(),bytes=rogue.bytes,r=records(bytes),parent=new Map();const root=k=>{if(!parent.has(k))parent.set(k,k);let p=k;while(parent.get(p)!==p)p=parent.get(p);return p;};
 for(let t=0;t<326;t++){const o=r.uvStart+169*12+t*16,front=bytes.readInt32LE(o),keys=[];for(let c=0;c<3;c++){const v=bytes.readInt32LE(o+4+c*4),uv=r.uvStart+v*12;keys.push((bytes.readInt32LE(uv+4)+(!front&&bytes.readInt32LE(uv)?132:0))+','+bytes.readInt32LE(uv+8));}const p=root(keys[0]);for(const k of keys.slice(1))parent.set(root(k),p);}
 same(new Set([...parent.keys()].map(root)).size,6,'two bodies and four weapon-piece UV islands');for(let skin=0;skin<2;skin++){const pixels=bytes.subarray(88+skin*(4+264*194),88+skin*(4+264*194)+264*194);same(pixels[0],143,'original dark brown matte');check(pixels.every(v=>v<224),'no fullbright emission to replace');}
});
Deno.test('Actual Rogue Ogre flag and random selection preserve multigrenade projectile and ammo contracts',async()=>{
 const{rogueDirectory}=await pair(),q=roguePrograms(await readMember(rogueDirectory.get('progs.dat')));
 for(const[flags,skill,random,expected]of [[2,0,.9,1],[0,0,.1,0],[0,1,.25,1],[0,1,.26,0],[1,1,.1,1],[4,2,0,0]])same(q.execute('monster_ogre',{flags,skill,random}).fields.get('1:skin')||0,expected,'actual explicit flag and skill/random rule '+JSON.stringify({flags,skill,random}));
 const fire=q.inspect('OgreFireGrenade'),branch=fire.branches.find(b=>b.expression.op==='&'&&b.expression.left.field==='spawnflags'&&b.expression.right.constant===2);check(branch,'actual multigrenade flag2 branch');
 const within=item=>item.pc>branch.pc&&item.pc<branch.target;
 check(fire.calls.some(c=>within(c)&&c.name==='setmodel'&&c.args[1].string==='progs/mervup.mdl'),'flag2 uses actual multigrenade model');check(fire.writes.some(w=>within(w)&&w.field==='touch'&&w.expression.function==='MultiGrenadeTouch'),'multigrenade touch callback preserved');check(fire.writes.some(w=>within(w)&&w.field==='think'&&w.expression.function==='MultiGrenadeExplode'),'multigrenade explosion callback preserved');check(fire.calls.some(c=>c.pc>=branch.target&&c.name==='setmodel'&&c.args[1].string==='progs/grenade.mdl'),'ordinary projectile remains separate');
 for(const name of ['ogre_die3','ogre_bdie3']){const death=q.inspect(name);check(death.writes.some(w=>w.field==='ammo_multi_rockets'&&w.expression.constant===2),'alternate death drops two multi rockets');check(death.writes.some(w=>w.field==='ammo_rockets'&&w.expression.constant===2),'ordinary death drops ordinary ammo');check(death.calls.some(c=>c.name==='DropBackpack'),'actual backpack drop retained');check(!death.writes.some(w=>w.field==='skin'),'death preserves body pigment');}
 check(!fire.writes.some(w=>w.field==='skin'),'firing does not change persistent variant skin');
});

Deno.test('Selected Ogre replacement leaves the liked published Dog and its generation source unchanged',()=>{
 same(sha(JSON.stringify(index.models.dog)),DOG_VARIANT_SHA,'published Dog catalogue entry unchanged');for(const[file,digest]of Object.entries(DOG_FILES))same(sha(read(file)),digest,'unchanged Dog file '+file);
});
Deno.test('Failure of the alternate face sheet keeps its selected body and never changes its random face identity',async()=>fixture(async(skins,requests)=>{
 const{rogue}=await pair();await skins.R_NewerSkinsPrepare([rogue.model]);const sheets=requests.filter(r=>r.url.includes('faces/ogre.png'));same(sheets.length,2,'one face-sheet binding per body family');requests.filter(r=>r!==sheets[1]).forEach(r=>r.done(r.texture));sheets[1].fail();const entity={model:rogue.model,_faceSeed:7},material=skins.R_NewerAliasMaterial(entity,NAME,true,1);check(material?.map,'alternate body still usable');same(shader(material).uniforms.uHasFace.value,0,'failed face sheet falls back to body face');same(entity._faceSeed,7,'failure cannot reroll identity');same(shader(skins.R_NewerAliasMaterial({model:rogue.model,_faceSeed:7},NAME,true,0)).uniforms.uHasFace.value,1,'other body face sheet remains healthy');sheets[1].done(sheets[1].texture);same(shader(material).uniforms.uHasFace.value,0,'late failed face callback cannot revive invalid sheet');
}));
