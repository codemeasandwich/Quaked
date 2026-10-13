// Pure public height-decoding contract; no renderer, browser, network or owned art.
import { EnemyHeightScalars } from '../src/newer/assets/enemy_height.js';
const SHA='e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151';
const check=(v,m)=>{if(!v)throw Error(m);},same=(a,b,m)=>check(a===b,m+': '+a+' != '+b);
function pixels(){const data=Uint8ClampedArray.from({length:216*194*4},(_,i)=>i%4===3?255:i%251);return{width:216,height:194,data};}
function descriptor(){return{nativeModelSha256:SHA,heightFlat:{policy:'armagon-flash-v1',modelSha256:SHA,width:216,height:194,spans:[[3,4,8],[3,12,16],[4,4,8]]}};}
Deno.test('Ordinary enemy height scalars use exact decoded red without changing pixels or descriptors',()=>{
 const p=pixels(),original=p.data.slice(),d={nativeModelSha256:SHA},before=JSON.stringify(d),out=EnemyHeightScalars(p,d,'armabody');
 check(out instanceof Float32Array,'normal preparation receives Float32 scalars');same(out.length,p.width*p.height,'one scalar per decoded texel');
 for(let i=0;i<out.length;i++)same(out[i],Math.fround(original[i*4]/255),'ordinary scalar preserves decoded red');
 same(JSON.stringify(d),before,'descriptor unchanged');check(p.data.every((v,i)=>v===original[i]),'decoded pixels unchanged');
});
Deno.test('Approved Armagon policy reconstructs only declared spans and keeps every other decoded scalar exact',()=>{
 const p=pixels(),d=descriptor(),original=p.data.slice(),before=JSON.stringify(d),out=EnemyHeightScalars(p,d,'armabody');
 const inside=new Set();for(const[y,start,end]of d.heightFlat.spans)for(let x=start;x<end;x++)inside.add(y*p.width+x);
 for(let i=0;i<out.length;i++)same(out[i],inside.has(i)?1:Math.fround(original[i*4]/255),'only explicit half-open spans are flat');
 same(inside.size,12,'narrow half-open policy exercises row boundaries');same(JSON.stringify(d),before,'policy is never normalized by mutation');check(p.data.every((v,i)=>v===original[i]),'encoded decode is not rewritten');
});
Deno.test('Malformed or mismatched flat-height policies reject atomically instead of correcting another model',()=>{
 const cases=[
 ['unknown policy',d=>d.heightFlat.policy='eel-mask'],['wrong model',d=>d.heightFlat.modelSha256='0'.repeat(64)],['unbound descriptor',d=>delete d.nativeModelSha256],['wrong descriptor identity',d=>d.nativeModelSha256='0'.repeat(64)],
 ['wrong width',d=>d.heightFlat.width++],['wrong height',d=>d.heightFlat.height++],['missing spans',d=>delete d.heightFlat.spans],['empty spans',d=>d.heightFlat.spans=[]],
 ['negative row',d=>d.heightFlat.spans[1]=[-1,2,3]],['fractional row',d=>d.heightFlat.spans[1]=[3.5,2,3]],['out of range row',d=>d.heightFlat.spans[1]=[194,2,3]],['negative start',d=>d.heightFlat.spans[1]=[3,-1,3]],['fractional start',d=>d.heightFlat.spans[1]=[3,8.5,9]],['past row end',d=>d.heightFlat.spans[1]=[3,12,217]],['empty interval',d=>d.heightFlat.spans[1]=[3,12,12]],['reversed interval',d=>d.heightFlat.spans[1]=[3,16,12]],['unsorted rows',d=>d.heightFlat.spans=[[4,4,8],[3,4,8]]],['unsorted intervals',d=>d.heightFlat.spans=[[3,12,16],[3,4,8]]],['overlap',d=>d.heightFlat.spans=[[3,4,8],[3,7,12]]],['duplicate',d=>d.heightFlat.spans=[[3,4,8],[3,4,8]]],['noninteger endpoint',d=>d.heightFlat.spans[1]=[3,12,16.1]]
 ];
 for(const[label,change]of cases){const p=pixels(),d=descriptor();change(d);const original=p.data.slice(),before=JSON.stringify(d);let error;try{EnemyHeightScalars(p,d,'armabody');}catch(e){error=e;}check(error instanceof Error,label+' rejects malformed policy');check(p.data.every((v,i)=>v===original[i]),label+' leaves every decoded byte unchanged');same(JSON.stringify(d),before,label+' leaves descriptor unchanged');}
 for(const key of ['armalegs','eel2','']){let threw=false;try{EnemyHeightScalars(pixels(),descriptor(),key);}catch{threw=true;}check(threw,'Armagon semantic policy cannot apply to '+JSON.stringify(key));}
});
