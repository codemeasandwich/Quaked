// Independent triangle-order/cell/bounds oracle through public geometry APIs.
// No renderer or GPU allocation is required; source attributes stay borrowed.
import * as THREE from 'three';
import {PointShadowAtlas,POINT_SHADOW_CELL_UNITS} from '../src/r_pointshadows.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/newer/render/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),buffer=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
export function chunkCases(){
 const coordinates=Float32Array.from({length:180*3},(_,i)=>i%3===0?((i*71)%2000)-1000:i%3===1?((i*43)%1100)-550:((i*31)%800)-400),a=new THREE.BufferGeometry();a.setAttribute('position',new THREE.BufferAttribute(coordinates,3));
 const b=a.clone(),indices=Array.from({length:180},(_,i)=>(179-i));indices.splice(18,3,1,1,1);b.setIndex(new THREE.Uint16BufferAttribute(indices,1));
 const c=new THREE.BufferGeometry(),wide=new Float32Array(65539*3);for(let i=0;i<wide.length;i++)wide[i]=((i*29)%4096)-2048;c.setAttribute('position',new THREE.BufferAttribute(wide,3));c.setIndex(new THREE.Uint32BufferAttribute([65538,65537,65536,5,9,13,65538,5,65536,17,3,19],1));
 const storage=new THREE.InterleavedBuffer(new Float32Array(180*5),5),d=new THREE.BufferGeometry();for(let i=0;i<180;i++){storage.array.set([91,...coordinates.subarray(i*3,i*3+3),-37],i*5);}d.setAttribute('position',new THREE.InterleavedBufferAttribute(storage,3,1));d.setIndex(new THREE.Uint16BufferAttribute(indices,1));
 const e=new THREE.BufferGeometry(),signed=Int16Array.from(coordinates,v=>Math.max(-32768,Math.min(32767,Math.round(v*31))));signed[0]=-32768;signed[1]=32767;e.setAttribute('position',new THREE.BufferAttribute(signed,3,true));e.setIndex(new THREE.Uint16BufferAttribute(indices,1));
 const normalizedStorage=new THREE.InterleavedBuffer(new Int16Array(180*5),5),f=new THREE.BufferGeometry();for(let i=0;i<180;i++)normalizedStorage.array.set([37,...signed.subarray(i*3,i*3+3),-91],i*5);f.setAttribute('position',new THREE.InterleavedBufferAttribute(normalizedStorage,3,1,true));f.setIndex(new THREE.Uint16BufferAttribute(indices,1));
 return [['nonindexed',a],['indexed-16bit-reordered-degenerate',b],['indexed-32bit-large-source',c],['interleaved-offset',d],['normalized-signed-int16',e],['normalized-interleaved-offset',f]];
}
export function chunkDescription(atlas){return atlas.chunks.map(c=>({indices:Array.from(c.geometry.index.array),min:c.geometry.boundingBox.min.toArray(),max:c.geometry.boundingBox.max.toArray(),sphere:[...c.geometry.boundingSphere.center.toArray(),c.geometry.boundingSphere.radius]}));}
Deno.test('point chunk direct writes preserve source corner order, first-seen cell order and full-vertex bounds for indexed, interleaved and normalized buffers',()=>{
 for(const [label,g]of chunkCases()){
  const p=g.getAttribute('position'),ix=g.index,count=ix?.count||p.count,groups=new Map(),source=p.isInterleavedBufferAttribute?p.data.array:p.array,original=buffer(source).toString('hex');let disposed=0;g.addEventListener('dispose',()=>disposed++);
  for(let corner=0;corner<count;corner+=3){const ids=[0,1,2].map(k=>ix?ix.getX(corner+k):corner+k),points=ids.map(i=>new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i))),key=[0,1,2].map(axis=>Math.floor(points.reduce((sum,v)=>sum+v.getComponent(axis),0)/(3*POINT_SHADOW_CELL_UNITS))).join(',');let group=groups.get(key);if(!group){group={indices:[],box:new THREE.Box3()};groups.set(key,group);}group.indices.push(...ids);for(const point of points)group.box.expandByPoint(point);}
  const atlas=new PointShadowAtlas(g);try{same(atlas.triangles,count/3,label+' triangle count');same(atlas.chunks.length,groups.size,label+' exact cell count');let i=0;for(const expected of groups.values()){const actual=atlas.chunks[i++],sphere=expected.box.getBoundingSphere(new THREE.Sphere());same(actual.geometry.getAttribute('position'),p,label+' original position attribute borrowed');check(buffer(actual.geometry.index.array).equals(buffer(new Uint32Array(expected.indices))),label+' each source corner in original group order');same(JSON.stringify(actual.geometry.boundingBox.toArray?.()||[actual.geometry.boundingBox.min.toArray(),actual.geometry.boundingBox.max.toArray()]),JSON.stringify([expected.box.min.toArray(),expected.box.max.toArray()]),label+' bounds cover complete triangle, not centroid cell');same(JSON.stringify([...actual.geometry.boundingSphere.center.toArray(),actual.geometry.boundingSphere.radius]),JSON.stringify([...sphere.center.toArray(),sphere.radius]),label+' exact enclosing sphere');}
   const chunks=atlas.chunks.slice();atlas.setGeometry(g);check(chunks.every((m,i)=>m===atlas.chunks[i]),label+' identical geometry retains existing chunks');atlas.setGeometry(null);same(disposed,0,label+' clearing chunks never disposes borrowed source');same(buffer(source).toString('hex'),original,label+' source vertex bytes unchanged');
  }finally{atlas.dispose();same(disposed,0,label+' atlas disposal cannot own original geometry');g.dispose();}
 }
});
Deno.test('public sun occluder retains original fan order across linked polygons and excludes sky/liquid backing',()=>{
 if(!vars.Cvar_FindVar(post.r_hdr.name))vars.Cvar_RegisterVariable(post.r_hdr);const saved=post.r_hdr.string;vars.Cvar_SetValue('r_hdr',0);anim.R_AnimSetClassicPass(false);
 const poly=points=>({numverts:points.length,verts:points.map(p=>[...p,0,0,0,0]),next:null}),first=poly([[1,2,3],[11,2,3],[11,12,3],[1,12,3]]);first.next=poly([[-9,-8,-7],[-4,-8,-7],[-9,-3,-7]]);const second=poly([[20,21,22],[23,24,25],[26,27,28]]);second.verts=Float32Array.from(second.verts.flat());const model={surfaces:[{flags:0,polys:first},{flags:4,polys:poly([[90,0,0],[91,0,0],[90,1,0]])},{flags:16,polys:poly([[0,90,0],[0,91,0],[1,90,0]])},{flags:0,polys:second}],firstmodelsurface:0,nummodelsurfaces:4};
 const expected=new Float32Array([1,2,3,11,2,3,11,12,3,1,2,3,11,12,3,1,12,3,-9,-8,-7,-4,-8,-7,-9,-3,-7,20,21,22,23,24,25,26,27,28]),set=THREE.BufferGeometry.prototype.setAttribute;let actual;
 THREE.BufferGeometry.prototype.setAttribute=function(name,attribute){if(name==='position')actual=attribute.array;return set.call(this,name,attribute);};
 try{same(post.R_BuildSunOccluder(model),4,'exact original backing triangle count');check(actual&&buffer(actual).equals(buffer(expected)),'actual public sun output matches literal retained fan/linked-surface order byte for byte');same(post.R_BuildSunOccluder({surfaces:[]}),0,'empty replacement has no stale occluder');}
 finally{THREE.BufferGeometry.prototype.setAttribute=set;post.R_BuildSunOccluder(null);vars.Cvar_Set('r_hdr',saved);}
});
