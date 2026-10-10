// Owner-restored axe: native mesh, UVs, skin, complete arm and animation
// in every game mode. Decode the original PAK directly; no donated axe art.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
await import( '../src/gl_rsurf.js' );
const THREE = await import( 'three' );
const { GL_MakeAliasModelDisplayLists, GL_DrawAliasFrame, R_DrawAliasModel } = await import( '../src/gl_mesh.js' );
const weapons = await import( '../src/r_weapons.js' );
const anim = await import( '../src/r_anim.js' );
const { R_SaveClassicScene } = await import( '../src/r_classicstate.js' );
const { r_hdr } = await import( '../src/gl_post.js' );
const { Cvar_FindVar, Cvar_RegisterVariable, Cvar_SetValue } = await import( '../src/engine/common/cvar.js' );
const { r_avertexnormals } = await import( '../src/engine/common/anorm_dots.js' );
const { cl } = await import( '../src/engine/client/client.js' );

const read = path => readFileSync( new URL( '../' + path, import.meta.url ) );
function check( value, label ) { if ( ! value ) throw new Error( label ); }
function same( actual, expected, label ) { check( actual === expected, `${label}: ${actual} != ${expected}` ); }
function near( actual, expected, label, epsilon = 0.000002 ) { check( Number.isFinite( actual ) && Math.abs( actual - expected ) <= epsilon, `${label}: ${actual} != ${expected}` ); }

const pak = read( 'pak0.pak' ), entries = new Map();
for ( let o = pak.readInt32LE( 4 ), end = o + pak.readInt32LE( 8 ); o < end; o += 64 ) {

	const name = pak.subarray( o, o + 56 ).toString().split( '\0' )[ 0 ], start = pak.readInt32LE( o + 56 );
	entries.set( name, pak.subarray( start, start + pak.readInt32LE( o + 60 ) ) );

}
function nativeAxe() {

	const b = entries.get( 'progs/v_axe.mdl' ), nv = b.readInt32LE( 60 ), nt = b.readInt32LE( 64 ), nf = b.readInt32LE( 68 );
	const w = b.readInt32LE( 52 ), h = b.readInt32LE( 56 );
	check( b.readInt32LE( 48 ) === 1 && b.readInt32LE( 84 ) === 0, 'one native axe skin' );
	const skin = b.subarray( 88, 88 + w * h ), palette = entries.get( 'gfx/palette.lmp' ), pixels = new Uint8Array( w * h * 4 );
	for ( let i = 0; i < skin.length; i ++ ) { pixels.set( palette.subarray( skin[ i ] * 3, skin[ i ] * 3 + 3 ), i * 4 ); pixels[ i * 4 + 3 ] = 255; }
	const texture = new THREE.DataTexture( pixels, w, h ); texture.colorSpace = THREE.SRGBColorSpace;
	let o = 88 + w * h;
	const stverts = Array.from( { length: nv }, ( _, i ) => ( { onseam: b.readInt32LE( o + i * 12 ), s: b.readInt32LE( o + i * 12 + 4 ), t: b.readInt32LE( o + i * 12 + 8 ) } ) ); o += nv * 12;
	const triangles = Array.from( { length: nt }, ( _, i ) => ( { facesfront: b.readInt32LE( o + i * 16 ), vertindex: [ 4, 8, 12 ].map( k => b.readInt32LE( o + i * 16 + k ) ) } ) ); o += nt * 16;
	const poseverts = [];
	for ( let frame = 0; frame < nf; frame ++ ) {

		same( b.readInt32LE( o ), 0, 'single native frame' ); o += 28;
		poseverts.push( Array.from( { length: nv }, ( _, i ) => ( { v: Array.from( b.subarray( o + i * 4, o + i * 4 + 3 ) ), lightnormalindex: b[ o + i * 4 + 3 ] } ) ) ); o += nv * 4;

	}
	const header = { poseverts, stverts, triangles, numposes: nf, numframes: nf, numverts: nv, numtris: nt, skinwidth: w, skinheight: h,
		scale: [ 8, 12, 16 ].map( k => b.readFloatLE( k ) ), scale_origin: [ 20, 24, 28 ].map( k => b.readFloatLE( k ) ), gl_texturenum: [ texture ],
		frames: poseverts.map( ( _, i ) => ( { firstpose: i, numposes: 1 } ) ) };
	GL_MakeAliasModelDisplayLists( { name: 'progs/v_axe.mdl' }, header );
	return header;

}

const oldFetch = globalThis.fetch, oldLoad = THREE.TextureLoader.prototype.load;
const old = { hdr: r_hdr.string, enabled: weapons.r_newer_weapons.value, lerp: anim.r_lerpmodels.value };
const requested = [];
globalThis.fetch = async path => {

	requested.push( String( path ) );
	try { return { ok: true, json: async () => JSON.parse( read( String( path ) ).toString() ) }; } catch { return { ok: false }; }

};
THREE.TextureLoader.prototype.load = function ( path, done ) {

	requested.push( String( path ) ); const texture = new THREE.Texture(); queueMicrotask( () => done( texture ) ); return texture;

};
if ( ! Cvar_FindVar( 'r_hdr' ) ) Cvar_RegisterVariable( r_hdr );
Cvar_SetValue( 'r_hdr', 1 ); weapons.r_newer_weapons.value = 1; anim.r_lerpmodels.value = 0;
await weapons.R_WeaponsPreload();
function entity() { return { model: { name: 'progs/v_axe.mdl' }, skinnum: 0, frame: 0, origin: [ 0, 0, 0 ], angles: [ 0, 0, 0 ] }; }
function originalDraw( e, h, frame ) {

	e.frame = frame; const dots = Float32Array.from( { length: 162 }, ( _, i ) => ( i + 1 ) / 200 );
	const mesh = R_DrawAliasModel( e, h, dots, .63 ), original = GL_DrawAliasFrame( h, frame );
	same( mesh.geometry.getAttribute( 'position' ), original.posAttr, 'original axe/arm positions frame ' + frame );
	same( mesh.geometry.getAttribute( 'normal' ), original.normalAttr, 'original axe/arm normals frame ' + frame );
	same( mesh.geometry.getAttribute( 'uv' ), original.uvAttr, 'original texture wrap frame ' + frame );
	same( mesh.material.map, h.gl_texturenum[ 0 ], 'original Quake axe skin frame ' + frame );
	same( mesh.geometry.index.count, h.numtris * 3, 'complete original axe and hand triangles' );
	check( ! e._weaponHandMesh && ! mesh.children.length, 'axe and arm remain one original mesh' );
	const order = h.posedata[ frame ].map( v => h.poseverts[ frame ].indexOf( v ) );
	for ( let i = 0; i < order.length; i ++ ) {

		const vertex = h.poseverts[ frame ][ order[ i ] ];
		for ( let axis = 0; axis < 3; axis ++ ) {

			near( original.posAttr.array[ i * 3 + axis ], vertex.v[ axis ] * h.scale[ axis ] + h.scale_origin[ axis ], 'exact original vertex', .000004 );
			near( original.normalAttr.array[ i * 3 + axis ], r_avertexnormals[ vertex.lightnormalindex ][ axis ], 'exact original normal' );
			near( mesh.geometry.getAttribute( 'color' ).array[ i * 3 + axis ], dots[ vertex.lightnormalindex ] * .63, 'exact native normal lighting' );

		}

	}
	return mesh;

}

Deno.test( 'original axe: all nine native frames, original skin/UVs and complete hand render in enhanced, classic and New Game modes', () => {

	const h = nativeAxe(), e = entity(); same( h.numframes, 9, 'nine original axe frames' );
	for ( const mode of [ 'enhanced', 'classic-half', 'new-game' ] ) {

		Cvar_SetValue( 'r_hdr', mode === 'new-game' ? 0 : 1 ); anim.R_AnimSetClassicPass( mode === 'classic-half' );
		try { for ( let frame = 0; frame < h.numframes; frame ++ ) originalDraw( e, h, frame ); }
		finally { anim.R_AnimSetClassicPass( false ); }

	}

} );

Deno.test( 'original axe: no replacement role, requests, generated texture or geometry remain; supplied source is preserved', async () => {

	Cvar_SetValue( 'r_hdr', 1 ); const manifest = await weapons.R_WeaponsLoad();
	check( ! manifest.models.v_axe && ! manifest.sources.axe, 'axe excluded from active art manifest' );
	same( weapons.R_WeaponAsset( 'progs/v_axe.mdl' ), null, 'enhanced axe has no supplied asset' );
	same( await weapons.R_WeaponLoad( 'v_axe' ), null, 'explicit axe loading remains native' );
	check( ! requested.some( path => /\/axe\/|\/v_axe\.json/.test( path ) ), 'preload, draw and explicit load never request donor axe art' );
	check( ! existsSync( new URL( '../newer/weapons/v_axe.json', import.meta.url ) ), 'generated axe geometry/wrap file removed' );
	check( ! existsSync( new URL( '../newer/weapons/axe', import.meta.url ) ), 'generated donor axe textures removed' );
	// The owner removed donor inputs in 8a927815; preserve that cleanup while
	// checking the same retained source blob instead of restoring a loose file.
	const supplied = execFileSync( 'git', [ 'show', '8a927815^:quake_axe.glb' ], { cwd: new URL( '../', import.meta.url ), maxBuffer: 2000000 } );
	check( supplied.length > 1000 && supplied.readUInt32LE( 0 ) === 0x46546c67 && supplied.readUInt32LE( 8 ) === supplied.length, 'owner supplied GLB source retained in Git history' );

} );

Deno.test( 'original axe: classic rollback and feature toggling preserve original art without generating a hand child', () => {

	Cvar_SetValue( 'r_hdr', 1 ); const h = nativeAxe(), e = entity(), mesh = originalDraw( e, h, 0 );
	mesh._quakeOwner = e; const scene = new THREE.Scene(); scene.add( mesh ); const restore = R_SaveClassicScene( scene, 0 );
	const positions = mesh.geometry.getAttribute( 'position' ), uv = mesh.geometry.getAttribute( 'uv' ), material = mesh.material;
	try { anim.R_AnimSetClassicPass( true ); originalDraw( e, h, 0 ); }
	finally { anim.R_AnimSetClassicPass( false ); restore(); }
	same( mesh.geometry.getAttribute( 'position' ), positions, 'classic rollback retains original positions' );
	same( mesh.geometry.getAttribute( 'uv' ), uv, 'classic rollback retains original UVs' ); same( mesh.material, material, 'classic rollback retains original skin material' );
	weapons.r_newer_weapons.value = 0;
	try { originalDraw( e, h, 0 ); } finally { weapons.r_newer_weapons.value = 1; }
	originalDraw( e, h, 0 );

} );

Deno.test( 'original axe: native swing interpolation preserves complete axe/arm geometry and original skin', () => {

	Cvar_SetValue( 'r_hdr', 1 ); const h = nativeAxe(), e = entity(), oldTime = cl.time, oldLerp = anim.r_lerpmodels.value;
	try {

		anim.R_AnimSetNewer( true ); // renderer begins an Enhanced frame before alias drawing
		anim.r_lerpmodels.value = 2; cl.time = 40; R_DrawAliasModel( e, h, null );
		e.frame = 1; cl.time = 40.1; R_DrawAliasModel( e, h, null );
		cl.time = 40.15; const mesh = R_DrawAliasModel( e, h, null ), from = GL_DrawAliasFrame( h, 0 ), to = GL_DrawAliasFrame( h, 1 );
		near( e._aliasLerp.blend, .5, 'native half-frame swing interpolation' );
		for ( const [ name, a, b ] of [ [ 'position', from.posAttr, to.posAttr ], [ 'normal', from.normalAttr, to.normalAttr ] ] ) {

			const attribute = mesh.geometry.getAttribute( name );
			for ( let i = 0; i < attribute.array.length; i ++ ) near( attribute.array[ i ], a.array[ i ] + ( b.array[ i ] - a.array[ i ] ) * .5, 'original interpolated ' + name, .000004 );

		}
		same( mesh.geometry.getAttribute( 'uv' ), to.uvAttr, 'swing original texture coordinates' );
		same( mesh.material.map, h.gl_texturenum[ 0 ], 'swing original texture' ); check( ! mesh.children.length, 'complete swing uses one native mesh' );

	} finally { cl.time = oldTime; anim.r_lerpmodels.value = oldLerp; anim.R_AnimSetNewer( false ); }

} );

Deno.test( 'original axe: restore public test fixtures', () => {

	globalThis.fetch = oldFetch; THREE.TextureLoader.prototype.load = oldLoad; anim.R_AnimSetClassicPass( false );
	Cvar_SetValue( 'r_hdr', Number( old.hdr ) ); weapons.r_newer_weapons.value = old.enabled; anim.r_lerpmodels.value = old.lerp;

} );
