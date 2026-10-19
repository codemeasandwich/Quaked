/** The welcome hub's native sky artwork, wherever it is used (sky1 AND sky4).
 * Reuses sky surface meshes, native cloud masks/UV motion, fog and glow. The
 * original panorama is a shared lazy asset; map materials own no source textures.
 * Unknown artwork and explicit named skyboxes retain their existing renderer.
 */
import * as THREE from 'three';
import { R_NewerGame, r_newer_textures } from '../mode.js';
import { R_GlassTextureKey } from './r_newertextures.js';
import { COM_NewerURL } from '../../engine/common/pak.js';
import { R_FogSkyMaterial } from '../../engine/render/r_fog.js';

export const MILKYWAY_SKY_KEYS = Object.freeze( {
 solid: '128x128:5ad746b445c2c41e', alpha: '128x128:b7a1ae6d577f3ae7'
} );
export const MILKYWAY_SKY_URL = new URL( '../../../newer/textures/skies/milkyway.jpeg', import.meta.url ).href;
export const MILKYWAY_CLOUD_OPACITY = .035;
export const MILKYWAY_EXPOSURE = .72, MILKYWAY_CONTRAST = 1.2;
const matches = new WeakMap();
let panorama = null, state = 'idle', error = null, promise = null, layers = null, sourceSolid, sourceAlpha;
const enabled = () => R_NewerGame() && r_newer_textures.value !== 0;
function eligible( solid, alpha ) {
 if ( ! solid || ! alpha ) return false;
 let entry = matches.get( solid );
 if ( ! entry || entry.alpha !== alpha ) {
  entry = { alpha, match: R_GlassTextureKey( solid ) === MILKYWAY_SKY_KEYS.solid && R_GlassTextureKey( alpha ) === MILKYWAY_SKY_KEYS.alpha };
  matches.set( solid, entry );
 }
 return entry.match;
}
function load() {
 if ( state !== 'idle' ) return;
 state = 'loading'; error = null;
 promise = new Promise( resolve => {
  let settled = false, timer;
  const finish = ( texture, failure ) => {
   if ( settled ) { texture?.dispose(); return; }
   settled = true; clearTimeout( timer );
   if ( failure ) { state = 'failed'; error = String( failure?.message ?? failure ); resolve( false ); return; }
   panorama = texture; panorama.colorSpace = THREE.SRGBColorSpace;
   panorama.wrapS = THREE.RepeatWrapping; panorama.wrapT = THREE.ClampToEdgeWrapping;
   panorama.minFilter = THREE.LinearMipmapLinearFilter; panorama.magFilter = THREE.LinearFilter;
   panorama.needsUpdate = true; state = 'ready'; resolve( true );
  };
  timer = setTimeout( () => finish( null, new Error( 'Milky Way sky load timed out' ) ), 30000 );
  try { new THREE.TextureLoader().load( COM_NewerURL( 'newer/textures/skies/milkyway.jpeg', MILKYWAY_SKY_URL ),
   texture => finish( texture ), undefined, failure => finish( null, failure || new Error( 'Milky Way sky unavailable' ) ) ); }
  catch ( failure ) { finish( null, failure ); }
 } );
}
export function R_MilkyWaySkyReady() { return promise ?? Promise.resolve( false ); }
export function R_MilkyWaySkyStatus() { return { state, error }; }

/** Shared direction lookup for normal sky surfaces and existing neighbor views.
 * Quake is Z-up; the equirectangular panorama is stationary in world directions.
 * Native cloud UVs still move independently in front of it.
 */
export function R_MilkyWaySkyGLSL() {
 return `uniform sampler2D tMilkyWay;
vec3 quakedMilkyWay(vec3 direction) {
 vec3 d = normalize(direction);
 vec2 uv = vec2(atan(-d.y, d.x) / 6.283185307179586 + 1.0,
                asin(clamp(d.z, -1.0, 1.0)) / 3.141592653589793 + 0.5);
 return pow(max(texture2D(tMilkyWay, uv).rgb, vec3(0.0)), vec3(${MILKYWAY_CONTRAST.toFixed(2)})) * ${MILKYWAY_EXPOSURE.toFixed(2)};
}
vec3 quakedFaintCloud(vec3 nativeColor) {
 return mix(nativeColor, vec3(0.35, 0.42, 0.55), 0.75);
}`;
}
/** Preview materials keep their own uniform holders, not map-global sky state. */
export function R_MilkyWaySkyUniforms( solid, alpha ) {
 return { solid, alpha, tMilkyWay: { value: null }, uMilkyWay: { value: 0 } };
}
export function R_MilkyWaySkyUpdate( uniforms ) {
 const active = enabled() && eligible( uniforms.solid, uniforms.alpha );
 if ( active ) load();
 uniforms.tMilkyWay.value = panorama;
 uniforms.uMilkyWay.value = active && state === 'ready' ? 1 : 0;
}

/** null means native fallback, including loading/failure. No asynchronous map
 * mutation: a late shared image can only be selected by a new current draw call.
 */
export function R_MilkyWaySkyLayers( solid, alpha ) {
 if ( ! enabled() || ! eligible( solid, alpha ) ) return null;
 load(); if ( state !== 'ready' ) return null;
 if ( layers && sourceSolid === solid && sourceAlpha === alpha ) return layers;
 R_MilkyWaySkyClear(); sourceSolid = solid; sourceAlpha = alpha;
 const background = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } );
 const before = background.onBeforeCompile;
 background.onBeforeCompile = function ( shader, renderer ) {
  before?.call( this, shader, renderer );
  shader.uniforms.tMilkyWay = { value: panorama };
  shader.vertexShader = 'varying vec3 vMilkyWayWorld;\n' + shader.vertexShader.replace( '#include <project_vertex>',
   '#include <project_vertex>\nvMilkyWayWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;' );
  shader.fragmentShader = R_MilkyWaySkyGLSL() + '\nvarying vec3 vMilkyWayWorld;\n' + shader.fragmentShader.replace( '#include <map_fragment>',
   'diffuseColor.rgb *= quakedMilkyWay(vMilkyWayWorld - cameraPosition);' );
 };
 // The shared G-buffer patch specializes on depthWrite at compile time.
 // Keep both variants distinct when the same sky crosses HDR target modes.
 background.customProgramCacheKey = () => 'quaked-milkyway-v2-depth-' + Number( background.depthWrite );
 const clouds = new THREE.MeshBasicMaterial( { map: alpha, side: THREE.DoubleSide, transparent: true,
  opacity: MILKYWAY_CLOUD_OPACITY, alphaTest: 0, depthWrite: false } );
 const cloudBefore = clouds.onBeforeCompile;
 clouds.onBeforeCompile = function ( shader, renderer ) {
  cloudBefore?.call( this, shader, renderer );
  shader.fragmentShader = R_MilkyWaySkyGLSL() + '\n' + shader.fragmentShader.replace( '#include <map_fragment>',
   '#include <map_fragment>\ndiffuseColor.rgb = quakedFaintCloud(diffuseColor.rgb);' );
 };
 clouds.customProgramCacheKey = () => 'quaked-milkyway-cloud-v2';
 layers = { solid: R_FogSkyMaterial( background ), alpha: R_FogSkyMaterial( clouds ) };
 return layers;
}
/** Map-owned materials only. The single shared panorama may finish loading across
 * a map transition, but is never attached to a disposed or nonmatching material.
 */
export function R_MilkyWaySkyClear() {
 layers?.solid.dispose(); layers?.alpha.dispose(); layers = null; sourceSolid = sourceAlpha = null;
 if ( state === 'failed' ) { state = 'idle'; error = null; promise = null; }
}
