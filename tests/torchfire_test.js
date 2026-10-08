// "02 Wall torch" port: the torch and fire-pit flames of Newer Game. The source's own ember and
// smoke functions and fire shader statements are compared against the port, the real stock
// models are split into flame and handle, and the public entry points (R_TorchFire, the frame
// flush, the alias mesh's part drawing) are driven with real entities. WebGL is not involved: the
// instance buffers a frame writes are inspected, so these checks claim no GPU pixel parity
// (tests/torchfire_trial.html photographs it).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { cvar_t, Cvar_RegisterVariable, Cvar_SetValue } from '../src/cvar.js';
import { COM_LoadPackFile, COM_AddPack } from '../src/pak.js';
import { Mod_ForName } from '../src/gl_model.js';
import { VID_SetPalette } from '../src/vid.js';
import { R_DrawAliasModel } from '../src/gl_mesh.js';
import { COM_FindFile } from '../src/pak.js';
import { entity_t } from '../src/render.js';
import { cl } from '../src/client.js';
import { R_FireballTextures, R_FireballAssets } from '../src/r_fireball.js';
import { R_SaveClassicScene } from '../src/r_classicstate.js';
import { R_AnimSetClassicPass, R_AnimSetNewer, r_lerpmodels } from '../src/r_anim.js';
import * as tf from '../src/r_torchfire.js';

const SOURCE_SHA256 = '7e35fc808c24200e9dbf2b010a72d2fbea04aca567528ebd2e61e79979afc7d6';
const check = ( value, label ) => { if ( ! value ) throw new Error( label ); };
const near = ( a, b, eps, label ) => { if ( ! ( Math.abs( a - b ) <= eps ) ) throw new Error( `${label}: ${a} != ${b}` ); };
const same = ( a, b, label ) => { if ( a !== b ) throw new Error( `${label}: ${a} != ${b}` ); };

const pak = readFileSync( new URL( '../pak0.pak', import.meta.url ) );
COM_AddPack( COM_LoadPackFile( 'pak0.pak', pak.buffer.slice( pak.byteOffset, pak.byteOffset + pak.length ) ) );
VID_SetPalette( COM_FindFile( 'gfx/palette.lmp' ).data );
const model = name => Mod_ForName( name, true );
const WALL = model( 'progs/flame.mdl' ), PIT = model( 'progs/flame2.mdl' ), SOLDIER = model( 'progs/soldier.mdl' );
if ( ! cvar_t.prototype ) throw new Error( 'cvar_t' );
Cvar_RegisterVariable( new cvar_t( 'r_hdr', '1' ) );
if ( ! tf.r_torchfire.registered ) Cvar_RegisterVariable( tf.r_torchfire );
const textures = () => [ new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ), new THREE.DataTexture( new Uint8Array( 4 ), 1, 1 ) ];

function setup( { ready = true } = {} ) {

	const scene = new THREE.Scene();
	tf.R_TorchFireSetup( { scene } );
	tf.R_TorchFireClear(); tf.R_TorchFireBegin();
	if ( ready ) R_FireballTextures( ...textures() ); else R_FireballTextures( null, null );
	Cvar_SetValue( 'r_hdr', 1 ); tf.r_torchfire.value = 1; R_AnimSetClassicPass( false );
	return { scene, group: () => scene.children.find( c => c.name === 'quake_torch_fire' ) };

}
const flame = ( m, origin, frame = 0 ) => { const e = new entity_t(); e.model = m; e.origin = Float32Array.from( origin ); e.frame = frame; return e; };
const layerOf = ( env, name ) => env.group().children.find( c => c.name === name );
const view = [ [ - 400, 0, 100 ], [ 1, 0, 0 ], [ 1280, 720 ] ];

Deno.test( 'the ember and smoke functions equal the source\'s own, and the card is the source\'s card', () => {

	const path = new URL( '../fieldlab-fx-3d-updated.html', import.meta.url );
	const need = process.env.QUAKED_FIREBALL_SOURCE_REQUIRED === '1', skip = why => { if ( need ) throw new Error( why + ' (QUAKED_FIREBALL_SOURCE_REQUIRED=1)' ); console.log( 'SKIPPED source equivalence: ' + why ); };
	if ( ! existsSync( path ) ) return skip( 'source file not present locally' );
	const bytes = readFileSync( path );
	if ( createHash( 'sha256' ).update( bytes ).digest( 'hex' ) !== SOURCE_SHA256 ) return skip( 'different source revision' );
	const text = bytes.toString( 'utf8' ), lines = text.split( '\n' ), pick = re => lines.find( l => re.test( l ) );
	const code = [ pick( /^const clamp=/ ), pick( /^function hashJS\(n\)/ ), pick( /^function torchEmbers/ ), pick( /^function torchSmoke/ ) ].join( '\n' );
	check( code.split( '\n' ).every( l => l && l.length > 20 ), 'all four source definitions located' );
	const ctx = { Math, S: { lit: true, time: 0, fire: { size: 1, wind: 0 } }, fxCenter: () => [ 0, 0, 0 ] };
	runInNewContext( code + '\nthis.torchEmbers=torchEmbers;this.torchSmoke=torchSmoke;', ctx );
	let embers = 0, puffs = 0;
	for ( const wind of [ 0, .3, - .6 ] ) for ( const size of [ 1, .6, 1.45 ] ) for ( const time of [ 0, .37, 1.9, 6.25, 33.3, 120.07 ] ) {

		ctx.S.time = time; ctx.S.fire.wind = wind; ctx.S.fire.size = size;
		const e = ctx.torchEmbers(), s = ctx.torchSmoke();
		const mine = [];
		tf.forEachEmber( time, wind, ( ...v ) => mine.push( v ) );
		same( mine.length, e.length, 'ember count' );
		e.forEach( ( c, i ) => {

			embers ++;
			const m = mine[ i ];
			[ ...c.start, ...c.end, c.width, c.alpha, ...c.color ].forEach( ( x, k ) => near( m[ k ], x, 1e-12, `ember ${i} value ${k}` ) );

		} );
		const smoke = [];
		tf.forEachSmoke( time, size, wind, ( ...v ) => smoke.push( v ) );
		same( smoke.length, s.length, 'smoke count' );
		s.forEach( ( c, i ) => {

			puffs ++;
			const m = smoke[ i ];
			[ ...c.pos, c.size, c.angle, c.alpha, c.heat, c.tile, ...c.tint, c.seed ].forEach( ( x, k ) => near( m[ k ], x, 1e-12, `smoke ${i} value ${k}` ) );

		} );

	}
	check( embers === 22 * 54 && puffs === 16 * 54, 'every ember and puff of 54 states compared: ' + embers + ', ' + puffs );
	// the card: render 213
	check( text.includes( "card('fire',V.add(c,[0,1.385*sz,0]),[2.8*sz,3.25*sz]" ), 'source card centre and size located' );
	same( tf.TORCH.cardCentre, 1.385, 'card centre' ); same( tf.TORCH.cardWidth, 2.8, 'card width' ); same( tf.TORCH.cardHeight, 3.25, 'card height' );
	check( text.includes( 'fire:{size:1,turbulence:1.6,glow:1.8,wind:0}' ), 'source defaults located' );
	same( tf.TORCH.size, 1, 'size' ); same( tf.TORCH.turbulence, 1.6, 'turbulence' ); same( tf.TORCH.glow, 1.8, 'glow' ); same( tf.TORCH.wind, 0, 'wind' );
	// the flame shader: every statement of the port's main() is the source's, except the listed deviations
	const fire = text.slice( text.indexOf( 'sources.fire=' ), text.indexOf( 'sources.glow=' ) ).replace( /\s+/g, '' );
	const mine = tf.TORCH_SHADERS.fragment.slice( tf.TORCH_SHADERS.fragment.indexOf( 'float size=' ), tf.TORCH_SHADERS.fragment.indexOf( 'if(coverage' ) )
		.replace( /texture2D\(/g, 'texture(' ).replace( /\s+/g, '' ).split( ';' ).filter( Boolean );
	const deviations = [ 'floatt=uTime+vPhase' ]; // each torch has its own phase; the source has one flame
	let compared = 0;
	for ( const statement of mine ) {

		if ( deviations.includes( statement ) ) continue;
		check( fire.includes( statement + ';' ), 'source has the statement: ' + statement );
		compared ++;

	}
	check( compared >= 19, 'flame statements compared, coverage included: ' + compared );
	const colour = tf.TORCH_SHADERS.fragment.match( /vec3 flameColor[^\n]*/ )[ 0 ].replace( /\s+/g, '' ).replace( /texture2D\(/g, 'texture(' );
	check( fire.includes( colour ), 'flameColor is the source\'s' );

} );

Deno.test( 'flame.mdl is split into its flame and its wooden handle, flame2.mdl is all flame', () => {

	const wall = tf.torchParts( 'progs/flame.mdl', WALL.cache.data ), pit = tf.torchParts( 'progs/flame2.mdl', PIT.cache.data );
	check( wall.ok, 'the stock wall torch is recognised' ); same( wall.handleTriangles, 36, 'handle triangles' );
	check( pit.ok && pit.handleTriangles === 0, 'the fire pit model has no hardware in it' );
	// a model that is not the stock one is declined: flame2's name on flame.mdl's triangles
	check( ! tf.torchParts( 'progs/flame2.mdl', { ...WALL.cache.data } ).ok, 'a flame2 that is not the stock model is left native' );
	// the handle index buffer holds exactly the handle's triangles, all of them low, and the rest are the flame's
	const index = wall.select( null ); same( index.count, 36 * 3, 'handle index count' );
	const other = tf.torchParts( 'progs/flame.mdl', WALL.cache.data ); check( other === wall, 'parts are computed once' );
	// a model that is not the known one is declined, not guessed
	const decoy = { ...WALL.cache.data, _geoCache: undefined }; // a copy has the same triangles: a different name is not the stock model
	check( tf.torchParts( 'progs/flame3.mdl', decoy ).handleTriangles === 0, 'another name has no handle rule' );

} );

Deno.test( 'each flame is as tall as the model it replaces: wall torch, small and large pit flames differ', () => {

	const wall = tf.flameExtent( 'progs/flame.mdl', WALL.cache.data, 0 ), small = tf.flameExtent( 'progs/flame2.mdl', PIT.cache.data, 0 ), large = tf.flameExtent( 'progs/flame2.mdl', PIT.cache.data, 1 );
	check( wall.base > 0 && wall.base < 3, 'the wall flame starts at the top of the handle: ' + wall.base );
	near( wall.height, 25.4, .5, 'wall flame height' ); near( small.height, 25.4, .5, 'small pit flame height' ); near( large.height, 50.7, .5, 'large pit flame height' );
	check( large.height > small.height * 1.9, 'the large flame is about twice the small one' );
	near( tf.torchUnit( large.height ) * tf.TORCH.flameHeight, large.height * tf.TORCH.fit, 1e-9, 'unit maps the source flame height onto the model\'s' );
	check( large.radius > small.radius, 'and wider' );
	check( tf.flameExtent( 'progs/flame2.mdl', PIT.cache.data, 99 ) === small, 'an unknown frame uses the first group' );

} );

Deno.test( 'by default the supplied flame is laid over the native model; r_torchfire 2 replaces the native flame', () => {

	setup();
	same( tf.R_TorchFire( flame( WALL, [ 100, 0, 50 ] ) ), tf.TORCH_OVERLAY, 'wall torch: native model and its glow stay, the flame is added' );
	same( tf.R_TorchFire( flame( PIT, [ 200, 0, 50 ], 1 ) ), tf.TORCH_OVERLAY, 'pit flame: the same' );
	same( tf.R_TorchFire( flame( SOLDIER, [ 400, 0, 50 ] ) ), 0, 'a soldier is not a torch' );
	same( tf.R_TorchFireCount(), 2, 'both flames are registered for drawing' );

} );

Deno.test( 'torches and fire pits are replaced automatically; everything else keeps the native model', () => {

	setup(); tf.r_torchfire.value = 2;
	same( tf.R_TorchFire( flame( WALL, [ 100, 0, 50 ] ) ), tf.TORCH_HANDLE, 'wall torch: flame replaced, handle kept' );
	same( tf.R_TorchFire( flame( PIT, [ 200, 0, 50 ], 0 ) ), tf.TORCH_WHOLE, 'small pit flame: whole model replaced' );
	same( tf.R_TorchFire( flame( PIT, [ 300, 0, 50 ], 1 ) ), tf.TORCH_WHOLE, 'large pit flame: whole model replaced' );
	same( tf.R_TorchFire( flame( SOLDIER, [ 400, 0, 50 ] ) ), 0, 'a soldier is not a torch' );
	same( tf.R_TorchFire( { model: null, origin: [ 0, 0, 0 ] } ), 0, 'no model' );
	same( tf.R_TorchFireCount(), 3, 'three registered' );
	// no map-specific registration: the same entities in another place are replaced too
	tf.R_TorchFireBegin(); same( tf.R_TorchFireCount(), 0, 'a frame starts empty' );
	same( tf.R_TorchFire( flame( WALL, [ - 5000, 4000, - 100 ] ) ), tf.TORCH_HANDLE, 'anywhere' );

} );

Deno.test( 'native models are kept in Classic, with r_torchfire 0, before the textures load, with no scene, and past the cap', () => {

	const env = setup(); const e = () => flame( WALL, [ 0, 0, 0 ] );
	Cvar_SetValue( 'r_hdr', 0 ); same( tf.R_TorchFire( e() ), 0, 'Classic Quake' ); Cvar_SetValue( 'r_hdr', 1 );
	R_AnimSetClassicPass( true ); same( tf.R_TorchFire( e() ), 0, 'the classic half of the title demo' ); R_AnimSetClassicPass( false );
	tf.r_torchfire.value = 0; same( tf.R_TorchFire( e() ), 0, 'r_torchfire 0' ); tf.r_torchfire.value = 1;
	R_FireballTextures( null, null ); same( tf.R_TorchFire( e() ), 0, 'textures not loaded (or failed)' ); R_FireballTextures( ...textures() );
	same( tf.R_TorchFireCount(), 0, 'nothing was registered by any of those' );
	check( tf.R_TorchFire( e() ) !== 0, 'and it works again' );
	tf.R_TorchFireBegin();
	for ( let i = 0; i < tf.TORCH.max; i ++ ) check( tf.R_TorchFire( flame( PIT, [ i * 10, 0, 0 ] ) ) !== 0, 'torch ' + i + ' replaced' );
	same( tf.R_TorchFire( flame( PIT, [ 0, 500, 0 ] ) ), 0, 'one past the cap keeps its native model' );
	tf.R_TorchFireSetup( {} ); same( tf.R_TorchFire( e() ), 0, 'no scene' ); tf.R_TorchFireSetup( { scene: env.scene } );
	check( tf.TORCH.max >= 128, 'a level has at most 128 static entities, so the cap does not bite on stock maps' );

} );

Deno.test( 'a frame writes one flame, 16 puffs and 22 embers per torch, in world coordinates at the flame\'s root', () => {

	const env = setup();
	const torches = [ [ flame( WALL, [ 100, 20, 60 ] ), WALL ], [ flame( PIT, [ - 300, 400, 10 ], 1 ), PIT ], [ flame( PIT, [ 50, - 90, 10 ], 0 ), PIT ] ];
	tf.R_TorchFireBegin(); for ( const [ e ] of torches ) tf.R_TorchFire( e );
	tf.R_TorchFireFlush( 12.5, ...view );
	const snap = tf.R_TorchFireSnapshot();
	same( snap.flames, 3, 'flames' ); same( snap.puffs, 48, 'puffs' ); same( snap.embers, 66, 'embers' ); check( snap.visible, 'visible' );
	const cards = layerOf( env, 'torch_flame' ).geometry, P = cards.getAttribute( 'aPosSize' ).array;
	torches.forEach( ( [ e, m ] ) => {

		// (the cards are in back-to-front order, so each torch's card is found by its position)
		const i = [ 0, 1, 2 ].find( k => Math.abs( P[ k * 4 ] - e.origin[ 0 ] ) < 1e-3 ); check( i !== undefined, 'a card for the torch at x ' + e.origin[ 0 ] );
		const ext = tf.flameExtent( m.name, m.cache.data, e.frame ), K = tf.torchUnit( ext.height );
		near( P[ i * 4 ], e.origin[ 0 ], 1e-4, 'card x' ); near( P[ i * 4 + 1 ], e.origin[ 1 ], 1e-4, 'card y' );
		near( P[ i * 4 + 2 ], e.origin[ 2 ] + ext.base + tf.TORCH.cardCentre * K, 1e-3, 'card centre sits 1.385 flame units above the root' );
		near( P[ i * 4 + 3 ], K, 1e-4, 'card scale' );

	} );
	// embers rise from the root and are all within the flame's reach; every puff is above the root
	const A = layerOf( env, 'torch_embers' ).geometry.getAttribute( 'aStart' ).array, B = layerOf( env, 'torch_embers' ).geometry.getAttribute( 'aEnd' ).array;
	for ( let i = 0; i < 22; i ++ ) {

		const root = torches[ 0 ][ 0 ].origin[ 2 ] + tf.flameExtent( 'progs/flame.mdl', WALL.cache.data, 0 ).base, K = tf.torchUnit( tf.flameExtent( 'progs/flame.mdl', WALL.cache.data, 0 ).height );
		check( B[ i * 4 + 2 ] >= root - 1e-3 && B[ i * 4 + 2 ] <= root + 1.8 * K + 1e-3, 'ember ' + i + ' rises from the root, at most 1.8 flame units: ' + B[ i * 4 + 2 ] );
		check( Math.abs( B[ i * 4 ] - 100 ) < .5 * K && Math.abs( B[ i * 4 + 1 ] - 20 ) < .5 * K, 'ember stays beside the flame' );
		check( A[ i * 4 + 3 ] > 0, 'ember width' );

	}
	const S = layerOf( env, 'torch_smoke' ).geometry.getAttribute( 'aPosSize' ).array;
	const depth = i => ( S[ i * 4 ] - view[ 0 ][ 0 ] ) * view[ 1 ][ 0 ] + ( S[ i * 4 + 1 ] - view[ 0 ][ 1 ] ) * view[ 1 ][ 1 ] + ( S[ i * 4 + 2 ] - view[ 0 ][ 2 ] ) * view[ 1 ][ 2 ];
	for ( let i = 1; i < 48; i ++ ) check( depth( i - 1 ) >= depth( i ) - 1e-3, 'puffs are sorted back to front' );

} );

Deno.test( 'torches do not burn in step, and a frame is rebuilt from the torches asked for (no stale state)', () => {

	const env = setup();
	const phases = origin => { tf.R_TorchFireBegin(); tf.R_TorchFire( flame( WALL, origin ) ); tf.R_TorchFireFlush( 3, ...view ); return layerOf( env, 'torch_flame' ).geometry.getAttribute( 'aInfo' ).array[ 0 ]; };
	const a = phases( [ 100, 0, 0 ] ), b = phases( [ 100, 64, 0 ] ), again = phases( [ 100, 0, 0 ] );
	check( a !== b, 'two torches have different phases' ); same( a, again, 'the same torch keeps its phase' );
	tf.R_TorchFireBegin(); for ( let i = 0; i < 5; i ++ ) tf.R_TorchFire( flame( PIT, [ i * 50, 0, 0 ] ) ); tf.R_TorchFireFlush( 4, ...view ); same( tf.R_TorchFireSnapshot().flames, 5, 'five' );
	tf.R_TorchFireBegin(); tf.R_TorchFire( flame( PIT, [ 0, 0, 0 ] ) ); tf.R_TorchFireFlush( 4.1, ...view );
	const s = tf.R_TorchFireSnapshot(); same( s.flames, 1, 'one now' ); same( s.puffs, 16, 'with its own puffs only' ); same( s.embers, 22, 'and embers' );

} );

Deno.test( 'nothing is left when the torches go: an empty frame, a new map', () => {

	const env = setup();
	tf.R_TorchFireBegin(); tf.R_TorchFire( flame( WALL, [ 0, 0, 0 ] ) ); tf.R_TorchFireFlush( 1, ...view ); check( env.group().visible, 'drawn' );
	tf.R_TorchFireBegin(); tf.R_TorchFireFlush( 1.1, ...view );
	check( ! env.group().visible, 'an empty frame hides the layers' ); same( tf.R_TorchFireSnapshot().flames + tf.R_TorchFireSnapshot().puffs + tf.R_TorchFireSnapshot().embers, 0, 'and empties them' );
	tf.R_TorchFireBegin(); tf.R_TorchFire( flame( WALL, [ 0, 0, 0 ] ) ); tf.R_TorchFireFlush( 1.2, ...view ); check( env.group().visible, 'drawn again' );
	tf.R_TorchFireClear(); check( ! env.group().visible, 'a new map hides them' ); same( tf.R_TorchFireCount(), 0, 'and forgets the registry' ); same( tf.R_TorchFireSnapshot().flames, 0, 'with nothing instanced' );
	// the group is what the title demo's classic pass hides, and it draws after the decals
	tf.R_TorchFireBegin(); tf.R_TorchFire( flame( WALL, [ 0, 0, 0 ] ) ); tf.R_TorchFireFlush( 1.3, ...view );
	check( env.group().userData.newerOnly && env.group().children.every( c => c.userData.newerOnly ), 'Newer Game only (hidden in the classic half)' );
	check( tf.TORCH_ORDER.smoke > 5 && tf.TORCH_ORDER.smoke < tf.TORCH_ORDER.card && tf.TORCH_ORDER.card < tf.TORCH_ORDER.ember, 'after the scorch decals (5), in the source order smoke, flame, embers' );
	for ( const c of env.group().children ) check( c.material.depthWrite === false && c.material.premultipliedAlpha === true && c.frustumCulled === false, c.name + ' blends without writing depth' );

} );

Deno.test( 'the alias mesh can draw only a model\'s handle, and draws all of it again when asked', () => {

	setup(); Cvar_SetValue( 'r_hdr', 1 ); R_AnimSetNewer( true ); r_lerpmodels.value = 1; cl.time = 1;
	const header = WALL.cache.data, parts = tf.torchParts( 'progs/flame.mdl', header ), dots = Float32Array.from( { length: 162 }, ( _, i ) => .1 + i / 200 );
	const e = flame( WALL, [ 0, 0, 0 ] ); e.baseline = e.baseline || {};
	let mesh = R_DrawAliasModel( e, header, dots, .63 );
	same( mesh.geometry.index.count, 122 * 3, 'the whole model by default' );
	e._aliasPart = parts.select; mesh = R_DrawAliasModel( e, header, dots, .63 );
	same( mesh.geometry.index.count, 36 * 3, 'only the handle when the caller asks, at once' );
	cl.time = 1.25; e.frame = 0; mesh = R_DrawAliasModel( e, header, dots, .63 ); same( mesh.geometry.index.count, 36 * 3, 'and in every later pose' );
	e._aliasPart = null; mesh = R_DrawAliasModel( e, header, dots, .63 ); same( mesh.geometry.index.count, 122 * 3, 'the whole model comes back when the request is withdrawn' );
	// the title demo's classic pass can leave the geometry without its colour array: the next draw copes
	e._aliasColorArray = null; mesh = R_DrawAliasModel( e, header, dots, .63 ); check( mesh.geometry.getAttribute( 'color' ) && e._aliasColorArray !== null, 'a missing colour array is rebuilt' );

} );

Deno.test( 'the renderer asks for the torch before it draws the entity list and flushes after it, and keeps the pit\'s shadow', () => {

	const rmain = readFileSync( new URL( '../src/gl_rmain.js', import.meta.url ), 'utf8' );
	const begin = rmain.indexOf( 'R_TorchFireBegin();\n\tR_DrawEntitiesOnList();' ), flush = rmain.indexOf( 'R_TorchFireFlush(' );
	check( begin > 0 && flush > begin, 'begin, then the entity list, then flush (the list is built inside R_RenderScene)' );
	check( rmain.indexOf( 'R_DrawEntitiesOnList();', begin ) < flush, 'the flush follows the list' );
	check( rmain.includes( 'const torch = R_TorchFire( e );' ) && rmain.includes( 'torch === TORCH_WHOLE ? null : R_DrawAliasModel_mesh' ), 'the model is not built when the flame is replaced whole' );
	check( rmain.includes( '( mesh != null || torch === TORCH_WHOLE )' ), 'the container shadow is still produced for a replaced pit flame' );
	check( rmain.includes( 'e._aliasPart = torch === TORCH_HANDLE' ), 'a wall torch is drawn without its flame' );

} );

Deno.test( 'flames blend back to front, so a far flame never covers a near one', () => {

	const env = setup(), eye = view[ 0 ], depth = x => ( x - eye[ 0 ] ) * view[ 1 ][ 0 ];
	for ( const order of [ [ 0, 1, 2 ], [ 2, 1, 0 ], [ 1, 2, 0 ] ] ) {

		tf.R_TorchFireBegin();
		for ( const i of order ) tf.R_TorchFire( flame( WALL, [ 100 + i * 150, i * 10, 50 ] ) );
		tf.R_TorchFireFlush( 5, ...view );
		const P = layerOf( env, 'torch_flame' ).geometry.getAttribute( 'aPosSize' ).array;
		check( depth( P[ 0 ] ) > depth( P[ 4 ] ) && depth( P[ 4 ] ) > depth( P[ 8 ] ), 'farthest first whatever the registration order ' + order );

	}

} );

Deno.test( 'the title demo\'s classic pass puts a torch back exactly as it found it', () => {

	const env = setup(); tf.r_torchfire.value = 2; R_AnimSetNewer( true ); r_lerpmodels.value = 1; cl.time = 2;
	const header = WALL.cache.data, parts = tf.torchParts( 'progs/flame.mdl', header ), dots = Float32Array.from( { length: 162 }, ( _, i ) => .1 + i / 200 );
	const e = flame( WALL, [ 0, 0, 0 ] ); e._aliasPart = parts.select;
	const mesh = R_DrawAliasModel( e, header, dots, .63 ); mesh._quakeOwner = e; env.scene.add( mesh );
	same( mesh.geometry.index.count, 36 * 3, 'drawn as a handle' );
	const restore = R_SaveClassicScene( env.scene, 2 );
	e._aliasPart = null; cl.time = 2; R_DrawAliasModel( e, header, dots, .63 ); same( mesh.geometry.index.count, 122 * 3, 'the classic pass draws it whole' );
	restore();
	same( e._aliasPartDrawn, parts.select, 'the part it was drawn with is restored with the rest of its state' );
	same( mesh.geometry.index.count, 36 * 3, 'and so is its handle-only index' );
	// the native model after that (the torch no longer replaced) shows its flame again at once
	e._aliasPart = null; R_DrawAliasModel( e, header, dots, .63 ); same( mesh.geometry.index.count, 122 * 3, 'the whole model returns in the same frame' );

} );

Deno.test( 'a torch the classic pass left without a colour array does not get a new buffer every frame; the textures are one object', () => {

	setup(); R_AnimSetNewer( true ); r_lerpmodels.value = 1; cl.time = 3;
	const header = PIT.cache.data, dots = Float32Array.from( { length: 162 }, ( _, i ) => .1 + i / 200 ), e = flame( PIT, [ 0, 0, 0 ], 1 );
	const mesh = R_DrawAliasModel( e, header, dots, .63 ), first = mesh.geometry.getAttribute( 'color' );
	for ( let i = 0; i < 4; i ++ ) { e._aliasColorArray = null; R_DrawAliasModel( e, header, dots, .63 ); same( mesh.geometry.getAttribute( 'color' ), first, 'colour attribute kept, pass ' + i ); check( e._aliasColorArray === first.array, 'and its array' ); }
	check( R_FireballAssets() === R_FireballAssets(), 'the same assets object while the textures stay' );

} );
