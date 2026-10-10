// Exercise the production loader and material/public readiness interfaces.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as skins from '../src/r_newerskins.js';
import * as anim from '../src/r_anim.js';
const check = ( ok, why ) => { if ( ! ok ) throw Error( why ); };
const equal = ( a, b, why ) => check( a === b, `${why}: ${a} != ${b}` );
const manifest = JSON.parse( readFileSync( new URL( '../newer/enemies/index.json', import.meta.url ) ) );
const ogreLandmarks = JSON.parse( readFileSync( new URL( '../docs/evidence/enemy-face-ogre-alignment-2026-10-07.json', import.meta.url ) ) );
const near = ( actual, expected, why, tolerance = 1e-9 ) => check( Math.abs( actual - expected ) <= tolerance, `${why}: ${actual} != ${expected}` );
function shader( material ) {
	const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
	material.onBeforeCompile( shader ); return shader;
}
async function fixture( fn ) {
	const old = { document: globalThis.document, load: THREE.TextureLoader.prototype.load, normals: anim.r_newer_normals.value };
	const requests = []; globalThis.document = {}; anim.r_newer_normals.value = 0; anim.R_AnimSetNewer( true ); anim.R_AnimSetLighting( true );
	THREE.TextureLoader.prototype.load = function ( url, loaded, _, failed ) {
		const texture = new THREE.DataTexture( new Uint8Array( 16 ).fill( 128 ), 2, 2 ); texture.userData.disposals = 0;
		texture.addEventListener( 'dispose', () => texture.userData.disposals ++ ); requests.push( { url, texture, loaded, failed } ); return texture;
	};
	skins.R_NewerSetIndex( structuredClone( manifest ) );
	try { await fn( requests ); } finally { skins.R_NewerSkinsShutdown(); globalThis.document = old.document; THREE.TextureLoader.prototype.load = old.load; anim.r_newer_normals.value = old.normals; anim.R_AnimSetNewer( false ); anim.R_AnimSetLighting( false ); }
}
Deno.test( 'all individual face choices share the actual body and one sheet; preparation returns actual draw bindings', async () => fixture( async requests => {
	const model = { name: 'progs/soldier.mdl' };
	await skins.R_NewerSkinsPrepare( [ model ] ); equal( requests.length, 3, 'one body, one height, one source sheet' );
	check( ! skins.R_NewerSkinsStatus( [ model ] ).settled, 'actual face downloads hold readiness' );
	requests.forEach( request => request.loaded( request.texture ) );
	const materials = Array.from( { length: 12 }, ( _, i ) => skins.R_NewerAliasMaterial( { _faceSeed: i }, model.name, true ) );
	equal( new Set( materials ).size, 12, 'twelve independent choices simultaneously render different families' );
	equal( new Set( materials.map( material => material.map ) ).size, 1, 'no body texture per individual' );
	const patches = materials.map( shader );
	equal( new Set( patches.map( patch => patch.uniforms.qrFaceSheet.value ) ).size, 1, 'one actual shared sheet' );
	equal( new Set( patches.map( patch => patch.uniforms.uFaceSource.value.toArray().join() ) ).size, 12, 'all twelve authored source faces sampled' );
	equal( new Set( materials.map( material => material.customProgramCacheKey() ) ).size, 1, 'one shader program for these twelve uniform choices' );
	const prepared = skins.R_NewerSkinsMaterials( [ model ] ); equal( prepared.length, 24, 'twelve lit and unlit draw families prepared' );
	check( materials.every( material => prepared.includes( material ) ), 'readiness getter returns actual cached draw materials' );
	check( skins.R_NewerSkinsTextures( [ model ] ).includes( patches[ 0 ].uniforms.qrFaceSheet.value ), 'actual sheet binding participates in GPU upload' );
	equal( requests.length, 3, 'repeated individuals and material/upload queries start no extra downloads' );
	check( patches[ 0 ].fragmentShader.includes( 'mapN = mix( mapN, vec3(0.,0.,1.), qrFaceCoverage )' ), 'old mouth relief is masked' );
	check( patches[ 0 ].fragmentShader.includes( 'uSkinRelit*(1.-qrFaceCoverage)' ), 'old mouth height shadow is masked' );
	check( skins.R_NewerSkinsStatus( [ model ] ).settled, 'sheet callbacks settle existing public readiness' );
	skins.R_NewerSkinsShutdown(); requests.forEach( request => equal( request.texture.userData.disposals, 1, 'owned shared texture disposed exactly once' ) );
} ) );
Deno.test( 'failed or late face sheet retains base skin and assigned identity', async () => fixture( async requests => {
	const model = { name: 'progs/ogre.mdl' }, entity = { _faceSeed: 7 };
	await skins.R_NewerSkinsPrepare( [ model ] );
	const face = requests.find( request => request.url.includes( 'faces/ogre.png' ) );
	requests.filter( request => request !== face ).forEach( request => request.loaded( request.texture ) ); face.failed();
	const material = skins.R_NewerAliasMaterial( entity, model.name, true );
	equal( shader( material ).uniforms.uFaceColorBalance.value.toArray().join(), manifest.models.ogre[ 0 ].faces.colorBalance.join(), 'ogre-only authored color match survives loading failure' ); check( material.map, 'body remains visible after sheet failure' );
	equal( shader( material ).uniforms.uHasFace.value, 0, 'failed sheet cannot overlay invalid pixels' ); equal( entity._faceSeed, 7, 'no reroll on failure' );
	face.loaded( face.texture ); equal( face.texture.userData.disposals, 1, 'late failed request texture retired' );
	equal( shader( skins.R_NewerAliasMaterial( entity, model.name, true ) ).uniforms.uHasFace.value, 0, 'late callback cannot resurrect failed sheet' );
	equal( skins.R_NewerSkinsStatus( [ model ] ).fallback, 1, 'failure truthfully exposed' );
} ) );
Deno.test( 'Classic, enemy gate, lighting and variety switches retain individual identity', async () => fixture( async requests => {
	const model = { name: 'progs/knight.mdl' }, entity = { _faceSeed: 11 };
	await skins.R_NewerSkinsPrepare( [ model ] ); requests.forEach( request => request.loaded( request.texture ) );
	const chosen = skins.R_NewerAliasMaterial( entity, model.name, true );
	equal( shader( chosen ).uniforms.uFaceColorBalance.value.toArray().join(), '1,1,1', 'knight keeps supplied color balance' );
	anim.R_AnimSetClassicPass( true ); equal( skins.R_NewerAliasMaterial( entity, model.name, true ), null, 'Classic has no face replacement' ); anim.R_AnimSetClassicPass( false );
	anim.r_newer_enemies.value = 0; equal( skins.R_NewerAliasMaterial( entity, model.name, true ), null, 'disabled enemies retain original skins' ); anim.r_newer_enemies.value = 1;
	equal( skins.R_NewerAliasMaterial( entity, model.name, true ), chosen, 'same face family returns after Classic/feature toggles' );
	anim.R_AnimSetLighting( false ); equal( shader( skins.R_NewerAliasMaterial( entity, model.name, true ) ).uniforms.uFaceSource.value.toArray().join(), shader( chosen ).uniforms.uFaceSource.value.toArray().join(), 'lighting toggle keeps chosen art' );
	skins.r_newer_variety.value = 0; const first = skins.R_NewerAliasMaterial( entity, model.name, true ); skins.r_newer_variety.value = 1;
	check( first !== chosen, 'variety off visibly selects first face' ); equal( entity._faceSeed, 11, 'identity is not overwritten by preset' );
	anim.R_AnimSetLighting( true ); equal( skins.R_NewerAliasMaterial( entity, model.name, true ), chosen, 'variety resumes original assigned face' );
} ) );

// Independent affine oracle consumes the actual public material uniforms.
// Matrix inversion evaluates where a source landmark will be displayed; no
// shader-source string comparison or copy of the production GLSL is involved.
function alignment( material ) {
	const uniforms = shader( material ).uniforms;
	const coefficients = uniforms.uFaceAlignment.value.toArray(), pivot = uniforms.uFaceTargetPivot.value.toArray(), size = uniforms.uFacePixelSize.value.toArray();
	check( [ ...coefficients, ...pivot, ...size ].every( Number.isFinite ), 'actual alignment uniforms are finite' );
	check( size.every( value => value > 0 ), 'source crop dimensions are positive' );
	const [ c, s, px, py ] = coefficients, [ w, h ] = size;
	const matrix = new THREE.Matrix3().set( c, - s * h / w, px - c * pivot[ 0 ] + s * h / w * pivot[ 1 ], s * w / h, c, py - s * w / h * pivot[ 0 ] - c * pivot[ 1 ], 0, 0, 1 );
	check( matrix.determinant() > 0, 'source sampling is invertible and orientation preserving' );
	const transform = ( point, m = matrix ) => new THREE.Vector3( ...point, 1 ).applyMatrix3( m ).toArray().slice( 0, 2 );
	return { uniforms, coefficients, pivot, size, matrix, sample: point => transform( point ), output: point => transform( point, matrix.clone().invert() ) };
}

Deno.test( 'public ogre material alignment is a conformal rotation in non-square source pixels and keeps the model mask fixed', async () => fixture( async requests => {
	await skins.R_NewerSkinsPrepare( [ { name: 'progs/ogre.mdl' } ] ); requests.forEach( request => request.loaded( request.texture ) );
	const spec = manifest.models.ogre[ 0 ].faces, materials = [], receipts = [];
	for ( let i = 0; i < 12; i ++ ) {
		const entity = { _faceSeed: i }, material = skins.R_NewerAliasMaterial( entity, 'progs/ogre.mdl', true ), a = alignment( material ); materials.push( material );
		const rect = spec.rects[ i ], expectedSize = [ rect[ 2 ] - rect[ 0 ], rect[ 3 ] - rect[ 1 ] ];
		equal( a.size.join(), expectedSize.join(), 'public binding uses actual source pixel dimensions' ); check( a.size[ 0 ] !== a.size[ 1 ], 'fixture exercises non-square crop' );
		const [ w, h ] = a.size, centre = a.sample( a.pivot );
		const delta = point => a.sample( point ).map( ( value, axis ) => ( value - centre[ axis ] ) * a.size[ axis ] );
		const x = delta( [ a.pivot[ 0 ] + 40 / w, a.pivot[ 1 ] ] ), y = delta( [ a.pivot[ 0 ], a.pivot[ 1 ] + 40 / h ] );
		near( Math.hypot( ...x ), Math.hypot( ...y ), 'equal source-pixel basis lengths remain equal under rotation', 1e-8 );
		near( x[ 0 ] * y[ 0 ] + x[ 1 ] * y[ 1 ], 0, 'source-pixel axes stay perpendicular without shear', 1e-8 );
		check( x[ 0 ] * y[ 1 ] - x[ 1 ] * y[ 0 ] > 0, 'transform never reflects the expression' );
		const measuredRoll = Math.atan2( x[ 1 ], x[ 0 ] ) * 180 / Math.PI;
		near( measuredRoll, ogreLandmarks.sourceRollDegrees[ i ], 'inverse sampler rotates with measured source-roll direction' );
		near( Math.hypot( ...x ) / 40, ogreLandmarks.alignments[ i ].scale ?? 1, 'uniform pixel scale matches bounded authored fit' );
		near( centre[ 0 ], a.coefficients[ 2 ], 'target pivot maps exactly to source x pivot' ); near( centre[ 1 ], a.coefficients[ 3 ], 'target pivot maps exactly to source y pivot' );
		equal( JSON.stringify( a.uniforms.uFacePolygon.value.map( p => p.toArray() ) ), JSON.stringify( spec.polygon ), 'model face mask stays fixed across rotated choices' );
		equal( entity._faceSeed, i, 'alignment cannot mutate individual lifetime identity' );
		equal( skins.R_NewerAliasMaterial( entity, 'progs/ogre.mdl', true ), material, 'repeated public request returns same cached face material' );
		const unlit = alignment( skins.R_NewerAliasMaterial( entity, 'progs/ogre.mdl', false ) );
		equal( unlit.coefficients.join(), a.coefficients.join(), 'lit and unlit materials bind identical face alignment' ); equal( unlit.pivot.join(), a.pivot.join(), 'lighting cannot relocate the face pivot' );
		receipts.push( { face: i + 1, measuredRoll, sourcePixelSize: a.size, samplingScale: Math.hypot( ...x ) / 40 } );
	}
	equal( new Set( materials.map( m => m.customProgramCacheKey() ) ).size, 1, 'all affine face choices share one public shader program key' );
	equal( requests.length, 3, 'affine choices reuse one body, height and face-sheet request' );
	console.log( 'OGRE_PUBLIC_ALIGNMENT_PIXEL_AFFINE ' + JSON.stringify( receipts ) );
} ) );

Deno.test( 'actual public inverse bindings level annotated ogre head/ear axes within two degrees and recenter tilted eye pivots', async () => fixture( async requests => {
	const source = readFileSync( new URL( '../newer/enemies/faces/ogre.png', import.meta.url ) );
	equal( createHash( 'sha256' ).update( source ).digest( 'hex' ), ogreLandmarks.sourceSha256, 'independent landmark evidence identifies exact copied source pixels' );
	await skins.R_NewerSkinsPrepare( [ { name: 'progs/ogre.mdl' } ] ); requests.forEach( request => request.loaded( request.texture ) );
	const spec = manifest.models.ogre[ 0 ].faces, receipts = [];
	for ( let i = 0; i < 12; i ++ ) {
		const a = alignment( skins.R_NewerAliasMaterial( { _faceSeed: i }, 'progs/ogre.mdl', true ) ), box = spec.rects[ i ];
		const local = point => point.map( ( value, axis ) => ( value - box[ axis ] ) / a.size[ axis ] );
		const sourceEars = ogreLandmarks.earPairs[ i ], displayedEars = sourceEars.map( point => a.output( local( point ) ).map( ( value, axis ) => value * a.size[ axis ] ) );
		const angle = pair => Math.atan2( pair[ 1 ][ 1 ] - pair[ 0 ][ 1 ], pair[ 1 ][ 0 ] - pair[ 0 ][ 0 ] ) * 180 / Math.PI;
		const before = angle( sourceEars ), after = angle( displayedEars );
		check( Math.abs( after ) <= 2, 'annotated head/ear axis is level within approximate manual landmark tolerance: face ' + ( i + 1 ) + ', residual ' + after );
		if ( ogreLandmarks.sourceRollDegrees[ i ] !== 0 ) {
			check( Math.abs( after ) < Math.abs( before ), 'displayed correction reduces source head roll' );
			const eyes = ogreLandmarks.eyePairs[ i ], midpoint = eyes[ 0 ].map( ( value, axis ) => ( value + eyes[ 1 ][ axis ] ) / 2 );
			const centred = a.output( local( midpoint ) );
			near( centred[ 0 ], .5, 'tilted eye midpoint is horizontally centred in fixed model face' );
			near( centred[ 1 ], local( midpoint )[ 1 ], 'eye height is retained to avoid sampling above source scalp' );
		}
		receipts.push( { face: i + 1, sourceEarAxisDegrees: before, displayedResidualDegrees: after } );
	}
	console.log( 'OGRE_PUBLIC_ALIGNMENT_LANDMARK_RESIDUALS ' + JSON.stringify( receipts ) );
} ) );

Deno.test( 'upright ogre choices and every grunt/knight face retain finite identity sampling defaults', async () => fixture( async requests => {
	const models = [ 'ogre', 'soldier', 'knight' ];
	await skins.R_NewerSkinsPrepare( models.map( name => ( { name: 'progs/' + name + '.mdl' } ) ) ); requests.forEach( request => request.loaded( request.texture ) );
	let controls = 0;
	for ( const name of models ) for ( let i = 0; i < 12; i ++ ) {
		if ( name === 'ogre' && ogreLandmarks.sourceRollDegrees[ i ] !== 0 ) continue;
		const entity = { _faceSeed: i }, a = alignment( skins.R_NewerAliasMaterial( entity, 'progs/' + name + '.mdl', true ) );
		for ( const point of [ [ 0, 0 ], [ .13, .82 ], [ .5, .5 ], [ 1, 1 ] ] ) {
			const sampled = a.sample( point ), displayed = a.output( point );
			point.forEach( ( value, axis ) => { near( sampled[ axis ], value, 'upright/default source sample is identity: ' + name ); near( displayed[ axis ], value, 'upright/default display mapping is identity: ' + name ); } );
		}
		equal( entity._faceSeed, i, 'identity-default sampling preserves per-individual seed' ); controls ++;
	}
	equal( controls, 31, 'all twenty-four other-model faces plus seven upright ogres independently checked' );
	console.log( 'OGRE_PUBLIC_ALIGNMENT_IDENTITY_CONTROLS ' + controls );
} ) );
