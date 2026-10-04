// Reproduce the runtime's polygons/charts and generator; no art or BSP edits.
// QUAKED_THREE_MODULE points to the existing Three 0.183 module, no downloads.
import {register} from 'node:module';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {RockBakeConfig,RockBakeTileCoordinates,RockBakeEncode,ROCK_BAKE_VERSION} from '../src/rockfield_bake_format.js';
if(!isMainThread){
 const {createField,generateTile}=await import('../src/rockfield.js'),THREE=await import(workerData.three);let key,field;
 parentPort.on('message',({id,config,x,y})=>{try{const next=JSON.stringify(config);if(key!==next){key=next;field=createField(config);}const tile=generateTile(field,x,y),half=new Uint16Array(tile.data.length);for(let i=0;i<half.length;i++)half[i]=THREE.DataUtils.toHalfFloat(tile.data[i]);parentPort.postMessage({id,half},[half.buffer]);}catch(error){parentPort.postMessage({id,error:String(error.stack||error)});}});
}else{
 const three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE||'')).href;
 if(!process.env.QUAKED_THREE_MODULE)throw new Error('Set QUAKED_THREE_MODULE');
 const loader="let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}";
 register('data:text/javascript,'+encodeURIComponent(loader),{data:{three}});
 const surface=await import('../src/gl_rsurf.js'),pak=await import('../src/pak.js'),model=await import('../src/gl_model.js'),vid=await import('../src/vid.js'),{cl}=await import('../src/client.js'),{R_RockSurfaceCharts}=await import('../src/r_rocksurfaces.js');
 const names=new Set(),sources={};
 for(const filename of (await readdir('.')).filter(name=>/^pak\d+\.pak$/.test(name)).sort()){
  const raw=await readFile(filename),pack=pak.COM_LoadPackFile(filename,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length));pak.COM_AddPack(pack);
  for(const file of pack.files)if(/^maps\/[^/]+\.bsp$/.test(file.name))names.add(file.name);
 }
 for(const filename of (await readdir('maps')).filter(name=>name.endsWith('.bsp'))){const name='maps/'+filename,raw=await readFile(name);const previousFetch=globalThis.fetch;try{globalThis.fetch=async()=>new Response(raw);await pak.COM_PreloadLooseFile(name,name);}finally{globalThis.fetch=previousFetch;}names.add(name);}
 vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);model.Mod_Init();
 const sourceFiles=['src/rockfield.js','src/rockfield_presets.js','src/r_rocksurfaces.js','src/rockfield_bake_format.js'];for(const name of sourceFiles)sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
 const plans=[];
 for(const name of [...names].sort()){
  const world=model.Mod_ForName(name,true);cl.worldmodel=world;cl.model_precache[1]=world;cl.model_precache[2]=null;surface.GL_BuildLightmaps();
  const charts=R_RockSurfaceCharts(world,{includeBrushes:true}).charts;plans.push({name,charts,tiles:charts.reduce((n,c)=>n+RockBakeTileCoordinates(c).length,0),bspSha256:createHash('sha256').update(pak.COM_FindFile(name).data).digest('hex')});
 }
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plans.map(({name,charts,tiles})=>({name,charts:charts.length,tiles})),null,2));}
 else{
  await mkdir('newer/rockfield',{recursive:true});const workers=Array.from({length:2},()=>new Worker(new URL(import.meta.url),{workerData:{three}})),manifest={version:ROCK_BAKE_VERSION,sources,levels:{}};
  try{for(const plan of plans){
   const jobs=plan.charts.flatMap(chart=>RockBakeTileCoordinates(chart).map(([x,y])=>({config:RockBakeConfig(chart),x,y}))),results=new Array(jobs.length);let next=0;
   await Promise.all(workers.map(worker=>new Promise((ok,fail)=>{let active;
    const cleanup=()=>{worker.off('message',message);worker.off('error',error);};
    const dispatch=()=>{if(next===jobs.length){cleanup();ok();return;}active=next++;worker.postMessage({id:active,...jobs[active]});};
    const error=e=>{cleanup();fail(e);};const message=result=>{if(result.error){error(new Error(result.error));return;}if(result.id!==active){error(new Error('Bake worker job mismatch'));return;}results[active]=result.half;dispatch();};worker.on('message',message);worker.on('error',error);dispatch();
   })));
   const bytes=RockBakeEncode(plan.name,plan.charts,results),compressed=gzipSync(bytes,{level:9}),file='newer/rockfield/'+plan.name.slice(5,-4)+'.rf.gz';await writeFile(file,compressed);
   manifest.levels[plan.name]={file,charts:plan.charts.length,tiles:jobs.length,bytes:bytes.length,compressedBytes:compressed.length,bspSha256:plan.bspSha256,sha256:createHash('sha256').update(compressed).digest('hex'),rawSha256:createHash('sha256').update(bytes).digest('hex')};
   console.log('BAKED '+plan.name+' '+jobs.length+' tiles '+compressed.length+' bytes');
  }}finally{await Promise.all(workers.map(worker=>worker.terminate()));}
  await writeFile('newer/rockfield/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  await writeFile('src/rockfield_bakes.js','// Generated by tools/bake_rockfield.mjs; rebuild after field/chart/preset changes.\nexport const ROCK_BAKES = '+JSON.stringify(manifest.levels,null,1)+';\n');
 }
}
