// Independent installed public checks for two owner-authored height-only pairs.
// Run only after the reviewed four-file/four-binding successor is installed.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import {r_hdr} from '../src/newer/render/gl_post.js';
import {GL_LoadTexture} from '../src/engine/render/gl_model_common.js';
import {VID_SetPalette,vid} from '../src/engine/render/vid.js';
import {R_GlassTextureKey} from '../src/newer/render/r_newertextures.js';
import {R_NormalMapFor,R_NormalsFromCraftedHeight} from '../src/newer/render/gl_normals.js';
import {NormalInputs,NormalInputKey,NormalGenerate} from '../src/newer/assets/normal_prepare.js';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {memberSearch,readMember,sha256} from '../tools/pak_members.mjs';
import {ownerQ92Receipt,ownerQ92ReceiptPath,ownerQ92Before,ownerQ92Bindings,ownerQ92Maps,ownerQ92ImageSize,ownerQ92Baseline,techQ92ReceiptPath,techQ92Plan,techQ92Before,techQ92Bindings,techQ92Maps} from './owner_texture_q92_standard.js';
const root=resolve(import.meta.dirname,'..'),read=p=>readFileSync(resolve(root,p));
const planPath='tools/texture_sheets/sources/official-world-2026-10-17/verification/legacy-owner-q92-first-tranche-plan.json';
const plan=JSON.parse(read(planPath)).firstTranche,indexBytes=read('newer/textures/index.json'),index=JSON.parse(indexBytes);
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b),equal=(a,b,m)=>check(isDeepStrictEqual(a,b),m),bytes=(a,b,m)=>check(Buffer.from(a).equals(Buffer.from(b)),m);
const dispose=t=>{t._fullbright?.dispose();t.dispose();};
const games=new Map(),maps=new Map();
function packPath(id){const game=GAME_CATALOGUE_GAMES.find(g=>g.id===(id==='id1'?'quake':id));check(game,'known game '+id);if(process.env.QUAKED_GAME_ROOT)return resolve(process.env.QUAKED_GAME_ROOT,game.folders.find(f=>f.startsWith('games/')).slice(6),'pak0.pak');return resolve(root,id==='shareware'?'games/shareware/pak0.pak':'resources/'+id+'/pak0.pak');}
async function gameFiles(id){if(!games.has(id))games.set(id,(async()=>{const paths=[packPath('id1'),packPath('shareware')];if(id!=='id1')paths.push(packPath(id));const members=await memberSearch(paths),p=members.get('gfx/palette.lmp');return{members,palette:await readMember(p),palettePack:p.path};})());return games.get(id);}
async function native(entry,use){
 const game=await gameFiles(use.game),map=game.members.get(use.map);check(map,'actual inherited map '+use.map);const key=map.path+'|'+map.name;
 if(!maps.has(key))maps.set(key,readMember(map));const bsp=await maps.get(key);check(bsp.length>=124&&[29,0x32505342,0x42535032].includes(bsp.readInt32LE(0)),'supported BSP');
 const start=bsp.readInt32LE(20),length=bsp.readInt32LE(24);check(start>=124&&length>=4&&start+length<=bsp.length,'bounded texture lump');const count=bsp.readInt32LE(start);check(count>0&&count<=4096&&4+count*4<=length&&use.slot>=0&&use.slot<count,'bounded slot');
 const offset=bsp.readInt32LE(start+4+use.slot*4);check(offset>=4+count*4&&offset+40<=length,'bounded miptex');const at=start+offset,name=bsp.subarray(at,at+16).toString('latin1').split('\0')[0],w=bsp.readUInt32LE(at+16),h=bsp.readUInt32LE(at+20),mip=bsp.readUInt32LE(at+24);
 same(name,entry.name,'actual native name');equal([w,h],entry.nativeDimensions??[64,64],'actual explicit native dimensions');check(mip>=40&&offset+mip+w*h<=length,'bounded native pixels');const pixels=bsp.subarray(at+mip,at+mip+w*h);
 VID_SetPalette(game.palette);vid.fullbright=224;const texture=GL_LoadTexture(name,w,h,pixels,true,false,true),rgba=texture.image.data.slice(),fb=texture._fullbright?.image.data;if(fb)for(let p=0;p<rgba.length;p+=4)if(fb[p+3])rgba.set(fb.subarray(p,p+3),p);
 const expected=new Uint8Array(w*h*4);for(let i=0;i<pixels.length;i++)expected.set([...game.palette.subarray(pixels[i]*3,pixels[i]*3+3),255],i*4);bytes(rgba,expected,'actual GL palette/fullbright reconstruction');same(R_GlassTextureKey(texture),entry.nativeKey,'actual owner source key');same(sha256(rgba),entry.sourcePixelSha256,'actual owner source pixels');
 return{texture,rgba,source:{name,game:use.game,map:use.map,slot:use.slot,pack:map.path,mapSha256:sha256(bsp),palettePack:game.palettePack,paletteSha256:sha256(game.palette),nativeKey:entry.nativeKey,nativePixelSha256:sha256(rgba)}};
}
async function fixture(run){
 check(process.env.QUAKED_CANVAS_MODULE,'set actual canvas module');const{createCanvas,Image:NativeImage}=await import(pathToFileURL(process.env.QUAKED_CANVAS_MODULE).href);
 const saved={fetch:globalThis.fetch,Image:Object.getOwnPropertyDescriptor(globalThis,'Image'),document:Object.getOwnPropertyDescriptor(globalThis,'document'),classic:mode.R_ClassicPassActive()},controls=[r_hdr,mode.r_newer_textures];for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);const values=controls.map(c=>c.string),requests=[];
 globalThis.fetch=async url=>{same(String(url),'newer/textures/index.json','public index fetch');return{ok:true,json:async()=>index};};
 Object.defineProperty(globalThis,'Image',{configurable:true,value:class extends NativeImage{set src(url){requests.push(String(url));super.src=read(String(url).split('?')[0]);}}});Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:n=>{same(n,'canvas','public image canvas');return createCanvas(1,1);}}});mode.R_AnimSetClassicPass(false);vars.Cvar_SetValue(r_hdr.name,1);vars.Cvar_SetValue(mode.r_newer_textures.name,1);
 const decode=async file=>{const im=new NativeImage(),loaded=new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;});im.src=read(file);await loaded;const ctx=createCanvas(im.width,im.height).getContext('2d');ctx.drawImage(im,0,0);return{width:im.width,height:im.height,data:ctx.getImageData(0,0,im.width,im.height).data};};
 try{const api=await import('../src/newer/render/r_newertextures.js?owner-q92-'+Math.random());await run({api,requests,decode});}finally{globalThis.fetch=saved.fetch;for(const k of['Image','document'])if(saved[k])Object.defineProperty(globalThis,k,saved[k]);else delete globalThis[k];controls.forEach((c,i)=>vars.Cvar_Set(c.name,values[i]));mode.R_AnimSetClassicPass(saved.classic);}
}
async function settled(api,name,t){const end=Date.now()+5000;while(t.userData.newerPending&&Date.now()<end)await new Promise(r=>setTimeout(r,5));check(api.R_NewerTextureSettled(name,t)&&!t.userData.newerPending,name+' terminal public load');}
// Later additive registrations may add names/source keys, while every existing
// complete recipe stays exact. Native-keyed maps need one extra level of checks.
function preserveExistingOwnerState(current,expected){
 for(const[field,entries]of Object.entries(expected)){
  if(field==='version')continue;
  if(['ordinaryVariants','glass'].includes(field))for(const[name,byKey]of Object.entries(entries))for(const[key,value]of Object.entries(byKey))equal(current[field]?.[name]?.[key],value,'preserve existing '+field+'.'+name+'.'+key);
  else for(const[name,value]of Object.entries(entries))equal(current[field]?.[name],value,'preserve existing '+field+'.'+name);
 }
}
Deno.test('four owner Q92 successors preserve complete predecessor metadata and byte-reproduce from retained masters',()=>{
 const expected=structuredClone(ownerQ92Before);check(Number.isSafeInteger(index.version)&&index.version>expected.version,'version advances');expected.version=index.version;
 for(const field of['textures','normals'])for(const[name,previous]of Object.entries(expected[field]))expected[field][name]=ownerQ92Baseline(field,name,previous);
 for(const e of ownerQ92Bindings){expected.textures[e.name]=e.current.file;expected.normals[e.name]=e.current.normal;equal(index.sources[e.name],e.sourceAllowlist,'source guard unchanged');check(!index.ordinaryVariants?.[e.name]?.[e.nativeKey]&&!index.glass?.[e.name],'no route shadow for this native source');}
 if(index.version===ownerQ92Before.version+1)equal(index,expected,'first install changes only four diffuse/four normal-file references and version');
 else preserveExistingOwnerState(index,expected);
 // The preservation gate itself must admit a later additive source key while
 // rejecting changed/deleted old recipes, including nested ordinary variants.
 const later=structuredClone(expected);later.version++;later.ordinaryVariants.__owner_q92_additive_probe__={'1x1:probe':{file:'probe.webp'}};preserveExistingOwnerState(later,expected);
 const firstName=Object.keys(expected.ordinaryVariants)[0],firstKey=Object.keys(expected.ordinaryVariants[firstName])[0];later.ordinaryVariants[firstName]['1x1:additional-probe']={file:'probe.webp'};preserveExistingOwnerState(later,expected);
 for(const mutate of[c=>{c.ordinaryVariants[firstName][firstKey].file+='-wrong';},c=>{delete c.normals.city5_3;},c=>{c.normals.wizmet1_3.normalFile='unreviewed.webp';}]){const bad=structuredClone(later);mutate(bad);let rejected=false;try{preserveExistingOwnerState(bad,expected);}catch{rejected=true;}check(rejected,'later version never bypasses preserved old recipe checks');}

 const reproduce="from PIL import Image; import sys,io\np=Image.open(sys.argv[1]);p=p.convert('RGBA' if 'A' in p.getbands() else 'RGB');b=io.BytesIO();p.save(b,'WEBP',quality=92,lossless=False,method=6);sys.stdout.buffer.write(b.getvalue())";
 for(const m of ownerQ92Maps){same(sha256(read(m.predecessor)),m.masterSha256,'retained source hash');const current=read(m.file);equal(ownerQ92ImageSize(current,m.file),[256,256],'actual4x map');same(sha256(current),m.sha256,'runtime digest');bytes(execFileSync('/usr/bin/python3',['-c',reproduce,resolve(root,m.predecessor)]),current,'independent Q92 codec reproduction');}
});
Deno.test('all24 owner source occurrences match actual PAK pixels and share exact native identities with their donors',async()=>{
 const sources=[];for(const e of ownerQ92Bindings){const p=plan.bindings.find(p=>p.name===e.name);check(p,'planned real owner uses');for(const use of p.officialObservedUses){const actual=await native(e,use);try{sources.push(actual.source);}finally{dispose(actual.texture);}}}
 same(sources.length,24,'all retained official and installed-extra owner occurrences');
 const result={qualification:'Actual inherited PAK/source checks for reviewed installed owner Q92 format successors; visual acceptance separate',indexSha256:sha256(indexBytes),registrationSha256:sha256(read(ownerQ92ReceiptPath)),bindings:4,uniqueImages:4,occurrences:sources.length,sources};if(process.env.QUAKED_OWNER_Q92_SOURCE_RECEIPT)writeFileSync(process.env.QUAKED_OWNER_Q92_SOURCE_RECEIPT,JSON.stringify(result,null,2)+'\n');
});
Deno.test('height-only owner maps reach public derived normals/cache keys without changing UVs or Classic originals',()=>fixture(async f=>{
 const installed=[];try{await f.api.R_NewerTexturesPrefetch([]);for(const e of ownerQ92Bindings){const p=plan.bindings.find(p=>p.name===e.name),actual=await native(e,p.officialObservedUses[0]),t=actual.texture,original=t.image;installed.push([t,original]);t.offset.set(.125,.25);t.repeat.set(2,3);f.api.R_NewerTextureUpgrade(e.name,t);await settled(f.api,e.name,t);same(t.userData.newerPicture,true,'public owner upgrade');
  const diffuse=await f.decode('newer/textures/'+e.current.file),height=await f.decode('newer/textures/'+e.current.normal.file),oldHeight=await f.decode('newer/textures/'+e.previous.normal.file),field=t.userData.newerHeight;equal([diffuse.width,diffuse.height,height.width,height.height],[256,256,256,256],'4x diffuse/height');same(field.file,e.current.normal.file,'new scalar recipe');same(field.strength,e.previous.normal.strength,'owner strength');same(field.cap,e.previous.normal.cap,'owner cap');same(field.authoredNormal,undefined,'no authored normal substituted');same(field.dataFile,undefined,'no scalar override');
  const glow=t._fullbright?.image.data;for(let i=0;i<diffuse.data.length;i+=4)for(let c=0;c<3;c++)same(t.image.data[i+c]+(glow?.[i+c]||0),diffuse.data[i+c],'decoded diffuse/glow conservation');
  for(let i=0;i<field.data.length;i++){same(oldHeight.data[i*4],oldHeight.data[i*4+1],'retained height master R=G');same(oldHeight.data[i*4],oldHeight.data[i*4+2],'retained height master R=B');same(field.data[i],Math.fround(height.data[i*4]/255),'decoded height R reaches scalar');}
  const normal=R_NormalMapFor(t),input=NormalInputs(t),generated=NormalGenerate(input);same(input.authored,null,'derived normal input');bytes(normal.image.data,R_NormalsFromCraftedHeight(field.data,256,256,field.strength,field.cap),'foreground derives matching normal');bytes(normal.image.data,generated.pixels,'prepared generator matches foreground');equal(normal.offset.toArray(),t.offset.toArray(),'normal UV offset');
  const oldScalar=Float32Array.from({length:256*256},(_,i)=>oldHeight.data[i*4]/255);if(!Buffer.from(oldScalar.buffer).equals(Buffer.from(input.scalar.buffer)))check(await NormalInputKey({...input,scalar:oldScalar})!==await NormalInputKey(input),'new decoded height has a new content cache key');
  equal(t.offset.toArray(),[.125,.25],'offset retained');equal(t.repeat.toArray(),[2,3],'period retained');same(t.wrapS,THREE.RepeatWrapping,'repeat S');same(t.wrapT,THREE.RepeatWrapping,'repeat T');bytes(f.api.R_ClassicTexture(t).image.data,original.data,'Classic source pixels retained');
  for(const file of[e.current.file,e.current.normal.file])check(f.requests.includes('newer/textures/'+file+'?v='+index.version),'versioned actual map request');
 }
 same(f.requests.length,4,'donor/alias share four decoded image requests');f.api.R_NewerTexturesRevert();for(const[t,original]of installed){same(t.image,original,'Classic reverts exact original image');same(t.userData.newerHeight,undefined,'Classic removes derived relief');}
 }finally{for(const[t]of installed)dispose(t);}
}));
Deno.test('unknown owner pixels and wrong-case names fall back while Classic requests no derivatives',()=>fixture(async f=>{
 for(const e of ownerQ92Bindings){const p=plan.bindings.find(p=>p.name===e.name),actual=await native(e,p.officialObservedUses[0]),pixels=actual.rgba.slice();pixels[0]^=1;const unknown=new THREE.DataTexture(pixels,64,64),original=unknown.image;
  try{check(R_GlassTextureKey(unknown)!==e.nativeKey,'unknown identity differs');f.api.R_NewerTextureUpgrade(e.name,unknown);await settled(f.api,e.name,unknown);same(unknown.userData.newerFallback,true,'unknown native pixels rejected');same(unknown.image,original,'unknown source image retained');
   const wrong=e.name.toUpperCase();check(wrong!==e.name,'meaningful case negative');for(const section of['textures','normals','sources','ordinaryVariants','glass'])same(index[section]?.[wrong],undefined,'no wrong-case selector');const nativeImage=actual.texture.image;f.api.R_NewerTextureUpgrade(wrong,actual.texture);await settled(f.api,wrong,actual.texture);same(actual.texture.userData.newerFallback,true,'wrong case rejected');same(actual.texture.image,nativeImage,'case fallback retains native');same(actual.texture.userData.newerHeight,undefined,'case fallback no owner relief');
   mode.R_AnimSetClassicPass(true);const classic=await native(e,p.officialObservedUses[0]);try{f.api.R_NewerTextureUpgrade(e.name,classic.texture);await Promise.resolve();same(classic.texture.userData.newerPicture,undefined,'Classic skips replacement');}finally{dispose(classic.texture);mode.R_AnimSetClassicPass(false);}
  }finally{dispose(unknown);dispose(actual.texture);}
 }
 same(f.requests.length,0,'no derivative loads for unknown/case/Classic controls');
}));


// One bounded additional case uses the existing fixture/parser/renderer; the
// original four owner cases and their lossless-gray witness remain unchanged.
Deno.test('six legacy tech Q92 successors preserve direct-source RGB masters, all61 PAK uses and height-only public behavior',async()=>{
 const expected=structuredClone(techQ92Before);check(Number.isSafeInteger(index.version)&&index.version>expected.version,'tech successor advances version');expected.version=index.version;
 for(const e of techQ92Bindings){expected.textures[e.name]=e.current.file;expected.normals[e.name]=e.current.normal;equal(index.sources[e.name],e.sourceAllowlist,'tech exact source guard unchanged');check(!index.ordinaryVariants?.[e.name]&&!index.glass?.[e.name],'tech no route shadow');}
 if(index.version===techQ92Before.version+1)equal(index,expected,'tech first install changes only six diffuse and six height filenames plus version');else preserveExistingOwnerState(index,expected);
 const resampleEncode="from PIL import Image; import sys,io,hashlib\ns=Image.open(sys.argv[1]);assert s.mode=='RGB';p=Image.open(sys.argv[2]);assert p.format=='PNG' and p.mode=='RGB';expected=s.resize((int(sys.argv[3]),int(sys.argv[4])),Image.Resampling.LANCZOS);assert p.size==expected.size and p.tobytes()==expected.tobytes();assert hashlib.sha256(p.tobytes()).hexdigest()==sys.argv[5];b=io.BytesIO();p.convert('RGB').save(b,'WEBP',quality=92,lossless=False,method=6);sys.stdout.buffer.write(b.getvalue())";
 for(const m of techQ92Maps)bytes(execFileSync('/usr/bin/python3',['-c',resampleEncode,resolve(root,m.retainedPre4xFile),resolve(root,m.master),...m.dimensions.map(String),m.masterDecodedRgbSha256]),read(m.file),'independent direct-source PNG pixels and Q92 bytes '+m.name+'/'+m.role);
 const sources=[];for(const e of techQ92Bindings){const p=techQ92Plan.bindings.find(p=>p.name===e.name);check(p,'planned real tech uses');for(const use of p.officialObservedUses){const actual=await native(e,use);try{sources.push(actual.source);}finally{dispose(actual.texture);}}}same(sources.length,61,'all61 recorded tech source occurrences');
 await fixture(async f=>{
  const installed=[];try{await f.api.R_NewerTexturesPrefetch([]);for(const e of techQ92Bindings){
   const p=techQ92Plan.bindings.find(p=>p.name===e.name),actual=await native(e,p.officialObservedUses[0]),t=actual.texture,original=t.image,[w,h]=e.target;installed.push([t,original]);t.offset.set(.25,.5);t.repeat.set(2,3);
   f.api.R_NewerTextureUpgrade(e.name,t);await settled(f.api,e.name,t);same(t.userData.newerPicture,true,'tech public upgrade');
   const diffuse=await f.decode('newer/textures/'+e.current.file),height=await f.decode('newer/textures/'+e.current.normal.file),old=await f.decode('newer/textures/'+e.previous.normal.file),field=t.userData.newerHeight;
   equal([diffuse.width,diffuse.height,height.width,height.height],[w,h,w,h],'tech exact rectangular or square4x dimensions');same(field.file,e.current.normal.file,'tech own height file');same(field.strength,e.previous.normal.strength,'tech strength preserved');same(field.cap,e.previous.normal.cap||1.1,'tech effective cap preserved');same(field.authoredNormal,undefined,'tech derives normals');same(field.dataFile,undefined,'tech no scalar override');same(field.edgeSource,undefined,'tech no edge override');same(field.derive,undefined,'tech no alternate height recipe');
   const glow=t._fullbright?.image.data;for(let i=0;i<diffuse.data.length;i+=4)for(let c=0;c<3;c++)same(t.image.data[i+c]+(glow?.[i+c]||0),diffuse.data[i+c],'tech decoded diffuse/fullbright conservation');
   for(let i=0;i<field.data.length;i++)same(field.data[i],Math.fround(height.data[i*4]/255),'tech decoded R is scalar authority');
   const lighting=R_NormalMapFor(t),input=NormalInputs(t),generated=NormalGenerate(input);same(input.authored,null,'tech no authored normal');bytes(lighting.image.data,R_NormalsFromCraftedHeight(field.data,w,h,field.strength,field.cap),'tech foreground actual normal math');bytes(lighting.image.data,generated.pixels,'tech prepared generator agrees');equal(lighting.offset.toArray(),t.offset.toArray(),'tech normal offset aligned');
   const oldScalar=Float32Array.from({length:w*h},(_,i)=>old.data[i*4]/255);if(!Buffer.from(oldScalar.buffer).equals(Buffer.from(input.scalar.buffer)))check(await NormalInputKey({...input,scalar:oldScalar})!==await NormalInputKey(input),'tech changed scalar changes content cache key');
   equal(t.offset.toArray(),[.25,.5],'tech UV offset');equal(t.repeat.toArray(),[2,3],'tech native period');same(t.wrapS,THREE.RepeatWrapping,'tech repeatS');same(t.wrapT,THREE.RepeatWrapping,'tech repeatT');bytes(f.api.R_ClassicTexture(t).image.data,original.data,'tech native Classic pixels');
   for(const file of[e.current.file,e.current.normal.file])check(f.requests.includes('newer/textures/'+file+'?v='+index.version),'tech versioned image request');
  }same(f.requests.length,12,'exactly twelve tech image requests');f.api.R_NewerTexturesRevert();for(const[t,original]of installed){same(t.image,original,'tech revert native image');same(t.userData.newerHeight,undefined,'tech revert relief');}
  }finally{for(const[t]of installed)dispose(t);}
 });
 await fixture(async f=>{
  for(const e of techQ92Bindings){const p=techQ92Plan.bindings.find(p=>p.name===e.name),actual=await native(e,p.officialObservedUses[0]),pixels=actual.rgba.slice();pixels[0]^=1;const unknown=new THREE.DataTexture(pixels,...e.nativeDimensions),original=unknown.image;
   try{check(R_GlassTextureKey(unknown)!==e.nativeKey,'tech unknown key differs');f.api.R_NewerTextureUpgrade(e.name,unknown);await settled(f.api,e.name,unknown);same(unknown.userData.newerFallback,true,'tech unknown native rejected');same(unknown.image,original,'tech unknown stays native');same(unknown.userData.newerHeight,undefined,'tech unknown no relief');
    const wrong=e.name.toUpperCase();for(const section of['textures','normals','sources','ordinaryVariants','glass'])same(index[section]?.[wrong],undefined,'tech wrongcase has no selector');const nativeImage=actual.texture.image;f.api.R_NewerTextureUpgrade(wrong,actual.texture);await settled(f.api,wrong,actual.texture);same(actual.texture.userData.newerFallback,true,'tech wrongcase rejected');same(actual.texture.image,nativeImage,'tech wrongcase native pixels');same(actual.texture.userData.newerHeight,undefined,'tech wrongcase no relief');
    mode.R_AnimSetClassicPass(true);const classic=await native(e,p.officialObservedUses[0]),classicImage=classic.texture.image;try{f.api.R_NewerTextureUpgrade(e.name,classic.texture);await Promise.resolve();same(classic.texture.image,classicImage,'tech Classic retains original image');same(classic.texture.userData.newerPicture,undefined,'tech Classic no photograph');same(classic.texture.userData.newerHeight,undefined,'tech Classic no relief');}finally{dispose(classic.texture);mode.R_AnimSetClassicPass(false);}
   }finally{dispose(unknown);dispose(actual.texture);}
  }same(f.requests.length,0,'tech unknown/case/Classic request no maps');
 });
 if(process.env.QUAKED_TECH_Q92_SOURCE_RECEIPT)writeFileSync(process.env.QUAKED_TECH_Q92_SOURCE_RECEIPT,JSON.stringify({qualification:'Installed direct-source format successors, actual PAK/public derived-normal checks; GPU/art/landing acceptance separate',indexSha256:sha256(indexBytes),registrationSha256:sha256(read(techQ92ReceiptPath)),bindings:6,uniqueImages:12,occurrences:sources.length,sources},null,2)+'\n');
});
