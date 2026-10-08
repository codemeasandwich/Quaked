// Drives one ordinary game instance so a browser run can photograph the shotgun pellets and bubbles. Real
// weapons are selected and fired through the game's own impulses and attack button. The game's `pause`
// freezes cl.time, which the effect is a function of, so a paused frame is that moment of the flight.
// Observation only apart from parking the player (as tests/emissive_lighting_trial.js does).
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,ms=240000){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error(label+' exceeded its deadline');await sleep(50);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const {cl,cls}=await import('../src/client.js'),{sv}=await import('../src/server.js'),progs=await import('../src/progs.js');
const {Cbuf_AddText}=await import('../src/cmd.js');
const {Cvar_SetValue}=await import('../src/cvar.js');
const {SV_LinkEdict,SV_PointContents}=await import('../src/world.js');
const keys=await import('../src/keys.js'),sg=await import('../src/r_shotgun.js');
const {PR_ExecuteProgram}=await import('../src/pr_exec.js'),{ED_FindFunction}=await import('../src/pr_edict.js');
window.__pr={exec:(e,ed)=>{progs.pr_global_struct.self=progs.EDICT_TO_PROG(e);progs.pr_global_struct.time=sv.time;e.v.enemy=progs.EDICT_TO_PROG(sv.edicts[1]);PR_ExecuteProgram(progs.pr_functions.indexOf(ED_FindFunction('army_fire')));return true;}};
const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
window.shotgunTrial={
 errors,
 async start(newer=true,map='e1m1'){Cvar_SetValue('r_hdr',newer?1:0);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_dynres 1\nbgmvolume 0\nscr_showpause 0\ncon_notifytime 0\nmap '+map+'\n');
  await until(()=>!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/'+map+'.bsp'&&cl.stats[0]>0,'level signon');return true;},
 // park the player (no collisions), looking along yaw/pitch
 place(x,y,z,yaw=0,pitch=0){const p=sv.edicts[1];p.v.movetype=0;p.v.solid=0;p.v.flags|=64|128;p.v.origin=[x,y,z];p.v.velocity=[0,0,0];p.v.angles=[pitch,yaw,0];p.v.fixangle=1;cl.viewangles.set(p.v.angles);SV_LinkEdict(p,false);return true;},
 // a real shot: all weapons, select one (2 shotgun, 3 super shotgun), press attack. One impulse per frame.
 fire(weapon=2){const step=(ms,text)=>new Promise(r=>setTimeout(()=>{Cbuf_AddText(text);r();},ms));
  return (async()=>{await step(0,'impulse 9\n');await step(300,'impulse '+weapon+'\n');await step(500,'+attack\n');await step(90,'-attack\n');})();},
 // some real water of this level: a wet point with air above it
 findWater(){const w=sv.worldmodel,lo=w.mins,hi=w.maxs;for(let x=lo[0];x<hi[0];x+=48)for(let y=lo[1];y<hi[1];y+=48)for(let z=lo[2];z<hi[2];z+=16){
   if(SV_PointContents([x,y,z])!==-3)continue;let top=null;for(let q=z;q<z+400;q+=2){if(SV_PointContents([x,y,q])===-1){top=q;break;}}
   if(top!==null&&top-z>=40&&SV_PointContents([x,y,z-40])===-3)return {x,y,bottom:z-40,top};}return null;},
 // the level's soldiers (monster_army), for photographing their shotguns
 soldiers(){return sv.edicts.filter(e=>e&&!e.free&&progs.PR_GetString(e.v.classname)==='monster_army').map(e=>({index:e.index,origin:[...e.v.origin],yaw:e.v.angles[1],health:e.v.health}));},
 // make a soldier fire the game's own army_fire at the player (a sleeping soldier would not): the real QuakeC runs
 shootSoldier(index){const e=sv.edicts[index],pr=window.__pr||(window.__pr={}),exec=pr.exec,ed=pr.ed;return exec(e,ed);},
 time(){return cl.time;},
 freeze(){if(!cl.paused)Cbuf_AddText('pause\n');},
 thaw(){if(cl.paused)Cbuf_AddText('pause\n');},
 cmd(text){Cbuf_AddText(text+'\n');},
 snapshot(){const s=sg.R_ShotgunSnapshot();return {...s,time:cl.time,paused:!!cl.paused,errors:[...errors]};}
};
document.getElementById('loading')?.remove();
