import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {WebOptimise,DATA_MAP,BESTIARY_MAX_BYTES} from '../tools/distribution/web_images.mjs';
// A 1024x1536 page with smooth gradients and fine lines, like the Bestiary's paintings.
async function page(){
 const width=1024,height=1536,raw=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*3;raw[i]=(x*255/width)|0;raw[i+1]=(y*255/height)|0;raw[i+2]=((x^y)&8)?200:40;}
 return sharp(raw,{raw:{width,height,channels:3}}).png({compressionLevel:0}).toBuffer();
}
test('only Bestiary pictures are re-encoded; data maps and other assets keep their bytes',async()=>{
 for(const path of ['newer/bestiary/folio/wrath.reveal.png','newer/textures/glass/x-height.png','newer/textures/glass/x-normal.png','newer/textures/glass/x-gloss.png','newer/textures/glass/x-native.png'])assert.ok(DATA_MAP.test(path),path);
 for(const path of ['newer/bestiary/cover.png','newer/bestiary/folio/wrath.paper.webp','newer/bestiary/headers/wrath.png'])assert.ok(!DATA_MAP.test(path),path);
 const bytes=await page();
 assert.equal(await WebOptimise('newer/textures/adoor01_2.png',bytes),null,'not a Bestiary asset');
 assert.equal(await WebOptimise('newer/bestiary/folio/wrath.reveal.png',Buffer.alloc(1000)),null,'a data map that fits is shipped as is');
 await assert.rejects(WebOptimise('newer/bestiary/folio/wrath.reveal.png',Buffer.alloc(BESTIARY_MAX_BYTES+1)),/data map/);
});
test('a Bestiary page becomes WebP at its own size, under the limit, at the highest quality that fits, and is cached',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'quaked-web-images-'));
 try{
  const bytes=await page();assert.ok(bytes.length>BESTIARY_MAX_BYTES,'fixture starts over the limit');
  const first=await WebOptimise('newer/bestiary/cover.png',bytes,dir);
  assert.equal(first.mime,'image/webp');assert.ok(first.bytes.length<=BESTIARY_MAX_BYTES,'within 700,000 bytes');
  const meta=await sharp(first.bytes).metadata();assert.deepEqual([meta.format,meta.width,meta.height],['webp',1024,1536],'pixels unchanged');
  assert.ok(first.quality<=92&&first.quality>=70);
  assert.equal((await readdir(dir)).length,2,'encoded once into the cache');
  const again=await WebOptimise('newer/bestiary/cover.png',bytes,dir);
  assert.ok(again.bytes.equals(first.bytes)&&again.quality===first.quality,'cache returns the same bytes');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a page that cannot fit without resizing stops the build for an owner decision',async()=>{
 const width=1024,height=1536,noise=Buffer.alloc(width*height*3);for(let i=0;i<noise.length;i++)noise[i]=(Math.imul(i,2654435761)>>>13)&255;
 const bytes=await sharp(noise,{raw:{width,height,channels:3}}).png().toBuffer();
 await assert.rejects(WebOptimise('newer/bestiary/noise.png',bytes),/owner decision/);
});
