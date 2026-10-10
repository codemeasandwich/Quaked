// Every installed shareware MDL, loaded in reverse directory order rather than
// the baker's sorted order. The golden is from SHA-bound retained HEAD greedy
// strip/fan code, not from the optimized cache or generated baked records.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {COM_LoadPackFile,COM_AddPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import {Mod_Init,Mod_ForName} from '../src/engine/render/gl_model.js';
import {AliasMeshSignature} from '../src/newer/assets/alias_mesh_format.js';
import {ALIAS_MESH_BAKES} from '../src/newer/assets/alias_mesh_bakes.js';
import {R_AliasMeshCacheStatus} from '../src/newer/assets/r_aliasmeshcache.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
export const sha=b=>createHash('sha256').update(b).digest('hex'),arraySHA=a=>sha(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
export function visitNative(visit){const bytes=readFileSync(new URL('../games/shareware/pak0.pak',import.meta.url)),pak=COM_LoadPackFile('native-alias-independent',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));COM_AddPack(pak);VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);Mod_Init();const names=pak.files.filter(f=>/^progs\/[^/]+\.mdl$/.test(f.name)).map(f=>f.name).reverse();same(names.length,61,'all61 installed MDLs');for(const name of names){const model=Mod_ForName(name,true);visit(name,model,model.cache.data,COM_FindFile(name).data);}return sha(bytes);}
Deno.test('all61 native models hit prepared topology independent of load order and match retained HEAD command/order bytes while keeping every actual pose reference',()=>{
 const expected=JSON.parse(readFileSync(new URL('./fixtures/alias-mesh-before.json',import.meta.url),'utf8'));let count=0,poseReferences=0;const proof=[];
 const pakSHA=visitNative((name,model,h,bytes)=>{const reference=expected.models[name];check(reference,name+' retained original oracle exists');same(sha(bytes),reference.sourceSHA256,name+' native MDL bytes unchanged');check(Object.hasOwn(ALIAS_MESH_BAKES,AliasMeshSignature(h)),name+' exact active topology has prepared entry after reverse native load order');same(arraySHA(h.commands),reference.commandsSHA256,name+' original greedy command bits');same(arraySHA(h.meshVertexOrder),reference.orderSHA256,name+' original greedy vertex order');same(h.poseverts_count,reference.vertices,name+' vertex count');same(h.commands.length,reference.commands,name+' command count');
  for(let pose=0;pose<h.numposes;pose++)for(let vertex=0;vertex<h.poseverts_count;vertex++){same(h.posedata[pose][vertex],h.poseverts[pose][h.meshVertexOrder[vertex]],name+' current native pose object, not cached geometry');poseReferences++;}proof.push({name,commands:h.commands.length,vertices:h.poseverts_count,poses:h.numposes});count++;});
 same(pakSHA,expected.pakSHA256,'actual installed PAK matches retained-byte oracle');same(count,61,'every native header compared');check(poseReferences>100000,'substantial real current-animation reference coverage');check(R_AliasMeshCacheStatus().entries<=64&&R_AliasMeshCacheStatus().bytes<=8*1024*1024,'full native corpus respects cache bounds');console.log('ALIAS_NATIVE_ORIGINAL '+JSON.stringify({models:count,poseReferences,pakSHA256:pakSHA,oracleSourceSHA256:expected.originalMeshSourceSHA256,modelsChecked:proof}));
});
