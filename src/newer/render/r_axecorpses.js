/**
 * @module newer/render/r_axecorpses
 *
 * The halves of a body cut by the powered axe (card [18]): drawn with the body's own skin at the cut.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; 1 module-level collection (Map/Set).
 *
 * Errors: throws at 5 places; catches at 2 places.
 */
import * as THREE from 'three';
import {sv,svs} from '../../engine/server/server.js';
import {cl} from '../../engine/client/client.js';
import { R_NewerGame, r_newer_shadows } from '../mode.js';
import {SUN_SHADOW_LAYER,R_ReleaseShadowCaster} from './gl_post.js';
import {Mod_ForName} from '../../engine/render/gl_model.js';
import {R_DrawAliasModel} from '../../engine/render/gl_mesh.js';
import {r_avertexnormal_dots} from '../../engine/common/anorm_dots.js';
import {R_LightPoint} from '../../engine/render/gl_rlight.js';
import {SV_Move,MOVE_NOMONSTERS,SV_HullPointContents} from '../../engine/server/world.js';
import {R_BisectGeometry} from './r_bisect.js';
import {R_CloneAliasMaterial} from './r_newerskins.js';
// The cut faces (card [18]): the body's own skin at the cut (r_bisect.js carries the skin coordinates and lighting colour to the
// cap), under a restrained red tint, not a flat red.
export const CAP_TINT=Object.freeze([1,.66,.6]);
// A half rests on the ground under it: five floor samples around where it lands give a plane (a slope tilts it), saved with the cut.
const FOOT=10;
const records=new Map();
function restoreNativeFallback(entity){for(const e of sv.edicts||[])if(e&&!e.free&&e._axeSuppressed&&entity._axeOwnerKey&&e._axeOwnerKey===entity._axeOwnerKey)e._axeSuppressedBy=entity.index;}
function dispose(record){record.group?.parent?.remove(record.group);for(const part of record.parts||[])for(const mesh of part.piece.children)R_ReleaseShadowCaster(mesh);for(const g of record.geometry||[])g.dispose();record.capMaterial?.dispose();record.entity._axeReady=false;}
/**
 * Disposes every cut-corpse record (detaches its group, releases its shadow casters, disposes its geometry and owned
 * cap material, clears the corpse edict's `_axeReady`) and empties the registry. Called on every map change by
 * `R_NewMap` (gl_rmain.js, through the hook table).
 */
export function R_ClearAxeCorpses(){for(const r of records.values())dispose(r);records.clear();}
function build(entity,scene,world=cl.worldmodel,latch=true){
	const data=entity._axeCorpse,model=Mod_ForName(data.model,false),header=model?.cache?.data;
	if(data.key&&entity._axeOwnerKey&&data.key!==entity._axeOwnerKey)throw Error('Saved cut owner mismatch');
	if(!header)throw Error('Cut corpse model unavailable: '+data.model);
	const fake={_faceSeed:data.faceSeed??null,model,_entityIndex:data.entityIndex,_qrSalt:data.skinSalt,origin:data.origin.slice(),angles:data.angles.slice(),frame:data.frame,skinnum:data.skin};
	const shade=Math.max(.12,Math.min(.64,R_LightPoint(data.origin,{worldmodel:world})/200));
	const source=R_DrawAliasModel(fake,header,r_avertexnormal_dots[((data.angles[1]*16/360)|0)&15],shade);
	if(!source)throw Error('Cut corpse pose unavailable');
	source.geometry.computeBoundingBox();
	const n=new THREE.Vector3(...data.normal).applyQuaternion(source.quaternion.clone().invert()).normalize();
	// A complete body bisection: native animation supplies the angle, while
	// the captured posed model's center supplies the cut's position.
	const center=source.geometry.boundingBox.getCenter(new THREE.Vector3()).addScaledVector(n,.001);
	let split;try{split=R_BisectGeometry(source.geometry,n.toArray(),center.toArray());}finally{fake._aliasGeo?.dispose();}
	if(split.some(p=>!p.body.getAttribute('position').count||!p.cap.getAttribute('position').count)){for(const p of split){p.body.dispose();p.cap.dispose();}throw Error('Cut did not form two closed body halves');}
	const group=new THREE.Group();group.name='quake_axe_bisection';group.userData.newerOnly=true;
	let capMaterial;
	if(source.material?.isMeshBasicMaterial&&source.material.map&&source.geometry.getAttribute('uv')){capMaterial=R_CloneAliasMaterial(source.material);capMaterial.color.multiply(new THREE.Color(...CAP_TINT));capMaterial.side=THREE.FrontSide;capMaterial.userData.quakeAxeCap=true;}
	else capMaterial=new THREE.MeshBasicMaterial({color:0x7b2020,side:THREE.FrontSide}); // (no skin to continue: the old flat cut)
	const record={entity,data,group,capMaterial,geometry:split.flatMap(p=>[p.body,p.cap]),parts:[],normal:new THREE.Vector3(...data.normal),draws:0,error:null};
	try {
	for(let i=0;i<2;i++){
		const part=split[i],pivot=part.body.boundingBox.getCenter(new THREE.Vector3());
		part.body.translate(-pivot.x,-pivot.y,-pivot.z);part.cap.translate(-pivot.x,-pivot.y,-pivot.z);
		const piece=new THREE.Group(),body=new THREE.Mesh(part.body,source.material),cap=new THREE.Mesh(part.cap,capMaterial);
		body.userData.quakeAxePart=cap.userData.quakeAxePart=true;
		body.onAfterRender=cap.onAfterRender=(_renderer,_scene,camera)=>{if(camera.layers.mask&1)record.draws++;};
		body.castShadow=cap.castShadow=true;body.receiveShadow=cap.receiveShadow=true;piece.add(body,cap);group.add(piece);
		const worldPivot=pivot.clone().applyQuaternion(source.quaternion).add(new THREE.Vector3(...data.origin));
		const offset=i===0?1:-1,x=worldPivot.x+data.normal[0]*offset*22,y=worldPivot.y+data.normal[1]*offset*22;
		let floor=data.floor?.[i],slope=data.slope?.[i];
		if(!Number.isFinite(floor)){
			slope=null;
			if(latch){
				const down=(px,py)=>{const t=SV_Move([px,py,data.origin[2]+8],[0,0,0],[0,0,0],[px,py,data.origin[2]-512],MOVE_NOMONSTERS,entity);return !t.startsolid&&t.fraction<1?[px,py,t.endpos[2]]:null;};
				const hits=[[0,0],[FOOT,0],[-FOOT,0],[0,FOOT],[0,-FOOT]].map(([dx,dy])=>down(x+dx,y+dy)).filter(Boolean);
				const plane=fitPlane(hits);slope=plane?.normal??[0,0,1];
				// the rest height: the fitted ground under the half's middle; else the floor hit there; else the highest hit
				floor=plane?plane.at(x,y):hits[0]&&hits[0][0]===x&&hits[0][1]===y?hits[0][2]:hits.length?Math.max(...hits.map(h=>h[2])):data.origin[2]+model.mins[2];
			}
			else {floor=data.origin[2]+model.mins[2];const hull=world?.hulls?.[0];if(hull)for(let z=data.origin[2]+8;z>data.origin[2]-512;z-=2)if(SV_HullPointContents(hull,hull.firstclipnode,[x,y,z])===-2){floor=z+2;break;}}
		}
		if(!Array.isArray(slope)||slope.length!==3)slope=[0,0,1];
		const axis=new THREE.Vector3(1,0,0).cross(n).normalize();if(axis.lengthSq()<.1)axis.set(0,1,0);
		record.parts.push({piece,pivot:worldPivot,quaternion:source.quaternion.clone(),axis,positions:part.body.attributes.position.array,floor,slope,rest:[x,y],sign:offset,lastEase:-1,minimum:0});
	}
	data.floor=record.parts.map(p=>p.floor);data.slope=record.parts.map(p=>p.slope.slice());
	scene.add(group);
	entity._axeReady=true;
	// Latch successful replacement before removing native drawables. A failed
	// contour keeps the native death visible; expiry/reused edict slots cannot
	// resurrect an intact body after successful geometry construction.
	if(latch)for(const e of sv.edicts)if(e&&!e.free&&e._axeSuppressedBy===entity.index&&(!e._axeOwnerKey||e._axeOwnerKey===data.key))e._axeSuppressedBy=0;
	return record;
	}catch(error){dispose(record);throw error;}
}
// the ground's plane from floor hits (least squares z = a x + b y + c). Too few hits, too steep, or not one plane (a step, a
// ledge: a hit more than PLANAR units off the fit) is level ground: no slope is made up from a stair.
const PLANAR=1;
function fitPlane(hits){
	if(hits.length<3)return null;
	const mx=hits.reduce((s,h)=>s+h[0],0)/hits.length,my=hits.reduce((s,h)=>s+h[1],0)/hits.length,mz=hits.reduce((s,h)=>s+h[2],0)/hits.length;
	let xx=0,xy=0,yy=0,xz=0,yz=0;for(const [px,py,pz] of hits){const dx=px-mx,dy=py-my,dz=pz-mz;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;xz+=dx*dz;yz+=dy*dz;}
	const det=xx*yy-xy*xy;if(Math.abs(det)<1e-6)return null;
	const a=(xz*yy-yz*xy)/det,b=(yz*xx-xz*xy)/det,at=(x,y)=>mz+a*(x-mx)+b*(y-my);
	if(hits.some(h=>Math.abs(h[2]-at(h[0],h[1]))>PLANAR))return null;
	const l=Math.hypot(a,b,1),n=[-a/l,-b/l,1/l];
	return n[2]<.7?null:{normal:n.map(v=>Math.round(v*1e6)/1e6),at};
}
/**
 * The ground slope under a resting half, from floor samples; exported for tests (bisect_test.js) of the private
 * plane fit used when a cut is first built.
 *
 * @param {Array<Array<number>>} hits floor points `[x, y, z]` in Quake units (world space)
 * @returns {Array<number>} the plane's upward unit normal (components rounded to 6 decimals), or `[0, 0, 1]` (level
 *   ground) when there are fewer than 3 hits, the hits are collinear, any hit is more than 1 unit off the fitted plane
 *   (a step or ledge), or the plane is steeper than z < 0.7
 */
export function R_AxeFloorSlope(hits){return fitPlane(hits)?.normal??[0,0,1];}
const turn=new THREE.Quaternion(),tilt=new THREE.Quaternion(),up=new THREE.Vector3(0,0,1),ground=new THREE.Vector3(),local=new THREE.Vector3(),inverse=new THREE.Quaternion();
function settle(record,time){
	const age=Math.max(0,time-record.data.at),ease=Math.min(1,age/.65);
	for(const part of record.parts){
		for(const mesh of part.piece.children){if(r_newer_shadows.value!==0)mesh.layers.enable(SUN_SHADOW_LAYER);else mesh.layers.disable(SUN_SHADOW_LAYER);}
		// falling over, and (as it lands) lying along the ground's slope
		ground.fromArray(part.slope);tilt.setFromUnitVectors(up,ground);tilt.slerp(inverse.identity(),1-ease);
		part.piece.quaternion.copy(tilt).multiply(turn.copy(part.quaternion).multiply(inverse.setFromAxisAngle(part.axis,part.sign*.8*ease)));
		part.piece.position.copy(part.pivot).addScaledVector(record.normal,part.sign*22*ease);
		part.piece.position.z-=Math.min(512,age*age*220);
		if(part.lastEase!==ease){
			// the lowest point of the half across the ground's plane (its normal brought into the half's own frame)
			local.copy(ground).applyQuaternion(inverse.copy(part.piece.quaternion).invert());const p=part.positions;
			part.minimum=Infinity;for(let i=0;i<p.length;i+=3)part.minimum=Math.min(part.minimum,local.x*p[i]+local.y*p[i+1]+local.z*p[i+2]);part.lastEase=ease;
		}
		// resting on the plane through the floor point under where it lands, never through it
		const pos=part.piece.position,d=ground.x*part.rest[0]+ground.y*part.rest[1]+ground.z*part.floor;
		pos.z=Math.max(pos.z,(d+.5-part.minimum-ground.x*pos.x-ground.y*pos.y)/ground.z);
	}
}
/**
 * Builds a detached, already-settled copy of a saved cut for the level views at level exits (`R_BuildLevelView`,
 * r_levelview.js). Works on a copy of `data` and does not trace the server world: missing rest heights are found by
 * sampling `world`'s hull 0 below each half, and the native bodies' suppression is left alone. The meshes are kept
 * out of the sun shadow layer.
 *
 * @param {{ model: string, entityIndex: number, frame: number, skin: number, at: number, origin: Array<number>,
 *   angles: Array<number>, normal: Array<number>, faceSeed?: *, key?: string, skinSalt?: number,
 *   floor?: Array<number>, slope?: Array<Array<number>> }} data a record from `Axe_ParseRecord` (not mutated)
 * @param {model_t} world the previewed level's world model (lighting and floor sampling)
 * @param {number} time the level's time (seconds) the halves are posed at; 0.65 s after `data.at` they have fallen
 * @returns {{ mesh: THREE.Group, dispose: () => void }} the group to place in the view; the caller must call
 *   `dispose()` (geometry and cap material) when the view is torn down
 * @throws {Error} when the model is not loaded ("Cut corpse model unavailable"), cannot be posed, or the cut does not
 *   form two closed halves
 */
export function R_AxeCorpsePreview(data,world,time){
	const copy={...data,origin:data.origin.slice(),angles:data.angles.slice(),normal:data.normal.slice(),...(data.floor?{floor:data.floor.slice()}:{}),...(data.slope?{slope:data.slope.map(n=>n.slice())}:{})};
	const owner={index:-1,_axeCorpse:copy},container=new THREE.Group(),record=build(owner,container,world,false);
	settle(record,time);
	for(const part of record.parts)for(const mesh of part.piece.children){mesh.layers.disable(SUN_SHADOW_LAYER);mesh.userData.quakeAxePart=false;}
	return {mesh:record.group,dispose:()=>dispose(record)};
}
/**
 * Keeps the drawn halves in step with the server's cut-corpse edicts, once per rendered frame from `R_RenderScene`
 * (gl_rmain.js, through the hook table). Only acts in local single player while playing Newer Game; otherwise every
 * built group is hidden (not destroyed, so returning to Newer Game reuses it). Builds a record the first time an edict
 * with `_axeCorpse` is seen (and rebuilds it if the record object changes); a successful build latches the
 * replacement of the native bodies it hides (clears their `_axeSuppressedBy`, so expiry or a reused slot cannot bring
 * the intact body back), writes the computed rest heights and slopes back
 * into `entity._axeCorpse.floor`/`.slope` (so they are saved), and sets `_axeReady`. A failed build records its error
 * and rebinds the native fallback so the original death stays visible. Records whose edict is gone or freed are
 * disposed. Each frame the halves fall apart, tip over and settle on the ground over 0.65 s from the cut time.
 *
 * @param {THREE.Scene} scene the world scene new groups are added to
 */
export function R_AxeCorpsesFrame(scene){
	const enabled=sv.active&&svs.maxclients===1&&R_NewerGame(),live=new Set();
	if(enabled)for(let i=1;i<sv.num_edicts;i++){
		const entity=sv.edicts[i];if(!entity||entity.free)continue;
		if(!entity._axeCorpse){if(entity._axeOwnerKey&&!entity._axeSuppressed&&!entity._axeInvalidHandled){restoreNativeFallback(entity);entity._axeInvalidHandled=true;}continue;}live.add(entity);
		let record=records.get(entity);
		if(record&&record.data!==entity._axeCorpse){dispose(record);records.delete(entity);record=null;}
		if(!record){try{record=build(entity,scene);}catch(error){
			// A loaded, previously-ready record can fail after assets change.
			// Rebind its native fallback instead of keeping an invisible corpse.
			restoreNativeFallback(entity);
			record={entity,data:entity._axeCorpse,error:String(error.message)};
		}records.set(entity,record);}
		if(!record.group)continue;record.group.visible=true;
		settle(record,sv.time);
	}
	for(const [entity,record] of records){if(!enabled){if(record.group)record.group.visible=false;continue;}if(!live.has(entity)){dispose(record);records.delete(entity);}}
}
/**
 * A snapshot of every cut-corpse record, for tests and diagnostics.
 *
 * @returns {Array<{ model: string, frame: number, normal: Array<number>, ready: boolean, error: ?string,
 *   halves: number, draws: number, parts: Array<{ floor: number, lowest: number, bodyTriangles: number,
 *   capTriangles: number }> }>} one entry per record: `ready` when its group was built, `error` the build failure,
 *   `draws` the number of main-camera mesh draws so far, and per half its rest height and current lowest point
 *   (Quake units, z) and triangle counts. Fresh objects; `normal` is the record's own array.
 */
export function R_AxeCorpseStatus(){return [...records.values()].map(r=>({model:r.data.model,frame:r.data.frame,normal:r.data.normal,ready:!!r.group,error:r.error,halves:r.parts?.length||0,draws:r.draws||0,
	parts:r.parts?.map(p=>({floor:p.floor,lowest:p.piece.position.z+p.minimum,bodyTriangles:p.piece.children[0].geometry.attributes.position.count/3,capTriangles:p.piece.children[1].geometry.attributes.position.count/3}))||[]}));}
