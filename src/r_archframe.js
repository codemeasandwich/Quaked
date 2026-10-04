// Measure real BSP arch depth. No guessed constant: the front marker plus
// three actual throat faces must agree on the far boundary before moving it.
const MARKER = /^[aew]?door|^dr\d|^[w]?enter|^z?_?exit|arch|^window|^gate|^portc/i;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b,d)=>a.map((v,i)=>v+b[i]*d);
let hidden=new WeakSet(), hiddenModels=new WeakMap(), hiddenCount=0, hiddenModelCount=0, revision=0;
export function R_ClearArchHidden(){hidden=new WeakSet();hiddenModels=new WeakMap();hiddenCount=0;hiddenModelCount=0;revision++;}
export function R_HideArchSurfaces(surfaces){for(const s of surfaces){if(!hidden.has(s))hiddenCount++;hidden.add(s);}revision++;}
export function R_HideArchModel(name,surfaces){if(!surfaces)return;let names=hiddenModels.get(surfaces);if(!names){names=new Set();hiddenModels.set(surfaces,names);}if(!names.has(name))hiddenModelCount++;names.add(name);revision++;}
export function R_ArchSurfaceHidden(surface){return !!surface&&hidden.has(surface);}
export function R_ArchModelHidden(name,surfaces){return !!surfaces&&hiddenModels.get(surfaces)?.has(name)===true;}
export function R_ArchHiddenRevision(){return revision;}
export function R_HasArchHidden(){return hiddenCount>0||hiddenModelCount>0;}

function vertices(model,surface){
	const out=[];
	for(let i=0;i<surface.numedges;i++){
		const e=model.surfedges[surface.firstedge+i],edge=model.edges[Math.abs(e)];
		out.push(Array.from(model.vertexes[edge.v[e>=0?0:1]].position));
	}
	return out;
}
function inside(point,face){
	let sign=0;
	for(let i=0;i<face.v.length;i++){
		const a=face.v[i],b=face.v[(i+1)%face.v.length],s=dot(cross(sub(b,a),sub(point,a)),face.n);
		if(Math.abs(s)<.01)continue;
		if(sign&&Math.sign(s)!==sign)return false;
		sign=Math.sign(s);
	}
	return true;
}
function ray(faces,origin,direction){
	let found=null;
	for(const f of faces){
		const den=dot(f.n,direction);if(den>=-.001)continue;
		const distance=dot(f.n,sub(f.v[0],origin))/den;
		if(distance<=.1||distance>400||found&&distance>=found.distance)continue;
		if(inside(add(origin,direction,distance),f))found={...f,distance};
	}
	return found;
}
export function R_MeasureArchFrame(model,transform,returning=false){
	if(!model?.surfaces||transform.kind!=='plane')return null;
	const t=transform,faces=[];
	const first=model.firstmodelsurface||0,count=model.nummodelsurfaces||model.surfaces.length;
	for(let index=first;index<first+count;index++){
		const surface=model.surfaces[index];if(!surface?.plane||surface.numedges<3)continue;
		const v=vertices(model,surface),sign=surface.flags&2?-1:1,n=Array.from(surface.plane.normal,x=>x*sign);
		const local=v.map(p=>{const q=sub(p,t.center);return [dot(q,t.through),dot(q,t.tangent),q[2]];});
		const lo=[0,1,2].map(a=>Math.min(...local.map(p=>p[a]))),hi=[0,1,2].map(a=>Math.max(...local.map(p=>p[a])));
		if(hi[0]<-128||lo[0]>160||hi[1]<-256||lo[1]>256||hi[2]<-48||lo[2]>400)continue;
		faces.push({surface,index,v,n,lo,hi});
	}
	const fronts=faces.filter(f=>dot(f.n,t.through)<-.99&&MARKER.test(f.surface.texinfo?.texture?.name||'')&&
		f.lo[0]>=(returning?-4:-128)&&f.lo[0]<(returning?128:32));
	const candidates=[...new Set(fronts.map(f=>f.lo[0]))].sort((a,b)=>Math.abs(a)-Math.abs(b));
	for(const near of candidates){
		const p=add(t.center,t.through,near+1);
		const left=ray(faces,p,t.tangent.map(v=>-v)),right=ray(faces,p,t.tangent),up=ray(faces,p,[0,0,1]),down=ray(faces,p,[0,0,-1]);
		if(!left||!right||!up||!down||left.distance<16||right.distance<16||up.distance<32)continue;
		const throat=[left,right,up],front=fronts.filter(f=>Math.abs(f.lo[0]-near)<.01);
		// Interior bars split/hide throat polygons in the BSP. The connected
		// outer frame still exposes its full extrusion. Require incident edges
		// at the marker and independently matching left/right/roof endpoints.
		const extrusion=faces.filter(f=>Math.abs(dot(f.n,t.through))<.01&&f.lo[0]<=near+.01&&f.hi[0]>near+2&&
			f.v.filter(v=>Math.abs(dot(sub(v,t.center),t.through)-near)<.01&&front.some(g=>inside(v,g))).length>=2);
		const ends=[...new Set(extrusion.map(f=>Math.round(f.hi[0]*16)/16))].sort((a,b)=>b-a);
		const far=ends.find(end=>{
			if(end-near<4||end-near>128)return false;
			const same=extrusion.filter(f=>Math.abs(f.hi[0]-end)<.1);
			return same.some(f=>dot(f.n,t.tangent)>.2)&&same.some(f=>dot(f.n,t.tangent)<-.2)&&same.some(f=>Math.abs(f.n[2])>.2);
		});
		if(far===undefined||throat.some(f=>f.lo[0]>near+.1))continue;
		const structural=[...extrusion,...throat,down];
		const onFrame=f=>structural.some(g=>Math.abs(dot(g.n,f.n))>.9999&&Math.abs(dot(g.n,sub(f.v[0],g.v[0])))<.01);
		const opening={axisA:t.tangent,axisB:[0,0,1],a0:-left.distance,a1:right.distance,b0:-down.distance,b1:up.distance,
			shift:t.through.map(v=>v*(far-.25))};
		// Fully contained interior polygons only. Jambs/header/floor remain.
		// This covers native static bars and backing plates, not just entities.
		const blockers=returning?faces.filter(f=>!onFrame(f)&&f.lo[0]>near+.1&&f.hi[0]<=far+.1&&
			f.lo[1]>=opening.a0-.01&&f.hi[1]<=opening.a1+.01&&f.lo[2]>=opening.b0-.01&&f.hi[2]<=opening.b1+.01&&
			!(Math.abs(f.lo[1]-opening.a0)<.01&&Math.abs(f.hi[1]-opening.a0)<.01)&&
			!(Math.abs(f.lo[1]-opening.a1)<.01&&Math.abs(f.hi[1]-opening.a1)<.01)&&
			!(Math.abs(f.lo[2]-opening.b0)<.01&&Math.abs(f.hi[2]-opening.b0)<.01)&&
			!(Math.abs(f.lo[2]-opening.b1)<.01&&Math.abs(f.hi[2]-opening.b1)<.01)).map(f=>f.surface):[];
		return {near,far,depth:far-near,opening,blockers,throat:throat.map(f=>f.index)};
	}
	return null;
}
