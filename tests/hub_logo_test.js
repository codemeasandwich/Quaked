// Public loader/normal pipeline against the shipped START plaque and installed
// SVG-derived artwork. A software canvas decodes assets; no server is started.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as vars from '../src/cvar.js';
import { r_hdr, R_RegisterDetail, R_RefreshDetail, R_PostBegin } from '../src/gl_post.js';
import * as post from '../src/gl_post.js';
import * as anim from '../src/r_anim.js';
import { r_newer_textures, r_newer_normals, R_AnimSetClassicPass } from '../src/r_anim.js';
import { R_NewerTextureUpgrade, R_ClassicTexture, R_NewerTexturesRevert } from '../src/r_newertextures.js';
import { R_NormalMapFor, R_NormalsFromCraftedHeight } from '../src/gl_normals.js';

const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const equal = ( a, b, message ) => check( a === b, `${message}: ${a} != ${b}` );
const index = JSON.parse( read( 'newer/textures/index.json' ) );
const record = JSON.parse( read( 'docs/evidence/hub-logo-assets-2026-10-03.json' ) );
const pak = read( 'pak0.pak' );
function packFile( name ) {

	const offset = pak.readInt32LE( 4 ), length = pak.readInt32LE( 8 );
	for ( let p = offset; p < offset + length; p += 64 ) if ( pak.subarray( p, p + 56 ).toString().split( '\0' )[ 0 ] === name ) {

		const start = pak.readInt32LE( p + 56 ); return pak.subarray( start, start + pak.readInt32LE( p + 60 ) );

	}
	throw new Error( 'Missing shipped ' + name );

}
const bsp = packFile( 'maps/start.bsp' ), palette = packFile( 'gfx/palette.lmp' );
const textureLump = bsp.readInt32LE( 20 );
let native;
for ( let i = 0; i < bsp.readInt32LE( textureLump ); i ++ ) {

	const relative = bsp.readInt32LE( textureLump + 4 + i * 4 ); if ( relative < 0 ) continue;
	const p = textureLump + relative;
	if ( bsp.subarray( p, p + 16 ).toString().split( '\0' )[ 0 ] !== 'quake' ) continue;
	const width = bsp.readInt32LE( p + 16 ), height = bsp.readInt32LE( p + 20 );
	const pixels = bsp.subarray( p + bsp.readInt32LE( p + 24 ), p + bsp.readInt32LE( p + 24 ) + width * height );
	const data = new Uint8Array( width * height * 4 );
	for ( let k = 0; k < pixels.length; k ++ ) { data.set( palette.subarray( pixels[ k ] * 3, pixels[ k ] * 3 + 3 ), k * 4 ); data[ k * 4 + 3 ] = 255; }
	native = { data, width, height }; break;

}
const requests = [], texture = new THREE.DataTexture( native.data, native.width, native.height );
let carvedAlphaExpression = null;
texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.flipY = false;
texture.offset.set( .125, .25 ); texture.repeat.set( 1, 1 );

async function decode( file ) {

	const image = new NativeImage(); image.src = read( file ); await image.decode();
	const canvas = createCanvas( image.width, image.height ), ctx = canvas.getContext( '2d' );
	ctx.drawImage( image, 0, 0 ); return { width: image.width, height: image.height, data: ctx.getImageData( 0, 0, image.width, image.height ).data };

}

async function fixture( fn ) {

	const saved = { Image: globalThis.Image, document: globalThis.document, fetch: globalThis.fetch, hdr: r_hdr.string, textures: r_newer_textures.value };
	if ( ! vars.Cvar_FindVar( r_hdr.name ) ) vars.Cvar_RegisterVariable( r_hdr );
	vars.Cvar_Set( r_hdr.name, '1' ); r_newer_textures.value = 1;
	globalThis.Image = class extends NativeImage { set src( path ) { requests.push( path ); super.src = read( String( path ).split( '?' )[ 0 ] ); } };
	globalThis.document = { createElement: name => { equal( name, 'canvas', 'software decoder' ); return createCanvas( 1, 1 ); } };
	globalThis.fetch = async () => ( { ok: true, json: async () => index } );
	try { await fn(); } finally {

		globalThis.Image = saved.Image; globalThis.document = saved.document; globalThis.fetch = saved.fetch;
		vars.Cvar_Set( r_hdr.name, saved.hdr ); r_newer_textures.value = saved.textures; R_AnimSetClassicPass( false );

	}

}

Deno.test( 'hub logo retains the real 288x64 START plaque aspect and faithful supplied SVG identity', () => {

	equal( native.width, 288, 'native plaque width' ); equal( native.height, 64, 'native plaque height' );
	equal( record.outputSize[ 0 ] / record.outputSize[ 1 ], native.width / native.height, 'output aspect without UV stretching' );
	equal( record.svgSha256, createHash( 'sha256' ).update( read( 'logo.svg' ) ).digest( 'hex' ), 'actual SVG asset provenance' );
	check( record.meanGlyphHeight < record.meanBackgroundHeight - .1, 'logo is recessed into the continued wall' );
	check( record.glyphPixels > 10000 && record.originalLetteringReused === false, 'substantial new logo with original word removed' );
	const [ left, top, width, height ] = record.glyphBounds;
	check( left > 0 && top > 0 && left + width < record.outputSize[ 0 ] && top + height < record.outputSize[ 1 ], 'glyph fits inside plaque margins' );

} );

Deno.test( 'logo albedo continues native wall alignment exactly and only SVG strokes lower its existing height', async () => {

	const { default: sharp } = await import( pathToFileURL( process.env.QUAKED_SHARP_MODULE ).href );
	const [ left, top, width, height ] = record.glyphBounds;
	const { data: mask, info } = await sharp( read( 'logo.svg' ), { density: 288 } ).ensureAlpha().trim( { threshold: 0 } ).resize( { width, height, fit: 'inside' } ).raw().toBuffer( { resolveWithObject: true } );
	equal( info.width, width, 'source glyph width' ); equal( info.height, height, 'source glyph height' );
	const relief = await decode( 'newer/textures/' + index.normals.quake.file ), albedo = await decode( 'newer/textures/' + index.textures.quake );
	equal( relief.width, albedo.width, 'asset widths registered' ); equal( relief.height, albedo.height, 'asset heights registered' );
	const wallAlbedo = await decode( 'newer/textures/' + index.textures.wizmet1_2 ), wallHeight = await decode( 'newer/textures/' + index.normals.wizmet1_2.file );
	equal( wallAlbedo.width, 256, 'actual wall artwork width' ); equal( wallAlbedo.height, 256, 'actual wall artwork height' );
	equal( wallHeight.width, 256, 'actual wall height width' ); equal( wallHeight.height, 256, 'actual wall height height' );
	// Derive the original mapping independently from the native BSP. The logo
	// faces begin at x400,z328; quake S=x-112,T=-z+8 and adjacent metal S=x,
	// T=-z+8. At the plaque's first pixel, metal therefore starts at U=.25,V=0.
	const texinfoStart = bsp.readInt32LE( 52 ), texinfoLength = bsp.readInt32LE( 56 );
	const textureNames = [];
	for ( let i = 0; i < bsp.readInt32LE( textureLump ); i ++ ) {

		const p = bsp.readInt32LE( textureLump + 4 + i * 4 ); textureNames.push( p < 0 ? '' : bsp.subarray( textureLump + p, textureLump + p + 16 ).toString().split( '\0' )[ 0 ] );

	}
	const mapped = [];
	for ( let p = texinfoStart; p < texinfoStart + texinfoLength; p += 40 ) {

		const name = textureNames[ bsp.readInt32LE( p + 32 ) ];
		if ( name !== 'quake' && name !== 'wizmet1_2' ) continue;
		mapped.push( { name, axes: Array.from( { length: 8 }, ( _, i ) => bsp.readFloatLE( p + i * 4 ) ) } );

	}
	check( mapped.some( m => m.name === 'quake' && m.axes.join() === [ 1, 0, 0, -112, 0, 0, -1, 8 ].join() ), 'native plaque S/T basis' );
	check( mapped.some( m => m.name === 'wizmet1_2' && m.axes.join() === [ 1, 0, 0, 0, 0, 0, -1, 8 ].join() ), 'native neighboring wall S/T basis' );
	let carved = 0, flat = 0;
	for ( let y = 0; y < relief.height; y ++ ) for ( let x = 0; x < relief.width; x ++ ) {

		const p = ( y * relief.width + x ) * 4, gx = x - left, gy = y - top;
		const alpha = gx >= 0 && gy >= 0 && gx < width && gy < height ? mask[ ( gy * width + gx ) * info.channels + info.channels - 1 ] / 255 : 0;
		const source = ( ( y % 256 ) * 256 + ( ( x + 64 ) % 256 ) ) * 4;
		const expectedHeight = Math.round( Math.max( 0, wallHeight.data[ source ] - alpha * .56 * 255 ) );
		equal( relief.data[ p ], expectedHeight, `source height plus SVG recess at${x},${y}` );
		for ( let c = 0; c < 4; c ++ ) equal( albedo.data[ p + c ], wallAlbedo.data[ source + c ], `unchanged wall pixel/channel${x},${y},${c}` );
		if ( alpha === 0 ) equal( relief.data[ p ], wallHeight.data[ source ], 'height unchanged outside glyph' );
		equal( relief.data[ p ], relief.data[ p + 1 ], 'height grayscale R=G' ); equal( relief.data[ p ], relief.data[ p + 2 ], 'height grayscale R=B' );
		equal( albedo.data[ p + 3 ], 255, 'wall opaque' );
		if ( alpha > .99 ) carved ++; if ( alpha === 0 ) flat ++;

	}
	check( carved > 10000 && flat > carved, 'actual glyph strokes and background sampled' );

} );

Deno.test( 'public enhanced texture loader installs registered recessed height and derived normals without changing UVs', () => fixture( async () => {

	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true } };
	const material = new THREE.MeshStandardMaterial( { map: texture } );
	const oldNormalsOption = r_newer_normals.value; r_newer_normals.value = 1;
	R_PostBegin( renderer, true, 64, 64 );
	R_RegisterDetail( material, texture );
	const nativeNormal = material.normalMap;
	const nativeProgramKey = material.customProgramCacheKey();
	const nativeShader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone( THREE.ShaderLib.standard.uniforms ) };
	material.onBeforeCompile( nativeShader );
	check( nativeShader.fragmentShader.includes( 'const float LAYERS = 10.0;' ) && ! nativeShader.fragmentShader.includes( 'uCarveReference' ), 'ordinary wall retains original ten-layer parallax' );
	check( nativeNormal && nativeNormal.image.width === 288, 'material already registered with native normals before async image arrival' );
	try {
	R_NewerTextureUpgrade( 'quake', texture );
	const deadline = Date.now() + 3000;
	while ( ! texture.userData.newerPicture && Date.now() < deadline ) await new Promise( resolve => setTimeout( resolve, 5 ) );
	check( texture.userData.newerPicture, 'actual logo asset loads' );
	equal( texture.image.width, record.outputSize[ 0 ], 'albedo width' ); equal( texture.image.height, record.outputSize[ 1 ], 'albedo height' );
	const height = texture.userData.newerHeight, entry = index.normals.quake;
	equal( height.file, entry.file, 'authored map used' ); equal( height.width, texture.image.width, 'registered height width' ); equal( height.height, texture.image.height, 'registered height height' );
	const normal = R_NormalMapFor( texture );
	equal( material.normalMap, normal, 'preexisting material automatically rebound to crafted logo relief' );
	check( material.normalMap !== nativeNormal, 'old normal texture replaced without renderer mode toggle' );
	equal( height.edgeSource.file, index.normals.wizmet1_2.file, 'actual surrounding height supplied at plaque boundary' );
	equal( height.edgeSource.offset.join(), '64,0', 'native neighboring wall height phase' );
	check( Buffer.from( normal.image.data ).equals( Buffer.from( R_NormalsFromCraftedHeight( height.data, height.width, height.height, entry.strength, entry.cap, height.edgeSource ) ) ), 'normal and POM alpha from actual recessed map' );
	const sourceHeight = await decode( 'newer/textures/' + index.normals.wizmet1_2.file );
	const sourceField = new Float32Array( 256 * 256 );
	for ( let i = 0; i < sourceField.length; i ++ ) sourceField[ i ] = sourceHeight.data[ i * 4 ] / 255;
	const sourceNormals = R_NormalsFromCraftedHeight( sourceField, 256, 256, index.normals.wizmet1_2.strength, index.normals.wizmet1_2.cap );
	const reference = normal.userData.referenceHeight, referenceUV = normal.userData.referenceUV;
	check( reference && reference.image.width === 256 && reference.image.height === 256, 'actual surrounding height texture available for carved lighting' );
	equal( referenceUV.toArray().join(), '4.5,1,0.25,0', 'shader reference mapping matches native wall' );
	for ( let i = 0; i < 256 * 256; i ++ ) {

		equal( reference.image.data[ i * 4 + 3 ], sourceNormals[ i * 4 + 3 ], 'reference alpha is original smoothed height' );
		equal( reference.image.data[ i * 4 ], 128, 'reference no generated X slope' ); equal( reference.image.data[ i * 4 + 1 ], 128, 'reference no generated Y slope' );

	}
	check( material.customProgramCacheKey() !== nativeProgramKey && material.customProgramCacheKey().endsWith( '-carved' ), 'asynchronous carved shader gets a distinct cached program' );
	const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: THREE.UniformsUtils.clone( THREE.ShaderLib.standard.uniforms ) };
	material.onBeforeCompile( shader );
	equal( shader.uniforms.uCarveReference.value, reference, 'actual registered material shader uses source height reference' );
	equal( shader.uniforms.uCarveReferenceUV.value, referenceUV, 'actual shader has aligned reference mapping' );
	check( shader.fragmentShader.includes( 'carveBase - texture2D( normalMap, DETAIL_UV ).a' ), 'occlusion compares source and actual carved depth' );
	check( shader.fragmentShader.includes( 'clamp( 1.0 - carveDepth * 3.0, 0.08, 1.0 )' ), 'bounded shader occlusion contract' );
	check( shader.fragmentShader.includes( '( outgoingLight - totalEmissiveRadiance ) * carveAO + totalEmissiveRadiance' ), 'occlusion only shades reflected light' );
	carvedAlphaExpression = /gAlbedo = vec4\( gDiffuse, ([^;]+) \);/.exec( shader.fragmentShader )[ 1 ];
	check( carvedAlphaExpression.includes( 'carveAO' ), 'authored albedo RGB unchanged while alpha carries carved lighting' );
	check( shader.fragmentShader.includes( 'const float LAYERS = 60.0;' ) && shader.fragmentShader.includes( 'i < 60' ), 'actual carved shader marches its enlarged depth interval' );
	check( shader.fragmentShader.includes( 'vec2 dUv = P * 6.0 / LAYERS;' ) && shader.fragmentShader.includes( 'float layer = 6.0 / LAYERS;' ), 'UV and virtual height advance across the same six-unit interval' );
	check( shader.fragmentShader.includes( '+ 8.0 * max( 0.0,' ), 'extra depth applies only to carved difference' );
	check( shader.fragmentShader.includes( 'textureGrad( normalMap, prev, gx, gy ).a' ) && shader.fragmentShader.includes( 'fract( prev ) * uCarveReferenceUV.xy' ), 'previous-step interpolation uses the same source-relative cut depth' );
	let visiblyCarved = 0, deepShadowPixels = 0;
	for ( let y = 0; y < 256; y ++ ) for ( let x = 0; x < 1152; x ++ ) {

		const p = ( y * 1152 + x ) * 4, q = ( y * 256 + ( x + 64 ) % 256 ) * 4;
		const uncut = reference.image.data[ q + 3 ] / 255, cut = normal.image.data[ p + 3 ] / 255;
		const depth = Math.max( 0, uncut - cut ), baseDepth = 1 - uncut, virtualDepth = baseDepth + 8 * depth;
		check( virtualDepth >= baseDepth && virtualDepth <= 6, 'actual virtual cut fits marched depth range' );
		if ( x < 40 || x > 1120 ) check( Math.abs( virtualDepth - baseDepth ) <= 8 / 255, 'uncarved margin retains original depth within height quantization' );
		const ao = Math.max( .08, Math.min( 1, 1 - depth * 3 ) );
		check( ao >= .08 && ao <= 1, 'actual cut attenuation remains bounded' );
		if ( x < 40 || x > 1120 ) check( ao >= .99, 'uncarved wall margin does not darken' );
		if ( ao < .9 ) visiblyCarved ++; if ( ao < .15 ) deepShadowPixels ++;

	}
	check( visiblyCarved > 10000, 'actual height delta supplies substantial carved lighting, not uniform panel shading' );
	check( deepShadowPixels > 5000, 'thousands of carved pixels receive deep recess shadow below .15' );
	let referenceDisposed = 0; reference.addEventListener( 'dispose', () => referenceDisposed ++ );
	// Beyond the carved strokes' smoothing support, both outer boundaries and
	// interior wall detail must have precisely the surrounding wall's slope.
	for ( const x of [ 0, 1, 2, 20, 1148, 1149, 1150, 1151 ] ) for ( const y of [ 0, 1, 80, 128, 240, 255 ] ) {

		const actual = ( y * 1152 + x ) * 4, expected = ( y * 256 + ( x + 64 ) % 256 ) * 4;
		for ( let c = 0; c < 4; c ++ ) check( Math.abs( normal.image.data[ actual + c ] - sourceNormals[ expected + c ] ) <= 1, `unchanged background normal at${x},${y} channel${c}` );

	}
	check( requests.includes( `newer/textures/${index.textures.quake}?v=${index.version}` ), 'versioned albedo fetch' );
	check( requests.includes( `newer/textures/${entry.file}?v=${index.version}` ), 'versioned height fetch' );
	for ( const map of [ texture, normal ] ) {

		equal( map.offset.x, .125, 'U registration' ); equal( map.offset.y, .25, 'V registration' );
		equal( map.repeat.x, 1, 'U period' ); equal( map.repeat.y, 1, 'V period' ); equal( map.flipY, false, 'unflipped native artwork' );

	}
	normal.dispose(); equal( referenceDisposed, 1, 'normal resource disposal frees auxiliary reference texture' );
	texture._normalMap = undefined; texture.dispatchEvent( { type: 'newertextureupdated' } );
	check( material.normalMap !== normal && material.normalMap.userData.referenceHeight !== reference, 'same-kind asynchronous replacement creates fresh owned reference' );
	equal( shader.uniforms.uCarveReference.value, material.normalMap.userData.referenceHeight, 'already compiled carved shader rebinds replacement sampler' );
	equal( shader.uniforms.uCarveReferenceUV.value, material.normalMap.userData.referenceUV, 'already compiled carved shader rebinds replacement phase' );
	} finally { material.dispose(); r_newer_normals.value = oldNormalsOption; R_PostBegin( renderer, false, 0, 0 ); }

} ) );

Deno.test( 'byte-packed carved occlusion stays distinct from rock/ordinary tags and only attenuates new deferred lighting', () => {

	const options = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, anim.r_newer_lighting, anim.r_newer_normals ];
	for ( const option of options ) if ( ! vars.Cvar_FindVar( option.name ) ) vars.Cvar_RegisterVariable( option );
	const saved = options.map( v => v.string ); let target, composite;
	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true }, getRenderTarget: () => target, setRenderTarget: t => { target = t; }, setViewport() {}, render( scene ) { composite = scene.children[ 0 ].material; } };
	try {

		options.forEach( v => vars.Cvar_Set( v.name, '1' ) ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric' ] ) vars.Cvar_Set( name, '0' );
		post.R_PostBegin( renderer, true, 320, 200 ); post.R_PostBind( renderer );
		equal( target.textures[ 2 ].type, THREE.UnsignedByteType, 'actual albedo attachment has byte alpha' );
		const camera = new THREE.PerspectiveCamera( 90, 1.6, 4, 4096 ); camera.updateMatrixWorld();
		post.R_PostFinish( renderer, new THREE.Scene(), camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 0, [], [], 0, 1, false );
		const fragment = composite.fragmentShader;
		const expression = /float surfaceCarveAO\( float tag \) \{\s*return ([^;]+);/.exec( fragment )[ 1 ];
		const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
		const decode = new Function( 'tag', 'clamp', 'return ' + expression );
		const encode = new Function( 'carveAO', 'return ' + carvedAlphaExpression );
		const sunExpression = /float rockSunVisibility = ([^;]+);/.exec( fragment )[ 1 ];
		const sun = new Function( 'tag', 'clamp', 'return ' + sunExpression.replaceAll( 'base.a', 'tag' ) );
		for ( const ao of [ .08, .15, .5, .6, .75, .9, 1 ] ) {

			const tag = Math.round( encode( ao ) * 255 ) / 255;
			check( tag > .05 && tag < .5, 'carved tag remains valid and distinct after UNORM storage' );
			check( Math.abs( decode( tag, clamp ) - ao ) < .006, 'actual byte-packed carved factor round trips' );
			equal( sun( tag, clamp ), 1, 'carved tag does not invent a rock sun shadow' );

		}
		for ( const tag of [ 0, .05, .5, .51, .75, 1 ] ) equal( decode( tag, clamp ), 1, 'invalid/boundary/rock/ordinary tags unaffected' );
		for ( const visibility of [ 0, .1, .5, .9, 1 ] ) {

			const tag = Math.round( ( .51 + .49 * visibility ) * 255 ) / 255;
			check( tag > .5 && Math.abs( sun( tag, clamp ) - visibility ) < .0041, 'rock visibility encoding preserved' ); equal( decode( tag, clamp ), 1, 'rock is not treated as a carving' );

		}
		check( fragment.includes( 'vec3 albedo = base.a > 0.05 ? base.rgb : scene;' ), 'carved surfaces use original material RGB' );
		check( fragment.includes( 'base.a < 0.05 ) return scene;' ), 'reflection accepts carved receiver albedo' );
		check( fragment.includes( 'beamS * surfaceCarveAO( sourceBase.a )' ), 'new flashlight bounce from carved source respects occlusion' );
		const compositeExpression = /c = (scene \* \( 1\.0 \+ relit \* carveAO \)[^;]+);/.exec( fragment )[ 1 ];
		const compose = new Function( 'scene', 'relit', 'carveAO', 'bounce', 'receiver', 'uLightFloor', 'albedo', 'spot', 'flashAdd', 'return ' + compositeExpression );
		const baseline = .2, full = compose( baseline, .3, 1, .4, .1, .2, .5, .6, .7 );
		for ( const ao of [ .5, .75, 1 ] ) {

			equal( compose( baseline, 0, ao, 0, .1, .2, .5, 0, 0 ), baseline, 'pre-shaded scene is not attenuated twice' );
			check( Math.abs( compose( baseline, .3, ao, .4, .1, .2, .5, .6, .7 ) - ( baseline + ( full - baseline ) * ao ) ) < 1e-12, 'all new deferred contributions receive exactly one cut factor' );

		}

	} finally { options.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( renderer, false, 0, 0 ); }

} );

Deno.test( 'classic split and restored New Game retain native QUAKE pixels and remove enhanced logo height', () => fixture( () => {

	const classic = R_ClassicTexture( texture );
	equal( classic.image.data, native.data, 'classic original texel identity' ); equal( classic.image.width, 288, 'classic width' ); equal( classic.image.height, 64, 'classic height' );
	R_NewerTexturesRevert(); equal( texture.image.data, native.data, 'original restored' );
	equal( texture.userData.newerHeight, undefined, 'recess removed on revert' );
	const count = requests.length; R_AnimSetClassicPass( true ); R_NewerTextureUpgrade( 'quake', texture );
	equal( requests.length, count, 'classic does not fetch replacement' );

} ) );

Deno.test( 'texture update listeners follow animated texture changes and detach on material disposal', () => fixture( () => {

	const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true } };
	const a = new THREE.DataTexture( native.data, native.width, native.height ), b = new THREE.DataTexture( native.data, native.width, native.height );
	const material = new THREE.MeshStandardMaterial( { map: a } );
	const oldNormalsOption = r_newer_normals.value; r_newer_normals.value = 1;
	R_PostBegin( renderer, true, 64, 64 ); R_RegisterDetail( material, a );
	try {

		R_RefreshDetail( material, b ); const before = material.normalMap;
		a._normalMap = undefined; a.dispatchEvent( { type: 'newertextureupdated' } );
		equal( a._normalMap, undefined, 'previous animated texture no longer has a material listener' ); equal( material.normalMap, before, 'previous image update cannot alter current material' );
		b._normalMap = undefined; b.dispatchEvent( { type: 'newertextureupdated' } );
		check( material.normalMap !== before && material.normalMap === b._normalMap, 'current texture event rebuilds its actual normal map' );
		const current = material.normalMap; material.dispose(); b._normalMap = undefined;
		b.dispatchEvent( { type: 'newertextureupdated' } );
		equal( b._normalMap, undefined, 'disposed material cannot regenerate resources' ); equal( material.normalMap, current, 'disposed material untouched' );

	} finally { material.dispose(); a.dispose(); b.dispose(); r_newer_normals.value = oldNormalsOption; R_PostBegin( renderer, false, 0, 0 ); }

} ) );
