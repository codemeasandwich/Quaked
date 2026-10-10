/**
 * @module newer/ui/bestiary_art
 *
 * Composing a Bestiary page from its authored images, registered to the owner's cutting guide.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
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
/**
 * Which frontispiece pieces are discovered, as a bit mask over `BESTIARY_FRONTISPIECE_PIECES` (bit 0 scrag,
 * 1 shambler, 2 ogre, 3 fiend, 4 vore). r_bestiary.js uses it to know when the composite must be rebuilt.
 *
 * @param {Iterable<string>} unlocked discovered creature ids (the journal snapshot's `unlocked`)
 * @returns {number} mask 0..31; 31 when all five are discovered
 */
export function Bestiary_FrontispieceMask(unlocked) {
 const ids=new Set(unlocked);
 return BESTIARY_FRONTISPIECE_PIECES.reduce((mask,piece,i)=>mask|(ids.has(piece.id)?1<<i:0),0);
}
/**
 * Composes the Bestiary frontispiece: the blank page with each discovered creature's region of the complete
 * illustration clipped in along the owner's cutting guide (polygons in 0..1 of the page size). With all five
 * discovered it returns the exact complete illustration, because the two supplied title bands differ slightly
 * and clipping would leave seams.
 *
 * @param {?(HTMLImageElement|HTMLCanvasElement)} blank the blank frontispiece page (its natural size is used)
 * @param {?(HTMLImageElement|HTMLCanvasElement)} art the complete illustration, drawn stretched to the blank's size
 * @param {Iterable<string>} unlocked discovered creature ids
 * @param {function(): HTMLCanvasElement} createCanvas makes the output canvas (called only when compositing)
 * @returns {?(HTMLImageElement|HTMLCanvasElement)} `blank` when nothing is discovered, `art` is missing or no 2D
 *   context is available; `art` when all five are discovered; null when `blank` is missing or has no size;
 *   otherwise a new canvas the caller keeps
 */
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
