// Independent disk layouts from QuakeSpasm Quake/bspfile.h:
// https://github.com/sezero/quakespasm/blob/master/Quake/bspfile.h
// BSP2 uses float bounds; 2PSB uses short bounds; both widen indices to32bits.
export const BSP2=0x32505342,PSB2=0x42535032;
export function splitBsp(bytes){const b=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);return Array.from({length:15},(_,i)=>{const p=b.readInt32LE(4+i*8),n=b.readInt32LE(8+i*8);return Buffer.from(b.subarray(p,p+n));});}
export function joinBsp(lumps,version){const size=lumps.reduce((n,b)=>n+((b.length+3)&~3),124),out=Buffer.alloc(size);out.writeInt32LE(version,0);let p=124;lumps.forEach((b,i)=>{out.writeInt32LE(p,4+i*8);out.writeInt32LE(b.length,8+i*8);b.copy(out,p);p+=(b.length+3)&~3;});return out;}
function records(input,from,to,convert){if(input.length%from)throw Error('Native fixture has malformed source record');const result=Buffer.alloc(input.length/from*to);for(let i=0;i<input.length/from;i++)convert(input.subarray(i*from,(i+1)*from),result.subarray(i*to,(i+1)*to));return result;}
export function convertBsp29(bytes,version,{fractional=false}={}){
 const lumps=splitBsp(bytes),floating=version===BSP2;
 lumps[5]=records(lumps[5],24,floating?44:32,(a,b)=>{b.writeInt32LE(a.readInt32LE(0),0);b.writeInt32LE(a.readInt16LE(4),4);b.writeInt32LE(a.readInt16LE(6),8);for(let i=0;i<6;i++){const v=a.readInt16LE(8+i*2)+(fractional?(i<3?-.25:.5):0);if(floating)b.writeFloatLE(v,12+i*4);else b.writeInt16LE(v,12+i*2);}b.writeUInt32LE(a.readUInt16LE(20),floating?36:24);b.writeUInt32LE(a.readUInt16LE(22),floating?40:28);});
 lumps[7]=records(lumps[7],20,28,(a,b)=>{b.writeInt32LE(a.readUInt16LE(0),0);b.writeInt32LE(a.readInt16LE(2),4);b.writeInt32LE(a.readInt32LE(4),8);b.writeInt32LE(a.readInt16LE(8),12);b.writeInt32LE(a.readInt16LE(10),16);a.copy(b,20,12,16);b.writeInt32LE(a.readInt32LE(16),24);});
 lumps[9]=records(lumps[9],8,12,(a,b)=>{b.writeInt32LE(a.readInt32LE(0),0);b.writeInt32LE(a.readInt16LE(4),4);b.writeInt32LE(a.readInt16LE(6),8);});
 lumps[10]=records(lumps[10],28,floating?44:32,(a,b)=>{b.writeInt32LE(a.readInt32LE(0),0);b.writeInt32LE(a.readInt32LE(4),4);for(let i=0;i<6;i++){const v=a.readInt16LE(8+i*2)+(fractional?(i<3?-.25:.5):0);if(floating)b.writeFloatLE(v,8+i*4);else b.writeInt16LE(v,8+i*2);}b.writeUInt32LE(a.readUInt16LE(20),floating?32:20);b.writeUInt32LE(a.readUInt16LE(22),floating?36:24);a.copy(b,floating?40:28,24,28);});
 lumps[11]=records(lumps[11],2,4,(a,b)=>b.writeUInt32LE(a.readUInt16LE(0),0));lumps[12]=records(lumps[12],4,8,(a,b)=>{b.writeUInt32LE(a.readUInt16LE(0),0);b.writeUInt32LE(a.readUInt16LE(2),4);});return joinBsp(lumps,version);
}
export function widenFixture(converted,version){const lumps=splitBsp(converted),floating=version===BSP2,offset=65536,ns=floating?44:32,ls=floating?44:32;
 const expand=(data,size,fill=data.subarray(0,size))=>{const result=Buffer.alloc(data.length+offset*size);for(let i=0;i<offset;i++)fill.copy(result,i*size);data.copy(result,offset*size);return result;};
 const vertices=lumps[3];lumps[3]=expand(vertices,12,Buffer.alloc(12));
 lumps[12]=records(lumps[12],8,8,(a,b)=>{b.writeUInt32LE(a.readUInt32LE(0)+offset,0);b.writeUInt32LE(a.readUInt32LE(4)+offset,4);});
 lumps[1]=expand(lumps[1],20);lumps[6]=expand(lumps[6],40);
 const faces=records(lumps[7],28,28,(a,b)=>{a.copy(b);b.writeInt32LE(a.readInt32LE(0)+offset,0);b.writeInt32LE(a.readInt32LE(16)+offset,16);});const filler=Buffer.from(faces.subarray(0,28));filler.writeInt32LE(0,0);filler.writeInt32LE(0,16);lumps[7]=expand(faces,28,filler);
 const marks=records(lumps[11],4,4,(a,b)=>b.writeUInt32LE(a.readUInt32LE(0)+offset,0));lumps[11]=expand(marks,4,Buffer.alloc(4));
 const originalLeaves=lumps[10].length/ls,leaves=records(lumps[10],ls,ls,(a,b)=>{a.copy(b);b.writeInt32LE(-1,4);b.writeUInt32LE(a.readUInt32LE(floating?32:20)+offset,floating?32:20);});const empty=Buffer.alloc(ls);empty.writeInt32LE(-1,0);empty.writeInt32LE(-1,4);lumps[10]=expand(leaves,ls,empty);lumps[10].writeInt32LE(-2,0);
 const nodes=records(lumps[5],ns,ns,(a,b)=>{a.copy(b);b.writeInt32LE(a.readInt32LE(0)+offset,0);for(let i=0;i<2;i++){const child=a.readInt32LE(4+i*4);b.writeInt32LE(child>=0?child+offset:child===-1?-1:child-offset,4+i*4);}b.writeUInt32LE(a.readUInt32LE(floating?36:24)+offset,floating?36:24);});const padNode=Buffer.alloc(ns);padNode.writeInt32LE(-1,4);padNode.writeInt32LE(-2,8);lumps[5]=expand(nodes,ns,padNode);nodes.subarray(0,ns).copy(lumps[5],0);
 const clips=records(lumps[9],12,12,(a,b)=>{a.copy(b);b.writeInt32LE(a.readInt32LE(0)+offset,0);for(let i=0;i<2;i++){const child=a.readInt32LE(4+i*4);b.writeInt32LE(child>=0?child+offset:child,4+i*4);}}),padClip=Buffer.alloc(12);padClip.writeInt32LE(-1,4);padClip.writeInt32LE(-2,8);lumps[9]=expand(clips,12,padClip);
 lumps[14]=records(lumps[14],64,64,(a,b)=>{a.copy(b);for(let i=1;i<4;i++){const n=a.readInt32LE(36+i*4);if(n>=0)b.writeInt32LE(n+offset,36+i*4);}b.writeInt32LE(offset+originalLeaves-1,52);b.writeInt32LE(a.readInt32LE(56)+offset,56);});return {bytes:joinBsp(lumps,version),offset,originalLeaves};
}
