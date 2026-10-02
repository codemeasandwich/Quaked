// Independent owner-correction tests: decode the donated archives and original
// MDLs directly, then exercise the public draw and material interfaces.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const { GL_MakeAliasModelDisplayLists, R_DrawAliasModel } = await import( '../src/gl_mesh.js' );
const { R_CloneAliasMaterial } = await import( '../src/r_newerskins.js' );
const { R_WeaponStyleGLSL } = await import( '../src/r_weaponstyle.js' );
const weapons = await import( '../src/r_weapons.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { r_lerpmodels } = await import( '../src/r_anim.js' );
const { Cvar_RegisterVariable, Cvar_SetValue, Cvar_FindVar } = await import( '../src/cvar.js' );

function check( value, label ) { if ( ! value ) throw new Error( label ); }
function near( a, b, label, epsilon = 0.00002 ) { check( Number.isFinite( a ) && Math.abs( a - b ) <= epsilon, `${label}: ${a} != ${b}` ); }
const read = file => readFileSync( new URL( '../' + file, import.meta.url ) );
const pak = read( 'pak0.pak' ), files = new Map();
for ( let offset = pak.readInt32LE( 4 ), end = offset + pak.readInt32LE( 8 ); offset < end; offset += 64 ) {

	const name = pak.subarray( offset, offset + 56 ).toString().split( '\0' )[ 0 ];
	const position = pak.readInt32LE( offset + 56 ); files.set( name, pak.subarray( position, position + pak.readInt32LE( offset + 60 ) ) );

}
function archive( filename ) {

	const bytes = read( filename ), entries = new Map();
	let end = bytes.length - 22;
	while ( end >= 0 && bytes.readUInt32LE( end ) !== 0x06054b50 ) end --;
	check( end >= 0, filename + ' ZIP directory' );
	let offset = bytes.readUInt32LE( end + 16 );
	for ( let i = 0; i < bytes.readUInt16LE( end + 10 ); i ++ ) {

		check( bytes.readUInt32LE( offset ) === 0x02014b50, 'ZIP entry header' );
		const method = bytes.readUInt16LE( offset + 10 ), size = bytes.readUInt32LE( offset + 20 );
		const nameSize = bytes.readUInt16LE( offset + 28 ), extra = bytes.readUInt16LE( offset + 30 ), comment = bytes.readUInt16LE( offset + 32 );
		const name = bytes.subarray( offset + 46, offset + 46 + nameSize ).toString(), local = bytes.readUInt32LE( offset + 42 );
		const start = local + 30 + bytes.readUInt16LE( local + 26 ) + bytes.readUInt16LE( local + 28 );
		const data = bytes.subarray( start, start + size );
		check( method === 0 || method === 8, 'supported donor ZIP compression' );
		entries.set( name, method === 8 ? inflateRawSync( data ) : data ); offset += 46 + nameSize + extra + comment;

	}
	return entries;

}
function donor( filename, axes ) {

	const entries = archive( filename ), doc = JSON.parse( entries.get( 'scene.gltf' ) );
	const buffers = doc.buffers.map( buffer => entries.get( buffer.uri ) );
	function accessor( index ) {

		const a = doc.accessors[ index ], v = doc.bufferViews[ a.bufferView ];
		const columns = { VEC3: 3, VEC2: 2, SCALAR: 1 }[ a.type ];
		const width = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[ a.componentType ];
		const method = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[ a.componentType ];
		return Array.from( { length: a.count }, ( _, i ) => Array.from( { length: columns }, ( _, j ) =>
			buffers[ v.buffer ][ method ]( ( v.byteOffset || 0 ) + ( a.byteOffset || 0 ) + i * ( v.byteStride || columns * width ) + j * width ) ) );

	}
	let result;
	function visit( id, parent ) {

		const node = doc.nodes[ id ], matrix = parent.clone().multiply( node.matrix ? new THREE.Matrix4().fromArray( node.matrix ) : new THREE.Matrix4() );
		if ( node.mesh !== undefined ) {

			check( ! result, 'single donated primitive' );
			const primitive = doc.meshes[ node.mesh ].primitives[ 0 ];
			const positions = accessor( primitive.attributes.POSITION ).map( coordinates => {

				const point = new THREE.Vector3().fromArray( coordinates ).applyMatrix4( matrix ).toArray();
				return axes.map( axis => point[ Math.abs( axis ) - 1 ] * Math.sign( axis ) );

			} );
			result = { positions, uv: accessor( primitive.attributes.TEXCOORD_0 ), entries, doc, material: doc.materials[ primitive.material ] };

		}
		for ( const child of node.children || [] ) visit( child, matrix );

	}
	for ( const id of doc.scenes[ doc.scene || 0 ].nodes ) visit( id, new THREE.Matrix4() );
	return result;

}
function header( key ) {

	const bytes = files.get( 'progs/' + key + '.mdl' );
	const ns = bytes.readInt32LE( 48 ), w = bytes.readInt32LE( 52 ), h = bytes.readInt32LE( 56 );
	const nv = bytes.readInt32LE( 60 ), nt = bytes.readInt32LE( 64 ), nf = bytes.readInt32LE( 68 );
	let offset = 84;
	check( ns === 1 && bytes.readInt32LE( offset ) === 0, 'single native skin' );
	const skin = bytes.subarray( 88, 88 + w * h ), palette = files.get( 'gfx/palette.lmp' );
	const rgba = new Uint8Array( w * h * 4 );
	for ( let i = 0; i < skin.length; i ++ ) { rgba.set( palette.subarray( skin[ i ] * 3, skin[ i ] * 3 + 3 ), i * 4 ); rgba[ i * 4 + 3 ] = 255; }
	const texture = new THREE.DataTexture( rgba, w, h ); texture.colorSpace = THREE.SRGBColorSpace;
	offset += 4 + w * h;
	const stverts = Array.from( { length: nv }, ( _, i ) => ( { onseam: bytes.readInt32LE( offset + i * 12 ), s: bytes.readInt32LE( offset + i * 12 + 4 ), t: bytes.readInt32LE( offset + i * 12 + 8 ) } ) );
	offset += nv * 12;
	const triangles = Array.from( { length: nt }, ( _, i ) => ( { facesfront: bytes.readInt32LE( offset + i * 16 ), vertindex: [ 4, 8, 12 ].map( n => bytes.readInt32LE( offset + i * 16 + n ) ) } ) );
	offset += nt * 16;
	const poseverts = [];
	for ( let pose = 0; pose < nf; pose ++ ) {

		check( bytes.readInt32LE( offset ) === 0, 'single native pose' ); offset += 28;
		poseverts.push( Array.from( { length: nv }, ( _, i ) => ( { v: Array.from( bytes.subarray( offset + i * 4, offset + i * 4 + 3 ) ), lightnormalindex: bytes[ offset + i * 4 + 3 ] } ) ) ); offset += nv * 4;

	}
	const result = { poseverts, stverts, triangles, numposes: nf, numverts: nv, numtris: nt, skinwidth: w, skinheight: h,
		scale: [ 8, 12, 16 ].map( n => bytes.readFloatLE( n ) ), scale_origin: [ 20, 24, 28 ].map( n => bytes.readFloatLE( n ) ),
		gl_texturenum: [ texture ], numframes: nf, frames: poseverts.map( ( _, i ) => ( { firstpose: i, numposes: 1 } ) ), skin };
	GL_MakeAliasModelDisplayLists( { name: 'progs/' + key + '.mdl' }, result ); return result;

}
function drawn( key, h ) { return R_DrawAliasModel( { model: { name: 'progs/' + key + '.mdl' }, frame: 0, skinnum: 0, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] }, h, new Float32Array( 162 ).fill( 1 ), 1 ); }
function nativeBodyPoints( h, viewmodel ) {

	const points = h.poseverts[ 0 ].map( v => v.v.map( ( value, i ) => value * h.scale[ i ] + h.scale_origin[ i ] ) );
	if ( ! viewmodel ) return points;
	// Independently identify and exclude disconnected hidden muzzle flash
	// components, using native topology and their parked-behind-eye position.
	const neighbours = Array.from( { length: points.length }, () => new Set() );
	for ( const triangle of h.triangles ) for ( const a of triangle.vertindex ) for ( const b of triangle.vertindex ) neighbours[ a ].add( b );
	const seen = new Set(), selected = [];
	for ( let id = 0; id < points.length; id ++ ) {

		if ( seen.has( id ) ) continue;
		const pending = [ id ], component = [];
		while ( pending.length ) {

			const next = pending.pop(); if ( seen.has( next ) ) continue;
			seen.add( next ); component.push( next ); pending.push( ...neighbours[ next ] );

		}
		if ( Math.max( ...component.map( i => points[ i ][ 0 ] ) ) >= 0 ) selected.push( ...component.map( i => points[ i ] ) );

	}
	return selected;

}
function shader( material ) {

	const compiled = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' };
	material.onBeforeCompile( compiled ); return compiled;

}
async function withAssets( fn ) {

	const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load;
	const old = { hdr: r_hdr.value, weapons: weapons.r_newer_weapons.value, lerp: r_lerpmodels.value };
	globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse( read( String( path ) ) ) }; } catch { return { ok: false }; } };
	THREE.TextureLoader.prototype.load = function ( url, loaded ) { const texture = new THREE.DataTexture( new Uint8Array( [ 200, 180, 150, 255 ] ), 1, 1 ); texture._reviewSourceUrl = url; queueMicrotask( () => loaded( texture ) ); return texture; };
	if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
	Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 1; r_lerpmodels.value = 0;
	try {

		const manifest = await weapons.R_WeaponsLoad();
		await Promise.all( [ 'v_rock2', 'g_rock2', 'v_rock', 'g_rock', 'v_light', 'g_light', 'v_shot2', 'g_shot' ].map( key => weapons.R_WeaponLoad( key ) ) );
		await fn( manifest );

	} finally {

		globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad;
		Cvar_SetValue( 'r_hdr', old.hdr ); weapons.r_newer_weapons.value = old.weapons; r_lerpmodels.value = old.lerp;

	}

}

Deno.test( 'refinement: rockets preserve donor orientation and dimensions with exactly a held-only 3-unit rearward offset', async () => {

	const source = donor( 'rocketlauncher.zip', [ 1, - 3, 2 ] );
	await withAssets( async manifest => {

		for ( const key of [ 'v_rock2', 'g_rock2' ] ) {

			const h = header( key ), mesh = drawn( key, h ), positions = mesh.geometry.getAttribute( 'position' ).array;
			const target = nativeBodyPoints( h, key === 'v_rock2' );
			check( positions.length === source.positions.length * 3, 'rocket donor vertex identity preserved' );
			for ( let axis = 0; axis < 3; axis ++ ) {

				const raw = source.positions.map( p => p[ axis ] ), actual = Array.from( { length: raw.length }, ( _, i ) => positions[ i * 3 + axis ] );
				const low = Math.min( ...raw ), range = Math.max( ...raw ) - low, actualLow = Math.min( ...actual ), actualRange = Math.max( ...actual ) - actualLow;
				const native = target.map( p => p[ axis ] ), nativeLow = Math.min( ...native ), nativeRange = Math.max( ...native ) - nativeLow;
				const offset = key === 'v_rock2' && axis === 0 ? - 3 : 0;
				near( actualRange, nativeRange, key + ' original fitted dimension ' + axis );
				for ( let i = 0; i < raw.length; i ++ ) {

					const expected = nativeLow + ( raw[ i ] - low ) * nativeRange / range + offset;
					near( actual[ i ], expected, key + ' independently fitted/shifted source vertex ' + i + ' axis ' + axis, 0.000005 );

				}

			}
			const uv = mesh.geometry.getAttribute( 'uv' );
			for ( const [ id, originalUv ] of source.uv.entries() ) {

				near( uv.getX( id ), originalUv[ 0 ], key + ' unchanged donor U ' + id, 0.0000001 );
				near( uv.getY( id ), originalUv[ 1 ], key + ' unchanged donor V ' + id, 0.0000001 );

			}
			if ( key === 'v_rock2' ) check( JSON.stringify( manifest.models[ key ].viewOffset ) === '[-3,0,0]', 'held-only correction documented in asset metadata' );
			else check( ! manifest.models[ key ].viewOffset, 'pickup has no held-only offset' );
			const grip = source.positions.map( ( p, id ) => ( { p, id } ) ).filter( item => item.p[ 2 ] < - 2 );
			check( grip.length > 20, 'original donor grip landmark found' );
			const muzzle = source.positions.reduce( ( best, p, id ) => p[ 0 ] > source.positions[ best ][ 0 ] ? id : best, 0 );
			check( grip.every( item => positions[ item.id * 3 ] < positions[ muzzle * 3 ] ), key + ' hanging grip behind forward nozzle' );

		}

	} );

} );

Deno.test( 'refinement: original lightning body sampler and axis swap survive actual draw and material cloning', async () => {

	const source = donor( 'thuderbolt.zip', [ - 1, 3, 2 ] );
	await withAssets( async manifest => {

		const style = manifest.sources.thunderbolt.material.style;
		const core = source.uv.map( ( uv, id ) => ( { uv, id } ) ).filter( ( { uv } ) => uv[ 0 ] >= style.originalWrap.donorRect[ 0 ] - 1e-7 && uv[ 0 ] <= style.originalWrap.donorRect[ 2 ] + 1e-7 && uv[ 1 ] >= style.originalWrap.donorRect[ 1 ] - 1e-7 && uv[ 1 ] <= style.originalWrap.donorRect[ 3 ] + 1e-7 );
		check( core.length === 26 && core.every( item => item.id >= 1142 && item.id <= 1167 ), 'wrap masks only original donated cylindrical side' );
		const rects = { v_light: [ 32.5 / 308, 44.5 / 162, 99.5 / 308, 144.5 / 162 ], g_light: [ 109.5 / 308, 42.5 / 144, 147.5 / 308, 114.5 / 144 ] };
		const retained = [];
		for ( const key of [ 'v_light', 'g_light' ] ) {

			const h = header( key ), mesh = drawn( key, h ), compiled = shader( mesh.material );
			check( compiled.uniforms.qrNativeSkin.value === h.gl_texturenum[ 0 ] && compiled.uniforms.uHasNativeSkin.value === 1, key + ' binds original role skin' );
			check( compiled.fragmentShader.includes( 'qrCoreUv.yx' ), key + ' swaps donor axial U into original axial V' );
			style.originalWrap.nativeRects[ key ].forEach( ( value, i ) => near( value, rects[ key ][ i ], key + ' independently identified original body crop', 1e-12 ) );
			const patch = R_WeaponStyleGLSL( style, key );
			check( patch.map.includes( 'diffuseColor.a *= mix( 1.0, 0.700000000, qrCoreMask )' ), key + ' only chamber/core receives semitransparency' );
			check( patch.emission.includes( 'qrEmission *= 1.0 - qrCoreMask' ), key + ' original body is free of donated blue emission' );
			check( compiled.fragmentShader.indexOf( 'qrNativeUv =' ) < compiled.fragmentShader.indexOf( 'vec3 qrAlbedo =' ), key + ' lighting captures corrected original body colour' );
			check( compiled.fragmentShader.includes( 'qrNormal' ), key + ' original donor normal detail remains' );
			const clone = R_CloneAliasMaterial( mesh.material ), cloned = shader( clone );
			check( cloned.uniforms.qrNativeSkin.value === h.gl_texturenum[ 0 ], key + ' view clone retains sampler identity' );
			check( cloned.fragmentShader === compiled.fragmentShader && clone.customProgramCacheKey() === mesh.material.customProgramCacheKey(), key + ' clone retains all style/normal/albedo behavior' );
			retained.push( [ compiled, h.gl_texturenum[ 0 ] ] ); clone.dispose();

		}
		check( retained[ 0 ][ 0 ].uniforms.qrNativeSkin.value === retained[ 0 ][ 1 ], 'pickup draw does not overwrite held original sampler' );

	} );

} );

Deno.test( 'refinement: SSG barrel grading preserves original texture detail and wood; lightning wires become brown', async () => {

	await withAssets( async manifest => {

		const shotgun = manifest.sources.supershotgun.material.style, lightning = manifest.sources.thunderbolt.material.style;
		const originalSSG = donor( 'supershotgun.zip', [ 1, - 3, 2 ] );
		// Long cylindrical sides identified independently from source geometry and
		// UV island connectivity. Breech rings/muzzle interiors are separate islands.
		const tubeIds = new Set( [
			701, 702, 703, 704, 713, 714, 715, 716, 720, 721, 722, 723, 724, 725, 727, 728, 729, 730, 731, 732, 735, 736, 737, 738, 741, 742, 745, 746, 748, 749, 750, 752, 756, 758, 759, 760, 761, 762, 772,
			831, 832, 833, 834, 843, 844, 845, 846, 850, 851, 852, 853, 854, 855, 857, 858, 859, 860, 861, 862, 865, 866, 867, 868, 871, 872, 875, 876, 878, 879, 880, 882, 886, 888, 889, 890, 891, 892, 902
		] );
		const inside = ( uv, rect ) => uv[ 0 ] >= rect[ 0 ] - 1e-7 && uv[ 0 ] <= rect[ 2 ] + 1e-7 && uv[ 1 ] >= rect[ 1 ] - 1e-7 && uv[ 1 ] <= rect[ 3 ] + 1e-7;
		check( ! shotgun.palette?.length && shotgun.grading?.length === 2, 'SSG uses colour grading, never luminance tint replacement' );
		for ( const [ id, uv ] of originalSSG.uv.entries() ) {

			const graded = shotgun.grading.some( rule => inside( uv, rule.rect ) );
			check( graded === tubeIds.has( id ), 'barrel grading scope at donor vertex ' + id );
			if ( id >= 957 ) check( ! graded, 'original wood stock remains unchanged' );

		}
		const grade = R_WeaponStyleGLSL( shotgun, 'v_shot2' );
		check( ! grade.map.includes( 'qrSourceLuma *' ), 'grading does not flatten texture colour into a tint' );
		const equations = Array.from( grade.map.matchAll( /vec3 qrGrade\d+ = max\( qrSourceColour \* vec3\( ([\d.,\s]+) \) \* ([\d.]+), vec3\( 0\.0 \) \);/g ) );
		check( equations.length === 2, 'each tube grades the original sampled RGB' );
		for ( const equation of equations ) {

			const balance = equation[ 1 ].split( ',' ).map( Number ), gain = Number( equation[ 2 ] );
			balance.forEach( ( value, i ) => near( value, [ .94, .98, 1.14 ][ i ], 'encoded barrel colour balance' ) ); near( gain, .74, 'encoded barrel exposure' );

		}
		check( grade.map.includes( ', 0.850000000 );' ) && grade.map.includes( 'vec3( 1.080000000 )' ), 'encoded saturation and contrast preserve detail' );
		// Numeric oracle uses the actual emitted balance/exposure values. Distinct
		// RGB samples must stay distinct after the specified saturation and contrast.
		const balance = equations[ 0 ][ 1 ].split( ',' ).map( Number ), gain = Number( equations[ 0 ][ 2 ] );
		const evaluate = input => {

			const exposed = input.map( ( value, i ) => Math.max( 0, value * balance[ i ] * gain ) );
			const luminance = exposed[ 0 ] * .2126 + exposed[ 1 ] * .7152 + exposed[ 2 ] * .0722;
			return exposed.map( value => .18 * Math.pow( ( luminance * .15 + value * .85 ) / .18, 1.08 ) );

		};
		const gradedPixel = evaluate( [ .31, .17, .06 ] );
		const expectedPixel = [ .205988901940, .121870058955, .058594869729 ];
		gradedPixel.forEach( ( value, i ) => near( value, expectedPixel[ i ], 'numeric barrel grade channel ' + i, .000001 ) );
		const alternate = evaluate( [ .06, .17, .31 ] );
		check( alternate[ 2 ] > alternate[ 0 ] && gradedPixel[ 0 ] > gradedPixel[ 2 ], 'grading retains source hue variation' );
		const wires = lightning.palette[ 0 ];
		check( wires.chroma === 'blue' && wires.tint[ 0 ] > wires.tint[ 1 ] && wires.tint[ 1 ] > wires.tint[ 2 ] && wires.gain <= .4, 'blue wires become dark brown' );
		const wirePatch = R_WeaponStyleGLSL( lightning, 'v_light' );
		check( wirePatch.map.includes( 'qrSourceColour.b - max( qrSourceColour.r, qrSourceColour.g )' ), 'wire tint applies only to blue donor colour' );
		let suppliedMap;
		for ( const key of [ 'v_shot2', 'g_shot' ] ) {

			const mesh = drawn( key, header( key ) ), compiled = shader( mesh.material );
			check( compiled.fragmentShader.includes( 'qrGrade0' ) && ! compiled.fragmentShader.includes( 'qrNativeSkin' ), key + ' keeps donor detail with scoped barrel grading' );
			check( mesh.material.map._reviewSourceUrl.endsWith( 'supershotgun/diffuse.png' ), key + ' grades the supplied texture directly' );
			const uv = mesh.geometry.getAttribute( 'uv' );
			check( uv.count === originalSSG.uv.length, key + ' preserves donated UV topology' );
			for ( const [ id, originalUv ] of originalSSG.uv.entries() ) {

				near( uv.getX( id ), originalUv[ 0 ], key + ' original U ' + id, 0.0000001 );
				near( uv.getY( id ), originalUv[ 1 ], key + ' original V ' + id, 0.0000001 );

			}
			if ( suppliedMap ) check( mesh.material.map === suppliedMap, 'held/pickup grading share untouched supplied texture identity' );
			suppliedMap = mesh.material.map;

		}
		for ( const [ name, filename, axes ] of [ [ 'supershotgun', 'supershotgun.zip', [ 1, - 3, 2 ] ], [ 'thunderbolt', 'thuderbolt.zip', [ - 1, 3, 2 ] ] ] ) {

			const original = donor( filename, axes ), image = original.doc.images[ original.doc.textures[ original.material.pbrMetallicRoughness.baseColorTexture.index ].source ];
			check( read( 'newer/weapons/' + name + '/diffuse.png' ).equals( original.entries.get( image.uri ) ), name + ' supplied diffuse bitmap unchanged' );
			const normalImage = original.doc.images[ original.doc.textures[ original.material.normalTexture.index ].source ];
			check( read( 'newer/weapons/' + name + '/normal.png' ).equals( original.entries.get( normalImage.uri ) ), name + ' supplied normal bitmap unchanged' );

		}
		check( ! R_WeaponStyleGLSL( shotgun, 'v_shot2' ).map.includes( 'diffuseColor.a' ), 'SSG palette never changes opacity' );
		check( ! R_WeaponStyleGLSL( lightning, 'unrelated' ).map.includes( 'diffuseColor.a' ), 'chamber opacity only exists on lightning roles' );

	} );

} );
