/** Isolated source-profile browser trial; locally serves the installed Three version. */
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
const root=process.cwd(),output=resolve('dist/resource-layout-trial/source-trial.json');
const fixture=await mkdtemp(join(tmpdir(),'quaked-resource-source-'));
let browser,server;const errors=[],requiredFailures=[];let result;
const port=await new Promise((yes,no)=>{const socket=createServer();socket.once('error',no);socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>yes(p));});});
try{
 await mkdir(join(fixture,'shareware'));await copyFile('.distribution-cache/shareware.pak',join(fixture,'shareware/pak0.pak'));
 server=spawn('python3',['tools/serve.py',String(port),'--game-root',fixture],{cwd:root,stdio:'ignore'});
 const target=`http://127.0.0.1:${port}/`;
 for(let i=0;i<100;i++){try{if((await fetch(target)).ok)break;}catch{}await new Promise(yes=>setTimeout(yes,50));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:800}});
 await context.route('https://cdn.jsdelivr.net/npm/three@0.183.0/build/*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!['three.module.js','three.core.js'].includes(name))throw Error('Unexpected CDN module '+name);
  await route.fulfill({contentType:'application/javascript',body:await readFile(resolve('node_modules/three/build',name))});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
 page.on('response',res=>{if(res.status()>=400&&res.url().includes('/assets/')&&!res.url().endsWith('/newer.pak'))requiredFailures.push({url:res.url(),status:res.status()});});
 await page.goto(target,{waitUntil:'domcontentloaded',timeout:180000});
 await page.waitForFunction(()=>typeof window.Cbuf_AddText==='function',null,{timeout:180000});
 await page.waitForFunction(()=>window.cl?.worldmodel&&window.cls?.signon===4&&!document.getElementById('loading'),null,{timeout:180000});
 const scenarios=[];
 for(const mode of [0,1]){
  await page.evaluate(mode=>window.Cbuf_AddText(`stopdemo\nr_hdr ${mode}\nmap e1m1\n`),mode);
  await page.waitForFunction(()=>window.cl?.worldmodel?.name==='maps/e1m1.bsp'&&window.cls?.signon===4&&!window.cls.demoplayback,null,{timeout:120000});
  await page.waitForTimeout(1000);
  scenarios.push(await page.evaluate(()=>({map:cl.worldmodel.name,signon:cls.signon,active:sv.active,enhanced:!!window.renderer})));
 }
 await page.screenshot({path:output.replace('.json','.png')});
 result={ok:errors.length===0&&requiredFailures.length===0,scenarios,errors,requiredFailures,qualification:'Live source HTML, installed same-version Three modules served locally; no CDN availability or native-app claim.'};
}catch(e){result={ok:false,failure:String(e),errors,requiredFailures};}
finally{
 await browser?.close();if(server&&!server.killed)server.kill('SIGTERM');
 await rm(fixture,{recursive:true,force:true});await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));if(!result.ok)process.exitCode=1;
}
