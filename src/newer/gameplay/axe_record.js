/**
 * @module newer/gameplay/axe_record
 *
 * Save records for the powered axe's cut halves (cards [18], face overlays): validated before any geometry is made
 * from a save.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: catches at 1 place.
 */
import { Face_Seed } from '../render/enemy_face.js';
// Optional save metadata, ignored by the original Quake underscore-key rule.
// Validate before allocating geometry from a save, and never retain stale data
// when an edict slot is recycled.
export function Axe_ValidOwnerKey(key){return typeof key==='string'&&key.length<=64&&/^[1-9][0-9]{0,4}@[0-9eE+.-]+$/.test(key)&&Number(key.split('@')[0])<65536&&Number.isFinite(Number(key.split('@')[1]));}
export function Axe_ParseRecord(encoded){
	try {
		if(encoded.length>4096)return null;
		const r=JSON.parse(decodeURIComponent(encoded));
		if(r.version!==1||r.kind!=='slice'||!/^progs\/[a-z0-9_]+\.mdl$/.test(r.model)||!Number.isInteger(r.frame)||r.frame<0||r.frame>4096||!Number.isInteger(r.skin)||r.skin<0||r.skin>255||!Number.isFinite(r.at))return null;
		if(!Number.isInteger(r.entityIndex)||r.entityIndex<1||r.entityIndex>=65536)return null;
		for(const name of ['origin','angles','normal'])if(!Array.isArray(r[name])||r[name].length!==3||r[name].some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))return null;
		if(Math.abs(Math.hypot(...r.normal)-1)>.001)return null;
		if(r.faceSeed!==undefined&&Face_Seed(r.faceSeed)===null)return null;
		if(r.skinSalt!==undefined&&(!Number.isInteger(r.skinSalt)||r.skinSalt<0||r.skinSalt>0xffffffff))return null;
		if(r.key!==undefined&&(!Axe_ValidOwnerKey(r.key)||Number(r.key.split('@')[1])!==r.at))return null;
		if(r.floor!==undefined&&(!Array.isArray(r.floor)||r.floor.length!==2||r.floor.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6)))return null;
		// each half's ground plane (its unit normal, pointing up): card [18]
		if(r.slope!==undefined&&(!Array.isArray(r.slope)||r.slope.length!==2||r.slope.some(n=>!Array.isArray(n)||n.length!==3||n.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...n)-1)>.001||n[2]<.7)))return null;
		return {version:1,kind:'slice',model:r.model,entityIndex:r.entityIndex,frame:r.frame,skin:r.skin,at:r.at,origin:r.origin,angles:r.angles,normal:r.normal,
			...(r.faceSeed===undefined?{}:{faceSeed:r.faceSeed}),...(r.key===undefined?{}:{key:r.key}),...(r.skinSalt===undefined?{}:{skinSalt:r.skinSalt}),...(r.floor===undefined?{}:{floor:r.floor}),...(r.slope===undefined?{}:{slope:r.slope})};
	}catch{return null;}
}
