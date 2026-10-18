#!/usr/bin/env node
/**
 * Encode an inferred RGB8 height image as reproducible technical texture data.
 * No color linearization, range normalization, sharpening, or synthesized relief.
 * Usage: node encode_maps.mjs SOURCE.png OUTPUT_DIR [amplitude=0.1] [--preview]
 *        node encode_maps.mjs --inspect-source SOURCE.png
 *        node encode_maps.mjs --self-test
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateSync, inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let sharp;
try {
  if (!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw new Error('No runtime path');
  sharp = require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp'));
} catch {
  sharp = require('sharp');
}
const WIDTH = 2048, HEIGHT = 4096;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PERCENTILES = [0, 1, 5, 10, 25, 50, 75, 90, 95, 99, 100];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes = Buffer.alloc(0)) {
  const tag = Buffer.from(type, 'ascii');
  const out = Buffer.allocUnsafe(bytes.length + 12);
  out.writeUInt32BE(bytes.length, 0); tag.copy(out, 4); bytes.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + bytes.length)), 8 + bytes.length);
  return out;
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
export function encodePng(raw, width, height, bitDepth, colorType) {
  assert.ok((bitDepth === 16 && colorType === 0) || (bitDepth === 8 && colorType === 2));
  const bpp = colorType === 0 ? 2 : 3, stride = width * bpp;
  assert.equal(raw.length, stride * height);
  const filtered = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride, out = y * (stride + 1);
    filtered[out] = 4;
    for (let x = 0; x < stride; x++) {
      const left = x >= bpp ? raw[row + x - bpp] : 0;
      const above = y ? raw[row + x - stride] : 0;
      const upperLeft = y && x >= bpp ? raw[row + x - stride - bpp] : 0;
      filtered[out + 1 + x] = (raw[row + x] - paeth(left, above, upperLeft)) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth; ihdr[9] = colorType;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(filtered, { level: 6 })), chunk('IEND')]);
}
export function readDataPng(png) {
  assert.ok(png.subarray(0, 8).equals(SIGNATURE), 'PNG signature mismatch');
  const chunks = [], idat = [];
  let header, offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), end = offset + 12 + length;
    assert.ok(end <= png.length, 'Truncated PNG chunk');
    const type = png.toString('ascii', offset + 4, offset + 8);
    const bytes = png.subarray(offset + 8, offset + 8 + length);
    assert.equal(crc32(png.subarray(offset + 4, offset + 8 + length)), png.readUInt32BE(offset + 8 + length), `${type} CRC mismatch`);
    chunks.push(type);
    if (type === 'IHDR') header = { width: bytes.readUInt32BE(0), height: bytes.readUInt32BE(4), bitDepth: bytes[8], colorType: bytes[9] };
    if (type === 'IDAT') idat.push(bytes);
    offset = end;
  }
  assert.deepEqual(chunks, ['IHDR', 'IDAT', 'IEND'], 'Data PNG must contain only IHDR, IDAT and IEND');
  const bpp = header.colorType === 0 && header.bitDepth === 16 ? 2 : header.colorType === 2 && header.bitDepth === 8 ? 3 : 0;
  assert.ok(bpp, 'Unsupported data PNG type');
  const stride = header.width * bpp, scanlines = inflateSync(Buffer.concat(idat));
  assert.equal(scanlines.length, (stride + 1) * header.height);
  const raw = Buffer.allocUnsafe(stride * header.height);
  for (let y = 0; y < header.height; y++) {
    const row = y * stride, input = y * (stride + 1), filter = scanlines[input];
    assert.equal(filter, 4, 'Unexpected PNG filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? raw[row + x - bpp] : 0;
      const b = y ? raw[row + x - stride] : 0;
      const c = y && x >= bpp ? raw[row + x - stride - bpp] : 0;
      raw[row + x] = (scanlines[input + 1 + x] + paeth(a, b, c)) & 255;
    }
  }
  return { ...header, chunks, raw };
}
function floatStats(values) {
  const sorted = values.slice().sort();
  let sum = 0;
  for (const value of values) sum += value;
  const percentiles = {};
  for (const p of PERCENTILES) {
    const i = (sorted.length - 1) * p / 100, a = Math.floor(i), b = Math.ceil(i);
    percentiles[`p${p}`] = sorted[a] + (sorted[b] - sorted[a]) * (i - a);
  }
  return { count: values.length, mean: sum / values.length, percentiles };
}
export async function readSource(sourcePath) {
  const bytes = fs.readFileSync(sourcePath);
  const metadata = await sharp(bytes, { ignoreIcc: true, autoOrient: false }).metadata();
  assert.equal(metadata.format, 'png', 'Source must be the inferred height PNG');
  assert.equal(metadata.depth, 'uchar', 'Source must be RGB8/grayscale8; do not silently reduce a higher-precision source');
  assert.equal(metadata.height, metadata.width * 2, 'Source must have exactly 1:2 width:height; no aspect-ratio distortion is performed');
  assert.ok(['srgb', 'b-w'].includes(metadata.space), 'Source must contain RGB or grayscale data');
  const { data, info } = await sharp(bytes, { ignoreIcc: true, autoOrient: false }).raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  assert.ok([1, 2, 3, 4].includes(info.channels));
  const scalar = new Float32Array(info.width * info.height), channelSum = [0, 0, 0];
  const maxDifference = [0, 0, 0], sumDifference = [0, 0, 0];
  let unequalPixels = 0, maxRange = 0, sumRange = 0;
  for (let i = 0; i < scalar.length; i++) {
    const at = i * info.channels;
    if (info.channels === 2 || info.channels === 4) assert.equal(data[at + info.channels - 1], 255, 'Transparent source pixels are not supported');
    const r = data[at], g = info.channels <= 2 ? r : data[at + 1], b = info.channels <= 2 ? r : data[at + 2];
    scalar[i] = (r + g + b) / 765;
    channelSum[0] += r; channelSum[1] += g; channelSum[2] += b;
    const differences = [Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)];
    const range = Math.max(r, g, b) - Math.min(r, g, b);
    if (range) unequalPixels++;
    maxRange = Math.max(maxRange, range); sumRange += range;
    for (let c = 0; c < 3; c++) { maxDifference[c] = Math.max(maxDifference[c], differences[c]); sumDifference[c] += differences[c]; }
  }
  const bandRows = Math.ceil(info.height * 0.15), background = new Float32Array(info.width * bandRows * 2);
  background.set(scalar.subarray(0, info.width * bandRows));
  background.set(scalar.subarray((info.height - bandRows) * info.width), info.width * bandRows);
  const sourceStats = floatStats(scalar), backgroundStats = floatStats(background);
  return { scalar, width: info.width, height: info.height, manifest: {
    filename: path.basename(sourcePath), sha256: sha256(bytes), native_resolution: [info.width, info.height],
    native_bit_depth: 8, native_channels: metadata.channels, native_color_space: metadata.space,
    scalar_conversion: 'Float32(mean(R,G,B)/255); RGB values treated directly as data; ICC ignored; no sRGB linearization',
    rgb_channel_differences: { unequal_pixel_count: unequalPixels, unequal_pixel_fraction: unequalPixels / scalar.length,
      mean_rgb_bytes: channelSum.map(v => v / scalar.length), pair_order: ['R-G', 'G-B', 'R-B'],
      maximum_absolute_difference_bytes: maxDifference, mean_absolute_difference_bytes: sumDifference.map(v => v / scalar.length),
      maximum_channel_range_bytes: maxRange, mean_channel_range_bytes: sumRange / scalar.length },
    height_statistics: sourceStats,
    background_midlevel_estimate: { method: 'Combined top and bottom 15% bands, rounded up to whole rows; median, no foreground mask',
      rows_per_band: bandRows, top_rows_inclusive: [0, bandRows - 1], bottom_rows_inclusive: [info.height - bandRows, info.height - 1],
      suggested_midlevel: backgroundStats.percentiles.p50, statistics: backgroundStats,
      caution: 'These bands can contain relief or residual lighting; this is a suggested background offset, not a measured geometric zero.' }
  } };
}
export function resampleBilinear(source, sw, sh, width, height) {
  const out = new Float32Array(width * height), x0 = new Uint32Array(width), x1 = new Uint32Array(width), tx = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    const sx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sw / width - 0.5));
    x0[x] = Math.floor(sx); x1[x] = Math.min(sw - 1, x0[x] + 1); tx[x] = sx - x0[x];
  }
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(sh - 1, (y + 0.5) * sh / height - 0.5));
    const y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), ty = sy - y0;
    for (let x = 0; x < width; x++) {
      const a = source[y0 * sw + x0[x]] * (1 - tx[x]) + source[y0 * sw + x1[x]] * tx[x];
      const b = source[y1 * sw + x0[x]] * (1 - tx[x]) + source[y1 * sw + x1[x]] * tx[x];
      out[y * width + x] = a * (1 - ty) + b * ty;
    }
  }
  return out;
}
const encodeComponent = v => Math.round(Math.max(0, Math.min(1, v * 0.5 + 0.5)) * 255);
function vectorAt(q, width, height, x, y, amplitude) {
  const left = Math.max(0, x - 1), right = Math.min(width - 1, x + 1);
  const top = Math.max(0, y - 1), bottom = Math.min(height - 1, y + 1);
  const dx = (q[y * width + right] - q[y * width + left]) / ((right - left || 1) * 65535);
  const dy = (q[bottom * width + x] - q[top * width + x]) / ((bottom - top || 1) * 65535);
  const nx = -amplitude * width * dx, ny = amplitude * width * dy, length = Math.hypot(nx, ny, 1);
  return [nx / length, ny / length, 1 / length];
}
export function deriveNormals(q, width, height, amplitude, preview = false) {
  const raw = Buffer.allocUnsafe(width * height * 3);
  const pw = width / 2, ph = height / 2;
  if (preview) assert.ok(Number.isInteger(pw) && Number.isInteger(ph));
  const accum = preview ? new Float64Array(pw * ph * 3) : null;
  let minLength = Infinity, maxLength = 0, maxLengthError = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const n = vectorAt(q, width, height, x, y, amplitude), at = (y * width + x) * 3;
    assert.ok(n.every(Number.isFinite), 'Non-finite normal');
    const length = Math.hypot(...n);
    minLength = Math.min(minLength, length); maxLength = Math.max(maxLength, length); maxLengthError = Math.max(maxLengthError, Math.abs(length - 1));
    for (let c = 0; c < 3; c++) raw[at + c] = encodeComponent(n[c]);
    if (preview) {
      const p = (Math.floor(y / 2) * pw + Math.floor(x / 2)) * 3;
      for (let c = 0; c < 3; c++) accum[p + c] += n[c];
    }
  }
  let previewRaw = null;
  if (preview) {
    previewRaw = Buffer.allocUnsafe(pw * ph * 3);
    for (let i = 0; i < accum.length; i += 3) {
      const length = Math.hypot(accum[i], accum[i + 1], accum[i + 2]);
      for (let c = 0; c < 3; c++) previewRaw[i + c] = encodeComponent(accum[i + c] / length);
    }
  }
  return { raw, previewRaw, statistics: { all_finite: true, floating_unit_length_min: minLength, floating_unit_length_max: maxLength, floating_unit_length_max_error: maxLengthError } };
}
function verifyNormalsAgainstHeight(raw, q, width, height, amplitude) {
  let maxChannelError = 0, minLength = Infinity, maxLength = 0, maxAngleDegrees = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const n = vectorAt(q, width, height, x, y, amplitude), at = (y * width + x) * 3;
    const decoded = [raw[at] / 127.5 - 1, raw[at + 1] / 127.5 - 1, raw[at + 2] / 127.5 - 1];
    for (let c = 0; c < 3; c++) maxChannelError = Math.max(maxChannelError, Math.abs(raw[at + c] - encodeComponent(n[c])));
    const length = Math.hypot(...decoded), dot = (decoded[0] * n[0] + decoded[1] * n[1] + decoded[2] * n[2]) / length;
    minLength = Math.min(minLength, length); maxLength = Math.max(maxLength, length);
    maxAngleDegrees = Math.max(maxAngleDegrees, Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI);
  }
  assert.equal(maxChannelError, 0, 'Stored normal map differs from the finite derivatives of the stored displacement');
  return { checked_pixels: width * height, recomputed_from_saved_height_max_channel_error_bytes: maxChannelError,
    decoded_rgb8_unit_length_min: minLength, decoded_rgb8_unit_length_max: maxLength,
    decoded_rgb8_max_angular_error_degrees: maxAngleDegrees,
    note: 'RGB8 quantization slightly changes length; normalize sampled vectors in the shader.' };
}
function saveVerifiedPng(filename, raw, width, height, bitDepth, colorType) {
  const encoded = encodePng(raw, width, height, bitDepth, colorType);
  fs.writeFileSync(filename, encoded);
  const reloaded = readDataPng(fs.readFileSync(filename));
  assert.ok(reloaded.raw.equals(raw), `${path.basename(filename)} decoded samples changed`);
  return { raw: reloaded.raw, manifest: { filename: path.basename(filename), resolution: [width, height], bit_depth: bitDepth,
    color_type: colorType === 0 ? 'grayscale, one channel' : 'RGB, three channels', bytes: encoded.length, sha256: sha256(encoded),
    png_chunks: reloaded.chunks, all_chunk_crcs_valid: true, exact_sample_round_trip: true, color_profile_or_gamma_chunks: false } };
}
async function main(args) {
  if (args[0] === '--inspect-source') {
    const source = await readSource(args[1]); console.log(JSON.stringify(source.manifest, null, 2)); return;
  }
  if (args[0] === '--self-test') { await selfTest(); return; }
  const positional = args.filter(a => a !== '--preview');
  if (positional.length < 2 || positional.length > 3) throw new Error('Usage: node encode_maps.mjs SOURCE.png OUTPUT_DIR [amplitude=0.1] [--preview]');
  const [sourcePath, outputDir] = positional, amplitude = positional[2] === undefined ? 0.1 : Number(positional[2]);
  assert.ok(Number.isFinite(amplitude) && amplitude >= 0, 'Amplitude must be a finite nonnegative number');
  const source = await readSource(sourcePath), field = resampleBilinear(source.scalar, source.width, source.height, WIDTH, HEIGHT);
  const heightRaw = Buffer.allocUnsafe(WIDTH * HEIGHT * 2);
  for (let i = 0; i < field.length; i++) heightRaw.writeUInt16BE(Math.round(Math.max(0, Math.min(1, field[i])) * 65535), i * 2);
  fs.mkdirSync(outputDir, { recursive: true });
  const files = {}, outputPath = name => {
    const result = path.resolve(outputDir, name);
    assert.notEqual(result, path.resolve(sourcePath), 'Refusing to overwrite the input'); return result;
  };
  const savedHeight = saveVerifiedPng(outputPath('dem4_4_displacement_16bit.png'), heightRaw, WIDTH, HEIGHT, 16, 0);
  files.displacement = savedHeight.manifest;
  // Normals are derived from bytes decoded from the actual exported PNG.
  const q = new Uint16Array(WIDTH * HEIGHT), exportedFloat = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) { q[i] = savedHeight.raw.readUInt16BE(i * 2); exportedFloat[i] = q[i] / 65535; }
  const normals = deriveNormals(q, WIDTH, HEIGHT, amplitude, args.includes('--preview'));
  const savedGL = saveVerifiedPng(outputPath('dem4_4_normal_opengl.png'), normals.raw, WIDTH, HEIGHT, 8, 2);
  files.normal_opengl = savedGL.manifest;
  const derivativeVerification = verifyNormalsAgainstHeight(savedGL.raw, q, WIDTH, HEIGHT, amplitude);
  for (let i = 1; i < normals.raw.length; i += 3) normals.raw[i] = 255 - normals.raw[i];
  const savedDX = saveVerifiedPng(outputPath('dem4_4_normal_directx.png'), normals.raw, WIDTH, HEIGHT, 8, 2);
  files.normal_directx = savedDX.manifest;
  for (let i = 0; i < savedGL.raw.length; i++) assert.equal(savedDX.raw[i], i % 3 === 1 ? 255 - savedGL.raw[i] : savedGL.raw[i], 'DirectX byte flip mismatch');
  if (normals.previewRaw) {
    files.preview_opengl = saveVerifiedPng(outputPath('dem4_4_normal_opengl_preview.png'), normals.previewRaw, WIDTH / 2, HEIGHT / 2, 8, 2).manifest;
    for (let i = 1; i < normals.previewRaw.length; i += 3) normals.previewRaw[i] = 255 - normals.previewRaw[i];
    files.preview_directx = saveVerifiedPng(outputPath('dem4_4_normal_directx_preview.png'), normals.previewRaw, WIDTH / 2, HEIGHT / 2, 8, 2).manifest;
  }
  const manifest = {
    title: 'dem4_4 inferred height and coherent tangent-space normals', encoder_version: 1,
    source: source.manifest,
    resampling: { method: 'Bilinear scalar interpolation, texel-center mapping, clamped boundaries, Float32 intermediate',
      source_resolution: [source.width, source.height], exported_resolution: [WIDTH, HEIGHT], aspect_ratio: '1:2, preserved',
      range_normalization: false, added_relief: false, sharpened: false },
    displacement: { representation: 'Unsigned normalized 16-bit single-channel grayscale PNG',
      height_formula: 'H = stored_uint16 / 65535; white is high, black is low',
      quantization: 'round(clamp(Float32_resampled_height, 0, 1) * 65535)',
      output_bit_depth_is_encoding_precision_only: true, height_statistics: floatStats(exportedFloat),
      suggested_midlevel: source.manifest.background_midlevel_estimate.suggested_midlevel },
    normals: { source: 'Exact uint16 samples decoded from the exported displacement PNG', axes: '+U right, +V up, +Z outward; image y increases downward',
      world_width: 1, world_height: 2, physical_texel_width: 1 / WIDTH, physical_texel_height: 2 / HEIGHT,
      amplitude_as_fraction_of_texture_world_width: amplitude,
      height_in_world_units: 'z = amplitude * world_width * (H - midlevel); a constant midlevel does not affect normals',
      derivative: 'Central differences per pixel in the interior; first-order one-sided differences at image boundaries; no wrapping',
      opengl_formula: 'normalize(-amplitude * width * dH/dx_pixel, +amplitude * width * dH/dy_image_pixel, 1)',
      rgb8_encoding: 'round(clamp(0.5 * normal_component + 0.5, 0, 1) * 255)',
      directx_conversion: 'Identical R and B bytes; G_DirectX = 255 - G_OpenGL',
      green_flip_byte_exact_verified: true, ...normals.statistics, verification: derivativeVerification,
      preview: args.includes('--preview') ? '1024x2048; average each 2x2 block of unquantized unit vectors, renormalize, then encode RGB8' : 'Not generated' },
    import_settings: { texture_color_space: 'Non-color / linear data; disable sRGB decoding for all maps',
      normal_convention: 'Choose the OpenGL +Y or DirectX -Y file required by the renderer',
      displacement_amplitude: `Normal maps assume total height range ${amplitude} times texture world width; regenerate normals if this scale changes.`,
      displacement_midlevel: 'Suggested background median above; adjust to the mesh. This changes offset only, not normals.' },
    limitations: [
      'Height was inferred from one color image; it is not measured geometry or a uniquely recoverable ground-truth displacement.',
      'The inference contains residual lighting and feature drift; exact registration to the original texture is not claimed.',
      `The native inferred source is ${source.width}x${source.height} RGB8; the ${WIDTH}x${HEIGHT} field is a mathematical resampling.`,
      '16-bit PNG preserves the resampled field with finer quantization; it does not create native 16-bit detail or recover additional measured detail.',
      'No seamless tiling is claimed; boundaries use clamped scalar sampling and one-sided derivatives.',
      'Normals are mathematically coherent with this exported displacement at the stated amplitude, not with unknown original surface geometry.'
    ],
    files
  };
  fs.writeFileSync(outputPath('manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ output_directory: path.resolve(outputDir), native_resolution: manifest.source.native_resolution,
    source_channel_differences: manifest.source.rgb_channel_differences, source_height_percentiles: manifest.source.height_statistics.percentiles,
    suggested_midlevel: manifest.displacement.suggested_midlevel, derivative_verification: derivativeVerification,
    files: Object.values(files).map(f => ({ filename: f.filename, bytes: f.bytes })) }, null, 2));
}
async function selfTest() {
  const values = [0, 1, 255, 256, 257, 65534, 65535], raw = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => raw.writeUInt16BE(v, i * 2));
  const png = encodePng(raw, values.length, 1, 16, 0), decoded = readDataPng(png);
  assert.ok(decoded.raw.equals(raw));
  const metadata = await sharp(png, { ignoreIcc: true }).metadata();
  assert.equal(metadata.depth, 'ushort'); assert.equal(metadata.channels, 1);
  const width = 4, height = 8, amplitude = 0.1;
  const q = Uint16Array.from({ length: width * height }, (_, i) => 10000 + (i % width) * 1000 + Math.floor(i / width) * 2000);
  const normals = deriveNormals(q, width, height, amplitude, true);
  const expected = [-amplitude * width * 1000 / 65535, amplitude * width * 2000 / 65535, 1];
  const length = Math.hypot(...expected), bytes = expected.map(v => encodeComponent(v / length));
  for (let i = 0; i < normals.raw.length; i++) assert.equal(normals.raw[i], bytes[i % 3]);
  for (let i = 0; i < normals.previewRaw.length; i++) assert.equal(normals.previewRaw[i], bytes[i % 3]);
  assert.ok(bytes[0] < 128 && bytes[1] > 128, 'Normal signs must respect +U right / +V up');
  const flat = deriveNormals(new Uint16Array(width * height).fill(32768), width, height, amplitude).raw;
  for (let i = 0; i < flat.length; i++) assert.equal(flat[i], [128, 128, 255][i % 3]);
  const constant = resampleBilinear(new Float32Array(8).fill(0.25), 2, 4, 4, 8);
  assert.ok(constant.every(v => v === 0.25));
  console.log('PASS: PNG 16-bit single-channel structure and round trip; sharp independently recognizes 16-bit grayscale; analytical ramp and boundary normal signs; flat neutral normals; normalized preview; constant-preserving interpolation. No files written.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
