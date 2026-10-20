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
 assert.equal(live.length,57,'nineteen complete supplied boxes, including the recovered owner-supplied main Hexen II back');
 assert.deepEqual(manifest.faces.map(({game,face,path})=>({game,face,path})).sort((a,b)=>a.path.localeCompare(b.path)),live);
 assert.equal(new Set(live.map(r=>r.path)).size,live.length);
 for(const row of live)assert.equal(row.path,`assets/boxes/${row.game}/${row.face}.webp`,'wraps, side aliases and inactive originals cannot become live fronts');
 assert.deepEqual((await images('assets/boxes')).sort((a,b)=>a.localeCompare(b)),live.map(r=>r.path),'runtime has no inactive image copies');
 for(const id of expectedIDs){for(const face of roles)assert.ok(GAME_BOXES[id][face],id+' supplied '+face);assert.ok(GAME_CATALOGUE_GAMES.some(g=>g.id===id)||discoveredNames[id],id+' approved identity');}
 assert.equal(GAME_BOXES.mod_hexen_2.back,'assets/boxes/mod_hexen_2/back.webp','the provided main-game back is never replaced by an absence assertion');
 assert.equal(GAME_BOXES.mod_q30a1024,undefined,'historical screenshot collage remains unboxed');
});

test('all runtime pixels fully decode with uniform spines and individually recorded front/back dimensions',async()=>{
 const manifest=await json('assets/boxes/manifest.json'),record=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json');
 for(const row of manifest.faces){
  const bytes=await read(row.path);assert.equal(bytes.length,row.bytes,row.path+' bytes');assert.equal(digest(bytes),row.sha256,row.path+' SHA-256');
  // raw().toBuffer decodes every pixel; metadata alone could pass a truncated file.
  const {info}=await sharp(bytes).raw().toBuffer({resolveWithObject:true});
  assert.ok(Number.isInteger(row.width)&&row.width>0&&Number.isInteger(row.height)&&row.height>0,row.path+' positive recorded dimensions');
  assert.equal(row.width,info.width,row.path+' recorded width');assert.equal(row.height,info.height,row.path+' recorded height');
  if(row.face==='spine')assert.deepEqual([info.width,info.height],[340,2000],row.path+' uniform spine dimensions');
  const derived=record.faces.find(face=>face.path===row.path);assert.ok(derived,row.path+' recorded recipe');assert.deepEqual([info.width,info.height],[derived.width,derived.height],row.path+' matches its own recipe dimensions');
 }
});

test('derivatives retain exact original custody and bounded source-panel provenance',async()=>{
 const record=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json');
 assert.equal(record.version,1);
 assert.deepEqual(record.standard.spine,[340,2000],'only spines have universal dimensions');
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
 assert.equal(selectedGenerated.length,1,'only the explicitly owner-authorized Abyss background extension is selected');
 assert.deepEqual(record.faces.filter(face=>selectedGenerated.some(source=>source.archivePath===face.source)).map(face=>face.game+':'+face.face),['aopfm_v2:front'],'AI never replaces a spine or any other box face');
 for(const path of ['edits-2026-10-20/malice/spine-layout.png','edits-2026-10-20/malice/spine-layout-corrected.png','edits-2026-10-20/quoth/spine-layout.png']){const source=archives.get('assets/authoring/box_art/'+path);assert.ok(source);assert.match(source.disposition,/REJECTED FOR RUNTIME/);assert.ok(!record.faces.some(face=>face.source===source.archivePath),'the rejected spine draft remains source-only');}
 const promptFor=async source=>{const [path,key]=source.prompt.split('#'),document=await json(path);return key?document.prompts[key]:document.prompt;};
 for(const source of generated){assert.ok(archives.has(source.editedFrom),'generated reflow keeps its supplied original');assert.equal(source.tool,'image_gen.imagegen');assert.ok(await promptFor(source),'AI edit prompt retained');}
 const malice=record.faces.find(face=>face.game==='malice'&&face.face==='spine');
 assert.equal(malice.source,'assets/authoring/box_art/import-2026-10-20/malice/side.png','Malice uses its exact supplied source with original23RD wording and elliptical disc');
 assert.equal(malice.sourceSha256,'236d2dd48ba27d6f7b9d6c0afd75ce627a652d93c3306d8bd22b405231a401e6','original Malice23RD and ellipse source identity');
 const quoth=record.faces.find(face=>face.game==='quoth'&&face.face==='spine');assert.equal(quoth.source,'assets/authoring/box_art/originals-2026-10-20/quoth/spine.png','Quoth retains original glyph proportions');assert.equal(quoth.sourceSha256,'56765f4988c52a24e5135817805a39ca5feddea66d131988b1900071348f642a','original Quoth glyph identity');
 const manifest=await json('assets/boxes/manifest.json');
 assert.deepEqual(record.faces.map(({game,face,path,sha256,bytes})=>({game,face,path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path)),manifest.faces.map(({game,face,path,sha256,bytes})=>({game,face,path,sha256,bytes})).sort((a,b)=>a.path.localeCompare(b.path)),'derivation covers exactly the shipped hashes');
 const abyssFront=record.faces.find(face=>face.game==='aopfm_v2'&&face.face==='front'),abyssBack=record.faces.find(face=>face.game==='aopfm_v2'&&face.face==='back');
 assert.equal(abyssFront.sourceSha256,'5f95e591f4bd3981a23d39a9223483793d967b31fd10e2f5c0581fcc6a5390df','reviewed seam-repaired master identity');
 assert.deepEqual([abyssFront.width,abyssFront.height],[abyssBack.width,abyssBack.height],'Abyss front and back have matching canvas dimensions');
 assert.deepEqual(abyssFront.content,abyssBack.content,'Abyss front and back have matching complete content placement and proportions');
 const composition=await json(abyssFront.compositionReceipt);assert.equal(composition.master,abyssFront.source);assert.deepEqual(composition.dimensions,[808,975]);
 const center={left:81,top:0,width:646,height:975},sourceCenter={left:955,top:0,width:646,height:975};
 assert.deepEqual(composition.protectedCenter.sourceCrop,sourceCenter);assert.deepEqual(Object.fromEntries(Object.keys(center).map(key=>[key,composition.protectedCenter[key]])),center);
 const masterCenter=await sharp(await read(abyssFront.source)).extract(center).removeAlpha().raw().toBuffer(),originalCenter=await sharp(await read(abyssBack.source)).extract(sourceCenter).removeAlpha().raw().toBuffer();
 assert.ok(masterCenter.equals(originalCenter),'every meaningful original Abyss center pixel, glyph and logo stays exact');assert.equal(digest(masterCenter),'a3ae4bbc9f72f3c7452c6a91594beb258d2f644bf9fa77c3898adedc21d95e58');
 for(const face of record.faces){
  const source=archives.get(face.source);assert.ok(source,face.path+' retained source exists');assert.equal(face.sourceSha256,source.sha256);
  const crop=face.crop;for(const value of Object.values(crop))assert.ok(Number.isInteger(value)&&value>=0,'integer crop: '+face.path);
  assert.ok(crop.width>0&&crop.height>0);assert.ok(crop.left+crop.width<=source.width&&crop.top+crop.height<=source.height,face.path+' crop inside actual original');
  const {width,height}=face;assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0,'each front/back recipe records its own positive dimensions');if(face.face==='spine')assert.deepEqual([width,height],[340,2000]);assert.equal(face.fit,'contain','preserve complete panel composition');
  const content=face.content;assert.ok(content.left>=0&&content.top>=0&&content.width>0&&content.height>0);assert.ok(content.left+content.width<=width&&content.top+content.height<=height);
  assert.ok(Math.abs(content.width/crop.width-content.height/crop.height)<Math.max(1/crop.width,1/crop.height)*2,face.path+' scales source proportions without stretching letters');
  if(face.face==='spine'&&['malice','quoth'].includes(face.game))assert.deepEqual(crop,{left:0,top:0,width:source.width,height:source.height},face.path+' supplied separate spine remains complete');
  // Independently inspected originals have one full-height printed strip,
  // surrounded only by black/gradient authoring padding. These pinned bounds
  // keep all lettering, logos and strip texture rather than shrinking the pad.
  const printedSpines={shareware:{left:248,width:392},hipnotic:{left:387,width:249},rogue:{left:400,width:226},mg1:{left:329,width:368}};
  if(face.face==='spine'&&printedSpines[face.game])assert.deepEqual(crop,{left:printedSpines[face.game].left,top:0,width:printedSpines[face.game].width,height:source.height},face.path+' complete reviewed printed strip, only blank outer padding removed');
  if(face.game==='mod_hexen_2'&&face.face==='back'){
   assert.equal(face.sourceSha256,'f4e3f4eebdf35052c943895178d45fe591a334d39a2af5630f47c7770d816118','actual owner attachment, never a Portal substitution');
   assert.deepEqual(crop,{left:22,top:120,width:950,height:1342},'complete independently reviewed back with all publisher logos, excluding printer margins and adjacent panels');
  }
  if((face.face==='spine'&&['malice','quoth'].includes(face.game))||(face.game==='mod_hexen_2'&&face.face==='back')||(face.game==='aopfm_v2'&&['front','back'].includes(face.face))){
   // Bind the disputed glyphs/disc directly to the supplied original pixels:
   // uniform resampling + padding must be the entire operation, with no redraw.
   const scaled=await sharp(await read(source.archivePath)).extract(crop).resize(content.width,content.height,{kernel:'lanczos3'}).png().toBuffer();
   const expected=await sharp({create:{width,height,channels:3,background:face.background}}).composite([{input:scaled,left:content.left,top:content.top}]).removeAlpha().raw().toBuffer();
   const actual=await sharp(await read(face.path)).removeAlpha().raw().toBuffer();
   assert.ok(actual.equals(expected),face.path+' is only a uniform resize of supplied pixels plus padding; glyphs and ellipse are never redrawn');
  }
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
 assert.equal(GameShelf_Box({id:'mod_hexen_2',name:'Hexen II',playable:false}).back,'assets/boxes/mod_hexen_2/back.webp');
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
