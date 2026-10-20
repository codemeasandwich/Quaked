/** Finish the owner's artwork move only after originals are retained in pushed Git.
 * Default is a read-only dry run. Usage: node tools/box_art/finish-move.mjs <commit> [--apply]
 * Keeps directories, game data, held posters and changed/unplanned images untouched.
 * An atomic per-file receipt permits resumption without relabelling absent files as removed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const candidate=process.argv[2],apply=process.argv.includes('--apply');
if(!/^[0-9a-f]{40}$/.test(candidate??''))throw Error('Provide the full retained candidate commit');
const git=args=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const hash=b=>createHash('sha256').update(b).digest('hex');
git(['merge-base','--is-ancestor',candidate,'origin/Dev']);
const recipePath='docs/evidence/box-art-standardization-2026-10-20/derivation.json';
const committed=git(['show',candidate+':'+recipePath]);
if(hash(committed)!==hash(await fs.readFile(recipePath)))throw Error('Recipe changed since retained candidate');
const recipe=JSON.parse(committed),sources=recipe.sources.filter(s=>s.origin==='local');
const library=await fs.realpath('/Users/bri/quaked');
const receiptPath=`dist/art-standardization-${candidate.slice(0,8)}/move-receipt.json`;
let receipt={candidate,originDev:git(['rev-parse','origin/Dev']).toString().trim(),recipeSha256:hash(committed),removed:[],protected:recipe.exclusions};
try{const saved=JSON.parse(await fs.readFile(receiptPath));if(saved.candidate!==candidate)throw Error('Receipt identity mismatch');receipt=saved;}catch(e){if(e.code!=='ENOENT')throw e;}
const persist=async()=>{await fs.mkdir(path.dirname(receiptPath),{recursive:true});await fs.writeFile(receiptPath+'.tmp',JSON.stringify(receipt,null,2)+'\n');await fs.rename(receiptPath+'.tmp',receiptPath);};
for(const held of recipe.exclusions)if(hash(await fs.readFile(held.path))!==held.sha256)throw Error('Protected image changed: '+held.path);
// Check every archive against its pushed Git blob before unlinking any external image.
for(const s of sources){if(hash(await fs.readFile(s.archivePath))!==s.sha256||hash(git(['show',candidate+':'+s.archivePath]))!==s.sha256)throw Error('Archive retention failure: '+s.archivePath);}
const checks=[];
for(const s of sources){
 const prior=receipt.removed.find(r=>r.originalPath===s.originalPath);
 const info=await fs.lstat(s.originalPath).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(!info){if(!prior)throw Error('Unacknowledged missing image: '+s.originalPath);checks.push({path:s.originalPath,state:'previously removed',sha256:s.sha256});continue;}
 if(prior)throw Error('Previously moved path reappeared; preserve new source: '+s.originalPath);
 const parent=await fs.realpath(path.dirname(s.originalPath));
 if(!info.isFile()||info.isSymbolicLink()||path.dirname(parent)!==library||await fs.realpath(s.originalPath)!==s.originalPath)throw Error('Unsafe source identity: '+s.originalPath);
 if(hash(await fs.readFile(s.originalPath))!==s.sha256)throw Error('Source changed; preserve: '+s.originalPath);
 checks.push({path:s.originalPath,state:apply?'moved':'verified; no removal',sha256:s.sha256});
 if(apply){
  // Recheck both retained and external bytes immediately before this exact unlink.
  if(hash(await fs.readFile(s.originalPath))!==s.sha256||hash(await fs.readFile(s.archivePath))!==s.sha256)throw Error('Concurrent source/archive change: '+s.originalPath);
  await fs.unlink(s.originalPath);receipt.removed.push({...s,removedAt:new Date().toISOString()});await persist();
 }
}
if(apply){receipt.completedAt=new Date().toISOString();await persist();}
console.log(JSON.stringify({mode:apply?'applied':'dry-run',candidate,checks,receipt:apply?receiptPath:null},null,2));
