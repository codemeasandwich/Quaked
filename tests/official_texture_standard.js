// Current-original/current-official checks for the owner's 4x/Q92 standard.
// Immutable migration records describe history; retired rasters are not inputs.
import { readFileSync } from './helpers/resource_fs.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { sha256 } from '../tools/pak_members.mjs';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { R_NormalMapFor } from '../src/newer/render/gl_normals.js';
import { ownerQ92Registration } from './owner_texture_q92_standard.js';
import { NormalInputs, NormalGenerate } from '../src/newer/assets/normal_prepare.js';

const root=resolve(import.meta.dirname,'..'),read=file=>readFileSync(resolve(root,file)),textureBytes=file=>read('newer/textures/'+file);
const check=(value,message)=>{if(!value)throw Error(message);};
const equal=(actual,expected,message)=>check(isDeepStrictEqual(actual,expected),message);
const fixture=JSON.parse(read('tests/fixtures/official-textures.json'));
equal(fixture.schemaVersion,1,'current official fixture schema');
export const fourTimesStandard=JSON.parse(read('tools/texture_sheets/sources/official-world-2026-10-12/four-times-standard.json'));
equal([fourTimesStandard.schemaVersion,fourTimesStandard.factor],[1,4],'explicit4x migration contract');
equal([fourTimesStandard.bindings.length,fourTimesStandard.trials.length],[14,16],'all14native identities and16historical aliases accounted for');
equal(fourTimesStandard.historicalInputs.length,3,'three immutable registration inputs');
for(const input of fourTimesStandard.historicalInputs)equal(sha256(read(input.file)),input.sha256,'historical registration unchanged '+input.file);
const bindings=new Map(fourTimesStandard.bindings.map(e=>[e.name+'|'+e.nativeKey,e]));
equal(bindings.size,14,'unique migrated identities');
equal(new Set(fourTimesStandard.bindings.map(b=>b.current.binding.file)).size,12,'twelve prior artworks across aliases');
const sourceDirectory='tools/texture_sheets/sources/official-world-2026-10-12/';
const channelRegistration=JSON.parse(read(sourceDirectory+'q92-channel-registration.json'));
const priorQ92=JSON.parse(read(sourceDirectory+'q92-prior-generation-migration.json'));
const cityRegistration=JSON.parse(read(sourceDirectory+'city2-registration.json'));
const index=JSON.parse(read('newer/textures/index.json')),q92Bindings=new Map(),q92Trials=new Map();
function lossyWebP(bytes,label){
 check(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP',label+' actual WebP');
 const chunks=[];let at=12;while(at<bytes.length){check(at+8<=bytes.length,label+' complete chunk');const n=bytes.readUInt32LE(at+4);check(at+8+n<=bytes.length,label+' bounded chunk');chunks.push(bytes.subarray(at,at+4).toString());at+=8+n+(n&1);}
 check(chunks.includes('VP8 ')&&!chunks.includes('VP8L'),label+' lossyVP8');
}
function validateQ92Entry(entry){
 const current=fixture.entries.find(e=>e.name===entry.name&&e.key===entry.key);check(current,entry.name+' accepted official identity');
 for(const field of ['binding','source','sourceFile','sourceFileSha256','diffuseSha256','heightSha256','normalChannelSha256','encodingReceipt'])equal(current[field],entry[field],entry.name+' immutable registered '+field);
 equal([entry.factor,entry.quality,entry.lossless],[4,92,false],entry.name+' registered4x/lossy92');
 equal(entry.source.key,entry.key,entry.name+' source key');equal(entry.source.name,entry.name,entry.name+' source name');
 const file=fixture.encodingReceipts[entry.encodingReceipt];equal(current.metadataFile,file,entry.name+' retained metadata locator');check(file?.startsWith('assets/authoring/texture_sheets/official-encodings/'),entry.name+' metadata outside retired candidates');
 const digest=fixture.metadataSha256?.[entry.encodingReceipt]??current.metadataSha256;check(typeof digest==='string',entry.name+' metadata byte witness');equal(current.metadataSha256,fixture.metadataSha256[entry.encodingReceipt],entry.name+' consistent metadata witnesses');equal(sha256(read(file)),digest,entry.name+' immutable selected metadata');
 const encoded=JSON.parse(read(file));equal([encoded.factor,encoded.quality,encoded.lossless,encoded.normalLayout],[4,92,false,'channels'],entry.name+' selected encoder contract');
 equal(encoded.original,entry.sourceFile,entry.name+' original path');equal(encoded.originalSha256,entry.sourceFileSha256,entry.name+' original digest');equal(sha256(read(entry.sourceFile)),entry.sourceFileSha256,entry.name+' actual native PNG');
 equal([encoded.profile.strength,encoded.profile.cap],[entry.binding.normal.strength,entry.binding.normal.cap],entry.name+' reviewed lighting profile');
 const live=index.ordinaryVariants?.[entry.name]?.[entry.key]??(index.sources?.[entry.name]?.includes(entry.key)?{file:index.textures[entry.name],normal:index.normals[entry.name]}:undefined);equal(live,entry.binding,entry.name+' current source-guarded runtime binding');
 const dims=[entry.source.width*4,entry.source.height*4];equal(encoded.comparisonDivisor,2,entry.name+' primary half-native comparison');equal(encoded.comparisonDimensions,[entry.source.width/2,entry.source.height/2],entry.name+' half-native size');equal(encoded.secondaryComparisonDimensions,[entry.source.width/4,entry.source.height/4],entry.name+' quarter-native size');
 for(const[role,path,hash]of[['diffuse',entry.binding.file,entry.diffuseSha256],['height',entry.binding.normal.file,entry.heightSha256],...['x','y','z'].map(a=>['normal'+a.toUpperCase(),entry.binding.normal.normalChannels[a],entry.normalChannelSha256[a]])]){
  check(path.startsWith('official/'),entry.name+' current official '+role);const output=encoded.outputs[role];equal([output.quality,output.lossless],[92,false],entry.name+' lossy92 '+role);equal(output.dimensions,dims,entry.name+' 4x '+role);equal(output.sha256,hash,entry.name+' selected metadata SHA '+role);const bytes=textureBytes(path);equal(sha256(bytes),hash,entry.name+' actual official SHA '+role);lossyWebP(bytes,entry.name+' '+role);
 }
 return current;
}
function currentTrial(alias,entry){
 const t=fixture.trials[alias];check(t,alias+' accepted original/official comparison');equal(t.nativeKey,entry.key,alias+' native key');if((t.name??alias)!==entry.name){const donor=fixture.entries.find(e=>e.name===(t.name??alias)&&e.key===entry.key);check(donor,alias+' explicit same-native named donor');for(const field of ['binding','sourceFile','sourceFileSha256','diffuseSha256','heightSha256','normalChannelSha256'])equal(donor[field],entry[field],alias+' exact original/official alias '+field);equal(donor.source.pixelSha256,entry.source.pixelSha256,alias+' same actual native RGBA witness');}
 for(const[field,value]of Object.entries({file:entry.binding.file,height:entry.binding.normal.file,normalChannels:entry.binding.normal.normalChannels,width:entry.source.width*4,heightPixels:entry.source.height*4,diffuseSha256:entry.diffuseSha256,heightSha256:entry.heightSha256,normalChannelSha256:entry.normalChannelSha256,original:entry.sourceFile,originalSha256:entry.sourceFileSha256}))equal(t[field],value,alias+' official comparison '+field);
 return t;
}
equal(channelRegistration.entries.map(e=>e.name).sort(),['city2_3','city2_5','city2_6','tech10_2','tech04_4','door02_1','ceil1_1'].sort(),'seven explicit channel identities');
for(const entry of channelRegistration.entries){
 const earlierCity=cityRegistration.entries.find(e=>e.name===entry.name&&e.key===entry.key),earlierTrial=fourTimesStandard.trials.find(t=>t.alias===entry.name&&t.nativeKey===entry.key);check(earlierCity||earlierTrial,entry.name+' explicit historical registration');
 if(earlierCity){equal(entry.previousBinding,earlierCity.binding,entry.name+' exact previous metadata');equal(entry.source,earlierCity.source,entry.name+' unchanged native witness');}else equal(entry.previousBinding,null,entry.name+' former trial metadata');
 const current=validateQ92Entry(entry);if(earlierTrial)q92Trials.set(earlierTrial.alias,currentTrial(earlierTrial.alias,current));
}
equal([priorQ92.schemaVersion,priorQ92.factor,priorQ92.quality,priorQ92.lossless],[1,4,92,false],'prior-generation contract');equal(sha256(read(priorQ92.historicalInput.file)),priorQ92.historicalInput.sha256,'immutable prior-generation ledger');equal([priorQ92.entries.length,priorQ92.trials.length],[14,12],'all previous registered identities/artworks');
for(const entry of priorQ92.entries){
 const id=entry.name+'|'+entry.key,old=bindings.get(id);check(old&&!q92Bindings.has(id),'unique current successor '+id);equal(entry.previous,old.current,id+' exact previous metadata');
 const trial=fourTimesStandard.trials.find(t=>t.nativeKey===entry.key&&t.current.file===entry.previous.candidate);check(trial,id+' original alias accounted for');
 const transition=priorQ92.trials.find(t=>t.alias===trial.alias);check(transition,id+' exact historical alias transition');equal(transition.encodingReceipt,entry.encodingReceipt,id+' selected metadata identity');
 const current=validateQ92Entry(entry);q92Bindings.set(id,current);q92Trials.set(trial.alias,currentTrial(trial.alias,current));
}
equal(q92Trials.size,16,'all16historical aliases resolve to current official originals/maps');

export function registrationsAtFourTimes(historicalEntries){
 return historicalEntries.map(original=>{
  const migration=bindings.get(original.name+'|'+original.key);
  if(!migration){check(original.kind==='exact-original-reuse','generated identity has explicit migration '+original.name);return ownerQ92Registration(original);}
  equal(migration.previous.binding,original.binding??{file:original.file,normal:original.normal},original.name+' exact historical binding metadata');equal(migration.previous.diffuseSha256,original.diffuseSha256,original.name+' historical diffuse witness');equal(migration.previous.heightSha256,original.heightSha256,original.name+' historical height witness');
  const current=q92Bindings.get(original.name+'|'+original.key);check(current,original.name+' accepted official successor');
  return{...original,...(original.binding?{binding:current.binding}:{file:current.binding.file,normal:current.binding.normal}),diffuseSha256:current.diffuseSha256,heightSha256:current.heightSha256,candidate:current.binding.file,candidateSha256:current.diffuseSha256,normalChannelSha256:current.normalChannelSha256};
 });
}

export async function verifyFourTimesTrialDimensions(){
 if(!process.env.QUAKED_CANVAS_MODULE)throw Error('Set QUAKED_CANVAS_MODULE to actual canvas module.');const{createCanvas,Image}=await import(pathToFileURL(process.env.QUAKED_CANVAS_MODULE).href);
 const decode=async bytes=>{const image=new Image(),done=new Promise((ok,bad)=>{image.onload=ok;image.onerror=bad;});image.src=bytes;await done;const ctx=createCanvas(image.width,image.height).getContext('2d');ctx.drawImage(image,0,0);return{width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};};
 for(const old of fourTimesStandard.trials){
  const current=q92Trials.get(old.alias);check(current,old.alias+' current official comparison');equal(current.nativeKey,old.nativeKey,old.alias+' original identity retained');equal(sha256(read(current.original)),current.originalSha256,old.alias+' actual original PNG hash');
  const original=await decode(read(current.original)),native=new THREE.DataTexture(original.data,original.width,original.height);try{equal(R_GlassTextureKey(native),old.nativeKey,old.alias+' actual native pixel identity');}finally{native.dispose();}
  const dims=[original.width*4,original.height*4];equal(old.targetDimensions,dims,old.alias+'4x native target');
  for(const file of[current.file,current.height,...Object.values(current.normalChannels)]){check(file.startsWith('official/'),old.alias+' official-only picture/data');const image=await decode(textureBytes(file));equal([image.width,image.height],dims,old.alias+' actual decoded4x map '+file);}
 }
}

export async function verifyRegisteredNormalChannels( texture, recipe, decode ) {
	if ( ! recipe.normalChannels ) return;
	const channels = await Promise.all( [ 'x', 'y', 'z' ].map( axis => decode( recipe.normalChannels[ axis ] ) ) );
	const { width, height } = texture.image, normal = R_NormalMapFor( texture ), input = NormalInputs( texture );
	for ( const channel of channels ) equal( [ channel.width, channel.height ], [ width, height ], 'registered Q92 channel dimensions match actual material' );
	const expected = new Uint8Array( width * height * 4 );
	for ( let p = 0; p < width * height; p ++ ) expected.set( [ channels[ 0 ].data[ p * 4 ], channels[ 1 ].data[ p * 4 ], channels[ 2 ].data[ p * 4 ], Math.round( texture.userData.newerHeight.data[ p ] * 255 ) ], p * 4 );
	for ( const [ label, bytes ] of [ [ 'foreground', normal.image.data ], [ 'snapshot', input.authored ], [ 'prepared', NormalGenerate( input ).pixels ] ] ) check( bytes && Buffer.from( bytes ).equals( Buffer.from( expected ) ), 'actual Q92 XYZ/height decode reaches ' + label + ' normal data exactly' );
}
