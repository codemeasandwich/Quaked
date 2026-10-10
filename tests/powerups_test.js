// Public presentation/selection contracts, using real Three objects and native
// PAK aliases. GPU shader behavior is verified separately by the bounded trial.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as power from '../src/r_powerups.js';
import * as anim from '../src/r_anim.js';
import * as vars from '../src/engine/common/cvar.js';
import * as post from '../src/gl_post.js';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
import { entity_t } from '../src/render.js';
import * as height from '../src/r_heightshadows.js';
import * as fire from '../src/r_powerupfire.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
for ( const value of [ post.r_hdr, power.r_powerups, anim.r_newer_lighting ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );
function setup() { power.R_PowerupClear(); anim.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'r_powerups', 1 ); }
function item( name = 'progs/quaddama.mdl', position = [ 0, 0, -50 ] ) { const entity = new entity_t(); entity.model = { name }; entity.origin.set( position ); const mesh = new THREE.Mesh( new THREE.BoxGeometry( 16, 16, 24 ), new THREE.MeshBasicMaterial() ); mesh.position.set( ...position ); return { entity, mesh }; }
function frame( scene, items, time = 0 ) { power.R_PowerupBegin( scene ); for ( const i of items ) power.R_PowerupSeen( i.entity, i.mesh, scene, time ); power.R_PowerupEnd(); }

Deno.test( 'exact native pickup kinds, bounded quad pulse, presentation-only source attributes and original gameplay fields', () => {

	setup(); const scene = new THREE.Scene();
	try {

		for ( const [ name, kind ] of [ [ 'progs/quaddama.mdl', 'quad' ], [ 'progs/invulner.mdl', 'pentagram' ], [ 'progs/invisibl.mdl', 'ring' ] ] ) {

			const { entity, mesh } = item( name ), native = Object.entries( mesh.geometry.attributes ).map( ( [ name, attr ] ) => [ name, attr, attr.array.slice() ] ), before = JSON.stringify( entity );
			same( power.R_PowerupKind( entity ), kind, 'exact native kind' ); frame( scene, [ { entity, mesh } ] );
			same( JSON.stringify( entity ), before, 'presentation leaves entity/gameplay fields unchanged' );
			for ( const [ name, attr, bytes ] of native ) { same( mesh.geometry.getAttribute( name ), attr, 'native attribute identity ' + name ); check( bytes.every( ( x, i ) => x === attr.array[ i ] ), 'native attribute bytes ' + name ); }
			const group = scene.children.find( o => o.name === 'powerup_' + kind ); check( group?.userData.newerOnly, 'effect group belongs only to enhanced presentation' );
			for ( const child of group.children ) { check( child.userData.newerOnly && ! child.material.depthWrite && child.material.transparent, 'sprites preserve native solid geometry/depth ownership' ); }
			const source = power.R_PowerupLights()[ 0 ]; same( source.cookie, kind === 'ring' ? 1 : 0, 'only ring has directional cookie' ); check( source.color.every( x => x >= 0 ) && source.radius > 0, 'valid finite light source' );
			mesh.geometry.dispose(); mesh.material.dispose();

		}
		for ( const name of [ 'progs/player.mdl', 'progs/armor.mdl', 'progs/invulner.mdl.backup', 'quaddama.mdl', 'PROGS/QUADDAMA.MDL', '' ] ) same( power.R_PowerupKind( { model: { name } } ), null, 'non-target model excluded' );
		for ( let time = -100; time <= 100; time += .125 ) check( power.R_PowerupPulse( time ) >= .88 && power.R_PowerupPulse( time ) <= 1.12, 'pulse has bounded radiance' );
		same( power.R_PowerupPulse( 3.25 ), power.R_PowerupPulse( 3.25 ), 'fixed simulation time deterministic' );

	} finally { power.R_PowerupClear(); }

} );

Deno.test( 'visible, collected, respawned, replaced and cleared entities retire effect/light state without retaining orphan meshes', () => {

	setup(); const scene = new THREE.Scene(), one = item();
	try {

		frame( scene, [ one ] ); const original = scene.children[ 0 ], light = power.R_PowerupLights()[ 0 ], expectedDisposals = original.children.length * 2; let disposed = 0;
		const volume = original.children.find( child => child.userData.powerupVolume ); let fieldDisposals = 0, planeDisposals = 0;
		volume.material.uniforms.uEmitterDistance.value.addEventListener( 'dispose', () => fieldDisposals ++ ); volume.material.uniforms.uGlyphPlanes.value.addEventListener( 'dispose', () => planeDisposals ++ );
		for ( const mesh of original.children ) { mesh.geometry.addEventListener( 'dispose', () => disposed ++ ); mesh.material.addEventListener( 'dispose', () => disposed ++ ); }
		frame( scene, [ one ], 1 ); same( scene.children[ 0 ], original, 'stable entity keeps same effect allocation' ); same( power.R_PowerupLights()[ 0 ], light, 'stable entity keeps light source identity' );
		frame( scene, [] ); same( scene.children.length, 0, 'collected/no longer visible pickup removed' ); same( power.R_PowerupLights().length, 0, 'removed pickup no longer lights room' ); same( disposed, expectedDisposals, 'each owned effect geometry and material disposed once' );
		same( fieldDisposals, 1, 'owned scalar fuel texture disposed on collection' ); same( planeDisposals, 1, 'owned glyph exclusion metadata texture disposed on collection' );
		frame( scene, [ one ], 2 ); check( scene.children[ 0 ] !== original, 'respawn creates a fresh owned effect' );
		const respawned = scene.children[ 0 ]; one.entity.model = { name: 'progs/invisibl.mdl' }; frame( scene, [ one ], 3 ); check( respawned.parent === null, 'model replacement retires old effect' ); same( scene.children[ 0 ].name, 'powerup_ring', 'replacement role reflected' );
		power.R_PowerupClear(); same( scene.children.length, 0, 'map clear removes all effects' ); same( power.R_PowerupStatus().pickups, 0, 'map clear removes registry entries' );

	} finally { power.R_PowerupClear(); one.mesh.geometry.dispose(); one.mesh.material.dispose(); }

} );

Deno.test( 'Classic helper redraw does not mutate the enhanced registry, and feature/Newer gates retire effects', () => {

	setup(); const scene = new THREE.Scene(), one = item();
	try {

		frame( scene, [ one ], 1 ); const group = scene.children[ 0 ], source = power.R_PowerupLights()[ 0 ], state = JSON.stringify( source );
		anim.R_AnimSetClassicPass( true ); power.R_PowerupBegin( new THREE.Scene() ); power.R_PowerupSeen( one.entity, one.mesh, scene, 99 ); power.R_PowerupEnd();
		same( scene.children[ 0 ], group, 'Classic redraw leaves scene registry object intact' ); same( JSON.stringify( source ), state, 'Classic cannot move or replace source' ); same( power.R_PowerupLights().length, 0, 'Classic never exposes enhanced light sources' );
		anim.R_AnimSetClassicPass( false ); same( power.R_PowerupLights()[ 0 ], source, 'enhanced source identity restored after Classic' );
		vars.Cvar_SetValue( 'r_powerups', 0 ); frame( scene, [ one ] ); same( scene.children.length, 0, 'feature toggle retires effects' ); same( power.R_PowerupLights().length, 0, 'feature toggle suppresses light sources' );
		vars.Cvar_SetValue( 'r_powerups', 1 ); frame( scene, [ one ] ); vars.Cvar_SetValue( 'r_hdr', 0 ); frame( scene, [ one ] ); same( scene.children.length, 0, 'Classic game removes effect' );

	} finally { anim.R_AnimSetClassicPass( false ); power.R_PowerupClear(); vars.Cvar_SetValue( 'r_hdr', 1 ); }

} );

Deno.test( 'live pickup lights share the existing eight-source budget and stable ranking while quad radiance pulses', () => {

	setup(); const scene = new THREE.Scene(), items = Array.from( { length: 10 }, ( _, i ) => item( i === 1 ? 'progs/invisibl.mdl' : 'progs/quaddama.mdl', [ i * 9, 0, -80 - i ] ) );
	try {

		post.R_BuildWorldLights( { nodes: [ { contents: -1, visframe: 1 } ], entities: '', surfaces: [] } ); frame( scene, items );
		const camera = new THREE.PerspectiveCamera(); camera.updateMatrixWorld();
		const first = post.R_SelectWorldLights( camera.matrixWorldInverse, 1, [], [], 0 ), later = post.R_SelectWorldLights( camera.matrixWorldInverse, 1, [], [], 1 );
		same( first.length, 8, 'existing eight-light cap unchanged' );
		for ( let i = 0; i < first.length; i ++ ) { same( first[ i ].source, later[ i ].source, 'pulsing does not reorder source identities' ); same( first[ i ].score, later[ i ].score, 'pulsing does not alter rank score' ); same( first[ i ].range, later[ i ].range, 'pulsing does not resize receiver lighting reach' ); }
		const quad = first.find( l => l.source.powerup === 'quad' ), pulse = later.find( l => l.source === quad.source ); check( quad.color[ 2 ] !== pulse.color[ 2 ], 'actual selected radiance changes with pulse' );
		const ring = first.find( l => l.source.powerup === 'ring' ); check( ring?.source.cookie === 1, 'ring cookie survives actual selected slot' );
		camera.rotation.y = Math.PI; camera.updateMatrixWorld(); const turned = post.R_SelectWorldLights( camera.matrixWorldInverse, 1, [], [], 1 ); check( turned.every( l => first.some( original => l.source === original.source ) ), 'camera turning keeps world-space source membership' );
		vars.Cvar_SetValue( 'r_powerups', 0 ); same( post.R_SelectWorldLights( camera.matrixWorldInverse, 1, [], [], 1 ).length, 0, 'off source does not occupy slot' );

	} finally { power.R_PowerupClear(); vars.Cvar_SetValue( 'r_powerups', 1 ); }

} );

Deno.test( 'actual public entity draw dispatch attaches effects to native world pickups and excludes held viewmodel', async () => {

	setup(); const main = await import( '../src/gl_rmain.js' ), client = await import( '../src/client.js' );
	const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	main.R_Init(); const savedWorld = client.cl.worldmodel, savedView = client.cl.viewent, savedCount = client.cl_numvisedicts, savedList = client.cl_visedicts.slice();
	try {

		client.cl.worldmodel = null; client.cl.time = 1;
		const entries = [ 'progs/quaddama.mdl', 'progs/invulner.mdl', 'progs/invisibl.mdl' ].map( name => { const e = new entity_t(); e.model = Mod_ForName( name, true ); return e; } );
		client.cl_visedicts.splice( 0, 3, ...entries ); client.set_cl_numvisedicts( 3 ); power.R_PowerupBegin( main.scene ); main.R_DrawEntitiesOnList(); power.R_PowerupEnd();
		same( power.R_PowerupStatus().pickups, 3, 'actual renderer dispatch registers each native world pickup' );
		for ( const entity of entries ) check( entity._aliasMesh?.parent === main.scene, 'actual native alias joined renderer scene' );
		const groups = main.scene.children.filter( child => child.name.startsWith( 'powerup_' ) ); same( groups.length, 3, 'actual renderer scene has exactly3 presentation groups' );
		anim.R_AnimSetClassicPass( true ); power.R_PowerupBegin( main.scene ); main.R_DrawEntitiesOnList(); power.R_PowerupEnd(); same( power.R_PowerupStatus().pickups, 3, 'actual Classic helper dispatch does not retire enhanced groups' );
		anim.R_AnimSetClassicPass( false ); power.R_PowerupClear(); client.cl.viewent = entries[ 0 ]; client.set_cl_numvisedicts( 1 ); power.R_PowerupBegin( main.scene ); main.R_DrawEntitiesOnList(); power.R_PowerupEnd(); same( power.R_PowerupStatus().pickups, 0, 'held viewmodel is excluded even if its model name matches a pickup' );
		client.cl.viewent = savedView; client.set_cl_numvisedicts( 3 ); power.R_PowerupBegin( main.scene ); main.R_DrawEntitiesOnList(); power.R_PowerupEnd(); same( power.R_PowerupStatus().pickups, 3, 'actual draw prepares live registry before map transition' );
		main.R_NewMap(); same( power.R_PowerupStatus().pickups, 0, 'actual public map reset clears pickup registry' ); check( main.scene.children.every( child => ! child.name.startsWith( 'powerup_' ) ), 'actual map reset leaves no orphan pickup groups' );

	} finally { anim.R_AnimSetClassicPass( false ); power.R_PowerupClear(); client.cl.worldmodel = savedWorld; client.cl.viewent = savedView; client.cl_visedicts.splice( 0, client.cl_visedicts.length, ...savedList ); client.set_cl_numvisedicts( savedCount ); }

} );

Deno.test( 'real native PAK pickup aliases retain positions, UVs, indices and skin data under effect attachment', () => {

	setup(); const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.byteLength ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
	const scene = new THREE.Scene();
	try {

		for ( const name of [ 'progs/quaddama.mdl', 'progs/invulner.mdl', 'progs/invisibl.mdl' ] ) {

			const entity = new entity_t(); entity.model = Mod_ForName( name, true ); entity.origin.set( [ 30, 50, 20 ] );
			const mesh = R_DrawAliasModel( entity, entity.model.cache.data ); check( mesh instanceof THREE.Mesh, 'actual native alias draws' ); scene.add( mesh );
			const original = Object.entries( mesh.geometry.attributes ).map( ( [ key, a ] ) => [ key, a, a.array.slice() ] ), index = mesh.geometry.index, indexBytes = index.array.slice(), skin = mesh.material.map, skinBytes = skin.image.data.slice(), origin = Array.from( entity.origin );
			frame( scene, [ { entity, mesh } ] );
			if ( name === 'progs/invulner.mdl' ) {

				const group = scene.children.find( child => child.name === 'powerup_pentagram' ), shroud = group.children.find( child => child.name.endsWith( '_shroud' ) );
				group.updateMatrixWorld( true ); mesh.updateMatrixWorld( true ); const origin = shroud.getWorldPosition( new THREE.Vector3() );
				for ( let azimuth = 0; azimuth < Math.PI * 2; azimuth += Math.PI / 4 ) for ( const elevation of [ -1.4, -.7, 0, .7, 1.4 ] ) {

					const camera = new THREE.PerspectiveCamera(); camera.up.set( 0, 0, 1 ); camera.position.copy( group.position ).add( new THREE.Vector3( Math.cos( azimuth ) * Math.cos( elevation ), Math.sin( azimuth ) * Math.cos( elevation ), Math.sin( elevation ) ).multiplyScalar( 250 ) ); camera.lookAt( group.position ); camera.updateMatrixWorld();
					const behindZ = origin.clone().applyMatrix4( camera.matrixWorldInverse ).z - shroud.material.uniforms.uBehind.value, positions = mesh.geometry.attributes.position;
					for ( let vertex = 0; vertex < positions.count; vertex ++ ) {

						const point = new THREE.Vector3().fromBufferAttribute( positions, vertex ).applyMatrix4( mesh.matrixWorld ).applyMatrix4( camera.matrixWorldInverse ); check( point.z > behindZ + 1, 'black shroud lies beyond every native vertex from front/back/oblique/above/below' );

					}

				}

			}
			for ( const [ key, a, bytes ] of original ) { same( mesh.geometry.getAttribute( key ), a, 'native model attribute identity' ); check( bytes.every( ( v, i ) => v === a.array[ i ] ), 'native model attribute bytes' ); }
			same( mesh.geometry.index, index, 'native triangle index identity' ); check( indexBytes.every( ( v, i ) => v === index.array[ i ] ), 'native triangles unchanged' ); same( mesh.material.map, skin, 'native skin identity unchanged' ); check( skinBytes.every( ( v, i ) => v === skin.image.data[ i ] ), 'original pigment bytes unchanged' ); same( Array.from( entity.origin ).join(), origin.join(), 'native gameplay position unchanged' );

		}

	} finally { power.R_PowerupClear(); }

} );

Deno.test( 'actual post-frame snapshot retains ring cookie slot and live-light radiance while lighting-off disables its compositor path', () => {

	setup(); const controls = [ post.r_dynres, post.r_bloom, post.r_volumetric, post.r_bounce, post.r_pointshadows, height.r_heightshadows, anim.r_newer_lighting, anim.r_newer_normals, anim.r_newer_water ];
	for ( const variable of controls ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
	const saved = controls.map( variable => variable.string );
	let target = null; const viewport = new THREE.Vector4( 0, 0, 320, 200 ), color = new THREE.Color();
	const renderer = { autoClear: false, xr: { enabled: false }, capabilities: { isWebGL2: true }, extensions: { has: () => true }, draws: [], getRenderTarget: () => target, setRenderTarget: value => { target = value; }, getViewport: out => out.copy( viewport ), setViewport() {}, getScissor: out => out.copy( viewport ), setScissor() {}, getScissorTest: () => false, setScissorTest() {}, getClearColor: out => out.copy( color ), getClearAlpha: () => 1, setClearColor() {}, clear() {}, render( scene ) { this.draws.push( scene.children[ 0 ]?.material ); } };
	const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera( 60, 1.6, 1, 1000 ); camera.updateMatrixWorld();
	try {

		for ( const [ name, value ] of Object.entries( { r_dynres: 0, r_bloom: 0, r_volumetric: 0, r_bounce: 0, r_pointshadows: 0, r_heightshadows: 1, r_newer_lighting: 1, r_newer_normals: 1, r_newer_water: 0 } ) ) vars.Cvar_SetValue( name, value );
		post.R_BuildWorldLights( { nodes: [ { contents: -1, visframe: 1 } ], entities: '', surfaces: [] } ); frame( scene, [ item(), item( 'progs/invisibl.mdl', [ 25, 0, -50 ] ) ] );
		for ( const lighting of [ 1, 0 ] ) {

			vars.Cvar_SetValue( 'r_newer_lighting', lighting ); post.R_PostBegin( renderer, true, 320, 200 ); post.R_PostBind( renderer );
			const snapshot = post.R_PostLightsFrame( renderer, scene, camera, 1, [], [], 2, false );
			const frozenRotation = snapshot.lights.find( light => light.source?.powerup === 'ring' ), originalRotation = frozenRotation?.source.rotation.slice();
			if ( frozenRotation ) { frozenRotation.source.rotation[ 0 ] = .75; same( frozenRotation.powerupRotation.join(), originalRotation.join(), 'frame captures independent ring orientation before subsequent entity mutation' ); }
			post.R_PostFinish( renderer, scene, camera, { lx: 0, ly: 0, lw: 320, lh: 200 }, 1, [], [], 2, 1, false );
			const composite = renderer.draws.at( -1 ), ringSlot = snapshot.lights.findIndex( light => light.source?.powerup === 'ring' );
			if ( lighting ) { check( ringSlot >= 0, 'actual frozen light snapshot retains ring identity' ); same( composite.uniforms.uLightCookie.value[ ringSlot ], 1, 'actual composite cookie array uses same ring slot' ); same( composite.uniforms.uLightRotation.value[ ringSlot ].toArray().join(), snapshot.lights[ ringSlot ].powerupRotation.join(), 'exact frozen ring orientation reaches same compositor slot' ); }
			else { same( snapshot.lights.length, 0, 'lighting-off excludes all pickup sources from frozen frame' ); same( composite.uniforms.uCount.value, 0, 'lighting-off composite has no active cookie slots' ); }
			for ( let i = 0; i < snapshot.lights.length; i ++ ) same( composite.uniforms.uLightCol.value[ i ].toArray().slice( 0, 3 ).join(), snapshot.lights[ i ].color.join(), 'frozen radiance arrives in exact compositor slot' );
			same( composite.uniforms.uLighting.value, lighting, 'lighting toggle reaches actual compositor gate' );
			check( composite.fragmentShader.includes( 'powerupFlameCookie(powerupLocalDirection(direction,uLightRotation[index]),uPowerupTime)' ) && composite.fragmentShader.includes( 'uLighting > 0.5' ), 'actual generated compositor evaluates cookie in frozen item orientation inside lighting-controlled rendering' );
			if ( frozenRotation ) frozenRotation.source.rotation.splice( 0, 4, ...originalRotation );

		}

	} finally { post.R_PostBegin( renderer, false, 320, 200 ); height.R_HeightShadowScope( false ); controls.forEach( ( variable, i ) => vars.Cvar_Set( variable.name, saved[ i ] ) ); power.R_PowerupClear(); }

} );

Deno.test( 'visible pentagram metadata includes all shrouds beyond eight lights and exact camera-space billboard geometry without native mutation', () => {

	setup(); const scene = new THREE.Scene(), entries = Array.from( { length: 12 }, ( _, i ) => item( 'progs/invulner.mdl', [ ( i - 6 ) * 14, 0, -80 ] ) );
	const camera = new THREE.PerspectiveCamera( 60, 1, 1, 1000 ); camera.position.set( 40, 80, 110 ); camera.up.set( 0, 0, 1 ); camera.lookAt( 0, 0, -80 ); camera.updateMatrixWorld();
	const before = entries.map( entry => entry.mesh.geometry.attributes.position.array.slice() );
	try {

		frame( scene, entries, 3.25 ); scene.updateMatrixWorld( true ); const result = power.R_PowerupShroudFrame( scene, camera );
		same( result.count, 12, 'all visible shrouds survive beyond eight-light selection capacity' ); same( result.texture.image.width, 2, 'two float texels per shroud' ); check( result.texture.image.height >= 12, 'metadata capacity covers actual visible set' );
		same( result.texture.type, THREE.FloatType, 'world/camera metadata retains float precision' ); same( result.texture.minFilter, THREE.NearestFilter, 'metadata never interpolates shroud records' );
		const groups = scene.children.filter( group => group.name === 'powerup_pentagram' );
		groups.forEach( ( group, i ) => {

			const shroud = group.children.find( child => child.name.endsWith( '_shroud' ) ), uniforms = shroud.material.uniforms, expected = shroud.getWorldPosition( new THREE.Vector3() ).applyMatrix4( camera.matrixWorldInverse );
			const values = [ expected.x, expected.y, expected.z - uniforms.uBehind.value, uniforms.uSize.value.x, uniforms.uSize.value.y, 3.25 ];
			values.forEach( ( value, j ) => same( result.texture.image.data[ i * 8 + j ], Math.fround( value ), 'exact public billboard metadata coordinate' ) );
			check( before[ i ].every( ( value, j ) => value === entries[ i ].mesh.geometry.attributes.position.array[ j ] ), 'metadata never edits native positions' );

		} );

	} finally { power.R_PowerupClear(); }

} );

Deno.test( 'shroud metadata resets for hidden object/ancestor, feature-off, Classic, collection and map clear', () => {

	setup(); const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), one = item( 'progs/invulner.mdl' ); camera.updateMatrixWorld();
	try {

		frame( scene, [ one ] ); const group = scene.children[ 0 ], shroud = group.children.find( child => child.name.endsWith( '_shroud' ) ), initial = power.R_PowerupShroudFrame( scene, camera ); same( initial.count, 1, 'visible metadata present' );
		const empty = reason => { const result = power.R_PowerupShroudFrame( scene, camera ); same( result.count, 0, reason + ' count cleared' ); same( result.texture, null, reason + ' cannot bind stale texture' ); };
		group.visible = false; empty( 'hidden group' ); group.visible = true; shroud.visible = false; empty( 'hidden shroud mesh' ); shroud.visible = true;
		scene.visible = false; empty( 'hidden scene ancestor' ); scene.visible = true;
		vars.Cvar_SetValue( 'r_powerups', 0 ); empty( 'feature off' ); vars.Cvar_SetValue( 'r_powerups', 1 );
		anim.R_AnimSetClassicPass( true ); empty( 'Classic redraw' ); anim.R_AnimSetClassicPass( false ); same( power.R_PowerupShroudFrame( scene, camera ).count, 1, 'Classic leaves enhanced record available afterward' );
		frame( scene, [] ); empty( 'collected or invisible entity' ); frame( scene, [ one ] ); const texture = power.R_PowerupShroudFrame( scene, camera ).texture; let disposed = 0; texture.addEventListener( 'dispose', () => disposed ++ );
		power.R_PowerupClear(); empty( 'map clear' ); same( disposed, 1, 'map clear disposes metadata GPU texture exactly once' );

	} finally { anim.R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_powerups', 1 ); power.R_PowerupClear(); }

} );

Deno.test( 'native yaw and actual model matrices drive local fire volume and ring orientation without camera or Classic drift', () => {

	setup(); const scene = new THREE.Scene();
	const nearVector = ( actual, expected, label ) => check( actual.distanceTo( expected ) < 1e-5, label + ': ' + actual.toArray() + ' != ' + expected.toArray() );
	try {

		for ( const name of [ 'progs/quaddama.mdl', 'progs/invulner.mdl', 'progs/invisibl.mdl' ] ) {

			const entity = new entity_t(); entity.model = Mod_ForName( name, true ); entity.origin.set( [ 17, -43, 29 ] ); let mesh;
			for ( const yaw of [ 0, 90, 180 ] ) {

				entity.angles[ 1 ] = yaw; mesh = R_DrawAliasModel( entity, entity.model.cache.data ); if ( mesh.parent !== scene ) scene.add( mesh );
				const nativePosition = mesh.geometry.attributes.position.array.slice(), nativeUvs = mesh.geometry.attributes.uv.array.slice();
				frame( scene, [ { entity, mesh } ], 2 ); const group = scene.children.find( child => child.name === 'powerup_' + power.R_PowerupKind( entity ) ); scene.updateMatrixWorld( true );
				const nativeCenter = mesh.geometry.boundingBox.getCenter( new THREE.Vector3() ), nativeWorldNormal = new THREE.Vector3( 1, 0, 0 ).transformDirection( mesh.matrixWorld );
				nearVector( new THREE.Vector3( 1, 0, 0 ).transformDirection( group.matrixWorld ), nativeWorldNormal, 'effect local YZ normal follows native yaw ' + yaw );
				const flames = group.children.find( child => child.name.endsWith( '_flames' ) );
				if ( flames ) {

					same( flames.material.side, THREE.BackSide, 'volume exit faces support both outside and inside cameras' );
					check( flames.layers.isEnabled( fire.POWERUP_FIRE_LAYER ) && ! flames.layers.isEnabled( 0 ), 'master volume excluded from the main opaque scene draw' );
					check( flames.material.fragmentShader.includes( 'for(int i=0;i<40;i++)' ) && flames.material.fragmentShader.includes( 'densityAt(p)' ), 'actual shader integrates bounded three-dimensional density along view ray' );
					const attributes = flames.geometry.attributes;
					for ( let vertex = 0; vertex < attributes.position.count; vertex ++ ) {

						const local = new THREE.Vector3().fromBufferAttribute( attributes.position, vertex );
						const actual = local.clone().applyMatrix4( flames.matrixWorld ), expected = local.clone().add( flames.position ).add( nativeCenter ).applyMatrix4( mesh.matrixWorld ); nearVector( actual, expected, 'flame corner tracks actual native item geometry' );

					}

				}
				const rotation = new THREE.Quaternion().fromArray( power.R_PowerupLights()[ 0 ].rotation );
				nearVector( new THREE.Vector3( 1, 0, 0 ).applyQuaternion( rotation ), nativeWorldNormal, 'source orientation follows same actual native matrix' );
				const saved = group.matrixWorld.clone(), camera = new THREE.PerspectiveCamera();
				for ( const position of [ [ 300, 0, 20 ], [ -100, 250, 200 ], [ 0, 0, 500 ] ] ) { camera.position.set( ...position ); camera.lookAt( group.position ); camera.updateMatrixWorld(); power.R_PowerupShroudFrame( scene, camera ); same( group.matrixWorld.elements.join(), saved.elements.join(), 'camera metadata cannot rotate native-plane flames' ); }
				anim.R_AnimSetClassicPass( true ); power.R_PowerupBegin( scene ); power.R_PowerupSeen( entity, mesh, scene, 99 ); power.R_PowerupEnd(); anim.R_AnimSetClassicPass( false ); same( group.matrixWorld.elements.join(), saved.elements.join(), 'Classic helper cannot drift enhanced effect orientation' );
				check( nativePosition.every( ( value, i ) => value === mesh.geometry.attributes.position.array[ i ] ) && nativeUvs.every( ( value, i ) => value === mesh.geometry.attributes.uv.array[ i ] ), 'rotating effect does not edit native model positions or UVs' );

			}
			// Explicit renderer-owned matrix with intentionally stale local pose:
			// reading mesh.quaternion here would incorrectly lock effects to zero.
			mesh.matrixAutoUpdate = false; mesh.quaternion.identity(); mesh.scale.setScalar( 1 );
			const expectedRotation = new THREE.Quaternion().setFromEuler( new THREE.Euler( .3, -.4, 1.1 ) ), expectedScale = new THREE.Vector3( 1.2, 1.2, 1.2 );
			mesh.matrix.compose( new THREE.Vector3( ...entity.origin ), expectedRotation, expectedScale ); mesh.updateMatrixWorld( true ); frame( scene, [ { entity, mesh } ] );
			const group = scene.children.find( child => child.name === 'powerup_' + power.R_PowerupKind( entity ) ); nearVector( new THREE.Vector3( 0, 1, 0 ).applyQuaternion( group.quaternion ), new THREE.Vector3( 0, 1, 0 ).applyQuaternion( expectedRotation ), 'actual matrix wins over stale quaternion' ); nearVector( group.scale, expectedScale, 'actual matrix scale follows native item' );
			mesh.matrixAutoUpdate = true;

		}

	} finally { anim.R_AnimSetClassicPass( false ); power.R_PowerupClear(); }

} );

Deno.test( 'volumetric fuel distances match independent native triangle geometry and coating preserves the complete Q and pentagram topology', () => {

	setup(); const scene = new THREE.Scene();
	try {

		for ( const name of [ 'progs/quaddama.mdl', 'progs/invulner.mdl' ] ) {

			const entity = new entity_t(); entity.model = Mod_ForName( name, true ); const mesh = R_DrawAliasModel( entity, entity.model.cache.data ); scene.add( mesh );
			const geometry = mesh.geometry, positions = geometry.attributes.position, indices = geometry.index.array, originalPositions = positions.array.slice(), originalIndices = indices.slice(), originalUv = geometry.attributes.uv.array.slice();
			frame( scene, [ { entity, mesh } ] );
			const group = scene.children.find( child => child.name === 'powerup_' + power.R_PowerupKind( entity ) ), flames = group.children.find( child => child.name.endsWith( '_flames' ) ), surface = group.children.find( child => child.name.endsWith( '_surface' ) );
			const center = geometry.boundingBox.getCenter( new THREE.Vector3() ), field = flames.material.uniforms.uEmitterDistance.value, bounds = flames.material.uniforms.uFieldBounds.value, triangles = [], segments = [];
			// Independent Three geometric predicates, rather than a port of the
			// production barycentric/segment-distance arithmetic.
			for ( let i = 0; i < indices.length; i += 3 ) {

				const vertices = [ 0, 1, 2 ].map( k => new THREE.Vector3( 0, positions.getY( indices[ i + k ] ) - center.y, positions.getZ( indices[ i + k ] ) - center.z ) );
				triangles.push( new THREE.Triangle( ...vertices ) ); for ( const [ a, b ] of [ [ 0, 1 ], [ 1, 2 ], [ 2, 0 ] ] ) segments.push( new THREE.Line3( vertices[ a ], vertices[ b ] ) );

			}
			same( field.image.width, 96, 'bounded scalar distance field resolution' ); same( field.format, THREE.RedFormat, 'fuel texture contains scalar distance, not painted color or opacity' );
			let inside = 0, outside = 0; const sample = new THREE.Vector3(), closest = new THREE.Vector3();
			for ( let z = 0; z < field.image.height; z += 2 ) for ( let y = 0; y < field.image.width; y += 2 ) {

				sample.set( 0, bounds.x + ( y + .5 ) / field.image.width * bounds.z, bounds.y + ( z + .5 ) / field.image.height * bounds.w );
				let expected = triangles.some( triangle => triangle.containsPoint( sample ) ) ? 0 : Infinity;
				if ( expected !== 0 ) for ( const edge of segments ) expected = Math.min( expected, ( edge.start.equals( edge.end ) ? edge.start : edge.closestPointToPoint( sample, true, closest ) ).distanceTo( sample ) );
				const actual = THREE.DataUtils.fromHalfFloat( field.image.data[ z * field.image.width + y ] );
				check( Math.abs( actual - expected ) <= Math.max( .001, expected * .001 ), `sampled native fuel distance ${name} at ${y},${z}: ${actual} versus ${expected}` );
				if ( expected === 0 ) inside ++; else outside ++;

			}
			check( inside > 50 && outside > 50, 'oracle exercises both real solid fuel and actual negative space' );
			same( flames.material.uniforms.uNativeX.value.x, geometry.boundingBox.min.x - center.x, 'native model thickness supplies near side of 3D fuel' ); same( flames.material.uniforms.uNativeX.value.y, geometry.boundingBox.max.x - center.x, 'native model thickness supplies far side of 3D fuel' );
			check( surface.geometry !== geometry && surface.geometry.attributes.position !== positions, 'effect coating owns a clone, not native buffers' );
			same( surface.geometry.index.count, geometry.index.count, 'coating retains every native triangle including inner pentagram bars' );
			check( originalIndices.every( ( value, i ) => value === surface.geometry.index.array[ i ] ), 'complete native triangle connectivity retained exactly' );
			for ( let i = 0; i < positions.count; i ++ ) {

				const expected = new THREE.Vector3().fromBufferAttribute( positions, i ).sub( center ), actual = new THREE.Vector3().fromBufferAttribute( surface.geometry.attributes.position, i ); check( actual.distanceTo( expected ) < 1e-5, 'surface coating is exactly the centred native glyph, no circular proxy or new bars' );

			}
			same( surface.material.uniforms.uMode.value, 3, 'coating uses native-surface emission mode' ); check( surface.material.polygonOffset && ! surface.material.depthWrite, 'coating avoids z fighting and cannot replace receiver depth' );
			same( surface.material.uniforms.uSurfaceMap.value, mesh.material.map, 'surface coating samples original native pigment instead of a solid replacement image' );
			check( originalPositions.every( ( value, i ) => value === positions.array[ i ] ) && originalIndices.every( ( value, i ) => value === indices[ i ] ) && originalUv.every( ( value, i ) => value === geometry.attributes.uv.array[ i ] ), 'edge sampling and coating leave all native positions, topology and UVs untouched' );

		}

	} finally { power.R_PowerupClear(); }

} );

Deno.test( 'replacement native position or index buffers rebuild owned emissions without disposing the native model', () => {

	setup(); const scene = new THREE.Scene(), one = item();
	try {

		frame( scene, [ one ] ); let group = scene.children[ 0 ]; let nativeDisposals = 0; one.mesh.geometry.addEventListener( 'dispose', () => nativeDisposals ++ );
		for ( const replacement of [ 'position', 'index' ] ) {

			const previous = group; let disposed = 0; for ( const child of previous.children ) child.geometry.addEventListener( 'dispose', () => disposed ++ );
			if ( replacement === 'position' ) one.mesh.geometry.setAttribute( 'position', one.mesh.geometry.attributes.position.clone() ); else one.mesh.geometry.setIndex( one.mesh.geometry.index.clone() );
			frame( scene, [ one ] ); group = scene.children[ 0 ]; check( group !== previous && previous.parent === null, 'native ' + replacement + ' identity change replaces stale emission geometry' ); same( disposed, previous.children.length, 'all superseded owned geometries disposed once' ); same( nativeDisposals, 0, 'native model resource remains owned by renderer' );

		}

	} finally { power.R_PowerupClear(); }

} );

Deno.test( 'volume renderer separates emission from opaque depth, follows resolution and camera projection, and restores all state on failure', () => {

	// Endpoint double only: GPU opacity/occlusion is measured by the browser
	// trial. Real Three resources exercise target ownership and disposal here.
	const geometry = new THREE.BoxGeometry( 4, 18, 25 ); geometry.computeBoundingBox();
	const glyphPlanes = new THREE.DataTexture( new Float32Array( [ 1, 0, 0, 1 ] ), 1, 1, THREE.RGBAFormat, THREE.FloatType );
	const volume = fire.R_CreatePowerupFire( geometry, geometry.boundingBox.getCenter( new THREE.Vector3() ), [ 2, 1, .1 ], glyphPlanes, 1 );
	const sourceScene = new THREE.Scene(); sourceScene.add( volume.mesh ); volume.mesh.position.set( 17, -30, 12 ); volume.mesh.rotation.z = .7; sourceScene.updateMatrixWorld( true );
	const original = new THREE.WebGLRenderTarget( 32, 20 ), target = new THREE.WebGLRenderTarget( 320, 200, { depthTexture: new THREE.DepthTexture( 320, 200, THREE.UnsignedIntType ) } ), small = new THREE.WebGLRenderTarget( 160, 100, { depthTexture: new THREE.DepthTexture( 160, 100, THREE.UnsignedIntType ) } );
	let current = original, scissor = true, alpha = .7, capturedTarget, capturedScene, throws = false, rendered = 0; const color = new THREE.Color( .12, .34, .56 ), originalColor = color.clone();
	const renderer = { isWebGLRenderer: true, autoClear: true, getRenderTarget: () => current, setRenderTarget: value => { current = value; }, getScissorTest: () => scissor, setScissorTest: value => { scissor = value; }, getClearAlpha: () => alpha, getClearColor: value => value.copy( color ), setClearColor: ( value, a ) => { color.set( value ); alpha = a; }, clear( c, d, s ) { check( c && ! d && ! s, 'emission clear cannot erase borrowed opaque depth' ); }, render( scene, camera ) {

		capturedTarget = current; capturedScene = scene; rendered ++; same( scene.children.length, 1, 'exactly one owned proxy draw' );
		check( current !== target && current !== small, 'volume never writes the scene HDR framebuffer it samples' ); same( current.depthBuffer, false, 'emission target has no depth attachment feedback' ); same( current.texture.type, THREE.HalfFloatType, 'emission uses HDR radiance target' );
		scene.updateMatrixWorld( true ); volume.proxy.onBeforeRender( renderer, scene, camera );
		if ( throws ) throw new Error( 'injected volume render failure' );

	} };
	const camera = new THREE.PerspectiveCamera( 60, 1.6, 1, 1000 ); camera.position.set( 0, -80, 50 ); camera.lookAt( 0, 0, 0 ); camera.updateMatrixWorld();
	const restored = () => { same( current, original, 'caller framebuffer restored' ); same( renderer.autoClear, true, 'caller autoClear restored' ); same( scissor, true, 'caller scissor restored' ); same( alpha, .7, 'caller clear alpha restored' ); same( color.toArray().join(), originalColor.toArray().join(), 'caller clear color restored' ); same( volume.proxy.parent, null, 'temporary proxy scene membership released' ); same( volume.mesh.parent, sourceScene, 'native effect owner membership untouched' ); };
	try {

		fire.R_ClearPowerupFireTarget(); const first = fire.R_RenderPowerupFire( renderer, camera, target, [ volume ] ); same( first.count, 1, 'one actual scheduled volume' ); same( first.texture, capturedTarget.texture, 'returned emission texture belongs to actual draw target' ); same( capturedTarget.width, 320, 'matching scene-raster width' ); same( capturedTarget.height, 200, 'matching scene-raster height' );
		same( volume.mesh.material.uniforms.uOpaqueDepth.value, target.depthTexture, 'sampled original resolved opaque depth' ); same( volume.mesh.material.uniforms.uResolution.value.toArray().join(), '320,200', 'fragment coordinates use exact scene raster' ); same( volume.mesh.material.uniforms.uOrthographic.value, 0, 'perspective rays originate at eye' );
		const expected = volume.mesh.matrixWorld.clone().premultiply( camera.matrixWorldInverse ).invert(); same( volume.mesh.material.uniforms.uViewToLocal.value.elements.join(), expected.elements.join(), 'ray transform uses actual model/view matrices' ); restored();
		let retired = 0; capturedTarget.addEventListener( 'dispose', () => retired ++ );
		const orthographic = new THREE.OrthographicCamera( -80, 80, 50, -50, .1, 1000 ); orthographic.position.copy( camera.position ); orthographic.quaternion.copy( camera.quaternion ); orthographic.updateMatrixWorld();
		fire.R_RenderPowerupFire( renderer, orthographic, small, [ volume ] ); same( retired, 1, 'resolution change retires only old emission target' ); same( capturedTarget.width, 160, 'reduced raster width follows actual scene' ); same( capturedTarget.height, 100, 'reduced raster height follows actual scene' ); same( volume.mesh.material.uniforms.uOpaqueDepth.value, small.depthTexture, 'resized frame samples matching scene depth' ); same( volume.mesh.material.uniforms.uOrthographic.value, 1, 'orthographic path uses parallel per-pixel origins' ); restored();
		throws = true; let error; try { fire.R_RenderPowerupFire( renderer, camera, target, [ volume ] ); } catch ( e ) { error = e; } check( error?.message === 'injected volume render failure', 'original draw failure propagated' ); same( capturedScene.children.length, 0, 'failure clears temporary proxy scene' ); restored(); throws = false;
		const count = rendered; same( fire.R_RenderPowerupFire( renderer, camera, target, [] ), null, 'empty frame does not expose previous emission image' ); same( fire.R_RenderPowerupFire( renderer, camera, {}, [ volume ] ), null, 'missing opaque depth does not draw an unoccluded substitute' ); same( fire.R_RenderPowerupFire( { ...renderer, isWebGLRenderer: false }, camera, target, [ volume ] ), null, 'non-GPU caller safely skips volume' ); same( rendered, count, 'unsupported/empty calls perform zero draws' ); restored();

	} finally { fire.R_ClearPowerupFireTarget(); volume.field.dispose(); glyphPlanes.dispose(); volume.mesh.geometry.dispose(); volume.mesh.material.dispose(); geometry.dispose(); original.dispose(); target.dispose(); small.dispose(); }

} );
