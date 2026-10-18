// Which games use each Newer texture, enemy model and BSP (docs/per-game-packs-design-2026-10-13.md).
// Run against the owner's game library, like the repository's other baked manifests; the build
// and CI then classify assets into per-game packs from the committed result alone.
//
//   node tools/distribution/build_game_index.mjs [library root, default ~/quaked]
//
// Writes newer/packs/games.json:
//   games[id]: PAK count, BSP count and the SHA-256 of every BSP the game's PAKs provide (the
//     runtime picks prepared level data by BSP identity, so rows are classified by it);
//   textures[name]: the games whose BSPs name each texture the texture index can upgrade
//     (pictures, crafted normals, glass);
//   models[progs/x.mdl][game]: the SHA-256 of each game's copy of every model with Newer skins
//     or native heights (so model-bound skin variants are matched exactly);
//   sources: SHA-256 of the sorted texture and model names it was built from, so a stale index
//     fails tests/packs_contract_test.mjs.
// A playable (non-placeholder) catalogue game with no PAKs in the library is refused: its shared
// assets would otherwise be classified as if it did not exist.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {assetPath} from './manifest.mjs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {pakDirectory,readMember,sha256} from '../pak_members.mjs';
import {GAME_CATALOGUE_GAMES} from '../../src/engine/common/game_catalogue.js';
const repo=resolve(fileURLToPath(new URL('../..',import.meta.url))),library=resolve(process.argv[2]??join(homedir(),'quaked'));
const json=async path=>JSON.parse(await readFile(assetPath(repo,path),'utf8'));
export async function IndexSources(){
 const textureIndex=await json('newer/textures/index.json'),enemyIndex=await json('newer/enemies/index.json');
 const textures=[...new Set([...Object.keys(textureIndex.textures),...Object.keys(textureIndex.normals??{}),...Object.keys(textureIndex.glass??{}),...Object.keys(textureIndex.ordinaryVariants??{})].map(name=>name.toLowerCase()))].sort();
 const models=[...new Set([...Object.keys(enemyIndex.models),...Object.keys(enemyIndex.nativeHeights??{})].map(key=>'progs/'+key+'.mdl'))].sort();
 return {textures,models,sources:{textureNames:createHash('sha256').update(textures.join('\n')).digest('hex'),modelNames:createHash('sha256').update(models.join('\n')).digest('hex')}};
}
// The BSP's texture names (miptex lump 2; the same offsets in BSP29 and BSP2).
function bspTextures(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=view.getInt32(4+2*8,true),length=view.getInt32(8+2*8,true),names=new Set();
 if(length<4)return names;
 const count=view.getInt32(offset,true);
 for(let i=0;i<count;i++){const at=view.getInt32(offset+4+i*4,true);if(at<0)continue;const raw=bytes.subarray(offset+at,offset+at+16),end=raw.indexOf(0);names.add(new TextDecoder().decode(raw.subarray(0,end<0?16:end)).toLowerCase());}
 return names;
}
// A game's PAKs in Quake's order (pak0, pak1, ...; stopping at the first gap); later PAKs override.
async function gamePaks(game){
 const paks=[];
 for(const folder of (game.folders??[]).filter(f=>f.startsWith('games/'))){
  const dir=join(library,folder.slice(6));let names=[];try{names=await readdir(dir);}catch{continue;}
  const byIndex=new Map(names.map(n=>[/^pak(\d+)\.pak$/i.exec(n)?.[1],n]).filter(([i])=>i!==undefined).map(([i,n])=>[Number(i),n]));
  for(let i=0;byIndex.has(i);i++)paks.push(join(dir,byIndex.get(i)));
  if(paks.length)break;
 }
 return paks;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {textures,models,sources}=await IndexSources(),wantTextures=new Set(textures),wantModels=new Set(models);
 const index={version:2,library:library.replace(homedir(),'~'),sources,games:{},textures:{},models:{}};
 for(const game of GAME_CATALOGUE_GAMES){
  const paks=await gamePaks(game);
  if(!paks.length){if(!game.placeholder)throw Error(`No PAKs for ${game.id} under ${library}; the index needs every playable game`);index.games[game.id]={paks:0,bsps:[]};continue;}
  const members=new Map();for(const pak of paks)for(const [name,entry] of await pakDirectory(pak))members.set(name.toLowerCase(),entry);
  const used=new Set(),bsps=new Set(),gameModels={};
  for(const [name,entry] of members){
   if(name.endsWith('.bsp')){const bytes=await readMember(entry);bsps.add(sha256(bytes));for(const t of bspTextures(bytes))if(wantTextures.has(t))used.add(t);}
   else if(wantModels.has(name))gameModels[name]=sha256(await readMember(entry));
  }
  index.games[game.id]={paks:paks.length,bsps:[...bsps].sort()};
  for(const t of used)(index.textures[t]??=[]).push(game.id);
  for(const [m,digest] of Object.entries(gameModels))(index.models[m]??={})[game.id]=digest;
 }
 for(const list of Object.values(index.textures))list.sort();
 index.textures=Object.fromEntries(Object.entries(index.textures).sort());index.models=Object.fromEntries(Object.entries(index.models).sort());
 await mkdir(assetPath(repo,'newer/packs'),{recursive:true});await writeFile(assetPath(repo,'newer/packs/games.json'),JSON.stringify(index,null,1)+'\n');
 console.log(JSON.stringify(Object.fromEntries(Object.entries(index.games).map(([id,g])=>[id,{paks:g.paks,bsps:g.bsps.length}]))));
}
