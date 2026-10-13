import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,isAbsolute,join} from 'node:path';
// Historical before/after resample receipts remain immutable. A later reviewed native refit
// may explicitly succeed a receipt; it must independently pin and verify its source, model,
// recipe, provenance and both current maps at 4x. All other receipts retain the original gate.
const PLANS='tools/texture_sheets/sources/standard-4x';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=async(path,read=readFile)=>digest(await read(path));
const json=async(path,read)=>JSON.parse(await read(path,'utf8'));
function sourcePath(path){
 assert.equal(typeof path,'string','source path is explicit');
 assert.ok(!isAbsolute(path)&&!path.includes('\\')&&!path.split('/').some(p=>p==='.'||p==='..'),'source path stays within repository');
 assert.ok(path.startsWith('tools/texture_sheets/sources/'),'reviewed source/recipe is in the source catalogue');
 return path;
}
function imageSize(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.toString('ascii',12,16)==='IHDR')return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
 assert.ok(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','successor map is an actual PNG or WebP');
 for(let offset=12;offset+8<=bytes.length;){
  const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
  assert.ok(start+length<=bytes.length,'complete WebP chunk');
  if(kind==='VP8L'){assert.ok(length>=5&&bytes[start]===0x2f,'lossless WebP header');const bits=bytes.readUInt32LE(start+1);return[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
  if(kind==='VP8X'){assert.ok(length>=10,'extended WebP header');return[bytes.readUIntLE(start+4,3)+1,bytes.readUIntLE(start+7,3)+1];}
  if(kind==='VP8 '){assert.ok(length>=10&&bytes.toString('hex',start+3,start+6)==='9d012a','lossy WebP key frame');return[bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff];}
  offset=start+length+(length&1);
 }
 assert.fail('WebP dimensions unavailable');
}
// Q92 is an authoring intent, not recoverable from the compressed bitstream.
// Verify that intent separately from the actual lossy VP8 payload and dimensions.
function runtimeWebpSize(bytes){
 assert.ok(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP','renamed runtime map is actual WebP');
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,'complete runtime WebP container');
 let dimensions=null,extended=null;
 for(let offset=12;offset+8<=bytes.length;){
  const kind=bytes.toString('ascii',offset,offset+4),length=bytes.readUInt32LE(offset+4),start=offset+8;
  assert.ok(start+length<=bytes.length,'complete runtime WebP chunk');
  assert.notEqual(kind,'VP8L','Q92 runtime map must use lossy VP8');
  if(kind==='VP8 '){assert.ok(length>=10&&bytes.toString('hex',start+3,start+6)==='9d012a','actual lossy VP8 key frame');assert.equal(dimensions,null,'one runtime VP8 payload');dimensions=[bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff];}
  if(kind==='VP8X'){assert.ok(length>=10,'extended runtime WebP header');extended=[bytes.readUIntLE(start+4,3)+1,bytes.readUIntLE(start+7,3)+1];}
  offset=start+length+(length&1);
 }
 assert.ok(dimensions,'actual lossy VP8 payload required');
 if(extended)assert.deepEqual(extended,dimensions,'WebP canvas agrees with actual VP8 dimensions');
 return dimensions;
}
function changeVp8Width(bytes,width){
 const copy=Buffer.from(bytes);
 for(let offset=12;offset+8<=copy.length;){const length=copy.readUInt32LE(offset+4),start=offset+8;if(copy.toString('ascii',offset,offset+4)==='VP8 '){copy.writeUInt16LE((copy.readUInt16LE(start+6)&0xc000)|width,start+6);return copy;}offset=start+length+(length&1);}
 assert.fail('negative dimension fixture requires actual VP8 bytes');
}
async function validateSuccessor(plan,result,read){
 const s=result.successor;
 assert.ok(s&&typeof s==='object'&&!Array.isArray(s),'explicit successor metadata required');
 assert.equal(s.kind,'native-refit','supported successor kind');
 assert.ok(typeof s.reason==='string'&&s.reason.trim(),'successor reason recorded');
 assert.equal(s.replacesSha256,result.after.sha256,'successor links to retained historical after digest');
 const match=/^newer\/enemies\/([^/]+)\/([^/]+)\/(diffuse\.(?:webp|png))$/.exec(result.file);
 assert.ok(match,'native refit succeeds a skin diffuse record');const[,key,variant,historicalFile]=match;
 const renamed=s.diffuseFile!==undefined;
 if(renamed){assert.equal(s.diffuseFile,'diffuse.webp','only an explicit local diffuse.webp successor rename is supported');assert.notEqual(s.diffuseFile,historicalFile,'rename must describe a real filename change');}
 const file=renamed?s.diffuseFile:historicalFile;
 assert.equal(s.sourceRecord,join(dirname(result.file),'SOURCE.json'),'successor provenance belongs to the same skin directory');
 const recipe=await json(sourcePath(s.recipe),read),source=await json(s.sourceRecord,read);
 assert.equal(recipe.key,key,'recipe targets the historical model');assert.equal(recipe.outputVariant??'custom',variant,'recipe targets the current variant');
 assert.equal(source.model,'progs/'+key+'.mdl','provenance targets the historical model');
 for(const field of ['nativeModelSha256','sourceSha256'])assert.match(s[field]??'',/^[a-f0-9]{64}$/,'explicit successor '+field);
 assert.equal(recipe.modelSha,s.nativeModelSha256,'recipe model identity is pinned');assert.equal(source.nativeModelSha256,s.nativeModelSha256,'provenance model identity is pinned');
 assert.equal(recipe.sourceSha,s.sourceSha256,'recipe source identity is pinned');assert.equal(source.sourceSha256,s.sourceSha256,'provenance source identity is pinned');
 assert.equal(source.source,recipe.sourceFile,'recipe and provenance name the same source');
 const sourceBytes=await read(sourcePath(source.source));assert.equal(digest(sourceBytes),s.sourceSha256,'actual reviewed source digest');
 assert.deepEqual(imageSize(sourceBytes),recipe.size,'actual source dimensions match recipe');assert.deepEqual(source.sourceDimensions,recipe.size,'provenance source dimensions match recipe');
 const native=plan.files.find(entry=>entry.file===result.file)?.native;
 assert.ok(Array.isArray(native)&&native.length===2&&native.every(n=>Number.isSafeInteger(n)&&n>0),'historical native dimensions retained');
 assert.deepEqual(recipe.layout?.slice(1,3),native,'recipe layout agrees with historical native dimensions');
 assert.equal(recipe.factor,4,'successor recipe remains 4x');assert.equal(source.factor,4,'successor provenance remains 4x');
 assert.deepEqual(result.target,native.map(n=>n*4),'historical target is exactly 4x');assert.deepEqual(source.dimensions,result.target,'successor dimensions retain 4x target');
 assert.equal(source.skin,recipe.skin??0,'same native skin index');assert.equal(source.vertices,recipe.layout[3],'same vertex count');assert.equal(source.triangles,recipe.layout[4],'same triangle count');assert.equal(source.poses,recipe.layout[5],'same native poses');
 if(renamed){
  assert.deepEqual(recipe.runtimeEncoding,{format:'webp',quality:92},'recipe explicitly requests Q92 WebP');
  const encoding=source.runtimeEncoding;
  assert.ok(encoding,'SOURCE records runtime encoding');assert.equal(encoding.format,'webp','SOURCE declares WebP');assert.equal(encoding.quality,92,'SOURCE declares Q92');assert.equal(encoding.lossless,false,'SOURCE declares lossy runtime maps');assert.equal(encoding.authoringSourceUnchanged,true,'SOURCE preserves authoring source');
  assert.deepEqual(Object.keys(source.files??{}).sort(),[file,'height.webp'].sort(),'SOURCE lists only current renamed maps');
  assert.deepEqual(Object.keys(encoding.maps??{}).sort(),[file,'height.webp'].sort(),'runtime encoding pins both maps');
  const catalogue=await json('newer/enemies/index.json',read),entries=catalogue.models?.[key]?.filter(entry=>entry.dir===key+'/'+variant&&entry.skin===(recipe.skin??0)&&entry.nativeModelSha256===s.nativeModelSha256);
  assert.equal(entries?.length,1,'exact current model/variant/skin catalogue mapping exists');
  assert.equal(entries[0].maps?.diffuse,file,'catalogue selects declared renamed diffuse');assert.equal(entries[0].maps?.height,'height.webp','catalogue selects verified height');
 }
 assert.deepEqual(Object.keys(s.files??{}).sort(),[file,'height.webp'].sort(),'successor explicitly pins both current maps');
 for(const[name,expected]of Object.entries(s.files)){
  assert.match(expected,/^[a-f0-9]{64}$/,'current map digest is pinned');assert.equal(source.files?.[name],expected,'provenance agrees with successor current map');
  const bytes=await read(join(dirname(result.file),name));assert.equal(digest(bytes),expected,'actual successor map digest');assert.deepEqual(renamed?runtimeWebpSize(bytes):imageSize(bytes),result.target,'actual successor map retains 4x size');
  if(renamed){const receipt=source.runtimeEncoding.maps[name];assert.equal(receipt.sha256,expected,'Q92 receipt pins current encoded bytes');assert.equal(receipt.bytes,bytes.length,'Q92 receipt records encoded byte length');for(const field of ['masterSha256','pillowDecodedRgbaSha256'])assert.match(receipt[field]??'',/^[a-f0-9]{64}$/,'Q92 receipt pins '+field);}
 }
}
async function validateResult(plan,name,result,read=readFile){
 if(!result.after)return false;
 const[w,h]=result.target;assert.deepEqual(result.after.size,[w,h],`${name}: ${result.file} recorded at its 4x target`);
 if(result.successor!==undefined){await validateSuccessor(plan,result,read);return true;}
 assert.equal(await sha(result.file,read),result.after.sha256,`${name}: ${result.file} changed since its 4x record`);
 if(/^newer\/enemies\/.+\/diffuse\.(webp|png)$/.test(result.file)){
  // Skins without provenance (the batch-1 items and monsters) have only the plan record.
  const text=await read(join(dirname(result.file),'SOURCE.json'),'utf8').catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  const source=text&&JSON.parse(text),file=basename(result.file);
  if(source){
   assert.ok(source.standard4x,`${result.file}: SOURCE.json records the 4x resample (standard4x)`);
   assert.equal(source.standard4x.record,join(PLANS,name),`${result.file}: SOURCE.json names its 4x record`);
   assert.deepEqual(source.standard4x.fitDimensions,result.before.size,`${result.file}: SOURCE.json fit dimensions are the plan's before`);
   assert.equal(source.standard4x.fitFiles?.[file],result.before.sha256,`${result.file}: SOURCE.json fit digest is the plan's before`);
   assert.equal(source.files?.[file],result.after.sha256,`${result.file}: SOURCE.json shipped digest is the plan's after`);
   assert.deepEqual(source.dimensions,result.after.size,`${result.file}: SOURCE.json dimensions are the shipped size`);
   assert.equal(source.factor,4,`${result.file}: SOURCE.json factor is the shipped 4x`);
  }
 }
 return true;
}
test('resampled files retain their historical 4x receipt or an explicitly verified native-refit successor',async()=>{
 const plans=(await readdir(PLANS)).filter(name=>name.endsWith('.json')).sort();assert.ok(plans.length>=2,'batch records present');let checked=0;
 for(const name of plans){const plan=await json(join(PLANS,name),readFile);for(const result of plan.results??[])if(await validateResult(plan,name,result))checked++;}
 assert.ok(checked>0,'at least one resampled file checked');
});
async function fixture(){
 const name='batch3-hipnotic.json',plan=await json(join(PLANS,name),readFile),result=structuredClone(plan.results.find(r=>r.file==='newer/enemies/armalegs/custom/diffuse.png'));
 const replacements=new Map(),read=async(path,encoding)=>{const value=replacements.has(path)?replacements.get(path):await readFile(path);if(value===null)throw Object.assign(new Error('missing '+path),{code:'ENOENT'});return encoding?value.toString(encoding):value;};
 return{plan,name,result,replacements,read,setJson:(path,value)=>replacements.set(path,Buffer.from(JSON.stringify(value)))};
}
test('Armagon successor retains the actual before and after records rather than relabelling the old resample',async()=>{
 const{result}=await fixture();assert.deepEqual(result.before,{size:[1368,1164],sha256:'e67f2e0829d49d5b34baec15df31ed708dfa2ea51f37beb4d5e518ab544dc4b9',bytes:1531067});assert.deepEqual(result.after,{size:[912,776],sha256:'9720e8237391f074ace690a7e4682de15c70bba62532194851fbf66456d583c4',bytes:758502});
});
test('missing invalid or mismatched successors cannot bypass the historical file gate',async t=>{
 const mutations={
  'no successor':f=>delete f.result.successor,
  'empty successor':f=>f.result.successor={},
  'wrong predecessor':f=>f.result.successor.replacesSha256='0'.repeat(64),
  'missing recipe':f=>f.replacements.set(f.result.successor.recipe,null),
  'missing source record':f=>f.replacements.set(f.result.successor.sourceRecord,null),
  'different source record':f=>f.result.successor.sourceRecord='newer/enemies/scor/custom/SOURCE.json',
  'wrong pinned model':f=>f.result.successor.nativeModelSha256='0'.repeat(64),
  'wrong pinned source':f=>f.result.successor.sourceSha256='0'.repeat(64),
  'recipe not 4x':async f=>{const p=f.result.successor.recipe,v=await json(p,f.read);v.factor=3;f.setJson(p,v);},
  'record not 4x':async f=>{const p=f.result.successor.sourceRecord,v=await json(p,f.read);v.dimensions=[684,582];f.setJson(p,v);},
  'missing height pin':f=>delete f.result.successor.files['height.webp'],
  'wrong current height':f=>f.replacements.set('newer/enemies/armalegs/custom/height.webp',Buffer.from('changed height')),
  'wrong current dimensions despite matching hashes':async f=>{const name=f.result.successor.diffuseFile,path=join(dirname(f.result.file),name),bytes=changeVp8Width(await f.read(path),684),hash=digest(bytes);f.replacements.set(path,bytes);f.result.successor.files[name]=hash;const p=f.result.successor.sourceRecord,v=await json(p,f.read);v.files[name]=hash;v.runtimeEncoding.maps[name].sha256=hash;f.setJson(p,v);}
 };
 for(const[name,mutate]of Object.entries(mutations))await t.test(name,async()=>{const f=await fixture();await mutate(f);await assert.rejects(validateResult(f.plan,f.name,f.result,f.read));});
});
test('nonsuperseded rows still enforce original file hashes and resample provenance',async()=>{
 const f=await fixture(),result=structuredClone(f.plan.results.find(r=>r.file==='newer/enemies/scor/custom/diffuse.png'));assert.equal(result.successor,undefined,'Scorpion was not superseded');await validateResult(f.plan,f.name,result,f.read);
 const changed=structuredClone(result);changed.after.sha256='0'.repeat(64);await assert.rejects(validateResult(f.plan,f.name,changed,f.read));
 const record=join(dirname(result.file),'SOURCE.json'),source=await json(record,f.read);delete source.standard4x;f.setJson(record,source);await assert.rejects(validateResult(f.plan,f.name,result,f.read));
});

test('renamed Q92 successor requires explicit safe filename, real codec and current catalogue',async t=>{
 const mutations={
  'undisclosed rename':{mutate:f=>delete f.result.successor.diffuseFile,error:/pins both current maps/},
  'path escape rename':{mutate:f=>f.result.successor.diffuseFile='../diffuse.webp',error:/explicit local diffuse.webp/},
  'wrong codec despite matching hashes':{mutate:async f=>{const name=f.result.successor.diffuseFile,path=join(dirname(f.result.file),name),source=await json(f.result.successor.sourceRecord,f.read),bytes=await f.read(source.source),hash=digest(bytes);f.replacements.set(path,bytes);f.result.successor.files[name]=hash;source.files[name]=hash;source.runtimeEncoding.maps[name].sha256=hash;source.runtimeEncoding.maps[name].bytes=bytes.length;f.setJson(f.result.successor.sourceRecord,source);},error:/actual WebP/},
  'wrong catalogue rename':{mutate:async f=>{const path='newer/enemies/index.json',index=await json(path,f.read);index.models.armalegs.find(x=>x.dir==='armalegs/custom').maps.diffuse='diffuse.png';f.setJson(path,index);},error:/catalogue selects declared renamed diffuse/},
  'wrong catalogue identity':{mutate:async f=>{const path='newer/enemies/index.json',index=await json(path,f.read);index.models.armalegs.find(x=>x.dir==='armalegs/custom').nativeModelSha256='0'.repeat(64);f.setJson(path,index);},error:/catalogue mapping exists/},
  'recipe Q92 intent missing':{mutate:async f=>{const path=f.result.successor.recipe,recipe=await json(path,f.read);delete recipe.runtimeEncoding;f.setJson(path,recipe);},error:/recipe explicitly requests Q92/},
  'SOURCE Q92 intent wrong':{mutate:async f=>{const path=f.result.successor.sourceRecord,source=await json(path,f.read);source.runtimeEncoding.quality=91;f.setJson(path,source);},error:/SOURCE declares Q92/},
  'runtime receipt hash wrong':{mutate:async f=>{const path=f.result.successor.sourceRecord,source=await json(path,f.read);source.runtimeEncoding.maps['height.webp'].sha256='0'.repeat(64);f.setJson(path,source);},error:/Q92 receipt pins current encoded bytes/}
 };
 for(const[name,{mutate,error}]of Object.entries(mutations))await t.test(name,async()=>{const f=await fixture();await mutate(f);await assert.rejects(validateResult(f.plan,f.name,f.result,f.read),error);});
});
