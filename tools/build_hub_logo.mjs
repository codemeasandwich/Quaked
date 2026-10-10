// Faithful rasterisation of the owner's logo.svg into the existing quake plaque.
// No font substitution or generated lettering. Native UV dimensions stay those of the original plaque.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const sharpPath = process.env.QUAKED_SHARP_MODULE;
if ( ! sharpPath ) throw new Error( 'Set QUAKED_SHARP_MODULE to installed sharp module entry.' );
const { default: sharp } = await import( pathToFileURL( sharpPath ).href );
const svg = await readFile( 'logo.svg' ), pak = await readFile( 'games/shareware/pak0.pak' );
const packFile = name => {
 const offset = pak.readInt32LE( 4 ), length = pak.readInt32LE( 8 );
 for ( let i = offset; i < offset + length; i += 64 ) if ( pak.subarray( i, i + 56 ).toString().split( '\0' )[ 0 ] === name ) return pak.subarray( pak.readInt32LE( i + 56 ), pak.readInt32LE( i + 56 ) + pak.readInt32LE( i + 60 ) );
 throw new Error( 'Missing native file ' + name );
};
const bsp = packFile( 'maps/start.bsp' );
const offset = bsp.readInt32LE( 20 ), length = bsp.readInt32LE( 24 ), textures = bsp.subarray( offset, offset + length );
let native;
for ( let i = 0; i < textures.readInt32LE( 0 ); i ++ ) {
 const p = textures.readInt32LE( 4 + i * 4 ); if ( p < 0 || textures.subarray( p, p + 16 ).toString().split( '\0' )[ 0 ] !== 'quake' ) continue;
 const w = textures.readInt32LE( p + 16 ), h = textures.readInt32LE( p + 20 ), pixels = textures.subarray( p + textures.readInt32LE( p + 24 ), p + textures.readInt32LE( p + 24 ) + w * h );
 native = { w, h, pixels }; break;
}
if ( ! native || native.w !== 288 || native.h !== 64 ) throw new Error( 'Expected native288x64 hub plaque.' );
// Native neighboring wall/pillars: wizmet1_2 S=x,T=-z+8. The old
// quake plaque uses S=x-112,T=-z+8 at x400..688,z264..328.
// Its image origin therefore samples the wall at x400,z328: source(64,0).
const indexPath = 'newer/textures/index.json', index = JSON.parse( await readFile( indexPath, 'utf8' ) );
const sourceTexture = 'wizmet1_2', sourceEntry = index.normals[ sourceTexture ];
const sourceAlbedo = 'newer/textures/' + index.textures[ sourceTexture ];
const sourceHeight = 'newer/textures/' + sourceEntry.file;
const { data: wall, info: wallInfo } = await sharp( sourceAlbedo ).ensureAlpha().raw().toBuffer( { resolveWithObject: true } );
const { data: wallHeight, info: heightInfo } = await sharp( sourceHeight ).greyscale().raw().toBuffer( { resolveWithObject: true } );
if ( wallInfo.width !== 256 || wallInfo.height !== 256 || heightInfo.width !== 256 || heightInfo.height !== 256 ) throw new Error( 'Expected installed256x256 pillar art/height.' );
const width = native.w * 4, height = native.h * 4;
const { data: glyph, info } = await sharp( svg, { density: 288 } ).ensureAlpha().trim( { threshold: 0 } ).resize( { width: Math.round( width * .9 ), height: Math.round( height * .88 ), fit: 'inside' } ).raw().toBuffer( { resolveWithObject: true } );
const left = Math.floor( ( width - info.width ) / 2 ), top = Math.floor( ( height - info.height ) / 2 );
const diffuse = new Uint8Array( width * height * 4 ), heights = new Uint8Array( width * height );
let glyphPixels = 0, glyphHeight = 0, backgroundHeight = 0, backgroundPixels = 0;
for ( let y = 0; y < height; y ++ ) for ( let x = 0; x < width; x ++ ) {
 const i = y * width + x, gx = x - left, gy = y - top;
 const alpha = gx >= 0 && gy >= 0 && gx < info.width && gy < info.height ? glyph[ ( gy * info.width + gx ) * info.channels + info.channels - 1 ] / 255 : 0;
 const source = ( y % 256 ) * 256 + ( x + 64 ) % 256;
 for ( let c = 0; c < 4; c ++ ) diffuse[ i * 4 + c ] = wall[ source * 4 + c ];
 // The pigment stays intact: only the height of each SVG stroke is lowered.
 heights[ i ] = Math.round( Math.max( 0, wallHeight[ source ] - alpha * .56 * 255 ) );
 if ( alpha > .99 ) { glyphPixels ++; glyphHeight += heights[ i ]; } else if ( alpha === 0 ) { backgroundPixels ++; backgroundHeight += heights[ i ]; }
}
await sharp( diffuse, { raw: { width, height, channels: 4 } } ).webp( { lossless: true } ).toFile( 'newer/textures/hub-quaked-logo.webp' );
await sharp( heights, { raw: { width, height, channels: 1 } } ).webp( { lossless: true } ).toFile( 'newer/textures/normals/hub-quaked-logo.webp' );
const normalStrength = sourceEntry.strength / Math.sqrt( width * height / ( 256 * 256 ) );
index.version = 2026100302; index.textures.quake = 'hub-quaked-logo.webp'; index.normals.quake = { file: 'normals/hub-quaked-logo.webp', strength: normalStrength, cap: sourceEntry.cap, edgeSource: { file: sourceEntry.file, offset: [ 64, 0 ] } };
await writeFile( indexPath, JSON.stringify( index, null, ' ' ).replace( /"strength": 2,/g, '"strength": 2.0,' ).replace( /"strength": 0,/g, '"strength": 0.0,' ) + '\n' );
await writeFile( 'docs/evidence/hub-logo-assets-2026-10-03.json', JSON.stringify( { svg: 'logo.svg', svgSha256: createHash( 'sha256' ).update( svg ).digest( 'hex' ), nativeTexture: 'quake', nativeSize: [ native.w, native.h ], outputSize: [ width, height ], glyphBounds: [ left, top, info.width, info.height ], sourceTexture, sourceAlbedo, sourceHeight, sourceSize: [ 256, 256 ], sourceOffset: [ 64, 0 ], albedoOverlay: false, glyphPixels, meanGlyphHeight: glyphHeight / glyphPixels / 255, meanBackgroundHeight: backgroundHeight / backgroundPixels / 255, recessSign: 'glyph lower than panel', originalLetteringReused: false, normalStrength, normalCap: sourceEntry.cap }, null, 2 ) + '\n' );
console.log( 'Built faithful SVG logo diffuse and recessed height, leaving native UV dimensions unchanged.' );
