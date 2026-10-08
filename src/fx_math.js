// Small helpers shared by the supplied FieldLab FX3D effects (r_fireball.js,
// r_smoketrail.js): the source's own clamp/mix/smooth/hashJS, so both ports hash and
// ease exactly as the source does.
export const clamp = ( v, a, b ) => Math.max( a, Math.min( b, v ) );
export const mix = ( a, b, t ) => a + ( b - a ) * t;
export const smooth = ( a, b, v ) => { const t = clamp( ( v - a ) / ( b - a ), 0, 1 ); return t * t * ( 3 - 2 * t ); };
export const hashJS = n => { const r = Math.sin( n * 127.1 + 31.7 ) * 43758.5453; return r - Math.floor( r ); };
