// Bounded positional PAK reads for offline preparation. Never retain/copy the
// entire owned archive merely to prepare one BSP. Last supplied pack wins.
import {open,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function pakDirectory(path){
 const file=await open(path,'r');
 try{
  const archiveBytes=(await file.stat()).size,header=Buffer.alloc(12);
  if((await file.read(header,0,12,0)).bytesRead!==12||header.toString('ascii',0,4)!=='PACK')throw Error('Invalid PAK '+path);
  const start=header.readUInt32LE(4),length=header.readUInt32LE(8);
  if(length%64||length>16*1024*1024||start+length>archiveBytes)throw Error('Invalid PAK directory '+path);
  const bytes=Buffer.alloc(length);if((await file.read(bytes,0,length,start)).bytesRead!==length)throw Error('Truncated PAK directory');
  const entries=new Map();
  for(let at=0;at<length;at+=64){const text=bytes.subarray(at,at+56),end=text.indexOf(0),name=text.subarray(0,end<0?56:end).toString('ascii').toLowerCase();
   const offset=bytes.readUInt32LE(at+56),size=bytes.readUInt32LE(at+60);
   if(offset+size>archiveBytes||entries.has(name))throw Error('Invalid PAK member '+name);
   entries.set(name,{path,name,offset,size});
  }
  return entries;
 }finally{await file.close();}
}
export async function readMember(entry){
 if(entry.loose)return readFile(entry.path);
 const file=await open(entry.path,'r');try{const bytes=Buffer.alloc(entry.size);if((await file.read(bytes,0,entry.size,entry.offset)).bytesRead!==entry.size)throw Error('Truncated PAK member '+entry.name);return bytes;}finally{await file.close();}
}
export async function memberSearch(paths){const entries=new Map();for(const path of paths)for(const [name,entry] of await pakDirectory(path))entries.set(name,entry);return entries;}
export function isolatedPack(name,bytes){return {filename:'prepared:'+name,files:[{name,filepos:0,filelen:bytes.length}],data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};}
