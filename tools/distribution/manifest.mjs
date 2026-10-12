/** Explicit product inventory. Prepared data comes only from canonical manifests, never
 * a recursive copy of newer/. The web subset uses shareware + enhanced hub BSP identities.
 */
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {pakDirectory,readMember,sha256} from '../pak_members.mjs';
import {existsSync} from 'node:fs';

const DIRECTORIES = ['newer/textures','newer/enemies','newer/weapons','newer/hud','newer/ui','newer/effects','newer/bestiary','assets/credits'];
const FILES = ['icon.svg','icon.png','conback.webp','enhancedmenu.png','newer/maps.pak','newer/startup.pak','music/ambient.mp3','music/CREDITS.txt','LICENSE'];
const excluded = /(?:^|\/)(?:\.[^/]+|_unused|alternates|candidates[^/]*|sources)(?:\/|$)|(?:source|provenance)\.json$/i;
export function assetPath(root,path){
 if(path!=='games/shareware/pak0.pak')return resolve(root,path);
 if(process.env.QUAKED_SHAREWARE_PAK)return resolve(process.env.QUAKED_SHAREWARE_PAK);
 return existsSync(resolve(root,path))?resolve(root,path):resolve(root,'.distribution-cache/shareware.pak');
}
async function walk(root, dir) {
  const out=[];
  for (const entry of await readdir(resolve(root,dir),{withFileTypes:true})) {
    const path=dir+'/'+entry.name;
    if(excluded.test(path)||entry.isSymbolicLink()) continue;
    if(entry.isDirectory())out.push(...await walk(root,path));
    else if(entry.isFile())out.push(path);
  }
  return out;
}
const payloads = row => (row.parts ?? [row]).map(p=>p.file).filter(Boolean);
export function validateArtifactInventory(entries,profile) {
  if(!['web','desktop'].includes(profile))throw Error('Unknown distribution profile: '+profile);
  for(const path of entries) {
    if(path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='')||path.includes('\\'))throw Error('Unsafe asset path: '+path);
    if(path.startsWith('resources/')||path.startsWith('games/') && !(profile==='web'&&path==='games/shareware/pak0.pak'))throw Error('Game data forbidden: '+path);
    if(/(^|\/)pak\d+\.pak$/i.test(path)&&!(profile==='web'&&path==='games/shareware/pak0.pak'))throw Error('Game data forbidden: '+path);
  }
}
export async function collectAssets({profile,root=process.cwd()}) {
  const files=new Set(FILES);
  for(const dir of DIRECTORIES) if(profile!=='web'||dir!=='newer/enemies')for(const path of await walk(root,dir))files.add(path);
  if(profile==='desktop')for(const path of await walk(root,'assets/boxes'))files.add(path);
  if(profile==='web')files.add('games/shareware/pak0.pak');
  for(const kind of ['displacement','rockfield']) {
    const manifest=JSON.parse(await readFile(resolve(root,`newer/${kind}/manifest.json`),'utf8'));
    for(const value of Object.values(manifest.levels))for(const row of Array.isArray(value)?value:[value]) {
      if(profile==='desktop'||['shareware','newer'].includes(row.namespace))for(const path of payloads(row))files.add(path);
    }
  }
  const normals=JSON.parse(await readFile(resolve(root,'newer/normals/manifest.json'),'utf8'));
  const keys=new Set();
  for(const [level,row] of Object.entries(normals.levels))if(profile==='desktop'||/^(shareware|newer):/.test(level))for(const key of row.keys)keys.add(key);
  // Newly published skin revisions can be registered before the level-to-input
  // index is regenerated. Retain these canonical, currently unassigned samples.
  const assigned=new Set(Object.values(normals.levels).flatMap(row=>row.keys));
  for(const key of Object.keys(normals.samples))if(!assigned.has(key))keys.add(key);
  if(profile==='web') {
    const enemyIndex=JSON.parse(await readFile(resolve(root,'newer/enemies/index.json'),'utf8'));
    const models=enemyIndex.models;
    files.add('newer/enemies/index.json');
    const source=assetPath(root,'games/shareware/pak0.pak');
    if(sha256(await readFile(source))!=='35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af')throw Error('Web distribution requires the original Quake 1.06 shareware PAK; checksum mismatch');
    const members=await pakDirectory(source);
    for(const [model,variants] of Object.entries(models)) {
      const member=members.get(`progs/${model}.mdl`);if(!member)continue;
      const hash=sha256(await readMember(member));
      for(const variant of variants)if(!variant.nativeModelSha256||variant.nativeModelSha256===hash){
        for(const key of normals.levels['custom:'+variant.dir]?.keys??[])keys.add(key);
        for(const path of await walk(root,'newer/enemies/'+variant.dir))files.add(path);
        if(variant.faces?.sheet)files.add('newer/enemies/'+variant.faces.sheet);
      }
    }
    for(const [model,groups] of Object.entries(enemyIndex.nativeHeights??{}))if(members.has(`progs/${model}.mdl`))
      for(const row of groups.flat())if(row?.file)files.add('newer/enemies/'+row.file);
  }
  for(const key of keys) {
    if(!normals.samples[key])throw Error('Missing normal sample: '+key);
    for(const path of payloads(normals.samples[key]))files.add(path);
  }
  // Source-relative resources are used by renderer code as well as common URL loaders.
  for(const path of await walk(root,'src'))if(!/\.(js|md|ts)$/.test(path))files.add(path);
  const result=[...files].sort();validateArtifactInventory(result,profile);
  for(const path of result)if(!(await stat(assetPath(root,path))).isFile())throw Error('Missing required asset: '+path);
  return result;
}
/** The web data file an asset ships in (docs/distribution.md, "Web data files"); the desktop app never uses these. */
export function DataCategory(path){
 if(path==='games/shareware/pak0.pak')return 'pak0';
 if(path.startsWith('newer/normals/'))return 'normals';
 if(path.startsWith('newer/textures/'))return 'textures';
 if(/^newer\/(enemies|weapons)\//.test(path))return 'skins';
 if(/^newer\/(displacement|rockfield)\//.test(path)||/^newer\/(maps|startup)\.pak$/.test(path))return 'maps';
 if(path.startsWith('music/'))return 'music';
 return 'images';
}
