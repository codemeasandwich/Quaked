import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {nativeStorage,recordingLocks} from './opfs_native_fixture.mjs';
import {customModel,readyCustom} from './custom_displacement_fixture.mjs';
const [root,name,seed]=process.argv.slice(2),three=pathToFileURL(resolve(process.env.QUAKED_THREE_MODULE)).href;
register('data:text/javascript,'+encodeURIComponent("let three;export function initialize(d){three=d.three;}export function resolve(s,c,next){return s==='three'?{url:three,shortCircuit:true}:next(s,c);}"),{data:{three}});
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:nativeStorage(root),locks:recordingLocks()}});
await import('../../src/engine/render/gl_rsurf.js');const api=await import('../../src/newer/assets/r_demonbakes.js'),model=customModel(name,Number(seed)),old=Float32Array.prototype.every;let generatorCalls=0;
Float32Array.prototype.every=function(...args){if(this.length===4){generatorCalls++;throw Error('Fresh process attempted runtime sculpt generation');}return old.apply(this,args);};
try{await readyCustom(api,model);const state=api.R_DemonBakeStatus(),data=api.R_DemonBakeSurface(model.surfaces[0]).data;console.log('CUSTOM_DISK_CHILD '+JSON.stringify({pid:process.pid,state,generatorCalls,positions:Array.from(new Uint32Array(data.positions.buffer)),triangles:data.triangles}));}finally{Float32Array.prototype.every=old;api.R_DemonBakeRelease();}
