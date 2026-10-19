/** Current runtime/art-source inventory. No owner-library reads, builds or cleanup are performed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GAME_BOXES} from '../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {collectAssets,validateArtifactInventory} from '../tools/distribution/manifest.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const json=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const expected={
 shareware:['front.png','back.png','spine.png'],quake:['front.jpg','back.jpg','spine.jpg'],
 hipnotic:['front.jpg','back.jpg','spine.png'],rogue:['front.jpg','back.jpg','spine.png'],
 mg1:['front.png','back.png','spine.png'],malice:['front.jpg','back.jpg'],xmen:['front.jpg','back.jpg'],aopfm_v2:['front.jpg'],
 quoth:['front.png','back.png','spine.png'],mod_quaked:['front.png'],mod_hexen_2:['front.webp','spine.webp'],
 mod_hexen_2_portal_of_praevus:['front.webp','back.webp','spine.webp']
};
const expectedRows=Object.entries(expected).flatMap(([game,names])=>names.map(name=>({game,face:name.split('.')[0],path:`assets/boxes/${game}/${name}`}))).sort((a,b)=>a.path.localeCompare(b.path));
const identities={
 'quoth:front':'e2a33f0eca75fce9505df1534807e74c554579ac477fcfc9ca0b8ccc642d76c1',
 'mg1:front':'dd5dc40420b93912a79d03898d903dae0dcb5098d86b4762fc12b8483082b93e',
 'mg1:back':'fdea1c72d809c5ebd6407553e6f005d6cec8af4ee56484e8daeccc4ce0ad091f',
 'mg1:spine':'b93a28e9ff25427b79267d5f4c005b63dd6513e46f4ed24aae9e3b6248ee090d'
};
const verify=async(row,path)=>{const bytes=await readFile(new URL('../'+path,import.meta.url));assert.equal(bytes.length,row.bytes,path+' byte length');assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,path+' original bytes');};
async function images(dir){const result=[];for(const entry of await readdir(new URL('../'+dir,import.meta.url),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await images(path));else if(entry.isFile()&&/\.(png|jpe?g|webp|gif|avif)$/i.test(path))result.push(path);}return result;}

test('the current manifest binds all twenty-nine runtime roles to exact active images and three approved discovered ids',async()=>{
 assert.deepEqual(Object.keys(GAME_BOXES).filter(id=>!GAME_CATALOGUE_GAMES.some(g=>g.id===id)).sort(),['mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_quaked'],'only these discovered defaults remain approved');
 const manifest=await json('assets/boxes/manifest.json');assert.equal(manifest.faces.length,29);assert.equal(new Set(manifest.faces.map(row=>row.path)).size,29);assert.equal(new Set(manifest.faces.map(row=>row.sha256)).size,29);
 assert.deepEqual(manifest.faces.map(({game,face,path})=>({game,face,path})).sort((a,b)=>a.path.localeCompare(b.path)),expectedRows,'no inactive collage, old Machine JPG or unrelated role can enter the live inventory');
 const live=Object.entries(GAME_BOXES).flatMap(([game,faces])=>['front','back','spine'].filter(face=>faces[face]).map(face=>({game,face,path:faces[face]}))).sort((a,b)=>a.path.localeCompare(b.path));assert.deepEqual(live,expectedRows,'live source and approved manifest roles agree exactly');
 for(const row of manifest.faces){await verify(row,row.path);if(identities[row.game+':'+row.face])assert.equal(row.sha256,identities[row.game+':'+row.face],'the four new native images retain their selected identities');}
 assert.notEqual(manifest.faces.find(row=>row.game==='quoth'&&row.face==='front').sha256,manifest.faces.find(row=>row.game==='mod_quaked').sha256,'real Quoth front is distinct from the previously misfiled Quaked art');
 assert.equal(GAME_BOXES.mod_q30a1024,undefined,'a screenshot collage has no default box role');
});

test('archive and dedup records retain original bytes once per project blob without reading or deleting game-folder sources',async()=>{
 const plan=await json('docs/evidence/box-art-consolidation-2026-10-19/move-plan.json'),active=(await json('assets/boxes/manifest.json')).faces;
 assert.equal(plan.files.length,41);assert.equal(new Set(plan.files.map(row=>row.path)).size,41);assert.equal(new Set(plan.files.map(row=>row.sha256)).size,29);assert.equal(plan.files.length-new Set(plan.files.map(row=>row.sha256)).size,12);
 assert.equal(plan.projectRelocations.length,13);assert.equal(new Set(plan.projectRelocations.map(row=>row.destination)).size,13);assert.equal(new Set(plan.projectRelocations.map(row=>row.sha256)).size,13);
 const byHash=new Map();for(const row of [...active.map(row=>({...row,destination:row.path})),...plan.files,...plan.projectRelocations]){assert.ok(/^(assets\/boxes\/|assets\/authoring\/box_art\/)/.test(row.destination));await verify(row,row.destination);const paths=byHash.get(row.sha256)??new Set();paths.add(row.destination);byHash.set(row.sha256,paths);}
 for(const [sha,paths]of byHash)assert.equal(paths.size,1,'one canonical project path for original blob '+sha);
 const canonical=[...new Set([...active.map(row=>row.path),...plan.projectRelocations.map(row=>row.destination)])].sort();assert.equal(canonical.length,42);assert.deepEqual((await images('assets/boxes')).concat(await images('assets/authoring/box_art')).sort(),canonical,'no inactive duplicates remain in runtime or archive image directories');
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
