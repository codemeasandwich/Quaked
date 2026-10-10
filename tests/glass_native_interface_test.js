import {fileURLToPath} from 'node:url';
import * as THREE from 'three';
import {openSync,readSync,closeSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {COM_LoadPackFile,COM_AddPack} from '../src/engine/common/pak.js';
import {Mod_Init,Mod_ClearAll,Mod_ForName} from '../src/engine/render/gl_model.js';
import {VID_SetPalette,vid} from '../src/engine/render/vid.js';
import {R_GlassTextureKey} from '../src/newer/render/r_newertextures.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import {r_hdr} from '../src/newer/render/gl_post.js';
const root=fileURLToPath(new URL('../',import.meta.url)),inventory=JSON.parse(readFileSync(new URL('../newer/textures/glass/provenance.json',import.meta.url))),manifest=JSON.parse(readFileSync(root+'newer/textures/index.json'));
for(const [game,campaign]of Object.entries(inventory.campaigns))campaign.packs=campaign.packs.map(p=>root+'resources/'+game+'/'+p.split('/').pop());
const check=(v,m)=>{if(!v)throw Error(m)},digest=b=>createHash('sha256').update(b).digest('hex');
function range(path,start,length){const fd=openSync(path,'r');try{const b=Buffer.alloc(length);let count=0;while(count<length){const got=readSync(fd,b,count,length-count,start+count);check(got>0,'short pack range');count+=got}return b}finally{closeSync(fd)}}
const directories=new Map();function directory(path){if(directories.has(path))return directories.get(path);const h=range(path,0,12);check(h.toString('ascii',0,4)==='PACK','PACK header');const d=range(path,h.readInt32LE(4),h.readInt32LE(8)),entries=new Map();for(let i=0;i<d.length;i+=64)entries.set(d.toString('latin1',i,i+56).split('\0')[0],{path,start:d.readInt32LE(i+56),length:d.readInt32LE(i+60)});directories.set(path,entries);return entries}
function sourceEntry(paths,name){let found;for(const path of paths)if(directory(path).has(name))found=directory(path).get(name);return found}
const bytes=e=>range(e.path,e.start,e.length),basePalette=sourceEntry(inventory.campaigns.id1.packs,'gfx/palette.lmp');
function carrier(files){let offset=12;const dir=Buffer.alloc(files.length*64),parts=[];files.forEach(([name,data],i)=>{dir.write(name,i*64,56,'latin1');dir.writeInt32LE(offset,i*64+56);dir.writeInt32LE(data.length,i*64+60);offset+=data.length;parts.push(data)});const header=Buffer.alloc(12);header.write('PACK');header.writeInt32LE(offset,4);header.writeInt32LE(dir.length,8);return Buffer.concat([header,...parts,dir])}
function rawTextures(b){const base=b.readInt32LE(20),count=b.readInt32LE(base),out=[];for(let i=0;i<count;i++){const off=b.readInt32LE(base+4+i*4);if(off<0)continue;const p=base+off,name=b.toString('latin1',p,p+16).split('\0')[0],w=b.readInt32LE(p+16),h=b.readInt32LE(p+20),pixels=b.subarray(p+b.readInt32LE(p+24),p+b.readInt32LE(p+24)+w*h);out.push({name,w,h,pixels})}return out}
function independentKey(t,pal){let h1=2166136261,h2=3339675911;for(const index of t.pixels)for(let channel=0;channel<4;channel++){const byte=channel===3?255:index===255?0:pal[index*3+channel];h1=Math.imul(h1^byte,16777619)>>>0;h2=Math.imul(h2^byte,2246822519)>>>0}return `${t.w}x${t.h}:${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}`}

// Explicit source-only carrier: it validates raw source palette identity, not
// native model acceptance, renderability or a BSP2 loader implementation.
function rawPaletteTexture(t,pal){const rgba=new Uint8Array(t.w*t.h*4),fb=new Uint8Array(rgba.length);let hasFullbright=false;for(let i=0;i<t.pixels.length;i++){const index=t.pixels[i],j=i*4,color=index===255?[0,0,0]:[pal[index*3],pal[index*3+1],pal[index*3+2]];rgba.set([...color,255],j);if(index>=224){hasFullbright=true;fb.set([...color,255],j);rgba[j]=rgba[j+1]=rgba[j+2]=0}}const texture=new THREE.DataTexture(rgba,t.w,t.h);if(hasFullbright)texture._fullbright=new THREE.DataTexture(fb,t.w,t.h);return texture}

Deno.test('glass source identities cover ten campaigns with explicit native BSP format capability boundaries',()=>{
 const controls=[r_hdr,anim.r_newer_textures];for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);const saved=controls.map(c=>c.string),oldFullbright=vid.fullbright,receipt=[];
 try{controls.forEach(c=>vars.Cvar_SetValue(c.name,0));anim.R_AnimSetClassicPass(false);vid.fullbright=224;Mod_Init();
 for(const [game,campaign]of Object.entries(inventory.campaigns)){
  const candidates=new Map();for(const variant of inventory.variants)for(const use of variant.uses)if(use.game===game&&manifest.glass[variant.name])candidates.set(use.map,(candidates.get(use.map)||0)+1);
  const supported=[...candidates].filter(([name])=>{const e=sourceEntry(campaign.packs,name),header=range(e.path,e.start,124);return header.readInt32LE(120)/64<450});const chosen=supported.sort((a,b)=>b[1]-a[1])[0];check(chosen,'actual glass-bearing source map within existing inline-model bound for '+game);const mapName=chosen[0],mapEntry=sourceEntry(campaign.packs,mapName),palEntry=sourceEntry(campaign.packs,'gfx/palette.lmp')||basePalette,map=bytes(mapEntry),palette=bytes(palEntry);
  const pack=carrier([[mapName,map],['gfx/palette.lmp',palette]]);COM_AddPack(COM_LoadPackFile('native-glass-'+game,pack.buffer.slice(pack.byteOffset,pack.byteOffset+pack.length)));VID_SetPalette(palette);Mod_ClearAll();const version=map.readInt32LE(0),selected=[];check([29,0x32505342,0x42535032].includes(version),'recognized source BSP format '+game);let model=null,nativeError=null;
  try{model=Mod_ForName(mapName,true)}catch(error){
   const exact='Mod_LoadBrushModel: '+mapName+' has wrong version number ('+version+' should be 29)';
   check(version!==29&&[0x32505342,0x42535032].includes(version),'BSP29 native loader failure remains mandatory '+game);
   check(error instanceof Error&&error.message===exact,'only exact unsupported BSP2 format rejection can be source-only '+game+': '+error.message);nativeError=error.message;
  }
  for(const t of rawTextures(map))if(manifest.glass[t.name]){const actual=model?model.textures.find(x=>x?.name===t.name):{gl_texture:rawPaletteTexture(t,palette)};check(actual?.gl_texture,(model?'actual BSP public loader creates ':'raw BSP source texture carrier creates ')+game+':'+t.name);const key=R_GlassTextureKey(actual.gl_texture),expected=independentKey(t,palette);check(key===expected,'actual native palette/fullbright reconstruction matches raw BSP independently '+game+':'+t.name);const entry=manifest.glass[t.name][key];check(entry,'actual source material selects catalog '+game+':'+t.name+':'+key);check(!actual.gl_texture.userData.newerPicture,'source trial cannot enable texture upgrades');selected.push({name:t.name,key,fullbright:!!actual.gl_texture._fullbright,file:entry.file,identityPath:model?'native Mod_ForName':'independent raw BSP palette + public R_GlassTextureKey'});if(!model){actual.gl_texture._fullbright?.dispose();actual.gl_texture.dispose()}}
  check(selected.length,'native source trial checked glass '+game);receipt.push({game,map:mapName,bspVersion:version,nativeLoaderAccepted:!!model,nativeLoaderError:nativeError,sourceIdentityVerified:true,source:mapEntry,paletteSource:palEntry,mapSHA256:digest(map),paletteSHA256:digest(palette),carrierBytes:pack.length,selected});
 }
 check(receipt.length===10,'all ten campaigns tested');writeFileSync(process.env.QUAKED_GLASS_NATIVE_RECEIPT || '/private/tmp/quaked-glass-native-interface.json',JSON.stringify({checked:'mandatory native BSP29 acceptance; exact unsupported BSP2 rejection; every source texture identity verified against actual palette and catalog',nativeAcceptedCampaigns:receipt.filter(c=>c.nativeLoaderAccepted).length,unsupportedNativeCampaigns:receipt.filter(c=>!c.nativeLoaderAccepted).length,sourceVerifiedCampaigns:receipt.length,campaigns:receipt,totalMaterials:receipt.reduce((n,c)=>n+c.selected.length,0)},null,2));console.log('NATIVE_GLASS_INTERFACE '+JSON.stringify(receipt.map(x=>({game:x.game,map:x.map,bspVersion:x.bspVersion,nativeAccepted:x.nativeLoaderAccepted,sourceVerified:x.sourceIdentityVerified,materials:x.selected.length,fullbright:x.selected.filter(t=>t.fullbright).length}))));
 }finally{Mod_ClearAll();vid.fullbright=oldFullbright;controls.forEach((c,i)=>vars.Cvar_Set(c.name,saved[i]));}
});
