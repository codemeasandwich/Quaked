import {ResourceURL} from '../src/platform/resource_paths.js';
// Independent public-interface verification of the quality92 channel-normal world families.
// Reads real PAK/BSP inputs, decodes real lossy WebPs and uses renderer endpoints.
// Passing these checks is not visual acceptance or GPU gameplay verification.
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from './helpers/resource_fs.mjs';
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
const trialPath='newer/textures/candidates-2026-10-12/realism-trial.json';
const trial=JSON.parse(read(trialPath));
const liveIndexBytes=read('newer/textures/index.json'), index=JSON.parse(liveIndexBytes);
const names=['TF_Wood01','TF_Wood01c','TF_Stone_01','TF_Stone3','TF_Cliff2','TF_Cliff2b'];
const receipt={entries:Object.entries(trial).map(([name,spec])=>({name,key:spec.nativeKey,binding:{file:spec.file,normal:{file:spec.height,normalChannels:spec.normalChannels,strength:spec.strength,cap:spec.cap}},source:JSON.parse(read(spec.original.replace(/\.png$/,'.json'))).source,sourceFile:spec.original,sourceFileSha256:spec.originalSha256,diffuseSha256:spec.diffuseSha256,heightSha256:spec.heightSha256,normalChannelSha256:spec.normalChannelSha256,encodingReceipt:'newer/textures/'+spec.file.replace(/-diffuse\.webp$/,'.json'),spec}))};
// Keep candidate-path preflight after installation: verify every installed
// binding against its immutable registration receipt and exact candidate bytes,
// then exercise retained candidate paths in an isolated catalogue clone.
// Before registration, the receipt must be absent and all six names unbound.
const installedReceiptPath='tools/texture_sheets/sources/official-world-2026-10-12/realism-registration.json';
const installedReceipt=existsSync(resolve(root,installedReceiptPath))?JSON.parse(read(installedReceiptPath)):null;
if(installedReceipt&&(!Array.isArray(installedReceipt.entries)||installedReceipt.entries.length!==names.length))throw Error('Incomplete realism registration');
for(const e of receipt.entries){
 if(index.textures?.[e.name]||index.glass?.[e.name])throw Error('Unexpected base/glass shadow: '+e.name);
 const live=index.ordinaryVariants?.[e.name]?.[e.key];
 if(installedReceipt){
  const recorded=installedReceipt.entries.find(r=>r.name===e.name&&r.key===e.key);
  if(!recorded||!isDeepStrictEqual(live,recorded.binding))throw Error('Live realism binding differs from registered receipt: '+e.name);
  for(const field of ['sourceFile','sourceFileSha256','diffuseSha256','heightSha256','normalChannelSha256'])if(!isDeepStrictEqual(recorded[field],e[field]))throw Error('Registered realism differs from candidate '+field+': '+e.name);
  if(!isDeepStrictEqual(recorded.source,e.source))throw Error('Registered realism native source differs: '+e.name);
  if(live.normal.strength!==e.binding.normal.strength||live.normal.cap!==e.binding.normal.cap)throw Error('Registered realism relief differs: '+e.name);
  const pairs=[[live.file,e.binding.file],[live.normal.file,e.binding.normal.file],...['x','y','z'].map(axis=>[live.normal.normalChannels?.[axis],e.binding.normal.normalChannels[axis]])];
  for(const [registered,candidate]of pairs)if(!registered||!read('newer/textures/'+registered).equals(read('newer/textures/'+candidate)))throw Error('Installed realism map differs from preflight candidate: '+e.name);
 } else if(live)throw Error('Unreceipted realism installation: '+e.name);
 (index.ordinaryVariants??={})[e.name]={[e.key]:e.binding};
}
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
	globalThis.fetch = async url => { fetches.push( ResourceURL(url,true) ); same( ResourceURL(url,true), 'newer/textures/index.json', 'public index fetch' ); return { ok: true, json: async () => index }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class extends NativeImage { set src( url ) { requests.push( ResourceURL(url,true) ); super.src = read( ResourceURL(url,true).split( '?' )[ 0 ] ); } } } );
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


Deno.test('six realism candidates pin actual native source identities and all30Q92 files',async()=>{
 equal(receipt.entries.map(e=>e.name).sort(),[...names].sort(),'exact candidate family');const sources=[];
 for(const e of receipt.entries){
  const enc=encodingReceipt(e);same(enc.factor,4,e.name+'4x');same(enc.quality,92,e.name+'q92');same(enc.lossless,false,e.name+'lossy');same(enc.normalLayout,'channels',e.name+'XYZ');same(sha256(read(e.sourceFile)),e.sourceFileSha256,e.name+'native reference hash');same(enc.originalSha256,e.sourceFileSha256,e.name+'encoder original');
  same(sha256(read(enc.authoringDiffuse)),enc.authoringDiffuseSha256,e.name+'seam master provenance');same(e.binding.normal.strength,enc.profile.strength,e.name+'strength');same(e.binding.normal.cap,enc.profile.cap,e.name+'cap');
  for(const [role,file,digest]of mapBindings(e)){const bytes=read('newer/textures/'+file);same(sha256(bytes),digest,e.name+'trial hash '+role);same(digest,enc.outputs[role].sha256,e.name+'encoding hash '+role);same(enc.outputs[role].quality,92,e.name+'quality '+role);same(enc.outputs[role].lossless,false,e.name+'lossy '+role);equal(enc.outputs[role].dimensions,[e.source.width*4,e.source.height*4],e.name+'4x '+role);webpLossy(bytes,e.name+role);}
  for(const use of e.source.uses){const actual=await nativeSource(e,use);try{same(actual.key,e.key,e.name+'actual key');same(sha256(actual.rgba),e.source.pixelSha256,e.name+'PAK colours');sources.push({name:e.name,key:actual.key,pixelSha256:sha256(actual.rgba),...actual.source});}finally{dispose(actual.texture);}}
 }
 bytesEqual(read('newer/textures/index.json'),liveIndexBytes,'live catalogue unchanged');
 const proof={qualification:installedReceipt?'Candidate-path preflight with exact live registration verified; no visual or release acceptance':'UNREGISTERED candidates exercised through in-memory catalogue; no installed/runtime acceptance',installedReceiptSha256:installedReceipt?sha256(read(installedReceiptPath)):null,liveIndexSha256:sha256(liveIndexBytes),trialSha256:sha256(read(trialPath)),occurrences:sources.length,candidates:receipt.entries.length,sources};
 if(process.env.QUAKED_REALISM_PREFLIGHT_RECEIPT)writeFileSync(process.env.QUAKED_REALISM_PREFLIGHT_RECEIPT,JSON.stringify(proof,null,2)+'\n');console.log('REALISM_PREFLIGHT '+JSON.stringify({candidates:proof.candidates,occurrences:proof.occurrences,liveIndexSha256:proof.liveIndexSha256}));
});
Deno.test('actual current encoder reproduces each q92 diffuse, decoded-height-derived relief and authored normal byte-for-byte', () => {
 const temp=mkdtempSync(join(tmpdir(),'quaked-q92-independent-'));
 try { const visited=new Set();for(const e of receipt.entries) {
  if(visited.has(e.encodingReceipt))continue;visited.add(e.encodingReceipt);const enc=encodingReceipt(e), stem=join(temp,e.name);
  execFileSync('/usr/bin/python3',['tools/texture_sheets/encode_official_maps.py','--original',enc.original,'--diffuse',enc.authoringDiffuse,'--name',enc.name,'--output-stem',stem,'--strength',String(enc.profile.strength),'--cap',String(enc.profile.cap),'--normal-layout','channels'],{cwd:root,stdio:'pipe'});
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



Deno.test('live index remains byte-for-byte unchanged after candidate preflight',()=>bytesEqual(read('newer/textures/index.json'),liveIndexBytes,'live catalogue unchanged'));
