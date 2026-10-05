// Presentation only: the menu owns visibility, Draw_BeginFrame clears it on
// close, and loading failure never blocks startup or changes gameplay state.
import { Draw_GetOverlayCanvas } from './gl_draw.js';

let image = null, requested = false;
function artwork() {
 if ( !requested && typeof Image !== 'undefined' ) {
  requested = true;
  const candidate = new Image(); let finished = false;
  const finish = ok => {
   if ( finished ) return;
   finished = true; clearTimeout(timer);
   candidate.onload = candidate.onerror = null;
   if ( ok ) image = candidate;
  };
  const timer = setTimeout(() => { finish(false); candidate.src = ''; },30000);
  candidate.onload = () => finish(true); candidate.onerror = () => finish(false);
  try { candidate.src = new URL('../newer/ui/studio-logo.png',import.meta.url).href; }
  catch { finish(false); }
 }
 return image;
}

export function Draw_StudioLogo( occupiedCorner = null ) {
 const canvas = Draw_GetOverlayCanvas(), logo = artwork();
 if ( !canvas || !logo || !(canvas.width > 0 && canvas.height > 0) ) return false;
 const ctx = canvas.getContext('2d'); if ( !ctx ) return false;
 const width = canvas.clientWidth || canvas.width, height = canvas.clientHeight || canvas.height;
 const sourceWidth = logo.naturalWidth || logo.width, sourceHeight = logo.naturalHeight || logo.height;
 if ( !(sourceWidth > 0 && sourceHeight > 0) ) return false;
 const style = typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null;
 const right = Math.max(16,parseFloat(style?.getPropertyValue('--studio-safe-right')) || 0);
 const bottom = Math.max(16,parseFloat(style?.getPropertyValue('--studio-safe-bottom')) || 0);
 let scale = Math.min(128/sourceWidth,width*.2/sourceWidth,height*.2/sourceHeight,
  Math.max(0,width-right-16)/sourceWidth,Math.max(0,height-bottom-16)/sourceHeight);
 // A book can reach the viewport's lower-right corner. Fit entirely beside
 // its right edge or beneath its footer, whichever leaves more room.
 if ( occupiedCorner && Number.isFinite(occupiedCorner.right) && Number.isFinite(occupiedCorner.bottom) ) {
  scale = Math.min(scale,Math.max(Math.max(0,width-right-occupiedCorner.right)/sourceWidth,
   Math.max(0,height-bottom-occupiedCorner.bottom)/sourceHeight));
 }
 if ( !(scale > 0) ) return false;
 const w = sourceWidth*scale, h = sourceHeight*scale, sx = canvas.width/width, sy = canvas.height/height;
 ctx.save();
 try {
  ctx.setTransform(1,0,0,1,0,0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(logo,(width-right-w)*sx,(height-bottom-h)*sy,w*sx,h*sy);
 } finally { ctx.restore(); }
 return true;
}
