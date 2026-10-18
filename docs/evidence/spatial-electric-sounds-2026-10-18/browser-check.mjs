import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from '/Users/bri/SOURCE/Quaked/node_modules/playwright/index.mjs';
const root='/Users/bri/SOURCE/Quaked/.worktrees/faces-cleanup';
const output=root+'/docs/evidence/spatial-electric-sounds-2026-10-18';
const mime={'.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg'};
const server=createServer(async(req,res)=>{try{
 if(req.url==='/proof'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Player event audio trial</title><script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js"}}</script>');return;}
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root+'/'))throw Error('path');res.setHeader('content-type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));
 }catch(e){res.statusCode=404;res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[];
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:'+server.address().port+'/proof');
 const evidence=await page.evaluate(async()=>{
 await import('/src/engine/render/gl_rsurf.js');await import('/src/newer/install.js');
 const env=await import('/src/newer/sound/s_electricsounds.js');const decoded=[];const decoder=new AudioContext();let buffer;
 for(const [clip,url] of Object.entries(env.ELECTRIC_TRACK_URLS)){const data=await decoder.decodeAudioData(await(await fetch(url)).arrayBuffer());decoded.push({clip,duration:data.duration,channels:data.numberOfChannels,sampleRate:data.sampleRate});if(clip==='3')buffer=data;}
 await decoder.close();
 const {cl,cls,cl_entities,ca_connected}=await import('/src/engine/client/client.js');const {sv}=await import('/src/engine/server/server.js');
 const vars=await import('/src/engine/common/cvar.js');const {r_hdr}=await import('/src/newer/render/gl_post.js');vars.Cvar_RegisterVariable(r_hdr);vars.Cvar_SetValue('r_hdr',1);
 const keys=await import('/src/engine/client/keys.js');keys.set_key_dest(keys.key_game);
 const dma=await import('/src/engine/sound/snd_dma.js');dma.S_Init();await dma.S_GetAudioContext().resume();const sound=await import('/src/engine/sound/sound.js');sound.volume.value=1;sound.listener_origin.fill(0);sound.listener_right.set([0,1,0]);
 cl.worldmodel={name:'maps/electric-browser-fixture.bsp'};cl.stats[0]=100;cl.time=10;cl.paused=false;cl.intermission=0;cl.viewentity=1;cls.state=ca_connected;cls.signon=4;cls.demoplayback=false;sv.active=false;cl_entities[2].origin.set([0,120,0]);
 env.S_ElectricSoundsReset();env.S_ElectricEvent({kind:'charge',actor:'shambler',entity:2,time:cl.time,source:[0,120,0]});env.S_UpdateElectricSounds();await new Promise(r=>setTimeout(r,400));cl.time+=.4;env.S_UpdateElectricSounds();const right=env.S_GetElectricSoundsStatus();const v=right.voices.find(v=>v.role==='charge');if(!v?.playing||v.error||v.pan<=0||v.gain<=0)throw Error(JSON.stringify(right));
 sound.listener_right.set([0,-1,0]);cl.time+=.01;env.S_UpdateElectricSounds();const left=env.S_GetElectricSoundsStatus();const w=left.voices.find(v=>v.role==='charge');if(w.pan>=0)throw Error('turn did not reverse stereo');
 async function render(pan,gain){const c=new OfflineAudioContext(2,buffer.length,buffer.sampleRate),src=c.createBufferSource(),mono=c.createGain(),p=c.createStereoPanner();src.buffer=buffer;mono.channelCount=1;mono.channelCountMode='explicit';mono.channelInterpretation='speakers';mono.gain.value=gain;p.pan.value=pan;src.connect(mono).connect(p).connect(c.destination);src.start();const data=await c.startRendering();return [0,1].map(i=>Math.sqrt(data.getChannelData(i).reduce((n,x)=>n+x*x,0)/data.length));}
 const energyRight=await render(v.pan,v.gain),energyLeft=await render(w.pan,w.gain);if(!(energyRight[1]>energyRight[0]*5&&energyLeft[0]>energyLeft[1]*5))throw Error('actual stereo energy failed');
 sound.listener_origin.set([1000,0,0]);cl.time+=.01;env.S_UpdateElectricSounds();const far=env.S_GetElectricSoundsStatus();if(far.voices[0].gain>=v.gain)throw Error('distance did not attenuate');
 env.S_ElectricSoundsShutdown();dma.S_Shutdown();return {passed:true,decoded,right,left,far,energyRight,energyLeft,scope:'Real Chrome decoding of all 12 full original recordings; real streamed charge playback through production adapter and SFX spatializer; complete-file OfflineAudioContext stereo energy verifies native mono-point panning. Controlled client metadata here; separate native QC tests prove event provenance. No claim of owner listening or a played game session.'};
 });
 evidence.errors=errors;if(errors.length)throw Error(JSON.stringify(errors));await writeFile(output+'/browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:evidence.passed,decoded:evidence.decoded,energyRight:evidence.energyRight,energyLeft:evidence.energyLeft,errors}));
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
