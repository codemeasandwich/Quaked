// Native Hexen II client effects: every CE_* type 1..62 spawns the right native sprite/model (or particle volume),
// animates at HX_FRAME_TIME and ends at its native lifetime; the svc_particle2/3/4 and coloured-explosion particle
// types, the rain/snow volumes, the 24..32 stream temp entities and the view shifts are exercised through the same
// public seams the unified parser calls. Skips cleanly without the supplied Hexen II installation.
await import( '../src/engine/render/gl_rsurf.js' ); // bootstrap the renderer's circular module graph in its safe order

import { existsSync, readFileSync } from 'node:fs';
import * as THREE from 'three';
import * as pak from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import '../src/newer/install.js'; // chunk, teleporter and stream models are alias meshes
import {
	cl, cl_entities, cl_numvisedicts, set_cl_numvisedicts, cl_visedicts,
	CSHIFT_BONUS, CSHIFT_POWERUP
} from '../src/engine/client/client.js';
import {
	Hexen2_StartEffect, Hexen2_EndEffect, Hexen2_GetEffect, Hexen2_EffectEntities,
	Hexen2_UpdateEffects, Hexen2_ClearEffects, Hexen2_AddStream, Hexen2_ClearStreams,
	Hexen2_LiveStreams, HEXEN2_STREAM_MODELS
} from '../src/engine/client/cl_hexen2_effects.js';
import {
	R_InitParticles, R_SetParticleExternals, R_ClearParticles, R_ParticleCount, R_ParticleLimit,
	R_RunParticleEffect2, R_RunParticleEffect3, R_RunParticleEffect4, R_ColoredParticleExplosion,
	R_RainEffect, R_SnowEffect, R_RocketTrail, R_DrawParticles, PT, RT
} from '../src/engine/render/r_part.js';
import { sv_gravity } from '../src/engine/server/sv_phys.js';
import { CE } from '../src/engine/common/hexen2_effectwire.js';
import { CL_UpdateTEnts } from '../src/engine/client/cl_tent.js';
import { V_CalcBlend, V_CalcPowerupCshift, V_DarkFlash_f, V_WhiteFlash_f } from '../src/engine/client/view.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const BASE = '/Users/bri/quaked/Hexen 2/data1';
const PORTALS = '/Users/bri/quaked/Hexen 2/portals';

let loaded = false;
function ensureLoaded() {

	if ( loaded ) return true;
	if ( ! existsSync( BASE + '/pak1.pak' ) ) return false;
	for ( const [ packName, path ] of [ [ 'u8-pak0.pak', BASE + '/pak0.pak' ], [ 'u8-pak1.pak', BASE + '/pak1.pak' ], [ 'u8-pak3.pak', PORTALS + '/pak3.pak' ] ] ) {

		if ( ! existsSync( path ) ) continue;
		const raw = readFileSync( path );
		pak.COM_AddPack( pak.COM_LoadPackFile( packName, raw.buffer.slice( raw.byteOffset, raw.byteOffset + raw.length ) ) );

	}
	const palette = pak.COM_FindFile( 'gfx/palette.lmp' ).data;
	VID_SetPalette( palette.buffer.slice( palette.byteOffset, palette.byteOffset + palette.byteLength ) );
	Mod_Init();
	GameProfile_Set( 'hexen2' );
	R_InitParticles();
	R_SetParticleExternals( { scene: new THREE.Scene(), sv_gravity } );
	loaded = true;
	return true;

}

// The wire bodies for one effect of each CE_* type (see hexen2_effectwire.js for the field groups).
function effectParams( type, now ) {

	const origin = [ 10, 20, 30 ];
	if ( type === CE.RAIN ) return { minOrg: [ 0, 0, 440 ], maxOrg: [ 64, 64, 540 ], eSize: [ 64, 64, 100 ], dir: [ 10, 20, 0 ], color: 1, count: 20, wait: 0.05 };
	if ( type === CE.SNOW ) return { minOrg: [ - 64, - 64, 0 ], maxOrg: [ 64, 64, 100 ], flags: 2, dir: [ 1, 2, - 3 ], count: 10 };
	if ( type === CE.FOUNTAIN ) return { pos: origin, angle: [ 0, 90, 0 ], movedir: [ 1, 1, 1 ], color: 5, cnt: 10 };
	if ( type === CE.QUAKE ) return { origin, radius: 300 };
	if ( type === CE.GRAVITYWELL ) return { origin, color: 300, lifetime: now + 2 };
	if ( type === CE.TELEPORTERBODY ) return { origin, velocity: [ 0, 0, 0 ], skinnum: 1 };
	if ( type === CE.BONESHARD || type === CE.BONESHRAPNEL ) return { origin, velocity: [ 1, 2, 3 ], angle: [ 0, 0, 0 ], avelocity: [ 1, 2, 3 ] };
	if ( type === CE.CHUNK ) return { origin, type: 2, srcVel: [ 10, 20, 30 ], numChunks: 4 };
	if ( type !== CE.RAIN && ( type === CE.WHITE_SMOKE || type === CE.GREEN_SMOKE || type === CE.GREY_SMOKE ||
		type === CE.RED_SMOKE || type === CE.SLOW_WHITE_SMOKE || type === CE.TELESMK1 || type === CE.TELESMK2 ||
		type === CE.GHOST || type === CE.REDCLOUD || type === CE.FLAMESTREAM || type === CE.ACID_MUZZFL ||
		type === CE.FLAMEWALL || type === CE.FLAMEWALL2 || type === CE.ONFIRE ) )
		return { origin, velocity: [ 1, 2, 3 ], framelength: 0.1, frame: 2 };
	return { origin };

}

function expectedEntityCount( type, params ) {

	if ( type === CE.RAIN || type === CE.SNOW || type === CE.FOUNTAIN || type === CE.QUAKE ||
		type === CE.RIDER_DEATH || type === CE.GRAVITYWELL ) return 0;
	if ( type === CE.TELEPORTERPUFFS ) return 8;
	if ( type === CE.CHUNK ) return Math.min( params.numChunks, 16 );
	return 1;

}

Deno.test( 'every CE_* type 1..62 spawns its native entity or particle volume and ends natively', () => {

	if ( ! ensureLoaded() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	same( R_ParticleLimit(), 7000, 'Hexen II raises the particle pool to 7000' );
	cl.time = 100;
	cl.oldtime = 99.95;
	cl.mtime[ 0 ] = 100;

	const seen = [];
	for ( let type = 1; type <= 62; type ++ ) {

		Hexen2_ClearEffects();
		R_ClearParticles();
		const params = effectParams( type, cl.time );
		const state = Hexen2_StartEffect( 0, type, params, cl.time );
		if ( state === null ) {

			// The supplied retail data has no models/flrexpl2.spr; native would fail to load it and the port drops the slot.
			same( type, CE.FLOOR_EXPLOSION2, `CE ${type} has no slot` );
			seen.push( type );
			continue;

		}
		same( state.type, type, `CE ${type} keeps its native type` );

		const entities = Hexen2_EffectEntities().filter( e => e.index === 0 );
		same( entities.length, expectedEntityCount( type, params ), `CE ${type} entity count` );
		for ( const entry of entities ) {

			check( entry.entity.model !== null, `CE ${type} loaded its model` );
			check( ! entry.entity.model.name.includes( 'progs/' ), `CE ${type} does not borrow Quake art` );

		}

		// one native frame runs without spawning a different class
		Hexen2_UpdateEffects( 0.05 );
		seen.push( type );

	}
	same( seen.length, 62, 'all 62 native CE types start' );

	// selected native model mappings, including the mission-pack slots
	const modelOf = ( type, params = effectParams( type, 100 ) ) => {

		Hexen2_ClearEffects();
		Hexen2_StartEffect( 0, type, params, 100 );
		const entities = Hexen2_EffectEntities();
		return entities.length ? entities[ 0 ].entity.model.name : null;

	};
	same( modelOf( CE.WHITE_SMOKE ), 'models/whtsmk1.spr', 'white smoke sprite' );
	same( modelOf( CE.BG_CIRCLE_EXP ), 'models/xplod29.spr', 'big circle explosion is xplod29, not fcircle' );
	same( modelOf( CE.WHITE_FLASH ), 'models/gryspt.spr', 'white flash sprite' );
	same( modelOf( CE.ACID_EXPL ), 'models/axplsn_5.spr', 'acid explosion sprite' );
	same( modelOf( CE.LSHOCK ), 'models/vorpshok.mdl', 'life-shock model' );
	same( modelOf( CE.CHUNK, { origin: [ 0, 0, 0 ], type: 2, srcVel: [ 0, 0, 0 ], numChunks: 4 } ).startsWith( 'models/splnter' ), true, 'wood chunks use splinters' );

	// native lifetimes
	cl.time = 100;
	cl.oldtime = 99.95;
	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.CHUNK, { origin: [ 0, 0, 0 ], type: 2, srcVel: [ 0, 0, 0 ], numChunks: 4 } );
	same( Hexen2_GetEffect( 0 ).timeAmount, 4.0, 'chunk debris lives four seconds' );
	Hexen2_UpdateEffects( 4.05 );
	same( Hexen2_GetEffect( 0 ), null, 'chunk debris is freed after its four seconds' );

	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.TELEPORTERBODY, effectParams( CE.TELEPORTERBODY, 100 ) );
	let teleportFrames = 0;
	while ( Hexen2_GetEffect( 0 ) && teleportFrames < 20 ) { Hexen2_UpdateEffects( 0.05 ); teleportFrames ++; }
	check( teleportFrames >= 6 && teleportFrames <= 7, 'teleporter body shrinks 0.15 per frame and ends near six frames: ' + teleportFrames );

	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.WHITE_FLASH, effectParams( CE.WHITE_FLASH, 100 ) );
	const flashFrames = Hexen2_EffectEntities()[ 0 ].entity.model.numframes;
	let flashSteps = 0;
	while ( Hexen2_GetEffect( 0 ) && flashSteps < 200 ) { Hexen2_UpdateEffects( 0.05 ); flashSteps ++; }
	check( flashSteps >= 2 * ( flashFrames - 1 ), 'flash runs forward then backward before it ends' );

	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.LSHOCK, effectParams( CE.LSHOCK, 100 ) );
	let shockSteps = 0;
	while ( Hexen2_GetEffect( 0 ) && shockSteps < 100 ) { Hexen2_UpdateEffects( 0.05 ); shockSteps ++; }
	same( shockSteps, 25, 'life-shock scale loses 0.1 per frame from 2.55 to 0.1' );

	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.RIDER_DEATH, effectParams( CE.RIDER_DEATH, 100 ) );
	for ( let i = 0; i < 15; i ++ ) { cl.time ++; Hexen2_UpdateEffects( 1 ); }
	same( Hexen2_GetEffect( 0 ), null, 'rider death ends after its thirteenth stage' );
	same( cl.cshifts[ CSHIFT_BONUS ].destcolor[ 0 ], 255, 'rider death stage 7 flashes the screen white' );

	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.GRAVITYWELL, { origin: [ 0, 0, 0 ], color: 300, lifetime: 100 } );
	cl.time = 103;
	Hexen2_UpdateEffects( 0.05 );
	same( Hexen2_GetEffect( 0 ), null, 'gravity well ends at its lifetime' );

	// ending early frees every entity, as svc_end_effect does
	Hexen2_ClearEffects();
	Hexen2_StartEffect( 0, CE.TELEPORTERPUFFS, { origin: [ 0, 0, 0 ] } );
	same( Hexen2_EffectEntities().length, 8, 'teleporter puffs own eight sprites' );
	Hexen2_EndEffect( 0 );
	same( Hexen2_EffectEntities().length, 0, 'ending a slot frees every entity' );

} );

Deno.test( 'Hexen II particle2/3/4 types, coloured explosions and trails are native and expire', () => {

	if ( ! ensureLoaded() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	cl.time = 50;
	cl.oldtime = 49.95;

	for ( const effect of Object.values( PT ) ) {

		R_ClearParticles();
		R_RunParticleEffect2( [ 1, 2, 3 ], [ - 4, - 4, - 4 ], [ 4, 4, 4 ], 200, effect, 3 );
		same( R_ParticleCount(), 3, `particle2 effect ${effect} spawns three` );
		R_DrawParticles();
		same( R_ParticleCount(), 3, `particle2 effect ${effect} survives its first frame` );

	}
	R_ClearParticles();
	R_RunParticleEffect3( [ 1, 2, 3 ], [ 8, 16, 24 ], 300, PT.ICE, 4 );
	same( R_ParticleCount(), 4, 'particle3 box count' );
	R_ClearParticles();
	R_RunParticleEffect4( [ 1, 2, 3 ], 32, 301, PT.REDFIRE, 5 );
	same( R_ParticleCount(), 5, 'particle4 radius count' );
	R_ClearParticles();
	R_ColoredParticleExplosion( [ 1, 2, 3 ], 300, 16, 6 );
	same( R_ParticleCount(), 6, 'coloured explosion count' );

	// every particle burst dies at its native two/three-second lifetime
	cl.time = 60;
	cl.oldtime = 59.95;
	R_ClearParticles();
	R_RunParticleEffect2( [ 0, 0, 0 ], [ 1, 1, 1 ], [ 2, 2, 2 ], 200, PT.STATIC, 2 );
	cl.time = 62.01;
	R_DrawParticles();
	same( R_ParticleCount(), 0, 'particle2 lifetime is two seconds' );

	// rain volume and snow volume
	cl.time = 70;
	cl.oldtime = 69.95;
	const rainBefore = R_ParticleCount();
	R_RainEffect( [ 0, 0, 500 ], [ 64, 64, 100 ], 10, 20, 1, 7 );
	same( R_ParticleCount(), rainBefore + 7, 'rain volume spawns its count' );
	const snowBefore = R_ParticleCount();
	R_SnowEffect( [ - 64, - 64, 0 ], [ 64, 64, 100 ], 2, [ 1, 2, - 3 ], 6 );
	same( R_ParticleCount(), snowBefore + 6, 'snow volume spawns its count' );

	// native trails rt_fireball..rt_bloodshot
	for ( const type of [ RT.FIREBALL, RT.ICE, RT.SPIT, RT.SPELL, RT.VORPAL, RT.SETSTAFF, RT.MAGICMISSILE,
		RT.BONESHARD, RT.SCARAB, RT.ACIDBALL, RT.BLOODSHOT ] ) {

		R_ClearParticles();
		R_RocketTrail( [ 0, 0, 0 ], [ 90, 0, 0 ], type );
		check( R_ParticleCount() > 0, `trail ${type} spawns particles` );

	}

} );

Deno.test( 'rain and snow CE slots emit their volumes on the native cadence', () => {

	if ( ! ensureLoaded() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	Hexen2_ClearEffects();
	R_ClearParticles();
	cl.time = 100;
	cl.oldtime = 99.94;
	Hexen2_StartEffect( 0, CE.RAIN, effectParams( CE.RAIN, 100 ), 100 );
	Hexen2_UpdateEffects( 0.06 );
	same( R_ParticleCount(), 20, 'rain emits its count after its wait' );

	Hexen2_ClearEffects();
	R_ClearParticles();
	cl.time = 100;
	cl.oldtime = 99.94;
	Hexen2_StartEffect( 0, CE.SNOW, effectParams( CE.SNOW, 100 ), 100 );
	Hexen2_UpdateEffects( 0.06 );
	same( R_ParticleCount(), 0, 'snow waits for its 0.10 s cadence' );
	Hexen2_UpdateEffects( 0.05 );
	same( R_ParticleCount(), 10, 'snow emits its count after 0.10 s' );

	Hexen2_ClearEffects();
	R_ClearParticles();
	Hexen2_StartEffect( 0, CE.FOUNTAIN, effectParams( CE.FOUNTAIN, 100 ), 100 );
	Hexen2_UpdateEffects( 0.05 );
	same( R_ParticleCount(), 10, 'fountain emits its count every frame' );

	Hexen2_ClearEffects();
	R_ClearParticles();
	Hexen2_StartEffect( 0, CE.QUAKE, effectParams( CE.QUAKE, 100 ), 100 );
	Hexen2_UpdateEffects( 0.05 );
	same( R_ParticleCount(), 100, 'quake emits its 100 ring particles' );

} );

Deno.test( 'the 24..32 stream temp entities lay native models, frames and the sunstaff orbs', () => {

	if ( ! ensureLoaded() ) { console.log( 'SKIP: the supplied Hexen II installation is not present' ); return; }
	cl.time = 200;
	cl.oldtime = 199.95;
	cl.mtime[ 0 ] = 200;
	cl_entities[ 1 ].origin.set( [ 50, 0, 0 ] );

	for ( const type of [ 24, 25, 26, 27, 28, 29, 30, 31, 32 ] ) {

		Hexen2_ClearStreams();
		same( Hexen2_AddStream( { type, entity: 1, tag: 0, flags: 0, skin: 2, duration: 0.5,
			source: [ 60, 0, 0 ], dest: [ 180, 0, 0 ] } ), true, `stream ${type} accepted` );
		same( Hexen2_LiveStreams().length, 1, `stream ${type} is live` );
		set_cl_numvisedicts( 0 );
		CL_UpdateTEnts();
		const drawn = cl_visedicts.slice( 0, cl_numvisedicts );
		check( drawn.length >= 4, `stream ${type} lays segments` );
		same( drawn[ 0 ].model.name, HEXEN2_STREAM_MODELS[ type ][ 0 ], `stream ${type} first model` );
		for ( const ent of drawn ) check( ent.model !== null, `stream ${type} only draws loaded models` );

	}

	// an attached start follows its owner every frame
	Hexen2_ClearStreams();
	Hexen2_AddStream( { type: 25, entity: 1, tag: 1, flags: 16, skin: 0, duration: 0.5,
		source: [ 60, 0, 0 ], dest: [ 120, 0, 0 ] } );
	cl_entities[ 1 ].origin.set( [ 70, 0, 0 ] );
	set_cl_numvisedicts( 0 );
	CL_UpdateTEnts();
	const attached = cl_visedicts.slice( 0, cl_numvisedicts );
	same( attached[ 0 ].origin[ 0 ], 80, 'an attached stream starts at the owner origin plus its offset' );

	// the native 32-slot stream list
	Hexen2_ClearStreams();
	let accepted = 0;
	for ( let tag = 0; tag < 33; tag ++ )
		if ( Hexen2_AddStream( { type: 25, entity: 1, tag, flags: 0, skin: 0, duration: 1,
			source: [ 0, 0, 0 ], dest: [ 30, 0, 0 ] } ) ) accepted ++;
	same( accepted, 32, 'MAX_STREAMS is 32' );

} );

Deno.test( 'Hexen II view shifts: dark/white flash, artifact freeze and the stoned grayscale marker', () => {

	GameProfile_Set( 'hexen2' );
	for ( const shift of cl.cshifts ) { shift.destcolor.fill( 0 ); shift.percent = 0; }

	V_DarkFlash_f();
	same( cl.cshifts[ CSHIFT_BONUS ].destcolor.join( ',' ), '0,0,0', 'df is black' );
	same( cl.cshifts[ CSHIFT_BONUS ].percent, 255, 'df is full strength' );
	V_WhiteFlash_f();
	same( cl.cshifts[ CSHIFT_BONUS ].destcolor.join( ',' ), '255,255,255', 'wf is white' );

	cl.h2.stats.artifact_active = 128; // ARTFLAG_FROZEN
	V_CalcPowerupCshift();
	same( cl.cshifts[ CSHIFT_POWERUP ].destcolor.join( ',' ), '20,70,255', 'frozen powerup tint' );
	same( cl.cshifts[ CSHIFT_POWERUP ].percent, 65, 'frozen tint strength' );

	cl.h2.stats.artifact_active = 256; // ARTFLAG_STONED
	V_CalcPowerupCshift();
	same( cl.cshifts[ CSHIFT_POWERUP ].percent, 11000, 'stoned uses the grayscale marker' );
	V_CalcBlend();
	same( cl.cshifts[ CSHIFT_POWERUP ].percent, 80, 'grayscale marker becomes 80 in the blend' );

	cl.h2.stats.artifact_active = 512; // ARTFLAG_DIVINE_INTERVENTION
	V_CalcPowerupCshift();
	same( cl.cshifts[ CSHIFT_BONUS ].destcolor.join( ',' ), '255,255,255', 'divine intervention white bonus' );
	same( cl.cshifts[ CSHIFT_BONUS ].percent, 256, 'divine intervention full white' );

	cl.h2.stats.artifact_active = 0;
	V_CalcPowerupCshift();
	same( cl.cshifts[ CSHIFT_POWERUP ].percent, 0, 'no artifact clears the powerup tint' );

} );
