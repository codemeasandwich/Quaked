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
/**
 * Checks an axe-cut owner key, the `"<edict index>@<cut time>"` string that ties the cut halves' corpse edict to the
 * edicts it hides (written by sv_axecut.js as `corpse.index + '@' + record.at`). Used when reading
 * `_newer_axe_owner` from a save (pr_edict.js), when writing it back, and by `Axe_ParseRecord`.
 *
 * Optional save metadata, ignored by the original Quake underscore-key rule. Validate before allocating geometry from
 * a save, and never retain stale data when an edict slot is recycled.
 *
 * @param {*} key the candidate value (any type)
 * @returns {boolean} true when `key` is a string of at most 64 characters whose index part is 1..65535 and whose time
 *   part is a finite number (seconds of server time)
 */
export function Axe_ValidOwnerKey(key){return typeof key==='string'&&key.length<=64&&/^[1-9][0-9]{0,4}@[0-9eE+.-]+$/.test(key)&&Number(key.split('@')[0])<65536&&Number.isFinite(Number(key.split('@')[1]));}
/**
 * Decodes and validates one saved axe-cut record (the `_newer_axe_corpse` key of a save or level snapshot), so no
 * geometry is ever built from a malformed or hostile save. Called while parsing edicts (pr_edict.js) and when the level
 * entities are rebuilt from a snapshot (r_levelents.js).
 *
 * @param {string} encoded the URI-encoded JSON text; anything over 4096 characters is rejected
 * @returns {?{ version: 1, kind: 'slice', model: string, entityIndex: number, frame: number, skin: number, at: number,
 *   origin: Array<number>, angles: Array<number>, normal: Array<number>, faceSeed?: *, key?: string, skinSalt?: number,
 *   floor?: Array<number>, slope?: Array<Array<number>> }} a fresh object holding only the known fields, or null when
 *   anything is invalid: `model` must be `progs/<name>.mdl`, `frame` 0..4096, `skin` 0..255, `entityIndex` 1..65535,
 *   `at` (cut time, seconds) finite, `origin`/`angles`/`normal` three finite values within ±1e6 (Quake units / degrees),
 *   `normal` unit length (the cut plane); optional `faceSeed` accepted by `Face_Seed`, `skinSalt` a uint32, `key` a
 *   valid owner key whose time equals `at`, `floor` two heights, and `slope` each half's ground plane (its unit normal,
 *   pointing up, z ≥ 0.7: card [18]). Never throws (JSON and URI errors return null).
 */
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
