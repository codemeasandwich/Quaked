// Native-only is a verified generator outcome, never a synonym for corrupt or
// missing prepared data. These public tests retain geometry and scalar inputs.
import {createHash} from 'node:crypto';
import {DemonBakeEncode,DemonBakeDecode,DemonSurfaceSignature,DemonFieldSettings} from '../src/newer/assets/demon_bake_format.js';
import {R_DemonSurfaceData} from '../src/newer/render/r_demonrelief.js';
import {R_DemonBakePrefetch,R_DemonBakePrepare,R_DemonBakeSurface,R_DemonBakeRelease} from '../src/newer/assets/r_demonbakes.js';
import {DEMON_BAKES} from '../src/newer/assets/demon_bakes.js';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,`${m}: ${a} != ${b}`),json=(a,b,m)=>same(JSON.stringify(a),JSON.stringify(b),m);
const sha=a=>createHash('sha256').update(ArrayBuffer.isView(a)?new Uint8Array(a.buffer,a.byteOffset,a.byteLength):a).digest('hex'),ab=a=>a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength);
function surface({size=8,span=1,sampling='clamp',hex=false,step=2}={}){
 const xy=hex?[[0,0],[size,0],[size*1.2,size*.25],[size,size*.7],[size*.2,size],[0,size*.7]]:[[0,0],[size,0],[size,size],[0,size]];
 const field={width:2,height:2,data:new Float32Array([.1,.2,.3,.4]),sampling,displacement:{depth:4,step,smoothing:0}};
 return{flags:0,plane:{normal:[0,0,1],dist:0},texinfo:{texture:{name:'dem4_1',width:64,height:128,gl_texture:{userData:{newerHeight:field}}},vecs:[[64*span/size,0,0,0],[0,128*span/size,0,0]]},polys:{numverts:xy.length,verts:Float32Array.from(xy.flatMap(([x,y])=>[x,y,0,x/size*span,y/size*span,.1+x/100,.2+y/100])),next:null}};
}
const field=s=>s.texinfo.texture.gl_texture.userData.newerHeight;
const record=(s,nativeOnly)=>({signature:DemonSurfaceSignature(s),settings:DemonFieldSettings(field(s)),fieldSha256:sha(field(s).data),data:null,nativeOnly});
function rejects(fn,label){let error;try{fn();}catch(e){error=e;}check(error instanceof Error,label+' must reject');}
function rewrite(raw,fn){const v=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),len=v.getUint32(4,true),start=(8+len+3)&~3,meta=JSON.parse(new TextDecoder().decode(raw.subarray(8,8+len)));fn(meta);const header=new TextEncoder().encode(JSON.stringify(meta)),next=(8+header.length+3)&~3,out=new Uint8Array(next+raw.length-start),view=new DataView(out.buffer);view.setUint32(0,0x31424451,true);view.setUint32(4,header.length,true);out.set(header,8);out.set(raw.subarray(start),next);return out;}
async function settle(s){for(let i=0;i<100;i++){if(R_DemonBakeSurface(s).status!=='loading')return;await new Promise(r=>setTimeout(r,0));}throw Error('Field validation timed out');}

Deno.test('only actual triangle/tile limits produce native diagnostics, and reused diagnostics cannot conceal invalid inputs',()=>{
 const diagnostic={stale:true},tile=surface({span:5}),tileBefore=JSON.stringify(tile);
 same(R_DemonSurfaceData(tile,diagnostic),null,'25-tile material exceeds fixed16 budget');json(diagnostic,{reason:'tile-budget',required:25,limit:16},'independent UV span count');same(JSON.stringify(tile),tileBefore,'budget rejection leaves native polygon and field unchanged');
 const triangle=surface({size:512,hex:true,step:.5,sampling:'repeat'});same(R_DemonSurfaceData(triangle,diagnostic),null,'four capped256 squared fan triangles plus skirts exceed262144');json(diagnostic,{reason:'triangle-budget',required:4*256*256+6*2*256,limit:262144},'triangle cap includes closed skirts');
 const valid=surface();check(R_DemonSurfaceData(valid,diagnostic)?.triangles>0,'bounded positive control really generates geometry');json(diagnostic,{},'successful call clears obsolete budget outcome');diagnostic.reason='tile-budget';check(R_DemonSurfaceData(valid,diagnostic),'cached valid geometry remains usable');json(diagnostic,{},'cached success also clears obsolete budget outcome');
 const invalid=surface();field(invalid).data[0]=NaN;Object.assign(diagnostic,{reason:'tile-budget',required:25,limit:16});same(R_DemonSurfaceData(invalid,diagnostic),null,'invalid scalar is rejected');json(diagnostic,{},'invalid input cannot retain native-only budget authority');
});

Deno.test('native-only codec preserves source-bound outcomes with zero payload and rejects corrupt or contradictory records',()=>{
 const s=surface({span:5}),r=record(s,{reason:'tile-budget',required:25,limit:16}),meta={model:'maps/public-native-only.bsp',bspSha256:'bsp'},raw=DemonBakeEncode(meta,[r]);
 for(const compact of [false,true]){const decoded=DemonBakeDecode(ab(raw),meta.model,meta.bspSha256,{compact}),out=decoded.records.get(r.signature);same(out.data,null,'native outcome has no generated geometry');json(out.nativeOnly,r.nativeOnly,'recognized diagnostic retained');same(out.settings,r.settings,'recipe retained');same(out.fieldSha256,r.fieldSha256,'scalar source retained');same(raw.length,(8+new DataView(raw.buffer).getUint32(4,true)+3)&~3,'no hidden vertex payload');}
 rejects(()=>DemonBakeDecode(ab(raw),'maps/other.bsp','bsp'),'different map');rejects(()=>DemonBakeDecode(ab(raw),meta.model,'different'),'different source');
 for(const bad of [{reason:'missing-height',required:25,limit:16},{reason:'tile-budget',required:16,limit:16},{reason:'tile-budget',required:25.5,limit:16},{reason:'tile-budget',required:25,limit:17},{reason:'triangle-budget',required:262145,limit:16},{reason:'triangle-budget',required:Number.MAX_SAFE_INTEGER+1,limit:262144}]){
  rejects(()=>DemonBakeEncode(meta,[{...r,nativeOnly:bad}]),'bad outcome encode '+JSON.stringify(bad));rejects(()=>DemonBakeDecode(ab(rewrite(raw,m=>m.records[0].nativeOnly=bad)),meta.model,'bsp'),'bad outcome decode '+JSON.stringify(bad));
 }
 const geometry=R_DemonSurfaceData(surface());rejects(()=>DemonBakeEncode(meta,[{...r,data:geometry}]),'native outcome plus actual geometry');
 for(const [name,change]of [['data object',m=>m.records[0].data={}],['vertex metadata',m=>m.records[0].vertices=0],['offset gap',m=>m.records[0].offset=4],['duplicate',m=>m.records.push({...m.records[0]})],['version',m=>m.version++]])rejects(()=>DemonBakeDecode(ab(rewrite(raw,change)),meta.model,'bsp'),name);
 const mixed=DemonBakeEncode(meta,[r,{signature:'geometry',settings:r.settings,fieldSha256:r.fieldSha256,data:geometry},{...r,signature:'last-native'}]);
 const decoded=DemonBakeDecode(ab(mixed),meta.model,'bsp');same(decoded.records.size,3,'native records before and after geometry preserve payload offsets');same(decoded.records.get('geometry').data.triangles,geometry.triangles,'neighboring real geometry survives');same(decoded.records.get('last-native').data,null,'last native record does not consume geometry payload');
});

Deno.test('validated native-only surfaces stay explicit and source/settings/scalar mismatches cannot inherit their ready decision',async()=>{
 for(const variant of ['valid','recipe','scalar','polygon','source']){
  const name='maps/public-native-only-'+variant+'.bsp',source=new Uint8Array([11,29,47,83]),s=surface({span:5}),diagnostic={};same(R_DemonSurfaceData(s,diagnostic),null,'actual budget prerequisite');const raw=DemonBakeEncode({model:name,bspSha256:sha(source)},[record(s,diagnostic)]),model={name,bspSourceBytes:source};
  DEMON_BAKES[name]=[{bspSha256:sha(source),file:'public-native-only.gz',sha256:'test',rawSha256:sha(raw)}];let generatorReads=0;
  try{const entry=R_DemonBakePrefetch(name,source,async()=>ab(raw));await entry.promise;same(entry.status,'ready','source-bound metadata decode');R_DemonBakePrepare(model,[s]);await settle(s);same(R_DemonBakeSurface(s).status,'native','public explicit native status');same(R_DemonBakeSurface(s).data,null,'no false mesh');json(R_DemonBakeSurface(s).diagnostic,diagnostic,'diagnostic available publicly');
   field(s).data.every=()=>{generatorReads++;throw Error('Unexpected generator fallback');};
   if(variant==='recipe')field(s).displacement.depth=5;else if(variant==='scalar')field(s).data[0]=.8;else if(variant==='polygon')s.polys.verts[0]=1;
   if(variant==='source'){const other=source.slice();other[0]++;const wrong=R_DemonBakePrefetch(name,other,async()=>{throw Error('Wrong source must not request known artifact');});await wrong.promise;same(wrong.status,'unprepared','same name with other BSP cannot inherit native-only record');}
   else{R_DemonBakePrepare(model,[s]);await settle(s);same(R_DemonBakeSurface(s).status,variant==='valid'?'native':'error',variant+' public authority');same(generatorReads,0,'validation never disguises mismatch through generation');}
  }finally{R_DemonBakeRelease();delete DEMON_BAKES[name];}
 }
});
