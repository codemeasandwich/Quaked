const panel=document.querySelector('section'),status=document.querySelector('#status'),errors=[];
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
await import('../main.js');const deadline=performance.now()+120000;
while(!window.Cbuf_AddText){if(performance.now()>deadline)throw Error('Startup timeout');await new Promise(r=>setTimeout(r,50));}
const {Cbuf_AddText}=await import('../src/cmd.js'),{Cvar_SetValue}=await import('../src/cvar.js');
const {cl,cls}=await import('../src/client.js'),{sv}=await import('../src/server.js');
const {SV_LinkEdict,SV_Move}=await import('../src/world.js'),{SV_PushEntity}=await import('../src/sv_phys.js');
const seamless=await import('../src/sv_seamless.js'),{R_LevelPortalCount}=await import('../src/gl_portal.js');
const {renderer}=await import('../src/vid.js');
const keys=await import('../src/keys.js'),split=await import('../src/r_demosplit.js');
let generation=0,ready=false,walk=null;
function face(yaw){const p=sv.edicts?.[1];p.v.angles=[0,yaw,0];p.v.v_angle=[0,yaw,0];p.v.fixangle=1;cl.viewangles.set([0,yaw,0]);}
function place(point,yaw){const p=sv.edicts?.[1],trace=SV_Move(point,p.v.mins,p.v.maxs,point,1,p);if(trace.startsolid||trace.allsolid)throw Error('Trial placement intersects native hull');p.v.flags|=64|128;p.v.movetype=0;p.v.origin=point;p.v.velocity=[0,0,0];face(yaw);SV_LinkEdict(p,false);}
function start(newer=true,map='start'){
 if(walk)clearInterval(walk);ready=false;const previous=sv.edicts?.[1],token=++generation;split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
 Cbuf_AddText('disconnect\nmaxplayers 1\nr_hdr '+Number(newer)+'\nr_demosplit 0\nr_newer_portals 1\nsv_seamless 1\nskill 1\nbgmvolume 0\nmap '+map+'\n');status.textContent='Loading '+(newer?'enhanced passage':'original Classic machine')+'…';
 const until=performance.now()+120000,timer=setInterval(()=>{
  if(token!==generation){clearInterval(timer);return;}
  if(performance.now()>until){clearInterval(timer);status.textContent='Map startup timed out';return;}
  if(sv.edicts?.[1]===previous||cls.demoplayback||cls.signon!==4||!sv.active||cl.worldmodel?.name!=='maps/'+map+'.bsp')return;
  clearInterval(timer);split.R_DemoSplitRelease(true);place(map==='start'?[-64,1740,104]:[-540,-494,480],map==='start'?270:180);ready=true;status.textContent=map!=='start'?'At E1M2’s exit arch — walk across, look back, then walk across again to return.':newer?'Native machine removed; approach the passage, then walk across.':'Original Classic machine and collision retained.';
 },100);
}
document.querySelector('#arch').onclick=()=>start(true,'e1m2');
document.querySelector('#welcome').onclick=()=>start(true);document.querySelector('#classic').onclick=()=>start(false);
document.querySelector('#approach').onclick=()=>{if(!ready)return;const c=seamless.SV_SeamlessCrossings().find(c=>c.back)||seamless.SV_SeamlessCrossings()[0];if(!c)return;place(c.transform.center.map((v,i)=>v-c.transform.through[i]*96),Math.atan2(c.transform.through[1],c.transform.through[0])*180/Math.PI);status.textContent='Inspecting the opening and its measured depth.';};
document.querySelector('#cross').onclick=()=>{
 if(!ready||walk)return;const crossing=seamless.SV_SeamlessCrossings().find(c=>c.back)||seamless.SV_SeamlessCrossings()[0];if(!crossing)return;const from=sv.name,to=crossing.map,through=crossing.transform.through;face(Math.atan2(through[1],through[0])*180/Math.PI);
 let steps=0;status.textContent='Walking through native collision…';walk=setInterval(()=>{
  if(sv.name!==from||++steps>100){clearInterval(walk);walk=null;status.textContent=sv.name===to?'Entered '+to+' seamlessly — look back to inspect the arrival.':'Bounded walk ended';return;}
  SV_PushEntity(sv.edicts?.[1],through.map(v=>v*4));
 },40);
};
document.querySelector('#back').onclick=()=>{if(!ready)return;face(cl.viewangles[1]+180);};
setInterval(()=>{const glError=renderer?.getContext().getError();if(glError)errors.push('GL '+glError);document.querySelector('#report').textContent=JSON.stringify({map:sv.name,glError,viewAngles:Array.from(cl.viewangles),newPassage:sv.worldmodel?.entities?.includes('"_newer_start_corridor" "1"'),position:sv.edicts?.[1]?Array.from(sv.edicts?.[1].v.origin):null,portals:R_LevelPortalCount(),crossings:seamless.SV_SeamlessCrossings().map(c=>({map:c.map,back:c.back||false,oneWay:c.exit?.oneWay||false,center:c.transform.center,opening:c.opening})),errors},null,2);},500);
start();
