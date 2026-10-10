// Book presentation only. The runtime owns discovery, persistence, camera and
// simulation timing. Discovered folios are blitted unchanged; locked folios
// combine the supplied blank template with a separate authored title crop.
import { Draw_GetOverlayCanvas, Draw_CacheBookNavigation } from './gl_draw.js';
import { K_LEFTARROW, K_RIGHTARROW, K_ENTER } from './engine/client/keys.js';
import { R_BestiarySnapshot, R_BestiaryEntries, R_BestiarySpreads, R_BestiaryPage, R_BestiaryCancel, R_BestiaryCover, R_BestiaryFrontispiece, R_BestiaryContents, R_BestiaryVerso, R_BestiaryDedication, R_BestiaryEntryBlank, R_BestiaryHeading, R_BestiaryArtFailed, R_BestiaryArtRetry, R_BestiaryArtLoading } from './r_bestiary.js';
import { R_FolioPrepare, R_FolioPlate, R_FolioSeconds } from './r_folio.js';

const TURN_MS = 320, WAIT_MS = 10000;
let spread = 0, turn = null, pending = null;
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
function page( ctx, entry, box, unlocked, unit ) {
 ctx.fillStyle = '#e6dbc2'; ctx.fillRect( box.x, box.y, box.w, box.h );
 if ( !entry ) return;
 const image = unlocked.has(entry.id) ? R_BestiaryPage(entry.id) : null;
 const imageBox = image && fitImage(image,box);
 if ( !imageBox ) { frame(ctx,entry,box,unit); return; }
 ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
 ctx.drawImage(image,imageBox.x,imageBox.y,imageBox.w,imageBox.h);
}
// Front matter is always available and does not participate in discovery.
// Index 0 is the outer cover, 1 the inner illustration, 2 Contents, 3+i the
// family spread i (card [19]): a base creature on the left page, its relative on
// the right; a missing one is a blank parchment page. The cover's reverse is the
// dedication beside the inner illustration. The same mapping serves both turn
// faces: a leaf's back is the next spread's left page.
function bookPage( ctx, index, right, entries, box, unlocked, unit ) {
 if ( index > 2 ) {
  const entry = R_BestiarySpreads()[index-3]?.[right?1:0];
  if ( entry ) { page(ctx,entry,box,unlocked,unit); return; }
  ctx.fillStyle = '#e6dbc2'; ctx.fillRect(box.x,box.y,box.w,box.h);
  const parchment = R_BestiaryVerso(), parchmentBox = parchment && fitImage(parchment,box);
  if ( parchmentBox ) ctx.drawImage(parchment,parchmentBox.x,parchmentBox.y,parchmentBox.w,parchmentBox.h);
  return;
 }
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
// One face of a leaf: the closed book (index 0) has only its cover, on the right; every other spread is bookPage's.
function face( ctx, index, right, entries, box, unlocked, unit ) {
 if ( index === 0 ) { if ( right ) cover(ctx,box,unit); return; }
 bookPage(ctx,index,right,entries,box,unlocked,unit);
}
function drawTurn( ctx, motion, progress, entries, boxes, unlocked, unit ) {
 // Every leaf, the cover too (card [7]), turns about the spine: its front, then (past half way) its back. The cover's back is
 // the dedication, beside the inner illustration. No supplied image's pixels change.
 const forward = motion.to > motion.from;
 face(ctx,forward?motion.from:motion.to,false,entries,boxes.left,unlocked,unit);
 face(ctx,forward?motion.to:motion.from,true,entries,boxes.right,unlocked,unit);
 const front = progress < .5, scale = Math.max( .002, Math.abs(Math.cos(progress*Math.PI)) );
 const index = front ? motion.from : motion.to, right = forward === front;
 const side = forward === front ? 1 : -1, box = side > 0 ? boxes.right : boxes.left;
 ctx.save();
 try {
  const hinge = side > 0 ? box.x : box.x+box.w;
  ctx.translate(hinge,0); ctx.scale(scale,1); ctx.translate(-hinge,0);
  face(ctx,index,right,entries,box,unlocked,unit);
  if ( index !== 0 || right ) { ctx.fillStyle = `rgba(25,15,8,${.24*(1-scale)})`; ctx.fillRect(box.x,box.y,box.w,box.h); }
 } finally { ctx.restore(); }
}

// What a spread needs before it may be shown (card [7]): its images (null while loading or failed) and their art ids.
function needs( index, entries, unlocked ) {
 if ( index === 0 ) return { images:[R_BestiaryCover()], ids:['cover'] };
 if ( index === 1 ) return { images:[R_BestiaryDedication(),R_BestiaryFrontispiece()], ids:['dedication','frontispiece-blank','frontispiece','frontispiece-complete'] };
 if ( index === 2 ) return { images:[R_BestiaryVerso(),R_BestiaryContents()], ids:['verso','contents'] };
 const pair = R_BestiarySpreads()[index-3]; if ( !pair ) return { images:[], ids:[] };
 const images = [], ids = [];
 for ( const entry of pair ) {
  if ( !entry ) { images.push(R_BestiaryVerso()); ids.push('verso'); }
  else if ( entry.image && unlocked.has(entry.id) ) { images.push(R_BestiaryPage(entry.id)); ids.push(entry.id); }
  else { images.push(R_BestiaryEntryBlank(),R_BestiaryHeading(entry.id)); ids.push('entry-blank','heading-'+entry.id); }
 }
 return { images, ids };
}
// (and none of its art still loading: a composite such as the frontispiece stands in for an image still on its way)
const ready = need => need.images.every( image => image && ( image.naturalWidth || image.width ) > 0 ) && ! R_BestiaryArtLoading( need.ids );

export function R_BestiaryBookOpen() { R_BestiaryCancel(); spread = 0; turn = null; pending = null; }
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
// One admission policy for the keyboard and touch (card [7]): no turn while one is running or waiting; a turn starts only when its
// destination's images are all present (until then the current spread stays, whole); a failed image (or a wait past WAIT_MS)
// shows a deliberate message, and the same press again tries the failed images once more; if they fail again, the next press
// turns anyway and the page's own fallbacks (its blank folio and heading, or its title) stand in, so no image can shut the
// rest of the book.  Returns whether the press did anything.
function flip( direction ) {
 const entries = R_BestiaryEntries(), maximum = 2+R_BestiarySpreads().length, target = clamp(spread+direction,0,maximum);
 if ( turn && now()-turn.at < TURN_MS ) return false;
 if ( pending ) {
  if ( Math.sign(pending.target-spread) !== Math.sign(direction) ) { pending = null; return true; } // (the other way: give up waiting)
  if ( !pending.failed ) return false;
  if ( pending.retried ) { turn = { from:spread,to:pending.target,at:now() }; spread = pending.target; pending = null; return true; }
  R_BestiaryArtRetry(pending.ids); pending.failed = false; pending.retried = true; pending.at = now();
  return true;
 }
 if ( target === spread ) return false;
 const need = needs(target,entries,new Set(R_BestiarySnapshot().unlocked || []));
 if ( ready(need) ) { turn = { from:spread,to:target,at:now() }; spread = target; }
 else pending = { target, at:now(), ids:need.ids, failed:false, retried:false };
 return true;
}
function admit( entries, unlocked ) {
 if ( !pending ) return;
 const need = needs(pending.target,entries,unlocked);
 if ( ready(need) ) { turn = { from:spread,to:pending.target,at:now() }; spread = pending.target; pending = null; return; }
 if ( R_BestiaryArtFailed(need.ids) || now()-pending.at > WAIT_MS ) pending.failed = true;
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
 // (true only when the press did something: the menu's click sound is for those)
 if ( key === K_LEFTARROW ) return flip(-1);
 if ( key === K_RIGHTARROW || key === K_ENTER ) return flip(1);
 return false; // Escape belongs to the existing menu's return-to-main behavior.
}
export function R_BestiaryBookTouch( x, y, width, height ) {
 if ( ![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height ) return false;
 flip(x < width/2 ? -1 : 1); return true;
}
export function R_BestiaryBookDraw() {
 const s = surface(); if ( !s ) return false;
 const snapshot = R_BestiarySnapshot(), entries = R_BestiaryEntries(), unlocked = new Set(snapshot.unlocked || []);
 const maximum = 2+R_BestiarySpreads().length; spread = clamp(spread,0,maximum);
 if ( !turn || now()-turn.at >= TURN_MS ) admit(entries,unlocked); // (a waiting turn starts once its pages are all there)
 const { ctx,width,height,unit } = s, boxes = layout(width,height,unit);
 const progress = turn ? clamp((now()-turn.at)/TURN_MS,0,1) : 1;
 ctx.save();
 try {
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1;
  if ( turn && progress < 1 ) drawTurn(ctx,turn,progress,entries,boxes,unlocked,unit);
  else { turn = null; drawSpread(ctx,spread,entries,boxes,unlocked,unit); }
  navigation(ctx,boxes,unit,width,maximum);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#d2c3a7';
  // one note under the book (the line the studio logo keeps clear): a waiting turn first, else the storage notice
  ctx.font = `${11*unit}px Georgia, serif`;
  if ( pending ) ctx.fillText( pending.failed ? ( pending.retried ? 'This page could not be loaded. Press again to turn to it without its pictures.' : 'This page could not be loaded. Press again to try once more.' ) : 'Turning the page\u2026', width/2, boxes.bottom+40*unit );
  else if ( snapshot.storageStatus === 'unavailable' ) ctx.fillText('Progress is kept for this session only.',width/2,boxes.bottom+40*unit);
 } finally { ctx.restore(); }
 return true;
}

// The first-discovery page (cards [1] and [39]). Its own clocks follow the encounter's phases, not one progress value:
//  * at once: the authored frame and title (the supplied blank folio and the entry's heading crop);
//  * while the camera moves (the enter phase's first ROLL seconds): the paper rolls up diagonally from its lower-left corner,
//    its curl travelling to the upper right;
//  * from the moment the game stops (snapshot.paused): the illustration and the handwriting are drawn by the supplied pencil
//    replay (r_folio.js, about 2.3 s) when its prepared data is ready, else revealed line by line from the top over REVEAL
//    seconds; the camera and the roll may still be moving;
//  * settled: one plain draw of the supplied page, unchanged.
// Only the paper is drawn, with a soft shadow at its edges: the rest of its half of the screen shows the live world (no matte).
// Each frame is drawn from the snapshot alone, so a cancel, a new encounter or a resize leaves nothing behind.
export const ROLL = .65, REVEAL = 1.6;
const smooth = x => { const t = clamp(x,0,1); return t*t*(3-2*t); };
function frame( ctx, entry, box, unit ) {
 const blank=R_BestiaryEntryBlank(),blankBox=blank&&fitImage(blank,box);
 const heading=R_BestiaryHeading(entry.id),sourceWidth=heading&&(heading.naturalWidth||heading.width),sourceHeight=heading&&(heading.naturalHeight||heading.height);
 if(blankBox&&sourceWidth>0&&sourceHeight>0){ctx.drawImage(blank,blankBox.x,blankBox.y,blankBox.w,blankBox.h);ctx.drawImage(heading,blankBox.x,blankBox.y,blankBox.w,blankBox.w*sourceHeight/sourceWidth);}
 else { ctx.fillStyle = '#e6dbc2'; ctx.fillRect( box.x, box.y, box.w, box.h ); title(ctx,entry.title,box,unit,'#31271e',.12); }
}
function reveal( ctx, image, box, amount ) {
 const imageBox = fitImage(image,box); if ( !imageBox ) return;
 ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
 if ( amount >= 1 ) { ctx.drawImage(image,imageBox.x,imageBox.y,imageBox.w,imageBox.h); return; }
 // line by line from the top: each band fades in quickly (a sharp writing edge, so the blank folio and the finished page are
 // seen together only briefly), the bands overlapping
 const rows = 24, alpha = ctx.globalAlpha;
 for ( let i = 0; i < rows; i ++ ) {
  const a = clamp((amount - i/rows*.88)/.12,0,1); if ( a <= 0 ) break;
  ctx.globalAlpha = alpha*a;
  ctx.drawImage(image,0,imageBox.sourceHeight*i/rows,imageBox.sourceWidth,imageBox.sourceHeight/rows,imageBox.x,imageBox.y+imageBox.h*i/rows,imageBox.w,imageBox.h/rows);
 }
 ctx.globalAlpha = alpha;
}
// The pencil replay (r_folio.js): chosen once an encounter's drawing begins, if its prepared data is ready by then, and kept
// for that encounter (never switching style half way); otherwise the line reveal.
let encounterStyle = null; // { id, folio }
function drawPage( ctx, snapshot, image, box, opacity ) {
 const id = snapshot.entry.id, paused = snapshot.paused ?? Infinity, age = clamp(snapshot.imageAge ?? 1,0,1);
 if ( encounterStyle?.id !== id ) encounterStyle = { id, folio: R_FolioPrepare(id) === 'ready' };
 ctx.globalAlpha = opacity*age;
 if ( encounterStyle.folio ) {
  const seconds = R_FolioSeconds(id), amount = seconds > 0 ? clamp(paused/seconds,0,1) : 1, shown = age < 1 ? Math.min(amount,age) : amount;
  const plate = shown < 1 ? R_FolioPlate(id,image,shown) : null, imageBox = fitImage(image,box);
  if ( shown >= 1 ) reveal(ctx,image,box,1);
  else if ( plate && imageBox ) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(plate,imageBox.x,imageBox.y,imageBox.w,imageBox.h); }
  else reveal(ctx,image,box,shown); // (no WebGL2 or a lost context: the line reveal)
 } else {
  const drawn = clamp(paused/REVEAL,0,1);
  reveal(ctx,image,box,age < 1 ? Math.min(drawn,age) : drawn);
 }
 ctx.globalAlpha = opacity;
}
export function R_BestiaryEncounterDraw() {
 const snapshot = R_BestiarySnapshot();
 if ( snapshot.phase === 'idle' || !snapshot.entry ) { encounterStyle = null; return false; }
 if ( snapshot.phase === 'enter' && !( ( snapshot.paused ?? 0 ) > 0 ) ) { R_FolioPrepare(snapshot.entry.id); if ( encounterStyle?.id === snapshot.entry.id ) encounterStyle = null; } // (begin loading; choose when the drawing starts)
 const s = surface(); if ( !s ) return false;
 const {ctx,width,height,unit} = s, half = width/2;
 const x = snapshot.side === 'left' ? half : 0, margin = Math.min(16*unit,half*.07);
 const h = Math.min(height-2*margin,(half-2*margin)*1.5), w = h*2/3;
 const box = rect(x+(half-w)/2,(height-h)/2,w,h);
 const roll = snapshot.phase === 'enter' ? smooth((snapshot.t ?? 1)/ROLL) : 1;
 const drawn = clamp((snapshot.paused ?? Infinity)/REVEAL,0,1);
 const opacity = snapshot.phase === 'return' ? clamp(snapshot.opacity,0,1) : 1;
 if ( !(opacity > 0) ) return false;
 ctx.save();
 try {
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = opacity;
  ctx.beginPath(); ctx.rect(x,0,half,height); ctx.clip();
  // the unrolled part: below the diagonal through the lower-left corner, swept up to the upper right
  const reach = roll*(box.w+box.h), bottom = box.y+box.h;
  if ( roll < 1 ) { ctx.beginPath(); ctx.moveTo(box.x-1,bottom+1); ctx.lineTo(box.x+reach,bottom+1); ctx.lineTo(box.x-1,bottom-reach); ctx.closePath(); ctx.clip(); }
  // the paper's own soft shadow on the world
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18*unit; ctx.shadowOffsetY = 4*unit; ctx.fillStyle = '#e6dbc2'; ctx.fillRect(box.x,box.y,box.w,box.h); ctx.restore();
  frame(ctx,snapshot.entry,box,unit);
  const unlocked = new Set(snapshot.unlocked || []), image = unlocked.has(snapshot.entry.id) ? R_BestiaryPage(snapshot.entry.id) : null;
  if ( image && drawn > 0 ) drawPage(ctx,snapshot,image,box,opacity);
  // the curl: a shaded band along the rolling edge
  if ( roll < 1 ) {
   const g = ctx.createLinearGradient(box.x+reach/2-6*unit,bottom-reach/2-6*unit,box.x+reach/2+6*unit,bottom-reach/2+6*unit);
   g.addColorStop(0,'rgba(255,248,230,0)'); g.addColorStop(.55,'rgba(255,248,230,.55)'); g.addColorStop(.8,'rgba(60,40,20,.45)'); g.addColorStop(1,'rgba(60,40,20,0)');
   ctx.save(); ctx.strokeStyle = g; ctx.lineWidth = 14*unit; ctx.beginPath(); ctx.moveTo(box.x+reach,bottom); ctx.lineTo(box.x,bottom-reach); ctx.stroke(); ctx.restore();
  }
 } finally { ctx.restore(); }
 return true;
}
