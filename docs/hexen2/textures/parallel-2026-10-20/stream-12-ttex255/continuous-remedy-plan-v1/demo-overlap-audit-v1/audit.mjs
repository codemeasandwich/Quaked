// Read-only recording-map and direct native BSP slot proof for this one target.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const R=process.cwd();
const D=resolve(R,'docs/hexen2/textures/parallel-2026-10-20/stream-12-ttex255/continuous-remedy-plan-v1/demo-overlap-audit-v1');
const {directory,bspTextures}=await import(pathToFileURL(resolve(R,'tools/audit_hexen2_textures.mjs')));
const {readMember,sha256}=await import(pathToFileURL(resolve(R,'tools/pak_members.mjs')));
const check=(v,m)=>{if(!v)throw Error(m);};
const queuePath=resolve(R,'docs/hexen2/textures/demo-priority-2026-10-20/native-hexen-demo-priority-v1.json');
const qb=await readFile(queuePath);check(sha256(qb)==='d07b5b05cf9f3655a70d3b9aa19406b9758fee247781c37f7b07806b6d3ae3af','Priority proof changed');
const queue=JSON.parse(qb);const invPath=resolve(R,'docs/hexen2/textures/parallel-2026-10-20/stream-12-ttex255/native-audit/inventory.json');
const ib=await readFile(invPath),inv=JSON.parse(ib);const id='3d7ed8a7e273c65f769cc6e87f06c7291c2d206e69ba0d05d7813c154819eb8e';
const target=inv.variants.find(x=>x.id===id);check(target,'Target missing');
const dirs=new Map();
async function pak(path){
 if(!dirs.has(path)){
  const d=await directory(path);const expected=inv.archives.find(x=>x.path===path);
  check(expected&&d.proof.sha256===expected.sha256,'Native PAK changed');dirs.set(path,d);
 }
 return dirs.get(path);
}
function firstPacket(data){
 const nl=data.indexOf(10);check(nl>=1&&nl<=16&&/^-?\d+$/.test(data.subarray(0,nl).toString('ascii')),'Invalid DEM track header');
 const at=nl+1;check(data.length>=at+16,'Truncated initial DEM frame');const n=data.readInt32LE(at);
 check(n>0&&n<=1024*1024&&at+16+n<=data.length,'Invalid initial packet bounds');
 for(let i=0;i<3;i++)check(Number.isFinite(data.readFloatLE(at+4+i*4)),'Invalid initial view angle');
 const packet=data.subarray(at+16,at+16+n);const maps=[...packet.toString('latin1').matchAll(/(?:^|\x00)(maps\/[A-Za-z0-9_\/-]+\.bsp)\x00/g)].map(m=>({map:m[1],packetOffset:m.index+(m[0][0]==='\0'?1:0)}));
 check(maps.length>0,'No bounded first-packet map model literal');return {trackHeader:data.subarray(0,nl).toString('ascii'),packetLength:n,maps};
}
const recordings=[];
for(const r of queue.nativeHexenRecordings){
 const b=await readFile(r.file);check(b.length===r.bytes&&sha256(b)===r.sha256,'Loose recording changed');
 const f=firstPacket(b);check(f.packetLength===r.initialPacketLength&&f.maps.some(x=>x.map===r.initialModelMap),'Priority first-packet proof mismatch');
 recordings.push({file:r.file,sha256:r.sha256,bytes:b.length,...f,scope:'Native retained recording, not current-app activation or camera visibility proof'});
}
for(const root of ['/Users/bri/quaked/Hexen 2/portals','/Users/bri/quaked/Hexen 2 Portal of Praevus/Data/portals']){
 const path=join(root,'pak3.pak'),d=await pak(path),e=d.entries.get('t9.dem');check(e,'Portal recording absent');const b=await readMember(e);const f=firstPacket(b);check(f.maps.some(x=>x.map==='maps/thomas.bsp'),'Portal map model changed');
 recordings.push({pak:path,pakSha256:d.proof.sha256,member:'t9.dem',memberOffset:e.offset,bytes:b.length,sha256:sha256(b),...f,scope:'Duplicate installations are path observations; equal content is counted once'});
}
const basePak='/Users/bri/quaked/Hexen 2/data1/pak0.pak',pd=await pak(basePak),palette=await readMember(pd.entries.get('gfx/palette.lmp'));
check(sha256(palette)===target.paletteSha256,'Palette changed');
const desired=[...new Set(recordings.flatMap(x=>x.maps.map(x=>x.map)))];const maps=[];
for(const map of desired){
 const profile=inv.profiles.find(x=>x.id===(map==='maps/thomas.bsp'?'portals-1':'base'));const src=profile.mapSources.find(x=>x.name===map);check(src&&!src.loose,'Unexpected map source semantics');
 const d=await pak(src.source),entry=d.entries.get(map);check(entry&&entry.offset===src.offset,'Map member binding changed');const bsp=await readMember(entry);check(sha256(bsp)===src.sha256,'Map bytes changed');const textures=bspTextures(bsp,palette);
 const identities=textures.map(t=>({...t,id:sha256(Buffer.from(`${t.name}|${t.width}x${t.height}|${sha256(palette)}|${t.rgbaSha256}`))}));
 const exact=identities.filter(x=>x.id===id),rgba=identities.filter(x=>x.rgbaSha256===target.rgbaSha256),sameName=identities.filter(x=>x.name===target.name);
 maps.push({map,source:src.source,pakSha256:d.proof.sha256,memberOffset:entry.offset,bspSha256:sha256(bsp),textureSlots:textures.length,targetIdentitySlots:exact.map(x=>({slot:x.slot,faces:x.faces})),sameRgbaSlots:rgba.map(x=>({slot:x.slot,name:x.name,faces:x.faces})),sameNameSlots:sameName.map(x=>({slot:x.slot,id:x.id,faces:x.faces})),targetCompiledFaceRecords:exact.reduce((n,x)=>n+x.faces,0)});
}
check(maps.every(x=>!x.targetIdentitySlots.length&&!x.sameRgbaSlots.length),'Unexpected target demo overlap');
const result={schemaVersion:1,checkedAt:new Date().toISOString(),verdict:'PASS source-bound negative demo-map overlap; ttex255 deferred under owner demo-first priority',targetNativeIdentity:id,recordings,uniqueRecordingContents:new Set(recordings.map(x=>x.sha256)).size,maps,targetCompiledDemoFaceRecords:maps.reduce((n,x)=>n+x.targetCompiledFaceRecords,0),targetKnownMaps:[...new Set(target.provenance.map(x=>x.map))],targetUniqueContentFaceRecords:538,priorityProof:{file:relative(R,queuePath),sha256:sha256(qb)},inputs:{[relative(R,invPath)]:sha256(ib),[relative(R,resolve(D,'audit.mjs'))]:sha256(await readFile(resolve(D,'audit.mjs'))),[relative(R,resolve(R,'tools/audit_hexen2_textures.mjs'))]:sha256(await readFile(resolve(R,'tools/audit_hexen2_textures.mjs')))},limits:['Initial valid recorded packet map-model literals bind these recordings to maps; no camera/PVS/frame playback visibility is claimed.','Playable BSPs named demo1/2/3 are not automatically recorded demo sequences. Here demo3.dem actually names maps/demo1.bsp.','Native Hexen recordings exist; their presence does not prove the current Quake app activates them. Root/worker336 owns app-loop/startup audit.','Portal duplicate installations collapse by actual recording content hash.','No source/height/producer/tier/shared/Git/build mutation; continue only root-assigned demo-priority intake.']};
await writeFile(resolve(D,'ttex255-demo-overlap.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({verdict:result.verdict,uniqueRecordingContents:result.uniqueRecordingContents,maps:maps.map(x=>({map:x.map,targetFaceRecords:x.targetCompiledFaceRecords,targetSlots:x.targetIdentitySlots.length})),sha256:sha256(await readFile(resolve(D,'ttex255-demo-overlap.json')))}));
