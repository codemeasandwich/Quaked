await import('../src/gl_rsurf.js');
const cmd=await import('../src/cmd.js'),menu=await import('../src/menu.js'),keys=await import('../src/keys.js'),draw=await import('../src/gl_draw.js'),cvar=await import('../src/cvar.js');
const expected=['Newer Game features','Customize controls','Performance profiler','Go to console','Reset to defaults','FPS counter','Texture Filtering','Screen size','Brightness','Mouse Speed','Sound Volume','Always Run','Invert Mouse','Lookspring','Lookstrafe','Crosshair'];
function equal(a,b,label){if(a!==b)throw new Error(`${label}: expected ${b}, got ${a}`);}
Deno.test('options order, widgets, keyboard and touch dispatch match the visible rows',async()=>{
 const anim=await import('../src/r_anim.js'),post=await import('../src/gl_post.js'),screen=await import('../src/gl_screen.js'),glq=await import('../src/glquake.js'),view=await import('../src/view.js'),input=await import('../src/cl_input.js'),client=await import('../src/cl_main.js'),sound=await import('../src/sound.js');
 const vars=[anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water,post.r_hdr,screen.scr_viewsize,glq.gl_texturemode,view.v_gamma,input.cl_forwardspeed,input.cl_backspeed,client.sensitivity,client.m_pitch,client.lookspring,client.lookstrafe,sound.volume];
 for(const v of vars)if(!cvar.Cvar_FindVar(v.name))cvar.Cvar_RegisterVariable(v);if(!cvar.Cvar_FindVar('cl_showfps'))cvar.Cvar_RegisterVariable(new cvar.cvar_t('cl_showfps','0'));if(!cvar.Cvar_FindVar('crosshair'))cvar.Cvar_RegisterVariable(new cvar.cvar_t('crosshair','0'));
 const saved=vars.map(v=>v.string),fps=cvar.Cvar_VariableValue('cl_showfps'),cross=cvar.Cvar_VariableValue('crosshair'),oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),bindings=keys.keybindings.slice(),oldDest=keys.key_dest;
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});let profile=0;const glyphs=[];
 try{
  cmd.Cbuf_Init();cmd.Cmd_Init();keys.Key_Init();menu.M_Init();if(!cmd.Cmd_Exists('perfprofile'))cmd.Cmd_AddCommand('perfprofile',()=>profile++);
  menu.M_SetExternals({key_dest_set:keys.set_key_dest,key_dest_get:()=>keys.key_dest,cls:{demonum:-1},sv:{active:false},Draw_CachePic:()=>({width:0,height:0}),Draw_TransPic:()=>{},Draw_Pic:()=>{},Draw_Character:(x,y,code)=>glyphs.push({x,y,code}),Draw_FadeScreen:()=>{},S_LocalSound:()=>{},realtime_get:()=>0});
  const dx=(draw.Draw_GetVirtualWidth()-320)>>1,dy=(draw.Draw_GetVirtualHeight()-200)>>1,w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();
  function touch(row){cmd.Cmd_ExecuteString('menu_options');menu.M_TouchInput(201+dx,32+dy+row*8+2,w,h);}
  cvar.Cvar_SetValue('cl_showfps',1);cvar.Cvar_SetValue('gl_texturemode',0);cmd.Cmd_ExecuteString('menu_options');menu.M_Draw();
  for(let row=0;row<16;row++){const label=glyphs.filter(g=>g.y===32+dy+row*8&&g.x>=16+dx&&g.x<200+dx&&g.code>=128).map(g=>String.fromCharCode(g.code-128)).join('').trim();equal(label,expected[row],'visible label '+row);}
  for(const [row,text] of [[5,'on'],[6,'off']])equal(glyphs.filter(g=>g.y===32+dy+row*8&&g.x>=220+dx&&g.code>=128).map(g=>String.fromCharCode(g.code-128)).join('').trim(),text,'checkbox shares label row '+row);
  touch(0);equal(menu.m_state,menu.m_newer,'top row opens features');menu.M_Keydown(keys.K_ESCAPE);
  touch(1);equal(menu.m_state,menu.m_keys,'second row customizes controls');menu.M_Keydown(keys.K_ESCAPE);
  touch(2);equal(menu.m_state,menu.m_none,'profiler leaves menu');equal(keys.key_dest,keys.key_game,'profiler returns game input');cmd.Cbuf_Execute();equal(profile,1,'profiler command dispatched');
  touch(3);equal(menu.m_state,menu.m_none,'console leaves menu');equal(keys.key_dest,keys.key_console,'console input destination');
  touch(4);cmd.Cbuf_Execute();equal(keys.keybindings[119],'+forward','defaults action retains web movement bindings');equal(view.v_gamma.value,1,'default brightness');
  touch(5);equal(cvar.Cvar_VariableValue('cl_showfps'),0,'FPS touch toggle');menu.M_Keydown(keys.K_RIGHTARROW);equal(cvar.Cvar_VariableValue('cl_showfps'),1,'FPS keyboard toggle');
  touch(6);equal(glq.gl_texturemode.value,1,'filter touch toggle');menu.M_Keydown(keys.K_LEFTARROW);equal(glq.gl_texturemode.value,0,'filter keyboard toggle');
  cvar.Cvar_SetValue('viewsize',80);touch(7);equal(screen.scr_viewsize.value,90,'screen slider touch');menu.M_Keydown(keys.K_LEFTARROW);equal(screen.scr_viewsize.value,80,'screen slider keyboard');
  touch(0);menu.M_Keydown(keys.K_ESCAPE);menu.M_Keydown(keys.K_UPARROW);glyphs.length=0;menu.M_Draw();equal(glyphs.find(g=>g.x===200+dx&&g.code===12).y,32+dy+15*8,'up wraps last visible row');menu.M_Keydown(keys.K_DOWNARROW);glyphs.length=0;menu.M_Draw();equal(glyphs.find(g=>g.x===200+dx&&g.code===12).y,32+dy,'down wraps first row');
 }finally{vars.forEach((v,i)=>cvar.Cvar_Set(v.name,saved[i]));cvar.Cvar_SetValue('cl_showfps',fps);cvar.Cvar_SetValue('crosshair',cross);keys.keybindings.splice(0,keys.keybindings.length,...bindings);keys.set_key_dest(oldDest);if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;}
});
