// Controlled in-game trial, using the actual renderer and option cvars.
await import('../main.js');
const vid=await import('../src/vid.js');
const {Cvar_SetValue,Cvar_VariableValue}=await import('../src/engine/common/cvar.js');
const {R_DynResScale}=await import('../src/gl_post.js');
while(!window.Cbuf_AddText) await new Promise(r=>setTimeout(r,20));
const renderer=vid.renderer;
const gl=renderer.getContext(),render=renderer.render;
let run=null,last=0,frameCosts={},pendingComposite=null;
const stages=[
 {name:'lighting off',lighting:0,bounce:1,volume:1,reflect:1,dynamic:0},
 {name:'all lighting',lighting:1,bounce:1,volume:1,reflect:1,dynamic:0},
 {name:'without bounce',lighting:1,bounce:0,volume:1,reflect:1,dynamic:0},
 {name:'without volume',lighting:1,bounce:1,volume:0,reflect:1,dynamic:0},
 {name:'without bounce and volume',lighting:1,bounce:0,volume:0,reflect:1,dynamic:0},
 {name:'probe colour only (SSR march retained)',lighting:1,bounce:1,volume:1,reflect:0,dynamic:0},
 {name:'all lighting dynamic',lighting:1,bounce:1,volume:1,reflect:1,dynamic:1}
];
function setStage(){
 const s=stages[run.index];run.warm=s.dynamic?180:45;run.samples=[];frameCosts={};last=0;
 for(const [key,value] of Object.entries({r_newer_lighting:s.lighting,r_bounce:s.bounce,r_volumetric:s.volume,r_reflect_screen:s.reflect,r_dynres:s.dynamic}))Cvar_SetValue(key,value);
 document.querySelector('#status').textContent=`${run.sync?'GPU-synchronized':'Normal frame'} measurement: ${s.name}`;
}
function summarize(values){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);return {mean:v.reduce((a,b)=>a+b,0)/v.length,median:v[Math.floor(v.length/2)],p95:v[Math.floor(v.length*.95)]};}
function finishFrame(target,material){
 if(!run)return;const now=performance.now(),dt=last?now-last:0;last=now;
 if(run.warm>0){run.warm--;frameCosts={};return;}
 run.samples.push({ms:dt,passes:frameCosts});frameCosts={};
 if(run.samples.length<60)return;
 const names=[...new Set(run.samples.flatMap(s=>Object.keys(s.passes)))];
 run.results.push({case:stages[run.index].name,frames:run.samples.length,frameMs:summarize(run.samples.slice(1).map(s=>s.ms)),passes:Object.fromEntries(names.map(n=>[n,summarize(run.samples.map(s=>s.passes[n]||0))])),sceneScale:R_DynResScale(),compositeTarget:target?[target.width,target.height]:[renderer.domElement.width,renderer.domElement.height],lightCount:material.uniforms.uCount.value,bounce:material.uniforms.uBounce.value,crateRarity:Cvar_VariableValue('r_newer_crates')});
 document.querySelector('#evidence').textContent=JSON.stringify({method:run.sync?'readPixels after each draw; synchronization overhead included':'normal animation loop',pixelRatio:renderer.getPixelRatio(),drawingBuffer:[renderer.domElement.width,renderer.domElement.height],results:run.results},null,2);
 document.querySelector('#summary').textContent=run.results.map(r=>`${r.case}: ${(1000/r.frameMs.mean).toFixed(1)} fps, ${r.frameMs.mean.toFixed(1)} ms, scale ${r.sceneScale}, lighting ${r.compositeTarget.join('×')}`).join('\n');
 run.index++;if(run.index===stages.length){document.querySelector('#status').textContent='DONE';run=null;return;}setStage();
}
renderer.render=function(scene,camera){
 const target=this.getRenderTarget(),m=scene.children?.[0]?.material;
 const shader=m?.fragmentShader||'';
 const composite=shader.includes('const int BOUNCE_SAMPLES');
 const present=shader.includes('uniform sampler2D tComposite;');
 const label=composite?'composite':present?'lighting upscale':shader.includes('henyeyGreenstein')?'volume':shader.includes('uThreshold')?'bloom prefilter':shader.includes('tHigh')?'bloom up':shader.includes('tSource')?'bloom down':scene===window.scene?(target?.depthTexture&&target.textures.length>=2?'world':'world auxiliary'):'other';
 if(run?.sync)gl.finish();const t=performance.now();
 const result=render.call(this,scene,camera);
 if(run?.sync){
  // readPixels forces GPU completion; WebGL finish alone may only flush IPC.
  const type=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE),format=gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
  const pixels=type===gl.FLOAT?new Float32Array(4):type===gl.HALF_FLOAT?new Uint16Array(4):new Uint8Array(4);
  gl.readPixels(0,0,1,1,format,type,pixels);
 }
 if(run)frameCosts[label]=(frameCosts[label]||0)+(performance.now()-t);
 if(composite){
  if(target)pendingComposite={target,material:m};
  else finishFrame(target,m);
 }
 if(present && pendingComposite){finishFrame(pendingComposite.target,pendingComposite.material);pendingComposite=null;}
 return result;
};
function start(sync,index=0){
 if(run)return;run={sync,index,results:[]};
 Cvar_SetValue('r_demosplit',0);Cvar_SetValue('r_hdr',1);
 for(const key of ['normals','water','enemies','portals','textures','hud','shadows'])Cvar_SetValue('r_newer_'+key,1);
 Cvar_SetValue('r_newer_crates',40); // retain the product's default special-variant odds
 window.Cbuf_AddText('map start\nr_hdr 1\n');setStage();run.warm=180;
}
document.querySelector('#gpu').onclick=()=>start(true);
document.querySelector('#frames').onclick=()=>start(false);
document.querySelector('#dynamic').onclick=()=>start(false,stages.length-1);
document.querySelector('#dynamic-gpu').onclick=()=>start(true,stages.length-1);
document.querySelector('#status').textContent='Ready; stationary start-map comparison, all other enhanced options enabled';
