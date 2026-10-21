import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const sharp=createRequire('/Users/bri/SOURCE/Quaked/package.json')('sharp');
import {createHash} from 'node:crypto';
const root='/Users/bri/SOURCE/Quaked/';process.chdir(root);
const dir='assets/authoring/box_art/shareware-alignment-2026-10-20/';
const recipe=JSON.parse(await fs.readFile('docs/evidence/box-art-standardization-2026-10-20/derivation.json'));
const manifest=await fs.readFile('assets/boxes/manifest.json');

const faces=recipe.faces.filter(x=>x.game==='shareware');

const pieces=[];for(const face of faces){const c=face.content;const input=await sharp(face.source).extract(face.crop).resize(c.width,c.height,{kernel:'lanczos3'}).png().toBuffer();if(face.face==='spine'){for(const [top,height,dest] of [[0,170,0],[170,855,484],[1025,514,1439]])pieces.push({input:await sharp(input).extract({left:0,top,width:340,height}).png().toBuffer(),left:1640,top:dest});}else pieces.push({input,left:(face.face==='back'?0:1980)+c.left,top:c.top});}
await sharp({create:{width:3620,height:2000,channels:3,background:'#ff00ff'}}).composite(pieces).png().toFile(dir+'wrap-extension-target-v2.png');
const plan={version:2,ownerRefinement:'Move original id logo up; all small print and floppy disk down without scaling.',spineSegments:[{sourceTop:0,height:170,destinationTop:0},{sourceTop:170,height:855,destinationTop:484},{sourceTop:1025,height:514,destinationTop:1439}],baseCommit:'98725bca4d5947f57d7f3c0097feee417a64ff3e',canvas:[3620,2000],panels:{back:{left:0,top:0,width:1640,height:2000},spine:{left:1640,top:0,width:340,height:2000},front:{left:1980,top:0,width:1640,height:2000}},priorWholePanelPlacement:{left:0,top:314,width:340,height:1539},materialBandRows:{front:943,back:931,oldSpine:853,alignedSpine:937},extensionOnly:'Magenta gaps; all original printed content restored after generation. Edge blend may use at most12background-only pixels; exact protected source interiors independently checked.',ownerFeedbackSha256:createHash('sha256').update(await fs.readFile(dir+'owner-feedback.png')).digest('hex')};
await fs.writeFile('docs/evidence/box-art-shareware-alignment-2026-10-20/layout-plan-v2.json',JSON.stringify(plan,null,2)+'\n');
