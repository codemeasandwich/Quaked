// First-sighting presentation borrows the renderer camera. It never moves the
// player, changes their view angles, or writes pause/timescale preferences.
import * as THREE from 'three';
import {BESTIARY_ENTRIES,BESTIARY_SPREADS,BestiaryJournal,BestiaryEncounter,Bestiary_Identify,Bestiary_FacesPlayer} from './bestiary_state.js';
import {cl,cls,cl_entities,ca_connected} from './client.js';
import {sv,svs,MOVETYPE_NONE} from './server.js';
import {PR_GetString,pr_functions} from './progs.js';
import {GetEdictFieldValue} from './pr_edict.js';
import {Bestiary_ComposeFrontispiece,Bestiary_FrontispieceMask} from './bestiary_art.js';
import {key_dest,key_game} from './keys.js';
import {R_NewerGame} from './r_anim.js';
import {R_IntroLoadingHolding} from './r_demoloading.js';
import {R_ShellTrace} from './r_shelltrace.js';
import {isXRActive} from './webxr.js';
import {COM_NewerURL} from './pak.js';
import { R_FolioPrepare } from './r_folio.js';
import {CL_SuspendGameButtons} from './cl_input.js';
import {Touch_GetLookDelta,Touch_WeaponMenuActive} from './touch.js';
import {SV_SeamlessPending} from './sv_seamless.js';

const journal=new BestiaryJournal(),encounter=new BestiaryEncounter(),images=new Map(),imageStates=new Map(),imageAt=new Map();
let frontComposite=null,frontCompositeMask=-1,frontBlank=null,frontArt=null;
const ids=new WeakMap(),frustum=new THREE.Frustum(),projection=new THREE.Matrix4(),bounds=new THREE.Box3(),centre=new THREE.Vector3(),size=new THREE.Vector3();
const axisY=new THREE.Vector3(0,1,0),up=new THREE.Vector3(),lookCamera=new THREE.PerspectiveCamera();
const portraitLight={bestiary:true,pos:[0,0,0],color:[1,.96,.9],power:2.8,radius:20,fade:0};
let clock=0,world=null,target=null,cooldown=0,base=null;
let program=null,rogueOgre=false,splittingSpawn=false,rogueStatues=false,hellSpawn=false;
const nativeFloat=(native,name)=>{const field=GetEdictFieldValue(native,name);return field?field.accessor.getFloat(field.ofs):0;};
const nativeFunction=(native,name)=>{const field=GetEdictFieldValue(native,name),fn=field&&pr_functions[field.accessor.getInt32(field.ofs)];return fn?PR_GetString(fn.s_name):'';};
function nativeEntry(native){
 if(program!==pr_functions){program=pr_functions;const names=new Set(pr_functions.map(fn=>PR_GetString(fn.s_name)));rogueOgre=names.has('MultiGrenadeTouch')&&names.has('MultiGrenadeExplode');splittingSpawn=names.has('SlimeMissile')&&names.has('SlimeMissileTouch');rogueStatues=names.has('knight_pause')&&names.has('hknight_pause');hellSpawn=names.has('tbaby_mitosis');}
 // th_die is an extended QuakeC function field, not a built-in entvars slot.
 return Bestiary_Identify(PR_GetString(native.v.classname),{rogueOgre,splittingSpawn,rogueStatues,hellSpawn,owner:native.v.owner,spawnflags:native.v.spawnflags,model:PR_GetString(native.v.model),skin:native.v.skin,
  infected:nativeFloat(native,'infected'),slime:nativeFloat(native,'slime'),deathFunction:nativeFunction(native,'th_die')});
}
function nativeDiscoverable(native,entry) {
 const v=native.v,think=nativeFunction(native,'think');
 // The pinned-zombie damage fix deliberately changes takedamage and th_pain;
 // those fields cannot be used to decide whether it is still crucified.
 if(PR_GetString(v.classname)==='monster_zombie'&&PR_GetString(v.model)==='progs/zombie.mdl'&&
  (v.spawnflags&1)&&v.movetype===MOVETYPE_NONE&&/^zombie_cruc[1-6]$/.test(think))return false;
 if(entry.id==='statue_knight'||entry.id==='statue_death_knight') {
  // Rogue's pause1 thinkers wait. Unsuffixed pause functions ACTIVATE the
  // monster, replacing these callbacks while retaining its statue identity.
  const waits=name=>name==='knight_pause1'||name==='hknight_pause1';
  if(waits(think)||['th_stand','th_walk','th_run'].some(field=>waits(nativeFunction(native,field))))return false;
 }
 return true;
}
export function R_BestiaryEntries(){return BESTIARY_ENTRIES;}
// the book's family spreads (card [19]): [ left entry, right entry ], null a blank page
export function R_BestiarySpreads(){return BESTIARY_SPREADS;}
export function R_BestiarySnapshot(){journal.reload();const state=encounter.snapshot(),loaded=imageAt.get(state.entry?.id);
 const age=loaded===undefined?1:Math.max(0,Math.min(1,(clock-loaded)/.35));
 return {...state,imageAge:age,enemyIndex:target?.native.index??null,...journal.snapshot()};}
function artwork(id,file){
 if(!imageStates.has(id)&&typeof Image!=='undefined'){
  imageStates.set(id,'loading');const image=new Image();let terminal=false;
  const finish=ok=>{if(terminal)return;terminal=true;clearTimeout(timer);image.onload=image.onerror=null;imageStates.set(id,ok?'ready':'fallback');if(ok){images.set(id,image);imageAt.set(id,clock);}};
  const timer=setTimeout(()=>{finish(false);image.src='';},30000);image.onload=()=>finish(true);image.onerror=()=>finish(false);
  try{image.src=COM_NewerURL('newer/bestiary/'+file,new URL('../newer/bestiary/'+file,import.meta.url).href);}catch{finish(false);}
 }
 return images.get(id)||null;
}
// The book's admission of a page turn (card [7]): has any of these images failed, and try those again
export function R_BestiaryArtFailed(ids){return ids.some(id=>imageStates.get(id)==='fallback');}
export function R_BestiaryArtLoading(ids){return ids.some(id=>imageStates.get(id)==='loading');}
export function R_BestiaryArtRetry(ids){for(const id of ids)if(imageStates.get(id)==='fallback')imageStates.delete(id);}
export function R_BestiaryCover(){return artwork('cover','cover.png');}
export function R_BestiaryFrontispiece(){
 journal.reload();
 // Completion is derived from all47 collection IDs, never installed assets or
 // decoded images. Keep the ordinary inner illustration during load/failure.
 if(journal.complete()){
  const complete=artwork('frontispiece-complete','frontispiece-complete.png');
  if(complete)return complete;
 }
 const blank=artwork('frontispiece-blank','frontispiece-blank.png'),mask=Bestiary_FrontispieceMask(journal.snapshot().unlocked);
 const art=mask?artwork('frontispiece','frontispiece.png'):null;
 if(mask!==frontCompositeMask||blank!==frontBlank||art!==frontArt){
  frontComposite=Bestiary_ComposeFrontispiece(blank,art,journal.snapshot().unlocked,()=>document.createElement('canvas'));
  frontCompositeMask=mask;frontBlank=blank;frontArt=art;
 }
 return frontComposite;
}
export function R_BestiaryContents(){return artwork('contents','contents.png');}
export function R_BestiaryVerso(){return artwork('verso','verso.png');}
export function R_BestiaryDedication(){return artwork('dedication','dedication.png');}
export function R_BestiaryEntryBlank(){return artwork('entry-blank','entry-blank.png');}
export function R_BestiaryHeading(id){return BESTIARY_ENTRIES.some(e=>e.id===id)?artwork('heading-'+id,'headers/'+id+'.png'):null;}
export function R_BestiaryPage(id){const entry=BESTIARY_ENTRIES.find(e=>e.id===id);return entry?.image&&journal.has(id)?artwork(id,entry.image):null;}
export function R_BestiaryAllowed(){const p=svs.clients?.[0]?.edict,peer=cls.netcon?.driverdata;
 return R_NewerGame()&&!isXRActive()&&sv.active&&svs.maxclients===1&&cl.maxclients===1&&svs.clients?.[0]?.active&&cls.state===ca_connected&&cls.signon===4&&!cls.demoplayback&&
  key_dest===key_game&&!Touch_WeaponMenuActive()&&!SV_SeamlessPending()&&!sv.paused&&!cl.paused&&!cl.intermission&&!R_IntroLoadingHolding()&&!!cl.worldmodel&&cl.worldmodel===sv.worldmodel&&
  cls.netcon?.driver===0&&!cls.netcon.disconnected&&!!peer&&!peer.disconnected&&peer===svs.clients[0].netconnection&&p===sv.edicts?.[1]&&p.v.health>0&&!p._respawn?.sequence;
}
export function R_BestiaryCancel(){encounter.cancel();target=null;base=null;cooldown=clock+.5;Touch_GetLookDelta();}
export function R_BestiaryFrame(now){clock=now;const wasActive=encounter.phase!=='idle';
 if(world!==cl.worldmodel){world=cl.worldmodel;R_BestiaryCancel();}
 if(encounter.phase!=='idle'&&(!R_BestiaryAllowed()||!target||target.native.free||target.native.v.health<=0||target.native.v.deadflag!==0))R_BestiaryCancel();
	encounter.tick(now);
 if(wasActive&&encounter.phase==='idle')Touch_GetLookDelta();
 if(encounter.phase==='idle'){target=null;base=null;}
}
export function R_BestiaryTimeScale(){return encounter.snapshot().scale;}
export function R_BestiaryFrozen(){return encounter.phase!=='idle'&&R_BestiaryTimeScale()===0;}
export function R_BestiaryInputLocked(){return encounter.phase!=='idle';}
export function R_BestiaryPortraitLight(){const state=encounter.snapshot();if(!target||!base||state.phase==='idle')return null;
 // The first-sighting portrait must remain readable in an unlit room. This
 // real temporary point source shares normal receiver/shadow selection; it
 // does not change skins, inventory, dynamic-light slots or saved settings.
 portraitLight.pos=target.centre.clone().lerp(base.position,.7).toArray();portraitLight.fade=state.progress;return portraitLight;
}
const consumed=new Set();
export function R_BestiaryKey(key,down,wasDown=false){
 if(!down&&consumed.has(key)){consumed.delete(key);return true;}
 if(down&&consumed.has(key))return true; // Held dismissing input cannot fire later.
 if(!R_BestiaryInputLocked())return false;
 if(!down)return false; // Release prior gameplay buttons through normal bindings.
 if(!wasDown){consumed.add(key);if(encounter.dismiss(clock))cooldown=clock+.95;}
 return true;
}
export function R_BestiaryObserve(scene,camera,entities){
 if(encounter.phase!=='idle'){
  if(target?.mesh.parent===scene){target.mesh.traverse(o=>{if(o.geometry){o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();}});target.mesh.updateWorldMatrix(true,true);bounds.setFromObject(target.mesh);bounds.getCenter(target.centre);bounds.getSize(target.size);}
  return false;
 }
 if(clock<cooldown||!R_BestiaryAllowed()||!camera)return false;
 journal.reload();projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
 for(const entity of entities){if(!entity)continue;let index=ids.get(entity);if(index===undefined){index=cl_entities.indexOf(entity);if(index>=0)ids.set(entity,index);}
  const native=sv.edicts?.[index];if(!native||native.free||native.v.health<=0||native.v.deadflag!==0)continue;
  const entry=nativeEntry(native);if(!entry||journal.has(entry.id))continue;
  if(!nativeDiscoverable(native,entry)||!Bestiary_FacesPlayer(native.v.angles,native.v.origin,sv.edicts[1].v.origin))continue;
  const mesh=entity._aliasMesh;if(!mesh||mesh.parent!==scene||!mesh.visible)continue;let visible=true;for(let p=mesh.parent;p;p=p.parent)if(!p.visible)visible=false;if(!visible)continue;
  // Alias animation mutates positions; event-time bounds must use this pose.
  mesh.traverse(o=>{if(o.geometry){o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();}});mesh.updateWorldMatrix(true,true);bounds.setFromObject(mesh);
  if(bounds.isEmpty()||!frustum.intersectsBox(bounds))continue;bounds.getCenter(centre);bounds.getSize(size);
  const ndc=centre.clone().project(camera);if(ndc.z< -1||ndc.z>1||Math.abs(ndc.x)>1||Math.abs(ndc.y)>1)continue;
  const distance=centre.distanceTo(camera.position);if(distance<camera.near||distance>camera.far)continue;
  const trace=R_ShellTrace(cl.worldmodel,camera.position.toArray(),centre.toArray(),0,cl_entities);if(trace.startsolid||trace.allsolid||trace.fraction<.999)continue;
  if(!journal.unlock(entry.id))continue;
  R_FolioPrepare(entry.id); // (its pencil replay starts loading now, before the page is drawn)
  target={native,mesh,centre:centre.clone(),size:size.clone()};base=null;encounter.start(entry,clock);CL_SuspendGameButtons();R_BestiaryPage(entry.id);return true;
 }
 return false;
}
export function R_BestiaryApplyCamera(camera){const state=encounter.snapshot();if(!target||state.phase==='idle')return false;
 if(!base){base={position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov:camera.fov};}
 // Borrow today's normal eye, including decelerating native inertia/bob. The
 // player's input orientation remains untouched; no physical teleport occurs.
 base.position.copy(camera.position);base.quaternion.copy(camera.quaternion);base.fov=camera.fov;
 const distance=base.position.distanceTo(target.centre),halfAspect=camera.aspect*.5;
 // Conservative bounding sphere fits either half even for broad enemies.
 const radius=Math.max(4,target.size.length()*.5),fit=2*Math.atan(radius/Math.max(1,distance-radius)/Math.min(.72,halfAspect*.72))*180/Math.PI;
 const focusedFov=Math.max(5,Math.min(base.fov,fit));
 camera.position.copy(base.position);up.set(0,1,0).applyQuaternion(base.quaternion);lookCamera.position.copy(base.position);lookCamera.up.copy(up);lookCamera.lookAt(target.centre);
 const horizontalScale=1/Math.tan(focusedFov*Math.PI/360)/camera.aspect,offset=Math.atan(.5/horizontalScale);
 lookCamera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(axisY,state.side==='left'?-offset:offset));
 camera.quaternion.slerpQuaternions(base.quaternion,lookCamera.quaternion,state.progress);camera.fov=base.fov+(focusedFov-base.fov)*state.progress;
 camera.updateProjectionMatrix();camera.matrix.compose(camera.position,camera.quaternion,camera.scale);camera.matrixWorld.copy(camera.matrix);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
 return true;
}
