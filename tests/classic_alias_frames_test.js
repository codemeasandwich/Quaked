// Native enemy/object assets through public draw and same-tick rollback APIs.
// No browser/game/GPU is started and no replacement model fixture is used.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { COM_LoadPackFile, COM_AddPack, COM_FindFile } from '../src/engine/common/pak.js';
import { Mod_Init, Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { GL_DrawAliasFrame, R_DrawAliasModel } from '../src/gl_mesh.js';
import { R_SaveClassicScene } from '../src/r_classicstate.js';
import * as anim from '../src/r_anim.js';
import * as main from '../src/gl_rmain.js';
import { r_hdr } from '../src/gl_post.js';
import * as cvar from '../src/engine/common/cvar.js';
import { cl, cl_visedicts, cl_numvisedicts, set_cl_numvisedicts } from '../src/engine/client/client.js';
import { entity_t } from '../src/render.js';
import { r_avertexnormals } from '../src/engine/common/anorm_dots.js';

const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const same = ( a, b, label ) => check( a === b, `${label}: ${a} != ${b}` );
const near = ( a, b, label, tolerance = 1e-6 ) => check( Math.abs( a - b ) <= tolerance, `${label}: ${a} != ${b}` );
const bytes = a => Buffer.from( a.buffer, a.byteOffset, a.byteLength );
const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) ); COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) ); VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data ); Mod_Init();
const names = [ 'progs/soldier.mdl', 'progs/shambler.mdl', 'progs/flame.mdl', 'progs/flame2.mdl', 'progs/armor.mdl' ];
const assets = names.map( name => { const model = Mod_ForName( name, true ); return { name, model, header: model.cache.data }; } );
// Independent native vertex/normal witnesses, captured before any enhanced draw.
// A shared template accidentally mutated by smoothing must not become its own oracle.
const witnesses = new WeakMap();
for ( const { header: h } of assets ) {

	const poses = [];
	for ( let pose = 0; pose < h.numposes; pose ++ ) {

		const vertices = h.posedata[ pose ], positions = Float32Array.from( vertices.flatMap( vertex => vertex.v.map( ( value, axis ) => value * h.scale[ axis ] + h.scale_origin[ axis ] ) ) ), normals = Float32Array.from( vertices.flatMap( vertex => Array.from( r_avertexnormals[ vertex.lightnormalindex ] ) ) ), template = GL_DrawAliasFrame( h, pose );
		check( bytes( template.posAttr.array ).equals( bytes( positions ) ), 'native command template agrees with independently expanded original vertices' ); check( bytes( template.normalAttr.array ).equals( bytes( normals ) ), 'native command template agrees with original MDL normal indices' );
		poses.push( { position: Buffer.from( bytes( positions ) ), normal: Buffer.from( bytes( normals ) ), uv: Buffer.from( bytes( template.uvAttr.array ) ) } );

	}
	witnesses.set( h, poses );

}
const controls = [ r_hdr, anim.r_lerpmodels, main.r_drawentities ]; for ( const v of controls ) if ( ! cvar.Cvar_FindVar( v.name ) ) cvar.Cvar_RegisterVariable( v );
function mode( newer, preference, classicPass = false ) { cvar.Cvar_Set( 'r_hdr', newer ? '1' : '0' ); cvar.Cvar_Set( 'r_lerpmodels', String( preference ) ); anim.R_AnimSetNewer( newer ); anim.R_AnimSetClassicPass( classicPass ); }
function fixture( fn ) { const strings = controls.map( v => v.string ), old = { time: cl.time, newer: anim.R_IsNewer(), classic: anim.R_ClassicPassActive() }; try { fn(); } finally { controls.forEach( ( v, i ) => cvar.Cvar_Set( v.name, strings[ i ] ) ); cl.time = old.time; anim.R_AnimSetNewer( old.newer ); anim.R_AnimSetClassicPass( old.classic ); } }
const dots = Float32Array.from( { length: 162 }, ( _, i ) => .1 + i / 200 );
const draw = ( e, h ) => R_DrawAliasModel( e, h, dots, .63 );
function poseState( e ) { const s = e._aliasLerp; return JSON.stringify( { from: s.from, to: s.to, start: s.start, interval: s.interval, lastTime: s.lastTime, blend: s.blend, origin: s.origin, lead: s.lead } ); }
function exactNative( mesh, header, pose, label ) { const native = GL_DrawAliasFrame( header, pose ); for ( const [ name, expected ] of [ [ 'position', native.posAttr ], [ 'normal', native.normalAttr ], [ 'uv', native.uvAttr ] ] ) { same( mesh.geometry.getAttribute( name ), expected, label + ' native attribute identity ' + name ); check( bytes( mesh.geometry.getAttribute( name ).array ).equals( witnesses.get( header )[ pose ][ name ] ), label + ' exact immutable original native bytes ' + name ); } }
function blended( asset, preference ) {

	const h = asset.header, e = new entity_t(); e.model = asset.model; e.frame = 0; mode( true, preference ); cl.time = 0; draw( e, h );
	const grouped = h.frames[ 0 ].numposes > 1, interval = grouped ? h.frames[ 0 ].interval : anim.ANIM_STEP;
	if ( ! grouped ) e.frame = 1; cl.time = interval + .001; draw( e, h ); cl.time += interval / 2; const mesh = draw( e, h );
	check( e._aliasBlended, asset.name + ' fixture establishes actual intermediate geometry' ); near( e._aliasLerp.blend, .5, 'actual native half-frame blend' );
	const from = GL_DrawAliasFrame( h, e._aliasLerp.from ), to = GL_DrawAliasFrame( h, e._aliasLerp.to ); check( ! bytes( from.posAttr.array ).equals( bytes( to.posAttr.array ) ), 'real source poses are distinct' ); check( ! bytes( mesh.geometry.getAttribute( 'position' ).array ).equals( bytes( to.posAttr.array ) ), 'actual rendered mesh differs from the native target before switching' );
	for ( const [ attribute, a, b ] of [ [ 'position', from.posAttr, to.posAttr ], [ 'normal', from.normalAttr, to.normalAttr ] ] ) for ( let i = 0; i < a.array.length; i ++ ) same( mesh.geometry.getAttribute( attribute ).array[ i ], Math.fround( a.array[ i ] + ( b.array[ i ] - a.array[ i ] ) * e._aliasLerp.blend ), 'actual native source interpolation ' + attribute );
	return { e, mesh, pose: e._aliasLerp.to };

}

Deno.test( 'normal Classic renders exact native soldier/shambler and animated flame poses at default1 and legacy forced2 after an enhanced blend', () => fixture( () => {

	for ( const asset of assets.slice( 0, 4 ) ) for ( const preference of [ 1, 2 ] ) {

		const { e, mesh, pose } = blended( asset, preference ), state = poseState( e ), time = cl.time, posenum = e._aliasPosenum;
		mode( false, preference ); same( anim.R_AnimEnabled(), false, 'Classic never permits intermediate frames' ); same( draw( e, asset.header ), mesh, 'actual cached mesh reused' ); same( cl.time, time, 'same client time' ); same( e._aliasPosenum, posenum, 'cached same-pose path exercised' ); exactNative( mesh, asset.header, pose, asset.name + '/Classic' ); same( e._aliasBlended, false, 'Classic leaves enhanced blend buffers' ); same( poseState( e ), state, 'Classic never advances enhanced animation state' );
		mode( true, preference ); draw( e, asset.header ); check( e._aliasBlended, 'return to enhanced reuses valid interpolation' ); same( poseState( e ), state, 'mode roundtrip cannot corrupt enhanced state' );
		e._aliasGeo.dispose();

	}

} ) );

Deno.test( 'forced2 split Classic uses exact native poses and R_SaveClassicScene restores enhanced attributes, buffers and state at the same tick', () => fixture( () => {

	for ( const asset of assets.slice( 0, 4 ) ) {

		const { e, mesh, pose } = blended( asset, 2 ), scene = new THREE.Scene(); mesh._quakeOwner = e; scene.add( mesh );
		const attributes = [ 'position', 'normal', 'uv', 'color' ].map( name => ( { name, attr: mesh.geometry.getAttribute( name ), bytes: Buffer.from( bytes( mesh.geometry.getAttribute( name ).array ) ) } ) ), state = poseState( e ), flags = { posenum: e._aliasPosenum, template: e._aliasTemplate, blended: e._aliasBlended }, time = cl.time;
		const restore = R_SaveClassicScene( scene, time );
		try { anim.R_AnimSetClassicPass( true ); same( anim.R_AnimEnabled(), false, 'split native pass rejects legacy force2' ); draw( e, asset.header ); exactNative( mesh, asset.header, pose, asset.name + '/split' ); same( poseState( e ), state, 'native half never updates lerp state' ); }
		finally { anim.R_AnimSetClassicPass( false ); restore(); }
		for ( const saved of attributes ) { same( mesh.geometry.getAttribute( saved.name ), saved.attr, 'same-tick rollback attribute identity ' + saved.name ); check( bytes( saved.attr.array ).equals( saved.bytes ), 'same-tick rollback exact enhanced bytes ' + saved.name ); }
		same( e._aliasPosenum, flags.posenum, 'pose selection restored' ); same( e._aliasTemplate, flags.template, 'template restored' ); same( e._aliasBlended, flags.blended, 'blend flag restored' ); same( poseState( e ), state, 'blend timing/source state restored' ); same( cl.time, time, 'simulation time unchanged' ); draw( e, asset.header ); for ( const saved of attributes.slice( 0, 2 ) ) check( bytes( mesh.geometry.getAttribute( saved.name ).array ).equals( saved.bytes ), 'next enhanced draw remains the original blend' );
		e._aliasGeo.dispose();

	}

} ) );

Deno.test( 'native one-pose armor movement uses game transforms in Classic, and split restoration returns the exact enhanced object display', () => fixture( () => {

	const { model, header } = assets[ 4 ]; same( header.numframes, 1, 'real armor has one stored frame' ); same( header.numposes, 1, 'no synthetic animated armor poses' );
	const oldCount = cl_numvisedicts, oldFirst = cl_visedicts[ 0 ], oldEntity = main.currententity, e = new entity_t(); e.model = model; e._entityIndex = cl.maxclients + 2;
	try {

		cvar.Cvar_Set( 'r_drawentities', '1' ); cl_visedicts[ 0 ] = e; set_cl_numvisedicts( 1 ); mode( true, 2 ); cl.time = 0; main.R_DrawEntitiesOnList(); e.origin[ 0 ] = 12; e.angles[ 1 ] = 30; cl.time = .1; main.R_DrawEntitiesOnList(); e.origin[ 0 ] = 12; e.angles[ 1 ] = 30; cl.time = .16; main.R_DrawEntitiesOnList(); near( e._aliasMesh.position.x, 6, 'real public entity renderer establishes half movement' );
		const movement = JSON.stringify( e._smoothMove ), mesh = e._aliasMesh; mode( false, 2 ); e.origin[ 0 ] = 12; e.angles[ 1 ] = 30; main.R_DrawEntitiesOnList(); same( mesh.position.x, 12, 'normal Classic shows exact game position even at force2' ); near( mesh.rotation.z, Math.PI / 6, 'normal Classic shows game heading' ); exactNative( mesh, header, 0, 'armor' ); same( JSON.stringify( e._smoothMove ), movement, 'Classic cannot advance movement smoothing' );
		mode( true, 2 ); main.R_DrawEntitiesOnList(); near( mesh.position.x, 6, 'enhanced same-tick display recovered' ); const scene = new THREE.Scene(); scene.add( mesh ); const restore = R_SaveClassicScene( scene, cl.time );
		try { anim.R_AnimSetClassicPass( true ); main.R_DrawEntitiesOnList(); same( mesh.position.x, 12, 'split Classic receives saved raw game position' ); exactNative( mesh, header, 0, 'split armor' ); }
		finally { anim.R_AnimSetClassicPass( false ); restore(); }
		near( mesh.position.x, 6, 'object enhanced transform restored' ); same( JSON.stringify( e._smoothMove ), movement, 'object smoothing state preserved across split' ); main.R_DrawEntitiesOnList(); near( mesh.position.x, 6, 'subsequent enhanced object frame remains stable' ); e._aliasGeo.dispose();

	} finally { set_cl_numvisedicts( oldCount ); cl_visedicts[ 0 ] = oldFirst; main.set_currententity( oldEntity ); }

} ) );

Deno.test( 'native test models retain all source animation groups and shared geometry templates after Classic draws', () => {

	const expected = [ [ 114, 114 ], [ 94, 94 ], [ 1, 6 ], [ 2, 17 ], [ 1, 1 ] ]; assets.forEach( ( asset, i ) => { same( asset.header.numframes, expected[ i ][ 0 ], 'actual native frame count' ); same( asset.header.numposes, expected[ i ][ 1 ], 'actual native pose count' ); check( asset.header.posedata.length === expected[ i ][ 1 ], 'native pose arrays retained' ); for ( let pose = 0; pose < asset.header.numposes; pose ++ ) { const template = GL_DrawAliasFrame( asset.header, pose ); for ( const [ name, attribute ] of [ [ 'position', template.posAttr ], [ 'normal', template.normalAttr ], [ 'uv', template.uvAttr ] ] ) check( bytes( attribute.array ).equals( witnesses.get( asset.header )[ pose ][ name ] ), 'all232 original native templates remain unmodified after enhanced/Classic draws' ); } } );
	console.log( 'CLASSIC_NATIVE_ALIAS_MODELS ' + JSON.stringify( assets.map( a => ( { name: a.name, frames: a.header.numframes, poses: a.header.numposes } ) ) ) );

} );

// card [43]: frame changes that come early, twice running, on the real Grunt: what is drawn never jumps, and the next
// blend leaves exactly what was on screen (the mesh keeps it), not the last frame's pose
Deno.test( 'enhanced: early frame changes on a real model draw on from the pose on screen, exactly, however many come in a row', () => fixture( () => {
	const asset = assets[ 0 ], h = asset.header, e = new entity_t(); e.model = asset.model; mode( true, 1 );
	const positions = () => Float32Array.from( draw( e, h ).geometry.getAttribute( 'position' ).array );
	const normals = () => Float32Array.from( e._aliasGeo.getAttribute( 'normal' ).array );
	e.frame = 0; cl.time = 50; draw( e, h ); e.frame = 1; cl.time = 50.1; draw( e, h );
	cl.time = 50.1833; const before = positions(), beforeN = normals(); near( e._aliasLerp.blend, .833, 'five sixths of the way to frame 1', 1e-3 );
	e.frame = 2; const after = positions(); check( e._aliasLerp.lead !== null, 'an early change' );
	check( bytes( after ).equals( bytes( before ) ) && bytes( normals() ).equals( bytes( beforeN ) ), 'the change draws exactly what was on screen (positions and normals)' );
	const two = GL_DrawAliasFrame( h, e._aliasLerp.to ).posAttr.array;
	cl.time = 50.2083; positions(); // (a draw on the way: the lead stays the pose of the change, not of the last draw)
	cl.time = 50.2333; const half = positions(), t = e._aliasLerp.blend; near( t, .5, 'halfway', 1e-3 );
	for ( let i = 0; i < half.length; i ++ ) same( half[ i ], Math.fround( before[ i ] + ( two[ i ] - before[ i ] ) * t ), 'from the pose on screen towards frame 2, vertex ' + i );
	// a second early change before that blend is done: again no jump, from what is now on screen
	cl.time = 50.2666; const again = positions(); e.frame = 3; const next = positions();
	check( bytes( next ).equals( bytes( again ) ), 'a second early change in a row draws exactly what was on screen' );
	cl.time = 50.40; positions(); same( e._aliasLerp.blend, 1, 'arrived' ); same( e._aliasLerp.lead, null, 'the lead is done with' );
	const three = GL_DrawAliasFrame( h, 3 ).posAttr.array; check( bytes( Float32Array.from( e._aliasGeo.getAttribute( 'position' ).array ) ).equals( bytes( three ) ), 'and frame 3 is drawn exactly' );
} ) );
