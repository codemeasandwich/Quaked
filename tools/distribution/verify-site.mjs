/** Checks a web site directory before it is published: every data file index.html names
 * exists with exactly the size and sha256 integrity the page will demand, and nothing else
 * sits in data/. Usage: node tools/distribution/verify-site.mjs [dist/web]
 */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function VerifySite(dir){
 const html=await readFile(resolve(dir,'index.html'),'utf8');
 const json=html.match(/<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
 if(!json)throw Error('index.html has no quaked-assets manifest');
 const spec=JSON.parse(json),parts=Object.values(spec.packs??{}).flatMap(pack=>{
  if(pack.parts.reduce((sum,part)=>sum+part.bytes,0)!==pack.bytes)throw Error('A data file\'s parts do not add up to its size');
  return pack.parts;
 }),named=new Set(parts.map(part=>part.file));
 if(parts.length===0)throw Error('index.html names no data files');
 for(const part of parts){
  const bytes=await readFile(resolve(dir,part.file));
  if(bytes.length!==part.bytes)throw Error(`${part.file}: ${bytes.length} bytes, page expects ${part.bytes}`);
  const integrity='sha256-'+createHash('sha256').update(bytes).digest('base64');
  if(integrity!==part.integrity)throw Error(`${part.file}: integrity ${integrity}, page expects ${part.integrity}`);
 }
 const present=(await readdir(resolve(dir,'data')).catch(()=>[])).map(name=>'data/'+name);
 const extra=present.filter(file=>!named.has(file));if(extra.length)throw Error('Unreferenced data files: '+extra.join(', '));
 return {files:parts.length,bytes:parts.reduce((sum,part)=>sum+part.bytes,0)};
}
// Fails closed: compares real paths, so a symlinked or space-containing path still runs.
if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url)))console.log(JSON.stringify(await VerifySite(process.argv[2]??'dist/web')));
