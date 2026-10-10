/**
 * @module newer/assets/rockfield_bake_format
 *
 * The prepared rock relief format, shared by the baking tool and the game.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 11 places.
 */
// Shared offline/runtime contract. Baking changes neither coordinates nor field
// seeds; prepared tiles are exactly the GPU half-floats produced by the fallback.
export const ROCK_BAKE_VERSION = 'quaked-rockfield-1.2.0-1';
export const ROCK_BAKE_CELLS=64, ROCK_BAKE_BORDER=2, ROCK_BAKE_SIDE=69;
/**
 * Builds the generator configuration for one rock chart: its seed, profile and preset `config` fields, with the
 * fixed tile size forced to `ROCK_BAKE_CELLS` cells and a `ROCK_BAKE_BORDER` border. Used by the offline baker
 * (tools/bake_rockfield.mjs), by runtime CPU preparation (`RockPrepareTiles`) and inside `RockBakeSignature`.
 *
 * @param {{ seed: number, profile: string, config: object }} chart rock chart from `R_RockSurfaceCharts`
 *   (`profile` is 'ground' or 'wall'; `config` is its `R_RockPreset`)
 * @returns {object} a new plain object, safe to post to a rockfield worker; `cells`/`border` override any
 *   same-named preset fields
 */
export function RockBakeConfig(chart){return {seed:chart.seed,profile:chart.profile,...chart.config,cells:ROCK_BAKE_CELLS,border:ROCK_BAKE_BORDER};}
/**
 * Identity string of a chart's baked field: the JSON of its key, seed, generator config and tangent/bitangent
 * axes. A prepared bake stores its tiles under this string, so any change to these inputs makes the stored tiles
 * unreachable for that chart (stale bakes are not reused).
 *
 * @param {{ key: string, seed: number, profile: string, config: object, tangent: Array<number>,
 *   bitangent: Array<number> }} chart rock chart from `R_RockSurfaceCharts`
 * @returns {string} JSON signature used as the chart key in `RockBakeEncode`/`RockBakeDecode`
 */
export function RockBakeSignature(chart){return JSON.stringify([chart.key,chart.seed,RockBakeConfig(chart),chart.tangent,chart.bitangent]);}
/**
 * Lists every tile a chart needs: each surface's chart-space bounds (rock coordinates, one unit per tile) floored
 * to tile indices and grown by a halo of 4 tiles for 'wall' charts or 1 tile otherwise, deduplicated.
 * This order is the contract between baker, encoder and CPU preparation: tiles are written and read in it.
 *
 * @param {{ profile: string, surfaces: Array<{ bounds: Array<number> }> }} chart rock chart; each `bounds` is
 *   `[minU, minV, maxU, maxV]` in rock tile coordinates
 * @returns {Array<Array<number>>} fresh `[x, y]` integer tile pairs, sorted by y then x
 */
export function RockBakeTileCoordinates(chart){
 const tiles=new Map(),halo=chart.profile==='wall'?4:1;
 for(const face of chart.surfaces){const b=face.bounds;
  for(let y=Math.floor(b[1])-halo;y<=Math.floor(b[3])+halo;y++)for(let x=Math.floor(b[0])-halo;x<=Math.floor(b[2])+halo;x++)tiles.set(x+','+y,[x,y]);
 }
 return [...tiles.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}
/**
 * Serialises a prepared rock bake (offline in tools/bake_rockfield.mjs, and in tests). Layout: a little-endian
 * uint32 JSON length, the JSON metadata (identity fields, `version`, `model`, `side`, and per chart its signature
 * and `[x, y, offset]` tile rows), one pad byte when the JSON length is odd, then every tile as little-endian
 * uint16 half-floats of `ROCK_BAKE_SIDE`² samples each, in chart then `RockBakeTileCoordinates` order.
 *
 * @param {string} model BSP model name the bake belongs to (e.g. 'maps/e1m1.bsp'); checked by `RockBakeDecode`
 * @param {Array<object>} charts rock charts, in the same order their tiles appear in `halfTiles`
 * @param {Iterable<ArrayLike<number>>} halfTiles one array of `ROCK_BAKE_SIDE`² half-float bit patterns per
 *   required tile, all charts concatenated
 * @param {object} [identity={}] extra metadata copied into the header first, e.g. `{ bspSha256 }`
 * @returns {Uint8Array} the complete uncompressed bake (the baker gzips it)
 * @throws {Error} 'Invalid baked tile size' when a tile is not `ROCK_BAKE_SIDE`² samples, or 'Incomplete rock
 *   bake' when `halfTiles` does not hold exactly the tiles the charts require
 */
export function RockBakeEncode(model,charts,halfTiles,identity={}){
 let offset=0;
 const metadata={...identity,version:ROCK_BAKE_VERSION,model,side:ROCK_BAKE_SIDE,charts:charts.map(chart=>({signature:RockBakeSignature(chart),tiles:RockBakeTileCoordinates(chart).map(([x,y])=>{const row=[x,y,offset];offset+=ROCK_BAKE_SIDE**2;return row;})}))};
 const json=new TextEncoder().encode(JSON.stringify(metadata)),start=4+json.length+(json.length&1),output=new Uint8Array(start+offset*2),view=new DataView(output.buffer);
 view.setUint32(0,json.length,true);output.set(json,4);let at=start;
 for(const tile of halfTiles){if(tile.length!==ROCK_BAKE_SIDE**2)throw new Error('Invalid baked tile size');for(const value of tile){view.setUint16(at,value,true);at+=2;}}
 if(at!==output.length)throw new Error('Incomplete rock bake');return output;
}
/**
 * Parses and validates a prepared rock bake produced by `RockBakeEncode` before any tile is trusted. Every tile
 * row must be contiguous and in order, every sample a half-float in 0..1 (bits <= 0x3c00), and every sample
 * referenced exactly once.
 *
 * @param {ArrayBuffer} buffer uncompressed bake bytes, 6 B..256 MiB (JSON header at most 8 MiB)
 * @param {string} model BSP model name the caller expects; must equal the header's `model`
 * @param {string} [bspSha256] when given, must equal the header's `bspSha256` (hex SHA-256 of the BSP file)
 * @returns {{ model: string, charts: Map<string, Map<string, Uint16Array>>, data: Uint16Array, bytes: number,
 *   meta: object }} `charts` maps a `RockBakeSignature` to its tiles keyed 'x,y'; each tile is a view into the
 *   shared `data` copy (not into `buffer`); `bytes` is the buffer length and `meta` the parsed header
 * @throws {Error} on a bad length or header, a stale version/model/side ('Stale or mismatched rock bake'), a BSP
 *   identity mismatch, a height above 1.0, an invalid or duplicate chart or tile row, or unreferenced samples;
 *   also a `SyntaxError` from `JSON.parse` when the header is not JSON
 */
export function RockBakeDecode(buffer,model,bspSha256){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<6||buffer.byteLength>256*1024*1024)throw new Error('Invalid rock bake length');
 const view=new DataView(buffer),length=view.getUint32(0,true),start=4+length+(length&1);
 if(length>8*1024*1024||start>buffer.byteLength||(buffer.byteLength-start)%2)throw new Error('Invalid rock bake header');
 const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));
 if(header.version!==ROCK_BAKE_VERSION||header.model!==model||header.side!==ROCK_BAKE_SIDE||!Array.isArray(header.charts))throw new Error('Stale or mismatched rock bake');
 if(bspSha256!==undefined&&header.bspSha256!==bspSha256)throw Error('Rock bake BSP identity mismatch');
 const data=new Uint16Array((buffer.byteLength-start)/2);for(let i=0;i<data.length;i++){const value=view.getUint16(start+i*2,true);if(value>0x3c00)throw new Error('Invalid baked height');data[i]=value;}
 const charts=new Map();let expectedOffset=0;
 for(const chart of header.charts){if(typeof chart.signature!=='string'||charts.has(chart.signature)||!Array.isArray(chart.tiles))throw new Error('Invalid rock bake chart');const tiles=new Map();
  for(const row of chart.tiles){if(!Array.isArray(row)||row.length!==3||!row.every(Number.isSafeInteger)||row[2]!==expectedOffset||row[2]+ROCK_BAKE_SIDE**2>data.length)throw new Error('Invalid rock bake tile');expectedOffset+=ROCK_BAKE_SIDE**2;const key=row[0]+','+row[1];if(tiles.has(key))throw new Error('Duplicate rock bake tile');tiles.set(key,data.subarray(row[2],row[2]+ROCK_BAKE_SIDE**2));}
  charts.set(chart.signature,tiles);
 }
 if(expectedOffset!==data.length)throw new Error('Unreferenced baked heights');return {model,charts,data,bytes:buffer.byteLength,meta:header};
}
