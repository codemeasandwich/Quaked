// Fresh-process persistence witness. No generator is allowed in this process.
import {DisplacementStore} from '../../src/displacement_store.js';
import {DemonBakeDecode} from '../../src/demon_bake_format.js';
import {nativeStorage,recordingLocks} from './opfs_native_fixture.mjs';
const [root,key,model,bsp]=process.argv.slice(2),store=new DisplacementStore(nativeStorage(root),recordingLocks());
const result=await store.ensure(key,{generate:()=>{throw Error('A fresh process must reuse durable files, never generate');},decode:raw=>DemonBakeDecode(raw,model,bsp)});
console.log(JSON.stringify({pid:process.pid,source:result.source,persistence:result.persistence,manifest:result.manifest,records:result.data.records.size,positionBits:Array.from(new Uint32Array(result.data.records.values().next().value.data.positions.buffer))}));
