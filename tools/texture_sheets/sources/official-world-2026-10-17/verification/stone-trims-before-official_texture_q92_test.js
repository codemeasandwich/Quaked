// Independent public-interface verification of the quality92 channel-normal world families.
// Reads real PAK/BSP inputs, decodes real lossy WebPs and uses renderer endpoints.
// Passing these checks is not visual acceptance or GPU gameplay verification.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, mkdirSync } from 'node:fs';
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
const baselineEntries=[...firstReceipt.entries,...migration.entries,...tfReceipt.entries,...rockReceipt.entries,...quietReceipt.entries,...realismReceipt.entries,...characterReceipt.entries,...agedReceipt.entries,...floorStoneStudReceipt.entries,...crosspackStoneReceipt.entries,...concreteFourReceipt.entries,...baseFiveAliasReceipt.entries,...bracedWoodReceipt.entries,...mottledStoneReceipt.entries,...corrodedSteelReceipt.entries,...baseMasonryTrimsReceipt.entries,...terrainFiveReceipt.entries,...industrialFiveReceipt.entries,...buildingFiveReceipt.entries,...crosspackSixReceipt.entries,...nextEightReceipt.entries];
const receipt={entries:baselineEntries.map(e=>{const correction=agedCorrection.entries.find(c=>c.name===e.name&&c.key===e.key);return correction?{...correction,_correction:true}:e;})};
const indexBytes = read('newer/textures/index.json'), index = JSON.parse(indexBytes);
const names = ['city2_3','city2_5','city2_6','tech10_2','tech04_4','door02_1','ceil1_1','tech08_3','tech08_4','metal5_6','comp1_2','comp1_3','metal1_1','metal1_3','metal1_4','city6_8','city4_2','city4_8','metflor1_3','bricka2_4','brick2_4','TF_Metal4','TF_Metal4b','TF_MetWall4_02','TF_Metal4_04','rock5_2','rock3_8','TF_Metal_02','metal1_2c','TF_Metal4_6a','cable1_1','TF_Wood01','TF_Wood01c','TF_Stone_01','TF_Stone3','TF_Cliff2','TF_Cliff2b','wstone_03_JM','wall14_5','metal7_1','TF_Floor7_01','TF_Floor7_02','wstone_07_JM','met5_1','city6_7','cliff2','stone5_0','TF_Conc_06','TF_Conc4','TF_Conc_08','TF_Conc_07b','wall11_2','city4_5','dung01_3','azfloor1_1','stone1_7','q2_metal1_4','TF_Wood01_2','TF_Wood01c_2','TF_Wood01_4','TF_Wood01c_4','city3_2','city3_4','wstone1_2','TF_Metal3_02','TF_Metal3_03','TF_Metal4_02','TF_Metal4_03','metal8_1','metal9_4','wwall1_1','tech04_8','tech04_7','TF_Brick1_01','TF_Brick3_01','TF_Stone4','TF_Stone_02','TF_Grass1','TF_Grass2','TF_Ground1','TF_Cliff1','TF_Cliff1b','metal5_90_JM','wmet4_25_JM','wmet4_27_JM','TF_Metal4_6d','TF_MetWall2_02','city1_4e','wmet4_4_JM','TF_Wood03_3','TF_Wood01b','TF_Conc_07','rock3_8','city8_2','rock3_2','cop2_5','church1','maya1_9','wmet4_4c','tech04_5','tech04_6','metal5_96_JM','metal5_85_JM','TF_Floor5_04','palmet3_2','TF_Stone_00'].sort();
const historicalCity = JSON.parse(read('tools/texture_sheets/sources/official-world-2026-10-12/city2-registration.json'));
const axes = ['x','y','z'];
const roles = ['diffuse','height','normalX','normalY','normalZ'];
function mapBindings(e) { return [['diffuse',e.binding.file,e.diffuseSha256],['height',e.binding.normal.file,e.heightSha256],...axes.map(axis=>['normal'+axis.toUpperCase(),e.binding.normal.normalChannels[axis],e.normalChannelSha256[axis]])]; }
const check = (value,message) => { if(!value) throw Error(message); };
const same = (actual,expected,message) => check(actual===expected, `${message}: ${actual} != ${expected}`);
const equal = (actual,expected,message) => check(isDeepStrictEqual(actual,expected),message);
const bytesEqual = (actual,expected,message) => check(Buffer.from(actual).equals(Buffer.from(expected)),message);
function encodingReceipt(e) { return JSON.parse(read(e.encodingReceipt)); }
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
	globalThis.fetch = async url => { fetches.push( String( url ) ); same( String( url ), 'newer/textures/index.json', 'public index fetch' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage { set src( url ) { requests.push( String( url ) ); super.src = read( String( url ).split( '?' )[ 0 ] ); } } } );
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


Deno.test('106 q92 channel bindings pin exact original identities and real lossy colour/height/normal companions', async () => {
 const eightKeys={wmet4_4c:'128x128:74f63e8543362707',tech04_5:'128x16:7ef518b5473c8877',tech04_6:'128x16:bfef16117d029feb',metal5_96_JM:'128x128:85891f197f5d7a63',metal5_85_JM:'128x128:d2be32b11d4f815b',TF_Floor5_04:'128x128:ad3943d092d6c6c2',palmet3_2:'128x128:7bdc8195074b0fc7',TF_Stone_00:'128x128:42d2beee14cc60c4'};
 equal(nextEightReceipt.entries.map(e=>e.name).sort(),Object.keys(eightKeys).sort(),'exact eight reviewed native identities');
 const eightBase='tools/texture_sheets/sources/official-world-2026-10-17/',artReviewPath=eightBase+'verification/next-eight-independent-art-review.json',artReview=JSON.parse(read(artReviewPath));same(sha256(read(artReviewPath)),'97b9860a8c1aae3af8cd44fbda73fe827d2788667a600f7848e095f29dc126c2','immutable independent review');same(artReview.overallResult,'PASS','explicit art approval');same(artReview.materials,8,'eight reviewed materials');same(artReview.mapHashes,40,'forty reviewed maps');equal(artReview.holds,[],'no held material silently installed');
 const oldEightTrial=JSON.parse(read(nextEightReceipt.beforeTrialFile)),newEightTrial=JSON.parse(read('newer/textures/candidates-2026-10-12/trial.json'));same(sha256(read(nextEightReceipt.beforeTrialFile)),nextEightReceipt.beforeTrialSha256,'exact eight preview predecessor');for(const[name,spec]of Object.entries(oldEightTrial))equal(newEightTrial[name],spec,'prior complete preview preserved '+name);const addedEight=Object.keys(newEightTrial).filter(n=>!Object.hasOwn(oldEightTrial,n)).sort();if(index.version===2026101810)equal(addedEight,Object.keys(eightKeys).sort(),'only eight new previews at installed version');else for(const name of Object.keys(eightKeys))check(addedEight.includes(name),'later catalogue retains preview '+name);
 for(const e of nextEightReceipt.entries){
  const trim=['tech04_5','tech04_6'].includes(e.name),native=[128,trim?16:128],enc=encodingReceipt(e);same(e.key,eightKeys[e.name],e.name+' exact audited key');equal([e.source.width,e.source.height],native,e.name+' native aspect');for(const role of roles)equal(enc.outputs[role].dimensions,native.map(n=>n*4),e.name+' exact4x '+role);equal(enc.comparisonDimensions,native.map(n=>n/2),e.name+' half-native view');equal(enc.secondaryComparisonDimensions,native.map(n=>n/4),e.name+' quarter-native view');same(enc.profile.strength,['wmet4_4c','metal5_85_JM','palmet3_2'].includes(e.name)?.06:.2,e.name+' reviewed relief strength');same(enc.profile.cap,.5,e.name+' reviewed cap');
  const reviewed=artReview.results.find(r=>r.name===e.name);check(reviewed,e.name+' own independent review');same(reviewed.nativeKey,e.key,e.name+' reviewed native key');for(const[role,,digest]of mapBindings(e))same(reviewed.mapHashes[role],digest,e.name+' reviewed current '+role);
  const fittingPath='newer/textures/candidates-2026-10-17/'+e.name+'-photographic-v1-4x.json',seamPath=enc.authoringDiffuse.replace(/\.png$/,'.json'),fit=JSON.parse(read(fittingPath)),seam=JSON.parse(read(seamPath));same(fit.method,'photographic',e.name+' source photographic fit');same(fit.original,e.sourceFile,e.name+' source-specific original');for(const[path,digest]of[[fit.original,fit.originalSha256],[fit.generated,fit.generatedSha256],[fit.output,fit.outputSha256]])same(sha256(read(path)),digest,e.name+' photo-chain custody '+path);same(fit.toolSha256,sha256(read('tools/texture_sheets/finish_official_texture.py')),e.name+' maintained source fitter');same(seam.source,fit.output,e.name+' seam input from recorded fit');same(seam.sourceSha256,fit.outputSha256,e.name+' fitted photo digest');same(seam.output,enc.authoringDiffuse,e.name+' final seam master');same(seam.outputSha256,enc.authoringDiffuseSha256,e.name+' final master digest');same(seam.axes,trim?'x':'xy',e.name+' native edge axes');same(seam.spatialResampling,false,e.name+' no seam geometry resampling');same(seam.unchangedOutsideBands,true,e.name+' edge bands only');same(seam.toolSha256,sha256(read('tools/texture_sheets/sources/official-world-2026-10-13-continuation/finish_continuation_edges.py')),e.name+' edge wrapper');same(seam.implementationSha256,sha256(read('tools/texture_sheets/sources/official-world-2026-10-12/finish_quiet_edges.py')),e.name+' edge implementation');
  const spec=newEightTrial[e.name];same(spec.name??e.name,e.name,e.name+' diagnostic name');same(spec.nativeKey,e.key,e.name+' diagnostic native key');equal([spec.width,spec.heightPixels],native.map(n=>n*4),e.name+' diagnostic aspect');for(const[role,file]of[['diffuse',spec.file],['height',spec.height],...axes.map(a=>['normal'+a.toUpperCase(),spec.normalChannels[a]])])same(sha256(read('newer/textures/'+file)),enc.outputs[role].sha256,e.name+' diagnostic/runtime '+role+' bytes');
 }
 const trimReusePath=eightBase+'horizontal-trim-reuse-v1.json',trimReuse=JSON.parse(read(trimReusePath));same(sha256(read(eightBase+'prepare_horizontal_trims.py')),trimReuse.toolSha256,'horizontal trim producer');same(sha256(read(trimReuse.source)),trimReuse.sourceSha256,'approved plain rail donor');same(sha256(read(trimReuse.fastener)),trimReuse.fastenerSha256,'approved unrotated fastener donor');equal(trimReuse.dimensions,[512,64],'trim aspect');equal(trimReuse.markedCentresNative,Array.from({length:8},(_,k)=>[8.5+16*k,9.5]),'exact eight head count and native phase');equal(trimReuse.railRowsPreserved,[Array.from({length:8},(_,i)=>i),Array.from({length:12},(_,i)=>i+52)],'protected upper/lower rail rows');
 const trimTemp=mkdtempSync(join(tmpdir(),'quaked-horizontal-trim-public-'));try{mkdirSync(resolve(trimTemp,eightBase),{recursive:true});execFileSync('/usr/bin/python3',[eightBase+'prepare_horizontal_trims.py','--source-root',root,'--output-root',trimTemp],{cwd:root,stdio:'pipe'});const replay=JSON.parse(readFileSync(resolve(trimTemp,trimReusePath)));equal(replay.markedCentresNative,trimReuse.markedCentresNative,'actual producer head phase');for(const output of trimReuse.outputs)bytesEqual(readFileSync(resolve(trimTemp,output.file)),read(output.file),'actual trim producer output '+output.file);}finally{rmSync(trimTemp,{recursive:true,force:true});}
 const crosspackKeys={rock3_8:'64x64:57663646989d1874',city8_2:'64x64:04e333ca877bde90',rock3_2:'64x64:296e96b9351c76fb',cop2_5:'64x64:e25a260daecd597f',church1:'128x128:8d401a31a05f9e4b',maya1_9:'128x128:694bfeae23b74c54'};
 equal(crosspackSixReceipt.entries.map(e=>e.name).sort(),Object.keys(crosspackKeys).sort(),'exact six crosspack interpretations');
 for(const e of crosspackSixReceipt.entries){same(e.key,crosspackKeys[e.name],e.name+' exact crosspack native key');const n=['church1','maya1_9'].includes(e.name)?128:64,enc=encodingReceipt(e);equal([e.source.width,e.source.height],[n,n],e.name+' native crosspack dimensions');for(const role of roles)equal(enc.outputs[role].dimensions,[n*4,n*4],e.name+' exact4x crosspack '+role);equal(enc.comparisonDimensions,[n/2,n/2],e.name+' half-native crosspack distance');equal(enc.secondaryComparisonDimensions,[n/4,n/4],e.name+' quarter-native crosspack distance');same(enc.profile.strength,e.name==='rock3_8'?.3:e.name==='cop2_5'?.06:.2,e.name+' independently reviewed relief strength');same(enc.profile.cap,.5,e.name+' independently reviewed cap');}
 const beforeTrial=JSON.parse(read(crosspackSixReceipt.beforeTrialFile)),trial=JSON.parse(read('newer/textures/candidates-2026-10-12/trial.json'));
 same(sha256(read(crosspackSixReceipt.beforeTrialFile)),crosspackSixReceipt.beforeTrialSha256,'immutable full preview predecessor');
 for(const [name,spec]of Object.entries(beforeTrial))equal(trial[name],spec,'retained complete preview entry '+name);
 const newPreviewNames=['rock3_8_5766','city8_2','rock3_2','cop2_5','church1','maya1_9'].sort(),addedPreviewNames=Object.keys(trial).filter(n=>!Object.hasOwn(beforeTrial,n)).sort();if(index.version===2026101808)equal(addedPreviewNames,newPreviewNames,'only six new diagnostic previews at installed successor version');else for(const name of newPreviewNames)check(addedPreviewNames.includes(name),'retained qualified diagnostic preview '+name);
 const rockPreview=trial.rock3_8_5766,rockSuccessor=crosspackSixReceipt.entries.find(e=>e.name==='rock3_8');same(rockPreview.name,'rock3_8','diagnostic alias resolves actual native name');same(rockPreview.nativeKey,rockSuccessor.key,'diagnostic alias selects only sibling key');same(sha256(read('newer/textures/'+rockPreview.file)),rockSuccessor.diffuseSha256,'diagnostic candidate and runtime sibling diffuse bytes agree');same(sha256(read('newer/textures/'+rockPreview.height)),rockSuccessor.heightSha256,'diagnostic candidate and runtime sibling height bytes agree');for(const axis of axes)same(sha256(read('newer/textures/'+rockPreview.normalChannels[axis])),rockSuccessor.normalChannelSha256[axis],'diagnostic candidate and runtime sibling '+axis+' bytes agree');same(trial['rock3_8-base'].nativeKey,'64x64:5b26cfca296c1fa8','old rock diagnostic preview retained');
 const buildingKeys={city1_4e:'256x256:57188b08b2980962',wmet4_4_JM:'128x128:b211687988132743',TF_Wood03_3:'128x128:da74d457857200cd',TF_Wood01b:'128x128:dfc0821abc1ecd28',TF_Conc_07:'128x128:b56ae95101cd2b63'};
 equal(buildingFiveReceipt.entries.map(e=>e.name).sort(),Object.keys(buildingKeys).sort(),'exact five source-specific building interpretations');
 for(const e of buildingFiveReceipt.entries){same(e.key,buildingKeys[e.name],e.name+' audited building identity');const n=e.name==='city1_4e'?256:128,enc=encodingReceipt(e);equal([e.source.width,e.source.height],[n,n],e.name+' native building dimensions');for(const role of roles)equal(enc.outputs[role].dimensions,[n*4,n*4],e.name+' exact4x building '+role);equal(enc.comparisonDimensions,[n/2,n/2],e.name+' half-native building distance');equal(enc.secondaryComparisonDimensions,[n/4,n/4],e.name+' quarter-native building distance');if(e.name==='wmet4_4_JM'){same(enc.profile.strength,.06,e.name+' reviewed shallow metal strength');same(enc.profile.cap,.5,e.name+' reviewed shallow metal cap');}}
 const industrialKeys={metal5_90_JM:'128x16:7ddac95d8d0ab837',wmet4_25_JM:'128x32:af172edc2383f56e',wmet4_27_JM:'128x16:aeefd7d3bc435719',TF_Metal4_6d:'128x128:8ee4f5f9b8cd8c43',TF_MetWall2_02:'128x128:dda0a237f8680b45'};
 equal(industrialFiveReceipt.entries.map(e=>e.name).sort(),Object.keys(industrialKeys).sort(),'exact five source-specific industrial interpretations');
 for(const e of industrialFiveReceipt.entries){same(e.key,industrialKeys[e.name],e.name+' audited industrial identity');const enc=encodingReceipt(e);same(enc.profile.strength,e.name==='TF_MetWall2_02'?.06:.2,e.name+' reviewed relief strength');same(enc.profile.cap,.5,e.name+' reviewed relief cap');if(e.name.endsWith('_JM')){const h=e.name==='wmet4_25_JM'?32:16;equal([e.source.width,e.source.height],[128,h],e.name+' original horizontal-strip aspect');for(const role of roles)equal(enc.outputs[role].dimensions,[512,h*4],e.name+' exact4x horizontal strip '+role);equal(enc.comparisonDimensions,[64,h/2],e.name+' half-native horizontal strip distance');equal(enc.secondaryComparisonDimensions,[32,h/4],e.name+' quarter-native horizontal strip distance');}else equal([e.source.width,e.source.height],[128,128],e.name+' native square dimensions');}
 const terrainKeys={TF_Grass1:'256x256:c4e7d38a1a7fa8f0',TF_Grass2:'256x256:46d2108d9b9ab827',TF_Ground1:'128x128:f6080a942cfd3f26',TF_Cliff1:'256x256:22663d7406672c66',TF_Cliff1b:'256x256:04f05e02a311fc78'};
 equal(terrainFiveReceipt.entries.map(e=>e.name).sort(),Object.keys(terrainKeys).sort(),'exact five source-specific terrain interpretations');
 for(const e of terrainFiveReceipt.entries){same(e.key,terrainKeys[e.name],e.name+' audited terrain identity');const n=e.name==='TF_Ground1'?128:256;equal([e.source.width,e.source.height],[n,n],e.name+' native terrain dimensions');const enc=encodingReceipt(e);same(enc.normalRecipe,undefined,e.name+' ordinary self-wrapping normal recipe');same(enc.verticalNeighbour,undefined,e.name+' no unsupported forced transition partner');}
 const masonryTrimKeys={metal8_1:'64x64:aa81d3ba0cba5300',metal9_4:'64x64:0ad528e1164b691b',wwall1_1:'64x64:56ef93d64be10dd4',tech04_8:'16x128:cb6ec2d5e8f2bc4f',tech04_7:'16x128:691b632dc1e91317',TF_Brick1_01:'128x128:43c7d96f0f8c49cd',TF_Brick3_01:'128x128:e1479696d52dfa14',TF_Stone4:'256x256:0039688b76f12881',TF_Stone_02:'128x128:86c043f3e458ee39'};
 equal(baseMasonryTrimsReceipt.entries.map(e=>e.name).sort(),Object.keys(masonryTrimKeys).sort(),'exact nine base/masonry/trim interpretations');
 for(const e of baseMasonryTrimsReceipt.entries){same(e.key,masonryTrimKeys[e.name],e.name+' audited material identity');if(['tech04_7','tech04_8'].includes(e.name)){const enc=encodingReceipt(e);equal([e.source.width,e.source.height],[16,128],e.name+' original strip aspect');for(const role of roles)equal(enc.outputs[role].dimensions,[64,512],e.name+' exact4x strip '+role);equal(enc.comparisonDimensions,[8,64],e.name+' half-native strip distance');equal(enc.secondaryComparisonDimensions,[4,32],e.name+' quarter-native strip distance');}}
 const steelKeys={TF_Metal3_02:'128x128:f8230466d48d694c',TF_Metal3_03:'128x128:91329e812dec8483',TF_Metal4_02:'128x128:1a35d6dcc7683ff6',TF_Metal4_03:'128x128:0909f386fef81a54'};
 equal(corrodedSteelReceipt.entries.map(e=>e.name).sort(),Object.keys(steelKeys).sort(),'exact four source-specific corroded steel interpretations');
 for(const e of corrodedSteelReceipt.entries){same(e.key,steelKeys[e.name],e.name+' audited steel identity');same(e.source.width,128,e.name+' original width');same(e.source.height,128,e.name+' original height');}
 const mottledKeys={city3_2:'64x64:4b56f248a42f19ba',city3_4:'64x64:c42b16880720ca92',wstone1_2:'64x64:743c67dccf54b85e'};
 equal(mottledStoneReceipt.entries.map(e=>e.name).sort(),Object.keys(mottledKeys).sort(),'exact three source-specific stone interpretations');
 for(const e of mottledStoneReceipt.entries){same(e.key,mottledKeys[e.name],e.name+' distinct audited stone identity');same(e.source.width,64,e.name+' original width');same(e.source.height,64,e.name+' original height');}
 for(const field of ['key','sourceFile','sourceFileSha256','diffuseSha256'])same(new Set(mottledStoneReceipt.entries.map(e=>e[field])).size,3,'stone colour interpretations retain distinct '+field+' instead of aliasing shared geometry');
 const alias=baseFiveAliasReceipt.entries.find(e=>e.name==='q2_metal1_4'),donor=receipt.entries.find(e=>e.name==='metal1_4');
 check(alias&&donor,'exact native alias and already approved donor both present');
 same(alias.key,'64x64:5fcb234d8850a05f','alias exact audited native identity');same(alias.key,donor.key,'alias/donor native key equality');
 same(alias.source.pixelSha256,'1d0f59a3debeeb5d4d9f2f415ecf7a357e205f3fb8947e5707f2250027fcb449','alias exact audited RGBA digest');
 for(const field of ['width','height','pixelSha256'])same(alias.source[field],donor.source[field],'alias exact native '+field);
 for(const field of ['binding','encodingReceipt','sourceFile','sourceFileSha256'])equal(alias[field],donor[field],'alias shares approved donor '+field+' unchanged');
 equal(alias.source.uses.map(u=>({game:u.game,map:u.map,slot:u.slot})),[{game:'mg1',map:'maps/mge2m2.bsp',slot:82}],'alias checks its own actual PAK occurrence, not donor occurrence');
 same(agedCorrection.historicalRegistration.file,agedReceiptPath,'correction explicitly references original v2 registration');
 same(sha256(read(agedReceiptPath)),agedCorrection.historicalRegistration.sha256,'original v2 registration retained byte-for-byte');
 same(agedCorrection.entries.length,1,'one narrowly scoped wall correction');
 for(const correction of agedCorrection.entries){
  same(correction.name,'wall14_5','only wall14_5 corrected');same(correction.key,'64x64:a9763815741a765f','same native wall identity');
  const old=agedReceipt.entries.find(e=>e.name===correction.name&&e.key===correction.key);check(old,'correction has recorded predecessor');equal(correction.previousBinding,old.binding,'v3 previous binding exactly matches v2 receipt');
  for(const field of ['source','sourceFile','sourceFileSha256'])equal(correction[field],old[field],'v3 preserves original '+field);
  for(const [,file,digest]of mapBindings(old))same(sha256(read('newer/textures/'+file)),digest,'retained v2 asset unchanged');
 }
 equal(Object.keys(agedReceipt.protectedOwnerBindings).sort(),['cop1_1','ecop1_1','metal5_1'],'exact protected owner artwork names');
 for(const [name,sections]of Object.entries(agedReceipt.protectedOwnerBindings))for(const field of ['textures','normals','sources','ordinaryVariants','glass'])equal(index[field]?.[name]??null,sections[field],name+' preserves owner '+field+' despite shared native pixels');
 same(new Set(Object.values(agedReceipt.protectedOwnerBindings).map(row=>row.textures)).size,3,'all three distinct owner pictures remain separate');
 equal(receipt.entries.map(e=>e.name).sort(),names,'exact families'); same(sha256(read(migration.historicalInput.file)),migration.historicalInput.sha256,'explicit unchanged 4x predecessor record'); const sources=[];
 for(const e of receipt.entries) {
  if(e.route==='textures'){equal({file:index.textures[e.name],normal:index.normals[e.name]},e.binding,e.name+' exact base-route binding');equal(index.sources[e.name],[e.key],e.name+' exact base source guard');same(index.ordinaryVariants?.[e.name]?.[e.key],undefined,e.name+' no route shadow');}
  else {equal(index.ordinaryVariants?.[e.name]?.[e.key],e.binding,e.name+' exact source-key binding');if(!e.previous)for(const field of ['textures','sources','normals'])same(index[field]?.[e.name],undefined,e.name+' no unguarded base binding '+field);}
  check(!index.glass?.[e.name],e.name+' no glass selector');
  if(e.previous) {const old=fourTimes.bindings.find(old=>old.name===e.name&&old.nativeKey===e.key);check(old,e.name+' explicit predecessor exists');equal(e.previous,old.current,e.name+' predecessor exactly matches four-times record');}
  else if(!e._correction) {const old=historicalCity.entries.find(old=>old.name===e.name); equal(e.previousBinding,old?.binding??null,e.name+' previous binding exactly links historical city receipt');}
  const enc=encodingReceipt(e); same(e.binding.normal.strength,enc.profile.strength,e.name+' relief strength'); same(e.binding.normal.cap,enc.profile.cap,e.name+' relief cap'); same(enc.normalLayout,'channels',e.name+' independent channel layout');same(e.binding.normal.normalFile,undefined,e.name+' no lossy RGB normal fallback'); same(enc.quality,92,e.name+' quality92 receipt'); same(enc.lossless,false,e.name+' lossy receipt'); same(enc.factor,4,e.name+' 4x receipt');
  same(sha256(read(enc.original)),enc.originalSha256,e.name+' original PNG provenance'); same(e.sourceFile,enc.original,e.name+' same original input'); same(e.sourceFileSha256,enc.originalSha256,e.name+' registration original digest');
  same(sha256(read(enc.authoringDiffuse)),enc.authoringDiffuseSha256,e.name+' retained master provenance');
  for(const [role,file,digest] of mapBindings(e)) {
   const bytes=read('newer/textures/'+file), record=enc.outputs[role];
   same(sha256(bytes),digest,e.name+' runtime '+role+' digest'); same(sha256(bytes),record.sha256,e.name+' encoded '+role+' receipt');
   same(record.quality,92,e.name+' '+role+' quality'); same(record.lossless,false,e.name+' '+role+' lossy'); equal(record.dimensions,[e.source.width*4,e.source.height*4],e.name+' '+role+' dimensions'); webpLossy(bytes,e.name+' '+role);
  }
  for(const use of e.source.uses) {
   const actual=await nativeSource(e,use);
   try { same(actual.width,e.source.width,e.name+' native width'); same(actual.height,e.source.height,e.name+' native height'); same(actual.key,e.key,e.name+' actual renderer identity'); same(sha256(actual.rgba),e.source.pixelSha256,e.name+' actual native RGBA'); sources.push({name:e.name,key:actual.key,pixelSha256:sha256(actual.rgba),...actual.source}); }
   finally { dispose(actual.texture); }
  }
 }
 const result={qualification:'Actual PAK and public renderer current-state verification; visual acceptance separate',indexSha256:sha256(indexBytes),registrationSha256:sha256(read(receiptPath)),migrationSha256:sha256(read(migrationPath)),tfRegistrationSha256:sha256(read(tfReceiptPath)),rockRegistrationSha256:sha256(read(rockReceiptPath)),quietRegistrationSha256:sha256(read(quietReceiptPath)),realismRegistrationSha256:sha256(read(realismReceiptPath)),characterRegistrationSha256:sha256(read(characterReceiptPath)),agedRegistrationSha256:sha256(read(agedReceiptPath)),agedCorrectionSha256:sha256(read(agedCorrectionPath)),floorStoneStudRegistrationSha256:sha256(read(floorStoneStudReceiptPath)),crosspackStoneRegistrationSha256:sha256(read(crosspackStoneReceiptPath)),concreteFourRegistrationSha256:sha256(read(concreteFourReceiptPath)),baseFiveAliasRegistrationSha256:sha256(read(baseFiveAliasReceiptPath)),bracedWoodRegistrationSha256:sha256(read(bracedWoodReceiptPath)),mottledStoneRegistrationSha256:sha256(read(mottledStoneReceiptPath)),corrodedSteelRegistrationSha256:sha256(read(corrodedSteelReceiptPath)),baseMasonryTrimsRegistrationSha256:sha256(read(baseMasonryTrimsReceiptPath)),terrainFiveRegistrationSha256:sha256(read(terrainFiveReceiptPath)),industrialFiveRegistrationSha256:sha256(read(industrialFiveReceiptPath)),buildingFiveRegistrationSha256:sha256(read(buildingFiveReceiptPath)),crosspackSixRegistrationSha256:sha256(read(crosspackSixReceiptPath)),nextEightRegistrationSha256:sha256(read(nextEightReceiptPath)),bindings:receipt.entries.length,occurrences:sources.length,sources};
 if(process.env.QUAKED_Q92_TEXTURE_RECEIPT) writeFileSync(process.env.QUAKED_Q92_TEXTURE_RECEIPT,JSON.stringify(result,null,2)+'\n');
 console.log('Q92_NATIVE_SOURCES '+JSON.stringify({bindings:result.bindings,occurrences:result.occurrences,indexSha256:result.indexSha256}));
});

Deno.test('actual current encoder reproduces each q92 diffuse, decoded-height-derived relief and authored normal byte-for-byte', () => {
 const temp=mkdtempSync(join(tmpdir(),'quaked-q92-independent-'));
 try { const visited=new Set();for(const e of receipt.entries) {
  if(visited.has(e.encodingReceipt))continue;visited.add(e.encodingReceipt);const enc=encodingReceipt(e), stem=join(temp,e.name+'-'+e.key.replace(/[^A-Za-z0-9]/g,'_'));
  const pairArgs=enc.normalRecipe==='directed-vertical-pair'?['--vertical-neighbour',enc.verticalNeighbour.authoringDiffuse,'--neighbour-name',enc.verticalNeighbour.name]:[];
  execFileSync('/usr/bin/python3',['tools/texture_sheets/encode_official_maps.py','--original',enc.original,'--diffuse',enc.authoringDiffuse,'--name',enc.name,'--output-stem',stem,'--strength',String(enc.profile.strength),'--cap',String(enc.profile.cap),'--normal-layout','channels',...pairArgs],{cwd:root,stdio:'pipe'});
  const repeated=JSON.parse(readFileSync(stem+'.json'));
  same(repeated.comparisonDivisor,2,e.name+' half-original primary comparison'); equal(repeated.comparisonDimensions,[e.source.width/2,e.source.height/2],e.name+' half-native distance view'); equal(repeated.secondaryComparisonDimensions,[e.source.width/4,e.source.height/4],e.name+' quarter-native secondary view');
  for(const role of roles) bytesEqual(readFileSync(repeated.outputs[role].file),read(enc.outputs[role].file),e.name+' actual quality92 '+role+' encoder reproduction');
 }} finally { rmSync(temp,{recursive:true,force:true}); }
});

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
 for(const e of [...tfReceipt.entries,...quietReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...realismReceipt.entries,...characterReceipt.entries,...floorStoneStudReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...concreteFourReceipt.entries,...bracedWoodReceipt.entries,...corrodedSteelReceipt.entries,...baseMasonryTrimsReceipt.entries.filter(e=>e.name!==e.name.toLowerCase()),...terrainFiveReceipt.entries,...industrialFiveReceipt.entries,...buildingFiveReceipt.entries,...crosspackSixReceipt.entries,...nextEightReceipt.entries]) {
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
  same(neighbour.authoringDiffuse,partnerEnc.authoringDiffuse,e.name+' partner master path');same(sha256(read(neighbour.authoringDiffuse)),neighbour.authoringDiffuseSha256,e.name+' partner master provenance');
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
