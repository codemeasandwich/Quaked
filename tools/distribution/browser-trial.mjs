/** Artifact-level offline trial. Uses a fresh browser profile; never the owner's session. */
import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const target=process.argv[2]??pathToFileURL(resolve('dist/web/index.html')).href;
const reportPath=process.argv[3]??'dist/browser-trial.json';
const browser=await chromium.launch({channel:process.env.QUAKED_CHROME_CHANNEL??'chrome',headless:true,args:['--enable-precise-memory-info']});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();const errors=[],requests=[],consoleErrors=[];
page.on('pageerror',error=>errors.push(error.stack??String(error)));
page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
await context.route(/^https?:/,route=>{if(route.request().url()===target)return route.continue();requests.push(route.request().url());return route.abort();});
const started=Date.now();let result;
try{
 await page.goto(target,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>typeof window.Cbuf_AddText==='function',null,{timeout:180000});
 await page.waitForFunction(()=>window.cl?.worldmodel&&window.cls?.signon===4&&!document.getElementById('loading'),null,{timeout:180000});
 const scenarios=[];
 for(const [mode,map] of [[0,'e1m1'],[1,'e1m1'],[1,'e1m2']]){
  await page.evaluate(({mode,map})=>window.Cbuf_AddText(`stopdemo\nr_hdr ${mode}\nmap ${map}\n`),{mode,map});
  await page.waitForFunction(map=>window.cl?.worldmodel?.name===`maps/${map}.bsp`&&window.cls?.signon===4&&!window.cls.demoplayback,map,{timeout:120000});
  await page.waitForTimeout(5000);
  scenarios.push(await page.evaluate(()=>({map:cl.worldmodel.name,signon:cls.signon,active:sv.active,entities:sv.num_edicts,time:cl.time})));
 }
 result=await page.evaluate(()=>({title:document.title,canvas:!!document.querySelector('canvas'),metrics:globalThis.__QUAKED_DISTRIBUTION__?.metrics,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,body:document.body.innerText.slice(-1500)}));
 await page.screenshot({path:reportPath.replace(/\.json$/,'.png')});
 result.scenarios=scenarios;
 result.ok=errors.length===0&&consoleErrors.length===0&&requests.length===0&&result.canvas&&result.metrics?.missing.length===0&&scenarios.every(s=>s.active&&s.signon===4);
}catch(error){result={ok:false,failure:String(error)};}
finally{
 const receipt={target,elapsedMs:Date.now()-started,...result,errors,requests,consoleErrors};
 await mkdir(resolve(reportPath,'..'),{recursive:true});await writeFile(reportPath,JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));await browser.close();if(!receipt.ok)process.exitCode=1;
}
