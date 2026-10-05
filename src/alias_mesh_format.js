export const ALIAS_MESH_VERSION='quake-original-strip-fan-1';
export function AliasMeshSignature(h){return JSON.stringify([ALIAS_MESH_VERSION,h.numverts,h.numtris,h.skinwidth,h.skinheight,h.triangles.slice(0,h.numtris).map(t=>[t.facesfront,...t.vertindex]),h.stverts.slice(0,h.numverts).map(v=>[v.onseam,v.s,v.t])]);}
export function AliasMeshValidate(record,h){
 if(!record||!Array.isArray(record.commands)||!Array.isArray(record.order)||record.commands.length>8192||record.order.length>8192||!record.commands.every(v=>Number.isInteger(v)&&v>=-2147483648&&v<=2147483647)||!record.order.every(v=>Number.isInteger(v)&&v>=0&&v<h.numverts))throw Error('Invalid alias mesh record');
 const commands=new Int32Array(record.commands),order=new Int32Array(record.order),bits=new Int32Array(1),float=new Float32Array(bits.buffer);let at=0,vertices=0,triangles=0;
 while(at<commands.length){const count=commands[at++];if(!count){if(at!==commands.length||vertices!==order.length||triangles!==h.numtris)throw Error('Invalid alias mesh terminator/order');return {commands,order};}
  const size=Math.abs(count);if(size<3||at+size*2>=commands.length)throw Error('Invalid alias mesh primitive');
  for(let i=0;i<size*2;i++){bits[0]=commands[at++];if(!Number.isFinite(float[0]))throw Error('Invalid alias mesh UV');}vertices+=size;triangles+=size-2;
 }
 throw Error('Missing alias mesh terminator');
}
