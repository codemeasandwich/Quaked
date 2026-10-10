// The lightning gun's beam (card [30a]): the supplied ribbons built between the real muzzle and the server's hit point, the
// hood's root recessed into the gun, the electrode arcs at the muzzle, a light at the hit; nothing once the beam is over; none
// in Classic. The beam's choice of event (the player's own TE_LIGHTNING2 only) is tested with cl_tent below.
await import( '../src/gl_rsurf.js' );
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import { cvar_t } from '../src/engine/common/cvar.js';
import { R_AnimSetClassicPass } from '../src/r_anim.js';
import * as L from '../src/r_lightning.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
for ( const c of [ new cvar_t( 'r_hdr', '1' ), L.r_newer_lightning ] ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
vars.Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetClassicPass( false );

// the eye at the origin looking along +x (Quake's forward), the gun's muzzle a little ahead, right and below, the hit 300 ahead
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 90, 1.6, 1, 4096 );
camera.up.set( 0, 0, 1 ); camera.position.set( 0, 0, 0 ); camera.lookAt( 1, 0, 0 ); camera.updateMatrixWorld();
const gunMatrix = new THREE.Matrix4(); // (Quake's gun: +x forward, +y left, +z up: the identity here)
const muzzle = [ 18, - 4, - 6 ], end = [ 300, 10, 20 ];
let beam = { end }, lights = [];
L.R_LightningSetup( { scene, camera: () => camera, muzzle: () => ( { point: muzzle, matrix: gunMatrix } ), beam: () => beam, allocDlight: key => { const d = { key, origin: [ 0, 0, 0 ], radius: 0, die: 0, decay: 0 }; lights.push( d ); return d; } } );
const mesh = () => scene.getObjectByName( 'quake_lightning' );
function points() { const m = mesh(), d = m.geometry.attributes.position.data.array, n = m.geometry.drawRange.count, out = []; for ( let i = 0; i < n; i ++ ) out.push( { p: [ d[ i * 9 ], d[ i * 9 + 1 ], d[ i * 9 + 2 ] ], kind: d[ i * 9 + 6 ], local: d[ i * 9 + 8 ], power: d[ i * 9 + 5 ] } ); return out; }
const dist = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] );

Deno.test( 'a live beam is the supplied ribbons from the true muzzle to the hit point, with its hood recessed into the gun and a light at the hit', () => {
	L.R_LightningClear(); for ( let t = 10; t <= 10.3; t += 1 / 60 ) L.R_LightningFrame( t );
	const v = points(); check( v.length > 1000, 'many ribbon vertices: ' + v.length ); check( v.every( q => q.p.every( Number.isFinite ) ), 'all finite' ); same( mesh().visible, true, 'drawn' );
	const main = v.filter( q => q.kind === 0 );
	check( Math.min( ...main.map( q => dist( q.p, muzzle ) ) ) < 2, 'the main channel starts at the muzzle' );
	check( Math.min( ...main.map( q => dist( q.p, end ) ) ) < 2, 'and reaches the hit point' );
	const hood = v.filter( q => q.kind === 1 && q.local === 0 );
	check( hood.length > 0 && hood.every( q => q.p[ 0 ] < muzzle[ 0 ] - 1 ), 'the hood\'s root is behind the muzzle, inside the gun (recessed)' );
	const arcs = v.filter( q => q.kind === 2 && dist( q.p, muzzle ) < 12 );
	check( arcs.length > 0, 'electrode arcs and leaders at the muzzle' );
	const light = lights.at( - 1 ); check( light && dist( light.origin, end ) < 1e-6 && light.radius > 0, 'a light at the hit' );
} );

Deno.test( 'the beam is the server\'s: no beam, nothing drawn; the ribbons move with the clock; Classic and the switch draw none', () => {
	L.R_LightningClear(); L.R_LightningFrame( 20 ); L.R_LightningFrame( 20.1 ); const a = points().slice( 0, 50 ).map( q => q.p.join() ).join();
	L.R_LightningFrame( 20.3 ); const b = points().slice( 0, 50 ).map( q => q.p.join() ).join(); check( a !== b, 'the channel moves' );
	beam = null; L.R_LightningFrame( 20.35 ); same( mesh().visible, false, 'the server\'s beam is over: nothing' ); same( L.lightningStats.floats, 0, 'and nothing built' );
	beam = { end };
	R_AnimSetClassicPass( true ); L.R_LightningFrame( 20.4 ); same( mesh().visible, false, 'Classic: none (the native bolts)' ); R_AnimSetClassicPass( false );
	vars.Cvar_SetValue( 'r_newer_lightning', 0 ); L.R_LightningFrame( 20.45 ); same( mesh().visible, false, 'switched off: none' ); vars.Cvar_SetValue( 'r_newer_lightning', 1 );
	L.R_LightningFrame( 20.5 ); same( mesh().visible, true, 'and back' );
	L.R_LightningClear(); same( mesh(), undefined, 'cleared with the level: out of the scene' );
} );

Deno.test( 'the supplied noise texture: the source\'s own generator, seed 897234, 256 by 256', () => {
	const t = L.R_LightningNoise(), r = L.rng( 897234 );
	same( t.image.width, 256, 'size' ); for ( let i = 0; i < 8; i ++ ) same( t.image.data[ i ], Math.floor( r() * 256 ), 'byte ' + i );
} );

// the event: only the player's own lightning gun beam (TE_LIGHTNING2 from the view entity) is taken; its bolt models are
// marked for the Newer pass to leave out (R_DrawEntitiesOnList), the Classic pass keeps them; the Shambler's are not marked
Deno.test( 'only the player\'s own TE_LIGHTNING2 is taken, and only its native bolts are marked to be left out, in the Newer pass alone', async () => {
	const client = await import( '../src/engine/client/client.js' ), tent = await import( '../src/engine/client/cl_tent.js' );
	const { cl, cl_beams, cl_entities } = client;
	cl.viewentity = 1; cl.mtime[ 0 ] = 10; if ( ! cl_entities[ 1 ] ) throw new Error( 'no client entity 1' ); cl_entities[ 1 ].origin.set( [ 0, 0, 0 ] );
	for ( const b of cl_beams ) { b.model = null; b.endtime = 0; }
	const setBeam = ( i, entity, name, endAt ) => { const b = cl_beams[ i ]; b.entity = entity; b.model = { name }; b.endtime = 10.2; b.start.set( [ 0, 0, 0 ] ); b.end.set( endAt ); };
	setBeam( 0, 1, 'progs/bolt2.mdl', [ 300, 0, 0 ] ); setBeam( 1, 5, 'progs/bolt.mdl', [ 0, 300, 0 ] );
	same( tent.CL_PlayerLightning()?.end.join(), '300,0,0', 'the player\'s own beam' );
	cl_beams[ 0 ].entity = 7; same( tent.CL_PlayerLightning(), null, 'another entity\'s TE_LIGHTNING2 is not the player\'s' ); cl_beams[ 0 ].entity = 1;
	cl_beams[ 0 ].model = { name: 'progs/bolt3.mdl' }; same( tent.CL_PlayerLightning(), null, 'the player\'s bolt3 (not the lightning gun) is not taken' ); cl_beams[ 0 ].model = { name: 'progs/bolt2.mdl' };
	cl.mtime[ 0 ] = 10.3; same( tent.CL_PlayerLightning(), null, 'over at its server time' ); cl.mtime[ 0 ] = 10;
	client.set_cl_numvisedicts( 0 ); tent.CL_UpdateTEnts();
	const added = client.cl_visedicts.slice( 0, client.cl_numvisedicts ), mine = added.filter( e => e._playerLightning === true );
	check( mine.length > 0 && mine.every( e => e.model.name === 'progs/bolt2.mdl' ), 'the player\'s bolts are added (for the Classic pass) and marked: ' + mine.length );
	check( added.some( e => e.model.name === 'progs/bolt.mdl' && e._playerLightning === false ), 'the Shambler\'s are added unmarked' );
	L.R_LightningClear(); same( L.R_LightningTakesBeam(), false, 'nothing held yet: the bolts are drawn' );
	beam = { end: [ 300, 0, 0 ] }; L.R_LightningFrame( 30 ); same( L.R_LightningTakesBeam(), true, 'the gun held and a beam: drawn here, the marked bolts left out' );
	R_AnimSetClassicPass( true ); same( L.R_LightningTakesBeam(), false, 'the Classic pass (half the title demo\'s split) draws the bolts' ); R_AnimSetClassicPass( false );
	beam = null; same( L.R_LightningTakesBeam(), false, 'the beam over: none to leave out' ); beam = { end };
	for ( const b of cl_beams ) { b.model = null; b.endtime = 0; } L.R_LightningClear();
} );

// review of [30a]: a gun turned away from the view and set off from it, so the gun's frame and the view's differ
Deno.test( 'built in the right frames: the hood recessed along the gun\'s own axes, every strip facing the eye, the channel spaced evenly on the screen, the hood\'s tuned strength, the power ramp and the light', () => {
	const turned = new THREE.Matrix4().makeRotationZ( 30 * Math.PI / 180 ).setPosition( 18, - 4, - 6 );
	const e = turned.elements, fwd = [ e[ 0 ], e[ 1 ], e[ 2 ] ], up = [ e[ 8 ], e[ 9 ], e[ 10 ] ];
	const save = beam; beam = { end };
	const setup = matrix => L.R_LightningSetup( { scene, camera: () => camera, muzzle: () => ( { point: muzzle, matrix } ), beam: () => beam, allocDlight: key => { const d = { key, origin: [ 0, 0, 0 ], radius: 0, die: 0, decay: 0 }; lights.push( d ); return d; } } );
	setup( turned ); L.R_LightningClear(); L.R_LightningFrame( 40 );
	const m = mesh(), d = m.geometry.attributes.position.data.array, at = i => [ d[ i * 9 ], d[ i * 9 + 1 ], d[ i * 9 + 2 ] ];
	let n = m.geometry.drawRange.count;
	const firstMain = ( () => { for ( let i = 0; i < n; i ++ ) if ( d[ i * 9 + 6 ] === 0 ) return d[ i * 9 + 5 ]; } )();
	check( Math.abs( firstMain - .05 * .9 ) < 1e-6, 'the first frame: the source\'s power ramp starts low (' + firstMain + ')' );
	for ( let t = 40; t <= 40.5; t += 1 / 60 ) L.R_LightningFrame( t );
	n = m.geometry.drawRange.count;
	// the hood's root: PLASMA_HOOD_OFFSET ( 0, -.08, .24 ) in the gun's frame (x right, y up, z back), K = 12
	const expect = [ 0, 1, 2 ].map( k => muzzle[ k ] - .08 * 12 * up[ k ] - .24 * 12 * fwd[ k ] );
	let hoodRoot = null, mainA = null, hoodA = null;
	for ( let i = 0; i + 1 < n; i += 6 ) {
		const kind = d[ i * 9 + 6 ];
		if ( kind === 1 && d[ i * 9 + 8 ] === 0 && hoodRoot === null ) { const a = at( i ), b = at( i + 1 ); hoodRoot = a.map( ( x, k ) => ( x + b[ k ] ) / 2 ); hoodA = d[ i * 9 + 5 ]; }
		if ( kind === 0 && mainA === null ) mainA = d[ i * 9 + 5 ];
	}
	check( hoodRoot && dist( hoodRoot, expect ) < 1e-3, 'the hood\'s root is recessed along the gun\'s own axes: ' + hoodRoot + ' vs ' + expect );
	check( Math.abs( hoodA / mainA - .73 * L.lightningTune.hood / .9 ) < 1e-3, 'the hood at its tuned strength (' + hoodA / mainA + ')' );
	check( mainA > .8, 'risen to full power (' + mainA + ')' );
	// every strip's width lies across the line of sight
	const eye = [ 0, 0, 0 ];
	for ( let i = 0; i + 1 < n; i += 6 ) {
		const a = at( i ), b = at( i + 1 ), c = a.map( ( x, k ) => ( x + b[ k ] ) / 2 ), w = b.map( ( x, k ) => x - a[ k ] ), v = eye.map( ( x, k ) => x - c[ k ] );
		const lw = Math.hypot( ...w ), lv = Math.hypot( ...v ); if ( lw < 1e-6 ) continue;
		check( Math.abs( ( w[ 0 ] * v[ 0 ] + w[ 1 ] * v[ 1 ] + w[ 2 ] * v[ 2 ] ) / lw / lv ) < 1e-3, 'strip ' + i / 6 + ' faces the eye' );
	}
	// the main channel's points, evenly spaced on the screen (the source's depth spacing), not evenly in the world
	const centres = []; for ( let i = 0; i + 1 < n; i += 6 ) if ( d[ i * 9 + 6 ] === 0 ) { const a = at( i ), b = at( i + 1 ); centres.push( a.map( ( x, k ) => ( x + b[ k ] ) / 2 ) ); }
	const screen = centres.map( p => new THREE.Vector3( ...p ).project( camera ) ), axis = new THREE.Vector2( screen.at( - 1 ).x - screen[ 0 ].x, screen.at( - 1 ).y - screen[ 0 ].y ).normalize();
	const steps = screen.slice( 1 ).map( ( p, i ) => ( p.x - screen[ i ].x ) * axis.x + ( p.y - screen[ i ].y ) * axis.y );
	const median = a => a.slice().sort( ( x, y ) => x - y )[ a.length >> 1 ], near = median( steps.slice( 0, 12 ) ), far = median( steps.slice( - 12 ) );
	check( near / far < 2.5 && far / near < 2.5, 'even on the screen: near ' + near.toFixed( 4 ) + ', far ' + far.toFixed( 4 ) );
	const light = lights.at( - 1 ); same( light.radius, L.LIGHTNING.light.radius, 'the light\'s radius' ); same( light.key, L.LIGHTNING.light.key, 'and its key' );
	beam = save; L.R_LightningClear(); setup( gunMatrix );
} );
