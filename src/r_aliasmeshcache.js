import {ALIAS_MESH_BAKES} from './alias_mesh_bakes.js';
import {AliasMeshSignature,AliasMeshValidate} from './alias_mesh_format.js';
const cache=new Map();let bytes=0;
function put(key,value){
 if(cache.has(key))bytes-=cache.get(key).bytes;
 const entry={commands:value.commands.slice(),order:value.order.slice()};entry.bytes=key.length*2+entry.commands.byteLength+entry.order.byteLength;
 cache.delete(key);cache.set(key,entry);bytes+=entry.bytes;
 while(cache.size>64||bytes>8*1024*1024){const oldest=cache.keys().next().value;bytes-=cache.get(oldest).bytes;cache.delete(oldest);}
 return entry;
}
export function R_AliasMeshLookup(header){
 const key=AliasMeshSignature(header),existing=cache.get(key);if(existing){cache.delete(key);cache.set(key,existing);return {commands:existing.commands.slice(),order:existing.order.slice()};}
 const record=ALIAS_MESH_BAKES[key];if(!record)return null;
 const entry=put(key,AliasMeshValidate(record,header));return {commands:entry.commands.slice(),order:entry.order.slice()};
}
export function R_AliasMeshRemember(header,commands,order){put(AliasMeshSignature(header),{commands,order});}
export function R_AliasMeshCacheStatus(){return {entries:cache.size,bytes};}
