import '../src/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/gl_post.js';
import * as main from '../src/gl_rmain.js';
import * as surf from '../src/gl_rsurf.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/cvar.js';
import { r_flashlight } from '../src/r_flashlight.js';
import { r_rockfield } from '../src/r_rockfield.js';
import { r_newer_weapons } from '../src/r_weapons.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette, vid } from '../src/vid.js';
import { cl } from '../src/client.js';
import { r_refdef, entity_t } from '../src/render.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
const W=640,H=400,report=document.querySelector('#report'),button=document.querySelector('#run'),views=document.querySelector('#views');
const errors=[],checks=[];
window.addEventListener('error',e=>errors.push({runtime:e.message}));window.addEventListener('unhandledrejection',e=>errors.push({rejection:String(e.reason)}));let renderer,world,actor,draws=0,composite;
const styles=new Array(64).fill(264),options=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_bounce,post.r_volumetric,post.r_pointshadows,anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water,anim.r_newer_textures,anim.r_newer_enemies,anim.r_newer_shadows,r_rockfield,r_newer_weapons,r_flashlight];
const verify=(value,name,evidence={})=>checks.push({passed:!!value,name,...evidence});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function draw(label,{origin=[1312,1550,-365],angles=[35,90,0],directional=true,classic=false,actorY=1648,volume=0,actorShadows=true,oneFixture=null,isotropic=false}={}){
 cl.time=10;cl.worldmodel=world;r_refdef.vrect.width=W;r_refdef.vrect.height=H;r_refdef.fov_y=65;r_refdef.fov_x=90;r_refdef.vieworg.set(origin);r_refdef.viewangles.set(angles);
 vars.Cvar_SetValue('r_hdr',classic?0:1);vars.Cvar_SetValue('r_volumetric',volume);vars.Cvar_SetValue('r_newer_shadows',1);
 // Baseline deliberately uses the same loaded geometry with source admission
 // absent, reproducing the old helper/clustering path; never alters BSP bytes.
 const sources=post.R_BuildWorldLights(directional?world:{...world,bspSourceBytes:null});
 if(oneFixture!==null){const chosen=sources.find(l=>l.fixture?.face===oneFixture);if(!chosen)throw Error('Missing physical fixture for isolated receiver control');sources.splice(0,sources.length,chosen);if(isotropic){chosen.direction=null;chosen.cone=null;}}
 main.R_SetupFrame();main.R_SetupGL();post.R_PostBegin(renderer,!classic,W,H);
 surf.R_DrawWorld();surf.R_WorldShowAll(true);
 actor.origin.set([1312,actorY,-432-actor.model.mins[2]]);actor.angles.set([0,270,0]);actor.frame=0;
 const mesh=R_DrawAliasModel(actor,actor.model.cache.data,new Float32Array(256).fill(1),0);if(mesh.parent!==main.scene)main.scene.add(mesh);mesh._quakeOwner=actorShadows?actor:null; // controlled caller admission; held caster unchangedmesh.layers.enable(post.SUN_SHADOW_LAYER);mesh.visible=true;
 cl.viewent.origin.set(origin);cl.viewent.angles.set([0,angles[1],0]);cl.stats[0]=100;cl.items=0;main.R_DrawViewModel();
 let frame,target;
 for(let i=0;i<8;i++){
  frame=post.R_PostLightsFrame(renderer,main.scene,main.camera,main.r_visframecount,styles,[],10,false);
  if(!classic)post.R_PostBind(renderer);else renderer.setRenderTarget(null);
  target=renderer.getRenderTarget();renderer.clear();renderer.render(main.scene,main.camera);draws++;
  if(!classic){const render=renderer.render;renderer.render=function(scene,camera){const material=scene.children[0]?.material;if(material?.uniforms?.uLighting&&material?.uniforms?.tNormal)composite=material;return render.call(this,scene,camera);};try{post.R_PostFinish(renderer,main.scene,main.camera,{lx:0,ly:0,lw:W,lh:H},main.r_visframecount,styles,[],10,1,false);}finally{renderer.render=render;}}
 }
 const pixels=new Uint8Array(W*H*4),gl=renderer.getContext();gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
 const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');img.src=renderer.domElement.toDataURL();caption.textContent=label;figure.append(img,caption);views.append(figure);
 let normal=null,albedo=null,incident=null;
 if(!classic){const half=new Uint16Array(W*H*4);albedo=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,half,undefined,1);renderer.readRenderTargetPixels(target,0,0,W,H,albedo,undefined,2);normal=Float32Array.from(half,THREE.DataUtils.fromHalfFloat);}
 if(oneFixture!==null){
  const source=composite.fragmentShader,at=source.lastIndexOf('void main()'),geometry=new THREE.PlaneGeometry(2,2),target=new THREE.WebGLRenderTarget(W,H,{type:THREE.FloatType,depthBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  const material=new THREE.ShaderMaterial({uniforms:composite.uniforms,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:source.slice(0,at)+'void main(){vec3 P=viewPosAt(vUv),N=normalize(texture2D(tNormal,vUv).rgb*2.-1.);if(dot(N,P)>0.)N=-N;gl_FragColor=vec4(pointSurfaceIncident(P,N,0)*pointSurfaceVisibility(P,N,0,1.),pointCone(P,0));}',depthTest:false,depthWrite:false});material.onBeforeCompile=()=>{};
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(geometry,material));renderer.setRenderTarget(target);renderer.render(scene,new THREE.OrthographicCamera(-1,1,1,-1,0,2));draws++;incident=new Float32Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,incident);renderer.setRenderTarget(null);material.dispose();geometry.dispose();target.dispose();
 }
 return {pixels,frame,sources,normal,albedo,incident,camera:main.camera.clone(),glError:gl.getError(),shadow:post.R_PointShadowStatus()};
}
function difference(a,b){let changed=0,energy=0;for(let i=0;i<a.pixels.length;i++)if(i%4!==3){const d=Math.abs(a.pixels[i]-b.pixels[i]);if(d>2)changed++;energy+=d;}return{changed,energy};}
async function run(){button.disabled=true;checks.length=0;views.replaceChildren();const start=performance.now(),identity=await hash(world.bspSourceBytes),original=world.bspSourceBytes.slice();
 try{
  const before=draw('Flat corridor: original isotropic helpers/clusters',{directional:false}),after=draw('Flat corridor: six physical downward cones',{directional:true});
  const fixtures=after.sources.filter(l=>l.fixture);verify(fixtures.length===6,'six source-bound native fixtures',{fixtures:fixtures.map(l=>({position:l.pos,face:l.fixture.face,power:l.power,cone:l.cone}))});
  const changed=difference(before,after);verify(changed.changed>100,'actual floor presentation changes with fixture cones',changed);
  const ramp=draw('Ramp: fixture pools',{origin:[1312,1200,-245],angles:[30,270,0],actorY:3000});
  const blocked=draw('Native actor: shadows enabled',{actorY:1648}),noActorShadow=draw('Same posed native actor: caster toggle off',{actorY:1648,actorShadows:false});
  let groundChanged=0,groundEnergy=0; // opaque world tag=1; aliases use .06/.08
  for(let i=0;i<W*H;i++){if(blocked.albedo[i*4+3]<250||noActorShadow.albedo[i*4+3]<250||blocked.normal[i*4+3]<=0||noActorShadow.normal[i*4+3]<=0)continue;let d=0;for(let c=0;c<3;c++)d+=Math.abs(blocked.pixels[i*4+c]-noActorShadow.pixels[i*4+c]);if(d>6)groundChanged++;groundEnergy+=d;}
  verify(groundChanged>10&&blocked.shadow.pointDynamicMeshes>0,'fixed native actor changes world receiver shadow pixels; actor pixels excluded',{groundChanged,groundEnergy});
  const moved=draw('Native actor moved aside',{actorY:1800});
  const single=draw('Isolated native fixture: downward cone',{actorY:2000,oneFixture:2763}),isotropic=draw('Same native fixture: isotropic control',{actorY:2000,oneFixture:2763,isotropic:true});
  function roi(image,point){const p=new THREE.Vector3(...point).project(image.camera),x=Math.round((p.x*.5+.5)*W),y=Math.round((p.y*.5+.5)*H);let count=0,sum=0,linear=0,cone=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const px=x+dx,py=y+dy;if(px<0||py<0||px>=W||py>=H)continue;const i=(py*W+px)*4;if(image.normal[i+3]<=0||image.albedo[i+3]<250)continue;count++;sum+=image.pixels[i]+image.pixels[i+1]+image.pixels[i+2];linear+=image.incident[i]+image.incident[i+1]+image.incident[i+2];cone+=image.incident[i+3];}return{point,ndc:p.toArray(),pixels:count,mean:sum/Math.max(1,count),linear:linear/Math.max(1,count),cone:cone/Math.max(1,count)};}
  const inside=[1340,1648,-431],outside=[1312,1740,-431],innerCone=roi(single,inside),innerPoint=roi(isotropic,inside),outerCone=roi(single,outside),outerPoint=roi(isotropic,outside);
  verify(innerCone.pixels>=10&&outerCone.pixels>=10&&innerCone.linear>1e-5&&Math.abs(innerCone.linear-innerPoint.linear)<innerPoint.linear*.05&&innerCone.cone>.99&&outerCone.cone<.001&&outerPoint.linear>1e-5&&outerCone.linear<outerPoint.linear*.01,'native floor pool retains core and rejects outside-cone light',{innerCone,innerPoint,outerCone,outerPoint});
  const volume=draw('Bounded directional shafts',{actorY:1800,volume:1});
  const classicBefore=draw('Classic original control',{classic:true,directional:false,actorY:1800}),classicAfter=draw('Classic fixture metadata control',{classic:true,directional:true,actorY:1800});
  const classic=difference(classicBefore,classicAfter);verify(classic.energy===0,'Classic pixels unchanged by optional fixture metadata',classic);
  verify([before,after,ramp,blocked,noActorShadow,moved,single,isotropic,volume,classicBefore,classicAfter].every(r=>r.glError===0)&&errors.length===0,'world/alias/volume compositor shader and GL controls',{errors});
  verify(after.frame.lights.length<=8&&after.shadow.maxSlots===8,'existing eight source/cube slots remain bounded',{selected:after.frame.lights.length,shadow:after.shadow});
  verify(world.bspSourceBytes.every((v,i)=>v===original[i]),'native BSP bytes unchanged');
 }catch(error){checks.push({passed:false,name:String(error),stack:error.stack});}
 finally{renderer.setRenderTarget(null);button.disabled=false;}
 const result={status:checks.every(c=>c.passed)?'PASS':'FAIL',source:identity,draws,elapsedMs:performance.now()-start,checks,scope:'Actual native world and MDL production rendering with controlled cameras/actor placement; not gameplay navigation or combat qualification.'};report.textContent=JSON.stringify(result,null,2);window.fixtureLightingResult=result;
}
try{
 main.R_Init();for(const c of options)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
 for(const [name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_bounce:0,r_volumetric:0,r_pointshadows:1,r_newer_lighting:1,r_newer_normals:0,r_newer_water:0,r_newer_textures:0,r_newer_enemies:0,r_rockfield:0,r_newer_shadows:1,r_newer_weapons:0,r_flashlight:0}))vars.Cvar_SetTemporary(name,String(value));
 const response=await fetch(new URL('../pak0.pak',import.meta.url));if(!response.ok)throw Error('Bundled native pack missing');COM_AddPack(COM_LoadPackFile('pak0.pak',await response.arrayBuffer()));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);vid.fullbright=224;Mod_Init();
 world=Mod_ForName('maps/e1m1.bsp',true);cl.worldmodel=world;cl.model_precache[1]=world;cl.model_precache[2]=null;main.R_NewMap();
 actor=new entity_t();actor.model=Mod_ForName('progs/soldier.mdl',true);cl.viewent.model=Mod_ForName('progs/v_shot.mdl',true);
 renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.autoClear=false;renderer.setClearColor(0,0);
 renderer.debug.onShaderError=(gl,p,v,f)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(v),fragment:gl.getShaderInfoLog(f)});
 button.addEventListener('click',run);button.disabled=false;report.textContent='Ready: run native fixture checks.';
}catch(error){report.textContent=String(error.stack||error);window.fixtureLightingResult={status:'FAIL',error:String(error)};}
window.addEventListener('pagehide',()=>{for(const c of options)vars.Cvar_RestoreTemporary(c.name);renderer?.dispose();});
