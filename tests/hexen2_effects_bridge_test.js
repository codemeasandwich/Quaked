// The Hexen effect-slot adapter reuses Quaked's existing Fireball/blob renderers rather than a second effect system:
// fire/explosion slots map to R_ParticleExplosion, acid slots to R_BlobExplosion, and a slot is bridged once per server
// time.
import { CE } from '../src/engine/common/hexen2_effectwire.js';
import { Hexen2_ExplosionEffect, Hexen2_EffectTracker, HEXEN2_FIRE_EFFECTS, HEXEN2_FLAME_EFFECTS, HEXEN2_SMOKE_EFFECTS, HEXEN2_ACID_EFFECTS } from '../src/engine/client/hexen2_effects_bridge.js';

const check = ( v, m ) => { if ( ! v ) throw new Error( m ); }, same = ( a, b, m ) => check( a === b, `${m}: ${a} != ${b}` );

Deno.test( 'fire and acid slots select the shared Quake effect renderers', () => {

	same( Hexen2_ExplosionEffect( { type: CE.SM_EXPLOSION, params: { origin: [ 1, 2, 3 ] } } ).kind, 'fire', 'small explosion' );
	same( Hexen2_ExplosionEffect( { type: CE.NEW_EXPLOSION, params: { origin: [ 1, 2, 3 ] } } ).kind, 'fire', 'new explosion' );
	same( Hexen2_ExplosionEffect( { type: CE.FBOOM, params: { origin: [ 1, 2, 3 ] } } ).kind, 'fire', 'fire boom' );
	same( Hexen2_ExplosionEffect( { type: CE.ACID_EXPL, params: { origin: [ 4, 5, 6 ] } } ).kind, 'acid', 'acid explosion' );
	same( Hexen2_ExplosionEffect( { type: CE.FLAMESTREAM, params: { origin: [ 1, 2, 3 ] } } ).kind, 'flame', 'flame stream reuses the Fireball' );
	same( Hexen2_ExplosionEffect( { type: CE.ONFIRE, params: { origin: [ 1, 2, 3 ] } } ).kind, 'flame', 'on-fire reuses the Fireball' );
	const smoke = Hexen2_ExplosionEffect( { type: CE.GREY_SMOKE, params: { origin: [ 1, 2, 3 ], velocity: [ 10, 0, 0 ], framelength: 0.5 } } );
	same( smoke.kind, 'smoke', 'smoke reuses the shared trail' ); same( smoke.end[ 0 ], 6, 'smoke end follows velocity' );
	same( Hexen2_ExplosionEffect( { type: CE.ACID_SPLAT, params: { origin: [ 4, 5, 6 ] } } ).kind, 'acid', 'acid splat' );
	same( Hexen2_ExplosionEffect( { type: CE.RAIN, params: { minOrg: [ 0, 0, 0 ] } } ), null, 'rain is not an explosion' );
	same( Hexen2_ExplosionEffect( { type: CE.TELEPORTERPUFFS, params: { origin: [ 7, 8, 9 ] } } ).kind, 'fire', 'origin-only effects use the shared particle renderer' );
	same( Hexen2_ExplosionEffect( { type: CE.SM_EXPLOSION, params: {} } ), null, 'no origin is not bridged' );
	check( HEXEN2_FIRE_EFFECTS.size > 10 && HEXEN2_FLAME_EFFECTS.size >= 7 && HEXEN2_SMOKE_EFFECTS.size >= 8 && HEXEN2_ACID_EFFECTS.size >= 3, 'the sets are populated' );

} );

Deno.test( 'a slot is bridged once per server time and again when reused', () => {

	const tracker = Hexen2_EffectTracker();
	const first = { type: CE.SM_EXPLOSION, time: 1, params: { origin: [ 1, 2, 3 ] } };
	check( tracker.take( 4, first ) !== null, 'the first effect is bridged' );
	same( tracker.take( 4, first ), null, 'the same slot/time is not bridged twice' );
	check( tracker.take( 4, { ...first, time: 2 } ) !== null, 'a reused slot at a new time is bridged again' );
	tracker.forget( 4 );
	check( tracker.take( 4, first ) !== null, 'after the slot ends the next effect is bridged' );
	same( tracker.take( 5, null ), null, 'an empty slot is ignored' );

} );
