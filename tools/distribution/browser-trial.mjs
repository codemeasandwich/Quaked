/** Artifact-level offline trial. Uses a fresh browser profile; never the owner's session. */
import {chromium} from '@playwright/test';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createServer as createSecureServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
// Modes (docs/distribution.md): 'http' (default) serves dist/web from a local server, as
// GitHub Pages does; 'file' opens index.html from disk, as a downloaded copy is, and answers
// its GitHub Pages data requests from the same local files. An explicit URL is used as given.
const site=resolve(process.env.QUAKED_TRIAL_SITE??'dist/web'),mode=process.env.QUAKED_TRIAL_MODE??'http';
if(!['http','file'].includes(mode))throw Error('QUAKED_TRIAL_MODE must be http or file');
const types={'.html':'text/html; charset=utf-8','.bin':'application/octet-stream','.js':'text/javascript','.json':'application/json'};
// QUAKED_TRIAL_TAMPER=1 flips one byte of the first data part served: the page must then refuse to start.
const tamper=process.env.QUAKED_TRIAL_TAMPER==='1';let tampered=null;
async function siteFile(pathname){let decoded;try{decoded=decodeURIComponent(pathname);}catch{return null;}const path=resolve(site,'.'+decoded);if(!path.startsWith(site+'/'))return null;try{let body=await readFile(path);if(tamper&&extname(path)==='.bin'&&(tampered===null||tampered===path)){tampered=path;body=Buffer.from(body);body[body.length>>1]^=1;}return {body,type:types[extname(path)]??'application/octet-stream'};}catch{return null;}}
let server=null,target=process.argv[2]||undefined;
const dataBase=(await readFile(resolve(site,'index.html'),'utf8').catch(()=>'')).match(/"dataBase":"([^"]+)"/)?.[1]??null;
// Serves the site as GitHub Pages does (same files, CORS open); `prefix` is the Pages path.
const serve=prefix=>async(request,response)=>{const pathname=new URL(request.url,'http://127.0.0.1').pathname;const file=pathname.startsWith(prefix)?await siteFile('/'+pathname.slice(prefix.length).replace(/^$|\/$/,'index.html')):null;if(!file){response.writeHead(404).end();return;}response.writeHead(200,{'content-type':file.type,'content-length':file.body.length,'access-control-allow-origin':'*','cache-control':'max-age=600','etag':'"'+createHash('sha1').update(file.body).digest('hex')+'"'}).end(file.body);};
const resolverArgs=[];
if(!target&&mode==='http'){
 server=createServer(serve('/'));
 await new Promise(done=>server.listen(0,'127.0.0.1',done));target=`http://127.0.0.1:${server.address().port}/index.html`;
}else if(!target&&dataBase){
 // A downloaded copy: the page is a file and its data comes from the Pages host. Chrome
 // resolves that host to a local https server (throwaway certificate) holding the same files,
 // so the real cross-origin, integrity-checked fetch runs without the network.
 const pages=new URL(dataBase),dir=await mkdtemp(resolve(tmpdir(),'quaked-trial-tls-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN='+pages.hostname,'-keyout',resolve(dir,'key.pem'),'-out',resolve(dir,'cert.pem')],{stdio:'ignore'});
 server=createSecureServer({key:await readFile(resolve(dir,'key.pem')),cert:await readFile(resolve(dir,'cert.pem'))},serve(pages.pathname));await rm(dir,{recursive:true,force:true});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 resolverArgs.push(`--host-resolver-rules=MAP ${pages.hostname} 127.0.0.1:${server.address().port}`,'--ignore-certificate-errors');
}
target??=pathToFileURL(resolve(site,'index.html')).href;
const reportPath=process.argv[3]??'dist/browser-trial.json';
// CI runs this trial on a macOS runner with Chrome's default WebGL backend; Linux
// has no supported hardware GPU and its software renderer cannot start the game
// within the gates (docs/distribution.md). A Linux CI run still selects Chromium's
// documented CPU backend so its receipt is diagnosable:
// https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
// This changes the test browser, never game settings, features or readiness gates.
const softwareDefault=process.platform==='linux'&&process.env.CI==='true';
const backend=process.env.QUAKED_WEBGL_BACKEND??(softwareDefault?'swiftshader':'default');
if(!['default','swiftshader'].includes(backend))throw Error('QUAKED_WEBGL_BACKEND must be default or swiftshader');
const channel=process.env.QUAKED_CHROME_CHANNEL??'chrome';
const args=[...resolverArgs,'--enable-precise-memory-info',...(backend==='swiftshader'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])];
const started=Date.now(),errors=[],requests=[],consoleErrors=[],consoleTail=[],requestFailures=[],phases=[],samples=[];
let browser,context,page,result,phase='launch',sampler,finished=false,processSession=null,peakBrowserRss=0;
const elapsed=()=>Date.now()-started;
function tail(list,value,limit=200){list.push(value);if(list.length>limit)list.shift();}
async function bounded(operation,label,ms=5000){
 let timer;
 try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}
 finally{clearTimeout(timer);}
}
async function step(name,operation){
 phase=name;const entry={phase:name,startedMs:elapsed()};phases.push(entry);
 try{const value=await operation();entry.completedMs=elapsed();return value;}
 catch(error){entry.failedMs=elapsed();throw error;}
}
// Whole-browser memory: summed RSS of Chrome's process tree. Heap figures alone
// miss the renderer's HTML text, the GPU process and blob storage.
async function browserMemory(){
 if(!processSession||process.platform==='win32')return null;
 try{
  const {processInfo}=await bounded(()=>processSession.send('SystemInfo.getProcessInfo'),'browser process list');
  const {stdout}=await promisify(execFile)('ps',['-A','-o','pid=,ppid=,rss=']);
  const rows=stdout.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
  const tree=new Set(processInfo.map(entry=>entry.id).filter(id=>id>1));let grew=true;
  while(grew){grew=false;for(const [pid,ppid] of rows)if(tree.has(ppid)&&!tree.has(pid)){tree.add(pid);grew=true;}}
  const rssBytes=rows.filter(([pid])=>tree.has(pid)).reduce((sum,[,,rss])=>sum+rss*1024,0);
  peakBrowserRss=Math.max(peakBrowserRss,rssBytes);
  return {processes:tree.size,rssBytes};
 }catch(error){return {diagnosticError:String(error)};}
}
async function snapshot(){
 const browserRss=await browserMemory();
 if(!page||page.isClosed())return {elapsedMs:elapsed(),phase,pageClosed:true,browserRss};
 try{
  const state=await bounded(()=>page.evaluate(()=>{
   const renderer=window.renderer,gl=renderer?.getContext?.(),loading=document.getElementById('loading');
   const debug=gl?.getExtension('WEBGL_debug_renderer_info');
   const glValue=name=>gl&&name!==undefined?gl.getParameter(name):null;
   const canvas=document.querySelector('canvas');
   const programs=renderer?.info?.programs??[];
   return {
    url:location.href,title:document.title,readyState:document.readyState,visibility:document.visibilityState,
    engine:{commandReady:typeof window.Cbuf_AddText==='function',signon:window.cls?.signon??null,
     demo:window.cls?.demoplayback??null,clientState:window.cls?.state??null,map:window.cl?.worldmodel?.name??null,
     clientTime:window.cl?.time??null,serverActive:window.sv?.active??null,serverTime:window.sv?.time??null},
    loading:loading?{text:loading.innerText.slice(-1000),progress:loading.getAttribute('aria-valuenow'),
     display:getComputedStyle(loading).display,opacity:getComputedStyle(loading).opacity}:null,
    canvas:canvas?{width:canvas.width,height:canvas.height}:null,
    renderer:renderer?{info:renderer.info?.render,memory:renderer.info?.memory,programs:programs.length,
     failedPrograms:programs.filter(program=>program.diagnostics?.runnable===false).map(program=>({name:program.name,diagnostics:program.diagnostics})).slice(0,10)}:null,
    webgl:gl?{contextLost:gl.isContextLost(),version:glValue(gl.VERSION),vendor:glValue(gl.VENDOR),renderer:glValue(gl.RENDERER),
     unmaskedVendor:debug?glValue(debug.UNMASKED_VENDOR_WEBGL):null,unmaskedRenderer:debug?glValue(debug.UNMASKED_RENDERER_WEBGL):null,
     parallelShaderCompile:!!gl.getExtension('KHR_parallel_shader_compile'),maxTextureSize:glValue(gl.MAX_TEXTURE_SIZE)}:null,
    metrics:globalThis.__QUAKED_DISTRIBUTION__?.metrics??null,
    memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null,
    images:{total:document.images.length,incomplete:Array.from(document.images).filter(image=>!image.complete).length},
    body:document.body?.innerText.slice(-1500)??''
   };
  }),'engine diagnostic snapshot');
  return {elapsedMs:elapsed(),phase,browserRss,...state};
 }catch(error){return {elapsedMs:elapsed(),phase,browserRss,diagnosticError:String(error)};}
}
async function sample(){
 if(finished)return;
 tail(samples,await snapshot(),30);
 if(!finished)sampler=setTimeout(sample,20000);
}
let targetSha256=null;
// Only a file this trial actually served or opened: an explicit remote URL records none.
try{if(target.startsWith('file:')||server&&target.startsWith('http://127.0.0.1:'))targetSha256=createHash('sha256').update(await readFile(target.startsWith('file:')?fileURLToPath(target):resolve(site,'index.html'))).digest('hex');}catch{}
try{
 await mkdir(resolve(reportPath,'..'),{recursive:true});
 browser=await step('launch',()=>chromium.launch({channel,headless:true,args}));
 // Memory diagnostics never decide the trial: a failed session only loses browserRss.
 try{processSession=await bounded(()=>browser.newBrowserCDPSession(),'browser process session');}catch(error){processSession=null;tail(consoleTail,{elapsedMs:elapsed(),type:'diagnostic',text:'browser process session: '+String(error)});}
 context=await browser.newContext({viewport:{width:1280,height:800},ignoreHTTPSErrors:resolverArgs.length>0});
 page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.stack??String(error)));
 page.on('crash',()=>errors.push('Browser page crashed'));
 page.on('console',msg=>{const text=msg.text()+(msg.type()==='error'&&msg.location()?.url?` @ ${msg.location().url}`:'');tail(consoleTail,{elapsedMs:elapsed(),type:msg.type(),text:text.slice(0,4000)});if(msg.type()==='error')consoleErrors.push(text);});
 page.on('requestfailed',request=>tail(requestFailures,{elapsedMs:elapsed(),url:request.url().slice(0,1000),error:request.failure()?.errorText}));
 // Only the page's own site is reachable; a file:// page's GitHub Pages data requests are
 // answered from the local site, everything else is recorded and refused.
 const origin=target.startsWith('http')?new URL(target).origin+'/':null;
 await context.route(/^https?:/,async route=>{
  const url=route.request().url();
  if(url===target||origin&&url.startsWith(origin))return route.continue();
  // A page opened from disk fetches its data from the Pages host: mapped to the local stand-in
  // in file mode, or the real site when an explicit downloaded copy is trialled.
  if(dataBase&&target.startsWith('file:')&&url.startsWith(dataBase+'data/'))return route.continue();
  requests.push(url);return route.abort();
 });
 sampler=setTimeout(sample,20000);
 await step('navigation',()=>page.goto(target,{waitUntil:'domcontentloaded',timeout:180000}));
 if(tamper){
  // The trust boundary: one flipped byte in one data part must stop the page before the engine runs.
  await step('refuses-tampered-data',()=>page.waitForFunction(()=>/Quaked could not start/.test(document.body?.innerText??''),null,{timeout:120000}));
  const state=await page.evaluate(()=>({body:document.body.innerText.slice(0,600),engineStarted:typeof window.Cbuf_AddText==='function'}));
  result={ok:/could not download or verify/.test(state.body)&&!state.engineStarted,tamper:{file:tampered,...state}};
 }else{
  await step('engine-initialization',()=>page.waitForFunction(()=>typeof window.Cbuf_AddText==='function',null,{timeout:180000}));
  await step('initial-demo',()=>page.waitForFunction(()=>window.cl?.worldmodel&&window.cls?.signon===4&&!document.getElementById('loading'),null,{timeout:180000}));
  tail(samples,await snapshot(),30);
  const scenarios=[];
  for(const [mode,map] of [[0,'e1m1'],[1,'e1m1'],[1,'e1m2']]){
   await step(`${mode?'newer':'classic'}-${map}`,async()=>{
    // The map command runs on a later host frame, and two scenarios load e1m1: remember the
    // running level's server time so the waits below cannot pass on the level being replaced
    // (a new server starts at 1 s; the previous one is past 3 s).
    await page.evaluate(({mode,map})=>{window.__trialPreviousServerTime=window.sv?.active?window.sv.time:-1;window.Cbuf_AddText(`stopdemo\nr_hdr ${mode}\nmap ${map}\n`);},{mode,map});
    await page.waitForFunction(map=>window.cl?.worldmodel?.name===`maps/${map}.bsp`&&window.cls?.signon===4&&!window.cls.demoplayback&&(window.__trialPreviousServerTime<0||window.sv.time<window.__trialPreviousServerTime),map,{timeout:120000});
    // Signed on is not playing: a Newer level's welcome hold keeps the loading plaque up and
    // game time frozen near 1 s until its assets are ready. Require about 2 s of play, then
    // further progress over a 5 s settle (at least 1 s of game time, so a slow GPU still passes).
    await page.waitForFunction(()=>window.sv?.active&&window.cl.time>=3,null,{timeout:120000});
    const startTime=await page.evaluate(()=>cl.time);
    await page.waitForTimeout(5000);
    scenarios.push(await page.evaluate(startTime=>({map:cl.worldmodel.name,signon:cls.signon,active:sv.active,entities:sv.num_edicts,startTime,time:cl.time}),startTime));
   });
  }
  // The hub jingle and the first explosion textures must be resident before control, not
  // background placeholders: the chime would be silent and fireballs would draw square.
  await step( 'startup-assets', () => page.evaluate( () => {

   const paths = [ 'assets/sounds/quake1newereGame_firstLevelEasyMidHard.mp3', 'newer/effects/fireball/smoke-atlas.png', 'newer/effects/fireball/noise.png' ];
   for ( const path of paths ) if ( ! __QUAKED_DISTRIBUTION__.has( path ) ) throw Error( 'required startup asset unavailable: ' + path );

  } ) );
  // Background parts are allowed to arrive after play starts, but the verification waits for
  // them so the images checked below are the real re-encoded bytes, not pending placeholders.
  await step('background-data',()=>page.waitForFunction(()=>globalThis.__QUAKED_DISTRIBUTION__?.metrics?.backgroundComplete===true,null,{timeout:180000}));
  // The Bestiary's images, re-encoded for the web build (web_images.mjs), must each decode at a
  // real size through the distribution's own resolver; then the Bestiary itself is opened.
  const bestiary=await step('bestiary-images',()=>page.evaluate(async()=>{
   const spec=JSON.parse(document.getElementById('quaked-assets')?.textContent??'{}'),paths=Object.keys(spec.files??{}).filter(path=>/^newer\/bestiary\/.+\.(png|webp)$/.test(path)),failed=[];let decoded=0;
   for(const path of paths){const image=new Image();image.src=__QUAKED_DISTRIBUTION__.url(path);try{await image.decode();if(image.naturalWidth>0&&image.naturalHeight>0)decoded++;else failed.push(path);}catch(error){failed.push(path+': '+error.message);}}
   return {checked:paths.length,decoded,failed:failed.slice(0,10)};
  }));
  // Assets of games whose packs the web does not ship (docs/per-game-packs-design-2026-10-13.md)
  // must be reported unavailable, failing like a network error that loaders already handle,
  // never throwing or counting as a packaging fault.
  const consoleBefore=consoleErrors.length;
  const unshipped=await step('unshipped-assets',()=>page.evaluate(async()=>{
   const spec=JSON.parse(document.getElementById('quaked-assets')?.textContent??'{}'),all=Object.entries(spec.files??{}).filter(([,entry])=>entry.unshipped).map(([path])=>path);
   const sample=[all.find(path=>/\.(png|webp|jpg)$/.test(path)),all.find(path=>!/\.(png|webp|jpg)$/.test(path))].filter(Boolean),failed=[],urls=[];
   for(const path of sample){
    const d=__QUAKED_DISTRIBUTION__,url=d.url(path);urls.push(url);
    if(d.has(path))failed.push(path+': has() is true');
    let fetched=false;try{await fetch(url);fetched=true;}catch{}
    if(fetched)failed.push(path+': fetch succeeded');
    const image=new Image();image.src=url;let decoded=false;try{await image.decode();decoded=true;}catch{}
    if(decoded)failed.push(path+': image decoded');
   }
   return {count:all.length,checked:sample.length,failed,urls,unavailable:__QUAKED_DISTRIBUTION__.metrics.unavailable.length};
  }));
  // Chrome logs each refused load; those lines are this check's own, so they are kept apart.
  await page.waitForTimeout(500);unshipped.consoleErrors=consoleErrors.splice(consoleBefore).filter(text=>{const own=unshipped.urls.some(url=>text.includes(url));if(!own)consoleErrors.push(text);return own;});
  await step('bestiary-open',async()=>{await page.evaluate(()=>window.Cbuf_AddText('menu_bestiary\n'));await page.waitForTimeout(4000);await page.screenshot({path:reportPath.replace(/\.json$/,'-bestiary.png'),timeout:10000});});
  result=await page.evaluate(()=>({title:document.title,canvas:!!document.querySelector('canvas'),metrics:globalThis.__QUAKED_DISTRIBUTION__?.metrics,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,body:document.body.innerText.slice(-1500)}));
  result.scenarios=scenarios;result.bestiary=bestiary;result.unshipped=unshipped;
  result.ok=errors.length===0&&consoleErrors.length===0&&requests.length===0&&result.canvas&&result.metrics?.missing.length===0&&scenarios.every(s=>s.active&&s.signon===4&&s.time>=s.startTime+1)&&bestiary.checked>0&&bestiary.decoded===bestiary.checked&&!result.metrics?.backgroundError&&unshipped.count>0&&unshipped.checked>0&&unshipped.failed.length===0;
 }
}catch(error){result={ok:false,failure:String(error),failedPhase:phase};}
finally{
 finished=true;clearTimeout(sampler);
 const diagnostic=await snapshot();
 if(processSession)await bounded(()=>processSession.detach(),'browser process session detach').catch(()=>{});let screenshot=null,screenshotError=null,gpu=null;
 if(page&&!page.isClosed())try{screenshot=reportPath.replace(/\.json$/,'.png');await page.screenshot({path:screenshot,timeout:10000});}catch(error){screenshotError=String(error);}
 if(browser)try{gpu=await bounded(async()=>{const session=await browser.newBrowserCDPSession();try{return (await session.send('SystemInfo.getInfo')).gpu;}finally{await session.detach();}},'browser GPU diagnostics');}catch(error){gpu={diagnosticError:String(error)};}
 if(result.ok&&!tamper&&(screenshotError||errors.length||consoleErrors.length||requests.length||diagnostic.metrics?.missing?.length)){
  result.ok=false;
  if(screenshotError){result.failure=screenshotError;result.failedPhase='screenshot';}
 }
 // The final snapshot can fail on a crashed or stalled page; fall back to the newest sample.
 const webgl=diagnostic.webgl??[...samples].reverse().find(entry=>entry.webgl)?.webgl;
 const webglRenderer=webgl?.unmaskedRenderer??webgl?.renderer??null;
 const receipt={target,mode:target.startsWith('file:')?'file':'http',targetSha256,elapsedMs:elapsed(),...result,webglRenderer,
  softwareWebGL:webglRenderer?/swiftshader|llvmpipe|software/i.test(webglRenderer):null,
  browserMemory:{peakRssBytes:peakBrowserRss||null,final:diagnostic.browserRss??null},environment:{platform:process.platform,channel,backend,args,browserVersion:browser?.version()??null},
  phases,samples,diagnostic,gpu,screenshot,screenshotError,errors,requests,consoleErrors,consoleTail,requestFailures};
 await mkdir(resolve(reportPath,'..'),{recursive:true});await writeFile(reportPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({target,ok:receipt.ok,elapsedMs:receipt.elapsedMs,failedPhase:receipt.failedPhase,webglRenderer,peakBrowserRssBytes:peakBrowserRss||null,reportPath}));
 await browser?.close();server?.close();if(!receipt.ok)process.exitCode=1;
}
