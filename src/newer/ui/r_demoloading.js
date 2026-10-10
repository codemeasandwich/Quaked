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
/**
 * Arms the first attract-demo presentation from a clean state (phase 'armed', mode 'demo'); main.js once at page
 * start, before `main()`.
 */
export function R_DemoLoadingBoot(){phase='armed';mode='demo';appReady=false;consoleSeen=false;fadeStarted=false;fadeDone=false;settledFrames=0;frames=0;world='';revision='';blocking=[];fallbacks=[];}
/**
 * Switches to the welcome presentation (phase 'warming', mode 'welcome') and restarts the readiness count; the
 * `map` command (host_cmd.js) after a local single-player connect with r_hdr on. The game holds (no physics, player
 * state kept) until the first level is ready.
 */
export function R_DemoLoadingWelcome(){phase='warming';mode='welcome';settledFrames=0;frames=0;world='';revision='';blocking=[];fallbacks=[];}
/**
 * @returns {boolean} true while the intro or welcome presentation is still held (phase 'armed' or 'warming'):
 *  readiness checks run and shadow/water captures treat the scene as initializing
 */
export function R_IntroLoadingHolding(){return phase==='armed'||phase==='warming';}
/**
 * @returns {boolean} true while a welcome start is warming up: the server skips physics and seamless travel, keeps
 *  each player's state (sv_user.js), and the screen shows only the loading artwork over
 *  black (no world or HUD) until it is ready
 */
export function R_WelcomeLoadingHolding(){return mode==='welcome'&&phase==='warming';}
/**
 * Records that the page's UI artwork has arrived (main.js, after the startup images load); the splash fade waits for it.
 */
export function R_DemoLoadingAppReady(){appReady=true;}
/**
 * Called when a demo starts playing (`CL_PlayDemoFromData`). Only the first demo after boot counts: an attract demo
 * moves to 'warming', anything else (including a profiling run) cancels the presentation.
 *
 * @param {boolean} attract true for the startup attract loop's demo
 */
export function R_DemoLoadingAttract(attract){
 if(phase!=='armed')return;
 if(attract)phase='warming';else R_DemoLoadingCancel();
}
/**
 * Ends the presentation (phase 'done') and clears the pending list; run by the disconnect command (and by
 * `CL_Disconnect` during a welcome hold), `map`, `connect`, demo playback stopping, `R_DemoSplitRelease`, and main.js
 * for network play.
 */
export function R_DemoLoadingCancel(){phase='done';blocking=[];}
/**
 * @returns {boolean} true while the attract demo is held behind the console (mode 'demo', phase 'armed' or 'warming')
 */
export function R_DemoLoadingHolding(){return mode==='demo'&&(phase==='armed'||phase==='warming');}
/**
 * @returns {boolean} true while the intro owns the console (holding, or 'rolling' while the startup console retracts):
 *  gl_screen.js forces it down or animates it up, and the menu and loading plaque stay away
 */
export function R_DemoLoadingConsoleOverride(){return mode==='demo'&&(R_DemoLoadingHolding()||phase==='rolling');}
/**
 * Whether the client should hold the attract demo still (read no messages, advance no time) while the first level warms
 * up; asked by `CL_GetMessage` and `CL_ReadFromServer`.
 *
 * @param {boolean} demo whether a demo is playing (`cls.demoplayback`)
 * @param {number} signon `cls.signon` (4 is fully signed on)
 * @param {boolean} [timedemo=false] `cls.timedemo`; a timedemo is never held
 * @returns {boolean} true while the demo presentation is warming and the demo is signed on
 */
export function R_DemoLoadingFreeze(demo,signon,timedemo=false){return mode==='demo'&&phase==='warming'&&demo===true&&signon===4&&!timedemo;}
/**
 * Records that the held startup console has been drawn (gl_screen.js), so the splash may fade onto a real frame.
 */
export function R_DemoLoadingConsoleDrawn(){if(R_DemoLoadingHolding())consoleSeen=true;}
/**
 * Starts the loading-screen fade once, when the UI artwork is ready and the console has been drawn; main.js asks each
 * frame. The fade's settling (resolved or rejected) marks the fade done, which the demo's readiness waits for.
 *
 * @param {function(): (Promise<void>|void)} fade starts the fade (`LoadingScreen_FadeOut`), run on a microtask
 */
export function R_DemoLoadingSplash(fade){
 if(!appReady||!consoleSeen||fadeStarted)return;
 fadeStarted=true;
 Promise.resolve().then(fade).then(()=>{fadeDone=true;},()=>{fadeDone=true;});
}
/**
 * Feeds one rendered frame's readiness to the presentation while warming (gl_rmain.js, from its intro readiness
 * update). The world must be signed on and rendered with nothing pending, and (for the demo) the UI ready, the console
 * drawn and the fade done. Assets can replace texture/material objects between frames. Require their completed frame
 * to be followed by two stable draws, not just signon4: after three ready frames in a row with the same world and
 * revision, the demo moves to 'rolling' and the welcome start to 'done'.
 *
 * @param {{world: string, signon: number, rendered: boolean, pending?: Iterable<string>, fallbacks?: Iterable<string>,
 *  revision?: string}} snapshot world model name, `cls.signon`, whether the frame was drawn, still-pending mechanisms and
 *  fallback notes (from `R_IntroReadinessChecks`), and a revision stamp whose change restarts the count
 */
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
/**
 * Retract only the automatic startup console in 200 ms after the real readiness gate. Ordinary/user-opened console
 * speed retains its native preference.
 *
 * @param {number} speed the `scr_conspeed` value (pixels a second)
 * @param {number} height screen height in pixels
 * @returns {number} the console retract speed in pixels a second: at least the whole height in 0.2 s
 */
export function R_DemoLoadingConsoleSpeed(speed,height){return Math.max(speed,height/.2);}
/**
 * Ends the presentation once the startup console is fully up, or when the user takes the console over (gl_screen.js).
 */
export function R_DemoLoadingConsoleClosed(){if(phase==='rolling')phase='done';}
/**
 * @returns {{phase: string, mode: string, appReady: boolean, consoleSeen: boolean, fadeStarted: boolean, fadeDone: boolean,
 *  frames: number, settledFrames: number, world: string, pending: Array<string>, fallbacks: Array<string>}} a snapshot
 *  (arrays copied): `phase` 'idle' | 'armed' | 'warming' | 'rolling' | 'done', `mode` 'demo' | 'welcome'; main.js
 *  reads it each frame to remove or fade the loading screen
 */
export function R_DemoLoadingStatus(){return{phase,mode,appReady,consoleSeen,fadeStarted,fadeDone,frames,settledFrames,world,pending:blocking.slice(),fallbacks:fallbacks.slice()};}
/**
 * Lists what still holds the first level back, and what fell back to a lesser path, from the renderer's subsystem
 * states (gl_rmain.js, each held frame). Readiness observes only enabled first-level mechanisms. A terminal optional
 * failure never hides other requests that are still in flight.
 *
 * @param {{assets?: Iterable<Array<*>>, shaderPending?: boolean, shaderFailure?: string, rock?: Object, demon?: Object,
 *  shadows?: Object, water?: Object, captureEnabled?: boolean, spotOn?: boolean}} frame `assets` [name, { settled, errors
 *  or failures }] pairs; the rock relief, sculpted-surface (demon), shadow and water probe status objects; whether
 *  shadow capture is on and the flashlight is lit
 * @returns {{pending: Array<string>, fallbacks: Array<string>}} new arrays of readable names still in flight and of
 *  fallback notes
 */
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
