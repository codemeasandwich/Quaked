// Quad-only, owner-authorized through-wall silhouettes. Read living local
// server entities because ordinary client visibility intentionally omits PVS
// outsiders. These proxies never enter gameplay, network or discovery state.
import * as THREE from 'three';
import { sv, FL_MONSTER } from './engine/server/server.js';
import { cl } from './engine/client/client.js';
import { IT_QUAD, STAT_HEALTH } from './engine/common/quakedef.js';
import { SV_FaceLocalActive } from './newer/gameplay/sv_faceevents.js';
import { GL_DrawAliasFrame } from './gl_mesh.js';
import { VISION_COORDINATES_GLSL } from './vision_coordinates.js';

export function R_QuadVisionActive() {
	return SV_FaceLocalActive() && cl.stats[STAT_HEALTH]>0 && !cl.intermission && Boolean(cl.items&IT_QUAD);
}
export function QuadVisionEnemies(server) {
	return (server.edicts||[]).filter(e=>e && !e.free && e.v.health>0 && !e.v.deadflag &&
		(e.v.flags&FL_MONSTER) && server.models[e.v.modelindex]?.cache?.data?.posedata);
}

const VERTEX=`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}`;
export const QUAD_VISION_FRAGMENT=`
uniform sampler2D tScene,tMask,tDepth,tNormal;
uniform vec2 uTexel;uniform float uNear,uFar,uTime;
varying vec2 vUv;
${VISION_COORDINATES_GLSL}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 vec3 base=texture2D(tScene,vUv).rgb;
 if(texture2D(tNormal,visionRawUV(vUv)).a < -2.){gl_FragColor=vec4(base,1);return;}
 float d=texture2D(tDepth,visionRawUV(vUv)).r,z=uNear*uFar/max(uFar-d*(uFar-uNear),.00001);
 vec4 center=texture2D(tMask,visionRawUV(vUv));
 float distance=center.b/max(center.r,.001);
 float radius=mix(1.,14.,clamp(distance/2400.,0.,1.));
 if(center.r<.01)radius=14.;
 float flame=noise(vUv*vec2(95.,55.)-vec2(0.,uTime*3.5));
 vec2 rise=vec2((flame-.5)*4.,-flame*9.)*uTexel;
 float alpha=0.,weight=0.;
 for(int i=0;i<17;i++){
  float a=float(i)*2.399963,r=sqrt(float(i)/16.);
  vec2 q=clamp(vUv+vec2(cos(a),sin(a))*r*radius*uTexel+rise,vec2(0),vec2(1));
  vec4 mask=texture2D(tMask,visionRawUV(q));float enemyZ=mask.g/max(mask.r,.001);
  float w=exp(-r*r*2.);
  // Only the hidden portion receives the wall reveal. Ordinary visible
  // enemy pigment and the held weapon remain readable.
  float hidden=smoothstep(2.,10.,enemyZ-z);
  alpha+=mask.r*hidden*exp(-(mask.b/max(mask.r,.001))/1400.)*w;weight+=w;
 }
 alpha=clamp(alpha/max(weight,.001)*(.65+.35*flame),0.,.85);
 vec3 purple=mix(vec3(.12,.005,.28),vec3(.65,.04,1.),flame);
 gl_FragColor=vec4(mix(base,purple,alpha),1.);
}`;
let state=null;
export function R_QuadVisionReset() {
	if(!state)return;
	state.mask.dispose();state.output.dispose();state.material.dispose();state.composite.dispose();
	state.quad.geometry.dispose();for(const g of state.geometries.values())g.dispose();state=null;
}
function create(width,height,world) {
	const mask=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:true});
	const output=new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,depthBuffer:false});
	const material=new THREE.ShaderMaterial({vertexShader:'varying vec2 distance;void main(){vec4 p=modelViewMatrix*vec4(position,1.);distance=vec2(-p.z,length(p.xyz));gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec2 distance;void main(){gl_FragColor=vec4(1.,distance,1.);}',side:THREE.DoubleSide,blending:THREE.NoBlending});
	const composite=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:QUAD_VISION_FRAGMENT,depthTest:false,depthWrite:false,uniforms:{tVisionCoordinates:{value:null},uVisionCoordinates:{value:0},tScene:{value:null},tMask:{value:mask.texture},tDepth:{value:null},tNormal:{value:null},uTexel:{value:new THREE.Vector2(1/width,1/height)},uNear:{value:4},uFar:{value:4096},uTime:{value:0}}});
	const scene=new THREE.Scene(),screen=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),composite);
	screen.add(quad);quad.frustumCulled=false;
	return {width,height,world,mask,output,material,composite,scene,screen,quad,camera:new THREE.Camera(),meshes:new Map(),geometries:new Map()};
}
export function R_QuadVisionRender(renderer,source,hdr,camera,worldScene,coordinates=null) {
	if(!R_QuadVisionActive()){R_QuadVisionReset();return source;}
	if(!state || state.width!==hdr.width || state.height!==hdr.height || state.world!==sv.worldmodel){R_QuadVisionReset();state=create(hdr.width,hdr.height,sv.worldmodel);}
	const s=state,seen=new Set();
	s.scene.matrixAutoUpdate=false;s.scene.matrix.copy(worldScene.matrixWorld);
	for(const e of QuadVisionEnemies(sv)) {
		const header=sv.models[e.v.modelindex].cache.data,frame=header.frames[e.v.frame|0]||header.frames[0];
		let pose=frame.firstpose;if(frame.numposes>1)pose+=Math.floor(sv.time/frame.interval)%frame.numposes;
		const template=GL_DrawAliasFrame(header,pose);if(!template)continue;
		// Own the GPU attribute: disposing a proxy must not delete native alias buffers.
		let geometry=s.geometries.get(template);
		if(!geometry){geometry=new THREE.BufferGeometry();geometry.setAttribute('position',template.posAttr.clone());geometry.setIndex(template.indices);s.geometries.set(template,geometry);}
		let mesh=s.meshes.get(e);if(!mesh){mesh=new THREE.Mesh(geometry,s.material);s.meshes.set(e,mesh);s.scene.add(mesh);}
		mesh.geometry=geometry;mesh.position.fromArray(e.v.origin);mesh.rotation.set(e.v.angles[2]*Math.PI/180,-e.v.angles[0]*Math.PI/180,e.v.angles[1]*Math.PI/180,'ZYX');seen.add(e);
	}
	for(const [e,mesh]of s.meshes)if(!seen.has(e)){s.scene.remove(mesh);s.meshes.delete(e);}
	const u=s.composite.uniforms;u.tScene.value=source;u.tDepth.value=hdr.depthTexture;u.tNormal.value=hdr.textures[1];u.uNear.value=camera.near;u.uFar.value=camera.far;u.uTime.value=cl.time;
	u.tVisionCoordinates.value=coordinates;u.uVisionCoordinates.value=coordinates?(coordinates.userData?.visionEncoded?2:1):0;
	const saved=renderer.getRenderTarget(),clear=new THREE.Color();renderer.getClearColor(clear);const alpha=renderer.getClearAlpha();
	try{renderer.setRenderTarget(s.mask);renderer.setClearColor(0,0);renderer.clear();renderer.render(s.scene,camera);renderer.setRenderTarget(s.output);renderer.render(s.screen,s.camera);}
	finally{renderer.setClearColor(clear,alpha);renderer.setRenderTarget(saved);}
	return s.output.texture;
}
