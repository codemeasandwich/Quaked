/** Per-game data packs (docs/per-game-packs-design-2026-10-13.md): which pack every shipped Newer
 * asset belongs to. Packs are the game catalogue's IDs plus `core`. A game needs its own pack and
 * its ancestors' (core, then shareware, then quake, then the game; the catalogue's `base` gives a
 * game's parent); an asset used by several games goes to their nearest common ancestor, so nothing
 * is duplicated and no game needs a sibling's pack.
 *
 * Classification follows what the runtime actually matches: prepared level data (displacement,
 * rockfield) and level normal samples are picked by the BSP's SHA-256, so a row belongs to every
 * game whose PAKs provide a BSP with that hash (newer/packs/games.json), as well as to the game its
 * manifest namespace names; textures to the games whose BSPs name them; skin variants to the games
 * whose model they can bind to. Built only from data committed in the repository.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {GAME_CATALOGUE_GAMES} from '../../src/engine/common/game_catalogue.js';
export const PACK_PARENT=Object.freeze(Object.fromEntries([['core',null],['shareware','core'],['quake','shareware'],...GAME_CATALOGUE_GAMES.filter(game=>!['shareware','quake'].includes(game.id)).map(game=>[game.id,game.base??'quake'])]));
function parent(pack){if(!(pack in PACK_PARENT))throw Error('Unknown pack '+pack);return PACK_PARENT[pack];}
/** Ancestors of a pack, nearest first, ending with core. */
export function PackChain(pack){const chain=[];for(let p=pack;p;p=parent(p))chain.push(p);return chain;}
/** The nearest pack every game in the set has (core for an empty set). */
export function CommonAncestor(games){
 const list=[...games];if(!list.length)return 'core';
 const chains=list.map(PackChain);return chains[0].find(p=>chains.every(chain=>chain.includes(p)));
}
/** Manifest namespaces to games: id1 and the bundled loose maps belong to the full game; the hub to the shareware. */
export const NAMESPACE={shareware:'shareware',newer:'shareware',id1:'quake',quake:'quake',loose:'quake',hipnotic:'hipnotic',rogue:'rogue',dopa:'dopa',mg1:'mg1'};
export async function PackClassifier(root=process.cwd()){
 const json=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 const [games,enemies,textures,normals,displacement,rockfield]=await Promise.all(['newer/packs/games.json','newer/enemies/index.json','newer/textures/index.json','newer/normals/manifest.json','newer/displacement/manifest.json','newer/rockfield/manifest.json'].map(json));
 const bspGames=new Map();for(const [id,game] of Object.entries(games.games))for(const sha of game.bsps??[])(bspGames.get(sha)??bspGames.set(sha,new Set()).get(sha)).add(id);
 const byBsp=sha=>[...(sha&&bspGames.get(sha)||[])];
 const variants=new Map();for(const [model,list] of Object.entries(enemies.models))for(const v of list)variants.set(v.dir,{model,variant:v});
 // Games that can show a skin variant: those whose model file it is bound to, else every game with the model.
 const variantGames=dir=>{
  const found=variants.get(dir);if(!found)throw Error('Unknown enemy variant '+dir);
  const owners=games.models['progs/'+found.model+'.mdl']??{};
  const ids=found.variant.nativeModelSha256?Object.keys(owners).filter(g=>owners[g]===found.variant.nativeModelSha256):Object.keys(owners);
  if(!ids.length)throw Error('No game in the index has the model for '+dir);
  return ids;
 };
 const modelGames=model=>Object.keys(games.models['progs/'+model+'.mdl']??{});
 const namespaceGame=namespace=>{const game=NAMESPACE[namespace];if(!game)throw Error('Unknown manifest namespace '+namespace);return game;};
 const owner=new Map(),claim=(file,ids)=>{const set=owner.get(file)??new Set();for(const id of ids)set.add(id);owner.set(file,set);};
 for(const [name,level] of Object.entries(normals.levels)){
  const namespace=name.slice(0,name.indexOf(':')),ids=namespace==='custom'?variantGames(name.slice(name.indexOf(':')+1)):[namespaceGame(namespace),...byBsp(level.bspSha256)];
  for(const key of level.keys??[])if(normals.samples[key])claim(normals.samples[key].file,ids);
 }
 for(const manifest of [displacement,rockfield])for(const value of Object.values(manifest.levels))for(const row of Array.isArray(value)?value:[value]){
  const files=row.parts?row.parts.map(p=>p.file):[row.file],namespace=row.namespace??files[0]?.split('/')[2];
  for(const file of files)claim(file,[namespaceGame(namespace),...byBsp(row.bspSha256)]);
 }
 const textureFiles=new Map(),add=(file,name)=>{if(!file)return;const set=textureFiles.get(file)??new Set();set.add(name.toLowerCase());textureFiles.set(file,set);};
 for(const [name,file] of Object.entries(textures.textures))add('newer/textures/'+file,name);
 for(const [name,spec] of Object.entries(textures.normals??{}))add('newer/textures/'+spec.file,name);
 for(const [name,byKey] of Object.entries(textures.glass??{}))for(const v of Object.values(byKey))for(const f of Object.values(v))if(typeof f==='string'&&/\.(png|webp)$/.test(f))add('newer/textures/'+f,name);
 return path=>{
  if(owner.has(path))return CommonAncestor(owner.get(path));
  if(textureFiles.has(path))return CommonAncestor([...textureFiles.get(path)].flatMap(name=>games.textures[name]??[]));
  let m=/^newer\/enemies\/heights\/([^/]+)\//.exec(path);if(m)return CommonAncestor(modelGames(m[1]));
  m=/^newer\/enemies\/([^/]+\/[^/]+)\//.exec(path);if(m&&variants.has(m[1]))return CommonAncestor(variantGames(m[1]));
  return 'core';
 };
}
/** Packs a game needs, core first. */
export const PacksFor=game=>PackChain(game).reverse();
/** The web's data files: the core and shareware packs, and the shareware PAK on its own
 * (`pak0`, gzipped), as the owner's three-file ruling has it; the app never ships original PAKs. */
export const WEB_DATA_FILES=Object.freeze(['core','shareware','pak0']);
export const WebDataFile=(path,classify)=>path==='games/shareware/pak0.pak'?'pak0':classify(path);
