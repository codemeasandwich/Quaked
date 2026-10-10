// Real ripples (card [W1]): the wave fields of r_waves.js. What the owner asked for, as properties of the simulation: a ripple
// spreads at the water's speed, comes back off the pool's side, ripples add up where they meet, a portal's ripples are held by
// its frame; and the bookkeeping: fields are reused and capped, die away, and go when switched off, in Classic, or when the clock
// jumps back. The shaders that draw them were checked in the browser (docs/impact-ripples-2026-10-09.md).
await import( '../src/gl_rsurf.js' ); // (the renderer's module graph in its safe order)
import * as vars from '../src/engine/common/cvar.js';
import { cvar_t } from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import * as ir from '../src/r_impactripples.js';
import * as w from '../src/r_waves.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), ir.r_impactripples ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// open water below z = 0; `wall` puts solid rock beyond x = wall
let wall = Infinity;
const contents = p => p[ 0 ] > wall ? - 2 : p[ 2 ] < 0 ? - 3 : - 1;
w.R_WavesSetup( { contents } );
const fresh = ( t = 10 ) => { w.R_WavesReset(); w.R_WavesFrame( t ); };
const run = ( from, to, each ) => { for ( let t = from; t <= to + 1e-9; t += 1 / 60 ) { w.R_WavesFrame( t ); if ( each ) each( t ); } };
const at = ( f, x, y ) => { const i = Math.floor( ( x - f.origin[ 0 ] ) / f.cell ), j = Math.floor( ( y - f.origin[ 1 ] ) / f.cell ); return f.h[ j * f.nx + i ]; };

Deno.test( 'a ripple spreads at the water\'s speed, a train of crests behind its front', () => {
	wall = Infinity; fresh();
	const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 );
	run( 10, 11 );
	// after a second the leading edge has run the water's speed (plus the dent's own width), and the crests, which travel a little
	// slower than the front (the train spreads out, as on real water), are behind it
	let edge = 0, crest = 0, most = 0, crests = 0, last = 0;
	for ( let x = 10; x < 180; x += 1 ) { const h = at( f, x, 0 ); if ( Math.abs( h ) > .02 ) edge = x; if ( Math.abs( h ) > most ) { most = Math.abs( h ); crest = x; } if ( h > .02 && last <= .02 ) crests ++; last = h; }
	check( edge > w.WATER.speed * .9 && edge < w.WATER.speed + 4 * w.WATER.radius + 10, `the leading edge after a second: at ${edge} (speed ${w.WATER.speed})` );
	check( crest > w.WATER.speed * .6 && crest < edge, `the strongest crest behind it: at ${crest}` );
	check( crests >= 2, `a train of crests, not one ring: ${crests}` );
} );

Deno.test( 'a ripple comes back off the pool\'s side', () => {
	// a point 24 units on the far side of the impact from a wall 30 units off. The water is the same in both runs until the wall
	// has had time to send something back (the scheme's fastest signal is a cell a step), and then the echo is the difference
	const trace = ( withWall ) => {
		wall = withWall ? 30 : Infinity; fresh();
		const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 ), out = [];
		run( 10, 12, () => out.push( at( f, - 24, 0 ) ) );
		return out;
	};
	const open = trace( false ), walled = trace( true ), diff = walled.map( ( h, i ) => Math.abs( h - open[ i ] ) );
	const step = 1 / 60, early = diff.slice( 0, Math.floor( .3 / step ) ), late = diff.slice( Math.floor( ( 84 / w.WATER.speed - .3 ) / step ) );
	check( Math.max( ...early ) === 0, `nothing comes back before the wall could answer: ${Math.max( ...early )}` );
	check( Math.max( ...late ) > .05, `the echo arrives (30 + 30 + 24 units on): ${Math.max( ...late ).toFixed( 3 )}` );
	wall = Infinity;
} );

Deno.test( 'ripples add up where they meet (two impacts are the sum of each alone)', () => {
	wall = 40; // (with a wall, so the echoes are in it too)
	// (every run makes its field at the first point, so the grids are the same; a hit left out is a whisper, 1e-9 strong)
	const field = ( sa, sb ) => { fresh(); const f = w.R_WaveImpact( 0, - 20, 0, 0, sa, 10 ); w.R_WaveImpact( 0, 10, 15, 0, sb, 10 ); run( 10, 11.2 ); return Float32Array.from( f.h ); };
	const a = field( 1, 1e-9 ), b = field( 1e-9, .7 ), both = field( 1, .7 );
	let worst = 0, size = 0;
	for ( let k = 0; k < both.length; k ++ ) { worst = Math.max( worst, Math.abs( both[ k ] - a[ k ] - b[ k ] ) ); size = Math.max( size, Math.abs( both[ k ] ) ); }
	check( size > .05 && worst < 1e-4 * Math.max( 1, size ), `superposition: off by ${worst} of ${size}` );
	wall = Infinity;
} );

Deno.test( 'a portal\'s ripples are held by its outline: a ring\'s corners never move, and they come back off the frame', () => {
	fresh();
	// a round window (an octagon) in the plane x = 100, 96 across, centred at y 0, z 48
	const ring = Array.from( { length: 8 }, ( _, k ) => [ 100, 48 * Math.cos( k * Math.PI / 4 + Math.PI / 8 ), 48 + 48 * Math.sin( k * Math.PI / 4 + Math.PI / 8 ) ] );
	const plane = { normal: [ - 1, 0, 0 ], center: [ 100, 0, 48 ], min: [ 100, - 48, 0 ], max: [ 100, 48, 96 ], polygons: [ ring ] };
	const f = w.R_WaveImpact( 1, 100, 10, 60, 1, 10, plane );
	same( f.kind, 1, 'a metal field' );
	const k = ( u, v ) => { const s = Math.floor( ( ( 100 - f.origin[ 0 ] ) * f.U[ 0 ] + ( u - f.origin[ 1 ] ) * f.U[ 1 ] ) / f.cell ), t = Math.floor( ( v - f.origin[ 2 ] ) / f.cell ); return t * f.nx + s; };
	same( f.mask[ k( 0, 48 ) ], 1, 'the middle is the window' );
	same( f.mask[ k( 40, 8 ) ] + f.mask[ k( - 40, 88 ) ], 0, 'the corners of the box are outside the ring' );
	let moved = 0, late = 0;
	run( 10, 11, t => { moved = Math.max( moved, Math.abs( f.h[ k( 40, 8 ) ] ), Math.abs( f.h[ k( - 40, 88 ) ] ) ); if ( t > 10.6 ) late = Math.max( late, Math.abs( f.h[ k( 0, 48 ) ] ) ); } );
	same( moved, 0, 'the frame holds the sheet' );
	check( late > .01, `the waves are still crossing the middle after 0.6 s (they came back off the frame): ${late}` );
	// the same window hit again: the same field
	same( w.R_WaveImpact( 1, 100, - 10, 40, 1, 11, plane ), f, 'one field per window' );
} );

Deno.test( 'the water\'s cells are the pool\'s: rock and dry ground are not, and a cell under a wall stays still', () => {
	wall = 30; fresh();
	const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 );
	const cell = ( x, y ) => f.mask[ Math.floor( ( y - f.origin[ 1 ] ) / f.cell ) * f.nx + Math.floor( ( x - f.origin[ 0 ] ) / f.cell ) ];
	same( cell( 0, 0 ), 1, 'water' ); same( cell( 60, 0 ), 0, 'rock' );
	let still = 0; run( 10, 11, () => { still = Math.max( still, Math.abs( at( f, 60, 0 ) ) ); } );
	same( still, 0, 'the rock never moves' );
	wall = Infinity;
} );

Deno.test( 'fields: shared by nearby hits, capped (the quietest goes), dropped once still, and the texture carries the heights', () => {
	wall = Infinity; fresh();
	const a = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 );
	same( w.R_WaveImpact( 0, 40, 30, 0, 1, 10 ), a, 'a hit near the first shares its field' );
	same( w.R_WaveImpact( 0, 0, 0, - 40, 1, 10 ) === a, false, 'a hit on water at another height does not' );
	for ( let i = 1; i <= 4; i ++ ) w.R_WaveImpact( 0, i * 1000, 0, 0, 1, 10 );
	same( w.R_WaveFields().filter( f => f.kind === 0 ).length, w.WATER.fields, 'water fields are capped' );
	same( w.R_WaterWavesLive(), w.WATER.fields, 'and counted live' );
	// the heights reach the texture (half floats), and the slots describe the fields
	run( 10, 10.3 );
	const f = w.R_WaveFields()[ 0 ], data = w.R_WaveTexture().image.data, row = w.SIZE * ( w.WATER.fields + w.METAL.fields );
	const half = u => { const e = ( u >> 10 ) & 31, m = u & 1023, s = u & 0x8000 ? - 1 : 1; return e === 0 ? s * m * 2 ** - 24 : s * ( 1 + m / 1024 ) * 2 ** ( e - 15 ); };
	let worst = 0, biggest = 0;
	for ( let j = 0; j < f.ny; j ++ ) for ( let i = 0; i < f.nx; i ++ ) { const h = f.h[ j * f.nx + i ]; biggest = Math.max( biggest, Math.abs( h ) ); worst = Math.max( worst, Math.abs( half( data[ j * row + f.slot * w.SIZE + i ] ) - h ) ); }
	check( biggest > .05 && worst < 2e-3 * biggest + 1e-4, `the texture holds the heights: off by ${worst} of ${biggest}` );
	same( w.waterWave[ f.slot * 4 + 3 ], f.cell, 'the slot says the cell size' ); same( w.waterWave[ f.slot * 4 ], f.origin[ 0 ], 'and the corner' );
	// still water: dropped, its slot cleared
	run( 10.3, 30 );
	same( w.R_WaveFields().length, 0, 'every field died away' ); same( w.R_WaterWavesLive(), 0, 'none live' );
	check( w.waterWave.every( v => v === 0 ), 'the slots are cleared' );
} );

Deno.test( 'the hits come from the impact detector; switched off, Classic, or a clock that jumps back clears them', () => {
	wall = Infinity; fresh();
	ir.R_ImpactRipplesSetup( { contents, portals: () => [ door ] } ); ir.R_ImpactRippleListen( w.R_WaveImpact );
	const door = { normal: [ 1, 0, 0 ], center: [ 500, 0, 48 ], min: [ 500, - 32, 0 ], max: [ 500, 32, 96 ] };
	try {
		same( ir.R_ImpactSegment( 100, 0, 30, 100, 0, - 30, 10, 1 ), 1, 'a shot into the water' );
		same( ir.R_ImpactSegment( 400, 10, 50, 600, 10, 50, 10, 1 ), 1, 'a shot through the window' );
		same( w.R_WaveFields().map( f => f.kind ).sort().join(), '0,1', 'a water field and a metal one' );
		same( w.R_WaveFields().find( f => f.kind === 1 ).key, door, 'the metal one is the window\'s' );
		vars.Cvar_SetValue( 'r_impactripples', 0 ); same( w.R_WavesFrame( 10.1 ), 0, 'switched off: nothing live' ); same( w.R_WaveFields().length, 0, 'and the fields go' ); vars.Cvar_SetValue( 'r_impactripples', 1 );
		ir.R_ImpactSegment( 100, 0, 30, 100, 0, - 30, 10.2, 1 ); w.R_WavesFrame( 10.2 );
		R_AnimSetClassicPass( true ); same( w.R_WavesFrame( 10.3 ), 0, 'Classic: nothing live' ); R_AnimSetClassicPass( false );
		w.R_WaveImpact( 0, 0, 0, 0, 1, 50 ); w.R_WavesFrame( 50.1 ); same( w.R_WaveFields().length, 1, 'live' );
		w.R_WavesFrame( 3 ); same( w.R_WaveFields().length, 0, 'the clock went back: gone' );
		w.R_WavesSetup( null ); same( w.R_WaveImpact( 0, 0, 0, 0, 1, 3 ), null, 'nothing set up: no field' ); w.R_WavesSetup( { contents } );
		same( w.R_WaveImpact( 1, 0, 0, 0, 1, 3 ), null, 'a metal hit with no window: no field' );
	} finally { ir.R_ImpactRippleListen( null ); }
} );

// (review: properties a plausible wrong version would still have passed above)
Deno.test( 'a pool\'s side reflects as water does: the same as a mirror-image hit beyond it (not turned over)', () => {
	// the wall's face is at x = 30 (a cell boundary); water at a wall is level across it, so the walled pool is exactly the open
	// pool with a second, equal hit mirrored at x = 60, on the near side of the wall
	const trace = ( walled ) => {
		wall = walled ? 30 : Infinity; fresh();
		const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 );
		if ( ! walled ) w.R_WaveImpact( 0, 60, 0, 0, 1, 10 );
		const out = []; run( 10, 11.2, () => { for ( const x of [ - 30, 0, 15, 27 ] ) out.push( at( f, x, 0 ), at( f, x, 20 ) ); } );
		return out;
	};
	const walled = trace( true ), mirror = trace( false );
	let worst = 0, size = 0; walled.forEach( ( h, i ) => { worst = Math.max( worst, Math.abs( h - mirror[ i ] ) ); size = Math.max( size, Math.abs( h ) ); } );
	check( size > .1 && worst < 1e-3 * size, `the wall is a mirror: off by ${worst} of ${size}` );
	wall = Infinity;
} );

// (a free edge is where a sheet swings most, about 1.7 times the middle here; a held one no more than the middle, 1.1 here)
Deno.test( 'a portal\'s frame holds the sheet: beside the frame the metal swings no more than inside (a free edge would swing most)', () => {
	fresh();
	const plane = { normal: [ 1, 0, 0 ], center: [ 0, 0, 48 ], min: [ 0, - 48, 0 ], max: [ 0, 48, 96 ] };
	const f = w.R_WaveImpact( 1, 0, 0, 48, 1, 10, plane );
	const cell = ( i, j ) => f.h[ j * f.nx + i ];
	let edge = 0, inside = 0, mid = Math.floor( f.ny / 2 );
	run( 10, 10.8, () => { edge = Math.max( edge, Math.abs( cell( 1, mid ) ) ); inside = Math.max( inside, Math.abs( cell( 8, mid ) ) ); } );
	check( inside > .05 && edge < inside * 1.35, `held at the frame: ${edge.toFixed( 3 )} beside it against ${inside.toFixed( 3 )} inside` );
} );

Deno.test( 'a hit: a crater that adds no water, its rebound a moment later, and the waves lose what WATER.keep says', () => {
	wall = Infinity; fresh();
	const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 );
	let net = 0, moved = 0; for ( const h of f.h ) { net += h; moved += Math.abs( h ); }
	check( moved > 10 && Math.abs( net ) < moved * 1e-3, `the crater's rim holds what it pushed out: net ${net} of ${moved}` );
	same( f.pending.length, 1, 'the rebound is waiting' ); run( 10, 10 + w.WATER.jet.delay + .05 ); same( f.pending.length, 0, 'and has come' );
	// a window's sheet (no sponge, no rebound): its energy a second on is keep squared of what it was (within 25%)
	fresh();
	const g = w.R_WaveImpact( 1, 0, 0, 48, 1, 10, { normal: [ 1, 0, 0 ], center: [ 0, 0, 48 ], min: [ 0, - 60, 0 ], max: [ 0, 60, 120 ] } );
	const energy = () => { let e = 0; for ( let j = 1; j < g.ny - 1; j ++ ) for ( let i = 1; i < g.nx - 1; i ++ ) { const k = j * g.nx + i, v = g.h[ k ] - g.p[ k ], dx = g.h[ k + 1 ] - g.h[ k ], dy = g.h[ k + g.nx ] - g.h[ k ]; e += v * v + g.C2 * ( dx * dx + dy * dy ); } return e; };
	run( 10, 10.3 ); const e0 = energy(); run( 10.3 + 1 / 60, 11.3 ); const ratio = energy() / e0;
	check( Math.abs( ratio / ( w.METAL.keep ** 2 ) - 1 ) < .25, `a second's loss: ${ratio.toFixed( 3 )} for keep ${w.METAL.keep}` );
} );

Deno.test( 'the bookkeeping the shaders depend on: the quietest field goes, a reused slot is cleared, the texture is marked, the shore and the half floats', () => {
	wall = Infinity; fresh();
	const strengths = [ 1, .2, .9, .8 ], made = strengths.map( ( s, i ) => w.R_WaveImpact( 0, i * 1000, 0, 0, s, 10 ) );
	run( 10, 10.5 );
	const quietest = made.reduce( ( a, b ) => a.peak < b.peak ? a : b );
	same( quietest, made[ 1 ], 'the weakest hit is the quietest field' );
	const fifth = w.R_WaveImpact( 0, 9000, 0, 0, 1, 10.5 );
	same( fifth.slot, quietest.slot, 'a fifth takes the quietest one\'s slot' ); same( w.R_WaveFields().includes( quietest ), false, 'and it is gone' );
	// a window's field in a slot a bigger window had: nothing of the old one is left in the texture
	fresh();
	const big = { normal: [ 1, 0, 0 ], center: [ 0, 0, 96 ], min: [ 0, - 96, 0 ], max: [ 0, 96, 192 ] };
	const planes = [ 0, 1, 2, 3 ].map( i => ( { ...big, center: [ i * 500, 0, 96 ], min: [ i * 500, - 96, 0 ], max: [ i * 500, 96, 192 ] } ) );
	for ( const p of planes ) w.R_WaveImpact( 1, p.center[ 0 ], 0, 96, 1, 10, p );
	run( 10, 10.3 );
	const small = w.R_WaveImpact( 1, 3000, 0, 40, 1, 10.3, { normal: [ 1, 0, 0 ], center: [ 3000, 0, 40 ], min: [ 3000, - 16, 0 ], max: [ 3000, 16, 80 ] } );
	const data = w.R_WaveTexture().image.data, row = w.SIZE * ( w.WATER.fields + w.METAL.fields );
	let left = 0; for ( let j = 0; j < w.SIZE; j ++ ) for ( let i = 0; i < w.SIZE; i ++ ) if ( ( i >= small.nx || j >= small.ny ) && data[ j * row + small.slot * w.SIZE + i ] !== 0 ) left ++;
	same( left, 0, 'the reused slot was cleared' );
	same( w.R_WaterWavesLive(), 0, 'window fields are not water fields' );
	// the texture is marked for the GPU when the fields move
	const before = w.R_WaveTexture().version; run( 10.3 + 1 / 60, 10.4 ); check( w.R_WaveTexture().version > before, 'the texture is sent again' );
	// the shore: a cell beside the water holds its water neighbours' level (no false slope at the pool's side), and the heights are
	// rounded to the nearest half float
	wall = 30; fresh();
	const f = w.R_WaveImpact( 0, 0, 0, 0, 1, 10 ); run( 10, 10.6 );
	const half = u => { const e = ( u >> 10 ) & 31, m = u & 1023, s = u & 0x8000 ? - 1 : 1; return e === 0 ? s * m * 2 ** - 24 : s * ( 1 + m / 1024 ) * 2 ** ( e - 15 ); };
	const tex = w.R_WaveTexture().image.data;
	const iw = Math.floor( ( 30 - f.origin[ 0 ] ) / f.cell ), j = 64; // the first rock cell on row 64
	const shore = half( tex[ j * row + f.slot * w.SIZE + iw ] ), beside = f.h[ j * f.nx + iw - 1 ];
	check( Math.abs( beside ) > .01 && Math.abs( shore - beside ) <= Math.abs( beside ) * 2 ** - 10, `the shore cell holds the water's level: ${shore} for ${beside}` );
	let worst = 0;
	for ( let k = 0; k < f.h.length; k ++ ) { if ( ! f.mask[ k ] ) continue; const h = f.h[ k ]; if ( Math.abs( h ) < 2 ** - 14 ) continue; worst = Math.max( worst, Math.abs( half( tex[ Math.floor( k / f.nx ) * row + f.slot * w.SIZE + k % f.nx ] ) - h ) / Math.abs( h ) ); }
	check( worst <= 2 ** - 11 * 1.001, `rounded, not cut: worst ${worst} (half a step is ${2 ** - 11})` );
	wall = Infinity;
} );

Deno.test( 'with the water optics off (r_newer_water 0) a hit on the water makes no field', () => {
	fresh(); w.R_WavesSetup( { contents, waterOn: () => false } );
	try { same( w.R_WaveImpact( 0, 0, 0, 0, 1, 10 ), null, 'no field' ); same( w.R_WaveFields().length, 0, 'none live' ); }
	finally { w.R_WavesSetup( { contents } ); }
} );
