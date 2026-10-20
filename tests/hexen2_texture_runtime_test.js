/** Public runtime and distribution contracts for the reviewed Hexen world textures. */
import * as THREE from 'three';
import { readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { GameProfile_Set } from '../src/engine/common/game_profile.js';
import * as vars from '../src/engine/common/cvar.js';
import * as mode from '../src/newer/mode.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { R_GlassTextureKey, R_TextureFile, r_texture_tier } from '../src/newer/render/r_newertextures.js';
import { PackClassifier, PackChain, WEB_DATA_FILES } from '../tools/distribution/packs.mjs';
import { ResourceURL } from '../src/platform/resource_paths.js';
import { audit } from '../tools/audit_hexen2_textures.mjs';
import { pakDirectory, readMember } from '../tools/pak_members.mjs';
import { VID_SetPalette, d_8to24table, d_8to16table, vid } from '../src/engine/render/vid.js';
import { GL_LoadTexture } from '../src/engine/render/gl_model_common.js';
import { existsSync } from 'node:fs';

const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const same = ( a, b, message ) => check( a === b, `${message}: ${a} != ${b}` );
const hash = bytes => createHash( 'sha256' ).update( bytes ).digest( 'hex' );
const catalogPath = 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const source = async path => {

	try { return await readFile( path ); } catch ( e ) {

		if ( e.code !== 'ENOENT' ) throw e;
		return execFileSync( 'git', [ 'show', 'HEAD:' + path ], { maxBuffer: 8 * 1024 * 1024 } );

	}

};
const index = async () => JSON.parse( await readFile( 'assets/game/textures/hexen2/index.json', 'utf8' ) );

Deno.test( 'every reviewed native binding and every byte-identical tier map is registered, without unreviewed art', async () => {

	const bytes = await source( catalogPath ), catalog = JSON.parse( bytes ), manifest = await index();
	same( manifest.provenance.catalogSha256, hash( bytes ), 'catalog provenance' );
	const rows = Object.values( manifest.ordinaryVariants ).flatMap( byKey => Object.values( byKey ) );
	same( rows.length, catalog.materials.length, 'all native identities' );
	same( Object.keys( manifest.ordinaryVariants ).sort().join(), [ ...new Set( catalog.materials.map( m => m.name ) ) ].sort().join(), 'only reviewed names' );
	const files = new Set();
	for ( const material of catalog.materials ) {

		const row = rows.find( r => r.nativeIdentity === material.id );
		check( row, material.id + ' present' );
		check( Object.keys( manifest.ordinaryVariants[ material.name ] ).includes( row.nativeKey ), 'binding indexed by native key' );
		same( R_TextureFile( row.file, 'low' ), null, 'Low stays native' );
		for ( const [ tier, spec ] of Object.entries( material.tiers ) ) {

			const selected = tier.toLowerCase(), normal = row.normal.tiers[ selected ];
			const roles = { diffuse: row.file[ selected ], height: normal.file, normalX: normal.normalChannels.x, normalY: normal.normalChannels.y, normalZ: normal.normalChannels.z };
			for ( const [ role, file ] of Object.entries( roles ) ) {

				check( file, material.name + ' ' + tier + ' ' + role );
				same( hash( await readFile( 'assets/game/textures/hexen2/' + file ) ), spec.outputs[ role ].sha256, 'copied catalog bytes: ' + file );
				files.add( file );

			}

		}

	}
	same( files.size, 400, 'aliases reuse 400 physical maps' );
	const payloads = await readdir( 'assets/game/textures/hexen2/maps', { recursive: true } );
	same( payloads.filter( p => p.endsWith( '.webp' ) ).length, files.size, 'no stray enhanced maps' );
	const pair = manifest.ordinaryVariants.rtex439;
	same( Object.keys( pair ).length, 2, 'same-name distinct native pictures' );
	check( new Set( Object.values( pair ).map( v => v.file.mid ) ).size === 2, 'different pictures have different art' );

} );

Deno.test( 'every reviewed key matches the actual engine WORLD upload of the unchanged owned BSP pixels', async () => {

	const root = '/Users/bri/quaked/Hexen 2';
	if ( ! existsSync( root + '/data1/pak0.pak' ) || ! existsSync( root + '/portals/pak3.pak' ) ) { console.log( 'SKIP: owned Hexen II / Portal data absent' ); return; }
	const manifest = await index(), { inventory } = await audit( root + '/data1', [ root + '/portals' ] );
	const paletteEntry = ( await pakDirectory( root + '/data1/pak0.pak' ) ).get( 'gfx/palette.lmp' );
	const palette = await readMember( paletteEntry ), old = { rgba: d_8to24table.slice(), rgb: d_8to16table.slice(), fullbright: vid.fullbright };
	let checked = 0, index255 = 0;
	try {

		VID_SetPalette( palette ); vid.fullbright = 224;
		for ( const [ name, byKey ] of Object.entries( manifest.ordinaryVariants ) ) for ( const [ key, row ] of Object.entries( byKey ) ) {

			const native = inventory.variants.find( v => v.id === row.nativeIdentity ), p = native.provenance[ 0 ];
			const member = inventory.profiles.find( profile => profile.id === p.profile ).mapSources.find( m => m.name === p.map );
			const bsp = await readMember( { path: member.source, offset: member.offset, size: member.bytes, loose: member.loose } );
			const lump = bsp.readInt32LE( 20 ), at = lump + bsp.readInt32LE( lump + 4 + p.slot * 4 ), begin = at + bsp.readUInt32LE( at + 24 );
			const pixels = bsp.subarray( begin, begin + native.width * native.height );
			const texture = GL_LoadTexture( name, native.width, native.height, pixels, true, false, true );
			same( R_GlassTextureKey( texture ), key, name + ' key through real palette/upload/fullbright split' );
			index255 += pixels.filter( p => p === 255 ).length; checked ++;
			texture._fullbright?.dispose(); texture.dispose();

		}
		// Include a known 255/fullbright witness even if a future reviewed set has neither.
		const witness = GL_LoadTexture( 'witness', 2, 1, new Uint8Array( [ 255, 224 ] ), false, false, true );
		const expected = new Uint8Array( [ 0, 0, 0, 255, ...palette.subarray( 224 * 3, 224 * 3 + 3 ), 255 ] );
		same( R_GlassTextureKey( witness ), R_GlassTextureKey( { image: { width: 2, height: 1, data: expected } } ), 'opaque black 255 and restored fullbright RGB' );
		witness._fullbright?.dispose(); witness.dispose();
		same( checked, 47, 'all native bindings proven' ); console.log( 'Native key proof:', checked, 'bindings;', index255, 'index-255 texels' );

	} finally { d_8to24table.set( old.rgba ); d_8to16table.set( old.rgb ); vid.fullbright = old.fullbright; }

} );

Deno.test( 'all Hexen tier maps and index reach every Hexen edition but no web pack', async () => {

	const manifest = await index(), classify = await PackClassifier();
	const files = [ 'index.json', ...Object.keys( manifest.provenance.files ) ];
	for ( const file of files ) {

		const pack = classify( 'newer/textures/hexen2/' + file );
		for ( const game of [ 'hexen2', 'hexen2-portals', 'hexen2-demo' ] ) check( PackChain( game ).includes( pack ), game + ' can load ' + file );
		check( ! WEB_DATA_FILES.includes( pack ), file + ' excluded from web payloads' );

	}
	for ( const id of [ 'shareware', 'quake', 'hipnotic', 'rogue' ] ) check( ! PackChain( id ).includes( 'hexen2' ), 'Quake never needs Hexen pack' );

} );

const flush = async () => { for ( let i = 0; i < 80; i ++ ) await Promise.resolve(); };
async function fixture( run ) {

	const controls = [ r_hdr, mode.r_newer_textures, r_texture_tier ];
	for ( const c of controls ) if ( ! vars.Cvar_FindVar( c.name ) ) vars.Cvar_RegisterVariable( c );
	const old = { fetch: globalThis.fetch, Image: Object.getOwnPropertyDescriptor( globalThis, 'Image' ), document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), values: controls.map( c => c.string ), classic: mode.R_ClassicPassActive() };
	const native = value => new THREE.DataTexture( new Uint8Array( [ value, 30, 40, 255 ] ), 1, 1 );
	const a = native( 20 ), b = native( 60 ), unknown = native( 99 ), images = [], fetches = [];
	const recipe = prefix => ( { file: { low: null, mid: prefix + '-mid.webp', high: prefix + '-high.webp' }, normal: { tiers: Object.fromEntries( [ 'mid', 'high' ].map( t => [ t, { file: prefix + '-' + t + '-height.webp', normalChannels: { x: prefix + '-' + t + '-x.webp', y: prefix + '-' + t + '-y.webp', z: prefix + '-' + t + '-z.webp' } } ] ) ) } } );
	const manifest = { version: 1, textures: {}, sources: { rtex439: [] }, ordinaryVariants: { rtex439: { [ R_GlassTextureKey( a ) ]: recipe( 'base' ), [ R_GlassTextureKey( b ) ]: recipe( 'portal' ) } } };
	globalThis.fetch = async url => { fetches.push( ResourceURL( url, true ) ); return { ok: true, json: async () => manifest }; };
	Object.defineProperty( globalThis, 'Image', { configurable: true, value: class {

		constructor() { images.push( this ); }
		set src( value ) { this.file = ResourceURL( value, true ).split( '?' )[ 0 ]; }
		finish() {

			this.width = this.height = this.file.includes( '-high' ) ? 8 : 4;
			this.pixels = new Uint8ClampedArray( this.width * this.height * 4 ).fill( this.file.includes( 'portal' ) ? 180 : 80 );
			this.onload?.();

		}

	} } );
	Object.defineProperty( globalThis, 'document', { configurable: true, value: { createElement: () => {

		let image;
		return { getContext: () => ( { drawImage: value => image = value, getImageData: () => ( { data: image.pixels } ) } ) };

	} } } );
	GameProfile_Set( 'hexen2' ); mode.R_AnimSetClassicPass( false );
	vars.Cvar_SetValue( r_hdr.name, 1 ); vars.Cvar_SetValue( mode.r_newer_textures.name, 1 ); vars.Cvar_SetValue( r_texture_tier.name, 1 );
	try {

		const api = await import( '../src/newer/render/r_newertextures.js?ht-' + Math.random() );
		await run( { api, a, b, unknown, images, fetches, finish: async () => { await flush(); for ( const img of images ) if ( img.onload ) img.finish(); await flush(); }, model: { textures: [ { name: 'rtex439', gl_texture: a }, { name: 'rtex439', gl_texture: b }, { name: 'rtex439', gl_texture: unknown } ] } } );

	} finally {

		for ( const img of images ) if ( img.onload ) img.finish(); await flush();
		globalThis.fetch = old.fetch;
		for ( const k of [ 'Image', 'document' ] ) if ( old[ k ] ) Object.defineProperty( globalThis, k, old[ k ] ); else delete globalThis[ k ];
		controls.forEach( ( c, i ) => vars.Cvar_Set( c.name, old.values[ i ] ) ); mode.R_AnimSetClassicPass( old.classic ); GameProfile_Set( 'quake' );
		a.dispose(); b.dispose(); unknown.dispose();

	}

}

Deno.test( 'same-name Hexen identities use matching tier relief and switch live Mid High Low Mid on one model', () => fixture( async f => {

	const original = f.a.image;
	for ( const [ tier, width ] of [ [ 1, 4 ], [ 2, 8 ], [ 0, 1 ], [ 1, 4 ] ] ) {

		vars.Cvar_SetValue( 'r_texture_tier', tier ); f.api.R_NewerTexturesFrame( f.model ); await f.finish();
		same( f.a.image.width, width, 'selected tier dimensions' ); same( f.b.image.width, width, 'other native picture dimensions' );
		if ( tier ) {

			same( f.a.image.data[ 0 ], 80, 'base picture' ); same( f.b.image.data[ 0 ], 180, 'Portal picture' );
			same( f.a.userData.newerHeight.width, width, 'matching height' ); same( f.a.userData.newerHeight.authoredNormal.width, width, 'matching XYZ' );
			same( f.api.R_ClassicTexture( f.a ).image.data, original.data, 'Classic remains native' );

		} else { same( f.a.image, original, 'Low uses exact original object' ); same( f.a.userData.newerHeight, undefined, 'no enhanced relief in Low' ); }
		same( f.unknown.image.width, 1, 'unknown key remains native' );

	}
	check( f.images.every( image => image.file.startsWith( 'newer/textures/hexen2/' ) ), 'a Hexen key never requests Quake art' );
	check( f.fetches.every( file => file === 'newer/textures/hexen2/index.json' ), 'Hexen namespace only' );

} ) );

Deno.test( 'obsolete pending tier loads cannot overwrite High or native Low; Classic never upgrades', () => fixture( async f => {

	f.api.R_NewerTexturesFrame( f.model ); await flush();
	check( f.images.length > 0, 'Mid is pending' );
	vars.Cvar_SetValue( 'r_texture_tier', 2 ); f.api.R_NewerTexturesFrame( f.model ); await f.finish();
	same( f.a.image.width, 8, 'stale Mid did not overwrite High' );
	vars.Cvar_SetValue( 'r_texture_tier', 1 ); f.api.R_NewerTexturesFrame( f.model );
	vars.Cvar_SetValue( 'r_texture_tier', 0 ); f.api.R_NewerTexturesFrame( f.model ); await f.finish();
	same( f.a.image.width, 1, 'stale enhanced request did not overwrite Low' );
	vars.Cvar_SetValue( 'r_hdr', 0 ); vars.Cvar_SetValue( 'r_texture_tier', 2 ); f.api.R_NewerTexturesFrame( f.model ); await f.finish();
	same( f.a.image.width, 1, 'Classic keeps native pixels' );

} ) );

Deno.test( 'Classic reversion cancels a pending upgrade before its images arrive', () => fixture( async f => {

	const original = f.a.image;
	f.api.R_NewerTexturesFrame( f.model ); await flush();
	check( f.a.userData.newerPending, 'Mid request is pending' );
	vars.Cvar_SetValue( 'r_hdr', 0 ); f.api.R_NewerTexturesRevert(); await f.finish();
	same( f.a.image, original, 'late Mid cannot replace native Classic' );
	same( f.a.userData.newerPending, false, 'cancelled request no longer pending' );
	check( ! f.a.userData.newerPicture, 'late request cannot mark enhancement installed' );
	vars.Cvar_SetValue( 'r_hdr', 1 ); f.api.R_NewerTexturesFrame( f.model );
	// A fresh explicit model request must remain possible after cancellation.
	f.api.R_NewerTexturesForModel( f.model ); await f.finish(); same( f.a.image.width, 4, 'Enhanced can request again' );

} ) );
