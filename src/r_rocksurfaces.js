// World-only continuous sampling charts for natural surfaces. BSP geometry/UVs stay owned
// by the original map; charts are a separate, world-anchored sampling space.
import { seedFrom } from './rockfield.js';
export const ROCK_TILE_UNITS = 256;
// One oblique world projection for every bedrock orientation. Audited against
// native rock faces: walls, slopes and horizontal ceilings all retain area.
// Do not choose axes from a face normal: that would split the field at corners.
export const ROCK_AXIS_U = Object.freeze( [ .48399890, -.87506860, 0 ] );
export const ROCK_AXIS_V = Object.freeze( [ .27837972, .15397133, .94804935 ] );
const SKY = 4, TURB = 16;
// Names describe material intent, not where a face is or which way it points.
// Quake's rockN_N family and uwall1_2 are unworked bedrock. Keep visually
// reviewed terrain exceptions explicit: several "ground" names are paving.
export const ROCK_MATERIALS = Object.freeze( {
 uwall1_2: 'wall',
 bricka2_2: 'wall', // Hard-hub irregular rock artwork; historical name, not brick courses
 ground1_2: 'ground', // organic roots/soil
 ground1_6: 'ground', // outdoor moss/grass and rough ground stones
 wswamp1_2: 'ground', // organic roots, not the masonry in wswamp1_4/2_x
 wizmet1_7: 'ground', // loose aggregate, despite the name
 wall16_7: 'ground' // loose pebbles, not a constructed wall
} );
export function R_RockMaterialProfile( texture ) {
 const name = String( texture?.name || '' ).toLowerCase().replace( /^\+[0-9a-j]/, '' );
 return ROCK_MATERIALS[ name ] || ( /^rock\d+_\d+$/.test( name ) ? 'wall' : null );
}
const dot = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
function vertices( surf ) {
 const out = [];
 for ( let p = surf.polys; p; p = p.next ) {
  const v = p.verts;
  const polygon = [];
  for ( let i = 0; i < p.numverts; i ++ ) polygon.push( v instanceof Float32Array ? Array.from( v.subarray( i * 7, i * 7 + 3 ) ) : v[ i ].slice( 0, 3 ) );
  out.push( polygon );
 }
 return out;
}
export function R_RockSurfaceCharts( model ) {
 const charts = [], bySurface = new WeakMap(), keys = new Map();
 if ( ! model?.surfaces ) return { charts, bySurface };
 const first = model.firstmodelsurface || 0, last = first + ( model.nummodelsurfaces || model.numsurfaces || model.surfaces.length );
 const faces = model.surfaces.slice( first, last ).filter( s => s?.plane && s.polys ).map( surf => ( { surf, flags: surf.flags, polygons: vertices( surf ) } ) );
 for ( const face of faces ) {
  const { surf } = face, texture = surf.texinfo?.texture;
  if ( ! texture || face.flags & ( SKY | TURB ) ) continue;
  const profile = R_RockMaterialProfile( texture );
  if ( ! profile ) continue;
  const all = face.polygons.flat(), center = [ 0, 0, 0 ];
  for ( const v of all ) for ( let k = 0; k < 3; k ++ ) center[ k ] += v[ k ] / all.length;
  // One world-anchored field across every natural face in this profile,
  // including angled cliff facets. Shared edge positions always sample the
  // same height; neither BSP cuts nor a changed face normal reseed the field.
  const key = profile;
  let chart = keys.get( key );
  if ( ! chart ) {
   const tangent = profile === 'ground' ? [ 1, 0, 0 ] : ROCK_AXIS_U;
   const bitangent = profile === 'ground' ? [ 0, 1, 0 ] : ROCK_AXIS_V;
   chart = { id: charts.length + 1, key, profile, seed: seedFrom( ( model.name || '' ) + ':' + key ), tangent, bitangent,
    amplitude: profile === 'wall' ? .8 : .009, bounds: [ Infinity, Infinity, - Infinity, - Infinity ], surfaces: [] };
   charts.push( chart ); keys.set( key, chart );
  }
  const bounds = [ Infinity, Infinity, - Infinity, - Infinity ];
  for ( const v of all ) {
   const uv = R_RockCoordinates( chart, v );
   for ( let k = 0; k < 2; k ++ ) { bounds[ k ] = Math.min( bounds[ k ], uv[ k ] ); bounds[ k + 2 ] = Math.max( bounds[ k + 2 ], uv[ k ] ); }
  }
  for ( let k = 0; k < 2; k ++ ) { chart.bounds[ k ] = Math.min( chart.bounds[ k ], bounds[ k ] ); chart.bounds[ k + 2 ] = Math.max( chart.bounds[ k + 2 ], bounds[ k + 2 ] ); }
  chart.surfaces.push( { surface: surf, bounds, center } ); bySurface.set( surf, chart );
 }
 return { charts, bySurface };
}
export function R_RockCoordinates( chart, point ) { return [ dot( chart.tangent, point ) / ROCK_TILE_UNITS, dot( chart.bitangent, point ) / ROCK_TILE_UNITS ]; }
