// Read-only official BSP texture inventory. Reuses bounded PAK reads and the
// renderer's actual palette conversion / native-pixel identity. No pack edits.
// QUAKED_THREE_MODULE=/path/three.module.js node tools/audit_official_textures.mjs [output-directory] --game-root /path/to/owned/games
import {assetPath} from './distribution/manifest.mjs';
import {fileURLToPath as resourceFileURLToPath} from 'node:url';
const resourcePath = path => assetPath(resourceFileURLToPath(new URL('../', import.meta.url)), path);
import {register} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {memberSearch,readMember,sha256} from './pak_members.mjs';
const root=resolve(import.meta.dirname,'..');
let outputArgument=null,gameRoot=process.env.QUAKED_GAME_ROOT?resolve(process.env.QUAKED_GAME_ROOT):null;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++){
 if(args[i]==='--game-root'){if(!args[i+1])throw Error('--game-root needs a path');gameRoot=resolve(args[++i]);}
 else if(!outputArgument&&!args[i].startsWith('-'))outputArgument=args[i];
 else throw Error('Unknown argument '+args[i]);
}
const out=resolve(outputArgument||root+'/docs/evidence/official-textures-2026-10-12');
if(!process.env.QUAKED_THREE_MODULE)throw Error('Set QUAKED_THREE_MODULE');
register('data:text/javascript,'+encodeURIComponent("let three;export function initialize(d){three=d;}export function resolve(s,c,n){return s==='three'?{url:three,shortCircuit:true}:n(s,c);}"),{data:pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE)).href});
const {GL_LoadTexture}=await import('../src/engine/render/gl_model_common.js');
const {VID_SetPalette,vid}=await import('../src/engine/render/vid.js');
const {R_GlassTextureKey}=await import('../src/newer/render/r_newertextures.js');
const {GAME_CATALOGUE_GAMES}=await import('../src/engine/common/game_catalogue.js');
const ownedPack=game=>{
 const id=game==='id1'?'quake':game;
 if(!gameRoot)return root+'/resources/'+game+'/pak0.pak';
 const folder=GAME_CATALOGUE_GAMES.find(g=>g.id===id)?.folders.find(f=>f.startsWith('games/'));
 if(!folder)throw Error('No canonical game folder for '+game);
 return resolve(gameRoot,folder.slice(6),'pak0.pak');
};
const displayPath=path=>path.startsWith(root+'/')?path.slice(root.length+1):path;
await import('../src/newer/install.js');
const indexBytes=await readFile(resourcePath(root+'/newer/textures/index.json')),index=JSON.parse(indexBytes);
await mkdir(resourcePath(out+'/originals'),{recursive:true});
const variants=new Map(),games={},errors=[];
function mapScope(game,map){
 if(/^maps\/b_[^/]+\.bsp$/.test(map))return 'brush-asset';
 if(map.includes('/test/'))return 'installed-test';
 if(game==='id1'&&!/^maps\/(start|end|e[1-4]m[1-8]|dm[1-6])\.bsp$/.test(map))return 'installed-extra-review';
 return 'campaign-or-multiplayer';
}
// BSP face -> texinfo -> miptex, with entity-owned hidden trigger submodels
// separated. Counts are static visibility candidates, not PVS/occlusion proof.
function faceUses(b,version){
 const lump=i=>{const at=b.readInt32LE(4+i*8),len=b.readInt32LE(8+i*8);if(at<0||len<0||at+len>b.length)throw Error('Invalid BSP lump '+i);return b.subarray(at,at+len);};
 const entities=lump(0).toString('latin1'),ti=lump(6),faces=lump(7),models=lump(14),wide=version!==29,stride=wide?28:20;
 if(ti.length%40||faces.length%stride||models.length%64)throw Error('Misaligned BSP face/texinfo/model lump');
 const hidden=new Set();
 for(const block of entities.matchAll(/\{([^}]*)\}/g)){
  const fields=Object.fromEntries([...block[1].matchAll(/"([^"]*)"\s*"([^"]*)"/g)].map(m=>[m[1],m[2]]));
  if(/^trigger_/.test(fields.classname||'')&&/^\*\d+$/.test(fields.model||'')){
   const at=Number(fields.model.slice(1))*64;if(at+64>models.length)throw Error('Invalid trigger model');
   const first=models.readInt32LE(at+56),count=models.readInt32LE(at+60);
   for(let f=first;f<first+count;f++)hidden.add(f);
  }
 }
 const uses=new Map();
 for(let at=0;at<faces.length;at+=stride){
  const texinfo=wide?faces.readInt32LE(at+16):faces.readUInt16LE(at+10);
  if(texinfo<0||texinfo*40+40>ti.length)throw Error('Invalid face texinfo');
  const slot=ti.readInt32LE(texinfo*40+32),u=uses.get(slot)||{faces:0,visibleCandidateFaces:0,hiddenTriggerFaces:0};
  u.faces++;if(hidden.has(at/stride))u.hiddenTriggerFaces++;else u.visibleCandidateFaces++;uses.set(slot,u);
 }
 return uses;
}
// main.js mounts the owned full pack first, then the bundled native pack:
// shared bundled map/program/palette identities deliberately retain priority.
const base=[ownedPack('id1'),gameRoot?resolve(gameRoot,'shareware/pak0.pak'):root+'/games/shareware/pak0.pak'];
for(const game of ['id1','hipnotic','rogue','dopa','mg1']){
 const paths=game==='id1'?base:[...base,ownedPack(game)];
 const members=await memberSearch(paths),palette=await readMember(members.get('gfx/palette.lmp'));
 VID_SetPalette(palette);vid.fullbright=224;
 // Count each game's own BSPs, not inherited base maps a second time. Base includes
 // registered BSPs overlaid by the bundled native pack, exactly as main.js.
 const maps=[...members].filter(([n,e])=>n.endsWith('.bsp')&&(game==='id1'||e.path===paths.at(-1)));
 const ids=new Set();
 for(const [map,entry] of maps){
  try{
   const b=await readMember(entry),version=b.readInt32LE(0);
   if(![29,0x32505342,0x42535032].includes(version))throw Error('Unsupported BSP version '+version);
   const off=b.readInt32LE(20),len=b.readInt32LE(24);
   if(off<124||len<4||off+len>b.length)throw Error('Invalid texture lump');
   const count=b.readInt32LE(off);if(count<0||count>4096||4+count*4>len)throw Error('Invalid texture count');
   const faceUsage=faceUses(b,version),scope=mapScope(game,map),animationUses=new Map();
   // The BSP binds a face to one frame, then anim_next / alternate_anims can
   // reach the remaining members of the same suffix in this BSP. Zero direct
   // faces does not mean an animation frame is unused.
   for(let i=0;i<count;i++){
    const pos=b.readInt32LE(off+4+i*4);if(pos===-1)continue;
    if(pos<4+count*4||pos+40>len)throw Error('Invalid miptex header');
    const name=b.subarray(off+pos,off+pos+16).toString('latin1').split('\0')[0];
    if(/^\+[0-9a-jA-J]/.test(name)){
     const family=name.slice(2),u=animationUses.get(family)||{faces:0,visibleCandidateFaces:0,hiddenTriggerFaces:0};
     for(const k of Object.keys(u))u[k]+=faceUsage.get(i)?.[k]||0;animationUses.set(family,u);
    }
   }
   for(let i=0;i<count;i++){
    const pos=b.readInt32LE(off+4+i*4);if(pos===-1)continue;
    if(pos<4+count*4||pos+40>len)throw Error('Invalid miptex header');
    const at=off+pos,name=b.subarray(at,at+16).toString('latin1').split('\0')[0];
    const width=b.readUInt32LE(at+16),height=b.readUInt32LE(at+20),mip=b.readUInt32LE(at+24);
    if(!mip){errors.push({game,map,name,error:'External/missing pixel payload'});continue;}
    if(!width||!height||width*height>16777216||pos+mip+width*height>len)throw Error('Invalid miptex pixels');
    const raw=b.subarray(at+mip,at+mip+width*height);
    const t=GL_LoadTexture(name,width,height,raw,true,false,true),key=R_GlassTextureKey(t),id=name+'|'+key;
    ids.add(id);
    let v=variants.get(id);
    if(!v){
     const rgba=t.image.data.slice(),fb=t._fullbright?.image.data;
     if(fb)for(let p=0;p<rgba.length;p+=4)if(fb[p+3])rgba.set(fb.subarray(p,p+3),p);
     const pixelSha256=sha256(rgba),stem=key.replace(':','-');
     let status='missing',file=null,reason='No replacement entry';
     const glass=index.glass?.[name],variant=glass?.[key],ordinary=index.ordinaryVariants?.[name]?.[key];
     if(name.startsWith('sky')){status='special-sky';reason='Two-layer sky renderer; ordinary replacement hook bypassed';}
     else if(name.startsWith('*')){status='special-liquid';reason='Turbulent/liquid renderer; ordinary replacement hook bypassed';}
     else if(glass){if(variant){status='catalogued';file=variant.file;reason='Exact glass identity';}else reason='Glass name exists but native identity is missing';}
     else if(ordinary){if(typeof ordinary.file==='string'&&ordinary.file){status='catalogued';file=ordinary.file;reason='Exact ordinary material variant';}else reason='Malformed ordinary variant';}
     else if(index.textures[name]){if(!index.sources?.[name]||index.sources[name].includes(key)){status='catalogued';file=index.textures[name];reason=index.sources?.[name]?'Exact native identity':'Legacy name-only binding';}else reason='Same name has different original pixels';}
     if(file){try{await readFile(resourcePath(root+'/newer/textures/'+file));}catch{status='missing-file';reason='Catalogue target is unavailable';}}
     const original='originals/'+stem+'.rgba';await writeFile(resourcePath(out+'/'+original),rgba);
     v={id,name,key,width,height,pixelSha256,original,status,file,reason,uses:[]};variants.set(id,v);
    }
    const direct=faceUsage.get(i)||{faces:0,visibleCandidateFaces:0,hiddenTriggerFaces:0};
    v.uses.push({game,map,scope,pack:displayPath(entry.path),slot:i,...direct,animationVisibleCandidateFaces:/^\+[0-9a-jA-J]/.test(name)?animationUses.get(name.slice(2))?.visibleCandidateFaces||0:0});
    t._fullbright?.dispose();t.dispose();
   }
  }catch(e){errors.push({game,map,error:String(e.message||e)});}
 }
 const counts={};for(const id of ids){const s=variants.get(id).status;counts[s]=(counts[s]||0)+1;}
 games[game]={packs:paths.map(displayPath),bspCount:maps.length,identities:ids.size,counts};
}
const rows=[...variants.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.key.localeCompare(b.key));
const counts={},actions={};for(const v of rows){
 counts[v.status]=(counts[v.status]||0)+1;
 const eligible=v.uses.filter(u=>['brush-asset','campaign-or-multiplayer'].includes(u.scope)&&(u.visibleCandidateFaces>0||u.animationVisibleCandidateFaces>0));
 v.action=/^(clip|trigger|skip|hint)$/i.test(v.name)?'compiler-utility':!eligible.length?'unused-or-extra-review':v.status.startsWith('special-')?v.status:v.status==='catalogued'?'check-hd-dimensions':v.name.toLowerCase()==='black'?'preserve-flat-black':'generate';
 actions[v.action]=(actions[v.action]||0)+1;
}
const report={schemaVersion:3,gameRoot,scope:'Installed official-game BSP directory inventory; actions distinguish stock base campaign/dm1-6/brush assets from installed extras requiring provenance review, unused miptexes and invisible triggers. Expansion own BSPs use base palette/search inheritance; explicit game-root uses the engine catalogue canonical folders. Enemy MDL skins tracked separately.',indexSha256:sha256(indexBytes),games,counts,actions,errors,variants:rows};
await writeFile(resourcePath(out+'/inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games,counts,actions,errors,output:out+'/inventory.json'},null,2));
if(errors.length)process.exitCode=1;
