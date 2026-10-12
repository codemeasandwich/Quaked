// Public, source-bound Rogue Electric Eel skin verification. Reads bounded owned PAK members without exporting them.
// Async selection/failure tests replace only image transport; asset tests decode the actual shipped PNG/WebP files.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { NormalInputs, NormalInputWitness, R_NormalPrepare } from '../src/newer/assets/normal_prepare.js';
import { NormalBakeDecode } from '../src/newer/assets/normal_bake_format.js';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
const MODEL_SHA = '58b9c4a4af9953f8c024158ba8a7cebd33e19834440c09026fd5931cb6b831a7';
const MODEL = 'progs/eel2.mdl', WIDTH = 136, HEIGHT = 194, FACTOR = 8;
// Independently hashed final generated references; these identities do not come from the fitter report.
const SOURCE_SHAS = [
 "ed8881a5cc70b359bda6e17c846ba3b877262014889b11a0835fb2f785c870ac",
 "b6632c9eda9e41de75fb97561a6f3895e6aa92464538b696a736a8d0ea6bd3ae",
 "65c9d256f3ccbd716d0873199e541e3f6d53cc9013bf65ee1fa1bb0232960a56",
 "153ec154ff2d7e4f90de3c1cae706880e3822a19fc8f715c039bf39561ef0a51",
 "e608016e3cd7c2e2d2d503fc265d9d872b9b70e2b9bc650e7c27750695ab6118",
 "21c309eb66f7c91bd78cb2e4a3bd0f042a9ba3061d5c0acb0f6a1414ccf31ef3"
];
const SKIN_SHAS = [
 'f753a1e5f23f8c1527b07bf1b47a327aede49eacc52a2f4096012108ed48bfbe',
 '51a9a7938ad8ff43be98a50322ab0a90b429f00720ff46227aaaa5adb418dafe',
 '4ce8f3025835f77c8083ee02d43e89f0da2eebf1ccebf113564bb0b550413d28',
 'c3b6cb54465afc897387f6d64b28f76505ccb8164566ce9abef92d58da2364ac',
 '46cf8f34bd23fc18f32f2b7f68a3064d1e09487bd28058d3579fa229ed67e797',
 '3c0f81fc06dd24d4f7d9df4a0cd6d3ec431d5f0262b9ec918507872d89ee406d'
];
const check = ( value, message ) => { if ( !value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const sha = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const index = JSON.parse( read( 'newer/enemies/index.json' ) );
const ticks = async () => { for ( let i = 0; i < 20; i ++ ) await Promise.resolve(); };
let startup, serial = 0;
const natives = new Map();
async function native( key ) {
 if ( !startup ) startup = ( async () => {
  check( process.env.QUAKED_OWNED_PAK, 'QUAKED_OWNED_PAK must name the owned Rogue archive' );
  check( process.env.QUAKED_ID1_PAK, 'QUAKED_ID1_PAK must name the owned id1/shareware palette archive' );
  const directory = await pakDirectory( process.env.QUAKED_OWNED_PAK ), paletteDirectory = await pakDirectory( process.env.QUAKED_ID1_PAK );
  check( paletteDirectory.has( 'gfx/palette.lmp' ), 'owned palette available' );
  COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( paletteDirectory.get( 'gfx/palette.lmp' ) ) ) );
  VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); return directory;
 } )();
 if ( !natives.has( key ) ) natives.set( key, ( async () => {
  const directory = await startup, name = 'progs/' + key + '.mdl'; check( directory.has( name ), 'actual Rogue member: ' + name );
  const bytes = await readMember( directory.get( name ) ); COM_AddPack( isolatedPack( name, bytes ) );
  const model = Mod_ForName( name, true ); await model.aliasSourceIdentity.promise; return { model, bytes };
 } )() );
 return natives.get( key );
}
function reload( name, bytes ) { COM_AddPack( isolatedPack( name, bytes ) ); const model = new model_t(); model.name = name; model.needload = true; return Mod_LoadModel( model, true ); }
// MDL stverts is shared loader scratch. Display commands, vertex order and pose/frame arrays belong to this actual model.
function geometry( model ) { const h = model.cache.data; return JSON.stringify( { scale: Array.from( h.scale ), origin: Array.from( h.scale_origin ), commands: Array.from( h.commands ), order: Array.from( h.meshVertexOrder ), poses: h.posedata, frames: h.frames } ); }
async function fixture( run ) {
 const old = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), window: Object.getOwnPropertyDescriptor( globalThis, 'window' ), loader: THREE.TextureLoader.prototype.load, newer: mode.R_IsNewer(), classic: mode.R_ClassicPassActive(), normals: mode.r_newer_normals.value, enemies: mode.r_newer_enemies.value };
 const requests = []; Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } ); Object.defineProperty( globalThis, 'window', { configurable: true, value: {} } );
 THREE.TextureLoader.prototype.load = function ( url, done, _, fail ) { const texture = new THREE.DataTexture( new Uint8Array( 64 ).fill( 127 ), 4, 4 ); requests.push( { url: String( url ), done, fail, texture } ); return texture; };
 mode.R_AnimSetClassicPass( false ); mode.R_AnimSetNewer( true ); mode.r_newer_enemies.value = 1; mode.r_newer_normals.value = 0;
 const skins = await import( '../src/newer/render/r_newerskins.js?eel-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  mode.R_AnimSetClassicPass( old.classic ); mode.R_AnimSetNewer( old.newer ); mode.r_newer_normals.value = old.normals; mode.r_newer_enemies.value = old.enemies;
 }
}
const variant = skin => index.models.eel2.find(v=>v.skin===skin);
const base = skin => 'newer/enemies/'+variant(skin).dir+'/';
function indexedSkins(bytes){return Array.from({length:6},(_,skin)=>bytes.subarray(88+skin*(4+WIDTH*HEIGHT),88+skin*(4+WIDTH*HEIGHT)+WIDTH*HEIGHT));}
Deno.test('Eel preserves every previously delivered model and native-height family',()=>{
 const modelKeys=['boss','knight','ogre','soldier','wizard','backpack','suit','armor','shambler','zombie','demon','h_demon','h_dog','zom_gib','h_shams','shalrath','oldone','enforcer','tarbaby','hknight','scor','dragon','s_wrath','mummy','dog','fish','grem','armabody','armalegs'];
 const heightKeys=['gib1','gib2','gib3','zom_gib','ogre','h_ogre','demon','h_demon','shambler','h_shams','knight','h_knight','soldier','h_guard','wizard','h_wizard','h_dog','dog','zombie','h_zombie','boss','armabody'];
 const other=structuredClone(index);delete other.version;
 other.models=Object.fromEntries(Object.entries(other.models).filter(([key])=>modelKeys.includes(key)));
 other.nativeHeights=Object.fromEntries(Object.entries(other.nativeHeights).filter(([key])=>heightKeys.includes(key)));
 same(sha(JSON.stringify(other)),'ef9a084df3f412bf9bf86e09b9d8f459d1ff9385638400e886c86aa3064c9942','all prior data remains byte-equivalent; later append-only families may be added');
});
Deno.test('Owned eel retains six exact native skins, every UV/triangle and all twenty-one poses',async()=>{
 const {model,bytes}=await native('eel2'),h=model.cache.data;same(sha(bytes),MODEL_SHA,'owned Eel model');same(model.aliasSourceIdentity.sha256,MODEL_SHA,'public loaded model identity');
 for(const [key,value]of Object.entries({numskins:6,skinwidth:136,skinheight:194,numverts:148,numtris:260,numframes:21,numposes:21}))same(h[key],value,key);
 const source=indexedSkins(bytes);let offset=84;
 for(let skin=0;skin<6;skin++){same(bytes.readInt32LE(offset),0,'separate ungrouped skin '+skin);same(sha(source[skin]),SKIN_SHAS[skin],'pinned native skin '+skin);offset+=4+WIDTH*HEIGHT;
  for(let i=0;i<source[skin].length;i++)if(source[skin][i]!==0)same(h.texels[skin][i],source[skin][i],'loader preserves actual non-background palette pixels for slot '+skin);
  check(h.gl_texturenum[skin].every(t=>t===h.gl_texturenum[skin][0]),'static skin repeats across animation-frame slots');
 }
 same(new Set(h.gl_texturenum.slice(0,h.numskins).map(group=>group[0])).size,6,'all native skin textures are distinct');
 for(let v=0;v<148;v++,offset+=12){same(h.stverts[v].onseam,bytes.readInt32LE(offset),'native seam');same(h.stverts[v].s,bytes.readInt32LE(offset+4),'native U');same(h.stverts[v].t,bytes.readInt32LE(offset+8),'native V');}
 for(let t=0;t<260;t++,offset+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(offset),'native triangle facing');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(offset+4+c*4),'native triangle corner');}
 for(let pose=0;pose<21;pose++){same(bytes.readInt32LE(offset),0,'ungrouped pose');const expectedName=pose<6?'eelswim'+(pose+1):'eeldth'+(pose-5);same(h.frames[pose].name,expectedName,'native pose name');offset+=28;
  for(let v=0;v<148;v++,offset+=4){for(let axis=0;axis<3;axis++)same(h.poseverts[pose][v].v[axis],bytes[offset+axis],'native pose coordinate');same(h.poseverts[pose][v].lightnormalindex,bytes[offset+3],'native pose normal index');}
 }
 same(offset,bytes.length,'every native model byte range covered');
});

const decodedImages=new Map();
async function decodedImage(path){
 if(!decodedImages.has(path))decodedImages.set(path,(async()=>{
  const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
  const image=await canvas.loadImage(read(path)),surface=canvas.createCanvas(image.width,image.height),context=surface.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,image.width,image.height);
 })());return decodedImages.get(path);
}
Deno.test('Six generated Eel sources and fitted variants retain exact provenance, dimensions and shared anatomical height',async()=>{
 same(index.models.eel2.length,6,'all six explicit skin variants');same(new Set(index.models.eel2.map(v=>v.dir)).size,6,'unique directories prevent skin-set cache collisions');
 same(index.models.eelgib,undefined,'separate Eel death model remains outside this body increment');same(index.models.eelhead,undefined,'unused archive head is not invented as a replacement');
 let heightHash;
 for(let skin=0;skin<6;skin++){
  const v=variant(skin);check(v,'explicit skin '+skin);same(v.dir,'eel2/custom'+(skin||''),'stable unique variant directory');same(v.nativeModelSha256,MODEL_SHA,'variant bound to actual Eel');same(v.flipGreen,false,'height-generated normal convention');
  same(v.maps.diffuse,'diffuse.png','runtime diffuse');same(v.maps.height,'height.webp','runtime height');same(Object.keys(v.maps).length,2,'no added emission maps');
  const provenance=JSON.parse(read(base(skin)+'SOURCE.json')),source='tools/texture_sheets/sources/generated-2026-10-12/eel2-skin'+skin+'.png';
  same(provenance.model,MODEL,'fit model');same(provenance.nativeModelSha256,MODEL_SHA,'fit model identity');same(provenance.skin,skin,'fit skin slot');same(provenance.source,source,'state generation provenance');
  check(/^[a-f0-9]{64}$/.test(SOURCE_SHAS[skin]||''),'source identity independently pinned before qualification');same(provenance.sourceSha256,SOURCE_SHAS[skin],'recorded generation identity');same(sha(read(source)),SOURCE_SHAS[skin],'actual generated source');
  same(JSON.stringify(provenance.dimensions),'[1088,1552]','eightfold native atlas');
  for(const file of ['diffuse.png','height.webp'])same(sha(read(base(skin)+file)),provenance.files[file],'fitted file digest '+skin+'/'+file);
  const diffuse=await decodedImage(base(skin)+'diffuse.png'),height=await decodedImage(base(skin)+'height.webp');
  for(const image of [diffuse,height]){same(image.width,1088,'decoded width');same(image.height,1552,'decoded height');check(image.data.every((value,i)=>i%4!==3||value===255),'opaque asset');}
  const current=sha(height.data);heightHash??=current;same(current,heightHash,'all charge states use the identical anatomical height pixels');
  check(height.data.every((value,i)=>i%4===3||value===height.data[i-i%4]),'height is grayscale');
 }
});
function chargeMask(original,state){
 const mask=new Uint8Array(WIDTH*HEIGHT);
 for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(original[y*WIDTH+x]!==state[y*WIDTH+x])
  for(let dy=Math.max(0,y-1);dy<=Math.min(HEIGHT-1,y+1);dy++)for(let dx=Math.max(0,x-1);dx<=Math.min(WIDTH-1,x+1);dx++)mask[dy*WIDTH+dx]=1;
 return mask;
}
Deno.test('Generated charge skins preserve the fitted base exactly outside original electrical masks, including all sixteen triangle islands',async()=>{
 const {bytes}=await native('eel2'),nativeSkins=indexedSkins(bytes),zero=await decodedImage(base(0)+'diffuse.png');
 for(let skin=1;skin<6;skin++){
  const mask=chargeMask(nativeSkins[0],nativeSkins[skin]),image=await decodedImage(base(skin)+'diffuse.png');let changed=0,unchanged=0,trianglePixels=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
   const nx=Math.floor(x/FACTOR),ny=Math.floor(y/FACTOR),offset=(y*image.width+x)*4,allowed=mask[ny*WIDTH+nx];
   const differs=image.data[offset]!==zero.data[offset]||image.data[offset+1]!==zero.data[offset+1]||image.data[offset+2]!==zero.data[offset+2]||image.data[offset+3]!==zero.data[offset+3];
   if(!allowed){if(differs)throw Error('state '+skin+' altered anatomy outside native charge envelope at '+x+','+y);unchanged++;}else if(differs)changed++;
   if((nx>=40&&nx<68)||nx>=108){check(!allowed,'native charge mask never reaches triangle columns');check(!differs,'triangle artwork remains the shared base');trianglePixels++;}
  }
  check(changed>20,'actual charged pigment differs from base: '+skin);check(unchanged>image.width*image.height*.8,'most anatomy is explicitly identical');check(trianglePixels>100000,'all auxiliary atlas columns compared');
 }
});
Deno.test('Public Eel selector binds all six distinct skin slots on one entity and retains native geometry/options',async()=>fixture(async(skins,requests)=>{
 const {model,bytes}=await native('eel2'),before=geometry(model),entity={model,_entityIndex:25};check(skins.ENEMY_SKIN_MODELS.has('eel2'),'Eel enters existing normal/material classification');
 await skins.R_NewerSkinsPrepare([model]);same(requests.length,12,'six diffuse and six height requests');
 for(let skin=0;skin<6;skin++)same(skins.R_NewerAliasMaterial(entity,MODEL,true,skin),null,'pending slot retains native');
 for(const r of requests)r.done(r.texture);
 const chosen=[];for(let skin=0;skin<6;skin++){
  const material=skins.R_NewerAliasMaterial(entity,MODEL,true,skin),request=requests.find(r=>r.url.startsWith(base(skin)+'diffuse.png?'));check(material&&request,'skin '+skin+' ready');same(material.map,request.texture,'selected exact state texture');chosen.push(material.map);
  same(material.map.flipY,false,'native top-row-first UV orientation');same(material.map.colorSpace,THREE.SRGBColorSpace,'diffuse colour convention');
 }
 same(new Set(chosen).size,6,'skin-set cache never aliases charge states');
 for(const skin of [6,7,-1])same(skins.R_NewerAliasMaterial(entity,MODEL,true,skin),null,'unsupported skin remains native');
 const modified=Buffer.from(bytes);modified.writeInt32LE(modified.readInt32LE(76)^1,76);const wrong=reload(MODEL,modified);await wrong.aliasSourceIdentity.promise;
 for(let skin=0;skin<6;skin++)same(skins.R_NewerAliasMaterial({model:wrong},MODEL,true,skin),null,'different native source cannot acquire any charge state');
 mode.R_AnimSetClassicPass(true);for(let skin=0;skin<6;skin++)same(skins.R_NewerAliasMaterial(entity,MODEL,true,skin),null,'Classic retains native state');
 mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;for(let skin=0;skin<6;skin++)same(skins.R_NewerAliasMaterial(entity,MODEL,true,skin),null,'custom-off retains native state');
 same(geometry(model),before,'all native geometry/poses/display UVs unchanged');same(requests.length,12,'negative paths start no art requests');COM_AddPack(isolatedPack(MODEL,bytes));
}));
Deno.test('Pending Eel identity blocks every charge request and resolves all six states together',async()=>fixture(async(skins,requests)=>{
 const {model}=await native('eel2');let finish;const identity={state:'pending',promise:new Promise(resolve=>finish=resolve)},pending={...model,aliasSourceIdentity:identity};
 const work=skins.R_NewerSkinsPrepare([pending]);await ticks();same(requests.length,0,'pending identity starts no state image');same(skins.R_NewerSkinsStatus([pending]).preparePending,1,'pending identity accountable');
 identity.state='ready';identity.sha256=MODEL_SHA;finish(MODEL_SHA);await work;same(requests.length,12,'matching identity admits all state pairs');
 for(const r of requests)r.done(r.texture);for(let skin=0;skin<6;skin++)check(skins.R_NewerAliasMaterial({model:pending},MODEL,true,skin),'resolved state '+skin+' usable');
}));
Deno.test('Failed or retired Eel state images settle to native and never publish late materials',async()=>fixture(async(skins,requests)=>{
 const {model}=await native('eel2');await skins.R_NewerSkinsPrepare([model]);requests.forEach(r=>r.fail());const status=skins.R_NewerSkinsStatus([model]);same(status.pending,0,'failed state downloads leave pending');same(status.fallback,12,'all failed state maps recorded');check(status.settled,'failed optional family settles');
 for(let skin=0;skin<6;skin++)same(skins.R_NewerAliasMaterial({model},MODEL,true,skin),null,'failed state uses original');
 let disposed=0;requests.forEach(r=>r.texture.addEventListener('dispose',()=>disposed++));skins.R_NewerSkinsShutdown();requests.forEach(r=>r.done(r.texture));same(disposed,12,'every late state image disposed');same(skins.R_NewerSkinsMaterials([model]).length,0,'retired images publish nothing');
 let finish;const identity={state:'pending',promise:new Promise(resolve=>finish=resolve)},pending={...model,aliasSourceIdentity:identity};const work=skins.R_NewerSkinsPrepare([pending]);await ticks();skins.R_NewerSkinsShutdown();identity.state='ready';identity.sha256=MODEL_SHA;finish(MODEL_SHA);check((await work).cancelled,'retired identity completion cancelled');same(requests.length,12,'retired preparation issues no requests');
}));

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
const authoredNormalHashes={custom:null,native:null};
for(let skin=0;skin<6;skin++)Deno.test('Eel skin '+skin+': custom, generated native and authored native inputs each select their exact shipped normal',async()=>{
 const {model}=await native('eel2'),v=variant(skin),pixels=model.cache.data.gl_texturenum[skin][0].image,entry=index.nativeHeights.eel2?.[skin]?.[0];
 check(entry,'explicit authored native skin entry');same(entry.file,'heights/eel2/skin0_0.webp','shared native anatomical height');same(entry.nativeModelSha256,MODEL_SHA,'authored native height exact identity');
 const customHeight=await decodedImage(base(skin)+'height.webp'),nativeHeight=await decodedImage('newer/enemies/'+entry.file),diffuse=await decodedImage(base(skin)+'diffuse.png');
 same(nativeHeight.width,136,'native height width');same(nativeHeight.height,194,'native height height');
 const custom=await verifyBake(companion(diffuse,customHeight,v.heightStrength,v.heightCap),'custom:'+v.dir);
 await verifyBake(companion(pixels,null),'rogue:'+MODEL,MODEL_SHA);
 const nativeField=await verifyBake(companion(pixels,nativeHeight,entry.strength,entry.cap),'rogue:'+MODEL,MODEL_SHA);
 for(const [kind,decoded]of [['custom',custom],['native',nativeField]]){const hash=sha(decoded.pixels);authoredNormalHashes[kind]??=hash;same(hash,authoredNormalHashes[kind],'charge pigment never changes anatomical '+kind+' normals');}
});
function materialNormal(material){const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>'};material.onBeforeCompile(shader);return shader.uniforms.qrNormal.value;}
Deno.test('All six Eel authored native heights remain source-bound with replacement art disabled',async()=>fixture(async(skins,requests)=>{
 delete globalThis.window;mode.r_newer_enemies.value=0;mode.r_newer_normals.value=1;
 const {model}=await native('eel2'),wrong={...model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}};
 await skins.R_NewerSkinsPrepare([wrong]);same(requests.length,0,'mismatched native identity fetches no authored height');
 await skins.R_NewerSkinsPrepare([model]);same(requests.length,6,'six native state textures prepare the shared authored height');
 const height=await decodedImage('newer/enemies/heights/eel2/skin0_0.webp');
 for(const r of requests){check(r.url.startsWith('newer/enemies/heights/eel2/skin0_0.webp?'),'native authored path');r.texture.dispose();r.texture=new THREE.DataTexture(new Uint8Array(height.data),height.width,height.height,THREE.RGBAFormat);r.done(r.texture);}
 const normalHashes=[];
 for(let skin=0;skin<6;skin++){
  const texture=model.cache.data.gl_texturenum[skin][0],material=skins.R_EnemyAliasMaterial(texture,MODEL,true,skin,0,model);same(material.map,texture,'keeps actual native diffuse state');normalHashes.push(sha(materialNormal(material).image.data));
 }
 same(new Set(normalHashes).size,1,'all authored native states share anatomy normals');
 for(let skin=0;skin<6;skin++)skins.R_EnemyAliasMaterial(model.cache.data.gl_texturenum[skin][0],MODEL,true,skin,0,wrong);
 same(requests.length,6,'revoked identity requests no more authored heights');same(skins.R_NewerSkinsStatus([wrong]).pending,0,'revocation leaves no pending authored requests');
}));

function parsePrograms(bytes){
 const int=offset=>bytes.readInt32LE(offset),h=Array.from({length:15},(_,i)=>int(i*4)),[statementOffset,statementCount,globalDefsOffset,globalDefsCount,fieldDefsOffset,fieldDefsCount,functionOffset,functionCount,stringOffset,stringCount,globalsOffset]=h.slice(2);
 const string=offset=>{check(offset>=0&&offset<stringCount,'valid program string');const end=bytes.indexOf(0,stringOffset+offset);return bytes.toString('latin1',stringOffset+offset,end);};
 const functions=Array.from({length:functionCount},(_,i)=>({start:int(functionOffset+i*36),name:string(int(functionOffset+i*36+16))}));
 const starts=[...new Set(functions.filter(f=>f.start>0).map(f=>f.start))].sort((a,b)=>a-b);starts.push(statementCount);
 const fields=new Map(Array.from({length:fieldDefsCount},(_,i)=>{const o=fieldDefsOffset+i*8;return[bytes.readUInt16LE(o+2),string(int(o+4))];}));
 const globals=new Map(Array.from({length:globalDefsCount},(_,i)=>{const o=globalDefsOffset+i*8;return[string(int(o+4)),bytes.readUInt16LE(o+2)];}));
 const integer=i=>int(globalsOffset+i*4),float=i=>bytes.readFloatLE(globalsOffset+i*4);
 const statement=pc=>{const o=statementOffset+pc*8;return{op:bytes.readUInt16LE(o),a:bytes.readInt16LE(o+2),b:bytes.readInt16LE(o+4),c:bytes.readInt16LE(o+6)};};
 function inspect(name){
  const f=functions.find(f=>f.name===name);check(f&&f.start>0,'actual Rogue function '+name);const end=starts.find(n=>n>f.start),pointers=new Map(),writes=[],calls=[],states=[];
  for(let pc=f.start;pc<end;pc++){
   const st=statement(pc);
   if(st.op===30&&st.a===globals.get('self'))pointers.set(st.c,fields.get(integer(st.b)));
   if(st.op===37&&pointers.has(st.b))writes.push({pc,field:pointers.get(st.b),value:float(st.a)});
   if(st.op===60)states.push({pc,frame:float(st.a),next:functions[integer(st.b)]?.name});
   if(st.op>=51&&st.op<=59)calls.push({pc,name:functions[integer(st.a)]?.name});
  }
  return{start:f.start,end,writes,calls,states};
 }
 return{inspect,statement};
}
Deno.test('Actual Rogue QuakeC preserves Eel charge lighting and immediate skin-five reset without inventing an animation interval',async()=>{
 await native('eel2');const directory=await startup;check(directory.has('progs.dat'),'actual owned Rogue progs.dat available');const program=parsePrograms(await readMember(directory.get('progs.dat')));
 for(let skin=1;skin<=5;skin++){
  const f=program.inspect('eel_attack'+(skin+7));same(f.states[0].frame,skin,'charge uses original swimming pose');check(f.writes.some(w=>w.field==='skin'&&w.value===skin),'original charge skin assignment '+skin);
  if(skin===1)check(f.writes.some(w=>w.field==='effects'&&w.value===8),'charge starts EF_DIMLIGHT');
  if(skin===4)check(f.writes.some(w=>w.field==='effects'&&w.value===4),'late charge uses EF_BRIGHTLIGHT');
 }
 const final=program.inspect('eel_attack12'),write=final.writes.find(w=>w.field==='skin'&&w.value===5),call=final.calls.find(c=>c.name==='eel_melee');check(write&&call&&write.pc<call.pc,'skin five is followed by melee in the same invocation');
 const melee=program.inspect('eel_melee'),writes=new Map(melee.writes.map(w=>[w.pc,w])),stack=[[melee.start,0]],seen=new Set();let exits=0;
 while(stack.length){
  let[pc,flags]=stack.pop();const key=pc+':'+flags;if(seen.has(key))continue;seen.add(key);check(pc>=melee.start&&pc<melee.end,'reset control flow remains in melee function');const st=program.statement(pc),w=writes.get(pc);
  if(w?.field==='skin')flags=w.value===0?flags|1:flags&~1;if(w?.field==='effects')flags=w.value===0?flags|2:flags&~2;
  if(st.op===0||st.op===43){same(flags,3,'every normal melee exit resets skin and effects');exits++;continue;}
  if(st.op===49||st.op===50)stack.push([pc+st.b,flags]);
  stack.push([st.op===61?pc+st.a:pc+1,flags]);
 }
 check(exits>0,'actual melee return paths inspected');
 for(const name of ['eel_death','eel_death1']){const f=program.inspect(name);check(f.writes.some(w=>w.field==='skin'&&w.value===0)&&f.writes.some(w=>w.field==='effects'&&w.value===0),'death resets charge '+name);}
 check(program.inspect('eel_pain1').writes.some(w=>w.field==='skin'&&w.value===0),'pain resets selected charge skin');
});
