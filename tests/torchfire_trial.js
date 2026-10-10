// Drives one ordinary game instance so a browser run can photograph the supplied torch flame next to
// the native flame model. The game's own `pause` freezes cl.time, which the effect is a function of.
// Observation only: the player is parked in front of a torch with the engine's own noclip-style flags,
// as tests/emissive_lighting_trial.js does. No gameplay is altered.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,ms=240000){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error(label+' exceeded its deadline');await sleep(50);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const {cl,cls,cl_static_entities,cl_entities}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {Cvar_SetValue}=await import('../src/engine/common/cvar.js');
const {SV_LinkEdict}=await import('../src/engine/server/world.js');
const keys=await import('../src/engine/client/keys.js'),tf=await import('../src/r_torchfire.js'),fb=await import('../src/r_fireball.js');
const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
window.torchTrial={
 errors,
 async start(newer=true,map='e1m1'){Cvar_SetValue('r_hdr',newer?1:0);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_dynres 1\nbgmvolume 0\nscr_showpause 0\ncon_notifytime 0\nmap '+map+'\n');
  await until(()=>!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/'+map+'.bsp'&&cl.stats[0]>0,'level signon');
  await until(()=>fb.R_FireballAssets()!==null,'effect textures');return true;},
 // every static flame of the level
 torches(){const list=[];for(let i=0;i<cl.num_statics;i++){const e=cl_static_entities[i];if(e.model&&/flame/.test(e.model.name))list.push({i,kind:'static',model:e.model.name,frame:e.frame,origin:[...e.origin]});}
  for(let i=0;i<cl_entities.length;i++){const e=cl_entities[i];if(e?.model&&/flame/.test(e.model.name))list.push({i,kind:'entity',model:e.model.name,frame:e.frame,origin:[...e.origin]});}return list;},
 // park the player `dist` units from torch `index`, looking at it from `yaw` degrees around it
 stand(index,dist=110,yaw=0,lift=0){const t=this.torches()[index];if(!t)return null;const player=sv.edicts[1],a=yaw*Math.PI/180;
  const o=[t.origin[0]-Math.cos(a)*dist,t.origin[1]-Math.sin(a)*dist,t.origin[2]+lift-22];
  player.v.movetype=0;player.v.solid=0;player.v.flags|=64|128;player.v.origin=o;player.v.velocity=[0,0,0];
  const pitch=Math.atan2(-(t.origin[2]-(o[2]+22)),dist)*180/Math.PI;
  player.v.angles=[pitch,yaw,0];player.v.fixangle=1;cl.viewangles.set(player.v.angles);SV_LinkEdict(player,false);return {torch:t,eye:[o[0],o[1],o[2]+22]};},
 // the title demo with its Newer | Classic split, as the attract loop starts it
 async startSplitDemo(){const demo=await import('../src/engine/client/cl_demo.js'),pak=await import('../src/engine/common/pak.js'),split=await import('../src/r_demosplit.js');
  keys.set_key_dest(keys.key_game);Cvar_SetValue('r_demosplit',1);
  const file=pak.COM_FindFile('demo1.dem');if(!file)throw Error('demo1.dem not found');
  demo.CL_PlayDemoFromData(file.data.buffer.slice(file.data.byteOffset,file.data.byteOffset+file.data.length),true);
  await until(()=>cls.demoplayback&&cls.signon===4&&cl.worldmodel,'demo signon');
  await until(()=>fb.R_FireballAssets()!==null,'effect textures');return {active:split.R_DemoSplitActive()};},
 time(){return cl.time;},
 freeze(){if(!cl.paused)Cbuf_AddText('pause\n');},
 thaw(){if(cl.paused)Cbuf_AddText('pause\n');},
 cmd(text){Cbuf_AddText(text+'\n');},
 snapshot(){return {...tf.R_TorchFireSnapshot(),time:cl.time,paused:!!cl.paused,errors:[...errors]};}
};
document.getElementById('loading')?.remove();
