// Reproducible prepared decorative geometry. Never edits game/source archives.
// --pack may be repeated in native search-path order; --namespace names output.
// QUAKED_THREE_MODULE supplies the existing installed Three module.
import {register} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {memberSearch,readMember,isolatedPack} from './pak_members.mjs';
import {DEMON_TEXTURES,R_DemonSurfaceData,DEMON_GENERATOR_VERSION} from '../src/r_demonrelief.js';
import {DemonBakeEncode,DemonBakeDecode,DemonSurfaceSignature,DemonFieldSettings} from '../src/demon_bake_format.js';
const args=process.argv.slice(2),packs=[],loose=[];let namespace='base',filter='.*';
for(let i=0;i<args.length;i++){if(args[i]==='--pack')packs.push(args[++i]);else if(args[i]==='--namespace')namespace=args[++i];else if(args[i]==='--maps')filter=args[++i];else if(args[i]==='--loose')loose.push(args[++i]);else throw Error('Unknown argument '+args[i]);}
if(!/^[a-z0-9-]+$/.test(namespace)||(!packs.length&&!loose.length)||!process.env.QUAKED_THREE_MODULE)throw Error('Provide --namespace, --pack and QUAKED_THREE_MODULE');
const three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE)).href;
register('data:text/javascript,'+encodeURIComponent("let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}"),{data:{three}});
const surface=await import('../src/gl_rsurf.js'),pak=await import('../src/engine/common/pak.js'),model=await import('../src/gl_model.js'),vid=await import('../src/vid.js'),{cl}=await import('../src/client.js');
const sha=b=>createHash('sha256').update(b).digest('hex'),names=new Set(),archives=[];
const members=await memberSearch(packs);for(const path of loose)members.set(path,{loose:true,path,name:path});const palette=await memberSearch(['pak0.pak']);
pak.COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(palette.get('gfx/palette.lmp'))));
for(const [name,entry] of members)if(/^maps\/[^/]+\.bsp$/.test(name)&&new RegExp(filter).test(name))names.add(name);
for(const path of packs)archives.push({path});
vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);model.Mod_Init();model.R_InitTextures();
const manifestPath='newer/displacement/manifest.json';let manifest;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch{manifest={version:1,sources:{},levels:{}};}
for(const path of ['src/r_demonrelief.js','src/demon_bake_format.js','src/gl_model.js','src/gl_rsurf.js','newer/textures/index.json','newer/textures/normals/demon-face.r16'])manifest.sources[path]=sha(await readFile(path));
const generatorFingerprint=sha(new TextEncoder().encode(JSON.stringify(manifest.sources)));
const recipes=JSON.parse(await readFile('newer/textures/index.json','utf8')).normals,fields=new Map();
for(const name of DEMON_TEXTURES){const recipe=recipes[name];if(!recipe?.displacement||!recipe.dataFile)throw Error('Missing exact saved scalar recipe '+name);
 const raw=await readFile('newer/textures/'+recipe.dataFile);const w=256,h=512;if(raw.length!==w*h*2)throw Error('Unexpected scalar dimensions');
 const field={width:w,height:h,data:Float32Array.from({length:w*h},(_,i)=>raw.readUInt16LE(i*2)/65535),sampling:recipe.sampling,displacement:{...recipe.displacement}};fields.set(name,field);
}
await mkdir('newer/displacement/'+namespace,{recursive:true});
for(const name of [...names].sort()){
 model.Mod_ClearAll();const bytes=await readMember(members.get(name)),bspSha256=sha(bytes);pak.COM_AddPack(isolatedPack(name,bytes));const previous=manifest.levels[name]?.find(s=>s.namespace===namespace&&s.bspSha256===bspSha256&&s.generatorFingerprint===generatorFingerprint);if(previous){const saved=await readFile(previous.file).catch(()=>null);if(saved&&sha(saved)===previous.sha256){console.log('REUSED '+namespace+':'+name);continue;}}const header=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getInt32(0,true);if(![29,0x32505342,0x42535032].includes(header))throw Error('Unsupported native BSP version '+header+' in '+name);
 const world=model.Mod_ForName(name,true);cl.worldmodel=world;cl.model_precache[1]=world;cl.model_precache[2]=null;surface.GL_BuildLightmaps();
 const records=[];for(let id=0;id<world.surfaces.length;id++){
  const original=world.surfaces[id],field=fields.get(original.texinfo.texture.name);if(!field)continue;
  const face={...original,texinfo:{...original.texinfo,texture:{...original.texinfo.texture,gl_texture:{userData:{newerHeight:field}}}}},diagnostic={},data=R_DemonSurfaceData(face,diagnostic);
  if(!data&&!diagnostic.reason)throw Error('Bundled sculpt face exceeds supported generation contract '+name+':'+id);
  records.push({surfaceId:id,signature:DemonSurfaceSignature(face),fieldSha256:sha(field.data),settings:DemonFieldSettings(field),data,...(!data?{nativeOnly:diagnostic}:{})});
 }
 const raw=DemonBakeEncode({model:name,bspSha256,namespace,archives,generatorVersion:DEMON_GENERATOR_VERSION},records),decoded=DemonBakeDecode(raw.buffer,name,bspSha256,{compact:true});
 for(const record of records){const actual=decoded.records.get(record.signature)?.data;
  if(record.nativeOnly){if(!decoded.records.get(record.signature)?.nativeOnly)throw Error('Native-only outcome missing');continue;}
  if(!actual||actual.indices.length!==record.data.positions.length/3)throw Error('Roundtrip count changed');
  const keys=['positions','normals','uvs','lmuvs'],widths=[3,3,2,2],offsets=[0,3,6,8];
  for(let i=0;i<actual.indices.length;i++)for(let a=0;a<4;a++)for(let k=0;k<widths[a];k++)if(!Object.is(actual.interleaved[actual.indices[i]*10+offsets[a]+k],record.data[keys[a]][i*widths[a]+k]))throw Error('Roundtrip changed '+name+':'+record.surfaceId+':'+keys[a]);
 }

 const compressed=gzipSync(raw,{level:9}),file='newer/displacement/'+namespace+'/'+name.slice(5,-4)+'.dm.gz';await writeFile(file,compressed);
 const spec={file,generatorFingerprint,generatorVersion:DEMON_GENERATOR_VERSION,bspSha256,sha256:sha(compressed),rawSha256:sha(raw),surfaces:records.length,nativeOnly:records.filter(r=>r.nativeOnly).length,triangles:records.reduce((n,r)=>n+(r.data?.triangles||0),0),bytes:raw.length,compressedBytes:compressed.length,namespace};
 const existing=manifest.levels[name]||[];manifest.levels[name]=existing.filter(s=>s.namespace!==namespace).concat(spec);console.log('BAKED '+name+' '+records.length+' sculpt surfaces '+compressed.length+' bytes');
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');await writeFile('src/demon_bakes.js','// Generated by tools/bake_displacement.mjs. BSP content identity separates campaigns.\nexport const DEMON_BAKES = '+JSON.stringify(manifest.levels,null,1)+';\n');
}
