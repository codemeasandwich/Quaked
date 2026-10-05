// Retain the original generated gzip locally; only referenced transport parts
// belong to the runtime/commit. Compressed and decompressed contents are exact.
import {readFile,writeFile} from 'node:fs/promises';
import {sha256} from './pak_members.mjs';
const path='newer/displacement/manifest.json',manifest=JSON.parse(await readFile(path,'utf8'));
for(const variants of Object.values(manifest.levels))for(const spec of variants){
 if(spec.parts||spec.compressedBytes<90*1024*1024)continue;
 const bytes=await readFile(spec.file);if(sha256(bytes)!==spec.sha256)throw Error('Prepared bundle changed '+spec.file);
 const parts=[];for(let at=0;at<bytes.length;at+=40*1024*1024){const chunk=bytes.subarray(at,Math.min(bytes.length,at+40*1024*1024)),file=spec.file+'.part'+parts.length;await writeFile(file,chunk);parts.push({file,bytes:chunk.length,sha256:sha256(chunk)});}
 spec.parts=parts;spec.originalFile=spec.file;delete spec.file;console.log('SPLIT '+spec.originalFile+' '+parts.length+' verified byte chunks');
}
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');await writeFile('src/demon_bakes.js','// Generated exact BSP variants, including streamed transport chunks.\nexport const DEMON_BAKES = '+JSON.stringify(manifest.levels,null,1)+';\n');
