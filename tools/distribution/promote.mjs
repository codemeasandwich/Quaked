/** Standalone promotion controller. Install an audited copy OUTSIDE every Git
 * checkout; keep its App key/config local, never in Actions secrets. No builder,
 * scheduler, commits or releases live here: only a guarded CAS of Prod and its version tag.
 */
import {readFile,stat,realpath} from 'node:fs/promises';
import {createHash,sign} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {dirname,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
const SHA=/^[0-9a-f]{40}$/;
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const workflow='.github/workflows/distribution.yml';
export async function PolicyClient(config){
 // GitHub hides bypass_actors unless the caller may edit the ruleset. Keep that
 // authority on the existing operator login; never grant it to the release App.
 const ids=['updateRulesetId','prodHistoryRulesetId','devHistoryRulesetId','tagCreateRulesetId','tagHistoryRulesetId'];
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository??'')||ids.some(key=>!Number.isSafeInteger(config[key])||config[key]<1))throw Error('Invalid operator policy scope');
 if(!isAbsolute(config.ghPath??''))throw Error('Configure an absolute trusted GitHub CLI path for policy inspection');
 const binary=await realpath(config.ghPath),info=await stat(binary);
 if(!info.isFile()||!(info.mode&0o111)||(info.mode&0o022)||(process.getuid&&![0,process.getuid()].includes(info.uid)))throw Error('GitHub CLI must be a trusted installed executable');
 const allowed=new Set(ids.map(key=>'/repos/'+config.repository+'/rulesets/'+config[key]));
 const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN','GH_DEBUG'].includes(key)));
 Object.assign(env,{GH_PROMPT_DISABLED:'1',GH_PAGER:'cat',PAGER:'cat'});
 return async path=>{
  if(!allowed.has(path))throw Error('Operator policy reader only permits the five configured ruleset GETs');
  const result=spawnSync(binary,['api','--hostname','github.com','--method','GET',path],{env,encoding:'utf8',timeout:30000,maxBuffer:1048576,stdio:['ignore','pipe','ignore']});
  if(result.error||result.status!==0)throw Error('Operator GitHub CLI policy read failed; verify the operator login can inspect ruleset bypass lists');
  let value;try{value=JSON.parse(result.stdout);}catch{throw Error('Operator GitHub CLI returned invalid policy JSON');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Operator GitHub CLI returned invalid policy JSON');
  return value;
 };
}
export function Client(token){
 return async(path,{method='GET',body,missing=false}={})=>{
  const response=await fetch('https://api.github.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10',...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(missing&&response.status===404)return null;
  if(!response.ok)throw Error('GitHub '+method+' '+path.split('?')[0]+' failed: HTTP '+response.status);
  return response.status===204?null:response.json();
 };
}
export async function Plan(api,repository,sha){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)||!SHA.test(sha))throw Error('Select a repository and an explicit full lowercase 40-character Dev commit SHA');
 const base='/repos/'+repository,repo=await api(base);
 const dev=(await api(base+'/git/ref/heads/Dev')).object.sha,prod=(await api(base+'/git/ref/heads/Prod')).object.sha;
 const commit=await api(base+'/commits/'+sha);if(commit.sha!==sha)throw Error('Selected object is not the exact commit');
 for(const [from,to,reason] of [[sha,dev,'Selected commit must belong to Dev'],[prod,sha,'Prod may only fast-forward']]){
  const comparison=await api(base+'/compare/'+from+'...'+to);
  if(!['ahead','identical'].includes(comparison.status))throw Error(reason);
 }
 const content=async path=>{
  const value=await api(base+'/contents/'+path+'?ref='+sha);
  if(value.encoding!=='base64'||value.size>200000)throw Error('Invalid release source: '+path);
  return Buffer.from(value.content,'base64').toString('utf8');
 };
 const pkg=JSON.parse(await content('package.json')),version=pkg.version;
 if(!VERSION.test(version))throw Error('Release version must be numeric major.minor.patch');
 if(!(await content(workflow)).includes('# quaked-prod-release-v1'))throw Error('This commit predates the Prod release policy');
 const tag='v'+version,existingTag=await api(base+'/git/ref/tags/'+tag,{missing:true});
 if(sha!==prod&&existingTag)throw Error('Release version is already tagged; select a new version commit on Dev');
 const successful=(await api(base+'/actions/workflows/distribution.yml/runs?event=push&head_sha='+sha+'&per_page=100')).workflow_runs.find(run=>run.head_sha===sha&&run.head_branch==='Dev'&&run.event==='push'&&run.status==='completed'&&run.conclusion==='success'&&run.path===workflow&&run.repository?.id===repo.id);
 if(!successful)throw Error('Selected Dev commit has no successful Distribution push run');
 const prior=(await api(base+'/actions/workflows/distribution.yml/runs?branch=Prod&per_page=100')).workflow_runs.filter(run=>run.head_sha===prod&&run.event==='push').sort((a,b)=>b.run_number-a.run_number)[0];
 if(sha!==prod&&!prior&&prod!=='3f2084c043eec0108bc70f12fd47f4d5060a53ff')throw Error('The current Prod push has no acknowledged publication run yet');
 if(sha!==prod&&prior&&(prior.status!=='completed'||prior.conclusion!=='success'))throw Error('Finish or retry the current Prod publication before another promotion');
 return {repository,repositoryId:repo.id,repositoryNodeId:repo.node_id,commit:sha,tree:commit.commit.tree.sha,dev,expectedProd:prod,version,tag,qualificationRun:successful.id,alreadyPromoted:sha===prod};
}
export async function CompareAndSwap(api,plan){
 let result;try{result=await api('/graphql',{method:'POST',body:{query:'mutation($repositoryId:ID!,$updates:[RefUpdate!]!){updateRefs(input:{repositoryId:$repositoryId,refUpdates:$updates}){clientMutationId}}',variables:{repositoryId:plan.repositoryNodeId,updates:[{name:'refs/heads/Prod',beforeOid:plan.expectedProd,afterOid:plan.commit,force:false},{name:'refs/tags/'+plan.tag,beforeOid:'0'.repeat(40),afterOid:plan.commit,force:false}]}}});}catch(error){throw Error('Prod update outcome is unknown; inspect its ref before retrying: '+error.message);}
 if(result.errors?.length)throw Error('Prod compare-and-swap rejected: '+result.errors.map(e=>e.type??'reference error').join(', ')+'. Inspect both refs before retrying');
 if(!result.data?.updateRefs)throw Error('Prod update was not acknowledged');
 try{
 const actual=(await api('/repos/'+plan.repository+'/git/ref/heads/Prod')).object.sha;
 if(actual!==plan.commit)throw Error('Prod readback differs; inspect the publication state before retrying');
 const tag=(await api('/repos/'+plan.repository+'/git/ref/tags/'+plan.tag)).object;if(tag.type!=='commit'||tag.sha!==plan.commit)throw Error('Version tag readback differs; inspect the promotion before retrying');
 return {commit:actual,promotion:'acknowledged; release and Pages qualification/publication still pending'};
 }catch(error){throw Error('Atomic Prod+tag update was acknowledged; inspect both refs before retrying: '+error.message);}
}
async function PrivateFile(path){
 if(!isAbsolute(path))throw Error('Private configuration/key paths must be absolute');
 path=await realpath(path);const s=await stat(path);if(!s.isFile()||(s.mode&0o077))throw Error('Private configuration/key must be a mode0600 file');
 if(spawnSync('git',['-C',dirname(path),'rev-parse','--show-toplevel'],{stdio:'ignore'}).status===0)throw Error('Private configuration/key must stay outside every Git checkout');
 return readFile(path,'utf8');
}
export async function Apply(plan,configPath){
 const self=fileURLToPath(import.meta.url);
 if(process.env.GITHUB_ACTIONS==='true'||spawnSync('git',['-C',dirname(self),'rev-parse','--show-toplevel'],{stdio:'ignore'}).status===0)throw Error('Install the audited standalone controller outside Git; never run App promotion in Actions');
 const config=JSON.parse(await PrivateFile(configPath));
 if(config.repository!==plan.repository||config.repositoryId!==plan.repositoryId||config.controllerSha256!==createHash('sha256').update(await readFile(self)).digest('hex'))throw Error('Private configuration does not identify this audited controller/repository');
 for(const key of ['appId','installationId','updateRulesetId','prodHistoryRulesetId','devHistoryRulesetId','tagCreateRulesetId','tagHistoryRulesetId'])if(!Number.isSafeInteger(config[key])||config[key]<1)throw Error('Missing dedicated App configuration');
 const policy=await PolicyClient(config);
 const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iat:now-60,exp:now+540,iss:String(config.appId)});
 const jwt=unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),await PrivateFile(config.privateKeyFile)).toString('base64url');
 const app=Client(jwt),identity=await app('/app');if(identity.id!==config.appId)throw Error('App identity mismatch');
 const issued=await app('/app/installations/'+config.installationId+'/access_tokens',{method:'POST',body:{repository_ids:[plan.repositoryId],permissions:{contents:'write',workflows:'write',actions:'read'}}});
 if(typeof issued.token!=='string')throw Error('App installation token missing');
 const api=Client(issued.token);let result,failure;
 try{
 const permissions=issued.permissions??{};if(permissions.contents!=='write'||permissions.workflows!=='write'||permissions.actions!=='read'||Object.keys(permissions).some(key=>!['contents','workflows','actions','metadata'].includes(key)))throw Error('App token permissions differ from the repository-scoped promotion contract');

  const rule=await policy('/repos/'+plan.repository+'/rulesets/'+config.updateRulesetId);
  if(rule.target!=='branch'||rule.enforcement!=='active'||rule.conditions?.ref_name?.include?.length!==1||rule.conditions.ref_name.include[0]!=='refs/heads/Prod'||rule.conditions.ref_name.exclude?.length!==0||rule.rules?.length!==1||rule.rules[0].type!=='update'||rule.bypass_actors?.length!==1||rule.bypass_actors[0].actor_type!=='Integration'||rule.bypass_actors[0].actor_id!==config.appId||rule.bypass_actors[0].bypass_mode!=='always')throw Error('Prod update gate does not exclusively identify the dedicated App');
  for(const [id,branch,required] of [[config.prodHistoryRulesetId,'Prod',['deletion','creation','non_fast_forward']],[config.devHistoryRulesetId,'Dev',['deletion','non_fast_forward']]]){
   const history=await policy('/repos/'+plan.repository+'/rulesets/'+id),refs=history.conditions?.ref_name;
   if(history.target!=='branch'||history.enforcement!=='active'||history.bypass_actors?.length!==0||refs?.include?.length!==1||refs.include[0]!=='refs/heads/'+branch||refs.exclude?.length!==0||!required.every(type=>history.rules?.some(rule=>rule.type===type)))throw Error('Missing no-bypass '+branch+' history protection');
  }
  for(const [id,required,bypass] of [[config.tagCreateRulesetId,['creation'],true],[config.tagHistoryRulesetId,['update','deletion'],false]]){
   const tags=await policy('/repos/'+plan.repository+'/rulesets/'+id),refs=tags.conditions?.ref_name,actors=tags.bypass_actors;
   if(tags.target!=='tag'||tags.enforcement!=='active'||refs?.include?.length!==1||refs.include[0]!=='refs/tags/v*'||refs.exclude?.length!==0||!required.every(type=>tags.rules?.some(rule=>rule.type===type)))throw Error('Missing protected version-tag policy');
   if(bypass?(actors?.length!==1||actors[0].actor_type!=='Integration'||actors[0].actor_id!==config.appId||actors[0].bypass_mode!=='always'):actors?.length!==0)throw Error('Version-tag bypass must identify only the dedicated App for creation, nobody for mutation');
  }
  const fresh=await Plan(api,plan.repository,plan.commit);
  if(fresh.expectedProd!==plan.expectedProd)throw Error('Prod changed since the reviewed promotion plan');
  if(fresh.alreadyPromoted)result={commit:fresh.commit,promotion:'already selected; rerun the recorded failed publication jobs instead of moving Prod'};
  else result=await CompareAndSwap(api,fresh);
 }catch(error){failure=error;}
 try{await api('/installation/token',{method:'DELETE'});}catch(error){
  throw Error((result?'Prod is at '+result.commit+'; release publication remains pending. ':failure?.message+' ')+'App token revocation failed; inspect Prod before retrying. The installation token expires automatically.');
 }
 if(failure)throw failure;return result;
}
async function main(){
 const args=process.argv.slice(2),values={};let apply=false;
 while(args.length){const key=args.shift();if(key==='--apply')apply=true;else if(['--sha','--repository','--config'].includes(key)&&args.length)values[key]=args.shift();else throw Error('Usage: promote.mjs --sha FULL_DEV_SHA [--repository OWNER/REPO] [--apply --config ABSOLUTE_PRIVATE_CONFIG]');}
 const plan=await Plan(Client(),values['--repository']??'codemeasandwich/Quaked',values['--sha']??'');
 console.log(JSON.stringify({dryRun:!apply,...plan},null,2));
 if(apply){if(!values['--config'])throw Error('--apply requires the local dedicated App configuration');console.log(JSON.stringify(await Apply(plan,values['--config']),null,2));}
}
if(process.argv[1]&&realpathSync(fileURLToPath(import.meta.url))===realpathSync(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
