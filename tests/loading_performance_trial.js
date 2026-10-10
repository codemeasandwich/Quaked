// Measurement only: one real main.js instance and its ordinary startup/menu
// paths. Observers forward original calls; no asset, feature, readiness or UI
// completion override is used. One90-second sequence, then animation stops.
const began = performance.now();
const nativeRAF = window.requestAnimationFrame.bind(window);
const nativeSetTimeout = window.setTimeout.bind(window);
const nativeClearTimeout = window.clearTimeout.bind(window);
const expectedFeatures = ['r_newer_lighting','r_newer_normals','r_newer_shadows','r_pointshadows','r_heightshadows','r_rockfield','r_powerups','r_newer_weapons','r_newer_textures','r_newer_water','r_newer_enemies','r_newer_portals','r_newer_hud','r_decals','r_lerpmodels','r_newer_variety'];
const report = {
 version:2, qualificationContract:'registered controls; first visible demo; next live server frame for hub; pointer permission reported separately', timeOrigin:performance.timeOrigin, startedAt:new Date(performance.timeOrigin).toISOString(), instrumentationStartedMs:began,
 requestedSequence:['first-attract-demo','first-Newer-START','warm-Newer-START'], targetMs:2000, deadlineMs:90000,
 conditions:{label:new URLSearchParams(location.search).get('label')||'unclassified cache state',navigationType:performance.getEntriesByType('navigation')[0]?.type||null,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency||null,deviceMemoryGiB:navigator.deviceMemory||null,visibilityAtStart:document.visibilityState,devicePixelRatio:devicePixelRatio,cssViewport:[innerWidth,innerHeight],gpuCache:'not controlled or claimed cold',assetCache:'classify from resource records; zero transfer alone is not proof of cold/warm GPU'},
 cases:[], resources:[], longTasks:[], errors:[], inputPermissionRequests:[], inputPermissionRejections:[], pointerLockChanges:[], visibilityChanges:[], measurements:{rendererAttachedMs:null,observationMs:0,compileCalls:[],textureUploads:{calls:0,unique:0,syncMs:0},renderGroups:{},worldDraws:0}, finished:false
};
let modules=null, active=null, finished=false, observer=null, taskObserver=null, timeout=null, nextCaseTimer=null, rendererHooked=null;
let worldDrawSerial=0, latestWorldDraw=null, latestEnhancedWorldDraw=null, sampling=false, lastDisplayed=0, compileSerial=0;
const textureIds=new Set(), restorers=[], pointerLockPromises=new WeakMap();
const panel=document.querySelector('#performance-panel'), status=document.querySelector('#performance-status'), output=document.querySelector('#performance-report');
for(const type of ['mousedown','mouseup','keydown','keyup','pointerdown','pointerup','touchstart','touchend'])panel.addEventListener(type,event=>event.stopPropagation());
const relativeURL=value=>{try{const u=new URL(value,location.href);return u.protocol==='blob:'?'blob:…':u.origin===location.origin?u.pathname+u.search:u.origin+u.pathname;}catch{return String(value).slice(0,160);}};
const message=value=>{try{const encoded=value instanceof Error?value.stack||value.message:typeof value==='string'?value:JSON.stringify(value);return typeof encoded==='string'?encoded:String(value);}catch{return String(value);}};
const noteError=(type,value,detail={})=>{if(report.errors.length<80)report.errors.push({atMs:performance.now(),type,classification:'runtime',message:message(value).slice(0,2400),...detail});};
window.addEventListener('error',event=>noteError('window-error',event.message));
// Observe the actual returned promise through its unhandled-rejection event.
// Do not attach catch/then or preventDefault: the application sees the exact
// original promise and the browser keeps its normal rejection behavior.
window.addEventListener('unhandledrejection',event=>{
 const request=pointerLockPromises.get(event.promise);
 if(request){const rejection={requestId:request.id,requestMs:request.atMs,rejectedMs:performance.now(),case:request.case,errorName:event.reason?.name||null,message:message(event.reason).slice(0,2400),identityProof:'event.promise is the original requestPointerLock return value'};report.inputPermissionRejections.push(rejection);request.rejected=true;noteError('unhandled-rejection',event.reason,{classification:'input-permission',requestId:request.id});}
 else noteError('unhandled-rejection',event.reason);
});
const pointerPrototype=globalThis.Element?.prototype, originalPointerLock=pointerPrototype?.requestPointerLock;
if(typeof originalPointerLock==='function'){
 pointerPrototype.requestPointerLock=function(...args){const request={id:report.inputPermissionRequests.length+1,atMs:performance.now(),case:active?.kind||null,element:this.tagName,userActivation:navigator.userActivation?.isActive??null};report.inputPermissionRequests.push(request);let result;try{result=originalPointerLock.apply(this,args);}catch(error){request.synchronousThrow=message(error);throw error;}request.returnedPromise=!!result&&typeof result.then==='function';if(request.returnedPromise)pointerLockPromises.set(result,request);return result;};
 restorers.push(()=>{pointerPrototype.requestPointerLock=originalPointerLock;});
}
document.addEventListener('pointerlockchange',()=>report.pointerLockChanges.push({atMs:performance.now(),locked:!!document.pointerLockElement}));
const savedConsoleError=console.error;
console.error=function(...args){noteError('console-error',args.map(message).join(' '));return savedConsoleError.apply(this,args);};
restorers.push(()=>{console.error=savedConsoleError;});
function resource(entry){return {name:relativeURL(entry.name),initiatorType:entry.initiatorType,startTime:entry.startTime,duration:entry.duration,fetchStart:entry.fetchStart,responseStart:entry.responseStart,responseEnd:entry.responseEnd,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,decodedBodySize:entry.decodedBodySize,deliveryType:entry.deliveryType||null,nextHopProtocol:entry.nextHopProtocol||null,responseStatus:entry.responseStatus??null};}
try{performance.setResourceTimingBufferSize(6000);observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(report.resources.length<6000)report.resources.push(resource(entry));});observer.observe({type:'resource',buffered:true});}catch(error){report.conditions.resourceTiming=message(error);}
try{taskObserver=new PerformanceObserver(list=>{for(const entry of list.getEntries())if(report.longTasks.length<1000)report.longTasks.push({startTime:entry.startTime,duration:entry.duration,name:entry.name});});taskObserver.observe({type:'longtask',buffered:true});}catch{report.conditions.longTasks='unavailable';}
function display(force=false){const now=performance.now();if(!force&&now-lastDisplayed<350)return;lastDisplayed=now;const live={elapsedMs:now,case:active?.kind||null,completed:report.cases.filter(c=>c.completed).length,phase:active?.record.latest?.loading.phase,pending:active?.record.latest?.loading.pending,timings:active?.record.timings,worldDraws:report.measurements.worldDraws,observationMs:report.measurements.observationMs,resourceCount:report.resources.length,errors:report.errors.length,inputPermissionRejections:report.inputPermissionRejections.length};document.getElementById('performance-live').textContent=JSON.stringify(live,null,2);if(force)output.textContent=JSON.stringify(report,null,2);}
const registeredControl=name=>{const found=modules.vars.Cvar_FindVar(name);return found?found.value:null;};
function beginCase(kind){
 const start=kind==='first-attract-demo'?0:performance.now();
 const record={kind,requestMs:start,timings:{},events:[],completed:false,resourcesAtStart:report.resources.length,renderGroups:{},worldDraws:0,enhancedWorldDraws:0,maxFrameCallbackMs:0,frameCallbacks:0,compileStartIndex:report.measurements.compileCalls.length,errorsAtStart:report.errors.length};
 report.cases.push(record);active={record,kind,start,previousPlayer:modules?.server.sv.edicts?.[1],previousWorld:modules?.client.cl.worldmodel,lastSignature:'',firstWorldSerial:worldDrawSerial,lastObservedWorldSerial:worldDrawSerial,lastEventMs:-Infinity,lastPhaseSignature:'',startedCallbacks:0};
 status.textContent='Measuring '+kind+'…';lastDisplayed=-Infinity;display();
}
function stamp(key,now=performance.now()){if(active&&active.record.timings[key]===undefined)active.record.timings[key]=now-active.start;}
function attachRenderer(){
 const renderer=modules?.vid.renderer;if(!renderer||rendererHooked===renderer)return;
 rendererHooked=renderer;report.measurements.rendererAttachedMs=performance.now();
 const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 report.conditions.gpu={vendor:gl.getParameter(ext?.UNMASKED_VENDOR_WEBGL||gl.VENDOR),renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxFragmentTextureUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),attributes:gl.getContextAttributes()};
 report.conditions.rendererAtAttach={programs:renderer.info.programs?.length||0,frame:renderer.info.render.frame,pixelRatio:renderer.getPixelRatio(),drawingBuffer:[renderer.domElement.width,renderer.domElement.height]};
 for(const method of ['compile','compileAsync']){
  if(typeof renderer[method]!=='function')continue;const original=renderer[method];
  renderer[method]=function(...args){const at=performance.now(),entry={id:++compileSerial,method,startMs:at,case:active?.kind||null,programsBefore:this.info.programs?.length||0};report.measurements.compileCalls.push(entry);let result;try{result=original.apply(this,args);entry.syncCallMs=performance.now()-at;}catch(error){entry.error=message(error);entry.endMs=performance.now();throw error;}const done=error=>{entry.endMs=performance.now();entry.wallMs=entry.endMs-at;entry.programsAfter=this.info.programs?.length||0;if(error)entry.error=message(error);};if(result?.then)result.then(()=>done(null),error=>done(error));else done(null);return result;};restorers.push(()=>{renderer[method]=original;});
 }
 if(typeof renderer.initTexture==='function'){const original=renderer.initTexture;renderer.initTexture=function(texture){const at=performance.now();try{return original.call(this,texture);}finally{const total=report.measurements.textureUploads;total.calls++;total.syncMs+=performance.now()-at;textureIds.add(texture.uuid||texture);total.unique=textureIds.size;}};restorers.push(()=>{renderer.initTexture=original;});}
 const originalRender=renderer.render;
 renderer.render=function(scene,camera){const at=performance.now(),target=this.getRenderTarget(),world=scene===modules.main.scene&&camera===modules.main.camera,enhancedWorld=world&&modules.post.R_PostActive(),name=target?.texture?.name||(target?'target '+target.width+'x'+target.height+' MRT'+(target.textures?.length||1):'default framebuffer'),key=(world?(enhancedWorld?'world enhanced: ':'world classic: '):'auxiliary: ')+name;let result;try{result=originalRender.call(this,scene,camera);return result;}finally{const duration=performance.now()-at,triangles=this.info.render.triangles||0,calls=this.info.render.calls||0;for(const groups of [report.measurements.renderGroups,active?.record.renderGroups].filter(Boolean)){const g=groups[key]||(groups[key]={calls:0,syncMs:0,maxSyncMs:0,triangles:0});g.calls++;g.syncMs+=duration;g.maxSyncMs=Math.max(g.maxSyncMs,duration);g.triangles+=triangles;}if(world){worldDrawSerial++;report.measurements.worldDraws++;if(active){active.record.worldDraws++;if(enhancedWorld)active.record.enhancedWorldDraws++;}latestWorldDraw={serial:worldDrawSerial,atMs:performance.now(),world:modules.client.cl.worldmodel?.name||null,triangles,calls,target:name,enhanced:enhancedWorld};if(enhancedWorld)latestEnhancedWorldDraw=latestWorldDraw;}}};restorers.push(()=>{renderer.render=originalRender;});
}
function snapshot(){
 const {cl,cls}=modules.client,model=cl.worldmodel,models=cl.model_precache.filter(Boolean),camera=modules.main.camera,renderer=modules.vid.renderer;
 const skins=modules.skins.R_NewerSkinsStatus(models),surfaceNormals=modules.textures.R_NewerNormalsStatus(model);
 return {world:model?.name||null,serverMap:modules.server.sv.name||null,signon:cls.signon,demo:cls.demoplayback,clTime:cl.time,svTime:modules.server.sv.time,loading:modules.loading.R_DemoLoadingStatus(),consoleHeight:modules.screen.scr_con_current,
  features:Object.fromEntries(expectedFeatures.map(name=>[name,modules.vars.Cvar_VariableValue(name)])),hdr:modules.vars.Cvar_VariableValue('r_hdr'),criticalControls:Object.fromEntries(['r_drawworld','r_drawentities','r_drawviewmodel','r_norefresh','r_fullbright','host_timescale','host_framerate','r_dynres','r_fps_target','r_demosplit'].map(name=>[name,registeredControl(name)])),input:{keyDestination:modules.keys.key_dest,keyGame:modules.keys.key_game,serverPaused:modules.server.sv.paused,clientPaused:cl.paused,bestiaryLocked:modules.bestiary.R_BestiaryInputLocked(),pointerLocked:!!document.pointerLockElement},
  textures:modules.textures.R_NewerTexturesStatus(model),skins,surfaceNormals,actorNormals:skins.normals||null,weapons:modules.weapons.R_WeaponStatus(),hud:modules.hud.R_NewerHudStatus(),rock:modules.rock.R_RockfieldStatus(),sculpted:modules.surfaces.R_DemonReliefStatus(),shadows:modules.post.R_PointShadowStatus(),water:camera?modules.post.R_WaterStartupStatus(camera):null,postActive:modules.post.R_PostActive(),dynresScale:modules.post.R_DynResScale(),drawingBuffer:renderer?[renderer.domElement.width,renderer.domElement.height]:null,programs:renderer?.info.programs?.length||0};
}
function loadingDOMGone(){const element=document.getElementById('loading');return !element||!element.isConnected||getComputedStyle(element).display==='none';}
function visiblePixels(){
 const renderer=modules.vid.renderer,gl=renderer.getContext(),canvas=renderer.domElement,overlay=modules.draw.Draw_GetOverlayCanvas();
 if(renderer.getRenderTarget()!==null)return {valid:false,reason:'renderer still targets an offscreen pass'};
 const x=Math.max(0,Math.floor(canvas.width/2)-16),y=Math.max(0,Math.floor(canvas.height/2)-16),w=Math.min(32,canvas.width-x),h=Math.min(32,canvas.height-y),pixels=new Uint8Array(w*h*4),at=performance.now();gl.readPixels(x,y,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const glError=gl.getError();let colored=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>6)colored++;
 let transparentOverlaySamples=0,sampleCount=0;if(overlay){const ctx=overlay.getContext('2d');for(const fy of [.2,.35,.5,.65,.75])for(const fx of [.2,.35,.5,.65,.8]){sampleCount++;if(ctx.getImageData(Math.floor(overlay.width*fx),Math.floor(overlay.height*fy),1,1).data[3]<240)transparentOverlaySamples++;}}
 return {valid:glError===gl.NO_ERROR&&colored>16&&transparentOverlaySamples>=5,glError,nonblackWorldPixels:colored,worldPixelSamples:w*h,transparentOverlaySamples,overlaySamples:sampleCount,readbackMs:performance.now()-at};
}
function takePicture(kind){try{const renderer=modules.vid.renderer,overlay=modules.draw.Draw_GetOverlayCanvas(),canvas=document.createElement('canvas');canvas.width=480;canvas.height=Math.max(1,Math.round(480*renderer.domElement.height/renderer.domElement.width));const ctx=canvas.getContext('2d');ctx.drawImage(renderer.domElement,0,0,canvas.width,canvas.height);if(overlay)ctx.drawImage(overlay,0,0,canvas.width,canvas.height);const image=document.createElement('img');image.src=canvas.toDataURL('image/jpeg',.7);image.alt=kind+' completed frame';const label=document.createElement('figcaption');label.textContent=kind;const figure=document.createElement('figure');figure.append(image,label);document.getElementById('performance-frames').append(figure);}catch(error){noteError('frame-capture',error);}}
function sample(afterCallbackMs=0){
 if(finished||!modules||!active||sampling)return;sampling=true;const observedAt=performance.now();
 try{
  attachRenderer();const now=performance.now(),s=snapshot(),a=active,r=a.record;r.frameCallbacks++;r.maxFrameCallbackMs=Math.max(r.maxFrameCallbackMs,afterCallbackMs);r.latest=s;
  const properWorld=a.kind==='first-attract-demo'?!!s.world&&s.demo&&s.loading.mode==='demo':!s.demo&&s.world==='maps/start.bsp'&&s.serverMap==='start'&&modules.server.sv.edicts?.[1]!==a.previousPlayer&&s.loading.mode==='welcome';
  if(properWorld)stamp('worldAssignedMs',now);if(properWorld&&s.signon===4)stamp('signon4Ms',now);
  const assetsSettled=[s.textures,s.surfaceNormals,s.skins,s.weapons,s.hud].every(role=>role.settled);if(properWorld&&s.signon===4&&assetsSettled)stamp('requiredAssetRolesSettledMs',now);
  if(properWorld&&s.loading.pending.length===0&&s.loading.world&&s.loading.settledFrames>=3)stamp('readinessGateMs',now);
  if(properWorld&&latestWorldDraw?.serial>a.firstWorldSerial&&latestWorldDraw.world===s.world)stamp('firstActualWorldDrawMs',latestWorldDraw.atMs);
  const signature=JSON.stringify([s.world,s.signon,s.loading.phase,s.loading.pending,s.textures.pending,s.surfaceNormals.pending,s.actorNormals?.pending,s.skins.pending,s.weapons.pending,s.hud.pending,s.rock.pending,s.rock.missingVisibleTiles,s.shadows.ready,s.shadows.pending,s.shadows.faceRenders,s.shadows.pointGeometryRevision,s.water?.pending,s.programs]);
  const phaseSignature=JSON.stringify([s.world,s.signon,s.loading.phase,s.loading.pending]);
  if(signature!==a.lastSignature&&(now-a.lastEventMs>=250||phaseSignature!==a.lastPhaseSignature)&&r.events.length<1200){a.lastSignature=signature;a.lastPhaseSignature=phaseSignature;a.lastEventMs=now;r.events.push({elapsedMs:now-a.start,world:s.world,signon:s.signon,phase:s.loading.phase,pending:s.loading.pending,assets:{textures:s.textures.pending,surfaceNormals:s.surfaceNormals,actorNormals:s.actorNormals,skins:s.skins.pending,weapons:s.weapons.pending.length,hud:s.hud.pending},shadows:s.shadows,water:s.water,rock:s.rock,programs:s.programs,clTime:s.clTime,svTime:s.svTime});}
  const gateReady=s.loading.settledFrames>=3&&s.loading.world===s.world&&s.loading.pending.length===0;
  const actualFrame=latestWorldDraw?.serial>a.lastObservedWorldSerial&&latestWorldDraw.world===s.world&&latestWorldDraw.triangles>0;
  if(actualFrame)a.lastObservedWorldSerial=latestWorldDraw.serial;
  if(properWorld&&gateReady&&actualFrame&&loadingDOMGone()&&s.consoleHeight<modules.draw.Draw_GetVirtualHeight())stamp('firstPotentialWorldExposureMs',now);
  if(gateReady&&actualFrame&&properWorld&&assetsSettled&&s.loading.phase==='done'&&s.consoleHeight===0&&loadingDOMGone()){
   const pixels=visiblePixels();r.lastPixelProbe=pixels;if(!pixels.valid){display();return;}
   const visibleAt=performance.now();stamp('fullyVisibleReadyFrameMs',visibleAt);
   if(!a.visibleReady){a.visibleReady={svTime:s.svTime,clTime:s.clTime,worldDrawSerial};r.visibleReady={atMs:visibleAt,svTime:s.svTime,clTime:s.clTime,frame:latestWorldDraw,pixelWitness:pixels};}
   const playable=a.kind==='first-attract-demo'||s.svTime>a.visibleReady.svTime&&worldDrawSerial>a.visibleReady.worldDrawSerial&&s.input.keyDestination===s.input.keyGame&&!s.input.serverPaused&&!s.input.clientPaused&&!s.input.bestiaryLocked;
   if(!playable){r.waitingForPlayableFrame=true;display();return;}
   const complete=performance.now();if(a.kind!=='first-attract-demo')stamp('firstPlayableFrameMs',complete);
   r.waitingForPlayableFrame=false;r.elapsedMs=complete-a.start;r.completed=true;r.withinTwoSecondTarget=r.elapsedMs<=2000;r.world=s.world;r.final=s;r.completedFrame=latestWorldDraw;r.enhancedFrame=latestEnhancedWorldDraw;r.pixelWitness=pixels;r.resourcesAtEnd=report.resources.length;
   r.assetErrors=[...Object.entries(s.textures.errors||{}),...Object.entries(s.surfaceNormals.errors||{}),...Object.entries(s.skins.errors||{}),...Object.entries(s.weapons.failures||{}),...Object.entries(s.hud.errors||{}),...(s.hud.face?.errors||[]).map(error=>['face',error])];if(s.hud.face?.error)r.assetErrors.push(['face',s.hud.face.error]);
   r.inputPermissionRejections=report.inputPermissionRejections.filter(error=>error.case===a.kind);r.runtimeErrors=report.errors.slice(r.errorsAtStart).filter(error=>error.classification!=='input-permission');r.pointerLockStatus=s.input.pointerLocked?'locked':r.inputPermissionRejections.length?'denied during automatic launch':'not granted or not requested';
   r.featureBaselineIntact=expectedFeatures.every(name=>s.features[name]===1)&&s.hdr!==0;
   r.renderQualified=r.assetErrors.length===0&&r.featureBaselineIntact&&r.enhancedWorldDraws>0&&latestEnhancedWorldDraw?.world===s.world&&s.postActive&&s.criticalControls.r_drawworld!==0&&s.criticalControls.r_drawentities!==0&&(s.criticalControls.r_norefresh===null||s.criticalControls.r_norefresh===0)&&r.runtimeErrors.length===0&&document.visibilityState==='visible'&&!report.visibilityChanges.some(v=>v.state==='hidden')&&!report.conditions.panelExpandedDuringCapture;
   r.playableQualified=playable;r.qualified=r.renderQualified&&r.playableQualified;r.inputPermissionQualified=r.inputPermissionRejections.length===0;r.fallbacks=s.loading.fallbacks;
   takePicture(a.kind);active=null;display(true);
   if(report.cases.length===3){finish('completed');return;}status.textContent='Recorded '+r.kind+'; preparing next ordinary Newer Game launch…';nextCaseTimer=nativeSetTimeout(launchHub,400);
  }else display();
 }catch(error){noteError('measurement',error);finish('measurement-error');}finally{report.measurements.observationMs+=performance.now()-observedAt;sampling=false;}
}
function launchHub(){if(finished)return;beginCase(report.cases.length===1?'first-Newer-START':'warm-Newer-START');const {cmd,menu,draw}=modules;cmd.Cmd_ExecuteString('menu_singleplayer');const w=draw.Draw_GetVirtualWidth(),h=draw.Draw_GetVirtualHeight();menu.M_TouchInput(100+(w-320)/2,42+(h-200)/2,w,h);active.record.menuDispatchReturnedMs=performance.now()-active.start;}
function finish(reason){if(finished)return;finished=true;report.finished=true;report.finishReason=reason;report.finishedAtMs=performance.now();nativeClearTimeout(timeout);nativeClearTimeout(nextCaseTimer);if(active){active.record.timeoutOrStop=reason;active.record.elapsedMs=performance.now()-active.start;}try{modules?.vid.renderer?.setAnimationLoop(null);}catch(error){noteError('stop',error);}if(observer)for(const entry of observer.takeRecords())if(report.resources.length<6000)report.resources.push(resource(entry));if(taskObserver)for(const entry of taskObserver.takeRecords())if(report.longTasks.length<1000)report.longTasks.push({startTime:entry.startTime,duration:entry.duration,name:entry.name});observer?.disconnect();taskObserver?.disconnect();window.requestAnimationFrame=()=>0;for(const restore of restorers.reverse())restore();report.loadingCPU=performance.getEntriesByType('measure').filter(e=>e.name.startsWith('quaked-load:')).map(e=>({name:e.name,startTime:e.startTime,duration:e.duration}));report.resourcesSummary={count:report.resources.length,transferredBytes:report.resources.reduce((sum,r)=>sum+r.transferSize,0),decodedBytes:report.resources.reduce((sum,r)=>sum+r.decodedBodySize,0),sameOriginZeroTransferWithDecodedBytes:report.resources.filter(r=>r.name.startsWith('/')&&r.transferSize===0&&r.decodedBodySize>0).length};report.completeCases=report.cases.filter(c=>c.completed).length;report.qualifiedCases=report.cases.filter(c=>c.qualified).length;report.renderingStopped=true;panel.open=true;status.textContent=reason==='completed'?'Capture complete: '+report.completeCases+'/3 visible-ready cases. Animation stopped.':'Capture stopped: '+reason+'. Animation stopped.';display(true);}
window.requestAnimationFrame=function(callback){if(finished)return 0;return nativeRAF(timestamp=>{if(finished)return;attachRenderer();const at=performance.now();try{callback(timestamp);}finally{sample(performance.now()-at);}});};
document.addEventListener('visibilitychange',()=>{report.visibilityChanges.push({atMs:performance.now(),state:document.visibilityState});});
panel.addEventListener('toggle',()=>{if(!finished&&panel.open)report.conditions.panelExpandedDuringCapture=true;});
document.getElementById('performance-stop').onclick=()=>finish('manual-stop');
document.getElementById('performance-save').onclick=()=>{display(true);const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='quaked-loading-performance-'+Date.now()+'.json';link.click();nativeSetTimeout(()=>URL.revokeObjectURL(link.href),1000);};
Object.defineProperty(window,'loadingPerformanceReport',{get:()=>report});
beginCase('first-attract-demo');timeout=nativeSetTimeout(()=>finish('90-second-deadline'),Math.max(1,90000-performance.now()));
try{
 // Main must establish its normal module graph first; arbitrary leaf-first
 // imports change Quake's existing cyclic initialization order.
 await import('../main.js');
 const paths={vid:'engine/render/vid',main:'engine/render/gl_rmain',client:'engine/client/client',server:'engine/server/server',loading:'newer/ui/r_demoloading',screen:'engine/render/gl_screen',draw:'engine/render/gl_draw',vars:'engine/common/cvar',textures:'newer/render/r_newertextures',skins:'newer/render/r_newerskins',weapons:'newer/render/r_weapons',hud:'newer/ui/r_newerhud',rock:'newer/render/r_rockfield',surfaces:'engine/render/gl_rsurf',post:'newer/render/gl_post',cmd:'engine/common/cmd',menu:'engine/client/menu',keys:'engine/client/keys',bestiary:'newer/ui/r_bestiary'};
 modules=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await import('../src/'+path+'.js')])));report.engineModuleGraphReadyMs=performance.now();if(finished)modules.vid.renderer?.setAnimationLoop(null);else{attachRenderer();sample();}
}catch(error){noteError('bootstrap',error);finish('bootstrap-error');}
