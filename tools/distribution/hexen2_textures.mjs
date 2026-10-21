/**
 * @module distribution/hexen2_textures
 * Reproduce the reviewed Hexen world registry; copy tier bytes, never encode art.
 * Reads retained authoring files (or HEAD blobs in a slim checkout) and the owner's
 * read-only native library. No licensed original pixels are written to the product.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { audit } from '../audit_hexen2_textures.mjs';
import { readMember, sha256 } from '../pak_members.mjs';
import { R_GlassTextureKey } from '../../src/newer/render/r_newertextures.js';

/** The reviewed source catalog; authoring and runtime acceptance remain separate. */
export const HEXEN_TEXTURE_CATALOG = 'assets/authoring/texture_sheets/sources/hexen2-world-2026-10-19/catalog.json';
const OUTPUT = 'assets/game/textures/hexen2';
const require = ( value, message ) => { if ( ! value ) throw Error( message ); };

/** Read local authoring bytes, with a read-only Git fallback for sparse checkouts. */
export async function HexenTextureSource( root, path ) {

	require( path.startsWith( 'assets/authoring/texture_sheets/sources/' ) && ! path.split( '/' ).includes( '..' ), 'Unsafe authoring path' );
	try { return await readFile( resolve( root, path ) ); } catch ( error ) {

		if ( error.code !== 'ENOENT' ) throw error;
		return execFileSync( 'git', [ 'show', 'HEAD:' + path ], { cwd: root, maxBuffer: 8 * 1024 * 1024 } );

	}

}

async function HexenTextureSourceOrReview( root, path ) {

	if ( path.startsWith( 'assets/authoring/' ) ) return HexenTextureSource( root, path );
	require( path.startsWith( 'docs/hexen2/textures/' ) && ! path.split( '/' ).includes( '..' ), 'Unsafe review path' );
	return readFile( resolve( root, path ) );

}

/** Build/check all reviewed bindings and exact tier bytes, independently of edition. */
export async function GenerateHexenTextures( { root = process.cwd(), library = resolve( homedir(), 'quaked' ), check = false } = {} ) {

	const catalogBytes = await HexenTextureSource( root, HEXEN_TEXTURE_CATALOG ), catalog = JSON.parse( catalogBytes );
	require( catalog.family === 'hexen2' && catalog.schemaVersion === 1, 'Unsupported Hexen catalog' );
	const { inventory } = await audit( resolve( library, 'Hexen 2/data1' ), [ resolve( library, 'Hexen 2/portals' ) ] );
	const native = new Map( inventory.variants.map( v => [ v.id, v ] ) ), maps = new Map(), payloads = new Map();
	const proofs = new Map();
	const verify = async ( path, hash ) => {

		if ( ! proofs.has( path ) ) proofs.set( path, sha256( await HexenTextureSourceOrReview( root, path ) ) );
		require( proofs.get( path ) === hash, 'Changed retained proof: ' + path );

	};
	const manifest = { version: 'ht-' + sha256( catalogBytes ).slice( 0, 16 ), textures: {}, sources: {}, ordinaryVariants: {}, provenance: { catalog: HEXEN_TEXTURE_CATALOG, catalogSha256: sha256( catalogBytes ), files: {} } };
	for ( const material of catalog.materials ) {

		// reviewed passes and proven exact-content aliases only (the catalog's later wording names the same states)
		require( /^reviewed offline(?: exact-content alias)?; (?:owner and runtime integration|runtime and owner acceptance) distinct$/.test( material.status ), 'Unreviewed material: ' + material.id );
		await verify( material.masterPackage, material.masterPackageSha256 );
		await verify( material.tierReceipt, material.tierReceiptSha256 );
		for ( const [ path, hash ] of Object.entries( material.reviews ) ) await verify( path, hash );
		require( material.Low.unchanged === true && sha256( await HexenTextureSource( root, material.Low.original ) ) === material.Low.sha256, 'Changed original: ' + material.id );
		const original = native.get( material.id );
		require( original, 'Native identity absent: ' + material.id );
		// Later catalog rows name the identity only (its id); the audit's proofs below still check it against the BSP.
		if ( typeof material.nativeIdentity === 'string' ) require( material.nativeIdentity === material.id, 'Native identity mismatch: ' + material.name );
		else for ( const key of [ 'width', 'height', 'paletteSha256', 'rgbaSha256', 'indexedPixelSha256' ] ) require( original[ key ] === material.nativeIdentity[ key ], 'Native proof mismatch: ' + key + ' (' + material.name + ' ' + material.id.slice( 0, 12 ) + ': audit ' + original[ key ] + ', catalog ' + material.nativeIdentity[ key ] + ')' );
		// Read the unchanged indexed pixels at the independently audited BSP slot.
		const occurrence = original.provenance[ 0 ], profile = inventory.profiles.find( p => p.id === occurrence.profile );
		const member = profile.mapSources.find( m => m.name === occurrence.map );
		const mapId = member.source + ':' + member.offset;
		if ( ! maps.has( mapId ) ) maps.set( mapId, await readMember( { path: member.source, offset: member.offset, size: member.bytes, loose: member.loose } ) );
		const bsp = maps.get( mapId ), lump = bsp.readInt32LE( 20 ), start = lump + bsp.readInt32LE( lump + 4 + occurrence.slot * 4 );
		const offset = start + bsp.readUInt32LE( start + 24 ), pixels = bsp.subarray( offset, offset + original.width * original.height );
		require( sha256( pixels ) === original.indexedPixelSha256, 'Native indexed proof changed' );
		// The audit's RGBA includes the unchanged palette; the engine makes index 255
		// opaque black for WORLD (vid.js VID_SetPalette; gl_model_common.js GL_LoadTexture).
		const rgba = new Uint8Array( original.width * original.height * 4 );
		// The retained native PNG is decoded only for identity; no tier is decoded/re-encoded.
		const { default: sharp } = await import( 'sharp' );
		const decoded = await sharp( await HexenTextureSource( root, material.Low.original ) ).ensureAlpha().raw().toBuffer( { resolveWithObject: true } );
		require( decoded.info.width === original.width && decoded.info.height === original.height && sha256( decoded.data ) === original.rgbaSha256, 'Retained native RGBA mismatch' );
		rgba.set( decoded.data );
		for ( let i = 0; i < pixels.length; i ++ ) if ( pixels[ i ] === 255 ) rgba.fill( 0, i * 4, i * 4 + 3 );
		const key = R_GlassTextureKey( { image: { width: original.width, height: original.height, data: rgba } } );
		const row = { nativeIdentity: material.id, nativeKey: key, file: { low: null }, normal: { tiers: { low: null } }, provenance: { masterPackage: material.masterPackage, masterPackageSha256: material.masterPackageSha256, tierReceipt: material.tierReceipt, tierReceiptSha256: material.tierReceiptSha256, reviews: material.reviews, maps: [ ...new Set( original.provenance.map( p => p.map ) ) ].sort() } };
		for ( const [ label, factor ] of [ [ 'Mid', 4 ], [ 'High', 8 ] ] ) {

			const tier = label.toLowerCase(), spec = material.tiers[ label ];
			require( spec.factor === factor && spec.dimensions[ 0 ] === original.width * factor && spec.dimensions[ 1 ] === original.height * factor, 'Invalid tier dimensions' );
			const roles = {};
			for ( const role of [ 'diffuse', 'height', 'normalX', 'normalY', 'normalZ' ] ) {

				const source = spec.outputs[ role ], file = 'maps/' + source.sha256 + '.webp';
				if ( ! payloads.has( file ) ) {

					const bytes = await HexenTextureSource( root, source.file );
					require( sha256( bytes ) === source.sha256, 'Catalog hash mismatch: ' + source.file );
					payloads.set( file, bytes );
					manifest.provenance.files[ file ] = { sha256: source.sha256, bytes: bytes.length, source: source.file };

				}
				roles[ role ] = file;

			}
			row.file[ tier ] = roles.diffuse;
			row.normal.tiers[ tier ] = { file: roles.height, strength: 1, normalChannels: { x: roles.normalX, y: roles.normalY, z: roles.normalZ } };

		}
		const variants = manifest.ordinaryVariants[ material.name ] ??= {};
		require( ! variants[ key ], 'Duplicate runtime native identity: ' + material.name );
		variants[ key ] = row;
		// An unmatched picture has no base art to fall back to, even for duplicate names.
		( manifest.sources[ material.name ] ??= [] ).push( key );

	}
	const indexBytes = Buffer.from( JSON.stringify( manifest, null, 2 ) + '\n' );
	for ( const [ file, bytes ] of [ ...payloads, [ 'index.json', indexBytes ] ] ) {

		const path = resolve( root, OUTPUT, file );
		if ( check ) require( sha256( await readFile( path ) ) === sha256( bytes ), 'Runtime bytes differ: ' + file );
		else {

			await mkdir( dirname( path ), { recursive: true } );
			const existing = await stat( path ).catch( e => { if ( e.code !== 'ENOENT' ) throw e; return null; } );
			if ( existing ) require( sha256( await readFile( path ) ) === sha256( bytes ), 'Refusing to overwrite different runtime bytes: ' + file );
			else await writeFile( path, bytes, { flag: 'wx' } );

		}

	}
	return { bindings: catalog.materials.length, names: Object.keys( manifest.ordinaryVariants ).length, maps: payloads.size, bytes: [ ...payloads.values() ].reduce( ( n, b ) => n + b.length, 0 ), indexBytes: indexBytes.length };

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) {

	const args = process.argv.slice( 2 ), libraryAt = args.indexOf( '--library' );
	console.log( JSON.stringify( await GenerateHexenTextures( { check: args.includes( '--check' ), ...( libraryAt >= 0 ? { library: args[ libraryAt + 1 ] } : {} ) } ) ) );

}
