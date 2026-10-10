// Public native menu routing and the supplied menu's placement on the original
// menu geometry. WebGL calls are recording endpoints: these checks do not claim
// GPU shader/pixel proof (tests/menu_webgl_gpu_trial.html and the live capture do).
import {readFileSync} from 'node:fs';
import * as menu from '../src/engine/client/menu.js';
import * as draw from '../src/engine/render/gl_draw.js';
import * as gpu from '../src/newer/ui/menu_webgl.js';
import * as cmd from '../src/engine/common/cmd.js';
import * as keys from '../src/engine/client/keys.js';
import * as pak from '../src/engine/common/pak.js';
import {W_LoadWadFile} from '../src/engine/common/wad.js';
const check=(value,label)=>{if(!value)throw Error(label);};
const same=(a,b,label)=>check(a===b,`${label}: ${a} != ${b}`);
const raw=readFileSync(new URL('../pak0.pak',import.meta.url));
pak.COM_AddPack(pak.COM_LoadPackFile('menu-public-test',raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.length)));
const wad=pak.COM_FindFile('gfx.wad').data;W_LoadWadFile(wad.buffer.slice(wad.byteOffset,wad.byteOffset+wad.length));
cmd.Cbuf_Init();cmd.Cmd_Init();menu.M_Init();

function webgl(){
 let id=0;const constants=new Map([['FRAMEBUFFER_COMPLETE',0x8cd5],['NO_ERROR',0],['VIEWPORT',0x0ba2]]);
 const special={getParameter:key=>key===constants.get('VIEWPORT')?[0,0,1280,800]:8192,getShaderParameter:()=>true,getProgramParameter:()=>true,getShaderInfoLog:()=>'',getProgramInfoLog:()=>'',getError:()=>0,
  checkFramebufferStatus:()=>constants.get('FRAMEBUFFER_COMPLETE'),getUniformLocation:(_program,name)=>name,
  readPixels:(_x,_y,w,h,_format,_type,pixels)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=(y*w+x)*4;pixels[at]=x>w*.4&&x<w*.6?255:0;pixels[at+3]=255;}}};
 return new Proxy(special,{get(target,key){if(key in target)return target[key];if(typeof key==='string'&&key===key.toUpperCase()){if(!constants.has(key))constants.set(key,key==='NO_ERROR'?0:++id);return constants.get(key);}if(String(key).startsWith('create'))return ()=>({id:++id});return ()=>{};}});
}

async function fixture(run,{failure=false,pics={}}={}){
 const names=['window','document','Image','HTMLCanvasElement','matchMedia','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'],saved=Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const copies=[],fallback=[],opened=[],listeners=[],context={save(){},restore(){},setTransform(...args){this.transform=args;},clearRect(){},fillRect(){},putImageData(){},createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}),drawImage(...args){copies.push({args,transform:this.transform?.slice(),shadow:{blur:this.shadowBlur,offset:this.shadowOffsetX,color:this.shadowColor}});}};
 class Canvas extends EventTarget {constructor(){super();this.width=1280;this.height=800;this.style={};}getContext(kind){return kind==='webgl2'?(failure?null:(this.gl||=webgl())):context;}getBoundingClientRect(){return {x:0,y:0,left:0,top:0,width:0,height:0};}addEventListener(type,...args){listeners.push(type);return super.addEventListener(type,...args);}}
 const win=new EventTarget();Object.assign(win,{devicePixelRatio:1,innerWidth:1280,innerHeight:800,open:url=>opened.push(url)});
 const doc=new EventTarget();Object.assign(doc,{hidden:false,fullscreenElement:null,createElement:()=>new Canvas(),body:{appendChild(){}}});
 const globals={window:win,document:doc,HTMLCanvasElement:Canvas,Image:class{set src(value){this.width=this.height=128;queueMicrotask(()=>this.onload?.());}},matchMedia:()=>Object.assign(new EventTarget(),{matches:false}),requestAnimationFrame:()=>{throw Error('Externally driven menu must not schedule RAF');},cancelAnimationFrame(){},ResizeObserver:class{constructor(){throw Error('Detached menu must not own resize observer');}}};
 for(const[name,value]of Object.entries(globals))Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 const overlay=new Canvas();let dest=keys.key_game,changes=0,time=1;
 const client={state:0,demonum:-1,demoplayback:false},server={active:false};
 try{
  gpu.MainMenu_Destroy();draw.Draw_SetExternals({vid:{width:1280,height:800}});draw.Draw_Init(overlay);
  menu.M_SetExternals({key_dest_get:()=>dest,key_dest_set:value=>{dest=value;changes++;},cls:client,sv:server,svs:{maxclients:1},Draw_CachePic:path=>pics[path]||({width:16,height:16,path}),Draw_TransPic:(x,y,p)=>fallback.push({x,y,p}),Draw_Pic(){},Draw_SubPic(){},Draw_Character(){},Draw_FadeScreen(){},S_LocalSound(){},host_time_get:()=>time,realtime_get:()=>time,IN_RequestPointerLock(){}});
  const api={client,server,overlay,copies,fallback,opened,listeners,get dest(){return dest;},get changes(){return changes;},
   render(){time+=.016;menu.M_Draw();return gpu.MainMenu_Snapshot();},
   open(){cmd.Cmd_ExecuteString('menu_main');return this.render();},
   size(w,h,dpr){win.devicePixelRatio=dpr;win.innerWidth=w;win.innerHeight=h;overlay.width=w*dpr;overlay.height=h*dpr;draw.Draw_SetExternals({vid:{width:w,height:h}});return this.render();},
   async ready(){this.open();for(let i=0;i<500;i++){const state=this.render();if(state.ready||state.error)return state;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Bounded donor initialization did not settle');},
   frame(){return gpu.MainMenu_Frame();}
  };await run(api);
 }finally{gpu.MainMenu_Destroy();for(const[name,descriptor]of Object.entries(saved))if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
}

// A fake stock picture: opaque `rects` ({x,y,w,h} in picture units) over a transparent field,
// so placement is checked against pixels with a known answer.
function picture(path,width,height,rects){
 const data=new Uint8ClampedArray(width*height*4);
 for(const r of rects)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)data[(y*width+x)*4+3]=255;
 return {width,height,path,canvas:{width,height,getContext:()=>({getImageData:()=>({data})})}};
}
// `rows` bands of 20 units, each with an ink box x 2..61, y +3..+19, plus optional extras.
function sheet(path,rows,extras=[]){
 const rects=[];for(let r=0;r<rows;r++)rects.push({x:2,y:r*20+3,w:59,h:16});
 return picture(path,100,rows*20,rects.concat(extras));
}
const six=[['singleplayer',menu.m_singleplayer],['multiplayer',menu.m_multiplayer],['bestiarium',menu.m_bestiary],['options',menu.m_options],['credits',menu.m_credits],['quit',menu.m_quit]];

Deno.test('skinned main menu keeps native keyboard and touch routing: each action fires exactly once',()=>fixture(async api=>{
 check((await api.ready()).ready,'supplied renderer is ready');
 const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight(),ox=(w-320)/2,oy=(h-200)/2;
 // The native cursor persists between openings; mirror it through public key presses.
 let cursor=0;
 for(const inGame of[false,true]){
  api.server.active=inGame;api.client.state=inGame?2:0;const actions=inGame?[['continue',menu.m_none],...six]:six;
  for(let row=0;row<actions.length;row++){
   api.open();while(cursor!==row){menu.M_Keydown(keys.K_DOWNARROW);cursor=(cursor+1)%actions.length;}
   const before=api.changes;menu.M_Keydown(keys.K_ENTER);
   same(menu.m_state,actions[row][1],'keyboard activates '+actions[row][0]);same(api.changes-before,1,'one native destination change per keyboard activation');
   if(actions[row][0]==='continue')same(api.dest,keys.key_game,'Continue restores game input');
  }
 }
 // Native 20-unit row grid is still the touch map (not a separate GPU hit map).
 api.server.active=false;api.client.state=0;
 for(let row=0;row<six.length;row++){
  api.open();const before=api.changes;menu.M_TouchInput(100+ox,42+row*20+oy,w,h);
  same(menu.m_state,six[row][1],'touch activates '+six[row][0]);same(api.changes-before,1,'one touch is one native activation');
 }
 same(api.opened.length,0,'root activation never triggers a child Credits/Quit action');
 for(let n=0;n<8;n++)api.render();
 same(gpu.MainMenu_Snapshot().pendingFrame,0,'engine owns frame scheduling');
 check(!api.listeners.some(t=>['keydown','pointerdown','pointermove'].includes(t)),'renderer owns no second input path');
}));

Deno.test('item sheets: lettering is placed on the original sprite ink, row pitch preserved, exact labels',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const scale=draw.Draw_GetUIScale(),ox=(draw.Draw_GetVirtualWidth()-320)/2;
 api.server.active=false;api.client.state=0;
 api.open();
 const text=()=>api.frame().commands.filter(c=>c.type==='text'&&c.kind===0&&c.text.length>1);
 // Not in game: the engine draws sheet rows 1..6 starting at row 1 (srcY 21).
 let rows=text();same(rows.map(c=>c.text).join('|'),'','no sheet pictures yet: nothing guessed');
 api.fallback.length=0;
 const main=sheet('gfx/mainmenu_ext.lmp',7),multi=sheet('gfx/mp_menu.lmp',3),single=sheet('gfx/sp_menu_ext.lmp',5);
 await fixture(async inner=>{
  check((await inner.ready()).ready,'ready (inner)');
  const s=draw.Draw_GetUIScale(),offX=(draw.Draw_GetVirtualWidth()-320)>>1; // the engine centres with an integer shift
  inner.server.active=false;inner.client.state=0;inner.open();
  rows=inner.frame().commands.filter(c=>c.type==='text'&&c.kind===0&&c.text.length>1);
  same(rows.map(c=>c.text).join('|'),'Single Player|Multiplayer|Bestiarium|Options|Credits|Quit','main labels match the sheet, Continue absent outside a game');
  for(let i=1;i<rows.length;i++)check(Math.abs(rows[i].box.y-rows[i-1].box.y-20*s)<.01,'target ink boxes are exactly 20 units apart: '+(rows[i].box.y-rows[i-1].box.y));
  const first=rows[0];check(Math.abs(first.box.x-(72+offX+2+1.5)*s)<.01,'left edge sits on the sprite ink edge (plus the fixed soft-edge inset)');
  check(Math.abs(first.box.h-16*s)<.01,'box height is the measured ink height, not a guessed constant');
  check(rows.every(c=>c.y>=c.box.y-c.box.h*.25&&c.y<=c.box.y+c.box.h*.25),'each label stays vertically centred on its original ink box');
  check(rows.every(c=>c.stretch>0&&c.size>0&&Number.isFinite(c.stretch)),'every label is fitted to a finite box');
  inner.server.active=true;inner.client.state=2;inner.open();
  same(inner.frame().commands.filter(c=>c.type==='text'&&c.kind===0&&c.text.length>1)[0].text,'Continue','Continue is the first row only in a live game');
 },{pics:{'gfx/mainmenu_ext.lmp':main,'gfx/mp_menu.lmp':multi,'gfx/sp_menu_ext.lmp':single}});
}));

Deno.test('engine text keeps its fixed 8-unit character grid and right alignment',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const s=draw.Draw_GetUIScale(),ox=(draw.Draw_GetVirtualWidth()-320)/2,oy=(draw.Draw_GetVirtualHeight()-200)/2;
 menu.M_Keydown(keys.K_ESCAPE);cmd.Cmd_ExecuteString('menu_quit');api.render();
 const chars=api.frame().commands.filter(c=>c.type==='text'&&c.text.length===1);
 check(chars.length>=20,'quit prompt is drawn per character');
 const line1='  Are you sure you want'.toUpperCase();let at=0;
 for(let i=0;i<line1.length;i++){if(line1[i]===' ')continue;
  const c=chars.find(k=>k.text===line1[i]&&k.y<(84+oy+4)*s&&Math.abs(k.x-((64+ox)+i*8)*s)<=8*s);
  check(c,'character '+i+' stays inside its own 8-unit cell');at++;}
 check(at>10,'checked a meaningful run of characters');
 check(chars.every(c=>c.stretch<=1+1e-9),'glyphs only condense to fit a cell, never overflow it');
}));

Deno.test('pictures without a replacement are layered above the renderer, not hidden under its panels',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const art={width:40,height:10,canvas:{width:160,height:40}};
 api.open();const frameBefore=api.copies.length;gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
 same(gpu.MainMenu_Image(10,10,art),true,'unreplaced artwork is taken over');
 const blit=api.frame().blits.at(-1);check(blit&&blit.pic===art&&blit.smooth===false,'queued as an unsmoothed full-picture blit, like the native raster');
 same(gpu.MainMenu_Image(10,10,{width:8,height:8,path:'gfx/bigbox.lmp',canvas:{width:8,height:8}}),false,'portrait frame stays native so the translated portrait remains visible');
 gpu.MainMenu_End(1);
 const order=api.copies.slice(frameBefore).map(c=>c.args[0]?.gl?'renderer':'picture');
 same(order.filter((v,i)=>v!==order[i-1]).join(),'renderer,picture','this frame copies the renderer output (its soft shadow passes then the crisp image) first and the picture after it, so panels cannot cover it');
}));

Deno.test('WebGL failure leaves the native menu drawing, keyboard and touch functional',()=>fixture(async api=>{
 const state=await api.ready();check(state.error&&!state.ready,'missing WebGL is an explicit settled failure');check(api.fallback.length>0,'existing native menu still draws');
 same(gpu.MainMenu_Image(0,0,{width:1,height:1,path:'gfx/ttl_main.lmp'}),false,'failed renderer never swallows native pictures');
 const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(100+(w-320)/2,42+(h-200)/2,w,h);same(menu.m_state,menu.m_singleplayer,'native fallback first row works');
 api.open();menu.M_Keydown(keys.K_ESCAPE);same(menu.m_state,menu.m_none,'fallback Escape returns native game');
},{failure:true}));

Deno.test('closing the menu releases the frame and leaves nothing scheduled',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 api.open();menu.M_Keydown(keys.K_ESCAPE);api.render();
 same(gpu.MainMenu_Snapshot().visible,false,'closed menu is not visible');same(api.frame().commands.length,0,'no commands survive a closed frame');
 gpu.MainMenu_Destroy();same(gpu.MainMenu_Snapshot().ready,false,'destroy releases the renderer');
}));

Deno.test('a descender from the row above cannot widen the next label (stock Load/New Game overlap)',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 // Row 1's window top (y 40..42) holds a swash far to the right of the real letters.
 const multi=sheet('gfx/mp_menu.lmp',3,[{x:84,y:40,w:12,h:2}]);
 await fixture(async inner=>{
  check((await inner.ready()).ready,'ready (inner)');
  const s=draw.Draw_GetUIScale();inner.server.active=false;inner.open();
  gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
  same(gpu.MainMenu_Image(0,0,multi,0),true,'multiplayer sheet placed');
  const rows=inner.frame().commands.filter(c=>c.type==='text');
  same(rows.length,3,'three labels');
  check(Math.abs(rows[2].box.w-(59-1.5*1.6)*s)<.01,'third label width comes from the core band, not the swash: '+rows[2].box.w/s);
 },{pics:{}});
}));

Deno.test('selector is placed from the sprite cell, identically on every rotation frame',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 api.open();gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
 const seen=new Set();
 for(let f=1;f<=6;f++){
  gpu.MainMenu_Image(100,50,{width:16,height:24,path:'gfx/menudot'+f+'.lmp'});
  const c=api.frame().commands.filter(k=>k.type==='selector').at(-1);seen.add([c.x,c.y,c.size].join());
 }
 same(seen.size,1,'six frames give one selector position and size, so the layout is not rebuilt at 10 Hz');
}));

Deno.test('sliders and text boxes follow the native cell geometry',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const s=draw.Draw_GetUIScale();
 api.open();gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
 gpu.MainMenu_Slider(100,40,96,.5);
 const [track,knob]=api.frame().commands.filter(c=>c.type==='panel');
 check(track.well&&Math.abs(track.w-96*s)<.01,'track is the 12-cell well, 96 units');
 check(Math.abs((knob.x+knob.w/2)-(track.x+(8+72*.5)*s+4*s))<.01,'knob sits on the engine cell x+72*range');
 // Quit-style box: the original border tiles leave a 5-unit transparent margin each side.
 const tl=picture('gfx/box_tl.lmp',8,8,[{x:5,y:5,w:3,h:3}]),br=picture('gfx/box_br.lmp',8,8,[{x:0,y:0,w:3,h:3}]);
 gpu.MainMenu_Begin();
 gpu.MainMenu_TextBox(100,60,208,48,tl,br);
 const box=api.frame().commands.find(c=>c.type==='panel');
 check(box.well,'text boxes use the dark recessed panel');
 check(Math.abs(box.w-(208-10)*s)<.01&&Math.abs(box.h-(48-10)*s)<.01,'panel is inset by the measured tile margins: '+box.w/s+'x'+box.h/s);
}));

Deno.test('left plaque letters are fitted and the id mark is blitted from the original pixels',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const s=draw.Draw_GetUIScale(),plaque=picture('gfx/qplaque.lmp',32,144,[{x:0,y:0,w:32,h:144}]);
 api.open();gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
 same(gpu.MainMenu_Image(10,10,plaque),true,'plaque taken over');
 const f=api.frame();
 same(f.commands.filter(c=>c.type==='text').map(c=>c.text).join(''),'QUAKE','the five letters are drawn');
 const id=f.blits.at(-1);check(id&&Math.abs(id.dh-30*s)<.01&&Math.abs(id.dy-(10+114)*s)<.01,'id mark is the sprite\'s bottom 30 units, drawn 1:1 from the original canvas');
 check(id.smooth===false,'logo pixels are not smoothed');
}));

Deno.test('Credits text honours the scoped 0.75 scale and the cursor blinks on one phase only',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const s=draw.Draw_GetUIScale();
 cmd.Cmd_ExecuteString('menu_credits');api.render();
 const chars=api.frame().commands.filter(c=>c.type==='text'&&c.text.length===1&&c.y>0);
 const xs=chars.filter(c=>Math.abs(c.y-chars[Math.min(30,chars.length-1)].y)<.5).map(c=>c.x).sort((a,b)=>a-b);
 const gaps=[];for(let i=1;i<xs.length;i++)gaps.push(xs[i]-xs[i-1]);
 const median=gaps.sort((a,b)=>a-b)[gaps.length>>1];
 check(median<8*s*.95&&median>8*s*.5,'credits cells are scaled down by the scoped scale: '+(median/s).toFixed(2)+' units per cell');
 api.open();gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();
 gpu.MainMenu_Glyph(50,50,10);same(api.frame().commands.length,0,'cursor phase 10 draws nothing');
 gpu.MainMenu_Glyph(50,50,11);same(api.frame().commands.filter(c=>c.text==='|').length,1,'cursor phase 11 draws the bar');
}));

Deno.test('context loss and restoration rebuild from the host commands, never the donor layout',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 api.open();api.render();
 const canvas=api.copies.findLast(c=>c.args[0]?.gl)?.args[0];check(canvas,'renderer canvas found');
 canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
 check(!gpu.MainMenu_Snapshot().ready,'lost context is not ready');check(api.fallback.length>=0,'native menu takes over meanwhile');
 canvas.dispatchEvent(new Event('webglcontextrestored'));
 for(let i=0;i<500&&!gpu.MainMenu_Snapshot().ready;i++){api.render();await new Promise(r=>setTimeout(r,10));}
 check(gpu.MainMenu_Snapshot().ready,'restored context is ready again');
 api.render();api.render();
 same(gpu.MainMenu_Snapshot().layout.width,overlayWidth(api),'layout is the host frame at overlay size, not the donor\'s standalone layout');
}));
function overlayWidth(api){return api.overlay.width;}

Deno.test('hiding the menu releases the screen-sized renderer buffers and the next opening restores them',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 api.open();api.render();
 const canvas=api.copies.findLast(c=>c.args[0]?.gl)?.args[0];check(canvas&&canvas.width>1,'canvas is overlay sized while open');
 menu.M_Keydown(keys.K_ESCAPE);api.render();
 same(canvas.width+'x'+canvas.height,'1x1','closed menu keeps no screen-sized canvas');
 api.open();for(let i=0;i<3;i++)api.render();
 same(canvas.width,api.overlay.width,'reopening restores the overlay-sized canvas');
}));

Deno.test('everything the menu draws gets a large soft black drop shadow, laid down before the crisp image',()=>fixture(async api=>{
 check((await api.ready()).ready,'ready');
 const scale=draw.Draw_GetUIScale();
 api.open();const before=api.copies.length;gpu.MainMenu_SetVisible(true);gpu.MainMenu_Begin();gpu.MainMenu_End(1);
 const mine=api.copies.slice(before).filter(c=>c.args[0]?.gl),shadow=gpu.MainMenu_Shadow;
 same(mine.length,shadow.length+1,'one shadow-only pass per entry, then the crisp image');
 shadow.forEach(([blur,alpha],i)=>{
  const c=mine[i];
  same(c.shadow.blur,blur*scale,'shadow pass '+i+' blur scales with the UI scale');
  check(c.shadow.color===`rgba(0,0,0,${alpha})`,'black shadow, alpha '+alpha+': '+c.shadow.color);
  check(c.args[1]<0&&c.shadow.offset===-c.args[1],'the image is drawn off-canvas and its shadow offset back, so only the blurred shadow lands on screen');
  same(c.transform.join(),'1,0,0,1,0,0','identity transform: physical pixels');
 });
 const crisp=mine.at(-1);
 same(crisp.args[1],0,'the crisp image is drawn in place');check(!crisp.shadow.blur,'with no shadow of its own (reset after the passes)');
 check(shadow.every(([blur],i)=>i===0||blur<=shadow[i-1][0]),'widest, softest pass first: '+shadow.map(s=>s[0]));
 check(shadow[0][0]>=24,'large and soft: the widest blur is '+shadow[0][0]+' virtual units');
}));
