await import('../src/engine/render/gl_rsurf.js');
const cmd=await import('../src/engine/common/cmd.js');
const keys=await import('../src/engine/client/keys.js');
const menu=await import('../src/engine/client/menu.js');
const draw=await import('../src/engine/render/gl_draw.js');
const {BuildSinglePlayerMenuArt}=await import('../src/menu_art.js');
function equal(a,b,label){if(a!==b)throw new Error(`${label}: expected ${b}, got ${a}`);}
Deno.test('native menu composition preserves sources, dimensions and missing-art fallback',()=>{
 const sources=[{width:232,height:64,canvas:{}},{width:240,height:112,canvas:{}},{width:232,height:64,canvas:{}},{width:176,height:19,canvas:{}}];
 const calls=[],ctx={drawImage(...args){calls.push(args);}},canvas={getContext:()=>ctx};
 const art=BuildSinglePlayerMenuArt(...sources,()=>canvas);
 equal(art.width,232,'original sheet width');equal(art.height,100,'five original-pitch rows');equal(ctx.imageSmoothingEnabled,false,'native pixels');
 equal(calls[0][0],sources[0].canvas,'original single-player source');equal(calls[0].slice(1).join(','),'0,0,232,64,0,20,232,64','whole original sheet shifted exactly one row');
 for(const x of [68,86]){const c=calls.find(c=>c[5]===x);equal(c[6]+c[8]-1,15,'Newer small-cap baseline');}
 for(const call of calls){const [,sx,sy,w,h,x,y,dw,dh]=call;equal(w,dw,'no horizontal glyph scaling');equal(h,dh,'no vertical glyph scaling');if(x<0||y<0||x+w>232||y+h>100)throw new Error('glyph leaves menu bounds');const source=sources.find(s=>s.canvas===call[0]);if(sx<0||sy<0||sx+w>source.width||sy+h>source.height)throw new Error('glyph leaves source bounds');}
 for(const source of sources)equal(Object.keys(source.canvas).length,0,'borrowed source canvas not mutated');
 for(let i=0;i<4;i++){const missing=sources.slice();missing[i]=null;equal(BuildSinglePlayerMenuArt(...missing,()=>{throw new Error('must not allocate without sources');}),null,'missing source falls back');}
});
Deno.test('single-player menu keeps five cursor rows and Newer/classic/load/save/level actions',()=>{
 const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1,innerWidth:640,innerHeight:400}});
 try{
 let dest=keys.key_game;const server={active:false};const pictures=[],commands=[];const ext={width:232,height:100};
 cmd.Cbuf_Init();cmd.Cmd_Init();menu.M_Init();
 for(const name of ['r_hdr','maxplayers','map','r_flashlight','gamma','cl_showfps'])cmd.Cmd_AddCommand(name,()=>commands.push([name,cmd.Cmd_Argv(1)]));
 menu.M_SetExternals({key_dest_set:v=>{dest=v;},key_dest_get:()=>dest,cls:{demonum:-1},sv:server,svs:{maxclients:1},Draw_CachePic:path=>path==='gfx/sp_menu_ext.lmp'?ext:{width:16,height:24,path},Draw_TransPic:(x,y,p)=>pictures.push({x,y,p}),Draw_Pic:()=>{},Draw_Character:()=>{},Draw_FadeScreen:()=>{},S_LocalSound:()=>{},host_time_get:()=>0,IN_RequestPointerLock:()=>{}});
 cmd.Cmd_ExecuteString('menu_singleplayer');
 const dx=(draw.Draw_GetVirtualWidth()-320)>>1,dy=(draw.Draw_GetVirtualHeight()-200)>>1;
 for(let i=0;i<5;i++){pictures.length=0;menu.M_Draw();const dot=pictures.find(p=>p.p.path?.includes('menudot'));equal(dot.x,54+dx,'cursor x');equal(dot.y,32+dy+i*20,'cursor row');const sheet=pictures.find(p=>p.p===ext);equal(sheet.x,72+dx,'sheet x');equal(sheet.y,32+dy,'sheet y');menu.M_Keydown(keys.K_DOWNARROW);}
 pictures.length=0;menu.M_Draw();equal(pictures.find(p=>p.p.path?.includes('menudot')).y,32+dy,'wrap to first row');
 menu.M_Keydown(keys.K_ENTER);cmd.Cbuf_Execute();equal(commands.find(([n])=>n==='r_hdr')[1],'1','Newer Game starts enhanced');equal(commands.find(([n])=>n==='map')[1],'start','Newer Game starts hub');
 commands.length=0;cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_DOWNARROW);menu.M_Keydown(keys.K_ENTER);cmd.Cbuf_Execute();equal(commands.find(([n])=>n==='r_hdr')[1],'0','New Game starts classic');
 cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_DOWNARROW);menu.M_Keydown(keys.K_ENTER);equal(menu.m_state,menu.m_load,'third item loads');server.active=true;
 cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_DOWNARROW);menu.M_Keydown(keys.K_ENTER);equal(menu.m_state,menu.m_save,'fourth item saves');
 cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_DOWNARROW);menu.M_Keydown(keys.K_ENTER);equal(menu.m_state,menu.m_levelselect,'fifth item selects a level');
 cmd.Cmd_ExecuteString('menu_singleplayer');menu.M_Keydown(keys.K_DOWNARROW);menu.M_Keydown(keys.K_ESCAPE);
 }finally{if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;}
});
