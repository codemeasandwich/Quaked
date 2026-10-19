// Controlled real-GPU regression: native BSP sky surfaces -> production main
// sky materials -> production DoF stage. Public autofocus is explicitly advanced;
// setting r_dof alone does not establish that the blur pass actually executes.
import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import '../src/newer/install.js';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import * as dof from '../src/newer/render/r_dof.js';
import * as night from '../src/newer/render/r_milkywaysky.js';
import {r_hdr} from '../src/newer/render/gl_post.js';
import {postState,classicLook} from '../src/newer/render/r_post_state.js';
import {R_PostInstallGBufferPatch,setGlowActive} from '../src/newer/render/r_post_gbuffer.js';
import {createPipeline,runPass} from '../src/newer/render/r_post_targets.js';
import {COM_AddPack,COM_LoadPackFile,COM_BuildPack,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/engine/render/vid.js';
import * as models from '../src/engine/render/gl_model.js';
import {set_solidskytexture,set_alphaskytexture} from '../src/engine/render/gl_model.js';
import {worldState} from '../src/engine/render/gl_rsurf_state.js';
import {r_origin} from '../src/engine/render/render.js';
import {set_realtime} from '../src/engine/common/host_state.js';
import {R_DrawSkyChain,R_LiquidsBeginFrame,R_SkyClear} from '../src/engine/render/gl_rsurf_liquids.js';
import {R_SkyBoxSet,R_SkyBoxMaterial} from '../src/engine/render/r_skybox.js';

const W=640,H=400,errors=[],checks=[];
const report=document.querySelector('#report'),button=document.querySelector('#run'),views=document.querySelector('#views');
const verify=(passed,name,data={})=>checks.push({passed:!!passed,name,...data});
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
vars.Cvar_SetStorageWritable(false);
for(const c of [r_hdr,dof.r_dof,mode.r_newer_textures])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('r_dof',1);mode.R_AnimSetClassicPass(false);mode.R_AnimSetNewer(true);mode.r_newer_textures.value=1;
postState.postActive=true;classicLook.value=0;setGlowActive(false);R_PostInstallGBufferPatch();
let renderer,pipeline,input,resultTarget,scene,camera,group,world,faces,plane;
function target(width=W,height=H,count=1){return new THREE.WebGLRenderTarget(width,height,{count,type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:count>1,...(count>1?{depthTexture:new THREE.DepthTexture(width,height,THREE.UnsignedIntType)}:{})});}
function read(rt,index=0){const raw=new Uint16Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,raw,0,index);return Float32Array.from(raw,THREE.DataUtils.fromHalfFloat);}
function delta(a,b,mask){let changed=0,max=0,total=0,pixels=0;for(let i=0;i<mask.length;i++){if(!mask[i])continue;pixels++;let sum=0;for(let c=0;c<3;c++){const d=Math.abs(a[i*4+c]-b[i*4+c]);max=Math.max(max,d);sum+=d;}total+=sum;if(sum>1e-5)changed++;}return{pixels,changed,max,total};}
function capture(){renderer.setRenderTarget(input);renderer.clear();renderer.render(scene,camera);return read(input);}
function blurred(){const u=pipeline.dofMaterial.uniforms,[px,max]=dof.R_DofCircle(H);u.tComposite.value=input.texture;u.tDepth.value=input.depthTexture;u.tNormal.value=input.textures[1];u.uProjInv.value.copy(camera.projectionMatrixInverse);u.uDof.value.set(dof.R_DofFocus(),px,max);u.uDofTexel.value.set(1/W,1/H);u.uDofFar.value=dof.R_DofFar();runPass(renderer,pipeline.dofMaterial,resultTarget);return read(resultTarget);}
function masks(){const m=new THREE.ShaderMaterial({uniforms:{depth:{value:input.depthTexture}},vertexShader:pipeline.dofMaterial.vertexShader,fragmentShader:'uniform sampler2D depth;varying vec2 vUv;void main(){float d=texture2D(depth,vUv).x;gl_FragColor=vec4(vec3(d>=0.99999?1.0:0.0),1.0);}'});runPass(renderer,m,resultTarget);const a=read(resultTarget);m.dispose();return{sky:Uint8Array.from({length:W*H},(_,i)=>a[i*4]>.5?1:0),world:Uint8Array.from({length:W*H},(_,i)=>a[i*4]>.5?0:1)};}
function picture(rt,label){const u=pipeline.presentMaterial.uniforms;u.tComposite.value=rt.texture;u.uBright.value=1;u.uContrastGain.value=1;u.uContrastPivot.value=0;u.uWaves.value=0;runPass(renderer,pipeline.presentMaterial,null);const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=renderer.domElement.toDataURL();caption.textContent=label;figure.append(img,caption);views.append(figure);}
function skyDraw(){r_origin.set(camera.position.toArray());R_LiquidsBeginFrame();R_DrawSkyChain(faces[0]);}
function cubeTGA(){const n=64,a=new Uint8Array(18+n*n*3);a[2]=2;a[12]=a[14]=n;a[16]=24;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=((x>>1)^(y>>1))&1?240:12;a.set([v,v,v],18+(y*n+x)*3);}return a;}
function sourceFocus(){const eye=camera.position.toArray(),forward=camera.getWorldDirection(new THREE.Vector3()).toArray(),right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).toArray(),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).toArray();dof.R_DofSetup({xr:()=>false,trace:()=>({fraction:64/dof.DOF.far,startsolid:false})});dof.R_DofClear();dof.R_DofFrame(1,world,eye,forward,right,up);verify(dof.R_DofFocus()===64,'public autofocus admits the intended near focus',{focus:dof.R_DofFocus(),strength:dof.r_dof.value});}
function verifySky(kind){
 skyDraw();plane.visible=false;const skyOnly=capture();plane.visible=true;const before=capture(),mask=masks();
 // Require real rasterized sky rather than testing clear-black empty pixels.
 const actualSky=Uint8Array.from(mask.sky,(v,i)=>v&&skyOnly[i*4+3]>.99?1:0),after=blurred();
 const skyDelta=delta(before,after,actualSky),worldDelta=delta(before,after,mask.world);
 verify(skyDelta.pixels>1000&&skyDelta.changed===0,'actual '+kind+' sky pixels remain identical through strong near-focus DoF',skyDelta);
 verify(worldDelta.pixels>1000&&worldDelta.changed>100,'world checker is visibly blurred in the same production DoF pass',worldDelta);
 verify(renderer.getContext().getError()===0,'production '+kind+' sky and DoF shaders are GL-clean');picture(resultTarget,kind+' sky remains sharp; world control is blurred');
 return{skyDelta,worldDelta};
}
function tapProof(){
 const material=R_SkyBoxMaterial(),old=material.color.clone();
 material.color.setRGB(1,.05,.05);const sourceA=capture(),mask=masks(),outA=blurred();
 material.color.setRGB(.05,.05,1);const sourceB=capture(),outB=blurred();material.color.copy(old);
 const sourceWorld=delta(sourceA,sourceB,mask.world),outputWorld=delta(outA,outB,mask.world),sourceSky=delta(sourceA,sourceB,mask.sky);
 verify(sourceSky.changed>1000,'sky-only color change is a positive gather control',sourceSky);
 verify(sourceWorld.changed===0&&outputWorld.changed===0,'sky samples cannot leak into blurred world gather taps',{sourceWorld,outputWorld});return{sourceWorld,outputWorld,sourceSky};
}
function cloudProof(){
 const on=capture(),mask=masks(),clouds=faces.map(f=>f._skyMesh2).filter(Boolean),visibility=clouds.map(m=>m.visible);
 clouds.forEach(m=>m.visible=false);const off=capture();clouds.forEach((m,i)=>m.visible=visibility[i]);
 const contribution=delta(on,off,mask.sky);
 verify(contribution.pixels>1000&&contribution.changed>0,'native clouds make a measured visible contribution over the supplied panorama',contribution);return contribution;
}
function gradeProbe(){
 const rt=target(1,1),results=[];
 for(const byte of [48,192]){
  const texture=new THREE.DataTexture(new Uint8Array([byte,byte,byte,255]),1,1);texture.needsUpdate=true;
  const material=new THREE.ShaderMaterial({uniforms:{tMilkyWay:{value:texture}},vertexShader:pipeline.dofMaterial.vertexShader,fragmentShader:night.R_MilkyWaySkyGLSL()+'\nvoid main(){gl_FragColor=vec4(quakedMilkyWay(vec3(1.,0.,0.)),1.);}'});
  runPass(renderer,material,rt);const measured=read(rt)[0],raw=byte/255,expected=Math.pow(raw,night.MILKYWAY_CONTRAST)*night.MILKYWAY_EXPOSURE;
  verify(Number.isFinite(expected)&&Math.abs(measured-expected)<.001,'actual GPU panorama grading follows exported exposure/contrast',{raw,expected,measured});results.push({raw,measured});material.dispose();texture.dispose();
 }
 const rawRatio=results[1].raw/results[0].raw,gradedRatio=results[1].measured/results[0].measured;
 verify(results.every(v=>v.measured<v.raw)&&gradedRatio>rawRatio,'background is dimmer with a higher bright/dark ratio',{results,rawRatio,gradedRatio,exposure:night.MILKYWAY_EXPOSURE,contrast:night.MILKYWAY_CONTRAST});rt.dispose();return{results,rawRatio,gradedRatio};
}
async function run(){button.disabled=true;checks.length=0;views.replaceChildren();try{
 set_realtime(1);R_SkyBoxSet('');R_SkyClear();skyDraw();await night.R_MilkyWaySkyReady();skyDraw();sourceFocus();
 const selected=night.R_MilkyWaySkyLayers(world._skySolid,world._skyAlpha);
 verify(night.R_MilkyWaySkyStatus().state==='ready'&&selected&&faces.some(f=>f._skyMesh?.material===selected.solid),'actual supplied panorama is ready and selected on native hub faces');
 const native=verifySky('native Milky Way'),cloud=cloudProof();
 verify(faces.some(f=>f._skyMesh2?.material.opacity===night.MILKYWAY_CLOUD_OPACITY),'main sky retains native moving clouds at the shared visible strength',{opacity:night.MILKYWAY_CLOUD_OPACITY});
 COM_AddPack(COM_LoadPackFile('independent-dof-cube.pak',COM_BuildPack(['rt','bk','lf','ft','up','dn'].map(suffix=>({name:'gfx/env/dof-proof-'+suffix+'.tga',data:cubeTGA()})))));verify(R_SkyBoxSet('dof-proof-'),'named skybox uses the production loader');
 const named=verifySky('named cube'),tap=tapProof(),grade=gradeProbe();verify(errors.length===0,'no page or shader errors',{errors:errors.slice()});
 window.dofSkyResult={status:checks.every(c=>c.passed)&&errors.length===0?'PASS':'FAIL',scope:'Actual native welcome-hub sky faces and production named/MilkyWay materials into production DoF stage; near-focus and checker geometry are controlled fixtures, not played gameplay',input:{map:'maps/start.bsp',nativeSkyFaces:faces.length,focus:dof.R_DofFocus(),strength:dof.r_dof.value,width:W,height:H},shaders:{dof:pipeline.dofMaterial.fragmentShader,milkyWay:night.R_MilkyWaySkyGLSL()},checks:checks.slice(),native,cloud,named,tap,grade,errors:errors.slice()};
 }catch(e){window.dofSkyResult={status:'FAIL',error:String(e.stack||e),checks:checks.slice(),errors:errors.slice()};}
 report.textContent=JSON.stringify(window.dofSkyResult,null,2);button.disabled=false;return window.dofSkyResult;
}
try{
 const response=await fetch('/.distribution-cache/shareware.pak');if(!response.ok)throw Error('Actual local shareware fixture is unavailable');COM_AddPack(COM_LoadPackFile('dof-native-shareware.pak',await response.arrayBuffer()));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);models.Mod_Init();world=models.Mod_LoadForPreview('maps/start.bsp');if(!world)throw Error('Native hub unavailable');
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.autoClear=false;renderer.setClearColor(0,0);document.querySelector('#live').append(renderer.domElement);renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 pipeline=createPipeline();postState.gpu=pipeline;input=target(W,H,4);resultTarget=target();scene=new THREE.Scene();group=new THREE.Group();scene.add(group);worldState.group=worldState.renderGroup=group;set_solidskytexture(world._skySolid);set_alphaskytexture(world._skyAlpha);
 faces=world.surfaces.filter(f=>f.flags&4);faces.forEach((f,i)=>f.texturechain=faces[i+1]??null);camera=new THREE.PerspectiveCamera(85,W/H,1,8000);camera.up.set(0,1,0);camera.position.set(544,520,48);camera.lookAt(544,520,2048);camera.updateMatrixWorld(true);
 const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const c=((x>>1)^(y>>1))&1?230:15;pixels.set([c,c,c,255],(y*64+x)*4);}const map=new THREE.DataTexture(pixels,64,64);map.minFilter=map.magFilter=THREE.NearestFilter;map.needsUpdate=true;
 // Keep this controlled foreground in front of the native sky boundary. Scale
 // both its size and offset with distance so its projected test region is fixed.
 const distance=16,scale=distance/512;
 plane=new THREE.Mesh(new THREE.PlaneGeometry(520*scale,520*scale),new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide}));plane.quaternion.copy(camera.quaternion);plane.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()),distance).addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),-330*scale);scene.add(plane);
 button.disabled=false;button.onclick=run;window.runDofSkyProof=run;window.ready=true;report.textContent='Ready: native hub sky, actual Milky Way and named sky materials, strong near-focus DoF and independent world/tap controls.';
}catch(e){window.dofSkyResult={status:'FAIL',error:String(e.stack||e),checks,errors};report.textContent=JSON.stringify(window.dofSkyResult,null,2);window.ready=true;}
