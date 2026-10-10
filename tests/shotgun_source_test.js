// Independent source port and public draw checks for the supplied single SG.
// Reads shotgun.zip and original MDL; other missing source archives are neither
// restored nor hidden by this focused test.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const weapons = await import( '../src/r_weapons.js' );
const { GL_MakeAliasModelDisplayLists, GL_DrawAliasFrame, R_DrawAliasModel } = await import( '../src/gl_mesh.js' );
const anim = await import( '../src/r_anim.js' );
const vars = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { cl } = await import( '../src/engine/client/client.js' );
function check( value, label ) { if ( ! value ) throw new Error( label ); }
function equal( a, b, label ) { check( a === b, `${label}: ${a} != ${b}` ); }
function near( a, b, label, epsilon = .00002 ) { check( Number.isFinite( a ) && Math.abs( a - b ) < epsilon, `${label}: ${a} != ${b}` ); }
function bytes( name ) { return readFileSync( new URL( '../' + name, import.meta.url ) ); }
const pak = bytes( 'pak0.pak' ), directory = pak.readInt32LE( 4 ), directorySize = pak.readInt32LE( 8 );
const nativeFiles = new Map();
for ( let i = directory; i < directory + directorySize; i += 64 ) {

	const name = pak.subarray( i, i + 56 ).toString().split( '\0' )[ 0 ];
	nativeFiles.set( name, pak.subarray( pak.readInt32LE( i + 56 ), pak.readInt32LE( i + 56 ) + pak.readInt32LE( i + 60 ) ) );

}
function nativeHeader( key ) {

	const b = nativeFiles.get( 'progs/' + key + '.mdl' );
	const ns = b.readInt32LE( 48 ), sw = b.readInt32LE( 52 ), sh = b.readInt32LE( 56 );
	const nv = b.readInt32LE( 60 ), nt = b.readInt32LE( 64 ), nf = b.readInt32LE( 68 );
	let offset = 84;
	for ( let i = 0; i < ns; i ++ ) { equal( b.readInt32LE( offset ), 0, 'native single skin' ); offset += 4 + sw * sh; }
	const stverts = Array.from( { length: nv }, ( _, i ) => ( {
		onseam: b.readInt32LE( offset + i * 12 ), s: b.readInt32LE( offset + i * 12 + 4 ), t: b.readInt32LE( offset + i * 12 + 8 ) } ) );
	offset += nv * 12;
	const triangles = [];
	const neighbours = Array.from( { length: nv }, () => new Set() );
	for ( let i = 0; i < nt; i ++ ) {

		const triangle = [ 4, 8, 12 ].map( o => b.readInt32LE( offset + i * 16 + o ) );
		triangles.push( { facesfront: b.readInt32LE( offset + i * 16 ), vertindex: triangle } );
		for ( const v of triangle ) for ( const neighbour of triangle ) neighbours[ v ].add( neighbour );

	}
	offset += nt * 16;
	const poses = [];
	for ( let i = 0; i < nf; i ++ ) {

		equal( b.readInt32LE( offset ), 0, 'native single pose' ); offset += 28;
		poses.push( Array.from( { length: nv }, ( _, j ) => ( { v: Array.from( b.subarray( offset + j * 4, offset + j * 4 + 3 ) ), lightnormalindex: b[ offset + j * 4 + 3 ] } ) ) );
		offset += nv * 4;

	}
	const seen = new Set(), components = [];
	for ( let v = 0; v < nv; v ++ ) {

		if ( seen.has( v ) ) continue;
		const pending = [ v ], component = [];
		while ( pending.length ) {

			const id = pending.pop(); if ( seen.has( id ) ) continue;
			seen.add( id ); component.push( id ); pending.push( ...neighbours[ id ] );

		}
		components.push( component );

	}
	const header = { poseverts: poses, stverts, triangles, numposes: poses.length, numverts: nv, numtris: nt, skinwidth: sw, skinheight: sh,
		components, key, scale: [ 8, 12, 16 ].map( o => b.readFloatLE( o ) ),
		scale_origin: [ 20, 24, 28 ].map( o => b.readFloatLE( o ) ), numframes: nf,
		frames: poses.map( ( _, i ) => ( { firstpose: i, numposes: 1 } ) ) };
	const palette = nativeFiles.get( 'gfx/palette.lmp' ), skin = b.subarray( 88, 88 + sw * sh ), rgba = new Uint8Array( sw * sh * 4 );
	for ( let i = 0; i < skin.length; i ++ ) { rgba.set( palette.subarray( skin[ i ] * 3, skin[ i ] * 3 + 3 ), i * 4 ); rgba[ i * 4 + 3 ] = 255; }
	const texture = new THREE.DataTexture( rgba, sw, sh ); texture.colorSpace = THREE.SRGBColorSpace; header.gl_texturenum = [ texture ];
	GL_MakeAliasModelDisplayLists( { name: 'progs/' + key + '.mdl' }, header );
	return header;

}
function nativeBounds( header ) {

	const vertices = header.poseverts[ 0 ].map( v => v.v.map( ( x, i ) => x * header.scale[ i ] + header.scale_origin[ i ] ) );
	// Native firearms park their flash component behind the eye during rest.
	// The axe's separate 58-vertex component is the hand/arm, not weapon art.
	const ids = header.components.filter( component => ! header.key.startsWith( 'v_' ) ||
		( header.key === 'v_axe' ? component.length !== 58 : Math.max( ...component.map( i => vertices[ i ][ 0 ] ) ) >= 0 ) ).flat();
	return { min: [ 0, 1, 2 ].map( i => Math.min( ...ids.map( id => vertices[ id ][ i ] ) ) ), max: [ 0, 1, 2 ].map( i => Math.max( ...ids.map( id => vertices[ id ][ i ] ) ) ) };

}


const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load;
const previous = { hdr: r_hdr.string, weapons: weapons.r_newer_weapons.value, lerp: anim.r_lerpmodels.value };
globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse( bytes( String( path ) ).toString() ) }; } catch { return { ok: false }; } };
THREE.TextureLoader.prototype.load = function ( url, loaded ) { const texture = new THREE.Texture(); texture._sourceRequest = String( url ); queueMicrotask( () => loaded( texture ) ); return texture; };
if ( ! vars.Cvar_FindVar( 'r_hdr' ) ) vars.Cvar_RegisterVariable( r_hdr );
vars.Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 1; anim.r_lerpmodels.value = 0;
const manifest = await weapons.R_WeaponsLoad(); await weapons.R_WeaponLoad( 'v_shot' );
Deno.test( 'standard shotgun source port preserves the supplied topology, UVs, textures, proper forward orientation and all seven native firing poses', () => {

	const zip = bytes( 'shotgun.zip' ), entries = new Map(); let end = zip.length - 22;
	while ( zip.readUInt32LE( end ) !== 0x06054b50 ) end --;
	let offset = zip.readUInt32LE( end + 16 );
	for ( let i = 0; i < zip.readUInt16LE( end + 10 ); i ++ ) {

		const size = zip.readUInt32LE( offset + 20 ), nameSize = zip.readUInt16LE( offset + 28 ), extra = zip.readUInt16LE( offset + 30 ), comment = zip.readUInt16LE( offset + 32 );
		const name = zip.subarray( offset + 46, offset + 46 + nameSize ).toString(), local = zip.readUInt32LE( offset + 42 ), method = zip.readUInt16LE( offset + 10 );
		const start = local + 30 + zip.readUInt16LE( local + 26 ) + zip.readUInt16LE( local + 28 ); check( method === 0 || method === 8, 'shotgun ZIP encoding' );
		const data = zip.subarray( start, start + size ); entries.set( name, method === 8 ? inflateRawSync( data ) : data ); offset += 46 + nameSize + extra + comment;

	}
	const doc = JSON.parse( entries.get( 'scene.gltf' ) ), buffers = doc.buffers.map( buffer => entries.get( buffer.uri ) ); let source;
	function accessor( id ) {

		const a = doc.accessors[ id ], v = doc.bufferViews[ a.bufferView ], n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[ a.type ], width = { 5126: 4, 5125: 4, 5123: 2, 5121: 1 }[ a.componentType ];
		const method = { 5126: 'readFloatLE', 5125: 'readUInt32LE', 5123: 'readUInt16LE', 5121: 'readUInt8' }[ a.componentType ];
		return Array.from( { length: a.count }, ( _, i ) => Array.from( { length: n }, ( _, j ) => buffers[ v.buffer ][ method ]( ( v.byteOffset || 0 ) + ( a.byteOffset || 0 ) + i * ( v.byteStride || n * width ) + j * width ) ) );

	}
	function visit( id, parent ) {

		const node = doc.nodes[ id ], matrix = parent.clone().multiply( node.matrix ? new THREE.Matrix4().fromArray( node.matrix ) : new THREE.Matrix4() );
		if ( node.mesh !== undefined ) {

			check( ! source, 'one supplied shotgun mesh' ); const primitive = doc.meshes[ node.mesh ].primitives[ 0 ];
			check( matrix.determinant() > 0, 'source world transform preserves handedness' );
			source = { positions: accessor( primitive.attributes.POSITION ).map( p => { const point = new THREE.Vector3( ...p ).applyMatrix4( matrix ); return [ - point.x, point.z, point.y ]; } ),
				uv: accessor( primitive.attributes.TEXCOORD_0 ), indices: accessor( primitive.indices ).flat(), material: doc.materials[ primitive.material ] };

		}
		for ( const child of node.children || [] ) visit( child, matrix );

	}
	for ( const id of doc.scenes[ doc.scene || 0 ].nodes ) visit( id, new THREE.Matrix4() );
	equal( source.positions.length, 745, 'actual donor point count' ); equal( source.indices.length, 766 * 3, 'actual donor triangle count' );
	check( new THREE.Matrix4().set( - 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1 ).determinant() > 0, 'muzzle reversal is a proper rotation, no mirrored normals' );
	const h = nativeHeader( 'v_shot' ), bounds = nativeBounds( h ), body = Array.from( { length: 56 }, ( _, i ) => i + 12 );
	equal( h.numframes, 7, 'seven original single-shotgun frames' );
	const sourceBox = new THREE.Box3().setFromPoints( source.positions.map( p => new THREE.Vector3( ...p ) ) );
	const fitted = source.positions.map( p => p.map( ( value, axis ) => bounds.min[ axis ] + ( value - sourceBox.min.getComponent( axis ) ) * ( bounds.max[ axis ] - bounds.min[ axis ] ) / ( sourceBox.max.getComponent( axis ) - sourceBox.min.getComponent( axis ) ) ) );
	const points = frame => body.map( id => h.poseverts[ frame ][ id ].v.map( ( x, axis ) => x * h.scale[ axis ] + h.scale_origin[ axis ] ) );
	const mean = values => [ 0, 1, 2 ].map( axis => values.reduce( ( sum, p ) => sum + p[ axis ], 0 ) / values.length );
	const nativePoint = id => new THREE.Vector3( ...h.poseverts[ 0 ][ id ].v.map( ( x, axis ) => x * h.scale[ axis ] + h.scale_origin[ axis ] ) );
	const average = values => values.reduce( ( sum, p ) => sum.add( p ), new THREE.Vector3() ).divideScalar( values.length );
	const front = average( [ 20, 34, 46, 47, 53, 64 ].map( nativePoint ) ), rear = average( [ 51, 61, 52, 62, 27, 40 ].map( nativePoint ) );
	const forward = front.clone().sub( rear ).normalize(), side = new THREE.Vector3( 0, 0, 1 ).cross( forward ).normalize(), up = forward.clone().cross( side ).normalize();
	const barrelFrame = new THREE.Matrix4().makeBasis( forward, side, up );
	const capCenter = average( fitted.slice( 136, 172 ).map( p => new THREE.Vector3( ...p ) ) );
	const rest = fitted.map( p => new THREE.Vector3( ...p ).sub( capCenter ).applyMatrix4( barrelFrame ).add( front ).toArray() );
	const correctedCap = average( rest.slice( 136, 172 ).map( p => new THREE.Vector3( ...p ) ) );
	for ( let axis = 0; axis < 3; axis ++ ) near( correctedCap.getComponent( axis ), front.getComponent( axis ), 'source muzzle center anchored to original muzzle', .000002 );
	check( forward.z < - .13 && forward.x > .98, 'original bore tilts downward about eight degrees' );
	const center = mean( points( 0 ) );
	// Independent Horn quaternion alignment instead of the importer's SVD.
	function motion( frame ) {

		const target = points( frame ), targetCenter = mean( target ), s = Array.from( { length: 3 }, () => [ 0, 0, 0 ] );
		points( 0 ).forEach( ( p, i ) => { for ( let a = 0; a < 3; a ++ ) for ( let b = 0; b < 3; b ++ ) s[ a ][ b ] += ( p[ a ] - center[ a ] ) * ( target[ i ][ b ] - targetCenter[ b ] ); } );
		const [ [ xx, xy, xz ], [ yx, yy, yz ], [ zx, zy, zz ] ] = s, n = [ [ xx + yy + zz, yz - zy, zx - xz, xy - yx ], [ yz - zy, xx - yy - zz, xy + yx, zx + xz ], [ zx - xz, xy + yx, - xx + yy - zz, yz + zy ], [ xy - yx, zx + xz, yz + zy, - xx - yy + zz ] ];
		const shift = Math.max( ...n.map( row => row.reduce( ( sum, x ) => sum + Math.abs( x ), 0 ) ) ); n.forEach( ( row, i ) => { row[ i ] += shift; } ); let q = [ 1, 0, 0, 0 ];
		for ( let i = 0; i < 500; i ++ ) { const next = n.map( row => row.reduce( ( sum, x, j ) => sum + x * q[ j ], 0 ) ), length = Math.hypot( ...next ); q = next.map( x => x / length ); }
		return p => new THREE.Vector3( ...p ).sub( new THREE.Vector3( ...center ) ).applyQuaternion( new THREE.Quaternion( q[ 1 ], q[ 2 ], q[ 3 ], q[ 0 ] ) ).add( new THREE.Vector3( ...targetCenter ) ).toArray();

	}
	const e = { frame: 0, skinnum: 0, model: { name: 'progs/v_shot.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] }; let restMesh;
	for ( let frame = 0; frame < h.numframes; frame ++ ) {

		e.frame = frame; const mesh = R_DrawAliasModel( e, h, null ), positions = mesh.geometry.getAttribute( 'position' ), transform = motion( frame );
		for ( const [ id, p ] of rest.entries() ) transform( p ).forEach( ( value, axis ) => near( positions.array[ id * 3 + axis ], value, 'independent source/native pose ' + frame + ' vertex ' + id, .000025 ) );
		if ( frame === 0 ) {

			restMesh = mesh; const uv = mesh.geometry.getAttribute( 'uv' );
			equal( mesh.geometry.index.count, source.indices.length, 'all supplied triangle indices rendered' );
			check( Array.from( mesh.geometry.index.array ).every( ( value, i ) => value === source.indices[ i ] ), 'donor topology unchanged' );
			for ( const [ id, p ] of source.uv.entries() ) { near( uv.getX( id ), p[ 0 ], 'unchanged shotgun U', .0000001 ); near( uv.getY( id ), p[ 1 ], 'unchanged shotgun V', .0000001 ); }
			const muzzle = [ 138, 139, 142, 143, 146, 147, 150, 151 ], grip = [ 570, 571, 572, 573, 588, 589, 590, 591 ];
			check( Math.min( ...muzzle.map( id => positions.getX( id ) ) ) > Math.max( ...grip.map( id => positions.getX( id ) ) ), 'supplied muzzle ahead of grip' );
			check( Math.min( ...muzzle.map( id => positions.getZ( id ) ) ) > Math.max( ...grip.map( id => positions.getZ( id ) ) ), 'barrel above downward grip' );

		}

	}
	for ( const [ filename, slot ] of [ [ 'diffuse.png', source.material.pbrMetallicRoughness.baseColorTexture ], [ 'normal.png', source.material.normalTexture ] ] ) {

		const image = doc.images[ doc.textures[ slot.index ].source ]; check( bytes( 'newer/weapons/shotgun/' + filename ).equals( entries.get( image.uri ) ), filename + ' donor bitmap byte identical' );

	}
	check( bytes( 'newer/weapons/shotgun/license.txt' ).equals( entries.get( 'license.txt' ) ), 'new source license copied unchanged' );
	check( restMesh.material.map._sourceRequest.endsWith( '/shotgun/diffuse.png' ), 'actual draw samples supplied standard shotgun diffuse' );
	const compiled = { uniforms: {}, vertexShader: '#include <project_vertex>', fragmentShader: '#include <map_fragment>\n#include <color_fragment>\n#include <opaque_fragment>\n#include <colorspace_fragment>' }; restMesh.material.onBeforeCompile( compiled );
	check( compiled.uniforms.qrNormal.value?._sourceRequest.endsWith( '/shotgun/normal.png' ) && compiled.uniforms.uHasNormal.value === 1, 'actual normal texture bound' );
	// Exercise the real alias interpolation after independently proving both
	// endpoints; the existing generic draw, not an app-specific animation path.
	// In-between frames are Newer Game's (R_AnimEnabled): a Newer frame turns it on in R_PostBegin, which this draw skips.
	const oldTime = cl.time; anim.r_lerpmodels.value = 2; const wasNewer = anim.R_IsNewer(); anim.R_AnimSetNewer( true );
	try {

		const lerped = { ...e, frame: 0, _aliasMesh: null, _aliasGeo: null }; cl.time = 70; R_DrawAliasModel( lerped, h, null );
		cl.time = 70.1; lerped.frame = 1; R_DrawAliasModel( lerped, h, null ); cl.time = 70.15;
		const midpoint = R_DrawAliasModel( lerped, h, null ).geometry.getAttribute( 'position' ).array;
		const imported = JSON.parse( bytes( 'newer/weapons/v_shot.json' ).toString() );
		for ( let i = 0; i < midpoint.length; i ++ ) near( midpoint[ i ], ( imported.poses[ 0 ][ i ] + imported.poses[ 1 ][ i ] ) / 2, 'public single-shotgun midpoint interpolation', .000025 );

	} finally { cl.time = oldTime; anim.r_lerpmodels.value = 0; anim.R_AnimSetNewer( wasNewer ); }

} );

Deno.test( 'standard shotgun source: held and basic-drop roles; original classic/New Game/toggle art and the card [12] super shotgun pickup', () => {

	equal( Object.keys( manifest.models ).length, 14, 'fourteen firearm roles (eleven at the shotgun port; the nailgun and its pickup, then g_shot1 of card [12])' );
	// card [12] (owner request): the shotgun's art also draws the basic shotgun's death drop (g_shot1, skin 1 of g_shot.mdl)
	equal( Object.keys( manifest.models ).filter( key => manifest.models[ key ].source === 'shotgun' ).join( ',' ), 'v_shot,g_shot1', 'shotgun art: the held role and the basic shotgun drop' );
	equal( manifest.models.g_shot.source, 'supershotgun', 'existing native pickup identity remains SSG' );
	// Card [12] widened the SSG pickup twice across (tools/import_weapons.py --derive-pickups); pinned at that commit. (Before:
	// 5f040138ed80da2debcd0632e0defc1f1d94f24bcf4c484bc201ffd79972a067, from git 8e4fefc.)
	equal( createHash( 'sha256' ).update( bytes( 'newer/weapons/g_shot.json' ) ).digest( 'hex' ), '9581185f3f5430ff1f33dbfc073958ae9c3adb4ff3821944c974b240f77222ab', 'SSG pickup bytes as card [12] made them' );
	check( weapons.R_WeaponAsset( 'progs/v_nail.mdl' ) === null && weapons.R_WeaponAsset( 'progs/v_axe.mdl' ) === null, 'original nailgun and axe retained' );
	const h = nativeHeader( 'v_shot' ), e = { frame: 0, skinnum: 0, model: { name: 'progs/v_shot.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
	const mesh = R_DrawAliasModel( e, h, null ), enhanced = mesh.geometry.getAttribute( 'position' );
	function native( label ) {

		R_DrawAliasModel( e, h, null ); equal( mesh.geometry.getAttribute( 'position' ), GL_DrawAliasFrame( h, 0 ).posAttr, label + ' original mesh' );
		equal( mesh.geometry.getAttribute( 'uv' ), GL_DrawAliasFrame( h, 0 ).uvAttr, label + ' original wrap' ); equal( mesh.material.map, h.gl_texturenum[ 0 ], label + ' original skin' );

	}
	try { anim.R_AnimSetClassicPass( true ); native( 'classic half' ); } finally { anim.R_AnimSetClassicPass( false ); }
	R_DrawAliasModel( e, h, null ); equal( mesh.geometry.getAttribute( 'position' ), enhanced, 'enhanced source returns after classic pass' );
	vars.Cvar_SetValue( 'r_hdr', 0 ); native( 'New Game' ); vars.Cvar_SetValue( 'r_hdr', 1 );
	weapons.r_newer_weapons.value = 0; try { native( 'feature disabled' ); } finally { weapons.r_newer_weapons.value = 1; }
	R_DrawAliasModel( e, h, null ); equal( mesh.geometry.getAttribute( 'position' ), enhanced, 'enhanced source returns after toggle' );

} );

Deno.test( 'standard shotgun source: restore public test fixtures', () => {

	globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad; vars.Cvar_Set( 'r_hdr', previous.hdr );
	weapons.r_newer_weapons.value = previous.weapons; anim.r_lerpmodels.value = previous.lerp; anim.R_AnimSetClassicPass( false );

} );
