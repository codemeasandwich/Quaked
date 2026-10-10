/**
 * @module newer/ui/r_demoloading
 *
 * The first attract demo's loading presentation: shared state between the client, the screen and the page.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `phase`, `mode`, `appReady`, `consoleSeen`, `fadeStarted`,
 * `fadeDone`, `settledFrames`, `frames`, `world`, `revision`, `blocking`, `fallbacks`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// First attract-demo presentation only. No renderer/asset imports: client,
// screen and DOM boot code share this state without reversing module ownership.
let phase='idle',mode='demo',appReady=false,consoleSeen=false,fadeStarted=false,fadeDone=false;
let settledFrames=0,frames=0,world='',revision='',blocking=[],fallbacks=[];
export function R_DemoLoadingBoot(){phase='armed';mode='demo';appReady=false;consoleSeen=false;fadeStarted=false;fadeDone=false;settledFrames=0;frames=0;world='';revision='';blocking=[];fallbacks=[];}
export function R_DemoLoadingWelcome(){phase='warming';mode='welcome';settledFrames=0;frames=0;world='';revision='';blocking=[];fallbacks=[];}
export function R_IntroLoadingHolding(){return phase==='armed'||phase==='warming';}
export function R_WelcomeLoadingHolding(){return mode==='welcome'&&phase==='warming';}
export function R_DemoLoadingAppReady(){appReady=true;}
export function R_DemoLoadingAttract(attract){
 if(phase!=='armed')return;
 if(attract)phase='warming';else R_DemoLoadingCancel();
}
export function R_DemoLoadingCancel(){phase='done';blocking=[];}
export function R_DemoLoadingHolding(){return mode==='demo'&&(phase==='armed'||phase==='warming');}
export function R_DemoLoadingConsoleOverride(){return mode==='demo'&&(R_DemoLoadingHolding()||phase==='rolling');}
export function R_DemoLoadingFreeze(demo,signon,timedemo=false){return mode==='demo'&&phase==='warming'&&demo===true&&signon===4&&!timedemo;}
export function R_DemoLoadingConsoleDrawn(){if(R_DemoLoadingHolding())consoleSeen=true;}
export function R_DemoLoadingSplash(fade){
 if(!appReady||!consoleSeen||fadeStarted)return;
 fadeStarted=true;
 Promise.resolve().then(fade).then(()=>{fadeDone=true;},()=>{fadeDone=true;});
}
export function R_DemoLoadingFrame(snapshot){
 if(phase!=='warming')return;
 frames++;
 if(world!==snapshot.world||revision!==(snapshot.revision||'')){world=snapshot.world;revision=snapshot.revision||'';settledFrames=0;}
 blocking=Array.from(snapshot.pending||[]);fallbacks=Array.from(snapshot.fallbacks||[]);
 const presentationReady=mode==='welcome'||appReady&&consoleSeen&&fadeDone;
 const ready=snapshot.signon===4&&!!world&&snapshot.rendered===true&&presentationReady&&blocking.length===0;
 settledFrames=ready?settledFrames+1:0;
 // Assets can replace texture/material objects between frames. Require their
 // completed frame to be followed by two stable draws, not just signon4.
 if(settledFrames>=3)phase=mode==='demo'?'rolling':'done';
}
// Retract only the automatic startup console in 200 ms after the real readiness
// gate. Ordinary/user-opened console speed retains its native preference.
export function R_DemoLoadingConsoleSpeed(speed,height){return Math.max(speed,height/.2);}
export function R_DemoLoadingConsoleClosed(){if(phase==='rolling')phase='done';}
export function R_DemoLoadingStatus(){return{phase,mode,appReady,consoleSeen,fadeStarted,fadeDone,frames,settledFrames,world,pending:blocking.slice(),fallbacks:fallbacks.slice()};}
// Readiness observes only enabled first-level mechanisms. A terminal optional
// failure never hides other requests that are still in flight.
export function R_IntroReadinessChecks(frame){
 const pending=[],fallbacks=[];
 for(const[name,state]of frame.assets||[]){if(!state.settled)pending.push(name);for(const[asset,error]of Object.entries(state.errors||state.failures||{}))fallbacks.push(name+': '+asset+': '+error);}
 if(frame.shaderPending)pending.push('GPU shaders');
 if(frame.shaderFailure)fallbacks.push('Shader warm-up: '+frame.shaderFailure);
 const rock=frame.rock||{},demon=frame.demon||{},shadows=frame.shadows||{},water=frame.water||{};
 if(rock.error||rock.failedTiles)fallbacks.push('Rock relief uses native fallback: '+(rock.error||rock.failedTiles+' failed tiles'));
 if((rock.enabled??rock.active)&&(rock.preparedState==='error'||rock.preparedState==='loading'||rock.pending||!rock.error&&rock.missingVisibleTiles>(rock.failedVisibleTiles||0)))pending.push('continuous rock relief');
 if(rock.preparedError)fallbacks.push('Prepared rock data: '+rock.preparedError+'; entry held');
 if(rock.overflowTiles)fallbacks.push('Rock working set exceeds this GPU; '+rock.overflowTiles+' halo/region tiles outside its budget');
 for(const error of demon.errors||[])fallbacks.push('Prepared displacement: '+error);
 if(demon.enabled&&(demon.pending||demon.preparedPending))pending.push('sculpted surfaces');
 if(frame.captureEnabled){if(shadows.error||shadows.spotError)fallbacks.push('Shadow initialization is still retrying: '+(shadows.error||shadows.spotError));if(shadows.pending||frame.spotOn&&!shadows.spotReady)pending.push('source shadows');}
 if(water.pending)pending.push('water reflections');
 return {pending,fallbacks};
}
