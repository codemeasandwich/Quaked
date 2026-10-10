import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';
import * as anim from '../src/newer/render/r_anim.js';
import {R_ClassicMaterial} from '../src/newer/render/r_classicstate.js';
import {createQuakeLightmapMaterial} from '../src/engine/render/gl_rsurf.js';
import {R_NewerTextureUpgrade,R_GlassTextureKey,R_ClassicTexture} from '../src/newer/render/r_newertextures.js';
const W=360,H=480,report=document.querySelector('#report'),errors=[];
window.addEventListener('error',e=>errors.push(e.message));
for(const v of [post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,post.r_bounce,post.r_pointshadows,post.r_newbright,post.r_newcontrast,anim.r_newer_normals,anim.r_newer_lighting,anim.r_newer_textures])if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);
for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_volumetric:0,r_bounce:0,r_pointshadows:0,r_newbright:1,r_newcontrast:1,r_newer_normals:1,r_newer_lighting:1,r_newer_textures:1}))vars.Cvar_SetValue(name,value);
const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true,antialias:false});renderer.setSize(W,H);renderer.autoClear=false;renderer.setClearColor(0,0);document.querySelector('#main').append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,W/H,1,1200),lm=new THREE.DataTexture(new Uint8Array([180,180,180,255]),1,1);lm.needsUpdate=true;
const classicTarget=new THREE.WebGLRenderTarget(W,H);
let mesh,diffuse,nativeMaterial,classicMaterial,turn=false,lightSide=1,normalOn=true,classic=false,entry,decodeExact=false,generation=0;
const options=await(await fetch('newer/textures/glass/trial-options.json')).json();
const regionReviews=await(await fetch('newer/textures/glass/region-review.json')).json();
const selector=document.querySelector('#variant');options.forEach((e,i)=>{const o=document.createElement('option');o.value=i;o.textContent=e.campaigns.join('/')+' · '+e.name+' · '+e.key.slice(0,8);selector.add(o)});
async function pixels(url){const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);return{data:new Uint8Array(ctx.getImageData(0,0,image.width,image.height).data),width:image.width,height:image.height};}
function lights(side=lightSide){post.R_BuildWorldLights({nodes:[{contents:-1,visframe:1}],surfaces:[],entities:'{"classname" "worldspawn"}\n{"classname" "light" "origin" "'+[side*48,48,85].join(' ')+'" "light" "500" "_color" "1 0.85 0.55"}'});post.R_BuildSunOccluder({surfaces:[]});}
function draw(){
 anim.R_AnimSetClassicPass(classic);vars.Cvar_SetValue('r_newer_normals',normalOn?1:0);mesh.material=classic?classicMaterial:nativeMaterial;
 camera.position.set(turn?100:0,0,250);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 if(classic){
  post.R_PostBegin(renderer,false,W,H);post.classicLook.value=1;renderer.setRenderTarget(classicTarget);renderer.clear();renderer.render(scene,camera);
  const screen=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(classicTarget,0,0,W,H,screen);renderer.setRenderTarget(null);renderer.clear();renderer.render(scene,camera);
  const error=renderer.getContext().getError();post.classicLook.value=0;anim.R_AnimSetClassicPass(false);return{screen,albedo:new Uint8Array(screen.length),normal:new Uint16Array(screen.length),error};
 }
 post.classicLook.value=0;post.R_PostBegin(renderer,true,W,H);post.R_PostLightsFrame(renderer,scene,camera,1,new Array(64).fill(264),[],1,false);post.R_PostBind(renderer);renderer.clear();renderer.render(scene,camera);
 const target=renderer.getRenderTarget(),albedo=new Uint8Array(W*H*4),normal=new Uint16Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,albedo,undefined,2);renderer.readRenderTargetPixels(target,0,0,W,H,normal,undefined,1);
 post.R_PostFinish(renderer,scene,camera,{lx:0,ly:0,lw:W,lh:H},1,new Array(64).fill(264),[],1,1,false);
 const gl=renderer.getContext(),screen=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,screen);const error=gl.getError();anim.R_AnimSetClassicPass(false);return{screen,albedo,normal,error};
}
async function select(i){const token=++generation;window.glassTrialReady=null;decodeExact=false;entry=options[i];report.textContent='Loading '+entry.name+'…';if(mesh){scene.remove(mesh);mesh.geometry.dispose();nativeMaterial.dispose();classicMaterial.dispose();diffuse.dispose();}
 const image=await pixels('newer/textures/'+entry.nativeFile);if(token!==generation)return;diffuse=new THREE.DataTexture(image.data,image.width,image.height);diffuse.colorSpace=THREE.SRGBColorSpace;diffuse.wrapS=diffuse.wrapT=THREE.RepeatWrapping;diffuse.needsUpdate=true;
 if(R_GlassTextureKey(diffuse)!==entry.key)throw Error('Native palette identity mismatch');R_NewerTextureUpgrade(entry.name,diffuse);const until=performance.now()+35000;while(!diffuse.userData.newerPicture&&!diffuse.userData.newerFallback){if(performance.now()>until)throw Error('Glass upgrade timed out');await new Promise(r=>setTimeout(r,20))}
 if(!diffuse.userData.newerHeight?.authoredNormal)throw Error('Authored/generated normal unavailable for '+entry.name);
 nativeMaterial=createQuakeLightmapMaterial(diffuse,lm);classicMaterial=R_ClassicMaterial(createQuakeLightmapMaterial(R_ClassicTexture(diffuse),lm),t=>t);
 const ratio=image.height/image.width,geometry=new THREE.PlaneGeometry(ratio>=2?72:160,ratio>=2?216:160);for(let i=0;i<geometry.attributes.uv.count;i++)geometry.attributes.uv.setY(i,1-geometry.attributes.uv.getY(i));geometry.setAttribute('uv1',geometry.attributes.uv.clone());mesh=new THREE.Mesh(geometry,nativeMaterial);scene.add(mesh);lights();draw();
 const digest=await crypto.subtle.digest('SHA-256',diffuse._normalMap.image.data);
 const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');decodeExact=hex===entry.assembledNormalSha256;
 if(!decodeExact)throw Error('Decoded normal/height bytes differ from source');window.glassTrialReady=entry.key;describe();
}
function describe(){report.textContent=JSON.stringify({entry,normalOn,classic,turn,lightSide,errors},null,2)}
function diff(a,b){let n=0;for(let i=0;i<a.length;i++)if(i%4!==3&&a[i]!==b[i])n++;return n;}
function inShape(shape,x,y){
 if(shape.type==='rect'){const[a,b,c,d]=shape.bounds;return x>=a&&x<=c&&y>=b&&y<=d}
 if(shape.type==='ellipse'){const[cx,cy]=shape.center,[rx,ry]=shape.radius;return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1}
 let inside=false;const p=shape.points;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside}return inside;
}
function frameOracle(image){
 const review=regionReviews.find(v=>v.name===entry.name&&v.nativeRGBAKey===entry.key).regionReview;
 const scale=Math.tan(48*Math.PI/360)*250,gw=mesh.geometry.parameters.width,gh=mesh.geometry.parameters.height;let ordinaryPixels=0,falseGlassTags=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const u=.5+(2*(x+.5)/W-1)*scale*W/H/gw,v=.5-(2*(y+.5)/H-1)*scale/gh;if(u<0||u>1||v<0||v>1)continue;
  // Conservative2% margin excludes parallax/filter boundary mixtures.
  const near=review.shapes.some(s=>[-.02,0,.02].some(dx=>[-.02,0,.02].some(dy=>inShape(s,u+dx,v+dy))));
  if(!near){ordinaryPixels++;if(image.albedo[(y*W+x)*4+3]===128)falseGlassTags++}
 }
 return{ordinaryPixels,falseGlassTags,marginUv:.02};
}
function check(){const original={normalOn,classic,turn,lightSide};classic=false;normalOn=true;turn=false;lightSide=1;lights();const on=draw();lightSide=-1;lights();const moved=draw();normalOn=false;const off=draw();classic=true;normalOn=true;const classicOn=draw();normalOn=false;const classicOff=draw();
 let glassPixels=0,tagPixelsWithNormalsOff=0;for(let i=3;i<on.albedo.length;i+=4){if(on.albedo[i]===128)glassPixels++;if(off.albedo[i]===128)tagPixelsWithNormalsOff++;}
 const expectsGlass=entry.regionGlass===true;const frameScope=frameOracle(on);
 const result={status:frameScope.falseGlassTags===0&&(!expectsGlass||glassPixels>100)&&tagPixelsWithNormalsOff===0&&diff(on.screen,moved.screen)>100&&(!expectsGlass||diff(moved.screen,off.screen)>100)&&decodeExact&&diff(classicOn.screen,classicOff.screen)===0&&[on,moved,off,classicOn,classicOff].every(x=>x.error===0)?'PASS':'FAIL',entry,frameScope,glassPixels,tagPixelsWithNormalsOff,movingLightRgbChanges:diff(on.screen,moved.screen),normalResponseRgbChanges:diff(moved.screen,off.screen),classicRgbChanges:diff(classicOn.screen,classicOff.screen),glErrors:[on,moved,off,classicOn,classicOff].map(x=>x.error),decodedNormalSha256Exact:decodeExact,decodedNormalAlpha:'assembled from separately decoded opaque RGB + height',errors};window.glassGpuResult=result;report.textContent=JSON.stringify(result,null,2);
 ({normalOn,classic,turn,lightSide}=original);lights();draw();return result;}
selector.onchange=()=>select(Number(selector.value)).catch(e=>{report.textContent=String(e.stack);errors.push(String(e))});
for(const[id,fn]of Object.entries({light:()=>{lightSide*=-1;lights()},view:()=>turn=!turn,compare:()=>normalOn=!normalOn,classic:()=>classic=!classic})){document.querySelector('#'+id).onclick=()=>{fn();draw();describe()}}
document.querySelector('#check').onclick=check;
const initial=options.findIndex(e=>e.name==='window02_1'&&e.campaigns.includes('id1'));selector.value=initial;await select(initial);check();
