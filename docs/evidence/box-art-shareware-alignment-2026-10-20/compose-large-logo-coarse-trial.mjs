/** Owner-requested Shareware wrap alignment. Generated pixels are background only.
 * Restore original proportionally scaled panels/printed strips over a retained donor.
 * Run from repository root: node tools/box_art/align_shareware.mjs
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir='assets/authoring/box_art/shareware-alignment-2026-10-20/';
const evidence='docs/evidence/box-art-shareware-alignment-2026-10-20/';
const donor=dir+'wrap-extension-donor-v2.png';
const spineDonor=dir+'spine-detail-donor.png';
const sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=JSON.parse(await fs.readFile(evidence+'baseline-faces.json'));
const donorBytes=await fs.readFile(donor);
const donorRGB=await sharp(donorBytes).resize(3620,2000,{fit:'fill',kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
const spineBytes=await fs.readFile(spineDonor);
const spineRGB=await sharp(spineBytes).resize(1020,2000,{fit:'fill',kernel:'lanczos3'}).extract({left:340,top:0,width:340,height:2000}).removeAlpha().raw().toBuffer();
const smooth=d=>{const t=Math.max(0,Math.min(1,d/11));return t*t*(3-2*t);};
const receipt={version:1,ownerAuthority:'Align Shareware faces; move original id logo up and small print/floppy down; preserve sizes and proportions.',donor,donorSha256:sha(donorBytes),prompt:evidence+'outpaint-prompt-v2.json',featherPixels:12,faces:[]};
receipt.spineDonor={path:spineDonor,sha256:sha(spineBytes),prompt:evidence+'outpaint-prompt-detail.json',sourceCanvas:[1020,2000],crop:{left:340,top:0,width:340,height:2000}};
const masters=[];
for(const row of baseline){
 const spine=row.face==='spine',width=spine?340:1640,height=2000,left=row.face==='back'?0:spine?1640:1980;
 const content=row.content;
 const sourceBytes=await fs.readFile(row.source);assert.equal(sha(sourceBytes),row.sourceSha256);
 const source=await sharp(sourceBytes).extract(row.crop).resize(content.width,content.height,{kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
 const image=spine?Buffer.from(spineRGB):await sharp(donorRGB,{raw:{width:3620,height:2000,channels:3}}).extract({left,top:0,width,height}).raw().toBuffer();
 const pieces=spine?[{sourceTop:0,height:170,top:0},{sourceTop:170,height:855,top:484},{sourceTop:1025,height:514,top:1439}]:[{sourceTop:0,height:2000,top:0}];
 const proofs=[];
 for(const p of pieces){
  const x=spine?0:content.left;
  for(let y=0;y<p.height;y++)for(let sx=0;sx<content.width;sx++){
   // Only inspected texture strips at joins blend. Printed interiors are exact.
   const weight=spine?Math.min(p.top===0?1:smooth(y),smooth(p.height-1-y)):Math.min(smooth(sx),smooth(content.width-1-sx));
   const from=((p.sourceTop+y)*content.width+sx)*3,to=((p.top+y)*width+x+sx)*3;
   for(let c=0;c<3;c++)image[to+c]=Math.round(weight*source[from+c]+(1-weight)*image[to+c]);
  }
  const cut=spine?{left:0,top:p.sourceTop+(p.top===0?0:12),width:340,height:p.height-12-(p.top===0?0:12)}:{left:12,top:0,width:content.width-24,height:2000};
  const target={...cut,left:x+cut.left,top:p.top+cut.top-p.sourceTop};
  if(spine&&p.sourceTop===0)continue; // Owner superseded the small logo with the transform below.
  const original=await sharp(source,{raw:{width:content.width,height:content.height,channels:3}}).extract(cut).raw().toBuffer();
  const protectedRGB=await sharp(image,{raw:{width,height,channels:3}}).extract(target).raw().toBuffer();
  assert.ok(original.equals(protectedRGB),row.face+' original printed pixels');
  proofs.push({sourceScaled:cut,destination:target,rgbSha256:sha(original),pixelIdentical:true});
 }
 if(spine){
  const sourceCrop={left:382,top:54,width:126,height:140},destination={left:44,top:16,width:252,height:280};
  const logo=await sharp(sourceBytes).extract(sourceCrop).resize(destination.width,destination.height,{kernel:'lanczos3'}).removeAlpha().raw().toBuffer();
  for(let y=0;y<destination.height;y++)for(let x=0;x<destination.width;x++){
   const weight=Math.min(smooth(x),smooth(destination.width-1-x),smooth(y),smooth(destination.height-1-y));
   const from=(y*destination.width+x)*3,to=((destination.top+y)*width+destination.left+x)*3;
   for(let c=0;c<3;c++)image[to+c]=Math.round(weight*logo[from+c]+(1-weight)*image[to+c]);
  }
  const cut={left:12,top:12,width:228,height:256},target={...cut,left:56,top:28};
  const original=await sharp(logo,{raw:{width:252,height:280,channels:3}}).extract(cut).raw().toBuffer();
  const actual=await sharp(image,{raw:{width,height,channels:3}}).extract(target).raw().toBuffer();
  assert.ok(original.equals(actual),'enlarged original id logo');
  receipt.logoTransform={source:row.source,sourceSha256:row.sourceSha256,sourceCrop,destination,scale:2,featherPixels:12,protectedOriginal:{sourceScaled:cut,destination:target,rgbSha256:sha(original),pixelIdentical:true},authority:'Owner requested substantially larger id logo; original native crop enlarged proportionally, never regenerated.'};
 }
 const master=dir+row.face+'-master.png',png=await sharp(image,{raw:{width,height,channels:3}}).png().toBuffer();
 await fs.writeFile(master,png);masters.push({input:png,left,top:0});
 receipt.faces.push({face:row.face,master,masterSha256:sha(png),dimensions:[width,height],source:row.source,sourceSha256:row.sourceSha256,sourceCrop:row.crop,sourceScaledDimensions:[content.width,content.height],pieces,protectedOriginals:proofs,content:{left:0,top:0,width,height}});
}
receipt.wrap=dir+'aligned-wrap-master.png';
await sharp({create:{width:3620,height:2000,channels:3,background:'#15110c'}}).composite(masters).png().toFile(receipt.wrap);
receipt.wrapSha256=sha(await fs.readFile(receipt.wrap));
await fs.writeFile(evidence+'composition.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({masters:receipt.faces.map(x=>x.master),protectedGroups:receipt.faces.reduce((n,x)=>n+x.protectedOriginals.length,0)+(receipt.logoTransform?1:0)}));
