/**
 * @module newer/assets/rockfield_prepare
 *
 * Preparing a level's whole rock relief on the CPU, with at most two workers.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 2 places; catches at 2 places.
 */
// Complete CPU coverage is prepared independently of the bounded GPU page LRU.
// At most two generator workers run, and every required chart/coordinate is
// retained and persisted before a new named map can become playable.
import * as THREE from 'three';
import {RockBakeConfig,RockBakeTileCoordinates,ROCK_BAKE_SIDE} from './rockfield_bake_format.js';
/**
 * Generates every tile all `charts` require on the CPU, using at most two rockfield workers that each process
 * one job at a time, and converts the results to GPU half-floats. Complete coverage is prepared independently of
 * the bounded GPU page LRU; the caller retains and persists the result before a new named map becomes playable.
 * All workers created here are terminated when it settles, on success, failure or abort.
 *
 * @param {Array<object>} charts rock charts from `R_RockSurfaceCharts`; jobs follow `RockBakeTileCoordinates`
 *   order per chart, and the input is not modified
 * @param {{ signal?: AbortSignal, workerFactory?: function(): Worker }} [options] `signal` cancels the
 *   preparation; `workerFactory` creates a worker that answers `{ id, config, x, y }` with
 *   `{ id, result: { width, tileX, tileY, data } }` or `{ id, error }` (default: a module Worker running
 *   ./rockfield_worker.js)
 * @returns {Promise<Array<Uint16Array>>} one tile of `ROCK_BAKE_SIDE`² half-float bit patterns per job, in job
 *   order (the same order `RockBakeEncode` expects); an empty array when no tile is needed
 * @throws {Error} (as a rejection) 'Complete rock preparation exceeds CPU payload budget', before any worker
 *   starts, when the tiles would exceed 256 MiB; rejects with the worker's error, 'Rock worker identity
 *   mismatch', or 'Invalid complete rock tile' when a reply has the wrong size, coordinates or a sample outside
 *   0..1
 * @throws {DOMException} an 'AbortError' when `signal` is or becomes aborted
 */
export async function RockPrepareTiles(charts,{signal,workerFactory=()=>new Worker(new URL('./rockfield_worker.js',import.meta.url),{type:'module'})}={}){
 const jobs=charts.flatMap(chart=>RockBakeTileCoordinates(chart).map(([x,y])=>({config:RockBakeConfig(chart),x,y}))),tiles=new Array(jobs.length);
 if(jobs.length*ROCK_BAKE_SIDE**2*2>256*1024*1024)throw Error('Complete rock preparation exceeds CPU payload budget');
 if(signal?.aborted)throw new DOMException('Rock preparation cancelled','AbortError');
 if(!jobs.length)return tiles;
 let next=0;const workers=[];
 try{
  await Promise.all(Array.from({length:Math.min(2,jobs.length)},()=>new Promise((ok,fail)=>{
   let worker,active;
   const cleanup=()=>signal?.removeEventListener('abort',abort);
   const error=e=>{cleanup();fail(e instanceof Error?e:Error(e.message||'Rock worker failed'));};
   const abort=()=>error(new DOMException('Rock preparation cancelled','AbortError'));
   const dispatch=()=>{if(signal?.aborted){abort();return;}if(next===jobs.length){cleanup();ok();return;}active=next++;worker.postMessage({id:active,...jobs[active]});};
   try{worker=workerFactory();workers.push(worker);signal?.addEventListener('abort',abort,{once:true});worker.onerror=error;
    worker.onmessage=({data})=>{
     if(data.id!==active||data.error){error(Error(data.error||'Rock worker identity mismatch'));return;}
     const result=data.result,job=jobs[active];
     if(result?.width!==ROCK_BAKE_SIDE||result.tileX!==job.x||result.tileY!==job.y||result.data?.length!==ROCK_BAKE_SIDE**2||!result.data.every(v=>Number.isFinite(v)&&v>=0&&v<=1)){error(Error('Invalid complete rock tile'));return;}
     tiles[active]=Uint16Array.from(result.data,v=>THREE.DataUtils.toHalfFloat(v));try{dispatch();}catch(e){error(e);}
    };dispatch();
   }catch(e){error(e);}
  })));
  return tiles;
 }finally{for(const worker of workers)worker.terminate();}
}
