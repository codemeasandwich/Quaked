/** Per-game data packs (docs/per-game-packs-design-2026-10-13.md): which pack every shipped Newer
 * asset belongs to. Packs are the game catalogue's IDs plus `core`. A game needs its own pack and
 * its ancestors' (core < shareware < quake < every mission pack, episode and add-on); an asset used
 * by several games goes to their nearest common ancestor, so nothing is duplicated and no game
 * needs a sibling's pack. Built only from data committed in the repository: the normals,
 * displacement and rockfield manifests (by namespace), the enemy and texture indexes, and
 * newer/packs/games.json (tools/distribution/build_game_index.mjs).
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const PACK_PARENT={core:null,shareware:'core',quake:'shareware'};
const parent=pack=>pack in PACK_PARENT?PACK_PARENT[pack]:'quake';
/** Ancestors of a pack, nearest first, ending with core. */
export function PackChain(pack){const chain=[];for(let p=pack;p;p=parent(p))chain.push(p);return chain;}
/** The nearest pack every game in the set has (core for an empty set). */
export function CommonAncestor(games){
 const list=[...games];if(!list.length)return 'core';
 const shared=PackChain(list[0]).filter(p=>list.every(g=>PackChain(g).includes(p)));return shared[0];
}
/** Manifest namespaces to games: id1 and the bundled loose maps belong to the full game; the hub to the shareware. */
const NAMESPACE={shareware:'shareware',newer:'shareware',id1:'quake',quake:'quake',loose:'quake',hipnotic:'hipnotic',rogue:'rogue',dopa:'dopa',mg1:'mg1'};
export async function PackClassifier(root=process.cwd()){
 const json=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 const [games,enemies,textures,normals,displacement,rockfield]=await Promise.all(['newer/packs/games.json','newer/enemies/index.json','newer/textures/index.json','newer/normals/manifest.json','newer/displacement/manifest.json','newer/rockfield/manifest.json'].map(json));
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
 const levelGames=name=>{const [namespace,rest]=[name.slice(0,name.indexOf(':')),name.slice(name.indexOf(':')+1)];
  if(namespace==='custom')return variantGames(rest);
  const game=NAMESPACE[namespace];if(!game)throw Error('Unknown normals namespace '+namespace);return [game];};
 const owner=new Map(),claim=(file,ids)=>{const set=owner.get(file)??new Set();for(const id of ids)set.add(id);owner.set(file,set);};
 for(const [name,level] of Object.entries(normals.levels)){const ids=levelGames(name);for(const key of level.keys??[])if(normals.samples[key])claim(normals.samples[key].file,ids);}
 for(const manifest of [displacement,rockfield])for(const value of Object.values(manifest.levels))for(const row of Array.isArray(value)?value:[value]){
  const game=NAMESPACE[row.namespace??(row.file.split('/')[2])];if(!game)throw Error('Unknown prepared-level namespace for '+row.file);
  for(const file of row.parts?row.parts.map(p=>p.file):[row.file])claim(file,[game]);
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
