/**
 * @module newer/render/gl_post
 *
 * The HDR pipeline: emissive surfaces, sun and light shafts, relighting, water and its looks, bloom, depth of field
 * and the final composite.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `worldLights`, `leafKeyCounter`, `occluder`, `selectedCount`,
 * `portraitLight`, `gpu`, `heightFrameSnapshot`, `splitLeft`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * Its G-buffer patch on `THREE.Material.prototype.onBeforeCompile` is installed by `R_PostInstallGBufferPatch`, from
 * `R_Init` and `R_PostBegin` (it ran as the module loaded until [44g], debt D10).
 */
import { R_ExitFixturePairs, R_LightCone, POINT_CONE_GLSL } from './r_fixturelights.js';
import { WATER as WAVE_WATER, SIZE as WAVE_SIZE, WAVE_GLSL, waterWave, R_WaveTexture, R_WaterWavesLive } from './r_waves.js';
import { R_ClearPowerupFireTarget } from './r_powerupfire.js';
import { R_ArchSurfaceHidden } from './r_archframe.js';
import { R_PowerupLights, R_PowerupPulse, R_DrawPowerupFire, R_PowerupShroudFrame, POWERUP_SHROUD_COMPOSITE_GLSL, POWERUP_COOKIE_GLSL } from './r_powerups.js';
// HDR lighting pipeline: emissive surfaces, sun and light shafts, relighting
// and bloom.
//
// The world is rendered into a half-float target (with a depth texture) instead
// of straight to the screen, so surfaces can be brighter than white.  Then:
//
//   1. Sun.  A shadow map of the world is rendered from the sky's direction
//      (sky is not a shadow caster, so skylights and windows let light in).
//      Every view ray is marched through it: the lit stretches of air become
//      the light shafts, and lit surfaces get direct sun on top of their
//      lightmaps.
//   2. Lights.  Map lights, emissive surfaces (lava, light panels) and dynamic
//      lights scatter through the air (analytic inverse-square along the view
//      ray) and relight nearby surfaces, occluded by screen-space ray marches
//      against the depth buffer.
//   3. Bloom: threshold + mip chain, so anything over-bright glows.
//   4. Composite: grade, exposure, and a filmic shoulder that rolls highlights
//      off instead of clipping.
//
// It is a rasterised approximation (no path tracing): bounced light and point-light
// occlusion only know about what is on screen. Costly composition follows the
// scene's dynamic resolution; only its inexpensive presentation fills the display.

import * as THREE from 'three';
import { cl } from '../../engine/client/client.js';
import { PowerVisionMode } from '../gameplay/powervision_state.js';
import { R_PowerVisionRender, R_PowerVisionReset } from './r_powervision.js';
import { VISION_UV_PACK_GLSL } from './vision_coordinates.js';
import { R_QuadVisionActive, R_QuadVisionRender, R_QuadVisionReset } from './r_quadvision.js';
import { R_IntroLoadingHolding } from '../ui/r_demoloading.js';
import { cvar_t } from '../../engine/common/cvar.js';
import { R_ParseEntityLump } from './gl_portal.js';
import { Mod_PointInLeaf, Mod_LeafPVS, solidskytexture, alphaskytexture } from '../../engine/render/gl_model.js';
import { R_NormalMapFor } from './gl_normals.js';
import {R_NormalPrepare,R_NormalPreparationNeeded} from '../assets/normal_prepare.js';
import { R_PatchRockShader, ROCK_PARALLAX_GLSL, ROCK_NORMAL_GLSL } from './r_rockshader.js';
import { rockUniforms } from './r_rockfield.js';
import { GL_SetForceLinear } from '../../engine/render/glquake.js';
import { R_AliasReceiverPass } from './r_newerskins.js';
import { R_ActiveWeaponSurface } from './r_weapon_surface.js';
import { R_ScreenDropsUpdate } from './r_screendrops.js';
import { R_TeleportFx } from './r_teleportfx.js';
import { R_RendVeilFields, R_RendVeilBackgroundDepth, R_RendVeilLights } from './r_rendveil.js';
import { R_RendVeilOptics, R_RendVeilOpticsShutdown } from './r_rendveil_optics.js';
import { R_PerfStage, R_PerfSetScale } from './r_perf.js';
import { R_DofFocus, R_DofCircle, R_DofFar } from './r_dof.js';
import { R_FlashlightBeam, FLASHLIGHT_OUTER, FLASHLIGHT_INNER } from './r_flashlight.js';
import { R_WaterProbeUpdate, R_WaterProbeFor, R_WaterProbes, R_WaterProbeReadiness, WATER_PROBE_LIFT } from './r_waterprobe.js';
import { R_AnimSetNewer, R_AnimSetLighting, R_NewerGame, r_newer_lighting, r_newer_normals, r_newer_water, r_newer_textures, r_newer_shadows } from '../mode.js';
import { R_DemonSurfaceData } from './r_demonrelief.js';
import { R_DemonBakePrepare, R_DemonBakeSurface } from '../assets/r_demonbakes.js';
import { PointShadowAtlas, R_CreateShadowCaptureMaterial, POINT_SHADOW_GLSL, POINT_SHADOW_SLOTS, SPOT_WORLD_SHADOW_GLSL, NEAR_SUN_SHADOW_GLSL } from './r_pointshadows.js';
import { r_heightshadows, heightShadowUniforms, R_HeightShadowFrame, R_HeightShadowScope, HEIGHT_SHADOW_GLSL, HEIGHT_MASK_DECODE_GLSL } from './r_heightshadows.js';
import { r_hdr, r_pointshadows, r_bloom, r_heathaze, r_mist, r_water_look, r_reflect, r_reflect_screen, r_pillars, r_cloudspeed, r_bounce, r_volumetric, r_newbright, r_newcontrast, r_caustics, r_newdark, r_newedges, r_dynres, r_fps_target, MAX_VOLUME_LIGHTS, SUN_SHADOW_LAYER, EMITTER_LIGHT_GAIN, SURF_DRAWSKY, SURF_DRAWTURB, EMISSIVE_BOOST, LAVA_BOOST, LAVA_PULSE, LIGHT_GAIN, SCATTER, LIGHT_FLOOR, LIGHT_SURFACE, SPOT_POWER, MAX_RAY, SUN_COLOR, PILLAR_MAX, PILLAR_DEFAULT, SHAFT_GAIN, SUN_SCATTER, SUN_SURFACE, SUN_SURFACE_COLOR, SATURATION, VIBRANCE, CONTRAST, HDR_EXPOSURE, OUTDOOR_EXPOSURE, OUTDOOR_BLOOM_THRESHOLD, OUTDOOR_BLOOM, CAUSTIC, BUMP_LIGHT, BLOOM_LEVELS, SUN_SHADOW_SIZE, SUN_SHADOW_EXTENT, SUN_SHADOW_DEPTH } from './r_post_config.js';
export { r_hdr, r_pointshadows, r_bloom, r_heathaze, r_mist, r_water_look, r_reflect, r_reflect_screen, r_pillars, r_cloudspeed, r_bounce, r_volumetric, r_newbright, r_newcontrast, r_caustics, r_newdark, r_newedges, r_dynres, r_fps_target, MAX_VOLUME_LIGHTS, SUN_SHADOW_LAYER, EMITTER_LIGHT_GAIN } from './r_post_config.js';
import { postState, lightCurve, classicLook, lightingLook, R_PostSetUnderwater, R_PostActive, R_WaterActive } from './r_post_state.js';
export { classicLook, R_PostSetUnderwater, R_PostActive, R_WaterActive } from './r_post_state.js';
import { MAX_LIQUID_REGIONS, R_GetLiquidLinks, R_IsWaterTextureName, LIQUID_LOOKS, R_LiquidLookIndex, R_LiquidOpacity, R_GetLavaRegions, R_GetLiquidRegions, R_WaterProbesFrame, R_WaterStartupStatus, liquidKind, liquidMapLook, liquidLookGLSL, R_PostLiquidsReset, R_PostAddLiquidLink, R_PostSetLiquidRegions } from './r_post_liquids.js';
export { MAX_LIQUID_REGIONS, R_GetLiquidLinks, R_IsWaterTextureName, LIQUID_LOOKS, R_LiquidLookIndex, R_LiquidOpacity, R_GetLavaRegions, R_GetLiquidRegions, R_WaterProbesFrame, R_WaterStartupStatus } from './r_post_liquids.js';
import { QUAD_VERTEX, VOLUME_FRAGMENT, BLOOM_PREFILTER_FRAGMENT, BLOOM_DOWN_FRAGMENT, BLOOM_UP_FRAGMENT, COMPOSITE_FRAGMENT, DOF_FRAGMENT, PRESENT_FRAGMENT } from './r_post_shaders.js';
import { R_RegisterGlow, R_GlowBoostForTexture, R_PostInstallGBufferPatch, R_RegisterDetail, R_RefreshDetail, pulseLava, setGlowActive, setDetailActive } from './r_post_gbuffer.js';
export { R_RegisterGlow, R_GlowBoostForTexture, R_PostInstallGBufferPatch, R_RegisterDetail, R_RefreshDetail } from './r_post_gbuffer.js';
import { skyState, sunFromAngles, buildSkyCookie, cookieNorm, cookieMean, cookieDepth, R_AnalyseSky, R_SkyBrightness, R_GetSkyInfo, R_PostNoteSky, R_MapHasSky } from './r_post_sky.js';
export { R_AnalyseSky, R_SkyBrightness, R_GetSkyInfo, R_PostNoteSky, R_MapHasSky } from './r_post_sky.js';

const DYNRES_MIN = 0.5;
const dyn = { scale: 1, last: 0, sum: 0, frames: 0, cool: 0, probing: false, probeEvery: 240, since: 0 };

/**
 * The current dynamic-resolution scale: the fraction of the full width and height the HDR targets are drawn at
 * (r_dynres), updated once a frame in `R_PostBegin` from the average frame time against r_fps_target. gl_rmain.js
 * multiplies the view size by it for screen-space effects.
 *
 * @returns {number} 0.5..1 (rounded to hundredths); 1 when r_dynres is 0
 */
export function R_DynResScale() {

	return dyn.scale;

}

// once a frame while the pipeline draws: the average frame time of the last stretch
// decides the resolution of the next
function dynResUpdate( now ) {

	if ( r_dynres.value === 0 ) {

		dyn.scale = 1;
		R_PerfSetScale( 1 );
		dyn.last = now;
		return;

	}

	let dt = now - dyn.last;
	dyn.last = now;
	if ( dt <= 0 || dt > 2 ) { dyn.sum = 0; dyn.frames = 0; return; } // a level load or a pause, not a slow picture
	dt = Math.min( dt, 0.25 ); // (one long frame does not count for more than that)

	dyn.sum += dt;
	dyn.frames ++;
	dyn.since ++;
	if ( dyn.frames < 24 && dyn.sum < 1.2 ) return;

	const avg = dyn.sum / dyn.frames;
	dyn.sum = 0;
	dyn.frames = 0;

	const budget = 1 / Math.max( 20, r_fps_target.value );
	const before = dyn.scale;

	if ( avg > budget * 1.12 ) {

		// too slow: smaller, in proportion to how slow (frame cost follows the pixel count)
		if ( dyn.probing ) { dyn.probeEvery = Math.min( 1800, dyn.probeEvery * 2 ); dyn.probing = false; }
		dyn.scale = Math.max( DYNRES_MIN, dyn.scale * Math.max( 0.8, Math.min( 0.95, Math.sqrt( budget / avg ) ) ) );
		dyn.since = 0;

	} else if ( dyn.scale < 1 && dyn.since >= dyn.probeEvery ) {

		// it fits: see whether one step bigger fits too
		dyn.scale = Math.min( 1, dyn.scale * 1.08 );
		dyn.probing = true;
		dyn.since = 0;

	} else if ( dyn.probing ) {

		dyn.probing = false; // the bigger picture held: keep it

	}

	dyn.scale = Math.round( dyn.scale * 100 ) / 100;
	R_PerfSetScale( dyn.scale );
	if ( dyn.scale !== before ) dyn.frames = 0;

}

// Unlit material colour is retained separately from baked lighting. A surface
// without a light source need not be lifted merely to recover its colour later.


//============================================================================
// Light database
//============================================================================

let worldLights = [];

let leafKeyCounter = 0;

function parseVector( s, fallback ) {

	if ( s == null ) return fallback;
	const parts = String( s ).trim().split( /\s+/ ).map( parseFloat );
	if ( parts.length < 3 || parts.some( Number.isNaN ) ) return fallback;
	return parts;

}

function entityLightColor( ent ) {

	const c = parseVector( ent._color, null );
	if ( c != null ) {

		const scale = Math.max( c[ 0 ], c[ 1 ], c[ 2 ] ) > 1.0 ? 1 / 255 : 1;
		return [ c[ 0 ] * scale, c[ 1 ] * scale, c[ 2 ] * scale ];

	}

	const cls = ent.classname;
	if ( cls.indexOf( 'torch' ) >= 0 || cls.indexOf( 'flame' ) >= 0 ) return [ 1.0, 0.55, 0.22 ];
	if ( cls.indexOf( 'fluoro' ) >= 0 ) return [ 0.75, 0.88, 1.0 ];
	return [ 1.0, 0.82, 0.6 ];

}

function polyInfo( surf ) {

	let area = 0, cx = 0, cy = 0, cz = 0, n = 0;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		const f = v instanceof Float32Array
			? ( i, k ) => v[ i * 7 + k ]
			: ( i, k ) => v[ i ][ k ];

		for ( let i = 0; i < p.numverts; i ++ ) {

			cx += f( i, 0 ); cy += f( i, 1 ); cz += f( i, 2 );
			n ++;

		}

		for ( let i = 2; i < p.numverts; i ++ ) {

			const ax = f( i - 1, 0 ) - f( 0, 0 ), ay = f( i - 1, 1 ) - f( 0, 1 ), az = f( i - 1, 2 ) - f( 0, 2 );
			const bx = f( i, 0 ) - f( 0, 0 ), by = f( i, 1 ) - f( 0, 1 ), bz = f( i, 2 ) - f( 0, 2 );
			const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
			area += 0.5 * Math.sqrt( x * x + y * y + z * z );

		}

	}

	if ( n === 0 ) return null;
	return { area, center: [ cx / n, cy / n, cz / n ] };

}

function polyBounds( surf ) {

	const b = [ 1e9, 1e9, 1e9, - 1e9, - 1e9, - 1e9 ];
	let any = false;

	for ( let p = surf.polys; p; p = p.next ) {

		const v = p.verts;
		for ( let i = 0; i < p.numverts; i ++ ) {

			for ( let k = 0; k < 3; k ++ ) {

				const x = v instanceof Float32Array ? v[ i * 7 + k ] : v[ i ][ k ];
				if ( x < b[ k ] ) b[ k ] = x;
				if ( x > b[ k + 3 ] ) b[ k + 3 ] = x;

			}

			any = true;

		}

	}

	return any ? b : null;

}

// average colour and coverage of a texture's fullbright texels
function fullbrightEmission( texture ) {

	if ( texture._emission !== undefined ) return texture._emission;

	let result = null;
	const data = texture._fullbright != null && texture._fullbright.image != null
		? texture._fullbright.image.data
		: null;

	if ( data != null ) {

		let r = 0, g = 0, b = 0, n = 0;
		const pixels = data.length / 4;
		for ( let i = 0; i < pixels; i ++ ) {

			if ( data[ i * 4 + 3 ] === 0 ) continue;
			r += Math.pow( data[ i * 4 ] / 255, 2.2 );
			g += Math.pow( data[ i * 4 + 1 ] / 255, 2.2 );
			b += Math.pow( data[ i * 4 + 2 ] / 255, 2.2 );
			n ++;

		}

		if ( n > 0 )
			result = { color: [ r / n, g / n, b / n ], coverage: n / pixels };

	}

	texture._emission = result;
	return result;

}

function surfaceEmission( surf ) {

	const tex = surf.texinfo.texture;
	const name = tex.name.toLowerCase();

	if ( name.indexOf( '*lava' ) === 0 ) return { color: [ 1.0, 0.36, 0.1 ], coverage: 2.4 };
	if ( name.indexOf( '*slime' ) === 0 ) return { color: [ 0.25, 0.95, 0.2 ], coverage: 0.6 };
	if ( name.indexOf( '*teleport' ) === 0 ) return { color: [ 0.55, 0.65, 1.0 ], coverage: 0.15 };
	if ( name.charAt( 0 ) === '*' || tex.gl_texture == null ) return null;

	return fullbrightEmission( tex.gl_texture );

}

const SURFACE_CELL = 192;
const MAX_SURFACE_LIGHTS = 500;

/**
 * Builds the level's light database once per map (gl_rsurf.js `GL_BuildLightmaps`): the map's light entities
 * (power = light / 300, colour from `_color` or the class), exit-fixture lights, and up to 500 clustered emissive
 * surface lights (lava, light panels, glowing buttons), strongest first; also the water, slime and lava regions,
 * the liquid visibility links, whether the map has sky, the sky analysis and cookie, and the sun direction
 * (worldspawn `_sun_mangle` "yaw pitch" overrides the default). Replaces everything from the previous map.
 *
 * @param {?object} model the world brush model (`cl.worldmodel`); null clears the database
 * @returns {Array<object>} the new world light list (also kept for `R_GetWorldLights`): each `{ pos, color, power,
 *   radius, style, leaf, emitter, ... }` with `pos` in Quake units
 */
export function R_BuildWorldLights( model ) {

	worldLights = [];
	skyState.hasSky = false;
	R_PostLiquidsReset();
	buildSkyCookie();
	skyState.sunDirection = [ - 0.28, - 0.18, 0.94 ];

	if ( model == null || model.nodes == null ) return worldLights;

	const entities = model.entities != null ? R_ParseEntityLump( model.entities ) : [];
	// light entities
	if ( model.entities != null ) {


		const world = entities.find( e => e.classname === 'worldspawn' );
		if ( world != null && world._sun_mangle != null ) {

			const a = parseVector( world._sun_mangle, null );
			if ( a != null ) skyState.sunDirection = sunFromAngles( a[ 0 ], a[ 1 ] );

		}

		for ( const ent of entities ) {

			if ( ent.classname == null || ent.classname.indexOf( 'light' ) !== 0 || ent.origin == null ) continue;

			const pos = parseVector( ent.origin, null );
			if ( pos == null ) continue;

			const value = ent.light !== undefined ? parseFloat( ent.light ) : 300;
			if ( ! ( value > 0 ) ) continue;

			worldLights.push( {
				pos,
				classname: ent.classname,
				emitter: FIRE_LIGHT.test( ent.classname ) ? 1 : 0,
				color: entityLightColor( ent ),
				power: value / 300,
				radius: 28,
				style: parseInt( ent.style, 10 ) || 0,
				// torches and fires burn unevenly: their light flickers (a light with a style of its own follows that)
				flicker: FIRE_LIGHT.test( ent.classname ) && ( parseInt( ent.style, 10 ) || 0 ) === 0 ? 1 : 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

	}

	const fixturePairs=R_ExitFixturePairs(model,entities,worldLights,{info:polyInfo,bounds:polyBounds,leaf:Mod_PointInLeaf});
 const fixtureFaces=new Set(fixturePairs.map(pair=>pair.face));
 for(const pair of fixturePairs){
  const light=pair.helper;
  light.fixture={face:pair.face,authoredPosition:light.pos.slice(),panelCenter:pair.center};
  light.pos=pair.position;light.direction=pair.direction;light.cone=pair.cone;
  light.priority=4; // source membership only; retain authored radiance/style
  light.radius=96; // calibrated spread/falloff, not an authored BSP cone
  light.leaf=Mod_PointInLeaf(light.pos,model);
 }

	// emissive surfaces (lava, light panels, glowing buttons...)
	if ( model.surfaces != null ) {

		const first = model.firstmodelsurface || 0;
		const last = first + ( model.nummodelsurfaces || model.surfaces.length );
		const clusters = new Map();
		const liquidFaces = [];
		const lavaFaces = [];
		const linkSeen = new Set();
		const visCache = new Map();

		for ( let i = first; i < last; i ++ ) {

			const surf = model.surfaces[ i ];
			if ( surf == null || surf.texinfo == null || surf.texinfo.texture == null ) continue;
			if ( surf.flags & SURF_DRAWSKY ) { skyState.hasSky = true; continue; }

			// lava: the pools the heat shimmers over
			const lname = surf.texinfo.texture.name.toLowerCase();
			if ( lname.charAt( 0 ) === '*' && lname.indexOf( 'lava' ) >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const linfo = polyInfo( surf );
				const lbox = polyBounds( surf );
				if ( linfo != null && lbox != null ) lavaFaces.push( { kind: 2, min: [ lbox[ 0 ], lbox[ 1 ] ], max: [ lbox[ 3 ], lbox[ 4 ] ], z: linfo.center[ 2 ] } );

			}

			const liquid = liquidKind( surf.texinfo.texture.name );
			if ( liquid >= 0 && Math.abs( surf.plane.normal[ 2 ] ) > 0.95 ) {

				const info = polyInfo( surf );
				const box = polyBounds( surf );
				if ( info != null && box != null ) {

					const probePoint = [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + WATER_PROBE_LIFT ];
					const validProbe = Mod_PointInLeaf( probePoint, model ).contents === - 1;
					liquidFaces.push( { kind: liquid, mapLook: liquidMapLook( surf.texinfo.texture.name ), min: [ box[ 0 ], box[ 1 ] ], max: [ box[ 3 ], box[ 4 ] ], z: info.center[ 2 ], probePoint: validProbe ? probePoint : null } );

					// the air above this face and the liquid just below it
					const above = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] + 4 ], model );
					const below = Mod_PointInLeaf( [ info.center[ 0 ], info.center[ 1 ], info.center[ 2 ] - 4 ], model );
					if ( above !== below && below.contents !== - 2 ) {

						const key = above.__portalKey ?? ( above.__portalKey = ++ leafKeyCounter );
						const key2 = below.__portalKey ?? ( below.__portalKey = ++ leafKeyCounter );
						if ( ! linkSeen.has( key * 1e6 + key2 ) ) {

							linkSeen.add( key * 1e6 + key2 );
							if ( ! visCache.has( key2 ) )
								visCache.set( key2, Mod_LeafPVS( below, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							if ( ! visCache.has( - key ) )
								visCache.set( - key, Mod_LeafPVS( above, model ).slice( 0, ( model.numleafs + 7 ) >> 3 ) );
							R_PostAddLiquidLink( { above, below, belowVis: visCache.get( key2 ), aboveVis: visCache.get( - key ) } );

						}

					}

				}

				continue;

			}

			if(fixtureFaces.has(i))continue; // matched physical source already owns its added light
			const emission = surfaceEmission( surf );
			if ( emission == null ) continue;

			// Large turbulent faces already contain subdivided polygons. Cluster
			// lava from those actual patches, not one distant pool-centre light.
			const lava = lname.indexOf( '*lava' ) === 0;
			const patches = [];
			if ( lava ) {
				for ( let p = surf.polys; p; p = p.next ) patches.push( polyInfo( { polys: { numverts: p.numverts, verts: p.verts, next: null } } ) );
			} else patches.push( polyInfo( surf ) );
			for ( const info of patches ) {
				if ( info == null || info.area < 64 ) continue;

				const key = surf.texinfo.texture.name + '|' +
					Math.floor( info.center[ 0 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 1 ] / SURFACE_CELL ) + ',' +
					Math.floor( info.center[ 2 ] / SURFACE_CELL ) +
					// Opposite lava faces must not average their source into the pool.
					( lava ? '|' + Array.from( surf.plane.normal ).map( v => v * ( surf.flags & 2 ? -1 : 1 ) ).join( ',' ) : '' );

				let c = clusters.get( key );
				if ( c === undefined ) {

					c = { emission, texture: surf.texinfo.texture.name, area: 0, sum: [ 0, 0, 0 ], normal: [ 0, 0, 0 ] };
					clusters.set( key, c );

				}

				const sign = ( surf.flags & 2 ) ? - 1 : 1; // SURF_PLANEBACK
				c.area += info.area;
				for ( let a = 0; a < 3; a ++ ) {

					c.sum[ a ] += info.center[ a ] * info.area;
					c.normal[ a ] += surf.plane.normal[ a ] * sign * info.area;

				}
			}

		}

		R_PostSetLiquidRegions( liquidFaces, lavaFaces );

		const surfaceLights = [];
		for ( const c of clusters.values() ) {

			const len = Math.hypot( c.normal[ 0 ], c.normal[ 1 ], c.normal[ 2 ] ) || 1;
			const pos = [
				c.sum[ 0 ] / c.area + c.normal[ 0 ] / len * 10,
				c.sum[ 1 ] / c.area + c.normal[ 1 ] / len * 10,
				c.sum[ 2 ] / c.area + c.normal[ 2 ] / len * 10
			];

			surfaceLights.push( {
				pos,
				emitter: 1,
				texture: c.texture, // source provenance; entity/dynamic lamps have no surface texture
				color: c.emission.color,
				power: Math.min( 1.1, c.area * c.emission.coverage / ( 64 * 64 ) * 0.5 ),
				radius: Math.max( 24, Math.min( 110, Math.sqrt( c.area ) * 0.5 ) ),
				style: 0,
				leaf: Mod_PointInLeaf( pos, model )
			} );

		}

		surfaceLights.sort( ( a, b ) => b.power - a.power );
		for ( let i = 0; i < surfaceLights.length && i < MAX_SURFACE_LIGHTS; i ++ )
			worldLights.push( surfaceLights[ i ] );

	}

	rockUniforms.qrRockSun.value.set( ...skyState.sunDirection ).normalize();
	return worldLights;

}

//============================================================================
// Sun occluder
//
// The sun's shadow map must contain the whole map, not just what happens to be
// visible or loaded this frame: a ceiling that is not being drawn would let the
// sun through into a closed room.  So the shadow casters are their own static
// mesh, built once per map from every solid world surface (no sky, no liquids),
// and only ever seen by the shadow camera.
//============================================================================

let occluder = null;

function disposeOccluder() {

	if ( occluder === null ) return;
	if ( occluder.parent != null ) occluder.parent.remove( occluder );
	gpu?.pointShadows?.setGeometry( null );
	occluder.geometry.dispose();
	occluder = null;

}

/**
 * Builds the sun occluder for a map: one static mesh, on `SUN_SHADOW_LAYER` only, of every solid world surface
 * (no sky, no liquids, no hidden arch surfaces in Newer), with the retained wall relief in Newer Game when
 * normals and textures are on. Disposes the previous occluder first and gives the geometry to the point-shadow
 * atlas. Called by gl_rsurf.js `R_BuildWorldOccluder` and when demon relief bakes arrive (r_demonbakes.js).
 * Kept until the next build.
 *
 * @param {?object} model the world brush model
 * @returns {number} the number of triangles in the occluder; 0 when there is no model or nothing to cast
 */
export function R_BuildSunOccluder( model ) {
	const bake=model&&R_NewerGame()&&r_newer_normals.value!==0&&r_newer_textures.value!==0?R_DemonBakePrepare(model,model.surfaces||[]):null;

	disposeOccluder();
	if ( model == null || model.surfaces == null ) return 0;

	const first = model.firstmodelsurface || 0;
	const last = first + ( model.nummodelsurfaces || model.surfaces.length );
	let positions = [];const chunks=[];

	for ( let i = first; i < last; i ++ ) {

		const surf = model.surfaces[ i ];
		if ( surf == null || surf.polys == null ) continue;
		if ( R_NewerGame() && R_ArchSurfaceHidden( surf ) ) continue;
		if ( surf.flags & ( SURF_DRAWSKY | SURF_DRAWTURB ) ) continue;

		for ( let p = surf.polys; p; p = p.next ) {

			const v = p.verts;
			const at = ( n, k ) => v instanceof Float32Array ? v[ n * 7 + k ] : v[ n ][ k ];

			for ( let n = 2; n < p.numverts; n ++ ) {

				for ( const idx of [ 0, n - 1, n ] )
					positions.push( at( idx, 0 ), at( idx, 1 ), at( idx, 2 ) );

			}

		}
		// The retained wall backing plus its actual raised relief forms the
		// same occluder seen by the enhanced scene. Classic keeps native geometry.
		if ( R_NewerGame() && r_newer_normals.value !== 0 && r_newer_textures.value !== 0 ) {

			const prepared=R_DemonBakeSurface(surf);
			const relief = bake?.status==='loading'||bake?.status==='error'?null:prepared.status==='ready'?prepared.data:prepared.status==='unprepared'?R_DemonSurfaceData(surf):null;
			if(relief){if(positions.length){chunks.push({positions:new Float32Array(positions)});positions=[];}chunks.push(relief.interleaved?{interleaved:relief.interleaved,indices:relief.indices}:{positions:relief.positions});}

		}

	}

	if(positions.length)chunks.push({positions:new Float32Array(positions)});
 const indexed=chunks.some(c=>c.interleaved);
 const vertices=chunks.reduce((sum,c)=>sum+(c.interleaved?c.interleaved.length/10:c.positions.length/3),0);
 const corners=chunks.reduce((sum,c)=>sum+(c.indices?c.indices.length:c.positions.length/3),0);if(!corners)return 0;
 const combined=new Float32Array(vertices*3),order=indexed?new Uint32Array(corners):null;let base=0,corner=0;
 for(const c of chunks){
  const count=c.interleaved?c.interleaved.length/10:c.positions.length/3;
  if(c.interleaved){for(let i=0;i<count;i++){combined[(base+i)*3]=c.interleaved[i*10];combined[(base+i)*3+1]=c.interleaved[i*10+1];combined[(base+i)*3+2]=c.interleaved[i*10+2];}}
  else combined.set(c.positions,base*3);
  if(order){if(c.indices)for(const index of c.indices)order[corner++]=base+index;else for(let i=0;i<count;i++)order[corner++]=base+i;}
  base+=count;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(combined,3));
 if(order)geometry.setIndex(new THREE.BufferAttribute(order,1));geometry.computeBoundingSphere();

	occluder = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { side: THREE.DoubleSide } ) );
	occluder.name = 'quake_sun_occluder';
	if ( occluder.layers !== undefined ) occluder.layers.set( SUN_SHADOW_LAYER ); // invisible to every ordinary camera
	occluder.matrixAutoUpdate = false;
	gpu?.pointShadows?.setGeometry( geometry );

	return corners / 3;
}

/**
 * The light database built by `R_BuildWorldLights` (gl_rmain.js `R_ShadowLights` picks monsters' floor-shadow
 * lights from it).
 *
 * @returns {Array<object>} the live module list, replaced at each map (do not mutate)
 */
export function R_GetWorldLights() {

	return worldLights;

}

//============================================================================
// Per-frame light selection
//============================================================================

const _selected = [];
for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ )
	_selected.push( { pos: [ 0, 0, 0 ], worldPos: [ 0, 0, 0 ], source: null, color: [ 0, 0, 0 ], radius: 30, range: 300, score: 0 } );
let selectedCount = 0;

const DLIGHT_COLOR = [ 1.0, 0.62, 0.28 ];
const MUZZLE_COLOR = [ 1.0, 0.78, 0.45 ]; // a muzzle flash is whiter and much stronger than an ember
const MUZZLE_POWER = 3;

function consider( px, py, pz, color, power, radius, view, add = 0, source = null, rankPower = power ) {

	// view space
	const vx = view[ 0 ] * px + view[ 4 ] * py + view[ 8 ] * pz + view[ 12 ];
	const vy = view[ 1 ] * px + view[ 5 ] * py + view[ 9 ] * pz + view[ 13 ];
	const vz = view[ 2 ] * px + view[ 6 ] * py + view[ 10 ] * pz + view[ 14 ];

	const dist2 = vx * vx + vy * vy + vz * vz;
	// Receiver lighting must not change when the camera turns at one location.
	// Visible flames receive priority over invisible baked-light helper entities.
	const score = rankPower / ( dist2 + 6000 ) * ( source?.bestiary ? 16 : source?.priority || ( source?.emitter === 1 ? 4 : 1 ) );

	let slot = null;
	if ( selectedCount < MAX_VOLUME_LIGHTS ) {

		slot = _selected[ selectedCount ++ ];

	} else {

		let worst = 0;
		for ( let i = 1; i < selectedCount; i ++ )
			if ( _selected[ i ].score < _selected[ worst ].score ) worst = i;
		if ( _selected[ worst ].score >= score ) return;
		slot = _selected[ worst ];

	}

	slot.score = score;
	slot.source = source; slot.worldPos[ 0 ] = px; slot.worldPos[ 1 ] = py; slot.worldPos[ 2 ] = pz;
 const shape=R_LightCone(source?.direction,source?.cone);
 slot.direction=shape?.direction || [0,0,0];slot.cone=shape?.cone || [1,1];
 slot.viewDirection=shape?[
 view[0]*shape.direction[0]+view[4]*shape.direction[1]+view[8]*shape.direction[2],
 view[1]*shape.direction[0]+view[5]*shape.direction[1]+view[9]*shape.direction[2],
 view[2]*shape.direction[0]+view[6]*shape.direction[1]+view[10]*shape.direction[2]]:[0,0,0];
	slot.add = add;
	slot.pos[ 0 ] = vx; slot.pos[ 1 ] = vy; slot.pos[ 2 ] = vz;
	slot.radius = radius;
	// Pickup pulses change radiance, not receiver reach or shadow residency.
	slot.range = source?.rendVeil ? source.range : 130 + 170 * Math.sqrt( source?.powerup || source?.bestiary ? rankPower : power );
	slot.color[ 0 ] = color[ 0 ] * power * LIGHT_GAIN;
	slot.color[ 1 ] = color[ 1 ] * power * LIGHT_GAIN;
	slot.color[ 2 ] = color[ 2 ] * power * LIGHT_GAIN;

}

const FIRE_LIGHT = /torch|flame|fire|brazier/i;

/**
 * How bright a fire is at a moment: a slow swell and quick flutters, a little different for every fire (phased by
 * its position) so a row of torches does not pulse together. Used for the flickering map lights here, for the
 * fire models' light (gl_rmain.js) and for the torch fire (r_torchfire.js).
 *
 * @param {number} x fire position x, Quake units
 * @param {number} y fire position y, Quake units
 * @param {number} z fire position z, Quake units
 * @param {number} time client time, seconds
 * @returns {number} brightness multiplier, 0.55..1.25
 */
export function R_FireFlicker( x, y, z, time ) {

	const ph = ( x * 0.013 + y * 0.017 + z * 0.011 ) % 6.2832;
	const a = Math.sin( time * 2.3 + ph ) * 0.5 + Math.sin( time * 5.1 + ph * 2.1 ) * 0.3;
	const b = Math.sin( time * 13.7 + ph * 3.3 ) * Math.sin( time * 8.9 + ph * 1.7 );
	return Math.min( 1.25, Math.max( 0.55, 0.9 + a * 0.15 + b * 0.18 ) );

}

// The Bestiary's portrait light while a first-sighting page is up ({ pos, color, power, radius, fade }, or null), given
// each frame by the renderer (gl_rmain.js) rather than imported, so post-processing does not depend on the interface
// (card [44g], debt D1c)
let portraitLight = null;
/**
 * Sets the Bestiary's portrait light for the next light selection; called each frame by gl_rmain.js before
 * `R_PostLightsFrame`. Kept until replaced.
 *
 * @param {?{ pos: Array<number>, color: Array<number>, power: number, radius: number, fade: number }} light the
 *   portrait light (world space, fade 0..1), or null/undefined when no first-sighting page is up
 */
export function R_PostSetPortraitLight( light ) {

	portraitLight = light ?? null;

}

function selectLights( viewMatrix, visframe, styles, dlights, time ) {

	selectedCount = 0;
	const view = viewMatrix.elements;

	for ( let i = 0; i < worldLights.length; i ++ ) {

		const l = worldLights[ i ];
		const leaf = l.leaf;
		// in the PVS (or embedded in a wall, where the leaf is solid)
		if ( leaf != null && leaf.contents !== - 2 && leaf.visframe !== visframe ) continue;

		let power = l.power;
		if ( l.style !== 0 && styles != null && styles[ l.style ] !== undefined )
			power *= styles[ l.style ] / 264;

		const rankPower = power; // flicker changes radiance, not slot membership
		if ( l.emitter === 1 ) power *= EMITTER_LIGHT_GAIN;
		if ( l.flicker === 1 ) power *= R_FireFlicker( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], time );

		if ( power <= 0.001 ) continue;
		consider( l.pos[ 0 ], l.pos[ 1 ], l.pos[ 2 ], l.color, power, l.radius, view, 0, l, rankPower );

	}

	// Live pickup sources enter the SAME selection/snapshot/shadow slots as
	// map lights. Only radiance pulses; ranking and cube range stay stable.
	for ( const l of R_PowerupLights() ) {
		const pulse = l.powerup === 'quad' ? R_PowerupPulse( time ) : 1;
		consider( ...l.pos, l.color, l.power * pulse, l.radius, view, .65, l, l.power );
	}
	for(const l of R_RendVeilLights())consider(...l.origin,l.color,l.power,l.radius,view,0,l,l.power);
	const portrait=portraitLight;
	if(portrait&&portrait.fade>0)consider(...portrait.pos,portrait.color,portrait.power*portrait.fade,portrait.radius,view,0,portrait,portrait.power);

	if ( dlights != null ) {

		for ( let i = 0; i < dlights.length; i ++ ) {

			const d = dlights[ i ];
			if ( d == null || d.radius <= 0 || d.die < time ) continue;

			// (the game gives a muzzle flash a minimum light of 32)
			const muzzle = d.minlight === 32;
			// an ordinary light fades over its last 0.3 s; a flash is only 0.1 s long and full strength until it is gone
			const fade = Math.min( 1, ( d.die - time ) / ( muzzle ? 0.1 : 0.3 ) );
			consider( d.origin[ 0 ], d.origin[ 1 ], d.origin[ 2 ], muzzle ? MUZZLE_COLOR : DLIGHT_COLOR,
				d.radius / 300 * 1.4 * fade * ( muzzle ? MUZZLE_POWER * ( d.flashScale === undefined ? 1 : d.flashScale ) : 1 ), 40, view, 1, d, d.radius / 300 * 1.4 * (muzzle?MUZZLE_POWER:1) );

		}

	}

}

/**
 * Read-only diagnostic/public-test endpoint; normal rendering uses the same selection without allocating snapshots
 * every frame. Runs the per-frame light selection: map lights in the PVS (scaled by their light style, emitter
 * gain and flicker), power-up lights, Rend the Veil lights, the Bestiary portrait light and live dynamic lights,
 * keeping the `MAX_VOLUME_LIGHTS` best by power over distance. Overwrites the shared selection used by rendering.
 *
 * @param {THREE.Matrix4} viewMatrix world-to-view matrix (`camera.matrixWorldInverse`)
 * @param {number} visframe the current visibility frame (`r_visframecount`); a light's leaf must carry it
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`, 264 = normal)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @returns {Array<{ source: ?object, position: Array<number>, color: Array<number>, range: number, score: number,
 *   direction: Array<number>, cone: Array<number> }>} fresh copies: world position (Quake units), HDR colour
 *   (colour x power x light gain), receiver range in Quake units and the ranking score
 */
export function R_SelectWorldLights( viewMatrix, visframe, styles, dlights, time ) {
 selectLights( viewMatrix, visframe, styles, dlights, time );
 return _selected.slice( 0, selectedCount ).map( light => ( { source: light.source, position: light.worldPos.slice(), color: light.color.slice(), range: light.range, score: light.score, direction:light.direction.slice(), cone:light.cone.slice() } ) );
}
/**
 * Direct access to the point-shadow atlas, for GPU trials (not used by the engine).
 *
 * @returns {?PointShadowAtlas} the pipeline's live atlas, or null before the pipeline exists
 */
export function R_PointShadowAtlas() { return gpu?.pointShadows || null; }
/**
 * Point-shadow residency for the start-up status (gl_rmain.js).
 *
 * @returns {object} the atlas's `status()` (counts of ready, pending and resident slots, chunks, captures...), or
 *   `{ ready: 0, pending: 0, resident: 0, chunks: 0 }` before the pipeline exists
 */
export function R_PointShadowStatus() { return gpu?.pointShadows?.status() || { ready: 0, pending: 0, resident: 0, chunks: 0 }; }
/**
 * Makes the point-shadow atlas drop its borrowed clone of a dynamic caster (r_axecorpses.js, as a mesh is disposed),
 * so no reference to its geometry is kept. Does nothing before the pipeline exists.
 *
 * @param {THREE.Mesh} mesh the mesh previously drawn as a dynamic caster
 */
export function R_ReleaseShadowCaster( mesh ) { gpu?.pointShadows?.forgetDynamic( mesh ); }

//============================================================================
// Pipeline
//============================================================================

let gpu = null;

function makeRT( width, height, options ) {

	return new THREE.WebGLRenderTarget( Math.max( 1, width ), Math.max( 1, height ), Object.assign( {
		type: THREE.HalfFloatType,
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		generateMipmaps: false,
		depthBuffer: false
	}, options ) );

}

function makeMaterial( fragment, uniforms ) {

	const material = new THREE.ShaderMaterial( {
		uniforms,
		vertexShader: QUAD_VERTEX,
		fragmentShader: fragment,
		depthTest: false,
		depthWrite: false
	} );
	// Fullscreen passes own their outputs. The world-material prototype hook
	// must not attach a second G-buffer declaration to the optical UV output.
	material.onBeforeCompile=()=>{};
	return material;

}

function createPipeline() {

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( [ - 1, - 1, 0, 3, - 1, 0, - 1, 3, 0 ] ), 3 ) );
	geometry.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( [ 0, 0, 2, 0, 0, 2 ] ), 2 ) );

	const mesh = new THREE.Mesh( geometry );
	mesh.frustumCulled = false;
	const scene = new THREE.Scene();
	scene.add( mesh );

	const lightPos = [], lightCol = [];
	for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {

		lightPos.push( new THREE.Vector4() );
		lightCol.push( new THREE.Vector4() );

	}

	// uniforms shared by the volumetric and composite passes
	const shared = {
		tDepth: { value: null },
		tSunShadow: { value: null },
		uProj: { value: new THREE.Matrix4() },
		uProjInv: { value: new THREE.Matrix4() },
		uViewInv: { value: new THREE.Matrix4() },
		uSunVP: { value: new THREE.Matrix4() },
		uNear: { value: 4 }, uFar: { value: 4096 },
		uCount: { value: 0 },
		uSpotOn: { value: 0 },
		uBounce: { value: 1 },
		uSpotPos: { value: new THREE.Vector3() },
		uSpotDir: { value: new THREE.Vector3( 0, 0, - 1 ) },
		uSpotCol: { value: new THREE.Vector3( 1, 0.985, 0.96 ).multiplyScalar( SPOT_POWER ) },
		uSpotCone: { value: new THREE.Vector2( FLASHLIGHT_OUTER, FLASHLIGHT_INNER ) },
		tHeightShadow: { value: null },
		uHeightMasks: { value: 0 },
		tNearSunShadow: { value: null }, uNearSunShadowVP: { value: new THREE.Matrix4() }, uNearSunShadowOn: { value: 0 },
  tSpotShadow: { value: null },
		uSpotShadowVP: { value: new THREE.Matrix4() },
		uSpotShadowLightWorld: { value: new THREE.Vector4() },
		uSpotWorldShadowOn: { value: 0 },
		tPointShadow: { value: null },
		uPointShadowInfo: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector2( -1, 0 ) ) },
		uLightPos: { value: lightPos },
		uLightCol: { value: lightCol },
		uLightCookie: { value: new Float32Array( MAX_VOLUME_LIGHTS ) },
		uLightDirection: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector3()) },
  uLightCone: { value: Array.from({length:MAX_VOLUME_LIGHTS},()=>new THREE.Vector2(1,1)) },
		uLightRotation: { value: Array.from( { length: MAX_VOLUME_LIGHTS }, () => new THREE.Vector4( 0, 0, 0, 1 ) ) },
		uPowerupTime: { value: 0 },
		uSunDirV: { value: new THREE.Vector3() },
		uSunDirW: { value: new THREE.Vector3() },
		tCookie: { value: null },
		tCookieCloud: { value: null },
		uCookieCloud: { value: 0 },
		uCookieMean: { value: cookieMean },
		uCookieNorm: { value: cookieNorm },
		uCookieDepth: cookieDepth,
		uCookie: { value: 0 },
		uCookieTime: { value: 0 },
		uSunCol: { value: new THREE.Vector3( ...SUN_COLOR ) },
		uSunOn: { value: 0 },
		uShadowTexel: { value: 0.5 / SUN_SHADOW_SIZE },
		uMaxRay: { value: MAX_RAY }
	};

	const sunCamera = new THREE.OrthographicCamera( - SUN_SHADOW_EXTENT, SUN_SHADOW_EXTENT,
		SUN_SHADOW_EXTENT, - SUN_SHADOW_EXTENT, 1, SUN_SHADOW_DEPTH * 2 );

	return {
		width: 0, height: 0,
		pointShadows: new PointShadowAtlas( occluder?.geometry ),
		scene, mesh, shared,
		camera: new THREE.OrthographicCamera( - 1, 1, 1, - 1, 0, 1 ),
		hdr: null, volume: null, composite: null, down: [], up: [],
		sunCamera,
		sunTarget: new THREE.WebGLRenderTarget( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE, {
			depthBuffer: true,
			depthTexture: new THREE.DepthTexture( SUN_SHADOW_SIZE, SUN_SHADOW_SIZE ),
			generateMipmaps: false,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter
		} ),
		sunOverride: R_CreateShadowCaptureMaterial( 'void main(){gl_FragColor=vec4(1.);}', {}, { colorWrite: false } ),
		volumeMaterial: makeMaterial( VOLUME_FRAGMENT, Object.assign( {
			uSunScatter: { value: SUN_SCATTER },
			uOpenFog: { value: 0 },
			uShaftFog: { value: 1.3 },
			uShadowSpread: { value: 100 / ( SUN_SHADOW_EXTENT * 2 ) },
			uScatter: { value: SCATTER }
		}, shared ) ),
		prefilterMaterial: makeMaterial( BLOOM_PREFILTER_FRAGMENT, {
			tScene: { value: null }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 }, uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uThreshold: { value: 1 }
		} ),
		downMaterial: makeMaterial( BLOOM_DOWN_FRAGMENT, {
			tSource: { value: null }, uTexel: { value: new THREE.Vector2() }
		} ),
		upMaterial: makeMaterial( BLOOM_UP_FRAGMENT, {
			tLow: { value: null }, tHigh: { value: null },
			uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 }
		} ),
		compositeMaterial: makeMaterial( COMPOSITE_FRAGMENT, Object.assign( {
			tPowerupShrouds: { value: null }, uPowerupShroudCount: { value: 0 }, tPowerupFire: { value: null }, uPowerupFireOn: { value: 0 },
			tScene: { value: null }, tNormal: { value: null }, tAlbedo: { value: null }, tVolume: { value: null }, tBloom: { value: null },
			uTexel: { value: new THREE.Vector2() },
			uExposure: { value: 1 }, uBloom: { value: 0.6 }, uVolume: { value: 1 },
			uSunSurface: { value: SUN_SURFACE },
			uSunSurfaceCol: { value: new THREE.Vector3( ...SUN_SURFACE_COLOR ) },
			uLightSurface: { value: LIGHT_SURFACE },
			uLightFloor: { value: LIGHT_FLOOR },
			uLightAdd: { value: new Array( MAX_VOLUME_LIGHTS ).fill( 0 ) },
			uEdge: { value: 1 },
			uDropDensity: { value: 0 },
			uDropBlood: { value: 0 },
			uActorWet: { value: 0 }, uBumpLight: { value: BUMP_LIGHT },
			uLighting: lightingLook,
			uOffscreen: { value: 0 },
			uTeleStretch: { value: 0 },
			uTeleChroma: { value: 0 },
			uDropAge: { value: 0 },
			uSaturation: { value: SATURATION },
			uVibrance: { value: VIBRANCE },
			uContrast: { value: CONTRAST },
			uBright: { value: 0.6 },
			uContrastGain: { value: 1.4 },
			uContrastPivot: { value: 0.12 },
			uTime: { value: 0 },
			uCaustic: { value: CAUSTIC }, uUnderwater: { value: 0 },
			tProbeA: { value: null },
			tProbeB: { value: null },
			uProbeCenter: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMin: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeMax: { value: [ new THREE.Vector3(), new THREE.Vector3() ] },
			uProbeOf: { value: new Array( MAX_LIQUID_REGIONS ).fill( - 1 ) },
			uScreenReflect: { value: 1 },
			uLavaCount: { value: 0 },
			uLavaMin: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uLavaMax: { value: Array.from( { length: 4 }, () => new THREE.Vector4() ) },
			uHeat: { value: 0.6 },
			uReflect: { value: 0.6 },
			uWaterCount: { value: 0 },
			uMist: { value: 0 },
			uWaterMin: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) },
			uWaterMax: { value: Array.from( { length: MAX_LIQUID_REGIONS }, () => new THREE.Vector4() ) }
		}, shared ) ),
		presentMaterial: makeMaterial( PRESENT_FRAGMENT, {
			tComposite: { value: null }, uBright: { value: 1 },
			uWaves: { value: 0 }, tDepth: shared.tDepth, tNormal: { value: null }, uProj: shared.uProj, uProjInv: shared.uProjInv, uViewInv: shared.uViewInv,
			uWaterWave: { value: waterWave }, tWaves: { value: R_WaveTexture() },
			uContrastGain: { value: 1 }, uContrastPivot: { value: 0.2 }
		} ),
		dofMaterial: makeMaterial( DOF_FRAGMENT, {
			tComposite: { value: null }, tDepth: shared.tDepth, tNormal: { value: null }, uProjInv: shared.uProjInv,
			uDof: { value: new THREE.Vector3() }, uDofTexel: { value: new THREE.Vector2() }, uDofFar: { value: 4096 }
		} ),
		dof: null
	};

}

function disposeTargets() {

	if ( gpu.hdr === null ) return;
	gpu.hdr.dispose();
	gpu.hdr.depthTexture.dispose();
	gpu.volume.dispose();
	if ( gpu.composite !== null ) gpu.composite.dispose();
	gpu.composite = null;
	if ( gpu.dof !== null ) gpu.dof.dispose();
	gpu.dof = null;
	for ( const rt of gpu.down ) rt.dispose();
	for ( const rt of gpu.up ) rt.dispose();
	gpu.hdr = null;
	gpu.down = [];
	gpu.up = [];

}

// Multisampling is a large part of the cost of a picture: it is given up in steps as the
// picture gets smaller (the smaller picture is scaled up smoothly anyway)
function samplesFor( scale ) {

	return scale >= 0.85 ? 4 : scale >= 0.65 ? 2 : 0;

}

function ensureTargets( width, height ) {

	const heightMasks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0;
	// Packed visibility is data: MSAA averaging would mix unrelated source bits.
	// Receiver classes and true view depth are data even with micro relief off.
 // Multisample resolution would average a model packet with background.
 const samples = 0;
	const count = postState.glowActive || PowerVisionMode(cl, R_NewerGame()) ? 4 : 2; // vision also consumes unlit pigment
	if ( gpu.hdr !== null && gpu.width === width && gpu.height === height && gpu.samples === samples && gpu.hdr.textures.length === count ) return;

	disposeTargets();
	gpu.width = width;
	gpu.height = height;
	gpu.samples = samples;

	const depth = new THREE.DepthTexture( width, height );
	gpu.hdr = makeRT( width, height, { depthBuffer: true, depthTexture: depth, samples, count } );
 // A normal packet's alpha is view distance. Linear interpolation across
 // different receivers creates a second, invalid apparent lighting surface.
 gpu.hdr.textures[1].minFilter=gpu.hdr.textures[1].magFilter=THREE.NearestFilter;
	// SRGB8 storage preserves dark authored texels at half the bandwidth of HDR.
	// The attachment encodes linear shader output and texture reads decode it;
	// alpha marks valid surfaces. No extra geometry pass or baked-light floor.
	if ( count >= 3 ) {

		gpu.hdr.textures[ 2 ].type = THREE.UnsignedByteType;
		gpu.hdr.textures[ 2 ].colorSpace = THREE.SRGBColorSpace;
		gpu.hdr.textures[ 2 ].minFilter = THREE.NearestFilter;
		gpu.hdr.textures[ 2 ].magFilter = THREE.NearestFilter;

	}
 if ( heightMasks ) {
  const mask = gpu.hdr.textures[ 3 ];
  mask.type = THREE.UnsignedByteType; mask.format = THREE.RGBAFormat;
  mask.colorSpace = THREE.NoColorSpace; mask.internalFormat = 'RGBA8';
  mask.minFilter = mask.magFilter = THREE.NearestFilter; mask.generateMipmaps = false;
  mask.name = 'quake_height_light_visibility';
 }
	gpu.volume = makeRT( Math.ceil( width * 0.75 ), Math.ceil( height * 0.75 ) );

	let w = Math.ceil( width / 2 ), h = Math.ceil( height / 2 );
	for ( let i = 0; i < BLOOM_LEVELS; i ++ ) {

		gpu.down.push( makeRT( w, h ) );
		if ( i < BLOOM_LEVELS - 1 ) gpu.up.push( makeRT( w, h ) );
		w = Math.max( 1, Math.ceil( w / 2 ) );
		h = Math.max( 1, Math.ceil( h / 2 ) );

	}

}

function runPass( renderer, material, target ) {

	gpu.mesh.material = material;
	renderer.setRenderTarget( target );
	renderer.render( gpu.scene, gpu.camera );

}

/**
 * True when the HDR pipeline can run on this renderer: WebGL2 with float or half-float colour buffers. Checked by
 * `R_PostBegin` every frame.
 *
 * @param {?THREE.WebGLRenderer} renderer the renderer
 * @returns {boolean} whether HDR render targets can be used
 */
export function R_PostSupported( renderer ) {

	if ( renderer == null || renderer.capabilities == null || renderer.capabilities.isWebGL2 === false ) return false;
	return renderer.extensions.has( 'EXT_color_buffer_float' ) || renderer.extensions.has( 'EXT_color_buffer_half_float' );

}

let heightFrameSnapshot = null;
/**
 * Prepares this frame's lighting before the world is drawn (gl_rmain.js, after `R_PostBind`; again from
 * `R_PostFinish` when a caller skipped it): selects the lights, snapshots them and the flashlight beam, updates the
 * point, sun and spot shadow maps for the visible casters, fills the shared shadow uniforms and the height-shadow
 * frame. The snapshot is what `R_PostFinish` draws with when its camera, time and visframe match.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene (traversed for shadow casters)
 * @param {THREE.Camera} camera the view camera; its world matrix is updated
 * @param {number} visframe the current visibility frame (`r_visframecount`)
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @param {boolean} hasSkyView whether the map has sky (`R_MapHasSky`); enables the near sun shadow
 * @returns {?{ camera: THREE.Camera, visframe: number, time: number, lights: Array<object>, beam: object,
 *   hasSkyView: boolean }} the frame snapshot (copied lights and beam), or null when the pipeline does not exist
 */
export function R_PostLightsFrame( renderer, scene, camera, visframe, styles, dlights, time, hasSkyView ) {
 if ( ! gpu ) { heightFrameSnapshot = null; R_HeightShadowScope( false ); return null; }
 camera.updateMatrixWorld( true );
 if ( postState.glowActive ) selectLights( camera.matrixWorldInverse, visframe, styles, dlights, time );
 else selectedCount = 0;
 const lights = _selected.slice( 0, selectedCount ).map( light => ( { ...light, pos: light.pos.slice(), worldPos: light.worldPos.slice(), color: light.color.slice(), direction:light.direction.slice(), viewDirection:light.viewDirection.slice(), cone:light.cone.slice(), powerupRotation: light.source?.rotation?.slice() || [ 0, 0, 0, 1 ] } ) );
 const liveBeam = R_FlashlightBeam();
 const beam = { ...liveBeam, pos: liveBeam.pos.slice(), dir: liveBeam.dir.slice() };
 heightFrameSnapshot = { camera, visframe, time, lights, beam, hasSkyView };
 const sh = gpu.shared, shadowSources = [];
 for ( const light of lights ) if ( light.source ) shadowSources.push( { source: light.source, position: light.worldPos,
  far: light.source.pos?130+170*Math.sqrt(light.source.power*(light.source.emitter===1?EMITTER_LIGHT_GAIN:1)*2.25):light.range*1.5, live: !light.source.pos||light.source.bestiary===true } );
 shadowSources.sort((a,b)=>Number(b.live)-Number(a.live));
 const spotCasters=[];
 if(postState.glowActive&&r_pointshadows.value!==0){
  scene.updateMatrixWorld(true);
  scene.traverse(object=>{
   if(!object.isMesh||!object.visible)return;
   const aliasOwner=object._quakeOwner,brushOwner=object.parent?._quakeOwner;
   const physicalAlias=aliasOwner?._aliasMesh===object&&!/flame|bolt|eyes/.test(aliasOwner.model?.name||'');
   const physicalBrush=brushOwner?._brushGroup===object.parent;
   object.userData.quakePhysicalAlias=physicalAlias;
   if((physicalAlias||object.userData.quakeAxePart===true)&&r_newer_shadows.value!==0||physicalBrush)spotCasters.push(object);
  });
  gpu.pointShadows.update(renderer,shadowSources,spotCasters,{frozenPose:R_IntroLoadingHolding()});
 }
 gpu.pointShadows.updateSun(renderer,{on:postState.glowActive&&hasSkyView&&r_pointshadows.value!==0,direction:skyState.sunDirection,focus:camera.position.toArray()},spotCasters);
 sh.tNearSunShadow.value=gpu.pointShadows.sunTexture;sh.uNearSunShadowVP.value.copy(gpu.pointShadows.sunVP);sh.uNearSunShadowOn.value=gpu.pointShadows.sunReady?1:0;
 sh.tPointShadow.value = gpu.pointShadows.target.texture;
 for ( let i = 0; i < MAX_VOLUME_LIGHTS; i ++ ) {
  const source = lights[ i ]?.source;
  const shadow = postState.glowActive && r_pointshadows.value !== 0 && source ? gpu.pointShadows.lookup( source ) : null;
  sh.uPointShadowInfo.value[ i ].set( shadow?.ready ? shadow.slot : -1, shadow?.far || 0 );
 }
 if(postState.glowActive && beam.on && r_pointshadows.value!==0) {
  gpu.pointShadows.updateSpot(renderer,{...beam,range:1500,outerCos:FLASHLIGHT_OUTER},spotCasters);
 } else gpu.pointShadows.clearSpot();
 sh.tSpotShadow.value=gpu.pointShadows.spotTexture;
 sh.uSpotShadowVP.value.copy(gpu.pointShadows.spotVP);
 sh.uSpotShadowLightWorld.value.set(...beam.pos,1500);
 sh.uSpotWorldShadowOn.value=postState.glowActive && beam.on && r_pointshadows.value!==0 && gpu.pointShadows.spotReady?1:0;
 const masks = postState.glowActive && postState.detailActive && r_heightshadows.value !== 0 && gpu.hdr?.textures.length === 4;
 sh.tHeightShadow.value = masks ? gpu.hdr.textures[ 3 ] : null; sh.uHeightMasks.value = masks ? 1 : 0;
 R_HeightShadowFrame( {
  points: lights.map( light => ( { position: light.worldPos, range: light.range, color: light.color, direction:light.direction, cone:light.cone } ) ),
  sun: { direction: skyState.sunDirection, on: postState.glowActive && hasSkyView, color: SUN_SURFACE_COLOR },
  spot: { position: beam.pos, range: 1500, direction: beam.dir, cone: [ FLASHLIGHT_INNER, FLASHLIGHT_OUTER ], on: postState.glowActive && beam.on,
   color: [ SPOT_POWER, SPOT_POWER * .985, SPOT_POWER * .96 ] }
 } );
 R_HeightShadowScope( masks );
 return heightFrameSnapshot;
}

/*
================
R_PostBegin

Called at the start of a frame.  Returns true when the frame is to be rendered
through the HDR pipeline; the caller then draws the world into the target that
R_PostBind selects.
================
*/
/**
 * Called every frame by gl_rmain.js `R_RenderView` (with `enabled` false in XR, during environment-map captures or
 * without a renderer, so its state is reset). Installs the G-buffer patch, sets the glow, detail, linear-texture
 * and animation modes for the frame, creates the pipeline on first use and sizes its targets to the
 * dynamic-resolution scale (even dimensions, at least 16).
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {boolean} enabled whether the Newer renderer may run this frame
 * @param {number} width view width, device pixels
 * @param {number} height view height, device pixels; both must exceed 8
 * @returns {boolean} true when r_hdr is on, a Newer option needs the shared targets and the renderer supports
 *   them; false otherwise (power and quad vision are then reset)
 */
export function R_PostBegin( renderer, enabled, width, height ) {
	R_PostInstallGBufferPatch();
	heightFrameSnapshot = null; R_HeightShadowScope( false );

	// The shared targets serve three independent visual options. Turning lighting
	// off keeps relief and liquid compositing available without relighting the world.
	const newer = enabled && r_hdr.value !== 0;
	const wanted = r_newer_lighting.value !== 0 || r_newer_normals.value !== 0 || r_newer_water.value !== 0 || PowerVisionMode(cl,newer) !== 0 || R_QuadVisionActive();
	const active = newer && wanted && R_PostSupported( renderer ) && width > 8 && height > 8;
	postState.postActive = active;
	const lighting = active && r_newer_lighting.value !== 0;
	setGlowActive( lighting );
	setDetailActive( active && r_newer_normals.value !== 0 );
	GL_SetForceLinear( active );
	R_AnimSetNewer( newer );
	R_AnimSetLighting( lighting );
	lightingLook.value = lighting ? 1 : 0;
	lightCurve.value = lighting ? Math.max( 1, r_newdark.value ) : 1;
	if ( lighting ) pulseLava( performance.now() / 1000 );
	skyState.seen = false;

	if ( active === false ) { R_PowerVisionReset(); R_QuadVisionReset(); return false; }

	if ( gpu === null ) gpu = createPipeline();
	dynResUpdate( performance.now() / 1000 );
	ensureTargets( Math.max( 16, Math.round( width * dyn.scale / 2 ) * 2 ), Math.max( 16, Math.round( height * dyn.scale / 2 ) * 2 ) );
	return true;

}

/**
 * Binds the HDR multi-target (colour, normal, albedo and height-mask attachments, with depth) as the render
 * target for the world draw. Only valid after `R_PostBegin` returned true.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 */
export function R_PostBind( renderer ) {

	renderer.setRenderTarget( gpu.hdr );

}

const _sunRight = new THREE.Vector3();
const _sunUp = new THREE.Vector3();
const _sunCenter = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _clearColor = new THREE.Color();

// Depth of the world as the sun sees it.  Sky is not on the shadow layer, so
// skylights and windows let the light through.
function renderSunShadow( renderer, scene, camera ) {

	const p = gpu;
	const cam = p.sunCamera;

	_sunDir.set( skyState.sunDirection[ 0 ], skyState.sunDirection[ 1 ], skyState.sunDirection[ 2 ] ).normalize();

	const e = camera.matrixWorld.elements;
	_sunCenter.set( e[ 12 ], e[ 13 ], e[ 14 ] );

	cam.up.set( 0, 0, 1 );
	if ( Math.abs( _sunDir.z ) > 0.95 ) cam.up.set( 1, 0, 0 );

	// snap the centre to whole shadow texels so the shadows don't crawl
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	const m = cam.matrixWorld.elements;
	_sunRight.set( m[ 0 ], m[ 1 ], m[ 2 ] );
	_sunUp.set( m[ 4 ], m[ 5 ], m[ 6 ] );
	const texel = ( SUN_SHADOW_EXTENT * 2 ) / SUN_SHADOW_SIZE;
	const cr = _sunCenter.dot( _sunRight ), cu = _sunCenter.dot( _sunUp );
	_sunCenter.addScaledVector( _sunRight, - ( cr - Math.round( cr / texel ) * texel ) );
	_sunCenter.addScaledVector( _sunUp, - ( cu - Math.round( cu / texel ) * texel ) );
	cam.position.copy( _sunCenter ).addScaledVector( _sunDir, SUN_SHADOW_DEPTH );
	cam.lookAt( _sunCenter );
	cam.updateMatrixWorld( true );
	cam.matrixWorldInverse.copy( cam.matrixWorld ).invert();

	cam.layers.set( SUN_SHADOW_LAYER );
	if ( occluder !== null && occluder.parent !== scene ) scene.add( occluder );

	renderer.getClearColor( _clearColor );
	const clearAlpha = renderer.getClearAlpha();
	const override = scene.overrideMaterial;

	scene.overrideMaterial = p.sunOverride;
	renderer.setRenderTarget( p.sunTarget );
	renderer.setClearColor( 0xffffff, 1 );
	renderer.clear( true, true, false );
	renderer.render( scene, cam );

	scene.overrideMaterial = override;
	renderer.setClearColor( _clearColor, clearAlpha );

	p.shared.uSunVP.value.multiplyMatrices( cam.projectionMatrix, cam.matrixWorldInverse );
	p.shared.tSunShadow.value = p.sunTarget.depthTexture;

}

/*
================
R_PostFinish

Turn the HDR image into the frame that is shown: sun shadows, volumetrics,
direct lighting, bloom, grade and tone map.  viewport is the on-screen
rectangle in logical pixels ( lx, ly, lw, lh ).
================
*/
/**
 * Called by gl_rmain.js after the world has been drawn into the HDR target (and only when `R_PostBegin` returned
 * true); ends by drawing the frame to the screen, into the left half only while `R_PostSetSplit` is on.
 *
 * @param {THREE.WebGLRenderer} renderer the renderer
 * @param {THREE.Scene} scene the world scene
 * @param {THREE.Camera} camera the view camera
 * @param {{ lx: number, ly: number, lw: number, lh: number }} viewport the on-screen rectangle, logical pixels
 * @param {number} visframe the current visibility frame (`r_visframecount`)
 * @param {?ArrayLike<number>} styles light style values (`d_lightstylevalue`)
 * @param {?Array<object>} dlights client dynamic lights (`cl_dlights`)
 * @param {number} time client time, seconds
 * @param {number} exposure the renderer's tone-mapping exposure (multiplied by the HDR exposure while lit)
 * @param {boolean} hasSkyView whether the map has sky (`R_MapHasSky`): outdoor exposure and softer bloom
 */
export function R_PostFinish( renderer, scene, camera, viewport, visframe, styles, dlights, time, exposure, hasSkyView ) {

	const p = gpu;
	const hdr = p.hdr;
	const sh = p.shared;

	const lighting = postState.glowActive;
 const hadSnapshot = heightFrameSnapshot?.camera === camera && heightFrameSnapshot.time === time && heightFrameSnapshot.visframe === visframe;
 if ( ! hadSnapshot ) {
  R_PostLightsFrame( renderer, scene, camera, visframe, styles, dlights, time, hasSkyView );
  // Legacy public callers did not draw with this snapshot, so ignore mask data.
  p.shared.uHeightMasks.value = 0; R_HeightShadowScope( false );
 }
 const frame = heightFrameSnapshot;
 selectedCount = frame?.lights.length || 0;
 R_AliasReceiverPass(renderer,scene,camera,hdr);
 const fireFrame=R_DrawPowerupFire( renderer, scene, camera, hdr );
 R_PerfStage( 'power-up fire' );


	sh.tDepth.value = hdr.depthTexture;
	sh.uProj.value.copy( camera.projectionMatrix );
	sh.uProjInv.value.copy( camera.projectionMatrixInverse );
	sh.uViewInv.value.copy( camera.matrixWorld );
	sh.uNear.value = camera.near;
	sh.uFar.value = camera.far;
	sh.uCount.value = selectedCount;
	sh.uPowerupTime.value = time;

	// the flashlight, in view space
	const beam = frame?.beam || R_FlashlightBeam();
	sh.uSpotOn.value = lighting && beam.on ? 1 : 0;
	if ( beam.on ) {

		const v = camera.matrixWorldInverse.elements;
		const bp = beam.pos, bd = beam.dir;
		sh.uSpotPos.value.set(
			v[ 0 ] * bp[ 0 ] + v[ 4 ] * bp[ 1 ] + v[ 8 ] * bp[ 2 ] + v[ 12 ],
			v[ 1 ] * bp[ 0 ] + v[ 5 ] * bp[ 1 ] + v[ 9 ] * bp[ 2 ] + v[ 13 ],
			v[ 2 ] * bp[ 0 ] + v[ 6 ] * bp[ 1 ] + v[ 10 ] * bp[ 2 ] + v[ 14 ] );
		sh.uSpotDir.value.set(
			v[ 0 ] * bd[ 0 ] + v[ 4 ] * bd[ 1 ] + v[ 8 ] * bd[ 2 ],
			v[ 1 ] * bd[ 0 ] + v[ 5 ] * bd[ 1 ] + v[ 9 ] * bd[ 2 ],
			v[ 2 ] * bd[ 0 ] + v[ 6 ] * bd[ 1 ] + v[ 10 ] * bd[ 2 ] ).normalize();

	}
	for ( let i = 0; i < selectedCount; i ++ ) {

		const s = frame.lights[ i ];
		sh.uLightPos.value[ i ].set( s.pos[ 0 ], s.pos[ 1 ], s.pos[ 2 ], s.radius );
		sh.uLightCol.value[ i ].set( s.color[ 0 ], s.color[ 1 ], s.color[ 2 ], s.range );
		p.compositeMaterial.uniforms.uLightAdd.value[ i ] = s.add || 0;
		sh.uLightCookie.value[ i ] = s.source?.cookie || 0;
		sh.uLightRotation.value[ i ].fromArray( s.powerupRotation );
  sh.uLightDirection.value[i].fromArray(s.viewDirection);
  sh.uLightCone.value[i].fromArray(s.cone);

	}

	// the sun, when the map has sky to light it; how strong, what colour and what
	// pattern all come from the map's sky
	const sunOn = lighting && hasSkyView === true;
	sh.uSunOn.value = sunOn ? 1 : 0;

	const bright = R_SkyBrightness( skyState.info.luma );
	const sunGain = 0.5 + 0.9 * bright; // a dark sky still gives a little
	const tint = skyState.info.color;
	sh.uSunCol.value.set(
		SUN_COLOR[ 0 ] * sunGain * ( 0.55 + 0.45 * tint[ 0 ] ),
		SUN_COLOR[ 1 ] * sunGain * ( 0.55 + 0.45 * tint[ 1 ] ),
		SUN_COLOR[ 2 ] * sunGain * ( 0.55 + 0.45 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurfaceCol.value.set(
		SUN_SURFACE_COLOR[ 0 ] * ( 0.6 + 0.4 * tint[ 0 ] ),
		SUN_SURFACE_COLOR[ 1 ] * ( 0.6 + 0.4 * tint[ 1 ] ),
		SUN_SURFACE_COLOR[ 2 ] * ( 0.6 + 0.4 * tint[ 2 ] ) );
	p.compositeMaterial.uniforms.uSunSurface.value = SUN_SURFACE * ( 0.5 + 0.8 * bright );
	// Hold the original nominal sun density. One common compositing gain below
	// makes sun, point lights and the flashlight respond to the same slider once.
	p.volumeMaterial.uniforms.uSunScatter.value = SUN_SCATTER * PILLAR_MAX * PILLAR_DEFAULT * ( 1.4 + 1.0 * bright );
	// a bright, clear sky leaves open air nearly free of haze; a dark one hazier
	p.volumeMaterial.uniforms.uOpenFog.value = 0; // no broad atmospheric veil
	// a bright, clear sky is crisp; a dark one a little hazier
	sh.uBounce.value = lighting ? Math.max( 0, r_bounce.value ) : 0;
	sh.tCookie.value = skyState.cookie;
	sh.tCookieCloud.value = skyState.cookieCloud;
	sh.uCookieCloud.value = skyState.cookieCloud !== null ? 1 : 0;
	sh.uCookie.value = skyState.cookie !== null ? 1 : 0;
	sh.uCookieTime.value = time * Math.max( 0, r_cloudspeed.value );
	if ( sunOn ) {

		const e = camera.matrixWorldInverse.elements;
		const sd = skyState.sunDirection;
		sh.uSunDirV.value.set(
			e[ 0 ] * sd[ 0 ] + e[ 4 ] * sd[ 1 ] + e[ 8 ] * sd[ 2 ],
			e[ 1 ] * sd[ 0 ] + e[ 5 ] * sd[ 1 ] + e[ 9 ] * sd[ 2 ],
			e[ 2 ] * sd[ 0 ] + e[ 6 ] * sd[ 1 ] + e[ 10 ] * sd[ 2 ] ).normalize();
		sh.uSunDirW.value.set( sd[ 0 ], sd[ 1 ], sd[ 2 ] ).normalize();
		renderSunShadow( renderer, scene, camera );
		R_PerfStage( 'sun shadow' );

	}

	// volumetric pass
	const volume = lighting ? Math.max( 0, r_volumetric.value ) * SHAFT_GAIN * Math.max( 0, r_pillars.value ) / PILLAR_DEFAULT : 0;
	if ( volume > 0 ) runPass( renderer, p.volumeMaterial, p.volume );
	R_PerfStage( 'light shafts' );

	// bloom
	const bloom = lighting ? Math.max( 0, r_bloom.value ) : 0;
	if ( bloom > 0 ) {

		const pm = p.prefilterMaterial.uniforms;
		pm.tScene.value = hdr.texture;
		pm.tPowerupFire.value=fireFrame?.texture||null;pm.uPowerupFireOn.value=fireFrame?.count?1:0;
		pm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
		pm.uExposure.value = exposure;
		pm.uThreshold.value = hasSkyView === true ? OUTDOOR_BLOOM_THRESHOLD : 1.1;
		runPass( renderer, p.prefilterMaterial, p.down[ 0 ] );

		const dm = p.downMaterial.uniforms;
		for ( let i = 1; i < BLOOM_LEVELS; i ++ ) {

			dm.tSource.value = p.down[ i - 1 ].texture;
			dm.uTexel.value.set( 1 / p.down[ i - 1 ].width, 1 / p.down[ i - 1 ].height );
			runPass( renderer, p.downMaterial, p.down[ i ] );

		}

		const um = p.upMaterial.uniforms;
		let low = p.down[ BLOOM_LEVELS - 1 ];
		for ( let i = BLOOM_LEVELS - 2; i >= 0; i -- ) {

			um.tLow.value = low.texture;
			um.tHigh.value = p.down[ i ].texture;
			um.uTexel.value.set( 1 / low.width, 1 / low.height );
			um.uWeight.value = 0.55;
			runPass( renderer, p.upMaterial, p.up[ i ] );
			low = p.up[ i ];

		}

		p.bloomResult = low;

	}

	// composite to the screen
	const cm = p.compositeMaterial.uniforms;
	cm.tPowerupFire.value=fireFrame?.texture||null;cm.uPowerupFireOn.value=fireFrame?.count?1:0;
	const shrouds = R_PowerupShroudFrame( scene, camera );
	cm.tPowerupShrouds.value = shrouds.texture; cm.uPowerupShroudCount.value = shrouds.count;


	// the pools nearest the camera
	const cw = camera.matrixWorld.elements;
	const ranked = [];
	for ( const r of R_GetLiquidRegions() ) {

		const dx = Math.max( r.min[ 0 ] - cw[ 12 ], 0, cw[ 12 ] - r.max[ 0 ] );
		const dy = Math.max( r.min[ 1 ] - cw[ 13 ], 0, cw[ 13 ] - r.max[ 1 ] );
		const dz = Math.max( r.z - 900 - cw[ 14 ], 0, cw[ 14 ] - r.z );
		const dist = Math.hypot( dx, dy, dz );
		if ( dist < 3200 ) ranked.push( { r, dist } );

	}

	ranked.sort( ( a, b ) => a.dist - b.dist );
	const waterCount = r_newer_water.value !== 0 ? Math.min( ranked.length, MAX_LIQUID_REGIONS ) : 0;
	cm.uWaterCount.value = waterCount;
	cm.uMist.value = Math.max( 0, r_mist.value );
	for ( let i = 0; i < waterCount; i ++ ) {

		const r = ranked[ i ].r;
		cm.uWaterMin.value[ i ].set( r.min[ 0 ], r.min[ 1 ], r.z, r.kind );
		cm.uProbeOf.value[ i ] = - 1;
		cm.uWaterMax.value[ i ].set( r.max[ 0 ], r.max[ 1 ], r.z, R_LiquidLookIndex( r.kind, r.mapLook ) );

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

	cm.uScreenReflect.value = r_reflect_screen.value !== 0 ? 1 : 0;

	cm.uEdge.value = postState.underwater || ! lighting ? 0 : Math.max( 0, r_newedges.value );
	const drops = R_ScreenDropsUpdate();
	cm.uDropDensity.value = postState.underwater ? 0 : drops.density;
	cm.uDropBlood.value = drops.blood;
	const tele = R_TeleportFx( performance.now() / 1000 );
	cm.uTeleStretch.value = tele.stretch;
	cm.uTeleChroma.value = tele.chroma;
	cm.uDropAge.value = drops.age;
	cm.uTime.value = time;
 cm.uActorWet.value=R_ActiveWeaponSurface().wet;
	cm.uCaustic.value = r_newer_water.value !== 0 ? CAUSTIC * Math.max( 0, r_caustics.value ) : 0;
	cm.tScene.value = hdr.textures[ 0 ];
	cm.tNormal.value = hdr.textures[ 1 ];
	cm.tAlbedo.value = hdr.textures[ 2 ] || null;
	cm.tVolume.value = volume > 0 ? p.volume.texture : null;
	cm.tBloom.value = bloom > 0 ? p.bloomResult.texture : null;
	cm.uTexel.value.set( 1 / hdr.width, 1 / hdr.height );
	// brightness and contrast are applied to the picture as displayed (below), so
	// 0.6 is 40% darker and 1.4 is 40% more contrast as seen
	const newBright = lighting ? Math.max( 0, r_newbright.value ) : 1;
	cm.uExposure.value = lighting ? exposure * HDR_EXPOSURE * ( hasSkyView === true ? OUTDOOR_EXPOSURE : 1 ) : exposure;
	cm.uBright.value = newBright;
	cm.uContrastGain.value = lighting ? Math.max( 0, r_newcontrast.value ) : 1;
	cm.uContrastPivot.value = newBright * 0.2; // deviations are taken from a typical scene brightness
	cm.uBloom.value = bloom * ( hasSkyView === true ? OUTDOOR_BLOOM : 1 );
	cm.uVolume.value = volume;

	R_PerfStage( 'bloom' );

	// Previously the expensive ray marches/bounce still ran at full device-pixel
	// resolution when the scene shrank. At half scale that did four times the
	// scene's work, preventing dynamic resolution from meeting its frame budget.
	const vision = PowerVisionMode(cl, R_NewerGame());
	const visionOn=vision!==0 || R_QuadVisionActive();
	const waves = R_WaterActive() && R_WaterWavesLive() > 0; // (ripples on the water bend the finished picture: the present pass, card [W1])
	const upscale = (lighting && dyn.scale < 1) || visionOn || waves;
	// Rend the Veil consumes the existing linear composite, even when Newer
	// lighting is disabled. Its local optics never repeat bloom/display grading.
	const rendFields = R_NewerGame() ? R_RendVeilFields() : [];
	const dofFocus = R_DofFocus(); // (depth of field is drawn by the present pass, card [38])
	const offscreen = upscale || rendFields.length > 0 || dofFocus > 0;
	cm.uOffscreen.value = offscreen ? 1 : 0;
	if ( offscreen ) {

		const count=visionOn?2:1;
		if (p.composite===null || p.composite.textures.length!==count) {
			p.composite?.dispose();p.composite=makeRT(hdr.width,hdr.height,{count});
			if(visionOn){const t=p.composite.textures[1];t.type=THREE.UnsignedByteType;t.minFilter=t.magFilter=THREE.NearestFilter;t.userData.visionEncoded=true;}
		}
		runPass( renderer, p.compositeMaterial, p.composite );
		R_PerfStage( 'final lighting pass' );
		const shown = p.presentMaterial.uniforms;
		const coordinates=visionOn?p.composite.textures[1]:null;
		const veiled = rendFields.length > 0
			? R_RendVeilOptics( renderer, p.composite.texture, hdr.depthTexture, R_RendVeilBackgroundDepth(), camera, rendFields )
			: p.composite.texture;
		const visionSource=R_PowerVisionRender(renderer,veiled,hdr,camera,vision,cl,coordinates);
		shown.tComposite.value = R_QuadVisionRender(renderer,visionSource,hdr,camera,scene,coordinates);
		shown.uBright.value = cm.uBright.value;
		shown.uContrastGain.value = cm.uContrastGain.value;
		shown.uContrastPivot.value = cm.uContrastPivot.value;
		shown.uWaves.value = waves ? 1 : 0;
		shown.tNormal.value = cm.tNormal.value;
		if ( dofFocus > 0 ) {

			if ( p.dof === null || p.dof.width !== hdr.width || p.dof.height !== hdr.height ) { p.dof?.dispose(); p.dof = makeRT( hdr.width, hdr.height ); }
			const d = p.dofMaterial.uniforms, [ dofPx, dofMax ] = R_DofCircle( hdr.height );
			d.tComposite.value = shown.tComposite.value; d.tNormal.value = cm.tNormal.value;
			d.uDof.value.set( dofFocus, dofPx, dofMax ); d.uDofTexel.value.set( 1 / hdr.width, 1 / hdr.height ); d.uDofFar.value = R_DofFar();
			runPass( renderer, p.dofMaterial, p.dof );
			shown.tComposite.value = p.dof.texture;
			R_PerfStage( 'depth of field' );

		}

	} else { R_PowerVisionReset(); R_QuadVisionReset(); }

	renderer.setRenderTarget( null );
	renderer.setViewport( viewport.lx, viewport.ly, viewport.lw, viewport.lh );
	gpu.mesh.material = offscreen ? p.presentMaterial : p.compositeMaterial;
	if ( splitLeft ) {

		renderer.setScissor( viewport.lx, viewport.ly, Math.floor( viewport.lw / 2 ), viewport.lh );
		renderer.setScissorTest( true );

	}

	renderer.render( p.scene, p.camera );
	if ( splitLeft ) renderer.setScissorTest( false );
	R_PerfStage( upscale ? 'lighting upscale' : 'final lighting pass' );

}

// the title demo's half-and-half comparison: the final pass fills the left half only
let splitLeft = false;

/**
 * The title demo's half-and-half comparison: while on, the final pass fills the left half only. Set each frame by
 * gl_rmain.js before `R_PostFinish`.
 *
 * @param {boolean} on true to draw only the left half (anything but `true` counts as false)
 */
export function R_PostSetSplit( on ) {

	splitLeft = on === true;

}

/**
 * Frees the pipeline: resets power and quad vision, the power-up fire target and the Rend the Veil optics, then
 * disposes the HDR targets, point-shadow atlas and sun shadow target. The next `R_PostBegin` that runs the
 * pipeline builds it again. Not called by the engine in the current tree; tests call it between fixtures.
 */
export function R_PostShutdown() {
	R_PowerVisionReset(true);
	R_QuadVisionReset();

	R_ClearPowerupFireTarget();
	R_RendVeilOpticsShutdown();

	if ( gpu === null ) return;
	disposeTargets();
	gpu.pointShadows.dispose();
	gpu.sunTarget.dispose();
	gpu.sunTarget.depthTexture.dispose();
	gpu = null;

}
