// Publishes the Mac app's downloadable game packs (dist/packs, written by build.mjs desktop with QUAKED_PACK_BASE) as
// assets of the GitHub release tagged `data`, which the app downloads them from (src-tauri/src/packs.rs;
// docs/per-game-packs-design-2026-10-13.md). First it checks dist/packs against the list the built app embeds
// (dist/desktop/index.html, `quaked-assets`): every part present at its size and SHA-256, nothing else. Parts are named
// by their content, so a part already fully uploaded is the same bytes and is skipped (GitHub refuses a second asset
// of one name); no uploaded part is ever replaced or deleted, so earlier app versions keep theirs. The one deletion is
// an asset a cancelled run left incomplete, which is uploaded again. Creates the release on first use. Afterwards it
// lists the release again (every part uploaded, at its size and digest), downloads the new parts through the address
// the app uses, and writes dist/packs-receipt.json, which archive-mac.mjs requires. Run by the Distribution workflow's
// Apple Silicon Mac job on a Prod promotion; needs `gh`, GH_TOKEN with contents: write, and GITHUB_REPOSITORY.
//
//   node tools/distribution/upload-packs.mjs [--dry-run]
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The release the app's QUAKED_PACK_BASE names (https://github.com/<repo>/releases/download/data/). */
export const DATA_RELEASE_TAG = 'data';
/** GitHub's limit on one release's assets; past this many the uploader stops, and a `data-2` release is needed. */
export const RELEASE_ASSET_LIMIT = 1000;

/**
 * The embedded asset list of a built app page: its packs, each with its parts ({ file, bytes, sha256 }).
 *
 * @param {string} html dist/desktop/index.html
 * @returns {Object<string, { parts: Array<{ file: string, bytes: number, sha256: string }> }>} the packs
 * @throws {Error} when the page has no asset list or names no pack host (a bundled build has nothing to upload)
 */
export function PackUpload_Manifest( html ) {

	const json = /<script id="quaked-assets" type="application\/json">([\s\S]*?)<\/script>/.exec( html )?.[ 1 ];
	if ( ! json ) throw Error( 'The built page has no asset list (quaked-assets)' );
	const assets = JSON.parse( json ); // (build.mjs escapes '<' as \u003c, which JSON.parse reads back)
	if ( assets.profile !== 'desktop' ) throw Error( 'Not a desktop build: ' + assets.profile );
	if ( ! assets.packBase ) throw Error( 'The build names no pack host (QUAKED_PACK_BASE): its packs are bundled, nothing to upload' );
	return assets.packs ?? {};

}

/**
 * What to upload: checks the local parts against the manifest and the release's assets, and lists the parts the
 * release lacks. A release asset of a part's name that is not fully uploaded (an upload a cancelled run left behind)
 * counts as absent and is replaced; one that is uploaded must be the same size and, when GitHub reports it, the same
 * SHA-256 (its `digest`), since a part's name is its content.
 *
 * @param {Object<string, { parts: Array<{ file: string, bytes: number, sha256: string }> }>} packs the manifest's packs
 * @param {Map<string, { bytes: number, sha256: string }>} local the files in dist/packs
 * @param {Map<string, { size: number, state?: string, digest?: ?string, id?: number }>} existing the release's assets
 * @returns {{ upload: Array<string>, replace: Array<{ file: string, id: number }>, present: Array<string>, total: number }}
 *   names to upload, incomplete assets to delete first (and upload), names already there, and how many assets the
 *   release will hold
 * @throws {Error} when a part is missing, the wrong size or content, a file is not in the manifest, an uploaded release
 *   asset of a part's name has another size or digest, or the release would pass RELEASE_ASSET_LIMIT
 */
export function PackUpload_Plan( packs, local, existing ) {

	const wanted = PackUpload_Wanted( packs );
	for ( const [ file, part ] of wanted ) {

		const have = local.get( file );
		if ( ! have ) throw Error( `dist/packs lacks ${file}` );
		if ( have.bytes !== part.bytes || have.sha256 !== part.sha256 ) throw Error( `dist/packs/${file} is not the part the app lists (${have.bytes} bytes, sha256 ${have.sha256})` );

	}
	for ( const file of local.keys() ) if ( ! wanted.has( file ) ) throw Error( `dist/packs has ${file}, which the app does not list` );
	const upload = [], replace = [], present = [];
	for ( const [ file, part ] of wanted ) {

		const asset = existing.get( file );
		if ( ! asset ) { upload.push( file ); continue; }
		if ( asset.state !== undefined && asset.state !== 'uploaded' ) { replace.push( { file, id: asset.id } ); upload.push( file ); continue; }
		if ( asset.size !== part.bytes ) throw Error( `The release's ${file} is ${asset.size} bytes, not ${part.bytes}: a part's name must be its content` );
		if ( asset.digest && asset.digest !== 'sha256:' + part.sha256 ) throw Error( `The release's ${file} has digest ${asset.digest}, not sha256:${part.sha256}` );
		present.push( file );

	}
	const total = existing.size + upload.length - replace.length;
	if ( total > RELEASE_ASSET_LIMIT ) throw Error( `The ${DATA_RELEASE_TAG} release would hold ${total} assets, past GitHub's ${RELEASE_ASSET_LIMIT}: start a data-2 release` );
	return { upload: upload.sort(), replace, present: present.sort(), total };

}

/**
 * The parts the app downloads (every pack's but `core`'s, which is bundled), by file name.
 *
 * @param {Object<string, { parts: Array<{ file: string, bytes: number, sha256: string }> }>} packs the manifest's packs
 * @returns {Map<string, { file: string, bytes: number, sha256: string }>} the parts
 */
export function PackUpload_Wanted( packs ) {

	const wanted = new Map();
	for ( const [ pack, { parts = [] } ] of Object.entries( packs ) ) if ( pack !== 'core' ) for ( const part of parts ) wanted.set( part.file, part );
	return wanted;

}

/**
 * Checks that every part the app lists is in the release, fully uploaded, at its size and (where GitHub reports it)
 * digest: the uploader's last word before it writes its receipt.
 *
 * @param {Object<string, { parts: Array<object> }>} packs the manifest's packs
 * @param {Map<string, { size: number, state?: string, digest?: ?string }>} existing the release's assets, listed afresh
 * @throws {Error} naming the first part that is missing, incomplete or different
 */
export function PackUpload_Confirm( packs, existing ) {

	for ( const [ file, part ] of PackUpload_Wanted( packs ) ) {

		const asset = existing.get( file );
		if ( ! asset || ( asset.state !== undefined && asset.state !== 'uploaded' ) ) throw Error( `The release's ${file} is ${asset ? asset.state : 'missing'} after the upload` );
		if ( asset.size !== part.bytes || ( asset.digest && asset.digest !== 'sha256:' + part.sha256 ) ) throw Error( `The release's ${file} is not the listed part after the upload` );

	}

}

const gh = ( ...args ) => execFileSync( 'gh', args, { encoding: 'utf8', stdio: [ 'ignore', 'pipe', 'pipe' ], maxBuffer: 64 << 20 } );

// the release's assets (name -> size, state, digest, id), or null when there is no such release; any other failure
// (authentication, rate limit, network) stops the run rather than being taken for a missing release
function releaseAssets( repo ) {

	let id;
	try { id = JSON.parse( gh( 'api', `repos/${repo}/releases/tags/${DATA_RELEASE_TAG}` ) ).id; }
	catch ( error ) { if ( /HTTP 404|Not Found/i.test( String( error.stderr ?? error.message ) ) ) return null; throw error; }
	const assets = new Map();
	const rows = gh( 'api', '--paginate', `repos/${repo}/releases/${id}/assets?per_page=100`, '--jq', '.[] | [.name, .size, .state, (.digest // ""), .id] | @tsv' );
	for ( const line of rows.split( '\n' ) ) {

		if ( ! line ) continue;
		const [ name, size, state, digest, assetId ] = line.split( '\t' );
		assets.set( name, { size: Number( size ), state, digest: digest || null, id: Number( assetId ) } );

	}
	return assets;

}

async function main() {

	const root = resolve( fileURLToPath( new URL( '../../', import.meta.url ) ) ), dry = process.argv.includes( '--dry-run' );
	// a real run names its repository (the workflow's GITHUB_REPOSITORY): a local run cannot upload to the real release
	// by accident through the owner's own gh login
	const repo = process.env.GITHUB_REPOSITORY ?? ( dry ? 'codemeasandwich/Quaked' : null );
	if ( ! repo ) throw Error( 'Set GITHUB_REPOSITORY to upload (or pass --dry-run)' );
	const packs = PackUpload_Manifest( await readFile( resolve( root, 'dist/desktop/index.html' ), 'utf8' ) );
	const local = new Map();
	for ( const file of await readdir( resolve( root, 'dist/packs' ) ) ) { // strict: any other file there is refused

		const bytes = await readFile( resolve( root, 'dist/packs', file ) );
		local.set( file, { bytes: bytes.length, sha256: createHash( 'sha256' ).update( bytes ).digest( 'hex' ) } );

	}
	let existing = dry ? new Map() : releaseAssets( repo );
	if ( existing === null ) {

		gh( 'release', 'create', DATA_RELEASE_TAG, '--repo', repo, '--title', 'Quaked game data', '--latest=false', '--prerelease',
			'--notes', 'Game data packs the Quaked Mac app downloads for each game (parts named by their content). Not an app release.' );
		existing = new Map();
		console.log( `Created the ${DATA_RELEASE_TAG} release` );

	}
	const plan = PackUpload_Plan( packs, local, existing );
	console.log( JSON.stringify( { release: DATA_RELEASE_TAG, upload: plan.upload.length, replace: plan.replace.length, present: plan.present.length, total: plan.total, dryRun: dry } ) );
	if ( dry ) { for ( const file of plan.upload ) console.log( 'would upload ' + file ); return; }
	// the one deletion: an asset a cancelled upload left incomplete, which holds its part's name
	for ( const { file, id } of plan.replace ) { gh( 'api', '-X', 'DELETE', `repos/${repo}/releases/assets/${id}` ); console.log( 'removed incomplete ' + file ); }
	for ( const file of plan.upload ) {

		try { gh( 'release', 'upload', DATA_RELEASE_TAG, resolve( root, 'dist/packs', file ), '--repo', repo ); }
		catch ( error ) {

			// another run uploaded it meanwhile: fine once it is fully uploaded at this size (the name is the content)
			const now = releaseAssets( repo )?.get( file );
			if ( now?.state !== 'uploaded' || now.size !== local.get( file ).bytes ) throw error;

		}
		console.log( 'uploaded ' + file );

	}
	const final = releaseAssets( repo );
	PackUpload_Confirm( packs, final );
	// and through the address the app uses (GitHub's redirect to its download host), for the new parts and one other
	const base = `https://github.com/${repo}/releases/download/${DATA_RELEASE_TAG}/`, check = [ ...plan.upload, ...plan.present.slice( 0, 1 ) ];
	for ( const file of check ) {

		const response = await fetch( base + file, { redirect: 'follow' } );
		if ( ! response.ok ) throw Error( `${base}${file}: HTTP ${response.status}` );
		const sha256 = createHash( 'sha256' ).update( Buffer.from( await response.arrayBuffer() ) ).digest( 'hex' );
		if ( sha256 !== local.get( file ).sha256 ) throw Error( `${base}${file} downloads as other content (sha256 ${sha256})` );

	}
	// the receipt archive-mac.mjs requires before it archives an app that downloads from this release
	const parts = [ ...PackUpload_Wanted( packs ).values() ].map( p => ( { file: p.file, bytes: p.bytes, sha256: p.sha256, state: final.get( p.file ).state, digest: final.get( p.file ).digest } ) );
	await writeFile( resolve( root, 'dist/packs-receipt.json' ), JSON.stringify( { repo, tag: DATA_RELEASE_TAG, base, parts, downloaded: check }, null, 1 ) + '\n' );
	console.log( `confirmed ${parts.length} parts; downloaded ${check.length} through ${base}` );

}

if ( process.argv[ 1 ] && resolve( process.argv[ 1 ] ) === fileURLToPath( import.meta.url ) ) await main();
