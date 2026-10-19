/** Shipped shelf-art inventory and provenance; no owner library or build is required. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GAME_BOXES} from '../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../src/engine/common/game_catalogue.js';
import {collectAssets,validateArtifactInventory} from '../tools/distribution/manifest.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const imported={
 shareware:['front.png','back.png','spine.png'], hipnotic:['spine.png'], rogue:['spine.png'], quoth:['back.png','spine.png'],
 mod_q30a1024:['front.png'], mod_quaked:['front.png'], mod_hexen_2:['front.webp','spine.webp'],
 mod_hexen_2_portal_of_praevus:['front.webp','back.webp','spine.webp']
};
const discovered=['mod_q30a1024','mod_quaked','mod_hexen_2','mod_hexen_2_portal_of_praevus'];
const expected=Object.entries(imported).flatMap(([id,names])=>names.map(name=>`assets/boxes/${id}/${name}`)).sort();

test('the fourteen approved local art imports are explicit shipped defaults with unchanged recorded bytes',async()=>{
 assert.deepEqual(Object.keys(GAME_BOXES).filter(id=>!GAME_CATALOGUE_GAMES.some(g=>g.id===id)).sort(),discovered.toSorted(),'only these approved discovered ids may name defaults');
 const manifest=JSON.parse(await readFile(new URL('../docs/evidence/native-box-art-2026-10-19/bundled-import.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.files.map(row=>row.destination).sort(),expected,'the approved import is complete and contains no unrelated files');
 for(const row of manifest.files){
  const face=row.destination.split('/').at(-1).split('.')[0];assert.equal(GAME_BOXES[row.game]?.[face],row.destination,'every imported file is the exact live default for its game/face');
  const bytes=await readFile(new URL('../'+row.destination,import.meta.url));assert.equal(bytes.length,row.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256,'copied image pixels/encoding remain byte-identical to the import record');
 }
 assert.equal(GAME_BOXES.quoth.front,undefined,'the misfiled Quaked front never becomes Quoth art');
});

test('the actual desktop collector includes every live shelf face without importing original game archives',async()=>{
 const assets=await collectAssets({profile:'desktop',root}),included=new Set(assets);
 for(const [id,faces]of Object.entries(GAME_BOXES))for(const face of ['front','back','spine'])if(faces[face])assert.ok(included.has(faces[face]),`${id} ${face} is shipped even without local folder art`);
 assert.doesNotThrow(()=>validateArtifactInventory(assets,'desktop'));
 assert.ok(!assets.some(path=>/^(games|resources)\//.test(path)),'box artwork does not bundle original game archives');
});
