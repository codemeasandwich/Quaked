// Public native model/texture loading, production alias/liquid materials and the
// existing HDR compositor. This controlled GPU fixture owns no gameplay state.
import '../src/engine/render/gl_rsurf.js';
import * as THREE from 'three';
import '../src/newer/install.js';
import * as pak from '../src/engine/common/pak.js';
import * as models from '../src/engine/render/gl_model.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { entity_t } from '../src/engine/render/render.js';
import { cl, cl_entities } from '../src/engine/client/client.js';
import { R_DrawAliasModel, GL_DrawAliasFrame } from '../src/engine/render/gl_mesh.js';
import { R_LiquidSurfaceMaterial } from '../src/engine/render/gl_rsurf_liquids.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import * as post from '../src/newer/render/gl_post.js';
import * as skins from '../src/newer/render/r_newerskins.js';
import * as lava from '../src/newer/render/r_lavaman.js';
import { pulseLava } from '../src/newer/render/r_post_gbuffer.js';
import { postState } from '../src/newer/render/r_post_state.js';
import { R_PostSetLiquidRegions } from '../src/newer/render/r_post_liquids.js';
import { r_lerpmodels } from '../src/newer/render/r_anim.js';
const W=600,H=500,button=document.querySelector('#run'),report=document.querySelector('#report'),views=document.querySelector('#views'),previewButton=document.querySelector('#preview'),errors=[],checks=[];
const verify=(passed,name,data={})=>checks.push({passed:!!passed,name,...data});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
async function member(url,name){
 const read=async(start,length)=>{const r=await fetch(url,{headers:{Range:`bytes=${start}-${start+length-1}`}});if(r.status!==206)throw Error('Byte-range fixture server required: '+url);return r.arrayBuffer();};
 const head=new DataView(await read(0,12)),directory=await read(head.getUint32(4,true),head.getUint32(8,true)),view=new DataView(directory),bytes=new Uint8Array(directory);
 for(let i=0;i<bytes.length;i+=64)if(new TextDecoder().decode(bytes.subarray(i,i+56)).split('\0')[0]===name)return read(view.getUint32(i+56,true),view.getUint32(i+60,true));throw Error('Missing owned member '+name);
}
function mount(name,data){pak.COM_AddPack({filename:'lava-hdr-native:'+name,files:[{name,filepos:0,filelen:data.byteLength}],data});}
let renderer,scene,camera,actor,nativeLava,nativeLavaMesh,background,heldBackground,occluder,header,source,draws=0,ready=false,previewTicket=0;
const shades=new Float32Array(256).fill(1);
function readAttachment(index){const rt=postState.gpu.hdr,type=rt.textures[index].type,raw=type===THREE.HalfFloatType?new Uint16Array(W*H*4):type===THREE.FloatType?new Float32Array(W*H*4):new Uint8Array(W*H*4);renderer.readRenderTargetPixels(rt,0,0,W,H,raw,0,index);return Float32Array.from(raw,v=>type===THREE.HalfFloatType?THREE.DataUtils.fromHalfFloat(v):type===THREE.UnsignedByteType?v/255:v);}
function stats(data,mask,threshold=1){const warm=[];for(let i=0;i<W*H;i++){const j=i*4;if(mask&&!mask[i])continue;const[r,g,b]=data.subarray(j,j+3);if(r>threshold&&r>g*1.05&&r>b*1.4)warm.push([r,g,b]);}warm.sort((a,b)=>a[0]-b[0]);const bright=warm.slice(Math.floor(warm.length*.9)),mean=k=>bright.reduce((sum,c)=>sum+c[k],0)/Math.max(1,bright.length),rgb=[mean(0),mean(1),mean(2)];return{warmPixels:warm.length,redP50:warm[Math.floor(warm.length*.5)]?.[0]??0,redP90:warm[Math.floor(warm.length*.9)]?.[0]??0,redP99:warm[Math.floor(warm.length*.99)]?.[0]??0,redMax:warm.at(-1)?.[0]??0,brightMeanRGB:rgb,brightGreenToRed:rgb[1]/Math.max(rgb[0],1e-8),brightBlueToRed:rgb[2]/Math.max(rgb[0],1e-8)};}
function displayStats(hdr,pixels,mask){const indices=[];for(let i=0;i<W*H;i++){if(mask&&!mask[i])continue;const[r,g,b]=hdr.subarray(i*4,i*4+3);if(r>1&&r>g*1.05&&r>b*1.4)indices.push(i);}indices.sort((a,b)=>hdr[a*4]-hdr[b*4]);const bright=indices.slice(Math.floor(indices.length*.9)),rgb=[0,1,2].map(k=>bright.reduce((sum,i)=>sum+pixels[i*4+k],0)/Math.max(1,bright.length));return{selection:'same pixels as brightest 10 percent of pre-tone warm red samples',pixels:bright.length,meanRGB:rgb,greenToRed:rgb[1]/Math.max(rgb[0],1e-8),blueToRed:rgb[2]/Math.max(rgb[0],1e-8)};}

function difference(a,b,mask){let changed=0,energy=0;for(let i=0;i<W*H;i++){if(mask&&!mask[i])continue;let sum=0;for(let k=0;k<3;k++)sum+=Math.abs(a[i*4+k]-b[i*4+k]);if(sum>3)changed++;energy+=sum;}return{changed,energy};}
function render({kind='actor',heat=0,visualTime=1.125,heatTime=1.125,underwater=false,picture=false,label='',sample=true}={}){
 const frameId=++draws;
 cl.time=visualTime;vars.Cvar_SetValue('r_heathaze',heat);post.R_PostSetUnderwater(underwater);post.R_PostBegin(renderer,true,W,H);lava.R_LavaManBegin(scene);
 actor.frame=17;actor.skinnum=0;actor.origin.fill(0);const mesh=R_DrawAliasModel(actor,header,shades,.5,visualTime);if(mesh.parent!==scene)scene.add(mesh);mesh.visible=kind!=='lava';mesh._quakeOwner=actor;
 background.visible=kind==='actor'||kind==='occluded';heldBackground.visible=kind==='held';nativeLavaMesh.visible=kind==='lava';occluder.visible=kind==='occluded';scene.updateMatrixWorld(true);lava.R_LavaManSeen(actor,mesh,scene,visualTime);lava.R_LavaManEnd(scene);
 pulseLava(visualTime);camera.updateMatrixWorld(true);post.R_PostLightsFrame(renderer,scene,camera,frameId,[],[],heatTime,false);post.R_PostBind(renderer);renderer.clear();renderer.render(scene,camera);
 let hdr,albedo,bodyMask,heldMask;if(sample){hdr=readAttachment(0);albedo=readAttachment(2);bodyMask=Uint8Array.from({length:W*H},(_,i)=>albedo[i*4+3]>.058&&albedo[i*4+3]<.07?1:0);heldMask=Uint8Array.from({length:W*H},(_,i)=>albedo[i*4+3]>.075&&albedo[i*4+3]<.085?1:0);}
 post.R_PostFinish(renderer,scene,camera,{lx:0,ly:0,lw:W,lh:H},frameId,[],[],heatTime,1,false);
 const cm=postState.gpu.compositeMaterial.uniforms;let pixels;if(sample){pixels=new Uint8Array(W*H*4);renderer.getContext().readPixels(0,0,W,H,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,pixels);}
 if(picture){const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=renderer.domElement.toDataURL();caption.textContent=label;figure.append(img,caption);views.append(figure);}
 return{pixels,hdr,bodyMask,heldMask,actorCount:cm.uLavaActorCount.value,poolCount:cm.uLavaCount.value,heat:cm.uHeat.value,glError:renderer.getContext().getError(),glow:mesh.material.color.r,nativeGlow:nativeLavaMesh.material.color.r,poolVectors:cm.uLavaMin.value.map(v=>v.toArray())};
}
async function run(){
 previewTicket++;button.disabled=previewButton.disabled=true;checks.length=0;views.replaceChildren();const started=performance.now();
 try{
  R_PostSetLiquidRegions([],[]);const body=render({picture:true,label:'Lava Man: shared HDR, heat off'}),pool=render({kind:'lava',picture:true,label:'Literal native *lava1: same HDR/exposure'});
  const bodyHDR=stats(body.hdr,body.bodyMask),nativeHDR=stats(pool.hdr),bodyDisplay=displayStats(body.hdr,body.pixels,body.bodyMask),nativeDisplay=displayStats(pool.hdr,pool.pixels),ratio=bodyHDR.redP90/Math.max(nativeHDR.redP90,.0001);
  verify(body.glError===0&&pool.glError===0,'Literal native lava and posed actor render cleanly through actual shared HDR');
  verify(bodyHDR.warmPixels>100&&nativeHDR.warmPixels>100,'Actual pre-tone-map HDR buffers contain bright warm texels from both native lava and the creature',{bodyHDR,nativeHDR});
  verify(body.glow===pool.nativeGlow&&body.glow>1,'Actual registered actor and native liquid use the same live shared HDR pulse',{body:body.glow,native:pool.nativeGlow});
  // Review this measured range alongside the side-by-side actual render. It is
  // an independently specified same-intensity/chroma witness, not identical artwork.
  verify(ratio>=.7&&ratio<=1.3,'Hot creature pigment matches literal native lava HDR red intensity within 30 percent',{ratio,bodyHDR,nativeHDR});
  verify(Math.abs(bodyHDR.brightGreenToRed-nativeHDR.brightGreenToRed)<=.05,'Bright hot pigment matches native lava HDR green/red chroma within .05',{body:bodyHDR.brightGreenToRed,native:nativeHDR.brightGreenToRed});
  verify(Math.abs(bodyHDR.brightBlueToRed-nativeHDR.brightBlueToRed)<=.035,'Bright hot pigment matches native lava HDR blue/red chroma within .035',{body:bodyHDR.brightBlueToRed,native:nativeHDR.brightBlueToRed});
  const displayDelta=bodyDisplay.meanRGB.map((value,i)=>Math.abs(value-nativeDisplay.meanRGB[i]));verify(displayDelta.every(value=>value<=20),'Bright post-tone hot pigment matches native lava within 20 levels per RGB channel',{bodyDisplay,nativeDisplay,displayDelta});
  const off=render({heat:0}),on=render({heat:1,picture:true,label:'Actor heat on: same paused skin pose'}),later=render({heat:1,heatTime:1.7,picture:true,label:'Only heat clock advanced; body UV clock held'});
  const outside=Uint8Array.from(off.bodyMask,v=>v?0:1),shimmer=difference(off.pixels,on.pixels,outside),motion=difference(on.pixels,later.pixels,outside);
  verify(off.actorCount===0&&on.actorCount===1&&on.heat>0,'Actual registered visible native actor enters the separate production heat pool');
  verify(shimmer.changed>40&&motion.changed>40,'Separate actor heat refracts real patterned background and animates with its compositor clock',{shimmer,motion});
  verify(on.glError===0&&later.glError===0,'Actor heat uses the existing GL-clean compositor');
  const blockedOff=render({kind:'occluded',heat:0}),blockedOn=render({kind:'occluded',heat:1}),blocked=difference(blockedOff.pixels,blockedOn.pixels);
  verify(blockedOn.actorCount===1&&blocked.changed===0,'An opaque foreground depth blocker suppresses heat behind it',{blocked,actorCount:blockedOn.actorCount});
  const heldOff=render({kind:'held',heat:0}),heldOn=render({kind:'held',heat:1}),heldDelta=difference(heldOff.pixels,heldOn.pixels,heldOff.heldMask);
  verify(heldOn.actorCount===1&&heldOff.heldMask.some(Boolean)&&heldDelta.changed===0,'Actual public held-receiver material protects its pixels from background heat',{heldDelta,heldPixels:heldOff.heldMask.reduce((a,b)=>a+b,0)});
  const wetOff=render({heat:0,underwater:true}),wetOn=render({heat:1,underwater:true}),wet=difference(wetOff.pixels,wetOn.pixels);
  verify(wetOn.actorCount===0&&wetOn.heat===0&&wet.changed===0,'Underwater suppresses the separate actor-heat addition',{wet});
  const pools=Array.from({length:4},(_,i)=>({kind:2,min:[1000+i*200,-90],max:[1096+i*200,90],z:0,probePoint:[1000+i*200,0,8]}));R_PostSetLiquidRegions([],pools);
  const four=render({heat:1});actor._levelViewGhost=true;const noActor=render({heat:1});delete actor._levelViewGhost;
  verify(four.poolCount===4&&four.actorCount===1&&noActor.poolCount===4&&noActor.actorCount===0&&JSON.stringify(four.poolVectors)===JSON.stringify(noActor.poolVectors),'Actor heat never evicts or rewrites the four existing pool slots',{withActor:four.poolCount,withoutActor:noActor.poolCount});R_PostSetLiquidRegions([],[]);
  const poolRegion={kind:2,min:[-60,-60],max:[60,60],z:0,probePoint:[0,0,8]};R_PostSetLiquidRegions([],[poolRegion]);actor._levelViewGhost=true;const poolOff=render({heat:0}),poolOn=render({heat:1,picture:true,label:'Existing pool-only heat: actor heat excluded'}),poolHeat=difference(poolOff.pixels,poolOn.pixels);delete actor._levelViewGhost;R_PostSetLiquidRegions([],[]);
  verify(poolOn.poolCount===1&&poolOn.actorCount===0&&poolHeat.changed>40,'Existing pool-only heat still refracts the actual GPU background independently',{poolHeat});
  verify(errors.length===0,'No runtime or shader errors in the actual HDR/heat trial',{errors:errors.slice()});
  const result={status:checks.every(c=>c.passed)&&errors.length===0?'PASS':'FAIL',scope:'Controlled actual native owned model/BSP texture, public materials and shared compositor; gameplay and owner visual acceptance separate',source,bodyHDR,nativeHDR,bodyDisplay,nativeDisplay,hotRedP90Ratio:ratio,heat:{shimmer,motion,blocked,heldDelta,wet,poolHeat},checks:checks.slice(),draws,elapsedMs:performance.now()-started,errors:errors.slice()};window.rogueSkinResult=result;report.textContent=JSON.stringify(result,null,2);
 }catch(e){window.rogueSkinResult={status:'FAIL',error:String(e.stack||e),checks:checks.slice(),errors:errors.slice()};report.textContent=JSON.stringify(window.rogueSkinResult,null,2);}
 finally{button.disabled=previewButton.disabled=false;post.R_PostSetUnderwater(false);}
}
try{
 vars.Cvar_SetStorageWritable(false);
 const controls=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_bounce,post.r_volumetric,post.r_newbright,post.r_newcontrast,post.r_pointshadows,post.r_reflect,post.r_mist,post.r_heathaze,post.r_caustics,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_enemies,mode.r_newer_water,mode.r_newer_shadows,r_lerpmodels];for(const c of controls)if(c&&!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
 for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_bounce:0,r_volumetric:0,r_newbright:1,r_newcontrast:1,r_pointshadows:0,r_reflect:0,r_mist:0,r_heathaze:0,r_caustics:0,r_newer_lighting:1,r_newer_normals:1,r_newer_enemies:1,r_newer_water:1,r_newer_shadows:0,r_lerpmodels:0}))vars.Cvar_SetValue(name,value);
 const palette=await member('games/shareware/pak0.pak','gfx/palette.lmp'),bsp=await member('games/shareware/pak0.pak','maps/start.bsp'),modelBytes=await member('games/Dissolution of Eternity/pak0.pak','progs/lavaman.mdl');mount('gfx/palette.lmp',palette);mount('maps/start.bsp',bsp);mount('progs/lavaman.mdl',modelBytes);VID_SetPalette(new Uint8Array(palette));models.Mod_Init();
 mode.r_newer_textures.value=0;const world=models.Mod_ForName('maps/start.bsp',true);mode.r_newer_textures.value=1;const model=models.Mod_ForName('progs/lavaman.mdl',true);await model.aliasSourceIdentity.promise;if(model.aliasSourceIdentity.sha256!==lava.LAVA_MAN.sha)throw Error('Owned model identity mismatch');nativeLava=world.textures.find(t=>t?.name==='*lava1');if(!nativeLava?.gl_texture)throw Error('Actual native hub *lava1 unavailable');
 header=model.cache.data;source={model:'progs/lavaman.mdl',modelSHA256:model.aliasSourceIdentity.sha256,BSP:'maps/start.bsp',BSPSHA256:await digest(bsp),paletteSHA256:await digest(palette),texture:nativeLava.name,nativeLavaRGBA:await digest(nativeLava.gl_texture.image.data),nativeLavaDimensions:[nativeLava.width,nativeLava.height],originalSourceBytesRetained:true};
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.setClearColor(0,0);renderer.autoClear=false;renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});document.querySelector('#live').append(renderer.domElement);
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(50,W/H,1,2000);camera.up.set(0,0,1);const native=GL_DrawAliasFrame(header,17),box=new THREE.Box3().setFromBufferAttribute(native.posAttr),center=box.getCenter(new THREE.Vector3()),span=Math.max(...box.getSize(new THREE.Vector3()).toArray());camera.position.copy(center).add(new THREE.Vector3(span*3,span*.12,span*.45));camera.lookAt(center.clone().add(new THREE.Vector3(0,0,20)));camera.updateMatrixWorld(true);
 actor=new entity_t();actor.model=model;actor.skinnum=0;actor._entityIndex=31;cl_entities[31]=actor;cl.worldmodel={name:'maps/lava-hdr-fixture.bsp',surfaces:[],entities:'',nodes:[]};cl.stats[0]=100;
 post.R_PostBegin(renderer,true,W,H);skins.R_NewerSetIndex(await(await fetch('assets/game/enemies/index.json')).json());await skins.R_NewerSkinsPrepare([model]);const deadline=performance.now()+20000;while(!skins.R_NewerSkinsStatus([model]).settled){if(performance.now()>deadline)throw Error('Actual stored skin/normal preparation timeout');await new Promise(r=>setTimeout(r,20));}
 const pattern=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const c=((x>>1)^(y>>1))&1?170:20;pattern.set([c,c*.85,c*.7,255],(y*128+x)*4);}const texture=new THREE.DataTexture(pattern,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
 const direction=camera.position.clone().sub(center).normalize(),plane=(mat,depth)=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(span*10,span*10),mat);mesh.quaternion.copy(camera.quaternion);mesh.position.copy(center).addScaledVector(direction,depth);scene.add(mesh);return mesh;};
 background=plane(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),-140);heldBackground=plane(skins.R_HeldViewmodelMaterial(skins.R_AssetAliasMaterial({diffuse:texture},'lava-heat-held-receiver')),-140);occluder=plane(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),100);nativeLavaMesh=plane(R_LiquidSurfaceMaterial(nativeLava,1),0);for(let i=0;i<nativeLavaMesh.geometry.attributes.uv.count;i++){const uv=nativeLavaMesh.geometry.attributes.uv;uv.setXY(i,uv.getX(i)*8,uv.getY(i)*8);}R_PostSetLiquidRegions([],[]);
 ready=true;window.ready=true;button.disabled=previewButton.disabled=false;report.textContent='Ready: actual native hub lava and Rogue creature, shared HDR/materials.';button.addEventListener('click',run);
 previewButton.addEventListener('click',()=>{const ticket=++previewTicket,start=performance.now();button.disabled=previewButton.disabled=true;R_PostSetLiquidRegions([],[]);const frame=()=>{if(ticket!==previewTicket)return;const elapsed=(performance.now()-start)/1000;render({heat:document.querySelector('#heat').checked?1:0,visualTime:1.125+Math.min(6,elapsed),heatTime:1.125+Math.min(6,elapsed),sample:false});if(elapsed<6)requestAnimationFrame(frame);else button.disabled=previewButton.disabled=false;};frame();});
 render({sample:false});
}catch(e){report.textContent=String(e.stack||e);window.rogueSkinResult={status:'FAIL',error:String(e.stack||e)};}
