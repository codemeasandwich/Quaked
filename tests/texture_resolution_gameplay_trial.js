// Real native map/player/brush materials. The only filter override is a
// fixture-local uniform wrapper; Classic and production source remain intact.
const panel=document.querySelector('section'), statusNode=document.querySelector('#status'), receiptNode=document.querySelector('#receipt');
for(const type of['click','mousedown','mouseup','keydown','keyup','pointerdown','pointerup','touchstart','touchend'])panel.addEventListener(type,event=>event.stopPropagation());
const receipt={state:'starting',filter:'production',classic:false,subject:'wall',view:'near',sceneFrames:0,materials:[],errors:[]};
window.addEventListener('error',event=>{receipt.errors.push(event.message);publish();});
window.addEventListener('unhandledrejection',event=>{receipt.errors.push(String(event.reason?.stack||event.reason));publish();});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(test,label,milliseconds=180000){const deadline=performance.now()+milliseconds;while(!test()){if(performance.now()>deadline)throw Error(label+' exceeded bounded setup deadline');await sleep(100);}}
function publish(){statusNode.textContent=`${receipt.state} · ${receipt.subject}/${receipt.view} · ${receipt.classic?'Classic':receipt.filter==='old'?'previous 4 texels':'production default 2 texels'} · ${receipt.sceneFrames} native frames${receipt.errors.length?' · '+receipt.errors.at(-1):''}`;receiptNode.textContent=JSON.stringify(receipt,null,2);}
await import('../main.js');
await until(()=>window.Cbuf_AddText&&window.renderer&&window.scene&&window.camera,'native app initialization');
const {Cbuf_AddText}=await import('../src/engine/common/cmd.js');
const {cl,cls,cl_entities}=await import('../src/engine/client/client.js');
const input=await import('../src/engine/client/cl_input.js');
const {sv,svs,MOVETYPE_NOCLIP,FL_NOTARGET}=await import('../src/engine/server/server.js');
const {PR_GetString}=await import('../src/engine/progs/progs.js');
const {Cvar_SetValue,Cvar_VariableValue}=await import('../src/engine/common/cvar.js');
const keys=await import('../src/engine/client/keys.js'),split=await import('../src/r_demosplit.js');
const post=await import('../src/gl_post.js'),world=await import('../src/engine/server/world.js');
const {Mod_PointInLeaf,SURF_PLANEBACK}=await import('../src/engine/render/gl_model.js');
const {COM_NewerJSON}=await import('../src/engine/common/pak.js');
const renderer=window.renderer,originalRender=renderer.render,wrappers=new Map(),names=new Map(),anchors=new Map();
let manifest=null,lastPublish=0,epoch=0,disposed=false;
let downloadRequested=false,frameRequested=false;
function downloadName(extension){return `texture-resolution-${receipt.subject}-${receipt.view}-${receipt.classic?'classic':receipt.filter}-${Date.now()}.${extension}`;}
function downloadLink(url,name){const link=document.createElement('a');link.href=url;link.download=name;link.textContent='Save '+name;link.style.display='block';panel.append(link);}
function downloadReceipt(){
 const payload={schema:1,capturedAt:new Date().toISOString(),fixture:location.href,...receipt};
 const blob=new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob);
 downloadLink(url,downloadName('json'));
}
COM_NewerJSON('newer/textures/index.json','newer/textures/index.json').then(value=>{manifest=value;}).catch(error=>receipt.errors.push(String(error)));

function registerModels(){
 names.clear();for(const model of new Set([cl.worldmodel,...(sv.models||[])]))for(const texture of model?.textures||[]){
  if(texture?.gl_texture)names.set(texture.gl_texture,{name:texture.name,model:model.name,native:[texture.width,texture.height]});
 }
}
function wrap(material){
 if(!material||wrappers.has(material)||!material.userData?.detailDiffuse)return;
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey;
 const record={compile,key,shader:null};wrappers.set(material,record);
 material.onBeforeCompile=function(shader,...args){
  compile.call(this,shader,...args);const production=shader.uniforms.uPigmentMinFootprint;
  if(production)shader.uniforms.uPigmentMinFootprint={get value(){const value=production.value;return receipt.filter==='old'&&!receipt.classic&&value>0?4:value;}};
  record.shader=shader;
 };
 material.customProgramCacheKey=function(){return key.call(this)+'-texture-resolution-trial';};material.needsUpdate=true;
}
renderer.render=function(scene,camera){
 const primary=scene===window.scene&&camera===window.camera,target=this.getRenderTarget();
 if(primary){
  scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material])wrap(material);});
  receipt.sceneFrames++;receipt.framebuffer={scene:target?[target.width,target.height]:[this.domElement.width,this.domElement.height],display:[this.domElement.width,this.domElement.height],css:[this.domElement.clientWidth,this.domElement.clientHeight],dpr:window.devicePixelRatio,dynamicScale:post.R_DynResScale(),dynamicEnabled:Cvar_VariableValue('r_dynres')};
  receipt.actualEye=Array.from(camera.matrixWorld.elements).slice(12,15);
  receipt.actualForward=[-camera.matrixWorld.elements[8],-camera.matrixWorld.elements[9],-camera.matrixWorld.elements[10]];receipt.clientAngles=Array.from(cl.viewangles);
 }
 const result=originalRender.call(this,scene,camera);
 if(primary&&(downloadRequested||frameRequested||performance.now()-lastPublish>500)){
  lastPublish=performance.now();registerModels();const seen=new Set(),rows=[];
  scene.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){
   if(!material||seen.has(material))continue;seen.add(material);
   const texture=material.userData?.detailDiffuse,info=names.get(texture);if(!info||!(info.name==='tech01_1'||/^(shot[01](sid|top)|rockettop)$/.test(info.name)))continue;
   const source=manifest?.textures?.[info.name],actual=material.map,record=wrappers.get(material);
   rows.push({...info,source:source?'newer/textures/'+source:null,upgraded:texture.userData.newerPicture===true,decoded:[texture.image?.width,texture.image?.height],drawMap:[actual?.image?.width,actual?.image?.height],material:material.uuid,texture:actual?.uuid,normal:material.normalMap?.uuid||null,anisotropy:actual?.anisotropy,minFilter:actual?.minFilter,magFilter:actual?.magFilter,mipmaps:actual?.generateMipmaps,uniform:record?.shader?.uniforms.uPigmentMinFootprint?.value??null});
  }});receipt.materials=rows;receipt.signon=cls.signon;receipt.serverTime=sv.time;
  const player=sv.edicts?.[1],anchor=anchors.get('shell'),pickup=anchor&&sv.edicts?.[anchor.entity],clientPickup=anchor&&cl_entities[anchor.entity];
  receipt.pickup={availableShells:(sv.edicts||[]).filter(e=>e&&!e.free&&PR_GetString(e.v.classname)==='item_shells'&&e.v.solid===1).length,index:anchor?.entity??null,free:pickup?.free??null,solid:pickup?.v.solid??null,serverModel:pickup?PR_GetString(pickup.v.model):null,clientModel:clientPickup?.model?.name??null,clientMessageTime:clientPickup?.msgtime??null,latestMessageTime:cl.mtime[0],brushInScene:clientPickup?._brushGroup?.parent===window.scene,origin:pickup?Array.from(pickup.v.origin):null,touchMin:pickup?Array.from(pickup.v.absmin):null,touchMax:pickup?Array.from(pickup.v.absmax):null};
  const held=Object.fromEntries(['forward','back','moveleft','moveright','left','right','lookup','lookdown','up','down','attack'].map(name=>[name,input['in_'+name]?.state||0]));
  const command=svsCommand(),drift=receipt.requestedView&&receipt.actualEye?Math.hypot(...receipt.actualEye.map((v,i)=>v-receipt.requestedView.eye[i])):null;
  receipt.input={held,command,velocity:player?Array.from(player.v.velocity):null,eyeDrift:drift,clean:Object.values(held).every(value=>(value&1)===0)&&Object.values(command).every(value=>!value)&&(drift===null||drift<1)};publish();
  if(downloadRequested){downloadRequested=false;downloadReceipt();}
 }
 // Snapshot synchronously while the actual display framebuffer is valid;
 // preserveDrawingBuffer need not be changed. HUD is a separate canvas.
 const presentation=target===null&&(primary||scene.children.some(object=>object.material?.uniforms?.tComposite||object.material?.uniforms?.uOffscreen));
 if(frameRequested&&presentation){
  frameRequested=false;
  try{const png=this.domElement.toDataURL('image/png');receipt.lastFrameCapture={at:new Date().toISOString(),sceneFrame:receipt.sceneFrames,width:this.domElement.width,height:this.domElement.height,inputClean:receipt.input?.clean??null};downloadLink(png,downloadName('png'));publish();}
  catch(error){receipt.errors.push('Frame capture: '+String(error));publish();}
 }
 return result;
};

function svsCommand(){const command=svs.clients?.[0]?.cmd||{};return {forward:command.forwardmove||0,side:command.sidemove||0,up:command.upmove||0};}

const add=(a,b,k=1)=>a.map((v,i)=>v+b[i]*k);
function pointClear(eye,target){
 if(Mod_PointInLeaf(eye,cl.worldmodel).contents!==-1)return false;
 const trace=world.SV_Move(eye,[0,0,0],[0,0,0],add(target,eye.map((v,i)=>v-target[i]),.015),world.MOVE_NOMONSTERS,sv.edicts[1]);
 return !trace.startsolid&&!trace.allsolid&&trace.fraction>.99;
}
function positions(center,normal,subject,side=1){
 const length=Math.hypot(normal[0],normal[1]);
 const tangent=length>1e-6?[-normal[1]/length,normal[0]/length,0]:[1,0,0],near=subject==='wall'?32:64,far=subject==='wall'?96:160;
 return {near:add(center,normal,near),oblique:add(add(center,normal,near),tangent,near*side),far:add(center,normal,far)};
}
function findAnchor(subject){
 if(anchors.has(subject)){const anchor=anchors.get(subject),entity=sv.edicts[anchor.entity];if(subject!=='shell'||entity&&!entity.free&&entity.v.solid===1&&PR_GetString(entity.v.model)===anchor.source)return anchor;anchors.delete(subject);}
 const candidates=[];
 if(subject==='wall'){
  for(const surface of cl.worldmodel.surfaces){if(surface.texinfo?.texture?.name!=='tech01_1')continue;
   const normal=Array.from(surface.plane.normal,v=>v*((surface.flags&SURF_PLANEBACK)?-1:1));
   for(let p=surface.polys;p;p=p.next){const center=[0,0,0];for(let i=0;i<p.numverts;i++)for(let k=0;k<3;k++)center[k]+=(p.verts instanceof Float32Array?p.verts[i*7+k]:p.verts[i][k])/p.numverts;candidates.push({center,normal,source:'maps/e1m1.bsp:tech01_1'});}
  }
 }else{
  for(const entity of sv.edicts){if(!entity||entity.free||PR_GetString(entity.v.classname)!=='item_shells'||entity.v.solid!==1)continue;const model=sv.models[entity.v.modelindex];if(!/^maps\/b_shell[01]\.bsp$/.test(model?.name||''))continue;
   const center=Array.from(entity.v.origin,(v,i)=>v+(model.mins[i]+model.maxs[i])/2);
   for(const normal of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]])candidates.push({center,normal,source:model.name,entity:entity.index});
  }
 }
 candidates.sort((a,b)=>Math.hypot(...a.center.map((v,i)=>v-sv.edicts[1].v.origin[i]))-Math.hypot(...b.center.map((v,i)=>v-sv.edicts[1].v.origin[i])));
 for(const candidate of candidates)for(const side of[1,-1]){const views=positions(candidate.center,candidate.normal,subject,side);if(Object.values(views).every(eye=>pointClear(eye,candidate.center)&&(subject!=='shell'||outsidePickup(eye,sv.edicts[candidate.entity])))){const anchor={...candidate,views};anchors.set(subject,anchor);return anchor;}}
 throw Error('No verified clear near/oblique/far '+subject+' anchor in actual E1M1');
}
function outsidePickup(eye,item){
 const player=sv.edicts[1],origin=[eye[0],eye[1],eye[2]-player.v.view_ofs[2]];
 // Native FL_ITEM touch bounds already include the 15-unit XY expansion.
 // Keep the full player hull plus its link epsilon and four-unit margin clear.
 return origin.some((value,i)=>value+player.v.maxs[i]+5<item.v.absmin[i]||value+player.v.mins[i]-5>item.v.absmax[i]);
}
function place(subject=document.querySelector('#subject').value,view=document.querySelector('#view').value){
 if(cls.demoplayback||cls.signon!==4||!sv.active)throw Error('Native live signon is required');
 const anchor=findAnchor(subject),eye=anchor.views[view],delta=anchor.center.map((v,i)=>v-eye[i]),angles=[-Math.atan2(delta[2],Math.hypot(delta[0],delta[1]))*180/Math.PI,Math.atan2(delta[1],delta[0])*180/Math.PI,0],player=sv.edicts[1];
 input.CL_SuspendGameButtons();const command=svs.clients?.[0]?.cmd;if(command){command.forwardmove=command.sidemove=command.upmove=0;}
 player.v.movetype=MOVETYPE_NOCLIP;player.v.flags|=FL_NOTARGET;player.v.velocity=[0,0,0];player.v.button0=0;
 player.v.origin=[eye[0],eye[1],eye[2]-player.v.view_ofs[2]];player.v.v_angle=angles;player.v.angles=angles;player.v.fixangle=1;cl.viewangles.set(angles);world.SV_LinkEdict(player,false);keys.set_key_dest(keys.key_game);
 receipt.subject=subject;receipt.view=view;receipt.requestedView={source:anchor.source,entity:anchor.entity??null,target:anchor.center,eye,angles};publish();
}
function filter(value){receipt.filter=value==='old'?'old':'production';publish();}
function classic(value){receipt.classic=!!value;Cvar_SetValue('r_hdr',value?0:1);document.querySelector('#classic').textContent='Classic: '+(value?'on':'off');publish();}
function safe(action){return ()=>{try{action();}catch(error){receipt.errors.push(String(error));publish();}};}
async function start(){
 const token=++epoch;anchors.clear();receipt.state='waiting for native E1M1';publish();split.R_DemoSplitRelease(true);keys.set_key_dest(keys.key_game);
 Cbuf_AddText('maxplayers 1\nr_hdr 1\nr_dynres 0\nbgmvolume 0\nmap e1m1\n');
 await until(()=>token!==epoch||(!cls.demoplayback&&cls.signon===4&&sv.active&&cl.worldmodel?.name==='maps/e1m1.bsp'&&cl.stats[0]>0),'E1M1 signon');if(token!==epoch||disposed)return;
 split.R_DemoSplitRelease(true);classic(false);for(const[name,value]of Object.entries({r_dynres:0,viewsize:120,crosshair:0,r_drawviewmodel:0}))Cvar_SetValue(name,value);
 await until(()=>sv.edicts.some(e=>e&&!e.free&&PR_GetString(e.v.classname)==='item_shells'&&e.v.solid===1),'native shell pickup initialization');
 registerModels();receipt.state='ready';place();
}
document.querySelector('#start').onclick=()=>start().catch(error=>{receipt.errors.push(String(error));receipt.state='setup failed';publish();});
document.querySelector('#subject').onchange=safe(()=>place());document.querySelector('#view').onchange=safe(()=>place());
document.querySelector('#current').onclick=()=>filter('production');document.querySelector('#old').onclick=()=>filter('old');
document.querySelector('#classic').onclick=()=>classic(!receipt.classic);
document.querySelector('#dynres').onclick=()=>{const on=!Cvar_VariableValue('r_dynres');Cvar_SetValue('r_dynres',on?1:0);document.querySelector('#dynres').textContent='Dynamic resolution: '+(on?'on':'off');};
document.querySelector('#hide').onclick=()=>{panel.hidden=true;};
document.querySelector('#download-receipt').onclick=()=>{downloadRequested=true;statusNode.textContent='Capturing receipt on the next actual native scene render…';};
document.querySelector('#download-frame').onclick=()=>{frameRequested=true;statusNode.textContent='Capturing PNG on the next completed display render…';};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.hidden){panel.hidden=false;event.preventDefault();event.stopImmediatePropagation();}},true);
function dispose(){disposed=true;epoch++;renderer.render=originalRender;for(const[material,record]of wrappers){material.onBeforeCompile=record.compile;material.customProgramCacheKey=record.key;material.needsUpdate=true;}wrappers.clear();}
window.addEventListener('pagehide',dispose,{once:true});window.textureResolutionTrial={start,place,filter,classic,receipt,dispose};
start().catch(error=>{receipt.errors.push(String(error));receipt.state='setup failed';publish();});
