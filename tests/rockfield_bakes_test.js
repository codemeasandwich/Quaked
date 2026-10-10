// Public bake decoder/source/cache tests. Actual field generation, Three half
// storage and shipped BSP chart discovery are used; only transport is injected.
import * as THREE from 'three';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { ROCK_BAKES } from '../src/rockfield_bakes.js';
import { ROCK_BAKE_VERSION, ROCK_BAKE_SIDE, ROCK_BAKE_CELLS, ROCK_BAKE_BORDER,
	RockBakeConfig, RockBakeSignature, RockBakeTileCoordinates, RockBakeEncode, RockBakeDecode } from '../src/rockfield_bake_format.js';
import { RockBakeSource, R_RockBakePrefetch } from '../src/r_rockbakes.js';
import { RockTileCache, ROCK_PAGES, ROCK_SIDE, ROCK_TABLE_SIZE, ROCK_PROBES, R_RockPageHash } from '../src/r_rockfield.js';
import { createField, generateTile } from '../src/rockfield.js';
import { R_RockPreset } from '../src/rockfield_presets.js';
import { R_RockSurfaceCharts } from '../src/r_rocksurfaces.js';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile, COM_PreloadLooseFile, COM_SetNewerPack, COM_NewerPackLoaded } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { GL_BuildLightmaps } from '../src/gl_rsurf.js';
import { cl } from '../src/engine/client/client.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const equal = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const bytes = value => Buffer.from( value.buffer, value.byteOffset, value.byteLength );
const hash = value => createHash( 'sha256' ).update( value ).digest( 'hex' );
const arrayBuffer = value => value.buffer.slice( value.byteOffset, value.byteOffset + value.byteLength );
const reject = ( fn, label ) => { let error; try { fn(); } catch ( caught ) { error = caught; } check( error, label ); };
// Independent positive [0,1] float32 -> half conversion, matching the Three
// uploader's truncation contract rather than calling its conversion helper.
const bits = new DataView( new ArrayBuffer( 4 ) );
function half( value ) {
	bits.setFloat32( 0, value, true ); const word = bits.getUint32( 0, true ), exponent = ( word >>> 23 ) - 127, mantissa = word & 0x7fffff;
	if ( exponent < -24 ) return 0;
	return exponent < -14 ? ( mantissa | 0x800000 ) >>> ( -exponent - 1 ) : ( ( exponent + 15 ) << 10 ) | ( mantissa >>> 13 );
}
function chart( profile = 'ground', id = 1 ) {
	const name = profile === 'wall' ? 'rock1_2' : 'ground1_2';
	return { id, key: name + ':' + profile + ':test', name, profile, seed: 73421 + id, config: R_RockPreset( name, profile ),
		tangent: [ 1, 0, 0 ], bitangent: [ 0, 1, 0 ], surfaces: [ { bounds: [ 0, 0, 0, 0 ] } ] };
}
function bake( model, charts, tileFn = () => new Uint16Array( ROCK_BAKE_SIDE ** 2 ).fill( half( .5 ) ) ) {
	return RockBakeEncode( model, charts, charts.flatMap( field => RockBakeTileCoordinates( field ).map( ( [ x, y ] ) => tileFn( field, x, y ) ) ) );
}
function changeHeader( encoded, edit ) {
	const buffer = arrayBuffer( encoded ), view = new DataView( buffer ), length = view.getUint32( 0, true ), start = 4 + length + ( length & 1 );
	const metadata = JSON.parse( new TextDecoder().decode( new Uint8Array( buffer, 4, length ) ) ); edit( metadata );
	const json = new TextEncoder().encode( JSON.stringify( metadata ) ), next = 4 + json.length + ( json.length & 1 ), result = new Uint8Array( next + buffer.byteLength - start );
	new DataView( result.buffer ).setUint32( 0, json.length, true ); result.set( json, 4 ); result.set( new Uint8Array( buffer, start ), next ); return result;
}
let serial = 0;
function payloadSpec( model, payload ) {
	Object.assign( ROCK_BAKES[ model ], { rawSha256: hash( payload ), sha256: hash( gzipSync( payload ) ) } );
}
async function fixture( fn ) {
	const model = 'maps/rock-bake-public-test-' + ++ serial + '.bsp'; ROCK_BAKES[ model ] = { file: 'fixture-only-' + serial + '.rf.gz' };
	payloadSpec( model, bake( model, [ chart() ] ) );
	try { return await fn( model ); } finally { delete ROCK_BAKES[ model ]; }
}
class WorkerEndpoint {
	constructor() { this.calls = []; this.terminated = false; }
	postMessage( message ) { this.calls.push( message ); }
	terminate() { this.terminated = true; }
	finish() { const job = this.calls.at( -1 ); this.onmessage( { data: { id: job.id, result: generateTile( createField( job.config ), job.x, job.y ) } } ); }
}
function cacheFixture( source ) {
	const workers = []; return { workers, cache: new RockTileCache( () => { const worker = new WorkerEndpoint(); workers.push( worker ); return worker; }, { bakeSource: source } ) };
}
function page( cache, field, x, y ) {
	for ( let p = 0; p < Math.min( ROCK_PROBES, cache.probes.value ); p ++ ) {
		const at = ( ( R_RockPageHash( field.id, x, y ) + p ) & ( ROCK_TABLE_SIZE - 1 ) ) * 4;
		if ( ! cache.table[ at + 3 ] ) return -1;
		if ( cache.table[ at ] === x && cache.table[ at + 1 ] === y && cache.table[ at + 2 ] === field.id ) return cache.table[ at + 3 ] - 1;
	} return -1;
}

Deno.test( 'bake format stores exact generator HALF-U16 values and matching boundary gutters for both roles', () => {
	for ( const profile of [ 'wall', 'ground' ] ) {
		const fieldChart = chart( profile ), field = createField( RockBakeConfig( fieldChart ) );
		const required = new Map( [ [ '0,0', null ], [ '1,0', null ], [ '0,1', null ] ] );
		for ( const key of required.keys() ) { const [ x, y ] = key.split( ',' ).map( Number ); required.set( key, Uint16Array.from( generateTile( field, x, y ).data, half ) ); }
		const encoded = bake( 'maps/parity.bsp', [ fieldChart ], ( _, x, y ) => required.get( x + ',' + y ) || new Uint16Array( ROCK_BAKE_SIDE ** 2 ).fill( half( .5 ) ) );
		const decoded = RockBakeDecode( arrayBuffer( encoded ), 'maps/parity.bsp' ).charts.get( RockBakeSignature( fieldChart ) );
		for ( const [ key, expected ] of required ) {
			check( bytes( decoded.get( key ) ).equals( bytes( expected ) ), profile + ' exact generated half payload' );
			for ( const value of generateTile( field, ...key.split( ',' ).map( Number ) ).data ) equal( half( value ), THREE.DataUtils.toHalfFloat( value ), 'independent uploader quantization' );
		}
		const a = decoded.get( '0,0' ), right = decoded.get( '1,0' ), above = decoded.get( '0,1' );
		for ( let row = 0; row < ROCK_BAKE_SIDE; row ++ ) for ( let overlap = 0; overlap <= ROCK_BAKE_BORDER * 2; overlap ++ ) {
			equal( a[ row * ROCK_BAKE_SIDE + ROCK_BAKE_CELLS + overlap ], right[ row * ROCK_BAKE_SIDE + overlap ], profile + ' horizontal shared gutter' );
			equal( a[ ( ROCK_BAKE_CELLS + overlap ) * ROCK_BAKE_SIDE + row ], above[ overlap * ROCK_BAKE_SIDE + row ], profile + ' vertical shared gutter' );
		}
	}
} );

Deno.test( 'bake decoder rejects stale, truncated, wrong-model, invalid-height and duplicate records', () => {
	const model = 'maps/format.bsp', encoded = bake( model, [ chart() ] );
	reject( () => RockBakeDecode( arrayBuffer( encoded ), 'maps/other.bsp' ), 'wrong model rejects' );
	reject( () => RockBakeDecode( arrayBuffer( encoded.subarray( 0, encoded.length - 1 ) ), model ), 'truncated bytes reject' );
	for ( const edit of [ metadata => { metadata.version = 'stale'; }, metadata => { metadata.side = 70; },
		metadata => { metadata.charts.push( metadata.charts[ 0 ] ); }, metadata => { metadata.charts[ 0 ].tiles.push( metadata.charts[ 0 ].tiles[ 0 ] ); },
		metadata => { metadata.charts[ 0 ].tiles[ 0 ][ 2 ] = -1; }, metadata => { metadata.charts[ 0 ].tiles[ 1 ][ 2 ] = 0; },
		metadata => { metadata.charts[ 0 ].tiles[ 0 ][ 2 ] = 1; }, metadata => { metadata.charts[ 0 ].tiles[ 0 ] = null; } ] ) reject( () => RockBakeDecode( arrayBuffer( changeHeader( encoded, edit ) ), model ), 'invalid header/overlap/gap rejects' );
	const broken = encoded.slice(); new DataView( broken.buffer ).setUint16( broken.length - 2, 0x7c00, true );
	reject( () => RockBakeDecode( broken.buffer, model ), 'infinite/nonheight half rejects' );
	const trailing = new Uint8Array( encoded.length + 2 ); trailing.set( encoded );
	reject( () => RockBakeDecode( trailing.buffer, model ), 'unreferenced payload rejects' );
} );

Deno.test( 'public bounded deadline aborts a stalled loader, permits fallback and ignores its late successful result', async () => fixture( async model => {
	const field = chart(); let release, signal;
	const entry = R_RockBakePrefetch( model, ( _, options ) => { signal = options.signal; return new Promise( resolve => { release = resolve; } ); }, 0 );
	const source = new RockBakeSource( model, [ field ] ), { cache, workers } = cacheFixture( source );
	try {
		await Promise.resolve(); equal( source.entry, entry, 'prefetch/source share pending entry' ); cache.request( field, 0, 0 ); equal( workers.length, 0, 'no generation before deadline' );
		await entry.promise; equal( source.status, 'fallback', 'deadline settles' ); check( /timed out/i.test( entry.error ), 'deadline failure retained' ); check( signal.aborted, 'network/decompression abort signal set' );
		cache.request( field, 0, 0 ); equal( workers.length, 2, 'deadline releases fallback workers' ); workers[ 0 ].finish(); check( cache.request( field, 0, 0 ), 'fallback remains usable' );
		release( arrayBuffer( bake( model, [ field ] ) ) ); await Promise.resolve(); await Promise.resolve();
		equal( source.status, 'fallback', 'late download never overwrites fallback' ); equal( entry.data, null, 'late payload not installed' );
	} finally { cache.dispose(); }
} ) );

Deno.test( 'default public loader fetches the registry file and decompresses real gzip before installing its source', async () => fixture( async model => {
	const field = chart(), encoded = bake( model, [ field ] ), compressed = gzipSync( encoded ), previousFetch = globalThis.fetch;
	let requested, options, source;
	try {
		globalThis.fetch = async ( file, settings ) => { requested = file; options = settings; return new Response( compressed ); };
		source = new RockBakeSource( model, [ field ] ); await source.entry.promise;
		equal( requested, ROCK_BAKES[ model ].file + '?v=' + ROCK_BAKES[ model ].sha256, 'actual registry fetch path and cache version' ); check( options.signal instanceof AbortSignal, 'bounded default fetch gets abort signal' );
		equal( source.status, 'ready', 'real default gzip decode ready' ); check( source.tile( field, 0, 0 )?.every( value => value === half( .5 ) ), 'default decode payload exact' );
	} finally { source?.dispose(); globalThis.fetch = previousFetch; }
} ) );

Deno.test( 'default gzip loader rejects a valid in-range height bit flip by raw checksum and then generates fallback', async () => fixture( async model => {
	const field = chart(), pristine = bake( model, [ field ] ), corrupted = pristine.slice(), view = new DataView( corrupted.buffer );
	const headerBytes = view.getUint32( 0, true ), firstHeight = 4 + headerBytes + ( headerBytes & 1 );
	view.setUint16( firstHeight, view.getUint16( firstHeight, true ) ^ 1, true );
	check( hash( pristine ) !== hash( corrupted ), 'one height bit changes identity' );
	check( RockBakeDecode( corrupted.buffer, model ).data[ 0 ] <= 0x3c00, 'corrupted scalar remains valid in-range half' );
	// Manifest still identifies the pristine field. Gzip CRC is recomputed and
	// valid, so checksum verification—not transport/shape validation—must reject.
	payloadSpec( model, pristine ); const compressed = gzipSync( corrupted ), previousFetch = globalThis.fetch; let source, cache;
	try {
		globalThis.fetch = async () => new Response( compressed );
		source = new RockBakeSource( model, [ field ] ); await source.entry.promise;
		equal( source.status, 'fallback', 'checksum failure never installs altered field' ); check( /checksum mismatch/i.test( source.entry.error ), 'precise checksum failure retained' ); equal( source.entry.data, null, 'no corrupted decoded pages' );
		const fixture = cacheFixture( source ); cache = fixture.cache; cache.request( field, 0, 0 ); equal( fixture.workers.length, 2, 'checksum failure starts bounded fallback' );
		fixture.workers[ 0 ].finish(); check( cache.request( field, 0, 0 ), 'checksum fallback completes' ); equal( cache.prepared, 0, 'no false prepared corruption' );
		const expected = Uint16Array.from( generateTile( createField( RockBakeConfig( field ) ), 0, 0 ).data, half ), layer = page( cache, field, 0, 0 );
		check( bytes( cache.heightTexture.image.data.subarray( layer * ROCK_SIDE ** 2, ( layer + 1 ) * ROCK_SIDE ** 2 ) ).equals( bytes( expected ) ), 'fallback preserves original generator field' );
	} finally { cache?.dispose(); source?.dispose(); globalThis.fetch = previousFetch; }
} ) );

Deno.test( 'default public prebake loader resolves actual newer PAK bytes through a blob URL and validates gzip payload', async () => fixture( async model => {
	check( ! COM_NewerPackLoaded(), 'isolated test starts without an externally owned newer pack' );
	const field = chart(), encoded = bake( model, [ field ] ), compressed = gzipSync( encoded );
	const name = 'newer/rockfield/packed-fixture-' + serial + '.rf.gz', filename = new TextEncoder().encode( name );
	check( filename.length < 56, 'tiny PAK filename fits native directory' );
	ROCK_BAKES[ model ].file = name; payloadSpec( model, encoded );
	const directory = 12 + compressed.length, raw = new Uint8Array( directory + 64 ), view = new DataView( raw.buffer );
	raw.set( new TextEncoder().encode( 'PACK' ) ); view.setUint32( 4, directory, true ); view.setUint32( 8, 64, true );
	raw.set( compressed, 12 ); raw.set( filename, directory ); view.setUint32( directory + 56, 12, true ); view.setUint32( directory + 60, compressed.length, true );
	const pack = COM_LoadPackFile( 'newer-prebake-fixture.pak', raw.buffer ), previousFetch = globalThis.fetch;
	let requested, source;
	try {
		COM_SetNewerPack( pack );
		globalThis.fetch = ( url, options ) => { requested = url; return previousFetch( url, options ); };
		source = new RockBakeSource( model, [ field ] ); await source.entry.promise;
		check( typeof requested === 'string' && requested.startsWith( 'blob:' ), 'existing pack resolver supplies real blob URL' );
		equal( source.status, 'ready', 'packed gzip decompresses and checksum validates' );
		check( source.tile( field, 0, 0 )?.every( value => value === half( .5 ) ), 'packed source retains exact encoded HALF values' );
	} finally { source?.dispose(); globalThis.fetch = previousFetch; COM_SetNewerPack( null ); }
	check( ! COM_NewerPackLoaded(), 'external pack state restored to initial unloaded state' );
} ) );

async function prefetchSet( fn ) {
	const names = Array.from( { length: 5 }, () => 'maps/rock-bake-lru-' + ++ serial + '.bsp' );
	for ( const name of names ) ROCK_BAKES[ name ] = { file: name + '.rf.gz' };
	for ( const name of names ) payloadSpec( name, bake( name, [ chart() ] ) );
	const records = new Map();
	const loader = ( name, options ) => { const model = name.split( '?' )[ 0 ].slice( 0, -6 ); const record = { signal: options.signal };
		record.promise = new Promise( resolve => { record.release = resolve; } ); records.set( model, record ); return record.promise; };
	try { await fn( names, records, loader ); }
	finally {
		for ( const [ model, record ] of records ) record.release( arrayBuffer( bake( model, [ chart() ] ) ) );
		await Promise.resolve(); await Promise.resolve();
		for ( const name of names ) delete ROCK_BAKES[ name ];
	}
}
Deno.test( 'a fourth pending public prefetch aborts the oldest download and its late result cannot become ready', async () => prefetchSet( async ( names, records, loader ) => {
	const entries = names.slice( 0, 4 ).map( model => R_RockBakePrefetch( model, loader ) );
	await Promise.resolve(); equal( records.size, 4, 'four injected loader endpoints observed' );
	check( records.get( names[ 0 ] ).signal.aborted, 'oldest pending prefetch aborted on eviction' );
	equal( [ ...records.values() ].filter( record => ! record.signal.aborted ).length, 3, 'at most three un-aborted loads' );
	await entries[ 0 ].promise; equal( entries[ 0 ].status, 'fallback', 'evicted entry settles' ); check( /evicted/i.test( entries[ 0 ].error ), 'eviction error retained' );
	for ( let i = 0; i < 4; i ++ ) records.get( names[ i ] ).release( arrayBuffer( bake( names[ i ], [ chart() ] ) ) );
	await Promise.all( entries.map( entry => entry.promise ) ); equal( entries[ 0 ].status, 'fallback', 'late evicted result ignored' ); equal( entries[ 0 ].data, null, 'no evicted decoded allocation' );
	for ( const entry of entries.slice( 1 ) ) equal( entry.status, 'ready', 'retained prefetch completed' );
} ) );

Deno.test( 'active public source remains pinned while preview prefetches evict, and cache disposal releases that pin', async () => prefetchSet( async ( names, records, loader ) => {
	const field = chart(), active = new RockBakeSource( names[ 0 ], [ field ], loader ), entry = active.entry, { cache, workers } = cacheFixture( active );
	const previews = names.slice( 1, 4 ).map( model => R_RockBakePrefetch( model, loader ) );
	try {
		await Promise.resolve(); equal( entry.pins, 1, 'one current source pin' );
		check( ! records.get( names[ 0 ] ).signal.aborted, 'active download retained' ); check( records.get( names[ 1 ] ).signal.aborted, 'oldest unpinned preview aborted' );
		equal( [ ...records.values() ].filter( record => ! record.signal.aborted ).length, 3, 'active plus previews retain three load budget' );
		records.get( names[ 0 ] ).release( arrayBuffer( bake( names[ 0 ], [ chart() ] ) ) );
		await entry.promise; equal( active.status, 'ready', 'active source resolves despite preview churn' ); check( cache.request( field, 0, 0 ), 'active ready tile remains usable' ); equal( workers.length, 0, 'active pin avoids unnecessary fallback' );
		cache.dispose(); equal( entry.pins, 0, 'cache owns source disposal/unpin' ); equal( active.entry, null, 'disposed source releases decoded reference' );
		const last = R_RockBakePrefetch( names[ 4 ], loader ); await Promise.resolve();
		const replacement = R_RockBakePrefetch( names[ 0 ], loader ); check( replacement !== entry, 'released old source can now be evicted' );
		await Promise.resolve();
		for ( const [ model, record ] of records ) record.release( arrayBuffer( bake( model, [ chart() ] ) ) );
		await Promise.all( [ ...previews, last, replacement ].map( item => item.promise ) );
		for ( const retained of [ previews[ 2 ], last, replacement ] ) equal( retained.status, 'ready', 'remaining preview loads complete without timeout' );
	} finally { cache.dispose(); active.dispose(); }
} ) );

Deno.test( 'public prepared loading blocks workers; ready tiles install exact half values without conversion', async () => fixture( async model => {
	const field = chart(); let release, loads = 0;
	const expected = Uint16Array.from( generateTile( createField( RockBakeConfig( field ) ), 0, 0 ).data, half );
	const payload = bake( model, [ field ], ( _, x, y ) => x === 0 && y === 0 ? expected : new Uint16Array( ROCK_SIDE ** 2 ).fill( half( .5 ) ) );
	payloadSpec( model, payload );
	const source = new RockBakeSource( model, [ field ], () => { loads ++; return new Promise( resolve => { release = resolve; } ); } );
	const { cache, workers } = cacheFixture( source );
	try {
		await Promise.resolve(); equal( source.status, 'loading', 'source pending' ); equal( cache.request( field, 0, 0 ), false, 'deferred loading request' );
		equal( workers.length, 0, 'no worker while bake downloads' ); equal( cache.pending.size, 0, 'no generation queue while loading' );
		const entry = R_RockBakePrefetch( model, () => { throw new Error( 'duplicate download' ); } );
		equal( entry, source.entry, 'shared prefetch identity' ); equal( loads, 1, 'one loader' );
		release( arrayBuffer( payload ) );
		await entry.promise; equal( source.status, 'ready', 'source resolved' ); equal( cache.request( field, 0, 0 ), true, 'prepared installed synchronously' );
		equal( workers.length, 0, 'no worker for ready prepared tile' ); equal( cache.prepared, 1, 'prepared count' ); equal( cache.generated, 0, 'no generation count' );
		const layer = page( cache, field, 0, 0 ); check( layer >= 0, 'actual lookup table points to prepared layer' );
		check( bytes( cache.heightTexture.image.data.subarray( layer * ROCK_SIDE ** 2, ( layer + 1 ) * ROCK_SIDE ** 2 ) ).equals( bytes( expected ) ), 'half GPU bytes exact' );
	} finally { cache.dispose(); }
} ) );

Deno.test( 'unknown and missing prepared tiles fall back to bounded real generation without hanging', async () => {
	const field = chart(), unknown = new RockBakeSource( 'maps/unknown-public-test.bsp', [ field ] ); equal( unknown.status, 'fallback', 'unknown level fallback' );
	for ( const source of [ unknown, { status: 'ready', tile: () => null } ] ) {
		const { cache, workers } = cacheFixture( source );
		try { equal( cache.request( field, -3, 4 ), false, 'fallback pending' ); equal( workers.length, 2, 'bounded two workers' );
			workers[ 0 ].finish(); equal( cache.request( field, -3, 4 ), true, 'fallback completed' ); equal( cache.generated, 1, 'one real generated tile' ); equal( cache.prepared, 0, 'no false prepared tile' );
			const expected = Uint16Array.from( generateTile( createField( RockBakeConfig( field ) ), -3, 4 ).data, half );
			const layer = page( cache, field, -3, 4 ); check( bytes( cache.heightTexture.image.data.subarray( layer * ROCK_SIDE ** 2, ( layer + 1 ) * ROCK_SIDE ** 2 ) ).equals( bytes( expected ) ), 'fallback has exact generator GPU values' );
		} finally { cache.dispose(); }
	}
} );

Deno.test( 'public loader/decode failures settle to fallback instead of leaving prepared loading stuck', async () => {
	for ( const kind of [ 'missing', 'stale', 'corrupt' ] ) await fixture( async model => {
		const field = chart(), payload = kind === 'stale' ? changeHeader( bake( model, [ field ] ), metadata => { metadata.version = 'old'; } ) : new Uint8Array( 8 );
		payloadSpec( model, payload );
		const source = new RockBakeSource( model, [ field ], async () => {
			if ( kind === 'missing' ) throw new Error( 'HTTP 404' );
			return arrayBuffer( payload );
		} );
		await source.entry.promise.catch( () => {} ); equal( source.status, 'fallback', kind + ' settles to fallback' ); check( source.entry.error, kind + ' error retained' );
		const { cache, workers } = cacheFixture( source );
		try { cache.request( field, 0, 0 ); equal( workers.length, 2, kind + ' permits generation' ); workers[ 0 ].finish(); check( cache.request( field, 0, 0 ), kind + ' fallback completes' ); }
		finally { cache.dispose(); }
	} );
} );

Deno.test( 'changed chart signature misses prepared data and falls back without attaching the wrong seed/preset', async () => fixture( async model => {
	const original = chart(), changed = { ...original, seed: original.seed + 1 }, source = new RockBakeSource( model, [ changed ], async () => arrayBuffer( bake( model, [ original ] ) ) );
	await source.entry.promise; equal( source.status, 'ready', 'file itself valid' ); equal( source.tile( changed, 0, 0 ), null, 'stale chart is a miss' );
	const { cache, workers } = cacheFixture( source );
	try { cache.request( changed, 0, 0 ); equal( workers.length, 2, 'changed chart starts fallback' ); equal( workers[ 0 ].calls[ 0 ].config.seed, changed.seed, 'fallback uses actual new seed' ); workers[ 0 ].finish(); check( cache.request( changed, 0, 0 ), 'changed chart completes' ); }
	finally { cache.dispose(); }
} ) );

Deno.test( 'prepared GPU cache keeps96 LRU layers and an exact bounded lookup table after eviction', () => {
	const field = chart(), tile = new Uint16Array( ROCK_SIDE ** 2 ).fill( half( .25 ) ), { cache, workers } = cacheFixture( { status: 'ready', tile: () => tile } );
	try {
		for ( let x = 0; x < ROCK_PAGES; x ++ ) check( cache.request( field, x, -2 ), 'prepared initial install' );
		cache.request( field, 0, -2 ); cache.request( field, ROCK_PAGES, -2 );
		equal( cache.tiles.size, ROCK_PAGES, '96 resident cap' ); check( page( cache, field, 0, -2 ) >= 0, 'recent tile retained' ); equal( page( cache, field, 1, -2 ), -1, 'least recent evicted' );
		for ( const resident of cache.tiles.values() ) equal( page( cache, resident.chart, resident.x, resident.y ), resident.page, 'resident table correctness' );
		equal( cache.table.filter( ( _, i ) => i % 4 === 3 && cache.table[ i ] > 0 ).length, ROCK_PAGES, 'no stale table pages' );
		check( cache.probes.value <= ROCK_PROBES, 'bounded collision probes' ); equal( workers.length, 0, 'prepared LRU creates no workers' );
	} finally { cache.dispose(); }
} );

Deno.test( 'packaged prebakes retain base PAK/loose coverage and match source hashes plus one real generated tile for every chart in that subset', async () => {
	const root = new URL( '../', import.meta.url ), manifestPath = new URL( 'newer/rockfield/manifest.json', root );
	check( existsSync( manifestPath ), 'generated prebake manifest exists; missing assets are not a skip' );
	const manifest = JSON.parse( readFileSync( manifestPath, 'utf8' ) ); equal( manifest.version, ROCK_BAKE_VERSION, 'manifest version' );
	for ( const name of [ 'src/rockfield.js', 'src/rockfield_presets.js', 'src/r_rocksurfaces.js', 'src/rockfield_bake_format.js' ] ) equal( manifest.sources[ name ], hash( readFileSync( new URL( name, root ) ) ), name + ' source identity' );
	const names = new Set();
	for ( const name of readdirSync( root ).filter( name => /^pak\d+\.pak$/.test( name ) ).sort() ) {
		const raw = readFileSync( new URL( name, root ) ), pack = COM_LoadPackFile( name, arrayBuffer( raw ) ); COM_AddPack( pack );
		for ( const file of pack.files ) if ( /^maps\/[^/]+\.bsp$/.test( file.name ) ) names.add( file.name );
	}
	const maps = new URL( 'maps/', root );
	if ( existsSync( maps ) ) for ( const filename of readdirSync( maps ).filter( name => name.endsWith( '.bsp' ) ) ) {
		const name = 'maps/' + filename, raw = readFileSync( new URL( name, root ) ), previousFetch = globalThis.fetch;
		try { globalThis.fetch = async () => new Response( raw ); await COM_PreloadLooseFile( name, name ); } finally { globalThis.fetch = previousFetch; } names.add( name );
	}
	// The registry now includes source-distinct expansion maps, including names
	// such as start.bsp shared by several campaigns. Preserve every original
	// base/loose proof without claiming this bounded subset audits all packs.
	for ( const name of names ) check( Array.isArray( manifest.levels[ name ] ) && manifest.levels[ name ].length > 0, name + ' retained in expanded source-bound registry' );
	equal( JSON.stringify( ROCK_BAKES ), JSON.stringify( manifest.levels ), 'runtime registry is exact manifest' );
	VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); let testedCharts = 0, testedTiles = 0;
	for ( const name of [ ...names ].sort() ) {
		const bspSha256 = hash( COM_FindFile( name ).data );
		// Match the real runtime's first exact-source choice, so a stale legacy
		// record cannot be hidden by selecting a preferred namespace in tests.
		const entry = manifest.levels[ name ].find( candidate => candidate.bspSha256 === bspSha256 );
		check( entry, name + ' exact loaded BSP source is packaged' );
		const compressed = readFileSync( new URL( entry.file, root ) );
		equal( compressed.length, entry.compressedBytes, name + ' compressed length' ); equal( hash( compressed ), entry.sha256, name + ' compressed asset hash' );
		equal( hash( COM_FindFile( name ).data ), entry.bspSha256, name + ' actual BSP identity' );
		const unpacked = gunzipSync( compressed ); equal( unpacked.length, entry.bytes, name + ' expanded length' );
		equal( hash( unpacked ), entry.rawSha256, name + ' raw payload identity' );
		const decoded = RockBakeDecode( arrayBuffer( unpacked ), name, bspSha256 ), model = Mod_ForName( name, true );
		cl.worldmodel = model; cl.model_precache[ 1 ] = model; cl.model_precache[ 2 ] = null; GL_BuildLightmaps();
		const charts = R_RockSurfaceCharts( model, { includeBrushes: true } ).charts;
		equal( charts.length, entry.charts, name + ' actual chart count' ); equal( decoded.charts.size, charts.length, name + ' stored chart count' );
		let count = 0;
		for ( const fieldChart of charts ) {
			const coordinates = RockBakeTileCoordinates( fieldChart ), tiles = decoded.charts.get( RockBakeSignature( fieldChart ) ); check( tiles, name + ' actual chart signature' );
			equal( tiles.size, coordinates.length, name + ' full chart halo coverage' ); count += coordinates.length;
			for ( const [ x, y ] of coordinates ) check( tiles.has( x + ',' + y ), name + ' requested tile exists' );
			// Deterministic pseudo-random selection varies with actual chart seed and
			// does not depend on bake ordering or the generator's sample values.
			const chosen = coordinates[ ( Math.imul( fieldChart.seed ^ 0x51f15e, 1664525 ) >>> 0 ) % coordinates.length ];
			const generated = generateTile( createField( RockBakeConfig( fieldChart ) ), ...chosen ), expected = Uint16Array.from( generated.data, half );
			check( bytes( tiles.get( chosen.join( ',' ) ) ).equals( bytes( expected ) ), name + ' every chart random tile real generator parity' ); testedCharts ++; testedTiles ++;
		}
		equal( count, entry.tiles, name + ' full map tile count' );
	}
	console.log( `BAKE COVERAGE ${names.size} maps, ${testedCharts} actual charts, ${testedTiles} random generator tiles` );
} );
