/**
 * @module newer/assets/normal_bake_format
 *
 * The prepared normal map format: its generator version, encoding and decoding.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 5 places.
 */
export const NORMAL_GENERATOR_VERSION='quaked-normal-generator-1';
export function NormalBakeEncode(key,width,height,{pixels,scalar,reference=null,referenceWidth=0,referenceHeight=0}){
 const header=new TextEncoder().encode(JSON.stringify({version:NORMAL_GENERATOR_VERSION,key,width,height,referenceWidth,referenceHeight})),start=(4+header.length+3)&~3;
 const out=new Uint8Array(start+pixels.byteLength+scalar.byteLength+(reference?.byteLength||0));new DataView(out.buffer).setUint32(0,header.length,true);out.set(header,4);
 out.set(pixels,start);out.set(new Uint8Array(scalar.buffer,scalar.byteOffset,scalar.byteLength),start+pixels.byteLength);if(reference)out.set(reference,start+pixels.byteLength+scalar.byteLength);return out;
}
export function NormalBakeDecode(buffer,key,width,height){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<4||buffer.byteLength>64*1024*1024)throw Error('Invalid prepared normal size');
 const view=new DataView(buffer),length=view.getUint32(0,true);if(length>65536||length>buffer.byteLength-4)throw Error('Invalid prepared normal header');
 const h=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length))),start=(4+length+3)&~3;
 if(h.version!==NORMAL_GENERATOR_VERSION||h.key!==key||h.width!==width||h.height!==height||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||!Number.isInteger(h.referenceWidth)||!Number.isInteger(h.referenceHeight)||h.referenceWidth<0||h.referenceHeight<0||h.referenceWidth>2048||h.referenceHeight>2048)throw Error('Prepared normal identity/dimensions mismatch');
 const n=width*height,ref=h.referenceWidth*h.referenceHeight;if((h.referenceWidth===0)!==(h.referenceHeight===0)||start+n*8+ref*4!==buffer.byteLength)throw Error('Prepared normal coverage mismatch');
 const pixels=new Uint8Array(buffer,start,n*4),scalar=new Float32Array(buffer,start+n*4,n);if(!scalar.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid prepared normal scalar');
 return {pixels,scalar,reference:ref?new Uint8Array(buffer,start+n*8,ref*4):null,referenceWidth:h.referenceWidth,referenceHeight:h.referenceHeight,bytes:buffer.byteLength};
}
