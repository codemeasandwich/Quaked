/** AI background extension with immutable original artwork.
 * The original670x975panel is restored verbatim atx69 on808x975.
 * Harmonic offsets blend only the two69pxAI wings into that source boundary;
 * they retain donor gradients instead of copying noisy color offsets across rows.
 * Run from repository root: node tools/box_art/compose_abyss_extension.mjs
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const dir='assets/authoring/box_art/repairs-2026-10-20/aopfm_v2',width=808,height=975;
const original=await sharp('assets/authoring/box_art/import-2026-10-20/aopfm_v2/cover.png').extract({left:943,top:0,width:670,height}).removeAlpha().raw().toBuffer();
const out=await sharp(dir+'/front-outpaint-draft-v2.png').resize(width,height,{fit:'fill',kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
const solver=[];
for(const side of ['left','right']){
 const gridWidth=70,field=new Float64Array(gridWidth*height*3),edge=side==='left'?0:669,boundary=side==='left'?69:738;
 for(let y=0;y<height;y++)for(let c=0;c<3;c++){
  const delta=original[(y*670+edge)*3+c]-out[(y*width+boundary)*3+c];
  for(let x=0;x<gridWidth;x++)field[(y*gridWidth+x)*3+c]=delta*x/69;
 }
 let residual=Infinity,iterations=0;
 for(;iterations<600&&residual>.002;iterations++){
  residual=0;
  for(let y=0;y<height;y++)for(let x=1;x<69;x++)for(let c=0;c<3;c++){
   const at=(y*gridWidth+x)*3+c,up=((Math.max(0,y-1))*gridWidth+x)*3+c,down=((Math.min(height-1,y+1))*gridWidth+x)*3+c;
   const mean=(field[at-3]+field[at+3]+field[up]+field[down])*.25;
   const change=1.85*(mean-field[at]);field[at]+=change;residual=Math.max(residual,Math.abs(change));
  }
 }
 for(let y=0;y<height;y++)for(let x=0;x<69;x++)for(let c=0;c<3;c++){
  const column=side==='left'?x:807-x,at=(y*width+column)*3+c;
  out[at]=Math.max(0,Math.min(255,Math.round(out[at]+field[(y*gridWidth+x)*3+c])));
 }
 solver.push({side,iterations,residual});
}
for(let y=0;y<height;y++)original.copy(out,(y*width+69)*3,y*670*3,(y+1)*670*3);
await sharp(out,{raw:{width,height,channels:3}}).png().toFile(dir+'/front-expanded-master.png');
const restored=await sharp(dir+'/front-expanded-master.png').extract({left:69,top:0,width:670,height}).removeAlpha().raw().toBuffer();
if(!restored.equals(original))throw Error('Protected artwork changed');
await fs.writeFile('docs/evidence/box-art-repairs-2026-10-20/abyss-composition.json',JSON.stringify({master:dir+'/front-expanded-master.png',donor:dir+'/front-outpaint-draft-v2.png',dimensions:[width,height],protectedCenter:{left:69,top:0,width:670,height,pixelIdentity:true,rgbSha256:createHash('sha256').update(original).digest('hex')},wings:[69,69],method:'Harmonic donor-color offset in wings only, Dirichlet original-center edge/zero outer offset, Neumann top/bottom; original center restored exactly.',solver},null,2)+'\n');
