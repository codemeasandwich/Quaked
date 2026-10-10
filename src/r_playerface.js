// Canvas layer composition ported from the owner-supplied v4.4.0 face kit.
// Keep full-cell origins, nearest sampling, manifest registration and layer order.
import { validatePlayerFaceManifest } from './playerface_manifest.js';
import { faceWaterStage } from './face_state.js';
import { COM_NewerJSON, COM_NewerURL } from './engine/common/pak.js';
let M, SIZE=96, assets, poses, ready=false, loading=null;
const images=new Map(),failed=new Set(),cache=new Map();
const BASE='newer/hud/playerface/';
const fallback=path=>new URL('../'+path,import.meta.url).href;
export function R_PlayerFaceStatus(){return {state:ready?(failed.size?'fallback':'ready'):loading?'loading':'idle',settled:ready||!loading,pending:ready?0:loading?1:0,errors:[...failed],version:M?.version||null,assets:M?.assets?.length||0,loadedImages:images.size};}
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
 export function clampWaterPercent(value,fallback=0) {
  const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback;
 }
 function waterPercentLabel(value) {return String(Math.floor(clampWaterPercent(value)*10)/10);}
 export function waterStageForPercent(value,submerged=false) {return faceWaterStage(value,submerged);}
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
 export function R_PlayerFaceWaterOverlay(value) {
  const chosen=faceSelection(value);
  return renderNode(chosen.layers.water,chosen.pose.id);
 }
 export function R_PlayerFaceCompose(value) {
  if(!ready||!poses)return {canvas:null,complete:false,missing:[...failed,'loading']};
  const c=makeCanvas(),ctx=c.getContext("2d",{alpha:true}),selected=faceSelection(value),missing=[];
  for(const [key,node] of Object.entries(selected.layers)) if(node) {const layer=renderNode(node,selected.pose.id);ctx.drawImage(layer.canvas,0,0);if(!layer.complete)missing.push(key);}
  return {canvas:c,complete:missing.length===0,missing,selection:selected};
 }
