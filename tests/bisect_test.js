// Independent geometric closure and native pose/save/resource contracts.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as pak from '../src/pak.js';
import { VID_SetPalette } from '../src/vid.js';
import { Mod_Init, Mod_ForName, Mod_LoadForPreview } from '../src/gl_model.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
import { R_BisectGeometry } from '../src/r_bisect.js';
import { R_AxeSwingNormal } from '../src/r_axepose.js';
import * as corpses from '../src/r_axecorpses.js';
import { SV_AxeEntitySuppressed } from '../src/sv_axecut.js';
import { Axe_ParseRecord } from '../src/axe_record.js';
import { entity_t } from '../src/render.js';
import { ED_Alloc, ED_Free, ED_Write, ED_ParseEdict, ED_NewString, ED_ClearEdict, ED_FindFunction } from '../src/pr_edict.js';
import * as progs from '../src/progs.js';
import { PR_InitBuiltins } from '../src/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/pr_exec.js';
import { OFS_PARM0, OFS_PARM1 } from '../src/pr_comp.js';
import { sv, svs, client_t } from '../src/server.js';
import { SV_SpawnServer } from '../src/sv_main.js';
import { sv_gravity } from '../src/sv_phys.js';
import { cl } from '../src/client.js';
import * as vars from '../src/cvar.js';
import { r_hdr } from '../src/gl_post.js';
import { skill } from '../src/host.js';
import { R_AnimSetClassicPass, r_lerpmodels } from '../src/r_anim.js';
import { Cbuf_Init } from '../src/cmd.js';
import { COM_Parse, SZ_Alloc } from '../src/common.js';
import { R_LevelEntities } from '../src/r_levelents.js';
import { R_ParseEntityLump } from '../src/r_levelgraph.js';
import { R_BuildLevelView } from '../src/r_levelview.js';
import * as skins from '../src/r_newerskins.js';
import * as anim from '../src/r_anim.js';
import { SV_LinkEdict } from '../src/world.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const data = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); pak.COM_AddPack( pak.COM_LoadPackFile( 'pak0.pak', data.buffer.slice( data.byteOffset, data.byteOffset + data.length ) ) ); VID_SetPalette( pak.COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const key = p => p.map( value => Math.round( value * 10000 ) ).join( ',' );
function triangles( geometry ) {

	const positions = geometry.attributes.position, index = geometry.index, count = index ? index.count : positions.count, result = [];
	for ( let i = 0; i < count; i += 3 ) { const tri = [ 0, 1, 2 ].map( j => new THREE.Vector3().fromBufferAttribute( positions, index ? index.getX( i + j ) : i + j ) ); if ( tri[ 1 ].clone().sub( tri[ 0 ] ).cross( tri[ 2 ].clone().sub( tri[ 0 ] ) ).lengthSq() > 1e-12 ) result.push( tri ); }
	return result;

}
function closed( geometries, label, cutPlane = null, observeOnly = false, inheritedOppositeFaces = [] ) {

	const tris = [], bodySeen = new Set(), points = new Map(), edges = [];
	geometries.forEach( ( geometry, component ) => {

		for ( const tri of triangles( geometry ) ) {

			const identity = tri.map( point => key( point.toArray() ) ).sort().join( '|' );
			// Count original-proven coincident opposite-facing BODY coverage once
			// for a geometric closure check. Never alter production arrays, and
			// never deduplicate newly generated cap triangles or unrelated faces.
			if ( component === 0 && bodySeen.has( identity ) && inheritedOppositeFaces.some( face => tri.every( point => face.closestPointToPoint( point, new THREE.Vector3() ).distanceTo( point ) < .0001 ) ) ) continue;
			if ( component === 0 ) bodySeen.add( identity ); tris.push( tri );

		}

	} );
	for ( const tri of tris ) for ( let i = 0; i < 3; i ++ ) { const a = tri[ i ], b = tri[ ( i + 1 ) % 3 ]; points.set( key( a.toArray() ), a ); points.set( key( b.toArray() ), b ); edges.push( [ a, b ] ); }
	// Triangulation may omit collinear contour vertices. Split each geometric
	// edge at every real mesh vertex before counting paired incidences, so this
	// oracle detects holes without mistaking harmless cap T junctions for gaps.
	const incidence = new Map();
	for ( const [ a, b ] of edges ) {

		const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, length = dx * dx + dy * dy + dz * dz, list = [ [ 0, a ], [ 1, b ] ];
		for ( const p of points.values() ) { const x = p.x - a.x, y = p.y - a.y, z = p.z - a.z, t = ( x * dx + y * dy + z * dz ) / length; if ( t > 1e-6 && t < 1 - 1e-6 && ( x - t * dx ) ** 2 + ( y - t * dy ) ** 2 + ( z - t * dz ) ** 2 < 1e-7 ) list.push( [ t, p ] ); }
		list.sort( ( x, y ) => x[ 0 ] - y[ 0 ] );
		for ( let i = 1; i < list.length; i ++ ) { const x = key( list[ i - 1 ][ 1 ].toArray() ), y = key( list[ i ][ 1 ].toArray() ); if ( x === y ) continue; const edge = [ x, y ].sort().join( '|' ); incidence.set( edge, ( incidence.get( edge ) || 0 ) + 1 ); }

	}
	let bad = [ ...incidence ].filter( ( [ , count ] ) => count !== 2 );
	if ( cutPlane ) bad = bad.filter( ( [ edge ] ) => edge.split( '|' ).every( key => { const p = key.split( ',' ).map( value => Number( value ) / 10000 ); return Math.abs( p.reduce( ( sum, value, i ) => sum + ( value - cutPlane.point[ i ] ) * cutPlane.normal[ i ], 0 ) ) < .0002; } ) );
	if ( bad.length && /^(soldier|zombie) swing/.test( label ) ) {

		const endpoints = bad[ 0 ][ 0 ].split( '|' ).map( key => new THREE.Vector3( ...key.split( ',' ).map( value => Number( value ) / 10000 ) ) ), witnesses = [];
		geometries.forEach( ( geometry, component ) => { for ( const tri of triangles( geometry ) ) for ( let i = 0; i < 3; i ++ ) { const edge = new THREE.Line3( tri[ i ], tri[ ( i + 1 ) % 3 ] ); if ( endpoints.every( point => edge.closestPointToPoint( point, true, new THREE.Vector3() ).distanceTo( point ) < .0003 ) ) witnesses.push( { component: component === 0 ? 'body' : 'cap', area: new THREE.Triangle( ...tri ).getArea(), vertices: tri.map( point => point.toArray() ) } ); } } );
		console.log( 'CUT_EDGE_WITNESS ' + JSON.stringify( { label, edge: bad[ 0 ], witnesses } ) );

	}
	if ( ! observeOnly ) check( bad.length === 0, label + ' unmatched/nonmanifold atomic edges: ' + JSON.stringify( bad.slice( 0, 5 ) ) );
	return bad;

}
function volume( geometry ) { return triangles( geometry ).reduce( ( sum, [ a, b, c ] ) => sum + a.dot( b.clone().cross( c ) ) / 6, 0 ); }
function capNormals( part, normal, side, point ) {

	const expected = new THREE.Vector3( ...normal ).normalize().multiplyScalar( side === 0 ? -1 : 1 ), n = new THREE.Vector3( ...normal ).normalize();
	for ( const [ a, b, c ] of triangles( part.cap ) ) { check( b.clone().sub( a ).cross( c.clone().sub( a ) ).normalize().dot( expected ) > .9999, 'cap triangle faces outward from retained half' ); for ( const p of [ a, b, c ] ) check( Math.abs( n.dot( p.clone().sub( new THREE.Vector3( ...point ) ) ) ) < .0001, 'cap remains on exact cut plane' ); }

}

for ( const name of [ 'soldier', 'dog', 'knight', 'ogre', 'demon', 'shambler', 'zombie', 'wizard' ] ) Deno.test( 'native ' + name + ' posed bisections retain skin attributes and close both blade-oriented cut caps', () => {

	const entity = new entity_t(); entity.model = Mod_ForName( 'progs/' + name + '.mdl', true ); entity.frame = 0; const mesh = R_DrawAliasModel( entity, entity.model.cache.data ), geometry = mesh.geometry;
	const original = Object.entries( geometry.attributes ).map( ( [ name, a ] ) => [ name, a, a.array.slice() ] ), index = geometry.index.array.slice(); geometry.computeBoundingBox();
	const inheritedEdges = closed( [ geometry ], 'original native ' + name, null, true );
	const originalTriangles = new Map(), inheritedOppositeFaces = [];
	for ( const tri of triangles( geometry ) ) {

		const identity = tri.map( point => key( point.toArray() ) ).sort().join( '|' ), face = new THREE.Triangle( ...tri ), prior = originalTriangles.get( identity );
		if ( prior && prior.getNormal( new THREE.Vector3() ).dot( face.getNormal( new THREE.Vector3() ) ) < -.9999 ) { inheritedOppositeFaces.push( face ); console.log( 'NATIVE_OPPOSITE_FACE_WITNESS ' + JSON.stringify( { model: name, nativeVertices: tri.map( point => point.toArray() ), oppositeNormalDot: prior.getNormal( new THREE.Vector3() ).dot( face.getNormal( new THREE.Vector3() ) ) } ) ); }
		else originalTriangles.set( identity, face );

	}
	if ( inheritedEdges.length ) console.log( 'NATIVE_INHERITED_TOPOLOGY ' + JSON.stringify( { model: name, nonmanifoldEdges: inheritedEdges.length, scope: 'Original non-cut defects retained; new cut-plane seams and caps must still close' } ) );
	for ( const swing of [ 3, 7 ] ) {

		const normal = R_AxeSwingNormal( pak.COM_FindFile( 'progs/v_axe.mdl' ).data, swing, [ 0, 0, 0 ] ), point = geometry.boundingBox.getCenter( new THREE.Vector3() ).addScaledVector( new THREE.Vector3( ...normal ), .001 ).toArray();
		if ( name === 'soldier' ) console.log( 'SOLDIER_CUT_PLANE ' + JSON.stringify( { swing, normal, point } ) );
		const halves = R_BisectGeometry( geometry, normal, point );
		try {

			for ( let side = 0; side < 2; side ++ ) { const part = halves[ side ]; check( part.body.attributes.position.count > 0 && part.cap.attributes.position.count > 0 && part.contours > 0, 'two nonempty body halves with explicit cap contours' ); same( part.body.attributes.uv.itemSize, geometry.attributes.uv.itemSize, 'native skin coordinates retained' ); closed( [ part.body, part.cap ], name + ' swing' + swing + ' side' + side, inheritedEdges.length ? { normal, point } : null, false, inheritedOppositeFaces ); capNormals( part, normal, side, point ); }
			const expectedVolume = Math.abs( volume( geometry ) ), actualVolume = halves.reduce( ( sum, part ) => sum + Math.abs( volume( part.body ) + volume( part.cap ) ), 0 ); check( Math.abs( actualVolume - expectedVolume ) < Math.max( .02, expectedVolume * .00001 ), 'closed halves conserve original native enclosed volume' );

		} finally { for ( const part of halves ) { part.body.dispose(); part.cap.dispose(); } }

	}
	for ( const [ name, attr, values ] of original ) { same( geometry.attributes[ name ], attr, 'original attribute identity retained' ); check( values.every( ( value, i ) => value === attr.array[ i ] ), 'source attribute bytes unchanged' ); } check( index.every( ( value, i ) => value === geometry.index.array[ i ] ), 'source triangles unchanged' );

} );

Deno.test( 'nested cut loops keep the real central hole open while both torus halves are watertight', () => {

	const geometry = new THREE.TorusGeometry( 10, 3, 12, 32 ), point = [ 0, 0, .13 ], halves = R_BisectGeometry( geometry, [ 0, 0, 1 ], point );
	try { for ( let side = 0; side < 2; side ++ ) { const part = halves[ side ]; same( part.contours, 2, 'outer and inner annular contours retained' ); closed( [ part.body, part.cap ], 'nested torus side' + side ); capNormals( part, [ 0, 0, 1 ], side, point ); check( triangles( part.cap ).every( tri => ! new THREE.Triangle( ...tri ).containsPoint( new THREE.Vector3( ...point ) ) ), 'cap never fills original central hole' ); } }
	finally { geometry.dispose(); for ( const part of halves ) { part.body.dispose(); part.cap.dispose(); } }

} );

function corpseFixture() {

	corpses.R_ClearAxeCorpses(); R_AnimSetClassicPass( false ); PR_InitBuiltins(); Cbuf_Init();
	for ( const value of [ r_hdr, skill, sv_gravity ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
	vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'skill', 1 ); svs.maxclients = 1; svs.clients = [ new client_t() ]; SZ_Alloc( svs.clients[ 0 ].message, 8192 ); sv.active = false; SV_SpawnServer( 'e1m1' ); cl.worldmodel = sv.worldmodel;
	const target = sv.edicts.find( e => e && ! e.free && progs.PR_GetString( e.v.classname ) === 'monster_army' ); target.v.health = 0; target.v.solid = 0;
	const owner = ED_Alloc(); owner.v.classname = ED_NewString( 'info_notnull' ); owner.v.solid = 0;
	owner._axeCorpse = { version: 1, kind: 'slice', entityIndex: target.index, model: 'progs/soldier.mdl', frame: 0, skin: 0, origin: [ 176, 1008, -199.95 ], angles: [ 0, 0, 0 ], normal: R_AxeSwingNormal( pak.COM_FindFile( 'progs/v_axe.mdl' ).data, 3, [ 0, 0, 0 ] ), at: sv.time };
	owner._axeCorpse.key = owner.index + '@' + owner._axeCorpse.at; owner._axeOwnerKey = target._axeOwnerKey = owner._axeCorpse.key;
	owner.v.origin = target.v.origin = owner._axeCorpse.origin.slice(); SV_LinkEdict( owner, false ); SV_LinkEdict( target, false );
	target._axeSuppressed = true; target._axeSuppressedBy = owner.index; return { owner, target, scene: new THREE.Scene() };

}

Deno.test( 'cut metadata saves and validates, real native renderer makes two capped halves, Classic hides effects and expiry disposes owned resources only', () => {

	const f = corpseFixture();
	try {

		same( SV_AxeEntitySuppressed( f.target.index ), false, 'native death remains visible until replacement is actually built' );
		const lines = []; ED_Write( lines, f.owner ); const restored = ED_Alloc(); ED_ParseEdict( COM_Parse( lines.join( '\n' ) ), restored ); same( Object.keys( restored._axeCorpse ).sort().join(), Object.keys( f.owner._axeCorpse ).sort().join(), 'save/parser retain complete metadata field set' ); for ( const key of Object.keys( f.owner._axeCorpse ) ) same( JSON.stringify( restored._axeCorpse[ key ] ), JSON.stringify( f.owner._axeCorpse[ key ] ), 'actual edict save/parser round-trips ' + key ); same( restored._axeReady, false, 'save cannot claim unbuilt GPU replacement is ready' ); ED_Free( restored );
		for ( const patch of [ { normal: [ 0, 0, 0 ] }, { model: '../outside.mdl' }, { frame: -1 }, { skin: 256 }, { entityIndex: 0 }, { at: null } ] ) same( Axe_ParseRecord( encodeURIComponent( JSON.stringify( { ...f.owner._axeCorpse, ...patch } ) ) ), null, 'invalid saved cut record rejected before allocation' );
		corpses.R_AxeCorpsesFrame( f.scene ); const status = corpses.R_AxeCorpseStatus(); check( status.length === 1 && status[ 0 ].ready && ! status[ 0 ].error && status[ 0 ].halves === 2, 'actual native posed-model renderer builds two capped parts' );
		const group = f.scene.getObjectByName( 'quake_axe_bisection' ); same( group.children.length, 2, 'exactly two independent corpse pieces' ); check( group.userData.newerOnly, 'replacement belongs to enhanced presentation' ); same( SV_AxeEntitySuppressed( f.target.index ), true, 'successful renderer handshake retires intact native body' ); same( f.target._axeSuppressedBy, 0, 'success latches suppression independently of expiring owner slot' );
		const geometry = group.children.flatMap( piece => piece.children.map( mesh => mesh.geometry ) ), capMaterial = group.children[ 0 ].children[ 1 ].material, nativeMaterial = group.children[ 0 ].children[ 0 ].material; let geometryDisposals = 0, capDisposals = 0, nativeDisposals = 0;
		for ( const g of geometry ) g.addEventListener( 'dispose', () => geometryDisposals ++ ); capMaterial.addEventListener( 'dispose', () => capDisposals ++ ); nativeMaterial.addEventListener( 'dispose', () => nativeDisposals ++ );
		R_AnimSetClassicPass( true ); corpses.R_AxeCorpsesFrame( f.scene ); same( group.visible, false, 'Classic redraw hides cut presentation' ); same( geometryDisposals, 0, 'Classic does not destroy enhanced resources' ); R_AnimSetClassicPass( false ); corpses.R_AxeCorpsesFrame( f.scene ); same( group.visible, true, 'return to enhanced restores same objects' ); same( f.scene.getObjectByName( group.name ), group, 'Classic does not rebuild geometry' );
		sv.time += 2; corpses.R_AxeCorpsesFrame( f.scene ); group.updateMatrixWorld( true ); check( group.children[ 0 ].position.distanceTo( group.children[ 1 ].position ) > 10, 'pieces visibly separate after impact' );
		ED_Free( f.owner ); corpses.R_AxeCorpsesFrame( f.scene ); same( group.parent, null, 'expired native cosmetic owner detaches the renderer group' ); same( geometryDisposals, 4, 'two bodies and two caps disposed exactly once' ); same( capDisposals, 1, 'owned shared cap material disposed exactly once' ); same( nativeDisposals, 0, 'borrowed native skin material is not disposed' ); same( SV_AxeEntitySuppressed( f.target.index ), true, 'expiry cannot resurrect intact body after successful replacement' ); same( corpses.R_AxeCorpseStatus().length, 0, 'expired record removed from renderer registry' );

	} finally { R_AnimSetClassicPass( false ); corpses.R_ClearAxeCorpses(); }

} );

Deno.test( 'failed replacement keeps native death visible and a recycled same-index ready corpse cannot suppress the old target', () => {

	const f = corpseFixture();
	try {

		const valid = f.owner._axeCorpse; f.owner._axeCorpse = { ...valid, model: 'progs/absent_cut_fixture.mdl' }; corpses.R_AxeCorpsesFrame( f.scene );
		check( corpses.R_AxeCorpseStatus()[ 0 ]?.error && ! corpses.R_AxeCorpseStatus()[ 0 ].ready, 'missing source model records explicit failure without fake ready halves' ); same( SV_AxeEntitySuppressed( f.target.index ), false, 'failed slice retains visible original death' );
		const index = f.owner.index; ED_Free( f.owner ); same( f.target._axeSuppressed, false, 'retiring failed owner clears old target pending suppression' ); same( f.target._axeSuppressedBy, 0, 'retiring failed owner clears pending owner ID' );
		ED_ClearEdict( f.owner ); same( f.owner.index, index, 'actual same native edict object/index reused' ); same( f.owner._axeReady, false, 'edict reset clears stale ready flag' ); same( f.owner._axeCorpse, null, 'edict reset clears stale metadata' );
		f.owner._axeCorpse = { ...valid, at: sv.time + .1, key: f.owner.index + '@' + ( sv.time + .1 ) }; f.owner._axeOwnerKey = f.owner._axeCorpse.key; corpses.R_AxeCorpsesFrame( f.scene ); check( f.owner._axeReady, 'new same-index corpse legitimately builds' ); same( SV_AxeEntitySuppressed( f.target.index ), false, 'new ready object cannot retroactively hide old failed target' );

	} finally { corpses.R_ClearAxeCorpses(); }

} );

Deno.test( 'every available native monster animation frame constructively splits on both actual axe impact planes', () => {

	const previousLerp = r_lerpmodels.value, failures = [], coverage = [], deadline = performance.now() + 120000; r_lerpmodels.value = 0; let attempts = 0;
	const normals = [ 3, 7 ].map( frame => R_AxeSwingNormal( pak.COM_FindFile( 'progs/v_axe.mdl' ).data, frame, [ 0, 0, 0 ] ) );
	try {

		for ( const name of [ 'soldier', 'dog', 'knight', 'ogre', 'demon', 'shambler', 'zombie', 'wizard' ] ) {

			const entity = new entity_t(); entity.model = Mod_ForName( 'progs/' + name + '.mdl', true ); const header = entity.model.cache.data; coverage.push( { name, frames: header.numframes } );
			for ( let frame = 0; frame < header.numframes; frame ++ ) {

				check( performance.now() < deadline, 'bounded all-frame constructive test exceeded120seconds' ); entity.frame = frame; const mesh = R_DrawAliasModel( entity, header ); mesh.geometry.computeBoundingBox();
				for ( let swing = 0; swing < normals.length; swing ++ ) {

					const normal = normals[ swing ], center = mesh.geometry.boundingBox.getCenter( new THREE.Vector3() ).addScaledVector( new THREE.Vector3( ...normal ), .001 ); let parts;
					attempts ++;
					try { parts = R_BisectGeometry( mesh.geometry, normal, center.toArray() ); check( parts.length === 2, 'expectedtwohalves' ); for ( const part of parts ) for ( const geometry of [ part.body, part.cap ] ) { check( geometry.attributes.position.count >= 3, 'empty body or cap' ); check( geometry.attributes.position.array.every( Number.isFinite ), 'nonfinite split vertices' ); } }
					catch ( error ) { failures.push( { model: name, frame, swing: swing === 0 ? 3 : 7, error: error.message } ); }
					finally { for ( const part of parts || [] ) { part.body.dispose(); part.cap.dispose(); } }

				}

			}
			entity._aliasGeo?.dispose();

		}
		console.log( 'NATIVE_BISECT_ALL_FRAMES ' + JSON.stringify( { attempts, coverage, failures } ) ); same( failures.length, 0, 'every actual native model/frame generates finite nonempty bodies and caps' );

	} finally { r_lerpmodels.value = previousLerp; }

} );

Deno.test( 'concave containment rejects a false nested hole when a second closed contour crosses the U-shaped notch', () => {

	const outline = points => { const shape = new THREE.Shape(); points.forEach( ( [ x, y ], i ) => i ? shape.lineTo( x, y ) : shape.moveTo( x, y ) ); shape.closePath(); return shape; };
	const originals = [ [ [ 0, 0 ], [ 6, 0 ], [ 6, 6 ], [ 4, 6 ], [ 4, 2 ], [ 2, 2 ], [ 2, 6 ], [ 0, 6 ] ], [ [ 1, 5 ], [ 5, 5 ], [ 3, 1 ] ] ].map( polygon => new THREE.ExtrudeGeometry( outline( polygon ), { depth: 2, bevelEnabled: false, steps: 1 } ) );
	const merged = new THREE.BufferGeometry(); for ( const name of [ 'position', 'normal', 'uv' ] ) merged.setAttribute( name, new THREE.Float32BufferAttribute( originals.flatMap( geometry => Array.from( geometry.attributes[ name ].array ) ), originals[ 0 ].attributes[ name ].itemSize ) );
	const parts = R_BisectGeometry( merged, [ 0, 0, 1 ], [ 0, 0, 1 ] );
	try {

		for ( let side = 0; side < 2; side ++ ) {

			const area = triangles( parts[ side ].cap ).reduce( ( sum, triangle ) => sum + new THREE.Triangle( ...triangle ).getArea(), 0 );
			check( Math.abs( area - 36 ) < .00001, 'overlapping outer contours retain U28 plus triangle8 cap area; false hole20 is forbidden: ' + area );
			capNormals( parts[ side ], [ 0, 0, 1 ], side, [ 0, 0, 1 ] );

		}

	} finally { merged.dispose(); originals.forEach( geometry => geometry.dispose() ); parts.forEach( part => { part.body.dispose(); part.cap.dispose(); } ); }

} );

// Every previously failing model/frame, retained from the first1718-cut run.
const previousFailures = [
	[ 'dog', 7, [ 1, 2, 6, 11, 12, 14, 15, 17, 30, 51, 53, 56, 57, 58, 59, 60, 65, 68 ] ],
	[ 'knight', 3, [ 12, 13, 14, 18, 25, 27, 44, 45, 47, 52, 59, 60, 63, 64, 65, 71, 72, 73, 74, 75, 82 ] ],
	[ 'knight', 7, [ 78, 81, 83, 84, 85 ] ],
	[ 'demon', 3, [ 13, 14, 15, 20, 22, 23, 25, 27, 29, 30, 38, 60, 61 ] ], [ 'demon', 7, [ 24, 49, 53 ] ],
	[ 'zombie', 3, [ 93 ] ], [ 'zombie', 7, [ 137 ] ]
];
function originalSheetWitnesses( sourceTriangles ) {

	const edges = new Map(), byTriangle = sourceTriangles.map( () => [] );
	sourceTriangles.forEach( ( triangle, index ) => { for ( let i = 0; i < 3; i ++ ) { const id = [ key( triangle[ i ].toArray() ), key( triangle[ ( i + 1 ) % 3 ].toArray() ) ].sort().join( '|' ); if ( ! edges.has( id ) ) edges.set( id, [] ); edges.get( id ).push( index ); byTriangle[ index ].push( id ); } } );
	const seen = new Set(), accepted = new Set(), witnesses = [];
	for ( const entries of edges.values() ) if ( entries.length === 1 && ! seen.has( entries[ 0 ] ) ) {

		const component = [ entries[ 0 ] ]; seen.add( entries[ 0 ] );
		for ( let i = 0; i < component.length; i ++ ) for ( const edge of byTriangle[ component[ i ] ] ) if ( edges.get( edge ).length === 2 ) for ( const adjacent of edges.get( edge ) ) if ( ! seen.has( adjacent ) ) { seen.add( adjacent ); component.push( adjacent ); }
		const border = [ ...new Set( component.flatMap( index => byTriangle[ index ] ) ) ], open = border.filter( edge => edges.get( edge ).length === 1 ), attached = border.filter( edge => edges.get( edge ).length >= 3 );
		const first = sourceTriangles[ component[ 0 ] ], plane = new THREE.Plane().setFromCoplanarPoints( ...first );
		const deviation = Math.max( ...component.flatMap( index => sourceTriangles[ index ].map( point => Math.abs( plane.distanceToPoint( point ) ) ) ) );
		// Never excuse a generally open body. The independent original artifact
		// must expose both a free sheet edge and a nonmanifold attachment, and
		// its complete component must be planar at native precision.
		if ( open.length && attached.length && deviation < .0001 ) { component.forEach( index => accepted.add( index ) ); witnesses.push( { triangles: component, openEdges: open.length, attachmentEdges: attached.length, maximumPlaneDeviation: deviation } ); }

	}
	return { accepted, witnesses };

}
function mergeCoverage( intervals, epsilon ) {

	intervals.sort( ( a, b ) => a[ 0 ] - b[ 0 ] ); let covered = 0, largestGap = 0;
	for ( const [ start, end ] of intervals ) { if ( start > covered + epsilon ) largestGap = Math.max( largestGap, start - covered ); covered = Math.max( covered, end ); }
	if ( covered < 1 - epsilon ) largestGap = Math.max( largestGap, 1 - covered ); return largestGap;

}
function capAreaCoverage( a, b, capTriangles, normal, tolerance ) {

	const intervals = [], delta = b.clone().sub( a ), length = delta.length();
	for ( const triangle of capTriangles ) {

		const cross = triangle[ 1 ].clone().sub( triangle[ 0 ] ).cross( triangle[ 2 ].clone().sub( triangle[ 0 ] ) ), sign = Math.sign( cross.dot( normal ) ); if ( ! sign ) continue;
		let lo = 0, hi = 1;
		for ( let i = 0; i < 3 && lo <= hi; i ++ ) {

			const vertex = triangle[ i ], edge = triangle[ ( i + 1 ) % 3 ].clone().sub( vertex ), scale = edge.length();
			const start = edge.clone().cross( a.clone().sub( vertex ) ).dot( normal ) * sign / scale, end = edge.clone().cross( b.clone().sub( vertex ) ).dot( normal ) * sign / scale, change = end - start;
			if ( Math.abs( change ) < 1e-12 ) { if ( start < -tolerance ) hi = -1; }
			else if ( change > 0 ) lo = Math.max( lo, ( -tolerance - start ) / change ); else hi = Math.min( hi, ( -tolerance - start ) / change );

		}
		if ( lo <= hi ) intervals.push( [ Math.max( 0, lo ), Math.min( 1, hi ) ] );

	}
	return mergeCoverage( intervals, tolerance / length ) * length;

}
function sourceSegmentCoverage( a, b, sourceSegments, tolerance ) {

	const delta = b.clone().sub( a ), lengthSq = delta.lengthSq(), length = Math.sqrt( lengthSq ), intervals = [];
	for ( const { points } of sourceSegments ) {

		const positions = points.map( point => point.clone().sub( a ).dot( delta ) / lengthSq );
		if ( points.some( ( point, i ) => a.clone().addScaledVector( delta, positions[ i ] ).distanceTo( point ) > tolerance ) ) continue;
		const lo = Math.max( 0, Math.min( ...positions ) ), hi = Math.min( 1, Math.max( ...positions ) ); if ( hi >= lo ) intervals.push( [ lo, hi ] );

	}
	return mergeCoverage( intervals, tolerance / length ) * length;

}

Deno.test( 'all62 originally failing cuts cover every native solid cut segment and every cap boundary has native provenance', () => {

	const previousLerp = r_lerpmodels.value, failures = [], coverage = [], deadline = performance.now() + 120000; r_lerpmodels.value = 0;
	try {

		for ( const [ model, swing, frames ] of previousFailures ) {

			const entity = new entity_t(); entity.model = Mod_ForName( 'progs/' + model + '.mdl', true );
			for ( const frame of frames ) {

				check( performance.now() < deadline, 'bounded provenance audit exceeded120seconds' ); entity.frame = frame; const geometry = R_DrawAliasModel( entity, entity.model.cache.data ).geometry; geometry.computeBoundingBox();
				const n = new THREE.Vector3( ...R_AxeSwingNormal( pak.COM_FindFile( 'progs/v_axe.mdl' ).data, swing, [ 0, 0, 0 ] ) ), point = geometry.boundingBox.getCenter( new THREE.Vector3() ).addScaledVector( n, .001 ), plane = new THREE.Plane().setFromNormalAndCoplanarPoint( n, point );
				const original = triangles( geometry ), sheets = originalSheetWitnesses( original ), sourceSegments = [], tolerance = .0001;
				original.forEach( ( triangle, index ) => {

					const intersections = [];
					for ( let edge = 0; edge < 3; edge ++ ) { const a = triangle[ edge ], b = triangle[ ( edge + 1 ) % 3 ], da = plane.distanceToPoint( a ), db = plane.distanceToPoint( b ); if ( Math.abs( da ) <= 1e-6 ) intersections.push( a.clone() ); if ( da * db < -1e-12 ) { const hit = plane.intersectLine( new THREE.Line3( a, b ), new THREE.Vector3() ); if ( hit ) intersections.push( hit ); } }
					const points = []; for ( const p of intersections ) if ( ! points.some( q => p.distanceTo( q ) < 1e-7 ) ) points.push( p );
					if ( points.length === 2 && points[ 0 ].distanceTo( points[ 1 ] ) > tolerance ) sourceSegments.push( { triangle: index, points, originalOpenSheet: sheets.accepted.has( index ) } );

				} );
				const parts = R_BisectGeometry( geometry, n.toArray(), point.toArray() ); let exempted = 0, checked = 0, boundaries = 0;
				try {

					for ( let side = 0; side < 2; side ++ ) {

						const cap = triangles( parts[ side ].cap ), boundaryMap = new Map();
						for ( const segment of sourceSegments ) {

							const gap = capAreaCoverage( ...segment.points, cap, n, tolerance ); checked ++;
							if ( gap > tolerance ) { if ( segment.originalOpenSheet ) exempted ++; else failures.push( { model, frame, swing, side, issue: 'native solid cut segment is not covered by cap area', triangle: segment.triangle, gapLength: gap, points: segment.points.map( p => p.toArray() ) } ); }

						}
						for ( const triangle of cap ) for ( let i = 0; i < 3; i ++ ) { const a = triangle[ i ], b = triangle[ ( i + 1 ) % 3 ], id = [ key( a.toArray() ), key( b.toArray() ) ].sort().join( '|' ); if ( ! boundaryMap.has( id ) ) boundaryMap.set( id, { count: 0, points: [ a, b ] } ); boundaryMap.get( id ).count ++; }
						for ( const edge of boundaryMap.values() ) if ( edge.count === 1 ) { boundaries ++; const gap = sourceSegmentCoverage( ...edge.points, sourceSegments, tolerance ); if ( gap > tolerance ) failures.push( { model, frame, swing, side, issue: 'generated cap boundary has no native cut-segment support', gapLength: gap, points: edge.points.map( p => p.toArray() ) } ); }

					}

				} finally { parts.forEach( part => { part.body.dispose(); part.cap.dispose(); } ); }
				coverage.push( { model, frame, swing, checkedNativeSegments: checked, checkedCapBoundaries: boundaries, openSheetExemptions: exempted, originalSheetWitnesses: exempted ? sheets.witnesses : [] } );

			}
			entity._aliasGeo?.dispose();

		}
		same( coverage.length, 62, 'all original failures audited' ); console.log( 'NATIVE_CUT_PROVENANCE_62 ' + JSON.stringify( { coverage, failures } ) ); same( failures.length, 0, 'no unexplained native cut gaps or unsupported new cap boundaries' );

	} finally { r_lerpmodels.value = previousLerp; }

} );

Deno.test( 'saved cut corpse reappears as two identically settled and skinned halves in the real native level preview without active-world mutation', async () => {

	const saved = { document: Object.getOwnPropertyDescriptor( globalThis, 'document' ), load: THREE.TextureLoader.prototype.load, salt: skins.R_NewerSkinSalt(), variety: skins.r_newer_variety.value, enemies: anim.r_newer_enemies.value, normals: anim.r_newer_normals.value, newer: anim.R_IsNewer(), lighting: anim.R_NewerLightingActive() };
	let view;
	try {

		const f = corpseFixture(); skins.R_NewerSkinsShutdown();
		// Only the image transport is doubled. Real public selection/material
		// caches receive two distinguishable Three textures; this checks variant
		// identity, not visual fidelity of external artwork.
		Object.defineProperty( globalThis, 'document', { configurable: true, value: {} } );
		THREE.TextureLoader.prototype.load = function ( url, loaded ) { const color = String( url ).includes( 'variant-a' ) ? [ 31, 59, 113, 255 ] : [ 193, 43, 17, 255 ], texture = new THREE.DataTexture( Uint8Array.from( color ), 1, 1 ); texture.name = String( url ); queueMicrotask( () => loaded( texture ) ); return texture; };
		anim.R_AnimSetNewer( true ); anim.R_AnimSetLighting( true ); anim.r_newer_enemies.value = 1; anim.r_newer_normals.value = 0; skins.r_newer_variety.value = 1;
		skins.R_NewerSetIndex( { version: 'axe-preview-proof', models: { soldier: [ { dir: 'soldier/variant-a', maps: { diffuse: 'diffuse.webp' } }, { dir: 'soldier/variant-b', maps: { diffuse: 'diffuse.webp' } } ] } } );
		const model = Mod_ForName( f.owner._axeCorpse.model, true ); await skins.R_NewerSkinsPrepare( [ model ] ); await Promise.resolve();
		skins.R_NewerSetSalt( 73421 ); f.owner._axeCorpse.skinSalt = skins.R_NewerSkinSalt();
		corpses.R_AxeCorpsesFrame( f.scene ); sv.time += 2; corpses.R_AxeCorpsesFrame( f.scene ); const live = f.scene.getObjectByName( 'quake_axe_bisection' ); check( live && f.owner._axeReady, 'actual live native corpse ready before saving' );
		const liveMaterial = live.children[ 0 ].children[ 0 ].material; check( liveMaterial.map?.name.includes( 'variant-' ), 'real material cache selected distinguishable prepared variant' );
		const originalPose = live.children.map( part => ( { position: part.position.toArray(), quaternion: part.quaternion.toArray() } ) ), originalFloor = f.owner._axeCorpse.floor.slice(), snapshotTime = sv.time;
		const serialized = []; ED_Write( serialized, f.owner ); ED_Write( serialized, f.target );
		const snapshot = R_ParseEntityLump( serialized.join( '\n' ) ).map( entity => ( { ...entity, _snapshot_time: String( snapshotTime ) } ) );
		const sourceText = sv.worldmodel.entities, sourceSubmodels = sv.worldmodel.submodels;
		const entities = R_LevelEntities( sourceText, snapshot, sourceSubmodels, 1 ); same( entities.filter( entity => entity.kind === 'axe' ).length, 1, 'serialized owner becomes one validated preview cut descriptor' ); same( entities.filter( entity => entity.kind === 'alias' ).length, 0, 'snapshot hidden original cannot reappear as an intact alias' );
		const cut = entities[ 0 ]; same( cut.time, snapshotTime, 'preview uses saved level time, not current active-world clock' ); same( cut.record.skinSalt, 73421, 'captured skin salt survives actual edict writer and snapshot parser' ); same( cut.record.entityIndex, f.target.index, 'captured actor identity survives serialization' ); same( cut.record.floor.join(), originalFloor.join(), 'captured real floor probes survive serialization' );
		const firstVariant = skins.R_NewerPickVariant( { _entityIndex: f.target.index, _qrSalt: 73421 }, 'soldier', 2 ); let changedSalt = 1;
		for ( ; changedSalt < 100; changedSalt ++ ) { skins.R_NewerSetSalt( changedSalt ); if ( skins.R_NewerPickVariant( { _entityIndex: f.target.index }, 'soldier', 2 ) !== firstVariant ) break; }
		check( changedSalt < 100, 'negative control finds a level salt that genuinely changes the actor variant' );
		check( skins.R_NewerAliasMaterial( { _entityIndex: f.target.index }, 'progs/soldier.mdl', true ) !== liveMaterial, 'without captured override, actual material selection would change' );
		corpses.R_ClearAxeCorpses(); sv.active = false; SV_SpawnServer( 'e1m2' ); cl.worldmodel = sv.worldmodel; skins.R_NewerSetSalt( changedSalt );
		const active = { world: sv.worldmodel, edicts: sv.edicts, fields: sv.edicts.map( edict => Buffer.from( edict._fieldBuffer ).toString( 'hex' ) ), flags: sv.edicts.map( edict => [ edict._axeReady, edict._axeSuppressed, edict._axeSuppressedBy ] ), lightmaps: sv.worldmodel.surfaces.map( surface => [ surface.light_s, surface.light_t ] ) };
		const previewWorld = Mod_LoadForPreview( 'maps/e1m1.bsp' ); check( previewWorld && previewWorld !== active.world, 'actual native source map is independently loaded for preview' );
		view = R_BuildLevelView( previewWorld, cut.record.origin, entities ); check( view, 'actual public native BSP preview built' ); same( view.ghosts.length, 0, 'preview creates no intact hidden alias ghosts' );
		const halves = view.group.getObjectByName( 'quake_axe_bisection' ); check( halves && halves.children.length === 2, 'actual level-view scene contains two capped corpse halves' );
		halves.children.forEach( ( part, i ) => { same( part.position.toArray().join(), originalPose[ i ].position.join(), 'preview settled position matches departed live level' ); same( part.quaternion.toArray().join(), originalPose[ i ].quaternion.join(), 'preview settled orientation matches departed live level' ); same( part.children[ 0 ].material, liveMaterial, 'actual preview retains captured material variant after salt changes' ); same( part.children[ 0 ].material.map, liveMaterial.map, 'same captured diffuse texture identity' ); check( part.children.every( mesh => ! mesh.userData.quakeAxePart && ! mesh.layers.isEnabled( 3 ) ), 'portal ghosts cannot enter active world dynamic shadow caster collection' ); } );
		same( sv.worldmodel, active.world, 'preview leaves active world identity intact' ); same( sv.edicts, active.edicts, 'preview leaves active edict array intact' );
		active.fields.forEach( ( fields, i ) => same( Buffer.from( sv.edicts[ i ]._fieldBuffer ).toString( 'hex' ), fields, 'active native fields untouched' ) ); active.flags.forEach( ( flags, i ) => same( JSON.stringify( [ sv.edicts[ i ]._axeReady, sv.edicts[ i ]._axeSuppressed, sv.edicts[ i ]._axeSuppressedBy ] ), JSON.stringify( flags ), 'preview cannot latch active-world suppression' ) ); same( JSON.stringify( active.world.surfaces.map( surface => [ surface.light_s, surface.light_t ] ) ), JSON.stringify( active.lightmaps ), 'preview atlas cannot rewrite active-world lightmap placements' ); same( corpses.R_AxeCorpseStatus().length, 0, 'preview does not register a live corpse in active world' );
		const owned = halves.children.flatMap( part => part.children.map( mesh => mesh.geometry ) ), cap = halves.children[ 0 ].children[ 1 ].material; let disposedGeometry = 0, disposedCap = 0, disposedShared = 0;
		owned.forEach( geometry => geometry.addEventListener( 'dispose', () => disposedGeometry ++ ) ); cap.addEventListener( 'dispose', () => disposedCap ++ ); liveMaterial.addEventListener( 'dispose', () => disposedShared ++ );
		view.dispose(); view = null; same( disposedGeometry, 4, 'level-view cleanup disposes both owned bodies and caps' ); same( disposedCap, 1, 'level-view cleanup disposes owned cap material once' ); same( disposedShared, 0, 'preview cleanup preserves shared skin material and native model art' ); same( halves.parent, null, 'preview cut group detached on cleanup' );

	} finally { view?.dispose(); corpses.R_ClearAxeCorpses(); skins.R_NewerSkinsShutdown(); skins.R_NewerSetIndex( null ); skins.R_NewerSetSalt( saved.salt ); skins.r_newer_variety.value = saved.variety; anim.r_newer_enemies.value = saved.enemies; anim.r_newer_normals.value = saved.normals; anim.R_AnimSetNewer( saved.newer ); anim.R_AnimSetLighting( saved.lighting ); THREE.TextureLoader.prototype.load = saved.load; if ( saved.document ) Object.defineProperty( globalThis, 'document', saved.document ); else delete globalThis.document; }

} );

Deno.test( 'portal snapshots keep a native fallback only for a present failed cut owner, with stable owner-key save round trips', () => {

	const f = corpseFixture(), key = f.owner._axeOwnerKey, world = sv.worldmodel;
	try {

		// Native corpse/gib edicts usually precede their cosmetic owner. Keep
		// that ordering to prove the preview resolves replacements first.
		const lines = []; ED_Write( lines, f.target ); ED_Write( lines, f.owner );
		const snapshot = R_ParseEntityLump( lines.join( '\n' ) ).map( ( entry, i ) => ( { ...entry, _snapshot_index: String( i ? f.owner.index : f.target.index ), _snapshot_time: String( sv.time + 2 ) } ) );
		same( snapshot[ 0 ]._newer_axe_owner, key, 'native fallback carries stable serialized owner key' ); same( snapshot[ 1 ]._newer_axe_owner, key, 'replacement owner carries same stable serialized key' );
		const sourceEntries = [ f.target, f.owner ];
		for ( const source of sourceEntries ) { const encoded = []; ED_Write( encoded, source ); const copy = ED_Alloc(); ED_ParseEdict( COM_Parse( encoded.join( '\n' ) ), copy ); same( copy._axeOwnerKey, key, 'actual edict parser round-trips owner key on body and owner' ); if ( source === f.owner ) same( copy._axeCorpse.key, key, 'record key survives full edict round trip' ); ED_Free( copy ); }
		for ( const mode of [ 'healthy', 'missing-model', 'invalid-metadata', 'expired-owner' ] ) {

			const entries = JSON.parse( JSON.stringify( snapshot ) );
			if ( mode === 'missing-model' ) { const record = JSON.parse( decodeURIComponent( entries[ 1 ]._newer_axe_corpse ) ); record.model = 'progs/missing_preview_cut.mdl'; entries[ 1 ]._newer_axe_corpse = encodeURIComponent( JSON.stringify( record ) ); }
			if ( mode === 'invalid-metadata' ) entries[ 1 ]._newer_axe_corpse = '%malformed';
			if ( mode === 'expired-owner' ) { entries.pop(); entries[ 0 ]._newer_axe_hidden = '-1'; }
			const projected = R_LevelEntities( world.entities, entries, world.submodels, 1 );
			if ( mode === 'expired-owner' ) same( projected.length, 0, 'expired already-replaced corpse stays permanently suppressed' );
			else { same( projected.filter( entry => entry.kind === 'axe' ).length, 1, 'present owner retains replacement or explicit failure descriptor' ); same( projected.filter( entry => entry.kind === 'axeFallback' ).length, 1, 'matching native fallback descriptor retained until resolution' ); }
			const before = { ready: f.owner._axeReady, hidden: f.target._axeSuppressed, by: f.target._axeSuppressedBy, owner: f.target._axeOwnerKey };
			const view = R_BuildLevelView( world, f.owner._axeCorpse.origin, projected ); check( view, 'actual native level-view scene built for ' + mode );
			try {

				const cut = view.group.getObjectByName( 'quake_axe_bisection' );
				if ( mode === 'missing-model' || mode === 'invalid-metadata' ) { same( view.cutFailures.length, 1, 'failed replacement reports an explicit preview failure' ); same( view.ghosts.length, 1, 'actual native fallback ghost survives missing/invalid replacement' ); same( view.ghosts[ 0 ].e.model.name, 'progs/soldier.mdl', 'fallback uses original native model' ); check( ! cut, 'failed preview never presents fake cut halves' ); }
				else { same( view.cutFailures.length, 0, 'healthy/expired state introduces no artificial failure' ); same( view.ghosts.length, 0, 'healthy replacement or expired owner never resurrects intact body' ); check( mode === 'healthy' ? cut?.children.length === 2 : ! cut, 'appropriate replacement presence for ' + mode ); }
				same( JSON.stringify( { ready: f.owner._axeReady, hidden: f.target._axeSuppressed, by: f.target._axeSuppressedBy, owner: f.target._axeOwnerKey } ), JSON.stringify( before ), 'preview never latches or alters active server suppression' );

			} finally { view.dispose(); }

		}
		const legacy = JSON.parse( JSON.stringify( snapshot ) ); legacy.forEach( entry => { delete entry._newer_axe_owner; } ); const legacyRecord = JSON.parse( decodeURIComponent( legacy[ 1 ]._newer_axe_corpse ) ); delete legacyRecord.key; legacy[ 1 ]._newer_axe_corpse = encodeURIComponent( JSON.stringify( legacyRecord ) );
		check( R_LevelEntities( world.entities, legacy, world.submodels, 1 ).some( entry => entry.kind === 'axeFallback' && entry.fallbackFor === 'slot:' + f.owner.index ), 'legacy pending suppression uses annotated snapshot index without a fabricated key' );

	} finally { corpses.R_ClearAxeCorpses(); }

} );

Deno.test( 'failed reconstruction rebinds previously latched native fallback and a different same-index owner key cannot hide it', () => {

	const f = corpseFixture();
	try {

		corpses.R_AxeCorpsesFrame( f.scene ); check( f.owner._axeReady && f.target._axeSuppressedBy === 0, 'original successful replacement latches native suppression' ); const valid = { ...f.owner._axeCorpse }, key = f.owner._axeOwnerKey;
		corpses.R_ClearAxeCorpses(); f.owner._axeCorpse = { ...valid, model: 'progs/missing_reloaded_cut.mdl' }; corpses.R_AxeCorpsesFrame( f.scene );
		check( corpses.R_AxeCorpseStatus()[ 0 ]?.error && ! f.owner._axeReady, 'failed reconstruction remains explicitly unready' ); same( f.target._axeSuppressedBy, f.owner.index, 'stable key rebinds formerly latched body to failed owner' ); same( SV_AxeEntitySuppressed( f.target.index ), false, 'actual native draw suppression releases body while replacement failed' );
		corpses.R_ClearAxeCorpses(); f.target._axeSuppressedBy = 0;
		ED_ParseEdict( COM_Parse( '{ "_newer_axe_corpse" "%malformed" "_newer_axe_owner" "' + key + '" }' ), f.owner ); same( f.owner._axeCorpse, null, 'native load rejects malformed record' ); same( f.owner._axeOwnerKey, key, 'native load retains validated owner identity for fallback' );
		same( f.owner._axeInvalidRecord, true, 'decoder retains explicit invalid-owner state without accepting bad geometry metadata' );
		corpses.R_AxeCorpsesFrame( f.scene ); same( f.target._axeSuppressedBy, f.owner.index, 'invalid decoded owner restores matching latched fallback before drawing' ); same( SV_AxeEntitySuppressed( f.target.index ), false, 'invalid save cannot leave invisible dead actor' );
		const resaved = []; ED_Write( resaved, f.target ); ED_Write( resaved, f.owner ); const resavedSnapshot = R_ParseEntityLump( resaved.join( '\n' ) );
		const reprojection = R_LevelEntities( sv.worldmodel.entities, resavedSnapshot, sv.worldmodel.submodels, 1 );
		check( reprojection.some( entry => entry.kind === 'axe' && ! entry.record ) && reprojection.some( entry => entry.kind === 'axeFallback' ), 're-saving an invalid decoded owner retains its explicit failed-owner and native-fallback relationship' );
		const failedView = R_BuildLevelView( sv.worldmodel, valid.origin, reprojection ); check( failedView, 're-saved failure still builds native level preview' );
		try { same( failedView.cutFailures.length, 1, 're-saved invalid owner remains a visible diagnostic failure' ); same( failedView.ghosts.length, 1, 're-saved invalid owner cannot make the native fallback disappear again' ); } finally { failedView.dispose(); }
		ED_ClearEdict( f.owner ); same( f.owner._axeInvalidRecord, false, 'native edict recycling clears stale invalid-owner state' ); const nextAt = sv.time + 1, nextKey = f.owner.index + '@' + nextAt; f.owner._axeOwnerKey = nextKey; f.owner._axeCorpse = { ...valid, key: nextKey, at: nextAt }; corpses.R_AxeCorpsesFrame( f.scene ); check( f.owner._axeReady, 'new generation at same slot legitimately builds' );
		same( f.target._axeOwnerKey, key, 'old target still belongs to its original owner generation' ); same( f.target._axeSuppressedBy, f.owner.index, 'old pending reference still names reused slot for the negative control' ); same( SV_AxeEntitySuppressed( f.target.index ), false, 'ready replacement with a different stable owner key cannot suppress old fallback' );

	} finally { corpses.R_ClearAxeCorpses(); }

} );

Deno.test( 'a real classless native ThrowGib edict remains available as preview fallback for a failed matching cut owner', () => {

	const f = corpseFixture(); let view;
	try {

		const existing = new Set( sv.edicts.slice( 0, sv.num_edicts ).filter( edict => ! edict.free ) ), fn = ED_FindFunction( 'ThrowGib' ); check( fn, 'native ThrowGib callback exists' );
		progs.pr_global_struct.self = progs.EDICT_TO_PROG( f.target ); progs.pr_globals_int[ OFS_PARM0 ] = ED_NewString( 'progs/gib1.mdl' ); progs.pr_globals_float[ OFS_PARM1 ] = -60; PR_ExecuteProgram( progs.pr_functions.indexOf( fn ) );
		console.log( 'NATIVE_THROWGIB_PREVIEW_FALLBACK ' + JSON.stringify( sv.edicts.slice( 0, sv.num_edicts ).filter( edict => ! edict.free && ! existing.has( edict ) ).map( edict => ( { index: edict.index, classname: progs.PR_GetString( edict.v.classname ), model: progs.PR_GetString( edict.v.model ) } ) ) ) );
		const gib = sv.edicts.find( edict => ! edict.free && ! existing.has( edict ) && progs.PR_GetString( edict.v.model ) === 'progs/gib1.mdl' ); check( gib, 'actual native QC created model-bearing gib' ); same( progs.PR_GetString( gib.v.classname ), '', 'shipped ThrowGib has no classname' );
		gib._axeSuppressed = true; gib._axeSuppressedBy = f.owner.index; gib._axeOwnerKey = f.owner._axeOwnerKey;
		const lines = []; ED_Write( lines, gib ); ED_Write( lines, f.owner );
		const snapshot = R_ParseEntityLump( lines.join( '\n' ) ).map( ( entry, i ) => ( { ...entry, _snapshot_index: String( i ? f.owner.index : gib.index ), _snapshot_time: String( sv.time ) } ) );
		same( snapshot[ 0 ].classname, undefined, 'real edict writer omits empty native gib classname' ); snapshot[ 1 ]._newer_axe_corpse = '%malformed';
		const projected = R_LevelEntities( sv.worldmodel.entities, snapshot, sv.worldmodel.submodels, 1 ); check( projected.some( entry => entry.kind === 'axeFallback' && entry.model === 'progs/gib1.mdl' ), 'matching failed owner retains classless native gib as fallback' );
		same( R_LevelEntities( sv.worldmodel.entities, [ { model: 'progs/soldier.mdl', origin: '176 1008 -199.95' } ], sv.worldmodel.submodels, 1 ).length, 0, 'unrelated anonymous non-gib aliases remain excluded' );
		same( R_LevelEntities( sv.worldmodel.entities, [ { ...snapshot[ 0 ], _newer_axe_hidden: '-1' } ], sv.worldmodel.submodels, 1 ).length, 0, 'expired owner does not resurrect its classless gib' );
		view = R_BuildLevelView( sv.worldmodel, f.owner._axeCorpse.origin, projected ); check( view, 'actual native world preview builds' ); same( view.cutFailures.length, 1, 'invalid replacement failure reported' ); same( view.ghosts.length, 1, 'classless native gib is actually rendered in fallback preview' ); same( view.ghosts[ 0 ].e.model.name, 'progs/gib1.mdl', 'original native gib model preserved' );

	} finally { view?.dispose(); corpses.R_ClearAxeCorpses(); }

} );

// Card [18]: the cut faces continue the body's skin, and a half rests on the ground's slope
Deno.test( 'a cut face carries the body\'s own skin coordinates and lighting at its contour, drawn with the body\'s skin under a red tint', () => {

	const entity = new entity_t(); entity.model = Mod_ForName( 'progs/soldier.mdl', true ); entity.frame = 0; const mesh = R_DrawAliasModel( entity, entity.model.cache.data ), geometry = mesh.geometry; geometry.computeBoundingBox();
	const normal = R_AxeSwingNormal( pak.COM_FindFile( 'progs/v_axe.mdl' ).data, 3, [ 0, 0, 0 ] ), point = geometry.boundingBox.getCenter( new THREE.Vector3() ).toArray();
	const halves = R_BisectGeometry( geometry, normal, point );
	try {

		for ( const part of halves ) {

			const cap = part.cap, body = part.body;
			check( cap.getAttribute( 'uv' ) && cap.getAttribute( 'uv' ).count === cap.getAttribute( 'position' ).count, 'the cap has skin coordinates' );
			// every cap point is a point of the body's cut edge, with one of the skin coordinates the body has there
			const uvs = new Map(); const bp = body.getAttribute( 'position' ), bu = body.getAttribute( 'uv' );
			for ( let i = 0; i < bp.count; i ++ ) { const k = key( [ bp.getX( i ), bp.getY( i ), bp.getZ( i ) ] ); if ( ! uvs.has( k ) ) uvs.set( k, [] ); uvs.get( k ).push( [ bu.getX( i ), bu.getY( i ) ] ); }
			const cp = cap.getAttribute( 'position' ), cu = cap.getAttribute( 'uv' );
			for ( let i = 0; i < cp.count; i ++ ) {
				const at = uvs.get( key( [ cp.getX( i ), cp.getY( i ), cp.getZ( i ) ] ) );
				check( at && at.some( ( [ u, v ] ) => Math.abs( u - cu.getX( i ) ) < 1e-5 && Math.abs( v - cu.getY( i ) ) < 1e-5 ), 'cap point ' + i + ' uses the body\'s skin coordinate there' );
			}
			if ( geometry.getAttribute( 'color' ) ) same( cap.getAttribute( 'color' )?.count, cp.count, 'and its lighting colour' );

		}

	} finally { for ( const part of halves ) { part.body.dispose(); part.cap.dispose(); } }

	const f = corpseFixture();
	try {

		corpses.R_AxeCorpsesFrame( f.scene );
		const group = f.scene.getObjectByName( 'quake_axe_bisection' ), cap = group.children[ 0 ].children[ 1 ].material, body = group.children[ 0 ].children[ 0 ].material;
		same( cap.map, body.map, 'the cap is drawn with the body\'s skin' ); check( cap !== body, 'its own material' );
		const tint = corpses.CAP_TINT; check( Math.abs( cap.color.r - body.color.r * tint[ 0 ] ) < 1e-6 && Math.abs( cap.color.g - body.color.g * tint[ 1 ] ) < 1e-6 && Math.abs( cap.color.b - body.color.b * tint[ 2 ] ) < 1e-6, 'under a restrained red tint' );
		check( tint[ 1 ] > .5 && tint[ 2 ] > .5, 'restrained: the skin still shows' );

	} finally { corpses.R_ClearAxeCorpses(); }

} );

Deno.test( 'the ground\'s slope comes from the floor samples, a half rests on that slope (never through it, never hovering), and a bad saved slope is refused', () => {

	// a 20 degree ramp rising along +x
	const g = Math.tan( 20 * Math.PI / 180 ), hits = [ [ 0, 0 ], [ 10, 0 ], [ - 10, 0 ], [ 0, 10 ], [ 0, - 10 ] ].map( ( [ x, y ] ) => [ x, y, 5 + g * x ] );
	const n = corpses.R_AxeFloorSlope( hits );
	check( Math.abs( n[ 0 ] + Math.sin( 20 * Math.PI / 180 ) ) < 1e-4 && Math.abs( n[ 2 ] - Math.cos( 20 * Math.PI / 180 ) ) < 1e-4, 'the ramp\'s normal: ' + n );
	same( corpses.R_AxeFloorSlope( hits.slice( 0, 2 ) ).join(), '0,0,1', 'too few samples: level' );
	same( corpses.R_AxeFloorSlope( hits.map( ( [ x, y ] ) => [ x, y, x * 3 ] ) ).join(), '0,0,1', 'a wall, not a floor: level' );
	const f = corpseFixture();
	try {

		const data = f.owner._axeCorpse;
		corpses.R_AxeCorpsesFrame( f.scene ); // (latches the floor heights)
		const slope = [ n, n ], copy = { ...data, slope };
		const preview = corpses.R_AxeCorpsePreview( copy, cl.worldmodel, data.at + 5 );
		try {

			preview.mesh.updateMatrixWorld( true );
			preview.mesh.children.forEach( ( piece, i ) => {
				const body = piece.children[ 0 ], p = body.geometry.getAttribute( 'position' ), v = new THREE.Vector3(), normal = new THREE.Vector3( ...n );
				const rest = piece.position;
				let lowest = Infinity; for ( let k = 0; k < p.count; k ++ ) { v.fromBufferAttribute( p, k ).applyMatrix4( body.matrixWorld ); lowest = Math.min( lowest, normal.dot( v ) ); }
				// (the plane through the floor point under where it rests)
				const planeAt = normal.x * rest.x + normal.y * rest.y + normal.z * copy.floor[ i ];
				check( lowest - planeAt > .3 && lowest - planeAt < 1.5, 'half ' + i + ' rests on the slope: ' + ( lowest - planeAt ).toFixed( 3 ) + ' above it' );
			} );

		} finally { preview.dispose(); }
		same( Axe_ParseRecord( encodeURIComponent( JSON.stringify( { ...data, slope } ) ) )?.slope?.[ 0 ]?.join(), n.join(), 'a saved slope is kept' );
		for ( const bad of [ [ [ 0, 0, 1 ] ], [ [ 1, 0, 0 ], [ 0, 0, 1 ] ], [ [ 0, 0, 2 ], [ 0, 0, 1 ] ], [ [ 0, 0, 1 ], [ 0, 0, 'x' ] ] ] ) same( Axe_ParseRecord( encodeURIComponent( JSON.stringify( { ...data, slope: bad } ) ) ), null, 'a bad saved slope is refused: ' + JSON.stringify( bad ) );

	} finally { corpses.R_ClearAxeCorpses(); }

} );
