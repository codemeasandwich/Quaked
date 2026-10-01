await import('../src/gl_rsurf.js');
const THREE=await import('three');
const post=await import('../src/gl_post.js');
const split=await import('../src/r_demosplit.js');
const cvars=await import('../src/cvar.js');

function equal(a,b,label){if(a!==b)throw new Error(`${label}: expected ${b}, got ${a}`);}
function rendererDouble(pixelRatio=1){
 let target=null;
 return {capabilities:{isWebGL2:true},extensions:{has:()=>true},autoClear:true,renders:[],scissors:[],scissorTest:false,
  getPixelRatio:()=>pixelRatio,getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},setClearColor(){},clear(){},setViewport(){},
  setScissor(...rect){this.scissors.push(rect);},setScissorTest(on){this.scissorTest=on;},
  render(scene,camera){this.renders.push({scene,camera,target,autoClear:this.autoClear});}
 };
}
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
const viewport={lx:17,ly:23,lw:801,lh:603,width:801,height:603};
function classicFrame(renderer,target,vp=viewport){
 renderer.renders.length=0;const calls=[];
 split.R_DemoSplitClassic(renderer,scene,camera,vp,()=>calls.push('on'),()=>calls.push('off'),target);
 equal(calls.join(','),'on,off','classic state applied and restored');
 equal(renderer.renders[0].scene,scene,'same scene');equal(renderer.renders[0].camera,camera,'same camera');
 equal(renderer.renders[0].target.width,target.width,'scene width matches enhanced');equal(renderer.renders[0].target.height,target.height,'scene height matches enhanced');
 equal(renderer.renders[1].autoClear,false,'blit preserves enhanced half');equal(renderer.autoClear,true,'autoClear restored');equal(renderer.scissorTest,false,'scissor disabled after presentation');
 return renderer.renders[0].target;
}

Deno.test('classic split follows exact enhanced target dimensions, reuse and height-only resizing',()=>{
 const renderer=rendererDouble(),prior=new THREE.WebGLRenderTarget(1,1);renderer.setRenderTarget(prior);
 const first=classicFrame(renderer,{width:802,height:604});equal(renderer.getRenderTarget(),prior,'previous output target restored');
 equal(first.texture.magFilter,THREE.NearestFilter,'classic filtering preserved');
 equal(first.texture.type,THREE.HalfFloatType,'native brightness preserved until output gamma');
 equal(first.texture.colorSpace,THREE.LinearSRGBColorSpace,'native output curve applied once');
 equal(classicFrame(renderer,{width:802,height:604}),first,'unchanged dimensions reuse target');
 let disposals=0;first.addEventListener('dispose',()=>disposals++);
 const taller=classicFrame(renderer,{width:802,height:606});equal(taller===first,false,'height-only change recreates target');equal(disposals,1,'old target disposed');
 const wider=classicFrame(renderer,{width:804,height:606});equal(wider===taller,false,'width-only change recreates target');
 const reduced=classicFrame(renderer,{width:400,height:302});equal(reduced.width,400,'reduced width');equal(reduced.height,302,'reduced height');
 const rect=renderer.scissors.at(-1);equal(rect.join(','),'417,23,401,603','odd viewport split remains contiguous');prior.dispose();
});

Deno.test('classic uses physical viewport fallback and preserves full-classic mode',()=>{
 const renderer=rendererDouble(2);const old=split.r_demosplit.value;
 try {
  split.r_demosplit.value=2;renderer.renders.length=0;
  split.R_DemoSplitClassic(renderer,scene,camera,{lx:0,ly:0,lw:800,lh:600,width:1600,height:1200},()=>{},()=>{});
  equal(renderer.renders[0].target.width,1600,'physical viewport width');equal(renderer.renders[0].target.height,1200,'physical viewport height');
  equal(renderer.scissors.at(-1).join(','),'0,0,800,600','full-classic output rectangle');
  renderer.renders.length=0;split.R_DemoSplitClassic(renderer,scene,camera,{lx:0,ly:0,lw:500,lh:300},()=>{},()=>{});
  equal(renderer.renders[0].target.width,1000,'logical fallback uses DPR');equal(renderer.renders[0].target.height,600,'logical fallback uses DPR height');
 }finally{split.r_demosplit.value=old;}
});

Deno.test('post pipeline odd rounding, DPR and actual dynamic scale are shared by both passes',()=>{
 const options=[post.r_hdr,post.r_dynres,post.r_fps_target];for(const v of options)if(!cvars.Cvar_FindVar(v.name))cvars.Cvar_RegisterVariable(v);
 const saved=options.map(v=>v.string),descriptor=Object.getOwnPropertyDescriptor(performance,'now');let now=100000;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 const renderer=rendererDouble(2);
 try {
  cvars.Cvar_SetValue('r_hdr',1);cvars.Cvar_SetValue('r_dynres',0);
  for(const [width,height] of [[801,603],[1602,1206]]){
   equal(post.R_PostBegin(renderer,true,width,height),true,'enhanced pipeline active');post.R_PostBind(renderer);const hdr=renderer.getRenderTarget();renderer.setRenderTarget(null);
   const classic=classicFrame(renderer,hdr);equal(classic.width,hdr.width,'physical width equality');equal(classic.height,hdr.height,'physical height equality');
   if(width===801){equal(hdr.width,802,'enhanced even width rounding');equal(hdr.height,604,'enhanced even height rounding');}
  }
  cvars.Cvar_SetValue('r_dynres',1);cvars.Cvar_SetValue('r_fps_target',60);now+=3000;post.R_PostBegin(renderer,true,801,603);
  for(let i=0;i<150;i++){now+=100;post.R_PostBegin(renderer,true,801,603);}
  equal(post.R_DynResScale(),.5,'slow frames reduce resolution to half scale');post.R_PostBind(renderer);const hdr=renderer.getRenderTarget();renderer.setRenderTarget(null);
  const classic=classicFrame(renderer,hdr);equal(hdr.width,400,'scaled even width');equal(hdr.height,302,'scaled even height');equal(classic.width,hdr.width,'dynamic width equality');equal(classic.height,hdr.height,'dynamic height equality');
 }finally{
  cvars.Cvar_SetValue('r_dynres',0);post.R_PostBegin(renderer,false,0,0);options.forEach((v,i)=>cvars.Cvar_Set(v.name,saved[i]));
  if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;
 }
});
