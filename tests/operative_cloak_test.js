// Public production selection/resource endpoints. Uses real Three and alias
// geometry; only image completion and renderer calls are controlled boundaries.
await import('../src/engine/render/gl_rsurf.js');
await import('../src/newer/install.js');
const THREE=await import('three');
const cloak=await import('../src/newer/render/r_cloak.js');
const mode=await import('../src/newer/mode.js');
const cvar=await import('../src/engine/common/cvar.js');
const post=await import('../src/newer/render/gl_post.js');
const powerVision=await import('../src/newer/render/r_powervision.js');
const {R_DrawAliasModel}=await import('../src/engine/render/gl_mesh.js');
const {cl}=await import('../src/engine/client/client.js');
const {r_lerpmodels}=await import('../src/newer/render/r_anim.js');
const {IT_INVISIBILITY,IT_QUAD,STAT_HEALTH}=await import('../src/engine/common/quakedef.js');
const same=(a,b,label)=>{if(a!==b)throw Error(label+': '+String(a)+' != '+String(b));};
const ok=(value,label)=>{if(!value)throw Error(label);};
function fixture(){
 const geometry=new THREE.BoxGeometry(16,12,56),template={posAttr:geometry.attributes.position,normalAttr:geometry.attributes.normal,uvAttr:geometry.attributes.uv,indices:Array.from(geometry.index.array),vertexCount:geometry.attributes.position.count,lightnormalindices:new Array(geometry.attributes.position.count).fill(0)};
 const skin=new THREE.DataTexture(new Uint8Array([120,120,120,255]),1,1);
 const header={posedata:[[],[]],frames:[{firstpose:0,numposes:1},{firstpose:1,numposes:1}],numframes:2,numposes:2,numskins:1,gl_texturenum:[[skin]],_geoCache:new Map([[0,template],[1,template]])};
 const body={name:'progs/player.mdl',cache:{data:header}},world={},client={worldmodel:world,maxclients:3,viewentity:3,model_precache:[null,body],items:0};
 const player=slot=>({_entityIndex:slot,model:{name:'progs/eyes.mdl'},cloakBodyFrame:0,skinnum:0,syncbase:0,origin:new Float32Array([slot*24,0,0]),angles:new Float32Array([0,270,0]),_aliasMesh:new THREE.Mesh(geometry,new THREE.MeshBasicMaterial())});
 return {geometry,template,body,client,players:[player(1),player(2),player(3)],renderer:{capabilities:{isWebGL2:true}}};
}
function withLoads(run){
 const oldLoad=THREE.TextureLoader.prototype.load,oldDocument=globalThis.document,oldCvar=cloak.r_cloak.string,loads=[];
 globalThis.document={};mode.R_AnimSetNewer(false);cvar.Cvar_SetValue('r_cloak',1);cloak.R_CloakReset();
 THREE.TextureLoader.prototype.load=function(url,done,progress,failed){const texture=new THREE.Texture();let disposed=0;texture.addEventListener('dispose',()=>disposed++);const request={url,texture,done:()=>done(texture),failed,disposed:()=>disposed};loads.push(request);return texture;};
 try{run(loads);}finally{cloak.R_CloakReset();THREE.TextureLoader.prototype.load=oldLoad;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;cvar.Cvar_Set('r_cloak',oldCvar);}
}
function readyFrame(f,loads){cloak.R_CloakFrame(f.renderer,f.client,f.players,f.players.length,true);loads.at(-1).done();cloak.R_CloakFrame(f.renderer,f.client,f.players,f.players.length,true);}

Deno.test('cloak selects only remote player slots with replicated body pose, leaves wearer inventory independent',()=>withLoads(loads=>{
 const f=fixture(),original=f.players.map(p=>[p.model,p.cloakBodyFrame,Array.from(p.origin).join(),Array.from(p.angles).join()]);readyFrame(f,loads);
 same(cloak.R_CloakStatus().proxies,2,'two remote players independently prepared');same(cloak.R_CloakStatus().submitted,2,'two humanoids submitted');same(f.players[2]._aliasMesh.visible,true,'observer own presentation unchanged');
 same(f.players[0]._aliasMesh.visible,false,'qualified remote eyes suppressed');same(f.client.items,0,'observer inventory not required');
 cloak.R_CloakRestore();f.client.items=524288;cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(cloak.R_CloakStatus().submitted,2,'wearer vision bit does not suppress remote cloaks');
 for(let i=0;i<3;i++){same(f.players[i].model,original[i][0],'native model identity unchanged');same(f.players[i].cloakBodyFrame,original[i][1],'replicated body frame unchanged');same(Array.from(f.players[i].origin).join(),original[i][2],'native origin unchanged');same(Array.from(f.players[i].angles).join(),original[i][3],'native angles unchanged');}
 f.geometry.dispose();
}));
Deno.test('cloak rejects unrelated eyes, local slot, unavailable or invalid pose and missing player body',()=>withLoads(loads=>{
 const f=fixture();readyFrame(f,loads);cloak.R_CloakRestore();
 for(const mutate of [p=>p._entityIndex=8,p=>p._entityIndex=3,p=>p.cloakBodyFrame=null,p=>p.cloakBodyFrame=-1,p=>p.cloakBodyFrame=2,p=>p.model={name:'progs/player.mdl'}]){
  const p={...f.players[0],origin:f.players[0].origin,angles:f.players[0].angles,_aliasMesh:new THREE.Mesh(f.geometry,new THREE.MeshBasicMaterial())};mutate(p);cloak.R_CloakFrame(f.renderer,f.client,[p],1,true);same(cloak.R_CloakStatus().submitted,0,'invalid remote selection has no cloak');same(cloak.R_CloakStatus().proxies,0,'stale proxy retired');
 }
 f.client.model_precache=[];cloak.R_CloakFrame(f.renderer,f.client,[f.players[0]],1,true);same(f.players[0]._aliasMesh.visible,true,'missing full body retains native eyes');same(cloak.R_CloakStatus().submitted,0,'missing body fallback');f.geometry.dispose();
}));
Deno.test('expiry, death, entity reuse, disappearance and map replacement retire owned cloak proxies',()=>withLoads(loads=>{
 const f=fixture();let sharedDisposed=0;f.geometry.addEventListener('dispose',()=>sharedDisposed++);const sourceVertices=f.template.posAttr.array;readyFrame(f,loads);
 f.players[0].cloakBodyFrame=null;cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(f.players[0]._aliasMesh.visible,true,'expiry restores native presentation');same(cloak.R_CloakStatus().proxies,1,'only still-active player retained');
 f.players[1].model={name:'progs/player.mdl'};cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(f.players[1]._aliasMesh.visible,true,'corpse model restored');same(cloak.R_CloakStatus().proxies,0,'death body not cloaked');
 const newEntity={...f.players[0],model:{name:'progs/eyes.mdl'},cloakBodyFrame:1,_aliasMesh:new THREE.Mesh(f.geometry,new THREE.MeshBasicMaterial())};cloak.R_CloakFrame(f.renderer,f.client,[newEntity],1,true);same(cloak.R_CloakStatus().proxies,1,'new slot incarnation has one current proxy');
 cloak.R_CloakFrame(f.renderer,f.client,[],0,true);same(newEntity._aliasMesh.visible,true,'disappeared entity original visibility restored');same(cloak.R_CloakStatus().proxies,0,'PVS disappearance retains no cloak mesh');
 cloak.R_CloakFrame(f.renderer,f.client,[newEntity],1,true);f.client.worldmodel={};cloak.R_CloakFrame(f.renderer,f.client,[newEntity],1,true);same(cloak.R_CloakStatus().proxies,0,'new map cannot retain old map proxy while loading');same(newEntity._aliasMesh.visible,true,'native eyes used during new map readiness');same(sharedDisposed,0,'source geometry not owned by cloak');same(f.body.cache.data._geoCache.get(0),f.template,'source pose template cache preserved');same(f.template.posAttr.array,sourceVertices,'source position storage preserved');f.geometry.dispose();
}));
Deno.test('full cloak body survives tiny native eyes frustum exclusion or absent eyes mesh',()=>withLoads(loads=>{
 const f=fixture();readyFrame(f,loads);cloak.R_CloakRestore();const e=f.players[0],native=e._aliasMesh;native.visible=false;
 cloak.R_CloakFrame(f.renderer,f.client,[e],1,true);same(cloak.R_CloakStatus().submitted,1,'hidden tiny eyes cannot cull full-body silhouette');same(cloak.R_CloakSubjects().length,1,'current native snapshot still supplies body');cloak.R_CloakRestore();same(native.visible,false,'native culling visibility restored exactly');
 e._aliasMesh=null;cloak.R_CloakFrame(f.renderer,f.client,[e],1,true);same(cloak.R_CloakStatus().submitted,1,'missing eyes mesh still uses available full native body');same(cloak.R_CloakSubjects()[0].geometry.attributes.position.count,f.template.vertexCount,'whole native body supplied');same(e.model.name,'progs/eyes.mdl','source identity unchanged');same(e.cloakBodyFrame,0,'actual body frame0 preserved');f.geometry.dispose();
}));
Deno.test('Classic, disabled control and unavailable renderer do not load assets or keep hidden eyes',()=>withLoads(loads=>{
 const f=fixture();cloak.R_CloakFrame(f.renderer,f.client,f.players,3,false);same(loads.length,0,'Classic starts no asset request');same(cloak.R_CloakStatus().proxies,0,'Classic no proxy');
 cloak.R_CloakFrame({capabilities:{isWebGL2:false}},f.client,f.players,3,true);same(loads.length,0,'unsupported renderer starts no request');
 readyFrame(f,loads);cvar.Cvar_SetValue('r_cloak',0);cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(cloak.R_CloakStatus().proxies,0,'disabled frees proxy');same(cloak.R_CloakStatus().ready,false,'disabled frees owned noise');ok(f.players.every(p=>p._aliasMesh.visible),'disabled restores all original eye visibility');f.geometry.dispose();
}));
Deno.test('late image callbacks after reset cannot resurrect cloak or dispose a newer generation',()=>withLoads(loads=>{
 same(cloak.R_CloakReady(),false,'request is asynchronous');same(loads.length,1,'one load');cloak.R_CloakReady();same(loads.length,1,'repeated readiness shares one load');const old=loads[0],generation=cloak.R_CloakStatus().generation;cloak.R_CloakReset();ok(cloak.R_CloakStatus().generation>generation,'reset advances ownership generation');cloak.R_CloakReady();const next=loads[1];old.done();same(cloak.R_CloakStatus().ready,false,'stale completion cannot install texture');ok(cloak.R_CloakStatus().loading,'new generation remains pending');next.done();same(cloak.R_CloakStatus().ready,true,'new generation completes');same(next.disposed(),0,'old callback cannot dispose new resource');cloak.R_CloakReset();ok(next.disposed()>0,'reset disposes current owned image');
}));
Deno.test('asset failure remains native fallback and can recover after explicit reset',()=>withLoads(loads=>{
 const f=fixture();cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);loads[0].failed();same(cloak.R_CloakStatus().failed,true,'failure exposed');cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(loads.length,1,'failed asset not retried every frame');ok(f.players.every(p=>p._aliasMesh.visible),'failure keeps native eyes');cloak.R_CloakReset();readyFrame(f,loads);same(cloak.R_CloakStatus().proxies,2,'explicit reset can recover two players');f.geometry.dispose();
}));
Deno.test('reset invalidates a failed request epoch before any late success or error callback',()=>withLoads(loads=>{
 cloak.R_CloakReady();const failedRequest=loads[0];failedRequest.failed();same(cloak.R_CloakStatus().failed,true,'initial request failed');same(cloak.R_CloakStatus().loading,false,'failed request is no longer pending');const epoch=cloak.R_CloakStatus().generation;
 cloak.R_CloakReset();ok(cloak.R_CloakStatus().generation>epoch,'failed-only reset advances epoch');failedRequest.done();same(cloak.R_CloakStatus().ready,false,'late success from failed epoch cannot install noise');same(cloak.R_CloakStatus().failed,false,'reset remains clear');
 cloak.R_CloakReady();const replacement=loads[1];failedRequest.failed();same(cloak.R_CloakStatus().failed,false,'old failure cannot poison replacement load');ok(cloak.R_CloakStatus().loading,'replacement remains pending');failedRequest.done();same(replacement.disposed(),0,'old success cannot dispose replacement');same(cloak.R_CloakStatus().ready,false,'only current completion may install noise');replacement.done();same(cloak.R_CloakStatus().ready,true,'replacement successfully initializes');
}));

Deno.test('cloak draw failure restores renderer and borrowed mesh, clears submissions, and reset disposes shared target',()=>withLoads(loads=>{
 cloak.R_CloakReady();loads[0].done();
 const input=new THREE.Texture({width:64,height:48}),depth=new THREE.DepthTexture(64,48),normal=new THREE.Texture({width:64,height:48});
 const sourceMaterial=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(new THREE.BoxGeometry(4,4,8),sourceMaterial);mesh.visible=false;mesh.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld(true);const initialTarget={name:'caller'},initialColour=new THREE.Color(.2,.3,.4),viewport=new THREE.Vector4(3,4,50,30),scissor=new THREE.Vector4(6,7,20,10);
 let currentTarget=initialTarget,colour=initialColour.clone(),alpha=.7,scissorOn=true,calls=0,ownedTarget=null,targetDisposals=0;
 const r={autoClear:true,getRenderTarget:()=>currentTarget,setRenderTarget(t){currentTarget=t;if(t?.isWebGLRenderTarget&&!ownedTarget){ownedTarget=t;t.addEventListener('dispose',()=>targetDisposals++);}},getClearColor:v=>v.copy(colour),getClearAlpha:()=>alpha,setClearColor(c,a){colour.set(c);alpha=a;},getViewport:v=>v.copy(viewport),setViewport(...a){a[0]?.isVector4?viewport.copy(a[0]):viewport.set(...a);},getScissor:v=>v.copy(scissor),setScissor:v=>scissor.copy(v),getScissorTest:()=>scissorOn,setScissorTest:v=>scissorOn=v,clear(){},render(){if(++calls===2)throw Error('controlled mesh failure');}};
 cloak.R_CloakSubmit(mesh);let caught=false;try{cloak.R_CloakRender(r,input,depth,normal,camera,1,64,48);}catch(error){caught=error.message==='controlled mesh failure';}
 ok(caught,'controlled production mesh draw failed');same(currentTarget,initialTarget,'caller render target restored');same(r.autoClear,true,'autoClear restored');same(alpha,.7,'clear alpha restored');same(colour.toArray().join(),initialColour.toArray().join(),'clear colour restored');same(viewport.toArray().join(),'3,4,50,30','viewport restored');same(scissor.toArray().join(),'6,7,20,10','scissor restored');same(scissorOn,true,'scissor enable restored');same(mesh.material,sourceMaterial,'borrowed material restored');same(mesh.visible,false,'borrowed visibility restored');same(cloak.R_CloakStatus().submitted,0,'failed draw cannot replay stale submission');cloak.R_CloakReset();same(targetDisposals,1,'owned target disposed once');mesh.geometry.dispose();sourceMaterial.dispose();input.dispose();depth.dispose();normal.dispose();
}));
Deno.test('missing scene depth retains original input and consumes pending silhouettes without allocation',()=>withLoads(loads=>{
 cloak.R_CloakReady();loads[0].done();const texture=new THREE.Texture({width:64,height:48}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());cloak.R_CloakSubmit(mesh);same(cloak.R_CloakRender(null,texture,null,null,null,0,64,48),texture,'unqualified input falls back unchanged');same(cloak.R_CloakStatus().submitted,0,'fallback consumes submissions');same(cloak.R_CloakStatus().target,null,'fallback allocates no target');mesh.geometry.dispose();mesh.material.dispose();texture.dispose();
}));
Deno.test('public post begin with r_hdr 0 resets a live cloak and Classic split rejects submission',()=>withLoads(loads=>{
 if(!cvar.Cvar_FindVar(post.r_hdr.name))cvar.Cvar_RegisterVariable(post.r_hdr);const before=post.r_hdr.string,f=fixture();
 try{
  cvar.Cvar_SetValue('r_hdr',1);mode.R_AnimSetClassicPass(false);readyFrame(f,loads);same(cloak.R_CloakStatus().proxies,2,'live Newer cloak before switching');ok(f.players[0]._aliasMesh.visible===false,'remote eyes currently replaced');
  cvar.Cvar_SetValue('r_hdr',0);same(post.R_PostBegin(f.renderer,true,320,200),false,'Classic mode cannot start enhanced pipeline');same(mode.R_NewerGame(),false,'public game mode reports Classic');same(cloak.R_CloakStatus().ready,false,'Classic releases noise');same(cloak.R_CloakStatus().proxies,0,'Classic releases proxy meshes');same(cloak.R_CloakStatus().submitted,0,'Classic releases queued silhouettes');same(f.players[0]._aliasMesh.visible,true,'Classic restores native eyes');
  cvar.Cvar_SetValue('r_hdr',1);readyFrame(f,loads);mode.R_AnimSetClassicPass(true);same(mode.R_NewerGame(),false,'Classic split is excluded even while hdr cvar is on');cloak.R_CloakFrame(f.renderer,f.client,f.players,3,mode.R_NewerGame());same(cloak.R_CloakStatus().proxies,0,'same primary caller mode predicate rejects Classic split');same(f.players[0]._aliasMesh.visible,true,'split keeps native eyes');
 }finally{mode.R_AnimSetClassicPass(false);cvar.Cvar_Set('r_hdr',before);f.geometry.dispose();}
}));

Deno.test('Unseen reveal owns only its mask and restores borrowed geometry and raster state on failure',()=>withLoads(()=>{
 const f=fixture();f.client.stats=[];f.client.stats[STAT_HEALTH]=100;f.client.items=IT_INVISIBILITY;cvar.Cvar_SetValue('r_cloak',0);
 cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(cloak.R_CloakSubjects().length,2,'Ring observers receive two current remote bodies without optical noise');same(cloak.R_CloakStatus().submitted,0,'Unseen does not layer optical body over its reveal');
 const subject=cloak.R_CloakSubjects()[0],material=subject.material,visible=subject.visible,camera=new THREE.PerspectiveCamera(75,2,4,4096);camera.updateMatrixWorld(true);
 const hdr={width:64,height:32,depthTexture:new THREE.DepthTexture(64,32),textures:[new THREE.Texture(),new THREE.Texture(),new THREE.Texture()]};
 const caller={name:'caller'},viewport=new THREE.Vector4(3,4,51,25),scissor=new THREE.Vector4(5,6,23,18),initialColour=new THREE.Color(.1,.2,.3);let target=caller,colour=initialColour.clone(),alpha=.6,scissorOn=true,fail=true,owned=null,disposed=0,draws=0;
 const renderer={autoClear:true,getRenderTarget:()=>target,setRenderTarget:t=>{target=t;if(t?.isWebGLRenderTarget&&!owned){owned=t;t.addEventListener('dispose',()=>disposed++);}},getClearColor:o=>o.copy(colour),getClearAlpha:()=>alpha,setClearColor:(c,a)=>{colour.set(c);alpha=a;},getViewport:o=>o.copy(viewport),setViewport:(...a)=>a[0]?.isVector4?viewport.copy(a[0]):viewport.set(...a),getScissor:o=>o.copy(scissor),setScissor:o=>scissor.copy(o),getScissorTest:()=>scissorOn,setScissorTest:v=>{scissorOn=v;},clear(){},render(mesh){draws++;same(mesh.geometry,cloak.R_CloakSubjects()[draws-1]?.geometry||subject.geometry,'reveal borrows current full-body geometry');same(mesh.material.uniforms.tDepth.value,hdr.depthTexture,'reveal receives actual world depth');same(mesh.material.uniforms.tNormal.value,hdr.textures[1],'reveal receives actual foreground normal packet');if(fail)throw Error('controlled reveal failure');}};
 let threw=false;try{cloak.R_CloakReveal(renderer,hdr,camera);}catch(e){threw=e.message==='controlled reveal failure';}ok(threw,'actual reveal draw failed');same(target,caller,'caller target restored');same(subject.material,material,'borrowed source material restored');same(subject.visible,visible,'borrowed source visibility restored');same(renderer.autoClear,true,'autoClear restored');same(viewport.toArray().join(),'3,4,51,25','viewport restored');same(scissor.toArray().join(),'5,6,23,18','scissor restored');same(scissorOn,true,'scissor guard restored');same(alpha,.6,'clear alpha restored');same(colour.toArray().join(),initialColour.toArray().join(),'clear colour restored');
 fail=false;draws=0;const revealed=cloak.R_CloakReveal(renderer,hdr,camera);same(revealed,owned.texture,'successful retry uses owned completed mask');same(draws,2,'both remote bodies rendered');let sourceDisposed=0;subject.geometry.addEventListener('dispose',()=>sourceDisposed++);powerVision.R_PowerVisionReset();same(disposed,1,'power reset immediately releases reveal target');same(sourceDisposed,0,'power reset cannot dispose cloak-owned body geometry');same(cloak.R_CloakStatus().reveal,false,'no stale reveal target remains');
 hdr.depthTexture.dispose();hdr.textures.forEach(t=>t.dispose());f.geometry.dispose();
}));

Deno.test('primary presentation disable clears Ring and Quad subjects even while native powers remain',()=>withLoads(loads=>{
 const f=fixture();f.client.stats=[];f.client.stats[STAT_HEALTH]=100;f.client.items=IT_INVISIBILITY|IT_QUAD;cvar.Cvar_SetValue('r_cloak',0);
 cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(cloak.R_CloakSubjects().length,2,'powers admit received bodies independently of optical option');same(loads.length,0,'power subjects need no noise load');same(f.players[0]._aliasMesh.visible,false,'Unseen replaces ordinary eyes');
 // The primary renderer supplies false for Classic, r_drawentities0 and an
 // active replacement level view. Exercise the production boundary, without
 // asserting the spelling of its caller or duplicating a condition in a test.
 cloak.R_CloakFrame(f.renderer,f.client,f.players,3,false);same(cloak.R_CloakSubjects().length,0,'disabled presentation retains no detector geometry');same(cloak.R_CloakStatus().proxies,0,'disabled presentation releases owned proxies');same(cloak.R_CloakStatus().submitted,0,'disabled presentation cannot replay a cloak');same(f.players[0]._aliasMesh.visible,true,'original visibility restored');same(f.client.items,IT_INVISIBILITY|IT_QUAD,'renderer disable never removes actual powers');f.geometry.dispose();
}));

Deno.test('cloak owns disposable vertex buffers while preserving native alias interpolation and immutable templates',()=>withLoads(loads=>{
 const f=fixture(),second=f.geometry.clone();second.scale(1.3,.8,1.1);second.rotateZ(.25);second.translate(3,-2,1);
 const template1={posAttr:second.attributes.position,normalAttr:second.attributes.normal,uvAttr:second.attributes.uv,indices:Array.from(second.index.array),vertexCount:second.attributes.position.count,lightnormalindices:new Array(second.attributes.position.count).fill(0)};
 f.body.cache.data._geoCache.set(1,template1);
 const templates=[f.template,template1],sourceAttributes=templates.flatMap(t=>[t.posAttr,t.normalAttr,t.uvAttr]),originals=sourceAttributes.map(a=>Array.from(a.array)),versions=sourceAttributes.map(a=>a.version);
 const time=cl.time,lerp=r_lerpmodels.value;mode.R_AnimSetNewer(true);r_lerpmodels.value=1;
 const control={model:f.body,frame:0,skinnum:0,origin:new Float32Array(f.players[0].origin),angles:new Float32Array(f.players[0].angles)};
 let proxyGeometry=null,owned=null,disposals=0;
 const compare=()=>{
  const baseline=R_DrawAliasModel(control,f.body.cache.data,null),mesh=cloak.R_CloakSubjects()[0];
  ok(mesh,'production cloak supplied an animated body');
  if(!owned){proxyGeometry=mesh.geometry;owned=['position','normal','uv'].map(n=>mesh.geometry.getAttribute(n));proxyGeometry.addEventListener('dispose',()=>{disposals++;for(const n of ['position','normal','uv'])ok(!sourceAttributes.includes(proxyGeometry.getAttribute(n)),'retirement cannot delete a native template attribute');});}
  same(mesh.geometry,proxyGeometry,'one owned geometry reused across poses');
  for(const [i,name]of ['position','normal','uv'].entries()){
   const actual=mesh.geometry.getAttribute(name),expected=baseline.geometry.getAttribute(name);same(actual,owned[i],'owned '+name+' buffer remains stable');ok(!sourceAttributes.includes(actual),'owned '+name+' is not a native cached attribute');ok(sourceAttributes.every(a=>a.array.buffer!==actual.array.buffer),'owned '+name+' has distinct backing storage');ok(actual.array.length===expected.array.length&&actual.array.every((v,j)=>Math.abs(v-expected.array[j])<1e-6),'owned '+name+' numerically matches ordinary production alias output');
  }
  return Array.from(owned[0].array);
 };
 try{
  cl.time=1;readyFrame(f,loads);compare();
  ok(cloak.R_CloakSubjects()[1].geometry.getAttribute('position')!==owned[0],'different players never share disposable position buffers');
  for(const [frame,now]of [[1,1.1],[1,1.15],[0,1.18],[0,1.23],[0,1.35]]){
   f.players[0].cloakBodyFrame=control.frame=frame;cl.time=now;cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);const values=compare();
   if(now===1.15){ok(values.some((v,i)=>Math.abs(v-originals[0][i])>1e-5),'mid-blend advanced from initial pose');ok(values.some((v,i)=>Math.abs(v-originals[3][i])>1e-5),'mid-blend has not snapped to final pose');}
  }
  ok(owned[0].version>0&&owned[1].version>0,'interpolated updates mark owned GPU attributes dirty');
  f.players[0].cloakBodyFrame=null;cloak.R_CloakFrame(f.renderer,f.client,f.players,3,true);same(disposals,1,'expiry disposes first player owned geometry exactly once');
  sourceAttributes.forEach((a,i)=>{same(a.version,versions[i],'native template upload version unchanged');ok(a.array.every((v,j)=>v===originals[i][j]),'native template values unchanged through interpolation and disposal');});
  same(f.body.cache.data._geoCache.get(0),f.template,'first cached template retained');same(f.body.cache.data._geoCache.get(1),template1,'second cached template retained');
 }finally{cloak.R_CloakReset();control._aliasGeo?.dispose();control._playerMaterial?.dispose();cl.time=time;r_lerpmodels.value=lerp;mode.R_AnimSetNewer(false);f.geometry.dispose();second.dispose();}
}));
