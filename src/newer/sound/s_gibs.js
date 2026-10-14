/** Effect10: quiet stock wet impacts at observed gib rest, through the existing sound cache/mixer.
 * Keeps the visual observer's state, draw gating and random sequence unchanged. No new sound renderer.
 */
import {cvar_t} from '../../engine/common/cvar.js';
import {cl,cls,cl_entities} from '../../engine/client/client.js';
import {sv} from '../../engine/server/server.js';
import {R_NewerGame} from '../mode.js';
import {GibRestObserved} from '../render/gib_rest.js';
import {S_PrecacheSound,S_StartSoundIfFree} from '../../engine/sound/snd_dma.js';
export const s_gibs=new cvar_t('s_gibs','1',true);
let world=null,frameTime=null,admitted=0;
/** Observe one current entity. origin may be an interpolated NQ point or a current QW packet point. */
export function S_GibRestObserve(entity,model,origin,time,identity=entity?._faceSeed){
 if(!entity)return;
 if(!model||!(model.flags&4)){delete entity._gibAudioState;delete entity._gibAudioContext;return;}
 if(!origin||!Number.isFinite(time)||!Array.from(origin).every(Number.isFinite))return;
 if(world!==cl.worldmodel){world=cl.worldmodel;frameTime=null;}
 const enabled=R_NewerGame()&&s_gibs.value>0&&!cl.paused&&!cl.intermission;
 const old=entity._gibAudioContext;
 const changed=!old||old.world!==world||old.model!==model||old.identity!==identity||time<old.time;
 if(changed||(!entity._gibAudioState?.done&&(time-old.time>.5||Math.hypot(origin[0]-old.x,origin[1]-old.y,origin[2]-old.z)>64)))delete entity._gibAudioState;
 entity._gibAudioContext={world,model,identity,time,x:origin[0],y:origin[1],z:origin[2],enabled};
 if(!enabled){
  if(entity._gibAudioState&&!entity._gibAudioState.done){entity._gibAudioState.t=time;entity._gibAudioState.still=0;}
  return;
 }
 if(old&&!old.enabled&&entity._gibAudioState&&!entity._gibAudioState.done){entity._gibAudioState.t=time;entity._gibAudioState.still=0;}
 if(!GibRestObserved(entity,'_gibAudioState',origin,time))return;
 if(frameTime!==time){frameTime=time;admitted=0;}
 if(admitted>=4)return;admitted++;
 // Game-supplied stock-name samples naturally win through the ordinary sound search/cache.
 S_StartSoundIfFree(-1,S_PrecacheSound('zombie/z_fall.wav'),origin,.3,1);
}
/** QW's render list may fill before an entity origin is updated. Observe packet origins without changing it. */
export function S_GibRestPackets(pack,time){
 for(let i=0;i<pack.num_entities;i++){
  const state=pack.entities[i],entity=cl_entities[state.number],model=cl.model_precache[state.modelindex];
  S_GibRestObserve(entity,model,state.origin,time,sv.active&&!cls.demoplayback?sv.edicts[state.number]?._faceSeed:entity?._faceSeed);
 }
}
