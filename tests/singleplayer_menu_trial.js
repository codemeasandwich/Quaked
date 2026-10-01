// Keep trial buttons from also reaching the game's document-level input handlers.
const controls=document.querySelector('section');
for(const event of ['mousedown','mouseup','keydown','keyup','touchstart','touchend','pointerdown','pointerup'])controls.addEventListener(event,e=>e.stopPropagation());
await import('../main.js');
while(!window.Cbuf_AddText)await new Promise(r=>setTimeout(r,20));
const draw=await import('../src/gl_draw.js'),menu=await import('../src/menu.js'),cmd=await import('../src/cmd.js'),keys=await import('../src/keys.js');
const art=draw.Draw_CacheSinglePlayerMenu(),single=draw.Draw_CachePic('gfx/sp_menu.lmp'),main=draw.Draw_CachePic('gfx/mainmenu.lmp'),network=draw.Draw_CachePic('gfx/netmen4.lmp');
const rgba=p=>p.canvas.getContext('2d').getImageData(0,0,p.width,p.height).data;
const a=rgba(art),s=rgba(single),m=rgba(main),n=rgba(network);let checks=0,failures=0;const problems=[];
function check(ok,label){checks++;if(!ok){failures++;problems.push(label);}}
check(art.width===232&&art.height===100,'native sheet dimensions');check(draw.Draw_CacheSinglePlayerMenu()===art,'cached once');
// Preserve every painted pixel of all three original menu rows. Newer's G may
// occupy previously transparent space above the following word's small caps.
let originalInk=0;
for(let y=0;y<single.height;y++)for(let x=0;x<single.width;x++){
 const si=(y*single.width+x)*4,ai=((y+20)*art.width+x)*4;
 if(s[si+3]){originalInk++;check([0,1,2,3].every(c=>a[ai+c]===s[si+c]),`original ink ${x},${y}`);}
}
function sameGlyph(source,width,sx,sy,w,h,dx,dy,label){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const si=((sy+y)*width+sx+x)*4,ai=((dy+y)*art.width+dx+x)*4;check([0,1,2,3].every(c=>source[si+c]===a[ai+c]),label);}}
sameGlyph(s,single.width,129,2,16,13,68,3,'Newer e shape/baseline');sameGlyph(m,main.width,200,2,20,13,86,3,'Newer r shape/baseline');sameGlyph(n,network.width,16,6,14,12,181,84,'Select c native shape');
// Known A flank formerly captured alongside V; source has ink, label must not.
check(s[(50*single.width+32)*4+3]>0,'A-flank reference exists');check(a[(90*art.width+40)*4+3]===0,'V excludes borrowed A fragment');
document.querySelector('#report').textContent=JSON.stringify({status:failures?'FAIL':'PASS',checks,failures,originalInk,problems:problems.slice(0,8),width:art.width,height:art.height},null,2);
const update=()=>document.querySelector('#state').textContent=menu.m_state===menu.m_levelselect?'Level Select opened':menu.m_state===menu.m_singleplayer?'Single player menu':'Other menu/game';
document.querySelector('#single').onclick=()=>{cmd.Cmd_ExecuteString('menu_singleplayer');update();};document.querySelector('#next').onclick=()=>{menu.M_Keydown(keys.K_DOWNARROW);update();};document.querySelector('#select').onclick=()=>{menu.M_Keydown(keys.K_ENTER);update();};cmd.Cmd_ExecuteString('menu_singleplayer');update();
