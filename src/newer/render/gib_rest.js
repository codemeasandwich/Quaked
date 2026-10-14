/**
 * Shared observed-rest transition. A visual observer and an audio observer intentionally keep distinct
 * clocks: the accepted decal path samples only drawn gibs, while audio must also hear culled gibs.
 * This is the existing heuristic (0.6 units/0.3 seconds), not proof of a physics contact.
 * @returns {boolean} true exactly once when this observer first sees the gib at rest
 */
export function GibRestObserved(entity,key,origin,time){
 let g=entity[key];
 if(g===undefined||time<g.t){
  entity[key]={x:origin[0],y:origin[1],z:origin[2],t:time,still:0,done:false};return false;
 }
 if(g.done||time-g.t<.1)return false;
 const moved=Math.hypot(origin[0]-g.x,origin[1]-g.y,origin[2]-g.z);
 g.still=moved<.6?g.still+(time-g.t):0;
 g.x=origin[0];g.y=origin[1];g.z=origin[2];g.t=time;
 if(g.still>.3){g.done=true;return true;}return false;
}
