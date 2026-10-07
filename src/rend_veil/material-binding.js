// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
import { VISUALS as p } from './config.js';
import { smooth } from './timeline.js';
import { COMMON_GLSL } from './shader-common.js';
const names=['squareSafe','divideW','unitSafe','angleSafe','uvSafe','channelSafe','colorSafe','h1','h3','noise3','rot2','lineSeg','glyph'];
const rvCommon=COMMON_GLSL.replace(new RegExp('\\b('+names.join('|')+')\\b','g'),name=>'rv_'+name);

/** Reuse these chunks in a custom MDL/alias shader AFTER its final animated vertex is known. */
const RV_SURFACE_DECL=`
uniform float uRVTime,uRVProgress,uRVSurfaceEffect,uRVFormation,uRVConverge,uRVGhost;
uniform mat4 uRVEffectFromModel,uRVModelFromEffect;
uniform vec3 uRVMagic;
varying vec3 vRVAnchor,vRVViewNormal;
${rvCommon}
float rvField(vec3 q){
 float f=length(q-vec3(0.,2.3,0.))/2.55;
 f+=(rv_noise3(q*3.2)*.65+rv_noise3(q*8.3)*.35-.5)*.67*.72*(1.-uRVProgress);
 return clamp(f,.003,.997);
}
`;
const RV_REVEAL_DECL='uniform mat4 uRVRevealFromBody;\n';
const RV_REVEAL_VERTEX='vRVAnchor=(uRVRevealFromBody*vec4(vRVAnchor,1.)).xyz;\n';
const RV_VERTEX_BIND=`
// 'transformed' is the host's already-morphed/skinned/posed vertex, not bind-pose position.
vec3 rvCanonical=(uRVEffectFromModel*vec4(transformed,1.)).xyz;
vRVAnchor=rvCanonical;
vRVViewNormal=rv_unitSafe(normalMatrix*normal);
if(uRVGhost>=0.){
 float k=(1.-uRVConverge)*.65;
 rvCanonical.x+=sin(rvCanonical.y*2.4+uRVTime*3.)*k*.11;
 rvCanonical+=vec3(sin(uRVGhost*2.4),sin(uRVGhost*4.1)*.13,cos(uRVGhost*2.4))*uRVGhost*k*.14;
 rvCanonical.xz=rv_rot2(uRVGhost*k*.09)*rvCanonical.xz;
}else{
 vec3 rvNormal=rv_unitSafe(mat3(uRVEffectFromModel)*normal);
 rvCanonical+=rvNormal*(rv_noise3(rvCanonical*3.3+vec3(0.,uRVTime*.7,-uRVTime*.31))-.5)*.075*uRVSurfaceEffect*.65;
}
transformed=(uRVModelFromEffect*vec4(rvCanonical,1.)).xyz;
`;
const RV_FRAGMENT_MASK=`
if(uRVGhost<0.&&uRVProgress<1.&&rvField(vRVAnchor)>uRVProgress)discard;
if(uRVGhost>=0.&&uRVFormation<.0001)discard;
`;
const RV_FRAGMENT_SHADE=`
if(uRVGhost>=0.){
 float rvRim=pow(clamp(1.-abs(rv_unitSafe(vRVViewNormal).z),0.,1.),2.5);
 outgoingLight=vec3(.0002,0.,.0006)+uRVMagic*rvRim*.08;
 diffuseColor.a*=uRVFormation*(uRVGhost<.5?1.:.2+.32*rvRim);
}else{
 float rvEdge=(1.-smoothstep(.055*.35,.055,abs(rvField(vRVAnchor)-uRVProgress)))*(1.-step(.999,uRVProgress));
 outgoingLight=mix(outgoingLight,vec3(.0001,0.,.0003),rvEdge*.98);
 float rvGrain=rv_noise3(vRVAnchor*4.6+vec3(0.,-uRVTime*.5,uRVTime*.23));
 float rvFilament=pow(clamp(1.-abs(rvGrain-.48)*3.4,0.,1.),5.);
 vec3 rvCoated=outgoingLight*(.62+.15*rvGrain)+uRVMagic*rvFilament*.006;
 outgoingLight=mix(outgoingLight,rvCoated,uRVSurfaceEffect);
}
`;

function insert(source,anchor,code,label,before=true) {
  if(!source.includes(anchor))throw new Error(`Rend the Veil: ${label} missing ${anchor}. Use a custom surfaceBinding for this host shader.`);
  return source.replace(anchor,before?code+'\n'+anchor:anchor+'\n'+code);
}
function decorate(material,uniforms,depth) {
  const previous=material.onBeforeCompile;
  // Capture the previous key before replacing its callback (Three's default key reads the callback).
  const cacheKey=material.customProgramCacheKey?.call(material)||material.type;
  material.onBeforeCompile=function(shader,renderer){
    previous?.call(this,shader,renderer);
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=RV_SURFACE_DECL+RV_REVEAL_DECL+'\n'+shader.vertexShader;
    shader.vertexShader=insert(shader.vertexShader,'#include <project_vertex>',RV_VERTEX_BIND+RV_REVEAL_VERTEX,'vertex');
    shader.fragmentShader=RV_SURFACE_DECL+'\n'+shader.fragmentShader;
    shader.fragmentShader=insert(shader.fragmentShader,'#include <clipping_planes_fragment>',RV_FRAGMENT_MASK,'fragment',false);
    if(!depth){
      const anchor=shader.fragmentShader.includes('#include <opaque_fragment>')?'#include <opaque_fragment>':'#include <output_fragment>';
      shader.fragmentShader=insert(shader.fragmentShader,anchor,RV_FRAGMENT_SHADE,'surface output');
      // Ink silhouettes darken receiver albedo along with scene colour;
      // separate alpha blending preserves signed depth and receiver tags.
      if(shader.fragmentShader.includes('out highp vec4 gNormal')){
        const last=shader.fragmentShader.lastIndexOf('}');
        shader.fragmentShader=shader.fragmentShader.slice(0,last)+(uniforms.uRVGhost.value>=0?'gNormal=vec4(0.);gAlbedo=vec4(0.,0.,0.,clamp(diffuseColor.a,0.,1.));gHeightMask=vec4(0.);\n':'float rvNativeEdge=(1.-smoothstep(.055*.35,.055,abs(rvField(vRVAnchor)-uRVProgress)))*(1.-step(.999,uRVProgress));gAlbedo.rgb*=mix(1.,.006,rvNativeEdge);gAlbedo.rgb*=mix(1.,.62+.15*rv_noise3(vRVAnchor*4.6+vec3(0.,-uRVTime*.5,uRVTime*.23)),uRVSurfaceEffect);\n')+shader.fragmentShader.slice(last);
      }
    }
  };
  material.customProgramCacheKey=()=>cacheKey+'|rend-veil-1|'+(depth?'depth':'color');
  material.needsUpdate=true;
}
function copyMaterial(source) {
  const clone=source.clone();
  clone.onBeforeCompile=source.onBeforeCompile;
  // Bind to the original before decorate captures it. Textures/maps remain shared, NOT disposed.
  clone.customProgramCacheKey=()=>source.customProgramCacheKey?.call(source)||source.type;
  return clone;
}

/** Built-in material adapter. Custom ShaderMaterial/InstancedMesh uses the documented binding contract. */
function bindThreeSubject({THREE:T,subject,scene,effectFrame,revealFromBody=new T.Matrix4()}) {
  if(!subject?.isObject3D)throw new TypeError('subject must be the existing host Object3D, not a new monster');
  const sources=[];
  subject.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    if(mesh.isInstancedMesh||materials.some(m=>!m||m.isShaderMaterial||m.isRawShaderMaterial))
      throw new Error('Custom/instanced host subject: supply surfaceBinding; see MATERIAL_BINDING.md.');
    sources.push({mesh,materials});
  });
  if(!sources.length)throw new TypeError('subject contains no compatible meshes');
  const frameInverse=effectFrame.clone().invert(),items=[],ghosts=[],owned=new Set();
  let disposed=false;
  const common={uRVTime:{value:0},uRVProgress:{value:0},uRVSurfaceEffect:{value:0},uRVFormation:{value:0},uRVConverge:{value:0},uRVMagic:{value:new T.Color(.54,.29,.74)}};
  const own=material=>{owned.add(material);return material;};
  for(const {mesh,materials} of sources){
    const transforms={uRVRevealFromBody:{value:revealFromBody.clone()},uRVEffectFromModel:{value:new T.Matrix4()},uRVModelFromEffect:{value:new T.Matrix4()}};
    const uniforms={...common,...transforms,uRVGhost:{value:-1}};
    const patch=m=>{const result=own(copyMaterial(m));decorate(result,uniforms,false);return result;};
    const patchedList=materials.map(patch),patched=Array.isArray(mesh.material)?patchedList:patchedList[0];
    const old={material:mesh.material,depth:mesh.customDepthMaterial,distance:mesh.customDistanceMaterial};
    // Match the radial mask in directional/spot AND point-light shadow maps.
    const depth=own(mesh.customDepthMaterial?copyMaterial(mesh.customDepthMaterial):new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking}));
    const distance=own(mesh.customDistanceMaterial?copyMaterial(mesh.customDistanceMaterial):new T.MeshDistanceMaterial());
    const inheritFlags=m=>{m.side=materials[0].side;m.map=materials[0].map;m.alphaMap=materials[0].alphaMap;m.alphaTest=materials[0].alphaTest;m.displacementMap=materials[0].displacementMap;m.displacementScale=materials[0].displacementScale;m.displacementBias=materials[0].displacementBias;};
    inheritFlags(depth);inheritFlags(distance);decorate(depth,uniforms,true);decorate(distance,uniforms,true);
    mesh.material=patched;mesh.customDepthMaterial=depth;mesh.customDistanceMaterial=distance;
    items.push({mesh,old,patched,depth,distance,transforms});
    for(let id=0;id<=p.duplicates;id++){
      const ghost=mesh.clone(false);ghost.name='Rend the Veil / silhouette only';
      ghost.matrixAutoUpdate=false;ghost.castShadow=false;ghost.receiveShadow=false;ghost.layers.disable(3); // Native layer-based sun capture excludes visual silhouettes.
      ghost.userData={rendVeilVisualOnly:true};ghost.raycast=()=>{};
      const uniformsGhost={...common,...transforms,uRVGhost:{value:id}};
      const ghostMats=materials.map(m=>{const c=own(copyMaterial(m));c.transparent=true;c.depthWrite=false;c.depthFunc=T.LessDepth;c.side=T.FrontSide;
      c.blending=T.CustomBlending;c.blendEquation=T.AddEquation;c.blendSrc=T.SrcAlphaFactor;c.blendDst=T.OneMinusSrcAlphaFactor;
      c.blendEquationAlpha=T.AddEquation;c.blendSrcAlpha=T.ZeroFactor;c.blendDstAlpha=T.OneFactor;decorate(c,uniformsGhost,false);return c;});
      ghost.material=Array.isArray(mesh.material)?ghostMats:ghostMats[0];
      ghost.customDepthMaterial=undefined;ghost.customDistanceMaterial=undefined;
      ghost.visible=false;ghost.frustumCulled=false;ghost.renderOrder=1;scene.add(ghost);
      ghosts.push({ghost,mesh});
    }
  }
  const worldBounds=new T.Box3();
  const visibleHierarchy=mesh=>{for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;};
  return {
    setState(s){
      if(disposed)return;
      common.uRVTime.value=s.t;common.uRVProgress.value=s.progress;common.uRVSurfaceEffect.value=s.surfaceEffect;
      common.uRVConverge.value=smooth(s.m[4],s.materialAt,s.t);
      common.uRVFormation.value=p.silhouetteOpacity*s.formation*(1-smooth(.45,.99,s.progress));
      subject.updateWorldMatrix(true,true);
      for(const item of items){item.mesh.material=item.patched;item.transforms.uRVEffectFromModel.value.multiplyMatrices(frameInverse,item.mesh.matrixWorld);item.transforms.uRVModelFromEffect.value.copy(item.transforms.uRVEffectFromModel.value).invert();}
      for(const {ghost,mesh} of ghosts){
        ghost.geometry=mesh.geometry;ghost.matrix.copy(mesh.matrixWorld);ghost.matrixWorldNeedsUpdate=true;
        if(mesh.morphTargetInfluences)ghost.morphTargetInfluences=mesh.morphTargetInfluences;
        ghost.visible=visibleHierarchy(mesh)&&!s.pending&&s.t<s.materialAt&&common.uRVFormation.value>.0001;
      }
      if(s.focused)this.dispose(); // Original host materials restored at Focus, not Remnants completion.
    },
    getEffectBounds(){subject.updateWorldMatrix(true,true);worldBounds.setFromObject(subject);return worldBounds.clone().applyMatrix4(frameInverse).expandByScalar(.10);},
    dispose(){
      if(disposed)return;disposed=true;
      for(const i of items){
        if(i.mesh.material===i.patched)i.mesh.material=i.old.material;
        if(i.mesh.customDepthMaterial===i.depth)i.mesh.customDepthMaterial=i.old.depth;
        if(i.mesh.customDistanceMaterial===i.distance)i.mesh.customDistanceMaterial=i.old.distance;
      }
      ghosts.forEach(({ghost})=>ghost.removeFromParent());owned.forEach(m=>m.dispose());owned.clear();
    },
    setRevealFit(matrix){for(const item of items)item.transforms.uRVRevealFromBody.value.copy(matrix);},
    forEachGhost(fn){for(const {ghost} of ghosts)fn(ghost);},
    hideGhosts(){for(const {ghost} of ghosts)ghost.visible=false;},
    acceptsMaterial(material){return items.some(i=>material===i.old.material||material===i.patched);},
    get restored(){return disposed;}
  };
}

export { RV_REVEAL_DECL,RV_REVEAL_VERTEX,RV_SURFACE_DECL,RV_VERTEX_BIND,RV_FRAGMENT_MASK,RV_FRAGMENT_SHADE,bindThreeSubject };
