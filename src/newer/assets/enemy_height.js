/** Decode authored enemy height, retaining explicitly non-solid Armagon flashes.
 * The policy is model-bound data, not a brightness threshold: bright body pixels
 * outside the authored spans must retain their decoded WebP values. Shared by
 * runtime preparation and the offline baker; the effective scalar is already
 * part of the normal cache's existing complete input identity.
 */
const ARMAGON = 'e827535032c8e83609fedf07c9989c504e7eaa6772ce0d5cf73788e00980f151';
export function EnemyHeightScalars(pixels,descriptor={},modelKey=''){
 const {width,height,data}=pixels;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||data?.length!==width*height*4)throw Error('Invalid enemy height image');
 const flat=descriptor.heightFlat;
 if(flat!=null){
  if(modelKey!=='armabody'||descriptor.nativeModelSha256!==ARMAGON||flat.policy!=='armagon-flash-v1'||flat.modelSha256!==ARMAGON||flat.width!==width||flat.height!==height||!Array.isArray(flat.spans)||!flat.spans.length||flat.spans.length>width*height)throw Error('Invalid Armagon flash height policy');
  let previous=-1;
  for(const span of flat.spans){
   if(!Array.isArray(span)||span.length!==3||!span.every(Number.isSafeInteger))throw Error('Invalid Armagon flash span');
   const [y,start,end]=span,offset=y*width+start;
   if(y<0||y>=height||start<0||end>width||start>=end||offset<previous)throw Error('Overlapping or out-of-bounds Armagon flash span');
   previous=y*width+end;
  }
 }
 const scalar=Float32Array.from({length:width*height},(_,i)=>data[i*4]/255);
 if(flat)for(const[y,start,end]of flat.spans)scalar.fill(1,y*width+start,y*width+end);
 return scalar;
}
