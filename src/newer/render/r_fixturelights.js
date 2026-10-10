/**
 * @module newer/render/r_fixturelights
 *
 * Ceiling fixtures as light sources, matched to the map's own geometry.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Source-bound physical ceiling fixtures. No renderer, cvars or gameplay state.
// FNV is a fast admission fingerprint, not a security/hash authenticity claim;
// known geometry and unique helper matching are checked separately.
const BUNDLED_E1M1_BYTES = 1365176;
const BUNDLED_E1M1_FNV = 0xa7af00e6;
export const FIXTURE_CONE = [ Math.cos(18*Math.PI/180), Math.cos(32*Math.PI/180) ];
const finite3 = v => (Array.isArray(v)||ArrayBuffer.isView(v)) && v.length >= 3 && Array.from(v.slice(0,3)).every(Number.isFinite);
/**
 * Validates and normalises a light's cone, used whenever a light is considered for shading (`consider` in
 * gl_post.js, `R_HeightShadowFrame` in r_heightshadows.js) and by `R_LightConeFactor`.
 *
 * @param {Array<number>|Float32Array} direction the cone's axis, exactly three finite numbers, not zero length
 * @param {Array<number>} cone [inner, outer] cosines of the half-angles, with 1 >= inner > outer > 0 (e.g.
 *   `FIXTURE_CONE`, 18 and 32 degrees)
 * @returns {?{ direction: Array<number>, cone: Array<number> }} a new unit-length direction and a copy of the cone, or
 *   null when either is invalid (the light is then treated as a point light shining every way)
 */
export function R_LightCone(direction, cone) {
 if (!finite3(direction) || direction.length!==3 || cone?.length!==2 || ![cone[0],cone[1]].every(Number.isFinite) || cone[0]>1 || cone[0]<=cone[1] || cone[1]<=0) return null;
 const length=Math.hypot(...direction); if(length<1e-8)return null;
 return { direction:Array.from(direction,v=>v/length), cone:[cone[0],cone[1]] };
}
/**
 * How much of a cone light reaches a receiver: the script-side twin of `POINT_CONE_GLSL`'s `pointCone`, a
 * smoothstep between the outer and inner cosines of the angle off the axis.
 *
 * @param {Array<number>} receiver the lit point (world space, Quake units)
 * @param {Array<number>} source the light's position (world space, Quake units)
 * @param {Array<number>} direction the cone's axis (need not be unit length)
 * @param {Array<number>} cone [inner, outer] cosines, as for `R_LightCone`
 * @returns {number} 0..1: 1 inside the inner cone or for an invalid cone (a point light), 0 outside the outer cone or
 *   at the source itself
 */
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
/**
 * Whether the world model is the bundled E1M1, the only map whose fixtures are known: its name is 'maps/e1m1.bsp' and
 * its source bytes have the bundled length and 32-bit FNV-1a fingerprint. FNV is a fast admission fingerprint, not a
 * security/hash authenticity claim; known geometry and unique helper matching are checked separately
 * (`R_ExitFixturePairs`).
 *
 * @param {?model_t} model the world model, with `bspSourceBytes` (ArrayBuffer or Uint8Array) as loaded
 * @returns {boolean} true for the bundled E1M1 bytes
 */
export function R_KnownFixtureSource(model) {
 if(model?.name!=='maps/e1m1.bsp')return false;
 const source=model.bspSourceBytes;
 const bytes=source instanceof ArrayBuffer?new Uint8Array(source):source;
 if(bytes?.byteLength!==BUNDLED_E1M1_BYTES)return false;
 let hash=2166136261;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes[i],16777619)>>>0;
 return hash===BUNDLED_E1M1_FNV;
}
/**
 * Return one-to-one known exit-corridor panel/helper pairs, never mutating inputs: the six downward-facing 32 x 32
 * `tlight01` ceiling panels of the bundled E1M1's corridor to its E1M2 exit (on the exit's axis, within 1150 units
 * beyond it), each matched to the one authored `light` entity 64..88 units below it, with open air (BSP contents
 * empty) all the way from 10 units under the panel to the helper; a lamp separated by a wall is not a match. Called by
 * `R_BuildWorldLights` (gl_post.js) at map load to turn those lights into fixture cones. The callbacks read actual
 * polygon geometry and native BSP air leaves. All six panels must qualify; unknown source, incomplete geometry or
 * ambiguity safely retains the original isotropic lights and procedural surface clustering.
 *
 * @param {model_t} model the world model; must pass `R_KnownFixtureSource`
 * @param {Array<Object<string, string>>} entities the level's parsed entities (finds the one `trigger_changelevel`
 *   to e1m2 and its '*n' brush model)
 * @param {Array<{ classname: string, emitter?: boolean, pos: Array<number> }>} lights the level's world lights
 *   (world space, Quake units)
 * @param {{ info: function(msurface_t): ?{ center: Array<number> }, bounds: function(msurface_t): ?Array<number>,
 *   leaf: function(Array<number>, model_t): mleaf_t }} callbacks `info` gives a surface's polygon centre, `bounds` its
 *   box as [minX, minY, minZ, maxX, maxY, maxZ], `leaf` is `Mod_PointInLeaf`
 * @returns {Array<{ face: number, helper: object, position: Array<number>, direction: Array<number>,
 *   cone: Array<number>, center: Array<number> }>} exactly six pairs (surface index, matched light, source position
 *   10 units below the panel, downward unit direction, a copy of `FIXTURE_CONE`, panel centre), or [] when any check
 *   fails
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
