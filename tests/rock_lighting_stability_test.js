import * as THREE from 'three';
import * as rock from '../src/newer/render/r_rockfield.js';
import {ROCK_PARALLAX_GLSL,ROCK_GLSL} from '../src/newer/render/r_rockshader.js';
import * as vars from '../src/engine/common/cvar.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as post from '../src/newer/render/gl_post.js';
import {createQuakeLightmapMaterial} from '../src/engine/render/gl_rsurf.js';
const check=(v,label)=>{if(!v)throw new Error(label);};
const face=(points,uv)=>({visframe:7,flags:0,plane:{normal:[0,-1,0],dist:0},texinfo:{texture:{name:'rock1_2',width:64,height:64}},polys:{numverts:points.length,verts:new Float32Array(points.flatMap((p,i)=>[...p,...uv[i],0,0]))}});
// A face's UV polygon is not a material boundary: repeating textures extend
// across BSP subdivisions. The independent GPU continuity trial tests this
// behavior by comparing unsplit and T-junction meshes pixel-for-pixel.
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
Deno.test('actual rock shader preserves continuous repeat sampling and bounds only projection while lighting bounce uses stable samples and normal packets use nearest data',()=>{
 const f=face([[0,0,0],[256,0,0],[256,0,256],[0,0,256]],[[0,0],[4,0],[4,4],[0,4]]);rock.R_RockfieldBuild({name:'maps/clip-test.bsp',surfaces:[f]});
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(f.polys.verts.filter((_,i)=>i%7<3),3));check(rock.R_RockfieldGeometry(geometry,f),'native metadata attached');check(!Object.keys(geometry.attributes).some(k=>k.startsWith('rockClip')),'no per-polygon clipping metadata');
 const texture=new THREE.Texture(),material=createQuakeLightmapMaterial(texture,new THREE.Texture());material.userData.rockField=true;post.R_RegisterDetail(material,texture);const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};material.onBeforeCompile(shader);check(!shader.fragmentShader.includes('qrRockClip'),'internal polygon edges never constrain pigment');check(shader.fragmentShader.includes('qrHeightGradients(-vViewPosition,vRockUv,qrRockN'),'reuse physical gradients for normals and rays');check(!shader.fragmentShader.includes('conditioning')&&shader.fragmentShader.includes('.75/max(magnitude'),'bounded physical projection cannot amplify pigment through a singular UV inverse');
 const aoExpression=[...shader.fragmentShader.matchAll(/qrRockAO=([^;]+);/g)].at(-1)[1];const ao=new Function('cavity','qrRockAmp','max','exp','return '+aoExpression);check(ao(0,.8,Math.max,Math.exp)===1,'unoccluded peaks are not dimmed');check(ao(.7,.8,Math.max,Math.exp)>=.18,'deep cavities retain readable pigment');check(ao(.08,.8,Math.max,Math.exp)<ao(.08,.1,Math.max,Math.exp),'saved depth strengthens cavity shading without a camera-distance term');
 material.dispose();texture.dispose();geometry.dispose();rock.R_RockfieldBuild(null);
});
