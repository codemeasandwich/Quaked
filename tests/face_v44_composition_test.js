// Independent oracle: execute the complete supplied HTML script unchanged in a
// VM with a small DOM boundary, then compare real Canvas2D pixels against the
// production module. No copied composition algorithm is used as the oracle.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const canvas=await import(process.env.QUAKED_CANVAS_MODULE||'/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
const read=path=>readFileSync(new URL('../'+path,import.meta.url)),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const html=read('player-face-layers-v4.4.0.html'),text=html.toString(),script=text.match(/<script>\s*([\s\S]*?)<\/script>/)[1],data=JSON.parse(script.match(/const DATA = ([\s\S]*?);\s*const M/)[1]),manifest=JSON.parse(read('newer/hud/playerface/manifest.json'));
const elements=new Map();function element(id){if(!elements.has(id)){const node=canvas.createCanvas(96,96);Object.assign(node,{setAttribute(){},addEventListener(){},appendChild(){},remove(){},click(){},dataset:{},style:{},classList:{toggle(){},add(){},remove(){}}});elements.set(id,node);}return elements.get(id);}
class SourceImage extends canvas.Image{set src(value){super.src=value;}get src(){return super.src;}}
const sourceWindow={addEventListener(){}},sourceDocument={getElementById:element,createElement:tag=>tag==='canvas'?canvas.createCanvas(96,96):element('temporary-'+tag),querySelectorAll:()=>[],body:{appendChild(){}}};
new Script(script,{filename:'owner-player-face-layers-v4.4.0.html'}).runInNewContext({window:sourceWindow,document:sourceDocument,Image:SourceImage,console,URL,setTimeout,clearTimeout,performance});
const deadline=Date.now()+10000;while(!sourceWindow.faceKit.ready){if(Date.now()>deadline)throw Error('Supplied face-kit image decode deadline');await new Promise(resolve=>setTimeout(resolve,1));}
const source=sourceWindow.faceKit,descriptors=Object.fromEntries(['Image','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),oldFetch=globalThis.fetch;
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas.createCanvas(96,96)}});
class ProductionImage extends canvas.Image{set src(value){super.src=new URL(String(value).split('?')[0]).pathname;}get src(){return super.src;}}
Object.defineProperty(globalThis,'Image',{configurable:true,value:ProductionImage});globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL(String(url).split('?')[0])))});
const face=await import('../src/newer/ui/r_playerface.js');await face.R_PlayerFacePreload();
const pixels=surface=>Buffer.from(surface.getContext('2d').getImageData(0,0,96,96).data);
function compare(state,label){const expected=source.renderComposite(state),actual=face.R_PlayerFaceCompose(state);assert.equal(expected.complete,true,label+' source complete');assert.equal(actual.complete,true,label+' production complete');assert.equal(JSON.stringify(actual.selection),JSON.stringify(expected.selection),label+' exact selection/order');assert.ok(pixels(actual.canvas).equals(pixels(expected.canvas)),label+' exact RGBA pixel parity');}
Deno.test('v4.4 source identity manifest and all 271 PNG extractions are exact',()=>{
 assert.equal(sha(html),'90c759c0051f2fd3dc19d752f24e220a39aece467f13aeff370605e871f073a3');assert.deepEqual(manifest,data.manifest);assert.equal(manifest.assets.length,285);assert.equal(manifest.poses.length,25);assert.equal(Object.keys(data.images).length,271);assert.equal(new Set(manifest.assets.map(a=>a.source).filter(Boolean)).size,270);
 for(const[id,url]of Object.entries(data.images))assert.ok(read('newer/hud/playerface/'+id+'.png').equals(Buffer.from(url.split(',')[1],'base64')),id+' preserves original PNG bytes');assert.equal(face.R_PlayerFaceStatus().state,'ready');
});
Deno.test('all 285 source layers have identical availability and native-sized pixel composition',()=>{
 for(const asset of manifest.assets){const expected=source.renderLayer(asset.id,asset.reference_pose||null),actual=face.R_PlayerFaceLayer(asset.id,asset.reference_pose||null);assert.equal(expected.complete,true,asset.id+' source available');assert.equal(actual.complete,true,asset.id+' production available');assert.equal(actual.canvas.width,96);assert.equal(actual.canvas.height,96);assert.ok(pixels(actual.canvas).equals(pixels(expected.canvas)),asset.id+' full-cell RGBA parity');}console.log('FACE_V44_LAYER_PARITY 285/285');
});
Deno.test('all 25 poses and ten health stages match source across open blink dead and representative powers/equipment',()=>{
 let cases=0;for(const pose of manifest.poses)for(let health=1;health<=10;health++)for(const[eyeIndex,eyeState]of['open','blink','dead'].entries()){const bits=(health+eyeIndex)%8,state={expression:pose.expression,look:pose.look,health,eyeState,invisibility:!!(bits&1),strength:!!(bits&2),invulnerability:!!(bits&4),divingSuit:(health+eyeIndex)%2===0,waterPercent:0};compare(state,pose.id+' H'+health+' '+eyeState);cases++;}assert.equal(cases,750);console.log('FACE_V44_HEALTH_PARITY '+cases+'/'+cases);
});
Deno.test('each pose preserves every invisibility and power combination with open blink and dead eyes',()=>{
 let cases=0;for(const pose of manifest.poses)for(let bits=0;bits<8;bits++)for(const eyeState of['open','blink','dead']){compare({expression:pose.expression,look:pose.look,health:10,eyeState,invisibility:!!(bits&1),strength:!!(bits&2),invulnerability:!!(bits&4),divingSuit:!!(bits&1),waterPercent:0},pose.id+' powers'+bits+' '+eyeState);cases++;}assert.equal(cases,600);console.log('FACE_V44_POWER_PARITY '+cases+'/'+cases);
});
Deno.test('all water stages and representative opacity values preserve source mask geometry and layer order across every pose',()=>{
 let cases=0;const eyes=new Set();for(const pose of manifest.poses)for(const divingSuit of[false,true])for(let stage=0;stage<=10;stage++)for(const[opacityIndex,opacity]of[0,25,50,75,100].entries()){const eyeState=['open','blink','dead'][(stage+opacityIndex)%3];eyes.add(eyeState);compare({expression:pose.expression,look:pose.look,health:stage%10+1,eyeState,invisibility:stage%2===0,strength:true,invulnerability:stage%2===1,divingSuit,waterPercent:stage*10,waterOpacity:opacity},pose.id+' '+(divingSuit?'diving':'helmet')+' W'+stage+' opacity'+opacity+' '+eyeState);cases++;}for(const percent of[-1,0,9.9,10,19.9,20,89.9,90,99.9,100,101,NaN])assert.equal(face.waterStageForPercent(percent),source.waterStageForPercent(percent),'exact source water threshold '+percent);assert.deepEqual([...eyes].sort(),['blink','dead','open']);assert.equal(cases,2750);console.log('FACE_V44_WATER_PARITY '+cases+'/'+cases);
});
Deno.test('W10 water-only output matches donor and fills each helmet or diving mask without exterior bleed',()=>{
 let cases=0;const coverage=new Map();for(const pose of manifest.poses)for(const divingSuit of[false,true])for(const opacity of[50,100]){const state={expression:pose.expression,look:pose.look,health:10,eyeState:'dead',invisibility:true,strength:true,invulnerability:true,divingSuit,waterPercent:100,waterOpacity:opacity},label=pose.id+' '+(divingSuit?'diving':'helmet')+' W10 opacity'+opacity,expected=source.renderWaterOverlay(state),actual=face.R_PlayerFaceWaterOverlay(state);assert.equal(expected.complete,true,label+' donor water complete');assert.equal(actual.complete,true,label+' actual water complete');const output=pixels(actual.canvas);assert.ok(output.equals(pixels(expected.canvas)),label+' exact donor water-only pixels');const selected=source.selection(state),maskLayer=source.renderLayer(selected.layers.water.clip_mask),mask=pixels(maskLayer.canvas);assert.equal(maskLayer.complete,true,label+' reviewed interior mask available');let interior=0,covered=0,exterior=0,bleed=0;for(let i=3;i<output.length;i+=4){if(mask[i]>0){interior++;if(output[i]>0)covered++;}else{exterior++;if(output[i]>0)bleed++;}}assert.ok(interior>0&&exterior>0,label+' nonempty interior and exterior witnesses');assert.equal(covered,interior,label+' full W10 covers every mask pixel');assert.equal(bleed,0,label+' no water reaches mask exterior');coverage.set((divingSuit?'diving':'helmet')+'_'+pose.head_direction+'_opacity'+opacity,{interior,covered,exterior,bleed});cases++;}assert.equal(cases,100);assert.equal(coverage.size,12);console.log('FACE_V44_WATER_OVERLAY_PARITY '+cases+'/'+cases+' '+JSON.stringify(Object.fromEntries(coverage)));
});
Deno.test('owner entry and draining stages select the exact existing source water frames',()=>{
 let cases=0;
 for(const pose of manifest.poses)for(const divingSuit of[false,true]){
  const base={expression:pose.expression,look:pose.look,health:1,eyeState:'open',divingSuit,waterOpacity:50};
  for(const[percent,stage]of[[0,1],[9.999,1],[10,2],[89.999,9],[90,10],[100,10]]){
   const actual=face.R_PlayerFaceCompose({...base,waterSubmerged:true,waterPercent:percent});
   const expected=source.renderComposite({...base,waterPercent:stage*10});
   assert.ok(actual.complete&&expected.complete);assert.equal(actual.selection.waterStage,stage);assert.ok(pixels(actual.canvas).equals(pixels(expected.canvas)));cases++;
  }
  for(let stage=10;stage>=0;stage--){
   const actual=face.R_PlayerFaceCompose({...base,waterSubmerged:false,waterPercent:0,waterVisualStage:stage});
   const expected=source.renderComposite({...base,waterPercent:stage*10});
   assert.ok(actual.complete&&expected.complete);assert.equal(actual.selection.waterStage,stage);assert.ok(pixels(actual.canvas).equals(pixels(expected.canvas)));cases++;
  }
 }
 assert.equal(cases,850);console.log('FACE_WATER_ENTRY_DRAIN_PARITY '+cases+'/'+cases);
});
Deno.test('restore v4.4 composition test endpoints',()=>{globalThis.fetch=oldFetch;for(const key of['Image','document'])if(descriptors[key])Object.defineProperty(globalThis,key,descriptors[key]);else delete globalThis[key];});
