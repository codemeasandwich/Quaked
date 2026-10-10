// Actual registered id1 face5570 was the first shipped over-budget plaque.
// The fixture supplies a source-bound record for this one original surface;
// it does not depend on an in-progress corpus bake or mutate its artifacts.
import {openSync,readSync,closeSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {COM_AddPack,COM_LoadPackFile,COM_FindFile} from '../src/engine/common/pak.js';
import {VID_SetPalette} from '../src/vid.js';
import {Mod_Init,Mod_ForName} from '../src/gl_model.js';
import {cl} from '../src/client.js';
import {entity_t,r_refdef} from '../src/render.js';
import * as world from '../src/gl_rsurf.js';
import * as main from '../src/gl_rmain.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import {R_DemonSurfaceData} from '../src/r_demonrelief.js';
import {DemonBakeEncode,DemonSurfaceSignature,DemonFieldSettings} from '../src/demon_bake_format.js';
import {R_DemonBakePrefetch,R_DemonBakePrepare,R_DemonBakeSurface,R_DemonBakeRelease} from '../src/r_demonbakes.js';
import {DEMON_BAKES} from '../src/demon_bakes.js';
import {R_IntroReadinessChecks} from '../src/r_demoloading.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),read=p=>readFileSync(new URL('../'+p,import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
function member(path,name){const fd=openSync(new URL('../'+path,import.meta.url),'r');try{const h=Buffer.alloc(12);readSync(fd,h,0,12,0);same(h.toString('ascii',0,4),'PACK','original archive');const size=h.readInt32LE(8),dir=Buffer.alloc(size);same(readSync(fd,dir,0,size,h.readInt32LE(4)),size,'complete directory');for(let i=0;i<size;i+=64)if(dir.subarray(i,i+56).toString().split('\0')[0]===name){const n=dir.readInt32LE(i+60),bytes=Buffer.alloc(n);same(readSync(fd,bytes,0,n,dir.readInt32LE(i+56)),n,'complete original BSP');return bytes;}throw Error('Missing native member '+name);}finally{closeSync(fd);}}
Deno.test('actual E3M4 face5570 native-only outcome completes world/shadow readiness without regeneration or changing native backing',async()=>{
 const palette=read('pak0.pak');COM_AddPack(COM_LoadPackFile('native-only-palette',ab(palette)));VID_SetPalette(COM_FindFile('gfx/palette.lmp').data);const name='maps/e3m4.bsp',source=member('resources/id1/pak0.pak',name);COM_AddPack({data:ab(source),files:[{name,filepos:0,filelen:source.length}]});Mod_Init();const model=Mod_ForName(name,true);cl.worldmodel=model;cl.model_precache[1]=model;cl.model_precache[2]=null;
 let group;const originalAdd=THREE.Group.prototype.add;THREE.Group.prototype.add=function(...o){if(this.name==='quake_world')group=this;return originalAdd.apply(this,o);};try{world.GL_BuildLightmaps();}finally{delete THREE.Group.prototype.add;}
 const face=model.surfaces[5570],oldTexinfo=face.texinfo,recipe=JSON.parse(read('newer/textures/index.json')).normals[face.texinfo.texture.name];check(recipe?.displacement&&face.polys&&group,'actual original target and authored recipe exist');const raw=read('newer/textures/'+recipe.dataFile),field={width:256,height:512,sampling:recipe.sampling,data:Float32Array.from({length:256*512},(_,i)=>raw.readUInt16LE(i*2)/65535),displacement:{...recipe.displacement}},texture=face.texinfo.texture.gl_texture.clone();texture.userData={...texture.userData,newerHeight:field};face.texinfo={...face.texinfo,texture:{...face.texinfo.texture,gl_texture:texture}};
 const nativePoly=Buffer.from(face.polys.verts.buffer,face.polys.verts.byteOffset,face.polys.verts.byteLength).toString('hex'),hulls=JSON.stringify(model.hulls),diagnostic={};same(R_DemonSurfaceData(face,diagnostic),null,'actual target exceeds triangle budget');same(JSON.stringify(diagnostic),JSON.stringify({reason:'triangle-budget',required:315604,limit:262144}),'actual corpus failure remains a documented fixed-limit outcome');
 const record={signature:DemonSurfaceSignature(face),settings:DemonFieldSettings(field),fieldSha256:sha(new Uint8Array(field.data.buffer)),data:null,nativeOnly:diagnostic},payload=DemonBakeEncode({model:name,bspSha256:sha(source)},[record]),prior=DEMON_BAKES[name];DEMON_BAKES[name]=[{bspSha256:sha(source),file:'native-only-e3m4-test.gz',sha256:'fixture',rawSha256:sha(payload)}];
 const controls=[post.r_hdr,anim.r_newer_normals,anim.r_newer_textures];for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);const previous=controls.map(c=>c.string);let generatorReads=0;
 try{anim.R_AnimSetClassicPass(false);controls.forEach(c=>vars.Cvar_SetValue(c.name,1));vars.Cvar_SetValue('r_newer_normals',0);const baseTriangles=post.R_BuildSunOccluder(model);vars.Cvar_SetValue('r_newer_normals',1);field.data.every=()=>{generatorReads++;throw Error('Native-only must never regenerate budget-rejected surface');};
  const entry=R_DemonBakePrefetch(name,model.bspSourceBytes,async()=>ab(payload));await entry.promise;same(entry.status,'ready','exact source-bound record ready');R_DemonBakePrepare(model,[face]);for(let i=0;i<100&&R_DemonBakeSurface(face).status==='loading';i++)await new Promise(r=>setTimeout(r,0));same(R_DemonBakeSurface(face).status,'native','actual field source validated');
  main.set_r_worldentity(new entity_t());main.set_r_viewleaf(null);r_refdef.vieworg.set([0,0,0]);main.d_lightstylevalue.fill(264);world.R_MarkLeaves();world.R_DrawWorld();const status=world.R_DemonReliefStatus();same(status.nativeOnly,1,'actual world accounts separately for original native geometry');same(status.ready,0,'native backing is not falsely counted as a sculpt mesh');same(status.pending,0,'recognized outcome does not hold scene forever');same(status.preparedPending,0,'prepared transport is really complete');same(status.errors.length,0,'recognized limit is not a corruption error');check(!R_IntroReadinessChecks({demon:status}).pending.includes('sculpted surfaces'),'actual readiness collector accepts complete explicit native outcome');same(group.children.filter(m=>m.material?.userData.realDisplacement).length,0,'no fabricated sculpt geometry');same(post.R_BuildSunOccluder(model),baseTriangles,'sun retains exact original triangle count');same(generatorReads,0,'actual world and sun never retry expensive generation');
  same(Buffer.from(face.polys.verts.buffer,face.polys.verts.byteOffset,face.polys.verts.byteLength).toString('hex'),nativePoly,'native polygon bytes unchanged');same(JSON.stringify(model.hulls),hulls,'native collision hulls unchanged');console.log('NATIVE_ONLY_PROOF '+JSON.stringify({map:name,face:5570,bspSha256:sha(source),diagnostic,status,baseTriangles,generatorReads}));
 }finally{R_DemonBakeRelease();if(prior)DEMON_BAKES[name]=prior;else delete DEMON_BAKES[name];delete field.data.every;face.texinfo=oldTexinfo;texture.dispose();controls.forEach((c,i)=>vars.Cvar_Set(c.name,previous[i]));anim.R_AnimSetClassicPass(false);}
});
