// Source-bound physical ceiling fixtures. No renderer, cvars or gameplay state.
// FNV is a fast admission fingerprint, not a security/hash authenticity claim;
// known geometry and unique helper matching are checked separately.
const BUNDLED_E1M1_BYTES = 1365176;
const BUNDLED_E1M1_FNV = 0xa7af00e6;
export const FIXTURE_CONE = [ Math.cos(18*Math.PI/180), Math.cos(32*Math.PI/180) ];
const finite3 = v => (Array.isArray(v)||ArrayBuffer.isView(v)) && v.length >= 3 && Array.from(v.slice(0,3)).every(Number.isFinite);
export function R_LightCone(direction, cone) {
 if (!finite3(direction) || direction.length!==3 || cone?.length!==2 || ![cone[0],cone[1]].every(Number.isFinite) || cone[0]>1 || cone[0]<=cone[1] || cone[1]<=0) return null;
 const length=Math.hypot(...direction); if(length<1e-8)return null;
 return { direction:Array.from(direction,v=>v/length), cone:[cone[0],cone[1]] };
}
export function R_LightConeFactor(receiver, source, direction, cone) {
 const shape=R_LightCone(direction,cone);if(!shape)return 1;
 const delta=receiver.map((v,a)=>v-source[a]),length=Math.hypot(...delta);
 if(length<1e-8)return 0;
 const cosine=delta.reduce((v,d,a)=>v+d/length*shape.direction[a],0);
 const t=Math.max(0,Math.min(1,(cosine-shape.cone[1])/(shape.cone[0]-shape.cone[1])));
 return t*t*(3-2*t);
}
export const POINT_CONE_GLSL = `
float pointCone(vec3 receiver,int index){
 if(dot(uLightDirection[index],uLightDirection[index])<.5)return 1.;
 vec3 delta=receiver-uLightPos[index].xyz;float distance=length(delta);
 if(distance<.00001)return 0.;
 return smoothstep(uLightCone[index].y,uLightCone[index].x,dot(delta/distance,uLightDirection[index]));
}
`;
export function R_KnownFixtureSource(model) {
 if(model?.name!=='maps/e1m1.bsp')return false;
 const source=model.bspSourceBytes;
 const bytes=source instanceof ArrayBuffer?new Uint8Array(source):source;
 if(bytes?.byteLength!==BUNDLED_E1M1_BYTES)return false;
 let hash=2166136261;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes[i],16777619)>>>0;
 return hash===BUNDLED_E1M1_FNV;
}
/** Return one-to-one known exit-corridor panel/helper pairs, never mutating inputs.
 * callbacks read actual polygon geometry and native BSP air leaves. All six
 * panels must qualify; unknown source, incomplete geometry or ambiguity safely
 * retains the original isotropic lights and procedural surface clustering.
 */
export function R_ExitFixturePairs(model,entities,lights,{info,bounds,leaf}) {
 if(!R_KnownFixtureSource(model))return [];
 const exits=entities.filter(e=>e.classname==='trigger_changelevel'&&e.map==='e1m2');
 if(exits.length!==1||!/^\*\d+$/.test(exits[0].model||''))return [];
 const exit=model.submodels?.[Number(exits[0].model.slice(1))];
 if(!finite3(exit?.mins)||!finite3(exit?.maxs))return [];
 const axis=(exit.mins[0]+exit.maxs[0])/2, end=exit.maxs[1];
 const pairs=[],used=new Set();
 const first=model.firstmodelsurface||0,last=first+(model.nummodelsurfaces||model.surfaces.length);
 for(let face=first;face<last;face++){
  const surf=model.surfaces[face];if(surf?.texinfo?.texture?.name!=='tlight01')continue;
  const sign=surf.flags&2?-1:1, normal=surf.plane.normal.map(v=>v*sign);
  if(normal[2]>-.999)continue;
  const geometry=info(surf),box=bounds(surf);if(!geometry||!box)continue;
  const center=geometry.center;
  if(Math.abs(center[0]-axis)>1 || center[1]<=end || center[1]>end+1150 || center[2]>=0)continue;
  if(Math.abs(box[3]-box[0]-32)>.01||Math.abs(box[4]-box[1]-32)>.01)continue;
  const matches=lights.filter(l=>l.classname==='light'&&!l.emitter&&Math.abs(l.pos[0]-center[0])<.01&&Math.abs(l.pos[1]-center[1])<.01&&center[2]-l.pos[2]>=64&&center[2]-l.pos[2]<=88);
  if(matches.length!==1||used.has(matches[0]))return [];
  const helper=matches[0],position=center.map((v,a)=>v+normal[a]*10);
  // Confirm an air segment toward the authored helper, not an unrelated lamp
  // separated by a wall. No physics/native data is changed.
  for(let t=0;t<=8;t++){const p=position.map((v,a)=>v+(helper.pos[a]-v)*t/8);if(leaf(p,model).contents!==-1)return [];}
  used.add(helper);pairs.push({face,helper,position,direction:normal,cone:FIXTURE_CONE.slice(),center:center.slice()});
 }
 return pairs.length===6?pairs:[];
}
