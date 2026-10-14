/**
 * @module newer/render/r_embers
 *
 * Effect 9 of the add-on effects for every game (card T-3faa98e3, docs/lava-embers-2026-10-14.md): quiet rising
 * embers over proven lava surfaces. Reuses the existing map-face collection, point hull and shared mote draw. Heat
 * haze, torch particles and liquid optics retain their inputs. World bounds are candidates only: gaps/undersides are
 * rejected by an exact lava/air interface query.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level `inventory` (the map's lava faces as last seen), `cursor`, `nextBirth`.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { R_GetLavaFaces } from './r_post_liquids.js';
import { R_MoteSpawn, R_MotesRemove, R_MotesRegister, MOTE_EMBER } from './r_motes.js';
import { FX_Random, FX_Contents, FX_LiquidBelow, FX_Blocked, FX_EMPTY, FX_LAVA } from './fx_world.js';
/** Saved Newer-only switch, independent of mist and liquid rendering controls. */
export const r_embers = new cvar_t('r_embers','1',true);
const random=()=>FX_Random('embers');
let inventory=null,cursor=0,nextBirth=0;
function reset(){inventory=null;cursor=0;nextBirth=0;}
function frame(time,eye,advancing){
 if(!(r_embers.value>0)){R_MotesRemove('embers');return;}
 if(!advancing||!eye||!cl.worldmodel)return;
 const faces=R_GetLavaFaces();
 if(faces!==inventory){inventory=faces;cursor=0;nextBirth=time;}
 if(time<nextBirth)return;
 nextBirth=time+.2;
 let budget=4;
 for(let visits=0;visits<Math.min(128,faces.length)&&budget>0;visits++){
  const f=faces[cursor];cursor=(cursor+1)%faces.length;
  if(!f.min||!f.max||!Number.isFinite(f.z+f.min[0]+f.min[1]+f.max[0]+f.max[1]))continue;
  if(f.max[0]<=f.min[0]||f.max[1]<=f.min[1])continue;
  if(Math.hypot(Math.max(f.min[0]-eye[0],0,eye[0]-f.max[0]),Math.max(f.min[1]-eye[1],0,eye[1]-f.max[1]),f.z-eye[2])>900)continue;
  budget--;
  const p=[f.min[0]+random()*(f.max[0]-f.min[0]),f.min[1]+random()*(f.max[1]-f.min[1]),f.z+.5];
  if(FX_Contents(cl.worldmodel,p)!==FX_EMPTY)continue;
  const hit=FX_LiquidBelow(cl.worldmodel,p,f.z-2);
  if(!hit||hit.contents!==FX_LAVA||Math.abs(hit.z-f.z)>.2)continue;
  p[2]=hit.z+.5;
  R_MoteSpawn(MOTE_EMBER,...p,0,0,12+random()*12,time,{owner:'embers',life:1.8+random()*1.4,size:.7+random()*.6});
 }
}
R_MotesRegister({owner:'embers',frame,reset,blocksMotion:(a,b)=>FX_Blocked(cl.worldmodel,a,b)});
