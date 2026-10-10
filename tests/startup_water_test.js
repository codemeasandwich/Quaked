// Public startup scheduling with real Three cube cameras. The recording render
// endpoint counts complete six-face captures; it does not assert GPU pixels.
await import('../src/engine/render/gl_rsurf.js');
const THREE=await import('three'),post=await import('../src/newer/render/gl_post.js'),mode = await import('../src/newer/mode.js'),vars=await import('../src/engine/common/cvar.js'),probes=await import('../src/newer/render/r_waterprobe.js');
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
function fixture(fn){
 const clock=Object.getOwnPropertyDescriptor(performance,'now');let now=600000;Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 const scene=new THREE.Scene(),weapon=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());weapon.userData.quakeViewmodel=true;scene.add(weapon);
 const camera=new THREE.PerspectiveCamera(100,1.6,4,4096);camera.up.set(0,0,1);camera.position.set(0,-300,120);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const original={},renderer={coordinateSystem:THREE.WebGLCoordinateSystem,capabilities:{isWebGL2:true},extensions:{has:()=>true},xr:{enabled:true},target:original,face:3,mip:2,draws:[],fail:false,
 getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.mip;},setRenderTarget(t,f=0,m=0){this.target=t;this.face=f;this.mip=m;},setViewport(){},
 render(s,c){same(s,scene,'capture retains actual source scene');same(weapon.visible,false,'held gun excluded from cached environment');this.draws.push(c.getWorldPosition(new THREE.Vector3()).toArray());if(this.fail)throw Error('deliberate water capture failure');}};
 const regions=[-110,110,250].map(x=>({min:[x-35,-50],max:[x+35,50],z:0,kind:0,probePoints:[[x,0,6]]})),visibility=[],showAll=v=>visibility.push(v);
 probes.R_WaterProbeClear();try{return fn({scene,weapon,camera,renderer,original,regions,visibility,showAll,advance:n=>now+=n});}
 finally{probes.R_WaterProbeClear();weapon.geometry.dispose();weapon.material.dispose();if(clock)Object.defineProperty(performance,'now',clock);else delete performance.now;}
}
Deno.test('intro captures one actual missing eligible water cube per call without wall-clock delay and retains the two-pool budget',()=>fixture(f=>{
 const {renderer,scene,camera,regions,showAll}=f,unsafe={...regions[0],probePoints:[]},offscreen={min:[20000,0],max:[20100,100],z:0,kind:0};
 same(probes.R_WaterProbeReadiness(camera,regions).pending,2,'both nearest visible pools truly pending');
 probes.R_WaterProbeUpdate(renderer,scene,camera,[unsafe,...regions],showAll,regions,{initializing:true});same(renderer.draws.length,6,'first intro call captures exactly one cube');same(probes.R_WaterProbeReadiness(camera,regions).pending,1,'second pool remains pending until drawn');same(probes.R_WaterProbeFor(unsafe),null,'no unsafe placeholder capture');same(probes.R_WaterProbeFor(regions[0]).center.join(),'-110,0,6','capture uses actual verified pool anchor');
 probes.R_WaterProbeUpdate(renderer,scene,camera,regions,showAll,regions,{initializing:true});same(renderer.draws.length,12,'next call at same clock captures second cube');same(probes.R_WaterProbeReadiness(camera,regions).pending,0,'pending clears only after both real captures');same(probes.R_WaterProbes().length,2,'bounded cache retained');
 probes.R_WaterProbeUpdate(renderer,scene,camera,regions,showAll,regions,{initializing:true});same(renderer.draws.length,12,'ready cubes never captured again');same(probes.R_WaterProbeFor(regions[2]),null,'third candidate does not churn bounded cache');
 probes.R_WaterProbeClear();probes.R_WaterProbeUpdate(renderer,scene,camera,[offscreen,regions[0]],showAll,regions,{initializing:true});same(probes.R_WaterProbeFor(offscreen),null,'offscreen pool cannot gain false ready capture');same(renderer.draws.length,18,'visible candidate still captures exactly one cube');
 same(renderer.target,f.original,'target restored');same(renderer.face,3,'cube face restored');same(renderer.mip,2,'mip restored');same(renderer.xr.enabled,true,'XR state restored');same(f.visibility.join(),'true,false,true,false,true,false','world visibility paired per actual capture');
}));
Deno.test('ordinary water throttle remains one second and map clear immediately admits a fresh first capture',()=>fixture(f=>{
 const {renderer,scene,camera,regions,showAll}=f;const update=all=>probes.R_WaterProbeUpdate(renderer,scene,camera,regions,showAll,all);
 update(regions);same(renderer.draws.length,6,'ordinary first capture');update(regions);f.advance(999);update(regions);same(renderer.draws.length,6,'normal frames retain original throttle');f.advance(1);update(regions);same(renderer.draws.length,12,'second ordinary pool after one second');
 probes.R_WaterProbeClear();update(regions);same(renderer.draws.length,18,'explicit clear resets cooldown without changing clock');const first=probes.R_WaterProbeFor(regions[0]);let disposed=0;first.rt.addEventListener('dispose',()=>disposed++);update(regions.slice());same(disposed,1,'new map identity disposes old cached cube');same(renderer.draws.length,24,'new map identity immediately captures fresh world at same time');
}));
Deno.test('failed intro water capture stays pending, restores caller state and retries on the next bounded call',()=>fixture(f=>{
 const {renderer,scene,camera,regions,showAll}=f;renderer.fail=true;let error;try{probes.R_WaterProbeUpdate(renderer,scene,camera,regions,showAll,regions,{initializing:true});}catch(e){error=e;}
 same(error?.message,'deliberate water capture failure','original rendering failure propagates');same(probes.R_WaterProbes().length,0,'failed cube is never published ready');same(probes.R_WaterProbeReadiness(camera,regions).pending,2,'readiness retains real missing work');same(f.weapon.visible,true,'held weapon restored after error');same(renderer.target,f.original,'target restored after error');same(renderer.face,3,'face restored after error');same(renderer.mip,2,'mip restored after error');same(renderer.xr.enabled,true,'XR restored after error');same(f.visibility.join(),'true,false','world visibility restored after error');
 renderer.fail=false;probes.R_WaterProbeUpdate(renderer,scene,camera,regions,showAll,regions,{initializing:true});same(renderer.draws.length,7,'one failed draw then complete six-face retry at same clock');same(probes.R_WaterProbeReadiness(camera,regions).pending,1,'only actual successfully captured pool becomes ready');
}));
Deno.test('actual post water entry waits for final intro assets while retaining readiness and respecting ordinary and disabled paths',()=>fixture(f=>{
 const options=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,post.r_reflect,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_water];for(const v of options)if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);const saved=options.map(v=>v.string);
 const leaf={contents:-1,visframe:0},model={entities:'',firstmodelsurface:0,nummodelsurfaces:1,numleafs:1,nodes:[leaf],leafs:[{contents:-2},leaf],surfaces:[{flags:0,plane:{normal:[0,0,1],dist:0},texinfo:{texture:{name:'*water1'}},polys:{numverts:4,verts:[[-128,-128,0,0,0],[128,-128,0,1,0],[128,128,0,1,1],[-128,128,0,0,1]],next:null}}]};
 try{
  for(const v of options)vars.Cvar_SetValue(v.name,0);for(const name of ['r_hdr','r_reflect','r_newer_water'])vars.Cvar_SetValue(name,1);post.R_BuildWorldLights(model);post.R_PostBegin(f.renderer,true,320,200);
  same(post.R_WaterActive(),true,'real enhanced water pipeline active');same(post.R_WaterStartupStatus(f.camera).pending,1,'public startup status sees actual required pool');
  for(let i=0;i<3;i++)post.R_WaterProbesFrame(f.renderer,f.scene,f.camera,f.showAll,{initializing:true,ready:false});same(f.renderer.draws.length,0,'unsettled enabled art prevents stale cached captures');same(post.R_WaterStartupStatus(f.camera).pending,1,'waiting never zeroes or fakes missing probe work');
  post.R_WaterProbesFrame(f.renderer,f.scene,f.camera,f.showAll,{initializing:true,ready:true});same(f.renderer.draws.length,6,'ready transition captures actual final scene');same(post.R_WaterStartupStatus(f.camera).ready,1,'real capture alone marks ready');
  probes.R_WaterProbeClear();post.R_WaterProbesFrame(f.renderer,f.scene,f.camera,f.showAll,{ready:false});same(f.renderer.draws.length,12,'ordinary gameplay is not gated by intro-only readiness option');
  probes.R_WaterProbeClear();vars.Cvar_SetValue('r_newer_water',0);post.R_WaterProbesFrame(f.renderer,f.scene,f.camera,f.showAll,{initializing:true,ready:true});same(f.renderer.draws.length,12,'disabled feature remains disabled');same(post.R_WaterStartupStatus(f.camera).pending,0,'disabled water does not block loading');
 }finally{post.R_PostBegin(f.renderer,false,0,0);post.R_PostShutdown();post.R_BuildWorldLights(null);options.forEach((v,i)=>vars.Cvar_Set(v.name,saved[i]));}
}));
