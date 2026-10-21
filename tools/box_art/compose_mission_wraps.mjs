/** Owner-selected seamless mission wraps. Original raster type/photos/icons only.
 * Run from repository root. Writes authoring masters/provenance, never runtime or game data.
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out='assets/authoring/box_art/mission-wraps-2026-10-21/';
const plan=JSON.parse(await fs.readFile(out+'foreground-plan.json','utf8'));
const ownerBackgrounds=JSON.parse(await fs.readFile(out+'owner-backgrounds.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const hipSpine='assets/authoring/box_art/originals-2026-10-20/hipnotic/spine.png';
const rogueSpine='assets/authoring/box_art/originals-2026-10-20/rogue/spine.png';
const spineSpecs=[
 ['medallion',[419,62,189,194],[50,80,240,246],'ellipse'],
 ['Q',[406,404,222,168],[28,530,284,215],'largest'],
 ['U',[488,632,85,76],[133,824,109,98],'all'],
 ['A',[488,783,87,73],[133,1021,112,94],'all'],
 ['K',[488,936,87,79],[133,1220,112,102],'all'],
 ['E',[488,1084,87,78],[133,1413,112,100],'all'],
 ['MISSION PACK NO.',[437,539,43,592],[65,702,56,770],'all'],
 ['id',[452,1285,113,134],[98,1660,144,171],'opaque'],
 ['CD-ROM',[405,1421,215,39],[30,1855,280,51],'all'],
 ['Activision',[405,1466,225,62],[24,1920,292,80],'all']
];
const records=[];
async function makeLayer(source,rect,destination,mode,name,{spine=false,body=false}={}){
 const [left,top,width,height]=rect,[dx,dy,dw,dh]=destination;
 const bytes=await fs.readFile(source),{data}=await sharp(bytes).extract({left,top,width,height}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const alpha=new Uint8Array(width*height);let selectedComponents=0;
 if(mode==='opaque')alpha.fill(255);
 else if(mode==='ellipse'){
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const radius=Math.hypot((x+.5-width/2)/(width/2-1),(y+.5-height/2)/(height/2-1));
   alpha[y*width+x]=Math.round(255*Math.max(0,Math.min(1,(1-radius)*Math.min(width,height))));
  }
 }else{
  const seed=new Uint8Array(alpha.length);
  for(let i=0;i<seed.length;i++){
   const r=data[i*3],g=data[i*3+1],b=data[i*3+2];
   // Bounded local cream-ink key; brown/yellow rock cannot pass on luminance alone.
   seed[i]=spine?Math.min(r,g,b)>200:(r>200&&g>190&&b>160&&Math.max(r,g,b)-Math.min(r,g,b)<60)?1:0;
  }
  const seen=new Uint8Array(seed.length),components=[];
  for(let i=0;i<seed.length;i++)if(seed[i]&&!seen[i]){
   const q=[i];seen[i]=1;let minY=height,maxY=0;
   for(let j=0;j<q.length;j++){
    const at=q[j],x=at%width,y=(at/width)|0;minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){
     const n=yy*width+xx;if(seed[n]&&!seen[n]){seen[n]=1;q.push(n);}
    }
   }
   if(!body||maxY-minY+1<=40)components.push(q); // Local body lines are under40px; exclude pale rock islands.
  }
  components.sort((a,b)=>b.length-a.length);
  // All small glyph pieces, punctuation and registered marks survive local masks.
  const selected=mode==='largest'?components.slice(0,1):components;
  selectedComponents=selected.length;
  for(const component of selected)for(const p of component){
   const x=p%width,y=(p/width)|0;
   for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){
    const i=yy*width+xx;const r=data[i*3],g=data[i*3+1],b=data[i*3+2];
    const edge=spine?Math.min(r,g,b)>150:(r>170&&g>160&&b>130&&Math.max(r,g,b)-Math.min(r,g,b)<85);
    if(i===p||edge)alpha[i]=Math.max(alpha[i],i===p?255:96);
   }
  }
 }
 const thin=!spine&&(body||name.includes(':text-')||name.endsWith(':requirement')||name.endsWith(':dissolutionTitle')||name.endsWith(':header-mission')||name.endsWith(':published')||name.endsWith(':developed')||name.endsWith(':distributed'));
 if(thin){
  // Local white top-hat: estimate the printed-paper background with a5x5
  // opening so thin source ink survives without selecting whole bright rocks.
  const value=new Uint8Array(alpha.length),eroded=new Uint8Array(alpha.length),opened=new Uint8Array(alpha.length);
  for(let i=0;i<value.length;i++)value[i]=Math.min(data[i*3],data[i*3+1],data[i*3+2]);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){let v=255;for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(width-1,x+2);xx++)v=Math.min(v,value[yy*width+xx]);eroded[y*width+x]=v;}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){let v=0;for(let yy=Math.max(0,y-2);yy<=Math.min(height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(width-1,x+2);xx++)v=Math.max(v,eroded[yy*width+xx]);opened[y*width+x]=v;}
  for(let i=0;i<alpha.length;i++)alpha[i]=Math.round(255*Math.max(0,Math.min(1,(value[i]-opened[i]-7)/35)));
 }
 const rgba=Buffer.alloc(width*height*4),ink=mode==='all'||mode==='largest';
 for(let i=0;i<alpha.length;i++){
  // Neutral ivory matches the source spine; only source glyph alpha is reused.
  rgba[i*4]=ink?242:data[i*3];rgba[i*4+1]=ink?240:data[i*3+1];rgba[i*4+2]=ink?224:data[i*3+2];rgba[i*4+3]=alpha[i];
 }
 const scale=Math.min(dw/width,dh/height),w=Math.round(width*scale),h=Math.round(height*scale);
 const x=dx+Math.floor((dw-w)/2),y=dy+Math.floor((dh-h)/2);
 assert.ok(x>=0&&y>=0&&x+w<=3620&&y+h<=2000,name+' destination');
 records.push({name,source,sourceSha256:hash(bytes),sourceRectangle:{left,top,width,height},destination:{left:x,top:y,width:w,height:h},uniformScale:scale,mask:mode,localInkKey:ink?(spine?'minRGB>200':'R>200,G>190,B>160,chroma<60; local body CC height<=40; source-conditioned edge alpha'):null,selectedComponents,maskSha256:hash(alpha),thinInkTopHat:thin,shadow:ink?'1source-pixel,55%black':null});
 let foreground=await sharp(rgba,{raw:{width,height,channels:4}}).png().toBuffer();
 if(ink){
  const shadow=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){let a=0;for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++)a=Math.max(a,alpha[yy*width+xx]);shadow[(y*width+x)*4+3]=Math.round(a*.55);}
  foreground=await sharp(shadow,{raw:{width,height,channels:4}}).composite([{input:foreground,left:0,top:0}]).png().toBuffer();
 }
 return{input:await sharp(foreground).resize(w,h,{kernel:'lanczos3'}).png().toBuffer(),left:x,top:y};
}
for(const game of ['hipnotic','rogue']){
 const background=out+game+'/background.png';
 const donor=await fs.readFile(background),owner=ownerBackgrounds.find(row=>row.game===game);
 assert.equal(hash(donor),owner.sha256,'Owner background changed');
 const metadata=await sharp(donor).metadata(),wrapWidth=Math.round(metadata.width/metadata.height*2000),faceWidth=(wrapWidth-340)/2;
 assert.ok(Number.isInteger(faceWidth),'equal original-aspect face widths');
 const bg=await sharp(donor).resize({height:2000,kernel:'lanczos3'}).png().toBuffer();
 assert.equal((await sharp(bg).metadata()).width,wrapWidth);
 const panelOffsets={back:0,spine:faceWidth,front:faceWidth+340};
 const layers=[];
 for(const face of ['back','front']){
  const source=`assets/authoring/box_art/originals-2026-10-20/${game}/${face}.jpg`;
  const native=await sharp(source).metadata(),spec=plan[game][face],offset=panelOffsets[face];
  assert.deepEqual([native.width,native.height],spec.size,'Immutable source dimensions');
  const row={crop:{left:0,top:0,width:native.width,height:native.height}};
  const scale=Math.min(faceWidth/row.crop.width,2000/row.crop.height),cx=Math.floor((faceWidth-Math.round(row.crop.width*scale))/2),cy=Math.floor((2000-Math.round(row.crop.height*scale))/2);
  const destination=rect=>[offset+cx+Math.round((rect[0]-row.crop.left)*scale),cy+Math.round((rect[1]-row.crop.top)*scale),Math.round(rect[2]*scale),Math.round(rect[3]*scale)];
  const text=Array.isArray(spec.text)?spec.text.map((rect,i)=>['text-'+i,rect]):Object.entries(spec.text);
  for(const [name,rect]of text){
   if(name==='quakeMissionHeader'){
    const header=game==='hipnotic'?[['Q',[47,35,158,207],'largest'],['U',[247,89,101,88],'all'],['A',[365,89,103,88],'all'],['K',[482,89,107,88],'all'],['E-mark',[602,87,113,90],'all'],['mission',[175,177,540,43],'all']]:[['Q',[47,40,158,201],'largest'],['U',[247,92,101,85],'all'],['A',[367,92,103,85],'all'],['K',[483,92,107,85],'all'],['E-mark',[603,90,111,87],'all'],['mission',[175,178,540,45],'all']];
    for(const [part,box,mode]of header)layers.push(await makeLayer(source,box,destination(box),mode,game+':'+face+':header-'+part));
   }else layers.push(await makeLayer(source,rect,destination(rect),'all',game+':'+face+':'+name,{body:face==='back'&&rect[3]>45}));
  }
  for(const [i,rect]of (spec.screenshots??[]).entries())layers.push(await makeLayer(source,rect,destination(rect),'opaque',game+':'+face+':screenshot-'+i));
  for(const [name,planned]of Object.entries(spec.badges??{})){
   const rect=name==='id'?(game==='hipnotic'?[12,789,65,73]:[23,800,57,63]):planned;
   layers.push(await makeLayer(source,rect,destination(rect),name==='medallion'?'ellipse':'opaque',game+':'+face+':'+name));
  }
  if(face==='back'){
   const footer=game==='hipnotic'?[['id',[45,803,65,73],'opaque'],['published',[38,787,79,16],'all'],['distributed',[612,808,82,18],'all'],['activision',[565,825,156,50],'all']]:[['id',[48,807,64,70],'opaque'],['published',[43,787,76,20],'all'],['distributed',[359,808,80,19],'all'],['activision',[319,827,145,48],'all'],['developed',[659,790,57,18],'all'],['rogueLogo',[664,810,48,69],'opaque']];
   for(const [name,rect,mode]of footer)layers.push(await makeLayer(source,rect,destination(rect),mode,game+':'+face+':'+name));
  }
 }
 for(const [name,rect,dest,mode]of spineSpecs){
  const placement=[faceWidth+dest[0],...dest.slice(1)];layers.push(await makeLayer(hipSpine,rect,placement,mode,game+':spine:'+name,{spine:true}));
 }
 const numeral=game==='hipnotic'?[437,1135,43,35]:[452,1109,43,37];
 layers.push(await makeLayer(game==='hipnotic'?hipSpine:rogueSpine,numeral,[faceWidth+65,1474,56,48],'all',game+':spine:mission-number',{spine:true}));
 const composed=await sharp(bg).composite(layers).png().toBuffer();await fs.writeFile(out+game+'/wrap-master.png',composed);
 for(const [face,left,width]of [['back',0,faceWidth],['spine',faceWidth,340],['front',faceWidth+340,faceWidth]])await sharp(composed).extract({left,top:0,width,height:2000}).png().toFile(out+game+'/'+face+'-master.png');
 records.push({game,background,backgroundSha256:hash(donor),wrap:out+game+'/wrap-master.png',wrapSha256:hash(composed),ownerNativeDimensions:[metadata.width,metadata.height],wrapDimensions:[wrapWidth,2000],faceWidth,panels:panelOffsets,scope:'Owner-selected background; original source raster foreground, no black footer fill or generated typography.'});
}
await fs.writeFile(out+'composition.json',JSON.stringify({version:1,scope:'Owner-selected continuous backgrounds and deterministic original raster foreground authoring; no generated lettering or runtime mutation',wrapGeometry:'Per owner-donor native aspect; see game records for exact widths/panel offsets',sourcePlan:out+'foreground-plan.json',spineCommonSource:hipSpine,spineSpecs,records},null,2)+'\n');
console.log(out+'hipnotic/wrap-master.png\n'+out+'rogue/wrap-master.png');
