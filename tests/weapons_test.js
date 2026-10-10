// Independent public-interface checks. Assets and original MDLs are read from
// the checkout; texture decoding is stubbed, while Three geometry stays real.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const weapons = await import( '../src/newer/render/r_weapons.js' );
const shells = await import( '../src/newer/render/r_shells.js' );
const { R_ShellTrace } = await import( '../src/newer/render/r_shelltrace.js' );
const { R_DrawAliasModel, GL_MakeAliasModelDisplayLists, GL_DrawAliasFrame } = await import( '../src/engine/render/gl_mesh.js' );
const anim = await import( '../src/newer/render/r_anim.js' ), mode = await import( '../src/newer/mode.js' );
const vars = await import( '../src/engine/common/cvar.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { cl, cls } = await import( '../src/engine/client/client.js' );
const common = await import( '../src/engine/common/common.js' );
const { CL_ParseStartSoundPacket } = await import( '../src/engine/client/cl_parse.js' );
const { R_SaveClassicScene } = await import( '../src/newer/render/r_classicstate.js' );

function check( value, label ) { if ( ! value ) throw new Error( label ); }
function equal( a, b, label ) { check( a === b, `${label}: ${a} != ${b}` ); }
function near( a, b, label, epsilon = 0.00002 ) { check( Number.isFinite( a ) && Math.abs( a - b ) < epsilon, `${label}: ${a} != ${b}` ); }
function bytes( name ) { return readFileSync( new URL( '../' + name, import.meta.url ) ); }

const originalFetch = globalThis.fetch, originalLoad = THREE.TextureLoader.prototype.load;
const previousState = { hdr: r_hdr.value, weapons: weapons.r_newer_weapons.value, lerp: anim.r_lerpmodels.value,
	viewentity: cl.viewentity, viewangles: cl.viewangles, velocity: cl.velocity, mesh: cl.viewent._aliasMesh };
const requestedTextures = [];
globalThis.fetch = async path => {

	try { const data = bytes( String( path ) ); return { ok: true, json: async () => JSON.parse( data.toString() ) }; }
	catch { return { ok: false }; }

};
THREE.TextureLoader.prototype.load = function ( url, loaded ) {

	requestedTextures.push( url );
	const texture = new THREE.DataTexture( new Uint8Array( [ 200, 180, 150, 255 ] ), 1, 1 );
	queueMicrotask( () => loaded( texture ) ); return texture;

};
vars.Cvar_RegisterVariable( r_hdr );
vars.Cvar_SetValue( 'r_hdr', 1 );
weapons.r_newer_weapons.value = 1;
anim.r_lerpmodels.value = 0;

// Decode original rest vertices independently of the generated manifest. The
// draw boundary receives original coordinates and the public native display
// list builder's actual reordered topology and UVs.
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

// The new FBX control points/UVs match this earlier source point cloud (proved
// by supernailgun_profile_test). Use it as an independent bounds oracle for the
// owner-required uniform fit, rather than trusting generated geometry/bounds.
let nailgunSource = null;
function uniformNailgunBounds( header, key ) {

	if ( ! nailgunSource ) {

		const zip = bytes( 'supernailgun.zip' ), entries = new Map(); let end = zip.length - 22;
		while ( zip.readUInt32LE( end ) !== 0x06054b50 ) end --;
		let offset = zip.readUInt32LE( end + 16 );
		for ( let i = 0; i < zip.readUInt16LE( end + 10 ); i ++ ) {

			const size = zip.readUInt32LE( offset + 20 ), nameSize = zip.readUInt16LE( offset + 28 ), extra = zip.readUInt16LE( offset + 30 ), comment = zip.readUInt16LE( offset + 32 );
			const name = zip.subarray( offset + 46, offset + 46 + nameSize ).toString(), local = zip.readUInt32LE( offset + 42 );
			const start = local + 30 + zip.readUInt16LE( local + 26 ) + zip.readUInt16LE( local + 28 ), method = zip.readUInt16LE( offset + 10 );
			if ( name.endsWith( '.gltf' ) || name.endsWith( '.bin' ) ) {

				check( method === 0 || method === 8, 'source ZIP compression' );
				const raw = zip.subarray( start, start + size ); entries.set( name, method === 8 ? inflateRawSync( raw ) : raw );

			}
			offset += 46 + nameSize + extra + comment;

		}
		const doc = JSON.parse( entries.get( 'scene.gltf' ) ); nailgunSource = [];
		function visit( id, parent ) {

			const node = doc.nodes[ id ], matrix = parent.clone().multiply( node.matrix ? new THREE.Matrix4().fromArray( node.matrix ) : new THREE.Matrix4() );
			if ( node.mesh !== undefined ) {

				const primitive = doc.meshes[ node.mesh ].primitives[ 0 ], accessor = doc.accessors[ primitive.attributes.POSITION ], view = doc.bufferViews[ accessor.bufferView ];
				const data = entries.get( doc.buffers[ view.buffer ].uri );
				for ( let i = 0; i < accessor.count; i ++ ) {

					const position = ( view.byteOffset || 0 ) + ( accessor.byteOffset || 0 ) + i * ( view.byteStride || 12 );
					const p = new THREE.Vector3( ...[ 0, 4, 8 ].map( n => data.readFloatLE( position + n ) ) ).applyMatrix4( matrix );
					nailgunSource.push( new THREE.Vector3( p.x, - p.z, p.y ) );

				}

			}
			for ( const child of node.children || [] ) visit( child, matrix );

		}
		for ( const id of doc.scenes[ doc.scene || 0 ].nodes ) visit( id, new THREE.Matrix4() );

	}
	const native = nativeBounds( header ), source = new THREE.Box3().setFromPoints( nailgunSource );
	const scale = ( native.max[ 0 ] - native.min[ 0 ] ) / ( source.max.x - source.min.x ), sourceCenter = source.getCenter( new THREE.Vector3() );
	const targetCenter = new THREE.Vector3( ...native.min.map( ( value, axis ) => ( value + native.max[ axis ] ) / 2 ) );
	const held = key === 'v_nail2', tilt = new THREE.Matrix4().makeRotationY( held ? - 8 * Math.PI / 180 : 0 );
	const fitted = new THREE.Box3().setFromPoints( nailgunSource.map( p => {

		const q = p.clone().sub( sourceCenter ).multiplyScalar( scale ).add( targetCenter ).applyMatrix4( tilt ); if ( held ) q.x -= 7; return q;

	} ) );
	return { min: fitted.min.toArray(), max: fitted.max.toArray() };

}

let shotgunSource = null;
function shotgunBarrelBounds( header ) {

	if ( ! shotgunSource ) {

		const zip = bytes( 'shotgun.zip' ), entries = new Map(); let end = zip.length - 22;
		while ( zip.readUInt32LE( end ) !== 0x06054b50 ) end --;
		let offset = zip.readUInt32LE( end + 16 );
		for ( let i = 0; i < zip.readUInt16LE( end + 10 ); i ++ ) {

			const size = zip.readUInt32LE( offset + 20 ), nameSize = zip.readUInt16LE( offset + 28 ), extra = zip.readUInt16LE( offset + 30 ), comment = zip.readUInt16LE( offset + 32 );
			const name = zip.subarray( offset + 46, offset + 46 + nameSize ).toString(), local = zip.readUInt32LE( offset + 42 ), start = local + 30 + zip.readUInt16LE( local + 26 ) + zip.readUInt16LE( local + 28 );
			if ( name.endsWith( '.gltf' ) || name.endsWith( '.bin' ) ) { const raw = zip.subarray( start, start + size ), method = zip.readUInt16LE( offset + 10 ); check( method === 0 || method === 8, 'shotgun source compression' ); entries.set( name, method === 8 ? inflateRawSync( raw ) : raw ); }
			offset += 46 + nameSize + extra + comment;

		}
		const doc = JSON.parse( entries.get( 'scene.gltf' ) ); shotgunSource = [];
		function visit( id, parent ) {

			const node = doc.nodes[ id ], matrix = parent.clone().multiply( node.matrix ? new THREE.Matrix4().fromArray( node.matrix ) : new THREE.Matrix4() );
			if ( node.mesh !== undefined ) {

				const a = doc.accessors[ doc.meshes[ node.mesh ].primitives[ 0 ].attributes.POSITION ], v = doc.bufferViews[ a.bufferView ], buffer = entries.get( doc.buffers[ v.buffer ].uri );
				for ( let i = 0; i < a.count; i ++ ) { const o = ( v.byteOffset || 0 ) + ( a.byteOffset || 0 ) + i * ( v.byteStride || 12 ), p = new THREE.Vector3( ...[ 0, 4, 8 ].map( j => buffer.readFloatLE( o + j ) ) ).applyMatrix4( matrix ); shotgunSource.push( new THREE.Vector3( - p.x, p.z, p.y ) ); }

			}
			for ( const child of node.children || [] ) visit( child, matrix );

		}
		for ( const id of doc.scenes[ doc.scene || 0 ].nodes ) visit( id, new THREE.Matrix4() );

	}
	const body = nativeBounds( header ), source = new THREE.Box3().setFromPoints( shotgunSource );
	const scale = new THREE.Vector3( ...body.max.map( ( value, i ) => ( value - body.min[ i ] ) / ( source.max.getComponent( i ) - source.min.getComponent( i ) ) ) );
	const fitted = shotgunSource.map( p => p.clone().sub( source.min ).multiply( scale ).add( new THREE.Vector3( ...body.min ) ) );
	const average = values => values.reduce( ( sum, p ) => sum.add( p ), new THREE.Vector3() ).divideScalar( values.length );
	const native = id => new THREE.Vector3( ...header.poseverts[ 0 ][ id ].v.map( ( x, i ) => x * header.scale[ i ] + header.scale_origin[ i ] ) );
	const front = average( [ 20, 34, 46, 47, 53, 64 ].map( native ) ), rear = average( [ 51, 61, 52, 62, 27, 40 ].map( native ) );
	const axis = front.clone().sub( rear ).normalize(), side = new THREE.Vector3( 0, 0, 1 ).cross( axis ).normalize(), up = axis.clone().cross( side ).normalize();
	const frame = new THREE.Matrix4().makeBasis( axis, side, up ), cap = average( fitted.slice( 136, 172 ).map( p => p.clone() ) );
	const box = new THREE.Box3().setFromPoints( fitted.map( p => p.sub( cap ).applyMatrix4( frame ).add( front ) ) );
	return { min: box.min.toArray(), max: box.max.toArray() };

}
const pendingHeader = nativeHeader( 'v_axe' );
const pendingEntity = { frame: 0, model: { name: 'progs/v_axe.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
const pendingDrawCount = R_DrawAliasModel( pendingEntity, pendingHeader, null ).geometry.getAttribute( 'position' ).count;
const manifest = await weapons.R_WeaponsLoad();
await Promise.all( Object.keys( manifest.models ).concat( 'shell' ).map( key => weapons.R_WeaponLoad( key ) ) );

function checkGrenadeBarrel( positions, header ) {

	// Source vertex identities independently inspected in grenadelauncher.zip.
	// These are complete calibration rings, with duplicate UV seam vertices.
	const rearIds = [ 123, 124, 127, 128, 131, 132, 135, 137, 139, 140, 143, 145, 147, 148, 151, 152, 155, 156, 159, 160, 163, 164, 166, 168, 170, 173 ];
	const middleIds = [ 1129, 1130, 1133, 1134, 1137, 1138, 1141, 1142, 1144, 1189, 1190, 1191, 1192, 1193, 1194, 1195, 1196 ];
	const frontIds = [ 45, 46, 49, 50, 53, 54, 56, 59, 61, 63, 65, 67, 68, 70, 73, 74, 77, 78, 81, 82, 84, 86, 88, 91, 92 ];
	const native = header.poseverts[ 0 ].map( v => new THREE.Vector3( ...v.v.map( ( x, i ) => x * header.scale[ i ] + header.scale_origin[ i ] ) ) );
	const mean = ids => ids.reduce( ( sum, id ) => sum.add( native[ id ] ), new THREE.Vector3() ).divideScalar( ids.length );
	const rear = mean( [ 0, 1, 2, 14, 15, 17 ] ), front = mean( [ 3, 6, 7, 10, 12, 18 ] );
	const forward = front.clone().sub( rear ).normalize();
	const side = new THREE.Vector3( 0, 0, 1 ).cross( forward ).normalize(), up = forward.clone().cross( side );
	const imported = id => new THREE.Vector3().fromArray( positions, id * 3 );
	const projected = ( points, axis ) => points.map( p => p.dot( axis ) );
	const span = values => Math.max( ...values ) - Math.min( ...values );
	const midpoint = ( ids, axis ) => {

		const values = projected( ids.map( imported ), axis ); return ( Math.min( ...values ) + Math.max( ...values ) ) / 2;

	};
	for ( const axis of [ forward, side, up ] ) near( midpoint( rearIds, axis ), rear.dot( axis ), 'held grenade rear tube anchor', 0.00001 );
	near( midpoint( frontIds, forward ), front.dot( forward ), 'held grenade front tube anchor', 0.00001 );
	const nativeMiddle = [ 4, 5, 8, 9, 11, 16 ].map( id => native[ id ] );
	for ( const [ axis, label ] of [ [ side, 'width' ], [ up, 'height' ] ] ) {

		near( span( projected( middleIds.map( imported ), axis ) ), span( projected( nativeMiddle, axis ) ), 'held grenade tube ' + label, 0.00001 );
		// Donor seam asymmetry may shift its ring centre by less than 0.02 units.
		near( midpoint( frontIds, axis ), front.dot( axis ), 'held grenade tube axis ' + label, 0.02 );

	}

}

Deno.test( 'supplied weapons match native fits, authorized held rocket offset and held grenade barrel anchors', () => {

	// (thirteen fitted to their own MDLs, and the basic shotgun's drop, g_shot1, fitted to the super shotgun pickup's MDL: card [12])
	equal( Object.keys( manifest.models ).length, 14, 'fourteen replacement firearm roles' );
	check( ! manifest.models.v_axe && weapons.R_WeaponAsset( 'progs/v_axe.mdl' ) === null, 'owner-restored axe always uses original art' );
	equal( pendingDrawCount, pendingHeader.posedata[ 0 ].length, 'pending art draws original geometry' );
	for ( const key of Object.keys( manifest.models ) ) {

		const h = nativeHeader( manifest.models[ key ].nativeModel ?? key ), fitted = manifest.models[key].fitKind === 'source-quake-coordinates' ? { min: manifest.models[key].sourceMin, max: manifest.models[key].sourceMax } : key === 'v_shot' ? shotgunBarrelBounds( h ) : key === 'v_nail2' || key === 'g_nail2' ? uniformNailgunBounds( h, key ) : nativeBounds( h );
		// the super shotgun pickup is twice as wide across as its native box (owner request, card [12]): the box widened about its middle
		const across = manifest.models[ key ].transverseScale ?? 1, bounds = across === 1 ? fitted : { min: fitted.min.slice(), max: fitted.max.slice() };
		if ( across !== 1 ) { const c = ( fitted.min[ 1 ] + fitted.max[ 1 ] ) / 2, half = ( fitted.max[ 1 ] - fitted.min[ 1 ] ) / 2 * across; bounds.min[ 1 ] = c - half; bounds.max[ 1 ] = c + half; }
		const e = { frame: 0, model: { name: 'progs/' + key + '.mdl' }, origin: [ 31, - 9, 40 ], angles: [ 17, 73, 11 ] };
		const mesh = R_DrawAliasModel( e, h, new Float32Array( 162 ).fill( 1 ), 0.7 );
		check( mesh.isMesh, key + ' renders an actual mesh' );
		equal( mesh.geometry.getAttribute( 'position' ).count, manifest.sources[ manifest.models[ key ].source ].vertices, key + ' uses supplied detailed geometry' );
		mesh.geometry.computeBoundingBox();
		const fittedBox = mesh.geometry.boundingBox;
		for ( let axis = 0; axis < 3; axis ++ ) {

			if ( key !== 'v_rock' ) {

				// New nailgun bounds retain authored source coordinates (independently
				// decoded in nailgun_source_test); previous native fitting contracts remain.
				// Rocket shifts intact; SNG's entire source shape uses the exact
				// uniform scale/rigid pose computed above, with no sectional edits.
				const offset = key === 'v_rock2' && axis === 0 ? - 3 : 0;
				near( fittedBox.min.getComponent( axis ), bounds.min[ axis ] + offset, key + ' fitted minimum ' + axis );
				near( fittedBox.max.getComponent( axis ), bounds.max[ axis ] + offset, key + ' fitted maximum ' + axis );
				near( fittedBox.max.getComponent( axis ) - fittedBox.min.getComponent( axis ), bounds.max[ axis ] - bounds.min[ axis ], key + ' exact fitted size ' + axis );

			}
			near( mesh.position.getComponent( axis ), e.origin[ axis ], key + ' entity position ' + axis );

		}
		if ( key === 'v_rock' ) checkGrenadeBarrel( mesh.geometry.getAttribute( 'position' ).array, h );
		const expected = new THREE.Matrix4().makeRotationZ( 73 * Math.PI / 180 ).multiply( new THREE.Matrix4().makeRotationY( - 17 * Math.PI / 180 ) ).multiply( new THREE.Matrix4().makeRotationX( 11 * Math.PI / 180 ) );
		near( Math.abs( mesh.quaternion.dot( new THREE.Quaternion().setFromRotationMatrix( expected ) ) ), 1, key + ' native orientation' );
		const restPositions = Array.from( mesh.geometry.getAttribute( 'position' ).array );
		// The independent source profile suite verifies this exact rotor/body
		// membership. Each part remains rigid; their relative angle now changes.
		const rotor = key === 'v_nail2' ? JSON.parse( bytes( 'newer/weapons/v_nail2.json' ).toString() ).rotor : null;
		const rotorIds = rotor && new Set( rotor.vertices );
		for ( let frame = 1; frame < h.numframes; frame ++ ) {

			e.frame = frame; const posed = R_DrawAliasModel( e, h, null );
			check( posed.geometry.getAttribute( 'position' ).array.every( Number.isFinite ), key + ' finite native pose ' + frame );
			const positions = posed.geometry.getAttribute( 'position' ).array;
			if ( manifest.models[key].fitKind === 'source-quake-coordinates' ) continue; // Authored deformation is checked byte-for-byte by the independent donor decoder.
			// Rigid native pose retargeting must preserve the imported model's
			// proportions throughout firing and swing animation.
			for ( let i = 0; i < positions.length - 3; i += Math.max( 3, Math.floor( positions.length / 21 ) * 3 ) ) {

				const j = rotorIds ? ( rotorIds.has( i / 3 ) ? rotor.vertices[ 0 ] * 3 : 0 ) : positions.length - 3;
				near( Math.hypot( positions[ i ] - positions[ j ], positions[ i + 1 ] - positions[ j + 1 ], positions[ i + 2 ] - positions[ j + 2 ] ),
					Math.hypot( restPositions[ i ] - restPositions[ j ], restPositions[ i + 1 ] - restPositions[ j + 1 ], restPositions[ i + 2 ] - restPositions[ j + 2 ] ), key + ' rigid pose ' + frame, 0.0001 );

			}

		}

	}
	equal( manifest.sources.shell.selectedMesh, 'shotgun_shell_bullets_0', 'only requested pack mesh' );
	check( requestedTextures.every( p => ! /weapon_pack|pistol|knife|ammo_box|uzi/.test( p ) ), 'unrequested pack art excluded' );
	equal( weapons.R_WeaponAsset( 'progs/v_shot.mdl' )?.source, 'shotgun', 'supplied standard shotgun now active' );
	equal( manifest.models.g_shot.source, 'supershotgun', 'existing pickup stays super shotgun' );
	equal( weapons.R_WeaponAsset( 'progs/v_nail.mdl' )?.source, 'nailgun', 'supplied regular nailgun active' );

} );

Deno.test( 'classic draw and feature toggle restore native geometry and subsequent enhanced draws', () => {

	const key = 'v_shot2', h = nativeHeader( key ), e = { frame: 0, model: { name: 'progs/' + key + '.mdl' }, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] };
	const scene = new THREE.Scene(), mesh = R_DrawAliasModel( e, h, null ); mesh._quakeOwner = e; scene.add( mesh );
	const enhanced = mesh.geometry.getAttribute( 'position' ), restore = R_SaveClassicScene( scene, 0 );
	try {

		mode.R_AnimSetClassicPass( true ); R_DrawAliasModel( e, h, null );
		equal( mesh.geometry.getAttribute( 'position' ).count, h.posedata[ 0 ].length, 'classic native vertices' );
		equal( mesh.geometry.getAttribute( 'uv' ), GL_DrawAliasFrame( h, 0 ).uvAttr, 'classic original UVs' );

	} finally { mode.R_AnimSetClassicPass( false ); restore(); }
	equal( mesh.geometry.getAttribute( 'position' ), enhanced, 'classic scene restore keeps enhanced geometry' );
	equal( R_DrawAliasModel( e, h, null ).geometry.getAttribute( 'position' ), enhanced, 'next enhanced draw remains imported' );
	weapons.r_newer_weapons.value = 0;
	try { equal( R_DrawAliasModel( e, h, null ).geometry.getAttribute( 'position' ).count, h.posedata[ 0 ].length, 'feature toggle native fallback' ); }
	finally { weapons.r_newer_weapons.value = 1; }
	equal( R_DrawAliasModel( e, h, null ).geometry.getAttribute( 'position' ), enhanced, 'toggle restores imported geometry' );

} );

function room() {

	// Actual BSP hull: floor z=0 and back wall y=-20, both solid outside.
	return { hulls: [ { firstclipnode: 0, lastclipnode: 1,
		planes: [ { normal: new Float32Array( [ 0, 0, 1 ] ), dist: 0, type: 2 }, { normal: new Float32Array( [ 0, 1, 0 ] ), dist: - 20, type: 1 } ],
		clipnodes: [ { planenum: 0, children: new Int16Array( [ 1, - 2 ] ) }, { planenum: 1, children: new Int16Array( [ - 1, - 2 ] ) } ] } ] };

}
function setupShells() {

	shells.R_ShellsReset();
	const model = room(), scene = new THREE.Scene();
	shells.R_ShellsSetup( { scene, client: () => cl, trace: ( a, b, r ) => R_ShellTrace( model, a, b, r ), light: () => 128 } );
	cl.viewentity = 1; cl.viewangles = [ 0, 0, 0 ]; cl.velocity = [ 0, 0, 0 ]; cl.viewent._aliasMesh = null;
	shells.R_ShellsNewMap( 'shell-test' ); return scene;

}
function soundPacket( name, entity = 1, channel = 1 ) {

	const oldMessage = common.net_message, oldSound = cl.sound_precache[ 1 ];
	const message = { data: new Uint8Array( 32 ), maxsize: 32, cursize: 0 };
	common.MSG_WriteByte( message, 0 ); common.MSG_WriteShort( message, entity * 8 + channel ); common.MSG_WriteByte( message, 1 );
	for ( const v of [ 0, 0, 10 ] ) common.MSG_WriteCoord( message, v );
	try { common.COM_SetNetMessage( message ); common.MSG_BeginReading(); cl.sound_precache[ 1 ] = { name }; CL_ParseStartSoundPacket(); check( ! common.msg_badread, 'valid sound packet consumed' ); }
	finally { common.COM_SetNetMessage( oldMessage ); cl.sound_precache[ 1 ] = oldSound; }

}

Deno.test( 'parsed confirmed shotgun sounds emit one or two casings independently of audio and stale weapon stats', () => {

	setupShells(); const oldDemo = cls.demoplayback; cls.demoplayback = false;
	try {

		soundPacket( 'weapons/guncock.wav' ); equal( shells.R_ShellsStatus().count, 1, 'one shotgun shell' );
		soundPacket( 'weapons/shotgn2.wav' ); equal( shells.R_ShellsStatus().count, 3, 'two double barrel shells' );
		soundPacket( 'weapons/guncock.wav', 2 ); soundPacket( 'weapons/guncock.wav', 1, 2 ); soundPacket( 'weapons/rocket1i.wav' );
		equal( shells.R_ShellsStatus().count, 3, 'wrong entity channel and sound rejected' );
		cls.demoplayback = true; soundPacket( 'weapons/guncock.wav' ); equal( shells.R_ShellsStatus().count, 3, 'demo does not accumulate casings' );
		cls.demoplayback = false; weapons.r_newer_weapons.value = 0; soundPacket( 'weapons/guncock.wav' ); equal( shells.R_ShellsStatus().count, 3, 'disabled feature does not emit' );

	} finally { cls.demoplayback = oldDemo; weapons.r_newer_weapons.value = 1; shells.R_ShellsReset(); }

} );

Deno.test( 'shell BSP sweeps hit the floor and wall with radius clearance', () => {

	const model = room(), floor = R_ShellTrace( model, [ 0, 0, 10 ], [ 0, 0, - 10 ] );
	check( floor.fraction < 1 && ! floor.startsolid, 'floor collision' ); near( floor.endpos[ 2 ], 0.58125, 'floor radius clearance' ); near( floor.plane.normal[ 2 ], 1, 'floor normal' );
	const wall = R_ShellTrace( model, [ 0, 0, 10 ], [ 0, - 30, 10 ] );
	check( wall.fraction < 1 && ! wall.startsolid, 'wall collision' ); near( wall.endpos[ 1 ], - 19.41875, 'wall radius clearance' ); near( wall.plane.normal[ 1 ], 1, 'wall normal' );
	const trapped = R_ShellTrace( model, [ 0, 0, - 10 ], [ 0, 0, - 20 ] );
	check( trapped.startsolid, 'solid start identified' ); check( trapped.allsolid, 'fully solid sweep identified' );

} );

Deno.test( 'a casing fired at the original E1M1 spawn settles on the actual map collision hull', async () => {

	const bsp = nativeFiles.get( 'maps/e1m1.bsp' );
	const lump = i => { const offset = bsp.readInt32LE( 4 + i * 8 ); return bsp.subarray( offset, offset + bsp.readInt32LE( 8 + i * 8 ) ); };
	const planeBytes = lump( 1 ), nodeBytes = lump( 5 ), leafBytes = lump( 10 );
	const planes = Array.from( { length: planeBytes.length / 20 }, ( _, i ) => ( {
		normal: new Float32Array( [ 0, 4, 8 ].map( o => planeBytes.readFloatLE( i * 20 + o ) ) ),
		dist: planeBytes.readFloatLE( i * 20 + 12 ), type: planeBytes.readInt32LE( i * 20 + 16 ) } ) );
	const clipnodes = Array.from( { length: nodeBytes.length / 24 }, ( _, i ) => ( {
		planenum: nodeBytes.readInt32LE( i * 24 ), children: [ 4, 6 ].map( o => {

			const child = nodeBytes.readInt16LE( i * 24 + o ); return child < 0 ? leafBytes.readInt32LE( ( - child - 1 ) * 28 ) : child;

		} ) } ) );
	const model = { hulls: [ { planes, clipnodes, firstclipnode: 0, lastclipnode: clipnodes.length - 1 } ] };
	const spawn = [ 480, - 352, 88 ];
	const floor = R_ShellTrace( model, spawn, [ 480, - 352, - 128 ] );
	check( floor.fraction < 1 && floor.plane.normal[ 2 ] > 0.9, 'actual spawn floor hit' );
	const wall = R_ShellTrace( model, spawn, [ 480 + 2048, - 352, 88 ] );
	check( wall.fraction < 1 && Math.abs( wall.plane.normal[ 0 ] ) > 0.9, 'actual spawn side wall hit' );
	shells.R_ShellsReset();
	const scene = new THREE.Scene(); cl.viewentity = 1; cl.viewangles = [ 0, 90, 0 ]; cl.velocity = [ 0, 0, 0 ]; cl.viewent._aliasMesh = null;
	shells.R_ShellsSetup( { scene, client: () => cl, trace: ( a, b, r ) => R_ShellTrace( model, a, b, r ), light: () => 128 } );
	shells.R_ShellsNewMap( 'e1m1' ); shells.R_ShellShot( 1, 1, 'weapons/guncock.wav', spawn );
	await weapons.R_WeaponLoad( 'shell' ); await new Promise( resolve => queueMicrotask( resolve ) );
	for ( let i = 0; i < 2400; i ++ ) shells.R_ShellsFrame( i / 120 );
	equal( shells.R_ShellsStatus().moving, 0, 'actual level casing settles' ); equal( shells.R_ShellsStatus().count, 1, 'actual level casing retained' );
	const s = shells.R_ShellsSnapshot().levels[ 0 ].shells[ 0 ];
	const contact = R_ShellTrace( model, s.p, [ s.p[ 0 ], s.p[ 1 ], s.p[ 2 ] - 2 ] );
	check( ! contact.startsolid && contact.fraction < 0.03 && contact.plane.normal[ 2 ] > 0.5, 'settled casing touches actual floor without penetration' );
	shells.R_ShellsReset();

} );

Deno.test( 'casings settle on BSP floors, exceed instance capacity, never expire, and survive map return and save restoration', async () => {

	const scene = setupShells();
	for ( let i = 0; i < 300; i ++ ) shells.R_ShellShot( 1, 1, 'weapons/guncock.wav', [ 0, 0, 10 ] );
	// Downloads are asynchronous even when their public asset request is cached.
	await weapons.R_WeaponLoad( 'shell' ); await new Promise( resolve => queueMicrotask( resolve ) );
	for ( let i = 0; i < 2400; i ++ ) shells.R_ShellsFrame( i / 120 );
	equal( shells.R_ShellsStatus().count, 300, 'no cap eviction' ); equal( shells.R_ShellsStatus().moving, 0, 'all casings settled' );
	equal( scene.children.reduce( ( sum, mesh ) => sum + mesh.count, 0 ), 300, 'all records drawn across chunks' );
	const settled = JSON.parse( JSON.stringify( shells.R_ShellsSnapshot() ) );
	check( settled.levels[ 0 ].shells.every( s => s.rest && s.p[ 2 ] > 0.5 && s.p[ 2 ] < 0.7 && s.p[ 1 ] > - 19.5 ), 'floor landing and wall containment' );
	const stable = JSON.stringify( settled );
	shells.R_ShellsFrame( 1e12 ); equal( shells.R_ShellsStatus().count, 300, 'no time expiry' ); equal( JSON.stringify( shells.R_ShellsSnapshot() ), stable, 'settled locations permanent' );
	shells.R_ShellsNewMap( 'other-map' ); equal( scene.children.length, 0, 'departed level instances detached' );
	shells.R_ShellShot( 1, 1, 'weapons/shotgn2.wav', [ 0, 0, 10 ] ); equal( shells.R_ShellsStatus().count, 2, 'independent destination casings' );
	shells.R_ShellsNewMap( 'shell-test' ); shells.R_ShellsFrame( 0 ); equal( shells.R_ShellsStatus().count, 300, 'return retains original records' );
	equal( scene.children.reduce( ( sum, mesh ) => sum + mesh.count, 0 ), 300, 'return restores drawn instances' );
	const saved = JSON.parse( JSON.stringify( shells.R_ShellsSnapshot() ) );
	shells.R_ShellsRestore( saved ); shells.R_ShellsNewMap( 'shell-test' ); shells.R_ShellsFrame( 0 );
	equal( JSON.stringify( shells.R_ShellsSnapshot() ), JSON.stringify( saved ), 'save roundtrip retains both levels and all physical records' );
	equal( scene.children.reduce( ( sum, mesh ) => sum + mesh.count, 0 ), 300, 'save restoration reattaches all settled instances' );
	shells.R_ShellsReset(); equal( shells.R_ShellsStatus().maps.length, 0, 'new game reset removes old maps' ); equal( scene.children.length, 0, 'new game reset detaches all instances' );

} );

Deno.test( 'weapon test texture and fetch stubs are restored', () => {

	globalThis.fetch = originalFetch; THREE.TextureLoader.prototype.load = originalLoad;
	vars.Cvar_SetValue( 'r_hdr', previousState.hdr ); weapons.r_newer_weapons.value = previousState.weapons;
	anim.r_lerpmodels.value = previousState.lerp; cl.viewentity = previousState.viewentity;
	cl.viewangles = previousState.viewangles; cl.velocity = previousState.velocity; cl.viewent._aliasMesh = previousState.mesh;

} );
