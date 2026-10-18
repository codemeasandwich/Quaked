import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,realpath} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Context,Expected,Artifacts,VerifyWeb,VerifyExisting} from '../tools/distribution/release.mjs';
const module=resolve('tools/distribution/release.mjs'),S='a'.repeat(40),P='b'.repeat(40),engine='c'.repeat(64),expected={commit:S,version:'1.2.3',tag:'v1.2.3'};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const dir=await realpath(await mkdtemp(join(tmpdir(),'quaked-release-test-')));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const sub of ['src-tauri','web','mac','bin'])await mkdir(join(dir,sub));
 const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_')&&!['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_DEBUG'].includes(key)));
 await mkdir(join(dir,'tools/distribution'),{recursive:true});const cli=join(dir,'tools/distribution/release.mjs');await writeFile(cli,await readFile(module));
 for(const [name,data] of Object.entries({'package.json':{version:'1.2.3'},'package-lock.json':{version:'1.2.3',packages:{'':{version:'1.2.3'}}},'src-tauri/tauri.conf.json':{version:'../package.json'}}))await writeFile(join(dir,name),JSON.stringify(data));
 await writeFile(join(dir,'src-tauri/Cargo.toml'),'[package]\nname = "quaked"\nversion = "1.2.3"\n');
 const git=(...a)=>execFileSync('git',a,{cwd:dir,env:clean,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git('init','-q','--object-format=sha1');git('config','core.hooksPath','/dev/null');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-qm','source');
 const commit=git('rev-parse','HEAD'),exp={...expected,commit};
 await writeFile(join(dir,'event.json'),JSON.stringify({before:P,after:commit,created:false,deleted:false,forced:false}));
 const env={...clean,GITHUB_SHA:commit,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/Prod',GITHUB_EVENT_PATH:join(dir,'event.json'),GITHUB_REPOSITORY:'fixture/quaked',GITHUB_OUTPUT:join(dir,'github-output'),RELEASE_COMMIT:commit,RELEASE_VERSION:'1.2.3',PATH:join(dir,'bin')+':'+dirname(process.execPath)+':'+clean.PATH};
 for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
 return {dir,git,env,exp,cli};
}
async function artifacts(f){
 const spec={profile:'web',version:f.exp.version,sourceCommit:f.exp.commit,engineHash:engine},html='<script id="quaked-assets" type="application/json">'+JSON.stringify(spec)+'</script>';
 await writeFile(join(f.dir,'web/index.html'),html);await writeFile(join(f.dir,'web/web-release.json'),JSON.stringify({...f.exp,htmlSha256:sha(html),engineHash:engine}));
 const bytes=Buffer.from('native archive'),name='Quaked_'+f.exp.version+'_universal.zip';await writeFile(join(f.dir,'mac',name),bytes);
 const receipt={version:f.exp.version,sourceCommit:f.exp.commit,inventorySource:f.exp.commit,inventorySourceKind:'working-tree-based-on-commit',archive:name,bytes:bytes.length,sha256:sha(bytes),executableSha256:'d'.repeat(64),inventorySha256:'e'.repeat(64),architectures:['arm64','x86_64']};
 await writeFile(join(f.dir,'mac/mac-archive.json'),JSON.stringify(receipt));return {receipt,html};
}
test('verification events never become publication authority; native/package versions must agree',async t=>{
 const f=await fixture(t);
 for(const [event,ref] of [['push','refs/heads/Dev'],['push','refs/tags/v1.2.3'],['pull_request','refs/pull/1/merge'],['workflow_dispatch','refs/heads/Prod']])assert.equal(Context(f.dir,{...f.env,GITHUB_EVENT_NAME:event,GITHUB_REF:ref},()=>{throw Error('unexpected API');}).publish,false);
 await writeFile(join(f.dir,'src-tauri/Cargo.toml'),'[package]\nversion = "1.2.4"\n');assert.throws(()=>Context(f.dir,{...f.env,GITHUB_REF:'refs/heads/Dev'}),/Native version/);
});
test('Prod requires an exact workflow SHA, existing branch FF lineage and Dev membership',async t=>{
 const f=await fixture(t);let divergence=false,stale=false,wrongTag=false;
 const api=(path,{missing}={})=>{
  if(path.endsWith('/heads/Prod'))return {object:{sha:stale?P:f.exp.commit}};
  if(path.endsWith('/heads/Dev'))return {object:{sha:f.exp.commit}};
  if(path.includes('/compare/'))return {status:divergence?'diverged':'ahead'};
  if(path.includes('/tags/'))return wrongTag?{object:{type:'commit',sha:P}}:null;
  throw Error(path);
 };
 assert.equal(Context(f.dir,f.env,api).publish,true);
 stale=true;assert.throws(()=>Context(f.dir,f.env,api),/superseded/);stale=false;
 divergence=true;assert.throws(()=>Context(f.dir,f.env,api),/Dev commit/);divergence=false;
 wrongTag=true;assert.throws(()=>Context(f.dir,f.env,api),/tag belongs/);
 assert.throws(()=>Context(f.dir,{...f.env,GITHUB_SHA:P},api),/immutable workflow/);
 for(const field of ['forced','created','deleted']){await writeFile(join(f.dir,'event.json'),JSON.stringify({before:P,after:f.exp.commit,[field]:true}));assert.throws(()=>Context(f.dir,f.env,api),/fast-forward push/);}
});
test('artifact identity binds the tested HTML, exact commit/version and native ZIP/receipt bytes',async t=>{
 const f=await fixture(t);await artifacts(f);const record=await Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp);
 assert.equal(record.commit,f.exp.commit);assert.equal(record.version,'1.2.3');assert.equal(VerifyWeb(join(f.dir,'web'),record,f.exp),record);
 await writeFile(join(f.dir,'mac',record.mac.archive),'tampered');await assert.rejects(Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp),/integrity mismatch/);
});
test('another commit, version, tree-only provenance or escaping archive is refused',async t=>{
 const f=await fixture(t);const {receipt}=await artifacts(f);
 for(const change of [{sourceCommit:P},{version:'1.2.4'},{inventorySourceKind:'staged-tree'},{archive:'../escape.zip'}]){await writeFile(join(f.dir,'mac/mac-archive.json'),JSON.stringify({...receipt,...change}));await assert.rejects(Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp),/Mac release identity/);}
});
test('existing released artifacts must match both the common identity and GitHub asset digests',async t=>{
 const f=await fixture(t);await artifacts(f);const record=await Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp),bytes=Buffer.from(JSON.stringify(record));
 const release={assets:[{name:'release.json',state:'uploaded',digest:'sha256:'+sha(bytes),size:bytes.length},{name:record.mac.archive,state:'uploaded',digest:'sha256:'+record.mac.sha256,size:record.mac.bytes},{name:'mac-archive.json',state:'uploaded',digest:'sha256:'+record.mac.receiptSha256}]};
 assert.equal(VerifyExisting(record,bytes,release,f.exp,join(f.dir,'web')),record);
 release.assets[1].digest='sha256:'+'0'.repeat(64);assert.throws(()=>VerifyExisting(record,bytes,release,f.exp,join(f.dir,'web')),/asset identity/);
});
test('Pages CLI rejects a self-consistent counterfeit pair against upstream artifact digests',async t=>{
 const f=await fixture(t);await artifacts(f);const record=await Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp),original=JSON.stringify(record);
 await writeFile(join(f.dir,'web/release.json'),original);
 const script='#!/usr/bin/env node\nconsole.log(JSON.stringify({object:{sha:process.env.RELEASE_COMMIT}}));\n';await writeFile(join(f.dir,'bin/gh'),script);await chmod(join(f.dir,'bin/gh'),0o755);
 const env={...f.env,RELEASE_IDENTITY_SHA256:sha(original),RELEASE_HTML_SHA256:record.web.htmlSha256};
 let result=spawnSync(process.execPath,[module,'verify-web',join(f.dir,'web')],{cwd:f.dir,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const html=readFileSync(join(f.dir,'web/index.html'),'utf8')+'<script>counterfeit()</script>';await writeFile(join(f.dir,'web/index.html'),html);record.web.htmlSha256=sha(html);await writeFile(join(f.dir,'web/release.json'),JSON.stringify(record));
 result=spawnSync(process.execPath,[module,'verify-web',join(f.dir,'web')],{cwd:f.dir,env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/tested release-job digests/);
});
// The actual CLI, Git source metadata, immutable upload policy and retry path run
// against a small fake gh transport. No real tag/release/Prod write is possible.
const fakeGh=String.raw`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const a=process.argv.slice(2),file=process.env.FAKE_RELEASE_STATE,s=JSON.parse(fs.readFileSync(file)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function save(){fs.writeFileSync(file,JSON.stringify(s));}function out(v){console.log(JSON.stringify(v));}function fail(m){console.error(m);process.exit(1);}
function draft(){return {id:101,tag_name:'v1.2.3',target_commitish:s.commit,draft:true,prerelease:false,assets:[],...s.createOverride};}
s.calls??=[];s.calls.push(a);save();
if(a[0]==='api'){
 const method=a.includes('--method')?a[a.indexOf('--method')+1]:'GET',route=a.find(value=>value.startsWith('repos/')||value.startsWith('/repos/'))?.replace(/^\//,'');
 if(route.endsWith('/heads/Prod')||route.endsWith('/heads/Dev'))out({object:{sha:s.commit}});
 else if(route.includes('/compare/'))out({status:'ahead'});
 else if(route.includes('/git/ref/tags/'))s.tag?out({object:{type:'commit',sha:s.commit}}):fail('HTTP 404');
 else if(route.endsWith('/git/refs')&&method==='POST'){const b=JSON.parse(fs.readFileSync(0));if(b.sha!==s.commit)fail('wrong tag');s.tag=true;s.writes.push('tag');save();out({});}
 else if(route.includes('/releases/tags/')){if(s.byTagError)fail('HTTP '+s.byTagError);if(s.emptyByTagReply)process.exit(0);if(Object.hasOwn(s,'byTagReply'))out(s.byTagReply);else s.release&&!s.release.draft&&!s.forceByTag404?out(s.release):fail('HTTP 404');}
 else if(route==='repos/fixture/quaked/releases'&&method==='POST'){
  const body=JSON.parse(fs.readFileSync(0));if(body.tag_name!=='v1.2.3'||body.target_commitish!==s.commit||body.draft!==true||body.generate_release_notes!==true||body.name!=='Quaked v1.2.3'||s.release)fail('Unexpected release creation');s.release=draft();s.writes.push('draft');save();out(s.release);
 }else if(/^repos\/fixture\/quaked\/releases\?/.test(route)&&method==='GET'){
  if(s.listError)fail('HTTP '+s.listError);if(Object.hasOwn(s,'listReply'))out(s.listReply);else{const page=Number(new URL('https://fixture/'+route).searchParams.get('page')??1);out(s.listPages?s.listPages[page-1]??[]:page===1&&s.release?[s.release]:[]);}
 }else if(/^repos\/fixture\/quaked\/releases\/\d+$/.test(route)){
  const id=Number(route.split('/').at(-1)),release=s.release?.id===id?s.release:s.listPages?.flat().find(row=>row.id===id);if(!release)fail('HTTP 404');
  if(method==='GET'){s.idReads=(s.idReads??0)+1;save();out({...release,...s.idReadOverrides?.[s.idReads]});}else if(method==='PATCH'){const body=JSON.parse(fs.readFileSync(0));if(body.draft!==false||body.make_latest!=='true'||Object.keys(body).some(k=>!['draft','make_latest'].includes(k)))fail('Unexpected release mutation');release.draft=false;s.writes.push('publish');save();out(release);}else fail('Unexpected ID method');
 }else fail('Unexpected API '+route);
}else if(a[0]==='release'){
 if(a[1]==='create'){if(s.release)fail('duplicate draft creation');s.release=draft();s.writes.push('draft');save();}
 else if(a[1]==='upload'){
  const name=path.basename(a[3]);if(name===s.failUpload)fail('HTTP 502');if(s.release.assets.some(x=>x.name===name))fail('refuse replacement');
  const b=fs.readFileSync(a[3]);s.release.assets.push({name,state:'uploaded',digest:'sha256:'+sha(b),size:b.length,content:b.toString('base64')});s.writes.push('upload '+name);save();
 }else if(a[1]==='download'){const r=s.release.assets.find(x=>x.name==='release.json');if(!r)fail('missing identity');process.stdout.write(Buffer.from(r.content,'base64'));}
 else if(a[1]==='edit'){s.release.draft=false;s.writes.push('publish');save();}else fail('Unknown release command');
}else fail('Unknown gh command');
`;
async function publishFixture(t){
 const f=await fixture(t);await artifacts(f);await writeFile(join(f.dir,'bin/gh'),fakeGh);await chmod(join(f.dir,'bin/gh'),0o755);
 const state=join(f.dir,'state.json');await writeFile(state,JSON.stringify({commit:f.exp.commit,tag:true,release:null,writes:[]}));
 f.run=()=>{const result=spawnSync(process.execPath,[f.cli,'publish',join(f.dir,'web'),join(f.dir,'mac')],{cwd:f.dir,env:{...f.env,FAKE_RELEASE_STATE:state},encoding:'utf8',timeout:20000});assert.ifError(result.error);assert.equal(result.signal,null,'CLI must complete rather than time out or be killed');assert(Number.isInteger(result.status),'CLI must have a concrete exit status');return result;};
 f.state=()=>JSON.parse(readFileSync(state));f.setState=value=>writeFile(state,JSON.stringify(value));return f;
}
test('publication creates a draft, verifies immutable assets, then publishes a shared identity',async t=>{
 const f=await publishFixture(t),result=f.run();assert.equal(result.status,0,result.stderr);
 const state=f.state();assert.equal(state.release.draft,false);assert.equal(state.writes.at(-1),'publish');assert.equal(state.release.assets.length,4);
 const record=JSON.parse(readFileSync(join(f.dir,'dist/release-identity/release.json')));assert.equal(record.commit,f.exp.commit);assert.equal(record.version,'1.2.3');
});
test('partial upload stays draft; retry completes the same artifacts without replacement',async t=>{
 const f=await publishFixture(t);let state=f.state();state.failUpload='Quaked_1.2.3_universal.zip';await f.setState(state);
 assert.notEqual(f.run().status,0);state=f.state();assert.equal(state.release.draft,true);assert(!state.writes.includes('publish'));assert.equal(state.release.assets.length,3);
 delete state.failUpload;await f.setState(state);const result=f.run();assert.equal(result.status,0,result.stderr);assert.equal(f.state().writes.filter(x=>x==='upload release.json').length,1);assert.equal(f.state().release.draft,false);
});
test('published retry keeps the original Mac build when the same source rebuild differs',async t=>{
 const f=await publishFixture(t);assert.equal(f.run().status,0);const original=readFileSync(join(f.dir,'dist/release-identity/release.json')),writes=f.state().writes.length;
 const p=join(f.dir,'mac/mac-archive.json'),receipt=JSON.parse(await readFile(p,'utf8')),newBytes=Buffer.from('same-source rebuilt native archive');await writeFile(join(f.dir,'mac',receipt.archive),newBytes);receipt.bytes=newBytes.length;receipt.sha256=sha(newBytes);await writeFile(p,JSON.stringify(receipt));
 const result=f.run();assert.equal(result.status,0,result.stderr);assert.equal(f.state().writes.length,writes);assert.deepEqual(readFileSync(join(f.dir,'dist/release-identity/release.json')),original);
});

test('publisher cannot create a version tag outside the atomic App promotion',async t=>{
 const f=await publishFixture(t);const state=f.state();state.tag=false;await f.setState(state);
 const result=f.run();assert.notEqual(result.status,0);assert.match(result.stderr,/create the version tag atomically/);assert.deepEqual(f.state().writes,[]);assert.equal(f.state().release,null);
});

test('web stamping checks the exact browser-tested bytes and clean commit provenance',async t=>{
 const f=await fixture(t);const {html}=await artifacts(f);await mkdir(join(f.dir,'dist'));
 await writeFile(join(f.dir,'web/inventory.json'),JSON.stringify({version:f.exp.version,sourceCommit:f.exp.commit,source:f.exp.commit,sourceKind:'working-tree-based-on-commit'}));
 await writeFile(join(f.dir,'dist/browser-trial.json'),JSON.stringify({targetSha256:sha(html)}));
 let result=spawnSync(process.execPath,[module,'stamp-web',join(f.dir,'web')],{cwd:f.dir,env:f.env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 assert.equal(JSON.parse(await readFile(join(f.dir,'web/web-release.json'),'utf8')).commit,f.exp.commit);
 await writeFile(join(f.dir,'dist/browser-trial.json'),JSON.stringify({targetSha256:'0'.repeat(64)}));
 result=spawnSync(process.execPath,[module,'stamp-web',join(f.dir,'web')],{cwd:f.dir,env:f.env,encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/browser-tested artifact/);
});

const draftFor=(f,change={})=>({id:101,tag_name:f.exp.tag,target_commitish:f.exp.commit,draft:true,prerelease:false,assets:[],...change});
const listCalls=state=>state.calls.filter(args=>args[0]==='api'&&args.some(value=>value.startsWith('repos/fixture/quaked/releases?')));
const noisePage=(f,page)=>Array.from({length:100},(_,n)=>draftFor(f,{id:1000+page*100+n,tag_name:'v9.'+page+'.'+n}));
const identityAsset=(f,record,change={})=>{
 const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n');return {name:'release.json',state:'uploaded',digest:'sha256:'+sha(bytes),size:bytes.length,content:bytes.toString('base64'),...change};
};
test('REST draft-by-tag404 resumes the unique existing empty draft by ID without creating another',async t=>{
 const f=await publishFixture(t),state=f.state();state.release=draftFor(f);await f.setState(state);
 const result=f.run();assert.equal(result.status,0,result.stderr);const after=f.state();assert(!after.writes.includes('draft'));assert.equal(after.release.id,101);assert.equal(after.release.draft,false);assert.equal(after.release.assets.length,4);assert(listCalls(after).length>0);
 const idReads=after.calls.filter(args=>args[0]==='api'&&args.includes('repos/fixture/quaked/releases/101')&&args.includes('GET'));assert(idReads.length>=2,'Draft metadata read by ID before and after upload');
 const publish=after.calls.find(args=>args[0]==='api'&&args.includes('PATCH'));assert(publish?.includes('repos/fixture/quaked/releases/101'),'Only the admitted ID may be published');assert(!after.calls.some(args=>args[0]==='release'&&args[1]==='edit'));
});
test('draft lookup searches later pages and rejects a duplicate matching tag on a later page',async t=>{
 for(const duplicate of [false,true]){
  const f=await publishFixture(t),state=f.state();state.release=draftFor(f);state.listPages=duplicate?[[...noisePage(f,1).slice(0,99),state.release],[draftFor(f,{id:102})]]:[noisePage(f,1),[state.release]];await f.setState(state);
  const result=f.run(),after=f.state();assert(listCalls(after).some(args=>args.some(value=>value.includes('page=2'))),'Second page was actually requested');
  if(duplicate){assert.notEqual(result.status,0);assert.match(result.stderr,/ambiguous|multiple/i);assert.deepEqual(after.writes,[]);}
  else{assert.equal(result.status,0,result.stderr);assert(!after.writes.includes('draft'));assert.equal(after.release.draft,false);}
 }
});
test('ten full listing pages fail closed instead of assuming absence and creating a release',async t=>{
 const f=await publishFixture(t),state=f.state();state.listPages=Array.from({length:10},(_,page)=>noisePage(f,page));await f.setState(state);
 const result=f.run(),after=f.state();assert.notEqual(result.status,0);assert.match(result.stderr,/pagination|page|exhaust|limit/i);assert.equal(listCalls(after).length,10);assert.deepEqual(after.writes,[]);assert.equal(after.release,null);
});
test('non404 tag/list API failures and malformed listing never turn into create permission',async t=>{
 for(const change of [{byTagError:403},{byTagError:500},{listError:500},{listReply:{releases:[]}},{listReply:[null]},{listReply:[{}]},{listReply:[{id:102}]},{listReply:[{tag_name:'v9.9.9'}]},{listReply:[{id:Number.MAX_SAFE_INTEGER+1,tag_name:'v9.9.9'}]},{listReply:[{id:103,tag_name:''}]}]){
  const f=await publishFixture(t),state=f.state();await f.setState({...state,...change});const result=f.run(),after=f.state();assert.notEqual(result.status,0);assert.deepEqual(after.writes,[]);assert.equal(after.release,null);
  if(change.byTagError)assert.equal(listCalls(after).length,0,'Only a real404 permits draft listing');
 }
});
test('matching draft identity and creation responses must be explicit safe metadata',async t=>{
 for(const change of [{id:0},{id:Number.MAX_SAFE_INTEGER+1},{tag_name:'v9.9.9'},{target_commitish:P},{draft:false},{prerelease:true},{assets:null}]){
  const f=await publishFixture(t),state=f.state();state.createOverride=change;await f.setState(state);const result=f.run(),after=f.state();assert.notEqual(result.status,0);assert.deepEqual(after.writes,['draft'],'Created response refused before any upload or publish');
 }
 for(const change of [{target_commitish:P},{draft:false},{prerelease:true}]){
  const f=await publishFixture(t),state=f.state();state.release=draftFor(f,change);state.forceByTag404=true;await f.setState(state);const result=f.run();assert.notEqual(result.status,0);assert.deepEqual(f.state().writes,[]);
 }
});
test('every existing draft asset is validated before missing uploads; conflicts are never overwritten',async t=>{
 for(const kind of ['unknown','duplicate','digest','size','starter']){
  const f=await publishFixture(t),record=await Artifacts(join(f.dir,'web'),join(f.dir,'mac'),f.exp),state=f.state();const first=identityAsset(f,record);let extra;
  if(kind==='unknown')extra={name:'unrelated.bin',state:'uploaded',digest:'sha256:'+'0'.repeat(64),size:1};
  else if(kind==='duplicate')extra={...first};
  else extra={name:'mac-archive.json',state:kind==='starter'?'starter':'uploaded',digest:'sha256:'+(kind==='digest'?'0'.repeat(64):record.mac.receiptSha256),size:kind==='size'?1:readFileSync(join(f.dir,'mac/mac-archive.json')).length};
  state.release=draftFor(f,{assets:[first,extra]});await f.setState(state);const result=f.run();assert.notEqual(result.status,0);assert.deepEqual(f.state().writes,[],'No missing upload may precede an existing-asset conflict');
 }
});
test('by-ID metadata changes before upload or before publish stop the admitted draft',async t=>{
 for(const change of [{target_commitish:P},{id:102}])for(const when of [1,2]){
  const f=await publishFixture(t),state=f.state();state.release=draftFor(f);state.idReadOverrides={[when]:change};await f.setState(state);const result=f.run(),after=f.state();assert.notEqual(result.status,0);assert(!after.writes.includes('publish'));assert(!after.writes.includes('draft'));
  if(when===1)assert.deepEqual(after.writes,[]);else assert.equal(after.writes.filter(value=>value.startsWith('upload ')).length,4,'Post-upload identity refusal retains the completed draft assets');
 }
});
test('successful null primitive or empty by-tag replies never authorize listing or creation',async t=>{
 for(const change of [...[null,false,0,'','not-a-release'].map(byTagReply=>({byTagReply})),{emptyByTagReply:true}]){
  const f=await publishFixture(t),state=f.state();await f.setState({...state,...change});const result=f.run(),after=f.state();assert.notEqual(result.status,0);assert.deepEqual(after.writes,[]);assert.equal(listCalls(after).length,0,'Only completed HTTP404 permits fallback');assert.equal(after.release,null);
 }
});
