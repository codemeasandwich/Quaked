// Book presentation only. The runtime owns discovery, persistence, camera and
// simulation timing. Discovered folios are blitted unchanged; locked folios
// combine the supplied blank template with a separate authored title crop.
import { Draw_GetOverlayCanvas, Draw_CacheBookNavigation } from './gl_draw.js';
import { K_LEFTARROW, K_RIGHTARROW, K_ENTER } from './keys.js';
import { R_BestiarySnapshot, R_BestiaryEntries, R_BestiaryPage, R_BestiaryCancel, R_BestiaryCover, R_BestiaryFrontispiece, R_BestiaryContents, R_BestiaryVerso, R_BestiaryDedication, R_BestiaryEntryBlank, R_BestiaryHeading } from './r_bestiary.js';

const TURN_MS = 320;
let spread = 0, turn = null;
const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const clamp = ( value, low, high ) => Math.max( low, Math.min( high, value ) );
const rect = ( x, y, w, h ) => ( { x, y, w, h } );

function surface() {
 const canvas = Draw_GetOverlayCanvas();
 if ( !canvas || canvas.width <= 0 || canvas.height <= 0 ) return null;
 const ctx = canvas.getContext( '2d' );
 if ( !ctx ) return null;
 const cssWidth = canvas.clientWidth || canvas.width;
 return { canvas, ctx, width:canvas.width, height:canvas.height, unit:Math.max( .8*canvas.width/cssWidth, canvas.height/800 ) };
}
function layout( width, height, unit ) {
 const h = Math.max( 1, Math.min( height*.8, (width-56*unit)*.75 ) ), w = h*2/3, gutter = 6*unit;
 const y = Math.max( 0, (height-h)/2-8*unit ), middle = width/2;
 return { left:rect(middle-gutter/2-w,y,w,h), right:rect(middle+gutter/2,y,w,h), middle, bottom:y+h };
}
function title( ctx, text, box, unit, color = '#31271e', heightFraction = .25 ) {
 ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
 ctx.font = `600 ${Math.min( 25*unit, box.w/7 )}px Georgia, serif`;
 ctx.fillText( text, box.x+box.w/2, box.y+box.h*heightFraction, box.w*.88 );
}
function cover( ctx, box, unit ) {
 ctx.fillStyle = '#30241c'; ctx.fillRect( box.x, box.y, box.w, box.h );
 const image = R_BestiaryCover(), imageBox = image && fitImage(image,box);
 if ( imageBox ) { ctx.drawImage(image,imageBox.x,imageBox.y,imageBox.w,imageBox.h); return; }
 ctx.strokeStyle = '#a18a68'; ctx.lineWidth = Math.max( 1, unit );
 ctx.strokeRect( box.x+9*unit, box.y+9*unit, box.w-18*unit, box.h-18*unit );
 title( ctx, 'BESTIARY', box, unit, '#e1c99e' );
}
function fitImage( image, box ) {
 const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
 if ( !(width > 0 && height > 0) ) return null;
 const scale = Math.min( box.w/width, box.h/height );
 return { sourceWidth:width, sourceHeight:height, ...rect(box.x+(box.w-width*scale)/2,box.y+(box.h-height*scale)/2,width*scale,height*scale) };
}
function page( ctx, entry, box, unlocked, unit, ripple = 0, clock = 0 ) {
 ctx.fillStyle = '#e6dbc2'; ctx.fillRect( box.x, box.y, box.w, box.h );
 if ( !entry ) return;
 const image = unlocked.has(entry.id) ? R_BestiaryPage(entry.id) : null;
 const imageBox = image && fitImage(image,box);
 if ( !imageBox ) {
  const blank=R_BestiaryEntryBlank(),blankBox=blank&&fitImage(blank,box);
  const heading=R_BestiaryHeading(entry.id),sourceWidth=heading&&(heading.naturalWidth||heading.width),sourceHeight=heading&&(heading.naturalHeight||heading.height);
  if(blankBox&&sourceWidth>0&&sourceHeight>0){
   ctx.drawImage(blank,blankBox.x,blankBox.y,blankBox.w,blankBox.h);
   ctx.drawImage(heading,blankBox.x,blankBox.y,blankBox.w,blankBox.w*sourceHeight/sourceWidth);
  }else title(ctx,entry.title,box,unit,'#31271e',.12);
  return;
 }
 ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
 if ( ripple <= .001 ) { ctx.drawImage(image,imageBox.x,imageBox.y,imageBox.w,imageBox.h); return; }
 // A bounded display-only ripple. The source PNG and its aspect ratio remain
 // intact; the final held page uses one ordinary unwarped draw.
 ctx.save();
 try {
  ctx.beginPath(); ctx.rect(box.x,box.y,box.w,box.h); ctx.clip();
  const rows = 32;
  for ( let i = 0; i < rows; i ++ ) {
   const fraction = i/rows, shift = Math.sin(fraction*19-clock*7)*ripple*unit*7;
   ctx.drawImage(image,0,imageBox.sourceHeight*fraction,imageBox.sourceWidth,imageBox.sourceHeight/rows,
    imageBox.x+shift,imageBox.y+imageBox.h*fraction,imageBox.w,imageBox.h/rows);
  }
 } finally { ctx.restore(); }
}
// Front matter is always available and does not participate in discovery.
// Index0 is the outer cover,1 the inner illustration,2 Contents,3+i a creature.
// The cover's reverse is the dedication beside the inner illustration. All
// later leaf reverses use parchment; the same mapping serves both turn faces.
function bookPage( ctx, index, right, entries, box, unlocked, unit ) {
 if ( right && index > 2 ) { page(ctx,entries[index-3],box,unlocked,unit); return; }
 ctx.fillStyle = '#e6dbc2'; ctx.fillRect(box.x,box.y,box.w,box.h);
 const image = !right ? (index === 1 ? R_BestiaryDedication() : R_BestiaryVerso()) : index === 1 ? R_BestiaryFrontispiece() : R_BestiaryContents(), imageBox = image && fitImage(image,box);
 if ( imageBox ) ctx.drawImage(image,imageBox.x,imageBox.y,imageBox.w,imageBox.h);
 else if ( right ) title(ctx,index === 1 ? 'BESTIARY' : 'CONTENTS',box,unit,'#31271e',.12);
}
function drawSpread( ctx, index, entries, boxes, unlocked, unit ) {
 if ( index === 0 ) { cover(ctx,boxes.right,unit); return; }
 bookPage(ctx,index,false,entries,boxes.left,unlocked,unit);
 bookPage(ctx,index,true,entries,boxes.right,unlocked,unit);
 ctx.fillStyle = 'rgba(25,15,8,.20)';
 ctx.fillRect(boxes.middle-3*unit,boxes.left.y,6*unit,boxes.left.h);
}
function drawTurn( ctx, motion, progress, entries, boxes, unlocked, unit ) {
 // The supplied cover fades into the frontispiece; interior pages turn
 // about their spine. Neither transition changes any supplied image pixels.
 if ( motion.from === 0 || motion.to === 0 ) {
  ctx.save();
  try { ctx.globalAlpha = progress; drawSpread(ctx,motion.to,entries,boxes,unlocked,unit); } finally { ctx.restore(); }
  ctx.save();
  try { ctx.globalAlpha = 1-progress; drawSpread(ctx,motion.from,entries,boxes,unlocked,unit); } finally { ctx.restore(); }
  return;
 }
 const forward = motion.to > motion.from;
 bookPage(ctx,forward?motion.from:motion.to,false,entries,boxes.left,unlocked,unit);
 bookPage(ctx,forward?motion.to:motion.from,true,entries,boxes.right,unlocked,unit);
 const front = progress < .5, scale = Math.max( .002, Math.abs(Math.cos(progress*Math.PI)) );
 const index = front ? motion.from : motion.to, right = forward === front;
 const side = forward === front ? 1 : -1, box = side > 0 ? boxes.right : boxes.left;
 ctx.save();
 try {
  const hinge = side > 0 ? box.x : box.x+box.w;
  ctx.translate(hinge,0); ctx.scale(scale,1); ctx.translate(-hinge,0);
  bookPage(ctx,index,right,entries,box,unlocked,unit);
  ctx.fillStyle = `rgba(25,15,8,${.24*(1-scale)})`; ctx.fillRect(box.x,box.y,box.w,box.h);
 } finally { ctx.restore(); }
}

export function R_BestiaryBookOpen() { R_BestiaryCancel(); spread = 0; turn = null; }
// Reserve the actual book/footer extent for corner branding. Report CSS units
// from the same layout used for drawing, rather than duplicating that layout.
export function R_BestiaryBookCorner() {
 const s = surface(); if ( !s ) return null;
 const boxes = layout(s.width,s.height,s.unit);
 // Bitmap labels round their start to a physical pixel; reserve the possible
 // half-pixel extension as well, so the corner logo never touches the label.
 return { right:Math.ceil(boxes.right.x+boxes.right.w+.5)*(s.canvas.clientWidth||s.width)/s.width,
  bottom:(boxes.bottom+40*s.unit)*(s.canvas.clientHeight||s.height)/s.height };
}
function flip( direction ) {
 const maximum = 2+R_BestiaryEntries().length, target = clamp(spread+direction,0,maximum);
 if ( target !== spread ) { turn = { from:spread,to:target,at:now() }; spread = target; }
}
function navigation( ctx, boxes, unit, width, maximum ) {
 const pics=Draw_CacheBookNavigation();if(!pics)return;
 const previous=pics.previous,next=spread===0?pics.open:pics.next,exit=pics.exit;
 const halfSpan=width/2-boxes.left.x,gap=8*unit;
 // Keep original outer/center anchors. Fit BOTH gaps; sum-of-widths alone
 // would allow a long left label to collide with the centered exit hint.
 const fit=Math.min((halfSpan-gap)/(previous.width+exit.width/2),(halfSpan-gap)/(next.width+exit.width/2));
 let scale=Math.min(Math.max(1,Math.floor(14*unit/8)),fit);if(scale>=1)scale=Math.floor(scale);if(scale<=0)return;
 const y=Math.round(boxes.bottom+22*unit-4*scale);
 ctx.imageSmoothingEnabled=false;
 const blit=(pic,x,enabled)=>{ctx.globalAlpha=enabled?1:.4;ctx.drawImage(pic.canvas,Math.round(x),y,pic.width*scale,pic.height*scale);};
 blit(previous,boxes.left.x,spread>0);blit(next,boxes.right.x+boxes.right.w-next.width*scale,spread<maximum);blit(exit,(width-exit.width*scale)/2,true);
 ctx.globalAlpha=1;
}
export function R_BestiaryBookKey( key ) {
 if ( key === K_LEFTARROW ) { flip(-1); return true; }
 if ( key === K_RIGHTARROW || key === K_ENTER ) { flip(1); return true; }
 return false; // Escape belongs to the existing menu's return-to-main behavior.
}
export function R_BestiaryBookTouch( x, y, width, height ) {
 if ( ![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height ) return false;
 flip(x < width/2 ? -1 : 1); return true;
}
export function R_BestiaryBookDraw() {
 const s = surface(); if ( !s ) return false;
 const snapshot = R_BestiarySnapshot(), entries = R_BestiaryEntries(), unlocked = new Set(snapshot.unlocked || []);
 const maximum = 2+entries.length; spread = clamp(spread,0,maximum);
 const { ctx,width,height,unit } = s, boxes = layout(width,height,unit);
 const progress = turn ? clamp((now()-turn.at)/TURN_MS,0,1) : 1;
 ctx.save();
 try {
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1;
  if ( turn && progress < 1 ) drawTurn(ctx,turn,progress,entries,boxes,unlocked,unit);
  else { turn = null; drawSpread(ctx,spread,entries,boxes,unlocked,unit); }
  navigation(ctx,boxes,unit,width,maximum);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#d2c3a7';
  if ( snapshot.storageStatus === 'unavailable' ) {
   ctx.font = `${11*unit}px Georgia, serif`; ctx.fillText('Progress is kept for this session only.',width/2,boxes.bottom+40*unit);
  }
 } finally { ctx.restore(); }
 return true;
}

export function R_BestiaryEncounterDraw() {
 const snapshot = R_BestiarySnapshot();
 if ( snapshot.phase === 'idle' || !snapshot.entry || !(snapshot.opacity > 0) ) return false;
 const s = surface(); if ( !s ) return false;
 const {ctx,width,height,unit} = s, opacity = clamp(snapshot.opacity,0,1), half = width/2;
 const x = snapshot.side === 'left' ? half : 0, margin = Math.min(16*unit,half*.07);
 const h = Math.min(height-2*margin,(half-2*margin)*1.5), w = h*2/3;
 const box = rect(x+(half-w)/2,(height-h)/2,w,h);
 ctx.save();
 try {
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = opacity;
  ctx.beginPath(); ctx.rect(x,0,half,height); ctx.clip();
  ctx.fillStyle = '#191715'; ctx.fillRect(x,0,half,height);
  page(ctx,snapshot.entry,box,new Set(snapshot.unlocked || []),unit,
   1-Math.min(clamp(snapshot.progress,0,1),opacity),now()/1000);
 } finally { ctx.restore(); }
 return true;
}
