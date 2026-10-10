/* The analysis worker of the owner-supplied folio-pencil-fast-replay.html, copied verbatim (its <script id="analysis-worker">,
 * lines 90-432): /Users/bri/Desktop/folio-pencil-fast-replay.html, sha256 b864769450933bf95e23af478223bdbca6ed808fef7af14d1b559b7e3f115295.
 * Used offline by tools/prepare_folio.mjs (card: Folio pencil fast replay); the game does not run it. */
'use strict';
/* Source-driven analyzer. No page-specific contours, labels, fonts or artwork.
 * Inputs: pixels + normalized template; outputs: sampled-paper underpaint,
 * detected skeleton paths, and per-texel path / arclength ownership.
 * Runs in an embedded Blob Worker, also usable without a DOM for testing.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function blur(a,w,h,r){
 const tmp=new Float32Array(a.length),out=new Float32Array(a.length),n=r*2+1;
 for(let y=0;y<h;y++){const row=y*w;let sum=0;for(let k=-r;k<=r;k++)sum+=a[row+clamp(k,0,w-1)];for(let x=0;x<w;x++){tmp[row+x]=sum/n;sum+=a[row+clamp(x+r+1,0,w-1)]-a[row+clamp(x-r,0,w-1)];}}
 for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=tmp[clamp(k,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/n;sum+=tmp[clamp(y+r+1,0,h-1)*w+x]-tmp[clamp(y-r,0,h-1)*w+x];}}
 return out;
}
function distance(mask,w,h,toInk=false){
 const out=new Float32Array(mask.length);for(let i=0;i<out.length;i++)out[i]=(!!mask[i]===toInk)?0:1e6;
 const s=Math.SQRT2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let i=y*w+x,d=out[i];if(x)d=Math.min(d,out[i-1]+1);if(y){d=Math.min(d,out[i-w]+1);if(x)d=Math.min(d,out[i-w-1]+s);if(x<w-1)d=Math.min(d,out[i-w+1]+s);}out[i]=d;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){let i=y*w+x,d=out[i];if(x<w-1)d=Math.min(d,out[i+1]+1);if(y<h-1){d=Math.min(d,out[i+w]+1);if(x)d=Math.min(d,out[i+w-1]+s);if(x<w-1)d=Math.min(d,out[i+w+1]+s);}out[i]=d;}
 return out;
}
function components(mask,w,h,minSize=1){
 const seen=new Uint8Array(mask.length),q=new Int32Array(mask.length),groups=[];
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;let a=0,b=1; q[0]=i;seen[i]=1;let x0=w,y0=h,x1=0,y1=0;
  while(a<b){const k=q[a++],x=k%w,y=(k/w)|0;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const j=yy*w+xx;if(mask[j]&&!seen[j]){seen[j]=1;q[b++]=j;}}
  }
  if(b<minSize){for(let z=0;z<b;z++)mask[q[z]]=0;}else groups.push({pixels:Array.from(q.subarray(0,b)),x0,y0,x1,y1,area:b});
 }
 return groups;
}
function thin(src,w,h){
 const m=src.slice(),del=new Int32Array(src.length),active=[];for(let i=w+1;i<(h-1)*w-1;i++)if(m[i])active.push(i);
 for(let it=0;it<55;it++){let removed=0;
  for(let pass=0;pass<2;pass++){let n=0;
   for(let k=0;k<active.length;k++){let i=active[k];if(!m[i])continue;const p2=m[i-w],p3=m[i-w+1],p4=m[i+1],p5=m[i+w+1],p6=m[i+w],p7=m[i+w-1],p8=m[i-1],p9=m[i-w-1];
    const B=p2+p3+p4+p5+p6+p7+p8+p9;if(B<2||B>6)continue;
    const A=(!p2&&p3)+(!p3&&p4)+(!p4&&p5)+(!p5&&p6)+(!p6&&p7)+(!p7&&p8)+(!p8&&p9)+(!p9&&p2);if(A!==1)continue;
    if(pass===0){if(p2*p4*p6||p4*p6*p8)continue;}else if(p2*p4*p8||p2*p6*p8)continue;del[n++]=i;
   }
   for(let k=0;k<n;k++)m[del[k]]=0;removed+=n;
  }
  if(!removed)break;
 }
 return m;
}
function simplify(pts,epsilon=.48){
 if(pts.length<=2)return pts;
 const keep=new Uint8Array(pts.length),stack=[[0,pts.length-1]];keep[0]=keep[pts.length-1]=1;
 while(stack.length){const [a,b]=stack.pop(),p=pts[a],q=pts[b],dx=q[0]-p[0],dy=q[1]-p[1],ll=dx*dx+dy*dy;let best=epsilon*epsilon,j=-1;
  for(let i=a+1;i<b;i++){const t=ll?clamp(((pts[i][0]-p[0])*dx+(pts[i][1]-p[1])*dy)/ll,0,1):0;const d=(pts[i][0]-p[0]-dx*t)**2+(pts[i][1]-p[1]-dy*t)**2;if(d>best){best=d;j=i;}}
  if(j>=0){keep[j]=1;stack.push([a,j],[j,b]);}
 }
 return pts.filter((_,i)=>keep[i]);
}
function measure(pts){
 let len=0,turn=0,maxDev=0;const cum=[0],A=pts[0],B=pts.at(-1),dx=B[0]-A[0],dy=B[1]-A[1],chord=Math.hypot(dx,dy);
 for(let i=1;i<pts.length;i++){len+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);cum.push(len);if(i>1){const ax=pts[i-1][0]-pts[i-2][0],ay=pts[i-1][1]-pts[i-2][1],bx=pts[i][0]-pts[i-1][0],by=pts[i][1]-pts[i-1][1];turn+=Math.abs(Math.atan2(ax*by-ay*bx,ax*bx+ay*by));}}
 for(const p of pts)maxDev=Math.max(maxDev,Math.abs(dy*(p[0]-A[0])-dx*(p[1]-A[1]))/(chord||1));
 let kind='curve',arc=null;
 if((chord/Math.max(len,.01)>.965&&maxDev<Math.max(.8,len*.018))||pts.length===2)kind='straight';
 else if(pts.length>=4&&len>7){
  let mx=0,my=0;for(const p of pts){mx+=p[0];my+=p[1];}mx/=pts.length;my/=pts.length;
  let xx=0,yy=0,xy=0,xz=0,yz=0;
  for(const p of pts){const x=p[0]-mx,y=p[1]-my,z=x*x+y*y;xx+=x*x;yy+=y*y;xy+=x*y;xz+=x*z;yz+=y*z;}
  const det=xx*yy-xy*xy;if(Math.abs(det)>1e-6){const cx=mx+(xz*yy-yz*xy)/(2*det),cy=my+(yz*xx-xz*xy)/(2*det);let rad=0,err=0,sweep=0,absSweep=0;
   for(const p of pts)rad+=Math.hypot(p[0]-cx,p[1]-cy);rad/=pts.length;
   for(let i=0;i<pts.length;i++){err+=(Math.hypot(pts[i][0]-cx,pts[i][1]-cy)-rad)**2;if(i){let da=Math.atan2(pts[i][1]-cy,pts[i][0]-cx)-Math.atan2(pts[i-1][1]-cy,pts[i-1][0]-cx);da=Math.atan2(Math.sin(da),Math.cos(da));sweep+=da;absSweep+=Math.abs(da);}}
   err=Math.sqrt(err/pts.length);if(rad>1.7&&rad<6000&&err<Math.max(.65,rad*.045)&&Math.abs(sweep)>.32&&Math.abs(sweep)/Math.max(absSweep,.001)>.87){kind='arc';arc={center:[cx,cy],radius:rad,sweep};}
  }
 }
 const ws=pts.map(p=>p[2]).sort((a,b)=>a-b);return {length:len,cumulative:cum,width:ws[ws.length>>1],class:kind,curvature:turn/Math.max(len,.001),arc};
}
function detectSubtitle(rgb,w,h,regions){
 const mask=new Uint8Array(w*h),s=w/1024;
 for(let y=Math.floor(h*.132);y<Math.ceil(h*.157);y++)for(let x=Math.floor(w*.28);x<Math.ceil(w*.76);x++){const i=y*w+x;if(rgb[i*4+1]<108&&rgb[i*4]<168)mask[i]=1;}
 const g=components(mask,w,h,5).filter(c=>c.y1-c.y0>7*s&&c.y1-c.y0<36*s&&c.x1-c.x0<48*s&&c.area<800*s*s);
 if(g.length<8)return null;const x0=Math.min(...g.map(g=>g.x0)),x1=Math.max(...g.map(g=>g.x1)),y0=Math.min(...g.map(g=>g.y0)),y1=Math.max(...g.map(g=>g.y1));
 if(x1-x0<w*.17||y1-y0>h*.033)return null;
 const r=[(x0-3*s)/w,(y0-3*s)/h,(x1+4*s)/w,(y1+4*s)/h];
 for(let y=Math.floor(r[1]*h);y<=r[3]*h;y++)for(let x=Math.floor(r[0]*w);x<=r[2]*w;x++)regions[y*w+x]=0;
 return {name:'Detected subtitle',box:r,role:'protect',automatic:true};
}
/* A planned pencil movement is deliberately different from an ink-pixel walk.
 * This module uses source-measured feature curves for contours and glyphs,
 * and an orientation field for inferred shading movements. No new ink/color
 * is painted: the two ownership maps only expose original source texels.
 *
 * References (conceptual; independent implementation):
 * Proko, 6 Habits for Good Line Quality / The Tapered Stroke.
 * Tong et al., AAAI 2021, arXiv:2012.09004, direction-guided pencil strokes.
 * Kang, Lee & Chui, NPAR 2007, coherent line drawing / tangent flow.
 */
function resamplePolyline(pts,step){
 const m=measure(pts),out=[pts[0].slice()];let j=1;
 for(let s=step;s<m.length;s+=step){while(j<m.cumulative.length-1&&m.cumulative[j]<s)j++;let a=pts[j-1],b=pts[j],t=(s-m.cumulative[j-1])/(m.cumulative[j]-m.cumulative[j-1]||1);out.push(a.map((v,c)=>v+(b[c]-v)*t));}
 out.push(pts.at(-1).slice());return out;
}
function quadraticPoints(a,c,b,width,step=2){
 const n=Math.max(2,Math.ceil((Math.hypot(c[0]-a[0],c[1]-a[1])+Math.hypot(b[0]-c[0],b[1]-c[1]))/step)),out=[];
 for(let k=0;k<=n;k++){const t=k/n,u=1-t;out.push([u*u*a[0]+2*u*t*c[0]+t*t*b[0],u*u*a[1]+2*u*t*c[1]+t*t*b[1],width]);}return out;
}
function cubicPoint(c,t){const u=1-t;return [u*u*u*c[0][0]+3*u*u*t*c[1][0]+3*u*t*t*c[2][0]+t*t*t*c[3][0],u*u*u*c[0][1]+3*u*u*t*c[1][1]+3*u*t*t*c[2][1]+t*t*t*c[3][1]];}
function smoothPrimitives(raw,tolerance,scale,isGlyph=false){
 if(raw.length<2)return [];
 let pts=resamplePolyline(raw,Math.max(.6,scale*(isGlyph?.9:2.4)));
 if(pts.length>4){const radius=isGlyph?1:3,old=pts;pts=old.map((p,i)=>{if(!i||i===old.length-1)return p;let x=0,y=0,z=0;for(let j=-radius;j<=radius;j++){let k=clamp(i+j,0,old.length-1),v=radius+1-Math.abs(j);x+=old[k][0]*v;y+=old[k][1]*v;z+=v;}return [x/z,y/z,p[2]];});}
 const strokes=[];
 function fit(p,depth){
  if(p.length<2)return;const m=measure(p),a=p[0],b=p.at(-1),chord=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(m.length<.2)return;
  let dev=0;for(const v of p)dev=Math.max(dev,Math.abs((b[1]-a[1])*(v[0]-a[0])-(b[0]-a[0])*(v[1]-a[1]))/(chord||1));
  if(chord/m.length>.95&&dev<tolerance*.8){strokes.push({points:[a,b],primitive:'line',controls:[a.slice(0,2),b.slice(0,2)],fitError:dev});return;}
  // One cubic movement at a time. Non-monotonic loops are divided before fit.
  if(chord<m.length*.2&&p.length>6){const k=p.length>>1;fit(p.slice(0,k+1),depth+1);fit(p.slice(k),depth+1);return;}
  const k=Math.min(p.length-1,isGlyph?2:3),ta=[p[k][0]-a[0],p[k][1]-a[1]],tb=[p[p.length-1-k][0]-b[0],p[p.length-1-k][1]-b[1]];
  let z=Math.hypot(...ta)||1;ta[0]/=z;ta[1]/=z;z=Math.hypot(...tb)||1;tb[0]/=z;tb[1]/=z;
  let aa=0,ab=0,bb=0,ar=0,br=0;
  for(let i=1;i<p.length-1;i++){const t=m.cumulative[i]/m.length,u=1-t,b1=3*u*u*t,b2=3*u*t*t,rx=p[i][0]-(u*u*u+b1)*a[0]-(b2+t*t*t)*b[0],ry=p[i][1]-(u*u*u+b1)*a[1]-(b2+t*t*t)*b[1];aa+=b1*b1;bb+=b2*b2;ab+=b1*b2*(ta[0]*tb[0]+ta[1]*tb[1]);ar+=b1*(ta[0]*rx+ta[1]*ry);br+=b2*(tb[0]*rx+tb[1]*ry);}
  const det=aa*bb-ab*ab;let da=det>1e-9?(ar*bb-br*ab)/det:chord/3,db=det>1e-9?(br*aa-ar*ab)/det:chord/3;
  da=clamp(da,chord*.08,m.length*.6);db=clamp(db,chord*.08,m.length*.6);
  const c=[a.slice(0,2),[a[0]+ta[0]*da,a[1]+ta[1]*da],[b[0]+tb[0]*db,b[1]+tb[1]*db],b.slice(0,2)];
  let err=0,split=1;for(let i=1;i<p.length-1;i++){let q=cubicPoint(c,m.cumulative[i]/m.length),d=Math.hypot(q[0]-p[i][0],q[1]-p[i][1]);if(d>err){err=d;split=i;}}
  if(err>tolerance&&p.length>5&&depth<9){split=clamp(split,2,p.length-3);fit(p.slice(0,split+1),depth+1);fit(p.slice(split),depth+1);return;}
  let points=[];const n=Math.max(3,Math.ceil(m.length/Math.max(.6,scale*(isGlyph?.8:1.5))));for(let i=0;i<=n;i++){const t=i/n,q=cubicPoint(c,t);points.push([q[0],q[1],m.width]);}
  points=simplify(points,.13*scale);let kind='cubic';const mm=measure(points);
  if(mm.class==='arc'&&mm.arc&&err<tolerance){const ar=mm.arc,ang=Math.atan2(a[1]-ar.center[1],a[0]-ar.center[0]);let arcErr=0;for(const q of points)arcErr=Math.max(arcErr,Math.abs(Math.hypot(q[0]-ar.center[0],q[1]-ar.center[1])-ar.radius));if(arcErr<tolerance*.6){kind='circular arc';}}
  strokes.push({points,primitive:kind,controls:c,fitError:err});
 }
 // Split at real changes of direction, not at each raster staircase.
 let start=0;for(let i=3;i<pts.length-3;i++){const a=pts[i-3],b=pts[i],c=pts[i+3],ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1],dot=(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1);if(dot<(isGlyph?.05:.35)&&i-start>4){fit(pts.slice(start,i+1),0);start=i;}}
 fit(pts.slice(start),0);return strokes;
}
function traceCleanGraph(skeleton,w,h,regions,scale,widthAt,allowed,minLength,isGlyph=false){
 const N=w*h,dx=[0,1,1,1,0,-1,-1,-1],dy=[-1,-1,0,1,1,1,0,-1],off=dx.map((v,k)=>v+dy[k]*w),adj=new Uint8Array(N),visited=new Uint8Array(N),degree=new Uint8Array(N),nodes=[],out=[];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!skeleton[i]||!allowed(i))continue;let bits=0,n=0;for(let d=0;d<8;d++){const j=i+off[d];if(!skeleton[j]||regions[j]!==regions[i])continue;if(d%2&&(skeleton[i+dx[d]]||skeleton[i+dy[d]*w]))continue;bits|=1<<d;n++;}adj[i]=bits;degree[i]=n;nodes.push(i);}
 function walk(first,dir){let cur=first+off[dir],ps=[first,cur];visited[first]|=1<<dir;visited[cur]|=1<<((dir+4)%8);let len=1;
  for(let count=0;count<4000;count++){const avail=adj[cur]&~visited[cur];if(!avail)break;const prev=ps[Math.max(0,ps.length-(isGlyph?4:8))],tx=cur%w-prev%w,ty=((cur/w)|0)-((prev/w)|0);let best=-1,bestScore=-2;
   for(let d=0;d<8;d++)if(avail&(1<<d)){let next=cur+off[d],pre=cur,end=next;for(let k=0;k<5&&degree[end]===2;k++){let found=-1;for(let z=0;z<8;z++)if(adj[end]&(1<<z)){let q=end+off[z];if(q!==pre){found=q;break;}}if(found<0)break;pre=end;end=found;}let ux=end%w-cur%w,uy=((end/w)|0)-((cur/w)|0),score=(tx*ux+ty*uy)/(Math.hypot(tx,ty)*Math.hypot(ux,uy)||1);if(score>bestScore){bestScore=score;best=d;}}
   if(best<0||(degree[cur]>2&&bestScore<(isGlyph?.1:.76))||(!isGlyph&&len>8*scale&&bestScore<.1))break;
   visited[cur]|=1<<best;const j=cur+off[best];visited[j]|=1<<((best+4)%8);ps.push(j);len+=best%2?Math.SQRT2:1;cur=j;if(cur===first||len>420*scale)break;
  }
  if(len<minLength)return;
  const pts=ps.map(i=>[i%w+.5,((i/w)|0)+.5,widthAt(i)]);out.push({raw:pts,region:regions[first],pixel:first,length:len});
 }
 for(const i of nodes)if(degree[i]===1)for(let d=0;d<8;d++)if(adj[i]&(1<<d)&&!(visited[i]&(1<<d)))walk(i,d);
 for(const i of nodes)if(degree[i]!==2)for(let d=0;d<8;d++)if(adj[i]&(1<<d)&&!(visited[i]&(1<<d)))walk(i,d);
 for(const i of nodes)for(let d=0;d<8;d++)if(adj[i]&(1<<d)&&!(visited[i]&(1<<d)))walk(i,d);
 if(isGlyph)for(const i of nodes)if(!degree[i])out.push({raw:[[i%w+.2,((i/w)|0)+.5,widthAt(i)],[i%w+.8,((i/w)|0)+.5,widthAt(i)]],region:regions[i],pixel:i,length:.6});return out;
}
function planPencil({rgb,gray,fg,strength,glyphMap,inkComponents,regions,regionDefs,w,h,scale,report,style={}}){
 const N=w*h,dt=distance(fg,w,h),toInk=distance(fg,w,h,true),artAt=i=>regions[i]&&regionDefs[regions[i]].role==='illustration',noteAt=i=>regions[i]&&regionDefs[regions[i]].role==='notes';
 const owner=new Uint32Array(N),arcpos=new Float32Array(N),owner2=new Uint32Array(N),arcpos2=new Float32Array(N),raw=[],s=scale;
 const fluidity=clamp(style.fluidity??1,.55,1.6),nib=clamp(style.nib??5.2,2.5,8)*s;
 const hsh=n=>{let x=Math.imul(n^0x9e3779b9,1597334677);x=Math.imul(x^(x>>>16),2246822519);return ((x^(x>>>13))>>>0)/4294967295;};
 report(.21,'Reading broad edges and the direction of the original hatching');
 const g=blur(gray,w,h,Math.max(1,Math.round(1.8*s))),broad=blur(g,w,h,Math.max(1,Math.round(2.2*s))),jxx=new Float32Array(N),jxy=new Float32Array(N),jyy=new Float32Array(N),mag=new Float32Array(N),angle=new Float32Array(N);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,gx=(g[i+1]-g[i-1])*.5,gy=(g[i+w]-g[i-w])*.5;jxx[i]=gx*gx;jxy[i]=gx*gy;jyy[i]=gy*gy;const ex=(broad[i+1]-broad[i-1])*.5,ey=(broad[i+w]-broad[i-w])*.5;mag[i]=Math.hypot(ex,ey);angle[i]=Math.atan2(ey,ex);}
 // A double-angle line field has no arbitrary sign flips at ±pi.
 const radius=Math.max(3,Math.round(9*s*fluidity)),xx=blur(jxx,w,h,radius),xy=blur(jxy,w,h,radius),yy=blur(jyy,w,h,radius),fx=new Float32Array(N),fy=new Float32Array(N),coh=new Float32Array(N);
 for(let i=0;i<N;i++){const d=Math.hypot(xx[i]-yy[i],2*xy[i]);coh[i]=d/(xx[i]+yy[i]+.01);let a=.5*Math.atan2(2*xy[i],xx[i]-yy[i])+Math.PI/2;if(coh[i]<.12)a=-Math.PI/4;fx[i]=Math.cos(2*a);fy[i]=Math.sin(2*a);}
 const fxx=blur(fx,w,h,Math.max(2,Math.round(4*s))),fyy=blur(fy,w,h,Math.max(2,Math.round(4*s)));
 function direction(x,y,rotation=0){const i=clamp(Math.round(y),0,h-1)*w+clamp(Math.round(x),0,w-1);return .5*Math.atan2(fyy[i],fxx[i])+rotation;}
 const edge=new Uint8Array(N);for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(!artAt(i)||toInk[i]>1.5*s||mag[i]<2.8)continue;const a=angle[i],dx=Math.round(Math.cos(a)),dy=Math.round(Math.sin(a)),off=dx+dy*w;if(mag[i]>=mag[i-off]&&mag[i]>=mag[i+off])edge[i]=1;}
 components(edge,w,h,Math.max(4,Math.round(12*s)));
 const sparse=new Uint8Array(N),density=blur(Float32Array.from(fg),w,h,Math.max(2,Math.round(4*s)));
 // Fine isolated marks contain existing construction arcs and leader lines.
 // Dense fur/engraving is deliberately NOT skeletonized into wandering paths.
 for(let i=0;i<N;i++)if(artAt(i)&&fg[i]&&density[i]<.31)sparse[i]=1;
 const sparseSkel=thin(sparse,w,h),noteMask=new Uint8Array(N);for(let i=0;i<N;i++)if(noteAt(i))noteMask[i]=fg[i];const noteSkel=thin(noteMask,w,h);
 const contours=traceCleanGraph(edge,w,h,regions,s,()=>Math.max(1.2,2.6*s),artAt,20*s),construction=traceCleanGraph(sparseSkel,w,h,regions,s,i=>clamp(dt[i]*2-.5,1,3.3*s),artAt,18*s);
 const glyphs=traceCleanGraph(noteSkel,w,h,regions,s,i=>clamp(dt[i]*2-.5,1,18*s),noteAt,.7*s,true);
 function addPath(points,rid,phase,info={}){const m=measure(points);if(m.length<.1)return null;const p={points,...m,region:rid,group:phase===3?1:0,phase,pass:['Contours','Hatching','Deepening','Lettering'][phase],glyph:info.glyph||0,center:[points.reduce((v,p)=>v+p[0],0)/points.length,points.reduce((v,p)=>v+p[1],0)/points.length],color:[0,0,0],tone:phase===1||phase===2,provenance:phase===1||phase===2?'inferred shading movement':'measured source feature',...info};let n=0;for(const a of points){const x=clamp(a[0]|0,0,w-1),y=clamp(a[1]|0,0,h-1),i=(y*w+x)*4;for(let c=0;c<3;c++)p.color[c]+=rgb[i+c];n++;}p.color=p.color.map(v=>Math.round(v/n));p.uid=raw.length;raw.push(p);return p;}
 function stamp(p,layer,extra=0,overwrite=false){let count=0;const own=layer===2?owner2:owner,pos=layer===2?arcpos2:arcpos;
  for(let k=1;k<p.points.length;k++){const a=p.points[k-1],b=p.points[k],dx=b[0]-a[0],dy=b[1]-a[1],ll=dx*dx+dy*dy,len=Math.sqrt(ll),r=(a[2]+b[2])*.25+extra,rs=r*r,x0=Math.max(1,Math.floor(Math.min(a[0],b[0])-r)),x1=Math.min(w-2,Math.ceil(Math.max(a[0],b[0])+r)),y0=Math.max(1,Math.floor(Math.min(a[1],b[1])-r)),y1=Math.min(h-2,Math.ceil(Math.max(a[1],b[1])+r));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*w+x;if(regions[i]!==p.region||toInk[i]>5.2*s||(!overwrite&&own[i]))continue;if(layer===2&&owner[i]&&raw[owner[i]-1].phase!==1)continue;const t=clamp(((x+.5-a[0])*dx+(y+.5-a[1])*dy)/(ll||1),0,1),qx=a[0]+t*dx,qy=a[1]+t*dy,d=(x+.5-qx)**2+(y+.5-qy)**2;if(d>rs)continue;
    own[i]=p.uid+1;pos[i]=(p.cumulative[k-1]+len*t)/p.length;if(fg[i])count++;
   }
  }return count;
 }
 report(.34,'Fitting confident lines and smooth contour movements');
 let features=[];for(const entry of [...contours,...construction]){for(const q of smoothPrimitives(entry.raw,2*s*fluidity,s,false)){const m=measure(q.points);if(m.length<20*s)continue;features.push({q,rid:entry.region,score:m.length});}}
 features.sort((a,b)=>b.score-a.score);
 // Each feature claims only a narrow physical ribbon, never a Voronoi island.
 for(const e of features){const p=addPath(e.q.points,e.rid,0,{primitive:e.q.primitive,controls:e.q.controls,fitError:e.q.fitError});if(!p)continue;stamp(p,1,.15*s);}
 for(const entry of glyphs){const gid=glyphMap[entry.pixel];for(const q of smoothPrimitives(entry.raw,.6*s,s,true)){const p=addPath(q.points,entry.region,3,{glyph:gid,primitive:q.primitive,controls:q.controls,fitError:q.fitError});if(p)stamp(p,1,.55*s);}}
 // Glyph padding is handled locally, not by revealing full characters at once.
 const noteToPath=new Uint8Array(N);for(let i=0;i<N;i++)if(noteAt(i)&&owner[i])noteToPath[i]=1;
 function propagate(own,pos,accept,maxD){
  const dist=new Float32Array(N);for(let i=0;i<N;i++)dist[i]=own[i]?0:1e8;
  for(let pass=0;pass<3;pass++)for(let rev=0;rev<2;rev++)for(let y1=1;y1<h-1;y1++){const y=rev?h-1-y1:y1;for(let x1=1;x1<w-1;x1++){const x=rev?w-1-x1:x1,i=y*w+x;if(!accept(i)||dist[i]===0)continue;const os=rev?[1,w,w+1,w-1]:[-1,-w,-w-1,-w+1];for(let k=0;k<4;k++){const j=i+os[k];if(!own[j]||regions[j]!==regions[i])continue;const d=dist[j]+(k>1?Math.SQRT2:1);if(d<dist[i]&&d<=maxD){dist[i]=d;own[i]=own[j];pos[i]=pos[j];}}}}
 }
 propagate(owner,arcpos,noteAt,20*s);
 report(.45,'Planning long, aligned pencil strokes instead of pixel walks');
 function movement(seed,phase){
  const x=seed%w+.5,y=((seed/w)|0)+.5,rid=regions[seed],rotation=phase===2?(coh[seed]>.5?.15:.42):0,a0=direction(x,y,rotation),length=(96+64*hsh(seed+phase*177))*s*fluidity,step=3*s;
  function half(sign){let xx=x,yy=y,a=a0+(sign<0?Math.PI:0),initial=a,out=[];for(let d=0;d<length*.5;d+=step){let target=direction(xx,yy,rotation);while(target-a>Math.PI/2)target-=Math.PI;while(target-a<-Math.PI/2)target+=Math.PI;const da=clamp(target-a,-.055,.055);a+=da*.38;let change=Math.atan2(Math.sin(a-initial),Math.cos(a-initial));a=initial+clamp(change,-.25,.25);const nx=xx+Math.cos(a)*step,ny=yy+Math.sin(a)*step,ix=nx|0,iy=ny|0;if(ix<2||ix>=w-2||iy<2||iy>=h-2)break;const j=iy*w+ix;if(regions[j]!==rid||toInk[j]>(d<8*s?4*s:2.3*s))break;xx=nx;yy=ny;out.push([xx,yy]);}return out;}
  let before=half(-1),after=half(1),a=before.at(-1)||[x-Math.cos(a0)*2*s,y-Math.sin(a0)*2*s],b=after.at(-1)||[x+Math.cos(a0)*2*s,y+Math.sin(a0)*2*s];
  const chord=Math.hypot(b[0]-a[0],b[1]-a[1]),nx=-(b[1]-a[1])/(chord||1),ny=(b[0]-a[0])/(chord||1),bend=clamp((x-(a[0]+b[0])*.5)*nx+(y-(a[1]+b[1])*.5)*ny,-chord*.06,chord*.06),c=[(a[0]+b[0])*.5+2*bend*nx,(a[1]+b[1])*.5+2*bend*ny];
  const width=nib*(phase===2?.92:1),straight=Math.abs(bend)<.5*s,points=straight?[[...a,width],[...b,width]]:simplify(quadraticPoints(a,c,b,width,2*s),.12*s);
  const p=addPath(points,rid,phase,{primitive:straight?'line':'quadratic',controls:straight?[a,b]:[a,c,b],fitError:0,seed:[x,y]});if(!p)return;stamp(p,phase===2?2:1,.2*s);
 }
 function needs(i,phase){return fg[i]&&artAt(i)&&(phase===1?!owner[i]:owner[i]&&raw[owner[i]-1].phase===1&&!owner2[i]);}
 for(const phase of [1,2]){
  if(phase===2)report(.59,'Building a second directional pass for tone and depth');
  // Sparse seeds establish long strokes; dense seeds close small remaining gaps.
  // The grid is an index only: geometry follows the source direction field.
  for(const spacing of [12,5]){const step=Math.max(2,Math.round(spacing*s));for(let y=2;y<h-2;y+=step)for(let x=2;x<w-2;x+=step){const ix=clamp(x+Math.round(hsh(x+y*w+phase*237)*step*.6),2,w-3),iy=clamp(y+Math.round(hsh(x*7+y*w+phase*51)*step*.6),2,h-3),i=iy*w+ix;if(needs(i,phase))movement(i,phase);}}
  for(let i=w+1;i<N-w-1;i++)if(needs(i,phase))movement(i,phase);
 }
 // Only temporary paper-mask margins borrow an adjacent stroke's timing.
 // Filled illustration pixels already belong to narrow, planned pencil ribbons.
 propagate(owner,arcpos,i=>regions[i]&&toInk[i]<=5.2*s,8*s);
 propagate(owner2,arcpos2,i=>artAt(i)&&owner[i]&&raw[owner[i]-1].phase===1&&toInk[i]<=5.2*s,9*s);
 report(.70,'Sequencing contours, local hatch bundles, and letter strokes');
 const glyphOrder=new Map();for(let rid=1;rid<regionDefs.length;rid++){if(regionDefs[rid].role!=='notes')continue;const cs=inkComponents.filter(c=>glyphMap[c.pixels[0]]&&regions[c.pixels[0]]===rid).sort((a,b)=>a.y0-b.y0),lines=[];for(const c of cs){const cy=(c.y0+c.y1)/2;let line=lines.find(l=>Math.abs(l.cy-cy)<12*s);if(!line){line={cy,items:[]};lines.push(line);}line.items.push(c);}let idx=0;for(const l of lines.sort((a,b)=>a.cy-b.cy))for(const c of l.items.sort((a,b)=>a.x0-b.x0))glyphOrder.set(glyphMap[c.pixels[0]],idx++);}
 // First claim to a ribbon wins. Paths are then ordered in small local bundles,
 // with one deliberate pen direction per bundle rather than random endpoint hops.
 function orderLocal(items,phase){if(!items.length)return [];const out=[],alive=new Uint8Array(items.length);alive.fill(1);const cell=72*s,bins=new Map();items.forEach((p,i)=>{const k=`${Math.floor(p.center[0]/cell)},${Math.floor(p.center[1]/cell)}`;if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);});let pen=[w*.27,h*.2],lastAngle=-Math.PI/4,fallback=0;
  for(let count=0;count<items.length;count++){let best=-1,score=Infinity,cx=Math.floor(pen[0]/cell),cy=Math.floor(pen[1]/cell);for(let r=0;r<=3;r++){for(let yy=cy-r;yy<=cy+r;yy++)for(let xx=cx-r;xx<=cx+r;xx++){if(r&&Math.abs(xx-cx)!==r&&Math.abs(yy-cy)!==r)continue;const list=bins.get(`${xx},${yy}`);if(!list)continue;for(const i of list){if(!alive[i])continue;const p=items[i],a=p.points[0],b=p.points.at(-1),d=Math.min(Math.hypot(a[0]-pen[0],a[1]-pen[1]),Math.hypot(b[0]-pen[0],b[1]-pen[1])),ang=Math.atan2(b[1]-a[1],b[0]-a[0]),coherence=1-Math.abs(Math.cos(ang-lastAngle)),cost=d+(phase?38*s:7*s)*coherence-Math.min(12*s,p.length*.08);if(cost<score){score=cost;best=i;}}}if(best>=0&&score<cell*(r+.5))break;}
   if(best<0){while(fallback<items.length&&!alive[fallback])fallback++;best=fallback;}const p=items[best];alive[best]=0;const a=p.points[0],b=p.points.at(-1);if(phase){let ang=Math.atan2(b[1]-a[1],b[0]-a[0]);if(Math.cos(ang-lastAngle)<0){p.points.reverse();p.controls?.reverse();p.reversed=true;Object.assign(p,measure(p.points));}}else if(Math.hypot(b[0]-pen[0],b[1]-pen[1])<Math.hypot(a[0]-pen[0],a[1]-pen[1])){p.points.reverse();p.controls?.reverse();p.reversed=true;Object.assign(p,measure(p.points));}lastAngle=Math.atan2(p.points.at(-1)[1]-p.points[0][1],p.points.at(-1)[0]-p.points[0][0]);pen=p.points.at(-1);out.push(p);
  }return out;
 }
 // Eliminate feature curves which own no visible texel. Never turn texture
 // specks into standalone micro-strokes when an adjacent hatch already owns them.
 const used=new Uint8Array(raw.length);for(let i=0;i<N;i++){if(owner[i])used[owner[i]-1]=1;if(owner2[i])used[owner2[i]-1]=1;}
 const active=raw.filter(p=>used[p.uid]),notes=active.filter(p=>p.group===1);notes.sort((a,b)=>(regionDefs[a.region].order||0)-(regionDefs[b.region].order||0)||(glyphOrder.get(a.glyph)||0)-(glyphOrder.get(b.glyph)||0)||a.center[1]-b.center[1]||a.center[0]-b.center[0]);
 for(const p of notes){const a=p.points[0],b=p.points.at(-1);if(b[0]+b[1]*.65<a[0]+a[1]*.65){p.points.reverse();p.controls?.reverse();p.reversed=true;Object.assign(p,measure(p.points));}}
 const art=[...orderLocal(active.filter(p=>p.phase===0),0),...orderLocal(active.filter(p=>p.phase===1),1),...orderLocal(active.filter(p=>p.phase===2),2)],paths=[...art,...notes];
 // Re-rasterize in the actual chronological order. A future stroke must never
 // cut an unrevealed hole through a currently drawing, continuous ribbon.
 owner.fill(0);owner2.fill(0);arcpos.fill(0);arcpos2.fill(0);
 for(const p of paths)stamp(p,p.phase===2?2:1,(p.phase===0?.15:p.phase===3?.55:.2)*s);
 propagate(owner,arcpos,noteAt,20*s);
 propagate(owner,arcpos,i=>regions[i]&&toInk[i]<=5.2*s,8*s);
 propagate(owner2,arcpos2,i=>artAt(i)&&owner[i]&&raw[owner[i]-1].phase===1&&toInk[i]<=5.2*s,9*s);
 // Cover rare isolated ink dots left after pruning/reordering. These are
 // short accents, not a return to walking the illustration's texture graph.
 for(let i=w+1;i<N-w-1;i++)if(fg[i]&&regions[i]&&!owner[i]){
  const x=i%w+.5,y=((i/w)|0)+.5,a=noteAt(i)?0:direction(x,y),r=1.2*s;
  const p=addPath([[x-r*Math.cos(a),y-r*Math.sin(a),Math.max(1.5*s,dt[i]*2)],[x+r*Math.cos(a),y+r*Math.sin(a),Math.max(1.5*s,dt[i]*2)]],regions[i],noteAt(i)?3:1,{primitive:'line',provenance:'source accent'});
  if(p){paths.push(p);(p.group?notes:art).push(p);stamp(p,1,.6*s);}
 }
 propagate(owner,arcpos,i=>regions[i]&&toInk[i]<=5.2*s,8*s);
 // A changed first-pass order can expose a few paper-margin pixels which the
 // originally planned deepening pass did not need. Reuse that SAME directed
 // primitive for its second pass: no end-of-animation bitmap swap or fade.
 const repairs=new Map();
 for(let i=0;i<N;i++)if(owner[i]&&raw[owner[i]-1].phase===1&&!owner2[i]){
  const q=raw[owner[i]-1];let p=repairs.get(q.uid);
  if(!p){p=addPath(q.points.map(v=>v.slice()),q.region,2,{primitive:q.primitive,controls:q.controls?.map(v=>v.slice()),provenance:'second pass of existing shading movement',marginCompletion:true});repairs.set(q.uid,p);paths.push(p);art.push(p);}
  owner2[i]=p.uid+1;arcpos2[i]=arcpos[i];
 }
 const remap=new Uint32Array(raw.length);
 // Positions were just projected onto the final directed primitives.
 for(const p of paths)p.reversed=false;
paths.forEach((p,id)=>{remap[p.uid]=id+1;p.id=id;p.mid=p.points[Math.floor(p.points.length/2)].slice(0,2);});
 for(let i=0;i<N;i++){if(owner[i]){const p=raw[owner[i]-1];if(p.reversed)arcpos[i]=1-arcpos[i];owner[i]=remap[p.uid];}if(owner2[i]){const p=raw[owner2[i]-1];if(p.reversed)arcpos2[i]=1-arcpos2[i];owner2[i]=remap[p.uid];}}
 const phaseCounts=[0,0,0,0];for(const p of paths){phaseCounts[p.phase]++;delete p.uid;delete p.reversed;}
 const artLength=art.reduce((a,p)=>a+p.length,0),tiny=art.filter(p=>p.length<8*s).length;
 return {paths,art,notes,owner,arcpos,owner2,arcpos2,toInk,phaseCounts,meanArtLength:artLength/Math.max(1,art.length),shortArtStrokes:tiny,orientationMethod:'smoothed structure tensor / unoriented double-angle field'};
}

function analyze(msg,report){
 const {width:w,height:h,template}=msg,N=w*h,rgb=new Uint8ClampedArray(msg.pixels),scale=w/1024,t0=performance.now();
 report(.02,'Registering the shared template');
 const regions=new Uint8Array(N),regionDefs=[null];
 for(const r of template.regions){if(r.role==='protect')continue;const id=regionDefs.length;regionDefs.push(r);const [x0,y0,x1,y1]=r.box;
  for(let y=Math.max(0,Math.floor(y0*h));y<Math.min(h,Math.ceil(y1*h));y++)for(let x=Math.max(0,Math.floor(x0*w));x<Math.min(w,Math.ceil(x1*w));x++)regions[y*w+x]=id;
 }
 for(const r of template.regions){if(r.role!=='protect')continue;const [x0,y0,x1,y1]=r.box;for(let y=Math.max(0,Math.floor(y0*h));y<Math.min(h,Math.ceil(y1*h));y++)for(let x=Math.max(0,Math.floor(x0*w));x<Math.min(w,Math.ceil(x1*w));x++)regions[y*w+x]=0;}
 const subtitle=template.autoSubtitle?detectSubtitle(rgb,w,h,regions):null;
 const gray=new Float32Array(N),channels=[new Float32Array(N),new Float32Array(N),new Float32Array(N)];
 for(let i=0;i<N;i++){const j=i*4;gray[i]=.25*rgb[j]+.60*rgb[j+1]+.15*rgb[j+2];for(let c=0;c<3;c++)channels[c][i]=rgb[j+c];}
 report(.07,'Learning this page’s parchment and ink');
 // Estimate broad paper illumination only from plausible paper-colored pixels.
 const tile=Math.max(16,Math.round(32*scale)),gw=Math.ceil(w/tile),gh=Math.ceil(h/tile),gn=gw*gh;
 const grid=[new Float32Array(gn),new Float32Array(gn),new Float32Array(gn)],conf=new Float32Array(gn),known=new Uint8Array(gn),global=[0,0,0];let total=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=i*4,r=rgb[j],g=rgb[j+1],b=rgb[j+2];
  if(r>203&&g>159&&b>92&&b/g>.53&&(r-g)<75&&(g-b)<86){const k=((y/tile)|0)*gw+((x/tile)|0),v=1;conf[k]+=v;for(let c=0;c<3;c++){grid[c][k]+=rgb[j+c]*v;global[c]+=rgb[j+c]*v;}total+=v;}
 }
 if(total<N*.007)throw Error('Not enough clear parchment was found. Use a warm, light-paper plate or provide a clean paper layer.');
 for(let c=0;c<3;c++)global[c]/=total;
 for(let k=0;k<gn;k++){known[k]=conf[k]>tile*tile*.065?1:0;for(let c=0;c<3;c++)grid[c][k]=known[k]?grid[c][k]/conf[k]:global[c];}
 // Harmonic interpolation across occluded paper, followed by gentle smoothing.
 for(let pass=0;pass<150;pass++)for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const k=y*gw+x;if(known[k])continue;for(let c=0;c<3;c++){let sum=0,n=0;if(x){sum+=grid[c][k-1];n++;}if(y){sum+=grid[c][k-gw];n++;}if(x<gw-1){sum+=grid[c][k+1];n++;}if(y<gh-1){sum+=grid[c][k+gw];n++;}grid[c][k]=sum/n;}}
 const soft=grid.map(a=>blur(a,gw,gh,1));
 function paperValue(x,y,c){const xx=clamp(x/tile-.5,0,gw-1),yy=clamp(y/tile-.5,0,gh-1),ix=xx|0,iy=yy|0,u=xx-ix,v=yy-iy,j=iy*gw+ix,ix1=Math.min(ix+1,gw-1),iy1=Math.min(iy+1,gh-1);return (1-v)*((1-u)*soft[c][j]+u*soft[c][iy*gw+ix1])+v*((1-u)*soft[c][iy1*gw+ix]+u*soft[c][iy1*gw+ix1]);}
 const strong=new Uint8Array(N),weak=new Uint8Array(N),strength=new Float32Array(N),sensitivity=clamp(msg.sensitivity||1,.55,1.65);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!regions[i])continue;const j=i*4,pr=paperValue(x,y,0),pg=paperValue(x,y,1),pb=paperValue(x,y,2),r=rgb[j],g=rgb[j+1],b=rgb[j+2];
  const lum=(pr-r)*.25+(pg-g)*.6+(pb-b)*.15;
  const red=(r-g)-(pr-pg),yellow=(g-b)-(pg-pb);
  const score=Math.max(lum,red*1.8+Math.max(0,lum)*.3,yellow*1.6+Math.max(0,lum)*.15);
  strength[i]=score;strong[i]=score>32/sensitivity?1:0;weak[i]=score>16/sensitivity?1:0;
 }
 // Hysteresis retains soft stroke edges without promoting isolated paper grain.
 const fg=strong.slice(),queue=new Int32Array(N);let qa=0,qb=0;for(let i=0;i<N;i++)if(strong[i])queue[qb++]=i;
 while(qa<qb){const i=queue[qa++],x=i%w;for(const j of [i-1,i+1,i-w,i+w]){if(j<0||j>=N||((j===i-1&&x===0)||(j===i+1&&x===w-1)))continue;if(!fg[j]&&weak[j]&&regions[j]===regions[i]){fg[j]=1;queue[qb++]=j;}}}
 // Remove tiny isolated paper grains. Genuine small punctuation is kept in notes.
 const inkComponents=components(fg,w,h,1),glyphMap=new Int32Array(N);let glyphId=0;
 for(const c of inkComponents){const rid=regions[c.pixels[0]],isNote=rid&&regionDefs[rid].role==='notes';if(c.area<(isNote?2:5)*scale*scale){for(const i of c.pixels)fg[i]=0;continue;}if(isNote){glyphId++;for(const i of c.pixels)glyphMap[i]=glyphId;}}
 const plan=planPencil({rgb,gray,fg,strength,glyphMap,inkComponents,regions,regionDefs,w,h,scale,report,style:msg.style||{}});
 const {paths,art,notes,owner,arcpos,owner2,arcpos2,toInk}=plan;
 report(.79,'Sampling clean paper beneath the temporary masks');

 // Refit illumination after segmentation. Pale skin / metal inside dense ink
 // cannot act as paper donors; this avoids silhouettes in the starting page.
 for(let c=0;c<3;c++)grid[c].fill(0);conf.fill(0);known.fill(0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=i*4;
  if(toInk[i]<11*scale||rgb[j]<202||rgb[j+1]<157||rgb[j+2]<93||rgb[j+2]/rgb[j+1]<.54)continue;
  const k=((y/tile)|0)*gw+((x/tile)|0);conf[k]++;for(let c=0;c<3;c++)grid[c][k]+=rgb[j+c];
 }
 for(let k=0;k<gn;k++){known[k]=conf[k]>tile*tile*.12?1:0;for(let c=0;c<3;c++)grid[c][k]=known[k]?grid[c][k]/conf[k]:global[c];}
 for(let pass=0;pass<220;pass++)for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const k=y*gw+x;if(known[k])continue;for(let c=0;c<3;c++){let sum=0,n=0;if(x){sum+=grid[c][k-1];n++;}if(y){sum+=grid[c][k-gw];n++;}if(x<gw-1){sum+=grid[c][k+1];n++;}if(y<gh-1){sum+=grid[c][k+gw];n++;}grid[c][k]=sum/n;}}
 for(let c=0;c<3;c++)soft[c]=blur(grid[c],gw,gh,1);
 // Choose actual, low-ink source patches for coherent parchment microtexture.
 const patch=Math.max(24,Math.round(64*scale)),donors=[];
 for(let y=Math.round(h*.17);y<h*.94-patch;y+=patch)for(let x=Math.round(w*.07);x<w*.92-patch;x+=patch){let bad=0,variance=0,sum=0,mean=[0,0,0];
  for(let yy=y;yy<y+patch;yy+=2)for(let xx=x;xx<x+patch;xx+=2){const i=yy*w+xx,j=i*4;if(toInk[i]<5*scale||rgb[j]<201||rgb[j+1]<157||rgb[j+2]<90)bad++;const v=gray[i];sum+=v;variance+=v*v;for(let c=0;c<3;c++)mean[c]+=rgb[j+c];}
  const count=Math.ceil(patch/2)**2;if(bad/count<.01)donors.push({x,y,mean:mean.map(v=>v/count),score:Math.abs(variance/count-(sum/count)**2-50)});
 }
 donors.sort((a,b)=>a.score-b.score);donors.length=Math.min(donors.length,20);
 if(!donors.length){ // Conservative fallback still samples source grain, not noise.
  for(let y=6;y<h-patch;y+=patch)for(let x=6;x<w-patch;x+=patch){const i=(y+patch/2|0)*w+(x+patch/2|0);if(gray[i]>190&&rgb[i*4+2]/rgb[i*4+1]>.55)donors.push({x,y,mean:[paperValue(x+patch/2,y+patch/2,0),paperValue(x+patch/2,y+patch/2,1),paperValue(x+patch/2,y+patch/2,2)]});if(donors.length>20)break;}
 }
 const base=rgb.slice(),packed=new Uint32Array(N*4),maskPreview=new Uint8Array(N),pad=Math.max(2,3.0*scale),feather=Math.max(1,2.0*scale);let modified=0,unowned=0;
 const clean=msg.cleanPixels?new Uint8ClampedArray(msg.cleanPixels):null;
 function textureResidual(x,y,c){if(!donors.length)return 0;const span=patch-1,xx=x/span,yy=y/span,gx=Math.floor(xx),gy=Math.floor(yy),u=xx-gx,v=yy-gy;let value=0,weightSq=0;
  // Overlap four mirrored source patches. Smooth weights hide quilt seams.
  const su=u*u*(3-2*u),sv=v*v*(3-2*v);
  for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++){let ix=gx+ox,iy=gy+oy,hash=((ix*73856093)^(iy*19349663))>>>0,donor=donors[hash%donors.length];let px=Math.round((ox?1-u:u)*span),py=Math.round((oy?1-v:v)*span);if(hash&1)px=span-px;if(hash&2)py=span-py;const i=(donor.y+py)*w+donor.x+px,wt=(ox?su:1-su)*(oy?sv:1-sv);value+=(channels[c][i]-donor.mean[c])*wt;weightSq+=wt*wt;}
  return value/Math.sqrt(Math.max(.25,weightSq));
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=i*4;if(!regions[i]||toInk[i]>pad+feather)continue;if(!owner[i]){if(fg[i])unowned++;continue;}
  const d=toInk[i],weight=d<=pad?1:1-((d-pad)/feather)**2*(3-2*((d-pad)/feather));
  for(let c=0;c<3;c++){const paper=clean?clean[j+c]:paperValue(x,y,c)+textureResidual(x,y,c)*.85;base[j+c]=Math.round(rgb[j+c]*(1-weight)+clamp(paper,0,255)*weight);}
  packed[i*4]=owner[i];packed[i*4+1]=Math.round(clamp(arcpos[i],0,1)*65535);packed[i*4+2]=owner2[i];packed[i*4+3]=Math.round(clamp(arcpos2[i],0,1)*65535);maskPreview[i]=Math.round(weight*255);modified++;
 }
 const counts={straight:0,curve:0,arc:0};let segments=0;for(const p of paths){counts[p.class]++;segments+=p.points.length-1;for(const pt of p.points)for(let c=0;c<3;c++)pt[c]=Math.round(pt[c]*100)/100;}
 const result={width:w,height:h,base:base.buffer,ownership:packed.buffer,mask:maskPreview.buffer,paths,regions:regionDefs,subtitle,stats:{paths:paths.length,segments,counts,illustration:art.length,notes:notes.length,modifiedPixels:modified,unownedForeground:unowned,analysisMs:performance.now()-t0,donorPatches:donors.length,phaseCounts:plan.phaseCounts,meanArtLength:plan.meanArtLength,shortArtStrokes:plan.shortArtStrokes,orientationMethod:plan.orientationMethod,method:'Planned pencil motions / fitted contours / coherent directional hatching / two-pass source-pixel reveal'}};
 report(1,'Ready — illustration and notes start together');return result;
}
self.onmessage=e=>{try{const result=analyze(e.data,(progress,label)=>self.postMessage({type:'progress',progress,label}));self.postMessage({type:'result',result},[result.base,result.ownership,result.mask]);}catch(err){self.postMessage({type:'error',message:err.message||String(err),stack:err.stack});}};
