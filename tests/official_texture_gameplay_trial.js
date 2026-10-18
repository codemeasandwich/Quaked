import {AssetFetch} from '../src/platform/distribution.js';
// Public native E2M1 trial: actual loader, map, server, player and world materials.
// Only diagnostic controls and evidence capture are added; official selection is unchanged.
import * as THREE from 'three';
import '../src/newer/install.js';
import {R_GlassTextureKey,R_NewerTexturesRevert,R_NewerTexturesForModel} from '../src/newer/render/r_newertextures.js';
import {Cvar_SetStorageWritable,Cvar_SetValue,Cvar_VariableValue} from '../src/engine/common/cvar.js';
import {R_FlashlightToggle,R_FlashlightBeam} from '../src/newer/render/r_flashlight.js';
const panel=document.querySelector('section'),statusNode=document.querySelector('#status'),receiptNode=document.querySelector('#receipt');
const fixtures={
 machine:{game:'mg1',map:'mge5m1',aliases:['mg1-comp1_2','mg1-comp1_3','mg1-metal1_1','mg1-metal1_3','mg1-metal1_4']},
 stonewall:{game:'quake',map:'e4m3',aliases:['bricka2_4','city4_2'],minimumJoinLength:16},
 stonefloor:{game:'quake',map:'e2m7',aliases:['city6_8','city4_8']},
 citybricks:{game:'quake',map:'dm5',aliases:['city2_3','city2_6'],minimumJoinLength:16,allowCornerJoins:true},
 metalfamily:{game:'mg1',map:'mgdm3',aliases:['TF_Metal4','TF_Metal4b','TF_MetWall4_02','TF_Metal4_04']},
 rockpair:{game:'quake',map:'end',aliases:['rock5_2','rock3_8-base'],allowCornerJoins:true},
 quietmetal:{game:'mg1',map:'mge4m1',aliases:['TF_Metal_02','metal1_2c','TF_Metal4_6a','cable1_1'],inspectionFaces:{panel:39827,floor:45075}},
 base:{game:'quake',map:'e2m1',aliases:['tech08_3','tech08_4']}
};
const fixture=fixtures[new URL(location.href).searchParams.get('scene')]||fixtures.base;
const mapPath='maps/'+fixture.map+'.bsp';
document.querySelector('strong').textContent='Actual '+fixture.map.toUpperCase()+': photographic texture joins';
document.title='Quaked — actual '+fixture.map.toUpperCase()+' texture join';
document.querySelector('#restart').textContent='Restart '+fixture.map.toUpperCase();
const receipt={schema:1,state:'preparing',priorFailedSetup:'E1M1 was rejected: the bundled runtime map lacks tech08_3. Registered-pack E1M1 faces1115/1125 were not the active game map. This fixture now uses actual E2M1 and discovers its own join.',qualification:'Current accepted official materials versus original game textures in the actual level; other-map coverage remains separate.',art:'hd',relief:false,view:'near',sceneFrames:0,errors:[],checks:[],materials:[]};
const publish=()=>{statusNode.textContent=`${receipt.state} · ${receipt.art} · ${receipt.view} · relief ${receipt.relief?'on':'off'} · ${receipt.sceneFrames} native frames${receipt.errors.length?' · '+receipt.errors.at(-1):''}`;receiptNode.textContent=JSON.stringify(receipt,null,2);};
const check=(ok,label)=>{receipt.checks.push({passed:!!ok,label});if(!ok)throw Error(label);};
const fail=error=>{receipt.errors.push(String(error.stack||error));receipt.state='failed';publish();};
window.addEventListener('error',e=>fail(e.error||e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
for(const type of ['click','mousedown','mouseup','keydown','keyup','pointerdown','pointerup','touchstart','touchend'])panel.addEventListener(type,e=>e.stopPropagation());
const objectURLs=[];
let disposed=false,renderer=null,originalRender=null,epoch=0,lastPublish=0,frameRequested=false,receiptRequested=false;
let restorePresentation=()=>{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(test,label,ms=180000){const deadline=performance.now()+ms;while(!test()){if(disposed)throw Error('Preview stopped');if(performance.now()>deadline)throw Error(label+' exceeded bounded setup deadline');await sleep(100);}}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
async function fetchBytes(path){const response=await AssetFetch(path,{cache:'no-store'});if(!response.ok)throw Error(path+': HTTP '+response.status);return response.arrayBuffer();}
function download(url,name){const a=document.createElement('a');a.href=url;a.download=name;a.textContent='Download '+name;a.style.display='block';panel.append(a);}
function saveReceipt(){const url=URL.createObjectURL(new Blob([JSON.stringify({...receipt,capturedAt:new Date().toISOString()},null,2)],{type:'application/json'}));objectURLs.push(url);download(url,`official-texture-${receipt.art}-${receipt.view}-${Date.now()}.json`);}
function stop(){if(disposed)return;disposed=true;epoch++;renderer?.setAnimationLoop(null);if(renderer&&originalRender)renderer.render=originalRender;restorePresentation();receipt.state='stopped; reload page to resume';publish();}
document.querySelector('#stop').onclick=stop;window.addEventListener('pagehide',()=>{stop();objectURLs.forEach(url=>URL.revokeObjectURL(url));},{once:true});
window.officialTextureGameplayTrial={receipt,stop};publish();
try{
 // Avoid a saved mission-pack selection or saving this page's cvar experiments.
 const url=new URL(location.href);url.searchParams.set('game',fixture.game);history.replaceState(null,'',url);Cvar_SetStorageWritable(false);
 const specs=JSON.parse(new TextDecoder().decode(await fetchBytes('tests/fixtures/official-textures.json'))).trials;
 const index=JSON.parse(new TextDecoder().decode(await fetchBytes('newer/textures/index.json'))),names=fixture.aliases.map(alias=>specs[alias].name||alias);
 receipt.fixture=fixture;
 receipt.officialMaterials={};
 for(const alias of fixture.aliases){
  const spec=specs[alias],name=spec.name||alias;check(!!spec,name+': trial specification present');
  const diffuse=await fetchBytes('newer/textures/'+spec.file),height=await fetchBytes('newer/textures/'+spec.height);
  check(await sha(diffuse)===spec.diffuseSha256,name+': candidate file SHA256 matches');check(await sha(height)===spec.heightSha256,name+': height file SHA256 matches');
  const originalBytes=await fetchBytes(spec.original);check(await sha(originalBytes)===spec.originalSha256,name+': original reference file SHA256 matches');
  const bitmap=await createImageBitmap(new Blob([originalBytes],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const native=new THREE.DataTexture(new Uint8Array(ctx.getImageData(0,0,canvas.width,canvas.height).data),canvas.width,canvas.height,THREE.RGBAFormat);const identity=R_GlassTextureKey(native);native.dispose();
  const binding=index.ordinaryVariants?.[name]?.[identity]||{file:index.textures?.[name],normal:index.normals?.[name]};
  check(binding.file===spec.file&&binding.normal?.file===spec.height,name+': current accepted official binding');
  check(!spec.nativeKey||identity===spec.nativeKey,name+': actual original identity matches');
  receipt.officialMaterials[name]={...spec,expectedNativeIdentity:identity};
 }
 receipt.assetRouting='Current accepted official index; original native game PAK routing unchanged';
 // A Bestiary first-sighting may borrow the camera and cover the measured join.
 // Isolate that presentation only in this diagnostic page. Keep the real world,
 // player, material, texture and normal paths; restore the hooks on stop/unload.
 const hooks=await import('../src/engine/common/hooks.js');
 const originalHooks=Object.fromEntries(Object.entries(hooks).filter(([name])=>!['Hooks_Install','Hooks_Installed'].includes(name)));
 const {R_BestiaryCancel}=await import('../src/newer/ui/r_bestiary.js');
 R_BestiaryCancel();hooks.Hooks_Install({...originalHooks,R_BestiaryObserve:()=>{}});
 restorePresentation=()=>{R_BestiaryCancel();hooks.Hooks_Install(originalHooks);};
 receipt.presentationIsolation='Page-local Bestiary observation disabled to preserve the measured camera; no journal reset; restored on stop';
 await import('../main.js');await until(()=>window.Cbuf_AddText&&window.renderer&&window.scene&&window.camera,'native application initialization');
 const {Cbuf_AddText}=await import('../src/engine/common/cmd.js'),{cl,cls}=await import('../src/engine/client/client.js');
 const input=await import('../src/engine/client/cl_input.js'),{sv,svs,MOVETYPE_NOCLIP,FL_NOTARGET}=await import('../src/engine/server/server.js');
 const keys=await import('../src/engine/client/keys.js'),split=await import('../src/newer/render/r_demosplit.js');
 const world=await import('../src/engine/server/world.js'),{Mod_PointInLeaf,SURF_PLANEBACK}=await import('../src/engine/render/gl_model.js');
 const {COM_FindFile}=await import('../src/engine/common/pak.js');
 renderer=window.renderer;originalRender=renderer.render;receipt.shaderErrors=[];
 const previousShaderError=renderer.debug.onShaderError;
 renderer.debug.onShaderError=(gl,p,v,f)=>{receipt.shaderErrors.push(gl.getProgramInfoLog(p)+'\n'+gl.getShaderInfoLog(f));previousShaderError?.(gl,p,v,f);};
 let anchor=null;
 const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
 function clearView(eye,target){
  if(Mod_PointInLeaf(eye,cl.worldmodel).contents!==-1)return false;
  const end=add(target,eye.map((v,i)=>v-target[i]),.015),trace=world.SV_Move(eye,[0,0,0],[0,0,0],end,world.MOVE_NOMONSTERS,sv.edicts[1]);
  return !trace.startsolid&&!trace.allsolid&&trace.fraction>.99;
 }
 function findJoin(){
  const model=cl.worldmodel,byEdge=new Map(),candidates=[];
  for(let face=model.firstmodelsurface;face<model.firstmodelsurface+model.nummodelsurfaces;face++){
   const surface=model.surfaces[face];if(!names.includes(surface.texinfo?.texture?.name))continue;
   for(let j=0;j<surface.numedges;j++){
    const edge=Math.abs(model.surfedges[surface.firstedge+j]);if(!byEdge.has(edge))byEdge.set(edge,[]);byEdge.get(edge).push(face);
   }
  }
  for(const[edge,faces]of byEdge){
   if(faces.length!==2)continue;const[a,b]=faces.map(f=>model.surfaces[f]);if(a.texinfo.texture.name===b.texinfo.texture.name)continue;
   const normal=Array.from(a.plane.normal,v=>v*((a.flags&SURF_PLANEBACK)?-1:1)),other=Array.from(b.plane.normal,v=>v*((b.flags&SURF_PLANEBACK)?-1:1));
   const dot=normal.reduce((n,v,i)=>n+v*other[i],0),kind=dot>=.999?'coplanar':'corner';
   if(kind==='corner'&&(!fixture.allowCornerJoins||dot<=-.999))continue;
   const points=Array.from(model.edges[edge].v,v=>Array.from(model.vertexes[v].position)),center=points[0].map((v,i)=>(v+points[1][i])/2),length=Math.hypot(...points[0].map((v,i)=>v-points[1][i]));
   const tangent=points[1].map((v,i)=>(v-points[0][i])/length);
   if(length<(fixture.minimumJoinLength||24))continue;
   // A corner is viewed along its outward bisector, not either face normal.
   // Also trace to both face interiors: a clear edge alone can hide one side.
   const sum=add(normal,other),sumLength=Math.hypot(...sum),viewDirection=kind==='coplanar'?normal:sum.map(v=>v/sumLength);
   const interiorProbes=[a,b].map(surface=>{
    const centroid=[0,0,0];
    for(let j=0;j<surface.numedges;j++){
     const signed=model.surfedges[surface.firstedge+j],edge=model.edges[Math.abs(signed)],vertex=model.vertexes[edge.v[signed>=0?0:1]].position;
     for(let i=0;i<3;i++)centroid[i]+=vertex[i]/surface.numedges;
    }
    const delta=centroid.map((v,i)=>v-center[i]),along=delta.reduce((n,v,i)=>n+v*tangent[i],0),inside=delta.map((v,i)=>v-along*tangent[i]),distance=Math.hypot(...inside);
    return distance>1e-6?add(center,inside,Math.min(4,distance/2)/distance):null;
   });
   if(interiorProbes.some(p=>p===null))continue;
   const views={near:add(center,viewDirection,48),far:add(center,viewDirection,144),oblique:add(add(center,viewDirection,64),tangent,32)};
   if(!Object.values(views).every(eye=>[center,...interiorProbes].every(target=>clearView(eye,target))))continue;
   candidates.push({kind,faces,points,center,surfaceNormals:[normal,other],viewDirection,interiorProbes,views,length,textures:faces.map(face=>{const s=model.surfaces[face];return {face,name:s.texinfo.texture.name,identity:R_GlassTextureKey(s.texinfo.texture.gl_texture),s:Array.from(s.texinfo.vecs[0]),t:Array.from(s.texinfo.vecs[1])};})});
  }
  candidates.sort((a,b)=>b.length-a.length);
  if(!candidates.length)throw Error(mapPath+' has no verified clear near/far/oblique '+(fixture.allowCornerJoins?'surface':'coplanar')+' candidate join');
  const chosen=candidates[0];chosen.alternatives=candidates.length;return chosen;
 }
 function inspectSurface(face){
  const model=cl.worldmodel,surface=model.surfaces[face];
  check(face>=model.firstmodelsurface&&face<model.firstmodelsurface+model.nummodelsurfaces,'Inspection face belongs to static world geometry');
  check(names.includes(surface?.texinfo?.texture?.name),'Inspection face has a requested source material');
  const points=Array.from({length:surface.numedges},(_,i)=>{const signed=model.surfedges[surface.firstedge+i],edge=model.edges[Math.abs(signed)];return Array.from(model.vertexes[edge.v[signed>=0?0:1]].position);});
  const center=[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length),normal=Array.from(surface.plane.normal,v=>v*((surface.flags&SURF_PLANEBACK)?-1:1));
  const edge=points[1].map((v,i)=>v-points[0][i]),length=Math.hypot(...edge),tangent=edge.map(v=>v/length),interiorProbes=[add(center,tangent,4),add(center,tangent,-4)];
  const views={near:add(center,normal,48),far:add(center,normal,face===45075?96:144)};
  views.oblique=add(add(center,normal,64),tangent,16);
  check(Object.values(views).every(eye=>[center,...interiorProbes].every(target=>clearView(eye,target))),'Static surface near/far/oblique camera and interior rays clear');
  return {kind:'single-surface',faces:[face],points,center,surfaceNormals:[normal],viewDirection:normal,interiorProbes,views,textures:[{face,name:surface.texinfo.texture.name,identity:R_GlassTextureKey(surface.texinfo.texture.gl_texture),s:Array.from(surface.texinfo.vecs[0]),t:Array.from(surface.texinfo.vecs[1])}]};
 }
 function place(view=document.querySelector('#view').value){
  if(disposed||!anchor||cls.demoplayback||cls.signon!==4||!sv.active)throw Error('Live map signon and verified join required');
  const eye=anchor.views[view],delta=anchor.center.map((v,i)=>v-eye[i]),angles=[-Math.atan2(delta[2],Math.hypot(delta[0],delta[1]))*180/Math.PI,Math.atan2(delta[1],delta[0])*180/Math.PI,0],player=sv.edicts[1];
  input.CL_SuspendGameButtons();const command=svs.clients?.[0]?.cmd;if(command)command.forwardmove=command.sidemove=command.upmove=0;
  player.v.movetype=MOVETYPE_NOCLIP;player.v.flags|=FL_NOTARGET;player.v.velocity=[0,0,0];player.v.button0=0;
  player.v.origin=[eye[0],eye[1],eye[2]-player.v.view_ofs[2]];player.v.v_angle=angles;player.v.angles=angles;player.v.fixangle=1;cl.viewangles.set(angles);world.SV_LinkEdict(player,false);keys.set_key_dest(keys.key_game);
  receipt.view=view;receipt.requestedView={eye,target:anchor.center,angles};publish();
 }
 function settings(){
  const hd=document.querySelector('#art').value==='hd';receipt.art=hd?'hd':'original';receipt.relief=document.querySelector('#relief').checked;
  receipt.flashlight=document.querySelector('#flashlight').checked;
  if((Cvar_VariableValue('r_flashlight')!==0)!==receipt.flashlight)R_FlashlightToggle();
  Cvar_SetValue('r_newer_textures',hd?1:0);Cvar_SetValue('r_newer_normals',receipt.relief?1:0);
  if(hd)R_NewerTexturesForModel(cl.worldmodel);else R_NewerTexturesRevert();publish();
 }
 renderer.render=function(scene,camera){
  const target=this.getRenderTarget(),primary=scene===window.scene&&camera===window.camera;
  const result=originalRender.call(this,scene,camera);
  if(primary){
   receipt.sceneFrames++;
   if(performance.now()-lastPublish>500||receiptRequested){
    lastPublish=performance.now();receipt.actualEye=Array.from(camera.matrixWorld.elements).slice(12,15);receipt.actualForward=Array.from(camera.matrixWorld.elements).slice(8,11).map(v=>-v);receipt.lightingSettings=Object.fromEntries(['r_newer_lighting','r_newbright','r_newcontrast','r_newdark','r_newedges','r_flashlight'].map(name=>[name,Cvar_VariableValue(name)]));receipt.framebuffer={scene:target?[target.width,target.height]:[this.domElement.width,this.domElement.height],display:[this.domElement.width,this.domElement.height]};
    const textures=new Map((cl.worldmodel?.textures||[]).filter(t=>names.includes(t?.name)).map(t=>[t.gl_texture,t.name])),seen=new Set(),rows=[];
    scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){
     if(!material||seen.has(material))continue;seen.add(material);const texture=material.userData?.detailDiffuse||material.map,name=textures.get(texture);if(!name)continue;
     rows.push({name,upgraded:texture.userData.newerPicture===true,dimensions:[texture.image?.width,texture.image?.height],drawDimensions:[material.map?.image?.width,material.map?.image?.height],normal:material.normalMap?.uuid||null,normalDimensions:material.normalMap?[material.normalMap.image?.width,material.normalMap.image?.height]:null,material:material.type,repeat:[texture.repeat.x,texture.repeat.y],offset:[texture.offset.x,texture.offset.y]});
    }});receipt.materials=rows;receipt.signon=cls.signon;receipt.serverTime=sv.time;receipt.hdr=Cvar_VariableValue('r_hdr');receipt.flashlightBeamOn=R_FlashlightBeam().on;publish();
    if(receiptRequested){receiptRequested=false;saveReceipt();}
   }
  }
  const presentation=target===null&&(primary||scene.children.some(o=>o.material?.uniforms?.tComposite||o.material?.uniforms?.uOffscreen));
  if(frameRequested&&presentation){frameRequested=false;download(this.domElement.toDataURL('image/png'),`official-texture-${receipt.art}-${receipt.view}-${Date.now()}.png`);}
  return result;
 };
 async function start(){
  const token=++epoch;receipt.state='waiting for actual '+fixture.map;anchor=null;publish();split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
  Cbuf_AddText('maxplayers 1\nr_hdr 1\nr_dynres 0\nbgmvolume 0\nmap '+fixture.map+'\n');
  await until(()=>token!==epoch||(!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name===mapPath&&cl.stats[0]>0),fixture.map+' signon');if(disposed||token!==epoch)return;
  split.R_DemoSplitRelease(true);for(const[name,value]of Object.entries({r_hdr:1,r_dynres:0,viewsize:120,crosshair:0,r_drawviewmodel:0}))Cvar_SetValue(name,value);
  const native=COM_FindFile(mapPath);receipt.map={name:cl.worldmodel.name,sha256:await sha(native.data),faces:cl.worldmodel.surfaces.length};
  if(fixture.map==='e2m1')receipt.independentSourceProbe={map:'maps/e2m1.bsp',sha256:'de2f7b284ee64b24cdfe545ea4b09abdf9cce657f7ba6b1aab7ef06fecf2c26a',faces:5976,tech08_3Faces:275,tech08_4Faces:7,joinFaces:[4819,4821],joinEdge:[[856,-320,256],[856,-96,256]],qualification:'Native model/hull probe; the live fixture still discovers and checks actual runtime geometry.'};
  for(const name of names){const t=cl.worldmodel.textures.find(t=>t?.name===name);check(!!t,name+': present in '+mapPath);check(R_GlassTextureKey(t.gl_texture)===receipt.officialMaterials[name].expectedNativeIdentity,name+': actual native identity matches candidate authority');}
  const inspection=fixture.inspectionFaces?.[new URL(location.href).searchParams.get('inspect')==='floor'?'floor':'panel'];
  anchor=inspection!==undefined?inspectSurface(inspection):findJoin();receipt.join=anchor;
  if(inspection!==undefined){document.querySelector('strong').textContent='Actual '+fixture.map.toUpperCase()+': photographic surface';receipt.qualification='Actual static-world single-surface trial; no cross-material join claim.';}
  receipt.state='ready';settings();place();
 }
 const safe=fn=>()=>{try{fn();}catch(error){fail(error);}};
 document.querySelector('#restart').onclick=()=>start().catch(fail);document.querySelector('#view').onchange=safe(()=>place());document.querySelector('#place').onclick=safe(()=>place());
 document.querySelector('#art').onchange=safe(settings);document.querySelector('#relief').onchange=safe(settings);
 document.querySelector('#flashlight').onchange=safe(settings);
 document.querySelector('#hide').onclick=()=>{panel.hidden=true;};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.hidden){panel.hidden=false;event.preventDefault();event.stopImmediatePropagation();}},true);
 document.querySelector('#receipt-save').onclick=()=>{receiptRequested=true;};document.querySelector('#frame-save').onclick=()=>{frameRequested=true;};
 window.officialTextureGameplayTrial={receipt,start,place,settings,stop};await start();
}catch(error){fail(error);}
