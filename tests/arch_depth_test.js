// Public native BSP/server/crossing/receiver interfaces. No replacement arch
// geometry and no private crossing-state access.
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { COM_AddPack, COM_LoadPackFile, COM_FindFile } from '../src/engine/common/pak.js';
import { VID_SetPalette } from '../src/engine/render/vid.js';
import { Mod_Init } from '../src/engine/render/gl_model.js';
import { PR_InitBuiltins } from '../src/engine/server/pr_cmds.js';
import { PR_ExecuteProgram } from '../src/engine/progs/pr_exec.js';
import * as progs from '../src/engine/progs/progs.js';
import { sv, svs, client_t } from '../src/engine/server/server.js';
import { SV_SpawnServer } from '../src/engine/server/sv_main.js';
import { SV_Move, SV_LinkEdict, MOVE_NOMONSTERS } from '../src/engine/server/world.js';
import { SV_PushEntity, sv_gravity } from '../src/engine/server/sv_phys.js';
import * as travel from '../src/newer/gameplay/sv_seamless.js';
import * as arch from '../src/newer/render/r_archframe.js';
import * as vars from '../src/engine/common/cvar.js';
import { Cbuf_Init } from '../src/engine/common/cmd.js';
import { SZ_Alloc } from '../src/engine/common/common.js';
import { r_hdr } from '../src/newer/render/gl_post.js';
import { skill } from '../src/engine/server/host.js';
import { R_AnimSetClassicPass } from '../src/newer/mode.js';
import { R_SetupLevelViews, R_LevelViewCount, R_ClearLevelViews, LEVEL_VIEW_OFFSET } from '../src/newer/render/r_levelview.js';
import { R_LevelPortalMatrix, R_RenderPortals, R_PortalsBeginFrame, R_ClearPortals } from '../src/newer/render/gl_portal.js';
import * as main from '../src/engine/render/gl_rmain.js';
import * as surf from '../src/engine/render/gl_rsurf.js';
import { cl } from '../src/engine/client/client.js';
import { r_refdef, entity_t } from '../src/engine/render/render.js';
import { R_SaveClassicScene } from '../src/newer/render/r_classicstate.js';

const check = ( v, label ) => { if ( ! v ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} !== ${b}` );
const near = ( a, b, label, epsilon = .001 ) => check( Math.abs( a - b ) < epsilon, `${label}: ${a} != ${b}` );
const bytes = readFileSync( new URL( '../games/shareware/pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init(); PR_InitBuiltins(); Cbuf_Init();
for ( const value of [ r_hdr, skill, sv_gravity, travel.sv_seamless ] ) if ( ! vars.Cvar_FindVar( value.name ) ) vars.Cvar_RegisterVariable( value );

function spawn( map, reset = true ) {

	if ( reset ) { travel.SV_SeamlessReset(); svs.maxclients = 1; svs.clients = [ new client_t() ]; SZ_Alloc( svs.clients[ 0 ].message, 8192 ); }
	R_AnimSetClassicPass( false ); vars.Cvar_SetValue( 'r_hdr', 1 ); vars.Cvar_SetValue( 'sv_seamless', 1 ); vars.Cvar_SetValue( 'skill', 1 ); sv.active = false; SV_SpawnServer( map );
	const player = svs.clients[ 0 ].edict; progs.pr_global_struct.self = progs.EDICT_TO_PROG( player ); PR_ExecuteProgram( progs.pr_global_struct.SetNewParms ); PR_ExecuteProgram( progs.pr_global_struct.ClientConnect ); PR_ExecuteProgram( progs.pr_global_struct.PutClientInServer ); return player;

}
const dot = ( a, b ) => a.reduce( ( sum, value, i ) => sum + value * b[ i ], 0 );
function vertices( model, surface ) {

	return Array.from( { length: surface.numedges }, ( _, i ) => { const edge = model.surfedges[ surface.firstedge + i ]; return Array.from( model.vertexes[ model.edges[ Math.abs( edge ) ].v[ edge >= 0 ? 0 : 1 ] ].position ); } );

}
function walkAcross( player, crossing ) {

	const t = crossing.transform; player.v.origin = t.center.map( ( value, i ) => value - t.through[ i ] * 32 ); player.v.velocity = t.through.map( value => value * 120 ); player.v.v_angle = [ 7, Math.atan2( t.through[ 1 ], t.through[ 0 ] ) * 180 / Math.PI, 0 ];
	const valid = SV_Move( player.v.origin, player.v.mins, player.v.maxs, player.v.origin, MOVE_NOMONSTERS, player ); check( ! valid.startsolid, 'actual player hull fits before crossing' ); SV_LinkEdict( player, false ); travel.SV_SeamlessFrame();
	let steps = 0;
	for ( ; steps < 18 && ! travel.SV_SeamlessPending(); steps ++ ) {

		const trace = SV_PushEntity( player, t.through.map( value => value * 4 ) ); check( ! trace.startsolid, 'native movement never begins inside arch collision' ); sv.time += .1; travel.SV_SeamlessFrame();
		const distance = dot( Array.from( player.v.origin, ( value, axis ) => value - t.center[ axis ] ), t.through );
		if ( distance <= .000001 ) same( travel.SV_SeamlessPending(), null, 'native player cannot transfer before crossing the actual physical plane' );
		// The final small movement can stop against the retained wall just
		// AFTER crossing. That is valid only if the real frame queued transfer.
		check( trace.fraction === 1 || travel.SV_SeamlessPending()?.map === crossing.map, 'physical obstruction cannot stop the player before the actual crossing: ' + JSON.stringify( { steps, plane: t.center, end: Array.from( trace.endpos ), fraction: trace.fraction } ) );

	}
	const pending = travel.SV_SeamlessPending(); check( pending?.map === crossing.map, 'actual hull movement reaches crossing destination' );
	const relative = Array.from( player.v.origin, ( value, axis ) => value - t.center[ axis ] ), radians = t.yaw * Math.PI / 180, cosine = Math.cos( radians ), sine = Math.sin( radians );
	const expected = [ t.dest[ 0 ] + cosine * relative[ 0 ] - sine * relative[ 1 ], t.dest[ 1 ] + sine * relative[ 0 ] + cosine * relative[ 1 ], t.dest[ 2 ] + relative[ 2 ] ];
	expected.forEach( ( value, axis ) => near( pending.origin[ axis ], value, 'actual queued rigid transform uses the current physical plane, including advanced outgoing centre' ) );
	return steps;

}
function enterE1M3() {

	const player = spawn( 'e1m2' ), outgoing = travel.SV_SeamlessCrossings().find( value => value.map === 'e1m3' ); check( outgoing, 'native E1M2→E1M3 exit' );
	const source = arch.R_MeasureArchFrame( sv.worldmodel, outgoing.transform ); console.log( 'ARCH_SOURCE_MEASURE ' + JSON.stringify( { crossing: outgoing, measurement: source && { near: source.near, far: source.far, depth: source.depth, throat: source.throat, blockers: source.blockers.length } } ) );
	walkAcross( player, outgoing ); const arrival = spawn( 'e1m3', false ); travel.SV_SeamlessPlacePlayer( arrival ); svs.clients[ 0 ].spawned = true; travel.SV_SeamlessHolding( 1 ); sv.time += 5;
	const returning = travel.SV_SeamlessCrossings().find( value => value.back && value.map === 'e1m2' ); check( returning, 'native E1M3 return crossing' );
	const measured = arch.R_MeasureArchFrame( sv.worldmodel, returning.transform, true ); console.log( 'ARCH_RETURN_MEASURE ' + JSON.stringify( { crossing: returning, measurement: measured && { near: measured.near, far: measured.far, depth: measured.depth, throat: measured.throat, blockers: measured.blockers.map( surface => sv.worldmodel.surfaces.indexOf( surface ) ) } } ) );
	return { outgoing, source, player: arrival, returning, measured, model: sv.worldmodel };

}

Deno.test( 'outgoing native travel walks the32-unit arch to its far face while return travel retains the reachable near threshold', () => {

	const f = enterE1M3();
	check( f.source && f.measured, 'both real arches have agreed native throat measurements' ); near( f.source.depth, 32, 'source native frame depth', 1e-8 ); near( f.measured.depth, 32, 'return native frame depth', 1e-8 );
	same( f.outgoing.opening.shift.join(), '0,0,0', 'outgoing visual plane and physical threshold coincide' );
	near( f.source.far, .25, 'outgoing physical plane is quarter-unit inside actual measured far face', 1e-8 );
	near( f.source.near, -31.75, 'outgoing threshold lies beyond the full native frame thickness', 1e-8 );
	near( dot( f.returning.opening.shift, f.returning.transform.through ), f.measured.far - .25, 'return visual plane stays recessed to measured far boundary' );
	check( dot( f.returning.opening.shift, f.returning.transform.through ) > 20, 'only return physical threshold stays in front of retained bars and recessed image' );
	for ( const index of f.measured.throat ) {

		const surface = f.model.surfaces[ index ], depths = vertices( f.model, surface ).map( point => dot( point.map( ( value, i ) => value - f.returning.transform.center[ i ] ), f.returning.transform.through ) );
		near( Math.min( ...depths ), f.measured.near, 'real throat polygon starts at measured front marker' ); check( Math.max( ...depths ) <= f.measured.far + .001, 'BSP-split throat stays within measured frame extent' ); check( ! arch.R_ArchSurfaceHidden( surface ), 'jamb/header throat remains visible' );

	}
	const extentWitnesses = f.model.surfaces.flatMap( ( surface, index ) => {

		const points = vertices( f.model, surface ), local = points.map( point => point.map( ( value, i ) => value - f.returning.transform.center[ i ] ) );
		if ( ! local.length || local.some( point => Math.hypot( ...point ) > 400 ) ) return [];
		const depths = local.map( point => dot( point, f.returning.transform.through ) );
		return Math.abs( Math.min( ...depths ) - f.measured.near ) < .001 && Math.abs( Math.max( ...depths ) - f.measured.far ) < .001 ? [ index ] : [];

	} );
	check( extentWitnesses.length >= 3, 'at least three native frame polygons independently span the full32-unit thickness' );
	check( ! arch.R_ArchSurfaceHidden( f.model.surfaces[ 3735 ] ), 'native bevel continuation3735 remains visible' );
	const steps = walkAcross( f.player, f.returning ); check( steps <= 9, 'return threshold reached without passing through native bars or far wall' );
	console.log( 'ARCH_RETURN_REACH ' + JSON.stringify( { steps, physicalPlane: f.returning.transform.center, visualShift: f.returning.opening.shift } ) ); travel.SV_SeamlessReset(); Cbuf_Init();

} );

Deno.test( 'real return bars hide only in enhanced world/reflection batches, Classic scope restores them and collision remains identical', () => {

	main.R_Init(); const f = enterE1M3(), blockers = f.measured.blockers, hiddenBrushes = sv.edicts.filter( e => e && ! e.free && arch.R_ArchModelHidden( progs.PR_GetString( e.v.model ), sv.models[ e.v.modelindex ]?.surfaces ) );
	same( blockers.length, 14, 'exact native return-interior blocker population' ); same( blockers.map( surface => f.model.surfaces.indexOf( surface ) ).join(), '3733,3740,3741,3742,3743,3744,3747,3749,3751,3752,3753,3754,3756,3761', 'only reviewed native interior faces hidden' );
	const sourceGeometry = JSON.stringify( { vertices: f.model.vertexes.map( v => Array.from( v.position ) ), edges: Array.from( f.model.surfedges ), hulls: f.model.hulls } );
	const from = [ -736, -1596, 88 ], to = [ -736, -1500, 88 ];
	const collision = () => { const hit = SV_Move( from, f.player.v.mins, f.player.v.maxs, to, MOVE_NOMONSTERS, f.player ); return { fraction: hit.fraction, end: Array.from( hit.endpos ), entity: hit.ent?.index, startsolid: hit.startsolid }; };
	const hiddenCollision = collision(); check( hiddenCollision.fraction < 1 && ! hiddenCollision.startsolid, 'hidden interior retains actual solid collision' );
	cl.worldmodel = f.model; cl.model_precache[ 1 ] = f.model; cl.model_precache[ 2 ] = null; surf.GL_BuildLightmaps();
	main.set_r_visframecount( 701 ); for ( const leaf of f.model.leafs ) leaf.visframe = 701; for ( const node of f.model.nodes ) node.visframe = 701;
	for ( const plane of main.frustum ) { plane.normal.fill( 0 ); plane.dist = -1e9; plane.type = 3; plane.signbits = 0; }
	r_refdef.vieworg.set( from ); surf.R_DrawWorld();
	const batches = []; main.scene.traverse( object => { if ( object.isBatchedMesh ) batches.push( object ); } ); check( batches.length > 0, 'actual world creates real Three batched meshes' );
	const visibility = () => batches.flatMap( batch => Array.from( { length: batch.instanceCount }, ( _, i ) => batch.getVisibleAt( i ) ) );
	surf.R_WorldShowAll( true ); const enhanced = visibility(); same( enhanced.filter( visible => ! visible ).length, 14, 'reflection show-all cannot resurrect hidden world bars' );
	const restore = surf.R_ClassicArchVisibility(); try { same( visibility().filter( visible => ! visible ).length, 0, 'actual Classic batch scope restores all visible native bars' ); } finally { restore(); }
	same( visibility().join(), enhanced.join(), 'Classic scope restores exact previous enhanced batch visibility' );
	// Force failure partway through real public BatchedMesh visibility writes.
	const patched = batches.map( batch => [ batch, batch.setVisibleAt ] ); let calls = 0;
	for ( const [ batch, original ] of patched ) batch.setVisibleAt = function ( ...args ) { if ( ++calls === 3 ) throw new Error( 'injected Classic visibility failure' ); return original.apply( this, args ); };
	let failed = false; try { surf.R_ClassicArchVisibility(); } catch ( error ) { failed = error.message === 'injected Classic visibility failure'; } finally { for ( const [ batch, original ] of patched ) batch.setVisibleAt = original; }
	check( failed, 'fault reaches actual Classic scope mutation' ); same( visibility().join(), enhanced.join(), 'exception restores every partially toggled instance' );
	R_AnimSetClassicPass( true ); surf.R_WorldShowAll( true ); same( visibility().filter( visible => ! visible ).length, 0, 'Classic reflection show-all keeps original arch components' ); R_AnimSetClassicPass( false ); surf.R_WorldShowAll( true ); same( visibility().join(), enhanced.join(), 'next enhanced show-all restores exclusions without PVS motion' );
	// This particular arch's14 blockers are world polygons, not inline
	// entities. Exercise the separate public brush-presentation contract using
	// one actual native solid brush, explicitly tagged through its public API.
	const brushCandidates = hiddenBrushes.length ? hiddenBrushes : [ sv.edicts.find( e => e && ! e.free && e.v.solid === 4 && progs.PR_GetString( e.v.model ).startsWith( '*' ) ) ];
	check( brushCandidates[ 0 ], 'native map provides a real inline BSP for separate brush visibility contract' );
	for ( const edict of brushCandidates ) {

		const nativeModel = sv.models[ edict.v.modelindex ], name = progs.PR_GetString( edict.v.model ), otherSurfaces = nativeModel.surfaces.slice();
		arch.R_HideArchModel( name, nativeModel.surfaces );
		check( arch.R_ArchModelHidden( name, nativeModel.surfaces ), 'matching inline name and actual BSP identity is hidden' );
		check( ! arch.R_ArchModelHidden( name, otherSurfaces ), 'same inline name in another BSP surfaces array stays visible' );
		check( ! arch.R_ArchModelHidden( name ), 'missing BSP identity cannot inherit an old world exclusion' );
		const entity = new entity_t(); entity.model = sv.models[ edict.v.modelindex ]; entity.origin.set( edict.v.origin ); entity.angles.set( edict.v.angles ); main.set_currententity( entity ); surf.R_DrawBrushModel( entity );
		check( entity._brushGroup && ! entity._brushGroup.visible && entity._brushGroup.userData.archHidden, 'actual enhanced brush draw retains but hides matching inline brush' );
		const otherEntity = new entity_t(); otherEntity.model = { ...nativeModel, surfaces: otherSurfaces }; otherEntity.origin.set( edict.v.origin ); otherEntity.angles.set( edict.v.angles ); main.set_currententity( otherEntity ); surf.R_DrawBrushModel( otherEntity );
		check( otherEntity._brushGroup?.visible && ! otherEntity._brushGroup.userData.archHidden, 'public brush draw keeps same-named model from a different BSP visible' );
		main.set_currententity( entity );
		const geometry = entity._brushGroup.children.map( child => child.geometry ), restoreScene = R_SaveClassicScene( main.scene, cl.time );
		try { R_AnimSetClassicPass( true ); surf.R_DrawBrushModel( entity ); check( entity._brushGroup.visible, 'Classic public brush draw restores original inline bar' ); check( entity._brushGroup.children.every( ( child, i ) => child.geometry === geometry[ i ] ), 'Classic reuses original brush geometry' ); }
		finally { R_AnimSetClassicPass( false ); restoreScene(); }
		check( ! entity._brushGroup.visible, 'Classic scene restoration hides enhanced-only interior again' );

	}
	arch.R_ClearArchHidden(); same( JSON.stringify( collision() ), JSON.stringify( hiddenCollision ), 'clearing presentation exclusions changes no collision trace' );
	same( JSON.stringify( { vertices: f.model.vertexes.map( v => Array.from( v.position ) ), edges: Array.from( f.model.surfedges ), hulls: f.model.hulls } ), sourceGeometry, 'measurement and visibility leave native geometry/topology/hulls byte-values intact' );
	console.log( 'ARCH_VISIBILITY_NATIVE ' + JSON.stringify( { instances: enhanced.length, hidden: blockers.length, inlineBrushes: hiddenBrushes.map( e => progs.PR_GetString( e.v.model ) ), collision: hiddenCollision } ) ); travel.SV_SeamlessReset(); Cbuf_Init();

} );

Deno.test( 'public level-view source corners and oblique receiver clip use the same transformed measured far plane', async () => {

	const f = enterE1M3(), crossing = f.returning, t = crossing.transform, o = crossing.opening, scene = new THREE.Scene();
	try {

		R_ClearPortals(); R_SetupLevelViews( scene, [ crossing ] ); const deadline = performance.now() + 10000;
		while ( R_LevelViewCount() !== 1 && performance.now() < deadline ) await new Promise( resolve => setTimeout( resolve, 10 ) );
		same( R_LevelViewCount(), 1, 'actual public native receiver view built' ); const mesh = scene.getObjectByName( 'quake_level_portal' ); check( mesh, 'real public portal mesh created' );
		const positions = mesh.geometry.attributes.position, matrix = new THREE.Matrix4().fromArray( R_LevelPortalMatrix( 0 ) );
		for ( let i = 0; i < positions.count; i ++ ) {

			const point = new THREE.Vector3().fromBufferAttribute( positions, i ), delta = point.toArray().map( ( value, axis ) => value - t.center[ axis ] ); near( dot( delta, t.through ), f.measured.far - .25, 'actual portal vertex lies at real far frame boundary' );
			const expected = t.position( point.toArray() ).map( ( value, axis ) => value + LEVEL_VIEW_OFFSET[ axis ] ), actual = point.clone().applyMatrix4( matrix ); expected.forEach( ( value, axis ) => near( actual.getComponent( axis ), value, 'portal rigid transform preserves far-plane correspondence', .005 ) );

		}
		const camera = new THREE.PerspectiveCamera( 65, 1.6, 1, 4096 ); camera.up.set( 0, 0, 1 ); camera.position.set( ...t.center.map( ( value, axis ) => value - t.through[ axis ] * 80 + ( axis === 2 ? 22 : 0 ) ) ); camera.lookAt( ...t.center.map( ( value, axis ) => value + o.shift[ axis ] ) ); camera.updateMatrixWorld();
		let target = null, receiverCamera = null; const renderer = { getRenderTarget: () => target, setRenderTarget: value => { target = value; }, getClearColor: value => value.set( 0 ), getClearAlpha: () => 1, setClearColor() {}, clear() {}, render( receiverScene, view ) { same( receiverScene, scene, 'actual receiver scene used' ); receiverCamera = { view: view.matrixWorldInverse.clone(), projection: view.projectionMatrix.clone() }; } };
		R_PortalsBeginFrame( true ); mesh.onBeforeRender(); same( R_RenderPortals( renderer, scene, camera, 640, 400, 1, [] ), 1, 'public renderer schedules actual far-plane receiver once' ); check( receiverCamera, 'actual oblique receiver camera observed' );
		for ( let i = 0; i < positions.count; i ++ ) {

			const clip = new THREE.Vector3().fromBufferAttribute( positions, i ).applyMatrix4( matrix ).applyMatrix4( receiverCamera.view ).applyMatrix4( receiverCamera.projection ); near( clip.z, -1, 'transformed visible aperture is exactly the actual oblique near plane', 1e-5 );

		}
		const physical = new THREE.Vector3( ...t.center ).applyMatrix4( matrix ).applyMatrix4( receiverCamera.view ).applyMatrix4( receiverCamera.projection ); check( physical.z < -1.01, 'old near physical threshold is clipped, not mistaken for visible receiver plane' );

	} finally { R_ClearLevelViews(); travel.SV_SeamlessReset(); Cbuf_Init(); }

} );

Deno.test( 'arch measurement follows changed geometric thickness and refuses unrelated unmarked surfaces', () => {

	const f = enterE1M3(), center = f.returning.transform.center;
	for ( const scale of [ .5, 1.5 ] ) {

		// Diagnostic geometry derived from the actual native frame, scaled
		// uniformly around the crossing. This independently proves32 is measured
		// from geometry rather than silently assumed by the implementation.
		const model = { ...f.model, vertexes: f.model.vertexes.map( vertex => ( { ...vertex, position: Float32Array.from( vertex.position, ( value, axis ) => center[ axis ] + scale * ( value - center[ axis ] ) ) } ) ), surfaces: f.model.surfaces.map( surface => ( { ...surface, plane: { ...surface.plane, dist: surface.plane.dist * scale + ( 1 - scale ) * dot( Array.from( surface.plane.normal ), center ) } } ) ) };
		const result = arch.R_MeasureArchFrame( model, f.returning.transform, true ); check( result, 'scaled native arch still has agreeing structural geometry' ); near( result.depth, 32 * scale, 'measured depth follows actual vertex scale', 1e-8 ); near( dot( result.opening.shift, f.returning.transform.through ), 44 * scale - .25, 'visible far plane follows changed geometry with fixed antizfight offset', 1e-8 );

	}
	const unmarked = { ...f.model, surfaces: f.model.surfaces.map( surface => ( { ...surface, texinfo: { ...surface.texinfo, texture: { name: 'unmarked_stone' } } } ) ) };
	same( arch.R_MeasureArchFrame( unmarked, f.returning.transform, true ), null, 'unmarked room does not invent an arch from nearby arbitrary walls' ); same( arch.R_MeasureArchFrame( f.model, { ...f.returning.transform, kind: 'pit' }, true ), null, 'pit crossing does not acquire a guessed doorway depth' ); travel.SV_SeamlessReset(); Cbuf_Init();

} );

Deno.test( 'every offered native E1 plane return is measured after actual forward travel without inventing routes', () => {

	const rows = [];
	for ( const [ source, destination ] of [ [ 'e1m2', 'e1m3' ], [ 'e1m3', 'e1m4' ], [ 'e1m4', 'e1m5' ] ] ) {

		const player = spawn( source ), forward = travel.SV_SeamlessCrossings().find( c => ! c.back && c.map === destination ); check( forward, source + ' actual forward crossing exists' );
		const forwardFrame = arch.R_MeasureArchFrame( sv.worldmodel, forward.transform ); check( forwardFrame, source + ' native forward frame measured' ); near( forwardFrame.depth, 32, source + ' native outgoing frame depth' );
		const steps = walkAcross( player, forward );
		const arrival = spawn( destination, false ); travel.SV_SeamlessPlacePlayer( arrival ); svs.clients[ 0 ].spawned = true; travel.SV_SeamlessHolding( 1 ); sv.time += 5;
		const inverse = travel.SV_SeamlessCrossings().find( c => c.back && c.map === source ), measured = inverse && arch.R_MeasureArchFrame( sv.worldmodel, inverse.transform, true );
		check( inverse && measured, destination + ' existing marker policy offers the measured native return' );
		near( measured.depth, destination === 'e1m3' ? 32 : 24, destination + ' actual native return frame depth' );
		near( dot( inverse.opening.shift, inverse.transform.through ), measured.far - .25, destination + ' visual return is recessed while physical threshold remains reachable' );
		const returnSteps = walkAcross( arrival, inverse );
		// This fixture starts at the final arch approach. It proves the crossing
		// hull and retained return blockers, not progression through prior key gates.
		rows.push( { source, destination, sourceDepth: forwardFrame.depth, nativeForwardSteps: steps, nativeReturnSteps: returnSteps, fixtureUnlock: false, offeredReturn: !! inverse, returnFrame: measured ? { center: inverse.transform.center, through: inverse.transform.through, near: measured.near, far: measured.far, depth: measured.depth, shift: inverse.opening.shift } : null } );

	}
	console.log( 'NATIVE_E1_PAIRED_ARCH_COVERAGE ' + JSON.stringify( rows ) ); travel.SV_SeamlessReset(); Cbuf_Init();

} );
