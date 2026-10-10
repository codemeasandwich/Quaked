/**
 * @module newer/gameplay/shotgun_flight
 *
 * A shotgun pellet's flight, from the supplied ARC ShotgunEffect: speed, timing and trail, used by the picture and by
 * the server's damage timing.
 *
 * Owns: constants only (pure functions).
 *
 * Errors: none.
 */
// The flight of a shotgun pellet: the supplied ARC ShotgunEffect's kinematics (arc-weapons-wall-canvas-
// shotgun.html, SHA-256 8b156922...adf, kept local; sgRandom 460, sgDistance / sgTimeAt 463-464, fire 499-545,
// _pelletTrailLength 596), in source units and seconds. Pure: no renderer, no engine state. Used by the
// picture (r_shotgun.js) and by the server, which makes a shotgun's damage arrive when its pellet does
// (sv_shotdelay.js), so both agree to the frame on when a pellet reaches what it hits.
//
// Differences from the source's pellet, by owner direction (8 Oct 2026):
//  * Speed is doubled (air 124, water 68 source units a second; the source has 62 and 34): the picture was
//    arriving visibly after the hit it belonged to.
//  * There is no range cap: a pellet flies all the way to where the game's ray stopped, because the damage
//    now arrives with it. (The source's 30 / 23 unit caps belong to a demo with a wall a few units away.)
//  * A pellet flies in segments, air or water, along its ray (the source has one switch per shot); with one
//    segment it is the source's pellet exactly (tests/shotgun_test.js compares the two).

export const SHOTGUN = Object.freeze( {
	unit: 24,                                  // Quake units per source unit
	speedScale: 2,                             // the owner's doubling of the source's speeds
	airSpeed: 62 * 2, underwaterSpeed: 34 * 2, // SHOTGUN_PELLET_MOTION x speedScale
	drag: .45,                                 // underwater drag, fire() line 513
	trailSeconds: .016, maxTrail: .95,         // SHOTGUN_PELLET_MOTION
	maxPellets: 256, maxBubbles: 1800, maxSmoke: 96, // the source's constructor defaults
	muzzleBubbles: 4,                          // fire(): four small bubbles escape each barrel under water
	smokePerBarrel: 3,                         // fire(): three tiny delayed wisps per barrel in air
	smokeRise: .5,                             // owner's tuning (8 Oct 2026): the smoke climbs half as high as the source's (its .18 a second, and the .035 + .05 a stretch)
	wakeLimit: 2.4,                            // update(): a wake bubble older than this when emitted is skipped
	seed: 84391                                // the source's default seed (cosmetic randomness only)
} );

// sgRandom, line 460
export const sgRandom = seed => { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = Math.imul( s ^ s >>> 15, 1 | s ); t ^= t + Math.imul( t ^ t >>> 7, 61 | t ); return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296; }; };

export const clamp = ( x, a, b ) => Math.max( a, Math.min( b, x ) );
// sgDistance / sgTimeAt for one regime (speed v, drag k), distance relative to the regime's start
const regimeDistance = ( v, k, t ) => k > 0 ? v * ( - Math.expm1( - k * t ) ) / k : v * t;
const regimeTime = ( v, k, d ) => k > 0 ? - Math.log1p( - Math.min( .999999, d * k / v ) ) / k : d / v;

// A pellet flies through consecutive segments, each air or water. `waterSpans` are [ from, to ] distances in
// source units along the pellet's path.
function buildSegments( distance, waterSpans, airSpeed, waterSpeed ) {

	const segs = [];
	let d = 0, t = 0;
	const push = ( to, water ) => {

		if ( ! ( to > d ) ) return;
		const v = water ? waterSpeed : airSpeed, k = water ? SHOTGUN.drag : 0, dt = regimeTime( v, k, to - d );
		segs.push( { d0: d, d1: to, t0: t, dt, v, k, water } );
		d = to; t += dt;

	};
	for ( const [ from, to ] of waterSpans ) {

		if ( from >= distance ) break;
		push( Math.min( from, distance ), false );
		push( Math.min( to, distance ), true );

	}
	push( distance, false );
	if ( segs.length === 0 ) segs.push( { d0: 0, d1: distance, t0: 0, dt: regimeTime( airSpeed, 0, distance ), v: airSpeed, k: 0, water: false } );
	return segs;

}

// distance flown (source units) `age` seconds after firing
export function pelletDistance( p, age ) {

	if ( age <= 0 ) return 0;
	for ( const s of p.segs ) if ( age < s.t0 + s.dt ) return Math.min( s.d1, s.d0 + regimeDistance( s.v, s.k, age - s.t0 ) );
	return p.distance;

}
// the time at which the pellet has flown `d`
export function pelletTimeAt( p, d ) {

	for ( const s of p.segs ) if ( d <= s.d1 + 1e-12 ) return s.t0 + regimeTime( s.v, s.k, Math.max( 0, d - s.d0 ) );
	const last = p.segs[ p.segs.length - 1 ];
	return last.t0 + last.dt;

}
export const pelletInWater = ( p, d ) => { for ( const s of p.segs ) if ( d <= s.d1 ) return s.water; return false; };
// _pelletTrailLength, line 596
export function pelletTrailLength( p, age ) {

	const a = clamp( age, 0, p.life ), head = Math.min( p.distance, pelletDistance( p, a ) );
	const tail = pelletDistance( p, Math.max( 0, a - SHOTGUN.trailSeconds ) );
	return clamp( head - tail, 0, SHOTGUN.maxTrail );

}

// A pellet (source units for distances, Quake units for the origin) from `origin` along the unit vector `dir`
// for `distance` source units. `c` are the cosmetic draws of fire(): speed factor, radius, seed, next bubble,
// spacing (pelletDraws).
export function makePellet( { id = 0, barrel = 0, origin, dir, distance, waterSpans = [], underwater = false, born = 0, c } ) {

	const sf = c.speed, air = SHOTGUN.airSpeed * sf, water = SHOTGUN.underwaterSpeed * sf;
	const segs = buildSegments( distance, waterSpans, air, water );
	const p = { id, barrel, origin: [ origin[ 0 ], origin[ 1 ], origin[ 2 ] ], direction: [ dir[ 0 ], dir[ 1 ], dir[ 2 ] ], distance, born, underwater, segs, wet: segs.some( g => g.water ),
		radius: c.radius, seed: c.seed, bubbleIndex: 0, nextBubble: c.nextBubble, spacing: c.spacing, life: 0 };
	p.life = pelletTimeAt( p, distance );
	return p;

}
// the cosmetic draws of one pellet, in the source's order for these fields
export function pelletDraws( random ) {

	return { speed: .93 + random() * .14, radius: .030 + random() * .006, seed: random() * 1000, nextBubble: .11 + random() * .17, spacing: .60 + random() * .24 };

}
// The draws of pellet number `index` of blast `id`: a stream of its own, so the picture and the server's
// schedule give the same speed to the same pellet however many pellets either of them handles.
export const blastBase = id => ( SHOTGUN.seed + id * 7919 ) >>> 0;
export const pelletStream = ( id, index ) => sgRandom( ( blastBase( id ) + index * 104729 ) >>> 0 );

// Seconds a pellet takes to fly `distance` source units from the muzzle: what the server waits before the
// shot's damage lands. `waterSpans` as for makePellet.
export function flightTime( id, index, distance, waterSpans ) {

	const p = makePellet( { origin: [ 0, 0, 0 ], dir: [ 1, 0, 0 ], distance, waterSpans, c: pelletDraws( pelletStream( id, index ) ) } );
	return p.life;

}
