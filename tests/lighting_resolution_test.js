// Public frame interfaces with real Three.js targets/materials, not a source-only check.
await import('../src/engine/render/gl_rsurf.js');
const THREE=await import('three');
const post=await import('../src/newer/render/gl_post.js');
const anim=await import('../src/newer/render/r_anim.js');
const cvar=await import('../src/engine/common/cvar.js');
function equal(a,b,label){if(a!==b)throw new Error(`${label}: expected ${b}, got ${a}`);}
const options=[post.r_hdr,post.r_dynres,post.r_fps_target,post.r_bloom,post.r_volumetric,anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water];
function setup(){for(const v of options)if(!cvar.Cvar_FindVar(v.name))cvar.Cvar_RegisterVariable(v);const saved=options.map(v=>v.string);for(const v of options)cvar.Cvar_SetValue(v.name,1);cvar.Cvar_SetValue('r_bloom',0);cvar.Cvar_SetValue('r_volumetric',0);cvar.Cvar_SetValue('r_fps_target',60);return()=>{post.R_PostSetSplit(false);options.forEach((v,i)=>cvar.Cvar_Set(v.name,saved[i]));post.R_PostBegin(renderer,false,0,0);};}
const renderer={capabilities:{isWebGL2:true},extensions:{has:()=>true},draws:[],scissors:[],target:null,getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},setViewport(...v){this.viewport=v;},setScissor(...v){this.scissors.push(v);},setScissorTest(on){this.scissor=on;},render(scene){const m=scene.children[0].material;this.draws.push({target:this.target,material:m,viewport:this.viewport,scissor:this.scissor,offscreen:m.uniforms.uOffscreen?.value,bright:m.uniforms.uBright?.value,contrast:m.uniforms.uContrastGain?.value,pivot:m.uniforms.uContrastPivot?.value});}};
const camera=new THREE.PerspectiveCamera(90,4/3,4,4096);camera.updateMatrixWorld();
function finish(){renderer.draws=[];post.R_PostFinish(renderer,new THREE.Scene(),camera,{lx:7,ly:11,lw:800,lh:600,width:1600,height:1200},0,[],[],0,1,false);return renderer.draws;}
Deno.test('dynamic lighting composition follows scene pixels and presents the split at display size',()=>{
 const restore=setup(),descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=100000;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 try{
  cvar.Cvar_SetValue('r_dynres',0);post.R_PostBegin(renderer,true,1600,1200);
  cvar.Cvar_SetValue('r_dynres',1);for(let i=0;i<150;i++){now+=100;post.R_PostBegin(renderer,true,1600,1200);}
  equal(post.R_DynResScale(),.5,'slow frames reach half scale');post.R_PostBind(renderer);const hdr=renderer.target;
  post.R_PostSetSplit(true);const draws=finish();equal(draws.length,2,'one scene-resolution composite plus one cheap presentation');
  const [lit,shown]=draws;equal(lit.target.width,hdr.width,'lighting width');equal(lit.target.height,hdr.height,'lighting height');equal(lit.target.width,800,'DPR2 half-width');equal(lit.target.height,600,'DPR2 half-height');equal(lit.offscreen,1,'linear offscreen output');equal(lit.scissor===true,false,'offscreen pass draws the complete scene target');
  equal(shown.target,null,'display target');equal(shown.material.uniforms.tComposite.value,lit.target.texture,'actual lit texture presented');equal(shown.viewport.join(','),'7,11,800,600','logical display viewport');equal(renderer.scissors.at(-1).join(','),'7,11,400,600','split applied only at presentation');equal(renderer.scissor,false,'split scissor restored');
  equal(shown.bright,lit.bright,'brightness forwarded');equal(shown.contrast,lit.contrast,'contrast forwarded');equal(shown.pivot,lit.pivot,'pivot forwarded');equal(post.R_WaterActive(),true,'water stays enabled');equal(anim.R_NewerLightingActive(),true,'lighting stays enabled');
  const cached=lit.target;equal(finish()[0].target,cached,'same dimensions reuse composite target');let disposed=0;cached.addEventListener('dispose',()=>disposed++);
  now+=100;post.R_PostBegin(renderer,true,1600,1204);const resized=finish()[0].target;equal(resized.height,602,'height-only resize');equal(resized===cached,false,'resized target replaced');equal(disposed,1,'old lighting target disposed');
  cvar.Cvar_SetValue('r_newer_lighting',0);post.R_PostBegin(renderer,true,1600,1204);const off=finish();equal(off.length,1,'lighting off keeps existing cheap direct liquid composition');equal(off[0].target,null,'off direct output');equal(off[0].offscreen,0,'direct output restores colour conversion');equal(off[0].bright,1,'off neutral brightness');equal(post.R_WaterActive(),true,'lighting off preserves water');
 }finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;restore();}
});
Deno.test('full-resolution lighting preserves the direct display path and grade',()=>{
 const restore=setup();try{cvar.Cvar_SetValue('r_dynres',0);post.R_PostBegin(renderer,true,1600,1200);const draws=finish();equal(draws.length,1,'no redundant upscale at full resolution');equal(draws[0].target,null,'direct display');equal(draws[0].offscreen,0,'direct colour conversion');equal(draws[0].bright,post.r_newbright.value,'existing displayed brightness');equal(draws[0].contrast,post.r_newcontrast.value,'existing displayed contrast');}finally{restore();}
});
