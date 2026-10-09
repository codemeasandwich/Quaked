// Split immutable alias triangles along a plane, retaining interpolated skin
// coordinates and closing every cut contour (including nested holes). The caps
// carry the cut's own interpolated attributes (skin coordinates, lighting
// colour) at their contour points, so they can be drawn with the body's skin.
import * as THREE from 'three';
const EPS=1e-6, key=p=>p.map(v=>Math.round(v*10000)).join(',');
// A Quake skin holds the body's back in its right half (the back's skin coordinates are the front's plus a half, the 'onseam'
// rule). A cap triangle that joins front and back points would stretch the skin across both halves: its odd points are moved
// into the half the others are in, so each cap triangle samples one stretch of skin (card [18] review).
function oneHalf(tri){
	const us=tri.map(v=>v.uv?.[0]);if(us.some(u=>u===undefined))return tri;
	if(Math.max(...us)-Math.min(...us)<=.35)return tri;
	const back=us.filter(u=>u>=.5).length>=2;
	return tri.map(v=>{const u=v.uv[0];if((u>=.5)===back)return v;return {...v,uv:[u+(back?.5:-.5),v.uv[1]]};});
}
export function R_BisectGeometry(geometry,normal,point){
	const n=new THREE.Vector3(...normal).normalize(),p=new THREE.Vector3(...point),constant=n.dot(p);
	const names=Object.keys(geometry.attributes).filter(name=>!geometry.attributes[name].isInterleavedBufferAttribute);
	const index=geometry.index,positions=geometry.getAttribute('position'),count=index?index.count:positions.count;
	// Zero-area input triangles cannot contribute a volume boundary, but their
	// skin data is still retained. Opposite faces are not cancelled: native
	// art can use one as a real boundary and the other as a decorative sheet.
	const sheet=new Set();
	for(let i=0;i<count;i+=3){
		const v=[0,1,2].map(j=>{const at=index?index.getX(i+j):i+j;return new THREE.Vector3().fromBufferAttribute(positions,at);});
		const normal=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
		if(normal.lengthSq()<1e-16){sheet.add(i);continue;}
	}
	const output=[{},{}];for(const out of output)for(const name of names)out[name]=[];
	const segments=new Map(),points=new Map();
	const vertex=i=>{const v={};for(const name of names){const a=geometry.attributes[name];v[name]=Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k]);}return v;};
	const distance=v=>n.x*v.position[0]+n.y*v.position[1]+n.z*v.position[2]-constant;
	const lerp=(a,b,t)=>Object.fromEntries(names.map(name=>[name,a[name].map((v,k)=>v+(b[name][k]-v)*t)]));
	const emit=(out,v)=>{for(const name of names)out[name].push(...v[name]);};
	for(let i=0;i<count;i+=3){
		const tri=[0,1,2].map(j=>vertex(index?index.getX(i+j):i+j)),d=tri.map(distance),cut=[];
		for(let j=0;j<3;j++){const k=(j+1)%3;if(d[j]*d[k]<-EPS*EPS)cut.push(lerp(tri[j],tri[k],d[j]/(d[j]-d[k])));else if(Math.abs(d[j])<=EPS)cut.push(tri[j]);}
		const unique=[...new Map(cut.map(v=>[key(v.position),v])).values()];
		if(!sheet.has(i)&&unique.length===2&&d.some(v=>Math.abs(v)>EPS)){
			const a=key(unique[0].position),b=key(unique[1].position),edge=[a,b].sort().join('|');if(!points.has(a))points.set(a,unique[0]);if(!points.has(b))points.set(b,unique[1]);segments.set(edge,[a,b]);
		}
		for(let side=0;side<2;side++){
			const sign=side===0?1:-1,poly=[];
			for(let j=0;j<3;j++){const k=(j+1)%3,a=tri[j],b=tri[k],da=d[j]*sign,db=d[k]*sign;if(da>=-EPS)poly.push(a);if((da>EPS&&db<-EPS)||(da<-EPS&&db>EPS))poly.push(lerp(a,b,da/(da-db)));}
			for(let j=1;j+1<poly.length;j++){emit(output[side],poly[0]);emit(output[side],poly[j]);emit(output[side],poly[j+1]);}
		}
	}
	const u=new THREE.Vector3(Math.abs(n.z)<.9?0:1,0,Math.abs(n.z)<.9?1:0).cross(n).normalize(),v=n.clone().cross(u);
	const adjacency=new Map();for(const [a,b] of segments.values()){if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);}
	// Some original enemies also have single decorative sheets attached to
	// otherwise closed bodies. Their cut is a dangling branch, not a volume
	// boundary. Prune that branch only from the cap graph (never from the skin).
	const leaves=[...adjacency].filter(([,edges])=>edges.size<2).map(([id])=>id);
	while(leaves.length){const id=leaves.pop(),edges=adjacency.get(id);if(!edges||edges.size>1)continue;for(const next of edges){adjacency.get(next).delete(id);if(adjacency.get(next).size<2)leaves.push(next);}adjacency.delete(id);}
	const projectedPoint=id=>{const p=points.get(id).position;return [u.x*p[0]+u.y*p[1]+u.z*p[2],v.x*p[0]+v.y*p[1]+v.z*p[2]];};
	const ordered=new Map([...adjacency].map(([id,edges])=>{const p=projectedPoint(id);return [id,[...edges].sort((a,b)=>{const x=projectedPoint(a),y=projectedPoint(b);return Math.atan2(x[1]-p[1],x[0]-p[0])-Math.atan2(y[1]-p[1],y[0]-p[0]);})];}));
	const visited=new Set(),loops=[];
	// Walk planar half-edges. For an ordinary closed contour this is identical
	// to following its two neighbours. At attached-sheet chords, the unbounded
	// face gives the body's outer boundary without capping an internal sheet.
	for(const [start,neighbors] of ordered)for(const next of neighbors){
		if(visited.has(start+'|'+next))continue;
		const walk=[];let a=start,b=next;
		for(let steps=0;steps<=segments.size*2;steps++){
			visited.add(a+'|'+b);walk.push(a);const choices=ordered.get(b),after=choices[(choices.indexOf(a)+choices.length-1)%choices.length];a=b;b=after;
			if(a===start&&b===next)break;
			if(steps===segments.size*2)throw Error('Alias cut contour traversal failed');
		}
		// Articulation points can join two closed lobes at a single vertex.
		// Separate those lobes before hole classification / triangulation.
		let path=[];const at=new Map();
		for(const id of [...walk,walk[0]]){
			if(at.has(id)){
				const from=at.get(id),loop=path.slice(from),xy=loop.map(projectedPoint);
				let area=0;for(let i=0;i<xy.length;i++){const q=xy[(i+1)%xy.length];area+=xy[i][0]*q[1]-q[0]*xy[i][1];}
				if(loop.length>=3&&area<-1e-8)loops.push(loop.map(k=>points.get(k)));
				for(const old of path.slice(from+1))at.delete(old);path=path.slice(0,from+1);
			}else{at.set(id,path.length);path.push(id);}
		}
	}
	const projected=loops.map(loop=>loop.map(({position:p})=>new THREE.Vector2(u.x*p[0]+u.y*p[1]+u.z*p[2],v.x*p[0]+v.y*p[1]+v.z*p[2])));
	const contains=(poly,p)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
	// A partially overlapping contour is not a hole. Vertices alone do not
	// prove containment in a concave outline: test every interval of each edge
	// cut by the outer boundary, including contacts at a boundary vertex.
	const within=(outer,p)=>contains(outer,p)||outer.some((a,i)=>{const b=outer[(i+1)%outer.length],dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy,t=((p.x-a.x)*dx+(p.y-a.y)*dy)/l;return t>=0&&t<=1&&Math.abs(dx*(p.y-a.y)-dy*(p.x-a.x))<=1e-5*Math.sqrt(l);});
	const encloses=(outer,inner)=>{
		if(!inner.every(p=>within(outer,p)))return false;
		for(let i=0;i<inner.length;i++){
			const a=inner[i],b=inner[(i+1)%inner.length],dx=b.x-a.x,dy=b.y-a.y,ts=[0,1];
			for(let j=0;j<outer.length;j++){
				const c=outer[j],d=outer[(j+1)%outer.length],ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
				if(Math.abs(den)<1e-12)continue;
				const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,s=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
				if(t>0&&t<1&&s>=-1e-8&&s<=1+1e-8)ts.push(t);
			}
			ts.sort((a,b)=>a-b);
			for(let j=1;j<ts.length;j++){const t=(ts[j]+ts[j-1])/2;if(!within(outer,new THREE.Vector2(a.x+dx*t,a.y+dy*t)))return false;}
		}
		return true;
	};
	const depths=projected.map((loop,i)=>projected.filter((other,j)=>j!==i&&encloses(other,loop)).length),caps=[[],[]];
	for(let i=0;i<loops.length;i++){
		if(depths[i]%2)continue;
		const holes=loops.map((_,j)=>j).filter(j=>depths[j]===depths[i]+1&&encloses(projected[i],projected[j]));
		const flat=[...loops[i],...holes.flatMap(j=>loops[j])],triangles=THREE.ShapeUtils.triangulateShape(projected[i],holes.map(j=>projected[j]));
		for(const tri of triangles){const a=new THREE.Vector3(...flat[tri[0]].position),ab=new THREE.Vector3(...flat[tri[1]].position).sub(a),ac=new THREE.Vector3(...flat[tri[2]].position).sub(a),area=ab.clone().cross(ac).dot(n);
			// Native positions and output buffers are Float32. Earcut can retain
			// a contour triangle collinear at that precision; omit that overlapping
			// sliver using Float32's relative epsilon, not a world-size cutoff.
			if(Math.abs(area)<=2**-23*Math.max(ab.lengthSq(),ac.lengthSq()))continue;
			if(area<0)tri.reverse();
			const t=oneHalf([flat[tri[0]],flat[tri[1]],flat[tri[2]]]);caps[0].push(t[2],t[1],t[0]);caps[1].push(t[0],t[1],t[2]);}
	}
	return output.map((out,side)=>{
		const body=new THREE.BufferGeometry();for(const name of names)body.setAttribute(name,new THREE.Float32BufferAttribute(out[name],geometry.attributes[name].itemSize));body.normalizeNormals();body.computeBoundingBox();body.computeBoundingSphere();
		const cap=new THREE.BufferGeometry();for(const name of names)if(name!=='normal')cap.setAttribute(name,new THREE.Float32BufferAttribute(caps[side].flatMap(v=>v[name]),geometry.attributes[name].itemSize));cap.computeVertexNormals();cap.computeBoundingBox();cap.computeBoundingSphere();
		return {body,cap,contours:loops.length};
	});
}
