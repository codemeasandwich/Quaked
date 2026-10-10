// One real main entry/client. Optional slow=1 delays only first-world texture
// and skin manifests to make console hold visible; it does not fake readiness.
const errors=[],history=[],gpuErrors=[];window.addEventListener('error',e=>errors.push(e.message));
const originalFetch=window.fetch.bind(window),slow=new URLSearchParams(location.search).get('slow')==='1';
if(slow)window.fetch=async(...args)=>{if(/newer\/(textures|enemies)\/index\.json/.test(String(args[0])))await new Promise(r=>setTimeout(r,10000));return originalFetch(...args);};
const panel=document.querySelector('section');for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,e=>e.stopPropagation());
const state=await import('../src/r_demoloading.js'),screen=await import('../src/gl_screen.js'),{cl,cls}=await import('../src/engine/client/client.js');
const {Draw_GetOverlayCanvas}=await import('../src/gl_draw.js');
await import('../main.js');
document.querySelector('#newer').onclick=()=>window.Cbuf_AddText?.('menu_singleplayer\n');
let last='',captured=false;const start=performance.now();
setInterval(()=>{
 const status=state.R_DemoLoadingStatus(),key=[status.phase,status.mode,status.fadeStarted,status.fadeDone,status.pending.join(',')].join('|');
 if(!captured&&status.phase==='warming'&&status.mode==='demo'&&status.fadeDone&&screen.scr_con_current>0&&status.pending.length){
  const canvas=Draw_GetOverlayCanvas();if(canvas){const image=document.createElement('img');image.id='held-console-proof';image.alt='Actual native console captured while enhanced intro assets were still pending';image.src=canvas.toDataURL('image/png');image.style.width='100%';const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Captured console during loading';details.append(summary,image);panel.append(details);captured=true;}
 }
 if(key!==last){last=key;history.push({ms:Math.round(performance.now()-start),...status,consoleHeight:screen.scr_con_current,demoPosition:cls.demopos,demoTime:cl.time,logoOpacity:document.querySelector('#loading')?.style.opacity||null});}
 const renderer=window.renderer;if(renderer){const error=renderer.getContext().getError();if(error&&gpuErrors.length<12)gpuErrors.push(error);}
 document.querySelector('#report').textContent=JSON.stringify({slow,status,consoleHeight:screen.scr_con_current,level:cl.worldmodel?.name,signon:cls.signon,demo:cls.demoplayback,history,gpuErrors,errors},null,2);
},100);
