// Public, source-bound Rogue enemy skin verification. Reads bounded owned PAK members without exporting them.
// Async selection/failure tests replace only image transport; asset tests decode the actual shipped PNG/WebP files.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
const SPECS = [
 { key: 'dragon', sha: '1ba01029d4113cc832aa5ab551c7bf060b5f7a4eb1afde35607564413bfee2ec', width: 308, height: 179, vertices: 336, triangles: 608, poses: 101, factor: 5,
  source: 'Gemini_Generated_Image_6fxet96fxet96fxe.jpeg', sourceSha: '13bfde08a63b7bc15b5efd071a09c8f434e232cca64274a9d7948430e5803b4e' },
 { key: 's_wrath', sha: '4c0653e3adba99be4d581c92a928fd6e8c27b0a2159a97f7ec5e885478249b8d', width: 308, height: 186, vertices: 296, triangles: 564, poses: 108, factor: 5, confusable: 'wrath',
  source: 'Gemini_Generated_Image_ekijfxekijfxekij.jpeg', sourceSha: '4ab505e3289ca7d0d804fc15178825f28cbee7481a26e04a1208082729e67bdc' },
 { key: 'mummy', sha: '3926d2dcf2451deaf32e67877016884cfb91a313968beefe514b9274fc30a1d1', width: 168, height: 194, vertices: 177, triangles: 347, poses: 192, factor: 6, confusable: 'zombie',
  source: 'Gemini_Generated_Image_jc5i6kjc5i6kjc5i.jpeg', sourceSha: '3bc0906638ddc4c6e9d22f894bb74337709fc760ddb2f817d5f6bc64e11cc640' }
];
const check = ( value, message ) => { if ( !value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const sha = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const index = JSON.parse( read( 'newer/enemies/index.json' ) );
const ticks = async () => { for ( let i = 0; i < 20; i ++ ) await Promise.resolve(); };
let startup, serial = 0;
const natives = new Map();
async function native( key ) {
 if ( !startup ) startup = ( async () => {
  check( process.env.QUAKED_OWNED_PAK, 'QUAKED_OWNED_PAK must name the owned Rogue archive' );
  check( process.env.QUAKED_ID1_PAK, 'QUAKED_ID1_PAK must name the owned id1/shareware palette archive' );
  const directory = await pakDirectory( process.env.QUAKED_OWNED_PAK ), paletteDirectory = await pakDirectory( process.env.QUAKED_ID1_PAK );
  check( paletteDirectory.has( 'gfx/palette.lmp' ), 'owned palette available' );
  COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( paletteDirectory.get( 'gfx/palette.lmp' ) ) ) );
  VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); return directory;
 } )();
 if ( !natives.has( key ) ) natives.set( key, ( async () => {
  const directory = await startup, name = 'progs/' + key + '.mdl'; check( directory.has( name ), 'actual Rogue member: ' + name );
  const bytes = await readMember( directory.get( name ) ); COM_AddPack( isolatedPack( name, bytes ) );
  const model = Mod_ForName( name, true ); await model.aliasSourceIdentity.promise; return { model, bytes };
 } )() );
 return natives.get( key );
}
function reload( name, bytes ) { COM_AddPack( isolatedPack( name, bytes ) ); const model = new model_t(); model.name = name; model.needload = true; return Mod_LoadModel( model, true ); }
// MDL stverts is shared loader scratch. Display commands, vertex order and pose/frame arrays belong to this actual model.
function geometry( model ) { const h = model.cache.data; return JSON.stringify( { scale: Array.from( h.scale ), origin: Array.from( h.scale_origin ), commands: Array.from( h.commands ), order: Array.from( h.meshVertexOrder ), poses: h.posedata, frames: h.frames } ); }
async function fixture( run ) {
 const old = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), window: Object.getOwnPropertyDescriptor( globalThis, 'window' ), loader: THREE.TextureLoader.prototype.load, newer: mode.R_IsNewer(), classic: mode.R_ClassicPassActive(), normals: mode.r_newer_normals.value, enemies: mode.r_newer_enemies.value };
 const requests = []; Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } ); Object.defineProperty( globalThis, 'window', { configurable: true, value: {} } );
 THREE.TextureLoader.prototype.load = function ( url, done, _, fail ) { const texture = new THREE.DataTexture( new Uint8Array( 64 ).fill( 127 ), 4, 4 ); requests.push( { url: String( url ), done, fail, texture } ); return texture; };
 mode.R_AnimSetClassicPass( false ); mode.R_AnimSetNewer( true ); mode.r_newer_enemies.value = 1; mode.r_newer_normals.value = 0;
 const skins = await import( '../src/newer/render/r_newerskins.js?rogue-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  mode.R_AnimSetClassicPass( old.classic ); mode.R_AnimSetNewer( old.newer ); mode.r_newer_normals.value = old.normals; mode.r_newer_enemies.value = old.enemies;
 }
}
Deno.test( 'three Rogue replacements preserve every pre-existing enemy variant and height entry', () => {
 const other = structuredClone( index ); delete other.version; for ( const { key } of SPECS ) delete other.models[ key ];
 same( sha( JSON.stringify( other ) ), 'a17e98fb493f79892744388722c3875e2cccbc7fa90a0feb1a379a26a252b87e', 'pre-edit manifest, excluding cache revision and only these three additions' );
} );
for ( const spec of SPECS ) {
 const name = 'progs/' + spec.key + '.mdl', base = 'newer/enemies/' + spec.key + '/custom/';
 Deno.test( spec.key + ': public loader retains every native UV, triangle and pose byte', async () => {
  const { model, bytes } = await native( spec.key ), h = model.cache.data;
  same( sha( bytes ), spec.sha, 'independently pinned owned model' ); same( model.aliasSourceIdentity.state, 'ready', 'loaded identity ready' ); same( model.aliasSourceIdentity.sha256, spec.sha, 'actual loaded native identity' );
  for ( const [ key, value ] of Object.entries( { numskins: 1, skinwidth: spec.width, skinheight: spec.height, numverts: spec.vertices, numtris: spec.triangles, numframes: spec.poses, numposes: spec.poses } ) ) same( h[key], value, key );
  same( bytes.readInt32LE( 84 ), 0, 'single ungrouped skin' ); let offset = 88 + spec.width * spec.height;
  for ( let vertex = 0; vertex < spec.vertices; vertex ++, offset += 12 ) { const uv = h.stverts[vertex]; same( uv.onseam, bytes.readInt32LE( offset ), 'native seam flag' ); same( uv.s, bytes.readInt32LE( offset + 4 ), 'native U' ); same( uv.t, bytes.readInt32LE( offset + 8 ), 'native V' ); }
  for ( let triangle = 0; triangle < spec.triangles; triangle ++, offset += 16 ) { same( h.triangles[triangle].facesfront, bytes.readInt32LE( offset ), 'native triangle facing' ); for ( let c = 0; c < 3; c ++ ) same( h.triangles[triangle].vertindex[c], bytes.readInt32LE( offset + 4 + c * 4 ), 'native triangle vertex' ); }
  for ( let pose = 0; pose < spec.poses; pose ++ ) { same( bytes.readInt32LE( offset ), 0, 'ungrouped native pose' ); offset += 28; for ( let vertex = 0; vertex < spec.vertices; vertex ++, offset += 4 ) { const actual = h.poseverts[pose][vertex]; for ( let axis = 0; axis < 3; axis ++ ) same( actual.v[axis], bytes[offset + axis], 'pose coordinate' ); same( actual.lightnormalindex, bytes[offset + 3], 'pose lighting normal' ); } }
  same( offset, bytes.length, 'all native pose bytes checked' ); same( Mod_ForName( name, true ), model, 'native cache retained' );
 } );
 Deno.test( spec.key + ': actual fitted images and provenance target the supplied art and exact native model', async () => {
  const source = JSON.parse( read( base + 'SOURCE.json' ) ), variants = index.models[spec.key]; check( variants, 'variant is registered' ); same( variants.length, 1, 'one approved variant' ); const approved = variants[0];
  same( source.model, name, 'fit model' ); same( source.nativeModelSha256, spec.sha, 'fit model hash' ); same( source.source, spec.source, 'source filename' ); same( source.sourceSha256, spec.sourceSha, 'pinned source hash' ); same( sha( read( spec.source ) ), spec.sourceSha, 'actual root JPEG unchanged' );
  const width = spec.width * spec.factor, height = spec.height * spec.factor;
  same( JSON.stringify( source.dimensions ), JSON.stringify( [width, height] ), 'native-proportioned fitted size' );
  same( approved.dir, spec.key + '/custom', 'variant directory' ); same( approved.nativeModelSha256, spec.sha, 'runtime hash boundary' ); same( approved.skin, 0, 'only original skin zero' ); same( approved.flipGreen, false, 'generated normal convention' );
  same( approved.maps.diffuse, 'diffuse.png', 'supplied fitted PNG used by product' ); same( approved.maps.height, 'height.webp', 'matching stored height used by product' ); same( Object.keys( approved.maps ).length, 2, 'exact map pair' );
  check( Number.isFinite( approved.heightStrength ) && approved.heightStrength > 0, 'positive stored normal strength' ); check( Number.isFinite( approved.heightCap ) && approved.heightCap > 0 && approved.heightCap <= 1, 'bounded stored normal cap' );
  const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
  for ( const file of ['diffuse.png', 'height.webp'] ) {
   const data = read( base + file ); same( sha( data ), source.files[file], 'shipped bytes match provenance: ' + file ); const image = await canvas.loadImage( data ); same( image.width, width, 'decoded width: ' + file ); same( image.height, height, 'decoded height: ' + file );
   const surface = canvas.createCanvas( width, height ), ctx = surface.getContext( '2d' ); ctx.drawImage( image, 0, 0 ); const pixels = ctx.getImageData( 0, 0, width, height ).data; let min = 255, max = 0, opaque = true, gray = true;
   for ( let i = 0; i < pixels.length; i += 4 ) { opaque &&= pixels[i+3] === 255; if ( file === 'height.webp' ) { gray &&= pixels[i] === pixels[i+1] && pixels[i] === pixels[i+2]; min = Math.min( min, pixels[i] ); max = Math.max( max, pixels[i] ); } }
   check( opaque, 'fully opaque map: ' + file ); if ( file === 'height.webp' ) { check( gray, 'height is grayscale' ); check( max - min > 32, 'stored height has nonflat relief' ); }
  }
 } );
 Deno.test( spec.key + ': actual public selection is source-bound, preserves geometry and restores native options', async () => fixture( async ( skins, requests ) => {
  const { model, bytes } = await native( spec.key ), before = geometry( model ), nativeTexture = model.cache.data.gl_texturenum[0][0], nativePixels = sha( nativeTexture.image.data );
  check( skins.ENEMY_SKIN_MODELS.has( spec.key ), 'existing enemy material classification includes model' );
  const modified = Buffer.from( bytes ); modified.writeInt32LE( modified.readInt32LE( 76 ) ^ 1, 76 ); const wrong = reload( name, modified ); await wrong.aliasSourceIdentity.promise;
  const preparation = skins.R_NewerSkinsPrepare( [model] ); same( skins.R_NewerSkinsPrepare( [model, model] ), preparation, 'preparation deduplicates' ); await preparation;
  same( requests.length, 2, 'exact image pair requested' ); check( requests.every( r => r.url.startsWith( base ) && r.url.endsWith( '?v=' + index.version ) ), 'approved paths and cache revision' );
  same( skins.R_NewerAliasMaterial( {model}, name, true, 0 ), null, 'pending diffuse retains original' ); same( skins.R_NewerSkinsStatus( [model] ).pending, 2, 'image readiness separate from preparation' );
  for ( const r of requests ) r.done( r.texture ); const material = skins.R_NewerAliasMaterial( {model, _entityIndex: 11}, name, true, 0 ); check( material, 'actual matching replacement selected' ); same( material.map, requests.find( r => r.url.includes( 'diffuse.png' ) ).texture, 'selected map is approved decoded image' );
  same( material.map.flipY, false, 'top-row-first atlas convention' ); same( material.map.colorSpace, THREE.SRGBColorSpace, 'diffuse color convention' ); check( skins.R_NewerSkinsStatus( [model] ).settled, 'actual image pair settles' );
  for ( const skin of [1, 2, 7] ) same( skins.R_NewerAliasMaterial( {model}, name, true, skin ), null, 'other skin remains original' );
  const unsupported = [wrong, {name}, {...model, name: 'progs/unsupported_' + spec.key + '.mdl'}];
  if ( spec.confusable ) { const other = ( await native( spec.confusable ) ).model; check( other.aliasSourceIdentity.sha256 !== spec.sha, 'confusable native model has different identity' ); unsupported.push( {...other, name} ); }
  for ( const other of unsupported ) { same( skins.R_NewerAliasMaterial( {model: other}, other.name, true, 0 ), null, 'unsupported model cannot select target art' ); same( skins.R_NewerSkinsMaterials( [other] ).length, 0, 'unsupported model exposes no target materials' ); same( skins.R_NewerSkinsTextures( [other] ).length, 0, 'unsupported model exposes no target textures' ); }
  same( skins.R_NewerSkinsMaterials( [name] ).length, 0, 'bare filename cannot satisfy identity' );
  mode.R_AnimSetClassicPass( true ); same( skins.R_NewerAliasMaterial( {model}, name, true, 0 ), null, 'Classic retains original' ); mode.R_AnimSetClassicPass( false ); mode.r_newer_enemies.value = 0; same( skins.R_NewerAliasMaterial( {model}, name, true, 0 ), null, 'enemies-off retains original' );
  same( geometry( model ), before, 'original display UV commands, vertex order, poses and frames unchanged' ); same( sha( nativeTexture.image.data ), nativePixels, 'original skin pixels unchanged' ); same( requests.length, 2, 'negative paths request no extra images' );
  let nativeDisposals = 0; nativeTexture.addEventListener( 'dispose', () => nativeDisposals ++ ); skins.R_NewerSkinsShutdown(); same( nativeDisposals, 0, 'replacement cache never disposes native texture' ); COM_AddPack( isolatedPack( name, bytes ) );
 } ) );
 Deno.test( spec.key + ': pending identity, failed images and retired work remain native without late publication', async () => fixture( async ( skins, requests ) => {
  const { model } = await native( spec.key );
  mode.R_AnimSetClassicPass( true ); await skins.R_NewerSkinsPrepare( [model] ); same( requests.length, 0, 'Classic preparation requests nothing' ); mode.R_AnimSetClassicPass( false );
  for ( const identity of [undefined, {state: 'unavailable', promise: Promise.resolve( null )}, {state: 'ready', sha256: '0'.repeat( 64 )}] ) { const other = {...model, aliasSourceIdentity: identity}; await skins.R_NewerSkinsPrepare( [other] ); same( requests.length, 0, 'unsupported identity requests nothing' ); check( skins.R_NewerSkinsStatus( [other] ).settled, 'unsupported identity settles native fallback' ); }
  let release; const identity = {state: 'pending', sha256: null, promise: new Promise( resolve => release = resolve )}, pending = {...model, aliasSourceIdentity: identity};
  same( skins.R_NewerAliasMaterial( {model: pending}, name, true, 0 ), null, 'pending identity selects no art' ); const preparation = skins.R_NewerSkinsPrepare( [pending] ); await ticks(); same( requests.length, 0, 'pending identity starts no images' ); same( skins.R_NewerSkinsStatus( [pending] ).preparePending, 1, 'identity wait remains accountable' );
  identity.state = 'ready'; identity.sha256 = spec.sha; release( spec.sha ); await preparation; same( requests.length, 2, 'resolved exact identity requests approved pair' );
  requests.forEach( r => r.fail() ); const status = skins.R_NewerSkinsStatus( [pending] ); same( status.pending, 0, 'failed downloads stop pending' ); same( status.fallback, 2, 'failed maps explicitly recorded' ); check( status.settled, 'failed optional maps settle' ); same( skins.R_NewerAliasMaterial( {model: pending}, name, true, 0 ), null, 'failed diffuse retains original' );
  const disposed = [0, 0]; requests.forEach( (r, i) => r.texture.addEventListener( 'dispose', () => disposed[i] ++ ) ); skins.R_NewerSkinsShutdown(); requests.forEach( r => r.done( r.texture ) ); check( disposed.every( n => n > 0 ), 'late images disposed' ); same( skins.R_NewerSkinsMaterials( [model] ).length, 0, 'late images publish no material' );
  let finish; const lateIdentity = {state: 'pending', promise: new Promise( resolve => finish = resolve )}, late = {...model, aliasSourceIdentity: lateIdentity}; const work = skins.R_NewerSkinsPrepare( [late] ); await ticks(); skins.R_NewerSkinsShutdown(); lateIdentity.state = 'ready'; lateIdentity.sha256 = spec.sha; finish( spec.sha ); check( ( await work ).cancelled, 'retired identity work cancels' ); same( requests.length, 2, 'retired work requests no new images' );
 } ) );
}
