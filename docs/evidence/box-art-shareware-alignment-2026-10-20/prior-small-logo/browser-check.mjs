/** Independent Shareware visible-material trial. Run only after candidate-ready.
 * node docs/evidence/box-art-shareware-alignment-2026-10-20/browser-check.mjs
 * Actual shelf and turnover; controlled 35/145-degree poses expose face joins.
 * No native executable, owner app, game data, provider or product source is changed.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {GAME_BOXES} from '../../../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../../../src/engine/common/game_catalogue.js';

const out=dirname(fileURLToPath(import.meta.url)),root=resolve(out,'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFile(resolve(root,path));
const manifest=JSON.parse(await read('assets/boxes/manifest.json'));
const baseline=JSON.parse(await readFile(resolve(out,'baseline-manifest.json')));
const layout=JSON.parse(await readFile(resolve(out,'layout-plan-v2.json')));
const dimensions=Object.fromEntries(manifest.faces.map(face=>[face.path,[face.width,face.height]]));
const names={mod_quaked:'Quaked',mod_hexen_2:'Hexen 2',mod_hexen_2_portal_of_praevus:'Hexen 2 Portal of Praevus',mod_alkaline:'Alkaline',mod_tremor:'Tremor',mod_hexen_2_shareware:'Hexen 2 Shareware',mod_the_immortal_lock:'The Immortal Lock'};
// This is a rendering fixture. Only Shareware is bright/playable for owner-facing
// material inspection; Play is never invoked and no gameplay authority is inferred.
const games=Object.keys(GAME_BOXES).map(id=>({...GAME_CATALOGUE_GAMES.find(g=>g.id===id),id,name:GAME_CATALOGUE_GAMES.find(g=>g.id===id)?.name??names[id],kind:GAME_CATALOGUE_GAMES.find(g=>g.id===id)?.kind??'unavailable',playable:id==='shareware',images:{}}));
const script=String.raw`
import {GameShelf_Show} from '/src/newer/ui/game_shelf.js';
const mode=new URL(location.href).searchParams.get('mode')??'defaults';
const games=CONFIG.games.map(game=>({...game,images:{}}));
if(mode==='overrides'){
 games.find(g=>g.id==='shareware').images={back:'/override-back.webp'};
 games.find(g=>g.id==='quake').images={front:'/invalid-local-image.webp'};
 games.push({id:'mod_corrupt_fixture',name:'Unboxed corrupt art fixture',kind:'unavailable',playable:false,images:{front:'/invalid-local-image.webp'}});
}
window.shelfGames=games;
void GameShelf_Show(games,{native:true,current:'shareware',open:url=>window.unexpectedOpen=url}).catch(error=>window.shelfError=String(error));
`;
const html=`<!doctype html><meta charset=utf-8><title>Shareware Quake material alignment trial</title><body><script>const CONFIG=${JSON.stringify({games})}</script><script type=module>${script}</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const requestPaths=[],pageErrors=[],consoleErrors=[],failedResponses=[],screenshots=[],phases=[];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');requestPaths.push(url.pathname);
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(url.pathname==='/invalid-local-image.webp'){res.setHeader('Content-Type','image/webp');res.end('intentional decoder-failure fixture');return;}
 const local=url.pathname==='/override-back.webp'?'/'+GAME_BOXES.shareware.back:decodeURIComponent(url.pathname),path=resolve(root,'.'+local);
 if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));
}catch(error){res.writeHead(404);res.end(String(error));}});

function edgeWitness(data,info){
 const sample=(x,y)=>[...data.subarray((y*info.width+x)*info.channels,(y*info.width+x)*info.channels+3)];
 const summarize=pixels=>{const mean=[0,0,0],unique=new Set();let oldFlat=0;for(const rgb of pixels){for(let c=0;c<3;c++)mean[c]+=rgb[c];unique.add(rgb.join(','));if(rgb.every((v,c)=>Math.abs(v-[21,17,12][c])<=1))oldFlat++;}return{samples:pixels.length,uniqueColors:unique.size,mean:mean.map(v=>v/pixels.length),oldFlatBackgroundFraction:oldFlat/pixels.length};};
 const band=16,regions={top:[],bottom:[],left:[],right:[]};
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){if(y<band)regions.top.push(sample(x,y));if(y>=info.height-band)regions.bottom.push(sample(x,y));if(x<band)regions.left.push(sample(x,y));if(x>=info.width-band)regions.right.push(sample(x,y));}
 const edges=Object.fromEntries(Object.entries(regions).map(([name,pixels])=>[name,summarize(pixels)]));
 const profiles=[900,920,931,937,943,955,980].map(y=>({y,left:summarize(Array.from({length:band},(_,x)=>sample(x,y))),right:summarize(Array.from({length:band},(_,x)=>sample(info.width-band+x,y)))}));
 return{edges,materialBandEdgeProfiles:profiles,meaning:'Witness against the exact old flat fill only. Texture statistics and canvas dimensions do not establish visible alignment; inspect the flat wrap and actual oblique shelf views.'};
}
async function snapshot(page){return page.evaluate(async()=>{
 if(window.shelfError)throw Error(window.shelfError);
 const boxes=[...document.querySelectorAll('#game-shelf .box')],result=[];
 for(let index=0;index<window.shelfGames.length;index++){
  const game=window.shelfGames[index],box=boxes[index],faces={};
  for(const role of ['front','back','spine']){
   const face=box.querySelector('.'+role),style=getComputedStyle(face),rect=face.getBoundingClientRect(),background=face.style.backgroundImage;
   const row={background,placeholder:face.classList.contains('ph'),backgroundSize:style.backgroundSize,width:parseFloat(style.width),height:parseFloat(style.height),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
   if(row.placeholder){if(!style.backgroundImage.includes('gradient'))throw Error('nonopaque placeholder: '+game.id+'/'+role);}
   else{const image=new Image();image.src=background.slice(5,-2);await image.decode();row.naturalWidth=image.naturalWidth;row.naturalHeight=image.naturalHeight;}
   faces[role]=row;
  }
  result.push({id:game.id,name:game.name,playable:game.playable,faces});
 }
 return{games:result,unexpectedOpen:window.unexpectedOpen??null};
});}
async function photo(page,name){const filename=name+'.png';await page.screenshot({path:resolve(out,filename),type:'png'});screenshots.push(filename);}
async function pose(page,angle){const box=page.locator('#game-shelf .box').first();await box.evaluate((el,degrees)=>{const z=/translateZ\(([^)]+)\)/.exec(el.style.transform)?.[1];if(!z)throw Error('selected public shelf transform unavailable');el.style.transform='translateZ('+z+') rotateY('+degrees+'deg)';},angle);await page.waitForTimeout(650);return box.evaluate(el=>({transform:el.style.transform,faces:[...el.querySelectorAll('.front,.back,.spine')].map(face=>{const r=face.getBoundingClientRect();return{className:face.className,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};})}));}

let browser,receipt={status:'FAIL',started:new Date().toISOString(),scope:'One-box Shareware material/placement trial using actual GameShelf_Show. Controlled angles are inspection poses only. No native app/process, game data, build, provider, commit or product source is modified.',visualAcceptance:'Pending independent visual review and explicit owner acceptance. Edge statistics and matching dimensions alone do not prove aligned material.'};
await mkdir(out,{recursive:true});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url='http://127.0.0.1:'+server.address().port+'/';
try{
 assert.equal(manifest.faces.length,57);assert.equal(baseline.faces.length,57);
 const changed=[],unchanged=[];
 for(const previous of baseline.faces){const current=manifest.faces.find(face=>face.path===previous.path);assert.ok(current,previous.path);const bytes=await read(current.path);assert.equal(sha(bytes),current.sha256,current.path+' manifest bytes');if(current.sha256===previous.sha256)unchanged.push(current.path);else changed.push(current.path);if(current.game!=='shareware')assert.equal(current.sha256,previous.sha256,'other box remains unchanged: '+current.path);}
 assert.equal(unchanged.length,54,'all54 other runtime faces unchanged');assert.deepEqual(changed.toSorted(),['assets/boxes/shareware/back.webp','assets/boxes/shareware/front.webp','assets/boxes/shareware/spine.webp']);
 receipt.runtimeDelta={unchangedFaces:unchanged.length,changed};
 const material=[];const layers=[];
 for(const face of manifest.faces.filter(face=>face.game==='shareware')){
  const bytes=await read(face.path),{data,info}=await sharp(bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height],face.face==='spine'?[340,2000]:[1640,2000]);
  const witness=edgeWitness(data,info);for(const[edge,row]of Object.entries(witness.edges))assert.ok(row.oldFlatBackgroundFraction<.95,face.face+'/'+edge+' no unchanged flat authoring cap/sidebar');
  material.push({face:face.face,path:face.path,sha256:face.sha256,...witness});layers.push({input:bytes,left:layout.panels[face.face].left,top:0});
 }
 await sharp({create:{width:3620,height:2000,channels:3,background:'#15110c'}}).composite(layers).png().toFile(resolve(out,'candidate-flat-wrap.png'));
 receipt.materialWitnesses=material;receipt.flatWrap='candidate-flat-wrap.png';receipt.expectedMaterialBandRows=layout.materialBandRows;receipt.ownerRefinement=layout.spineSegments;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const[label,viewport]of[['large',{width:1440,height:1000}],['small',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  page.on('pageerror',error=>pageErrors.push({phase:label,error:String(error)}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase:label,text:message.text()});});page.on('response',response=>{if(response.status()>=400)failedResponses.push({phase:label,url:response.url(),status:response.status()});});
  await page.goto(url,{waitUntil:'networkidle'});await page.waitForSelector('#game-shelf .box');await page.waitForTimeout(100);
  const state=await snapshot(page);assert.deepEqual(state.games.map(game=>game.id),games.map(game=>game.id));
  for(const game of state.games)for(const role of['front','back','spine']){const face=game.faces[role],path=GAME_BOXES[game.id][role];assert.ok(face.background.includes(path));assert.equal(face.placeholder,false);assert.deepEqual([face.naturalWidth,face.naturalHeight],dimensions[path]);assert.equal(face.backgroundSize,'contain');}
  const selected=page.locator('#game-shelf .box').first();assert.equal(await page.locator('#game-shelf .caption .n').textContent(),'Quake (shareware)');
  await photo(page,label+'-shareware-front');
  await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(650);assert.match(await selected.evaluate(el=>el.style.transform),/rotateY\(180deg\)/);await photo(page,label+'-shareware-back');
  const backPose=await pose(page,145);await photo(page,label+'-shareware-oblique-145-back-spine');
  await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(650);assert.match(await selected.evaluate(el=>el.style.transform),/rotateY\(0deg\)/);
  const frontPose=await pose(page,35);await photo(page,label+'-shareware-oblique-35-front-spine');
  // Restore through the actual control, proving inspection poses do not replace it.
  await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(650);assert.match(await selected.evaluate(el=>el.style.transform),/rotateY\(0deg\)/);
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(650);assert.match(await selected.evaluate(el=>el.style.transform),/rotateY\(90deg\)/);await selected.locator('.spine').screenshot({path:resolve(out,label+'-shareware-spine.png'),type:'png'});screenshots.push(label+'-shareware-spine.png');
  assert.equal(state.unexpectedOpen,null);phases.push({phase:label,viewport,snapshot:state,backPose,frontPose,realTurnOver:true,inspectionAngles:[35,145]});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',error=>pageErrors.push({phase:'overrides',error:String(error)}));page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase:'overrides',text:message.text()});});page.on('response',response=>{if(response.status()>=400)failedResponses.push({phase:'overrides',url:response.url(),status:response.status()});});
 await page.goto(url+'?mode=overrides',{waitUntil:'networkidle'});await page.waitForTimeout(300);const state=await snapshot(page),game=id=>state.games.find(game=>game.id===id);
 assert.ok(game('shareware').faces.back.background.includes('/override-back.webp'));for(const role of['front','spine'])assert.ok(game('shareware').faces[role].background.includes(GAME_BOXES.shareware[role]));assert.ok(game('quake').faces.front.background.includes(GAME_BOXES.quake.front));assert.equal(game('mod_corrupt_fixture').faces.front.placeholder,true);assert.equal(state.unexpectedOpen,null);phases.push({phase:'overrides',snapshot:state,partialOverrideKeepsOtherFaces:true,corruptLocalUsesBundled:true,corruptUnboxedUsesPrinted:true});await page.close();
 assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(failedResponses,[]);
 const sourcePaths=['src/newer/ui/game_shelf.js','assets/boxes/manifest.json','docs/evidence/box-art-standardization-2026-10-20/derivation.json','docs/evidence/box-art-shareware-alignment-2026-10-20/browser-check.mjs','docs/evidence/box-art-shareware-alignment-2026-10-20/baseline-manifest.json','docs/evidence/box-art-shareware-alignment-2026-10-20/baseline-faces.json','docs/evidence/box-art-shareware-alignment-2026-10-20/layout-plan-v2.json'];
 receipt={...receipt,status:'PASS',completed:new Date().toISOString(),phases,screenshots,sourceHashes:Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await read(path))]))),pageErrors,consoleErrors,failedResponses,requestPaths:[...new Set(requestPaths)]};
}catch(error){receipt={...receipt,error:String(error),stack:error.stack,phases,screenshots,pageErrors,consoleErrors,failedResponses};process.stderr.write(String(error.stack??error)+'\n');throw error;}
finally{try{await writeFile(resolve(out,'browser.json'),JSON.stringify(receipt,null,2)+'\n');}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
