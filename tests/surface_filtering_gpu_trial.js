import '../src/gl_rsurf.js';
import * as THREE from 'three';
import * as post from '../src/gl_post.js';
import * as height from '../src/r_heightshadows.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import { createQuakeLightmapMaterial } from '../src/gl_rsurf.js';
const W=256,H=256, report=document.querySelector('#report'), views=document.querySelector('#views'), button=document.querySelector('#run');
const mutation=new URLSearchParams(location.search).get('mutation');
for(const c of [post.r_hdr,post.r_dynres,post.r_bloom,post.r_volumetric,post.r_bounce,anim.r_newer_lighting,anim.r_newer_normals,anim.r_newer_water,height.r_heightshadows])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
for(const [name,value]of Object.entries({r_hdr:1,r_dynres:0,r_bloom:0,r_volumetric:0,r_bounce:0,r_newer_lighting:1,r_newer_normals:1,r_newer_water:0,r_heightshadows:1}))vars.Cvar_SetValue(name,value);
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.setClearColor(0,0);const gl=renderer.getContext(),errors=[];
renderer.debug.onShaderError=(ctx,program,vertex,fragment)=>errors.push({program:ctx.getProgramInfoLog(program),vertex:ctx.getShaderInfoLog(vertex),fragment:ctx.getShaderInfoLog(fragment)});
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-16,16,16,-16,1,128);camera.position.z=64;camera.lookAt(0,0,0);camera.updateMatrixWorld();
const geometry=new THREE.PlaneGeometry(32,32);geometry.setAttribute('uv1',geometry.attributes.uv.clone());const positions=geometry.attributes.position.array.slice(),uvs=geometry.attributes.uv.array.slice();
const surface=new THREE.Mesh(geometry);scene.add(surface);
const texture=(data,w,h)=>{const t=new THREE.DataTexture(data,w,h);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;};
const solid=texture(new Uint8Array([96,96,96,255]),1,1),lightmap=texture(new Uint8Array([128,128,128,255]),1,1);lightmap.channel=1;
const fixtureNormals=new WeakMap(),normalBindings=[];
function material(diffuse,normal){
 diffuse._normalMap=normal;const m=createQuakeLightmapMaterial(diffuse,lightmap);
 if(mutation==='lod0'||mutation==='scalar-footprint'){
  const original=m.onBeforeCompile;m.onBeforeCompile=function(shader,...args){original.call(this,shader,...args);
   if(mutation==='lod0')shader.fragmentShader=shader.fragmentShader.replace('textureGrad(normalMap,uv,qrShadowDx,qrShadowDy).a','textureLod(normalMap,uv,0.).a');
   else shader.fragmentShader=shader.fragmentShader
    .replace('vec2 qrPigmentFootprint=vec2(length(qrPigmentDx*qrPigmentSize),length(qrPigmentDy*qrPigmentSize));','float qrPigmentFootprint=max(length(qrPigmentDx*qrPigmentSize),length(qrPigmentDy*qrPigmentSize));')
    .replace('vec2 qrPigmentFilter=max(vec2(1.),uPigmentMinFootprint*(1.-uClassic)/max(qrPigmentFootprint,vec2(1e-6)));','float qrPigmentFilter=max(1.,uPigmentMinFootprint*(1.-uClassic)/max(qrPigmentFootprint,1e-6));')
    .replaceAll('qrPigmentFilter.x','qrPigmentFilter').replaceAll('qrPigmentFilter.y','qrPigmentFilter');
  };m.customProgramCacheKey=()=> 'explicit-old-filter-control-'+mutation;
 }fixtureNormals.set(m,normal);return m;
}

const field=(noisy,ridge)=>{const w=2048,h=16,p=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=ridge&&x>=1120&&x<1248?255:noisy?(x%2?255:0):128;p.set([128,128,255,a],(y*w+x)*4);}const t=texture(p,w,h);t.userData.heightSource=true;return t;};
const fields=[field(true,true),field(false,true),field(false,false)],shadowMaterials=fields.map(n=>material(solid.clone(),n));
// R_PostBegin legitimately refreshes asynchronous production normal bindings.
// Install this test's immutable analytic height fields after that boundary so
// the noisy/averaged/ridge oracles cannot be replaced by generated solid height.
const pigments=new Uint8Array(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++){const c=(x<128?80:160)+((x+y)%2?50:-50);pigments.set([c,c,c,255],(y*256+x)*4);}const pigment=texture(pigments,256,256),pigmentBefore=pigments.slice();
const flat=texture(new Uint8Array([128,128,255,255]),1,1);flat.userData.heightSource=true;const pigmentMaterial=material(pigment,flat);
// Independent directional grain: unlike a checker product, filtering one axis
// cannot cancel grain on the other. Native upgraded textures request anisotropy16.
const directionalBytes=new Uint8Array(256*256*4);
for(let y=0;y<256;y++)for(let x=0;x<256;x++){const c=(y<128?80:160)+(x%2?20:-20)+(y%2?30:-30);directionalBytes.set([c,c,c,255],(y*256+x)*4);}
const directionalTexture=texture(directionalBytes,256,256);directionalTexture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());directionalTexture.needsUpdate=true;
const directionalBefore=directionalBytes.slice(),directionalMaterial=material(directionalTexture,flat);

function draw(m,{classic=false,shadows=true}={}){post.classicLook.value=classic?1:0;surface.material=m;post.R_PostBegin(renderer,true,W,H);const supplied=fixtureNormals.get(m),retained=m.normalMap===supplied;if(!retained){m.normalMap=supplied;m.needsUpdate=true;}normalBindings.push({retainedAcrossPostBegin:retained,actualSuppliedHeight:m.normalMap===supplied&&supplied.userData.heightSource===true});post.classicLook.value=classic?1:0;height.R_HeightShadowFrame({points:[],sun:{direction:[1,0,.07],on:true,color:[1,1,1]},spot:{on:false}});height.R_HeightShadowScope(shadows&&!classic);post.R_PostBind(renderer);const target=renderer.getRenderTarget();renderer.clear();renderer.render(scene,camera);const mask=new Uint8Array(W*H*4),albedo=new Uint8Array(W*H*4);renderer.readRenderTargetPixels(target,0,0,W,H,mask,undefined,3);renderer.readRenderTargetPixels(target,0,0,W,H,albedo,undefined,2);return{mask,albedo,albedoColorSpace:target.textures[2].colorSpace};}
function visibility(bytes,i){const word=bytes[i*4]+bytes[i*4+1]*256+bytes[i*4+2]*65536+bytes[i*4+3]*16777216;const kind=Math.floor(word/1073741824);return kind===1||kind===2?Math.floor(word/16777216)%8/7:1;}
function picture(label,data,mask=false){const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d'),image=ctx.createImageData(W,H);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,o=((H-1-y)*W+x)*4;if(mask){const v=Math.round(visibility(data,i)*255);image.data.set([v,v,v,255],o);}else image.data.set([data[i*4],data[i*4+1],data[i*4+2],255],o);}ctx.putImageData(image,0,0);const figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=label;figure.append(canvas,caption);views.append(figure);}
// Attachment 2 is SRGB8 storage. Decode each actual readback sample BEFORE
// averaging: averaging encoded bytes is not a pigment-energy oracle and would
// incorrectly reject ordinary linear-space mip filtering (Jensen's inequality).
const linearByte=value=>{const s=value/255;return 255*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);};
function stats(data){let fine=0,left=0,right=0,nl=0,nr=0;for(let y=8;y<H-8;y++)for(let x=8;x<W-8;x++){if(Math.abs(x-128)<8)continue;const v=linearByte(data[(y*W+x)*4]);fine+=Math.abs(v-linearByte(data[(y*W+x+1)*4]));if(x<128){left+=v;nl++;}else{right+=v;nr++;}}return{neighborDifference:fine/(nl+nr),leftMean:left/nl,rightMean:right/nr};}

function directionalStats(data,scaleY){let error=0,low=0,high=0,nl=0,nh=0;for(let y=4;y<H-4;y++)for(let x=4;x<W-4;x++){
 const sourceY=((y+.5)/H*scaleY*256)%256;if(Math.min(sourceY,Math.abs(sourceY-128),256-sourceY)<8)continue;
 const expected=sourceY<128?80:160,v=linearByte(data[(y*W+x)*4]);error+=Math.abs(v-expected);if(expected===80){low+=v;nl++;}else{high+=v;nh++;}
 }return{meanAbsoluteGrain:error/(nl+nh),lowMean:low/nl,highMean:high/nh,samples:nl+nh};}
function directionalProof(check){
 check(directionalTexture.anisotropy>=4,'GPU supports actual oblique anisotropic sampling',{anisotropy:directionalTexture.anisotropy});
 for(const repeat of [[4,1],[1,4]]){
  directionalTexture.repeat.set(...repeat);directionalTexture.userData.newerPicture=false;const native=draw(directionalMaterial,{shadows:false});
  directionalTexture.userData.newerPicture=true;const upgraded=draw(directionalMaterial,{shadows:false}),classic=draw(directionalMaterial,{classic:true,shadows:false});
  const n=directionalStats(native.albedo,repeat[1]),u=directionalStats(upgraded.albedo,repeat[1]);let changed=0;for(let i=0;i<native.albedo.length;i++)if(native.albedo[i]!==classic.albedo[i])changed++;
  check(n.meanAbsoluteGrain>8,'unequal UV footprint retains a measurable minor-axis grain control '+repeat,{repeat,native:n});
  check(u.meanAbsoluteGrain<2,'independent footprint filtering removes minor-axis grain '+repeat,{repeat,upgraded:u,native:n});
  check(Math.abs(u.lowMean-80)<2&&Math.abs(u.highMean-160)<2&&u.highMean-u.lowMean>75,'oblique broad pigment bands keep authored linear color '+repeat,u);
  check(changed===0,'oblique Classic pigment exactly matches native sampling '+repeat,{changed});
  picture('Oblique '+repeat+' original sampling',native.albedo);picture('Oblique '+repeat+' corrected filtering',upgraded.albedo);
 }
 check(directionalBytes.every((v,i)=>v===directionalBefore[i]),'oblique filtering does not repaint source image');
}

async function run(){button.disabled=true;views.replaceChildren();const checks=[],check=(passed,name,data={})=>checks.push({passed,name,...data});try{
 const noisy=draw(shadowMaterials[0]),average=draw(shadowMaterials[1]),flatDraw=draw(shadowMaterials[2]);let difference=0,count=0,coarseShadow=0,flatShadow=0,valid=0;
 for(let y=8;y<H-8;y++)for(let x=8;x<W-8;x++){if(Math.abs(x-140)<3||Math.abs(x-156)<3)continue;const i=y*W+x,a=visibility(noisy.mask,i),b=visibility(average.mask,i),c=visibility(flatDraw.mask,i);difference+=Math.abs(a-b);count++;if(b<.5)coarseShadow++;if(c<.999)flatShadow++;if(Math.floor(noisy.mask[i*4+3]/64)===1)valid++;}
 check(normalBindings.every(row=>row.actualSuppliedHeight),'every draw uses its explicit analytic height fixture',{normalBindings});check(valid>count*.99,'real receiver coverage and valid source mask',{valid,count});check(difference/count<.025,'subpixel grain shadows converge to averaged-height oracle',{meanVisibilityError:difference/count});check(coarseShadow>500,'resolved broad ridge still casts a material shadow',{coarseShadow});check(flatShadow===0,'flat-height negative control casts no relief shadows',{flatShadow});picture('Fine stripes + broad ridge (visibility)',noisy.mask,true);picture('Averaged field + same ridge (oracle)',average.mask,true);
 pigment.userData.newerPicture=false;const native=draw(pigmentMaterial,{shadows:false});pigment.userData.newerPicture=true;const upgraded=draw(pigmentMaterial,{shadows:false}),classic=draw(pigmentMaterial,{classic:true,shadows:false});const n=stats(native.albedo),u=stats(upgraded.albedo);let classicChanged=0;for(let i=0;i<native.albedo.length;i++)if(native.albedo[i]!==classic.albedo[i])classicChanged++;
 check(native.albedoColorSpace===THREE.SRGBColorSpace,'oracle decodes actual SRGB8 albedo storage',{colorSpace:native.albedoColorSpace});check(n.neighborDifference>40,'unfiltered native control contains resolved pixel grain',n);check(u.neighborDifference<n.neighborDifference*.35,'replacement pigment filtering suppresses fine grain',u);check(u.rightMean-u.leftMean>65,'broad linear pigment contrast remains readable',u);check(Math.abs(u.leftMean-n.leftMean)<2&&Math.abs(u.rightMean-n.rightMean)<2,'filter preserves linear mean pigment in both broad regions',{native:n,upgraded:u});check(Math.abs(u.leftMean-80)<2&&Math.abs(u.rightMean-160)<2,'filtered linear values agree with independently authored two-texel means',{expected:[80,160],actual:[u.leftMean,u.rightMean]});check(classicChanged===0,'Classic upgraded material matches original pigment pixel-for-pixel',{classicChanged});picture('Original sampling control',native.albedo);picture('Replacement sampling, same bytes',upgraded.albedo);
 directionalProof(check);
 check(positions.every((v,i)=>v===geometry.attributes.position.array[i])&&uvs.every((v,i)=>v===geometry.attributes.uv.array[i])&&pigmentBefore.every((v,i)=>v===pigments[i]),'native geometry, UVs and image bytes immutable');check(errors.length===0&&gl.getError()===gl.NO_ERROR,'all actual shader variants compile and render without GL errors',{errors});
 }catch(error){checks.push({passed:false,name:String(error),stack:error.stack});}finally{post.classicLook.value=0;height.R_HeightShadowScope(false);button.disabled=false;}
 const result={status:checks.every(c=>c.passed)?'PASS':'FAIL',mutation,normalBindings,checks};window.surfaceFilteringResult=result;report.textContent=JSON.stringify(result,null,2);
}
button.onclick=run;await run();
