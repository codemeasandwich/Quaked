import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rm,stat,open,lstat} from 'node:fs/promises';
import {resolve,relative,dirname,extname} from 'node:path';
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
const files={},inventory=[],packs={};
// Per-game data packs (owner rulings, 12 and 13 October 2026; docs/distribution.md and
// docs/per-game-packs-design-2026-10-13.md): every asset belongs to one pack (core or a game).
// Web: the HTML keeps the engine and what the page shows before the engine runs; the core and
// shareware packs are content-hashed data files beside it on GitHub Pages (opened from disk, it
// fetches them from DATA_BASE); other games' assets are not part of the web build. Desktop: core
// is bundled in the app; with a PACK_BASE every other pack is written to dist/packs as
// content-named parts, which the app downloads from there when a game needs them.
const DATA_BASE=process.env.QUAKED_DATA_BASE??'https://codemeasandwich.github.io/Quaked/';
if(!/^https:\/\/.+\/$/.test(DATA_BASE))throw Error('QUAKED_DATA_BASE must be an https URL ending in /: '+DATA_BASE);
// Parts stay small enough for browsers to cache and for per-part integrity to show progress;
// each is named by its own content, so parts before a changed asset keep their names.
const PART_BYTES=32*1024*1024;
// The app downloads its non-core packs only when the build names their host (QUAKED_PACK_BASE,
// for the release https://github.com/codemeasandwich/Quaked/releases/download/data/ once it
// exists, or a local stand-in for trials); without one it bundles every pack, as before.
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
const output=await open(resolve(out,'index.html'),'w');
try {
 await output.write(html);
 if(profile==='desktop'){await mkdir(resolve(out,'assets'),{recursive:true});await mkdir(resolve(root,'dist/desktop-assets'),{recursive:true});await rm(resolve(root,'dist/packs'),{recursive:true,force:true});await mkdir(resolve(root,'dist/packs'),{recursive:true});}
 let i=0,total=0;const packParts=new Map(),packAssets=new Map();
 for(const path of [...paths,...generated.keys()].sort()) {
  const pack=packOf(path);
  // Named but not shipped on the web, so the page treats it as unavailable (its classic look) rather than a packaging error.
  if(profile==='web'&&!WEB_PACKS.has(pack)){files[path]={pack,unshipped:true};continue;}
  const source=generated.get(path)??await readFile(assetPath(root,path));
  // Web-only optimisation (web_images.mjs); the desktop app ships the source bytes.
  const optimised=profile==='web'&&!generated.has(path)?await WebOptimise(path,source,process.env.QUAKED_WEB_IMAGE_CACHE??resolve(root,'.distribution-cache/web-images')):null;
  const bytes=optimised?.bytes??source;
  const hash=sha(bytes),id='q'+i+++extname(path),entry={id,mime:optimised?.mime??mime(path)};
  // Kept in the HTML: generated engine files, images the page shows before the engine
  // runs, and the licence (so the HTML carries its own terms).
  if(profile==='web'&&!generated.has(path)&&!pageRefs.has(path)&&path!=='LICENSE') {
   const parts=packParts.get(pack)??[];packParts.set(pack,parts);
   entry.pack=pack;entry.offset=parts.reduce((sum,part)=>sum+part.length,0);entry.length=bytes.length;delete entry.id;parts.push(bytes);
  } else if(profile==='web') {
   const gz=gzipSync(bytes,{level:9});const packed=gz.length<bytes.length*.95?gz:bytes;entry.gzip=packed===gz;
   entry.bytes=packed.length;
   await output.write(`<script type="application/octet-stream" id="${id}">${encode85(packed)}</script>\n`);
   total+=packed.length;
  } else if(pack!=='core'&&PACK_BASE) {
   // A downloadable pack: the app unpacks each asset to a file named by its SHA-256.
   const parts=packParts.get(pack)??[],list=packAssets.get(pack)??[];packParts.set(pack,parts);packAssets.set(pack,list);
   // The app's extension rule (ext_ok, src-tauri/src/packs.rs) refuses the whole pack otherwise.
   if(!/^\.[A-Za-z0-9]{1,15}$/.test(extname(path)))throw Error('A downloadable asset needs an extension of 1 to 15 letters or digits: '+path);
   list.push({sha256:hash,offset:parts.reduce((sum,part)=>sum+part.length,0),length:bytes.length,ext:extname(path)});parts.push(bytes);
   delete entry.id;entry.pack=pack;entry.sha256=hash;entry.ext=extname(path);
  } else {
   entry.external=!generated.has(path);
   await writeFile(resolve(entry.external?resolve(root,'dist/desktop-assets'):resolve(out,'assets'),id),bytes);total+=bytes.length;
  }
  files[path]=entry;inventory.push({path,bytes:bytes.length,sha256:hash,...(optimised?{sourceBytes:source.length,sourceSha256:sha(source),webp:{quality:optimised.quality,width:optimised.width,height:optimised.height}}:{})});
 }
 if(profile==='desktop'){
  for(const [pack,parts] of [...packParts].sort(([a],[b])=>a.localeCompare(b))){
   const body=Buffer.concat(parts),files=[];
   for(let start=0;start<body.length;start+=PART_BYTES){
    const part=body.subarray(start,Math.min(body.length,start+PART_BYTES)),file=`${pack}-${sha(part).slice(0,16)}.bin`;
    await writeFile(resolve(root,'dist/packs',file),part);files.push({file,bytes:part.length,sha256:sha(part)});
   }
   packs[pack]={parts:files,bytes:body.length,assets:packAssets.get(pack)};
  }
 }
 if(profile==='web'){
  await mkdir(resolve(out,'data'),{recursive:true});
  for(const [category,parts] of [...packParts].sort(([a],[b])=>a.localeCompare(b))){
   const raw=Buffer.concat(parts),gz=gzipSync(raw,{level:9}),gzip=gz.length<raw.length*.95,body=gzip?gz:raw,files=[];
   for(let start=0;start<body.length;start+=PART_BYTES){
    const part=body.subarray(start,Math.min(body.length,start+PART_BYTES)),file=`data/${category}-${sha(part).slice(0,16)}.bin`;
    await writeFile(resolve(out,file),part);files.push({file,bytes:part.length,integrity:'sha256-'+createHash('sha256').update(part).digest('base64')});
   }
   total+=body.length;packs[category]={parts:files,bytes:body.length,rawBytes:raw.length,gzip};
  }
 }
 await output.write(`<script id="quaked-assets" type="application/json">${JSON.stringify({profile,files,packs,dataBase:DATA_BASE,packBase:PACK_BASE,gamePacks:Object.fromEntries(GAME_CATALOGUE_GAMES.filter(game=>!game.placeholder).map(game=>[game.id,PacksFor(game.id)])),engineHash:sha(generated.get('__runtime.js'))}).replaceAll('<','\\u003c')}</script>\n<script>${bootstrap.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>\n<script>__QUAKED_BOOT_READY__.then(()=>{const run=document.createElement('script');run.src=__QUAKED_DISTRIBUTION__.url('__runtime.js');document.body.append(run);}).catch(error=>{document.body.textContent='Quaked could not start: '+error;});</script></body></html>`);
 let source=process.env.QUAKED_SOURCE_TREE??'unknown';if(source==='unknown')try{source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
 await writeFile(resolve(out,'inventory.json'),JSON.stringify({profile,source,sourceKind:process.env.QUAKED_SOURCE_TREE?'staged-tree':'working-tree-based-on-commit',sourceInputs:Object.fromEntries([...sourceInputs].sort()),packageLockSha256:sha(await readFile('package-lock.json')),version:JSON.parse(await readFile('package.json')).version,packedBytes:total,packs:Object.fromEntries(Object.entries(packs).map(([name,pack])=>[name,{...pack,assets:pack.assets?.length}])),files:inventory.map(row=>({...row,pack:packOf(row.path)}))},null,2)+'\n');
 await writeFile(resolve(out,'bundle-metafile.json'),JSON.stringify(runtime.metafile));
} finally {await output.close();}
const size=(await stat(resolve(out,'index.html'))).size,site=size+Object.values(packs).reduce((sum,pack)=>sum+pack.bytes,0);
if(profile==='web'&&Object.keys(packs).length===0)throw Error('Web build produced no data files');
if(profile==='web'&&site>=1_000_000_000)throw Error(`The web site is ${site} bytes, exceeding the conservative 1 GB Pages site budget. No features were removed; owner decision required.`);
console.log(JSON.stringify({profile,htmlBytes:size,siteBytes:site,dataFiles:Object.fromEntries(Object.entries(packs).map(([name,pack])=>[name,pack.bytes])),assets:inventory.length,output:relative(root,out),buildPeakRssBytes:process.resourceUsage().maxRSS*1024}));
