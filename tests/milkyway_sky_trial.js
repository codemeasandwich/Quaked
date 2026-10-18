// Owner trial: actual native BSP geometry and production neighbor-view materials.
// No game progress or saved settings are changed. Main sky-chain wiring is tested
// independently in milkyway_sky_test.js; this trial also checks actual GPU output.
import * as THREE from 'three';
await import('../src/engine/render/gl_rsurf.js');await import('../src/newer/install.js');
const vars=await import('../src/engine/common/cvar.js');vars.Cvar_SetStorageWritable(false);
const {r_hdr}=await import('../src/newer/render/gl_post.js');if(!vars.Cvar_FindVar('r_hdr'))vars.Cvar_RegisterVariable(r_hdr);vars.Cvar_SetValue('r_hdr',1);
const mode=await import('../src/newer/mode.js');mode.r_newer_textures.value=0;
const pak=await import('../src/engine/common/pak.js');const {VID_SetPalette}=await import('../src/engine/render/vid.js');const model=await import('../src/engine/render/gl_model.js');
const levels=await import('../src/newer/render/r_levelview.js');const night=await import('../src/newer/render/r_milkywaysky.js');const {R_PostInstallGBufferPatch}=await import('../src/newer/render/r_post_gbuffer.js');
const report=window.report={scope:'Actual shareware BSP geometry and production R_BuildLevelView shader GPU trial; no played game or owner visual acceptance claimed',frames:[],errors:[]};
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);document.querySelector('header').after(renderer.domElement);
renderer.debug.onShaderError=(...args)=>{report.errors.push('Shader compilation failed');console.error(...args);};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(85,1,1,12000);camera.up.set(0,0,1);let view=null,yaw=90,pitch=45,drag=null,original=false;
const target=new THREE.WebGLRenderTarget(1000,640,{count:4,type:THREE.UnsignedByteType,depthBuffer:true});
const status=document.querySelector('#status');
function pose(){const y=yaw*Math.PI/180,p=pitch*Math.PI/180;camera.lookAt(camera.position.clone().add(new THREE.Vector3(Math.cos(y)*Math.cos(p),Math.sin(y)*Math.cos(p),Math.sin(p))));camera.updateMatrixWorld();}
function draw(){pose();renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,camera);renderer.setRenderTarget(null);renderer.render(scene,camera);}
function resize(){const w=innerWidth,h=Math.max(320,innerHeight-130);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();target.setSize(w,h);draw();}
async function openMap(name){mode.r_newer_textures.value=0;view?.dispose();scene.clear();const world=model.Mod_LoadForPreview('maps/'+name+'.bsp');if(!world)throw Error('Map unavailable');
 let origin=name==='start'?[544,520,48]:[0,0,0];if(name!=='start'){const ent=/\{[^}]*"classname"\s*"info_player_start"[^}]*\}/.exec(world.entities)?.[0]??world.entities.match(/\{[^}]*"info_player_start"[^}]*\}/)?.[0]??'';const pos=/"origin"\s*"([^"]+)"/.exec(ent)?.[1];if(pos)origin=pos.split(/\s+/).map(Number);origin[2]+=24;}
 camera.position.fromArray(origin);yaw=90;pitch=45;view=levels.R_BuildLevelView(world,origin);if(!view)throw Error('Visible native world unavailable');scene.add(view.group);mode.r_newer_textures.value=original?0:1;R_PostInstallGBufferPatch();draw();
 const holders=[];view.group.traverse(mesh=>{if(mesh.material?.userData?.milkyWay)holders.push(mesh.material.userData.milkyWay);});await night.R_MilkyWaySkyReady();draw();status.textContent=holders.some(h=>h.uMilkyWay.value)?'Milky Way + faint moving clouds':'Original sky';report.frames.push({map:name,original,position:origin,sky:night.R_MilkyWaySkyStatus(),matching:holders.some(h=>h.uMilkyWay.value)});window.ready=true;
}
window.capture=()=>{draw();const px=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,px);let sum=0,peak=0;for(let i=0;i<px.length;i+=4){sum+=px[i]+px[i+1]+px[i+2];peak=Math.max(peak,px[i],px[i+1],px[i+2]);}return{...report,current:{original,enabled:view?.group.children.filter(m=>m.material?.userData?.milkyWay?.uMilkyWay.value).length??0},width:target.width,height:target.height,mean:sum/(target.width*target.height*3),peak};};
window.setView=(y,p)=>{yaw=y;pitch=p;draw();};
document.querySelector('#compare').onclick=()=>{original=!original;mode.r_newer_textures.value=original?0:1;document.querySelector('#compare').textContent=original?'Show Milky Way sky':'Show original sky';draw();status.textContent=original?'Original sky':'Milky Way + faint moving clouds';};
document.querySelector('#map').onchange=async event=>{window.ready=false;document.querySelector('#compare').disabled=event.target.value==='e1m1';await openMap(event.target.value);};
renderer.domElement.onpointerdown=e=>{drag=[e.clientX,e.clientY,yaw,pitch];renderer.domElement.setPointerCapture(e.pointerId);};renderer.domElement.onpointermove=e=>{if(drag){yaw=drag[2]-(e.clientX-drag[0])*.2;pitch=Math.max(-85,Math.min(85,drag[3]+(e.clientY-drag[1])*.2));}};renderer.domElement.onpointerup=()=>drag=null;
addEventListener('resize',resize);
try{const bytes=await(await fetch('/.distribution-cache/shareware.pak')).arrayBuffer();pak.COM_AddPack(pak.COM_LoadPackFile('shareware.pak',bytes));VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);model.Mod_Init();resize();await openMap('start');renderer.setAnimationLoop(draw);}catch(e){report.errors.push(String(e.stack??e));status.textContent='Preview failed';window.ready=true;}

// Controlled HDR-target proof of the OTHER production sky path: actual native
// faces through R_DrawSkyChain, including MeshBasic shader hooks and MRT writes.
window.verifyMainSky = async () => {
 const warp=await import('../src/engine/render/gl_rsurf_liquids.js'),common=await import('../src/engine/render/gl_model_common.js'),{worldState}=await import('../src/engine/render/gl_rsurf_state.js');
 const {postState}=await import('../src/newer/render/r_post_state.js'),glow=await import('../src/newer/render/r_post_gbuffer.js'),{r_origin}=await import('../src/engine/render/render.js');
 const world=model.Mod_LoadForPreview('maps/start.bsp'),faces=world.surfaces.filter(f=>f.flags&4),old={group:worldState.group,solid:common.solidskytexture,alpha:common.alphaskytexture,post:postState.postActive,glow:postState.glowActive,textures:mode.r_newer_textures.value,origin:Array.from(r_origin)},links=faces.map(f=>f.texturechain),results=[];
 try{
  mode.r_newer_textures.value=1;common.set_solidskytexture(world._skySolid);common.set_alphaskytexture(world._skyAlpha);r_origin.set(camera.position.toArray());
  const g=new THREE.Group(),s=new THREE.Scene();worldState.group=g;s.add(g);faces.forEach((f,i)=>f.texturechain=faces[i+1]??null);R_PostInstallGBufferPatch();
  for(const hdr of [false,true]){
   postState.postActive=hdr;glow.setGlowActive(hdr);warp.R_LiquidsBeginFrame();warp.R_DrawSkyChain(faces[0]);
   renderer.setRenderTarget(target);renderer.clear();renderer.render(s,camera);const pixels=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);let lit=0,max=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]+pixels[i+1]+pixels[i+2]>2)lit++;max=Math.max(max,pixels[i],pixels[i+1],pixels[i+2]);}
   const at=pixels.findIndex((v,i)=>i%4===0&&pixels[i]+pixels[i+1]+pixels[i+2]>20),x=(at/4)%target.width,y=Math.floor(at/4/target.width),attachments=[];for(let index=1;index<4;index++){const packet=new Uint8Array(4);renderer.readRenderTargetPixels(target,x,y,1,1,packet,undefined,index);attachments.push(Array.from(packet));}
   const mesh=faces.find(f=>f._skyMesh)?._skyMesh;results.push({hdr,attachments,nativeSkyFaces:faces.length,litPixels:lit,peak:max,depthWrite:mesh.material.depthWrite,cloudOpacity:faces.find(f=>f._skyMesh2)?._skyMesh2.material.opacity,programs:renderer.info.programs.length});
   if(!lit||mesh.material.depthWrite===hdr)throw Error('Main sky HDR contract failed');if(hdr&&attachments.some(a=>a.some(v=>v!==0)))throw Error('HDR sky MRT must mark sky as unavailable surface: '+JSON.stringify(attachments));
  }
  return{passed:true,results,scope:'Actual native hub faces through production R_DrawSkyChain and real Chrome WebGL programs, controlled HDR target flag; not a complete postprocessed gameplay session'};
 }finally{
  faces.forEach((f,i)=>f.texturechain=links[i]);worldState.group=old.group;common.set_solidskytexture(old.solid);common.set_alphaskytexture(old.alpha);postState.postActive=old.post;glow.setGlowActive(old.glow);mode.r_newer_textures.value=old.textures;r_origin.set(old.origin);renderer.setRenderTarget(null);draw();
 }
};
