// Installed art and public async texture/material pipeline. Software canvas
// decodes actual assets; native textures are independently decoded from BSPs.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import * as vars from '../src/engine/common/cvar.js';
import * as post from '../src/newer/render/gl_post.js';
import * as anim from '../src/newer/render/r_anim.js';
import { createQuakeLightmapMaterial, DrawGLPoly } from '../src/engine/render/gl_rsurf.js';
import { R_NewerTextureUpgrade, R_NewerTexturesRevert, R_ClassicTexture } from '../src/newer/render/r_newertextures.js';
import { R_ClassicMaterial } from '../src/newer/render/r_classicstate.js';
import { R_NormalMapFor, R_NormalsFromCraftedHeight } from '../src/newer/render/gl_normals.js';

const { createCanvas, Image: NativeImage } = await import( pathToFileURL( process.env.QUAKED_CANVAS_MODULE ).href );
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const catalogue = JSON.parse( read( 'newer/textures/index.json' ) );
const targets = [ 'dem4_1', 'dem4_4', 'dem5_3' ], PROFILE = { depth: .02, layers: 10, cavityFloor: .397385627, cavityScale: 3, cavityMin: .3 };
const DISPLACEMENT = { depth: .05 * 64 * 3, step: .5, smoothing: .6 }, scalarBytes = read( 'newer/textures/normals/demon-face.r16' );
const check = ( value, message ) => { if ( ! value ) throw new Error( message ); };
const same = ( a, b, message ) => check( a === b, `${message}: ${a} != ${b}` );
const near = ( a, b, message, epsilon = 1e-8 ) => check( Math.abs( a - b ) <= epsilon, `${message}: ${a} != ${b}` );
const pack = read( 'pak0.pak' ), maps = [], native = new Map(); let palette;
for ( let p = pack.readInt32LE( 4 ), end = p + pack.readInt32LE( 8 ); p < end; p += 64 ) {

	const name = pack.subarray( p, p + 56 ).toString().split( '\0' )[ 0 ], start = pack.readInt32LE( p + 56 ), data = pack.subarray( start, start + pack.readInt32LE( p + 60 ) );
	if ( name === 'gfx/palette.lmp' ) palette = data;
	if ( /^maps\/.*\.bsp$/.test( name ) ) maps.push( { name, data } );

}
for ( const map of maps ) {

	const b = map.data, base = b.readInt32LE( 20 );
	for ( let i = 0; i < b.readInt32LE( base ); i ++ ) {

		const relative = b.readInt32LE( base + 4 + i * 4 ); if ( relative < 0 ) continue;
		const p = base + relative, name = b.subarray( p, p + 16 ).toString().split( '\0' )[ 0 ];
		if ( native.has( name ) || ! targets.concat( 'quake' ).includes( name ) ) continue;
		const width = b.readInt32LE( p + 16 ), height = b.readInt32LE( p + 20 ), offset = b.readInt32LE( p + 24 );
		const indices = b.subarray( p + offset, p + offset + width * height ), pixels = new Uint8Array( indices.length * 4 );
		for ( let k = 0; k < indices.length; k ++ ) { pixels.set( palette.subarray( indices[ k ] * 3, indices[ k ] * 3 + 3 ), k * 4 ); pixels[ k * 4 + 3 ] = 255; }
		native.set( name, { width, height, pixels, indices, map: map.name } );

	}

}
function texture( name = 'dem4_1' ) {

	const p = native.get( name ), result = new THREE.DataTexture( p.pixels.slice(), p.width, p.height ); result.colorSpace = THREE.SRGBColorSpace;
	result.wrapS = result.wrapT = THREE.RepeatWrapping; result.offset.set( .125, .25 ); result.flipY = false; return result;

}
async function decode( file ) {

	const image = new NativeImage(); image.src = read( file ); await image.decode();
	const canvas = createCanvas( image.width, image.height ), context = canvas.getContext( '2d' ); context.drawImage( image, 0, 0 );
	return { width: image.width, height: image.height, data: context.getImageData( 0, 0, image.width, image.height ).data };

}
const requests = [], roles = new Map(), resources = [];
const renderer = { capabilities: { isWebGL2: true }, extensions: { has: () => true } };
async function fixture( fn ) {

	const globals = new Map( [ 'Image', 'document', 'fetch' ].map( name => [ name, Object.getOwnPropertyDescriptor( globalThis, name ) ] ) );
	const controls = [ post.r_hdr, post.r_dynres, post.r_bloom, post.r_volumetric, anim.r_newer_normals, anim.r_newer_lighting, anim.r_newer_water, anim.r_newer_textures ];
	for ( const variable of controls ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
	const saved = controls.map( v => v.string );
	globalThis.Image = class extends NativeImage { set src( file ) { requests.push( file ); super.src = read( String( file ).split( '?' )[ 0 ] ); } };
	globalThis.document = { createElement: name => { same( name, 'canvas', 'public decoder canvas' ); return createCanvas( 1, 1 ); } };
	globalThis.fetch = async url => {

		requests.push( String( url ) );
		if ( String( url ).includes( '.r16' ) ) {

			if ( String( url ).includes( 'missing-scalar' ) ) return { ok: false };
			const bytes = String( url ).includes( 'truncated-scalar' ) ? scalarBytes.subarray( 0, scalarBytes.length - 2 ) : scalarBytes;
			return { ok: true, arrayBuffer: async () => bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) };

		}
		return { ok: true, json: async () => catalogue };

	};
	try {

		for ( const variable of controls ) vars.Cvar_Set( variable.name, '1' ); for ( const name of [ 'r_dynres', 'r_bloom', 'r_volumetric', 'r_newer_water' ] ) vars.Cvar_Set( name, '0' );
		post.R_PostBegin( renderer, true, 320, 200 ); await fn();

	} finally {

		controls.forEach( ( v, i ) => vars.Cvar_Set( v.name, saved[ i ] ) ); post.R_PostBegin( renderer, false, 0, 0 ); anim.R_AnimSetClassicPass( false );
		for ( const [ name, descriptor ] of globals ) { if ( descriptor ) Object.defineProperty( globalThis, name, descriptor ); else delete globalThis[ name ]; }

	}

}
function compile( material ) { const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader }; material.onBeforeCompile( shader ); return shader; }
async function upgrade( name, t ) {

	R_NewerTextureUpgrade( name, t ); const limit = Date.now() + 5000;
	while ( ! t.userData.newerPicture && Date.now() < limit ) await new Promise( r => setTimeout( r, 5 ) );
	check( t.userData.newerPicture, name + ' completes public image+height upgrade' );

}

Deno.test( 'only three horned plaque materials get enhanced relief; native BSP proportions and original pigment files stay unchanged', async () => {

	same( Object.entries( catalogue.normals ).filter( ( [ name, info ] ) => info.relief && ! name.startsWith( 'demon-test-' ) ).map( ( [ name ] ) => name ).sort().join(), targets.slice().sort().join(), 'narrowed material scope' );
	for ( const name of targets ) {

		const original = native.get( name ); check( original, name + ' occurs in real bundled BSP' ); same( original.width, 64, 'native width' ); same( original.height, 128, 'native height' ); same( Array.from( original.indices ).filter( value => value >= 224 ).length, 0, 'native model has no glow mask to inherit' );
		const file = 'newer/textures/' + catalogue.textures[ name ]; check( read( file ).equals( execFileSync( 'git', [ 'show', 'HEAD:' + file ], { cwd: new URL( '../', import.meta.url ) } ) ), name + ' original albedo bytes untouched' );
		const picture = await decode( file ), height = await decode( 'newer/textures/' + catalogue.normals[ name ].file ); same( picture.width, 256, 'provided diffuse width' ); same( picture.height, 512, 'provided diffuse height' ); same( height.width, picture.width, 'height alignedU' ); same( height.height, picture.height, 'height alignedV' );
		for ( let i = 0; i < height.data.length; i += 4 ) { same( height.data[ i ], height.data[ i + 1 ], 'linear grayscale height' ); same( height.data[ i ], height.data[ i + 2 ], 'linear grayscale heightB' ); same( height.data[ i + 3 ], 255, 'opaque height data' ); }
		same( JSON.stringify( catalogue.normals[ name ].relief ), JSON.stringify( PROFILE ), name + ' scoped depth/layers/cavity recipe' );

	}
	check( ! catalogue.normals.altarb_2.relief && ! catalogue.normals.wmet3_1.relief, 'other face/altar families excluded' );
	const recipe = JSON.parse( read( 'docs/evidence/demon-face-assets-2026-10-03.json' ) );
	same( recipe.archiveSha256, 'b6b31e9b6916a9393bb772bebc1db17123db3f02efe1444b884b8297c50bddc8', 'exact supplied complete-package fingerprint' );
	same( createHash( 'sha256' ).update( read( recipe.sourceArchive ) ).digest( 'hex' ), recipe.archiveSha256, 'retained ZIP bytes unchanged' );
	same( recipe.savedHeightSha256, 'd5e89e6d2a3109e0507b91b53ed65b4ce072f1789296190ecc4b94f87009ef45', 'canonical saved16 height fingerprint' );
	same( recipe.sourceSize.join(), '2048,4096', 'saved1:2 source aspect' );
	same( recipe.ownerDepthMultiplier, 3, 'owner requested triple depth recorded separately from package scale' );
	for ( const name of targets ) { same( catalogue.normals[ name ].file, recipe.heightFile, 'all variants share preview' ); same( catalogue.normals[ name ].dataFile, recipe.dataFile, 'all variants share16-bit geometry data' ); same( catalogue.normals[ name ].sampling, 'clamp', 'explicit nonseamless package boundary contract' ); for ( const [ key, value ] of Object.entries( DISPLACEMENT ) ) near( catalogue.normals[ name ].displacement[ key ], value, 'scoped physical mesh ' + key ); near( catalogue.normals[ name ].displacement.depth, recipe.amplitudeFraction * native.get( name ).width * recipe.ownerDepthMultiplier, 'owner triples documented .05×native world width scale' ); }
	if ( ! process.env.QUAKED_PYTHON ) throw new Error( 'Set QUAKED_PYTHON to the installed Python runtime with Pillow for exact source-resampling verification.' );
	// Independent decoder and scalar arithmetic, never the ZIP's executable script.
	const expected = execFileSync( process.env.QUAKED_PYTHON, [ '-c', "from PIL import Image; import sys,zipfile,io,numpy as np\nz=zipfile.ZipFile(sys.argv[1]);q=np.asarray(Image.open(io.BytesIO(z.read('dem4_4_maps/dem4_4_displacement_16bit.png'))),dtype=np.uint16)\ns=((q[3::8,3::8].astype(np.uint32)+q[3::8,4::8]+q[4::8,3::8]+q[4::8,4::8]+2)//4).astype('<u2');sys.stdout.buffer.write(s.tobytes())", new URL( '../' + recipe.sourceArchive, import.meta.url ).pathname ] );
	same( scalarBytes.length, 256 * 512 * 2, 'exact little-endian16 byte count' ); check( scalarBytes.equals( expected ), 'every runtime16 sample equals saved canonical centre-bilinear resample' );
	const proof = JSON.parse( execFileSync( process.env.QUAKED_PYTHON, [ '-c', `from PIL import Image
import sys,zipfile,io,numpy as np,hashlib,json
z=zipfile.ZipFile(sys.argv[1]);m=json.loads(z.read('dem4_4_maps/manifest.json'))
for f in m['files'].values():
 b=z.read('dem4_4_maps/'+f['filename']);assert hashlib.sha256(b).hexdigest()==f['sha256']
assert hashlib.sha256(z.read('dem4_4_maps/'+m['source']['archive_path'])).hexdigest()==m['source']['sha256']
assert m['source']['sha256']=='d348dbc26c75776abd38b72eb93fb9e5a83555be248423d193e062ca42429743'
assert z.read('dem4_4_maps/sources/dem4_4_original.webp')==open(sys.argv[2],'rb').read()
q=np.asarray(Image.open(io.BytesIO(z.read('dem4_4_maps/'+m['files']['displacement']['filename']))),dtype=np.uint16)
g=np.asarray(Image.open(io.BytesIO(z.read('dem4_4_maps/'+m['files']['normal_opengl']['filename']))),dtype=np.uint8)
d=np.asarray(Image.open(io.BytesIO(z.read('dem4_4_maps/'+m['files']['normal_directx']['filename']))),dtype=np.uint8)
assert np.array_equal(g[:,:,0],d[:,:,0]) and np.array_equal(g[:,:,2],d[:,:,2]) and np.array_equal(255-g[:,:,1],d[:,:,1])
points=set((x,y) for y in range(0,4096,61) for x in range(0,2048,37))
points.update((x,y) for x in range(2048) for y in [0,4095]);points.update((x,y) for y in range(4096) for x in [0,2047])
err=0
for x,y in points:
 l=max(0,x-1);r=min(2047,x+1);t=max(0,y-1);b=min(4095,y+1)
 dx=(int(q[y,r])-int(q[y,l]))/((r-l)*65535);dy=(int(q[b,x])-int(q[t,x]))/((b-t)*65535)
 n=np.array([-.05*2048*dx,.05*2048*dy,1.]);n/=np.linalg.norm(n);encoded=np.floor((n*.5+.5)*255+.5).astype(int)
 err=max(err,int(np.max(np.abs(encoded-g[y,x].astype(int)))))
assert err==0
print(json.dumps({'normalSamples':len(points),'maxChannelError':err,'greenFlipAllPixels':True,'sourceWidth':q.shape[1],'amplitude':m['normals']['amplitude_as_fraction_of_texture_world_width']}))
`, new URL( '../' + recipe.sourceArchive, import.meta.url ).pathname, new URL( '../newer/textures/' + catalogue.textures.dem4_4, import.meta.url ).pathname ] ).toString() );
	check( proof.normalSamples > 15000 && proof.greenFlipAllPixels, 'substantive actual savedheight/OGL pair and all-pixelDirectX check' ); same( proof.maxChannelError, 0, 'sampled actual normal bytes match saved16 slopes including one-sided boundaries' ); near( proof.amplitude, .05, 'source normal physical scale' );
	const actual = await decode( 'newer/textures/' + recipe.heightFile );
	let fine = 0; for ( let i = 0; i < expected.length / 2; i ++ ) { const q = expected.readUInt16LE( i * 2 ); if ( q % 257 ) fine ++; same( actual.data[ i * 4 ], Math.round( q / 65535 * 255 ), '8-bit preview derived from canonical16 data' ); }
	check( fine > 100000, 'runtime field retains values beyond8bit quantization' ); console.log( 'DEMON_PACKAGE ' + JSON.stringify( { ...proof, sub8bitSamples: fine } ) );
	// Observed landmarks in the supplied image, not a newly drawn anatomy mask:
	// painted horn/brow/nose/cheek pixels align with raised height; eye/throat
	// pixels align with low height. All colour variants share this same mapping.
	const patch = ( u, v ) => { const x = Math.floor( u * 256 ), y = Math.floor( v * 512 ); let value = 0; for ( let dy = -2; dy <= 2; dy ++ ) for ( let dx = -2; dx <= 2; dx ++ ) value += actual.data[ ( ( y + dy ) * 256 + x + dx ) * 4 ] / 255; return value / 25; };
	for ( const [ u, v ] of [ [ .15, .28 ], [ .85, .28 ], [ .5, .412 ], [ .5, .49 ], [ .24, .52 ], [ .76, .52 ] ] ) check( patch( u, v ) > .5, 'actual horn/brow/nose/cheek registration is raised' );
	for ( const [ u, v ] of [ [ .3, .455 ], [ .7, .455 ], [ .5, .65 ] ] ) check( patch( u, v ) < .3, 'actual eye and throat registration remains recessed' );

} );

Deno.test( 'registered materials asynchronously load shared displacement metadata and bounded microdetail while sourceBSP geometryUVs stay untouched', () => fixture( async () => {

	for ( const name of targets ) {

		const t = texture( name ), lightmap = new THREE.Texture(), material = createQuakeLightmapMaterial( t, lightmap ), originalImage = t.image, initial = material.normalMap, version = material.version;
		const geometry = DrawGLPoly( { numverts: 4, verts: new Float32Array( [ 0, 0, 0, 0, 0, 0, 0, 64, 0, 0, 1, 0, 1, 0, 64, 0, 128, 1, 1, 1, 1, 0, 0, 128, 0, 1, 0, 1 ] ) }, [ 0, -1, 0 ] );
		const before = Object.fromEntries( Object.entries( geometry.attributes ).map( ( [ key, attr ] ) => [ key, { attr, values: Array.from( attr.array ) } ] ) );
		check( compile( material ).fragmentShader.includes( 'i < 10' ), 'native first compile uses ordinary10-layer detail' );
		await upgrade( name, t ); same( t.userData.classicImage, originalImage, name + ' native image retained' );
		check( material.normalMap !== initial && material.normalMap === R_NormalMapFor( t ), 'existing world material refreshes without mode flip' ); check( material.version > version, 'relief variant marks registered material dirty' );
		same( JSON.stringify( material.normalMap.userData.surfaceRelief ), JSON.stringify( PROFILE ), 'validated metadata propagates through normal map' );
		for ( const [ key, value ] of Object.entries( DISPLACEMENT ) ) near( t.userData.newerHeight.displacement[ key ], value, 'validated actual geometry ' + key + ' reaches renderer input' );
		same( t.userData.newerHeight.dataFile, catalogue.normals[ name ].dataFile, 'actual16 scalar input selected' );
		same( t.userData.newerHeight.sampling, 'clamp', 'nonseamless boundary policy reaches actual geometry input' );
		for ( let i = 0; i < scalarBytes.length / 2; i ++ ) same( t.userData.newerHeight.data[ i ], Math.fround( scalarBytes.readUInt16LE( i * 2 ) / 65535 ), 'public loader preserves every scalar value without8bit or gamma conversion' );
		const expectedNormal = R_NormalsFromCraftedHeight( t.userData.newerHeight.data, 256, 512, catalogue.normals[ name ].strength, catalogue.normals[ name ].cap );
		check( Buffer.from( material.normalMap.image.data ).equals( Buffer.from( expectedNormal ) ), 'actual generated shader normals consume canonical16 field' );
		check( material.customProgramCacheKey().includes( '-sculpted:' + JSON.stringify( PROFILE ) ), 'profile-specific program cache key' );
		const fragment = compile( material ).fragmentShader;
		check( fragment.includes( 'i < 10' ) && fragment.includes( 'LAYERS = 10.0' ) && fragment.includes( '* 0.02 *' ), 'physical geometry does not stack prior deep32/.08 macroPOM' );
		check( fragment.includes( '( outgoingLight - totalEmissiveRadiance ) * sculptAO + totalEmissiveRadiance' ), 'cavity never dims emission' ); check( fragment.includes( 'vec4( gDiffuse, 0.1 + 0.39 * sculptAO )' ), 'byte-safe existing AO band with unchanged originalRGB' );
		const cavity = /float sculptDepth = ([^;]+);/.exec( fragment )[ 1 ].replace( /texture2D\( normalMap, DETAIL_UV \)\.a/, 'height' ), occlusion = /float sculptAO = ([^;]+);/.exec( fragment )[ 1 ];
		const depth = new Function( 'height', 'max', 'return ' + cavity ), ao = new Function( 'sculptDepth', 'uClassic', 'mix', 'clamp', 'return ' + occlusion ), mix = ( a, b, f ) => a + ( b - a ) * f, clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
		same( ao( depth( .6, Math.max ), 0, mix, clamp ), 1, 'raised bone/panel has no artificial cavity shade' ); check( ao( depth( .05, Math.max ), 0, mix, clamp ) < .5, 'low socket height receives occlusion' ); same( ao( depth( .05, Math.max ), 1, mix, clamp ), 1, 'Classic disables cavity shading' );
		for ( const [ key, saved ] of Object.entries( before ) ) { same( geometry.getAttribute( key ), saved.attr, key + ' attribute identity unchanged' ); same( Array.from( saved.attr.array ).join(), saved.values.join(), key + ' byte values unchanged' ); }
		check( requests.includes( 'newer/textures/' + catalogue.normals[ name ].file + '?v=' + catalogue.version ), 'current versioned authored-height URL' );
		check( requests.includes( 'newer/textures/' + catalogue.normals[ name ].dataFile + '?v=' + catalogue.version ), 'current versioned16 scalar URL' );
		roles.set( name, { t, material, originalImage } ); resources.push( material, t, lightmap, geometry );

	}

} ) );

Deno.test( 'ordinary detail remains10 layers and original carved-logo reference retains60-layer precedence', () => fixture( async () => {

	const ordinary = texture(), lightmap = new THREE.Texture(), plain = createQuakeLightmapMaterial( ordinary, lightmap ); resources.push( plain, ordinary, lightmap );
	check( compile( plain ).fragmentShader.includes( 'i < 10' ), 'unupgraded ordinary surface remains10-layer/.02' ); check( ! compile( plain ).fragmentShader.includes( 'sculptAO' ), 'ordinary surface has no demon cavity tag' );
	const logo = texture( 'quake' ), logoMaterial = createQuakeLightmapMaterial( logo, lightmap ); resources.push( logo, logoMaterial );
	const previous = catalogue.normals.quake; catalogue.normals.quake = { ...previous, relief: PROFILE };
	try { await upgrade( 'quake', logo ); const shader = compile( logoMaterial ); check( shader.fragmentShader.includes( 'i < 60' ) && ! shader.fragmentShader.includes( 'i < 32' ), 'reference-height logo60 variant wins even if generic relief is supplied' ); check( shader.fragmentShader.includes( 'carveAO' ) && ! shader.fragmentShader.includes( 'sculptAO' ), 'logo original carving policy retained' ); }
	finally { catalogue.normals.quake = previous; }

} ) );

Deno.test( 'invalid relief metadata is ignored before shader compilation while valid art still loads', () => fixture( async () => {

	for ( const [ i, changes ] of [ { depth: '.08' }, { layers: 32.5 }, { depth: .2 }, { cavityFloor: -1 }, { cavityScale: Infinity }, { cavityMin: NaN } ].entries() ) {

		const name = 'demon-test-invalid-' + i; catalogue.textures[ name ] = catalogue.textures.dem4_1; catalogue.normals[ name ] = { ...catalogue.normals.dem4_1, relief: { ...PROFILE, ...changes } };
		const t = texture(), lightmap = new THREE.Texture(), material = createQuakeLightmapMaterial( t, lightmap ); resources.push( t, material, lightmap );
		try { await upgrade( name, t ); same( t.userData.newerHeight.relief, undefined, 'invalid profile excluded by public loader' ); same( material.normalMap.userData.surfaceRelief, undefined, 'invalid values never enter compiler' ); check( compile( material ).fragmentShader.includes( 'i < 10' ), 'invalid metadata falls back to ordinary detail' ); }
		finally { delete catalogue.textures[ name ]; delete catalogue.normals[ name ]; }

	}

} ) );

Deno.test( 'missing or truncated saved16 data cannot silently create geometry from its8-bit preview or poison valid scalar normals', () => fixture( async () => {

	const preview = await decode( 'newer/textures/' + catalogue.normals.dem4_1.file ), h = Float32Array.from( { length: 256 * 512 }, ( _, i ) => preview.data[ i * 4 ] / 255 );
	const expected = R_NormalsFromCraftedHeight( h, 256, 512, catalogue.normals.dem4_1.strength, catalogue.normals.dem4_1.cap );
	for ( const failure of [ 'missing', 'truncated' ] ) {

		const name = 'demon-test-' + failure; catalogue.textures[ name ] = catalogue.textures.dem4_1; catalogue.normals[ name ] = { ...catalogue.normals.dem4_1, dataFile: 'normals/' + failure + '-scalar.r16' };
		const t = texture(), lightmap = new THREE.Texture(), material = createQuakeLightmapMaterial( t, lightmap ); resources.push( t, lightmap, material );
		try {

			await upgrade( name, t ); check( ! t.userData.newerHeight.displacement && ! t.userData.newerHeight.dataFile, 'failed16 fetch retains native geometry' );
			check( Buffer.from( material.normalMap.image.data ).equals( Buffer.from( expected ) ), 'preview fallback gets its own normal pixels rather than cached canonical16 ones' );
			for ( const [ name, { t: valid } ] of roles ) check( valid.userData.newerHeight.dataFile === catalogue.normals[ name ].dataFile, 'existing valid scalar fields preserved' );

		} finally { delete catalogue.textures[ name ]; delete catalogue.normals[ name ]; }

	}

} ) );

Deno.test( 'actual dem5_3 picture supplies both eyes and mouth glow without horns or pigment loss after native had no fullbright mask', () => fixture( async () => {

	const { t, material } = roles.get( 'dem5_3' ), original = await decode( 'newer/textures/' + catalogue.textures.dem5_3 ), fb = t._fullbright;
	check( fb?.userData.newerCreated, 'glow was created from actual picture despite no native fullbright pixels' ); same( material.emissiveMap, fb, 'already registered world material binds new glow asynchronously' );
	near( material.emissiveIntensity, 4.5, 'explicit eye/mouth HDR gain' ); near( material.emissive.r, 1, 'emission tint enabled' );
	same( fb.userData.classicImage.width, 64, 'transparent native glow width' ); same( fb.userData.classicImage.height, 128, 'transparent native glow height' ); check( fb.userData.classicImage.data.every( value => value === 0 ), 'native absent glow represented by transparent zero pixels' );
	const counts = [ 0, 0, 0 ];
	for ( let y = 0; y < original.height; y ++ ) for ( let x = 0; x < original.width; x ++ ) {

		const i = ( y * original.width + x ) * 4, glow = fb.image.data;
		for ( let channel = 0; channel < 3; channel ++ ) same( t.image.data[ i + channel ] + glow[ i + channel ], original.data[ i + channel ], 'diffuse+glow conserves each original authored colour byte' );
		if ( ! ( glow[ i ] || glow[ i + 1 ] || glow[ i + 2 ] ) ) continue;
		check( y / original.height > .38 && y / original.height < .8 && x / original.width > .12 && x / original.width < .88, 'horn curls and background never become glow' );
		if ( y / original.height < .55 ) counts[ x < original.width / 2 ? 0 : 1 ] ++; else counts[ 2 ] ++;

	}
	check( counts[ 0 ] > 20 && counts[ 1 ] > 20 && counts[ 2 ] > 100, 'all three actual bright image hotspots are emitted' );
	for ( const name of [ 'dem4_1', 'dem4_4' ] ) check( ! roles.get( name ).t._fullbright, 'unrequested colour variants do not acquire emissive hotspots' );
	console.log( 'DEMON_GLOW_PIXELS ' + JSON.stringify( { leftEye: counts[ 0 ], rightEye: counts[ 1 ], mouth: counts[ 2 ] } ) );

} ) );

Deno.test( 'classic comparison and New Game rollback recover exact native plaque pixels and remove enhanced relief', () => fixture( async () => {

	for ( const { t, material, originalImage } of roles.values() ) {

		const classic = R_ClassicMaterial( material, R_ClassicTexture ); same( classic.map.image.data, originalImage.data, 'classic exact native image' ); same( classic.normalMap, null, 'classic has no new surface normal/POM' );
		if ( t._fullbright ) check( classic.emissiveMap.image.data.every( value => value === 0 ), 'Classic never gains the new glowing mouth/eyes' );
	}
	vars.Cvar_Set( 'r_hdr', '0' ); post.R_PostBegin( renderer, false, 0, 0 ); R_NewerTexturesRevert();
	for ( const { t, material, originalImage } of roles.values() ) { same( t.image, originalImage, 'New Game native pixels restored' ); same( t.userData.newerHeight, undefined, 'enhanced height removed' ); same( material.normalMap, null, 'registered material no longer uses sculpted height' ); check( ! t._fullbright && ! material.emissiveMap, 'newly created enhanced-only glow removed from native texture and material' ); }
	resources.forEach( resource => resource.dispose() );

} ) );
