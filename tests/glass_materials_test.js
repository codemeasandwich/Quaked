// Independent public-interface contracts; run using Quaked/tools/run_tests.mjs.
import * as THREE from 'three';
import { R_NormalMapFor } from '../src/newer/render/gl_normals.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import * as post from '../src/newer/render/gl_post.js';
import {createQuakeLightmapMaterial} from '../src/engine/render/gl_rsurf.js';
const check=(v,m)=>{if(!v)throw Error(m)},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),equal=(a,b,m)=>same(Buffer.from(a).toString('hex'),Buffer.from(b).toString('hex'),m);
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
const normalBytes=new Uint8Array([32,220,180,17,230,66,180,89,90,180,245,150,170,75,245,230]);
const opaqueNormals=normalBytes.map((v,i)=>i%4===3?255:v),heightBytes=new Uint8Array(16);for(let i=0;i<4;i++){heightBytes.fill(normalBytes[i*4+3],i*4,i*4+3);heightBytes[i*4+3]=255}
const glossBytes=new Uint8Array([240,240,240,255,180,180,180,255,40,40,40,255,2,2,2,255]);
const diffuseBytes=new Uint8Array([201,90,20,255,255,210,60,255,112,25,4,255,40,20,5,255]);
const native=()=>new THREE.DataTexture(new Uint8Array([7,9,11,255]),1,1);
function independentKey(texture){const {data,width,height}=texture.image,fb=texture._fullbright?.image?.data;let h1=2166136261,h2=3339675911;for(let i=0;i<data.length;i++){const byte=fb&&fb[(i>>2)*4+3]&&i%4!==3?fb[i]:data[i];h1=Math.imul(h1^byte,16777619)>>>0;h2=Math.imul(h2^byte,2246822519)>>>0}return `${width}x${height}:${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}`}
const authored=(bytes=normalBytes,gloss=glossBytes)=>({file:'independent-normal.png',width:2,height:2,data:Float32Array.from({length:4},(_,i)=>bytes[i*4+3]/255),strength:1,cap:1.1,authoredNormal:{file:'independent-normal.png',width:2,height:2,data:bytes},authoredGloss:{file:'independent-gloss.png',width:2,height:2,data:gloss}});
Deno.test('independent public normal selection preserves source bytes, separates donor identities and owns gloss disposal',()=>{
 const a=new THREE.DataTexture(diffuseBytes.slice(),2,2),b=new THREE.DataTexture(diffuseBytes.slice(),2,2),different=normalBytes.slice();different[0]=45;
 a.userData.newerHeight=authored();b.userData.newerHeight=authored(different);b.userData.newerHeight.authoredNormal.file='second-independent-normal.png';b.userData.newerHeight.file='second-independent-normal.png';
 const aSource=a.image.data.slice(),n=R_NormalMapFor(a),other=R_NormalMapFor(b);equal(n.image.data,normalBytes,'exact donor normals and alpha consumed through public API');equal(other.image.data,different,'distinct donor pixels are not conflated by diffuse cache');equal(a.image.data,aSource,'native pigment source not modified by normal generation');equal(n.userData.glassGloss.image.data,glossBytes,'gloss is exact data');same(n.userData.glassGloss.colorSpace,THREE.NoColorSpace,'gloss remains linear');
 let disposed=0;n.userData.glassGloss.addEventListener('dispose',()=>disposed++);a.dispose();same(disposed,1,'authored gloss lifetime ends with normal');b.dispose();
});
Deno.test('independent authored gloss dimension mismatch cannot tag unrelated texels as glass',()=>{
 const texture=new THREE.DataTexture(diffuseBytes.slice(),2,2);texture.userData.newerHeight=authored();texture.userData.newerHeight.authoredGloss.width=1;
 const n=R_NormalMapFor(texture);equal(n.image.data,normalBytes,'valid normals remain exact despite invalid optional gloss');check(!n.userData.glassGloss,'incorrect-sized gloss cannot classify material');texture.dispose();
});
async function loaderFixture(run) {
 const saved={fetch:globalThis.fetch,Image:Object.getOwnPropertyDescriptor(globalThis,'Image'),document:Object.getOwnPropertyDescriptor(globalThis,'document'),classic:mode.R_ClassicPassActive()}, controls=[post.r_hdr,mode.r_newer_textures];
 for(const v of controls)if(!vars.Cvar_FindVar(v.name))vars.Cvar_RegisterVariable(v);const values=controls.map(v=>v.string),images=[];
 const manifest={version:'independent-glass',textures:{glassGood:'unsafe-global-fallback.png'},normals:{},glass:{}};
 for(const [name,normalFile,glossFile]of [['glassGood','normal.png','gloss.png'],['glassMissing','missing.png','gloss.png'],['glassSize','size.png','gloss.png'],['glassZero','normal.png','gloss.png']])manifest.glass[name]={[independentKey(native())]:{file:'diffuse.png',normalFile,glossFile,heightFile:name==='glassZero'?'zero-height.png':'height.png'}};
 globalThis.fetch=async url=>{check(String(url).endsWith('index.json'),'only manifest transport expected');return{ok:true,json:async()=>manifest}};
 Object.defineProperty(globalThis,'Image',{configurable:true,value:class{constructor(){this.width=this.height=2;images.push(this)}set src(url){this.url=String(url)}finish(){if(this.url.includes('missing.png')){this.onerror?.(Error('controlled optional normal missing'));return}if(this.url.includes('size.png'))this.width=1;const height=heightBytes.slice();if(this.url.includes('zero-height.png'))height[0]=height[1]=height[2]=0;this.pixels=new Uint8ClampedArray(this.url.includes('normal.png')?opaqueNormals:this.url.includes('gloss.png')?glossBytes:this.url.includes('height.png')?height:diffuseBytes);this.onload?.()}}});
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>{let image;return{getContext:()=>({drawImage:i=>image=i,getImageData:()=>({data:image.pixels})})}}}});
 mode.R_AnimSetClassicPass(false);vars.Cvar_SetValue('r_hdr',1);vars.Cvar_SetValue('r_newer_textures',1);
 try{const module=await import('../src/newer/render/r_newertextures.js?independent-glass-'+Math.random());await run({module,images,finish:async()=>{await flush();for(const image of images)image.finish();await flush()}})}finally{for(const image of images)if(image.onload||image.onerror)image.finish();await flush();globalThis.fetch=saved.fetch;mode.R_AnimSetClassicPass(saved.classic);controls.forEach((v,i)=>vars.Cvar_Set(v.name,values[i]));for(const [key,descriptor]of [['Image',saved.Image],['document',saved.document]])if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
}

Deno.test('independent donor loader remains asynchronous and preserves native Classic image and offset',()=>loaderFixture(async f=>{
 const texture=native(),nativeImage=texture.image,pixels=nativeImage.data.slice();texture.offset.set(.125,.25);let updates=0;texture.addEventListener('newertextureupdated',()=>updates++);
 f.module.R_NewerTextureUpgrade('glassGood',texture);same(texture.image,nativeImage,'native picture retained while decoding');same(texture.userData.newerPending,true,'pending reflects actual asynchronous decoding');same(updates,0,'no update before assets arrive');await f.finish();
 same(texture.userData.newerPicture,true,'ordinary install completed');same(texture.userData.classicImage,nativeImage,'native image identity retained');equal(nativeImage.data,pixels,'native pigment immutable');same(updates,1,'exactly one real update');
 const classic=f.module.R_ClassicTexture(texture);equal(classic.image.data,nativeImage.data,'public Classic twin draws original native pixels');same(classic.image.width,nativeImage.width,'Classic native width');same(classic.image.height,nativeImage.height,'Classic native height');check(!classic.userData.newerHeight,'Classic twin has no donor relief');same(texture.offset.x,.125,'native U offset survives');same(texture.offset.y,.25,'native V offset survives');
 const normal=R_NormalMapFor(texture);equal(normal.image.data,normalBytes,'donor RGB normal and height alpha exact');same(normal.offset.x,.125,'normal U follows native UV');same(normal.offset.y,.25,'normal V follows native UV');check(normal.userData.glassGloss,'gloss attached to actual normal used for rendering');equal(normal.userData.glassGloss.image.data,glossBytes,'donor gloss retained byte-exact');
 same(normal.colorSpace,THREE.NoColorSpace,'normal uses linear data');same(normal.userData.glassGloss.colorSpace,THREE.NoColorSpace,'gloss uses linear data');same(normal.wrapS,THREE.RepeatWrapping,'native tiling retained');same(normal, R_NormalMapFor(texture),'same diffuse reuses actual normal');
 let normalDisposed=0,glossDisposed=0;normal.addEventListener('dispose',()=>normalDisposed++);normal.userData.glassGloss.addEventListener('dispose',()=>glossDisposed++);texture.dispose();same(normalDisposed,1,'normal disposed with diffuse');same(glossDisposed,1,'gloss disposed with diffuse');classic.dispose();
}));

Deno.test('independent missing or mismatched donor normals keep successful diffuse and generated relief fallback',()=>loaderFixture(async f=>{
 const missing=native(),size=native();f.module.R_NewerTextureUpgrade('glassMissing',missing);f.module.R_NewerTextureUpgrade('glassSize',size);await f.finish();
 for(const [name,texture]of [['missing',missing],['size',size]]){same(texture.userData.newerPicture,true,name+' diffuse still installs');const normal=R_NormalMapFor(texture);check(normal?.image.data,'fallback relief remains renderable');check(!normal.userData.glassGloss,name+' does not incorrectly tag fallback as glass');check(Buffer.from(normal.image.data).toString('hex')!==Buffer.from(normalBytes).toString('hex'),name+' malformed donor not applied');texture.dispose()}
}));
Deno.test('independent separate opaque normal and height decode preserves nonzero RGB at zero height',()=>loaderFixture(async f=>{
 const texture=native();f.module.R_NewerTextureUpgrade('glassZero',texture);await f.finish();const expected=normalBytes.slice();expected[3]=0;equal(R_NormalMapFor(texture).image.data,expected,'zero scalar height retains authored normal RGB instead of transparent-black decode');same(texture.userData.newerHeight.data[0],0,'zero height stays zero');texture.dispose();
}));
Deno.test('independent content-bound selection reconstructs native fullbright pixels and rejects unrelated same-name variants',()=>loaderFixture(async f=>{
 const reference=native(),a=native(),other=native();other.image.data[0]=70;
 same(f.module.R_GlassTextureKey(reference),independentKey(reference),'exact independent double hash native RGBA');
 a.image.data[0]=a.image.data[1]=a.image.data[2]=0;a._fullbright=new THREE.DataTexture(new Uint8Array([7,9,11,255]),1,1);same(f.module.R_GlassTextureKey(a),independentKey(reference),'original fullbright RGB reconstructed before variant selection');
 const original=other.image,copy=original.data.slice();f.module.R_NewerTextureUpgrade('glassGood',other);await flush();same(other.userData.newerFallback,true,'unmatched same-name variant takes existing native fallback');same(other.image,original,'unmatched source image preserved');equal(other.image.data,copy,'unmatched source pixels preserved');same(f.images.length,0,'no incorrect same-name donor fetched');other.dispose();reference.dispose();a._fullbright.dispose();a.dispose();
}));
Deno.test('independent actual material compiler isolates glass mask, Classic and native material behavior',()=>{
 const controls=[post.r_hdr,mode.r_newer_lighting,mode.r_newer_normals,mode.r_newer_textures];for(const c of controls)if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);const saved=controls.map(c=>c.string),classic=post.classicLook.value;
 let target=null;const renderer={capabilities:{isWebGL2:true},extensions:{has:()=>true},getRenderTarget:()=>target,setRenderTarget:t=>target=t,setViewport(){},render(scene){this.material=scene.children[0]?.material}};
 const glass=new THREE.DataTexture(diffuseBytes.slice(),2,2),ordinary=new THREE.DataTexture(diffuseBytes.slice(),2,2),lm=new THREE.Texture();glass.userData.newerHeight=authored();const materials=[];
 const compile=m=>{const s={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};m.onBeforeCompile(s);return s};
 try{controls.forEach(c=>vars.Cvar_SetValue(c.name,1));mode.R_AnimSetClassicPass(false);post.classicLook.value=0;post.R_PostBegin(renderer,true,128,128);
 const gm=createQuakeLightmapMaterial(glass,lm),om=createQuakeLightmapMaterial(ordinary,lm);materials.push(gm,om);const gs=compile(gm),os=compile(om);
 same(gs.uniforms.uGlassGloss.value,gm.normalMap.userData.glassGloss,'actual compiled material binds donor gloss');
 glass.userData.newerPicture=true;ordinary.userData.newerPicture=true;
 same(gs.uniforms.uPigmentMinFootprint.value,2,'glass starts with ordinary pigment footprint outside reviewed aperture (two texels since 612a071)');same(os.uniforms.uPigmentMinFootprint.value,2,'ordinary replacement pigment filtering unchanged');
 check(gs.fragmentShader.includes('mix(uPigmentMinFootprint,1.,step(.5,texture2D(uGlassGloss,pUv).g))*(1.-uClassic)'),'only reviewed aperture G sharpens pigment at actual parallax UV; Classic disables correction');
 check(gs.fragmentShader.includes('vec3 qrGlassPigment=textureGrad(map,DETAIL_UV,dFdx(vMapUv),dFdy(vMapUv)).rgb;'),'glass pane mask samples original pigment independently of diffuseColor');
 check(/#ifdef USE_EMISSIVEMAP\s+qrGlassPigment\+=textureGrad\(emissiveMap,DETAIL_UV,dFdx\(vMapUv\),dFdy\(vMapUv\)\).rgb;\s+#endif/.test(gs.fragmentShader),'actual emissiveMap reconstructs split fullbright panes under the feature gate');
 check(gs.fragmentShader.includes('step(0.035,max(qrGlassPigment.r,max(qrGlassPigment.g,qrGlassPigment.b)))*(1.0-uClassic)'),'dark lead is excluded using maximum original linear channel and Classic guard');
 check(gs.fragmentShader.includes('vec4( gDiffuse, mix(1.0,0.5,qrGlassPane) )'),'only guarded pane mask controls glass receiver tag');
 const fb= new THREE.DataTexture(diffuseBytes.slice(),2,2);glass._fullbright=fb;post.R_RefreshDetail(gm,glass);const fullbrightShader=compile(gm);same(gm.emissiveMap,fb,'real fullbright shader material binds split pigment');check(fullbrightShader.fragmentShader.includes('qrGlassPigment+=textureGrad(emissiveMap,DETAIL_UV'),'fullbright pane reconstruction survives actual emissive material variant');fb.dispose();
 check(!os.uniforms.uGlassGloss,'ordinary material has no glass sampler');check(gs.fragmentShader.includes('step(0.08,texture2D(uGlassGloss,DETAIL_UV).r)*step(0.5,texture2D(uGlassGloss,DETAIL_UV).g)'),'specular tag requires authored paneR and openingG together');check(gs.fragmentShader.includes('mapN.xy *= normalScale * mix(mix(0.4,1.0,smoothstep(24.0,150.0,length(vViewPosition))),1.0,step(.08,texture2D(uGlassGloss,pUv).r)*step(.5,texture2D(uGlassGloss,pUv).g)) * (1.0-uClassic);'),'only actual pane R gets full normal response; lead and frame retain ordinary distance softening');check(os.fragmentShader.includes('smoothstep( 24.0, 150.0, length( vViewPosition ) )'),'ordinary distance-softening preserved');check(gm.customProgramCacheKey().includes('-glass-v2-regions'),'glass shader variant cache isolated');check(!om.customProgramCacheKey().includes('-glass-v2-regions'),'ordinary cache unchanged');
 post.classicLook.value=1;same(gs.uniforms.uClassic.value,1,'compiled material observes live Classic control');
 const holder=gm.userData.glassUniforms.uGlassGloss,oldNormal=gm.normalMap,changedGloss=glossBytes.slice();changedGloss[0]=88;glass.userData.newerHeight=authored(normalBytes,changedGloss);oldNormal.dispose();glass._normalMap=undefined;glass.dispatchEvent({type:'newertextureupdated'});
 same(gs.uniforms.uGlassGloss,holder,'compiled material keeps same gloss uniform holder after async update');equal(holder.value.image.data,changedGloss,'existing world material observes replaced authored gloss after update');check(gm.normalMap!==oldNormal,'existing world material replaces disposed normal');
 post.R_PostFinish(renderer,new THREE.Scene(),new THREE.PerspectiveCamera(75,1,1,1024),{lx:0,ly:0,lw:128,lh:128},0,[],[],1,1,false);const source=renderer.material.fragmentShader;
 check(source.includes('bool glassReceiver(float tag){return tag>.495&&tag<.505;}'),'byte-safe glass tag isolated from other material ranges');check(source.includes('pointSurfaceVisibility(P,Ng,i,actor?.1:1.)*localShadow'),'glass specular uses current point occlusion');check(source.includes('glass?24.:48.)*sunVisibility*skyCookieRGB(pw)*rockSunVisibility'),'glass sun specular retains native shadow/cookie path');check(source.includes('glass?24.:48.)*beam'),'glass spotlight specular retains actual beam');check(source.includes('if(glass)c+=surfaceSpecular*.12;'),'only glass gains reduced coat reflection after owner feedback');check(!source.includes('if(glass)c+=surfaceSpecular*.55;'),'excessive glass reflection gain removed');check(source.includes('surfaceSpecular*film*.16 : scene'),'actor reflection gain remains unchanged');
 }finally{materials.forEach(m=>m.dispose());glass.dispose();ordinary.dispose();lm.dispose();post.R_PostShutdown();controls.forEach((c,i)=>vars.Cvar_Set(c.name,saved[i]));post.classicLook.value=classic;mode.R_AnimSetClassicPass(false)}
});
