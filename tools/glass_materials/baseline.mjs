import {register} from 'node:module';
const args=process.argv.slice(2),stage=args[args.indexOf('--stage')+1],three=process.env.QUAKED_THREE_MODULE;if(!stage||!three)throw Error('Use --stage and QUAKED_THREE_MODULE with real Three.js183.');
const {pathToFileURL,fileURLToPath}=await import('node:url');const {resolve}=await import('node:path');
const rootURL=new URL('../../',import.meta.url).href,threeURL=pathToFileURL(resolve(three)).href,threeRoot=new URL('./',threeURL).href;
register('data:text/javascript,'+encodeURIComponent(`import {readFile} from 'node:fs/promises';export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(pathToFileURL(resolve(three)).href)},shortCircuit:true};return n(s,c);}export async function load(u,c,n){if(u.endsWith('.js')&&(u.startsWith(${JSON.stringify(rootURL+'src/')})||u.startsWith(${JSON.stringify(threeRoot)})))return {format:'module',source:await readFile(new URL(u),'utf8'),shortCircuit:true};return n(u,c);}`));
const {readFileSync,writeFileSync,mkdirSync}=await import('node:fs');
const {createCanvas,loadImage}=await import(process.env.QUAKED_CANVAS_MODULE||'@napi-rs/canvas');
const {R_GenerateNormalData}=await import('../../src/newer/render/gl_normals.js');
const proof=JSON.parse(readFileSync(stage+'/provenance.json')),rows=[...new Map(proof.variants.filter(v=>v.runtime).map(v=>[v.name+'|'+v.nativeRGBAKey,v])).values()];mkdirSync(stage+'/baseline',{recursive:true});
for(const v of rows){const image=await loadImage(stage+'/assets/'+v.outputs.diffuse.file.split('/').pop());const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height).data;const normal=R_GenerateNormalData(pixels,image.width,image.height,null);writeFileSync(stage+'/baseline/'+v.outputs.normal.file.split('/').pop().replace('-normal.png','.bin'),normal);}
console.log('Canonical ordinary-material baseline normals generated for',rows.length,'actual diffuse images');
