// Shared offline/runtime contract. Baking changes neither coordinates nor field
// seeds; prepared tiles are exactly the GPU half-floats produced by the fallback.
export const ROCK_BAKE_VERSION = 'quaked-rockfield-1.2.0-1';
export const ROCK_BAKE_CELLS=64, ROCK_BAKE_BORDER=2, ROCK_BAKE_SIDE=69;
export function RockBakeConfig(chart){return {seed:chart.seed,profile:chart.profile,...chart.config,cells:ROCK_BAKE_CELLS,border:ROCK_BAKE_BORDER};}
export function RockBakeSignature(chart){return JSON.stringify([chart.key,chart.seed,RockBakeConfig(chart),chart.tangent,chart.bitangent]);}
export function RockBakeTileCoordinates(chart){
 const tiles=new Map(),halo=chart.profile==='wall'?4:1;
 for(const face of chart.surfaces){const b=face.bounds;
  for(let y=Math.floor(b[1])-halo;y<=Math.floor(b[3])+halo;y++)for(let x=Math.floor(b[0])-halo;x<=Math.floor(b[2])+halo;x++)tiles.set(x+','+y,[x,y]);
 }
 return [...tiles.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}
export function RockBakeEncode(model,charts,halfTiles){
 let offset=0;
 const metadata={version:ROCK_BAKE_VERSION,model,side:ROCK_BAKE_SIDE,charts:charts.map(chart=>({signature:RockBakeSignature(chart),tiles:RockBakeTileCoordinates(chart).map(([x,y])=>{const row=[x,y,offset];offset+=ROCK_BAKE_SIDE**2;return row;})}))};
 const json=new TextEncoder().encode(JSON.stringify(metadata)),start=4+json.length+(json.length&1),output=new Uint8Array(start+offset*2),view=new DataView(output.buffer);
 view.setUint32(0,json.length,true);output.set(json,4);let at=start;
 for(const tile of halfTiles){if(tile.length!==ROCK_BAKE_SIDE**2)throw new Error('Invalid baked tile size');for(const value of tile){view.setUint16(at,value,true);at+=2;}}
 if(at!==output.length)throw new Error('Incomplete rock bake');return output;
}
export function RockBakeDecode(buffer,model){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<6||buffer.byteLength>256*1024*1024)throw new Error('Invalid rock bake length');
 const view=new DataView(buffer),length=view.getUint32(0,true),start=4+length+(length&1);
 if(length>8*1024*1024||start>buffer.byteLength||(buffer.byteLength-start)%2)throw new Error('Invalid rock bake header');
 const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length)));
 if(header.version!==ROCK_BAKE_VERSION||header.model!==model||header.side!==ROCK_BAKE_SIDE||!Array.isArray(header.charts))throw new Error('Stale or mismatched rock bake');
 const data=new Uint16Array((buffer.byteLength-start)/2);for(let i=0;i<data.length;i++){const value=view.getUint16(start+i*2,true);if(value>0x3c00)throw new Error('Invalid baked height');data[i]=value;}
 const charts=new Map();let expectedOffset=0;
 for(const chart of header.charts){if(typeof chart.signature!=='string'||charts.has(chart.signature)||!Array.isArray(chart.tiles))throw new Error('Invalid rock bake chart');const tiles=new Map();
  for(const row of chart.tiles){if(!Array.isArray(row)||row.length!==3||!row.every(Number.isSafeInteger)||row[2]!==expectedOffset||row[2]+ROCK_BAKE_SIDE**2>data.length)throw new Error('Invalid rock bake tile');expectedOffset+=ROCK_BAKE_SIDE**2;const key=row[0]+','+row[1];if(tiles.has(key))throw new Error('Duplicate rock bake tile');tiles.set(key,data.subarray(row[2],row[2]+ROCK_BAKE_SIDE**2));}
  charts.set(chart.signature,tiles);
 }
 if(expectedOffset!==data.length)throw new Error('Unreferenced baked heights');return {model,charts,data,bytes:buffer.byteLength};
}
