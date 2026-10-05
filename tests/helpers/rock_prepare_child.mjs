import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {nativeStorage,recordingLocks} from './opfs_native_fixture.mjs';
import {rockModel,rockCharts} from './rock_prepare_fixture.mjs';
import {DisplacementStore} from '../../src/displacement_store.js';
const three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE)).href;
register('data:text/javascript,'+encodeURIComponent("let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}"),{data:{three}});
await import('../../src/gl_rsurf.js');const {RockBakeSource}=await import('../../src/r_rockbakes.js');let workers=0;
const charts=rockCharts(),source=new RockBakeSource(rockModel(),charts,undefined,{store:new DisplacementStore(nativeStorage(process.argv[2]),recordingLocks()),workerFactory:()=>{workers++;throw Error('Fresh process must not generate a cached rock tile');}});
try{await source.entry.promise;if(source.status!=='ready')throw Error(source.entry.error);console.log('ROCK_DISK_CHILD '+JSON.stringify({pid:process.pid,status:source.status,source:source.entry.source,workers,charts:source.entry.data.charts.size,sha256:createHash('sha256').update(new Uint8Array(source.entry.data.data.buffer)).digest('hex')}));}finally{source.dispose();}
