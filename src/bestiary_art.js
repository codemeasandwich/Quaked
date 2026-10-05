// Authored-image composition only. Discovery and persistence stay in the
// journal. Coordinates register the owner's bottom-cropped cutting guide to
// the original 1024×1536 page, rather than stretching its 1400px screenshot.
export const BESTIARY_FRONTISPIECE_PIECES = Object.freeze([
 {id:'scrag',polygon:[[0,0],[.174,0],[.378,.43915],[0,.43915]]},
 {id:'shambler',polygon:[[.174,0],[.814,0],[.634,.43915],[.378,.43915]]},
 {id:'ogre',polygon:[[.814,0],[1,0],[1,.43915],[.634,.43915]]},
 {id:'fiend',polygon:[[0,.58201],[.5,.58201],[.5,1],[0,1]]},
 {id:'vore',polygon:[[.5,.58201],[1,.58201],[1,1],[.5,1]]}
].map(piece=>Object.freeze({...piece,polygon:Object.freeze(piece.polygon.map(p=>Object.freeze(p)))})));
export const Bestiary_HeaderHeight = id => ['shub_awakened','infected_death_knight','ranged_death_knight'].includes(id) ? 240 : 196;
export function Bestiary_FrontispieceMask(unlocked) {
 const ids=new Set(unlocked);
 return BESTIARY_FRONTISPIECE_PIECES.reduce((mask,piece,i)=>mask|(ids.has(piece.id)?1<<i:0),0);
}
export function Bestiary_ComposeFrontispiece(blank,art,unlocked,createCanvas) {
 const mask=Bestiary_FrontispieceMask(unlocked);
 if(!mask||!art)return blank;
 // The two supplied title bands differ slightly. At five discoveries use the
 // exact complete illustration, eliminating clipping seams and band mismatch.
 if(mask===31)return art;
 if(!blank)return null;
 const width=blank.naturalWidth||blank.width,height=blank.naturalHeight||blank.height;
 if(!(width>0&&height>0))return null;
 const canvas=createCanvas();canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)return blank;
 ctx.drawImage(blank,0,0,width,height);
 BESTIARY_FRONTISPIECE_PIECES.forEach((piece,i)=>{
  if(!(mask&(1<<i)))return;
  ctx.save();
  try{
   ctx.beginPath();piece.polygon.forEach(([x,y],j)=>j?ctx.lineTo(x*width,y*height):ctx.moveTo(x*width,y*height));ctx.closePath();ctx.clip();
   ctx.drawImage(art,0,0,width,height);
  }finally{ctx.restore();}
 });
 return canvas;
}
