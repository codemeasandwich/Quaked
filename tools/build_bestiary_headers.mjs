// Build title-only author crops for locked folios. Source pages stay untouched;
// the runtime can request a heading without downloading hidden creature art.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {BESTIARY_ENTRIES} from '../src/bestiary_state.js';
import {Bestiary_HeaderHeight} from '../src/bestiary_art.js';
const {createCanvas,loadImage}=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
const root=new URL('../newer/bestiary/',import.meta.url),out=new URL('headers/',root);await mkdir(out,{recursive:true});
const files={};
for(const entry of BESTIARY_ENTRIES){
 const source=await readFile(new URL(entry.image,root)),image=await loadImage(source),height=Bestiary_HeaderHeight(entry.id);
 if(image.width!==1024||image.height!==1536)throw Error('Unexpected authored dimensions: '+entry.image);
 const canvas=createCanvas(image.width,height);canvas.getContext('2d').drawImage(image,0,0,image.width,height,0,0,image.width,height);
 const data=canvas.toBuffer('image/png');await writeFile(new URL(entry.id+'.png',out),data);
 files[entry.id+'.png']={source:entry.image,sourceSha256:createHash('sha256').update(source).digest('hex'),crop:[0,0,image.width,height],sha256:createHash('sha256').update(data).digest('hex')};
}
await writeFile(new URL('SOURCE.json',out),JSON.stringify({description:'Exact title-only crops of supplied folios; regenerate with tools/build_bestiary_headers.mjs.',files},null,2)+'\n');
console.log('Built47 authored heading crops; full source pages unchanged.');
