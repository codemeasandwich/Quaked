// Finite authoring review through existing engine material/normal/post interfaces.
// No official index mutation, runtime upgrade claim or alternate material shader.
import * as THREE from 'three';
import '../src/newer/install.js';
import {createQuakeLightmapMaterial} from '../src/engine/render/gl_rsurf_materials.js';
import {R_NormalMapFor} from '../src/newer/render/gl_normals.js';
import {R_NormalPrepare} from '../src/newer/assets/normal_prepare.js';
import * as mode from '../src/newer/mode.js';
import * as post from '../src/newer/render/gl_post.js';
import * as vars from '../src/engine/common/cvar.js';

const $=id=>document.getElementById(id),params=new URL(location.href).searchParams;
const batchPath=params.get('batch')||'docs/quake/textures/codec-transition-batch-v1.json';
if(!/^docs\/quake\/textures\/[\w/.-]+\.json$/.test(batchPath)||batchPath.includes('..'))throw Error('Invalid authoring batch path');
const receipt={qualification:'Finite authored-material browser trial; no installed texture-loader, all-map, owner, CI or release acceptance.',batch:batchPath,checks:[],inputs:{},shaderErrors:[],draws:[]};
window.quakeTextureTiersTrial=receipt;
const sha=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
function check(ok,label){receipt.checks.push({passed:!!ok,label});if(!ok)throw Error(label);}
async function read(path,expected){
 check(!path.startsWith('/')&&!path.includes('..')&&!path.includes(':'),'Repository-relative input: '+path);
 const response=await fetch(path,{cache:'no-store'});check(response.ok,'Available: '+path);
 const bytes=await response.arrayBuffer(),hash=await sha(bytes);
 if(expected)check(hash===expected,'SHA256: '+path);
 receipt.inputs[path]={sha256:hash,bytes:bytes.byteLength};return bytes;
}
async function json(path,expected){return JSON.parse(new TextDecoder().decode(await read(path,expected)));}
async function image(path,expected){
 const bytes=await read(path,expected),bitmap=await createImageBitmap(new Blob([bytes]),{colorSpaceConversion:'none',premultiplyAlpha:'none'});
 const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);bitmap.close();
 return {width:canvas.width,height:canvas.height,canvas,data:new Uint8Array(context.getImageData(0,0,canvas.width,canvas.height).data)};
}
// Equal-weight BOX, integer source footprints, identical operation on both inputs.
// Values stay in original encoded colour space, as in the authoring BOX comparison.
function box(source,width,height){
 const sx=source.width/width,sy=source.height/height;
 check(Number.isInteger(sx)&&Number.isInteger(sy)&&sx>=1&&sy>=1,'Integer BOX footprint');
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d'),out=ctx.createImageData(width,height),weight=sx*sy;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<4;c++){
  let sum=0;for(let dy=0;dy<sy;dy++)for(let dx=0;dx<sx;dx++)sum+=source.data[(((y*sy+dy)*source.width)+x*sx+dx)*4+c];
  out.data[(y*width+x)*4+c]=Math.floor(sum/weight+.5);
 }
 ctx.putImageData(out,0,0);return canvas;
}
function repeatCanvas(target,picture,count){target.width=picture.width*count;target.height=picture.height*count;const ctx=target.getContext('2d');for(let y=0;y<count;y++)for(let x=0;x<count;x++)ctx.drawImage(picture,x*picture.width,y*picture.height);}
const resources=[],cache=new Map();
function texture(data,width,height,colorSpace=THREE.NoColorSpace){const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);t.flipY=false;t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=16;t.needsUpdate=true;resources.push(t);return t;}
let renderer,material,busy=false;
async function main(){
 const batch=await json(batchPath);check(batch.schemaVersion===3&&batch.family==='quake','Quake mixed-codec batch schema');
 const items=batch.items;check(Array.isArray(items)&&items.length>0,'Named material inputs');
 $('asset').replaceChildren(...items.map(item=>{const o=document.createElement('option');o.value=o.textContent=item.name;return o;}));
 if(params.has('asset'))$('asset').value=params.get('asset');if(params.has('tier'))$('tier').value=params.get('tier');
 for(const c of [post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,post.r_bounce,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_water,mode.r_newer_textures])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
 vars.Cvar_SetValue('r_hdr',1);for(const c of [post.r_dynres,post.r_bloom,post.r_volumetric,post.r_bounce,mode.r_newer_water])c.value=0;
 mode.r_newer_lighting.value=1;mode.r_newer_textures.value=1;
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);$('gpu').append(renderer.domElement);
 renderer.debug.onShaderError=(gl,p,v,f)=>receipt.shaderErrors.push(gl.getProgramInfoLog(p)+'\n'+gl.getShaderInfoLog(f));
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');receipt.webgl={version:gl.getParameter(gl.VERSION),renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,1,.1,100),front=new THREE.OrthographicCamera(-1,1,1,-1,.1,100);
 scene.add(new THREE.AmbientLight(0xffffff,.35));const light=new THREE.DirectionalLight(0xffffff,1.3);scene.add(light);
 const lightmap=texture(new Uint8Array([180,180,180,255]),1,1,THREE.SRGBColorSpace),geo=new THREE.PlaneGeometry(2,2);geo.setAttribute('uv1',geo.attributes.uv.clone());resources.push(geo);
 const mesh=new THREE.Mesh(geo);scene.add(mesh);
 async function load(item,tier){
  const key=item.name+':'+tier;if(cache.has(key))return cache.get(key);
  const manifest=await json(item.tierReceipt,item.tierReceiptSha256);check(manifest.schemaVersion===2&&manifest.family==='quake','Quake tier receipt');
  const native=await image(item.original,manifest.inputs.original.sha256),row=manifest.tiers[tier],maps={};
  check(row.factor===(tier==='Mid'?4:8),'Tier scale');
  for(const role of ['diffuse','height','normalX','normalY','normalZ']){
   const spec=row.outputs[role];check(spec.method===6&&(role==='diffuse'?!spec.lossless&&spec.quality===92:spec.lossless),'Per-role encoding '+role);
   maps[role]=await image(item.tiers[tier].files[role],spec.sha256);
   check(maps[role].width===native.width*row.factor&&maps[role].height===native.height*row.factor,'Tier dimensions '+role);
   if(role!=='diffuse'){
    const red=new Uint8Array(maps[role].width*maps[role].height);
    let scalarLayout=true;for(let i=0;i<red.length;i++){const p=i*4;if(maps[role].data[p]!==maps[role].data[p+1]||maps[role].data[p]!==maps[role].data[p+2]||maps[role].data[p+3]!==255)scalarLayout=false;red[i]=maps[role].data[p];}check(scalarLayout,'Scalar RGB layout '+role);
    check(await sha(red)===spec.intendedPixelSha256,'Exact decoded data channel '+role);
   }
  }
  const {width,height}=maps.diffuse,n=width*height,packed=new Uint8Array(n*4),scalar=new Float32Array(n);
  for(let i=0;i<n;i++){packed[i*4]=maps.normalX.data[i*4];packed[i*4+1]=maps.normalY.data[i*4];packed[i*4+2]=maps.normalZ.data[i*4];packed[i*4+3]=maps.height.data[i*4];scalar[i]=maps.height.data[i*4]/255;}
  const diffuse=texture(maps.diffuse.data,width,height,THREE.SRGBColorSpace);diffuse.userData.newerPicture=true;
  diffuse.userData.newerHeight={width,height,data:scalar,file:item.tiers[tier].files.height,strength:manifest.strength,cap:manifest.cap,authoredNormal:{width,height,data:packed,file:item.tierReceipt+':'+tier}};
  // Public preparation fallback keeps this finite review in memory; no cache assets authored.
  const work=R_NormalPrepare(diffuse,{disk:{open:async()=>{throw Object.assign(Error('filesystem/locking unavailable in finite authoring review'),{name:'SecurityError'});}}});await work.promise;
  check(work.status==='ready','Authored normal preparation ready');const normal=R_NormalMapFor(diffuse);
  check(normal?.image.data.length===packed.length&&normal.image.data.every((v,i)=>v===packed[i]),'Engine uses exact authored XYZ and height, no regeneration');
  const loaded={native,maps,diffuse,normal,manifest,packedSha256:await sha(packed)};cache.set(key,loaded);return loaded;
 }
 async function draw(){
  if(busy)return;busy=true;for(const control of document.querySelectorAll('select,input,button'))control.disabled=true;$('status').textContent='Loading and checking actual maps…';
  try{
   const name=$('asset').value,tier=$('tier').value,item=items.find(i=>i.name===name);check(!!item,'Selected material');
   const entry=await load(item,tier),view=$('size').value,count=+$('repeat').value,angleDegrees=+$('angle').value;
   const divisor=view==='half'?2:view==='quarter'?4:null;
   const a=divisor?box(entry.native,entry.native.width/divisor,entry.native.height/divisor):entry.native.canvas;
   const b=divisor?box(entry.maps.diffuse,entry.native.width/divisor,entry.native.height/divisor):entry.maps.diffuse.canvas;
   repeatCanvas($('native'),a,count);repeatCanvas($('finished'),b,count);
   $('replacement-label').textContent=tier+' '+entry.maps.diffuse.width+' × '+entry.maps.diffuse.height;
   const width=Math.max(entry.maps.diffuse.width,entry.maps.diffuse.height);renderer.setSize(width,width);
   mode.r_newer_normals.value=$('relief').checked?1:0;light.position.set(+$('light').value*2,-+$('light').value*3,4);
   const angle=angleDegrees*Math.PI/180;camera.position.set(Math.sin(angle)*3.1,0,Math.cos(angle)*3.1);camera.lookAt(0,0,0);camera.updateMatrixWorld();front.position.set(0,0,3);front.lookAt(0,0,0);front.updateMatrixWorld();
   const uv=geo.attributes.uv;uv.setXY(0,0,0);uv.setXY(1,count,0);uv.setXY(2,0,count);uv.setXY(3,count,count);uv.needsUpdate=true;
   mesh.scale.set(entry.native.width/Math.max(entry.native.width,entry.native.height),entry.native.height/Math.max(entry.native.width,entry.native.height),1);
   post.R_PostBegin(renderer,true,width,width);material?.dispose();material=createQuakeLightmapMaterial(entry.diffuse,lightmap);mesh.material=material;
   const active=angleDegrees===0?front:camera;post.R_PostBind(renderer);renderer.clear();renderer.render(scene,active);post.R_PostFinish(renderer,scene,active,{lx:0,ly:0,lw:width,lh:width},0,[],[],0,1,false);
   check(!$('relief').checked||material.normalMap===entry.normal,'Requested authored relief bound');check(!receipt.shaderErrors.length,'No shader errors');
   const readback=new Uint8Array(width*width*4);gl.readPixels(0,0,width,width,gl.RGBA,gl.UNSIGNED_BYTE,readback);
   check(!gl.isContextLost()&&readback.some((v,i)=>i%4!==3&&v>0),'Live nonempty WebGL framebuffer');
   const result={name,tier,dimensions:[entry.maps.diffuse.width,entry.maps.diffuse.height],view,comparisonDimensions:[[a.width,a.height],[b.width,b.height]],comparisonFilter:divisor?'equal-weight integer BOX':'unscaled decoded originals',repeat:count,angleDegrees,light:$('light').value,relief:!!material.normalMap,normalPackedSha256:entry.packedSha256,parallaxDepthTiles:.02,normalStrength:entry.manifest.strength,normalCap:entry.manifest.cap,material:material.type,framebuffer:[width,width],framebufferRgbaBottomUpSha256:await sha(readback),drawCalls:renderer.info.render.calls};
   const stem=[name,tier,view,'repeat'+count,'angle'+angleDegrees,'light'+$('light').value,$('relief').checked?'relief':'flat'].join('-');
   $('gpu-download').href=renderer.domElement.toDataURL('image/png');$('gpu-download').download=stem+'-gpu.png';
   const contact=document.createElement('canvas');contact.width=a.width+b.width;contact.height=Math.max(a.height,b.height);const ctx=contact.getContext('2d');ctx.drawImage(a,0,0);ctx.drawImage(b,a.width,0);
   $('comparison-download').href=contact.toDataURL('image/png');$('comparison-download').download=stem+'-comparison.png';
   receipt.lastDraw=result;receipt.draws.push(result);receipt.state='ready';$('status').textContent=name+' — '+tier+' — '+(item.status||'authoring candidate; inspect acceptance evidence');
  }catch(error){receipt.state='error';receipt.error=String(error.stack||error);$('status').textContent=receipt.error;throw error;}
  finally{busy=false;for(const control of document.querySelectorAll('select,input,button'))control.disabled=false;$('receipt').textContent=JSON.stringify(receipt,null,2);}
 }
 window.drawQuakeTextureTier=draw;
 for(const id of ['asset','tier','size','repeat','angle','light','relief'])$(id).onchange=()=>draw().catch(console.error);
 $('render').onclick=()=>draw().catch(console.error);await draw();
 window.addEventListener('pagehide',()=>{material?.dispose();resources.forEach(r=>r.dispose());post.R_PostShutdown();renderer.dispose();},{once:true});
}
main().catch(error=>{receipt.state='error';receipt.error=String(error.stack||error);$('receipt').textContent=JSON.stringify(receipt,null,2);$('status').textContent=receipt.error;console.error(error);});
