/** Widen only Abyss's background wings; restore the original center verbatim.
 * Built-in AI draft is a donor for two69pxwings, never a replacement for artwork/text.
 * Run from repository root: node tools/box_art/compose_abyss_extension.mjs
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const dir='assets/authoring/box_art/repairs-2026-10-20/aopfm_v2';
const {data:original}=await sharp('assets/authoring/box_art/import-2026-10-20/aopfm_v2/cover.png').extract({left:943,top:0,width:670,height:975}).removeAlpha().raw().toBuffer({resolveWithObject:true});
const {data:out}=await sharp(dir+'/front-outpaint-draft.png').resize(808,975,{fit:'fill',kernel:'lanczos3'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
const smooth=(values,y,c)=>{let sum=0,count=0;for(let row=Math.max(0,y-15);row<=Math.min(974,y+15);row++){sum+=values[row*3+c];count++;}return sum/count;};
for(const side of ['left','right']){
 const value=new Float64Array(975*3),gradient=new Float64Array(975*3);
 const boundary=side==='left'?68:739,away=side==='left'?67:740;
 const edge=side==='left'?0:669,inner=side==='left'?1:668;
 for(let y=0;y<975;y++)for(let c=0;c<3;c++){
  const e=original[(y*670+edge)*3+c],n=original[(y*670+inner)*3+c];
  value[y*3+c]=(2*e-n)-out[(y*808+boundary)*3+c];
  gradient[y*3+c]=(n-e)-(out[(y*808+boundary)*3+c]-out[(y*808+away)*3+c]);
 }
 for(let y=0;y<975;y++)for(let i=0;i<69;i++){
  const x=side==='left'?i:807-i,t=i/68,h01=3*t*t-2*t*t*t,h11=t*t*t-t*t;
  for(let c=0;c<3;c++){
   // Match low-frequency value and slope at the source join; zero correction and
   // slope at the outer edge. Vertical averaging retains natural grain instead
   // of propagating one noisy edge pixel across an entire row.
   const delta=smooth(value,y,c),slope=smooth(gradient,y,c);
   const at=(y*808+x)*3+c,correction=delta*h01+slope*68*h11;
   out[at]=Math.max(0,Math.min(255,Math.round(out[at]+correction)));
  }
 }
}
for(let y=0;y<975;y++)original.copy(out,(y*808+69)*3,y*670*3,(y+1)*670*3);
await sharp(out,{raw:{width:808,height:975,channels:3}}).png().toFile(dir+'/front-expanded-master.png');
const restored=await sharp(dir+'/front-expanded-master.png').extract({left:69,top:0,width:670,height:975}).removeAlpha().raw().toBuffer();
if(!restored.equals(original))throw Error('Protected artwork changed');
const boundaries=[];for(const [a,b]of [[68,69],[738,739]]){let max=0;for(let y=0;y<975;y++)for(let c=0;c<3;c++)max=Math.max(max,Math.abs(out[(y*808+a)*3+c]-out[(y*808+b)*3+c]));boundaries.push({columns:[a,b],maxRGBDifference:max});}
await fs.writeFile('docs/evidence/box-art-repairs-2026-10-20/abyss-composition.json',JSON.stringify({master:dir+'/front-expanded-master.png',dimensions:[808,975],protectedCenter:{left:69,top:0,width:670,height:975,pixelIdentity:true,rgbSha256:createHash('sha256').update(original).digest('hex')},wings:[69,69],method:'Only generated wings receive low-frequency C1 Hermite edge-value/gradient correction, zero correction and slope at outer edge;31-row vertical averaging; original center restored verbatim.',boundaries},null,2)+'\n');
