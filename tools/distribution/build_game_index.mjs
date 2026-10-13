// Which games use each Newer texture and enemy model (docs/per-game-packs-design-2026-10-13.md).
// Run against the owner's game library, like the repository's other baked manifests; the build
// and CI then classify assets into per-game packs from the committed result alone.
//
//   node tools/distribution/build_game_index.mjs [library root, default ~/quaked]
//
// Writes newer/packs/games.json: for every texture name in newer/textures/index.json (pictures,
// crafted normals, glass), the games
// whose BSPs name it; for every model in newer/enemies/index.json, each game whose PAKs contain
// it, with that file's SHA-256 (so model-bound skin variants can be matched exactly).
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {pakDirectory,readMember,sha256} from '../pak_members.mjs';
import {GAME_CATALOGUE_GAMES} from '../../src/engine/common/game_catalogue.js';
const root=resolve(process.argv[2]??join(homedir(),'quaked'));
const textureIndex=JSON.parse(await readFile('newer/textures/index.json','utf8'));
// Every texture name the index can upgrade: pictures, crafted normals and glass variants.
const textures=new Set([...Object.keys(textureIndex.textures),...Object.keys(textureIndex.normals??{}),...Object.keys(textureIndex.glass??{})].map(name=>name.toLowerCase()));
const models=new Set(Object.keys(JSON.parse(await readFile('newer/enemies/index.json','utf8')).models).map(key=>'progs/'+key+'.mdl'));
// The BSP's texture names (miptex lump 2).
function bspTextures(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),offset=view.getInt32(4+2*8,true),length=view.getInt32(8+2*8,true),names=new Set();
 if(length<4)return names;
 const count=view.getInt32(offset,true);
 for(let i=0;i<count;i++){const at=view.getInt32(offset+4+i*4,true);if(at<0)continue;const raw=bytes.subarray(offset+at,offset+at+16);names.add(new TextDecoder().decode(raw.subarray(0,raw.indexOf(0)<0?16:raw.indexOf(0))).toLowerCase());}
 return names;
}
const index={version:1,library:'~/quaked (owner library; folder names from the game catalogue)',games:{},textures:{},models:{}};
for(const game of GAME_CATALOGUE_GAMES){
 const folder=(game.folders??[]).map(f=>f.replace(/^games\//,'')).map(f=>join(root,f)).find(Boolean);
 let paks=[];
 for(const f of (game.folders??[]).filter(f=>f.startsWith('games/'))){const dir=join(root,f.slice(6));try{paks.push(...(await readdir(dir)).filter(n=>/^pak\d+\.pak$/i.test(n)).sort().map(n=>join(dir,n)));}catch{}}
 if(!paks.length){index.games[game.id]={paks:0};continue;}
 const usedTextures=new Set(),gameModels={};let maps=0;
 for(const pak of paks)for(const [name,entry] of await pakDirectory(pak)){
  if(/^maps\/[^/]+\.bsp$/i.test(name)){maps++;for(const t of bspTextures(await readMember(entry)))if(textures.has(t))usedTextures.add(t);}
  else if(models.has(name.toLowerCase()))gameModels[name.toLowerCase()]=sha256(await readMember(entry));
 }
 index.games[game.id]={paks:paks.length,maps,textures:usedTextures.size,models:Object.keys(gameModels).length};
 for(const t of usedTextures)(index.textures[t]??=[]).push(game.id);
 for(const [m,digest] of Object.entries(gameModels))(index.models[m]??={})[game.id]=digest;
}
for(const list of Object.values(index.textures))list.sort();
index.textures=Object.fromEntries(Object.entries(index.textures).sort());index.models=Object.fromEntries(Object.entries(index.models).sort());
await mkdir('newer/packs',{recursive:true});await writeFile('newer/packs/games.json',JSON.stringify(index,null,1)+'\n');
console.log(JSON.stringify(index.games));
