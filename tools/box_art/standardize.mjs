/** Owner-authorized, deterministic box-face derivation. Original inputs are immutable.
 * Recipes name reviewed panel rectangles; this is never a heuristic wrap splitter.
 * Usage: node tools/box_art/standardize.mjs <recipe.json> [game:face,...]
 * The optional selection refreshes only named faces; other recorded identities are retained.
 * No game-library files are modified or removed by this tool.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const digest=b=>createHash('sha256').update(b).digest('hex');
export async function standardize(recipePath,selection=null){
 const recipe=JSON.parse(await fs.readFile(recipePath,'utf8'));
 const sources=new Map(recipe.sources.map(s=>[s.archivePath,s]));
 const seen=new Set();
 for(const row of recipe.faces){
  if(!/^[a-z0-9_]+$/.test(row.game)||!['front','back','spine'].includes(row.face)||row.path!==`assets/boxes/${row.game}/${row.face}.webp`||seen.has(row.path))throw Error('Invalid runtime destination '+row.path);
  seen.add(row.path);
 }
 for(const s of recipe.sources)if(!s.archivePath.startsWith('assets/authoring/box_art/')||s.archivePath.split('/').includes('..'))throw Error('Invalid authoring source '+s.archivePath);
 for(const s of recipe.sources){const b=await fs.readFile(s.archivePath);if(digest(b)!==s.sha256)throw Error('Changed original: '+s.archivePath);}
 const faces=[];
 for(const row of recipe.faces){
  if(selection&&!selection.has(row.game+':'+row.face)){faces.push(row);continue;}
  const source=sources.get(row.source);if(!source)throw Error('Unrecorded source: '+row.source);
  const [width,height]=recipe.standard[row.face];
  const crop=row.crop;
  if(!crop||crop.left<0||crop.top<0||crop.width<=0||crop.height<=0||crop.left+crop.width>source.width||crop.top+crop.height>source.height)throw Error('Invalid panel: '+row.path);
  const scale=Math.min(width/crop.width,height/crop.height);
  const cw=Math.round(crop.width*scale),ch=Math.round(crop.height*scale);
  const content={left:Math.floor((width-cw)/2),top:Math.floor((height-ch)/2),width:cw,height:ch};
  // Fit inside the standard canvas; never stretch lettering or crop a panel to its target ratio.
  const pixels=await sharp(row.source).extract(crop).resize(cw,ch,{kernel:'lanczos3'}).toBuffer();
  const b=await sharp({create:{width,height,channels:3,background:row.background??'#15110c'}}).composite([{input:pixels,left:content.left,top:content.top}]).webp({lossless:true,effort:6}).toBuffer();
  await fs.mkdir(path.dirname(row.path),{recursive:true});await fs.writeFile(row.path,b);
  faces.push({...row,sourceSha256:source.sha256,fit:'contain',content,width,height,sha256:digest(b),bytes:b.length});
 }
 recipe.faces=faces;await fs.writeFile(recipePath,JSON.stringify(recipe,null,2)+'\n');
 const manifest={version:2,method:'Reviewed panel crops; proportion-preserving fit on standard canvases; lossless WebP; immutable authoring originals',standard:recipe.standard,provenance:recipePath,faces:faces.map(({game,face,path,sha256,bytes,width,height})=>({game,face,path,sha256,bytes,width,height}))};
 await fs.writeFile('assets/boxes/manifest.json',JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({faces:faces.length,sourceImages:sources.size,standard:recipe.standard}));
}
if(process.argv[1]===new URL(import.meta.url).pathname)await standardize(process.argv[2],process.argv[3]?new Set(process.argv[3].split(',')):null);
