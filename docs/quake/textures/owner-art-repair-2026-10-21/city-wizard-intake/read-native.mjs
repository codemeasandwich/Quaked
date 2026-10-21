// Bounded source intake using the maintained positional PAK reader. Writes only this evidence folder.
import {readFile,writeFile,stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,relative} from 'node:path';
const out=dirname(fileURLToPath(import.meta.url)), root=resolve(out,'../../../../..');
const {pakDirectory,memberSearch,readMember,sha256}=await import(root+'/tools/pak_members.mjs');
const inventoryPath=root+'/docs/evidence/quake-textures-2026-10-20/legacy-baseline/inventory.json';
const locator=JSON.parse(await readFile(inventoryPath));
const runtimePath=root+'/src/newer/render/r_newertextures.js',runtime=await readFile(runtimePath,'utf8');
const start=runtime.indexOf('export function R_GlassTextureKey('),end=runtime.indexOf('\n}',start)+2;
const {R_GlassTextureKey}=await import('data:text/javascript,'+encodeURIComponent(runtime.slice(start,end)));
const indexPath=root+'/assets/game/textures/index.json',index=JSON.parse(await readFile(indexPath));
const names=['city5_3','wizmet1_3'],materials=[],packs=new Map();
async function packRecord(path){if(packs.has(path))return;const s=await stat(path),hash=createHash('sha256');for await(const b of createReadStream(path))hash.update(b);const directory=await pakDirectory(path);packs.set(path,{path,resolvedPath:await realpath(path),bytes:s.size,mtimeMs:s.mtimeMs,sha256:hash.digest('hex'),memberCount:directory.size});}
for(const name of names){
 const old=locator.variants.find(x=>x.name===name);if(!old)throw Error('Locator missing '+name);const uses=[];
 for(const use of old.uses){
  const mountOrder=locator.games[use.game].packs;for(const p of mountOrder)await packRecord(p);
  const members=await memberSearch(mountOrder),entry=members.get(use.map),paletteEntry=members.get('gfx/palette.lmp');
  if(entry.path!==use.pack)throw Error('Locator map provider changed');
  const bsp=await readMember(entry),palette=await readMember(paletteEntry);if(palette.length!==768)throw Error('Palette size');
  const version=bsp.readUInt32LE(0);if(![29,0x32505342,0x42535032].includes(version))throw Error('BSPversion');
  function lump(i){const off=bsp.readInt32LE(4+i*8),len=bsp.readInt32LE(8+i*8);if(off<0||len<0||off+len>bsp.length)throw Error('BSPbounds');return bsp.subarray(off,off+len);}
  const tex=lump(2),count=tex.readInt32LE(0),slot=use.slot;if(slot<0||slot>=count)throw Error('Slot');
  const at=tex.readInt32LE(4+slot*4);if(at<4+count*4||at+40>tex.length)throw Error('Mipheader');
  const actualName=tex.subarray(at,at+16).toString('ascii').split('\0')[0],w=tex.readUInt32LE(at+16),h=tex.readUInt32LE(at+20);
  if(actualName!==name||w!==64||h!==64)throw Error('Native identity/dimensions changed');
  const mips=[];let indexed;
  for(let level=0;level<4;level++){const off=tex.readUInt32LE(at+24+level*4),bytes=(w>>level)*(h>>level);if(off<40||at+off+bytes>tex.length)throw Error('Mipbounds');const p=tex.subarray(at+off,at+off+bytes);if(!level)indexed=p;mips.push({level,dimensions:[w>>level,h>>level],relativeOffset:off,bytes,indexedSha256:sha256(p)});}
  const rgba=Buffer.alloc(w*h*4);for(let i=0;i<indexed.length;i++){rgba.set(palette.subarray(indexed[i]*3,indexed[i]*3+3),i*4);rgba[i*4+3]=255;}
  const nativeKey=R_GlassTextureKey({image:{width:w,height:h,data:rgba}});
  if(nativeKey!==old.key||sha256(rgba)!==old.pixelSha256)throw Error('Actual native differs from locator');
  if(!index.sources[name]?.includes(nativeKey))throw Error('Current installed source guard differs');
  const ti=lump(6);if(ti.length%40)throw Error('Texinfo alignment');const texinfo=[];
  for(let i=0;i<ti.length/40;i++)if(ti.readInt32LE(i*40+32)===slot)texinfo.push({index:i,flags:ti.readInt32LE(i*40+36),vectorsSha256:sha256(ti.subarray(i*40,i*40+32))});
  const flags=[...new Set(texinfo.map(x=>x.flags))].sort((a,b)=>a-b);
  const identity={name,dimensions:[w,h],nativeKey,paletteSha256:sha256(palette),rgbaSha256:sha256(rgba),mipIndexedSha256:mips.map(x=>x.indexedSha256),materialFlags:flags};
  if(uses.length&&JSON.stringify(identity)!==JSON.stringify(uses[0].identity))throw Error('Selected same-key occurrences differ in allmip/flags identity');
  if(!uses.length)await writeFile(out+'/'+name+'-native.rgba',rgba);
  uses.push({game:use.game,map:use.map,slot,scope:use.scope,version,mountOrder,mapMember:entry,paletteMember:paletteEntry,bspSha256:sha256(bsp),identity,mips,texinfo});
 }
 materials.push({name,uses,currentBinding:{nativeKeys:index.sources[name],diffuse:index.textures[name],height:index.normals[name]}});
}
for(const p of packs.values()){const s=await stat(p.path);if(s.size!==p.bytes||s.mtimeMs!==p.mtimeMs)throw Error('PAKchanged');}
const report={observedAt:new Date().toISOString(),scope:'Fresh actual selected 11 BSP occurrences, palette/nativeRGBA/allfourmips/materialflags; inventory used only as locator. No wholecampaign or fullalias acceptance.',locator:{file:relative(root,inventoryPath),sha256:sha256(await readFile(inventoryPath))},readers:[{file:'tools/pak_members.mjs',sha256:sha256(await readFile(root+'/tools/pak_members.mjs'))},{file:relative(root,runtimePath),sha256:sha256(await readFile(runtimePath)),function:'Exact extracted R_GlassTextureKey'}],currentIndex:{file:relative(root,indexPath),sha256:sha256(await readFile(indexPath))},packs:[...packs.values()],materials};
await writeFile(out+'/native-provenance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({materials:materials.map(x=>({name:x.name,uses:x.uses.length,identity:x.uses[0].identity})),packs:packs.size}));
