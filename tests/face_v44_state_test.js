// Independent public state checks: only injected game time/RNG drive blinking.
import { FaceState } from '../src/newer/ui/face_state.js';
const check = (value, label) => { if (!value) throw Error(label); };
const same = (actual, expected, label) => check(actual === expected, `${label}: ${actual} != ${expected}`);
const sample = (state, time, fields = {}) => state.frame({time, health:100, ...fields});

Deno.test('v4.4 periodic blink uses the complete 150 ms closure and bounded injected interval', () => {
 for (const [random, first] of [[0,3],[.5,4.5],[1,6]]) {
  const state = new FaceState({random:()=>random});
  same(sample(state,0).eyeState,'open','spawn opens eyes');
  same(sample(state,first-.0001).eyeState,'open','no premature blink');
  same(sample(state,first).eyeState,'blink','blink begins at scheduled game time');
  same(sample(state,first+.1499).eyeState,'blink','closure lasts through 149.9 ms');
  same(sample(state,first+.15).eyeState,'open','closure ends at 150 ms');
  same(sample(state,2*first-.0001).eyeState,'open','next interval does not rapidly catch up');
  same(sample(state,2*first).eyeState,'blink','periodic second blink occurs');
 }
});

Deno.test('v4.4 blink pause and clock reversal preserve timing without wall-clock callbacks', () => {
 const state = new FaceState({random:()=>0});
 sample(state,3); const paused = JSON.stringify(sample(state,3.05));
 for (let frame=0;frame<120;frame++) same(JSON.stringify(sample(state,3.05)),paused,'paused game time is immutable');
 same(sample(state,3.1499).eyeState,'blink','resume retains remaining closure');
 same(sample(state,3.15).eyeState,'open','resume completes original closure');
 sample(state,6); same(sample(state,1).eyeState,'open','reversed clock resets pending closure');
 same(sample(state,3.9999).eyeState,'open','reversed epoch gets a full new interval');
 same(sample(state,4).eyeState,'blink','reversed epoch resumes periodic schedule');
 state.reset(20); same(sample(state,20).eyeState,'open','explicit world reset opens eyes');
 same(sample(state,23).eyeState,'blink','world reset starts its own interval');
});

Deno.test('v4.4 Quad, Pentagram and their overlap cancel blinking and restart only after all expire', () => {
 for (const power of [{strength:true},{invulnerability:true},{strength:true,invulnerability:true}]) {
  const state = new FaceState({random:()=>0});
  same(sample(state,3).eyeState,'blink','unpowered control is blinking');
  same(sample(state,3.05,power).eyeState,'open','power acquisition cancels mid-blink');
  for (const time of [3.15,6,9,15]) same(sample(state,time,power).eyeState,'open','powered eyes never close');
  same(sample(state,20).eyeState,'open','expiry starts a fresh interval');
  same(sample(state,22.9999).eyeState,'open','expiry cannot trigger catch-up blink');
  same(sample(state,23).eyeState,'blink','ordinary blink resumes after expiry');
 }
 const overlap = new FaceState({random:()=>0});
 sample(overlap,1,{strength:true,invulnerability:true});
 same(sample(overlap,9,{invulnerability:true}).eyeState,'open','remaining Pentagram still suppresses blink');
 same(sample(overlap,12,{strength:true}).eyeState,'open','remaining Quad still suppresses blink');
 same(sample(overlap,13,{invisibility:true}).eyeState,'open','Ring alone permits a fresh normal schedule');
 same(sample(overlap,16,{invisibility:true}).eyeState,'blink','Ring does not suppress ordinary eyelids');
});

Deno.test('v4.4 death has priority over blink and stale powers until actual positive-health respawn', () => {
 const state = new FaceState({random:()=>0});
 state.reward(2.9); same(sample(state,3).eyeState,'blink','reward does not suppress blinking');
 same(sample(state,3).expression,'mischievous_excited','eyelids do not replace expression');
 const dead = sample(state,3.02,{health:0,strength:true,invulnerability:true});
 same(dead.eyeState,'dead','death closes eyes during blink');
 same(dead.expression,'focused_determined','death overrides reward and powered expression');
 state.reward(3.1); state.shot({time:3.2}); state.damage({time:3.3,healthLoss:30,angle:90});
 for (const time of [3.3,4,20]) {
  const frame=sample(state,time,{health:-1,strength:true,invulnerability:true});
  same(frame.eyeState,'dead','stale powers cannot reopen dead eyes');
  same(frame.expression,'focused_determined','later events cannot replace death expression');
 }
 const alive=sample(state,21,{health:100});
 same(alive.eyeState,'open','actual respawn opens eyes');
 same(alive.expression,'normal','respawn drops dead/reward state');
 same(sample(state,23.9999).eyeState,'open','respawn gets a full interval');
 same(sample(state,24).eyeState,'blink','respawn restores blinking');
});
