import '../src/gl_rsurf.js';
import {COM_LoadPackFile,COM_AddPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette,vid} from '../src/vid.js';
import {Mod_Init,Mod_ForName,R_InitTextures} from '../src/gl_model.js';
import {Cvar_RegisterVariable,Cvar_FindVar,Cvar_SetValue} from '../src/engine/common/cvar.js';
import {r_hdr} from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import {R_NewerTexturesForModel,R_NewerTexturesStatus} from '../src/r_newertextures.js';
import * as skins from '../src/r_newerskins.js';
import {NormalInputs,NormalInputWitness,R_NormalPrepared} from '../src/normal_prepare.js';
const button=document.querySelector('#run'),save=document.querySelector('#save'),output=document.querySelector('#report');let report,controller,stopped=false;
const fields=['width','height','crafted','derive','strength','cap','rgba','fullbright','scalar','edge','authored'];
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function show(){window.normalInputTrialReport=report;output.textContent=JSON.stringify(report,null,2);}
function alive(){if(stopped||controller.signal.aborted)throw Error('Trial cancelled or60s bound reached');}
async function fetchBytes(url){const r=await fetch(url,{signal:controller.signal,cache:'no-cache'});if(!r.ok)throw Error(url+' HTTP '+r.status);return r.arrayBuffer();}
async function wait(predicate,label){while(!predicate()){alive();await new Promise(r=>setTimeout(r,10));}alive();report.stages.push({label,elapsedMs:performance.now()-report.startedAt});show();}
function canonical(v){return v===undefined?null:v;}
function compare(witness,candidate){return fields.filter(field=>JSON.stringify(canonical(witness[field]))!==JSON.stringify(canonical(candidate?.[field])));}
function explain(label,witness,levelKeys,manifest,extra={}){
 const exact=manifest.samples[witness.key],candidates=levelKeys?.length?levelKeys:Object.keys(manifest.samples),nearest=candidates.filter(key=>manifest.samples[key]?.input).map(key=>({key,differences:compare(witness,manifest.samples[key].input)})).sort((a,b)=>a.differences.length-b.differences.length).slice(0,3);
 return{label,...extra,witness,exactKey:!!exact,listedForExpectedSource:levelKeys?.includes(witness.key)||false,exactWitnessDifferences:exact?.input?compare(witness,exact.input):null,nearest:exact?[]:nearest};
}
async function surfaces(world,role,manifest){const entries=[];for(const t of new Set([...(world.textures||[]),...(world.texinfo||[]).map(info=>info?.texture)])){alive();if(!t?.gl_texture||t.name.startsWith('*')||t.name.startsWith('sky'))continue;const witness=await NormalInputWitness(NormalInputs(t.gl_texture));entries.push(explain(t.name,witness,manifest.levels['shareware:'+world.name]?.keys,manifest,{role,textureUUID:t.gl_texture.uuid,upgraded:!!t.gl_texture.userData.newerPicture}));}return entries;}
async function run(){
 button.disabled=true;save.disabled=true;controller=new AbortController();stopped=false;report={schema:1,status:'running',origin:location.origin,userAgent:navigator.userAgent,startedAt:performance.now(),stages:[],errors:[],scope:{game:false,GPU:false,RAF:false,physicalBrowserRestart:false,actors:['ogre','zombie','demon']},sources:{},surfaceNative:[],surfaceUpgraded:[],actors:[]};show();
 const timer=setTimeout(()=>{stopped=true;controller.abort();skins.R_NewerSkinsShutdown();report.status='timeout';report.errors.push('Bounded60s diagnostic expired');show();save.disabled=false;},60000);
 try{
  const [packBytes,manifestBytes,skinBytes]=await Promise.all([fetchBytes('../pak0.pak'),fetchBytes('../newer/normals/manifest.json'),fetchBytes('../newer/enemies/index.json')]);alive();const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)),skinIndex=JSON.parse(new TextDecoder().decode(skinBytes));report.sources.manifest=await hash(manifestBytes);report.sources.skinIndex=await hash(skinBytes);report.manifestSamples=Object.keys(manifest.samples).length;
  for(const name of ['normal_prepare','normal_bake_format','normal_transport','gl_normals','r_newertextures','r_newerskins','vid'])report.sources['src/'+name+'.js']=await hash(await fetchBytes('../src/'+name+'.js'));
  COM_AddPack(COM_LoadPackFile('normal-input-native-shareware',packBytes));const palette=COM_FindFile('gfx/palette.lmp').data;VID_SetPalette(palette);vid.fullbright=224;report.palette={sha256:await hash(palette),fullbright:vid.fullbright,configuration:'Matches runtime VID_Init; no renderer initialized'};Mod_Init();R_InitTextures();for(const v of [r_hdr,anim.r_newer_normals,anim.r_newer_enemies,anim.r_newer_textures])if(!Cvar_FindVar(v.name))Cvar_RegisterVariable(v);Cvar_SetValue('r_hdr',0);anim.R_AnimSetNewer(false);anim.R_AnimSetClassicPass(false);
  const world=Mod_ForName('maps/e1m3.bsp',true);report.map={name:world.name,bspSha256:await hash(world.bspSourceBytes)};report.surfaceNative=await surfaces(world,'original-palette',manifest);report.stages.push({label:'Native surface input hashes',elapsedMs:performance.now()-report.startedAt});show();
  Cvar_SetValue('r_hdr',1);for(const v of [anim.r_newer_normals,anim.r_newer_enemies,anim.r_newer_textures])Cvar_SetValue(v.name,1);anim.R_AnimSetNewer(true);R_NewerTexturesForModel(world);await wait(()=>R_NewerTexturesStatus(world).settled,'Actual browser texture upgrade settled');report.textureStatus=R_NewerTexturesStatus(world);report.surfaceUpgraded=await surfaces(world,'actual-upgraded',manifest);show();
  skins.R_NewerSetIndex(skinIndex);const models=report.scope.actors.map(key=>Mod_ForName('progs/'+key+'.mdl',true));await skins.R_NewerSkinsPrepare(models);await wait(()=>{const s=skins.R_NewerSkinsStatus(models);return s.preparePending===0&&s.pending===(s.normals?.pending||0);},'Actual native/custom actor images settled');
  // Read actual renderer-owned companions, including their captured immutable
  // preparation inputs. No hand-built approximation of enemy skin fields.
  const companions=skins.R_NewerSkinsTextures(models).filter(t=>t.userData?.newerHeight?.file?.startsWith('enemy:'));
  for(const t of companions){alive();const work=R_NormalPrepared(t),label=t.userData.newerHeight.file,native=/native\/([^/]+)\//.exec(label);let level;
   if(native)level='shareware:progs/'+native[1]+'.mdl';else for(const variants of Object.values(skinIndex.models||{}))for(const variant of variants)if(label.includes(variant.dir))level='custom:'+variant.dir;
   const witness=await NormalInputWitness(work?.input||NormalInputs(t));report.actors.push(explain(label,witness,manifest.levels[level]?.keys,manifest,{expectedLevel:level||null,textureUUID:t.uuid,jobKey:work?.key||null,jobStatus:work?.status||null,jobSource:work?.source||null,jobError:work?.error||null}));
  }
  report.skinStatus=skins.R_NewerSkinsStatus(models);const summarize=rows=>({count:rows.length,exactKeys:rows.filter(r=>r.exactKey).length,matchedWitnesses:rows.filter(r=>r.exactKey&&r.exactWitnessDifferences?.length===0).length,misses:rows.filter(r=>!r.exactKey).map(r=>({label:r.label,nearest:r.nearest}))});report.summary={native: summarize(report.surfaceNative),upgraded:summarize(report.surfaceUpgraded),actors:summarize(report.actors)};
  if(!report.surfaceNative.length||!report.surfaceUpgraded.length||!report.actors.length)throw Error('Empty diagnostic control; actual samples required');const rows=[...report.surfaceNative,...report.surfaceUpgraded,...report.actors];report.status=rows.every(r=>r.exactKey&&r.exactWitnessDifferences?.length===0)?'MATCH':'MISMATCH';report.completedMs=performance.now()-report.startedAt;show();
 }catch(error){report.status=stopped?'timeout':'error';report.errors.push(String(error.stack||error));show();}finally{clearTimeout(timer);stopped=true;controller.abort();skins.R_NewerSkinsShutdown();save.disabled=false;}
}
button.addEventListener('click',run);save.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='normal-input-witness.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
