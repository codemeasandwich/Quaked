import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rm,stat,open,lstat} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {collectAssets,assetPath} from './manifest.mjs';
import {PackClassifier,PacksFor,WEB_DATA_FILES,WebDataFile} from './packs.mjs';
import {GAME_CATALOGUE_GAMES} from '../../src/engine/common/game_catalogue.js';
import {encode85} from './base85.js';
import {WebOptimise} from './web_images.mjs';

const profile=process.argv[2];
if(!['web','desktop'].includes(profile))throw Error('Usage: build.mjs web|desktop');
const root=process.cwd(),out=resolve(root,'dist',profile);
for(const path of [resolve(root,'dist'),out,resolve(root,'dist/desktop-assets')]){
 const info=await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(info?.isSymbolicLink())throw Error('Refusing symlink build output: '+path);
}
await rm(out,{recursive:true,force:true});
if(profile==='desktop')await rm(resolve(root,'dist/desktop-assets'),{recursive:true,force:true});
await mkdir(out,{recursive:true});
const paths=await collectAssets({profile,root});
const generated=new Map();
const sourceInputs=new Map();
function sha(bytes){return createHash('sha256').update(bytes).digest('hex');}
const assetModule=resolve(root,'src/platform/distribution.js');
// import.meta URLs otherwise lose their source-directory meaning in a single bundle.
const urlPlugin={name:'quaked-source-urls',setup(b){b.onLoad({filter:/\.js$/},async args=>{
  if(args.path.includes('/node_modules/')||args.path===assetModule)return;
  let contents=await readFile(args.path,'utf8');
  sourceInputs.set(relative(root,args.path),sha(contents));
  if(!contents.includes('import.meta.url'))return {contents,loader:'js'};
  const base='https://quaked.invalid/'+relative(root,args.path).replaceAll('\\','/');
  contents=contents.replace(/new URL\(\s*([^\n]*?),\s*import\.meta\.url\s*\)/g,(_,expression)=>`new URL(__quakedAssetURL(new URL(${expression},${JSON.stringify(base)}).href),globalThis.location.href)`);
  if(contents.includes('import.meta.url'))throw Error('Unresolved source URL in '+args.path);
  return {contents:`import {AssetURL as __quakedAssetURL} from ${JSON.stringify(assetModule)};\n`+contents,loader:'js'};
});}};
const options={bundle:true,minify:true,treeShaking:true,write:false,format:'iife',target:['safari17','chrome120','firefox120'],legalComments:'inline',logLevel:'warning'};
const worker=await build({...options,entryPoints:['src/newer/assets/rockfield_worker.js'],plugins:[urlPlugin]});
generated.set('src/newer/assets/rockfield_worker.js',Buffer.from(worker.outputFiles[0].contents));
const runtime=await build({...options,entryPoints:['main.js'],plugins:[urlPlugin],metafile:true});
const bootstrap=await build({...options,entryPoints:['tools/distribution/bootstrap.js'],plugins:[urlPlugin]});
generated.set('__runtime.js',Buffer.from(runtime.outputFiles[0].contents));
const mime=p=>({'.js':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.mp3':'audio/mpeg','.txt':'text/plain'}[extname(p)]??'application/octet-stream');
// Data is cut into small parts so a build can fetch only what it needs first and
// continue the rest in the background. Each part is content-named, so unchanged
// bytes keep their URL across builds.
const PART_BYTES=8*1024*1024;
// Priority is a property of the bytes, not of a pack: 0 is needed to open the
// first level, 1 is needed for its actors and weapons, 2 can arrive afterwards.
// A part that straddles two priorities takes the earlier (more urgent) one.
const PRIORITY_START=0,PRIORITY_ACTORS=1,PRIORITY_BACKGROUND=2;
function topicOf(path){
 if(path==='games/shareware/pak0.pak')return 'pak0';
 if(/^newer\/textures\//.test(path)||/^newer\/(normals|displacement|rockfield)\//.test(path))return 'textures';
 if(/^newer\/(enemies|weapons)\//.test(path))return 'models';
 if(/^newer\/(ui|hud)\//.test(path))return 'ui';
 if(/^newer\/effects\//.test(path))return 'effects';
 if(/^newer\/bestiary\//.test(path))return 'bestiary';
 if(/^(assets\/sounds|music)\//.test(path))return 'sounds';
 if(/^newer\/(maps|startup)\.pak$/.test(path))return 'maps';
 if(/^src\//.test(path))return 'engine';
 return 'core';
}
function priorityOf(path){
 if(path==='games/shareware/pak0.pak'||path==='newer/maps.pak'||path==='newer/startup.pak')return PRIORITY_START;
 // The hub jingle must be resident before the player gains control, or the audio element
 // receives a pending placeholder instead of the track. Explosion textures are needed by
 // the first fireballs, so effects are actors rather than background material.
 if(path==='assets/sounds/quake1newereGame_firstLevelEasyMidHard.mp3')return PRIORITY_START;
 // Water cues resolve when their module loads: background audio could otherwise
 // bind these decks permanently to the bootstrap's silent placeholder.
 if(/^assets\/sounds\/(player-bubbles|underwater|enter-underwater|walking-in-water)\.mp3$/.test(path))return PRIORITY_START;
 if(/^src\//.test(path)||/^newer\/(ui|hud|textures|normals|displacement|rockfield)\//.test(path))return PRIORITY_START;
 if(/^newer\/(enemies|weapons|effects)\//.test(path))return PRIORITY_ACTORS;
 if(/^(assets\/sounds|music)\//.test(path)||/^newer\/bestiary\//.test(path)||/^assets\/(credits|boxes)\//.test(path))return PRIORITY_BACKGROUND;
 return PRIORITY_ACTORS;
}
// Per-game data packs (owner rulings, 12 and 13 October 2026; docs/distribution.md and
// docs/per-game-packs-design-2026-10-13.md): every asset belongs to one pack (core or a game).
// Web: the HTML keeps the engine and what the page shows before the engine runs; the core and
// shareware packs are content-hashed data files beside it on GitHub Pages (opened from disk, it
// fetches them from DATA_BASE); other games' assets are not part of the web build. Desktop: core
// is bundled in the app; with a PACK_BASE every other pack is written to dist/packs as
// content-named parts, which the app downloads from there when a game needs them.
const DATA_BASE=process.env.QUAKED_DATA_BASE??'https://codemeasandwich.github.io/Quaked/';
if(!/^https:\/\/.+\/$/.test(DATA_BASE))throw Error('QUAKED_DATA_BASE must be an https URL ending in /: '+DATA_BASE);
const PACK_BASE=process.env.QUAKED_PACK_BASE||null;
// The app's rule (check_base, src-tauri/src/packs.rs): https, or http only to this computer; no user name, query or fragment.
if(PACK_BASE){const url=URL.parse(PACK_BASE);if(!url||!PACK_BASE.endsWith('/')||url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('QUAKED_PACK_BASE must be an https URL ending in / (or http on 127.0.0.1 or localhost): '+PACK_BASE);}
const classify=await PackClassifier(root),WEB_PACKS=new Set(WEB_DATA_FILES);
const packOf=path=>generated.has(path)?'core':WebDataFile(path,classify);
let html=await readFile('index.html','utf8');
const pageRefs=new Set([...html.matchAll(/\b(?:src|href)="([^"#][^"]*)"/g)].map(match=>match[1]));
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace(/<script type="module" src="main.js"><\/script>/,'');
html=html.replace(/\b(src|href)="([^"#][^"]*)"/g,(whole,attr,path)=>paths.includes(path)?`data-quaked-${attr}="${path}"`:whole);
html=html.replace('</body>','').replace('</html>','');
const files={},inventory=[],packs={},records=new Map();
const output=await open(resolve(out,'index.html'),'w');
try {
 await output.write(html);
 if(profile==='desktop'){await mkdir(resolve(out,'assets'),{recursive:true});await mkdir(resolve(root,'dist/desktop-assets'),{recursive:true});await rm(resolve(root,'dist/packs'),{recursive:true,force:true});await mkdir(resolve(root,'dist/packs'),{recursive:true});}
 if(profile==='web')await mkdir(resolve(out,'data'),{recursive:true});
 const addRecord=(pack,record)=>{const list=records.get(pack);if(list)list.push(record);else records.set(pack,[record]);};
 let i=0,total=0;
 for(const path of [...paths,...generated.keys()].sort()) {
  const pack=packOf(path);
  // Named but not shipped on the web, so the page treats it as unavailable (its classic look) rather than a packaging error.
  if(profile==='web'&&!WEB_PACKS.has(pack)){files[path]={pack,unshipped:true};continue;}
  const source=generated.get(path)??await readFile(assetPath(root,path));
  // Web-only optimisation (web_images.mjs); the desktop app ships the source bytes.
  const optimised=profile==='web'&&!generated.has(path)?await WebOptimise(path,source,process.env.QUAKED_WEB_IMAGE_CACHE??resolve(root,'.distribution-cache/web-images')):null;
  const bytes=optimised?.bytes??source;
  const hash=sha(bytes),priority=priorityOf(path),topic=topicOf(path),type=optimised?.mime??mime(path);
  // Kept in the HTML: generated engine files, images the page shows before the engine
  // runs, and the licence (so the HTML carries its own terms).
  if(profile==='web'&&(generated.has(path)||pageRefs.has(path)||path==='LICENSE')) {
   const gz=gzipSync(bytes,{level:9}),packed=gz.length<bytes.length*.95?gz:bytes,id='q'+i+++extname(path),entry={id,mime:type};
   entry.gzip=packed===gz;entry.bytes=packed.length;
   await output.write(`<script type="application/octet-stream" id="${id}">${encode85(packed)}</script>\n`);
   total+=packed.length;files[path]=entry;
  } else if(profile==='web') {
   addRecord(pack,{path,bytes,hash,priority,topic,ext:extname(path),mime:type,sourceBytes:source.length,optimised});
   files[path]={pack,mime:type};
  } else if(pack!=='core'&&PACK_BASE) {
   // A downloadable pack: the app unpacks each asset to a file named by its SHA-256.
   // The app's extension rule (ext_ok, src-tauri/src/packs.rs) refuses the whole pack otherwise.
   if(!/^\.[A-Za-z0-9]{1,15}$/.test(extname(path)))throw Error('A downloadable asset needs an extension of 1 to 15 letters or digits: '+path);
   addRecord(pack,{path,bytes,hash,priority,topic,ext:extname(path),mime:type});
   files[path]={pack,sha256:hash,ext:extname(path),mime:type};
  } else {
   const id='q'+i+++extname(path),external=!generated.has(path);
   await writeFile(resolve(external?resolve(root,'dist/desktop-assets'):resolve(out,'assets'),id),bytes);
   total+=bytes.length;files[path]={id,mime:type,external};
  }
  inventory.push({path,bytes:bytes.length,sha256:hash,pack,priority,topic,...(optimised?{sourceBytes:source.length,sourceSha256:sha(source),webp:{quality:optimised.quality,width:optimised.width,height:optimised.height}}:{})});
 }
 // Pack bodies are ordered by priority, then path, and cut into PART_BYTES pieces.
 // The part's priority is the first asset it touches, so the parts that open the
 // first level sort before the parts that only feed later effects and sounds.
 for(const [pack,list] of [...records].sort(([a],[b])=>a.localeCompare(b))){
  list.sort((a,b)=>a.priority-b.priority||a.path.localeCompare(b.path));
  let offset=0;for(const record of list){record.offset=offset;record.length=record.bytes.length;offset+=record.length;}
  const body=Buffer.concat(list.map(record=>record.bytes)),parts=[],dir=profile==='web'?resolve(out,'data'):resolve(root,'dist/packs');
  for(let start=0;start<body.length;start+=PART_BYTES){
   const end=Math.min(body.length,start+PART_BYTES),chunk=body.subarray(start,end);
   const touched=list.filter(record=>record.offset<end&&record.offset+record.length>start),first=touched[0];
   // If a part holds any byte of an urgent asset it must be fetched urgently too; a
   // straddling asset can otherwise hide behind a later group's part.
   const priority=touched.reduce((urgent,record)=>Math.min(urgent,record.priority),PRIORITY_BACKGROUND),topic=first?.topic??'core',file=`${pack}-${sha(chunk).slice(0,16)}.bin`,integrity='sha256-'+createHash('sha256').update(chunk).digest('base64');
   await writeFile(resolve(dir,file),chunk);
   parts.push(profile==='web'?{file:`data/${file}`,bytes:chunk.length,sha256:sha(chunk),integrity,priority,topic}:{file,bytes:chunk.length,sha256:sha(chunk),priority,topic});
  }
  for(const record of list){
   const touched=[];for(let p=0;p<parts.length;p++){const from=p*PART_BYTES,to=Math.min(body.length,from+PART_BYTES);if(record.offset<to&&record.offset+record.length>from)touched.push(p);}
   record.parts=touched;
   if(profile==='web'){files[record.path].offset=record.offset;files[record.path].length=record.length;files[record.path].parts=touched;}
  }
  packs[pack]=profile==='web'
   ?{parts,bytes:body.length,rawBytes:body.length,gzip:false}
   :{parts,bytes:body.length,assets:list.map(record=>({sha256:record.hash,offset:record.offset,length:record.length,ext:record.ext}))};
  total+=body.length;
 }
 if(profile==='web'&&Object.keys(packs).length===0)throw Error('Web build produced no data files');
 await output.write(`<script id="quaked-assets" type="application/json">${JSON.stringify({profile,files,packs,dataBase:DATA_BASE,packBase:PACK_BASE,partBytes:PART_BYTES,startPriority:PRIORITY_ACTORS,gamePacks:Object.fromEntries(GAME_CATALOGUE_GAMES.filter(game=>!game.placeholder).map(game=>[game.id,PacksFor(game.id)])),engineHash:sha(generated.get('__runtime.js'))}).replaceAll('<','\\u003c')}</script>\n<script>${bootstrap.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>\n<script>__QUAKED_BOOT_READY__.then(()=>{const run=document.createElement('script');run.src=__QUAKED_DISTRIBUTION__.url('__runtime.js');document.body.append(run);}).catch(error=>{document.body.textContent='Quaked could not start: '+error;});</script></body></html>`);
 let source=process.env.QUAKED_SOURCE_TREE??'unknown';if(source==='unknown')try{source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
 await writeFile(resolve(out,'inventory.json'),JSON.stringify({profile,source,sourceKind:process.env.QUAKED_SOURCE_TREE?'staged-tree':'working-tree-based-on-commit',sourceInputs:Object.fromEntries([...sourceInputs].sort()),packageLockSha256:sha(await readFile('package-lock.json')),version:JSON.parse(await readFile('package.json')).version,partBytes:PART_BYTES,startPriority:PRIORITY_ACTORS,packedBytes:total,packs:Object.fromEntries(Object.entries(packs).map(([name,pack])=>[name,{...pack,assets:pack.assets?.length}])),files:inventory},null,2)+'\n');
 await writeFile(resolve(out,'bundle-metafile.json'),JSON.stringify(runtime.metafile));
} finally {await output.close();}
const size=(await stat(resolve(out,'index.html'))).size,site=size+Object.values(packs).reduce((sum,pack)=>sum+pack.bytes,0);
if(profile==='web'&&site>=1_000_000_000)throw Error(`The web site is ${site} bytes, exceeding the conservative 1 GB Pages site budget. No features were removed; owner decision required.`);
console.log(JSON.stringify({profile,htmlBytes:size,siteBytes:site,dataFiles:Object.fromEntries(Object.entries(packs).map(([name,pack])=>[name,pack.bytes])),partBytes:PART_BYTES,assets:inventory.length,output:relative(root,out),buildPeakRssBytes:process.resourceUsage().maxRSS*1024}));
