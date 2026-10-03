// Faithful extraction of rock-core from the owner-supplied rockfield-v1.6.0.html (core 1.2.0).
// The default profile is source-identical. An opt-in blockiness control adds
// the broad faceted rock masses explicitly requested by the owner.
const VERSION = '1.2.0';
const DEFAULTS = Object.freeze({
  seed: 73421, profile: 'wall', featureSize: 1.05,
  warp: 0.70, fracture: 0.65, detail: 0.45,
  cells: 128, border: 2
});
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
function smooth(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function seedFrom(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  let h = 2166136261;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(y | 0, 0x5f356495) ^ seed;
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
function rand(x, y, seed) { return (hash(x, y, seed) >>> 8) / 16777216; }
// Quintic-interpolated VALUE noise; this is not a copy of Perlin gradient noise.
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = fade(x - ix), fy = fade(y - iy);
  return mix(mix(rand(ix, iy, seed), rand(ix + 1, iy, seed), fx),
    mix(rand(ix, iy + 1, seed), rand(ix + 1, iy + 1, seed), fx), fy);
}
function fbm(x, y, seed, octaves = 4) {
  let v = 0, a = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    v += noise(x, y, (seed + Math.imul(o, 1013)) >>> 0) * a; total += a;
    // An orthogonal rotation avoids axis-aligned detail; scale is fixed globally.
    const nx = (0.8 * x - 0.6 * y) * 2.03 + 17.31;
    y = (0.6 * x + 0.8 * y) * 2.03 - 9.17; x = nx; a *= 0.5;
  }
  return v / total;
}
/** F1 / F2 cellular distances. Features are deterministic in global cell space.
 * A 5x5 neighborhood avoids the missing-second-nearest issue of a 3x3 shortcut.
 * Jitter stays within [0.15,0.85] of each cell. No tile-boundary special case.
 */
function cellular(x, y, seed, out) {
  const ix = Math.floor(x), iy = Math.floor(y); let d1 = 1e20, d2 = 1e20, identity = 0;
  for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
    const cx = ix + ox, cy = iy + oy;
    const dx = cx + 0.15 + 0.70 * rand(cx, cy, seed) - x;
    const dy = cy + 0.15 + 0.70 * rand(cx, cy, seed ^ 0x9e3779b9) - y;
    const d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; identity = rand(cx, cy, seed ^ 0x6b842f93); } else if (d < d2) d2 = d;
  }
  out[0] = Math.sqrt(d1); out[1] = Math.sqrt(d2); out[2] = identity;
}
function config(input = {}) {
  const c = { ...DEFAULTS, ...input }; c.seed = seedFrom(c.seed);
  if (!['wall', 'ground'].includes(c.profile)) throw new RangeError('profile must be wall or ground');
  for (const k of ['featureSize', 'warp', 'fracture', 'detail'])
    if (!Number.isFinite(c[k])) throw new TypeError(k + ' must be finite');
  if (c.featureSize < 0.15 || c.featureSize > 8) throw new RangeError('featureSize must be 0.15..8');
  for (const k of ['warp', 'fracture', 'detail'])
    if (c[k] < 0 || c[k] > 2) throw new RangeError(k + ' must be 0..2');
  if (c.blockiness !== undefined && (!Number.isFinite(c.blockiness) || c.blockiness < 0 || c.blockiness > 1)) throw new RangeError('blockiness must be 0..1');
  if (!Number.isInteger(c.cells) || c.cells < 16 || c.cells > 1024) throw new RangeError('cells must be 16..1024');
  if (!Number.isInteger(c.border) || c.border < 1 || c.border > 16) throw new RangeError('border must be 1..16');
  return Object.freeze(c);
}
function createField(input) {
  const c = config(input), s = c.seed, d = new Float64Array(3);
  function height(u, v) {
    let x = u / c.featureSize, y = v / c.featureSize;
    const wx = noise(x * 0.72 + 17, y * 0.72 - 31, s ^ 0x83b58237) - 0.5;
    const wy = noise(x * 0.72 - 11, y * 0.72 + 13, s ^ 0x04a13fb3) - 0.5;
    x += (wx + .19 * (noise(x * 3.1, y * 3.1, s ^ 0x971a3119) - .5)) * c.warp;
    y += (wy + .19 * (noise(x * 3.1 + 11, y * 3.1 - 8, s ^ 0x738df117) - .5)) * c.warp;
    if (c.profile === 'ground') {
      const broad = fbm(x * 0.85, y * 0.85, s ^ 0x415b711d, 3);
      const stones = fbm(x * 4.5, y * 4.5, s ^ 0x91507b13, 3);
      // Normalized [0,1] height. Physical subtlety is supplied by render amplitude.
      return clamp(0.20 + 0.46 * broad + c.detail * 0.25 * (stones - 0.5));
    }
    cellular(x * 1.62, y * 2.05, s ^ 0x8b8b8b8b, d);
    const gap = d[1] - d[0];
    const interior = smooth(0.0, 0.48, gap);
    const macro = fbm(x * 0.69, y * 0.69, s ^ 0x737bb55b, 3);
    const micro = fbm(x * 9.3, y * 9.3, s ^ 0xa75319af, 4);
    const ledges = noise(x * 2.7 + 3.1, y * 7.4 - 17.3, s ^ 0xd33b29f7);
    const ridgeNoise = fbm(x * 2.6 - 3, y * 2.6 + 11, s ^ 0x71523b9d, 3);
    const ridges = 1 - Math.abs(2 * ridgeNoise - 1);
    // Broad irregular outcrops, not constant-height paving slabs.
    const crown = Math.pow(clamp(1 - d[0] * .93), 1.25);
    const fissure = 1 - smooth(0.003, 0.09 + 0.11 * macro, gap);
    // The cell-specific elevation fades to zero at borders, including its slope.
    // Thus a cell identity change cannot create a discontinuity in this term.
    const individual = (d[2] - .5) * interior;
    // Fixed global mapping: NEVER normalize by the min/max of an individual tile.
    const h = .12 + .37 * macro + .28 * crown + .16 * ridges + .17 * individual
      - c.fracture * .19 * fissure * (.45 + macro)
      + c.detail * (.28 * (micro - .5) + .14 * (ledges - .5));
    const original = clamp((h - .10) / .72);
    if (!c.blockiness) return original;
    // Large, nearly planar cellular crowns, with steep angular shoulders and
    // deep common fissures. Cell elevation vanishes with zero slope at the
    // nearest-cell boundary, so differently sized blocks still meet seamlessly.
    const shoulder = smooth(0, .10 + .08 * c.fracture, gap);
    const trench = .08 + .08 * macro;
    const face = .70 + .30 * (d[2] - .5) + .08 * (macro - .5)
      + c.detail * .045 * (micro - .5);
    const block = clamp(mix(trench, face, shoulder));
    return mix(original, block, c.blockiness);
  }
  return Object.freeze({ config: c, height });
}
function validTileCoord(v) {
  if (!Number.isInteger(v) || Math.abs(v) > 1000000)
    throw new RangeError('Tile coordinates must be integers within +/-1,000,000 in this implementation');
}
function generateTile(fieldOrConfig, tileX, tileY) {
  validTileCoord(tileX); validTileCoord(tileY);
  const field = typeof fieldOrConfig?.height === 'function' ? fieldOrConfig : createField(fieldOrConfig);
  const c = field.config, n = c.cells, b = c.border, width = n + 1 + 2 * b;
  const data = new Float32Array(width * width);
  // Integer global sample addresses ensure IDENTICAL boundary arithmetic in both tiles.
  // There are n intervals and n+1 interior vertices; gutters surround that interior.
  const gx0 = tileX * n - b, gy0 = tileY * n - b;
  let k = 0;
  for (let j = 0; j < width; j++) for (let i = 0; i < width; i++)
    data[k++] = field.height((gx0 + i) / n, (gy0 + j) / n);
  return { tileX, tileY, cells: n, border: b, width, data, config: c };
}
function edgeReport(a, b) {
  if (a.cells !== b.cells || a.border !== b.border) throw new Error('Tiles must share sampling settings');
  const dx = b.tileX - a.tileX, dy = b.tileY - a.tileY;
  if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1)))
    throw new Error('Provide the right or upper neighbor as b');
  const n = a.cells, z = a.border, w = a.width; let maxHeight = 0, maxSlope = 0, count = 0;
  function at(t, i, j) { return t.data[(j + z) * w + (i + z)]; }
  for (let q = 0; q <= n; q++) {
    const ai = dx ? n : q, aj = dy ? n : q, bi = dx ? 0 : q, bj = dy ? 0 : q;
    maxHeight = Math.max(maxHeight, Math.abs(at(a, ai, aj) - at(b, bi, bj)));
    // Compare BOTH tangent derivatives using actual neighboring field samples in gutters.
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const da = (at(a, ai + di, aj + dj) - at(a, ai - di, aj - dj)) * n * 0.5;
      const db = (at(b, bi + di, bj + dj) - at(b, bi - di, bj - dj)) * n * 0.5;
      maxSlope = Math.max(maxSlope, Math.abs(da - db));
    }
    count++;
  }
  return { maxHeight, maxSlope, samples: count };
}
function region(fieldOrConfig, x0, y0, tilesX, tilesY, cells) {
  validTileCoord(x0); validTileCoord(y0);
  if (!Number.isInteger(tilesX) || !Number.isInteger(tilesY) || tilesX < 1 || tilesY < 1)
    throw new RangeError('Region dimensions must be positive integer tile counts');
  const field = typeof fieldOrConfig?.height === 'function' ? fieldOrConfig : createField(fieldOrConfig);
  const n = cells ?? field.config.cells;
  if (!Number.isInteger(n) || n < 16 || n > 1024) throw new RangeError('cells must be 16..1024');
  const width = tilesX * n + 1, height = tilesY * n + 1;
  if (width * height > 16777216) throw new RangeError('Export is limited to 16 million samples');
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
    data[y * width + x] = field.height((x0 * n + x) / n, (y0 * n + y) / n);
  return { width, height, data, x0, y0, tilesX, tilesY, cells: n };
}
export { VERSION, DEFAULTS, config, seedFrom, hash, noise, fbm, createField, generateTile, edgeReport, region };
