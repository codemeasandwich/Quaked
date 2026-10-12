/** Public, immutable build input. Never searches a user's game library or accepts
 * registered game data. The cache is build-only and is never copied into the Mac app.
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const expected='35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af';
const url='https://raw.githubusercontent.com/codemeasandwich/Quaked/a28d939647d93f7c1ea96160ebb79751388d2fcb/games/shareware/pak0.pak';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const override=process.env.QUAKED_SHAREWARE_PAK;
if(override){if(hash(await readFile(override))!==expected)throw Error('Shareware override checksum mismatch');console.log('Verified explicit shareware build input.');}
else{
 const path=resolve('.distribution-cache/shareware.pak');
 let bytes=await readFile(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 if(bytes&&hash(bytes)!==expected)throw Error('Cached shareware checksum mismatch; preserve and inspect the cache before retrying');
 if(!bytes){
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Shareware source HTTP '+response.status);
  if(Number(response.headers.get('content-length'))>18689235)throw Error('Unexpected shareware response size');
  const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>18689235)throw Error('Shareware response exceeds expected size');chunks.push(chunk);}
  bytes=Buffer.concat(chunks);if(hash(bytes)!==expected)throw Error('Downloaded shareware checksum mismatch');
  await mkdir(resolve('.distribution-cache'),{recursive:true});const temp=path+'.'+process.pid+'.tmp';await writeFile(temp,bytes,{flag:'wx'});await rename(temp,path);
 }
 console.log('Verified pinned shareware build input: '+path);
}
