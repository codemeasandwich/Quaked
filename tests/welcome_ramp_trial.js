// Actual game and native corridor touches; no alternate renderer or sound bus.
const panel=document.querySelector('section'),status=document.querySelector('#status'),errors=[];
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));
window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
await import('../main.js');
const deadline=performance.now()+120000;
while(!window.Cbuf_AddText){if(performance.now()>deadline)throw Error('Startup timeout');await new Promise(r=>setTimeout(r,50));}
const {Cbuf_AddText}=await import('../src/cmd.js'),{Cvar_SetValue,Cvar_VariableValue}=await import('../src/cvar.js');
const {cl,cls}=await import('../src/client.js'),{sv,svs}=await import('../src/server.js');
const {SV_LinkEdict,SV_RunTriggerTouch}=await import('../src/world.js'),{SV_PushEntity}=await import('../src/sv_phys.js');
const {R_FlashlightRunStatus}=await import('../src/r_flashlightrun.js');
const loading=await import('../src/r_demoloading.js');
const sound=await import('../src/sound.js'),dma=await import('../src/snd_dma.js');
const {PR_GetString}=await import('../src/progs.js');
const keys=await import('../src/keys.js'),split=await import('../src/r_demosplit.js');
let generation=0,ready=false;
function place(point,yaw){const p=sv.edicts?.[1];p.v.flags|=64|128;p.v.movetype=0;p.v.origin=point;p.v.velocity=[0,0,0];p.v.angles=[0,yaw,0];p.v.v_angle=[0,yaw,0];p.v.fixangle=1;cl.viewangles.set([0,yaw,0]);SV_LinkEdict(p,false);}
function load(map,point,yaw){
 dma.S_UnlockAudio();ready=false;const previousPlayer=sv.edicts?.[1],token=++generation;split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
 Cbuf_AddText('disconnect\nmaxplayers 1\nr_hdr 1\nr_demosplit 0\nskill 1\nbgmvolume 0\nmap '+map+'\n');status.textContent='Loading '+map+'…';
 const until=performance.now()+120000,timer=setInterval(()=>{
  if(token!==generation){clearInterval(timer);return;}
  if(performance.now()>until){clearInterval(timer);status.textContent='Map startup timed out';return;}
  if(sv.edicts?.[1]===previousPlayer||cls.demoplayback||cls.signon!==4||!sv.active||cl.worldmodel?.name!=='maps/'+map+'.bsp'||loading.R_IntroLoadingHolding()||Cvar_VariableValue('r_hdr')!==1||!R_FlashlightRunStatus().active)return;
  clearInterval(timer);place(point,yaw);ready=true;
  status.textContent=map==='start'?'Before corridor entrance — flashlight and crosshair off. Click Walk into corridor.':'At ramp bottom — listen to the native machine loop; compare Ramp top and Approach machine.';
 },100);
}
document.querySelector('#easy').onclick=()=>load('start',[232,790,8],90);
document.querySelector('#hard').onclick=()=>load('start',[864,760,8],90);
document.querySelector('#normal').onclick=()=>load('start',[544,790,8],90);
document.querySelector('#enter').onclick=()=>{if(!ready||sv.name!=='start')return;const p=sv.edicts?.[1];SV_PushEntity(p,[0,32,0]);p.v.velocity=[0,0,0];status.textContent='Native corridor contact — flashlight '+(Cvar_VariableValue('r_flashlight')?'on':'off')+', crosshair '+(Cvar_VariableValue('crosshair')?'on':'off')+'; portal is still down the hall.';};
document.querySelector('#off').onclick=()=>Cbuf_AddText('flashlight\n');
document.querySelector('#ramp').onclick=()=>load('e1m1',[1312,1248,-319.9],270);
document.querySelector('#top').onclick=()=>{if(ready&&sv.name==='e1m1'){dma.S_UnlockAudio();place([1312,1120,-255.9],270);status.textContent='Ramp top — machine sound grows gently.';}};
document.querySelector('#near').onclick=()=>{if(ready&&sv.name==='e1m1'){dma.S_UnlockAudio();place([1312,800,-255.9],270);status.textContent='Approaching the machine — same native loop, stronger proximity.';}};
setInterval(()=>{document.querySelector('#report').textContent=JSON.stringify({map:sv.name,entryHookLoaded:SV_RunTriggerTouch.toString().includes('This hall selects'),maxclients:svs.maxclients,player:sv.edicts?.[1]?{index:sv.edicts?.[1].index,health:sv.edicts?.[1].v.health,classname:PR_GetString(sv.edicts?.[1].v.classname)}:null,halls:(sv.edicts||[]).filter(e=>e&&!e.free&&PR_GetString(e.v.message).includes('This hall')).map(e=>({classname:PR_GetString(e.v.classname),message:PR_GetString(e.v.message)})),hdr:Cvar_VariableValue('r_hdr'),demo:cls.demoplayback,connected:cls.state,skill:Cvar_VariableValue('skill'),crosshair:Cvar_VariableValue('crosshair'),ready,loading:loading.R_DemoLoadingStatus(),position:sv.edicts?.[1]?Array.from(sv.edicts?.[1].v.origin):null,flashlight:R_FlashlightRunStatus(),machine:sound.channels.filter(c=>c.sfx?.name==='ambience/drone6.wav').map(c=>({origin:Array.from(c.origin),left:c.leftvol,right:c.rightvol,looping:!!c._audioSource})),errors},null,2);},500);
// Let the ordinary startup command buffer finish before the inspection's
// first explicit map, so attract-demo cleanup cannot overwrite its mode.
await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
load('start',[544,790,8],90);
