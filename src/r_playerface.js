// Canvas layer composition ported from the owner-supplied v4.1.0 face kit.
// Keep full-cell origins, nearest sampling, manifest registration and layer order.
import { COM_NewerJSON, COM_NewerURL } from './pak.js';
let M, SIZE=96, assets, poses, ready=false, loading=null;
const images=new Map(),failed=new Set(),cache=new Map();
const BASE='newer/hud/playerface/';
const fallback=path=>new URL('../'+path,import.meta.url).href;
export function R_PlayerFaceStatus(){return {state:ready?(failed.size?'fallback':'ready'):loading?'loading':'idle',settled:ready||!loading,pending:ready?0:loading?1:0,errors:[...failed]};}
export function R_PlayerFacePreload(){
 if(loading)return loading;
 loading=(async()=>{
  let timer;
  try{
   M=await Promise.race([COM_NewerJSON(BASE+'manifest.json',fallback(BASE+'manifest.json')),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('manifest deadline')),30000);})]);
   if(!M||M.cell_size!==96||M.poses.length!==25||M.assets.length!==236)throw new Error('invalid face manifest');
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
export function faceSelection(value){
 const pose=poses.get(`${value.expression}_${value.look}`);if(!pose)throw new Error('Unknown face pose');
 const health=value.health??Math.min(10,Math.floor((100-Math.max(0,Math.min(100,Math.round(value.healthPercent??100))))/10)+1);
 const effect=value.strength&&value.invulnerability?'mixed':value.strength?'purple':value.invulnerability?'yellow':null;
 return {pose,effect,health,layers:{base:pose.base_asset,expression:pose.expression_asset,gaze:pose.gaze_asset,mask:value.invisibility?pose.mask_asset:null,blood:health>1?pose.blood_layers[health-2]:null,eyes:effect?pose.eye_layers[effect]:null}};
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
 function renderNode(node,basePoseId=null,chain=[]) {
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
 export function R_PlayerFaceCompose(value) {
  if(!ready||!poses)return {canvas:null,complete:false,missing:[...failed,'loading']};
  const c=makeCanvas(),ctx=c.getContext("2d",{alpha:true}),selected=faceSelection(value),missing=[];
  for(const [key,node] of Object.entries(selected.layers)) if(node) {const layer=renderNode(node,selected.pose.id);ctx.drawImage(layer.canvas,0,0);if(!layer.complete)missing.push(key);}
  return {canvas:c,complete:missing.length===0,missing,selection:selected};
 }
