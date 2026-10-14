/**
 * @module newer/sound/s_surfacesounds
 *
 * The engine's footstep and impact sounds for each surface material (card T-3faa98e3 items 1 and 2;
 * docs/material-sounds-2026-10-14.md), made as s_synth.js makes the lava's: short WAV files handed to the sound cache
 * when the game has no file of that name (the owner's ruling of 13 Oct: generated sounds through the existing cache and
 * mixer). Names: `quaked/step_<material><1..4>.wav` (and `steph_` for a heavy creature's), `quaked/hit_<material><1..3>.wav`.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: none of its own (s_synth.js keeps what is made).
 *
 * Errors: none raised here.
 */
import { SYNTH_RATE, SYNTH_Random, SYNTH_Define, SYNTH_Wav } from './s_synth.js';

// a decaying sine (a ringing partial)
function ring( out, at, f, gain, decay, rate = SYNTH_RATE ) {

	for ( let i = 0; at + i < out.length; i ++ ) {

		const t = i / rate, e = Math.exp( - t / decay );
		if ( e < 0.002 ) break;
		out[ at + i ] += Math.sin( 2 * Math.PI * f * t ) * e * gain;

	}

}

// noise, band-limited by a resonant filter at `f` (q: its sharpness), shaped by a quick attack and an exponential decay
function burst( out, at, random, f, q, gain, decay, attack = 0.002, rate = SYNTH_RATE ) {

	// (a two-pole band-pass, RBJ cookbook)
	const w = 2 * Math.PI * Math.min( f, rate * 0.45 ) / rate, alpha = Math.sin( w ) / ( 2 * q ), a0 = 1 + alpha;
	const b0 = alpha / a0, b2 = - alpha / a0, a1 = - 2 * Math.cos( w ) / a0, a2 = ( 1 - alpha ) / a0;
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for ( let i = 0; at + i < out.length; i ++ ) {

		const t = i / rate, e = Math.min( 1, t / attack ) * Math.exp( - t / decay );
		if ( t > attack && e < 0.002 ) break;
		const x = random() * 2 - 1, y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
		x2 = x1; x1 = x; y2 = y1; y1 = y;
		out[ at + i ] += y * e * gain;

	}

}

// scales a sound so its loudest sample is `peak`
function level( out, peak ) {

	let m = 0;
	for ( let i = 0; i < out.length; i ++ ) m = Math.max( m, Math.abs( out[ i ] ) );
	if ( m > 0 ) for ( let i = 0; i < out.length; i ++ ) out[ i ] *= peak / m;
	return out;

}

/**
 * A footstep on a surface: the heel's thump and the sole's scuff, voiced by what the surface is (stone: a firm tap and
 * grit; metal: a dull clank with a short ring; wood: a hollow knock; ground: a soft crunch; glass: a tap with a faint
 * ping; water: a wading splash). Heavy steps (a large monster's) are lower and longer.
 *
 * @param {string} material one of s_material.js's MATERIALS
 * @param {number} variant 1..4: each a little different, as no two steps are alike
 * @param {boolean} [heavy=false]
 * @returns {Float32Array}
 */
export function SYNTH_Step( material, variant, heavy = false ) {

	const random = SYNTH_Random( 0x5e9 + variant * 977 + ( heavy ? 31 : 0 ) + material.length * 7919 ), k = heavy ? 0.55 : 1;
	const out = new Float32Array( Math.floor( SYNTH_RATE * ( heavy ? 0.42 : 0.26 ) ) ), toe = Math.floor( SYNTH_RATE * ( 0.035 + random() * 0.02 ) * ( heavy ? 1.6 : 1 ) );
	const v = 0.85 + random() * 0.3;
	switch ( material ) {

		case 'metal':
			burst( out, 0, random, 220 * k * v, 1.2, 1, 0.018 / k ); burst( out, toe, random, 2600 * v, 3, 0.25, 0.02 );
			ring( out, 0, 410 * k * v, 0.22, 0.09 / k ); ring( out, 0, 1180 * k * v, 0.12, 0.05 ); break;
		case 'wood':
			burst( out, 0, random, 160 * k * v, 1, 1, 0.022 / k ); ring( out, 0, 240 * k * v, 0.35, 0.05 / k ); ring( out, 0, 560 * k * v, 0.15, 0.03 );
			burst( out, toe, random, 1800 * v, 2, 0.18, 0.025 ); break;
		case 'ground':
			burst( out, 0, random, 120 * k * v, 0.8, 1, 0.03 / k );
			for ( let g = 0; g < 9; g ++ ) burst( out, Math.floor( toe * random() * 2 ), random, 1600 + random() * 2400, 4, 0.12, 0.004 );
			break;
		case 'glass':
			burst( out, 0, random, 260 * k * v, 1.2, 1, 0.015 / k ); ring( out, toe, 3100 * v, 0.06, 0.04 ); ring( out, toe, 4700 * v, 0.04, 0.03 ); break;
		case 'water':
			burst( out, 0, random, 600 * v, 0.7, 0.6, 0.05, 0.015 ); burst( out, Math.floor( toe * 1.5 ), random, 1400 * v, 0.9, 0.7, 0.09, 0.02 );
			burst( out, 0, random, 180 * k, 1, 0.5, 0.04 ); break;
		default: // stone
			burst( out, 0, random, 180 * k * v, 1, 1, 0.02 / k ); burst( out, toe, random, 3000 * v, 1.5, 0.3, 0.02 ); burst( out, 0, random, 900 * v, 1.2, 0.25, 0.012 );

	}
	return level( out, heavy ? 0.85 : 0.7 );

}

/**
 * Something hard striking a surface (a nail, an axe, a landing): stone chips, metal pings, wood knocks, ground thuds,
 * glass tinks, water splashes. Played quietly under the game's own sound, never instead of it.
 *
 * @param {string} material one of s_material.js's MATERIALS
 * @param {number} variant 1..3
 * @returns {Float32Array}
 */
export function SYNTH_Hit( material, variant ) {

	const random = SYNTH_Random( 0x417 + variant * 1543 + material.length * 104729 ), v = 0.9 + random() * 0.2;
	const out = new Float32Array( Math.floor( SYNTH_RATE * ( material === 'metal' ? 0.5 : 0.25 ) ) );
	switch ( material ) {

		case 'metal':
			ring( out, 0, 1240 * v, 0.5, 0.16 ); ring( out, 0, 2930 * v, 0.3, 0.11 ); ring( out, 0, 4380 * v, 0.18, 0.07 ); burst( out, 0, random, 3500, 1.5, 0.4, 0.006 ); break;
		case 'wood':
			burst( out, 0, random, 340 * v, 2, 1, 0.03 ); ring( out, 0, 700 * v, 0.3, 0.035 ); burst( out, 0, random, 2600, 1.5, 0.3, 0.008 ); break;
		case 'ground':
			burst( out, 0, random, 150 * v, 0.8, 1, 0.045 ); burst( out, 0, random, 1200 * v, 1, 0.3, 0.02 ); break;
		case 'glass':
			ring( out, 0, 3300 * v, 0.5, 0.06 ); ring( out, 0, 4900 * v, 0.35, 0.045 ); burst( out, 0, random, 4200, 2, 0.3, 0.01 ); break;
		case 'water':
			burst( out, 0, random, 900 * v, 0.8, 1, 0.07, 0.008 ); burst( out, 0, random, 2400 * v, 1, 0.5, 0.05, 0.01 ); break;
		default: // stone
			burst( out, 0, random, 2600 * v, 1.2, 1, 0.025 ); burst( out, 0, random, 260 * v, 1, 0.6, 0.03 ); burst( out, Math.floor( SYNTH_RATE * 0.012 ), random, 4200, 2, 0.25, 0.015 );

	}
	return level( out, 0.7 );

}

for ( const m of [ 'stone', 'metal', 'wood', 'ground', 'glass', 'water' ] ) {

	for ( let n = 1; n <= 4; n ++ ) {

		SYNTH_Define( `quaked/step_${m}${n}.wav`, () => SYNTH_Wav( SYNTH_Step( m, n ) ) );
		SYNTH_Define( `quaked/steph_${m}${n}.wav`, () => SYNTH_Wav( SYNTH_Step( m, n, true ) ) );

	}
	for ( let n = 1; n <= 3; n ++ ) SYNTH_Define( `quaked/hit_${m}${n}.wav`, () => SYNTH_Wav( SYNTH_Hit( m, n ) ) );

}
