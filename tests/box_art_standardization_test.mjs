/** Independent, focused contracts for owner-supplied normalized box faces.
 * Run directly; this does not prepare game data, build, or touch the owner library.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {GAME_BOXES,GameShelf_Box,GameShelf_ReadFolder} from '../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {collectAssets,validateArtifactInventory} from '../tools/distribution/manifest.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFile(new URL('../'+path,import.meta.url));
const json=async path=>JSON.parse(await read(path));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const roles=['front','back','spine'];
const expectedIDs=['shareware','quake','hipnotic','rogue','dopa','mg1','dawn','ad','quoth','malice','xmen','aopfm_v2','mod_quaked','mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_alkaline','mod_tremor','mod_hexen_2_shareware','mod_the_immortal_lock'].sort();
const discoveredNames={mod_quaked:'Quaked',mod_hexen_2:'Hexen 2',mod_hexen_2_portal_of_praevus:'Hexen 2 Portal of Praevus',mod_alkaline:'Alkaline',mod_tremor:'Tremor',mod_hexen_2_shareware:'Hexen 2 Shareware',mod_the_immortal_lock:'The Immortal Lock'};
const activeRows=()=>Object.entries(GAME_BOXES).flatMap(([game,faces])=>roles.filter(face=>faces[face]).map(face=>({game,face,path:faces[face]}))).sort((a,b)=>a.path.localeCompare(b.path));
async function images(path){const result=[];for(const item of await readdir(new URL('../'+path,import.meta.url),{withFileTypes:true})){const child=path+'/'+item.name;if(item.isDirectory())result.push(...await images(child));else if(item.isFile()&&/\.(png|jpe?g|webp|avif|gif)$/i.test(child))result.push(child);}return result;}

test('every live face has one canonical role and the current manifest is exhaustive',async()=>{
 assert.deepEqual(Object.keys(GAME_BOXES).sort(),expectedIDs);
 const live=activeRows(),manifest=await json('assets/boxes/manifest.json');
 assert.equal(live.length,56,'nineteen complete supplied boxes except unavailable retail Hexen II back');
 assert.deepEqual(manifest.faces.map(({game,face,path})=>({game,face,path})).sort((a,b)=>a.path.localeCompare(b.path)),live);
 assert.equal(new Set(live.map(r=>r.path)).size,live.length);
 for(const row of live)assert.equal(row.path,`assets/boxes/${row.game}/${row.face}.webp`,'wraps, side aliases and inactive originals cannot become live fronts');
 assert.deepEqual((await images('assets/boxes')).sort((a,b)=>a.localeCompare(b)),live.map(r=>r.path),'runtime has no inactive image copies');
 for(const id of expectedIDs){for(const face of roles)if(!(id==='mod_hexen_2'&&face==='back'))assert.ok(GAME_BOXES[id][face],id+' supplied '+face);assert.ok(GAME_CATALOGUE_GAMES.some(g=>g.id===id)||discoveredNames[id],id+' approved identity');}
 assert.equal(GAME_BOXES.mod_hexen_2.back,undefined,'unavailable retail Hexen II back is not invented');
 assert.equal(GAME_BOXES.mod_q30a1024,undefined,'historical screenshot collage remains unboxed');
});

test('all runtime pixels fully decode to one physical-box standard and match manifest bytes',async()=>{
 const manifest=await json('assets/boxes/manifest.json');
 for(const row of manifest.faces){
  const bytes=await read(row.path);assert.equal(bytes.length,row.bytes,row.path+' bytes');assert.equal(digest(bytes),row.sha256,row.path+' SHA-256');
  // raw().toBuffer decodes every pixel; metadata alone could pass a truncated file.
  const {info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,row.face==='spine'?340:1640,row.path+' decoded width');assert.equal(info.height,2000,row.path+' decoded height');
  if(row.width!==undefined)assert.equal(row.width,info.width,row.path+' recorded width');
  if(row.height!==undefined)assert.equal(row.height,info.height,row.path+' recorded height');
 }
});

test('derivatives retain exact original custody and bounded source-panel provenance',async()=>{
 const record=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json');
 assert.equal(record.version,1);
 assert.deepEqual(record.standard,{front:[1640,2000],back:[1640,2000],spine:[340,2000]});
 const archives=new Map(),hashPaths=new Map();
 for(const source of record.sources){
  assert.ok(source.archivePath.startsWith('assets/authoring/box_art/'),'original is retained in source-only authoring');
  assert.ok(['local','runtime','authoring','generated'].includes(source.origin));
  const bytes=await read(source.archivePath);assert.equal(bytes.length,source.bytes,source.archivePath+' retained bytes');assert.equal(digest(bytes),source.sha256,source.archivePath+' original SHA-256');
  const decoded=await sharp(bytes).raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,source.width);assert.equal(decoded.info.height,source.height);
  archives.set(source.archivePath,source);
  if(!hashPaths.has(source.sha256))hashPaths.set(source.sha256,new Set());hashPaths.get(source.sha256).add(source.archivePath);
 }
 for(const [hash,paths]of hashPaths)assert.equal(paths.size,1,'one canonical retained blob per original SHA-256 '+hash);
 const generated=record.sources.filter(source=>source.origin==='generated');
 const selectedGenerated=generated.filter(source=>record.faces.some(face=>face.source===source.archivePath));
 assert.equal(selectedGenerated.length,2,'only the two reviewed wide-spine reflows use AI; rejected candidates can remain retained');
 const promptFor=async source=>{const [path,key]=source.prompt.split('#'),document=await json(path);return key?document.prompts[key]:document.prompt;};
 for(const source of generated){assert.ok(archives.has(source.editedFrom),'generated reflow keeps its supplied original');assert.equal(source.tool,'image_gen.imagegen');assert.ok(await promptFor(source),'AI edit prompt retained');}
 const malice=selectedGenerated.find(source=>record.faces.some(face=>face.game==='malice'&&face.source===source.archivePath));
 assert.match(await promptFor(malice),/23RD CENTURY/,'active Malice repair instructions retain the exact supplied century wording');
 const manifest=await json('assets/boxes/manifest.json');
 assert.deepEqual(record.faces.map(({game,face,path,sha256,bytes})=>({game,face,path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path)),manifest.faces.map(({game,face,path,sha256,bytes})=>({game,face,path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path)),'derivation covers exactly the shipped hashes');
 for(const face of record.faces){
  const source=archives.get(face.source);assert.ok(source,face.path+' retained source exists');assert.equal(face.sourceSha256,source.sha256);
  const crop=face.crop;for(const value of Object.values(crop))assert.ok(Number.isInteger(value)&&value>=0,'integer crop: '+face.path);
  assert.ok(crop.width>0&&crop.height>0);assert.ok(crop.left+crop.width<=source.width&&crop.top+crop.height<=source.height,face.path+' crop inside actual original');
  const [width,height]=record.standard[face.face];assert.equal(face.width,width);assert.equal(face.height,height);assert.equal(face.fit,'contain','preserve complete panel composition');
  const content=face.content;assert.ok(content.left>=0&&content.top>=0&&content.width>0&&content.height>0);assert.ok(content.left+content.width<=width&&content.top+content.height<=height);
  assert.ok(Math.abs(content.width/crop.width-content.height/crop.height)<Math.max(1/crop.width,1/crop.height)*2,face.path+' scales source proportions without stretching letters');
 }
 const immortal=Object.fromEntries(record.faces.filter(face=>face.game==='mod_the_immortal_lock').map(face=>[face.face,face]));
 // In the supplied 1659×948 wrap, the spine's PC / MAC footer starts near
 // x783, left of its central title column. The first x792 cut split its P.
 assert.ok(immortal.spine.crop.left<=780,'Immortal Lock spine keeps margin before the complete PC / MAC footer');
 assert.equal(immortal.back.crop.left+immortal.back.crop.width,immortal.spine.crop.left,'back ends before the complete spine footer, with no fragment duplicated');
 assert.equal(immortal.spine.crop.left+immortal.spine.crop.width,immortal.front.crop.left,'spine/front share one source boundary');
 // The superseded historical manifest remains immutable evidence: every original
 // hash must resolve through its explicit new authoring path.
 const previous=await json('docs/evidence/box-art-standardization-2026-10-20/baseline-runtime-manifest.json');
 for(const old of previous.faces){
  const path=record.historicalResolution[old.path]??old.path,bytes=await read(path);
  assert.equal(digest(bytes),old.sha256,'historical original identity '+old.path);
 }
 for(const exclusion of record.exclusions){assert.ok(exclusion.reason,'held source has an explicit reason');assert.ok(!record.faces.some(face=>face.sourceSha256===exclusion.sha256),'held artwork is never silently used');}
});

test('local face overrides, canonical names, missing faces and game authority survive normalization',()=>{
 for(const id of expectedIDs){
  const game=Object.freeze({id,name:id,kind:'unavailable',playable:false,reason:'No supported game files found',images:Object.freeze({})});
  const base=GameShelf_Box(game);
  for(const face of roles)assert.equal(base[face],GAME_BOXES[id][face]??null,id+' default '+face);
  for(const role of roles){const value='asset://localhost/'+id+'/'+role+'.png',box=GameShelf_Box({...game,images:{[role]:value}});for(const other of roles)assert.equal(box[other],other===role?value:GAME_BOXES[id][other]??null,id+' independent override '+role+'/'+other);assert.equal(box.playable,false);assert.equal(box.reason,game.reason);}
 }
 const files=['cover.png','front.webp','side.png','spine.webp','back.webp','nested/front.png'].map(name=>({name:name.split('/').at(-1),webkitRelativePath:'Picked/'+name}));
 for(const order of [files,[...files].reverse()]){const faces=GameShelf_ReadFolder(order,'Picked').files;assert.equal(faces.front.webkitRelativePath,'Picked/front.webp');assert.equal(faces.side.webkitRelativePath,'Picked/spine.webp');assert.equal(faces.back.webkitRelativePath,'Picked/back.webp');}
 const missing=GameShelf_Box({id:'mod_unboxed_fixture',name:'Unboxed',playable:false,images:{}});for(const face of roles)assert.equal(missing[face],null);
 assert.equal(GameShelf_Box({id:'mod_hexen_2',name:'Hexen II',playable:false}).back,null);
});

test('the actual desktop collector ships all runtime faces and excludes all source originals',async()=>{
 const assets=await collectAssets({profile:'desktop',root}),included=new Set(assets);
 for(const row of activeRows())assert.ok(included.has(row.path),'packaged '+row.path);
 assert.ok(!assets.some(path=>path.startsWith('assets/authoring/box_art/')),'source-only originals excluded');
 assert.ok(!assets.some(path=>/^(games|resources)\//.test(path)),'owner game data excluded');
 assert.doesNotThrow(()=>validateArtifactInventory(assets,'desktop'));
});

test('approved art-only folders remain discoverable when their local artwork has moved',async()=>{
 const native=(await read('src-tauri/src/library.rs')).toString();
 const retention=/pub const BOXED_FOLDERS:[\s\S]*?=\s*&\[([\s\S]*?)\];/.exec(native);
 assert.ok(retention,'native scanner has an explicit retained-folder contract');
 const names=[...retention[1].matchAll(/"([^"]+)"/g)].map(m=>m[1].toLowerCase());
 for(const name of Object.values(discoveredNames))assert.ok(names.includes(name.toLowerCase()),name+' remains discoverable without recognized art or data');
 assert.match(native,/found\.is_none\(\)\s*&&\s*faces\.is_empty\(\)\s*&&\s*!BOXED_FOLDERS/,'retention is wired into the real discovery path');
});
