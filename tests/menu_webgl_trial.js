// One ordinary game instance. Native menu.js owns all menu input and routes;
// this fixture only issues explicit commands and samples public diagnostics.
const panel=document.querySelector('section'),statusNode=document.querySelector('#status'),receiptNode=document.querySelector('#receipt');
for(const type of['mousedown','mouseup','pointerdown','pointerup','touchstart','touchend','keydown','keyup'])panel.addEventListener(type,event=>event.stopPropagation());
const errors=[];window.addEventListener('error',event=>errors.push(event.message));window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label){const end=performance.now()+180000;while(!test()){if(performance.now()>end)throw Error(label+' exceeded setup deadline');await sleep(100);}}
await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer,'native initialization');
const menu=await import('../src/engine/client/menu.js'),adapter=await import('../src/menu_webgl.js'),keys=await import('../src/engine/client/keys.js');
const {cl,cls}=await import('../src/engine/client/client.js'),{sv,svs}=await import('../src/engine/server/server.js');
const {Cbuf_AddText,Cmd_ExecuteString}=await import('../src/engine/common/cmd.js');
const {Cvar_SetValue,Cvar_VariableValue}=await import('../src/engine/common/cvar.js');
const {Draw_GetOverlayCanvas}=await import('../src/gl_draw.js');
const split=await import('../src/r_demosplit.js');
let phase='ready',generation=0,timer=null,deadline=0,lastTime=null,latest=null;
function status(){
 const snapshot=adapter.MainMenu_Snapshot(),delta=lastTime===null?null:sv.time-lastTime;lastTime=sv.time;
 latest={schema:1,at:new Date().toISOString(),phase,source:'quake-menu-final.html',sourceSha256:'0c17c95648f1bcfa20fe2d882814ed11577d2f423cf7682a19535fb889d1f8ce',
  menu:snapshot,native:{menuState:menu.m_state,keyDest:keys.key_dest,keyDestName:keys.key_dest===keys.key_menu?'menu':keys.key_dest===keys.key_game?'game':'console/message',serverActive:sv.active,serverPaused:sv.paused,singlePlayerMenuPause:sv.active&&svs.maxclients===1&&keys.key_dest!==keys.key_game,serverTime:sv.time,serverTimeSinceLastReceipt:delta,clientTime:cl.time,signon:cls.signon,demo:cls.demoplayback,connectedState:cls.state,map:cl.worldmodel?.name||null,newer:Cvar_VariableValue('r_hdr')!==0},
  renderer:{display:[window.renderer.domElement.width,window.renderer.domElement.height],overlay:[Draw_GetOverlayCanvas()?.width,Draw_GetOverlayCanvas()?.height],dpr:devicePixelRatio},errors:[...errors]};
 statusNode.textContent=`${phase} · ${snapshot.ready?'WebGL menu ready':snapshot.error?'native fallback':'loading'} · ${snapshot.skinActive?'menu skin rendered':snapshot.visible?'waiting for frame':'menu closed'} · ${snapshot.layout?.glyphInstances||0} source glyphs · native state ${menu.m_state}, input ${latest.native.keyDestName} · donor RAF ${snapshot.pendingFrame}`;
 receiptNode.textContent=JSON.stringify(latest,null,2);return latest;
}
// Bounded passive sampling, restarted by an explicit fixture action. No second
// animation/game loop is created, and the donor is never rendered here.
function watch(){if(timer)clearInterval(timer);deadline=performance.now()+120000;timer=setInterval(()=>{status();if(performance.now()>=deadline){clearInterval(timer);timer=null;}},250);status();}
function releaseFocus(){document.activeElement?.blur();}
function show(){phase='main menu';releaseFocus();Cmd_ExecuteString('menu_main');watch();}
async function game(){const token=++generation;phase='starting native E1M1';watch();releaseFocus();split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);Cbuf_AddText('maxplayers 1\nr_hdr 1\nr_dynres 1\nbgmvolume 0\nmap e1m1\n');await until(()=>token!==generation||(!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/e1m1.bsp'&&cl.stats[0]>0),'E1M1 signon');if(token===generation)show();}
async function demo(){const token=++generation;phase='starting native demo';watch();releaseFocus();keys.set_key_dest(keys.key_game);Cbuf_AddText('disconnect\nplaydemo demo1\n');await until(()=>token!==generation||(cls.demoplayback&&cls.signon===4),'demo signon');if(token===generation)show();}
function fail(error){phase='fixture action failed';errors.push(String(error));status();}
function download(url,extension){const a=document.createElement('a');a.href=url;a.download=`native-menu-${cls.demoplayback?'demo':sv.active?'game':'title'}-${Date.now()}.${extension}`;document.body.append(a);a.click();a.remove();}
document.querySelector('#show').onclick=show;document.querySelector('#game').onclick=()=>game().catch(fail);document.querySelector('#demo').onclick=()=>demo().catch(fail);
document.querySelector('#classic').onclick=()=>{Cvar_SetValue('r_hdr',0);show();};document.querySelector('#newer').onclick=()=>{Cvar_SetValue('r_hdr',1);show();};
document.querySelector('#refresh').onclick=watch;
document.querySelector('#download').onclick=()=>{const blob=new Blob([JSON.stringify(status(),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob);download(url,'json');setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.querySelector('#png').onclick=()=>{try{const overlay=Draw_GetOverlayCanvas();if(!overlay||!adapter.MainMenu_Snapshot().ready)throw Error('Complete native menu frame required');download(overlay.toDataURL('image/png'),'png');}catch(error){fail(error);}};
document.querySelector('#hide').onclick=()=>{panel.hidden=true;releaseFocus();};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.hidden){panel.hidden=false;event.preventDefault();event.stopImmediatePropagation();watch();}},true);
window.addEventListener('pagehide',()=>{generation++;if(timer)clearInterval(timer);},{once:true});
window.menuWebglTrial={show,game,demo,status,errors};show();
