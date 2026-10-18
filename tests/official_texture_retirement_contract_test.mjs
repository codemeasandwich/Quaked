/** Accepted assets remain usable after removal of disposable draft rasters. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {assetPath} from '../tools/distribution/manifest.mjs';
const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(assetPath(root,path));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const accepted=JSON.parse(await read('tests/fixtures/official-textures.json'));
const index=JSON.parse(await read('newer/textures/index.json'));

test('dated candidate folders are absent; accepted selections point to official assets',async()=>{
 assert.equal((await readdir(resolve(root,'assets/game/textures'))).filter(name=>name.startsWith('candidates-')).length,0);
 assert.equal(accepted.entries.length,114);
 assert.equal(Object.keys(accepted.encodingReceipts).length,111);
 assert.ok(!JSON.stringify(index).includes('candidates-'));
 for(const spec of Object.values(accepted.trials)){
  for(const file of [spec.file,spec.height,...Object.values(spec.normalChannels??{})])assert.ok(file.startsWith('official/'),file);
  assert.ok(!spec.original.includes('candidates-'),spec.original);
 }
});

test('every accepted binding and all five official map hashes survive candidate removal',async()=>{
 const files=new Set();
 for(const e of accepted.entries){
  const binding=index.ordinaryVariants?.[e.name]?.[e.key]??{file:index.textures[e.name],normal:index.normals[e.name]};
  assert.deepEqual(binding,e.binding,e.name);
  const metadata=await read(e.metadataFile);assert.equal(sha(metadata),e.metadataSha256,e.name+' metadata');
  const encoded=JSON.parse(metadata);assert.deepEqual([encoded.factor,encoded.quality,encoded.lossless],[4,92,false]);
  const maps={diffuse:e.binding.file,height:e.binding.normal.file,...Object.fromEntries(Object.entries(e.binding.normal.normalChannels).map(([axis,path])=>['normal'+axis.toUpperCase(),path]))};
  for(const[role,file]of Object.entries(maps)){
   const bytes=await read('newer/textures/'+file);files.add(file);
   assert.equal(sha(bytes),encoded.outputs[role].sha256,e.name+' '+role);
   assert.ok(bytes.includes(Buffer.from('VP8 ')),file+' lossy payload');
   assert.deepEqual(encoded.outputs[role].dimensions,[e.source.width*4,e.source.height*4]);
  }
 }
 assert.equal(files.size,555);
});

test('comparison references remain the exact original native game extractions',async()=>{
 for(const e of accepted.entries)assert.equal(sha(await read(e.sourceFile)),e.sourceFileSha256,e.name+' original');
 for(const[alias,spec]of Object.entries(accepted.trials))assert.equal(sha(await read(spec.original)),spec.originalSha256,alias+' original');
});
