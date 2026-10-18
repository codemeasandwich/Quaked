/** Verify staged desktop bytes and shared HTML/native source identities. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {assetPath} from '../../../tools/distribution/manifest.mjs';
const root=process.cwd(),dir=resolve(process.argv[2]??'dist/resource-layout-trial');
const desktop=JSON.parse(await readFile(resolve(dir,'desktop/inventory.json'))),web=JSON.parse(await readFile(resolve(dir,'web/inventory.json')));
const html=await readFile(resolve(dir,'desktop/index.html'),'utf8');
const spec=JSON.parse(/<script id="quaked-assets" type="application\/json">([^<]+)<\/script>/.exec(html)[1]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const webFiles=new Map(web.files.map(f=>[f.path,f]));let shared=0,verified=0;
for(const file of desktop.files){
 const entry=spec.files[file.path];assert(entry,file.path);
 const physical=resolve(dir,entry.external?'desktop-assets':'desktop/assets',entry.id);
 assert.equal(hash(await readFile(physical)),file.sha256,'staged bytes: '+file.path);
 if(!file.path.startsWith('__')&&file.path!=='src/newer/assets/rockfield_worker.js')assert.equal(hash(await readFile(assetPath(root,file.path))),file.sourceSha256??file.sha256,'canonical source: '+file.path);
 if(webFiles.has(file.path)){assert.equal(file.sha256,webFiles.get(file.path).sha256,'profiles share same bytes: '+file.path);shared++;}
 verified++;
}
assert.deepEqual(desktop.sourceInputs,web.sourceInputs,'both profiles compiled the same source inputs');
const result={ok:true,desktopFilesVerified:verified,sharedFilesIdentical:shared,sourceInputFiles:Object.keys(web.sourceInputs).length,qualification:'Canonical sources and staged desktop bytes verified; web source hashes equal for every shared logical entry. Offline browser trial separately verifies HTML decode and startup.'};
await writeFile(resolve(dir,'artifact-check.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
