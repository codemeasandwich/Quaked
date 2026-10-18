// Public source-bound Quake Wrath skin contract. Adapted from the Death Knight public-interface tests.
// Read only bounded owned PAK members;
// no owned model or native texture is written or redistributed by this test.
import * as THREE from 'three';
import { readFileSync } from './helpers/resource_fs.mjs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { NormalInputs, NormalInputWitness, R_NormalPrepare } from '../src/newer/assets/normal_prepare.js';
import { NormalBakeDecode } from '../src/newer/assets/normal_bake_format.js';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as mode from '../src/newer/mode.js';
const EXPECTED = '0a57ee912df3142c5e17183d5f6bd461021b141d53f7534014d59eda97e6bfa6';
const SOURCE = 'tools/texture_sheets/sources/fidelity-2026-10-13/wrath-photographic-detailed.png';
const SOURCE_SHA = '4a190d6e0fb2d74ff5eb29188f857be028d3b1a946fe869d8b5783a4ba3660dd';
const NAME = 'progs/wrath.mdl', BASE = 'newer/enemies/wrath/custom/';
const check = ( value, message ) => { if ( !value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const sha = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const index = JSON.parse( read( 'newer/enemies/index.json' ) ), approved = index.models.wrath[ 0 ];
const ticks = async () => { for ( let i = 0; i < 20; i ++ ) await Promise.resolve(); };
let nativePromise, serial = 0;
async function native() {
 if ( !nativePromise ) nativePromise = ( async () => {
  check( process.env.QUAKED_OWNED_PAK, 'QUAKED_OWNED_PAK must identify the read-only owned archive' );
  check( process.env.QUAKED_ID1_PAK, 'QUAKED_ID1_PAK must identify the read-only owned palette archive' );
  const directory = await pakDirectory( process.env.QUAKED_OWNED_PAK ), paletteDirectory = await pakDirectory( process.env.QUAKED_ID1_PAK ), files = {};
  for ( const name of [ NAME, 'gfx/palette.lmp' ] ) { const source = name === NAME ? directory : paletteDirectory; check( source.has( name ), 'owned archive member: ' + name ); files[ name ] = await readMember( source.get( name ) ); COM_AddPack( isolatedPack( name, files[ name ] ) ); }
  same( sha( files[ NAME ] ), EXPECTED, 'independent native Wrath digest' ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
  const model = Mod_ForName( NAME, true ); await model.aliasSourceIdentity.promise; return { model, bytes: files[ NAME ] };
 } )(); return nativePromise;
}
function reload( bytes ) { COM_AddPack( isolatedPack( NAME, bytes ) ); const model = new model_t(); model.name = NAME; model.needload = true; return Mod_LoadModel( model, true ); }
function geometry( model ) { const h = model.cache.data; return JSON.stringify( { scale: Array.from( h.scale ), origin: Array.from( h.scale_origin ), commands: Array.from( h.commands ), order: Array.from( h.meshVertexOrder ), poses: h.posedata, frames: h.frames } ); }
async function fixture( run ) {
 const old = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), window: Object.getOwnPropertyDescriptor( globalThis, 'window' ), loader: THREE.TextureLoader.prototype.load, newer: mode.R_IsNewer(), classic: mode.R_ClassicPassActive(), normals: mode.r_newer_normals.value, enemies: mode.r_newer_enemies.value };
 const requests = []; Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } ); Object.defineProperty( globalThis, 'window', { configurable: true, value: {} } );
 THREE.TextureLoader.prototype.load = function ( url, done, _, fail ) { const texture = new THREE.DataTexture( new Uint8Array( 64 ).fill( 127 ), 4, 4 ); requests.push( { url: String( url ), done, fail, texture } ); return texture; };
 mode.R_AnimSetClassicPass( false ); mode.R_AnimSetNewer( true ); mode.r_newer_enemies.value = 1; mode.r_newer_normals.value = 0;
 const skins = await import( '../src/newer/render/r_newerskins.js?wrath-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  mode.R_AnimSetClassicPass( old.classic ); mode.R_AnimSetNewer( old.newer ); mode.r_newer_normals.value = old.normals; mode.r_newer_enemies.value = old.enemies;
 }
}
Deno.test( 'owned Wrath public loader preserves every native UV triangle and all 87 poses with exact source identity', async () => {
 const { model, bytes } = await native(), h = model.cache.data;
 same( model.aliasSourceIdentity.state, 'ready', 'actual digest ready' ); same( model.aliasSourceIdentity.sha256, EXPECTED, 'loaded source identity' ); same( await model.aliasSourceIdentity.promise, EXPECTED, 'identity promise' );
 for ( const [ key, value ] of Object.entries( { numskins: 1, skinwidth: 248, skinheight: 194, numverts: 212, numtris: 420, numframes: 87, numposes: 87 } ) ) same( h[ key ], value, key );
 same( bytes.readInt32LE( 84 ), 0, 'native skin is ungrouped' );
 same(sha(bytes.subarray(88,88+248*194)),'70dda55c7c14528fa606b006d70bb95822a5e768cb6dd898f698035bbd0de07d','original Wrath skin identity');
 for(const [frame,name]of [[0,'wrthfrme'],[1,'wrthwk01'],[12,'wrthwk12'],[13,'wrthaa01'],[26,'wrthaa14'],[27,'wrthab01'],[39,'wrthab13'],[40,'wrthac01'],[54,'wrthac15'],[55,'wrthpa01'],[60,'wrthpa06'],[61,'wrthpb01'],[71,'wrthpb11'],[72,'wrthdt01'],[86,'wrthdt15']])same(h.frames[frame].name,name,'native animation boundary '+frame);
 let offset = 88 + 248 * 194, seams = 0;
 for ( let vertex = 0; vertex < 212; vertex ++, offset += 12 ) { const s = h.stverts[ vertex ]; same( s.onseam, bytes.readInt32LE( offset ), 'UV seam flag' ); same( s.s, bytes.readInt32LE( offset + 4 ), 'native U' ); same( s.t, bytes.readInt32LE( offset + 8 ), 'native V' ); if ( s.onseam ) seams ++; }
 check( seams > 0, 'native seam vertices are exercised' );
 for ( let triangle = 0; triangle < 420; triangle ++, offset += 16 ) { same( h.triangles[ triangle ].facesfront, bytes.readInt32LE( offset ), 'native triangle face' ); for ( let corner = 0; corner < 3; corner ++ ) same( h.triangles[ triangle ].vertindex[ corner ], bytes.readInt32LE( offset + 4 + corner * 4 ), 'native triangle index' ); }
 for ( let pose = 0; pose < 87; pose ++ ) { same( bytes.readInt32LE( offset ), 0, 'native pose is ungrouped' ); offset += 28; for ( let vertex = 0; vertex < 212; vertex ++, offset += 4 ) { const actual = h.poseverts[ pose ][ vertex ]; for ( let axis = 0; axis < 3; axis ++ ) same( actual.v[ axis ], bytes[ offset + axis ], 'native pose coordinate' ); same( actual.lightnormalindex, bytes[ offset + 3 ], 'native pose normal index' ); } }
 same( offset, bytes.length, 'all native frame bytes covered' ); same( Mod_ForName( NAME, true ), model, 'native cache identity stable' ); same( sha( bytes ), EXPECTED, 'owned model bytes unchanged' );
} );
Deno.test( 'actual Wrath assets retain generated source, matching dimensions and other enemy entries', async () => {
 const provenance = JSON.parse( read( BASE + 'SOURCE.json' ) ); same( provenance.nativeModelSha256, EXPECTED, 'fit targets exact native model' ); same( provenance.model, NAME, 'fit model' );
 same( JSON.stringify( provenance.dimensions ), '[992,776]', 'fourfold native atlas dimensions (the 4x standard)' );
 const recipe=JSON.parse(read('tools/texture_sheets/sources/fidelity-2026-10-13/wrath-photographic.json'));
 same(recipe.sourceFile,SOURCE,'selected recipe uses exact prospective source');same(recipe.sourceSha,SOURCE_SHA,'recipe source identity');same(recipe.modelSha,EXPECTED,'recipe exact native model');same(JSON.stringify(recipe.layout),'[1,248,194,212,420,87]','recipe actual native topology');same(JSON.stringify(recipe.size),'[1419,1109]','recipe source size');same(recipe.factor,4,'recipe uses existing fourfold standard');same(JSON.stringify(recipe.runtimeEncoding),'{"format":"webp","quality":92}','explicit WebP92 recipe');
 same(provenance.factor,4,'actual fitted scale');same(JSON.stringify(provenance.atlasBox),'[0,0,992,776]','whole native atlas registered without rotation');same(provenance.nativeTexturePixelsUsed,0,'new material comes from generated source, not copied native pigment');same(provenance.surfacePixels,323337,'complete body and eye native UV area');same(provenance.edgePixels,12893,'recorded bounded extension for selected source');same(provenance.islands.length,6,'two body islands and all four eye islands fitted');for(const island of provenance.islands)same(island.directPixels+island.edgePixels,island.surfacePixels,'each half has accounted coverage');
 same(approved.heightFlat,undefined,'solid eyes has no Armagon flash-height reconstruction');same(index.nativeHeights.wrath,undefined,'native fallback still derives from its original skin');
 const encoding=provenance.runtimeEncoding;same(encoding.format,'webp','runtime codec');same(encoding.quality,92,'owner-selected quality');same(encoding.lossless,false,'lossy runtime image format declared');same(encoding.authoringSourceUnchanged,true,'generated authoring original retained');
 const receiptInputs=[];
 for(const file of ['diffuse.webp','height.webp']){
  const data=read(BASE+file),receipt=encoding.maps[file];same(data.toString('ascii',0,4),'RIFF','WebP container');same(data.toString('ascii',8,12),'WEBP','WebP signature');let offset=12,lossy=false;
  while(offset+8<=data.length){const tag=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4);if(tag==='VP8 ')lossy=true;check(tag!=='VP8L','lossless payload cannot masquerade as Q92');offset+=8+size+(size&1);}check(lossy,'actual lossy VP8 payload');same(receipt.sha256,sha(data),'encoding receipt binds shipped file');same(receipt.bytes,data.length,'encoded byte count');check(/^[0-9a-f]{64}$/.test(receipt.masterSha256),'retained lossless fit-master identity');
  receiptInputs.push(fileURLToPath(new URL('../'+BASE+file,import.meta.url)));
 }
 // These receipts name Pillow explicitly. Runtime canvas decoding is separately
 // used by the exact shipped-normal witness case below, never substituted here.
 const proof=spawnSync(process.env.QUAKED_PYTHON||'/usr/bin/python3',['-c',"import sys,json,hashlib\nfrom PIL import Image\nfor path in json.load(sys.stdin):\n with Image.open(path) as im: print(hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest())"],{input:JSON.stringify(receiptInputs),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});same(proof.status,0,'decode actual Pillow provenance: '+proof.stderr);const decodedHashes=proof.stdout.trim().split('\n');same(decodedHashes.length,2,'both decoded maps checked');for(const[i,file]of ['diffuse.webp','height.webp'].entries())same(encoding.maps[file].pillowDecodedRgbaSha256,decodedHashes[i],'actual decoded receipt '+file);

 same(recipe.atlasBox,undefined,'fresh recipe has no old registration box');same(recipe.nativeBlackRegions,undefined,'fresh recipe has no stale black-pixel exception');

 same(JSON.stringify(provenance.atlasBox),'[0,0,992,776]','new source registered directly at native fourfold dimensions');same(provenance.registration,null,'no stale factor-six registration');
 check(provenance.generatedBlackSurface==null,'new fit needs no historical black-region exception');same(provenance.flatHeight,undefined,'solid eyes do not inherit flash-height override');
 same( provenance.source, SOURCE, 'generated source provenance path' ); same( provenance.sourceSha256, SOURCE_SHA, 'generated source hash' ); same( sha( read( SOURCE ) ), SOURCE_SHA, 'actual generated PNG bytes' );
 for ( const file of [ 'diffuse.webp', 'height.webp' ] ) same( sha( read( BASE + file ) ), provenance.files[ file ], 'actual fitted asset digest: ' + file );
 same( index.models.wrath.length, 1, 'single approved Wrath variant' ); same( approved.skin, 0, 'only native skin zero admitted' ); same( approved.nativeModelSha256, EXPECTED, 'manifest requires native identity' );
 same( approved.dir, 'wrath/custom', 'directory' ); same( approved.maps.diffuse, 'diffuse.webp', 'reviewed fit uses owner-required lossy WebP92' ); same( approved.maps.height, 'height.webp', 'matching stored height' ); same( Object.keys( approved.maps ).length, 2, 'only expected maps' ); same( approved.flipGreen, false, 'generated normal green convention' );
 const other = structuredClone( index );other.models.ogre=other.models.ogre.slice(0,1);other.nativeHeights.ogre=other.nativeHeights.ogre.slice(0,1);other.models.knight=other.models.knight.slice(0,1);other.nativeHeights.knight=other.nativeHeights.knight.slice(0,1); delete other.version;
 // Same historical family projection, refreshed from committed HEAD9950863c after
 // separately published photographic corrections; no prior family is omitted.
 const baselineKeys = ["boss", "knight", "ogre", "soldier", "wizard", "backpack", "suit", "armor", "shambler", "zombie", "demon", "h_demon", "h_dog", "zom_gib", "h_shams", "shalrath", "oldone", "enforcer", "tarbaby", "hknight", "scor", "dragon", "s_wrath", "mummy", "dog", "fish", "grem", "armabody", "armalegs", "eel2", "sword"];
 other.models = Object.fromEntries(Object.entries(other.models).filter(([key]) => baselineKeys.includes(key)).map(([key,list])=>[key,['hknight','tarbaby'].includes(key)?list.slice(0,1):list]));
 const baselineHeightKeys = ["gib1", "gib2", "gib3", "zom_gib", "ogre", "h_ogre", "demon", "h_demon", "shambler", "h_shams", "knight", "h_knight", "soldier", "h_guard", "wizard", "h_wizard", "h_dog", "dog", "zombie", "h_zombie", "boss", "armabody", "eel2"];
 other.nativeHeights = Object.fromEntries(Object.entries(other.nativeHeights).filter(([key]) => baselineHeightKeys.includes(key)));
 same(sha(JSON.stringify(other)), '40909ae6c9a488c9f47d4a631fc3a0d85bc50805ff6f41d9d6d8ebf878e51cfb', 'all prior model and native-height families preserved');
 const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
 const decode = async file => { const image = await canvas.loadImage( read( BASE + file ) ), surface = canvas.createCanvas( image.width, image.height ), ctx = surface.getContext( '2d' ); ctx.drawImage( image, 0, 0 ); return ctx.getImageData( 0, 0, image.width, image.height ); };
 // Read hash-pinned source dimensions from PNG IHDR. Both product maps undergo actual canvas decoding below.
 const generated = read( SOURCE ); same( generated.subarray( 0, 8 ).toString( 'hex' ), '89504e470d0a1a0a', 'generated source PNG signature' ); same( generated.toString( 'ascii', 12, 16 ), 'IHDR', 'generated source image header' ); same( generated.readUInt32BE( 16 ), 1419, 'generated source width' ); same( generated.readUInt32BE( 20 ), 1109, 'generated source height' );
 const diffuse = await decode( 'diffuse.webp' ), height = await decode( 'height.webp' ); same( diffuse.width, 992, 'actual diffuse width' ); same( diffuse.height, 776, 'actual diffuse height' ); same( height.width, diffuse.width, 'height aligned horizontally' ); same( height.height, diffuse.height, 'height aligned vertically' );
 let halfDifferences=0;for(let y=0;y<diffuse.height;y++)for(let x=0;x<diffuse.width/2;x++){const a=(y*diffuse.width+x)*4,b=a+diffuse.width/2*4;if(diffuse.data[a]!==diffuse.data[b]||diffuse.data[a+1]!==diffuse.data[b+1]||diffuse.data[a+2]!==diffuse.data[b+2])halfDifferences++;}check(halfDifferences>1418,'fitted front/back preserve distinct art instead of duplicating one half');
 // Fixed interior of the native front hood opening: original atlas is entirely black here.
 for(let y=30*4;y<44*4;y++)for(let x=57*4;x<65*4;x++){const o=(y*diffuse.width+x)*4;check(Math.max(diffuse.data[o],diffuse.data[o+1],diffuse.data[o+2])<=4,'hood interior remains empty instead of gaining a painted face');}
 let min = 255, max = 0;
 for ( let i = 0; i < height.data.length; i += 4 ) { const value = height.data[i]; check(Math.max(value,height.data[i+1],height.data[i+2])-Math.min(value,height.data[i+1],height.data[i+2])<=1,'neutral height remains gray within one codec rounding unit; runtime uses decoded red'); same( height.data[i+3], 255, 'height fully opaque' ); same( diffuse.data[i+3], 255, 'diffuse fully opaque' ); min = Math.min( min, value ); max = Math.max( max, value ); }
 check( max - min > 32, 'actual stored height is nonflat' );
} );
Deno.test( 'actual manifest admits only matching Wrath skin zero and preserves native geometry through preparation and selection', async () => fixture( async ( skins, requests ) => {
 check( skins.ENEMY_SKIN_MODELS.has( 'wrath' ), 'Wrath uses existing enemy material classification' );
 const { model, bytes } = await native(), before = geometry( model ), texture = model.cache.data.gl_texturenum[ 0 ][ 0 ], pixelHash = sha( texture.image.data );
 const changed = Buffer.from( bytes ); changed.writeInt32LE( changed.readInt32LE( 76 ) ^ 1, 76 ); const wrong = reload( changed ); await wrong.aliasSourceIdentity.promise; check( wrong.aliasSourceIdentity.sha256 !== EXPECTED, 'same filename different native bytes' );
 const archive=await pakDirectory(process.env.QUAKED_OWNED_PAK),overlordBytes=await readMember(archive.get('progs/s_wrath.mdl'));same(sha(overlordBytes),'4c0653e3adba99be4d581c92a928fd6e8c27b0a2159a97f7ec5e885478249b8d','actual distinct Overlord control');COM_AddPack(isolatedPack('progs/s_wrath.mdl',overlordBytes));const overlord=Mod_ForName('progs/s_wrath.mdl',true);await overlord.aliasSourceIdentity.promise;
 same(skins.R_NewerAliasMaterial({model:{...overlord,name:NAME}},NAME,true,0),null,'Overlord bytes cannot select Wrath art even under its filename');
 const preparing = skins.R_NewerSkinsPrepare( [ model ] ); same( skins.R_NewerSkinsPrepare( [ model, model ] ), preparing, 'matching preparation deduplicates' ); await preparing; same( requests.length, 2, 'exact diffuse and height requests' );
 check( requests.every( r => r.url.startsWith( BASE ) && r.url.endsWith( '?v=' + index.version ) ), 'both requests use approved directory and cache revision' ); same( skins.R_NewerSkinsStatus( [ model ] ).pending, 2, 'preparation acknowledgement is not image readiness' ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'pending diffuse retains native' );
 for ( const request of requests ) request.done( request.texture ); const material = skins.R_NewerAliasMaterial( { model, _entityIndex: 9 }, NAME, true, 0 ); check( material, 'matched skin zero material ready' ); same( material.map, requests.find( r => r.url.includes( 'diffuse.webp' ) ).texture, 'draw uses approved decoded diffuse' );
 same( material.map.flipY, false, 'native top-row-first UV convention retained' ); same( material.map.colorSpace, THREE.SRGBColorSpace, 'diffuse uses native color contract' ); same( skins.R_NewerSkinsStatus( [ model ] ).ready, 2, 'both image callbacks counted' ); check( skins.R_NewerSkinsStatus( [ model ] ).settled, 'image family settled' );
 for ( const skin of [ 1, 2, 7 ] ) same( skins.R_NewerAliasMaterial( { model }, NAME, true, skin ), null, 'unapproved skin remains native' );
 for ( const unsupported of [ wrong, { name: NAME }, { ...model, name: 'progs/unsupported_wrath.mdl' } ] ) { same( skins.R_NewerAliasMaterial( { model: unsupported }, unsupported.name, true, 0 ), null, 'unsupported source/model remains native after positive cache fill' ); same( skins.R_NewerSkinsMaterials( [ unsupported ] ).length, 0, 'unsupported model has no approved materials' ); same( skins.R_NewerSkinsTextures( [ unsupported ] ).length, 0, 'unsupported model has no approved textures' ); }
 same( skins.R_NewerSkinsMaterials( [ NAME ] ).length, 0, 'bare filename cannot prewarm constrained skin' ); check( skins.R_NewerSkinsMaterials( [ model ] ).includes( material ), 'public material family includes actual draw object' );
 mode.R_AnimSetClassicPass( true ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'Classic pass retains native' ); mode.R_AnimSetClassicPass( false ); mode.r_newer_enemies.value = 0; same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'enemies disabled retains native' );
 same( geometry( model ), before, 'all native poses and mesh UV commands unchanged' ); same( sha( texture.image.data ), pixelHash, 'native texture unchanged' ); same( requests.length, 2, 'negative paths start no new downloads' ); let nativeDisposals = 0, materialDisposals = 0, diffuseDisposals = 0; texture.addEventListener( 'dispose', () => nativeDisposals ++ ); material.addEventListener( 'dispose', () => materialDisposals ++ ); material.map.addEventListener( 'dispose', () => diffuseDisposals ++ ); skins.R_NewerSkinsShutdown(); same( nativeDisposals, 0, 'optional cache does not dispose model-owned native skin' ); same( materialDisposals, 1, 'ready replacement material disposed exactly once' ); same( diffuseDisposals, 1, 'ready replacement diffuse disposed exactly once' ); COM_AddPack( isolatedPack( NAME, bytes ) );
} ) );
Deno.test( 'pending source waits for exact identity while unsupported and Classic preparations settle without art requests', async () => fixture( async ( skins, requests ) => {
 const { model } = await native(); mode.R_AnimSetClassicPass( true ); await skins.R_NewerSkinsPrepare( [ model ] ); same( requests.length, 0, 'Classic prepares no replacement' ); mode.R_AnimSetClassicPass( false );
 for ( const identity of [ undefined, { state: 'unavailable', promise: Promise.resolve( null ) }, { state: 'ready', sha256: '0'.repeat( 64 ) } ] ) { const unsupported = { ...model, aliasSourceIdentity: identity }; await skins.R_NewerSkinsPrepare( [ unsupported ] ); same( requests.length, 0, 'unsupported source requests nothing' ); check( skins.R_NewerSkinsStatus( [ unsupported ] ).settled, 'unsupported optional skin settles native fallback' ); }
 let release; const identity = { state: 'pending', sha256: null, promise: new Promise( resolve => release = resolve ) }, pending = { ...model, aliasSourceIdentity: identity };
 same( skins.R_NewerAliasMaterial( { model: pending }, NAME, true, 0 ), null, 'pending source cannot select art' ); const work = skins.R_NewerSkinsPrepare( [ pending ] ); await ticks(); same( requests.length, 0, 'pending source starts no images' ); same( skins.R_NewerSkinsStatus( [ pending ] ).preparePending, 1, 'identity work remains accountable' );
 identity.state = 'ready'; identity.sha256 = EXPECTED; release( EXPECTED ); await work; same( requests.length, 2, 'exact identity starts approved image pair' ); for ( const request of requests ) request.done( request.texture ); check( skins.R_NewerAliasMaterial( { model: pending }, NAME, true, 0 ), 'same pending model becomes usable after readiness' );
} ) );
Deno.test( 'failed Wrath image loads settle native fallback and shutdown rejects late image and identity publication', async () => fixture( async ( skins, requests ) => {
 const { model } = await native(); await skins.R_NewerSkinsPrepare( [ model ] ); for ( const request of requests ) request.fail(); const status = skins.R_NewerSkinsStatus( [ model ] ); same( status.pending, 0, 'failed downloads no longer pending' ); same( status.fallback, 2, 'both failed maps recorded' ); check( status.settled, 'failed optional art settles' ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'failed diffuse retains native' );
 const disposed = [ 0, 0 ]; requests.forEach( ( request, i ) => request.texture.addEventListener( 'dispose', () => disposed[ i ] ++ ) ); skins.R_NewerSkinsShutdown(); requests.forEach( request => request.done( request.texture ) ); check( disposed.every( n => n > 0 ), 'all late decoded images disposed' ); same( skins.R_NewerSkinsMaterials( [ model ] ).length, 0, 'late images publish no material' );
 let finish; const identity = { state: 'pending', promise: new Promise( resolve => finish = resolve ) }, pending = { ...model, aliasSourceIdentity: identity }; const work = skins.R_NewerSkinsPrepare( [ pending ] ); await ticks(); skins.R_NewerSkinsShutdown(); identity.state = 'ready'; identity.sha256 = EXPECTED; finish( EXPECTED ); check( ( await work ).cancelled, 'retired identity completion cancelled' ); same( requests.length, 2, 'retired identity initiates no downloads' );
} ) );

const decodedImages = new Map();
async function decodedImage(path) {
 if (!decodedImages.has(path)) decodedImages.set(path,(async()=>{
  const canvas = await import(process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js');
  const image = await canvas.loadImage(read(path)), surface = canvas.createCanvas(image.width,image.height), context = surface.getContext('2d');
  context.drawImage(image,0,0); return context.getImageData(0,0,image.width,image.height);
 })());
 return decodedImages.get(path);
}
function companion(pixels,height,strength=.65,cap=.55) {
 const texture = new THREE.DataTexture(pixels.data,pixels.width,pixels.height,THREE.RGBAFormat);
 texture.userData.newerHeight={width:pixels.width,height:pixels.height,derive:!height,data:height?Float32Array.from({length:height.width*height.height},(_,i)=>height.data[i*4]/255):undefined,strength,cap};
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
Deno.test('Wrath custom and native generated inputs use exact shipped normal samples',async()=>{
 const {model}=await native(),pixels=model.cache.data.gl_texturenum[0][0].image,diffuse=await decodedImage(BASE+'diffuse.webp'),height=await decodedImage(BASE+'height.webp');
 const custom=companion(diffuse,height,approved.heightStrength,approved.heightCap);await verifyBake(custom,'custom:wrath/custom');
 await verifyBake(companion(pixels,null),'rogue:'+NAME,EXPECTED);
});
Deno.test('Wrath has two persistent native eye meshes and four separate red atlas islands, not firing flashes',async()=>{
 const {model,bytes}=await native(),h=model.cache.data,start=88+248*194,triStart=start+212*12,groups=new Map(),used=new Set();
 for(let t=0;t<420;t++){
  const o=triStart+t*16,front=bytes.readInt32LE(o),ids=[0,1,2].map(c=>bytes.readInt32LE(o+4+c*4)),selected=ids.map(v=>v>=7&&v<17);
  check(selected.every(Boolean)||selected.every(v=>!v),'eye surfaces share no triangle with the robe');if(!selected[0])continue;
  ids.forEach(v=>used.add(v));const left=ids.every(v=>v<=10||v===15);check(left||ids.every(v=>v>=11&&v<=14||v===16),'eye triangle remains within one eye');
  const key=(front?'front':'back')+(left?'Left':'Right'),g=groups.get(key)||{count:0,points:[]};g.count++;
  for(const v of ids){const p=start+v*12;g.points.push([bytes.readInt32LE(p+4)+(!front&&bytes.readInt32LE(p)?124:0),bytes.readInt32LE(p+8)]);}groups.set(key,g);
 }
 same(used.size,10,'all ten original eye vertices retained');
 for(const[key,count,box]of [['frontLeft',4,[29,163,49,179]],['frontRight',4,[75,163,95,179]],['backLeft',2,[153,163,173,179]],['backRight',2,[199,163,219,179]]]){
  const g=groups.get(key);check(g,'eye atlas component '+key);same(g.count,count,'eye triangle count '+key);const xs=g.points.map(p=>p[0]),ys=g.points.map(p=>p[1]);same(JSON.stringify([Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]),JSON.stringify(box),'exact eye UV bounds '+key);
 }
 for(let pose=0;pose<87;pose++)for(const ids of [[7,8,9,10,15],[11,12,13,14,16]]){
  let span=0;for(let axis=0;axis<3;axis++){const values=ids.map(v=>h.poseverts[pose][v].v[axis]);span=Math.max(span,(Math.max(...values)-Math.min(...values))*h.scale[axis]);}
  check(span>.5&&span<3.5,'each eye remains a tiny persistent solid surface in pose '+pose);
 }
 const diffuse=await decodedImage(BASE+'diffuse.webp'),height=await decodedImage(BASE+'height.webp'),eyeRedMeans=[];
 for(const [left,top,right,bottom]of [[29,163,49,179],[75,163,95,179],[153,163,173,179],[199,163,219,179]]){
  let red=0,total=0,nonMaxHeight=0,redSum=0;for(let y=(top+4)*4;y<(bottom-4)*4;y++)for(let x=(left+6)*4;x<(right-6)*4;x++){
   const o=(y*diffuse.width+x)*4;total++;redSum+=diffuse.data[o];if(diffuse.data[o]>diffuse.data[o+1]+10&&diffuse.data[o]>diffuse.data[o+2]+10)red++;if(height.data[o]<255)nonMaxHeight++;
  }
  check(red>total*.5,'each fitted eye island retains its red pigment');check(nonMaxHeight>total*.5,'eye height is not the maximal flash shadow-bypass plateau');eyeRedMeans.push(redSum/total);
 }
 check(eyeRedMeans[0]>eyeRedMeans[2]&&eyeRedMeans[1]>eyeRedMeans[3],'both bright front eyes remain brighter red than their dark maroon backs');
});
