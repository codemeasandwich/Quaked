// Public production cloak renderer + native alias poses. This deliberately does
// not emulate a network match; the separate two-client trial is acceptance.
export {};
const vars = await import('../src/engine/common/cvar.js');
// This preview shares the game's origin but never owns the player's preferences.
vars.Cvar_SetStorageWritable(false);
const archivedSettings=()=>{try{return {r_cloak:localStorage.getItem('quake_cvar_r_cloak'),r_hdr:localStorage.getItem('quake_cvar_r_hdr')};}catch{return null;}};
const archivedSettingsAtStart=archivedSettings();
await import('../src/newer/install.js');
await import('../src/engine/render/gl_rsurf.js');
const THREE = await import('three');
const cloak = await import('../src/newer/render/r_cloak.js');
const pak = await import('../src/engine/common/pak.js');
const models = await import('../src/engine/render/gl_model.js');
const alias = await import('../src/engine/render/gl_mesh.js');
const mode = await import('../src/newer/mode.js');
const {entity_t} = await import('../src/engine/render/render.js');
const {cl} = await import('../src/engine/client/client.js');
const {VID_SetPalette} = await import('../src/engine/render/vid.js');
const width = 480, height = 320, owned = [], targets = [], shaderErrors = [];
const report = {settingsStorageWritable:vars.Cvar_StorageWritable(),archivedSettingsAtStart,scope:'Production cloak GPU regression on native player.mdl; not multiplayer acceptance',reference:{path:'fieldlab-fx-3d-updated.html',expectedSha256:'7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6'},checks:[],failures:[],frames:[]};
let busy = false, renderer, camera, opaque, normals, referenceMaterial, originalReferenceMaterial, referenceTarget, maskTarget, player, header, actors;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
const publish = text => {report.archivedSettingsAtEnd=archivedSettings();report.archivedSettingsUnchanged=archivedSettingsAtStart===null?null:JSON.stringify(archivedSettingsAtStart)===JSON.stringify(report.archivedSettingsAtEnd);document.querySelector('#status').textContent=text;document.querySelector('#evidence').textContent=JSON.stringify(report,null,2);};
const check = (name,passed,data={}) => {report.checks.push({name,passed,...data});if(!passed)report.failures.push(name);};
const waitReady = async () => {const until=performance.now()+15000;while(!cloak.R_CloakReady()){if(performance.now()>until)throw Error('Production cloak assets did not become ready: '+JSON.stringify(cloak.R_CloakStatus()));await new Promise(r=>setTimeout(r,25));}};
const textureTarget = (depth=false) => {const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:depth,depthTexture:depth?new THREE.DepthTexture(width,height):undefined,generateMipmaps:false});owned.push(target);return target;};
function pixels(texture) {
 const target=targets.find(t=>t.texture===texture);if(!target)throw Error('Output texture has no rendered target');
 const data=new Uint16Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,data);
 return Float32Array.from(data,THREE.DataUtils.fromHalfFloat);
}
function difference(a,b,mask=null) {let changed=0,maximum=0,mean=0,n=0;for(let i=0;i<width*height;i++){if(mask&&!mask(i))continue;let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(a[i*4+c]-b[i*4+c]));if(d>.002)changed++;maximum=Math.max(maximum,d);mean+=d;n++;}return{changed,maximum,mean:mean/Math.max(1,n),samples:n};}
const finite = a => a.every(Number.isFinite);
const maxRGB = a => {let m=0;for(let i=0;i<a.length;i++)if(i%4!==3)m=Math.max(m,a[i]);return m;};
const background = new THREE.Scene(), bgMaterial = new THREE.ShaderMaterial({
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'varying vec2 vUv;uniform float uDark,uFlip;void main(){vec2 u=vec2(mix(vUv.x,1.-vUv.x,uFlip),vUv.y);float k=mod(floor(u.x*48.)+floor(u.y*32.),2.);vec3 c=vec3(.09+u.x*.62,.07+u.y*.47,.08+k*.4);gl_FragColor=vec4(c*uDark,1.);}',
 uniforms:{uDark:{value:1},uFlip:{value:0}},side:THREE.DoubleSide,toneMapped:false
});
bgMaterial.onBeforeCompile=()=>{};
const wall=new THREE.Mesh(new THREE.PlaneGeometry(500,320),bgMaterial);wall.rotation.x=Math.PI/2;wall.position.set(0,120,10);background.add(wall);
const foreground=new THREE.Mesh(new THREE.BoxGeometry(30,15,120),new THREE.MeshBasicMaterial({color:0x2a2430}));foreground.position.set(-8,-40,10);foreground.visible=false;background.add(foreground);
const copyMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{image:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D image;void main(){gl_FragColor=texture2D(image,vUv);}'});copyMaterial.onBeforeCompile=()=>{};
const copyScene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),copyMaterial);copyScene.add(quad);const flatCamera=new THREE.Camera();
const maskMaterial=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.FrontSide,toneMapped:false});maskMaterial.onBeforeCompile=()=>{};
function copyTo(texture,target){renderer.setRenderTarget(target);renderer.clear(true,true,false);copyMaterial.uniforms.image.value=texture;renderer.render(copyScene,flatCamera);}
function drawBackground({dark=1,flip=0,occluder=false}={}) {bgMaterial.uniforms.uDark.value=dark;bgMaterial.uniforms.uFlip.value=flip;foreground.visible=occluder;renderer.setRenderTarget(opaque);renderer.clear(true,true,false);renderer.render(background,camera);return pixels(opaque.texture);}
function pose(actor,frame=0,origin=[0,0,0],yaw=270,time=1) {cl.time=time;actor.frame=frame;actor.origin.set(origin);actor.angles.set([0,yaw,0]);const mesh=alias.R_DrawAliasModel(actor,header,null,0);mesh.updateMatrixWorld(true);return mesh;}
function draw(meshes,time=1) {for(const mesh of meshes)cloak.R_CloakSubmit(mesh);const output=cloak.R_CloakRender(renderer,opaque.texture,opaque.depthTexture,normals,camera,time,width,height);return{output,data:pixels(output)};}
function silhouette(meshes) {renderer.setRenderTarget(maskTarget);renderer.clear(true,true,false);for(const mesh of meshes){const old=mesh.material;mesh.material=maskMaterial;renderer.render(mesh,camera);mesh.material=old;}const p=pixels(maskTarget.texture);return i=>p[i*4]>.5;}
function reference(mesh,time,original=false) {
 copyTo(opaque.texture,referenceTarget);const selected=original?originalReferenceMaterial:referenceMaterial,u=selected.uniforms;
 u.uScene.value=opaque.texture;u.uTime.value=time;u.uEye.value.copy(camera.position).multiplyScalar(cloak.CLOAK.worldScale);u.uView.value.copy(camera.matrixWorldInverse);
 u.uModel.value.copy(mesh.matrixWorld).premultiply(new THREE.Matrix4().makeScale(cloak.CLOAK.worldScale,cloak.CLOAK.worldScale,cloak.CLOAK.worldScale));
 u.uVP.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(new THREE.Matrix4().makeScale(1/cloak.CLOAK.worldScale,1/cloak.CLOAK.worldScale,1/cloak.CLOAK.worldScale));
 const geometry=mesh.geometry,old=mesh.material;for(const [to,from] of [['aPosition','position'],['aNormal','normal'],['aUV','uv']])geometry.setAttribute(to,geometry.getAttribute(from));
 mesh.material=selected;renderer.render(mesh,camera);mesh.material=old;return pixels(referenceTarget.texture);
}
function present(texture,label=null) {renderer.setRenderTarget(null);renderer.clear();copyMaterial.uniforms.image.value=texture;renderer.render(copyScene,flatCamera);if(label){const figure=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=renderer.domElement.toDataURL('image/png');caption.textContent=label;figure.append(image,caption);document.querySelector('#stills').append(figure);}}

async function run(){
 if(busy)return;busy=true;report.checks=[];report.failures=[];document.querySelector('#stills').replaceChildren();publish('Running production GPU checks…');
 try{
  await waitReady();mode.R_AnimSetNewer(false);camera.position.set(0,-170,20);camera.lookAt(0,0,8);camera.updateMatrixWorld(true);
  const mesh=pose(actors[0]),base=drawBackground(),mask=silhouette([mesh]);const a=draw([mesh],1),ref=reference(mesh,1),comparison=difference(a.data,ref,mask);
  check('authoritative refraction shader with documented scale/linear tint adaptations on identical native mesh/UVs',comparison.mean<.002&&comparison.maximum<.08,{...comparison,adaptation:'Quake/reference world-unit conversion and source rim sRGB-to-linear conversion; central silhouette is away from bounded-edge guard'});
  check('animated humanoid silhouette contains refracted scene',difference(a.data,base,mask).changed>100,difference(a.data,base,mask));
  check('pixels outside native player silhouette remain unchanged',difference(a.data,base,i=>!mask(i)).changed===0,difference(a.data,base,i=>!mask(i)));
  present(a.output,'Production Operative cloak / native standing pose');
  const originalRef=reference(mesh,1,true);report.reference.unadaptedRimDifference=difference(a.data,originalRef,mask);present(referenceTarget.texture,'Exact source shader with unconverted reference rim tint / same native mesh');
  const later=draw([mesh],2.1);check('fixed-pose shimmer changes with simulation time',difference(a.data,later.data,mask).changed>60,difference(a.data,later.data,mask));
  const attackFrame=header.frames.findIndex(f=>f.name==='shotatt1');if(attackFrame<0)throw Error('Expected native player shotgun attack pose missing');const attackMesh=pose(actors[0],attackFrame,[0,0,0],270,1),attackMask=silhouette([attackMesh]),attack=draw([attackMesh],1),attackReference=reference(attackMesh,1);check('native animation changes cloak geometry with camera, transform and shimmer time fixed',difference(a.data,attack.data).changed>60&&difference(attack.data,attackReference,attackMask).mean<.002,{fromFrame:0,toFrame:attackFrame,change:difference(a.data,attack.data),reference:difference(attack.data,attackReference,attackMask)});pose(actors[0],0,[0,0,0],270,1);
  const alternateBase=drawBackground({flip:1}),alternate=draw([mesh],1),refAlternate=reference(mesh,1);
  check('changed background is spatially refracted rather than a fixed tint',difference(a.data,alternate.data,mask).changed>100&&difference(alternate.data,refAlternate,mask).mean<.005,{background:difference(base,alternateBase,mask),cloak:difference(a.data,alternate.data,mask),reference:difference(alternate.data,refAlternate,mask)});
  const darkBase=drawBackground({dark:.08}),dark=draw([mesh],1),darkRef=reference(mesh,1);check('dark-background output agrees with bounded reference rim/shimmer',difference(dark.data,darkRef,mask).mean<.005,{reference:difference(dark.data,darkRef,mask),effect:difference(dark.data,darkBase,mask)});present(dark.output,'Dark background / supplied restrained rim tint');
  const openBase=drawBackground(),open=draw([mesh],1),blockedBase=drawBackground({occluder:true}),blocked=draw([mesh],1);const obstructed=i=>differencePixel(openBase,blockedBase,i)>.005;
  check('solid foreground completely occludes cloak at its covered pixels',difference(blocked.data,blockedBase,obstructed).changed===0,difference(blocked.data,blockedBase,obstructed));
  check('partly hidden player still refracts visible body',difference(blocked.data,blockedBase,i=>mask(i)&&!obstructed(i)).changed>30,difference(blocked.data,blockedBase,i=>mask(i)&&!obstructed(i)));present(blocked.output,'World-depth partial occlusion');
  foreground.scale.x=30;const hiddenBase=drawBackground({occluder:true}),hidden=draw([mesh],1);check('complete solid occlusion has no cloak pixels',difference(hidden.data,hiddenBase).changed===0,difference(hidden.data,hiddenBase));foreground.scale.x=1;
  drawBackground();const normalData=normals.image.data;for(let i=0;i<width*height;i++)normalData[i*4+3]=-52;normals.needsUpdate=true;const held=draw([mesh],1);check('held-weapon packet cannot be overwritten',difference(held.data,pixels(opaque.texture)).changed===0,difference(held.data,pixels(opaque.texture)));for(let i=0;i<width*height;i++)normalData[i*4+3]=200;normals.needsUpdate=true;
  const mesh2=pose(actors[1],6,[7,-12,0],210);const ordered=draw([mesh,mesh2],1),reversed=draw([mesh2,mesh],1);check('overlapping players choose nearest mesh independent of submission order',difference(ordered.data,reversed.data).maximum<.002,difference(ordered.data,reversed.data));
  const poseFrame=header.frames.findIndex(f=>/run/.test(f.name||''));const animated=pose(actors[0],poseFrame>=0?poseFrame:6,[24,0,0],190,1);const movedMask=silhouette([animated]),moved=draw([animated],1);check('native pose/turn/translation move the refracted silhouette',difference(a.data,moved.data).changed>100&&difference(moved.data,pixels(opaque.texture),i=>!movedMask(i)).changed===0,{frame:actors[0].frame,position:Array.from(actors[0].origin),yaw:190,change:difference(a.data,moved.data)});present(moved.output,'Native running pose, translated and turned');
  for(const side of [-1,1]){const edgeMesh=pose(actors[0],0,[side*112,0,0],270);const edge=draw([edgeMesh],1);check('screen-edge cloak samples stay finite '+side,finite(edge.data)&&maxRGB(edge.data)<1.25,{side,maximum:maxRGB(edge.data)});}
  const empty=draw([],1);check('empty submission returns original scene',empty.output===opaque.texture,{sameTexture:empty.output===opaque.texture});
  cloak.R_CloakReset();check('reset clears all pending silhouettes',!cloak.R_CloakPending(),{status:cloak.R_CloakStatus()});await waitReady();const recovered=draw([pose(actors[0])],1);check('reset/reinitialize does not resurrect previous player',difference(recovered.data,draw([pose(actors[0])],1).data).maximum<.002,{status:cloak.R_CloakStatus()});
  check('all GPU outputs finite and shader compilation clean',finite(a.data)&&finite(blocked.data)&&shaderErrors.length===0&&renderer.getContext().getError()===0,{shaderErrors});
  report.productionStatus=cloak.R_CloakStatus();present(recovered.output);publish((report.failures.length?'FAIL':'PASS')+' — '+report.checks.length+' production GPU checks');
 }catch(error){report.failures.push(String(error.stack||error));publish('FAIL — '+error.message);}finally{busy=false;}
}
function differencePixel(a,b,i){return Math.max(...[0,1,2].map(c=>Math.abs(a[i*4+c]-b[i*4+c])));}
async function motion(){if(busy)return;busy=true;report.frames=[];try{await waitReady();mode.R_AnimSetNewer(true);drawBackground();for(let i=0;i<48;i++){const t=i/24,frame=6+Math.floor(t*10)%6,mesh=pose(actors[0],frame,[Math.sin(t*2)*20,0,0],270+t*45,t);const image=draw([mesh],t);present(image.output);report.frames.push({time:t,frame,origin:Array.from(actors[0].origin),yaw:actors[0].angles[1],glError:renderer.getContext().getError()});await new Promise(r=>setTimeout(r,42));}publish('Rendered 48 native-pose motion frames; browser capture can record the visible canvas');}catch(error){report.failures.push(String(error));publish('FAIL — '+error.message);}finally{busy=false;}}

try{
 const source=await(await fetch('../fieldlab-fx-3d-updated.html')).text();report.reference.actualSha256=await hash(new TextEncoder().encode(source));if(report.reference.actualSha256!==report.reference.expectedSha256)throw Error('Authoritative reference identity changed; review before comparison');
 const packBytes=await(await fetch('../games/shareware/pak0.pak')).arrayBuffer();report.packSha256=await hash(packBytes);pak.COM_AddPack(pak.COM_LoadPackFile('operative-cloak-gpu-native',packBytes));VID_SetPalette(pak.COM_FindFile('gfx/palette.lmp').data);models.Mod_Init();player=models.Mod_ForName('progs/player.mdl',true);header=player.cache.data;
 report.player={name:player.name,frames:header.frames.map((f,i)=>({frame:i,name:f.name})),poses:header.numposes};actors=[new entity_t(),new entity_t()];for(const a of actors)a.model=player;
 if(!vars.Cvar_FindVar(cloak.r_cloak.name))vars.Cvar_RegisterVariable(cloak.r_cloak);vars.Cvar_SetValue('r_cloak',1);
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(width,height);renderer.autoClear=false;renderer.setClearColor(0,0);renderer.debug.onShaderError=(gl,p,v,f)=>shaderErrors.push(gl.getProgramInfoLog(p)+'\n'+gl.getShaderInfoLog(f));document.querySelector('#view').append(renderer.domElement);
 const originalSet=renderer.setRenderTarget.bind(renderer);renderer.setRenderTarget=(target,...args)=>{if(target&&!targets.includes(target))targets.push(target);return originalSet(target,...args);};
 camera=new THREE.PerspectiveCamera(55,width/height,4,2048);camera.up.set(0,0,1);camera.position.set(0,-170,20);camera.lookAt(0,0,8);camera.updateMatrixWorld(true);opaque=textureTarget(true);referenceTarget=textureTarget(true);maskTarget=textureTarget(true);
 const normalData=new Float32Array(width*height*4);for(let i=0;i<width*height;i++)normalData.set([.5,.5,1,200],i*4);normals=new THREE.DataTexture(normalData,width,height,THREE.RGBAFormat,THREE.FloatType);normals.needsUpdate=true;normals.minFilter=normals.magFilter=THREE.NearestFilter;
 const noiseURI=JSON.parse(source.match(/const ASSETS=(\{[^\n]+\});/)[1]).noise;const noise=await new THREE.TextureLoader().loadAsync(noiseURI);noise.wrapS=noise.wrapT=THREE.RepeatWrapping;noise.minFilter=noise.magFilter=THREE.LinearFilter;noise.generateMipmaps=false;noise.flipY=true;noise.colorSpace=THREE.NoColorSpace;
 const shader=name=>source.match(new RegExp('sources\\.'+name+'=GLSL(?:\\+mathGLSL)?\\+`([\\s\\S]*?)`;'))[1];
 const sourceFragment='precision highp float;precision highp sampler2D;\n'+shader('refract'),linearRim=new THREE.Color(.035,.085,.083).convertSRGBToLinear().toArray().map(v=>v.toFixed(12)).join(',');
 referenceMaterial=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:'precision highp float;\n'+shader('meshVert'),fragmentShader:sourceFragment.replace('c+=vec3(.035,.085,.083)','c+=vec3('+linearRim+')'),side:THREE.FrontSide,depthTest:true,depthWrite:true,uniforms:{uVP:{value:new THREE.Matrix4()},uModel:{value:new THREE.Matrix4()},uView:{value:new THREE.Matrix4()},uEye:{value:new THREE.Vector3()},uScene:{value:null},uNoise:{value:noise},uResolution:{value:new THREE.Vector2(width,height)},uParams:{value:new THREE.Vector4(1.6,1,1,1.25)},uTime:{value:0}}});referenceMaterial.onBeforeCompile=()=>{};originalReferenceMaterial=referenceMaterial.clone();originalReferenceMaterial.fragmentShader=sourceFragment;originalReferenceMaterial.onBeforeCompile=()=>{};
 report.render={width,height,fov:55,camera:[0,-170,20],target:[0,0,8],worldScale:cloak.CLOAK.worldScale};report.shaderSha256={vertex:await hash(new TextEncoder().encode(cloak.CLOAK_VERTEX)),fragment:await hash(new TextEncoder().encode(cloak.CLOAK_FRAGMENT))};
 document.querySelector('#run').onclick=run;document.querySelector('#motion').onclick=motion;await waitReady();drawBackground();present(draw([pose(actors[0])],1).output);publish('Ready — native player and production cloak loaded');
}catch(error){report.failures.push(String(error.stack||error));publish('FAIL — '+error.message);}
