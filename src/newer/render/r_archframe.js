/**
 * @module newer/render/r_archframe
 *
 * Measuring an arch's real depth in the BSP, for the frames of level exits.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `hidden`, `hiddenModels`, `hiddenCount`, `hiddenModelCount`,
 * `revision`; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Measure real BSP arch depth. No guessed constant: the front marker plus
// three actual throat faces must agree on the far boundary before moving it.
const MARKER = /^[aew]?door|^dr\d|^[w]?enter|^z?_?exit|arch|^window|^gate|^portc/i;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const add=(a,b,d)=>a.map((v,i)=>v+b[i]*d);
let hidden=new WeakSet(), hiddenModels=new WeakMap(), hiddenCount=0, hiddenModelCount=0, revision=0;
/**
 * Forgets every hidden arch surface and model and bumps the revision. Called by `sv_seamless.js` when a level's
 * seamless exits are set up or reset, and when a way back is shut (the only arch surfaces ever hidden are the way
 * back's). The hidden sets otherwise live for the current level.
 */
export function R_ClearArchHidden(){hidden=new WeakSet();hiddenModels=new WeakMap();hiddenCount=0;hiddenModelCount=0;revision++;}
/**
 * Hides world surfaces from drawing (Newer Game only): the interior blockers `R_MeasureArchFrame` found inside a way
 * back's arch. Bumps the revision so the world occluder and batch visibility are rebuilt. Kept until
 * `R_ClearArchHidden`.
 *
 * @param {Iterable<msurface_t>} surfaces the surfaces to hide; held weakly
 */
export function R_HideArchSurfaces(surfaces){for(const s of surfaces){if(!hidden.has(s))hiddenCount++;hidden.add(s);}revision++;}
/**
 * Hides one inline brush model (a door or bars inside a way back's arch) from drawing while its physical brush stays
 * solid. Bumps the revision. Kept until `R_ClearArchHidden`.
 *
 * @param {string} name the brush model name, e.g. `*12`
 * @param {?Array<msurface_t>} surfaces the world model's surface array, used as the key so a different world never
 *   matches; nothing happens when absent
 */
export function R_HideArchModel(name,surfaces){if(!surfaces)return;let names=hiddenModels.get(surfaces);if(!names){names=new Set();hiddenModels.set(surfaces,names);}if(!names.has(name))hiddenModelCount++;names.add(name);revision++;}
/**
 * Tells whether a world surface was hidden by `R_HideArchSurfaces`. Called per surface while building and drawing the
 * world (`gl_rsurf.js`, `gl_post.js`), which also require `R_NewerGame()`.
 *
 * @param {?msurface_t} surface the surface to test
 * @returns {boolean} true when it is hidden
 */
export function R_ArchSurfaceHidden(surface){return !!surface&&hidden.has(surface);}
/**
 * Tells whether an inline brush model was hidden by `R_HideArchModel` for this world. Read by `gl_rsurf.js` when a
 * brush entity is drawn (`userData.archHidden`).
 *
 * @param {string} name the brush model name, e.g. `*12`
 * @param {?Array<msurface_t>} surfaces the model's surface array (shared with the world model)
 * @returns {boolean} true when it is hidden
 */
export function R_ArchModelHidden(name,surfaces){return !!surfaces&&hiddenModels.get(surfaces)?.has(name)===true;}
/**
 * Returns a counter that changes on every hide or clear, so `gl_rsurf.js` knows when to rebuild the world occluder and
 * re-apply batch visibility.
 *
 * @returns {number} a monotonically increasing integer (starts at 0 when the module loads)
 */
export function R_ArchHiddenRevision(){return revision;}
/**
 * Tells whether anything is hidden at all, letting the renderer skip the per-surface restore pass.
 *
 * @returns {boolean} true when at least one surface or model is hidden
 */
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
/**
 * Measures the real depth of the arch around a level exit in the BSP, with no guessed constant: a front face with a
 * door/arch-like texture name facing back along `through`, plus left, right and roof throat faces, and an extrusion
 * whose far end has left, right and horizontal faces that agree. Called by `sv_seamless.js` when a level's exits are
 * set up: outgoing crossings are moved to the far face, and the way back (`returning`) also gets the interior
 * blockers to hide. Only faces within the box -128..160 (along `through`), -256..256 (along `tangent`) and -48..400
 * (height) Quake units of the crossing centre are considered.
 *
 * @param {model_t} model the world model (`sv.worldmodel`); its `firstmodelsurface`/`nummodelsurfaces` range is scanned
 * @param {{ kind: string, center: Array<number>, through: Array<number>, tangent: Array<number> }} transform a level
 *   crossing from `r_levelgraph.js`; only `kind: 'plane'` is measured. `center` is the crossing point (Quake units,
 *   world space), `through` the unit direction out through the exit, `tangent` the horizontal unit direction across it
 * @param {boolean} [returning=false] true for the way back into this level: the front marker may lie 4 units behind
 *   to 128 ahead of the centre (otherwise 128 behind to 32 ahead) and blockers are collected
 * @returns {?{ near: number, far: number, depth: number, opening: { axisA: Array<number>, axisB: Array<number>,
 *   a0: number, a1: number, b0: number, b1: number, shift: Array<number> }, blockers: Array<msurface_t>,
 *   throat: Array<number> }} distances along `through` from the centre (Quake units) to the arch's near and far faces
 *   (depth 4..128), the opening rectangle in tangent/vertical coordinates, the fully contained interior surfaces
 *   (empty unless `returning`) and the surface indices of the left/right/roof throat faces; null when no arch is found
 *   or `transform` is not a plane
 */
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
