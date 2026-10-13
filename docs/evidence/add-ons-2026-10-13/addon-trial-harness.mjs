// Runs the built desktop page (dist/desktop) in Playwright WebKit with a stand-in for the Tauri bridge, so the
// desktop profile's JavaScript paths can be exercised without the native window. Usage:
//   node deskharness.mjs <game> [webkit|chromium]
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createReadStream,statSync,openSync,readSync,closeSync} from 'node:fs';
import {extname} from 'node:path';
const W='/Users/bri/worktrees/Quaked/Dev/ci-gpu',J='/Users/bri/.claude/jobs/35bc46a9/tmp';
const require=createRequire(W+'/package.json');const {webkit,chromium}=require('@playwright/test');
const game=process.argv[2]??'quake',engine=process.argv[3]==='chromium'?chromium:webkit;
const PACKS=process.env.HOME+'/Library/Application Support/com.codemeasandwich.quaked/packs/assets';
import {readdirSync} from 'node:fs';
const FOLDERS={quake:'Quake',shareware:'shareware',hipnotic:'Scourge of Armagon',rogue:'Dissolution of Eternity',dopa:'Dimension of the Past',mg1:'Dimension of the Machine',ad:'Arcane Dimensions',quoth:'Quoth',malice:'Malice',xmen:'X-Men',aopfm_v2:'Abyss of Pandemonium',soe:'soul of evil'};
const library=[];for(const [g,f] of Object.entries(FOLDERS)){let names=[];try{names=readdirSync('/Users/bri/quaked/'+f);}catch{continue;}const by=new Map(names.map(n=>[n.toLowerCase(),n]));for(let n=0;n<=5;n++){const real=by.get(`pak${n}.pak`);if(!real)break;const path=`/Users/bri/quaked/${f}/${real}`;library.push({token:`${g}/pak${n}.pak`,game:g,name:`pak${n}.pak`,path,bytes:statSync(path).size,modified:'x'});}}
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wasm':'application/wasm'};
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://x');let path=decodeURIComponent(url.pathname);
 res.setHeader('Access-Control-Allow-Origin','*');
 if(path.startsWith('/fs/'))path=path.slice(3);else path=W+'/dist/desktop'+(path==='/'?'/index.html':path);
 let size;try{size=statSync(path).size;}catch{res.writeHead(404).end();return;}
 res.setHeader('Content-Type',types[extname(path)]??'application/octet-stream');
 const range=/bytes=(\d+)-(\d+)/.exec(req.headers.range??'');
 if(range){const s=+range[1],e=Math.min(+range[2],size-1);res.writeHead(206,{'Content-Range':`bytes ${s}-${e}/${size}`,'Content-Length':e-s+1});createReadStream(path,{start:s,end:e}).pipe(res);}
 else{res.writeHead(200,{'Content-Length':size});createReadStream(path).pipe(res);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:800}});
const logs=[],all=[];page.on('console',m=>{const t=m.text();all.push(t);if(m.type()==='error'||m.type()==='warning'||/fallback|insecure|error/i.test(t))logs.push(m.type()+': '+t.slice(0,300));});page.on('pageerror',e=>logs.push('PAGEERROR '+e.message));
await page.exposeFunction('__harnessRead',(token,offset,length)=>{const p=library.find(x=>x.token===token);const fd=openSync(p.path,'r');const b=Buffer.alloc(Math.max(0,Math.min(length,p.bytes-offset)));readSync(fd,b,0,b.length,offset);closeSync(fd);return b.toString('base64');});
await page.route(/^http:\/\/asset\.localhost\//,async route=>{const path=decodeURIComponent(new URL(route.request().url()).pathname.slice(1));try{statSync(path);}catch{await route.fulfill({status:404,headers:{'Access-Control-Allow-Origin':base}});return;}await route.fulfill({path,headers:{'Access-Control-Allow-Origin':base,'Content-Type':types[extname(path)]??'application/octet-stream'}});});
await page.addInitScript(({base,library,PACKS,W})=>{
 let next=1;
 window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
 window.__TAURI_INTERNALS__={
  transformCallback(cb){const id=next++;window['_'+id]=cb;return id;},
  convertFileSrc(path){return 'http://asset.localhost/'+encodeURIComponent(path);},
  metadata:{currentWindow:{label:'main'},currentWebview:{label:'main',windowLabel:'main'}},
  async invoke(cmd,args){
   switch(cmd){
    case 'distribution_resources':return W+'/dist/desktop-assets';
    case 'library_scan':return {root:'/Users/bri/quaked',packs:library,error:null};
    case 'library_read':{const b64=await window.__harnessRead(args.token,args.offset,args.length);return Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer;}
    case 'packs_ensure':return PACKS;
    case 'plugin:event|listen':return next++;
    case 'plugin:event|unlisten':return null;
    default:throw 'harness: unhandled '+cmd;
   }
  }
 };
},{base,library,PACKS,W});
await page.goto(`${base}/index.html?game=${game}`);
const t0=Date.now();
const ok=await page.waitForFunction(()=>window.cls?.signon===4,null,{timeout:180000}).then(()=>true).catch(()=>false);
console.log('first signon',ok,Math.round((Date.now()-t0)/1000)+'s',JSON.stringify(await page.evaluate(()=>({map:window.cl?.worldmodel?.name,demo:window.cls?.demoplayback,body:document.body.innerText.slice(0,300)}))));
if(!ok){console.log(logs.slice(0,30).join('\n'));await browser.close();server.close();process.exit(1);}
const maps=(process.env.MAPS??'start').split(',').filter(Boolean),results=[];
for(const map of maps){
 logs.length=0;const start=Date.now();
 await page.evaluate(m=>{window.__prevTime=window.sv?.active?window.sv.time:-1;window.Cbuf_AddText(`stopdemo\nmap ${m}\n`);},map);
 const loaded=await page.waitForFunction(m=>window.cl?.worldmodel?.name===`maps/${m}.bsp`&&window.cls.signon===4&&window.sv?.active&&!window.cls.demoplayback&&(window.__prevTime<0||window.sv.time<window.__prevTime),map,{timeout:Number(process.env.LOADWAIT??120000)}).then(()=>true).catch(()=>false);
 let played=false,time=null;
 if(loaded){played=await page.waitForFunction(()=>window.cl.time>=3,null,{timeout:120000}).then(()=>true).catch(()=>false);const t=await page.evaluate(()=>window.cl.time);await page.waitForTimeout(3000);time=[t,await page.evaluate(()=>window.cl.time)];}
 const st=await page.evaluate(()=>({map:window.cl?.worldmodel?.name,signon:window.cls?.signon,edicts:window.sv?.num_edicts,models:window.cl?.model_precache?.filter?.(Boolean).length}));
 const r={map,loaded,played,advancing:!!time&&time[1]>time[0]+1,secs:Math.round((Date.now()-start)/1000),...st,errors:logs.filter(l=>/PAGEERROR|error/i.test(l)).slice(0,4)};results.push(r);console.log(JSON.stringify(r));
 if(process.env.SHOTS)await page.screenshot({path:`${process.env.SHOTS}/${game}-${map}.png`}).catch(()=>{});
}
if(process.env.LEVELSELECT){const box=await page.locator('canvas').first().boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);for(const k of process.env.LEVELSELECT.split(',')){if(k.startsWith('cmd:'))await page.evaluate(c=>window.Cbuf_AddText(c+'\n'),k.slice(4));else await page.keyboard.press(k);await page.waitForTimeout(500);}await page.waitForTimeout(800);await page.screenshot({path:`${process.env.SHOTS??J}/${game}-levelselect.png`});}
console.log('SUMMARY',results.filter(r=>r.loaded&&r.played&&r.advancing&&!r.errors.length).length,'/',results.length);
await browser.close();server.close();
