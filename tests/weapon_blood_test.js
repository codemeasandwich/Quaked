// Held-weapon blood belongs to the weapon it landed on (card [16], docs/held-weapon-blood-2026-10-09.md).
// Public paths only: R_PlayerSurfaceBlood / R_WeaponSurfaceBloodAt (blood events), R_WeaponSurfaceFrame (water and
// drying), R_ActiveWeaponSurface / R_PlayerBodySurface (what the shaders read), weaponSurface.snapshotAll /
// restoreAll (saves). The weapon in hand is the one the renderer draws: cl.viewent.model, which V_CalcRefdef sets
// from STAT_WEAPON each frame (null when dead, at intermission and before the first clientdata).
import { cl, cls, cl_entities } from '../src/engine/client/client.js';
import { STAT_WEAPON } from '../src/engine/common/quakedef.js';
import { V_CalcRefdef, V_CalcIntermissionRefdef } from '../src/engine/client/view.js';
import { weaponSurface, weaponKey, WeaponSurfaceState, R_ActiveWeaponSurface, R_PlayerBodySurface, R_WeaponSurfaceContext, R_PlayerSurfaceBlood, R_WeaponSurfaceBloodAt, R_WeaponSurfaceFrame } from '../src/newer/render/r_weapon_surface.js';

const check = ( v, m ) => { if ( ! v ) throw Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );
const air = - 1, water = - 3;
const AXE = { name: 'progs/v_axe.mdl' }, SHOT = { name: 'progs/v_shot.mdl' }, NAIL = { name: 'progs/v_nail.mdl' };
const hold = model => { cl.viewent.model = model; }; // what V_CalcRefdef does each frame
const splats = () => R_ActiveWeaponSurface().spots.filter( s => s.w > 0 ).length;
const blood = () => R_ActiveWeaponSurface().blood;
const json = v => JSON.stringify( v );
const empty = () => ( { version: 2, body: new WeaponSurfaceState().snapshot(), weapons: {} } );

function fixture( fn ) {

	const saved = weaponSurface.snapshotAll(), model = cl.viewent.model, demo = cls.demoplayback;
	cls.demoplayback = false; R_WeaponSurfaceContext( true, [ 0, 0, 0 ], () => true, () => [ .4, .6 ] );
	check( weaponSurface.restoreAll( empty(), 0 ), 'fixture starts clean' ); hold( SHOT );
	try { return fn(); } finally { weaponSurface.restoreAll( saved, 0 ); cl.viewent.model = model; cls.demoplayback = demo; R_WeaponSurfaceContext( false, null, null ); }

}

Deno.test( 'a splattered shotgun, a clean nailgun, then the shotgun again keep independent blood', () => fixture( () => {

	check( R_PlayerSurfaceBlood( 30 ), 'blood event accepted while the shotgun is held' );
	const spots = splats(), amount = blood();
	check( spots > 0 && amount > 0, 'shotgun is bloody' );
	hold( NAIL );
	same( splats(), 0, 'switching to an unsplattered weapon shows no inherited blood' ); same( blood(), 0, 'its blood amount is zero' );
	R_PlayerSurfaceBlood( 10 );
	check( blood() > 0 && blood() < amount, 'the nailgun gets its own, smaller amount' );
	hold( SHOT );
	same( splats(), spots, 'switching back restores the shotgun splatter' ); same( blood(), amount, 'with its exact amount' );

} ) );

Deno.test( 'the axe has its own coating; blood goes to the weapon last drawn, so a stat change inside a message does not split an event', () => fixture( () => {

	hold( AXE );
	check( R_WeaponSurfaceBloodAt( [ 10, 0, 0 ], 40 ), 'spray admitted' );
	const axe = blood();
	hold( SHOT ); same( blood(), 0, 'the shotgun saw none of the axe\'s spray' );
	hold( AXE ); same( blood(), axe, 'the axe keeps it' );
	// A server message carrying damage, a new STAT_WEAPON and particles is parsed between two frames: the stats
	// change but cl.viewent.model is only updated by the next frame, so damage and spray both go to the axe.
	cl.stats[ 2 ] = 99; R_PlayerSurfaceBlood( 20 ); R_WeaponSurfaceBloodAt( [ 5, 0, 0 ], 30 ); const both = blood();
	check( both > axe, 'both events of the message landed on the weapon drawn before it' );
	hold( NAIL ); same( blood(), 0, 'the weapon drawn after the message has none of them' );

} ) );

Deno.test( 'with no weapon drawn (dead, intermission, loading) no weapon gets blood or water; the body still does', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); const shotgun = json( R_ActiveWeaponSurface().snapshot() );
	hold( null );
	check( R_PlayerSurfaceBlood( 30 ), 'the body accepts blood while dead' ); check( R_WeaponSurfaceBloodAt( [ 4, 0, 0 ], 40 ), 'and a spray' );
	same( blood(), 0, 'no weapon reads as bloody while none is drawn' );
	R_WeaponSurfaceFrame( 1, air ); R_WeaponSurfaceFrame( 2, water ); R_WeaponSurfaceFrame( 3, air );
	same( R_PlayerBodySurface().blood, 0, 'the body is washed by the water it died in' );
	hold( AXE ); same( blood(), 0, 'the respawn axe has no blood from the death' ); same( R_ActiveWeaponSurface().wet, 0, 'nor a soak from water it was not in' );
	hold( SHOT ); same( json( R_ActiveWeaponSurface().snapshot() ).replace( /"wet":[^,]*,/, '' ).replace( /"inWater":[^,]*,/, '' ), shotgun.replace( /"wet":[^,]*,/, '' ).replace( /"inWater":[^,]*,/, '' ), 'the put-away shotgun keeps its blood' );

} ) );

Deno.test( 'water washes only the weapon in hand; a holstered weapon keeps its blood and is not soaked by a later exit', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); const shotgun = blood();
	hold( NAIL ); R_PlayerSurfaceBlood( 30 ); check( blood() > 0, 'control: the nailgun is bloody' );
	R_WeaponSurfaceFrame( 10, air ); R_WeaponSurfaceFrame( 11, water );
	same( blood(), 0, 'the nailgun in hand is washed' ); same( splats(), 0, 'its spots are gone' );
	hold( SHOT ); same( blood(), shotgun, 'the holstered shotgun keeps its blood' );
	hold( NAIL ); R_WeaponSurfaceFrame( 12, water ); hold( SHOT ); R_WeaponSurfaceFrame( 13, air );
	same( R_ActiveWeaponSurface().wet, 0, 'the shotgun, taken up under water... was never in the water: no soak' );
	hold( NAIL ); R_WeaponSurfaceFrame( 13.5, air );
	same( R_ActiveWeaponSurface().wet, 0, 'the nailgun, put away under water, is not soaked when taken up in air' );

} ) );

Deno.test( 'the body coating takes every event and follows the player across switches', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); const one = R_PlayerBodySurface().blood;
	hold( NAIL ); same( R_PlayerBodySurface().blood, one, 'switching weapon does not change the body' );
	R_PlayerSurfaceBlood( 30 ); check( R_PlayerBodySurface().blood > one, 'the body adds the nailgun-time event too' );
	check( R_PlayerBodySurface() !== R_ActiveWeaponSurface(), 'body and weapon are separate coatings' );
	const w = R_ActiveWeaponSurface().spots[ 0 ], s = R_PlayerBodySurface().spots[ 0 ];
	check( Math.abs( w.x - .4 ) < 1e-9 && Math.abs( w.y - .6 ) < 1e-9, 'the weapon spot sits at the gun contact' ); check( Math.abs( s.x - .4 ) > 1e-6 || Math.abs( s.y - .6 ) > 1e-6, 'the body does not reuse the gun\'s skin coordinates' );

} ) );

Deno.test( 'blood never ages; wet film dries by game time for every weapon, held or not, also across a level clock reset', () => fixture( () => {

	R_WeaponSurfaceFrame( 299, water ); R_WeaponSurfaceFrame( 300, air );
	same( R_ActiveWeaponSurface().wet, 1, 'leaving water soaks the weapon in hand' );
	R_PlayerSurfaceBlood( 30 ); const shotgun = blood();
	hold( NAIL ); R_WeaponSurfaceFrame( 301, air );
	R_WeaponSurfaceFrame( 1, air ); // changelevel: the clock starts again near zero
	R_WeaponSurfaceFrame( 5, air ); hold( SHOT ); R_WeaponSurfaceFrame( 5, air );
	same( R_ActiveWeaponSurface().wet, 0, 'the film ran down while it was holstered, in the new level\'s time' ); same( blood(), shotgun, 'its blood did not' );
	R_WeaponSurfaceFrame( 6, air, true ); same( blood(), shotgun, 'paused frames change nothing' );

} ) );

Deno.test( 'saves carry the body and every weapon, including one that is only wet; bad data changes nothing', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); const shotgun = json( R_ActiveWeaponSurface().snapshot() );
	hold( NAIL ); R_WeaponSurfaceFrame( 0, water ); R_WeaponSurfaceFrame( 1, air ); const nailgun = json( R_ActiveWeaponSurface().snapshot() );
	check( R_ActiveWeaponSurface().wet === 1 && blood() === 0, 'control: the nailgun is wet and clean' );
	const body = json( R_PlayerBodySurface().snapshot() ), saved = JSON.parse( json( weaponSurface.snapshotAll() ) );
	same( saved.version, 2, 'save format' ); same( Object.keys( saved.weapons ).sort().join(), 'progs/v_nail.mdl,progs/v_shot.mdl', 'one coating per weapon that is bloody or wet' );
	check( weaponSurface.restoreAll( empty(), 5 ), 'cleared' ); same( blood() + R_ActiveWeaponSurface().wet, 0, 'control: cleared' );
	check( weaponSurface.restoreAll( saved, 5 ), 'save accepted' );
	same( json( R_ActiveWeaponSurface().snapshot() ), nailgun, 'the wet-only nailgun restored' );
	same( json( R_PlayerBodySurface().snapshot() ), body, 'the body restored' );
	hold( SHOT ); same( json( R_ActiveWeaponSurface().snapshot() ), shotgun, 'the shotgun restored' );
	weaponSurface.last = 50; hold( NAIL ); same( R_ActiveWeaponSurface().last, 50, 'a load rebases the clock of a holstered weapon too' );
	const reject = ( mutate, name ) => { const d = JSON.parse( json( saved ) ); mutate( d ); check( ! weaponSurface.restoreAll( d, 6 ), name ); };
	reject( d => { d.weapons[ 'progs/v_nail.mdl' ].spots[ 2 ][ 2 ] = NaN; }, 'NaN in one weapon rejects the whole save' );
	reject( d => { d.weapons[ 'progs/v_nail.mdl' ].spots.length = 3; }, 'a short spot list rejects the whole save' );
	reject( d => { d.weapons[ 'bad key!' ] = d.weapons[ 'progs/v_shot.mdl' ]; }, 'a malformed weapon key is rejected' );
	reject( d => { d.weapons = [ d.weapons[ 'progs/v_shot.mdl' ] ]; }, 'an array of weapons is rejected' );
	reject( d => { for ( let i = 0; i < 65; i ++ ) d.weapons[ 'w' + i ] = d.weapons[ 'progs/v_shot.mdl' ]; }, 'more than 64 weapons is rejected' );
	reject( d => { delete d.body; }, 'a save without the body is rejected' );
	hold( SHOT ); same( json( R_ActiveWeaponSurface().snapshot() ), shotgun, 'after all the rejections every weapon is as it was' );

} ) );

Deno.test( 'a version 1 save (one shared coating) becomes the body and the first weapon drawn after the load; other weapons start clean', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); hold( NAIL ); R_PlayerSurfaceBlood( 30 ); // the session before the load
	const legacy = new WeaponSurfaceState(); legacy.add( .5 );
	check( weaponSurface.restoreAll( legacy.snapshot(), 7 ), 'version 1 accepted' );
	same( blood(), 0, 'a read during loading, with the old session\'s weapon still set, adopts nothing' );
	same( R_PlayerBodySurface().blood, .5, 'the body has the saved coating' );
	const pending = JSON.parse( json( weaponSurface.snapshotAll() ) ); check( pending.weapons[ '(legacy)' ], 'a save made before adoption keeps the pending coating' );
	hold( null ); R_WeaponSurfaceFrame( 8, air ); check( weaponSurface.legacy, 'no weapon drawn yet: still pending' );
	weaponSurface.last = 40; same( weaponSurface.legacy.last, 40, 'a load rebases the pending coating\'s clock' ); same( R_PlayerBodySurface().last, 40, 'and the body\'s' );
	check( weaponSurface.restoreAll( { version: 2, body: new WeaponSurfaceState().snapshot(), weapons: {} }, 8 ) && ! weaponSurface.legacy, 'control: a clean save clears the pending coating' );
	check( weaponSurface.restoreAll( pending, 8 ), 'a save made while the coating was pending loads back' ); check( weaponSurface.legacy?.blood === .5, 'with the coating pending again' );
	hold( SHOT ); R_WeaponSurfaceFrame( 9, air ); same( blood(), .5, 'the first weapon drawn takes the saved coating' );
	hold( NAIL ); same( blood(), 0, 'the old session\'s nailgun blood is gone' );

} ) );

Deno.test( 'demo playback keeps its own coatings and never touches the live weapons or body', () => fixture( () => {

	R_PlayerSurfaceBlood( 30 ); const live = json( weaponSurface.snapshotAll() );
	cls.demoplayback = true;
	same( blood(), 0, 'the demo shotgun starts clean' ); R_PlayerSurfaceBlood( 30 ); R_WeaponSurfaceFrame( 3, water );
	cls.demoplayback = false; same( json( weaponSurface.snapshotAll() ), live, 'live coatings untouched by the demo' );

} ) );

Deno.test( 'the game\'s own save never holds a key its loader rejects: odd model names and a 65th weapon are left out, the rest loads', () => fixture( () => {

	hold( { name: 'progs/v_gun+2.mdl' } ); R_PlayerSurfaceBlood( 10 ); // first, so the cap alone would not leave it out
	for ( let i = 0; i < 70; i ++ ) { hold( { name: 'progs/v_w' + i + '.mdl' } ); R_PlayerSurfaceBlood( 10 ); }
	const saved = JSON.parse( json( weaponSurface.snapshotAll() ) );
	same( Object.keys( saved.weapons ).length, 64, 'at most 64 weapons written' ); check( ! saved.weapons[ 'progs/v_gun+2.mdl' ], 'an out-of-pattern name is not written' );
	check( weaponSurface.restoreAll( saved, 1 ), 'the game\'s own save loads' ); hold( { name: 'progs/v_w0.mdl' } ); check( blood() > 0, 'with its weapons' );

} ) );

Deno.test( 'with no weapon drawn the blank state cannot be written through the bank', () => fixture( () => {

	hold( null ); same( weaponSurface.add( .5 ), false, 'add refused' ); same( weaponSurface.restore( ( () => { const s = new WeaponSurfaceState(); s.add( .5 ); return s.snapshot(); } )(), 1 ), false, 'restore refused' );
	weaponSurface.frame( 1, water ); weaponSurface.frame( 2, air ); same( R_ActiveWeaponSurface().blood + R_ActiveWeaponSurface().wet, 0, 'still blank' );

} ) );

Deno.test( 'the key is set by the real V_CalcRefdef from STAT_WEAPON and cleared when dead and at intermission', () => fixture( () => {

	const precache = cl.model_precache.slice(), stat = cl.stats[ STAT_WEAPON ], viewentity = cl.viewentity;
	try {
		cl.viewentity = 1; cl_entities[ 1 ] ||= cl_entities[ 0 ];
		cl.model_precache[ 7 ] = { name: 'progs/v_axe.mdl' }; cl.stats[ STAT_WEAPON ] = 7; V_CalcRefdef();
		same( weaponKey(), 'progs/v_axe.mdl', 'the drawn axe is the key' );
		R_PlayerSurfaceBlood( 30 ); const axe = blood(); check( axe > 0, 'and takes the blood' );
		cl.stats[ STAT_WEAPON ] = 0; V_CalcRefdef(); same( weaponKey(), null, 'dead: weaponmodel index 0 draws nothing, no key' );
		cl.stats[ STAT_WEAPON ] = 7; V_CalcRefdef(); same( blood(), axe, 'alive again: the axe as it was' );
		V_CalcIntermissionRefdef(); same( weaponKey(), null, 'intermission: no key' );
	} finally { cl.model_precache.length = 0; cl.model_precache.push( ...precache ); cl.stats[ STAT_WEAPON ] = stat; cl.viewentity = viewentity; }

} ) );
