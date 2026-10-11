import '../src/newer/install.js'; // Newer Game plugs into the engine's hooks (src/engine/common/hooks.js)
// Drives one ordinary game instance so a browser run can photograph the supplied fireball
// (r_lavaballs.js) on Quake's own flying lava balls next to the native lava ball model. The game's
// own `pause` freezes cl.time, so a paused frame holds a ball mid-flight. Observation only: the player
// is parked with the engine's own noclip-style flags, as tests/torchfire_trial.js does; the balls are
// the level's own (misc_fireball, Chthon). No gameplay is altered.
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,ms=240000){const end=performance.now()+ms;while(!test()){if(performance.now()>end)throw Error(label+' exceeded its deadline');await sleep(50);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const {cl,cls,cl_entities}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {Cvar_SetValue}=await import('../src/engine/common/cvar.js');
const {SV_LinkEdict}=await import('../src/engine/server/world.js');
const gm=await import('../src/engine/render/gl_model.js'),keys=await import('../src/engine/client/keys.js'),lb=await import('../src/newer/render/r_lavaballs.js');
const errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
window.lavaTrial={
 errors,
 async start(newer=true,map='start'){Cvar_SetValue('r_hdr',newer?1:0);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_dynres 1\nbgmvolume 0\nscr_showpause 0\ncon_notifytime 0\nmap '+map+'\n');
  await until(()=>!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/'+map+'.bsp'&&cl.stats[0]>0,'level signon');return true;},
 // the lava balls the client has this frame
 balls(){const list=[];for(let i=0;i<cl_entities.length;i++){const e=cl_entities[i];if(e?.model?.name==='progs/lavaball.mdl'&&e.msgtime===cl.mtime[0])list.push({i,origin:[...e.origin]});}return list;},
 // park the player at `eye`, looking at `at`
 look(eye,at){const player=sv.edicts[1],o=[eye[0],eye[1],eye[2]-22],d=[at[0]-eye[0],at[1]-eye[1],at[2]-eye[2]];
  player.v.movetype=0;player.v.solid=0;player.v.flags|=64|128;player.v.origin=o;player.v.velocity=[0,0,0];
  const yaw=Math.atan2(d[1],d[0])*180/Math.PI,pitch=-Math.atan2(d[2],Math.hypot(d[0],d[1]))*180/Math.PI;
  player.v.angles=[pitch,yaw,0];player.v.fixangle=1;cl.viewangles.set(player.v.angles);SV_LinkEdict(player,false);return {yaw,pitch};},
 // an open spot `dist` units from `at` (and `lift` above it) with a clear line of sight to `aimLift` above it: the heading nearest `start` degrees, in 15-degree steps
 viewpoint(at,dist=260,lift=60,aimLift=120,start=0){const empty=p=>{const l=gm.Mod_PointInLeaf(p,cl.worldmodel);return l&&l.contents===-1;};
  for(let k=0;k<24;k++){const a=start*Math.PI/180+(k%2?-1:1)*Math.ceil(k/2)*Math.PI/12,eye=[at[0]+Math.cos(a)*dist,at[1]+Math.sin(a)*dist,at[2]+lift];let clear=true;
   for(let s=0;s<=32&&clear;s++){const t=s/32;clear=empty([eye[0]+(at[0]-eye[0])*t*.9,eye[1]+(at[1]-eye[1])*t*.9,eye[2]+(at[2]+aimLift-eye[2])*t*.9]);}
   if(clear)return eye;}return null;},
 // move the (ordinary, solid) player to `origin`, touching what is there: how a level's own trigger is reached
 place(origin){const player=sv.edicts[1];player.v.origin=[...origin];player.v.velocity=[0,0,0];SV_LinkEdict(player,true);return true;},
 // what a level's trigger does to its target: run the entity's own `use` with the player as activator (e1m7: Chthon)
 async wake(index){const pg=await import('../src/engine/progs/progs.js'),ex=await import('../src/engine/progs/pr_exec.js'),ph=await import('../src/engine/server/sv_phys.js');
  const e=sv.edicts[index],player=sv.edicts[1];if(!e||!e.v.use)return false;
  const act=pg.pr_globaldefs.find(d=>pg.PR_GetString(d.s_name)==='activator');if(act)pg.pr_globals_int[act.ofs]=pg.EDICT_TO_PROG(player);
  ph.pr_global_struct.self=pg.EDICT_TO_PROG(e);ph.pr_global_struct.other=pg.EDICT_TO_PROG(player);ex.PR_ExecuteProgram(e.v.use);return true;},
 // a first sighting (Chthon's) holds the game on its Bestiary page: put it away so the fight plays on
 async dismiss(){const bestiary=await import('../src/newer/ui/r_bestiary.js');const was=bestiary.R_BestiarySnapshot().phase;if(was!=='idle')bestiary.R_BestiaryCancel();return was;},
 time(){return cl.time;},
 freeze(){if(!cl.paused)Cbuf_AddText('pause\n');},
 thaw(){if(cl.paused)Cbuf_AddText('pause\n');},
 cmd(text){Cbuf_AddText(text+'\n');},
 snapshot(){return {...lb.R_LavaBallsSnapshot(),balls:this.balls(),time:cl.time,paused:!!cl.paused,errors:[...errors]};}
};
document.getElementById('loading')?.remove();
