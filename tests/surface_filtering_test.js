// Public generated normals, material compiler and compositor contracts.
// Pixel behavior is checked separately by surface_filtering_gpu_trial.html.
import * as THREE from 'three';
import * as post from '../src/gl_post.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import * as heights from '../src/r_heightshadows.js';
import { createQuakeLightmapMaterial } from '../src/engine/render/gl_rsurf.js';
import { R_NormalsFromHeight, R_NormalsFromCraftedHeight } from '../src/gl_normals.js';
const check=(v,m)=>{if(!v)throw new Error(m);}, same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
const controls=[post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water,heights.r_heightshadows];
for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
function mock(){let target=null;return {capabilities:{isWebGL2:true},extensions:{has:()=>true},getRenderTarget:()=>target,setRenderTarget:t=>{target=t;},setViewport(){},render(scene){this.material=scene.children[0]?.material;}};}
function fixture(fn){const saved=controls.map(c=>c.string),classic=post.classicLook.value;const renderer=mock();try{for(const c of controls)vars.Cvar_SetValue(c.name,1);for(const n of ['r_dynres','r_bloom','r_volumetric'])vars.Cvar_SetValue(n,0);anim.R_AnimSetClassicPass(false);post.classicLook.value=0;post.R_PostBegin(renderer,true,128,128);fn(renderer);}finally{post.R_PostShutdown();controls.forEach((c,i)=>vars.Cvar_Set(c.name,saved[i]));post.classicLook.value=classic;anim.R_AnimSetClassicPass(false);}}
function compile(material){const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};material.onBeforeCompile(shader);return shader;}
const slopes=rgba=>Array.from({length:rgba.length/4},(_,i)=>Math.hypot(rgba[i*4]/127.5-1,rgba[i*4+1]/127.5-1)/(rgba[i*4+2]/127.5-1));

Deno.test('fallback normals bound painted-grain slope while preserving scalar heights, direction and crafted relief',()=>{
 const receipts=[];
 for(const size of [32,128,256]){
  const h=Float32Array.from({length:size*size},(_,i)=>{const x=i%size,y=Math.floor(i/size);return (x%8<4?.8:.1)+(y%16<8?.1:0);}),before=h.slice();
  const normal=R_NormalsFromHeight(h,size,size),tilts=slopes(normal);let maxError=0;
  // RGBA8 quantization permits at most roughly .01 slope error near the .5 cap.
  check(Math.max(...tilts)<=.51,'generated fallback never approaches grazing facets at '+size);check(Math.max(...tilts)>.25,'painted relief is retained at '+size);
  for(let i=0;i<h.length;i++){same(h[i],before[i],'input scalar immutable');const expected=Math.round((h[i]-.1)/.8*255);maxError=Math.max(maxError,Math.abs(normal[i*4+3]-expected));}
  check(maxError<=1,'height alpha is unchanged apart from existing range normalization');
  const x=3,y=3,i=(y*size+x)*4;check(normal[i]>127&&normal[i+2]>127,'downward height edge retains correct tangent-normal direction');
  receipts.push({size,maxSlope:Math.max(...tilts),alphaMaxError:maxError});
 }
 const h=Float32Array.from({length:128*128},(_,i)=>i%128<64?0:1),crafted=R_NormalsFromCraftedHeight(h,128,128,20,1.1);
 check(Math.max(...slopes(crafted))>.9,'authored crafted relief retains its separate stronger cap');
 console.log('SURFACE_FALLBACK_NORMAL_BOUNDS '+JSON.stringify(receipts));
});

Deno.test('actual world shader variants filter micro shadows with stable derivatives and isolate replacement pigment from native and Classic',()=>fixture(()=>{
 const receipts=[];
 for(const kind of ['ordinary','rock','carved','sculpted','physical','no-normal']){
  const diffuse=new THREE.DataTexture(new Uint8Array([80,120,60,255]),1,1),normal=new THREE.DataTexture(new Uint8Array([128,128,255,128]),1,1),lightmap=new THREE.Texture();normal.userData.heightSource=true;diffuse._normalMap=normal;
  if(kind==='carved'){normal.userData.referenceHeight=new THREE.Texture();normal.userData.referenceUV=new THREE.Vector4(.5,.25,.1,.2);}
  if(kind==='sculpted')normal.userData.surfaceRelief={depth:.04,layers:24,cavityFloor:.5,cavityScale:2,cavityMin:.4};
  const material=createQuakeLightmapMaterial(diffuse,lightmap);if(kind==='rock')material.userData.rockField=true;if(kind==='physical')material.userData.realDisplacement=true;if(kind==='no-normal')material.normalMap=null;
  const before=diffuse.image.data.slice(),shader=compile(material),source=shader.fragmentShader;
  check(source.includes('textureGrad(normalMap,uv,qrShadowDx,qrShadowDy).a'),kind+' shadow uses actual screen footprint');
  check(!source.includes('textureLod(normalMap,uv,0.)'),kind+' no forced full-resolution shadow samples');
  const main=source.indexOf('void main() {'),capture=source.indexOf(kind==='rock'?'qrShadowDx=dFdx(qrRockBaseUv);':'qrShadowDx=dFdx(vMapUv);',main),branch=source.indexOf('#include <clipping_planes_fragment>',main);check(capture>main&&capture<branch,kind+' derivatives captured before per-fragment clipping/branching');
  if(kind==='carved')check(source.includes('qrShadowDx*uCarveReferenceUV.xy,qrShadowDy*uCarveReferenceUV.xy'), 'carved reference footprint follows its real atlas transform');
  if(kind==='rock')check(source.includes('if(layer==1)return qrRockHeight(uv);'),'macro height retains its separate continuous field path');
  same(shader.uniforms.uPigmentMinFootprint.value,0,kind+' native pigment unchanged');diffuse.userData.newerPicture=true;const footprint=shader.uniforms.uPigmentMinFootprint.value;same(footprint,2,kind+' upgraded pigment retains authored detail with exact two-texel footprint');
  check(source.includes('vec2 qrPigmentFootprint=vec2(length(qrPigmentDx*qrPigmentSize),length(qrPigmentDy*qrPigmentSize))')&&source.includes('qrPigmentDx*qrPigmentFilter.x, qrPigmentDy*qrPigmentFilter.y'),kind+' independently filters both anisotropic derivative axes');
  check(source.includes('uPigmentMinFootprint*(1.-uClassic)'),kind+' Classic cancels minimum pigment footprint');delete diffuse.userData.newerPicture;same(shader.uniforms.uPigmentMinFootprint.value,0,kind+' late native replacement removes filtering without shader rebuild');
  check(before.every((v,i)=>diffuse.image.data[i]===v),kind+' original pigment bytes retained');receipts.push({kind,footprint});
  material.dispose();diffuse.dispose();normal.userData.referenceHeight?.dispose();normal.dispose();lightmap.dispose();
 }
 console.log('SURFACE_FILTER_MATERIAL_VARIANTS '+JSON.stringify(receipts));
}));

Deno.test('real compositor keeps physical water IOR and total internal reflection while limiting apparent refraction travel',()=>fixture(renderer=>{
 const camera=new THREE.PerspectiveCamera(75,1,1,1024);camera.updateMatrixWorld();post.R_PostFinish(renderer,new THREE.Scene(),camera,{lx:0,ly:0,lw:128,lh:128},0,[],[],1,1,false);const source=renderer.material.fragmentShader;
 check(source.includes('below ? 1.333 : 1.0 / 1.333'),'actual physical air-water IOR preserved');check(source.includes('if ( dot( bent, bent ) < 0.0001 ) return uv;'),'total internal reflection rejects missing transmitted ray');
 check(source.includes('slope * liquidRipple( look ) * 0.65'),'ripple slope reduced before reflection/refraction share the normal');
 check(source.includes('clamp( offset * 0.35, - limit, limit )'),'actual projected bend reduced to35percent before capping');
 check(source.includes('vec2( 0.004 * uProj[ 0 ][ 0 ] / uProj[ 1 ][ 1 ], 0.004 )'),'refraction cannot exceed four tenths percent vertical UV at default profile');
 check(source.includes('if ( checkHit.z >= lo.z - 0.5')&&source.includes('texture2D( tNormal, candidate ).a < - 0.5'),'dry bank and portal rejection remain intact');
}));
