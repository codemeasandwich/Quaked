/**
 * @module newer/render/r_post_liquids
 *
 * The post pipeline's liquids (card [44h], split from gl_post.js): which textures are water and slime and how each
 * looks, the level's pools merged from its liquid faces, the visibility links through them, and the pools' reflection
 * probes.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level regions, visibility links and current optical map name.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * The level's pools and links are made by `R_BuildWorldLights` (gl_post.js) through `R_PostLiquidsReset`,
 * `R_PostAddLiquidLink` and `R_PostSetLiquidRegions`; everything else reads them through the getters.
 */
import { r_water_look, r_reflect, r_mist, r_heathaze, r_caustics, CAUSTIC } from './r_post_config.js';
import { r_waterwarp } from '../../engine/render/glquake.js';
import { R_WaterActive, postState } from './r_post_state.js';
import { r_newer_water } from '../mode.js';
import { R_WaterProbeUpdate, R_WaterProbeReadiness, R_WaterProbes } from './r_waterprobe.js';

// Pools of water and slime: { kind, min: [x, y], max: [x, y], z, bottom }. A ray that
// passes through one loses light to it, and surfaces beneath it get caustics.
let liquidRegions = [];
let lavaRegions = [];
let liquidMapName = '';

export const MAX_LIQUID_REGIONS = 6;

// qbsp treats water as opaque when computing visibility, so the leaves under a
// pool are not visible from outside it.  To see the bottom through a translucent
// surface, the leaves beneath each liquid face join the visible set whenever the
// leaf above that face is visible, and the other way round from inside the
// liquid, so you can see out.   [ { above, below, aboveVis, belowVis } ]
let liquidLinks = [];

/**
 * The liquid visibility links built by `R_BuildWorldLights`, used by `R_MarkLeaves` (gl_rsurf.js) so the bottom
 * of a translucent pool is seen from above and the outside from within.
 *
 * @returns {Array<{ above: object, below: object, aboveVis: Uint8Array, belowVis: Uint8Array }>} the live module
 *   list (replaced at each map; do not mutate): the leaves either side of a liquid face and their PVS rows
 */
export function R_GetLiquidLinks() {

	return liquidLinks;

}

// 0 water, 1 slime, -1 not a see-through liquid (lava is opaque, teleporters are portals)
// Stock Quake's water textures: *water0-2, *04water1/2, *04awater1 and, in Episode 3 (E3M3 to E3M5), *04mwat1/2 (murky
// water, the name has no "water" in it). Anything else starting with '*' is slime, lava or a teleporter.
// Murky water (Episode 3) is brown sediment like E1M3's *04water1, so it shares that look (see liquidMapLook).
const MURKY_WATER = /mwat/i;
export const R_IsWaterTextureName = name => name.charAt( 0 ) === '*' && /water|mwat/i.test( name ) && ! /slime|lava|teleport/i.test( name );

/**
 * What kind of see-through liquid a texture is, for the pools `R_BuildWorldLights` merges.
 *
 * @param {string} name the texture's name
 * @returns {number} 0 water, 1 slime, -1 not a see-through liquid (lava is opaque, teleporters are portals)
 */
export function liquidKind( name ) {

	const n = name.toLowerCase();
	if ( n.charAt( 0 ) !== '*' || n.indexOf( 'lava' ) >= 0 || n.indexOf( 'teleport' ) >= 0 ) return - 1;
	if ( n.indexOf( 'slime' ) >= 0 ) return 1;
	if ( R_IsWaterTextureName( n ) ) return 0;
	return - 1;

}

// Shared optical authoring: one source for materials and generated GLSL.
// Scattering uses received light. Only the toxic profile has intentional glow.
export const LIQUID_LOOKS = Object.freeze( [
	Object.freeze( { name: 'Clear', opacity: 0.05, absorption: [ 0.006, 0.0012, 0.00025 ], scatter: [ 0.035, 0.09, 0.14 ], emission: [ 0, 0, 0 ], caustic: 1.15, refraction: 1, ripple: 0.70, speed: 0.60 } ),
	Object.freeze( { name: 'Tinted', opacity: 0.08, absorption: [ 0.0065, 0.0011, 0.0045 ], scatter: [ 0.09, 0.25, 0.06 ], emission: [ 0, 0, 0 ], caustic: 1.05, refraction: 1, ripple: 0.65, speed: 0.55 } ),
	Object.freeze( { name: 'Muddy', opacity: 0.14, absorption: [ 0.016, 0.025, 0.035 ], scatter: [ 0.38, 0.22, 0.09 ], emission: [ 0, 0, 0 ], caustic: 0.65, refraction: 0.45, ripple: 0.60, speed: 0.50 } ),
	Object.freeze( { name: 'Toxic', opacity: 0.22, absorption: [ 0.017, 0.0028, 0.024 ], scatter: [ 0.15, 0.8, 0.025 ], emission: [ 0.035, 0.20, 0.002 ], caustic: 2.6, refraction: 0.8, ripple: 0.80, speed: 0.70 } )
] );

/**
 * Which of `LIQUID_LOOKS` a liquid uses: the r_water_look choice (1 clear .. 4 toxic) when set, otherwise the
 * map's own look. Actual slime always retains its hazard identity.
 *
 * @param {number} kind 0 water, 1 slime
 * @param {number} [mapLook=0] the look authored by the texture (2 brown sediment for E1M3's water and E3's murky
 *   water, 1 for the owner's E1M2 appearance, else 0)
 * @returns {number} look index 0 Clear, 1 Tinted, 2 Muddy, 3 Toxic
 */
export function R_LiquidLookIndex( kind, mapLook = 0 ) {

	if ( kind === 1 ) return 3; // actual slime always retains its hazard identity
	const choice = Number.isFinite( r_water_look.value ) ? Math.round( r_water_look.value ) : 0;
	if ( choice === 0 ) return mapLook;
	return Math.max( 0, Math.min( 3, choice - 1 ) );

}

/**
 * The opacity of a liquid surface's material (gl_rsurf.js, as a water material is made) under the current look.
 *
 * @param {string} name texture name, e.g. '*04water1'
 * @param {number} fallback the native opacity, 0..1
 * @returns {number} the look's opacity (0.05..0.22) for see-through water or slime; `fallback` when r_newer_water
 *   is 0 or the texture is not see-through liquid (lava, teleporters, solid)
 */
export function R_LiquidOpacity( name, fallback ) {

	if ( r_newer_water.value === 0 ) return fallback;
	const kind = liquidKind( name );
	return kind < 0 ? fallback : LIQUID_LOOKS[ R_LiquidLookIndex( kind, liquidMapLook( name ) ) ].opacity;

}

// Stock E1M3's brown sediment water is authored by its texture identity.
// This affects optics only; contents, movement and damage remain map-owned.
/**
 * The optical look a level's own water texture asks for (`LIQUID_LOOKS`), for its pools' `mapLook`.
 *
 * @param {string} name the texture's name
 * @returns {number} 1 for E1M2's *04water1, 2 for other brown sediment/murky water, else 0
 */
export function liquidMapLook( name ) {
	const n = name.toLowerCase();
	// The owner's E1M2 reference uses the existing green-tinted clear look.
	// Its reused texture must not also change E1M3's muddy/swamp water.
	if ( liquidMapName === 'maps/e1m2.bsp' && n === '*04water1' ) return 1;
	return n === '*04water1' || MURKY_WATER.test( n ) ? 2 : 0; // brown sediment: E1M3's water and E3's murky water
}

// Generated constants keep the GPU's optical values identical to the material
// policy above. The profile id fits in the existing pool-bound uniform's w.
export const liquidLookGLSL = [ [ 'Absorption', 'absorption' ], [ 'Scatter', 'scatter' ], [ 'Emission', 'emission' ] ].map( ( [ fn, field ] ) =>
	`vec3 liquid${fn}( float look ) {
` + LIQUID_LOOKS.map( ( p, i ) => `if ( look < ${i + .5} ) return vec3( ${p[ field ].map( n => n.toFixed( 6 ) ).join( ', ' )} );` ).join( '\n' ) + '\nreturn vec3( 0.0 );\n}\n' ).join( '\n' ) +
	[ [ 'Caustic', 'caustic' ], [ 'Refraction', 'refraction' ], [ 'Ripple', 'ripple' ], [ 'Speed', 'speed' ] ].map( ( [ fn, field ] ) =>
		`float liquid${fn}( float look ) {
` + LIQUID_LOOKS.map( ( p, i ) => `if ( look < ${i + .5} ) return ${p[ field ].toFixed( 6 )};` ).join( '\n' ) + '\nreturn 0.0;\n}\n' ).join( '\n' );

// merge the many small faces of a pool into one box
function mergeLiquidFaces( faces ) {

	const parent = faces.map( ( f, i ) => i );
	const find = i => parent[ i ] === i ? i : ( parent[ i ] = find( parent[ i ] ) );

	for ( let i = 0; i < faces.length; i ++ ) {

		for ( let j = i + 1; j < faces.length; j ++ ) {

			const a = faces[ i ], b = faces[ j ];
			if ( a.kind !== b.kind || a.mapLook !== b.mapLook || Math.abs( a.z - b.z ) > 1.5 || Math.abs( ( a.bottom ?? a.z - 900 ) - ( b.bottom ?? b.z - 900 ) ) > 1.5 ) continue;
			if ( a.min[ 0 ] > b.max[ 0 ] + 24 || b.min[ 0 ] > a.max[ 0 ] + 24 ) continue;
			if ( a.min[ 1 ] > b.max[ 1 ] + 24 || b.min[ 1 ] > a.max[ 1 ] + 24 ) continue;
			parent[ find( i ) ] = find( j );

		}

	}

	const merged = new Map();
	for ( let i = 0; i < faces.length; i ++ ) {

		const r = find( i );
		const f = faces[ i ];
		const m = merged.get( r );
		if ( m === undefined ) {

			merged.set( r, { kind: f.kind, mapLook: f.mapLook || 0, min: f.min.slice(), max: f.max.slice(), z: f.z, bottom: f.bottom ?? f.z - 900, probePoints: f.probePoint ? [ f.probePoint ] : [] } );

		} else {

			if ( f.probePoint ) m.probePoints.push( f.probePoint );
			m.bottom = Math.min( m.bottom, f.bottom ?? f.z - 900 );
			for ( let a = 0; a < 2; a ++ ) {

				m.min[ a ] = Math.min( m.min[ a ], f.min[ a ] );
				m.max[ a ] = Math.max( m.max[ a ], f.max[ a ] );

			}

		}

	}

	return [ ...merged.values() ].filter( r => ( r.max[ 0 ] - r.min[ 0 ] ) * ( r.max[ 1 ] - r.min[ 1 ] ) > 64 * 64 );

}

/**
 * The level's lava pools, merged from its level lava faces at `R_BuildWorldLights` (the heat shimmers over them).
 *
 * @returns {Array<{ kind: 2, mapLook: number, min: Array<number>, max: Array<number>, z: number,
 *   probePoints: Array }>} the live module list, replaced at each map: xy bounds and surface height in Quake units
 */
export function R_GetLavaRegions() {

	return lavaRegions;

}

/**
 * The level's pools of water and slime, merged from their level faces at `R_BuildWorldLights` (used by the mist,
 * the reflection probes and the liquid passes). A ray that passes through one loses light to it, and surfaces
 * beneath it get caustics.
 *
 * @returns {Array<{ kind: number, mapLook: number, min: Array<number>, max: Array<number>, z: number,
 *   probePoints: Array<Array<number>> }>} the live module list, replaced at each map: kind 0 water / 1 slime,
 *   xy bounds and surface height in Quake units, and safe reflection-probe points above the surface
 */
export function R_GetLiquidRegions() {

	return liquidRegions;

}

/**
 * Forgets the last level's pools and links, as a level's lights are built (`R_BuildWorldLights`).
 * @param {string} [mapName=''] current BSP path; omitted/reset callers retain texture-only defaults
 */
export function R_PostLiquidsReset( mapName = '' ) {

	liquidMapName = mapName;
	liquidRegions = [];
	lavaRegions = [];
	liquidLinks = [];

}

/**
 * Adds one visibility link through a liquid face, for `R_GetLiquidLinks`.
 *
 * @param {{ above: object, below: object, aboveVis: Uint8Array, belowVis: Uint8Array }} link the leaves either side
 *   of the face and their PVS rows
 */
export function R_PostAddLiquidLink( link ) {

	liquidLinks.push( link );

}

/**
 * Sets the level's pools, pairing confirmed undersides with covered upper faces before merging.
 * A bottom bounds absorption, not the reach of light projected below a suspended sheet.
 *
 * @param {Array<object>} liquidFaces water/slime faces, including BSP-confirmed `underside` boundaries;
 *   unmatched tops retain the existing 900-unit depth fallback
 * @param {Array<object>} lavaFaces its lava faces
 */
export function R_PostSetLiquidRegions( liquidFaces, lavaFaces ) {

	const undersides = liquidFaces.filter( f => f.underside );
	const tops = liquidFaces.filter( f => ! f.underside ).map( f => {
		let bottom = f.bottom ?? f.z - 900;
		for ( const lower of undersides ) {
			if ( lower.kind !== f.kind || lower.mapLook !== f.mapLook || lower.z >= f.z || lower.z <= bottom ) continue;
			if ( lower.min[ 0 ] <= f.min[ 0 ] && lower.max[ 0 ] >= f.max[ 0 ] && lower.min[ 1 ] <= f.min[ 1 ] && lower.max[ 1 ] >= f.max[ 1 ] ) bottom = lower.z;
		}
		return { ...f, bottom };
	} );
	liquidRegions = mergeLiquidFaces( tops );
	lavaRegions = mergeLiquidFaces( lavaFaces );

}

/**
 * Before the frame is drawn: a pool that has just come into view gets its reflection probe. Passes the water and
 * slime pools within 2400 Quake units of the camera, nearest first, to `R_WaterProbeUpdate`. Does nothing when the
 * Newer water is off, r_reflect is 0 or the map has no pools. A cached intro probe must reflect final enabled art,
 * not an earlier native texture that is about to be replaced, so during start-up it waits for `ready`; normal play
 * is unchanged. Called by gl_rmain.js before the world draw.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene
 * @param {THREE.Camera} camera the view camera (its world matrix must be current)
 * @param {function} showAll the renderer's `R_WorldShowAll`, passed to the probe capture
 * @param {{ initializing?: boolean, ready?: boolean }} [options] `initializing` while the intro loading picture is
 *   held; `ready` once the start-up art has settled
 */
export function R_WaterProbesFrame( renderer, scene, camera, showAll, { initializing = false, ready = true } = {} ) {

	if ( ! R_WaterActive() || r_reflect.value <= 0 || liquidRegions.length === 0 ) return;
	// A cached intro probe must reflect final enabled art, not an earlier
	// native texture that is about to be replaced. Normal play is unchanged.
	if ( initializing && !ready ) return;

	const cw = camera.matrixWorld.elements;
	const near = [];
	for ( const r of liquidRegions ) {

		if ( r.kind !== 0 && r.kind !== 1 ) continue;
		const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
		const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
		// Match the compositor's submerged volume [bottom, surface],
		// not an air column above it, when choosing the nearest two probes.
		const dist = Math.hypot( dx, dy, Math.max( r.bottom - cw[ 14 ], 0, cw[ 14 ] - r.z ) );
		if ( dist < 2400 ) near.push( { r, dist } );

	}

	near.sort( ( a, b ) => a.dist - b.dist );
	R_WaterProbeUpdate( renderer, scene, camera, near.map( n => n.r ), showAll, liquidRegions, { initializing } );

}

/**
 * How many nearby pools' reflection probes are captured, for the start-up status that holds the first picture
 * until reflections are ready (gl_rmain.js).
 *
 * @param {THREE.Camera} camera the view camera (its world matrix must be current)
 * @returns {{ pending: number, ready: number }} from `R_WaterProbeReadiness` over the water/slime pools within
 *   2400 units, nearest first; both 0 when the Newer water is off or r_reflect is 0
 */
export function R_WaterStartupStatus(camera){
 if(!R_WaterActive()||r_reflect.value<=0)return {pending:0,ready:0};
 const p=camera.matrixWorld.elements,near=[];
 // Startup waits for the same submerged volumes that frame capture selects.
 for(const r of liquidRegions){if(r.kind!==0&&r.kind!==1)continue;const distance=Math.hypot(Math.max(r.min[0]-p[12],0,p[12]-r.max[0]),Math.max(r.min[1]-p[13],0,p[13]-r.max[1]),Math.max(r.bottom-p[14],0,p[14]-r.z));if(distance<2400)near.push({r,distance});}
 near.sort((a,b)=>a.distance-b.distance);return R_WaterProbeReadiness(camera,near.map(n=>n.r));
}

/**
 * This frame's liquid uniforms on the composite (from `R_PostComposite`): the water and slime pools nearest the camera
 * with their looks, the lava near it for the heat haze, the eye under water, reflection, and the pools' reflection
 * probes.
 *
 * @param {object} cm the composite material's uniforms
 * @param {THREE.Camera} camera the view camera
 */
export function R_PostLiquidUniforms( cm, camera, time = 0 ) {

	// the pools nearest the camera
	const cw = camera.matrixWorld.elements;
	const ranked = [];
	for ( const r of R_GetLiquidRegions() ) {

		const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
		const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
		const dz = Math.max( r.bottom - cw[ 14 ], 0, cw[ 14 ] - r.z );
		const dist = Math.hypot( dx, dy, dz );
		if ( dist < 3200 ) ranked.push( { r, dist } );

	}

	ranked.sort( ( a, b ) => a.dist - b.dist );
	const waterCount = r_newer_water.value !== 0 ? Math.min( ranked.length, MAX_LIQUID_REGIONS ) : 0;
	cm.uWaterCount.value = waterCount;
	cm.uTime.value = time;
	cm.uCaustic.value = r_newer_water.value !== 0 ? CAUSTIC * Math.max( 0, r_caustics.value ) : 0;
	cm.uWaterView.value = R_WaterActive() && postState.waterView ? 1 : 0;
	cm.uWaterWarp.value = r_waterwarp.value !== 0 ? 1 : 0;
	cm.uMist.value = Math.max( 0, r_mist.value );
	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		cm.uWaterMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, r.kind );
		cm.uProbeOf.value[ i ] = - 1;
		cm.uWaterMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.bottom, R_LiquidLookIndex( r.kind, r.mapLook ) );

	}

	// lava near the camera, for the heat haze
	let lavaCount = 0;
	if ( r_newer_water.value !== 0 && r_heathaze.value > 0 ) {

		const near = [];
		for ( const r of R_GetLavaRegions() ) {

			const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
			const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
			const dist = Math.hypot( dx, dy, Math.max( 0, cw[ 14 ] - r.z - 150 ) );
			if ( dist < 2400 ) near.push( { r, dist } );

		}

		near.sort( ( a, b ) => a.dist - b.dist );
		lavaCount = Math.min( near.length, 4 );
		for ( let i = 0; i < lavaCount; i ++ ) {

			const r = near[ i ].r;
			cm.uLavaMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, 0 );
			cm.uLavaMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.z, 0 );

		}

	}

	cm.uLavaCount.value = lavaCount;
	cm.uUnderwater.value = postState.underwater ? 1 : 0;
	cm.uHeat.value = postState.underwater ? 0 : Math.max( 0, r_heathaze.value );
	cm.uReflect.value = Math.max( 0, r_reflect.value ); // the per-pool interface selects top/underside optics

	// the pools' reflection probes (at most two are used at once)
	const probeList = R_WaterProbes();
	cm.tProbeA.value = probeList[ 0 ] != null ? probeList[ 0 ].rt.texture : null;
	cm.tProbeB.value = probeList[ 1 ] != null ? probeList[ 1 ].rt.texture : null;
	for ( let k = 0; k < 2; k ++ ) {

		const pb = probeList[ k ];
		if ( pb == null ) continue;
		cm.uProbeCenter.value[ k ].set( pb.center[ 0 ], pb.center[ 1 ], pb.center[ 2 ] );
		cm.uProbeMin.value[ k ].set( pb.min[ 0 ], pb.min[ 1 ], pb.min[ 2 ] );
		cm.uProbeMax.value[ k ].set( pb.max[ 0 ], pb.max[ 1 ], pb.max[ 2 ] );

	}

	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		const k = probeList.findIndex( ( pb ) => pb.region === r );
		cm.uProbeOf.value[ i ] = k;

	}

}
