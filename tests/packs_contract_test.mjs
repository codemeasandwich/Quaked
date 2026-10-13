import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PackChain,CommonAncestor,PacksFor,PackClassifier} from '../tools/distribution/packs.mjs';
import {collectAssets} from '../tools/distribution/manifest.mjs';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
// Per-game data packs (docs/per-game-packs-design-2026-10-13.md).
test('a game needs its own pack and its ancestors; shared assets go to the nearest common ancestor',()=>{
 assert.deepEqual(PackChain('rogue'),['rogue','quake','shareware','core']);
 assert.deepEqual(PacksFor('shareware'),['core','shareware']);
 assert.deepEqual(PacksFor('hipnotic'),['core','shareware','quake','hipnotic']);
 assert.equal(CommonAncestor(['hipnotic','rogue']),'quake','siblings share their base, never each other');
 assert.equal(CommonAncestor(['shareware','rogue']),'shareware');
 assert.equal(CommonAncestor(['quake']),'quake');
 assert.equal(CommonAncestor([]),'core','used by no game: everyone gets it');
});
test('every asset the app ships belongs to exactly one known pack',async()=>{
 const classify=await PackClassifier(),known=new Set(['core',...GAME_CATALOGUE_GAMES.map(game=>game.id)]);
 const paths=await collectAssets({profile:'desktop'}),packs=new Map();
 for(const path of paths){const pack=classify(path);assert.ok(known.has(pack),`${path}: unknown pack ${pack}`);packs.set(pack,(packs.get(pack)??0)+1);}
 for(const pack of ['core','shareware','quake','hipnotic','rogue'])assert.ok(packs.get(pack)>0,`${pack} pack is not empty`);
 // Prepared level data goes to the level's own game, never core.
 for(const path of paths.filter(p=>/^newer\/(displacement|rockfield)\//.test(p)))assert.notEqual(classify(path),'core',path);
});
test('the game index covers every enemy model with Newer skins and names only catalogue games',async()=>{
 const games=JSON.parse(await readFile('newer/packs/games.json','utf8')),enemies=JSON.parse(await readFile('newer/enemies/index.json','utf8'));
 const ids=new Set(GAME_CATALOGUE_GAMES.map(game=>game.id));
 for(const model of Object.keys(enemies.models))assert.ok(games.models['progs/'+model+'.mdl'],`no game has progs/${model}.mdl`);
 for(const owners of Object.values(games.models))for(const id of Object.keys(owners))assert.ok(ids.has(id),id);
 for(const list of Object.values(games.textures))for(const id of list)assert.ok(ids.has(id),id);
});
