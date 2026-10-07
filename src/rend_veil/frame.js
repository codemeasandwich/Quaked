// Extracted from owner-supplied Quaked Rend the Veil 1.0.0; see tools/summoning_reference/provenance.json.
import { PROFILE } from './config.js';
/** Origin = destination floor/contact point. Local +Y = up; local +Z = creature facing. */
function makeEffectFrame(THREE,{origin,up,forward,height}) {
  const T=THREE;
  if(![origin,up,forward].every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)))
    throw new TypeError('origin/up/forward must be finite xyz arrays in the HOST RENDER coordinate system');
  if(!Number.isFinite(height)||height<=0)throw new TypeError('height must be positive in host render-world units');
  const y=new T.Vector3(...up),z=new T.Vector3(...forward);
  if(y.lengthSq()<1e-10||z.lengthSq()<1e-10)throw new TypeError('zero basis vector');
  y.normalize();z.addScaledVector(y,-z.dot(y));
  if(z.lengthSq()<1e-10)throw new TypeError('up and forward must not be parallel');
  z.normalize();const x=new T.Vector3().crossVectors(y,z).normalize();
  const frame=new T.Matrix4().makeBasis(x,y,z),unit=height/PROFILE.effectAuthoringHeight;
  frame.scale(new T.Vector3(unit,unit,unit));frame.setPosition(new T.Vector3(...origin));return frame;
}
function validateFrame(T,values) {
  if(!Array.isArray(values)||values.length!==16||!values.every(Number.isFinite))throw new TypeError('Invalid frame matrix');
  const frame=new T.Matrix4().fromArray(values),e=frame.elements;
  const x=new T.Vector3(e[0],e[1],e[2]),y=new T.Vector3(e[4],e[5],e[6]),z=new T.Vector3(e[8],e[9],e[10]);
  const scale=x.length(),eps=1e-5*Math.max(1,scale*scale);
  if(scale<1e-6||frame.determinant()<=0||Math.abs(e[3])+Math.abs(e[7])+Math.abs(e[11])+Math.abs(e[15]-1)>1e-5||
     Math.abs(y.length()-scale)>scale*1e-4||Math.abs(z.length()-scale)>scale*1e-4||
     Math.abs(x.dot(y))+Math.abs(y.dot(z))+Math.abs(z.dot(x))>eps)
    throw new TypeError('Effect frame must be finite, affine, right-handed and uniformly scaled (no shear).');
  return {frame,scale};
}

export { makeEffectFrame,validateFrame };
