// One ordinary engine. The buttons enter the actual public menus; no direct
// map commands or post-signon feature enabling can hide a launch wiring bug.
const panel=document.querySelector('section'),errors=[];
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
await import('../main.js');while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,50));
const cmd=await import('../src/engine/common/cmd.js'),menu=await import('../src/menu.js'),draw=await import('../src/gl_draw.js'),vars=await import('../src/engine/common/cvar.js');
const {sv}=await import('../src/engine/server/server.js'),{cl,cls}=await import('../src/client.js'),{SV_LinkEdict}=await import('../src/engine/server/world.js');
const loading=await import('../src/r_demoloading.js'),rock=await import('../src/r_rockfield.js'),textures=await import('../src/r_newertextures.js');
const weapons=await import('../src/r_weapons.js'),skins=await import('../src/r_newerskins.js'),powerups=await import('../src/r_powerups.js'),anim=await import('../src/r_anim.js');
// Independent expected contract, not generated from the production baseline.
const expected=['r_newer_lighting','r_newer_normals','r_newer_shadows','r_pointshadows','r_heightshadows','r_rockfield','r_powerups','r_newer_weapons','r_newer_textures','r_newer_water','r_newer_enemies','r_newer_portals','r_newer_hud','r_decals','r_lerpmodels','r_newer_variety'];
let launch=null,deadline=0;
const switches=()=>Object.fromEntries(expected.map(n=>[n,vars.Cvar_VariableValue(n)]));
function touch(x,y){const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(x+(w-320)/2,y+(h-200)/2,w,h);}
function start(mode){
 if(document.querySelector('#disabled').checked)for(const n of expected)vars.Cvar_SetValue(n,0);
 launch={mode,before:switches(),previousPlayer:sv.edicts?.[1],previousMap:cl.worldmodel};deadline=performance.now()+180000;
 cmd.Cmd_ExecuteString('menu_singleplayer');
 if(mode==='level'){touch(100,122);touch(100,88);}else touch(100,mode==='classic'?62:42);
 document.querySelector('#status').textContent='Starting through the normal '+(mode==='classic'?'New Game':'Newer Game')+' menu…';
}
document.querySelector('#newer').onclick=()=>start('newer');document.querySelector('#level').onclick=()=>start('level');document.querySelector('#classic').onclick=()=>start('classic');
document.querySelector('#wall').onclick=()=>{if(!sv.active||cls.signon!==4||loading.R_IntroLoadingHolding()||cl.worldmodel?.name!=='maps/start.bsp')return;const p=sv.edicts[1];p.v.flags|=64|128;p.v.movetype=0;p.v.origin=[864,1008,-39.969];p.v.velocity=[0,0,0];p.v.angles=[0,0,0];p.v.v_angle=[0,0,0];p.v.fixangle=1;cl.viewangles.set([0,0,0]);SV_LinkEdict(p,false);vars.Cvar_SetValue('scr_centertime',0);};
document.querySelector('#hide').onclick=()=>panel.hidden=true;document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel.hidden){panel.hidden=false;e.preventDefault();e.stopImmediatePropagation();}},true);
setInterval(()=>{
 if(!launch)return;const state=loading.R_DemoLoadingStatus(),values=switches(),ready=sv.edicts?.[1]!==launch.previousPlayer&&cls.signon===4&&!loading.R_IntroLoadingHolding();
 const enabled=expected.every(n=>values[n]===1),classic=launch.mode==='classic';
 document.querySelector('#status').textContent=ready?(classic?'Native New Game ready.':enabled?'Normal Newer Game ready — all enhancement switches enabled.':'FAIL — an enhancement is disabled.'):(performance.now()>deadline?'Startup still waiting — see diagnostics.':'Loading enhanced assets through the normal game…');
 document.querySelector('#report').textContent=JSON.stringify({mode:launch.mode,ready,allEnhancementSwitchesEnabled:enabled,previous:launch.before,switches:values,hdr:vars.Cvar_VariableValue('r_hdr'),newerGame:anim.R_NewerGame(),map:cl.worldmodel?.name,signon:cls.signon,loading:state,rock:rock.R_RockfieldStatus(),textures:textures.R_NewerTexturesStatus(cl.worldmodel),weapons:weapons.R_WeaponStatus(),skins:skins.R_NewerSkinsStatus(cl.model_precache.filter(Boolean)),powerups:powerups.R_PowerupStatus(),flashlight:vars.Cvar_VariableValue('r_flashlight'),glError:window.renderer.getContext().getError(),errors},null,2);
},250);
document.querySelector('#status').textContent='Ready to start through the normal menu. The checked test first disables every enhancement.';
