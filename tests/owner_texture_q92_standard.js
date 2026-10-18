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
export const ownerQ92Bindings=[...byName.values()];
export function ownerQ92Binding(name){return byName.get(name)?.current??null;}
export function ownerQ92Previous(name,fallback){return byName.get(name)?.previous??fallback;}
export function ownerQ92Baseline(field,name,previous){
 const entry=byName.get(name);if(!entry||!['textures','normals'].includes(field))return previous;
 equal(previous,field==='textures'?entry.previous.file:entry.previous.normal,'owner successor starts from fixed baseline field');return field==='textures'?entry.current.file:entry.current.normal;
}
export function ownerQ92Registration(original){
 const entry=byName.get(original.name);if(!entry)return original;
 equal(original.kind,'exact-original-reuse','owner successor preserves native-reuse kind');equal(original.key,entry.nativeKey,'owner successor original key');equal(original.pixelSha256,entry.sourcePixelSha256,'owner successor original native pixel digest');equal({file:original.file,normal:original.normal},entry.previous,'owner successor original immutable registration descriptor');
 const diffuse=byFile.get('newer/textures/'+entry.current.file),height=byFile.get('newer/textures/'+entry.current.normal.file);equal(original.diffuseSha256,diffuse.masterSha256,'owner successor original diffuse digest');equal(original.heightSha256,height.masterSha256,'owner successor original height digest');
 return {...original,file:entry.current.file,normal:entry.current.normal,diffuseSha256:diffuse.sha256,heightSha256:height.sha256};
}
