/** Direct path-boundary contracts: expected URLs are independent of the resolver. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {existsSync} from 'node:fs';
import {ResourcePath,ResourceLogicalPath,ResourceURL} from '../src/platform/resource_paths.js';
import {collectAssets,assetPath} from '../tools/distribution/manifest.mjs';

const examples={
 'icon.svg':'assets/branding/icon.svg',
 'logo.svg':'assets/branding/logo.svg',
 'newer/ui/studio-logo.png':'assets/branding/studio-logo.png',
 'newer/textures/index.json':'assets/game/textures/index.json',
 'music/ambient.mp3':'assets/audio/music/ambient.mp3',
 'assets/sounds/lowHealt.mp3':'assets/audio/sounds/lowHealt.mp3',
 'src-tauri/icons/icon.icns':'assets/branding/native/icon.icns',
 'docs/images/quaked-banner.png':'assets/docs/quaked-banner.png',
 'maps/zed.bsp':'assets/game/maps/community/zed.bsp',
 'src/newer/render/assets/operative-cloak-noise.png':'assets/game/effects/cloak/operative-cloak-noise.png'
};
test('one canonical physical path resolves each retained logical resource identifier',()=>{
 for(const [logical,physical] of Object.entries(examples)){
  assert.equal(ResourcePath(logical),physical);
  assert.equal(ResourceLogicalPath(physical),logical);
  assert.equal(ResourcePath(physical),physical);
  assert(existsSync(assetPath(process.cwd(),logical)));
  assert(!existsSync(new URL('../'+logical,import.meta.url)),'former source must be absent: '+logical);
 }
 for(const directory of ['newer','music','maps','docs/images','src-tauri/icons'])assert(!existsSync(new URL('../'+directory,import.meta.url)),'former resource tree must remain absent: '+directory);
 assert.equal(ResourcePath('newer'),'assets/game');
 assert.equal(ResourcePath('src/newer/assets/rockfield_worker.js'),'src/newer/assets/rockfield_worker.js');
});
test('source URL routing preserves base paths, queries, code and external URLs',()=>{
 const descriptors=new Map(['location','document'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'http://localhost:8000',href:'http://localhost:8000/Quaked/index.html'}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:{baseURI:'http://localhost:8000/Quaked/'}});
  assert.equal(ResourceURL('newer/textures/a.webp?v=7#sample'),'assets/game/textures/a.webp?v=7#sample');
  assert.equal(ResourceURL('http://localhost:8000/Quaked/newer/bestiary/cover.png?v=2#page'),'http://localhost:8000/Quaked/assets/game/bestiary/cover.png?v=2#page');
  assert.equal(ResourceURL('http://localhost:8000/Quaked/assets/branding/studio-logo.png',true),'http://localhost:8000/Quaked/newer/ui/studio-logo.png');
  assert.equal(ResourceURL('https://quaked.invalid/assets/branding/icon.png',true),'https://quaked.invalid/icon.png');
  for(const url of ['http://localhost:8000/other/newer/cover.png','https://other.example/newer/cover.png','blob:http://localhost:8000/identity','http://localhost:8000/Quaked/src/newer/assets/rockfield_worker.js'])assert.equal(ResourceURL(url),url);
  globalThis.document.baseURI='http://localhost:8000/';
  assert.equal(ResourceURL('http://localhost:8000/newer/textures/a.webp'),'http://localhost:8000/assets/game/textures/a.webp');
 }finally{for(const [key,descriptor]of descriptors)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
});
test('both product inventories resolve uniquely to the same authored files',async()=>{
 for(const profile of ['web','desktop']){
  const inventory=await collectAssets({profile});
  const physical=inventory.map(p=>assetPath(process.cwd(),p));
  assert.equal(new Set(physical).size,inventory.length,'each physical payload occurs once');
  assert.equal(inventory.filter(p=>p==='newer/ui/studio-logo.png').length,1);
  const cloak='src/newer/render/assets/operative-cloak-noise.png';
  assert.equal(inventory.filter(p=>p===cloak).length,1);
  assert(!inventory.some(p=>p.includes('/candidates/')||p.includes('/sources/')));
 }
});
