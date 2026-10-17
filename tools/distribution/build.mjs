import {build} from 'esbuild';
import {readFile,writeFile,mkdir,rm,stat,open,lstat} from 'node:fs/promises';
import {resolve,relative,dirname,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {collectAssets,assetPath} from './manifest.mjs';
import {encode85} from './base85.js';

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
const files={},inventory=[];
let html=await readFile('index.html','utf8');
html=html.replace(/<script type="importmap">[\s\S]*?<\/script>/,'').replace(/<script type="module" src="main.js"><\/script>/,'');
html=html.replace(/\b(src|href)="([^"#][^"]*)"/g,(whole,attr,path)=>paths.includes(path)?`data-quaked-${attr}="${path}"`:whole);
html=html.replace('</body>','').replace('</html>','');
const output=await open(resolve(out,'index.html'),'w');
try {
 await output.write(html);
 if(profile==='desktop'){await mkdir(resolve(out,'assets'),{recursive:true});await mkdir(resolve(root,'dist/desktop-assets'),{recursive:true});}
 let i=0,total=0;
 for(const path of [...paths,...generated.keys()].sort()) {
  const bytes=generated.get(path)??await readFile(assetPath(root,path));
  const hash=sha(bytes),id='q'+i+++extname(path),entry={id,mime:mime(path)};
  if(profile==='web') {
   const gz=gzipSync(bytes,{level:9});const packed=gz.length<bytes.length*.95?gz:bytes;entry.gzip=packed===gz;
   entry.bytes=packed.length;
   await output.write(`<script type="application/octet-stream" id="${id}">${encode85(packed)}</script>\n`);
   total+=packed.length;
  } else {
   entry.external=!generated.has(path);
   await writeFile(resolve(entry.external?resolve(root,'dist/desktop-assets'):resolve(out,'assets'),id),bytes);total+=bytes.length;
  }
  files[path]=entry;inventory.push({path,bytes:bytes.length,sha256:hash});
 }
 await output.write(`<script id="quaked-assets" type="application/json">${JSON.stringify({profile,files,engineHash:sha(generated.get('__runtime.js'))}).replaceAll('<','\\u003c')}</script>\n<script>${bootstrap.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>\n<script>__QUAKED_BOOT_READY__.then(()=>{const run=document.createElement('script');run.src=__QUAKED_DISTRIBUTION__.url('__runtime.js');document.body.append(run);}).catch(error=>{document.body.textContent='Quaked could not start: '+error;});</script></body></html>`);
 let source=process.env.QUAKED_SOURCE_TREE??'unknown';if(source==='unknown')try{source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
 await writeFile(resolve(out,'inventory.json'),JSON.stringify({profile,source,sourceKind:process.env.QUAKED_SOURCE_TREE?'staged-tree':'working-tree-based-on-commit',sourceInputs:Object.fromEntries([...sourceInputs].sort()),packageLockSha256:sha(await readFile('package-lock.json')),version:JSON.parse(await readFile('package.json')).version,packedBytes:total,files:inventory},null,2)+'\n');
 await writeFile(resolve(out,'bundle-metafile.json'),JSON.stringify(runtime.metafile));
} finally {await output.close();}
const size=(await stat(resolve(out,'index.html'))).size;
// Owner-raised ceiling. The web profile is ~1.16 GB, past GitHub Pages' hard
// published-site cap of 1 GB ("Published GitHub Pages sites may be no larger than
// 1 GB"), so a web build now succeeds here and fails at deploy time instead. This
// guard only catches runaway growth; hosting the web profile is an owner decision.
if(profile==='web'&&size>=2_000_000_000)throw Error(`Single HTML is ${size} bytes, exceeding the 2 GB build ceiling. No features were removed; owner decision required.`);
console.log(JSON.stringify({profile,htmlBytes:size,assets:inventory.length,output:relative(root,out),buildPeakRssBytes:process.resourceUsage().maxRSS*1024}));
