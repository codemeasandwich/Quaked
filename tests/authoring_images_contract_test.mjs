import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ResourcePath,ResourceLogicalPath} from '../src/platform/resource_paths.js';
import {collectAssets} from '../tools/distribution/manifest.mjs';

const root=new URL('../',import.meta.url);
const record=JSON.parse(await readFile(new URL('docs/evidence/authoring-images-assets-2026-10-18/relocation.json',root)));
const image=/\.(png|jpe?g|webp|gif|svg|avif|tiff?|bmp|hdr|exr|ktx2?)$/i;

test('every relocated image has one canonical file with its original byte identity',async()=>{
 for(const row of record.images){
  assert.equal(ResourcePath(row.logical),row.path);
  assert.equal(ResourceLogicalPath(row.path),row.logical);
  assert.equal(await access(new URL(row.logical,root)).then(()=>true,()=>false),false,row.logical);
  const bytes=await readFile(new URL(row.path,root));
  assert.equal(bytes.length,row.bytes,row.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,row.path);
 }
});

test('tools retain their code and records while authoring images stay under assets',async()=>{
 async function inspect(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
   if(['node_modules','__pycache__','.git'].includes(entry.name))continue;
   const path=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
   if(entry.isDirectory())await inspect(path);
   else assert(!image.test(entry.name),'image remains under tools: '+path.pathname);
  }
 }
 await inspect(new URL('tools/',root));
 for(const row of record.preservedRecords)assert.equal(ResourcePath(row.path),row.path,'script/record redirected: '+row.path);
});

test('retained fitting recipes still resolve their exact source image bytes',async()=>{
 for(const row of record.preservedRecords.filter(row=>row.path.endsWith('.json'))){
  const value=JSON.parse(await readFile(new URL(row.path,root)));
  if(typeof value.sourceFile!=='string'||!value.sourceFile.startsWith('tools/texture_sheets/sources/'))continue;
  const bytes=await readFile(new URL(ResourcePath(value.sourceFile),root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),value.sourceSha,row.path);
 }
});

test('neither distribution includes authoring images or retained source records',async()=>{
 for(const profile of ['web','desktop']){
  const files=await collectAssets({profile,root:root.pathname});
  assert(!files.some(path=>path.startsWith('assets/authoring/')||path.startsWith('tools/texture_sheets/sources/')));
 }
});

test('public HTTP image aliases, ranges and owned-game boundaries remain valid',()=>{
 const result=spawnSync(process.env.QUAKED_PYTHON??'python3',['tests/resource_http_test.py'],{
  cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(result.status,0,result.stdout+result.stderr+(result.error?.message??''));
});
