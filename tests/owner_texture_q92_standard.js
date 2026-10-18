// Bounded tests-only successor contract. Owner artwork/registrations remain immutable.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sha256 } from '../tools/pak_members.mjs';
const root=resolve(import.meta.dirname,'..');
const read=file=>readFileSync(resolve(root,file));
const check=(v,m)=>{if(!v)throw Error(m);};
const equal=(a,b,m)=>check(isDeepStrictEqual(a,b),m);
const base='tools/texture_sheets/sources/official-world-2026-10-17/';
export const ownerQ92ReceiptPath=base+'owner-q92-first-tranche-v2.json';
export const ownerQ92Receipt=JSON.parse(read(ownerQ92ReceiptPath));
export const ownerQ92BeforePath=base+'owner-q92-first-tranche-index-before.json';
export const ownerQ92BeforeBytes=read(ownerQ92BeforePath);
export const ownerQ92Before=JSON.parse(ownerQ92BeforeBytes);
const planPath=base+'verification/legacy-owner-q92-first-tranche-plan.json';
const plan=JSON.parse(read(planPath)).firstTranche;
equal(sha256(read(planPath)),ownerQ92Receipt.planSha256,'owner Q92 immutable plan digest');
equal(sha256(ownerQ92BeforeBytes),ownerQ92Receipt.indexBeforeSha256,'owner Q92 exact predecessor catalogue');
equal([ownerQ92Receipt.schemaVersion,ownerQ92Receipt.factor,ownerQ92Receipt.quality,ownerQ92Receipt.lossless,ownerQ92Receipt.method],[1,4,92,false,6],'owner Q92 encoding contract');
const keys={city5_3:'64x64:837ce7b57349da7f',metflor2_1:'64x64:837ce7b57349da7f',wizmet1_3:'64x64:006f4d1505d7fbd7',mmetal1_3:'64x64:006f4d1505d7fbd7'};
equal(ownerQ92Receipt.bindings.map(e=>e.name).sort(),Object.keys(keys).sort(),'only two canonical owners and their two aliases');
equal(ownerQ92Receipt.maps.length,4,'only four format derivatives');
export function ownerQ92ImageSize(bytes,label){
 equal(bytes.subarray(0,4).toString(),'RIFF',label+' RIFF');equal(bytes.subarray(8,12).toString(),'WEBP',label+' WebP');equal(bytes.readUInt32LE(4)+8,bytes.length,label+' bounded RIFF');
 let dimensions=null,at=12;
 while(at<bytes.length){
  check(at+8<=bytes.length,label+' complete chunk header');const kind=bytes.subarray(at,at+4).toString(),n=bytes.readUInt32LE(at+4),start=at+8;check(start+n<=bytes.length,label+' bounded chunk');check(kind!=='VP8L',label+' no lossless image payload');
  if(kind==='VP8 '){check(dimensions===null&&n>=10,label+' one lossy VP8 payload');equal(bytes.subarray(start+3,start+6).toString('hex'),'9d012a',label+' VP8 key frame');dimensions=[bytes.readUInt16LE(start+6)&0x3fff,bytes.readUInt16LE(start+8)&0x3fff];}
  at=start+n+(n%2);
 }
 check(dimensions,label+' actual lossy image required');return dimensions;
}
const byName=new Map(),byFile=new Map();
export const ownerQ92Maps=ownerQ92Receipt.maps;
for(const map of ownerQ92Maps){
 check(['diffuse','height'].includes(map.role),'owner Q92 supported role');check(!byFile.has(map.file),'unique owner Q92 output');byFile.set(map.file,map);
 const original=plan.currentFiles.find(f=>f.file===map.predecessor);check(original,'retained owner source path');equal(map.masterSha256,original.sha256,'owner Q92 exact lossless predecessor');equal(sha256(read(map.predecessor)),map.masterSha256,'retained owner source bytes');
 const bytes=read(map.file);equal(sha256(bytes),map.sha256,'owner Q92 current output bytes');equal(bytes.length,map.bytes,'owner Q92 output byte length');equal(ownerQ92ImageSize(bytes,map.file),[256,256],'owner Q92 actual4x dimensions');equal(map.dimensions,[256,256],'owner Q92 receipt dimensions');
}
for(const entry of ownerQ92Receipt.bindings){
 const original=plan.bindings.find(e=>e.name===entry.name);check(original,'owner Q92 planned binding');equal(entry.nativeKey,keys[entry.name],'owner Q92 exact native identity');equal(entry.sourcePixelSha256,original.sourcePixelSha256,'owner Q92 native pixels retained');equal(entry.sourceAllowlist,original.sourceAllowlist,'owner Q92 source allowlist retained');equal(entry.sourceAllowlist,[entry.nativeKey],'owner Q92 one exact source');
 equal(entry.previous,{file:original.file,normal:original.normal},'owner Q92 exact predecessor descriptor');equal(ownerQ92Before.textures[entry.name],entry.previous.file,'owner Q92 predecessor catalogue diffuse');equal(ownerQ92Before.normals[entry.name],entry.previous.normal,'owner Q92 predecessor catalogue relief');equal(ownerQ92Before.sources[entry.name],entry.sourceAllowlist,'owner Q92 predecessor catalogue source guard');
 equal({...entry.current.normal,file:entry.previous.normal.file},entry.previous.normal,'only owner normal file may change');equal(Object.keys(entry.current.normal).sort(),['cap','file','strength'],'owner route remains derived from height only');
 for(const[role,file,previous]of[['diffuse',entry.current.file,entry.previous.file],['height',entry.current.normal.file,entry.previous.normal.file]]){const map=byFile.get('newer/textures/'+file);check(map&&map.role===role,'owner Q92 complete role');equal(map.predecessor,'newer/textures/'+previous,'owner Q92 role links retained predecessor');}
 byName.set(entry.name,entry);
}
for(const[a,b]of[['city5_3','metflor2_1'],['wizmet1_3','mmetal1_3']])equal(byName.get(a).current,byName.get(b).current,'owner and exact-native alias share a complete pair');
// Six further format successors share this adapter, while the original owner4
// exports and lossless-master registration witness remain exactly four maps.
export const techQ92ReceiptPath=base+'legacy-tech-twelve-q92-v1.json';
export const techQ92Receipt=JSON.parse(read(techQ92ReceiptPath));
export const techQ92PlanPath=base+'verification/legacy-tech-twelve-q92-plan.json';
export const techQ92Plan=JSON.parse(read(techQ92PlanPath));
export const techQ92BeforePath=base+'legacy-tech-twelve-index-before.json';
export const techQ92BeforeBytes=read(techQ92BeforePath),techQ92Before=JSON.parse(techQ92BeforeBytes);
export const techQ92Maps=techQ92Receipt.maps,techQ92Bindings=techQ92Receipt.bindings;
const techKeys={tech04_3:'16x128:a479c5cd7f65b1bf',tech07_2:'128x128:5d03decdcf531707',tech08_1:'128x128:ba7e0769a9a0ce1b',tech09_3:'128x128:8ff008acef40a86e',tech10_3:'32x128:31e072256a779b27',tech11_2:'128x128:f56a5604372ecc96'},techByName=new Map(),techByRole=new Map();
equal(sha256(read(techQ92PlanPath)),techQ92Receipt.planSha256,'tech Q92 immutable source plan');
equal(sha256(techQ92BeforeBytes),techQ92Receipt.indexBeforeSha256,'tech Q92 exact predecessor catalogue');
equal(techQ92Receipt.indexBeforeSha256,techQ92Plan.indexSha256,'tech source plan starts at predecessor catalogue');
equal([techQ92Receipt.schemaVersion,techQ92Receipt.factor,techQ92Receipt.quality,techQ92Receipt.lossless,techQ92Receipt.method],[1,4,92,false,6],'tech Q92 format contract');
equal(techQ92Bindings.map(e=>e.name).sort(),Object.keys(techKeys).sort(),'only six original tech materials');
equal(techQ92Maps.length,12,'only twelve tech format maps');
equal(new Set(techQ92Maps.map(m=>m.file)).size,12,'all twelve tech outputs remain distinct');
equal(sha256(read('tools/texture_sheets/finish_runtime_skin.py')),techQ92Receipt.encoderSha256,'tech pure encoder unchanged');
equal(sha256(read(base+'prepare_legacy_tech_q92.py')),techQ92Receipt.authoringToolSha256,'tech authoring tool bound to receipt');
for(const map of techQ92Maps){
 check(Object.hasOwn(techKeys,map.name)&&['diffuse','height'].includes(map.role),'explicit tech map role');const identity=map.name+'|'+map.role;check(!techByRole.has(identity),'one tech output per material role');techByRole.set(identity,map);
 const planned=techQ92Plan.maps.find(p=>p.name===map.name&&p.role===map.role);check(planned,'exact planned tech source');
 for(const [field,plannedField]of[['retainedPre4xFile','retainedPre4xFile'],['retainedPre4xSha256','retainedPre4xSha256'],['predecessor','predecessorFile'],['predecessorSha256','predecessorSha256'],['master','proposedMaster'],['masterDecodedRgbSha256','proposedMasterDecodedRgbSha256'],['file','proposedRuntimeFile'],['dimensions','proposedMasterDimensions']])equal(map[field],planned[plannedField],'tech map retains exact '+field);
 equal(sha256(read(map.retainedPre4xFile)),map.retainedPre4xSha256,'retained pre4x tech source bytes');equal(sha256(read(map.predecessor)),map.predecessorSha256,'retained historical Q95 output bytes');
 const master=read(map.master);equal(sha256(master),map.masterSha256,'tech lossless PNG master bytes');equal(master.subarray(0,8).toString('hex'),'89504e470d0a1a0a','tech master is PNG');equal(master.subarray(12,16).toString(),'IHDR','tech PNG dimension header');equal([master.readUInt32BE(16),master.readUInt32BE(20)],map.dimensions,'tech PNG4x dimensions');
 const output=read(map.file);equal(sha256(output),map.sha256,'tech Q92 output bytes');equal(output.length,map.bytes,'tech Q92 encoded length');equal(ownerQ92ImageSize(output,map.file),map.dimensions,'tech actual lossy4x payload dimensions');
}
for(const entry of techQ92Bindings){
 const planned=techQ92Plan.bindings.find(p=>p.name===entry.name);check(planned,'planned tech material');equal(entry.nativeKey,techKeys[entry.name],'exact native tech key');
 for(const field of['nativeDimensions','sourcePixelSha256','target','sourceAllowlist','previous'])equal(entry[field],planned[field],'tech complete planned '+field);equal(entry.current,planned.proposedCurrent,'exact proposed tech successor');equal(entry.sourceAllowlist,[entry.nativeKey],'tech exact single native source');
 equal(entry.previous,{file:techQ92Before.textures[entry.name],normal:techQ92Before.normals[entry.name]},'tech predecessor complete binding');equal(techQ92Before.sources[entry.name],entry.sourceAllowlist,'tech predecessor guard');check(!techQ92Before.ordinaryVariants?.[entry.name]&&!techQ92Before.glass?.[entry.name],'tech height-only base route remains unshadowed');
 equal(entry.target,entry.nativeDimensions.map(n=>n*4),'tech target is exactly4x per axis');equal({...entry.current.normal,file:entry.previous.normal.file},entry.previous.normal,'only tech height filename changes');equal(Object.keys(entry.current.normal).sort(),(entry.name==='tech08_1'?['cap','file','strength']:['file','strength']).sort(),'tech preserves explicit/absent cap fields');equal(entry.current.normal.strength,1.15,'tech authored strength unchanged');equal(entry.current.normal.cap??1.1,1.1,'tech effective default cap');
 for(const [role,file,previous]of[['diffuse',entry.current.file,entry.previous.file],['height',entry.current.normal.file,entry.previous.normal.file]]){const map=techByRole.get(entry.name+'|'+role);check(map,'both tech roles present');equal(map.file,'newer/textures/'+file,'tech selected role');equal(map.predecessor,'newer/textures/'+previous,'tech retained role');equal(map.dimensions,entry.target,'tech role dimensions');}
 techByName.set(entry.name,entry);
}
const formatEntry=name=>byName.get(name)??techByName.get(name);

export const ownerQ92Bindings=[...byName.values()];
export function ownerQ92Binding(name){return formatEntry(name)?.current??null;}
export function ownerQ92Previous(name,fallback){return formatEntry(name)?.previous??fallback;}
export function ownerQ92Baseline(field,name,previous){
 const entry=formatEntry(name);if(!entry||!['textures','normals'].includes(field))return previous;
 equal(previous,field==='textures'?entry.previous.file:entry.previous.normal,'owner successor starts from fixed baseline field');return field==='textures'?entry.current.file:entry.current.normal;
}
export function ownerQ92Registration(original){
 const entry=byName.get(original.name);if(!entry)return original;
 equal(original.kind,'exact-original-reuse','owner successor preserves native-reuse kind');equal(original.key,entry.nativeKey,'owner successor original key');equal(original.pixelSha256,entry.sourcePixelSha256,'owner successor original native pixel digest');equal({file:original.file,normal:original.normal},entry.previous,'owner successor original immutable registration descriptor');
 const diffuse=byFile.get('newer/textures/'+entry.current.file),height=byFile.get('newer/textures/'+entry.current.normal.file);equal(original.diffuseSha256,diffuse.masterSha256,'owner successor original diffuse digest');equal(original.heightSha256,height.masterSha256,'owner successor original height digest');
 return {...original,file:entry.current.file,normal:entry.current.normal,diffuseSha256:diffuse.sha256,heightSha256:height.sha256};
}
