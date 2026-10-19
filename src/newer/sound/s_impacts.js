/**
 * @module newer/sound/s_impacts
 *
 * Impacts that sound like what they strike, item 2 of the add-on effects for every game (card T-3faa98e3,
 * docs/material-sounds-2026-10-14.md), as Arcane Dimensions, Quoth and Abyss have them: when a game plays a nail's
 * ricochet (`weapons/tink1.wav`, `weapons/ric1..3.wav`), the axe striking a wall (`player/axhit2.wav`) or a player
 * landing (`player/land.wav`, `player/land2.wav`), the surface supplies its replacement sound: stone chips, metal
 * pings, wood knocks, ground thuds, glass tinks, water splashes (s_material.js says which; s_surfacesounds.js makes
 * them). Only an admitted surface sound replaces the original; a full channel budget or unknown material keeps native audio.
 * The shotgun and the lightning gun make none of these sounds, so they are untouched.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; a reused trace.
 *
 * Errors: none raised here.
 */
import { cvar_t } from '../../engine/common/cvar.js';
import { cl, cls, cl_entities } from '../../engine/client/client.js';
import { S_PrecacheSound, S_StartSoundIfFree, S_AddSoundReplacement } from '../../engine/sound/snd_dma.js';
import { SV_RecursiveHullCheck, trace_t } from '../../engine/server/world.js';
import { R_NewerGame } from '../mode.js';
import { S_MaterialAt, S_FLOOR } from './s_material.js';
import './s_surfacesounds.js';
import { NewerBindings, NEWER_QUAKE_BINDINGS } from '../content_bindings.js';

/** Impacts that sound like the surface: 0 off, 1 on (saved; Options, Newer features). */
export const s_impacts = new cvar_t( 's_impacts', '1', true );

/** Quake's table of game sounds that bring a surface's sound, and how loud beside them (0..1); kept for callers that
 * read the old export. The live lookup is the active game's table (`content_bindings.js`). */
export const IMPACTS = NEWER_QUAKE_BINDINGS.sounds.impacts;

const trace = new trace_t(), from = new Float32Array( 3 ), to = new Float32Array( 3 );

// where the axe struck: 64 units along the entity's aim from its eye, as the game's axe traces (W_FireAxe)
function axePoint( entnum ) {

	const model = cl.worldmodel, hull = model?.hulls?.[ 0 ];
	const self = entnum === cl.viewentity, e = cl_entities[ entnum ];
	if ( ! hull || ! e?.origin ) return null;
	if ( ! self && ! e.angles ) return null;
	const pitch = ( self ? cl.viewangles[ 0 ] : - e.angles[ 0 ] * 3 ) * Math.PI / 180, yaw = ( self ? cl.viewangles[ 1 ] : e.angles[ 1 ] ) * Math.PI / 180;
	from[ 0 ] = e.origin[ 0 ]; from[ 1 ] = e.origin[ 1 ]; from[ 2 ] = e.origin[ 2 ] + 16;
	const f = [ Math.cos( pitch ) * Math.cos( yaw ), Math.cos( pitch ) * Math.sin( yaw ), - Math.sin( pitch ) ];
	for ( let i = 0; i < 3; i ++ ) to[ i ] = from[ i ] + f[ i ] * 64;
	trace.fraction = 1; trace.allsolid = true; trace.startsolid = false; trace.inopen = false; trace.inwater = false;
	trace.endpos[ 0 ] = to[ 0 ]; trace.endpos[ 1 ] = to[ 1 ]; trace.endpos[ 2 ] = to[ 2 ];
	SV_RecursiveHullCheck( hull, hull.firstclipnode, 0, 1, from, to, trace );
	if ( trace.startsolid || trace.fraction >= 1 ) return null;
	// (a hair back from the wall, so the surface is in front of the point)
	return [ trace.endpos[ 0 ] - f[ 0 ] * 2, trace.endpos[ 1 ] - f[ 1 ] * 2, trace.endpos[ 2 ] - f[ 2 ] * 2 ];

}

/**
 * Notes a sound as it starts; one that strikes a surface brings that surface's sound. Called by the sound system for
 * every sound it starts (S_AddSoundReplacement, snd_dma.js).
 *
 * @param {?object} sfx the sound
 * @param {?ArrayLike<number>} origin where it is
 * @param {number} volume 0..1
 * @param {number} attenuation
 * @param {number} entnum the entity that made it (-1 none)
 * @returns {?string} the surface sound started, for tests
 */
export function S_ImpactSound( sfx, origin, volume, attenuation, entnum ) {

	const cue = NewerBindings().sounds.impacts[ sfx?.name ];
	if ( ! cue || ! R_NewerGame() || ! ( s_impacts.value > 0 ) || ! cl.worldmodel || cls.demoplayback ) return null;
	let at = null, material;
	if ( cue.kind === 'nail' ) { at = origin; material = at && S_MaterialAt( cl.worldmodel, at, 8 ); }
	else if ( cue.kind === 'axe' ) { at = axePoint( entnum ); material = at && S_MaterialAt( cl.worldmodel, at, 8 ); }
	else { const e = cl_entities[ entnum ]; if ( e?.origin ) { at = [ e.origin[ 0 ], e.origin[ 1 ], e.origin[ 2 ] - 23 ]; material = S_MaterialAt( cl.worldmodel, at, 24, S_FLOOR ); } }
	if ( ! at || ! material ) return null; // (nowhere, or into lava)
	// which of the three: from where it happened, so the same strike sounds the same and nothing is carried over
	const turn = Math.abs( Math.round( at[ 0 ] ) * 7 + Math.round( at[ 1 ] ) * 13 + Math.round( at[ 2 ] ) * 17 ) % 3;
	const name = `quaked/hit_${material}${turn + 1}.wav`;
	return S_StartSoundIfFree( - 1, S_PrecacheSound( name ), at, cue.volume * Math.min( 1, volume ), attenuation || 1 ) ? name : null;

}

S_AddSoundReplacement( ( ...args ) => S_ImpactSound( ...args ) !== null );
