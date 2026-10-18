import {ResourceURL} from '../src/platform/resource_paths.js';
// Independent public-interface verification of the quality92 channel-normal world families.
// Reads real PAK/BSP inputs, decodes real lossy WebPs and uses renderer endpoints.
// Passing these checks is not visual acceptance or GPU gameplay verification.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from './helpers/resource_fs.mjs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { GL_LoadTexture } from '../src/engine/render/gl_model_common.js';
import { VID_SetPalette, vid } from '../src/engine/render/vid.js';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { R_NormalMapFor } from '../src/newer/render/gl_normals.js';
import { GAME_CATALOGUE_GAMES } from '../src/engine/common/game_catalogue.js';
import { memberSearch, readMember, sha256 } from '../tools/pak_members.mjs';
const root = resolve(import.meta.dirname, '..');
const sourceRoot = process.env.QUAKED_GAME_ROOT ? resolve(process.env.QUAKED_GAME_ROOT) : root;
const read = path => readFileSync(resolve(root,path));
const receiptPath = 'tools/texture_sheets/sources/official-world-2026-10-12/q92-channel-registration.json';
const firstReceipt = JSON.parse(read(receiptPath));
const migrationPath='tools/texture_sheets/sources/official-world-2026-10-12/q92-prior-generation-migration.json';
const migration=JSON.parse(read(migrationPath));
const fourTimes=JSON.parse(read(migration.historicalInput.file));
const tfReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/tf-metal-registration.json';
const tfReceipt=JSON.parse(read(tfReceiptPath));
const rockReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/rock-pair-registration.json';
const rockReceipt=JSON.parse(read(rockReceiptPath));
const quietReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/quiet-metal-registration.json';
const quietReceipt=JSON.parse(read(quietReceiptPath));
const realismReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/realism-registration.json';
const realismReceipt=JSON.parse(read(realismReceiptPath));
const characterReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/character-stone-registration.json';
const characterReceipt=JSON.parse(read(characterReceiptPath));
const agedReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/aged-wall-metal-registration.json';
const agedReceipt=JSON.parse(read(agedReceiptPath));
const agedCorrectionPath='tools/texture_sheets/sources/official-world-2026-10-12/aged-wall-metal-v3-correction.json';
const agedCorrection=JSON.parse(read(agedCorrectionPath));
const floorStoneStudReceiptPath='tools/texture_sheets/sources/official-world-2026-10-13-continuation/floor-stone-stud-registration.json';
const floorStoneStudReceipt=JSON.parse(read(floorStoneStudReceiptPath));
const crosspackStoneReceiptPath='tools/texture_sheets/sources/official-world-2026-10-13-continuation/crosspack-stone-registration.json';
const crosspackStoneReceipt=JSON.parse(read(crosspackStoneReceiptPath));
const concreteFourReceiptPath='tools/texture_sheets/sources/official-world-2026-10-13-continuation/concrete-four-registration.json';
const concreteFourReceipt=JSON.parse(read(concreteFourReceiptPath));
const baseFiveAliasReceiptPath='tools/texture_sheets/sources/official-world-2026-10-13-continuation/base-five-and-alias-registration.json';
const baseFiveAliasReceipt=JSON.parse(read(baseFiveAliasReceiptPath));
const bracedWoodReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/braced-wood-registration.json';
const bracedWoodReceipt=JSON.parse(read(bracedWoodReceiptPath));
const mottledStoneReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/mottled-stone-registration.json';
const mottledStoneReceipt=JSON.parse(read(mottledStoneReceiptPath));
const corrodedSteelReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/corroded-steel-registration.json';
const corrodedSteelReceipt=JSON.parse(read(corrodedSteelReceiptPath));
const baseMasonryTrimsReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/base-masonry-trims-registration.json';
const baseMasonryTrimsReceipt=JSON.parse(read(baseMasonryTrimsReceiptPath));
const terrainFiveReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/terrain-five-registration.json';
const terrainFiveReceipt=JSON.parse(read(terrainFiveReceiptPath));
const industrialFiveReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/industrial-five-registration.json';
const industrialFiveReceipt=JSON.parse(read(industrialFiveReceiptPath));
const buildingFiveReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/building-five-registration.json';
const buildingFiveReceipt=JSON.parse(read(buildingFiveReceiptPath));
const crosspackSixReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/crosspack-six-registration.json';
const crosspackSixReceipt=JSON.parse(read(crosspackSixReceiptPath));
const nextEightReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/next-eight-registration.json';
const nextEightReceipt=JSON.parse(read(nextEightReceiptPath));
const stoneTrimsReceiptPath='tools/texture_sheets/sources/official-world-2026-10-17/stone-trims-eight-registration.json';
const stoneTrimsReceipt=JSON.parse(read(stoneTrimsReceiptPath));
const baselineEntries=[...firstReceipt.entries,...migration.entries,...tfReceipt.entries,...rockReceipt.entries,...quietReceipt.entries,...realismReceipt.entries,...characterReceipt.entries,...agedReceipt.entries,...floorStoneStudReceipt.entries,...crosspackStoneReceipt.entries,...concreteFourReceipt.entries,...baseFiveAliasReceipt.entries,...bracedWoodReceipt.entries,...mottledStoneReceipt.entries,...corrodedSteelReceipt.entries,...baseMasonryTrimsReceipt.entries,...terrainFiveReceipt.entries,...industrialFiveReceipt.entries,...buildingFiveReceipt.entries,...crosspackSixReceipt.entries,...nextEightReceipt.entries,...stoneTrimsReceipt.entries];
const receipt={entries:baselineEntries.map(e=>{const correction=agedCorrection.entries.find(c=>c.name===e.name&&c.key===e.key);return correction?{...correction,_correction:true}:e;})};
const indexBytes = read('newer/textures/index.json'), index = JSON.parse(indexBytes);
const names = ['city2_3','city2_5','city2_6','tech10_2','tech04_4','door02_1','ceil1_1','tech08_3','tech08_4','metal5_6','comp1_2','comp1_3','metal1_1','metal1_3','metal1_4','city6_8','city4_2','city4_8','metflor1_3','bricka2_4','brick2_4','TF_Metal4','TF_Metal4b','TF_MetWall4_02','TF_Metal4_04','rock5_2','rock3_8','TF_Metal_02','metal1_2c','TF_Metal4_6a','cable1_1','TF_Wood01','TF_Wood01c','TF_Stone_01','TF_Stone3','TF_Cliff2','TF_Cliff2b','wstone_03_JM','wall14_5','metal7_1','TF_Floor7_01','TF_Floor7_02','wstone_07_JM','met5_1','city6_7','cliff2','stone5_0','TF_Conc_06','TF_Conc4','TF_Conc_08','TF_Conc_07b','wall11_2','city4_5','dung01_3','azfloor1_1','stone1_7','q2_metal1_4','TF_Wood01_2','TF_Wood01c_2','TF_Wood01_4','TF_Wood01c_4','city3_2','city3_4','wstone1_2','TF_Metal3_02','TF_Metal3_03','TF_Metal4_02','TF_Metal4_03','metal8_1','metal9_4','wwall1_1','tech04_8','tech04_7','TF_Brick1_01','TF_Brick3_01','TF_Stone4','TF_Stone_02','TF_Grass1','TF_Grass2','TF_Ground1','TF_Cliff1','TF_Cliff1b','metal5_90_JM','wmet4_25_JM','wmet4_27_JM','TF_Metal4_6d','TF_MetWall2_02','city1_4e','wmet4_4_JM','TF_Wood03_3','TF_Wood01b','TF_Conc_07','rock3_8','city8_2','rock3_2','cop2_5','church1','maya1_9','wmet4_4c','tech04_5','tech04_6','metal5_96_JM','metal5_85_JM','TF_Floor5_04','palmet3_2','TF_Stone_00','br_trim1_1','br_trim1_2','wstone_17_JM','wstone_11_JM','wstone_13_JM','TF_Metal3_04','TF_Stone_03','metal5_83_JM'].sort();
const axes = ['x','y','z'];
const roles = ['diffuse','height','normalX','normalY','normalZ'];
function mapBindings(e) { return [['diffuse',e.binding.file,e.diffuseSha256],['height',e.binding.normal.file,e.heightSha256],...axes.map(axis=>['normal'+axis.toUpperCase(),e.binding.normal.normalChannels[axis],e.normalChannelSha256[axis]])]; }
const check = (value,message) => { if(!value) throw Error(message); };
const same = (actual,expected,message) => check(actual===expected, `${message}: ${actual} != ${expected}`);
const equal = (actual,expected,message) => check(isDeepStrictEqual(actual,expected),message);
const bytesEqual = (actual,expected,message) => check(Buffer.from(actual).equals(Buffer.from(expected)),message);

const officialFixturePath='tests/fixtures/official-textures.json';
const officialFixture=JSON.parse(read(officialFixturePath));
same(officialFixture.schemaVersion,1,'official-only fixture schema');
function currentOfficialEntry(e) {
 const current=officialFixture.entries.find(x=>x.name===e.name&&x.key===e.key);check(current,e.name+' registered official identity');
 for(const field of ['binding','source','sourceFile','sourceFileSha256','diffuseSha256','heightSha256','normalChannelSha256','encodingReceipt'])equal(current[field],e[field],e.name+' unchanged registration '+field);
 return current;
}
function encodingReceipt(e) {
 const current=currentOfficialEntry(e),file=officialFixture.encodingReceipts[e.encodingReceipt];
 same(current.metadataFile,file,e.name+' exact retained metadata locator');check(file.startsWith('assets/authoring/texture_sheets/official-encodings/')&&file.endsWith('.json'),e.name+' authoring metadata only');
 const expected=officialFixture.metadataSha256?.[e.encodingReceipt]??current.metadataSha256;check(typeof expected==='string',e.name+' retained metadata byte witness');same(current.metadataSha256,officialFixture.metadataSha256[e.encodingReceipt],e.name+' consistent retained metadata witnesses');same(sha256(read(file)),expected,e.name+' unchanged selected encoding JSON');
 return JSON.parse(read(file));
}
function webpLossy(bytes,label) {
 same(bytes.toString('ascii',0,4),'RIFF',label+' RIFF'); same(bytes.toString('ascii',8,12),'WEBP',label+' WebP');
 same(bytes.readUInt32LE(4)+8,bytes.length,label+' bounded RIFF length');
 const chunks=[]; let at=12;
 while(at<bytes.length) { check(at+8<=bytes.length,label+' complete chunk header'); const n=bytes.readUInt32LE(at+4); check(at+8+n<=bytes.length,label+' bounded chunk'); chunks.push(bytes.toString('ascii',at,at+4)); at+=8+n+(n%2); }
 check(chunks.includes('VP8 ')&&!chunks.includes('VP8L'),label+' lossy VP8 payload');
}
const games = new Map(), maps = new Map();
function packPath( id ) {
	const game = GAME_CATALOGUE_GAMES.find( g => g.id === ( id === 'id1' ? 'quake' : id ) );
	check( game, 'known game ' + id );
	if ( process.env.QUAKED_GAME_ROOT ) return resolve( sourceRoot, game.folders.find( f => f.startsWith( 'games/' ) ).slice( 6 ), 'pak0.pak' );
	return resolve( root, id === 'shareware' ? 'games/shareware/pak0.pak' : 'resources/' + id + '/pak0.pak' );
}
async function gameFiles( game ) {
	if ( ! games.has( game ) ) games.set( game, ( async () => {
		const paths = [ packPath( 'id1' ), packPath( 'shareware' ) ]; if ( game !== 'id1' ) paths.push( packPath( game ) );
		const members = await memberSearch( paths ), paletteEntry = members.get( 'gfx/palette.lmp' );
		return { members, palette: await readMember( paletteEntry ), palettePack: paletteEntry.path };
	} )() );
	return games.get( game );
}
async function mapTextures( entry ) {
	const id = entry.path + '|' + entry.name;
	if ( ! maps.has( id ) ) maps.set( id, ( async () => {
		const bsp = await readMember( entry );
		check( bsp.length >= 124 && [ 29, 0x32505342, 0x42535032 ].includes( bsp.readInt32LE( 0 ) ), 'supported BSP texture directory' );
		const start = bsp.readInt32LE( 20 ), length = bsp.readInt32LE( 24 ); check( start >= 124 && length >= 4 && start + length <= bsp.length, 'bounded BSP texture lump' );
		const count = bsp.readInt32LE( start ), textures = [];
		check( count >= 0 && count <= 4096 && 4 + count * 4 <= length, 'bounded miptex count' );
		for ( let slot = 0; slot < count; slot ++ ) {
			const offset = bsp.readInt32LE( start + 4 + slot * 4 ); if ( offset === -1 ) continue;
			check( offset >= 4 + count * 4 && offset + 40 <= length, 'bounded miptex header' );
			const at = start + offset, name = bsp.subarray( at, at + 16 ).toString( 'latin1' ).split( '\0' )[ 0 ];
			const width = bsp.readUInt32LE( at + 16 ), height = bsp.readUInt32LE( at + 20 ), mip = bsp.readUInt32LE( at + 24 ); if ( ! mip ) continue;
			check( width && height && width * height <= 16777216 && mip >= 40 && offset + mip + width * height <= length, 'bounded miptex pixels' );
			textures.push( { name, slot, width, height, pixels: bsp.subarray( at + mip, at + mip + width * height ) } );
		}
		return { textures, mapSha256: sha256( bsp ) };
	} )() );
	return maps.get( id );
}
function nativeTexture( raw, palette ) {
	VID_SetPalette( palette ); vid.fullbright = 224;
	const texture = GL_LoadTexture( raw.name, raw.width, raw.height, raw.pixels, true, false, true );
	const rgba = texture.image.data.slice(), fb = texture._fullbright?.image.data;
	if ( fb ) for ( let p = 0; p < rgba.length; p += 4 ) if ( fb[ p + 3 ] ) rgba.set( fb.subarray( p, p + 3 ), p );
	const expected = new Uint8Array( rgba.length );
	for ( let p = 0; p < raw.pixels.length; p ++ ) expected.set( [ ...palette.subarray( raw.pixels[ p ] * 3, raw.pixels[ p ] * 3 + 3 ), 255 ], p * 4 );
	bytesEqual( rgba, expected, raw.name + ' actual GL palette/fullbright reconstruction' );
	return { texture, rgba, key: R_GlassTextureKey( texture ), width: raw.width, height: raw.height };
}
const dispose = t => { t._fullbright?.dispose(); t.dispose(); };
async function nativeSource( entry, use = entry.source.uses[ 0 ] ) {
	const game = await gameFiles( use.game ), map = game.members.get( use.map );
	check( map, 'actual q92 BSP exists in the intended inherited game search' );
	const directory = await mapTextures( map ), raw = directory.textures.find( t => t.slot === use.slot );
	check( raw, 'recorded native slot exists' ); same( raw.name, entry.name, 'actual native texture name' );
	return { ...nativeTexture( raw, game.palette ), source: { game: use.game, actualPack: map.path, map: use.map, slot: use.slot,
		mapSha256: directory.mapSha256, palettePack: game.palettePack, paletteSha256: sha256( game.palette ) } };
}
async function imagesFixture( run ) {
	if ( ! process.env.QUAKED_CANVAS_MODULE ) throw Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
	const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
	const saved = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), classic: mode.R_ClassicPassActive() };
	const controls = [ r_hdr, mode.r_newer_textures ]; for ( const c of controls ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	const values = controls.map( c => c.string ), requests = [], fetches = [];
	globalThis.fetch = async url => { same(String(url),ResourceURL('newer/textures/index.json'),'canonical physical public index request'); fetches.push( ResourceURL(url,true) ); same( ResourceURL(url,true), 'newer/textures/index.json', 'public index fetch' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage { set src( url ) { same(String(url),ResourceURL(ResourceURL(url,true)),'canonical physical runtime image request'); requests.push( ResourceURL(url,true) ); super.src = read( ResourceURL(url,true).split( '?' )[ 0 ] ); } } } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: name => { same( name, 'canvas', 'actual decoding canvas' ); return createCanvas( 1, 1 ); } } } );
	mode.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 );
	const decode = async (file, rootRelative = false) => {
		const image = new NativeImage(), loaded = new Promise( ( resolve, reject ) => { image.onload = resolve; image.onerror = reject; } );
		image.src = read( rootRelative ? file : 'newer/textures/' + file ); await loaded; const canvas = createCanvas( image.width, image.height ), ctx = canvas.getContext( '2d' ); ctx.drawImage( image, 0, 0 );
		return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };
	};
	try { const api = await import( '../src/newer/render/r_newertextures.js?q92-public-' + Math.random() ); await run( { api, requests, fetches, decode } ); }
	finally { globalThis.fetch = saved.fetch; for ( const key of [ 'Image', 'document' ] ) if ( saved[ key ] ) Object.defineProperty( globalThis, key, saved[ key ] ); else delete globalThis[ key ]; controls.forEach( ( c, i ) => vars.Cvar_Set( c.name, values[ i ] ) ); mode.R_AnimSetClassicPass( saved.classic ); }
}
async function terminal( api, name, texture ) {
	const end = Date.now() + 5000; while ( texture.userData.newerPending && Date.now() < end ) await new Promise( r => setTimeout( r, 5 ) );
	check( api.R_NewerTextureSettled( name, texture ) && ! texture.userData.newerPending, name + ' settles actual load' );
}
function diffuseMatches( texture, expected, label ) {
	const glow = texture._fullbright?.image.data;
	if ( ! glow ) bytesEqual( texture.image.data, expected, label );
	else for ( let i = 0; i < expected.length; i += 4 ) for ( let c = 0; c < 3; c ++ ) same( texture.image.data[ i + c ] + glow[ i + c ], expected[ i + c ], label + ' fullbright conservation' );
}


Deno.test('114 official q92 bindings retain exact original identities, 4x data and selected map bytes', async () => {
 same(receipt.entries.length,114,'all current generated native bindings');same(new Set(receipt.entries.map(e=>e.encodingReceipt)).size,111,'all current generated artworks');equal(receipt.entries.map(e=>e.name).sort(),names,'exact registered families');
 equal(officialFixture.entries.map(e=>e.name+'|'+e.key).sort(),receipt.entries.map(e=>e.name+'|'+e.key).sort(),'fixture accounts for every source-specific registration');
 same(Object.keys(officialFixture.encodingReceipts).length,111,'only selected encoding metadata retained');const sources=[];
 equal(Object.keys(agedReceipt.protectedOwnerBindings).sort(),['cop1_1','ecop1_1','metal5_1'],'exact protected owner artwork names');for(const[name,sections]of Object.entries(agedReceipt.protectedOwnerBindings))for(const field of ['textures','normals','sources','ordinaryVariants','glass'])equal(index[field]?.[name]??null,sections[field],name+' preserves distinct owner '+field+' despite shared original pixels');same(new Set(Object.values(agedReceipt.protectedOwnerBindings).map(row=>row.textures)).size,3,'all three distinct owner pictures remain separate');
 for(const e of receipt.entries) {
  const current=currentOfficialEntry(e),enc=encodingReceipt(e),native=[e.source.width,e.source.height];
  if(e.route==='textures'){equal({file:index.textures[e.name],normal:index.normals[e.name]},e.binding,e.name+' exact base-route binding');equal(index.sources[e.name],[e.key],e.name+' exact base source guard');same(index.ordinaryVariants?.[e.name]?.[e.key],undefined,e.name+' no route shadow');}
  else {equal(index.ordinaryVariants?.[e.name]?.[e.key],e.binding,e.name+' exact source-key official binding');if(!e.previous)for(const field of ['textures','sources','normals'])same(index[field]?.[e.name],undefined,e.name+' no unguarded base binding '+field);}
  same(index.glass?.[e.name],undefined,e.name+' no glass selector');
  equal([enc.factor,enc.quality,enc.lossless,enc.normalLayout],[4,92,false,'channels'],e.name+' selected 4x/lossy92/XYZ contract');same(enc.profile.strength,e.binding.normal.strength,e.name+' exact reviewed strength');same(enc.profile.cap,e.binding.normal.cap,e.name+' exact reviewed cap');same(e.binding.normal.normalFile,undefined,e.name+' independent XYZ route');
  check([undefined,'directed-vertical-pair','layered-veneer'].includes(enc.normalRecipe),e.name+' known reviewed normal recipe');
  same(enc.original,e.sourceFile,e.name+' native original metadata');same(enc.originalSha256,e.sourceFileSha256,e.name+' native original witness');same(sha256(read(e.sourceFile)),e.sourceFileSha256,e.name+' original native PNG bytes');
  same(enc.comparisonDivisor,2,e.name+' half-native comparison');equal(enc.comparisonDimensions,native.map(n=>n/2),e.name+' shared half-native dimensions');equal(enc.secondaryComparisonDimensions,native.map(n=>n/4),e.name+' shared quarter-native dimensions');
  for(const [role,file,digest]of mapBindings(e)){
   check(file.startsWith('official/')&&!file.includes('candidates'),e.name+' selected official '+role);const output=enc.outputs[role];same(output.sha256,digest,e.name+' immutable selected '+role+' SHA');equal(output.dimensions,native.map(n=>n*4),e.name+' exact4x '+role);equal([output.quality,output.lossless],[92,false],e.name+' lossy92 '+role);const data=read('newer/textures/'+file);same(sha256(data),digest,e.name+' actual official '+role+' bytes');webpLossy(data,e.name+' official '+role);
  }
  const aliases=Object.entries(officialFixture.trials).filter(([alias,t])=>(t.name??alias)===e.name&&t.nativeKey===e.key);check(aliases.length>0,e.name+' current original/official comparison alias');
  for(const[alias,t]of aliases){same(t.original,e.sourceFile,alias+' actual native reference');same(t.originalSha256,e.sourceFileSha256,alias+' actual native SHA');same(t.file,e.binding.file,alias+' current official diffuse');same(t.height,e.binding.normal.file,alias+' current official height');equal(t.normalChannels,e.binding.normal.normalChannels,alias+' current official XYZ');equal([t.width,t.heightPixels],native.map(n=>n*4),alias+' actual4x dimensions');same(t.diffuseSha256,e.diffuseSha256,alias+' official diffuse SHA');same(t.heightSha256,e.heightSha256,alias+' official height SHA');equal(t.normalChannelSha256,e.normalChannelSha256,alias+' official XYZ SHA');}
  for(const use of e.source.uses){const actual=await nativeSource(e,use);try{same(actual.key,e.key,e.name+' actual source key');same(sha256(actual.rgba),e.source.pixelSha256,e.name+' actual PAK native pixels');sources.push({name:e.name,key:e.key,...actual.source,pixelSha256:sha256(actual.rgba)});}finally{dispose(actual.texture);}}
 }
 const result={qualification:'Current original PAK to accepted official texture public verification; no deleted-master replay or new visual acceptance claim',indexSha256:sha256(indexBytes),fixtureSha256:sha256(read(officialFixturePath)),bindings:receipt.entries.length,artworks:111,occurrences:sources.length,sources};
 if(process.env.QUAKED_Q92_TEXTURE_RECEIPT)writeFileSync(process.env.QUAKED_Q92_TEXTURE_RECEIPT,JSON.stringify(result,null,2)+'\n');console.log('Q92_NATIVE_SOURCES '+JSON.stringify({bindings:result.bindings,occurrences:result.occurrences,indexSha256:result.indexSha256}));
});

// Independent signed stencil from the ACCEPTED decoded height, without craft_normals
// or the retired authoring masters. This verifies the actual height/XYZ contract.
Deno.test('all111 official decoded heights independently reproduce signed XYZ and lossy92 channels', () => imagesFixture(async f => {
 const temp=mkdtempSync(join(tmpdir(),'quaked-official-height-math-')),visited=new Set(),results=[];
 const encode="from PIL import Image; import sys\nw,h=int(sys.argv[1]),int(sys.argv[2])\nfor p in sys.argv[3:]: Image.frombytes('L',(w,h),open(p,'rb').read()).save(p+'.webp','WEBP',quality=92,lossless=False,method=6)";
 const quantize=n=>{const v=Math.min(1,Math.max(0,n*.5+.5))*255,lo=Math.floor(v);return v-lo===.5?(lo%2?lo+1:lo):Math.round(v);};
 try{for(const e of receipt.entries){
  if(visited.has(e.encodingReceipt))continue;visited.add(e.encodingReceipt);const enc=encodingReceipt(e),height=await f.decode(e.binding.normal.file),w=height.width,h=height.height;
  let partner=null;if(enc.normalRecipe==='directed-vertical-pair'){const other=corrodedSteelReceipt.entries.find(p=>p.name===enc.verticalNeighbour.name);check(other,e.name+' registered directed partner');partner=await f.decode(other.binding.normal.file);equal([partner.width,partner.height],[w,h],e.name+' same directed tile size');same(sha256(read('newer/textures/'+other.binding.normal.file)),enc.verticalNeighbour.heightSha256,e.name+' exact accepted partner height');}
  const scalar=(x,y)=>{x=(x+w)%w;if(y<0)return(partner??height).data[((h-1)*w+x)*4]/255;if(y>=h)return(partner??height).data[x*4]/255;return height.data[(y*w+x)*4]/255;};
  const slope=enc.profile.strength*Math.sqrt(w*h)/8,channels=axes.map(()=>new Uint8Array(w*h));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const gx=(3*(scalar(x+1,y)-scalar(x-1,y))+(scalar(x+1,y-1)+scalar(x+1,y+1)-scalar(x-1,y-1)-scalar(x-1,y+1)))/20;
   const gy=(3*(scalar(x,y+1)-scalar(x,y-1))+(scalar(x-1,y+1)+scalar(x+1,y+1)-scalar(x-1,y-1)-scalar(x+1,y-1)))/20;
   let sx=-gx*slope,sy=-gy*slope;const magnitude=Math.sqrt(sx*sx+sy*sy),cap=1/Math.sqrt(1+(magnitude/enc.profile.cap)**2);sx*=cap;sy*=cap;const length=Math.sqrt(sx*sx+sy*sy+1);
   channels[0][y*w+x]=quantize(sx/length);channels[1][y*w+x]=quantize(sy/length);channels[2][y*w+x]=quantize(1/length);
  }
  const paths=axes.map((axis,c)=>{const p=join(temp,e.name+'-'+e.key.replace(/[^A-Za-z0-9]/g,'_')+'-'+axis+'.gray');writeFileSync(p,channels[c]);return p;});execFileSync('/usr/bin/python3',['-c',encode,String(w),String(h),...paths],{stdio:'pipe'});
  for(let c=0;c<3;c++)bytesEqual(readFileSync(paths[c]+'.webp'),read('newer/textures/'+e.binding.normal.normalChannels[axes[c]]),e.name+' independent accepted-height '+axes[c]+' Q92 encoded bytes');
  results.push({name:e.name,key:e.key,width:w,height:h,strength:enc.profile.strength,cap:enc.profile.cap,normalRecipe:enc.normalRecipe??'self-wrap'});
 }}finally{rmSync(temp,{recursive:true,force:true});}same(visited.size,111,'all accepted artworks independently verified');
 if(process.env.QUAKED_Q92_NORMAL_MATH_RECEIPT)writeFileSync(process.env.QUAKED_Q92_NORMAL_MATH_RECEIPT,JSON.stringify({qualification:'Independent accepted official heightR to signedXYZ/quality92 byte reproduction, not authoring regeneration',indexSha256:sha256(indexBytes),artworks:results.length,results},null,2)+'\n');
}));

Deno.test('real q92 images install with original UVs and decoded grayscale XYZ plus decoded height R reaches R_NormalMapFor', () => imagesFixture(async f => {
 const installed=[],originals=new Map();
 try { await f.api.R_NewerTexturesPrefetch([]);
 for(const e of receipt.entries) {
  const actual=await nativeSource(e),texture=actual.texture; installed.push(texture); originals.set(texture,texture.image); texture.offset.set(.125,.25);texture.repeat.set(2,3);
  f.api.R_NewerTextureUpgrade(e.name,texture); await terminal(f.api,e.name,texture); same(texture.userData.newerPicture,true,e.name+' upgrade succeeded');
  const hd=await f.decode(e.binding.file),height=await f.decode(e.binding.normal.file),normal=await Promise.all(axes.map(axis=>f.decode(e.binding.normal.normalChannels[axis]))), originalPNG=await f.decode(e.sourceFile,true); bytesEqual(originalPNG.data,actual.rgba,e.name+' source PNG depicts actual PAK pixels');
  for(const img of [hd,height,...normal]) {same(img.width,actual.width*4,e.name+' exact4x width');same(img.height,actual.height*4,e.name+' exact4x height');}
  diffuseMatches(texture,hd.data,e.name+' decoded lossy diffuse');
  const bound=texture.userData.newerHeight; same(bound.file,e.binding.normal.file,e.name+' height recipe');same(bound.authoredNormal.file,'channels:'+axes.map(axis=>e.binding.normal.normalChannels[axis]).join('|'),e.name+' authored normal recipe');
  const lighting=R_NormalMapFor(texture);check(lighting,e.name+' public normal result');same(lighting.image.width,actual.width*4,e.name+' lighting width');same(lighting.image.height,actual.height*4,e.name+' lighting height');same(lighting.colorSpace,THREE.NoColorSpace,e.name+' normal data colour space');same(lighting.userData.glassGloss,undefined,e.name+' no unintended gloss');
  for(let p=0;p<hd.width*hd.height;p++) {
   same(bound.data[p],Math.fround(height.data[p*4]/255),e.name+' decoded height R');
   for(let c=0;c<3;c++) same(lighting.image.data[p*4+c],normal[c].data[p*4],e.name+' decoded grayscale channel R reaches lighting XYZ');
   same(lighting.image.data[p*4+3],height.data[p*4],e.name+' decoded height R reaches lighting alpha');
  }
  if(stoneTrimsReceipt.entries.some(s=>s.name===e.name)&&e.name.startsWith('br_trim')){
   let facingMinimum=255,insetMaximum=0;for(let y=0;y<height.height;y++)for(let x=0;x<height.width;x++){const course=Math.floor(y/32),jamb=course%2?64:32,value=height.data[(y*height.width+x)*4];if(x>=jamb&&x<height.width-jamb)insetMaximum=Math.max(insetMaximum,value);else facingMinimum=Math.min(facingMinimum,value);}
   check(facingMinimum>insetMaximum,e.name+' actual decoded runtime R keeps every plain-facing plane above all inset texels');const count=f.requests.length;f.api.R_NewerTextureUpgrade(e.name,texture);await terminal(f.api,e.name,texture);same(f.requests.length,count,e.name+' repeated upgrade uses cached maps');
  }
  for(const [,file] of mapBindings(e)) check(f.requests.includes('newer/textures/'+file+'?v='+index.version),e.name+' versioned runtime image request');
  equal(texture.offset.toArray(),[.125,.25],e.name+' offsets unchanged');equal(texture.repeat.toArray(),[2,3],e.name+' UV periods unchanged');same(texture.wrapS,THREE.RepeatWrapping,e.name+' repeat S');same(texture.wrapT,THREE.RepeatWrapping,e.name+' repeat T');
  equal(lighting.offset.toArray(),texture.offset.toArray(),e.name+' relief offset aligned');same(R_GlassTextureKey(texture),e.key,e.name+' native identity retained');bytesEqual(f.api.R_ClassicTexture(texture).image.data,originals.get(texture).data,e.name+' exact native Classic pixels');
 }
 same(f.requests.length,new Set(receipt.entries.flatMap(e=>mapBindings(e).map(([,file])=>file))).size,'five actual maps per artwork; aliases share requests');f.api.R_NewerTexturesRevert();
 for(const [texture,original] of originals) {same(texture.image,original,'Classic restores native image');same(texture.userData.newerHeight,undefined,'Classic removes replacement relief');}
 } finally {for(const texture of installed)dispose(texture);}
}));

Deno.test('unknown registered native pixels are rejected and Classic requests no replacements', () => imagesFixture(async f => {
 for(const e of receipt.entries) {
  const actual=await nativeSource(e),pixels=actual.rgba.slice(); pixels[0]^=1;const unknown=new THREE.DataTexture(pixels,actual.width,actual.height),image=unknown.image;
  try {check(R_GlassTextureKey(unknown)!==e.key,e.name+' negative identity');f.api.R_NewerTextureUpgrade(e.name,unknown);await terminal(f.api,e.name,unknown);same(unknown.userData.newerFallback,true,e.name+' unknown fallback');same(unknown.image,image,e.name+' unknown preserved');same(f.requests.length,0,e.name+' no unknown artwork');
   mode.R_AnimSetClassicPass(true);f.api.R_NewerTextureUpgrade(e.name,actual.texture);await Promise.resolve();same(actual.texture.userData.newerPicture,undefined,e.name+' Classic preserved');same(f.requests.length,0,e.name+' no Classic artwork');
  } finally {mode.R_AnimSetClassicPass(false);dispose(unknown);dispose(actual.texture);}
 }
}));


Deno.test('registered material names preserve exact case and reject same pixels under a differently cased name', () => imagesFixture(async f => {
 equal(tfReceipt.entries.map(e=>e.name).sort(),['TF_Metal4','TF_Metal4b','TF_MetWall4_02','TF_Metal4_04'].sort(),'exact installed TF family');
 for(const e of [...tfReceipt.entries,...quietReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...realismReceipt.entries,...characterReceipt.entries,...floorStoneStudReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...concreteFourReceipt.entries,...bracedWoodReceipt.entries,...corrodedSteelReceipt.entries,...baseMasonryTrimsReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...terrainFiveReceipt.entries,...industrialFiveReceipt.entries,...buildingFiveReceipt.entries,...crosspackSixReceipt.entries,...nextEightReceipt.entries,...stoneTrimsReceipt.entries]) {
  const actual=await nativeSource(e), original=actual.texture.image;
  try {
   const lower=e.name.toLowerCase(),wrong=e.name===lower?e.name.toUpperCase():lower;check(wrong!==e.name,e.name+' meaningful casing negative');
   for(const field of ['textures','normals','sources','ordinaryVariants','glass'])same(index[field]?.[wrong],undefined,wrong+' no accidental lowercase binding');
   f.api.R_NewerTextureUpgrade(wrong,actual.texture);await terminal(f.api,wrong,actual.texture);
   same(actual.texture.userData.newerFallback,true,e.name+' mismatched case falls back');same(actual.texture.image,original,e.name+' native image retained for wrong case');same(actual.texture.userData.newerHeight,undefined,e.name+' no mismatched case relief');same(f.requests.length,0,e.name+' no artwork request for wrong case');
  } finally {dispose(actual.texture);}
 }
}));


// Independent direct-coordinate stencil: no craft_normals helper or its area scaling.
// The partner supplies the two halo rows; scalar/XYZ bytes are the actual published Q92 maps.
Deno.test('directed steel relief uses the real partner height at both vertical boundaries and retains per-tile slopes', () => imagesFixture(async f => {
 const temp=mkdtempSync(join(tmpdir(),'quaked-directed-normal-independent-')), results=[];
 try {for(const e of corrodedSteelReceipt.entries){
  const enc=encodingReceipt(e);same(enc.normalRecipe,'directed-vertical-pair',e.name+' explicit directed recipe');
  const neighbour=enc.verticalNeighbour, partner=corrodedSteelReceipt.entries.find(p=>p.name===neighbour.name);check(partner,e.name+' registered partner');
  const partnerEnc=encodingReceipt(partner);same(partnerEnc.verticalNeighbour.name,e.name,e.name+' reciprocal partner');
  same(neighbour.authoringDiffuse,partnerEnc.authoringDiffuse,e.name+' retained historical partner metadata');same(neighbour.authoringDiffuseSha256,partnerEnc.authoringDiffuseSha256,e.name+' retained partner metadata hash');
  same(neighbour.diffuseSha256,partner.diffuseSha256,e.name+' actual partner colour SHA');same(neighbour.heightSha256,partner.heightSha256,e.name+' actual partner height SHA');
  equal(neighbour.profile,enc.profile,e.name+' pair shares material recipe');
  const height=await f.decode(e.binding.normal.file),other=await f.decode(partner.binding.normal.file),w=height.width,h=height.height;
  equal([w,h],[512,512],e.name+' per-tile dimensions');equal([other.width,other.height],[w,h],e.name+' partner dimensions');
  same(neighbour.tileDetailScale,Math.sqrt(w*h)/256,e.name+' tile feature scale');
  const slope=enc.profile.strength*Math.sqrt(w*h)/8;same(neighbour.normalSlopeScale,slope,e.name+' per-tile slope factor');
  const scalar=(x,y,paired)=>{x=(x+w)%w;if(y<0)return(paired?other.data:height.data)[((h-1)*w+x)*4]/255;if(y>=h)return(paired?other.data:height.data)[x*4]/255;return height.data[(y*w+x)*4]/255;};
  const normal=(x,y,paired)=>{
   const at=(dx,dy)=>scalar(x+dx,y+dy,paired);
   const gx=(3*(at(1,0)-at(-1,0))+(at(1,-1)+at(1,1)-at(-1,-1)-at(-1,1)))/20;
   const gy=(3*(at(0,1)-at(0,-1))+(at(-1,1)+at(1,1)-at(-1,-1)-at(1,-1)))/20;
   let sx=-gx*slope,sy=-gy*slope;const magnitude=Math.sqrt(sx*sx+sy*sy),cap=1/Math.sqrt(1+(magnitude/enc.profile.cap)**2);sx*=cap;sy*=cap;
   const length=Math.sqrt(sx*sx+sy*sy+1);return[sx/length,sy/length,1/length];
  };
  const channels=axes.map(()=>new Uint8Array(w*h));let changedBoundaryPixels=0,maximumBoundaryDelta=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const actual=normal(x,y,true),self=normal(x,y,false),delta=Math.max(...actual.map((n,c)=>Math.abs(n-self[c])));
   if(y>0&&y<h-1)same(delta,0,e.name+' interior gradient remains exactly per-tile');else{if(delta>1e-12)changedBoundaryPixels++;maximumBoundaryDelta=Math.max(maximumBoundaryDelta,delta);}
   for(let c=0;c<3;c++)channels[c][y*w+x]=Math.round(Math.min(1,Math.max(0,actual[c]*.5+.5))*255);
  }
  check(changedBoundaryPixels>0,e.name+' partner halo changes wrong self-wrap normals');
  for(let c=0;c<3;c++){
   const raw=join(temp,e.name+'-'+axes[c]+'.gray'),encoded=raw+'.webp';writeFileSync(raw,channels[c]);
   execFileSync('/usr/bin/python3',['-c',"from PIL import Image; import sys; Image.frombytes('L',(int(sys.argv[3]),int(sys.argv[4])),open(sys.argv[1],'rb').read()).save(sys.argv[2],'WEBP',quality=92,lossless=False,method=6)",raw,encoded,String(w),String(h)],{stdio:'pipe'});
   bytesEqual(readFileSync(encoded),read('newer/textures/'+e.binding.normal.normalChannels[axes[c]]),e.name+' independent mathematical '+axes[c]+' channel encoded bytes');
  }
  results.push({name:e.name,partner:partner.name,width:w,height:h,slope,changedBoundaryPixels,maximumBoundaryDelta});
 }}finally{rmSync(temp,{recursive:true,force:true});}
 if(process.env.QUAKED_Q92_DIRECTED_RECEIPT)writeFileSync(process.env.QUAKED_Q92_DIRECTED_RECEIPT,JSON.stringify({qualification:'Independent direct-coordinate partner-halo normal maths and byte-exact Q92 outputs; art/gameplay acceptance separate',indexSha256:sha256(indexBytes),results},null,2)+'\n');
}));


Deno.test('both explicitly qualified real rock3_8 identities use their own maps across all PAK occurrences while unknown, case and Classic controls remain native', () => imagesFixture(async f => {
 const history=JSON.parse(read('tools/texture_sheets/sources/official-world-2026-10-17/verification/crosspack6-held-rock-successor-history.json'));
 same(sha256(read(history.historicalBodyFile)),history.historicalBodySha256,'retained historical held-rock negative body');
 same(history.historicalBodySha256,'7a0ebf44edce31b44d0c72108451d1cdbf73c106eacc1cd8d323d0fd5f5743fd','immutable historical negative witness');
 const held=JSON.parse(read('tools/texture_sheets/sources/official-world-2026-10-12/native-rock3_8.json'));
 const accepted=rockReceipt.entries.find(e=>e.name==='rock3_8'),successor=crosspackSixReceipt.entries.find(e=>e.name==='rock3_8');
 same(accepted.key,'64x64:5b26cfca296c1fa8','original approved rock identity');same(successor.key,'64x64:57663646989d1874','explicitly qualified sibling identity');
 const sourceWithoutUses=({uses,...metadata})=>metadata;equal(sourceWithoutUses(successor.source),sourceWithoutUses(held.source),'successor preserves exact retained real-source metadata');same(successor.source.uses.length,held.source.uses.length,'retained source occurrence count');for(let i=0;i<held.source.uses.length;i++){const {pack:oldPack,...oldUse}=held.source.uses[i],{pack:currentPack,...currentUse}=successor.source.uses[i];equal(currentUse,oldUse,'every non-path recorded occurrence field retained');same(realpathSync(currentPack),realpathSync(oldPack),'specific existing historical and canonical-view PAK aliases resolve identically');}
 for(const field of ['textures','sources','normals'])same(index[field]?.rock3_8,undefined,'no base-route guard widening '+field);
 same(index.glass?.rock3_8,undefined,'no glass-route widening');
 for(const e of [accepted,successor])equal(index.ordinaryVariants.rock3_8[e.key],e.binding,'own key retains own exact maps');
 check(accepted.binding.file!==successor.binding.file,'distinct original colours have distinct photographic outputs');
 const nativePNG='tools/texture_sheets/sources/official-world-2026-10-12/native-rock3_8.png';same(sha256(read(nativePNG)),held.referenceSha256,'retained sibling PNG digest');
 const heldPNG=await f.decode(nativePNG,true),base=await nativeSource(accepted),sibling=await nativeSource(successor);
 try {bytesEqual(heldPNG.data,sibling.rgba,'retained PNG depicts actual sibling PAK pixels');let changed=0;for(let i=0;i<sibling.rgba.length;i+=4)if([0,1,2].some(c=>sibling.rgba[i+c]!==base.rgba[i+c]))changed++;same(changed,378,'retained real 378-pixel sibling distinction');}finally{dispose(base.texture);dispose(sibling.texture);}
 let occurrences=0;
 for(const e of [accepted,successor])for(const use of e.source.uses){
  const actual=await nativeSource(e,use),texture=actual.texture,original=texture.image;
  try {same(actual.key,e.key,'real PAK identity '+use.game+'/'+use.map);same(sha256(actual.rgba),e.source.pixelSha256,'real PAK pixel digest');
   texture.offset.set(.375,.625);texture.repeat.set(3,2);f.api.R_NewerTextureUpgrade(e.name,texture);await terminal(f.api,e.name,texture);
   same(texture.userData.newerPicture,true,'each known sibling installs its own photograph');const diffuse=await f.decode(e.binding.file),height=await f.decode(e.binding.normal.file);
   diffuseMatches(texture,diffuse.data,'own decoded sibling diffuse');const bound=texture.userData.newerHeight;same(bound.file,e.binding.normal.file,'own sibling height file');
   same(bound.authoredNormal.file,'channels:'+axes.map(a=>e.binding.normal.normalChannels[a]).join('|'),'own sibling authored XYZ files');
   for(let i=0;i<height.width*height.height;i++)same(bound.data[i],Math.fround(height.data[i*4]/255),'own decoded height R');
   check(R_NormalMapFor(texture),'public lighting normal exists');equal(texture.offset.toArray(),[.375,.625],'original rock offset');equal(texture.repeat.toArray(),[3,2],'original rock UV period');
   bytesEqual(f.api.R_ClassicTexture(texture).image.data,original.data,'native Classic pixels preserved');occurrences++;
   f.api.R_NewerTexturesRevert();same(texture.image,original,'revert restores own native sibling');same(texture.userData.newerHeight,undefined,'revert removes relief');
  }finally{dispose(texture);}
 }
 same(accepted.source.uses.length,8,'all original approved uses');same(successor.source.uses.length,5,'all newly qualified sibling uses');same(occurrences,13,'both identities all recorded PAK occurrences');
 for(const e of [accepted,successor]){
  const actual=await nativeSource(e),pixels=actual.rgba.slice();pixels[0]^=1;const mutant=new THREE.DataTexture(pixels,actual.width,actual.height),mutantImage=mutant.image,original=actual.texture.image,beforeRequests=f.requests.length;
  try {check(![accepted.key,successor.key].includes(R_GlassTextureKey(mutant)),'unknown differs from both known keys');
   f.api.R_NewerTextureUpgrade('rock3_8',mutant);await terminal(f.api,'rock3_8',mutant);same(mutant.userData.newerFallback,true,'unknown rock rejected');same(mutant.image,mutantImage,'unknown native image preserved');same(mutant.userData.newerHeight,undefined,'unknown gets no relief');
   f.api.R_NewerTextureUpgrade('ROCK3_8',actual.texture);await terminal(f.api,'ROCK3_8',actual.texture);same(actual.texture.userData.newerFallback,true,'wrong case rejects both known identities');same(actual.texture.image,original,'wrong case remains native');same(actual.texture.userData.newerHeight,undefined,'wrong case gets no relief');same(f.requests.length,beforeRequests,'unknown and wrong case request no art');
  }finally{dispose(mutant);dispose(actual.texture);}
  const classic=await nativeSource(e),classicImage=classic.texture.image,beforeClassic=f.requests.length;
  try{mode.R_AnimSetClassicPass(true);f.api.R_NewerTextureUpgrade(e.name,classic.texture);await Promise.resolve();same(classic.texture.image,classicImage,'Classic remains native for both keys');same(classic.texture.userData.newerPicture,undefined,'Classic does not install replacement');same(classic.texture.userData.newerHeight,undefined,'Classic no relief');same(f.requests.length,beforeClassic,'Classic requests no rock art');}finally{mode.R_AnimSetClassicPass(false);dispose(classic.texture);}
 }
}));
