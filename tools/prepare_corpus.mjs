// Explicit owned/bundled corpus. Each map runs in a fresh bounded child, so a
// large campaign cannot leave every native model/lightmap resident in memory.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {memberSearch,readMember,sha256} from './pak_members.mjs';
const campaigns=[
 {namespace:'shareware',packs:['pak0.pak']},
 {namespace:'newer',packs:['newer/maps.pak']},
 ...['id1','hipnotic','rogue','dopa','mg1'].map(namespace=>({namespace,packs:['resources/'+namespace+'/pak0.pak']}))
];
const mode=process.argv[2]||'inventory';
if(!['inventory','sculpt','rock','normals'].includes(mode))throw Error('Use inventory, sculpt, rock or normals');
const inventory={version:1,skipped:[{campaign:'Dawn of the Machine',reason:'Owner does not have the pack; explicitly deferred'}],levels:[]};
for(const campaign of campaigns){
 const entries=await memberSearch(campaign.packs);
 for(const[name,entry]of entries)if(/^maps\/[^/]+\.bsp$/.test(name)){
  const bytes=await readMember(entry);inventory.levels.push({...campaign,name,bspSha256:sha256(bytes),bytes:bytes.length,bspVersion:bytes.readUInt32LE(0)});
 }
}
for(const file of (await readdir('maps')).filter(n=>n.endsWith('.bsp'))){const bytes=await readFile('maps/'+file);inventory.levels.push({namespace:'loose',packs:[],name:'maps/'+file,loose:'maps/'+file,bspSha256:sha256(bytes),bytes:bytes.length,bspVersion:bytes.readUInt32LE(0)});}
await writeFile('newer/displacement/corpus.json',JSON.stringify(inventory,null,2)+'\n');
const identities={};for(const level of inventory.levels)(identities[level.name]??=[]).push(level.bspSha256);
await writeFile('src/prepared_corpus.js','// Generated from the explicit bundled/owned BSP inventory; Dawn is deferred.\nexport const PREPARED_CORPUS = '+JSON.stringify(identities,null,1)+';\n');
console.log('INVENTORY '+inventory.levels.length+' BSP identities; Dawn explicitly skipped');
if(mode!=='inventory')for(const level of inventory.levels){
 const args=[mode==='sculpt'?'tools/bake_displacement.mjs':mode==='rock'?'tools/bake_rockfield.mjs':'tools/bake_normals.mjs','--namespace',level.namespace,'--maps','^'+level.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$'];
 for(const pack of level.packs)args.push('--pack',pack);if(level.loose)args.push('--loose',level.loose);
 const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});
 await new Promise((ok,fail)=>{child.on('error',fail);child.on('exit',code=>code===0?ok():fail(Error(mode+' failed for '+level.namespace+':'+level.name+' ('+code+')')));});
}
