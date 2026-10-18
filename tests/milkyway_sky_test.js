// Independent native-source -> public Milky Way selection/material -> public
// sky-chain proof. Only JPEG transport is doubled; no WebGL render is claimed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { assetPath } from '../tools/distribution/manifest.mjs';
import { COM_AddPack, COM_BuildPack, COM_LoadPackFile } from '../src/engine/common/pak.js';
import { R_InitSky } from '../src/engine/render/gl_warp.js';
import { VID_SetPalette, d_8to24table } from '../src/engine/render/vid.js';
import { set_solidskytexture, set_alphaskytexture, solidskytexture, alphaskytexture } from '../src/engine/render/gl_model.js';
import { R_DrawSkyChain, R_SkyClear, R_LiquidsBeginFrame, R_LiquidsClear, R_CleanupWaterMeshes } from '../src/engine/render/gl_rsurf_liquids.js';
import { worldState } from '../src/engine/render/gl_rsurf_state.js';
import { R_SkyBoxSet, R_SkyBoxMaterial } from '../src/engine/render/r_skybox.js';
import { R_FogNewMap } from '../src/engine/render/r_fog.js';
import { realtime, set_realtime } from '../src/engine/common/host_state.js';
import { r_origin } from '../src/engine/render/render.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import * as mode from '../src/newer/mode.js';
import * as vars from '../src/engine/common/cvar.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { postState, classicLook } from '../src/newer/render/r_post_state.js';
import { R_PostInstallGBufferPatch } from '../src/newer/render/r_post_gbuffer.js';
import { cls } from '../src/engine/client/client.js';

const root = fileURLToPath( new URL( '../', import.meta.url ) );
const bytes = readFileSync( assetPath( root, 'games/shareware/pak0.pak' ) );
const pack = COM_LoadPackFile( 'milkyway-native-source.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) );
const rawFile = name => { const entry = pack.files.find( file => file.name === name ); assert.ok( entry, 'native source contains ' + name ); return Buffer.from( pack.data, entry.filepos, entry.filelen ); };
VID_SetPalette( rawFile( 'gfx/palette.lmp' ) );
function nativeSky( map = 'start', name = 'sky1' ) {
 const bsp = rawFile( 'maps/' + map + '.bsp' ), base = bsp.readInt32LE( 20 ), count = bsp.readInt32LE( base );
 for ( let i = 0; i < count; i++ ) {
  const offset = bsp.readInt32LE( base + 4 + i * 4 ); if ( offset < 0 ) continue;
  const at = base + offset; if ( bsp.toString( 'latin1', at, at + 16 ).split( '\0' )[ 0 ] !== name ) continue;
  const width = bsp.readInt32LE( at + 16 ), height = bsp.readInt32LE( at + 20 ), pixels = bsp.subarray( at + bsp.readInt32LE( at + 24 ), at + bsp.readInt32LE( at + 24 ) + width * height );
  assert.equal( width, 256 ); assert.equal( height, 128 );
  const result = R_InitSky( { data: pixels, offsets: [ 0 ] }, d_8to24table );
  result.solidTexture.name = result.alphaTexture.name = name; return result;
 }
 throw Error( 'Native map has no ' + name + ': ' + map );
}
const hash = data => createHash( 'sha256' ).update( data ).digest( 'hex' );
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
let fixtureId = 0;
async function fixture( run, { canonical = false } = {} ) {
 const oldLoad = THREE.TextureLoader.prototype.load, documentDescriptor = Object.getOwnPropertyDescriptor( globalThis, 'document' ), oldDemo = cls.demoplayback, oldClassic = mode.R_ClassicPassActive();
 const controls = [ r_hdr, mode.r_newer_textures ]; for ( const control of controls ) if ( ! vars.Cvar_FindVar( control.name ) ) vars.Cvar_RegisterVariable( control );
 const values = controls.map( control => control.string ), requests = [], owned = [];
 const sky = ( map, name ) => { const result = nativeSky( map, name ); owned.push( result.solidTexture, result.alphaTexture ); return result; };
 THREE.TextureLoader.prototype.load = function ( url, onLoad, progress, onError ) {
  const texture = new THREE.Texture(); texture.image = { width: 4096, height: 2048 }; let disposed = 0; texture.addEventListener( 'dispose', () => disposed++ );
  const request = { url: String( url ), texture, disposed: () => disposed, success() { onLoad( texture ); }, fail() { onError( new Error( 'independent JPEG transport failure' ) ); } };
  requests.push( request ); return texture;
 };
 Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } );
 let api;
 try {
  controls.forEach( control => vars.Cvar_SetValue( control.name, 1 ) ); mode.R_AnimSetClassicPass( false ); cls.demoplayback = false;
  api = await import( '../src/newer/render/r_milkywaysky.js' + ( canonical ? '' : '?independent-sky-' + ++fixtureId ) );
  await run( { api, requests, sky, load: async () => { assert.equal( requests.length, 1 ); requests[ 0 ].success(); assert.equal( await api.R_MilkyWaySkyReady(), true ); await flush(); } } );
 } finally {
  for ( const request of requests ) if ( api?.R_MilkyWaySkyStatus().state === 'loading' ) request.fail();
  await flush(); api?.R_MilkyWaySkyClear(); if ( ! canonical ) requests.forEach( request => request.texture.dispose() ); owned.forEach( texture => texture.dispose() );
  THREE.TextureLoader.prototype.load = oldLoad; controls.forEach( ( control, i ) => vars.Cvar_Set( control.name, values[ i ] ) ); mode.R_AnimSetClassicPass( oldClassic ); cls.demoplayback = oldDemo;
  if ( documentDescriptor ) Object.defineProperty( globalThis, 'document', documentDescriptor ); else delete globalThis.document;
 }
}
const layersFor = ( api, native ) => api.R_MilkyWaySkyLayers( native.solidTexture, native.alphaTexture );
const compile = material => { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader }; material.onBeforeCompile( shader, null ); return shader; };

Deno.test( 'native sky1 and matching sky4 pixels qualify, while the unrelated same-name E1M1 sky remains native', () => fixture( async ( { api, requests, sky, load } ) => {
 const welcome = sky( 'start', 'sky1' ), sameArt = sky( 'e1m5', 'sky4' ), otherSky4 = sky( 'e1m1', 'sky4' );
 for ( const native of [ welcome, sameArt ] ) { assert.equal( R_GlassTextureKey( native.solidTexture ), api.MILKYWAY_SKY_KEYS.solid ); assert.equal( R_GlassTextureKey( native.alphaTexture ), api.MILKYWAY_SKY_KEYS.alpha ); }
 assert.notEqual( R_GlassTextureKey( otherSky4.solidTexture ), api.MILKYWAY_SKY_KEYS.solid );
 assert.equal( layersFor( api, otherSky4 ), null ); assert.equal( requests.length, 0, 'a shared texture name alone never fetches the panorama' );
 assert.equal( layersFor( api, welcome ), null ); assert.equal( api.R_MilkyWaySkyStatus().state, 'loading' ); assert.equal( layersFor( api, sameArt ), null ); assert.equal( requests.length, 1, 'matching maps share one lazy image' );
 await load(); const first = layersFor( api, welcome ); assert.ok( first?.solid.isMeshBasicMaterial && first?.alpha.isMeshBasicMaterial );
 assert.ok( layersFor( api, sameArt ) ); assert.equal( layersFor( api, otherSky4 ), null );
} ) );
Deno.test( 'both complete native RGBA identities are required and same-name altered pixels do not match', () => fixture( async ( { api, requests, sky } ) => {
 const original = sky( 'start', 'sky1' ), changedSolid = sky( 'start', 'sky1' ), changedAlpha = sky( 'start', 'sky1' );
 changedSolid.solidTexture.image.data[ 0 ] ^= 1; changedAlpha.alphaTexture.image.data[ 0 ] ^= 1;
 assert.equal( api.R_MilkyWaySkyLayers( changedSolid.solidTexture, original.alphaTexture ), null );
 assert.equal( api.R_MilkyWaySkyLayers( original.solidTexture, changedAlpha.alphaTexture ), null );
 assert.equal( api.R_MilkyWaySkyLayers( original.solidTexture, null ), null ); assert.equal( api.R_MilkyWaySkyLayers( null, original.alphaTexture ), null );
 assert.equal( requests.length, 0 ); assert.equal( api.R_MilkyWaySkyStatus().state, 'idle' );
} ) );
Deno.test( 'Classic, split Classic and texture-off avoid loading; Newer demo sky follows the existing visual mode', () => fixture( async ( { api, requests, sky, load } ) => {
 const native = sky( 'start', 'sky1' );
 vars.Cvar_SetValue( 'r_hdr', 0 ); assert.equal( layersFor( api, native ), null ); vars.Cvar_SetValue( 'r_hdr', 1 );
 mode.R_AnimSetClassicPass( true ); assert.equal( layersFor( api, native ), null ); mode.R_AnimSetClassicPass( false );
 vars.Cvar_SetValue( 'r_newer_textures', 0 ); assert.equal( layersFor( api, native ), null ); assert.equal( requests.length, 0 );
 vars.Cvar_SetValue( 'r_newer_textures', 1 ); cls.demoplayback = true; assert.equal( layersFor( api, native ), null ); await load(); assert.ok( layersFor( api, native ), 'Newer half of a demo can draw the selected artwork' );
 mode.R_AnimSetClassicPass( true ); assert.equal( layersFor( api, native ), null ); mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 0 ); assert.equal( layersFor( api, native ), null );
} ) );
Deno.test( 'JPEG failure preserves native fallback, records the error and retries only after an explicit map clear', () => fixture( async ( { api, requests, sky } ) => {
 const native = sky( 'start', 'sky1' ), solid = native.solidTexture.image, alpha = native.alphaTexture.image;
 assert.equal( layersFor( api, native ), null ); requests[ 0 ].fail(); assert.equal( await api.R_MilkyWaySkyReady(), false );
 assert.equal( api.R_MilkyWaySkyStatus().state, 'failed' ); assert.match( api.R_MilkyWaySkyStatus().error, /transport failure/ );
 for ( let i = 0; i < 20; i++ ) assert.equal( layersFor( api, native ), null ); assert.equal( requests.length, 1, 'no per-frame decoder retry' );
 assert.equal( native.solidTexture.image, solid ); assert.equal( native.alphaTexture.image, alpha );
 api.R_MilkyWaySkyClear(); assert.equal( api.R_MilkyWaySkyStatus().state, 'idle' ); assert.equal( layersFor( api, native ), null ); assert.equal( requests.length, 2 ); requests[ 1 ].success(); assert.equal( await api.R_MilkyWaySkyReady(), true ); assert.ok( layersFor( api, native ) );
} ) );
Deno.test( 'a shared asynchronous image arriving after map clear cannot activate stale or unrelated map materials', () => fixture( async ( { api, requests, sky } ) => {
 const previous = sky( 'start', 'sky1' ), next = sky( 'e1m1', 'sky4' ); assert.equal( layersFor( api, previous ), null ); api.R_MilkyWaySkyClear();
 assert.equal( layersFor( api, next ), null ); requests[ 0 ].success(); assert.equal( await api.R_MilkyWaySkyReady(), true ); assert.equal( layersFor( api, next ), null, 'nonmatching current map keeps native sky after late decode' );
 const current = sky( 'e1m5', 'sky4' ); assert.ok( layersFor( api, current ), 'a later eligible draw may reuse the shared asset' ); assert.equal( requests.length, 1 );
} ) );
Deno.test( 'panorama uses world direction and shared fog; faint clouds preserve the exact native alpha and original pixels', () => fixture( async ( { api, requests, sky, load } ) => {
 const native = sky( 'start', 'sky1' ), solidImage = native.solidTexture.image, alphaImage = native.alphaTexture.image, solidBytes = hash( solidImage.data ), alphaBytes = hash( alphaImage.data );
 layersFor( api, native ); await load(); const layers = layersFor( api, native ), background = compile( layers.solid ), cloud = compile( layers.alpha );
 assert.equal( background.uniforms.tMilkyWay.value, requests[ 0 ].texture ); assert.match( background.vertexShader, /modelMatrix\s*\*\s*vec4\(\s*transformed/ );
 assert.match( background.fragmentShader, /quakedMilkyWay\(vMilkyWayWorld\s*-\s*cameraPosition\)/ ); assert.match( background.fragmentShader, /atan\(-d\.y,\s*d\.x\)\s*\/\s*6\.283185307179586\s*\+\s*1\.0/ ); assert.match( background.fragmentShader, /asin\(clamp\(d\.z/ );
 const uvBody = /vec2 uv = vec2\(([\s\S]+?)\);/.exec( background.fragmentShader )?.[ 1 ]; assert.ok( uvBody );
 const actualUV = new Function( 'd', 'atan', 'asin', 'clamp', 'return [' + uvBody + '];' );
 for ( const [ direction, expected ] of [ [ { x: 1, y: 0, z: 0 }, [ 0, .5 ] ], [ { x: 0, y: -1, z: 0 }, [ .25, .5 ] ], [ { x: -1, y: 0, z: 0 }, [ .5, .5 ] ], [ { x: 0, y: 1, z: 0 }, [ .75, .5 ] ], [ { x: 0, y: 0, z: 1 }, [ 0, 1 ] ], [ { x: 0, y: 0, z: -1 }, [ 0, 0 ] ] ] ) {
  const uv = actualUV( direction, Math.atan2, Math.asin, ( value, min, max ) => Math.max( min, Math.min( max, value ) ) ); uv[ 0 ] = ( uv[ 0 ] % 1 + 1 ) % 1; uv.forEach( ( value, i ) => assert.ok( Math.abs( value - expected[ i ] ) < 1e-9, 'actual GLSL projection follows the chosen native Z-up direction anchors' ) );
 }
 assert.ok( background.uniforms.uQuakedSkyFog && cloud.uniforms.uQuakedSkyFog ); assert.equal( background.uniforms.uQuakedSkyFog, cloud.uniforms.uQuakedSkyFog ); R_FogNewMap( '{ "classname" "worldspawn" "skyfog" "0.23" }' ); assert.equal( background.uniforms.uQuakedSkyFog.value, .23, 'existing compiled layers observe live map sky fog' ); assert.match( background.fragmentShader, /mix\( gl_FragColor\.rgb, fogColor, uQuakedSkyFog \)/ );
 assert.equal( layers.alpha.map, native.alphaTexture ); assert.equal( layers.alpha.transparent, true ); assert.equal( layers.alpha.opacity, .012 ); assert.equal( layers.alpha.alphaTest, 0 ); assert.equal( layers.alpha.depthWrite, false );
 assert.ok( cloud.fragmentShader.includes( '#include <map_fragment>' ) && cloud.fragmentShader.includes( 'quakedFaintCloud(diffuseColor.rgb)' ), 'native texture alpha remains in normal map sampling while only cloud RGB is lightened' );
 assert.equal( native.solidTexture.image, solidImage ); assert.equal( native.alphaTexture.image, alphaImage ); assert.equal( hash( solidImage.data ), solidBytes ); assert.equal( hash( alphaImage.data ), alphaBytes );
 assert.equal( requests[ 0 ].texture.colorSpace, THREE.SRGBColorSpace ); assert.equal( requests[ 0 ].texture.wrapS, THREE.RepeatWrapping ); assert.equal( requests[ 0 ].texture.wrapT, THREE.ClampToEdgeWrapping );
} ) );
Deno.test( 'map clear disposes replacement materials exactly once while preserving shared JPEG and borrowed native textures', () => fixture( async ( { api, requests, sky, load } ) => {
 const native = sky( 'start', 'sky1' ); layersFor( api, native ); await load(); const first = layersFor( api, native ); assert.equal( layersFor( api, native ), first );
 const disposed = { solid: 0, alpha: 0, nativeSolid: 0, nativeAlpha: 0 }; first.solid.addEventListener( 'dispose', () => disposed.solid++ ); first.alpha.addEventListener( 'dispose', () => disposed.alpha++ ); native.solidTexture.addEventListener( 'dispose', () => disposed.nativeSolid++ ); native.alphaTexture.addEventListener( 'dispose', () => disposed.nativeAlpha++ );
 api.R_MilkyWaySkyClear(); api.R_MilkyWaySkyClear(); assert.deepEqual( disposed, { solid: 1, alpha: 1, nativeSolid: 0, nativeAlpha: 0 } ); assert.equal( requests[ 0 ].disposed(), 0 ); assert.equal( api.R_MilkyWaySkyStatus().state, 'ready' );
 const second = layersFor( api, native ); assert.notEqual( second.solid, first.solid ); assert.notEqual( second.alpha, first.alpha ); assert.equal( requests.length, 1 );
} ) );
Deno.test( 'the shipped Milky Way JPEG retains the supplied archive member byte for byte and full panorama dimensions', async () => {
 const image = readFileSync( new URL( '../newer/textures/skies/milkyway.jpeg', import.meta.url ) ), provenance = JSON.parse( readFileSync( new URL( '../newer/textures/skies/MILKYWAY-PROVENANCE.json', import.meta.url ), 'utf8' ) );
 const expected = 'a77472cc4237fb0b5655cd344cf0768a547102ab0cebe67ab053e66749e92755'; assert.equal( hash( image ), expected ); assert.equal( provenance.imageSha256, expected ); assert.equal( provenance.modified, false ); assert.equal( image.length, 4376252 );
 assert.equal( image.readUInt16BE( 0 ), 0xffd8 ); let dimensions;
 for ( let at = 2; at < image.length - 9; ) { assert.equal( image[ at++ ], 0xff ); let marker = image[ at++ ]; while ( marker === 0xff ) marker = image[ at++ ]; const length = image.readUInt16BE( at ); if ( [ 0xc0, 0xc1, 0xc2, 0xc3 ].includes( marker ) ) { dimensions = [ image.readUInt16BE( at + 5 ), image.readUInt16BE( at + 3 ) ]; break; } at += length; }
 assert.deepEqual( dimensions, [ 4096, 2048 ] ); assert.deepEqual( [ provenance.width, provenance.height ], dimensions );
} );

function surface() { return { polys: { numverts: 4, next: null, verts: [ [ -64, -64, 128 ], [ 64, -64, 128 ], [ 64, 64, 128 ], [ -64, 64, 128 ] ] }, texturechain: null }; }
function cubeTGA() { const image = new Uint8Array( 18 + 12 ); image[ 2 ] = 2; image[ 12 ] = image[ 14 ] = 2; image[ 16 ] = 24; image.fill( 128, 18 ); return image; }
Deno.test( 'public sky-chain draws the lazy panorama on existing meshes, keeps native clouds and gives explicit cubeskies precedence', () => fixture( async ( { api, requests, sky, load } ) => {
 const native = sky( 'start', 'sky1' ), old = { solid: solidskytexture, alpha: alphaskytexture, group: worldState.group, renderGroup: worldState.renderGroup, origin: Array.from( r_origin ), realtime };
 try {
  R_SkyClear(); R_LiquidsClear(); worldState.group = new THREE.Group(); worldState.renderGroup = worldState.group; set_solidskytexture( native.solidTexture ); set_alphaskytexture( native.alphaTexture ); r_origin.fill( 0 ); set_realtime( 1 ); R_SkyBoxSet( '' );
  const face = surface(); R_LiquidsBeginFrame(); R_DrawSkyChain( face ); assert.equal( requests.length, 1 ); assert.equal( face._skyMesh.material.map, native.solidTexture, 'loading uses existing native sky material' ); const mesh = face._skyMesh, cloudMesh = face._skyMesh2, geometry = mesh.geometry; const positions = Array.from( geometry.attributes.position.array );
  await load(); R_LiquidsBeginFrame(); R_DrawSkyChain( face ); assert.equal( face._skyMesh, mesh ); assert.equal( mesh.geometry, geometry ); assert.equal( mesh.material, layersFor( api, native ).solid ); assert.equal( cloudMesh.material.opacity, .012 ); assert.equal( cloudMesh.material.map, native.alphaTexture ); assert.deepEqual( Array.from( geometry.attributes.position.array ), positions );
  const background = compile( mesh.material ), cloudsBefore = Array.from( cloudMesh.geometry.attributes.uv.array ); set_realtime( 5 ); r_origin.set( [ 20, 30, 10 ] ); R_LiquidsBeginFrame(); R_DrawSkyChain( face ); assert.equal( mesh.material, layersFor( api, native ).solid ); assert.match( background.fragmentShader, /vMilkyWayWorld\s*-\s*cameraPosition/ ); assert.notDeepEqual( Array.from( cloudMesh.geometry.attributes.uv.array ), cloudsBefore, 'native cloud UV motion continues independently' );
  mode.R_AnimSetClassicPass( true ); R_LiquidsBeginFrame(); R_DrawSkyChain( face ); assert.equal( mesh.material.map, native.solidTexture ); assert.equal( cloudMesh.material.opacity, 1 ); mode.R_AnimSetClassicPass( false );
  const files = [ 'rt', 'bk', 'lf', 'ft', 'up', 'dn' ].map( suffix => ( { name: 'gfx/env/milky-independent-' + suffix + '.tga', data: cubeTGA() } ) ); COM_AddPack( COM_LoadPackFile( 'milky-independent-cube.pak', COM_BuildPack( files ) ) ); assert.equal( R_SkyBoxSet( 'milky-independent-' ), true );
  R_LiquidsBeginFrame(); R_DrawSkyChain( face ); R_CleanupWaterMeshes(); assert.equal( mesh.material, R_SkyBoxMaterial() ); assert.equal( cloudMesh.parent, null, 'no added cloud layer over an explicit cube sky' ); assert.equal( requests.length, 1 );
  const { R_BuildLevelView } = await import( '../src/newer/render/r_levelview.js' );
  const previewSky = { flags: 4, plane: { normal: [ 0, 0, 1 ], dist: 0 }, texinfo: { texture: { name: 'sky1', width: 256, height: 128, gl_texture: native.solidTexture }, vecs: [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ] ] }, numedges: 4, firstedge: 0 };
  const leaf = { contents: -1, compressed_vis: null, firstmarksurface: [ previewSky ], nummarksurfaces: 1 };
  const previewModel = { entities: '', leafs: [ { contents: -2 }, leaf ], nodes: [ leaf ], numleafs: 1, surfaces: [ previewSky ], firstmodelsurface: 0, nummodelsurfaces: 1, surfedges: [ 1, 2, 3, 4 ], edges: [ {}, { v: [ 0, 1 ] }, { v: [ 1, 2 ] }, { v: [ 2, 3 ] }, { v: [ 3, 0 ] } ], vertexes: [ [ -16, -16, 0 ], [ 16, -16, 0 ], [ 16, 16, 0 ], [ -16, 16, 0 ] ].map( position => ( { position } ) ), _skySolid: native.solidTexture, _skyAlpha: native.alphaTexture };
  const preview = R_BuildLevelView( previewModel, [ 0, 0, 8 ] ); assert.ok( preview && preview.group.children.length === 1 );
  try {
   const previewMesh = preview.group.children[ 0 ], material = previewMesh.material; previewMesh.onBeforeRender(); assert.equal( material.uniforms.uMilkyWay.value, 1 ); assert.equal( material.uniforms.tMilkyWay.value, requests[ 0 ].texture ); assert.equal( material.uniforms.tAlpha.value, native.alphaTexture );
   assert.match( material.fragmentShader, /quakedMilkyWay\(vWorld - cameraPosition\)/, 'preview panorama uses unflattened world direction' ); assert.match( material.fragmentShader, /a\.a \* \(uMilkyWay > 0\.5 \? 0\.012 : 1\.0\)/, 'preview clouds retain the same subtle native mask' );
   for ( const [ index, name ] of [ [ 1, 'gNormal' ], [ 2, 'gAlbedo' ], [ 3, 'gHeightMask' ] ] ) { assert.match( material.fragmentShader, new RegExp( 'layout\\(location\\s*=\\s*' + index + '\\)\\s+out\\s+highp\\s+vec4\\s+' + name ) ); assert.match( material.fragmentShader, new RegExp( name + '\\s*=' ) ); }
   assert.match( material.fragmentShader, /gNormal\s*=\s*vec4\(\s*0\.0\s*\)/ ); assert.match( material.fragmentShader, /gHeightMask\s*=\s*vec4\(1\.0\)/ );
   mode.R_AnimSetClassicPass( true ); previewMesh.onBeforeRender(); assert.equal( material.uniforms.uMilkyWay.value, 0 ); mode.R_AnimSetClassicPass( false );
   previewModel.entities = '{ "classname" "worldspawn" "sky" "milky-independent-" }'; const named = R_BuildLevelView( previewModel, [ 0, 0, 8 ] );
   try { named.group.children[ 0 ].onBeforeRender(); assert.equal( named.group.children[ 0 ].material.uniforms.uMilkyWay.value, 0, 'named neighbor sky excludes the fallback panorama' ); } finally { named.dispose(); }
  } finally { preview.dispose(); }

 } finally {
  R_SkyBoxSet( '' ); R_SkyClear(); R_LiquidsClear(); set_solidskytexture( old.solid ); set_alphaskytexture( old.alpha ); worldState.group = old.group; worldState.renderGroup = old.renderGroup; r_origin.set( old.origin ); set_realtime( old.realtime );
 }
}, { canonical: true } ) );
Deno.test( 'a late callback from a failed request cannot replace a later successful shared panorama', () => fixture( async ( { api, requests, sky } ) => {
 const native = sky( 'start', 'sky1' ); layersFor( api, native ); requests[ 0 ].fail(); assert.equal( await api.R_MilkyWaySkyReady(), false ); api.R_MilkyWaySkyClear(); layersFor( api, native );
 requests[ 0 ].success(); assert.equal( api.R_MilkyWaySkyStatus().state, 'loading', 'stale generation cannot mark the new attempt ready' ); assert.equal( requests[ 0 ].disposed(), 1, 'stale decoded texture is released' );
 requests[ 1 ].success(); assert.equal( await api.R_MilkyWaySkyReady(), true ); const shader = compile( layersFor( api, native ).solid ); assert.equal( shader.uniforms.tMilkyWay.value, requests[ 1 ].texture ); assert.equal( requests[ 1 ].disposed(), 0 );
} ) );
Deno.test( 'existing neighbor-view uniform holders select the same lazy image and track current visual eligibility', () => fixture( async ( { api, requests, sky, load } ) => {
 const native = sky( 'start', 'sky1' ), unrelated = sky( 'e1m1', 'sky4' );
 const matching = api.R_MilkyWaySkyUniforms( native.solidTexture, native.alphaTexture ), unknown = api.R_MilkyWaySkyUniforms( unrelated.solidTexture, unrelated.alphaTexture );
 api.R_MilkyWaySkyUpdate( unknown ); assert.equal( unknown.uMilkyWay.value, 0 ); assert.equal( requests.length, 0 );
 api.R_MilkyWaySkyUpdate( matching ); assert.equal( matching.uMilkyWay.value, 0 ); const holder = matching.tMilkyWay; await load(); api.R_MilkyWaySkyUpdate( matching ); assert.equal( matching.uMilkyWay.value, 1 ); assert.equal( matching.tMilkyWay, holder ); assert.equal( holder.value, requests[ 0 ].texture );
 mode.R_AnimSetClassicPass( true ); api.R_MilkyWaySkyUpdate( matching ); assert.equal( matching.uMilkyWay.value, 0 ); mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_newer_textures', 0 ); api.R_MilkyWaySkyUpdate( matching ); assert.equal( matching.uMilkyWay.value, 0 );
 vars.Cvar_SetValue( 'r_newer_textures', 1 ); api.R_MilkyWaySkyUpdate( matching ); assert.equal( matching.uMilkyWay.value, 1 ); api.R_MilkyWaySkyUpdate( unknown ); assert.equal( unknown.uMilkyWay.value, 0 ); assert.equal( requests.length, 1 );
} ) );
Deno.test( 'public main sky HDR switches invalidate the program and specialize every MRT output for the current depth policy', () => fixture( async ( { api, sky, load } ) => {
 const native = sky( 'start', 'sky1' ), old = { solid: solidskytexture, alpha: alphaskytexture, group: worldState.group, renderGroup: worldState.renderGroup, active: postState.postActive, classic: classicLook.value, compiler: THREE.Material.prototype.onBeforeCompile };
 try {
  R_PostInstallGBufferPatch(); postState.postActive = false; classicLook.value = 0; R_SkyBoxSet( '' ); R_SkyClear(); R_LiquidsClear(); worldState.group = new THREE.Group(); worldState.renderGroup = worldState.group; set_solidskytexture( native.solidTexture ); set_alphaskytexture( native.alphaTexture );
  const face = surface(), draw = () => { R_LiquidsBeginFrame(); R_DrawSkyChain( face ); };
  draw(); if ( api.R_MilkyWaySkyStatus().state === 'loading' ) { await load(); draw(); }
  const material = face._skyMesh.material, geometry = face._skyMesh.geometry, key = material.customProgramCacheKey(), version = material.version;
  assert.equal( material, layersFor( api, native ).solid ); assert.equal( material.depthWrite, true );
  let shader = compile( material ); assert.match( shader.fragmentShader, /gAlbedo\s*=\s*vec4\(\s*gDiffuse,\s*1\.0\s*\)/ ); assert.match( shader.fragmentShader, /gHeightMask\s*=\s*vec4\(\s*1\.0\s*\)/ );
  postState.postActive = true; draw(); assert.equal( face._skyMesh.material, material ); assert.equal( face._skyMesh.geometry, geometry ); assert.equal( material.depthWrite, false ); assert.notEqual( material.customProgramCacheKey(), key, 'depth specialization must have a distinct cached GPU program' ); assert.ok( material.version > version, 'existing material signals recompile on the HDR transition' );
  shader = compile( material ); assert.match( shader.fragmentShader, /gAlbedo\s*=\s*vec4\(\s*0\.0\s*\)/ ); assert.match( shader.fragmentShader, /gHeightMask\s*=\s*vec4\(\s*0\.0\s*\)/ ); assert.match( shader.fragmentShader, /gNormal\s*=\s*vec4\(\s*0\.0\s*\)/ );
  const hdrKey = material.customProgramCacheKey(), hdrVersion = material.version; draw(); assert.equal( material.customProgramCacheKey(), hdrKey ); assert.equal( material.version, hdrVersion, 'unchanged HDR frames do not invalidate the program repeatedly' );
  postState.postActive = false; draw(); assert.equal( material.depthWrite, true ); assert.equal( material.customProgramCacheKey(), key ); assert.ok( material.version > hdrVersion ); shader = compile( material ); assert.match( shader.fragmentShader, /gAlbedo\s*=\s*vec4\(\s*gDiffuse,\s*1\.0\s*\)/ ); assert.match( shader.fragmentShader, /gHeightMask\s*=\s*vec4\(\s*1\.0\s*\)/ );
  const cloud = compile( face._skyMesh2.material ); assert.equal( face._skyMesh2.material.depthWrite, false ); assert.match( cloud.fragmentShader, /gAlbedo\s*=\s*vec4\(\s*0\.0\s*\)/ ); assert.match( cloud.fragmentShader, /gHeightMask\s*=\s*vec4\(\s*0\.0\s*\)/ );
 } finally {
  R_SkyClear(); R_LiquidsClear(); set_solidskytexture( old.solid ); set_alphaskytexture( old.alpha ); worldState.group = old.group; worldState.renderGroup = old.renderGroup; postState.postActive = old.active; classicLook.value = old.classic; THREE.Material.prototype.onBeforeCompile = old.compiler;
 }
}, { canonical: true } ) );
