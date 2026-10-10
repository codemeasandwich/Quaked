// Reproduce the runtime's polygons/charts and generator; no art or BSP edits.
// QUAKED_THREE_MODULE points to the existing Three 0.183 module, no downloads.
import {register} from 'node:module';
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {memberSearch,readMember,isolatedPack} from './pak_members.mjs';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {RockBakeConfig,RockBakeTileCoordinates,RockBakeEncode,ROCK_BAKE_VERSION} from '../src/newer/assets/rockfield_bake_format.js';
if(!isMainThread){
 const {createField,generateTile}=await import('../src/newer/assets/rockfield.js'),THREE=await import(workerData.three);let key,field;
 parentPort.on('message',({id,config,x,y})=>{try{const next=JSON.stringify(config);if(key!==next){key=next;field=createField(config);}const tile=generateTile(field,x,y),half=new Uint16Array(tile.data.length);for(let i=0;i<half.length;i++)half[i]=THREE.DataUtils.toHalfFloat(tile.data[i]);parentPort.postMessage({id,half},[half.buffer]);}catch(error){parentPort.postMessage({id,error:String(error.stack||error)});}});
}else{
 const three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE||'')).href;
 if(!process.env.QUAKED_THREE_MODULE)throw new Error('Set QUAKED_THREE_MODULE');
 const loader="let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}";
 register('data:text/javascript,'+encodeURIComponent(loader),{data:{three}});
 const surface=await import('../src/engine/render/gl_rsurf.js'),pak=await import('../src/engine/common/pak.js'),model=await import('../src/engine/render/gl_model.js'),vid=await import('../src/engine/render/vid.js'),{cl}=await import('../src/engine/client/client.js'),{R_RockSurfaceCharts}=await import('../src/newer/render/r_rocksurfaces.js');
 const args=process.argv.slice(2),packs=[],loose=[];let namespace='bundled',filter='.*',planOnly=false;
 for(let i=0;i<args.length;i++){if(args[i]==='--pack')packs.push(args[++i]);else if(args[i]==='--namespace')namespace=args[++i];else if(args[i]==='--maps')filter=args[++i];else if(args[i]==='--loose')loose.push(args[++i]);else if(args[i]==='--plan')planOnly=true;else throw Error('Unknown argument '+args[i]);}
 if(!/^[a-z0-9-]+$/.test(namespace))throw Error('Invalid namespace');
 if(!packs.length&&!loose.length){packs.push(...(await readdir('.')).filter(name=>/^pak\d+\.pak$/.test(name)).sort());loose.push(...(await readdir('maps')).filter(name=>name.endsWith('.bsp')).map(n=>'maps/'+n));}
 const members=await memberSearch(packs);for(const path of loose)members.set(path,{loose:true,path,name:path});
 const names=new Set([...members.keys()].filter(name=>/^maps\/[^/]+\.bsp$/.test(name)&&new RegExp(filter).test(name))),sources={};
 const palette=await memberSearch(['pak0.pak']);pak.COM_AddPack(isolatedPack('gfx/palette.lmp',await readMember(palette.get('gfx/palette.lmp'))));
 vid.VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);model.Mod_Init();model.R_InitTextures();
 const sourceFiles=['src/newer/assets/rockfield.js','src/newer/assets/rockfield_presets.js','src/newer/render/r_rocksurfaces.js','src/newer/assets/rockfield_bake_format.js'];for(const name of sourceFiles)sources[name]=createHash('sha256').update(await readFile(name)).digest('hex');
 const plans=[];
 for(const name of [...names].sort()){
  model.Mod_ClearAll();const bytes=await readMember(members.get(name));pak.COM_AddPack(isolatedPack(name,bytes));const world=model.Mod_ForName(name,true);cl.worldmodel=world;cl.model_precache[1]=world;cl.model_precache[2]=null;surface.GL_BuildLightmaps();
  const charts=R_RockSurfaceCharts(world,{includeBrushes:true}).charts;plans.push({name,charts,tiles:charts.reduce((n,c)=>n+RockBakeTileCoordinates(c).length,0),bspSha256:createHash('sha256').update(pak.COM_FindFile(name).data).digest('hex')});
 }
 if(planOnly){console.log(JSON.stringify(plans.map(({name,charts,tiles})=>({name,charts:charts.length,tiles})),null,2));}
 else{
  await mkdir('newer/rockfield/'+namespace,{recursive:true});const workers=Array.from({length:2},()=>new Worker(new URL(import.meta.url),{workerData:{three}})),manifest=JSON.parse(await readFile('newer/rockfield/manifest.json','utf8'));manifest.sources=sources;const generatorFingerprint=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  try{for(const plan of plans){
   const old=manifest.levels[plan.name],previous=(Array.isArray(old)?old:[old]).find(s=>s?.namespace===namespace&&s.bspSha256===plan.bspSha256&&s.generatorFingerprint===generatorFingerprint);
   if(previous){const saved=await readFile(previous.file).catch(()=>null);if(saved&&createHash('sha256').update(saved).digest('hex')===previous.sha256){console.log('REUSED '+namespace+':'+plan.name);continue;}}

   const jobs=plan.charts.flatMap(chart=>RockBakeTileCoordinates(chart).map(([x,y])=>({config:RockBakeConfig(chart),x,y}))),results=new Array(jobs.length);let next=0;
   await Promise.all(workers.map(worker=>new Promise((ok,fail)=>{let active;
    const cleanup=()=>{worker.off('message',message);worker.off('error',error);};
    const dispatch=()=>{if(next===jobs.length){cleanup();ok();return;}active=next++;worker.postMessage({id:active,...jobs[active]});};
    const error=e=>{cleanup();fail(e);};const message=result=>{if(result.error){error(new Error(result.error));return;}if(result.id!==active){error(new Error('Bake worker job mismatch'));return;}results[active]=result.half;dispatch();};worker.on('message',message);worker.on('error',error);dispatch();
   })));
   const bytes=RockBakeEncode(plan.name,plan.charts,results,{bspSha256:plan.bspSha256}),compressed=gzipSync(bytes,{level:9}),file='newer/rockfield/'+namespace+'/'+plan.name.slice(5,-4)+'.rf.gz';await writeFile(file,compressed);
   const spec={file,namespace,generatorFingerprint,charts:plan.charts.length,tiles:jobs.length,bytes:bytes.length,compressedBytes:compressed.length,bspSha256:plan.bspSha256,sha256:createHash('sha256').update(compressed).digest('hex'),rawSha256:createHash('sha256').update(bytes).digest('hex')};manifest.levels[plan.name]=(Array.isArray(old)?old:old?[old]:[]).filter(s=>s.namespace!==namespace&&s.bspSha256!==spec.bspSha256).concat(spec);
   delete manifest.sourcesNote;await writeFile('newer/rockfield/manifest.json',JSON.stringify(manifest,null,2)+'\n');await writeFile('src/newer/assets/rockfield_bakes.js','/**\n * @module newer/assets/rockfield_bakes\n *\n * Prepared rock relief, generated by `tools/bake_rockfield.mjs` (do not edit: re-run the tool).\n *\n * Types: plain values and functions; no exported classes.\n *\n * State: no mutable exports.\n *\n * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).\n */\n// Generated by tools/bake_rockfield.mjs; rebuild after field/chart/preset changes.\nexport const ROCK_BAKES = '+JSON.stringify(manifest.levels,null,1)+';\n');
   console.log('BAKED '+plan.name+' '+jobs.length+' tiles '+compressed.length+' bytes');
  }}finally{await Promise.all(workers.map(worker=>worker.terminate()));}
  delete manifest.sourcesNote;await writeFile('newer/rockfield/manifest.json',JSON.stringify(manifest,null,2)+'\n');
  await writeFile('src/newer/assets/rockfield_bakes.js','/**\n * @module newer/assets/rockfield_bakes\n *\n * Prepared rock relief, generated by `tools/bake_rockfield.mjs` (do not edit: re-run the tool).\n *\n * Types: plain values and functions; no exported classes.\n *\n * State: no mutable exports.\n *\n * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).\n */\n// Generated by tools/bake_rockfield.mjs; rebuild after field/chart/preset changes.\nexport const ROCK_BAKES = '+JSON.stringify(manifest.levels,null,1)+';\n');
 }
}
