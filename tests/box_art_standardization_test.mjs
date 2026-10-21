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
const ownerCroppedFaces=new Set(['quake','ad','mod_hexen_2_shareware','mod_hexen_2_portal_of_praevus'].flatMap(game=>['front','back'].map(face=>`assets/boxes/${game}/${face}.webp`)));
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
 assert.equal(selectedGenerated.length,4,'only the explicitly owner-authorized Abyss and Shareware background composites are selected');
 assert.deepEqual(record.faces.filter(face=>selectedGenerated.some(source=>source.archivePath===face.source)).map(face=>face.game+':'+face.face).sort(),['aopfm_v2:front','shareware:back','shareware:front','shareware:spine'],'generated pixels are confined to the four approved background composites; original printed elements have separate pixel proofs');
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
  if(!face.outputCrop)assert.ok(Math.abs(content.width/crop.width-content.height/crop.height)<Math.max(1/crop.width,1/crop.height)*2,face.path+' scales source proportions without stretching letters');
  if(face.face==='spine'&&['malice','quoth'].includes(face.game))assert.deepEqual(crop,{left:0,top:0,width:source.width,height:source.height},face.path+' supplied separate spine remains complete');
  // Independently inspected originals have one full-height printed strip,
  // surrounded only by black/gradient authoring padding. These pinned bounds
  // keep all lettering, logos and strip texture rather than shrinking the pad.
  const printedSpines={mg1:{left:329,width:368}};
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

// This owner-reviewed correction concerns the visible material, not merely equal
// canvas dimensions. The public browser separately inspects the flat/3D joins.
test('Shareware edge completion and explicit logo/strip moves preserve original printed pixels and all other boxes',async()=>{
 const evidence='docs/evidence/box-art-shareware-alignment-2026-10-20/';
 assert.equal(digest(await read(evidence+'baseline-manifest.json')),'68fe0479a1b385c82dc8d45a68d98ab5c35887a30919f495455d78791fbdcccc','immutable owner-feedback baseline manifest');
 const baseline=await json(evidence+'baseline-manifest.json'),originalRows=await json(evidence+'baseline-faces.json');
 const recipe=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json'),manifest=await json('assets/boxes/manifest.json');
 const composition=await json(evidence+'composition.json');
 assert.equal(baseline.faces.length,57);assert.equal(originalRows.length,3);
 assert.deepEqual(originalRows.map(row=>row.face).sort(),roles.slice().sort());
 // The later owner-authorized mission-wrap increment replaces these six roles;
 // its separate baseline below protects all51 other roles, including Shareware.
 for(const old of baseline.faces.filter(row=>!['shareware','hipnotic','rogue'].includes(row.game)&&!ownerCroppedFaces.has(row.path)))assert.deepEqual(manifest.faces.find(row=>row.path===old.path),old,'outside authorized Shareware/mission increments: '+old.path);
 assert.equal(baseline.faces.filter(row=>row.game!=='shareware').length,54);
 assert.deepEqual(composition.faces.map(row=>row.face).sort(),roles.slice().sort());
 assert.equal(composition.featherPixels,12,'joins can touch only the reviewed twelve background pixels');
 for(const input of [{path:composition.donor,sha:composition.donorSha256},{path:composition.spineDonor.path,sha:composition.spineDonor.sha256}])assert.equal(digest(await read(input.path)),input.sha,'exact retained background donor');
 assert.ok((await json(composition.prompt)).prompt,'wrap background prompt retained');assert.ok((await json(composition.spineDonor.prompt)).prompt,'spine detail prompt retained');
 assert.deepEqual(composition.spineDonor.sourceCanvas,[1020,512],'retained fine-scale three-patch background board');
 assert.deepEqual(composition.spineDonor.patches,[{column:0,top:100},{column:1,top:1200},{column:2,top:1488}],'reviewed background-only gap placements');
 const expected={
  front:{width:1640,height:2000,sourceCrop:{left:0,top:0,width:1122,height:1402},scaled:[1601,2000],pieces:[{sourceTop:0,height:2000,top:0}],proofs:[{sourceScaled:{left:12,top:0,width:1577,height:2000},destination:{left:31,top:0,width:1577,height:2000}}]},
  back:{width:1640,height:2000,sourceCrop:{left:0,top:0,width:1109,height:1419},scaled:[1563,2000],pieces:[{sourceTop:0,height:2000,top:0}],proofs:[{sourceScaled:{left:12,top:0,width:1539,height:2000},destination:{left:50,top:0,width:1539,height:2000}}]},
  spine:{width:340,height:2000,sourceCrop:{left:248,top:0,width:392,height:1774},scaled:[340,1539],pieces:[{sourceTop:170,height:855,top:484},{sourceTop:1025,height:514,top:1439}],proofs:[{sourceScaled:{left:0,top:182,width:340,height:831},destination:{left:0,top:496,width:340,height:831}},{sourceScaled:{left:0,top:1037,width:340,height:490},destination:{left:0,top:1451,width:340,height:490}}]}
 };
 for(const face of roles){
  const row=composition.faces.find(row=>row.face===face),old=originalRows.find(row=>row.face===face),standard=expected[face];
  const runtime=recipe.faces.find(row=>row.game==='shareware'&&row.face===face);
  assert.equal(row.source,old.source);assert.equal(row.sourceSha256,old.sourceSha256);assert.equal(digest(await read(row.source)),old.sourceSha256,'retained original source identity');
  assert.deepEqual(row.sourceCrop,standard.sourceCrop);assert.deepEqual(row.sourceScaledDimensions,standard.scaled);
  assert.deepEqual(row.dimensions,[standard.width,standard.height]);assert.equal(runtime.source,row.master);assert.equal(runtime.compositionReceipt,evidence+'composition.json');
  assert.equal(digest(await read(row.master)),row.masterSha256);assert.equal(runtime.sourceSha256,row.masterSha256);
  const whole={left:0,top:0,width:standard.width,height:standard.height};
  assert.deepEqual(row.content,whole);assert.deepEqual(runtime.crop,whole);assert.deepEqual(runtime.content,whole,'material reaches the complete face, without old letterbox caps/sidebars');
  const master=await sharp(await read(row.master)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const current=await sharp(await read(runtime.path)).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([current.info.width,current.info.height],[standard.width,standard.height]);assert.ok(current.data.equals(master.data),'runtime pixels equal the full composite without a second crop/stretch');
  // Fail the exact prior padding regression on every full row/column. This is
  // deliberately not a proxy for visual material quality or cross-face seams.
  for(let y=0;y<standard.height;y++){let padded=true;for(let x=0;x<standard.width&&padded;x++){const i=(y*standard.width+x)*3;padded=current.data[i]===21&&current.data[i+1]===17&&current.data[i+2]===12;}assert.ok(!padded,face+' has no old flat background row at '+y);}
  for(let x=0;x<standard.width;x++){let padded=true;for(let y=0;y<standard.height&&padded;y++){const i=(y*standard.width+x)*3;padded=current.data[i]===21&&current.data[i+1]===17&&current.data[i+2]===12;}assert.ok(!padded,face+' has no old flat background column at '+x);}
  const actualPieces=face==='spine'?row.pieces.filter(piece=>piece.sourceTop>=170):row.pieces;assert.deepEqual(actualPieces,standard.pieces,'owner-approved printed-group destinations');
  assert.equal(row.protectedOriginals.length,standard.proofs.length);
  const scaled=await sharp(await read(row.source)).extract(row.sourceCrop).resize(...standard.scaled,{kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
  for(const [index,proof]of row.protectedOriginals.entries()){
   assert.deepEqual(proof.sourceScaled,standard.proofs[index].sourceScaled);assert.deepEqual(proof.destination,standard.proofs[index].destination);assert.equal(proof.pixelIdentical,true);
   const original=await sharp(scaled,{raw:{width:standard.scaled[0],height:standard.scaled[1],channels:3}}).extract(proof.sourceScaled).raw().toBuffer();
   const actual=await sharp(current.data,{raw:{width:standard.width,height:standard.height,channels:3}}).extract(proof.destination).raw().toBuffer();
   assert.ok(actual.equals(original),face+' complete protected printed group '+index+' has original glyph/logo proportions');assert.equal(digest(original),proof.rgbSha256);
  }
 }
 const logo=composition.logoTransform,oldSpine=originalRows.find(row=>row.face==='spine');assert.ok(logo,'owner-authorized larger id logo has a deterministic transform');
 assert.equal(logo.source,oldSpine.source);assert.equal(logo.sourceSha256,oldSpine.sourceSha256);assert.deepEqual(logo.sourceCrop,{left:382,top:54,width:126,height:140});assert.equal(logo.scale,2);
 assert.deepEqual(logo.destination,{left:44,top:16,width:252,height:280},'original id block enlarged uniformly, never AI lettering');
 assert.equal(logo.featherPixels,12,'only the reviewed background border of the original logo may feather');
 const proof=logo.protectedOriginal;assert.equal(proof.pixelIdentical,true);
 assert.deepEqual(proof.sourceScaled,{left:12,top:12,width:228,height:256},'complete reviewed original logo interior remains exact');
 assert.deepEqual(proof.destination,{left:44+proof.sourceScaled.left,top:16+proof.sourceScaled.top,width:proof.sourceScaled.width,height:proof.sourceScaled.height});
 const enlarged=await sharp(await read(logo.source)).extract(logo.sourceCrop).resize(252,280,{kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
 const expectedLogo=await sharp(enlarged,{raw:{width:252,height:280,channels:3}}).extract(proof.sourceScaled).raw().toBuffer();
 const actualLogo=await sharp(await read(recipe.faces.find(row=>row.game==='shareware'&&row.face==='spine').path)).removeAlpha().extract(proof.destination).raw().toBuffer();
 assert.ok(actualLogo.equals(expectedLogo),'enlarged id logo retains deterministic original pixels/proportions');assert.equal(digest(expectedLogo),proof.rgbSha256);
});


test('owner-selected mission wraps retain their continuous background, original foreground anchors and all other51 faces',async()=>{
 const dir='assets/authoring/box_art/mission-wraps-2026-10-21/';
 const composition=await json(dir+'composition.json'),owners=await json(dir+'owner-backgrounds.json');
 const baseline=await json('docs/evidence/box-art-mission-wraps-2026-10-21/baseline-manifest.json'),manifest=await json('assets/boxes/manifest.json');
 const recipe=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json');
 const untouched=baseline.faces.filter(row=>!['hipnotic','rogue'].includes(row.game));assert.equal(untouched.length,51);
 for(const old of untouched.filter(row=>!ownerCroppedFaces.has(row.path)))assert.deepEqual(manifest.faces.find(row=>row.path===old.path),old,'mission authoring cannot change another box: '+old.path);
 const selected={hipnotic:{background:'87acb23cc259da6f0ec8ed848fce7c8656e6b79a9416521e0946bf594c5b6e2f',native:[1687,932],width:3620,faceWidth:1640,wrap:'a001c1236c224beae40ccbfe3550758422d483de943d5b68c618e0374dede284',masters:{back:'1cd3d247a59f402dc575672142e2c72cb4ea7d6784f2f1ec88206fc145c97909',spine:'a02001b36204a479d029bd1fd49aea8db38d528bbe6add4f1a183cfc2451ad55',front:'abf5719e22cbbb9339df3b044d1133a02bbcf8e7822c4e5c60557d8d011c95cb'}},rogue:{background:'c9a0193a71efea5fd412c59300b951be1f8aceecaa0aa3164ae2cb110252aac4',native:[1686,933],width:3614,faceWidth:1637,wrap:'1d67e6853626dbae85f57e0c440d5018fcf6deeacb9d458a1062d0a7b830c800',masters:{back:'fab1b1fd0c593db03500aaa063ed0757ca03658e1d2f0841d1a768681891098b',spine:'0a78c30db5fa7375c7fe42913a9280329cdbaff051fc3e0e40b1f659bec9b093',front:'71e534e3351ffbf7a04bf655f359bd7e0c0ba0a75c6b6d5b54b770501aca2583'}}};
 const sourceSpine='assets/authoring/box_art/originals-2026-10-20/hipnotic/spine.png';
 const anchors={medallion:[[419,62,189,194],[50,80,240,246],'ellipse'],Q:[[406,404,222,168],[28,530,284,215],'largest'],U:[[488,632,85,76],[133,824,109,98],'all'],A:[[488,783,87,73],[133,1021,112,94],'all'],K:[[488,936,87,79],[133,1220,112,102],'all'],E:[[488,1084,87,78],[133,1413,112,100],'all'],'MISSION PACK NO.':[[437,539,43,592],[65,702,56,770],'all'],id:[[452,1285,113,134],[98,1660,144,171],'opaque'],'CD-ROM':[[405,1421,215,39],[30,1855,280,51],'all'],Activision:[[405,1466,225,62],[24,1920,292,80],'all']};
 const rect=values=>Object.fromEntries(['left','top','width','height'].map((key,i)=>[key,values[i]]));
 for(const game of ['hipnotic','rogue']){
  const spec=selected[game],owner=owners.find(row=>row.game===game),background=await read(owner.copy);assert.equal(digest(background),spec.background,'unchanged exact owner background');assert.equal(owner.sha256,spec.background);
  const native=await sharp(background).metadata();assert.deepEqual([native.width,native.height],spec.native);assert.equal(Math.round(native.width/native.height*2000),spec.width);
  const bg=await sharp(background).resize({height:2000,kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
  const wrapPath=dir+game+'/wrap-master.png',wrapBytes=await read(wrapPath);assert.equal(digest(wrapBytes),spec.wrap,'reviewed complete original-copy wrap');
  const wrap=await sharp(wrapBytes).removeAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([wrap.info.width,wrap.info.height],[spec.width,2000]);
  for(const x of [0,spec.width-1,spec.faceWidth-1,spec.faceWidth,spec.faceWidth+339,spec.faceWidth+340])for(let y=0;y<2000;y++){const i=(y*spec.width+x)*3;assert.ok(wrap.data.subarray(i,i+3).equals(bg.subarray(i,i+3)),game+' exact owner material at outer/fold column '+x+'/'+y);}
  for(const y of [0,1999]){const start=y*spec.width*3;assert.ok(wrap.data.subarray(start,start+spec.width*3).equals(bg.subarray(start,start+spec.width*3)),game+' no top/bottom normalization bar');}
  for(const [face,left,width]of [['back',0,spec.faceWidth],['spine',spec.faceWidth,340],['front',spec.faceWidth+340,spec.faceWidth]]){
   const masterPath=dir+game+'/'+face+'-master.png',masterBytes=await read(masterPath);assert.equal(digest(masterBytes),spec.masters[face]);
   const master=await sharp(masterBytes).removeAlpha().raw().toBuffer();const cut=await sharp(wrapBytes).extract({left,top:0,width,height:2000}).removeAlpha().raw().toBuffer();assert.ok(master.equals(cut),'all three faces are exact cuts from one continuous wrap');
   const row=recipe.faces.find(row=>row.game===game&&row.face===face);assert.equal(row.source,masterPath);assert.deepEqual([row.width,row.height],[width,2000]);assert.deepEqual(row.crop,{left:0,top:0,width,height:2000});assert.deepEqual(row.content,{left:0,top:0,width,height:2000});
   if(face==='spine')assert.equal(row.canvas,undefined,'spine never overrides universal dimensions');else assert.deepEqual(row.canvas??recipe.standard[face],[width,2000]);
   const runtime=await sharp(await read(row.path)).removeAlpha().raw().toBuffer();assert.ok(runtime.equals(master),'runtime cannot recrop/regrade original foreground or owner background');
   assert.equal(recipe.sources.find(source=>source.archivePath===masterPath).origin,'authoring','deterministic source composition is not an imagegen result');
  }
  const layers=composition.records.filter(row=>row.name?.startsWith(game+':'));
  for(const layer of layers)assert.equal(digest(await read(layer.source)),layer.sourceSha256,'retained source raster for '+layer.name);
  for(const [name,[source,box,mask]]of Object.entries(anchors)){
   const layer=layers.find(row=>row.name===game+':spine:'+name);assert.ok(layer);assert.equal(layer.source,sourceSpine);assert.deepEqual(layer.sourceRectangle,rect(source));assert.equal(layer.mask,mask);
   const scale=Math.min(box[2]/source[2],box[3]/source[3]),w=Math.round(source[2]*scale),h=Math.round(source[3]*scale);assert.deepEqual(layer.destination,{left:spec.faceWidth+box[0]+Math.floor((box[2]-w)/2),top:box[1]+Math.floor((box[3]-h)/2),width:w,height:h},'matching original spine anchor '+name);
  }
  const numeral=layers.find(row=>row.name===game+':spine:mission-number');assert.ok(numeral);assert.equal(numeral.source,'assets/authoring/box_art/originals-2026-10-20/'+game+'/spine.png');assert.deepEqual(numeral.sourceRectangle,rect(game==='hipnotic'?[437,1135,43,35]:[452,1109,43,37]));
  const distributed=layers.find(row=>row.name===game+':back:distributed');assert.ok(distributed,'tiny original Distributed by label remains a separate foreground');assert.equal(distributed.thinInkTopHat,true);assert.deepEqual(distributed.sourceRectangle,rect(game==='hipnotic'?[612,808,82,18]:[359,808,80,19]));
  assert.equal(layers.filter(row=>row.name.startsWith(game+':back:screenshot-')).length,4,'all original back screenshots retained');
  assert.ok(layers.find(row=>row.name===game+':front:requirement'),'complete original requirement line');assert.ok(layers.find(row=>row.name===game+':front:medallion'),'original medallion, no regenerated symbol');
 }
});


test('owner-approved four matching pairs are exact final crops with all49 other faces unchanged',async()=>{
 const dir='docs/evidence/box-art-face-sizing-2026-10-21/';
 const audit=await json(dir+'audit.json'),approved=await json(dir+'approved-crops.json');
 const recipe=await json('docs/evidence/box-art-standardization-2026-10-20/derivation.json');
 const sizes={quake:[1640,1912],ad:[1523,2000],mod_hexen_2_shareware:[1415,2000],mod_hexen_2_portal_of_praevus:[1562,2000]};
 assert.equal(approved.decisions.length,8);assert.equal(audit.baselineImages.length,57);
 for(const old of audit.baselineImages){
  const row=recipe.faces.find(f=>f.path===old.path),bytes=await read(old.path);
  if(!ownerCroppedFaces.has(old.path)){assert.equal(digest(bytes),old.sha256,'all49 untouched images including every spine: '+old.path);continue;}
  const decision=approved.decisions.find(d=>d.game===row.game&&d.face===row.face);
  assert.deepEqual(row.outputCrop,decision.outputCrop);assert.deepEqual([row.width,row.height],sizes[row.game]);
  assert.deepEqual(row.content,{left:0,top:0,width:row.width,height:row.height});
  const [width,height]=row.canvas??recipe.standard[row.face],crop=row.crop,scale=Math.min(width/crop.width,height/crop.height);
  const cw=Math.round(crop.width*scale),ch=Math.round(crop.height*scale);
  const pixels=await sharp(await read(row.source)).extract(crop).resize(cw,ch,{kernel:'lanczos3'}).toBuffer();
  const original=await sharp({create:{width,height,channels:3,background:row.background??'#15110c'}}).composite([{input:pixels,left:Math.floor((width-cw)/2),top:Math.floor((height-ch)/2)}]).webp({lossless:true,effort:6}).toBuffer();
  assert.equal(digest(original),old.sha256,'exact pre-crop source derivation: '+old.path);
  const expected=await sharp(original).extract(row.outputCrop).removeAlpha().raw().toBuffer();
  assert.ok(expected.equals(await sharp(bytes).removeAlpha().raw().toBuffer()),'only exact authorized final pixels removed: '+old.path);
 }
 assert.equal(audit.baselineImages.filter(row=>!ownerCroppedFaces.has(row.path)).length,49);
});
