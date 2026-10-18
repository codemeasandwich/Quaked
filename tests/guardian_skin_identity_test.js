// Public, source-bound Rogue Guardian skin verification. Reads bounded owned PAK members without exporting them.
// Async selection/failure tests replace only image transport; asset tests decode the actual shipped PNG/WebP files.
import * as THREE from 'three';
import { readFileSync } from './helpers/resource_fs.mjs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { NormalInputs, NormalInputWitness, R_NormalPrepare } from '../src/newer/assets/normal_prepare.js';
import { NormalBakeDecode } from '../src/newer/assets/normal_bake_format.js';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
const WIDTH=276, HEIGHT=195, FACTOR=4;
const NATIVE={
 morph_az:{sha:'98d86ad428b5ab5643e12921f3f41572eb84c2025a8f05c7b882ccce6bdc4a5f',skins:['5e6bc4f56833612c87e0dfebf546d3f63dfe1234a68b50c2f07ae72af618bf43','c05283239a9ba2935f5add416d8a6617268cc9fa43f910749f213ad5792ba6c8','c8cd3d457d9ea848a6c29cb233f2f07e274ca996a75d85ad2baec22cabb4be28']},
 morph_eg:{sha:'14468fccffaa1508c03610dd58fb51cd9058ca3bab036bca18f7a41cb37c195b',skins:['3110682a7a4ed0b2fe78ea3d5ba8a5dc193ece60ca9c8b16b9f07123515587ea','06576498e0c93b358a96f43ec45c8bc16775b0a4b0f87f4347ba0088c4051754','c8cd3d457d9ea848a6c29cb233f2f07e274ca996a75d85ad2baec22cabb4be28']},
 morph_gr:{sha:'662aa03785b4a6d2689670bebc5a9d081c36541347e324fac3957f599eab3be8',skins:['444fb8ab177bd253dee1f0693656920864b00f90e12fb3a44c08fcc20db52b18','89733f772f49359d10bdec7e889b7949559df29b06ae87713324f54a7020450a','c8cd3d457d9ea848a6c29cb233f2f07e274ca996a75d85ad2baec22cabb4be28']}
};
// Add later cultures only after independent source pinning. Material corrections replace provisional references before qualification.
const TARGETS=[
 {
  "key": "morph_az",
  "sources": [
   [
    "morph_az-skin0.png",
    "333d627949a413fd1bb557d67e2befdf1bf34d03d3aa258af082e63042b06c33",
    [
     1492,
     1054
    ]
   ],
   [
    "morph_az-skin1.png",
    "b1e7e0ebc24e27be89bddeaf494eec4b13a18c161fe53656e27a7e889a4a63fc",
    [
     1492,
     1054
    ]
   ],
   [
    "guardian-stone.png",
    "e29305e344e6218df725f1f327522540fb7a7f5e2611b0bab44361eb2030a661",
    [
     1492,
     1054
    ]
   ]
  ]
 },
 {
  "key": "morph_eg",
  "sources": [
   [
    "morph_eg-skin0.png",
    "fe071af30cdea1752da8520e589698a5e0c54726b7c9441fe93728ddd9e2d8a6",
    [
     1492,
     1054
    ]
   ],
   [
    "morph_eg-skin1.png",
    "5f0bd126108822191a33b09265fa4bae615e286628e711713601266ac81c1b40",
    [
     1492,
     1054
    ]
   ],
   [
    "guardian-stone.png",
    "e29305e344e6218df725f1f327522540fb7a7f5e2611b0bab44361eb2030a661",
    [
     1492,
     1054
    ]
   ]
  ]
 },
 {
  "key": "morph_gr",
  "sources": [
   [
    "morph_gr-skin0.png",
    "9e1e2a6bc675c6920d42ad0919ba54c98accf424da1df161b11f5cff061046aa",
    [
     1491,
     1055
    ]
   ],
   [
    "morph_gr-skin1.png",
    "6631221115b40e60aa872b37352537b5c928584e61331bcc68379f16e78e6483",
    [
     1491,
     1055
    ]
   ],
   [
    "guardian-stone.png",
    "e29305e344e6218df725f1f327522540fb7a7f5e2611b0bab44361eb2030a661",
    [
     1492,
     1054
    ]
   ]
  ]
 }
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
  const model = Mod_ForName( name, true ); await model.aliasSourceIdentity.promise; return { model, bytes, palette: COM_FindFile( 'gfx/palette.lmp' ).data };
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
 const skins = await import( '../src/newer/render/r_newerskins.js?guardian-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  mode.R_AnimSetClassicPass( old.classic ); mode.R_AnimSetNewer( old.newer ); mode.r_newer_normals.value = old.normals; mode.r_newer_enemies.value = old.enemies;
 }
}
const variant=(key,skin)=>index.models[key].find(v=>v.skin===skin);
const base=(key,skin)=>'newer/enemies/'+variant(key,skin).dir+'/';
const indexedSkins=bytes=>Array.from({length:3},(_,skin)=>bytes.subarray(88+skin*(4+WIDTH*HEIGHT),88+skin*(4+WIDTH*HEIGHT)+WIDTH*HEIGHT));
const decodedImages=new Map();
async function decodedImage(path){
 if(!decodedImages.has(path))decodedImages.set(path,(async()=>{
  const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
  const image=await canvas.loadImage(read(path)),surface=canvas.createCanvas(image.width,image.height),context=surface.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,image.width,image.height);
 })());return decodedImages.get(path);
}
Deno.test('Guardian additions preserve every pre-campaign model and native-height family',()=>{
 const modelKeys=['boss','knight','ogre','soldier','wizard','backpack','suit','armor','shambler','zombie','demon','h_demon','h_dog','zom_gib','h_shams','shalrath','oldone','enforcer','tarbaby','hknight','scor','dragon','s_wrath','mummy','dog','fish','grem','armabody','armalegs','eel2','sword','wrath','lavaman'];
 const heightKeys=['gib1','gib2','gib3','zom_gib','ogre','h_ogre','demon','h_demon','shambler','h_shams','knight','h_knight','soldier','h_guard','wizard','h_wizard','h_dog','dog','zombie','h_zombie','boss','armabody','eel2'];
 const other=structuredClone(index);other.models.ogre=other.models.ogre.slice(0,1);other.nativeHeights.ogre=other.nativeHeights.ogre.slice(0,1);other.models.knight=other.models.knight.slice(0,1);other.nativeHeights.knight=other.nativeHeights.knight.slice(0,1);delete other.version;other.models=Object.fromEntries(Object.entries(other.models).filter(([key])=>modelKeys.includes(key)).map(([key,list])=>[key,['hknight','tarbaby'].includes(key)?list.slice(0,1):list]));other.nativeHeights=Object.fromEntries(Object.entries(other.nativeHeights).filter(([key])=>heightKeys.includes(key)));
 same(sha(JSON.stringify(other)),'3c787a30ab6d09054111830159d8129c3fcff948637cc6309719f9389918b42c','all prior catalogue data preserved');
});
for(const spec of TARGETS){
 const key=spec.key,NAME='progs/'+key+'.mdl',expected=NATIVE[key];
 Deno.test(key+': three original skins, six UV components and all142poses survive real native loading including blue-matte floodfill',async()=>{
  const {model,bytes,palette}=await native(key),h=model.cache.data;same(sha(bytes),expected.sha,'owned Guardian identity');same(model.aliasSourceIdentity.sha256,expected.sha,'actual public identity');
  for(const [name,value]of Object.entries({numskins:3,skinwidth:276,skinheight:195,numverts:221,numtris:430,numframes:142,numposes:142}))same(h[name],value,name);
  const source=indexedSkins(bytes);let offset=84;
  const paletteBytes=palette instanceof ArrayBuffer?new Uint8Array(palette):new Uint8Array(palette.buffer,palette.byteOffset,palette.byteLength);
  same(Array.from(paletteBytes.subarray(214*3,214*3+3)).join(), '47,47,159','original blue matte palette');
  for(let skin=0;skin<3;skin++){
   same(bytes.readInt32LE(offset),0,'ungrouped original skin');same(sha(source[skin]),expected.skins[skin],'pinned original skin '+skin);offset+=4+WIDTH*HEIGHT;let floodChanged=0;const pixels=h.gl_texturenum[skin][0].image.data;
   for(let i=0;i<source[skin].length;i++){
    const loaded=h.texels[skin][i];if(source[skin][i]!==214)same(loaded,source[skin][i],'non-matte native pigment unchanged');else if(loaded!==214)floodChanged++;
    for(let c=0;c<3;c++)same(pixels[i*4+c],paletteBytes[loaded*3+c],'actual uploaded RGBA follows flood-filled palette');same(pixels[i*4+3],255,'native alpha remains opaque');
   }
   check(floodChanged>1000,'loader really flood-fills blue background before normal inputs');
  }
  same(new Set(h.gl_texturenum.slice(0,3).map(group=>group[0])).size,3,'three distinct native state textures');
  for(let v=0;v<221;v++,offset+=12){same(h.stverts[v].onseam,bytes.readInt32LE(offset),'native seam');same(h.stverts[v].s,bytes.readInt32LE(offset+4),'native U');same(h.stverts[v].t,bytes.readInt32LE(offset+8),'native V');}
  const components=[],triangles=[];
  for(let t=0;t<430;t++,offset+=16){same(h.triangles[t].facesfront,bytes.readInt32LE(offset),'native face');for(let c=0;c<3;c++)same(h.triangles[t].vertindex[c],bytes.readInt32LE(offset+4+c*4),'native corner');
   const front=bytes.readInt32LE(offset),points=[0,1,2].map(c=>{const v=bytes.readInt32LE(offset+4+c*4),uv=h.stverts[v];return[uv.s+(!front&&uv.onseam?138:0),uv.t];});triangles.push({front,points});
  }
  for(const face of [1,0]){let pending=triangles.filter(t=>!!t.front===!!face).map(t=>new Set(t.points.map(p=>p.join(','))));while(pending.length){const points=pending.pop();let count=1,again=true;while(again){again=false;for(let i=pending.length-1;i>=0;i--)if([...pending[i]].some(p=>points.has(p))){pending[i].forEach(p=>points.add(p));pending.splice(i,1);count++;again=true;}}const p=[...points].map(x=>x.split(',').map(Number));components.push({face,count,box:[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]});}}
  same(components.length,6,'body, staff and clothing panel on both halves');
  for(const [face,count,box]of [[1,25,[5,19,21,188]],[1,6,[22,153,46,188]],[1,200,[31,5,133,189]],[0,25,[143,19,159,188]],[0,2,[160,153,184,188]],[0,172,[169,5,271,189]]])check(components.some(c=>c.face===face&&c.count===count&&JSON.stringify(c.box)===JSON.stringify(box)),'exact native UV component '+box);
  for(let pose=0;pose<142;pose++){same(bytes.readInt32LE(offset),0,'ungrouped pose');offset+=28;for(let v=0;v<221;v++,offset+=4){for(let axis=0;axis<3;axis++)same(h.poseverts[pose][v].v[axis],bytes[offset+axis],'native pose coordinate');same(h.poseverts[pose][v].lightnormalindex,bytes[offset+3],'native pose normal');}}
  same(offset,bytes.length,'all original pose bytes covered');for(const[f,n]of [[1,'start01'],[15,'start15'],[31,'start31'],[121,'mfdth01'],[129,'mfdth09'],[141,'mfdth21']])same(h.frames[f].name,n,'actual morph transition frame');
 });
 Deno.test(key+': other cultures share exact geometry and stone skin but have different identities and living art',async()=>{
  const {bytes}=await native(key),directory=await startup,afterSkins=84+3*(4+WIDTH*HEIGHT);
  for(const[other,identity]of Object.entries(NATIVE)){
   const b=await readMember(directory.get('progs/'+other+'.mdl'));same(sha(b),identity.sha,'actual culture identity');check(bytes.subarray(0,84).equals(b.subarray(0,84)),'identical model header');check(bytes.subarray(afterSkins).equals(b.subarray(afterSkins)),'identical UVs, triangles and all pose records');
   const states=indexedSkins(b);same(sha(states[2]),'c8cd3d457d9ea848a6c29cb233f2f07e274ca996a75d85ad2baec22cabb4be28','identical common initial stone skin');if(other!==key){check(identity.sha!==expected.sha,'culture hash boundaries differ');check(sha(states[0])!==expected.skins[0]&&sha(states[1])!==expected.skins[1],'living and transitional artwork differ');}
  }
 });
 Deno.test(key+': generated states have pinned provenance, independent material heights and unique runtime directories',async()=>{
  same(index.models[key].length,3,'all three explicit state entries');const dirs=new Set(),diffuses=new Set(),heights=new Set();
  for(let skin=0;skin<3;skin++){
   const v=variant(key,skin);check(v,'state registered');same(v.dir,key+'/custom'+(skin||''),'unique state directory');dirs.add(v.dir);same(v.nativeModelSha256,expected.sha,'state hash boundary');same(v.maps.diffuse,'diffuse.png','diffuse file');same(v.maps.height,'height.webp','height file');same(Object.keys(v.maps).length,2,'no new emission');same(v.flipGreen,false,'generated normal convention');
   const p=JSON.parse(read(base(key,skin)+'SOURCE.json')),source='tools/texture_sheets/sources/generated-2026-10-12/'+spec.sources[skin][0];same(p.model,NAME,'fit model');same(p.nativeModelSha256,expected.sha,'fit identity');same(p.skin,skin,'fit state');same(p.source,source,'source path');check(/^[a-f0-9]{64}$/.test(spec.sources[skin][1]||''),'final generation must be independently pinned before qualification');same(p.sourceSha256,spec.sources[skin][1],'pinned generation identity');same(sha(read(source)),spec.sources[skin][1],'actual generated reference');same(JSON.stringify(p.dimensions),'[1104,780]','fourfold fitted size (the 4x standard)');
   const sourceBytes=read(source);same(sourceBytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','source PNG');check(spec.sources[skin][2]?.length===2,'final per-source dimensions independently pinned');same(sourceBytes.readUInt32BE(16),spec.sources[skin][2][0],'source width');same(sourceBytes.readUInt32BE(20),spec.sources[skin][2][1],'source height');
   for(const file of ['diffuse.png','height.webp'])same(sha(read(base(key,skin)+file)),p.files[file],'actual fitted bytes');
   const d=await decodedImage(base(key,skin)+'diffuse.png'),h=await decodedImage(base(key,skin)+'height.webp');for(const image of [d,h]){same(image.width,1104,'decoded width');same(image.height,780,'decoded height');check(image.data.every((v,i)=>i%4!==3||v===255),'opaque map');}
   check(h.data.every((v,i)=>i%4===3||v===h.data[i-i%4]),'grayscale height');diffuses.add(sha(d.data));heights.add(sha(h.data));
  }
  same(dirs.size,3,'state cache keys distinct');same(diffuses.size,3,'three material states remain visually distinct');same(heights.size,3,'stone/transition/living relief is not reused like electrical pigment');
 });
 Deno.test(key+': all state materials select correctly while actual other-culture bytes are rejected',async()=>fixture(async(skins,requests)=>{
  const {model,bytes}=await native(key),before=geometry(model),entity={model,_entityIndex:17};check(skins.ENEMY_SKIN_MODELS.has(key),'existing enemy normal pipeline classification');await skins.R_NewerSkinsPrepare([model]);same(requests.length,6,'three diffuse/height pairs');
  for(let skin=0;skin<3;skin++)same(skins.R_NewerAliasMaterial(entity,NAME,true,skin),null,'pending art retains native');requests.forEach(r=>r.done(r.texture));const selected=[];
  for(let skin=0;skin<3;skin++){const material=skins.R_NewerAliasMaterial(entity,NAME,true,skin),request=requests.find(r=>r.url.startsWith(base(key,skin)+'diffuse.png?'));check(material&&request,'ready state');same(material.map,request.texture,'exact requested state selected');selected.push(material.map);}
  same(new Set(selected).size,3,'states never collide in material cache');
  const directory=await startup;for(const other of Object.keys(NATIVE).filter(k=>k!==key)){const b=await readMember(directory.get('progs/'+other+'.mdl')),wrong=reload(NAME,b);await wrong.aliasSourceIdentity.promise;for(let skin=0;skin<3;skin++)same(skins.R_NewerAliasMaterial({model:wrong},NAME,true,skin),null,'actual '+other+' cannot wear '+key+' despite shared geometry');}
  for(const skin of [-1,3,7])same(skins.R_NewerAliasMaterial(entity,NAME,true,skin),null,'unapproved slot remains native');mode.R_AnimSetClassicPass(true);for(let skin=0;skin<3;skin++)same(skins.R_NewerAliasMaterial(entity,NAME,true,skin),null,'Classic keeps original state');mode.R_AnimSetClassicPass(false);mode.r_newer_enemies.value=0;for(let skin=0;skin<3;skin++)same(skins.R_NewerAliasMaterial(entity,NAME,true,skin),null,'custom-off keeps original state');
  same(geometry(model),before,'geometry/poses/display UV commands unchanged');same(requests.length,6,'negative paths fetch no additional art');COM_AddPack(isolatedPack(NAME,bytes));
 }));
 Deno.test(key+': pending identity, failed state images and shutdown have accountable native fallbacks',async()=>fixture(async(skins,requests)=>{
  const {model}=await native(key);let release;const identity={state:'pending',promise:new Promise(resolve=>release=resolve)},pending={...model,aliasSourceIdentity:identity};const work=skins.R_NewerSkinsPrepare([pending]);await ticks();same(requests.length,0,'pending identity requests nothing');same(skins.R_NewerSkinsStatus([pending]).preparePending,1,'identity wait accounted');identity.state='ready';identity.sha256=expected.sha;release(expected.sha);await work;same(requests.length,6,'matching identity admits exactly three state pairs');requests.forEach(r=>r.fail());const status=skins.R_NewerSkinsStatus([pending]);same(status.pending,0,'failed downloads stop waiting');same(status.fallback,6,'failed maps recorded');check(status.settled,'optional failures settle');for(let skin=0;skin<3;skin++)same(skins.R_NewerAliasMaterial({model:pending},NAME,true,skin),null,'failed state stays native');let disposed=0;requests.forEach(r=>r.texture.addEventListener('dispose',()=>disposed++));skins.R_NewerSkinsShutdown();requests.forEach(r=>r.done(r.texture));same(disposed,6,'late state images disposed');same(skins.R_NewerSkinsMaterials([model]).length,0,'late images publish nothing');
 }));
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
for(const spec of TARGETS)for(let skin=0;skin<3;skin++)Deno.test(spec.key+' skin '+skin+': custom and actual flood-filled native inputs select exact shipped normals',async()=>{
 const {model}=await native(spec.key),v=variant(spec.key,skin),diffuse=await decodedImage(base(spec.key,skin)+'diffuse.png'),height=await decodedImage(base(spec.key,skin)+'height.webp');
 await verifyBake(companion(diffuse,height,v.heightStrength,v.heightCap),'custom:'+v.dir);
 await verifyBake(companion(model.cache.data.gl_texturenum[skin][0].image,null),'rogue:progs/'+spec.key+'.mdl',NATIVE[spec.key].sha);
});
function guardianPrograms(bytes){
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
Deno.test('Actual Guardian QuakeC selects each culture and performs stone2 to transition1 to living0, then death0 to1',async()=>{
 await native(TARGETS[0].key);const directory=await startup,q=guardianPrograms(await readMember(directory.get('progs.dat'))),spawn=q.inspect('monster_morph');
 for(const[key,flag]of [['morph_az',2],['morph_eg',4],['morph_gr',8]]){
  const branch=spawn.branches.find(b=>b.expression.op==='&'&&b.expression.left.field==='spawnflags'&&b.expression.right.constant===flag);check(branch,'actual culture flag '+flag);
  check(spawn.writes.some(w=>w.field==='model'&&w.expression.string==='progs/'+key+'.mdl'&&w.pc>branch.pc&&w.pc<branch.target),'flag selects actual culture model '+key);
 }
 const setup=q.inspect('morph_setup');check(setup.writes.some(w=>w.field==='frame'&&w.expression.constant===1),'setup uses original statue pose start01');check(setup.writes.some(w=>w.field==='skin'&&w.expression.constant===2),'setup selects common stone skin2');
 const transition=q.inspect('morph_wake15');same(transition.states[0].frame,15,'stone-to-transition frame15');check(transition.writes.some(w=>w.field==='skin'&&w.expression.constant===1),'wake15 selects unique transitional skin1');
 const alive=q.inspect('morph_wake31');same(alive.states[0].frame,31,'living transition frame31');check(alive.writes.some(w=>w.field==='skin'&&w.expression.op==='-'&&w.expression.left.field==='skin'&&w.expression.right.constant===1),'wake31 decrements skin1 to0');
 const death=q.inspect('morph_die9');same(death.states[0].frame,129,'death morph uses original mfdth09');check(death.writes.some(w=>w.field==='skin'&&w.expression.op==='+'&&w.expression.left.field==='skin'&&w.expression.right.constant===1),'death increments active skin0 to1 rather than jumping to2');
});
Deno.test('Egyptian increment preserves the published Aztec catalogue and every fitted Aztec image',()=>{
 const modelKeys=['boss','knight','ogre','soldier','wizard','backpack','suit','armor','shambler','zombie','demon','h_demon','h_dog','zom_gib','h_shams','shalrath','oldone','enforcer','tarbaby','hknight','scor','dragon','s_wrath','mummy','dog','fish','grem','armabody','armalegs','eel2','sword','wrath','lavaman','morph_az'];
 const heightKeys=['gib1','gib2','gib3','zom_gib','ogre','h_ogre','demon','h_demon','shambler','h_shams','knight','h_knight','soldier','h_guard','wizard','h_wizard','h_dog','dog','zombie','h_zombie','boss','armabody','eel2'];
 const prior=structuredClone(index);prior.models.ogre=prior.models.ogre.slice(0,1);prior.nativeHeights.ogre=prior.nativeHeights.ogre.slice(0,1);prior.models.knight=prior.models.knight.slice(0,1);prior.nativeHeights.knight=prior.nativeHeights.knight.slice(0,1);delete prior.version;prior.models=Object.fromEntries(Object.entries(prior.models).filter(([key])=>modelKeys.includes(key)).map(([key,list])=>[key,['hknight','tarbaby'].includes(key)?list.slice(0,1):list]));prior.nativeHeights=Object.fromEntries(Object.entries(prior.nativeHeights).filter(([key])=>heightKeys.includes(key)));
 same(sha(JSON.stringify(prior)),'0ee72c958c80953caa83a20c8c64c303fa6383d58a6aec61af0dcc94ee961ead','all34prior model families and23native-height families unchanged');
 const files={
  'custom/diffuse.png':'7e23dc111f450605644e37b1a4b092405905cc8fda2335ec52c19768223bcce2',
  'custom/height.webp':'bca84905d22625ff2c5fb001d8e3e96be9931192ef152201f8882d7f9c7ceb53',
  'custom1/diffuse.png':'43ab85eef5a586e1562131d9b413e0fee34af7d28aaef13959cdc20b2dcc606e',
  'custom1/height.webp':'b1a7c1007959859f6d6dc658b6db71ba0ae3860a9fdf9d1a5c51a1ae283e54e9',
  'custom2/diffuse.png':'87dc0aae1a328199af5bc79ca6cd808bbb40d5daa6887e5d44faca31f7e1ee5d',
  'custom2/height.webp':'a6056da076a009d06e3920889b781e4a1d22e7a2eff88d3413140559a933f0a4'
 };
 for(const[file,digest]of Object.entries(files))same(sha(read('newer/enemies/morph_az/'+file)),digest,'published Aztec bytes retained: '+file);
});
Deno.test('Shared Guardian statue reuses exact fitted art, relief and prepared inputs without aliasing living cultures',()=>{
 const manifest=JSON.parse(read('newer/normals/manifest.json'));
 const keys=key=>new Set([...manifest.levels['rogue:progs/'+key+'.mdl'].keys,...[0,1,2].flatMap(skin=>manifest.levels['custom:'+variant(key,skin).dir].keys)]);
 const first=TARGETS[0].key,firstKeys=keys(first);same(firstKeys.size,6,'first culture has three native and three custom inputs');
 for(const {key}of TARGETS.slice(1)){
  for(const file of ['diffuse.png','height.webp'])same(sha(read(base(key,2)+file)),sha(read(base(first,2)+file)),'common stone fitted bytes reused: '+file);
  same(manifest.levels['custom:'+variant(key,2).dir].keys.join(),manifest.levels['custom:'+variant(first,2).dir].keys.join(),'shared custom stone content key');
  const current=keys(key);same(current.size,6,'next culture still has all six input identities');same([...current].filter(k=>firstKeys.has(k)).length,2,'only native and custom stone inputs deduplicate');same([...current].filter(k=>!firstKeys.has(k)).length,4,'living and transitional states add four exact inputs');
 }
});
Deno.test('Greek increment preserves all published Aztec and Egyptian catalogue data and Egyptian image bytes',()=>{
 const modelKeys=['boss','knight','ogre','soldier','wizard','backpack','suit','armor','shambler','zombie','demon','h_demon','h_dog','zom_gib','h_shams','shalrath','oldone','enforcer','tarbaby','hknight','scor','dragon','s_wrath','mummy','dog','fish','grem','armabody','armalegs','eel2','sword','wrath','lavaman','morph_az','morph_eg'];
 const heightKeys=['gib1','gib2','gib3','zom_gib','ogre','h_ogre','demon','h_demon','shambler','h_shams','knight','h_knight','soldier','h_guard','wizard','h_wizard','h_dog','dog','zombie','h_zombie','boss','armabody','eel2'];
 const prior=structuredClone(index);prior.models.ogre=prior.models.ogre.slice(0,1);prior.nativeHeights.ogre=prior.nativeHeights.ogre.slice(0,1);prior.models.knight=prior.models.knight.slice(0,1);prior.nativeHeights.knight=prior.nativeHeights.knight.slice(0,1);delete prior.version;prior.models=Object.fromEntries(Object.entries(prior.models).filter(([key])=>modelKeys.includes(key)).map(([key,list])=>[key,['hknight','tarbaby'].includes(key)?list.slice(0,1):list]));prior.nativeHeights=Object.fromEntries(Object.entries(prior.nativeHeights).filter(([key])=>heightKeys.includes(key)));
 same(sha(JSON.stringify(prior)),'b2f2e3834b184e35342307520ddf397cba23b1a0b9d6594f99aa81a66f43d72e','all35prior model families and23native-height families unchanged');
 const files={
  'custom/diffuse.png':'bf758eb56a76f4adcb6e776a93f26e0d73e5ba299dff9f8768a9a07cf6de16aa',
  'custom/height.webp':'c33c53d6a8d30356e491bbbccc4e0617fc1b9aa9e095e65bdbc1bce82b9c9a9b',
  'custom1/diffuse.png':'26442a4caa42d2b09650d25883b98ef436fa0d31f558fa176147a36b8130ba99',
  'custom1/height.webp':'5217738d9027d53a9e2239d00c21389d843280ea3bea5459b5a2d7775dc5a799',
  'custom2/diffuse.png':'87dc0aae1a328199af5bc79ca6cd808bbb40d5daa6887e5d44faca31f7e1ee5d',
  'custom2/height.webp':'a6056da076a009d06e3920889b781e4a1d22e7a2eff88d3413140559a933f0a4'
 };
 for(const[file,digest]of Object.entries(files))same(sha(read('newer/enemies/morph_eg/'+file)),digest,'published Egyptian bytes retained: '+file);
});
Deno.test('Simultaneous Guardian preparation keeps nine culture/state material bindings separate despite shared statue art',async()=>fixture(async(skins,requests)=>{
 const models=await Promise.all(TARGETS.map(async spec=>(await native(spec.key)).model));await skins.R_NewerSkinsPrepare(models);same(requests.length,18,'nine separate diffuse/height pairs');requests.forEach(r=>r.done(r.texture));
 const entity={model:null,_entityIndex:31},selected=new Set();
 for(let i=0;i<TARGETS.length;i++)for(const skin of [0,1,2,1,0,2]){
  const key=TARGETS[i].key,model=models[i];entity.model=model;const material=skins.R_NewerAliasMaterial(entity,model.name,true,skin),request=requests.find(r=>r.url.startsWith(base(key,skin)+'diffuse.png?'));
  check(material&&request,'prepared culture/state ready');same(material.map,request.texture,'same entity switching culture/state keeps exact texture');selected.add(material.map);
 }
 same(selected.size,9,'unique directories prevent all cross-culture/state material collisions');same(requests.length,18,'switching creates no extra image requests');check(skins.R_NewerSkinsStatus(models).settled,'all prepared culture/state images settle');
}));
