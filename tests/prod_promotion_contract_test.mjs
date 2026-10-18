// Independent public policy/CLI checks. All Git writes target temporary repositories;
// all HTTP responses are synthetic, including App auth and the CAS mutation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,copyFile,chmod,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {Plan,CompareAndSwap} from '../tools/distribution/promote.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=join(root,'tools/distribution/promote.mjs');
const A='a'.repeat(40), B='b'.repeat(40), D='d'.repeat(40), TREE='e'.repeat(40);
const repository='owner/project';
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('GIT_')&&!['GITHUB_ACTIONS','NODE_OPTIONS'].includes(k)));
const digest=x=>createHash('sha256').update(x).digest('hex');

// The same synthetic server drives exported policy calls and actual CLI subprocesses.
// Unexpected requests fail closed, so a dry run cannot hide an unasserted mutation.
function response(path,request={},settings={}){
 const a='a'.repeat(40),b='b'.repeat(40),d='d'.repeat(40),tree='e'.repeat(40),base='/repos/owner/project',sha=settings.sha??a,prod=settings.prod??b;
 const content=text=>({encoding:'base64',size:Buffer.byteLength(text),content:Buffer.from(text).toString('base64')});
 if(path===base)return {id:42,node_id:'R_fixture'};
 if(path===base+'/git/ref/heads/Dev')return {object:{sha:d}};
 if(path===base+'/git/ref/heads/Prod')return {object:{sha:request.readback?(settings.readback??sha):(settings.freshProd??prod)}};
 if(path===base+'/commits/'+sha)return {sha:settings.commitObject??sha,commit:{tree:{sha:tree}}};
 if(path===base+'/compare/'+sha+'...'+d)return {status:settings.devComparison??'ahead'};
 if(path===base+'/compare/'+prod+'...'+sha||path===base+'/compare/'+settings.freshProd+'...'+sha)return {status:settings.prodComparison??'ahead'};
 if(path===base+'/contents/package.json?ref='+sha)return content(JSON.stringify({version:settings.version??'1.2.3'}));
 if(path===base+'/contents/.github/workflows/distribution.yml?ref='+sha)return content(settings.workflow??'# quaked-prod-release-v1\n');
 if(path===base+'/git/ref/tags/v'+(settings.version??'1.2.3'))return request.readback?{object:settings.tagReadback??{type:'commit',sha}}:settings.tag?{object:{type:'commit',sha:settings.tag}}:null;
 if(path===base+'/actions/workflows/distribution.yml/runs?event=push&head_sha='+sha+'&per_page=100')return {workflow_runs:settings.runs??[{id:7,head_sha:sha,head_branch:'Dev',event:'push',status:'completed',conclusion:'success',path:'.github/workflows/distribution.yml',repository:{id:42}}]};
 if(path===base+'/actions/workflows/distribution.yml/runs?branch=Prod&per_page=100')return {workflow_runs:settings.prior??[{head_sha:settings.freshProd??prod,event:'push',run_number:1,status:'completed',conclusion:'success'}]};
 if(path==='/graphql'&&settings.casThrow)throw Error('synthetic connection lost');
 if(path==='/graphql')return settings.casErrors?{errors:[{type:'STALE_DATA'}]}:settings.casNoAck?{data:{}}:{data:{updateRefs:{clientMutationId:null}}};
 if(path==='/app')return {id:settings.appIdentity??123};
 if(path==='/app/installations/456/access_tokens')return {token:'fixture-installation-token',permissions:settings.permissions??{contents:'write',workflows:'write',actions:'read',metadata:'read'}};
 if(path===base+'/rulesets/789')return settings.rule??{target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/Prod'],exclude:[]}},rules:[{type:'update'}],bypass_actors:[{actor_type:'Integration',actor_id:123,bypass_mode:'always'}]};
 if(path===base+'/rulesets/790')return settings.prodHistory??{target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/Prod'],exclude:[]}},bypass_actors:[],rules:[{type:'deletion'},{type:'creation'},{type:'non_fast_forward'}]};
 if(path===base+'/rulesets/791')return settings.devHistory??{target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/Dev'],exclude:[]}},bypass_actors:[],rules:[{type:'deletion'},{type:'non_fast_forward'}]};
 if(path===base+'/rulesets/792')return settings.tagCreation??{target:'tag',enforcement:'active',conditions:{ref_name:{include:['refs/tags/v*'],exclude:[]}},rules:[{type:'creation'}],bypass_actors:[{actor_type:'Integration',actor_id:123,bypass_mode:'always'}]};
 if(path===base+'/rulesets/793')return settings.tagHistory??{target:'tag',enforcement:'active',conditions:{ref_name:{include:['refs/tags/v*'],exclude:[]}},rules:[{type:'update'},{type:'deletion'}],bypass_actors:[]};
 if(path==='/installation/token')return null;
 throw Error('Unexpected fixture endpoint '+path);
}
function apiFixture(settings={}){
 const calls=[];let updated=false;
 const api=async(path,request={})=>{calls.push({path,...request});const value=response(path,{...request,readback:updated},settings);if(path==='/graphql'&&!settings.casErrors&&!settings.casNoAck)updated=true;return value;};
 return {api,calls};
}
async function plan(settings={}){const f=apiFixture(settings);return {...f,plan:await Plan(f.api,repository,settings.sha??A)};}
async function temp(fn){const path=await realpath(await mkdtemp(join(tmpdir(),'quaked-prod-public-')));try{return await fn(path);}finally{await rm(path,{recursive:true,force:true});}}
function git(path,...args){const p=spawnSync('git',args,{cwd:path,env:cleanEnv,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return p.stdout.trim();}

// This code is preloaded with Node --import before the *real* CLI entrypoint.
// It never falls back to network. JWT signatures are verified with a fake public key.
const mockSource=`import {readFileSync,appendFileSync} from 'node:fs';
import {verify} from 'node:crypto';
const response=${response.toString()};
const settings=JSON.parse(process.env.QUAKED_PROMOTION_FIXTURE);
let updated=false;
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url);if(u.origin!=='https://api.github.com')throw Error('Unexpected network origin');
 const path=u.pathname+u.search,method=options.method??'GET',auth=options.headers?.Authorization??'';
 let jwt=null;
 if(auth&&auth!=='Bearer fixture-installation-token'){
  const parts=auth.slice(7).split('.');const header=JSON.parse(Buffer.from(parts[0],'base64url'));const claims=JSON.parse(Buffer.from(parts[1],'base64url'));
  if(header.alg!=='RS256'||claims.iss!=='123'||claims.exp-claims.iat!==600||Math.abs(claims.iat-(Date.now()/1000-60))>5||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),readFileSync(settings.publicKey),Buffer.from(parts[2],'base64url')))throw Error('Invalid synthetic App JWT');
  jwt={verified:true,iss:claims.iss,lifetime:claims.exp-claims.iat};
 }
 const body=options.body?JSON.parse(options.body):undefined;
 appendFileSync(settings.log,JSON.stringify({path,method,body,jwt,installationAuth:auth==='Bearer fixture-installation-token'})+'\\n');
 const current={...settings};if(current.stale&&auth==='Bearer fixture-installation-token')current.freshProd='c'.repeat(40);
 const data=response(path,{readback:updated},current);
 if(path==='/graphql'&&!current.casErrors&&!current.casNoAck)updated=true;
 const status=data===null&&path.includes('/git/ref/tags/')?404:method==='DELETE'?204:200;
 return new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
};`;
async function cliSetup(path,settings={}){
 const mock=join(path,'mock.mjs'),controller=join(path,'promote.mjs'),log=join(path,'requests.jsonl');
 await writeFile(mock,mockSource);await copyFile(source,controller);await writeFile(log,'');
 const run=(args=[],extra={})=>spawnSync(process.execPath,['--import',mock,extra.controller??controller,'--repository',repository,'--sha',A,...args],{cwd:extra.cwd??path,env:{...cleanEnv,QUAKED_PROMOTION_FIXTURE:JSON.stringify({...settings,log,...extra.settings}),...extra.env},encoding:'utf8',timeout:20000});
 return {mock,controller,log,run,calls:async()=> (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x))};
}
async function appSetup(path,settings={}){
 const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const publicKey=join(path,'fake-public.pem'),privateKeyFile=join(path,'fake-private.pem'),config=join(path,'private-config.json');
 await writeFile(publicKey,keys.publicKey);await writeFile(privateKeyFile,keys.privateKey,{mode:0o600});
 const f=await cliSetup(path,{...settings,publicKey});const value={repository,repositoryId:42,controllerSha256:digest(await readFile(f.controller)),appId:123,installationId:456,updateRulesetId:789,prodHistoryRulesetId:790,devHistoryRulesetId:791,tagCreateRulesetId:792,tagHistoryRulesetId:793,privateKeyFile};
 await writeFile(config,JSON.stringify(value),{mode:0o600});return {...f,config,value,privateKeyFile,publicKey};
}

 test('promotion plan selects an explicit qualified Dev ancestor without mutating anything',async()=>{
 const f=await plan();assert.deepEqual(f.plan,{repository,repositoryId:42,repositoryNodeId:'R_fixture',commit:A,tree:TREE,dev:D,expectedProd:B,version:'1.2.3',tag:'v1.2.3',qualificationRun:7,alreadyPromoted:false});assert.ok(f.calls.every(c=>!c.method||c.method==='GET'));
 });
 test('plan rejects abbreviated/uppercase/non-SHA selections and invalid repository before API access',async()=>{
 for(const sha of ['',A.slice(0,12),A.toUpperCase(),'g'.repeat(40),'refs/heads/Dev']){let n=0;await assert.rejects(Plan(async()=>{n++;},repository,sha),/explicit full lowercase/);assert.equal(n,0);}
 await assert.rejects(Plan(async()=>assert.fail('unexpected API'),'owner/project/extra',A),/explicit full lowercase/);
 });
 test('plan rejects a non-Dev commit, non-fast-forward and wrong commit object',async()=>{
 for(const status of ['behind','diverged']){await assert.rejects(plan({devComparison:status}),/must belong to Dev/);await assert.rejects(plan({prodComparison:status}),/only fast-forward/);}
 await assert.rejects(plan({commitObject:D}),/exact commit/);
 });
 test('release source, numeric version and unused tag are mandatory',async()=>{
 for(const version of ['1.2','01.2.3','1.2.3-rc1','v1.2.3'])await assert.rejects(plan({version}),/numeric/);
 await assert.rejects(plan({workflow:'name: Distribution'}),/predates/);
 await assert.rejects(plan({tag:A}),/already tagged/);
 });
 test('CI qualification binds commit, Dev branch, push event, workflow, repository and completed success',async()=>{
 const good={id:7,head_sha:A,head_branch:'Dev',event:'push',status:'completed',conclusion:'success',path:'.github/workflows/distribution.yml',repository:{id:42}};
 for(const delta of [{head_sha:D},{head_branch:'Prod'},{event:'pull_request'},{status:'in_progress'},{conclusion:'failure'},{path:'other.yml'},{repository:{id:43}}])await assert.rejects(plan({runs:[{...good,...delta}]}),/no successful Distribution push/);
 await assert.rejects(plan({runs:[]}),/no successful/);
 });
 test('a pending/failed current Prod publication blocks a later selection; already-selected is explicit',async()=>{
 for(const p of [{status:'in_progress',conclusion:null},{status:'completed',conclusion:'failure'},{status:'completed',conclusion:'cancelled'}])await assert.rejects(plan({prior:[{head_sha:B,event:'push',run_number:2,...p}]}),/Finish or retry/);
 await assert.rejects(plan({prior:[]}),/no acknowledged publication/);
 const f=await plan({prod:A,tag:A,prior:[{head_sha:A,event:'push',run_number:1,status:'completed',conclusion:'failure'}]});assert.equal(f.plan.alreadyPromoted,true);
 });
 test('CAS atomically sends exact non-forced Prod and new version-tag refs and verifies both readbacks',async()=>{
 const f=await plan();const result=await CompareAndSwap(f.api,f.plan);const mutation=f.calls.find(c=>c.path==='/graphql');assert.equal(mutation.method,'POST');assert.deepEqual(mutation.body.variables,{repositoryId:'R_fixture',updates:[{name:'refs/heads/Prod',beforeOid:B,afterOid:A,force:false},{name:'refs/tags/v1.2.3',beforeOid:'0'.repeat(40),afterOid:A,force:false}]});assert.equal(f.calls.filter(c=>c.path==='/graphql').length,1,'Both updates belong to one transaction');assert.deepEqual(f.calls.slice(-2).map(c=>c.path),['/repos/'+repository+'/git/ref/heads/Prod','/repos/'+repository+'/git/ref/tags/v1.2.3']);assert.match(result.promotion,/pending/);assert.equal(result.commit,A);
 for(const settings of [{casErrors:true},{casNoAck:true},{readback:D},{tagReadback:{type:'commit',sha:D}},{tagReadback:{type:'tag',sha:A}},{casThrow:true}]){const x=await plan(settings);await assert.rejects(CompareAndSwap(x.api,x.plan),/rejected|not acknowledged|readback differs|outcome is unknown/);}
 });
 test('actual CLI defaults to a GET-only dry run and rejects applying from a Git checkout',async()=>temp(async path=>{
 const f=await cliSetup(path);let p=f.run();assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).dryRun,true);assert.ok((await f.calls()).every(c=>c.method==='GET'));assert.ok(!(await f.calls()).some(c=>/\/app|graphql/.test(c.path)));
 // A staged/archive test tree deliberately has no .git. Create the guarded
 // checkout explicitly instead of assuming this test's source lives in Git.
 const checkout=join(path,'controller-checkout');await mkdir(checkout);git(checkout,'init','-q');
 const guardedController=join(checkout,'promote.mjs');await copyFile(source,guardedController);
 p=f.run(['--apply','--config',join(path,'missing-config')],{controller:guardedController});assert.notEqual(p.status,0);assert.match(p.stderr,/outside Git/);assert.ok(!(await f.calls()).some(c=>c.path==='/graphql'));
 p=f.run(['--apply']);assert.notEqual(p.status,0);assert.match(p.stderr,/requires the local/);
 }));
 test('standalone App CLI verifies fake RSA JWT, exact gate, fresh plan and CAS then revokes token',async()=>temp(async path=>{
 const f=await appSetup(path);const p=f.run(['--apply','--config',f.config]);assert.equal(p.status,0,p.stderr);const calls=await f.calls();assert.deepEqual(calls.filter(c=>c.jwt).map(c=>[c.path,c.jwt.verified]),[['/app',true],['/app/installations/456/access_tokens',true]]);assert.deepEqual(calls.find(c=>c.path.endsWith('/access_tokens')).body,{repository_ids:[42],permissions:{contents:'write',workflows:'write',actions:'read'}});assert.equal(calls.filter(c=>c.path==='/graphql').length,1);assert.deepEqual(calls.at(-1),{path:'/installation/token',method:'DELETE',jwt:null,installationAuth:true});assert.match(p.stdout,/publication still pending/);
 }));
 test('App apply rejects Actions, insecure/in-repository private files, symlink bypass and wrong controller identity',async()=>temp(async path=>{
 const f=await appSetup(path);let p=f.run(['--apply','--config',f.config],{env:{GITHUB_ACTIONS:'true'}});assert.notEqual(p.status,0);assert.match(p.stderr,/never run App promotion in Actions/);
 await chmod(f.config,0o644);p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/mode0600/);await chmod(f.config,0o600);
 const repo=join(path,'repo');await mkdir(repo);git(repo,'init','-q');const key=join(repo,'private.pem');await copyFile(f.privateKeyFile,key);await chmod(key,0o600);const alias=join(path,'key-link');await symlink(key,alias);await writeFile(f.config,JSON.stringify({...f.value,privateKeyFile:alias}));p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/outside every Git checkout/);
 const cfg=join(repo,'config.json');await writeFile(cfg,JSON.stringify(f.value),{mode:0o600});p=f.run(['--apply','--config',cfg]);assert.notEqual(p.status,0);assert.match(p.stderr,/outside every Git checkout/);
 await writeFile(f.config,JSON.stringify({...f.value,controllerSha256:'0'.repeat(64)}));p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/audited controller/);assert.ok(!(await f.calls()).some(c=>c.path==='/graphql'));
 }));
 test('App rejects a stale reviewed plan or any other bypass actor and revokes issued credentials',async()=>{
 for(const settings of [{stale:true},{appIdentity:999},{rule:{target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/Prod'],exclude:[]}},rules:[{type:'update'}],bypass_actors:[]}}, {casErrors:true},{prodHistory:{enforcement:'disabled'}},{devHistory:{enforcement:'disabled'}}])await temp(async path=>{
  const f=await appSetup(path,settings);const p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/changed since|identity mismatch|exclusively identify|compare-and-swap rejected|history protection/);const calls=await f.calls();if(!settings.appIdentity)assert.equal(calls.at(-1).path,'/installation/token');if(!settings.casErrors)assert.ok(!calls.some(c=>c.path==='/graphql'));
 });
 });
 test('actual production pre-commit and pre-push hooks prohibit direct Prod writes in disposable Git',async()=>temp(async path=>{
 await mkdir(join(path,'tools/distribution'),{recursive:true});await mkdir(join(path,'.githooks'));
 for(const name of ['precommit.mjs','prod-push-guard.mjs'])await copyFile(join(root,'tools/distribution',name),join(path,'tools/distribution',name));
 for(const name of ['pre-commit','pre-push']){await copyFile(join(root,'.githooks',name),join(path,'.githooks',name));await chmod(join(path,'.githooks',name),0o755);}
 git(path,'init','-q','-b','Dev');git(path,'config','user.name','Public fixture');git(path,'config','user.email','fixture@example.invalid');await writeFile(join(path,'seed'),'seed');git(path,'add','.');git(path,'-c','core.hooksPath=/dev/null','commit','-qm','fixture');git(path,'switch','-qc','Prod');git(path,'config','core.hooksPath','.githooks');await writeFile(join(path,'seed'),'changed');git(path,'add','seed');
 const before=git(path,'rev-parse','HEAD'),index=git(path,'ls-files','--stage');const p=spawnSync('git',['commit','-qm','forbidden'],{cwd:path,env:{...cleanEnv,PATH:dirname(process.execPath)+':'+cleanEnv.PATH},encoding:'utf8',timeout:10000});assert.notEqual(p.status,0);assert.match(p.stderr,/Direct commits to Prod/);assert.equal(git(path,'rev-parse','HEAD'),before);assert.equal(git(path,'ls-files','--stage'),index);
 const invoke=input=>spawnSync(join(path,'.githooks/pre-push'),['origin','fixture'],{cwd:path,input,env:{...cleanEnv,PATH:dirname(process.execPath)+':'+cleanEnv.PATH},encoding:'utf8',timeout:10000});
 for(const input of [`refs/heads/Dev ${A} refs/heads/Prod ${B}\n`, `(delete) ${'0'.repeat(40)} refs/heads/Prod ${B}\n`,`refs/heads/Prod ${A} refs/heads/Prod ${'0'.repeat(40)}\n`]){const result=invoke(input);assert.notEqual(result.status,0);assert.match(result.stderr,/Direct pushes to Prod/);}
 assert.equal(invoke(`refs/heads/Dev ${A} refs/heads/Dev ${B}\n`).status,0);assert.notEqual(invoke('malformed\n').status,0);
 }));

test('actual standalone CLI invoked through a symlink still executes and prints the reviewed dry-run plan',async()=>temp(async path=>{
 const f=await cliSetup(path),link=join(path,'controller-link.mjs');await symlink(f.controller,link);
 const p=f.run([],{controller:link});assert.equal(p.status,0,p.stderr);assert.notEqual(p.stdout.trim(),'','A successful CLI must execute instead of silently returning without a plan');assert.equal(JSON.parse(p.stdout).commit,A);assert.ok((await f.calls()).every(c=>c.method==='GET'));
}));
test('a rejected installation-token permission response is revoked without attempting promotion',async()=>temp(async path=>{
 const f=await appSetup(path,{permissions:{contents:'write',workflows:'write',actions:'write'}});
 const p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/token permissions differ/);
 const calls=await f.calls();assert.ok(!calls.some(c=>c.path==='/graphql'));assert.equal(calls.at(-1).path,'/installation/token','Even a rejected issued credential must be revoked');assert.equal(calls.at(-1).method,'DELETE');
}));

test('App requires creation by only its dedicated identity and immutable no-bypass version-tag history',async()=>{
 await temp(async path=>{
  const f=await appSetup(path);
  for(const key of ['tagCreateRulesetId','tagHistoryRulesetId']){
   const value={...f.value};delete value[key];await writeFile(f.config,JSON.stringify(value));
   const p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/Missing dedicated App configuration/);
  }
  assert.ok(!(await f.calls()).some(c=>c.path==='/app'||c.path==='/graphql'),'Both tag-policy IDs are mandatory before App authentication');
 });
 const creation=response('/repos/'+repository+'/rulesets/792');
 const history=response('/repos/'+repository+'/rulesets/793');
 const appActor={actor_type:'Integration',actor_id:123,bypass_mode:'always'};
 const invalid=[
  {tagCreation:{...creation,bypass_actors:[]}},
  {tagCreation:{...creation,bypass_actors:[{...appActor,actor_id:999}]}},
  {tagCreation:{...creation,bypass_actors:[{...appActor,actor_type:'Team'}]}},
  {tagCreation:{...creation,bypass_actors:[appActor,appActor]}},
  {tagCreation:{...creation,target:'branch'}},
  {tagCreation:{...creation,conditions:{ref_name:{include:['refs/tags/*'],exclude:[]}}}},
  {tagCreation:{...creation,rules:[]}},
  {tagHistory:{...history,bypass_actors:[appActor]}},
  {tagHistory:{...history,rules:[{type:'update'}]}},
  {tagHistory:{...history,enforcement:'disabled'}}
 ];
 for(const settings of invalid)await temp(async path=>{
  const f=await appSetup(path,settings);const p=f.run(['--apply','--config',f.config]);assert.notEqual(p.status,0);assert.match(p.stderr,/version-tag policy|Version-tag bypass/);
  const calls=await f.calls();assert.ok(!calls.some(c=>c.path==='/graphql'),'Invalid tag gate cannot reach any ref mutation');assert.equal(calls.at(-1).path,'/installation/token');assert.equal(calls.at(-1).method,'DELETE');
 });
});
