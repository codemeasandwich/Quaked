/**
 * @module newer/sound/s_ambientgame
 *
 * When the ambient music plays: decided from the game (monsters nearby), not from what is drawn.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports; module-level variables `world`, `oldHealth`, `oldArmour`, `combatUntil`, `state`.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Gameplay policy for the streamed ambience. Use the local authoritative
// monsters when available; renderer visibility is not an enemy safety signal.
import { cl, cls, cl_entities, ca_connected, SIGNONS, CSHIFT_DAMAGE } from '../../engine/client/client.js';
import { sv, FL_MONSTER } from '../../engine/server/server.js';
import { PR_GetString } from '../../engine/progs/progs.js';
import { in_attack } from '../../engine/client/cl_input.js';
import { key_dest, key_game } from '../../engine/client/keys.js';
import { STAT_HEALTH, STAT_ARMOR } from '../../engine/common/quakedef.js';
import { R_NewerGame } from '../mode.js';
import { bgmvolume } from '../../engine/sound/sound.js';
import { Cvar_VariableValue } from '../../engine/common/cvar.js';
import { S_GetAudioContext } from '../../engine/sound/snd_dma.js';
import { S_AmbientMusicInit, S_GetAmbientMusicPlayer } from './s_ambientmusic.js';

export const AMBIENT_ENEMY_DISTANCE = 512;
export const AMBIENT_COMBAT_SECONDS = 10;
const ENEMY_MODEL = /^progs\/(army|soldier|enforcer|dog|ogre|demon|shambler|knight|hknight|zombie|wizard|fish|tarbaby|shalrath|boss|oldone)\.mdl$/;
const distance2 = ( a, b ) => ( a[ 0 ] - b[ 0 ] ) ** 2 + ( a[ 1 ] - b[ 1 ] ) ** 2 + ( a[ 2 ] - b[ 2 ] ) ** 2;
let world = null, oldHealth = null, oldArmour = null, combatUntil = 0;
let state = { active: false, reason: 'no game', safe: false, moving: false, enemiesNearby: false, combat: false };

export function S_AmbientMusicPolicy( now, hidden = typeof document !== 'undefined' && document.hidden ) {

	let reason = '';
	if ( ! R_NewerGame() ) reason = 'classic game';
	else if ( cls.demoplayback ) reason = 'demo';
	else if ( cls.state !== ca_connected || cls.signon !== SIGNONS || ! cl.worldmodel ) reason = 'no game';
	else if ( cl.stats[ STAT_HEALTH ] <= 0 ) reason = 'dead';
	else if ( cl.intermission ) reason = 'intermission';
	else if ( cl.paused || ( sv.active && sv.paused ) ) reason = 'paused';
	else if ( key_dest !== key_game ) reason = 'menu or console';
	else if ( hidden ) reason = 'hidden';
	else if ( bgmvolume.value <= 0 || Cvar_VariableValue( 'nosound' ) !== 0 ) reason = 'muted';
	if ( world !== cl.worldmodel ) { world = cl.worldmodel; oldHealth = oldArmour = null; combatUntil = 0; }
	if ( reason !== '' ) {

		state = { active: false, reason, safe: false, moving: false, enemiesNearby: false, combat: false, musicVolume: bgmvolume.value };
		return state;

	}
	const health = cl.stats[ STAT_HEALTH ], armour = cl.stats[ STAT_ARMOR ];
	let combat = !! ( in_attack.state & 1 ) || ( oldHealth !== null && health < oldHealth ) || ( oldArmour !== null && armour < oldArmour ) || cl.cshifts[ CSHIFT_DAMAGE ].percent > 0;
	oldHealth = health; oldArmour = armour;
	const player = sv.active ? sv.edicts?.[ cl.viewentity ] : null;
	const origin = player?.v.origin || cl_entities[ cl.viewentity ]?.origin;
	let nearby = false;
	if ( origin && sv.active && player ) {

		combat ||= player.v.button0 > 0;
		for ( let i = 1; i < sv.num_edicts; i ++ ) {

			const ed = sv.edicts[ i ], v = ed?.v;
			if ( ! v || ed.free || ed === player || ! ( v.health > 0 ) || v.deadflag > 0 ) continue;
			const monster = ( v.flags & FL_MONSTER ) !== 0 || PR_GetString( v.classname ).startsWith( 'monster_' );
			const opponent = cl.gametype === 1 && i <= cl.maxclients;
			if ( ! monster && ! opponent ) continue;
			const d = distance2( origin, v.origin );
			if ( d <= AMBIENT_ENEMY_DISTANCE ** 2 ) nearby = true;
			if ( monster && v.enemy === player.index && d <= ( AMBIENT_ENEMY_DISTANCE * 2 ) ** 2 ) combat = true;

		}

	} else if ( origin ) {

		// Remote servers do not transmit health/AI state for monsters. Be
		// conservative with known enemy models; ignore explicit death poses.
		for ( let i = 1; i < cl.num_entities; i ++ ) {

			const ed = cl_entities[ i ];
			if ( i === cl.viewentity || ! ed?.model ) continue;
			const opponent = cl.gametype === 1 && i <= cl.maxclients;
			if ( ! opponent && ! ENEMY_MODEL.test( ed.model.name ) ) continue;
			const pose = ed.model.cache?.data?.frames?.[ ed.frame ]?.name || '';
			if ( /^(death|die|dead)/i.test( pose ) ) continue;
			if ( distance2( origin, ed.origin ) <= AMBIENT_ENEMY_DISTANCE ** 2 ) nearby = true;

		}

	}
	const music = S_GetAmbientMusicPlayer();
	if ( combat ) combatUntil = now + AMBIENT_COMBAT_SECONDS;
	if ( music ) combatUntil = Math.max( combatUntil, music.lastCombat + AMBIENT_COMBAT_SECONDS );
	combat ||= now < combatUntil;
	const velocity = player?.v.velocity || cl.velocity;
	state = { active: reason === '', reason, safe: ! nearby && ! combat, enemiesNearby: nearby, combat,
		moving: Math.hypot( velocity[ 0 ], velocity[ 1 ] ) > 20, musicVolume: bgmvolume.value };
	return state;

}

export function S_UpdateAmbientMusic() {

	// The existing ambient music bus applies bgmvolume once. It must not pass
	// through the effects gain controlled by the separate Sound Volume slider.
	const context = S_GetAudioContext(), output = context?.destination;
	const policy = S_AmbientMusicPolicy( context?.currentTime || 0 );
	const player = policy.active && context && output ? S_AmbientMusicInit( context, output ) : S_GetAmbientMusicPlayer();
	player?.update( policy );

}

export function S_GetAmbientMusicStatus() {

	return { ...state, playback: S_GetAmbientMusicPlayer()?.getStatus() || null };

}
