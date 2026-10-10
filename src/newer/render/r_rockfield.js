/**
 * @module newer/render/r_rockfield
 *
 * The owner's continuous rock relief, streamed onto the world and brush surfaces.
 *
 * Types: exported classes `RockTileCache`.
 *
 * State: no mutable exports; module-level variables `rockPageLimit`, `state`, `lastUpdate`.
 *
 * Errors: catches at 2 places.
 */
// Stream the owner's continuous RockField through the existing world/brush renderer.
// No geometry, albedo or collision data is replaced. Workers are lazy and there
// are only two outstanding jobs, with no unbounded queue.
import * as THREE from 'three';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_NewerGame, r_newer_normals } from './r_anim.js';
import { R_RockSurfaceCharts, R_RockCoordinates } from './r_rocksurfaces.js';
import { R_RockPreset } from '../assets/rockfield_presets.js';
import { RockBakeSource } from '../assets/r_rockbakes.js';
export const r_rockfield = new cvar_t( 'r_rockfield', '1', true );
export const ROCK_CELLS = 64, ROCK_BORDER = 2, ROCK_SIDE = ROCK_CELLS + 1 + 2 * ROCK_BORDER, ROCK_PAGES = 96;
export const ROCK_TABLE_SIZE = 4096, ROCK_PROBES = 2048;
let rockPageLimit=2048;
export function R_RockfieldSetLimits(renderer){
 const gl=renderer?.getContext?.();if(gl)rockPageLimit=Math.max(1,Math.min(2048,gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS)||256));
}
export function R_RockPageHash( id, x, y ) {
 return ( Math.imul( x, 73856093 ) ^ Math.imul( y, 19349663 ) ^ Math.imul( id, 83492791 ) ) & ( ROCK_TABLE_SIZE - 1 );
}
export class RockTileCache {
 constructor( workerFactory = () => new Worker( new URL( '../assets/rockfield_worker.js', import.meta.url ), { type: 'module' } ), { bakeSource = null } = {} ) {
  this.bakeSource=bakeSource;this.generated=0;this.prepared=0;this.capacity=ROCK_PAGES;this.protected=new Set();this.batch=false;this.dirty=false;
  this.workerFactory = workerFactory; this.workers = []; this.pending = new Map(); this.tiles = new Map(); this.failed = new Set(); this.epoch = 0; this.serial = 0; this.access = 0; this.error = null; this.probes = { value: 1 };
  const heights = new Uint16Array( ROCK_SIDE * ROCK_SIDE * ROCK_PAGES );
  heights.fill( THREE.DataUtils.toHalfFloat( .5 ) );
  this.heightTexture = new THREE.DataArrayTexture( heights, ROCK_SIDE, ROCK_SIDE, ROCK_PAGES );
  this.heightTexture.format = THREE.RedFormat; this.heightTexture.type = THREE.HalfFloatType;
  this.heightTexture.minFilter = this.heightTexture.magFilter = THREE.LinearFilter; this.heightTexture.generateMipmaps = false; this.heightTexture.needsUpdate = true;
  this.table = new Float32Array( ROCK_TABLE_SIZE * 4 );
  this.pageTexture = new THREE.DataTexture( this.table, 64, ROCK_TABLE_SIZE/64, THREE.RGBAFormat, THREE.FloatType );
  this.pageTexture.minFilter = this.pageTexture.magFilter = THREE.NearestFilter; this.pageTexture.generateMipmaps = false; this.pageTexture.needsUpdate = true;
 }
 start() {
  if ( this.error || this.workers.length ) return;
  try {
   for ( let i = 0; i < 2; i ++ ) {
    const worker = this.workerFactory(), slot = { worker, job: null }; this.workers.push( slot );
    worker.onmessage = e => this.complete( slot, e.data );
    worker.onerror = e => { this.error = e.message || 'RockField worker failed'; this.cancelWorkers(); };
   }
  } catch ( error ) { this.error = String( error.message || error ); this.cancelWorkers(); }
 }
 cancelWorkers() {
  for ( const slot of this.workers ) slot.worker.terminate();
  this.workers.length = 0; this.pending.clear(); this.epoch ++;
 }
 request( chart, x, y ) {
  const key = chart.id + ':' + x + ',' + y;
  const tile = this.tiles.get( key );
  if ( tile ) { tile.used = ++ this.access; return true; }
  if ( this.pending.has( key ) || this.failed.has( key ) ) return false;
  if(['loading','error','unprepared'].includes(this.bakeSource?.status))return false;
  const prepared=this.bakeSource?.tile(chart,x,y);
  if(prepared){const installed=this.install({key,chart,x,y,epoch:this.epoch},prepared,true);if(installed)this.prepared++;return installed;}
  this.start(); if ( this.error ) return false; const slot = this.workers.find( s => ! s.job );
  if ( ! slot ) return false;
  const job = { key, chart, x, y, id: ++ this.serial, epoch: this.epoch };
  this.generated++;
  slot.job = job; this.pending.set( key, job );
  try { slot.worker.postMessage( { id: job.id, x, y, config: { seed: chart.seed, profile: chart.profile, ...( chart.config || R_RockPreset( chart.name, chart.profile ) ), cells: ROCK_CELLS, border: ROCK_BORDER } } ); }
  catch ( error ) { this.error = String( error.message || error ); this.cancelWorkers(); }
  return false;
 }
 complete( slot, message ) {
  const job = slot.job;
  if ( ! job || job.id !== message.id || job.epoch !== this.epoch ) return;
  slot.job = null; this.pending.delete( job.key );
  if ( message.error ) { this.failed.add( job.key ); this.error = message.error; return; }
  const result = message.result;
  if ( result?.width !== ROCK_SIDE || result.data?.length !== ROCK_SIDE ** 2 || result.tileX !== job.x || result.tileY !== job.y ||
   Array.from( result.data ).some( h => ! Number.isFinite( h ) || h < 0 || h > 1 ) ) { this.failed.add( job.key ); return; }
  this.install(job,result.data,false);
 }
 install(job,heights,prepared){
  let page = this.tiles.size;
  if ( page === this.capacity ) {
   let oldest;
   for ( const tile of this.tiles.values() ) if(!this.protected.has(tile.key)&&(!oldest||tile.used<oldest.used))oldest=tile;
   if(!oldest)return false;
   page = oldest.page; this.tiles.delete( oldest.key );
  }
  const data = this.heightTexture.image.data, offset = page * ROCK_SIDE ** 2;
  if(prepared)data.set(heights,offset);
  else for(let i=0;i<heights.length;i++)data[offset+i]=THREE.DataUtils.toHalfFloat(heights[i]);
  this.heightTexture.addLayerUpdate( page ); this.heightTexture.needsUpdate = true;
  this.tiles.set( job.key, { ...job, page, used: ++ this.access } );if(this.batch)this.dirty=true;else this.rebuildTable();return true;
 }
 grow(required){
  const capacity=Math.min(rockPageLimit,Math.max(this.capacity,required));if(capacity===this.capacity)return;
  const old=this.heightTexture,data=new Uint16Array(ROCK_SIDE**2*capacity);data.fill(THREE.DataUtils.toHalfFloat(.5));data.set(old.image.data);
  const texture=new THREE.DataArrayTexture(data,ROCK_SIDE,ROCK_SIDE,capacity);texture.format=THREE.RedFormat;texture.type=THREE.HalfFloatType;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  this.heightTexture=texture;this.capacity=capacity;old.dispose();
 }
 rebuildTable() {
  this.table.fill( 0 ); this.probes.value = 1;
  for ( const tile of this.tiles.values() ) {
   const hash = R_RockPageHash( tile.chart.id, tile.x, tile.y );
   for ( let p = 0; p < ROCK_PROBES; p ++ ) {
    const index = ( ( hash + p ) & ( ROCK_TABLE_SIZE - 1 ) ) * 4;
    if ( this.table[ index + 3 ] !== 0 ) continue;
    this.table.set( [ tile.x, tile.y, tile.chart.id, tile.page + 1 ], index ); this.probes.value = Math.max( this.probes.value, p + 1 ); break;
   }
  }
  this.pageTexture.needsUpdate = true;
 }
 dispose() { this.cancelWorkers(); this.bakeSource?.dispose?.(); this.tiles.clear(); this.heightTexture.dispose(); this.pageTexture.dispose(); }
}
let state = null, lastUpdate = - Infinity;
const dummy = new THREE.DataTexture( new Float32Array( 4 ), 1, 1, THREE.RGBAFormat, THREE.FloatType ); dummy.needsUpdate = true;
const dummyHeight = new THREE.DataArrayTexture( new Uint16Array( [ THREE.DataUtils.toHalfFloat( .5 ) ] ), 1, 1, 1 ); dummyHeight.format = THREE.RedFormat; dummyHeight.type = THREE.HalfFloatType; dummyHeight.needsUpdate = true;
export const rockUniforms = { qrRockPages: { value: dummy }, qrRockHeights: { value: dummyHeight }, qrRockOn: { value: 0 }, qrRockProbes: { value: 1 }, qrRockSun: { value: new THREE.Vector3( -.28, -.18, .94 ).normalize() } };
export function R_RockfieldBuild( model ) {
 state?.cache?.dispose();if(!state?.cache)state?.bakeSource?.dispose(); const fields = R_RockSurfaceCharts( model, { includeBrushes: true } );
 const bakeSource=new RockBakeSource(model,fields.charts);
 state = { model, ...fields, bakeSource, brushEntries: new WeakMap(), cache: fields.charts.length ? new RockTileCache(undefined,{bakeSource}) : null };
 for ( const chart of fields.charts ) for ( const face of chart.surfaces ) if ( face.brush ) state.brushEntries.set( face.surface, { face, chart } );
 rockUniforms.qrRockPages.value = state.cache?.pageTexture || dummy; rockUniforms.qrRockHeights.value = state.cache?.heightTexture || dummyHeight;
 rockUniforms.qrRockProbes = state.cache?.probes || { value: 1 };
 rockUniforms.qrRockOn.value = 0; lastUpdate = - Infinity; return fields;
}
export function R_RockfieldChart( surface ) { return state?.bySurface.get( surface ); }
export function R_RockfieldGeometry( geometry, surface ) {
 const chart = state?.bySurface.get( surface );
 if ( ! chart ) return false;
 const p = geometry.getAttribute( 'position' ), uv = new Float32Array( p.count * 2 ), info = new Float32Array( p.count * 2 ), bounds = new Float32Array( p.count * 4 ), wall = new Float32Array( p.count ), warp = new Float32Array( p.count * 2 );
 for ( let i = 0; i < p.count; i ++ ) {
  uv.set( R_RockCoordinates( chart, [ p.getX( i ), p.getY( i ), p.getZ( i ) ] ), i * 2 );
  wall[ i ] = chart.profile === 'wall' ? 1 : 0;
  // Stable map/material seed, independent of component order and page residency.
  warp.set( [ chart.seed & 65535, chart.name === 'bricka2_2' && chart.profile === 'wall' ? .20 : 0 ], i * 2 );
  info.set( [ chart.id, chart.amplitude ], i * 2 ); bounds.set( chart.bounds, i * 4 );
 }
 geometry.setAttribute( 'rockWarp', new THREE.BufferAttribute( warp, 2 ) );
 geometry.setAttribute( 'rockWall', new THREE.BufferAttribute( wall, 1 ) ); geometry.setAttribute( 'rockUv', new THREE.BufferAttribute( uv, 2 ) ); geometry.setAttribute( 'rockInfo', new THREE.BufferAttribute( info, 2 ) ); geometry.setAttribute( 'rockBounds', new THREE.BufferAttribute( bounds, 4 ) );
 return true;
}
// Preserve a moving brush's material/rest-space field. At its closed pose it
// exactly matches the adjacent world; movement carries that detail with the rock.
// The world scheduler consumes these marks on this/next frame, after entity draw.
export function R_RockfieldBrushSeen( model, group, origin, frame ) {
 if ( ! state || ! R_NewerGame() || r_newer_normals.value === 0 || r_rockfield.value <= 0 ) return 0;
 group.updateMatrixWorld( true );
 const localEye = new THREE.Vector3( ...origin ).applyMatrix4( group.matrixWorld.clone().invert() );
 const first = model.firstmodelsurface || 0, last = first + ( model.nummodelsurfaces || 0 );
 let marked = 0;
 for ( let i = first; i < last; i ++ ) {
  const entry = state.brushEntries.get( model.surfaces[ i ] ); if ( ! entry ) continue;
  const { face, chart } = entry;
  face.brushSeen = frame; face.brushEye = R_RockCoordinates( chart, localEye.toArray() );
  face.brushDistance = new THREE.Vector3( ...face.center ).applyMatrix4( group.matrixWorld ).distanceTo( new THREE.Vector3( ...origin ) ); marked ++;
 }
 return marked;
}
export function R_RockfieldUpdate( origin, frame, now = performance.now() ) {
 const active = R_NewerGame() && r_newer_normals.value !== 0 && r_rockfield.value > 0;
 rockUniforms.qrRockOn.value = active ? Math.min( 1, r_rockfield.value ) : 0;
 if ( ! active || ! state?.cache || now - lastUpdate < 100 ) return;
 lastUpdate = now;
 const candidates=new Map();
 for(const chart of state.charts)for(const face of chart.surfaces){
  const visible=face.brush?face.brushSeen===frame||face.brushSeen===frame-1:face.surface.visframe===frame;
  // Unseen brush faces have no transformed distance yet. Treat them as
  // distant until the public draw hook marks them; undefined passes >512.
  let distance=face.brush?(face.brushDistance??Infinity):Infinity;
  if(!face.brush){
   if(!face.worldBounds){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let polygon=face.surface.polys;polygon;polygon=polygon.next)for(let i=0;i<polygon.numverts;i++)for(let k=0;k<3;k++){const value=polygon.verts instanceof Float32Array?polygon.verts[i*7+k]:polygon.verts[i][k];lo[k]=Math.min(lo[k],value);hi[k]=Math.max(hi[k],value);}face.worldBounds={lo,hi};}
   distance=Math.hypot(...origin.map((v,k)=>Math.max(face.worldBounds.lo[k]-v,0,v-face.worldBounds.hi[k])));
  }
  if(!visible&&distance>512)continue;
  const b=face.bounds,halo=chart.profile==='wall'?4:1;
  for(let y=Math.floor(b[1])-halo;y<=Math.floor(b[3])+halo;y++)for(let x=Math.floor(b[0])-halo;x<=Math.floor(b[2])+halo;x++){
   const interior=x>=Math.floor(b[0])&&x<=Math.floor(b[2])&&y>=Math.floor(b[1])&&y<=Math.floor(b[3]);
   const priority=(visible?0:2)+(interior?0:1),key=chart.id+':'+x+','+y,old=candidates.get(key);
   if(!old||priority<old.priority)candidates.set(key,{key,chart,x,y,priority});
  }
 }
 const cache=state.cache,ordered=[...candidates.values()].sort((a,b)=>a.priority-b.priority||a.chart.id-b.chart.id||a.y-b.y||a.x-b.x);
 cache.grow(ordered.length);rockUniforms.qrRockHeights.value=cache.heightTexture;
 const wanted=ordered.slice(0,cache.capacity);cache.protected=new Set(wanted.map(c=>c.key));cache.batch=true;
 try{for(const c of wanted)cache.request(c.chart,c.x,c.y);}finally{cache.batch=false;if(cache.dirty){cache.dirty=false;cache.rebuildTable();}}
 state.desired=ordered.length;state.overflow=Math.max(0,ordered.length-cache.capacity);state.missing=wanted.filter(c=>!cache.tiles.has(c.key)).length;state.failedVisible=wanted.filter(c=>cache.failed.has(c.key)).length;

}
export function R_RockfieldStatus() { return { enabled:R_NewerGame()&&r_newer_normals.value!==0&&r_rockfield.value>0, charts: state?.charts.length || 0, resident: state?.cache?.tiles.size || 0, pending: state?.cache?.pending.size || 0, failedTiles:state?.cache?.failed.size||0, failedVisibleTiles:state?.failedVisible||0, maxPages: state?.cache?.capacity||ROCK_PAGES, pageLimit:rockPageLimit, desiredTiles:state?.desired||0, missingVisibleTiles:state?.missing||0, overflowTiles:state?.overflow||0, error: state?.cache?.error || null, active: rockUniforms.qrRockOn.value > 0, preparedState:state?.bakeSource?.status||'none', preparedTiles:state?.cache?.prepared||0, generatedTiles:state?.cache?.generated||0, preparedError:state?.bakeSource?.entry?.error||null }; }
