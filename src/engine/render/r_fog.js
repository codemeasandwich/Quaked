/**
 * @module engine/render/r_fog
 *
 * Distance fog, as Quakespasm and FitzQuake have it, which add-ons and the re-release's episodes use (Arcane
 * Dimensions, Dimension of the Past, Dimension of the Machine; card dadcb966, docs/fog-2026-10-13.md): a map's
 * worldspawn `fog` key ("density red green blue") sets it as the map loads, and the `fog` console command (which
 * QuakeC can send through `stuffcmd`, as Arcane Dimensions does) changes it while the map plays, fading over a time
 * when one is given. Every surface fades to the fog's colour with its own distance, as exp(-(density / 64 *
 * distance)^2) (GL_EXP2 at density / 64): Three.js' exponential-squared fog, put on the scene while it is drawn
 * (R_FogApply, gl_rmain.js), in the classic picture and in the Newer Game picture's scene pass alike, so particles and
 * explosions are fogged at their own distance and bloom is made from the fogged picture. The sky is not fogged by
 * distance: it takes a share of the fog's colour (R_FogSkyMaterial): the map's worldspawn `skyfog` key, else the
 * r_skyfog setting (0.5, as Quakespasm; R_FogSkyShare). A density of 0 is no fog.
 *
 * Fog is mixed in the picture's linear light, where Quakespasm mixes the displayed values: at middling amounts a dark
 * surface comes out slightly lighter than in Quakespasm. In the Newer Game picture the colour goes through that
 * picture's grade like everything else.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: module-level `from`/`to` (the fade's ends), `fadeStart`/`fadeTime`, and `current` (the fog now), reset for
 * each map (R_FogNewMap); `mapSkyFog` (the map's own sky share, or null) and the one uniform every sky material reads.
 *
 * Errors: none raised; a `fog` command with too many values prints its usage and changes nothing.
 */
import * as THREE from 'three';
import { Cmd_AddCommand, Cmd_Argc, Cmd_Argv } from '../common/cmd.js';
import { Con_Printf } from '../common/console.js';
import { cvar_t, Cvar_RegisterVariable, Cvar_FindVar, Cvar_SetValue } from '../common/cvar.js';

/** The share of the fog's colour the sky takes by default (Quakespasm's r_skyfog default). */
export const FOG_SKY = 0.5;
/** The sky's share of the fog's colour (Quakespasm's r_skyfog); a map's worldspawn `skyfog` key sets it for that map. */
export const r_skyfog = new cvar_t( 'r_skyfog', String( FOG_SKY ) );
// the share every sky material reads (one uniform object for all of them): the map's `skyfog`, else r_skyfog; a change
// of r_skyfog while the map plays (Arcane Dimensions' QuakeC sets it) takes over, as Quakespasm's r_skyfog callback does.
// Observe writes, not numeric snapshots: different spellings and multiple writes between draws must count.
const skyFogUniform = { value: FOG_SKY };
// how much brighter the sky is drawn this frame: 0, or a lightning flash's (R_SkyFlashSet; newer/render/r_storm.js)
const skyFlashUniform = { value: 0 };

/**
 * Sets how much brighter every sky material is drawn this frame (0 none; 1 twice as bright). The storm's lightning
 * flashes use it (newer/render/r_storm.js, card T-3faa98e3 item 5); nothing else does, so it stays 0.
 *
 * @param {number} v 0..4
 */
export function R_SkyFlashSet( v ) { skyFlashUniform.value = Math.min( 4, Math.max( 0, Number.isFinite( v ) ? v : 0 ) ); }
let mapSkyFog = null, seenSkyFogRevision = r_skyfog.changeRevision;
// Quakespasm's colour when none is given
const DEFAULT = Object.freeze( { density: 0, r: 0.3, g: 0.3, b: 0.3 } );

let from = { ...DEFAULT }, to = { ...DEFAULT }, fadeStart = 0, fadeTime = 0;
const current = { ...DEFAULT };
const now = () => performance.now() / 1000;

const clamp01 = v => Math.min( 1, Math.max( 0, v ) );
const atof = s => { const v = Number.parseFloat( s ); return Number.isFinite( v ) ? v : 0; }; // as C's atof: 0 for text

// changes the fog to `next` over `time` seconds (0: at once), from the fog as it is now
function update( next, time ) {

	R_FogParams(); // (brings `current` up to this moment)
	from = { ...current };
	to = { density: Math.max( 0, next.density ), r: clamp01( next.r ), g: clamp01( next.g ), b: clamp01( next.b ) };
	fadeStart = now(); fadeTime = Math.max( 0, time );
	R_FogParams();

}

/**
 * Sets the fog from the values a `fog` command gives, as Quakespasm's Fog_FogCommand_f takes them: 1 value the
 * density; 2 the density and a fade time; 3 the colour; 4 the density and colour; 5 those and a fade time. A value
 * that is not a number counts as 0, as C's atof (so `fog off` is no fog).
 *
 * @param {Array<string>} parts the values, as typed
 * @returns {boolean} whether there were 1 to 5 values (otherwise nothing changes)
 */
export function R_FogSet( parts ) {

	const v = parts.map( atof ), f = to;
	switch ( v.length ) {

		case 1: update( { ...f, density: v[ 0 ] }, 0 ); return true;
		case 2: update( { ...f, density: v[ 0 ] }, v[ 1 ] ); return true;
		case 3: update( { ...f, r: v[ 0 ], g: v[ 1 ], b: v[ 2 ] }, 0 ); return true;
		case 4: update( { density: v[ 0 ], r: v[ 1 ], g: v[ 2 ], b: v[ 3 ] }, 0 ); return true;
		case 5: update( { density: v[ 0 ], r: v[ 1 ], g: v[ 2 ], b: v[ 3 ] }, v[ 4 ] ); return true;
		default: return false;

	}

}

// the key/value pairs of the first entity (worldspawn) of an entity text, quoted strings read whole, so a '}' inside a
// value does not end it; `//` comments skipped
function worldspawn( text ) {

	const pairs = [], tokens = [];
	let i = text.indexOf( '{' );
	if ( i < 0 ) return pairs;
	for ( i ++; i < text.length; ) {

		const c = text[ i ];
		if ( c === '}' ) break;
		if ( c === '/' && text[ i + 1 ] === '/' ) { i = text.indexOf( '\n', i ); if ( i < 0 ) break; continue; }
		if ( c === '"' ) { const end = text.indexOf( '"', i + 1 ); if ( end < 0 ) break; tokens.push( text.slice( i + 1, end ) ); i = end + 1; continue; }
		i ++;

	}
	for ( let k = 0; k + 1 < tokens.length; k += 2 ) pairs.push( [ tokens[ k ], tokens[ k + 1 ] ] );
	return pairs;

}

/**
 * Starts a map's fog from its entities, as Quakespasm's Fog_ParseWorldspawn: its worldspawn `fog` key (a leading `_`
 * on the key is allowed; the last one wins), its values filled in order (density, red, green, blue; those missing keep
 * their defaults), else none: a map without one is clear, whatever the last map had. Its `skyfog` key sets the sky's
 * share for this map (R_FogSkyShare). Called by the renderer's R_NewMap.
 *
 * @param {?string} entities the map's entity text (model.entities)
 */
export function R_FogNewMap( entities ) {

	let next = { ...DEFAULT };
	// the sky's share: worldspawn `skyfog` (Quake's re-release maps set `_skyfog` per map), else r_skyfog
	mapSkyFog = null;
	for ( const [ key, value ] of worldspawn( entities ?? '' ) ) {

		const name = key.replace( /^_/, '' ).toLowerCase();
		if ( name === 'skyfog' && Number.isFinite( Number.parseFloat( value ) ) ) mapSkyFog = Number.parseFloat( value );
		if ( name !== 'fog' ) continue;
		const v = value.trim().split( /\s+/ ).map( Number.parseFloat ), filled = { ...DEFAULT };
		[ 'density', 'r', 'g', 'b' ].forEach( ( name, k ) => { if ( Number.isFinite( v[ k ] ) ) filled[ name ] = v[ k ]; } );
		next = filled;

	}
	from = { ...next }; to = { ...next }; fadeTime = 0;
	seenSkyFogRevision = r_skyfog.changeRevision;
	R_FogSkyShare();
	to.density = from.density = Math.max( 0, next.density );
	R_FogParams();

}

/**
 * The fog to draw now, part-way through a fade if one is running.
 *
 * @returns {{ density: number, r: number, g: number, b: number }} density (0: none, Quakespasm's units) and colour 0..1
 *   (the same object each call, updated)
 */
export function R_FogParams() {

	const t = fadeTime > 0 ? Math.min( 1, ( now() - fadeStart ) / fadeTime ) : 1;
	for ( const k of [ 'density', 'r', 'g', 'b' ] ) current[ k ] = from[ k ] + ( to[ k ] - from[ k ] ) * t;
	return current;

}

const sceneFog = new THREE.FogExp2( 0, 0 ); // reused: the fog put on the scene while it is drawn

/**
 * Puts the fog on a scene for one draw: Three.js' exponential-squared fog at density / 64 in the fog's colour, or none.
 * The classic picture takes the colour as given (sRGB); the Newer Game picture's scene pass is in linear light before
 * its exposure, so the colour is made linear and divided by the exposure it is about to get.
 *
 * @param {THREE.Scene} scene the scene about to be drawn
 * @param {?number} exposure the Newer Game picture's exposure, or null for the classic picture
 * @returns {boolean} whether there is fog this frame
 */
export function R_FogApply( scene, exposure = null ) {

	const fog = R_FogParams();
	R_FogSkyShare();
	if ( ! ( fog.density > 0 ) ) { scene.fog = null; return false; }
	sceneFog.density = fog.density / 64;
	if ( exposure === null ) sceneFog.color.setRGB( fog.r, fog.g, fog.b, THREE.SRGBColorSpace );
	else { const k = 1 / Math.max( 1e-3, exposure ); sceneFog.color.setRGB( ( fog.r ** 2.2 ) * k, ( fog.g ** 2.2 ) * k, ( fog.b ** 2.2 ) * k, THREE.LinearSRGBColorSpace ); }
	scene.fog = sceneFog;
	return true;

}

/**
 * The sky's share of the fog's colour now: the map's `skyfog`, or r_skyfog (a change to r_skyfog in play taking over),
 * 0..1. Updates the value the sky materials read.
 *
 * @returns {number} the share
 */
export function R_FogSkyShare() {

	if ( r_skyfog.changeRevision !== seenSkyFogRevision ) { seenSkyFogRevision = r_skyfog.changeRevision; mapSkyFog = null; }
	const share = mapSkyFog ?? r_skyfog.value;
	skyFogUniform.value = Math.min( 1, Math.max( 0, Number.isFinite( share ) ? share : FOG_SKY ) );
	return skyFogUniform.value;

}

/**
 * Chooses the sky share explicitly from Options, including when the chosen value matches the console default.
 * Unlike an unchanged console assignment, a menu choice always releases the current map's override.
 *
 * @param {number} value share 0..1 (0 removes the sky tint; distance fog is unchanged)
 */
export function R_FogSkySet( value ) {

 Cvar_SetValue( 'r_skyfog', Math.round( clamp01( value ) * 100 ) / 100 );
 mapSkyFog = null;
 R_FogSkyShare();

}

/**
 * Makes a sky material take the fog's colour by the sky's share (R_FogSkyShare) instead of by distance (Quakespasm
 * draws the sky unfogged, then lays the fog's colour over it at r_skyfog). Keeps whatever the material's prototype does to its shader first (the
 * Newer Game G-buffer patch).
 *
 * @param {THREE.Material} material a sky material (fog on)
 * @returns {THREE.Material} the same material
 */
export function R_FogSkyMaterial( material ) {

	const before = material.onBeforeCompile;
	material.onBeforeCompile = function ( shader, renderer ) {

		before?.call( this, shader, renderer );
		shader.uniforms.uQuakedSkyFog = skyFogUniform;
		shader.uniforms.uQuakedSkyFlash = skyFlashUniform;
		shader.fragmentShader = 'uniform float uQuakedSkyFog;\nuniform float uQuakedSkyFlash;\n' + shader.fragmentShader.replace( '#include <fog_fragment>',
			'gl_FragColor.rgb *= 1.0 + uQuakedSkyFlash; // a lightning flash (r_fog.js R_SkyFlashSet)\n#ifdef USE_FOG\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, uQuakedSkyFog ); // the sky\'s share (r_fog.js)\n#endif' );

	};
	const key = material.customProgramCacheKey.bind( material );
	material.customProgramCacheKey = () => key() + '|quaked-sky-fog';
	return material;

}

// `fog` with no values prints the fog; otherwise as R_FogSet
function R_Fog_f() {

	const parts = [];
	for ( let i = 1; i < Cmd_Argc(); i ++ ) parts.push( Cmd_Argv( i ) );
	if ( parts.length === 0 ) { const f = R_FogParams(); Con_Printf( 'fog: density %s, colour %s %s %s\n', f.density, f.r, f.g, f.b ); return; }
	if ( ! R_FogSet( parts ) ) Con_Printf( 'usage: fog <density> [<fade>] | fog <red> <green> <blue> | fog <density> <red> <green> <blue> [<fade>]\n' );

}

/** Registers the `fog` command and the r_skyfog setting. Called once by R_Init. */
export function R_FogInit() {

	Cmd_AddCommand( 'fog', R_Fog_f );
	if ( ! Cvar_FindVar( r_skyfog.name ) ) Cvar_RegisterVariable( r_skyfog );

}
