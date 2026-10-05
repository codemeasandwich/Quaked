// Byte oracle was generated once from the retained pre-allocation implementation
// SHA256 59cf94277d294aeb0417a9a5257b48aede7893fc172cd6e3997a466947be37de.
// No old implementation or temporary file is needed to run this regression.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as current from '../src/r_demonrelief.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`);
export const sha=value=>createHash('sha256').update(value).digest('hex');
export function describe(data){if(data===null)return null;return{triangles:data.triangles,topVertexCount:data.topVertexCount,skirtTriangles:data.skirtTriangles,tileRegions:data.tileRegions,arrays:Object.fromEntries(['positions','normals','uvs','lmuvs'].map(k=>[k,{length:data[k].length,sha256:sha(Buffer.from(data[k].buffer,data[k].byteOffset,data[k].byteLength))}]))};}
export function makeCases(){
 const cases=[];
 function add(label,{sampling='clamp',width=8,height=5,depth=9.6,step=1,smoothing=0,u0=-1.2,v0=.25,du=1.6,dv=1.3,basis=0,flags=0,shape='quad',size=20,linked=false,texture='dem4_1'}={}){
  const axes=[[[1,0,0],[0,1,0],[0,0,1]],[[1,0,0],[0,0,1],[0,-1,0]],[[.6,.8,0],[-.48,.36,.8],[.64,-.48,.6]]][basis];
  const field={width,height,data:Float32Array.from({length:width*height},(_,i)=>((i*73+i*i*19+11)%251)/250),sampling,displacement:{depth,step,smoothing}},gl_texture={userData:{newerHeight:field}},t={name:texture,width:16,height:24,gl_texture};
  const xy=shape==='triangle'?[[0,0],[size,0],[0,size*.7]]:shape==='hexagon'?[[0,0],[size,0],[size*1.2,size*.25],[size,size*.7],[size*.2,size],[0,size*.7]]:shape==='degenerate-edge'?[[0,0],[0,0],[size,0],[size,size*.7],[0,size*.7]]:[[0,0],[size,0],[size,size*.7],[0,size*.7]];
  const points=xy.map(([x,y])=>[...axes[0].map((q,k)=>[4,-7,2][k]+q*x+axes[1][k]*y),u0+du*x/size,v0+dv*y/(size*.7),.125+x/320,.25+y/480]);
  const polys={numverts:points.length,verts:Float32Array.from(points.flat()),next:null};if(linked)polys.next={numverts:3,verts:points.slice(0,3).map(p=>p.map((x,k)=>k<3?x+axes[0][k]*size*1.5:x)),next:null};
  const surface={flags,plane:{normal:axes[2],dist:axes[2].reduce((a,n,k)=>a+n*[4,-7,2][k],0)},texinfo:{texture:t,vecs:[axes[0].map(x=>x*16*du/size).concat(13),axes[1].map(x=>x*24*dv/(size*.7)).concat(-19)]},polys};cases.push({label,surface});
 }
 add('clamp-nonsquare-negative-crossings');add('repeat-nonsquare-negative',{sampling:'repeat'});add('clamp-wall-flipped-smoothed',{basis:1,flags:2,smoothing:.4,width:7,height:11,texture:'dem4_4'});add('repeat-oblique-scaled-smoothed',{sampling:'repeat',basis:2,smoothing:.3,width:13,height:6,du:2.5,dv:.35});add('clamp-oblique-triangle',{basis:2,shape:'triangle',depth:24,step:.5,u0:-2,v0:3,du:1,dv:1,texture:'dem5_3'});add('repeat-multiple-polygons',{sampling:'repeat',linked:true,step:4,size:13});add('clamp-hexagon',{shape:'hexagon',u0:.2,v0:.3,du:.7,dv:.5});add('repeat-degenerate-edge',{sampling:'repeat',shape:'degenerate-edge',depth:.1,step:4});add('repeat-count-cap-256',{sampling:'repeat',shape:'triangle',size:180,step:.5});add('clamp-tile-budget-reject',{du:5,dv:5,u0:0,v0:0});add('repeat-closed-skirt-budget-reject',{sampling:'repeat',linked:true,shape:'hexagon',size:512,step:.5});add('unsupported-texture-reject',{texture:'brick01'});add('invalid-depth-reject',{depth:25});add('invalid-step-reject',{step:.25});
 return cases;
}
export function samplerCases(){const fields=[];for(const sampling of ['clamp','repeat'])for(const [width,height]of[[2,3],[7,5]])for(const origin of [[0,0],[-4,7]])fields.push({sampling,width,height,tileOrigin:origin,data:Float32Array.from({length:width*height},(_,i)=>((i*11+7)%29)/28)});const coords=[[-10.125,20.75],[-4,7],[-3,8],[0,0],[1,1],[.03125,.8125],[-.5,1.5],[1.00000001,-.00000001]];return{fields,coords};}
Deno.test('optimized plaque allocation preserves every baseline position, normal, UV, lightmap and closed-skirt metadata byte',()=>{
 const reference=JSON.parse(readFileSync(new URL('./fixtures/demon-allocation-before.json',import.meta.url),'utf8'));
 for(const {label,surface}of makeCases()){
  const before=JSON.stringify(surface),data=current.R_DemonSurfaceData(surface);same(JSON.stringify(describe(data)),JSON.stringify(reference.geometry[label]),label+' exact pre-optimization output');same(JSON.stringify(surface),before,label+' source data unchanged');
  if(data){same(current.R_DemonSurfaceData(surface),data,label+' repeated call reuses exact buffers');same(data.positions.length,data.triangles*9,label+' no uninitialized trailing vertices');same(data.uvs.length,data.triangles*6,label+' no uninitialized trailing UVs');check(data.skirtTriangles>0,label+' closed skirts remain present');for(const k of ['positions','normals','uvs','lmuvs'])check(data[k].every(Number.isFinite),label+' finite '+k);}
 }
});
Deno.test('closure-free bilinear sampler exactly preserves clamp/repeat nonsquare endpoints, negative coordinates and tile origins',()=>{
 const reference=JSON.parse(readFileSync(new URL('./fixtures/demon-allocation-before.json',import.meta.url),'utf8')),{fields,coords}=samplerCases();
 const values=fields.flatMap(f=>coords.map(([u,v])=>current.R_DemonHeight(f,u,v)));same(sha(Buffer.from(new Float64Array(values).buffer)),reference.samplerSHA256,'all64 exact Float64 samples');
 const {surface}=makeCases()[0],data=current.R_DemonSurfaceData(surface),field=surface.texinfo.texture.gl_texture.userData.newerHeight;field.displacement.depth=3.2;check(current.R_DemonSurfaceData(surface)!==data,'changed depth invalidates actual output cache');const next=current.R_DemonSurfaceData(surface);field.displacement.step=4;check(current.R_DemonSurfaceData(surface)!==next,'changed tessellation step invalidates actual output cache');
});
