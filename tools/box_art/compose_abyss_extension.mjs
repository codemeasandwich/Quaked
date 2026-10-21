/** User-authorized Abyss background extension, preserving every meaningful element.
 * Only new69pxwings and reviewed12pxbackground-only edge strips use AI pixels.
 * All646x975 center pixels (original x955..1600) remain exact, without stretching.
 * Run from repository root: node tools/box_art/compose_abyss_extension.mjs
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
const dir='assets/authoring/box_art/repairs-2026-10-20/aopfm_v2';
const original=await sharp('assets/authoring/box_art/import-2026-10-20/aopfm_v2/cover.png').extract({left:943,top:0,width:670,height:975}).removeAlpha().raw().toBuffer();
const out=await sharp(dir+'/front-outpaint-draft-v2.png').resize(808,975,{fit:'fill',kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
for(let y=0;y<975;y++)for(let x=0;x<670;x++){
 const t=Math.min(1,(Math.min(x,669-x)+1)/13),alpha=t*t*(3-2*t);
 for(let c=0;c<3;c++){
  const at=(y*808+x+69)*3+c;
  out[at]=Math.round(original[(y*670+x)*3+c]*alpha+out[at]*(1-alpha));
 }
}
await sharp(out,{raw:{width:808,height:975,channels:3}}).png().toFile(dir+'/front-expanded-master.png');
const center=await sharp(dir+'/front-expanded-master.png').extract({left:81,top:0,width:646,height:975}).removeAlpha().raw().toBuffer();
const expected=await sharp('assets/authoring/box_art/import-2026-10-20/aopfm_v2/cover.png').extract({left:955,top:0,width:646,height:975}).removeAlpha().raw().toBuffer();
if(!center.equals(expected))throw Error('Protected original artwork changed');
await fs.writeFile('docs/evidence/box-art-repairs-2026-10-20/abyss-composition.json',JSON.stringify({master:dir+'/front-expanded-master.png',donor:dir+'/front-outpaint-draft-v2.png',dimensions:[808,975],protectedCenter:{left:81,top:0,width:646,height:975,sourceCrop:{left:955,top:0,width:646,height:975},pixelIdentity:true,rgbSha256:createHash('sha256').update(center).digest('hex')},newWings:[69,69],backgroundOnlyBlend:{left:[69,80],right:[727,738],widthEach:12,method:'smoothstep original weight; independently inspected strips contain only smoke/haze/fire, no meaningful text, mascot or logo pixels.'},removedScanFold:{left:940,width:3},authority:'Owner explicitly authorized AI side extension/regeneration to match back proportions.',failedStrictTrials:'Retained; strict whole-background rectangle restoration caused visible joins and color-matching trials caused streaks.'},null,2)+'\n');
