// Independent effect11 public fixture. Native snapshot captured before implementation; only Canvas2D is doubled.
import * as THREE from 'three';
import {readFileSync,writeFileSync} from './helpers/resource_fs.mjs';
import {createHash} from 'node:crypto';
const root=process.cwd(),load=p=>import(root+'/src/'+p);
const [d,vars,post,mode,client,model]=await Promise.all([load('newer/render/r_decals.js'),load('engine/common/cvar.js'),load('newer/render/gl_post.js'),load('newer/mode.js'),load('engine/client/client.js'),load('engine/render/gl_model.js')]);
const check=(v,m)=>{if(!v)throw Error(m)},eq=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m+': '+JSON.stringify(a)+' != '+JSON.stringify(b));
const scene=new THREE.Scene(),cl=client.cl,noop=()=>{},ctx={createRadialGradient:()=>({addColorStop:noop}),beginPath:noop,arc:noop,fill:noop,moveTo:noop,lineTo:noop,stroke:noop};
globalThis.document={createElement:()=>({getContext:()=>ctx})};
for(const c of [post.r_hdr,d.r_decals])if(!vars.Cvar_FindVar(c.name))vars.Cvar_RegisterVariable(c);
let clock=1000;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>clock*1000}});
const baselinePath=new URL('./fixtures/blood-native-before.json',import.meta.url);
function world(){const wall={flags:0,plane:{normal:[1,0,0],type:0,dist:0},texinfo:{vecs:[[0,1,0,0],[0,0,1,0]]},texturemins:[-128,0],extents:[256,256]};const floor={...wall,plane:{normal:[0,0,1],type:2,dist:0},texinfo:{vecs:[[1,0,0,0],[0,1,0,0]]},texturemins:[0,-128]};const leaf={contents:-1,firstmarksurface:[wall,floor],nummarksurfaces:2},solid={contents:-2};return{leafs:[solid,leaf],nodes:[{contents:0,plane:wall.plane,children:[{contents:0,plane:floor.plane,children:[leaf,solid]},solid]}],hulls:[{planes:[wall.plane,floor.plane],clipnodes:[{planenum:0,children:[1,-2]},{planenum:1,children:[-1,-2]}],firstclipnode:0,lastclipnode:1}],entities:''};}
function reset(){clock+=1000;vars.Cvar_Set('r_hdr','1');vars.Cvar_Set('r_decals','1');mode.R_AnimSetClassicPass(false);cl.worldmodel=world();d.R_DecalsClear();d.R_DecalsSetup({scene,cl:()=>cl,pointInLeaf:model.Mod_PointInLeaf,lightPoint:()=>128});}
const mesh=()=>scene.getObjectByName('quake_decals');
const digest=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function original(){const g=mesh().geometry;return{count:d.R_DecalCount(),position:digest(g.attributes.position.array.subarray(0,384*4*3)),uv:digest(g.attributes.uv.array.subarray(0,384*4*2)),color:digest(g.attributes.color.array.subarray(0,384*4*4))};}
function seeded(fn){const old=Math.random;let state=2121,calls=0;Math.random=()=>{calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};try{fn();return calls}finally{Math.random=old}}
reset();d.R_DecalPlace('blood',[.5,0,64],14,2);d.R_DecalsClear(); // warm atlas/Three UUID allocation outside event RNG
Deno.test('original vertex block, random calls, fade and384-slot overwrite equal pre-change public baseline',()=>{
 const observed=[];reset();let calls=seeded(()=>{for(let i=0;i<384;i++){const kinds=['blood','hole','scorch','drop'];check(d.R_DecalPlace(kinds[i%4],[.5,(i%9)-4,64+(i%5)],i%4===0?14:4,2),'original mark admitted')}});eq(calls,768,'two RNG calls per existing mark');d.R_DecalsFrame();observed.push({phase:'full ring',...original(),calls});
 clock+=91;d.R_DecalsFrame();observed.push({phase:'hole expiry',...original()});clock+=83;d.R_DecalsFrame();observed.push({phase:'blood final fade',...original()});clock+=7;d.R_DecalsFrame();observed.push({phase:'blood expiry',...original()});
 calls=seeded(()=>check(d.R_DecalPlace('blood',[.5,0,70],16,2),'overwrite admitted'));d.R_DecalsFrame();observed.push({phase:'one overwrite',...original(),calls});eq(d.R_DecalCount(),384,'tail does not spend ring slot');
 eq(observed,JSON.parse(readFileSync(baselinePath,'utf8')).observed,'native behavior byte hashes');
});
Deno.test('large wall splash grows one bounded run without changing original geometry or native slot count',()=>{
 reset();const calls=seeded(()=>check(d.R_DecalPlace('blood',[.5,0,64],14,2),'large wall splash'));eq(calls,2,'no added random draws');d.R_DecalsFrame();const before=original(),g=mesh().geometry,body=Array.from(g.attributes.position.array.slice(0,12));
 const tail=()=>Array.from(g.attributes.position.array.slice(384*4*3,384*4*3+12));const first=tail();check(first.length===12,'same mesh has appended tail vertices');clock+=2;d.R_DecalsFrame();const later=tail();check(later.some((v,i)=>v!==first[i]),'tail grows with existing decal clock');eq(original(),before,'original native blocks unchanged while run grows');eq(Array.from(g.attributes.position.array.slice(0,12)),body,'original quad unchanged');eq(d.R_DecalCount(),1,'run shares splash slot');check(later.every(Number.isFinite),'finite tail geometry');
 const zs=later.filter((_,i)=>i%3===2);check(Math.max(...zs)-Math.min(...zs)<=8.01,'tail length at most8 units');check(later.filter((_,i)=>i%3===0).every(v=>Math.abs(v-.3)<1e-5),'tail shares original wall offset');
});
Deno.test('tail visibility follows original lifetime and mode switches, and clear/reuse retains one mesh',()=>{
 reset();d.R_DecalPlace('blood',[.5,0,64],14,2);d.R_DecalsFrame();const m=mesh(),g=m.geometry;check(g.attributes.color.array.length>=384*8*4,'tail color block exists');
 clock+=176;d.R_DecalsFrame();const alpha=g.attributes.color.array[3],tailAlpha=g.attributes.color.array[384*4*4+3];check(alpha>0&&alpha<1,'original is fading');eq(tailAlpha,alpha,'same fade alpha');
 clock+=5;d.R_DecalsFrame();eq(g.attributes.color.array[3],0,'original expires');eq(g.attributes.color.array[384*4*4+3],0,'run expires with original');
 vars.Cvar_Set('r_hdr','0');d.R_DecalsFrame();eq(m.visible,false,'Classic hides mesh');vars.Cvar_Set('r_hdr','1');vars.Cvar_Set('r_decals','0');d.R_DecalsFrame();eq(m.visible,false,'decal off hides run');
 d.R_DecalsClear();eq(d.R_DecalCount(),0,'clear forgets slots');eq(g.drawRange.count,0,'clear draws nothing');vars.Cvar_Set('r_decals','1');d.R_DecalPlace('hole',[.5,0,64],4,2);d.R_DecalsFrame();check(mesh()===m,'same mesh reused');eq(d.R_DecalCount(),1,'one native hole after reuse');
});

Deno.test('small splashes, floors, other decal kinds and missing hull backing never grow a run',()=>{
 const activeTail=()=>{const g=mesh().geometry,a=g.attributes.position.array,c=g.attributes.color.array,o=384*4*3;if(a.length<o+12)return false;const u=[0,1,2].map(i=>a[o+3+i]-a[o+i]),v=[0,1,2].map(i=>a[o+6+i]-a[o+i]);const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);return area>1e-7&&c[384*4*4+3]>0;};
 for(const [kind,p,radius,noHull] of [['blood',[.5,0,64],4,false],['blood',[32,0,.5],14,false],['hole',[.5,0,64],14,false],['scorch',[.5,0,64],14,false],['drop',[.5,0,64],14,false],['blood',[.5,0,64],14,true]]){
  reset();if(noHull)cl.worldmodel.hulls=[];check(d.R_DecalPlace(kind,p,radius,2),'original decal still admitted');clock+=3;d.R_DecalsFrame();check(!activeTail(),'no run for '+JSON.stringify({kind,p,radius,noHull}));eq(d.R_DecalCount(),1,'native count kept');
 }
});

Deno.test('run never bridges a subunit gap in world backing between admission probes',()=>{
 const place=()=>{const old=Math.random;Math.random=()=>.25;try{check(d.R_DecalPlace('blood',[.5,0,64],14,2),'original splash remains')}finally{Math.random=old}};
 reset();place();clock+=6;d.R_DecalsFrame();const oldGeometry=mesh().geometry,o=384*4*3,oldPos=oldGeometry.attributes.position.array;const min=Math.min(...[2,5,8,11].map(i=>oldPos[o+i])),max=Math.max(...[2,5,8,11].map(i=>oldPos[o+i]));check(max-min>0,'control run exists');const middle=min+(max-min)*.55;
 reset();const hull=cl.worldmodel.hulls[0];hull.planes=[{normal:[1,0,0],type:0,dist:0},{normal:[0,0,1],type:2,dist:middle+.1},{normal:[0,0,1],type:2,dist:middle-.1}];hull.clipnodes=[{planenum:0,children:[-1,1]},{planenum:1,children:[-2,2]},{planenum:2,children:[-1,-2]}];hull.lastclipnode=2;
 place();clock+=6;d.R_DecalsFrame();const g=mesh().geometry,a=g.attributes.position.array,c=g.attributes.color.array,z=[a[o+2],a[o+5],a[o+8],a[o+11]];
 const active=c[384*4*4+3]>0&&Math.max(...z)-Math.min(...z)>1e-5;check(!active,'no visible run across0.2-unit open backing gap (tail spans'+Math.min(...z)+'..'+Math.max(...z)+', gapcenter'+middle+')');eq(d.R_DecalCount(),1,'native splash retained');
});

Deno.test('no run grows where the wall below the splash is under water: realism, not gore',()=>{
 const place=()=>{const old=Math.random;Math.random=()=>.25;try{check(d.R_DecalPlace('blood',[.5,0,64],14,2),'original splash remains')}finally{Math.random=old}};
 const o=384*4*3,grown=()=>{const g=mesh().geometry,a=g.attributes.position.array,c=g.attributes.color.array,z=[a[o+2],a[o+5],a[o+8],a[o+11]];return c[384*4*4+3]>0&&Math.max(...z)-Math.min(...z)>1e-5;};
 reset();place();clock+=6;d.R_DecalsFrame();check(grown(),'control: in open air the run grows');
 // the same wall with water up to z 60, just below the splash: the run would lie in it
 reset();const hull=cl.worldmodel.hulls[0];hull.planes=[{normal:[1,0,0],type:0,dist:0},{normal:[0,0,1],type:2,dist:0},{normal:[0,0,1],type:2,dist:60}];hull.clipnodes=[{planenum:0,children:[1,-2]},{planenum:1,children:[2,-2]},{planenum:2,children:[-1,-3]}];hull.lastclipnode=2;
 place();clock+=6;d.R_DecalsFrame();check(!grown(),'no run into the water');eq(d.R_DecalCount(),1,'the splash itself stays as it was');
});
Deno.test('solid polygon proof rejects hidden cross-rail gaps, malformed planes and exhausted traversal',async()=>{
 const {FX_SolidPolygon}=await load('newer/render/fx_world.js');const vertices=[[-.3,-.7,60],[-.3,.7,60],[-.3,.7,52],[-.3,-.7,52]];
 const make=(planes,clipnodes)=>({hulls:[{planes,clipnodes,firstclipnode:0,lastclipnode:clipnodes.length-1}]});
 check(FX_SolidPolygon(make([{normal:[1,0,0],dist:0}],[{planenum:0,children:[-1,-2]}]),vertices),'solid control');
 eq(FX_SolidPolygon(make([{normal:[0,1,0],dist:.4},{normal:[0,1,0],dist:.2}],[{planenum:0,children:[-2,1]},{planenum:1,children:[-1,-2]}]),vertices),false,'gap between all three sample rails refused');
 for(const normal of [[NaN,0,0],[0,0,0],null]){let result;try{result=FX_SolidPolygon(make([{normal,dist:0}],[{planenum:0,children:[-2,-2]}]),vertices)}catch(e){throw Error('malformed normal must fail closed rather than throw: '+e)}eq(result,false,'malformed plane normal '+JSON.stringify(normal));}
 eq(FX_SolidPolygon(make([{normal:[1,0,0],dist:NaN}],[{planenum:0,children:[-2,-2]}]),vertices),false,'NaN plane distance');
 eq(FX_SolidPolygon(make([{normal:[1,0,0],dist:0}],[{planenum:0,children:[0,0]}]),vertices),false,'4096-node cycle cap');
});
