/**
 * @module newer/render/r_nailhits
 *
 * Nail impacts, effect 8 of the add-on effects for every game (card T-3faa98e3, docs/nail-impacts-2026-10-14.md):
 * sparks and a puff where a nail strikes the world, bubbles where it strikes under water. Only the two native nail
 * temp events call this (TE_SPIKE, TE_SUPERSPIKE); the shotgun and lightning gun are never touched. Keeps their
 * original particles, hole, sound and random sequence. World geometry is queried through the existing decal finder
 * and point hull; ambiguous contacts receive no addition. Moving-brush geometry is not queried: dry additions require a
 * recoverable world surface; submerged points require a proven pool. The shared layer reserves 128 nails slots; no
 * accepted effect lends particles or dynamic lights.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: none (constant tables only).
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl } from '../../engine/client/client.js';
import { Mod_PointInLeaf } from '../../engine/render/gl_model.js';
import { R_NewerGame } from '../mode.js';
import { R_DecalSurface } from './r_decals.js';
import { R_MoteSpawn, R_MotesRegister, R_MotesRemove, MOTE_SPARK, MOTE_PUFF, MOTE_BUBBLE } from './r_motes.js';
import { FX_Random, FX_Contents, FX_Blocked, FX_LiquidAbove, FX_EMPTY, FX_SOLID, FX_WATER, FX_SLIME } from './fx_world.js';

/** Archived Options switch; Classic always keeps the native impact alone. */
export const r_nailhits = new cvar_t( 'r_nailhits', '1', true );
const random = () => FX_Random( 'nails' );
const offsets = [ [0,0,0], [.5,0,0], [-.5,0,0], [0,.5,0], [0,-.5,0], [0,0,.5], [0,0,-.5] ];

// Network coordinates can quantize a contact onto/just inside its plane. Search only half a unit,
// copy the decal finder's borrowed result immediately, and reject competing surfaces at corners.
function contact( model, p ) {
 if (!model.nodes?.length || !model.leafs) return null;
 let found = null;
 for ( const delta of offsets ) {
  const q = p.map( (v,i) => v + delta[i] );
  if ( FX_Contents( model, q ) === FX_SOLID ) continue;
  const shared = R_DecalSurface( model, q, .8, Mod_PointInLeaf );
  if ( ! shared ) continue;
  const hit = {...shared};
  if ( Math.hypot( hit.px-p[0], hit.py-p[1], hit.pz-p[2] ) > 1 || hit.room < 1 ) continue;
  if ( found && found.surf !== hit.surf ) return null;
  found = hit;
 }
 if ( ! found ) return null;
 const point = [found.px + found.nx*.5, found.py + found.ny*.5, found.pz + found.nz*.5];
 const contents = FX_Contents( model, point );
 return contents === FX_EMPTY || contents === FX_WATER || contents === FX_SLIME ? {point,contents,normal:[found.nx,found.ny,found.nz]} : null;
}

/**
 * Adds a small outward spark/puff, or vertical bubbles in water/slime with a proven open surface.
 * @param {ArrayLike<number>} position native nail impact position, never modified
 * @param {boolean} [superNail=false] stronger nail uses a slightly larger bounded burst
 * @returns {number} newly admitted motes; zero for disabled, unsupported or saturated contacts
 */
export function R_NailHit( position, superNail = false ) {
 if ( ! R_NewerGame() || !(r_nailhits.value>0) || !cl.worldmodel || !Number.isFinite(cl.time) ) return 0;
 const p = Array.from(position??[]);
 if ( p.length!==3 || !p.every(Number.isFinite) ) return 0;
 const at = FX_Contents(cl.worldmodel,p);
 const hit = at===FX_WATER || at===FX_SLIME ? {point:p,contents:at,normal:[0,0,1]} : contact(cl.worldmodel,p);
 if ( ! hit ) return 0;
 const {point,contents,normal} = hit;
 let made=0;
 if ( contents===FX_WATER || contents===FX_SLIME ) {
  const top=FX_LiquidAbove(cl.worldmodel,point);
  if ( top===null || top<=point[2] ) return 0;
  for(let i=0;i<(superNail?5:3);i++) if(R_MoteSpawn(MOTE_BUBBLE,...point,0,0,12+random()*12,cl.time,{owner:'nails',high:top,life:1.4+random()*.8,size:.7+random()*.5})>=0) made++;
 } else {
  for(let i=0;i<(superNail?6:3);i++) {
   const speed=35+random()*65, v=normal.map(n=>n*speed+(random()-.5)*24);
   if(R_MoteSpawn(MOTE_SPARK,...point,...v,cl.time,{owner:'nails',life:.16+random()*.2,size:.65+random()*.4})>=0)made++;
  }
  if(R_MoteSpawn(MOTE_PUFF,...point,...normal.map(n=>n*8),cl.time,{owner:'nails',life:.35,size:superNail?.8:.6})>=0)made++;
 }
 return made;
}
R_MotesRegister({owner:'nails',frame:()=>{if(!(r_nailhits.value>0))R_MotesRemove('nails');},blocksMotion:(a,b)=>FX_Blocked(cl.worldmodel,a,b)});
