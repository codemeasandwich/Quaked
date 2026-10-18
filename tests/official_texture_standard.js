// Tests-only adapter for the owner's 13 October 4x format migration. Historical
// registration inputs stay immutable; each new expectation must link back to its
// exact earlier binding and hashes through the separate migration ledger.
import { readFileSync } from './helpers/resource_fs.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import * as THREE from 'three';
import { sha256 } from '../tools/pak_members.mjs';
import { R_GlassTextureKey } from '../src/newer/render/r_newertextures.js';
import { R_NormalMapFor } from '../src/newer/render/gl_normals.js';
import { ownerQ92Registration } from './owner_texture_q92_standard.js';
import { NormalInputs, NormalGenerate } from '../src/newer/assets/normal_prepare.js';

const root = resolve( import.meta.dirname, '..' );
const read = file => readFileSync( resolve( root, file ) );
const textureBytes = file => read( 'newer/textures/' + file );
const check = ( value, message ) => { if ( ! value ) throw Error( message ); };
const equal = ( actual, expected, message ) => check( isDeepStrictEqual( actual, expected ), message );
export const fourTimesStandard = JSON.parse( read( 'tools/texture_sheets/sources/official-world-2026-10-12/four-times-standard.json' ) );
check( fourTimesStandard.schemaVersion === 1 && fourTimesStandard.factor === 4, 'explicit 4x migration schema' );
check( fourTimesStandard.bindings.length === 14 && fourTimesStandard.trials.length === 16, '14 identities and 16 trial outputs accounted for' );
check( fourTimesStandard.historicalInputs.length === 3, 'three immutable historical registration inputs retained' );
for ( const input of fourTimesStandard.historicalInputs ) equal( sha256( read( input.file ) ), input.sha256, 'historical registration input unchanged: ' + input.file );
const bindings = new Map();
for ( const migration of fourTimesStandard.bindings ) {
	const identity = migration.name + '|' + migration.nativeKey;
	check( ! bindings.has( identity ), 'unique migrated identity: ' + identity ); bindings.set( identity, migration );
}
check( new Set( fourTimesStandard.bindings.map( b => b.current.binding.file ) ).size === 12, '12 distinct registered artworks retained across aliases' );

const sourceDirectory = 'tools/texture_sheets/sources/official-world-2026-10-12/';
const channelRegistration = JSON.parse( read( sourceDirectory + 'q92-channel-registration.json' ) );
const priorQ92 = JSON.parse( read( sourceDirectory + 'q92-prior-generation-migration.json' ) );
const cityRegistration = JSON.parse( read( sourceDirectory + 'city2-registration.json' ) );
const q92Bindings = new Map(), q92Trials = new Map();
const trialFields = [ 'file', 'height', 'width', 'heightPixels', 'diffuseSha256', 'heightSha256' ];
const textureRelative = file => {
	check( file.startsWith( 'newer/textures/' ), 'encoded candidate uses the texture root' ); return file.slice( 'newer/textures/'.length );
};
function lossyWebP( bytes, label ) {
	check( bytes.subarray( 0, 4 ).toString() === 'RIFF' && bytes.subarray( 8, 12 ).toString() === 'WEBP', label + ' is WebP' );
	const chunks = []; let at = 12;
	while ( at + 8 <= bytes.length ) { const size = bytes.readUInt32LE( at + 4 ); check( at + 8 + size <= bytes.length, label + ' bounded WebP chunk' ); chunks.push( bytes.subarray( at, at + 4 ).toString() ); at += 8 + size + ( size & 1 ); }
	check( chunks.includes( 'VP8 ' ) && ! chunks.includes( 'VP8L' ), label + ' uses lossy VP8, not a lossless image' );
}
function validateQ92Entry( entry, expectedAuthoring, expectedOriginal, expectedOriginalSha ) {
	equal( [ entry.factor, entry.quality, entry.lossless ], [ 4, 92, false ], entry.name + ' explicit Q92/4x registration contract' );
	equal( entry.source.key, entry.key, entry.name + ' native source identity retained' );
	equal( entry.source.name, entry.name, entry.name + ' source name retained' );
	const encoded = JSON.parse( read( entry.encodingReceipt ) );
	equal( [ encoded.factor, encoded.quality, encoded.lossless, encoded.normalLayout ], [ 4, 92, false, 'channels' ], entry.name + ' encoder contract' );
	equal( encoded.authoringDiffuse, 'newer/textures/' + expectedAuthoring.file, entry.name + ' exact predecessor candidate path' );
	equal( encoded.authoringDiffuseSha256, expectedAuthoring.sha256, entry.name + ' exact predecessor candidate hash' );
	equal( sha256( read( encoded.authoringDiffuse ) ), expectedAuthoring.sha256, entry.name + ' predecessor candidate bytes retained' );
	equal( encoded.original, expectedOriginal, entry.name + ' original source path retained' );
	equal( encoded.originalSha256, expectedOriginalSha, entry.name + ' original source hash retained' );
	equal( entry.sourceFile, expectedOriginal, entry.name + ' registration source path' );
	equal( entry.sourceFileSha256, expectedOriginalSha, entry.name + ' registration source hash' );
	equal( sha256( read( expectedOriginal ) ), expectedOriginalSha, entry.name + ' immutable original source bytes' );
	const dimensions = [ entry.source.width * 4, entry.source.height * 4 ];
	equal( encoded.comparisonDivisor, 2, entry.name + ' half-native primary diagnostic' );
	equal( encoded.comparisonDimensions, [ entry.source.width / 2, entry.source.height / 2 ], entry.name + ' half-native comparison size' );
	equal( encoded.secondaryComparisonDimensions, [ entry.source.width / 4, entry.source.height / 4 ], entry.name + ' quarter-native secondary size' );
	for ( const [ role, file, digest ] of [
		[ 'diffuse', entry.binding.file, entry.diffuseSha256 ], [ 'height', entry.binding.normal.file, entry.heightSha256 ],
		...[ 'x', 'y', 'z' ].map( axis => [ 'normal' + axis.toUpperCase(), entry.binding.normal.normalChannels[ axis ], entry.normalChannelSha256[ axis ] ] )
	] ) {
		const output = encoded.outputs[ role ];
		equal( [ output.quality, output.lossless ], [ 92, false ], entry.name + ' lossy92 role ' + role ); equal( output.dimensions, dimensions, entry.name + ' 4x encoded dimensions ' + role );
		equal( output.sha256, digest, entry.name + ' registered encoded digest ' + role );
		const encodedBytes = read( output.file ), runtimeBytes = textureBytes( file );
		equal( sha256( encodedBytes ), digest, entry.name + ' encoded file bytes ' + role ); equal( sha256( runtimeBytes ), digest, entry.name + ' runtime file bytes ' + role );
		lossyWebP( encodedBytes, entry.name + ' ' + role );
	}
	equal( entry.candidate, textureRelative( encoded.outputs.diffuse.file ), entry.name + ' registered encoded candidate path' );
	equal( entry.candidateSha256, encoded.outputs.diffuse.sha256, entry.name + ' encoded candidate digest' );
	return encoded;
}
function trialFromQ92( entry, encoded ) {
	return { file: textureRelative( encoded.outputs.diffuse.file ), height: textureRelative( encoded.outputs.height.file ),
		width: encoded.outputs.diffuse.dimensions[ 0 ], heightPixels: encoded.outputs.diffuse.dimensions[ 1 ],
		diffuseSha256: entry.diffuseSha256, heightSha256: entry.heightSha256,
		normalChannels: Object.fromEntries( [ 'x', 'y', 'z' ].map( axis => [ axis, textureRelative( encoded.outputs[ 'normal' + axis.toUpperCase() ].file ) ] ) ),
		normalChannelSha256: entry.normalChannelSha256, original: entry.sourceFile, originalSha256: entry.sourceFileSha256,
		nativeKey: entry.key, factor: 4, quality: 92, lossless: false };
}
equal( channelRegistration.entries.map( e => e.name ).sort(), [ 'city2_3', 'city2_5', 'city2_6', 'tech10_2', 'tech04_4', 'door02_1', 'ceil1_1' ].sort(), 'exact seven separately registered Q92 identities' );
for ( const entry of channelRegistration.entries ) {
	const earlierCity = cityRegistration.entries.find( e => e.name === entry.name && e.key === entry.key );
	const earlierTrial = fourTimesStandard.trials.find( t => t.alias === entry.name && t.nativeKey === entry.key );
	check( earlierCity || earlierTrial, entry.name + ' has a recorded predecessor' );
	let authoring, original, originalSha;
	if ( earlierCity ) {
		equal( entry.previousBinding, earlierCity.binding, entry.name + ' exact prior RGB-normal registration' );
		equal( entry.source, earlierCity.source, entry.name + ' existing native source witness unchanged' );
		const earlierEncoding = JSON.parse( read( earlierCity.encodingReceipt ) );
		equal( sha256( textureBytes( earlierCity.candidate ) ), earlierCity.candidateSha256, entry.name + ' former Q92 candidate retained' );
		equal( sha256( textureBytes( earlierCity.binding.normal.normalFile ) ), earlierCity.normalSha256, entry.name + ' former RGB normal retained' );
		authoring = { file: textureRelative( earlierEncoding.authoringDiffuse ), sha256: earlierEncoding.authoringDiffuseSha256 }; original = earlierCity.sourceFile; originalSha = earlierCity.sourceFileSha256;
	} else {
		equal( entry.previousBinding, null, entry.name + ' was a prepared trial, not a prior runtime binding' );
		authoring = { file: earlierTrial.current.file, sha256: earlierTrial.current.diffuseSha256 }; original = earlierTrial.original; originalSha = earlierTrial.originalSha256;
	}
	const encoded = validateQ92Entry( entry, authoring, original, originalSha );
	if ( earlierTrial ) q92Trials.set( earlierTrial.alias, trialFromQ92( entry, encoded ) );
}
equal( [ priorQ92.schemaVersion, priorQ92.factor, priorQ92.quality, priorQ92.lossless ], [ 1, 4, 92, false ], 'explicit registered prior-generation migration' );
equal( sha256( read( priorQ92.historicalInput.file ) ), priorQ92.historicalInput.sha256, 'immutable 4x predecessor ledger hash' );
equal( priorQ92.entries.length, 14, 'exact fourteen earlier registered identities migrated' ); equal( priorQ92.trials.length, 12, 'exact twelve earlier artworks migrated' );
for ( const entry of priorQ92.entries ) {
	const identity = entry.name + '|' + entry.key, predecessor = bindings.get( identity );
	check( predecessor && ! q92Bindings.has( identity ), 'one recorded Q92 successor per registered 4x identity' );
	equal( entry.previous, predecessor.current, identity + ' complete previous binding/candidate/hashes match immutable 4x ledger' );
	const oldTrial = fourTimesStandard.trials.find( t => t.nativeKey === entry.key && t.current.file === entry.previous.candidate );
	check( oldTrial, identity + ' has its exact historical source trial' );
	const encoded = validateQ92Entry( entry, { file: entry.previous.candidate, sha256: entry.previous.candidateSha256 }, oldTrial.original, oldTrial.originalSha256 );
	q92Bindings.set( identity, entry );
	const transition = priorQ92.trials.find( t => t.alias === oldTrial.alias ); check( transition, identity + ' recorded trial transition' );
	for ( const field of trialFields ) equal( transition.previous[ field ], oldTrial.current[ field ], identity + ' former trial field ' + field );
	equal( transition.previous.original, oldTrial.original, identity + ' former original path' ); equal( transition.previous.originalSha256, oldTrial.originalSha256, identity + ' former original hash' );
	equal( transition.encodingReceipt, entry.encodingReceipt, identity + ' matching encoding receipt' );
	equal( sha256( read( transition.encodingReceipt ) ), transition.encodingReceiptSha256, identity + ' immutable encoding receipt hash' );
	const currentTrial = trialFromQ92( entry, encoded );
	for ( const [ field, value ] of Object.entries( currentTrial ) ) equal( transition.current[ field ], value, identity + ' new trial field ' + field );
	q92Trials.set( oldTrial.alias, currentTrial );
}
equal( q92Trials.size, 16, 'all sixteen original trial expectations have explicit registered Q92 transitions' );

export function registrationsAtFourTimes( historicalEntries ) {
	return historicalEntries.map( original => {
		const migration = bindings.get( original.name + '|' + original.key );
		if ( ! migration ) {
			check( original.kind === 'exact-original-reuse', 'generated binding must have an explicit migration: ' + original.name );
			return ownerQ92Registration( original );
		}
		const previous = original.binding || { file: original.file, normal: original.normal };
		equal( migration.previous.binding, previous, original.name + ' migration starts from exact historical binding' );
		equal( migration.previous.diffuseSha256, original.diffuseSha256, original.name + ' prior diffuse hash retained' );
		equal( migration.previous.heightSha256, original.heightSha256, original.name + ' prior height hash retained' );
		for ( const state of [ migration.previous, migration.current ] ) {
			equal( sha256( textureBytes( state.binding.file ) ), state.diffuseSha256, original.name + ' preserved/current diffuse bytes' );
			equal( sha256( textureBytes( state.binding.normal.file ) ), state.heightSha256, original.name + ' preserved/current height bytes' );
		}
		if ( original.candidate && original.candidateSha256 ) equal( sha256( textureBytes( original.candidate ) ), original.candidateSha256, original.name + ' historical reviewed candidate remains unchanged' );
		const fourTimes = migration.current;
		equal( sha256( textureBytes( fourTimes.candidate ) ), fourTimes.candidateSha256, original.name + ' retained 4x candidate bytes' );
		const trial = fourTimesStandard.trials.find( t => t.current.file === fourTimes.candidate && t.nativeKey === original.key );
		check( trial, original.name + ' current binding has its native-identity trial counterpart' );
		equal( trial.current.heightSha256, fourTimes.heightSha256, original.name + ' 4x predecessor height remains exact' );
		const current = q92Bindings.get( original.name + '|' + original.key ); check( current, original.name + ' has an installed Q92 successor' );
		return { ...original, ...( original.binding ? { binding: current.binding } : { file: current.binding.file, normal: current.binding.normal } ),
			diffuseSha256: current.diffuseSha256, heightSha256: current.heightSha256,
			candidate: current.candidate, candidateSha256: current.candidateSha256, normalChannelSha256: current.normalChannelSha256 };
	} );
}

// Called once by the first public registration suite. Decode all sixteen
// original trial pictures/heights, now installed through explicit Q92 records,
// against reference image dimensions and public native identity rather than
// trusting only the ledger's declared dimensions.
export async function verifyFourTimesTrialDimensions() {
	if ( ! process.env.QUAKED_CANVAS_MODULE ) throw Error( 'Set QUAKED_CANVAS_MODULE to installed @napi-rs/canvas/index.js.' );
	const { createCanvas, Image } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
	const liveTrial = JSON.parse( textureBytes( 'candidates-2026-10-12/trial.json' ) );
	const decode = async bytes => {
		const image = new Image(), done = new Promise( ( resolve, reject ) => { image.onload = resolve; image.onerror = reject; } ); image.src = bytes; await done;
		const ctx = createCanvas( image.width, image.height ).getContext( '2d' ); ctx.drawImage( image, 0, 0 );
		return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };
	};
	for ( const trial of fourTimesStandard.trials ) {
		for ( const state of [ trial.previous, trial.current ] ) {
			equal( sha256( textureBytes( state.file ) ), state.diffuseSha256, trial.alias + ' old/current candidate bytes' );
			equal( sha256( textureBytes( state.height ) ), state.heightSha256, trial.alias + ' old/current height bytes' );
		}
		const current = q92Trials.get( trial.alias ); check( current, trial.alias + ' has an explicit Q92 trial transition' );
		for ( const [ field, value ] of Object.entries( current ) ) equal( liveTrial[ trial.alias ][ field ], value, trial.alias + ' current registered Q92 trial field ' + field );
		equal( sha256( read( trial.original ) ), trial.originalSha256, trial.alias + ' original reference preserved' );
		const original = await decode( read( trial.original ) ), native = new THREE.DataTexture( original.data, original.width, original.height );
		try { equal( R_GlassTextureKey( native ), trial.nativeKey, trial.alias + ' actual original reference identity' ); } finally { native.dispose(); }
		const dimensions = [ original.width * 4, original.height * 4 ];
		equal( trial.targetDimensions, dimensions, trial.alias + ' 4x target derives from actual native dimensions' );
		const picture = await decode( textureBytes( current.file ) ), height = await decode( textureBytes( current.height ) );
		equal( [ picture.width, picture.height ], dimensions, trial.alias + ' decoded trial is exactly 4x native' );
		equal( [ height.width, height.height ], dimensions, trial.alias + ' decoded authored height is exactly 4x native' );
		for ( const axis of [ 'x', 'y', 'z' ] ) {
			const channel = await decode( textureBytes( current.normalChannels[ axis ] ) );
			equal( [ channel.width, channel.height ], dimensions, trial.alias + ' decoded Q92 normal ' + axis + ' is exactly 4x native' );
		}
	}
}

export async function verifyRegisteredNormalChannels( texture, recipe, decode ) {
	if ( ! recipe.normalChannels ) return;
	const channels = await Promise.all( [ 'x', 'y', 'z' ].map( axis => decode( recipe.normalChannels[ axis ] ) ) );
	const { width, height } = texture.image, normal = R_NormalMapFor( texture ), input = NormalInputs( texture );
	for ( const channel of channels ) equal( [ channel.width, channel.height ], [ width, height ], 'registered Q92 channel dimensions match actual material' );
	const expected = new Uint8Array( width * height * 4 );
	for ( let p = 0; p < width * height; p ++ ) expected.set( [ channels[ 0 ].data[ p * 4 ], channels[ 1 ].data[ p * 4 ], channels[ 2 ].data[ p * 4 ], Math.round( texture.userData.newerHeight.data[ p ] * 255 ) ], p * 4 );
	for ( const [ label, bytes ] of [ [ 'foreground', normal.image.data ], [ 'snapshot', input.authored ], [ 'prepared', NormalGenerate( input ).pixels ] ] ) check( bytes && Buffer.from( bytes ).equals( Buffer.from( expected ) ), 'actual Q92 XYZ/height decode reaches ' + label + ' normal data exactly' );
}
