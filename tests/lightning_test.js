// The lightning gun's beam (card [30a]): the supplied ribbons built between the real muzzle and the server's hit point, the
// hood's root recessed into the gun, the electrode arcs at the muzzle, a light at the hit; nothing once the beam is over; none
// in Classic. The beam's choice of event (the player's own TE_LIGHTNING2 only) is tested with cl_tent below.
await import( '../src/gl_rsurf.js' );
import * as THREE from 'three';
import * as vars from '../src/cvar.js';
import { cvar_t } from '../src/cvar.js';
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

// the event: only the player's own lightning gun beam (TE_LIGHTNING2 from the view entity) is taken; its bolt models are not
// added while the beam is drawn here; the Shambler's (TE_LIGHTNING1) stays native
Deno.test( 'only the player\'s own TE_LIGHTNING2 is taken, and only its native bolts are left out', async () => {
	const client = await import( '../src/client.js' ), tent = await import( '../src/cl_tent.js' );
	const { cl, cl_beams, cl_entities } = client;
	cl.viewentity = 1; cl.mtime[ 0 ] = 10; if ( ! cl_entities[ 1 ] ) throw new Error( 'no client entity 1' ); cl_entities[ 1 ].origin.set( [ 0, 0, 0 ] );
	for ( const b of cl_beams ) { b.model = null; b.endtime = 0; }
	const setBeam = ( i, entity, name, endAt ) => { const b = cl_beams[ i ]; b.entity = entity; b.model = { name }; b.endtime = 10.2; b.start.set( [ 0, 0, 0 ] ); b.end.set( endAt ); };
	setBeam( 0, 1, 'progs/bolt2.mdl', [ 300, 0, 0 ] ); setBeam( 1, 5, 'progs/bolt.mdl', [ 0, 300, 0 ] );
	same( tent.CL_PlayerLightning()?.end.join(), '300,0,0', 'the player\'s own beam' );
	cl_beams[ 0 ].entity = 7; same( tent.CL_PlayerLightning(), null, 'another entity\'s TE_LIGHTNING2 is not the player\'s' ); cl_beams[ 0 ].entity = 1;
	cl.mtime[ 0 ] = 10.3; same( tent.CL_PlayerLightning(), null, 'over at its server time' ); cl.mtime[ 0 ] = 10;
	const count = () => { client.set_cl_numvisedicts( 0 ); tent.CL_UpdateTEnts(); return client.cl_numvisedicts; };
	L.R_LightningClear(); const both = count();
	beam = { end: [ 300, 0, 0 ] }; L.R_LightningFrame( 30 ); L.R_LightningFrame( 30.05 ); same( L.R_LightningTakesBeam(), true, 'drawn here' );
	const shamblerOnly = count();
	check( both > shamblerOnly && shamblerOnly > 0, 'the player\'s bolts are left out (' + both + ' -> ' + shamblerOnly + '), the Shambler\'s stay' );
	for ( const b of cl_beams ) { b.model = null; b.endtime = 0; } L.R_LightningClear();
} );
