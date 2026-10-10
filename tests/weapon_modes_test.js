// Public menu/command and demo-comparison boundaries with real native MDLs,
// Three meshes and weapon materials. Map dispatch and GPU presentation are
// observed, not launched; live gameplay/rendering remains a browser check.
import { readFileSync } from 'node:fs';
await import( '../src/engine/render/gl_rsurf.js' );
const THREE = await import( 'three' );
const vars = await import( '../src/engine/common/cvar.js' );
const cmd = await import( '../src/engine/common/cmd.js' );
const menu = await import( '../src/engine/client/menu.js' );
const split = await import( '../src/newer/render/r_demosplit.js' );
const anim = await import( '../src/newer/render/r_anim.js' );
const weapons = await import( '../src/newer/render/r_weapons.js' );
const { r_hdr } = await import( '../src/newer/render/gl_post.js' );
const { cls, cl } = await import( '../src/engine/client/client.js' );
const { K_ENTER, K_DOWNARROW, key_game } = await import( '../src/engine/client/keys.js' );
const { GL_MakeAliasModelDisplayLists, GL_DrawAliasFrame, R_DrawAliasModel } = await import( '../src/engine/render/gl_mesh.js' );
const { R_SaveClassicScene } = await import( '../src/newer/render/r_classicstate.js' );

function check( value, label ) { if ( ! value ) throw new Error( label ); }
function same( actual, expected, label ) { check( actual === expected, `${label}: ${actual} != ${expected}` ); }
const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
const pak = read( 'pak0.pak' ), files = new Map();
for ( let o = pak.readInt32LE( 4 ), end = o + pak.readInt32LE( 8 ); o < end; o += 64 ) {

	const name = pak.subarray( o, o + 56 ).toString().split( '\0' )[ 0 ], start = pak.readInt32LE( o + 56 );
	files.set( name, pak.subarray( start, start + pak.readInt32LE( o + 60 ) ) );

}
function nativeHeader( key ) {

	const b = files.get( 'progs/' + key + '.mdl' ), nv = b.readInt32LE( 60 ), nt = b.readInt32LE( 64 ), nf = b.readInt32LE( 68 );
	const w = b.readInt32LE( 52 ), h = b.readInt32LE( 56 );
	check( b.readInt32LE( 48 ) === 1 && b.readInt32LE( 84 ) === 0, key + ' single native skin' );
	const skin = b.subarray( 88, 88 + w * h ), palette = files.get( 'gfx/palette.lmp' ), pixels = new Uint8Array( w * h * 4 );
	for ( let i = 0; i < skin.length; i ++ ) { pixels.set( palette.subarray( skin[ i ] * 3, skin[ i ] * 3 + 3 ), i * 4 ); pixels[ i * 4 + 3 ] = 255; }
	const texture = new THREE.DataTexture( pixels, w, h ); texture.colorSpace = THREE.SRGBColorSpace;
	let o = 88 + w * h;
	const stverts = Array.from( { length: nv }, ( _, i ) => ( { onseam: b.readInt32LE( o + i * 12 ), s: b.readInt32LE( o + i * 12 + 4 ), t: b.readInt32LE( o + i * 12 + 8 ) } ) ); o += nv * 12;
	const triangles = Array.from( { length: nt }, ( _, i ) => ( { facesfront: b.readInt32LE( o + i * 16 ), vertindex: [ 4, 8, 12 ].map( k => b.readInt32LE( o + i * 16 + k ) ) } ) ); o += nt * 16;
	const poseverts = [];
	for ( let frame = 0; frame < nf; frame ++ ) {

		same( b.readInt32LE( o ), 0, key + ' single native frame' ); o += 28;
		poseverts.push( Array.from( { length: nv }, ( _, i ) => ( { v: Array.from( b.subarray( o + i * 4, o + i * 4 + 3 ) ), lightnormalindex: b[ o + i * 4 + 3 ] } ) ) ); o += nv * 4;

	}
	const header = { poseverts, stverts, triangles, numposes: nf, numframes: nf, numverts: nv, numtris: nt, skinwidth: w, skinheight: h,
		scale: [ 8, 12, 16 ].map( k => b.readFloatLE( k ) ), scale_origin: [ 20, 24, 28 ].map( k => b.readFloatLE( k ) ), gl_texturenum: [ texture ],
		frames: poseverts.map( ( _, i ) => ( { firstpose: i, numposes: 1 } ) ) };
	GL_MakeAliasModelDisplayLists( { name: 'progs/' + key + '.mdl' }, header ); return header;

}
const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load;
const old = { hdr: r_hdr.string, split: split.r_demosplit.string, weapons: weapons.r_newer_weapons.value, lerp: anim.r_lerpmodels.value,
	playback: cls.demoplayback, timedemo: cls.timedemo, demonum: cls.demonum };
for ( const variable of [ r_hdr, split.r_demosplit, weapons.r_newer_weapons ] ) if ( ! vars.Cvar_FindVar( variable.name ) ) vars.Cvar_RegisterVariable( variable );
for ( const name of [ 'r_flashlight', 'gamma', 'cl_showfps' ] ) if ( ! vars.Cvar_FindVar( name ) ) vars.Cvar_RegisterVariable( new vars.cvar_t( name, '0' ) );
globalThis.fetch = async path => { try { return { ok: true, json: async () => JSON.parse( read( String( path ) ).toString() ) }; } catch { return { ok: false }; } };
THREE.TextureLoader.prototype.load = function ( path, done ) {

	const texture = new THREE.Texture(); texture._testSource = String( path ); queueMicrotask( () => done( texture ) ); return texture;

};
weapons.r_newer_weapons.value = 1; anim.r_lerpmodels.value = 0;
const manifest = await weapons.R_WeaponsLoad(), keys = Object.keys( manifest.models );
await Promise.all( keys.map( key => weapons.R_WeaponLoad( key ) ) );
// (a role with no MDL of its own is drawn as its native model's extra skin: g_shot1 is skin 1 of g_shot.mdl, card [12])
const roles = keys.concat( 'v_axe' ).map( ( key, i ) => { const native = manifest.models[ key ]?.nativeModel ?? key; return { key, header: nativeHeader( native ), entity: { frame: 0, skinnum: native === key ? 0 : 1, model: { name: 'progs/' + native + '.mdl' }, origin: [ i * 100, 20, 40 ], angles: [ 0, 73, 0 ] } }; } );
const scene = new THREE.Scene();
function drawRoles( enhanced ) {

	for ( const { key, header, entity } of roles ) {

		const mesh = R_DrawAliasModel( entity, header, new Float32Array( 162 ).fill( 1 ), .7 );
		mesh._quakeOwner = entity; if ( ! mesh.parent ) scene.add( mesh );
		const native = GL_DrawAliasFrame( header, 0 );
		if ( enhanced && key !== 'v_axe' ) {

			check( mesh.material.map._testSource?.endsWith( '/' + manifest.models[ key ].source + '/diffuse.png' ), key + ' enhanced supplied texture' );
			same( mesh.geometry.getAttribute( 'position' ).count, manifest.sources[ manifest.models[ key ].source ].vertices, key + ' enhanced replacement geometry' );
			check( mesh.geometry.getAttribute( 'position' ) !== native.posAttr, key + ' does not draw original mesh' );

		} else {

			same( mesh.material.map, header.gl_texturenum[ 0 ], key + ' original skin' );
			same( mesh.geometry.getAttribute( 'position' ), native.posAttr, key + ' original geometry' );
			same( mesh.geometry.getAttribute( 'normal' ), native.normalAttr, key + ' original normals' );
			same( mesh.geometry.getAttribute( 'uv' ), native.uvAttr, key + ' original UVs' );
			same( mesh.geometry.index.count, native.indices.length, key + ' original topology' );
			if ( key === 'v_axe' ) check( ! entity._weaponHandMesh && ! mesh.children.length, 'original axe and arm are a single native mesh in every mode' );

		}

	}

}

cmd.Cbuf_Init(); menu.M_Init();
let destination = key_game, dispatched = [];
menu.M_SetExternals( { cls, sv: { active: false }, key_dest_get: () => destination, key_dest_set: value => { destination = value; } } );
cmd.Cmd_AddCommand( 'maxplayers', () => same( cmd.Cmd_Argv( 1 ), '1', 'menu single-player command' ) );
cmd.Cmd_AddCommand( 'map', () => { same( cmd.Cmd_Argv( 1 ), 'start', 'actual menu map dispatch' ); dispatched.push( vars.Cvar_VariableValue( 'r_hdr' ) ); } );

Deno.test( 'weapon modes: actual Newer Game menu commands select all replacement held weapons and all six pickup models', () => {

	cls.demoplayback = false; cls.timedemo = false; vars.Cvar_SetValue( 'r_hdr', 0 );
	cmd.Cmd_ExecuteString( 'menu_singleplayer', cmd.src_command ); same( menu.m_state, menu.m_singleplayer, 'public single-player menu' );
	menu.M_Keydown( K_ENTER ); cmd.Cbuf_Execute();
	same( destination, key_game, 'menu returns control to game' ); same( dispatched.at( - 1 ), 1, 'Newer mode applies before map dispatch' );
	same( keys.filter( key => key.startsWith( 'g_' ) ).sort().join( ',' ), 'g_light,g_nail,g_nail2,g_rock,g_rock2,g_shot,g_shot1', 'all seven pickup roles registered (the six supplied, and the basic shotgun drop g_shot1 of card [12])' );
	same( keys.length, 14, 'fourteen firearm replacements registered (with g_shot1, card [12])' );
	same( manifest.models.v_shot.source, 'shotgun', 'standard shotgun held replacement registered' );
	same( manifest.models.g_shot.source, 'supershotgun', 'super shotgun pickup preserved' );
	check( manifest.models.v_nail && manifest.models.g_nail, 'supplied nailgun roles present' );
	// card [12] (owner request) replaced the earlier rule of no basic shotgun pickup: its drop is the shotgun's own art, on g_shot.mdl skin 1
	same( manifest.models.g_shot1?.source, 'shotgun', 'the basic shotgun drop uses the supplied shotgun art' ); same( manifest.models.g_shot1?.nativeModel, 'g_shot', 'fitted to the pickup MDL' );
	check( ! manifest.models.v_axe && ! manifest.sources.axe, 'axe excluded from replacement assets' );
	same( roles.length, 15, 'all firearm roles and original axe covered' ); drawRoles( true );

} );

Deno.test( 'weapon modes: actual New Game menu commands restore native models and textures for every weapon role', () => {

	cmd.Cmd_ExecuteString( 'menu_singleplayer', cmd.src_command ); menu.M_Keydown( K_DOWNARROW ); menu.M_Keydown( K_ENTER ); cmd.Cbuf_Execute();
	same( dispatched.at( - 1 ), 0, 'classic mode applies before map dispatch' ); drawRoles( false );

} );

function presenter( inspect, fail ) {

	let target = null, viewport = new THREE.Vector4( 2, 3, 800, 600 ), scissor = viewport.clone(), scissorTest = false, color = new THREE.Color( .1, .2, .3 ), alpha = .4;
	const renderer = { autoClear: true, scissors: [], calls: 0,
		getRenderTarget: () => target, setRenderTarget( value ) { target = value; }, getPixelRatio: () => 1,
		getViewport: out => out.copy( viewport ), setViewport( ...args ) { viewport = args[ 0 ]?.isVector4 ? args[ 0 ].clone() : new THREE.Vector4( ...args ); },
		getScissor: out => out.copy( scissor ), setScissor( ...args ) { scissor = args[ 0 ]?.isVector4 ? args[ 0 ].clone() : new THREE.Vector4( ...args ); renderer.scissors.push( scissor.clone() ); },
		getScissorTest: () => scissorTest, setScissorTest( value ) { scissorTest = value; }, getClearColor: out => out.copy( color ), getClearAlpha: () => alpha,
		setClearColor( value, opacity ) { color = value?.isColor ? value.clone() : new THREE.Color( value ); alpha = opacity; }, clear() {},
		render( rendered ) { renderer.calls ++; if ( rendered === scene ) { inspect(); if ( fail ) throw fail; } }
	};
	return renderer;

}
function snapshots() {

	return roles.map( ( { entity } ) => ( { mesh: entity._aliasMesh, material: entity._aliasMesh.material,
		position: entity._aliasMesh.geometry.getAttribute( 'position' ), normal: entity._aliasMesh.geometry.getAttribute( 'normal' ),
		uv: entity._aliasMesh.geometry.getAttribute( 'uv' ), index: entity._aliasMesh.geometry.index } ) );

}
function restored( states ) {

	for ( const s of states ) {

		same( s.mesh.material, s.material, 'enhanced material restored after classic pass' );
		for ( const name of [ 'position', 'normal', 'uv' ] ) same( s.mesh.geometry.getAttribute( name ), s[ name ], 'enhanced ' + name + ' restored after classic pass' );
		same( s.mesh.geometry.index, s.index, 'enhanced topology restored after classic pass' );

	}
	same( anim.R_ClassicPassActive(), false, 'enhanced mode restored' );

}
function compare( fail = null ) {

	drawRoles( true ); const states = snapshots(); let rollback = null, on = 0, off = 0;
	const renderer = presenter( () => { same( anim.R_ClassicPassActive(), true, 'native scene rendered in classic mode' ); drawRoles( false ); }, fail );
	let thrown = null;
	try {

		split.R_DemoSplitClassic( renderer, scene, new THREE.PerspectiveCamera(), { lx: 0, ly: 0, lw: 800, lh: 600 },
			() => { on ++; rollback = R_SaveClassicScene( scene, cl.time ); anim.R_AnimSetClassicPass( true ); drawRoles( false ); },
			() => { off ++; rollback(); anim.R_AnimSetClassicPass( false ); } );

	} catch ( error ) { thrown = error; }
	same( thrown, fail, 'original render error preserved' ); same( on, 1, 'one classic preparation' ); same( off, 1, 'one classic rollback' ); restored( states );
	same( renderer.getRenderTarget(), null, 'output target restored' ); same( renderer.autoClear, true, 'renderer state restored' );
	if ( ! fail ) {

		same( renderer.calls, 2, 'native scene and presentation rendered once' );
		check( renderer.scissors.some( box => box.x === 400 && box.z === 400 ), 'classic presentation clips to right half' );

	}
	drawRoles( true );

}

Deno.test( 'weapon modes: enhanced attract half uses all replacements; native right half and rollback preserve every held/pickup role', () => {

	vars.Cvar_SetValue( 'r_hdr', 0 ); vars.Cvar_SetValue( 'r_demosplit', 1 ); cls.demoplayback = true; cls.timedemo = false;
	split.R_DemoSplitStart(); same( vars.Cvar_VariableValue( 'r_hdr' ), 1, 'attract enhanced half activates Newer Game' );
	same( split.R_DemoSplitActive(), true, 'attract comparison enabled' ); compare();
	split.R_DemoSplitEnd(); same( vars.Cvar_VariableValue( 'r_hdr' ), 0, 'demo restores underlying original-game preference' ); drawRoles( false );

} );

Deno.test( 'weapon modes: failed classic demo render restores enhanced art for all roles before propagating error', () => {

	vars.Cvar_SetValue( 'r_hdr', 1 ); compare( new Error( 'weapon-modes-render-regression' ) );

} );

Deno.test( 'weapon modes: disabled weapons feature restores all original roles even in Newer mode', () => {

	vars.Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 0;
	try { drawRoles( false ); } finally { weapons.r_newer_weapons.value = 1; }
	drawRoles( true );

} );

Deno.test( 'weapon modes: restore public test fixtures', () => {

	split.R_DemoSplitEnd(); anim.R_AnimSetClassicPass( false ); cmd.Cbuf_Init();
	globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad;
	vars.Cvar_Set( 'r_hdr', old.hdr ); vars.Cvar_Set( 'r_demosplit', old.split ); weapons.r_newer_weapons.value = old.weapons; anim.r_lerpmodels.value = old.lerp;
	cls.demoplayback = old.playback; cls.timedemo = old.timedemo; cls.demonum = old.demonum;

} );
