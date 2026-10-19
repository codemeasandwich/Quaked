import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from '/Users/bri/SOURCE/Quaked/node_modules/playwright/index.mjs';
const root='/Users/bri/SOURCE/Quaked',out='/private/tmp/quaked-box-consolidation-browser-20261019';
const art=['/Users/bri/SOURCE/Quaked/assets/boxes/shareware/back.png','/private/tmp/quaked-shelf-corrupt-art-20261019.png'];
const script=String.raw`
import '/src/engine/render/gl_rsurf.js'; import '/src/newer/install.js';
import {mockIPC,mockConvertFileSrc} from '@tauri-apps/api/mocks';
import {convertFileSrc} from '@tauri-apps/api/core';
import {GameSelection_Remember} from '/src/engine/common/game_selection.js';
import {GameCatalogue_Get} from '/src/engine/common/game_catalogue.js';
import {Desktop_ShowShelf} from '/src/platform/desktop.js';
function pak(names){const out=new Uint8Array(12+names.length+names.length*64),v=new DataView(out.buffer);out.set([80,65,67,75]);v.setInt32(4,12+names.length,true);v.setInt32(8,names.length*64,true);names.forEach((n,i)=>{const p=12+names.length+i*64;out.set(new TextEncoder().encode(n),p);v.setInt32(p+56,12+i,true);v.setInt32(p+60,1,true)});return out;}
const data=new Map([['shareware/pak0.pak',pak(['progs.dat','maps/start.bsp','maps/e1m1.bsp'])],['hipnotic/pak0.pak',pak(['progs.dat','gfx.wad','maps/start.bsp'])],['quake/pak0.pak',pak(['progs.dat','maps/start.bsp','maps/e1m1.bsp','maps/e2m1.bsp','maps/e3m1.bsp','maps/e4m1.bsp'])],['mg1/pak0.pak',pak(['progs.dat','maps/start.bsp','maps/machine.bsp'])],['quoth/pak0.pak',pak(['progs.dat','maps/quoth.bsp'])],['mod_q30a1024/pak0.pak',pak(['progs.dat','maps/custom.bsp'])],['mod_corrupt_art/pak0.pak',pak(['progs.dat','maps/corruptart.bsp'])]]);
window.adapterCalls=[];window.converted=[];
const artwork=new URL(location.href).searchParams.get('scenario')==='overrides'?{shareware:{back:ART[0]},hipnotic:{back:ART[1]},mod_corrupt_art:{front:ART[1]}}:{};
mockIPC((cmd,args)=>{window.adapterCalls.push({cmd,args});if(cmd==='library_scan')return{root:'/Users/bri/quaked',error:null,discovered:[{id:'mod_q30a1024',name:'q30a1024'},{id:'mod_corrupt_art',name:'Corrupt art fixture'},{id:'mod_hexen_2',name:'Hexen 2'},{id:'mod_hexen_2_portal_of_praevus',name:'Hexen 2 Portal of Praevus'},{id:'mod_quaked',name:'Quaked'}],artwork,packs:[...data].map(([token,bytes])=>({token,game:token.split('/')[0],name:'pak0.pak',path:'/native/'+token,bytes:bytes.length,modified:'independent-art-trial',loose:false}))};if(cmd==='library_read'){const b=data.get(args.token);if(!b)throw Error('unknown token');return b.slice(args.offset,args.offset+args.length).buffer;}throw Error('unexpected IPC '+cmd);},{shouldMockEvents:true});
mockConvertFileSrc('macos');window.macAssetURLs=ART.map(path=>convertFileSrc(path));
window.__TAURI_INTERNALS__.convertFileSrc=(path)=>{window.converted.push(path);return new URL('/local-art/'+encodeURIComponent(path),location.origin).href;};
GameSelection_Remember('shareware');
window.shelfPromise=Desktop_ShowShelf();
window.shelfPromise.catch(e=>window.shelfError=String(e));
window.shelfCatalogue=()=>GameCatalogue_Get()?.games;
`;
const html=`<!doctype html><meta charset=utf-8><title>Independent local shelf trial</title><script type=importmap>${JSON.stringify({imports:{three:'/node_modules/three/build/three.module.js','@tauri-apps/api/mocks':'/node_modules/@tauri-apps/api/mocks.js','@tauri-apps/api/core':'/node_modules/@tauri-apps/api/core.js','@tauri-apps/api/event':'/node_modules/@tauri-apps/api/event.js'}})}</script><body><script>const ART=${JSON.stringify(art)}</script><script type=module>${script}</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
let activeScenario='defaults';const served=[],intentionalCorruptFallback=[];const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(activeScenario==='overrides'&&url.pathname==='/assets/boxes/hipnotic/back.jpg'){intentionalCorruptFallback.push(url.pathname);res.setHeader('Content-Type','image/jpeg');res.end('independent invalid bundled JPG decoder fixture');return;}if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}let path;if(url.pathname.startsWith('/local-art/')){path=decodeURIComponent(url.pathname.slice(11));if(!art.includes(path)){res.writeHead(403);res.end();return;}served.push(path);}else{path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}}const bytes=await readFile(path);res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(bytes);}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/';let browser;const errors=[],consoleErrors=[],failedResponses=[];let receipt;const phases=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const scenario of ['defaults','overrides']){
  activeScenario=scenario;const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push({scenario,error:String(e)}));page.on('console',m=>{if(m.type()==='error')consoleErrors.push({scenario,text:m.text()});});page.on('response',r=>{if(r.status()>=400)failedResponses.push({scenario,url:r.url(),status:r.status()});});
  await page.goto(url+'?scenario='+scenario,{waitUntil:'networkidle'});await page.waitForSelector('#game-shelf .box');
  const snapshot=await page.evaluate(async()=>{if(window.shelfError)throw Error(window.shelfError);const games=window.shelfCatalogue();const boxes=[...document.querySelectorAll('#game-shelf .box')];const result={games:games.map((g,i)=>({id:g.id,present:g.present,validated:g.validated,playable:g.playable,faces:Object.fromEntries(['front','back','spine'].map(face=>{const el=boxes[i].querySelector('.'+face);return[face,{background:el.style.backgroundImage,computedBackground:getComputedStyle(el).backgroundImage,placeholder:el.classList.contains('ph'),text:el.textContent}];}))})),converted:window.converted,macAssetURLs:window.macAssetURLs,calls:window.adapterCalls};for(const game of result.games)for(const face of Object.values(game.faces)){if(face.placeholder&&!face.computedBackground.includes('gradient'))throw Error('placeholder lost opaque gradient: '+game.id);if(!face.background||face.background==='none')continue;const image=new Image();image.src=face.background.slice(5,-2);await image.decode();if(!image.naturalWidth)throw Error('empty image');}return result;});
  const game=id=>snapshot.games.find(g=>g.id===id),check={};
  const shipped=(id,face,path)=>assert.ok(game(id).faces[face].background.includes(path),id+' '+face+' shipped '+path);
  for(const id of ['shareware','quake','hipnotic','mg1','quoth','mod_q30a1024','mod_corrupt_art']){assert.equal(game(id).validated,true,id+' real binary range directory validation');assert.equal(game(id).playable,true);}
  check.completeFixturesReallyValidated=true;
  for(const id of ['mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_quaked']){assert.equal(game(id).present,false);assert.equal(game(id).validated,false);assert.equal(game(id).playable,false);assert.ok(!snapshot.calls.some(c=>c.cmd==='library_read'&&c.args.token.startsWith(id+'/')));}
  check.artOnlyDefaultsDoNotAuthorizeGameFiles=true;
  shipped('shareware','front','assets/boxes/shareware/front.png');shipped('shareware','spine','assets/boxes/shareware/spine.png');
  if(scenario==='defaults'){
   assert.equal(snapshot.converted.length,0,'all local artwork is absent in this phase');shipped('shareware','back','assets/boxes/shareware/back.png');shipped('hipnotic','back','assets/boxes/hipnotic/back.jpg');
   check.noLocalArtRequired=true;check.allSharewareFacesShipped=true;
  }else{
   assert.ok(game('shareware').faces.back.background.includes(encodeURIComponent(art[0])),'one local back overrides its default');assert.equal(snapshot.converted.length,3);assert.deepEqual([...new Set(snapshot.converted)].sort(),art.toSorted());
   assert.equal(game('hipnotic').faces.back.placeholder,true);assert.ok(intentionalCorruptFallback.length>0);assert.equal(game('mod_corrupt_art').faces.front.placeholder,true);
   check.singleLocalOverrideKeepsOtherDefaults=true;check.corruptLocalAndBundledBecomePrinted=true;
  }
  shipped('quake','front','assets/boxes/quake/front.jpg');shipped('quake','back','assets/boxes/quake/back.jpg');shipped('quake','spine','assets/boxes/quake/spine.jpg');check.existingQuakeDefaultsRetained=true;
  shipped('hipnotic','spine','assets/boxes/hipnotic/spine.png');shipped('rogue','spine','assets/boxes/rogue/spine.png');check.missionSpinesShipped=true;
  for(const face of ['front','back','spine']){shipped('quoth',face,'assets/boxes/quoth/'+face+'.png');shipped('mg1',face,'assets/boxes/mg1/'+face+'.png');}check.currentQuothAndMachineOriginalPNGs=true;
  for(const face of ['front','back','spine'])assert.equal(game('mod_q30a1024').faces[face].placeholder,true,'q30 screenshot collage never becomes a default box face');check.retiredCollageStaysUnboxed=true;
  shipped('mod_quaked','front','assets/boxes/mod_quaked/front.png');shipped('mod_hexen_2','front','assets/boxes/mod_hexen_2/front.webp');shipped('mod_hexen_2','spine','assets/boxes/mod_hexen_2/spine.webp');assert.equal(game('mod_hexen_2').faces.back.placeholder,true);
  for(const face of ['front','back','spine'])shipped('mod_hexen_2_portal_of_praevus',face,'assets/boxes/mod_hexen_2_portal_of_praevus/'+face+'.webp');check.artOnlyTitlesHaveShippedFaces=true;
  assert.deepEqual(snapshot.macAssetURLs,art.map(path=>'asset://localhost/'+encodeURIComponent(path)));check.nativeURLCodecBoundary=true;check.allImagesDecodedAndPrintedFacesOpaque=true;
  await page.screenshot({path:out+'-'+scenario+'-shareware-front.png'});await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(650);assert.match(await page.locator('#game-shelf .box').first().evaluate(el=>el.style.transform),/rotateY\(180deg\)/);await page.screenshot({path:out+'-'+scenario+'-shareware-back.png'});await page.getByRole('button',{name:'Turn over',exact:true}).click();check.turnOverAndReturn=true;
  let selected=0;const selections=[];
  for(const [id,title]of [['mg1','Dimension of the Machine'],['quoth','Quoth'],['mod_q30a1024','q30a1024'],['mod_hexen_2','Hexen 2'],['mod_hexen_2_portal_of_praevus','Hexen 2 Portal of Praevus'],['mod_quaked','Quaked']]){
   const target=snapshot.games.findIndex(g=>g.id===id);while(selected<target){await page.keyboard.press('ArrowRight');selected++;}await page.waitForTimeout(650);assert.equal(await page.locator('#game-shelf .caption .n').textContent(),title);const disabled=await page.getByRole('button',{name:'Play',exact:true}).isDisabled();assert.equal(disabled,['mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_quaked'].includes(id));
   if(scenario==='defaults'){await page.screenshot({path:out+'-'+id+'-front.png'});await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(650);await page.screenshot({path:out+'-'+id+'-back.png'});}
   const label=await page.locator('#game-shelf .caption .k').textContent();if(['mod_hexen_2','mod_hexen_2_portal_of_praevus','mod_quaked'].includes(id)){assert.ok(label.startsWith('Game'));assert.ok(!label.includes('Quake add-on'));}selections.push({id,title,playDisabled:disabled,label});
  }
  check.artOnlyPlayControlsDisabled=true;check.artOnlyNeutralGameLabel=true;phases.push({scenario,checks:check,snapshot,selections});await page.close();
 }
 receipt={status:'PASS',checkCount:phases.reduce((sum,p)=>sum+Object.keys(p.checks).length,0)+1,phases,checks:{zeroErrors:!errors.length&&!consoleErrors.length&&!failedResponses.length},intentionalCorruptFallback,sourceHashes:Object.fromEntries(await Promise.all(['src-tauri/src/main.rs','src-tauri/src/library.rs','src/platform/desktop.js','src/newer/ui/game_shelf.js','tests/game_shelf_test.js','tests/box_art_contract_test.mjs','assets/boxes/manifest.json','docs/evidence/box-art-consolidation-2026-10-19/move-plan.json'].map(async path=>[path,createHash('sha256').update(await readFile(root+'/'+path)).digest('hex')]))),served:[...new Set(served)],errors,consoleErrors,failedResponses,art:await Promise.all(art.map(async path=>({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')}))),limits:['Native IPC/converter endpoints are doubled, using real binary ArrayBuffer responses and the actual desktop adapter/catalogue/shelf.','Synthetic PAK directories prove admission wiring, not game startup or Hexen compatibility.','No-local-art phase has an empty native artwork map; all29 current defaults load through actual source URLs. The override uses an original project PNG; the harness reads no game-folder artwork.','One deliberate temporary invalid PNG and exact HTTP200 invalid bundled-JPG response exercise failure fallback.','Actual installed Tauri asset transport, Rust scope enforcement, qualified build and owner acceptance remain separately owned native checks.']};assert.ok(receipt.checks.zeroErrors,JSON.stringify({errors,consoleErrors,failedResponses}));
}catch(error){receipt={status:'FAIL',error:String(error.stack),phases,errors,consoleErrors,failedResponses};process.exitCode=1;}finally{await writeFile(out+'.json',JSON.stringify(receipt,null,2)+'\n');await browser?.close();await new Promise(r=>server.close(r));}console.log(JSON.stringify(receipt,null,2));
