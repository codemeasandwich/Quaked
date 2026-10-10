/**
 * @module newer/gameplay/sv_axecut
 *
 * Hooks into QuakeC for the powered axe's cut (card [18]): stronger axe damage with power-ups and the cut halves of a
 * confirmed kill.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `active`; 1 module-level collection (Map/Set).
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * `SV_AxeReset` clears it after a QuakeC error.
 */
// Narrow native-QuakeC hooks. QC retains the trace, immunity, armor, obituary,
// monster counters, targets, drops and death callbacks. We only raise combined
// power-up axe damage and replace the confirmed kill's enhanced presentation.
import {sv,svs} from '../../engine/server/server.js';
import {cls,ca_dedicated} from '../../engine/client/client.js';
import {pr_crc,pr_functions,PR_GetString,pr_globals_int,pr_globals_float,pr_global_struct,PROG_TO_EDICT} from '../../engine/progs/progs.js';
import {OFS_PARM0,OFS_PARM1,OFS_PARM2,OFS_PARM3} from '../../engine/progs/pr_comp.js';
import {ED_Alloc,ED_FindFunction,ED_NewString,GetEdictFieldValue} from '../../engine/progs/pr_edict.js';
import {COM_FindFile} from '../../engine/common/pak.js';
import { R_NewerGame } from '../mode.js';
import {R_AxeSwingNormal} from '../render/r_axepose.js';
import {R_NewerSkinSalt} from '../render/r_newerskins.js';
import {SV_LinkEdict} from '../../engine/server/world.js';
import {MAX_EDICTS} from '../../engine/common/quakedef.js';
// Kept halves cost an entity each (card [18]); near the engine's limit they go after 30 s as before, never exhausting it.
export const AXE_KEEP_MARGIN=64;
let active=null;
/**
 * Forgets the axe hit in progress. Called by `PR_RunError` (after a QuakeC error dumps the stack) and by
 * `PR_LoadProgs`, so a call that never returns through `SV_AxeFunctionLeave` leaves no stale state.
 */
export function SV_AxeReset(){active=null;}
const names=new WeakMap();
const functionName=fn=>{if(!fn)return '';let name=names.get(fn);if(name===undefined){name=PR_GetString(fn.s_name);names.set(fn,name);}return name;};
const GIB=/^progs\/(gib[123]|zom_gib|h_[a-z0-9_]+)\.mdl$/;
const field=(entity,name)=>{const f=GetEdictFieldValue(entity,name);return f?f.accessor.getFloat(f.ofs):0;};
/**
 * Hook run by `PR_EnterFunction` on every QuakeC call (its token is kept on the progs stack frame and handed back
 * to `SV_AxeFunctionLeave`). Starts tracking when `W_FireAxe` calls `T_Damage` in single-player Newer Game with the
 * stock progs (CRC 24778), on a live monster, by the player holding the Quad; with Pentagram too ("combo") it
 * raises the damage argument (`OFS_PARM3`) to a sure kill, (health + armour + 1000) / 4 + 1. Without the combo the
 * hit is tracked only if the axe pose gives a swing normal for the cut. While tracking, a `Killed` call on the
 * target marks the kill confirmed.
 *
 * @param {dfunction_t} fn QuakeC function being entered
 * @param {?dfunction_t} caller the function that called it (`pr_xfunction`)
 * @returns {?{previous: ?Object, target: edict_t, combo: boolean, normal: ?Array<number>, killed: boolean, gibs: Set<edict_t>,
 *  record: Object}} a token for this hit (stacked over any outer one through `previous`), or null when the call is not
 *  a qualifying axe hit (including the `Killed` call, which only marks the active token). `record` is the saved
 *  'slice' description: model, entity index, frame, skin, origin and angles (Quake units, degrees), the cut `normal`
 *  (world-space unit vector), `at` (sv.time seconds), `skinSalt` and the optional `faceSeed`
 */
export function SV_AxeFunctionEnter(fn,caller){
	const name=functionName(fn);
	if(active&&name==='Killed'&&PROG_TO_EDICT(pr_globals_int[OFS_PARM0])===active.target){active.killed=true;return null;}
	if(name!=='T_Damage'||functionName(caller)!=='W_FireAxe'||pr_crc!==24778||svs.maxclients!==1||cls.state===ca_dedicated||!R_NewerGame())return null;
	const attacker=PROG_TO_EDICT(pr_globals_int[OFS_PARM2]),target=PROG_TO_EDICT(pr_globals_int[OFS_PARM0]);
	if(!attacker||attacker.index!==1||PROG_TO_EDICT(pr_globals_int[OFS_PARM1])!==attacker||!(field(attacker,'super_damage_finished')>sv.time)||!target||target.free||target.v.health<=0||target.v.takedamage===0||!PR_GetString(target.v.classname).startsWith('monster_'))return null;
	const combo=field(attacker,'invincible_finished')>sv.time,normal=R_AxeSwingNormal(COM_FindFile('progs/v_axe.mdl')?.data,attacker.v.weaponframe,Array.from(attacker.v.v_angle));
	if(!combo&&!normal)return null;
	const token={previous:active,target,combo,normal,killed:false,gibs:new Set(),record:{version:1,kind:'slice',model:PR_GetString(target.v.model),entityIndex:target.index,frame:target.v.frame|0,skin:target.v.skin|0,origin:Array.from(target.v.origin),angles:Array.from(target.v.angles),normal,at:sv.time}};
	active=token;
	token.record.skinSalt=R_NewerSkinSalt();
	if(target._faceSeed!=null)token.record.faceSeed=target._faceSeed;
	if(combo)pr_globals_float[OFS_PARM3]=(Math.max(0,target.v.health)+Math.max(0,target.v.armorvalue)+1000)/4+1;
	return token;
}
/**
 * Hook run when an entity gets a model (`PF_setmodel` in pr_cmds.js, and Newer gore gibs in sv_gore.js): while an
 * axe hit is active and QuakeC `self` is its target, records gib and head models (progs/gib1-3, zom_gib, h_*.mdl)
 * so they are hidden with the corpse after a confirmed kill.
 *
 * @param {edict_t} entity entity whose model was set
 * @param {string} name model path, e.g. 'progs/gib1.mdl'
 */
export function SV_AxeGibSeen(entity,name){
	if(active&&PROG_TO_EDICT(pr_global_struct.self)===active.target&&GIB.test(name))active.gibs.add(entity);
}
function removal(entity){const fn=ED_FindFunction('SUB_Remove');entity.v.think=fn?pr_functions.indexOf(fn):0;entity.v.nextthink=sv.time+30;}
/**
 * Hook run by `PR_LeaveFunction` with the token from `SV_AxeFunctionEnter`; restores the outer token and, when the
 * kill was confirmed, replaces its presentation. QC keeps the death callbacks and everything else. With the
 * Quad+Pentagram combo nothing is kept: if QuakeC spawned no gibs (fish and tarbaby have no ordinary gib branch),
 * six native gib entities are spawned and the target is hidden. Otherwise an `info_notnull` corpse entity carrying
 * `_axeCorpse` (the cut-halves record, drawn by r_axecorpses.js and saved with the edict) is spawned and the target
 * and its gibs are marked suppressed by it. Kept halves cost an entity each (card [18]): they stay, as any corpse
 * does, unless fewer than `AXE_KEEP_MARGIN` edicts remain free, when the corpse goes after 30 s via `SUB_Remove`.
 * Spawned gibs are always removed after 30 s.
 *
 * @param {?Object} token the value `SV_AxeFunctionEnter` returned for this call; null does nothing
 */
export function SV_AxeFunctionLeave(token){
	if(!token)return;
	active=token.previous;
	if(!token.killed)return;
	if(token.combo){
		// Fish and tarbaby have no ordinary gib branch. Keep their death
		// callbacks, but supply real native gib entities after a confirmed kill.
		if(token.gibs.size===0){
			for(let i=0;i<6;i++){
				const name='progs/gib'+(i%3+1)+'.mdl',index=sv.model_precache.indexOf(name);if(index<1)continue;
				const e=ED_Alloc();e.v.classname=ED_NewString('gib');e.v.model=ED_NewString(name);e.v.modelindex=index;e.v.origin=token.record.origin;e.v.movetype=6;e.v.solid=0;e.v.velocity=[Math.cos(i*Math.PI/3)*140,Math.sin(i*Math.PI/3)*140,180+i*12];e.v.avelocity=[90,130,170];removal(e);SV_LinkEdict(e,false);
			}
			token.target._axeSuppressed=true;
		}
		return;
	}
	const corpse=ED_Alloc();corpse.v.classname=ED_NewString('info_notnull');corpse.v.origin=token.record.origin;corpse.v.movetype=0;corpse.v.solid=0;corpse._axeCorpse=token.record;token.record.key=corpse.index+'@'+token.record.at;corpse._axeOwnerKey=token.record.key;if(sv.num_edicts>MAX_EDICTS-AXE_KEEP_MARGIN)removal(corpse); /* (the halves stay, as any corpse does, card [18], unless entities are running out) */SV_LinkEdict(corpse,false);
	for(const e of new Set([token.target,...token.gibs])){e._axeSuppressed=true;e._axeSuppressedBy=corpse.index;e._axeOwnerKey=token.record.key;}
}
/**
 * Asked by `R_DrawAliasModel` (gl_rmain.js) for each alias entity in Newer Game: whether the native model should be
 * skipped because the axe cut replaced it. A target or gib suppressed by a corpse stays visible until that corpse's
 * halves are built (`_axeReady`, set by r_axecorpses.js) and only while the owner keys still match, so the monster
 * never vanishes before its halves appear; an entity suppressed with no owner (the combo's target) is hidden at once.
 *
 * @param {number} index edict number (the client entity index; single-player only)
 * @returns {boolean} true when the server is active, single-player, and edict `index` (> 0) is suppressed with a ready owner
 */
export function SV_AxeEntitySuppressed(index){
	const e=sv.edicts?.[index],owner=sv.edicts?.[e?._axeSuppressedBy];return sv.active&&svs.maxclients===1&&index>0&&e?._axeSuppressed===true&&(!e._axeSuppressedBy||owner?._axeReady===true&&(!e._axeOwnerKey||owner._axeOwnerKey===e._axeOwnerKey));
}
