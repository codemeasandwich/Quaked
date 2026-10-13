import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PackChain,CommonAncestor,PacksFor,PackClassifier,NAMESPACE} from '../tools/distribution/packs.mjs';
import {IndexSources} from '../tools/distribution/build_game_index.mjs';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {GAME_SELECTION_CHOICES} from '../src/engine/common/game_selection.js';
// Per-game data packs (docs/per-game-packs-design-2026-10-13.md).
const json=async path=>JSON.parse(await readFile(path,'utf8'));
test('a game needs its own pack and its ancestors; shared assets go to the nearest common ancestor',()=>{
 assert.deepEqual(PackChain('rogue'),['rogue','quake','shareware','core']);
 assert.deepEqual(PacksFor('shareware'),['core','shareware']);
 assert.deepEqual(PacksFor('hipnotic'),['core','shareware','quake','hipnotic']);
 assert.equal(CommonAncestor(['hipnotic','rogue']),'quake','siblings share their base, never each other');
 assert.equal(CommonAncestor(['shareware','rogue']),'shareware');
 assert.equal(CommonAncestor([]),'core','used by no game: everyone gets it');
 assert.throws(()=>PackChain('nonsense'),/Unknown pack/);
});
test('the committed game index is current and covers every playable game',async()=>{
 const games=await json('newer/packs/games.json'),{sources}=await IndexSources();
 assert.deepEqual(games.sources,sources,'newer/packs/games.json was built from the current texture and enemy indexes (re-run tools/distribution/build_game_index.mjs)');
 for(const game of GAME_CATALOGUE_GAMES)if(!game.placeholder)assert.ok(games.games[game.id]?.paks>0&&games.games[game.id].bsps.length>0,`${game.id} indexed`);
});
// Every playable game must find, in its own packs, every asset its levels, textures and models can ask for.
test('each playable game finds all of its assets in its own packs',async()=>{
 const classify=await PackClassifier(),games=await json('newer/packs/games.json'),enemies=await json('newer/enemies/index.json'),textures=await json('newer/textures/index.json');
 const normals=await json('newer/normals/manifest.json'),prepared=[await json('newer/displacement/manifest.json'),await json('newer/rockfield/manifest.json')];
 const checked=new Set();
 for(const id of GAME_SELECTION_CHOICES){
  const chain=new Set(PackChain(id)),bsps=new Set(games.games[id].bsps),need=(file,why)=>assert.ok(chain.has(classify(file)),`${id} needs ${file} (${why}) but it is in ${classify(file)}`);
  // Rows are matched by BSP; levels a game ships outside its PAKs (the rebuilt hub in newer/maps.pak)
  // by the namespace of a game in its chain.
  const ours=namespace=>chain.has(NAMESPACE[namespace]);
  for(const value of prepared.flatMap(m=>Object.values(m.levels)))for(const row of Array.isArray(value)?value:[value]){const files=row.parts?row.parts.map(p=>p.file):[row.file];if(bsps.has(row.bspSha256)||ours(row.namespace??files[0].split('/')[2]))for(const f of files)need(f,'prepared data for its level');}
  for(const [name,level] of Object.entries(normals.levels))if(bsps.has(level.bspSha256)||ours(name.slice(0,name.indexOf(':'))))for(const key of level.keys??[])need(normals.samples[key].file,'normal sample for its level');
  const glassFiles=name=>Object.values(textures.glass?.[name]??{}).flatMap(v=>Object.values(v)).filter(f=>typeof f==='string'&&/\.(png|webp)$/.test(f));
  for(const [name,users] of Object.entries(games.textures))if(users.includes(id)){if(textures.textures[name])need('newer/textures/'+textures.textures[name],'texture '+name);if(textures.normals?.[name])need('newer/textures/'+textures.normals[name].file,'crafted normal '+name);for(const f of glassFiles(name))need('newer/textures/'+f,'glass '+name);}
  const shown=[];
  for(const [model,list] of Object.entries(enemies.models)){const owners=games.models['progs/'+model+'.mdl']?.[id];if(!owners)continue;
   for(const v of list)if(!v.nativeModelSha256||v.nativeModelSha256===owners){shown.push(v.dir);for(const file of Object.values(v.maps))need(`newer/enemies/${v.dir}/${file}`,'skin '+v.dir);}}
  for(const dir of shown)for(const key of normals.levels['custom:'+dir]?.keys??[])need(normals.samples[key].file,'skin normal '+dir);
  for(const [model,skins] of Object.entries(enemies.nativeHeights??{}))if(games.models['progs/'+model+'.mdl']?.[id])for(const h of skins.flat(2))need('newer/enemies/'+h.file,'native height '+model);
  checked.add(id);
 }
 assert.deepEqual([...checked].sort(),[...GAME_SELECTION_CHOICES].sort());
});
test('the shareware pack holds everything the HTML can start with',async()=>{
 const classify=await PackClassifier(),prefetch=await json('newer/normals/startup-prefetch.json'),normals=await json('newer/normals/manifest.json');
 for(const spec of Object.values(prefetch.levels).flat())for(const key of spec.keys)assert.ok(['core','shareware'].includes(classify(normals.samples[key].file)),`startup normal ${key} is in core or shareware`);
});
