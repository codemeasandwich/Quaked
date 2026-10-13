// The data-release uploader (tools/distribution/upload-packs.mjs; docs/per-game-packs-design-2026-10-13.md): it uploads
// only parts the release lacks, never one of a name already there, and refuses a dist/packs that is not exactly what
// the built app lists, a release asset whose size says it is other content, and a release past GitHub's asset limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PackUpload_Manifest, PackUpload_Plan, PackUpload_Confirm, RELEASE_ASSET_LIMIT } from '../tools/distribution/upload-packs.mjs';

const part = ( file, bytes ) => ( { file, bytes, sha256: file.padEnd( 64, '0' ) } );
const packs = { core: { parts: [ part( 'core-a.bin', 5 ) ] }, quake: { parts: [ part( 'quake-1.bin', 10 ), part( 'quake-2.bin', 7 ) ] }, rogue: { parts: [ part( 'rogue-1.bin', 3 ) ] } };
const local = () => new Map( [ 'quake-1.bin', 'quake-2.bin', 'rogue-1.bin' ].map( f => {
	const p = Object.values( packs ).flatMap( x => x.parts ).find( x => x.file === f );
	return [ f, { bytes: p.bytes, sha256: p.sha256 } ];
} ) );

test( 'only the parts the release lacks are uploaded; core is bundled, never uploaded', () => {
	const plan = PackUpload_Plan( packs, local(), new Map( [ [ 'quake-1.bin', { size: 10, state: 'uploaded' } ], [ 'old-part.bin', { size: 99, state: 'uploaded' } ] ] ) );
	assert.deepEqual( plan.upload, [ 'quake-2.bin', 'rogue-1.bin' ] );
	assert.deepEqual( plan.present, [ 'quake-1.bin' ] );
	assert.equal( plan.total, 4, 'earlier versions\' parts stay and count' );
} );

test( 'a dist/packs that is not exactly the listed parts is refused', () => {
	const missing = local(); missing.delete( 'rogue-1.bin' );
	assert.throws( () => PackUpload_Plan( packs, missing, new Map() ), /lacks rogue-1\.bin/ );
	const changed = local(); changed.set( 'quake-2.bin', { bytes: 7, sha256: 'f'.repeat( 64 ) } );
	assert.throws( () => PackUpload_Plan( packs, changed, new Map() ), /not the part the app lists/ );
	const extra = local(); extra.set( 'stray.bin', { bytes: 1, sha256: '0'.repeat( 64 ) } );
	assert.throws( () => PackUpload_Plan( packs, extra, new Map() ), /does not list/ );
} );

test( 'a release asset of a part\'s name but another size is refused, and so is passing the asset limit', () => {
	assert.throws( () => PackUpload_Plan( packs, local(), new Map( [ [ 'quake-1.bin', { size: 11, state: 'uploaded' } ] ] ) ), /a part's name must be its content/ );
	assert.throws( () => PackUpload_Plan( packs, local(), new Map( [ [ 'quake-1.bin', { size: 10, state: 'uploaded', digest: 'sha256:' + 'e'.repeat( 64 ) } ] ] ) ), /digest/ );
	const old = n => new Map( Array.from( { length: n }, ( _, i ) => [ `old-${i}.bin`, { size: 1, state: 'uploaded' } ] ) );
	assert.equal( PackUpload_Plan( packs, local(), old( RELEASE_ASSET_LIMIT - 3 ) ).total, RELEASE_ASSET_LIMIT, 'exactly the limit is allowed' );
	assert.throws( () => PackUpload_Plan( packs, local(), old( RELEASE_ASSET_LIMIT - 2 ) ), /data-2/ );
} );

test( 'the manifest is read from the built page, and a bundled build has nothing to upload', () => {
	const page = assets => `<html><script id="quaked-assets" type="application/json">${JSON.stringify( assets ).replaceAll( '<', '\\u003c' )}</script>`;
	assert.deepEqual( Object.keys( PackUpload_Manifest( page( { profile: 'desktop', packBase: 'https://github.com/x/y/releases/download/data/', packs } ) ) ), [ 'core', 'quake', 'rogue' ] );
	assert.throws( () => PackUpload_Manifest( page( { profile: 'desktop', packBase: null, packs } ) ), /bundled/ );
	assert.throws( () => PackUpload_Manifest( page( { profile: 'web', packBase: 'https://x/', packs } ) ), /Not a desktop build/ );
	assert.throws( () => PackUpload_Manifest( '<html></html>' ), /no asset list/ );
} );

test( 'an asset a cancelled upload left incomplete is replaced, never taken as present; the result is confirmed afresh', () => {
	const plan = PackUpload_Plan( packs, local(), new Map( [ [ 'quake-1.bin', { size: 10, state: 'starter', id: 7 } ], [ 'quake-2.bin', { size: 7, state: 'uploaded', digest: 'sha256:' + 'quake-2.bin'.padEnd( 64, '0' ) } ] ] ) );
	assert.deepEqual( plan.replace, [ { file: 'quake-1.bin', id: 7 } ] );
	assert.deepEqual( plan.upload, [ 'quake-1.bin', 'rogue-1.bin' ] );
	assert.deepEqual( plan.present, [ 'quake-2.bin' ] );
	assert.equal( plan.total, 3, 'the replaced asset is not counted twice' );
	const done = new Map( [ [ 'quake-1.bin', { size: 10, state: 'uploaded' } ], [ 'quake-2.bin', { size: 7, state: 'uploaded' } ], [ 'rogue-1.bin', { size: 3, state: 'uploaded' } ] ] );
	PackUpload_Confirm( packs, done );
	done.set( 'rogue-1.bin', { size: 3, state: 'open' } );
	assert.throws( () => PackUpload_Confirm( packs, done ), /rogue-1\.bin is open/ );
	done.delete( 'rogue-1.bin' );
	assert.throws( () => PackUpload_Confirm( packs, done ), /missing/ );
} );
