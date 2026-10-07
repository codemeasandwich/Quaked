import * as THREE from 'three';
import {sv,svs} from './server.js';
import {cl} from './client.js';
import {R_NewerGame,r_newer_shadows} from './r_anim.js';
import {SUN_SHADOW_LAYER,R_ReleaseShadowCaster} from './gl_post.js';
import {Mod_ForName} from './gl_model.js';
import {R_DrawAliasModel} from './gl_mesh.js';
import {r_avertexnormal_dots} from './anorm_dots.js';
import {R_LightPoint} from './gl_rlight.js';
import {SV_Move,MOVE_NOMONSTERS,SV_HullPointContents} from './world.js';
import {R_BisectGeometry} from './r_bisect.js';
const records=new Map();
function restoreNativeFallback(entity){for(const e of sv.edicts||[])if(e&&!e.free&&e._axeSuppressed&&entity._axeOwnerKey&&e._axeOwnerKey===entity._axeOwnerKey)e._axeSuppressedBy=entity.index;}
function dispose(record){record.group?.parent?.remove(record.group);for(const part of record.parts||[])for(const mesh of part.piece.children)R_ReleaseShadowCaster(mesh);for(const g of record.geometry||[])g.dispose();record.capMaterial?.dispose();record.entity._axeReady=false;}
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
	const capMaterial=new THREE.MeshBasicMaterial({color:0x7b2020,side:THREE.FrontSide});
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
		let floor=data.floor?.[i];
		if(!Number.isFinite(floor)){
			if(latch){const trace=SV_Move([x,y,data.origin[2]+8],[0,0,0],[0,0,0],[x,y,data.origin[2]-512],MOVE_NOMONSTERS,entity);floor=!trace.startsolid&&trace.fraction<1?trace.endpos[2]:data.origin[2]+model.mins[2];}
			else {floor=data.origin[2]+model.mins[2];const hull=world?.hulls?.[0];if(hull)for(let z=data.origin[2]+8;z>data.origin[2]-512;z-=2)if(SV_HullPointContents(hull,hull.firstclipnode,[x,y,z])===-2){floor=z+2;break;}}
		}
		const axis=new THREE.Vector3(1,0,0).cross(n).normalize();if(axis.lengthSq()<.1)axis.set(0,1,0);
		record.parts.push({piece,pivot:worldPivot,quaternion:source.quaternion.clone(),axis,positions:part.body.attributes.position.array,floor,sign:offset,lastEase:-1,minimum:0});
	}
	data.floor=record.parts.map(p=>p.floor);
	scene.add(group);
	entity._axeReady=true;
	// Latch successful replacement before removing native drawables. A failed
	// contour keeps the native death visible; expiry/reused edict slots cannot
	// resurrect an intact body after successful geometry construction.
	if(latch)for(const e of sv.edicts)if(e&&!e.free&&e._axeSuppressedBy===entity.index&&(!e._axeOwnerKey||e._axeOwnerKey===data.key))e._axeSuppressedBy=0;
	return record;
	}catch(error){dispose(record);throw error;}
}
const turn=new THREE.Quaternion();
function settle(record,time){
	const age=Math.max(0,time-record.data.at),ease=Math.min(1,age/.65);
	for(const part of record.parts){
		for(const mesh of part.piece.children){if(r_newer_shadows.value!==0)mesh.layers.enable(SUN_SHADOW_LAYER);else mesh.layers.disable(SUN_SHADOW_LAYER);}
		part.piece.quaternion.copy(part.quaternion).multiply(turn.setFromAxisAngle(part.axis,part.sign*.8*ease));
		part.piece.position.copy(part.pivot).addScaledVector(record.normal,part.sign*22*ease);
		part.piece.position.z-=Math.min(512,age*age*220);
		if(part.lastEase!==ease){
			const q=part.piece.quaternion,a=2*(q.x*q.z-q.y*q.w),b=2*(q.y*q.z+q.x*q.w),c=1-2*(q.x*q.x+q.y*q.y),p=part.positions;
			part.minimum=Infinity;for(let i=0;i<p.length;i+=3)part.minimum=Math.min(part.minimum,a*p[i]+b*p[i+1]+c*p[i+2]);part.lastEase=ease;
		}
		part.piece.position.z=Math.max(part.piece.position.z,part.floor-part.minimum+.5);
	}
}
export function R_AxeCorpsePreview(data,world,time){
	const copy={...data,origin:data.origin.slice(),angles:data.angles.slice(),normal:data.normal.slice(),...(data.floor?{floor:data.floor.slice()}:{})};
	const owner={index:-1,_axeCorpse:copy},container=new THREE.Group(),record=build(owner,container,world,false);
	settle(record,time);
	for(const part of record.parts)for(const mesh of part.piece.children){mesh.layers.disable(SUN_SHADOW_LAYER);mesh.userData.quakeAxePart=false;}
	return {mesh:record.group,dispose:()=>dispose(record)};
}
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
export function R_AxeCorpseStatus(){return [...records.values()].map(r=>({model:r.data.model,frame:r.data.frame,normal:r.data.normal,ready:!!r.group,error:r.error,halves:r.parts?.length||0,draws:r.draws||0,
	parts:r.parts?.map(p=>({floor:p.floor,lowest:p.piece.position.z+p.minimum,bodyTriangles:p.piece.children[0].geometry.attributes.position.count/3,capTriangles:p.piece.children[1].geometry.attributes.position.count/3}))||[]}));}
