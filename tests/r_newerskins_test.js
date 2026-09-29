import * as skins from '../src/r_newerskins.js';
import * as anim from '../src/r_anim.js';

function assertEqual( actual, expected, message ) {

	if ( actual !== expected )
		throw new Error( `${message}: expected ${expected}, got ${actual}` );

}

Deno.test( 'model names map to skin keys', () => {

	assertEqual( skins.R_NewerModelKey( 'progs/wizard.mdl' ), 'wizard', 'a monster' );
	assertEqual( skins.R_NewerModelKey( 'progs/h_demon.mdl' ), 'h_demon', 'a head gib' );
	assertEqual( skins.R_NewerModelKey( 'maps/e1m1.bsp' ), null, 'not a model' );
	assertEqual( skins.R_NewerModelKey( 'progs/flame.bsp' ), null, 'not an alias model' );
	assertEqual( skins.R_NewerModelKey( null ), null, 'nothing' );

} );

Deno.test( 'each monster keeps its skin, and skins vary between monsters', () => {

	skins.R_NewerSetSalt( 12345 );
	const old = skins.r_newer_variety.value;
	skins.r_newer_variety.value = 1;

	try {

		const first = [];
		for ( let i = 1; i <= 3000; i ++ )
			first.push( skins.R_NewerPickVariant( { _entityIndex: i }, 'zombie', 3 ) );

		const again = [];
		for ( let i = 1; i <= 3000; i ++ )
			again.push( skins.R_NewerPickVariant( { _entityIndex: i }, 'zombie', 3 ) );

		assertEqual( JSON.stringify( first ), JSON.stringify( again ), 'the same monster, the same skin' );

		const counts = [ 0, 0, 0 ];
		for ( const v of first ) counts[ v ] ++;
		for ( const c of counts )
			assertEqual( c > 850 && c < 1150, true, `an even spread (got ${counts})` );

		// a new level rolls again
		skins.R_NewerSetSalt( 999 );
		let changed = 0;
		for ( let i = 1; i <= 3000; i ++ )
			if ( skins.R_NewerPickVariant( { _entityIndex: i }, 'zombie', 3 ) !== first[ i - 1 ] ) changed ++;
		assertEqual( changed > 1500, true, 'a new level re-rolls the monsters' );

		// different models roll independently
		let same = 0;
		for ( let i = 1; i <= 3000; i ++ )
			if ( skins.R_NewerPickVariant( { _entityIndex: i }, 'ogre', 3 ) === skins.R_NewerPickVariant( { _entityIndex: i }, 'knight', 3 ) ) same ++;
		assertEqual( same > 700 && same < 1300, true, 'models do not move in lockstep' );

	} finally {

		skins.r_newer_variety.value = old;

	}

} );

Deno.test( 'one skin, or variety off, always gives the first', () => {

	assertEqual( skins.R_NewerPickVariant( { _entityIndex: 7 }, 'ogre', 1 ), 0, 'a single skin' );

	const old = skins.r_newer_variety.value;
	skins.r_newer_variety.value = 0;

	try {

		for ( let i = 1; i < 50; i ++ )
			assertEqual( skins.R_NewerPickVariant( { _entityIndex: i }, 'zombie', 3 ), 0, 'variety off' );

	} finally {

		skins.r_newer_variety.value = old;

	}

} );

Deno.test( 'entities without a slot number get a seed of their own that sticks', () => {

	const e = {};
	const a = skins.R_NewerPickVariant( e, 'zombie', 4 );
	assertEqual( skins.R_NewerPickVariant( e, 'zombie', 4 ), a, 'stable' );
	assertEqual( typeof e._qrSeed, 'number', 'seeded' );

} );

Deno.test( 'no Reforged material unless Newer Game is on and the skin is known', () => {

	const entity = { _entityIndex: 3 };
	skins.R_NewerSetIndex( { models: { zombie: [ { dir: 'zombie/v1', maps: { diffuse: 'diffuse.webp' } } ] } } );

	anim.R_AnimSetNewer( false );
	assertEqual( skins.R_NewerAliasMaterial( entity, 'progs/zombie.mdl', true ), null, 'classic lighting keeps the original skin' );

	anim.R_AnimSetNewer( true );

	try {

		assertEqual( skins.R_NewerAliasMaterial( entity, 'progs/knight.mdl', true ), null, 'a model with no Reforged skin' );
		// the skin has not finished loading (and there is no texture loader here)
		assertEqual( skins.R_NewerAliasMaterial( entity, 'progs/zombie.mdl', true ), null, 'still loading' );

	} finally {

		anim.R_AnimSetNewer( false );
		skins.R_NewerSetIndex( null );

	}

} );

Deno.test( 'every file the skin index names exists', async () => {

	const root = new URL( '../newer/enemies/', import.meta.url );
	const index = JSON.parse( await Deno.readTextFile( new URL( 'index.json', root ) ) );

	let variants = 0;
	for ( const [ model, list ] of Object.entries( index.models ) ) {

		assertEqual( list.length > 0, true, model + ' has skins' );

		for ( const v of list ) {

			variants ++;
			assertEqual( v.maps.diffuse !== undefined, true, v.dir + ' has a diffuse map' );

			for ( const file of Object.values( v.maps ) )
				await Deno.stat( new URL( v.dir + '/' + file, root ) ); // throws if missing

		}

	}

	assertEqual( variants >= 33, true, 'all the supplied skins are indexed' );

} );
