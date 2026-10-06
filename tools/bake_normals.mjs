// Uses the native palette/model and actual Newer texture upgrade functions.
// Only decoded CPU samples are prepared; no WebGL/browser/game instances.
import {register} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {memberSearch,readMember,isolatedPack,sha256} from './pak_members.mjs';
const args=process.argv.slice(2),packs=[],loose=[];let namespace='bundled',filter='.*',skins=false,variantFilter=null;
for(let i=0;i<args.length;i++){if(args[i]==='--pack')packs.push(args[++i]);else if(args[i]==='--namespace')namespace=args[++i];else if(args[i]==='--maps')filter=args[++i];else if(args[i]==='--loose')loose.push(args[++i]);else if(args[i]==='--skins')skins=true;else if(args[i]==='--variant')variantFilter=args[++i];else throw Error('Unknown argument '+args[i]);}
if(!process.env.QUAKED_THREE_MODULE||!process.env.QUAKED_CANVAS_MODULE)throw Error('Use existing Three and canvas runtime paths');
const three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE)).href;
register('data:text/javascript,'+encodeURIComponent("let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}"),{data:{three}});
const canvas=await import(pathToFileURL(process.env.QUAKED_CANVAS_MODULE).href);
class FileImage extends canvas.Image{set src(url){super.src=typeof url==='string'?readFileSync(url.split('?')[0]):url;}get src(){return super.src;}}
globalThis.Image=FileImage;globalThis.document={createElement:tag=>{if(tag!=='canvas')throw Error('Unexpected offline DOM '+tag);return canvas.createCanvas(1,1);}};
globalThis.fetch=async url=>{
 const path=String(url).split('?')[0];try{const data=await readFile(path);return new Response(data);}catch{return new Response(null,{status:404});}
};
const surface=await import('../src/gl_rsurf.js'),pak=await import('../src/pak.js'),model=await import('../src/gl_model.js'),vid=await import('../src/vid.js');
const textures=await import('../src/r_newertextures.js'),cvar=await import('../src/cvar.js'),{r_hdr}=await import('../src/gl_post.js');
const {NormalInputs,NormalInputKey,NormalGenerate}=await import('../src/normal_prepare.js'),{NormalBakeEncode,NormalBakeDecode,NORMAL_GENERATOR_VERSION}=await import('../src/normal_bake_format.js');
const members=await memberSearch(packs);for(const path of loose)members.set(path,{path,name:path,loose:true});
const palette=await memberSearch(['pak0.pak']);pak.COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(palette.get('gfx/palette.lmp'))));vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);vid.vid.fullbright=224;model.Mod_Init();model.R_InitTextures();cvar.Cvar_RegisterVariable(r_hdr);
let manifest;try{manifest=JSON.parse(await readFile('newer/normals/manifest.json','utf8'));}catch{manifest={version:NORMAL_GENERATOR_VERSION,samples:{},levels:{}};}
await mkdir('newer/normals',{recursive:true});
async function bake(texture){
 const input=NormalInputs(texture),key=await NormalInputKey(input),old=manifest.samples[key];const viewHash=v=>v?sha256(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)):null;
 const witness={width:input.width,height:input.height,crafted:input.crafted,derive:input.derive,strength:input.strength,cap:input.cap,rgba:viewHash(input.rgba),fullbright:viewHash(input.fullbright),scalar:viewHash(input.scalar),edge:input.edge?[input.edge.width,input.edge.height,input.edge.offset,viewHash(input.edge.data)]:null,authored:viewHash(input.authored)};if(old)old.input=witness;
 if(old){const saved=await readFile(old.file).catch(()=>null);if(saved&&sha256(saved)===old.sha256)return key;}
 const data=NormalGenerate(input),raw=NormalBakeEncode(key,input.width,input.height,data),decoded=NormalBakeDecode(raw.buffer,key,input.width,input.height);
 for(const name of ['pixels','scalar','reference'])if(data[name]&&!Buffer.from(data[name].buffer,data[name].byteOffset,data[name].byteLength).equals(Buffer.from(decoded[name].buffer,decoded[name].byteOffset,decoded[name].byteLength)))throw Error('Prepared normal roundtrip differs '+key+':'+name);
 const compressed=gzipSync(raw,{level:9}),file='newer/normals/'+key+'.nm.gz';await writeFile(file,compressed);manifest.samples[key]={file,input:witness,sha256:sha256(compressed),rawSha256:sha256(raw),width:input.width,height:input.height,bytes:raw.length,compressedBytes:compressed.length};return key;
}
for(const[name,entry]of members)if(!skins&&/^maps\/[^/]+\.bsp$/.test(name)&&new RegExp(filter).test(name)){
 cvar.Cvar_SetValue('r_hdr',0);model.Mod_ClearAll();const bytes=await readMember(entry);pak.COM_AddPack(isolatedPack(name,bytes));const world=model.Mod_ForName(name,true),keys=new Set(),nativeKeys=new Set(),upgradedKeys=new Set();
 for(const t of new Set([...(world.textures||[]),...(world.texinfo||[]).map(info=>info?.texture)]))if(t?.gl_texture&&!t.name.startsWith('*')&&!t.name.startsWith('sky')){const key=await bake(t.gl_texture);keys.add(key);nativeKeys.add(key);}
 cvar.Cvar_SetValue('r_hdr',1);textures.R_NewerTexturesForModel(world);
 const deadline=Date.now()+30000;while(!textures.R_NewerTexturesStatus(world).settled){if(Date.now()>deadline)throw Error('Native texture preparation timeout '+name);await new Promise(ok=>setTimeout(ok,10));}
 const status=textures.R_NewerTexturesStatus(world);if(Object.keys(status.errors).length)throw Error('Offline picture errors '+JSON.stringify(status.errors));
 for(const t of new Set([...(world.textures||[]),...(world.texinfo||[]).map(info=>info?.texture)]))if(t?.gl_texture&&!t.name.startsWith('*')&&!t.name.startsWith('sky')){const key=await bake(t.gl_texture);keys.add(key);upgradedKeys.add(key);}
 manifest.levels[namespace+':'+name]={bspSha256:sha256(bytes),keys:[...keys],nativeKeys:[...nativeKeys],upgradedKeys:[...upgradedKeys]};
 await writeFile('newer/normals/manifest.json',JSON.stringify(manifest,null,2)+'\n');await writeFile('src/normal_bakes.js','// Generated exact normal/scalar samples; full input identity.\nexport const NORMAL_BAKES = '+JSON.stringify(Object.fromEntries(Object.entries(manifest.samples).map(([key,{input,...spec}])=>[key,spec])),null,1)+';\n');console.log('BAKED NORMALS '+namespace+':'+name+' '+keys.size+' input variants');
}

if(skins){
 const THREE=await import('three'),{ENEMY_SKIN_MODELS}=await import('../src/r_newerskins.js'),skinIndex=JSON.parse(await readFile('newer/enemies/index.json','utf8'));
 const runsCustom=namespace==='shareware'||variantFilter!==null;
 const selectedVariants=runsCustom?Object.entries(skinIndex.models||{}).flatMap(([key,variants])=>ENEMY_SKIN_MODELS.has(key)&&new RegExp(filter).test('progs/'+key+'.mdl')?variants.filter(variant=>variantFilter===null||variant.dir===variantFilter).map(variant=>({key,variant})):[]):[];
 if(variantFilter!==null&&!selectedVariants.length)throw Error('No matching custom skin variant: '+variantFilter);
 const eligibleCustom=new Set();
 for(const {key,variant}of selectedVariants){
  if(variant.nativeModelSha256){const native=members.get('progs/'+key+'.mdl'),matches=!!native&&sha256(await readMember(native))===variant.nativeModelSha256;if(!matches){if(variantFilter!==null)throw Error('Native identity mismatch for constrained skin '+variant.dir);continue;}}
  eligibleCustom.add(variant);
 }
 const image=async path=>{const img=new FileImage();if(path==='newer/enemies/ogre/custom/diffuse.webp'){const original=spawnSync('git',['show','HEAD:'+path],{maxBuffer:16*1024*1024});if(original.status!==0)throw Error('Cannot retain scoped Ogre source');img.src=original.stdout;}else img.src=path;await img.decode();const c=canvas.createCanvas(img.width,img.height),ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:img.width,height:img.height,data:ctx.getImageData(0,0,img.width,img.height).data};};
 const companion=(pixels,height,strength=.65,cap=.55)=>{const t=new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);t.userData.newerHeight={width:pixels.width,height:pixels.height,derive:!height,data:height?Float32Array.from({length:height.width*height.height},(_,i)=>height.data[i*4]/255):undefined,strength,cap};return t;};
 for(const[name,entry]of members)if(/^progs\/[^/]+\.mdl$/.test(name)&&new RegExp(filter).test(name)){
  const key=name.slice(6,-4);if(!ENEMY_SKIN_MODELS.has(key))continue;
  const bytes=await readMember(entry);pak.COM_AddPack(isolatedPack(name,bytes));const hdr=model.Mod_ForName(name,true).cache.data,keys=new Set();
  for(let skin=0;skin<hdr.numskins;skin++)for(let frame=0;frame<4;frame++){
   const t=hdr.gl_texturenum[skin][frame];if(!t?.image?.data)continue;
   keys.add(await bake(companion(t.image,null)));
   const list=skinIndex.nativeHeights?.[key]?.[skin]||skinIndex.nativeHeights?.[key]?.[0];
   const stored=list?.length?(list.length<=4?list[frame%list.length]:list.filter((_,i)=>(i&3)===frame).at(-1)):null;
   if(stored){const h=await image('newer/enemies/'+stored.file);if(h.width===t.image.width&&h.height===t.image.height)keys.add(await bake(companion(t.image,h,stored.strength,stored.cap)));}
  }
  manifest.levels[namespace+':'+name]={modelSha256:sha256(bytes),keys:[...keys]};console.log('BAKED SKIN NORMALS '+namespace+':'+name+' '+keys.size+' variants');
 }
 if(namespace==='shareware'||variantFilter!==null)for(const[key,variants]of Object.entries(skinIndex.models||{}))if(ENEMY_SKIN_MODELS.has(key)&&new RegExp(filter).test('progs/'+key+'.mdl'))for(const variant of variants){
  if(!eligibleCustom.has(variant))continue;
  if(!variant.maps.diffuse||!variant.maps.height)continue;
  const diffuse=await image('newer/enemies/'+variant.dir+'/'+variant.maps.diffuse),height=await image('newer/enemies/'+variant.dir+'/'+variant.maps.height);
  if(diffuse.width!==height.width||diffuse.height!==height.height)throw Error('Canonical enemy height alignment mismatch '+key);
  const input=await bake(companion(diffuse,height,variant.heightStrength??.65,variant.heightCap??.55));manifest.levels['custom:'+variant.dir]={keys:[input]};console.log('BAKED CUSTOM NORMALS '+variant.dir);
 }
 await writeFile('newer/normals/manifest.json',JSON.stringify(manifest,null,2)+'\n');await writeFile('src/normal_bakes.js','// Generated exact normal/scalar samples; full input identity.\nexport const NORMAL_BAKES = '+JSON.stringify(Object.fromEntries(Object.entries(manifest.samples).map(([key,{input,...spec}])=>[key,spec])),null,1)+';\n');
}
