import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Drives one ordinary game instance so a browser run can photograph the Scrag's spit (card [SP1], r_venom.js).
// A Scrag of the level is moved in front of the parked player and made to run the game's own Wiz_StartFast (its fast
// attack: two progs/w_spike.mdl missiles, 0.3 s and 0.8 s later). The missiles are the real ones, launched, moved and
// collided by the real QuakeC and server; only their aim point is chosen here (a blank edict, so they cross the view
// and strike a wall, or the player). The game's `pause` freezes cl.time, so a paused frame is that moment of the flight.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,ms=240000){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error(label+' exceeded its deadline');await sleep(50);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const {cl,cls,cl_visedicts}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js'),progs=await import('../src/engine/progs/progs.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {Cvar_SetValue}=await import('../src/engine/common/cvar.js');
const {SV_LinkEdict,SV_PointContents}=await import('../src/engine/server/world.js');
const keys=await import('../src/engine/client/keys.js'),venom=await import('../src/newer/render/r_venom.js'),client=await import('../src/engine/client/client.js');
const {PR_ExecuteProgram}=await import('../src/engine/progs/pr_exec.js'),{ED_FindFunction,ED_Alloc}=await import('../src/engine/progs/pr_edict.js');
const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
const fwd=(yaw,pitch=0)=>{const y=yaw*Math.PI/180,p=pitch*Math.PI/180;return [Math.cos(p)*Math.cos(y),Math.cos(p)*Math.sin(y),-Math.sin(p)];};
let target=null;
window.venomTrial={
 errors,
 async start(newer=true,map='e1m2'){Cvar_SetValue('r_hdr',newer?1:0);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_dynres 1\nbgmvolume 0\nshowpause 0\ncon_notifytime 0\nmap '+map+'\n');
  await until(()=>!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/'+map+'.bsp'&&cl.stats[0]>0,'level signon');return true;},
 // park the player (no collisions, god mode, no target for monsters), looking along yaw/pitch
 place(x,y,z,yaw=0,pitch=0){const p=sv.edicts[1];p.v.movetype=0;p.v.solid=0;p.v.flags|=64|128;p.v.origin=[x,y,z];p.v.velocity=[0,0,0];p.v.angles=[pitch,yaw,0];p.v.fixangle=1;cl.viewangles.set(p.v.angles);SV_LinkEdict(p,false);return true;},
 player(){const p=sv.edicts[1];return {origin:[...p.v.origin],angles:[...p.v.angles]};},
 contents(x,y,z){return SV_PointContents([x,y,z]);},
 wizards(){return sv.edicts.filter(e=>e&&!e.free&&progs.PR_GetString(e.v.classname)==='monster_wizard').map(e=>({index:e.index,origin:[...e.v.origin],health:e.v.health}));},
 // Move Scrag `index` to `at`, facing `aim`, and run its own Wiz_StartFast against a blank edict at `aim` (or the
 // player when aim is null). Returns the server time it was run.
 spit(index,at,aim=null){const w=sv.edicts[index];w.v.origin=[...at];w.v.velocity=[0,0,0];
  let enemy=sv.edicts[1];if(aim){if(!target||target.free)target=ED_Alloc();target.v.origin=[...aim];target.v.angles=[0,0,0];enemy=target;}
  const to=enemy.v.origin;w.v.angles=[0,Math.atan2(to[1]-at[1],to[0]-at[0])*180/Math.PI,0];SV_LinkEdict(w,false);
  w.v.enemy=progs.EDICT_TO_PROG(enemy);progs.pr_global_struct.self=progs.EDICT_TO_PROG(w);progs.pr_global_struct.time=sv.time;
  PR_ExecuteProgram(progs.pr_functions.indexOf(ED_FindFunction('Wiz_StartFast')));return sv.time;},
 // the server's wizspike missiles now
 spikes(){return sv.edicts.filter(e=>e&&!e.free&&progs.PR_GetString(e.v.classname)==='wizspike').map(e=>({index:e.index,origin:[...e.v.origin],velocity:[...e.v.velocity]}));},
 // the client's progs/w_spike.mdl entities drawn this frame
 drawn(){const out=[];for(let i=0;i<client.cl_numvisedicts;i++){const e=cl_visedicts[i];if(e?.model?.name?.endsWith('progs/w_spike.mdl'))out.push({index:e._entityIndex,origin:[...e.origin]});}return out;},
 forward:fwd,
 time(){return cl.time;},
 servertime(){return sv.time;},
 // pause the game on the first frame at or after server time t (polled every animation frame)
 freezeAt(t){return new Promise(res=>{const step=()=>{if(sv.time>=t){Cbuf_AddText('pause\n');res(sv.time);}else requestAnimationFrame(step);};step();});},
 freeze(){if(!cl.paused)Cbuf_AddText('pause\n');},
 thaw(){if(cl.paused)Cbuf_AddText('pause\n');},
 cmd(text){Cbuf_AddText(text+'\n');},
 cvar(name,value){Cvar_SetValue(name,value);},
 snapshot(){return {...venom.R_VenomSnapshot(),time:cl.time,servertime:sv.time,paused:!!cl.paused,errors:[...errors]};}
};
document.getElementById('loading')?.remove();
