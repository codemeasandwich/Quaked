import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {Context,Expected,Artifacts,VerifyWeb,VerifyExisting} from '../tools/distribution/release.mjs';
const module=resolve('tools/distribution/release.mjs'),S='a'.repeat(40),P='b'.repeat(40),engine='c'.repeat(64),expected={commit:S,version:'1.2.3',tag:'v1.2.3'};
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'quaked-release-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 for(const sub of ['src-tauri','web','mac','bin'])await mkdir(join(dir,sub));
 for(const [name,data] of Object.entries({'package.json':{version:'1.2.3'},'package-lock.json':{version:'1.2.3',packages:{'':{version:'1.2.3'}}},'src-tauri/tauri.conf.json':{version:'../package.json'}}))await writeFile(join(dir,name),JSON.stringify(data));
 await writeFile(join(dir,'src-tauri/Cargo.toml'),'[package]\nname = "quaked"\nversion = "1.2.3"\n');
 const git=(...a)=>execFileSync('git',a,{cwd:dir,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');git('add','.');git('commit','-qm','source');
 const commit=git('rev-parse','HEAD'),exp={...expected,commit};
 await writeFile(join(dir,'event.json'),JSON.stringify({before:P,after:commit,created:false,deleted:false,forced:false}));
 const env={...process.env,GITHUB_SHA:commit,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/Prod',GITHUB_EVENT_PATH:join(dir,'event.json'),GITHUB_REPOSITORY:'fixture/quaked',GITHUB_OUTPUT:join(dir,'github-output'),RELEASE_COMMIT:commit,RELEASE_VERSION:'1.2.3',PATH:join(dir,'bin')+':'+process.env.PATH};
 for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
 return {dir,git,env,exp};
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
if(a[0]==='api'){
 const method=a[a.indexOf('--method')+1],route=a[3];
 if(route.endsWith('/heads/Prod')||route.endsWith('/heads/Dev'))out({object:{sha:s.commit}});
 else if(route.includes('/compare/'))out({status:'ahead'});
 else if(route.includes('/git/ref/tags/'))s.tag?out({object:{type:'commit',sha:s.commit}}):fail('HTTP 404');
 else if(route.endsWith('/git/refs')&&method==='POST'){const b=JSON.parse(fs.readFileSync(0));if(b.sha!==s.commit)fail('wrong tag');s.tag=true;s.writes.push('tag');save();out({});}
 else if(route.includes('/releases/tags/'))s.release?out(s.release):fail('HTTP 404');else fail('Unexpected API '+route);
}else if(a[0]==='release'){
 if(a[1]==='create'){s.release={draft:true,assets:[]};s.writes.push('draft');save();}
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
 f.run=()=>spawnSync(process.execPath,[module,'publish',join(f.dir,'web'),join(f.dir,'mac')],{cwd:f.dir,env:{...f.env,FAKE_RELEASE_STATE:state},encoding:'utf8'});
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
