/** Current runtime/art-source inventory. No owner-library reads, builds or cleanup are performed. */
import test from 'node:test';
// Include exhaustive independent pixel/custody checks in the maintained distribution gate.
import './box_art_standardization_test.mjs';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {GAME_BOXES} from '../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {collectAssets,validateArtifactInventory} from '../tools/distribution/manifest.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const expectedGames=['shareware','quake','hipnotic','rogue','mg1','malice','xmen','aopfm_v2','quoth','mod_quaked','mod_hexen_2','mod_hexen_2_portal_of_praevus','dopa','ad','dawn','mod_alkaline','mod_tremor','mod_hexen_2_shareware','mod_the_immortal_lock'];
const discovered=['mod_alkaline','mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_hexen_2_shareware','mod_quaked','mod_the_immortal_lock','mod_tremor'];
const expectedRows=expectedGames.flatMap(game=>['front','back','spine'].filter(face=>game!=='mod_hexen_2'||face!=='back').map(face=>({game,face,path:`assets/boxes/${game}/${face}.webp`}))).sort((a,b)=>a.path.localeCompare(b.path));
const derivationPath='docs/evidence/box-art-standardization-2026-10-20/derivation.json';
const historicalManifestPath='docs/evidence/box-art-standardization-2026-10-20/baseline-runtime-manifest.json';
const historicalPath=(derivation,path)=>derivation.historicalResolution[path]??path;
const identities={
 'quoth:front':'e2a33f0eca75fce9505df1534807e74c554579ac477fcfc9ca0b8ccc642d76c1',
 'mg1:front':'dd5dc40420b93912a79d03898d903dae0dcb5098d86b4762fc12b8483082b93e',
 'mg1:back':'fdea1c72d809c5ebd6407553e6f005d6cec8af4ee56484e8daeccc4ce0ad091f',
 'mg1:spine':'b93a28e9ff25427b79267d5f4c005b63dd6513e46f4ed24aae9e3b6248ee090d'
};
const verify=async(row,path)=>{const bytes=await readFile(new URL('../'+path,import.meta.url));assert.equal(bytes.length,row.bytes,path+' byte length');assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,path+' original bytes');};
async function images(dir){const result=[];for(const entry of await readdir(new URL('../'+dir,import.meta.url),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await images(path));else if(entry.isFile()&&/\.(png|jpe?g|webp|gif|avif)$/i.test(path))result.push(path);}return result;}

test('the current manifest binds fifty-six standard WebP faces to nineteen approved games',async()=>{
 assert.deepEqual(Object.keys(GAME_BOXES).filter(id=>!GAME_CATALOGUE_GAMES.some(g=>g.id===id)).sort(),discovered,'only approved discovered defaults are exposed');
 const manifest=await json('assets/boxes/manifest.json'),derivation=await json(derivationPath);
 assert.equal(manifest.faces.length,56);assert.equal(new Set(manifest.faces.map(row=>row.path)).size,56);assert.equal(new Set(manifest.faces.map(row=>row.sha256)).size,56,'runtime faces remain distinct images');
 assert.deepEqual(manifest.faces.map(({game,face,path})=>({game,face,path})).sort((a,b)=>a.path.localeCompare(b.path)),expectedRows,'all runtime roles use canonical separate face paths');
 const live=Object.entries(GAME_BOXES).flatMap(([game,faces])=>['front','back','spine'].filter(face=>faces[face]).map(face=>({game,face,path:faces[face]}))).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(live,expectedRows,'live source and approved manifest roles agree exactly');
 assert.deepEqual(derivation.faces.map(({game,face,path})=>({game,face,path})).sort((a,b)=>a.path.localeCompare(b.path)),expectedRows,'each runtime face has a derivation');
 for(const row of manifest.faces){
  await verify(row,row.path);
  const bytes=await readFile(new URL('../'+row.path,import.meta.url)),metadata=await sharp(bytes).metadata(),dimensions=row.face==='spine'?[340,2000]:[1640,2000];
  assert.equal(metadata.format,'webp',row.path+' actual format');assert.deepEqual([metadata.width,metadata.height],dimensions,row.path+' decoded standard dimensions');
  const derived=derivation.faces.find(face=>face.path===row.path);assert.equal(derived.sha256,row.sha256,row.path+' derivation hash');assert.equal(derived.bytes,row.bytes,row.path+' derivation bytes');assert.deepEqual([derived.width,derived.height],dimensions,row.path+' derivation dimensions');
  const source=derivation.sources.find(source=>(source.archivePath===derived.source||source.originalPath===derived.source)&&source.sha256===derived.sourceSha256);assert.ok(source,row.path+' has an identified retained original');
 }
 assert.notEqual(manifest.faces.find(row=>row.game==='quoth'&&row.face==='front').sha256,manifest.faces.find(row=>row.game==='mod_quaked'&&row.face==='front').sha256,'real Quoth front remains distinct from Quaked art');
 assert.equal(GAME_BOXES.mod_q30a1024,undefined,'a screenshot collage has no default box role');
 assert.equal(GAME_BOXES.mod_hexen_2.back,undefined,'an absent supplied Hexen II back remains a placeholder');
});

test('historical receipts retain exact original custody through the standardization archive mapping',async()=>{
 const plan=await json('docs/evidence/box-art-consolidation-2026-10-19/move-plan.json'),historical=(await json(historicalManifestPath)).faces,derivation=await json(derivationPath),active=(await json('assets/boxes/manifest.json')).faces;
 const receipt=await json('docs/evidence/box-art-consolidation-2026-10-19/manifest.json'),originalManifest=await readFile(new URL('../'+historicalManifestPath,import.meta.url));
 assert.equal(receipt.sourceHashes['assets/boxes/manifest.json'],'20d4297d8deb33a44f91b404a9d697b5ccb3af0d755cfb5e2eb6c53d42b621ff','the historical manifest pin is preserved');
 assert.equal(createHash('sha256').update(originalManifest).digest('hex'),receipt.sourceHashes['assets/boxes/manifest.json'],'the prior runtime manifest remains exact historical evidence');
 assert.equal(historical.length,29);assert.equal(new Set(historical.map(row=>row.sha256)).size,29);
 assert.equal(plan.files.length,41);assert.equal(new Set(plan.files.map(row=>row.path)).size,41);assert.equal(new Set(plan.files.map(row=>row.sha256)).size,29);assert.equal(plan.files.length-new Set(plan.files.map(row=>row.sha256)).size,12);
 assert.equal(plan.projectRelocations.length,13);assert.equal(new Set(plan.projectRelocations.map(row=>row.destination)).size,13);assert.equal(new Set(plan.projectRelocations.map(row=>row.sha256)).size,13);
 assert.equal(new Set([...historical,...plan.projectRelocations].map(row=>row.sha256)).size,42,'all forty-two previously canonical original blobs remain represented');
 assert.deepEqual(Object.keys(derivation.historicalResolution).sort(),historical.map(row=>row.path).sort(),'every former runtime original has an explicit retained resolution');
 for(const row of historical){assert.ok(historicalPath(derivation,row.path).startsWith('assets/authoring/box_art/'),row.path+' original is retained outside runtime');if(identities[row.game+':'+row.face])assert.equal(row.sha256,identities[row.game+':'+row.face],'the four selected original identities remain in historical custody');}
 const byHash=new Map(),canonical=new Set(active.map(row=>row.path));
 const originals=[...historical.map(row=>({...row,destination:row.path})),...plan.files,...plan.projectRelocations,...derivation.sources.map(row=>({...row,destination:row.archivePath}))];
 for(const row of originals){const path=historicalPath(derivation,row.destination);assert.ok(path.startsWith('assets/authoring/box_art/'),path+' retained source-only path');await verify(row,path);const paths=byHash.get(row.sha256)??new Set();paths.add(path);byHash.set(row.sha256,paths);canonical.add(path);}
 for(const [sha,paths]of byHash)assert.equal(paths.size,1,'one canonical project path for original blob '+sha);
 assert.deepEqual((await images('assets/boxes')).concat(await images('assets/authoring/box_art')).sort(),[...canonical].sort(),'only runtime derivatives and canonical retained originals exist in image directories');
 assert.equal(plan.held.length,1);assert.equal(plan.held[0].sha256,'9fdf29e62fc829c8c48fe764bc8d19739506849b17b8b99eb9218ad262df48f1');assert.ok(!plan.files.some(row=>row.path===plan.held[0].path),'held launch poster is outside the cleanup plan');
 const collage=plan.projectRelocations.find(row=>row.source==='assets/boxes/mod_q30a1024/front.png');assert.equal(collage.destination,'assets/authoring/box_art/q30a1024/screenshots.png');assert.equal(collage.sha256,'c2689921d7e87524dac65729dbdc0e80349eab71cde916504c5c54aea47bb8b0');
 const oldFront=plan.projectRelocations.find(row=>row.source==='assets/boxes/mg1/front.jpg');assert.equal(oldFront.destination,'assets/authoring/box_art/mg1/front-previous.jpg');assert.equal(oldFront.sha256,'55e0245bc9d18584dc8fcc3a62370c92ac6075545d5cd99b5013cd80f0a782b1');
});

test('the real desktop collector ships every active face while excluding source-only archives and inactive old image paths',async()=>{
 const assets=await collectAssets({profile:'desktop',root}),included=new Set(assets),active=(await json('assets/boxes/manifest.json')).faces;
 for(const row of active)assert.ok(included.has(row.path),`${row.game} ${row.face} is shipped without local art`);
 for(const path of ['assets/boxes/mg1/front.jpg','assets/boxes/mod_q30a1024/front.png'])assert.ok(!included.has(path),'inactive old path is not packaged: '+path);
 assert.ok(!assets.some(path=>path.startsWith('assets/authoring/box_art/')),'all source-only original art stays out of runtime packages');
 assert.doesNotThrow(()=>validateArtifactInventory(assets,'desktop'));assert.ok(!assets.some(path=>/^(games|resources)\//.test(path)),'art consolidation does not import original game archives');
});
