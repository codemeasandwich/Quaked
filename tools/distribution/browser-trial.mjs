/** Artifact-level offline trial. Uses a fresh browser profile; never the owner's session. */
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const target=process.argv[2]??pathToFileURL(resolve('dist/web/index.html')).href;
const reportPath=process.argv[3]??'dist/browser-trial.json';
// GitHub's Linux runner has no supported hardware GPU. Select Chromium's documented
// CPU WebGL backend explicitly for this isolated, network-blocked artifact trial:
// https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
// This changes the test browser, never game settings, features or readiness gates.
const softwareDefault=process.platform==='linux'&&process.env.CI==='true';
const backend=process.env.QUAKED_WEBGL_BACKEND??(softwareDefault?'swiftshader':'default');
if(!['default','swiftshader'].includes(backend))throw Error('QUAKED_WEBGL_BACKEND must be default or swiftshader');
const channel=process.env.QUAKED_CHROME_CHANNEL??'chrome';
const args=['--enable-precise-memory-info',...(backend==='swiftshader'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])];
const started=Date.now(),errors=[],requests=[],consoleErrors=[],consoleTail=[],requestFailures=[],phases=[],samples=[];
let browser,context,page,result,phase='launch',sampler,finished=false;
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
async function snapshot(){
 if(!page||page.isClosed())return {elapsedMs:elapsed(),phase,pageClosed:true};
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
  return {elapsedMs:elapsed(),phase,...state};
 }catch(error){return {elapsedMs:elapsed(),phase,diagnosticError:String(error)};}
}
async function sample(){
 if(finished)return;
 tail(samples,await snapshot(),30);
 if(!finished)sampler=setTimeout(sample,20000);
}
try{
 await mkdir(resolve(reportPath,'..'),{recursive:true});
 browser=await step('launch',()=>chromium.launch({channel,headless:true,args}));
 context=await browser.newContext({viewport:{width:1280,height:800}});
 page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.stack??String(error)));
 page.on('crash',()=>errors.push('Browser page crashed'));
 page.on('console',msg=>{const text=msg.text();tail(consoleTail,{elapsedMs:elapsed(),type:msg.type(),text:text.slice(0,4000)});if(msg.type()==='error')consoleErrors.push(text);});
 page.on('requestfailed',request=>tail(requestFailures,{elapsedMs:elapsed(),url:request.url().slice(0,1000),error:request.failure()?.errorText}));
 await context.route(/^https?:/,route=>{if(route.request().url()===target)return route.continue();requests.push(route.request().url());return route.abort();});
 sampler=setTimeout(sample,20000);
 await step('navigation',()=>page.goto(target,{waitUntil:'domcontentloaded',timeout:180000}));
 await step('engine-initialization',()=>page.waitForFunction(()=>typeof window.Cbuf_AddText==='function',null,{timeout:180000}));
 await step('initial-demo',()=>page.waitForFunction(()=>window.cl?.worldmodel&&window.cls?.signon===4&&!document.getElementById('loading'),null,{timeout:180000}));
 tail(samples,await snapshot(),30);
 const scenarios=[];
 for(const [mode,map] of [[0,'e1m1'],[1,'e1m1'],[1,'e1m2']]){
  await step(`${mode?'newer':'classic'}-${map}`,async()=>{
   await page.evaluate(({mode,map})=>window.Cbuf_AddText(`stopdemo\nr_hdr ${mode}\nmap ${map}\n`),{mode,map});
   await page.waitForFunction(map=>window.cl?.worldmodel?.name===`maps/${map}.bsp`&&window.cls?.signon===4&&!window.cls.demoplayback,map,{timeout:120000});
   await page.waitForTimeout(5000);
   scenarios.push(await page.evaluate(()=>({map:cl.worldmodel.name,signon:cls.signon,active:sv.active,entities:sv.num_edicts,time:cl.time})));
  });
 }
 result=await page.evaluate(()=>({title:document.title,canvas:!!document.querySelector('canvas'),metrics:globalThis.__QUAKED_DISTRIBUTION__?.metrics,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,body:document.body.innerText.slice(-1500)}));
 result.scenarios=scenarios;
 result.ok=errors.length===0&&consoleErrors.length===0&&requests.length===0&&result.canvas&&result.metrics?.missing.length===0&&scenarios.every(s=>s.active&&s.signon===4);
}catch(error){result={ok:false,failure:String(error),failedPhase:phase};}
finally{
 finished=true;clearTimeout(sampler);
 const diagnostic=await snapshot();let screenshot=null,screenshotError=null,gpu=null;
 if(page&&!page.isClosed())try{screenshot=reportPath.replace(/\.json$/,'.png');await page.screenshot({path:screenshot,timeout:10000});}catch(error){screenshotError=String(error);}
 if(browser)try{gpu=await bounded(async()=>{const session=await browser.newBrowserCDPSession();try{return (await session.send('SystemInfo.getInfo')).gpu;}finally{await session.detach();}},'browser GPU diagnostics');}catch(error){gpu={diagnosticError:String(error)};}
 if(result.ok&&(screenshotError||errors.length||consoleErrors.length||requests.length||diagnostic.metrics?.missing?.length)){
  result.ok=false;
  if(screenshotError){result.failure=screenshotError;result.failedPhase='screenshot';}
 }
 const receipt={target,elapsedMs:elapsed(),...result,environment:{platform:process.platform,channel,backend,args,browserVersion:browser?.version()??null},
  phases,samples,diagnostic,gpu,screenshot,screenshotError,errors,requests,consoleErrors,consoleTail,requestFailures};
 await mkdir(resolve(reportPath,'..'),{recursive:true});await writeFile(reportPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({target,ok:receipt.ok,elapsedMs:receipt.elapsedMs,failedPhase:receipt.failedPhase,reportPath}));
 await browser?.close();if(!receipt.ok)process.exitCode=1;
}
