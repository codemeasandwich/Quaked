const panel=document.querySelector('section'),status=document.querySelector('#status'),errors=[];
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
await import('../main.js');const deadline=performance.now()+120000;
while(!window.Cbuf_AddText){if(performance.now()>deadline)throw Error('Startup timeout');await new Promise(r=>setTimeout(r,50));}
const {Cbuf_AddText,Cmd_ExecuteString}=await import('../src/engine/common/cmd.js'),{cl,cls}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {SV_LinkEdict,SV_Move}=await import('../src/engine/server/world.js'),{PR_GetString}=await import('../src/engine/progs/progs.js');
const {GetEdictFieldValue}=await import('../src/engine/progs/pr_edict.js');
const writeField=(e,name,value)=>{const f=GetEdictFieldValue(e,name);if(!f)throw Error('Missing QC field '+name);f.accessor.setFloat(f.ofs,value);};
const {IT_AXE,IT_QUAD,IT_INVULNERABILITY}=await import('../src/engine/common/quakedef.js');
const {renderer}=await import('../src/engine/render/vid.js');
const {R_AxeCorpseStatus}=await import('../src/newer/render/r_axecorpses.js');
const keys=await import('../src/engine/client/keys.js'),split=await import('../src/newer/render/r_demosplit.js');
let generation=0,target=null,deathOrigin=null,combo=false,orbit=0,killTime=null;
function power(){const p=sv.edicts?.[1];if(!p)return;writeField(p,'super_damage_finished',sv.time+120);writeField(p,'invincible_finished',combo?sv.time+120:0);p.v.items=(p.v.items|IT_AXE|IT_QUAD)|(combo?IT_INVULNERABILITY:0);if(!combo)p.v.items&=~IT_INVULNERABILITY;p.v.weapon=IT_AXE;Cbuf_AddText('impulse 1\n');status.textContent=combo?'Quad + pentagram: swing to test lethal gib damage.':'Quad: fatal axe hits split the enemy along the animated blade angle.';}
function inspect(){
 Cbuf_AddText('r_drawviewmodel 0\n');
 const p=sv.edicts?.[1];if(!p||!deathOrigin)return;const q=deathOrigin;
 for(let i=0;i<16;i++){
  const a=orbit+i*Math.PI/8,pos=[q[0]+Math.cos(a)*80,q[1]+Math.sin(a)*80,q[2]+24],trace=SV_Move(pos,p.v.mins,p.v.maxs,pos,1,p);
  if(trace.startsolid||trace.allsolid)continue;p.v.movetype=0;p.v.origin=pos;p.v.velocity=[0,0,0];
  const d=[q[0]-pos[0],q[1]-pos[1],q[2]+8-pos[2]-22],angles=[-Math.atan2(d[2],Math.hypot(d[0],d[1]))*180/Math.PI,Math.atan2(d[1],d[0])*180/Math.PI,0];p.v.angles=angles;p.v.v_angle=angles;p.v.fixangle=1;cl.viewangles.set(angles);SV_LinkEdict(p,false);break;
 }
 orbit+=Math.PI/4;
}
function start(kind){
 Cmd_ExecuteString('-attack');Cbuf_AddText('r_drawviewmodel 1\n');sv.paused=false;killTime=null;target=null;const previous=sv.edicts?.[1],token=++generation,map=kind==='ogre'?'e1m2':'e1m1';split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
 Cbuf_AddText('disconnect\nmaxplayers 1\nr_hdr 1\nr_demosplit 0\nskill 1\nbgmvolume 0\nmap '+map+'\n');status.textContent='Loading native '+kind+'…';
 const until=performance.now()+120000,timer=setInterval(()=>{
  if(token!==generation){clearInterval(timer);return;}if(performance.now()>until){clearInterval(timer);status.textContent='Map startup timeout';return;}
  if(sv.edicts?.[1]===previous||cls.demoplayback||cls.signon!==4||!sv.active||sv.name!==map)return;
  const p=sv.edicts[1];
  for(const e of sv.edicts){
   if(!e||e.free||PR_GetString(e.v.classname)!==(kind==='ogre'?'monster_ogre':'monster_army')||e.v.health<=0)continue;
   const q=Array.from(e.v.origin);
   for(let i=0;i<16;i++){
    const a=i*Math.PI/8,pos=[q[0]+Math.cos(a)*48,q[1]+Math.sin(a)*48,q[2]],fit=SV_Move(pos,p.v.mins,p.v.maxs,pos,0,p),line=SV_Move([pos[0],pos[1],pos[2]+16],[0,0,0],[0,0,0],[q[0],q[1],q[2]+16],0,p);
    if(fit.startsolid||fit.allsolid||line.ent!==e)continue;
    target=e;deathOrigin=q;orbit=a;p.v.flags|=64|128;p.v.movetype=0;p.v.origin=pos;p.v.velocity=[0,0,0];const angles=[0,(a+Math.PI)*180/Math.PI,0];p.v.angles=angles;p.v.v_angle=angles;p.v.fixangle=1;cl.viewangles.set(angles);SV_LinkEdict(p,false);
    e.v.nextthink=-1;e.v.movetype=0;clearInterval(timer);power();return;
   }
  }
 },100);
}
document.querySelector('#soldier').onclick=()=>start('soldier');document.querySelector('#ogre').onclick=()=>start('ogre');
document.querySelector('#quad').onclick=()=>{combo=false;power();};document.querySelector('#combo').onclick=()=>{combo=true;power();};
document.querySelector('#swing').onclick=()=>{if(!target)return;power();Cmd_ExecuteString('+attack');setTimeout(()=>Cmd_ExecuteString('-attack'),550);};
document.querySelector('#orbit').onclick=inspect;
setInterval(()=>{const glError=renderer?.getContext().getError();if(glError)errors.push('GL '+glError);if(target&&target.v.health<=0){if(killTime===null)killTime=sv.time;if(sv.time-killTime>3){sv.paused=true;status.textContent='Paused after native kill — Inspect remains, or choose an enemy to restart.';}}document.querySelector('#report').textContent=JSON.stringify({map:sv.name,glError,paused:sv.paused,powerups:sv.edicts?.[1]?Object.fromEntries(['super_damage_finished','invincible_finished'].map(name=>{const f=GetEdictFieldValue(sv.edicts[1],name);return [name,f?f.accessor.getFloat(f.ofs)-sv.time:null];})):null,target:target?{class:PR_GetString(target.v.classname),health:target.v.health,frame:target.v.frame,model:PR_GetString(target.v.model)}:null,gibs:(sv.edicts||[]).filter(e=>e&&!e.free&&/^progs\/(gib[123]|zom_gib|h_[a-z0-9_]+)\.mdl$/.test(PR_GetString(e.v.model))).length,corpses:R_AxeCorpseStatus(),errors},null,2);},500);
start('soldier');
