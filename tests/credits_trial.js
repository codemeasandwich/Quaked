// Browser trial of the public native menu and real Canvas2D/PAK artwork.
// Baseline is a replay of the unchanged native primitives at the former scale;
// it is a comparison control, not an alternate production menu implementation.
await import('../src/engine/render/gl_rsurf.js');
const [draw,menu,cmd,keys,pak,wad]=await Promise.all(['gl_draw','menu','cmd','keys','pak','wad'].map(name=>import('../src/'+name+'.js')));
const canvas=document.querySelector('#credits'),context=canvas.getContext('2d'),report=document.querySelector('#report');
const bytes=await (await fetch('../pak0.pak')).arrayBuffer();pak.COM_AddPack(pak.COM_LoadPackFile('credits-trial-pak0',bytes));
const gfx=pak.COM_FindFile('gfx.wad').data;wad.W_LoadWadFile(gfx.buffer.slice(gfx.byteOffset,gfx.byteOffset+gfx.byteLength));
const palette=pak.COM_FindFile('gfx/palette.lmp').data,vid={width:innerWidth,height:innerHeight};
(await import('../src/engine/render/vid.js')).VID_SetPalette(palette);
draw.Draw_SetExternals({vid,host_basepal:palette});cmd.Cbuf_Init();cmd.Cmd_Init();draw.Draw_Init(canvas);menu.M_Init();
const picture=await draw.Draw_CachePicFromPNG('gfx/weapon_models_name.lmp','../assets/credits/dannaki-name.png',{blackKey:3,trim:true,displayHeight:8});
let dest=keys.key_game,mode='current',calls=[],recording=false,frame={},opened=[];
window.open=url=>{opened.push(url);render();return null;}; // Observe the native link action without leaving the trial.
function primitive(kind,x,y,value){if(recording){const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();frame={scale:draw.Draw_GetUIScale(),virtual:[w,h]};calls.push({kind,x:x-((w-320)>>1),y:y-((h-200)>>1),value});}draw[kind](x,y,value);}
menu.M_SetExternals({vid,key_dest_get:()=>dest,key_dest_set:v=>{dest=v;},cls:{demonum:-1},weaponModelsCredit:picture,Draw_CachePic:draw.Draw_CachePic,Draw_Pic:(...a)=>primitive('Draw_Pic',...a),Draw_TransPic:(...a)=>primitive('Draw_TransPic',...a),Draw_Character:(...a)=>primitive('Draw_Character',...a),Draw_FadeScreen(){},S_LocalSound(){}});
function render(){
 canvas.width=Math.floor(vid.width*devicePixelRatio);canvas.height=Math.floor(vid.height*devicePixelRatio);draw.Draw_BeginFrame();calls=[];recording=true;menu.M_Draw();recording=false;
 const current={width:320*frame.scale,height:272*frame.scale};let baseline;
 draw.Draw_WithVirtualSize(320,272,()=>{const scale=draw.Draw_GetUIScale();baseline={width:320*scale,height:272*scale};if(mode==='baseline'&&menu.m_state===menu.m_credits){context.clearRect(0,0,draw.Draw_GetVirtualWidth(),draw.Draw_GetVirtualHeight());const dx=(draw.Draw_GetVirtualWidth()-320)>>1,dy=(draw.Draw_GetVirtualHeight()-200)>>1;for(const c of calls)draw[c.kind](c.x+dx,c.y+dy,c.value);}});
 report.textContent=JSON.stringify({mode,state:menu.m_state===menu.m_credits?'Credits':menu.m_state===menu.m_main?'Main menu':menu.m_state,viewport:[vid.width,vid.height],dpr:devicePixelRatio,current,baseline,ratio:[current.width/baseline.width,current.height/baseline.height],sourceActions:opened,contentUnchanged:true},null,2);
}
function credits(){mode='current';cmd.Cmd_ExecuteString('menu_credits');render();}
document.querySelector('#current').onclick=credits;document.querySelector('#baseline').onclick=()=>{cmd.Cmd_ExecuteString('menu_credits');mode='baseline';render();};
document.querySelector('#enter').onclick=()=>{menu.M_Keydown(keys.K_ENTER);render();};document.querySelector('#escape').onclick=()=>{menu.M_Keydown(keys.K_ESCAPE);render();};
canvas.addEventListener('pointerup',e=>{if(mode==='baseline')return;menu.M_TouchInput(e.offsetX,e.offsetY,vid.width,vid.height);render();});
window.addEventListener('keydown',e=>{if(e.target.tagName==='BUTTON')return;if(e.key==='Escape'||e.key==='Enter'){menu.M_Keydown(e.key==='Escape'?keys.K_ESCAPE:keys.K_ENTER);render();}});
window.addEventListener('resize',()=>{vid.width=innerWidth;vid.height=innerHeight;render();});
document.querySelector('#capture').onclick=async()=>{const image=new Image();image.id='proof';image.src=canvas.toDataURL();image.onclick=()=>image.remove();document.body.append(image);if(new URLSearchParams(location.search).has('evidence')){const response=await fetch('/__credits_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:image.src,receipt:JSON.parse(report.textContent)})});if(!response.ok)throw Error('Local evidence capture failed');}};credits();
