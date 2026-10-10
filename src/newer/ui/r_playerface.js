/**
 * @module newer/ui/r_playerface
 *
 * The player's status-bar face, composed in layers from the supplied v4.4.0 kit.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `M`, `SIZE`, `assets`, `poses`, `ready`, `loading`; 2
 * module-level collections (Map/Set).
 *
 * Errors: throws at 2 places; catches at 2 places.
 */
// Canvas layer composition ported from the owner-supplied v4.4.0 face kit.
// Keep full-cell origins, nearest sampling, manifest registration and layer order.
import { validatePlayerFaceManifest } from './playerface_manifest.js';
import { faceWaterStage } from './face_state.js';
import { COM_NewerJSON, COM_NewerURL } from '../../engine/common/pak.js';
let M, SIZE=96, assets, poses, ready=false, loading=null;
const images=new Map(),failed=new Set(),cache=new Map();
const BASE='newer/hud/playerface/';
const fallback=path=>new URL('../../../'+path,import.meta.url).href;
/**
 * Readiness of the layered face, for `R_NewerHudStatus` and its preload.
 *
 * @returns {{state: string, settled: boolean, pending: number, errors: Array<string>, version: ?string,
 *   assets: number, loadedImages: number}} `state` 'idle' (never asked; counts as settled), 'loading', 'ready' or
 *   'fallback' (something failed); `pending` 1 while loading; `errors` the failed source ids or error messages; the
 *   manifest's version and asset count; how many source images decoded
 */
export function R_PlayerFaceStatus(){return {state:ready?(failed.size?'fallback':'ready'):loading?'loading':'idle',settled:ready||!loading,pending:ready?0:loading?1:0,errors:[...failed],version:M?.version||null,assets:M?.assets?.length||0,loadedImages:images.size};}
/**
 * Loads the face kit's manifest (validated by `validatePlayerFaceManifest`) and every source image it names, once per
 * page; called by `R_NewerHudPreload` and on every Newer face draw (`Sbar_DrawFace`, sbar.js). The manifest and each
 * image have a 30 s deadline. Failures are recorded in `R_PlayerFaceStatus().errors` and the face then draws only what
 * loaded (or the native face).
 *
 * @returns {Promise<void>} the same promise on every call; resolves, never rejects, when loading has ended
 */
export function R_PlayerFacePreload(){
 if(loading)return loading;
 loading=(async()=>{
  let timer;
  try{
   M=await Promise.race([COM_NewerJSON(BASE+'manifest.json',fallback(BASE+'manifest.json')),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('manifest deadline')),30000);})]);
   validatePlayerFaceManifest(M);
   SIZE=M.cell_size;assets=new Map(M.assets.map(a=>[a.id,a]));poses=new Map(M.poses.map(p=>[p.id,p]));
   const sources=[...new Set(M.assets.map(a=>a.source).filter(Boolean))];
   await Promise.all(sources.map(id=>new Promise(resolve=>{
    if(typeof Image==='undefined'||typeof document==='undefined'){failed.add(id);resolve();return;}
    const img=new Image();let done=false;
    const finish=error=>{if(done)return;done=true;clearTimeout(deadline);img.onload=img.onerror=null;if(error)failed.add(id);else images.set(id,img);resolve();};
    const deadline=setTimeout(()=>{finish(true);img.src='';},30000);
    img.onload=()=>finish(false);img.onerror=()=>finish(true);
    try{img.src=COM_NewerURL(BASE+id+'.png',fallback(BASE+id+'.png')+'?v='+M.version);}catch{finish(true);}
   })));
  }catch(error){failed.add(String(error.message||error));}
  finally{clearTimeout(timer);ready=true;}
 })();return loading;
}

const waterFrameCache=new Map(),waterOverlayCache=new Map();
const HEALTH_LEVELS=10;
 const eyeStateFor=value=>typeof value==="string"&&Object.prototype.hasOwnProperty.call(M.eye_states,value)?value:"open";
 const clampPercent=value=>{const number=Number(value);return Number.isFinite(number)?Math.max(0,Math.min(100,Math.round(number))):100;};
 const clampHealth=value=>{const number=Number(value);return Number.isFinite(number)?Math.max(1,Math.min(HEALTH_LEVELS,Math.round(number))):1;};
 function healthStageForPercent(value) {return Math.min(HEALTH_LEVELS,Math.floor((100-clampPercent(value))/10)+1);}
 function healthBand(value) {return M.health.stages[clampHealth(value)-1];}
 function healthSelection(value) {
  // Stage remains authoritative for existing renderComposite callers, including
  // {...previousState,health:newStage}; setState synchronizes both fields below.
  const health=value.health!==undefined?clampHealth(value.health):healthStageForPercent(value.healthPercent??100);
  const band=healthBand(health),requested=clampPercent(value.healthPercent??band.default_percent);
  return {health,healthPercent:healthStageForPercent(requested)===health?requested:band.default_percent,band};
 }

 /**
  * Resolves a face state to its pose and the asset of each layer (base, expression, gaze or eyelid closure, invisibility
  * mask, blood, power-up eyes, water, diving-suit equipment), with the kit's own rules: the health stage stays
  * authoritative over a mismatched percent, closed eyes hide gaze and power-up eyes. Needs the manifest
  * (`R_PlayerFacePreload` finished).
  *
  * @param {{expression: string, look: string, health?: number, healthPercent?: number, strength?: boolean,
  *   invulnerability?: boolean, invisibility?: boolean, eyeState?: string, divingSuit?: boolean, waterPercent?: number,
  *   waterStage?: number, waterVisualStage?: number, waterSubmerged?: boolean, waterOpacity?: number}} [value] the face
  *   state from `R_PlayerFaceFrame` (r_facegame.js): `health` stage 1..10 (else from `healthPercent` 0..100), `eyeState` a manifest eye state (default 'open'), water as in
  *   `waterSelection`
  * @returns {object} `{pose, effect, renderedEffect, mode, eyeState, eyesOpen, health, healthPercent, band,
  *   waterPercent, waterStage, waterOpacity, layers}`; `effect` is 'purple' (Quad), 'yellow' (Pentagram), 'mixed' or
  *   null; `layers` maps layer name to an asset id, water node or null
  * @throws {Error} 'Unknown face pose.' when `expression`_`look` is not a manifest pose
  */
 export function faceSelection(value={}) {
  const pose = poses.get(`${value.expression}_${value.look}`);
  if(!pose) throw new Error("Unknown face pose.");
  const effect = value.strength && value.invulnerability ? "mixed" : value.strength ? "purple" : value.invulnerability ? "yellow" : null;
  const health=healthSelection(value),eyeState=eyeStateFor(value.eyeState),eyesOpen=eyeState==="open";
  const water=waterSelection(value);
  return {pose,effect,...water,renderedEffect:eyesOpen?effect:null,mode:effect?M.power_modes[effect]:null,eyeState,eyesOpen,...health,layers:{base:pose.base_asset,expression:pose.expression_asset,gaze:eyesOpen?pose.gaze_asset:null,closure:eyesOpen?null:pose.closure_layers[eyeState],mask:value.invisibility?pose.mask_asset:null,blood:health.health>1?pose.blood_layers[health.health-2]:null,eyes:eyesOpen&&effect?pose.eye_layers[effect]:null,water:waterNodeFor(value,pose),equipment:value.divingSuit?pose.equipment_layers.diving_suit:null}};
 }

 function drawRaster(ctx,img,rect,p={},finalClip=null) {
  const [sx,sy,sw,sh]=rect;
  const crop=p.source_clip || [0,0,SIZE,SIZE];
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  const polygon=finalClip||p.clip_polygon;
  if(polygon && polygon.length>=3) {
   ctx.beginPath();polygon.forEach(([x,y],index)=>index?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();
  }
  ctx.translate(SIZE/2+(p.x||0),SIZE/2+(p.y||0));
  ctx.rotate((p.rotation||0)*Math.PI/180);
  ctx.scale(p.scale_x??1,p.scale_y??1);
  ctx.drawImage(img,sx+crop[0]*sw/SIZE,sy+crop[1]*sh/SIZE,crop[2]*sw/SIZE,crop[3]*sh/SIZE,crop[0]-SIZE/2,crop[1]-SIZE/2,crop[2],crop[3]);
  ctx.restore();
 }
 function makeCanvas() {const c=document.createElement("canvas");c.width=SIZE;c.height=SIZE;return c;}
 function erasePolygons(ctx,polygons) {
  if(!polygons?.length)return;
  ctx.save();ctx.globalCompositeOperation="destination-out";ctx.fillStyle="#000";
  for(const polygon of polygons) {if(polygon.length<3)continue;ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  ctx.restore();
 }
 function applyVisorTint(ctx,tint,glint=null) {
  const pixels=ctx.getImageData(0,0,SIZE,SIZE).data,exterior=new Uint8Array(SIZE*SIZE),queue=new Int32Array(SIZE*SIZE);
  let head=0,tail=0;
  const visit=index=>{if(!exterior[index]&&pixels[index*4+3]===0){exterior[index]=1;queue[tail++]=index;}};
  for(let i=0;i<SIZE;i++){visit(i);visit((SIZE-1)*SIZE+i);visit(i*SIZE);visit(i*SIZE+SIZE-1);}
  while(head<tail){const index=queue[head++],x=index%SIZE;if(x>0)visit(index-1);if(x<SIZE-1)visit(index+1);if(index>=SIZE)visit(index-SIZE);if(index<SIZE*(SIZE-1))visit(index+SIZE);}
  ctx.save();ctx.globalCompositeOperation="source-over";ctx.fillStyle=`rgba(${tint.rgb.join(",")},${tint.alpha/255})`;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;){const start=x;while(x<SIZE&&!exterior[y*SIZE+x]&&pixels[(y*SIZE+x)*4+3]===0)x++;if(x>start)ctx.fillRect(start,y,x-start,1);else x++;}
  if(glint){ctx.fillStyle=`rgba(${glint.rgb.join(",")},${glint.alpha/255})`;for(const [x,y] of glint.pixels){const index=y*SIZE+x;if(x>=0&&x<SIZE&&y>=0&&y<SIZE&&!exterior[index]&&pixels[index*4+3]===0)ctx.fillRect(x,y,1,1);}}
  ctx.restore();
 }
 function renderNode(node,basePoseId=null,chain=[]) {
  if(node&&typeof node==="object"&&node.kind==="water_overlay")return renderWaterNode(node);
  if(typeof node==="string")return R_PlayerFaceLayer(node,basePoseId,chain);
  const c=makeCanvas(),ctx=c.getContext("2d",{alpha:true});
  if(!node)return {canvas:c,complete:true};
  if(node.unavailable)return {canvas:c,complete:false};
  let complete=true,content=makeCanvas(),contentCtx=content.getContext("2d",{alpha:true});
  if(node.asset) {const child=R_PlayerFaceLayer(node.asset,basePoseId,chain);complete=child.complete;contentCtx.drawImage(child.canvas,0,0);}
  else if(node.parts) {for(const part of node.parts) {const child=renderNode(part,basePoseId,chain);complete=complete&&child.complete;contentCtx.drawImage(child.canvas,0,0);}}
  else {const img=images.get(node.source);if(!img||failed.has(node.source)||!node.source_rect)complete=false;else for(let repeat=0;repeat<(node.repeat||1);repeat++)drawRaster(ctx,img,node.source_rect,node.placement||{},node.clip_polygon);}
  if(node.asset||node.parts)for(let repeat=0;repeat<(node.repeat||1);repeat++)drawRaster(ctx,content,[0,0,SIZE,SIZE],node.placement||{},node.clip_polygon);
  erasePolygons(ctx,node.exclude_polygons||node.placement?.exclude_polygons);
  if(node.placement?.clip_to_base) {
   const basePose=poses.get(basePoseId||node.reference_pose);
   if(basePose && !chain.includes(basePose.base_asset)) {const base=R_PlayerFaceLayer(basePose.base_asset,null,chain);complete=complete&&base.complete;ctx.save();ctx.globalCompositeOperation="destination-in";ctx.drawImage(base.canvas,0,0);ctx.restore();}
  }
  if(node.kind==="mask") {
   ctx.save();ctx.globalCompositeOperation="source-in";ctx.fillStyle="#000";ctx.fillRect(0,0,SIZE,SIZE);
   ctx.globalCompositeOperation="source-over";ctx.drawImage(c,0,0);ctx.drawImage(c,0,0);ctx.restore();
  }
  if(complete&&node.kind==="equipment"&&node.visor_tint)applyVisorTint(ctx,node.visor_tint,node.visor_glint);
  return {canvas:c,complete};
 }
 /**
  * Renders one manifest asset (or nested node) to a 96 x 96 (`cell_size`) canvas with nearest sampling, keeping
  * full-cell origins, manifest registration and layer order. Complete results are cached once loading has ended, for the
  * page's lifetime (do not draw into the returned canvas).
  *
  * @param {?string} id an asset id; null or '' gives an empty, complete canvas
  * @param {?string} [basePoseId=null] the pose whose base clips `clip_to_base` placements
  * @param {Array<string>} [chain=[]] asset ids already being rendered (cycle detection; callers omit it)
  * @returns {{canvas: HTMLCanvasElement, complete: boolean}} `complete` false when the asset or a source image is
  *   unavailable or not loaded
  * @throws {Error} 'Circular layer reference: <id>' when an asset includes itself
  */
 export function R_PlayerFaceLayer(id,basePoseId=null,chain=[]) {
  const cacheKey=`${id}:${basePoseId||""}`;if(cache.has(cacheKey))return cache.get(cacheKey);
  if(!id)return {canvas:makeCanvas(),complete:true};
  const asset=assets.get(id);if(!asset||!asset.available)return {canvas:makeCanvas(),complete:false};
  if(chain.includes(id))throw new Error(`Circular layer reference: ${id}`);
  const result=renderNode(asset,basePoseId,[...chain,id]);if(ready&&result.complete)cache.set(cacheKey,result);return result;
 }
 function drawAsset(ctx,node,basePoseId=null) {if(!node)return true;const layer=renderNode(node,basePoseId);ctx.drawImage(layer.canvas,0,0);return layer.complete;}
  // Water is a material layer, never a replacement portrait. One shared ten-frame
 // atlas feeds every expression/look; only the helmet-interior mask changes.
 /**
  * @param {*} value a percent (number or numeric string)
  * @param {number} [fallback=0] returned when `value` is not a finite number
  * @returns {number} `value` clamped to 0..100 (not rounded)
  */
 export function clampWaterPercent(value,fallback=0) {
  const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback;
 }
 function waterPercentLabel(value) {return String(Math.floor(clampWaterPercent(value)*10)/10);}
 /**
  * The water overlay stage for an air-use percent (`faceWaterStage` in face_state.js).
  *
  * @param {number} value air used, 0..100
  * @param {boolean} [submerged=false] whether the head is under water (adds one stage)
  * @returns {number} the stage 0..10 (0 = no overlay)
  */
 export function waterStageForPercent(value,submerged=false) {return faceWaterStage(value,submerged);}
 /**
  * The water part of a face state.
  *
  * @param {{waterPercent?: number, waterStage?: number, waterVisualStage?: number, waterSubmerged?: boolean,
  *   waterOpacity?: number}} [value] `waterPercent` air used 0..100 (else `waterStage` x 10); `waterVisualStage` an
  *   integer 0..10 shown as is (the drain after surfacing), else the stage is derived from the percent;
  *   `waterOpacity` 0..100 (default 50, the authored alpha)
  * @returns {{waterPercent: number, waterStage: number, waterOpacity: number}} clamped values; opacity rounded
  */
 export function waterSelection(value={}) {
  const waterPercent=clampWaterPercent(value.waterPercent??(Number(value.waterStage||0)*10));
  const visual=value.waterVisualStage;
  const waterStage=Number.isInteger(visual)&&visual>=0&&visual<=10?visual:waterStageForPercent(waterPercent,value.waterSubmerged===true);
  return {waterPercent,waterStage,waterOpacity:Math.round(clampWaterPercent(value.waterOpacity??50,50))};
 }
 function waterNodeFor(value,pose) {
  const water=waterSelection(value);
  if(!water.waterStage||!water.waterOpacity)return null;
  const target=M.water.targets[`${value.divingSuit?'diving':'helmet'}_${pose.head_direction}`];
  return {kind:'water_overlay',asset:M.water.frames[water.waterStage-1].asset,
   stage:water.waterStage,opacity:water.waterOpacity,clip_mask:target.mask_asset,
   target_rect:target.rect};
 }
 function rememberWater(map,key,result) {
  if(!ready||!result.complete)return result;
  if(map.has(key))map.delete(key);map.set(key,result);
  if(map.size>64)map.delete(map.keys().next().value);
  return result;
 }
 function renderWaterFrame(stage,opacity=50) {
  stage=Math.max(0,Math.min(10,Math.round(Number(stage)||0)));
  opacity=Math.round(clampWaterPercent(opacity,50));
  const key=`${stage}:${opacity}`;
  if(waterFrameCache.has(key))return waterFrameCache.get(key);
  const c=makeCanvas(),ctx=c.getContext('2d',{alpha:true});
  if(stage===0||opacity===0)return {canvas:c,complete:true};
  const source=R_PlayerFaceLayer(M.water.frames[stage-1].asset);
  ctx.drawImage(source.canvas,0,0);
  // The control governs the body opacity. The crest/bubbles retain more alpha,
  // so the timer remains readable without hiding facial detail. 50% restores
  // the authored RGBA alpha exactly. 0% is completely clear; 100% is opaque.
  if(opacity!==50) {
   const image=ctx.getImageData(0,0,SIZE,SIZE),pixels=image.data,k=opacity/100;
   for(let i=3;i<pixels.length;i+=4) {
    if(!pixels[i])continue;
    const highlight=Math.max(0,Math.min(1,(pixels[i]-128)/102));
    pixels[i]=Math.round(255*Math.min(1,k+highlight*(1-k)*.8*Math.min(1,k/.5)));
   }
   ctx.putImageData(image,0,0);
  }
  return rememberWater(waterFrameCache,key,{canvas:c,complete:source.complete});
 }
 function renderWaterNode(node) {
  const key=`${node.stage}:${node.opacity}:${node.clip_mask}:${node.target_rect.join(',')}`;
  if(waterOverlayCache.has(key))return waterOverlayCache.get(key);
  const frame=renderWaterFrame(node.stage,node.opacity),mask=R_PlayerFaceLayer(node.clip_mask);
  const c=makeCanvas(),ctx=c.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=false;
  const [x,y,w,h]=node.target_rect;
  ctx.drawImage(frame.canvas,0,0,SIZE,SIZE,x,y,w,h);
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(mask.canvas,0,0);
  ctx.globalCompositeOperation='source-over';
  return rememberWater(waterOverlayCache,key,{canvas:c,complete:frame.complete&&mask.complete});
 }
 /**
  * Renders only the water layer for a face state (for the face trials and tests).
  *
  * @param {object} value a face state, as `faceSelection`
  * @returns {{canvas: HTMLCanvasElement, complete: boolean}} the overlay clipped to the helmet interior (empty when
  *   there is no water)
  * @throws {Error} as `faceSelection`, for an unknown pose
  */
 export function R_PlayerFaceWaterOverlay(value) {
  const chosen=faceSelection(value);
  return renderNode(chosen.layers.water,chosen.pose.id);
 }
 /**
  * Composes the whole face for a state, layer by layer in the manifest's order; called by `Sbar_DrawFace` (sbar.js)
  * when the face state's key changes. The caller keeps the canvas only when `complete`.
  *
  * @param {object} value a face state, as `faceSelection`
  * @returns {{canvas: ?HTMLCanvasElement, complete: boolean, missing: Array<string>, selection?: object}} a new
  *   96 x 96 canvas, whether every layer was complete, the names of incomplete layers, and the `faceSelection` result;
  *   before the manifest is loaded, `canvas` is null and `missing` lists the errors plus 'loading'
  * @throws {Error} as `faceSelection`, for an unknown pose
  */
 export function R_PlayerFaceCompose(value) {
  if(!ready||!poses)return {canvas:null,complete:false,missing:[...failed,'loading']};
  const c=makeCanvas(),ctx=c.getContext("2d",{alpha:true}),selected=faceSelection(value),missing=[];
  for(const [key,node] of Object.entries(selected.layers)) if(node) {const layer=renderNode(node,selected.pose.id);ctx.drawImage(layer.canvas,0,0);if(!layer.complete)missing.push(key);}
  return {canvas:c,complete:missing.length===0,missing,selection:selected};
 }
