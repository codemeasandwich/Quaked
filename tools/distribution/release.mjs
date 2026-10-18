/** Release selection and identity checks shared by the ONE Distribution workflow.
 * Builders remain build.mjs/archive-mac.mjs; only a Prod push may publish.
 */
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,createReadStream,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const SHA=/^[0-9a-f]{40}$/,HASH=/^[0-9a-f]{64}$/,VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=path=>JSON.parse(readFileSync(path,'utf8'));
async function fileDigest(path){const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);return {sha256:digest.digest('hex'),bytes:statSync(path).size};}
function output(key,value){if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,key+'='+value+'\n');}
export function Expected(env=process.env){
 const commit=env.RELEASE_COMMIT,version=env.RELEASE_VERSION;
 if(!SHA.test(commit??'')||!VERSION.test(version??''))throw Error('Explicit release commit/version missing');
 return {commit,version,tag:'v'+version};
}
export function Context(root=process.cwd(),env=process.env,request=api){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const commit=git('rev-parse','HEAD'),version=json(join(root,'package.json')).version,lock=json(join(root,'package-lock.json'));
 if(!SHA.test(commit)||commit!==env.GITHUB_SHA||!VERSION.test(version))throw Error('Checkout must match the immutable workflow commit/version');
 if(lock.version!==version||lock.packages?.['']?.version!==version)throw Error('Package lock version differs');
 const cargo=readFileSync(join(root,'src-tauri/Cargo.toml'),'utf8').match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1]?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
 if(cargo!==version||json(join(root,'src-tauri/tauri.conf.json')).version!=='../package.json')throw Error('Native version must use the same package version');
 const publish=env.GITHUB_EVENT_NAME==='push'&&env.GITHUB_REF==='refs/heads/Prod',tag='v'+version;
 if(publish){
  const event=json(env.GITHUB_EVENT_PATH);if(event.forced||event.created||event.deleted||!SHA.test(event.before??'')||event.after!==commit)throw Error('Prod release must be an existing branch fast-forward push');
  const repository=env.GITHUB_REPOSITORY;if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository??''))throw Error('Repository identity missing');
  const base='repos/'+repository,prod=request(base+'/git/ref/heads/Prod').object.sha,dev=request(base+'/git/ref/heads/Dev').object.sha;
  if(prod!==commit)throw Error('This Prod publication has been superseded');
  for(const [from,to] of [[event.before,commit],[commit,dev]])if(!['ahead','identical'].includes(request(base+'/compare/'+from+'...'+to).status))throw Error('Prod must fast-forward to a Dev commit');
  const existing=taggedCommit(repository,tag,request);if(existing&&existing!==commit)throw Error('Version tag belongs to a different commit');
 }
 return {publish,commit,tree:git('rev-parse','HEAD^{tree}'),version,tag};
}
export function StampWeb(dir,expected){
 const html=readFileSync(join(dir,'index.html')),inventory=json(join(dir,'inventory.json'));
 const spec=JSON.parse(html.toString().match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
 if(spec?.version!==expected.version||spec.sourceCommit!==expected.commit||inventory.version!==expected.version||inventory.sourceCommit!==expected.commit||inventory.source!==expected.commit||inventory.sourceKind!=='working-tree-based-on-commit')throw Error('Web build does not identify the selected commit/version');
 const record={...expected,htmlSha256:hash(html),engineHash:spec.engineHash};
 const trial=json('dist/browser-trial.json');if(trial.targetSha256!==record.htmlSha256)throw Error('Web HTML differs from the browser-tested artifact');
 writeFileSync(join(dir,'web-release.json'),JSON.stringify(record,null,2)+'\n');return record;
}
export function VerifyWeb(dir,record,expected){
 const html=readFileSync(join(dir,'index.html')),spec=JSON.parse(html.toString().match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1]??'null');
 if(record.schema!==1||record.commit!==expected.commit||record.version!==expected.version||record.tag!==expected.tag||record.web?.htmlSha256!==hash(html)||spec?.sourceCommit!==expected.commit||spec.version!==expected.version||record.web.engineHash!==spec.engineHash||!HASH.test(spec.engineHash??''))throw Error('Pages identity differs from the selected/tested release');
 return record;
}
export async function Artifacts(webDir,macDir,expected){
 const web=json(join(webDir,'web-release.json')),mac=json(join(macDir,'mac-archive.json'));
 if(web.commit!==expected.commit||web.version!==expected.version||web.tag!==expected.tag||web.htmlSha256!==hash(readFileSync(join(webDir,'index.html'))))throw Error('Web release identity mismatch');
 if(mac.sourceCommit!==expected.commit||mac.inventorySource!==expected.commit||mac.inventorySourceKind!=='working-tree-based-on-commit'||mac.version!==expected.version||mac.archive!==basename(mac.archive)||mac.archive!=='Quaked_'+expected.version+'_universal.zip')throw Error('Mac release identity mismatch');
 const actual=await fileDigest(join(macDir,mac.archive));if(actual.sha256!==mac.sha256||actual.bytes!==mac.bytes||!['arm64','x86_64'].every(arch=>mac.architectures.includes(arch))||!HASH.test(mac.executableSha256)||!HASH.test(mac.inventorySha256))throw Error('Mac archive/receipt integrity mismatch');
 const record={schema:1,...expected,web:{htmlSha256:web.htmlSha256,engineHash:web.engineHash},mac:{archive:mac.archive,bytes:mac.bytes,sha256:mac.sha256,executableSha256:mac.executableSha256,inventorySha256:mac.inventorySha256,receiptSha256:hash(readFileSync(join(macDir,'mac-archive.json')))}};
 return VerifyWeb(webDir,record,expected);
}
function gh(args,input){return execFileSync('gh',args,{input,encoding:'utf8',timeout:15*60*1000,maxBuffer:2*1024*1024});}
function api(path,{method='GET',body,missing=false}={}){
 const result=spawnSync('gh',['api','--method',method,path,...(body?['--input','-']:[])],{input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
 if(result.status!==0){if(missing&&String(result.stderr??'').includes('HTTP 404'))return null;throw Error('GitHub '+method+' '+path+' failed: '+String(result.stderr||result.error?.message||'no response').trim());}
 return result.stdout?JSON.parse(result.stdout):null;
}
function taggedCommit(repository,tag,request=api){
 let ref=request('repos/'+repository+'/git/ref/tags/'+tag,{missing:true});if(!ref)return null;
 for(let depth=0;ref.object?.type==='tag'&&depth<4;depth++)ref={object:request('repos/'+repository+'/git/tags/'+ref.object.sha).object};
 if(ref.object?.type!=='commit')throw Error('Version tag does not resolve to a commit');return ref.object.sha;
}
function asset(release,name,sha,bytes){
 const found=release.assets.find(row=>row.name===name);
 if(!found||found.state!=='uploaded'||found.digest!=='sha256:'+sha||(bytes!==undefined&&found.size!==bytes))throw Error('Published asset identity mismatch: '+name);
 return found;
}
export function VerifyExisting(record,bytes,release,expected,web){
 VerifyWeb(web,record,expected);
 if(!HASH.test(record.mac?.sha256)||!HASH.test(record.mac?.receiptSha256)||record.mac.archive!=='Quaked_'+expected.version+'_universal.zip')throw Error('Existing release Mac identity invalid');
 asset(release,'release.json',hash(bytes),bytes.length);asset(release,record.mac.archive,record.mac.sha256,record.mac.bytes);asset(release,'mac-archive.json',record.mac.receiptSha256);
 return record;
}
export async function Publish(web,mac,expected,repository){
 const context=Context();if(!context.publish||context.commit!==expected.commit||context.version!==expected.version)throw Error('Publication is permitted only for the selected Prod push');
 const base='repos/'+repository,record=await Artifacts(web,mac,expected);let bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');
 let tagCommit=taggedCommit(repository,expected.tag);
 if(!tagCommit)throw Error('The promotion controller must create the version tag atomically with Prod');
 if(tagCommit!==expected.commit)throw Error('Version tag is not the selected Dev commit');
 let release=api(base+'/releases/tags/'+expected.tag,{missing:true});
 if(release&&!release.draft){
  bytes=Buffer.from(gh(['release','download',expected.tag,'--repo',repository,'--pattern','release.json','--output','-']));
  VerifyExisting(JSON.parse(bytes),bytes,release,expected,web);
 }else{
  if(!release){gh(['release','create',expected.tag,'--repo',repository,'--verify-tag','--target',expected.commit,'--draft','--generate-notes','--title','Quaked '+expected.tag]);release=api(base+'/releases/tags/'+expected.tag);}
  if(release.assets.some(row=>row.name==='release.json')){
   const prior=gh(['release','download',expected.tag,'--repo',repository,'--pattern','release.json','--output','-']);if(prior!==bytes.toString())throw Error('Draft contains another artifact build; retry with the same retained artifacts');
  }else if(release.assets.length)throw Error('Draft has assets without identity; inspect it without overwriting');
  writeFileSync(join(mac,'release.json'),bytes);
  const sums=record.mac.sha256+'  '+record.mac.archive+'\n'+hash(bytes)+'  release.json\n'+record.mac.receiptSha256+'  mac-archive.json\n';writeFileSync(join(mac,'SHA256SUMS.txt'),sums);
  for(const name of ['release.json','mac-archive.json','SHA256SUMS.txt',record.mac.archive]){
   const local=await fileDigest(join(mac,name)),existing=release.assets.find(row=>row.name===name);
   if(existing)asset(release,name,local.sha256,local.bytes);else gh(['release','upload',expected.tag,join(mac,name),'--repo',repository]);
  }
  release=api(base+'/releases/tags/'+expected.tag);VerifyExisting(record,bytes,release,expected,web);asset(release,'SHA256SUMS.txt',hash(Buffer.from(sums)));
  gh(['release','edit',expected.tag,'--repo',repository,'--draft=false','--latest']);
 }
 mkdirSync('dist/release-identity',{recursive:true});writeFileSync('dist/release-identity/release.json',bytes);output('identity_sha256',hash(bytes));return {commit:expected.commit,version:expected.version,identitySha256:hash(bytes)};
}
async function main(){
 const [command,a,b]=process.argv.slice(2);
 if(command==='context'){const c=Context();for(const key of ['publish','commit','tree','version','tag'])output(key,c[key]);console.log(JSON.stringify(c));}
 else if(command==='stamp-web')console.log(JSON.stringify(StampWeb(a??'dist/web',Expected())));
 else if(command==='publish')console.log(JSON.stringify(await Publish(a,b,Expected(),process.env.GITHUB_REPOSITORY)));
 else if(command==='verify-web'){
  const expected=Expected(),bytes=readFileSync(join(a,'release.json'));
  if(!HASH.test(process.env.RELEASE_IDENTITY_SHA256??'')||hash(bytes)!==process.env.RELEASE_IDENTITY_SHA256||!HASH.test(process.env.RELEASE_HTML_SHA256??'')||hash(readFileSync(join(a,'index.html')))!==process.env.RELEASE_HTML_SHA256)throw Error('Pages artifacts differ from the tested release-job digests');
  if(api('repos/'+process.env.GITHUB_REPOSITORY+'/git/ref/heads/Prod').object.sha!==expected.commit)throw Error('Pages publication has been superseded');
  console.log(JSON.stringify(VerifyWeb(a,JSON.parse(bytes),expected)));
 }
 else throw Error('Usage: release.mjs context|stamp-web [dir]|publish WEB_DIR MAC_DIR|verify-web DIR');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
