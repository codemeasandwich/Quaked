// Test-only OPFS/Web-Locks adapter backed by real temporary filesystem files.
// It models atomic createWritable().close(); production store code is untouched.
import * as fs from 'node:fs/promises';
import {join,basename} from 'node:path';
export function nativeStorage(root,{events=[],hooks={}}={}){
 const record=(op,name)=>events.push({op,name});
 const safe=name=>{if(typeof name!=='string'||name!==basename(name)||name==='.'||name==='..')throw Error('Unsafe test path');return name;};
 async function missing(path){try{return await fs.stat(path);}catch(e){if(e.code==='ENOENT')throw new DOMException('Missing '+basename(path),'NotFoundError');throw e;}}
 function directory(path){return{
  async getDirectoryHandle(name,{create=false}={}){safe(name);const target=join(path,name);if(create)await fs.mkdir(target,{recursive:true});else await missing(target);return directory(target);},
  async getFileHandle(name,{create=false}={}){safe(name);const target=join(path,name);if(!create)await missing(target);return{
   async getFile(){record('getFile',name);await hooks.beforeGetFile?.(name,target);const stat=await missing(target);return{size:hooks.fileSize?.(name,stat.size)??stat.size,async arrayBuffer(){record('read',name);let data=await fs.readFile(target);await hooks.beforeRead?.(name,data);data=await hooks.readTransform?.(name,data)||data;return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}};},
   async createWritable(){record('createWritable',name);await hooks.beforeWriter?.(name);let value,closed=false;const temporary=target+'.writing-'+Math.random().toString(16).slice(2);return{
    async write(bytes){record('write',name);await hooks.beforeWrite?.(name,bytes);value=Buffer.from(bytes);value=await hooks.writeTransform?.(name,value)||value;await fs.writeFile(temporary,value);},
    async close(){record('close',name);await hooks.beforeClose?.(name);await fs.rename(temporary,target);closed=true;await hooks.afterClose?.(name,target);},
    async abort(){record('abort',name);if(!closed)await fs.rm(temporary,{force:true});}
   };}
  };}
 };}
 let attempts=0;return{events,hooks,get attempts(){return attempts;},async getDirectory(){record('getDirectory','root');attempts++;await hooks.beforeOpen?.(attempts);await fs.mkdir(root,{recursive:true});return directory(root);},async persisted(){return hooks.persisted?.()??false;},async persist(){return hooks.persist?.()??true;}};
}
export function recordingLocks(){
 const tails=new Map(),events=[];return{events,request(name,options,fn){events.push({name,mode:options.mode,signal:options.signal});const previous=tails.get(name)||Promise.resolve();let finish;const tail=new Promise(r=>finish=r);tails.set(name,tail);return (async()=>{await previous;try{if(options.signal?.aborted)throw new DOMException('Cancelled waiting lock','AbortError');return await fn();}finally{finish();if(tails.get(name)===tail)tails.delete(name);}})();}};
}
