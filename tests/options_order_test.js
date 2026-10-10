await import('../src/engine/render/gl_rsurf.js');
const cmd=await import('../src/engine/common/cmd.js'),menu=await import('../src/engine/client/menu.js'),keys=await import('../src/engine/client/keys.js'),draw=await import('../src/engine/render/gl_draw.js'),cvar=await import('../src/engine/common/cvar.js');
const expected=['Newer Game features','Customize controls','Performance profiler','Go to console','Reset to defaults','FPS counter','Texture Filtering','Screen size','Brightness','Mouse Speed','Sound Volume','Music Volume','Always Run','Invert Mouse','Lookspring','Lookstrafe','Crosshair','Cheats'];
function equal(a,b,label){if(a!==b)throw new Error(`${label}: expected ${b}, got ${a}`);}
Deno.test('options order, widgets, keyboard and touch dispatch match the visible rows',async()=>{
 const mode = await import('../src/newer/mode.js'),post=await import('../src/newer/render/gl_post.js'),screen=await import('../src/engine/render/gl_screen.js'),glq=await import('../src/engine/render/glquake.js'),view=await import('../src/engine/client/view.js'),input=await import('../src/engine/client/cl_input.js'),client=await import('../src/engine/client/cl_main.js'),sound=await import('../src/engine/sound/sound.js');
 const vars=[mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_water,post.r_hdr,screen.scr_viewsize,glq.gl_texturemode,view.v_gamma,input.cl_forwardspeed,input.cl_backspeed,client.sensitivity,client.m_pitch,client.lookspring,client.lookstrafe,sound.volume,sound.bgmvolume];
 for(const v of vars)if(!cvar.Cvar_FindVar(v.name))cvar.Cvar_RegisterVariable(v);if(!cvar.Cvar_FindVar('cl_showfps'))cvar.Cvar_RegisterVariable(new cvar.cvar_t('cl_showfps','0'));if(!cvar.Cvar_FindVar('crosshair'))cvar.Cvar_RegisterVariable(new cvar.cvar_t('crosshair','0'));
 const saved=vars.map(v=>v.string),fps=cvar.Cvar_VariableValue('cl_showfps'),cross=cvar.Cvar_VariableValue('crosshair'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),bindings=keys.keybindings.slice(),oldDest=keys.key_dest,oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),storage=new Map();
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});let profile=0;const glyphs=[];
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}});
  cmd.Cbuf_Init();cmd.Cmd_Init();keys.Key_Init();menu.M_Init();if(!cmd.Cmd_Exists('perfprofile'))cmd.Cmd_AddCommand('perfprofile',()=>profile++);
  menu.M_SetExternals({key_dest_set:keys.set_key_dest,key_dest_get:()=>keys.key_dest,cls:{demonum:-1},sv:{active:false},Draw_CachePic:()=>({width:0,height:0}),Draw_TransPic:()=>{},Draw_Pic:()=>{},Draw_Character:(x,y,code)=>glyphs.push({x,y,code}),Draw_FadeScreen:()=>{},S_LocalSound:()=>{},realtime_get:()=>0});
  const dx=(draw.Draw_GetVirtualWidth()-320)>>1,dy=(draw.Draw_GetVirtualHeight()-200)>>1,w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();
  function touch(row){cmd.Cmd_ExecuteString('menu_options');menu.M_TouchInput(201+dx,32+dy+row*8+2,w,h);}
  cvar.Cvar_SetValue('cl_showfps',1);cvar.Cvar_SetValue('gl_texturemode',0);cmd.Cmd_ExecuteString('menu_options');menu.M_Draw();
  for(let row=0;row<18;row++){const label=glyphs.filter(g=>g.y===32+dy+row*8&&g.x>=16+dx&&g.x<200+dx&&g.code>=128).map(g=>String.fromCharCode(g.code-128)).join('').trim();equal(label,expected[row],'visible label '+row);}
  for(const [row,text] of [[5,'on'],[6,'off']])equal(glyphs.filter(g=>g.y===32+dy+row*8&&g.x>=220+dx&&g.code>=128).map(g=>String.fromCharCode(g.code-128)).join('').trim(),text,'checkbox shares label row '+row);
  touch(0);equal(menu.m_state,menu.m_newer,'top row opens features');menu.M_Keydown(keys.K_ESCAPE);
  touch(1);equal(menu.m_state,menu.m_keys,'second row customizes controls');menu.M_Keydown(keys.K_ESCAPE);
  touch(2);equal(menu.m_state,menu.m_none,'profiler leaves menu');equal(keys.key_dest,keys.key_game,'profiler returns game input');cmd.Cbuf_Execute();equal(profile,1,'profiler command dispatched');
  touch(3);equal(menu.m_state,menu.m_none,'console leaves menu');equal(keys.key_dest,keys.key_console,'console input destination');
  cvar.Cvar_SetValue('volume',.2);cvar.Cvar_SetValue('bgmvolume',.3);touch(4);cmd.Cbuf_Execute();equal(sound.volume.value,.4,'default sound volume');equal(sound.bgmvolume.value,1,'default music volume');equal(keys.keybindings[119],'+forward','defaults action retains web movement bindings');equal(view.v_gamma.value,1,'default brightness');
  touch(5);equal(cvar.Cvar_VariableValue('cl_showfps'),0,'FPS touch toggle');menu.M_Keydown(keys.K_RIGHTARROW);equal(cvar.Cvar_VariableValue('cl_showfps'),1,'FPS keyboard toggle');
  touch(6);equal(glq.gl_texturemode.value,1,'filter touch toggle');menu.M_Keydown(keys.K_LEFTARROW);equal(glq.gl_texturemode.value,0,'filter keyboard toggle');
  cvar.Cvar_SetValue('viewsize',80);touch(7);equal(screen.scr_viewsize.value,90,'screen slider touch');menu.M_Keydown(keys.K_LEFTARROW);equal(screen.scr_viewsize.value,80,'screen slider keyboard');
  cvar.Cvar_SetValue('volume',.4);cvar.Cvar_SetValue('bgmvolume',.5);
  touch(11);equal(sound.bgmvolume.value,.6,'music slider touch');equal(sound.volume.value,.4,'music touch preserves sound volume');menu.M_Keydown(keys.K_LEFTARROW);equal(sound.bgmvolume.value,.5,'music slider keyboard');
  touch(10);equal(sound.volume.value,.5,'sound slider touch');equal(sound.bgmvolume.value,.5,'sound touch preserves music volume');menu.M_Keydown(keys.K_LEFTARROW);equal(sound.volume.value,.4,'sound slider keyboard');
  for(const [row,v,other] of [[10,sound.volume,sound.bgmvolume],[11,sound.bgmvolume,sound.volume]]){
   cvar.Cvar_SetValue(v.name,1);const preserved=other.value;touch(row);equal(v.value,1,v.name+' touch clamps maximum');
   cvar.Cvar_SetValue(v.name,0);menu.M_Keydown(keys.K_LEFTARROW);equal(v.value,0,v.name+' keyboard clamps minimum');equal(other.value,preserved,v.name+' clamping preserves other volume');
  }
  cvar.Cvar_SetValue('volume',.4);cvar.Cvar_SetValue('bgmvolume',.5);const archived=cvar.Cvar_WriteVariables();equal(archived.includes('volume "0.400000"\n'),true,'sound volume archived');equal(archived.includes('bgmvolume "0.500000"\n'),true,'music volume archived separately');equal(storage.get('quake_cvar_volume'),'0.400000','sound setting persisted');equal(storage.get('quake_cvar_bgmvolume'),'0.500000','music setting persisted independently');
  glyphs.length=0;menu.M_Draw();equal(glyphs.find(g=>g.code===131&&g.y===32+dy+10*8).x,220+dx+28,'sound knob matches its own volume');equal(glyphs.find(g=>g.code===131&&g.y===32+dy+11*8).x,220+dx+36,'music knob matches its own volume');
  touch(0);menu.M_Keydown(keys.K_ESCAPE);menu.M_Keydown(keys.K_UPARROW);glyphs.length=0;menu.M_Draw();equal(glyphs.find(g=>g.x===200+dx&&g.code===12).y,32+dy+17*8,'up wraps last visible row');menu.M_Keydown(keys.K_DOWNARROW);glyphs.length=0;menu.M_Draw();equal(glyphs.find(g=>g.x===200+dx&&g.code===12).y,32+dy,'down wraps first row');
 }finally{vars.forEach((v,i)=>cvar.Cvar_Set(v.name,saved[i]));cvar.Cvar_SetValue('cl_showfps',fps);cvar.Cvar_SetValue('crosshair',cross);keys.keybindings.splice(0,keys.keybindings.length,...bindings);keys.set_key_dest(oldDest);if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete globalThis.localStorage;}
});
