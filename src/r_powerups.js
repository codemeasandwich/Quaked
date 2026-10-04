import { R_CreatePowerupFire, R_RenderPowerupFire, R_ClearPowerupFireTarget } from './r_powerupfire.js';
// Enhanced world-pickup presentation only. The native entity/model, collision,
// pickup rules and inventory remain owned by Quake. Main scene Begin/End owns
// lifetime; Classic redraw never mutates this registry.
import * as THREE from 'three';
import { cvar_t } from './cvar.js';
import { R_NewerGame, R_ClassicPassActive } from './r_anim.js';

export const r_powerups = new cvar_t( 'r_powerups', '1', true );
const kinds = { 'progs/quaddama.mdl': 'quad', 'progs/invulner.mdl': 'pentagram', 'progs/invisibl.mdl': 'ring' };
const records = new Map();
const center = new THREE.Vector3(), nativeScale = new THREE.Vector3(), nativeTranslation = new THREE.Vector3();
let activeScene = null;
let shroudTexture = null;
export function R_PowerupKind( entity ) { return kinds[ entity?.model?.name ] || null; }
export function R_PowerupPulse( time ) { return 1 + .12 * Math.sin( time * Math.PI * .65 ); }

const VERTEX = `
#include <clipping_planes_pars_vertex>
varying vec2 vUv;
uniform vec2 uSize;
uniform float uBehind;
uniform float uMode;
void main(){
 vUv=uv;
 vec4 p;
 if(uMode>2.5)p=modelViewMatrix*vec4(position,1.);
 else{
  p=modelViewMatrix*vec4(0.,0.,0.,1.);
  p.z-=uBehind;p.xy+=position.xy*uSize;
 }
 vec4 mvPosition=p;
 #include <clipping_planes_vertex>
 gl_Position=projectionMatrix*p;
}`;
// Shared by the billboard and compositor, so deep-black coverage cannot drift
// from the visible smoke shape. Noise is advected in simulation time.
export const POWERUP_NOISE_GLSL = `
float powerupHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float powerupNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(powerupHash(i),powerupHash(i+vec2(1.,0.)),f.x),mix(powerupHash(i+vec2(0.,1.)),powerupHash(i+vec2(1.)),f.x),f.y);
}
float powerupFbm(vec2 p){return .57*powerupNoise(p)+.28*powerupNoise(p*2.03+7.1)+.15*powerupNoise(p*4.07-3.2);}
`;
export const POWERUP_SHROUD_GLSL = `
float powerupShroud(vec2 uv,float time){
 vec2 p=(uv-.5)*2.;
 float billow=powerupFbm(p*3.-vec2(time*.12,time*.18));
 float radius=length(p)+.16*(billow-.5)+.035*sin(atan(p.y,p.x)*7.+time*.5);
 // Opaque, truly black core; turbulent feathering only at the outside edge.
 float border=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
 return (1.-smoothstep(.58,1.,radius))*smoothstep(0.,.08,border);
}`;
const FRAGMENT = `
#include <clipping_planes_pars_fragment>
varying vec2 vUv;
uniform sampler2D uSurfaceMap;
uniform float uHasSurfaceMap;
uniform float uTime;
uniform float uMode;
uniform vec3 uColor;
uniform float uPulse;
layout(location=1) out highp vec4 gNormal;
layout(location=2) out highp vec4 gAlbedo;
layout(location=3) out highp vec4 gHeightMask;
${POWERUP_NOISE_GLSL}
${POWERUP_SHROUD_GLSL}
void main(){
 #include <clipping_planes_fragment>
 float alpha=0.;vec3 color=uColor;
 if(uMode>2.5){
  vec3 paint=uHasSurfaceMap>.5?texture2D(uSurfaceMap,vUv).rgb:vec3(.35);
  color*=.18+.82*paint;alpha=.18*uPulse;
 }else if(uMode>1.5)alpha=powerupShroud(vUv,uTime);
 else{float radius=length((vUv-.5)*2.);alpha=pow(1.-smoothstep(.05,1.,radius),2.)*.32*uPulse;}
 if(alpha<.003)discard;
 gl_FragColor=vec4(color,alpha);
 gNormal=vec4(0.);gAlbedo=vec4(0.);gHeightMask=vec4(0.);
}`;

function sprite( record, mode, color, width, height, lift, behind = 0, geometry = null ) {
 const material = new THREE.ShaderMaterial( { uniforms: { uTime: { value: 0 }, uMode: { value: mode }, uColor: { value: new THREE.Color( ...color ) },
  uPulse: { value: 1 }, uSurfaceMap: { value: null }, uHasSurfaceMap: { value: 0 }, uSize: { value: new THREE.Vector2( width, height ) }, uBehind: { value: behind } },
  vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthTest: true, depthWrite: false,
  side: mode === 0 || mode === 3 ? THREE.DoubleSide : THREE.FrontSide,
  polygonOffset: mode === 3, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  blending: mode === 2 ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false, clipping: true } );
 const mesh = new THREE.Mesh( geometry || new THREE.PlaneGeometry( 1, 1 ), material );
 mesh.name = 'powerup_' + record.kind + ( mode === 2 ? '_shroud' : mode === 1 ? '_glow' : mode === 3 ? '_surface' : '_flames' );
 mesh.userData.newerOnly = true; mesh.userData.powerupSize = [ width, height ]; mesh.userData.powerupBehind = behind; mesh.frustumCulled = false; mesh.position.z = lift;
 mesh.renderOrder = mode === 2 ? 1 : 2; record.group.add( mesh ); return mesh;
}
// A clear window for the complete native design, including its negative
// spaces. This convex silhouette is only a fire EXCLUSION mask, never a drawn
// circle or replacement glyph. Camera rays account for actual item rotation.
function glyphGuard( record, geometry, localCenter ) {
 const position=geometry.attributes.position, points=[];
 for(let i=0;i<position.count;i++)points.push([position.getY(i)-localCenter.y,position.getZ(i)-localCenter.z]);
 points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const chain=input=>{const out=[];for(const p of input){while(out.length>1&&cross(out[out.length-2],out[out.length-1],p)<=0)out.pop();out.push(p);}out.pop();return out;};
 const hull=[...chain(points),...chain(points.slice().reverse())];
 const box=geometry.boundingBox,margin=1.25,planes=[];
 for(let i=0;i<hull.length;i++){
  const a=hull[i],b=hull[(i+1)%hull.length],dy=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dy,dz);
  if(length>1e-8){const ny=-dz/length,nz=dy/length;planes.push(0,ny,nz,-ny*a[0]-nz*a[1]+margin);}
 }
 planes.push(1,0,0,-(box.min.x-localCenter.x)+margin,-1,0,0,box.max.x-localCenter.x+margin);
 record.glyphPlaneCount=planes.length/4;
 record.glyphPlanes=new THREE.DataTexture(new Float32Array(planes),record.glyphPlaneCount,1,THREE.RGBAFormat,THREE.FloatType);
 record.glyphPlanes.minFilter=record.glyphPlanes.magFilter=THREE.NearestFilter;record.glyphPlanes.generateMipmaps=false;record.glyphPlanes.needsUpdate=true;
}
// Fuel is a scalar distance field derived from the actual native triangles.
// The fire renderer integrates a 3D advected density, not planar flame images.
function nativeFire( record, geometry, flameColor, surfaceColor ) {
 const localCenter=geometry.boundingBox.getCenter(new THREE.Vector3());
 glyphGuard(record,geometry,localCenter);
 record.fire=R_CreatePowerupFire(geometry,localCenter,flameColor,record.glyphPlanes,record.glyphPlaneCount);
 record.fire.mesh.name='powerup_'+record.kind+'_flames';
 // Uniform role metadata is also used by lifecycle/diagnostics, not the fire shader.
 record.fire.mesh.material.uniforms.uMode={value:0};record.fire.mesh.material.uniforms.uPulse={value:1};
 record.group.add(record.fire.mesh);
 const surface=geometry.clone();surface.translate(-localCenter.x,-localCenter.y,-localCenter.z);
 sprite(record,3,surfaceColor,1,1,0,0,surface);
}
function dispose( entity, record ) {
 record.group.removeFromParent();
 record.glyphPlanes?.dispose();
 record.fire?.proxy.removeFromParent(); record.fire?.field.dispose();
 for ( const mesh of record.group.children ) { mesh.geometry.dispose(); mesh.material.dispose(); }
 records.delete( entity );
}
export function R_PowerupClear() {
 for ( const [ entity, record ] of records ) dispose( entity, record );
 shroudTexture?.dispose(); shroudTexture = null; R_ClearPowerupFireTarget();
 activeScene = null;
}
export function R_PowerupBegin( scene ) {
 if ( R_ClassicPassActive() ) return;
 activeScene = scene;
 for ( const record of records.values() ) record.seen = false;
}
export function R_PowerupSeen( entity, nativeMesh, scene, time ) {
 if ( R_ClassicPassActive() ) return null;
 const kind = R_PowerupKind( entity );
 if ( !kind || !nativeMesh || !R_NewerGame() || r_powerups.value === 0 || scene !== activeScene ) return null;
 if ( !nativeMesh.geometry.boundingBox ) nativeMesh.geometry.computeBoundingBox();
 let record = records.get( entity );
 if ( record && ( record.kind !== kind || record.model !== entity.model || record.nativePosition !== nativeMesh.geometry.attributes.position || record.nativeIndex !== nativeMesh.geometry.index ) ) { dispose( entity, record ); record = null; }
 if ( !record ) {
  const group = new THREE.Group(); group.name = 'powerup_' + kind; group.userData.newerOnly = true;
  record = { kind, group, model: entity.model, nativePosition: nativeMesh.geometry.attributes.position, nativeIndex: nativeMesh.geometry.index, seen: true, source: { pos: [ 0, 0, 0 ], color: kind === 'quad' ? [ .55, .08, 1 ] : [ 1, .65, .08 ],
   power: kind === 'quad' ? 1.2 : kind === 'ring' ? 2 : 1, radius: kind === 'ring' ? 90 : 70, emitter: 1, powerup: kind, rotation: [ 0, 0, 0, 1 ], cookie: kind === 'ring' ? 1 : 0 } };
  if ( kind === 'quad' ) {
   sprite( record, 1, [ .7, .08, 1.8 ], 78, 78, 0, 8 );
   nativeFire( record, nativeMesh.geometry, [ 1.5, 1.5, 1.5 ], [ .7, .06, 1.4 ] );
  } else if ( kind === 'pentagram' ) {
   sprite( record, 2, [ 0, 0, 0 ], 100, 116, 4, 25 );
   nativeFire( record, nativeMesh.geometry, [ 2.0, 1.25, .06 ], [ 2.2, 1.3, .035 ] );
  } else sprite( record, 1, [ 2.2, 1.25, .06 ], 28, 28, 0 );
  records.set( entity, record ); scene.add( group );
 }
 nativeMesh.updateMatrixWorld( true );
 if ( !nativeMesh.geometry.boundingBox ) nativeMesh.geometry.computeBoundingBox();
 nativeMesh.geometry.boundingBox.getCenter( center ).applyMatrix4( nativeMesh.matrixWorld );
 record.group.position.copy( center );
 nativeMesh.matrixWorld.decompose( nativeTranslation, record.group.quaternion, nativeScale );
 record.group.scale.copy( nativeScale );
 record.group.quaternion.toArray( record.source.rotation );
 record.group.visible = true; record.seen = true;
 // Source remains at native entity origin plus a fixed model-centre height.
 // Rotation changes the cookie orientation, not the light origin/cube capture.
 const origin = entity.origin;
 record.source.pos[ 0 ] = origin[ 0 ]; record.source.pos[ 1 ] = origin[ 1 ]; record.source.pos[ 2 ] = origin[ 2 ] + nativeMesh.geometry.boundingBox.getCenter( center ).z;
 if ( !nativeMesh.geometry.boundingSphere ) nativeMesh.geometry.computeBoundingSphere();
 const worldScale = nativeMesh.matrixWorld.getMaxScaleOnAxis();
 const radius = nativeMesh.geometry.boundingSphere.radius * worldScale;
 for ( const mesh of record.group.children ) {
  const uniforms = mesh.material.uniforms;
  if ( uniforms.uMode.value === 3 ) { uniforms.uSurfaceMap.value = nativeMesh.material.map || null; uniforms.uHasSurfaceMap.value = nativeMesh.material.map ? 1 : 0; }
  uniforms.uTime.value = time; uniforms.uPulse.value = kind === 'quad' ? R_PowerupPulse( time ) : kind === 'ring' ? .45 : 1;
  // A fixed depth can intersect the oblique/back half of the original model.
  // Bound its full extent plus world-up lift for every viewing direction.
  if ( uniforms.uMode.value > .5 ) {
   uniforms.uSize.value.set( ...mesh.userData.powerupSize ).multiplyScalar( worldScale );
   uniforms.uBehind.value = mesh.userData.powerupBehind * worldScale;
  }
  if ( uniforms.uMode.value === 2 ) uniforms.uBehind.value = radius + Math.abs( mesh.position.z ) * worldScale + 2;
 }
 return record.group;
}
export function R_PowerupEnd() {
 if ( R_ClassicPassActive() ) return;
 for ( const [ entity, record ] of records ) if ( !record.seen || !R_NewerGame() || r_powerups.value === 0 ) dispose( entity, record );
}
export function R_PowerupLights() {
 return R_NewerGame() && r_powerups.value !== 0 ? Array.from( records.values(), record => record.source ) : [];
}
export function R_PowerupStatus() { return { active: R_NewerGame() && r_powerups.value !== 0, pickups: records.size, kinds: Array.from( records.values(), r => r.kind ) }; }

export function R_DrawPowerupFire( renderer, scene, camera, target ) {
 if(!R_NewerGame()||r_powerups.value===0)return 0;
 const fires=[];
 for(const record of records.values())if(record.fire&&record.group.parent===scene&&record.group.visible&&record.fire.mesh.visible){
  let visible=true;for(let p=scene;p;p=p.parent)if(!p.visible)visible=false;
  if(visible)fires.push(record.fire);
 }
 return R_RenderPowerupFire(renderer,camera,target,fires);
}

// Two float texels per visible shroud avoid a second scene draw, another MRT,
// or an artificial eight-pickup cutoff. Cardinality is the existing visible
// entity set. The compositor reconstructs exactly the billboard already drawn.
export function R_PowerupShroudFrame( scene, camera ) {
 const visible = [];
 if ( R_NewerGame() && r_powerups.value !== 0 ) for ( const record of records.values() ) {
  if ( record.kind !== 'pentagram' || record.group.parent !== scene || !record.group.visible ) continue;
  let shown = true; for ( let p = scene; p; p = p.parent ) if ( !p.visible ) shown = false;
  const mesh = record.group.children.find( child => child.material.uniforms.uMode.value === 2 );
  if ( shown && mesh?.visible ) visible.push( mesh );
 }
 if ( !visible.length ) return { count: 0, texture: null };
 if ( !shroudTexture || shroudTexture.image.height < visible.length ) {
  shroudTexture?.dispose();
  shroudTexture = new THREE.DataTexture( new Float32Array( visible.length * 8 ), 2, visible.length, THREE.RGBAFormat, THREE.FloatType );
  shroudTexture.minFilter = shroudTexture.magFilter = THREE.NearestFilter;
  shroudTexture.generateMipmaps = false;
 }
 for ( let i = 0; i < visible.length; i ++ ) {
  const mesh = visible[ i ], u = mesh.material.uniforms;
  mesh.getWorldPosition( center ).applyMatrix4( camera.matrixWorldInverse );
  shroudTexture.image.data.set( [ center.x, center.y, center.z - u.uBehind.value, u.uSize.value.x,
   u.uSize.value.y, u.uTime.value, 0, 0 ], i * 8 );
 }
 shroudTexture.needsUpdate = true;
 return { count: visible.length, texture: shroudTexture };
}

export const POWERUP_SHROUD_COMPOSITE_GLSL = `
uniform sampler2D tPowerupShrouds;
uniform int uPowerupShroudCount;
${POWERUP_NOISE_GLSL}
${POWERUP_SHROUD_GLSL}
float powerupShroudMask(vec2 uv){
 if(uPowerupShroudCount==0)return 0.;
 vec4 a=uProjInv*vec4(uv*2.-1.,-1.,1.),b=uProjInv*vec4(uv*2.-1.,1.,1.);
 vec3 nearPoint=a.xyz/a.w,farPoint=b.xyz/b.w;
 float opaqueDepth=texture2D(tDepth,uv).r,coverage=0.;
 for(int i=0;i<uPowerupShroudCount;i++){
  vec4 plane=texelFetch(tPowerupShrouds,ivec2(0,i),0),shape=texelFetch(tPowerupShrouds,ivec2(1,i),0);
  float t=(plane.z-nearPoint.z)/(farPoint.z-nearPoint.z);
  if(t<0.||t>1.)continue;
  vec3 hit=mix(nearPoint,farPoint,t);
  vec2 local=(hit.xy-plane.xy)/vec2(plane.w,shape.x)+.5;
  if(any(lessThan(local,vec2(0.)))||any(greaterThan(local,vec2(1.))))continue;
  vec4 clip=uProj*vec4(hit,1.);
  // The opaque symbol and foreground walls always win, just as they do in
  // the sprite's depth test. No screen-space black disc over the item.
  if(clip.z/clip.w*.5+.5>opaqueDepth)continue;
  float alpha=powerupShroud(local,shape.y);
  if(alpha>=.003)coverage+=alpha*(1.-coverage);
 }
 return coverage;
}`;

// World-direction cookie: periodic azimuth avoids a wrap seam, elevation gives
// upward licking silhouettes on surrounding walls. All cameras sample the same
// item-local field, and existing point/height shadow visibility is applied afterward.
export const POWERUP_COOKIE_GLSL = `
vec3 powerupLocalDirection(vec3 direction,vec4 rotation){
 vec3 q=-rotation.xyz;
 return direction+2.*cross(q,cross(q,direction)+rotation.w*direction);
}
float powerupFlameCookie(vec3 direction,float time){
 float azimuth=atan(direction.y,direction.x);
 float elevation=direction.z/max(length(direction.xy),.01);
 float rise=elevation+.65;
 float curl=sin(elevation*5.-time*1.8+sin(azimuth*3.+elevation*2.-time*.7));
 float phase=azimuth*7.+curl*1.8+.65*sin(azimuth*5.-time*1.3);
 float tongue=.65+.75*(.5+.5*sin(azimuth*5.-time*.9));
 float stripe=pow(.5+.5*cos(phase),3.);
 float flame=stripe*(1.-smoothstep(tongue*.35,tongue,rise))*smoothstep(-.2,.15,rise);
 return .07+2.3*flame;
}`;
