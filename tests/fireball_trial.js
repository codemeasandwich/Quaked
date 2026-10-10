// Drives one ordinary game instance so a browser run can photograph the Fireball
// at exact burst ages. The game's own `pause` freezes cl.time, which is what the
// effect is a function of, so a paused frame IS that age. No gameplay is altered.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,ms=240000){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error(label+' exceeded its deadline');await sleep(50);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const {cl,cls}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {Cvar_SetValue}=await import('../src/engine/common/cvar.js');
const keys=await import('../src/engine/client/keys.js');
const render=await import('../src/engine/render/render.js'),fb=await import('../src/r_fireball.js');
const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
let started=0;
window.fireballTrial={
 errors,
 async start(newer=true,map='e1m1'){Cvar_SetValue('r_hdr',newer?1:0);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_dynres 1\nbgmvolume 0\nscr_showpause 0\ncon_notifytime 0\nmap '+map+'\n');
  await until(()=>!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/'+map+'.bsp'&&cl.stats[0]>0,'level signon');
  await until(()=>fb.R_FireballSnapshot().ready,'fireball textures');started=1;return true;},
 // the title demo with its Newer | Classic split, as the attract loop starts it
 async startSplitDemo(){const demo=await import('../src/engine/client/cl_demo.js'),pak=await import('../src/engine/common/pak.js'),split=await import('../src/r_demosplit.js');
  keys.set_key_dest(keys.key_game);Cvar_SetValue('r_demosplit',1);
  const file=pak.COM_FindFile('demo1.dem');if(!file)throw Error('demo1.dem not found');
  demo.CL_PlayDemoFromData(file.data.buffer.slice(file.data.byteOffset,file.data.byteOffset+file.data.length),true);
  await until(()=>cls.demoplayback&&cls.signon===4&&cl.worldmodel,'demo signon');
  await until(()=>fb.R_FireballSnapshot().ready,'fireball textures');return {active:split.R_DemoSplitActive()};},
 // A synthetic missile flying ACROSS the view (so the trail is seen from the side, as in the source's
 // own frames): one segment per rendered frame through the real R_RocketTrail, with the entity key.
 synthTrail({type=0,speed=700,ahead=170,span=230,key=77}={}){const o=render.r_refdef.vieworg,f=render.vpn,r=render.vright;
  const at=s=>[o[0]+f[0]*ahead+r[0]*(s-span/2),o[1]+f[1]*ahead+r[1]*(s-span/2),o[2]+f[2]*ahead+r[2]*(s-span/2)+20];
  let s=0,last=cl.time;const state={frames:0,done:false};
  (function step(){if(state.done)return;const now=cl.time,dt=now-last;
   if(dt>0&&!cl.paused){const a=at(s),b=at(Math.min(span,s+speed*dt));render.R_RocketTrail(a,b,type,key);s=Math.min(span,s+speed*dt);last=now;state.frames++;if(s>=span){state.done=true;return;}}
   requestAnimationFrame(step);})();
  return state;},
 paused(){return !!cl.paused;},
 time(){return cl.time;},
 // explode ahead of the view, `dist` units forward and `lift` up; returns the spawn time
 explode(dist=240,lift=0){const o=render.r_refdef.vieworg,f=render.vpn,p=[o[0]+f[0]*dist,o[1]+f[1]*dist,o[2]+f[2]*dist+lift];render.R_ParticleExplosion(p);return {t:cl.time,origin:p,eye:[...o],forward:[...f]};},
 freeze(){if(!cl.paused)Cbuf_AddText('pause\n');},
 thaw(){if(cl.paused)Cbuf_AddText('pause\n');},
 clear(){fb.R_FireballClear();},
 // a REAL shot: all weapons, select one (7 rocket launcher, 6 grenade launcher), press attack
 // The engine sends one impulse per frame, so each step is a separate frame.
 fire(weapon=7){const step=(ms,text)=>new Promise(r=>setTimeout(()=>{Cbuf_AddText(text);r();},ms));
  return (async()=>{await step(0,'impulse 9\n');await step(400,'impulse '+weapon+'\n');await step(500,'+attack\n');await step(180,'-attack\n');})();},
 bursts(){return fb.R_FireballSnapshot().bursts;},
 cmd(text){Cbuf_AddText(text+'\n');},
 snapshot(){return {...fb.R_FireballSnapshot(),time:cl.time,paused:!!cl.paused,errors:[...errors]};}
};
document.getElementById('loading')?.remove();
