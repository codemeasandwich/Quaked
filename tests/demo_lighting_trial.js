// Observe the actual main entry and native opening demo; no replacement map,
// server, synthetic renderer or extra animation loop.
const errors=[],panel=document.querySelector('section');
window.addEventListener('error',e=>errors.push(e.message));
const originalError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' ').slice(0,1000));originalError(...args);};
for(const kind of ['keydown','keyup','mousedown','mouseup','pointerdown','pointerup'])panel.addEventListener(kind,e=>e.stopPropagation());
await import('../main.js');
while(!window.renderer)await new Promise(r=>setTimeout(r,50));
const split=await import('../src/r_demosplit.js'),post=await import('../src/gl_post.js');
const {Cvar_VariableValue}=await import('../src/cvar.js'),{cl,cls}=await import('../src/client.js');
const renderer=window.renderer;let seen={enhanced:0,classic:0},compositor;const gpuErrors=[];
const render=window.renderer.render;
window.renderer.render=function(scene,camera){
 if(scene===window.scene)seen[post.classicLook.value?'classic':'enhanced']++;
 const material=scene.children?.[0]?.material;
 if(material?.fragmentShader?.includes('const int BOUNCE_SAMPLES'))compositor=material.uniforms;
 const restored=[];
 if(scene===window.scene)scene.traverse(object=>{if(!object.isMesh&&!object.isPoints&&!object.isSprite)return;const after=object.onAfterRender;object.onAfterRender=function(...args){after?.apply(this,args);const e=renderer.getContext().getError();if(e&&gpuErrors.length<12)gpuErrors.push({error:e,name:object.name,material:object.material?.type,vertex:object.material?.vertexShader?.slice(0,120),attributes:Object.keys(object.geometry?.attributes||{})});};restored.push([object,after]);});
 let result;try{result=render.call(this,scene,camera);}finally{for(const[object,after]of restored)object.onAfterRender=after;}
 const error=this.getContext().getError();
 if(error&&gpuErrors.length<12)gpuErrors.push({error,classic:post.classicLook.value,objects:scene.children.length,first:scene.children[0]?.name,shader:material?.fragmentShader?.slice(0,100),attachments:this.getRenderTarget()?.textures?.length});
 return result;
};
document.querySelector('#hide').onclick=()=>panel.hidden=true;
document.querySelector('#probe').onclick=()=>{
 const renderer=window.renderer,previous=renderer.getRenderTarget();post.R_PostBind(renderer);const target=renderer.getRenderTarget(),counts=[0,0,0,0];
 if(target.textures.length===4){const bytes=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,bytes,undefined,3);for(let i=3;i<bytes.length;i+=4)counts[bytes[i]>>>6]++;}
 renderer.setRenderTarget(previous);
 document.querySelector('#report').textContent=JSON.stringify({demo:cls.demoplayback,level:cl.worldmodel?.name,seen,defaults:Object.fromEntries(['r_hdr','r_flashlight','r_newer_lighting','r_newer_normals','r_newer_shadows','r_pointshadows','r_heightshadows'].map(n=>[n,Cvar_VariableValue(n)])),compositor:{spot:compositor?.uSpotOn?.value,spotWorldShadow:compositor?.uSpotWorldShadowOn?.value,heightMasks:compositor?.uHeightMasks?.value},attachments:target.textures.length,maskClasses:counts,shadows:post.R_PointShadowStatus(),glError:renderer.getContext().getError(),gpuErrors,errors},null,2);
};
