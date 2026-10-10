// Public ES module output compared with the unmodified owner-supplied core,
// evaluated in a separate VM. No renderer, browser, game or worker is started.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as rock from '../src/newer/assets/rockfield.js';

const html = readFileSync( new URL( '../rockfield-v1.0.0.html', import.meta.url ), 'utf8' );
const core = /<script id="rock-core">([\s\S]*?)<\/script>/.exec( html );
if ( ! core ) throw new Error( 'Supplied RockField core is missing' );
const sandbox = {}; runInNewContext( core[ 1 ], sandbox );
const original = sandbox.RockField;
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( actual, expected, label ) => check( actual === expected, `${label}: ${actual} != ${expected}` );
const bytes = data => Buffer.from( data.buffer, data.byteOffset, data.byteLength );
const at = ( tile, x, y ) => tile.data[ ( y + tile.border ) * tile.width + x + tile.border ];
const BLOCK_WALL = { profile: 'wall', featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1 };
function expectError( fn, type, label ) {

	let error; try { fn(); } catch ( caught ) { error = caught; }
	equal( error?.name, type, label );

}

Deno.test( 'extracted RockField public functions reproduce supplied core exactly for both profiles and seed forms', () => {

	equal( original.VERSION, '1.0.0', 'original parity donor version' );
	equal( rock.VERSION, '1.2.0', 'updated owner donor core version' );
	equal( JSON.stringify( rock.DEFAULTS ), JSON.stringify( original.DEFAULTS ), 'source defaults' );
	for ( const seed of [ 73421, -1, 'cliff-east' ] ) {

		equal( rock.seedFrom( seed ), original.seedFrom( seed ), 'seed conversion' );
		for ( const profile of [ 'wall', 'ground' ] ) {

			const options = { seed, profile, cells: 16, border: 2, featureSize: 1.27, warp: .81, fracture: .53, detail: .39 };
			const field = rock.createField( options ), reference = original.createField( options );
			check( Object.isFrozen( field ) && Object.isFrozen( field.config ), 'field configuration remains immutable' );
			for ( const [ x, y ] of [ [ 0, 0 ], [ -1, -1 ], [ -.00001, .00001 ], [ 2.53, -3.78 ], [ -100.71, 83.03 ] ] ) {

				equal( field.height( x, y ), reference.height( x, y ), 'supplied scalar height' );
				equal( rock.hash( x, y, field.config.seed ), original.hash( x, y, field.config.seed ), 'supplied hash' );
				equal( rock.noise( x, y, field.config.seed ), original.noise( x, y, field.config.seed ), 'supplied value noise' );
				equal( rock.fbm( x, y, field.config.seed ), original.fbm( x, y, field.config.seed ), 'supplied fractal noise' );

			}
			for ( const [ x, y ] of [ [ -2, -1 ], [ 0, 0 ], [ 3, -4 ] ] ) {

				const tile = rock.generateTile( field, x, y ), expected = original.generateTile( reference, x, y );
				check( bytes( tile.data ).equals( bytes( expected.data ) ), `${profile} supplied tile bytes ${x},${y}` );
				check( bytes( rock.generateTile( { ...options, blockiness: 0 }, x, y ).data ).equals( bytes( expected.data ) ), 'explicit blockiness0 keeps original source output' );

			}

		}

	}

} );

Deno.test( 'negative and positive neighbors share exact heights, both tangent slopes and real gutters in every generation order', () => {

	const coords = [ [ -2, -1 ], [ -1, -1 ], [ -2, 0 ], [ -1, 0 ], [ 0, 0 ], [ 1, 0 ], [ 0, 1 ], [ 1, 1 ] ];
	for ( const options of [ { profile: 'wall' }, { profile: 'ground' }, BLOCK_WALL ] ) for ( const border of [ 1, 2, 4 ] ) {

		const config = { ...options, cells: 16, border }, field = rock.createField( config );
		const forward = new Map( coords.map( ( [ x, y ] ) => [ `${x},${y}`, rock.generateTile( field, x, y ) ] ) );
		for ( const [ x, y ] of coords.slice().reverse() ) check( bytes( rock.generateTile( config, x, y ).data ).equals( bytes( forward.get( `${x},${y}` ).data ) ), 'tile order does not alter samples' );
		for ( const tile of forward.values() ) {

			const n = tile.cells;
			// Every gutter is an actual world sample, including all four corners.
			for ( let y = -border; y <= n + border; y ++ ) for ( let x = -border; x <= n + border; x ++ )
				equal( at( tile, x, y ), Math.fround( field.height( tile.tileX + x / n, tile.tileY + y / n ) ), 'global sample and gutter' );
			for ( const [ dx, dy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) {

				const neighbor = forward.get( `${tile.tileX + dx},${tile.tileY + dy}` ); if ( ! neighbor ) continue;
				const report = rock.edgeReport( tile, neighbor ); equal( report.maxHeight, 0, 'public seam height' ); equal( report.maxSlope, 0, 'public seam slopes' ); equal( report.samples, n + 1, 'shared endpoint count' );
				for ( let q = 0; q <= n; q ++ ) {

					const ax = dx ? n : q, ay = dy ? n : q, bx = dx ? 0 : q, by = dy ? 0 : q;
					equal( at( tile, ax, ay ), at( neighbor, bx, by ), 'independent boundary height' );
					for ( const [ sx, sy ] of [ [ 1, 0 ], [ 0, 1 ] ] ) equal( at( tile, ax + sx, ay + sy ) - at( tile, ax - sx, ay - sy ), at( neighbor, bx + sx, by + sy ) - at( neighbor, bx - sx, by - sy ), 'independent two-axis derivative' );

				}

			}

		}

	}

} );

Deno.test( 'maximum block profile has broad connected flat crowns and deep cuts without repeating or changing the original ground field', () => {

	const settings = { ...BLOCK_WALL, seed: 73421, cells: 32 };
	const oldField = rock.createField( { ...settings, blockiness: 0 } ), block = rock.createField( settings ), half = rock.createField( { ...settings, blockiness: .5 } );
	for ( const [ x, y ] of [ [ -2.3, .8 ], [ 0, 0 ], [ 1.6, -1.1 ] ] ) {

		equal( block.height( x, y ), rock.createField( settings ).height( x, y ), 'block scalar deterministic' );
		check( Math.abs( half.height( x, y ) - ( oldField.height( x, y ) + block.height( x, y ) ) / 2 ) < 1e-15, 'opt-in blend preserves intermediate blockiness' );

	}
	function shape( field ) {

		const region = rock.region( field, -2, -2, 4, 4 ), data = region.data, w = region.width, flat = new Uint8Array( data.length );
		let crowns = 0, flatCrowns = 0, cuts = 0, largest = 0;
		for ( let y = 1; y < w - 1; y ++ ) for ( let x = 1; x < w - 1; x ++ ) {

			const i = y * w + x, h = data[ i ]; check( Number.isFinite( h ) && h >= 0 && h <= 1, 'finite bounded block heights' );
			if ( h < .22 ) cuts ++;
			if ( h > .55 ) {

				crowns ++; const slope = Math.hypot( ( data[ i + 1 ] - data[ i - 1 ] ) * 16, ( data[ i + w ] - data[ i - w ] ) * 16 );
				if ( slope < .12 ) { flat[ i ] = 1; flatCrowns ++; }

			}

		}
		// Connected area distinguishes a large planar crown from isolated noisy
		// low-slope points. Border cells are zero, so rows cannot wrap here.
		for ( let i = 0; i < flat.length; i ++ ) if ( flat[ i ] ) {

			const queue = [ i ]; flat[ i ] = 0;
			for ( let q = 0; q < queue.length; q ++ ) for ( const step of [ -1, 1, -w, w ] ) { const neighbor = queue[ q ] + step; if ( flat[ neighbor ] ) { flat[ neighbor ] = 0; queue.push( neighbor ); } }
			largest = Math.max( largest, queue.length );

		}
		return { cuts, flatRatio: flatCrowns / crowns, largest };

	}
	const originalShape = shape( oldField ), blockShape = shape( block );
	check( blockShape.flatRatio > .6 && blockShape.flatRatio > originalShape.flatRatio * 5, 'crowns become broadly flat, not rounded noisy ripples' );
	check( blockShape.largest > 500 && blockShape.largest > originalShape.largest * 10, 'large connected angular block faces' );
	check( blockShape.cuts > originalShape.cuts * 3, 'strong block shoulders reveal deep common trenches' );
	const tiles = [ [ -1, -1 ], [ 0, -1 ], [ -1, 0 ], [ 0, 0 ] ].map( ( [ x, y ] ) => rock.generateTile( block, x, y ) );
	equal( new Set( tiles.map( tile => bytes( tile.data ).toString( 'hex' ) ) ).size, 4, 'block preset keeps nonrepeating global tiles' );
	const ground = { ...settings, profile: 'ground' };
	check( bytes( rock.generateTile( ground, -1, 0 ).data ).equals( bytes( original.generateTile( ground, -1, 0 ).data ) ), 'blockiness does not alter supplied ground height' );
	console.log( 'BLOCK_SHAPE ' + JSON.stringify( { original: originalShape, maximum: blockShape } ) );

} );

Deno.test( 'multi-tile regions use one nonrepeating global field and preserve the different wall and ground profiles', () => {

	const profiles = {};
	for ( const profile of [ 'wall', 'ground' ] ) {

		const field = rock.createField( { profile, cells: 16 } ), region = rock.region( field, -2, -1, 3, 3 );
		equal( region.width, 49, 'shared endpoints included only once' ); equal( region.height, 49, 'region height' );
		const signatures = new Set();
		for ( let ty = 0; ty < 3; ty ++ ) for ( let tx = 0; tx < 3; tx ++ ) {

			const tile = rock.generateTile( field, tx - 2, ty - 1 ); signatures.add( bytes( tile.data ).toString( 'hex' ) );
			for ( let y = 0; y <= 16; y ++ ) for ( let x = 0; x <= 16; x ++ ) equal( at( tile, x, y ), region.data[ ( ty * 16 + y ) * region.width + tx * 16 + x ], 'region and independent tile share samples' );

		}
		equal( signatures.size, 9, 'neighboring tiles do not repeat or get a per-tile normalization' );
		check( region.data.every( h => Number.isFinite( h ) && h >= 0 && h <= 1 ), 'normalized finite heights' );
		const reference = original.region( field.config, -2, -1, 3, 3 ); check( bytes( region.data ).equals( bytes( reference.data ) ), 'region equals supplied export' );
		profiles[ profile ] = bytes( region.data );

	}
	check( ! profiles.wall.equals( profiles.ground ), 'wall and ground preserve distinct authored profiles' );

} );

Deno.test( 'invalid configuration, coordinates, neighbor pairs and oversized exports fail before generating data', () => {

	for ( const input of [ { profile: 'lava' }, { featureSize: .1 }, { featureSize: 9 }, { warp: -1 }, { fracture: 3 }, { cells: 15 }, { cells: 1025 }, { cells: 16.5 }, { border: 0 }, { border: 17 } ] ) expectError( () => rock.config( input ), 'RangeError', 'invalid source configuration' );
	for ( const key of [ 'featureSize', 'warp', 'fracture', 'detail' ] ) for ( const value of [ NaN, Infinity, '1' ] ) expectError( () => rock.config( { [ key ]: value } ), 'TypeError', 'nonfinite numeric configuration' );
	for ( const blockiness of [ -.01, 1.01, NaN, Infinity, '1', null ] ) expectError( () => rock.config( { blockiness } ), 'RangeError', 'invalid blockiness' );
	for ( const value of [ NaN, Infinity, 1.5, 1000001, -1000001 ] ) {

		expectError( () => rock.generateTile( { cells: 16 }, value, 0 ), 'RangeError', 'invalid tile X' );
		expectError( () => rock.generateTile( { cells: 16 }, 0, value ), 'RangeError', 'invalid tile Y' );

	}
	for ( const counts of [ [ 0, 1 ], [ 1, -1 ], [ 1.5, 1 ] ] ) expectError( () => rock.region( { cells: 16 }, 0, 0, ...counts ), 'RangeError', 'invalid region counts' );
	expectError( () => rock.region( { cells: 16 }, 0, 0, 1024, 1024 ), 'RangeError', 'bounded export samples' );
	const a = rock.generateTile( { cells: 16 }, 0, 0 );
	expectError( () => rock.edgeReport( a, rock.generateTile( { cells: 16 }, -1, 0 ) ), 'Error', 'only upper/right neighbors accepted' );
	expectError( () => rock.edgeReport( a, rock.generateTile( { cells: 16, border: 3 }, 1, 0 ) ), 'Error', 'gutter settings must match' );

} );

Deno.test( 'public worker requests return source-identical transferable tiles and correlated errors across configuration changes', async () => {

	const saved = Object.getOwnPropertyDescriptor( globalThis, 'self' ), replies = [];
	Object.defineProperty( globalThis, 'self', { configurable: true, value: { postMessage: ( result, transfers ) => replies.push( { result, transfers } ) } } );
	try {

		await import( '../src/rockfield_worker.js' );
		for ( const [ id, profile, x, y ] of [ [ 1, 'wall', -2, 3 ], [ 2, 'ground', 1, -1 ], [ 3, 'wall', -2, 3 ] ] ) {

			const config = { profile, cells: 16 }; globalThis.self.onmessage( { data: { id, config, x, y } } );
			const reply = replies.pop(); equal( reply.result.id, id, 'request correlated' );
			check( bytes( reply.result.result.data ).equals( bytes( original.generateTile( config, x, y ).data ) ), 'worker output equals supplied source' );
			equal( reply.transfers[ 0 ], reply.result.result.data.buffer, 'height buffer is transferred' ); check( Number.isFinite( reply.result.elapsed ) && reply.result.elapsed >= 0, 'elapsed generation measured' );

		}
		globalThis.self.onmessage( { data: { id: 4, config: { cells: 16 }, x: .5, y: 0 } } );
		const failed = replies.pop(); equal( failed.result.id, 4, 'failed request correlated' ); check( typeof failed.result.error === 'string' && ! failed.result.result, 'error returned without partial data' );

	} finally { if ( saved ) Object.defineProperty( globalThis, 'self', saved ); else delete globalThis.self; }

} );
