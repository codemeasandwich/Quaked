// Public blood selection and Canvas2D composition. Only image transport and the
// canvas endpoint are stubbed; the manifest, layer renderer and draw path are real.
import assert from 'node:assert/strict';
import { readFileSync } from './helpers/resource_fs.mjs';
import * as face from '../src/newer/ui/r_playerface.js';

// Indices address pose.blood_layers: 0 = H2, 8 = H10; null = no decal.
// Expected draws are owner examples, not derived from the implementation helper.
const samples = [
	[ 100, null, null, 0, [] ],
	[ 95, null, 0, .5, [ [ 0, .5 ] ] ],
	[ 93, null, 0, .7, [ [ 0, .7 ] ] ],
	[ 90, 0, null, 0, [ [ 0, 1 ] ] ],
	[ 64, 2, 3, .6, [ [ 2, 1 ], [ 3, .6 ] ] ],
	[ 10, 8, null, 0, [ [ 8, 1 ] ] ],
	[ 0, 8, null, 0, [ [ 8, 1 ] ] ],
	[ 150, null, null, 0, [] ],
	[ -20, 8, null, 0, [ [ 8, 1 ] ] ]
];
const near = ( actual, expected, label ) => assert.ok( Math.abs( actual - expected ) < 1e-12, `${label}: ${actual} != ${expected}` );
for ( const [ percent, base, next, alpha ] of samples ) Deno.test( `blood crossfade public selection at ${percent}%`, () => {
	const result = face.faceBloodBlend( percent );
	assert.deepEqual( Object.keys( result ).sort(), [ 'alpha', 'base', 'next' ] );
	assert.equal( result.base, base ); assert.equal( result.next, next ); near( result.alpha, alpha, 'alpha' );
} );
Deno.test( 'blood crossfade preserves fractional input and treats unknown health as healthy', () => {
	const result = face.faceBloodBlend( 95.25 );
	assert.equal( result.base, null ); assert.equal( result.next, 0 ); near( result.alpha, .475, 'fractional input' );
	for ( const percent of [ NaN, Infinity, -Infinity, undefined ] ) assert.deepEqual( face.faceBloodBlend( percent ), { base: null, next: null, alpha: 0 } );
} );
Deno.test( 'blood crossfade public composition draws exact decals and restores alpha for later layers', async () => {
	const manifest = JSON.parse( readFileSync( new URL( '../newer/hud/playerface/manifest.json', import.meta.url ) ) );
	const descriptors = Object.fromEntries( [ 'Image', 'document' ].map( key => [ key, Object.getOwnPropertyDescriptor( globalThis, key ) ] ) );
	const oldFetch = globalThis.fetch;
	class Canvas {
		constructor() {
			this.draws = [];
			const stack = [];
			this.context = {
				globalAlpha: 1,
				save() { stack.push( this.globalAlpha ); }, restore() { this.globalAlpha = stack.pop(); },
				translate() {}, rotate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, fill() {}, fillRect() {},
				drawImage: image => this.draws.push( { image, alpha: this.context.globalAlpha } )
			};
		}
		getContext() { return this.context; }
	}
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => new Canvas() } } );
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {
		set src( value ) { this.url = value; queueMicrotask( () => this.onload() ); }
	} } );
	globalThis.fetch = async () => ( { ok: true, json: async () => manifest } );
	try {
		await face.R_PlayerFacePreload();
		assert.equal( face.R_PlayerFaceStatus().state, 'ready' );
		const contains = ( image, target, seen = new Set() ) => {
			if ( image === target ) return true;
			if ( seen.has( image ) ) return false;
			seen.add( image );
			return ( image.draws || [] ).some( draw => contains( draw.image, target, seen ) );
		};
		// Every pose uses its own registered decals; powers exercise the layers
		// after blood, while invisibility exercises the preceding mask.
		for ( const pose of manifest.poses ) for ( const [ healthPercent, , , , expected ] of samples ) {
			const result = face.R_PlayerFaceCompose( { expression: pose.expression, look: pose.look, healthPercent, invisibility: true, strength: true, invulnerability: true } );
			assert.equal( result.complete, true ); assert.deepEqual( result.missing, [] );
			const decalCanvases = pose.blood_layers.map( node => face.R_PlayerFaceLayer( node.asset, pose.id ).canvas );
			const isBlood = draw => decalCanvases.some( decal => contains( draw.image, decal ) );
			const bloodDraws = result.canvas.draws.filter( isBlood );
			assert.equal( bloodDraws.length, expected.length, `${pose.id} ${healthPercent}% decal count` );
			for ( const [ i, [ index, alpha ] ] of expected.entries() ) {
				assert.ok( contains( bloodDraws[ i ].image, decalCanvases[ index ] ), 'exact decal and order' );
				near( bloodDraws[ i ].alpha, alpha, 'draw alpha' );
			}
			const mask = face.R_PlayerFaceLayer( pose.mask_asset, pose.id ).canvas;
			const eyes = face.R_PlayerFaceLayer( pose.eye_layers.mixed.asset, pose.id ).canvas;
			const maskIndex = result.canvas.draws.findIndex( item => item.image === mask );
			assert.ok( maskIndex >= 0, 'invisibility mask remains present' );
			assert.ok( contains( result.canvas.draws.at( -1 ).image, eyes ), 'power eyes remain after blood' );
			for ( const draw of bloodDraws ) assert.ok( maskIndex < result.canvas.draws.indexOf( draw ), 'blood stays after invisibility' );
			for ( const draw of result.canvas.draws.filter( draw => !isBlood( draw ) ) ) assert.equal( draw.alpha, 1, 'other face layers stay fully opaque' );
			assert.equal( result.canvas.context.globalAlpha, 1, 'alpha restored' );
		}
		// Stage-only and stale-percent callers retain the existing authoritative
		// stage contract; the manifest defaults land exactly on full-decal stops.
		for ( let health = 1; health <= 10; health ++ ) {
			const state = { expression: 'normal', look: 'front', health };
			for ( const value of [ state, { ...state, healthPercent: health === 1 ? 0 : 100 } ] ) {
				const result = face.R_PlayerFaceCompose( value );
				assert.equal( result.selection.healthPercent, manifest.health.stages[ health - 1 ].default_percent );
				if ( health > 1 ) {
					const decal = face.R_PlayerFaceLayer( result.selection.pose.blood_layers[ health - 2 ].asset, result.selection.pose.id ).canvas;
					assert.ok( contains( result.canvas.draws.at( -1 ).image, decal ), 'stage-only caller draws its full decal' );
					assert.equal( result.canvas.draws.at( -1 ).alpha, 1 );
				}
			}
		}
	} finally {
		globalThis.fetch = oldFetch;
		for ( const key of [ 'Image', 'document' ] ) if ( descriptors[ key ] ) Object.defineProperty( globalThis, key, descriptors[ key ] ); else delete globalThis[ key ];
	}
} );
