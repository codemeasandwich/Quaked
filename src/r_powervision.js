// Supplied MIT vision shaders, adapted to Quaked's existing linear MRT pass.
// No second animation loop, scene traversal, gameplay timer or HUD pass.
import * as THREE from 'three';
import { FULLSCREEN_VERTEX, UNSEEN_FRAGMENT, HISTORY_FRAGMENT, DEMON_FRAGMENT } from './powervision_shaders.js';
import { PowerVisionHistory } from './powervision_state.js';
import { VISION_COORDINATES_GLSL, VISION_PREVIOUS_COORDINATES_GLSL } from './vision_coordinates.js';

export const POWER_VISION_PRESETS = Object.freeze({
	ring: Object.freeze({ flow: 1.05, trails: .84, glow: 1.15, mist: 1.05, vignette: .72 }),
	demon: Object.freeze({ ink: 1, threshold: .13, relief: 1.65, edges: .8, glow: 1.4, whites: .86, worldFloor: .00065 })
});

export function PowerVisionAdapt(source) {
	// The .065 subtype remains inside the existing actor receiver interval.
	// It denotes enemy pigment; .06 pickups and .08 held/player coats do not
	// become subjects. No authored ink map exists, so B=0 selects donor fallback.
	const albedo = source.includes('tAlbedo;') ? '' : 'uniform sampler2D tAlbedo;\n';
	const helpers = `${albedo}${VISION_COORDINATES_GLSL}
vec4 visionNormal(vec2 uv){return texture(tNormal,visionRawUV(uv));}
vec4 visionAlbedo(vec2 uv){return texture(tAlbedo,visionRawUV(uv));}
vec4 visionMask(vec2 uv) {
 float tag=visionAlbedo(uv).a;
 return vec4(float(tag>.063 && tag<.067),0.,0.,1.);
}
vec4 visionDepthPacket(vec2 uv) {
 float depth=texture(tDepth,visionRawUV(uv)).r;
 float packet=visionNormal(uv).a;
 if(packet < -2.) {
  float distance=-packet-2.;
  depth=(uFar-uNear*uFar/max(distance,uNear))/(uFar-uNear);
 }
 return vec4(depth);
}
`;
	let adapted=source.replaceAll('texture(tMask,', 'visionMask(')
		.replaceAll('texture(tNormal,','visionNormal(').replaceAll('texture(tAlbedo,','visionAlbedo(')
		.replaceAll('texture(tDepth,', 'visionDepthPacket(')
		.replaceAll('vec4(uv*2.0-1.0,','vec4(visionRawUV(uv)*2.0-1.0,')
		.replace(/\n(?=(?:float|vec[234]|void) \w+\()/, '\n' + helpers);
	if(source===HISTORY_FRAGMENT) {
		adapted=adapted.replace('out vec4 fragColor;','layout(location=0) out vec4 fragColor;\nlayout(location=1) out vec4 historyCoordinates;')
			.replace('void main() {',VISION_PREVIOUS_COORDINATES_GLSL+'\nvoid main() {\nhistoryCoordinates=visionEncodeUV(visionRawUV(vUv));')
			.replace('vec4(vUv*2.0-1.0,d*2.0-1.0,1.0)','vec4(visionRawUV(vUv)*2.0-1.0,d*2.0-1.0,1.0)')
			.replace('float phase=vUv.y','vec3 remapped=visionPreviousUV(prevUV);prevUV=remapped.xy;\n  float phase=vUv.y')
			.replace('uValid*accept;','uValid*accept*remapped.z;');
	}
	return adapted;
}

let pipeline = null, previous = null, sequence = 0;
const contexts = new WeakSet();
function target(w, h, count=1) {
	const result=new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,count });
	if(count>1){result.textures[1].type=THREE.UnsignedByteType;result.textures[1].userData.visionEncoded=true;result.textures[1].minFilter=result.textures[1].magFilter=THREE.NearestFilter;}
	return result;
}
function create(w, h) {
	const ring=POWER_VISION_PRESETS.ring,demon=POWER_VISION_PRESETS.demon;
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
	const uniforms = {};
	for (const name of ['tScene','tCurrent','tHistory','tDepth','tNormal','tMask','tAlbedo','tVisionCoordinates','tPreviousCoordinates']) uniforms[name] = { value: null };
	for (const name of ['uInvProjection','uCameraWorld','uInvViewProjection','uPreviousViewProjection']) uniforms[name] = { value: new THREE.Matrix4() };
	uniforms.uWorldUp = { value: new THREE.Vector3(0,0,1) };
	uniforms.uResolution = { value: new THREE.Vector2(w,h) };
	for (const [name,value] of Object.entries({uNear:4,uFar:4096,uWorldScale:1/32,uProtectViewmodel:1,
		uTime:0,uDelta:0,uValid:0,uAmount:1,uDebug:0,uHasAlbedo:1,uAccentMode:0,uVisionCoordinates:0,uPreviousCoordinates:0,
		uFlow:ring.flow,uTrails:ring.trails,uGlow:ring.glow,uMist:ring.mist,uVignette:ring.vignette,uInk:demon.ink,uThreshold:demon.threshold,
		uRelief:demon.relief,uEdges:demon.edges,uWhites:demon.whites,uWorldFloor:demon.worldFloor})) uniforms[name] = {value};
	const materials = [UNSEEN_FRAGMENT,HISTORY_FRAGMENT,DEMON_FRAGMENT].map(source => new THREE.RawShaderMaterial({
		glslVersion: THREE.GLSL3, vertexShader: FULLSCREEN_VERTEX, fragmentShader: PowerVisionAdapt(source),
		uniforms, depthTest:false, depthWrite:false, blending:THREE.NoBlending
	}));
	const scene = new THREE.Scene(), camera = new THREE.Camera(), mesh = new THREE.Mesh(geometry, materials[0]);
	mesh.frustumCulled = false; scene.add(mesh);
	return {width:w,height:h,uniforms,materials,scene,camera,mesh,geometry,current:target(w,h),history:[],index:0};
}

export function R_PowerVisionReset(dispose = false) {
	previous = null; sequence++;
	if (dispose && pipeline) {
		pipeline.current.dispose(); pipeline.history.forEach(t => t.dispose());
		pipeline.materials.forEach(m => m.dispose()); pipeline.geometry.dispose(); pipeline = null;
	}
}

export function R_PowerVisionRender(renderer, source, hdr, camera, mode, client, coordinates=null) {
	if (renderer.domElement && !contexts.has(renderer.domElement)) {
		contexts.add(renderer.domElement);
		renderer.domElement.addEventListener('webglcontextlost',()=>R_PowerVisionReset(true));
	}
	if (!mode) { R_PowerVisionReset(); return source; }
	if (!pipeline || pipeline.width !== hdr.width || pipeline.height !== hdr.height) {
		R_PowerVisionReset(true); pipeline = create(hdr.width,hdr.height);
	}
	const p=pipeline, u=p.uniforms, e=camera.matrixWorld.elements;
	if(mode===1 && p.history.length===0)p.history=[target(hdr.width,hdr.height,2),target(hdr.width,hdr.height,2)];
	const frame={mode,world:client.worldmodel,view:client.viewentity,width:hdr.width,height:hdr.height,
		time:client.time,origin:[e[12],e[13],e[14]],forward:[-e[8],-e[9],-e[10]],projection:camera.projectionMatrix.elements.slice()};
	const valid=PowerVisionHistory(previous,frame), delta=previous?Math.max(0,Math.min(.1,frame.time-previous.time)):0;
	// Still draw the current view while paused (FOV/settings can change), but
	// never accumulate history feedback without simulation time advancing.
	u.tScene.value=source; u.tDepth.value=hdr.depthTexture;
	u.tVisionCoordinates.value=coordinates;u.uVisionCoordinates.value=coordinates?(coordinates.userData?.visionEncoded?2:1):0;
	u.tPreviousCoordinates.value=p.history[p.index]?.textures[1]||null;u.uPreviousCoordinates.value=previous?2:0;
	u.tNormal.value=hdr.textures[1]; u.tAlbedo.value=hdr.textures[2];
	u.uNear.value=camera.near; u.uFar.value=camera.far; u.uTime.value=client.time;
	u.uInvProjection.value.copy(camera.projectionMatrixInverse); u.uCameraWorld.value.copy(camera.matrixWorld);
	u.uInvViewProjection.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
	u.uDelta.value=delta; u.uValid.value=valid&&delta>0?1:0; u.uGlow.value=mode===1?POWER_VISION_PRESETS.ring.glow:POWER_VISION_PRESETS.demon.glow;
	const saved=renderer.getRenderTarget();
	const render=(material,output)=>{p.mesh.material=material;renderer.setRenderTarget(output);renderer.render(p.scene,p.camera);};
	try {
		// The held gun: the Unseen World draws it as it draws the enemies (gl_rmain tags it a subject); Demon vision keeps it
		// as it is. The history pass always keeps it out of the trails: it moves with the eye, so its echo would smear.
		u.uProtectViewmodel.value=mode===1?0:1;
		render(p.materials[mode===1?0:2],p.current);
		u.uProtectViewmodel.value=1;
		if (mode===1) {
			u.tCurrent.value=p.current.texture; u.tHistory.value=p.history[p.index].texture;
			const next=1-p.index;
			render(p.materials[1],p.history[next]);
			p.index=next; // Publish only a successfully completed history frame.
		}
	} finally { renderer.setRenderTarget(saved); }
	u.uPreviousViewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
	previous=frame;
	return mode===1?p.history[p.index].texture:p.current.texture;
}

export function R_PowerVisionStatus() {
	return {mode:previous?.mode||0,width:pipeline?.width||0,height:pipeline?.height||0,sequence};
}
