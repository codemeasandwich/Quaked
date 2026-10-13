import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
// The 4x art standard (docs/texture-standard-4x-2026-10-12.md): every file a plan resampled is
// still exactly what the plan recorded, and a resampled skin's SOURCE.json names both the fit it
// came from (standard4x.fitFiles = the plan's "before") and the shipped file (files = "after").
const PLANS='tools/texture_sheets/sources/standard-4x';
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
test('resampled files are exactly what their 4x plan recorded, and skin provenance agrees',async()=>{
 const plans=(await readdir(PLANS)).filter(name=>name.endsWith('.json')).sort();
 assert.ok(plans.length>=2,'batch records present');
 let checked=0;
 for(const name of plans){
  const plan=JSON.parse(await readFile(join(PLANS,name),'utf8'));
  for(const result of plan.results??[]){
   if(!result.after)continue;
   assert.equal(await sha(result.file),result.after.sha256,`${name}: ${result.file} changed since its 4x record`);
   const [w,h]=result.target;assert.deepEqual(result.after.size,[w,h],`${name}: ${result.file} recorded at its 4x target`);
   if(/^newer\/enemies\/.+\/diffuse\.(webp|png)$/.test(result.file)){
    // Skins without provenance (the batch-1 items and monsters) have only the plan record.
    const text=await readFile(join(dirname(result.file),'SOURCE.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    const source=text&&JSON.parse(text),file=result.file.split('/').at(-1);
    if(source){
     // A resampled skin with provenance must say so: shipped and fit identities both recorded.
     assert.ok(source.standard4x,`${result.file}: SOURCE.json records the 4x resample (standard4x)`);
     assert.equal(source.standard4x.record,join(PLANS,name),`${result.file}: SOURCE.json names its 4x record`);
     assert.deepEqual(source.standard4x.fitDimensions,result.before.size,`${result.file}: SOURCE.json fit dimensions are the plan's before`);
     assert.equal(source.standard4x.fitFiles?.[file],result.before.sha256,`${result.file}: SOURCE.json fit digest is the plan's before`);
     assert.equal(source.files?.[file],result.after.sha256,`${result.file}: SOURCE.json shipped digest is the plan's after`);
     assert.deepEqual(source.dimensions,result.after.size,`${result.file}: SOURCE.json dimensions are the shipped size`);
     assert.equal(source.factor,4,`${result.file}: SOURCE.json factor is the shipped 4x`);
    }
   }
   checked++;
  }
 }
 assert.ok(checked>0,'at least one resampled file checked');
});
