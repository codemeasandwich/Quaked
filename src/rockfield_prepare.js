// Complete CPU coverage is prepared independently of the bounded GPU page LRU.
// At most two generator workers run, and every required chart/coordinate is
// retained and persisted before a new named map can become playable.
import * as THREE from 'three';
import {RockBakeConfig,RockBakeTileCoordinates,ROCK_BAKE_SIDE} from './newer/assets/rockfield_bake_format.js';
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
