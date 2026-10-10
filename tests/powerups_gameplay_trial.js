// Owner trial uses the native server's actual pickups and QuakeC touch logic.
// It only positions/protects the test player; it does not fabricate an item.
const panel=document.querySelector('section'),status=document.querySelector('#status'),runtimeErrors=[];
window.addEventListener('error',e=>runtimeErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>runtimeErrors.push(String(e.reason?.stack||e.reason)));
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
await import('../main.js');
const deadline=performance.now()+120000;
while(!window.Cbuf_AddText){if(performance.now()>deadline)throw new Error('Game startup timed out');await new Promise(r=>setTimeout(r,50));}
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js'),{Cvar_SetValue,Cvar_VariableValue}=await import('../src/engine/common/cvar.js');
const {cl,cls}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js'),{PR_GetString}=await import('../src/engine/progs/progs.js');
const {SV_LinkEdict,SV_Move}=await import('../src/engine/server/world.js'),{Mod_PointInLeaf}=await import('../src/gl_model.js');
const {R_PowerupStatus}=await import('../src/r_powerups.js'),{R_PointShadowStatus}=await import('../src/gl_post.js');
const keys=await import('../src/engine/client/keys.js'),split=await import('../src/r_demosplit.js');
const choices={quad:['e1m1','progs/quaddama.mdl'],pentagram:['e1m8','progs/invulner.mdl'],ring:['e1m3','progs/invisibl.mdl']};
let current='quad',pickup=null,generation=0,angle=0;
function place(collect=false){
 if(!pickup||pickup.free)return;
 const player=sv.edicts[1],p=Array.from(pickup.v.origin),target=p.map((v,k)=>v+(k===2?20:0));
 let position=target.slice();
 if(!collect){
  let found=false;
  for(const distance of [110,80,55]){
   for(let i=0;i<16;i++){
    const a=angle+i*Math.PI/8,candidate=[p[0]+Math.cos(a)*distance,p[1]+Math.sin(a)*distance,p[2]+10];
    const eye=candidate.map((v,k)=>v+(k===2?22:0));
    const trace=SV_Move(eye,[0,0,0],[0,0,0],target,1,player);
    if(Mod_PointInLeaf(eye,cl.worldmodel).contents!==-2&&!trace.startsolid&&trace.fraction>.99){position=candidate;found=true;break;}
   }
   if(found)break;
  }
  if(!found){status.textContent='No unobstructed inspection angle found';return;}

 }else position=p.slice();
 player.v.flags|=64|128;player.v.movetype=collect?3:0;player.v.origin=position;player.v.velocity=[0,0,0];
 const delta=target.map((v,k)=>v-position[k]-(k===2?22:0)),angles=[-Math.atan2(delta[2],Math.hypot(delta[0],delta[1]))*180/Math.PI,Math.atan2(delta[1],delta[0])*180/Math.PI,0];
 player.v.angles=angles;player.v.fixangle=1;cl.viewangles.set(angles);SV_LinkEdict(player,false);
 if(collect)status.textContent='Collecting through the native item touch…';
}
function start(kind){
 current=kind;pickup=null;angle=0;const token=++generation,[map,model]=choices[kind];
 split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
 Cbuf_AddText('maxplayers 1\nr_hdr 1\nr_powerups 1\nr_demosplit 0\nskill 1\nbgmvolume 0\nmap '+map+'\n');
 status.textContent='Loading '+kind+' in '+map+'…';const until=performance.now()+120000;
 const timer=setInterval(()=>{
  if(token!==generation){clearInterval(timer);return;}
  if(performance.now()>until){clearInterval(timer);status.textContent='Native map/pickup startup timed out';return;}
  if(cls.demoplayback||cls.signon!==4||!sv.active||cl.worldmodel?.name!=='maps/'+map+'.bsp')return;
  pickup=sv.edicts.find(e=>e&&!e.free&&e.v.modelindex>0&&PR_GetString(e.v.model)===model);
  if(!pickup)return;
  clearInterval(timer);split.R_DemoSplitRelease(true);Cvar_SetValue('r_hdr',1);Cvar_SetValue('r_powerups',1);Cvar_SetValue('r_flashlight',0);
  place();status.textContent='Native '+kind+' pickup · orbit, compare or collect';
 },100);
}
for(const kind of Object.keys(choices))document.querySelector('#'+kind).onclick=()=>start(kind);
document.querySelector('#orbit').onclick=()=>{angle+=Math.PI/4;place();};
document.querySelector('#collect').onclick=()=>place(true);
document.querySelector('#toggle').onclick=()=>Cvar_SetValue('r_powerups',1-Cvar_VariableValue('r_powerups'));
document.querySelector('#classic').onclick=()=>Cvar_SetValue('r_demosplit',Cvar_VariableValue('r_demosplit')===2?0:2);
setInterval(()=>{
 const glError=window.renderer?.getContext().getError();if(glError)runtimeErrors.push('GL '+glError+' in '+cl.worldmodel?.name);
 const result={...R_PowerupStatus(),map:cl.worldmodel?.name,model:pickup&&!pickup.free?PR_GetString(pickup.v.model):null,classic:Cvar_VariableValue('r_demosplit')===2,shadows:R_PointShadowStatus(),glError,runtimeErrors};
 document.querySelector('#report').textContent=JSON.stringify(result,null,2);
 if(pickup&&(pickup.free||pickup.v.modelindex===0||PR_GetString(pickup.v.model)===''))status.textContent='Collected through native gameplay · select a power-up to restart its map';
},500);
start(new URLSearchParams(location.search).get('kind') in choices?new URLSearchParams(location.search).get('kind'):'quad');
