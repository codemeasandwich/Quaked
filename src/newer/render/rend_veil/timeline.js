/**
 * @module newer/render/rend_veil/timeline
 *
 * Rend the Veil's timeline, extracted from the supplied version 1.0.0.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: throws at 1 place.
 */
// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
import { PROFILE, VISUALS as p } from './config.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
function finite(value,name='time') {
  if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError(`${name} must be a finite number`);
  return value;
}
/** Pure evaluation. Calling this function never activates an enemy or mutates a scene. */
function sampleRendVeil(elapsedSeconds) {
  finite(elapsedSeconds,'elapsedSeconds');
  const t=clamp(elapsedSeconds,0,PROFILE.completeSeconds);
  const appearanceAt=PROFILE.introSeconds,appearanceDuration=PROFILE.appearanceSeconds;
  const materialAt=appearanceAt+appearanceDuration,focusAt=PROFILE.focusSeconds;
  const totalDuration=PROFILE.completeSeconds,residualDuration=PROFILE.remnantsSeconds;
  const m=[0,appearanceAt*.32,appearanceAt*.64,appearanceAt,
    appearanceAt+appearanceDuration*.36,appearanceAt+appearanceDuration*.74,
    materialAt,focusAt,focusAt+Math.min(.12,residualDuration*.5)];
  const response=1/Math.max(.15,p.reconstructionSpeed*p.resolutionRate);
  const raw=clamp((t-appearanceAt)/appearanceDuration);
  const progress=t>=materialAt?1:Math.pow(smooth(0,1,raw),response);
  const unwind=t>=focusAt?1:Math.pow(smooth(materialAt,focusAt,t),response);
  const surfaceEffect=smooth(.30,.92,progress)*(1-unwind);
  const build=smooth(0,appearanceAt,t),active=1-unwind;
  const compress=smooth(m[5],materialAt,t)*(1-unwind*.35);
  const snapAt=focusAt,snapAge=t-snapAt;
  const collapse=1-smooth(0,p.snapDuration,snapAge);
  const formation=Math.pow(smooth(appearanceAt,appearanceAt+appearanceDuration*.56,t),1/Math.max(.15,p.formationSpeed));
  const tail=smooth(materialAt,focusAt,t)*(1-smooth(focusAt,totalDuration,t));
  const residual=tail*p.residualStrength;
  const energy=smooth(m[2],m[4],t)*active+residual*.28;
  const rippleAge=Math.max(0,t-snapAt),radius=Math.min(p.rippleRadius+.001,rippleAge*p.rippleSpeed);
  const waveEnvelope=t>=snapAt&&radius<p.rippleRadius&&t<totalDuration
    ?(1-smooth(snapAt,totalDuration,t))*Math.pow(Math.max(0,1-radius/p.rippleRadius),p.rippleFalloff*.6):0;
  let phaseIndex=0;for(let i=0;i<m.length;i++)if(t>=m[i])phaseIndex=i;
  if(t>=totalDuration)phaseIndex=9;
  const phase=elapsedSeconds<0?'pending':t<appearanceAt?'intro':t<materialAt?'appearance':t<focusAt?'unwind':t<totalDuration?'remnants':'complete';
  return Object.freeze({t,m,appearanceAt,appearanceDuration,materialAt,focusAt,totalDuration,residualDuration,
    unwindDuration:PROFILE.unwindSeconds,snapAt,snapAge,build,active,compress,collapse,formation,
    progress,unwind,surfaceEffect,energy,residual,phase,phaseIndex,rippleAge,radius,waveEnvelope,
    focused:elapsedSeconds>=focusAt,complete:elapsedSeconds>=totalDuration,pending:elapsedSeconds<0});
}

export { clamp,smooth,finite,sampleRendVeil };
