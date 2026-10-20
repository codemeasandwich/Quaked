/** Focused owner-reference repairs, preserving all earlier receipts.
 * node docs/evidence/box-art-standardization-2026-10-20/owner-repair-browser-check.mjs
 * Add --hexen-only for the completed supplied-back increment before Abyss is final.
 * Direct GameShelf_Show uses real shipped images. Desktop_ShowShelf uses a
 * labelled IPC fixture with empty pack/art inventories and retained folders.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {chromium} from 'playwright';
import {GAME_BOXES} from '../../../src/newer/ui/game_shelf.js';
import {GAME_CATALOGUE_GAMES} from '../../../src/engine/common/game_catalogue.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const out=dirname(fileURLToPath(import.meta.url));
const hexenOnly=process.argv.includes('--hexen-only');
const targetGames=hexenOnly?['mod_hexen_2']:['mod_hexen_2','aopfm_v2'];
const prefix=hexenOnly?'owner-repair-hexen':'owner-repair';
const receiptName=prefix+'-browser.json';
const manifest=JSON.parse(await readFile(resolve(root,'assets/boxes/manifest.json')));
const dimensions=Object.fromEntries(manifest.faces.map(face=>[face.path,[face.width,face.height]]));
const names={mod_quaked:'Quaked',mod_hexen_2:'Hexen 2',mod_hexen_2_portal_of_praevus:'Hexen 2 Portal of Praevus',mod_alkaline:'Alkaline',mod_tremor:'Tremor',mod_hexen_2_shareware:'Hexen 2 Shareware',mod_the_immortal_lock:'The Immortal Lock'};
const discovered=Object.entries(names).map(([id,name])=>({id,name}));
const games=Object.keys(GAME_BOXES).map(id=>({...GAME_CATALOGUE_GAMES.find(g=>g.id===id),id,name:GAME_CATALOGUE_GAMES.find(g=>g.id===id)?.name??names[id],kind:GAME_CATALOGUE_GAMES.find(g=>g.id===id)?.kind??'unavailable',playable:false,reason:'Independent artwork-only trial; no game archives supplied',images:{}}));
const script=String.raw`
const mode=new URL(location.href).searchParams.get('mode')??'defaults';
if(mode==='desktop'){
 await import('/src/engine/render/gl_rsurf.js');await import('/src/newer/install.js');
 const {mockIPC}=await import('@tauri-apps/api/mocks');
 window.ipcCalls=[];
 mockIPC((cmd,args)=>{window.ipcCalls.push({cmd,args});if(cmd==='library_scan')return{root:'/fixture/library',error:null,discovered:CONFIG.discovered,artwork:{},packs:[]};throw Error('unexpected native operation '+cmd);},{shouldMockEvents:true});
 const {Desktop_ShowShelf}=await import('/src/platform/desktop.js');
 const {GameCatalogue_Get}=await import('/src/engine/common/game_catalogue.js');
 window.shelfGames=()=>GameCatalogue_Get()?.games;
 void Desktop_ShowShelf().catch(e=>window.shelfError=String(e));
}else{
 const {GameShelf_Show}=await import('/src/newer/ui/game_shelf.js');
 let games=CONFIG.games.map(game=>({...game,images:{}}));
 if(mode==='shapes')games=[
  {id:'quake',name:'SQUARE FRONT / TALL BACK — TEST FIXTURE',kind:'base',playable:true,images:{front:'/square-artwork.svg',back:'/tall-artwork.svg'}},
  {id:'hipnotic',name:'TALL FRONT / SQUARE BACK — TEST FIXTURE',kind:'mission',playable:true,images:{front:'/tall-artwork.svg',back:'/square-artwork.svg'}}
 ];
 if(mode==='overrides'){
  games.find(g=>g.id==='shareware').images={back:'/override-back.webp'};
  games.find(g=>g.id==='quake').images={front:'/invalid-local-image.webp'};
  games.push({id:'mod_corrupt_fixture',name:'Unboxed invalid local art',kind:'unavailable',playable:false,images:{front:'/invalid-local-image.webp'}});
 }
 window.shelfGames=()=>games;
 void GameShelf_Show(games,{native:true,current:games[0].id,open:url=>window.unexpectedOpen=url}).catch(e=>window.shelfError=String(e));
}
`;
const html=`<!doctype html><meta charset=utf-8><title>Normalized box-art public-interface verification</title><script type=importmap>${JSON.stringify({imports:{three:'/node_modules/three/build/three.module.js','@tauri-apps/api/mocks':'/node_modules/@tauri-apps/api/mocks.js','@tauri-apps/api/core':'/node_modules/@tauri-apps/api/core.js','@tauri-apps/api/event':'/node_modules/@tauri-apps/api/event.js'}})}</script><body><script>const CONFIG=${JSON.stringify({games,discovered})}</script><script type=module>${script}</script>`;
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
function markerSVG(width,height){return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#333"/><rect width="60" height="60" fill="#f00"/><rect x="${width-60}" width="60" height="60" fill="#0f0"/><rect y="${height-60}" width="60" height="60" fill="#00f"/><rect x="${width-60}" y="${height-60}" width="60" height="60" fill="#ff0"/><text x="50%" y="50%" text-anchor="middle" fill="white" font-size="24">TEST EDGES</text></svg>`;}
const requests=[],failures=[],pageErrors=[],consoleErrors=[];
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1');requests.push(url.pathname);
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(url.pathname==='/square-artwork.svg'||url.pathname==='/tall-artwork.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(url.pathname==='/square-artwork.svg'?markerSVG(400,400):markerSVG(240,800));return;}
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/invalid-local-image.webp'){res.setHeader('Content-Type','image/webp');res.end('intentional decoder-failure fixture');return;}
  const local=url.pathname==='/override-back.webp'?'/'+GAME_BOXES.shareware.back:decodeURIComponent(url.pathname);
  const path=resolve(root,'.'+local);if(!path.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));
 }catch(error){res.writeHead(404);res.end(String(error));}
});
await mkdir(out,{recursive:true});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/';
let browser,receipt={status:'FAIL',started:new Date().toISOString(),scope:'Focused owner-reference repair trial: supplied main Hexen II back and, when final, Abyss front/back; all current default images decoded; no native executable, game launch, release or owner acceptance'};
const phases=[],screenshots=[];
async function snapshot(page){return page.evaluate(async()=>{
 if(window.shelfError)throw Error(window.shelfError);
 const games=window.shelfGames(),boxes=[...document.querySelectorAll('#game-shelf .box')];
 const result=[];
 for(let index=0;index<games.length;index++){
  const game=games[index],box=boxes[index],faces={};
  for(const role of ['front','back','spine']){
   const el=box.querySelector('.'+role),style=getComputedStyle(el),background=el.style.backgroundImage,ph=el.classList.contains('ph');
   const face={background,placeholder:ph,width:parseFloat(style.width),height:parseFloat(style.height),backgroundSize:style.backgroundSize,text:el.textContent};
   if(ph){if(!style.backgroundImage.includes('gradient'))throw Error('placeholder not opaque: '+game.id+'/'+role);}
   else {const image=new Image();image.src=background.slice(5,-2);await image.decode();face.naturalWidth=image.naturalWidth;face.naturalHeight=image.naturalHeight;}
   faces[role]=face;
  }
  result.push({id:game.id,name:game.name,playable:game.playable,present:game.present,validated:game.validated,faces});
 }
 return {games:result,ipcCalls:window.ipcCalls??[],unexpectedOpen:window.unexpectedOpen??null};
});}
async function photo(page,name){const filename=prefix+'-'+name+'.jpg';const path=resolve(out,filename);await page.screenshot({path,type:'jpeg',quality:85});screenshots.push(filename);}
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const [label,viewport]of [['large',{width:1440,height:1000}],['small',{width:390,height:844}]]){
  const page=await browser.newPage({viewport});
  page.on('pageerror',error=>pageErrors.push({phase:label,error:String(error)}));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase:label,text:message.text()});});
  page.on('response',response=>{if(response.status()>=400)failures.push({phase:label,url:response.url(),status:response.status()});});
  await page.goto(url+'?mode=defaults',{waitUntil:'networkidle'});await page.waitForSelector('#game-shelf .box');
  const state=await snapshot(page);
  assert.deepEqual(state.games.map(g=>g.id),games.map(g=>g.id));
  for(const game of state.games)for(const role of ['front','back','spine']){
   const face=game.faces[role],expected=GAME_BOXES[game.id][role];
   if(expected){assert.ok(face.background.includes(expected),game.id+'/'+role+' shipped default');assert.equal(face.placeholder,false);assert.deepEqual([face.naturalWidth,face.naturalHeight],dimensions[expected]);if(role==='spine')assert.deepEqual([face.naturalWidth,face.naturalHeight],[340,2000]);assert.equal(face.backgroundSize,'contain');}
   else assert.equal(face.placeholder,true,game.id+'/'+role+' missing face stays printed');
   const front=game.faces.front,aspect=front.placeholder?.82:Math.min(1.1,Math.max(.55,front.naturalWidth/front.naturalHeight));
   assert.ok(Math.abs(face.width/face.height-(role==='spine' ? .17 : aspect))<.005,game.id+'/'+role+' actual CSS physical aspect');
  }
  let selected=0;
  const select=async target=>{while(selected<target){await page.keyboard.press('ArrowRight');selected++;}while(selected>target){await page.keyboard.press('ArrowLeft');selected--;}await page.waitForTimeout(600);};
  const ids=targetGames;
  for(const id of ids){
   const index=games.findIndex(g=>g.id===id);assert.ok(index>=0,id+' exists');await select(index);
   assert.equal(await page.locator('#game-shelf .caption .n').textContent(),games[index].name);
   assert.equal(await page.getByRole('button',{name:'Play',exact:true}).isDisabled(),true,'no artwork fixture authorizes gameplay');
   await photo(page,`${label}-${id}-front`);
   await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(600);
   assert.match(await page.locator('#game-shelf .box').nth(index).evaluate(el=>el.style.transform),/rotateY\(180deg\)/);
   await photo(page,`${label}-${id}-back`);
   await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(600);
   if(GAME_BOXES[id].spine){
    await select(index===games.length-1?index-1:index+1);
    assert.match(await page.locator('#game-shelf .box').nth(index).evaluate(el=>el.style.transform),/rotateY\(90deg\)/);
    const spine=page.locator('#game-shelf .box').nth(index).locator('.spine');
    const filename=`${prefix}-${label}-${id}-spine.jpg`;await spine.screenshot({path:resolve(out,filename),type:'jpeg',quality:90});screenshots.push(filename);
   }
  }
  phases.push({phase:label,viewport,snapshot:state,frontBackIDs:ids,spineIDs:ids.filter(id=>GAME_BOXES[id].spine)});await page.close();
 }
 // Test fixtures have four distinct, solid-colored corner markers. Sampling
 // the real rendered pixels catches clipping even if a CSS string looks right.
 for(const [label,viewport]of []){
  const page=await browser.newPage({viewport});
  page.on('pageerror',error=>pageErrors.push({phase:'shapes-'+label,error:String(error)}));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase:'shapes-'+label,text:message.text()});});
  page.on('response',response=>{if(response.status()>=400)failures.push({phase:'shapes-'+label,url:response.url(),status:response.status()});});
  await page.goto(url+'?mode=shapes',{waitUntil:'networkidle'});await page.waitForSelector('#game-shelf .box');await page.waitForTimeout(600);
  const state=await snapshot(page),checks=[];
  assert.equal(state.games.length,2);
  for(let index=0;index<2;index++){
   if(index){await page.keyboard.press('ArrowRight');await page.waitForTimeout(600);}
   for(const role of ['front','back']){
    if(role==='back'){await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(600);}
    const face=state.games[index].faces[role];assert.equal(face.backgroundSize,'contain');
    const rect=await page.locator('#game-shelf .box').nth(index).locator('.'+role).evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
    const natural={width:face.naturalWidth,height:face.naturalHeight},scale=Math.min(rect.width/natural.width,rect.height/natural.height);
    const offset={x:rect.x+(rect.width-natural.width*scale)/2,y:rect.y+(rect.height-natural.height*scale)/2};
    const filename=`no-crop-${label}-shape-${index}-${role}.png`,pixels=await page.screenshot({path:resolve(out,filename),type:'png'});screenshots.push(filename);
    const {data,info}=await sharp(pixels).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const markers=[{name:'top-left',x:30,y:30,rgb:[255,0,0]},{name:'top-right',x:natural.width-30,y:30,rgb:[0,255,0]},{name:'bottom-left',x:30,y:natural.height-30,rgb:[0,0,255]},{name:'bottom-right',x:natural.width-30,y:natural.height-30,rgb:[255,255,0]}];
    const samples=markers.map(marker=>{const x=Math.round(offset.x+marker.x*scale),y=Math.round(offset.y+marker.y*scale);assert.ok(x>=0&&x<info.width&&y>=0&&y<info.height,'marker stays inside viewport');const i=(y*info.width+x)*info.channels,rgb=[...data.subarray(i,i+3)];assert.ok(rgb.every((value,c)=>Math.abs(value-marker.rgb[c])<=6),`${label} ${index} ${role} ${marker.name} visible: ${rgb}`);return{name:marker.name,pixel:{x,y},expected:marker.rgb,actual:rgb};});
    checks.push({game:state.games[index].id,role,natural,rect,scale,samples,fixtureOnly:true});
   }
   await page.getByRole('button',{name:'Turn over',exact:true}).click();await page.waitForTimeout(600);
  }
  phases.push({phase:'shapes-'+label,viewport,snapshot:state,checks,allFourCornersVisible:true});await page.close();
 }
 for(const mode of ['overrides','desktop']){
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',error=>pageErrors.push({phase:mode,error:String(error)}));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push({phase:mode,text:message.text()});});
  page.on('response',response=>{if(response.status()>=400)failures.push({phase:mode,url:response.url(),status:response.status()});});
  await page.goto(url+'?mode='+mode,{waitUntil:'networkidle'});await page.waitForSelector('#game-shelf .box');await page.waitForTimeout(300);
  const state=await snapshot(page),game=id=>state.games.find(g=>g.id===id);
  if(mode==='overrides'){
   assert.ok(game('shareware').faces.back.background.includes('/override-back.webp'));
   for(const role of ['front','spine'])assert.ok(game('shareware').faces[role].background.includes(GAME_BOXES.shareware[role]));
   assert.ok(game('quake').faces.front.background.includes(GAME_BOXES.quake.front),'corrupt optional local front falls back to normalized default');
   assert.equal(game('mod_corrupt_fixture').faces.front.placeholder,true,'corrupt local image without default becomes printed');
  }else{
   for(const id of Object.keys(GAME_BOXES)){assert.ok(game(id),id+' survives empty native art fixture');assert.equal(game(id).playable,false,id+' no data means no gameplay');for(const role of ['front','back','spine'])if(GAME_BOXES[id][role])assert.ok(game(id).faces[role].background.includes(GAME_BOXES[id][role]));}
   assert.deepEqual(state.ipcCalls.map(c=>c.cmd),['library_scan'],'empty packs cause no native reads or launches');
  }
  assert.equal(state.unexpectedOpen,null);await photo(page,mode);phases.push({phase:mode,snapshot:state});await page.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(failures,[]);
 const sourcePaths=['src/newer/ui/game_shelf.js','src/platform/desktop.js','src-tauri/src/library.rs','assets/boxes/manifest.json','tests/box_art_standardization_test.mjs','tests/box_art_contract_test.mjs','tests/game_shelf_test.js','docs/evidence/box-art-standardization-2026-10-20/derivation.json','docs/evidence/box-art-standardization-2026-10-20/owner-repair-browser-check.mjs','docs/evidence/box-art-standardization-2026-10-20/ai-edit-prompts.json','docs/evidence/box-art-standardization-2026-10-20/malice-correction-prompt.json','docs/evidence/box-art-standardization-2026-10-20/baseline-runtime-manifest.json'];
 receipt={...receipt,status:'PASS',completed:new Date().toISOString(),phases,screenshots,sourceHashes:Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')]))),pageErrors,consoleErrors,failedResponses:failures,requestPaths:[...new Set(requests)]};
}catch(error){receipt={...receipt,error:String(error),stack:error.stack,phases,screenshots,pageErrors,consoleErrors,failedResponses:failures};process.stderr.write(String(error.stack??error)+'\n');throw error;}
finally{try{await writeFile(resolve(out,receiptName),JSON.stringify(receipt,null,2)+'\n');}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}}
