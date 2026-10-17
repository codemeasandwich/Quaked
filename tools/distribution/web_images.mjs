/** Bestiary delivery optimisation shared by every build profile (owner ruling, 17 October 2026;
 * docs/distribution.md, "Web data files"). The PNG masters under newer/bestiary/ are the single
 * source of truth: this module derives the one WebP variant that both the web build and the
 * desktop app ship, and never writes to the source tree.
 *
 * Data maps are never re-encoded: their pixels are numbers, not pictures (the folio's
 * `<id>.reveal.png` holds each texel's pencil-stroke timing for r_folio.js; height, normal, gloss
 * and native maps likewise). They must still fit BESTIARY_MAX_BYTES as they are.
 *
 * Bestiary pages: re-encoded as WebP at their existing pixel size (compression before resizing),
 * starting at quality 92 and stepping down only as far as BESTIARY_MAX_BYTES needs; alpha stays
 * lossless. A page that cannot fit at BESTIARY_MIN_QUALITY fails the build rather than being
 * resized: that is an owner decision. Results are cached by input digest under
 * .distribution-cache/web-images, shared by both profiles, so the web and app carry byte-identical
 * pages and a rebuild re-encodes only changed pages.
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export const BESTIARY_MAX_BYTES=700_000,BESTIARY_START_QUALITY=92,BESTIARY_MIN_QUALITY=70;
export const DATA_MAP=/(?:^|[.\-_/])(?:reveal|height|normal|gloss|native)\.[a-z]+$/i;
const RECIPE='bestiary-webp-v1';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/**
 * @param {string} path the asset's logical path
 * @param {Buffer} bytes the source file
 * @param {string} [cacheDir] where encoded results are kept between builds (none: no cache)
 * @returns {Promise<?{bytes: Buffer, mime: string, quality: number, width: number, height: number}>}
 *   null when the asset is shipped unchanged
 */
export async function WebOptimise(path,bytes,cacheDir){
 if(!/^newer\/bestiary\/.+\.(png|webp)$/i.test(path))return null;
 if(DATA_MAP.test(path)){if(bytes.length>BESTIARY_MAX_BYTES)throw Error(`${path} is a ${bytes.length}-byte data map over ${BESTIARY_MAX_BYTES}; it cannot be re-encoded lossily`);return null;}
 const sharp=(await import('sharp')).default,{width,height}=await sharp(bytes).metadata();
 // The key covers the recipe, the encoder versions and the source bytes.
 const key=sha(Buffer.concat([Buffer.from(`${RECIPE}|sharp ${sharp.versions.sharp}|webp ${sharp.versions.webp}\0`),bytes])),cached=cacheDir&&resolve(cacheDir,key+'.json');
 if(cached)try{const hit=JSON.parse(await readFile(cached,'utf8')),out=await readFile(resolve(cacheDir,key+'.webp'));if(sha(out)===hit.sha256)return {bytes:out,mime:'image/webp',quality:hit.quality,width,height};}catch{}
 for(let quality=BESTIARY_START_QUALITY;quality>=BESTIARY_MIN_QUALITY;quality-=2){
  const out=await sharp(bytes).webp({quality,alphaQuality:100,effort:6,smartSubsample:true}).toBuffer();
  if(out.length>BESTIARY_MAX_BYTES)continue;
  // Never ship something larger than an original that already fits.
  if(bytes.length<=out.length&&bytes.length<=BESTIARY_MAX_BYTES)return null;
  const check=await sharp(out).metadata();
  if(check.width!==width||check.height!==height)throw Error(`${path}: WebP is ${check.width}x${check.height}, source ${width}x${height}`);
  if(cached){await mkdir(cacheDir,{recursive:true});await writeFile(resolve(cacheDir,key+'.webp'),out);await writeFile(cached,JSON.stringify({path,quality,sha256:sha(out)}));}
  return {bytes:out,mime:'image/webp',quality,width,height};
 }
 throw Error(`${path} (${width}x${height}) does not fit ${BESTIARY_MAX_BYTES} bytes at WebP quality ${BESTIARY_MIN_QUALITY}; resizing it is an owner decision`);
}
