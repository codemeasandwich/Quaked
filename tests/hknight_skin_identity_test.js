// Public source-bound Death Knight skin contract (card [31b]; adapted from the Spawn skin's test). Read only bounded owned PAK members;
// no owned model or native texture is written or redistributed by this test.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pakDirectory, readMember, isolatedPack } from '../tools/pak_members.mjs';
import { COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadModel, model_t } from '../src/engine/render/gl_model.js';
import * as anim from '../src/newer/render/r_anim.js';
import { NormalInputs, NormalInputWitness, R_NormalPrepare } from '../src/normal_prepare.js';
import { NormalBakeDecode } from '../src/normal_bake_format.js';
const EXPECTED = '78d0273de6850f92d059fa90969f66ee57435330b3c4954c836a7204bc7a9d5a';
const SOURCE = 'b1d2fee5599f855a05081926e9fba84eca0aab84ddc43835a33a04581d23aca8';
const NAME = 'progs/hknight.mdl', BASE = 'newer/enemies/hknight/custom/';
const check = ( value, message ) => { if ( !value ) throw Error( message ); };
const same = ( actual, expected, message ) => check( actual === expected, `${message}: ${actual} != ${expected}` );
const sha = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const index = JSON.parse( read( 'newer/enemies/index.json' ) ), approved = index.models.hknight[ 0 ];
const ticks = async () => { for ( let i = 0; i < 20; i ++ ) await Promise.resolve(); };
let nativePromise, serial = 0;
async function native() {
 if ( !nativePromise ) nativePromise = ( async () => {
  check( process.env.QUAKED_OWNED_PAK, 'QUAKED_OWNED_PAK must identify the read-only owned archive' );
  const directory = await pakDirectory( process.env.QUAKED_OWNED_PAK ), files = {};
  for ( const name of [ NAME, 'gfx/palette.lmp' ] ) { check( directory.has( name ), 'owned archive member: ' + name ); files[ name ] = await readMember( directory.get( name ) ); COM_AddPack( isolatedPack( name, files[ name ] ) ); }
  same( sha( files[ NAME ] ), EXPECTED, 'independent native Death Knight digest' ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
  const model = Mod_ForName( NAME, true ); await model.aliasSourceIdentity.promise; return { model, bytes: files[ NAME ] };
 } )(); return nativePromise;
}
function reload( bytes ) { COM_AddPack( isolatedPack( NAME, bytes ) ); const model = new model_t(); model.name = NAME; model.needload = true; return Mod_LoadModel( model, true ); }
function geometry( model ) { const h = model.cache.data; return JSON.stringify( { scale: Array.from( h.scale ), origin: Array.from( h.scale_origin ), commands: Array.from( h.commands ), order: Array.from( h.meshVertexOrder ), poses: h.posedata, frames: h.frames } ); }
async function fixture( run ) {
 const old = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), window: Object.getOwnPropertyDescriptor( globalThis, 'window' ), loader: THREE.TextureLoader.prototype.load, newer: anim.R_IsNewer(), classic: anim.R_ClassicPassActive(), normals: anim.r_newer_normals.value, enemies: anim.r_newer_enemies.value };
 const requests = []; Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } ); Object.defineProperty( globalThis, 'window', { configurable: true, value: {} } );
 THREE.TextureLoader.prototype.load = function ( url, done, _, fail ) { const texture = new THREE.DataTexture( new Uint8Array( 64 ).fill( 127 ), 4, 4 ); requests.push( { url: String( url ), done, fail, texture } ); return texture; };
 anim.R_AnimSetClassicPass( false ); anim.R_AnimSetNewer( true ); anim.r_newer_enemies.value = 1; anim.r_newer_normals.value = 0;
 const skins = await import( '../src/newer/render/r_newerskins.js?hknight-public-' + ++serial ); skins.R_NewerSetIndex( index );
 try { await run( skins, requests ); } finally {
  skins.R_NewerSkinsShutdown(); THREE.TextureLoader.prototype.load = old.loader;
  for ( const key of [ 'document', 'window' ] ) { if ( old[ key ] ) Object.defineProperty( globalThis, key, old[ key ] ); else delete globalThis[ key ]; }
  anim.R_AnimSetClassicPass( old.classic ); anim.R_AnimSetNewer( old.newer ); anim.r_newer_normals.value = old.normals; anim.r_newer_enemies.value = old.enemies;
 }
}
Deno.test( 'owned Death Knight public loader preserves every native UV triangle and all 166 poses with exact source identity', async () => {
 const { model, bytes } = await native(), h = model.cache.data;
 same( model.aliasSourceIdentity.state, 'ready', 'actual digest ready' ); same( model.aliasSourceIdentity.sha256, EXPECTED, 'loaded source identity' ); same( await model.aliasSourceIdentity.promise, EXPECTED, 'identity promise' );
 for ( const [ key, value ] of Object.entries( { numskins: 1, skinwidth: 308, skinheight: 154, numverts: 250, numtris: 452, numframes: 166, numposes: 166 } ) ) same( h[ key ], value, key );
 same( bytes.readInt32LE( 84 ), 0, 'native skin is ungrouped' );
 let offset = 88 + 308 * 154, seams = 0;
 for ( let vertex = 0; vertex < 250; vertex ++, offset += 12 ) { const s = h.stverts[ vertex ]; same( s.onseam, bytes.readInt32LE( offset ), 'UV seam flag' ); same( s.s, bytes.readInt32LE( offset + 4 ), 'native U' ); same( s.t, bytes.readInt32LE( offset + 8 ), 'native V' ); if ( s.onseam ) seams ++; }
 same( seams, 141, 'native seam vertices' );
 for ( let triangle = 0; triangle < 452; triangle ++, offset += 16 ) { same( h.triangles[ triangle ].facesfront, bytes.readInt32LE( offset ), 'native triangle face' ); for ( let corner = 0; corner < 3; corner ++ ) same( h.triangles[ triangle ].vertindex[ corner ], bytes.readInt32LE( offset + 4 + corner * 4 ), 'native triangle index' ); }
 for ( let pose = 0; pose < 166; pose ++ ) { same( bytes.readInt32LE( offset ), 0, 'native pose is ungrouped' ); offset += 28; for ( let vertex = 0; vertex < 250; vertex ++, offset += 4 ) { const actual = h.poseverts[ pose ][ vertex ]; for ( let axis = 0; axis < 3; axis ++ ) same( actual.v[ axis ], bytes[ offset + axis ], 'native pose coordinate' ); same( actual.lightnormalindex, bytes[ offset + 3 ], 'native pose normal index' ); } }
 same( offset, bytes.length, 'all native frame bytes covered' ); same( Mod_ForName( NAME, true ), model, 'native cache identity stable' ); same( sha( bytes ), EXPECTED, 'owned model bytes unchanged' );
} );
Deno.test( 'actual Death Knight assets retain approved provenance and every other enemy manifest entry', async () => {
 const provenance = JSON.parse( read( BASE + 'SOURCE.json' ) ); same( provenance.sourceSha256, SOURCE, 'approved source JPEG identity' ); same( provenance.nativeModelSha256, EXPECTED, 'fit targets exact native model' ); same( provenance.model, NAME, 'fit model' );
 if ( process.env.QUAKED_HKNIGHT_SOURCE ) same( sha( readFileSync( process.env.QUAKED_HKNIGHT_SOURCE ) ), SOURCE, 'actual supplied JPEG bytes' );
 same( JSON.stringify( provenance.dimensions ), '[1540,770]', 'fivefold native atlas dimensions' ); const f = provenance.fit; same( f.direct_supplied_surface_pixels + f.carried_edge_surface_pixels, f.surface_pixels, 'every surface pixel is supplied art or its carried edge colour' );
 check( f.carried_edge_surface_pixels / f.surface_pixels < .015, 'under 1.5% of the surface takes a carried edge colour: ' + f.carried_edge_surface_pixels ); same( f.native_surface_pixels, 0, 'no native pixel on the surface' ); same( f.native_pixels_in_file, 0, 'no native pixel in the file' ); same( f.background_coloured_surface_pixels, 0, 'no background colour on the surface' );
 same( f.parts.length, 8, 'eight supplied pieces with model surface: two bodies (with spikes), two swords, four horn tips' ); same( f.unusedArt.length, 3, 'three pieces of art no triangle uses (two maces and a spare shoulder plate) are left out' );
 const bodies = f.parts.filter( p => p.surfacePixels > 100000 ), swords = f.parts.filter( p => p.waiver ), others = f.parts.filter( p => ! p.waiver );
 same( bodies.length, 2, 'two bodies' ); for ( const part of bodies ) { check( part.detailAgreement > .5, 'a body registers with the native layout: ' + part.detailAgreement ); check( part.surfaceBeyondArt / part.surfacePixels < .01, 'under 1% of a body lies outside its art' ); }
 // the two swords are the recipe's recorded exceptions: their drawn grips are about half the native width
 same( swords.length, 2, 'exactly the two swords are waived' ); for ( const part of swords ) { check( /grip/.test( part.waiver ), 'the waiver says why' ); check( part.detailAgreement > .25, 'a sword still registers above its floor: ' + part.detailAgreement ); check( part.surfaceBeyondArtMaxDistance <= 20 && part.surfaceBeyondArt / part.surfacePixels < .09, 'a sword covers within its limits' ); }
 for ( const part of others ) check( part.surfaceBeyondArtMaxDistance <= 12, 'every other piece covers its surface to within 12 pixels: ' + part.surfaceBeyondArtMaxDistance );
 // the shipped bytes, pinned here and not only in the tool's own record
 same( sha( read( BASE + 'diffuse.webp' ) ), '6d2d99bb144d0af07aad7e0b544220def239e979b56311bb0498f7ac5f7fc863', 'shipped diffuse' ); same( sha( read( BASE + 'height.webp' ) ), '2cbebd4657b618977a0c502afb8ecde290597017e4f9f69d5dd46dff48d65592', 'shipped height' );
 for ( const file of [ 'diffuse.webp', 'height.webp' ] ) same( sha( read( BASE + file ) ), provenance.files[ file ], 'actual fitted asset digest: ' + file );
 same( index.version, 26, 'skin cache revision' ); same( index.models.hknight.length, 1, 'single approved Death Knight variant' ); same( approved.skin, 0, 'only native skin zero admitted' ); same( approved.nativeModelSha256, EXPECTED, 'manifest requires native identity' ); same( approved.heightStrength, .65, 'stored height strength' ); same( approved.flipGreen, false, 'green channel convention' ); same( JSON.stringify( approved.maps ), '{"diffuse":"diffuse.webp","height":"height.webp"}', 'the two maps' ); same( approved.dir, 'hknight/custom', 'directory' ); same( approved.heightCap, .55, 'stored height cap' );
 const other = structuredClone( index ); delete other.version; delete other.models.oldone; delete other.models.enforcer; delete other.models.tarbaby; delete other.models.hknight; // (this skin and the three before it)
 // The same digest as the Shub test's: excluding the four bound skins (Shub, Enforcer, Spawn, Death Knight), the cache revision and the three face-overlay blocks proves all earlier entries intact.
 for ( const model of [ 'soldier', 'ogre', 'knight' ] ) delete other.models[ model ][ 0 ].faces; // (the face overlays, pinned by enemy_face_material_test)
 check( Object.values( other.models ).every( list => list.every( variant => variant.faces === undefined ) ), 'no other variant has face overlays' );
 same( sha( JSON.stringify( other ) ), '96a0c7c83425850e4bf37976cbcd1518e21ccf9391b090d4ae8942773a975fe7', 'all other enemy variants and native height mappings unchanged' );
} );
Deno.test( 'actual manifest admits only matching Death Knight skin zero and preserves native geometry through preparation and selection', async () => fixture( async ( skins, requests ) => {
 const { model, bytes } = await native(), before = geometry( model ), texture = model.cache.data.gl_texturenum[ 0 ][ 0 ], pixelHash = sha( texture.image.data );
 const changed = Buffer.from( bytes ); changed.writeInt32LE( changed.readInt32LE( 76 ) ^ 1, 76 ); const wrong = reload( changed ); await wrong.aliasSourceIdentity.promise; check( wrong.aliasSourceIdentity.sha256 !== EXPECTED, 'same filename different native bytes' );
 const preparing = skins.R_NewerSkinsPrepare( [ model ] ); same( skins.R_NewerSkinsPrepare( [ model, model ] ), preparing, 'matching preparation deduplicates' ); await preparing; same( requests.length, 2, 'exact diffuse and height requests' );
 check( requests.every( r => r.url.startsWith( BASE ) && r.url.endsWith( '?v=' + index.version ) ), 'both requests use approved directory and cache revision' ); same( skins.R_NewerSkinsStatus( [ model ] ).pending, 2, 'preparation acknowledgement is not image readiness' ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'pending diffuse retains native' );
 for ( const request of requests ) request.done( request.texture ); const material = skins.R_NewerAliasMaterial( { model, _entityIndex: 9 }, NAME, true, 0 ); check( material, 'matched skin zero material ready' ); same( material.map, requests.find( r => r.url.includes( 'diffuse.webp' ) ).texture, 'draw uses approved decoded diffuse' );
 same( material.map.flipY, false, 'native top-row-first UV convention retained' ); same( material.map.colorSpace, THREE.SRGBColorSpace, 'diffuse uses native color contract' ); same( skins.R_NewerSkinsStatus( [ model ] ).ready, 2, 'both image callbacks counted' ); check( skins.R_NewerSkinsStatus( [ model ] ).settled, 'image family settled' );
 for ( const skin of [ 1, 2, 7 ] ) same( skins.R_NewerAliasMaterial( { model }, NAME, true, skin ), null, 'unapproved skin remains native' );
 for ( const unsupported of [ wrong, { name: NAME }, { ...model, name: 'progs/unsupported_hknight.mdl' } ] ) { same( skins.R_NewerAliasMaterial( { model: unsupported }, unsupported.name, true, 0 ), null, 'unsupported source/model remains native after positive cache fill' ); same( skins.R_NewerSkinsMaterials( [ unsupported ] ).length, 0, 'unsupported model has no approved materials' ); same( skins.R_NewerSkinsTextures( [ unsupported ] ).length, 0, 'unsupported model has no approved textures' ); }
 same( skins.R_NewerSkinsMaterials( [ NAME ] ).length, 0, 'bare filename cannot prewarm constrained skin' ); check( skins.R_NewerSkinsMaterials( [ model ] ).includes( material ), 'public material family includes actual draw object' );
 anim.R_AnimSetClassicPass( true ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'Classic pass retains native' ); anim.R_AnimSetClassicPass( false ); anim.r_newer_enemies.value = 0; same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'enemies disabled retains native' );
 same( geometry( model ), before, 'all native poses and mesh UV commands unchanged' ); same( sha( texture.image.data ), pixelHash, 'native texture unchanged' ); same( requests.length, 2, 'negative paths start no new downloads' ); let nativeDisposals = 0, materialDisposals = 0, diffuseDisposals = 0; texture.addEventListener( 'dispose', () => nativeDisposals ++ ); material.addEventListener( 'dispose', () => materialDisposals ++ ); material.map.addEventListener( 'dispose', () => diffuseDisposals ++ ); skins.R_NewerSkinsShutdown(); same( nativeDisposals, 0, 'optional cache does not dispose model-owned native skin' ); same( materialDisposals, 1, 'ready replacement material disposed exactly once' ); same( diffuseDisposals, 1, 'ready replacement diffuse disposed exactly once' ); COM_AddPack( isolatedPack( NAME, bytes ) );
} ) );
Deno.test( 'pending source waits for exact identity while unsupported and Classic preparations settle without art requests', async () => fixture( async ( skins, requests ) => {
 const { model } = await native(); anim.R_AnimSetClassicPass( true ); await skins.R_NewerSkinsPrepare( [ model ] ); same( requests.length, 0, 'Classic prepares no replacement' ); anim.R_AnimSetClassicPass( false );
 for ( const identity of [ undefined, { state: 'unavailable', promise: Promise.resolve( null ) }, { state: 'ready', sha256: '0'.repeat( 64 ) } ] ) { const unsupported = { ...model, aliasSourceIdentity: identity }; await skins.R_NewerSkinsPrepare( [ unsupported ] ); same( requests.length, 0, 'unsupported source requests nothing' ); check( skins.R_NewerSkinsStatus( [ unsupported ] ).settled, 'unsupported optional skin settles native fallback' ); }
 let release; const identity = { state: 'pending', sha256: null, promise: new Promise( resolve => release = resolve ) }, pending = { ...model, aliasSourceIdentity: identity };
 same( skins.R_NewerAliasMaterial( { model: pending }, NAME, true, 0 ), null, 'pending source cannot select art' ); const work = skins.R_NewerSkinsPrepare( [ pending ] ); await ticks(); same( requests.length, 0, 'pending source starts no images' ); same( skins.R_NewerSkinsStatus( [ pending ] ).preparePending, 1, 'identity work remains accountable' );
 identity.state = 'ready'; identity.sha256 = EXPECTED; release( EXPECTED ); await work; same( requests.length, 2, 'exact identity starts approved image pair' ); for ( const request of requests ) request.done( request.texture ); check( skins.R_NewerAliasMaterial( { model: pending }, NAME, true, 0 ), 'same pending model becomes usable after readiness' );
} ) );
Deno.test( 'failed Death Knight image loads settle native fallback and shutdown rejects late image and identity publication', async () => fixture( async ( skins, requests ) => {
 const { model } = await native(); await skins.R_NewerSkinsPrepare( [ model ] ); for ( const request of requests ) request.fail(); const status = skins.R_NewerSkinsStatus( [ model ] ); same( status.pending, 0, 'failed downloads no longer pending' ); same( status.fallback, 2, 'both failed maps recorded' ); check( status.settled, 'failed optional art settles' ); same( skins.R_NewerAliasMaterial( { model }, NAME, true, 0 ), null, 'failed diffuse retains native' );
 const disposed = [ 0, 0 ]; requests.forEach( ( request, i ) => request.texture.addEventListener( 'dispose', () => disposed[ i ] ++ ) ); skins.R_NewerSkinsShutdown(); requests.forEach( request => request.done( request.texture ) ); check( disposed.every( n => n > 0 ), 'all late decoded images disposed' ); same( skins.R_NewerSkinsMaterials( [ model ] ).length, 0, 'late images publish no material' );
 let finish; const identity = { state: 'pending', promise: new Promise( resolve => finish = resolve ) }, pending = { ...model, aliasSourceIdentity: identity }; const work = skins.R_NewerSkinsPrepare( [ pending ] ); await ticks(); skins.R_NewerSkinsShutdown(); identity.state = 'ready'; identity.sha256 = EXPECTED; finish( EXPECTED ); check( ( await work ).cancelled, 'retired identity completion cancelled' ); same( requests.length, 2, 'retired identity initiates no downloads' );
} ) );
Deno.test( 'Death Knight shipped normal cache is bound to actual decoded diffuse height and scalar settings', async () => {
 const canvas = await import( process.env.QUAKED_CANVAS_MODULE || '/Users/bri/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas/index.js' );
 const decode = async file => { const image = await canvas.loadImage( read( BASE + file ) ), surface = canvas.createCanvas( image.width, image.height ), ctx = surface.getContext( '2d' ); ctx.drawImage( image, 0, 0 ); return ctx.getImageData( 0, 0, image.width, image.height ); };
 const diffuse = await decode( 'diffuse.webp' ), height = await decode( 'height.webp' ); same( diffuse.width, 1540, 'actual diffuse width' ); same( diffuse.height, 770, 'actual diffuse height' ); same( height.width, diffuse.width, 'height aligned horizontally' ); same( height.height, diffuse.height, 'height aligned vertically' );
 const texture = new THREE.DataTexture( diffuse.data, diffuse.width, diffuse.height ); texture.userData.newerHeight = { width: diffuse.width, height: diffuse.height, derive: false, data: Float32Array.from( { length: height.width * height.height }, ( _, i ) => height.data[ i * 4 ] / 255 ), strength: approved.heightStrength, cap: approved.heightCap };
 const input = NormalInputs( texture ), witness = await NormalInputWitness( input ), manifest = JSON.parse( read( 'newer/normals/manifest.json' ) ), key = witness.key, spec = manifest.samples[ key ]; check( spec, 'exact current asset inputs have prepared normal samples' ); same( manifest.levels[ 'custom:hknight/custom' ].keys.join(), key, 'custom family references exact current input key' );
 const { key: _, ...withoutKey } = witness; same( JSON.stringify( spec.input ), JSON.stringify( withoutKey ), 'prepared witness matches every actual input' ); same( manifest.levels[ 'id1:' + NAME ].modelSha256, EXPECTED, 'native normal family bound to exact model' );
 const compressed = read( spec.file ), raw = gunzipSync( compressed ); same( sha( compressed ), spec.sha256, 'prepared compressed digest' ); same( sha( raw ), spec.rawSha256, 'prepared raw digest' );
 const buffer = raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ), decoded = NormalBakeDecode( buffer, key, input.width, input.height ); check( decoded.scalar.every( ( value, i ) => value === input.scalar[ i ] ), 'prepared scalar equals actual stored height pixel for pixel' );
 let loads = 0; const work = R_NormalPrepare( texture, { loader: async requested => { loads ++; same( requested.rawSha256, spec.rawSha256, 'runtime selects same prepared bytes' ); return buffer; }, disk: { ensure() { throw Error( 'Exact shipped sample must not invoke disk generation' ); } }, generate() { throw Error( 'Exact shipped sample must not regenerate normals' ); } } ); await work.promise; same( work.status, 'ready', 'actual public normal preparation ready' ); same( work.source, 'shipped', 'actual public path uses shipped cache' ); same( loads, 1, 'single shipped load' ); same( R_NormalPrepare( texture ), work, 'warm preparation reuses current inputs' ); texture.dispose(); same( work.status, 'cancelled', 'normal work retires with owning texture' );
} );
