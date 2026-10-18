/** Optional behavior-first Lava Man GPU checks. No production-effect implementation
 * is imported or emulated here. The former mesh-warp renderer must fail the
 * canonical-geometry, material-flow and flame-palette contract through rendering,
 * not through a missing module or shader-source comparison. */
import * as THREE from 'three';
import { GL_DrawAliasFrame } from '../src/engine/render/gl_mesh.js';
import { R_FireballSetup, R_FireballAssets } from '../src/newer/render/r_fireball.js';
import { postState } from '../src/newer/render/r_post_state.js';
import { pulseLava } from '../src/newer/render/r_post_gbuffer.js';

const TIMES = [1.125,1.487,2.031,2.773];
// Owner correction supersedes the earlier mesh-motion RMS contract retained in
// commit 9e1fe5f9. This proof isolates the existing material on canonical geometry:
// vertex movement, lighting changes and screen-space haze cannot fake skin flow.
const NAMES = {fire:'lavaman_fire',smoke:'lavaman_smoke'};
function effectObjects(scene){const found={fire:[],smoke:[]};scene.traverse(o=>{for(const kind of ['fire','smoke'])if(o.name===NAMES[kind])found[kind].push(o);});return found;}
function selectEffects(scene,kind){
 const saved=[];for(const [name,objects]of Object.entries(effectObjects(scene)))for(const object of objects){saved.push([object,object.visible]);object.visible=object.visible&&(kind==='all'||kind===name);}
 return()=>{for(const[object,visible]of saved)object.visible=visible;};
}
function activeCount(objects){return objects.reduce((sum,object)=>{let visible=true;for(let p=object;p;p=p.parent)visible&&=p.visible;return sum+(visible&&object.isMesh?Math.max(0,object.geometry?.instanceCount??1):0);},0);}
function positions(part){const a=part.current.geometry.getAttribute('position'),out=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){out[i*3]=a.getX(i);out[i*3+1]=a.getY(i);out[i*3+2]=a.getZ(i);}return out;}
function vertexSet(uv,box){const out=[];for(let i=0;i<uv.count;i++){const s=uv.getX(i)*300-.5,t=uv.getY(i)*194-.5;if(s>=box[0]-1e-3&&s<=box[2]+1e-3&&t>=box[1]-1e-3&&t<=box[3]+1e-3)out.push(i);}return out;}
function movement(a,b,ids){let sum=0,max=0,moved=0;for(const id of ids){let d=0;for(let k=0;k<3;k++)d+=(a[id*3+k]-b[id*3+k])**2;sum+=d;max=Math.max(max,Math.sqrt(d));if(d>.02**2)moved++;}return{rms:Math.sqrt(sum/Math.max(1,ids.length)),max,moved,total:ids.length};}
function bounds2D(points,ids,mesh,camera,width,height,pad=6){
 mesh.updateWorldMatrix(true,false);camera.updateMatrixWorld(true);const p=new THREE.Vector3();let x0=width,y0=height,x1=0,y1=0;
 for(const id of ids){p.fromArray(points,id*3).applyMatrix4(mesh.matrixWorld).project(camera);const x=(p.x*.5+.5)*width,y=(p.y*.5+.5)*height;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 return[Math.max(0,Math.floor(x0-pad)),Math.max(0,Math.floor(y0-pad)),Math.min(width,Math.ceil(x1+pad)),Math.min(height,Math.ceil(y1+pad))];
}
// Three r183 packing is most-significant R, least-significant A.
function unpackDepth(bytes,o,camera){const d=bytes[o]/256+bytes[o+1]/65536+bytes[o+2]/16777216+bytes[o+3]/4278190080;return camera.near*camera.far/(camera.far-(camera.far-camera.near)*d);}
function contribution(base,effect,mask){let outside=0,insideBody=0,energy=0,red=0;for(let i=0;i<mask.length;i++){const o=i*4,d=Math.abs(base[o]-effect[o])+Math.abs(base[o+1]-effect[o+1])+Math.abs(base[o+2]-effect[o+2]);if(d>9){if(mask[i])insideBody++;else{outside++;energy+=d;if(effect[o]>effect[o+2]+8)red++;}}}return{outside,inside:insideBody,energy,warmOutside:red};}
function pixelChange(a,b,mask=null){let changed=0,energy=0;for(let i=0;i<a.length;i+=4){if(mask?.[i/4])continue;const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>6)changed++;energy+=d;}return{changed,energy};}
function dilateMask(mask,width,height){const out=new Uint8Array(mask.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){if(!mask[y*width+x])continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&xx<width&&yy>=0&&yy<height)out[yy*width+xx]=1;}}return out;}
function unionMask(a,b){return Uint8Array.from(a,(value,i)=>value||b[i]?1:0);}

function roiChange(a,b,mask,roi,width,threshold=6){let changed=0,energy=0,total=0;for(let y=roi[1];y<roi[3];y++)for(let x=roi[0];x<roi[2];x++){const i=y*width+x;if(!mask[i])continue;const o=i*4,d=Math.abs(a[o]-b[o])+Math.abs(a[o+1]-b[o+1])+Math.abs(a[o+2]-b[o+2]);total++;energy+=d;if(d>threshold)changed++;}return{changed,energy,total};}
function rawChange(a,b,mask,epsilon,channels=3){let changed=0,max=0;for(let i=0;i<mask.length;i++){if(!mask[i])continue;let d=0;for(let k=0;k<channels;k++)d+=Math.abs(a[i*4+k]-b[i*4+k]);max=Math.max(max,d);if(d>epsilon)changed++;}return{changed,max};}
function flameChroma(base,fire,mask){let visible=0,orangeRed=0,yellowWhite=0;for(let i=0;i<mask.length;i++){if(mask[i])continue;const o=i*4,r=fire[o]-base[o],g=fire[o+1]-base[o+1],b=fire[o+2]-base[o+2];if(r<30||r+g+b<60)continue;visible++;if(r>g*1.2&&r>b*2)orangeRed++;if(g>r*.82&&b>r*.35)yellowWhite++;}return{visible,orangeRed,yellowWhite,orangeFraction:orangeRed/Math.max(1,visible),yellowWhiteFraction:yellowWhite/Math.max(1,visible)};}

export async function runLavaEffectsChecks({renderer,scene,camera,part,draw,verify,width,height,countDraw}){
 const savedCamera={position:camera.position.clone(),quaternion:camera.quaternion.clone()},savedSeed=part.entity._entityIndex,savedBackground=scene.background;
 const backgroundPixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,v=((x>>2)^(y>>2))&1?18:7;backgroundPixels.set([v,v+3,v+8,255],i);}
 const patternedBackground=new THREE.DataTexture(backgroundPixels,64,64);patternedBackground.magFilter=patternedBackground.minFilter=THREE.NearestFilter;patternedBackground.needsUpdate=true;scene.background=patternedBackground;
 const frame=17,template=GL_DrawAliasFrame(part.header,frame),originalPosition=template.posAttr.array.slice(),originalNormal=template.normalAttr.array.slice();
 const face=vertexSet(template.uvAttr,[28,3,76,59]),body=vertexSet(template.uvAttr,[4,61,146,162]);
 const result={scope:'Owner-corrected material flow on unchanged native walk1 geometry; fixed camera/light, canonical-geometry pigment isolation and actual G-buffer normal/height outputs.',frame,times:[...TIMES],samples:[],faceVertices:face.length,bodyVertices:body.length};
 const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.UnsignedByteType,format:THREE.RGBAFormat,depthBuffer:true,stencilBuffer:false});
 target.texture.colorSpace=THREE.NoColorSpace;
 const depthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});depthMaterial.toneMapped=false;depthMaterial.onBeforeCompile=()=>{};
 let visualTime=TIMES[0];
 function bindCanonical(){const g=part.current.geometry,p=g.attributes.position,n=g.attributes.normal;g.setAttribute('position',template.posAttr);g.setAttribute('normal',template.normalAttr);return()=>{g.setAttribute('position',p);g.setAttribute('normal',n);};}
 function gbuffer(detail){const rt=postState.gpu?.hdr;if(!rt||rt.width!==width||rt.height!==height||rt.textures.length<4)throw Error('Actual alias MRT target unavailable');const read=index=>{const type=rt.textures[index].type,raw=type===THREE.HalfFloatType?new Uint16Array(width*height*4):type===THREE.FloatType?new Float32Array(width*height*4):new Uint8Array(width*height*4);renderer.readRenderTargetPixels(rt,0,0,width,height,raw,0,index);return Float32Array.from(raw,value=>type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat(value):type===THREE.UnsignedByteType?value/255:value);};const result=detail?{normal:read(1),height:read(3)}:{albedo:read(2)};return{...result,error:renderer.getContext().getError()};}
 function depth(canonical=false){
  const restoreGeometry=canonical?bindCanonical():()=>{};
  const previousBackground=scene.background,previousTarget=renderer.getRenderTarget(),previousOverride=scene.overrideMaterial,previousClear=new THREE.Color();renderer.getClearColor(previousClear);const previousAlpha=renderer.getClearAlpha(),restore=selectEffects(scene,'body');
  try{
   scene.background=null;scene.overrideMaterial=depthMaterial;renderer.setRenderTarget(target);renderer.setClearColor(0,0);renderer.clear(true,true,true);renderer.render(scene,camera);countDraw();
   const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++)mask[i]=pixels[i*4]||pixels[i*4+1]||pixels[i*4+2]||pixels[i*4+3]?1:0;
   let closest=Infinity,farthest=0;for(let i=0;i<mask.length;i++)if(mask[i]){const z=unpackDepth(pixels,i*4,camera);closest=Math.min(closest,z);farthest=Math.max(farthest,z);}
   const vertex=new THREE.Vector3(),position=part.current.geometry.getAttribute('position');let expectedNear=Infinity,expectedFar=0;part.current.updateWorldMatrix(true,false);
   for(let i=0;i<position.count;i++){vertex.fromBufferAttribute(position,i).applyMatrix4(part.current.matrixWorld).applyMatrix4(camera.matrixWorldInverse);expectedNear=Math.min(expectedNear,-vertex.z);expectedFar=Math.max(expectedFar,-vertex.z);}
   return{pixels,mask,error:renderer.getContext().getError(),range:{closest,farthest,expectedNear,expectedFar}};
  }finally{scene.background=previousBackground;restoreGeometry();restore();scene.overrideMaterial=previousOverride;renderer.setRenderTarget(previousTarget);renderer.setClearColor(previousClear,previousAlpha);}
 }
 // Freeze the existing HDR lava pulse as well as actor UV time. R_PostBegin
 // normally advances that independent global pulse with wall time; leaving it
 // uncontrolled would confound fixed-time pigment/rewind measurements.
 function capture(kind,time,picture=true,{canonical=false,detail=true}={}){visualTime=time;return draw('Lava '+(kind==='body'?'body only':kind==='all'?'body, fire and smoke':kind+' isolated')+' · fixed walk1 · t='+time,{frame,yaw:0,visualTime:time,detail,picture,beforeRender:()=>{pulseLava(time);const restoreEffects=selectEffects(scene,kind),restoreGeometry=canonical?bindCanonical():()=>{};return()=>{restoreGeometry();restoreEffects();};}});}
 try{
  verify(face.length>5&&body.length>30,'Lava timed trial locates real native face and body UV regions',{face:face.length,body:body.length});
  part.entity._entityIndex=41;
  const bounds=new THREE.Box3().setFromBufferAttribute(template.posAttr),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  camera.position.set(center.x+span*2.05,center.y+span*.05,center.z+span*.25);camera.lookAt(center.clone().add(new THREE.Vector3(0,0,span*.08)));camera.updateMatrixWorld(true);
  // Use real, existing shader textures. Readiness failure is infrastructure
  // failure, never evidence that missing Lava behavior is the expected red.
  R_FireballSetup({scene,cl:()=>({time:visualTime,oldtime:visualTime,worldmodel:null}),pointInLeaf:()=>null,allocDlight:()=>{throw Error('Timed Lava trial must not allocate gameplay lights');}});
  const deadline=performance.now()+15000;let assets;
  while(!(assets=R_FireballAssets())&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
  verify(!!assets,'Lava timed trial has actual shared fire/smoke shader textures');if(!assets)throw Error('Real fire/smoke texture readiness failed; red behavior proof is not qualified');
  // Warm rendering before measuring the controlled sequence.
  capture('all',TIMES[0],false);
  const samples=[];
  for(const time of TIMES){
   const bodyImage=capture('body',time),p=positions(part),normal=part.current.geometry.attributes.normal.array.slice(),z=depth(),canonicalDepth=depth(true);
   const pigment=capture('body',time,false,{canonical:true,detail:false}),pigmentBuffer=gbuffer(false),detailImage=capture('body',time,false,{canonical:true,detail:true}),detailBuffer=gbuffer(true);
   const fire=capture('fire',time),smoke=capture('smoke',time),all=capture('all',time),objects=effectObjects(scene);
   const witness={time,faceROI:bounds2D(p,face,part.current,camera,width,height),bodyROI:bounds2D(p,body,part.current,camera,width,height),fire:contribution(bodyImage.pixels,fire.pixels,z.mask),smoke:contribution(bodyImage.pixels,smoke.pixels,z.mask),fireInstances:activeCount(objects.fire),smokeInstances:activeCount(objects.smoke),glErrors:[bodyImage.glError,z.error,canonicalDepth.error,pigment.glError,pigmentBuffer.error,detailImage.glError,detailBuffer.error,fire.glError,smoke.glError,all.glError]};
   verify(Number.isFinite(z.range.closest)&&z.range.closest>=z.range.expectedNear-.2&&z.range.farthest<=z.range.expectedFar+.2,'Lava packed GPU depth agrees with actual view-space geometry bounds at '+time,z.range);
   verify(witness.glErrors.every(error=>error===0),'Lava timed rendering is GL-clean at '+time,{errors:witness.glErrors});
   verify(witness.fireInstances>0&&witness.fire.outside>32&&witness.fire.warmOutside>16,'Lava pixel-shader fire visibly emerges beyond the body at '+time,{...witness.fire,instances:witness.fireInstances});
   verify(witness.smokeInstances>0&&witness.smoke.outside>32,'Lava pixel-shader smoke visibly emerges beyond the body at '+time,{...witness.smoke,instances:witness.smokeInstances});
   const nativeDelta=movement(originalPosition,p,Array.from({length:template.posAttr.count},(_,i)=>i)),normalDelta=Math.max(...normal.map((value,i)=>Math.abs(value-originalNormal[i]))),canonicalPixels=pixelChange(z.pixels,canonicalDepth.pixels),chroma=flameChroma(bodyImage.pixels,fire.pixels,canonicalDepth.mask);
   witness.canonical={position:nativeDelta,normalMax:normalDelta,depth:canonicalPixels};witness.chroma=chroma;
   verify(nativeDelta.max<1e-6&&normalDelta<1e-6,'Skin flow leaves actual rendered positions and normals canonical at '+time,witness.canonical);
   verify(z.pixels.every((value,i)=>value===canonicalDepth.pixels[i]),'Skin flow preserves exact native depth and silhouette at '+time,canonicalPixels);
   verify(pigmentBuffer.error===0&&detailBuffer.error===0&&detailBuffer.normal.every(Number.isFinite)&&detailBuffer.height.every(Number.isFinite)&&detailBuffer.normal.some(value=>Math.abs(value)>.1)&&pigmentBuffer.albedo.some(value=>value>.01),'Skin-flow proof reads actual finite normal and height MRT outputs at '+time);
   verify(chroma.visible>16&&chroma.orangeFraction>.7&&chroma.yellowWhiteFraction<.03,'Lava flame is visibly orange-red without a yellow-white core at '+time,chroma);
   verify(witness.fireInstances<=8&&witness.smokeInstances<=24,'Lava per-actor flame/smoke budgets stay bounded at '+time,{fire:witness.fireInstances,smoke:witness.smokeInstances});
   samples.push({p,z,canonicalDepth,pigment,pigmentBuffer,detailBuffer,bodyImage,fire,smoke,all,witness});result.samples.push(witness);
  }
  const nativeFaceROI=bounds2D(originalPosition,face,part.current,camera,width,height),nativeBodyROI=bounds2D(originalPosition,body,part.current,camera,width,height);
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],mask=a.canonicalDepth.mask,outside=unionMask(a.z.mask,b.z.mask);
   const facePigment=roiChange(a.pigment.pixels,b.pigment.pixels,mask,nativeFaceROI,width),bodyPigment=roiChange(a.pigment.pixels,b.pigment.pixels,mask,nativeBodyROI,width),background=pixelChange(a.pigment.pixels,b.pigment.pixels,dilateMask(mask,width,height));
   const albedo=rawChange(a.pigmentBuffer.albedo,b.pigmentBuffer.albedo,mask,.005),normal=rawChange(a.detailBuffer.normal,b.detailBuffer.normal,mask,.005),heightFlow=rawChange(a.detailBuffer.height,b.detailBuffer.height,mask,.002,4);
   const fireChange=pixelChange(a.fire.pixels,b.fire.pixels,outside),smokeChange=pixelChange(a.smoke.pixels,b.smoke.pixels,outside);
   verify(facePigment.changed>8,'Face skin pigment stretches over canonical geometry with normals OFF: '+i,facePigment);
   verify(bodyPigment.changed>32&&albedo.changed>32,'Body skin pigment flows on canonical geometry in actual albedo output: '+i,{bodyPigment,albedo});
   verify(normal.changed>16&&heightFlow.changed>8,'Moving skin detail updates actual normal and height shading outputs: '+i,{normal,height:heightFlow});
   verify(background.changed===0,'Skin flow leaves background beyond the two-pixel raster edge unchanged: no screen-space mirage '+i,background);
   verify(a.z.pixels.every((value,k)=>value===b.z.pixels[k]),'Fixed native pose keeps identical timed depth and silhouette: '+i);
   verify(fireChange.changed>16&&smokeChange.changed>16,'Lava fire and smoke each visibly animate outside the body: '+i,{fire:fireChange,smoke:smokeChange});
   b.witness.flow={facePigment,bodyPigment,albedo,normal,height:heightFlow,background,fireChange,smokeChange};
  }
  result.contract='Native geometry fixed; pigment, normal and height flow together; orange-red fire; no background mirage. Prior mesh-strength RMS contract superseded by explicit owner correction.';
  const repeat=capture('body',TIMES[0],false),repeatPosition=positions(part),again=movement(samples[0].p,repeatPosition,Array.from({length:template.posAttr.count},(_,i)=>i));
  verify(again.max<1e-5,'Lava visual clock rewind retains the same native surface',again);
  verify(pixelChange(samples[0].bodyImage.pixels,repeat.pixels).changed<4,'Lava identical fixed pose/time returns to the same rendered body');
  verify(originalPosition.every((v,i)=>v===template.posAttr.array[i])&&originalNormal.every((v,i)=>v===template.normalAttr.array[i]),'Lava effect never rewrites shared native pose position/normal arrays');
  // Compile the actual reused transparent shaders with fog enabled as well.
  // The clear scene above alone cannot exercise Three's USE_FOG branch.
  const priorFog=scene.fog;
  try{
   scene.fog=new THREE.FogExp2(0x101014,.004);
   const fogBody=capture('body',TIMES[0],false),fogAll=capture('all',TIMES[0]);
   const clearFX=contribution(samples[0].bodyImage.pixels,samples[0].all.pixels,samples[0].z.mask),fogFX=contribution(fogBody.pixels,fogAll.pixels,samples[0].z.mask);
   verify(fogBody.glError===0&&fogAll.glError===0,'Lava body and actual pixel-shader effects compile and render cleanly with distance fog');
   verify(fogFX.outside>32&&fogFX.energy<clearFX.energy*.95,'Lava fire/smoke remain visible and attenuate at their own fogged depth',{clearFX,fogFX});
   result.fog={clearFX,fogFX};
  }finally{scene.fog=priorFog;}
  result.renderedVertices=template.posAttr.count;
 }finally{
  scene.background=savedBackground;patternedBackground.dispose();target.dispose();depthMaterial.dispose();camera.position.copy(savedCamera.position);camera.quaternion.copy(savedCamera.quaternion);if(savedSeed===undefined)delete part.entity._entityIndex;else part.entity._entityIndex=savedSeed;
 }
 return result;
}

/** Manual, bounded owner preview. Uses the same production draw as the checks,
 * but performs no pixel readbacks, screenshots or growing evidence collection. */
export function createLavaMotionPreview({renderer,scene,camera,part,draw,runButton,insertBefore,release}){
 document.querySelector('h1 + p').textContent='Actual owned-model rendering, native poses and Classic controls. The skin-flow preview preserves the native mesh and runs only when requested, for six seconds; no game or saved state is started.';
 const panel=document.createElement('section'),title=document.createElement('h2'),controls=document.createElement('p'),status=document.createElement('output');
 title.textContent='Lava Man skin-flow preview';
 const startButton=document.createElement('button'),pauseButton=document.createElement('button'),stopButton=document.createElement('button');
 startButton.textContent='Preview 6 seconds';pauseButton.textContent='Pause';stopButton.textContent='Stop';pauseButton.disabled=stopButton.disabled=true;
 controls.append(startButton,' ',pauseButton,' ',stopButton,' ',status);status.textContent='Ready · native mesh, animated skin, fixed camera and lighting';
 renderer.domElement.style.display='block';renderer.domElement.style.maxWidth='100%';renderer.domElement.style.height='auto';
 panel.append(title,controls,renderer.domElement);insertBefore.before(panel);
 let raf=0,timer=0,wake=null,ticket=0,active=false,paused=false,busy=false,disposed=false,elapsed=0,last=0,saved=null;
 const delay=()=>new Promise(resolve=>{wake=resolve;timer=setTimeout(()=>{timer=0;wake=null;resolve();},20);});
 function restore(){
  if(!saved)return;camera.position.copy(saved.position);camera.quaternion.copy(saved.quaternion);part.entity.frame=saved.frame;part.entity.skinnum=saved.skin;for(let i=0;i<saved.angles.length;i++)part.entity.angles[i]=saved.angles[i];
  if(saved.seed===undefined)delete part.entity._entityIndex;else part.entity._entityIndex=saved.seed;runButton.disabled=saved.runDisabled;saved=null;release?.();
 }
 function stop(message='Stopped'){
  ticket++;if(raf)cancelAnimationFrame(raf);raf=0;if(timer)clearTimeout(timer);timer=0;const finish=wake;wake=null;finish?.();active=false;paused=false;restore();
  pauseButton.textContent='Pause';pauseButton.disabled=stopButton.disabled=true;startButton.disabled=busy||disposed;status.textContent=message;
 }
 function frame(stamp){
  raf=0;if(!active||paused||disposed)return;
  elapsed=Math.min(6,elapsed+Math.max(0,(stamp-last)/1000));last=stamp;
  try{draw('Lava skin-flow preview',{frame:17,yaw:0,visualTime:1.125+elapsed,detail:true,picture:false,record:false});}
  catch(error){stop('Preview failed: '+error.message);return;}
  status.textContent='Playing '+elapsed.toFixed(1)+' / 6.0 seconds';
  if(elapsed>=6){stop('Finished · 6.0 seconds');return;}raf=requestAnimationFrame(frame);
 }
 function pause(){
  if(!active||disposed)return;
  paused=!paused;pauseButton.textContent=paused?'Resume':'Pause';
  if(paused){if(raf)cancelAnimationFrame(raf);raf=0;status.textContent='Paused at '+elapsed.toFixed(1)+' seconds';}
  else{last=performance.now();raf=requestAnimationFrame(frame);}
 }
 async function start(){
  if(active||busy||disposed)return;stop('Preparing shared fire and smoke textures…');const current=ticket;
  saved={position:camera.position.clone(),quaternion:camera.quaternion.clone(),frame:part.entity.frame,skin:part.entity.skinnum,angles:Array.from(part.entity.angles),seed:part.entity._entityIndex,runDisabled:runButton.disabled};
  startButton.disabled=true;stopButton.disabled=false;runButton.disabled=true;
  try{
   R_FireballSetup({scene,cl:()=>({time:1.125+elapsed,oldtime:1.125+elapsed,worldmodel:null}),pointInLeaf:()=>null,allocDlight:()=>{throw Error('Preview must not allocate gameplay lights');}});
   const deadline=performance.now()+15000;while(current===ticket&&!R_FireballAssets()&&performance.now()<deadline)await delay();
   if(current!==ticket||disposed)return;if(!R_FireballAssets())throw Error('shared shader textures unavailable');
   const native=GL_DrawAliasFrame(part.header,17),bounds=new THREE.Box3().setFromBufferAttribute(native.posAttr),center=bounds.getCenter(new THREE.Vector3()),span=Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
   camera.position.set(center.x+span*2.05,center.y+span*.05,center.z+span*.25);camera.lookAt(center.clone().add(new THREE.Vector3(0,0,span*.08)));part.entity._entityIndex=41;
   elapsed=0;last=performance.now();active=true;paused=false;pauseButton.disabled=false;raf=requestAnimationFrame(frame);
  }catch(error){if(current===ticket)stop('Preview failed: '+error.message);}
 }
 const hidden=()=>{if(document.hidden&&active&&!paused)pause();};
 startButton.addEventListener('click',start);pauseButton.addEventListener('click',pause);stopButton.addEventListener('click',()=>stop());document.addEventListener('visibilitychange',hidden);
 return{stop,setBusy(value){if(value)stop('Verification running');busy=!!value;startButton.disabled=busy||disposed;},dispose(){disposed=true;stop('Closed');document.removeEventListener('visibilitychange',hidden);}};
}
