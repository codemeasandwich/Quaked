/**
 * @module newer/render/r_post_config
 *
 * The post pipeline's settings (card [44h], split from gl_post.js): its console variables and the tunables its stages
 * share.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 *
 * gl_post.js re-exports the public ones (the cvars, `MAX_VOLUME_LIGHTS`, `SUN_SHADOW_LAYER`, `EMITTER_LIGHT_GAIN`);
 * the rest are for the pipeline's own modules.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { POINT_SHADOW_SLOTS } from './r_pointshadows.js';

// 0 = the classic lighting, 1 = the HDR pipeline ("Newer Game"); switchable at any time
export const r_hdr = new cvar_t( 'r_hdr', '0' );
export const r_pointshadows = new cvar_t( 'r_pointshadows', '1' ); // 0 compares the former screen-space approximation
export const r_bloom = new cvar_t( 'r_bloom', '0.9' );
export const r_heathaze = new cvar_t( 'r_heathaze', '0.6' ); // the shimmer over lava (0 off)
export const r_mist = new cvar_t( 'r_mist', '0.6' ); // Muddy surface haze and Toxic vapour (0 off)
// Water appearance: 0 map defaults, 1 clear, 2 tinted, 3 muddy, 4 toxic.
// Presentation only: contents, swimming and damage remain the map's contract.
export const r_water_look = new cvar_t( 'r_water_look', '0', true );
export const r_reflect = new cvar_t( 'r_reflect', '0.6' ); // how reflective water is (0 off)
export const r_reflect_screen = new cvar_t( 'r_reflect_screen', '1' ); // 1 = reflections take what is on the screen first, 0 = only the pool's probe
export const r_pillars = new cvar_t( 'r_pillars', '0.5' ); // how strong the light shafts are: 0 off, 1 the strongest (PILLAR_MAX), 0.5 the default
export const r_cloudspeed = new cvar_t( 'r_cloudspeed', '0.1875' ); // how fast the cloud pattern drifts over the ground, against the sky's own scrolling (1 = the same)
export const r_bounce = new cvar_t( 'r_bounce', '1' ); // bounced light between surfaces (0 off)
export const r_volumetric = new cvar_t( 'r_volumetric', '1' );
// Newer Game's overall look: 1 = as designed.  0.6 is 40% darker, 1.4 is 40% more contrast.
export const r_newbright = new cvar_t( 'r_newbright', '0.6' );
export const r_newcontrast = new cvar_t( 'r_newcontrast', '1.4' );
export const r_caustics = new cvar_t( 'r_caustics', '1' ); // strength of light patterns beneath water
// How hard the baked lighting falls off in Newer Game: the lightmap is raised to
// this power, so what is lit by a clear source stays bright and what is not goes
// dark (1 = as baked).  Light that does not come from a source is not invented.
export const r_newdark = new cvar_t( 'r_newdark', '2.2' );

// Accent on the corners and edges where surfaces really meet at an angle: the
// inside of a corner darkens, the outer edge catches a little light.  1 = as
// designed, 0 = off.  Faces in one plane (however they are cut up) are untouched.
export const r_newedges = new cvar_t( 'r_newedges', '1' );

// Newer Game holds a frame rate by itself: when frames take longer than the target
// allows, the picture is drawn at a lower resolution (and scaled up to fill the
// screen) until they fit, and creeps back up when there is room.  r_dynres 0 = always
// full resolution; r_fps_target is the frames per second aimed for.
export const r_dynres = new cvar_t( 'r_dynres', '1' );
export const r_fps_target = new cvar_t( 'r_fps_target', '60' );

// glquake.h flags (not imported: keeps this module out of the renderer's import cycle)
export const SURF_DRAWSKY = 4;
export const SURF_DRAWTURB = 0x10;

export const MAX_VOLUME_LIGHTS = POINT_SHADOW_SLOTS;

// Objects on this layer cast sun shadows (the world; sky deliberately is not)
export const SUN_SHADOW_LAYER = 3;

// Tunables
export const EMISSIVE_BOOST = 4.5; // fullbright texels, in HDR
export const LAVA_BOOST = 6.0; // bright lava texels remain above the bloom threshold even at the low pulse
export const LAVA_PULSE = 0.14; // and it breathes, slowly
export const EMITTER_LIGHT_GAIN = 2.0; // physical emitters send twice the prior local radiance
export const LIGHT_GAIN = 5.0; // radiance per unit of light power
export const SCATTER = 0; // source-lit receivers remain; broad point-light fog is removed
export const LIGHT_FLOOR = 0.12; // light on a surface the lightmap left dark
export const LIGHT_SURFACE = 0.16; // direct light from point lights on surfaces
export const SPOT_POWER = 1.6; // the flashlight, in the same units as the point lights
export const MAX_RAY = 3600;
export const SUN_COLOR = [ 3.4, 2.7, 1.9 ]; // warm white; tinted by the sky's own colour
export const PILLAR_MAX = 0.35; // original sun scattering scale, before the shared shaft gain
export const PILLAR_DEFAULT = 0.5;
export const SHAFT_GAIN = 4; // all shaft types share one gain; .5 remains the slider's nominal setting
export const SUN_SCATTER = 0.00003; // sun in-scattering per unit of lit air
export const SUN_SURFACE = 0.6; // direct sun on surfaces (multiplies the lightmapped colour, so this is a gain)
export const SUN_SURFACE_COLOR = [ 1.0, 0.9, 0.76 ];
export const SATURATION = 1.15;
export const VIBRANCE = 0.12; // extra saturation for the colours that have little
export const CONTRAST = 0.5; // extra gain for mid-tones and highlights
export const HDR_EXPOSURE = 1.3; // the lit parts of a level should read as lit, the rest as dark
export const OUTDOOR_EXPOSURE = 0.85; // open daylight needs less gain than a dim interior
export const OUTDOOR_BLOOM_THRESHOLD = 2.4; // the sky itself is bright: only real highlights (lava, lights) glow, not the daylight
export const OUTDOOR_BLOOM = 0.5; // and what does glow is softer under the open sky
export const CAUSTIC = 2.0; // focused received-light network; profile and sediment attenuation remain separate
export const BUMP_LIGHT = 0.3; // how much of the normal map's relief takes the direct light (1 = all of it) // brightness of caustics beneath water

export const BLOOM_LEVELS = 5;
export const SUN_SHADOW_SIZE = 2048;
export const SUN_SHADOW_EXTENT = 1700; // half-size of the shadowed area around the camera, in units
export const SUN_SHADOW_DEPTH = 3400;
