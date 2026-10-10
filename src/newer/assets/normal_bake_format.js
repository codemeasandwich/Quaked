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
/**
 * Packs one prepared normal map into the bake byte layout: a little-endian uint32 header length, a JSON header
 * (`version` = NORMAL_GENERATOR_VERSION, `key`, `width`, `height`, `referenceWidth`, `referenceHeight`), padding to a
 * 4-byte boundary, then the RGBA pixels, the float32 height scalar and the optional reference RGBA. Called by
 * `R_NormalPrepare` (normal_prepare.js) when a texture has no shipped bake and the local displacement store must
 * generate and save one; `NormalBakeDecode` reads the result back.
 *
 * @param {string} key input identity from `NormalInputKey` (generator version, size, settings and input digests)
 * @param {number} width texture width in texels (recorded in the header; not checked here)
 * @param {number} height texture height in texels (recorded in the header; not checked here)
 * @param {{ pixels: Uint8Array, scalar: Float32Array, reference?: ?Uint8Array, referenceWidth?: number, referenceHeight?: number }} data
 * output of `NormalGenerate`: `pixels` 4 bytes per texel (encoded normal), `scalar` one height per texel in 0..1,
 * `reference` optional edge-reference RGBA of `referenceWidth`×`referenceHeight` texels (0×0 when absent)
 * @returns {Uint8Array} a new buffer holding the whole bake, ready to store
 */
export function NormalBakeEncode(key,width,height,{pixels,scalar,reference=null,referenceWidth=0,referenceHeight=0}){
 const header=new TextEncoder().encode(JSON.stringify({version:NORMAL_GENERATOR_VERSION,key,width,height,referenceWidth,referenceHeight})),start=(4+header.length+3)&~3;
 const out=new Uint8Array(start+pixels.byteLength+scalar.byteLength+(reference?.byteLength||0));new DataView(out.buffer).setUint32(0,header.length,true);out.set(header,4);
 out.set(pixels,start);out.set(new Uint8Array(scalar.buffer,scalar.byteOffset,scalar.byteLength),start+pixels.byteLength);if(reference)out.set(reference,start+pixels.byteLength+scalar.byteLength);return out;
}
/**
 * Validates and unpacks a bake written by `NormalBakeEncode`, as read from the local displacement store or a shipped
 * bake (normal_transport.js). Every check must pass or it throws, so a stale, foreign or truncated bake is rejected
 * and regenerated instead of drawn.
 *
 * @param {ArrayBuffer} buffer the stored bake (at most 64 MiB)
 * @param {string} key the expected input key; must equal the header's `key`
 * @param {number} width expected width in texels, an integer 1..2048 equal to the header's
 * @param {number} height expected height in texels, an integer 1..2048 equal to the header's
 * @returns {{ pixels: Uint8Array, scalar: Float32Array, reference: ?Uint8Array, referenceWidth: number, referenceHeight: number, bytes: number }}
 * views into `buffer` (not copies; they live as long as the buffer): RGBA `pixels`, the 0..1 height `scalar`,
 * the edge `reference` RGBA or null when the header records 0×0, its size in texels, and the buffer's byte length
 * @throws {Error} 'Invalid prepared normal size' when `buffer` is not an ArrayBuffer of 4 bytes..64 MiB;
 * 'Invalid prepared normal header' when the header length exceeds 65536 or the buffer; 'Prepared normal
 * identity/dimensions mismatch' when version, key or size differ or are out of range; 'Prepared normal coverage
 * mismatch' when the byte length does not match the sizes; 'Invalid prepared normal scalar' when a height is not a
 * finite 0..1 value; a SyntaxError from JSON.parse when the header is not JSON
 */
export function NormalBakeDecode(buffer,key,width,height){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<4||buffer.byteLength>64*1024*1024)throw Error('Invalid prepared normal size');
 const view=new DataView(buffer),length=view.getUint32(0,true);if(length>65536||length>buffer.byteLength-4)throw Error('Invalid prepared normal header');
 const h=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,4,length))),start=(4+length+3)&~3;
 if(h.version!==NORMAL_GENERATOR_VERSION||h.key!==key||h.width!==width||h.height!==height||!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||!Number.isInteger(h.referenceWidth)||!Number.isInteger(h.referenceHeight)||h.referenceWidth<0||h.referenceHeight<0||h.referenceWidth>2048||h.referenceHeight>2048)throw Error('Prepared normal identity/dimensions mismatch');
 const n=width*height,ref=h.referenceWidth*h.referenceHeight;if((h.referenceWidth===0)!==(h.referenceHeight===0)||start+n*8+ref*4!==buffer.byteLength)throw Error('Prepared normal coverage mismatch');
 const pixels=new Uint8Array(buffer,start,n*4),scalar=new Float32Array(buffer,start+n*4,n);if(!scalar.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid prepared normal scalar');
 return {pixels,scalar,reference:ref?new Uint8Array(buffer,start+n*8,ref*4):null,referenceWidth:h.referenceWidth,referenceHeight:h.referenceHeight,bytes:buffer.byteLength};
}
