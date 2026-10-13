// Public, source-bound Hipnotic Armagon skin verification. Reads bounded owned PAK members without exporting them.
// Async selection/failure tests replace only image transport; asset tests decode the actual shipped PNG/WebP files.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { NormalInputs, NormalInputWitness, R_NormalPrepare } from '../src/newer/assets/normal_prepare.js';
import { EnemyHeightScalars } from '../src/newer/assets/enemy_height.js';
import { NormalBakeDecode } from '../src/newer/assets/normal_bake_format.js';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
const SPECS = [
 {
  "key": "armabody",
  "sha": "e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151",
  "width": 216,
  "height": 194,
  "vertices": 204,
  "triangles": 398,
  "poses": 98,
  "factor": 4,
  "source": "tools/texture_sheets/sources/fidelity-2026-10-13/armabody-menace-candidate4.png",
  "sourceSha": "91499ce3e20514d30d1ce97c33e43b8a5a987d7ffb8299d5136a212b0fd234d2",
  "sourceSize": [
   1324,
   1188
  ]
 },
 {
  "key": "armalegs",
  "sha": "b33a8f7e4cd3fca9b8c9427d8002a5470da44ce919648e1a0045f3f131f73deb",
  "width": 228,
  "height": 194,
  "vertices": 134,
  "triangles": 318,
  "poses": 98,
  "factor": 4,
  "source": "tools/texture_sheets/sources/fidelity-2026-10-13/armalegs-menace-candidate1.png",
  "sourceSha": "9a4e224081f44e31a916dca7f3d1c83df0fe2f0a10831aef7158f00f42ff33d4",
  "sourceSize": [
   1359,
   1157
  ]
 }
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
  check( process.env.QUAKED_OWNED_PAK, 'QUAKED_OWNED_PAK must name the owned Hipnotic archive' );
  check( process.env.QUAKED_ID1_PAK, 'QUAKED_ID1_PAK must name the owned id1/shareware palette archive' );
  const directory = await pakDirectory( process.env.QUAKED_OWNED_PAK ), paletteDirectory = await pakDirectory( process.env.QUAKED_ID1_PAK );
  check( paletteDirectory.has( 'gfx/palette.lmp' ), 'owned palette available' );
  COM_AddPack( isolatedPack( 'gfx/palette.lmp', await readMember( paletteDirectory.get( 'gfx/palette.lmp' ) ) ) );
  VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); return directory;
 } )();
 if ( !natives.has( key ) ) natives.set( key, ( async () => {
  const directory = await startup, name = 'progs/' + key + '.mdl'; check( directory.has( name ), 'actual Hipnotic member: ' + name );
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
 const skins = await import( '../src/newer/render/r_newerskins.js?armagon-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  mode.R_AnimSetClassicPass( old.classic ); mode.R_AnimSetNewer( old.newer ); mode.r_newer_normals.value = old.normals; mode.r_newer_enemies.value = old.enemies;
 }
}
Deno.test( 'Armagon preserves all existing model and native-height families', () => {
 const other = structuredClone( index );other.models.ogre=other.models.ogre.slice(0,1);other.nativeHeights.ogre=other.nativeHeights.ogre.slice(0,1);other.models.knight=other.models.knight.slice(0,1);other.nativeHeights.knight=other.nativeHeights.knight.slice(0,1); delete other.version;
 const modelKeys = ["boss", "knight", "ogre", "soldier", "wizard", "backpack", "suit", "armor", "shambler", "zombie", "demon", "h_demon", "h_dog", "zom_gib", "h_shams", "shalrath", "oldone", "enforcer", "tarbaby", "hknight", "scor", "dragon", "s_wrath", "mummy", "dog", "fish", "grem"];
 const heightKeys = ["gib1", "gib2", "gib3", "zom_gib", "ogre", "h_ogre", "demon", "h_demon", "shambler", "h_shams", "knight", "h_knight", "soldier", "h_guard", "wizard", "h_wizard", "h_dog", "dog", "zombie", "h_zombie", "boss"];
 other.models = Object.fromEntries(Object.entries(other.models).filter(([key]) => modelKeys.includes(key)).map(([key,list])=>[key,['hknight','tarbaby'].includes(key)?list.slice(0,1):list]));
 other.nativeHeights = Object.fromEntries(Object.entries(other.nativeHeights).filter(([key]) => heightKeys.includes(key)));
 same( sha( JSON.stringify( other ) ), 'e860038a357ddc6217ef1f96dbcd6e097dbab87d78617fa210e0875d0c055518', 'complete prior data remains exact; future append-only families may be added' );
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
  same( source.model, name, 'fit model' ); same( source.nativeModelSha256, spec.sha, 'fit model hash' ); same( source.source, spec.source, 'source filename' ); same( source.sourceSha256, spec.sourceSha, 'pinned source hash' ); same( sha( read( spec.source ) ), spec.sourceSha, 'actual generated source unchanged' );
  const sourceBytes = read( spec.source ); same( sourceBytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a', 'source PNG signature' ); same( sourceBytes.toString('ascii',12,16), 'IHDR', 'source image header' ); same( sourceBytes.readUInt32BE(16), spec.sourceSize[0], 'source width' ); same( sourceBytes.readUInt32BE(20), spec.sourceSize[1], 'source height' );
  const width = spec.width * spec.factor, height = spec.height * spec.factor;
  same(source.runtimeEncoding.format,'webp','declared runtime codec');same(source.runtimeEncoding.quality,92,'owner quality92');same(source.runtimeEncoding.lossless,false,'runtime images are explicitly lossy');same(source.runtimeEncoding.authoringSourceUnchanged,true,'generation original unchanged');
  same( JSON.stringify( source.dimensions ), JSON.stringify( [width, height] ), 'native-proportioned fitted size' );
  same(source.factor,4,'owner fourfold atlas standard'); same(JSON.stringify(source.atlasBox),JSON.stringify([0,0,width,height]),'complete native-proportioned atlas'); same(source.piecePlacements,undefined,'no unreviewed piece rearrangement'); same(source.nativeTexturePixelsUsed,0,'only generated source pigment'); same(source.surfacePixels,spec.key==='armabody'?393303:370909,'exact fourfold UV coverage witness'); same(source.edgePixels,spec.key==='armabody'?2725:10543,'bounded edge extension'); if(spec.key==='armabody')same(source.flatHeight.padding,7,'fourfold custom flashes retain the corrected seven-pixel gutter');
  same( approved.dir, spec.key + '/custom', 'variant directory' ); same( approved.nativeModelSha256, spec.sha, 'runtime hash boundary' ); same( approved.skin, 0, 'only original skin zero' ); same( approved.flipGreen, false, 'generated normal convention' );
  same( approved.maps.diffuse, 'diffuse.webp', 'reviewed fit encoded as owner-required WebP92' ); same( approved.maps.height, 'height.webp', 'matching stored height used by product' ); same( Object.keys( approved.maps ).length, 2, 'exact diffuse/height pair, no new emission' ); same( approved.maps.luma, undefined, 'current native alias brightness semantics retained' );
  check( Number.isFinite( approved.heightStrength ) && approved.heightStrength > 0, 'positive stored normal strength' ); check( Number.isFinite( approved.heightCap ) && approved.heightCap > 0 && approved.heightCap <= 1, 'bounded stored normal cap' );
  const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
  for ( const file of ['diffuse.webp', 'height.webp'] ) {
   const data = read( base + file );same(data.toString('ascii',0,4),'RIFF','WebP container');same(data.toString('ascii',8,12),'WEBP','WebP signature');let offset=12,lossy=false;while(offset+8<=data.length){const tag=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);if(tag==='VP8 ')lossy=true;check(tag!=='VP8L','no disguised lossless runtime image');offset+=8+size+(size&1);}check(lossy,'actual lossy VP8 bitstream');same(source.runtimeEncoding.maps[file].sha256,sha(data),'encoding receipt binds exact shipped bytes'); same( sha( data ), source.files[file], 'shipped bytes match provenance: ' + file ); const image = await canvas.loadImage( data ); same( image.width, width, 'decoded width: ' + file ); same( image.height, height, 'decoded height: ' + file );
   const surface = canvas.createCanvas( width, height ), ctx = surface.getContext( '2d' ); ctx.drawImage( image, 0, 0 ); const pixels = ctx.getImageData( 0, 0, width, height ).data; let min = 255, max = 0, opaque = true, gray = true;
   for ( let i = 0; i < pixels.length; i += 4 ) { opaque &&= pixels[i+3] === 255; if ( file === 'height.webp' ) { gray &&= Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])<=1; min = Math.min( min, pixels[i] ); max = Math.max( max, pixels[i] ); } }
   check( opaque, 'fully opaque map: ' + file ); if ( file === 'height.webp' ) { check( gray, 'neutral height remains gray within one codec rounding unit; runtime consumes red explicitly' ); check( max - min > 32, 'stored height has nonflat relief' ); }
  }
 } );
 Deno.test( spec.key + ': actual public selection is source-bound, preserves geometry and restores native options', async () => fixture( async ( skins, requests ) => {
  const { model, bytes } = await native( spec.key ), before = geometry( model ), nativeTexture = model.cache.data.gl_texturenum[0][0], nativePixels = sha( nativeTexture.image.data );
  check( skins.ENEMY_SKIN_MODELS.has( spec.key ), 'existing enemy material classification includes model' );
  const modified = Buffer.from( bytes ); modified.writeInt32LE( modified.readInt32LE( 76 ) ^ 1, 76 ); const wrong = reload( name, modified ); await wrong.aliasSourceIdentity.promise;
  const preparation = skins.R_NewerSkinsPrepare( [model] ); same( skins.R_NewerSkinsPrepare( [model, model] ), preparation, 'preparation deduplicates' ); await preparation;
  same( requests.length, 2, 'exact image pair requested' ); check( requests.every( r => r.url.startsWith( base ) && r.url.endsWith( '?v=' + index.version ) ), 'approved paths and cache revision' );
  same( skins.R_NewerAliasMaterial( {model}, name, true, 0 ), null, 'pending diffuse retains original' ); same( skins.R_NewerSkinsStatus( [model] ).pending, 2, 'image readiness separate from preparation' );
  for ( const r of requests ) r.done( r.texture ); const material = skins.R_NewerAliasMaterial( {model, _entityIndex: 11}, name, true, 0 ); check( material, 'actual matching replacement selected' ); same( material.map, requests.find( r => r.url.includes( 'diffuse.webp' ) ).texture, 'selected map is approved decoded image' );
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

const decodedImages = new Map();
async function decodedImage(path) {
 if (!decodedImages.has(path)) decodedImages.set(path,(async()=>{
  const canvas = await import(process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
  const image = await canvas.loadImage(read(path)), surface = canvas.createCanvas(image.width,image.height), context = surface.getContext('2d');
  context.drawImage(image,0,0); return context.getImageData(0,0,image.width,image.height);
 })());
 return decodedImages.get(path);
}
function companion(pixels,height,strength=.65,cap=.55,descriptor={},modelKey='') {
 const texture = new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);
 texture.userData.newerHeight={width:pixels.width,height:pixels.height,derive:!height,data:height?EnemyHeightScalars(height,descriptor,modelKey):undefined,strength,cap};
 return texture;
}
const verifiedNormalKeys = new Set();
async function verifyBake(texture,family,expectedModelSha=null) {
 const input=NormalInputs(texture),witness=await NormalInputWitness(input),manifest=JSON.parse(read('newer/normals/manifest.json')),spec=manifest.samples[witness.key],level=manifest.levels[family];
 check(spec,'exact decoded input has a shipped sample: '+family);check(level?.keys.includes(witness.key),'native/custom family references exact input: '+family);
 if(expectedModelSha)same(level.modelSha256,expectedModelSha,'native normal model identity');
 const {key,...details}=witness;same(JSON.stringify(spec.input),JSON.stringify(details),'every normal input witness field matches');
 const compressed=read(spec.file),raw=gunzipSync(compressed);same(sha(compressed),spec.sha256,'compressed normal bytes');same(sha(raw),spec.rawSha256,'decoded normal bytes');
 const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),decoded=NormalBakeDecode(buffer,key,input.width,input.height);
 if(input.scalar)check(decoded.scalar.every((value,i)=>value===input.scalar[i]),'stored scalar agrees with exact authored height');
 let loads=0;const work=R_NormalPrepare(texture,{loader:async requested=>{loads++;same(requested.rawSha256,spec.rawSha256,'public runtime selects same prepared bytes');return buffer;},disk:{ensure(){throw Error('Shipped normal must not use disk generation');}},generate(){throw Error('Shipped normal must not regenerate');}});
 await work.promise;same(work.status,'ready','normal preparation ready');same(work.source,'shipped','actual public path uses shipped normals');check(loads===1 || (loads===0 && verifiedNormalKeys.has(key)), 'one prepared load, or reuse of an already independently verified shipped key');verifiedNormalKeys.add(key);same(R_NormalPrepare(texture),work,'prepared work reused');texture.dispose();same(work.status,'cancelled','normal preparation retires with texture');
 return decoded;
}
for(const spec of SPECS)Deno.test(spec.key+': exact custom and native normal inputs select shipped samples',async()=>{
 const variant=index.models[spec.key][0],base='newer/enemies/'+variant.dir+'/',{model}=await native(spec.key),pixels=model.cache.data.gl_texturenum[0][0].image;
 const diffuse=await decodedImage(base+'diffuse.webp'),height=await decodedImage(base+'height.webp');
 await verifyBake(companion(diffuse,height,variant.heightStrength,variant.heightCap,variant,spec.key),'custom:'+variant.dir);
 await verifyBake(companion(pixels,null),'hipnotic:progs/'+spec.key+'.mdl',spec.sha);
 if(spec.key==='armabody'){
  const entry=index.nativeHeights.armabody?.[0]?.[0];check(entry,'authored native body height registered');same(entry.file,'heights/armabody/skin0_0.webp','native height file');
  const h=await decodedImage('newer/enemies/'+entry.file);same(h.width,216,'native height width');same(h.height,194,'native height height');
  const source=JSON.parse(read(base+'SOURCE.json'));same(source.nativeHeight.file,entry.file,'native height provenance');same(sha(read('newer/enemies/'+entry.file)),source.nativeHeight.sha256,'native height hash');same(source.nativeHeight.encoding.masterSha256,'f7b42e940ffb27bb2d6b508d67feb5c1c261df9eb9619a3bc554b94053f2fc70','Q92 receipt preserves exact original native authored master identity');
  await verifyBake(companion(pixels,h,entry.strength,entry.cap,entry,spec.key),'hipnotic:progs/armabody.mdl',spec.sha);
 }
});

// Independent byte-level UV rasterization. Test sample locations are texel centres;
// production fitting uses Pillow, so this does not mirror that rasterizer or import its helper.
function uvMasks(bytes,factor){
 const width=bytes.readInt32LE(52),height=bytes.readInt32LE(56),vertices=bytes.readInt32LE(60),triangles=bytes.readInt32LE(64),start=88+width*height;
 const W=width*factor,H=height*factor,flash=new Uint8Array(W*H),other=new Uint8Array(W*H);let flashTriangles=0;
 for(let i=0;i<triangles;i++){
  const offset=start+vertices*12+i*16,front=bytes.readInt32LE(offset),ids=[0,1,2].map(c=>bytes.readInt32LE(offset+4+c*4)),selected=ids.map(v=>v>=192&&v<204);
  check(selected.every(Boolean)||selected.every(v=>!v),'flash vertices share no triangle with body');
  const target=selected[0]?flash:other;if(selected[0])flashTriangles++;
  const points=ids.map(v=>{const o=start+v*12;return[(bytes.readInt32LE(o+4)+.5+(!front&&bytes.readInt32LE(o)?width/2:0))*factor,(bytes.readInt32LE(o+8)+.5)*factor];});
  const [[ax,ay],[bx,by],[cx,cy]]=points,den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-9)continue;
  const minX=Math.max(0,Math.floor(Math.min(ax,bx,cx))),maxX=Math.min(W-1,Math.ceil(Math.max(ax,bx,cx))),minY=Math.max(0,Math.floor(Math.min(ay,by,cy))),maxY=Math.min(H-1,Math.ceil(Math.max(ay,by,cy)));
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const u=((by-cy)*(x+.5-cx)+(cx-bx)*(y+.5-cy))/den,v=((cy-ay)*(x+.5-cx)+(ax-cx)*(y+.5-cy))/den;
   if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)target[y*W+x]=1;
  }
 }
 same(flashTriangles,16,'all sixteen actual flame triangles selected');return{width:W,height:H,flash,other};
}
function squarePad(mask,width,height,radius){
 const horizontal=new Uint8Array(mask.length),padded=new Uint8Array(mask.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x])for(let dx=Math.max(0,x-radius);dx<=Math.min(width-1,x+radius);dx++)horizontal[y*width+dx]=1;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(horizontal[y*width+x])for(let dy=Math.max(0,y-radius);dy<=Math.min(height-1,y+radius);dy++)padded[dy*width+x]=1;
 return padded;
}
Deno.test('Armagon native and custom flames have maximal flat height and flat baked normals without padding another surface',async()=>{
 const {model,bytes}=await native('armabody'),variant=index.models.armabody[0],nativeEntry=index.nativeHeights.armabody[0][0];
 for(const factor of [1,4]){
  // The authored PIL footprint has seven pixels at 4x to guarantee this required
  // six-pixel geometric margin despite a one-pixel rasterization difference.
  const descriptor=factor===1?nativeEntry:variant,nativeMap=factor===1,gutter=6,masks=uvMasks(bytes,factor),padded=squarePad(masks.flash,masks.width,masks.height,gutter),height=await decodedImage(nativeMap?'newer/enemies/'+nativeEntry.file:'newer/enemies/armabody/custom/height.webp');
  const effective=EnemyHeightScalars(height,descriptor,'armabody'),policy=descriptor.heightFlat,declared=new Uint8Array(effective.length);
  check(policy,'explicit source-bound reconstruction policy');same(policy.modelSha256,SPECS[0].sha,'policy original model');same(policy.width,masks.width,'policy width');same(policy.height,masks.height,'policy height');
  for(const [y,start,end] of policy.spans)for(let x=start;x<end;x++)declared[y*masks.width+x]=1;
  let changed=0;for(let i=0;i<effective.length;i++){if(declared[i]){same(effective[i],1,'only explicitly authored flat span reconstructed');check(!masks.other[i],'complete declared policy never overlaps anatomical body UV');if(height.data[i*4]!==255)changed++;}else same(effective[i],Math.fround(height.data[i*4]/255),'every decoded height outside exact policy remains unchanged');}
  check(changed>0,'actual lossy ringing is reconstructed; raw pixel diagnostic is not mistaken for effective height');
  let surface=0,padding=0;
  for(let i=0;i<padded.length;i++){
   if(masks.flash[i])surface++;
   if(padded[i]){padding++;check(!masks.other[i],gutter+'-pixel flash padding never reaches body UV');check(declared[i],'independent flash and required six-pixel gutter fully covered by scoped policy');same(effective[i],1,'effective flash and gutter height maximal after decoding');}
  }
  check(surface>1000&&padding>surface,'substantial actual flash coverage and '+gutter+'-pixel gutter exercised');
  const pixels=nativeMap?model.cache.data.gl_texturenum[0][0].image:await decodedImage('newer/enemies/armabody/custom/diffuse.webp'),settings=nativeMap?nativeEntry:{strength:variant.heightStrength,cap:variant.heightCap};
  const decoded=await verifyBake(companion(pixels,height,settings.strength,settings.cap,descriptor,'armabody'),nativeMap?'hipnotic:progs/armabody.mdl':'custom:armabody/custom');
  for(let i=0;i<masks.flash.length;i++)if(masks.flash[i]){same(decoded.pixels[i*4],128,'flash normal X flat');same(decoded.pixels[i*4+1],128,'flash normal Y flat');same(decoded.pixels[i*4+2],255,'flash normal Z flat');same(decoded.pixels[i*4+3],255,'maximal flash height bypasses height-shadow receivers');}
 }
});
Deno.test('Armagon native parts have ninety-eight paired frames and genuine extended firing geometry',async()=>{
 const body=(await native('armabody')).model.cache.data,legs=(await native('armalegs')).model.cache.data;
 same(body.numframes,98,'body frames');same(legs.numframes,98,'leg frames');
 for(let frame=0;frame<98;frame++)same(body.frames[frame].name.replace(/^b/,'').replace('tranb','tran'),legs.frames[frame].name.replace(/^l/,'').replace('tranl','tran'),'paired native frame '+frame);
 for(const frame of [17,22,35,44,60]){
  const vertices=body.poseverts[frame].slice(192,204);let greatest=0;
  for(let axis=0;axis<3;axis++){const v=vertices.map(p=>p.v[axis]);greatest=Math.max(greatest,(Math.max(...v)-Math.min(...v))*body.scale[axis]);}
  check(greatest>90,'firing frame '+frame+' retains extended flash geometry');
 }
});

// Identity-bound native heights use the same public preparation and material paths as custom skins.
// Keep normal derivation synchronous here; image transport remains the only mocked external dependency.
async function nativeHeightFixture(run){return fixture(async(skins,requests)=>{delete globalThis.window;mode.r_newer_enemies.value=0;mode.r_newer_normals.value=1;await run(skins,requests);});}
function materialNormal(material){
 const shader={uniforms:{},vertexShader:'#include <project_vertex>',fragmentShader:'#include <map_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>'};
 material.onBeforeCompile(shader);return shader.uniforms.qrNormal.value;
}
async function finishNativeHeight(request){
 const decoded=await decodedImage('newer/enemies/heights/armabody/skin0_0.webp');
 request.texture.dispose();request.texture=new THREE.DataTexture(new Uint8Array(decoded.data),decoded.width,decoded.height,THREE.RGBAFormat);request.done(request.texture);return request.texture;
}
Deno.test('Armagon native authored height prewarms only its correct model with custom enemies off',async()=>nativeHeightFixture(async(skins,requests)=>{
 const {model}=await native('armabody'),texture=model.cache.data.gl_texturenum[0][0],entry=index.nativeHeights.armabody[0][0];
 same(entry.nativeModelSha256,SPECS[0].sha,'native authored height has exact model boundary');
 await skins.R_NewerSkinsPrepare([model]);same(requests.length,1,'one shared native-height request across four static skin slots');
 check(requests[0].url.startsWith('newer/enemies/'+entry.file)&&requests[0].url.endsWith('?v='+index.version),'preparation requests authored native path and revision');
 const material=skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,model),generated=materialNormal(material);check(generated,'generated relief available while authored map loads');same(material.map,texture,'native diffuse stays selected');
 const height=await finishNativeHeight(requests[0]),authored=materialNormal(material);check(authored!==generated,'actual authored normal replaces generated companion');
 same(authored.image.width,216,'authored native normal width');same(authored.image.height,194,'authored native normal height');
 check(skins.R_NewerSkinsTextures([model]).includes(height),'prewarm exposes actual authored height for upload');
 same(skins.R_NewerSkinsStatus([model]).pending,0,'authored native height request settled');check(skins.R_NewerSkinsMaterials([model]).includes(material),'prewarm material is actual draw material');
}));
Deno.test('Armagon native-only preparation waits for pending model identity and starts no premature height requests',async()=>nativeHeightFixture(async(skins,requests)=>{
 const {model}=await native('armabody'),texture=model.cache.data.gl_texturenum[0][0];let resolve;
 const identity={state:'pending',sha256:null,promise:new Promise(done=>resolve=done)},pending={...model,aliasSourceIdentity:identity};
 const material=skins.R_EnemyAliasMaterial(texture,pending.name,true,0,0,pending);check(materialNormal(material),'pending identity has generated native relief');same(requests.length,0,'pending draw fetches no authored height');
 const preparation=skins.R_NewerSkinsPrepare([pending]);await ticks();same(requests.length,0,'custom-off preparation still waits for native source identity');same(skins.R_NewerSkinsStatus([pending]).preparePending,1,'native identity wait is accountable');
 identity.state='ready';identity.sha256=SPECS[0].sha;resolve(SPECS[0].sha);await preparation;same(requests.length,1,'matching completed identity starts authored native height');
 await finishNativeHeight(requests[0]);same(skins.R_EnemyAliasMaterial(texture,pending.name,true,0,0,pending),material,'same native material survives identity resolution');
}));
Deno.test('Armagon mismatched and unavailable native identities never fetch constrained authored heights',async()=>nativeHeightFixture(async(skins,requests)=>{
 const {model,bytes}=await native('armabody'),texture=model.cache.data.gl_texturenum[0][0],changed=Buffer.from(bytes);changed.writeInt32LE(changed.readInt32LE(76)^1,76);const wrong=reload(model.name,changed);await wrong.aliasSourceIdentity.promise;
 for(const candidate of [wrong,{...model,aliasSourceIdentity:undefined},{...model,aliasSourceIdentity:{state:'unavailable',promise:Promise.resolve(null)}}]){
  await skins.R_NewerSkinsPrepare([candidate]);check(skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,candidate),'unsupported authored source keeps generated native material');same(requests.length,0,'unsupported identity starts no authored native fetch');check(skins.R_NewerSkinsStatus([candidate]).settled,'unsupported optional native height settles');
 }
 skins.R_EnemyAliasMaterial(texture,model.name,true,0,0);same(requests.length,0,'legacy call without model cannot acquire constrained native height');COM_AddPack(isolatedPack(model.name,bytes));
}));
Deno.test('Armagon reused native texture drops formerly approved relief and rejects cancelled late authored images',async()=>nativeHeightFixture(async(skins,requests)=>{
 const {model}=await native('armabody'),texture=model.cache.data.gl_texturenum[0][0],wrong={...model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}};
 const material=skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,model),generatedHash=sha(materialNormal(material).image.data);same(requests.length,1,'approved source starts native height');
 const authoredHeight=await finishNativeHeight(requests[0]),authoredNormal=materialNormal(material);check(sha(authoredNormal.image.data)!==generatedHash,'authored relief is distinguishable from generated');let disposed=0;authoredHeight.addEventListener('dispose',()=>disposed++);
 same(skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,wrong),material,'native material may be reused across a source correction');same(disposed,1,'formerly approved height disposed');check(materialNormal(material)!==authoredNormal,'formerly approved normal retired');same(sha(materialNormal(material).image.data),generatedHash,'mismatch restores relief from actual native pixels');same(requests.length,1,'mismatch starts no new authored request');
 const pending={...model,aliasSourceIdentity:{state:'pending'}};skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,pending);same(sha(materialNormal(material).image.data),generatedHash,'pending identity retains generated fallback');
 skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,model);same(requests.length,2,'reapproved model can request its height again');
 skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,wrong);const before=materialNormal(material),late=requests[1];let lateDisposed=0;late.texture.addEventListener('dispose',()=>lateDisposed++);late.done(late.texture);
 check(lateDisposed>0,'late image from revoked source disposed');same(materialNormal(material),before,'late image cannot restore revoked authored relief');same(sha(before.image.data),generatedHash,'late completion leaves generated fallback intact');
}));

Deno.test('Malformed native flash policy drops its decoded height and preserves generated native relief',async()=>nativeHeightFixture(async(skins,requests)=>{
 const broken=structuredClone(index);broken.version=String(index.version)+'-invalid-flat';broken.nativeHeights.armabody[0][0].heightFlat.policy='unapproved-flat-policy';skins.R_NewerSetIndex(broken);
 const{model}=await native('armabody'),texture=model.cache.data.gl_texturenum[0][0],material=skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,model),before=sha(materialNormal(material).image.data);
 same(requests.length,1,'approved native identity still acquires its optional image');
 const decoded=await decodedImage('newer/enemies/heights/armabody/skin0_0.webp'),height=new THREE.DataTexture(new Uint8Array(decoded.data),decoded.width,decoded.height,THREE.RGBAFormat);let disposed=0;height.addEventListener('dispose',()=>disposed++);requests[0].done(height);
 same(disposed,1,'malformed policy image is dropped');same(sha(materialNormal(material).image.data),before,'unusable reconstruction cannot replace generated native relief');same(material.map,texture,'native diffuse remains usable');
 check(skins.R_NewerSkinsStatus([model]).errors['armabody:height-policy'],'public status retains malformed optional-policy diagnostic');
 const wrong={...model,aliasSourceIdentity:{state:'ready',sha256:'0'.repeat(64)}};skins.R_EnemyAliasMaterial(texture,model.name,true,0,0,wrong);same(skins.R_NewerSkinsStatus([model]).errors['armabody:height-policy'],undefined,'revoking native identity clears retired policy diagnostic');same(sha(materialNormal(material).image.data),before,'revocation leaves actual generated native relief');same(requests.length,1,'revoked identity starts no replacement height request');
}));

Deno.test('Armagon encoded, decoded and effective-height provenance matches the actual Q92 files',()=>{
 const tasks=[];
 for(const spec of SPECS){
  const base='newer/enemies/'+spec.key+'/custom/',report=JSON.parse(read(base+'SOURCE.json')),variant=index.models[spec.key][0];
  for(const file of ['diffuse.webp','height.webp'])tasks.push({path:fileURLToPath(new URL('../'+base+file,import.meta.url)),receipt:report.runtimeEncoding.maps[file],policy:file==='height.webp'?report.flatHeight?.runtime:null});
  if(spec.key==='armabody'){
   same(JSON.stringify(variant.heightFlat),JSON.stringify(report.flatHeight.runtime),'custom runtime policy is exactly source-authored');
   const native=report.nativeHeight,entry=index.nativeHeights.armabody[0][0];same(JSON.stringify(entry.heightFlat),JSON.stringify(native.flatHeight.runtime),'native runtime policy is exactly source-authored');same(native.encoding.format,'webp','native authored height runtime codec');same(native.encoding.quality,92,'native authored height is Q92');same(native.encoding.lossless,false,'native authored height is not secretly lossless');
   tasks.push({path:fileURLToPath(new URL('../newer/enemies/'+native.file,import.meta.url)),receipt:native.encoding,policy:native.flatHeight.runtime});
  }else same(variant.heightFlat,undefined,'legs have no flash reconstruction');
 }
 // Receipts explicitly name Pillow's decoder. Verify that provenance with its
 // real decoder; runtime/canvas scalars are independently checked against the
 // shipped normal witnesses above, never substituted with Pillow's pixels.
 const script=`import sys,json,hashlib,struct
from PIL import Image
for task in json.load(sys.stdin):
 data=open(task['path'],'rb').read()
 with Image.open(task['path']) as image: rgba=image.convert('RGBA').tobytes(); width,height=image.size
 result={'sha256':hashlib.sha256(data).hexdigest(),'pillowDecodedRgbaSha256':hashlib.sha256(rgba).hexdigest(),'bytes':len(data)}
 policy=task.get('policy')
 if policy:
  scalar=[value/255 for value in rgba[::4]]
  for y,start,end in policy['spans']:
   for x in range(start,end): scalar[y*width+x]=1
  result['pillowEffectiveScalarSha256']=hashlib.sha256(struct.pack('<%df'%len(scalar),*scalar)).hexdigest()
  result['heightPolicySha256']=hashlib.sha256(json.dumps(policy,sort_keys=True,separators=(',',':')).encode()).hexdigest()
  result['scalarEncoding']='float32-le'
 print(json.dumps(result))
`;
 const result=spawnSync(process.env.QUAKED_PYTHON||'/usr/bin/python3',['-c',script],{input:JSON.stringify(tasks),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});same(result.status,0,'Pillow receipt decoder: '+result.stderr);
 const actual=result.stdout.trim().split('\n').map(line=>JSON.parse(line));same(actual.length,tasks.length,'every runtime map receipt checked');for(let i=0;i<tasks.length;i++)for(const[key,value]of Object.entries(actual[i]))same(tasks[i].receipt[key],value,'actual '+key+' for '+tasks[i].path);
});

Deno.test('Actual native and custom material preparation reconstructs decoded flash heights before generating normals',async()=>nativeHeightFixture(async(skins,requests)=>{
 const{model,bytes}=await native('armabody'),variant=index.models.armabody[0],entry=index.nativeHeights.armabody[0][0],nativePixels=model.cache.data.gl_texturenum[0][0].image;
 const original=skins.R_EnemyAliasMaterial(model.cache.data.gl_texturenum[0][0],model.name,true,0,0,model);await finishNativeHeight(requests[0]);
 mode.r_newer_enemies.value=1;const first=requests.length;await skins.R_NewerSkinsPrepare([model]);
 for(const request of requests.slice(first)){
  const file=request.url.split('?')[0],pixels=await decodedImage(file),texture=new THREE.DataTexture(new Uint8Array(pixels.data),pixels.width,pixels.height,THREE.RGBAFormat);request.done(texture);
 }
 const custom=skins.R_NewerAliasMaterial({model,_entityIndex:41},model.name,true,0);check(custom,'approved actual custom material ready');
 for(const[nativeMap,material]of [[true,original],[false,custom]]){
  const factor=nativeMap?1:4,masks=uvMasks(bytes,factor),normal=materialNormal(material),descriptor=nativeMap?entry:variant;
  same(normal.image.width,masks.width,'actual runtime normal width');same(normal.image.height,masks.height,'actual runtime normal height');
  for(let i=0;i<masks.flash.length;i++)if(masks.flash[i])for(let channel=0;channel<4;channel++)same(normal.image.data[i*4+channel],[128,128,255,255][channel],'actual runtime flash normal and maximal height');
  const diffuse=nativeMap?nativePixels:await decodedImage('newer/enemies/armabody/custom/diffuse.webp'),height=await decodedImage(nativeMap?'newer/enemies/'+entry.file:'newer/enemies/armabody/custom/height.webp');
  const decoded=await verifyBake(companion(diffuse,height,nativeMap?entry.strength:variant.heightStrength,nativeMap?entry.cap:variant.heightCap,descriptor,'armabody'),nativeMap?'hipnotic:progs/armabody.mdl':'custom:armabody/custom');
  same(sha(normal.image.data),sha(decoded.pixels),'runtime and shipped bake use identical effective scalar semantics');
 }
}));
