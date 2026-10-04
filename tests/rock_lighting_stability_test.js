import * as THREE from 'three';
import * as rock from '../src/r_rockfield.js';
import {ROCK_PARALLAX_GLSL,ROCK_GLSL} from '../src/r_rockshader.js';
import * as vars from '../src/cvar.js';
import * as anim from '../src/r_anim.js';
import * as post from '../src/gl_post.js';
import {createQuakeLightmapMaterial} from '../src/gl_rsurf.js';
const check=(v,label)=>{if(!v)throw new Error(label);};
const face=(points,uv)=>({visframe:7,flags:0,plane:{normal:[0,-1,0],dist:0},texinfo:{texture:{name:'rock1_2',width:64,height:64}},polys:{numverts:points.length,verts:new Float32Array(points.flatMap((p,i)=>[...p,...uv[i],0,0]))}});
function clip(origin,proposed,edges){const delta=proposed.map((v,k)=>v-origin[k]);let limit=1;for(const e of edges){const distance=e[0]*origin[0]+e[1]*origin[1]+e[2],travel=e[0]*delta[0]+e[1]*delta[1];if(distance<-.00001){limit=0;break;}if(travel<-.000001)limit=Math.min(limit,Math.max(0,distance)/(Math.max(0,distance)-travel));}return origin.map((v,k)=>v+delta[k]*limit);}
Deno.test('native-face projection constraints preserve landmark samples inside convex faces at folds for both windings without changing field or UVs',()=>{
 const points=[[0,0,0],[256,0,0],[256,0,256],[0,0,256]],uv=[[0,0],[2,1],[1,3],[-1,2]];
 for(const reverse of [false,true]){const f=face(reverse?points.toReversed():points,reverse?uv.toReversed():uv),saved=Array.from(f.polys.verts),edges=rock.R_RockProjectionEdges(f);
  for(let i=0;i<100;i++){const a=(i%10+.5)/10,b=(Math.floor(i/10)+.5)/10,origin=[2*a-b,a+2*b];for(const delta of [[20,0],[-20,0],[0,20],[0,-20],[30,30]]){const hit=clip(origin,origin.map((v,k)=>v+delta[k]),edges);check(edges.every(e=>e[0]*hit[0]+e[1]*hit[1]+e[2]>=-1e-6),'projected pigment stays on its own face');}}
  check(saved.every((v,i)=>v===f.polys.verts[i]),'native polygon/UV immutable');
 }
 const degenerate=face(points,[[0,0],[0,0],[0,0],[0,0]]);check(clip([0,0],[100,100],rock.R_RockProjectionEdges(degenerate)).every(v=>v===0),'invalid projection safe-neutral');
 check(ROCK_GLSL.includes('qrRockClipEdge')&&ROCK_PARALLAX_GLSL.includes('qrRockClipUv(vMapUv,vMapUv+qrRockUvShift)'),'actual shader uses face constraints');
});
Deno.test('a whole visible distant cliff retains every height page when walking backward and looking away nearby; far invisible surfaces stop requesting',()=>{
 const variables=[post.r_hdr,anim.r_newer_normals,rock.r_rockfield],saved=variables.map(v=>v.string),previous=globalThis.Worker,workers=[];
 variables.forEach(v=>{if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);vars.Cvar_SetValue(v.name,1);});anim.R_AnimSetClassicPass(false);
 globalThis.Worker=class{postMessage(job){this.job=job;}terminate(){this.stopped=true;}constructor(){workers.push(this);}};
 try{
  rock.R_RockfieldSetLimits({getContext:()=>({MAX_ARRAY_TEXTURE_LAYERS:1,getParameter:()=>1024})});
  const f=face([[0,0,0],[4096,0,0],[4096,0,1024],[0,0,1024]],[[0,0],[64,0],[64,16],[0,16]]);rock.R_RockfieldBuild({name:'maps/visible-cliff-test.bsp',surfaces:[f]});
  for(let i=0;i<500;i++){rock.R_RockfieldUpdate([2048,-3000,512],7,i*101);for(const worker of workers)if(worker.job){const j=worker.job;worker.job=null;worker.onmessage({data:{id:j.id,result:{tileX:j.x,tileY:j.y,width:rock.ROCK_SIDE,data:new Float32Array(rock.ROCK_SIDE**2).fill(.5)}}});}if(!rock.R_RockfieldStatus().missingVisibleTiles)break;}
  rock.R_RockfieldUpdate([2048,-4000,512],7,60000);let status=rock.R_RockfieldStatus();check(status.resident>96&&status.missingVisibleTiles===0&&status.overflowTiles===0,'whole visible cliff present beyond previous fade/cutoff');const initial=status.resident;
  rock.R_RockfieldUpdate([2048,-8000,512],7,60101);status=rock.R_RockfieldStatus();check(status.resident===initial&&status.missingVisibleTiles===0,'walking backward retains full visible chart');
  f.visframe=0;rock.R_RockfieldUpdate([10,-20,512],8,60202);check(rock.R_RockfieldStatus().desiredTiles>96,'immediate region kept when looking away');
  rock.R_RockfieldUpdate([2048,-8000,512],8,60303);check(rock.R_RockfieldStatus().desiredTiles===0,'distant invisible fields no new work');
  check(!/smoothstep\(900\.,1600\./.test(ROCK_PARALLAX_GLSL),'actual macro amplitude never fades by player distance');
 }finally{rock.R_RockfieldBuild(null);globalThis.Worker=previous;variables.forEach((v,i)=>vars.Cvar_Set(v.name,saved[i]));}
});
Deno.test('actual rock shader binds original face planes and bounds only projection while lighting bounce uses stable samples and normal packets use nearest data',()=>{
 const f=face([[0,0,0],[256,0,0],[256,0,256],[0,0,256]],[[0,0],[4,0],[4,4],[0,4]]);rock.R_RockfieldBuild({name:'maps/clip-test.bsp',surfaces:[f]});
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(f.polys.verts.filter((_,i)=>i%7<3),3));check(rock.R_RockfieldGeometry(geometry,f),'native metadata attached');for(let i=0;i<6;i++)check(geometry.attributes['rockClip'+i].itemSize===3,'actual face clipping attributes');
 const texture=new THREE.Texture(),material=createQuakeLightmapMaterial(texture,new THREE.Texture());material.userData.rockField=true;post.R_RegisterDetail(material,texture);const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};material.onBeforeCompile(shader);check(shader.fragmentShader.includes('pUv=qrRockClipUv(vMapUv,pUv)'),'macro AND micro final lookup clipped');check(shader.fragmentShader.includes('conditioning>.03')&&shader.fragmentShader.includes('.75/max(magnitude'),'ill-conditioned fold cannot amplify pigment into multiple copies');
 const aoExpression=[...shader.fragmentShader.matchAll(/qrRockAO=([^;]+);/g)].at(-1)[1];const ao=new Function('cavity','qrRockAmp','max','exp','return '+aoExpression);check(ao(0,.8,Math.max,Math.exp)===1,'unoccluded peaks are not dimmed');check(ao(.7,.8,Math.max,Math.exp)>=.18,'deep cavities retain readable pigment');check(ao(.08,.8,Math.max,Math.exp)<ao(.08,.1,Math.max,Math.exp),'saved depth strengthens cavity shading without a camera-distance term');
 material.dispose();texture.dispose();geometry.dispose();rock.R_RockfieldBuild(null);
});
