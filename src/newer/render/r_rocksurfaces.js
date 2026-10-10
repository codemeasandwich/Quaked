/**
 * @module newer/render/r_rocksurfaces
 *
 * Rock charts: continuous sampling spaces over the map's natural surfaces.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Continuous map/rest-space charts for natural world and optional brush surfaces. BSP geometry/UVs stay owned
// by the original map; charts are a separate, world-anchored sampling space.
import { seedFrom } from '../assets/rockfield.js';
import { R_RockPreset } from '../assets/rockfield_presets.js';
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
 wgrnd1_5: 'ground',
 wgrnd1_6: 'ground',
 uwall1_2: 'wall',
 bricka2_2: 'wall', // Hard-hub irregular rock artwork; historical name, not brick courses
 ground1_2: 'ground', // organic roots/soil
 ground1_6: 'ground', // outdoor moss/grass and rough ground stones
 wswamp1_2: 'ground', // organic roots, not the masonry in wswamp1_4/2_x
 wizmet1_7: 'ground', // loose aggregate, despite the name
 wall16_7: 'ground' // loose pebbles, not a constructed wall
} );
/**
 * A texture's material name for the rock tables: lower case, without an animation prefix (`+0`..`+9`, `+a`..`+j`) or a
 * `.webp` suffix.
 *
 * @param {?{ name?: string }} texture a BSP texture (or anything with a `name`)
 * @returns {string} the normalised name; '' when there is none
 */
export function R_RockMaterialName( texture ) {
 return String( texture?.name || '' ).toLowerCase().replace( /^\+[0-9a-j]/, '' ).replace( /\.webp$/, '' );
}
/**
 * Which rock profile a surface's material gets, if any. Names describe material intent, not where a face is or which
 * way it points: `ROCK_MATERIALS`, then any `rockN_N` as wall. Two exceptions use the surface's signed upward normal
 * (z, flipped for SURF_PLANEBACK): wgrnd1_5/1_6 only on faces whose normal z exceeds 0.65, and rock4_1, which the
 * owner explicitly uses on both terrain and walls (signed upward slopes are ground; undersides and tunnel roofs remain
 * wall surfaces).
 *
 * @param {?{ name?: string }} texture the surface's texture
 * @param {msurface_t} [surface] the surface (its `plane.normal` and `flags`); without it the exceptions are not applied
 * @returns {?('ground'|'wall')} the profile, or null for a material that gets no rock relief
 */
export function R_RockMaterialProfile( texture, surface ) {
 const name = R_RockMaterialName( texture );
 if ( surface && ( name === 'wgrnd1_5' || name === 'wgrnd1_6' ) && surface.plane.normal[ 2 ] * ( surface.flags & 2 ? -1 : 1 ) <= .65 ) return null;
 // The owner explicitly uses this material on both terrain and walls. Signed
 // upward slopes are ground; undersides and tunnel roofs remain wall surfaces.
 if ( name === 'rock4_1' && surface ) return ( surface.plane.normal[ 2 ] * ( surface.flags & 2 ? -1 : 1 ) > .65 ) ? 'ground' : 'wall';
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
// Edge sweep, rather than rounded line hashes: no bucket-boundary gaps at
// fractional BSP T junctions. Bounds prune candidates; exact collinearity and
// positive segment overlap decide adjacency. Point-only contacts never join.
const EDGE_EPS = .001;
function overlap( a, b ) {
 for ( let k = 0; k < 3; k ++ ) if ( a.lo[ k ] > b.hi[ k ] + EDGE_EPS || b.lo[ k ] > a.hi[ k ] + EDGE_EPS ) return false;
 // Measure deviation only over the common segment, in both directions.
 // Testing angular error against one full edge length is asymmetric for a
 // long edge touching a short BSP fragment and makes union depend on order.
 const aligned = ( edge, other ) => {
  const t = other.a.map( ( v, k ) => v - edge.a[ k ] ), cosine = dot( other.d, edge.d );
  if ( Math.abs( cosine ) < 1e-8 ) return false;
  const start = dot( t, edge.d ), end = start + cosine * other.length;
  const lo = Math.max( 0, Math.min( start, end ) ), hi = Math.min( edge.length, Math.max( start, end ) );
  if ( hi - lo <= EDGE_EPS ) return false;
  for ( const position of [ lo, hi ] ) {
   const v = t.map( ( value, k ) => value + other.d[ k ] * ( position - start ) / cosine );
   const d = edge.d;
   if ( Math.hypot( d[ 1 ] * v[ 2 ] - d[ 2 ] * v[ 1 ], d[ 2 ] * v[ 0 ] - d[ 0 ] * v[ 2 ], d[ 0 ] * v[ 1 ] - d[ 1 ] * v[ 0 ] ) > EDGE_EPS ) return false;
  }
  return true;
 };
 return aligned( a, b ) && aligned( b, a );
}
/**
 * Builds the rock charts of a map: continuous map/rest-space sampling spaces over its natural rock surfaces. BSP
 * geometry/UVs stay owned by the original map; charts are a separate, world-anchored sampling space. Called by
 * `R_RockfieldBuild` on every world build and by tools/bake_rockfield.mjs when baking. Surfaces with a rock profile
 * (sky and liquid excluded) are grouped by material and profile, then into connected components by shared edges
 * (collinear overlap, no point-only contacts). Each component becomes one chart, numbered in a stable order (by
 * material, profile and the sorted vertex set); its seed comes from the map name, material and profile, so every
 * piece of one material shares one field. Ground charts project on world x/y; walls use the fixed oblique axes
 * `ROCK_AXIS_U`/`ROCK_AXIS_V`.
 *
 * @param {model_t} model the world model (its `surfaces`, `firstmodelsurface`, `nummodelsurfaces`, `name`)
 * @param {{ includeBrushes?: boolean }} [options] `includeBrushes` (default false) also charts the brush models'
 *   surfaces (doors, platforms), marked `brush: true`
 * @returns {{ charts: Array<{ id: number, key: string, name: string, profile: string, seed: number, config: object,
 *   tangent: Array<number>, bitangent: Array<number>, amplitude: number, bounds: Array<number>,
 *   surfaces: Array<{ surface: msurface_t, brush: boolean, bounds: Array<number>, center: Array<number> }> }>,
 *   bySurface: WeakMap<msurface_t, object> }} new charts (ids from 1; `config` from `R_RockPreset`; `bounds`
 *   `[minU, minV, maxU, maxV]` in tiles, for the chart and each face; `center` the face's mean vertex, Quake units)
 *   and the chart of each charted surface; empty when the model has no surfaces
 */
export function R_RockSurfaceCharts( model, { includeBrushes = false } = {} ) {
 const charts = [], bySurface = new WeakMap(), groups = new Map();
 if ( ! model?.surfaces ) return { charts, bySurface };
 const first = model.firstmodelsurface || 0, last = first + ( model.nummodelsurfaces || model.numsurfaces || model.surfaces.length );
 const worldSurfaces = new Set( model.surfaces.slice( first, last ) );
 for ( const surf of includeBrushes ? model.surfaces : model.surfaces.slice( first, last ) ) {
  if ( ! surf?.plane || ! surf.polys || surf.flags & ( SKY | TURB ) ) continue;
  const texture = surf.texinfo?.texture, profile = R_RockMaterialProfile( texture, surf );
  if ( ! profile ) continue;
  const name = R_RockMaterialName( texture ), key = name + ':' + profile;
  if ( ! groups.has( key ) ) groups.set( key, [] );
  groups.get( key ).push( { surface: surf, polygons: vertices( surf ), brush: ! worldSurfaces.has( surf ) } );
 }
 const components = [];
 for ( const [ key, faces ] of groups ) {
  const parent = faces.map( ( _, i ) => i ), root = i => { while ( i !== parent[ i ] ) { parent[ i ] = parent[ parent[ i ] ]; i = parent[ i ]; } return i; };
  const edges = [];
  faces.forEach( ( face, index ) => {
   for ( const polygon of face.polygons ) for ( let j = 0; j < polygon.length; j ++ ) {
    const a = polygon[ j ], b = polygon[ ( j + 1 ) % polygon.length ], delta = b.map( ( v, k ) => v - a[ k ] ), length = Math.hypot( ...delta );
    if ( length <= EDGE_EPS ) continue;
    edges.push( { index, a, d: delta.map( v => v / length ), length, lo: a.map( ( v, k ) => Math.min( v, b[ k ] ) ), hi: a.map( ( v, k ) => Math.max( v, b[ k ] ) ) } );
   }
  } );
  // Use the widest world axis for a bounded interval sweep.
  const ranges = [ 0, 1, 2 ].map( k => edges.reduce( ( r, e ) => [ Math.min( r[ 0 ], e.lo[ k ] ), Math.max( r[ 1 ], e.hi[ k ] ) ], [ Infinity, -Infinity ] ) );
  const axis = ranges.map( r => r[ 1 ] - r[ 0 ] ).reduce( ( best, v, k, values ) => v > values[ best ] ? k : best, 0 );
  edges.sort( ( a, b ) => a.lo[ axis ] - b.lo[ axis ] );
  let active = [];
  for ( const edge of edges ) {
   active = active.filter( other => other.hi[ axis ] + EDGE_EPS >= edge.lo[ axis ] );
   for ( const other of active ) if ( root( edge.index ) !== root( other.index ) && overlap( edge, other ) ) parent[ root( edge.index ) ] = root( other.index );
   active.push( edge );
  }
  const connected = new Map();
  faces.forEach( ( face, i ) => { const id = root( i ); if ( ! connected.has( id ) ) connected.set( id, [] ); connected.get( id ).push( face ); } );
  for ( const members of connected.values() ) {
   // Sorted point identities describe coverage, not the random field.
   // Discovery may change membership without changing any existing height.
   const signature = [ ...new Set( members.flatMap( f => f.polygons.flat().map( p => p.join( ',' ) ) ) ) ].sort().join( ';' );
   components.push( { key: key + ':' + signature, name: key.split( ':' )[ 0 ], profile: key.split( ':' )[ 1 ], members } );
  }
 }
 components.sort( ( a, b ) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0 );
 for ( const component of components ) {
  const { key, name, profile, members } = component, config = R_RockPreset( name, profile );
  // A material/role shares its world field even before disconnected pieces
  // are discovered to connect. Component IDs remain residency/batching metadata.
  const chart = { id: charts.length + 1, key, name, profile, seed: seedFrom( ( model.name || '' ) + ':' + name + ':' + profile ), config,
   tangent: profile === 'ground' ? [ 1, 0, 0 ] : ROCK_AXIS_U, bitangent: profile === 'ground' ? [ 0, 1, 0 ] : ROCK_AXIS_V,
   amplitude: config.amplitude, bounds: [ Infinity, Infinity, -Infinity, -Infinity ], surfaces: [] };
  charts.push( chart );
  for ( const face of members ) {
   const all = face.polygons.flat(), center = [ 0, 0, 0 ], bounds = [ Infinity, Infinity, -Infinity, -Infinity ];
   for ( const point of all ) {
    const uv = R_RockCoordinates( chart, point );
    for ( let k = 0; k < 3; k ++ ) center[ k ] += point[ k ] / all.length;
    for ( let k = 0; k < 2; k ++ ) { bounds[ k ] = Math.min( bounds[ k ], uv[ k ] ); bounds[ k + 2 ] = Math.max( bounds[ k + 2 ], uv[ k ] ); }
   }
   for ( let k = 0; k < 2; k ++ ) { chart.bounds[ k ] = Math.min( chart.bounds[ k ], bounds[ k ] ); chart.bounds[ k + 2 ] = Math.max( chart.bounds[ k + 2 ], bounds[ k + 2 ] ); }
   chart.surfaces.push( { surface: face.surface, brush: face.brush, bounds, center } ); bySurface.set( face.surface, chart );
  }
 }
 return { charts, bySurface };
}
/**
 * A point's position in a chart's sampling space, used for every vertex and eye position given to the rock field.
 *
 * @param {{ tangent: Array<number>, bitangent: Array<number> }} chart the chart's projection axes
 * @param {Array<number>} point a position in Quake units (world space, or a brush's rest space)
 * @returns {Array<number>} a new `[u, v]` in tiles (`ROCK_TILE_UNITS` = 256 Quake units per tile)
 */
export function R_RockCoordinates( chart, point ) { return [ dot( chart.tangent, point ) / ROCK_TILE_UNITS, dot( chart.bitangent, point ) / ROCK_TILE_UNITS ]; }
