/** Assemble one dated build folder: Quaked.app, index.html and the shared data/ beside them,
 * plus the release archive. APFS clones are used on macOS, so the snapshot does not duplicate
 * the bytes. dist/current points at the newest build; older builds are never removed.
 *
 * Usage: QUAKED_BUILD_ID=20261017T195200Z node tools/distribution/assemble.mjs
 */
import {execFileSync} from 'node:child_process';
import {cp,mkdir,readFile,writeFile,stat,lstat,rm,symlink} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';

const root=process.cwd();
const version=JSON.parse(await readFile(join(root,'package.json'),'utf8')).version;
const now=new Date();
const defaultId=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const build=process.env.QUAKED_BUILD_ID??defaultId;
if(!/^[A-Za-z0-9._-]+$/.test(build))throw Error('Invalid build id: '+build);
const target=resolve(process.env.CARGO_TARGET_DIR??join(root,'src-tauri/target'));
const app=join(target,'universal-apple-darwin/release/bundle/macos/Quaked.app');
const web=join(root,'dist/web'),release=join(root,'dist/release');
const buildDir=join(root,'dist/builds',build);
const existing=await lstat(buildDir).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(existing)throw Error('Build folder already exists: '+relative(root,buildDir));
for(const path of [app,join(web,'index.html'),join(web,'data'),release]){
 await stat(path).catch(()=>{throw Error('Missing build input: '+relative(root,path));});
}
const copy=async(from,to)=>{if(process.platform==='darwin')execFileSync('/bin/cp',['-cR',from,to]);else await cp(from,to,{recursive:true,dereference:false});};
await mkdir(buildDir,{recursive:true});
await copy(app,join(buildDir,'Quaked.app'));
await copy(join(web,'index.html'),join(buildDir,'index.html'));
await copy(join(web,'data'),join(buildDir,'data'));
// Keep the two sets explicit: data/ is the HTML's shareware-only subset; app-data/ is the
// desktop app's per-game packs, selected by the game the player starts.
await copy(join(root,'dist/packs'),join(buildDir,'app-data'));
await copy(release,join(buildDir,'release'));
const html=await readFile(join(buildDir,'index.html'),'utf8');
const spec=JSON.parse(html.match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
if(!spec?.packs)throw Error('index.html has no data manifest');
const webFiles=Object.values(spec.packs).flatMap(pack=>pack.parts).map(part=>({file:part.file,bytes:part.bytes,sha256:part.sha256,priority:part.priority,topic:part.topic,source:'web'}));
const appHtml=await readFile(join(root,'dist/desktop/index.html'),'utf8');
const appSpec=JSON.parse(appHtml.match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
const appFiles=Object.values(appSpec?.packs??{}).flatMap(pack=>pack.parts).map(part=>({file:'app-data/'+part.file,bytes:part.bytes,sha256:part.sha256,priority:part.priority,topic:part.topic,source:'app'}));
const files=[...new Map([...webFiles,...appFiles].map(file=>[file.file,file])).values()];
const archive=await readFile(join(release,'mac-archive.json'),'utf8').then(JSON.parse).catch(()=>null);
const commit=process.env.QUAKED_SOURCE_TREE??execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const manifest={
 build,version,commit,generatedAt:now.toISOString(),
 app:'Quaked.app',html:'index.html',data:'data',appData:'app-data',
 release:archive?`release/${archive.archive}`:null,
 archiveSha256:archive?.sha256??null,
 partBytes:spec.partBytes,startPriority:spec.startPriority,
 files,
};
await writeFile(join(buildDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const current=join(root,'dist/current');
const currentInfo=await lstat(current).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(currentInfo){
 if(!currentInfo.isSymbolicLink())throw Error('Refusing to replace a non-symlink dist/current');
 await rm(current);
}
await symlink(relative(join(root,'dist'),buildDir),current);
console.log(JSON.stringify({build,directory:relative(root,buildDir),app:'Quaked.app',html:'index.html',webDataFiles:webFiles.length,appDataFiles:appFiles.length,dataBytes:files.reduce((sum,file)=>sum+file.bytes,0),archive:manifest.release,current:relative(root,current)},null,2));
