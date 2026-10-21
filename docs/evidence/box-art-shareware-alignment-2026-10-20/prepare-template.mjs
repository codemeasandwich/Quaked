import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const sharp=createRequire('/Users/bri/SOURCE/Quaked/package.json')('sharp');
import {createHash} from 'node:crypto';
const root='/Users/bri/SOURCE/Quaked/';process.chdir(root);
const dir='assets/authoring/box_art/shareware-alignment-2026-10-20/';
const recipe=JSON.parse(await fs.readFile('docs/evidence/box-art-standardization-2026-10-20/derivation.json'));
const manifest=await fs.readFile('assets/boxes/manifest.json');
await fs.writeFile('docs/evidence/box-art-shareware-alignment-2026-10-20/baseline-manifest.json',manifest);
const faces=recipe.faces.filter(x=>x.game==='shareware');
await fs.writeFile('docs/evidence/box-art-shareware-alignment-2026-10-20/baseline-faces.json',JSON.stringify(faces,null,2)+'\n');
const pieces=[];for(const face of faces){const c=face.content;const input=await sharp(face.source).extract(face.crop).resize(c.width,c.height,{kernel:'lanczos3'}).png().toBuffer();pieces.push({input,left:(face.face==='back'?0:face.face==='spine'?1640:1980)+c.left,top:face.face==='spine'?314:c.top});}
await sharp({create:{width:3620,height:2000,channels:3,background:'#ff00ff'}}).composite(pieces).png().toFile(dir+'wrap-extension-target.png');
const plan={version:1,baseCommit:'98725bca4d5947f57d7f3c0097feee417a64ff3e',canvas:[3620,2000],panels:{back:{left:0,top:0,width:1640,height:2000},spine:{left:1640,top:0,width:340,height:2000},front:{left:1980,top:0,width:1640,height:2000}},spineContent:{left:0,top:314,width:340,height:1539},materialBandRows:{front:943,back:931,oldSpine:853,alignedSpine:937},extensionOnly:'Magenta gaps; all original printed content restored after generation. Edge blend may use at most12background-only pixels; exact protected source interiors independently checked.',ownerFeedbackSha256:createHash('sha256').update(await fs.readFile(dir+'owner-feedback.png')).digest('hex')};
await fs.writeFile('docs/evidence/box-art-shareware-alignment-2026-10-20/layout-plan.json',JSON.stringify(plan,null,2)+'\n');
