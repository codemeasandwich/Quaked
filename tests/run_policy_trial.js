// One native game. Buttons move the player into real difficulty trigger volumes,
// so the shipped QuakeC touch function, not a replacement rule, selects skill.
const panel=document.querySelector('section'),errors=[];
window.addEventListener('error',event=>errors.push(event.message));
for(const kind of ['keydown','keyup','mousedown','mouseup','pointerdown','pointerup'])panel.addEventListener(kind,event=>event.stopPropagation());
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(resolve=>setTimeout(resolve,50));
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js'),{Cvar_VariableValue}=await import('../src/engine/common/cvar.js');
const {cl,cls}=await import('../src/engine/client/client.js'),{sv}=await import('../src/engine/server/server.js');
const {PR_GetString}=await import('../src/engine/progs/progs.js'),{SV_LinkEdict}=await import('../src/engine/server/world.js');
const run=await import('../src/newer/render/r_flashlightrun.js'),rock=await import('../src/newer/render/r_rockfield.js');
const split=await import('../src/newer/render/r_demosplit.js'),keys=await import('../src/engine/client/keys.js');
let witness=null;
function hub(){split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);Cbuf_AddText('maxplayers 1\nr_hdr 1\nr_newer_lighting 1\nr_newer_normals 1\nr_newer_shadows 1\nr_pointshadows 1\nr_heightshadows 1\ngamma .75\ncl_showfps 1\nr_dynres 1\nmap start\n');}
document.querySelector('#hub').onclick=hub;
for(const [name,skill]of [['easy',0],['normal',1],['hard',2],['nightmare',3]])document.querySelector('#'+name).onclick=()=>{
 if(sv.name!=='start'||cls.signon!==4)return;
 const trigger=sv.edicts.find(ed=>!ed.free&&PR_GetString(ed.v.classname)==='trigger_setskill'&&Number(PR_GetString(ed.v.message))===skill);
 if(!trigger){witness={error:'Native corridor trigger not found',skill};return;}
 const player=sv.edicts[1],origin=trigger.v.absmin.map((v,k)=>(v+trigger.v.absmax[k])/2);
 // Touch the corridor-facing edge, before the adjacent native teleport can fire.
 origin[1]=skill===3?trigger.v.absmax[1]-player.v.mins[1]-2:trigger.v.absmin[1]-player.v.maxs[1]+2;
 player.v.origin=Array.from(origin);player.v.velocity=[0,0,0];player.v.flags|=64|128;
 SV_LinkEdict(player,true);witness={classname:PR_GetString(trigger.v.classname),message:PR_GetString(trigger.v.message),trigger:trigger.num,player:Array.from(player.v.origin),playerClass:PR_GetString(player.v.classname),touch:trigger.v.touch,solid:trigger.v.solid,triggerBounds:[Array.from(trigger.v.absmin),Array.from(trigger.v.absmax)],requestedOrigin:Array.from(origin)};
};
document.querySelector('#flash').onclick=()=>Cbuf_AddText('flashlight\n');
document.querySelector('#restart').onclick=()=>Cbuf_AddText('restart\n');
document.querySelector('#hide').onclick=()=>panel.hidden=true;
setInterval(()=>{document.querySelector('#status').textContent=JSON.stringify({level:cl.worldmodel?.name,signon:cls.signon,skill:Cvar_VariableValue('skill'),flashlight:Cvar_VariableValue('r_flashlight'),run:run.R_FlashlightRunStatus(),preparedMaps:rock.R_RockfieldStatus(),nativeCorridor:witness,glError:window.renderer?.getContext().getError(),errors},null,2);},250);
hub();
